// His skills (r21): each starts at its attribute's value, the signature
// skill one higher, plus whatever the story has boosted along the way
// ("boost FOCUS +1 'Paris at twenty-six'").
//
// r22: three attributes (Social, Intelligence, Physical) of four skills
// each, and his languages. At the start the player picks which of the
// chapter's languages he speaks; his Languages skill decides how many.

import { Archetype, Build, Chapter } from "./Types";

export interface Boost {
  skill: string;
  delta: number;
  why: string;
}

/** The skill that decides how many languages he has, and how well. */
export const LANGUAGES_SKILL = "LANGUAGES";

/**
 * How many of the chapter's languages a Languages skill allows: one at 2 or
 * less, then one more for each point, up to all of them.
 */
export function languageSlots(skill: number, available: number): number {
  return Math.max(1, Math.min(available, skill - 1));
}

/** How well he speaks them, in words, for the setup screen and his sheet. */
export function fluency(skill: number): string {
  if (skill >= 5) return "like a native";
  if (skill >= 4) return "fluently";
  if (skill >= 3) return "well";
  if (skill >= 2) return "passably";
  return "haltingly";
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
 * The build with languages filled in, if it has none (an archetype just
 * picked, or a save from before r22): the chapter's languages in the order
 * they're written, as many as his skill allows.
 */
export function withLanguages(ch: Chapter, b: Build): Build {
  if (ch.languages.length === 0) return b;
  const known = (b.langs ?? []).filter((c) =>
    ch.languages.some((l) => l.code === c),
  );
  const slots = languageSlots(
    rawSkill(ch, b, LANGUAGES_SKILL),
    ch.languages.length,
  );
  if (known.length > 0) return { ...b, langs: known.slice(0, slots) };
  return { ...b, langs: ch.languages.slice(0, slots).map((l) => l.code) };
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
    const langs = b.langs ?? [];
    const slots = languageSlots(
      rawSkill(ch, b, LANGUAGES_SKILL),
      ch.languages.length,
    );
    if (langs.length === 0) return "pick a language he speaks";
    if (new Set(langs).size !== langs.length) return "a language twice";
    for (const c of langs) {
      if (!ch.languages.some((l) => l.code === c)) return `no language ${c}`;
    }
    if (langs.length > slots) {
      return `his Languages allow ${slots} language${slots === 1 ? "" : "s"}`;
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
