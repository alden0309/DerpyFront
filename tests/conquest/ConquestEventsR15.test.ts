// EVENTS (r15): events that rest and don't keep coming round; many matters
// to every trade (the fur trader's lines robbed four different ways); a
// great many new things that happen in a life; and no event ever speaking
// for another player, or anyone asking for money they don't need.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { applyDelta } from "../../src/conquest/engine/Delta";
import {
  FAMILY_REST,
  familyOf,
  MATTER_REST,
  needyFriend,
  ROAD_REST,
  wouldBeg,
} from "../../src/conquest/engine/EventPacing";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { hooks } from "../../src/conquest/engine/Hooks";
import {
  answerLifeEvent,
  LIFE_EVENTS,
  raiseLifeEvent,
} from "../../src/conquest/engine/LifeEvents";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { JOBS } from "../../src/conquest/engine/LifeRules";
import {
  matterCandidates,
  pickMatter,
  VARIANTS,
} from "../../src/conquest/engine/Matters";
import { letterWriter } from "../../src/conquest/engine/MoreEvents";
import { ageOf } from "../../src/conquest/engine/Queries";
import { DRAWN_R15, R15_EVENTS } from "../../src/conquest/engine/R15Events";
import type {
  GameDelta,
  GameState,
  JobKind,
  Life,
} from "../../src/conquest/engine/Types";
import { MATTERS } from "../../src/conquest/engine/WorkEvents";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

// ---------------------------------------------------------------- helpers

/** Make a life work a trade at its home (a rung up, a computer master or none). */
function setJob(life: Life, kind: JobKind, rank = 1, employer = -1): void {
  const def = JOBS[kind];
  life.job = {
    kind,
    rank: Math.min(rank, def.ranks.length - 1),
    prov: life.prov,
    place: def.places[0],
    employer,
    nation: 0,
    army: -1,
    since: 0,
    months: 0,
    away: 0,
    worked: 0,
    awayDays: 0,
  };
}

/** Someone of the town who isn't played. */
function npcHere(g: ConquestGame, life: Life, adult = true): number {
  const played = new Set(g.s.lives.map((l) => l.c));
  const id = (g.s.locals[life.prov] ?? []).find((c) => {
    const x = g.s.chars[c];
    return x?.alive && !played.has(c) && (!adult || ageOf(g.s, x) >= 18);
  });
  if (id === undefined) throw new Error("nobody here");
  return id;
}

/** Every event put to a life while ticking: new ids, their keys and contexts. */
function watch(g: ConquestGame) {
  const seen = new Set<number>();
  const fired: {
    seat: string;
    key: string;
    title: string;
    ctx: Record<string, number>;
    c: number;
  }[] = [];
  return {
    fired,
    step(answer = true) {
      for (const life of g.s.lives) {
        for (const ev of [...life.events]) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id);
            fired.push({
              seat: life.seat,
              key: ev.key,
              title: ev.title,
              ctx: ev.ctx,
              c: ev.c ?? -1,
            });
          }
          if (!answer) continue;
          let err = g.lifeCommand(life.seat, {
            k: "event",
            id: ev.id,
            choice: (g.s.day + ev.id) % ev.choices.length,
          });
          for (let i = 0; err && i < ev.choices.length; i++)
            err = g.lifeCommand(life.seat, {
              k: "event",
              id: ev.id,
              choice: i,
            });
        }
      }
    },
  };
}

const keyOf = (f: { key: string; title: string }) =>
  f.key === "work-task" ||
  f.key === "work-trouble" ||
  f.key === "crime-score" ||
  f.key === "law-collar" ||
  f.key === "law-bribe"
    ? `${f.key}: ${f.title}`
    : f.key;

// ---------------------------------------------------------------- the pace

describe("the pace of events", () => {
  test("an event rests after it comes: four years at home, a year on the road, and its family with it", () => {
    const g = world();
    const life = lifeOf(g);
    life.events = [];
    raiseLifeEvent(g, life, "fever");
    expect(life.cooldowns["ev:fever"]).toBeGreaterThanOrEqual(g.s.day + 1460);
    // Sickness rests as a family: no smallpox drawn while the fever's fresh.
    expect(familyOf("smallpox", "any")).toBe("sickness");
    expect(life.cooldowns["fam:sickness"]).toBe(g.s.day + FAMILY_REST.sickness);
    const weigh = (key: string, pool: "any" | "road" = "any") =>
      hooks.eventWeight.reduce((w, h) => h(g, life, key, pool, {}, w), 1);
    expect(weigh("smallpox")).toBe(0);
    expect(weigh("lottery")).toBeGreaterThan(0);
    // A farmer's droughts and hogs rest together, by the word they begin with.
    expect(familyOf("farm-drought", "any")).toBe("farm");
    // On the road, every event rests a year at least.
    life.events = [];
    raiseLifeEvent(g, life, "trv-bear");
    expect(life.cooldowns["ev:trv-bear"]).toBeGreaterThanOrEqual(
      g.s.day + ROAD_REST,
    );
    expect(ROAD_REST).toBeGreaterThanOrEqual(330);
  });

  test("what's been seen comes less readily: its weight divided by one more than its showings", () => {
    const g = world();
    const life = lifeOf(g);
    const weigh = (key: string) =>
      hooks.eventWeight.reduce((w, h) => h(g, life, key, "any", {}, w), 1);
    expect(weigh("eclipse")).toBe(1);
    life.evSeen = { eclipse: 3 };
    expect(weigh("eclipse")).toBeCloseTo(0.25, 5);
  });

  test("showings survive a save and the deltas; an old save without them loads", () => {
    const g = world();
    const life = lifeOf(g);
    life.events = [];
    raiseLifeEvent(g, life, "lottery");
    expect(life.evSeen?.lottery).toBe(1);
    // The player's copy follows the deltas.
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    life.events = [];
    raiseLifeEvent(g, life, "fortune-teller");
    applyDelta(mine, g.takeDelta());
    expect(mine.lives[0].evSeen).toEqual(life.evSeen);
    // A save and a load.
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    expect(g2.s.lives[0].evSeen).toEqual(life.evSeen);
    // An old save, from before showings were kept, goes on.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const l of old.lives) delete l.evSeen;
    const g3 = new ConquestGame(map, old);
    for (let d = 0; d < 60; d++) g3.tick();
    expect(g3.s.lives[0].c).toBeGreaterThanOrEqual(0);
  });

  test("the same seed tells the same story", () => {
    const run = () => {
      const g = world({ seed: 99 });
      const w = watch(g);
      for (let d = 0; d < 365 * 2; d++) {
        g.tick();
        w.step();
      }
      return w.fired.map((f) => `${f.key}@${f.ctx.c ?? ""}`).join(",");
    };
    expect(run()).toBe(run());
  }, 120_000);
});

// ---------------------------------------------------------------- matters at work

describe("many matters to a trade", () => {
  test("every honest trade has its classic pair and three more; rogues and lawmen their own", () => {
    const by = new Map<string, number>();
    for (const v of VARIANTS)
      for (const j of v.jobs) by.set(j, (by.get(j) ?? 0) + 1);
    for (const k of Object.keys(JOBS) as JobKind[]) {
      if (MATTERS[k]) {
        expect(by.get(k) ?? 0, k).toBeGreaterThanOrEqual(3);
        continue;
      }
      // Crooked trades: big jobs; the law: rounds.
      expect(by.get(k) ?? 0, k).toBeGreaterThanOrEqual(3);
    }
    // Every variant has its own story and two or three choices.
    const keys = new Set<string>();
    for (const v of VARIANTS) {
      expect(keys.has(v.key), v.key).toBe(false);
      keys.add(v.key);
      expect(v.title.length).toBeGreaterThan(3);
      expect(v.body.length).toBeGreaterThan(40);
      expect(v.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("the fur trader's lines: robbed by a rival, raided by a wolverine, soured by a thaw, snared by a neighbour", () => {
    const troubles = VARIANTS.filter(
      (v) => v.jobs.includes("trapper") && v.kind === "trouble",
    ).map((v) => v.title);
    expect(troubles).toEqual(
      expect.arrayContaining([
        "A wolverine on the line",
        "A thaw in the dead of winter",
        "Snares across your line",
      ]),
    );
    expect(MATTERS.trapper!.trouble.body).toMatch(/rival trapper/);
  });

  test("over twenty years at work, no matter comes more than about once a year", () => {
    const g = world({
      start: 1700,
      seed: 15,
      plans: [
        { seat: "t", name: "Trapper", plan: plan({ home: prov("Jamestown") }) },
        { seat: "f", name: "Farmer", plan: plan({ home: prov("Jamestown") }) },
        {
          seat: "r",
          name: "Rogue",
          plan: plan({
            home: prov("Massachusetts Bay"),
            first: "Moll",
            female: true,
          }),
        },
      ],
    });
    const kinds: Record<string, JobKind> = {
      t: "trapper",
      f: "farmer",
      r: "thief",
    };
    const w = watch(g);
    const years = 20;
    for (let d = 0; d < 365 * years; d++) {
      g.tick();
      w.step();
      for (const life of g.s.lives) {
        if (life.watching || life.c < 0) continue;
        life.health = Math.max(life.health, 80);
        if (life.purse < 30) life.purse = 30;
        if (life.crime?.jail) life.crime.jail = null;
        if (life.job?.kind !== kinds[life.seat]) setJob(life, kinds[life.seat]);
        life.travel = null;
        life.prov = life.home;
      }
    }
    for (const seat of ["t", "f", "r"]) {
      const counts = new Map<string, number>();
      for (const f of w.fired.filter((x) => x.seat === seat))
        counts.set(keyOf(f), (counts.get(keyOf(f)) ?? 0) + 1);
      const matters = [...counts].filter(
        ([k]) =>
          k.startsWith("work-") ||
          k.startsWith("rogue-") ||
          k.startsWith("crime-score"),
      );
      // Several different ones, and none more than once a year (their rest is 400 days).
      expect(matters.length, seat).toBeGreaterThanOrEqual(4);
      for (const [k, n] of matters)
        expect(n, `${seat} ${k}`).toBeLessThanOrEqual(
          Math.ceil((years * 365) / MATTER_REST) + 1,
        );
    }
    // The fur trader's robbed lines: about once a year at most, not three times.
    const robbed = w.fired.filter(
      (f) => f.seat === "t" && f.title === "Robbed lines",
    ).length;
    expect(robbed).toBeLessThanOrEqual(years);
  }, 300_000);

  test("when every matter of a trade is resting, a quiet month", () => {
    const g = world();
    const life = lifeOf(g);
    setJob(life, "trapper");
    for (const c of [
      ...matterCandidates(g, life, "task"),
      ...matterCandidates(g, life, "trouble"),
    ])
      life.cooldowns[`wm:${c.id}`] = g.s.day + 100;
    expect(pickMatter(g, life, "trouble")).toBeNull();
    expect(pickMatter(g, life, "task")).toBeNull();
  });

  test("each matter's choices say what they come to, and every one can be taken", () => {
    const g = world({ seed: 3 });
    const life = lifeOf(g);
    for (const v of VARIANTS) {
      for (let i = 0; i < v.choices.length; i++) {
        life.events = [];
        life.purse = 100;
        life.health = 90;
        if (life.crime) life.crime.jail = null;
        setJob(life, v.jobs[0], 1);
        raiseLifeEvent(g, life, v.key, { n: 0, g: 1 });
        const ev = life.events.find((e) => e.key === v.key);
        expect(ev, v.key).toBeDefined();
        expect(ev!.body).not.toMatch(/\{(here|boss)\}/);
        expect(ev!.choices[i].tip.length, `${v.key} ${i}`).toBeGreaterThan(5);
        life.journal = [];
        expect(answerLifeEvent(g, life, ev!.id, i), `${v.key} ${i}`).toBeNull();
        expect(life.journal.length, `${v.key} ${i}`).toBeGreaterThan(0);
      }
    }
    expect(g.s.chars[life.c].alive).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------- many more

describe("a great many more things happen", () => {
  test("more than a hundred new events, across a life's times, its family, the town, the frontier, the peoples, the weather, the road and the sea", () => {
    expect(R15_EVENTS.length).toBeGreaterThanOrEqual(200);
    expect(DRAWN_R15.length).toBeGreaterThanOrEqual(90);
    const prefixes = new Set(DRAWN_R15.map((e) => e.key.split("-")[0]));
    for (const p of [
      "youth",
      "young",
      "age",
      "kin",
      "town",
      "port",
      "role",
      "front",
      "nat",
      "wthr",
      "way",
      "voy",
    ])
      expect(prefixes.has(p), p).toBe(true);
    expect(DRAWN_R15.some((e) => e.pool === "road")).toBe(true);
    expect(DRAWN_R15.some((e) => e.pool === "sea")).toBe(true);
    // All in the game's list, none twice.
    const all = new Map<string, number>();
    for (const e of LIFE_EVENTS) all.set(e.key, (all.get(e.key) ?? 0) + 1);
    for (const e of R15_EVENTS) expect(all.get(e.key), e.key).toBe(1);
  });

  test("every new event can be told, and every choice taken", () => {
    const g = world({ seed: 5 });
    const life = lifeOf(g);
    const c = npcHere(g, life);
    const ctx = { c };
    const s = (v: unknown) =>
      typeof v === "function"
        ? String((v as (...a: unknown[]) => unknown)(g, life, ctx))
        : String(v);
    for (const def of DRAWN_R15) {
      expect(s(def.title).length, def.key).toBeGreaterThan(2);
      expect(def.body(g, life, ctx).length, def.key).toBeGreaterThan(30);
      expect(def.choices.length, def.key).toBeGreaterThanOrEqual(2);
      for (const ch of def.choices) {
        expect(s(ch.label).length).toBeGreaterThan(2);
        expect(s(ch.tip).length).toBeGreaterThan(2);
        for (const pass of [true, false]) {
          life.purse = 200;
          life.health = 90;
          ch.apply(g, life, ctx, pass);
        }
      }
    }
    expect(g.s.chars[life.c].alive).toBe(true);
  }, 60_000);

  test("in a long life they come round: a colonist, a native and a child see many of them", () => {
    const g = world({
      start: 1700,
      seed: 21,
      plans: [
        {
          seat: "a",
          name: "Town",
          plan: plan({ home: prov("Massachusetts Bay"), age: 30 }),
        },
        {
          seat: "n",
          name: "Native",
          plan: plan({
            origin: "haudenosaunee",
            religion: "native",
            home: prov("Mohawk"),
            background: "hunter",
            first: "Tekakwitha",
            family: "of the Turtle clan",
            female: true,
          }),
        },
      ],
    });
    const w = watch(g);
    for (let d = 0; d < 365 * 12; d++) {
      g.tick();
      w.step();
      for (const life of g.s.lives) {
        life.health = Math.max(life.health, 70);
        if (life.purse < 20) life.purse = 20;
      }
    }
    const drawn = new Set(DRAWN_R15.map((e) => e.key));
    const got = new Set(
      w.fired.filter((f) => drawn.has(f.key)).map((f) => f.key),
    );
    expect(got.size).toBeGreaterThanOrEqual(25);
    expect([...got].some((k) => k.startsWith("nat-"))).toBe(true);
    expect([...got].some((k) => k.startsWith("town-"))).toBe(true);
  }, 300_000);
});

// ---------------------------------------------------------------- other players

const NPC_SPEAKS = new Set([
  "friend-loan",
  "friend-debt",
  "friend-visit",
  "letter-friend",
  "letter-kin",
  "letter-patron",
  "nemesis-sworn",
  "nemesis-plot",
  "rival-insult",
  "rival-challenge",
  "mentor-lesson",
  "spouse-quarrel",
  "spouse-surprise",
  "lover-scandal",
  "child-sick",
  "child-trade",
  "child-match",
  "child-apprentice",
  "boss-where",
  "boss-dismissed",
  "boss-promotion",
  "commission-offer",
  "work-shirk",
]);

describe("no event speaks for another player", () => {
  test("a friend who's a player is never the friend in need; a rich friend doesn't beg; a poor one may", () => {
    const g = world({
      plans: [
        { seat: "a", name: "Alden", plan: plan() },
        {
          seat: "b",
          name: "Pat",
          plan: plan({ first: "Patience", family: "Cole", female: true }),
        },
      ],
    });
    const A = lifeOfSeat(g.s, "a")!;
    const B = lifeOfSeat(g.s, "b")!;
    A.purse = 500;
    B.purse = 0;
    A.ties[B.c] = "friend";
    B.ties[A.c] = "friend";
    const loan = LIFE_EVENTS.find((e) => e.key === "friend-loan")!;
    const debt = LIFE_EVENTS.find((e) => e.key === "friend-debt")!;
    // Pat is broke, but Pat is a player: Alden is never told she's begging.
    expect(needyFriend(g.s, A, 8)).toBeUndefined();
    expect(loan.when!(g, A)).toBeNull();
    expect(debt.when!(g, A)).toBeNull();
    // And Alden, rich, is never the one who comes begging to Pat.
    B.purse = 50;
    expect(wouldBeg(g.s, g.s.chars[A.c], 8)).toBe(false);
    expect(loan.when!(g, B)).toBeNull();
    // A merchant friend has sixty to his name: he doesn't beg eight.
    const others = Object.values(g.s.chars).filter(
      (c) =>
        c?.alive &&
        !c.abroad &&
        c.id !== A.c &&
        c.id !== B.c &&
        ageOf(g.s, c) >= 18,
    );
    const rich = others.find(
      (c) => c.role === "merchant" || c.role === "planter",
    );
    const poor = others.find((c) => !c.role && wouldBeg(g.s, c, 8));
    expect(rich && poor).toBeTruthy();
    A.ties = { [B.c]: "friend", [rich!.id]: "friend" };
    expect(loan.when!(g, A)).toBeNull();
    // A poor one might.
    A.ties[poor!.id] = "friend";
    expect(loan.when!(g, A)).toEqual({ c: poor!.id });
    // Letters from far off: never in a player's hand.
    B.home = B.prov = prov("Plymouth");
    g.s.chars[B.c].home = B.home;
    A.ties = { [B.c]: "friend" };
    for (let i = 0; i < 300; i++)
      expect(letterWriter(g, A)?.from.id).not.toBe(B.c);
  });

  test("over years together, no event names, shows or speaks for the other players", () => {
    const g = world({
      start: 1700,
      seed: 7,
      plans: [
        { seat: "a", name: "Alden", plan: plan({ home: prov("Jamestown") }) },
        {
          seat: "b",
          name: "Pat",
          plan: plan({ first: "Patience", family: "Cole", female: true }),
        },
        {
          seat: "c",
          name: "Hal",
          plan: plan({ first: "Hal", family: "Moore", age: 40 }),
        },
      ],
    });
    const [A, B, C] = ["a", "b", "c"].map((s) => lifeOfSeat(g.s, s)!);
    // Every tie there is: friends, rivals, a nemesis, a mentor, lovers; Alden
    // and Pat married; Hal, Pat's father; Hal employs Alden.
    A.ties[B.c] = "friend";
    B.ties[A.c] = "lover";
    A.ties[C.c] = "rival";
    C.ties[A.c] = "nemesis";
    B.ties[C.c] = "mentor";
    C.ties[B.c] = "friend";
    g.s.chars[A.c].spouse = B.c;
    g.s.chars[B.c].spouse = A.c;
    g.s.chars[C.c].children.push(B.c);
    g.s.chars[B.c].father = C.c;
    A.patron = C.c;
    setJob(A, "clerk", 1, C.c);
    A.purse = 400;
    B.purse = 0;
    const w = watch(g);
    const played = new Set([A.c, B.c, C.c]);
    for (let d = 0; d < 365 * 6; d++) {
      g.tick();
      w.step();
      for (const life of g.s.lives) {
        life.health = Math.max(life.health, 70);
        // Rich Alden never asks; broke Pat is still never asked of in his name.
        if (life === B) B.purse = 0;
      }
    }
    expect(w.fired.length).toBeGreaterThan(30);
    for (const f of w.fired) {
      const me = lifeOfSeat(g.s, f.seat)!;
      const others = [...played].filter((c) => c !== me.c);
      // Nobody stood opposite in a scene who didn't play it.
      if (!f.key.startsWith("p2p-")) {
        expect(others.includes(f.c), `${f.seat} ${f.key}`).toBe(false);
        for (const k of ["c", "m", "l", "k", "c2"])
          if (NPC_SPEAKS.has(f.key) || DRAWN_R15.some((e) => e.key === f.key))
            expect(others.includes(f.ctx[k]), `${f.seat} ${f.key} ${k}`).toBe(
              false,
            );
      }
    }
    // And no letter came from another player's character (none of them wrote any).
    for (const life of g.s.lives)
      for (const l of life.post ?? [])
        if (l.to === life.c) expect(others(life).includes(l.from)).toBe(false);
    function others(life: Life) {
      return [...played].filter((c) => c !== life.c);
    }
  }, 300_000);

  test("a player who employs you writes no letters and catches nobody idling in an event", () => {
    const g = world({
      plans: [
        { seat: "a", name: "Alden", plan: plan() },
        {
          seat: "h",
          name: "Hal",
          plan: plan({ first: "Hal", family: "Moore" }),
        },
      ],
    });
    const A = lifeOfSeat(g.s, "a")!;
    const H = lifeOfSeat(g.s, "h")!;
    setJob(A, "clerk", 0, H.c);
    A.events = [];
    // Three weeks away: no letter in Hal's hand, just a note in the journal.
    A.job!.awayDays = 20;
    A.prov = g.map.provinces[A.job!.prov].nb[0][0];
    g.tick();
    expect(A.events.some((e) => e.key === "boss-where")).toBe(false);
    expect(A.journal.some((j) => /three weeks/i.test(j.text))).toBe(true);
    // A matter at work names "the foreman", never Hal, and shows nobody.
    A.prov = A.job!.prov;
    A.job!.awayDays = 0;
    A.events = [];
    raiseLifeEvent(g, A, "work-task", { t: 0 });
    const ev = A.events[0];
    expect(ev.body).not.toContain(g.s.chars[H.c].first);
    expect(ev.c).toBe(-1);
  });
});

// ---------------------------------------------------------------- through the server

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

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

describe("two friends in company, through the rooms server", () => {
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

  test("Beatrice is never told that rich Alden came begging, nor sees him in any scene he didn't play", async () => {
    const JT = prov("Jamestown");
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
    const game = rooms.rooms.get(l.code)!.game!;
    const A = lifeOfSeat(game.s, hg.you)!;
    const B = lifeOfSeat(game.s, fg.you)!;
    // Friends, both ways; Alden rich, Beatrice broke.
    A.ties[B.c] = "friend";
    B.ties[A.c] = "friend";
    A.purse = 600;
    B.purse = 1;
    const w = watch(game);
    for (let month = 0; month < 36; month++) {
      for (let d = 0; d < 30; d++) {
        game.tick();
        w.step();
        A.purse = Math.max(A.purse, 600);
        B.purse = Math.min(B.purse, 1);
        A.health = B.health = 90;
      }
      // Something to send: the server flushes what changed.
      expect(
        await friend.cmd({ k: "will", share: month % 2 === 0 }),
      ).toBeNull();
    }
    // What Beatrice's game was sent: none of her events have Alden in them.
    const seen = friend.state();
    const bInView = seen.lives.find((x) => x.seat === fg.you)!;
    expect(bInView.c).toBe(B.c);
    const toB = w.fired.filter((f) => f.seat === fg.you);
    expect(toB.length).toBeGreaterThan(5);
    for (const f of toB) {
      expect(f.c, f.key).not.toBe(A.c);
      expect(f.ctx.c, f.key).not.toBe(A.c);
    }
    expect(
      toB.some((f) => f.key === "friend-loan" || f.key === "friend-debt"),
    ).toBe(false);
    // And in every delta she was sent, no event of hers named him.
    for (const m of friend.messages) {
      if (m.t !== "d") continue;
      const d = m.d as GameDelta;
      const mine = d.lives?.[fg.you] ?? d.lifePatch?.[fg.you];
      for (const ev of (mine as Life | undefined)?.events ?? []) {
        expect(ev.c ?? -1).not.toBe(A.c);
        expect(ev.ctx.c).not.toBe(A.c);
      }
    }
  }, 300_000);
});
