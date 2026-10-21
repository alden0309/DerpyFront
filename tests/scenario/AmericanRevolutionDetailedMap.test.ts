// SCEN (r25): American Revolution - Detailed, the Thirteen Colonies -
// Detailed map with what was impassable void (Canada today) painted as land
// and water, and the waterways as ships of 1776 found them: Niagara Falls,
// the rapids at Montreal and the Richelieu's rapids close the way. The old
// Thirteen Colonies - Detailed map is kept exactly as it was.

import { GameMap } from "@openfront/engine-api/game/GameMap";
import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it } from "vitest";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const MAPS = path.join(ROOT, "resources/maps");

// Full-size tiles (x, y), from the map's frame (scratchpad r2/tools).
const LAND: Record<string, [number, number]> = {
  "Quebec, north shore (-71.35, 46.90)": [1034, 137],
  "Charlesbourg (-71.27, 46.86)": [1041, 140],
  "Nova Scotia, the Saint John valley (-67.10, 45.75)": [1409, 200],
  "Woodstock, east bank (-67.40, 46.20)": [1372, 153],
  "Sudbury (-81.0, 46.5)": [247, 288],
  "Niagara Falls": [450, 680],
  "Lachine Rapids": [876, 342],
  "the Richelieu between Saint-Jean and Chambly": [908, 345],
};
const WATER: Record<string, [number, number]> = {
  atlantic: [1036, 978],
  hudson: [918, 676],
  champlain: [918, 445],
  richelieuAboveRapids: [911, 360],
  richelieuSorel: [909, 267],
  quebec: [1051, 139],
  troisRivieres: [949, 221],
  montreal: [883, 332],
  lakeSaintLouis: [858, 351],
  ottawa: [703, 367],
  ontario: [551, 610],
  niagaraBelowGorge: [448, 667],
  niagaraAboveFalls: [460, 698],
  erie: [244, 819],
  stClair: [135, 784],
  huron: [128, 526],
  georgianBay: [285, 443],
  saintJohn: [1360, 162],
};
type Place = keyof typeof WATER;

/** One body of water each; every group apart from every other. */
const BODIES: Place[][] = [
  ["atlantic", "hudson"],
  ["erie", "stClair", "huron", "georgianBay", "niagaraAboveFalls"],
  ["ontario", "niagaraBelowGorge", "lakeSaintLouis", "ottawa"],
  ["montreal", "troisRivieres", "quebec", "richelieuSorel"],
  ["champlain", "richelieuAboveRapids"],
];

/** The water body (4-connected, as ships sail) of each tile: 0 for land. */
function bodies(map: GameMap): Uint32Array {
  const ids = new Uint32Array(map.width() * map.height());
  let next = 0;
  const stack: number[] = [];
  for (let t = 0; t < ids.length; t++) {
    if (ids[t] !== 0 || !map.isWater(t)) continue;
    ids[t] = ++next;
    stack.push(t);
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const n of map.neighbors(u)) {
        if (ids[n] === 0 && map.isWater(n)) {
          ids[n] = next;
          stack.push(n);
        }
      }
    }
  }
  return ids;
}

/** The water nearest a full-size tile on a map `scale` times smaller. */
function waterNear(map: GameMap, [x, y]: [number, number], scale: number) {
  const cx = Math.floor(x / scale);
  const cy = Math.floor(y / scale);
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!map.isValidCoord(nx, ny)) continue;
        const t = map.ref(nx, ny);
        if (map.isWater(t)) return t;
      }
    }
  }
  throw new Error(`no water near ${x},${y} at 1/${scale}`);
}

function sha256(file: string): string {
  return createHash("sha256")
    .update(fs.readFileSync(path.join(ROOT, file)))
    .digest("hex");
}

describe("Thirteen Colonies - Detailed is kept as it was", () => {
  it("has capital-mod's files byte for byte (Canada still dark)", () => {
    // sha256 of each file on capital-mod before round 2.
    const PINNED: Record<string, string> = {
      "map-generator/assets/maps/thirteencoloniesdetailed/image.png":
        "46ad7ece6a3c2ca1e447000e5f6a978157adfdbbe2cedf6f13cc79ee9633cb27",
      "map-generator/assets/maps/thirteencoloniesdetailed/info.json":
        "25bea5cb763e81a795c057e575afcb32275bd1e2a577058a47c41cedb91020c3",
      "resources/maps/thirteencoloniesdetailed/manifest.json":
        "8b97a22104f6f3f987386075c6d94dde13c2efb092a5390247456ae1468cca98",
      "resources/maps/thirteencoloniesdetailed/map.bin":
        "b02f3b7c1453a6c4bc53c25489649c984704963f41d7eb08fb360ed7e67e683b",
      "resources/maps/thirteencoloniesdetailed/map4x.bin":
        "9ba40340ce8933d87f500d08539dcaa34ca8776619231d35b6207bfc960fe10c",
      "resources/maps/thirteencoloniesdetailed/map16x.bin":
        "7837685906b6da7cceaea2cc9f63de3b2db6bcf7b31fb2a80425bf6329e772eb",
      "resources/maps/thirteencoloniesdetailed/thumbnail.webp":
        "84ba72efa4ee19b792d8e51e8585b59799d743bea4f272161ac99dbbd7340e27",
    };
    for (const [file, hash] of Object.entries(PINNED)) {
      expect(sha256(file), file).toBe(hash);
    }
  });
});

describe("American Revolution - Detailed", () => {
  let map: GameMap;
  let nations: { name: string; flag: string; coordinates: [number, number] }[];

  beforeAll(async () => {
    const files = await loadMapFiles(
      new NodeGameMapLoader(MAPS),
      GameMapType.AmericanRevolutionDetailed,
      GameMapSize.Normal,
    );
    map = (await loadTerrainMap(files)).gameMap;
    nations = files.manifest.nations as typeof nations;
  });

  it("has no impassable void left, in the same frame as the old map", () => {
    expect(map.width()).toBe(1480);
    expect(map.height()).toBe(2524);
    let impassable = 0;
    for (let t = 0; t < map.width() * map.height(); t++) {
      if (map.isImpassable(t)) impassable++;
    }
    expect(impassable).toBe(0);
  });

  it("is land in Quebec, Nova Scotia and at the falls and rapids; water on the rivers and lakes", () => {
    for (const [name, [x, y]] of Object.entries(LAND)) {
      expect(map.isLand(map.ref(x, y)), name).toBe(true);
    }
    for (const [name, [x, y]] of Object.entries(WATER)) {
      expect(map.isWater(map.ref(x, y)), name).toBe(true);
    }
  });

  it("gives Quebec and Nova Scotia spawns of their own, on land", () => {
    expect(nations.find((n) => n.name === "Province of Quebec")?.flag).toBe(
      "union_flag_1707",
    );
    expect(nations.find((n) => n.name === "Nova Scotia")?.flag).toBe(
      "novascotia",
    );
    for (const n of nations) {
      expect(map.isLand(map.ref(...n.coordinates)), n.name).toBe(true);
    }
  });

  // Every map a game sails on: Normal (map.bin, and map4x.bin for the
  // pathfinder) and Compact (map4x.bin, and map16x.bin).
  for (const [size, which, scale] of [
    [GameMapSize.Normal, "gameMap", 1],
    [GameMapSize.Normal, "miniGameMap", 2],
    [GameMapSize.Compact, "miniGameMap", 4],
  ] as const) {
    it(`keeps the 1776 waterways apart at 1/${scale} size`, async () => {
      const files = await loadMapFiles(
        new NodeGameMapLoader(MAPS),
        GameMapType.AmericanRevolutionDetailed,
        size,
      );
      const m = (await loadTerrainMap(files))[which];
      const ids = bodies(m);
      const bodyOf = (p: Place) => ids[waterNear(m, WATER[p], scale)];
      const groups = BODIES.map((g) => {
        const first = bodyOf(g[0]);
        for (const p of g) expect(bodyOf(p), `${p} with ${g[0]}`).toBe(first);
        return first;
      });
      // Erie and Huron apart from Ontario (Niagara Falls); Ontario apart
      // from the sea and the lower river (Lachine); Champlain apart
      // (the Richelieu's rapids); the lower river runs out at the north
      // edge, towards the sea off the map.
      expect(new Set(groups).size, "all apart").toBe(groups.length);
      const lower = bodyOf("montreal");
      let atEdge = false;
      for (let x = 0; x < m.width(); x++) {
        if (ids[m.ref(x, 0)] === lower) atEdge = true;
      }
      expect(atEdge, "the lower St. Lawrence reaches the north edge").toBe(
        true,
      );
    });
  }
});
