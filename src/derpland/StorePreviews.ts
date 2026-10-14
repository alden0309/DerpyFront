// DFSTORE (r21): small pictures of what the Derp Store's newer items do,
// shared by Derp Land's Store and Inventory and DerpyFront's Derp Store page:
// a Nuke & Dome effect pack drawn as a nuke streaking into a burst beside a
// shimmering Dome, and an AI persona's emblem card.

import { html, svg, TemplateResult } from "lit";

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

export const TEMPERAMENT_TEXT: Record<string, { label: string; hint: string }> =
  {
    aggressive: {
      label: "Aggressive",
      hint: "Attacks early and often, keeps little at home.",
    },
    trader: {
      label: "Trader",
      hint: "Ports and factories first; never embargoes; nukes only in answer.",
    },
    turtle: {
      label: "Turtle",
      hint: "Twice the SAMs, defense posts at the first sign of trouble.",
    },
    nuker: {
      label: "Nuker",
      hint: "Silos early and many.",
    },
    opportunist: {
      label: "Opportunist",
      hint: "Grabs empty land fast and pounces when it can.",
    },
  };

/** A persona: its emblem, its name, and its temperament. */
export function personaCard(
  p: { name: string; emblem: string; temperament: string },
  temperament: { label: string; hint: string } = TEMPERAMENT_TEXT[
    p.temperament
  ] ?? { label: p.temperament, hint: "" },
): TemplateResult {
  return html`<li class="dfx-persona" title=${temperament.hint}>
    <img src=${p.emblem} alt="" loading="lazy" />
    <span class="dfx-persona-name">${p.name}</span>
    <span class="dfx-temper" data-temperament=${p.temperament}
      >${temperament.label}</span
    >
  </li>`;
}

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
.dfx-personas{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:0;list-style:none}
.dfx-persona{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.dfx-persona img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:6px;background:#0003;margin:0}
.dfx-persona-name{font-weight:650;font-size:13px;line-height:1.25;overflow-wrap:anywhere}
.dfx-temper{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:1px 7px;border-radius:99px;background:#ffffff14;color:#d4d4d8}
.dfx-temper[data-temperament=aggressive]{background:#ef444429;color:#fca5a5}
.dfx-temper[data-temperament=trader]{background:#eab30829;color:#fde047}
.dfx-temper[data-temperament=turtle]{background:#22c55e29;color:#86efac}
.dfx-temper[data-temperament=nuker]{background:#a855f729;color:#d8b4fe}
.dfx-temper[data-temperament=opportunist]{background:#3b82f629;color:#93c5fd}
`;

let injected = false;
/** Adds STORE_PREVIEW_CSS to the page once. */
export function ensurePreviewStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.storePreviews = "";
  style.textContent = STORE_PREVIEW_CSS + DLC_PREVIEW_CSS; // DLC (r21)
  document.head.appendChild(style);
}
