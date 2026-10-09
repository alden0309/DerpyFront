// Hair, wigs and beards, painted as masses: a dark underlayer, a sheen where
// the light falls, and strands or curls brushed over them following the
// way the hair is combed. Each style has a part that falls behind the head
// and shoulders and a part that sits over the face's edges.

import { isWig } from "../../engine/Appearance";
import { hairTone, type SkinPalette } from "./Face";
import type { Head, Sitting } from "./Head";
import {
  Brush,
  ell,
  light,
  lum,
  mix,
  n,
  op,
  path,
  type Pt,
  shade,
  smooth,
  stroke,
} from "./Svg";

const POWDER = "#d8d3c8";

/** A wig's colour: powdered, or the wearer's own shade. */
function hairColor(s: Sitting): string {
  const h = s.look.hair;
  if (isWig(h) && h !== "full_wig") return POWDER;
  if (h === "powdered") return mix(POWDER, hairTone(s), 0.15);
  if (h === "full_wig") {
    // Wigs were dark or fair, never grey with age.
    const base = hairTone({ ...s, age: 30 });
    return base;
  }
  return hairTone(s);
}

let uid = 0;

/** Start a new portrait: ids and brushwork from the beginning. */
export function beginHair(): void {
  uid = 0;
}

interface MassOpts {
  /** Where the strands are combed from. */
  from?: Pt[];
  /** Strands run side by side from one line to another. */
  flows?: [Pt[], Pt[]][];
  /** Strands, or curls (for wigs and curly heads). */
  curls?: number;
  strands?: number;
  /** Where the light falls on it. */
  sheen?: Pt;
  sheenR?: number;
  /** Strand thickness. */
  w?: number;
  /** Wavy strands. */
  wave?: number;
}

/** A point part way along a polyline (0 to 1). */
function along(line: Pt[], t: number): Pt {
  if (line.length === 1) return line[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const l = Math.hypot(
      line[i + 1][0] - line[i][0],
      line[i + 1][1] - line[i][1],
    );
    segs.push(l);
    total += l;
  }
  let d = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [
        line[i][0] + (line[i + 1][0] - line[i][0]) * f,
        line[i][1] + (line[i + 1][1] - line[i][1]) * f,
      ];
    }
    d -= segs[i];
  }
  return line[line.length - 1];
}

/** Inside a polygon. */
function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      c = !c;
  }
  return c;
}

function bbox(pts: Pt[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** Points along a polygon's edge. */
function edgePoints(pts: Pt[], count: number, br: Brush): Pt[] {
  const segs: [Pt, Pt, number][] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push([a, b, l]);
    total += l;
  }
  const out: Pt[] = [];
  for (let k = 0; k < count; k++) {
    let d = br.next() * total;
    for (const [a, b, l] of segs) {
      if (d <= l) {
        const t = d / l;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      d -= l;
    }
  }
  return out;
}

/** A painted mass of hair. */
function mass(pts: Pt[], color: string, s: Sitting, o: MassOpts = {}): string {
  const id = `hm${uid++}`;
  const br = new Brush(s.seed * 13 + uid * 7);
  const d = smooth(pts, true, 0.45);
  const [x0, y0, x1, y1] = bbox(pts);
  const lit = light(color, lum(color) > 0.6 ? 0.25 : 0.32);
  const dark = shade(color, lum(color) > 0.6 ? 0.42 : 0.55);
  const sx = o.sheen?.[0] ?? x0 + (x1 - x0) * 0.35;
  const sy = o.sheen?.[1] ?? y0 + (y1 - y0) * 0.25;
  const full = s.detail === "full";
  const parts: string[] = [];
  parts.push(`<defs><clipPath id="${id}c">${path(d, "")}</clipPath>
<radialGradient id="${id}g" gradientUnits="userSpaceOnUse" cx="${n(sx)}" cy="${n(sy)}" r="${n(Math.max(x1 - x0, y1 - y0) * 0.85)}">
<stop offset="0" stop-color="${mix(color, lit, 0.5)}"/><stop offset="0.4" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>`);
  parts.push(path(d, `fill="url(#${id}g)"`));
  const inner: string[] = [];
  // Strands, side by side from one line to another (or out from a point).
  const count = Math.round((o.strands ?? 36) * (full ? 1.6 : 0.5));
  if (count > 0) {
    const from = o.from ?? [[sx, y0 + 2]];
    const f0 = from[0];
    const flows = o.flows;
    const ends = flows
      ? []
      : edgePoints(pts, count, br).sort(
          (p, q) =>
            Math.atan2(p[1] - f0[1], p[0] - f0[0]) -
            Math.atan2(q[1] - f0[1], q[0] - f0[0]),
        );
    const bendAll = br.range(-0.08, 0.08);
    for (let i = 0; i < count; i++) {
      let a: Pt;
      let b: Pt;
      if (flows) {
        const [start, end] = flows[i % flows.length];
        const t = br.next();
        a = along(start, t);
        b = along(end, Math.min(1, Math.max(0, t + br.range(-0.04, 0.04))));
        a = [a[0] + br.range(-1, 1), a[1] + br.range(-1, 1)];
      } else {
        const f = from[Math.floor((i / count) * from.length)];
        a = [f[0] + br.range(-2, 2), f[1] + br.range(-1.5, 1.5)];
        b = ends[i];
      }
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const bend =
        (bendAll + br.range(-0.03, 0.03)) * len +
        (o.wave ?? 0) * br.range(-1, 1);
      const c: Pt = [
        mx + ((b[1] - a[1]) / len) * bend,
        my - ((b[0] - a[0]) / len) * bend,
      ];
      const tone = br.next() < 0.5 ? lit : dark;
      const alpha = br.range(0.12, 0.32);
      inner.push(
        path(
          `M${n(a[0])} ${n(a[1])}Q${n(c[0])} ${n(c[1])} ${n(b[0])} ${n(b[1])}`,
          `fill="none" stroke="${tone}" stroke-width="${n((o.w ?? 1) * br.range(0.5, 1.1))}" opacity="${op(alpha)}"`,
        ),
      );
    }
  }
  // Curls: little arcs, light above and dark below.
  const curls = Math.round((o.curls ?? 0) * (full ? 1 : 0.45));
  for (let i = 0, tries = 0; i < curls && tries < curls * 6; tries++) {
    const p: Pt = [br.range(x0, x1), br.range(y0, y1)];
    if (!inside(p, pts)) continue;
    i++;
    const r = br.range(2.2, 4.4);
    inner.push(
      path(
        `M${n(p[0] - r)} ${n(p[1])}a${n(r)} ${n(r * 0.9)} 0 1 1 ${n(r * 2)} 0`,
        `fill="none" stroke="${lit}" stroke-width="${n(br.range(0.9, 1.6))}" opacity="${op(br.range(0.35, 0.65))}"`,
      ),
    );
    inner.push(
      path(
        `M${n(p[0] - r * 0.9)} ${n(p[1] + 0.8)}a${n(r * 0.9)} ${n(r * 0.8)} 0 0 0 ${n(r * 1.8)} 0`,
        `fill="none" stroke="${dark}" stroke-width="${n(br.range(0.9, 1.5))}" opacity="${op(br.range(0.35, 0.6))}"`,
      ),
    );
  }
  // The sheen.
  inner.push(
    `<g filter="url(#soft4)">${ell(sx, sy, o.sheenR ?? (x1 - x0) * 0.22, (o.sheenR ?? (x1 - x0) * 0.22) * 0.7, `fill="${lit}" opacity="0.45"`)}</g>`,
  );
  parts.push(`<g clip-path="url(#${id}c)">${inner.join("")}</g>`);
  return `<g filter="url(#brushHair)">${parts.join("")}</g>`;
}

/** A mass of curls: soft round locks, each lit from above. */
function curly(
  pts: Pt[],
  color: string,
  s: Sitting,
  o: { r?: number; sheen?: Pt } = {},
): string {
  const id = `cm${uid++}`;
  const br = new Brush(s.seed * 17 + uid * 3);
  const d = smooth(pts, true, 0.45);
  const [x0, y0, x1, y1] = bbox(pts);
  const r0 = o.r ?? 6;
  const lit = light(color, lum(color) > 0.6 ? 0.3 : 0.38);
  const dark = shade(color, lum(color) > 0.6 ? 0.45 : 0.6);
  const blobs: Pt[] = [];
  const want =
    Math.round(((x1 - x0) * (y1 - y0)) / (r0 * r0 * 2.4)) *
    (s.detail === "full" ? 1 : 0.5);
  for (let i = 0, tries = 0; i < want && tries < want * 5; tries++) {
    const p: Pt = [br.range(x0, x1), br.range(y0, y1)];
    if (!inside(p, pts)) continue;
    blobs.push(p);
    i++;
  }
  blobs.sort((a, b) => a[1] - b[1]);
  const parts: string[] = [
    `<defs><clipPath id="${id}c">${path(d, "")}</clipPath>
<radialGradient id="${id}g" cx="0.36" cy="0.3" r="0.75"><stop offset="0" stop-color="${lit}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs>`,
    path(d, `fill="${shade(color, 0.3)}"`),
  ];
  const inner: string[] = [];
  for (const [x, y] of blobs) {
    const r = r0 * br.range(0.75, 1.2);
    inner.push(
      ell(
        x,
        y,
        r,
        r * br.range(0.8, 1.05),
        `fill="url(#${id}g)"`,
        br.range(-30, 30),
      ),
    );
    if (br.next() < 0.5)
      inner.push(
        path(
          `M${n(x - r * 0.6)} ${n(y + r * 0.1)}a${n(r * 0.6)} ${n(r * 0.5)} 0 0 0 ${n(r * 1.2)} 0`,
          `fill="none" stroke="${dark}" stroke-width="0.9" opacity="0.6"`,
        ),
      );
  }
  const sx = o.sheen?.[0] ?? x0 + (x1 - x0) * 0.35;
  const sy = o.sheen?.[1] ?? y0 + (y1 - y0) * 0.2;
  inner.push(
    `<g filter="url(#soft4)">${ell(sx, sy, (x1 - x0) * 0.25, (y1 - y0) * 0.12, `fill="${lit}" opacity="0.3"`)}</g>`,
  );
  parts.push(`<g clip-path="url(#${id}c)">${inner.join("")}</g>`);
  return `<g filter="url(#brushHair)">${parts.join("")}</g>`;
}

/** A braid: overlapping lobes down a line. */
function braid(
  a: Pt,
  b: Pt,
  w: number,
  color: string,
  tie: string | null,
): string {
  const out: string[] = [];
  const steps = Math.max(
    4,
    Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (w * 0.8)),
  );
  const lit = light(color, 0.3);
  const dark = shade(color, 0.5);
  out.push(
    stroke(
      [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b],
      w * 1.05,
      `fill="${dark}"`,
      [0.9, 0.7],
    ),
  );
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const side = i % 2 ? 1 : -1;
    out.push(
      ell(
        x + side * w * 0.16,
        y,
        w * 0.36,
        w * 0.5,
        `fill="${color}"`,
        side * 30,
      ),
    );
    out.push(
      ell(
        x + side * w * 0.2 - 0.6,
        y - w * 0.15,
        w * 0.15,
        w * 0.22,
        `fill="${lit}" opacity="0.6"`,
        side * 30,
      ),
    );
  }
  if (tie) out.push(ell(b[0], b[1], w * 0.55, w * 0.35, `fill="${tie}"`));
  return `<g filter="url(#brushHair)">${out.join("")}</g>`;
}

/** The common landmarks of a head of hair. */
function marks(h: Head) {
  const A = h.a;
  const B = h.b;
  const top = h.skull.cy - h.skull.ry;
  return {
    A,
    B,
    top,
    Tn: [h.cx - A * 0.97, h.cy - B * 0.42] as Pt,
    Hn: h.P(-0.62, -0.9),
    Hc: h.P(0, -0.99),
    Hf: h.P(0.6, -0.92),
    Tf: h.P(0.97, -0.52),
    Ae: [h.ear[0] + 4, h.ear[1] - h.earH * 0.52] as Pt,
    Be: [h.ear[0] - h.earH * 0.42, h.ear[1] + h.earH * 0.2] as Pt,
    Np: [h.neckN + 3, h.cy + B * 0.38] as Pt,
    Bk: [h.skull.cx - h.skull.rx, h.skull.cy + h.skull.ry * 0.15] as Pt,
    crown: [h.skull.cx - A * 0.35, top + 6] as Pt,
  };
}

/** Points round the skull from `from` to `to` (radians), `t` out from it. */
function arc(
  h: Head,
  t: number,
  from: number,
  to: number,
  steps = 7,
  extra: (f: number) => number = () => 0,
): Pt[] {
  const out: Pt[] = [];
  const { cx, cy, rx, ry } = h.skull;
  for (let i = 0; i <= steps; i++) {
    const f = from + ((to - from) * i) / steps;
    const e = t + extra(f);
    out.push([cx + (rx + e) * Math.cos(f), cy + (ry + e) * Math.sin(f)]);
  }
  return out;
}

/** The usual cap of hair over the skull, `t` thick, ending at `low` behind. */
function cap(h: Head, t: number, earCovered: boolean, low = 0.38): Pt[] {
  const m = marks(h);
  const { A, B } = m;
  const pts: Pt[] = [
    m.Tn,
    m.Hn,
    m.Hc,
    m.Hf,
    m.Tf,
    ...arc(h, t, -0.25, -Math.PI - 0.6),
    [h.neckN + 2 - t * 0.3, h.cy + B * low],
  ];
  if (earCovered)
    pts.push(
      [h.ear[0] + 3, h.ear[1] + h.earH * 0.55],
      [h.cx - A * 1.03, h.cy - B * 0.05],
    );
  else pts.push(m.Be, [h.ear[0] - 2, h.ear[1] - h.earH * 0.35], m.Ae);
  return pts;
}

/** Wisps where the hair meets the forehead. */
function hairline(h: Head, color: string, s: Sitting, count = 10): string {
  const m = marks(h);
  const shadow = `<g clip-path="url(#faceClip)" filter="url(#soft3)">${path(
    smooth(
      [m.Tn, m.Hn, m.Hc, m.Hf, m.Tf].map(([x, y]): Pt => [x, y + 3]),
      false,
    ),
    `fill="none" stroke="#3a2214" stroke-width="5" opacity="0.32"`,
  )}</g>`;
  if (s.detail !== "full") return shadow;
  const br = new Brush(s.seed + 31);
  const line = [m.Tn, m.Hn, m.Hc, m.Hf, m.Tf];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = br.next() * (line.length - 1);
    const k = Math.floor(t);
    const f = t - k;
    const a = line[k];
    const b = line[Math.min(line.length - 1, k + 1)];
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    out.push(
      path(
        `M${n(x)} ${n(y - 3)}l${n(br.range(-1.5, 1.5))} ${n(br.range(2, 4))}`,
        `stroke="${color}" stroke-width="0.8" opacity="0.5"`,
      ),
    );
  }
  return `${shadow}<g filter="url(#soft06)">${out.join("")}</g>`;
}

// ---------------------------------------------------------------- styles

interface Hair {
  back: string;
  front: string;
}

const NONE: Hair = { back: "", front: "" };

function style(h: Head, s: Sitting, sk: SkinPalette): Hair {
  const L = s.look;
  const c = hairColor(s);
  const m = marks(h);
  const { A, B, top } = m;
  const kid = h.child > 0.3;
  const key = kid && isWig(L.hair) ? "collar" : L.hair;
  const PI = Math.PI;
  // Combed back from the brow: over the near side to the back, and up over the far side.
  const combed: [Pt[], Pt[]][] = [
    [[m.Hc, m.Hn, m.Tn], arc(h, 0, -PI / 2 - 0.25, -PI - 0.62, 6)],
    [[m.Hc, m.Hf, m.Tf], arc(h, 0, -PI / 2 - 0.25, -0.3, 4)],
  ];
  /** Combed down from the parting to hair hanging to `low`. */
  const falling = (low: number): [Pt[], Pt[]][] => [
    [
      [m.Hc, m.Hn, m.Tn],
      [
        [m.Bk[0] - 6, h.cy],
        [h.neckN - 10, low - 6],
        [h.neckN + 14, low - 6],
        [h.cx - A * 1.0, h.cy + B * 0.6],
      ],
    ],
    [[m.Hc, m.Hf, m.Tf], arc(h, 0, -PI / 2 - 0.25, -0.3, 4)],
  ];
  /** Hair on the far side, falling behind the far cheek to `low`. */
  const farFall = (low: number, wide: number, col: string, o: MassOpts = {}) =>
    mass(
      [
        [m.Tf[0] - 3, m.Tf[1] - 4],
        [m.Tf[0] + 6 + wide * 0.3, m.Tf[1] - B * 0.1],
        [h.cx + A * (1.08 + wide * 0.01), h.cy + B * 0.4],
        [h.cx + A * (1.1 + wide * 0.012), low - 8],
        [h.cx + A * 0.78, low],
        [h.cx + A * 0.55, h.cy + B * 1.05],
        [h.cx + A * 0.86, h.cy - B * 0.1],
      ],
      col,
      s,
      { strands: 18, from: [[m.Tf[0], m.Tf[1] - 4]], ...o },
    );
  switch (key) {
    case "cropped":
      return {
        back: "",
        front:
          mass(cap(h, 2, false, 0.3), c, s, {
            flows: combed,
            strands: 40,
            w: 0.8,
          }) + hairline(h, c, s, 14),
      };
    case "natural":
      return {
        back: "",
        front:
          mass(cap(h, 5, false, 0.36), c, s, {
            flows: combed,
            strands: 44,
            w: 1,
            wave: 1.5,
          }) + hairline(h, c, s),
      };
    case "n_short":
      return {
        back: "",
        front:
          mass(cap(h, 3, false, 0.3), c, s, {
            flows: combed,
            strands: 36,
            w: 0.8,
          }) + hairline(h, c, s),
      };
    case "roundhead": {
      // A bowl cut: a fringe and the sides cut level.
      const fy = h.browY - B * 0.2;
      const pts: Pt[] = [
        [h.cx - A * 0.98, h.cy - B * 0.12],
        [h.cx - A * 0.6, fy + 2],
        [m.Hc[0], fy],
        [h.cx + A * 0.62, fy + 1],
        [m.Tf[0] + 2, h.cy - B * 0.28],
        ...arc(h, 6, -0.15, -PI - 0.65),
        [h.neckN + 1, h.cy + B * 0.3],
        [h.ear[0] + 2, h.ear[1] + h.earH * 0.1],
      ];
      return {
        back: "",
        front: mass(pts, c, s, { flows: combed, strands: 50, w: 1 }),
      };
    }
    case "collar": {
      const low = h.cy + B * 0.88;
      const pts: Pt[] = [
        m.Tn,
        m.Hn,
        m.Hc,
        m.Hf,
        m.Tf,
        ...arc(h, 7, -0.25, -PI - 0.75),
        [h.neckN - 8, low + 2],
        [h.neckN + 8, low + 2],
        [h.cx - A * 1.05, h.cy + B * 0.35],
        [h.cx - A * 1.03, h.cy - B * 0.1],
      ];
      return {
        back: farFall(h.cy + B * 0.85, 4, shade(c, 0.25)),
        front:
          mass(pts, c, s, {
            flows: falling(low),
            strands: 56,
            w: 1.1,
            wave: 2,
          }) + hairline(h, c, s),
      };
    }
    case "cavalier":
    case "loose":
    case "n_long":
    case "n_parted":
    case "n_bangs": {
      // Long hair, falling past the shoulders.
      const len = key === "cavalier" ? 2.05 : 2.3;
      const low = h.cy + B * len;
      const wave = key === "cavalier" ? 6 : 1.2;
      const bangs = key === "n_bangs";
      const fy = h.browY - B * 0.1;
      const pts: Pt[] = bangs
        ? [
            [h.cx - A * 0.97, h.cy - B * 0.22],
            [h.cx - A * 0.55, fy + 1],
            [m.Hc[0], fy],
            [h.cx + A * 0.62, fy + 1],
            [m.Tf[0] + 2, h.cy - B * 0.3],
          ]
        : [m.Tn, m.Hn, m.Hc, m.Hf, m.Tf];
      pts.push(
        ...arc(h, 7, -0.25, -PI - 0.85),
        [h.neckN - 12, low - 8],
        [h.neckN + 2, low + 2],
        [h.neckN + 16, low - 8],
        [h.cx - A * 0.98, h.cy + B * 0.95],
        [h.cx - A * 1.06, h.cy + B * 0.3],
        [h.cx - A * 1.04, h.cy - B * 0.15],
      );
      return {
        back: farFall(low, 8, shade(c, 0.25), { wave }),
        front:
          mass(pts, c, s, {
            flows: falling(low),
            strands: 70,
            w: 1.1,
            wave,
            sheen: [h.cx - A * 0.4, top + B * 0.25],
          }) + (bangs ? "" : hairline(h, c, s)),
      };
    }
    case "queue":
    case "tie_wig": {
      // Drawn back and tied at the nape with a black ribbon.
      const wig = key === "tie_wig";
      const capPts = cap(h, wig ? 6 : 4, false, 0.32);
      let front = mass(capPts, c, s, {
        flows: combed,
        strands: 46,
        w: wig ? 1.3 : 1,
      });
      if (wig) {
        // Rolled curls above the ear.
        const rx = h.ear[0] + 2;
        const ry = h.ear[1] - h.earH * 0.05;
        for (let i = 0; i < 2; i++) {
          const y = ry + i * h.earH * 0.4 - h.earH * 0.3;
          front += roll(rx, y, h.earH * 0.5, h.earH * 0.2, c);
        }
      } else front += hairline(h, c, s);
      const nx = h.neckN - 2;
      const ny = h.cy + B * 0.5;
      const back =
        stroke(
          [
            [nx + 4, ny - 4],
            [nx - 2, ny + 14],
            [nx - 1, ny + 34],
          ],
          7,
          `fill="${shade(c, 0.15)}" filter="url(#brushHair)"`,
          [0.9, 0.5],
        ) +
        `<g>${path(`M${n(nx)} ${n(ny)}l-10 -6l1 12zM${n(nx)} ${n(ny)}l8 -8l1 12z`, `fill="#15100d"`)}${path(`M${n(nx - 1)} ${n(ny)}l-5 18l4 1z`, `fill="#15100d"`)}${ell(nx, ny, 2.8, 2.6, `fill="#241a14"`)}</g>`;
      return { back, front };
    }
    case "full_wig":
    case "powder_wig": {
      // The full-bottomed wig: a peaked mass of curls framing the face and
      // falling over the shoulders and down the back.
      const peak = key === "full_wig" ? 9 : 6;
      const low = h.cy + B * 2.0;
      const bump = (f: number) =>
        peak *
        (Math.exp(-((f + PI / 2 + 0.3) ** 2) * 18) +
          Math.exp(-((f + PI / 2 - 0.45) ** 2) * 18));
      const pts: Pt[] = [
        [h.cx - A * 1.0, h.cy - B * 0.15],
        m.Hn,
        [m.Hc[0] - 3, m.Hc[1] + 2],
        m.Hf,
        [m.Tf[0] - 1, m.Tf[1] + 4],
        ...arc(h, 12, -0.2, -PI - 0.9, 12, bump),
        [h.neckN - 26, low - 18],
        [h.neckN - 10, low + 4],
        [h.neckN + 18, low - 4],
        [h.cx - A * 0.72, h.cy + B * 1.0],
        [h.cx - A * 1.04, h.cy + B * 0.4],
      ];
      const far: Pt[] = [
        [m.Tf[0] - 3, m.Tf[1] - 4],
        [m.Tf[0] + 14, m.Tf[1] - B * 0.05],
        [h.cx + A * 1.4, h.cy + B * 0.5],
        [h.cx + A * 1.45, low - 10],
        [h.cx + A * 0.8, low + 2],
        [h.cx + A * 0.55, h.cy + B * 1.05],
        [h.cx + A * 0.88, h.cy - B * 0.1],
      ];
      return {
        back: curly(far, shade(c, 0.28), s, { r: 7 }),
        front: curly(pts, c, s, {
          r: 7,
          sheen: [h.cx - A * 0.5, top + B * 0.2],
        }),
      };
    }
    case "bob_wig": {
      const low = h.cy + B * 0.72;
      const pts: Pt[] = [
        m.Tn,
        m.Hn,
        m.Hc,
        m.Hf,
        m.Tf,
        ...arc(h, 10, -0.25, -PI - 0.8),
        [h.neckN - 6, low + 4],
        [h.neckN + 10, low],
        [h.cx - A * 0.96, h.cy + B * 0.25],
        [h.cx - A * 0.98, h.cy - B * 0.1],
      ];
      return {
        back: farFall(h.cy + B * 0.6, 6, shade(c, 0.25), {
          curls: 14,
          strands: 4,
        }),
        front: curly(pts, c, s, { r: 5.5 }),
      };
    }
    case "balding":
    case "tonsure": {
      // A fringe of hair round the back and sides; the crown bare.
      const t = key === "tonsure" ? 3 : 4;
      const pts: Pt[] = [
        [m.Tn[0] + 1, m.Tn[1] - 1],
        ...arc(h, -5, -PI + 0.15, -PI - 0.3, 3),
        ...arc(h, t, -PI - 0.35, -PI - 0.62, 3),
        [h.neckN + 1, h.cy + B * 0.36],
        m.Be,
        [h.ear[0] - 2, h.ear[1] - h.earH * 0.35],
        m.Ae,
      ];
      const farTuft: Pt[] = [
        [m.Tf[0] - 1, m.Tf[1] + 3],
        [m.Tf[0] + 5, m.Tf[1] - B * 0.1],
        [h.cx + A * 1.08, h.cy - B * 0.02],
        [h.cx + A * 0.98, h.cy + B * 0.08],
      ];
      return {
        back: mass(farTuft, shade(c, 0.15), s, { strands: 6 }),
        front:
          mass(pts, c, s, {
            strands: 26,
            w: 0.8,
            from: [[m.Bk[0] + 10, h.skull.cy]],
          }) +
          `<g filter="url(#soft4)">${ell(h.skull.cx + 4, top + h.b * 0.25, h.a * 0.45, h.b * 0.2, `fill="${sk.lit}" opacity="0.45"`)}</g>`,
      };
    }
    case "parted":
    case "fringe":
    case "ringlets":
    case "dressed":
    case "powdered":
    case "braided":
    case "piled": {
      // A woman's hair, drawn back from a centre parting over the ears.
      const big =
        key === "piled"
          ? 12
          : key === "powdered"
            ? 15
            : key === "dressed"
              ? 6
              : 3;
      const lift = (f: number) =>
        (big - 3) * Math.exp(-((f + PI / 2 - 0.1) ** 2) * 3);
      const pts: Pt[] = [
        [m.Tn[0] + 2, m.Tn[1] + 2],
        m.Hn,
        m.Hc,
        m.Hf,
        m.Tf,
        ...arc(h, 3, -0.25, -PI - 0.55, 10, lift),
        [h.neckN + 3, h.cy + B * 0.34],
        [h.ear[0] + 2, h.ear[1] + h.earH * 0.3],
        [h.ear[0] + 5, h.ear[1] - h.earH * 0.1],
      ];
      let front = mass(pts, c, s, {
        flows: combed,
        strands: 54,
        w: 0.9,
        curls: key === "piled" ? 45 : key === "powdered" ? 24 : 0,
        sheen: [h.cx - A * 0.25, top + B * 0.2],
      });
      // The knot at the back.
      const bun: Pt = [
        h.skull.cx - h.skull.rx * 0.92,
        h.skull.cy + h.skull.ry * 0.05,
      ];
      let back = "";
      if (key !== "braided")
        back += mass(
          [
            [bun[0] - 9, bun[1] - 11],
            [bun[0] + 8, bun[1] - 13],
            [bun[0] + 10, bun[1] + 5],
            [bun[0] - 2, bun[1] + 12],
            [bun[0] - 12, bun[1] + 3],
          ],
          shade(c, 0.12),
          s,
          { strands: 14, from: [bun] },
        );
      if (key === "braided") {
        const y0 = top + B * 0.2;
        front += braid(
          [h.skull.cx - h.skull.rx * 0.95, h.skull.cy - h.skull.ry * 0.05],
          [h.cx + A * 0.55, y0 - 2],
          9,
          shade(c, 0.05),
          null,
        );
      }
      if (key === "fringe") {
        const br = new Brush(s.seed + 3);
        let curls = "";
        for (let i = 0; i < 7; i++) {
          const x = h.cx - A * 0.5 + i * A * 0.19 + br.range(-1, 1) + A * 0.05;
          const y = m.Hc[1] + 6 - Math.abs(i - 3);
          curls += path(
            `M${n(x)} ${n(y - 7)}q${n(-3.5)} ${n(5)} ${n(1)} ${n(10)}`,
            `fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"`,
          );
        }
        front += `<g filter="url(#brushHair)">${curls}</g>`;
      }
      if (
        key === "ringlets" ||
        key === "fringe" ||
        key === "dressed" ||
        key === "powdered"
      ) {
        // Ringlets or curls hanging by the cheek.
        const count = key === "dressed" || key === "powdered" ? 2 : 5;
        const len =
          key === "ringlets" ? B * 0.95 : key === "fringe" ? B * 0.75 : B * 0.4;
        const br = new Brush(s.seed + 9);
        let r = "";
        for (let i = 0; i < count; i++) {
          const x = h.ear[0] + i * 3.4 - 3;
          const y = h.ear[1] - h.earH * 0.25 + i * 1.5;
          r += curlLock(
            [x, y],
            len * br.range(0.75, 1.05),
            5,
            i % 2 ? c : shade(c, 0.12),
            br,
          );
        }
        let far = "";
        for (let i = 0; i < Math.max(1, count - 2); i++) {
          const x = h.cx + A * 1.02 + i * 3;
          const y = h.cy - B * 0.35 + i * 2;
          far += curlLock([x, y], len * 0.85, 4.4, shade(c, 0.28), br);
        }
        front += r;
        back += far;
      }
      if (key === "powdered")
        front += roll(
          h.ear[0] + 2,
          h.ear[1] - h.earH * 0.62,
          h.earH * 0.45,
          h.earH * 0.2,
          c,
        );
      return { back, front: front + hairline(h, c, s, 8) };
    }
    // ---------------------------------------------------------------- the native peoples
    case "n_braids": {
      const front0 = mass(cap(h, 4, true, 0.4), c, s, {
        flows: combed,
        strands: 50,
        w: 0.9,
      });
      const len = s.female ? B * 1.95 : B * 1.8;
      const a1: Pt = [h.cx - A * 1.1, h.cy + B * 0.42];
      const b1: Pt = [h.cx - A * 1.14, h.cy + len];
      const a2: Pt = [h.cx + A * 0.98, h.cy + B * 0.3];
      const b2: Pt = [h.cx + A * 1.04, h.cy + len - 6];
      const wrap = s.region === "plains" ? "#5a4636" : "#8f2b22";
      return {
        back:
          farFall(h.cy + B * 0.45, 4, shade(c, 0.25)) +
          braid(a2, b2, 8, shade(c, 0.25), wrap),
        front:
          front0 +
          hairline(h, c, s) +
          path(
            smooth(
              [
                [h.cx - A * 1.02, h.cy - B * 0.3],
                [h.cx - A * 1.1, h.cy + B * 0.1],
                a1,
              ],
              false,
            ),
            `fill="none" stroke="${c}" stroke-width="10" filter="url(#brushHair)"`,
          ) +
          braid(a1, b1, 9.5, c, wrap),
      };
    }
    case "n_roach": {
      // Shaved, but for a crest and a long lock at the crown.
      const shaved = mix(sk.shadow, "#2a2a30", 0.35);
      const crest: Pt[] = [
        [m.Hc[0] - 4, m.Hc[1] - 3],
        [m.Hc[0] + 5, m.Hc[1] - 5],
        ...arc(h, 3, -PI / 2 + 0.35, -PI - 0.2, 6, (f) => 2 * Math.sin(-f * 6)),
        ...arc(h, -7, -PI - 0.1, -PI / 2 + 0.3, 6),
      ];
      const lock = stroke(
        [
          [m.crown[0] - 6, top + 8],
          [m.Bk[0] - 4, h.skull.cy + 4],
          [m.Bk[0] - 2, h.cy + B * 0.7],
        ],
        6,
        `fill="${c}" filter="url(#brushHair)"`,
        [0.8, 0.3],
      );
      return {
        back: lock,
        front:
          `<g clip-path="url(#headClip)" filter="url(#soft3)">${ell(h.skull.cx - 4, h.skull.cy - 6, h.skull.rx * 0.9, h.skull.ry * 0.8, `fill="${shaved}" opacity="0.12"`)}</g>` +
          mass(crest, c, s, {
            strands: 30,
            w: 0.8,
            from: [[h.cx - A * 0.1, top]],
          }),
      };
    }
    case "n_half": {
      // Shaved on this side, a crest on top, and the long hair on the far
      // side knotted by the ear.
      const shaved = mix(sk.shadow, "#2a2a30", 0.35);
      const crest: Pt[] = [
        [m.Hc[0] - 2, m.Hc[1] - 3],
        m.Hf,
        m.Tf,
        [h.cx + A * 1.0, h.cy - B * 0.15],
        [h.cx + A * 1.12, h.cy - B * 0.35],
        ...arc(h, 4, -0.35, -PI - 0.25, 8),
        ...arc(h, -6, -PI - 0.15, -PI / 2 - 0.1, 5),
        [h.cx + A * 0.2, top + 12],
      ];
      const knot: Pt = [h.cx + A * 1.12, h.cy - B * 0.4];
      return {
        back: mass(
          [
            [knot[0] - 9, knot[1] - 9],
            [knot[0] + 9, knot[1] - 11],
            [knot[0] + 13, knot[1] + 8],
            [knot[0] - 2, knot[1] + 15],
          ],
          shade(c, 0.1),
          s,
          { strands: 12, curls: 6 },
        ),
        front:
          `<g clip-path="url(#headClip)" filter="url(#soft3)">${ell(h.skull.cx - 6, h.skull.cy + 2, h.skull.rx * 0.75, h.skull.ry * 0.75, `fill="${shaved}" opacity="0.12"`)}</g>` +
          mass(crest, c, s, { strands: 34, w: 0.8, from: [[h.cx, top]] }),
      };
    }
    case "n_knot":
    case "n_tail": {
      // Drawn back to the nape and knotted or wrapped there.
      const capPts = cap(h, 4, key === "n_tail", 0.36);
      const front =
        mass(capPts, c, s, { flows: combed, strands: 48, w: 0.9 }) +
        hairline(h, c, s);
      const nx = h.neckN - 5;
      const ny = h.cy + B * 0.45;
      const bundle =
        key === "n_tail"
          ? stroke(
              [
                [nx + 6, ny - 6],
                [nx - 1, ny + 18],
                [nx + 1, ny + 42],
              ],
              14,
              `fill="${shade(c, 0.1)}" filter="url(#brushHair)"`,
              [0.7, 0.8],
            ) +
            path(
              `M${n(nx - 7)} ${n(ny + 12)}h${n(14)}v${n(10)}h${n(-14)}z`,
              `fill="#3b2a20" opacity="0.9" filter="url(#brush)"`,
            )
          : mass(
              [
                [nx - 9, ny - 10],
                [nx + 8, ny - 12],
                [nx + 11, ny + 12],
                [nx - 8, ny + 15],
              ],
              shade(c, 0.1),
              s,
              { strands: 10 },
            ) +
            path(
              `M${n(nx - 9)} ${n(ny)}h${n(20)}v${n(4)}h${n(-20)}z`,
              `fill="#e8e0d0" opacity="0.9" filter="url(#brush)"`,
            );
      return { back: bundle, front };
    }
    case "n_topknot": {
      const capPts = cap(h, 4, false, 0.32);
      const k: Pt = [h.cx - A * 0.2, top - 8];
      const knot = mass(
        [
          [k[0] - 11, k[1] + 10],
          [k[0] - 10, k[1] - 8],
          [k[0] + 2, k[1] - 14],
          [k[0] + 12, k[1] - 4],
          [k[0] + 10, k[1] + 12],
        ],
        c,
        s,
        { strands: 16, from: [[k[0], k[1] + 10]] },
      );
      return {
        back: "",
        front:
          mass(capPts, c, s, {
            from: [[k[0], k[1] + 12]],
            strands: 50,
            w: 0.9,
          }) + knot,
      };
    }
    case "n_forelock": {
      const low = h.cy + B * 2.0;
      const pts: Pt[] = [
        m.Tn,
        m.Hn,
        m.Hc,
        m.Hf,
        m.Tf,
        ...arc(h, 6, -0.25, -PI - 0.85),
        [h.neckN - 12, low],
        [h.neckN + 12, low - 4],
        [h.cx - A * 0.86, h.cy + B * 0.85],
        [h.cx - A * 0.96, h.cy - B * 0.1],
      ];
      const lock: Pt[] = [
        [m.Hc[0] - 11, m.Hc[1] + 1],
        [m.Hc[0] - 13, m.Hc[1] - 14],
        [m.Hc[0], m.Hc[1] - 21],
        [m.Hc[0] + 12, m.Hc[1] - 13],
        [m.Hc[0] + 8, m.Hc[1] + 1],
      ];
      return {
        back: farFall(low, 8, shade(c, 0.25)),
        front:
          mass(pts, c, s, { flows: falling(low), strands: 60, w: 1 }) +
          mass(lock, light(c, 0.05), s, {
            strands: 14,
            from: [[m.Hc[0], m.Hc[1] + 2]],
          }),
      };
    }
    case "n_whorls": {
      const front =
        mass(cap(h, 4, true, 0.36), c, s, {
          flows: combed,
          strands: 44,
          w: 0.9,
        }) + hairline(h, c, s);
      const whorl = (x: number, y: number, r: number, col: string) =>
        `<g filter="url(#brushHair)">${ell(x, y, r, r * 1.05, `fill="${col}"`)}${path(`M${n(x)} ${n(y - r)}a${n(r)} ${n(r)} 0 0 0 0 ${n(r * 2)}M${n(x)} ${n(y - r)}a${n(r)} ${n(r)} 0 0 1 0 ${n(r * 2)}`, `fill="none" stroke="${light(col, 0.3)}" stroke-width="1.2" opacity="0.6"`)}${ell(x, y, r * 0.25, r * 0.5, `fill="${shade(col, 0.4)}"`)}</g>`;
      return {
        back: whorl(h.cx + A * 1.15, h.cy - B * 0.25, A * 0.42, shade(c, 0.2)),
        front: front + whorl(h.ear[0] - 2, h.ear[1] - 4, A * 0.48, c),
      };
    }
    case "n_ribbons": {
      // Braids wound with bright cloth round the head.
      const front =
        mass(cap(h, 3, true, 0.36), c, s, {
          flows: combed,
          strands: 40,
          w: 0.9,
        }) + hairline(h, c, s);
      const cloth = ["#a3271c", "#2c5a8a", "#c48a2a", "#3a6a3a"];
      let band = "";
      const ring = arc(h, 2, -0.15, -PI - 0.3, 8);
      for (let i = 0; i < 5; i++) {
        const col = cloth[(i + s.seed) % cloth.length];
        band += path(
          smooth(
            ring.map(([x, y]): Pt => [x, y + 8 + i * 3.4]),
            false,
          ),
          `fill="none" stroke="${col}" stroke-width="3.6" stroke-linecap="round"`,
        );
      }
      return { back: "", front: front + `<g filter="url(#brush)">${band}</g>` };
    }
  }
  return NONE;
}

/** A rolled curl lying sideways, as on a tie-wig. */
function roll(x: number, y: number, rx: number, ry: number, c: string): string {
  return `<g filter="url(#brushHair)">${ell(x, y, rx, ry, `fill="${shade(c, 0.15)}"`)}${ell(x - 1, y - ry * 0.35, rx * 0.82, ry * 0.42, `fill="${light(c, 0.35)}" opacity="0.8"`)}${path(`M${n(x - rx)} ${n(y + 1)}a${n(rx)} ${n(ry)} 0 0 0 ${n(rx * 2)} 0`, `fill="none" stroke="${shade(c, 0.45)}" stroke-width="1.2" opacity="0.7"`)}${ell(x + rx * 0.82, y + 0.5, ry * 0.45, ry * 0.45, `fill="${shade(c, 0.5)}" opacity="0.8"`)}</g>`;
}

/** A hanging curl, spiralling down. */
function curlLock(a: Pt, len: number, w: number, c: string, br: Brush): string {
  const pts: Pt[] = [];
  const turns = Math.max(3, Math.round(len / 7));
  for (let i = 0; i <= turns; i++) {
    const t = i / turns;
    pts.push([
      a[0] + Math.sin(i * 1.7) * w * 0.4 + br.range(-0.5, 0.5),
      a[1] + t * len,
    ]);
  }
  const body = stroke(pts, w, `fill="${c}"`, [0.8, 0.4]);
  let ridges = "";
  for (let i = 1; i < turns; i++) {
    const [x, y] = pts[i];
    ridges += path(
      `M${n(x - w * 0.45)} ${n(y - 1)}q${n(w * 0.45)} ${n(2.5)} ${n(w * 0.9)} 0`,
      `fill="none" stroke="${shade(c, 0.45)}" stroke-width="0.8" opacity="0.7"`,
    );
    ridges += path(
      `M${n(x - w * 0.3)} ${n(y - 2.5)}q${n(w * 0.3)} ${n(-1.2)} ${n(w * 0.6)} 0`,
      `fill="none" stroke="${light(c, 0.35)}" stroke-width="0.8" opacity="0.6"`,
    );
  }
  return `<g filter="url(#brushHair)">${body}${ridges}</g>`;
}

const cacheKey = new WeakMap<Sitting, Hair>();
function hairOf(h: Head, s: Sitting, sk: SkinPalette): Hair {
  let v = cacheKey.get(s);
  if (!v) {
    v = style(h, s, sk);
    cacheKey.set(s, v);
  }
  return v;
}

export function paintHairBack(h: Head, s: Sitting, sk: SkinPalette): string {
  return hairOf(h, s, sk).back;
}

export function paintHairFront(h: Head, s: Sitting, sk: SkinPalette): string {
  return hairOf(h, s, sk).front;
}

// ---------------------------------------------------------------- beards

export function paintBeard(h: Head, s: Sitting, sk: SkinPalette): string {
  const b = s.look.beard;
  if (s.female || h.child > 0.25 || b === "none" || b === "stubble") return "";
  const c = mix(hairTone(s), "#6a3a20", 0.08);
  const [mx, my] = h.mouth;
  const W = h.mouthW;
  const out: string[] = [];
  const t = h.noseTip;
  const moustache = (up: number, droop: number) => {
    const y = my - h.b * 0.07;
    const left: Pt[] = [
      [mx - 1, y - 1.5],
      [mx - W * 0.35, y - 0.5],
      [mx - W * 0.62, y + droop],
      [mx - W * 0.85, y - up + droop],
    ];
    const right: Pt[] = [
      [mx + 1, y - 1.5],
      [mx + W * 0.25, y - 0.5],
      [mx + W * 0.45, y + droop * 0.8],
      [mx + W * 0.6, y - up * 0.8 + droop],
    ];
    return (
      stroke(left, 4.2, `fill="${c}"`, [0.6, 0.15]) +
      stroke(right, 3.4, `fill="${shade(c, 0.2)}"`, [0.6, 0.15])
    );
  };
  const lit = light(c, 0.3);
  switch (b) {
    case "moustache":
      out.push(moustache(1.5, 1.5));
      break;
    case "vandyke":
      out.push(moustache(4, 0.5));
      out.push(
        stroke(
          [
            [mx - 1, my + h.b * 0.08],
            [mx, my + h.b * 0.16],
            [mx + 1, my + h.b * 0.28],
          ],
          4.5,
          `fill="${c}"`,
          [0.7, 0.2],
        ),
      );
      break;
    case "pointed":
    case "spade":
    case "full": {
      const spade = b === "spade";
      const full = b === "full";
      const low = h.chin[1] + (spade ? 18 : full ? 14 : 16);
      const pts: Pt[] = [
        h.P(-0.97, full ? 0.0 : 0.25),
        h.P(-0.7, full ? 0.42 : 0.55),
        [mx - W * 0.7, my - 2],
        [mx - W * 0.2, my + h.b * 0.07],
        [mx + W * 0.3, my + h.b * 0.06],
        [mx + W * 0.62, my - 2],
        h.P(0.82, full ? 0.4 : 0.5),
        h.P(0.98, full ? 0.0 : 0.2),
        h.jawF,
        [h.chin[0] + (spade ? 10 : 5), low - (spade ? 2 : 6)],
        [h.chin[0] + (spade ? 2 : 1), low],
        [h.chin[0] - (spade ? 10 : 4), low - (spade ? 1 : 5)],
        h.jawN,
      ];
      if (b === "pointed") {
        pts.splice(0, 2, h.P(-0.8, 0.62));
        pts.splice(5, 2, h.P(0.75, 0.62));
      }
      out.push(
        mass(pts, c, s, {
          strands: 40,
          w: 0.8,
          from: [[mx, my]],
          sheen: [mx - W * 0.4, my + 6],
        }),
      );
      out.push(moustache(1, 2));
      break;
    }
  }
  void t;
  void sk;
  void lit;
  return `<g>${out.join("")}</g>`;
}
