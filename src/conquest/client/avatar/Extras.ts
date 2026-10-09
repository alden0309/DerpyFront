// Ornaments and the things people kept about them: spectacles, earrings,
// pearls and beads, wampum, a silver or shell gorget, a cross, a clay pipe.

import type { SkinPalette } from "./Face";
import type { Head, Sitting } from "./Head";
import {
  ell,
  light,
  mix,
  n,
  path,
  type Pt,
  shade,
  smooth,
  stroke,
} from "./Svg";

/** Beads along a curve, each lit from the upper left. */
function beadString(pts: Pt[], r: number, colors: string[], gap = 1.9): string {
  let out = "";
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const steps = Math.max(
      1,
      Math.round(Math.hypot(x2 - x1, y2 - y1) / (r * gap)),
    );
    for (let j = 0; j < steps; j++) {
      const x = x1 + ((x2 - x1) * j) / steps;
      const y = y1 + ((y2 - y1) * j) / steps;
      const c = colors[k++ % colors.length];
      out +=
        ell(x, y, r, r, `fill="${c}"`) +
        ell(
          x - r * 0.35,
          y - r * 0.35,
          r * 0.4,
          r * 0.4,
          `fill="${light(c, 0.7)}" opacity="0.8"`,
        ) +
        ell(
          x + r * 0.2,
          y + r * 0.35,
          r * 0.6,
          r * 0.3,
          `fill="${shade(c, 0.5)}" opacity="0.5"`,
        );
    }
  }
  return out;
}

/** A necklace's curve round the neck, `drop` below the throat. */
function necklace(h: Head, s: Sitting, drop: number, wide = 1): Pt[] {
  const y0 = h.neckBase;
  const tx = h.cx + 7 + h.a * 0.05;
  const low =
    s.female &&
    ["satin", "mantua", "robe", "bodice", "short_gown", "plain_gown"].includes(
      s.look.clothes,
    );
  const d = low ? drop + 10 : drop;
  return [
    [h.neckN - 2 - (wide - 1) * 14, y0 - 10],
    [h.neckN + 4 - (wide - 1) * 8, y0 + d * 0.55],
    [tx - 6, y0 + d],
    [tx + 8, y0 + d * 0.95],
    [h.neckF + 4 + (wide - 1) * 10, y0 + d * 0.4],
    [h.neckF + 2 + (wide - 1) * 12, y0 - 10],
  ];
}

function along(pts: Pt[], steps = 24): Pt[] {
  // Sample the smooth curve through the points (Catmull-Rom).
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const k = Math.ceil(steps / (pts.length - 1));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t2 +
          (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function paintExtras(
  h: Head,
  s: Sitting,
  sk: SkinPalette,
  part: "head" | "body",
): string {
  const x = s.look.extras.filter((e) =>
    part === "head"
      ? e === "spectacles" || e === "earrings" || e === "pipe"
      : e !== "spectacles" && e !== "earrings" && e !== "pipe",
  );
  if (!x.length) return "";
  const out: string[] = [];
  const y0 = h.neckBase;
  const tx = h.cx + 7 + h.a * 0.05;
  const kid = h.child > 0.4;
  if (x.includes("wampum")) {
    // A collar of white and purple shell beads, worked in a pattern.
    const pts = necklace(h, s, 30, 1.25);
    const band = along(pts, 30);
    out.push(
      `<g filter="url(#brush)">${stroke(band, 9, `fill="#4a2a4a"`, [1, 1])}</g>`,
    );
    let pattern = "";
    for (let i = 2; i < band.length - 2; i += 2) {
      const [px, py] = band[i];
      pattern += path(
        `M${n(px)} ${n(py - 3.4)}l2.6 3.4l-2.6 3.4l-2.6 -3.4z`,
        `fill="#efe8dc" opacity="0.9"`,
      );
    }
    out.push(`<g>${pattern}</g>`);
  }
  if (x.includes("beads")) {
    const cols = s.native
      ? ["#f0ebe0", "#2b4f8a", "#a3271c", "#1d1a18"]
      : ["#a3271c", "#d9c7a0", "#2a2a2a"];
    out.push(beadString(along(necklace(h, s, 22), 20), kid ? 1.3 : 1.6, cols));
    if (s.native)
      out.push(
        beadString(
          along(necklace(h, s, 30, 1.15), 22),
          1.5,
          cols.slice().reverse(),
        ),
      );
  }
  if (x.includes("pearls"))
    out.push(
      beadString(
        along(necklace(h, s, 16), 24),
        kid ? 1.2 : 1.7,
        ["#f1ece2", "#e8e2d6"],
        2.1,
      ),
    );
  if (x.includes("gorget")) {
    // A silver crescent at the throat, engraved.
    const gx = tx - 2;
    const gy = y0 + (s.native ? 26 : 12);
    const w = h.a * (s.native ? 0.55 : 0.48);
    const d = `M${n(gx - w)} ${n(gy - 4)}Q${n(gx)} ${n(gy + 24)} ${n(gx + w)} ${n(gy - 4)}Q${n(gx)} ${n(gy + 9)} ${n(gx - w)} ${n(gy - 4)}Z`;
    out.push(
      `<defs><linearGradient id="gorg" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#f4f4f0"/><stop offset="0.45" stop-color="#b8bcc0"/><stop offset="1" stop-color="#5a5f66"/></linearGradient></defs>`,
    );
    out.push(
      `<g filter="url(#brush)">${path(`M${n(gx - w + 3)} ${n(gy - 4)}Q${n(gx - w * 0.5)} ${n(gy - 26)} ${n(gx - 3)} ${n(y0 - 10)}M${n(gx + w - 3)} ${n(gy - 4)}Q${n(gx + w * 0.5)} ${n(gy - 26)} ${n(gx + 3)} ${n(y0 - 10)}`, `fill="none" stroke="#3a2a1e" stroke-width="1.2" opacity="0.7"`)}${path(d, `fill="url(#gorg)" stroke="#4a4f56" stroke-width="0.6"`)}${ell(gx, gy + 5, 3.4, 2.4, `fill="none" stroke="#5a5f66" stroke-width="0.7"`)}</g>`,
    );
  }
  if (x.includes("shell")) {
    const gx = tx - 2;
    const gy = y0 + 30;
    out.push(
      `<g filter="url(#brush)">${path(`M${n(h.neckN + 4)} ${n(y0 - 8)}Q${n(gx - 8)} ${n(gy - 10)} ${n(gx)} ${n(gy - 9)}Q${n(gx + 8)} ${n(gy - 10)} ${n(h.neckF)} ${n(y0 - 8)}`, `fill="none" stroke="#3a2a1e" stroke-width="1.2"`)}${ell(gx, gy, 9, 9, `fill="#ece4d4" stroke="#8a7c66" stroke-width="0.8"`)}${ell(gx, gy, 5.5, 5.5, `fill="none" stroke="#7a6a52" stroke-width="0.8"`)}${path(`M${n(gx - 5)} ${n(gy)}h10M${n(gx)} ${n(gy - 5)}v10`, `stroke="#7a6a52" stroke-width="0.8"`)}${ell(gx - 3, gy - 3, 2.5, 2, `fill="#ffffff" opacity="0.5"`)}</g>`,
    );
  }
  if (x.includes("cross")) {
    const gx = tx - 3;
    const gy = y0 + (s.female ? 30 : 24);
    const metal = s.native ? "#d0d4d8" : "#d4b05a";
    out.push(
      `<g>${path(`M${n(h.neckN + 6)} ${n(y0 - 6)}Q${n(gx - 4)} ${n(gy - 8)} ${n(gx)} ${n(gy - 6)}Q${n(gx + 4)} ${n(gy - 8)} ${n(h.neckF - 2)} ${n(y0 - 6)}`, `fill="none" stroke="#2a2018" stroke-width="0.8" opacity="0.8"`)}${path(`M${n(gx - 1)} ${n(gy - 6)}h2v3.2h3.2v2h-3.2v6.5h-2v-6.5h-3.2v-2h3.2z`, `fill="${metal}" stroke="${shade(metal, 0.5)}" stroke-width="0.5"`)}</g>`,
    );
  }
  if (x.includes("earrings")) {
    const ex = h.ear[0] + 1;
    const ey = h.ear[1] + h.earH * 0.5;
    const metal = s.native ? "#d4d8dc" : "#c9a85a";
    if (s.female && !s.native)
      out.push(
        `<g>${path(`M${n(ex)} ${n(ey)}v3`, `stroke="${metal}" stroke-width="0.8"`)}${ell(ex, ey + 5.5, 2, 2.6, `fill="#f1ece2"`)}${ell(ex - 0.6, ey + 4.6, 0.8, 0.9, `fill="#ffffff"`)}</g>`,
      );
    else if (s.native)
      // Silver ear-bobs: a small ball and a cone below it.
      out.push(
        `<g>${ell(ex, ey + 1.5, 1.6, 1.6, `fill="${metal}"`)}${path(`M${n(ex - 1.8)} ${n(ey + 10)}L${n(ex)} ${n(ey + 3)}L${n(ex + 1.8)} ${n(ey + 10)}Z`, `fill="${metal}" stroke="#7a8088" stroke-width="0.4"`)}${ell(ex - 0.5, ey + 1, 0.6, 0.6, `fill="#ffffff"`)}</g>`,
      );
    else
      out.push(
        path(
          `M${n(ex - 1.6)} ${n(ey + 1)}a1.8 2.4 0 1 0 3.2 0`,
          `fill="none" stroke="${metal}" stroke-width="1.1"`,
        ),
      );
  }
  if (x.includes("spectacles") && !kid) {
    const r = h.eyeW * 0.62;
    const [nx, ny] = h.eyeN;
    const [fx, fy] = h.eyeF;
    const rim = "#3a3026";
    out.push(
      `<g>${ell(nx, ny + 0.5, r, r * 0.82, `fill="#e8eef2" fill-opacity="0.08" stroke="${rim}" stroke-width="1"`)}${ell(fx, fy + 0.5, r * (h.eyeWF / h.eyeW), r * 0.82, `fill="#e8eef2" fill-opacity="0.08" stroke="${rim}" stroke-width="1"`)}${path(`M${n(nx + r)} ${n(ny - 1)}Q${n((nx + fx) / 2)} ${n(ny - 4)} ${n(fx - r * (h.eyeWF / h.eyeW))} ${n(fy - 1)}`, `fill="none" stroke="${rim}" stroke-width="0.9"`)}${path(`M${n(nx - r)} ${n(ny - 1)}L${n(h.ear[0] + 4)} ${n(h.ear[1] - h.earH * 0.25)}`, `stroke="${rim}" stroke-width="0.9"`)}${path(`M${n(nx - r * 0.5)} ${n(ny - r * 0.4)}l${n(r * 0.4)} ${n(-r * 0.2)}`, `stroke="#ffffff" stroke-width="0.8" opacity="0.6"`)}</g>`,
    );
  }
  if (x.includes("pipe") && !kid) {
    // A long clay pipe from the corner of the mouth.
    const [mx, my] = h.mouth;
    const a: Pt = [mx + h.mouthW * 0.3, my + 1];
    const b: Pt = [mx + h.a * 1.25, my + h.b * 0.5];
    out.push(
      `<g filter="url(#brush)">${path(smooth([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1], b], false), `fill="none" stroke="#e6dfd2" stroke-width="2"`)}${path(smooth([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2], b], false), `fill="none" stroke="#8a8478" stroke-width="0.6" opacity="0.7"`)}${path(`M${n(b[0] - 3)} ${n(b[1] - 2)}l2 -9h7l-1 9z`, `fill="#e8e1d4" stroke="#8a8478" stroke-width="0.6"`)}${ell(b[0] + 1.5, b[1] - 11, 3.6, 1.4, `fill="#2a1a10"`)}</g>`,
    );
  }
  void mix;
  void sk;
  return out.join("");
}
