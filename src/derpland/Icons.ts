// Derp Land's own icons: drawn for the site, 24×24, stroked in currentColor.
// Each is a whole <svg> in one template so Lit keeps the SVG namespace.

import { html, TemplateResult } from "lit";

/** A game pawn: Play. */
export function pawnIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="6.2" r="3.2" />
    <path d="M9.6 9.6c-1 .8-1.4 1.9-1 3h6.8c.4-1.1 0-2.2-1-3" />
    <path d="M9.2 12.6 7.6 19h8.8l-1.6-6.4" />
    <path d="M5.5 21h13" />
  </svg>`;
}

/** A market stall with a scalloped awning: Store. */
export function stallIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 4h15l1.5 5H3z" />
    <path
      d="M3 9c0 1.4 1 2.3 2.25 2.3S7.5 10.4 7.5 9c0 1.4 1 2.3 2.25 2.3S12 10.4 12 9c0 1.4 1 2.3 2.25 2.3S16.5 10.4 16.5 9c0 1.4 1 2.3 2.25 2.3S21 10.4 21 9"
    />
    <path d="M5 12v8h14v-8" />
    <path d="M10 20v-4.5h4V20" />
  </svg>`;
}

/** A treasure chest: Inventory. */
export function chestIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 10.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2.5" />
    <path d="M3.5 10.5h17V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
    <path d="M10.5 9h3v4h-3z" fill="currentColor" stroke-width="1.4" />
    <path d="M7.5 4.2v6.3M16.5 4.2v6.3" />
  </svg>`;
}

/** A winners' podium: Leaderboard. */
export function podiumIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 20v-9h6v9" />
    <path d="M3 20v-6h6M15 20v-4h6v4" />
    <path d="M2 20h20" />
    <path
      d="m12 3 .9 1.9 2 .3-1.5 1.4.4 2L12 7.6l-1.8 1 .4-2L9.1 5.2l2-.3z"
      fill="currentColor"
      stroke-width="1"
    />
  </svg>`;
}

export function caretIcon(cls = "dl-i-sm"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>`;
}

/** The Derp Coin: a gold coin stamped with a lopsided D. */
export function coinIcon(cls = "dl-coin"): TemplateResult {
  return html`<svg class=${cls} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12.6" r="10.4" fill="#a86b00" />
    <circle cx="12" cy="11.4" r="10.4" fill="#ffc531" />
    <circle
      cx="12"
      cy="11.4"
      r="7.6"
      fill="none"
      stroke="#e0a100"
      stroke-width="1.4"
    />
    <path
      d="M9.4 6.9h2.7c2.9 0 4.6 2 4.6 4.8 0 2.7-1.8 4.7-4.7 4.7H9.4z"
      fill="none"
      stroke="#7a4b00"
      stroke-width="2.2"
      stroke-linejoin="round"
      transform="rotate(-7 12 11.5)"
    />
  </svg>`;
}

export function peopleIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6" />
    <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.6c2 .7 3.2 2.5 3.5 5.4" />
  </svg>`;
}

export function hourglassIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M6 3h12M6 21h12" />
    <path d="M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9" />
    <path d="M16.5 3c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9" />
    <path d="M9.5 19h5" />
  </svg>`;
}

/** A sealed scroll: games that are saved between sittings. */
export function scrollIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M6 4h11a2 2 0 0 1 2 2v12" />
    <path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2z" />
    <path d="M8 7v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1H10v1a2 2 0 0 1-2 2" />
    <path d="M11 9h5M11 12h5" />
  </svg>`;
}

/** A film reel with a play mark: Watch replay. */
export function replayIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 3.5v4.2h4.2" />
    <path d="m10 8.8 5 3.2-5 3.2z" fill="currentColor" />
  </svg>`;
}

/** A crown for winners. */
export function crownIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19.2 18H4.8z" />
    <path d="M5 20.5h14" fill="none" stroke-width="2" stroke-linecap="round" />
  </svg>`;
}

export function signOutIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </svg>`;
}

export function closeIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.6"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>`;
}

/** The colors a player's token can be, picked from their name. */
export const TOKEN_COLORS = [
  "#e8553f",
  "#3b7fc4",
  "#3a9d63",
  "#e9a92b",
  "#8a5cc4",
  "#e57a2e",
  "#2a9c9a",
  "#c94f86",
] as const;

export function tokenColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.toLowerCase().charCodeAt(i)) >>> 0;
  }
  return TOKEN_COLORS[h % TOKEN_COLORS.length];
}
