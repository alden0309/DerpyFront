// How a character looks: one of the period portraits in the gallery
// (Gallery.ts), the face that comes closest, with the hair and clothes
// tuned a shade or a colour and the hair greying with the years. Players
// pick theirs in the register; everyone else is given a picture that fits
// their sex, years, people and station, the same each time, and a new one
// as they pass from youth to their prime and on to old age. A player's
// children are given a child's picture, and a grown one at sixteen that
// takes after the family's hair.
//
// Everything here is pure: the same person always looks the same, and
// nothing draws on the game's own random numbers.

import { dateOf } from "./Calendar";
import { GALLERY } from "./Gallery";
import { DAYS_PER_YEAR } from "./Rules";
import {
  AGE_BANDS,
  type AgeBand,
  type HairTone,
  type People,
  type Sitter,
  type SitterClass,
} from "./Sitters";
import type { Character } from "./Types";

export type { AgeBand, HairTone, People, Sitter, SitterClass } from "./Sitters";

// ---------------------------------------------------------------- the look

/** A likeness: a picture from the gallery, and how it's tuned. */
export interface Look {
  /** The grown picture (a gallery id); "" until a child of the family is grown. */
  p: string;
  /** The picture as a child, under sixteen (a gallery id). */
  kid?: string;
  /** The hair's colour (HAIR_TONES), or -1 as painted. */
  hair: number;
  /** The hair a shade lighter (+) or darker (-), -2 to 2. */
  hairL: number;
  /** The clothes' colour (CLOTH_COLORS), or -1 as painted. */
  cloth: number;
  /** The clothes a shade lighter (+) or darker (-), -2 to 2. */
  clothL: number;
  /** How the hair greys with the years: 0 not at all, 1 as most do, 2 early. */
  grey: number;
  /** Turned to look the other way. */
  flip: boolean;
}

/** The name the rest of the game knows a look by. */
export type Appearance = Look;

export interface Swatch {
  name: string;
  hex: string;
}

/** Hair colours to tune to (the first nine are the old looks' colours). */
export const HAIR_TONES: Swatch[] = [
  { name: "Black", hex: "#16110e" },
  { name: "Dark brown", hex: "#2e2019" },
  { name: "Brown", hex: "#4b3222" },
  { name: "Chestnut", hex: "#6a3b21" },
  { name: "Auburn", hex: "#7f3a1d" },
  { name: "Red", hex: "#a24b22" },
  { name: "Dark blond", hex: "#866742" },
  { name: "Blond", hex: "#b8935a" },
  { name: "Flaxen", hex: "#d3bc8a" },
  { name: "Grey", hex: "#8f8a83" },
  { name: "White", hex: "#d8d4cc" },
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

/** The tuning swatch nearest a painted hair tone (for heirs taking after it). */
const TONE_SWATCH: Record<HairTone, number> = {
  black: 0,
  dark: 1,
  brown: 2,
  auburn: 4,
  fair: 7,
  grey: 9,
  white: 10,
  hidden: -1,
};

/** The painted tone a tuning swatch reads as. */
const SWATCH_TONE: HairTone[] = [
  "black",
  "dark",
  "brown",
  "auburn",
  "auburn",
  "auburn",
  "fair",
  "fair",
  "fair",
  "grey",
  "white",
];

// ---------------------------------------------------------------- the gallery

/** The gallery's pictures, by id. */
export const SITTERS: ReadonlyMap<string, Sitter> = new Map(
  GALLERY.map((s) => [s.id, s]),
);

export function sitterById(id: string | undefined): Sitter | undefined {
  return id ? SITTERS.get(id) : undefined;
}

/** How old someone of an age looks. */
export function ageBand(age: number): AgeBand {
  return age < 16
    ? "child"
    : age < 25
      ? "youth"
      : age < 40
        ? "prime"
        : age < 55
          ? "middle"
          : "elder";
}

// ---------------------------------------------------------------- peoples

/** Where a native people lives, for which of their pictures suit them. */
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

/** The people a culture's pictures come from. */
export function peopleOfCulture(culture: string): People {
  return EUROPEAN.has(culture) ? (culture as People) : "native";
}

/** Peoples whose painters dressed and painted much alike. */
const KIN: Record<People, People[]> = {
  english: ["dutch", "swedish", "french"],
  dutch: ["english", "swedish", "french"],
  swedish: ["dutch", "english", "french"],
  french: ["english", "spanish", "dutch"],
  spanish: ["portuguese", "french"],
  portuguese: ["spanish", "french"],
  native: [],
  african: [],
  mestizo: ["spanish", "portuguese"],
};

// ---------------------------------------------------------------- stations

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

/** The kind of sitter whose picture suits a station. */
export function classOfStation(st: Station): SitterClass {
  switch (st) {
    case "labourer":
    case "frontier":
      return "labourer";
    case "sailor":
    case "tradesman":
      return "trades";
    default:
      return st;
  }
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
    youngwarrior: "soldier",
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
  const r = hash(c.id, 77) % 100;
  return r < 50 ? "gentry" : r < 75 ? "merchant" : "learned";
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

// ---------------------------------------------------------------- choosing a picture

/** A number from some others, the same each time (FNV-1a, mixed). */
export function hash(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    if (typeof p === "number") {
      h ^= p | 0;
      h = Math.imul(h, 0x01000193);
    } else
      for (let i = 0; i < p.length; i++) {
        h ^= p.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Who a picture is wanted for. */
export interface Wanted {
  /** Stands for the person: different people get different pictures. */
  id: number;
  female: boolean;
  age: number;
  people: People;
  cls: SitterClass;
  /** The year they're seen in. */
  year: number;
  /** For the peoples of the country: where they live. */
  region?: string;
  /** The colour their hair is (or was), to keep from picture to picture. */
  tone?: HairTone;
  /** Prefer a wig, a hat, long hair (for old looks brought over). */
  wig?: boolean;
  hat?: boolean;
}

const BAND_INDEX: Record<AgeBand, number> = {
  child: 0,
  youth: 1,
  prime: 2,
  middle: 3,
  elder: 4,
};

/** Classes that dress alike, a little. */
function classNear(a: SitterClass, b: SitterClass): boolean {
  const groups: SitterClass[][] = [
    ["labourer", "trades"],
    ["trades", "merchant"],
    ["merchant", "learned", "gentry"],
    ["soldier", "officer"],
    ["officer", "gentry"],
    ["clergy", "learned"],
  ];
  return groups.some((g) => g.includes(a) && g.includes(b));
}

/** How well a picture suits someone (-Infinity: not at all). */
export function suitability(s: Sitter, w: Wanted): number {
  if ((s.sex === "f") !== w.female) return -Infinity;
  const band = BAND_INDEX[ageBand(w.age)];
  const sb = BAND_INDEX[s.age];
  let v = 0;
  // Children and the grown stand in for each other only for a people with
  // no pictures of them (the peoples of the country's children, mostly).
  if ((band === 0) !== (sb === 0)) v -= 20;
  else {
    const gap = Math.abs(band - sb);
    v -= gap === 0 ? 0 : gap === 1 ? 3.5 : 9;
  }
  // Their own people above all; peoples with no pictures fall to their kin.
  // An African sitter is shown as one even at the wrong years before anyone
  // else's picture stands in.
  if (s.people === w.people) v += 10;
  else if (w.people === "native" || s.people === "native") return -Infinity;
  else if (KIN[w.people].includes(s.people)) v += 5;
  else if (s.people === "african" || s.people === "mestizo") return -Infinity;
  else if (w.people === "african") v -= 6;
  if (s.cls === w.cls) v += 6;
  else if (classNear(s.cls, w.cls)) v += 2.5;
  // Working folk aren't painted in silk and armour, nor the gentry in rags.
  const humble = w.cls === "labourer" || w.cls === "trades";
  if (humble && (s.dress === "fine" || s.dress === "armour" || s.wig)) v -= 1.5;
  if (!humble && w.cls !== "clergy" && s.cls === "labourer") v -= 1;
  // Clergy and soldiers only when wanted: a habit or a breastplate is a choice.
  if ((s.cls === "clergy") !== (w.cls === "clergy")) v -= 4;
  if (s.dress === "armour" && w.cls !== "soldier" && w.cls !== "officer")
    v -= 3;
  // The fashions of their own years.
  v -= Math.min(4, Math.abs(s.year - w.year) / 30);
  if (w.region && s.region) v += s.region === w.region ? 1.5 : 0;
  if (s.col) v += 0.5;
  if (w.tone && s.hair !== "hidden") {
    const old = sb >= 4 && (s.hair === "grey" || s.hair === "white");
    if (s.hair === w.tone || old) v += 1.5;
  }
  if (w.wig !== undefined && s.wig === w.wig) v += 1.5;
  if (w.hat !== undefined && (s.head !== "bare") === w.hat) v += 1;
  return v;
}

/** How far below the best a picture may fall and still be picked. */
const SPREAD = 3;

const pickCache = new Map<string, string>();

/**
 * A picture for someone: among those that suit them about as well as the
 * best, one chosen by who they are, so neighbours seldom share a face.
 */
export function pickSitter(wanted: Wanted): Sitter {
  // Fashion is judged by the decade (and the picture kept for it).
  const w = { ...wanted, year: Math.floor(wanted.year / 10) * 10 + 5 };
  const band = ageBand(w.age);
  const key = `${w.id}|${w.female ? 1 : 0}|${band}|${w.people}|${w.cls}|${w.year}|${w.region ?? ""}|${w.tone ?? ""}|${w.wig ?? ""}|${w.hat ?? ""}`;
  const hit = pickCache.get(key);
  if (hit) return SITTERS.get(hit)!;
  const scored = GALLERY.map((s) => ({ s, v: suitability(s, w) })).filter(
    (x) => x.v > -Infinity,
  );
  let best = -Infinity;
  for (const x of scored) best = Math.max(best, x.v);
  const pool = scored.filter((x) => x.v >= best - SPREAD);
  const s = pool.length
    ? pool[hash(w.id, band, 0x9a11) % pool.length].s
    : GALLERY[0];
  if (pickCache.size > 4000) pickCache.clear();
  pickCache.set(key, s.id);
  return s;
}

/** The colour someone's hair is, by their people (stays with them all their life). */
export function naturalTone(id: number, people: People): HairTone {
  const r = hash(id, 0x4a1) % 100;
  if (people === "native" || people === "african" || people === "mestizo")
    return r < 80 ? "black" : "dark";
  if (people === "spanish" || people === "portuguese")
    return r < 40 ? "black" : r < 80 ? "dark" : r < 93 ? "brown" : "auburn";
  if (people === "swedish" || people === "dutch")
    return r < 10 ? "dark" : r < 40 ? "brown" : r < 52 ? "auburn" : "fair";
  return r < 15
    ? "black"
    : r < 40
      ? "dark"
      : r < 70
        ? "brown"
        : r < 82
          ? "auburn"
          : "fair";
}

/**
 * The people a character's picture comes from. In the colonies the
 * colonists' neighbours were often African, free or enslaved, and in New
 * Spain and Brazil of mixed descent: a family's line decides it, so parents
 * and children agree.
 */
export function ancestryOf(c: Character, st: Station): People {
  const base = peopleOfCulture(c.culture);
  if (base === "native" || base === "swedish") return base;
  const roll = (hash(c.family || c.first, c.culture, 0xa11) % 1000) / 1000;
  const humble =
    st === "labourer" ||
    st === "tradesman" ||
    st === "sailor" ||
    st === "soldier" ||
    st === "frontier";
  const african = base === "portuguese" ? 0.12 : base === "dutch" ? 0.04 : 0.05;
  const mixed = base === "spanish" ? 0.15 : base === "portuguese" ? 0.08 : 0;
  if (roll < african) return humble ? "african" : base;
  if (roll < african + mixed) return "mestizo";
  return base;
}

/** What's wanted for a character no player has pictured, at an age. */
export function wantedFor(c: Character, age: number): Wanted {
  const st = stationOf(c);
  const people = ancestryOf(c, st);
  return {
    id: c.id,
    female: c.female,
    age,
    people,
    cls: classOfStation(st),
    year: yearAtAge(c, age),
    region: people === "native" ? regionOf(c.culture) : undefined,
    tone: naturalTone(c.id, people),
  };
}

// ---------------------------------------------------------------- a character's look

/** The year a character is `age`, from the day they were born. */
export function yearAtAge(c: Character, age: number): number {
  return dateOf(c.born + Math.round(age * DAYS_PER_YEAR)).year;
}

/** A look that shows a picture as painted. */
export function plainLook(p: string): Look {
  return { p, hair: -1, hairL: 0, cloth: -1, clothL: 0, grey: 0, flip: false };
}

/**
 * How a character looks at an age: the look a player chose (or their family
 * passed down), or a picture of their own that suits their years.
 */
export function lookOf(c: Character, age: number): Look {
  if (c.look) return c.look;
  const s = pickSitter(wantedFor(c, age));
  return s.age === "child" ? { ...plainLook(""), kid: s.id } : plainLook(s.id);
}

/**
 * The picture a look shows at an age. A child of a player's family wears
 * their child's picture until sixteen, and is given a grown one (with the
 * family's hair) if no one has chosen it.
 */
export function sitterAt(look: Look, age: number, c?: Character): Sitter {
  const child = age < 16;
  if (child && look.kid) {
    const k = SITTERS.get(look.kid);
    if (k) return k;
  }
  const own = SITTERS.get(look.p);
  if (own && (own.age === "child") === child) return own;
  const base: Wanted = c
    ? wantedFor(c, age)
    : {
        id: hash(look.p, look.kid ?? ""),
        female: own?.sex === "f",
        age,
        people: own?.people ?? "english",
        cls: own?.cls ?? "trades",
        year: own?.year ?? 1700,
      };
  const tone = SWATCH_TONE[look.hair];
  return pickSitter({ ...base, tone: tone ?? base.tone });
}

/** The picture someone is shown with at an age. */
export function sitterOf(c: Character, age: number): Sitter {
  return sitterAt(lookOf(c, age), age, c);
}

/** How grey a look's hair has gone at an age, 0 to 1. */
export function greyAt(look: Look, age: number, s: Sitter): number {
  if (look.grey <= 0 || s.wig || s.hair === "hidden") return 0;
  if (s.hair === "grey" || s.hair === "white") return 0;
  const from = look.grey >= 2 ? 32 : 40;
  return Math.max(0, Math.min(1, (age - from) / 30));
}

/** A copy of a look, so edits don't touch the original. */
export function copyLook(look: Look): Look {
  const out: Look = {
    p: look.p,
    hair: look.hair,
    hairL: look.hairL,
    cloth: look.cloth,
    clothL: look.clothL,
    grey: look.grey,
    flip: look.flip,
  };
  if (look.kid) out.kid = look.kid;
  return out;
}

// ---------------------------------------------------------------- new likenesses

/** Who a likeness is chosen for (the register, a new character). */
export interface LookSeed {
  /** Any number that stands for the person. */
  id: number;
  culture: string;
  female: boolean;
  age: number;
  station: Station;
  /** The year they're seen in. */
  year: number;
  religion?: string;
}

function wantedOfSeed(o: LookSeed): Wanted {
  const people = peopleOfCulture(o.culture);
  return {
    id: o.id,
    female: o.female,
    age: o.age,
    people,
    cls: classOfStation(o.station),
    year: o.year,
    region: people === "native" ? regionOf(o.culture) : undefined,
    tone: naturalTone(o.id, people),
  };
}

/** A likeness for someone new: a picture that suits them, as painted, greying as most do. */
export function generateLook(o: LookSeed): Look {
  return { ...plainLook(pickSitter(wantedOfSeed(o)).id), grey: 1 };
}

/**
 * A look made to fit someone: a picture of the other sex, of a child for a
 * grown person (or the reverse), or of another people's dress for one of the
 * peoples of the country (or the reverse) is chosen afresh; with `restyle`
 * the picture is chosen afresh anyway. The tuning stays.
 */
export function fitLook(look: Look, o: LookSeed, restyle = false): Look {
  // A draft from before the gallery: start afresh.
  if (!look || !("p" in look) || validateLook(look)) return generateLook(o);
  const s = SITTERS.get(look.p);
  const native = isNativeCulture(o.culture);
  const fits =
    s &&
    (s.sex === "f") === o.female &&
    (s.age === "child") === o.age < 16 &&
    (s.people === "native") === native;
  if (fits && !restyle) return copyLook(look);
  return { ...copyLook(look), p: pickSitter(wantedOfSeed(o)).id };
}

/**
 * A child's look in a player's family: a child's picture of their people
 * with a parent's hair, and their grown picture left to be chosen (by them,
 * or for them at sixteen, with the same hair).
 */
export function inheritLook(
  mother: Look,
  father: Look,
  seed: number,
  child: {
    female: boolean;
    culture: string;
    year: number;
    religion?: string;
  } = { female: false, culture: "english", year: 1650 },
): Look {
  const parent = hash(seed, 0x1e9) % 2 === 0 ? mother : father;
  const ps = SITTERS.get(parent.p);
  const people =
    ps && ps.people !== "native" && !isNativeCulture(child.culture)
      ? ps.people
      : peopleOfCulture(child.culture);
  // The hair runs in the family: the parent's tuning, or as their picture shows it.
  const hair =
    parent.hair >= 0
      ? parent.hair
      : ps && ps.hair !== "hidden" && ps.hair !== "grey" && ps.hair !== "white"
        ? TONE_SWATCH[ps.hair]
        : -1;
  const tone = hair >= 0 ? SWATCH_TONE[hair] : naturalTone(seed, people);
  const kid = pickSitter({
    id: seed,
    female: child.female,
    age: 8,
    people,
    cls: ps?.cls ?? "trades",
    year: child.year,
    tone,
  });
  const out: Look = {
    p: "",
    hair,
    hairL: hair >= 0 ? parent.hairL : 0,
    cloth: -1,
    clothL: 0,
    grey: Math.max(1, parent.grey),
    flip: false,
  };
  if (kid.age === "child") out.kid = kid.id;
  return out;
}

// ---------------------------------------------------------------- checking

const KEYS = new Set([
  "p",
  "kid",
  "hair",
  "hairL",
  "cloth",
  "clothL",
  "grey",
  "flip",
]);

function intIn(v: unknown, lo: number, hi: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

/**
 * Why a look can't be used (from a player, so anything), or null if it's
 * fine. With `female`, its pictures must be of that sex; with `grown`, it
 * must have a grown picture (a child of the family may have it chosen for
 * them later). A look in the old drawn shape passes: it's brought over
 * (migrateLook) where it's used.
 */
export function validateLook(
  look: unknown,
  o: { female?: boolean; grown?: boolean } = {},
): string | null {
  if (!look || typeof look !== "object" || Array.isArray(look))
    return "A likeness is needed.";
  const l = look as Record<string, unknown>;
  if (!("p" in l)) return isOldLook(l) ? null : "Likeness: choose a portrait.";
  if (Object.keys(l).some((k) => !KEYS.has(k)))
    return "Likeness: unknown parts.";
  if (typeof l.p !== "string") return "Likeness: choose a portrait.";
  const s = l.p === "" ? undefined : SITTERS.get(l.p);
  if (l.p !== "" && !s) return "Likeness: no such portrait.";
  if (s && s.age === "child") return "Likeness: that portrait is of a child.";
  if (l.kid !== undefined) {
    const k = typeof l.kid === "string" ? SITTERS.get(l.kid) : undefined;
    if (!k || k.age !== "child") return "Likeness: no such child's portrait.";
  }
  if (l.p === "" && o.grown) return "Likeness: choose a portrait.";
  if (!intIn(l.hair, -1, HAIR_TONES.length - 1))
    return "Likeness: no such hair colour.";
  if (!intIn(l.cloth, -1, CLOTH_COLORS.length - 1))
    return "Likeness: no such colour for the clothes.";
  if (!intIn(l.hairL, -2, 2) || !intIn(l.clothL, -2, 2))
    return "Likeness: a shade too far.";
  if (!intIn(l.grey, 0, 2)) return "Likeness: greying is 0 to 2.";
  if (typeof l.flip !== "boolean") return "Likeness: turned or not.";
  const kid = typeof l.kid === "string" ? SITTERS.get(l.kid) : undefined;
  for (const x of [s, kid])
    if (x && o.female !== undefined && (x.sex === "f") !== o.female)
      return o.female
        ? "Likeness: that portrait is of a man."
        : "Likeness: that portrait is of a woman.";
  return null;
}

// ---------------------------------------------------------------- old looks

/** The drawn looks of earlier versions, as far as bringing them over needs. */
const OLD_KEYS = [
  "skin",
  "face",
  "hair",
  "hairColor",
  "hat",
  "clothes",
  "colors",
  "greying",
];

function isOldLook(l: Record<string, unknown>): boolean {
  return (
    OLD_KEYS.every((k) => k in l) &&
    typeof l.hair === "string" &&
    typeof l.hat === "string" &&
    typeof l.clothes === "string" &&
    intIn(l.hairColor, 0, 8) &&
    intIn(l.greying, 0, 3) &&
    Array.isArray(l.colors) &&
    l.colors.length === 3 &&
    l.colors.every((c) => intIn(c, 0, CLOTH_COLORS.length - 1))
  );
}

/** The kind of sitter an old look's clothes showed. */
const OLD_CLOTHES: Record<string, SitterClass> = {
  jerkin: "labourer",
  waistcoat: "labourer",
  bodice: "labourer",
  short_gown: "labourer",
  sailor: "trades",
  hunting_shirt: "labourer",
  capote: "labourer",
  buckskin: "labourer",
  doublet_band: "trades",
  plain_coat: "trades",
  plain_gown: "trades",
  gown_collar: "merchant",
  doublet_ruff: "gentry",
  doublet_lace: "gentry",
  golilla: "gentry",
  justaucorps: "gentry",
  coat_stock: "gentry",
  bodice_ruff: "gentry",
  satin: "gentry",
  mantua: "gentry",
  robe: "gentry",
  black_suit: "learned",
  gown_bands: "clergy",
  cassock: "clergy",
  friar: "clergy",
  habit: "clergy",
  breastplate: "soldier",
  buff_coat: "soldier",
  regimental: "soldier",
  n_coat: "gentry",
};

const OLD_TONES: HairTone[] = [
  "black",
  "dark",
  "brown",
  "auburn",
  "auburn",
  "auburn",
  "fair",
  "fair",
  "fair",
];

/**
 * A drawn look of an earlier version, brought over: the portrait nearest
 * its sex, people, dress, hair and hat, with its hair colour, its coat's
 * colour and its greying. Anything that isn't an old look comes back as is.
 */
export function migrateLook(
  look: unknown,
  o: {
    id: number;
    female: boolean;
    culture: string;
    age: number;
    year: number;
  },
): Look | null {
  if (!look || typeof look !== "object") return null;
  const l = look as Record<string, unknown>;
  if ("p" in l) {
    if (!validateLook(l, { female: o.female })) return l as unknown as Look;
    // A portrait since taken out of the gallery: the nearest of their sex
    // and years instead, the tuning kept.
    const native = isNativeCulture(o.culture);
    const fresh: Record<string, unknown> = { ...l };
    const p = SITTERS.get(String(l.p));
    if (l.p !== "" && (!p || p.age === "child" || (p.sex === "f") !== o.female))
      fresh.p = pickSitter({
        id: hash(o.id, String(l.p)),
        female: o.female,
        age: Math.max(16, o.age),
        people: peopleOfCulture(o.culture),
        cls: native ? "gentry" : "trades",
        year: o.year,
        region: native ? regionOf(o.culture) : undefined,
      }).id;
    const k = SITTERS.get(String(l.kid));
    if (
      l.kid !== undefined &&
      (!k || k.age !== "child" || (k.sex === "f") !== o.female)
    )
      delete fresh.kid;
    return validateLook(fresh, { female: o.female })
      ? null
      : (fresh as unknown as Look);
  }
  if (!isOldLook(l)) return null;
  const hair = l.hair as string;
  const wig = /wig$/.test(hair);
  const native = isNativeCulture(o.culture);
  const people = peopleOfCulture(o.culture);
  const s = pickSitter({
    id: hash(o.id, JSON.stringify(l)),
    female: o.female,
    age: Math.max(16, o.age),
    people,
    cls: OLD_CLOTHES[l.clothes as string] ?? (native ? "gentry" : "trades"),
    year: o.year,
    region: native ? regionOf(o.culture) : undefined,
    tone: wig ? undefined : OLD_TONES[l.hairColor as number],
    wig: native ? undefined : wig,
    hat: (l.hat as string) !== "none",
  });
  const colors = l.colors as number[];
  return {
    p: s.id,
    // A wig keeps its powder; their own hair keeps the colour they chose.
    hair: wig || s.hair === "hidden" ? -1 : (l.hairColor as number),
    hairL: 0,
    cloth: colors[0],
    clothL: 0,
    grey: (l.greying as number) >= 2 ? 2 : 1,
    flip: false,
  };
}

/** A look as it should be stored: new looks as they are, old ones brought over. */
export function asLook(
  look: unknown,
  c: Pick<Character, "id" | "female" | "culture" | "born">,
  age = 30,
): Look | undefined {
  const year = dateOf(c.born + Math.round(age * DAYS_PER_YEAR)).year;
  return (
    migrateLook(look, {
      id: c.id,
      female: c.female,
      culture: c.culture,
      age,
      year,
    }) ?? undefined
  );
}

/**
 * A played character sits for a new likeness (the gallery in the game):
 * any portrait of their own sex, tuned as they like. Why not, or null.
 */
export function sitForLikeness(
  g: { touchChar(c: Character): Character },
  me: Character,
  look: unknown,
  age: number,
): string | null {
  const why = validateLook(look, { female: me.female, grown: age >= 16 });
  if (why) return why;
  const l = asLook(look, me, age);
  if (!l) return "Likeness: choose a portrait.";
  g.touchChar(me).look = l;
  return null;
}

/** Bring every character's old drawn look over to a portrait (a game saved before the gallery). */
export function migrateLooks(s: {
  day: number;
  chars: (Character | null | undefined)[] | Record<number, Character>;
}): void {
  for (const c of Object.values(s.chars) as (Character | null | undefined)[]) {
    if (!c?.look || "p" in c.look) continue;
    const age = Math.max(16, Math.floor((s.day - c.born) / DAYS_PER_YEAR));
    const l = asLook(c.look, c, age);
    if (l) c.look = l;
    else delete c.look;
  }
}

// ---------------------------------------------------------------- for the map

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) =>
    Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** A colour a shade lighter (+) or darker (-). */
export function shadeHex(hex: string, steps: number): string {
  if (!steps) return hex;
  return steps > 0
    ? mixHex(hex, "#ffffff", 0.14 * steps)
    : mixHex(hex, "#000000", -0.18 * steps);
}

/** The hair colour a look shows at an age (its tuning, greying), for small figures. */
export function hairHexAt(look: Look, s: Sitter, age: number): string {
  let hex = look.hair >= 0 ? HAIR_TONES[look.hair].hex : s.hx;
  hex = shadeHex(hex, look.hairL);
  const g = greyAt(look, age, s);
  return g > 0 ? mixHex(hex, "#b9b4ab", g) : hex;
}

/** The colour of a look's clothes, for small figures. */
export function clothHexOf(look: Look, s: Sitter): string {
  return shadeHex(
    look.cloth >= 0 ? CLOTH_COLORS[look.cloth].hex : s.cx,
    look.clothL,
  );
}

/** The colours of a little figure on the map: coat, breeches, hat, skin, hair. */
export function figureColors(
  look: Look,
  age = 30,
): {
  coat: string;
  breeches: string;
  hat: string | null;
  skin: string;
  hair: string;
} {
  const s = sitterAt(look, age);
  const coat = clothHexOf(look, s);
  return {
    coat,
    breeches: mixHex(coat, "#1a1410", 0.35),
    hat:
      s.head === "bare"
        ? null
        : s.head === "cap" || s.head === "veil"
          ? s.dress === "clerical" && s.head === "veil"
            ? "#1e1b18"
            : "#ece5d6"
          : s.head === "headdress"
            ? "#8f2b22"
            : "#1f1a16",
    skin: s.sx,
    hair: s.wig ? s.hx : hairHexAt(look, s, age),
  };
}

/** The ages a band runs between, for the register. */
export const BAND_AGES: Record<AgeBand, [number, number]> = {
  child: [0, 15],
  youth: [16, 24],
  prime: [25, 39],
  middle: [40, 54],
  elder: [55, 120],
};

export { AGE_BANDS };
