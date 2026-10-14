// EVENTS (r21): events where you are (every event tagged; no tavern on a
// Kalinago island, no family news abroad; what belongs to a place comes
// more readily there), many more events and matters at work, plainer words,
// "Spot on!" at Liar's dice, and vingt-et-un at the tavern with each
// player's cards kept to themselves.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { presentAt } from "../../src/conquest/engine/Areas";
import {
  bankOdds,
  bustChance,
  cardTables,
  handTotal,
  isNatural,
  shuffled,
  standOdds,
  unseenOf,
  valueOf,
} from "../../src/conquest/engine/CardsCore";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { computerMove } from "../../src/conquest/engine/DiceAi";
import {
  countFace,
  DICE_EACH,
  exactChance,
  raisesOver,
  tablesOf,
  totalDice,
} from "../../src/conquest/engine/DiceCore";
import {
  ENTER_REST,
  fitScene,
  fitsSpot,
  PLACE_BOOST,
  placeWeight,
  ROAD_KEYS,
  SEA_KEYS,
  settleOf,
  spotOf,
  tag,
  tagged,
  VENTURE_REST,
  WHERE,
  whereOf,
} from "../../src/conquest/engine/EventPlaces";
import { R21_EVENTS } from "../../src/conquest/engine/EventsR21";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { hooks } from "../../src/conquest/engine/Hooks";
import {
  LIFE_EVENTS,
  raiseLifeEvent,
} from "../../src/conquest/engine/LifeEvents";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { JOBS } from "../../src/conquest/engine/LifeRules";
import { pickMatter, VARIANTS } from "../../src/conquest/engine/Matters";
import { R21_MATTERS } from "../../src/conquest/engine/MattersR21";
import { Rng } from "../../src/conquest/engine/Rng";
import { fittingBody } from "../../src/conquest/engine/SeaEvents";
import type {
  Card,
  CardTable,
  Character,
  DiceTable,
  GameDelta,
  GameState,
  JobKind,
  Life,
} from "../../src/conquest/engine/Types";
import {
  deltaForViewer,
  stateForViewer,
} from "../../src/conquest/engine/Viewers";
import { computerDraws, outcomeOf } from "../../src/conquest/engine/VingtEtUn";
import { MATTERS } from "../../src/conquest/engine/WorkEvents";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

const JT = prov("Jamestown");
const SV = prov("St. Vincent");
const HAV = prov("Havana");

/** Every event, raised ones too (they're added the first time one is looked up). */
function allEvents() {
  const g = world({ start: 1700 });
  raiseLifeEvent(g, lifeOf(g), "__none__");
  return LIFE_EVENTS;
}

function setJob(life: Life, kind: JobKind, rank = 1): void {
  const def = JOBS[kind];
  life.job = {
    kind,
    rank: Math.min(rank, def.ranks.length - 1),
    prov: life.prov,
    place: def.places[0],
    employer: -1,
    nation: 0,
    army: -1,
    since: 0,
    months: 0,
    away: 0,
    worked: 0,
    awayDays: 0,
  };
}

// ---------------------------------------------------------------- where things happen

describe("every event says where it happens", () => {
  test("each drawn event is tagged by hand; every tag reads; every event has a place", () => {
    const evs = allEvents();
    const keys = new Set<string>();
    for (const e of evs) {
      expect(keys.has(e.key), `duplicate ${e.key}`).toBe(false);
      keys.add(e.key);
    }
    const drawn = evs.filter((e) => e.pool !== "raised");
    expect(drawn.length).toBeGreaterThan(380);
    const untagged = drawn.filter((e) => !tagged(e.key)).map((e) => e.key);
    expect(untagged).toEqual([]);
    // No stale entries: every tag in the table is a real event.
    for (const k of [...Object.keys(WHERE), ...ROAD_KEYS, ...SEA_KEYS])
      expect(keys.has(k), `no event ${k}`).toBe(true);
    for (const e of evs) expect(whereOf(e.key, e.pool, e)).toBeTruthy();
    // The round's own say it on their definitions.
    for (const e of R21_EVENTS) expect(e.where, e.key).toBeTruthy();
    expect(() => tag("tavern")).toThrow();
    expect(tag("home settled @home,village inside job")).toEqual({
      reach: "home",
      in: ["town", "native"],
      at: ["home", "village"],
      inside: true,
      job: true,
    });
  });

  test("a colonist staying on a Kalinago island hears no tavern, no family at home, and his work stays at home", () => {
    const g = world({
      start: 1700,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: JT, background: "clerk" }),
        },
      ],
    });
    const life = lifeOf(g);
    setJob(life, "clerk");
    life.prov = SV;
    life.area = "village";
    expect(settleOf(g.s, SV)).not.toBe("town");
    const at = spotOf(g, life);
    expect(at.home).toBe(false);
    expect(at.places.has("tavern")).toBe(false);
    expect(at.job).toBe(false);
    const fits = (k: string) => {
      const e = LIFE_EVENTS.find((x) => x.key === k)!;
      return fitsSpot(whereOf(k, e.pool, e), at);
    };
    for (const k of [
      "lottery",
      "kin-bible",
      "spouse-quarrel",
      "tavern-sharper",
      "town-watch-turn",
      "clerk-ledger",
      "fire",
      "front-cabin",
      "tvn-fiddler",
      "hom-supper",
    ])
      expect(fits(k), k).toBe(false);
    for (const k of [
      "fever",
      "comet",
      "vil-guest-feast",
      "abr-letter-home",
      "abr-homesick",
      "vision",
    ])
      expect(fits(k), k).toBe(true);
    // At home in Jamestown, the family's and the town's come back.
    life.prov = JT;
    life.area = "home";
    const home = spotOf(g, life);
    expect(home.home).toBe(true);
    expect(fitsSpot(whereOf("kin-bible", "any"), home)).toBe(true);
    expect(fitsSpot(whereOf("abr-homesick", "any"), home)).toBe(false);
  });

  test("three years abroad (St. Vincent, Havana): every event drawn fits where it came", () => {
    const g = world({
      start: 1700,
      seed: 11,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: JT, background: "clerk" }),
        },
        {
          seat: "s2",
          name: "Bea",
          plan: plan({
            home: JT,
            background: "clerk",
            first: "Bea",
            female: true,
          }),
        },
      ],
    });
    g.aiEnabled = false;
    const stay: Record<string, number> = { s1: SV, s2: HAV };
    const fired: { key: string; ok: boolean; seat: string }[] = [];
    const h = (gg: ConquestGame, life: Life, key: string, pool: string) => {
      if (pool === "raised") return;
      fired.push({
        key,
        seat: life.seat,
        ok: fitsSpot(whereOf(key, pool as never), spotOf(gg, life)),
      });
    };
    hooks.eventFired.unshift(h);
    try {
      for (let d = 0; d < 3 * 365; d++) {
        for (const l of g.s.lives) {
          l.travel = null;
          l.prov = stay[l.seat];
          l.health = Math.max(l.health, 80);
          l.purse = Math.max(l.purse, 30);
        }
        g.tick();
        for (const l of g.s.lives) l.events = [];
      }
    } finally {
      hooks.eventFired.splice(hooks.eventFired.indexOf(h), 1);
    }
    expect(fired.length).toBeGreaterThan(15);
    expect(fired.filter((f) => !f.ok)).toEqual([]);
    // What came is what a stranger meets there, and nothing of home.
    const keys = new Set(fired.map((f) => f.key));
    expect(
      [...keys].some(
        (k) =>
          k.startsWith("abr-") || k.startsWith("vil-") || k.startsWith("wld-"),
      ),
    ).toBe(true);
    expect([...keys].filter((k) => whereOf(k, "any").reach === "home")).toEqual(
      [],
    );
  }, 60000);

  test("what belongs to a place comes more readily there; a scene is set in a place that's here", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.area = "tavern";
    expect(placeWeight(g, life, "tvn-stranger-news", "any", 1)).toBe(
      PLACE_BOOST,
    );
    life.area = "market";
    expect(placeWeight(g, life, "tvn-stranger-news", "any", 1)).toBe(1);
    // Only inside: the card sharp needs you in the tavern.
    expect(placeWeight(g, life, "tvn-cards-cheat", "any", 1)).toBe(0);
    // On St. Vincent there are no docks: a storm's warning is set where you are.
    life.prov = SV;
    life.area = "village";
    expect(fitScene(g, life, "sea-storm-signs", "raised", "docks")).toBe(
      "village",
    );
    expect(fitScene(g, life, "x", "raised", "letter")).toBe("letter");
  });

  test("going into a place, now and then something of the place's own happens there (once a month at most)", () => {
    const g = world({ start: 1700, seed: 3 });
    g.aiEnabled = false;
    const life = lifeOf(g);
    life.purse = 50;
    let got: string | null = null;
    let first = -1;
    for (let d = 0; d < 400 && !got; d++) {
      g.lifeCommand(life.seat, { k: "enter", area: "market" });
      g.lifeCommand(life.seat, { k: "enter", area: "tavern" });
      const e = life.events.find((x) =>
        whereOf(x.key, "any").at?.includes("tavern"),
      );
      if (e) {
        got = e.key;
        first = g.s.day;
      }
      life.events = [];
      g.tick();
      life.events = [];
    }
    expect(got).not.toBeNull();
    expect(life.cooldowns["pl:enter"]).toBe(first + ENTER_REST);
    // Within the rest, going in brings nothing of its own.
    let again = 0;
    for (let d = 0; d < ENTER_REST - 2; d++) {
      g.lifeCommand(life.seat, { k: "enter", area: "market" });
      life.events = [];
      g.lifeCommand(life.seat, { k: "enter", area: "tavern" });
      again += life.events.length;
      life.events = [];
      g.tick();
      life.events = [];
    }
    expect(again).toBe(0);
  }, 30000);
});

// ---------------------------------------------------------------- more of them

describe("more events, and a trade's matters aren't the same few", () => {
  test("every honest trade has eleven kinds of matter or more; every crooked trade six big jobs or more", () => {
    for (const j of Object.keys(JOBS) as JobKind[]) {
      const own = VARIANTS.filter((v) => v.jobs.includes(j));
      const classic = MATTERS[j] ? 2 : 0;
      const kinds = own.length + classic;
      if (own.some((v) => v.kind === "score"))
        expect(kinds, j).toBeGreaterThanOrEqual(6);
      else expect(kinds, j).toBeGreaterThanOrEqual(10);
    }
    expect(R21_MATTERS.length).toBeGreaterThan(260);
    expect(
      R21_EVENTS.filter((e) => e.pool === "any").length,
    ).toBeGreaterThanOrEqual(100);
  });

  test("ten years of matters at work: a trader sees ten kinds and more, none more than once a year", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    // Working for one of the town's people, as most do.
    const boss = (g.s.locals[life.prov] ?? []).find(
      (id) => !g.s.lives.some((l) => l.c === id) && g.s.chars[id]?.alive,
    )!;
    for (const kind of ["trader", "clerk", "farmer", "sailor"] as JobKind[]) {
      setJob(life, kind);
      life.job!.employer = boss;
      life.cooldowns = {};
      life.evSeen = {};
      const seen: Record<string, number> = {};
      const start = g.s.day;
      for (let d = 0; d < 10 * 365; d += 26) {
        g.s.day = start + d;
        const m = pickMatter(g, life, d % 52 === 0 ? "trouble" : "task");
        if (m) {
          const k =
            m.key.startsWith("work-task") || m.key.startsWith("work-trouble")
              ? `${m.key}:${kind}`
              : m.key;
          seen[k] = (seen[k] ?? 0) + 1;
        }
      }
      g.s.day = start;
      const kinds = Object.keys(seen).length;
      expect(kinds, kind).toBeGreaterThanOrEqual(9);
      expect(Math.max(...Object.values(seen)), kind).toBeLessThanOrEqual(10);
    }
  });

  test("a venture at 20 coins a share comes once in three years at most", () => {
    const g = world({ start: 1700, seed: 4 });
    g.aiEnabled = false;
    const life = lifeOf(g);
    // A merchant who likes you, and a full purse: the old letter came most months it could.
    const m = (g.s.locals[life.prov] ?? [])
      .map((id) => g.s.chars[id])
      .find((c) => c?.role === "merchant" || c?.role === "planter")!;
    expect(m).toBeTruthy();
    g.char(m.id).memories.push({
      of: life.c,
      why: "Test",
      value: 90,
      until: 0,
    });
    life.met.push(m.id);
    const days: number[] = [];
    for (let d = 0; d < 12 * 365; d++) {
      life.purse = 200;
      life.health = 90;
      life.travel = null;
      life.prov = life.home;
      g.tick();
      for (const l of life.post ?? [])
        if (
          l.to === life.c &&
          /20 coins a share/.test(l.text) &&
          !days.includes(l.sent)
        )
          days.push(l.sent);
      life.events = [];
    }
    for (let i = 1; i < days.length; i++)
      expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(VENTURE_REST);
    expect(days.length).toBeLessThanOrEqual(5);
  }, 60000);
});

// ---------------------------------------------------------------- plainer words

describe("plainer words", () => {
  test("a ship wanting hands says what she is, how the crew is paid, and what a hand can expect", () => {
    const def = (() => {
      allEvents();
      return LIFE_EVENTS.find((e) => e.key === "sea-fitting")!;
    })();
    expect(def).toBeTruthy();
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    // A privateer's offer, as the quay makes them.
    const o = {
      key: "o:1:1:1:1",
      flag: "privateer" as const,
      nation: 0,
      ship: "Speedwell",
      kind: "sloop" as const,
      guns: 6,
      captain: -1,
      cname: "Captain Hale",
      owner: -1,
      port: JT,
      ground: "windward",
      hunt: 30,
      passage: 12,
      sails: g.s.day + 10,
      aboard: [],
    };
    const text = fittingBody(g, life, o as never);
    expect(text).toMatch(/letter of marque/);
    expect(text).toMatch(/licence to capture enemy merchant ships/);
    expect(text).toMatch(/no wages/);
    expect(text).toMatch(/home in about 54 days/);
    expect(text).toMatch(/your share would come to about \d+ coins/);
    expect(text).not.toMatch(/beating for men|on the account/);
    const pirate = fittingBody(g, life, { ...o, flag: "pirate" } as never);
    expect(pirate).toMatch(/pirate crew/);
    expect(pirate).toMatch(/hanged/);
  });
});

// ---------------------------------------------------------------- Spot on!

/** A player in the tavern at Jamestown with some of the town about. */
function tavern(seed = 5) {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: JT, background: "clerk" }),
      },
    ],
  });
  g.aiEnabled = false;
  const life = lifeOf(g);
  const here = () =>
    presentAt(g.s, g.w, life.prov, "tavern", g.s.day, life)
      .filter((x) => x.kind !== "player")
      .map((x) => g.s.chars[x.c]);
  for (let i = 0; i < 90 && here().length < 4; i++) {
    g.tick();
    life.events = [];
  }
  life.events = [];
  life.purse = 300;
  life.area = "tavern";
  const folk = here();
  for (const c of folk)
    g.char(c.id).memories.push({
      of: life.c,
      why: "Test",
      value: 90,
      until: 0,
    });
  return { g, life, folk };
}

const dice = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, { k: "dice", ...c } as never);

describe("Liar's dice: Spot on!", () => {
  test("exactly right wins back a die and opens the next round; wrong loses one; with five, nothing to win", () => {
    const { g, life, folk } = tavern();
    expect(
      dice(g, life, { act: "open", stake: 5, ask: [folk[0].id, folk[1].id] }),
    ).toBeNull();
    const t = tablesOf(g.s).find((x) => x.status === "open")!;
    expect(t.seats.length).toBeGreaterThanOrEqual(2);
    expect(dice(g, life, { act: "start", id: t.id })).toBeNull();
    const me = t.seats.find((x) => x.c === life.c)!;
    const them = t.seats.filter((x) => x.c !== life.c);
    const rig = (mine: number[], n: number, bid: { q: number; f: number }) => {
      me.n = n;
      me.dice = mine;
      for (const y of them) {
        y.dice = [2, 3, 4, 6, 6].slice(0, y.n);
      }
      t.bid = bid;
      t.by = them[0].c;
      t.turn = t.seats.indexOf(me);
    };
    // Exactly: my two fives and a one (three), and nobody else's.
    rig([5, 5, 1, 2], 4, { q: 3, f: 5 });
    expect(dice(g, life, { act: "spot", id: t.id })).toBeNull();
    let rev = t.acts.filter((a) => a.k === "reveal").pop()!;
    expect(rev.spot).toBe(true);
    expect(rev.count).toBe(3);
    expect(rev.gain).toBe(life.c);
    expect(rev.loser).toBeUndefined();
    expect(me.n).toBe(5);
    const roll = t.acts.filter((a) => a.k === "roll").pop()!;
    expect(roll.c).toBe(life.c); // the caller opens
    // Exactly, with all five: nothing to win back, nothing lost.
    rig([5, 5, 1, 2, 3], 5, { q: 3, f: 5 });
    expect(dice(g, life, { act: "spot", id: t.id })).toBeNull();
    rev = t.acts.filter((a) => a.k === "reveal").pop()!;
    expect(rev.gain).toBeUndefined();
    expect(me.n).toBe(5);
    // Not exact (four showing for three): the caller loses a die.
    rig([5, 5, 1, 5, 2], 5, { q: 3, f: 5 });
    expect(dice(g, life, { act: "spot", id: t.id })).toBeNull();
    rev = t.acts.filter((a) => a.k === "reveal").pop()!;
    expect(rev.count).toBe(4);
    expect(rev.loser).toBe(life.c);
    expect(me.n).toBe(4);
    // Nobody can say it before there's a bid.
    t.bid = null;
    t.turn = t.seats.indexOf(me);
    expect(dice(g, life, { act: "spot", id: t.id })).toMatch(/no bid/);
  });

  test("the chance of 'exactly' shown matches how often it is, and the town's people say it sensibly", () => {
    const { g, folk } = tavern();
    // The shown chance against dealt dice: two dice of mine, nine hidden.
    const r = new Rng({ rng: 77 });
    const own = [5, 1];
    const b = { q: 5, f: 5 };
    const shown = exactChance(own, 9, b);
    let hit = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const hidden = Array.from({ length: 9 }, () => r.int(1, 6));
      if (countFace([...own, ...hidden], 5) === 5) hit++;
    }
    expect(Math.abs(hit / N - shown)).toBeLessThan(
      3 * Math.sqrt((shown * (1 - shown)) / N) + 0.002,
    );
    // The computer players: some spot calls, none with five dice, right far more often than chance.
    let calls = 0;
    let right = 0;
    let withFive = 0;
    let decisions = 0;
    for (let k = 0; k < 4000; k++) {
      const n = 2 + r.int(0, 2);
      const t = {
        id: 1,
        prov: 0,
        host: 0,
        stake: 2,
        pot: 0,
        status: "playing",
        seats: Array.from({ length: n }, (_, i) => {
          const m = 1 + r.int(0, 4);
          return {
            c: folk[i % folk.length].id,
            dice: Array.from({ length: m }, () => r.int(1, 6)),
            n: m,
            state: "in",
            rounds: 1,
            paid: 2,
          };
        }),
        asked: [],
        round: 1,
        turn: 0,
        bid: null,
        by: -1,
        acts: [],
        tells: [],
        seq: 0,
        opened: 0,
        rng: r.int(1, 1e9),
      } as unknown as DiceTable;
      const total = totalDice(t);
      const all = raisesOver(null, total);
      t.bid = all[r.int(0, Math.min(all.length - 1, total * 2))];
      t.by = t.seats[1].c;
      decisions++;
      const m = computerMove(g.s, t, 0, new Rng(t));
      if (!m.spot) continue;
      calls++;
      if (t.seats[0].n >= DICE_EACH) withFive++;
      const count = t.seats.reduce(
        (a, x) => a + countFace(x.dice, t.bid!.f),
        0,
      );
      if (count === t.bid!.q) right++;
    }
    expect(calls).toBeGreaterThan(20);
    expect(calls / decisions).toBeLessThan(0.15);
    expect(withFive).toBe(0);
    expect(right / calls).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------- vingt-et-un

/** A card by rank (0 the ace … 12 the king) and suit. */
const C = (rank: number, suit = 0): Card => suit * 13 + rank;

describe("vingt-et-un: the cards", () => {
  test("what a hand counts: aces one or eleven, court cards ten; a natural", () => {
    expect(handTotal([C(0), C(12)])).toEqual({ total: 21, soft: true });
    expect(isNatural([C(0), C(10, 2)])).toBe(true);
    expect(isNatural([C(0), C(4), C(5)])).toBe(false);
    expect(handTotal([C(0), C(0, 1), C(8)])).toEqual({ total: 21, soft: true });
    expect(handTotal([C(9), C(5), C(0)])).toEqual({ total: 17, soft: false });
    expect(valueOf(C(11))).toBe(10);
    const deck = shuffled(new Rng({ rng: 5 }));
    expect([...deck].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 52 }, (_, i) => i),
    );
  });

  test("settling: over loses, a natural is paid double, a banker's natural takes all but a natural, ties stand off", () => {
    const x = (cards: Card[], state: string) =>
      ({
        c: 1,
        cards,
        n: cards.length,
        state,
        stake: 5,
        net: 0,
        hands: 1,
      }) as never;
    const bank18 = [C(9), C(7)];
    expect(outcomeOf(x([C(9), C(8)], "stood"), bank18)).toBe(1);
    expect(outcomeOf(x([C(9), C(6)], "stood"), bank18)).toBe(-1);
    expect(outcomeOf(x([C(9), C(7)], "stood"), bank18)).toBe(0);
    expect(outcomeOf(x([C(9), C(6), C(9)], "bust"), [C(9), C(5), C(9)])).toBe(
      -1,
    ); // over first: lost, though the bank went over too
    expect(outcomeOf(x([C(6), C(5)], "stood"), [C(9), C(5), C(9)])).toBe(1);
    expect(outcomeOf(x([C(0), C(12)], "natural"), bank18)).toBe(2);
    expect(outcomeOf(x([C(0), C(12)], "natural"), [C(0), C(11)])).toBe(0);
    expect(outcomeOf(x([C(9), C(9)], "stood"), [C(0), C(11)])).toBe(-1);
  });

  test("the odds shown are the odds dealt: the bank's count from a shuffled deck, and the chance of going over", () => {
    const mine = [C(9, 0), C(5, 1)]; // sixteen
    const unseen = unseenOf(mine);
    const shown = bankOdds(unseen);
    const r = new Rng({ rng: 909 });
    const got: Record<number, number> = {
      17: 0,
      18: 0,
      19: 0,
      20: 0,
      21: 0,
      22: 0,
    };
    let n = 0;
    let busts = 0;
    for (let i = 0; i < 20000; i++) {
      const deck = shuffled(r).filter((c) => !mine.includes(c));
      // The next card for me.
      if (handTotal([...mine, deck[deck.length - 1]]).total > 21) busts++;
      const bank = [deck[0], deck[1]];
      if (isNatural(bank)) continue; // he'd have shown it at the deal
      let k = 2;
      while (handTotal(bank).total < 17) bank.push(deck[k++]);
      got[Math.min(22, handTotal(bank).total)]++;
      n++;
    }
    for (const t of [17, 18, 19, 20, 21, 22] as const) {
      const p = shown[t];
      expect(Math.abs(got[t] / n - p), `bank ${t}`).toBeLessThan(
        3 * Math.sqrt((p * (1 - p)) / n) + 0.004,
      );
    }
    const b = bustChance(mine, unseen);
    expect(Math.abs(busts / 20000 - b)).toBeLessThan(0.015);
    const so = standOdds(16, shown);
    expect(so.win + so.tie + so.lose).toBeCloseTo(1, 6);
    expect(so.tie).toBe(0); // the bank never stops at sixteen
  });

  test("the town's people play sensibly: always a card on eleven or less, never on twenty", () => {
    const t = { seats: [], bankCards: [] } as unknown as CardTable;
    const g = world({ start: 1700 });
    for (let i = 0; i < 300; i++) {
      const lo = {
        c: 1,
        cards: [C((i % 5) + 1), C(((i + 2) % 5) + 1)],
        n: 2,
        state: "play",
        stake: 2,
        net: 0,
        hands: 1,
      } as never;
      expect(computerDraws(g.s, t, lo)).toBe(
        handTotal((lo as { cards: Card[] }).cards).total <= 11
          ? true
          : computerDraws(g.s, t, lo),
      );
    }
    expect(
      computerDraws(g.s, t, {
        c: 1,
        cards: [C(9), C(12)],
        n: 2,
        state: "play",
        stake: 2,
        net: 0,
        hands: 1,
      } as never),
    ).toBe(false);
    expect(
      computerDraws(g.s, t, {
        c: 1,
        cards: [C(4), C(5)],
        n: 2,
        state: "play",
        stake: 2,
        net: 0,
        hands: 1,
      } as never),
    ).toBe(true);
  });
});

/** Open a card table in the tavern with the town's people, at a stake. */
function cardTable(
  g: ConquestGame,
  life: Life,
  folk: Character[],
  stake = 2,
): CardTable {
  const err = g.lifeCommand(life.seat, {
    k: "cards",
    act: "open",
    stake,
    ask: folk.map((c) => c.id),
  });
  expect(err).toBeNull();
  return cardTables(g.s).find((t) => t.status !== "done")!;
}

const cards = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, { k: "cards", ...c } as never);

describe("vingt-et-un: a table", () => {
  test("hands are dealt, played and settled; the money adds up; the table plays on and is put away", () => {
    const { g, life, folk } = tavern(6);
    const t = cardTable(g, life, folk);
    expect(t.bank === -1 || g.s.chars[t.bank].role === "innkeeper").toBe(true);
    const punters = t.seats.length;
    expect(punters).toBeGreaterThanOrEqual(2);
    let purse = life.purse;
    let net = 0;
    for (let h = 0; h < 12 && t.status !== "done"; h++) {
      expect(cards(g, life, { act: "deal", id: t.id })).toBeNull();
      const me = t.seats.find((x) => x.c === life.c)!;
      for (let i = 0; i < 10 && t.status === "hand" && me.state === "play"; i++)
        expect(
          cards(g, life, {
            act: handTotal(me.cards).total < 15 ? "draw" : "stand",
            id: t.id,
          }),
        ).toBeNull();
      expect(t.status).not.toBe("hand");
      const settle = t.acts.filter((a) => a.k === "settle").pop()!;
      expect(settle.hand).toBe(t.hand);
      const pay = settle.pay![life.c];
      net += pay;
      expect(life.purse).toBe(purse + pay);
      purse = life.purse;
      // Every hand shown at the settling; the banker's drawn to seventeen unless all went over.
      const bank = settle.hands![t.bank];
      const allOver = Object.entries(settle.pay!).every(
        ([c]) =>
          t.seats.find((x) => x.c === Number(c))?.cards &&
          handTotal(settle.hands![Number(c)]).total > 21,
      );
      if (!allOver && !isNatural(bank))
        expect(handTotal(bank).total).toBeGreaterThanOrEqual(17);
    }
    expect(t.seats.find((x) => x.c === life.c)!.net).toBe(net);
    expect(cards(g, life, { act: "leave", id: t.id })).toBeNull();
    expect(t.status).toBe("done");
  });

  test("each player's copy holds only their own cards, the banker's once he's played, and never the deck", () => {
    const { g, life, folk } = tavern(8);
    const t = cardTable(g, life, folk.slice(0, 2));
    // A second player at the table (a seat of their own).
    const other = t.seats.find((x) => x.c !== life.c)!;
    other.seat = "s9";
    expect(cards(g, life, { act: "deal", id: t.id })).toBeNull();
    if (t.status !== "hand") return; // a banker's natural settled it at once
    const mine = t.seats.find((x) => x.c === life.c)!;
    const view = stateForViewer(g.s, life.seat).cards!.tables.find(
      (x) => x.id === t.id,
    )!;
    expect(view.deck).toEqual([]);
    expect(view.rng).toBe(0);
    expect(view.bankCards).toEqual([]);
    expect(view.seats.find((x) => x.c === life.c)!.cards).toEqual(mine.cards);
    for (const x of view.seats)
      if (x.c !== life.c && x.state === "play") expect(x.cards).toEqual([]);
    const theirs = stateForViewer(g.s, "s9").cards!.tables.find(
      (x) => x.id === t.id,
    )!;
    expect(theirs.seats.find((x) => x.c === life.c)!.cards).toEqual([]);
    const watcher = stateForViewer(g.s, null).cards!.tables.find(
      (x) => x.id === t.id,
    )!;
    for (const x of watcher.seats)
      if (x.state === "play") expect(x.cards).toEqual([]);
    // A delta carries the same redaction.
    const d = { cards: g.s.cards } as GameDelta;
    const dv = deltaForViewer(g.s, d, "s9").cards!.tables.find(
      (x) => x.id === t.id,
    )!;
    expect(dv.deck).toEqual([]);
    expect(dv.seats.find((x) => x.c === life.c)!.cards).toEqual([]);
    // Once settled, every hand is shown in the settling move.
    other.seat = undefined;
    for (let i = 0; i < 10 && t.status === "hand" && mine.state === "play"; i++)
      cards(g, life, { act: "stand", id: t.id });
    expect(t.status).toBe("between");
    const after = stateForViewer(g.s, null).cards!.tables.find(
      (x) => x.id === t.id,
    )!;
    expect(after.bankCards.length).toBeGreaterThanOrEqual(2);
    expect(
      after.acts.filter((a) => a.k === "settle").pop()!.hands![life.c],
    ).toEqual(mine.cards);
  });

  test("a table mid-hand survives a save and a load, and goes on the same; an old save without cards loads", () => {
    const { g, life, folk } = tavern(9);
    const t = cardTable(g, life, folk);
    expect(cards(g, life, { act: "deal", id: t.id })).toBeNull();
    const saved = JSON.stringify(g.s);
    const play = (gg: ConquestGame) => {
      const l = lifeOfSeat(gg.s, life.seat)!;
      const tb = cardTables(gg.s).find((x) => x.id === t.id)!;
      for (let h = 0; h < 5 && tb.status !== "done"; h++) {
        if (tb.status !== "hand")
          gg.lifeCommand(l.seat, { k: "cards", act: "deal", id: tb.id });
        const me = tb.seats.find((x) => x.c === l.c)!;
        for (
          let i = 0;
          i < 10 && tb.status === "hand" && me.state === "play";
          i++
        )
          gg.lifeCommand(l.seat, {
            k: "cards",
            act: handTotal(me.cards).total < 16 ? "draw" : "stand",
            id: tb.id,
          });
      }
      return JSON.stringify(
        tb.acts.map((a) => [a.k, a.c, a.hand, a.cards, a.pay]),
      );
    };
    const a = play(g);
    const g2 = new ConquestGame(map, JSON.parse(saved) as GameState);
    expect(play(g2)).toBe(a);
    const old = JSON.parse(saved) as GameState;
    delete old.cards;
    const g3 = new ConquestGame(map, old);
    expect(g3.s.cards).toBeUndefined();
    g3.tick();
  });
});

// ---------------------------------------------------------------- two players, through the rooms server

const settle = () => new Promise((r) => setTimeout(r, 60));
let tickClock: () => void = () => {};

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
    tickClock();
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

describe("vingt-et-un between two players, through the rooms server", () => {
  let server: http.Server;
  let url = "";
  let clock = 1_800_000_000_000;
  let rooms: import("../../src/server/conquest/ConquestRooms").ConquestRooms;
  const clients: Client[] = [];
  beforeAll(async () => {
    const { attachConquest, ConquestRooms } =
      await import("../../src/server/conquest/ConquestRooms");
    rooms = new ConquestRooms(() => clock);
    tickClock = () => (clock += 60);
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

  test("B is never sent A's cards before they're shown; a player who stalls is decided for", async () => {
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
    host.send({ t: "plan", plan: plan({ home: JT, background: "clerk" }) });
    friend.send({
      t: "plan",
      plan: plan({
        home: JT,
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
    const room = rooms.rooms.get(l.code)!;
    const game = room.game!;
    const A = lifeOfSeat(game.s, hg.you)!;
    const B = lifeOfSeat(game.s, fg.you)!;
    A.purse = B.purse = 80;
    expect(await host.cmd({ k: "enter", area: "tavern" })).toBeNull();
    expect(await friend.cmd({ k: "enter", area: "tavern" })).toBeNull();

    // Alden opens a table and asks Beatrice; she sits down from her invitation.
    expect(
      await host.cmd({ k: "cards", act: "open", stake: 2, ask: [B.c] }),
    ).toBeNull();
    const t = cardTables(game.s)[0];
    const ev = B.events.find((e) => e.key === "p2p-cards")!;
    expect(ev).toBeTruthy();
    expect(await friend.cmd({ k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(t.seats.some((x) => x.c === B.c)).toBe(true);

    // Several hands: both deal in; Alden plays, Beatrice stalls once.
    let stalled = false;
    for (let h = 0; h < 6; h++) {
      expect(await host.cmd({ k: "cards", act: "deal", id: t.id })).toBeNull();
      expect(
        await friend.cmd({ k: "cards", act: "deal", id: t.id }),
      ).toBeNull();
      if (t.status !== "hand") continue;
      await settle();
      // Each holds their own cards and nobody else's.
      const a = t.seats.find((x) => x.c === A.c)!;
      const b = t.seats.find((x) => x.c === B.c)!;
      const seen = (c: Client) =>
        cardTables(c.state()).find((x) => x.id === t.id)!;
      if (a.state === "play" && b.state === "play") {
        expect(seen(friend).seats.find((x) => x.c === A.c)!.cards).toEqual([]);
        expect(seen(friend).seats.find((x) => x.c === B.c)!.cards).toEqual(
          b.cards,
        );
        expect(seen(host).seats.find((x) => x.c === B.c)!.cards).toEqual([]);
        expect(seen(host).bankCards).toEqual([]);
      }
      while (t.status === "hand" && a.state === "play")
        expect(
          await host.cmd({ k: "cards", act: "stand", id: t.id }),
        ).toBeNull();
      if (t.status === "hand" && b.state === "play") {
        if (!stalled) {
          // She stalls: the clock is told, and after it the table plays her hand.
          const msg = host.next("cardsclock");
          rooms.step();
          const cc = await msg;
          expect(cc.left).toBeGreaterThanOrEqual(45);
          clock += 50_000;
          rooms.step();
          clock += 2_000;
          rooms.step();
          expect(t.status).not.toBe("hand");
          expect(t.acts.some((x) => x.auto && x.c === B.c)).toBe(true);
          stalled = true;
        } else
          while (t.status === "hand" && b.state === "play")
            expect(
              await friend.cmd({ k: "cards", act: "stand", id: t.id }),
            ).toBeNull();
      }
    }
    await settle();
    expect(t.hand).toBeGreaterThanOrEqual(3);

    // Through it all: neither was sent the other's cards while the hand was being
    // played, nor the deck, nor the banker's before he played.
    for (const [msgs, me, them] of [
      [friend.messages, B.c, A.c],
      [host.messages, A.c, B.c],
    ] as [ServerMessage[], number, number][]) {
      let n = 0;
      for (const m of msgs) {
        if (m.t !== "d" && m.t !== "game") continue;
        const cs = m.t === "game" ? m.state.cards : m.d.cards;
        if (!cs) continue;
        n++;
        for (const tb of cs.tables) {
          expect(tb.deck).toEqual([]);
          expect(tb.rng).toBe(0);
          if (tb.status === "hand") {
            expect(tb.bankCards).toEqual([]);
            for (const x of tb.seats)
              if (x.c === them && x.state !== "bust" && x.state !== "natural")
                expect(x.cards).toEqual([]);
          }
        }
      }
      expect(n).toBeGreaterThan(3);
      void me;
    }
  }, 60000);
});
