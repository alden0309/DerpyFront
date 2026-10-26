// ADMIN (r26): the admin page's few icons of its own (the rest are Derp
// Land's, src/derpland/Icons.ts), drawn in the same 24-unit stroke style.

import { html, svg, TemplateResult } from "lit";

const icon = (body: TemplateResult, cls = "dl-i") =>
  html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${body}
  </svg>`;

export const gaugeIcon = (cls?: string) =>
  icon(
    svg`<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.2"/>`,
    cls,
  );
export const userIcon = (cls?: string) =>
  icon(
    svg`<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>`,
    cls,
  );
export const shieldIcon = (cls?: string) =>
  icon(
    svg`<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>`,
    cls,
  );
export const gamesIcon = (cls?: string) =>
  icon(
    svg`<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="17.5" cy="13.5" r=".9"/>`,
    cls,
  );
export const coinsIcon = (cls?: string) =>
  icon(
    svg`<ellipse cx="9" cy="7" rx="6" ry="2.6"/><path d="M3 7v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7"/><path d="M9 16.4c-3.3 0-6-1.2-6-2.6"/><ellipse cx="15" cy="15" rx="6" ry="2.6"/><path d="M9 15v3c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-3"/>`,
    cls,
  );
export const calendarIcon = (cls?: string) =>
  icon(
    svg`<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M9.5 15l2 2 3.5-3.5"/>`,
    cls,
  );
export const flagBannerIcon = (cls?: string) =>
  icon(svg`<path d="M5 21V4"/><path d="M5 5h12l-2.5 4L17 13H5"/>`, cls);
export const listIcon = (cls?: string) =>
  icon(
    svg`<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>`,
    cls,
  );
export const newsIcon = (cls?: string) =>
  icon(
    svg`<path d="M4 9v6h3l6 4V5L7 9z"/><path d="M17 9a4 4 0 0 1 0 6"/>`,
    cls,
  );
