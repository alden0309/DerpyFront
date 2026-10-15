// DFSTORE (r21): small pictures of what the Derp Store's newer items do,
// shared by Derp Land's Store and Inventory and DerpyFront's Derp Store page:
// a Nuke & Dome effect pack drawn as a nuke streaking into a burst beside a
// shimmering Dome, and (AIP r23) an AI personality's mark.

import {
  SKIN_MOTION_TEXT,
  type SkinMotion,
} from "@openfront/shared/DerpySkinMotion";
import { html, nothing, svg, TemplateResult } from "lit";
import { AI_CHOICE_ICON } from "../client/derpy/AiPersonalityIcons";

export interface FxColours {
  trail: string[];
  burst: string[];
  dome: string;
  accent: string;
  shimmer: string;
}

const safeId = (s: string) => s.replace(/[^a-z0-9_-]/gi, "_");

/**
 * A nuke's trail arcing into its burst, and a Dome with its shimmer, in the
 * pack's colours. Animated gently (and not at all with reduced motion).
 */
export function fxPreview(name: string, fx: FxColours): TemplateResult {
  const id = safeId(name);
  const stops = (colors: string[]) =>
    colors.map(
      (c, i) =>
        svg`<stop offset=${`${(i / Math.max(1, colors.length - 1)) * 100}%`} stop-color=${c} />`,
    );
  const burst = fx.burst.slice(0, 4);
  return html`<svg
    class="dfx-preview"
    viewBox="0 0 320 120"
    role="img"
    aria-hidden="true"
    data-shimmer=${fx.shimmer}
  >
    <defs>
      <linearGradient id=${`t_${id}`} x1="0" y1="1" x2="1" y2="0">
        ${stops(fx.trail)}
      </linearGradient>
      <radialGradient id=${`d_${id}`} cx="50%" cy="60%" r="60%">
        <stop offset="0%" stop-color=${fx.dome} stop-opacity="0.12" />
        <stop offset="70%" stop-color=${fx.dome} stop-opacity="0.35" />
        <stop offset="100%" stop-color=${fx.accent} stop-opacity="0.75" />
      </radialGradient>
    </defs>
    <rect width="320" height="120" rx="10" fill="#101418" />
    <path d="M0 104 Q60 92 100 100 T190 96 T320 104 V120 H0Z" fill="#1d2a22" />
    <!-- the Dome -->
    <g class="dfx-dome">
      <circle cx="70" cy="76" r="42" fill=${`url(#d_${id})`} />
      <circle
        cx="70"
        cy="76"
        r="42"
        fill="none"
        stroke=${fx.accent}
        stroke-width="2"
        opacity="0.9"
      />
      <circle
        class="dfx-shimmer"
        cx="70"
        cy="76"
        r="30"
        fill="none"
        stroke=${fx.accent}
        stroke-width="1.5"
        opacity="0.5"
      />
    </g>
    <!-- the nuke, its trail and its burst -->
    <path
      class="dfx-trail"
      d="M128 112 Q190 6 262 58"
      fill="none"
      stroke=${`url(#t_${id})`}
      stroke-width="5"
      stroke-linecap="round"
    />
    <g class="dfx-burst">
      ${burst.map(
        (c, i) =>
          svg`<circle cx="262" cy="58" r=${30 - i * 7} fill="none" stroke=${c} stroke-width=${3 + i} opacity=${0.95 - i * 0.12} />`,
      )}
      <circle cx="262" cy="58" r="5" fill=${burst[0] ?? "#fff"} />
    </g>
  </svg>`;
}

/**
 * AIP (r23): an AI personality's mark before its name in the store: its
 * icon in a small coloured tile. Nothing for any other item.
 */
export function personalityMark(
  aiType: string | undefined,
): TemplateResult | typeof nothing {
  const icon =
    aiType !== undefined && aiType in AI_CHOICE_ICON
      ? AI_CHOICE_ICON[aiType as keyof typeof AI_CHOICE_ICON]
      : undefined;
  if (icon === undefined) return nothing;
  return html`<span class="dfx-aimark" data-ai-type=${aiType} aria-hidden="true"
    >${icon}</span
  >`;
}

// ---- SITE (r22): skins that move ----

/**
 * A skin's picture for the store. One that moves (DerpySkinMotion.ts) plays
 * a little of its motion here too, in CSS (drifting, rippling, a gleam or a
 * twinkle; still with reduced motion), with a "Moves" badge.
 */
export function skinArt(
  s: { url: string; motion?: string },
  opts: {
    alt?: string;
    cls?: string;
    moves?: string;
    hint?: (motion: SkinMotion) => string;
  } = {},
): TemplateResult {
  const motion = s.motion as SkinMotion | undefined;
  if (!motion || !(motion in SKIN_MOTION_TEXT)) {
    return html`<img
      src=${s.url}
      alt=${opts.alt ?? ""}
      loading="lazy"
      class=${opts.cls ?? ""}
    />`;
  }
  const hint = (opts.hint ?? ((m) => SKIN_MOTION_TEXT[m]))(motion);
  return html`<span
    class="dsk-move ${opts.cls ?? ""}"
    data-motion=${motion}
    role="img"
    aria-label=${[opts.alt, hint].filter(Boolean).join(": ")}
    title=${hint}
    ><span class="dsk-strip"
      ><img src=${s.url} alt="" loading="lazy" /><img
        src=${s.url}
        alt=""
        loading="lazy" /></span
    ><span class="dsk-badge">${opts.moves ?? "Moves"}</span></span
  >`;
}

/** SITE (r22): the moving skins' thumbnails (unlayered, so they win over the pages' own skin rules). */
const SKIN_MOTION_CSS = `
.dsk-move{position:relative;display:block;overflow:hidden;width:100%;aspect-ratio:1;margin:0;padding:0;border-radius:8px;background:#0003}
.dsk-strip{display:flex;width:200%;height:100%;margin:0}
.dsk-strip img{flex:none;display:block;width:50%;height:100%;aspect-ratio:auto;object-fit:cover;margin:0;border-radius:0;background:none}
.dsk-move:not([data-motion=drift]) .dsk-strip{width:100%}
.dsk-move:not([data-motion=drift]) .dsk-strip img{width:100%}
.dsk-move:not([data-motion=drift]) .dsk-strip img+img{display:none}
.dsk-move[data-motion=drift] .dsk-strip{animation:dsk-drift 14s linear infinite}
.dsk-move[data-motion=ripple] img{animation:dsk-ripple 5s ease-in-out infinite}
.dsk-move[data-motion=twinkle] img{animation:dsk-twinkle 1.8s ease-in-out infinite}
.dsk-move[data-motion=shimmer]::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.6) 50%,transparent 58%);background-size:300% 100%;animation:dsk-gleam 3.2s linear infinite;pointer-events:none}
.dsk-badge{position:absolute;top:5px;right:5px;z-index:1;display:block;margin:0;padding:1px 7px;border-radius:99px;background:#000000b3;color:#fde68a;font-size:10px;font-weight:800;letter-spacing:.05em;line-height:1.6;text-transform:uppercase;text-align:center}
@keyframes dsk-drift{to{transform:translateX(-50%)}}
@keyframes dsk-ripple{0%,100%{transform:scale(1.06)}33%{transform:scale(1.08) skew(1.2deg,-.6deg)}66%{transform:scale(1.05) skew(-.8deg,.9deg)}}
@keyframes dsk-twinkle{0%,100%{filter:brightness(.85)}50%{filter:brightness(1.4)}}
@keyframes dsk-gleam{from{background-position:0 0}to{background-position:100% 0}}
@media (prefers-reduced-motion:reduce){.dsk-move *,.dsk-move::after{animation:none!important}}
`;

// ---- DLC (r21): Derpy Conquest's items ----

export interface MapStylePalette {
  sea: string;
  land: string;
  ink: string;
  accent: string;
}

/** The same coast for every style, so the styles compare side by side. */
const COAST =
  "M0 22 C30 18 52 30 70 26 C96 20 104 40 128 44 C150 48 160 34 182 38 C204 42 210 62 236 66 C258 70 270 58 292 64 C304 67 312 74 320 76 V120 H0Z";
const BORDER = "M92 120 C98 96 112 84 128 74 C142 66 150 58 156 44";
const BORDER2 = "M228 120 C224 100 230 84 236 66";

/**
 * A corner of Conquest's map in a style's colours, with what's particular
 * to it (hatched seas, snow, lamplit towns, rhumb lines and a serpent, a
 * woodcut's heavy lines). Drawn, not loaded, and still.
 */
export function mapStylePreview(
  name: string,
  style: string,
  p: MapStylePalette,
): TemplateResult {
  const id = safeId(name);
  const towns: [number, number][] = [
    [112, 92],
    [196, 96],
    [268, 102],
  ];
  const extra = (() => {
    switch (style) {
      case "antique":
        return svg`${Array.from(
          { length: 7 },
          (_, i) =>
            svg`<path d=${`M${10 + i * 6} ${8 + i * 2} C70 ${2 + i * 2} 140 ${18 + i * 2} 210 ${8 + i * 2} S300 ${4 + i * 2} 316 ${10 + i * 2}`} fill="none" stroke=${p.ink} stroke-width=".6" opacity=".35" />`,
        )}`;
      case "winter":
        return svg`${Array.from({ length: 34 }, (_, i) => {
          const x = (i * 97) % 316;
          const y = 50 + ((i * 37) % 66);
          return svg`<circle cx=${x} cy=${y} r=${i % 3 ? 1.2 : 1.8} fill="#ffffff" opacity=".9" />`;
        })}<path d=${COAST} fill="none" stroke="#ffffff" stroke-width="5" opacity=".55" />`;
      case "night":
        return svg`${Array.from(
          { length: 22 },
          (_, i) =>
            svg`<circle cx=${(i * 53) % 318} cy=${4 + ((i * 29) % 30)} r=${i % 4 ? 0.8 : 1.4} fill="#f4ecc8" opacity=".8" />`,
        )}${towns.map(
          ([x, y]) =>
            svg`<circle cx=${x} cy=${y} r="11" fill=${`url(#glow_${id})`} />`,
        )}`;
      case "pirate":
        return svg`<g stroke=${p.ink} stroke-width=".7" opacity=".45">${Array.from(
          { length: 10 },
          (_, i) => {
            const a = (i / 10) * Math.PI;
            return svg`<path d=${`M${40 - Math.cos(a) * 120} ${30 - Math.sin(a) * 120} L${40 + Math.cos(a) * 300} ${30 + Math.sin(a) * 300}`} />`;
          },
        )}</g><path d="M190 14 c8 -10 16 6 24 -2 s16 8 24 0 s10 -8 16 -2" fill="none" stroke=${p.ink} stroke-width="2.2" stroke-linecap="round" /><circle cx="258" cy="11" r="1.4" fill=${p.ink} /><rect width="320" height="120" fill=${`url(#burn_${id})`} />`;
      case "woodcut":
        return svg`${Array.from(
          { length: 4 },
          (_, i) =>
            svg`<path d=${`M${18 + i * 70} ${12 + (i % 2) * 6} q10 -8 20 0 t20 0`} fill="none" stroke=${p.ink} stroke-width="2.6" stroke-linecap="round" />`,
        )}`;
      default:
        return svg``;
    }
  })();
  return html`<svg
    class="dfx-preview dl-mapstyle"
    viewBox="0 0 320 120"
    role="img"
    aria-hidden="true"
    data-style=${style}
  >
    <defs>
      <radialGradient id=${`glow_${id}`}>
        <stop offset="0%" stop-color=${p.accent} stop-opacity=".95" />
        <stop offset="100%" stop-color=${p.accent} stop-opacity="0" />
      </radialGradient>
      <radialGradient id=${`burn_${id}`} cx="50%" cy="50%" r="75%">
        <stop offset="70%" stop-color="#000" stop-opacity="0" />
        <stop offset="100%" stop-color="#3a1a08" stop-opacity=".75" />
      </radialGradient>
    </defs>
    <rect width="320" height="120" rx="10" fill=${p.sea} />
    <path
      d=${COAST}
      fill=${p.land}
      stroke=${p.ink}
      stroke-width=${style === "woodcut" ? 3.2 : 1.4}
    />
    <path
      d=${BORDER}
      fill="none"
      stroke=${p.accent}
      stroke-width=${style === "antique" ? 5 : 2}
      opacity=${style === "antique" ? 0.45 : 0.9}
      stroke-dasharray=${style === "pirate" ? "4 3" : "none"}
    />
    <path
      d=${BORDER2}
      fill="none"
      stroke=${p.accent}
      stroke-width=${style === "antique" ? 5 : 2}
      opacity=${style === "antique" ? 0.45 : 0.9}
      stroke-dasharray=${style === "pirate" ? "4 3" : "none"}
    />
    ${extra}
    ${towns.map(
      ([x, y]) =>
        svg`<rect x=${x - 3} y=${y - 3} width="6" height="6" fill=${style === "night" ? "#ffd27a" : p.ink} />`,
    )}
    <g transform="translate(40 30)" stroke=${p.ink} fill=${p.ink}>
      <circle r="10" fill="none" stroke-width="1" />
      <path d="M0 -15 L3 0 L0 15 L-3 0Z M-15 0 L0 -3 L15 0 L0 3Z" />
    </g>
  </svg>`;
}

/** What a Derpy Conquest item brings, a line each. */
export function conquestFeatures(features: string[]): TemplateResult {
  return html`<ul class="dl-features">
    ${features.map((f) => html`<li>${f}</li>`)}
  </ul>`;
}
// ---- end DLC (r21)

/** DLC (r21): Conquest items' feature lists and map style charts. */
const DLC_PREVIEW_CSS = `
.dl-features{margin:6px 0 0;padding-left:18px;display:grid;gap:4px;font-size:13.5px;line-height:1.4}
.dl-mapstyle{max-width:360px}`;

/** Styles for the previews; every page that shows them adds them once. */
export const STORE_PREVIEW_CSS = `
.dfx-preview{display:block;width:100%;height:auto;max-width:420px;border-radius:10px}
.dfx-trail{stroke-dasharray:240;stroke-dashoffset:240;animation:dfx-fly 2.8s ease-in infinite}
.dfx-burst{transform-origin:262px 58px;animation:dfx-burst 2.8s ease-out infinite}
.dfx-shimmer{transform-origin:70px 76px;animation:dfx-shim 3.2s ease-in-out infinite}
@keyframes dfx-fly{0%{stroke-dashoffset:240}55%,100%{stroke-dashoffset:0}}
@keyframes dfx-burst{0%,50%{transform:scale(.1);opacity:0}62%{opacity:1}100%{transform:scale(1);opacity:0}}
@keyframes dfx-shim{0%,100%{transform:scale(.55);opacity:.15}50%{transform:scale(1.25);opacity:.7}}
@media (prefers-reduced-motion:reduce){.dfx-trail,.dfx-burst,.dfx-shimmer{animation:none;stroke-dashoffset:0;opacity:1;transform:none}}
.dfx-aimark{display:inline-flex;align-items:center;justify-content:center;width:1.6em;height:1.6em;margin-right:.45em;border-radius:.45em;font-size:.95em;line-height:1;vertical-align:-.25em;background:#ffffff14;border:1px solid #ffffff24}
.dfx-aimark[data-ai-type=mad_scientist]{background:#84cc1624;border-color:#a3e63566}
.dfx-aimark[data-ai-type=trader]{background:#0ea5e924;border-color:#38bdf866}
.dfx-aimark[data-ai-type=aggressive]{background:#f9731624;border-color:#fb923c66}
.dfx-aimark[data-ai-type=protector]{background:#fbbf2424;border-color:#fcd34d66}
`;

let injected = false;
/** Adds STORE_PREVIEW_CSS to the page once. */
export function ensurePreviewStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.storePreviews = "";
  style.textContent = STORE_PREVIEW_CSS + DLC_PREVIEW_CSS + SKIN_MOTION_CSS; // DLC (r21), SITE (r22)
  document.head.appendChild(style);
}
