// Where everything on a head goes. A portrait sitter is turned a little to
// the right (three-quarter view), so the face is laid out on a rounded head
// and turned: the near eye wide, the far eye narrower and close to the far
// cheek, the nose and mouth drawn toward the side the face is turned.

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
  expr: {
    mouth: number;
    browIn: number;
    browUp: number;
    squint: number;
    cheek: number;
    tight: number;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function buildHead(s: Sitting): Head {
  const L = s.look;
  const age = s.age;
  // Childhood: a rounder, smaller face, low features and big eyes.
  const child = age >= 16 ? 0 : clamp((16 - age) / 12, 0, 1);
  const lineAge = age + L.lines * 7;
  const old = clamp((lineAge - 38) / 40, 0, 1.1);
  let a = 42;
  let b = 57;
  switch (L.face) {
    case 1: // round
      a = 45;
      b = 53;
      break;
    case 2: // long
      a = 39.5;
      b = 61;
      break;
    case 3: // square
      a = 43.5;
      b = 56;
      break;
    case 4: // heart
      a = 43;
      b = 57;
      break;
    case 5: // broad
      a = 46;
      b = 57;
      break;
  }
  if (s.female) {
    a *= 0.95;
    b *= 0.95;
  }
  a *= 1 - child * 0.06;
  b *= 1 - child * 0.2;
  const cx = 118;
  const cy = 124 + child * 12;
  const th = 0.33;
  const sin = Math.sin(th);
  const P = (xn: number, yn: number, depth = 0): Pt => [
    cx + a * (Math.sin(Math.asin(clamp(xn, -1, 1)) + th) + depth * sin),
    cy + b * yn,
  ];

  // Jaw and chin.
  const jawWide =
    [0, 0.04, 0.1, -0.07, 0.12][L.jaw] * (1 - child) +
    child * 0.1 +
    (L.face === 3 ? 0.06 : 0) +
    (L.face === 1 ? 0.04 : 0) -
    (L.face === 4 ? 0.08 : 0) -
    child * 0.04 -
    (s.female ? 0.03 : 0);
  const chinW =
    ([0.3, 0.32, 0.4, 0.2, 0.42][L.jaw] - (L.face === 4 ? 0.06 : 0)) *
      (1 - child) +
    child * 0.38;
  const chinDrop = [1, 1.01, 1.0, 1.04, 1.03][L.jaw];
  const temple = 0.95 + (L.face === 4 ? 0.04 : 0) - child * 0.0;
  const hollow =
    L.cheeks === 3 ? 0.06 + old * 0.04 : L.cheeks === 1 ? -0.03 : 0;
  const jowl = old * 0.05;
  const outline: Pt[] = [
    [cx + a * -0.78, cy + b * -1.02],
    [cx + a * -temple, cy + b * -0.62],
    [cx + a * -1.02, cy + b * -0.2],
    [cx + a * (-0.98 - (L.cheeks === 1 ? 0.03 : 0)), cy + b * 0.16],
    [cx + a * (-0.86 - jawWide - jowl), cy + b * (0.5 + jowl)],
    [cx + a * (-0.52 - jawWide * 0.6), cy + b * (0.82 + jowl * 0.4)],
    [cx + a * (0.26 - chinW * 0.95), cy + b * (0.97 * chinDrop)],
    [cx + a * (0.3 + 0.02), cy + b * (1.02 * chinDrop)],
    [cx + a * (0.3 + chinW * 0.75), cy + b * (0.93 * chinDrop)],
    [cx + a * (0.78 + jawWide * 0.4), cy + b * (0.6 + jowl)],
    [cx + a * (0.93 - hollow), cy + b * 0.26],
    [cx + a * (1.0 + (L.cheeks === 2 ? 0.02 : 0)), cy + b * -0.05],
    [cx + a * 0.955, cy + b * -0.24],
    [cx + a * 0.985, cy + b * -0.42],
    [cx + a * (temple - 0.03), cy + b * -0.7],
    [cx + a * 0.66, cy + b * -1.0],
  ];

  // Features, laid out on the face seen straight on, then turned.
  const eyeYn = -0.16 + child * 0.14;
  const set = 0.4 + (L.eyeSet - 1) * 0.045;
  const eyeW = a * (0.44 + child * 0.05) * (L.eyes === 3 ? 0.95 : 1);
  const eyeH =
    eyeW *
    ([0.36, 0.44, 0.34, 0.28, 0.36, 0.34][L.eyes] + child * 0.08) *
    (1 -
      (s.expression === "smile" ? 0.12 : 0) -
      (s.expression === "angry" ? 0.12 : 0));
  const eyeN = P(-set, eyeYn);
  const eyeF = P(set, eyeYn);
  const foreshort = Math.cos(Math.asin(set) + th) / Math.cos(Math.asin(set));
  const eyeWF = eyeW * foreshort;
  const browY =
    cy + b * (eyeYn - (s.female ? 0.17 : 0.15) - (L.brows === 1 ? 0.02 : 0));
  // The nose.
  const noseLen =
    b * ([0.5, 0.53, 0.42, 0.48, 0.58, 0.42, 0.56][L.nose] * (1 - child * 0.3));
  const noseW =
    a *
    ([0.36, 0.36, 0.38, 0.48, 0.34, 0.32, 0.36][L.nose] * (1 - child * 0.15));
  const noseRoot = P(0, eyeYn);
  const noseBaseY = cy + b * eyeYn + noseLen;
  const tipDepth =
    [0.32, 0.36, 0.26, 0.3, 0.36, 0.24, 0.38][L.nose] * (1 - child * 0.35);
  const noseTip: Pt = [P(0, 0, tipDepth)[0], noseBaseY - b * 0.03];
  // The mouth.
  const mouthYn = (noseBaseY - cy) / b + (1 - (noseBaseY - cy) / b) * 0.36;
  const mouthW =
    a * ([0.7, 0.76, 0.88, 0.62, 0.7][L.mouth] * (1 - child * 0.15));
  const mouth = P(0, mouthYn, 0.1);
  const chin: Pt = [cx + a * 0.32, cy + b * 1.02 * chinDrop];
  // The ear sits behind the near cheek, from brow to nose.
  const earH = b * ([0.5, 0.56, 0.62, 0.6][L.ears] + child * 0.05);
  const ear: Pt = [cx - a * 1.02, cy + b * (eyeYn + 0.2)];
  const top = cy - b * (1.56 - child * 0.1);
  const skull = {
    cx: cx - a * 0.1,
    cy: cy - b * (0.5 + child * 0.12),
    rx: a * (1.13 + child * 0.1),
    ry: b * (0.98 + child * 0.32),
  };
  const ex = s.expression;
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
    hairY: cy - b * (0.98 - child * 0.08),
    top,
    jawN: outline[4],
    jawF: outline[9],
    neckBase: cy + b * (1.3 + (s.female ? 0.08 : 0) - child * 0.12),
    neckN: cx - a * (0.98 - child * 0.12) + (s.female ? 6 : 0),
    neckF: cx + a * (0.55 - child * 0.06) - (s.female ? 3 : 0),
    child,
    old,
    expr: {
      mouth:
        ex === "smile"
          ? 1.5
          : ex === "frown"
            ? -1.3
            : ex === "worried"
              ? -0.6
              : ex === "angry"
                ? -0.8
                : 0,
      browIn: ex === "angry" ? 1.4 : ex === "frown" ? 0.8 : 0,
      browUp: ex === "worried" ? 1.4 : ex === "smile" ? 0.2 : 0,
      squint: ex === "smile" ? 0.7 : ex === "angry" ? 0.6 : 0,
      cheek: ex === "smile" ? 1 : 0,
      tight: ex === "angry" ? 1 : ex === "worried" ? 0.5 : 0,
    },
  };
}
