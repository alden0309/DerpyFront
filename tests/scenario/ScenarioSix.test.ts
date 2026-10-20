// SCEN2 (r25): the six more scenarios (Three Kingdoms 219, Napoleon 1812,
// Italy 1859, American Civil War 1861, World War I 1914, Korean War 1950):
// their line-ups, Korea's win by taking the South, the Three Kingdoms' three
// sides and their neutral rule, and a short computer-only game of each (the
// balance script's short version).

import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { holdTargetTiles } from "@openfront/engine/scenario/ScenarioRules";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { ScenarioGame, scenarioGame } from "./ScenarioTestUtil";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../resources/lang/en.json"), "utf8"),
);

// Each scenario's nations by side (null: neutral), as designed.
const LINEUPS: Record<string, Record<string, string[]>> = {
  civilwar1861: {
    Union: [
      "maine", "new_hampshire", "vermont", "massachusetts_state", "rhode_island", "connecticut",
      "new_york", "new_jersey", "pennsylvania", "ohio", "indiana", "illinois", "michigan",
      "wisconsin", "minnesota", "iowa", "missouri", "kansas", "california", "oregon", "maryland",
      "delaware", "washington_t", "dakota_t", "nebraska_t", "colorado_t", "utah_t", "nevada_t",
      "new_mexico_t",
    ],
    Confederacy: [
      "virginia", "north_carolina", "south_carolina", "georgia", "florida", "alabama",
      "mississippi", "louisiana", "texas", "arkansas", "tennessee",
    ],
    neutral: ["kentucky", "cherokee_nation", "muscogee", "choctaw", "chickasaw"],
  },
  ww1914: {
    Central: ["german_empire", "austria_hungary"],
    Entente: ["france", "russia", "united_kingdom", "serbia", "montenegro", "belgium"],
    neutral: [
      "italy", "ottoman", "bulgaria", "romania", "greece", "spain", "portugal", "netherlands",
      "switzerland", "denmark", "norway", "sweden", "luxembourg", "albania", "persia",
    ],
  },
  napoleon1812: {
    French: [
      "french_empire", "kingdom_of_italy", "naples", "bavaria", "wurttemberg", "saxony",
      "westphalia", "warsaw", "denmark_norway",
    ],
    Coalition: [
      "united_kingdom", "russia", "prussia", "austria", "sweden", "portugal", "spain", "sicily",
    ],
    neutral: ["ottoman", "switzerland", "morocco", "persia", "serbia", "montenegro", "sardinia"],
  },
  korea1950: {
    NorthKorea: ["north_korea"],
    UnitedNations: ["south_korea", "un_command"],
    neutral: [],
  },
  threekingdoms219: {
    Wei: ["cao_cao"],
    Shu: ["liu_bei"],
    Wu: ["sun_quan", "shi_xie"],
    neutral: ["gongsun_kang", "goguryeo", "xianbei", "qiang", "nanzhong", "shanyue"],
  },
  italy1859: {
    Sardinia: ["sardinia", "france"],
    Austria: ["austria"],
    neutral: [
      "parma", "modena", "tuscany", "papal_states", "san_marino", "two_sicilies", "switzerland",
      "malta", "tunis", "montenegro", "ottoman",
    ],
  },
};

describe.each(Object.keys(LINEUPS))("%s line-up", (id) => {
  it("has the designed sides and neutrals", () => {
    const data = scenarioData(id)!;
    const got: Record<string, string[]> = { neutral: [] };
    for (const s of data.sides) got[s.id] = [];
    for (const n of data.nations) got[n.side ?? "neutral"].push(n.key);
    for (const k of Object.keys(got)) got[k].sort();
    const want = Object.fromEntries(
      Object.entries(LINEUPS[id]).map(([k, v]) => [k, [...v].sort()]),
    );
    expect(got).toEqual(want);
  });
});

describe("no Confederate flag in the Civil War", () => {
  it("flies state flags only, and not Georgia's Stars-and-Bars design", () => {
    const flags = scenarioData("civilwar1861")!.nations.map((n) => n.flag);
    expect(flags).not.toContain("Confederate States");
    expect(flags).not.toContain("Georgia_US");
  });
});

// The main fortifications, naval bases and works each scenario starts with
// (map pixels of the full-size map, from the tools' fitted projections): the
// nation must have that structure within 20 tiles of the place.
const FORTS: Record<string, [string, number, number, string, string][]> = {
  civilwar1861: [
    ["Fort Sumter and the Charleston forts", 2168, 1043, "south_carolina", "Defense Post"],
    ["Fort Monroe", 2281, 781, "maryland", "Defense Post"],
    ["the defences of Washington", 2229, 680, "maryland", "Defense Post"],
    ["Vicksburg", 1664, 1122, "mississippi", "Defense Post"],
    ["Fort Donelson", 1784, 883, "tennessee", "Defense Post"],
    ["Forts Jackson and St. Philip", 1742, 1282, "louisiana", "Defense Post"],
    ["Fort Pulaski", 2128, 1090, "georgia", "Defense Post"],
    ["the Brooklyn Navy Yard", 2334, 558, "new_york", "Port"],
    ["the Gosport Navy Yard, Norfolk", 2284, 791, "virginia", "Port"],
    ["the Tredegar Iron Works", 2227, 762, "virginia", "Factory"],
    ["the Springfield Armory", 2371, 469, "massachusetts_state", "Factory"],
  ],
  ww1914: [
    ["Liege", 1232, 839, "belgium", "Defense Post"],
    ["Namur", 1204, 845, "belgium", "Defense Post"],
    ["Verdun", 1224, 898, "france", "Defense Post"],
    ["Belfort", 1284, 960, "france", "Defense Post"],
    ["Metz", 1257, 900, "german_empire", "Defense Post"],
    ["Strasbourg", 1321, 922, "german_empire", "Defense Post"],
    ["Przemysl", 1930, 873, "austria_hungary", "Defense Post"],
    ["Novogeorgievsk", 1846, 766, "russia", "Defense Post"],
    ["Brest-Litovsk", 1968, 779, "russia", "Defense Post"],
    ["Scapa Flow", 880, 503, "united_kingdom", "Port"],
    ["Kiel", 1417, 689, "german_empire", "Port"],
    ["Wilhelmshaven", 1335, 721, "german_empire", "Port"],
    ["Pola", 1568, 1072, "austria_hungary", "Port"],
    ["Toulon", 1247, 1143, "france", "Port"],
    ["Kronstadt", 2214, 459, "russia", "Port"],
    ["the Ruhr", 1290, 805, "german_empire", "Factory"],
  ],
  napoleon1812: [
    ["the Lines of Torres Vedras", 631, 1312, "portugal", "Defense Post"],
    ["Danzig", 1763, 688, "french_empire", "Defense Post"],
    ["Hamburg", 1411, 720, "french_empire", "Defense Post"],
    ["Magdeburg", 1478, 778, "westphalia", "Defense Post"],
    ["Riga", 1985, 582, "russia", "Defense Post"],
    ["Kiev", 2245, 846, "russia", "Defense Post"],
    ["Modlin", 1846, 766, "warsaw", "Defense Post"],
    ["Portsmouth", 962, 832, "united_kingdom", "Port"],
    ["Plymouth", 838, 849, "united_kingdom", "Port"],
    ["Gibraltar", 789, 1426, "united_kingdom", "Port"],
    ["Brest", 824, 929, "french_empire", "Port"],
    ["Toulon", 1247, 1143, "french_empire", "Port"],
    ["Antwerp", 1184, 815, "french_empire", "Port"],
    ["Kronstadt", 2214, 459, "russia", "Port"],
  ],
  korea1950: [
    ["the North's line at Cheorwon", 499, 1158, "north_korea", "Defense Post"],
    ["the North's line on the east coast", 700, 1152, "north_korea", "Defense Post"],
    ["Uijeongbu", 475, 1223, "south_korea", "Defense Post"],
    ["Hungnam", 565, 803, "north_korea", "Factory"],
    ["Busan", 798, 1766, "south_korea", "Port"],
    ["Incheon", 408, 1290, "south_korea", "Port"],
    ["Sasebo", 909, 2144, "un_command", "Port"],
  ],
  threekingdoms219: [
    ["Jiange, the Sword Gate", 407, 906, "liu_bei", "Defense Post"],
    ["Yangping Pass", 442, 864, "liu_bei", "Defense Post"],
    ["Jiangling", 785, 1046, "liu_bei", "Defense Post"],
    ["Hefei", 1073, 939, "cao_cao", "Defense Post"],
    ["Fancheng", 782, 935, "cao_cao", "Defense Post"],
    ["Ruxu", 1111, 972, "sun_quan", "Defense Post"],
    ["Jingkou", 1196, 910, "sun_quan", "Port"],
    ["Xiakou", 906, 1033, "sun_quan", "Port"],
  ],
  italy1859: [
    ["Verona", 500, 191, "austria", "Defense Post"],
    ["Mantua", 477, 222, "austria", "Defense Post"],
    ["Peschiera", 467, 191, "austria", "Defense Post"],
    ["Legnago", 534, 219, "austria", "Defense Post"],
    ["Alessandria", 239, 250, "sardinia", "Defense Post"],
    ["Casale", 221, 226, "sardinia", "Defense Post"],
    ["Gaeta", 780, 657, "two_sicilies", "Defense Post"],
    ["Venice", 648, 191, "austria", "Port"],
    ["Pola", 813, 253, "austria", "Port"],
    ["Genoa", 273, 305, "sardinia", "Port"],
    ["La Spezia", 370, 339, "sardinia", "Port"],
    ["Naples", 857, 696, "two_sicilies", "Port"],
  ],
};

const STRUCTURE_TYPES: Record<string, UnitType> = {
  "Defense Post": UnitType.DefensePost,
  Port: UnitType.Port,
  Factory: UnitType.Factory,
};

describe.each(Object.keys(FORTS))("%s starting structures", (id) => {
  it("places the main fortifications, bases and works, and nothing anachronistic", async () => {
    const g = await scenarioGame(id);
    for (const [place, x, y, key, type] of FORTS[id]) {
      const near = g
        .nation(key)
        .units(STRUCTURE_TYPES[type])
        .some((u) => {
          const t = u.tile();
          const dx = g.game.x(t) - x;
          const dy = g.game.y(t) - y;
          return dx * dx + dy * dy <= 20 * 20;
        });
      expect(near, place).toBe(true);
    }
    // No missile silos or SAM launchers at the start in any of these wars.
    for (const p of g.game.players()) {
      expect(
        p.units(UnitType.MissileSilo, UnitType.SAMLauncher),
        p.name(),
      ).toHaveLength(0);
    }
  }, 120_000);
});

function wins(g: ScenarioGame) {
  return g.updates.flatMap((u) => u.updates[GameUpdateType.Win]);
}

describe("Korea 1950: North Korea takes the South", () => {
  it("says so on the win screen", () => {
    expect(en.scenarios.win.northkorea).toBe("North Korea takes the South");
  });

  it("wins holding all of South Korea's land, islets ignored and Japan not needed", async () => {
    const g = await scenarioGame("korea1950");
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const un = g.nation("un_command");
    const all = holdTargetTiles(g.game, ["south_korea"], 0);
    const big = holdTargetTiles(g.game, ["south_korea"], 200);
    // The peninsula south of the line, Jeju and the islands; a few dozen
    // islets under 200 tiles left out.
    expect(big.length).toBeGreaterThan(290_000);
    expect(all.length - big.length).toBeGreaterThan(1000);
    expect(all.length - big.length).toBeLessThan(5000);
    const unLand = un.numTilesOwned();

    // All of it but one tile, which the UN holds (an Inchon landing): the
    // war goes on.
    for (let i = 0; i < big.length - 1; i++) north.conquer(big[i]);
    un.conquer(big[big.length - 1]);
    g.updates.length = 0;
    g.step(20);
    expect(wins(g)).toHaveLength(0);

    // South Korea holding it back instead: still no win.
    south.conquer(big[big.length - 1]);
    g.step(20);
    expect(wins(g)).toHaveLength(0);

    // The last tile: the North wins, with the UN's base in Japan untouched
    // and South Korea's islets still its own.
    north.conquer(big[big.length - 1]);
    g.step(20);
    const w = wins(g);
    expect(w).toHaveLength(1);
    expect(w[0].winner?.[1]).toBe("NorthKorea");
    expect(un.numTilesOwned()).toBe(unLand);
    expect(south.numTilesOwned()).toBeGreaterThan(0);
  }, 120_000);

  it("the South still wins by taking all of the North", async () => {
    const g = await scenarioGame("korea1950");
    const north = g.nation("north_korea");
    const south = g.nation("south_korea");
    const tiles = [...north.tiles()];
    for (const t of tiles.slice(50)) south.conquer(t);
    g.updates.length = 0;
    g.step(20);
    const w = wins(g);
    expect(w).toHaveLength(1);
    expect(w[0].winner?.[1]).toBe("UnitedNations");
  }, 120_000);
});

describe("Three Kingdoms 219: three sides", () => {
  it("locks each kingdom to its side, Shi Xie with Wu", async () => {
    const g = await scenarioGame("threekingdoms219");
    const cao = g.nation("cao_cao");
    const liu = g.nation("liu_bei");
    const sun = g.nation("sun_quan");
    const shi = g.nation("shi_xie");
    expect([cao.team(), liu.team(), sun.team(), shi.team()]).toEqual([
      "Wei",
      "Shu",
      "Wu",
      "Wu",
    ]);
    expect(sun.isFriendly(shi)).toBe(true);
    expect(cao.isFriendly(liu)).toBe(false);
    expect(liu.isFriendly(sun)).toBe(false);
    expect(g.nation("xianbei").team()).toBeNull();
    // Sun Quan's river fleet starts on the Yangtze, at Jingkou and Ruxu.
    const onRiver = (x: number, y: number) =>
      sun.units(UnitType.Warship).some((u) => {
        const dx = g.game.x(u.tile()) - x;
        const dy = g.game.y(u.tile()) - y;
        return dx * dx + dy * dy <= 25 && g.game.isWater(u.tile());
      });
    expect(onRiver(1196, 907)).toBe(true);
    expect(onRiver(1119, 977)).toBe(true);
  }, 120_000);

  it("an invaded neutral joins the other side it borders most, else the smaller", async () => {
    const g = await scenarioGame("threekingdoms219");
    const attack = (by: string, target: string) => {
      const a = g.nation(by);
      g.game.addExecution(
        new AttackExecution(a.troops() / 10, a, g.nation(target).id()),
      );
      g.step(3);
    };
    // Sun Quan invades Nanzhong, which borders Liu Bei (and Wu), not Wei.
    attack("sun_quan", "nanzhong");
    expect(g.nation("nanzhong").team()).toBe("Shu");
    // Liu Bei invades the Qiang, who border Wei more than anyone else
    // (the Hexi corridor and Longxi) and Shu too.
    attack("liu_bei", "qiang");
    expect(g.nation("qiang").team()).toBe("Wei");
    // Cao Cao invades Gongsun Kang, who borders neither Shu nor Wu: he
    // joins the smaller of the two, Shu.
    attack("cao_cao", "gongsun_kang");
    expect(g.nation("gongsun_kang").team()).toBe("Shu");
  }, 120_000);
});

describe("a short computer-only game of each (the balance script's short version)", () => {
  it.each(Object.keys(LINEUPS))(
    "%s plays on, every side still in it after a minute",
    async (id) => {
      const g = await scenarioGame(id, { gameID: "BALANCE6" });
      g.step(600);
      const data = scenarioData(id)!;
      for (const s of data.sides) {
        const land = g.game
          .players()
          .filter((p) => p.team() === s.id)
          .reduce((n, p) => n + p.numTilesOwned(), 0);
        expect(land, s.id).toBeGreaterThan(0);
      }
      expect(wins(g)).toHaveLength(0);
    },
    300_000,
  );

  it("is deterministic: the same seed plays the same war", async () => {
    const play = async () => {
      const g = await scenarioGame("threekingdoms219", { gameID: "BALANCE7" });
      const hashes: number[] = [];
      for (let i = 0; i < 4; i++) {
        g.step(300);
        hashes.push((g.game as unknown as { hash(): number }).hash());
      }
      return hashes;
    };
    expect(await play()).toEqual(await play());
  }, 300_000);
});
