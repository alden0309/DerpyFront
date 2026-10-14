// LIFE (r21): the body, with age and strain, after Crusader Kings III's
// health and stress. Two rules:
//
// - The most health a body can hold falls slowly from the middle forties
//   (100 to 45, 95 at 50, 80 at 60, 60 at 70), and a few things a character
//   carries lower it further (sickly, gout, an old wound, the pox).
// - Strain makes every hurt worse: whatever would take health takes more of
//   it the more stressed you are, by tiers (at ease, strained, stressed,
//   overwrought, at breaking point).
//
// The tables here are the ones the engine applies and the tooltips show.

import { meOf } from "./LifeQueries";
import { ageOf, hasTrait } from "./Queries";
import type { Character, GameState, Life, Part } from "./Types";

/** The most health there is at each age: a line between these points. */
export const HEALTH_AGE: [number, number][] = [
  [45, 100],
  [50, 95],
  [60, 80],
  [70, 60],
  [80, 40],
  [90, 25],
];

/** The least the most can be, whatever the years and ills. */
export const HEALTH_FLOOR = 20;

/** What a character carries that lowers the most their health can be. */
export const HEALTH_MARKS: { key: string; label: string; value: number }[] = [
  { key: "sickly", label: "Sickly", value: -10 },
  { key: "gouty", label: "Gout", value: -5 },
  { key: "wounded", label: "An old wound", value: -5 },
  { key: "pox", label: "The French pox", value: -10 },
];

/** The most health at an age, before anything else. */
export function ageHealth(age: number): number {
  const pts = HEALTH_AGE;
  if (age <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [a0, h0] = pts[i - 1];
    const [a1, h1] = pts[i];
    if (age <= a1) return Math.round(h0 + ((h1 - h0) * (age - a0)) / (a1 - a0));
  }
  return pts[pts.length - 1][1];
}

/** Whether this life's character has caught the pox (LIFE r21's mark). */
export function hasPox(life: Life | undefined, c: number): boolean {
  return !!life?.r21?.marks?.some((m) => m.k === "pox" && m.c === c);
}

/** The most health a character can have now, and why. */
export function maxHealthOf(
  s: GameState,
  c: Character | undefined,
  life?: Life,
): { total: number; parts: Part[] } {
  if (!c) return { total: 100, parts: [] };
  const age = ageOf(s, c);
  const parts: Part[] = [];
  const base = ageHealth(age);
  parts.push({
    label: age > HEALTH_AGE[0][0] ? `Your years (${age})` : "In your prime",
    value: base,
  });
  let total = base;
  for (const m of HEALTH_MARKS) {
    const has =
      m.key === "pox"
        ? hasPox(life, c.id)
        : hasTrait(c, m.key as Parameters<typeof hasTrait>[1]);
    if (!has) continue;
    parts.push({ label: m.label, value: m.value });
    total += m.value;
  }
  total = Math.max(HEALTH_FLOOR, Math.min(100, total));
  return { total, parts };
}

/** The most health a played character can have now. */
export function maxHealth(s: GameState, life: Life): number {
  return maxHealthOf(s, meOf(s, life), life).total;
}

/** How much worse strain makes a hurt: by tiers of stress. */
export const STRESS_TIERS: { from: number; name: string; mult: number }[] = [
  { from: 0, name: "At ease", mult: 1 },
  { from: 20, name: "Strained", mult: 1.1 },
  { from: 40, name: "Stressed", mult: 1.25 },
  { from: 60, name: "Overwrought", mult: 1.4 },
  { from: 80, name: "At breaking point", mult: 1.6 },
];

/** The tier a stress falls in. */
export function stressTier(stress: number): { name: string; mult: number } {
  let t = STRESS_TIERS[0];
  for (const x of STRESS_TIERS) if (stress >= x.from) t = x;
  return t;
}

/** What a hurt of `n` takes at this stress (whole points). */
export function strained(n: number, stress: number): number {
  return Math.round(n * stressTier(stress).mult);
}

/** The words for the health meter's tooltip: the most there can be, and the strain. */
export function bodyNotes(s: GameState, life: Life): string[] {
  const me = meOf(s, life);
  if (!me) return [];
  const mh = maxHealthOf(s, me, life);
  const t = stressTier(life.stress);
  const out = [
    `The most your health can be now: ${mh.total}${mh.parts.length > 1 || mh.total < 100 ? ` (${mh.parts.map((p) => `${p.label.toLowerCase()} ${p.value}`).join(", ")})` : ""}.`,
    `From 45 it falls slowly with the years: 95 at 50, 80 at 60, 60 at 70.`,
    `Stress ${Math.round(life.stress)}, ${t.name.toLowerCase()}: ${t.mult === 1 ? "hurts take what they say" : `every hurt takes ×${t.mult} (a 10-point wound takes ${strained(10, life.stress)})`}.`,
  ];
  return out;
}
