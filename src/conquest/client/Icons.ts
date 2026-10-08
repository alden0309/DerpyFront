// Small engraved-looking icons for Derpy Conquest's ledger tabs and banner.
// Drawn with the current text colour so they follow the nation's ink.

import { html, svg, SVGTemplateResult, TemplateResult } from "lit";

const icon = (body: SVGTemplateResult): TemplateResult =>
  html`<svg
    class="cq-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${body}
  </svg>`;

/** A quill: the governor's court and pen. */
export const QuillIcon = () =>
  icon(
    svg`<path d="M20 3c-6 1-11 6-13 13l-1.5 4.5" /><path d="M20 3c0 5-3 10-9 12" /><path d="M9 10l3 3" /><path d="M4 21h7" />`,
  );

/** A crown. */
export const CrownIcon = () =>
  icon(
    svg`<path d="M3 8l4 4 5-7 5 7 4-4-2 10H5z" /><path d="M5 21h14" /><circle cx="12" cy="5" r=".6" fill="currentColor" />`,
  );

/** An open ledger with a coin. */
export const LedgerIcon = () =>
  icon(
    svg`<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z" /><path d="M12 6v13" /><path d="M6 9h3M6 12h3M15 9h3M15 12h3" />`,
  );

/** Three heads. */
export const PeopleIcon = () =>
  icon(
    svg`<circle cx="12" cy="7" r="3" /><path d="M6 20c0-4 3-6 6-6s6 2 6 6" /><circle cx="5" cy="9" r="2" /><circle cx="19" cy="9" r="2" /><path d="M2 18c0-2 1-4 3-4M22 18c0-2-1-4-3-4" />`,
  );

/** Crossed muskets. */
export const ArmyIcon = () =>
  icon(
    svg`<path d="M4 20L18 4" /><path d="M20 20L6 4" /><path d="M16 3l3 3M5 3L2 6" /><path d="M7 15l2 2M17 15l-2 2" />`,
  );

/** A sealed scroll. */
export const ScrollIcon = () =>
  icon(
    svg`<path d="M6 4h11a2 2 0 0 1 0 4H8" /><path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11V8" /><circle cx="14" cy="15" r="2.4" /><path d="M13 17.2l-1 2.8M15 17.2l1 2.8" />`,
  );

/** A folded letter with a wax seal. */
export const LetterIcon = () =>
  icon(
    svg`<rect x="3" y="6" width="18" height="13" rx="1" /><path d="M3 7l9 6 9-6" /><circle cx="12" cy="14" r="2.2" fill="currentColor" stroke="none" />`,
  );

// ---------------------------------------------------------------- a life's tabs and places

/** A hat on a peg: where you are. */
export const HereIcon = () =>
  icon(
    svg`<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" />`,
  );

/** A head and shoulders in an oval: you. */
export const SelfIcon = () =>
  icon(
    svg`<ellipse cx="12" cy="12" rx="8" ry="10" /><circle cx="12" cy="9" r="3" /><path d="M6.5 18c1-3 3-4 5.5-4s4.5 1 5.5 4" />`,
  );

/** A sword crossed with a quill: work, office and causes. */
export const AffairsIcon = () =>
  icon(
    svg`<path d="M5 19L17 5" /><path d="M15 5h2v2" /><path d="M6 15l3 3" /><path d="M19 19C14 17 9 13 7 6" /><path d="M7 6c3 0 6 1 8 4" />`,
  );

/** A bound journal. */
export const JournalIcon = () =>
  icon(
    svg`<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M8 3v18" /><path d="M11 8h5M11 11h5" />`,
  );

/** A globe on a stand: the world. */
export const WorldIcon = () =>
  icon(
    svg`<circle cx="12" cy="10" r="7" /><path d="M5 10h14M12 3c2.5 2.5 2.5 11.5 0 14M12 3c-2.5 2.5-2.5 11.5 0 14" /><path d="M8 21h8M12 17v4" />`,
  );

const PLACE_PATHS: Record<string, SVGTemplateResult> = {
  tavern: svg`<path d="M6 7h9v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M15 10h2a2 2 0 0 1 0 4h-2" /><path d="M6 7c0-2 2-3 4-2 1-2 4-2 5 0" />`,
  market: svg`<path d="M12 4v16M6 20h12" /><path d="M5 8h14" /><path d="M5 8l-2 6h4zM19 8l-2 6h4z" />`,
  church: svg`<path d="M12 2v5M10 4h4" /><path d="M7 21V11l5-4 5 4v10z" /><path d="M10.5 21v-4a1.5 1.5 0 0 1 3 0v4" />`,
  councilfire: svg`<path d="M12 4c2 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-2-1-4 0-6z" /><path d="M5 21l14-4M19 21L5 17" />`,
  docks: svg`<path d="M12 3v15" /><circle cx="12" cy="5" r="2" /><path d="M8 9h8" /><path d="M5 14c0 4 3 6 7 6s7-2 7-6" />`,
  fort: svg`<path d="M4 21V9h3v3h2V9h6v3h2V9h3v12z" /><path d="M10 21v-4h4v4" /><path d="M12 9V3l4 2-4 2" />`,
  workshop: svg`<path d="M4 20l8-8" /><path d="M10 6l8 8 2-2-8-8z" /><path d="M3 21l3-1-2-2z" />`,
  press: svg`<path d="M5 4h14v4H5z" /><path d="M12 8v5" /><path d="M7 13h10v3H7z" /><path d="M5 20h14" />`,
  fields: svg`<path d="M12 21V8" /><path d="M12 8c-3 0-4-2-4-4 2 0 4 1 4 4zM12 8c3 0 4-2 4-4-2 0-4 1-4 4zM12 13c-3 0-4-2-4-4 2 0 4 1 4 4zM12 13c3 0 4-2 4-4-2 0-4 1-4 4z" /><path d="M4 21h16" />`,
  governor: svg`<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10" /><path d="M2 10l10-6 10 6z" />`,
  village: svg`<path d="M3 20c0-6 4-10 9-10s9 4 9 10z" /><path d="M12 10V4M10 6l2-2 2 2" /><path d="M10 20v-4h4v4" />`,
  woods: svg`<path d="M8 21v-4M8 17L3 17l5-7-3 0 3-6 3 6-3 0 5 7z" /><path d="M16 21v-3M16 18h-4l4-6-2 0 2-4 2 4-2 0 4 6z" />`,
  apothecary: svg`<path d="M9 3h6M10 3v5l-4 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-9V3" /><path d="M8 14h8" />`,
};

export const placeIcon = (kind: string) =>
  icon(PLACE_PATHS[kind] ?? svg`<circle cx="12" cy="12" r="6" />`);
