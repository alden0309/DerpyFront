// The face, painted: a warm-lit skin with soft shadow on the turned side,
// eyes with wet light in them, brows, nose and mouth modelled by shadow as
// a painter would, and the lines and marks of a life.

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
}

export function skinPalette(s: Sitting): SkinPalette {
  const base = SKIN_TONES[s.look.skin]?.hex ?? SKIN_TONES[2].hex;
  const dark = lum(base) < 0.5;
  return {
    base,
    half: mix(base, dark ? "#3a2a20" : "#6f5a44", dark ? 0.4 : 0.5),
    lit: light(mix(base, "#f4d2a6", 0.35), dark ? 0.14 : 0.18),
    shadow: mix(base, dark ? "#2a150c" : "#553020", dark ? 0.48 : 0.56),
    deep: mix(base, "#1f0f08", dark ? 0.64 : 0.74),
    blush: mix(base, dark ? "#8c3a30" : "#c24c42", dark ? 0.3 : 0.4),
    lip: dark
      ? mix(mix(base, "#5a2a26", 0.35), "#8a4a48", 0.2)
      : mix(base, "#a8382f", s.female ? 0.58 : 0.46),
    line: mix(base, "#3a1d10", dark ? 0.55 : 0.6),
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

/** The neck, under the jaw. */
export function paintNeck(h: Head, s: Sitting, sk: SkinPalette): string {
  const base = h.neckBase + 16;
  const n0 = h.neckN;
  const f0 = h.neckF;
  const d = smooth(
    [
      [n0 + 2, h.cy + h.b * 0.15],
      [n0 + 3, h.cy + h.b * 0.85],
      [n0 - 6 - (s.female ? 0 : 4), base],
      [f0 + 8 + (s.female ? 0 : 3), base],
      [f0 + 1, h.cy + h.b * 1.18],
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
  return `<defs><linearGradient id="neckG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${mix(sk.base, sk.shadow, 0.5)}"/><stop offset="0.3" stop-color="${sk.base}"/>
<stop offset="0.65" stop-color="${mix(sk.base, sk.shadow, 0.45)}"/><stop offset="1" stop-color="${sk.deep}"/></linearGradient>
<clipPath id="neckClip">${path(d, "")}</clipPath></defs>
${path(d, `fill="url(#neckG)"`)}
<g clip-path="url(#neckClip)"><g filter="url(#soft4)">
<g transform="translate(-2 9)">${path(jaw, `fill="none" stroke="${sk.deep}" stroke-width="16" opacity="0.7"`)}</g>
${path(
  smooth(
    [
      [n0 + 10, h.cy + h.b * 0.55],
      [h.cx - h.a * 0.1, h.cy + h.b * 1.3],
      [h.cx + h.a * 0.05, base],
    ],
    false,
  ),
  `fill="none" stroke="${sk.lit}" stroke-width="6" opacity="0.3"`,
)}
${ell(f0, h.cy + h.b * 1.25, 7, h.b * 0.5, `fill="${sk.deep}" opacity="0.4"`)}
</g></g>`;
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
    [x - W * 0.02, y + H * 0.5],
    [x + W * 0.28, y + H * 0.38],
    [x + W * 0.42, y + H * 0.05],
  ]);
  return `<g>
${path(d, `fill="${mix(sk.base, sk.blush, 0.35)}"`)}
<g filter="url(#soft2)">
${ell(x + W * 0.06, y + H * 0.02, W * 0.26, H * 0.22, `fill="${sk.deep}" opacity="0.6"`)}
${path(
  smooth(
    [
      [x - W * 0.1, y - H * 0.4],
      [x - W * 0.45, y - H * 0.25],
      [x - W * 0.48, y + H * 0.05],
      [x - W * 0.28, y + H * 0.3],
    ],
    false,
  ),
  `fill="none" stroke="${sk.lit}" stroke-width="2" opacity="0.5"`,
)}
${ell(x + W * 0.3, y, W * 0.22, H * 0.45, `fill="${sk.shadow}" opacity="0.5"`)}
</g>
${path(
  smooth(
    [
      [x - W * 0.02, y - H * 0.44],
      [x - W * 0.5, y - H * 0.28],
      [x - W * 0.55, y + H * 0.04],
      [x - W * 0.3, y + H * 0.33],
      [x - W * 0.02, y + H * 0.44],
    ],
    false,
  ),
  `fill="none" stroke="${sk.line}" stroke-width="0.8" opacity="0.45"`,
)}
</g>`;
}

/** The face itself: skin, modelling, then features. */
export function paintFace(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const P = h.P;
  const faceD = smooth(h.outline, true, 0.5);
  const sc = h.skull;
  const skullD = `M${n(sc.cx - sc.rx)} ${n(sc.cy)}a${n(sc.rx)} ${n(sc.ry)} 0 1 0 ${n(sc.rx * 2)} 0a${n(sc.rx)} ${n(sc.ry)} 0 1 0 ${n(-sc.rx * 2)} 0Z`;
  const [lx, ly] = P(-0.55, -0.4);
  const out: string[] = [];
  out.push(`<defs>
<radialGradient id="skinG" gradientUnits="userSpaceOnUse" cx="${n(lx)}" cy="${n(ly)}" r="${n(h.a * 2.1)}">
<stop offset="0" stop-color="${sk.lit}"/><stop offset="0.3" stop-color="${sk.base}"/>
<stop offset="0.62" stop-color="${mix(sk.base, sk.shadow, 0.55)}"/><stop offset="0.85" stop-color="${sk.shadow}"/><stop offset="1" stop-color="${sk.deep}"/></radialGradient>
<clipPath id="faceClip">${path(faceD, "")}</clipPath>
<clipPath id="headClip">${path(faceD, "")}${path(skullD, "")}</clipPath></defs>`);
  out.push(path(skullD, `fill="url(#skinG)"`));
  out.push(path(faceD, `fill="url(#skinG)"`));

  // Modelling: broad soft shadows and lights, blurred like scumbled paint.
  const m: string[] = [];
  const far = (opacity: number) => `fill="${sk.shadow}" opacity="${opacity}"`;
  // The back of the head, turned away from us.
  m.push(
    ell(
      sc.cx - sc.rx * 0.95,
      sc.cy + sc.ry * 0.2,
      sc.rx * 0.35,
      sc.ry * 0.9,
      far(0.5),
    ),
  );
  // The turned-away side of the face, in shadow.
  // The plane of the face beyond the nose, in half-shadow.
  m.push(
    path(
      smooth([
        P(0.2, -1.1),
        P(0.28, -0.5),
        [h.noseRoot[0] + h.a * 0.12, h.noseRoot[1] + 2],
        [h.noseTip[0] + h.noseW * 0.3, h.noseTip[1] - 2],
        P(0.5, 0.42),
        P(0.45, 0.78),
        [h.chin[0] + h.a * 0.18, h.chin[1] + 4],
        [h.cx + h.a * 1.3, h.cy + h.b * 1.1],
        [h.cx + h.a * 1.3, h.cy - h.b * 1.1],
      ]),
      `fill="${sk.half}" opacity="0.82"`,
    ),
  );
  m.push(
    ell(
      h.cx + h.a * 1.08,
      h.cy + h.b * 0.05,
      h.a * 0.34,
      h.b * 1.15,
      `fill="${sk.deep}" opacity="0.75"`,
    ),
  );
  m.push(
    ell(h.cx + h.a * 0.86, h.cy + h.b * 0.66, h.a * 0.34, h.b * 0.38, far(0.4)),
  );
  // The temple and jaw on the near side turn, cooler.
  m.push(
    ell(
      h.cx - h.a * 0.95,
      h.cy - h.b * 0.55,
      h.a * 0.2,
      h.b * 0.3,
      `fill="${sk.half}" opacity="0.35"`,
    ),
  );
  m.push(
    ell(
      h.cx - h.a * 0.7,
      h.cy + h.b * 0.75,
      h.a * 0.35,
      h.b * 0.18,
      `fill="${sk.half}" opacity="0.35"`,
    ),
  );
  // The lit side is modelled too: the hollow under the cheekbone, the jaw's
  // turn, and the round of the mouth and chin.
  m.push(
    path(
      smooth(
        [
          [h.ear[0] + h.a * 0.08, h.ear[1] + h.b * 0.05],
          P(-0.62, 0.32),
          [h.mouth[0] - h.mouthW * 0.75, h.mouth[1] - 2],
        ],
        false,
      ),
      `fill="none" stroke="${sk.half}" stroke-width="${n(h.b * 0.16)}" opacity="${L.cheeks === 3 ? 0.55 : 0.32}"`,
    ),
  );
  m.push(
    path(
      smooth(
        [h.jawN, P(-0.55, 0.82), [h.chin[0] - h.a * 0.25, h.chin[1] - 2]],
        false,
      ),
      `fill="none" stroke="${sk.half}" stroke-width="${n(h.b * 0.14)}" opacity="0.42"`,
    ),
  );
  m.push(
    ell(
      h.mouth[0] - h.mouthW * 0.68,
      h.mouth[1] + 2,
      h.a * 0.1,
      h.b * 0.14,
      `fill="${sk.half}" opacity="0.35"`,
    ),
  );
  // Light thrown back up onto the far jaw.
  m.push(
    ell(
      h.jawF[0] - 3,
      h.jawF[1] + 4,
      h.a * 0.08,
      h.b * 0.14,
      `fill="${sk.base}" opacity="0.35"`,
    ),
  );
  // Under the jaw.
  m.push(
    ell(
      h.cx + h.a * 0.1,
      h.cy + h.b * 1.1,
      h.a * 1.15,
      h.b * 0.16,
      `fill="${sk.deep}" opacity="0.45"`,
    ),
  );
  // Eye sockets and the brow's shade.
  const deep = L.eyes === 5 ? 1.3 : 1;
  m.push(
    ell(
      h.eyeN[0] + 2,
      h.eyeN[1] - h.eyeH * 0.5,
      h.eyeW * 0.85,
      h.eyeH * 1.9,
      far(0.45 * deep),
    ),
  );
  m.push(
    ell(
      h.eyeF[0] - 1,
      h.eyeF[1] - h.eyeH * 0.4,
      h.eyeWF * 0.95,
      h.eyeH * 2,
      far(0.6 * deep),
    ),
  );
  m.push(
    ell(
      h.noseRoot[0] + h.a * 0.06,
      h.eyeN[1] - h.eyeH * 0.1,
      h.a * 0.1,
      h.eyeH * 1.6,
      far(0.35),
    ),
  );
  // The nose's shadow side, and the shadow it casts.
  const tip = h.noseTip;
  m.push(
    path(
      smooth([
        [h.noseRoot[0] + h.a * 0.1, h.noseRoot[1] - h.eyeH],
        [tip[0] + h.noseW * 0.16, tip[1] - h.noseLen * 0.5],
        [tip[0] + h.noseW * 0.5, tip[1] + 1],
        [tip[0] + h.noseW * 0.1, tip[1] + 4],
        [tip[0] + h.noseW * 0.0, tip[1] - h.noseLen * 0.45],
        [h.noseRoot[0] + h.a * 0.03, h.noseRoot[1]],
      ]),
      far(0.6),
    ),
  );
  m.push(
    ell(
      tip[0] + h.noseW * 0.25,
      tip[1] + 5,
      h.noseW * 0.5,
      3.4,
      `fill="${sk.deep}" opacity="0.45"`,
    ),
  );
  // Cheeks: colour in them, and the high light on the near one.
  const cheekLift = h.expr.cheek * h.b * 0.05;
  const ruddy = L.marks.includes("ruddy") ? 1.5 : 1;
  const kid = 1 + h.child * 0.6;
  const blush = (v: number) => op(Math.min(0.85, v));
  const [bx, by] = P(-0.5, 0.18);
  m.push(
    ell(
      bx,
      by - cheekLift,
      h.a * 0.32,
      h.b * 0.17,
      `fill="${sk.blush}" opacity="${blush(0.62 * ruddy * kid * (s.female ? 1.2 : 1))}"`,
    ),
  );
  const [fx, fy] = P(0.62, 0.18);
  m.push(
    ell(
      fx,
      fy - cheekLift,
      h.a * 0.2,
      h.b * 0.15,
      `fill="${sk.blush}" opacity="${blush(0.45 * ruddy * kid)}"`,
    ),
  );
  m.push(
    ell(
      h.noseTip[0] - 1,
      h.noseTip[1] - 3,
      h.noseW * 0.4,
      h.noseLen * 0.2,
      `fill="${sk.blush}" opacity="${blush(0.25 * ruddy)}"`,
    ),
  );
  const [hx, hy] = P(-0.52, -0.02);
  m.push(
    ell(
      hx,
      hy - cheekLift,
      h.a * 0.22,
      h.b * 0.09,
      `fill="${sk.lit}" opacity="${L.cheeks === 2 || h.expr.cheek > 0 ? 0.6 : 0.4}"`,
    ),
  );
  if (L.cheeks === 3 || h.old > 0.5) {
    const [qx, qy] = P(-0.6, 0.32);
    m.push(ell(qx, qy, h.a * 0.18, h.b * 0.12, far(0.25 + h.old * 0.1)));
  }
  // Lights: forehead, nose bridge, chin, upper lip.
  const [ox, oy] = P(-0.22, -0.62);
  m.push(ell(ox, oy, h.a * 0.5, h.b * 0.26, `fill="${sk.lit}" opacity="0.6"`));
  m.push(
    ell(
      h.noseRoot[0] - h.a * 0.02,
      (h.noseRoot[1] + tip[1]) / 2 - 2,
      h.a * 0.07,
      h.noseLen * 0.42,
      `fill="${sk.lit}" opacity="0.55"`,
    ),
  );
  m.push(
    ell(
      h.chin[0] - h.a * 0.14,
      h.chin[1] - h.b * 0.16,
      h.a * 0.22,
      h.b * 0.09,
      `fill="${sk.lit}" opacity="0.4"`,
    ),
  );
  m.push(
    ell(
      h.mouth[0] - h.mouthW * 0.25,
      h.mouth[1] - h.b * 0.1,
      h.mouthW * 0.25,
      h.b * 0.04,
      `fill="${sk.lit}" opacity="0.3"`,
    ),
  );
  // Below the lower lip.
  m.push(
    ell(
      h.mouth[0] + 1,
      h.mouth[1] + h.b * 0.15,
      h.mouthW * 0.32,
      h.b * 0.055,
      far(0.6),
    ),
  );
  // A man's shaven jaw shows a shade of beard.
  if (!s.female && h.child < 0.4 && L.beard !== "full") {
    const st = L.beard === "stubble" ? 0.4 : 0.14;
    const beardC = mix(sk.shadow, "#38404a", 0.4);
    m.push(
      ell(
        h.mouth[0] - 2,
        h.mouth[1] - h.b * 0.08,
        h.mouthW * 0.6,
        h.b * 0.05,
        `fill="${beardC}" opacity="${st}"`,
      ),
    );
    m.push(
      path(
        smooth([
          P(-0.92, 0.45),
          P(-0.3, 0.6),
          P(0.3, 0.72),
          P(0.85, 0.55),
          h.jawF,
          [h.chin[0] + 6, h.chin[1] + 2],
          [h.chin[0] - 10, h.chin[1] + 2],
          h.jawN,
        ]),
        `fill="${beardC}" opacity="${st}"`,
      ),
    );
  }
  // Age: hollows under the eyes.
  if (h.old > 0.15) {
    const o = Math.min(1, h.old);
    m.push(
      ell(
        h.eyeN[0] - 1,
        h.eyeN[1] + h.eyeH * 1.3,
        h.eyeW * 0.5,
        h.eyeH * 0.6,
        far(0.3 * o),
      ),
    );
    m.push(
      ell(
        h.eyeF[0] - 1,
        h.eyeF[1] + h.eyeH * 1.3,
        h.eyeWF * 0.45,
        h.eyeH * 0.6,
        far(0.3 * o),
      ),
    );
  }
  out.push(
    `<g clip-path="url(#headClip)"><g filter="url(#soft${s.detail === "lite" ? 3 : 4})">${m.join("")}</g>${s.detail === "full" ? `<rect width="240" height="300" filter="url(#skinNoise)" opacity="0.22" style="mix-blend-mode:multiply"/>` : ""}</g>`,
  );
  out.push(paintLines(h, s, sk));
  out.push(paintEyes(h, s, sk));
  out.push(paintBrows(h, s, sk));
  out.push(paintNose(h, s, sk));
  out.push(paintMouth(h, s, sk));
  out.push(paintMarks(h, s, sk));
  // The far cheek's edge against the dark.
  out.push(
    path(
      smooth(h.outline.slice(7, 15), false),
      `fill="none" stroke="${sk.deep}" stroke-width="1.4" opacity="0.4" filter="url(#soft1)"`,
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
): { upper: Pt[]; lower: Pt[] } {
  // Local x: -1 outer corner, +1 inner corner (toward the nose).
  const X = (t: number) => e[0] + (t * w * inner) / 2;
  const Y = (t: number) => e[1] + t * hgt;
  const down = shape === 4 ? 0.25 : 0;
  const lift = shape === 0 || shape === 3 ? -0.08 : 0;
  const top =
    shape === 1 ? 0.78 : shape === 2 ? 0.55 : shape === 3 ? 0.58 : 0.68;
  const bot = (shape === 1 ? 0.44 : shape === 3 ? 0.34 : 0.4) - squint * 0.14;
  const upper: Pt[] = [
    [X(-1), Y(0.04 + down + lift)],
    [X(-0.6), Y(-top * 0.82 + down * 0.4)],
    [X(0.0), Y(-top)],
    [X(0.6), Y(-top * 0.62)],
    [X(1), Y(0.06)],
  ];
  const lower: Pt[] = [
    [X(-1), Y(0.04 + down + lift)],
    [X(-0.45), Y(bot + down * 0.2)],
    [X(0.35), Y(bot * 0.92)],
    [X(1), Y(0.06)],
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
  const hgt = h.eyeH;
  const { upper, lower } = eyeShape(e, w, hgt, L.eyes, inner, h.expr.squint);
  const lids = smooth([...upper, ...lower.slice(1, -1).reverse()], true, 0.45);
  const iris = EYE_COLORS[L.eyeColor]?.hex ?? EYE_COLORS[1].hex;
  // The eyes look a little toward us.
  const gaze = -w * 0.05;
  const r = w * 0.31 * (farSide ? 0.95 : 1);
  const ix = e[0] + gaze + (farSide ? w * 0.05 : 0);
  const iy = e[1] + hgt * 0.14;
  const white = mix("#cdbea8", sk.base, 0.48);
  const lidC = mix(sk.deep, "#1a0d07", 0.55);
  // The lid: skin between the crease and the lashes, catching the light.
  const hooded = L.eyes === 2;
  const lift = hgt * (hooded ? 0.42 : 0.85) * (1 - h.old * 0.25);
  const crease = upper.map(
    ([x, y], i): Pt => [
      x + (i === 0 ? -inner * 2 : i === 4 ? inner * 0.5 : 0),
      y - lift * (i === 0 ? 0.25 : i === 4 ? 0.4 : 1),
    ],
  );
  const lidD = smooth([...upper, ...crease.slice().reverse()], true, 0.4);
  return `<g>
<defs><clipPath id="${id}">${path(lids, "")}</clipPath>
<radialGradient id="${id}i" cx="0.45" cy="0.42" r="0.6"><stop offset="0" stop-color="${mix(iris, "#e8d8b8", 0.12)}"/><stop offset="0.6" stop-color="${shade(iris, 0.12)}"/><stop offset="1" stop-color="${shade(iris, 0.62)}"/></radialGradient></defs>
${path(lidD, `fill="${mix(sk.base, sk.lit, farSide ? 0 : 0.12)}" opacity="0.55" filter="url(#soft06)"`)}
${path(smooth(crease.slice(0, 4), false), `fill="none" stroke="${sk.shadow}" stroke-width="1.5" opacity="0.6" filter="url(#soft1)"`)}
${path(lids, `fill="${white}"`)}
<g clip-path="url(#${id})">
${ell(ix, iy, r, r, `fill="url(#${id}i)"`)}
${ell(ix, iy, r * 0.44, r * 0.44, `fill="#100805"`)}
<g filter="url(#soft1)">${path(smooth(upper, false), `fill="none" stroke="${sk.deep}" stroke-width="${n(hgt * 1.1)}" opacity="0.75"`)}
${ell(e[0] - (inner * w) / 2, e[1], w * 0.2, hgt, `fill="${sk.shadow}" opacity="0.45"`)}
${ell(e[0] + (inner * w) / 2, e[1], w * 0.14, hgt, `fill="${sk.shadow}" opacity="0.35"`)}</g>
</g>
${ell(ix - r * 0.36, iy - r * 0.42, r * 0.17, r * 0.17, `fill="#fff8ec" opacity="0.85"`)}
<g filter="url(#soft06)">${stroke(upper, Math.max(1.3, hgt * 0.3), `fill="${lidC}" opacity="0.85"`, inner === 1 ? [1, 0.2] : [0.2, 1])}</g>
${path(
  smooth(
    lower.map(([x, y]): Pt => [x, y + 0.7]),
    false,
  ),
  `fill="none" stroke="${sk.lit}" stroke-width="0.9" opacity="0.35"`,
)}
${path(smooth(lower, false), `fill="none" stroke="${sk.line}" stroke-width="0.7" opacity="0.4" filter="url(#soft06)"`)}
${ell(upper[4][0] - inner * 1.3, upper[4][1] + 0.4, 1.3, 0.9, `fill="${mix(sk.blush, "#b85a50", 0.4)}" opacity="0.65"`)}
</g>`;
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
  const hair = hairTone(s);
  const c = mix(
    mix(hair, sk.base, 0.25),
    "#000000",
    lum(hair) > 0.5 ? 0.25 : 0,
  );
  const width =
    (s.female ? [1.5, 1.8, 2.1, 2.7, 3] : [2.1, 2.5, 2.9, 3.9, 4.3])[L.brows] *
    (1 - h.child * 0.25);
  const arch = [3.2, 4.2, 1.4, 2.0, 2.4][L.brows];
  const brow = (e: Pt, w: number, inner: 1 | -1) => {
    const x = (t: number) => e[0] + (t * w * inner) / 2;
    const y0 = h.browY + (e[1] - h.eyeN[1]);
    const inY = y0 + 1.5 + h.expr.browIn * 2.6 - h.expr.browUp * 3.2;
    const inX = x(0.95) - h.expr.browIn * inner * 1.2;
    const pts: Pt[] = [
      [inX, inY],
      [x(0.35), y0 - arch * 0.75 - h.expr.browUp * 1.2],
      [x(-0.3), y0 - arch],
      [x(-1.12), y0 + 1.8],
    ];
    const main = stroke(
      pts,
      width,
      `fill="${c}" opacity="0.88"`,
      inner === 1 ? [0.35, 0.6] : [0.6, 0.35],
    );
    let hairs = "";
    if (s.detail === "full" && L.brows >= 3) {
      const br = new Brush(s.seed + (inner === 1 ? 3 : 7));
      for (let i = 0; i < 12; i++) {
        const t = br.range(0, 1);
        const p = curve(pts[0], pts[1], pts[3], 12)[Math.floor(t * 12)];
        hairs += path(
          `M${n(p[0])} ${n(p[1] + br.range(-1, 1.2))}l${n(-inner * br.range(1.5, 3))} ${n(br.range(-1.6, -0.4))}`,
          `stroke="${c}" stroke-width="0.6" opacity="0.6"`,
        );
      }
    }
    return main + hairs;
  };
  return `<g filter="url(#soft06)">${brow(h.eyeN, h.eyeW * 1.2, 1)}${brow(h.eyeF, h.eyeWF * 1.15, -1)}</g>`;
}

// ---------------------------------------------------------------- nose

function paintNose(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const t = h.noseTip;
  const w = h.noseW;
  const dark = mix(sk.deep, "#1c0c06", 0.45);
  const hooked = L.nose === 1 || L.nose === 6;
  const snub = L.nose === 2 || L.nose === 5;
  const out: string[] = [];
  const id = `nt${s.seed % 1000}`;
  const bump = hooked ? 2.4 : 0;
  // The light down the bridge.
  out.push(
    path(
      smooth(
        [
          [h.noseRoot[0] - 1, h.noseRoot[1] + 2],
          [t[0] - w * 0.12 + bump * 0.5, t[1] - h.noseLen * 0.5],
          [t[0] - w * 0.1, t[1] - 5],
        ],
        false,
      ),
      `fill="none" stroke="${sk.lit}" stroke-width="2.2" opacity="0.32" filter="url(#soft1)"`,
    ),
  );
  // The bridge's edge on the shadow side.
  out.push(
    path(
      smooth(
        [
          [h.noseRoot[0] + h.a * 0.12, h.noseRoot[1] + 2],
          [t[0] + w * 0.14 + bump, t[1] - h.noseLen * 0.55],
          [t[0] + w * 0.32, t[1] - 3],
        ],
        false,
      ),
      `fill="none" stroke="${sk.shadow}" stroke-width="2.4" opacity="0.5" filter="url(#soft1)"`,
    ),
  );
  // The near wing of the nostril, and its shade.
  out.push(
    path(
      smooth([
        [t[0] - w * 0.36, t[1] - 5.5],
        [t[0] - w * 0.6, t[1] - 1.5],
        [t[0] - w * 0.48, t[1] + 2.4],
        [t[0] - w * 0.2, t[1] + 2.8],
        [t[0] - w * 0.26, t[1] - 2],
      ]),
      `fill="${sk.shadow}" opacity="0.28" filter="url(#soft1)"`,
    ),
  );
  out.push(
    path(
      smooth(
        [
          [t[0] - w * 0.42, t[1] - 5],
          [t[0] - w * 0.58, t[1] - 1],
          [t[0] - w * 0.42, t[1] + 2.4],
          [t[0] - w * 0.18, t[1] + 2.8],
        ],
        false,
      ),
      `fill="none" stroke="${sk.line}" stroke-width="1.1" opacity="0.5" filter="url(#soft06)"`,
    ),
  );
  // The far wing, in shadow.
  out.push(
    path(
      smooth(
        [
          [t[0] + w * 0.3, t[1] - 4],
          [t[0] + w * 0.46, t[1] + 0.5],
          [t[0] + w * 0.3, t[1] + 2.6],
        ],
        false,
      ),
      `fill="none" stroke="${sk.deep}" stroke-width="1.8" opacity="0.5" filter="url(#soft1)"`,
    ),
  );
  // The tip: a rounded form, lit from the left.
  out.push(
    `<defs><radialGradient id="${id}" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stop-color="${sk.lit}"/><stop offset="0.55" stop-color="${mix(sk.base, sk.blush, 0.25)}" stop-opacity="0.6"/><stop offset="1" stop-color="${sk.shadow}" stop-opacity="0"/></radialGradient></defs>`,
  );
  out.push(
    ell(
      t[0] - 0.5,
      t[1] - 2.5,
      w * 0.27,
      w * 0.24,
      `fill="url(#${id})" filter="url(#soft06)"`,
    ),
  );
  // Nostrils.
  out.push(
    ell(
      t[0] - w * 0.25,
      t[1] + 1.8 - (snub ? 0.6 : 0),
      w * 0.15,
      snub ? 1.7 : 1.25,
      `fill="${dark}" opacity="0.85" filter="url(#soft06)"`,
      -14,
    ),
  );
  out.push(
    ell(
      t[0] + w * 0.17,
      t[1] + 1.6,
      w * 0.09,
      1,
      `fill="${dark}" opacity="0.6" filter="url(#soft06)"`,
      12,
    ),
  );
  // The point of the tip.
  out.push(
    ell(
      t[0] - 1.6,
      t[1] - 3.8,
      w * 0.08,
      w * 0.07,
      `fill="#fff6e8" opacity="0.5" filter="url(#soft06)"`,
    ),
  );
  if (hooked)
    out.push(
      path(
        smooth(
          [
            [t[0] - 2, t[1] + 1],
            [t[0] + w * 0.1, t[1] + 2.6],
            [t[0] + w * 0.25, t[1] + 1.4],
          ],
          false,
        ),
        `fill="none" stroke="${sk.line}" stroke-width="0.9" opacity="0.4"`,
      ),
    );
  return `<g>${out.join("")}</g>`;
}

// ---------------------------------------------------------------- mouth

function paintMouth(h: Head, s: Sitting, sk: SkinPalette): string {
  const L = s.look;
  const [mx, my] = h.mouth;
  const W = h.mouthW;
  const k = h.b / 46;
  const up =
    [3.6, 4.8, 3.9, 3.7, 4.6][L.mouth] *
    k *
    (1 - h.child * 0.2) *
    (1 - h.old * 0.3) *
    (1 - h.expr.tight * 0.3);
  const lo =
    [5.0, 7.0, 5.6, 5.2, 6.4][L.mouth] *
    k *
    (1 - h.child * 0.15) *
    (1 - h.old * 0.25) *
    (1 - h.expr.tight * 0.3);
  const bow = L.mouth === 4 ? 1.4 : L.mouth === 0 ? 0.5 : 0.9;
  const curl = -h.expr.mouth * 2.4;
  const nX = mx - W * 0.56;
  const fX = mx + W * 0.4;
  const cY = my + curl * 0.5;
  const line: Pt[] = [
    [nX, cY + (h.expr.mouth < 0 ? 1 : 0)],
    [mx - W * 0.22, my + 0.5 + curl * -0.15],
    [mx + W * 0.02, my + 0.9],
    [mx + W * 0.22, my + 0.6],
    [fX, cY + 0.3],
  ];
  const upper: Pt[] = [
    line[0],
    [mx - W * 0.28, my - up * 0.85],
    [mx - W * 0.08, my - up * 1.05],
    [mx + W * 0.0, my - up + bow],
    [mx + W * 0.09, my - up * 1.02],
    [mx + W * 0.26, my - up * 0.7],
    line[4],
  ];
  const lower: Pt[] = [
    line[4],
    [mx + W * 0.24, my + lo * 0.82],
    [mx - W * 0.04, my + lo * 1.02],
    [mx - W * 0.3, my + lo * 0.8],
    line[0],
  ];
  const lipUp = mix(sk.lip, sk.shadow, 0.35);
  const lipLo = sk.lip;
  const lineC = mix(sk.lip, "#2a0f08", 0.65);
  const out: string[] = [];
  out.push(`<g filter="url(#soft06)">`);
  out.push(
    path(
      smooth([...upper, ...line.slice(1, -1).reverse()], true, 0.4),
      `fill="${lipUp}"`,
    ),
  );
  out.push(
    path(
      smooth([...lower, ...line.slice(1, -1)], true, 0.4),
      `fill="${lipLo}"`,
    ),
  );
  out.push(
    ell(
      mx - W * 0.1,
      my + lo * 0.42,
      W * 0.2,
      lo * 0.24,
      `fill="${light(sk.lip, 0.4)}" opacity="0.6"`,
    ),
  );
  out.push(
    ell(
      mx + W * 0.2,
      my + lo * 0.5,
      W * 0.18,
      lo * 0.3,
      `fill="${sk.shadow}" opacity="0.35"`,
    ),
  );
  out.push(`</g>`);
  out.push(
    `<g filter="url(#soft06)">${stroke([[line[0][0] - 1.5, line[0][1] + 0.4], ...line, [line[4][0] + 1, line[4][1] + 0.3]], 1.5 * k, `fill="${lineC}" opacity="0.9"`, [0.6, 0.45])}</g>`,
  );
  // Corners.
  out.push(
    ell(
      nX + 0.6,
      cY + 0.2,
      1.1,
      0.8,
      `fill="${lineC}" opacity="0.5" filter="url(#soft06)"`,
    ),
  );
  // The philtrum.
  out.push(
    path(
      `M${n(mx - 1.8)} ${n(h.noseTip[1] + 4)}Q${n(mx - 2.2)} ${n(my - up - 2)} ${n(mx - W * 0.08)} ${n(my - up * 1.05)}`,
      `fill="none" stroke="${sk.shadow}" stroke-width="1" opacity="0.3" filter="url(#soft1)"`,
    ),
  );
  if (h.expr.mouth > 0.5) {
    out.push(
      path(
        smooth(
          [
            [nX - 1, cY - 1],
            [nX - 2.5, cY - 3.5],
          ],
          false,
        ),
        `fill="none" stroke="${sk.shadow}" stroke-width="1" opacity="0.4" filter="url(#soft06)"`,
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
  const smile = h.expr.cheek;
  // Beside the mouth: from the nostril's wing down past the corner.
  const nl = Math.max(o * 0.9, smile * 0.4, h.child > 0 ? 0 : 0.15);
  if (nl > 0) {
    out.push(
      path(
        smooth(
          [
            [t[0] - h.noseW * 0.6, t[1] - 1],
            [h.mouth[0] - h.mouthW * 0.72, h.mouth[1] - 3],
            [h.mouth[0] - h.mouthW * 0.72, h.mouth[1] + 6 + o * 4],
          ],
          false,
        ),
        `fill="none" stroke="${sk.shadow}" stroke-width="${n(1.4 + o)}" opacity="${op(nl * 0.55)}" filter="url(#soft1)"`,
      ),
    );
    out.push(
      path(
        smooth(
          [
            [t[0] + h.noseW * 0.45, t[1] - 1],
            [h.mouth[0] + h.mouthW * 0.52, h.mouth[1] - 2],
          ],
          false,
        ),
        `fill="none" stroke="${sk.shadow}" stroke-width="1.2" opacity="${op(nl * 0.4)}" filter="url(#soft1)"`,
      ),
    );
  }
  if (o > 0.35) {
    const k = (o - 0.35) / 0.65;
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
          `fill="none" stroke="${sk.line}" stroke-width="0.8" opacity="${op(k * 0.35)}" filter="url(#soft06)"`,
        ),
      );
    }
    // Crow's feet at the near eye.
    const e = h.eyeN;
    for (let i = -1; i <= 1; i++)
      out.push(
        path(
          `M${n(e[0] - h.eyeW * 0.62)} ${n(e[1] + i * 1.8)}l${n(-4)} ${n(i * 2)}`,
          `stroke="${sk.line}" stroke-width="0.7" opacity="${op(k * 0.4)}"`,
        ),
      );
    // Under the eyes.
    out.push(
      path(
        smooth(
          [
            [e[0] - h.eyeW * 0.4, e[1] + h.eyeH * 1.0],
            [e[0], e[1] + h.eyeH * 1.5],
            [e[0] + h.eyeW * 0.45, e[1] + h.eyeH * 1.0],
          ],
          false,
        ),
        `fill="none" stroke="${sk.line}" stroke-width="0.7" opacity="${op(k * 0.4)}"`,
      ),
    );
    // Jowls and neck.
    out.push(
      path(
        smooth(
          [
            [h.mouth[0] - h.mouthW * 0.7, h.mouth[1] + 8],
            [h.mouth[0] - h.mouthW * 0.5, h.chin[1] - 6],
          ],
          false,
        ),
        `fill="none" stroke="${sk.shadow}" stroke-width="1.2" opacity="${op(k * 0.35)}" filter="url(#soft1)"`,
      ),
    );
  }
  if (o > 0.6) {
    // Old age: the cheek falls, lines from the mouth's corners, a hollow temple.
    const k = Math.min(1, (o - 0.6) / 0.4);
    const ok = (v: number) => op(v * k);
    out.push(
      path(
        smooth([h.P(-0.62, 0.02), h.P(-0.72, 0.3), h.P(-0.74, 0.62)], false),
        `fill="none" stroke="${sk.shadow}" stroke-width="1.6" opacity="${ok(0.45)}" filter="url(#soft1)"`,
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
        `fill="none" stroke="${sk.shadow}" stroke-width="1.3" opacity="${ok(0.5)}" filter="url(#soft06)"`,
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
        `fill="none" stroke="${sk.shadow}" stroke-width="1.1" opacity="${ok(0.4)}" filter="url(#soft06)"`,
      ),
    );
    out.push(
      `<g clip-path="url(#headClip)" filter="url(#soft3)">${ell(h.cx - h.a * 0.92, h.cy - h.b * 0.4, h.a * 0.14, h.b * 0.16, `fill="${sk.shadow}" opacity="${ok(0.4)}"`)}${ell(h.eyeN[0], h.eyeN[1] - h.eyeH * 1.1, h.eyeW * 0.5, h.eyeH * 0.5, `fill="${sk.shadow}" opacity="${ok(0.35)}"`)}</g>`,
    );
    for (let i = 0; i < 2; i++) {
      const e = h.eyeN;
      out.push(
        path(
          smooth(
            [
              [e[0] - h.eyeW * 0.35, e[1] + h.eyeH * (1.5 + i * 0.7)],
              [e[0] + h.eyeW * 0.05, e[1] + h.eyeH * (2 + i * 0.7)],
              [e[0] + h.eyeW * 0.45, e[1] + h.eyeH * (1.5 + i * 0.7)],
            ],
            false,
          ),
          `fill="none" stroke="${sk.line}" stroke-width="0.7" opacity="${ok(0.35)}"`,
        ),
      );
    }
  }
  // A frown's furrow between the brows.
  if (h.expr.browIn > 0.4 || o > 0.6) {
    const x = h.noseRoot[0] - 1;
    out.push(
      path(
        `M${n(x - 1.5)} ${n(h.browY - 1)}l${n(0.6)} ${n(5)}M${n(x + 2)} ${n(h.browY - 1)}l${n(-0.4)} ${n(5)}`,
        `stroke="${sk.line}" stroke-width="0.8" opacity="0.4" filter="url(#soft06)"`,
      ),
    );
  }
  if (h.expr.browUp > 0.5) {
    for (let i = 0; i < 2; i++) {
      const y = h.browY - 7 - i * 4;
      out.push(
        path(
          smooth(
            [
              [h.noseRoot[0] - 9, y + 1],
              [h.noseRoot[0], y - 1.5],
              [h.noseRoot[0] + 9, y + 1],
            ],
            false,
          ),
          `fill="none" stroke="${sk.line}" stroke-width="0.8" opacity="0.35"`,
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
