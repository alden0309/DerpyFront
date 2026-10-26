// DFX (r26): each Scenario nation's starting land, for Random history's
// size floor (src/client/scenario/RandomHistory.ts), so the client can pick
// without loading nine maps. Counted in land tiles of each map's compact size
// (map4x.bin), with the same territory the game starts with.
//
//   npx tsx scripts/scenario-sizes.ts
//
// writes resources/scenarios/sizes.json. tests/scenario/RandomHistory.test.ts
// counts them again and fails when the file is out of date (after a change
// to a scenario's land or map).

import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import {
  allScenarioData,
  type ScenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { scenarioTerritory } from "@openfront/engine-lib/scenario/ScenarioTerritory";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SIZES_ABOUT =
  "DFX (r26): each scenario nation's starting land, in land tiles of its map's compact size (map4x). Made by scripts/scenario-sizes.ts (run it after changing a scenario's land); tests/scenario/RandomHistory.test.ts checks it.";

/** One scenario's nations' starting land (map4x tiles), by nation key. */
export function scenarioSizes(data: ScenarioData): Record<string, number> {
  const key = Object.keys(GameMapType).find(
    (k) => GameMapType[k as keyof typeof GameMapType] === data.map,
  );
  if (key === undefined) throw new Error(`no map ${data.map}`);
  const dir = path.join(ROOT, "resources/maps", key.toLowerCase());
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
  ) as { map4x: { width: number; height: number } };
  const bin = fs.readFileSync(path.join(dir, "map4x.bin"));
  const { width, height } = manifest.map4x;
  const land = (r: number) => (bin[r] & 0x80) !== 0;
  const labels = scenarioTerritory(
    data,
    {
      width: () => width,
      height: () => height,
      isLand: land,
      isImpassable: (r) => land(r) && (bin[r] & 0x1f) === 31,
    },
    2,
  );
  const counts = new Array<number>(data.nations.length).fill(0);
  for (const l of labels) if (l > 0) counts[l - 1]++;
  return Object.fromEntries(data.nations.map((n, i) => [n.key, counts[i]]));
}

/** Every scenario's, as resources/scenarios/sizes.json holds them. */
export function allScenarioSizes(): {
  _about: string;
  scenarios: Record<string, Record<string, number>>;
} {
  const scenarios: Record<string, Record<string, number>> = {};
  for (const d of allScenarioData()) scenarios[d.id] = scenarioSizes(d);
  return { _about: SIZES_ABOUT, scenarios };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const out = path.join(ROOT, "resources/scenarios/sizes.json");
  fs.writeFileSync(out, JSON.stringify(allScenarioSizes(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
