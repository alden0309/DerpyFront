// Every character's likeness: a period portrait from the gallery (real
// paintings of the 1600s and 1700s, engine/Gallery.ts), in an oval gilt
// frame. A player's character wears the picture they chose, its hair and
// clothes tuned through the picture's masks and the hair greying with the
// years; everyone else has a picture that suits their sex, years, people and
// station. In a scene the sitter stands cut out of their own background
// (`bare`), turned toward whoever they're facing.

import { html, svg, type SVGTemplateResult, type TemplateResult } from "lit";
import {
  CLOTH_COLORS,
  greyAt,
  HAIR_TONES,
  type Look,
  lookOf,
  type Sitter,
  sitterAt,
  sitterOf,
} from "../engine/Appearance";
import type { Character } from "../engine/Types";
import { fullUrl, maskUrl, thumbUrl } from "./Gallery";

/** A passing mood, shown as a touch of light and colour on the painting. */
export type Expression = "neutral" | "smile" | "frown" | "worried" | "angry";

export type PortraitSize = "xs" | "s" | "m" | "l" | "xl";

export interface PortraitOpts {
  age: number;
  /** The nation's colour (the frame's ribbon elsewhere; kept for callers). */
  color: string;
  native: boolean;
  /** Which way they look: right (the default) or left. */
  facing?: "left" | "right";
  expression?: Expression;
  size?: PortraitSize;
  /** The sitter alone, cut out of the painted ground (for standing in a scene). */
  bare?: boolean;
}

/** Small portraits use the small picture. */
function isSmall(o: { size?: PortraitSize }, cls: string): boolean {
  if (o.size) return o.size === "xs" || o.size === "s";
  return !/\b(xl|huge|large|scene|banner-token)\b/.test(cls);
}

/** Whether a picture is turned: to face a given way, or as the player turned it. */
export function turned(
  s: Sitter,
  look: Look | null,
  facing?: "left" | "right",
): boolean {
  if (facing) return (s.look === "l") === (facing === "right");
  return !!look?.flip;
}

/** The picture for a character, as a URL an <img> or a canvas can show (untuned). */
export function likenessOf(
  c: Character,
  o: PortraitOpts,
  cls = "",
): string | null {
  const s = sitterOf(c, Math.max(0, o.age));
  return isSmall(o, cls) ? thumbUrl(s.id) : fullUrl(s.id);
}

// ---------------------------------------------------------------- tuning

/** How a picture is to be changed: hair and clothes, turned, cut out. */
export interface Tuning {
  /** The colour the hair is taken to, and how strongly (0: as painted). */
  hair: string | null;
  hairK: number;
  cloth: string | null;
  clothK: number;
  flip: boolean;
  bare: boolean;
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mixHex(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  const c = x.map((v, i) => Math.round((v * (1 - t) + y[i] * t) * 255));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A colour a shade lighter (+) or darker (-), for the tuning's shades. */
function shade(hex: string, steps: number): string {
  if (!steps) return hex;
  return steps > 0
    ? mixHex(hex, "#ffffff", 0.16 * steps)
    : mixHex(hex, "#000000", -0.2 * steps);
}

const GREY = "#c9c4bb";

/** What a look does to its picture at an age. */
export function tuningOf(
  look: Look | null,
  s: Sitter,
  age: number,
  o: { facing?: "left" | "right"; bare?: boolean } = {},
): Tuning {
  const t: Tuning = {
    hair: null,
    hairK: 0,
    cloth: null,
    clothK: 0,
    flip: turned(s, look, o.facing),
    // Prints and drawings stay on their paper.
    bare: !!o.bare && !s.flat,
  };
  if (!look) return t;
  const canHair = !s.wig && s.hair !== "hidden";
  if (canHair) {
    const g = greyAt(look, age, s);
    const chosen =
      look.hair >= 0
        ? shade(HAIR_TONES[look.hair].hex, look.hairL)
        : look.hairL
          ? shade(s.hx, look.hairL)
          : null;
    if (chosen || g > 0) {
      t.hair = mixHex(chosen ?? s.hx, GREY, g * 0.85);
      t.hairK = chosen ? 0.9 : Math.min(0.9, g * 1.1);
    }
  }
  if (look.cloth >= 0 || look.clothL) {
    t.cloth = shade(
      look.cloth >= 0 ? CLOTH_COLORS[look.cloth].hex : s.cx,
      look.clothL,
    );
    t.clothK = 0.82;
  }
  return t;
}

/** Whether a tuning leaves the picture as painted (an <img> will do). */
function plain(t: Tuning): boolean {
  return !t.hair && !t.cloth && !t.bare;
}

let seq = 0;

/**
 * How a part of the picture is taken to a new colour, keeping the painting's
 * light and shade. The part's lightness is first scaled so its average
 * lands at 0.4 (`mean` is how light it is as painted), then a table takes
 * that to the new colour: the average to the colour itself, the shadows
 * and highlights darker and lighter, softened so dark hair doesn't turn to
 * tinsel when it's made fair. Clothes keep a little of their own darkness
 * (a black coat dyed scarlet comes out a deep red); hair takes the colour
 * asked for.
 */
export function recolourSpec(
  hex: string,
  mean: number,
  kind: "hair" | "cloth",
): { gain: number; tables: [string, string, string] } {
  const hair = kind === "hair";
  const m = Math.max(hair ? 0.08 : 0.04, Math.min(0.6, mean));
  let rgb = rgbOf(hex);
  const lum = Math.max(
    0.02,
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2],
  );
  // Dyes on old cloth are a little muted.
  if (!hair) rgb = rgb.map((c) => c * 0.85 + lum * 0.15) as typeof rgb;
  const want = hair ? lum : Math.pow(lum, 0.7) * Math.pow(m, 0.3);
  const k = want / lum;
  const p = hair ? 0.5 : 0.8;
  const tables = rgb.map((c) => {
    const out: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const v = c * k * Math.pow(i / 32 / 0.4, p);
      out.push(Math.max(0, Math.min(1, v)).toFixed(3));
    }
    return out.join(" ");
  }) as [string, string, string];
  return { gain: 1 / (2.5 * m), tables };
}

function recolour(
  id: string,
  hex: string,
  mean: number,
  kind: "hair" | "cloth",
): SVGTemplateResult {
  const { gain, tables } = recolourSpec(hex, mean, kind);
  const w = [0.2126, 0.7152, 0.0722].map((x) => (x * gain).toFixed(4));
  const row = `${w.join(" ")} 0 0`;
  return svg`<filter id=${id} color-interpolation-filters="sRGB">
    ${
      kind === "hair"
        ? svg`<feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="soft" />
          <feComposite in="soft" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.72" k3="0.28" k4="0" />`
        : ""
    }
    <feColorMatrix type="matrix" values=${`${row} ${row} ${row} 0 0 0 1 0`} />
    <feComponentTransfer>
      <feFuncR type="table" tableValues=${tables[0]} />
      <feFuncG type="table" tableValues=${tables[1]} />
      <feFuncB type="table" tableValues=${tables[2]} />
    </feComponentTransfer>
  </filter>`;
}

/** One of the mask's channels as a mask: 0 hair, 1 clothes, 2 the figure. */
function channel(
  id: string,
  ch: 0 | 1 | 2,
  maskHref: string,
): SVGTemplateResult {
  const row = [0, 0, 0, 0, 0];
  row[ch] = 1.12;
  row[4] = -0.06;
  const v = `${row.join(" ")} ${row.join(" ")} ${row.join(" ")} 0 0 0 0 1`;
  return svg`<filter id=${`${id}f`} color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">
      <feColorMatrix type="matrix" values=${v} />
    </filter>
    <mask id=${id} maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="600">
      <image href=${maskHref} width="480" height="600" preserveAspectRatio="none" filter=${`url(#${id}f)`} />
    </mask>`;
}

/** A picture as painted, or tuned through its masks (an inline SVG). */
export function picture(s: Sitter, t: Tuning, small: boolean): TemplateResult {
  const href = (small ? thumbUrl(s.id) : fullUrl(s.id)) ?? "";
  const m = maskUrl(s.id);
  if (plain(t) || !m)
    return html`<img
      src=${href}
      alt=""
      loading="lazy"
      decoding="async"
      class=${t.flip ? "flip" : ""}
    />`;
  const id = `cqp${++seq}`;
  const layer = (
    which: "h" | "c",
    hex: string,
    k: number,
    mean: number,
  ): SVGTemplateResult => svg`${recolour(`${id}${which}`, hex, mean, which === "h" ? "hair" : "cloth")}
    <image href=${href} width="480" height="600" preserveAspectRatio="none"
      filter=${`url(#${id}${which})`} mask=${`url(#${id}m${which === "h" ? 0 : 1})`} opacity=${k.toFixed(2)} />`;
  const figure = svg`<image href=${href} width="480" height="600" preserveAspectRatio="none" />
    ${t.hair ? layer("h", t.hair, t.hairK, s.hl) : ""}
    ${t.cloth ? layer("c", t.cloth, t.clothK, s.cl) : ""}`;
  return html`<svg
    viewBox="0 0 480 600"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      ${t.hair ? channel(`${id}m0`, 0, m) : ""}
      ${t.cloth ? channel(`${id}m1`, 1, m) : ""}
      ${t.bare ? channel(`${id}m2`, 2, m) : ""}
    </defs>
    <g transform=${t.flip ? "matrix(-1 0 0 1 480 0)" : ""}>
      <g mask=${t.bare ? `url(#${id}m2)` : ""}>${figure}</g>
    </g>
  </svg>`;
}

/** A look shown at an age (the register's preview, a player's picture). */
export function lookPicture(
  look: Look,
  age: number,
  o: {
    facing?: "left" | "right";
    bare?: boolean;
    small?: boolean;
    c?: Character;
  } = {},
): TemplateResult {
  const s = sitterAt(look, age, o.c);
  return picture(s, tuningOf(look, s, age, o), !!o.small);
}

// ---------------------------------------------------------------- frames

/** The portrait in its frame, sized by its class (or `size`). */
export function portrait(
  c: Character | undefined,
  o: PortraitOpts,
  cls = "",
): TemplateResult {
  const size = o.size ? `size-${o.size}` : "";
  if (!c) return html`<span class="cq-portrait empty ${size} ${cls}"></span>`;
  const age = Math.max(0, o.age);
  const look = c.look ?? lookOf(c, age);
  const s = sitterAt(look, age, c);
  const t = tuningOf(c.look ?? null, s, age, o);
  return html`<span
    class="cq-portrait ${c.alive ? "" : "dead"} ${size} ${t.bare
      ? "bare"
      : ""} ${o.expression ? `mood-${o.expression}` : ""} ${cls}"
    role="img"
    aria-label=${`Portrait of ${c.title ?? c.first}`}
    data-p=${s.id}
    >${picture(s, t, isSmall(o, cls))}</span
  >`;
}

/** A picture in the oval gilt frame. */
export function framed(
  url: string | null | TemplateResult,
  label: string,
  cls = "",
): TemplateResult {
  return html`<span class="cq-portrait ${cls}" role="img" aria-label=${label}
    >${url === null
      ? html`<span class="cq-portrait-blank"></span>`
      : typeof url === "string"
        ? html`<img src=${url} alt="" loading="lazy" decoding="async" />`
        : url}</span
  >`;
}
