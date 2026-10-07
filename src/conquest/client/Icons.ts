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
