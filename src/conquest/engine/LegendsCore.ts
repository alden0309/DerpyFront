// DLC (r21): what of Legends the body and the secrets need to know (Body.ts,
// IntrigueCore.ts read it), apart from Legends.ts so they import nothing heavy.

import { FOUNTAIN } from "./LegendsData";
import type { Character, Life } from "./Types";

/** The years the Fountain's water puts off a character's decline (0 for anyone else). */
export function watersYears(life: Life | undefined, c: Character): number {
  return life?.legends?.waters === c.id ? FOUNTAIN.years : 0;
}

// ---------------------------------------------------------------- secrets

/** Legends are a player's own: what they've heard and how far they've got. */
export function legendKey(key: string): boolean {
  return key.startsWith("legend-") || key.startsWith("legend:");
}

export function legendsHaveSecrets(l: Partial<Life>): boolean {
  return !!l.legends;
}

/** Another player's life, with their legends taken out. */
export function legendsForOthers<T extends Partial<Life>>(l: T, out: T): void {
  if (l.legends) out.legends = undefined;
  if (out.r76 && (out.r76.spied !== undefined || out.r76.reports !== undefined))
    out.r76 = { ...out.r76, spied: undefined, reports: undefined };
}
