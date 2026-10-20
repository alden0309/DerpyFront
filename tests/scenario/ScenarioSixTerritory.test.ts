// SCEN2 (r25): the six more scenarios' starting land, as
// ScenarioTerritory.test.ts checks SCEN's: every land tile owned, by the
// right nations at known places (map pixels of the full-size map, from the
// tools' fitted projections), and each nation's land in one piece unless it
// is scattered on purpose.

import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { describe, expect, it } from "vitest";
import { scenarioGame } from "./ScenarioTestUtil";

const SPOTS: Record<string, [string, number, number, string][]> = {
  civilwar1861: [
    ["Washington, D.C.", 2229, 684, "maryland"],
    ["Richmond", 2227, 761, "virginia"],
    ["Wheeling (West Virginia)", 2064, 648, "virginia"],
    ["Frankfort", 1904, 775, "kentucky"],
    ["Louisville", 1866, 776, "kentucky"],
    ["Boston", 2427, 440, "massachusetts_state"],
    ["Albany", 2317, 451, "new_york"],
    ["Chicago", 1768, 583, "illinois"],
    ["St. Louis", 1674, 771, "missouri"],
    ["Baltimore", 2243, 659, "maryland"],
    ["Charleston", 2165, 1042, "south_carolina"],
    ["Montgomery", 1876, 1103, "alabama"],
    ["New Orleans", 1710, 1252, "louisiana"],
    ["Austin", 1344, 1242, "texas"],
    ["Nashville", 1833, 897, "tennessee"],
    ["Little Rock", 1593, 992, "arkansas"],
    ["Tahlequah", 1472, 929, "cherokee_nation"],
    ["Muskogee", 1454, 939, "muscogee"],
    ["Doaksville", 1460, 1035, "choctaw"],
    ["Tishomingo", 1396, 1023, "chickasaw"],
    ["Olympia", 419, 170, "washington_t"],
    ["Boise", 626, 417, "washington_t"],
    ["Missoula", 746, 258, "washington_t"],
    ["Helena", 817, 287, "dakota_t"],
    ["Yankton", 1369, 543, "dakota_t"],
    ["Cheyenne", 1062, 623, "nebraska_t"],
    ["Omaha", 1428, 633, "nebraska_t"],
    ["Denver", 1048, 699, "colorado_t"],
    ["Salt Lake City", 769, 605, "utah_t"],
    ["Ely", 630, 665, "utah_t"],
    ["Carson City", 427, 624, "nevada_t"],
    ["Las Vegas", 585, 831, "new_mexico_t"],
    ["Santa Fe", 985, 919, "new_mexico_t"],
    ["Tucson", 733, 1080, "new_mexico_t"],
    ["Sacramento", 347, 636, "california"],
    ["Topeka", 1440, 756, "kansas"],
  ],
  ww1914: [
    ["Berlin", 1550, 762, "german_empire"],
    ["Strasbourg", 1321, 922, "german_empire"],
    ["Metz", 1257, 900, "german_empire"],
    ["Nancy", 1257, 917, "france"],
    ["Paris", 1101, 910, "france"],
    ["Brussels", 1182, 830, "belgium"],
    ["Luxembourg", 1255, 880, "luxembourg"],
    ["Vienna", 1671, 937, "austria_hungary"],
    ["Prague", 1591, 861, "austria_hungary"],
    ["Krakow", 1815, 862, "austria_hungary"],
    ["Lviv", 1982, 871, "austria_hungary"],
    ["Sarajevo", 1754, 1113, "austria_hungary"],
    ["Trieste", 1565, 1041, "austria_hungary"],
    ["Trento", 1457, 1024, "austria_hungary"],
    ["Cluj", 1964, 995, "austria_hungary"],
    ["Warsaw", 1859, 774, "russia"],
    ["Kalisz", 1740, 793, "russia"],
    ["Posen", 1693, 767, "german_empire"],
    ["Konigsberg", 1838, 673, "german_empire"],
    ["Memel", 1864, 633, "german_empire"],
    ["Helsinki", 2018, 452, "russia"],
    ["Chisinau", 2178, 986, "russia"],
    ["Kars", 2756, 1246, "russia"],
    ["Belgrade", 1837, 1075, "serbia"],
    ["Skopje", 1876, 1189, "serbia"],
    ["Cetinje", 1774, 1173, "montenegro"],
    ["Pec", 1830, 1162, "montenegro"],
    ["Sofia", 1953, 1160, "bulgaria"],
    ["Xanthi", 2016, 1224, "bulgaria"],
    ["Dobrich", 2136, 1125, "romania"],
    ["Bucharest", 2066, 1090, "romania"],
    ["Thessaloniki", 1938, 1244, "greece"],
    ["Constantinople", 2183, 1229, "ottoman"],
    ["Damascus", 2480, 1533, "ottoman"],
    ["Rome", 1514, 1193, "italy"],
    ["Tripoli", 1542, 1558, "italy"],
    ["Rhodes", 2152, 1414, "italy"],
    ["Durres", 1796, 1216, "albania"],
    ["London", 1000, 803, "united_kingdom"],
    ["Dublin", 752, 728, "united_kingdom"],
    ["Alexandria", 2221, 1627, "united_kingdom"],
    ["Nicosia", 2361, 1466, "united_kingdom"],
    ["Algiers", 1130, 1402, "france"],
    ["Tetouan", 788, 1449, "spain"],
    ["Haderslev (North Schleswig)", 1391, 651, "german_empire"],
    ["Copenhagen", 1516, 634, "denmark"],
    ["Reykjavik", 115, 290, "denmark"],
    ["Tabriz", 2886, 1348, "persia"],
    ["Bern", 1308, 988, "switzerland"],
  ],
  napoleon1812: [
    ["Paris", 1101, 910, "french_empire"],
    ["Amsterdam", 1205, 768, "french_empire"],
    ["Cologne", 1288, 826, "french_empire"],
    ["Hamburg", 1411, 720, "french_empire"],
    ["Lubeck", 1440, 707, "french_empire"],
    ["Stralsund (Swedish Pomerania)", 1537, 689, "french_empire"],
    ["Danzig", 1763, 688, "french_empire"],
    ["Rome", 1514, 1193, "french_empire"],
    ["Turin", 1318, 1064, "french_empire"],
    ["Ljubljana (Illyria)", 1595, 1024, "french_empire"],
    ["Barcelona", 1094, 1213, "french_empire"],
    ["Geneva", 1255, 1018, "french_empire"],
    ["Milan", 1379, 1048, "kingdom_of_italy"],
    ["Venice", 1507, 1049, "kingdom_of_italy"],
    ["Bologna", 1466, 1088, "kingdom_of_italy"],
    ["Naples", 1586, 1235, "naples"],
    ["Palermo", 1549, 1346, "sicily"],
    ["Cagliari", 1376, 1301, "sardinia"],
    ["Munich", 1476, 940, "bavaria"],
    ["Innsbruck", 1469, 975, "bavaria"],
    ["Salzburg", 1536, 953, "bavaria"],
    ["Stuttgart", 1379, 914, "wurttemberg"],
    ["Frankfurt", 1358, 860, "wurttemberg"],
    ["Dresden", 1564, 822, "saxony"],
    ["Leipzig", 1508, 810, "saxony"],
    ["Kassel", 1391, 811, "westphalia"],
    ["Hanover", 1401, 768, "westphalia"],
    ["Magdeburg", 1478, 778, "westphalia"],
    ["Schwerin", 1469, 717, "westphalia"],
    ["Warsaw", 1859, 774, "warsaw"],
    ["Posen", 1693, 767, "warsaw"],
    ["Krakow", 1815, 862, "warsaw"],
    ["Berlin", 1550, 762, "prussia"],
    ["Konigsberg", 1838, 673, "prussia"],
    ["Breslau", 1698, 819, "prussia"],
    ["Vienna", 1671, 937, "austria"],
    ["Lviv", 1982, 871, "austria"],
    ["Zagreb", 1655, 1034, "austria"],
    ["Saint Petersburg", 2237, 461, "russia"],
    ["Moscow", 2533, 631, "russia"],
    ["Vilnius", 2032, 674, "russia"],
    ["Helsinki", 2018, 452, "russia"],
    ["Chisinau", 2178, 986, "russia"],
    ["Bialystok", 1946, 737, "russia"],
    ["Ternopil", 2045, 883, "russia"],
    ["Copenhagen", 1516, 634, "denmark_norway"],
    ["Oslo", 1442, 462, "denmark_norway"],
    ["Stockholm", 1739, 486, "sweden"],
    ["London", 1000, 803, "united_kingdom"],
    ["Lisbon", 635, 1322, "portugal"],
    ["Cadiz", 751, 1410, "spain"],
    ["Madrid", 856, 1253, "spain"],
    ["Bern", 1308, 988, "switzerland"],
    ["Belgrade", 1837, 1075, "serbia"],
    ["Constantinople", 2183, 1229, "ottoman"],
    ["Bucharest", 2066, 1090, "ottoman"],
    ["Fez", 803, 1512, "morocco"],
    ["Tabriz", 2886, 1348, "persia"],
    ["Yerevan", 2813, 1263, "persia"],
    ["Tbilisi", 2825, 1200, "russia"],
  ],
  korea1950: [
    ["Pyongyang", 264, 972, "north_korea"],
    ["Seoul", 464, 1270, "south_korea"],
    ["Kaesong", 394, 1188, "south_korea"],
    ["Ongjin", 202, 1196, "south_korea"],
    ["Haeju", 259, 1174, "north_korea"],
    ["Yangyang", 728, 1167, "north_korea"],
    ["Busan", 798, 1766, "south_korea"],
    ["Jeju", 395, 2087, "south_korea"],
    ["Wonsan", 537, 945, "north_korea"],
    ["Sinuiju", 46, 745, "north_korea"],
    ["Fukuoka", 1019, 2061, "un_command"],
    ["Sasebo", 909, 2144, "un_command"],
    ["Tsushima", 841, 1903, "un_command"],
  ],
  threekingdoms219: [
    ["Ye", 902, 646, "cao_cao"],
    ["Xuchang", 876, 801, "cao_cao"],
    ["Luoyang", 799, 762, "cao_cao"],
    ["Chang'an", 605, 783, "cao_cao"],
    ["Xiangyang", 782, 936, "cao_cao"],
    ["Hefei", 1073, 940, "cao_cao"],
    ["Chengdu", 317, 1009, "liu_bei"],
    ["Hanzhong", 495, 859, "liu_bei"],
    ["Jiangling", 785, 1048, "liu_bei"],
    ["Lingling", 750, 1311, "liu_bei"],
    ["Jianye", 1158, 922, "sun_quan"],
    ["Changsha", 831, 1192, "sun_quan"],
    ["Wuchang", 906, 1033, "sun_quan"],
    ["Ruxu", 1111, 974, "sun_quan"],
    ["Panyu", 851, 1534, "sun_quan"],
    ["Jiaozhi", 381, 1665, "shi_xie"],
    ["Xiangping", 1343, 286, "gongsun_kang"],
    ["Pyongyang (Lelang)", 1493, 422, "gongsun_kang"],
    ["Ji'an", 1497, 278, "goguryeo"],
    ["Xining", 224, 601, "qiang"],
    ["Dianchi", 205, 1379, "nanzhong"],
    ["Huangshan", 1142, 1081, "shanyue"],
    ["Hohhot", 757, 345, "xianbei"],
  ],
  italy1859: [
    ["Turin", 137, 233, "sardinia"],
    ["Genoa", 273, 305, "sardinia"],
    ["Nice", 90, 384, "sardinia"],
    ["Chambery side (Chamonix)", 48, 139, "sardinia"],
    ["Cagliari", 290, 877, "sardinia"],
    ["Milan", 302, 190, "austria"],
    ["Pavia", 299, 219, "austria"],
    ["Venice", 648, 191, "austria"],
    ["Trieste", 805, 168, "austria"],
    ["Zagreb", 1047, 149, "austria"],
    ["Antibes", 74, 397, "france"],
    ["Ajaccio", 251, 579, "france"],
    ["Annaba", 142, 1133, "france"],
    ["Parma", 427, 262, "parma"],
    ["Modena", 493, 278, "modena"],
    ["Florence", 528, 375, "tuscany"],
    ["Lucca", 445, 368, "tuscany"],
    ["Rome", 661, 581, "papal_states"],
    ["Bologna", 537, 296, "papal_states"],
    ["San Marino", 659, 357, "san_marino"],
    ["Naples", 857, 696, "two_sicilies"],
    ["Palermo", 756, 997, "two_sicilies"],
    ["Gaeta", 780, 657, "two_sicilies"],
    ["Bern", 112, 26, "switzerland"],
    ["Valletta", 881, 1241, "malta"],
    ["Tunis", 406, 1142, "tunis"],
    ["Sarajevo", 1313, 364, "ottoman"],
  ],
};

// Nations whose land is in pieces on purpose (islands, colonies, exclaves),
// beyond what the map's rivers cut.
const SCATTERED: Record<string, string[]> = {
  ww1914: [
    "france", // Corsica, Algeria, Tunisia, Morocco
    "united_kingdom", // Ireland and the islands, Gibraltar, Malta, Cyprus, Egypt
    "italy", // Sicily, Sardinia, Libya, the Dodecanese
    "greece", // Crete and the islands
    "denmark", // Iceland, the Faroes, the Danish islands
  ],
  napoleon1812: [
    "french_empire", // Corsica, Illyria, Catalonia, Danzig, Swedish Pomerania, Corfu
    "denmark_norway", // Norway, Iceland, the Faroes
    "united_kingdom", // Ireland, Gibraltar, Malta, the Ionian Islands
  ],
  korea1950: [
    "un_command", // Kyushu, Tsushima and the islands
  ],
  threekingdoms219: [
    "sun_quan", // Taiwan and the islands
    "shi_xie", // Hainan and the Leizhou coast
    "shanyue", // two hill countries, Fujian's and southern Anhui's
  ],
  italy1859: [
    "sardinia", // the island of Sardinia
    "france", // Corsica, Algeria, the Alpine strip
    "two_sicilies", // Sicily
    "malta", // Malta and Gozo
  ],
};

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

  it("keeps its file small", () => {
    const data = scenarioData(id)!;
    expect(JSON.stringify(data).length).toBeLessThan(50_000);
  });
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

