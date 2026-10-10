// LIFE (r11): work that runs itself. While you're at your post every working
// day is worked for you: the day's pay, a little skill, your master's eye on
// you. What you choose is how hard you go at it (shirk, steady, hard, or
// overtime), and now and then a matter at work comes up that wants a
// decision. This module also says who may take up which trade (the new
// trades have their own requirements: a port, the north, contacts in the
// underworld or among the native peoples), and lets you set up on your own
// in trades that need no master.

import { CRIME_BACKGROUNDS, knowsDen, underworldContact } from "./CrimeQueries";
import type { ConquestGame } from "./Game";
import { jobGroupOf, type JobGroup, type JobRequires } from "./JobsData";
import { addStress, journal, remembers, touchLife } from "./LifeCore";
import {
  Check,
  hasKit,
  hasPlace,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  meOf,
  no,
  rankOf,
  skillLevel,
  yes,
} from "./LifeQueries";
import {
  BACKGROUNDS,
  JOBS,
  PLACES,
  roleJobs,
  ROLES,
  SKILL_NAMES,
  WORK_DAYS,
} from "./LifeRules";
import type { World } from "./Map";
import { yearOf } from "./Queries";
import type {
  Effort,
  GameState,
  JobKind,
  Life,
  PlaceKind,
  RoleId,
  Skill,
  WorkState,
} from "./Types";
import { startJob } from "./Work";

// ---------------------------------------------------------------- effort

export interface EffortDef {
  name: string;
  /** What it means, in a line. */
  text: string;
  /** How much of a day's pay a day earns (overtime earns more). */
  day: number;
  /** How much a day teaches. */
  xp: number;
  /** Stress a working day (applied at the month's end). */
  stress: number;
  /** A crooked living: how much takings and heat a day draws. */
  heat: number;
  /** Health a working day (overtime wears you down). */
  health: number;
}

export const EFFORTS: Record<Effort, EffortDef> = {
  shirk: {
    name: "Shirk",
    text: "Do as little as you can get away with: less pay and less learned, an easier mind, and your master may catch you at it.",
    day: 0.6,
    xp: 0.4,
    stress: -0.25,
    heat: 0.4,
    health: 0,
  },
  steady: {
    name: "Steady",
    text: "A fair day's work for a fair day's pay.",
    day: 1,
    xp: 1,
    stress: 0,
    heat: 1,
    health: 0,
  },
  hard: {
    name: "Work hard",
    text: "First in, last out: you learn faster and your master notices (promotion comes sooner), but it tells on you.",
    day: 1,
    xp: 1.6,
    stress: 0.15,
    heat: 1.4,
    health: 0,
  },
  overtime: {
    name: "Overtime",
    text: "Every hour there is: up to half again the pay and more skill, at a cost to your health and peace of mind.",
    day: 1.4,
    xp: 1.3,
    stress: 0.35,
    heat: 1.8,
    health: -0.05,
  },
};

export const EFFORT_ORDER: Effort[] = ["shirk", "steady", "hard", "overtime"];

/** The most of a month's wage a month can earn (overtime). */
export const OVERTIME_SHARE = 1.4;

export function effortOf(life: Life): Effort {
  return life.work?.effort ?? "steady";
}

/** Your work's running state, made if it isn't there yet. */
export function workState(g: ConquestGame, life: Life): WorkState {
  touchLife(g, life);
  life.work ??= { effort: "steady" };
  return life.work;
}

export function setEffort(
  g: ConquestGame,
  life: Life,
  v: Effort,
): string | null {
  if (!EFFORTS[v]) return "No such way of working.";
  if (!life.job) return "You have no work.";
  const w = workState(g, life);
  if (w.effort === v) return null;
  w.effort = v;
  journal(
    g,
    life,
    v === "shirk"
      ? "You resolve to do as little as you decently can."
      : v === "hard"
        ? "You resolve to work as hard as anyone ever has."
        : v === "overtime"
          ? "You'll work every hour God sends, and some He doesn't."
          : "A fair day's work, then.",
  );
  return null;
}

// ---------------------------------------------------------------- who may

const PIRATE_YEARS: [number, number] = [1650, 1730];

/** Pirate waters: the islands, the Bahamas, Florida and the Carolina inlets. */
export function pirateWaters(w: World, p: number): boolean {
  const d = w.map.provinces[p];
  return !!d?.coastal && d.lat < 35.5 && d.lon > -98;
}

/** Why a trade's requirements aren't met here, or ok. */
export function jobGate(
  s: GameState,
  w: World,
  life: Life,
  kind: JobKind,
  p: number = life.prov,
): Check {
  const def = JOBS[kind];
  const req: JobRequires | undefined = def.requires;
  if (!req) return yes;
  const d = w.map.provinces[p];
  if (req.coastal && !d?.coastal) return no("Only in a port town.");
  if (req.north && (d?.lat ?? 0) < 39.5)
    return no("Only in the northern ports, where the whales run.");
  for (const [sk, v] of Object.entries(req.skills ?? {}) as [Skill, number][])
    if (skillLevel(s, life, sk) < v)
      return no(
        `Needs ${SKILL_NAMES[sk].toLowerCase()} ${v} (you have ${skillLevel(s, life, sk)}).`,
      );
  if (req.notoriety && (life.crime?.notoriety ?? 0) < req.notoriety)
    return no(
      `Needs a name in the underworld: notoriety ${req.notoriety} (you have ${Math.floor(life.crime?.notoriety ?? 0)}).`,
    );
  if (req.contacts === "underworld" && !underworldContact(life, p))
    return no(
      "Nobody in the underworld will vouch for you: find the den first (listen at the tavern), or make a name.",
    );
  if (req.contacts === "natives" && !nativeContacts(s, w, life))
    return no(
      "Needs friends among the native peoples: be born to them, or know the woods (5) and have travelled in their country.",
    );
  if (
    req.contacts === "sea" &&
    skillLevel(s, life, "seamanship") < 4 &&
    !["sailor", "fisherman", "whaler", "pirate", "smuggler"].includes(
      life.background,
    )
  )
    return no("Needs seamanship 4, or a life at sea behind you.");
  if (req.pirates) {
    const year = yearOf(s);
    const notorious = (life.crime?.notoriety ?? 0) >= 30;
    const ownSloop = (life.boats ?? []).some(
      (b) => b.prov === p && b.kind !== "canoe" && b.kind !== "shallop",
    );
    if (!notorious && !ownSloop) {
      if (!pirateWaters(w, p))
        return no(
          "No pirate crews sign on here: try the islands, Florida or the Carolinas (or bring a name, or a sloop, of your own).",
        );
      if (year < PIRATE_YEARS[0] || year > PIRATE_YEARS[1])
        return no(
          year < PIRATE_YEARS[0]
            ? "The pirate years haven't come yet (from 1650)."
            : "The navies have hanged the pirates out of these waters (after 1730).",
        );
    }
  }
  return yes;
}

/** Friends among the native peoples: born to them, or woods-wise and well travelled among them. */
export function nativeContacts(s: GameState, w: World, life: Life): boolean {
  if (lifeIsNative(s, life)) return true;
  if (skillLevel(s, life, "woodcraft") < 5) return false;
  const among = life.visited.filter((p) => {
    const o = s.provinces[p]?.owner ?? -1;
    return o >= 0 && s.nations[o]?.kind === "native";
  }).length;
  return among >= 2;
}

/** Whether you can set up in a trade on your own here (no master needed). */
export function takeUpCheck(
  s: GameState,
  w: World,
  life: Life,
  kind: JobKind,
  place: PlaceKind,
): Check {
  const def = JOBS[kind];
  if (!def) return no("No such work.");
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.crime?.jail) return no("Not from a cell.");
  if (life.travel) return no("You're on the road.");
  if (!def.selfStart) return no("Someone has to take you on.");
  if (!def.places.includes(place)) return no("Not done here.");
  if (!hasPlace(s, w, life.prov, place))
    return no("There's no such place here.");
  if (place === "den" && !knowsDen(life, life.prov))
    return no("You don't know where the den is.");
  if (def.native !== null && def.native !== isNativeChar(s, me))
    return no(
      def.native
        ? "That's work among the native peoples."
        : "That's colonists' work.",
    );
  if (life.job) {
    if (life.job.kind === "servant" && (life.job.until ?? 0) > s.day)
      return no("You're bound to your master until your indenture is served.");
    if (life.job.kind === kind) return no("That's your trade already.");
    const title = rankOf(life)?.title.toLowerCase() ?? "something";
    return no(`You work as ${title} already: give it up first.`);
  }
  const pr = s.provinces[life.prov];
  const holder = pr.occupier >= 0 ? pr.occupier : pr.owner;
  if (def.ownNation && holder !== me.nation)
    return no(
      `Only ${s.nations[holder]?.adjective ?? "local"} people serve here.`,
    );
  for (const [sk, v] of Object.entries(def.need ?? {}) as [Skill, number][])
    if (skillLevel(s, life, sk) < v)
      return no(
        `Needs ${SKILL_NAMES[sk].toLowerCase()} ${v} (you have ${skillLevel(s, life, sk)}).`,
      );
  return jobGate(s, w, life, kind, life.prov);
}

/** What taking up a trade on your own is called on its button. */
export function takeUpLabel(kind: JobKind): string {
  switch (kind) {
    case "militia":
      return "Enrol in the militia";
    case "watch":
      return "Join the night watch";
    case "thieftaker":
      return "Hunt rewards as a thief-taker";
    case "fisherman":
      return "Fish on your own account";
    case "guide":
      return "Hire yourself out as a guide";
    case "midwife":
      return "Take up midwifery";
    case "thief":
      return "Start picking pockets";
    case "fence":
      return "Set up as a receiver of goods";
    case "smuggler":
      return "Run contraband";
    case "highwayman":
      return "Take to the road";
    case "counterfeiter":
      return "Pass bad money";
    case "pirate":
      return "Go on the account (piracy)";
    case "trapper":
      return "Set your own traplines";
    default:
      return `Set up as ${JOBS[kind].ranks[0].title.toLowerCase()}`;
  }
}

/** Trades you could set up in at a place here (shown whether or not you qualify). */
export function takeUpsAt(
  s: GameState,
  w: World,
  life: Life,
  place: PlaceKind,
): JobKind[] {
  const me = meOf(s, life);
  if (!me) return [];
  const native = isNativeChar(s, me);
  return (Object.keys(JOBS) as JobKind[]).filter((k) => {
    const def = JOBS[k];
    if (!def.selfStart || !def.places.includes(place)) return false;
    if (k === "trapper") return false; // has its own button already
    if (def.native !== null && def.native !== native) return false;
    if (place === "den" && !knowsDen(life, life.prov)) return false;
    return true;
  });
}

/** Set up in a trade on your own. */
export function takeUp(
  g: ConquestGame,
  life: Life,
  kind: JobKind,
  place: PlaceKind,
): string | null {
  const check = takeUpCheck(g.s, g.w, life, kind, place);
  if (!check.ok) return check.why;
  const def = JOBS[kind];
  // The militia and the watch are a duty to the colony, not your own shop.
  const own = !(kind === "militia" || kind === "watch");
  startJob(g, life, kind, place, 0, -1, own);
  if (def.crime) {
    const c = life.crime;
    if (
      c &&
      !c.dens.includes(life.prov) &&
      hasPlace(g.s, g.w, life.prov, "den")
    )
      c.dens.push(life.prov);
  }
  return null;
}

// ---------------------------------------------------------------- a day's work

/** A day worked at your post, as hard as you go at it. Returns the day's worth. */
export function effortDay(life: Life): number {
  return EFFORTS[effortOf(life)].day;
}

/**
 * The month's work as it was done: the days worked (kept on the job) at
 * the effort you go at it now. Applies stress, health and your master's
 * opinion; returns the multiplier on the skill learned this month.
 */
export function effortMonth(g: ConquestGame, life: Life): number {
  const job = life.job;
  if (!job) return 1;
  const e = EFFORTS[effortOf(life)];
  const days = Math.min(WORK_DAYS * OVERTIME_SHARE, job.worked ?? 0) / e.day;
  if (days <= 0) return e.xp;
  const stress = Math.round(e.stress * days);
  if (stress) addStress(g, life, stress);
  if (e.health) {
    const hurtBy = Math.round(-e.health * days);
    if (hurtBy) touchLife(g, life).health = Math.max(1, life.health - hurtBy);
  }
  const boss = job.own ? undefined : g.s.chars[job.employer];
  if (boss?.alive && days >= 12) {
    if (effortOf(life) === "hard")
      remembers(g, life, boss, "Works hard", 8, 0.5);
    else if (effortOf(life) === "overtime")
      remembers(g, life, boss, "Works all hours", 6, 0.5);
  }
  return e.xp;
}

/** Chance a shirking day is seen by your master. */
export const SHIRK_CAUGHT = 0.035;

/** A shirker found out: your master's opinion, and a word in your ear. */
export function shirkDay(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): void {
  const job = life.job;
  if (!job || job.own || effortOf(life) !== "shirk") return;
  const boss = g.s.chars[job.employer];
  if (!boss?.alive || !g.rng.chance(SHIRK_CAUGHT)) return;
  const w = workState(g, life);
  w.caught = (w.caught ?? 0) + 1;
  remembers(g, life, boss, "Shirks", -8, 0.5);
  if (w.caught >= 3) {
    w.caught = 0;
    raise("work-shirk", { c: boss.id });
  } else
    journal(
      g,
      life,
      `${boss.first} caught you idling. ${boss.female ? "She" : "He"} said nothing, which was worse.`,
      "bad",
    );
}

// ---------------------------------------------------------------- the trades, listed

/** Who takes people on for a trade: the roles and where they work. */
export function hirersOf(kind: JobKind): { role: RoleId; place: PlaceKind }[] {
  const out: { role: RoleId; place: PlaceKind }[] = [];
  for (const role of Object.keys(ROLES) as RoleId[])
    if (roleJobs(role).includes(kind))
      out.push({ role, place: ROLES[role].place });
  return out;
}

export interface TradeView {
  kind: JobKind;
  group: JobGroup;
  /** Hired by whom, and where; or set up on your own. */
  hiredBy: string[];
  selfStart: boolean;
  /** Where it's done. */
  where: string;
  /** What stands in your way just now (beyond being here), or null. */
  blocked: string | null;
  open: boolean;
}

/** Every trade someone of your people could follow, with how to get into it. */
export function tradesFor(s: GameState, w: World, life: Life): TradeView[] {
  const me = meOf(s, life);
  const native = me ? isNativeChar(s, me) : false;
  const out: TradeView[] = [];
  for (const kind of Object.keys(JOBS) as JobKind[]) {
    const def = JOBS[kind];
    if (def.native !== null && def.native !== native) continue;
    if (kind === "servant") continue;
    const hirers = hirersOf(kind).map(
      (h) =>
        `${ROLES[h.role].title.toLowerCase()} (${PLACES[h.place].name.replace(/^The /, "the ").toLowerCase()})`,
    );
    const gate = jobGate(s, w, life, kind, life.prov);
    let blocked: string | null = gate.ok ? null : gate.why;
    if (!blocked)
      for (const [sk, v] of Object.entries(def.need ?? {}) as [Skill, number][])
        if (skillLevel(s, life, sk) < v) {
          blocked = `Needs ${SKILL_NAMES[sk].toLowerCase()} ${v}.`;
          break;
        }
    out.push({
      kind,
      group: jobGroupOf(kind, def),
      hiredBy: hirers,
      selfStart: !!def.selfStart,
      where: def.places
        .map((p) => PLACES[p].name.replace(/^The /, "the ").toLowerCase())
        .join(" or "),
      blocked,
      open: !blocked,
    });
  }
  return out;
}

/** A crooked upbringing knows the den at home, and starts with a name. */
export function crookedStart(g: ConquestGame, life: Life): void {
  const bg = BACKGROUNDS[life.background];
  if (!bg?.notoriety && !CRIME_BACKGROUNDS.includes(life.background)) return;
  touchLife(g, life);
  life.crime ??= { notoriety: 0, heat: {}, dens: [], record: [], jail: null };
  life.crime.notoriety = Math.max(life.crime.notoriety, bg.notoriety ?? 0);
  if (!life.crime.dens.includes(life.home)) life.crime.dens.push(life.home);
}

/** Whether a rung's kept thing is had (a highwayman's horse). */
export function rungKit(s: GameState, life: Life, rank: number): Check {
  const job = life.job;
  if (!job) return yes;
  const need = JOBS[job.kind].ranks[rank]?.kit;
  if (need && !hasKit(s, life, need))
    return no(
      need === "horse" ? "Needs a horse of your own." : `Needs a ${need}.`,
    );
  return yes;
}

/** Days since the last matter at work, and the month (for spacing them). */
export function matterDue(s: GameState, life: Life): boolean {
  const last = life.work?.matter ?? -999;
  return s.day - last >= 21;
}

export function noteMatter(g: ConquestGame, life: Life): void {
  workState(g, life).matter = g.s.day;
}
