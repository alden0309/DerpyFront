// CQ24 (r24): Legends' sacred places can be plundered as well as kept. The
// owner asked for it "not in an evil way, just in a it's a game and that
// should be an option way": so it's a choice, told in the period's own
// voice, with real consequences and nothing gory, and keeping faith still
// pays (Legends.ts's walk with an elder, and the promise kept).
//
// - Who: anyone following a sacred place's trail (they've heard of it), at
//   the place itself, who isn't of its own people. Their trust earned (the
//   trail's first steps) makes the dig surer, and the betrayal worse.
// - What it takes: a digging party fitted out (PLUNDER.cost, on the
//   button), and getting in and out unseen and finding where to dig
//   (stealth against PLUNDER.dc). The page shows the odds of each find, of
//   being caught and of coming away with nothing, from this table, before
//   the click.
// - What it gives: what was buried there, at the chances of PLUNDER_FINDS:
//   copper, shell and silver a collector will pay for, gold in the Black
//   Hills' creeks, and sometimes a thing kept (a relic: renown, and it's
//   yours to give back or keep).
// - What follows: the place stays plundered, and is remembered (on its
//   people's nation: Nation.sacred, which every page can see), and the
//   world's news says so. Its people's nation thinks worse of the
//   plunderer's for a generation, and their allies too (raids and war come
//   likelier through the computer's own reckoning, Ai.ts); their people who
//   know the plunderer remember it. At home, the bold admire the daring
//   and the devout think it shameful. In time their people come for what
//   was taken (the reckoning: give it back, pay, talk them round, stand
//   your ground, or let them take it), and the trail's end is the
//   plunder's: the place's later visitors find the cut in it.
// - Caught at it: driven off and hurt, their people angered (less), and
//   the trail lost for good.
//
// The dice are Legends' own (0x2d1d0000 up; plunder's salts 0x10 to 0x15).

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { secretNote } from "./IntrigueCore";
import { withFlow } from "./LedgerCore";
import { ldice, legendsOn, progressOf } from "./Legends";
import {
  LEGEND_BY_KEY,
  type LegendDef,
  LEGENDS,
  SACRED_PLACE,
} from "./LegendsData";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  type Check,
  isChildLife,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance } from "./LifeRules";
import type { World } from "./Map";
import { hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import type {
  GameState,
  LegendProgress,
  Life,
  LifeCommand,
  Skill,
  TraitId,
} from "./Types";

/** What plundering a sacred place takes and what follows: the engine rolls by it, the page shows it. */
export const PLUNDER = {
  /** Fitting out the party: spades, mules, and a guide who'll go for money. */
  cost: 12,
  /** Getting in and out unseen, and finding where to dig. */
  skill: "stealth" as Skill,
  dc: 14,
  /** Each step of the trail done (their trust, the winter's stories): you know where to dig, and when they're away. */
  known: 2,
  /** Failed: caught at it (else you come away with nothing, unseen, and may try again after a season). */
  caught: 0.5,
  retry: 90,
  /** Caught: hurt, driven off. */
  hurt: 10,
  /** Their nation's opinion of the plunderer's (and their allies'), and for how long. */
  people: { value: -35, years: 25 },
  allies: { value: -15, years: 15 },
  /** Caught at it: their nation's opinion, less. */
  tried: { value: -15, years: 10 },
  /** Their own people who know you: what they remember. */
  person: { value: -40, years: 30 },
  /** And worse if they'd trusted you (the trail's steps done). */
  faith: { value: -10, renown: -2 },
  /** At home: the bold admire it, the devout think it shameful; and the taverns talk. */
  bold: {
    value: 6,
    years: 3,
    traits: ["brave", "greedy", "ambitious", "deceitful"] as TraitId[],
  },
  devout: {
    value: -10,
    years: 5,
    traits: ["zealous", "honest", "just", "tolerant", "generous"] as TraitId[],
  },
  renown: 3,
  /** Their people come for what was taken: when (days after). */
  reckon: [120, 360] as [number, number],
};

/** What their people do when they come (the scene's checks and prices). */
export const RECKONING = {
  talk: { skill: "persuasion" as Skill, dc: 15 },
  fight: { skill: "fighting" as Skill, dc: 14 },
  /** Paid in amends: this share of what it came to (at least a few coins). */
  pay: 0.6,
  payMin: 5,
  /** Given back: their anger eases to this (and the relic goes home). */
  eased: { value: -12, years: 10 },
  /** Stood your ground and won: they go, angrier. */
  angrier: { value: -10, years: 15 },
  hurt: 14,
  /** Let them, or lost: they take this share of your purse (at most what it came to). */
  take: 0.5,
};

/** One thing a plundered place may give up. */
export interface PlunderFind {
  key: string;
  /** Its chance, once you've dug unseen (they add up to 1). */
  chance: number;
  text: string;
  coins: [number, number];
  /** Kept, not sold: a thing of the place's own. */
  relic?: string;
  renown?: number;
}

/** What each sacred place may give up (never anyone's bones: what was buried with the old towns, offerings, gold in a creek). */
export const PLUNDER_FINDS: Record<string, PlunderFind[]> = {
  kituwah: [
    {
      key: "gorgets",
      chance: 0.5,
      text: "You cut into the side of the mound by night. A foot down the spade turns up shell gorgets engraved with rattlesnakes and spiders' webs, and strings of copper beads green with age. A gentleman in Charles Town collects such curiosities, and pays for them.",
      coins: [12, 26],
    },
    {
      key: "pipe",
      chance: 0.2,
      text: "Among what the spade turns up is a stone pipe carved as a bird, its head turned to look back at you. You don't sell it.",
      coins: [4, 10],
      relic: "a stone pipe carved as a bird, from Kituwah",
      renown: 2,
    },
    {
      key: "little",
      chance: 0.3,
      text: "The mound gives up a few sherds of pottery and a broken blade. Whatever it holds, it keeps.",
      coins: [1, 4],
    },
  ],
  cahokia: [
    {
      key: "copper",
      chance: 0.4,
      text: "In one of the lesser mounds you strike a cache: thin copper plates hammered into winged dancers, and shell beads by the thousand. The French traders at Kaskaskia buy what they can't name.",
      coins: [15, 35],
    },
    {
      key: "tablet",
      chance: 0.2,
      text: "In the spoil lies a small flat stone, carved on both faces with a man in the guise of a bird. You keep it.",
      coins: [3, 8],
      relic: "a carved stone tablet from the mounds at Cahokia",
      renown: 2,
    },
    {
      key: "little",
      chance: 0.4,
      text: "Bushels of earth, a few chunkey stones and broken pots. The great mound itself is too big to dig, and you go home with little.",
      coins: [2, 6],
    },
  ],
  serpent: [
    {
      key: "mica",
      chance: 0.25,
      text: "In a small mound near the serpent's tail you find cut mica, thin as glass, shaped like hands and birds, and a copper axe.",
      coins: [8, 20],
    },
    {
      key: "bracelet",
      chance: 0.25,
      text: "A copper bracelet, worn thin, in the spoil of a cut across the serpent's coils. You keep it.",
      coins: [2, 6],
      relic: "a copper bracelet from the mounds by the Great Serpent",
      renown: 1,
    },
    {
      key: "nothing",
      chance: 0.5,
      text: "The serpent was made to be seen, not to hide anything. You turn a great deal of earth and find nothing but earth.",
      coins: [0, 0],
    },
  ],
  pahasapa: [
    {
      key: "gold",
      chance: 0.25,
      text: "In a creek deep in the hills the pan shows colour: gold, in flakes and the odd nugget. You take what you can carry before you're seen.",
      coins: [25, 55],
    },
    {
      key: "dust",
      chance: 0.4,
      text: "A little gold dust in the creek gravel: enough to pay for the trip, and a little over.",
      coins: [8, 18],
    },
    {
      key: "nothing",
      chance: 0.35,
      text: "Weeks in the hills, and the creeks show nothing but sand.",
      coins: [0, 0],
    },
  ],
  bdote: [
    {
      key: "offerings",
      chance: 0.5,
      text: "At the place where the rivers meet you take what has been left there over the years: trade silver brooches, a kettle, a bundle of furs. It sells well enough at the posts.",
      coins: [8, 20],
    },
    {
      key: "pipe",
      chance: 0.2,
      text: "Among the offerings is a pipe of red stone with an otter carved along the stem. You keep it.",
      coins: [2, 6],
      relic: "a red stone pipe from Bdote",
      renown: 2,
    },
    {
      key: "little",
      chance: 0.3,
      text: "A few beads and tobacco ties, worth nothing to anyone but those who left them.",
      coins: [0, 2],
    },
  ],
};

const DAY_YEARS = (years: number) => Math.round(years * DAYS_PER_YEAR);

/** The place's name, short, for the middle of a sentence ("Kituwah", "the great mound at Cahokia"). */
export function placeName(def: LegendDef): string {
  return def.name.replace(/,.*$/, "").replace(/^The /, "the ");
}

/** A people's name with its article, for a sentence ("the Cherokee"). */
export function thePeople(name: string): string {
  return /^the /i.test(name) ? name.replace(/^The /, "the ") : `the ${name}`;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The nation whose sacred place it is. */
export function sacredPeople(s: GameState, def: LegendDef): number {
  return def.people ? s.nations.findIndex((n) => n.key === def.people) : -1;
}

/** The province the place is in. */
export function sacredProv(w: World, def: LegendDef): number {
  const name = SACRED_PLACE[def.key];
  return name ? w.map.provinces.findIndex((p) => p.name === name) : -1;
}

/** Whether (and when, and by whom) a sacred place was plundered. */
export function plunderedMark(s: GameState, def: LegendDef) {
  const n = sacredPeople(s, def);
  return n >= 0 ? s.nations[n]?.sacred?.[def.key] : undefined;
}

/** Whether this life dug it (and so its people won't let them near it again). */
export function plunderedBy(s: GameState, def: LegendDef, c: number): boolean {
  return plunderedMark(s, def)?.by === c;
}

/** The trail steps done: their trust earned (each makes the dig surer). */
function stepsDone(x: LegendProgress | undefined): number {
  return Math.max(0, Math.min(2, x?.step ?? 0));
}

/** Whether this life can plunder this place, here, now. */
export function plunderCheck(
  s: GameState,
  w: World,
  life: Life,
  key: string,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (!legendsOn(life)) return no("Legends are in the Derp Store.");
  const def = LEGEND_BY_KEY.get(key);
  if (!def || def.kind !== "sacred") return no("There's nothing to dig.");
  const x = progressOf(life, key);
  if (!x) return no("You haven't heard of that.");
  if (isChildLife(s, life)) return no("Not as a child.");
  const mark = plunderedMark(s, def);
  if (mark)
    return no(
      `It was dug in ${dateOf(mark.day).year}${mark.by === me.id ? ", by you" : ""}: there's nothing left to take.`,
    );
  if (x.caught !== undefined) return no("They drove you off: never again.");
  if (x.found !== undefined) return no("You walked it with their elder.");
  if (x.cold !== undefined) return no("The trail has gone cold.");
  const n = sacredPeople(s, def);
  if (n >= 0 && me.nation === n) return no("It's your own people's.");
  if (life.travel) return no("Not on the road.");
  if (life.prov !== sacredProv(w, def))
    return no(`Only at the place itself (${SACRED_PLACE[def.key]}).`);
  if (x.next > s.day) return no("Give it a season before trying again.");
  if (life.purse < PLUNDER.cost)
    return no(`A digging party costs ${PLUNDER.cost} coins.`);
  return yes;
}

/** The odds, from the same table the dig rolls by: what the page shows before the click. */
export function plunderOdds(
  s: GameState,
  life: Life,
  def: LegendDef,
): {
  cost: number;
  level: number;
  bonus: number;
  dc: number;
  /** Dug unseen: then a find by its chance. */
  pass: number;
  /** Failed: caught at it, or away unseen with nothing. */
  caught: number;
  empty: number;
  finds: { find: PlunderFind; p: number }[];
  /** The coins expected, all told (less the cost). */
  expected: number;
} {
  const level = skillLevel(s, life, PLUNDER.skill);
  const bonus = stepsDone(progressOf(life, def.key)) * PLUNDER.known;
  const pass = checkChance(level + bonus, PLUNDER.dc);
  const finds = (PLUNDER_FINDS[def.key] ?? []).map((find) => ({
    find,
    p: pass * find.chance,
  }));
  const expected =
    finds.reduce(
      (m, f) => m + (f.p * (f.find.coins[0] + f.find.coins[1])) / 2,
      0,
    ) - PLUNDER.cost;
  return {
    cost: PLUNDER.cost,
    level,
    bonus,
    dc: PLUNDER.dc,
    pass,
    caught: (1 - pass) * PLUNDER.caught,
    empty: (1 - pass) * (1 - PLUNDER.caught),
    finds,
    expected: Math.round(expected * 10) / 10,
  };
}

/** Pick a find by its chance (the roll in [0, 1)). */
export function pickFind(key: string, roll: number): PlunderFind | undefined {
  const list = PLUNDER_FINDS[key] ?? [];
  let r = roll;
  for (const f of list) {
    r -= f.chance;
    if (r < 0) return f;
  }
  return list[list.length - 1];
}

/** The nations who are their people's allies (an alliance treaty). */
function alliesOf(s: GameState, n: number): number[] {
  return s.treaties
    .filter((t) => t.kind === "alliance" && (t.a === n || t.b === n))
    .map((t) => (t.a === n ? t.b : t.a))
    .filter((x) => x !== n && s.nations[x]?.alive);
}

/** A nation remembers what a people of another did (its opinion of them). */
function nationRemembers(
  g: ConquestGame,
  n: number,
  of: number,
  why: string,
  value: number,
  years: number,
  by: number,
): void {
  if (n < 0 || of < 0 || n === of) return;
  const x = g.nation(n);
  const list = (x.relations[of] ??= []);
  x.relations[of] = list.filter((m) => m.why !== why);
  x.relations[of].push({
    of: by,
    why,
    value,
    until: g.s.day + DAY_YEARS(years),
  });
}

/** Their people who know you (and their chief) remember it. */
function peopleRemember(
  g: ConquestGame,
  life: Life,
  n: number,
  why: string,
  value: number,
  years: number,
): void {
  const s = g.s;
  const nation = s.nations[n];
  if (!nation) return;
  const who = new Set<number>([nation.ruler, nation.heir]);
  for (const id of Object.keys(life.ties)) {
    const c = s.chars[Number(id)];
    if (c?.alive && c.nation === n) who.add(c.id);
  }
  for (const id of who) {
    const c = s.chars[id];
    if (c?.alive) remembers(g, life, c, why, value, years);
  }
}

/** At home: the bold admire it, the devout think it shameful. */
function neighboursHear(g: ConquestGame, life: Life, place: string): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  for (const id of Object.keys(life.ties)) {
    const c = s.chars[Number(id)];
    if (!c?.alive || c.nation !== me.nation || c.id === me.id) continue;
    if (PLUNDER.devout.traits.some((t) => hasTrait(c, t)))
      remembers(
        g,
        life,
        c,
        `Dug up the Indians' sacred place at ${place}`,
        PLUNDER.devout.value,
        PLUNDER.devout.years,
      );
    else if (PLUNDER.bold.traits.some((t) => hasTrait(c, t)))
      remembers(
        g,
        life,
        c,
        `Dared to dig at ${place}`,
        PLUNDER.bold.value,
        PLUNDER.bold.years,
      );
  }
  addRenown(g, life, PLUNDER.renown);
}

/** Dig the place (the command). */
export function plunder(
  g: ConquestGame,
  life: Life,
  key: string,
): string | null {
  const s = g.s;
  const ok = plunderCheck(s, g.w, life, key);
  if (!ok.ok) return ok.why;
  const def = LEGEND_BY_KEY.get(key)!;
  const me = meOf(s, life)!;
  const x = progressOf(life, key)!;
  const place = placeName(def);
  const n = sacredPeople(s, def);
  const people = thePeople(s.nations[n]?.name ?? "its people");
  const odds = plunderOdds(s, life, def);
  touchLife(g, life);
  withFlow(
    g,
    { key: `legend:plunder:${key}`, label: `A digging party for ${place}` },
    () => spend(g, life, PLUNDER.cost),
  );
  const d = ldice(s, 0x10, life.c, s.day, LEGENDS.indexOf(def));
  const pass = d.chance(odds.pass);
  gainXp(g, life, PLUNDER.skill, pass ? 20 : 8);
  const trusted = stepsDone(x) > 0;
  if (!pass) {
    if (!d.chance(PLUNDER.caught)) {
      x.next = s.day + PLUNDER.retry;
      secretNote(
        g,
        life,
        `At ${place} you go in by night with spades and a guide, and come away before dawn with nothing. Nobody saw you, this time.`,
        "bad",
      );
      return null;
    }
    // Caught at it.
    x.caught = s.day;
    x.cold = s.day;
    hurt(g, life, PLUNDER.hurt, `driven off from ${place}`);
    addStress(g, life, 8);
    nationRemembers(
      g,
      n,
      me.nation,
      `Diggers caught at ${place}`,
      PLUNDER.tried.value,
      PLUNDER.tried.years,
      me.id,
    );
    peopleRemember(
      g,
      life,
      n,
      `Tried to dig at ${place}`,
      PLUNDER.person.value / 2,
      PLUNDER.person.years / 2,
    );
    journal(
      g,
      life,
      `At ${place}, the young men of ${people} catch you at it. You're beaten and driven off, and the place is closed to you for good.`,
      "bad",
    );
    rumour(
      g,
      life.prov,
      `${me.first} ${me.family} was caught digging at ${place}, and driven off.`,
      me.id,
      "bad",
    );
    return null;
  }
  // Dug, and found.
  const find = pickFind(key, d.next())!;
  const coins = find.coins[1] > 0 ? d.int(find.coins[0], find.coins[1]) : 0;
  if (coins > 0)
    withFlow(
      g,
      {
        key: `legend:plunder:${key}`,
        label: `What was dug at ${place}`,
        chance: true,
      },
      () => earn(g, life, coins),
    );
  x.plundered = s.day;
  x.found = s.day;
  x.outcome = `plunder:${find.key}`;
  x.got = coins;
  if (find.relic) x.relic = find.relic;
  delete x.keepDue;
  if (find.renown) addRenown(g, life, find.renown);
  // Their people come for what was taken (if anything was).
  if (coins > 0 || find.relic)
    x.reckonDue =
      s.day +
      ldice(s, 0x11, life.c, s.day).int(PLUNDER.reckon[0], PLUNDER.reckon[1]);
  // Remembered: on their nation, for every page to see.
  if (n >= 0) {
    const nation = g.nation(n);
    nation.sacred = {
      ...(nation.sacred ?? {}),
      [key]: {
        day: s.day,
        by: me.id,
        name: `${me.first} ${me.family}`,
        nation: me.nation,
      },
    };
  }
  nationRemembers(
    g,
    n,
    me.nation,
    `The plundering of ${place}`,
    PLUNDER.people.value + (trusted ? PLUNDER.faith.value : 0),
    PLUNDER.people.years,
    me.id,
  );
  for (const a of alliesOf(s, n))
    nationRemembers(
      g,
      a,
      me.nation,
      `The plundering of ${place}`,
      PLUNDER.allies.value,
      PLUNDER.allies.years,
      me.id,
    );
  peopleRemember(
    g,
    life,
    n,
    trusted ? `Broke faith, and dug at ${place}` : `Dug at ${place}`,
    PLUNDER.person.value + (trusted ? PLUNDER.faith.value : 0),
    PLUNDER.person.years,
  );
  neighboursHear(g, life, place);
  if (trusted) addRenown(g, life, PLUNDER.faith.renown);
  milestone(
    g,
    life,
    "find",
    `Dug at ${place} for what was buried there`,
    life.prov,
    {
      big: true,
    },
  );
  g.event({
    k: "news",
    day: s.day,
    n,
    p: life.prov,
    text: `Treasure-seekers have dug at ${place}. ${cap(people)} will not forget it.`,
  });
  rumour(
    g,
    life.prov,
    `${me.first} ${me.family} dug at ${place}, they say, and came away with something. Some call it bold; the ministers call it a disgrace.`,
    me.id,
    "bad",
  );
  raiseEvent(g, life, "legend-plundered", {
    i: LEGENDS.indexOf(def),
    f: (PLUNDER_FINDS[key] ?? []).indexOf(find),
    c: coins,
  });
  return null;
}

// ---------------------------------------------------------------- their people come for it

/** What the amends would cost (the scene's price). */
export function amendsOf(x: LegendProgress | undefined): number {
  return Math.max(RECKONING.payMin, Math.round((x?.got ?? 0) * RECKONING.pay));
}

hooks.lifeMonthly.push((g, life) => {
  if (!legendsOn(life) || life.watching || life.c < 0) return;
  for (const x of life.legends?.list ?? []) {
    if (x.reckonDue === undefined || x.reckonDue > g.s.day) continue;
    touchLife(g, life);
    delete x.reckonDue;
    raiseEvent(g, life, "legend-reckoning", {
      i: LEGENDS.findIndex((d) => d.key === x.key),
    });
  }
});

/** How the reckoning ended: what it does. */
export function reckon(
  g: ConquestGame,
  life: Life,
  i: number,
  how: "returned" | "paid" | "talked" | "fought" | "lost",
  pass: boolean,
): void {
  const s = g.s;
  const def = LEGENDS[i];
  const me = meOf(s, life);
  if (!def || !me) return;
  const x = progressOf(life, def.key);
  if (!x) return;
  touchLife(g, life);
  const place = placeName(def);
  const n = sacredPeople(s, def);
  const why = `The plundering of ${place}`;
  const take = () => {
    const lose = Math.min(
      Math.max(0, life.purse) * RECKONING.take,
      Math.max(RECKONING.payMin, x.got ?? 0),
    );
    if (lose > 0)
      withFlow(
        g,
        {
          key: `legend:reckoning:${def.key}`,
          label: `Taken back for ${place}`,
        },
        () => spend(g, life, Math.round(lose)),
      );
    if (x.relic) delete x.relic;
  };
  switch (how) {
    case "returned":
      if (x.relic) delete x.relic;
      withFlow(
        g,
        { key: `legend:reckoning:${def.key}`, label: `Amends for ${place}` },
        () => spend(g, life, Math.min(life.purse, x.got ?? 0)),
      );
      nationRemembers(
        g,
        n,
        me.nation,
        why,
        RECKONING.eased.value,
        RECKONING.eased.years,
        me.id,
      );
      peopleRemember(
        g,
        life,
        n,
        `Gave back what was taken from ${place}`,
        15,
        10,
      );
      x.reckoned = "returned";
      return;
    case "paid":
      withFlow(
        g,
        { key: `legend:reckoning:${def.key}`, label: `Amends for ${place}` },
        () => spend(g, life, amendsOf(x)),
      );
      x.reckoned = "paid";
      return;
    case "talked":
      if (pass) {
        x.reckoned = "talked";
        return;
      }
      take();
      hurt(
        g,
        life,
        Math.round(RECKONING.hurt / 2),
        `the reckoning for ${place}`,
      );
      x.reckoned = "lost";
      return;
    case "fought":
      if (pass) {
        addRenown(g, life, 2);
        nationRemembers(
          g,
          n,
          me.nation,
          `${why}, and the fight after`,
          RECKONING.angrier.value,
          RECKONING.angrier.years,
          me.id,
        );
        x.reckoned = "fought";
        return;
      }
      take();
      hurt(g, life, RECKONING.hurt, `the reckoning for ${place}`);
      x.reckoned = "lost";
      return;
    case "lost":
      take();
      addStress(g, life, 6);
      x.reckoned = "lost";
      return;
  }
}

hooks.command.push((g, life, c: LifeCommand) => {
  if (c.k !== "legend" || c.act !== "plunder") return undefined;
  return plunder(g, life, String(c.key ?? ""));
});

/** For the guide: every place's finds, by the table. */
export function plunderRows(): { def: LegendDef; finds: PlunderFind[] }[] {
  return LEGENDS.filter((d) => d.kind === "sacred").map((def) => ({
    def,
    finds: PLUNDER_FINDS[def.key] ?? [],
  }));
}
