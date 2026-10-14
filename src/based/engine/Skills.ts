// His skills (r21): each starts at its attribute's value, the signature
// skill one higher, plus whatever the story has boosted along the way
// ("boost COMPOSURE +1 'Vienna, remembered'").

import { Archetype, Build, Chapter } from "./Types";

export interface Boost {
  skill: string;
  delta: number;
  why: string;
}

/** The first archetype, or an even spread if the chapter has none. */
export function defaultBuild(ch: Chapter): Build {
  const a = ch.archetypes[0];
  if (a) return buildOf(a);
  const attrs: Record<string, number> = {};
  const n = ch.attributes.length;
  ch.attributes.forEach((x, i) => {
    attrs[x.id] =
      Math.floor(ch.points.total / Math.max(1, n)) +
      (i < ch.points.total % Math.max(1, n) ? 1 : 0);
  });
  return { attrs, signature: ch.skills[0]?.id ?? "" };
}

export function buildOf(a: Archetype): Build {
  return { attrs: { ...a.attrs }, signature: a.signature, archetype: a.id };
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
