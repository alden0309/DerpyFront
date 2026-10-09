// A portrait, painted in layers: a dark ground, the hair that falls behind,
// the body and its clothes, the neck and face, the hair in front, beard,
// hat and ornaments, then the varnish of an old canvas over it all. The
// result is an SVG document, kept so a long list of people paints quickly.

import {
  type Appearance,
  isNativeCulture,
  regionOf,
} from "../../engine/Appearance";
import { paintDress } from "./Dress";
import { paintExtras } from "./Extras";
import { paintEar, paintFace, paintNeck, skinPalette } from "./Face";
import { beginHair, paintBeard, paintHairBack, paintHairFront } from "./Hair";
import { paintHat } from "./Hats";
import { buildHead, type Expression, type Sitting } from "./Head";
import { Brush, light, mix, n, shade } from "./Svg";

export type { Expression } from "./Head";

export interface PaintOpts {
  female: boolean;
  age: number;
  year: number;
  culture: string;
  /** A native person (sometimes so whatever their culture says). */
  native?: boolean;
  expression?: Expression;
  facing?: "left" | "right";
  dead?: boolean;
  /** "lite" for small portraits: less brushwork. */
  detail?: "full" | "lite";
  /** Stands for the person, for the brushwork. */
  seed?: number;
  /** A colour to warm the ground toward (the nation's), lightly. */
  tint?: string;
}

const GROUNDS = [
  "#3a3122",
  "#2f2a22",
  "#34302a",
  "#3b2c22",
  "#2c3029",
  "#352a26",
];

function defs(detail: "full" | "lite", seed: number): string {
  const blur = (id: string, sd: number) =>
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
  const brush =
    detail === "full"
      ? `<filter id="brush" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.03 0.05" numOctaves="2" seed="${seed % 97}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.35"/></filter>
<filter id="brushHair" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.025" numOctaves="2" seed="${(seed + 5) % 97}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.45"/></filter>`
      : `<filter id="brush"><feOffset/></filter><filter id="brushHair"><feGaussianBlur stdDeviation="0.3"/></filter>`;
  return `<defs>${blur("soft06", 0.6)}${blur("soft1", 1)}${blur("soft2", 2)}${blur("soft3", 3)}${blur("soft4", 4.5)}${blur("soft8", 8)}${brush}
<filter id="canvas" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.62 0.58" numOctaves="1" seed="3"/><feColorMatrix values="0 0 0 0 0.22  0 0 0 0 0.16  0 0 0 0 0.09  0.7 0 0 0 -0.3"/></filter>
<filter id="streaks" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.07" numOctaves="3" seed="${(seed % 41) + 2}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 0.93  0 0 0 0 0.8  1.6 0 0 0 -0.75"/></filter>
<filter id="streaksDark" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.02" numOctaves="3" seed="${(seed % 37) + 9}"/><feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.06  0 0 0 0 0.02  1.6 0 0 0 -0.78"/></filter>
<filter id="skinNoise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="${(seed % 53) + 4}"/><feColorMatrix values="0 0 0 0 0.62  0 0 0 0 0.25  0 0 0 0 0.18  1.4 0 0 0 -0.62"/></filter>
<filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="3" seed="${seed % 89}"/><feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.72  0 0 0 0 0.5  0 0 0 0.9 -0.35"/></filter>
</defs>`;
}

function ground(bg: string): string {
  return `<defs><radialGradient id="ground" cx="0.33" cy="0.36" r="0.75">
<stop offset="0" stop-color="${light(bg, 0.22)}"/><stop offset="0.45" stop-color="${bg}"/><stop offset="1" stop-color="${shade(bg, 0.55)}"/></radialGradient></defs>
<rect width="240" height="300" fill="url(#ground)"/>
<rect width="240" height="300" filter="url(#mottle)" opacity="0.35"/>
<rect width="240" height="300" filter="url(#streaks)" opacity="0.16" style="mix-blend-mode:soft-light"/>
<rect width="240" height="300" filter="url(#streaksDark)" opacity="0.3" style="mix-blend-mode:multiply"/>`;
}

function varnish(): string {
  return `<defs><radialGradient id="vig" cx="0.45" cy="0.42" r="0.72">
<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#140a03" stop-opacity="0.55"/></radialGradient></defs>
<rect width="240" height="300" fill="#e8c27a" opacity="0.1" style="mix-blend-mode:multiply"/>
<rect width="240" height="300" fill="url(#vig)"/>
<rect width="240" height="300" filter="url(#canvas)" opacity="0.3"/>`;
}

/** A portrait of someone with a look, as an SVG document. */
export function paintPortrait(look: Appearance, o: PaintOpts): string {
  const native = o.native ?? isNativeCulture(o.culture);
  const seed = o.seed ?? 1;
  const detail = o.detail ?? "full";
  const br = new Brush(seed + 101);
  let bg = GROUNDS[Math.floor(br.next() * GROUNDS.length)];
  if (o.tint) bg = mix(bg, o.tint, 0.12);
  const s: Sitting = {
    look,
    female: o.female,
    age: Math.max(0, o.age),
    year: o.year,
    native,
    region: regionOf(o.culture),
    culture: o.culture,
    expression: o.expression ?? "neutral",
    seed,
    detail,
    bg,
  };
  beginHair();
  const h = buildHead(s);
  const sk = skinPalette(s);
  const body = paintDress(h, s, sk);
  // Every sitter holds their head a little differently.
  const pose = new Brush(seed * 31 + 7);
  const tilt = pose.range(-3.5, 3.5);
  const k = pose.range(0.96, 1.04);
  const dx = pose.range(-3, 3);
  const px = h.cx;
  const py = h.cy + h.b;
  const head = `transform="translate(${n(dx)} 0) rotate(${n(tilt)} ${n(px)} ${n(py)}) translate(${n(px)} ${n(py)}) scale(${Math.round(k * 1000) / 1000}) translate(${n(-px)} ${n(-py)})"`;
  const layers = [
    defs(detail, seed),
    ground(bg),
    `<g ${head}>${paintHairBack(h, s, sk)}</g>`,
    body.under,
    paintNeck(h, s, sk),
    body.over,
    paintExtras(h, s, sk, "body"),
    `<g ${head}>${paintEar(h, s, sk)}${paintFace(h, s, sk)}${paintBeard(h, s, sk)}${paintHairFront(h, s, sk)}</g>`,
    body.top,
    `<g ${head}>${paintHat(h, s)}${paintExtras(h, s, sk, "head")}</g>`,
    varnish(),
  ];
  const flip = o.facing === "left" ? ` transform="matrix(-1 0 0 1 240 0)"` : "";
  const dead = o.dead
    ? `<filter id="dead"><feColorMatrix type="saturate" values="0.05"/></filter>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="240" height="300">${dead}<g${flip}${o.dead ? ` filter="url(#dead)"` : ""}>${layers.join("\n")}</g></svg>`;
}

// ---------------------------------------------------------------- the cache

const cache = new Map<string, string>();
const CACHE_MAX = 400;

/** A portrait as a URL an <img> or a canvas can draw, painted once. */
export function portraitUrl(look: Appearance, o: PaintOpts): string {
  const key = `${JSON.stringify(look)}|${o.female ? 1 : 0}|${Math.floor(o.age)}|${o.year}|${o.culture}|${o.native ? 1 : 0}|${o.expression ?? ""}|${o.facing ?? ""}|${o.dead ? 1 : 0}|${o.detail ?? ""}|${o.seed ?? 1}|${o.tint ?? ""}`;
  const hit = cache.get(key);
  if (hit) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const svg = paintPortrait(look, o);
  let url: string;
  if (typeof Blob !== "undefined" && typeof URL?.createObjectURL === "function")
    url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  else url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  if (cache.size > CACHE_MAX) {
    const [oldKey, oldUrl] = cache.entries().next().value as [string, string];
    cache.delete(oldKey);
    if (oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
  }
  return url;
}

/** Rounded for keys and the brushwork. */
export function round1(v: number): string {
  return n(v);
}
