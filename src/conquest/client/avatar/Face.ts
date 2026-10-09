// The face, painted as the old masters built a head: a mid-tone laid in,
// the light falling from the upper left so the far side of the face turns
// into a warm shadow with a cool half-tone at its edge and a glow of
// reflected light at the contour; the sockets of the eyes, the plane of the
// nose and the hollows under the cheekbone, lip and jaw darkened; the
// lights of the brow, cheekbone, bridge, lip and chin laid over. The skin
// runs golden at the brow, ruddy across the cheeks, nose and ears, and
// cooler round the mouth and jaw. Then the features: lidded eyes with a
// wet light in them, a nose with planes, a mouth with a shaded upper lip
// and a lit lower one, and the lines and marks of a life.

import { EYE_COLORS, HAIR_COLORS, SKIN_TONES } from "../../engine/Appearance";
import type { Head, Sitting } from "./Head";
import {
  Brush,
  curve,
  ell,
  light,
  lum,
  mix,
  n,
  op,
  path,
  Pt,
  shade,
  smooth,
  stroke,
} from "./Svg";

export interface SkinPalette {
  base: string;
  /** The cool half-tone where light turns to shadow. */
  half: string;
  lit: string;
  shadow: string;
  deep: string;
  blush: string;
  lip: string;
  line: string;
  /** Warm light thrown back into the shadow. */
  refl: string;
  /** The golden brow and the cool jaw. */
  gold: string;
  cool: string;
  /** A sheen on the high points (cooler on darker skin). */
  sheen: string;
}

export function skinPalette(s: Sitting): SkinPalette {
  const swatch = SKIN_TONES[s.look.skin]?.hex ?? SKIN_TONES[2].hex;
  // Under the varnish even the palest skin is warm.
  const lw = lum(swatch);
  const base = mix(
    swatch,
    "#c4803e",
    lw > 0.78 ? 0.32 : lw > 0.7 ? 0.26 : 0.12,
  );
  const L = lum(base);
  const dark = L < 0.5;
  const shadow = mix(base, dark ? "#24100a" : "#4a1e12", dark ? 0.55 : 0.64);
  return {
    base,
    half: mix(base, dark ? "#2e2a26" : "#58544a", dark ? 0.3 : 0.42),
    lit: dark ? mix(base, "#e6c3a0", 0.26) : mix(base, "#f4d6a4", 0.5),
    shadow,
    deep: mix(base, "#1c0c05", dark ? 0.66 : 0.72),
    blush: mix(base, dark ? "#983a2a" : "#d2544a", dark ? 0.32 : 0.46),
    lip: dark
      ? mix(mix(base, "#5a2420", 0.35), "#8e4642", 0.25)
      : mix(base, "#a02a24", s.female ? 0.62 : 0.5),
    line: mix(base, "#3a170c", dark ? 0.58 : 0.62),
    refl: mix(shadow, dark ? "#a85a34" : "#c87a4c", 0.4),
    gold: mix(base, "#e2bf72", dark ? 0.18 : 0.3),
    cool: mix(base, dark ? "#4c5450" : "#7f8a84", dark ? 0.22 : 0.32),
    sheen: dark ? mix(base, "#e8dcd0", 0.45) : light(base, 0.6),
  };
}

/** The colour of someone's hair, greying with the years. */
export function hairTone(s: Sitting): string {
  const base = HAIR_COLORS[s.look.hairColor]?.hex ?? HAIR_COLORS[1].hex;
  const starts = 58 - s.look.greying * 8 + (s.native ? 6 : 0);
  const g = Math.max(0, Math.min(1, (s.age - starts) / 22));
  if (g <= 0) return base;
  return g < 0.6
    ? mix(base, "#8f8a82", g / 0.6)
    : mix("#8f8a82", "#ddd8cc", (g - 0.6) / 0.4);
}

const fillOp = (c: string, o: number) => `fill="${c}" opacity="${op(o)}"`;
const line = (c: string, w: number, o: number) =>
  `fill="none" stroke="${c}" stroke-width="${n(w)}" opacity="${op(o)}" stroke-linecap="round"`;

/** The neck, under the jaw. */
export function paintNeck(h: Head, s: Sitting, sk: SkinPalette): string {
  const base = h.neckBase + 16;
  const n0 = h.neckN;
  const f0 = h.neckF;
  const d = smooth(
    [
      [n0 + 2, h.cy + h.b * 0.15],
      [n0 + 3 - h.fat * 3, h.cy + h.b * 0.85],
      [n0 - 6 - (s.female ? 0 : 4), base],
      [f0 + 8 + (s.female ? 0 : 3), base],
      [f0 + 1 + h.fat * 3, h.cy + h.b * 1.18],
      [f0 - 3, h.cy + h.b * 0.8],
      [h.cx - h.a * 0.2, h.cy + h.b * 0.5],
    ],
    true,
    0.4,
  );
  const jaw = smooth(
    [
      h.outline[3],
      h.outline[4],
      h.outline[5],
      h.outline[6],
      h.outline[7],
      h.outline[8],
      h.outline[9],
    ],
    false,
  );
  const male = !s.female && h.child < 0.5;
  const parts: string[] = [];
  // The jaw's shadow falls across the throat.
  parts.push(
    `<g transform="translate(-1 7)">${path(jaw, line(sk.deep, 15, 0.85))}</g>`,
  );
  // The far side of the neck turns into shadow.
  parts.push(
    ell(f0 - 1, h.cy + h.b * 1.25, 8, h.b * 0.55, fillOp(sk.deep, 0.55)),
  );
  // The lit front of the throat.
  parts.push(
    path(
      smooth(
        [
          [n0 + 8, h.cy + h.b * 1.05],
          [h.cx - h.a * 0.15, h.cy + h.b * 1.3],
          [h.cx + h.a * 0.02, base],
        ],
        false,
      ),
      line(sk.lit, 7, 0.32),
    ),
  );
  if (male) {
    // The cords of the neck and the Adam's apple.
    parts.push(
      path(
        smooth(
          [
            [n0 + 4, h.cy + h.b * 0.95],
            [h.cx - h.a * 0.35, h.cy + h.b * 1.25],
            [h.cx - h.a * 0.05, base - 2],
          ],
          false,
        ),
        line(sk.half, 3, 0.4 + h.gaunt * 0.3),
      ),
    );
    parts.push(
      ell(h.cx + h.a * 0.18, h.cy + h.b * 1.24, 3, 4.5, fillOp(sk.shadow, 0.3)),
    );
  }
  if (h.fat > 0.5) {
    // A second chin.
    parts.push(
      path(
        smooth(
          [
            [h.cx - h.a * 0.5, h.cy + h.b * 1.08],
            [h.chin[0] - 2, h.chin[1] + 9],
            [h.cx + h.a * 0.55, h.cy + h.b * 1.0],
          ],
          false,
        ),
        line(sk.shadow, 2.5, (h.fat - 0.4) * 0.6),
      ),
    );
  }
  if (h.old > 0.55)
    parts.push(
      path(
        smooth(
          [
            [h.cx - h.a * 0.3, h.cy + h.b * 1.1],
            [h.cx - h.a * 0.12, base - 4],
          ],
          false,
        ),
        line(sk.shadow, 1.4, (h.old - 0.5) * 0.7),
      ),
    );
  return `<defs><linearGradient id="neckG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${mix(sk.base, sk.half, 0.5)}"/><stop offset="0.3" stop-color="${mix(sk.base, sk.lit, 0.15)}"/>
<stop offset="0.62" stop-color="${mix(sk.base, sk.shadow, 0.5)}"/><stop offset="1" stop-color="${sk.deep}"/></linearGradient>
<clipPath id="neckClip">${path(d, "")}</clipPath></defs>
${path(d, `fill="url(#neckG)"`)}
<g clip-path="url(#neckClip)"><g filter="url(#soft4)">${parts.join("")}</g></g>`;
}

export function paintEar(h: Head, s: Sitting, sk: SkinPalette): string {
  const [x, y] = h.ear;
  const H = h.earH;
  const W = H * (s.look.ears === 3 ? 0.68 : 0.52);
  const d = smooth([
    [x + W * 0.32, y - H * 0.42],
    [x - W * 0.05, y - H * 0.5],
    [x - W * 0.55, y - H * 0.34],
    [x - W * 0.62, y + H * 0.02],
    [x - W * 0.38, y + H * 0.34],
    [x - W * 0.12, y + H * 0.52],
    [x + W * 0.16, y + H * 0.46],
    [x + W * 0.42, y + H * 0.05],
  ]);
  // The rim (helix) catches the light; the bowl (concha) is dark.
  const rim = smooth(
    [
      [x - W * 0.02, y - H * 0.42],
      [x - W * 0.46, y - H * 0.27],
      [x - W * 0.52, y + H * 0.05],
      [x - W * 0.3, y + H * 0.32],
    ],
    false,
  );
  return `<g>
${path(d, `fill="${mix(sk.base, sk.blush, 0.42)}"`)}
<g filter="url(#soft15)">
${ell(x + W * 0.04, y + H * 0.04, W * 0.24, H * 0.2, fillOp(sk.deep, 0.75))}
${path(
  smooth(
    [
      [x + W * 0.12, y - H * 0.32],
      [x - W * 0.3, y - H * 0.2],
      [x - W * 0.34, y + H * 0.12],
      [x - W * 0.12, y + H * 0.22],
    ],
    false,
  ),
  line(sk.shadow, 1.8, 0.55),
)}
${path(rim, line(sk.lit, 1.8, 0.65))}
${ell(x + W * 0.32, y, W * 0.2, H * 0.45, fillOp(sk.shadow, 0.6))}
${ell(x - W * 0.22, y + H * 0.38, W * 0.16, H * 0.1, fillOp(sk.lit, 0.35))}
</g>
${path(
  smooth(
    [
      [x - W * 0.02, y - H * 0.47],
      [x - W * 0.55, y - H * 0.3],
      [x - W * 0.6, y + H * 0.04],
      [x - W * 0.36, y + H * 0.34],
      [x - W * 0.1, y + H * 0.5],
    ],
    false,
  ),
  line(sk.line, 0.8, 0.5),
)}
</g>`;
}

/** The face itself: skin, modelling, then features. */
export function paintFace(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const P = h.P;
  const full = s.detail === "full";
  const faceD = smooth(h.outline, true, 0.5);
  const sc = h.skull;
  const skullD = `M${n(sc.cx - sc.rx)} ${n(sc.cy)}a${n(sc.rx)} ${n(sc.ry)} 0 1 0 ${n(sc.rx * 2)} 0a${n(sc.rx)} ${n(sc.ry)} 0 1 0 ${n(-sc.rx * 2)} 0Z`;
  const [lx, ly] = P(-0.42, -0.38);
  const out: string[] = [];
  out.push(`<defs>
<radialGradient id="skinG" gradientUnits="userSpaceOnUse" cx="${n(lx)}" cy="${n(ly)}" r="${n(h.a * 1.75)}" fx="${n(lx - 4)}" fy="${n(ly - 6)}">
<stop offset="0" stop-color="${mix(sk.base, sk.lit, 0.35)}"/><stop offset="0.28" stop-color="${sk.base}"/>
<stop offset="0.55" stop-color="${mix(sk.base, sk.half, 0.6)}"/><stop offset="0.8" stop-color="${mix(sk.half, sk.shadow, 0.6)}"/><stop offset="1" stop-color="${sk.shadow}"/></radialGradient>
<clipPath id="faceClip">${path(faceD, "")}</clipPath>
<clipPath id="headClip">${path(faceD, "")}${path(skullD, "")}</clipPath></defs>`);
  // Laid in softly, so the face melts into the hair and the dark.
  out.push(
    `<g${full ? ` filter="url(#soft06)"` : ""}>${path(skullD, `fill="url(#skinG)"`)}${path(faceD, `fill="url(#skinG)"`)}</g>`,
  );

  const male = !s.female && h.child < 0.4;
  const e = h.expr;
  const cheekLift = e.cheek * h.b * 0.045;

  // ---- The colour of the skin: gold above, red across the middle, cool below.
  const zones: string[] = [];
  const kid = 1 + h.child * 0.5;
  const ruddy = (L.marks.includes("ruddy") ? 1.45 : 1) * kid;
  const [gx, gy] = P(-0.15, -0.66);
  zones.push(ell(gx, gy, h.a * 0.7, h.b * 0.28, fillOp(sk.gold, 0.55)));
  const [bx, by] = P(-0.48, 0.2);
  zones.push(
    ell(
      bx,
      by - cheekLift,
      h.a * 0.34,
      h.b * 0.2,
      fillOp(sk.blush, Math.min(0.8, 0.5 * ruddy * (s.female ? 1.2 : 1))),
    ),
  );
  const [fx, fy] = P(0.62, 0.16);
  zones.push(
    ell(
      fx,
      fy - cheekLift,
      h.a * 0.18,
      h.b * 0.17,
      fillOp(sk.blush, 0.4 * ruddy),
    ),
  );
  zones.push(
    ell(
      h.noseTip[0] - 1,
      h.noseTip[1] - h.noseLen * 0.2,
      h.noseW * 0.42,
      h.noseLen * 0.3,
      fillOp(sk.blush, 0.32 * ruddy),
    ),
  );
  const [jx, jy] = P(0.05, 0.78);
  zones.push(
    ell(
      jx,
      jy,
      h.a * 0.8,
      h.b * 0.3,
      fillOp(
        male
          ? mix(sk.cool, "#5a6870", L.beard === "none" ? 0.15 : 0.3)
          : sk.cool,
        male ? 0.55 : 0.22,
      ),
    ),
  );
  out.push(
    `<g clip-path="url(#headClip)"><g filter="url(#soft${full ? 6 : 4})">${zones.join("")}</g></g>`,
  );

  // ---- Light and shadow: the masses.
  const m: string[] = [];
  // The far side of the face turns from the light: a cool half-tone
  // first, its edge following the form (out over the brow and cheekbone,
  // in at the temple, the socket and under the cheekbone)...
  const hollow = L.cheeks === 3 || h.gaunt > 0.4;
  m.push(
    path(
      smooth([
        P(0.36, -1.25),
        P(0.38, -0.78),
        P(0.46, -0.5),
        P(0.36, -0.22),
        P(0.46, 0.02),
        P(hollow ? 0.28 : 0.36, 0.32),
        P(0.3, 0.6),
        P(0.2, 0.86),
        P(0.08, 1.1),
        [h.cx + h.a * 1.5, h.cy + h.b * 1.3],
        [h.cx + h.a * 1.5, h.cy - h.b * 1.6],
      ]),
      fillOp(mix(sk.half, sk.shadow, 0.3), 0.7),
    ),
  );
  // ...then the shadow proper, near the contour, warm.
  m.push(
    path(
      smooth([
        P(0.6, -1.25),
        P(0.62, -0.8),
        P(0.72, -0.5),
        P(0.6, -0.24),
        P(0.7, 0.02),
        P(hollow ? 0.5 : 0.58, 0.34),
        P(0.5, 0.62),
        P(0.4, 0.88),
        P(0.28, 1.1),
        [h.cx + h.a * 1.5, h.cy + h.b * 1.35],
        [h.cx + h.a * 1.5, h.cy - h.b * 1.6],
      ]),
      fillOp(sk.shadow, 0.9),
    ),
  );
  // The back of the head, turned away from us.
  m.push(
    ell(
      sc.cx - sc.rx * 0.95,
      sc.cy + sc.ry * 0.2,
      sc.rx * 0.32,
      sc.ry * 0.9,
      fillOp(sk.shadow, 0.45),
    ),
  );
  // The near side of the head turns away from the light, from the temple
  // down past the ear to the jaw.
  m.push(
    path(
      smooth(
        [
          [h.outline[0][0] + 2, h.outline[0][1] + 6],
          [h.outline[1][0] + 3, h.outline[1][1]],
          [h.outline[2][0] + 3.5, h.outline[2][1]],
          [h.outline[3][0] + 4, h.outline[3][1]],
          [h.outline[4][0] + 4, h.outline[4][1] - 2],
          [h.outline[5][0] + 3, h.outline[5][1] - 3],
        ],
        false,
      ),
      line(sk.half, h.a * 0.16, 0.35),
    ),
  );
  // The near temple turns away; the cheek hollows under its bone.
  const [tx, ty] = P(-0.86, -0.55);
  m.push(ell(tx, ty, h.a * 0.16, h.b * 0.26, fillOp(sk.half, 0.5)));
  m.push(
    path(
      smooth(
        [
          [h.ear[0] + h.a * 0.12, h.ear[1] + h.b * 0.06],
          P(-0.66, 0.34),
          [h.mouth[0] - h.mouthW * 0.8, h.mouth[1] - 1],
        ],
        false,
      ),
      line(
        sk.half,
        h.b * (0.12 + h.gaunt * 0.06),
        0.32 + h.gaunt * 0.35 + h.bones * 0.15 - h.fat * 0.15,
      ),
    ),
  );
  // The near jaw's underside, and the round of the chin.
  m.push(
    path(
      smooth(
        [h.jawN, P(-0.55, 0.84), [h.chin[0] - h.a * 0.18, h.chin[1] - 1]],
        false,
      ),
      line(sk.half, h.b * 0.12, 0.5),
    ),
  );
  m.push(
    ell(
      h.cx + h.a * 0.1,
      h.cy + h.b * 1.1,
      h.a * 1.15,
      h.b * 0.15,
      fillOp(sk.deep, 0.5),
    ),
  );
  // The eye sockets: the brow overhangs them.
  const deepSet = L.eyes === 5 ? 1.35 : L.eyes === 6 ? 0.7 : 1;
  const socket =
    (0.6 + h.bones * 0.2 + h.old * 0.1) *
    deepSet *
    (lum(sk.base) < 0.5 ? 0.7 : 1);
  m.push(
    ell(
      h.eyeN[0] + h.eyeW * 0.06,
      h.eyeN[1] - h.eyeH * 0.2,
      h.eyeW * 0.92,
      h.eyeH * 1.75,
      fillOp(mix(sk.half, sk.shadow, 0.7), socket),
      -6,
    ),
  );
  // The deepest corner, between the brow and the bridge of the nose.
  m.push(
    ell(
      h.eyeN[0] + h.eyeW * 0.5,
      h.eyeN[1] - h.eyeH * 0.75,
      h.eyeW * 0.3,
      h.eyeH * 0.8,
      fillOp(sk.shadow, socket * 0.55),
      -30,
    ),
  );
  m.push(
    ell(
      h.eyeF[0] - h.eyeWF * 0.05,
      h.eyeF[1] - h.eyeH * 0.35,
      h.eyeWF * 0.9,
      h.eyeH * 1.7,
      fillOp(sk.shadow, socket * 1.2),
    ),
  );
  // The nose's shadow on the lip (its far plane is painted with the nose).
  const tip = h.noseTip;
  m.push(
    ell(
      tip[0] + h.noseW * 0.28,
      tip[1] + h.noseW * 0.42,
      h.noseW * 0.42,
      h.noseW * 0.18,
      fillOp(sk.deep, 0.42),
      12,
    ),
  );
  // Below the lower lip, a ledge of shadow; the chin's ball beneath.
  m.push(
    ell(
      h.mouth[0],
      h.mouth[1] + h.b * 0.14,
      h.mouthW * 0.34,
      h.b * 0.05,
      fillOp(sk.shadow, 0.55),
    ),
  );
  // Flesh: full cheeks and a heavy jaw.
  if (h.fat > 0.3) {
    const [px, py] = P(-0.62, 0.62);
    m.push(
      path(
        smooth(
          [
            [px - 3, py - h.b * 0.2],
            [px + 2, py],
            [h.chin[0] - h.a * 0.35, h.chin[1] - h.b * 0.06],
          ],
          false,
        ),
        line(sk.half, 3.5, (h.fat - 0.2) * 0.5),
      ),
    );
  }
  // Age: hollows under the eyes and at the temple.
  if (h.old > 0.15 || h.gaunt > 0.5) {
    const o = Math.min(1, Math.max(h.old, h.gaunt * 0.6));
    m.push(
      ell(
        h.eyeN[0] - 1,
        h.eyeN[1] + h.eyeH * 1.4,
        h.eyeW * 0.48,
        h.eyeH * 0.55,
        fillOp(sk.half, 0.45 * o),
      ),
    );
    m.push(
      ell(tx + 2, ty + 3, h.a * 0.12, h.b * 0.16, fillOp(sk.shadow, 0.3 * o)),
    );
  }
  // A man's shaven jaw shows a shade of beard.
  if (male && L.beard !== "full") {
    const st = L.beard === "stubble" ? 0.55 : 0.2;
    const beardC = mix(sk.shadow, "#34404c", 0.45);
    m.push(
      ell(
        h.mouth[0] - 2,
        h.mouth[1] - h.b * 0.075,
        h.mouthW * 0.6,
        h.b * 0.045,
        fillOp(beardC, st),
      ),
    );
    m.push(
      path(
        smooth([
          P(-0.94, 0.42),
          P(-0.3, 0.62),
          P(0.3, 0.72),
          P(0.85, 0.55),
          h.jawF,
          [h.chin[0] + 6, h.chin[1] + 2],
          [h.chin[0] - 10, h.chin[1] + 2],
          h.jawN,
        ]),
        fillOp(beardC, st),
      ),
    );
  }
  out.push(
    `<g clip-path="url(#headClip)"><g filter="url(#${full ? "scumble" : "soft3"})">${m.join("")}</g></g>`,
  );

  // ---- The lights, laid on with a firmer edge.
  const lt: string[] = [];
  const [ox, oy] = P(-0.3, -0.62);
  lt.push(ell(ox, oy, h.a * 0.36, h.b * 0.17, fillOp(sk.lit, 0.22), -6));
  // The brow ridge over the near eye.
  lt.push(
    ell(
      h.eyeN[0] - h.eyeW * 0.15,
      h.browY + 2.5,
      h.eyeW * 0.55,
      h.eyeH * 0.42,
      fillOp(sk.lit, 0.3),
      -4,
    ),
  );
  // The near cheekbone.
  const [hx, hy] = P(-0.5, 0.02);
  lt.push(
    ell(
      hx,
      hy - cheekLift,
      h.a * (0.24 + h.bones * 0.04),
      h.b * 0.1,
      fillOp(sk.lit, 0.24 + h.bones * 0.2 + e.cheek * 0.15),
      -18,
    ),
  );
  // Down the bridge of the nose.
  lt.push(
    path(
      smooth(
        [
          [h.noseRoot[0] - 1.2, h.noseRoot[1] + 2],
          [
            (h.noseRoot[0] + tip[0]) / 2 -
              h.noseW * 0.1 +
              (L.nose === 1 || L.nose === 6 ? 1.2 : 0),
            (h.noseRoot[1] + tip[1]) / 2,
          ],
          [tip[0] - h.noseW * 0.12, tip[1] - h.noseW * 0.3],
        ],
        false,
      ),
      line(sk.lit, h.noseW * 0.2, s.detail === "full" ? 0.35 : 0.2),
    ),
  );
  // The near ridge of the upper lip, and the chin.
  lt.push(
    ell(
      h.mouth[0] - h.mouthW * 0.24,
      h.mouth[1] - h.b * 0.1,
      h.mouthW * 0.2,
      h.b * 0.035,
      fillOp(sk.lit, 0.45),
      -8,
    ),
  );
  lt.push(
    ell(
      h.chin[0] - h.a * 0.12,
      h.chin[1] - h.b * 0.13,
      h.a * 0.17,
      h.b * 0.07,
      fillOp(sk.lit, 0.48),
    ),
  );
  // Light thrown back from the collar onto the far jaw and cheek.
  lt.push(
    path(
      smooth(
        [h.outline[12], h.outline[11], h.outline[10], h.outline[9]].map(
          ([x, y]): Pt => [x - 2.6, y],
        ),
        false,
      ),
      line(sk.refl, 2.6, 0.35),
    ),
  );
  out.push(
    `<g clip-path="url(#headClip)"><g filter="url(#soft${full ? 3 : 2})">${lt.join("")}</g>${
      full
        ? `<rect x="${n(h.cx - h.a * 1.4)}" y="${n(h.top)}" width="${n(h.a * 2.8)}" height="${n(h.b * 2.8)}" filter="url(#skinNoise)" opacity="0.16" style="mix-blend-mode:multiply"/>`
        : ""
    }</g>`,
  );
  out.push(paintLines(h, s, sk));
  out.push(paintEyes(h, s, sk));
  out.push(paintBrows(h, s, sk));
  out.push(paintNose(h, s, sk));
  out.push(paintMouth(h, s, sk));
  out.push(paintMarks(h, s, sk));
  // The far cheek's edge melts into the dark.
  out.push(
    path(
      smooth(h.outline.slice(7, 16), false),
      `fill="none" stroke="${sk.deep}" stroke-width="3" opacity="0.55" filter="url(#soft2)"`,
    ),
  );
  return out.join("\n");
}

// ---------------------------------------------------------------- eyes

function eyeShape(
  e: Pt,
  w: number,
  hgt: number,
  shape: number,
  inner: 1 | -1,
  squint: number,
  wide: number,
): { upper: Pt[]; lower: Pt[] } {
  // Local x: -1 outer corner, +1 inner corner (toward the nose).
  const X = (t: number) => e[0] + (t * w * inner) / 2;
  const Y = (t: number) => e[1] + t * hgt;
  const outer =
    shape === 4 ? 0.32 : shape === 7 ? -0.3 : shape === 3 ? -0.06 : 0.06;
  const innerY = shape === 4 ? 0.02 : 0.16;
  const top =
    ([0.6, 0.72, 0.48, 0.52, 0.58, 0.56, 0.74, 0.58][shape] ?? 0.6) +
    wide * 0.3 -
    squint * 0.08;
  const bot =
    ([0.36, 0.44, 0.34, 0.3, 0.38, 0.32, 0.44, 0.32][shape] ?? 0.36) -
    squint * 0.3 +
    wide * 0.12;
  const upper: Pt[] = [
    [X(-1), Y(outer)],
    [X(-0.6), Y(-top * 0.88 + outer * 0.3)],
    [X(0.05), Y(-top)],
    [X(0.6), Y(-top * 0.8)],
    [X(0.9), Y(innerY - 0.2)],
    [X(1), Y(innerY)],
  ];
  const lower: Pt[] = [
    [X(-1), Y(outer)],
    [X(-0.42), Y(bot + outer * 0.3)],
    [X(0.3), Y(bot * 0.92)],
    [X(0.82), Y(bot * 0.45 + innerY * 0.5)],
    [X(1), Y(innerY)],
  ];
  return { upper, lower };
}

function paintEye(
  h: Head,
  s: Sitting,
  sk: SkinPalette,
  e: Pt,
  w: number,
  inner: 1 | -1,
  id: string,
  farSide: boolean,
): string {
  const L = s.look;
  const lite = s.detail === "lite";
  const hgt = h.eyeH;
  const { upper, lower } = eyeShape(
    e,
    w,
    hgt,
    L.eyes,
    inner,
    h.expr.squint,
    h.expr.wide,
  );
  const lids = smooth([...upper, ...lower.slice(1, -1).reverse()], true, 0.45);
  // Even light eyes read dark in a painted face.
  const iris = mix(
    EYE_COLORS[L.eyeColor]?.hex ?? EYE_COLORS[1].hex,
    "#1c120a",
    0.4,
  );
  // The eyes look toward us, so a little to the left in a head turned right.
  // The iris fills the eye's height: the upper lid covers its top, the
  // lower lid just meets it (unless the eyes are opened wide).
  const yTop = Math.min(...upper.map((p) => p[1]));
  const yBot = Math.max(...lower.map((p) => p[1]));
  const open = yBot - yTop;
  const r =
    Math.min(w * 0.32, open * (0.66 - h.expr.wide * 0.12)) *
    (1 + h.child * 0.06) *
    (farSide ? 0.98 : 1);
  const ix = e[0] - w * 0.1 + (farSide ? w * 0.04 : 0);
  const iy = (yTop + yBot) / 2 + open * (0.16 - h.expr.wide * 0.18);
  const white = mix(
    mix("#c4b49a", sk.base, 0.55),
    farSide ? sk.shadow : sk.half,
    0.38,
  );
  const lash = mix(sk.deep, "#0e0603", 0.75);
  const out: string[] = [];
  // The lid between the crease and the lashes: lit on the near eye.
  const hooded = L.eyes === 2;
  const lift =
    hgt * (hooded ? 0.42 : L.eyes === 5 ? 0.95 : 0.78) * (1 - h.old * 0.25) +
    h.expr.wide * hgt * 0.15;
  const crease = upper.map(
    ([x, y], i): Pt => [
      x + (i === 0 ? -inner * 1.5 : i === 5 ? inner * 0.5 : 0),
      y - lift * (i === 0 ? 0.3 : i >= 4 ? 0.35 : 1),
    ],
  );
  out.push(
    `<defs><clipPath id="${id}">${path(lids, "")}</clipPath>
<radialGradient id="${id}i" cx="0.58" cy="0.62" r="0.62"><stop offset="0" stop-color="${mix(iris, "#e6d4b0", 0.22)}"/><stop offset="0.55" stop-color="${iris}"/><stop offset="0.85" stop-color="${shade(iris, 0.45)}"/><stop offset="1" stop-color="${shade(iris, 0.75)}"/></radialGradient>
<radialGradient id="${id}w" cx="${inner === 1 ? 0.42 : 0.58}" cy="0.55" r="0.62"><stop offset="0" stop-color="${white}"/><stop offset="0.7" stop-color="${mix(white, sk.shadow, 0.35)}"/><stop offset="1" stop-color="${mix(white, sk.deep, 0.5)}"/></radialGradient></defs>`,
  );
  if (!lite) {
    // Under the brow, the socket; then the crease, and the round of the lid
    // catching the light above the lashes.
    out.push(
      path(
        smooth(
          [
            ...crease.map(([x, y]): Pt => [x, y - hgt * 0.15]),
            ...crease
              .slice()
              .reverse()
              .map(([x, y]): Pt => [x, y - hgt * 0.95]),
          ],
          true,
          0.4,
        ),
        `fill="${mix(sk.shadow, sk.half, 0.4)}" opacity="${farSide ? 0.4 : 0.25}" filter="url(#soft2)"`,
      ),
    );
    out.push(
      path(
        smooth([...upper, ...crease.slice().reverse()], true, 0.4),
        `fill="${farSide ? sk.half : mix(sk.base, sk.lit, 0.45)}" opacity="0.62" filter="url(#soft06)"`,
      ),
    );
    out.push(
      path(
        smooth(crease.slice(0, 5), false),
        `${line(mix(sk.shadow, sk.deep, 0.45), 1.5, 0.7)} filter="url(#soft06)"`,
      ),
    );
  }
  out.push(path(lids, `fill="url(#${id}w)"`));
  out.push(`<g clip-path="url(#${id})">`);
  out.push(ell(ix, iy, r, r, `fill="url(#${id}i)"`));
  out.push(ell(ix, iy, r * 0.42, r * 0.42, `fill="#0c0603"`));
  // The upper lid's shadow on the eyeball, and the corners in shade.
  out.push(
    `<g filter="url(#soft1)">${path(smooth(upper, false), line(sk.deep, hgt * 1.15, 0.68))}${ell(e[0] - (inner * w) / 2, e[1], w * 0.24, hgt, fillOp(sk.shadow, 0.55))}</g>`,
  );
  out.push(`</g>`);
  // The wet light in the eye.
  const cr = r * (farSide ? 0.16 : 0.2) * (lite ? 1.3 : 1);
  out.push(
    ell(
      ix - r * 0.36,
      iy - r * 0.34,
      cr,
      cr * 0.9,
      `fill="#fff6e6" opacity="${farSide ? 0.6 : 0.85}"`,
    ),
  );
  // The lashes along the upper lid, heaviest at the outer corner.
  const lw = Math.max(1.4, hgt * (lite ? 0.5 : 0.44)) * (s.female ? 1.1 : 1);
  const ext: Pt = [upper[0][0] - inner * w * 0.08, upper[0][1] + hgt * 0.05];
  out.push(
    `<g filter="url(#${lite ? "soft06" : "soft1"})">${stroke([ext, ...upper.slice(0, 5)], lw, `fill="${lash}" opacity="0.88"`, [0.35, 0.25])}</g>`,
  );
  // The lower lid: a lit rim and a shadow under it.
  if (!lite) {
    out.push(
      path(
        smooth(
          lower.map(([x, y]): Pt => [x, y + 0.8]),
          false,
        ),
        line(farSide ? sk.half : sk.lit, 1.1, 0.5),
      ),
    );
    out.push(
      path(
        smooth(
          lower.slice(0, 4).map(([x, y]): Pt => [x, y + hgt * 0.5]),
          false,
        ),
        `${line(mix(sk.shadow, sk.half, 0.3), 1.6, 0.25 + h.old * 0.2)} filter="url(#soft15)"`,
      ),
    );
  }
  out.push(
    path(
      smooth(lower, false),
      `${line(mix(sk.line, lash, 0.3), 0.75, 0.55)} filter="url(#soft06)"`,
    ),
  );
  // The pink of the inner corner.
  out.push(
    ell(
      upper[5][0] - inner * w * 0.05,
      upper[5][1] + 0.2,
      w * 0.05,
      hgt * 0.13,
      fillOp(mix(sk.blush, sk.shadow, 0.3), 0.45),
    ),
  );
  return `<g>${out.join("")}</g>`;
}

function paintEyes(h: Head, s: Sitting, sk: SkinPalette): string {
  return (
    paintEye(h, s, sk, h.eyeN, h.eyeW, 1, "eN", false) +
    paintEye(h, s, sk, h.eyeF, h.eyeWF, -1, "eF", true)
  );
}

// ---------------------------------------------------------------- brows

function paintBrows(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const lite = s.detail === "lite";
  const hair = hairTone(s);
  const c = mix(
    mix(hair, sk.shadow, 0.45),
    "#1a0e08",
    lum(hair) > 0.5 ? 0.35 : 0.1,
  );
  const width =
    (s.female ? [2.1, 2.5, 2.8, 3.4, 3.8] : [3, 3.5, 4, 4.9, 5.4])[L.brows] *
    (1 - h.child * 0.25) *
    (lite ? 1.45 : 1);
  const arch = [3.0, 4.2, 1.4, 2.0, 2.4][L.brows];
  const E = h.expr;
  const brow = (e: Pt, w: number, inner: 1 | -1) => {
    const x = (t: number) => e[0] + (t * w * inner) / 2;
    const y0 = h.browY + (e[1] - h.eyeN[1]);
    // Anger draws the inner ends down and together; worry lifts them.
    const inY = y0 + 1.4 + E.browIn * 3 - E.browUp * 3.6;
    const inX = x(0.98 + E.browIn * 0.12);
    const pts: Pt[] = [
      [inX, inY],
      [x(0.45), y0 - arch * 0.7 - E.browUp * 2.2 + E.browIn * 1.2],
      [x(-0.25), y0 - arch - E.browUp * 0.6 + E.browIn * 0.2],
      [x(-1.1), y0 + 2 + E.browUp * 1.4 - E.browIn * 0.7],
    ];
    const main = stroke(
      pts,
      width,
      `fill="${c}" opacity="${lite ? 0.95 : 0.9}"`,
      [0.75, 0.12],
    );
    let hairs = "";
    if (!lite && L.brows >= 2) {
      const br = new Brush(s.seed + (inner === 1 ? 3 : 7));
      const cv = curve(pts[0], pts[1], pts[3], 12);
      for (let i = 0; i < (L.brows >= 3 ? 14 : 8); i++) {
        const p = cv[Math.floor(br.range(0, 0.99) * 12)];
        hairs += path(
          `M${n(p[0])} ${n(p[1] + br.range(-1, 1.2))}l${n(-inner * br.range(1.5, 3))} ${n(br.range(-1.6, -0.4))}`,
          `stroke="${c}" stroke-width="0.6" opacity="0.6"`,
        );
      }
    }
    return main + hairs;
  };
  return `<g filter="url(#${lite ? "soft06" : "soft1"})">${brow(h.eyeN, h.eyeW * 1.25, 1)}${brow(h.eyeF, h.eyeWF * 1.2, -1)}</g>`;
}

// ---------------------------------------------------------------- nose

function paintNose(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const t = h.noseTip;
  const w = h.noseW;
  const dark = mix(sk.deep, "#1a0a04", 0.5);
  const hooked = L.nose === 1 || L.nose === 6;
  const snub = L.nose === 2 || L.nose === 5;
  const bulb = L.nose === 7 ? 1.35 : L.nose === 3 ? 1.12 : 1;
  const flare = 1 + h.expr.tight * 0.12;
  const out: string[] = [];
  const id = `nt${s.seed % 1000}`;
  // The ridge from the root to the tip, bowed out for an aquiline nose.
  const bump = hooked ? 2.6 : snub ? -0.8 : 0;
  const mid: Pt = [
    (h.noseRoot[0] + t[0]) / 2 + bump,
    (h.noseRoot[1] + t[1]) / 2,
  ];
  // The near side of the nose turns down to the cheek in a half-tone; the
  // ridge catches the light.
  out.push(
    path(
      smooth(
        [
          [h.noseRoot[0] - w * 0.3, h.noseRoot[1] + h.noseLen * 0.18],
          [mid[0] - w * 0.36, mid[1] + h.noseLen * 0.05],
          [t[0] - w * 0.46, t[1] - w * 0.3],
        ],
        false,
      ),
      `${line(sk.half, w * 0.28, 0.32)} filter="url(#soft15)"`,
    ),
  );
  out.push(
    path(
      smooth(
        [
          [h.noseRoot[0] - 0.6, h.noseRoot[1] + h.noseLen * 0.2],
          [mid[0] - w * 0.06, mid[1]],
          [t[0] - w * 0.1, t[1] - w * 0.36],
        ],
        false,
      ),
      `${line(sk.lit, w * 0.12, 0.55)} filter="url(#soft06)"`,
    ),
  );
  // The far plane of the nose, turned from the light.
  out.push(
    path(
      smooth([
        [h.noseRoot[0] + w * 0.06, h.noseRoot[1] + h.noseLen * 0.12],
        [mid[0] + w * 0.08, mid[1]],
        [t[0] + w * 0.1, t[1] - w * 0.34],
        [t[0] + w * 0.42 * bulb, t[1] - w * 0.04],
        [t[0] + w * 0.3, t[1] + w * 0.16],
        [t[0] + w * 0.52, t[1] - w * 0.24],
        [mid[0] + w * 0.38, mid[1]],
        [h.noseRoot[0] + w * 0.32, h.noseRoot[1]],
      ]),
      `fill="${sk.shadow}" opacity="0.62" filter="url(#soft15)"`,
    ),
  );
  // The far side of the nose, against the far cheek: firm at the tip,
  // lost toward the brow. (Too fine for a small portrait.)
  if (s.detail === "full")
    out.push(
      path(
        smooth(
          [
            [mid[0] + w * 0.18, mid[1]],
            [t[0] + w * 0.28 * bulb, t[1] - w * 0.3],
            [t[0] + w * 0.38 * bulb, t[1] - w * 0.05],
          ],
          false,
        ),
        `${line(sk.shadow, 1.8, 0.4)} filter="url(#soft15)"`,
      ),
    );
  // The underside of the nose, in shadow.
  out.push(
    path(
      smooth([
        [t[0] - w * 0.48 * flare, t[1] + w * 0.02],
        [t[0] - w * 0.1, t[1] + w * 0.16],
        [t[0] + w * 0.36 * flare, t[1] + w * 0.06],
        [t[0] + w * 0.18, t[1] - w * 0.06],
        [t[0] - w * 0.24, t[1] - w * 0.04],
      ]),
      `fill="${sk.shadow}" opacity="0.4" filter="url(#soft15)"`,
    ),
  );
  // The tip: a rounded form lit from the left.
  out.push(
    `<defs><radialGradient id="${id}" cx="0.32" cy="0.3" r="0.75"><stop offset="0" stop-color="${mix(sk.lit, sk.blush, 0.15)}"/><stop offset="0.5" stop-color="${mix(sk.base, sk.blush, 0.3)}" stop-opacity="0.7"/><stop offset="1" stop-color="${sk.shadow}" stop-opacity="0"/></radialGradient></defs>`,
  );
  out.push(
    ell(
      t[0] - w * 0.04,
      t[1] - w * 0.14,
      w * 0.25 * bulb,
      w * 0.22 * bulb,
      `fill="url(#${id})" filter="url(#soft06)"`,
    ),
  );
  // The near wing and the groove around it.
  out.push(
    path(
      smooth(
        [
          [t[0] - w * 0.22, t[1] - w * 0.38],
          [t[0] - w * 0.48 * flare, t[1] - w * 0.12],
          [t[0] - w * 0.5 * flare, t[1] + w * 0.06],
          [t[0] - w * 0.34, t[1] + w * 0.14],
        ],
        false,
      ),
      `${line(sk.shadow, 1.6, 0.6)} filter="url(#soft06)"`,
    ),
  );
  out.push(
    ell(
      t[0] - w * 0.36,
      t[1] - w * 0.1,
      w * 0.11,
      w * 0.09,
      `fill="${sk.lit}" opacity="0.35" filter="url(#soft06)"`,
    ),
  );
  // The nostrils: the near one a dark comma, the far a sliver.
  out.push(
    ell(
      t[0] - w * 0.22,
      t[1] + w * (snub ? 0.06 : 0.09),
      w * 0.13 * flare,
      w * (snub ? 0.075 : 0.055),
      `fill="${dark}" opacity="0.9" filter="url(#soft06)"`,
      -12,
    ),
  );
  out.push(
    ell(
      t[0] + w * 0.17,
      t[1] + w * 0.08,
      w * 0.07,
      w * 0.04,
      `fill="${dark}" opacity="0.7" filter="url(#soft06)"`,
      14,
    ),
  );
  // The highlight on the tip.
  out.push(
    ell(
      t[0] - w * 0.11,
      t[1] - w * 0.24,
      w * 0.07,
      w * 0.06,
      `fill="${sk.sheen}" opacity="0.75" filter="url(#soft06)"`,
    ),
  );
  if (hooked)
    out.push(
      ell(mid[0] - 0.5, mid[1] - 1, w * 0.07, w * 0.12, fillOp(sk.sheen, 0.4)),
    );
  return `<g>${out.join("")}</g>`;
}

// ---------------------------------------------------------------- mouth

function paintMouth(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const lite = s.detail === "lite";
  const [mx, my] = h.mouth;
  const W = h.mouthW;
  const k = h.b / 46;
  const E = h.expr;
  const press = Math.min(1, E.tight * 0.45);
  const up =
    [3.4, 4.6, 3.8, 3.6, 4.4][L.mouth] *
    k *
    (1 - h.child * 0.15) *
    (1 - h.old * 0.32) *
    (1 - press) *
    (1 - E.mouth * 0.04);
  const lo =
    [4.8, 6.8, 5.4, 5.0, 6.2][L.mouth] *
    k *
    (1 - h.child * 0.1) *
    (1 - h.old * 0.25) *
    (1 - press * 0.8);
  const bow = L.mouth === 4 ? 1.4 : L.mouth === 0 ? 0.5 : 0.9;
  // The corners lift in a smile, fall in a frown; the mouth widens to smile.
  const curl = -E.mouth * 2.6 * k;
  const nX = mx - W * (0.56 + Math.max(0, E.mouth) * 0.04);
  const fX = mx + W * (0.4 + Math.max(0, E.mouth) * 0.03);
  const cYn = my + curl;
  const cYf = my + curl * 0.8;
  const gap = E.open * 4.6 * k;
  const midDrop = E.mouth > 0 ? 0.6 : E.mouth < 0 ? -0.5 * -E.mouth * 0.4 : 0;
  // The parting of the lips (the top edge of the opening, when open).
  const top: Pt[] = [
    [nX, cYn],
    [mx - W * 0.3, my + curl * 0.35],
    [mx - W * 0.02, my + 0.6 + midDrop - E.mouth * 0.2],
    [mx + W * 0.2, my + curl * 0.3 + 0.3],
    [fX, cYf],
  ];
  // The lower edge of the opening.
  const bot: Pt[] = top.map(([x, y], i): Pt => {
    const f = i === 0 || i === 4 ? 0 : i === 2 ? 1 : 0.75;
    return [x, y + gap * f * (E.mouth > 0 ? 1 : 0.8)];
  });
  const upper: Pt[] = [
    top[0],
    [mx - W * 0.32, my - up * 0.82 + curl * 0.2],
    [mx - W * 0.08, my - up * 1.06],
    [mx + W * 0.0, my - up + bow],
    [mx + W * 0.08, my - up * 1.02],
    [mx + W * 0.26, my - up * 0.7 + curl * 0.15],
    top[4],
  ];
  const lower: Pt[] = [
    bot[4],
    [mx + W * 0.22, my + gap + lo * 0.84],
    [mx - W * 0.06, my + gap + lo * 1.04],
    [mx - W * 0.34, my + gap + lo * 0.8],
    bot[0],
  ];
  const lipUp = mix(sk.lip, sk.shadow, 0.42);
  const lipLo = sk.lip;
  const lineC = mix(sk.lip, "#1a0804", lite ? 0.88 : 0.78);
  const out: string[] = [];
  // The shadow the lower lip throws.
  out.push(
    ell(
      mx - W * 0.04,
      my + gap + lo * 1.45,
      W * 0.28,
      lo * 0.42,
      `fill="${sk.shadow}" opacity="0.5" filter="url(#soft15)"`,
    ),
  );
  out.push(`<g filter="url(#soft06)">`);
  if (gap > 0.6) {
    // The mouth open: dark within, and teeth in a smile.
    const hole = smooth([...top, ...bot.slice(1, -1).reverse()], true, 0.4);
    out.push(path(hole, `fill="#2a0f0a"`));
    // Teeth: the upper row in a smile; clenched, both rows, in anger.
    const clench = E.mouth <= 0.4;
    const tk = clench ? 1 : 0.55;
    if (E.mouth > 0.4 || E.tight > 0.8)
      out.push(
        `<clipPath id="mouthIn">${path(hole, "")}</clipPath><g clip-path="url(#mouthIn)">${path(
          smooth(
            [
              [nX + W * 0.12, top[0][1] - 1],
              [mx - W * 0.02, top[2][1] - 1],
              [fX - W * 0.08, top[4][1] - 1],
              [fX - W * 0.1, top[4][1] + gap * tk],
              [mx - W * 0.02, top[2][1] + gap * (tk + 0.07)],
              [nX + W * 0.14, top[0][1] + gap * tk],
            ],
            true,
            0.4,
          ),
          `fill="${mix("#e8dcc4", sk.base, 0.2)}" opacity="0.92"`,
        )}${
          clench
            ? path(
                smooth(
                  [
                    [nX, top[0][1] + gap * 0.45],
                    [mx, top[2][1] + gap * 0.5],
                    [fX, top[4][1] + gap * 0.45],
                  ],
                  false,
                ),
                line("#6a5040", 0.8, 0.7),
              )
            : ""
        }</g>`,
      );
  }
  out.push(
    path(
      smooth([...upper, ...top.slice(1, -1).reverse()], true, 0.4),
      `fill="${lipUp}"`,
    ),
  );
  out.push(
    path(smooth([...lower, ...bot.slice(1, -1)], true, 0.4), `fill="${lipLo}"`),
  );
  // The light on the lower lip, and its far half turning away.
  out.push(
    ell(
      mx - W * 0.12,
      my + gap + lo * 0.4,
      W * 0.18,
      lo * 0.22,
      `fill="${light(sk.lip, 0.5)}" opacity="0.65"`,
    ),
  );
  out.push(
    ell(
      mx + W * 0.2,
      my + gap + lo * 0.5,
      W * 0.17,
      lo * 0.32,
      fillOp(sk.shadow, 0.35),
    ),
  );
  out.push(`</g>`);
  // The line where the lips meet: the darkest note in the face.
  const lw = (lite ? 2.3 : 1.6) * k;
  out.push(
    `<g filter="url(#soft06)">${stroke([[top[0][0] - 1.2, top[0][1] + 0.3], ...top, [top[4][0] + 0.8, top[4][1] + 0.2]], lw, `fill="${lineC}" opacity="0.92"`, [0.7, 0.45])}</g>`,
  );
  // Corners: pockets of shadow, pulled up by a smile.
  out.push(
    ell(
      nX + 0.4,
      cYn + 0.2,
      1.4 + E.mouth * 0.3,
      1,
      `fill="${lineC}" opacity="0.6" filter="url(#soft06)"`,
    ),
  );
  // The philtrum: two ridges from the nose to the bow of the lip.
  const py0 = (h.noseTip[1] + h.noseW * 0.3 + my - up) / 2;
  out.push(
    path(
      `M${n(mx - 2.2)} ${n(py0)}Q${n(mx - 2.6)} ${n(my - up - 1.5)} ${n(mx - W * 0.09)} ${n(my - up * 1.06)}`,
      `${line(sk.lit, 1.4, 0.3)} filter="url(#soft1)"`,
    ),
  );
  out.push(
    ell(
      mx + 0.4,
      py0 + (my - up - py0) * 0.5,
      1.6,
      (my - up - py0) * 0.5,
      `fill="${sk.shadow}" opacity="0.18" filter="url(#soft1)"`,
    ),
  );
  if (E.mouth > 0.5) {
    // A smile pushes the cheeks into folds beside the corners.
    out.push(
      path(
        smooth(
          [
            [nX - 1.5, cYn - 4],
            [nX - 3, cYn],
            [nX - 1.5, cYn + 3.5],
          ],
          false,
        ),
        `${line(sk.shadow, 1.3, 0.5)} filter="url(#soft06)"`,
      ),
    );
  }
  if (E.mouth < -0.6) {
    // A frown drags the corners into the jowl.
    out.push(
      path(
        smooth(
          [
            [nX + 0.5, cYn + 1],
            [nX - 1.5, cYn + 5 + -E.mouth * 1.5],
          ],
          false,
        ),
        `${line(sk.shadow, 1.4, 0.55)} filter="url(#soft06)"`,
      ),
    );
  }
  return `<g>${out.join("")}</g>`;
}

// ---------------------------------------------------------------- lines and marks

function paintLines(h: Head, s: Sitting, sk: SkinPalette): string {
  const o = Math.min(1, h.old);
  const out: string[] = [];
  const t = h.noseTip;
  const E = h.expr;
  const smile = E.cheek;
  const lite = s.detail === "lite";
  // Beside the mouth: from the nostril's wing down past the corner.
  const nl = Math.max(
    o * 0.9,
    smile * 0.75,
    h.fat * 0.35,
    h.child > 0 ? 0 : 0.18,
  );
  if (nl > 0) {
    out.push(
      path(
        smooth(
          [
            [t[0] - h.noseW * 0.55, t[1] - 1],
            [
              h.mouth[0] - h.mouthW * (0.7 + smile * 0.06),
              h.mouth[1] - 3 - smile * 2,
            ],
            [h.mouth[0] - h.mouthW * 0.72, h.mouth[1] + 6 + o * 4],
          ],
          false,
        ),
        `${line(sk.shadow, 1.4 + o + smile * 0.6, nl * 0.6)} filter="url(#soft1)"`,
      ),
    );
    out.push(
      path(
        smooth(
          [
            [t[0] - h.noseW * 0.5 - 1, t[1] - 2],
            [h.mouth[0] - h.mouthW * 0.74 - 2, h.mouth[1] - 4],
          ],
          false,
        ),
        `${line(sk.lit, 1.6, nl * 0.35)} filter="url(#soft1)"`,
      ),
    );
    out.push(
      path(
        smooth(
          [
            [t[0] + h.noseW * 0.45, t[1] - 1],
            [h.mouth[0] + h.mouthW * 0.5, h.mouth[1] - 2],
          ],
          false,
        ),
        `${line(sk.shadow, 1.2, nl * 0.45)} filter="url(#soft1)"`,
      ),
    );
  }
  if (smile > 0.3) {
    // The lower lids bunch up under a smile.
    const e = h.eyeN;
    out.push(
      path(
        smooth(
          [
            [e[0] - h.eyeW * 0.4, e[1] + h.eyeH * 1.0],
            [e[0], e[1] + h.eyeH * 1.25],
            [e[0] + h.eyeW * 0.4, e[1] + h.eyeH * 0.95],
          ],
          false,
        ),
        `${line(sk.shadow, 1, 0.35 * smile)} filter="url(#soft06)"`,
      ),
    );
  }
  if (o > 0.3 && !lite) {
    const k = (o - 0.3) / 0.7;
    // The forehead.
    for (let i = 0; i < 3; i++) {
      const y = h.browY - 8 - i * 4.5;
      out.push(
        path(
          smooth(
            [
              h.P(-0.55, (y - h.cy) / h.b),
              h.P(0, (y - 1.2 - h.cy) / h.b),
              h.P(0.55, (y - h.cy) / h.b),
            ],
            false,
          ),
          `${line(sk.line, 0.8, k * 0.35)} filter="url(#soft06)"`,
        ),
      );
    }
    // Crow's feet at the near eye.
    const e = h.eyeN;
    for (let i = -1; i <= 1; i++)
      out.push(
        path(
          `M${n(e[0] - h.eyeW * 0.6)} ${n(e[1] + i * 1.8)}l${n(-4)} ${n(i * 2)}`,
          `stroke="${sk.line}" stroke-width="0.7" opacity="${op(k * 0.4)}"`,
        ),
      );
    // Under the eyes.
    out.push(
      path(
        smooth(
          [
            [e[0] - h.eyeW * 0.4, e[1] + h.eyeH * 1.05],
            [e[0], e[1] + h.eyeH * 1.55],
            [e[0] + h.eyeW * 0.45, e[1] + h.eyeH * 1.05],
          ],
          false,
        ),
        line(sk.line, 0.7, k * 0.42),
      ),
    );
    out.push(
      path(
        smooth(
          [
            [e[0] - h.eyeW * 0.35, e[1] + h.eyeH * 1.15],
            [e[0], e[1] + h.eyeH * 1.65],
            [e[0] + h.eyeW * 0.4, e[1] + h.eyeH * 1.15],
          ],
          false,
        ),
        `${line(sk.lit, 1.2, k * 0.3)} filter="url(#soft06)"`,
      ),
    );
    // Jowls.
    out.push(
      path(
        smooth(
          [
            [h.mouth[0] - h.mouthW * 0.7, h.mouth[1] + 8],
            [h.mouth[0] - h.mouthW * 0.5, h.chin[1] - 6],
          ],
          false,
        ),
        `${line(sk.shadow, 1.2, k * 0.35)} filter="url(#soft1)"`,
      ),
    );
  }
  if (o > 0.6) {
    // Old age: the cheek falls, lines from the mouth's corners, a hollow temple.
    const k = Math.min(1, (o - 0.6) / 0.4);
    const ok = (v: number) => v * k;
    out.push(
      path(
        smooth([h.P(-0.62, 0.02), h.P(-0.72, 0.3), h.P(-0.74, 0.62)], false),
        `${line(sk.shadow, 1.6, ok(0.45))} filter="url(#soft1)"`,
      ),
    );
    out.push(
      path(
        smooth(
          [
            [h.mouth[0] - h.mouthW * 0.55, h.mouth[1] + 2],
            [h.mouth[0] - h.mouthW * 0.6, h.mouth[1] + 9],
            [h.mouth[0] - h.mouthW * 0.5, h.chin[1] - 4],
          ],
          false,
        ),
        `${line(sk.shadow, 1.3, ok(0.5))} filter="url(#soft06)"`,
      ),
    );
    out.push(
      path(
        smooth(
          [
            [h.mouth[0] + h.mouthW * 0.4, h.mouth[1] + 2],
            [h.mouth[0] + h.mouthW * 0.45, h.mouth[1] + 8],
          ],
          false,
        ),
        `${line(sk.shadow, 1.1, ok(0.4))} filter="url(#soft06)"`,
      ),
    );
    if (!lite)
      for (let i = 0; i < 2; i++) {
        const e = h.eyeN;
        out.push(
          path(
            smooth(
              [
                [e[0] - h.eyeW * 0.35, e[1] + h.eyeH * (1.6 + i * 0.7)],
                [e[0] + h.eyeW * 0.05, e[1] + h.eyeH * (2.1 + i * 0.7)],
                [e[0] + h.eyeW * 0.45, e[1] + h.eyeH * (1.6 + i * 0.7)],
              ],
              false,
            ),
            line(sk.line, 0.7, ok(0.35)),
          ),
        );
      }
  }
  // Furrows between the brows: a frown's, anger's, or a long life's.
  const furrow = Math.max(
    E.browIn > 0.7 ? E.browIn * 0.5 : 0,
    o > 0.6 ? 0.4 : 0,
  );
  if (furrow > 0.2) {
    const x = h.noseRoot[0] - 1;
    const yb = h.browY;
    out.push(
      path(
        `M${n(x - 2)} ${n(yb - 2)}l${n(0.8)} ${n(6)}M${n(x + 2.2)} ${n(yb - 2)}l${n(-0.4)} ${n(6)}`,
        `${line(sk.line, lite ? 1.4 : 0.9, Math.min(0.7, furrow * 0.6))} filter="url(#soft06)"`,
      ),
    );
    if (E.browIn > 0.8)
      out.push(
        ell(
          x,
          yb + 1,
          3.5,
          4,
          `fill="${sk.shadow}" opacity="0.35" filter="url(#soft1)"`,
        ),
      );
  }
  if (E.browUp > 0.5) {
    // Worry wrinkles the middle of the brow.
    for (let i = 0; i < (lite ? 2 : 3); i++) {
      const y = h.browY - 6 - i * 4;
      out.push(
        path(
          smooth(
            [
              [h.noseRoot[0] - 10, y + 1.5],
              [h.noseRoot[0] - 1, y - 1.8],
              [h.noseRoot[0] + 8, y + 1.5],
            ],
            false,
          ),
          `${line(sk.line, lite ? 1.2 : 0.85, 0.4)} filter="url(#soft06)"`,
        ),
      );
    }
  }
  return out.join("");
}

function paintMarks(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const out: string[] = [];
  const br = new Brush(s.seed * 7 + 11);
  if (L.marks.includes("freckles")) {
    const c = mix(sk.base, "#8a4a26", 0.45);
    for (let i = 0; i < 26; i++) {
      const x = br.range(-0.75, 0.75);
      const y = br.range(-0.05, 0.38);
      const [px, py] = h.P(x, y);
      if (Math.abs(x) < 0.12 && y < 0.25) continue;
      out.push(
        ell(
          px,
          py,
          br.range(0.5, 1),
          br.range(0.4, 0.8),
          `fill="${c}" opacity="${op(br.range(0.3, 0.6))}"`,
        ),
      );
    }
  }
  if (L.marks.includes("pox")) {
    for (let i = 0; i < 22; i++) {
      const [px, py] = h.P(br.range(-0.8, 0.8), br.range(-0.7, 0.6));
      out.push(
        ell(
          px,
          py,
          br.range(0.6, 1.2),
          br.range(0.5, 1),
          `fill="${sk.shadow}" opacity="0.3"`,
        ),
      );
      out.push(
        ell(px - 0.3, py - 0.3, 0.4, 0.4, `fill="${sk.lit}" opacity="0.35"`),
      );
    }
  }
  if (L.marks.includes("beauty")) {
    const [px, py] = h.P(-0.38, 0.32);
    out.push(ell(px, py, 1.1, 1.1, `fill="#1a0f0a" opacity="0.85"`));
  }
  if (L.marks.includes("scar")) {
    const [x1, y1] = h.P(-0.62, -0.05);
    const [x2, y2] = h.P(-0.38, 0.42);
    out.push(
      path(
        `M${n(x1)} ${n(y1)}Q${n(x1 + 1)} ${n((y1 + y2) / 2)} ${n(x2)} ${n(y2)}`,
        `fill="none" stroke="${mix(sk.blush, "#7a2a20", 0.3)}" stroke-width="1.6" opacity="0.6"`,
      ),
    );
    out.push(
      path(
        `M${n(x1 - 0.6)} ${n(y1)}Q${n(x1 + 0.4)} ${n((y1 + y2) / 2)} ${n(x2 - 0.6)} ${n(y2)}`,
        `fill="none" stroke="${sk.lit}" stroke-width="0.6" opacity="0.6"`,
      ),
    );
  }
  if (L.marks.includes("paint")) {
    // A band of red across the eyes, as warriors and men of standing wore.
    const y = (h.eyeN[1] + h.eyeF[1]) / 2;
    out.push(
      `<g clip-path="url(#faceClip)" filter="url(#soft1)">${path(
        smooth([
          [h.cx - h.a * 1.2, y - h.eyeH * 1.6],
          [h.cx + h.a * 1.2, y - h.eyeH * 1.8],
          [h.cx + h.a * 1.2, y + h.eyeH * 1.7],
          [h.cx - h.a * 1.2, y + h.eyeH * 1.9],
        ]),
        `fill="#a3271c" opacity="0.55" style="mix-blend-mode:multiply"`,
      )}</g>`,
    );
  }
  if (L.marks.includes("lines_paint")) {
    // Bars of black paint across the near cheek.
    for (let i = 0; i < 2; i++) {
      const [x1, y1] = h.P(-0.88, 0.1 + i * 0.13);
      const [x2, y2] = h.P(-0.45, 0.14 + i * 0.13);
      out.push(
        path(
          `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`,
          `stroke="#1d1a22" stroke-width="2.6" opacity="0.7" stroke-linecap="round" filter="url(#soft06)"`,
        ),
      );
    }
  }
  if (L.marks.includes("tattoo")) {
    // Fine dotted lines pricked into the skin.
    const c = mix(sk.deep, "#22304a", 0.55);
    const dots = (pts: Pt[]) =>
      path(
        smooth(pts, false),
        `fill="none" stroke="${c}" stroke-width="0.9" stroke-dasharray="0.8 1.6" opacity="0.6"`,
      );
    out.push(dots([h.P(-0.9, 0.05), h.P(-0.7, 0.0), h.P(-0.5, 0.06)]));
    out.push(dots([h.P(-0.88, 0.18), h.P(-0.68, 0.14), h.P(-0.48, 0.2)]));
    out.push(dots([h.P(-0.1, 0.84), h.P(0.0, 0.95)]));
    out.push(dots([h.P(0.15, 0.82), h.P(0.18, 0.95)]));
  }
  return out.join("");
}
