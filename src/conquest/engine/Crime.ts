// LIFE (r11): crime and the law. A crooked living pays well and draws heat:
// how hard a nation's law is looking for you. The sharper a town's watch and
// the hotter you are, the likelier a hand on your collar. Then it's the
// gaol, the quarter sessions and a sentence: a fine, the pillory, the whip,
// the brand, months in gaol, transportation to the far colonies, or the
// rope. Notoriety is your name in the underworld: it opens the den, the
// fence's better rates and the gang's respect, and honest folk shun it.
// Lawmen walk the other side: rogues taken up, rewards, and bribes offered.

import { landBoat } from "./Boats";
import { kill } from "./Characters";
import {
  heatOf,
  isLawman,
  knowsDen,
  lawAt,
  notorietyOf,
  watchStrength,
} from "./CrimeQueries";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  beginOutcome,
  earn,
  endOutcome,
  gainXp,
  hurt,
  journal,
  milestone,
  outcomeMeta,
  rollCheck,
  setCooldown,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance, JOBS } from "./LifeRules";
import type { World } from "./Map";
import { wake } from "./Pace";
import { charName } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { effortOf, EFFORTS } from "./Trades";
import type {
  CrimeState,
  GameState,
  JobKind,
  Life,
  LifeCommand,
  PlaceKind,
  Skill,
} from "./Types";
import { leaveJob, startJob } from "./Work";

// ---------------------------------------------------------------- state

export function crimeState(g: ConquestGame, life: Life): CrimeState {
  touchLife(g, life);
  life.crime ??= { notoriety: 0, heat: {}, dens: [], record: [], jail: null };
  return life.crime;
}

export function addHeat(
  g: ConquestGame,
  life: Life,
  nation: number,
  n: number,
): void {
  if (nation < 0 || n === 0) return;
  const c = crimeState(g, life);
  const v = Math.max(0, Math.min(100, (c.heat[nation] ?? 0) + n));
  if (v < 0.05) delete c.heat[nation];
  else c.heat[nation] = Math.round(v * 10) / 10;
}

export function addNotoriety(g: ConquestGame, life: Life, n: number): void {
  if (n === 0) return;
  const c = crimeState(g, life);
  c.notoriety = Math.max(
    0,
    Math.min(100, Math.round((c.notoriety + n) * 100) / 100),
  );
}

/** What a crooked trade is charged as, at a rung. */
export function crimeName(kind: JobKind, rank: number): string {
  switch (kind) {
    case "thief":
      return rank >= 2 ? "burglary" : "theft";
    case "fence":
      return "receiving stolen goods";
    case "smuggler":
      return "smuggling";
    case "highwayman":
      return "highway robbery";
    case "counterfeiter":
      return rank === 0 ? "uttering false coin" : "coining";
    case "pirate":
      return "piracy";
    default:
      return "theft";
  }
}

/** How grave a charge is: 1 petty, 2 a felony, 3 a hanging matter, 4 murder. */
export function crimeGrade(kind: JobKind, rank: number): number {
  const def = JOBS[kind];
  if (!def.crime) return 1;
  if (kind === "thief") return rank >= 4 ? 3 : rank >= 2 ? 2 : 1;
  if (kind === "counterfeiter") return rank === 0 ? 2 : 3;
  if (kind === "fence") return rank >= 2 ? 2 : 1;
  return def.crime.grade;
}

// ---------------------------------------------------------------- the working day

/** Heat cools every day you're not drawing more: about a third a month. */
const HEAT_COOL = 0.985;

/** A crooked day's work: heat drawn, a name made, and maybe the watch. */
export function crimeWorkDay(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): void {
  const job = life.job;
  if (!job) return;
  const def = JOBS[job.kind];
  if (!def.crime) return;
  const s = g.s;
  const e = EFFORTS[effortOf(life)];
  const nation = lawAt(s, life.prov);
  const stealth = skillLevel(s, life, "stealth");
  const gain = def.crime.heat * e.heat * Math.max(0.35, 1 - stealth * 0.03);
  addHeat(g, life, nation, gain);
  addNotoriety(g, life, 0.05 * e.heat);
  gainXp(g, life, "stealth", 0.2, true);
  // The watch: sharper in a big town, the hotter you are the likelier.
  const watch = watchStrength(s, g.w, life.prov).total;
  const heat = heatOf(life, nation);
  const chance =
    (watch / 100) * (heat / 100) * 0.03 * Math.max(0.4, 1 - stealth * 0.025);
  if (life.events.some((x) => x.key === "crime-seized")) return;
  if (g.rng.chance(chance))
    raise("crime-seized", {
      g: crimeGrade(job.kind, job.rank),
      n: nation,
      k: Object.keys(JOBS).indexOf(job.kind),
      r: job.rank,
    });
  else if (g.rng.chance(1 / 30) && !life.events.length) {
    const last = life.work?.matter ?? -999;
    if (s.day - last >= 21) {
      touchLife(g, life);
      life.work ??= { effort: "steady" };
      life.work.matter = s.day;
      raise("crime-score", { n: nation });
    }
  }
}

/** A lawman's day: now and then a rogue to take up, or a bribe offered. */
export function lawWorkDay(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): void {
  const job = life.job;
  if (!job || life.events.length) return;
  const s = g.s;
  const last = life.work?.matter ?? -999;
  if (s.day - last < 18) return;
  const watch = watchStrength(s, g.w, life.prov).total;
  // More rogues in a bigger town.
  if (!g.rng.chance(0.02 + watch / 4000)) return;
  touchLife(g, life);
  life.work ??= { effort: "steady" };
  life.work.matter = s.day;
  raise(g.rng.chance(0.3) ? "law-bribe" : "law-collar", {
    g: g.rng.int(1, job.kind === "thieftaker" ? 3 : 2),
  });
}

// ---------------------------------------------------------------- caught

/** Into the gaol to wait for the quarter sessions. */
export function jail(
  g: ConquestGame,
  life: Life,
  charge: string,
  grade: number,
  nation: number,
): void {
  const c = crimeState(g, life);
  const s = g.s;
  if (life.travel) {
    // Taken on the road: held where they caught you (your boat with you).
    if (life.travel.boat !== undefined)
      landBoat(g, life, life.travel.boat, life.prov);
    life.travel = null;
  }
  c.jail = {
    p: life.prov,
    until: s.day + g.rng.int(8, 21),
    charge,
    grade,
    trial: true,
    nation,
  };
  life.area = hasPlace(s, g.w, life.prov, "gaol") ? "gaol" : life.area;
  journal(
    g,
    life,
    `You're taken up for ${charge} and locked in the gaol at ${g.map.provinces[life.prov].name} to wait for the quarter sessions.`,
    "bad",
  );
  addStress(g, life, 12);
  wake(g, life, `You're in the gaol, charged with ${charge}.`);
}

export interface Sentence {
  key: "fine" | "pillory" | "whip" | "brand" | "gaol" | "transport" | "hang";
  text: string;
  /** Months in the gaol, years transported, coins fined. */
  n: number;
}

/** What the court hands down, for a grade and a record. */
export function sentenceFor(
  grade: number,
  priors: number,
  lighter = false,
): Sentence {
  // A record makes it worse, but only a hanging matter hangs: petty theft
  // stops at the whip, a burglar's last stop is transportation.
  const ceiling = grade >= 3 ? Infinity : grade + 1;
  const g = Math.max(
    1,
    Math.min(
      ceiling,
      grade + Math.min(grade >= 2 ? 2 : 1, priors) - (lighter ? 1 : 0),
    ),
  );
  if (g <= 1)
    return grade >= 2
      ? // A felony, pleaded and forgiven a little: never just a fine.
        { key: "gaol", text: "three months in the gaol", n: 3 }
      : priors === 0
        ? { key: "fine", text: "a fine of 10 coins", n: 10 }
        : { key: "pillory", text: "an hour in the pillory", n: 0 };
  if (g === 2)
    return {
      key: "whip",
      text: "a whipping and three months in the gaol",
      n: 3,
    };
  if (g === 3)
    return { key: "transport", text: "transportation for seven years", n: 7 };
  return { key: "hang", text: "hanging", n: 0 };
}

/** Where a convict of a nation is sent: the farthest colony of theirs, warm if it can be. */
function transportTo(g: ConquestGame, life: Life, nation: number): number {
  const s = g.s;
  const from = g.map.provinces[life.prov];
  let best = -1;
  let far = -1;
  s.provinces.forEach((pr, p) => {
    if (pr.owner !== nation || pr.occupier >= 0 || p === life.prov) return;
    const d = g.map.provinces[p];
    const km = Math.hypot(d.lat - from.lat, (d.lon - from.lon) * 0.8);
    const score = km + (g.w.tropical[p] ? 20 : 0);
    if (score > far) {
      far = score;
      best = p;
    }
  });
  return best;
}

/** The sentence carried out. Returns false if it killed them. */
export function punish(
  g: ConquestGame,
  life: Life,
  sentence: Sentence,
  charge: string,
  nation: number,
): boolean {
  const c = crimeState(g, life);
  const s = g.s;
  const me = meOf(s, life);
  const here = g.map.provinces[life.prov].name;
  c.record.push({
    day: s.day,
    crime: charge,
    sentence: sentence.text,
    p: life.prov,
  });
  if (c.record.length > 12) c.record.splice(0, c.record.length - 12);
  c.jail = null;
  milestone(g, life, "convicted", `Convicted of ${charge}: ${sentence.text}`);
  switch (sentence.key) {
    case "fine":
      spend(g, life, sentence.n);
      addRenown(g, life, -1);
      journal(
        g,
        life,
        `Fined ${sentence.n} coins for ${charge}. The clerk wrote your name down slowly.`,
        "bad",
      );
      break;
    case "pillory":
      addRenown(g, life, -3);
      addStress(g, life, 12);
      hurt(g, life, 4, "the pillory");
      journal(
        g,
        life,
        `An hour in the pillory at ${here}: rotten cabbage, worse eggs, and your neighbours' aim.`,
        "bad",
      );
      break;
    case "whip":
      hurt(g, life, 12, "a whipping at the cart's tail");
      addStress(g, life, 10);
      addRenown(g, life, -2);
      c.jail = {
        p: life.prov,
        until: s.day + sentence.n * 30,
        charge,
        grade: 0,
        trial: false,
        nation,
      };
      journal(
        g,
        life,
        `Whipped at the cart's tail through ${here}, then three months in the gaol.`,
        "bad",
      );
      break;
    case "brand":
      c.branded = true;
      addRenown(g, life, -3);
      hurt(g, life, 5, "the branding iron");
      journal(
        g,
        life,
        "Burned on the thumb with the felon's mark, and let go. You'll never quite hide that hand again.",
        "bad",
      );
      break;
    case "gaol":
      c.jail = {
        p: life.prov,
        until: s.day + sentence.n * 30,
        charge,
        grade: 0,
        trial: false,
        nation,
      };
      journal(g, life, `${sentence.n} months in the gaol.`, "bad");
      break;
    case "transport": {
      const to = transportTo(g, life, nation);
      if (to < 0 || !me) {
        // Nowhere to send them: the gaol instead.
        c.jail = {
          p: life.prov,
          until: s.day + 12 * 30,
          charge,
          grade: 0,
          trial: false,
          nation,
        };
        journal(
          g,
          life,
          "Sentenced to transportation, but there's no colony to send you to: a year in the gaol instead.",
          "bad",
        );
        break;
      }
      if (life.job) leaveJob(g, life, "in irons");
      // A felon's goods and money are forfeit to the Crown.
      const forfeit = Math.max(0, Math.round(life.purse * 0.9 * 10) / 10);
      if (forfeit > 0) spend(g, life, forfeit);
      life.goods = {};
      life.travel = null;
      life.prov = to;
      life.area = undefined;
      c.transported = s.day + sentence.n * DAYS_PER_YEAR;
      c.heat = {};
      startJob(g, life, "servant", "fields", 0, -1, false);
      if (life.job) life.job.until = c.transported;
      journal(
        g,
        life,
        `Transported in chains to ${g.map.provinces[to].name}, bound to labour for ${sentence.n} years.${forfeit > 0 ? ` Your money (${forfeit} coins) and goods are forfeit to the Crown.` : ""} Your name stays behind on the court roll.`,
        "bad",
      );
      addStress(g, life, 20);
      break;
    }
    case "hang":
      journal(
        g,
        life,
        `Hanged at ${here} for ${charge}. A crowd came to watch; a ballad was sold.`,
        "bad",
      );
      if (me?.alive) kill(g, me, `hanged at ${here} for ${charge}`);
      return false;
  }
  wake(g, life, `Sentenced: ${sentence.text}.`);
  // Paid for, in the eyes of the law.
  c.heat[nation] = Math.min(c.heat[nation] ?? 0, 10);
  if (c.heat[nation] < 0.05) delete c.heat[nation];
  return true;
}

/** A governor's mercy: the rope commuted, for a name or a friend at court. */
export function reprieved(
  g: ConquestGame,
  life: Life,
  nation: number,
): boolean {
  const s = g.s;
  const n = s.nations[nation];
  const gov = n ? s.chars[n.ruler] : undefined;
  let chance = 0.15;
  if (life.renown >= 40) chance += 0.2;
  if (life.patron >= 0 && s.chars[life.patron]?.alive) chance += 0.15;
  if (gov && life.ties[gov.id] === "friend") chance += 0.3;
  if ((life.crime?.record.length ?? 0) >= 2) chance -= 0.1;
  return g.rng.chance(Math.max(0.05, Math.min(0.7, chance)));
}

// ---------------------------------------------------------------- the days and months

/** The gaol's days: fever, worry, and the doors opening (or the court sitting). */
export function crimeDaily(g: ConquestGame, life: Life): void {
  const c = life.crime;
  if (!c) return;
  const s = g.s;
  // Heat cools while you're not drawing more.
  const working = !!life.job && !!JOBS[life.job.kind].crime;
  for (const k of Object.keys(c.heat)) {
    const v = c.heat[Number(k)] * (working ? HEAT_COOL : HEAT_COOL - 0.005);
    if (v < 0.05) delete c.heat[Number(k)];
    else c.heat[Number(k)] = Math.round(v * 100) / 100;
  }
  if (c.transported && c.transported <= s.day) {
    delete c.transported;
    journal(
      g,
      life,
      "Your term of transportation is served. You're free, a long way from home.",
      "good",
    );
    wake(g, life, "Your transportation is served.");
  }
  const j = c.jail;
  if (!j) {
    hotPursuit(g, life);
    return;
  }
  touchLife(g, life);
  if (life.prov !== j.p) life.prov = j.p;
  if (s.day % 7 === 0) {
    hurt(g, life, 1, "gaol fever");
    addStress(g, life, 2);
  }
  if (s.day < j.until) return;
  if (j.trial) {
    if (!life.events.some((e) => e.key === "crime-trial")) {
      raiseEvent(g, life, "crime-trial", { g: j.grade, n: j.nation });
      // A trial can't wait forever: if nobody answers it's decided for you.
      j.until = s.day + 60;
    }
    return;
  }
  c.jail = null;
  journal(
    g,
    life,
    "The gaoler turns the key the other way: you're free.",
    "good",
  );
  wake(g, life, "You're out of the gaol.");
}

/** A wanted rogue in a colony of the nation hunting them may be seized any day. */
function hotPursuit(g: ConquestGame, life: Life): void {
  if (life.travel || life.events.length) return;
  const s = g.s;
  const nation = lawAt(s, life.prov);
  const heat = heatOf(life, nation);
  if (heat < 45) return;
  const watch = watchStrength(s, g.w, life.prov).total;
  const stealth = skillLevel(s, life, "stealth");
  const chance =
    ((heat - 40) / 100) *
    (watch / 100) *
    0.04 *
    Math.max(0.4, 1 - stealth * 0.03);
  if (!g.rng.chance(chance)) return;
  const job = life.job;
  const crooked = !!job && !!JOBS[job.kind].crime;
  const kind = crooked ? job.kind : "thief";
  // An honest post's rank says nothing of the crime: petty theft.
  const rank = crooked ? job.rank : 0;
  raiseEvent(g, life, "crime-seized", {
    g: crimeGrade(kind, rank),
    n: nation,
    k: Object.keys(JOBS).indexOf(kind),
    r: rank,
  });
}

/** A month: notoriety fades if it isn't fed. */
export function crimeMonthly(g: ConquestGame, life: Life): void {
  const c = life.crime;
  if (!c) return;
  const working = !!life.job && !!JOBS[life.job.kind].crime;
  if (!working && c.notoriety > 0) addNotoriety(g, life, -0.5);
}

// ---------------------------------------------------------------- what can be done (acts)

export interface CrimeActDef {
  key: string;
  places: PlaceKind[];
  label: string;
  text: string;
  cooldown: number;
  cost?: (s: GameState, life: Life) => number;
  skill?: Skill;
  dc?: number;
  /** Only for lawmen, or only from a cell. */
  law?: boolean;
  jailed?: boolean;
  when?: (s: GameState, w: World, life: Life) => Check;
}

const bribeCost = (s: GameState, life: Life) => {
  const grade = life.crime?.jail?.grade ?? 1;
  return 15 + grade * 15;
};

export const CRIME_ACTS: CrimeActDef[] = [
  {
    key: "listen",
    places: ["tavern"],
    label: "Listen for the underworld",
    text: "Buy the right man a drink, ask the wrong questions quietly, and find where the den is.",
    cooldown: 30,
    skill: "stealth",
    dc: 6,
    when: (s, w, life) =>
      knowsDen(life, life.prov)
        ? no("You know the den here already.")
        : hasPlace(s, w, life.prov, "den")
          ? yes
          : no("Too small a town for a den."),
  },
  {
    key: "pick",
    places: ["market", "tavern"],
    label: "Pick a pocket",
    text: "A crowded market and a careless purse. Quick coins, and the watch if you're clumsy.",
    cooldown: 10,
    skill: "stealth",
    dc: 6,
  },
  {
    key: "lielow",
    places: ["den"],
    label: "Lie low",
    text: "A back room and a fortnight indoors: the law here forgets you a little.",
    cooldown: 30,
    cost: () => 4,
    when: (s, w, life) =>
      heatOf(life, lawAt(s, life.prov)) > 0
        ? yes
        : no("Nobody's looking for you here."),
  },
  {
    key: "papers",
    places: ["den"],
    label: "Buy forged papers",
    text: "A new name on a good forgery: the law here loses track of you.",
    cooldown: 180,
    cost: () => 25,
    when: (s, w, life) =>
      heatOf(life, lawAt(s, life.prov)) >= 10
        ? yes
        : no("You don't need a new name yet."),
  },
  {
    key: "payoff",
    places: ["den"],
    label: "Square the watch",
    text: "The fence knows which constable takes money. Some of the heat goes away.",
    cooldown: 60,
    cost: (s, life) => 10 + Math.round(heatOf(life, lawAt(s, life.prov)) / 2),
    when: (s, w, life) =>
      heatOf(life, lawAt(s, life.prov)) >= 5
        ? yes
        : no("Nobody's looking for you here."),
  },
  {
    key: "score",
    places: ["den"],
    label: "Plan a big job",
    text: "The fence has heard of something worth taking. Rich, and risky.",
    cooldown: 45,
    when: (s, w, life) =>
      notorietyOf(life) >= 5
        ? yes
        : no("Nobody trusts you with a big job yet (notoriety 5)."),
  },
  {
    key: "amends",
    places: ["gaol"],
    label: "Make amends",
    text: "Pay back what was taken, and a fee to the court: the law here thinks better of you.",
    cooldown: 90,
    cost: (s, life) =>
      Math.max(5, Math.round(heatOf(life, lawAt(s, life.prov)) * 1.5)),
    when: (s, w, life) =>
      heatOf(life, lawAt(s, life.prov)) >= 5
        ? yes
        : no("The law has nothing against you here."),
  },
  {
    key: "raid",
    places: ["gaol"],
    label: "Raid the den",
    text: "Take the watch into the den with lanterns and staves. Rogues taken, loot seized, and a fight.",
    cooldown: 60,
    skill: "leadership",
    dc: 7,
    law: true,
  },
  {
    key: "gaoler",
    places: ["gaol"],
    label: "Bribe the gaoler",
    text: "A purse through the bars, and the door left on the latch. You'll be a fugitive.",
    cooldown: 7,
    cost: bribeCost,
    jailed: true,
  },
  {
    key: "breakout",
    places: ["gaol"],
    label: "Break out",
    text: "A loose bar, a rope of blankets, and a long drop. Get caught and it's worse.",
    cooldown: 14,
    skill: "stealth",
    dc: 9,
    jailed: true,
  },
];

export const CRIME_ACT_BY_KEY = new Map(CRIME_ACTS.map((a) => [a.key, a]));

/** Whether a crime act can be done here now. */
export function crimeActCheck(
  s: GameState,
  w: World,
  life: Life,
  place: PlaceKind,
  key: string,
): Check {
  const def = CRIME_ACT_BY_KEY.get(key);
  if (!def || !def.places.includes(place)) return no("Not here.");
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  const jailed = !!life.crime?.jail;
  if (def.jailed && !jailed) return no("You're not in the gaol.");
  if (!def.jailed && jailed) return no("Not from a cell.");
  if (life.travel) return no("You're on the road.");
  if (!hasPlace(s, w, life.prov, place))
    return no("There's no such place here.");
  if (place === "den" && !knowsDen(life, life.prov))
    return no("You don't know where the den is.");
  if (def.law && !isLawman(life)) return no("Only for the watch and the law.");
  if (lifeIsNative(s, life) && place !== "gaol" && def.key !== "listen")
    return no("Not your people's way.");
  const left = Math.max(0, (life.cooldowns[`crime:${key}`] ?? 0) - s.day);
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  const cost = def.cost?.(s, life) ?? 0;
  if (cost && life.purse < cost) return no(`Costs ${cost} coins.`);
  if (def.when) {
    const c = def.when(s, w, life);
    if (!c.ok) return c;
  }
  return yes;
}

export function crimeActOdds(
  s: GameState,
  life: Life,
  key: string,
): number | null {
  const def = CRIME_ACT_BY_KEY.get(key);
  if (!def?.skill || def.dc === undefined) return null;
  return checkChance(skillLevel(s, life, def.skill), def.dc);
}

/** Do a crime (or law) act here, as a scene. */
export function doCrimeAct(
  g: ConquestGame,
  life: Life,
  key: string,
): string | null {
  const s = g.s;
  const def = CRIME_ACT_BY_KEY.get(key);
  if (!def) return "Unknown.";
  const place =
    def.places.find((p) => p === life.area) ??
    def.places.find((p) => hasPlace(s, g.w, life.prov, p));
  if (!place) return "Not here.";
  const check = crimeActCheck(s, g.w, life, place, key);
  if (!check.ok) return check.why;
  beginOutcome(g, life);
  let err: string | null = null;
  try {
    err = runCrimeAct(g, life, def, place);
  } finally {
    endOutcome(g, life, "act", err !== null);
  }
  return err;
}

function runCrimeAct(
  g: ConquestGame,
  life: Life,
  def: CrimeActDef,
  place: PlaceKind,
): string | null {
  const s = g.s;
  const nation = lawAt(s, life.prov);
  const odds = crimeActOdds(s, life, def.key);
  const pass = odds === null ? true : rollCheck(g, odds);
  outcomeMeta(g, life, {
    key: def.key,
    title: def.label,
    scene: place,
    c: -1,
    ok: odds === null ? null : pass,
  });
  setCooldown(g, life, `crime:${def.key}`, def.cooldown);
  const cost = def.cost?.(s, life) ?? 0;
  if (cost) spend(g, life, cost);
  if (def.skill) gainXp(g, life, def.skill, pass ? 6 : 3);
  const c = crimeState(g, life);
  life.area = place;
  switch (def.key) {
    case "listen":
      if (pass) {
        if (!c.dens.includes(life.prov)) c.dens.push(life.prov);
        journal(
          g,
          life,
          "A sailor with one ear and a long memory tells you where the den is, and what to say at the door.",
          "good",
        );
      } else {
        addHeat(g, life, nation, 3);
        journal(
          g,
          life,
          "Nobody will tell you anything, and somebody noticed you asking.",
          "bad",
        );
      }
      return null;
    case "pick":
      if (pass) {
        const got =
          g.rng.int(1, 4) + Math.floor(skillLevel(s, life, "stealth") / 5);
        earn(g, life, got);
        addNotoriety(g, life, 1);
        addHeat(g, life, nation, 6);
        journal(
          g,
          life,
          `A purse lifted clean: ${got} coins, and nobody the wiser.`,
          "good",
        );
      } else {
        addHeat(g, life, nation, 12);
        if (g.rng.chance(0.35))
          raiseEvent(g, life, "crime-seized", {
            g: 1,
            n: nation,
            k: Object.keys(JOBS).indexOf("thief"),
            r: 0,
          });
        else
          journal(
            g,
            life,
            '"Stop, thief!" You ran, and you got away, this time.',
            "bad",
          );
      }
      return null;
    case "lielow":
      addHeat(g, life, nation, -15);
      addStress(g, life, 2);
      journal(
        g,
        life,
        "A fortnight behind a curtain playing cards with men who cheat. The law forgets you a little.",
      );
      return null;
    case "papers":
      addHeat(g, life, nation, -35);
      journal(
        g,
        life,
        "A fine forgery, with a new name you'll have to remember to answer to.",
        "good",
      );
      return null;
    case "payoff":
      addHeat(g, life, nation, -25);
      journal(
        g,
        life,
        "Money changes hands in the dark. A constable's memory grows short.",
      );
      return null;
    case "score":
      raiseEvent(g, life, "crime-score", { n: nation });
      return null;
    case "amends":
      addHeat(g, life, nation, -40);
      addRenown(g, life, 0.5);
      journal(
        g,
        life,
        "You pay what's owed and the court's fee. The justices look at you differently, for now.",
        "good",
      );
      return null;
    case "raid": {
      gainXp(g, life, "fighting", 6);
      if (pass) {
        const loot = g.rng.int(4, 12);
        earn(g, life, loot);
        addRenown(g, life, 2);
        c.arrests = (c.arrests ?? 0) + g.rng.int(1, 3);
        journal(
          g,
          life,
          `You raided the den with the watch: rogues in irons, and ${loot} coins of seized goods as your share.`,
          "good",
        );
      } else {
        hurt(g, life, 10, "a raid on the thieves' den");
        journal(
          g,
          life,
          "They were waiting for you. Bottles, knives and a broken lantern: you came out bloody and empty-handed.",
          "bad",
        );
      }
      return null;
    }
    case "gaoler":
      return escape(
        g,
        life,
        "The gaoler counts your coins, yawns, and forgets to lock the door.",
      );
    case "breakout":
      if (pass)
        return escape(
          g,
          life,
          "A loose bar, a rope of blankets, a long drop, and the dark.",
        );
      hurt(g, life, 8, "a fall from the gaol wall");
      if (c.jail) c.jail.until += 30;
      journal(
        g,
        life,
        "Caught halfway down the wall. A month added, and the irons on.",
        "bad",
      );
      return null;
  }
  return null;
}

function escape(g: ConquestGame, life: Life, how: string): string | null {
  const c = crimeState(g, life);
  const j = c.jail;
  if (!j) return "You're not in the gaol.";
  c.jail = null;
  addHeat(g, life, j.nation, 30);
  addNotoriety(g, life, 5);
  journal(g, life, `${how} You're out, and you're wanted.`, "good");
  wake(g, life, "You've broken out of the gaol.");
  return null;
}

// ---------------------------------------------------------------- the law on another player

/** A lawman takes up a wanted player here. */
export function arrestCheck(s: GameState, life: Life, cId: number): Check {
  const other = lifeOfChar(s, cId);
  if (!other || other === life) return no("Not them.");
  if (!isLawman(life))
    return no("Only the watch and the law can take people up.");
  if (life.job?.prov !== life.prov) return no("Only where you serve.");
  if (other.travel || other.prov !== life.prov) return no("They're not here.");
  if (other.crime?.jail) return no("They're in the gaol already.");
  const nation = lawAt(s, life.prov);
  if (heatOf(other, nation) < 25)
    return no(
      "The law here wants nothing of them (they need a warrant: heat 25).",
    );
  return yes;
}

export function arrest(
  g: ConquestGame,
  life: Life,
  cId: number,
): string | null {
  const check = arrestCheck(g.s, life, cId);
  if (!check.ok) return check.why;
  const other = lifeOfChar(g.s, cId)!;
  const job = other.job;
  const crooked = !!job && !!JOBS[job.kind].crime;
  const kind = crooked ? job.kind : "thief";
  const rank = crooked ? job.rank : 0;
  raiseEvent(g, other, "crime-seized", {
    g: crimeGrade(kind, rank),
    n: lawAt(g.s, life.prov),
    k: Object.keys(JOBS).indexOf(kind),
    r: rank,
    by: life.c,
  });
  setCooldown(g, life, `law:arrest:${cId}`, 30);
  journal(
    g,
    life,
    `You lay a hand on ${charName(meOf(g.s, other))}'s collar in the name of the law.`,
  );
  return null;
}

// ---------------------------------------------------------------- commands

/** The crime and law commands: acts, arrests. Undefined if not ours. */
export function crimeCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k === "crime") return doCrimeAct(g, life, c.act);
  if (c.k === "law") {
    if (c.act === "arrest") return arrest(g, life, c.c ?? -1);
    return doCrimeAct(g, life, c.act);
  }
  return undefined;
}

/** What a cell (or irons) forbids. */
export function crimeGate(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null {
  if (!life.crime?.jail) return null;
  switch (c.k) {
    case "event":
    case "lifestyle":
    case "heir":
    case "will":
    case "crime":
    case "ambition":
      return null;
    case "enter":
      return c.area === "gaol" ? null : "You're locked in the gaol.";
    default:
      return "You're locked in the gaol.";
  }
}
