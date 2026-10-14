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
  style.textContent = STORE_PREVIEW_CSS;
  document.head.appendChild(style);
}
