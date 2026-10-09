// Small tools for painting portraits in SVG: colours mixed like paint,
// smooth curves through points, and numbers kept short.

export type Pt = [number, number];

/** A number with at most one decimal, for short SVG. */
export function n(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
}

/** An opacity, to two decimals. */
export function op(v: number): string {
  return String(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100);
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Two colours mixed, `t` of the second. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return rgbHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Darker, toward a warm brown-black, as an oil shadow goes. */
export function shade(c: string, t: number): string {
  return mix(c, "#1a0f08", t);
}

/** Lighter, toward a warm cream, as a lit surface goes. */
export function light(c: string, t: number): string {
  return mix(c, "#fff4e0", t);
}

/** How light a colour is, 0 to 1. */
export function lum(c: string): number {
  const [r, g, b] = hexRgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** A smooth closed (or open) path through the points (Catmull-Rom). */
export function smooth(pts: Pt[], closed = true, tension = 0.5): string {
  if (pts.length < 2) return "";
  const p = (i: number): Pt =>
    closed
      ? pts[(i + pts.length) % pts.length]
      : pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  const last = closed ? pts.length : pts.length - 1;
  const k = tension / 3;
  for (let i = 0; i < last; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? d + "Z" : d;
}

/** A straight-edged path through the points. */
export function poly(pts: Pt[], closed = true): string {
  return (
    pts.map((p, i) => `${i ? "L" : "M"}${n(p[0])} ${n(p[1])}`).join("") +
    (closed ? "Z" : "")
  );
}

/** An ellipse as SVG. */
export function ell(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  attrs: string,
  rot = 0,
): string {
  const t = rot ? ` transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})"` : "";
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${t} ${attrs}/>`;
}

/** A path as SVG. */
export function path(d: string, attrs: string): string {
  return `<path d="${d}" ${attrs}/>`;
}

/** A tapering brush stroke along points: wide in the middle, thin at the ends. */
export function stroke(
  pts: Pt[],
  width: number,
  attrs: string,
  taper: [number, number] = [0.2, 0.2],
): string {
  if (pts.length < 2) return "";
  // Offset each point along its normal by a width that swells and tapers.
  const left: Pt[] = [];
  const right: Pt[] = [];
  const m = pts.length - 1;
  for (let i = 0; i <= m; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(m, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = i / m;
    const w =
      (width / 2) *
      Math.min(
        1,
        t < 0.5 ? taper[0] + (1 - taper[0]) * (t / 0.5) : 1,
        t > 0.5 ? taper[1] + (1 - taper[1]) * ((1 - t) / 0.5) : 1,
      );
    left.push([pts[i][0] - (dy / len) * w, pts[i][1] + (dx / len) * w]);
    right.push([pts[i][0] + (dy / len) * w, pts[i][1] - (dx / len) * w]);
  }
  return path(smooth([...left, ...right.reverse()], true, 0.4), attrs);
}

/** Points along a quadratic curve. */
export function curve(a: Pt, c: Pt, b: Pt, steps = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
}

/** A small random source for brush marks, the same for the same seed. */
export class Brush {
  private s: number;
  constructor(seed: number) {
    this.s = (seed * 2654435761) >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** A number in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}
