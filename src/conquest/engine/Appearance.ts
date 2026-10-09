// How a character looks: the features of their face, their hair and its
// colour, what they wear on their head and their back, and the marks life
// has left on them. Players choose theirs in the register; everyone else is
// given a look of their own, the same each time, that fits their people,
// their station and the years they live in; children take after their
// parents. The client paints portraits from these (client/avatar/).
//
// Everything here is pure: the same person always looks the same, and
// nothing draws on the game's own random numbers.

import { dateOf } from "./Calendar";
import { nextRandom } from "./Rng";
import { DAYS_PER_YEAR } from "./Rules";
import type { Character } from "./Types";

// ---------------------------------------------------------------- the look

export interface Appearance {
  /** Skin tone (SKIN_TONES). */
  skin: number;
  /** Face shape (FACE_SHAPES). */
  face: number;
  jaw: number;
  cheeks: number;
  /** Eye shape (EYE_SHAPES). */
  eyes: number;
  eyeColor: number;
  /** How far apart the eyes are set (EYE_SETS). */
  eyeSet: number;
  brows: number;
  nose: number;
  mouth: number;
  ears: number;
  /** Hair style or wig (HAIR key). */
  hair: string;
  hairColor: number;
  /** Beard or moustache (BEARDS key). */
  beard: string;
  /** Hat, cap, bonnet or headdress (HEADWEAR key). */
  hat: string;
  /** What they wear (CLOTHES key). */
  clothes: string;
  /** Main, second and trim colours of the clothes (CLOTH_COLORS). */
  colors: [number, number, number];
  /** Spectacles, earrings, a gorget... (ACCESSORIES keys). */
  extras: string[];
  /** Freckles, scars, paint... (MARKS keys). */
  marks: string[];
  /** Lines in the face beyond their years, 0 to 3. */
  lines: number;
  /** How early the hair greys, 0 (late) to 3 (early). */
  greying: number;
}

// ---------------------------------------------------------------- palettes

export interface Swatch {
  name: string;
  hex: string;
}

export const SKIN_TONES: Swatch[] = [
  { name: "Porcelain", hex: "#f1d8c4" },
  { name: "Fair", hex: "#e9c6aa" },
  { name: "Light", hex: "#deb493" },
  { name: "Warm", hex: "#d2a37e" },
  { name: "Olive", hex: "#c39470" },
  { name: "Tan", hex: "#b48261" },
  { name: "Copper", hex: "#a46f4e" },
  { name: "Bronze", hex: "#8f5d3e" },
  { name: "Brown", hex: "#784a30" },
  { name: "Deep", hex: "#5c3623" },
];

export const EYE_COLORS: Swatch[] = [
  { name: "Dark brown", hex: "#2b1a10" },
  { name: "Brown", hex: "#4b2e19" },
  { name: "Hazel", hex: "#6b5631" },
  { name: "Green", hex: "#526b46" },
  { name: "Grey", hex: "#6d7781" },
  { name: "Blue", hex: "#4a6b96" },
  { name: "Pale blue", hex: "#7f9ec2" },
];

export const HAIR_COLORS: Swatch[] = [
  { name: "Black", hex: "#16110e" },
  { name: "Dark brown", hex: "#2e2019" },
  { name: "Brown", hex: "#4b3222" },
  { name: "Chestnut", hex: "#6a3b21" },
  { name: "Auburn", hex: "#7f3a1d" },
  { name: "Red", hex: "#a24b22" },
  { name: "Dark blond", hex: "#866742" },
  { name: "Blond", hex: "#b8935a" },
  { name: "Flaxen", hex: "#d3bc8a" },
];

/** Dyes and stuffs of the period: broadcloth, linen, silk, hide. */
export const CLOTH_COLORS: Swatch[] = [
  { name: "Black", hex: "#1e1b18" },
  { name: "Charcoal", hex: "#3b3835" },
  { name: "Dove grey", hex: "#8c8a83" },
  { name: "Umber", hex: "#4f3726" },
  { name: "Russet", hex: "#7b3c21" },
  { name: "Buff", hex: "#b99464" },
  { name: "Madder red", hex: "#8f2b22" },
  { name: "Scarlet", hex: "#b6312a" },
  { name: "Claret", hex: "#6c1f2d" },
  { name: "Indigo", hex: "#273b5f" },
  { name: "Sky blue", hex: "#7192b6" },
  { name: "Bottle green", hex: "#2f4b36" },
  { name: "Olive", hex: "#6b6a3b" },
  { name: "Ochre", hex: "#b88a2f" },
  { name: "Linen", hex: "#e6dcc4" },
  { name: "White", hex: "#f1eee5" },
  { name: "Plum", hex: "#4f2b46" },
  { name: "Orange", hex: "#c46b25" },
  { name: "Slate", hex: "#4e5b67" },
  { name: "Rose", hex: "#b6717a" },
  { name: "Deerskin", hex: "#a8845c" },
  { name: "Smoked hide", hex: "#7d5d3f" },
  { name: "Pale hide", hex: "#c8aa81" },
  { name: "Turquoise", hex: "#3f8a86" },
];

// Colour indices, for the tables below.
const C = {
  black: 0,
  charcoal: 1,
  grey: 2,
  umber: 3,
  russet: 4,
  buff: 5,
  madder: 6,
  scarlet: 7,
  claret: 8,
  indigo: 9,
  sky: 10,
  green: 11,
  olive: 12,
  ochre: 13,
  linen: 14,
  white: 15,
  plum: 16,
  orange: 17,
  slate: 18,
  rose: 19,
  deer: 20,
  smoked: 21,
  palehide: 22,
  turquoise: 23,
} as const;

// ---------------------------------------------------------------- features

export const FACE_SHAPES = [
  "Oval",
  "Round",
  "Long",
  "Square",
  "Heart",
  "Broad",
];
export const JAWS = ["Soft", "Firm", "Square", "Pointed", "Heavy"];
export const CHEEKS = ["Flat", "Full", "High", "Hollow"];
export const EYE_SHAPES = [
  "Almond",
  "Round",
  "Hooded",
  "Narrow",
  "Downturned",
  "Deep-set",
];
export const EYE_SETS = ["Close", "Even", "Wide"];
export const BROWS = ["Fine", "Arched", "Straight", "Heavy", "Bushy"];
export const NOSES = [
  "Straight",
  "Aquiline",
  "Snub",
  "Broad",
  "Long",
  "Button",
  "Hooked",
];
export const MOUTHS = ["Thin", "Full", "Wide", "Small", "Bow"];
export const EARS = ["Small", "Middling", "Large", "Jug"];

/** The numbered features, their names and how many each has. */
export const FEATURES = {
  skin: SKIN_TONES.map((s) => s.name),
  face: FACE_SHAPES,
  jaw: JAWS,
  cheeks: CHEEKS,
  eyes: EYE_SHAPES,
  eyeColor: EYE_COLORS.map((s) => s.name),
  eyeSet: EYE_SETS,
  brows: BROWS,
  nose: NOSES,
  mouth: MOUTHS,
  ears: EARS,
  hairColor: HAIR_COLORS.map((s) => s.name),
  lines: ["None", "A few", "Weathered", "Deep"],
  greying: ["Late", "Middling", "Early", "Very early"],
} as const;

export type Feature = keyof typeof FEATURES;

// ---------------------------------------------------------------- stations and peoples

/** What a person does, as far as their clothes tell it. */
export type Station =
  | "labourer"
  | "tradesman"
  | "merchant"
  | "gentry"
  | "clergy"
  | "soldier"
  | "officer"
  | "sailor"
  | "learned"
  | "frontier";

export const STATIONS: readonly Station[] = [
  "labourer",
  "tradesman",
  "merchant",
  "gentry",
  "clergy",
  "soldier",
  "officer",
  "sailor",
  "learned",
  "frontier",
];

/** Where a native people lives, for what they wore. */
export type Region =
  | "woodlands"
  | "subarctic"
  | "southeast"
  | "plains"
  | "southwest"
  | "california"
  | "northwest"
  | "mesoamerica"
  | "caribbean";

const REGION_OF: Record<string, Region> = {
  haudenosaunee: "woodlands",
  wendat: "woodlands",
  attawandaron: "woodlands",
  erie: "woodlands",
  susquehannock: "woodlands",
  lenape: "woodlands",
  wabanaki: "woodlands",
  mikmaq: "woodlands",
  wampanoag: "woodlands",
  narragansett: "woodlands",
  anishinaabe: "woodlands",
  illinois: "woodlands",
  powhatan: "woodlands",
  cree: "subarctic",
  innu: "subarctic",
  cherokee: "southeast",
  muscogee: "southeast",
  choctaw: "southeast",
  chickasaw: "southeast",
  timucua: "southeast",
  calusa: "southeast",
  natchez: "southeast",
  caddo: "southeast",
  osage: "plains",
  oceti: "plains",
  pawnee: "plains",
  blackfoot: "plains",
  shoshone: "plains",
  apache: "southwest",
  pueblo: "southwest",
  dine: "southwest",
  chichimeca: "southwest",
  chumash: "california",
  salish: "northwest",
  tlingit: "northwest",
  mexica: "mesoamerica",
  purepecha: "mesoamerica",
  zapotec: "mesoamerica",
  maya: "mesoamerica",
  itza: "mesoamerica",
  kiche: "mesoamerica",
  miskito: "caribbean",
  kalinago: "caribbean",
};

const EUROPEAN = new Set([
  "english",
  "french",
  "spanish",
  "dutch",
  "swedish",
  "portuguese",
]);

/** Whether a culture is one of the native peoples'. */
export function isNativeCulture(culture: string): boolean {
  return !EUROPEAN.has(culture);
}

export function regionOf(culture: string): Region {
  return REGION_OF[culture] ?? "woodlands";
}

// ---------------------------------------------------------------- the wardrobe

/** Something to wear or a way to be: a hair style, hat, coat or mark. */
export interface Item {
  key: string;
  /** Its name in the register. */
  name: string;
  /** Who wears it: men, women or anyone. */
  sex: "m" | "f" | "a";
  /** Colonists, native peoples, or anyone. */
  people: "c" | "n" | "a";
  /** The first year it fits (nobody wears it before). */
  from: number;
  /** The last year it's in fashion (people keep wearing it after). */
  to: number;
  /** Stations it's given to (any, if absent). */
  st?: readonly Station[];
  /** Cultures or native regions it's given to (any, if absent). */
  where?: readonly string[];
  /** How often it's given, against others that fit. */
  w?: number;
}

const ANY = { from: 1500, to: 1800 } as const;
const GOOD: Station[] = ["gentry", "merchant", "learned", "officer"];

// prettier-ignore
export const HAIR: Item[] = [
  // Men, colonists.
  { key: "cropped", name: "Cropped short", sex: "m", people: "c", ...ANY, st: ["labourer", "soldier", "sailor", "tradesman", "frontier"] },
  { key: "collar", name: "Collar length", sex: "m", people: "c", from: 1500, to: 1690, w: 3 },
  { key: "roundhead", name: "Round-cut", sex: "m", people: "c", from: 1500, to: 1700, st: ["labourer", "tradesman", "learned", "clergy", "soldier"] },
  { key: "cavalier", name: "Long locks", sex: "m", people: "c", from: 1620, to: 1690, st: ["gentry", "officer", "merchant"], w: 2 },
  { key: "queue", name: "Long, tied back", sex: "m", people: "c", from: 1690, to: 1800, w: 2 },
  { key: "natural", name: "Short and natural", sex: "m", people: "c", from: 1690, to: 1800, st: ["labourer", "tradesman", "frontier", "sailor", "clergy", "learned"] },
  { key: "full_wig", name: "Full-bottomed wig", sex: "m", people: "c", from: 1665, to: 1725, st: GOOD, w: 3 },
  { key: "powder_wig", name: "Powdered full wig", sex: "m", people: "c", from: 1700, to: 1745, st: ["gentry", "learned", "officer"], w: 2 },
  { key: "tie_wig", name: "Powdered tie-wig", sex: "m", people: "c", from: 1715, to: 1800, st: ["gentry", "officer", "merchant", "learned"], w: 3 },
  { key: "bob_wig", name: "Bob wig", sex: "m", people: "c", from: 1715, to: 1800, st: ["tradesman", "merchant", "learned", "clergy"], w: 2 },
  { key: "balding", name: "Balding", sex: "m", people: "a", ...ANY, w: 0 },
  { key: "tonsure", name: "Tonsure", sex: "m", people: "c", ...ANY, st: ["clergy"], where: ["spanish", "french", "portuguese"], w: 0 },
  // Women, colonists.
  { key: "parted", name: "Parted and drawn back", sex: "f", people: "c", ...ANY, w: 3 },
  { key: "fringe", name: "Curled fringe", sex: "f", people: "c", from: 1615, to: 1665, st: ["gentry", "merchant", "tradesman"] },
  { key: "ringlets", name: "Side ringlets", sex: "f", people: "c", from: 1630, to: 1700, st: ["gentry", "merchant"], w: 3 },
  { key: "piled", name: "Curls piled high", sex: "f", people: "c", from: 1680, to: 1720, st: ["gentry", "merchant"], w: 2 },
  { key: "dressed", name: "Smooth and dressed up", sex: "f", people: "c", from: 1710, to: 1800, w: 2 },
  { key: "powdered", name: "Powdered and dressed high", sex: "f", people: "c", from: 1750, to: 1800, st: ["gentry"], w: 2 },
  { key: "braided", name: "Braids round the head", sex: "f", people: "c", ...ANY, where: ["dutch", "swedish", "english", "french"] },
  { key: "loose", name: "Long and loose", sex: "a", people: "c", ...ANY, w: 0 },
  // Native men.
  { key: "n_long", name: "Long and loose", sex: "m", people: "n", ...ANY, w: 2 },
  { key: "n_braids", name: "Two braids", sex: "a", people: "n", ...ANY, where: ["plains", "woodlands", "southeast", "subarctic", "southwest", "northwest"], w: 2 },
  { key: "n_roach", name: "Scalplock and crest", sex: "m", people: "n", ...ANY, where: ["haudenosaunee", "wendat", "attawandaron", "erie", "susquehannock", "illinois", "osage", "pawnee", "cherokee", "muscogee", "chickasaw", "natchez", "lenape"], w: 3 },
  { key: "n_half", name: "One side shaved, knotted", sex: "m", people: "n", ...ANY, where: ["powhatan"], w: 4 },
  { key: "n_knot", name: "Knotted at the back", sex: "a", people: "n", ...ANY, where: ["southwest", "california"], w: 3 },
  { key: "n_topknot", name: "Tied up on top", sex: "m", people: "n", ...ANY, where: ["timucua", "calusa", "california", "northwest", "caribbean"], w: 3 },
  { key: "n_forelock", name: "Long with a forelock", sex: "m", people: "n", ...ANY, where: ["blackfoot", "oceti", "shoshone"], w: 2 },
  { key: "n_short", name: "Cut short", sex: "m", people: "n", ...ANY, where: ["mesoamerica", "caribbean"], w: 2 },
  // Native women.
  { key: "n_parted", name: "Long, centre-parted", sex: "f", people: "n", ...ANY, w: 2 },
  { key: "n_tail", name: "Clubbed and wrapped", sex: "f", people: "n", ...ANY, where: ["woodlands", "southeast", "subarctic"], w: 3 },
  { key: "n_whorls", name: "Whorls at the sides", sex: "f", people: "n", ...ANY, where: ["pueblo"], w: 1 },
  { key: "n_bangs", name: "Long with a fringe", sex: "f", people: "n", ...ANY, where: ["southwest", "california", "caribbean"], w: 2 },
  { key: "n_ribbons", name: "Braids wound with cloth", sex: "f", people: "n", ...ANY, where: ["mesoamerica"], w: 4 },
];

// prettier-ignore
export const BEARDS: Item[] = [
  { key: "none", name: "Clean-shaven", sex: "a", people: "a", ...ANY, w: 6 },
  { key: "stubble", name: "Unshaven", sex: "m", people: "a", ...ANY, st: ["labourer", "sailor", "frontier", "soldier"] },
  { key: "moustache", name: "Moustache", sex: "m", people: "c", from: 1500, to: 1700, w: 2 },
  { key: "vandyke", name: "Moustache and tuft", sex: "m", people: "c", from: 1610, to: 1690, w: 3 },
  { key: "spade", name: "Spade beard", sex: "m", people: "c", from: 1500, to: 1645, w: 3 },
  { key: "pointed", name: "Pointed beard", sex: "m", people: "c", from: 1500, to: 1670, w: 2 },
  { key: "full", name: "Full beard", sex: "m", people: "c", ...ANY, st: ["sailor", "frontier", "labourer", "clergy"] },
];

// prettier-ignore
export const HEADWEAR: Item[] = [
  { key: "none", name: "Bareheaded", sex: "a", people: "a", ...ANY, w: 6 },
  // Men, colonists.
  { key: "capotain", name: "Tall capotain", sex: "m", people: "c", from: 1590, to: 1665, st: ["tradesman", "merchant", "learned", "clergy", "labourer"], w: 3 },
  { key: "plumed", name: "Broad hat with a plume", sex: "m", people: "c", from: 1620, to: 1690, st: ["gentry", "officer"], w: 2 },
  { key: "broad", name: "Broad-brimmed hat", sex: "a", people: "c", ...ANY, st: ["labourer", "tradesman", "clergy", "frontier"], w: 2 },
  { key: "tricorne", name: "Cocked hat", sex: "m", people: "c", from: 1690, to: 1800, w: 3 },
  { key: "laced", name: "Gold-laced cocked hat", sex: "m", people: "c", from: 1700, to: 1800, st: ["officer", "gentry"], w: 2 },
  { key: "monmouth", name: "Knitted cap", sex: "m", people: "c", ...ANY, st: ["sailor", "labourer"], w: 3 },
  { key: "tuque", name: "Red woollen tuque", sex: "m", people: "c", from: 1640, to: 1800, st: ["frontier", "sailor", "labourer"], where: ["french"], w: 3 },
  { key: "fur_cap", name: "Fur cap", sex: "m", people: "c", ...ANY, st: ["frontier"], w: 2 },
  { key: "morion", name: "Morion helmet", sex: "m", people: "c", from: 1550, to: 1660, st: ["soldier"], w: 3 },
  { key: "pot", name: "Lobster-tail helmet", sex: "m", people: "c", from: 1625, to: 1690, st: ["soldier", "officer"], w: 2 },
  { key: "mitre", name: "Grenadier's cap", sex: "m", people: "c", from: 1700, to: 1800, st: ["soldier"], where: ["english", "dutch", "swedish"], w: 1 },
  { key: "skullcap", name: "Skullcap", sex: "m", people: "c", ...ANY, st: ["clergy", "learned"], w: 1 },
  { key: "biretta", name: "Biretta", sex: "m", people: "c", ...ANY, st: ["clergy"], where: ["spanish", "french", "portuguese"], w: 2 },
  { key: "at_home", name: "Soft cap, at home", sex: "m", people: "c", from: 1680, to: 1800, st: ["learned", "gentry", "merchant"], w: 1 },
  // Women, colonists.
  { key: "coif", name: "Linen coif", sex: "f", people: "c", ...ANY, w: 4 },
  { key: "lace_cap", name: "Lace-edged cap", sex: "f", people: "c", from: 1670, to: 1800, w: 3 },
  { key: "mob_cap", name: "Mob cap", sex: "f", people: "c", from: 1730, to: 1800, w: 3 },
  { key: "hood", name: "Black hood", sex: "f", people: "c", ...ANY, st: ["merchant", "tradesman", "learned", "gentry"], w: 2 },
  { key: "steeple", name: "High hat over a coif", sex: "f", people: "c", from: 1600, to: 1665, st: ["tradesman", "labourer", "merchant"], w: 2 },
  { key: "fontange", name: "Fontange", sex: "f", people: "c", from: 1685, to: 1715, st: ["gentry", "merchant"], w: 2 },
  { key: "straw", name: "Straw hat", sex: "f", people: "c", from: 1730, to: 1800, w: 2 },
  { key: "mantilla", name: "Lace mantilla", sex: "f", people: "c", ...ANY, where: ["spanish", "portuguese"], w: 3 },
  { key: "headscarf", name: "Kerchief over the hair", sex: "f", people: "c", ...ANY, st: ["labourer", "tradesman"], w: 2 },
  { key: "veil", name: "Veil and wimple", sex: "f", people: "c", ...ANY, st: ["clergy"], where: ["spanish", "french", "portuguese"], w: 0 },
  // Native peoples.
  { key: "n_feather", name: "A feather", sex: "a", people: "n", ...ANY, w: 3 },
  { key: "n_feathers", name: "Hanging feathers", sex: "m", people: "n", ...ANY, w: 2 },
  { key: "n_headband", name: "Headband", sex: "a", people: "n", ...ANY, w: 2 },
  { key: "n_gustoweh", name: "Feathered cap", sex: "m", people: "n", ...ANY, where: ["haudenosaunee", "wendat", "attawandaron", "erie", "susquehannock"], w: 4 },
  { key: "n_roach", name: "Roach headdress", sex: "m", people: "n", ...ANY, where: ["woodlands", "plains", "southeast"], w: 2 },
  { key: "n_fur_turban", name: "Fur turban", sex: "m", people: "n", ...ANY, where: ["anishinaabe", "illinois", "osage", "pawnee", "cree", "wabanaki", "mikmaq"], w: 2 },
  { key: "n_turban", name: "Cloth turban", sex: "m", people: "n", from: 1690, to: 1800, where: ["southeast", "woodlands"], w: 3 },
  { key: "n_spruce", name: "Woven spruce-root hat", sex: "a", people: "n", ...ANY, where: ["northwest"], w: 4 },
  { key: "n_palm", name: "Palm-leaf hat", sex: "m", people: "n", from: 1560, to: 1800, where: ["mesoamerica", "caribbean"], w: 2 },
  { key: "n_cloth", name: "Folded head cloth", sex: "a", people: "n", ...ANY, where: ["mesoamerica"], w: 2 },
  { key: "n_peaked", name: "Peaked cloth cap", sex: "f", people: "n", from: 1680, to: 1800, where: ["mikmaq", "wabanaki", "innu", "cree"], w: 3 },
];

// prettier-ignore
export const CLOTHES: Item[] = [
  // Men, colonists.
  { key: "jerkin", name: "Shirt and leather jerkin", sex: "m", people: "c", from: 1500, to: 1700, st: ["labourer", "tradesman", "frontier"], w: 3 },
  { key: "waistcoat", name: "Shirt, waistcoat and neckcloth", sex: "m", people: "c", from: 1670, to: 1800, st: ["labourer", "tradesman", "frontier", "sailor"], w: 3 },
  { key: "doublet_ruff", name: "Doublet and ruff", sex: "m", people: "c", from: 1560, to: 1640, st: ["gentry", "merchant", "learned", "officer"], w: 3 },
  { key: "doublet_band", name: "Doublet and falling band", sex: "m", people: "c", from: 1610, to: 1675, st: ["tradesman", "merchant", "gentry", "learned"], w: 3 },
  { key: "doublet_lace", name: "Doublet, lace collar and sash", sex: "m", people: "c", from: 1625, to: 1675, st: ["gentry", "officer"], w: 3 },
  { key: "golilla", name: "Black suit and golilla", sex: "m", people: "c", from: 1623, to: 1700, st: ["gentry", "merchant", "learned"], where: ["spanish", "portuguese"], w: 5 },
  { key: "plain_coat", name: "Plain coat and neckcloth", sex: "m", people: "c", from: 1670, to: 1800, st: ["tradesman", "merchant", "learned"], w: 3 },
  { key: "justaucorps", name: "Justaucorps and lace cravat", sex: "m", people: "c", from: 1670, to: 1730, st: ["gentry", "merchant", "officer"], w: 3 },
  { key: "coat_stock", name: "Coat, waistcoat and stock", sex: "m", people: "c", from: 1720, to: 1800, st: ["gentry", "merchant", "learned"], w: 3 },
  { key: "black_suit", name: "Black suit and bands", sex: "m", people: "c", ...ANY, st: ["learned", "clergy"], w: 2 },
  { key: "gown_bands", name: "Minister's gown and bands", sex: "m", people: "c", ...ANY, st: ["clergy"], where: ["english", "dutch", "swedish"], w: 4 },
  { key: "cassock", name: "Cassock and rabat", sex: "m", people: "c", ...ANY, st: ["clergy"], where: ["french", "spanish", "portuguese"], w: 4 },
  { key: "friar", name: "Friar's habit", sex: "m", people: "c", ...ANY, st: ["clergy"], where: ["spanish", "french", "portuguese"], w: 2 },
  { key: "breastplate", name: "Breastplate and gorget", sex: "m", people: "c", from: 1500, to: 1680, st: ["soldier", "officer"], w: 3 },
  { key: "buff_coat", name: "Buff coat and sash", sex: "m", people: "c", from: 1615, to: 1695, st: ["soldier", "officer"], w: 3 },
  { key: "regimental", name: "Regimental coat", sex: "m", people: "c", from: 1680, to: 1800, st: ["soldier", "officer"], w: 5 },
  { key: "sailor", name: "Sailor's jacket and neckerchief", sex: "m", people: "c", ...ANY, st: ["sailor"], w: 5 },
  { key: "hunting_shirt", name: "Fringed hunting shirt", sex: "m", people: "c", from: 1740, to: 1800, st: ["frontier"], w: 4 },
  { key: "capote", name: "Blanket capote and sash", sex: "m", people: "c", from: 1640, to: 1800, st: ["frontier", "labourer"], where: ["french"], w: 4 },
  { key: "buckskin", name: "Buckskin jacket", sex: "m", people: "c", ...ANY, st: ["frontier"], w: 3 },
  // Women, colonists.
  { key: "bodice", name: "Bodice and kerchief", sex: "f", people: "c", ...ANY, st: ["labourer", "tradesman", "frontier", "sailor"], w: 3 },
  { key: "short_gown", name: "Short gown and kerchief", sex: "f", people: "c", from: 1700, to: 1800, st: ["labourer", "tradesman", "frontier"], w: 3 },
  { key: "bodice_ruff", name: "Stomacher and ruff", sex: "f", people: "c", from: 1560, to: 1640, st: ["gentry", "merchant", "learned"], w: 3 },
  { key: "gown_collar", name: "Dark gown and broad collar", sex: "f", people: "c", from: 1615, to: 1690, st: ["tradesman", "merchant", "learned", "clergy"], w: 3 },
  { key: "satin", name: "Satin gown with lace and pearls", sex: "f", people: "c", from: 1630, to: 1690, st: ["gentry"], w: 3 },
  { key: "mantua", name: "Mantua and stomacher", sex: "f", people: "c", from: 1680, to: 1740, st: ["gentry", "merchant"], w: 3 },
  { key: "robe", name: "Robe à la française", sex: "f", people: "c", from: 1720, to: 1800, st: ["gentry", "merchant"], w: 3 },
  { key: "plain_gown", name: "Plain gown and neckerchief", sex: "f", people: "c", ...ANY, st: ["tradesman", "merchant", "learned", "clergy"], w: 2 },
  { key: "habit", name: "Nun's habit", sex: "f", people: "c", ...ANY, st: ["clergy"], where: ["french", "spanish", "portuguese"], w: 0 },
  // Native men.
  { key: "n_mantle", name: "Deerskin mantle", sex: "m", people: "n", from: 1500, to: 1720, where: ["woodlands", "southeast", "caribbean", "california"], w: 3 },
  { key: "n_hide_shirt", name: "Fringed hide shirt", sex: "m", people: "n", ...ANY, where: ["plains", "southwest", "subarctic", "woodlands"], w: 3 },
  { key: "n_trade_shirt", name: "Trade shirt and matchcoat", sex: "m", people: "n", from: 1640, to: 1800, where: ["woodlands", "southeast", "subarctic", "plains"], w: 4 },
  { key: "n_matchcoat", name: "Matchcoat over the shoulders", sex: "a", people: "n", from: 1620, to: 1800, where: ["woodlands", "southeast"], w: 2 },
  { key: "n_fur_robe", name: "Fur robe", sex: "a", people: "n", ...ANY, where: ["subarctic", "plains", "woodlands"], w: 2 },
  { key: "n_tilma", name: "Cotton shirt and knotted mantle", sex: "m", people: "n", ...ANY, where: ["mesoamerica"], w: 4 },
  { key: "n_blanket", name: "Woven shirt and blanket", sex: "m", people: "n", ...ANY, where: ["southwest"], w: 3 },
  { key: "n_cedar", name: "Woven cedar-bark cape", sex: "a", people: "n", ...ANY, where: ["northwest"], w: 4 },
  { key: "n_coat", name: "Trade coat", sex: "m", people: "n", from: 1680, to: 1800, st: ["gentry", "officer", "merchant"], where: ["woodlands", "southeast"], w: 2 },
  // Native women.
  { key: "n_wrap", name: "Deerskin wrap and mantle", sex: "f", people: "n", ...ANY, where: ["woodlands", "southeast", "california", "caribbean"], w: 3 },
  { key: "n_hide_dress", name: "Hide dress with a yoke", sex: "f", people: "n", ...ANY, where: ["plains", "southwest", "subarctic", "woodlands"], w: 3 },
  { key: "n_blouse", name: "Trade-cloth blouse and brooches", sex: "f", people: "n", from: 1690, to: 1800, where: ["woodlands", "southeast", "subarctic"], w: 4 },
  { key: "n_huipil", name: "Huipil", sex: "f", people: "n", ...ANY, where: ["mesoamerica"], w: 5 },
  { key: "n_manta", name: "Manta over one shoulder", sex: "f", people: "n", ...ANY, where: ["pueblo", "dine"], w: 4 },
];

// prettier-ignore
export const ACCESSORIES: Item[] = [
  { key: "spectacles", name: "Spectacles", sex: "a", people: "c", from: 1600, to: 1800, st: ["learned", "clergy", "merchant"] },
  { key: "earrings", name: "Earrings", sex: "a", people: "a", ...ANY },
  { key: "pearls", name: "Pearls", sex: "f", people: "c", ...ANY, st: ["gentry", "merchant"] },
  { key: "beads", name: "Bead necklace", sex: "a", people: "a", ...ANY },
  { key: "wampum", name: "Wampum", sex: "a", people: "n", ...ANY, where: ["woodlands"] },
  { key: "gorget", name: "Silver gorget", sex: "m", people: "a", from: 1600, to: 1800, st: ["officer", "gentry"] },
  { key: "shell", name: "Shell gorget", sex: "a", people: "n", ...ANY, where: ["southeast", "plains"] },
  { key: "cross", name: "A cross", sex: "a", people: "a", ...ANY },
  { key: "pipe", name: "Clay pipe", sex: "m", people: "a", ...ANY },
];

// prettier-ignore
export const MARKS: Item[] = [
  { key: "freckles", name: "Freckles", sex: "a", people: "a", ...ANY },
  { key: "ruddy", name: "Ruddy cheeks", sex: "a", people: "a", ...ANY },
  { key: "pox", name: "Pox scars", sex: "a", people: "a", ...ANY },
  { key: "beauty", name: "Beauty mark", sex: "a", people: "a", ...ANY },
  { key: "scar", name: "A scar", sex: "a", people: "a", ...ANY },
  { key: "paint", name: "Red face paint", sex: "a", people: "n", ...ANY },
  { key: "lines_paint", name: "Painted lines", sex: "m", people: "n", ...ANY },
  { key: "tattoo", name: "Tattooed lines", sex: "a", people: "n", ...ANY },
  { key: "red_part", name: "Vermilion parting", sex: "f", people: "n", ...ANY },
];

const KINDS = {
  hair: HAIR,
  beard: BEARDS,
  hat: HEADWEAR,
  clothes: CLOTHES,
} as const;

export type ItemKind = keyof typeof KINDS;

const INDEX = new Map<string, Map<string, Item>>();
for (const [kind, list] of Object.entries({
  ...KINDS,
  extras: ACCESSORIES,
  marks: MARKS,
}))
  INDEX.set(kind, new Map(list.map((i) => [i.key, i])));

export function itemOf(
  kind: ItemKind | "extras" | "marks",
  key: string,
): Item | undefined {
  return INDEX.get(kind)?.get(key);
}

/**
 * The choices that suit someone, for the register: their sex and people,
 * and nothing not yet worn in their year. "none" first where it's allowed.
 */
export function choicesFor(
  kind: ItemKind | "extras" | "marks",
  o: { female: boolean; native: boolean; year: number },
): Item[] {
  const list =
    kind === "extras" ? ACCESSORIES : kind === "marks" ? MARKS : KINDS[kind];
  return list.filter((i) => fits(i, o.female, o.native, o.year));
}

function fits(
  i: Item,
  female: boolean,
  native: boolean,
  year: number,
): boolean {
  if (i.sex !== "a" && (i.sex === "f") !== female) return false;
  if (i.people !== "a" && (i.people === "n") !== native) return false;
  return i.from <= year;
}

// ---------------------------------------------------------------- randomness

/** A stream of numbers from a seed, the same each time. */
class Stream {
  private s: number;
  constructor(...seed: number[]) {
    let h = 0x811c9dc5;
    for (const n of seed) {
      h ^= n | 0;
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 13;
    }
    this.s = h | 0;
  }
  next(): number {
    const [v, s] = nextRandom(this.s);
    this.s = s;
    return v;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** An index, by weights. */
  weighted(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

// ---------------------------------------------------------------- who wears what

export interface LookSeed {
  /** Character id (or any number that stands for the person). */
  id: number;
  culture: string;
  female: boolean;
  age: number;
  station: Station;
  /** The year they're seen in. */
  year: number;
  religion?: string;
}

/** Fashions run in four periods; within one, a person keeps their clothes. */
export function eraOf(year: number): number {
  return year < 1632 ? 0 : year < 1678 ? 1 : year < 1722 ? 2 : 3;
}

/** The station a character's clothes show: their post, their title, or a guess. */
export function stationOf(c: Character): Station {
  const role = (c.role ?? "") as string;
  const byRole: Record<string, Station> = {
    innkeeper: "tradesman",
    preacher: "clergy",
    merchant: "merchant",
    captain: "merchant",
    sergeant: "soldier",
    master: "tradesman",
    printer: "tradesman",
    planter: "gentry",
    physician: "learned",
    official: "gentry",
    lawyer: "learned",
    sachem: "gentry",
    healer: "clergy",
    hunter: "frontier",
    elder: "gentry",
    trader: "merchant",
    maker: "tradesman",
    warleader: "officer",
  };
  if (byRole[role]) return byRole[role];
  for (const s of STATIONS) if (role.includes(s)) return s;
  if (/soldier|militia|guard|warrior/.test(role)) return "soldier";
  if (/sail|fisher|boat|dock/.test(role)) return "sailor";
  if (/farm|hand|servant|labour|drink|tenant|slave/.test(role))
    return "labourer";
  if (/smith|cooper|wright|weaver|baker|keeper|maker|clerk/.test(role))
    return "tradesman";
  if (/priest|minister|monk|friar|nun|shaman/.test(role)) return "clergy";
  if (c.title) return "gentry";
  // The people at court and in governors' houses, mostly.
  const r = new Stream(c.id, 77).next();
  return r < 0.5 ? "gentry" : r < 0.75 ? "merchant" : "learned";
}

/** What a station is called among the native peoples, for the register. */
export function stationName(st: Station, native: boolean): string {
  if (native)
    return {
      labourer: "Grower",
      tradesman: "Maker",
      merchant: "Trader",
      gentry: "Leader",
      clergy: "Healer",
      soldier: "Warrior",
      officer: "War leader",
      sailor: "Fisher",
      learned: "Speaker",
      frontier: "Hunter",
    }[st];
  return {
    labourer: "Labourer",
    tradesman: "Tradesman",
    merchant: "Merchant",
    gentry: "Gentry",
    clergy: "Clergy",
    soldier: "Soldier",
    officer: "Officer",
    sailor: "Sailor",
    learned: "Learned",
    frontier: "Frontier",
  }[st];
}

/** A background's station, for a new character's first look. */
export function stationOfBackground(bg: string): Station {
  return (
    (
      {
        farmer: "labourer",
        millhand: "labourer",
        newsman: "tradesman",
        soldier: "soldier",
        sailor: "sailor",
        clerk: "learned",
        craftsman: "tradesman",
        trapper: "frontier",
        servant: "labourer",
        preacher: "clergy",
        physician: "learned",
        lawyer: "learned",
        gentry: "gentry",
        hunter: "frontier",
        warrior: "soldier",
        grower: "labourer",
        healer: "clergy",
        trader: "merchant",
        speaker: "gentry",
        maker: "tradesman",
      } as Record<string, Station>
    )[bg] ?? "tradesman"
  );
}

/** How much an item suits someone (0: not at all). */
function suit(i: Item, o: LookSeed, native: boolean, region: Region): number {
  if (!fits(i, o.female, native, o.year)) return 0;
  let w = i.w ?? 1;
  if (w <= 0) return 0;
  // Out of fashion: the old still wear it now and then.
  if (o.year > i.to) w *= o.age >= 50 && o.year - i.to < 30 ? 0.35 : 0;
  if (i.st) {
    if (!i.st.includes(o.station)) {
      // Natives' dress isn't so strictly by station.
      if (native && i.people === "n") w *= 0.25;
      else return 0;
    } else w *= 2;
  }
  if (i.where) {
    if (i.where.includes(o.culture) || i.where.includes(region)) w *= 2;
    else return 0;
  }
  return w;
}

function pickItem(
  list: readonly Item[],
  o: LookSeed,
  native: boolean,
  region: Region,
  r: Stream,
  fallback: string,
): string {
  const weights = list.map((i) => suit(i, o, native, region));
  if (weights.every((w) => w <= 0)) return fallback;
  return list[r.weighted(weights)].key;
}

/** Weighted pick of a feature index. */
function feature(r: Stream, weights: readonly number[]): number {
  return r.weighted(weights);
}

/** Skin, eye and hair colouring by people. */
function colouring(
  culture: string,
  native: boolean,
  region: Region,
  r: Stream,
): { skin: number; eyeColor: number; hairColor: number } {
  if (native) {
    const skin =
      region === "subarctic" || region === "northwest"
        ? feature(r, [0, 0, 0, 0, 1, 3, 4, 3, 1, 0])
        : region === "mesoamerica" || region === "caribbean"
          ? feature(r, [0, 0, 0, 0, 0, 2, 3, 4, 3, 1])
          : feature(r, [0, 0, 0, 0, 1, 3, 4, 4, 2, 0]);
    return {
      skin,
      eyeColor: feature(r, [6, 3, 0.3, 0, 0, 0, 0]),
      hairColor: feature(r, [8, 3, 0.4, 0, 0, 0, 0, 0, 0]),
    };
  }
  const south = culture === "spanish" || culture === "portuguese";
  const north = culture === "swedish" || culture === "dutch";
  const skin = south
    ? feature(r, [0, 1, 3, 4, 4, 2, 1, 0.5, 0.3, 0.2])
    : north
      ? feature(r, [3, 5, 3, 1, 0.3, 0, 0, 0, 0, 0])
      : culture === "french"
        ? feature(r, [2, 4, 4, 2, 1, 0.3, 0, 0, 0, 0])
        : feature(r, [2.5, 5, 3.5, 1.5, 0.5, 0.2, 0, 0, 0, 0]);
  const eyeColor = south
    ? feature(r, [4, 4, 2, 1, 0.5, 0.5, 0.2])
    : north
      ? feature(r, [0.5, 1, 1, 1.5, 2, 3, 2.5])
      : feature(r, [1, 2, 2, 1.5, 1.5, 2.5, 1.2]);
  const hairColor = south
    ? feature(r, [4, 4, 2, 1, 0.3, 0.1, 0.4, 0.1, 0])
    : north
      ? feature(r, [0.3, 1, 1.5, 1, 0.5, 0.5, 2, 2.5, 2])
      : feature(r, [1, 2.5, 3, 2, 1, 0.7, 1.5, 1, 0.5]);
  return { skin, eyeColor, hairColor };
}

/** Uniforms and sashes by nation. */
const UNIFORM: Record<string, [number, number, number]> = {
  english: [C.scarlet, C.indigo, C.buff],
  french: [C.linen, C.indigo, C.scarlet],
  spanish: [C.linen, C.madder, C.indigo],
  dutch: [C.indigo, C.grey, C.orange],
  swedish: [C.indigo, C.ochre, C.ochre],
  portuguese: [C.indigo, C.scarlet, C.linen],
};
const SASH: Record<string, number> = {
  english: C.scarlet,
  french: C.white,
  spanish: C.madder,
  dutch: C.orange,
  swedish: C.sky,
  portuguese: C.indigo,
};

/** Colours a garment is likely to come in. */
function clothColors(
  clothes: string,
  o: LookSeed,
  r: Stream,
): [number, number, number] {
  const p = (list: readonly number[]) => r.pick(list);
  const plain = [C.umber, C.russet, C.olive, C.charcoal, C.slate, C.buff];
  const sober = [C.black, C.charcoal, C.umber, C.slate];
  const rich = [
    C.claret,
    C.indigo,
    C.green,
    C.plum,
    C.scarlet,
    C.ochre,
    C.sky,
    C.russet,
    C.rose,
  ];
  const trade = [C.indigo, C.scarlet, C.green, C.madder, C.black];
  const shirts = [C.white, C.linen, C.sky, C.rose, C.ochre];
  switch (clothes) {
    case "regimental":
      return UNIFORM[o.culture] ?? UNIFORM.english;
    case "buff_coat":
    case "breastplate":
      return [C.buff, p(plain), SASH[o.culture] ?? C.scarlet];
    case "doublet_lace":
      return [p([C.black, ...rich]), p(rich), SASH[o.culture] ?? C.scarlet];
    case "jerkin":
    case "waistcoat":
      return [p(plain), p(plain), p([C.linen, C.white])];
    case "sailor":
      return [
        p([C.indigo, C.slate, C.charcoal]),
        p([C.linen, C.white]),
        p([C.scarlet, C.indigo, C.ochre]),
      ];
    case "hunting_shirt":
      return [p([C.linen, C.buff, C.olive]), p(plain), p([C.buff])];
    case "capote":
      return [
        p([C.white, C.linen, C.indigo]),
        p(plain),
        p([C.scarlet, C.ochre, C.green]),
      ];
    case "buckskin":
      return [p([C.deer, C.smoked, C.palehide]), p(plain), C.buff];
    case "gown_bands":
    case "black_suit":
    case "cassock":
    case "golilla":
      return [C.black, C.black, C.white];
    case "friar":
      return [p([C.umber, C.grey]), C.umber, C.linen];
    case "habit":
      return [C.black, C.white, C.white];
    case "gown_collar":
      return [p([C.black, C.black, C.charcoal, C.umber]), p(sober), C.white];
    case "bodice":
    case "short_gown":
      return [
        p([...plain, C.madder, C.sky, C.rose]),
        p([...plain, C.indigo]),
        p([C.linen, C.white]),
      ];
    case "plain_gown":
      return [p([...sober, C.slate, C.green, C.russet]), p(sober), C.white];
    case "bodice_ruff":
    case "satin":
    case "mantua":
    case "robe":
    case "doublet_ruff":
    case "justaucorps":
    case "coat_stock":
      return [
        p(
          o.station === "gentry"
            ? [C.black, ...rich]
            : [C.black, ...sober, ...rich],
        ),
        p(rich),
        p([C.ochre, C.white, C.linen]),
      ];
    case "doublet_band":
    case "plain_coat":
      return [
        p(o.religion === "puritan" ? sober : [...sober, ...plain]),
        p(plain),
        C.white,
      ];
    // Native dress: hide, trade cloth, and the colours of beads and quills.
    case "n_mantle":
    case "n_wrap":
    case "n_hide_shirt":
    case "n_hide_dress":
      return [
        p([C.deer, C.smoked, C.palehide]),
        p([C.deer, C.smoked]),
        p([C.scarlet, C.indigo, C.white, C.ochre, C.turquoise]),
      ];
    case "n_fur_robe":
      return [
        p([C.smoked, C.umber, C.deer]),
        p([C.deer]),
        p([C.scarlet, C.white, C.ochre]),
      ];
    case "n_trade_shirt":
    case "n_blouse":
      return [p(shirts), p(trade), p([C.scarlet, C.white, C.ochre, C.indigo])];
    case "n_matchcoat":
      return [
        p(trade),
        p([C.deer, C.smoked]),
        p([C.scarlet, C.white, C.ochre]),
      ];
    case "n_coat":
      return [
        p([C.scarlet, C.indigo, C.green]),
        p(shirts),
        p([C.ochre, C.white]),
      ];
    case "n_tilma":
      return [
        C.white,
        p([C.linen, C.ochre, C.russet, C.indigo]),
        p([C.scarlet, C.indigo, C.green]),
      ];
    case "n_huipil":
      return [
        p([C.white, C.linen]),
        p([C.indigo, C.madder, C.charcoal]),
        p([C.scarlet, C.ochre, C.green, C.plum]),
      ];
    case "n_manta":
      return [C.black, p([C.scarlet, C.green]), p([C.scarlet, C.indigo])];
    case "n_blanket":
      return [
        p([C.white, C.linen, C.charcoal]),
        p([C.scarlet, C.indigo, C.black]),
        p([C.scarlet, C.white]),
      ];
    case "n_cedar":
      return [
        p([C.deer, C.palehide, C.umber]),
        p([C.black, C.umber]),
        p([C.scarlet, C.turquoise, C.black]),
      ];
    default:
      return [p([...plain, ...sober]), p(plain), C.linen];
  }
}

/**
 * A look for someone no player has drawn: stable for the person, fitting
 * their people, sex, age, station and the year. Their features never
 * change; their clothes and hair follow fashion as the years go by.
 */
export function generateLook(o: LookSeed): Appearance {
  const native = isNativeCulture(o.culture);
  const region = regionOf(o.culture);
  const g = new Stream(o.id, 0x51ed);
  const { skin, eyeColor, hairColor } = colouring(o.culture, native, region, g);
  const look: Appearance = {
    skin,
    face: feature(g, [4, 2, 2, 2, 1.5, native ? 2.5 : 1]),
    jaw: feature(g, o.female ? [4, 2, 0.5, 2, 0.3] : [2, 3, 2, 1, 1.5]),
    cheeks: feature(g, native ? [1, 2, 4, 1] : [2, 2.5, 2, 1]),
    eyes: feature(g, native ? [3, 1, 2, 3, 1, 1] : [3, 2, 2, 1, 1.5, 1.5]),
    eyeColor,
    eyeSet: feature(g, [1, 4, 1.5]),
    brows: feature(g, o.female ? [3, 3, 2, 0.5, 0.2] : [1, 1.5, 2.5, 2.5, 1.5]),
    nose: feature(
      g,
      native
        ? [3, 3, 0.5, 2, 1.5, 0.5, 1.5]
        : o.female
          ? [4, 1.5, 2, 0.8, 1.5, 2, 0.4]
          : [3, 2.5, 1.2, 1.2, 2, 0.8, 1.2],
    ),
    mouth: feature(g, o.female ? [1, 3, 1, 2, 3] : [3, 2, 2, 1.5, 1]),
    ears: feature(g, [2, 4, 2, 0.6]),
    hair: "",
    hairColor,
    beard: "none",
    hat: "none",
    clothes: "",
    colors: [0, 0, 0],
    extras: [],
    marks: [],
    lines: feature(g, [4, 3, 1.5, 0.6]),
    greying: feature(g, [2, 4, 2.5, 1]),
  };
  // Marks of birth and a hard life (drawn once, from the person).
  const fair = skin <= 2 && !native;
  if (fair && hairColor >= 4 && g.chance(0.45)) look.marks.push("freckles");
  else if (fair && g.chance(0.12)) look.marks.push("freckles");
  if (!native && g.chance(0.1)) look.marks.push("pox");
  if (!native && fair && g.chance(0.25)) look.marks.push("ruddy");
  const scarred =
    (o.station === "soldier" ||
    o.station === "officer" ||
    o.station === "sailor"
      ? 0.25
      : 0.05) > g.next();
  if (scarred && o.age >= 18) look.marks.push("scar");

  // What they wear: chosen for the period of fashion and their station.
  const s = new Stream(o.id, eraOf(o.year), STATIONS.indexOf(o.station), 0x7a3);
  const child = o.age < 14;
  const seed: LookSeed = child ? { ...o, station: kidStation(o.station) } : o;
  look.clothes = pickItem(
    CLOTHES,
    seed,
    native,
    region,
    s,
    native
      ? o.female
        ? "n_wrap"
        : "n_mantle"
      : o.female
        ? "bodice"
        : "jerkin",
  );
  look.colors = clothColors(look.clothes, o, s);
  look.hair = pickItem(
    HAIR,
    seed,
    native,
    region,
    s,
    native
      ? o.female
        ? "n_parted"
        : "n_long"
      : o.female
        ? "parted"
        : "collar",
  );
  if (child && !native)
    look.hair = o.female
      ? s.pick(["parted", "loose", "braided"])
      : s.pick(["collar", o.year >= 1690 ? "natural" : "roundhead", "cropped"]);
  if (child && native && (look.hair === "n_roach" || look.hair === "n_half"))
    look.hair = o.female ? "n_parted" : "n_long";
  look.hat = pickItem(HEADWEAR, seed, native, region, s, "none");
  // Children go bareheaded, or in a plain cap.
  if (child)
    look.hat = native
      ? s.chance(0.25)
        ? "n_feather"
        : "none"
      : o.female
        ? s.pick(["coif", "coif", "none", o.year >= 1680 ? "lace_cap" : "coif"])
        : s.chance(0.2) && o.age >= 8
          ? o.year >= 1690
            ? "tricorne"
            : "broad"
          : "none";
  if (!o.female && !native && !child)
    look.beard = pickItem(BEARDS, seed, native, region, s, "none");
  // Clergy dress as clergy.
  if (o.station === "clergy" && !native && !child) {
    const catholic = o.religion === "catholic";
    if (o.female && catholic && s.chance(0.6)) {
      look.clothes = "habit";
      look.hat = "veil";
      look.colors = [C.black, C.white, C.white];
    } else if (!o.female && catholic && look.hat === "none" && s.chance(0.4))
      look.hat = "biretta";
    if (!o.female && catholic && look.clothes === "friar" && s.chance(0.7)) {
      look.hair = "tonsure";
      look.hat = "none";
    }
  }
  // The years: balding men, and spectacles.
  const r = new Stream(o.id, 0xa9e);
  const baldAt = 30 + r.next() * 60;
  if (!o.female && !native && o.age >= baldAt && !isWig(look.hair))
    look.hair = "balding";
  if (
    !native &&
    o.age >= 45 &&
    r.chance(0.3) &&
    (o.station === "learned" ||
      o.station === "clergy" ||
      o.station === "merchant")
  )
    look.extras.push("spectacles");
  // Ornaments.
  const a = new Stream(o.id, eraOf(o.year), 0x0a7);
  if (native) {
    if (a.chance(o.female ? 0.6 : 0.45)) look.extras.push("earrings");
    if (region === "woodlands" && a.chance(0.35)) look.extras.push("wampum");
    else if (a.chance(0.45)) look.extras.push("beads");
    if (
      !o.female &&
      o.year >= 1690 &&
      (region === "woodlands" || region === "southeast") &&
      a.chance(o.station === "gentry" || o.station === "officer" ? 0.6 : 0.15)
    )
      look.extras.push("gorget");
    else if ((region === "southeast" || region === "plains") && a.chance(0.2))
      look.extras.push("shell");
    if (
      !o.female &&
      a.chance(o.station === "soldier" || o.station === "officer" ? 0.4 : 0.08)
    )
      look.marks.push(a.chance(0.65) ? "paint" : "lines_paint");
    if (
      a.chance(
        [
          "timucua",
          "calusa",
          "wendat",
          "haudenosaunee",
          "osage",
          "natchez",
          "caddo",
        ].includes(o.culture)
          ? 0.3
          : 0.02,
      )
    )
      look.marks.push("tattoo");
    if (o.female && a.chance(0.4)) look.marks.push("red_part");
    if (o.religion && o.religion !== "native" && a.chance(0.5))
      look.extras.push("cross");
  } else {
    if (
      o.female &&
      (o.station === "gentry" || o.station === "merchant") &&
      a.chance(0.55)
    )
      look.extras.push("pearls");
    else if (o.female && a.chance(0.2)) look.extras.push("beads");
    if (o.female && a.chance(0.3)) look.extras.push("earrings");
    if (!o.female && o.station === "sailor" && a.chance(0.3))
      look.extras.push("earrings");
    if (!o.female && o.station === "officer" && o.year >= 1650 && a.chance(0.6))
      look.extras.push("gorget");
    if (o.religion === "catholic" && (o.station === "clergy" || a.chance(0.12)))
      look.extras.push("cross");
    if (!o.female && o.age >= 25 && a.chance(0.08)) look.extras.push("pipe");
    if (o.female && o.year >= 1640 && o.station === "gentry" && a.chance(0.15))
      look.marks.push("beauty");
  }
  if (child) {
    look.extras = look.extras.filter(
      (x) => x !== "pipe" && x !== "spectacles" && x !== "gorget",
    );
    look.marks = look.marks.filter(
      (x) => x === "freckles" || x === "ruddy" || x === "red_part",
    );
  }
  return look;
}

function kidStation(st: Station): Station {
  return st === "soldier" ||
    st === "officer" ||
    st === "clergy" ||
    st === "sailor"
    ? "tradesman"
    : st;
}

export function isWig(hair: string): boolean {
  return (
    hair === "full_wig" ||
    hair === "powder_wig" ||
    hair === "tie_wig" ||
    hair === "bob_wig"
  );
}

// ---------------------------------------------------------------- children

/**
 * A child's look: features from one parent or the other (or between the
 * two), colouring that runs in the family, and clothes for the child's own
 * sex and the family's station. `seed` is the child's id.
 */
export function inheritLook(
  mother: Appearance,
  father: Appearance,
  seed: number,
  child: {
    female: boolean;
    culture: string;
    year: number;
    religion?: string;
  } = { female: false, culture: "english", year: 1650 },
): Appearance {
  const r = new Stream(seed, 0x1e9);
  const from = <K extends keyof Appearance>(k: K): Appearance[K] =>
    r.chance(0.5) ? mother[k] : father[k];
  const between = (k: Feature & keyof Appearance): number => {
    const a = mother[k] as number;
    const b = father[k] as number;
    const roll = r.next();
    if (roll < 0.4) return a;
    if (roll < 0.8) return b;
    return Math.round((a + b) / 2);
  };
  // Clothes for the station of the parent they take after, chosen as for anyone.
  const parent = child.female ? mother : father;
  const station = stationOfLook(parent);
  const dressed = generateLook({
    id: seed,
    culture: child.culture,
    female: child.female,
    // Dressed for the years they'll be grown in.
    age: 20,
    station,
    year: Math.min(1776, child.year + 18),
    religion: child.religion,
  });
  return {
    skin: between("skin"),
    face: from("face"),
    jaw: from("jaw"),
    cheeks: from("cheeks"),
    eyes: from("eyes"),
    eyeColor: from("eyeColor"),
    eyeSet: from("eyeSet"),
    brows: from("brows"),
    nose: from("nose"),
    mouth: from("mouth"),
    ears: from("ears"),
    hair: dressed.hair,
    hairColor: r.chance(0.15) ? between("hairColor") : from("hairColor"),
    beard: dressed.beard,
    hat: dressed.hat,
    clothes: dressed.clothes,
    colors: r.chance(0.5) ? [...parent.colors] : dressed.colors,
    extras: dressed.extras.filter((x) => itemOf("extras", x) !== undefined),
    marks: [
      ...(mother.marks.includes("freckles") || father.marks.includes("freckles")
        ? r.chance(0.6)
          ? ["freckles"]
          : []
        : []),
      ...dressed.marks.filter(
        (m) => m !== "freckles" && m !== "scar" && m !== "pox",
      ),
    ],
    lines: from("lines"),
    greying: from("greying"),
  };
}

/** The year a character is `age`, from the day they were born. */
export function yearAtAge(c: Character, age: number): number {
  return dateOf(c.born + Math.round(age * DAYS_PER_YEAR)).year;
}

/**
 * How a character looks at an age: the look a player chose (or their
 * family passed down), or one of their own. Someone with parents in the
 * world has their features from them.
 */
export function lookOf(c: Character, age: number): Appearance {
  if (c.look) return c.look;
  const year = yearAtAge(c, age);
  const seed: LookSeed = {
    id: c.id,
    culture: c.culture,
    female: c.female,
    age,
    station: stationOf(c),
    year,
    religion: c.religion,
  };
  const own = generateLook(seed);
  if (c.mother < 0 && c.father < 0) return own;
  // Take after the parents: features from theirs, clothes their own.
  const parent = (id: number, female: boolean) =>
    id >= 0 ? generateLook({ ...seed, id, female, age: 30 }) : own;
  const kin = inheritLook(
    parent(c.mother, true),
    parent(c.father, false),
    c.id,
    { female: c.female, culture: c.culture, year, religion: c.religion },
  );
  return {
    ...own,
    ...pickGenes(kin),
    marks: own.marks,
  };
}

/** The features someone is born with (not their clothes or marks). */
function pickGenes(l: Appearance): Partial<Appearance> {
  return {
    skin: l.skin,
    face: l.face,
    jaw: l.jaw,
    cheeks: l.cheeks,
    eyes: l.eyes,
    eyeColor: l.eyeColor,
    eyeSet: l.eyeSet,
    brows: l.brows,
    nose: l.nose,
    mouth: l.mouth,
    ears: l.ears,
    hairColor: l.hairColor,
    greying: l.greying,
  };
}

/** The station someone's clothes show. */
export function stationOfLook(look: Appearance): Station {
  const item = itemOf("clothes", look.clothes);
  if (!item?.st?.length) return item?.people === "n" ? "labourer" : "tradesman";
  return item.st[0];
}

// ---------------------------------------------------------------- for the map

/** The colours of a little figure on the map: coat, breeches, hat, skin, hair. */
export function figureColors(look: Appearance): {
  coat: string;
  breeches: string;
  hat: string | null;
  skin: string;
  hair: string;
} {
  const cloth = (i: number) => CLOTH_COLORS[i]?.hex ?? CLOTH_COLORS[0].hex;
  const hat = look.hat;
  const hatColor =
    hat === "none" || hat.startsWith("n_feather")
      ? null
      : hat === "coif" ||
          hat === "lace_cap" ||
          hat === "mob_cap" ||
          hat === "veil" ||
          hat === "headscarf" ||
          hat === "fontange"
        ? "#efe9dc"
        : hat === "tuque"
          ? "#a8302a"
          : hat === "monmouth" ||
              hat === "n_headband" ||
              hat === "n_turban" ||
              hat === "n_cloth" ||
              hat === "n_peaked"
            ? cloth(look.colors[2])
            : hat === "morion" || hat === "pot"
              ? "#8d8f90"
              : hat === "straw" || hat === "n_palm" || hat === "n_spruce"
                ? "#c3a46a"
                : hat === "fur_cap" || hat === "n_fur_turban"
                  ? "#5b4130"
                  : hat === "n_roach" || hat === "n_gustoweh"
                    ? "#8f2b22"
                    : "#1f1a16";
  return {
    coat: cloth(look.colors[0]),
    breeches: cloth(look.colors[1]),
    hat: hatColor,
    skin: SKIN_TONES[look.skin]?.hex ?? SKIN_TONES[2].hex,
    hair:
      isWig(look.hair) && look.hair !== "full_wig"
        ? "#dcd6c9"
        : (HAIR_COLORS[look.hairColor]?.hex ?? HAIR_COLORS[1].hex),
  };
}

// ---------------------------------------------------------------- checking

const NUMBERED: [keyof Appearance, number][] = [
  ["skin", SKIN_TONES.length],
  ["face", FACE_SHAPES.length],
  ["jaw", JAWS.length],
  ["cheeks", CHEEKS.length],
  ["eyes", EYE_SHAPES.length],
  ["eyeColor", EYE_COLORS.length],
  ["eyeSet", EYE_SETS.length],
  ["brows", BROWS.length],
  ["nose", NOSES.length],
  ["mouth", MOUTHS.length],
  ["ears", EARS.length],
  ["hairColor", HAIR_COLORS.length],
  ["lines", 4],
  ["greying", 4],
];

/** Why a look can't be used (from a player, so anything), or null if it's fine. */
export function validateLook(look: unknown): string | null {
  if (!look || typeof look !== "object" || Array.isArray(look))
    return "A likeness is needed.";
  const l = look as Record<string, unknown>;
  for (const [k, n] of NUMBERED) {
    const v = l[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= n)
      return `Likeness: ${k} is out of range.`;
  }
  for (const k of ["hair", "beard", "hat", "clothes"] as const) {
    const v = l[k];
    if (typeof v !== "string" || !itemOf(k, v))
      return `Likeness: no such ${k === "hat" ? "headwear" : k}.`;
  }
  const colors = l.colors;
  if (
    !Array.isArray(colors) ||
    colors.length !== 3 ||
    colors.some(
      (c) =>
        typeof c !== "number" ||
        !Number.isInteger(c) ||
        c < 0 ||
        c >= CLOTH_COLORS.length,
    )
  )
    return "Likeness: three colours for the clothes.";
  for (const [k, kind, max] of [
    ["extras", "extras", ACCESSORIES.length],
    ["marks", "marks", MARKS.length],
  ] as const) {
    const v = l[k];
    if (
      !Array.isArray(v) ||
      v.length > max ||
      new Set(v).size !== v.length ||
      v.some((x) => typeof x !== "string" || !itemOf(kind, x))
    )
      return `Likeness: unknown ${k === "extras" ? "ornaments" : "marks"}.`;
  }
  const known = new Set<string>([
    ...NUMBERED.map(([k]) => k as string),
    "hair",
    "beard",
    "hat",
    "clothes",
    "colors",
    "extras",
    "marks",
  ]);
  if (Object.keys(l).some((k) => !known.has(k)))
    return "Likeness: unknown parts.";
  return null;
}

/** Colours for a garment, chosen as for anyone (the register's dice). */
export function colorsFor(
  clothes: string,
  o: LookSeed,
): [number, number, number] {
  return clothColors(clothes, o, new Stream(o.id, 0xc01));
}

/**
 * A look made to fit someone: whatever they couldn't wear (the other sex's,
 * another people's, or not yet worn in their year) is chosen afresh, and
 * with `restyle` their hair, hat and clothes are chosen afresh anyway. Their
 * features stay.
 */
export function fitLook(
  look: Appearance,
  o: LookSeed,
  restyle = false,
): Appearance {
  const native = isNativeCulture(o.culture);
  const fresh = generateLook(o);
  const ok = (kind: ItemKind | "extras" | "marks", key: string) => {
    const i = itemOf(kind, key);
    return i !== undefined && fits(i, o.female, native, o.year);
  };
  const out = copyLook(look);
  for (const k of ["hair", "beard", "hat", "clothes"] as const)
    if (restyle || !ok(k, out[k])) out[k] = fresh[k];
  if (restyle || out.clothes !== look.clothes) out.colors = fresh.colors;
  out.extras = out.extras.filter((x) => ok("extras", x));
  out.marks = out.marks.filter((x) => ok("marks", x));
  if (o.female || o.age < 14) out.beard = "none";
  return out;
}

/** A copy of a look, so edits don't touch the original. */
export function copyLook(look: Appearance): Appearance {
  return {
    ...look,
    colors: [...look.colors],
    extras: [...look.extras],
    marks: [...look.marks],
  };
}
