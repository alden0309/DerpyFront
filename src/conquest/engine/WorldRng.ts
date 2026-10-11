// A side stream of dice for the world's own goings-on (market shocks,
// stories going round), drawn from the seed and the day so they don't
// disturb the main dice everything else rolls with.

import { Rng } from "./Rng";
import type { GameState } from "./Types";

export function worldRng(s: GameState, salt: number): Rng {
  let h =
    (s.settings.seed | 0) ^
    Math.imul(s.day + 1, 0x9e3779b1) ^
    Math.imul(salt + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h ^= h >>> 16;
  return new Rng({ rng: h | 0 });
}
