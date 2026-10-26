// CQTUT (r26): the first life on the server. Its room is always solo, made
// and started at once (ConquestRooms.startTutorial): Boston, 1700, on Easy,
// its world on a fixed seed (engine/TutorialStart.ts). Finishing it earns
// First life, paid onto the account once on any difficulty (the
// achievements' own rule: Achievements.ts paysOverall).

import { lifeOfSeat } from "../../conquest/engine/LifeQueries";
import { TUT_FAMILY, TUT_TOWN } from "../../conquest/engine/TutorialCore";
import type { GameState } from "../../conquest/engine/Types";
import type { RoomSettings } from "../../conquest/Protocol";

/** A first life's room: the year and difficulty its world has. */
export const TUTORIAL_ROOM: RoomSettings = { difficulty: "easy", start: 1700 };

/** "First life: Thomas Hale, Boston 1700", for the saved games. */
export function tutorialTitle(s: GameState): string {
  const life = s.lives[0] ? lifeOfSeat(s, s.lives[0].seat) : undefined;
  const c = life ? s.chars[life.line[0]] : undefined;
  return `First life: ${c ? `${c.first} ${c.family}` : `the ${TUT_FAMILY}s`}, ${TUT_TOWN} 1700`;
}
