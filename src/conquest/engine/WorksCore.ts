// TOWNS (r17): a town's public works and the government that votes them.
// The table of works (what each costs, how long it takes, what it does),
// the body that really sat in each kind of town (the county court or the
// vestry in Virginia and Maryland, the town meeting in New England, the
// cabildo in a Spanish town, the habitants' assembly in a French one, the
// council fire in a native town), who sits on it, how each member leans on
// a proposal and why, and the chance it carries: the same numbers the
// sitting rolls, so the odds shown are the odds.

import { dateOf, isMonthStart } from "./Calendar";
import { factionName, hasFactions, interestOf, partyOf } from "./Factions";
import { isNativeChar, opinionOf } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import type { World } from "./Map";
import { ageOf, charName, settlers } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { thash, townFolk } from "./TownsCore";
import type {
  BuildingKind,
  Character,
  FactionKey,
  GameState,
  Life,
  ModFx,
  RoleId,
  TownRuin,
  TownWork,
  TownWorkKey,
} from "./Types";

// ---------------------------------------------------------------- the works

export interface TownWorkDef {
  key: TownWorkKey;
  name: string;
  /** What each people called it, where it differs. */
  names?: Partial<Record<string, string>>;
  text: string;
  /** A native town's work, or a colonial town's. */
  native: boolean;
  /** Coins, built new (a repair is half). */
  cost: number;
  /** Months to build (a repair takes 3 in 5 of them). */
  months: number;
  /** The building it raises a level of (the docks, the church, the fort, the court-house)... */
  b?: BuildingKind;
  /** ...or what it does while it stands (a work the town keeps of its own). */
  fx?: Partial<Record<ModFx, number>>;
  /** What the town must be to have it. */
  folk?: number;
  coast?: boolean;
  /** The interests (or, in a native town, the posts) for and against it. */
  pro: (FactionKey | RoleId)[];
  con?: (FactionKey | RoleId)[];
  /** What it does, in a line. */
  does: string;
}

export const TOWN_WORKS: Record<TownWorkKey, TownWorkDef> = {
  wharf: {
    key: "wharf",
    name: "A wharf",
    names: { french: "A quay" },
    text: "Pilings, planking and a crane: ships tie up at the town, and passages, cargoes and the boatyard come back with them.",
    native: false,
    cost: 60,
    months: 4,
    b: "port",
    coast: true,
    pro: ["merchants", "planters"],
    does: "the docks: passages by sea, ships' work, boats",
  },
  church: {
    key: "church",
    name: "A church",
    names: { puritan: "A meeting house", spanish: "A parish church" },
    text: "A roof over the congregation, a pulpit and a bell, and the town's poor fed at its door.",
    native: false,
    cost: 50,
    months: 6,
    b: "church",
    pro: ["clergy"],
    con: ["country"],
    does: "the church and its work; the unrest of a big town eased",
  },
  markethouse: {
    key: "markethouse",
    name: "A market house",
    text: "An arcade on posts with a room over it: the market kept dry, its weights kept honest.",
    native: false,
    cost: 30,
    months: 3,
    fx: { production: 0.03 },
    folk: 300,
    pro: ["merchants", "planters"],
    does: "the town's trade +3%",
  },
  fort: {
    key: "fort",
    name: "A fort",
    names: { english: "A blockhouse", puritan: "A blockhouse" },
    text: "Earth, logs and a few guns: a place to hold when the raiders come.",
    native: false,
    cost: 70,
    months: 5,
    b: "fort",
    pro: ["frontier"],
    con: ["merchants"],
    does: "the fort: a garrison, slower sieges, the recruiting sergeant",
  },
  school: {
    key: "school",
    name: "A schoolhouse",
    text: "One room, a master and a stove: the town's children taught their letters, and its boys their Latin.",
    native: false,
    cost: 35,
    months: 3,
    folk: 300,
    fx: { unrest: -1 },
    pro: ["clergy"],
    does: "the town keeps a school whatever its size (the Latin school too)",
  },
  road: {
    key: "road",
    name: "A road and a bridge",
    text: "The way to the landing ditched and corduroyed, and a bridge where the ford was.",
    native: false,
    cost: 35,
    months: 4,
    fx: { production: 0.03 },
    pro: ["planters", "frontier"],
    does: "the town's trade +3%",
  },
  warehouse: {
    key: "warehouse",
    name: "A public warehouse",
    text: "A store for the staple, inspected and sealed, so a cargo waits dry for its ship.",
    native: false,
    cost: 30,
    months: 3,
    folk: 400,
    fx: { production: 0.02 },
    pro: ["merchants", "planters"],
    does: "the town's trade +2%",
  },
  lighthouse: {
    key: "lighthouse",
    name: "A lighthouse",
    text: "A light on the point: fewer wrecks, and more ships willing to call.",
    native: false,
    cost: 55,
    months: 6,
    folk: 800,
    coast: true,
    fx: { production: 0.03 },
    pro: ["merchants"],
    con: ["planters"],
    does: "more ships call, fewer are wrecked: the town's trade +3%",
  },
  courthouse: {
    key: "courthouse",
    name: "A court-house and gaol",
    names: { spanish: "A town hall (casa de cabildo) and gaol" },
    text: "A bench for the justices, a room for the jury and a strong room under it.",
    native: false,
    cost: 45,
    months: 5,
    folk: 400,
    b: "courthouse",
    pro: ["court"],
    con: ["country"],
    does: "the governor's house (the court) and the gaol; the colony governed better",
  },
  landing: {
    key: "landing",
    name: "A landing",
    text: "The beach cleared, a stage of logs and a trading place: canoes put in, and traders' boats anchor and come ashore.",
    native: true,
    cost: 12,
    months: 2,
    b: "port",
    coast: true,
    pro: ["trader", "sachem"],
    does: "the landing: traders' ships call, and passages by sea",
  },
  palisade: {
    key: "palisade",
    name: "A palisade",
    text: "A double wall of sharpened logs around the town, with a gate that can be shut.",
    native: true,
    cost: 20,
    months: 3,
    b: "fort",
    pro: ["warleader", "youngwarrior"],
    does: "a stronghold: slower sieges",
  },
  councilhouse: {
    key: "councilhouse",
    name: "A council house",
    text: "A great house of bark and poles where the council sits and the town dances.",
    native: true,
    cost: 15,
    months: 3,
    fx: { unrest: -2 },
    pro: ["sachem", "elder"],
    does: "the town's unrest −2",
  },
  trail: {
    key: "trail",
    name: "A cleared trail",
    text: "The path to the next town cleared and blazed, with a ford made good.",
    native: true,
    cost: 10,
    months: 2,
    fx: { production: 0.02 },
    pro: ["trader", "hunter"],
    does: "the town's trade +2%",
  },
};

export const WORK_KEYS = Object.keys(TOWN_WORKS) as TownWorkKey[];

/** The building a work raises, and the work that rebuilds a building's ruin. */
export const RUIN_WORK: Partial<Record<BuildingKind, TownWorkKey>> = {
  port: "wharf",
  church: "church",
  fort: "fort",
  courthouse: "courthouse",
};

/** A repair costs this much of building new, and takes this much of the time. */
export const REPAIR = { cost: 0.5, time: 0.6 } as const;

/** Its name in this town ("A meeting house" among the puritans). */
export function workName(s: GameState, p: number, key: TownWorkKey): string {
  const def = TOWN_WORKS[key];
  const n = s.nations[s.provinces[p]?.owner ?? -1];
  const people = n?.religion === "puritan" ? "puritan" : n?.culture;
  return def.names?.[people ?? ""] ?? def.name;
}

export function lc(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

// ---------------------------------------------------------------- the body

export interface BodyView {
  /** "the county court", "the town meeting", "the cabildo", "the council fire". */
  name: string;
  /** Who sits on it, in words. */
  who: string;
  /** What it raises a work with: "a county levy", "the town rate", "the town's own labour". */
  levy: string;
}

/** The body that votes a town's works, by who holds the town (and what's proposed). */
export function bodyOf(s: GameState, p: number, key?: TownWorkKey): BodyView {
  const pr = s.provinces[p];
  const n = pr ? s.nations[pr.owner] : undefined;
  if (!n || n.kind === "native")
    return {
      name: "the council fire",
      who: "the sachem, the war captain, the speaker, the clan mothers and the elders",
      levy: "the town's own labour and gifts",
    };
  if (n.religion === "puritan")
    return {
      name: "the town meeting",
      who: "the selectmen and the town's freeholders",
      levy: "a town rate",
    };
  switch (n.culture) {
    case "spanish":
      return {
        name: "the cabildo",
        who: "the alcaldes, the regidores and the alguacil",
        levy: "a derrama",
      };
    case "portuguese":
      return {
        name: "the câmara",
        who: "the juízes and the vereadores",
        levy: "a town levy",
      };
    case "french":
      return {
        name: "the habitants' assembly",
        who: "the habitants, called by the captain of militia, with the syndic",
        levy: "a corvée and a levy on the habitants",
      };
    case "dutch":
      return {
        name: "the burgomasters and schepens",
        who: "the burgomasters, the schepens and the schout",
        levy: "a burgher levy",
      };
    case "swedish":
      return {
        name: "the court",
        who: "the commander's court and the freemen",
        levy: "a levy on the freemen",
      };
  }
  if (key === "church")
    return {
      name: "the vestry",
      who: "the churchwardens and the vestrymen, the county's gentlemen",
      levy: "a parish levy",
    };
  return {
    name: "the county court",
    who: "the justices of the peace, with the sheriff and the county's officers",
    levy: "a county levy",
  };
}

/** The town's offices whose holders sit on its body. */
function officeHolders(s: GameState, p: number): number[] {
  const out: number[] = [];
  for (const o of s.society?.offices[p] ?? []) {
    if (o.holder < 0 || o.nation !== s.provinces[p].owner) continue;
    const c = s.chars[o.holder];
    if (c?.alive && !c.abroad && !out.includes(c.id)) out.push(c.id);
  }
  return out;
}

/** Players who sit on a town's body: its office holders, and at a town meeting its freeholders. */
function playerMember(s: GameState, p: number, life: Life): boolean {
  const c = s.chars[life.c];
  if (!c?.alive || life.watching) return false;
  if (officeHolders(s, p).includes(c.id)) return true;
  const n = s.nations[s.provinces[p]?.owner ?? -1];
  // At a town meeting the freeholders vote: men of the town with land, a house or a trade of their own.
  return (
    n?.religion === "puritan" &&
    !c.female &&
    ageOf(s, c) >= 21 &&
    life.home === p &&
    (life.property ?? []).some((x) => x.prov === p)
  );
}

/** Who sits on a town's body now: its office holders, and enough of its chief householders to make three. */
export function membersOf(s: GameState, p: number): number[] {
  const out = officeHolders(s, p);
  const pr = s.provinces[p];
  const n = s.nations[pr?.owner ?? -1];
  for (const life of s.lives)
    if (life.c >= 0 && !out.includes(life.c) && playerMember(s, p, life))
      out.push(life.c);
  const want = n?.religion === "puritan" ? 7 : n?.kind === "native" ? 5 : 3;
  if (out.length < want) {
    const folk = (s.locals[p] ?? [])
      .map((id) => s.chars[id])
      .filter(
        (c): c is Character =>
          !!c?.alive &&
          !c.abroad &&
          ageOf(s, c) >= 21 &&
          !out.includes(c.id) &&
          !s.lives.some((l) => l.c === c.id) &&
          (n?.kind === "native" ? true : !c.female),
      )
      .sort(
        (a, b) =>
          (b.role ? ROLES[b.role].status : 1) -
            (a.role ? ROLES[a.role].status : 1) || a.id - b.id,
      );
    for (const c of folk) {
      if (out.length >= want) break;
      out.push(c.id);
    }
  }
  return out;
}

/** Whether a player sits on a town's body (and so proposes and votes, rather than petitions). */
export function isMember(s: GameState, p: number, life: Life): boolean {
  return membersOf(s, p).includes(life.c);
}

// ---------------------------------------------------------------- how they lean

/** The model each computer member's vote is rolled from (and the odds are reckoned from). */
export const VOTE = {
  /** Their interest wants it, or is against it. */
  interest: 2,
  /** It mends what was ruined. */
  repair: 2,
  /** Brought by petition, not by one of themselves. */
  petition: -1,
  /** What they think of whoever brought it: a point for every this much opinion. */
  opinionPer: 20,
  opinionCap: 4,
  /** The levy, a point for every this many coins on each hundred of the town's people. */
  levyPer: 2,
  levyCap: 3,
  /** The mover's own money put down: a point for every this many coins. */
  pledgePer: 10,
  pledgeCap: 2,
  /** The country party (low taxes) against any levy; a rich member too. */
  country: -0.5,
  rich: -0.5,
  /** A restless town wants no new rate. */
  restless: -1,
  /** A fort or a palisade in a war; anything else in a war. */
  war: 2,
  warOther: -1,
  /** Of their own mind: up to this either way. */
  mind: 1,
  /** A point of lean is worth this much chance of an aye (from an even chance). */
  step: 0.12,
  floor: 0.05,
  ceil: 0.95,
} as const;

export interface Lean {
  c: number;
  /** The points, and the chance of an aye they come to. */
  total: number;
  p: number;
  lines: { why: string; v: number }[];
  /** A player votes for themselves: their vote if cast (1, -1), or 0. */
  player?: boolean;
  cast?: number;
}

/** What a proposal is, for the leaning (whether it's before the body yet or not). */
export interface Motion {
  p: number;
  key: TownWorkKey;
  repair: boolean;
  by: number;
  petition: boolean;
  levy: number;
  pledge: number;
  /** A number for the members' own minds (the work's id, or a stand-in). */
  seed: number;
}

/** How one computer member leans on a motion, with the reasons. */
export function leanOf(s: GameState, m: Motion, c: Character): Lean {
  const pr = s.provinces[m.p];
  const def = TOWN_WORKS[m.key];
  const n = pr.owner;
  const lines: { why: string; v: number }[] = [];
  const add = (why: string, v: number) => {
    if (Math.abs(v) >= 0.05) lines.push({ why, v: Math.round(v * 10) / 10 });
  };
  const name = lc(workName(s, m.p, m.key));
  // Their interest (a colony's), or their post (a native town's).
  if (hasFactions(s, n)) {
    const f = interestOf(s, n, c.id);
    const party = partyOf(s, n, c.id);
    if (def.pro.includes(f))
      add(`${cap(factionName(s, n, f))} want ${name}`, VOTE.interest);
    else if (def.con?.includes(f))
      add(`${cap(factionName(s, n, f))} have no use for it`, -VOTE.interest);
    if (party && def.pro.includes(party))
      add(`${cap(factionName(s, n, party))} want it`, VOTE.interest / 2);
    else if (party && def.con?.includes(party))
      add(
        `${cap(factionName(s, n, party))} are against it`,
        -VOTE.interest / 2,
      );
    if (party === "country" && m.levy > 0)
      add(`${cap(factionName(s, n, "country"))}: no new rates`, VOTE.country);
  } else if (c.role) {
    if (def.pro.includes(c.role))
      add(`The ${ROLES[c.role].title.toLowerCase()} wants it`, VOTE.interest);
    else if (def.con?.includes(c.role))
      add(
        `The ${ROLES[c.role].title.toLowerCase()} is against it`,
        -VOTE.interest,
      );
  }
  if (m.repair)
    add(
      `The old ${lc(def.name.replace(/^An? /, ""))} should stand again`,
      VOTE.repair,
    );
  if (m.petition)
    add("Petitioned for, not brought by one of us", VOTE.petition);
  // What they think of whoever brought it.
  const mover = s.chars[m.by];
  const life = s.lives.find((l) => l.c === m.by);
  if (mover && mover.id !== c.id) {
    const op = life
      ? opinionOf(s, c, life).total
      : (thash(c.id, mover.id, 61) - 0.5) * 40;
    const v = Math.max(
      -VOTE.opinionCap,
      Math.min(VOTE.opinionCap, op / VOTE.opinionPer),
    );
    add(
      v >= 0
        ? `Thinks well of ${mover.first}`
        : `Thinks little of ${mover.first}`,
      v,
    );
  } else if (mover?.id === c.id) add("Brought it", 4);
  // The levy on the town, and the mover's own money.
  const folk = Math.max(100, townFolk(s, m.p));
  if (m.levy > 0) {
    const v = Math.min(VOTE.levyCap, m.levy / (folk / 100) / VOTE.levyPer);
    add("The levy is heavy", -v);
    if (c.role && ROLES[c.role].status >= 3)
      add("Pays more of it than most", VOTE.rich);
  }
  if (m.pledge > 0)
    add(
      `${mover?.first ?? "The mover"} puts money down`,
      Math.min(VOTE.pledgeCap, m.pledge / VOTE.pledgePer),
    );
  if (pr.unrest >= 50) add("The town is restless enough", VOTE.restless);
  const atWar = s.wars.some((w) => w.a === n || w.b === n);
  if (atWar)
    add(
      def.b === "fort" ? "There's a war on" : "Not in the middle of a war",
      def.b === "fort" ? VOTE.war : VOTE.warOther,
    );
  add("Of their own mind", (thash(m.seed, c.id, 83) * 2 - 1) * VOTE.mind);
  const total = lines.reduce((t, l) => t + l.v, 0);
  lines.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return { c: c.id, total, p: chanceOfAye(total), lines };
}

export function chanceOfAye(total: number): number {
  return Math.max(VOTE.floor, Math.min(VOTE.ceil, 0.5 + total * VOTE.step));
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Every member's leaning on a motion: players as they've voted (or not yet). */
export function leansOn(
  s: GameState,
  m: Motion,
  cast: Record<number, number> = {},
): Lean[] {
  const out: Lean[] = [];
  for (const id of membersOf(s, m.p)) {
    const c = s.chars[id];
    if (!c) continue;
    const life = s.lives.find((l) => l.c === id);
    if (life) {
      const v = cast[id] ?? (m.by === id ? 1 : 0);
      out.push({
        c: id,
        total: 0,
        p: v > 0 ? 1 : 0,
        lines: [],
        player: true,
        cast: v,
      });
      continue;
    }
    out.push(leanOf(s, m, c));
  }
  return out;
}

/**
 * The chance a motion carries: more ayes than noes among those who vote
 * (a tie is lost). Players count as they've voted; one who hasn't stands aside.
 */
export function carryChance(leans: Lean[]): number {
  let ayes0 = 0;
  let noes0 = 0;
  const ps: number[] = [];
  for (const l of leans) {
    if (l.player) {
      if ((l.cast ?? 0) > 0) ayes0++;
      else if ((l.cast ?? 0) < 0) noes0++;
    } else ps.push(l.p);
  }
  // The number of computer ayes: a distribution, member by member.
  let dist = [1];
  for (const p of ps) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  let win = 0;
  for (let k = 0; k < dist.length; k++)
    if (ayes0 + k > noes0 + (ps.length - k)) win += dist[k];
  return win;
}

// ---------------------------------------------------------------- what a town can have

/** The town's ruins of a work, if any. */
export function ruinOf(
  s: GameState,
  p: number,
  key: TownWorkKey,
): TownRuin | undefined {
  return (s.towns?.ruins[p] ?? []).find((r) => r.key === key && r.lvl > 0);
}

/** What a work would cost here (a repair is half), and how long. */
export function workCost(
  s: GameState,
  p: number,
  key: TownWorkKey,
): { cost: number; months: number; repair: boolean } {
  const def = TOWN_WORKS[key];
  const repair = !!ruinOf(s, p, key);
  return {
    cost: Math.round(def.cost * (repair ? REPAIR.cost : 1)),
    months: Math.max(1, Math.ceil(def.months * (repair ? REPAIR.time : 1))),
    repair,
  };
}

/** What the levy raises on a work: half its cost at most, as the town's people can bear. */
export function levyFor(s: GameState, p: number, cost: number): number {
  const folk = townFolk(s, p);
  const native = s.nations[s.provinces[p]?.owner ?? -1]?.kind === "native";
  const bear = native ? folk / 40 : folk / 30;
  return Math.max(0, Math.round(Math.min(cost * (native ? 0.7 : 0.5), bear)));
}

export interface WorkCheck {
  ok: boolean;
  why: string;
}

const ok: WorkCheck = { ok: true, why: "" };
const not = (why: string): WorkCheck => ({ ok: false, why });

/** Whether a town could put a work to its body now (whoever brings it). */
export function workFits(
  s: GameState,
  w: World,
  p: number,
  key: TownWorkKey,
): WorkCheck {
  const pr = s.provinces[p];
  const def = TOWN_WORKS[key];
  if (!pr || pr.owner < 0) return not("Open country has no government.");
  const owner = s.nations[pr.owner];
  if (!owner?.alive || (owner.kind !== "power" && owner.kind !== "native"))
    return not("No government sits here.");
  if (pr.occupier >= 0)
    return not(
      `The town is held by ${s.nations[pr.occupier]?.adjective ?? "an enemy"} soldiers.`,
    );
  if (def.native !== (owner.kind === "native"))
    return not(
      def.native ? "A native town's work." : "A colonial town's work.",
    );
  if (def.coast && !w.map.provinces[p]?.coastal)
    return not("Not on the coast.");
  const ruin = ruinOf(s, p, key);
  const folk = owner.kind === "native" ? townFolk(s, p) : settlers(pr);
  if (!ruin && def.folk && folk < def.folk)
    return not(`A town of ${def.folk} settlers or more.`);
  if (def.b && !ruin) {
    const lvl = pr.b[def.b] ?? 0;
    if (lvl >= 1)
      return not(
        key === "wharf"
          ? "The town has its docks (a greater harbour is the colony's business)."
          : key === "fort"
            ? "The town has its fort."
            : key === "church"
              ? "The town has its church."
              : key === "courthouse"
                ? "The town has its court-house."
                : key === "landing"
                  ? "The town has its landing."
                  : "The town has one.",
      );
  }
  if (!def.b && s.towns?.kept[p]?.[key] !== undefined && !ruin)
    return not("The town has one already.");
  if (key === "lighthouse" && !ruin && !(pr.b.port ?? 0))
    return not("A port first.");
  if (key === "school" && !ruin && !(pr.b.church ?? 0) && folk < 400)
    return not("A church first (or a town of 400).");
  return ok;
}

/** The works a town could put now, each with why not. */
export function worksFor(
  s: GameState,
  w: World,
  p: number,
): { key: TownWorkKey; check: WorkCheck }[] {
  const pr = s.provinces[p];
  const native = s.nations[pr?.owner ?? -1]?.kind === "native";
  return WORK_KEYS.filter((k) => TOWN_WORKS[k].native === native).map(
    (key) => ({
      key,
      check: workFits(s, w, p, key),
    }),
  );
}

/** The first day of a month at least two weeks off: when the body next sits. */
export function nextSitting(day: number): number {
  let d = day + 14;
  while (!isMonthStart(d)) d++;
  return d;
}

/** A work's months, from the day it's begun. */
export function doneOn(begun: number, months: number): number {
  return begun + Math.round(months * (DAYS_PER_YEAR / 12));
}

/** How far along a work is, 0 to 1. */
export function progressOf(work: TownWork, day: number): number {
  if (work.stage === "done") return 1;
  if (work.stage !== "building" || !work.begun || !work.done) return 0;
  return Math.max(
    0,
    Math.min(1, (day - work.begun) / Math.max(1, work.done - work.begun)),
  );
}

/** Subscribed so far. */
export function subscribed(work: TownWork): number {
  return (
    Math.round(Object.values(work.subs).reduce((t, v) => t + v, 0) * 10) / 10
  );
}

/** Still wanted (after the levy, the pledge and what's subscribed). */
export function stillWanted(work: TownWork): number {
  return Math.max(
    0,
    Math.round((work.cost - work.levy - subscribed(work)) * 10) / 10,
  );
}

/** The year a day falls in (for "burned by the Muscogee, 1721"). */
export function yearOfDay(day: number): number {
  return dateOf(day).year;
}

/** Who's who in a vote, for its line: "Thomas Fleet". */
export function memberName(s: GameState, c: number): string {
  const ch = s.chars[c];
  if (!ch) return "someone";
  return isNativeChar(s, ch) ? ch.first : charName(ch);
}

// ---------------------------------------------------------------- what a player can do

/** No more than this many works before a town's body at once. */
export const MAX_OPEN = 2;
/** A work thrown out can't be brought again for this many days. */
export const LOST_REST = 180;
/** What a mover may pledge with a proposal (paid if it carries). */
export const PLEDGES = [0, 5, 10, 25] as const;
/** What a subscription may be, a time. */
export const SUBSCRIPTIONS = [5, 10, 25] as const;

/** Works before a town's body, carried or building. */
export function openWorks(s: GameState, p: number): TownWork[] {
  return (s.towns?.works ?? []).filter((x) => x.p === p);
}

/** Whether a player could put (or petition for) a work here now, with this pledge. */
export function proposeCheck(
  s: GameState,
  w: World,
  life: Life,
  key: TownWorkKey,
  pledge = 0,
): WorkCheck {
  const me = s.chars[life.c];
  if (!me?.alive || life.watching) return not("You're watching.");
  if (ageOf(s, me) < 18) return not("Not until you're grown.");
  if (life.travel) return not("You're on the road.");
  const p = life.prov;
  const fits = workFits(s, w, p, key);
  if (!fits.ok) return fits;
  const open = openWorks(s, p);
  const same = open.find((x) => x.key === key);
  if (same)
    return not(
      same.stage === "proposed"
        ? "It's before the town already."
        : same.stage === "building"
          ? "It's being built."
          : "It's carried, and the subscription is open.",
    );
  if (open.filter((x) => x.stage === "proposed").length >= MAX_OPEN)
    return not(`No more than ${MAX_OPEN} works before the town at once.`);
  const lost = (s.towns?.past ?? []).find(
    (x) =>
      x.p === p &&
      x.key === key &&
      x.stage === "lost" &&
      s.day - x.sits < LOST_REST,
  );
  if (lost)
    return not(
      `Thrown out ${s.day - lost.sits} days ago: again in ${LOST_REST - (s.day - lost.sits)} days.`,
    );
  if (!membersOf(s, p).length) return not("The town has nobody to sit on it.");
  if (pledge < 0 || !Number.isFinite(pledge))
    return not("Pledge what you can.");
  if (pledge > life.purse) return not(`You haven't ${pledge} coins.`);
  return ok;
}

/** Whether a player may vote on a work (a member, before it sits). */
export function voteCheck(s: GameState, life: Life, work: TownWork): WorkCheck {
  if (work.stage !== "proposed") return not("It's been voted on.");
  if (!isMember(s, work.p, life))
    return not(`You don't sit on ${bodyOf(s, work.p, work.key).name}.`);
  if (life.travel || life.prov !== work.p)
    return not("Members vote in person: go to the town.");
  return ok;
}

/** Whether a player may subscribe to a work (carried and still wanting money). */
export function subscribeCheck(
  s: GameState,
  life: Life,
  work: TownWork,
  coins: number,
): WorkCheck {
  const me = s.chars[life.c];
  if (!me?.alive || life.watching) return not("You're watching.");
  if (work.stage !== "carried") return not("Its subscription isn't open.");
  if (life.travel || (life.prov !== work.p && life.home !== work.p))
    return not("Only in the town, or living there.");
  const want = stillWanted(work);
  if (want <= 0) return not("It's subscribed in full.");
  if (!(coins > 0) || !Number.isFinite(coins))
    return not("Subscribe something.");
  if (coins > life.purse) return not(`You haven't ${coins} coins.`);
  return ok;
}

// ---------------------------------------------------------------- paying, and the town's own

/** The town's people of means subscribe this share of their wealth (an aye a little more). */
export const SUBS = {
  /** Of a member who voted aye. */
  aye: 0.25,
  /** Of a member who voted no, or any other householder of means. */
  other: 0.08,
  /** Each month after, until it's subscribed, they add a tenth of what they gave. */
  drip: 0.1,
  /** Then the subscription closes and a second levy raises the rest. */
  days: 180,
} as const;

/** A computer member brings the repair of a ruin, a month (and a wharf or a church where a town lacks one). */
export const NPC_BRINGS = { ruin: 1 / 8, want: 1 / 36 } as const;
