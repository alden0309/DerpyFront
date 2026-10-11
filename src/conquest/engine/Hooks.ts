// Places where the life layer listens to the world engine without the world
// engine importing it: a character dying, a battle being fought, a ruler
// being chosen. The life modules register themselves when Game.ts loads.

import type { ConquestGame } from "./Game";
import type { Army, BattleReport, Character, Life, LifeCommand } from "./Types";

export const hooks = {
  /** After a character has died (the world's own bookkeeping is done). */
  death: [] as ((g: ConquestGame, c: Character, cause: string) => void)[],
  /** After a battle's report is filed. */
  battle: [] as ((
    g: ConquestGame,
    r: BattleReport,
    attackers: Army[],
    defenders: Army[],
  ) => void)[],
  /**
   * A colony needs a governor the crown chooses: a character to appoint, or
   * -1 to let the old rules pick from the council.
   */
  successor: [] as ((g: ConquestGame, n: number) => number)[],
  /** A baby born in the monthly round. */
  birth: [] as ((
    g: ConquestGame,
    kid: Character,
    mother: Character,
    father: Character,
  ) => void)[],
  /** Life commands answered by movements and politics: an error, null, or undefined (not mine). */
  command: [] as ((
    g: ConquestGame,
    life: Life,
    c: LifeCommand,
  ) => string | null | undefined)[],
  /** Characters the nations' own monthly round should leave alone (players). */
  skip: [] as ((g: ConquestGame, c: number) => boolean)[],
  // LIFE (r11)
  /** Each day of each living life, after the life's own round. */
  lifeDaily: [] as ((g: ConquestGame, life: Life) => void)[],
  /** Each month of each living life, after the life's own round. */
  lifeMonthly: [] as ((g: ConquestGame, life: Life) => void)[],
  /** Before any life command: why it can't be done now (in a cell...), or null. */
  gate: [] as ((
    g: ConquestGame,
    life: Life,
    c: LifeCommand,
  ) => string | null)[],
  /** Puts an event to a life (LifeEvents.ts registers it), without importing it. */
  raise: [] as ((
    g: ConquestGame,
    life: Life,
    key: string,
    ctx: Record<string, number>,
  ) => void)[],
};

/** LIFE (r11): put an event to a life through the registered raiser. */
export function raiseEvent(
  g: ConquestGame,
  life: Life,
  key: string,
  ctx: Record<string, number> = {},
): void {
  for (const r of hooks.raise) r(g, life, key, ctx);
}

export function skipped(g: ConquestGame, c: number): boolean {
  return hooks.skip.some((f) => f(g, c));
}
