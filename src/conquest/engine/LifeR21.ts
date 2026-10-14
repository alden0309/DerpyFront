// LIFE (r21): round 21's life systems, wired into the game: the body's
// monthly reckoning (the most it can hold), positions for your own people,
// the bawdy house, and the commands for them. Loaded by Game.ts.

import { maxHealth } from "./Body";
import { familyOf } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { touchLife } from "./LifeCore";
import { bodyguardRoad, postBudget, postsMonthly, setPost } from "./Retinue";
import type { Life, LifeCommand, PostKey } from "./Types";

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
  switch (c.act) {
    case "post":
      return setPost(g, life, Number(c.id), (c.post ?? "") as PostKey | "");
    default:
      return "Unknown.";
  }
}

/** Men of the road come less often to someone with a bodyguard. */
function roadWeight(
  g: ConquestGame,
  life: Life,
  key: string,
  pool: string,
  _ctx: Record<string, number>,
  w: number,
): number {
  if (pool !== "road" || w <= 0) return w;
  if (familyOf(key, "road") !== "robbers") return w;
  return w * bodyguardRoad(g.s, life);
}

hooks.lifeMonthly.push(bodyMonth);
hooks.lifeMonthly.push(postsMonthly);
hooks.budget.push(postBudget);
hooks.eventWeight.push(roadWeight);
hooks.command.push(r21Command);
