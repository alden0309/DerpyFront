// Each people's own goods: English woollens, French brandy and wine,
// Spanish cochineal and chocolate, Dutch fine cloth, spices and gin,
// Portuguese brazilwood (by way of Lisbon and the Dutch), Swedish iron, and
// what the native nations make: wampum on the northeast coast, maize in the
// farming country, deerskins in the southeast, birchbark canoes in the north
// woods, pottery in the pueblos and the south, buffalo robes on the plains.
//
// They're sold cheap where they're made and fetch most where they're
// wanted: natives prize woollen blankets, iron kettles and (alas) brandy;
// colonists pay for wine, spices, chocolate and deerskins; New Netherland
// and New England take wampum as money. They're carried like any other load
// and can be given as gifts at a council fire.

import type { World } from "./Map";
import type { GameState, Good, ProvinceDef, TradeItem, WareId } from "./Types";
import { GOODS } from "./Types";

export interface WareDef {
  id: WareId;
  name: string;
  /** What exactly it is, for the market table. */
  text: string;
  /** Where it comes from, in a word ("English", "Wendat", "Lisbon"). */
  origin: string;
  /** A load's price where it's neither made nor especially wanted. */
  base: number;
  /** Colonies of these powers stock it (brought from home, or made there). */
  powers?: string[];
  /** Big ports of any colony stock it (Portuguese goods, smuggled and traded). */
  anyPort?: boolean;
  /** Native peoples who make it, by nation key. */
  peoples?: string[];
  /** What natives pay for it, × base; colonists likewise; a power's colonists especially. */
  want: { natives: number; colonists: number; powers?: Record<string, number> };
  /** How many loads a market takes before the price sags (× the town's size). */
  depth: number;
  /** A prized gift at a council fire (worth twice its price in goodwill). */
  gift?: boolean;
  /** The icon's colour. */
  color: string;
}

const NORTHEAST_COAST = ["narragansett", "wampanoag", "lenape", "wabanaki"];
const FARMERS = [
  "powhatan",
  "haudenosaunee",
  "wendat",
  "attawandaron",
  "erie",
  "susquehannock",
  "lenape",
  "wampanoag",
  "narragansett",
  "cherokee",
  "muscogee",
  "choctaw",
  "chickasaw",
  "natchez",
  "caddo",
  "illinois",
  "pawnee",
  "pueblo",
  "mexica",
  "purepecha",
  "zapotec",
  "maya",
  "kiche",
];
const SOUTHEAST = [
  "cherokee",
  "muscogee",
  "choctaw",
  "chickasaw",
  "timucua",
  "powhatan",
  "natchez",
  "caddo",
];
const NORTH_WOODS = [
  "anishinaabe",
  "cree",
  "innu",
  "mikmaq",
  "wabanaki",
  "wendat",
  "attawandaron",
];
const POTTERS = [
  "pueblo",
  "natchez",
  "caddo",
  "maya",
  "itza",
  "zapotec",
  "purepecha",
  "mexica",
  "cherokee",
];
const PLAINS = ["oceti", "pawnee", "blackfoot", "apache", "osage", "shoshone"];

export const WARES: Record<WareId, WareDef> = {
  woollens: {
    id: "woollens",
    name: "Woollens",
    text: "English broadcloth, duffels and strouds: the blankets every trade wants.",
    origin: "English",
    base: 4,
    powers: ["england"],
    want: { natives: 1.4, colonists: 1.05 },
    depth: 1,
    gift: true,
    color: "#3d5a8a",
  },
  brandy: {
    id: "brandy",
    name: "Brandy",
    text: "French eau-de-vie by the cask. Natives pay dearly for it, and so do their families.",
    origin: "French",
    base: 4.5,
    powers: ["france"],
    want: { natives: 1.45, colonists: 1.1 },
    depth: 0.8,
    gift: true,
    color: "#a8642a",
  },
  wine: {
    id: "wine",
    name: "Wine",
    text: "Bordeaux claret and Spanish sack, for the governor's table and the vestry's.",
    origin: "French and Spanish",
    base: 5,
    powers: ["france", "spain"],
    want: {
      natives: 0.6,
      colonists: 1.25,
      powers: { england: 1.4, netherlands: 1.35, sweden: 1.4 },
    },
    depth: 0.6,
    color: "#7a1f2b",
  },
  cochineal: {
    id: "cochineal",
    name: "Cochineal",
    text: "Dried insects from the Oaxaca cactus: the finest scarlet dye there is, and Spain's jealous secret.",
    origin: "Spanish",
    base: 9,
    powers: ["spain"],
    want: {
      natives: 0.4,
      colonists: 1.2,
      powers: { england: 1.6, netherlands: 1.6, france: 1.5 },
    },
    depth: 0.4,
    color: "#b3172f",
  },
  chocolate: {
    id: "chocolate",
    name: "Chocolate",
    text: "Cacao from the Maya country, ground with sugar and vanilla. New Spain drinks it at every hour.",
    origin: "Spanish",
    base: 6,
    powers: ["spain"],
    peoples: ["maya", "itza", "kiche"],
    want: { natives: 0.9, colonists: 1.3 },
    depth: 0.6,
    color: "#5a3420",
  },
  finecloth: {
    id: "finecloth",
    name: "Fine cloth",
    text: "Leiden laken and Holland linen, finer than anything the colonies weave.",
    origin: "Dutch",
    base: 6,
    powers: ["netherlands"],
    want: { natives: 1.2, colonists: 1.3 },
    depth: 0.7,
    gift: true,
    color: "#2f6f6a",
  },
  spices: {
    id: "spices",
    name: "Spices",
    text: "Pepper, nutmeg and cloves from the East Indies, by the Dutch Company's ships.",
    origin: "Dutch",
    base: 8,
    powers: ["netherlands"],
    want: { natives: 0.7, colonists: 1.5 },
    depth: 0.5,
    color: "#9a5b1c",
  },
  gin: {
    id: "gin",
    name: "Gin",
    text: "Genever from Schiedam, in stone bottles.",
    origin: "Dutch",
    base: 3.5,
    powers: ["netherlands"],
    want: { natives: 1.3, colonists: 1.1 },
    depth: 0.8,
    color: "#8a9a76",
  },
  brazilwood: {
    id: "brazilwood",
    name: "Brazilwood",
    text: "Portuguese dyewood from Brazil, by way of Lisbon and the Dutch: red for the dyers.",
    origin: "Portuguese",
    base: 4,
    anyPort: true,
    want: { natives: 0.5, colonists: 1.25 },
    depth: 0.7,
    color: "#a33a1e",
  },
  iron: {
    id: "iron",
    name: "Swedish iron",
    text: "Bar iron, kettles and axes from the Bergslagen forges. A copper kettle lasts; an iron one lasts longer.",
    origin: "Swedish",
    base: 3.5,
    powers: ["sweden"],
    want: { natives: 1.5, colonists: 1.1 },
    depth: 1,
    gift: true,
    color: "#4a4f57",
  },
  wampum: {
    id: "wampum",
    name: "Wampum",
    text: "White and purple shell beads strung in belts: treaties are made with it, and the Dutch take it as money.",
    origin: "Northeast coast",
    base: 3,
    peoples: NORTHEAST_COAST,
    want: {
      natives: 1.45,
      colonists: 1.1,
      powers: { netherlands: 1.35, sweden: 1.25, england: 1.15 },
    },
    depth: 1,
    gift: true,
    color: "#6d4f8c",
  },
  maize: {
    id: "maize",
    name: "Maize",
    text: "Dried corn by the bushel. Many a colony lived through its first winter on it.",
    origin: "native farms",
    base: 1.5,
    peoples: FARMERS,
    want: { natives: 1, colonists: 1.3 },
    depth: 2,
    color: "#d9a92c",
  },
  deerskins: {
    id: "deerskins",
    name: "Deerskins",
    text: "Dressed buckskins from the southern hunts, bound for the breeches-makers of London.",
    origin: "Southeast",
    base: 3.5,
    peoples: SOUTHEAST,
    want: { natives: 0.6, colonists: 1.15, powers: { england: 1.35 } },
    depth: 1,
    color: "#b07d4f",
  },
  canoes: {
    id: "canoes",
    name: "Birchbark canoes",
    text: "Light enough to carry round the rapids, big enough for a ton of furs. The voyageurs pay well.",
    origin: "North woods",
    base: 6,
    peoples: NORTH_WOODS,
    want: { natives: 1.1, colonists: 1.2, powers: { france: 1.6 } },
    depth: 0.4,
    color: "#c9b48a",
  },
  pottery: {
    id: "pottery",
    name: "Pottery",
    text: "Painted jars and bowls from the pueblos and the towns of the south.",
    origin: "Pueblo and southern",
    base: 2.5,
    peoples: POTTERS,
    want: { natives: 1.2, colonists: 1.1 },
    depth: 1,
    color: "#b5562e",
  },
  robes: {
    id: "robes",
    name: "Buffalo robes",
    text: "Painted bison hides from the plains: warm as a house.",
    origin: "Plains",
    base: 4,
    peoples: PLAINS,
    want: { natives: 0.8, colonists: 1.4 },
    depth: 0.8,
    color: "#6b4a2e",
  },
};

export const WARE_IDS = Object.keys(WARES) as WareId[];

export function isWare(item: string): item is WareId {
  return item in WARES;
}

export function isTradeItem(item: unknown): item is TradeItem {
  return (
    typeof item === "string" &&
    (isWare(item) || (GOODS as readonly string[]).includes(item))
  );
}

/** Wares a power's colonies stock (their own culture's goods). */
export function waresOfPower(key: string): WareId[] {
  return WARE_IDS.filter((id) => WARES[id].powers?.includes(key));
}

/** Wares a native people make. */
export function waresOfPeople(key: string): WareId[] {
  return WARE_IDS.filter((id) => WARES[id].peoples?.includes(key));
}

/** The ten goods a people are known for, too (for the province page). */
const GOOD_OF_POWER: Record<string, Good[]> = {
  england: ["tobacco"],
  france: ["furs"],
  spain: ["silver"],
  netherlands: [],
  sweden: [],
};

/** A people's own goods, for showing on their provinces and nation. */
export function cultureGoods(
  s: GameState,
  n: number,
): { goods: Good[]; wares: WareId[] } {
  const nation = s.nations[n];
  if (!nation) return { goods: [], wares: [] };
  if (nation.kind === "native") {
    const wares = waresOfPeople(nation.key);
    return {
      goods: ["furs"],
      wares: wares.length ? wares : (["maize"] as WareId[]),
    };
  }
  const key = nation.kind === "power" ? nation.key : nation.key.slice(6);
  return {
    goods: GOOD_OF_POWER[key] ?? [],
    wares: waresOfPower(key),
  };
}

/** Wares made in a province by the people living there (native or colony). */
export function waresMadeIn(s: GameState, w: World, p: number): WareId[] {
  const pr = s.provinces[p];
  if (!pr || pr.owner < 0) return [];
  const nation = s.nations[pr.owner];
  if (nation.kind === "native") {
    const own = waresOfPeople(nation.key);
    // Every farming people grows maize, and the north woods' peoples build canoes.
    const def = w.map.provinces[p];
    const extra: WareId[] = [];
    if (!own.includes("maize") && farmland(def)) extra.push("maize");
    return [...own, ...extra];
  }
  if (nation.kind === "power") {
    const own = waresOfPower(nation.key);
    // The great ports have everything the Atlantic trade brings.
    const bigPort = nation.capital === p || (pr.b.port ?? 0) >= 2;
    if (bigPort) for (const id of WARE_IDS) if (WARES[id].anyPort) own.push(id);
    return own;
  }
  return [];
}

function farmland(def: ProvinceDef): boolean {
  return (
    def.lat < 46 &&
    def.lat > 14 &&
    (def.terrain === "plains" ||
      def.terrain === "forest" ||
      def.terrain === "hills")
  );
}
