// BPEOPLE (r22): how Mr. Based's people look. One entry per look; the story
// names them (`@cast BASED "Mr. Based" look=suit_charcoal`, or `wear=` on an
// @actor line). Colours are CSS colours. Change a colour, a hat or a haircut
// here and the next load shows it: the clothes are cut from the body when
// the place loads (Tailor.ts), so nothing has to be remodelled.

/** Haircuts: the first five are Quaternius' (CC0); the others are cut from them. */
export type HairStyle =
  | "parted" // short, side-parted (men)
  | "buzzed" // clipped close
  | "slick" // parted, combed flat and back
  | "receding" // parted, thin at the front
  | "bald"
  | "long" // to the shoulders (women)
  | "bob" // long, cut at the jaw
  | "buns" // pinned up
  | "cropped" // clipped close (women)
  // r21 names, still read:
  | "short"
  | "grey_short";

export type Hat = {
  kind: "fedora" | "trilby" | "cap" | "flatcap" | "beret";
  color: string;
  /** The ribbon (a fedora's band, a cap's peak). */
  band?: string;
};

export interface Look {
  body: "m" | "f";
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Grey at the temples and through the hair, 0 to 1. */
  grey?: number;
  /** A beard, a moustache, or a day's growth. */
  facial?: "beard" | "moustache" | "stubble";
  /** r21: a moustache (same as facial: "moustache"). */
  moustache?: boolean;
  /** Build: -1 slight, 0 average, 1 heavy. */
  build?: number;
  /** Overall size (1 = about 1.8 m for a man). */
  height?: number;
  /** The face: -1..1 each. */
  face?: {
    jaw?: number;
    nose?: number;
    brow?: number;
    cheeks?: number;
    age?: number;
  };
  eyes?: string;

  shirt: string;
  tie?: string;
  /** A suit jacket. */
  jacket?: string;
  /** "single" (one button, open V), "double" (higher, crossed), "closed" (a uniform). */
  cut?: "single" | "double" | "closed";
  /** r21: shirt sleeves under a waistcoat (the jacket colour then is the waistcoat's). */
  sleeves?: string;
  waistcoat?: string;
  sweater?: string;
  /** A coat to the knee, over everything. */
  coat?: string;
  coatCut?: "overcoat" | "trench";
  /** The coat's collar turned up against the rain. */
  collarUp?: boolean;
  scarf?: string;
  trousers: string;
  skirt?: string;
  /** Stockings under a skirt. */
  legs?: string;
  shoes: string;
  apron?: string;
  /** Gold buttons, shoulder boards (a uniform). */
  braid?: string;
  hat?: Hat;
  glasses?: boolean | "round" | "square";
  cigarette?: boolean;
  /** A custom rigged model in models/ (see the README): replaces all of the above. */
  model?: string;
}

/**
 * The wardrobe. Plain clothes; who wears what is up to the story. The names
 * from round 21 (suit_charcoal ... uniform_navy) are kept; the rest are new.
 */
export const LOOKS: Record<string, Look> = {
  // Mr. Based: late forties, a former intelligence officer. Charcoal suit,
  // white shirt, a dark red tie, grey coming in at the temples.
  suit_charcoal: {
    body: "m",
    skin: "#c39a80",
    hair: "#3b3632",
    hairStyle: "parted",
    grey: 0.55,
    facial: "stubble",
    face: { jaw: 0.35, brow: 0.4, age: 0.55, cheeks: -0.3 },
    jacket: "#2a2c31",
    cut: "single",
    shirt: "#d8d4ca",
    tie: "#5a1c1f",
    trousers: "#26282d",
    shoes: "#18120e",
    eyes: "#5a6470",
  },
  // ...and in the street: the charcoal overcoat over it, collar up.
  overcoat_charcoal: {
    body: "m",
    skin: "#c39a80",
    hair: "#3b3632",
    hairStyle: "parted",
    grey: 0.55,
    facial: "stubble",
    face: { jaw: 0.35, brow: 0.4, age: 0.55, cheeks: -0.3 },
    jacket: "#2a2c31",
    coat: "#2e2d2b",
    coatCut: "overcoat",
    collarUp: true,
    scarf: "#3a3a3e",
    shirt: "#d8d4ca",
    tie: "#5a1c1f",
    trousers: "#26282d",
    shoes: "#18120e",
    eyes: "#5a6470",
  },
  // The man in grey: younger, sleek, a narrow tie.
  suit_grey: {
    body: "m",
    skin: "#caa085",
    hair: "#17130f",
    hairStyle: "slick",
    face: { jaw: -0.2, nose: 0.5, cheeks: -0.5, brow: -0.2 },
    jacket: "#6e7278",
    cut: "single",
    shirt: "#ecebe6",
    tie: "#1d2333",
    trousers: "#62666c",
    shoes: "#0c0c0d",
    build: -0.5,
    height: 1.02,
  },
  // The barman: sixties, a white moustache, black waistcoat,
  // shirt sleeves and a long white apron.
  barman: {
    body: "m",
    skin: "#d0a084",
    hair: "#8a847c",
    hairStyle: "receding",
    grey: 0.9,
    facial: "moustache",
    face: { age: 0.9, cheeks: 0.5, nose: 0.4, jaw: 0.2 },
    waistcoat: "#141416",
    shirt: "#ebe7dd",
    tie: "#0b0b0c",
    trousers: "#151517",
    shoes: "#0d0b0a",
    apron: "#ece8de",
    build: 0.6,
    height: 0.97,
  },
  // The woman in grey wool: jacket and skirt, glasses, hair pinned up.
  wool_woman: {
    body: "f",
    skin: "#dcb39c",
    hair: "#9a9184",
    hairStyle: "buns",
    grey: 0.4,
    face: { age: 0.5, cheeks: -0.2 },
    jacket: "#77736d",
    cut: "single",
    shirt: "#ddd7ca",
    trousers: "#3a3836",
    skirt: "#4a4744",
    legs: "#3a3330",
    shoes: "#1c1714",
    glasses: "round",
  },
  // A watcher: dark coat, collar up, a hat, smoking.
  coat_dark: {
    body: "m",
    skin: "#a87e64",
    hair: "#1b1918",
    hairStyle: "buzzed",
    facial: "stubble",
    face: { jaw: 0.6, brow: 0.6, nose: -0.2 },
    jacket: "#191b20",
    coat: "#1c1d22",
    coatCut: "trench",
    collarUp: true,
    shirt: "#2a2c30",
    trousers: "#1a1b1f",
    shoes: "#0e0e0f",
    hat: { kind: "fedora", color: "#1d1d20", band: "#0c0c0d" },
    cigarette: true,
  },
  // A politician: a dark suit.
  suit_dark: {
    body: "m",
    skin: "#b48c72",
    hair: "#2a2724",
    hairStyle: "slick",
    grey: 0.3,
    face: { jaw: 0.2, age: 0.4 },
    jacket: "#17181c",
    cut: "single",
    shirt: "#e6e3dc",
    tie: "#1a2140",
    trousers: "#16171b",
    shoes: "#0b0b0c",
  },
  // An officer: navy uniform, gold buttons and boards, a peaked cap.
  uniform_navy: {
    body: "m",
    skin: "#b08a70",
    hair: "#3a3632",
    hairStyle: "buzzed",
    grey: 0.6,
    face: { jaw: 0.5, age: 0.7, brow: 0.3 },
    jacket: "#1c2233",
    cut: "closed",
    braid: "#b8923e",
    shirt: "#c9c5ba",
    tie: "#141824",
    trousers: "#1a1f2e",
    shoes: "#0b0b0c",
    hat: { kind: "cap", color: "#1c2233", band: "#0b0d14" },
  },

  // --- r22: more people for the street and the bar ---
  // A trench coat, belted, with a trilby: the classic.
  trench_tan: {
    body: "m",
    skin: "#c49678",
    hair: "#4a3020",
    hairStyle: "parted",
    face: { nose: 0.3, jaw: -0.1 },
    jacket: "#3a3a3c",
    coat: "#8a7656",
    coatCut: "trench",
    shirt: "#d6d0c2",
    tie: "#2a3448",
    trousers: "#3a3a3c",
    shoes: "#2a1a10",
    hat: { kind: "trilby", color: "#4a4238", band: "#1e1a16" },
  },
  // An old man in a beret and a cardigan.
  old_beret: {
    body: "m",
    skin: "#d4a88e",
    hair: "#cfcac2",
    hairStyle: "receding",
    grey: 1,
    facial: "beard",
    face: { age: 1, cheeks: 0.4, nose: 0.6 },
    sweater: "#5a4a3a",
    shirt: "#c9c2b0",
    trousers: "#4a4640",
    shoes: "#2a2018",
    hat: { kind: "beret", color: "#1e1e24" },
    build: 0.3,
    height: 0.95,
  },
  // A worker: blue work jacket, flat cap.
  worker_blue: {
    body: "m",
    skin: "#b2876a",
    hair: "#2b2018",
    hairStyle: "buzzed",
    facial: "stubble",
    face: { jaw: 0.5, cheeks: 0.2 },
    sweater: "#2d4a74",
    shirt: "#8a8a84",
    trousers: "#2e2e30",
    shoes: "#1e1a16",
    hat: { kind: "flatcap", color: "#3a3630" },
    build: 0.4,
  },
  // A waiter: white jacket, black tie.
  waiter: {
    body: "m",
    skin: "#c8a082",
    hair: "#1a1612",
    hairStyle: "slick",
    face: { jaw: -0.3, cheeks: -0.2 },
    jacket: "#e8e4d8",
    cut: "single",
    shirt: "#f2efe8",
    tie: "#0c0c0c",
    trousers: "#141414",
    shoes: "#0a0a0a",
    build: -0.3,
  },
  // A policeman: navy, peaked cap.
  police: {
    body: "m",
    skin: "#bc9274",
    hair: "#2a2622",
    hairStyle: "buzzed",
    face: { jaw: 0.4 },
    jacket: "#1a2030",
    cut: "closed",
    braid: "#c8c8cc",
    shirt: "#a8b4c4",
    tie: "#141824",
    trousers: "#1a2030",
    shoes: "#0a0a0a",
    hat: { kind: "cap", color: "#161c2a", band: "#0a0c12" },
  },
  // A woman in a red coat, the only colour in the street.
  coat_red: {
    body: "f",
    skin: "#e2bca6",
    hair: "#2a1a14",
    hairStyle: "bob",
    face: { cheeks: 0.2 },
    jacket: "#2a2a2c",
    coat: "#7a1e1e",
    coatCut: "overcoat",
    shirt: "#e8e2d6",
    trousers: "#2a2a2c",
    skirt: "#2a2a2c",
    legs: "#2e2624",
    shoes: "#140e0c",
    scarf: "#d8cfc0",
  },
  // A woman in a dark dress suit, long hair.
  suit_black_f: {
    body: "f",
    skin: "#a87a5e",
    hair: "#120e0c",
    hairStyle: "long",
    face: { jaw: -0.2 },
    jacket: "#18181c",
    cut: "single",
    shirt: "#c8c0b4",
    trousers: "#18181c",
    shoes: "#0a0a0a",
  },
  // A man in a grey sweater and glasses: a clerk, a student.
  sweater_grey: {
    body: "m",
    skin: "#e0b49a",
    hair: "#6a4a2a",
    hairStyle: "parted",
    face: { jaw: -0.4, nose: 0.2 },
    sweater: "#5c5e62",
    shirt: "#d8d8d2",
    trousers: "#2c3038",
    shoes: "#2a1e16",
    glasses: "square",
    build: -0.6,
  },
};

/** The names a story may use in look= and wear=. */
export const LOOK_NAMES = Object.keys(LOOKS);
