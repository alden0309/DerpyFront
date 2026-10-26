// PROFILE (r26): each badge's emblem: a small shield in its tier's metal
// (bronze, silver, gold) with the badge's picture stamped in it, drawn for
// Derp Land in the same hand as its icons. Inline SVG, so it shows in the
// top bar's shadow root as well as on the pages. An unearned one is the
// same emblem, dimmed by the page's CSS.

import {
  html,
  nothing,
  svg,
  type SVGTemplateResult,
  TemplateResult,
} from "lit";
import { BADGE_BY_KEY, type BadgeGlyph, type BadgeTier } from "./Badges";

const METAL: Record<
  BadgeTier,
  { base: string; light: string; dark: string; ink: string }
> = {
  bronze: {
    base: "#c98450",
    light: "#e9b082",
    dark: "#7a4520",
    ink: "#3a1e0a",
  },
  silver: {
    base: "#b9c1cd",
    light: "#eef1f5",
    dark: "#68717f",
    ink: "#232831",
  },
  gold: { base: "#e7b84a", light: "#ffe28e", dark: "#9a6a12", ink: "#3a2606" },
};

/** Each glyph, on a 24×24 grid: lines in the ink, `f` parts filled with it. */
const GLYPHS: Record<BadgeGlyph, SVGTemplateResult> = {
  crown: svg`<path class="f" d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19.2 18H4.8z"/><path d="M5 20.5h14"/>`,
  crowns: svg`<path class="f" d="M1.8 12.5 4.6 14.6 7.4 10.4l2.8 4.2 2.8-2.1-1.1 5.5H3z"/><path class="f" d="M11 7.5l2.8 2.1 2.8-4.2 2.8 4.2 2.8-2.1-1.1 5.5h-8z"/><path d="M3 20.5h8M12.6 15.4h7.6"/>`,
  helmet: svg`<path d="M5 20v-7.5a7 7 0 0 1 14 0V20h-4.5v-5.5h-5V20z"/><path d="M12 5.5V3.2c3.4-.6 6 .6 7.6 2.6"/><path d="M5.6 11.4h12.8"/>`,
  flag: svg`<path d="M6 21V3.5"/><path class="f" d="M6 4.5h12l-2.6 4 2.6 4H6z"/>`,
  shield: svg`<path d="M12 3l7.5 3v6c0 4.6-3.1 7.6-7.5 9-4.4-1.4-7.5-4.4-7.5-9V6z"/><path d="M12 3v18M4.8 11h14.4"/>`,
  swords: svg`<path d="M4 4l11 11M20 4 9 15"/><path d="M13.6 18.2 18.2 13.6M10.4 18.2 5.8 13.6"/><path d="M16.8 16.8 20 20M7.2 16.8 4 20"/>`,
  chess: svg`<path class="f" d="M8 19.2c0-2.6 2.6-3.6 3.4-6l-3.2 1.2-1.6-2.4 2.6-3.4.6-2.6c2.8 0 6.4 1.6 6.8 6.4.2 2.8-.8 4.8-.8 6.8z"/><path d="M6 21h12"/>`,
  star: svg`<path class="f" d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9z"/>`,
  map: svg`<path d="M3 6.2l6-2.2 6 2.2 6-2.2v13.6l-6 2.2-6-2.2-6 2.2z"/><path d="M9 4v13.6M15 6.2v13.6"/><path class="f" d="M5.2 10.2l2 2.2M7.2 10.2l-2 2.2" /><circle class="f" cx="18" cy="9.6" r="1.4"/>`,
  coins: svg`<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 10v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/><path d="M5 14v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/>`,
  nuke: svg`<path class="f" d="M6.6 13a3.4 3.4 0 0 1 .4-6.6 5 5 0 0 1 10 0 3.4 3.4 0 0 1 .4 6.6z"/><path d="M10 13v5h4v-5"/><path d="M5 20.6h14"/>`,
  skull: svg`<path d="M12 3a7.6 7.6 0 0 0-7.6 7.6c0 3 1.5 4.6 3.1 5.5V19.6h9v-3.5c1.6-.9 3.1-2.5 3.1-5.5A7.6 7.6 0 0 0 12 3z"/><circle class="f" cx="9" cy="11" r="1.9"/><circle class="f" cx="15" cy="11" r="1.9"/><path d="M10.4 19.6v-2.4M13.6 19.6v-2.4"/>`,
  people: svg`<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.6c2 .7 3.2 2.5 3.5 5.4"/>`,
  scroll: svg`<path d="M6 4h11a2 2 0 0 1 2 2v12"/><path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2z"/><path d="M8 7v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1H10v1a2 2 0 0 1-2 2"/><path d="M11 9h5M11 12h5"/>`,
  hourglass: svg`<path d="M6 3h12M6 21h12"/><path d="M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9"/><path d="M16.5 3c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9"/><path class="f" d="M9.4 19.4 12 16.8l2.6 2.6z"/>`,
  globe: svg`<circle cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="12" rx="3.8" ry="8.6"/><path d="M3.6 12h16.8M5 7.4h14M5 16.6h14"/>`,
  target: svg`<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4.4"/><circle class="f" cx="11" cy="13" r="1.4"/><path d="M11 13 20 4M17 3.6l3 .4.4 3"/>`,
  calendar: svg`<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.4 15l2.4 2.4 4.8-4.8"/>`,
  calendars: svg`<rect x="2.5" y="7" width="12" height="12" rx="1.6"/><path d="M2.5 11h12M6 5.4v3M11 5.4v3"/><rect class="f" x="10" y="3" width="11.5" height="11.5" rx="1.6"/><path d="M5.4 15.4l1.6 1.6 3.4-3.4"/>`,
  streak: svg`<path class="f" d="M12 2.6c.6 3.8 6.2 6 6.2 11.2a6.2 6.2 0 0 1-12.4 0c0-3 1.8-4.4 2.2-7 1.8 1.2 2.6 3 2.8 4.2 1.2-2.6 1.6-5.4 1.2-8.4z"/>`,
  candle: svg`<path d="M8.6 11h6.8v9.6H8.6z"/><path class="f" d="M12 3.4c1.8 2.2 2.2 3.6 0 5.6-2.2-2-1.8-3.4 0-5.6z"/><path d="M12 9v2M5.6 20.6h12.8"/>`,
  tree: svg`<circle class="f" cx="12" cy="4.6" r="2.2"/><circle class="f" cx="5.6" cy="12" r="2.2"/><circle class="f" cx="18.4" cy="12" r="2.2"/><circle class="f" cx="12" cy="19.4" r="2.2"/><path d="M12 6.8v2.6M5.6 9.4h12.8M5.6 9.4v.4M18.4 9.4v.4M18.4 14.2v2.6H12v.4"/>`,
  oak: svg`<path class="f" d="M12 3.4a4.4 4.4 0 0 1 4.2 3 4 4 0 0 1 2.2 7.2 3.6 3.6 0 0 1-4.4 3.6h-4a3.6 3.6 0 0 1-4.4-3.6 4 4 0 0 1 2.2-7.2 4.4 4.4 0 0 1 4.2-3z"/><path d="M12 17v4.4M8.6 21.4h6.8M12 18.6l-2.4-2M12 18l2.4-2"/>`,
  medal: svg`<path d="M8 3l4 7 4-7"/><circle class="f" cx="12" cy="15.2" r="5.6"/>`,
  medals: svg`<circle class="f" cx="5.6" cy="14.4" r="3.4"/><circle class="f" cx="12" cy="16.4" r="3.4"/><circle class="f" cx="18.4" cy="14.4" r="3.4"/><path d="M4 4.4l1.6 6.6M7.2 4.4 5.6 11M10.4 6.4 12 13M13.6 6.4 12 13M16.8 4.4l1.6 6.6M20 4.4 18.4 11"/>`,
  axe: svg`<path d="M5 21 15.6 8.4"/><path class="f" d="M12.6 5.2c2.6-2.2 6.6-1.2 7.6 2.2l-4.2 3.2c-1.4-1.6-2.8-3-3.4-5.4z"/>`,
  cabin: svg`<path d="M3.5 11.4 12 4l8.5 7.4"/><path d="M5 10.2V20h14v-9.8"/><path d="M5 13.4h4.6M14.4 13.4H19M5 16.6h4.6M14.4 16.6H19"/><path class="f" d="M10 20v-6h4v6z"/>`,
  steeple: svg`<path d="M12 2v4.6M10 4.2h4"/><path d="M7.6 21V11.4L12 7l4.4 4.4V21"/><path d="M4.4 21h15.2"/><path class="f" d="M10.4 21v-4a1.6 1.6 0 0 1 3.2 0v4z"/>`,
  heart: svg`<path class="f" d="M12 20.4s-8-4.8-8-10.4a4.4 4.4 0 0 1 8-2.6 4.4 4.4 0 0 1 8 2.6c0 5.6-8 10.4-8 10.4z"/>`,
  partyflag: svg`<path d="M2.6 5.6Q12 10 21.4 5.6"/><path class="f" d="M5 6.8l1.6 6 2.6-5.2zM11 8.4l1 6.2 2.8-6.2zM17 7.4l2.4 5.6 1-6.8z"/>`,
  dice: svg`<rect x="2.6" y="8" width="10.4" height="10.4" rx="2"/><rect x="11.6" y="4" width="9.8" height="9.8" rx="2" transform="rotate(12 16.5 9)"/><circle class="f" cx="5.6" cy="11" r="1"/><circle class="f" cx="10" cy="15.4" r="1"/><circle class="f" cx="7.8" cy="13.2" r="1"/><circle class="f" cx="16.4" cy="9" r="1"/>`,
  megaphone: svg`<path d="M3.5 10.2v3.6a1 1 0 0 0 1 1h2.6L15 19V5L7.1 9.2H4.5a1 1 0 0 0-1 1z"/><path d="M7.4 14.8 8.8 20h2.4l-1-4.2"/><path d="M18.4 9.2a4 4 0 0 1 0 5.6"/>`,
  stall: svg`<path d="M4.5 4h15l1.5 5H3z"/><path d="M3 9c0 1.4 1 2.3 2.25 2.3S7.5 10.4 7.5 9c0 1.4 1 2.3 2.25 2.3S12 10.4 12 9c0 1.4 1 2.3 2.25 2.3S16.5 10.4 16.5 9c0 1.4 1 2.3 2.25 2.3S21 10.4 21 9"/><path d="M5 12v8h14v-8"/><path d="M10 20v-4.5h4V20"/>`,
  twin: svg`<circle cx="7.4" cy="6.6" r="2.6"/><path d="M5.4 9.6 4 18h6.8l-1.4-8.4"/><circle class="f" cx="16.6" cy="6.6" r="2.6"/><path class="f" d="M14.6 9.6 13.2 18H20l-1.4-8.4z"/><path d="M2.6 20.4h18.8"/>`,
  cake: svg`<path d="M4 20.6V13a1.6 1.6 0 0 1 1.6-1.6h12.8A1.6 1.6 0 0 1 20 13v7.6"/><path d="M4 15.4c2 1.6 3.4 1.6 5.4 0 2 1.6 3.4 1.6 5.4 0 2 1.6 3.4 1.6 5.2 0"/><path d="M2.6 20.6h18.8M12 11.4V8"/><path class="f" d="M12 3.4c1.2 1.4 1.4 2.4 0 3.6-1.4-1.2-1.2-2.2 0-3.6z"/>`,
};

/** The shield every emblem is stamped on. */
const SHIELD =
  "M16 1.8 28.2 6.4V15.6C28.2 23 22.6 28 16 30.2 9.4 28 3.8 23 3.8 15.6V6.4Z";
const SHIELD_LEFT = "M16 1.8 3.8 6.4V15.6C3.8 23 9.4 28 16 30.2Z";
const SHIELD_IN =
  "M16 4.4 25.8 8.1V15.6C25.8 21.6 21.4 25.8 16 27.6 10.6 25.8 6.2 21.6 6.2 15.6V8.1Z";

/** A badge's emblem (an unknown key draws nothing). */
export function badgeEmblem(
  key: string,
  cls = "dl-badge-art",
): TemplateResult | typeof nothing {
  const def = BADGE_BY_KEY.get(key);
  if (!def) return nothing;
  const m = METAL[def.tier];
  return html`<svg
    class=${cls}
    viewBox="0 0 32 32"
    aria-hidden="true"
    data-tier=${def.tier}
  >
    <path d=${SHIELD} fill=${m.base} />
    <path d=${SHIELD_LEFT} fill=${m.light} opacity=".55" />
    <path
      d=${SHIELD_IN}
      fill="none"
      stroke=${m.dark}
      stroke-width="1"
      opacity=".8"
    />
    <path
      d=${SHIELD}
      fill="none"
      stroke=${m.ink}
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <g
      transform="translate(8.6 7.4) scale(.616)"
      fill="none"
      stroke=${m.ink}
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="--ink:${m.ink}"
    >
      ${GLYPHS[def.glyph]}
    </g>
  </svg>`;
}

/** Every glyph a badge can use has a drawing (for the tests). */
export const DRAWN_GLYPHS: ReadonlySet<string> = new Set(Object.keys(GLYPHS));
