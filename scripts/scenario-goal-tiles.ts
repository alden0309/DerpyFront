// DFX (r26): each Scenario goal's tile (resources/scenarios/goals.json), in
// both map sizes: the tile nearest the goal's place that its nation (the
// capital's, or the named spot's `of`) holds at the start. Worked out here
// once rather than in every game, so a place on a border river (Belgrade,
// across the Sava from Zemun) stays on the right bank in a Compact game too.
//
//   npx tsx scripts/scenario-goal-tiles.ts
//
// writes resources/scenarios/goal-tiles.json. tests/scenario/ScenarioGoals
// .test.ts works them out again and fails when the file is out of date
// (after a change to goals.json, or to a scenario's land or map).

import {
  allScenarioData,
  type ScenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import {
  goalPlaceAt,
  goalPlaceOf,
  scenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { scenarioBoard } from "./scenario-sizes";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GOAL_TILES_ABOUT =
  "DFX (r26): each scenario goal's tile, [x, y] in the Normal map and the Compact one: the tile nearest the goal's place held at the start by its nation. Made by scripts/scenario-goal-tiles.ts (run it after changing goals.json or a scenario's land); tests/scenario/ScenarioGoals.test.ts checks it.";

/** How far (in a map's pixels) from its place a goal's tile may be. */
const SEARCH = 60;

/** The tile nearest `at` (this map's pixels) labelled `label`. */
function nearestLabelled(
  board: { width: number; height: number; labels: Uint16Array },
  at: [number, number],
  label: number,
): [number, number] | null {
  const { width: W, height: H, labels } = board;
  for (let r = 0; r <= SEARCH; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      const y = at[1] + dy;
      if (y < 0 || y >= H) continue;
      const edge = Math.abs(dy) === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r || 1) {
        const x = at[0] + dx;
        if (x < 0 || x >= W || labels[y * W + x] !== label) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          best = [x, y];
          bestD = d;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/** One scenario's goal tiles, by nation key. */
export function scenarioGoalTiles(
  data: ScenarioData,
): Record<string, { normal: [number, number]; compact: [number, number] }> {
  const boards = {
    normal: scenarioBoard(data, "map"),
    compact: scenarioBoard(data, "map4x"),
  };
  const out: Record<
    string,
    { normal: [number, number]; compact: [number, number] }
  > = {};
  for (const n of data.nations) {
    const goal = scenarioGoal(data.id, n.key);
    if (goal === null) continue;
    const at = goalPlaceAt(data, goal);
    const of = goalPlaceOf(goal);
    const label = data.nations.findIndex((x) => x.key === of) + 1;
    if (at === null || label === 0)
      throw new Error(`${data.id}/${n.key}: no place`);
    const tile = (size: "normal" | "compact") => {
      const b = boards[size];
      const px: [number, number] = [
        Math.floor(at[0] / b.scale),
        Math.floor(at[1] / b.scale),
      ];
      const t = nearestLabelled(b, px, label);
      if (t === null)
        throw new Error(
          `${data.id}/${n.key} (${size}): no tile of ${of} near the place`,
        );
      return t;
    };
    out[n.key] = { normal: tile("normal"), compact: tile("compact") };
  }
  return out;
}

export function allScenarioGoalTiles(): {
  _about: string;
  tiles: Record<
    string,
    Record<string, { normal: [number, number]; compact: [number, number] }>
  >;
} {
  const tiles: ReturnType<typeof allScenarioGoalTiles>["tiles"] = {};
  for (const d of allScenarioData()) tiles[d.id] = scenarioGoalTiles(d);
  return { _about: GOAL_TILES_ABOUT, tiles };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const out = path.join(ROOT, "resources/scenarios/goal-tiles.json");
  fs.writeFileSync(out, JSON.stringify(allScenarioGoalTiles(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
