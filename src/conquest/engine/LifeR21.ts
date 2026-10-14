// LIFE (r21): round 21's life systems, wired into the game: the body's
// monthly reckoning (the most it can hold), positions for your own people,
// the bawdy house, and the commands for them. Loaded by Game.ts.

import { maxHealth } from "./Body";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { touchLife } from "./LifeCore";
import type { Life, LifeCommand } from "./Types";

/** Each month: health never stands above the most the body can hold now. */
function bodyMonth(g: ConquestGame, life: Life): void {
  const top = maxHealth(g.s, life);
  if (life.health > top) touchLife(g, life).health = top;
}

function r21Command(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "r21") return undefined;
  void g;
  return "Unknown.";
}

hooks.lifeMonthly.push(bodyMonth);
hooks.command.push(r21Command);
