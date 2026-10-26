// CQACH (r22): over a hundred achievements, in two kinds. Every new
// condition, checked on the state the engine keeps (each set up, then
// earned, never before); the counts kept on the way (the trades worked, the
// duels and other moments, the expeditions home, the cards); the add-ons'
// only for their owners; this game's achievements paying in the game on any
// difficulty, held to the time played; overall ones only on Hard; old
// saves loading and the old achievements kept as they were.

import { describe, expect, test } from "vitest";
import {
  ACHIEVEMENT_BY_KEY,
  ACHIEVEMENTS,
  achievementsDaily,
  achievementsFor,
  checkAchievements,
  countAch,
  countsOverall,
  gameAchievements,
  gameCoins,
  OVERALL_DIFFICULTY,
  setCampaignOwned,
} from "../../src/conquest/engine/Achievements";
import { presentAt } from "../../src/conquest/engine/Areas";
import {
  cardTables,
  handTotal,
  isNatural,
} from "../../src/conquest/engine/CardsCore";
import {
  GAME_ACH_LINE,
  lifeCoins,
  lineCap,
  linesDue,
} from "../../src/conquest/engine/Coins";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { milestone } from "../../src/conquest/engine/LifeCore";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { PLAY_PAY } from "../../src/conquest/engine/LifeRules";
import type {
  Boat,
  Difficulty,
  ExpedPast,
  Firm,
  GameState,
  Life,
  Property,
} from "../../src/conquest/engine/Types";
import { DIFFICULTIES } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

/** The sixty from before this round, and their coins: kept as they were. */
const OLD: Record<string, number> = {
  "first-job": 1,
  promoted: 2,
  "top-rung": 5,
  business: 4,
  people: 2,
  earned: 2,
  house: 2,
  mansion: 4,
  land: 2,
  married: 2,
  child: 2,
  quiverful: 4,
  heir: 4,
  dynasty: 6,
  "old-age": 4,
  letter: 1,
  tongue: 2,
  tongues: 5,
  friends: 1,
  host: 2,
  renown: 2,
  famous: 5,
  patron: 2,
  cause: 2,
  "dice-last": 2,
  "dice-full": 2,
  "local-office": 2,
  assembly: 4,
  council: 5,
  governor: 6,
  founder: 6,
  rising: 6,
  purse: 2,
  fortune: 6,
  venture: 2,
  carriage: 2,
  "pay-dirt": 4,
  "sea-legs": 1,
  boat: 2,
  ship: 5,
  far: 2,
  europe: 4,
  expedition: 5,
  battle: 4,
  duel: 4,
  company: 4,
  scars: 1,
  outlaw: 2,
  "war-honours": 4,
  healer: 2,
  "go-between": 4,
  gifts: 2,
  "sachem-voice": 4,
  harvest: 1,
  "winter-road": 2,
  storm: 2,
  decade: 2,
  "half-century": 5,
  ambition: 2,
  "1776": 6,
};

// ---------------------------------------------------------------- set-ups

const base = world({ seed: 7 });
const base76 = world({ seed: 7, start: 1776 });

/** A fresh copy of a world (cheaper than making one). */
function copy(from: ConquestGame): ConquestGame {
  return new ConquestGame(
    from.map,
    JSON.parse(JSON.stringify(from.state)) as GameState,
  );
}

const boat = (o: Partial<Boat> = {}): Boat => ({
  id: 900,
  kind: "sloop",
  name: "Swallow",
  prov: prov("Jamestown"),
  condition: 90,
  crew: 6,
  morale: 60,
  use: "idle",
  bought: 0,
  ...o,
});

const biz = (
  id: number,
  level = 1,
  extra: Partial<Property> = {},
): Property => ({
  id,
  kind: "business",
  prov: prov("Jamestown"),
  level,
  job: "craftsman",
  place: "market",
  hands: [],
  since: 0,
  name: `Shop ${id}`,
  ...extra,
});

const firm = (l: Life, o: Partial<Firm> & { drawn?: number } = {}): Firm =>
  ({
    id: 800 + (o.id ?? 0),
    name: "Drackley & Co.",
    hold: "biz",
    biz: null,
    prov: prov("Jamestown"),
    partners: [
      {
        c: l.c,
        share: 50,
        role: "managing",
        capital: 20,
        since: 0,
        drawn: o.drawn ?? 0,
      },
    ],
    chest: 0,
    debt: 0,
    rule: "majority",
    lawyer: -1,
    drafted: -1,
    founded: 0,
    status: "trading",
    cargo: null,
    books: [],
    decisions: [],
    lines: [],
    ...o,
  }) as Firm;

const past = (l: Life, o: Partial<ExpedPast> = {}): ExpedPast => ({
  id: 700,
  kind: "discover",
  n: 0,
  by: l.seat,
  leader: -1,
  target: prov("Jamestown"),
  start: 0,
  end: 0,
  result: "won",
  note: "",
  members: [],
  ...o,
});

function addPast(g: ConquestGame, list: ExpedPast[]): void {
  g.s.exped ??= { list: [], past: [], asks: [], reprisals: [] };
  g.s.exped.past.push(...list);
}

const otherChars = (g: ConquestGame, l: Life, n: number) =>
  Object.values(g.s.chars)
    .filter((c) => c.id !== l.c && !l.line.includes(c.id))
    .slice(0, n);

const duel = (g: ConquestGame, l: Life, text: string, good = true) =>
  milestone(g, l, "duel", text, l.prov, good ? { tone: "good" } : {});

type Setup = (g: ConquestGame, l: Life) => void;

/** How each new achievement is set up (what the engine's systems would have done). */
const SETUP: Record<string, Setup> = {
  "trades-five": (g, l) => {
    for (const k of [
      "farmer",
      "clerk",
      "craftsman",
      "sailor",
      "law",
    ] as const) {
      l.job!.kind = k;
      l.job!.rank = 0;
      checkAchievements(g, l);
    }
  },
  "two-trades": (g, l) => {
    l.job!.kind = "farmer";
    l.job!.rank = 2;
    checkAchievements(g, l);
    l.job!.kind = "clerk";
    l.job!.rank = 2;
  },
  general: (g, l) => {
    l.job!.kind = "soldier";
    l.job!.rank = 7;
  },
  "underworld-top": (g, l) => {
    l.job!.kind = "fence";
    l.job!.rank = 3;
  },
  "three-concerns": (g, l) => {
    l.property = [biz(1), biz(2), biz(3)];
  },
  "great-concern": (g, l) => {
    l.property = [biz(1, 3)];
  },
  manager: (g, l) => {
    l.property = [biz(1, 1, { biz: { mgr: 4 } })];
  },
  articles: (g, l) => {
    g.s.partners = { firms: [firm(l)], offers: [] };
  },
  "trading-company": (g, l) => {
    g.s.partners = {
      firms: [firm(l, { hold: "company", co: { made: 3 } as never })],
      offers: [],
    };
  },
  "privateer-company": (g, l) => {
    g.s.partners = { firms: [firm(l, { hold: "privateer" })], offers: [] };
  },
  dividends: (g, l) => {
    g.s.partners = {
      firms: [firm(l, { drawn: 60 }), firm(l, { id: 1, drawn: 40 })],
      offers: [],
    };
  },
  fleet: (g, l) => {
    l.boats = [boat({ id: 1 }), boat({ id: 2 }), boat({ id: 3 })];
  },
  "fitted-out": (g, l) => {
    l.boats = [boat({ refits: ["copper", "sails", "guns", "cabins"] })];
  },
  "known-ship": (g, l) => {
    l.boats = [boat({ rep: 80 })];
  },
  "ten-voyages": (g, l) => {
    l.boats = [boat({ voyages: 10 })];
  },
  "ships-company": (g, l) => {
    const [c] = otherChars(g, l, 1);
    l.boats = [
      boat({
        kind: "schooner",
        roster: {
          hires: ["captain", "mate", "navigator", "surgeon", "bosun"].map(
            (role, i) => ({
              id: i + 1,
              c: c.id,
              role,
              pay: 3,
              since: 0,
              roleSince: 0,
              loyalty: 60,
            }),
          ),
        },
      }),
    ];
  },
  marque: (g, l) => {
    l.boats = [boat({ marque: { nation: 0, day: 0 } })];
  },
  prize: (g, l) =>
    milestone(g, l, "prize", "The Swallow took a merchantman off Havana"),
  "prizes-five": (g, l) => {
    for (let i = 0; i < 5; i++)
      milestone(g, l, "prize", `The Swallow took a prize (${i})`);
  },
  "lost-ship": (g, l) =>
    milestone(g, l, "wreck", "The Swallow foundered in a hurricane", l.prov, {
      quiet: true,
      tone: "bad",
    }),
  "far-sixty": (g, l) => {
    l.visited = map.provinces.slice(0, 60).map((_, i) => i);
  },
  "old-salt": (g, l) => countAch(g, l, "sea", 100),
  capitals: (g, l) => {
    l.visited = g.s.nations
      .filter((n) => n.capital >= 0)
      .slice(0, 5)
      .map((n) => n.capital);
  },
  pathfinder: (g, l) => {
    addPast(g, [past(l, { end: g.s.day - 1 })]);
    achievementsDaily(g, l);
  },
  "three-expeditions": (g, l) => {
    addPast(g, [
      past(l, { id: 1, end: g.s.day - 3 }),
      past(l, { id: 2, end: g.s.day - 2, by: "", leader: l.c }),
      past(l, { id: 3, end: g.s.day - 1 }),
    ]);
    achievementsDaily(g, l);
  },
  outpost: (g, l) => {
    addPast(g, [past(l, { kind: "outpost", end: g.s.day - 1 })]);
    achievementsDaily(g, l);
  },
  "twice-wed": (g, l) => {
    l.tally.marriages = 2;
  },
  houseful: (g, l) => {
    l.tally.children = 10;
  },
  grandchild: (g, l) => {
    const [a, b] = otherChars(g, l, 2);
    meOf(g.s, l)!.children = [a.id];
    a.children = [b.id];
  },
  degree: (g, l) => {
    meOf(g.s, l)!.edu = { now: null, past: [], pts: {}, degree: "harvard" };
  },
  "five-generations": (g, l) => {
    l.tally.generations = 5;
  },
  fourscore: (g, l) => {
    meOf(g.s, l)!.born = g.s.day - 81 * 365;
  },
  "dice-regular": (g, l) => countAch(g, l, "dice-tables", 20),
  "dice-five": (g, l) => {
    for (let i = 0; i < 5; i++)
      milestone(g, l, "dice", `Won a pot of 12 coins at Liar's dice (${i})`);
  },
  "big-pot": (g, l) => countAch(g, l, "dice-big"),
  natural: (g, l) => countAch(g, l, "cards-natural"),
  "card-sharp": (g, l) => countAch(g, l, "cards-won", 10),
  "broke-bank": (g, l) => countAch(g, l, "cards-broke"),
  "elections-three": (g, l) => {
    l.tally.elections = 3;
  },
  speaker: (g, l) => {
    const p = (g.s.power ??= {
      cabinets: {},
      trials: [],
      papers: [],
      sway: {},
      dunned: {},
    });
    p.cabinets[0] = { ...(p.cabinets[0] ?? {}), speaker: l.c } as never;
  },
  "whole-road": (g, l) => {
    l.chair = {
      steps: {
        name: 1,
        county: 2,
        court: 3,
        house: 4,
        council: 5,
        lt: 6,
        governor: 7,
      },
    };
  },
  renewed: (g, l) => {
    const n = g.s.nations[0];
    n.ruler = l.c;
    n.chair = { gov: l.c, terms: 2 } as never;
  },
  greatness: (g, l) => {
    l.chair = { great: { hall: 1, coach: 2, portrait: 3 } };
  },
  college: (g, l) => {
    l.chair = { great: { college: 1 } };
  },
  "new-nation": (g, l) =>
    milestone(
      g,
      l,
      "office",
      "Proclaimed the Republic of Roanoke, its first president",
    ),
  declared: (g, l) => {
    g.s.nations[0].desk = {
      rev: { day: g.s.day, by: l.c, holds: [], sides: {} },
    };
  },
  patriot: (g, l) => {
    g.s.nations[0].desk = {
      rev: { day: g.s.day, by: -1, holds: [], sides: { [l.seat]: "patriot" } },
    };
  },
  loyal: (g, l) => {
    g.s.nations[0].desk = {
      rev: { day: g.s.day, by: -1, holds: [], sides: { [l.seat]: "loyal" } },
    };
  },
  liberty: (g, l) =>
    milestone(
      g,
      l,
      "rising",
      "Stood with the patriots: Virginia won its freedom",
    ),
  "duels-three": (g, l) => {
    duel(g, l, "Won a duel against Tom Fell with swords");
    duel(g, l, "Ned Hale ran from your duel to the death");
    duel(g, l, "Won a duel against Kit Dale with pistols: Kit Dale died of it");
  },
  honour: (g, l) =>
    duel(g, l, "Met Tom Fell on the field: you both fired into the air"),
  "sword-pistol": (g, l) => {
    duel(g, l, "Won a duel against Tom Fell with swords");
    duel(g, l, "Won a duel against Ned Hale with pistols");
  },
  "to-the-death": (g, l) =>
    duel(g, l, "Killed Tom Fell in a duel to the death, with pistols"),
  "r76-commission": (g, l) => {
    l.dlc = { campaign1776: true };
    l.r76 = { commission: { by: "congress", day: g.s.day, rank: 3 } };
  },
  "r76-battles": (g, l) => {
    l.dlc = { campaign1776: true };
    l.r76 = { fought: ["long-island", "trenton", "princeton"] };
  },
  "r76-yorktown": (g, l) => {
    l.dlc = { campaign1776: true };
    l.r76 = { fought: ["yorktown"] };
  },
  "r76-spy": (g, l) => {
    l.dlc = { campaign1776: true };
    l.r76 = { reports: 5 };
  },
  "r76-turncoat": (g, l) => {
    l.dlc = { campaign1776: true };
    l.r76 = { turned: 1 };
  },
  "r76-peace": (g, l) => {
    l.dlc = { campaign1776: true };
    g.s.day = g.s.endDay;
  },
  "legend-heard": (g, l) => {
    l.dlc = { legends: true };
    l.legends = {
      list: [
        {
          key: "fountain",
          heard: 1,
          from: "the tavern",
          step: 0,
          tries: 0,
          next: 0,
        },
      ],
    };
  },
  "legend-found": (g, l) => {
    l.dlc = { legends: true };
    l.legends = {
      list: [
        {
          key: "roanoke",
          heard: 1,
          from: "x",
          step: 3,
          tries: 0,
          next: 0,
          found: 9,
        },
      ],
    };
  },
  "legend-three": (g, l) => {
    l.dlc = { legends: true };
    l.legends = {
      list: ["roanoke", "cibola", "madoc"].map((key) => ({
        key,
        heard: 1,
        from: "x",
        step: 3,
        tries: 0,
        next: 0,
        found: 9,
      })),
    };
  },
  "legend-waters": (g, l) => {
    l.dlc = { legends: true };
    l.legends = { list: [], waters: 40 };
  },
  "legend-keeper": (g, l) => {
    l.dlc = { legends: true };
    l.legends = { list: [], kept: { kituwah: 9 } };
  },
};

/** The 1776 campaign's own world for the peace (the others don't need it). */
const IN_1776 = new Set(["r76-peace"]);

// CQTUT (r26): the first life's (an account's own) is tested with the lessons.
const NEW = ACHIEVEMENTS.filter((a) => !(a.key in OLD) && !a.account);

// ---------------------------------------------------------------- the list

describe("the new achievements (CQACH r22)", () => {
  test("at least forty new, across what the game now has; some hard, some rare, a few secret", () => {
    expect(NEW.length).toBeGreaterThanOrEqual(40);
    expect(NEW.length).toBe(64);
    const groups = new Set(NEW.map((a) => a.group));
    for (const g of [
      "work",
      "business",
      "ships",
      "travel",
      "home",
      "tavern",
      "office",
      "revolution",
      "arms",
      "campaign",
      "legends",
    ])
      expect(groups.has(g as never), g).toBe(true);
    expect(NEW.filter((a) => a.tier === "hard").length).toBeGreaterThanOrEqual(
      5,
    );
    expect(NEW.filter((a) => a.tier === "rare").length).toBeGreaterThanOrEqual(
      5,
    );
    const secret = NEW.filter((a) => a.secret).length;
    expect(secret).toBeGreaterThanOrEqual(3);
    expect(secret).toBeLessThanOrEqual(8);
    // The add-ons' are marked so, and only theirs.
    for (const a of ACHIEVEMENTS)
      expect(!!a.dlc, a.key).toBe(
        a.group === "campaign" || a.group === "legends",
      );
    // Every new one has a set-up here.
    expect(Object.keys(SETUP).sort()).toEqual(NEW.map((a) => a.key).sort());
  });

  test("the old sixty are kept as they were: the same keys and coins", () => {
    for (const [key, coins] of Object.entries(OLD))
      expect(ACHIEVEMENT_BY_KEY.get(key)?.coins, key).toBe(coins);
    // (Not in Object.keys's order: it puts "1776" first.)
    expect(
      ACHIEVEMENTS.slice(0, 60)
        .map((a) => a.key)
        .sort(),
    ).toEqual(Object.keys(OLD).sort());
    expect(ACHIEVEMENTS[59].key).toBe("1776");
  });

  test.each(NEW.map((a) => [a.key]))(
    "%s: not earned until its condition holds, then earned",
    (key) => {
      const g = copy(IN_1776.has(key) ? base76 : base);
      const l = lifeOf(g);
      checkAchievements(g, l);
      expect(l.achieved?.[key], "before").toBeUndefined();
      SETUP[key](g, l);
      checkAchievements(g, l);
      expect(l.achieved?.[key], "after").toBe(g.s.day);
      // Noted in the journal, once.
      const def = ACHIEVEMENT_BY_KEY.get(key)!;
      expect(
        l.journal.filter((j) =>
          j.text.startsWith(`Achievement earned: ${def.name}.`),
        ).length,
      ).toBe(1);
    },
  );

  test("the add-ons' come only to their owners (the server marks the life)", () => {
    for (const a of NEW.filter((x) => x.dlc)) {
      const g = copy(IN_1776.has(a.key) ? base76 : base);
      const l = lifeOf(g);
      SETUP[a.key](g, l);
      l.dlc = {};
      checkAchievements(g, l);
      expect(l.achieved?.[a.key], a.key).toBeUndefined();
    }
    // The server's mark for the campaign, beside Legends'.
    const g = copy(base76);
    const l = lifeOf(g);
    setCampaignOwned(g, l.seat, true);
    expect(l.dlc?.campaign1776).toBe(true);
    SETUP["r76-spy"](g, l);
    checkAchievements(g, l);
    expect(l.achieved?.["r76-spy"]).toBeDefined();
    // The list a player sees: the add-ons' only if owned.
    const n = ACHIEVEMENTS.filter((a) => a.dlc).length;
    expect(achievementsFor({}).length).toBe(ACHIEVEMENTS.length - n);
    expect(achievementsFor({ campaign1776: true, legends: true }).length).toBe(
      ACHIEVEMENTS.length,
    );
    expect(
      achievementsFor({ legends: true }).filter(
        (a) => a.dlc === "campaign_1776",
      ),
    ).toEqual([]);
  });

  test("breaking with the crown in the 1776 campaign is the campaign's own, not these", () => {
    const g = copy(base76);
    const l = lifeOf(g);
    SETUP.patriot(g, l);
    SETUP.liberty(g, l);
    checkAchievements(g, l);
    expect(l.achieved?.patriot).toBeUndefined();
    expect(l.achieved?.liberty).toBeUndefined();
  });
});

// ---------------------------------------------------------------- the counts kept

describe("the counts the new ones wait on (CQACH r22)", () => {
  test("duels: the story's moments as Duels.ts writes them, each counted once", () => {
    const g = copy(base);
    const l = lifeOf(g);
    duel(g, l, "Won a duel against Tom Fell with swords");
    duel(g, l, "Killed Kit Dale in a duel to the death, with pistols");
    duel(g, l, "Ned Hale ran from your duel to the death");
    duel(g, l, "Met Ann Low on the field, and made it up");
    duel(g, l, "Lost a duel to Tom Fell, with swords", false);
    duel(
      g,
      l,
      "Fought Tom Fell with swords: neither had the better of it",
      false,
    );
    expect(l.achCount).toMatchObject({
      "duel-won": 3,
      "duel-swords": 1,
      "duel-pistols": 1,
      "duel-death": 1,
      "duel-honour": 1,
    });
    // A secret moment isn't counted.
    milestone(g, l, "duel", "Won a duel against Tom Fell with swords", l.prov, {
      tone: "good",
      sec: true,
    });
    expect(l.achCount?.["duel-won"]).toBe(3);
    // The old "Satisfaction" is earned by the count, too.
    checkAchievements(g, l);
    expect(l.achieved?.duel).toBeDefined();
  });

  test("the trades worked, and those climbed to the third rung", () => {
    const g = copy(base);
    const l = lifeOf(g);
    checkAchievements(g, l);
    expect(l.achCount?.["job:farmer"]).toBe(1);
    expect(l.achCount?.["rung:farmer"]).toBeUndefined();
    l.job!.rank = 2;
    checkAchievements(g, l);
    checkAchievements(g, l);
    expect(l.achCount?.["rung:farmer"]).toBe(1);
    expect(l.achCount?.["job:farmer"]).toBe(1);
  });

  test("expeditions home: yours that did well, counted once, a day late, never another's", () => {
    const g = copy(base);
    const l = lifeOf(g);
    const day = g.s.day;
    addPast(g, [
      past(l, { id: 1, end: day - 5 }),
      past(l, { id: 2, end: day - 5, result: "failed" }),
      past(l, { id: 3, end: day - 4, by: "s2" }),
      past(l, { id: 4, end: day, kind: "outpost" }),
    ]);
    achievementsDaily(g, l);
    expect(l.achCount?.["exped-won"]).toBe(1);
    expect(l.achCount?.["exped-outpost"]).toBeUndefined();
    achievementsDaily(g, l);
    expect(l.achCount?.["exped-won"]).toBe(1);
    // The next day, the one home today.
    ticks(g, 1);
    expect(l.achCount?.["exped-won"]).toBe(2);
    expect(l.achCount?.["exped-outpost"]).toBe(1);
    ticks(g, 3);
    expect(l.achCount?.["exped-won"]).toBe(2);
    expect(l.achieved?.outpost).toBeDefined();
  });

  test("vingt-et-un: hands won and naturals counted as the cards are settled", () => {
    const { g, life, folk } = tavern();
    const err = g.lifeCommand(life.seat, {
      k: "cards",
      act: "open",
      stake: 2,
      ask: folk.map((c) => c.id),
    });
    expect(err).toBeNull();
    const t = cardTables(g.s).find((x) => x.status !== "done")!;
    let won = 0;
    let naturals = 0;
    for (let h = 0; h < 20 && t.status !== "done"; h++) {
      expect(cards(g, life, { act: "deal", id: t.id })).toBeNull();
      const me = t.seats.find((x) => x.c === life.c)!;
      for (let i = 0; i < 10 && t.status === "hand" && me.state === "play"; i++)
        cards(g, life, {
          act: handTotal(me.cards).total < 15 ? "draw" : "stand",
          id: t.id,
        });
      expect(t.status).not.toBe("hand");
      const settle = t.acts.filter((a) => a.k === "settle").pop()!;
      expect(settle.hand).toBe(t.hand);
      if ((settle.pay![life.c] ?? 0) > 0) won++;
      const mine = settle.hands![life.c];
      if (mine && isNatural(mine)) naturals++;
    }
    expect(won).toBeGreaterThan(0);
    expect(life.achCount?.["cards-won"] ?? 0).toBe(won);
    expect(life.achCount?.["cards-natural"] ?? 0).toBe(naturals);
    const net = t.seats.find((x) => x.c === life.c)!.net;
    expect(cards(g, life, { act: "leave", id: t.id })).toBeNull();
    expect(life.achCount?.["cards-broke"] ?? 0).toBe(net >= 20 ? 1 : 0);
  });

  test("the counts are the same in the same world: deterministic, and the world's luck doesn't move", () => {
    const run = () => {
      const g = copy(base);
      ticks(g, 400);
      const l = lifeOf(g);
      return {
        ach: l.achieved,
        counts: l.achCount,
        rng: g.s.rng,
        day: g.s.day,
      };
    };
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------- pay

describe("this game's achievements pay in the game; overall ones only on Hard (CQACH r22)", () => {
  test("each pays its account coins times PLAY_PAY.achievementTimes, as a line of the game's coins, on any difficulty", () => {
    expect(PLAY_PAY.achievementTimes).toBe(3);
    for (const d of DIFFICULTIES) {
      const g = ConquestGame.create(
        map,
        { endYear: 1776, difficulty: d as Difficulty, seed: 7 },
        [{ seat: "s1", name: "Alden", plan: plan() }],
      );
      const l = lifeOf(g);
      ticks(g, 1);
      expect(l.achieved?.["first-job"], d).toBeDefined();
      const worth = gameAchievements(l).coins;
      expect(worth).toBe(
        Object.keys(l.achieved!).reduce(
          (n, k) => n + ACHIEVEMENT_BY_KEY.get(k)!.coins * 3,
          0,
        ),
      );
      // From the first day: before the line's other marks (two years) pay.
      const c = lifeCoins(l, false);
      expect(c.lines).toEqual([{ line: GAME_ACH_LINE, coins: worth }]);
      expect(c.total).toBe(worth);
    }
    expect(gameCoins(ACHIEVEMENT_BY_KEY.get("general")!)).toBe(24);
  });

  test("overall achievements count only on the hardest difficulty", () => {
    expect(OVERALL_DIFFICULTY).toBe("hard");
    expect(DIFFICULTIES[DIFFICULTIES.length - 1]).toBe(OVERALL_DIFFICULTY);
    expect(countsOverall("hard")).toBe(true);
    expect(countsOverall("normal")).toBe(false);
    expect(countsOverall("easy")).toBe(false);
    expect(countsOverall(undefined)).toBe(false);
  });

  test("held to the time played with the line's marks: game after game pays no more than playing on", () => {
    const g = copy(base);
    const l = lifeOf(g);
    for (const key of [
      "three-concerns",
      "fleet",
      "general",
      "houseful",
      "five-generations",
    ])
      SETUP[key](g, l);
    checkAchievements(g, l);
    const worth = gameAchievements(l).coins;
    expect(worth).toBeGreaterThan(60);
    // Two minutes at the table: two coins of it, the rest held.
    expect(linesDue(l, 120, 0)).toMatchObject({
      total: worth,
      cap: lineCap(120),
      due: 2,
      held: worth - 2,
    });
    // Three games of two minutes each: no more than six minutes' worth.
    let paid = 0;
    for (let i = 0; i < 3; i++) paid += linesDue(l, 120, 0).due;
    expect(paid).toBeLessThanOrEqual(lineCap(360));
    // An hour on: sixty of it.
    expect(linesDue(l, 3600, 2).due).toBe(58);
  });
});

// ---------------------------------------------------------------- saves

describe("old games and saves (CQACH r22)", () => {
  test("a save from before this round (no counts, no add-on marks) loads, plays and earns", () => {
    const g = copy(base);
    const l = lifeOf(g);
    ticks(g, 2);
    const old = JSON.parse(JSON.stringify(g.state)) as GameState;
    const ol = old.lives.find((x) => x.seat === "s1")!;
    delete ol.achCount;
    delete ol.dlc;
    // An achievement from a game long ago that no longer exists is ignored.
    ol.achieved = { ...ol.achieved, "no-such-thing": 3 };
    const back = new ConquestGame(map, old);
    const bl = lifeOf(back);
    expect(gameAchievements(bl).keys).not.toContain("no-such-thing");
    expect(gameAchievements(bl).coins).toBe(gameAchievements(l).coins);
    ticks(back, 30);
    expect(bl.achieved?.["first-job"]).toBe(l.achieved?.["first-job"]);
    expect(Object.keys(bl.achCount ?? {})).toContain("job:farmer");
    // A life with nothing achieved at all still reckons its coins.
    expect(
      lifeCoins({ tally: bl.tally } as Life, false).total,
    ).toBeGreaterThanOrEqual(0);
  });

  test("the counts and the campaign mark ride the save and the delta", () => {
    const g = copy(base76);
    const l = lifeOf(g);
    const client = JSON.parse(JSON.stringify(g.state)) as GameState;
    g.takeDelta();
    setCampaignOwned(g, l.seat, true);
    countAch(g, l, "cards-won", 4);
    duel(g, l, "Won a duel against Tom Fell with swords");
    applyDelta(client, g.takeDelta());
    const cl = client.lives.find((x) => x.seat === l.seat)!;
    expect(cl.dlc?.campaign1776).toBe(true);
    expect(cl.achCount).toEqual(l.achCount);
    const back = new ConquestGame(map, JSON.parse(JSON.stringify(g.state)));
    expect(lifeOf(back).achCount).toEqual(l.achCount);
    expect(lifeOf(back).dlc).toEqual({ campaign1776: true });
  });
});

// ---------------------------------------------------------------- helpers: the tavern's card table

function tavern(seed = 5) {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: prov("Jamestown"), background: "clerk" }),
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

const cards = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, { k: "cards", ...c } as never);
