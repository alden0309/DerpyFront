// EVENTS (r21): playing cards as the colonies knew them, drawn here in SVG
// (nothing to license): the Paris pattern that French makers sent over the
// whole Atlantic world in the eighteenth century, which English cards of the
// time much resembled. Full-length, single-headed court cards in the
// woodblock-and-stencil manner (black outlines, flat red, blue, yellow and
// green laid on a shade off the line), each with the name the Paris pattern
// gave it (David, Charles, César and Alexandre; Pallas, Judic, Rachel and
// Argine; Hogier, La Hire, Hector and Lancelot). Pip cards with their pips
// in the old places, the lower ones turned about. No index in the corners
// (cards had none until the next century), square corners, and plain backs.

import { html, svg, type SVGTemplateResult, type TemplateResult } from "lit";
import { rankOf, suitOf } from "../engine/CardsCore";
import type { Card } from "../engine/Types";

const INK = "#1f1a16";
const RED = "#b3352a";
const BLUE = "#2f5d8c";
const YELLOW = "#d9a431";
const GREEN = "#4f7a3c";
const FLESH = "#efcfa9";
const PAPER = "#f4ecd8";
const HAIR = "#6b4423";

// ---------------------------------------------------------------- the suits

/** A suit's mark in a 20 × 20 box, centred on (10, 10). */
const PIP: Record<number, string> = {
  // hearts (cœurs)
  0: "M10 18.2C4.2 13.6.6 9.6 2.6 5.1 4.6 1.1 8.6 1.5 10 4.9 11.4 1.5 15.4 1.1 17.4 5.1 19.4 9.6 15.8 13.6 10 18.2Z",
  // diamonds (carreaux)
  1: "M10 1 17.2 10 10 19 2.8 10Z",
  // spades (piques)
  2: "M10 1.6C15.6 6.2 19.2 9.4 17.4 13.2 15.8 16.4 12.2 15.8 10.9 13.6 11.2 16.2 12.4 18 14 19H6C7.6 18 8.8 16.2 9.1 13.6 7.8 15.8 4.2 16.4 2.6 13.2.8 9.4 4.4 6.2 10 1.6Z",
  // clubs (trèfles)
  3: "M10 1.4A4.1 4.1 0 0 1 13.6 7.6 4.1 4.1 0 1 1 11.2 13.4C11.4 15.8 12.4 17.6 14 19H6C7.6 17.6 8.6 15.8 8.8 13.4A4.1 4.1 0 1 1 6.4 7.6 4.1 4.1 0 0 1 10 1.4Z",
};

const red = (suit: number) => suit === 0 || suit === 1;

/** A suit's mark at (x, y), `size` across, turned about if `flip`. */
function pip(
  suit: number,
  x: number,
  y: number,
  size: number,
  flip = false,
): SVGTemplateResult {
  const k = size / 20;
  return svg`<path d=${PIP[suit]} fill=${red(suit) ? RED : INK}
    transform="translate(${x} ${y}) scale(${k}) ${flip ? "rotate(180)" : ""} translate(-10 -10)" />`;
}

/** Where the pips go, card by card (two to ten), on a card 100 × 150. */
const L = 30;
const M = 50;
const R = 70;
const LAYOUT: Record<number, [number, number][]> = {
  2: [
    [M, 26],
    [M, 124],
  ],
  3: [
    [M, 26],
    [M, 75],
    [M, 124],
  ],
  4: [
    [L, 26],
    [R, 26],
    [L, 124],
    [R, 124],
  ],
  5: [
    [L, 26],
    [R, 26],
    [M, 75],
    [L, 124],
    [R, 124],
  ],
  6: [
    [L, 26],
    [R, 26],
    [L, 75],
    [R, 75],
    [L, 124],
    [R, 124],
  ],
  7: [
    [L, 26],
    [R, 26],
    [M, 50],
    [L, 75],
    [R, 75],
    [L, 124],
    [R, 124],
  ],
  8: [
    [L, 26],
    [R, 26],
    [M, 50],
    [L, 75],
    [R, 75],
    [M, 100],
    [L, 124],
    [R, 124],
  ],
  9: [
    [L, 26],
    [R, 26],
    [L, 59],
    [R, 59],
    [M, 75],
    [L, 91],
    [R, 91],
    [L, 124],
    [R, 124],
  ],
  10: [
    [L, 26],
    [R, 26],
    [M, 43],
    [L, 59],
    [R, 59],
    [L, 91],
    [R, 91],
    [M, 107],
    [L, 124],
    [R, 124],
  ],
};

// ---------------------------------------------------------------- the court

type Head = "crown" | "coronet" | "hat" | "helmet";
type Holds =
  | "harp"
  | "sceptre"
  | "orb"
  | "sword"
  | "flower"
  | "fan"
  | "halberd"
  | "axe"
  | "bow"
  | "shield";

interface Court {
  name: string;
  head: Head;
  holds: Holds;
  /** The robe, the cloak over it, the trimming. */
  robe: string;
  cloak: string;
  trim: string;
  beard?: boolean;
  /** A woman's gown (the queens). */
  gown?: boolean;
}

/** The Paris pattern's court, by suit (hearts, diamonds, spades, clubs) and rank (knave, queen, king). */
const COURT: Record<number, Record<10 | 11 | 12, Court>> = {
  0: {
    10: {
      name: "LA HIRE",
      head: "hat",
      holds: "halberd",
      robe: RED,
      cloak: YELLOW,
      trim: BLUE,
    },
    11: {
      name: "IUDIC",
      head: "coronet",
      holds: "flower",
      robe: BLUE,
      cloak: RED,
      trim: YELLOW,
      gown: true,
    },
    12: {
      name: "CHARLES",
      head: "crown",
      holds: "sceptre",
      robe: RED,
      cloak: BLUE,
      trim: YELLOW,
      beard: true,
    },
  },
  1: {
    10: {
      name: "HECTOR",
      head: "helmet",
      holds: "axe",
      robe: YELLOW,
      cloak: GREEN,
      trim: RED,
    },
    11: {
      name: "RACHEL",
      head: "coronet",
      holds: "fan",
      robe: RED,
      cloak: YELLOW,
      trim: BLUE,
      gown: true,
    },
    12: {
      name: "CESAR",
      head: "crown",
      holds: "orb",
      robe: BLUE,
      cloak: RED,
      trim: YELLOW,
      beard: true,
    },
  },
  2: {
    10: {
      name: "HOGIER",
      head: "hat",
      holds: "sword",
      robe: BLUE,
      cloak: RED,
      trim: YELLOW,
    },
    11: {
      name: "PALLAS",
      head: "helmet",
      holds: "shield",
      robe: YELLOW,
      cloak: BLUE,
      trim: RED,
      gown: true,
    },
    12: {
      name: "DAVID",
      head: "crown",
      holds: "harp",
      robe: YELLOW,
      cloak: RED,
      trim: BLUE,
      beard: true,
    },
  },
  3: {
    10: {
      name: "LANCELOT",
      head: "hat",
      holds: "bow",
      robe: GREEN,
      cloak: YELLOW,
      trim: RED,
    },
    11: {
      name: "ARGINE",
      head: "coronet",
      holds: "sceptre",
      robe: RED,
      cloak: BLUE,
      trim: YELLOW,
      gown: true,
    },
    12: {
      name: "ALEXANDRE",
      head: "crown",
      holds: "sword",
      robe: RED,
      cloak: GREEN,
      trim: YELLOW,
      beard: true,
    },
  },
};

/**
 * A shape laid on twice, as a stencil-coloured woodcut is: the colour a shade
 * off the line, then the black line over it.
 */
function cut(d: string, fill: string, w = 1.1): SVGTemplateResult {
  return svg`<path d=${d} fill=${fill} transform="translate(0.9 0.6)" />
    <path d=${d} fill="none" stroke=${INK} stroke-width=${w} stroke-linejoin="round" />`;
}

/** What the figure holds, in the right hand (the viewer's left) at about (31, 80). */
function held(h: Holds, suit: number): SVGTemplateResult {
  switch (h) {
    case "harp":
      return svg`${cut("M18 58C14 70 14 88 20 100L34 100 32 92C27 84 25 72 26 62Z", YELLOW)}
        <path d="M21 62L24 98M24 64 27 96M27 66 29 93" stroke=${INK} stroke-width="0.6" />`;
    case "sceptre":
      return svg`<path d="M31 98 25 46" stroke=${INK} stroke-width="2.2" />
        ${cut("M25 46A3.6 3.6 0 1 1 24.9 46Z", YELLOW, 0.9)}
        <path d="M25 42.4V37.6M22.8 39.4H27.2" stroke=${INK} stroke-width="1" />`;
    case "orb":
      return svg`${cut("M28 72A6 6 0 1 1 27.9 72Z", YELLOW)}
        <path d="M22 72H34M28 66V60M25.5 62H30.5" stroke=${INK} stroke-width="1" />`;
    case "sword":
      return svg`<path d="M30 92 22 42" stroke="#8d8d8d" stroke-width="2.4" />
        <path d="M30 92 22 42" stroke=${INK} stroke-width="0.5" />
        ${cut("M24 84 36 81 36.6 83.6 24.6 86.6Z", YELLOW, 0.8)}`;
    case "flower":
      return svg`<path d="M31 84C30 74 28 66 28 58" stroke=${GREEN} stroke-width="1.6" fill="none" />
        ${cut("M28 58C24 54 26 49 28 51 30 49 32 54 28 58Z", RED, 0.8)}
        ${cut("M29 70C33 67 35 69 33 71 31 72 29 71 29 70Z", GREEN, 0.6)}`;
    case "fan":
      return svg`${cut("M30 82 18 66C20 61 28 58 34 60Z", YELLOW, 0.9)}
        <path d="M30 82 20 64M30 82 24 61M30 82 29 59" stroke=${INK} stroke-width="0.5" />`;
    case "halberd":
      return svg`<path d="M30 112 26 26" stroke=${HAIR} stroke-width="2.2" />
        ${cut("M26 30 18 36 25 40 33 34Z", "#9a9a9a", 0.8)}
        <path d="M26 26 25 20" stroke=${INK} stroke-width="1.4" />`;
    case "axe":
      return svg`<path d="M30 104 26 44" stroke=${HAIR} stroke-width="2.2" />
        ${cut("M26 46C18 44 15 50 16 56 20 54 24 54 27 56Z", "#9a9a9a", 0.8)}`;
    case "bow":
      return svg`<path d="M20 46C32 62 32 92 20 108" stroke=${HAIR} stroke-width="2" fill="none" />
        <path d="M20 46V108" stroke=${INK} stroke-width="0.5" />`;
    case "shield":
      return svg`${cut("M18 66H38V84C38 92 28 98 28 98 28 98 18 92 18 84Z", BLUE)}
        ${pip(suit, 28, 80, 11)}`;
  }
}

function headgear(h: Head, trim: string): SVGTemplateResult {
  switch (h) {
    case "crown":
      return cut("M40 32 41 22 45.5 27 50 19 54.5 27 59 22 60 32Z", YELLOW, 1);
    case "coronet":
      return svg`${cut("M42 31 43 25 47 28 50 23 53 28 57 25 58 31Z", YELLOW, 0.9)}
        ${cut("M41 31C38 44 38 56 40 64L44 60C43 50 43 40 44 32Z", "#f8f1e2", 0.7)}`;
    case "hat":
      return svg`${cut("M34 31C40 27 60 27 66 31 60 33 40 33 34 31Z", INK, 0.8)}
        ${cut("M42 30C42 22 58 22 58 30Z", trim, 0.9)}
        ${cut("M57 25C64 17 70 18 68 24 64 22 60 24 58 27Z", RED, 0.7)}`;
    case "helmet":
      return svg`${cut("M41 33C40 21 60 21 59 33Z", "#a8a8a8", 1)}
        ${cut("M57 25C62 19 68 20 69 25 65 23 61 25 58 28Z", trim, 0.7)}`;
  }
}

/** A court card's figure: standing, full-length, its name over it. */
function courtFigure(suit: number, rank: 10 | 11 | 12): SVGTemplateResult {
  const f = COURT[suit][rank];
  const hem = f.gown ? 134 : 126;
  return svg`
    <rect x="8" y="9" width="84" height="132" fill="none" stroke=${INK} stroke-width="0.7" />
    <text x="50" y="18.5" text-anchor="middle" font-family="'IM Fell English', Georgia, serif"
      font-size="7.4" letter-spacing="0.6" fill=${INK}>${f.name}</text>
    ${pip(suit, 15.5, 16, 8)}
    <path d="M10 ${hem + 4}H90" stroke=${INK} stroke-width="0.7" />
    ${cut(`M32 54C24 66 20 104 18 ${hem}H82C80 104 76 66 68 54Z`, f.cloak)}
    ${cut(`M38 52C35 70 32 100 30 ${hem}H70C68 100 65 70 62 52Z`, f.robe)}
    <path d="M38 64H62M36 80H64M34 98H66M32 114H68" stroke=${INK} stroke-width="0.45" opacity="0.7" />
    ${cut("M36 78H64V84H36Z", f.trim, 0.8)}
    ${f.gown ? svg`` : cut(`M42 ${hem}V${hem + 3}H48V${hem}ZM52 ${hem}V${hem + 3}H58V${hem}Z`, INK, 0.6)}
    ${cut("M38 50C42 46 58 46 62 50 58 54 42 54 38 50Z", "#f8f1e2", 0.8)}
    ${cut("M36 56C30 62 28 74 30 82 33 82 35 80 36 78 36 70 38 62 40 58Z", f.robe, 0.9)}
    ${cut("M64 56C70 62 72 74 70 84 67 84 65 82 64 80 64 72 62 62 60 58Z", f.robe, 0.9)}
    ${cut("M28 82A3 3 0 1 1 27.9 82Z", FLESH, 0.7)}
    ${cut("M70 84A3 3 0 1 1 69.9 84Z", FLESH, 0.7)}
    ${cut("M43 34C40 40 41 48 44 50 48 46 52 46 56 50 59 48 60 40 57 34Z", HAIR, 0.8)}
    ${cut("M50 31A8 9 0 1 1 49.9 31Z", FLESH, 1)}
    <circle cx="47" cy="38" r="0.9" fill=${INK} />
    <circle cx="53" cy="38" r="0.9" fill=${INK} />
    <path d="M50 39.5 49.2 42.5H50.8" stroke=${INK} stroke-width="0.6" fill="none" />
    <path d="M47.6 44.6C49 45.6 51 45.6 52.4 44.6" stroke=${RED} stroke-width="0.8" fill="none" />
    ${f.beard ? cut("M43.6 42C44 50 48 53 50 53 52 53 56 50 56.4 42 54 46 46 46 43.6 42Z", HAIR, 0.8) : svg``}
    ${headgear(f.head, f.trim)}
    ${held(f.holds, suit)}`;
}

// ---------------------------------------------------------------- whole cards

/** The ace: one great pip; the ace of spades with a flourish, as the duty-stamped aces had. */
function aceFace(suit: number): SVGTemplateResult {
  const flourish =
    suit === 2 || suit === 3
      ? svg`<circle cx="50" cy="75" r="31" fill="none" stroke=${INK} stroke-width="0.8" />
        <circle cx="50" cy="75" r="34" fill="none" stroke=${INK} stroke-width="0.4" stroke-dasharray="1.6 2" />
        ${[0, 60, 120, 180, 240, 300].map(
          (a) =>
            svg`<path d="M50 41C47 37 47 33 50 30 53 33 53 37 50 41Z" fill=${suit === 2 ? INK : GREEN} transform="rotate(${a} 50 75)" />`,
        )}`
      : svg``;
  return svg`${flourish}${pip(suit, 50, 75, suit === 2 || suit === 3 ? 36 : 44)}`;
}

/** A card face up. */
export function cardFace(c: Card, cls = ""): TemplateResult {
  const suit = suitOf(c);
  const rank = rankOf(c);
  const face =
    rank === 0
      ? aceFace(suit)
      : rank >= 10
        ? courtFigure(suit, rank as 10 | 11 | 12)
        : svg`${LAYOUT[rank + 1].map(([x, y]) => pip(suit, x, y, 17, y > 75))}`;
  return html`<svg
    class="cq-card face ${cls}"
    viewBox="0 0 100 150"
    role="img"
    aria-label=${cardLabel(c)}
  >
    <rect
      x="0.75"
      y="0.75"
      width="98.5"
      height="148.5"
      rx="2"
      fill=${PAPER}
      stroke="#8a7a5c"
      stroke-width="1.5"
    />
    ${face}
  </svg>`;
}

/** A card face down: plain paper, as the backs were. */
export function cardBack(cls = ""): TemplateResult {
  return html`<svg
    class="cq-card back ${cls}"
    viewBox="0 0 100 150"
    role="img"
    aria-label="A card, face down"
  >
    <rect
      x="0.75"
      y="0.75"
      width="98.5"
      height="148.5"
      rx="2"
      fill="#efe4cb"
      stroke="#8a7a5c"
      stroke-width="1.5"
    />
    <rect
      x="7"
      y="7"
      width="86"
      height="136"
      fill="none"
      stroke="#c9b791"
      stroke-width="0.8"
    />
  </svg>`;
}

const RANK_WORDS = [
  "Ace",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Knave",
  "Queen",
  "King",
];
const SUIT_WORDS = ["hearts", "diamonds", "spades", "clubs"];

/** "Queen of spades (Pallas)". */
export function cardLabel(c: Card): string {
  const r = rankOf(c);
  const s = suitOf(c);
  const name =
    r >= 10
      ? ` (${COURT[s][r as 10 | 11 | 12].name.charAt(0)}${COURT[s][r as 10 | 11 | 12].name.slice(1).toLowerCase()})`
      : "";
  return `${RANK_WORDS[r]} of ${SUIT_WORDS[s]}${name}`;
}
