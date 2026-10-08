// The nation engine's own tests: a world where a nation is marked as a
// player's (so the computer leaves it alone), and the old end year.

import { dayOf } from "../../src/conquest/engine/Calendar";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type { GameSettings } from "../../src/conquest/engine/Types";

export interface NationSeat {
  seat: string;
  name: string;
  power: string;
}

export const seat = (power: string, id = "s1", name = "Alden"): NationSeat => ({
  seat: id,
  name: id === "s1" ? name : id,
  power,
});

export function nationGame(
  settings: GameSettings,
  seats: NationSeat[] = [],
): ConquestGame {
  const g = ConquestGame.create(AMERICAS, settings, []);
  for (const x of seats) {
    const n = g.state.nations.find((y) => y.key === x.power);
    if (!n) continue;
    n.player = x.seat;
    n.playerName = x.name;
  }
  g.state.endDay = dayOf(settings.endYear);
  return g;
}
