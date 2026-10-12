// SEA (r15): to sea in person. Cruises move the character on the map and
// bring them home; prize shares reconcile with the articles; the odds shown
// before signing match what the sailing does; a privateering company with
// two players goes through the rooms server; hurricanes come in their
// season, move at their speed and strike what's in their way; the travel
// times are the tuned ones; the trades' voyages go and come home; and all
// of it survives a save, the delta, and an old save.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { boatRoute, BOATS } from "../../src/conquest/engine/Boats";
import { dateOf, dayOf } from "../../src/conquest/engine/Calendar";
import {
  CREW_PARTS,
  CRUISE,
  ROLE_PARTS,
} from "../../src/conquest/engine/CruiseData";
import { chanceOdds } from "../../src/conquest/engine/CruiseOdds";
import {
  autoResolve,
  cruiseById,
  cruiseOffers,
  handFraction,
  newCruise,
  offerOdds,
  pardonCheck,
  planOf,
  prizeNow,
  settle,
  sight,
  takePardon,
  warshipNow,
} from "../../src/conquest/engine/Cruises";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { hooks } from "../../src/conquest/engine/Hooks";
import {
  answerLifeEvent,
  autoAnswerLife,
} from "../../src/conquest/engine/LifeEvents";
import { lifeOfSeat, travelRoute } from "../../src/conquest/engine/LifeQueries";
import { firmsOf } from "../../src/conquest/engine/PartnersCore";
import { bestGround } from "../../src/conquest/engine/Privateers";
import { Rng } from "../../src/conquest/engine/Rng";
import { kmApart, seaOf, seaState } from "../../src/conquest/engine/SeaCore";
import {
  ownBoatHopDays,
  passageHopDays,
} from "../../src/conquest/engine/SeaSpeed";
import { STORM_KM, stormsDaily } from "../../src/conquest/engine/Storms";
import type {
  Cruise,
  GameDelta,
  GameState,
  Prize,
  Storm,
} from "../../src/conquest/engine/Types";
import {
  destinationOf,
  FUR_LUCK,
  goVoyage,
  SEND_SHARE,
  stayVoyage,
  VENTURE_LUCK,
  voyageOdds,
  voyageReady,
} from "../../src/conquest/engine/Voyages";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A sailor in a colony at war (England against France and Spain), in 1702 or the year given. */
function atWar(
  o: {
    seed?: number;
    at?: string;
    year?: number;
    war?: boolean;
    seats?: number;
  } = {},
) {
  const plans = [
    {
      seat: "s1",
      name: "Alden",
      plan: plan({ background: "sailor", home: prov("Massachusetts Bay") }),
    },
  ];
  if ((o.seats ?? 1) > 1)
    plans.push({
      seat: "s2",
      name: "Bea",
      plan: plan({
        first: "Beatrice",
        family: "Hale",
        female: true,
        background: "sailor",
        home: prov("Massachusetts Bay"),
      }),
    });
  const g = world({ start: 1700, seed: o.seed ?? 7, plans });
  const s = g.s;
  s.day = dayOf(o.year ?? 1702, 4, 2);
  if (o.war !== false) {
    const eng = s.nations.findIndex((n) => n.key === "england");
    for (const k of ["france", "spain"]) {
      const b = s.nations.findIndex((n) => n.key === k);
      s.wars.push({
        a: eng,
        b,
        by: eng,
        start: s.day,
        why: "War in Europe",
        won: [0, 0],
        lost: [0, 0],
        europe: true,
      });
    }
  }
  for (const l of s.lives) {
    l.prov = prov(o.at ?? "Jamaica");
    l.travel = null;
    l.skills.seamanship = 8;
    l.skills.fighting = 6;
    l.skills.leadership = 5;
    l.purse = 200;
  }
  return { g, s, life: lifeOf(g) };
}

/** Answer whatever's waiting the way it'd go if left: the quiet choice. */
function answerAll(g: ConquestGame) {
  for (const l of g.s.lives)
    for (const e of [...l.events]) autoAnswerLife(g, l.seat, e.id);
}

function cmd(
  g: ConquestGame,
  c: Parameters<ConquestGame["lifeCommand"]>[1],
  seat = "s1",
) {
  return g.lifeCommand(seat, c);
}

// ---------------------------------------------------------------- cruises

describe("to sea in person: a cruise", { timeout: 120_000 }, () => {
  test("signing takes you aboard a ship that sails on the map, between the ground's stations, and home again", () => {
    const { g, s, life } = atWar({ seed: 11 });
    const offer = cruiseOffers(s, g.w, life.prov).find(
      (o) => o.flag === "privateer",
    )!;
    expect(offer).toBeTruthy();
    // The odds are there before signing, and from the same plan the ship sails by.
    const v = offerOdds(s, g.w, life, offer, "crew");
    expect(
      v.outcomes.reduce(
        (m, o) => m + (o.label.includes("galleon") ? 0 : o.p),
        0,
      ),
    ).toBeCloseTo(1, 1);
    expect(
      cmd(g, { k: "sea", act: "sign", key: offer.key, name: "crew" }),
    ).toBeNull();
    const cr = seaOf(s).cruises.find((c) =>
      c.hands.some((h) => h.seat === "s1"),
    )!;
    expect(cr.phase).toBe("fitting");
    const seen = new Set<number>();
    let aboardDays = 0;
    let gated = false;
    for (
      let d = 0;
      d < 220 && cr.phase !== "done" && cr.phase !== "lost";
      d++
    ) {
      g.tick();
      answerAll(g);
      if (life.travel?.ship === cr.id) {
        aboardDays++;
        seen.add(life.prov);
        if (!gated) {
          // The town's things wait while you're at sea.
          expect(cmd(g, { k: "enter", area: "tavern" })).toMatch(/at sea/);
          gated = true;
        }
      }
    }
    expect(gated).toBe(true);
    expect(aboardDays).toBeGreaterThan(20);
    // She cruised between stations: you were carried to several places.
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(["done", "lost", "selling"]).toContain(cr.phase);
    // Off the ship at the end: ashore at her port (or wherever she was taken).
    if (cr.phase === "done") {
      expect(life.travel).toBeNull();
      expect(life.prov).toBe(cr.port);
      expect(
        life.journal.some((j) => j.aff === "sea" && /paid off/.test(j.text)),
      ).toBe(true);
    }
  });

  test("a hand is told of the chase and the prize, and asked only of the boarding", () => {
    const { g, s, life } = atWar({ seed: 12 });
    const offer = cruiseOffers(s, g.w, life.prov).find(
      (o) => o.flag === "privateer",
    )!;
    expect(
      cmd(g, { k: "sea", act: "sign", key: offer.key, name: "crew" }),
    ).toBeNull();
    const cr = seaOf(s).cruises.find((c) =>
      c.hands.some((h) => h.seat === "s1"),
    )!;
    while (cr.phase !== "hunting") g.tick();
    answerAll(g);
    // A lawful sail: the hand isn't asked to chase; a boarding comes to them.
    const r = new Rng({ rng: 1234 });
    let boardings = 0;
    for (let i = 0; i < 40 && boardings === 0; i++) {
      cr.encounter = null;
      const e = sight(g, cr, r);
      if (!e) continue;
      expect(
        life.events.some((x) => x.key === "sea-sail" || x.key === "sea-prize"),
      ).toBe(false);
      const hand = life.events.find((x) => x.key === "sea-board-hand");
      if (hand) {
        boardings++;
        expect(hand.choices.map((c) => c.label).join(" ")).toMatch(
          /first over the rail/i,
        );
        expect(answerLifeEvent(g, life, hand.id, 0)).toBeNull();
      }
      for (const x of [...life.events])
        if (x.key !== "sea-warship") autoAnswerLife(g, "s1", x.id);
      if (cr.phase !== "hunting") break;
    }
    expect(boardings).toBeGreaterThan(0);
  });

  test("prize shares reconcile with the articles: the court's fees, the owners' half, the company's parts", () => {
    const { g, s } = atWar({ seed: 13, seats: 2 });
    const [a, b] = s.lives;
    const cr = newCruise(
      g,
      {
        key: "test",
        flag: "privateer",
        nation: 0,
        ship: "Tartar",
        kind: "brig",
        guns: 12,
        captain: -1,
        cname: "Captain Gale",
        owner: "outfit",
        port: a.prov,
        ground: "windward",
        hunt: 30,
        passage: 3,
        sails: s.day,
        aboard: [],
      },
      {},
    );
    cr.hands.push({ seat: a.seat, c: a.c, role: "officer", joined: s.day });
    cr.hands.push({ seat: b.seat, c: b.c, role: "crew", joined: s.day });
    const spa = s.nations.findIndex((n) => n.key === "spain");
    const prize = (
      value: number,
      status: Prize["status"],
      lawful = true,
    ): Prize => ({
      id: g.nextId(),
      name: "the Santa Rosa",
      kind: "snow",
      flag: spa,
      value,
      day: s.day,
      how: "sent",
      lawful,
      status,
    });
    cr.prizes = [
      prize(100, "home"),
      prize(200, "home"),
      prize(50, "home"),
      prize(300, "retaken"),
      prize(80, "home", false),
    ];
    // What each expects from the articles, before the court sits.
    const fa = handFraction(s, g.map, cr, cr.hands[0]);
    const fb = handFraction(s, g.map, cr, cr.hands[1]);
    const pa = a.purse;
    const pb = b.purse;
    cr.phase = "selling";
    settle(g, cr);
    const lawful = 350;
    const gross = lawful * (1 - CRUISE.court);
    const crewHalf = gross * (1 - CRUISE.owners);
    const parts =
      CREW_PARTS.brig +
      ROLE_PARTS.privateer.captain +
      ROLE_PARTS.privateer.officer +
      ROLE_PARTS.privateer.crew;
    const perPart = crewHalf / parts;
    expect(a.purse - pa).toBeCloseTo(perPart * ROLE_PARTS.privateer.officer, 1);
    expect(b.purse - pb).toBeCloseTo(perPart * ROLE_PARTS.privateer.crew, 1);
    // The fraction shown before is the fraction paid.
    expect(a.purse - pa).toBeCloseTo(lawful * fa, 1);
    expect(b.purse - pb).toBeCloseTo(lawful * fb, 1);
    // Everything reconciles: the court, the owners, every part of the company.
    const paid =
      perPart * parts + gross * CRUISE.owners + lawful * CRUISE.court;
    expect(paid).toBeCloseTo(lawful, 6);
    // The retaken never sells; taken after the peace (unlawful) is restored.
    expect(
      cr.prizes.filter((p) => p.status === "sold" && (p.sold ?? 0) > 0).length,
    ).toBe(3);
    expect(cr.phase).toBe("done");
  });

  test("a pirate's own sloop: the fence at a haven, a ship's share first, then the pirates' articles", () => {
    const { g, s, life } = atWar({
      seed: 14,
      at: "New Providence",
      year: 1715,
      war: false,
    });
    life.boats = [
      {
        id: 901,
        kind: "sloop",
        name: "Ranger",
        prov: life.prov,
        condition: 100,
        crew: 3,
        morale: 70,
        use: "idle",
        bought: s.day,
      },
    ];
    const cr = newCruise(
      g,
      {
        key: "b:901",
        flag: "pirate",
        nation: 0,
        ship: "Ranger",
        kind: "sloop",
        guns: 4,
        captain: life.c,
        cname: "Alden Drackley",
        owner: "boat",
        port: life.prov,
        ground: "straits",
        hunt: 30,
        passage: 2,
        sails: s.day,
        aboard: [],
      },
      { boat: { seat: "s1", id: 901 } },
    );
    cr.hands.push({ seat: "s1", c: life.c, role: "captain", joined: s.day });
    cr.prizes = [
      {
        id: 1,
        name: "the Hope",
        kind: "ship",
        flag: 0,
        value: 200,
        day: s.day,
        how: "sent",
        lawful: false,
        status: "home",
      },
    ];
    const before = life.purse;
    cr.phase = "selling";
    settle(g, cr);
    const sold = 200 * CRUISE.fence.haven; // Nassau, 1715
    const ship = sold * CRUISE.pirateShip;
    const parts = CREW_PARTS.sloop + ROLE_PARTS.pirate.captain;
    const mine = ((sold - ship) / parts) * ROLE_PARTS.pirate.captain;
    expect(life.purse - before).toBeCloseTo(ship + mine, 1);
  });

  test("the odds shown before signing match the sailing, chance by chance", () => {
    const { g, s, life } = atWar({ seed: 15 });
    const r = new Rng({ rng: 987654 });
    const make = (): Cruise => {
      const cr = newCruise(
        g,
        {
          key: "odds",
          flag: "privateer",
          nation: 0,
          ship: "Dragon",
          kind: "schooner",
          guns: 6,
          captain: -1,
          cname: "Captain Kemp",
          owner: "outfit",
          port: life.prov,
          ground: "windward",
          hunt: 30,
          passage: 0,
          sails: s.day,
          aboard: [],
        },
        {},
      );
      cr.phase = "hunting";
      cr.way = {
        prov: life.prov,
        path: [],
        sea: [],
        depart: s.day,
        arrive: s.day,
      };
      return cr;
    };
    const plan0 = planOf(s, g.map, make());
    const c = chanceOdds(plan0);
    const N = 3000;
    let prizes = 0;
    let taken = 0;
    let value = 0;
    for (let i = 0; i < N; i++) {
      const cr = make();
      sight(g, cr, r);
      if (cr.encounter) autoResolve(g, cr, r);
      if (cr.phase === "lost") taken++;
      for (const p of cr.prizes) {
        prizes++;
        value += p.value;
      }
      seaState(g).cruises = seaState(g).cruises.filter((x) => x !== cr);
    }
    expect(prizes / N).toBeGreaterThan(c.prize - 0.03);
    expect(prizes / N).toBeLessThan(c.prize + 0.03);
    expect(taken / N).toBeGreaterThan(c.taken - 0.012);
    expect(taken / N).toBeLessThan(c.taken + 0.012);
    expect(value / prizes).toBeGreaterThan(c.value * 0.9);
    expect(value / prizes).toBeLessThan(c.value * 1.1);
  });

  test("a privateer who takes a ship her commission doesn't cover is a pirate; a pirate taken goes to the gaol; the King's pardon", () => {
    const { g, s, life } = atWar({ seed: 16 });
    const cr = newCruise(
      g,
      {
        key: "x",
        flag: "privateer",
        nation: 0,
        ship: "Duke",
        kind: "sloop",
        guns: 4,
        captain: -1,
        cname: "Captain Dare",
        owner: "outfit",
        port: life.prov,
        ground: "windward",
        hunt: 30,
        passage: 0,
        sails: s.day,
        aboard: [],
      },
      {},
    );
    cr.hands.push({ seat: "s1", c: life.c, role: "crew", joined: s.day });
    cr.phase = "hunting";
    const dutch = s.nations.findIndex((n) => n.key === "netherlands");
    cr.encounter = {
      kind: "sloop",
      flag: dutch,
      guns: 2,
      value: 60,
      name: "the Hoop",
      stage: "taken",
      day: s.day,
    };
    prizeNow(g, cr, "send");
    expect(cr.flag).toBe("pirate");
    expect(life.cooldowns["sea:pirate"]).toBeGreaterThan(0);
    // A man-of-war takes her: the gaol, for piracy, a hanging matter.
    cr.encounter = {
      kind: "man-of-war",
      flag: 0,
      guns: 32,
      value: 0,
      name: "an English man-of-war",
      stage: "warship",
      day: s.day,
    };
    warshipNow(g, cr, "strike", false);
    expect(cr.phase).toBe("lost");
    expect(life.crime?.jail?.charge).toBe("piracy");
    expect(life.crime?.jail?.grade).toBe(3);
    // Out again, and the King's pardon is proclaimed (1717-18) at an English colony.
    life.crime!.jail = null;
    life.travel = null;
    s.day = dayOf(1718, 1, 10);
    life.prov = prov("Jamaica");
    life.crime!.heat = { 0: 40 };
    expect(pardonCheck(s, g.w, life).ok).toBe(true);
    expect(takePardon(g, life)).toBeNull();
    expect(Object.keys(life.crime!.heat).length).toBe(0);
    s.day = dayOf(1720, 1, 10);
    expect(pardonCheck(s, g.w, life).ok).toBe(false);
  });

  test("letters from afar wait for you in port", () => {
    const { g, s, life } = atWar({ seed: 17 });
    const offer = cruiseOffers(s, g.w, life.prov).find(
      (o) => o.flag === "privateer",
    )!;
    cmd(g, { k: "sea", act: "sign", key: offer.key, name: "crew" });
    const cr = seaOf(s).cruises.find((c) =>
      c.hands.some((h) => h.seat === "s1"),
    )!;
    while (life.travel?.ship !== cr.id) g.tick();
    const held = hooks.holdLetter.some((h) =>
      h(g, life, "letter-kin", { c: -1 }),
    );
    expect(held).toBe(true);
    expect(cr.mail?.length).toBe(1);
  });
});

// ---------------------------------------------------------------- your own boat, and the company

describe(
  "your own boat, and a privateering company",
  { timeout: 120_000 },
  () => {
    test("your own boat: a letter of marque, the outfit paid, you in command, the owner's half and the captain's parts", () => {
      const { g, s, life } = atWar({ seed: 21, at: "Massachusetts Bay" });
      life.purse = 400;
      expect(cmd(g, { k: "enter", area: "docks" })).toBeNull();
      expect(
        cmd(g, { k: "boat", act: "buy", kind: "schooner", arg: -1 }),
      ).toBeNull();
      const b = life.boats![0];
      expect(
        cmd(g, { k: "boat", act: "crew", id: b.id, arg: BOATS.schooner.crew }),
      ).toBeNull();
      expect(
        cmd(g, {
          k: "sea",
          act: "own",
          id: b.id,
          key: "banks",
          arg: 0,
          name: "privateer",
        }),
      ).toMatch(/letter of marque/);
      expect(cmd(g, { k: "sea", act: "marque", id: b.id })).toBeNull();
      expect(b.marque?.nation).toBe(0);
      const before = life.purse;
      expect(
        cmd(g, {
          k: "sea",
          act: "own",
          id: b.id,
          key: "banks",
          arg: 0,
          name: "privateer",
        }),
      ).toBeNull();
      expect(life.purse).toBeLessThan(before);
      const cr = seaOf(s).cruises.find((c) => c.owner === "boat")!;
      expect(cr.hands[0].role).toBe("captain");
      for (
        let d = 0;
        d < 160 && cr.phase !== "done" && cr.phase !== "lost";
        d++
      ) {
        g.tick();
        answerAll(g);
      }
      expect(["done", "lost"]).toContain(cr.phase);
      const taken = cr.log.some((l) => /^Taken by|^Foundered/.test(l.text));
      if (!taken) {
        // She lies where she came home, with what the cruise left of her.
        const boat = life.boats!.find((x) => x.id === b.id)!;
        expect(boat.prov).toBe(cr.port);
        expect(boat.condition).toBe(Math.max(1, Math.round(cr.hull)));
      } else expect(life.boats!.some((x) => x.id === b.id)).toBe(false);
    });

    test("a company with a computer merchant: shares by stake, the owners' half paid by share, the ship's worth in a winding up", () => {
      const { g, s, life } = atWar({ seed: 22, at: "Massachusetts Bay" });
      expect(
        cmd(g, {
          k: "sea",
          act: "co-open",
          key: "schooner",
          arg: 60,
          name: "Tartar",
        }),
      ).toBeNull();
      const sub = seaOf(s).subs[0];
      expect(cmd(g, { k: "sea", act: "co-sign", id: sub.id })).toMatch(/wants/);
      expect(cmd(g, { k: "sea", act: "co-merchants", id: sub.id })).toBeNull();
      expect(cmd(g, { k: "sea", act: "co-sign", id: sub.id })).toBeNull();
      const f = firmsOf(s).find((x) => x.hold === "privateer")!;
      expect(f.partners.length).toBe(2);
      expect(f.partners.reduce((m, p) => m + p.share, 0)).toBeCloseTo(100, 5);
      const me = f.partners.find((p) => p.c === life.c)!;
      expect(me.role).toBe("managing");
      expect(me.share).toBeCloseTo(
        (60 / sub.stakes.reduce((m, x) => m + x.coins, 0)) * 100,
        0,
      );
      expect(f.sea!.commission?.nation).toBe(0);
      // The owners' half, paid out by share.
      const cr = newCruise(
        g,
        {
          key: `f:${f.id}`,
          flag: "privateer",
          nation: 0,
          ship: "Tartar",
          kind: "schooner",
          guns: 6,
          captain: -1,
          cname: "Captain Fenn",
          owner: "firm",
          port: f.prov,
          ground: "banks",
          hunt: 30,
          passage: 5,
          sails: s.day,
          aboard: [],
        },
        { firm: f.id },
      );
      f.sea!.cruise = cr.id;
      const fra = s.nations.findIndex((n) => n.key === "france");
      cr.prizes = [
        {
          id: 1,
          name: "the Saint-Pierre",
          kind: "snow",
          flag: fra,
          value: 160,
          day: s.day,
          how: "sent",
          lawful: true,
          status: "home",
        },
      ];
      const before = life.purse;
      cr.phase = "selling";
      settle(g, cr);
      const owners = 160 * (1 - CRUISE.court) * CRUISE.owners;
      expect(life.purse - before).toBeCloseTo((owners * me.share) / 100, 1);
      expect(f.sea!.fetched).toBeCloseTo(owners, 2);
      // Home, she's in port again; her worth counts in a winding up.
      g.tick();
      expect(f.sea!.cruise).toBe(-1);
      expect(f.sea!.cruises).toBe(1);
    });
  },
);

// ---------------------------------------------------------------- the rooms server

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const settleNet = () => new Promise((r) => setTimeout(r, 60));
let tick: () => void = () => {};

class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: {
    test: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  readonly ws: WebSocket;
  readonly open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.open = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends ServerMessage["t"]>(
    t: T,
    test: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
  ) {
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${t}`)),
        4000,
      );
      this.waiters.push({
        test: (m) => m.t === t && test(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }
  private id = 100;
  async cmd(c: object): Promise<string | null> {
    const id = this.id++;
    tick();
    const ack = this.next("ack", (m) => m.id === id);
    this.send({ t: "cmd", id, c });
    return (await ack).err;
  }
  state(): GameState {
    let s: GameState | null = null;
    for (const m of this.messages) {
      if (m.t === "game") s = JSON.parse(JSON.stringify(m.state));
      else if (m.t === "d" && s) applyDelta(s, m.d as GameDelta);
    }
    return s!;
  }
  close() {
    this.ws.close();
  }
}

describe(
  "a privateering company with two players, through the rooms server",
  { timeout: 120_000 },
  () => {
    let server: http.Server;
    let url = "";
    let clock = 1_800_000_000_000;
    let rooms: import("../../src/server/conquest/ConquestRooms").ConquestRooms;
    const clients: Client[] = [];
    beforeAll(async () => {
      const { attachConquest, ConquestRooms } =
        await import("../../src/server/conquest/ConquestRooms");
      rooms = new ConquestRooms(() => clock);
      tick = () => (clock += 60);
      server = http.createServer();
      attachConquest(server, rooms);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
    });
    afterAll(async () => {
      for (const c of clients) c.close();
      await new Promise((r) => server.close(r));
    });
    const client = async (name: string) => {
      const c = new Client(url);
      clients.push(c);
      await c.open;
      c.send({ t: "hello", name });
      await c.next("welcome");
      return c;
    };

    test("Alden gets up a company, asks Beatrice by letter, the merchants take up the rest; she sails, and both see it", async () => {
      const BOS = prov("Massachusetts Bay");
      const host = await client("Alden");
      const lobby = host.next("lobby");
      host.send({
        t: "create",
        solo: false,
        open: true,
        settings: { difficulty: "normal", start: 1700 },
      });
      const l = await lobby;
      const friend = await client("Bea");
      const joined = host.next("lobby", (m) => m.seats.length === 2);
      friend.send({ t: "join", code: l.code });
      await joined;
      host.send({ t: "plan", plan: plan({ home: BOS, background: "sailor" }) });
      friend.send({
        t: "plan",
        plan: plan({
          home: prov("Jamestown"),
          first: "Beatrice",
          family: "Cole",
          female: true,
          background: "clerk",
        }),
      });
      await host.next("lobby", (m) => m.seats.every((s) => s.made));
      friend.send({ t: "ready", ready: true });
      await host.next("lobby", (m) => m.seats.some((s) => s.ready));
      const games = [host.next("game"), friend.next("game")];
      host.send({ t: "start" });
      const [hg, fg] = await Promise.all(games);
      const paused = host.next("clock", (m) => m.paused);
      host.send({ t: "pause", p: true });
      await paused;
      const game = rooms.rooms.get(l.code)!.game!;
      const s = game.s;
      const A = lifeOfSeat(s, hg.you)!;
      const B = lifeOfSeat(s, fg.you)!;
      A.purse = 200;
      B.purse = 100;
      A.skills.seamanship = 8;
      const eng = s.nations.findIndex((n) => n.key === "england");
      for (const k of ["france", "spain"]) {
        const b = s.nations.findIndex((n) => n.key === k);
        s.wars.push({
          a: eng,
          b,
          by: eng,
          start: s.day,
          why: "War in Europe",
          won: [0, 0],
          lost: [0, 0],
          europe: true,
        });
      }
      // Alden gets her up and writes to Beatrice (in Jamestown).
      expect(
        await host.cmd({
          k: "sea",
          act: "co-open",
          key: "schooner",
          arg: 60,
          name: "Tartar",
        }),
      ).toBeNull();
      const sub = seaOf(s).subs[0];
      expect(
        await host.cmd({ k: "sea", act: "co-ask", id: sub.id, c: B.c }),
      ).toBeNull();
      const ev = B.events.find((e) => e.key === "sea-sub-invite")!;
      expect(ev).toBeTruthy();
      expect(await friend.cmd({ k: "event", id: ev.id, choice: 1 })).toBeNull(); // 25
      expect(B.purse).toBe(75);
      expect(
        await host.cmd({ k: "sea", act: "co-merchants", id: sub.id }),
      ).toBeNull();
      expect(
        await host.cmd({ k: "sea", act: "co-sign", id: sub.id }),
      ).toBeNull();
      const f = firmsOf(s).find((x) => x.hold === "privateer")!;
      expect(f.partners.map((p) => p.c)).toEqual(
        expect.arrayContaining([A.c, B.c]),
      );
      // She's sent cruising with Alden in command, to the best ground for her.
      const ground = bestGround(s, game.w, "schooner", BOS, eng);
      expect(ground).not.toBe("");
      expect(
        await host.cmd({
          k: "sea",
          act: "co-cruise",
          id: f.id,
          key: ground,
          arg: 0,
          name: "command",
        }),
      ).toBeNull();
      rooms.step();
      await settleNet();
      // Beatrice's own copy of the game, from the deltas: the company, and the ship fitting out.
      const fs = friend.state();
      const herFirm = fs.partners!.firms.find((x) => x.id === f.id)!;
      expect(herFirm.hold).toBe("privateer");
      expect(herFirm.sea!.ship).toBe("Tartar");
      expect(herFirm.partners.find((p) => p.c === B.c)!.share).toBeGreaterThan(
        0,
      );
      expect(
        fs.sea!.cruises.some(
          (c) =>
            c.firm === f.id &&
            c.hands.some((h) => h.c === A.c && h.role === "captain"),
        ),
      ).toBe(true);
      expect(fs.sea!.subs.find((x) => x.id === sub.id)!.status).toBe("signed");
      // Sail her: Alden aboard, and every coin the owners had is paid by share.
      const cr = seaOf(s).cruises.find((c) => c.firm === f.id)!;
      let aboard = false;
      for (let d = 0; d < 180 && f.sea!.cruise >= 0; d++) {
        game.tick();
        if (A.travel?.ship === cr.id) aboard = true;
        for (const l2 of [A, B])
          for (const e of [...l2.events]) autoAnswerLife(game, l2.seat, e.id);
      }
      expect(aboard).toBe(true);
      expect(f.sea!.cruise).toBe(-1);
      const drawn = f.partners.reduce((m, p) => m + p.drawn, 0);
      expect(drawn).toBeCloseTo(f.sea!.fetched, 1);
      // Any command sends everyone what changed.
      expect(await host.cmd({ k: "sea", act: "unsign" })).toMatch(/nothing/);
      await settleNet();
      expect(
        friend.state().partners!.firms.find((x) => x.id === f.id)!.sea!.fetched,
      ).toBeCloseTo(f.sea!.fetched, 2);
    });
  },
);

// ---------------------------------------------------------------- hurricanes

describe("the hurricanes", { timeout: 120_000 }, () => {
  test("they come in their season, out of the tropical sea, at three to six hundred km a day, and turn north", () => {
    const g = world({ start: 1700, seed: 31 });
    const s = g.s;
    const born = new Map<number, Storm>();
    const steps: number[] = [];
    const tracks = new Map<number, [number, number][]>();
    const start = dayOf(1701, 0, 1);
    for (let d = start; d < start + 6 * 365; d++) {
      s.day = d;
      stormsDaily(g);
      for (const st of s.sea?.storms ?? []) {
        // Where it was born: the first point of its track.
        if (!born.has(st.id)) {
          const [lat, lon] = st.track[0] ?? [st.lat, st.lon];
          born.set(st.id, { ...st, lat, lon, track: [] });
        }
        if (st.ended === undefined)
          tracks.set(st.id, [...st.track, [st.lat, st.lon]]);
      }
    }
    expect(born.size).toBeGreaterThan(15);
    expect(born.size).toBeLessThan(55);
    const months = [...born.values()].map((st) => dateOf(st.born).month);
    expect(months.every((m) => m >= 5 && m <= 10)).toBe(true);
    const heart = months.filter((m) => m === 7 || m === 8).length;
    expect(heart / months.length).toBeGreaterThan(0.5);
    for (const st of born.values()) {
      expect(st.lat).toBeGreaterThan(10);
      expect(st.lat).toBeLessThan(27);
      expect(st.lon).toBeLessThan(-48);
      expect(st.lon).toBeGreaterThan(-93);
    }
    let north = 0;
    for (const t of tracks.values()) {
      for (let i = 1; i < t.length; i++)
        steps.push(kmApart(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
      if (t.length > 3 && t[t.length - 1][0] > t[0][0] + 3) north++;
    }
    expect(steps.length).toBeGreaterThan(100);
    for (const km of steps) {
      expect(km).toBeGreaterThan(STORM_KM[0] * 0.93);
      expect(km).toBeLessThan(STORM_KM[1] * 1.04);
    }
    // Most make their way north (recurving, or up the coast).
    expect(north / tracks.size).toBeGreaterThan(0.5);
  });

  test("one bearing down: the signs, then the town and the boats in its harbour are struck", () => {
    const { g, s, life } = atWar({
      seed: 32,
      at: "Jamaica",
      war: false,
      year: 1705,
    });
    s.day = dayOf(1705, 7, 20);
    life.boats = [
      {
        id: 77,
        kind: "sloop",
        name: "Swift",
        prov: life.prov,
        condition: 100,
        crew: 3,
        morale: 70,
        use: "idle",
        bought: s.day,
      },
    ];
    const jam = map.provinces[life.prov];
    const st: Storm = {
      id: 5000,
      name: "San Roque",
      born: s.day,
      lat: jam.lat - 1.5,
      lon: jam.lon + 7.8,
      dir: 275,
      km: 420,
      force: 3,
      peak: 4,
      track: [],
      bent: "gulf",
      turn: 99,
      struck: [],
      warned: [],
    };
    seaState(g).storms.push(st);
    let signs = -1;
    let struck = -1;
    for (let d = 0; d < 6; d++) {
      s.day++;
      stormsDaily(g);
      if (signs < 0 && life.events.some((e) => e.key === "sea-storm-signs"))
        signs = d;
      if (struck < 0 && st.struck.includes(life.prov)) struck = d;
    }
    expect(signs).toBeGreaterThanOrEqual(0);
    expect(struck).toBeGreaterThanOrEqual(0);
    expect(signs).toBeLessThan(struck + 1);
    const boat = life.boats.find((b) => b.id === 77);
    expect(!boat || boat.condition < 100).toBe(true);
    expect(life.events.some((e) => e.key === "sea-storm-town")).toBe(true);
    expect(
      g.s.provinces[life.prov].mods.some((m) => m.key === "hurricane"),
    ).toBe(true);
    // The old storm out of nowhere is gone: the drawn "hurricane" never comes.
    const w = hooks.eventWeight.reduce(
      (v, h) => h(g, life, "hurricane", "any", {}, v),
      1,
    );
    expect(w).toBe(0);
  });

  test("a ship at sea in its path: a scene for whoever decides, and the hull battered", () => {
    const { g, s, life } = atWar({ seed: 33 });
    s.day = dayOf(1702, 8, 1);
    const cr = newCruise(
      g,
      {
        key: "st",
        flag: "privateer",
        nation: 0,
        ship: "Dragon",
        kind: "sloop",
        guns: 4,
        captain: life.c,
        cname: "Alden",
        owner: "outfit",
        port: prov("Jamaica"),
        ground: "hispaniola",
        hunt: 30,
        passage: 2,
        sails: s.day,
        aboard: [],
      },
      {},
    );
    cr.hands.push({ seat: "s1", c: life.c, role: "captain", joined: s.day });
    cr.phase = "hunting";
    const sd = prov("Santo Domingo");
    cr.way = {
      prov: sd,
      path: [prov("Higüey")],
      sea: [true],
      depart: s.day,
      arrive: s.day + 4,
    };
    life.prov = sd;
    life.travel = {
      dest: cr.port,
      path: [prov("Higüey")],
      sea: [true],
      depart: s.day,
      arrive: s.day + 4,
      cost: 0,
      ship: cr.id,
    };
    const d = map.provinces[sd];
    seaState(g).storms.push({
      id: 5001,
      name: "San Lorenzo",
      born: s.day,
      lat: d.lat - 0.2,
      lon: d.lon + 3,
      dir: 270,
      km: 380,
      force: 3,
      peak: 4,
      track: [],
      bent: "gulf",
      turn: 99,
      struck: [],
      warned: [],
    });
    s.day++;
    stormsDaily(g);
    s.day++;
    stormsDaily(g);
    const ev = life.events.find((e) => e.key === "sea-storm-ship");
    expect(ev).toBeTruthy();
    const hull = cr.hull;
    expect(answerLifeEvent(g, life, ev!.id, 1)).toBeNull();
    expect(cr.hull).toBeLessThan(hull);
  });
});

// ---------------------------------------------------------------- travel times

describe("how fast the sea is", () => {
  test("a passage: two days to find a ship, 160 km a day, a day at a port of call; a short crossing alone a day or two", () => {
    expect(passageHopDays(300)).toBe(2 + 2);
    expect(passageHopDays(300, true)).toBe(1 + 2);
    expect(passageHopDays(60)).toBe(2);
    expect(passageHopDays(40)).toBe(1);
    expect(passageHopDays(60, false, false)).toBe(3);
    expect(ownBoatHopDays(320, 1.25)).toBe(1 + 2);
  });

  test("the tuned times the owner was told: Boston to New York 6 by passage, 4 in your own sloop", () => {
    const g = world({ start: 1700, seed: 41 });
    const s = g.s;
    s.day = dayOf(1702, 6, 10);
    const days = (a: string, b: string, sea: boolean) =>
      Math.ceil(
        travelRoute(s, map, prov(a), prov(b), sea, false, false, 1)!.days,
      );
    const sloop = (a: string, b: string) =>
      Math.ceil(boatRoute(map, prov(a), prov(b), "sloop")!.days);
    expect(days("Massachusetts Bay", "New Amsterdam", true)).toBe(6);
    expect(sloop("Massachusetts Bay", "New Amsterdam")).toBe(4);
    expect(days("Massachusetts Bay", "New Amsterdam", false)).toBeGreaterThan(
      15,
    );
    expect(days("Jamestown", "Nansemond", true)).toBe(2);
    expect(days("Jamestown", "Charles Town", true)).toBe(8);
    expect(sloop("Jamestown", "Charles Town")).toBe(6);
    expect(days("New Amsterdam", "St. Augustine", true)).toBe(13);
    // Much quicker than walking along the coast.
    expect(days("Massachusetts Bay", "Charles Town", true) * 4).toBeLessThan(
      days("Massachusetts Bay", "Charles Town", false),
    );
  });
});

// ---------------------------------------------------------------- the trades that travel

describe("the trades that travel", { timeout: 120_000 }, () => {
  test("a merchant sailor goes on a voyage, sees the far port, and comes home with a venture", () => {
    const { g, s, life } = atWar({
      seed: 51,
      at: "Massachusetts Bay",
      war: false,
    });
    life.job!.prov = life.prov;
    expect(voyageReady(s, g.w, life)).toBe("merchant");
    const to = destinationOf(s, g.w, "merchant", life.prov, 3);
    expect(to).toBeGreaterThanOrEqual(0);
    const v0 = voyageOdds(s, g.w, life, "merchant", to, true);
    expect(v0.expected).toBeCloseTo(
      VENTURE_LUCK.reduce((m, l) => m + l.p * l.x, 0) * v0.costNow,
      1,
    );
    const before = life.purse;
    expect(goVoyage(g, life, "merchant", to, true)).toBeNull();
    expect(life.purse).toBe(before - v0.costNow);
    const v = seaOf(s).voyages.find((x) => x.seat === "s1")!;
    let farEnd = false;
    let aboard = false;
    for (let d = 0; d < 150 && v.phase !== "done"; d++) {
      g.tick();
      answerAll(g);
      if (life.travel?.ship === v.id) aboard = true;
      if (v.phase === "there") farEnd = true;
    }
    expect(aboard).toBe(true);
    expect(farEnd).toBe(true);
    expect(v.phase).toBe("done");
    expect(life.prov).toBe(v.from);
    expect(life.travel).toBeNull();
    expect(
      life.journal.some((j) => j.aff === "sea" && /Home at/.test(j.text)),
    ).toBe(true);
  });

  test("goods sent with the fur brigade come back by the brigade's odds, less its master's cut", () => {
    const { g, s, life } = atWar({
      seed: 52,
      at: "Massachusetts Bay",
      war: false,
    });
    life.job = {
      ...life.job!,
      kind: "trapper",
      rank: 2,
      place: "woods",
      own: true,
    };
    const before = life.purse;
    expect(stayVoyage(g, life, "furs", true)).toBeNull();
    const stake = before - life.purse;
    expect(stake).toBeGreaterThan(0);
    const v = seaOf(s).voyages.find((x) => x.seat === "s1" && x.sent)!;
    expect(v).toBeTruthy();
    // Not away: still at home, at work.
    expect(life.travel).toBeNull();
    const mid = life.purse;
    ticks(g, 70);
    expect(v.phase).toBe("done");
    const back = r2(life.purse - mid);
    const possible = FUR_LUCK.map(
      (l) => Math.round(stake * l.x * SEND_SHARE * 10) / 10,
    );
    // What came back is one of the brigade's outcomes (other money moves too, so look in the journal).
    const line = life.journal.find((j) => /brigade is back/.test(j.text))!;
    expect(line).toBeTruthy();
    expect(possible.some((p) => line.text.includes(`${p} coins back`))).toBe(
      true,
    );
    void back;
  });
});

// ---------------------------------------------------------------- saves and deltas

describe("saves, the delta, and old saves", { timeout: 120_000 }, () => {
  test("a cruise and a storm survive a save and go on the same; the delta carries the sea; an old save loads", () => {
    const { g, s, life } = atWar({ seed: 61 });
    s.day = dayOf(1702, 7, 25);
    const offer = cruiseOffers(s, g.w, life.prov).find(
      (o) => o.flag === "privateer",
    )!;
    expect(
      cmd(g, { k: "sea", act: "sign", key: offer.key, name: "crew" }),
    ).toBeNull();
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 20; i++) {
      g.tick();
      answerAll(g);
      applyDelta(mine, g.takeDelta());
    }
    expect(mine.sea).toEqual(g.s.sea);
    // Saved mid-cruise: the copy goes on exactly as the original.
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    for (let i = 0; i < 30; i++) {
      g.tick();
      g2.tick();
      answerAll(g);
      answerAll(g2);
    }
    expect(g2.s.sea).toEqual(g.s.sea);
    expect(lifeOfSeat(g2.s, "s1")!.purse).toBeCloseTo(life.purse, 6);
    expect(lifeOfSeat(g2.s, "s1")!.prov).toBe(life.prov);
    // An old save, from before the sea: it loads and sails on.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete old.sea;
    for (const l of old.lives)
      if (l.travel?.ship !== undefined) l.travel = null;
    const g3 = new ConquestGame(map, old);
    for (let i = 0; i < 60; i++) g3.tick();
    expect(seaOf(g3.s).cruises.length).toBeGreaterThanOrEqual(0);
    expect(cruiseById(g3.s, -1)).toBeUndefined();
  });

  test("the same commands make the same sea", () => {
    const run = () => {
      const { g, s, life } = atWar({ seed: 62 });
      s.day = dayOf(1703, 6, 1);
      const offer = cruiseOffers(s, g.w, life.prov).find(
        (o) => o.flag === "privateer",
      )!;
      g.lifeCommand("s1", {
        k: "sea",
        act: "sign",
        key: offer.key,
        name: "crew",
      });
      for (let i = 0; i < 90; i++) {
        g.tick();
        answerAll(g);
      }
      return JSON.stringify(g.s.sea) + life.purse;
    };
    expect(run()).toBe(run());
  });
});
