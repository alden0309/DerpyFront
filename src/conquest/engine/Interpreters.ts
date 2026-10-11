// Interpreters (round 11, wave 2: where the trades meet the tongues). The
// trade of speaking between peoples asks for two tongues spoken well enough
// to talk in: one of the colonists' and one of the native peoples'. An
// interpreter of your own walks at your side and carries your words (and
// puts your letters into the reader's tongue). And an interpreter at work
// keeps learning both.

import type { Check } from "./LifeQueries";
import {
  interpretsByTrade,
  LEVEL_NAMES,
  levelOf,
  lifeTonguePoints,
  motherTongue,
  nearestTongue,
  provinceTongue,
  tongueName,
  TONGUES,
  tonguesOf,
} from "./Tongues";
import type {
  Character,
  GameState,
  Life,
  MapDef,
  TongueId,
  TongueLevel,
} from "./Types";

export { interpretsByTrade };

/** What an interpreter at work learns of each working tongue a month. */
export const INTERPRETER_POINTS = 14;

/**
 * The two tongues someone could interpret between: a colonists' tongue and
 * a native people's, each at conversational or better (a trade jargon won't
 * do for a treaty). The best of each, or null.
 */
export function bridgeTongues(
  known: Record<TongueId, TongueLevel>,
): [TongueId, TongueId] | null {
  let colonist: TongueId | null = null;
  let native: TongueId | null = null;
  for (const [t, lvl] of Object.entries(known)) {
    const def = TONGUES[t];
    if (!def || def.pidgin || lvl < 2) continue;
    if (def.native) {
      if (native === null || lvl > (known[native] ?? 0)) native = t;
    } else if (colonist === null || lvl > (known[colonist] ?? 0)) colonist = t;
  }
  return colonist && native ? [colonist, native] : null;
}

/** Whether a life speaks enough to take up the interpreter's trade, and why not. */
export function interpreterCheck(s: GameState, map: MapDef, life: Life): Check {
  const me = s.chars[life.c];
  if (!me) return { ok: false, why: "You're watching." };
  const known = tonguesOf(s, map, me);
  if (bridgeTongues(known)) return { ok: true };
  const best = (native: boolean): string => {
    let top: TongueId | null = null;
    for (const [t, lvl] of Object.entries(known)) {
      const def = TONGUES[t];
      if (!def || def.pidgin || def.native !== native) continue;
      if (top === null || lvl > (known[top] ?? 0)) top = t;
    }
    return top
      ? `${LEVEL_NAMES[known[top] ?? 0]} ${tongueName(top)}`
      : "none at all";
  };
  return {
    ok: false,
    why: `Needs two tongues to talk in, each at conversational: a colonists' (your best: ${best(false)}) and a native people's (your best: ${best(true)}). Learn by lessons, books, and living and talking among the speakers (You, Tongues).`,
  };
}

/** Your people at your side (not off on work of their own), alive. */
export function peopleWithYou(s: GameState, life: Life): Character[] {
  const out: Character[] = [];
  for (const f of life.people ?? []) {
    if (f.task) continue;
    const c = s.chars[f.c];
    if (c?.alive && !c.abroad) out.push(c);
  }
  return out;
}

/**
 * Someone at your side who can put a letter into a reader's tongue: they
 * speak something with you, and write the reader's well (interpreters
 * first). Null if nobody can.
 */
export function letterHand(
  s: GameState,
  map: MapDef,
  life: Life,
  reader: Character,
): { by: Character; tongue: TongueId } | null {
  const me = s.chars[life.c];
  if (!me) return null;
  const mine = tonguesOf(s, map, me);
  const theirs = tonguesOf(s, map, reader);
  const folk = peopleWithYou(s, life).sort(
    (a, b) =>
      Number(interpretsByTrade(s, b.id)) - Number(interpretsByTrade(s, a.id)),
  );
  for (const x of folk) {
    const xs = tonguesOf(s, map, x);
    const withMe = Object.entries(xs).some(
      ([t, lvl]) => lvl >= 2 && (mine[t] ?? 0) >= 2,
    );
    if (!withMe) continue;
    // The reader's own tongue first, else any they read well.
    const own = motherTongue(reader.culture);
    if ((xs[own] ?? 0) >= 2) return { by: x, tongue: own };
    for (const [t, lvl] of Object.entries(xs))
      if (lvl >= 2 && (theirs[t] ?? 0) >= 2) return { by: x, tongue: t };
  }
  return null;
}

// ---------------------------------------------------------------- hiring one

/**
 * What an interpreter hired at a place speaks: the place's own tongue,
 * fluently; the tongue of the people over the line (the nearest native
 * people from a colonial town, the nearest colonists from a village); and,
 * since they're hiring on with you, yours.
 */
export function interpreterTongues(
  s: GameState,
  map: MapDef,
  life: Life,
  p: number,
  skill: number,
): Record<TongueId, TongueLevel> {
  const out: Record<TongueId, TongueLevel> = {};
  const set = (t: TongueId | null, lvl: TongueLevel) => {
    if (t && TONGUES[t] && (out[t] ?? 0) < lvl) out[t] = lvl;
  };
  const here = provinceTongue(s, map, p);
  set(here, 3);
  const nativeHere = here ? (TONGUES[here]?.native ?? false) : false;
  const good: TongueLevel = skill >= 8 ? 3 : 2;
  set(nearestTongue(s, map, p, !nativeHere), good);
  const me = s.chars[life.c];
  if (me) set(motherTongue(me.culture), good);
  return out;
}

/** "English and Powhatan's tongue": what an interpreter offers, in words. */
export function tonguesInWords(t: Record<TongueId, TongueLevel>): string {
  const names = Object.keys(t)
    .sort((a, b) => (t[b] ?? 0) - (t[a] ?? 0) || a.localeCompare(b))
    .map(tongueName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Whether you need an interpreter where you are: the tongue of the place
 * is one you speak less than conversationally.
 */
export function interpretingFor(
  s: GameState,
  map: MapDef,
  life: Life,
): boolean {
  const me = s.chars[life.c];
  if (!me || life.travel) return false;
  const here = provinceTongue(s, map, life.prov);
  if (!here) return false;
  return (tonguesOf(s, map, me)[here] ?? 0) < 2;
}

// ---------------------------------------------------------------- at work

/**
 * An interpreter at work keeps learning: each month, a little more of the
 * working tongue they're weaker in (until fluent), more at the higher ranks.
 * Returns what to study this month, or null.
 */
export function interpreterStudy(
  s: GameState,
  map: MapDef,
  life: Life,
): { tongue: TongueId; points: number } | null {
  if (life.c < 0 || life.watching || life.job?.kind !== "interpreter")
    return null;
  if (life.travel || life.crime?.jail) return null;
  if (life.prov !== life.job.prov) return null;
  const me = s.chars[life.c];
  if (!me) return null;
  const pts = lifeTonguePoints(s, map, life);
  const pair = bridgeTongues(tonguesOf(s, map, me));
  if (!pair) return null;
  const weaker = (pts[pair[0]] ?? 0) <= (pts[pair[1]] ?? 0) ? pair[0] : pair[1];
  if (levelOf(pts[weaker] ?? 0) >= 3) return null;
  return {
    tongue: weaker,
    points: INTERPRETER_POINTS * (1 + life.job.rank * 0.25),
  };
}
