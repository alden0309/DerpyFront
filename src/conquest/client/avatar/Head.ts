// Where everything on a head goes. A portrait sitter is turned a little to
// the right (three-quarter view), so the face is laid out on a rounded head
// and turned: the near eye wide, the far eye narrower and close to the far
// cheek, the nose and mouth drawn toward the side the face is turned.
//
// The look's features set the bones (the face's shape, the jaw, the
// cheeks, the nose...), and each pair of them nudges a proportion a little
// further (how high the brow, how long the nose, where the mouth sits), so
// two sitters rarely share a face. Childhood, age and flesh change it too.

import type { Appearance, Region } from "../../engine/Appearance";
import type { Pt } from "./Svg";

export type Expression = "neutral" | "smile" | "frown" | "worried" | "angry";

/** Everything the painter needs to know about a sitting. */
export interface Sitting {
  look: Appearance;
  female: boolean;
  age: number;
  year: number;
  native: boolean;
  region: Region;
  culture: string;
  expression: Expression;
  /** For brushwork: the same person, the same strokes. */
  seed: number;
  /** "lite" leaves out the costlier brushwork, for small portraits. */
  detail: "full" | "lite";
  /** Background colour. */
  bg: string;
}

export interface Head {
  cx: number;
  cy: number;
  /** Half the face's width and height. */
  a: number;
  b: number;
  /** How far the head is turned (radians). */
  th: number;
  /** A point on the face, from where it would be seen straight on. */
  P(xn: number, yn: number, depth?: number): Pt;
  outline: Pt[];
  /** The skull behind the face. */
  skull: { cx: number; cy: number; rx: number; ry: number };
  /** Near and far eye centres, and their sizes. */
  eyeN: Pt;
  eyeF: Pt;
  eyeW: number;
  eyeWF: number;
  eyeH: number;
  /** The eye line, on the face seen straight on. */
  eyeYn: number;
  /** How far apart the eyes sit, on the face seen straight on. */
  eyeSet: number;
  browY: number;
  /** Bottom of the nose, its tip, its root between the eyes. */
  noseTip: Pt;
  noseRoot: Pt;
  noseLen: number;
  noseW: number;
  mouth: Pt;
  mouthW: number;
  chin: Pt;
  /** The near ear's centre and height. */
  ear: Pt;
  earH: number;
  /** Where the hair meets the forehead, at the middle. */
  hairY: number;
  /** Top of the skull. */
  top: number;
  /** Jaw corners, near and far. */
  jawN: Pt;
  jawF: Pt;
  /** Where the shoulders begin (the base of the neck). */
  neckBase: number;
  neckN: number;
  neckF: number;
  /** 1 for a small child, 0 for a grown adult. */
  child: number;
  /** Apparent age for lines, 0 to ~1 past the prime. */
  old: number;
  /** Flesh: 0 lean, 1 stout; and how gaunt (hollow cheeks, bones). */
  fat: number;
  gaunt: number;
  /** How strongly the bones of the face show (brow ridge, cheekbones). */
  bones: number;
  /** Expressions are drawn larger in small portraits, to read at a glance. */
  loud: number;
  expr: {
    /** Mouth corners: up (+) or down (-). */
    mouth: number;
    /** Brows drawn down and in (anger, a frown). */
    browIn: number;
    /** Brows raised in the middle (worry) or overall (a smile, a little). */
    browUp: number;
    /** Lower lids pushed up (a smile, a glare). */
    squint: number;
    /** Cheeks lifted (a smile). */
    cheek: number;
    /** Lips pressed (anger, worry). */
    tight: number;
    /** Lips parted. */
    open: number;
    /** Eyes opened wide (worry). */
    wide: number;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** A number in [-1, 1] that stands for a pair of features, always the same. */
function nudge(p: number, q: number, salt: number): number {
  let h = Math.imul(p + 1, 0x9e3779b1) ^ Math.imul(q + 7, 0x85ebca6b);
  h ^= Math.imul(salt + 3, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (((h >>> 0) % 2001) - 1000) / 1000;
}

/** How the face is drawn for each expression (before `loud`). */
function expressionOf(ex: Expression, loud: number): Head["expr"] {
  const k = loud;
  switch (ex) {
    case "smile":
      return {
        mouth: 1.6 * k,
        browIn: 0,
        browUp: 0.25 * k,
        squint: 0.75 * k,
        cheek: 1 * k,
        tight: 0,
        open: (k > 1.2 ? 0.75 : 0.42) * k,
        wide: 0,
      };
    case "frown":
      return {
        mouth: -1.45 * k,
        browIn: 1.0 * k,
        browUp: 0,
        squint: 0.25 * k,
        cheek: 0,
        tight: 0.35 * k,
        open: 0,
        wide: 0,
      };
    case "worried":
      return {
        mouth: -0.7 * k,
        browIn: 0.15 * k,
        browUp: 1.6 * k,
        squint: 0,
        cheek: 0,
        tight: 0.3 * k,
        open: 0.22 * k,
        wide: 0.45 * k,
      };
    case "angry":
      return {
        mouth: -0.75 * k,
        browIn: 1.75 * k,
        browUp: 0,
        squint: 0.55 * k,
        cheek: 0.15 * k,
        tight: 1 * k,
        open: k > 1.2 ? 0.3 : 0,
        wide: 0.1 * k,
      };
    default:
      return {
        mouth: 0,
        browIn: 0,
        browUp: 0,
        squint: 0,
        cheek: 0,
        tight: 0,
        open: 0,
        wide: 0,
      };
  }
}

export function buildHead(s: Sitting): Head {
  const L = s.look;
  const age = s.age;
  // Childhood: a rounder, smaller face, low features and big eyes.
  const child = age >= 16 ? 0 : clamp((16 - age) / 12, 0, 1);
  const grown = 1 - child;
  const lineAge = age + L.lines * 7;
  const old = clamp((lineAge - 38) / 40, 0, 1.1);
  // Flesh and bone.
  // The shape of the face: its size, how wide the jaw and chin against the
  // temples and cheekbones, and how much flesh or bone it shows.
  const SHAPES = [
    // a, b, jaw, chin, temple, cheekbone, fat, gaunt
    [42, 57, 0, 0, 0.95, 0, 0, 0], // oval
    [46, 52.5, 0.12, 0.08, 0.97, 0.03, 0.35, 0], // round
    [38.5, 62, -0.04, -0.02, 0.93, -0.02, 0, 0.1], // long
    [44, 55.5, 0.2, 0.14, 0.97, 0, 0, 0], // square
    [43.5, 57, -0.16, -0.12, 1.0, 0.03, 0, 0], // heart
    [47.5, 57, 0.1, 0.04, 0.97, 0.07, 0.1, 0], // broad
    [40, 60, 0.02, -0.02, 0.88, 0.04, 0, 1], // gaunt
    [47, 55.5, 0.18, 0.14, 0.96, 0, 1, 0], // fleshy
  ] as const;
  const shape = SHAPES[L.face] ?? SHAPES[0];
  const fat = clamp(
    (shape[6] +
      (L.cheeks === 1 ? 0.3 : 0) +
      (L.jaw === 4 ? 0.12 : 0) +
      (age > 40 ? Math.min(0.25, (age - 40) / 90) : 0)) *
      (1 - child * 0.5),
    0,
    1.2,
  );
  const gaunt = clamp(
    (shape[7] +
      (L.cheeks === 3 ? 0.45 : 0) +
      (age > 60 ? (age - 60) / 60 : 0)) *
      grown,
    0,
    1.2,
  );
  const bones = clamp(
    0.35 +
      (L.cheeks === 2 ? 0.35 : 0) +
      gaunt * 0.5 -
      fat * 0.35 -
      child * 0.3 +
      (s.female ? -0.1 : 0.05),
    0,
    1,
  );

  // (Drawn a little more unlike each other than the table says.)
  let a: number = 42 + (shape[0] - 42) * 1.25;
  let b: number = 57 + (shape[1] - 57) * 1.25;
  // A little more or less, by the face and the cheeks; and drawn broader
  // and shorter than a mask, as a head is.
  a *= (1 + nudge(L.face, L.cheeks, 1) * 0.035) * 1.01;
  b *= (1 + nudge(L.face, L.jaw, 2) * 0.03) * 0.97;
  if (s.female) {
    a *= 0.94;
    b *= 0.95;
  } else a *= 1.03;
  a *= 1 - child * 0.06;
  b *= 1 - child * 0.2;
  const cx = 118;
  const cy = 124 + child * 12;
  // Some sit square to the painter, some turn further away.
  const th = 0.36 + nudge(L.face, L.nose, 13) * 0.07;
  const sin = Math.sin(th);
  const P = (xn: number, yn: number, depth = 0): Pt => [
    cx + a * (Math.sin(Math.asin(clamp(xn, -1, 1)) + th) + depth * sin),
    cy + b * yn,
  ];

  // Jaw and chin.
  const jawI = L.jaw;
  const jawWide =
    (([0.06, 0.1, 0.2, -0.04, 0.22, 0.02, 0.13][jawI] ?? 0) + shape[2]) *
      grown +
    child * 0.06 +
    fat * 0.08 -
    (s.female ? 0.04 : 0);
  const chinW =
    (([0.3, 0.32, 0.4, 0.2, 0.42, 0.26, 0.36][jawI] ?? 0.3) +
      shape[3] +
      fat * 0.06) *
      grown +
    child * 0.38;
  // A receding chin falls back toward the throat; a heavy one juts.
  const chinDrop =
    ([1, 1.01, 1.0, 1.04, 1.03, 0.97, 1.02][jawI] ?? 1) + fat * 0.02;
  const chinBack = jawI === 5 ? 0.12 * grown : jawI === 4 ? -0.04 : 0;
  const temple = shape[4] + fat * 0.02 - (gaunt - shape[7]) * 0.04;
  const cheekbone = shape[5] + (L.cheeks === 2 ? 0.03 : 0);
  const hollow =
    (L.cheeks === 3 ? 0.06 + old * 0.04 : L.cheeks === 1 ? -0.03 : 0) +
    gaunt * 0.1 -
    fat * 0.06;
  const jowl = old * 0.05 + fat * 0.08;
  const outline: Pt[] = [
    [cx + a * -0.78, cy + b * -1.02],
    [cx + a * -temple, cy + b * -0.62],
    [cx + a * (-1.02 - cheekbone), cy + b * -0.2],
    [
      cx +
        a * (-0.98 - (L.cheeks === 1 ? 0.03 : 0) - fat * 0.05 + hollow * 0.6),
      cy + b * 0.16,
    ],
    [cx + a * (-0.86 - jawWide - jowl), cy + b * (0.5 + jowl)],
    [
      cx + a * (-0.52 - jawWide * 0.6 - fat * 0.05),
      cy + b * (0.82 + jowl * 0.5),
    ],
    [cx + a * (0.2 - chinW * 0.95 - chinBack), cy + b * (0.97 * chinDrop)],
    [cx + a * (0.3 + 0.02 - chinBack), cy + b * (1.02 * chinDrop)],
    [
      cx + a * (0.32 + chinW * 0.75 - chinBack * 0.6),
      cy + b * (0.93 * chinDrop),
    ],
    [cx + a * (0.8 + jawWide * 0.4 + fat * 0.04), cy + b * (0.6 + jowl)],
    [cx + a * (0.93 - hollow), cy + b * 0.28],
    // The far cheekbone, standing out against the dark.
    [cx + a * (0.99 + cheekbone + bones * 0.02), cy + b * -0.02],
    [cx + a * (0.945 - gaunt * 0.02), cy + b * -0.22],
    // The far brow's ridge.
    [cx + a * (0.975 + bones * 0.015), cy + b * -0.4],
    [cx + a * (temple - 0.03), cy + b * -0.7],
    [cx + a * 0.62, cy + b * -1.0],
  ];

  // Features, laid out on the face seen straight on, then turned.
  const eyeYn =
    -0.17 + child * 0.15 + nudge(L.eyes, L.eyeSet, 3) * 0.022 + old * 0.01;
  const set = 0.4 + (L.eyeSet - 1) * 0.05 + nudge(L.eyeSet, L.face, 4) * 0.012;
  const eyeW =
    a *
    (0.5 + child * 0.05) *
    (L.eyes === 3 ? 0.95 : L.eyes === 6 ? 1.05 : 1) *
    (1 - old * 0.04) *
    (1 + nudge(L.eyes, L.brows, 5) * 0.04);
  const ex = s.expression;
  const loud = s.detail === "lite" ? 1.55 : 1;
  const expr = expressionOf(ex, loud);
  // Everyone's face at rest has a cast of its own: a mouth that turns up or
  // down a little, brows that sit a little knitted or a little raised.
  const rest = ex === "neutral" ? 1 : 0.4;
  expr.mouth += nudge(L.mouth, L.brows, 12) * 0.38 * rest;
  expr.browIn += Math.max(0, nudge(L.brows, L.jaw, 14)) * 0.45 * rest;
  expr.browUp += Math.max(0, -nudge(L.brows, L.jaw, 14)) * 0.35 * rest;
  const eyeH =
    eyeW *
    (([0.39, 0.47, 0.35, 0.3, 0.39, 0.36, 0.46, 0.37][L.eyes] ?? 0.39) +
      child * 0.08 -
      old * 0.03) *
    (1 - expr.squint * 0.16 + expr.wide * 0.18);
  const eyeN = P(-set, eyeYn);
  const eyeF = P(set, eyeYn);
  const foreshort = Math.cos(Math.asin(set) + th) / Math.cos(Math.asin(set));
  const eyeWF = eyeW * foreshort;
  const browY =
    cy +
    b *
      (eyeYn -
        (s.female ? 0.19 : 0.16) -
        (L.brows === 1 ? 0.02 : 0) +
        nudge(L.brows, L.face, 6) * 0.015);
  // The nose: longer with the years.
  const noseKind = L.nose;
  const noseLen =
    b *
    ([0.54, 0.6, 0.45, 0.52, 0.66, 0.43, 0.62, 0.56][noseKind] ?? 0.54) *
    (1 - child * 0.3 + old * 0.05) *
    (L.face === 2 || L.face === 6 ? 1.08 : L.face === 1 ? 0.94 : 1) *
    (1 + nudge(L.nose, L.face, 7) * 0.05);
  const noseW =
    a *
    ([0.42, 0.42, 0.44, 0.58, 0.39, 0.36, 0.43, 0.54][noseKind] ?? 0.42) *
    (1 - child * 0.15 + fat * 0.05) *
    (1 + nudge(L.nose, L.mouth, 8) * 0.05);
  const noseRoot = P(0, eyeYn + 0.02, 0.06);
  const noseBaseY = cy + b * eyeYn + noseLen;
  const tipDepth =
    ([0.34, 0.4, 0.26, 0.3, 0.38, 0.24, 0.42, 0.36][noseKind] ?? 0.32) *
    (1 - child * 0.35);
  const noseTip: Pt = [P(0, 0, tipDepth)[0], noseBaseY - b * 0.03];
  // The mouth, a third of the way from the nose to the chin (or so).
  const mouthAt = 0.36 + nudge(L.mouth, L.jaw, 9) * 0.04 - fat * 0.02;
  const mouthYn = (noseBaseY - cy) / b + (1 - (noseBaseY - cy) / b) * mouthAt;
  const mouthW =
    a *
    ([0.68, 0.72, 0.84, 0.6, 0.66][L.mouth] ?? 0.68) *
    (1 - child * 0.15) *
    (1 + nudge(L.mouth, L.face, 10) * 0.05) *
    (1 + expr.mouth * 0.025 - expr.tight * 0.04);
  const mouth = P(0, mouthYn, 0.1);
  const chin: Pt = [cx + a * (0.32 - chinBack), cy + b * 1.02 * chinDrop];
  // The ear sits behind the near cheek, from brow to nose: longer with age.
  const earH =
    b * (([0.5, 0.56, 0.62, 0.6][L.ears] ?? 0.56) + child * 0.05 + old * 0.05);
  const ear: Pt = [cx - a * 1.02, cy + b * (eyeYn + 0.2 + old * 0.02)];
  const top = cy - b * (1.56 - child * 0.1);
  const skull = {
    cx: cx - a * 0.1,
    cy: cy - b * (0.5 + child * 0.12),
    rx: a * (1.13 + child * 0.1),
    ry: b * (0.98 + child * 0.32),
  };
  return {
    cx,
    cy,
    a,
    b,
    th,
    P,
    outline,
    skull,
    eyeN,
    eyeF,
    eyeW,
    eyeWF,
    eyeH,
    eyeYn,
    eyeSet: set,
    browY,
    noseTip,
    noseRoot,
    noseLen,
    noseW,
    mouth,
    mouthW,
    chin,
    ear,
    earH,
    hairY: cy - b * (0.98 - child * 0.08 + nudge(L.face, L.brows, 11) * 0.04),
    top,
    jawN: outline[4],
    jawF: outline[9],
    // The collar sits close under the jaw, as painters saw it.
    neckBase:
      cy + b * (1.18 + (s.female ? 0.05 : 0) - child * 0.06 + fat * 0.03),
    neckN: cx - a * (0.98 - child * 0.12 + fat * 0.08) + (s.female ? 6 : 0),
    neckF: cx + a * (0.55 - child * 0.06 + fat * 0.06) - (s.female ? 3 : 0),
    child,
    old,
    fat,
    gaunt,
    bones,
    loud,
    expr,
  };
}
