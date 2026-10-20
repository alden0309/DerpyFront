// SCEN (r25): the forts, naval bases and industry each scenario starts with.
// Spot checks of the main lines: a structure of the type, owned by the
// nation, near the historical place (full-size map pixels from the tools'
// projections). Structures stand at the nearest place their owner may build
// one, at least 15 tiles from the others, so a little way off at most.

import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { Game, Player } from "@openfront/engine/game/Game";
import { beforeAll, describe, expect, it } from "vitest";
import { ScenarioGame, scenarioGame } from "./ScenarioTestUtil";

type Spot = [
  string,
  string,
  "Defense Post" | "Port" | "Factory",
  number,
  number,
];

const TYPES = {
  "Defense Post": UnitType.DefensePost,
  Port: UnitType.Port,
  Factory: UnitType.Factory,
};

/** How far a structure may stand from its place (tiles). */
const NEAR = 24;

const EUROPE: Spot[] = [
  ["Westwall, the Saar", "germany", "Defense Post", 1292, 896],
  ["Westwall, Aachen", "germany", "Defense Post", 1255, 835],
  ["Westwall, the upper Rhine", "germany", "Defense Post", 1321, 943],
  ["Maginot Line, Hackenberg", "france", "Defense Post", 1262, 889],
  ["Maginot Line, Bitche", "france", "Defense Post", 1306, 903],
  ["Maginot Line, the Rhine", "france", "Defense Post", 1323, 927],
  ["Liege and Eben-Emael", "belgium", "Defense Post", 1234, 837],
  ["Dutch Water Line", "netherlands", "Defense Post", 1214, 782],
  ["Mannerheim Line, Summa", "finland", "Defense Post", 2191, 436],
  ["Stalin Line, Minsk", "soviet_union", "Defense Post", 2098, 702],
  ["Stalin Line, Korosten", "soviet_union", "Defense Post", 2167, 824],
  ["Stalin Line, Tiraspol", "soviet_union", "Defense Post", 2208, 992],
  ["Metaxas Line, Rupel", "greece", "Defense Post", 1952, 1217],
  ["Swiss redoubt", "switzerland", "Defense Post", 1355, 1002],
  ["Mlawa", "poland", "Defense Post", 1833, 738],
  ["Scapa Flow", "united_kingdom", "Port", 880, 503],
  ["Portsmouth", "united_kingdom", "Port", 962, 832],
  ["Gibraltar", "united_kingdom", "Port", 789, 1426],
  ["Malta", "united_kingdom", "Port", 1595, 1436],
  ["Alexandria", "united_kingdom", "Port", 2221, 1627],
  ["Brest", "france", "Port", 824, 929],
  ["Toulon", "france", "Port", 1247, 1143],
  ["Mers-el-Kebir", "france", "Port", 978, 1443],
  ["Kiel", "germany", "Port", 1417, 689],
  ["Wilhelmshaven", "germany", "Port", 1335, 721],
  ["Taranto", "italy", "Port", 1706, 1251],
  ["La Spezia", "italy", "Port", 1405, 1103],
  ["Kronstadt", "soviet_union", "Port", 2214, 459],
  ["Sevastopol", "soviet_union", "Port", 2367, 1083],
  ["the Ruhr", "germany", "Factory", 1290, 805],
  ["Upper Silesia", "germany", "Factory", 1764, 852],
  ["the Midlands", "united_kingdom", "Factory", 922, 758],
  ["the Nord", "france", "Factory", 1144, 850],
  ["northern Italy", "italy", "Factory", 1349, 1057],
  ["the Donbas", "soviet_union", "Factory", 2541, 946],
  ["Leningrad", "soviet_union", "Factory", 2246, 467],
  ["Moscow", "soviet_union", "Factory", 2547, 639],
];

const COLONIES: Spot[] = [
  ["Quebec's citadel", "great_britain", "Defense Post", 1047, 147],
  ["Fort Niagara", "great_britain", "Defense Post", 447, 663],
  ["Detroit", "great_britain", "Defense Post", 105, 801],
  ["St. Augustine", "great_britain", "Defense Post", 369, 2279],
  ["Ticonderoga", "new_york", "Defense Post", 927, 530],
  ["Crown Point", "new_york", "Defense Post", 920, 508],
  ["Fort Washington", "new_york", "Defense Post", 935, 892],
  ["Fort Pitt", "pennsylvania", "Defense Post", 394, 1007],
  ["Fort Sullivan", "south_carolina", "Defense Post", 490, 1923],
  ["Quebec", "great_britain", "Port", 1048, 143],
  ["Montreal", "great_britain", "Port", 883, 332],
  ["Saint-Jean", "great_britain", "Port", 911, 357],
  ["Staten Island", "great_britain", "Port", 928, 923],
  ["Boston", "massachusetts", "Port", 1159, 670],
  ["Philadelphia", "pennsylvania", "Port", 841, 1015],
  ["Charleston", "south_carolina", "Port", 483, 1921],
];

function nearest(
  game: Game,
  p: Player,
  type: UnitType,
  x: number,
  y: number,
): number {
  let best = Infinity;
  for (const u of p.units(type)) {
    const dx = game.x(u.tile()) - x;
    const dy = game.y(u.tile()) - y;
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  return best;
}

/** The water body of a tile (4-connected), as ships sail. */
function waterBody(game: Game, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const t = stack.pop()!;
    for (const n of game.neighbors(t)) {
      if (!seen.has(n) && game.isWater(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

function checkSpots(g: ScenarioGame, spots: Spot[]) {
  for (const [place, key, type, x, y] of spots) {
    const d = nearest(g.game, g.nation(key), TYPES[type], x, y);
    expect(d, `${type} at ${place} (${key})`).toBeLessThanOrEqual(NEAR);
  }
}

describe("Europe 1939's forts, bases and industry", () => {
  let g: ScenarioGame;
  beforeAll(async () => {
    g = await scenarioGame("europe1939");
    g.step(1);
  }, 120_000);

  it("stand at the start along the main lines", () => {
    checkSpots(g, EUROPE);
  });

  it("build the fortified lines of several posts each, the great forts stronger", () => {
    const posts = (key: string) => g.nation(key).units(UnitType.DefensePost);
    expect(posts("germany").length).toBeGreaterThanOrEqual(7); // the Westwall
    expect(posts("france").length).toBeGreaterThanOrEqual(7); // Maginot, Alps
    expect(posts("soviet_union").length).toBeGreaterThanOrEqual(9); // Stalin Line
    expect(posts("finland").length).toBeGreaterThanOrEqual(3); // Mannerheim
    expect(posts("greece").length).toBeGreaterThanOrEqual(3); // Metaxas
    for (const key of ["germany", "france", "finland", "greece", "belgium"]) {
      expect(
        posts(key).some((u) => u.level() >= 2),
        `${key}'s strongest fort`,
      ).toBe(true);
    }
    // The Maginot Line faces Germany, not Belgium: every French post in the
    // north-east is south of Luxembourg's border (y 875 here).
    for (const u of posts("france")) {
      const x = g.game.x(u.tile());
      const y = g.game.y(u.tile());
      if (x > 1150 && y < 960) expect(y, "Maginot post").toBeGreaterThan(875);
    }
  });

  it("puts warships in the naval bases' waters, and no missile silos or SAMs", () => {
    const ships = (key: string) => g.nation(key).units(UnitType.Warship);
    expect(ships("united_kingdom").length).toBeGreaterThanOrEqual(6);
    expect(ships("france").length).toBeGreaterThanOrEqual(3);
    expect(ships("germany").length).toBeGreaterThanOrEqual(2);
    expect(ships("italy").length).toBeGreaterThanOrEqual(2);
    expect(ships("soviet_union").length).toBeGreaterThanOrEqual(2);
    const data = g.game.scenario()!.data;
    for (const n of data.nations) {
      for (const s of n.structures ?? []) {
        expect(["Missile Silo", "SAM Launcher"], n.key).not.toContain(s.type);
      }
    }
  });
});

describe("1776's forts and fleets on American Revolution - Detailed", () => {
  let g: ScenarioGame;
  beforeAll(async () => {
    g = await scenarioGame("colonies1776");
    g.step(1);
  }, 120_000);

  it("stand at the start", () => {
    checkSpots(g, COLONIES);
  });

  it("put Britain's ships on the St. Lawrence and both sides' on the lakes", () => {
    const { game } = g;
    const body = (x: number, y: number) => waterBody(game, game.ref(x, y));
    const lowerStLawrence = body(1051, 139);
    const champlain = body(918, 445);
    const ontario = body(551, 610);
    const erie = body(244, 819);
    const atlantic = body(1036, 978);
    // A warship starts at its nearest port on the same water and sails to
    // its station: count it by its station.
    const shipsOn = (p: Player, water: Set<number>) =>
      p.units(UnitType.Warship).filter((u) => {
        const station = u.warshipState().patrolTile;
        return station !== undefined && water.has(station);
      }).length;
    const portsOn = (p: Player, water: Set<number>) =>
      p
        .units(UnitType.Port)
        .filter((u) => game.neighbors(u.tile()).some((n) => water.has(n)))
        .length;
    const britain = g.nation("great_britain");
    const newYork = g.nation("new_york");
    expect(shipsOn(britain, atlantic)).toBeGreaterThanOrEqual(5); // New York
    expect(shipsOn(britain, lowerStLawrence)).toBeGreaterThanOrEqual(1);
    expect(shipsOn(britain, champlain)).toBeGreaterThanOrEqual(1); // Carleton
    expect(shipsOn(britain, ontario)).toBeGreaterThanOrEqual(1);
    expect(shipsOn(britain, erie)).toBeGreaterThanOrEqual(1);
    expect(shipsOn(newYork, champlain)).toBeGreaterThanOrEqual(1); // Arnold
    // Quebec and Montreal have ports on the river, so the fleet there can
    // be rebuilt and act.
    expect(portsOn(britain, lowerStLawrence)).toBeGreaterThanOrEqual(2);
    expect(portsOn(britain, champlain)).toBeGreaterThanOrEqual(1);
    expect(portsOn(newYork, champlain)).toBeGreaterThanOrEqual(1);
  });

  it("starts in the continental variant with the same forts, the colonies' now the United Colonies'", async () => {
    const c = await scenarioGame("continental1776");
    c.step(1);
    const spots = COLONIES.map(
      ([place, key, type, x, y]) =>
        [
          place,
          key === "great_britain" ? key : "united_colonies",
          type,
          x,
          y,
        ] as Spot,
    );
    checkSpots(c, spots);
  }, 120_000);
});
