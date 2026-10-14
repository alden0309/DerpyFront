// DLC (r21): what of Legends the body needs to know (Body.ts reads it),
// apart from Legends.ts so the body imports nothing heavy.

import { FOUNTAIN } from "./LegendsData";
import type { Character, Life } from "./Types";

/** The years the Fountain's water puts off a character's decline (0 for anyone else). */
export function watersYears(life: Life | undefined, c: Character): number {
  return life?.legends?.waters === c.id ? FOUNTAIN.years : 0;
}
