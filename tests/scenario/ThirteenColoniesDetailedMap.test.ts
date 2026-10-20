// SCEN (r25): Thirteen Colonies - Detailed with Quebec and Nova Scotia
// painted in: what was impassable void (everything that is Canada today) is
// land and water from Natural Earth, with the St. Lawrence joining the Great
// Lakes to the estuary.

import { GameMap } from "@openfront/engine-api/game/GameMap";
import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import path from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it } from "vitest";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPS = path.join(__dirname, "../../resources/maps");

// Tiles (x, y) from the map's frame (scratchpad tools/map13/repaint_13cd.py).
const LAND: Record<string, [number, number]> = {
  "Quebec, north shore (-71.35, 46.90)": [1034, 137],
  "Charlesbourg (-71.27, 46.86)": [1041, 140],
  "Nova Scotia, the Saint John valley (-67.10, 45.75)": [1409, 200],
  "Woodstock, east bank (-67.40, 46.20)": [1372, 153],
  "Sudbury (-81.0, 46.5)": [247, 288],
};
const WATER: Record<string, [number, number]> = {
  "St. Lawrence at Quebec": [1051, 139],
  "St. Lawrence at Trois-Rivieres": [947, 220],
  "St. Lawrence at Sorel": [908, 263],
  "Lake Ontario": [551, 610],
  "Niagara River": [447, 670],
  "Detroit River": [101, 816],
  "Georgian Bay": [285, 443],
  "Ottawa River": [703, 367],
  "Saint John at Woodstock": [1360, 162],
};

let map: GameMap;
let nations: { name: string; coordinates: [number, number] }[];

beforeAll(async () => {
  const files = await loadMapFiles(
    new NodeGameMapLoader(MAPS),
    GameMapType.ThirteenColoniesDetailed,
    GameMapSize.Normal,
  );
  map = (await loadTerrainMap(files)).gameMap;
  nations = files.manifest.nations as typeof nations;
});

/** The water body (4-connected) of the water tile at (x, y). */
function waterBody(x: number, y: number): Uint8Array {
  const seen = new Uint8Array(map.width() * map.height());
  const start = map.ref(x, y);
  const stack = [start];
  seen[start] = 1;
  while (stack.length > 0) {
    const t = stack.pop()!;
    for (const n of map.neighbors(t)) {
      if (seen[n] === 0 && map.isWater(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return seen;
}

describe("Thirteen Colonies - Detailed: Quebec and Nova Scotia", () => {
  it("has no impassable void left", () => {
    let impassable = 0;
    for (let t = 0; t < map.width() * map.height(); t++) {
      if (map.isImpassable(t)) impassable++;
    }
    expect(impassable).toBe(0);
  });

  it("is land in Quebec and Nova Scotia, water on the rivers and lakes", () => {
    for (const [name, [x, y]] of Object.entries(LAND)) {
      expect(map.isLand(map.ref(x, y)), name).toBe(true);
    }
    for (const [name, [x, y]] of Object.entries(WATER)) {
      expect(map.isWater(map.ref(x, y)), name).toBe(true);
    }
  });

  it("joins the Great Lakes, Lake Champlain and the Ottawa to the St. Lawrence", () => {
    const body = waterBody(...WATER["St. Lawrence at Quebec"]);
    for (const name of [
      "Lake Ontario",
      "Niagara River",
      "Detroit River",
      "Georgian Bay",
      "Ottawa River",
      "St. Lawrence at Sorel",
    ]) {
      const [x, y] = WATER[name];
      expect(body[map.ref(x, y)], name).toBe(1);
    }
    // Lake Champlain, by the Richelieu
    expect(body[map.ref(922, 451)]).toBe(1);
  });

  it("gives Quebec and Nova Scotia nations of their own, on land", () => {
    for (const name of ["Province of Quebec", "Nova Scotia"]) {
      const n = nations.find((nn) => nn.name === name);
      expect(n, name).toBeDefined();
      expect(map.isLand(map.ref(...n!.coordinates)), name).toBe(true);
    }
    for (const n of nations) {
      expect(map.isLand(map.ref(...n.coordinates)), n.name).toBe(true);
    }
  });
});
