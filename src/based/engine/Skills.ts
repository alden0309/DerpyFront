// His skills (r21): each starts at its attribute's value, the signature
// skill one higher, plus whatever the story has boosted along the way
// ("boost FOCUS +1 'Paris at twenty-six'").
//
// r22: three attributes (Social, Intelligence, Physical) of four skills
// each, and his languages.
//
// r22 BPLAY: languages are small points under Languages. His Languages
// skill at the start (its attribute, +1 if it's his signature) is a pool
// of points the player spends on the chapter's languages, 0 to 3 each: 0
// he doesn't speak it, 1 he gets by, 2 fluent, 3 like a native. A line in
// a tongue he has at 1 or more is understood; a hard one, or a check in a
// tongue ("LANGUAGES.fr"), reads his Languages skill plus that rating.
// Boosts ("boost LANGUAGES.fr +1") and items ("bonus=LANGUAGES.ru+1") add
// to a rating later.

import { Archetype, Build, Chapter } from "./Types";

export interface Boost {
  skill: string;
  delta: number;
  why: string;
}

/** The skill his language points come from, and the base of their checks. */
export const LANGUAGES_SKILL = "LANGUAGES";

/** The most points one language can take at the start. */
export const LANG_MAX = 3;

/** What a rating means, from 0 up. */
export const LANG_LEVELS = [
  "doesn't speak it",
  "gets by",
  "fluent",
  "like a native",
] as const;

/** A rating in words (above 3 is still "like a native"). */
export function langLevel(n: number): string {
  return LANG_LEVELS[Math.max(0, Math.min(LANG_LEVELS.length - 1, n))];
}

/** "LANGUAGES.fr" → "fr"; anything else → null. */
export function langOf(skill: string): string | null {
  const m = /^LANGUAGES\.([a-z][a-z_]*)$/.exec(skill);
  return m ? m[1] : null;
}

/**
 * Whether a check, a boost or an item's bonus can name this: one of the
 * chapter's skills, or "LANGUAGES.code" for one of its languages.
 */
export function isSkillRef(ch: Chapter, id: string): boolean {
  const code = langOf(id);
  if (code !== null) return ch.languages.some((l) => l.code === code);
  return ch.skills.some((s) => s.id === id);
}

/**
 * How many language points a build has to spend: his Languages skill at the
 * start (its attribute, +1 if it's his signature), at least 1.
 */
export function languagePool(ch: Chapter, b: Build): number {
  if (!ch.skills.some((s) => s.id === LANGUAGES_SKILL)) {
    return ch.languages.length;
  }
  return Math.max(1, rawSkill(ch, b, LANGUAGES_SKILL));
}

/** Points spent so far. */
export function langSpent(b: Build): number {
  return Object.values(b.langPts ?? {}).reduce((a, n) => a + n, 0);
}

/**
 * Points spread over `codes` in order: one each, then round again, up to
 * LANG_MAX each.
 */
function spread(codes: string[], pool: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of codes) out[c] = 0;
  let left = pool;
  for (let lvl = 1; lvl <= LANG_MAX && left > 0; lvl++) {
    for (const c of codes) {
      if (left === 0) break;
      out[c] = lvl;
      left--;
    }
  }
  return out;
}

/** The first archetype, or an even spread if the chapter has none. */
export function defaultBuild(ch: Chapter): Build {
  const a = ch.archetypes[0];
  if (a) return withLanguages(ch, buildOf(a));
  const attrs: Record<string, number> = {};
  const n = ch.attributes.length;
  ch.attributes.forEach((x, i) => {
    attrs[x.id] =
      Math.floor(ch.points.total / Math.max(1, n)) +
      (i < ch.points.total % Math.max(1, n) ? 1 : 0);
  });
  return withLanguages(ch, { attrs, signature: ch.skills[0]?.id ?? "" });
}

export function buildOf(a: Archetype): Build {
  return { attrs: { ...a.attrs }, signature: a.signature, archetype: a.id };
}

/**
 * The build with its language points in order (r22 BPLAY):
 * - points already spent are kept, less anything out of range; points in
 *   a language the chapter no longer has (German went in r22, English
 *   (British) in r26) go to the others (see below);
 * - BWORLD's saves, which listed the languages he was given, become points:
 *   one in each he had, then the rest of his pool round them again (a
 *   language that's gone gives its points to the others, or to the
 *   chapter's first if it was all he had);
 * - a build with neither (an archetype the engine picked by itself, or a
 *   save from before r22) gets its pool spread over the chapter's languages
 *   in the order written.
 * The setup screen starts from no points and lets the player spend them.
 */
export function withLanguages(ch: Chapter, b: Build): Build {
  const { langs, ...rest } = b;
  if (ch.languages.length === 0) return rest;
  const codes = ch.languages.map((l) => l.code);
  const pool = languagePool(ch, b);
  if (b.langPts) {
    const pts: Record<string, number> = {};
    let gone = 0;
    for (const [c, n] of Object.entries(b.langPts)) {
      if (!Number.isInteger(n) || n <= 0) continue;
      if (codes.includes(c)) pts[c] = Math.min(LANG_MAX, n);
      else gone += n;
    }
    // r26: points in a language the chapter no longer has (English
    // (British) went) go to the others, within his pool.
    topUp(
      pts,
      codes,
      Math.min(gone, pool - langSpent({ langPts: pts } as Build)),
    );
    return { ...rest, langPts: pts };
  }
  const known = (langs ?? []).filter((c) => codes.includes(c));
  const pts = spread(known.length > 0 ? known : codes, pool);
  for (const c of Object.keys(pts)) if (pts[c] === 0) delete pts[c];
  // r26: what the languages he had couldn't take goes to the others.
  topUp(pts, codes, pool - langSpent({ langPts: pts } as Build));
  return { ...rest, langPts: pts };
}

/**
 * r26: `left` more points over `codes`, a point at a time to the one he has
 * least of (in the order written), up to LANG_MAX each.
 */
function topUp(
  pts: Record<string, number>,
  codes: string[],
  left: number,
): void {
  while (left > 0) {
    const open = codes.filter((c) => (pts[c] ?? 0) < LANG_MAX);
    if (open.length === 0) return;
    const least = open.reduce((a, c) =>
      (pts[c] ?? 0) < (pts[a] ?? 0) ? c : a,
    );
    pts[least] = (pts[least] ?? 0) + 1;
    left--;
  }
}

/** A skill's value under a build before any boosts. */
function rawSkill(ch: Chapter, b: Build, id: string): number {
  const s = ch.skills.find((x) => x.id === id);
  if (!s) return 0;
  return (b.attrs[s.attr] ?? 0) + (b.signature === id ? 1 : 0);
}

/** Why a build isn't allowed, or null if it is. */
export function buildProblem(ch: Chapter, b: Build): string | null {
  let sum = 0;
  for (const a of ch.attributes) {
    const v = b.attrs[a.id];
    if (!Number.isInteger(v)) return `${a.name} has no value`;
    if (v < ch.points.min || v > ch.points.max) {
      return `${a.name} must be ${ch.points.min} to ${ch.points.max}`;
    }
    sum += v;
  }
  for (const k of Object.keys(b.attrs)) {
    if (!ch.attributes.some((a) => a.id === k)) return `no attribute ${k}`;
  }
  if (sum !== ch.points.total) {
    return `the attributes must add up to ${ch.points.total} (they add up to ${sum})`;
  }
  if (!ch.skills.some((s) => s.id === b.signature)) {
    return "pick a signature skill";
  }
  if (ch.languages.length > 0) {
    const pts = b.langPts ?? {};
    for (const [c, n] of Object.entries(pts)) {
      if (!ch.languages.some((l) => l.code === c)) return `no language ${c}`;
      if (!Number.isInteger(n) || n < 0 || n > LANG_MAX) {
        return `a language takes 0 to ${LANG_MAX} points`;
      }
    }
    const pool = languagePool(ch, b);
    const spent = langSpent(b);
    if (spent > pool) {
      return `his Languages give ${pool} language point${pool === 1 ? "" : "s"}, not ${spent}`;
    }
    const room = ch.languages.reduce(
      (a, l) => a + LANG_MAX - (pts[l.code] ?? 0),
      0,
    );
    const left = pool - spent;
    if (left > 0 && room > 0) {
      return `spend his language points (${left} left)`;
    }
  }
  return null;
}

/** Every skill's value under a build, with boosts. */
export function skillValues(
  ch: Chapter,
  build: Build | null,
  boosts: Boost[] = [],
): Record<string, number> {
  const b = build ?? defaultBuild(ch);
  const out: Record<string, number> = {};
  for (const s of ch.skills) {
    out[s.id] = (b.attrs[s.attr] ?? 0) + (b.signature === s.id ? 1 : 0);
  }
  for (const x of boosts) {
    if (x.skill in out) out[x.skill] += x.delta;
  }
  return out;
}
