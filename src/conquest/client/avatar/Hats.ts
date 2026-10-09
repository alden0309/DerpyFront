// Hats, caps, bonnets, helmets and headdresses, set on the head at the
// turn of the face: felt hats that throw a shadow over the brow, linen caps
// and coifs, helmets of the pike and musket years, and the feathers, roaches,
// turbans and woven hats of the native peoples.

import { CLOTH_COLORS, isWig } from "../../engine/Appearance";
import type { Head, Sitting } from "./Head";
import {
  Brush,
  ell,
  light,
  lum,
  mix,
  n,
  path,
  type Pt,
  shade,
  smooth,
  stroke,
} from "./Svg";

let hid = 0;

const FELT = "#1f1b18";
const LINEN = "#e2dbcd";
const STEEL = "#8e959c";

function grad(
  c: string,
  kind: "felt" | "linen" | "steel" | "cloth" = "cloth",
): string {
  const id = `hg${hid++}`;
  const lit =
    kind === "steel"
      ? light(c, 0.55)
      : kind === "linen"
        ? "#fbf8f2"
        : light(c, lum(c) < 0.2 ? 0.18 : 0.28);
  const dk =
    kind === "linen"
      ? mix(c, "#5a6474", 0.45)
      : shade(c, kind === "steel" ? 0.5 : 0.5);
  return `${id}|<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="${lit}"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${dk}"/></linearGradient></defs>`;
}

/** A shape filled with a lit-from-the-left gradient. */
function fillShape(
  d: string,
  c: string,
  kind: "felt" | "linen" | "steel" | "cloth" = "cloth",
  extra = "",
): string {
  const [id, def] = grad(c, kind).split("|");
  return `${def}${path(d, `fill="url(#${id})" ${extra}`)}`;
}

/** Where a hat sits: the band round the head, and how big the head is. */
function seat(h: Head, s: Sitting) {
  const big =
    isWig(s.look.hair) && h.child < 0.3
      ? s.look.hair === "full_wig" || s.look.hair === "powder_wig"
        ? 12
        : 6
      : ["piled", "powdered"].includes(s.look.hair)
        ? 8
        : 3;
  const sk = h.skull;
  return {
    bx: sk.cx + h.a * 0.14,
    by: sk.cy - sk.ry * 0.42 - big * 0.4,
    rx: sk.rx + big * 0.8 + 2,
    top: sk.cy - sk.ry - big,
    big,
  };
}

/** The shadow a brim throws over the brow. */
function brimShadow(h: Head, depth: number): string {
  return `<g clip-path="url(#headClip)" filter="url(#soft4)">${ell(h.cx + h.a * 0.15, h.hairY + depth * 0.4, h.a * 1.4, depth, `fill="#1a0d06" opacity="0.5"`)}</g>`;
}

function brimmed(
  h: Head,
  s: Sitting,
  o: {
    brim: number;
    crownH: number;
    crownTop: number;
    color: string;
    band?: string;
    buckle?: boolean;
    tilt?: number;
    round?: boolean;
  },
): string {
  const z = seat(h, s);
  const rx = z.rx * o.brim;
  const ry = rx * 0.2;
  const cx = z.bx + 2;
  const cy = z.by + 2;
  const tilt = o.tilt ?? -4;
  const cw = z.rx * 0.98;
  const H = o.crownH;
  const crown = o.round
    ? smooth(
        [
          [cx - cw, cy],
          [cx - cw * 0.98, cy - H * 0.6],
          [cx - cw * 0.6, cy - H],
          [cx + cw * 0.5, cy - H * 1.02],
          [cx + cw * 0.95, cy - H * 0.55],
          [cx + cw, cy],
        ],
        true,
        0.4,
      )
    : smooth(
        [
          [cx - cw, cy],
          [cx - cw * o.crownTop, cy - H],
          [cx - cw * o.crownTop * 0.4, cy - H - 3],
          [cx + cw * o.crownTop * 0.6, cy - H - 2],
          [cx + cw * o.crownTop, cy - H + 1],
          [cx + cw, cy],
        ],
        true,
        0.2,
      );
  const brimBack = `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(cx + rx)} ${n(cy)}Z`;
  const brimFront = `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry * 1.25)} 0 0 0 ${n(cx + rx)} ${n(cy)}A${n(rx * 0.96)} ${n(ry * 0.7)} 0 0 1 ${n(cx - rx)} ${n(cy)}Z`;
  const g = `transform="rotate(${tilt} ${n(cx)} ${n(cy)})"`;
  let out = `<g ${g} filter="url(#brush)">`;
  out += fillShape(brimBack, shade(o.color, 0.15), "felt");
  out += fillShape(crown, o.color, "felt");
  if (o.band) {
    out += path(
      `M${n(cx - cw)} ${n(cy - 2)}Q${n(cx)} ${n(cy + 4)} ${n(cx + cw)} ${n(cy - 2)}L${n(cx + cw * 0.98)} ${n(cy - 8)}Q${n(cx)} ${n(cy - 2)} ${n(cx - cw * 0.99)} ${n(cy - 8)}Z`,
      `fill="${o.band}"`,
    );
    if (o.buckle)
      out += `<rect x="${n(cx + cw * 0.15)}" y="${n(cy - 9)}" width="8" height="8" rx="1" fill="none" stroke="#c9a85a" stroke-width="1.6"/>`;
  }
  out += fillShape(brimFront, o.color, "felt");
  out += path(
    `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry * 1.25)} 0 0 0 ${n(cx + rx)} ${n(cy)}`,
    `fill="none" stroke="${light(o.color, 0.25)}" stroke-width="1" opacity="0.5"`,
  );
  out += `</g>`;
  return brimShadow(h, 10 + (o.brim - 1) * 14) + out;
}

function tricorne(h: Head, s: Sitting, lace: boolean): string {
  const z = seat(h, s);
  const cx = z.bx + 2;
  const cy = z.by + 1;
  const R = z.rx * 1.05;
  // Three upturned walls: the left and right of the front corner, and the back.
  const L: Pt = [cx - R * 1.38, cy - 15];
  const F: Pt = [cx + R * 0.32, cy + 7];
  const Rt: Pt = [cx + R * 1.18, cy - 13];
  const back: Pt[] = [
    L,
    [cx - R * 0.7, cy - 30],
    [cx + R * 0.2, cy - 33],
    [cx + R * 0.9, cy - 26],
    Rt,
    [cx + R * 0.4, cy - 18],
    [cx - R * 0.6, cy - 20],
  ];
  const crown: Pt[] = [
    [cx - R * 0.75, cy - 6],
    [cx - R * 0.55, cy - 24],
    [cx + R * 0.1, cy - 29],
    [cx + R * 0.7, cy - 22],
    [cx + R * 0.85, cy - 6],
  ];
  const left: Pt[] = [
    L,
    [cx - R * 0.55, cy + 1],
    F,
    [cx + R * 0.3, cy - 10],
    [cx - R * 0.45, cy - 15],
    [L[0] + 5, L[1] - 7],
  ];
  const right: Pt[] = [
    F,
    [cx + R * 0.8, cy - 1],
    Rt,
    [Rt[0] - 4, Rt[1] - 7],
    [cx + R * 0.75, cy - 12],
    [cx + R * 0.32, cy - 9],
  ];
  const edgeC = lace ? "#c9a24c" : light(FELT, 0.32);
  const edgeW = lace ? 2.6 : 1.1;
  let out = `<g filter="url(#brush)">`;
  out += fillShape(smooth(back, true, 0.3), shade(FELT, 0.15), "felt");
  out += fillShape(
    smooth(crown, true, 0.4),
    mix(FELT, "#3a3430", 0.25),
    "felt",
  );
  out += fillShape(smooth(right, true, 0.25), shade(FELT, 0.05), "felt");
  out += fillShape(smooth(left, true, 0.25), FELT, "felt");
  out += path(
    smooth(
      [
        [L[0] + 5, L[1] - 7],
        [cx - R * 0.45, cy - 15],
        [cx + R * 0.3, cy - 10],
      ],
      false,
    ),
    `fill="none" stroke="${edgeC}" stroke-width="${edgeW}" opacity="0.9"`,
  );
  out += path(
    smooth(
      [
        [cx + R * 0.32, cy - 9],
        [cx + R * 0.75, cy - 12],
        [Rt[0] - 4, Rt[1] - 7],
      ],
      false,
    ),
    `fill="none" stroke="${edgeC}" stroke-width="${edgeW}" opacity="0.8"`,
  );
  out += path(
    smooth(
      [
        L,
        [cx - R * 0.7, cy - 30],
        [cx + R * 0.2, cy - 33],
        [cx + R * 0.9, cy - 26],
        Rt,
      ],
      false,
    ),
    `fill="none" stroke="${edgeC}" stroke-width="${edgeW * 0.8}" opacity="0.6"`,
  );
  // The cockade, and its loop and button.
  out += ell(
    cx - R * 0.05,
    cy - 8,
    5.5,
    6,
    `fill="${lace ? "#141210" : "#24201c"}" stroke="${lace ? "#c9a24c" : "#4a4440"}" stroke-width="0.9"`,
  );
  out += ell(
    cx - R * 0.05,
    cy - 8,
    1.6,
    1.6,
    `fill="${lace ? "#d8b860" : "#6a6058"}"`,
  );
  out += `</g>`;
  return brimShadow(h, 12) + out;
}

function plume(
  x: number,
  y: number,
  len: number,
  c: string,
  dir: 1 | -1,
): string {
  const br = new Brush(Math.round(x * 7 + y));
  let out = stroke(
    [
      [x, y],
      [x + dir * len * 0.4, y - len * 0.35],
      [x + dir * len, y - len * 0.1],
      [x + dir * len * 1.15, y + len * 0.25],
    ],
    9,
    `fill="${c}" opacity="0.95"`,
    [0.4, 0.2],
  );
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    const px = x + dir * len * t * 1.05;
    const py = y - len * 0.35 * Math.sin(t * Math.PI) + t * len * 0.15;
    out += path(
      `M${n(px)} ${n(py)}q${n(dir * br.range(2, 5))} ${n(br.range(3, 7))} ${n(dir * br.range(1, 3))} ${n(br.range(7, 11))}`,
      `fill="none" stroke="${light(c, 0.3)}" stroke-width="1" opacity="0.7"`,
    );
  }
  return `<g filter="url(#brushHair)">${out}</g>`;
}

function feather(
  x: number,
  y: number,
  len: number,
  angle: number,
  tip = "#2a2420",
): string {
  const id = `fe${hid++}`;
  const w = len * 0.13;
  return `<g transform="rotate(${n(angle)} ${n(x)} ${n(y)})" filter="url(#brush)"><defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f0ebe0"/><stop offset="0.62" stop-color="#e6dfd0"/><stop offset="0.7" stop-color="${tip}"/><stop offset="1" stop-color="${tip}"/></linearGradient></defs>
${path(`M${n(x)} ${n(y)}C${n(x - w)} ${n(y - len * 0.3)} ${n(x - w * 0.9)} ${n(y - len * 0.8)} ${n(x)} ${n(y - len)}C${n(x + w * 0.9)} ${n(y - len * 0.8)} ${n(x + w)} ${n(y - len * 0.3)} ${n(x)} ${n(y)}Z`, `fill="url(#${id})"`)}
${path(`M${n(x)} ${n(y + 2)}L${n(x)} ${n(y - len * 0.95)}`, `stroke="#c8bfae" stroke-width="0.8"`)}</g>`;
}

/** A cap of linen or wool that covers the hair from the brow back. */
function capShape(
  h: Head,
  s: Sitting,
  o: { front: number; puff: number; low: number; ears: boolean },
): Pt[] {
  const z = seat(h, s);
  const sk = h.skull;
  const pts: Pt[] = [];
  const f0 = -0.3;
  const f1 = -Math.PI - 0.7;
  for (let i = 0; i <= 10; i++) {
    const f = f0 + ((f1 - f0) * i) / 10;
    const r = 3 + o.puff * Math.sin((i / 10) * Math.PI);
    pts.push([
      sk.cx + (sk.rx + r + z.big * 0.4) * Math.cos(f),
      sk.cy + (sk.ry + r + z.big * 0.4) * Math.sin(f),
    ]);
  }
  pts.push([h.neckN - 2, h.cy + h.b * o.low]);
  if (o.ears)
    pts.push(
      [h.ear[0] + 6, h.ear[1] + h.earH * 0.6],
      [h.cx - h.a * 1.02, h.cy - h.b * 0.25],
    );
  else pts.push([h.ear[0] - 4, h.ear[1] - h.earH * 0.4]);
  pts.push(
    h.P(-0.55, -0.92 + o.front),
    h.P(0.1, -1.0 + o.front),
    h.P(0.75, -0.85 + o.front),
    [h.cx + h.a * 1.02, h.cy - h.b * 0.62],
  );
  return pts;
}

function frill(pts: Pt[], c: string, r = 3): string {
  let out = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const k = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / (r * 1.4)));
    for (let j = 0; j < k; j++) {
      const x = x1 + ((x2 - x1) * j) / k;
      const y = y1 + ((y2 - y1) * j) / k;
      out += ell(
        x,
        y,
        r,
        r * 0.85,
        `fill="${light(c, 0.3)}" stroke="${mix(c, "#5a6474", 0.4)}" stroke-width="0.5"`,
      );
    }
  }
  return `<g filter="url(#brush)">${out}</g>`;
}

export function paintHat(h: Head, s: Sitting): string {
  hid = 0;
  const key = s.look.hat;
  const c2 = CLOTH_COLORS[s.look.colors[2]]?.hex ?? "#8f2b22";
  const z = seat(h, s);
  const sk = h.skull;
  switch (key) {
    case "none":
      return "";
    case "capotain":
      return brimmed(h, s, {
        brim: 1.42,
        crownH: h.b * 0.95,
        crownTop: 0.78,
        color: FELT,
        band: "#0f0d0b",
        buckle: s.year < 1660,
      });
    case "broad":
      return brimmed(h, s, {
        brim: 1.62,
        crownH: h.b * 0.42,
        crownTop: 0.85,
        color: s.female ? FELT : mix(FELT, "#3a2a1a", 0.3),
        band: "#0f0d0b",
        round: true,
      });
    case "plumed":
      return (
        brimmed(h, s, {
          brim: 1.75,
          crownH: h.b * 0.5,
          crownTop: 0.88,
          color: FELT,
          band: c2,
          tilt: -9,
          round: true,
        }) +
        plume(
          z.bx - z.rx * 0.6,
          z.by - 6,
          h.a * 1.3,
          mix("#f2eee6", c2, 0.15),
          -1,
        )
      );
    case "tricorne":
      return tricorne(h, s, false);
    case "laced":
      return tricorne(h, s, true);
    case "monmouth":
    case "tuque":
    case "fur_cap": {
      const col =
        key === "tuque"
          ? "#a8302a"
          : key === "fur_cap"
            ? "#5b4130"
            : mix(c2, "#5a4a3a", 0.35);
      const pts = capShape(h, s, {
        front: 0.12,
        puff: key === "tuque" ? 6 : 3,
        low: -0.15,
        ears: false,
      });
      let out = `<g filter="url(#brushHair)">${fillShape(smooth(pts, true, 0.4), col)}`;
      if (key === "tuque")
        out +=
          stroke(
            [
              [sk.cx - sk.rx * 0.2, sk.cy - sk.ry - 2],
              [sk.cx - sk.rx * 0.9, sk.cy - sk.ry * 0.6],
              [sk.cx - sk.rx * 1.25, sk.cy - sk.ry * 0.1],
            ],
            16,
            `fill="${shade(col, 0.15)}"`,
            [1, 0.5],
          ) +
          ell(
            sk.cx - sk.rx * 1.25,
            sk.cy - sk.ry * 0.05,
            5,
            5,
            `fill="${light(col, 0.2)}"`,
          );
      // The rolled edge.
      out += stroke(
        [h.P(-0.85, -0.82), h.P(-0.2, -0.95), h.P(0.5, -0.92), h.P(1.0, -0.72)],
        7,
        `fill="${shade(col, 0.12)}"`,
        [0.8, 0.8],
      );
      if (key === "fur_cap") {
        const br = new Brush(s.seed);
        for (let i = 0; i < 70; i++) {
          const p = pts[Math.floor(br.next() * pts.length)];
          out += path(
            `M${n(p[0] + br.range(-14, 14))} ${n(p[1] + br.range(0, 16))}l${n(br.range(-2, 2))} ${n(br.range(3, 6))}`,
            `stroke="${br.next() < 0.5 ? "#8a6a50" : "#2e2018"}" stroke-width="1.2" opacity="0.6"`,
          );
        }
      }
      return out + `</g>` + brimShadow(h, 6);
    }
    case "morion": {
      const cx = z.bx;
      const cy = z.by + 4;
      const dome = smooth(
        [
          [cx - z.rx * 0.95, cy],
          [cx - z.rx * 0.9, cy - 26],
          [cx - 4, cy - 38],
          [cx + z.rx * 0.8, cy - 26],
          [cx + z.rx * 0.95, cy],
        ],
        true,
        0.4,
      );
      const comb = smooth(
        [
          [cx - z.rx * 0.85, cy - 22],
          [cx - z.rx * 0.5, cy - 44],
          [cx + z.rx * 0.2, cy - 50],
          [cx + z.rx * 0.75, cy - 30],
          [cx + z.rx * 0.6, cy - 24],
          [cx, cy - 36],
        ],
        true,
        0.3,
      );
      const brim = smooth(
        [
          [cx - z.rx * 1.7, cy - 14],
          [cx - z.rx * 1.0, cy + 2],
          [cx + z.rx * 1.0, cy + 4],
          [cx + z.rx * 1.75, cy - 12],
          [cx + z.rx * 1.0, cy - 3],
          [cx - z.rx * 1.0, cy - 5],
        ],
        true,
        0.4,
      );
      return (
        brimShadow(h, 10) +
        `<g filter="url(#brush)">${fillShape(comb, STEEL, "steel")}${fillShape(dome, STEEL, "steel")}${fillShape(brim, shade(STEEL, 0.05), "steel")}${ell(cx - z.rx * 0.4, cy - 24, 6, 9, `fill="#ffffff" opacity="0.35" filter="url(#soft2)"`)}</g>`
      );
    }
    case "pot": {
      const cx = z.bx;
      const cy = z.by + 4;
      const dome = smooth(
        [
          [cx - z.rx * 1.02, cy + 4],
          [cx - z.rx * 0.95, cy - 26],
          [cx, cy - 34],
          [cx + z.rx * 0.9, cy - 22],
          [cx + z.rx * 1.0, cy + 2],
        ],
        true,
        0.4,
      );
      const tail = smooth(
        [
          [cx - z.rx * 1.0, cy - 4],
          [cx - z.rx * 1.3, cy + 30],
          [cx - z.rx * 0.7, cy + 44],
          [cx - z.rx * 0.55, cy + 8],
        ],
        true,
        0.3,
      );
      const peak = smooth(
        [
          [cx + z.rx * 0.2, cy],
          [cx + z.rx * 1.5, cy + 8],
          [cx + z.rx * 1.3, cy + 14],
          [cx + z.rx * 0.1, cy + 6],
        ],
        true,
        0.3,
      );
      let lames = "";
      for (let i = 1; i < 4; i++)
        lames += path(
          `M${n(cx - z.rx * (1.0 + i * 0.08))} ${n(cy + i * 10)}q${n(z.rx * 0.3)} ${n(4)} ${n(z.rx * 0.5)} ${n(2)}`,
          `fill="none" stroke="${shade(STEEL, 0.45)}" stroke-width="1"`,
        );
      return (
        brimShadow(h, 10) +
        `<g filter="url(#brush)">${fillShape(tail, shade(STEEL, 0.1), "steel")}${lames}${fillShape(dome, STEEL, "steel")}${fillShape(peak, shade(STEEL, 0.1), "steel")}${ell(cx - z.rx * 0.35, cy - 18, 6, 8, `fill="#ffffff" opacity="0.35" filter="url(#soft2)"`)}</g>`
      );
    }
    case "mitre": {
      // A grenadier's mitre: a tall embroidered front, the cap behind it,
      // and a small red flap at the foot.
      const cx = z.bx + 2;
      const cy = z.by + 4;
      const facing = CLOTH_COLORS[s.look.colors[1]]?.hex ?? "#273b5f";
      const coat = CLOTH_COLORS[s.look.colors[0]]?.hex ?? "#b6312a";
      const back = smooth(
        [
          [cx - z.rx * 0.98, cy],
          [cx - z.rx * 0.85, cy - 34],
          [cx - z.rx * 0.2, cy - 56],
          [cx + z.rx * 0.3, cy - 40],
          [cx + z.rx * 0.5, cy],
        ],
        true,
        0.3,
      );
      const front = smooth(
        [
          [cx - z.rx * 0.62, cy + 2],
          [cx - z.rx * 0.52, cy - 40],
          [cx - z.rx * 0.05, cy - 66],
          [cx + z.rx * 0.45, cy - 42],
          [cx + z.rx * 0.82, cy + 3],
        ],
        true,
        0.3,
      );
      const flap = smooth(
        [
          [cx - z.rx * 0.6, cy - 4],
          [cx + z.rx * 0.8, cy - 3],
          [cx + z.rx * 0.82, cy + 4],
          [cx - z.rx * 0.62, cy + 3],
        ],
        true,
        0.1,
      );
      let deco = "";
      for (let i = 0; i < 4; i++) {
        const y = cy - 12 - i * 11;
        const w = z.rx * (0.55 - i * 0.12);
        deco += path(
          `M${n(cx + z.rx * 0.1 - w)} ${n(y)}q${n(w)} ${n(-6)} ${n(w * 2)} 0`,
          `fill="none" stroke="#d8c58a" stroke-width="1.3" opacity="0.85"`,
        );
      }
      return `<g filter="url(#brush)">${fillShape(back, coat)}${fillShape(front, facing)}${deco}${path(`M${n(cx + z.rx * 0.08)} ${n(cy - 50)}l-3 6h6z`, `fill="#d8c58a"`)}${fillShape(flap, "#a8302a")}</g>`;
    }
    case "skullcap":
      return `<g filter="url(#brush)">${fillShape(
        smooth(
          [
            [sk.cx - sk.rx * 0.55, sk.cy - sk.ry * 0.86],
            [sk.cx - sk.rx * 0.2, sk.cy - sk.ry - 4],
            [sk.cx + sk.rx * 0.45, sk.cy - sk.ry * 0.96],
            [sk.cx + sk.rx * 0.6, sk.cy - sk.ry * 0.8],
            [sk.cx, sk.cy - sk.ry * 0.86],
          ],
          true,
          0.4,
        ),
        FELT,
        "felt",
      )}</g>`;
    case "biretta": {
      const cx = z.bx - 2;
      const cy = z.by;
      const base = smooth(
        [
          [cx - z.rx * 0.98, cy + 2],
          [cx - z.rx * 0.95, cy - 18],
          [cx + z.rx * 0.9, cy - 18],
          [cx + z.rx * 0.98, cy + 2],
          [cx, cy + 6],
        ],
        true,
        0.2,
      );
      let fins = "";
      for (const [dx, h0] of [
        [-0.5, 14],
        [0.05, 18],
        [0.6, 13],
      ] as const)
        fins += path(
          `M${n(cx + z.rx * dx - 9)} ${n(cy - 18)}q${n(9)} ${n(-h0)} ${n(18)} 0`,
          `fill="${shade(FELT, 0.1)}" stroke="${light(FELT, 0.2)}" stroke-width="0.8"`,
        );
      return (
        brimShadow(h, 6) +
        `<g filter="url(#brush)">${fillShape(base, FELT, "felt")}${fins}${ell(cx + z.rx * 0.05, cy - 30, 4.5, 4, `fill="#1a1612"`)}</g>`
      );
    }
    case "at_home": {
      const col = mix(c2, "#3a2a1a", 0.15);
      const pts = capShape(h, s, {
        front: 0.05,
        puff: 8,
        low: -0.3,
        ears: false,
      });
      return `<g filter="url(#brush)">${fillShape(smooth(pts, true, 0.4), col)}${stroke([h.P(-0.9, -0.85), h.P(-0.1, -1.02), h.P(0.6, -0.95), h.P(1.05, -0.72)], 10, `fill="${shade(col, 0.25)}"`, [0.8, 0.8])}</g>`;
    }
    // ---------------------------------------------------------------- women's caps and hats
    case "coif":
    case "lace_cap":
    case "mob_cap":
    case "steeple":
    case "fontange": {
      const mob = key === "mob_cap";
      const front = mob ? 0.08 : 0.2;
      const pts = capShape(h, s, {
        front,
        puff: mob ? 10 : 2,
        low: 0.25,
        ears: !mob,
      });
      const edge: Pt[] = [
        h.P(-0.97, -0.5),
        h.P(-0.55, -0.92 + front),
        h.P(0.1, -1.0 + front),
        h.P(0.75, -0.85 + front),
        [h.cx + h.a * 1.04, h.cy - h.b * 0.55],
      ];
      const nape: Pt = [h.neckN - 2, h.cy + h.b * 0.25];
      let out = `<g clip-path="url(#headClip)" filter="url(#soft2)">${path(
        smooth(
          edge.map(([x, y]): Pt => [x, y + 3]),
          false,
        ),
        `fill="none" stroke="#3a2214" stroke-width="5" opacity="0.28"`,
      )}</g>`;
      out += `<g filter="url(#brush)">${fillShape(smooth(pts, true, 0.4), LINEN, "linen")}`;
      // The seam over the crown, the gathers at the nape, the turned-back edge.
      const id = `cf${hid++}`;
      let folds = path(
        smooth(
          [
            [edge[2][0] - 4, edge[2][1] - 3],
            [sk.cx, sk.cy - sk.ry - 2],
            [sk.cx - sk.rx * 0.8, sk.cy - sk.ry * 0.4],
            nape,
          ],
          false,
        ),
        `fill="none" stroke="#8a93a2" stroke-width="1.2" opacity="0.55"`,
      );
      for (let i = 0; i < 6; i++) {
        const f = -Math.PI * 0.55 - i * 0.18;
        folds += path(
          `M${n(nape[0])} ${n(nape[1])}L${n(sk.cx + sk.rx * 0.8 * Math.cos(f))} ${n(sk.cy + sk.ry * 0.8 * Math.sin(f))}`,
          `stroke="#7f8898" stroke-width="1.6" opacity="0.3"`,
        );
      }
      out += `<defs><clipPath id="${id}">${path(smooth(pts, true, 0.4), "")}</clipPath></defs><g clip-path="url(#${id})" filter="url(#soft1)">${folds}${ell(sk.cx - sk.rx * 0.9, sk.cy + sk.ry * 0.3, sk.rx * 0.5, sk.ry * 0.6, `fill="#5a6474" opacity="0.3"`)}</g>`;
      out += stroke(
        edge,
        mob ? 4 : 5.5,
        `fill="${mix(LINEN, "#ffffff", 0.35)}" opacity="0.9"`,
        [0.5, 0.5],
      );
      if (key === "lace_cap" || mob)
        out += frill(
          edge.map(([x, y]): Pt => [x, y - 1]),
          LINEN,
          mob ? 3.8 : 2.6,
        );
      if (mob)
        out += stroke(
          [
            [sk.cx - sk.rx * 0.9, sk.cy - sk.ry * 0.3],
            [sk.cx, sk.cy - sk.ry * 0.6],
            [sk.cx + sk.rx * 0.9, sk.cy - sk.ry * 0.5],
          ],
          5,
          `fill="${c2}"`,
          [0.8, 0.8],
        );
      out += `</g>`;
      if (key === "steeple")
        out += brimmed(h, s, {
          brim: 1.35,
          crownH: h.b * 0.85,
          crownTop: 0.8,
          color: FELT,
          band: "#0f0d0b",
        });
      if (key === "fontange") {
        const cx = h.P(0.05, -1.0)[0];
        const cy = h.P(0, -1.0)[1] - 4;
        let tiers = "";
        for (let i = 3; i >= 0; i--)
          tiers += path(
            `M${n(cx - 16 + i * 2)} ${n(cy)}Q${n(cx - 12)} ${n(cy - 30 - i * 6)} ${n(cx + 2)} ${n(cy - 34 - i * 7)}Q${n(cx + 14)} ${n(cy - 28 - i * 6)} ${n(cx + 16 - i * 2)} ${n(cy)}Z`,
            `fill="${i % 2 ? LINEN : "#f2eee6"}" stroke="#9aa1ad" stroke-width="0.6" opacity="0.95"`,
          );
        out += `<g filter="url(#brush)">${tiers}</g>`;
      }
      return out;
    }
    case "hood": {
      // A black hood over a linen cap, falling to the shoulders.
      const capPts = capShape(h, s, {
        front: 0.1,
        puff: 7,
        low: 0.4,
        ears: true,
      });
      const y0 = h.neckBase;
      const near: Pt[] = [
        [h.cx - h.a * 1.04, h.cy - h.b * 0.45],
        [h.cx - h.a * 1.08, h.cy + h.b * 0.4],
        [h.neckN + 8, y0 + 8],
        [h.neckN - 6, y0 + 34],
        [h.neckN - 34, y0 + 30],
        [sk.cx - sk.rx - 10, h.cy + h.b * 0.2],
        [sk.cx - sk.rx - 8, h.cy - h.b * 0.6],
      ];
      const far: Pt[] = [
        [h.cx + h.a * 1.0, h.cy - h.b * 0.7],
        [h.cx + h.a * 1.24, h.cy - h.b * 0.3],
        [h.cx + h.a * 1.3, y0 + 18],
        [h.cx + h.a * 0.75, y0 + 16],
        [h.cx + h.a * 1.02, h.cy + h.b * 0.2],
      ];
      const edge: Pt[] = [
        h.P(-0.97, -0.45),
        h.P(-0.55, -0.82),
        h.P(0.1, -0.9),
        h.P(0.75, -0.76),
        [h.cx + h.a * 1.02, h.cy - h.b * 0.5],
      ];
      return `<g filter="url(#brush)">${fillShape(smooth(far, true, 0.4), "#141210", "felt")}${fillShape(smooth(near, true, 0.4), "#1b1816", "felt")}${fillShape(smooth(capPts, true, 0.4), "#1e1a17", "felt")}${stroke(edge, 5, `fill="${LINEN}"`, [0.5, 0.5])}${frill(edge, LINEN, 2.2)}</g>`;
    }
    case "straw": {
      const out = brimmed(h, s, {
        brim: 1.95,
        crownH: h.b * 0.22,
        crownTop: 0.9,
        color: "#c8a66a",
        band: c2,
        tilt: -10,
        round: true,
      });
      return out.replace(/#1f1b18/g, "#c8a66a");
    }
    case "mantilla": {
      const pts = capShape(h, s, {
        front: 0.02,
        puff: 10,
        low: 1.4,
        ears: true,
      });
      pts.splice(
        pts.length - 5,
        0,
        [h.neckN - 24, h.cy + h.b * 2.2],
        [h.neckN + 8, h.cy + h.b * 2.3],
      );
      const id = `ml${hid++}`;
      const br = new Brush(s.seed);
      let lace = "";
      for (let i = 0; i < 70; i++)
        lace += ell(
          br.range(40, 200),
          br.range(20, 300),
          br.range(1, 2.5),
          br.range(1, 2.5),
          `fill="none" stroke="#000" stroke-width="0.8" opacity="0.5"`,
        );
      return `<defs><clipPath id="${id}">${path(smooth(pts, true, 0.4), "")}</clipPath></defs><g filter="url(#brush)">${path(smooth(pts, true, 0.4), `fill="#141210" opacity="0.72"`)}<g clip-path="url(#${id})">${lace}</g>${frill([h.P(-0.95, -0.5), h.P(-0.5, -0.92), h.P(0.15, -1.02), h.P(0.8, -0.86)], "#2a2622", 2.4)}</g>`;
    }
    case "headscarf": {
      const pts = capShape(h, s, { front: 0.1, puff: 4, low: 0.2, ears: true });
      return `<g filter="url(#brush)">${fillShape(smooth(pts, true, 0.4), mix(c2, LINEN, 0.35))}${ell(h.neckN - 6, h.cy + h.b * 0.3, 8, 6, `fill="${shade(mix(c2, LINEN, 0.35), 0.2)}"`)}</g>`;
    }
    case "veil": {
      // The black veil, the white band over the brow and the wimple under the chin.
      const veil = capShape(h, s, {
        front: -0.1,
        puff: 10,
        low: 1.4,
        ears: true,
      });
      veil.splice(veil.length - 5, 0, [h.neckN - 36, 300], [h.neckN + 6, 300]);
      const band = stroke(
        [
          h.P(-0.98, -0.6),
          h.P(-0.5, -0.92),
          h.P(0.15, -1.0),
          h.P(0.75, -0.85),
          [h.cx + h.a * 1.05, h.cy - h.b * 0.55],
        ],
        10,
        `fill="${LINEN}"`,
        [0.6, 0.6],
      );
      const wimple = smooth(
        [
          [h.cx - h.a * 1.06, h.cy - h.b * 0.4],
          [h.cx - h.a * 1.0, h.cy + h.b * 0.55],
          [h.cx - h.a * 0.5, h.cy + h.b * 0.88],
          [h.chin[0], h.chin[1] + 3],
          [h.cx + h.a * 0.85, h.cy + h.b * 0.7],
          [h.cx + h.a * 1.08, h.cy - h.b * 0.3],
          [h.cx + h.a * 1.18, h.cy + h.b * 0.6],
          [h.cx + h.a * 1.2, h.cy + h.b * 1.45],
          [h.cx + h.a * 0.2, h.cy + h.b * 1.78],
          [h.cx - h.a * 1.1, h.cy + h.b * 1.5],
          [h.cx - h.a * 1.2, h.cy + h.b * 0.4],
        ],
        true,
        0.35,
      );
      return `<g filter="url(#brush)">${fillShape(smooth(veil, true, 0.4), "#141210", "felt")}${fillShape(wimple, LINEN, "linen")}${band}</g>`;
    }
    // ---------------------------------------------------------------- native headwear
    case "n_feather":
      return feather(
        sk.cx - sk.rx * 0.75,
        sk.cy - sk.ry * 0.2,
        h.b * 0.75,
        -35,
      );
    case "n_feathers":
      return (
        feather(sk.cx - sk.rx * 0.95, sk.cy + sk.ry * 0.1, h.b * 0.65, -150) +
        feather(sk.cx - sk.rx * 0.85, sk.cy + sk.ry * 0.05, h.b * 0.7, -170) +
        feather(sk.cx - sk.rx * 0.7, sk.cy - sk.ry * 0.3, h.b * 0.6, -25)
      );
    case "n_headband":
    case "n_gustoweh":
    case "n_turban":
    case "n_fur_turban": {
      const band =
        key === "n_fur_turban"
          ? "#5b4130"
          : key === "n_gustoweh"
            ? "#c9ccd0"
            : key === "n_turban"
              ? mix(c2, "#f0e8d8", 0.2)
              : c2;
      const wide =
        key === "n_turban"
          ? 22
          : key === "n_fur_turban"
            ? 18
            : key === "n_gustoweh"
              ? 9
              : 7;
      const y = (f: number) => sk.cy - sk.ry * 0.45 + f;
      const pts: Pt[] = [
        [sk.cx - sk.rx * 1.06, y(4)],
        [sk.cx - sk.rx * 0.2, y(-4)],
        [sk.cx + sk.rx * 0.7, y(-2)],
        [h.cx + h.a * 1.06, y(4)],
      ];
      let out = "";
      if (key === "n_gustoweh") {
        // A frame cap of feathers, a silver band, and upright feathers.
        out += fillShape(
          smooth(
            capShape(h, s, { front: 0.05, puff: 6, low: -0.3, ears: false }),
            true,
            0.4,
          ),
          "#d9d2c4",
        );
        const br = new Brush(s.seed);
        for (let i = 0; i < 26; i++) {
          const x = br.range(sk.cx - sk.rx, sk.cx + sk.rx * 0.9);
          const yy = br.range(sk.cy - sk.ry - 4, sk.cy - sk.ry * 0.45);
          out += path(
            `M${n(x)} ${n(yy)}q${n(-4)} ${n(4)} ${n(-8)} ${n(10)}`,
            `fill="none" stroke="${br.next() < 0.5 ? "#8a7a62" : "#f1ece2"}" stroke-width="2.4" stroke-linecap="round" opacity="0.8"`,
          );
        }
        out += feather(sk.cx - 4, sk.cy - sk.ry - 2, h.b * 0.85, -12);
      }
      if (key === "n_turban") {
        const turban: Pt[] = [
          [sk.cx - sk.rx * 1.12, y(14)],
          [sk.cx - sk.rx * 1.15, y(-14)],
          [sk.cx - sk.rx * 0.4, y(-28)],
          [sk.cx + sk.rx * 0.6, y(-26)],
          [h.cx + h.a * 1.12, y(-6)],
          [h.cx + h.a * 1.08, y(12)],
          [sk.cx, y(8)],
        ];
        out += fillShape(smooth(turban, true, 0.4), band);
        for (let i = 0; i < 4; i++)
          out += path(
            smooth(
              [
                [sk.cx - sk.rx * 1.1, y(10 - i * 7)],
                [sk.cx, y(-2 - i * 7)],
                [h.cx + h.a * 1.08, y(6 - i * 6)],
              ],
              false,
            ),
            `fill="none" stroke="${shade(band, 0.35)}" stroke-width="1.2" opacity="0.6"`,
          );
        out +=
          feather(sk.cx - sk.rx * 0.5, y(-22), h.b * 0.6, -18) +
          feather(sk.cx - sk.rx * 0.35, y(-22), h.b * 0.5, 8, "#3a2a20");
        return `<g filter="url(#brush)">${out}</g>`;
      }
      out += stroke(pts, wide, `fill="${band}"`, [1, 1]);
      if (key === "n_headband" || key === "n_gustoweh") {
        const br = new Brush(s.seed + 2);
        for (let i = 0; i < 14; i++) {
          const t = i / 14;
          const p =
            pts[Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)))];
          const q =
            pts[Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)) + 1)];
          const f = t * (pts.length - 1) - Math.floor(t * (pts.length - 1));
          const x = p[0] + (q[0] - p[0]) * f;
          const yy = p[1] + (q[1] - p[1]) * f;
          out += ell(
            x,
            yy,
            1.5,
            1.5,
            `fill="${i % 3 === 0 ? "#f1ece0" : key === "n_gustoweh" ? "#7a8088" : shade(band, 0.4)}"`,
          );
          void br;
        }
      }
      if (key === "n_fur_turban")
        out += stroke(
          [
            [sk.cx - sk.rx * 1.05, y(2)],
            [sk.cx - sk.rx * 1.25, y(20)],
            [sk.cx - sk.rx * 1.2, y(48)],
          ],
          10,
          `fill="${shade(band, 0.1)}" filter="url(#brushHair)"`,
          [1, 0.4],
        );
      return `<g filter="url(#brush)">${out}</g>`;
    }
    case "n_roach": {
      // Deer and porcupine hair, dyed red, standing along the crown.
      const br = new Brush(s.seed + 4);
      let out = "";
      for (let i = 0; i < 40; i++) {
        const f = -Math.PI / 2 + 0.6 - (i / 40) * 1.6;
        const x = sk.cx + sk.rx * 0.85 * Math.cos(f);
        const y = sk.cy + sk.ry * 0.95 * Math.sin(f);
        const len = 14 + br.range(0, 8);
        out += path(
          `M${n(x)} ${n(y)}l${n(br.range(-3, 3) - Math.cos(f) * 4)} ${n(-len)}`,
          `stroke="${br.next() < 0.6 ? "#a22a1e" : "#e8e2d6"}" stroke-width="1.8" stroke-linecap="round" opacity="0.9"`,
        );
      }
      return (
        `<g filter="url(#brushHair)">${out}</g>` +
        feather(sk.cx - 2, sk.cy - sk.ry - 6, h.b * 0.6, -20)
      );
    }
    case "n_spruce": {
      const cx = z.bx;
      const cy = z.by + 4;
      const hat = smooth(
        [
          [cx - z.rx * 1.7, cy + 2],
          [cx - z.rx * 0.5, cy - 30],
          [cx - z.rx * 0.35, cy - 40],
          [cx + z.rx * 0.4, cy - 40],
          [cx + z.rx * 0.6, cy - 30],
          [cx + z.rx * 1.75, cy + 4],
          [cx, cy + 10],
        ],
        true,
        0.2,
      );
      let deco = "";
      for (let y = cy - 34; y < cy; y += 5)
        deco += path(
          `M${n(cx - z.rx * 1.5)} ${n(y)}H${n(cx + z.rx * 1.5)}`,
          `stroke="#7a6038" stroke-width="0.8" opacity="0.5"`,
        );
      const id = `sp${hid++}`;
      return (
        brimShadow(h, 10) +
        `<defs><clipPath id="${id}">${path(hat, "")}</clipPath></defs><g filter="url(#brush)">${fillShape(hat, "#b89a62")}<g clip-path="url(#${id})">${deco}${path(`M${n(cx - z.rx * 0.9)} ${n(cy - 12)}q${n(z.rx * 0.5)} ${n(-14)} ${n(z.rx)} 0q${n(z.rx * 0.5)} ${n(14)} ${n(z.rx)} 0`, `fill="none" stroke="#1d1a18" stroke-width="3"`)}${ell(cx, cy - 14, 4, 3, `fill="#a3271c"`)}</g></g>`
      );
    }
    case "n_palm":
      return brimmed(h, s, {
        brim: 1.9,
        crownH: h.b * 0.5,
        crownTop: 0.82,
        color: "#c2a468",
        band: "#6a4a2a",
        round: true,
      }).replace(/#1f1b18/g, "#c2a468");
    case "n_cloth": {
      const col = c2;
      const pts: Pt[] = [
        [sk.cx - sk.rx * 1.05, sk.cy - sk.ry * 0.4],
        [sk.cx - sk.rx * 0.5, sk.cy - sk.ry - 6],
        [sk.cx + sk.rx * 0.7, sk.cy - sk.ry - 2],
        [h.cx + h.a * 1.06, sk.cy - sk.ry * 0.45],
        [sk.cx, sk.cy - sk.ry * 0.5],
      ];
      let out = fillShape(smooth(pts, true, 0.3), col);
      for (let i = 1; i < 4; i++)
        out += path(
          smooth(
            [
              [sk.cx - sk.rx, sk.cy - sk.ry * (0.4 + i * 0.15)],
              [sk.cx + sk.rx * 0.9, sk.cy - sk.ry * (0.45 + i * 0.15)],
            ],
            false,
          ),
          `fill="none" stroke="${i % 2 ? "#f1ece0" : shade(col, 0.4)}" stroke-width="2" opacity="0.8"`,
        );
      return `<g filter="url(#brush)">${out}</g>`;
    }
    case "n_peaked": {
      // The peaked cap of dark cloth, worked with ribbon and beads.
      const pts = capShape(h, s, {
        front: 0.06,
        puff: 4,
        low: 0.9,
        ears: true,
      });
      pts.splice(4, 0, [sk.cx - sk.rx * 0.1, sk.cy - sk.ry - 22]);
      let out = fillShape(smooth(pts, true, 0.3), "#1e2a3a");
      out += path(
        smooth(
          [
            [sk.cx - sk.rx * 1.05, sk.cy + sk.ry * 0.4],
            [sk.cx - sk.rx * 0.5, sk.cy - sk.ry * 0.6],
            [sk.cx - sk.rx * 0.1, sk.cy - sk.ry - 16],
          ],
          false,
        ),
        `fill="none" stroke="${c2}" stroke-width="3"`,
      );
      out += path(
        smooth(
          [
            [sk.cx - sk.rx * 1.0, sk.cy + sk.ry * 0.5],
            [sk.cx - sk.rx * 0.4, sk.cy - sk.ry * 0.5],
            [sk.cx, sk.cy - sk.ry - 12],
          ],
          false,
        ),
        `fill="none" stroke="#e8e2d6" stroke-width="1.4" stroke-dasharray="1.5 2"`,
      );
      return `<g filter="url(#brush)">${out}</g>`;
    }
  }
  return "";
}
