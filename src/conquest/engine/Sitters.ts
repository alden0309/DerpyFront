// The kinds of sitter in the portrait gallery (Gallery.ts): who they were,
// as far as their picture tells it. The gallery's data and the rules that
// pick a picture for someone (Appearance.ts) share these.

/** How old a sitter looks. */
export type AgeBand = "child" | "youth" | "prime" | "middle" | "elder";

export const AGE_BANDS: readonly AgeBand[] = [
  "child",
  "youth",
  "prime",
  "middle",
  "elder",
];

/** Whose people a sitter was. */
export type People =
  | "english"
  | "french"
  | "spanish"
  | "dutch"
  | "swedish"
  | "portuguese"
  | "native"
  | "african"
  | "mestizo";

export const PEOPLES: readonly People[] = [
  "english",
  "french",
  "spanish",
  "dutch",
  "swedish",
  "portuguese",
  "native",
  "african",
  "mestizo",
];

/** What a sitter did, as their clothes tell it. */
export type SitterClass =
  | "labourer"
  | "trades"
  | "merchant"
  | "learned"
  | "gentry"
  | "clergy"
  | "soldier"
  | "officer";

export const SITTER_CLASSES: readonly SitterClass[] = [
  "labourer",
  "trades",
  "merchant",
  "learned",
  "gentry",
  "clergy",
  "soldier",
  "officer",
];

/** The colour of their hair, as painted ("hidden": under a cap or veil). */
export type HairTone =
  | "black"
  | "dark"
  | "brown"
  | "auburn"
  | "fair"
  | "grey"
  | "white"
  | "hidden";

export const HAIR_TONE_KEYS: readonly HairTone[] = [
  "black",
  "dark",
  "brown",
  "auburn",
  "fair",
  "grey",
  "white",
  "hidden",
];

/** What's on their head. */
export type Headwear = "bare" | "hat" | "cap" | "veil" | "headdress";

export const HEADWEARS: readonly Headwear[] = [
  "bare",
  "hat",
  "cap",
  "veil",
  "headdress",
];

/** What they wear. */
export type Dress =
  | "plain"
  | "sober"
  | "fine"
  | "armour"
  | "uniform"
  | "clerical"
  | "native";

export const DRESSES: readonly Dress[] = [
  "plain",
  "sober",
  "fine",
  "armour",
  "uniform",
  "clerical",
  "native",
];

/** One painting in the gallery. */
export interface Sitter {
  /** The picture's name, and its files' (client/portraits/). */
  id: string;
  sex: "m" | "f";
  age: AgeBand;
  people: People;
  cls: SitterClass;
  hair: HairTone;
  /** A wig rather than their own hair. */
  wig: boolean;
  /** Hair (or wig) to the shoulders or longer. */
  long: boolean;
  head: Headwear;
  dress: Dress;
  /** Which way they look: to the picture's left or right, or straight out. */
  look: "l" | "r" | "f";
  /** About when it was painted. */
  year: number;
  /** Painted in the Americas (colonists, the peoples of the country). */
  col?: boolean;
  /** A print or drawing on paper: shown framed, never cut out of its ground. */
  flat?: boolean;
  /** For the peoples of the country: where (woodlands, southeast, brazil...). */
  region?: string;
  /** The colours of the hair, clothes and skin as painted (for the map's walkers). */
  hx: string;
  cx: string;
  sx: string;
  /** How light the hair and clothes are, 0 to 1 (for tuning them). */
  hl: number;
  cl: number;
}
