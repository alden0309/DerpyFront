// Derpy Conquest round 11, the world: fog of war (what a line knows and
// what it sees), province markets that answer to trade, the pace of the
// colonies' expansion, each people's own goods, leads from the papers and
// the taverns, and the map's changes (Alaska closed, Aruba and Bonaire).

import { describe, expect, test } from "vitest";
import { colonyGapDays } from "../../src/conquest/engine/Ai";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  fogDaily,
  fogged,
  fogView,
  knownOf,
  reveal,
  sightOf,
} from "../../src/conquest/engine/Fog";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  boomAt,
  finishWork,
  hearLead,
  LEAD_DEFS,
  leadCheck,
  leadsFrom,
  leadsMonthly,
  newLead,
} from "../../src/conquest/engine/Leads";
import { homeChoices } from "../../src/conquest/engine/Life";
import { carried, travelRoute } from "../../src/conquest/engine/LifeQueries";
import { fitStateToMap } from "../../src/conquest/engine/MapFix";
import {
  hasMarket,
  MARKET_EASE_DAYS,
  marketsMonthly,
  priceView,
  quote,
  shockMarket,
  soldHere,
} from "../../src/conquest/engine/Markets";
import { provincesOf, settlers } from "../../src/conquest/engine/Queries";
import { newGameState } from "../../src/conquest/engine/Setup";
import type { GameState, Life } from "../../src/conquest/engine/Types";
import {
  cultureGoods,
  waresMadeIn,
  waresOfPeople,
  waresOfPower,
} from "../../src/conquest/engine/Wares";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

const nationOf = (g: ConquestGame, key: string) =>
  g.s.nations.findIndex((n) => n.key === key);

/** Put a life somewhere at once (no road), with its market and fog. */
function placeAt(g: ConquestGame, life: Life, p: number): void {
  life.prov = p;
  life.travel = null;
  if (!life.visited.includes(p)) life.visited.push(p);
}

// ---------------------------------------------------------------- the fog

describe("fog of war", () => {
  test("a new life knows its home colony and the country round it, not the far side of the map", () => {
    const g = world();
    const life = lifeOf(g);
    ticks(g, 1);
    const known = knownOf(life);
    expect(known.has(prov("Jamestown"))).toBe(true);
    expect(known.has(prov("Pamunkey"))).toBe(true);
    // The rest of the English colony, wherever it is.
    for (const p of provincesOf(g.s, nationOf(g, "england")))
      expect(known.has(p)).toBe(true);
    expect(known.has(prov("Quebec"))).toBe(false);
    expect(known.has(prov("Curaçao"))).toBe(false);
  });

  test("you see where you are and the country close by; far places are known but not seen", () => {
    const g = world();
    const life = lifeOf(g);
    ticks(g, 1);
    const seen = sightOf(g.s, g.w, life);
    expect(seen.has(life.prov)).toBe(true);
    const fog = fogView(g.s, g.w, life);
    const knownNotSeen = [...fog.known].filter((p) => !fog.seen.has(p));
    expect(knownNotSeen.length).toBeGreaterThan(0);
    expect(seen.size).toBeLessThan(fog.known.size);
  });

  test("travelling explores, and a line keeps its map when the heir takes over", () => {
    const g = world();
    const life = lifeOf(g);
    ticks(g, 1);
    const before = knownOf(life).size;
    const far = prov("Massachusetts Bay");
    expect(knownOf(life).has(far)).toBe(false);
    placeAt(g, life, far);
    fogDaily(g);
    expect(knownOf(life).has(far)).toBe(true);
    expect(knownOf(life).size).toBeGreaterThan(before);
    // The heir (a new character for the same seat) keeps it all.
    const known = [...(life.known ?? [])];
    life.c = Object.values(g.s.chars).find(
      (c) => c.alive && c.id !== life.c && c.nation === nationOf(g, "england"),
    )!.id;
    fogDaily(g);
    for (const p of known) expect(knownOf(life).has(p)).toBe(true);
  });

  test("a governor sees the whole colony", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const eng = nationOf(g, "england");
    ticks(g, 1);
    const own = provincesOf(g.s, eng);
    const seenBefore = sightOf(g.s, g.w, life);
    expect(own.every((p) => seenBefore.has(p))).toBe(false);
    g.s.nations[eng].ruler = life.c;
    const seen = sightOf(g.s, g.w, life);
    for (const p of own) expect(seen.has(p)).toBe(true);
  });

  test("country out of sight shows its owner as last seen, until you see it again", () => {
    const g = world();
    const life = lifeOf(g);
    ticks(g, 1);
    const fog = fogView(g.s, g.w, life);
    const p = [...fog.known].find((q) => !fog.seen.has(q))!;
    const was = g.s.provinces[p].owner;
    g.s.provinces[p].owner = nationOf(g, "france");
    fogDaily(g);
    expect(fogView(g.s, g.w, life).owner(p)).toBe(was);
    placeAt(g, life, p);
    fogDaily(g);
    expect(fogView(g.s, g.w, life).owner(p)).toBe(nationOf(g, "france"));
  });

  test("news reveals a place; someone watching the world sees everything", () => {
    const g = world();
    const life = lifeOf(g);
    ticks(g, 1);
    expect(knownOf(life).has(prov("Quebec"))).toBe(false);
    reveal(g, life, [prov("Quebec")]);
    expect(knownOf(life).has(prov("Quebec"))).toBe(true);
    expect(fogged(life)).toBe(true);
    life.watching = true;
    expect(fogged(life)).toBe(false);
  });
});

// ---------------------------------------------------------------- markets

describe("province markets", () => {
  test("buying raises the price there and selling lowers it, and a quote says by how much", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const p = life.prov;
    life.purse = 500;
    expect(hasMarket(g.s, g.w, p)).toBe(true);
    const item = "cloth";
    expect(soldHere(g.s, g.w, p, item)).toBe(true);
    const before = priceView(g.s, g.w, p, item).price;
    const q = quote(g.s, g.w, life, p, item, 5);
    expect(q.after).toBeGreaterThan(q.before);
    expect(g.lifeCommand("s1", { k: "market", item, qty: 5 })).toBeNull();
    const after = priceView(g.s, g.w, p, item).price;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(q.after, 1);
    expect(life.goods.cloth).toBe(5);
    const sale = quote(g.s, g.w, life, p, item, -5);
    expect(sale.after).toBeLessThan(sale.before);
    expect(g.lifeCommand("s1", { k: "market", item, qty: -5 })).toBeNull();
    // Selling back what you just bought loses the merchants' cut both ways.
    expect(sale.total).toBeLessThan(q.total);
  });

  test("selling one good again and again in one place drives its price down", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const p = life.prov;
    const takes: number[] = [];
    for (let i = 0; i < 4; i++) {
      life.goods.furs = 5;
      const q = quote(g.s, g.w, life, p, "furs", -5);
      takes.push(q.total);
      expect(
        g.lifeCommand("s1", { k: "market", item: "furs", qty: -5 }),
      ).toBeNull();
    }
    for (let i = 1; i < takes.length; i++)
      expect(takes[i]).toBeLessThan(takes[i - 1]);
    expect(takes[3]).toBeLessThan(takes[0] * 0.8);
  });

  test("prices drift back as the town eats, makes and ships", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const p = life.prov;
    const normal = priceView(g.s, g.w, p, "furs").price;
    life.goods.furs = 15;
    g.lifeCommand("s1", { k: "market", item: "furs", qty: -15 });
    const glutted = priceView(g.s, g.w, p, "furs").price;
    expect(glutted).toBeLessThan(normal * 0.85);
    const net0 = priceView(g.s, g.w, p, "furs").net;
    g.s.day += MARKET_EASE_DAYS;
    const net1 = priceView(g.s, g.w, p, "furs").net;
    expect(net1).toBeLessThan(net0 * 0.4);
    g.s.day += MARKET_EASE_DAYS * 4;
    expect(Math.abs(priceView(g.s, g.w, p, "furs").net)).toBeLessThan(0.5);
  });

  test("a failed harvest makes corn dear, and war makes guns dear", () => {
    const g = world({ start: 1650 });
    const p = lifeOf(g).prov;
    const grain = priceView(g.s, g.w, p, "grain").price;
    shockMarket(g, p, {
      item: "food",
      mul: 1.45,
      until: g.s.day + 90,
      why: "the harvest failed",
    });
    expect(priceView(g.s, g.w, p, "grain").price).toBeGreaterThan(grain * 1.3);
    expect(priceView(g.s, g.w, p, "grain").why).toContain("the harvest failed");
    const guns = priceView(g.s, g.w, p, "guns").price;
    const eng = g.s.provinces[p].owner;
    g.s.wars.push({
      a: eng,
      b: nationOf(g, "france"),
      by: eng,
      start: g.s.day,
      why: "test",
      won: [0, 0],
      lost: [0, 0],
      europe: false,
    });
    expect(priceView(g.s, g.w, p, "guns").price).toBeGreaterThan(guns * 1.2);
  });

  test("the month keeps price histories for the places you know, and is the same with the same seed", () => {
    const a = world({ start: 1650, seed: 4 });
    const b = world({ start: 1650, seed: 4 });
    for (const g of [a, b]) {
      ticks(g, 95);
      marketsMonthly(g);
    }
    expect(JSON.stringify(a.s.markets)).toBe(JSON.stringify(b.s.markets));
    const p = lifeOf(a).prov;
    expect(a.s.markets![p]?.hist?.cloth?.length).toBeGreaterThan(0);
  });

  test("trade is a living, not a money printer: a round trip of furs barely pays a novice", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 400;
    life.skills.trade = 2;
    // Buy furs where they're cheapest within reach, sell at home: the margin after
    // the merchants' cut and the prices moving is a few coins, not a fortune.
    const home = life.prov;
    const villages = map.provinces
      .map((_, p) => p)
      .filter(
        (p) =>
          p !== home && hasMarket(g.s, g.w, p) && soldHere(g.s, g.w, p, "furs"),
      );
    let best = -Infinity;
    for (const v of villages.slice(0, 80)) {
      const cost = quote(g.s, g.w, life, v, "furs", 20).total;
      const got = quote(g.s, g.w, life, home, "furs", -20).total;
      best = Math.max(best, got - cost);
    }
    expect(best).toBeLessThan(60);
  });
});

// ---------------------------------------------------------------- expansion

describe("the pace of expansion", () => {
  test("a small poor colony waits years between settlements; a big rich one less", () => {
    const g = world();
    const eng = nationOf(g, "england");
    const small = colonyGapDays(g.s, eng);
    expect(small).toBeGreaterThan(3.5 * 365);
    g.s.nations[eng].gold = 900;
    for (const p of provincesOf(g.s, eng))
      for (const pop of g.s.provinces[p].pops)
        if (pop.cls !== "tribe") pop.size *= 40;
    expect(colonyGapDays(g.s, eng)).toBeLessThan(small / 2);
  });

  test("in the first three years the powers plant a handful of new settlements, not dozens", () => {
    const g = new ConquestGame(
      map,
      newGameState(map, { endYear: 1776, difficulty: "normal", seed: 7 }),
    );
    const owned = () =>
      g.s.provinces.filter(
        (pr) => pr.owner >= 0 && g.s.nations[pr.owner].kind === "power",
      ).length;
    const start = owned();
    ticks(g, 3 * 365);
    const grown = owned() - start;
    expect(grown).toBeLessThanOrEqual(8);
    expect(grown).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- culture goods

describe("each people's own goods", () => {
  test("the powers and the native peoples have the goods history gives them", () => {
    expect(waresOfPower("england")).toContain("woollens");
    expect(waresOfPower("france")).toEqual(
      expect.arrayContaining(["brandy", "wine"]),
    );
    expect(waresOfPower("spain")).toEqual(
      expect.arrayContaining(["cochineal", "chocolate"]),
    );
    expect(waresOfPower("netherlands")).toEqual(
      expect.arrayContaining(["finecloth", "spices", "gin"]),
    );
    expect(waresOfPower("sweden")).toContain("iron");
    expect(waresOfPeople("narragansett")).toContain("wampum");
    expect(waresOfPeople("cherokee")).toContain("deerskins");
    expect(waresOfPeople("anishinaabe")).toContain("canoes");
    expect(waresOfPeople("pueblo")).toContain("pottery");
    expect(waresOfPeople("oceti")).toContain("robes");
    const g = world();
    expect(cultureGoods(g.s, nationOf(g, "england")).goods).toContain(
      "tobacco",
    );
    expect(cultureGoods(g.s, nationOf(g, "spain")).goods).toContain("silver");
  });

  test("woollens are cheap in an English town and fetch more in a native village", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const town = life.prov;
    expect(waresMadeIn(g.s, g.w, town)).toContain("woollens");
    expect(soldHere(g.s, g.w, town, "woollens")).toBe(true);
    const village = g.s.provinces.findIndex(
      (pr, p) =>
        pr.owner >= 0 &&
        g.s.nations[pr.owner].kind === "native" &&
        hasMarket(g.s, g.w, p),
    );
    expect(village).toBeGreaterThanOrEqual(0);
    expect(soldHere(g.s, g.w, village, "woollens")).toBe(false);
    expect(priceView(g.s, g.w, village, "woollens").price).toBeGreaterThan(
      priceView(g.s, g.w, town, "woollens").price * 1.4,
    );
  });

  test("wares are loads you carry, and a gift at a council fire wins the elders over", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 300;
    expect(
      g.lifeCommand("s1", { k: "market", item: "woollens", qty: 3 }),
    ).toBeNull();
    expect(life.wares?.woollens).toBe(3);
    expect(carried(life)).toBe(3);
    const council = g.s.provinces.findIndex(
      (pr) => pr.owner >= 0 && g.s.nations[pr.owner].kind === "native",
    );
    placeAt(g, life, council);
    const nat = g.s.provinces[council].owner;
    const chief = g.s.chars[g.s.nations[nat].ruler];
    const memories = chief.memories.length;
    expect(g.lifeCommand("s1", { k: "present", item: "woollens" })).toBeNull();
    expect(life.wares?.woollens).toBe(2);
    expect(chief.memories.length).toBeGreaterThan(memories);
    const me = g.s.chars[life.c];
    expect(
      (g.s.nations[nat].relations[me.nation] ?? []).some((m) =>
        m.why.startsWith("Gifts from"),
      ),
    ).toBe(true);
    // Not again so soon.
    expect(g.lifeCommand("s1", { k: "present", item: "woollens" })).toMatch(
      /lately/,
    );
  });
});

// ---------------------------------------------------------------- leads

describe("leads from the papers and the taverns", () => {
  test("stories start about real places that fit them, the same way with the same seed", () => {
    const a = world({ seed: 21 });
    const b = world({ seed: 21 });
    for (const g of [a, b]) for (let i = 0; i < 6; i++) leadsMonthly(g);
    expect(a.s.leads!.length).toBeGreaterThan(3);
    expect(JSON.stringify(a.s.leads)).toBe(JSON.stringify(b.s.leads));
    for (const l of a.s.leads!) {
      expect(map.provinces[l.p].closed).toBeFalsy();
      expect(LEAD_DEFS[l.kind].where(a.s, a.w, l.p)).toBe(true);
      expect(l.real).toBeNull();
    }
  });

  test("the gazette hands you a lead, marks its place on your map, and says how far to trust it", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const lead = newLead(g, "silver", prov("Pamunkey"));
    lead.day = g.s.day - 200;
    lead.odds = 0.4;
    const got = leadsFrom(g, life, "gazette");
    expect(got.map((x) => x.id)).toContain(lead.id);
    const ll = life.leads!.find((x) => x.id === lead.id)!;
    expect(ll.trust).toBeGreaterThanOrEqual(5);
    expect(ll.trust).toBeLessThanOrEqual(95);
    expect(knownOf(life).has(lead.p)).toBe(true);
  });

  test("a false story comes to nothing; a true one pays", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    const p = life.prov;
    const liar = newLead(g, "wreck", p);
    liar.odds = 0;
    hearLead(g, life, liar, "tavern");
    expect(leadCheck(g.s, life, liar.id, "dive").ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "lead", id: liar.id, act: "dive" }),
    ).toBeNull();
    const ll = life.leads!.find((x) => x.id === liar.id)!;
    expect(ll.work).toBeDefined();
    finishWork(g, life, ll, liar);
    expect(liar.real).toBe(false);
    expect(ll.status).toBe("dry");
    // A true one, worked by someone who knows what they're doing.
    const truth = newLead(g, "inheritance", p);
    truth.odds = 1;
    truth.worth = 120;
    life.skills.letters = 20;
    hearLead(g, life, truth, "gazette");
    const purse = life.purse;
    g.lifeCommand("s1", { k: "lead", id: truth.id, act: "search" });
    const tl = life.leads!.find((x) => x.id === truth.id)!;
    finishWork(g, life, tl, truth);
    expect(truth.real).toBe(true);
    expect(life.purse).toBeGreaterThan(purse);
  });

  test("you have to be there, and leaving abandons the work", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    const lead = newLead(g, "gold", prov("Quebec"));
    hearLead(g, life, lead, "tavern");
    expect(leadCheck(g.s, life, lead.id, "pan").ok).toBe(false);
    placeAt(g, life, lead.p);
    expect(
      g.lifeCommand("s1", { k: "lead", id: lead.id, act: "pan" }),
    ).toBeNull();
    placeAt(g, life, prov("Jamestown"));
    ticks(g, 1);
    const ll = life.leads!.find((x) => x.id === lead.id)!;
    expect(ll.work).toBeUndefined();
    expect(ll.note).toMatch(/left/);
  });

  test("a strike made public sets off a rush: dear tools and food, people pouring in", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    life.skills.woodcraft = 20;
    const p =
      provincesOf(g.s, g.s.provinces[life.prov].owner).find((q) =>
        LEAD_DEFS.gold.where(g.s, g.w, q),
      ) ?? life.prov;
    const lead = newLead(g, "gold", p);
    lead.odds = 1;
    lead.worth = 400;
    placeAt(g, life, p);
    hearLead(g, life, lead, "gazette");
    g.lifeCommand("s1", { k: "lead", id: lead.id, act: "prospect" });
    const ll = life.leads!.find((x) => x.id === lead.id)!;
    // Work until something's found.
    for (let i = 0; i < 6 && ll.status !== "found"; i++) {
      if (!ll.work)
        g.lifeCommand("s1", { k: "lead", id: lead.id, act: "prospect" });
      if (ll.work) finishWork(g, life, ll, lead);
    }
    expect(ll.status).toBe("found");
    const ev = life.events.find((e) => e.key === "lead-strike");
    expect(ev).toBeDefined();
    const tools = priceView(g.s, g.w, p, "tools").price;
    const folk = settlers(g.s.provinces[p]);
    expect(
      g.lifeCommand("s1", { k: "event", id: ev!.id, choice: 1 }),
    ).toBeNull();
    expect(lead.boom).toBe(g.s.day);
    expect(boomAt(g.s, p)).toBe(true);
    expect(priceView(g.s, g.w, p, "tools").price).toBeGreaterThan(tools * 1.4);
    if (g.s.nations[g.s.provinces[p].owner]?.kind === "power")
      expect(settlers(g.s.provinces[p])).toBeGreaterThan(folk);
    expect(lead.rush).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------- the map

const ALASKA = [
  "Sitka",
  "Yakutat",
  "Upper Yukon",
  "Klondike",
  "Kodiak",
  "Alaska Peninsula",
  "Seward Peninsula",
];

describe("the map", () => {
  test("Alaska is off the board: no roads or sea lanes in, nobody holds it or lives there", () => {
    for (const name of ALASKA) {
      const p = prov(name);
      expect(map.provinces[p].closed).toBe(true);
      expect(map.provinces[p].owner).toBeNull();
    }
    const closed = new Set(ALASKA.map(prov));
    for (const def of map.provinces) {
      if (def.closed) continue;
      for (const [q] of def.nb) expect(closed.has(q)).toBe(false);
      for (const [q] of def.sea) expect(closed.has(q)).toBe(false);
    }
    for (const start of [1607, 1650, 1700] as const) {
      const s = newGameState(map, {
        endYear: 1776,
        difficulty: "normal",
        seed: 2,
        start,
      });
      for (const p of closed) {
        expect(s.provinces[p].owner).toBe(-1);
        expect(s.provinces[p].pops).toHaveLength(0);
      }
      const tlingit = s.nations.find((n) => n.key === "tlingit");
      if (tlingit?.alive)
        expect(map.provinces[tlingit.capital].closed).toBeFalsy();
    }
    const g = world();
    expect(
      travelRoute(g.s, map, prov("Tahltan"), prov("Sitka"), false),
    ).toBeNull();
    expect(
      travelRoute(g.s, map, prov("Tahltan"), prov("Sitka"), true),
    ).toBeNull();
  });

  test("nobody settles, explores or starts a life in Alaska", () => {
    const g = new ConquestGame(
      map,
      newGameState(map, {
        endYear: 1776,
        difficulty: "normal",
        seed: 5,
        start: 1700,
      }),
    );
    ticks(g, 2 * 365);
    for (const name of ALASKA) {
      const pr = g.s.provinces[prov(name)];
      expect(pr.owner).toBe(-1);
      expect(pr.colony).toBeNull();
    }
    for (const n of g.s.nations)
      for (const p of homeChoices(g.s, n.key))
        expect(map.provinces[p].closed).toBeFalsy();
  });

  test("Aruba and Bonaire lie beside Curaçao, Spanish in 1607 and Dutch from 1650", () => {
    const aruba = prov("Aruba");
    const bonaire = prov("Bonaire");
    const curacao = prov("Curaçao");
    for (const p of [aruba, bonaire]) {
      const def = map.provinces[p];
      expect(def.coastal).toBe(true);
      expect(Math.abs(def.lat - 12.3)).toBeLessThan(0.5);
      expect(def.sea.some(([q, km]) => q === curacao && km < 160)).toBe(true);
      expect(map.provinces[curacao].sea.some(([q]) => q === p)).toBe(true);
    }
    expect(map.provinces[aruba].lon).toBeLessThan(map.provinces[curacao].lon);
    expect(map.provinces[bonaire].lon).toBeGreaterThan(
      map.provinces[curacao].lon,
    );
    const at = (start: 1607 | 1650 | 1700, p: number) => {
      const s = newGameState(map, {
        endYear: 1776,
        difficulty: "normal",
        seed: 1,
        start,
      });
      return s.nations[s.provinces[p].owner]?.key;
    };
    expect(at(1607, aruba)).toBe("spain");
    expect(at(1607, bonaire)).toBe("spain");
    expect(at(1650, aruba)).toBe("netherlands");
    expect(at(1700, bonaire)).toBe("netherlands");
    // A sailor can get there.
    const g = world({ start: 1650 });
    expect(travelRoute(g.s, map, curacao, aruba, true)).not.toBeNull();
  });

  test("an old save is fitted to the new map: islands added, Alaska emptied", () => {
    const s: GameState = newGameState(map, {
      endYear: 1776,
      difficulty: "normal",
      seed: 3,
      start: 1650,
    });
    // As it was saved before: two provinces fewer, someone living at Sitka.
    s.provinces = s.provinces.slice(0, prov("Curaçao") + 1);
    const sitka = prov("Sitka");
    s.provinces[sitka].owner = s.nations.findIndex((n) => n.key === "tlingit");
    s.provinces[sitka].pops.push({
      cls: "tribe",
      culture: "tlingit",
      religion: "native",
      size: 900,
      wealth: 0,
      met: [1, 1, 1],
      income: 0,
    });
    const g = new ConquestGame(map, s);
    g.beginLife("s9", "Old", plan({ home: prov("Jamestown") }));
    const life = lifeOf(g, "s9");
    life.prov = sitka;
    fitStateToMap(g.s, map);
    expect(g.s.provinces).toHaveLength(map.provinces.length);
    expect(g.s.provinces[prov("Aruba")].owner).toBe(
      g.s.provinces[prov("Curaçao")].owner,
    );
    expect(g.s.provinces[sitka].owner).toBe(-1);
    expect(g.s.provinces[sitka].pops).toHaveLength(0);
    expect(map.provinces[life.prov].closed).toBeFalsy();
  });

  test("players' copies kept by deltas still match, with only changed fields sent", () => {
    const g = world({ start: 1650 });
    const copy: GameState = JSON.parse(JSON.stringify(g.s));
    g.takeDelta();
    let patched = 0;
    let full = 0;
    for (let i = 0; i < 70; i++) {
      g.tick();
      if (i === 5) g.lifeCommand("s1", { k: "market", item: "furs", qty: 1 });
      const d = JSON.parse(JSON.stringify(g.takeDelta()));
      patched += Object.keys(d.nationPatch ?? {}).length;
      full += Object.keys(d.nations ?? {}).length;
      // Applied through the same code the browser uses.
      applyDelta(copy, d);
    }
    expect(patched).toBeGreaterThan(full);
    // Counters that tick over quietly go out with the next change.
    g.lifeChanged("s1");
    applyDelta(copy, JSON.parse(JSON.stringify(g.takeDelta())));
    expect(JSON.stringify(copy.lives)).toBe(JSON.stringify(g.s.lives));
    expect(JSON.stringify(copy.nations)).toBe(JSON.stringify(g.s.nations));
    expect(JSON.stringify(copy.markets)).toBe(JSON.stringify(g.s.markets));
  });
});
