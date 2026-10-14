// STORY (r17): the story of a life tells everything memorable it did or went
// through (brawls and duels, arrests and trials, prizes, hurricanes and
// wrecks, businesses and a company's great voyages, polls lost and offices
// given up, plots as far as you know them, children's schooling and degrees,
// people freed, tables won at dice, achievements, losses and a home taken in
// war); it's told year by year with an engraving for each kind (any other
// track's kind told plainly); the story so far and the story told at the end
// are one reckoning; secrets stay secret; a long line keeps its beginning; old
// saves load. And saved games can be deleted, only by the account that began
// them (the server checks), taken off a joiner's list, cleared when finished,
// and never brought back by a room that was still open.

import http from "http";
import { render } from "lit";
import { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { WebSocket } from "ws";
import { journalTab } from "../../src/conquest/client/ui/Journal";
import { presentAt } from "../../src/conquest/engine/Areas";
import { bondageFor, setFree } from "../../src/conquest/engine/Bondage";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { kill, makeCharacter } from "../../src/conquest/engine/Characters";
import { doCrimeAct, jail } from "../../src/conquest/engine/Crime";
import { CRUISE } from "../../src/conquest/engine/CruiseData";
import {
  newCruise,
  prizeNow,
  stormNow,
  warshipNow,
} from "../../src/conquest/engine/Cruises";
import { tablesOf } from "../../src/conquest/engine/DiceCore";
import { startDuel } from "../../src/conquest/engine/Duels";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  intrigueOf,
  stateForIntrigue,
} from "../../src/conquest/engine/IntrigueCore";
import { MAX_MILESTONES, milestone } from "../../src/conquest/engine/LifeCore";
import {
  autoAnswerLife,
  raiseLifeEvent,
} from "../../src/conquest/engine/LifeEvents";
import { lifeOfSeat, meOf } from "../../src/conquest/engine/LifeQueries";
import {
  ensureOffices,
  giveOffice,
  vacate,
} from "../../src/conquest/engine/Offices";
import { discovered, plotWeek } from "../../src/conquest/engine/Plots";
import { ageOf } from "../../src/conquest/engine/Queries";
import { DAYS_PER_YEAR } from "../../src/conquest/engine/Rules";
import { storyOf } from "../../src/conquest/engine/StoryBook";
import { storyKind, storyWeight } from "../../src/conquest/engine/StoryCore";
import { openTrial, verdictHeard } from "../../src/conquest/engine/Trials";
import type {
  Character,
  Life,
  LifeMilestone,
  MilestoneKind,
} from "../../src/conquest/engine/Types";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, ticks, toNextMonth, world } from "./LifeUtil";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const JT = prov("Jamestown");

const kinds = (life: Life) => life.milestones.map((m) => storyKind(m));
const has = (life: Life, kind: string, re?: RegExp) =>
  life.milestones.some(
    (m) => storyKind(m) === kind && (!re || re.test(m.text)),
  );
/** Every entry the story tells, small things unfolded. */
function told(g: ConquestGame, life: Life): string[] {
  const out: string[] = [];
  for (const e of storyOf(g.s, life).entries) {
    if (e.many) for (const x of e.many) out.push(`${e.kind}: ${x.text}`);
    else out.push(`${e.kind}: ${e.text}`);
  }
  return out;
}

function grown(g: ConquestGame, life: Life, female = false): Character {
  const me = meOf(g.s, life)!;
  const c = makeCharacter(g.s, g.rng, {
    nation: me.nation,
    culture: g.s.nations[me.nation].culture,
    religion: me.religion,
    female,
    age: 30,
  });
  c.home = life.prov;
  (g.s.locals[life.prov] ??= []).push(c.id);
  life.met.push(c.id);
  return c;
}

// ---------------------------------------------------------------- every system

describe("the story keeps what a life did", () => {
  test("a brawl, a duel, the law (taken up, out of the gaol, acquitted), a big job", () => {
    const g = world({ start: 1700, seed: 3 });
    g.aiEnabled = false;
    const life = lifeOf(g);
    life.purse = 300;
    life.skills.fighting = 12;
    life.skills.stealth = 14;
    // A brawl at the tavern (won or lost, it's in the story).
    life.area = "tavern";
    expect(
      g.lifeCommand("s1", { k: "act", place: "tavern", act: "brawl" }),
    ).toBeNull();
    expect(has(life, "fight", /tavern brawl|loudmouth/)).toBe(true);
    // A brawl a month later is counted, though the story keeps one a season.
    life.cooldowns["act:brawl"] = 0;
    for (const k of Object.keys(life.cooldowns))
      if (k.includes("brawl")) delete life.cooldowns[k];
    g.s.day += 31;
    g.lifeCommand("s1", { k: "act", place: "tavern", act: "brawl" });
    expect(life.tally.kinds?.fight).toBe(2);
    expect(life.milestones.filter((m) => m.kind === "fight")).toHaveLength(1);

    // A duel, played out as its scenes (each answered the first way).
    const foe = grown(g, life);
    startDuel(g, life, foe, false);
    for (let i = 0; i < 40 && life.events.some((e) => /^duel/.test(e.key)); i++)
      autoAnswerLife(g, "s1", life.events.find((e) => /^duel/.test(e.key))!.id);
    expect(has(life, "duel")).toBe(true);

    // Taken up: the gaol; the gaoler bribed: out, and wanted.
    const eng = g.s.provinces[JT].owner;
    jail(g, life, "theft", 1, eng);
    expect(has(life, "arrest", /Taken up for theft at Jamestown/)).toBe(true);
    life.area = "gaol";
    expect(doCrimeAct(g, life, "gaoler")).toBeNull();
    expect(has(life, "escape", /Broke out of the gaol at Jamestown/)).toBe(
      true,
    );

    // Tried and acquitted at the court-house.
    const t = openTrial(g, {
      kind: "accused",
      defendant: life.c,
      accuser: -1,
      p: JT,
      nation: eng,
      charge: "slander",
      grade: 1,
      evidence: 1,
    });
    t.verdict = "acquitted";
    t.stage = 5;
    verdictHeard(g, life, t.id);
    expect(
      has(life, "trial", /Tried for slander at Jamestown, and acquitted/),
    ).toBe(true);

    // A big job that came off.
    life.job = null;
    for (let i = 0; i < 12 && !has(life, "crime"); i++) {
      g.s.day += 1;
      raiseLifeEvent(g, life, "crime-score", { n: eng });
      const ev = life.events.find((e) => e.key === "crime-score")!;
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 });
      life.events = [];
      if (life.crime) life.crime.jail = null;
    }
    expect(has(life, "crime", /it came off/)).toBe(true);
    // Everything recorded is told.
    const all = told(g, life).join("\n");
    for (const k of ["fight", "duel", "arrest", "escape", "trial", "crime"])
      expect(all).toContain(`${k}:`);
  });

  test("at sea: a prize, a hurricane ridden out, taken by a man-of-war", () => {
    const g = world({
      start: 1700,
      seed: 16,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ background: "sailor", home: prov("Massachusetts Bay") }),
        },
      ],
    });
    const s = g.s;
    s.day = dayOf(1702, 4, 2);
    const life = lifeOf(g);
    const eng = s.nations.findIndex((n) => n.key === "england");
    const fra = s.nations.findIndex((n) => n.key === "france");
    s.wars.push({
      a: eng,
      b: fra,
      by: eng,
      start: s.day,
      why: "War in Europe",
      won: [0, 0],
      lost: [0, 0],
      europe: true,
    });
    const cr = newCruise(
      g,
      {
        key: "x",
        flag: "privateer",
        nation: eng,
        ship: "Tartar",
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
    cr.encounter = {
      kind: "sloop",
      flag: fra,
      guns: 2,
      value: 60,
      name: "the Marie",
      stage: "taken",
      day: s.day,
    };
    prizeNow(g, cr, "send");
    expect(has(life, "prize", /The Tartar took/)).toBe(true);
    stormNow(g, cr, 1, "heave", true);
    expect(has(life, "storm", /Rode out a hurricane aboard the Tartar/)).toBe(
      true,
    );
    cr.encounter = {
      kind: "man-of-war",
      flag: fra,
      guns: 32,
      value: 0,
      name: "a French man-of-war",
      stage: "warship",
      day: s.day,
    };
    warshipNow(g, cr, "strike", false);
    expect(has(life, "wreck", /taken by a French man-of-war/)).toBe(true);
    void CRUISE;
  });

  test("a business set up and sold, an office won and lost, a home moved, a child's college and degree", () => {
    const g = world({ start: 1700, seed: 5 });
    g.aiEnabled = false;
    const life = lifeOf(g);
    life.purse = 900;
    // A business of your own (Start a business).
    life.job = null;
    expect(
      g.lifeCommand("s1", {
        k: "business",
        act: "found",
        job: "shopkeeper",
        level: 1,
      } as never),
    ).toBeNull();
    expect(has(life, "business", /Set up a .* at Jamestown/)).toBe(true);
    const shop = life.property!.find((p) => p.kind === "business")!;
    expect(
      g.lifeCommand("s1", { k: "property", act: "sell", id: shop.id } as never),
    ).toBeNull();
    expect(has(life, "business", /Sold the .* at Jamestown for/)).toBe(true);

    // An office, then given up.
    const office = ensureOffices(g, JT)[0];
    if (office) {
      giveOffice(g, office, life.c, "by appointment");
      expect(has(life, "office", /^Became /)).toBe(true);
      vacate(g, office, "your term is over");
      expect(has(life, "office", /^No longer .*: your term is over/)).toBe(
        true,
      );
    }

    // A son to Harvard, and his degree at Commencement.
    const me = meOf(g.s, life)!;
    const boy = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: g.s.nations[me.nation].culture,
      religion: "anglican",
      female: false,
      age: 15,
    });
    boy.father = me.id;
    boy.family = me.family;
    boy.home = life.home;
    me.children.push(boy.id);
    boy.taught = { letters: 4 };
    boy.edu = { now: null, past: [], pts: { letters: 4 } };
    expect(
      g.lifeCommand("s1", {
        k: "edu",
        act: "college",
        c: boy.id,
        key: "harvard",
        rank: 1,
        course: "divinity",
      }),
    ).toBeNull();
    expect(
      has(life, "school", new RegExp(`${boy.first} entered Harvard`)),
    ).toBe(true);
    boy.edu!.now!.until = g.s.day + 1;
    toNextMonth(g);
    const degree = life.milestones.find(
      (m) => m.kind === "school" && /took a degree/.test(m.text),
    );
    expect(degree).toBeDefined();
    expect(storyWeight(degree!)).toBe(3);
  });

  test("plots, as far as each life knows them; someone freed; a table won at dice; an achievement; a loss; a home taken; a siege carried", () => {
    const g = world({ start: 1700, seed: 13 });
    g.aiEnabled = false;
    const s = g.s;
    const life = lifeOf(g);
    life.purse = 500;
    // A plot laid and done: secret, and in your own story.
    const c = grown(g, life);
    expect(
      g.lifeCommand("s1", {
        k: "intrigue",
        act: "plot",
        c: c.id,
        method: "ambush",
      }),
    ).toBeNull();
    const x = intrigueOf(s).schemes.find((y) => y.target === c.id)!;
    x.odds = { ...x.odds, p: 1, d: 0, f: 0 };
    x.week = x.weeks;
    plotWeek(g, life, x);
    const plotted = life.milestones.find((m) => m.kind === "plot");
    expect(plotted?.text).toMatch(/Plotted the death of .*, and it was done/);
    expect(plotted?.sec).toBe(true);
    // Another, found out: public.
    const d = grown(g, life);
    g.lifeCommand("s1", {
      k: "intrigue",
      act: "plot",
      c: d.id,
      method: "ambush",
    });
    const y = intrigueOf(s).schemes.find((z) => z.target === d.id)!;
    discovered(g, y, false);
    const out = life.milestones.find((m) => /came out/.test(m.text));
    expect(out?.kind).toBe("plot");
    expect(out?.sec).toBeUndefined();

    // Someone freed, by deed.
    const b = bondageFor(g, life);
    const held = makeCharacter(s, g.rng, {
      nation: s.provinces[b.home].owner,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 30,
      first: "Phillis",
      family: "",
    });
    held.bond = {
      status: "held",
      seat: life.seat,
      at: b.home,
      origin: "creole",
      faith: "own",
      health: 70,
      mood: 50,
      sk: { field: 5, house: 3, craft: 3 },
      work: "house",
      since: s.day - 2000,
    };
    b.people.push(held.id);
    setFree(g, life, held, "by deed");
    expect(has(life, "freed", /^Freed Phillis/)).toBe(true);

    // An achievement.
    life.tally.peakPurse = 1200;
    g.tick();
    expect(has(life, "achievement", /^Achievement: /)).toBe(true);

    // A wife lost.
    const me = meOf(s, life)!;
    const wife = grown(g, life, true);
    me.spouse = wife.id;
    wife.spouse = me.id;
    kill(g, wife, "a fever");
    expect(has(life, "loss", /^Widowed: your wife .* died, a fever/)).toBe(
      true,
    );

    // Home taken in a war; and a siege carried by your own army.
    const fra = s.nations.findIndex((n) => n.key === "france");
    g.event({
      k: "occupied",
      day: s.day,
      n: fra,
      p: life.home,
      from: me.nation,
    });
    expect(has(life, "home", /Jamestown, your home, was taken by France/)).toBe(
      true,
    );
    const other = prov("Charles Town");
    g.addArmy({
      id: g.nextId(),
      owner: me.nation,
      prov: other,
      regs: [],
      path: [],
      depart: -1,
      arrive: 0,
      sea: false,
      retreating: false,
      arrived: s.day,
      from: -1,
      commander: me.id,
      supply: 1,
    });
    g.event({ k: "occupied", day: s.day, n: me.nation, p: other, from: fra });
    const siege = life.milestones.find((m) => /after a siege/.test(m.text));
    expect(siege?.text).toMatch(/Took Charles Town after a siege, in command/);
    expect(storyWeight(siege!)).toBe(3);
    // The world's luck isn't touched: none of these is talked of in the town.
    expect(
      (s.rumours ?? []).some((r) => /after a siege|Widowed/.test(r.text)),
    ).toBe(false);
  });

  test("Liar's dice: a table won is in the story", () => {
    const g = world({
      start: 1700,
      seed: 5,
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
    // A day with a few of the town's people in the tavern, who like you.
    const here = () =>
      presentAt(g.s, g.w, life.prov, "tavern", g.s.day, life)
        .filter((x) => x.kind !== "player")
        .map((x) => g.s.chars[x.c]);
    for (let i = 0; i < 90 && here().length < 3; i++) {
      g.tick();
      life.events = [];
    }
    life.events = [];
    life.purse = 400;
    life.area = "tavern";
    const folk = here().slice(0, 3);
    for (const c of folk)
      g.char(c.id).memories.push({
        of: life.c,
        why: "A friend",
        value: 80,
        until: 0,
      });
    let won = false;
    for (let k = 0; k < 40 && !won; k++) {
      const err = g.lifeCommand("s1", {
        k: "dice",
        act: "open",
        stake: 2,
        ask: folk.map((c) => c.id),
      } as never);
      expect(err).toBeNull();
      const t = tablesOf(g.s).find((x) => x.status === "open")!;
      g.lifeCommand("s1", { k: "dice", act: "start", id: t.id } as never);
      for (let i = 0; i < 600 && t.status === "playing"; i++)
        g.lifeCommand("s1", { k: "dice", act: "auto", id: t.id } as never);
      won = t.result?.winner === life.c;
    }
    expect(won).toBe(true);
    expect(
      has(life, "dice", /Won a pot of \d+ coins at Liar's dice at Jamestown/),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------- how it's told

describe("how the story is told", () => {
  test("year by year, generation by generation; small things of a year in one line; great moments weigh most; a kind nobody drew is told plainly", () => {
    const g = world({ start: 1700, seed: 9 });
    const life = lifeOf(g);
    const s = g.s;
    const at = (y: number) => (s.day = dayOf(y, 5, 1));
    at(1701);
    milestone(g, life, "fight", "A brawl at Jamestown", life.prov, {
      quiet: true,
    });
    at(1701);
    s.day += 40;
    milestone(g, life, "fight", "Another at Jamestown", life.prov, {
      quiet: true,
    });
    milestone(g, life, "battle", "Won the battle of X, in command", life.prov, {
      quiet: true,
      big: true,
    });
    at(1703);
    milestone(
      g,
      life,
      "reconquest" as MilestoneKind,
      "Took back St. Augustine for the crown",
      life.prov,
      { quiet: true },
    );
    const story = storyOf(s, life);
    const years = story.generations.flatMap((gen) =>
      gen.years.map((y) => y.year),
    );
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years).toContain(1701);
    expect(years).toContain(1703);
    const y1701 = story.generations[0].years.find((y) => y.year === 1701)!;
    const brawls = y1701.entries.find((e) => e.kind === "fight")!;
    expect(brawls.many).toHaveLength(2);
    expect(brawls.text).toBe("2 brawls");
    const battle = y1701.entries.find((e) => e.kind === "battle")!;
    expect(battle.weight).toBe(3);
    expect(battle.icon).toBe("muskets");
    const plain = story.entries.find((e) => e.kind === "reconquest")!;
    expect(plain.icon).toBe("seal");
    expect(plain.text).toBe("Took back St. Augustine for the crown");
    expect(plain.weight).toBe(2);
    // Counts: every kind as it came (one nobody drew is told, not counted).
    expect(story.counts.find((k) => k.kind === "fight")!.label).toBe(
      "2 brawls",
    );
    expect(story.counts.some((k) => k.kind === "reconquest")).toBe(false);
  });

  test("the story so far is the start of the story told at the end, and both pages show the one story", () => {
    const g = world({ start: 1700, seed: 21 });
    const life = lifeOf(g);
    life.purse = 200;
    ticks(g, DAYS_PER_YEAR);
    milestone(g, life, "fight", "A brawl", life.prov, { quiet: true });
    const sofar = storyOf(g.s, life).entries.map((e) => e.key);
    const day = g.s.day;
    ticks(g, DAYS_PER_YEAR);
    milestone(g, life, "duel", "Won a duel against a stranger", life.prov, {
      quiet: true,
    });
    g.finish();
    const told = storyOf(g.s, life).entries;
    // Everything up to that day is told the same at the end (and in order).
    expect(told.filter((e) => e.day <= day).map((e) => e.key)).toEqual(sofar);
    expect(told[told.length - 1].day).toBeGreaterThan(day);
    // Journal › The story is the very element the end shows.
    const div = document.createElement("div");
    render(
      journalTab(
        {
          s: g.s,
          life,
          map,
          modal: () => undefined,
          redraw: () => undefined,
        } as never,
        "story",
      ),
      div,
    );
    expect(div.querySelector("cq-life-story")).not.toBeNull();
  }, 60_000);

  test("a long line keeps its beginning and its great moments when the small things are trimmed", () => {
    const g = world({ start: 1700, seed: 2 });
    const life = lifeOf(g);
    milestone(g, life, "office", "Became governor of somewhere", life.prov, {
      quiet: true,
      big: true,
    });
    for (let i = 0; i < MAX_MILESTONES + 50; i++) {
      g.s.day += 1;
      milestone(g, life, "dice", `Won a pot ${i}`, life.prov, { quiet: true });
    }
    expect(life.milestones).toHaveLength(MAX_MILESTONES);
    expect(life.milestones[0].kind).toBe("born");
    expect(life.milestones.some((m) => /governor/.test(m.text))).toBe(true);
    // The newest small things are kept; the oldest went.
    expect(life.milestones.some((m) => m.text === "Won a pot 0")).toBe(false);
    expect(life.milestones[life.milestones.length - 1].text).toBe(
      `Won a pot ${MAX_MILESTONES + 49}`,
    );
    expect(life.tally.kinds?.dice).toBe(MAX_MILESTONES + 50);
  });

  test("a secret moment is sent to nobody else, and isn't counted for others to see", () => {
    const g = world({
      start: 1700,
      seed: 4,
      plans: [
        { seat: "s1", name: "Alden", plan: plan() },
        {
          seat: "s2",
          name: "Bea",
          plan: plan({ first: "Beatrice", family: "Hale", female: true }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    milestone(g, a, "plot", "Plotted the death of someone", a.prov, {
      sec: true,
    });
    milestone(g, a, "duel", "Won a duel against someone", a.prov, {
      quiet: true,
    });
    const forBea = stateForIntrigue(g.s, "s2").lives.find(
      (l) => l.seat === "s1",
    )!;
    expect(forBea.milestones.some((m) => m.kind === "plot")).toBe(false);
    expect(forBea.milestones.some((m) => m.kind === "duel")).toBe(true);
    expect(forBea.tally.kinds?.plot).toBeUndefined();
    const forAlden = stateForIntrigue(g.s, "s1").lives.find(
      (l) => l.seat === "s1",
    )!;
    expect(forAlden.milestones.some((m) => m.kind === "plot")).toBe(true);
  });

  test("an old save loads: its moments are told by their words, and its achievements from the days they were earned", () => {
    const g = world({ start: 1700, seed: 6 });
    const life = lifeOf(g);
    const old: LifeMilestone[] = [
      ...life.milestones,
      {
        day: g.s.day + 10,
        kind: "renown",
        c: life.c,
        text: "Won a duel against Tom Fell",
        p: JT,
      },
      {
        day: g.s.day + 20,
        kind: "job",
        c: life.c,
        text: "Set up a store at Jamestown",
        p: JT,
      },
      {
        day: g.s.day + 30,
        kind: "office",
        c: life.c,
        text: "Elected to the House of Burgesses",
        p: JT,
      },
    ];
    const state = JSON.parse(JSON.stringify(g.s));
    const l = state.lives[0];
    l.milestones = old;
    delete l.tally.kinds;
    l.achieved = { "first-job": g.s.day + 15 };
    const back = new ConquestGame(map, state);
    const bl = lifeOfSeat(back.s, "s1")!;
    const story = storyOf(back.s, bl);
    const byText = (re: RegExp) => story.entries.find((e) => re.test(e.text))!;
    expect(byText(/duel/).kind).toBe("duel");
    expect(byText(/Set up a store/).kind).toBe("business");
    expect(byText(/Elected/).kind).toBe("election");
    expect(byText(/^Achievement: /).day).toBe(g.s.day + 15);
    expect(kinds(bl)).not.toContain("achievement");
    // It plays on, and the story keeps going.
    ticks(back, 30);
    milestone(back, bl, "fight", "A brawl", bl.prov, { quiet: true });
    const after = storyOf(back.s, bl).entries;
    expect(after[after.length - 1].kind).toBe("fight");
  });
});

// ---------------------------------------------------------------- deleting saved games, through the server

const { attachConquest, ConquestRooms } =
  await import("../../src/server/conquest/ConquestRooms");

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
        6000,
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
  close() {
    this.ws.close();
  }
}

const clock = 1_800_000_000_000;

function startServer() {
  const rooms = new ConquestRooms(() => clock);
  const server = http.createServer();
  attachConquest(server, rooms);
  return new Promise<{
    rooms: InstanceType<typeof ConquestRooms>;
    server: http.Server;
    url: string;
  }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        rooms,
        server,
        url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`,
      }),
    ),
  );
}

describe("saved games, through the server (no database)", () => {
  let env: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    env = await startServer();
  });
  afterAll(async () => {
    await new Promise((r) => env.server.close(r));
  });

  test("a guest can't delete anything", async () => {
    const a = new Client(env.url);
    await a.open;
    a.send({ t: "hello", name: "Guest" });
    await a.next("welcome");
    const err = a.next("err");
    a.send({ t: "delsave", id: "ABCD-1" });
    expect((await err).msg).toMatch(/Sign in/);
    const err2 = a.next("err");
    a.send({ t: "clearsaves" });
    expect((await err2).msg).toMatch(/Sign in/);
    a.close();
  });
});

// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).
const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)(
  "saved games against Postgres: who may delete",
  () => {
    let env: Awaited<ReturnType<typeof startServer>>;
    let closeDb: () => Promise<void>;
    const clients: Client[] = [];

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DB;
      const pg = await import("pg");
      const c = new pg.default.Client({ connectionString: TEST_DB });
      await c.connect();
      await c.query(
        "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
      );
      await c.end();
      ({ closeDerpyDb: closeDb } =
        await import("../../src/server/derpy/DerpyDb"));
      env = await startServer();
    });
    afterEach(() => {
      for (const c of clients.splice(0)) c.close();
    });
    afterAll(async () => {
      await new Promise((r) => env.server.close(r));
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    async function signedIn(name: string) {
      const { register } = await import("../../src/server/derpy/DerpyAuth");
      const session = await register(name, "hunter22");
      if (typeof session === "string") throw new Error(session);
      return session.token;
    }
    async function connect(token: string) {
      const c = new Client(env.url);
      clients.push(c);
      await c.open;
      c.send({ t: "hello", name: "x", token });
      await c.next("welcome");
      return c;
    }
    const list = async (c: Client) => {
      const r = c.next("rooms");
      c.send({ t: "list" });
      return r;
    };

    test("the one who began it deletes it; a joiner only takes it off their list; never while it's played; never brought back by its room", async () => {
      const aTok = await signedIn("Alden");
      const bTok = await signedIn("Bea");
      const a = await connect(aTok);
      const lobby = a.next("lobby");
      a.send({
        t: "create",
        solo: false,
        open: false,
        settings: { difficulty: "normal", start: 1700 },
      });
      const l = await lobby;
      const b = await connect(bTok);
      const joined = a.next("lobby", (m) => m.seats.length === 2);
      b.send({ t: "join", code: l.code });
      await joined;
      a.send({ t: "plan", plan: plan() });
      b.send({
        t: "plan",
        plan: plan({ first: "Beatrice", family: "Hale", female: true }),
      });
      await a.next("lobby", (m) => m.seats.every((x) => x.made));
      b.send({ t: "ready", ready: true });
      await a.next("lobby", (m) => m.seats.some((x) => x.ready));
      const games = [a.next("game"), b.next("game")];
      a.send({ t: "start" });
      await Promise.all(games);
      const saved = a.next("saved");
      a.send({ t: "save" });
      await saved;
      const room = env.rooms.rooms.get(l.code)!;
      const id = room.saveId!;

      // In the lobby: Alden's to delete, Bea's only to take off her list.
      a.send({ t: "leave" });
      b.send({ t: "leave" });
      await new Promise((r) => setTimeout(r, 50));
      const la = (await list(a)).saved.find((x) => x.id === id)!;
      const lb = (await list(b)).saved.find((x) => x.id === id)!;
      expect(la).toMatchObject({ mine: true, by: "Alden" });
      expect(lb).toMatchObject({ mine: false, by: "Alden" });

      // Bea can't delete it (the server checks, whatever her browser says).
      const no = b.next("err");
      b.send({ t: "delsave", id });
      expect((await no).msg).toMatch(/Only Alden can delete/);
      // She takes it off her own list instead: it's still Alden's.
      const off = b.next("forgot");
      b.send({ t: "hidesave", id });
      expect((await off).ids).toEqual([id]);
      expect((await list(b)).saved.some((x) => x.id === id)).toBe(false);
      expect((await list(a)).saved.some((x) => x.id === id)).toBe(true);

      // While Bea plays in it, it can't be deleted; she's back on her list for playing.
      const back = b.next("game");
      b.send({ t: "join", code: l.code });
      await back;
      const live = a.next("err");
      a.send({ t: "delsave", id });
      expect((await live).msg).toMatch(/being played right now, by Bea/);
      const resaved = b.next("saved");
      b.send({ t: "save" });
      await resaved;
      b.send({ t: "leave" });
      await new Promise((r) => setTimeout(r, 50));
      expect((await list(b)).saved.some((x) => x.id === id)).toBe(true);

      // Nobody in it now (the room still open): Alden deletes it, and the room closes.
      expect(env.rooms.rooms.has(l.code)).toBe(true);
      const gone = a.next("forgot");
      a.send({ t: "delsave", id });
      expect((await gone).ids).toEqual([id]);
      expect(env.rooms.rooms.has(l.code)).toBe(false);
      const { db } = await import("../../src/server/derpy/DerpyDb");
      const pool = await db();
      const left = await pool.query(
        "SELECT count(*)::int AS n FROM derpy_conquest_saves WHERE game_id = $1",
        [id],
      );
      expect(left.rows[0].n).toBe(0);
      // A save of the closed room (on shutdown, say) doesn't bring it back.
      room.saveId = id;
      env.rooms.rooms.set(room.code, room);
      await env.rooms.saveAll();
      env.rooms.rooms.delete(room.code);
      const still = await pool.query(
        "SELECT count(*)::int AS n FROM derpy_conquest_saves WHERE game_id = $1",
        [id],
      );
      expect(still.rows[0].n).toBe(0);
      expect((await list(a)).saved.some((x) => x.id === id)).toBe(false);
      expect((await list(b)).saved.some((x) => x.id === id)).toBe(false);
      const cant = a.next("err");
      a.send({ t: "resume", id });
      expect((await cant).msg).toMatch(/deleted/);
    });

    test("finished and old games are listed apart, and cleared away at once", async () => {
      const tok = await signedIn("Carys");
      const c = await connect(tok);
      const lobby = c.next("lobby");
      c.send({
        t: "create",
        solo: true,
        open: false,
        settings: { difficulty: "easy" },
      });
      await lobby;
      c.send({
        t: "plan",
        plan: plan({ first: "Carys", family: "Penn", female: true }),
      });
      await c.next("lobby", (m) => m.seats.some((x) => x.made));
      const game = c.next("game");
      c.send({ t: "start" });
      const g = await game;
      const end = c.next("end");
      c.send({ t: "end" });
      await end;
      // A second, saved by an older version.
      const { db } = await import("../../src/server/derpy/DerpyDb");
      const pool = await db();
      const acc = (
        await pool.query(
          "SELECT id FROM derpy_accounts WHERE username = 'Carys'",
        )
      ).rows[0].id;
      await pool.query(
        `INSERT INTO derpy_conquest_saves (game_id, title, year, seats, accounts, state, over, version)
       VALUES ('OLD-1', 'The Penns, from 1607', 1631, $1, $2, $3, false, 2)`,
        [
          JSON.stringify([
            {
              seat: "x",
              name: "Carys",
              power: "england",
              accountId: Number(acc),
            },
          ]),
          [acc],
          Buffer.from([0]),
        ],
      );
      c.send({ t: "leave" });
      const r = await list(c);
      expect(r.saved).toHaveLength(0);
      expect(r.finished?.map((x) => x.id).sort()).toEqual(
        ["OLD-1", env.rooms.rooms.get(g.code)?.saveId ?? ""].sort(),
      );
      expect(r.finished?.find((x) => x.id === "OLD-1")).toMatchObject({
        old: true,
        mine: true,
      });
      expect(r.finished?.find((x) => x.id !== "OLD-1")).toMatchObject({
        over: true,
      });
      const cleared = c.next("forgot");
      c.send({ t: "clearsaves" });
      expect((await cleared).ids).toHaveLength(2);
      expect((await list(c)).finished).toHaveLength(0);
      // The game's result stays on the leaderboards.
      const games = await pool.query(
        "SELECT count(*)::int AS n FROM derpy_conquest_games",
      );
      expect(games.rows[0].n).toBeGreaterThan(0);
    });
  },
);

void ageOf;
void JT;
