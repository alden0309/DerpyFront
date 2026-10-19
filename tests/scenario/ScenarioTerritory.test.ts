import { GameMapSize } from "@openfront/engine-api/game/GameTypes";
import { SCENARIO_IDS } from "@openfront/engine-api/game/Scenarios";
import {
  allScenarioData,
  scenarioData,
} from "@openfront/engine-lib/scenario/ScenarioData";
import {
  decodeRing,
  scenarioTerritory,
} from "@openfront/engine-lib/scenario/ScenarioTerritory";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

// SCEN (r25): every scenario's starting land. Spot checks are map pixels of
// the full-size map (from the tools' fitted projections) and who must hold
// them on 1 September 1939 or in July 1776.
const SPOTS: Record<string, [string, number, number, string][]> = {
  europe1939: [
    ["Berlin", 1549, 762, "germany"],
    ["Paris", 1101, 910, "france"],
    ["Moscow", 2533, 630, "soviet_union"],
    ["Warsaw", 1858, 773, "poland"],
    ["Rome", 1513, 1192, "italy"],
    ["London", 1000, 802, "united_kingdom"],
    ["Madrid", 855, 1252, "spain"],
    ["Vienna", 1670, 936, "germany"],
    ["Prague", 1591, 860, "germany"],
    ["Bratislava", 1700, 939, "slovakia"],
    ["Budapest", 1778, 965, "hungary"],
    ["Kosice (Vienna Award)", 1869, 916, "hungary"],
    ["Uzhhorod (Carpatho-Ukraine)", 1910, 920, "hungary"],
    ["Danzig", 1762, 687, "germany"],
    ["Memel", 1863, 632, "germany"],
    ["Konigsberg", 1838, 673, "germany"],
    ["Wilno", 2032, 674, "poland"],
    ["Lwow", 1981, 870, "poland"],
    ["Tirana", 1810, 1215, "italy"],
    ["Tripoli", 1541, 1558, "italy"],
    ["Algiers", 1130, 1401, "france"],
    ["Tunis", 1419, 1399, "france"],
    ["Damascus", 2479, 1533, "france"],
    ["Beirut", 2447, 1517, "france"],
    ["Jerusalem", 2436, 1603, "united_kingdom"],
    ["Baghdad", 2807, 1541, "united_kingdom"],
    ["Alexandria", 2221, 1626, "united_kingdom"],
    ["Antakya (Hatay)", 2474, 1424, "turkey"],
    ["Reykjavik", 114, 290, "iceland"],
    ["Torshavn", 730, 376, "denmark"],
    ["Helsinki", 2018, 451, "finland"],
    ["Bucharest", 2065, 1090, "romania"],
    ["Chisinau (Bessarabia)", 2177, 985, "romania"],
    ["Sofia", 1952, 1160, "bulgaria"],
    ["Belgrade", 1836, 1074, "yugoslavia"],
    ["Athens", 1969, 1351, "greece"],
    ["Nicosia", 2360, 1465, "united_kingdom"],
    ["Tetouan", 788, 1449, "spain"],
    ["Casablanca", 698, 1530, "france"],
    ["Tallinn", 2010, 481, "estonia"],
    ["Riga", 1984, 582, "latvia"],
    ["Kaunas", 1976, 665, "lithuania"],
    ["Dublin", 751, 728, "ireland"],
    ["Bern", 1308, 987, "switzerland"],
    ["Stockholm", 1739, 485, "sweden"],
    ["Ankara", 2340, 1272, "turkey"],
    ["Oslo", 1441, 462, "norway"],
    ["Brussels", 1182, 829, "belgium"],
    ["Amsterdam", 1204, 768, "netherlands"],
    ["Lisbon", 635, 1321, "portugal"],
    ["Copenhagen", 1516, 633, "denmark"],
    ["Leningrad", 2236, 461, "soviet_union"],
    ["Kiev", 2245, 846, "soviet_union"],
  ],
  colonies1776: [
    ["Boston", 924, 533, "massachusetts"],
    ["Portland, Maine", 955, 401, "massachusetts"],
    ["Philadelphia", 670, 808, "pennsylvania"],
    ["Albany", 732, 538, "new_york"],
    ["Long Island", 812, 700, "new_york"],
    ["Burlington, Vermont", 741, 360, "new_york"],
    ["Charleston", 384, 1531, "south_carolina"],
    ["Savannah", 296, 1606, "georgia"],
    ["Williamsburg", 589, 1077, "virginia"],
    ["Baltimore", 573, 885, "maryland"],
    ["New Bern", 589, 1285, "north_carolina"],
    ["Hartford", 821, 610, "connecticut"],
    ["Providence", 909, 589, "rhode_island"],
    ["Portsmouth NH", 932, 463, "new_hampshire"],
    ["New Castle", 645, 840, "delaware"],
    ["Burlington NJ", 690, 794, "new_jersey"],
    ["St. Augustine", 294, 1817, "great_britain"],
    ["Staten Island", 734, 738, "great_britain"],
    ["Detroit", 83, 638, "great_britain"],
    ["Onondaga", 561, 534, "haudenosaunee"],
    ["Chota", 37, 1288, "cherokee"],
    ["Catawba", 290, 1333, "catawba"],
    ["Stockbridge", 768, 569, "mohican"],
    ["Cuscowilla", 214, 1851, "seminole"],
    ["Coshocton", 181, 829, "lenape"],
    ["Old Town", 1035, 243, "wabanaki"],
  ],
};

// Nations whose land is in pieces on purpose (islands, colonies, exclaves),
// beyond what the map's rivers cut.
const SCATTERED: Record<string, string[]> = {
  europe1939: [
    "germany", // East Prussia
    "italy", // islands, Albania, Libya, the Dodecanese
    "united_kingdom", // islands, Malta, Cyprus, the Middle East
    "france", // Corsica, North Africa, the Levant
    "spain", // the Balearics, Spanish Morocco
    "greece",
    "denmark",
    "finland",
    "estonia",
    "sweden",
    "norway",
    "turkey",
    "soviet_union",
    "yugoslavia",
    "portugal",
  ],
  colonies1776: [
    "great_britain", // Florida, Detroit, Niagara, Staten Island
    "massachusetts", // the District of Maine, past New Hampshire's coast
    "maryland", // the Eastern Shore, across the Chesapeake
    "virginia", // its Eastern Shore too
  ],
};

describe("Scenario data", () => {
  it("has a data file for every scenario in the index, and the index matches it", () => {
    expect(SCENARIO_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of SCENARIO_IDS) {
      const data = scenarioData(id);
      expect(data, id).not.toBeNull();
    }
    expect(
      allScenarioData()
        .map((d) => d.id)
        .sort(),
    ).toEqual([...SCENARIO_IDS].sort());
  });
});

describe.each(Object.keys(SPOTS))("%s territory", (id) => {
  it("owns every land tile at the start, by the right nations", async () => {
    const g = await scenarioGame(id);
    const { game } = g;
    expect(game.inSpawnPhase()).toBe(false);
    let unowned = 0;
    game.forEachTile((t) => {
      if (game.isLand(t) && !game.isImpassable(t) && !game.hasOwner(t)) {
        unowned++;
      }
    });
    expect(unowned).toBe(0);
    const scenario = game.scenario()!;
    for (const [place, x, y, key] of SPOTS[id]) {
      const owner = game.owner(nearestLand(game, x, y));
      expect(owner.isPlayer(), place).toBe(true);
      if (!owner.isPlayer()) continue;
      expect(scenario.nationOf(owner)?.key, place).toBe(key);
    }
    // Everyone starts with land, a capital, and a spawn (no spawn phase).
    for (const n of scenario.data.nations) {
      const p = g.nation(n.key);
      expect(p.numTilesOwned(), n.key).toBeGreaterThan(0);
      expect(p.hasSpawned(), n.key).toBe(true);
    }
    g.step(1);
    for (const n of scenario.data.nations) {
      expect(g.nation(n.key).units().length, n.key).toBeGreaterThan(0);
    }
  }, 120_000);

  it("gives each nation one territory, unless it is scattered on purpose", async () => {
    const g = await scenarioGame(id);
    const { game } = g;
    const scenario = game.scenario()!;
    const W = game.width();
    const H = game.height();
    // Components of its land, bridging the map's rivers (up to 8 tiles of
    // water in a straight line) but not the sea.
    for (const n of scenario.data.nations) {
      if (SCATTERED[id]?.includes(n.key)) continue;
      const p = g.nation(n.key);
      const id8 = p.smallID();
      const seen = new Uint8Array(W * H);
      let largest = 0;
      game.forEachTile((start) => {
        if (seen[start] || game.ownerID(start) !== id8) return;
        let size = 0;
        const stack = [start];
        seen[start] = 1;
        while (stack.length > 0) {
          const t = stack.pop()!;
          if (game.ownerID(t) === id8) size++;
          const x = t % W;
          const y = Math.floor(t / W);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            for (let k = 1; k <= 9; k++) {
              const nx = x + dx * k;
              const ny = y + dy * k;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
              const nb = ny * W + nx;
              if (game.ownerID(nb) === id8) {
                if (!seen[nb]) {
                  seen[nb] = 1;
                  stack.push(nb);
                }
                break;
              }
              if (!game.isWater(nb)) break;
            }
          }
        }
        largest = Math.max(largest, size);
      });
      expect(largest / p.numTilesOwned(), n.key).toBeGreaterThan(0.95);
    }
  }, 120_000);
});

describe("Scenario rasteriser", () => {
  it("is deterministic and matches a point-in-polygon test", async () => {
    const g = await scenarioGame("continental1776");
    const data = scenarioData("continental1776")!;
    const map = g.game.map();
    const a = scenarioTerritory(data, map, 1);
    const b = scenarioTerritory(data, map, 1);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);

    // Tiles a nation's polygon covers by an exact even-odd ray cast belong to
    // that nation or an earlier one (the first in the list keeps overlaps).
    const W = map.width();
    let checked = 0;
    for (let t = 7; t < a.length; t += 9973) {
      if (a[t] === 0) continue;
      const cx2 = 2 * (t % W) + 1;
      const cy2 = 2 * Math.floor(t / W) + 1;
      const inside = data.nations.findIndex((n) =>
        insideEvenOdd(n.regions, cx2, cy2),
      );
      if (inside === -1) continue; // filled by the nearest-nation pass
      expect(a[t] - 1).toBe(inside);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  }, 120_000);

  it("fills a compact map completely too", async () => {
    const g = await scenarioGame("europe1939", { size: GameMapSize.Compact });
    let unowned = 0;
    g.game.forEachTile((t) => {
      if (g.game.isLand(t) && !g.game.isImpassable(t) && !g.game.hasOwner(t)) {
        unowned++;
      }
    });
    expect(unowned).toBe(0);
    const berlin = g.game.owner(g.game.ref(1549 >> 1, 762 >> 1));
    expect(berlin.isPlayer() && g.game.scenario()!.nationOf(berlin)?.key).toBe(
      "germany",
    );
  }, 120_000);
});

/** The passable land tile nearest (x, y), for spots that fall on a river. */
function nearestLand(
  game: import("@openfront/engine/game/Game").Game,
  x: number,
  y: number,
) {
  for (let r = 0; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = game.ref(x + dx, y + dy);
        if (game.isLand(t) && !game.isImpassable(t)) return t;
      }
    }
  }
  return game.ref(x, y);
}

/** Even-odd test of a doubled point against the data's rings. */
function insideEvenOdd(regions: string[], px2: number, py2: number) {
  let inside = false;
  for (const ring of regions) {
    const flat = decodeRing(ring);
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = flat[2 * i];
      const y1 = flat[2 * i + 1];
      const x2 = flat[2 * ((i + 1) % n)];
      const y2 = flat[2 * ((i + 1) % n) + 1];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2);
      const hi = Math.max(y1, y2);
      if (!(2 * lo <= py2 && py2 < 2 * hi)) continue;
      // The crossing's doubled x is num/den: count it when it is at or left
      // of the point (a tile whose centre is on an edge is inside the
      // polygon to its right).
      const num = 2 * x1 * (y2 - y1) + (py2 - 2 * y1) * (x2 - x1);
      const den = y2 - y1;
      const left = den > 0 ? px2 * den >= num : px2 * den <= num;
      if (left) inside = !inside;
    }
  }
  return inside;
}
