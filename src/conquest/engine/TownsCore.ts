// TOWNS (r17): the towns' own bookkeeping. Where newcomers, ruins and the
// public works live in the game, the delta that carries them to the
// players, the track's own dice (so the world's luck isn't moved by a
// family off a ship), and the small questions everything here asks: who in
// a town is free to marry, which households head their own house, and how
// many households a town of its size has room for.

import type { ConquestGame } from "./Game";
import { ageOf, settlers, tribesfolk } from "./Queries";
import { Rng } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import type {
  Character,
  GameState,
  TownArrival,
  TownsDelta,
  TownsState,
  TownsView,
} from "./Types";

// ---------------------------------------------------------------- the state

const CHANGED = new WeakSet<ConquestGame>();

/** Something changed: the towns' state goes out with the next delta. */
export function townsChanged(g: ConquestGame): void {
  CHANGED.add(g);
}

/** The state, made the first time it's needed (old saves have none). */
export function townsState(g: ConquestGame): TownsState {
  const s = g.s;
  if (!s.towns) {
    s.towns = blank();
    townsChanged(g);
  }
  const t = s.towns;
  t.seen ??= {};
  t.owed ??= {};
  t.dry ??= {};
  t.lonely ??= {};
  t.came ??= {};
  t.built ??= {};
  t.held ??= {};
  t.ruins ??= {};
  t.works ??= [];
  t.past ??= [];
  t.kept ??= {};
  return t;
}

function blank(): TownsState {
  return {
    seen: {},
    owed: {},
    dry: {},
    lonely: {},
    came: {},
    built: {},
    held: {},
    ruins: {},
    works: [],
    past: [],
    kept: {},
  };
}

/** Read-only: as it is (empty for an old save, or on a player's copy before any came). */
export function townsOf(s: GameState): TownsView {
  return {
    came: s.towns?.came ?? {},
    ruins: s.towns?.ruins ?? {},
    works: s.towns?.works ?? [],
    past: s.towns?.past ?? [],
    kept: s.towns?.kept ?? {},
  };
}

/** What players are sent, when any of it changed since the last call (and clears it). */
export function takeTownsDelta(g: ConquestGame): TownsDelta | undefined {
  if (!CHANGED.has(g) || !g.s.towns) return undefined;
  CHANGED.delete(g);
  return g.s.towns;
}

export function applyTownsDelta(s: GameState, d: TownsDelta): void {
  s.towns = d;
}

// ---------------------------------------------------------------- the track's dice

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The towns' own dice: seeded afresh each day from the game's seed with a
 * salt of their own, so newcomers and votes never move the world's dice.
 */
export function tdice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x7f4a7c15) ^
          Math.imul(s.day + 6007, 0x3c6ef372) ^
          0x70a5e117) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

/** A number in [0, 1) from a few integers, the same everywhere (no dice used). */
export function thash(...xs: number[]): number {
  let h = 0x9e3779b1;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- the town's people

/** The ages a single person is counted free to marry: women and men. */
export const MARRYING_AGES = { w: [18, 40], m: [18, 45] } as const;

/** Someone of the town who could marry now (unmarried, of age, free, not promised, not played). */
export function marriageable(s: GameState, c: Character | undefined): boolean {
  if (!c?.alive || c.abroad || c.spouse >= 0) return false;
  const a = ageOf(s, c);
  const [lo, hi] = c.female ? MARRYING_AGES.w : MARRYING_AGES.m;
  if (a < lo || a > hi) return false;
  if (c.bond?.status === "held" || c.bond?.status === "indenture") return false;
  if (s.lives.some((l) => l.c === c.id)) return false;
  return !(s.intrigue?.betrothals ?? []).some(
    (b) =>
      (b.a === c.id || b.b === c.id) &&
      (b.status === "promised" || b.status === "planned"),
  );
}

/** A town's households that hold no post: the newcomers, the widows, the grown. */
export function headsOf(s: GameState, p: number): Character[] {
  const out: Character[] = [];
  for (const id of s.locals[p] ?? []) {
    const c = s.chars[id];
    if (c?.alive && !c.role) out.push(c);
  }
  return out;
}

/** How a town reckons its people: settlers, or a native town's own. */
export function townFolk(s: GameState, p: number): number {
  const pr = s.provinces[p];
  if (!pr) return 0;
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  return owner?.kind === "native" ? tribesfolk(pr) : settlers(pr);
}

/** The households a town has room for besides its posts, and the people each stands for. */
export const HOUSEHOLDS = {
  /** A colonial town: one for this many settlers... */
  per: 100,
  min: 3,
  max: 12,
  /** ...a native town: one for this many of its people. */
  nativePer: 250,
  nativeMax: 6,
  /** Over what it holds, one moves on (now and then). */
  over: 3,
  /** Nobody moves on within this many days of coming. */
  stay: 3 * 365,
} as const;

export function householdRoom(s: GameState, p: number): number {
  const pr = s.provinces[p];
  if (!pr || pr.owner < 0) return 0;
  const native = s.nations[pr.owner]?.kind === "native";
  const folk = townFolk(s, p);
  const per = native ? HOUSEHOLDS.nativePer : HOUSEHOLDS.per;
  const max = native ? HOUSEHOLDS.nativeMax : HOUSEHOLDS.max;
  if (folk < 50) return 0;
  return Math.max(HOUSEHOLDS.min, Math.min(max, Math.round(folk / per)));
}

/** The last few arrivals a town remembers. */
export const KEPT_ARRIVALS = 8;

/** Lately come to a town, newest first. */
export function arrivalsAt(s: GameState, p: number): TownArrival[] {
  return [...(s.towns?.came[p] ?? [])].reverse();
}

// ---------------------------------------------------------------- who comes, and when

/** What kind of household comes, and how often (out of the weights' sum). */
export type ArrivalKind =
  | "family"
  | "daughters"
  | "sons"
  | "couple"
  | "man"
  | "woman"
  | "widow"
  | "widower"
  | "note";

export const ARRIVALS: Record<
  "colony" | "native",
  Partial<Record<ArrivalKind, number>>
> = {
  colony: {
    family: 28,
    daughters: 10,
    sons: 6,
    couple: 7,
    man: 16,
    woman: 14,
    widow: 9,
    widower: 6,
    note: 4,
  },
  native: {
    family: 26,
    daughters: 8,
    sons: 6,
    couple: 14,
    man: 16,
    woman: 16,
    widow: 9,
    widower: 5,
  },
};

/**
 * A town below what its size holds sees a household come, a month, this
 * often for each household it's short (the road brings people), besides one
 * for each 150 settlers it grows by (300 of a native town's people).
 */
export const DRIFT_IN = 0.04;
/** A town that has all the households it holds still sees one come, a month, this often. */
export const TURNOVER = { base: 0.015, each: 0.004 } as const;

/** The chance a month a full town sees a household come: more, the bigger it is. */
export function turnoverOf(room: number): number {
  return TURNOVER.base + TURNOVER.each * room;
}
/** A town with nobody of a sex free to marry sees households that bring one this much oftener. */
export const SHORT_BOOST = 3;
/** A native town's young people marry into another town of the nation: a year. */
export const MARRY_BETWEEN = 0.12;

/** How long a town goes with nobody to marry before someone comes: a year or two. */
export function dryDays(key: number, female: boolean): number {
  return (
    DAYS_PER_YEAR + Math.round(thash(key, female ? 17 : 29) * DAYS_PER_YEAR)
  );
}

/** Under new rule, a share of the old families leave: all of them, if the settlers have fled. */
export const LEAVE_UNDER = { fled: 1, crown: 0.3 } as const;
