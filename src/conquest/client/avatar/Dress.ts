// What a sitter wears, painted from the shoulders up: the coat, doublet,
// gown or mantle, and whatever lies at the throat (ruff, falling band,
// cravat, stock, bands, kerchief), in the cut of their years. Native dress
// follows what each people wore: hide and fringe, trade cloth and silver,
// woven mantles and huipils.

import { CLOTH_COLORS } from "../../engine/Appearance";
import type { SkinPalette } from "./Face";
import type { Head, Sitting } from "./Head";
import {
  Brush,
  ell,
  light,
  lum,
  mix,
  n,
  path,
  poly,
  type Pt,
  shade,
  smooth,
  stroke,
} from "./Svg";

export interface Dressed {
  /** Behind the neck (standing collars, the back of a hood). */
  under: string;
  /** The garment, over the neck and under the face. */
  over: string;
  /** Over the hair (collars and ornaments that lie on top). */
  top: string;
}

let gid = 0;

/** Shadow for cloth: whites go blue-grey, colours go brown-black. */
function cshade(c: string, t: number): string {
  return lum(c) > 0.72 ? mix(c, "#4f5868", t * 0.85) : shade(c, t);
}

function clight(c: string, t: number): string {
  return lum(c) > 0.72 ? mix(c, "#ffffff", t * 0.6) : light(c, t);
}

interface Body {
  y0: number;
  /** Throat: the centre front at the neck. */
  T: Pt;
  /** Centre front line's x at a height. */
  cf(y: number): number;
  /** Near and far neck sides at the base. */
  nN: Pt;
  nF: Pt;
  /** Near and far shoulder points. */
  Sn: Pt;
  Sf: Pt;
  sc: number;
}

function bodyOf(h: Head, s: Sitting): Body {
  const sc = (s.female ? 0.9 : 1) * (1 - h.child * 0.22);
  const y0 = h.neckBase;
  const T: Pt = [h.cx + 6 + h.a * 0.05, y0 + 2];
  return {
    y0,
    T,
    cf: (y) => T[0] + (y - T[1]) * 0.1,
    nN: [h.neckN + 1, y0 - 4],
    nF: [h.neckF + 3, y0 - 4],
    Sn: [h.cx - 86 * sc, y0 + 18 + (s.female ? 4 : 0)],
    Sf: [h.cx + 72 * sc, y0 + 16 + (s.female ? 4 : 0)],
    sc,
  };
}

/** The shoulders and chest, with a neckline running far side to near side. */
function torso(b: Body, neckline: Pt[]): Pt[] {
  const { sc, y0 } = b;
  return [
    b.nN,
    [b.nN[0] - 22 * sc, y0 + 3],
    b.Sn,
    [b.Sn[0] - 22 * sc, y0 + 44],
    [b.Sn[0] - 40 * sc, 310],
    [b.Sf[0] + 50 * sc, 310],
    [b.Sf[0] + 34 * sc, y0 + 52],
    b.Sf,
    [b.nF[0] + 16 * sc, y0 + 2],
    b.nF,
    ...neckline,
  ];
}

/** A gown cut low: the neckline runs from shoulder to shoulder, dipping to `low`. */
function lowTorso(b: Body, low: number, wide: number): Pt[] {
  const { sc, y0, T } = b;
  return [
    [b.nN[0] - 14 * sc * wide, y0 + 4 + wide * 3],
    [b.Sn[0] + 4, y0 + 20],
    [b.Sn[0] - 22 * sc, y0 + 44],
    [b.Sn[0] - 40 * sc, 310],
    [b.Sf[0] + 50 * sc, 310],
    [b.Sf[0] + 34 * sc, y0 + 52],
    [b.Sf[0] - 2, y0 + 20],
    [b.nF[0] + 12 * sc * wide, y0 + 4 + wide * 3],
    [T[0] + 10, y0 + low - 2],
    [T[0] - 10, y0 + low],
  ];
}

/** A painted piece of cloth: gradient, folds and a sheen. */
function cloth(
  pts: Pt[],
  c: string,
  s: Sitting,
  o: {
    folds?: Pt[][];
    sheen?: Pt[][];
    smoothness?: number;
    shine?: number;
  } = {},
): string {
  const id = `cl${gid++}`;
  const d = smooth(pts, true, o.smoothness ?? 0.3);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const parts = [
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x0)}" y1="${n(y0)}" x2="${n(x1)}" y2="${n(y1 * 0.6 + y0 * 0.4)}">
<stop offset="0" stop-color="${clight(c, 0.16)}"/><stop offset="0.4" stop-color="${c}"/><stop offset="1" stop-color="${cshade(c, 0.5)}"/></linearGradient>
<clipPath id="${id}c">${path(d, "")}</clipPath></defs>`,
    path(d, `fill="url(#${id})"`),
  ];
  const inner: string[] = [];
  for (const f of o.folds ?? [])
    inner.push(
      path(
        smooth(f, false),
        `fill="none" stroke="${cshade(c, 0.55)}" stroke-width="5" opacity="0.5"`,
      ),
    );
  for (const f of o.sheen ?? [])
    inner.push(
      path(
        smooth(f, false),
        `fill="none" stroke="${clight(c, o.shine ?? 0.35)}" stroke-width="4" opacity="0.55"`,
      ),
    );
  if (inner.length)
    parts.push(
      `<g clip-path="url(#${id}c)"><g filter="url(#soft3)">${inner.join("")}</g></g>`,
    );
  return `<g filter="url(#brush)">${parts.join("")}</g>`;
}

/** Fine white linen: collars, bands, kerchiefs. */
function linen(
  pts: Pt[],
  s: Sitting,
  o: { lace?: boolean; tone?: string; sm?: number } = {},
): string {
  const c = o.tone ?? "#eee8dc";
  const id = `ln${gid++}`;
  const d = smooth(pts, true, o.sm ?? 0.25);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  let lace = "";
  if (o.lace) {
    // Lace: a scalloped edge and the holes of the pattern.
    const br = new Brush(s.seed + gid);
    const holes: string[] = [];
    for (let i = 0; i < 40; i++) {
      const x =
        Math.min(...xs) + br.next() * (Math.max(...xs) - Math.min(...xs));
      const y =
        Math.min(...ys) + br.next() * (Math.max(...ys) - Math.min(...ys));
      holes.push(
        ell(
          x,
          y,
          br.range(0.6, 1.4),
          br.range(0.6, 1.2),
          `fill="#8a8f98" opacity="0.45"`,
        ),
      );
    }
    lace = `<g clip-path="url(#${id}c)">${holes.join("")}</g>`;
  }
  return `<g filter="url(#brush)"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${mix(c, "#ffffff", 0.4)}"/><stop offset="0.5" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, "#6a7484", 0.45)}"/></linearGradient>
<clipPath id="${id}c">${path(d, "")}</clipPath></defs>
${path(d, `fill="url(#${id})"`)}${lace}
${path(d, `fill="none" stroke="${mix(c, "#4a5262", 0.45)}" stroke-width="0.8" opacity="0.6"`)}</g>`;
}

/** Buttons down a line. */
function buttons(a: Pt, b: Pt, count: number, c: string, r = 1.8): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    out +=
      ell(x, y, r, r, `fill="${shade(c, 0.35)}"`) +
      ell(
        x - r * 0.3,
        y - r * 0.3,
        r * 0.5,
        r * 0.5,
        `fill="${light(c, 0.55)}"`,
      );
  }
  return out;
}

// ---------------------------------------------------------------- neckwear

function ruff(b: Body, h: Head, s: Sitting, big: number): string {
  // A millstone ruff: a thick ring of starched linen set in figure-of-eight
  // pleats, its edge a row of rounded folds.
  const cx = b.T[0] - 8;
  const cy = b.y0 - 8;
  const rx = h.a * (1.05 + big * 0.25);
  const ry = h.a * (0.34 + big * 0.07);
  const th = 6 + big * 4;
  const id = `rf${gid++}`;
  const edge = "#8b93a2";
  const count = Math.round(34 + big * 10);
  const folds: { t: number; x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    folds.push({ t, x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  // The back folds first, the front ones over them.
  folds.sort((p, q) => Math.sin(p.t) - Math.sin(q.t));
  const fr = ((Math.PI * rx) / count) * 1.25;
  let rim = "";
  for (const f of folds) {
    const front = Math.sin(f.t) > 0;
    // Each fold seen edge-on: a rounded tube of linen.
    rim += ell(
      f.x,
      f.y + (front ? th * 0.45 : 0),
      fr,
      front ? th * 0.7 : fr * 0.8,
      `fill="${front ? "#eeebe4" : "#d9dce2"}" stroke="${edge}" stroke-width="0.6"`,
      (f.t * 180) / Math.PI + 90,
    );
    if (front)
      rim += path(
        `M${n(f.x)} ${n(f.y + th * 0.05)}v${n(th * 0.8)}`,
        `stroke="${edge}" stroke-width="0.6" opacity="0.6"`,
      );
  }
  let pleats = "";
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    pleats += path(
      `M${n(cx + Math.cos(t) * rx * 0.45)} ${n(cy + Math.sin(t) * ry * 0.45)}L${n(cx + Math.cos(t) * rx * 0.94)} ${n(cy + Math.sin(t) * ry * 0.94)}`,
      `stroke="${edge}" stroke-width="0.8" opacity="0.45"`,
    );
  }
  return `<g filter="url(#brush)"><defs><radialGradient id="${id}" cx="0.42" cy="0.4" r="0.7"><stop offset="0" stop-color="#fbf9f4"/><stop offset="0.75" stop-color="#e7e5e0"/><stop offset="1" stop-color="#b9bfca"/></radialGradient></defs>
${ell(cx, cy + th, rx, ry, `fill="#9ea6b4"`)}
${ell(cx, cy, rx, ry, `fill="url(#${id})"`)}${pleats}
${ell(cx + 2, cy - ry * 0.22, rx * 0.42, ry * 0.45, `fill="#4a4e58" opacity="0.55" filter="url(#soft2)"`)}
${rim}</g>`;
}

function fallingBand(
  b: Body,
  h: Head,
  s: Sitting,
  o: { lace?: boolean; wide?: number; tassels?: boolean } = {},
): string {
  const w = (o.wide ?? 1) * h.a;
  const { T, y0 } = b;
  const pts: Pt[] = [
    [b.nN[0] + 2, y0 - 8],
    [T[0] - w * 1.05, y0 + 4],
    [T[0] - w * 1.0, y0 + 20 * (o.wide ?? 1)],
    [T[0] - 2, y0 + 26 * (o.wide ?? 1)],
    [T[0] + w * 0.75, y0 + 18 * (o.wide ?? 1)],
    [T[0] + w * 0.78, y0 + 2],
    [b.nF[0] - 1, y0 - 8],
    [T[0] + 2, y0 + 4],
  ];
  let out = linen(pts, s, { lace: o.lace });
  if (o.lace) {
    // A scalloped lace border along the bottom edge.
    let sc = "";
    const edge = [pts[1], pts[2], pts[3], pts[4], pts[5]];
    for (let i = 0; i < edge.length - 1; i++) {
      const [x1, y1] = edge[i];
      const [x2, y2] = edge[i + 1];
      const k = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 5));
      for (let j = 0; j < k; j++) {
        const x = x1 + ((x2 - x1) * (j + 0.5)) / k;
        const y = y1 + ((y2 - y1) * (j + 0.5)) / k;
        sc += ell(
          x,
          y,
          2.8,
          2.4,
          `fill="#f2eee6" stroke="#9aa1ad" stroke-width="0.5"`,
        );
      }
    }
    out += `<g filter="url(#brush)">${sc}</g>`;
  }
  if (o.tassels)
    out += `<g>${path(`M${n(T[0] - 2)} ${n(y0 + 8)}l-2 14M${n(T[0] + 1)} ${n(y0 + 8)}l2 14`, `stroke="#e8e2d6" stroke-width="1.2"`)}${ell(T[0] - 4, y0 + 23, 1.8, 2.6, `fill="#eee8dc"`)}${ell(T[0] + 3, y0 + 23, 1.8, 2.6, `fill="#eee8dc"`)}</g>`;
  return out;
}

function bands(b: Body, s: Sitting, len = 26): string {
  const { T, y0 } = b;
  return (
    linen(
      [
        [T[0] - 8, y0 - 2],
        [T[0] - 0.5, y0 - 2],
        [T[0] - 0.5, y0 + len],
        [T[0] - 9, y0 + len - 1],
      ],
      s,
      { sm: 0.05 },
    ) +
    linen(
      [
        [T[0] + 0.5, y0 - 2],
        [T[0] + 8, y0 - 2],
        [T[0] + 8.5, y0 + len - 1],
        [T[0] + 0.5, y0 + len],
      ],
      s,
      { sm: 0.05 },
    )
  );
}

function stock(b: Body, h: Head, s: Sitting): string {
  const { T, y0 } = b;
  return (
    linen(
      [
        [b.nN[0] + 3, y0 - 14],
        [T[0] - 2, y0 - 8],
        [b.nF[0] - 1, y0 - 13],
        [b.nF[0] + 1, y0 - 2],
        [T[0], y0 + 4],
        [b.nN[0] + 2, y0 - 2],
      ],
      s,
      { sm: 0.3 },
    ) + (h.child > 0.5 ? "" : "")
  );
}

function neckcloth(b: Body, s: Sitting, ends = 18, lace = false): string {
  const { T, y0 } = b;
  return (
    stock(b, { child: 0 } as Head, s) +
    linen(
      [
        [T[0] - 6, y0 - 1],
        [T[0] + 4, y0 - 2],
        [T[0] + 6, y0 + ends],
        [T[0] - 1, y0 + ends + 3],
        [T[0] - 7, y0 + ends - 2],
      ],
      s,
      { lace, sm: 0.35 },
    ) +
    ell(
      T[0],
      y0 + 1,
      4.5,
      3.4,
      `fill="#e4ded2" stroke="#9aa1ad" stroke-width="0.5"`,
    )
  );
}

function cravat(b: Body, s: Sitting): string {
  const { T, y0 } = b;
  return (
    stock(b, { child: 0 } as Head, s) +
    linen(
      [
        [T[0] - 7, y0],
        [T[0] + 7, y0],
        [T[0] + 9, y0 + 24],
        [T[0] + 11, y0 + 42],
        [T[0] - 1, y0 + 46],
        [T[0] - 11, y0 + 41],
        [T[0] - 8, y0 + 22],
      ],
      s,
      { lace: true, sm: 0.3 },
    ) +
    path(
      `M${n(T[0] - 10)} ${n(y0 + 30)}h${n(20)}M${n(T[0] - 10.5)} ${n(y0 + 36)}h${n(21)}`,
      `stroke="#9aa1ad" stroke-width="0.6" opacity="0.7"`,
    )
  );
}

function jabot(b: Body, s: Sitting, y1: number): string {
  const { y0 } = b;
  const x = b.cf(y0 + 10);
  const pts: Pt[] = [];
  for (let y = y0 + 4; y < y1; y += 5)
    pts.push([x - 4 - ((y - y0) % 10 === 0 ? 2 : 0), y]);
  const right: Pt[] = [];
  for (let y = y1; y > y0 + 4; y -= 5)
    right.push([x + 5 + ((y - y0) % 10 === 0 ? 2 : 0), y]);
  return linen([...pts, ...right], s, { sm: 0.4 });
}

function kerchief(
  b: Body,
  h: Head,
  s: Sitting,
  depth = 42,
  tone?: string,
): string {
  const { T, y0, sc } = b;
  // Draped round the neck, crossing at the breast and tucked in.
  const near: Pt[] = [
    [b.nN[0] + 1, y0 - 10],
    [b.nN[0] - 22 * sc, y0 + 2],
    [b.Sn[0] + 20 * sc, y0 + 22],
    [T[0] - 6, y0 + depth],
    [T[0] + 12, y0 + depth - 4],
    [T[0] - 2, y0 + 10],
    [b.nN[0] + 8, y0 - 2],
  ];
  const far: Pt[] = [
    [b.nF[0] - 1, y0 - 10],
    [b.nF[0] + 18 * sc, y0 + 1],
    [b.Sf[0] - 14 * sc, y0 + 20],
    [T[0] + 10, y0 + depth + 2],
    [T[0] - 4, y0 + depth - 2],
    [T[0] + 4, y0 + 8],
    [b.nF[0] - 6, y0 - 2],
  ];
  return (
    linen(far, s, { tone: tone ? mix(tone, "#000", 0.08) : "#e2ddd2" }) +
    linen(near, s, { tone }) +
    (h.child ? "" : "")
  );
}

// ---------------------------------------------------------------- garments

function colors(s: Sitting): [string, string, string] {
  const c = s.look.colors;
  const hex = (i: number) => CLOTH_COLORS[i]?.hex ?? CLOTH_COLORS[0].hex;
  return [hex(c[0]), hex(c[1]), hex(c[2])];
}

/** Standard folds and lights on a torso. */
function torsoFolds(b: Body): { folds: Pt[][]; sheen: Pt[][] } {
  const { y0, sc } = b;
  return {
    folds: [
      [
        [b.Sn[0] + 4, y0 + 22],
        [b.Sn[0] + 8, y0 + 60],
        [b.Sn[0] - 4, 300],
      ],
      [
        [b.Sf[0] - 10, y0 + 24],
        [b.Sf[0] - 4, y0 + 60],
        [b.Sf[0] + 4, 300],
      ],
      [
        [b.cf(y0 + 40) + 18 * sc, y0 + 40],
        [b.cf(y0 + 80) + 22 * sc, y0 + 90],
      ],
    ],
    sheen: [
      [
        [b.nN[0] - 10, y0 + 6],
        [b.Sn[0] + 6, y0 + 16],
        [b.Sn[0] - 16 * sc, y0 + 40],
      ],
      [
        [b.Sn[0] + 30 * sc, y0 + 40],
        [b.Sn[0] + 26 * sc, y0 + 90],
      ],
    ],
  };
}

/** A garment closed up to the neck. */
function closed(b: Body, h: Head): Pt[] {
  return torso(b, [
    [b.T[0] + 4, b.y0 + 2],
    [b.T[0] - 6, b.y0 + 2],
  ]);
}

function skinChest(
  b: Body,
  s: Sitting,
  sk: SkinPalette,
  neckDepth: number,
  wide = 1,
): string {
  // Bare shoulders and breast, modelled like the face.
  const { y0, sc } = b;
  const pts: Pt[] = [
    [b.nN[0] - 4, y0 - 12],
    [b.nN[0] - 30 * sc * wide, y0 + 2],
    [b.Sn[0] + 6, y0 + 16],
    [b.Sn[0] - 14, y0 + 40],
    [b.T[0], y0 + neckDepth + 30],
    [b.Sf[0] + 10, y0 + 40],
    [b.Sf[0] - 6, y0 + 15],
    [b.nF[0] + 24 * sc * wide, y0 + 1],
    [b.nF[0] + 4, y0 - 12],
  ];
  const id = `sc${gid++}`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="${sk.base}"/><stop offset="0.35" stop-color="${sk.lit}"/><stop offset="0.7" stop-color="${mix(sk.base, sk.shadow, 0.4)}"/><stop offset="1" stop-color="${sk.shadow}"/></linearGradient><clipPath id="${id}c">${path(smooth(pts), "")}</clipPath></defs>
${path(smooth(pts), `fill="url(#${id})"`)}
<g clip-path="url(#${id}c)" filter="url(#soft4)">
${ell(b.T[0] + 2, y0 + 2, 18, 8, `fill="${sk.shadow}" opacity="0.5"`)}
${path(
  smooth(
    [
      [b.nN[0] - 18, y0 + 12],
      [b.T[0] - 6, y0 + 16],
      [b.T[0] + 4, y0 + 15],
    ],
    false,
  ),
  `fill="none" stroke="${sk.shadow}" stroke-width="3" opacity="0.4"`,
)}
${path(
  smooth(
    [
      [b.T[0] + 10, y0 + 14],
      [b.nF[0] + 20, y0 + 12],
    ],
    false,
  ),
  `fill="none" stroke="${sk.shadow}" stroke-width="3" opacity="0.4"`,
)}
${ell(b.T[0] - 26 * sc, y0 + neckDepth + 10, 22, 14, `fill="${sk.lit}" opacity="0.35"`)}
${ell(b.Sf[0] + 4, y0 + 40, 20, 40, `fill="${sk.deep}" opacity="0.45"`)}
</g>`;
}

/** The look of each garment. */
function garment(h: Head, s: Sitting, sk: SkinPalette): Dressed {
  const b = bodyOf(h, s);
  const [c0, c1, c2] = colors(s);
  const { T, y0, sc } = b;
  const year = s.year;
  const f = torsoFolds(b);
  const out: Dressed = { under: "", over: "", top: "" };
  const shirt = "#ebe5d8";
  /** A coat open down the front over something else. */
  const openCoat = (
    inner: string,
    outer: string,
    gap: number,
    lapels?: string,
    button?: string,
  ) => {
    let o = cloth(closed(b, h), inner, s, {
      folds: [
        [
          [T[0] + 6, y0 + 30],
          [T[0] + 10, 300],
        ],
      ],
    });
    if (button)
      o += buttons(
        [b.cf(y0 + 14) + 2, y0 + 14],
        [b.cf(y0 + 90) + 3, y0 + 90],
        6,
        button,
        1.5,
      );
    const left: Pt[] = [
      b.nN,
      [b.nN[0] - 16 * sc, y0 + 4],
      b.Sn,
      [b.Sn[0] - 26 * sc, y0 + 48],
      [b.Sn[0] - 40 * sc, 310],
      [b.cf(300) - gap, 310],
      [b.cf(y0 + 40) - gap * 0.7, y0 + 40],
      [T[0] - 6, y0 + 2],
    ];
    const right: Pt[] = [
      [T[0] + 6, y0 + 2],
      [b.cf(y0 + 40) + gap * 0.6, y0 + 40],
      [b.cf(300) + gap * 0.8, 310],
      [b.Sf[0] + 50 * sc, 310],
      [b.Sf[0] + 34 * sc, y0 + 52],
      b.Sf,
      [b.nF[0] + 16 * sc, y0 + 2],
      b.nF,
    ];
    o += cloth(right, outer, s, { folds: [f.folds[1]] });
    o += cloth(left, outer, s, { folds: [f.folds[0]], sheen: f.sheen });
    if (lapels) {
      o += cloth(
        [
          [T[0] - 6, y0 + 4],
          [b.cf(y0 + 40) - gap * 0.7, y0 + 40],
          [b.cf(y0 + 100) - gap * 0.75, y0 + 100],
          [b.cf(y0 + 100) - gap * 0.75 - 13, y0 + 100],
          [b.cf(y0 + 30) - gap * 0.7 - 16, y0 + 24],
          [T[0] - 20, y0 + 2],
        ],
        lapels,
        s,
      );
      o += cloth(
        [
          [T[0] + 6, y0 + 4],
          [b.cf(y0 + 40) + gap * 0.6, y0 + 40],
          [b.cf(y0 + 100) + gap * 0.7, y0 + 100],
          [b.cf(y0 + 100) + gap * 0.7 + 10, y0 + 100],
          [b.cf(y0 + 30) + gap * 0.6 + 12, y0 + 24],
          [T[0] + 16, y0 + 2],
        ],
        cshade(lapels, 0.25),
        s,
      );
      if (button) {
        o += buttons(
          [b.cf(y0 + 34) - gap * 0.7 - 7, y0 + 34],
          [b.cf(y0 + 96) - gap * 0.75 - 7, y0 + 96],
          5,
          button,
          1.5,
        );
      }
    } else if (button) {
      o += buttons(
        [b.cf(y0 + 30) - gap * 0.7 - 4, y0 + 30],
        [b.cf(y0 + 110) - gap * 0.75 - 4, y0 + 110],
        5,
        button,
        1.7,
      );
    }
    return o;
  };
  switch (s.look.clothes) {
    // ---------------------------------------------------------------- men
    case "jerkin": {
      out.over =
        cloth(closed(b, h), c0, s, f) +
        path(
          `M${n(T[0])} ${n(y0 + 6)}L${n(b.cf(300))} 300`,
          `stroke="${shade(c0, 0.5)}" stroke-width="1.6" opacity="0.7"`,
        ) +
        buttons(
          [b.cf(y0 + 16), y0 + 16],
          [b.cf(y0 + 96), y0 + 96],
          6,
          mix(c0, "#3a2a1a", 0.4),
          1.4,
        );
      out.top =
        year < 1680 ? fallingBand(b, h, s, { wide: 0.7 }) : neckcloth(b, s, 12);
      break;
    }
    case "waistcoat": {
      out.over =
        cloth(closed(b, h), shirt, s, f) +
        cloth(
          [
            [b.Sn[0] + 18 * sc, y0 + 20],
            [T[0] - 4, y0 + 8],
            [b.cf(y0 + 30), y0 + 30],
            [b.cf(310), 310],
            [b.Sn[0] + 4 * sc, 310],
          ],
          c0,
          s,
          { sheen: [f.sheen[1]] },
        ) +
        cloth(
          [
            [b.cf(y0 + 30), y0 + 30],
            [T[0] + 4, y0 + 8],
            [b.Sf[0] - 14 * sc, y0 + 20],
            [b.Sf[0] - 2 * sc, 310],
            [b.cf(310), 310],
          ],
          cshade(c0, 0.15),
          s,
        ) +
        buttons(
          [b.cf(y0 + 36) - 3, y0 + 36],
          [b.cf(y0 + 100) - 3, y0 + 100],
          5,
          "#c7b07a",
          1.4,
        );
      out.top = neckcloth(b, s, 10);
      break;
    }
    case "doublet_ruff":
    case "doublet_band":
    case "doublet_lace":
    case "black_suit": {
      const black = s.look.clothes === "black_suit";
      out.over =
        cloth(closed(b, h), c0, s, f) +
        path(
          `M${n(T[0])} ${n(y0 + 6)}L${n(b.cf(300))} 300`,
          `stroke="${shade(c0, 0.5)}" stroke-width="1.4" opacity="0.6"`,
        ) +
        buttons(
          [b.cf(y0 + 18) + 1, y0 + 18],
          [b.cf(y0 + 100) + 1, y0 + 100],
          8,
          black ? "#2a2622" : mix(c2, "#d8b864", 0.5),
          1.5,
        );
      if (s.look.clothes === "doublet_lace") {
        // Slashes in the sleeves and a sash.
        out.over += path(
          `M${n(b.Sn[0] - 10)} ${n(y0 + 40)}l6 30M${n(b.Sn[0] - 2)} ${n(y0 + 38)}l6 30`,
          `stroke="${c1}" stroke-width="3" opacity="0.85" filter="url(#brush)"`,
        );
        out.top =
          fallingBand(b, h, s, { lace: true, wide: 1.25 }) + sash(b, c2, s);
      } else if (s.look.clothes === "doublet_ruff")
        out.top = ruff(b, h, s, s.female ? 0 : 0.6);
      else if (black)
        out.top =
          year < 1640
            ? ruff(b, h, s, 0.1)
            : year < 1680
              ? fallingBand(b, h, s, { wide: 0.75 })
              : bands(b, s);
      else out.top = fallingBand(b, h, s, { wide: 0.95, tassels: true });
      break;
    }
    case "golilla": {
      out.over =
        cloth(closed(b, h), c0, s, f) +
        buttons(
          [b.cf(y0 + 18), y0 + 18],
          [b.cf(y0 + 100), y0 + 100],
          8,
          "#2a2622",
          1.4,
        );
      out.top = linen(
        [
          [b.nN[0] - 10, y0 - 10],
          [T[0] - 6, y0 - 3],
          [b.nF[0] + 12, y0 - 10],
          [b.nF[0] + 10, y0 - 4],
          [T[0] - 4, y0 + 4],
          [b.nN[0] - 12, y0 - 3],
        ],
        s,
        { sm: 0.4 },
      );
      break;
    }
    case "plain_coat":
      out.over = openCoat(c1, c0, 8, undefined, mix(c0, "#c8b080", 0.4));
      out.top = year < 1720 ? neckcloth(b, s, 22) : neckcloth(b, s, 8);
      break;
    case "justaucorps":
      out.over = openCoat(c1, c0, 4, undefined, mix(c2, "#d8b864", 0.6));
      out.top = cravat(b, s);
      break;
    case "coat_stock":
      out.over =
        openCoat(c1, c0, 14, undefined, mix(c2, "#d8b864", 0.5)) +
        jabot(b, s, y0 + 34);
      out.top = stock(b, h, s);
      break;
    case "gown_bands": {
      out.over = cloth(closed(b, h), c0, s, {
        folds: [
          ...f.folds,
          [
            [b.Sn[0] + 20, y0 + 30],
            [b.Sn[0] + 22, 300],
          ],
          [
            [b.Sf[0] - 24, y0 + 30],
            [b.Sf[0] - 22, 300],
          ],
        ],
        sheen: f.sheen,
      });
      out.top =
        year < 1640
          ? ruff(b, h, s, 0)
          : year < 1690
            ? fallingBand(b, h, s, { wide: 0.8 })
            : bands(b, s);
      break;
    }
    case "cassock": {
      out.over =
        cloth(closed(b, h), c0, s, f) +
        buttons(
          [b.cf(y0 + 12), y0 + 12],
          [b.cf(y0 + 110), y0 + 110],
          11,
          "#2a2622",
          1.2,
        );
      out.top =
        linen(
          [
            [b.nN[0] + 2, y0 - 10],
            [b.nF[0] - 1, y0 - 10],
            [b.nF[0] + 1, y0 - 4],
            [b.nN[0] + 1, y0 - 3],
          ],
          s,
        ) + bands(b, s, 12);
      break;
    }
    case "friar": {
      // A habit and its hood lying round the shoulders.
      out.over = cloth(closed(b, h), c0, s, f);
      out.top = cloth(
        [
          [b.nN[0] - 6, y0 - 12],
          [b.Sn[0] + 4, y0 + 14],
          [b.Sn[0] + 10, y0 + 40],
          [T[0], y0 + 46],
          [b.Sf[0] - 6, y0 + 38],
          [b.Sf[0] - 4, y0 + 12],
          [b.nF[0] + 6, y0 - 10],
          [T[0], y0 + 10],
        ],
        shade(c0, 0.08),
        s,
        {
          folds: [
            [
              [b.nN[0] - 4, y0 + 10],
              [T[0], y0 + 34],
              [b.nF[0] + 10, y0 + 10],
            ],
          ],
        },
      );
      break;
    }
    case "breastplate": {
      const steel = "#8d939a";
      out.over = cloth(closed(b, h), c0, s, f);
      out.over += cloth(
        [
          [b.nN[0] - 12, y0 + 6],
          [b.Sn[0] + 16 * sc, y0 + 20],
          [b.Sn[0] + 4 * sc, 300],
          [b.Sf[0] - 4 * sc, 300],
          [b.Sf[0] - 12 * sc, y0 + 22],
          [b.nF[0] + 12, y0 + 6],
          [T[0], y0 + 14],
        ],
        steel,
        s,
        {
          sheen: [
            [
              [b.cf(y0 + 30) - 18, y0 + 30],
              [b.cf(y0 + 70) - 14, y0 + 80],
              [b.cf(110) - 10, 300],
            ],
            [
              [b.cf(y0 + 30) - 10, y0 + 30],
              [b.cf(300) - 4, 300],
            ],
          ],
          folds: [
            [
              [b.cf(y0 + 30) + 14, y0 + 30],
              [b.cf(300) + 20, 300],
            ],
          ],
          shine: 0.6,
        },
      );
      out.over += path(
        `M${n(b.cf(y0 + 14))} ${n(y0 + 14)}L${n(b.cf(300))} 300`,
        `stroke="${light(steel, 0.5)}" stroke-width="1.5" opacity="0.6"`,
      );
      out.top =
        cloth(
          [
            [b.nN[0] - 6, y0 - 6],
            [T[0] - 4, y0 + 2],
            [b.nF[0] + 8, y0 - 6],
            [b.nF[0] + 14, y0 + 10],
            [T[0], y0 + 22],
            [b.nN[0] - 12, y0 + 10],
          ],
          light(steel, 0.08),
          s,
          {
            shine: 0.6,
            sheen: [
              [
                [b.nN[0] - 4, y0 + 2],
                [T[0] - 8, y0 + 12],
              ],
            ],
          },
        ) +
        (year < 1650 ? fallingBand(b, h, s, { wide: 0.6 }) : "") +
        sash(b, c2, s);
      break;
    }
    case "buff_coat":
      out.over =
        cloth(closed(b, h), c0, s, f) +
        path(
          `M${n(T[0])} ${n(y0 + 6)}L${n(b.cf(300))} 300`,
          `stroke="${shade(c0, 0.45)}" stroke-width="1.6" opacity="0.7"`,
        ) +
        buttons(
          [b.cf(y0 + 16), y0 + 16],
          [b.cf(y0 + 90), y0 + 90],
          6,
          "#6a5232",
          1.4,
        );
      out.top =
        fallingBand(b, h, s, { wide: 0.85, tassels: true }) + sash(b, c2, s);
      break;
    case "regimental": {
      const early = year < 1725;
      out.over = early
        ? openCoat(c2, c0, 4, undefined, "#d9c98e")
        : openCoat(
            c2,
            c0,
            10,
            c1,
            s.culture === "english" ? "#d9c98e" : "#e8e4d8",
          );
      out.top = early ? neckcloth(b, s, 16) : stock(b, h, s);
      if (s.look.extras.includes("gorget") === false && !early)
        out.top += path(
          `M${n(b.Sn[0] + 14)} ${n(y0 + 18)}L${n(b.Sf[0] + 20)} 310`,
          `stroke="#ece6d6" stroke-width="7" opacity="0.92" filter="url(#brush)"`,
        );
      break;
    }
    case "sailor": {
      out.over = cloth(closed(b, h), c1, s, f) + openCoat(c1, c0, 22);
      out.top = cloth(
        [
          [b.nN[0] + 2, y0 - 10],
          [T[0] - 4, y0 - 4],
          [b.nF[0], y0 - 10],
          [b.nF[0] + 4, y0],
          [T[0] + 4, y0 + 14],
          [T[0] + 2, y0 + 30],
          [T[0] - 8, y0 + 32],
          [T[0] - 4, y0 + 12],
          [b.nN[0], y0 - 1],
        ],
        c2,
        s,
        {
          folds: [
            [
              [T[0] - 2, y0 + 10],
              [T[0] - 2, y0 + 28],
            ],
          ],
        },
      );
      break;
    }
    case "hunting_shirt": {
      out.over = cloth(closed(b, h), c0, s, f);
      // The fringed cape over the shoulders.
      const capePts: Pt[] = [
        [b.nN[0] - 2, y0 - 6],
        [b.Sn[0] + 2, y0 + 14],
        [b.Sn[0] - 8, y0 + 36],
        [T[0] - 10, y0 + 46],
        [T[0] + 14, y0 + 44],
        [b.Sf[0] + 4, y0 + 34],
        [b.Sf[0] - 2, y0 + 12],
        [b.nF[0] + 2, y0 - 6],
        [T[0] + 6, y0 + 22],
        [T[0], y0 + 24],
      ];
      out.top =
        cloth(capePts, mix(c0, "#ffffff", 0.06), s, {
          folds: [
            [
              [b.Sn[0] + 10, y0 + 22],
              [T[0] - 10, y0 + 40],
            ],
          ],
        }) +
        fringe([capePts[2], capePts[3], capePts[4], capePts[5]], c0, 7) +
        neckcloth(b, s, 6);
      break;
    }
    case "capote": {
      out.over =
        cloth(closed(b, h), c0, s, f) +
        path(
          smooth(
            [
              [b.Sn[0] - 20, y0 + 70],
              [T[0], y0 + 78],
              [b.Sf[0] + 24, y0 + 66],
            ],
            false,
          ),
          `fill="none" stroke="${c2}" stroke-width="7" opacity="0.9" filter="url(#brush)"`,
        ) +
        path(
          smooth(
            [
              [b.Sn[0] - 22, y0 + 82],
              [T[0], y0 + 90],
              [b.Sf[0] + 26, y0 + 78],
            ],
            false,
          ),
          `fill="none" stroke="${c2}" stroke-width="3" opacity="0.9" filter="url(#brush)"`,
        );
      // The hood, down at the back.
      out.under = cloth(
        [
          [b.nN[0] - 18, y0 - 26],
          [b.nN[0] + 10, y0 - 34],
          [b.nF[0] + 4, y0 - 20],
          [b.nF[0] + 12, y0 + 2],
          [b.nN[0] - 22, y0 + 4],
        ],
        shade(c0, 0.2),
        s,
      );
      out.top = neckcloth(b, s, 6);
      break;
    }
    case "buckskin": {
      out.over =
        cloth(closed(b, h), c0, s, f) +
        path(
          `M${n(T[0])} ${n(y0 + 6)}L${n(b.cf(300))} 300`,
          `stroke="${shade(c0, 0.45)}" stroke-width="1.4" opacity="0.6"`,
        ) +
        fringe([[b.nN[0] - 14, y0 + 4], b.Sn, [b.Sn[0] - 24, y0 + 46]], c0, 8);
      out.top = neckcloth(b, s, 6);
      break;
    }
    // ---------------------------------------------------------------- women
    case "bodice":
    case "short_gown":
    case "plain_gown": {
      const depth = s.look.clothes === "plain_gown" ? 22 : 30;
      out.over =
        skinChest(b, s, sk, depth - 20) +
        cloth(lowTorso(b, depth, 0.8), c0, s, f);
      if (s.look.clothes === "bodice") out.over += lacing(b, c1, depth);
      out.top = kerchief(b, h, s, depth + 14);
      break;
    }
    case "bodice_ruff": {
      out.over =
        cloth(closed(b, h), c0, s, f) + stomacher(b, c1, c2, s, y0 + 6);
      out.top =
        ruff(b, h, s, 0.3) + (s.look.extras.includes("pearls") ? "" : "");
      break;
    }
    case "gown_collar": {
      out.over = cloth(closed(b, h), c0, s, f);
      // A broad collar of white linen lying over the shoulders.
      out.top = linen(
        [
          [b.nN[0] + 2, y0 - 10],
          [b.nN[0] - 26 * sc, y0 - 2],
          [b.Sn[0] + 6, y0 + 18],
          [b.Sn[0] + 8, y0 + 40],
          [T[0], y0 + 50],
          [b.Sf[0] - 4, y0 + 40],
          [b.Sf[0] - 4, y0 + 16],
          [b.nF[0] + 20 * sc, y0 - 2],
          [b.nF[0], y0 - 10],
          [T[0], y0 - 2],
        ],
        s,
        { lace: year < 1650 && s.look.colors[0] !== 0 },
      );
      break;
    }
    case "satin":
    case "mantua":
    case "robe": {
      const low = s.look.clothes === "satin" ? 38 : 30;
      const wide = s.look.clothes === "satin" ? 1.5 : 1.1;
      const body = lowTorso(b, low, wide);
      const neckline: Pt[] = [body[0], body[9], body[8], body[7]];
      out.over =
        skinChest(b, s, sk, low - 12, wide) +
        cloth(body, c0, s, {
          ...f,
          shine: s.look.clothes === "satin" ? 0.55 : 0.35,
        });
      if (s.look.clothes !== "satin")
        out.over += stomacher(b, c1, c2, s, y0 + low - 2);
      // A frill of lace at the edge of the neckline.
      out.top = laceEdge(neckline, s);
      if (s.look.clothes === "robe") out.top += bows(b, c2, y0 + low + 8);
      break;
    }
    case "habit": {
      out.over = cloth(closed(b, h), c0, s, f);
      out.top = linen(
        [
          [b.nN[0] - 6, y0 - 26],
          [b.nF[0] + 8, y0 - 26],
          [b.nF[0] + 24, y0 + 10],
          [T[0], y0 + 40],
          [b.nN[0] - 28, y0 + 12],
        ],
        s,
      );
      break;
    }
    // ---------------------------------------------------------------- the native peoples
    case "n_mantle":
    case "n_matchcoat":
    case "n_wrap": {
      // Bare shoulders and a mantle over the near shoulder.
      const mantle = s.look.clothes === "n_matchcoat" ? c0 : c0;
      out.over =
        skinChest(b, s, sk, 60, 1.6) +
        cloth(
          [
            [b.nN[0] - 2, y0 - 6],
            [b.nN[0] - 20 * sc, y0 + 2],
            b.Sn,
            [b.Sn[0] - 26 * sc, y0 + 48],
            [b.Sn[0] - 40 * sc, 310],
            [b.Sf[0] + 50 * sc, 310],
            [b.Sf[0] + 26 * sc, y0 + 80],
            [T[0] + 10, y0 + 60],
            [T[0] - 4, y0 + 26],
          ],
          mantle,
          s,
          {
            folds: [
              [
                [b.Sn[0] + 4, y0 + 30],
                [T[0], y0 + 90],
              ],
              [
                [T[0] - 10, y0 + 40],
                [b.Sf[0], 300],
              ],
            ],
            sheen: [f.sheen[0]],
          },
        );
      if (s.look.clothes === "n_matchcoat")
        out.over += path(
          smooth(
            [
              [b.nN[0] - 2, y0 - 4],
              [T[0] - 4, y0 + 26],
              [T[0] + 10, y0 + 60],
              [b.Sf[0] + 26 * sc, y0 + 80],
            ],
            false,
          ),
          `fill="none" stroke="${c2}" stroke-width="4" opacity="0.9" filter="url(#brush)"`,
        );
      else
        out.over += fringe(
          [
            [T[0] - 4, y0 + 26],
            [T[0] + 10, y0 + 60],
            [b.Sf[0] + 26 * sc, y0 + 80],
          ],
          c0,
          7,
        );
      if (s.female)
        out.over += cloth(
          [
            [b.Sf[0] - 6, y0 + 22],
            [b.Sf[0] + 40, y0 + 60],
            [b.Sf[0] + 50, 310],
            [T[0] + 20, 310],
            [T[0] + 16, y0 + 70],
          ],
          shade(c0, 0.1),
          s,
        );
      break;
    }
    case "n_hide_shirt":
    case "n_hide_dress": {
      out.over = cloth(
        torso(b, [
          [b.nF[0] + 4, y0 + 2],
          [T[0] + 4, y0 + 12],
          [T[0] - 6, y0 + 12],
          [b.nN[0] - 2, y0 + 2],
        ]),
        c0,
        s,
        f,
      );
      // A yoke, worked with quills or beads, with fringe below it.
      const yoke: Pt[] = [
        [b.Sn[0] - 10, y0 + 40],
        [T[0] - 20, y0 + 46],
        [T[0] + 20, y0 + 44],
        [b.Sf[0] + 14, y0 + 38],
      ];
      out.over +=
        path(
          smooth(yoke, false),
          `fill="none" stroke="${c2}" stroke-width="4" opacity="0.9" filter="url(#brush)"`,
        ) +
        beadBand(
          yoke.map(([x, y]): Pt => [x, y + 3]),
          c2,
          s,
        ) +
        fringe(
          yoke.map(([x, y]): Pt => [x, y + 4]),
          c0,
          10,
        );
      if (!s.female)
        out.over += path(
          smooth(
            [
              [b.Sn[0] + 2, y0 + 16],
              [b.Sn[0] - 22, y0 + 50],
            ],
            false,
          ),
          `fill="none" stroke="${c2}" stroke-width="5" opacity="0.85" filter="url(#brush)"`,
        );
      break;
    }
    case "n_trade_shirt":
    case "n_blouse": {
      out.over =
        cloth(
          torso(b, [
            [b.nF[0] + 4, y0 + 2],
            [T[0] + 4, y0 + 18],
            [T[0] - 4, y0 + 18],
            [b.nN[0] - 2, y0 + 2],
          ]),
          c0,
          s,
          f,
        ) + calico(b, c0, s);
      // Silver brooches.
      for (let i = 0; i < (s.female ? 9 : 4); i++) {
        const x = T[0] - 34 + (i % 5) * 16 + (i >= 5 ? 8 : 0);
        const y = y0 + 28 + (i >= 5 ? 16 : 0) + Math.abs((i % 5) - 2) * 2;
        out.over +=
          ell(
            x,
            y,
            3.2,
            3.2,
            `fill="none" stroke="#d9dde2" stroke-width="1.6"`,
          ) + ell(x - 1, y - 1, 1, 1, `fill="#ffffff" opacity="0.8"`);
      }
      // The ruffled collar of the shirt.
      out.top = laceEdge(
        [
          [b.nN[0] - 2, y0 - 2],
          [T[0] - 4, y0 + 16],
          [T[0] + 4, y0 + 16],
          [b.nF[0] + 4, y0],
        ],
        s,
        c0,
      );
      // A matchcoat (a trade blanket) over the near shoulder and round the back.
      {
        const mc: Pt[] = [
          [b.nN[0] - 4, y0 - 6],
          [b.nN[0] - 22 * sc, y0 + 2],
          b.Sn,
          [b.Sn[0] - 22 * sc, y0 + 44],
          [b.Sn[0] - 40 * sc, 310],
          [b.cf(300) + 6, 310],
          [b.cf(y0 + 70) + 2, y0 + 70],
          [T[0] - 10, y0 + 26],
          [b.nN[0] + 6, y0 + 2],
        ];
        out.top +=
          cloth(mc, c1, s, {
            folds: [
              [
                [b.Sn[0] + 8, y0 + 26],
                [b.cf(200) - 16, 300],
              ],
              [
                [b.nN[0] - 10, y0 + 10],
                [b.Sn[0] - 14, 300],
              ],
            ],
            sheen: [f.sheen[0]],
          }) +
          path(
            smooth(
              [
                [b.nN[0] + 4, y0 + 1],
                [T[0] - 10, y0 + 26],
                [b.cf(y0 + 70) + 2, y0 + 70],
                [b.cf(300) + 6, 310],
              ],
              false,
            ),
            `fill="none" stroke="${c2}" stroke-width="4" opacity="0.9" filter="url(#brush)"`,
          );
      }
      break;
    }
    case "n_coat":
      out.over =
        openCoat(c1, c0, 12, undefined, "#d8d4c8") + calico(b, c1, s, true);
      out.top = laceEdge(
        [
          [b.nN[0] + 2, y0 - 6],
          [T[0] - 4, y0 + 10],
          [T[0] + 4, y0 + 10],
          [b.nF[0] + 2, y0 - 6],
        ],
        s,
        c1,
      );
      break;
    case "n_fur_robe": {
      out.over =
        cloth(closed(b, h), c0, s, f) +
        fur(
          torso(b, [
            [b.nF[0] + 2, y0],
            [T[0], y0 + 8],
            [b.nN[0], y0],
          ]),
          c0,
          s,
        );
      break;
    }
    case "n_tilma": {
      out.over = cloth(
        torso(b, [
          [b.nF[0] + 4, y0 + 2],
          [T[0] + 4, y0 + 14],
          [T[0] - 4, y0 + 14],
          [b.nN[0] - 2, y0 + 2],
        ]),
        c0,
        s,
        f,
      );
      // The mantle, knotted on the near shoulder.
      const k: Pt = [b.Sn[0] + 18 * sc, y0 + 22];
      out.top =
        cloth(
          [
            [k[0] - 6, k[1] - 6],
            [b.Sn[0] - 4, y0 + 30],
            [b.Sn[0] - 40 * sc, 310],
            [b.Sf[0] + 50 * sc, 310],
            [b.Sf[0] + 24, y0 + 60],
            [T[0] + 10, y0 + 48],
            [k[0] + 10, k[1] + 4],
          ],
          c1,
          s,
          {
            folds: [
              [
                [k[0], k[1] + 10],
                [T[0], 300],
              ],
              [
                [k[0] - 6, k[1] + 10],
                [b.Sn[0] - 20, 300],
              ],
            ],
          },
        ) +
        path(
          smooth(
            [
              [k[0] + 10, k[1] + 4],
              [T[0] + 10, y0 + 48],
              [b.Sf[0] + 24, y0 + 60],
            ],
            false,
          ),
          `fill="none" stroke="${c2}" stroke-width="4" opacity="0.85" filter="url(#brush)"`,
        ) +
        ell(k[0], k[1], 7, 6, `fill="${shade(c1, 0.15)}" filter="url(#brush)"`);
      break;
    }
    case "n_blanket": {
      out.over = cloth(closed(b, h), c0, s, f);
      const pts: Pt[] = [
        [b.nN[0] - 6, y0 - 2],
        [b.Sn[0] + 4, y0 + 14],
        [b.Sn[0] - 40 * sc, 310],
        [b.Sf[0] + 50 * sc, 310],
        [b.Sf[0], y0 + 14],
        [b.nF[0] + 10, y0 - 2],
        [T[0] + 10, y0 + 40],
        [T[0] - 6, y0 + 40],
      ];
      out.top =
        cloth(pts, c1, s, {
          folds: [
            [
              [b.Sn[0] + 8, y0 + 30],
              [b.Sn[0], 300],
            ],
          ],
        }) + stripes(pts, c2, y0 + 50, s);
      break;
    }
    case "n_cedar": {
      out.over = cloth(closed(b, h), c0, s, f);
      const pts: Pt[] = [
        [b.nN[0] - 6, y0 - 4],
        [b.Sn[0], y0 + 14],
        [b.Sn[0] - 22, y0 + 70],
        [T[0], y0 + 80],
        [b.Sf[0] + 22, y0 + 66],
        [b.Sf[0], y0 + 12],
        [b.nF[0] + 8, y0 - 4],
        [T[0], y0 + 6],
      ];
      out.top =
        cloth(pts, mix(c0, "#000", 0.05), s) +
        weave(pts, c0, s) +
        path(
          smooth(
            [
              [b.Sn[0] - 14, y0 + 50],
              [T[0], y0 + 62],
              [b.Sf[0] + 14, y0 + 48],
            ],
            false,
          ),
          `fill="none" stroke="${c2}" stroke-width="5" opacity="0.8" filter="url(#brush)"`,
        ) +
        path(
          smooth(
            [
              [b.Sn[0] - 17, y0 + 58],
              [T[0], y0 + 70],
              [b.Sf[0] + 18, y0 + 56],
            ],
            false,
          ),
          `fill="none" stroke="${c1}" stroke-width="3" opacity="0.8" filter="url(#brush)"`,
        ) +
        fringe([pts[2], pts[3], pts[4]], c0, 12);
      break;
    }
    case "n_huipil": {
      out.over = cloth(
        torso(b, [
          [b.nF[0] + 8, y0 + 4],
          [T[0] + 10, y0 + 18],
          [T[0] - 10, y0 + 18],
          [b.nN[0] - 6, y0 + 4],
        ]),
        c0,
        s,
        f,
      );
      // The embroidered yoke round the neck.
      const ring: Pt[] = [
        [b.nN[0] - 22, y0 + 2],
        [T[0] - 16, y0 + 30],
        [T[0] + 16, y0 + 30],
        [b.nF[0] + 22, y0 + 2],
      ];
      out.over += embroidery(ring, c1, c2, s);
      out.over += embroidery(
        [
          [b.Sn[0] - 4, y0 + 30],
          [b.Sn[0] - 18, y0 + 60],
        ],
        c2,
        c1,
        s,
      );
      out.over += embroidery(
        [
          [b.Sf[0] + 2, y0 + 30],
          [b.Sf[0] + 14, y0 + 60],
        ],
        c2,
        c1,
        s,
      );
      out.over = skinChest(b, s, sk, -18, 0.6) + out.over;
      break;
    }
    case "n_manta": {
      // Over the near shoulder, the far one bare.
      out.over =
        skinChest(b, s, sk, 30, 1.6) +
        cloth(
          [
            [b.nN[0] - 2, y0 - 4],
            [b.nN[0] - 20 * sc, y0 + 2],
            b.Sn,
            [b.Sn[0] - 26 * sc, y0 + 48],
            [b.Sn[0] - 40 * sc, 310],
            [b.Sf[0] + 50 * sc, 310],
            [b.Sf[0] + 30, y0 + 60],
            [T[0] + 16, y0 + 40],
            [T[0] - 2, y0 + 16],
          ],
          c0,
          s,
          f,
        ) +
        path(
          smooth(
            [
              [b.nN[0] - 2, y0 - 2],
              [T[0] - 2, y0 + 16],
              [T[0] + 16, y0 + 40],
              [b.Sf[0] + 30, y0 + 60],
            ],
            false,
          ),
          `fill="none" stroke="${c1}" stroke-width="4" opacity="0.85" filter="url(#brush)"`,
        );
      break;
    }
    default:
      out.over = cloth(closed(b, h), c0, s, f);
      out.top = neckcloth(b, s, 10);
  }
  return out;
}

function sash(b: Body, c: string, s: Sitting): string {
  const { y0, sc } = b;
  return cloth(
    [
      [b.Sn[0] + 12 * sc, y0 + 14],
      [b.Sn[0] + 26 * sc, y0 + 11],
      [b.Sf[0] + 46 * sc, 266],
      [b.Sf[0] + 36 * sc, 300],
      [b.Sf[0] + 22 * sc, 300],
    ],
    c,
    s,
    {
      folds: [
        [
          [b.Sn[0] + 20 * sc, y0 + 20],
          [b.Sf[0] + 30 * sc, 290],
        ],
      ],
      sheen: [
        [
          [b.Sn[0] + 26 * sc, y0 + 14],
          [b.Sf[0] + 44 * sc, 270],
        ],
      ],
    },
  );
}

function stomacher(
  b: Body,
  c1: string,
  c2: string,
  s: Sitting,
  top: number,
): string {
  const x = b.cf(top);
  const pts: Pt[] = [
    [x - 18, top],
    [x + 18, top],
    [b.cf(300) + 5, 300],
    [b.cf(300) - 3, 300],
  ];
  let deco = "";
  for (let y = top + 10; y < 290; y += 14) {
    const w = 14 * (1 - (y - top) / 300);
    deco += path(
      `M${n(b.cf(y) - w)} ${n(y)}q${n(w)} ${n(4)} ${n(w * 2)} 0`,
      `fill="none" stroke="${c2}" stroke-width="2" opacity="0.8"`,
    );
  }
  return (
    cloth(pts, c1, s, { smoothness: 0.05 }) +
    `<g filter="url(#brush)">${deco}</g>`
  );
}

function bows(b: Body, c: string, top: number): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    const y = top + i * 14;
    const x = b.cf(y);
    const w = 11 - i * 1.5;
    out +=
      path(
        `M${n(x)} ${n(y)}l${n(-w)} ${n(-4)}l0 ${n(8)}zM${n(x)} ${n(y)}l${n(w)} ${n(-4)}l0 ${n(8)}z`,
        `fill="${c}" stroke="${shade(c, 0.4)}" stroke-width="0.6"`,
      ) + ell(x, y, 2.2, 2.2, `fill="${shade(c, 0.2)}"`);
  }
  return `<g filter="url(#brush)">${out}</g>`;
}

function lacing(b: Body, c: string, top: number): string {
  let out = "";
  for (let y = b.y0 + top + 8; y < 300; y += 9) {
    const x = b.cf(y);
    out += path(
      `M${n(x - 6)} ${n(y)}L${n(x + 6)} ${n(y + 9)}M${n(x + 6)} ${n(y)}L${n(x - 6)} ${n(y + 9)}`,
      `stroke="${c}" stroke-width="1.1" opacity="0.8"`,
    );
  }
  return out;
}

/** A band of lace along an edge, scalloped, lying toward `up` (above it, by default). */
function laceEdge(edge: Pt[], s: Sitting, tone = "#efe9dd", w = 6): string {
  // Sample the edge every few pixels.
  const pts: Pt[] = [];
  for (let i = 0; i < edge.length - 1; i++) {
    const [x1, y1] = edge[i];
    const [x2, y2] = edge[i + 1];
    const k = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 3.2));
    for (let j = 0; j < k; j++)
      pts.push([x1 + ((x2 - x1) * j) / k, y1 + ((y2 - y1) * j) / k]);
  }
  pts.push(edge[edge.length - 1]);
  const outer: Pt[] = [];
  const holes: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // The lace lies upward, over the cloth's edge.
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const bump = i % 2 ? w + 1.6 : w - 0.6;
    outer.push([pts[i][0] + nx * bump, pts[i][1] + ny * bump]);
    if (i % 2 === 0)
      holes.push(
        ell(
          pts[i][0] + nx * w * 0.5,
          pts[i][1] + ny * w * 0.5,
          0.9,
          0.9,
          `fill="#7c8492" opacity="0.5"`,
        ),
      );
  }
  const d = smooth([...pts, ...outer.reverse()], true, 0.3);
  const light = mix(tone, "#ffffff", 0.35);
  void s;
  return `<g filter="url(#brush)">${path(d, `fill="${light}" opacity="0.88"`)}${holes.join("")}${path(smooth(outer.slice().reverse(), false, 0.3), `fill="none" stroke="${mix(tone, "#5a6272", 0.45)}" stroke-width="0.5" opacity="0.7"`)}</g>`;
}

function fringe(edge: Pt[], c: string, len: number): string {
  let out = "";
  for (let i = 0; i < edge.length - 1; i++) {
    const [x1, y1] = edge[i];
    const [x2, y2] = edge[i + 1];
    const k = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 2.6));
    for (let j = 0; j < k; j++) {
      const x = x1 + ((x2 - x1) * j) / k;
      const y = y1 + ((y2 - y1) * j) / k;
      out += path(
        `M${n(x)} ${n(y)}l${n(0.8)} ${n(len)}`,
        `stroke="${j % 2 ? shade(c, 0.25) : light(c, 0.1)}" stroke-width="1.3" stroke-linecap="round"`,
      );
    }
  }
  return `<g filter="url(#brush)">${out}</g>`;
}

function beadBand(edge: Pt[], c: string, s: Sitting): string {
  let out = "";
  const alt = ["#f1ece0", "#2b4f7a", c];
  let k = 0;
  for (let i = 0; i < edge.length - 1; i++) {
    const [x1, y1] = edge[i];
    const [x2, y2] = edge[i + 1];
    const steps = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 3));
    for (let j = 0; j < steps; j++) {
      const x = x1 + ((x2 - x1) * j) / steps;
      const y = y1 + ((y2 - y1) * j) / steps;
      out += ell(
        x,
        y,
        1.4,
        1.4,
        `fill="${alt[Math.floor(k++ / 3) % alt.length]}"`,
      );
    }
  }
  void s;
  return `<g filter="url(#brush)">${out}</g>`;
}

function calico(b: Body, c: string, s: Sitting, small = false): string {
  // A small printed pattern on trade cloth.
  const br = new Brush(s.seed + 5);
  let out = "";
  const dot = lum(c) > 0.6 ? "#9a3a2e" : "#e8e0cc";
  for (let i = 0; i < (small ? 20 : 60); i++) {
    const x = br.range(b.Sn[0] - 20, b.Sf[0] + 30);
    const y = br.range(b.y0 + 10, 300);
    out += ell(x, y, 1, 1, `fill="${dot}" opacity="0.45"`);
  }
  return `<g>${out}</g>`;
}

function fur(pts: Pt[], c: string, s: Sitting): string {
  const br = new Brush(s.seed + 15);
  const id = `fr${gid++}`;
  let out = "";
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let i = 0; i < 160; i++) {
    const x = br.range(Math.min(...xs), Math.max(...xs));
    const y = br.range(Math.min(...ys), Math.max(...ys));
    out += path(
      `M${n(x)} ${n(y)}l${n(br.range(-2, 2))} ${n(br.range(4, 8))}`,
      `stroke="${br.next() < 0.5 ? light(c, 0.3) : shade(c, 0.4)}" stroke-width="1.2" opacity="0.5"`,
    );
  }
  return `<defs><clipPath id="${id}">${path(smooth(pts), "")}</clipPath></defs><g clip-path="url(#${id})" filter="url(#brush)">${out}</g>`;
}

function weave(pts: Pt[], c: string, s: Sitting): string {
  const id = `wv${gid++}`;
  let out = "";
  for (let y = 180; y < 300; y += 4)
    out += path(
      `M0 ${y}H240`,
      `stroke="${shade(c, 0.3)}" stroke-width="0.8" opacity="0.4"`,
    );
  for (let x = 0; x < 240; x += 6)
    out += path(
      `M${x} 180V300`,
      `stroke="${light(c, 0.2)}" stroke-width="0.6" opacity="0.25"`,
    );
  void s;
  return `<defs><clipPath id="${id}">${path(smooth(pts), "")}</clipPath></defs><g clip-path="url(#${id})">${out}</g>`;
}

function stripes(pts: Pt[], c: string, y: number, s: Sitting): string {
  const id = `st${gid++}`;
  void s;
  return `<defs><clipPath id="${id}">${path(smooth(pts), "")}</clipPath></defs><g clip-path="url(#${id})" filter="url(#brush)">${path(`M0 ${n(y)}H240`, `stroke="${c}" stroke-width="6"`)}${path(`M0 ${n(y + 10)}H240`, `stroke="${c}" stroke-width="2.5"`)}${path(`M0 ${n(y + 30)}H240`, `stroke="${shade(c, 0.3)}" stroke-width="5"`)}</g>`;
}

function embroidery(edge: Pt[], c1: string, c2: string, s: Sitting): string {
  // Bands of small diamonds and steps, as woven and embroidered on huipils.
  let out = "";
  let k = 0;
  for (let i = 0; i < edge.length - 1; i++) {
    const [x1, y1] = edge[i];
    const [x2, y2] = edge[i + 1];
    const steps = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 6));
    for (let j = 0; j < steps; j++) {
      const x = x1 + ((x2 - x1) * j) / steps;
      const y = y1 + ((y2 - y1) * j) / steps;
      const col = k++ % 2 ? c1 : c2;
      out += path(
        `M${n(x)} ${n(y - 4)}l3.5 4l-3.5 4l-3.5 -4z`,
        `fill="${col}"`,
      );
      out += ell(x + 3, y + 6, 1.1, 1.1, `fill="${c2}"`);
    }
  }
  void s;
  return `<g filter="url(#brush)">${stroke(edge, 14, `fill="${mix(c1, "#000000", 0.1)}" opacity="0.25"`, [1, 1])}${out}</g>`;
}

export function paintDress(h: Head, s: Sitting, sk: SkinPalette): Dressed {
  gid = 0;
  return garment(h, s, sk);
}

void poly;
