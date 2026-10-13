// STORY (r17): an engraving for each kind of moment in a life's story, in
// the same hand as the ledger's tab icons (Icons.ts): drawn in the current
// ink, so a moment's tone colours it. A kind nobody drew (another system's)
// gets the plain seal.

import { html, svg, SVGTemplateResult, TemplateResult } from "lit";
import type { StoryIcon } from "../../engine/StoryCore";

const dot = (x: number, y: number, r = 0.9) =>
  svg`<circle cx=${x} cy=${y} r=${r} fill="currentColor" stroke="none" />`;

const PATHS: Record<StoryIcon, SVGTemplateResult> = {
  cradle: svg`<path d="M4 10h16v3a7 7 0 0 1-7 6h-2a7 7 0 0 1-7-6z" /><path d="M4 10c0-3 2.5-5.5 6-5.5" /><path d="M3 21c5 1.5 13 1.5 18 0" />`,
  quill: svg`<path d="M20 3c-6 1-11 6-13 13l-1.5 4.5" /><path d="M20 3c0 5-3 10-9 12" /><path d="M9 10l3 3" /><path d="M4 21h7" />`,
  tools: svg`<path d="M14 4l6 6-2 2-6-6z" /><path d="M13 7L4 16l2 2 9-9" /><path d="M3 21h8l1-2h-8z" />`,
  chevron: svg`<path d="M5 13l7-5 7 5" /><path d="M5 19l7-5 7 5" />${dot(12, 4.5, 1.3)}`,
  rings: svg`<circle cx="9" cy="14" r="5" /><circle cx="15" cy="14" r="5" /><path d="M10 6l2-2.5L14 6" />`,
  house: svg`<path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" />`,
  ship: svg`<path d="M3 16h18l-3 4H6z" /><path d="M12 3v13" /><path d="M12 4l6 9h-6" /><path d="M12 6l-5 7h5" />`,
  muskets: svg`<path d="M4 20L18 4" /><path d="M20 20L6 4" /><path d="M16 3l3 3M5 3L2 6" /><path d="M7 15l2 2M17 15l-2 2" />`,
  bandage: svg`<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-40 12 12)" />${dot(10.5, 11)}${dot(13.5, 13)}${dot(12.5, 10.2)}${dot(11.5, 13.8)}`,
  laurel: svg`<path d="M9 20C5 17 3.5 11 6.5 5" /><path d="M15 20c4-3 5.5-9 2.5-15" /><path d="M5 9.5c1.5 0 2.5 1 2.6 2.4M4.6 14c1.5-.1 2.8.8 3.2 2.3M19 9.5c-1.5 0-2.5 1-2.6 2.4M19.4 14c-1.5-.1-2.8.8-3.2 2.3" /><path d="M10 21h4" />`,
  seal: svg`<circle cx="12" cy="10" r="6" /><circle cx="12" cy="10" r="2.6" /><path d="M8.5 15L7 21l5-2.8 5 2.8-1.5-6" />`,
  banner: svg`<path d="M5 21V3" /><path d="M5 4h13l-3 4 3 4H5" />`,
  urn: svg`<path d="M8 4h8" /><path d="M9.5 4c0 2-3.5 3-3.5 7a6 6 0 0 0 12 0c0-4-3.5-5-3.5-7" /><path d="M9 20h6M10 17l-.5 3M14 17l.5 3" />`,
  key: svg`<circle cx="7.5" cy="12" r="4" /><path d="M11.5 12H21M18 12v3M21 12v2.5" />`,
  mask: svg`<path d="M3 9c3-2 6-2 9 0 3-2 6-2 9 0-1 5-4 7.5-6 6.5-1-.7-2-2-3-2s-2 1.3-3 2c-2 1-5-1.5-6-6.5z" />${dot(8, 11, 1.3)}${dot(16, 11, 1.3)}`,
  eye: svg`<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />`,
  star: svg`<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z" />`,
  irons: svg`<circle cx="7" cy="15" r="4" /><circle cx="17" cy="15" r="4" /><path d="M11 15h2" /><path d="M7 11V8a5 5 0 0 1 10 0v3" />`,
  fist: svg`<path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V10" /><path d="M10 10V6.5a1.5 1.5 0 0 1 3 0V10" /><path d="M13 10V7.5a1.5 1.5 0 0 1 3 0V11" /><path d="M16 11V9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a5 5 0 0 1-5-5v-2.5l2-2" />`,
  pistols: svg`<path d="M2.5 7.5h13l2 2" /><path d="M2.5 7.5V10h10" /><path d="M8 10l-2.2 8h4.2l2-6" /><path d="M11.5 10v2.5" /><circle cx="20" cy="7" r="1.6" /><path d="M21 4.5l1-1" />`,
  scales: svg`<path d="M12 3v17M7.5 21h9" /><path d="M5 7h14" /><path d="M5 7l-3 6a3 3 0 0 0 6 0z" /><path d="M19 7l-3 6a3 3 0 0 0 6 0z" />`,
  chain: svg`<path d="M9.5 7H7a4 4 0 0 0 0 8h2" /><path d="M14.5 9H17a4 4 0 0 1 0 8h-2" /><path d="M8 11h3M13 13h3" /><path d="M11 3.5l.8 2M13.2 18.5l.8 2" />`,
  flag: svg`<path d="M6 21V3" /><path d="M6 4l13 3.5L6 11" /><path d="M3 21h6" />${dot(10, 7.5, 1.2)}`,
  storm: svg`<circle cx="12" cy="12" r="2.4" /><path d="M12 4C7 4 4 7.5 4 11.5c0 1.8.6 3.3 1.6 4.4" /><path d="M12 20c5 0 8-3.5 8-7.5 0-1.8-.6-3.3-1.6-4.4" /><path d="M9 4.5c2 .6 3.3 2 3.8 3.6M15 19.5c-2-.6-3.3-2-3.8-3.6" />`,
  anchor: svg`<circle cx="12" cy="5" r="2" /><path d="M12 7v14" /><path d="M8 11h8" /><path d="M4 14c0 4 4 7 8 7s8-3 8-7" />`,
  coin: svg`<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5.5" /><path d="M12 9v6M10.5 10.5h3" />`,
  bales: svg`<rect x="3" y="12" width="8" height="8" rx="1" /><rect x="13" y="12" width="8" height="8" rx="1" /><rect x="8" y="3.5" width="8" height="8" rx="1" /><path d="M3 16h8M13 16h8M8 7.5h8" />`,
  ballot: svg`<rect x="4" y="11" width="16" height="9" rx="1" /><path d="M8 11V4.5h8V11" /><path d="M10 7.5h4" /><path d="M8 15h8" />`,
  scroll: svg`<path d="M6 4h11a2 2 0 0 1 0 4H8" /><path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11V8" /><circle cx="14" cy="15" r="2.4" /><path d="M13 17.2l-1 2.8M15 17.2l1 2.8" />`,
  dagger: svg`<path d="M12 2.5V15" /><path d="M10 5l2-2.5L14 5" /><path d="M7.5 15h9" /><path d="M12 15v4.5" />${dot(12, 21, 1.4)}`,
  book: svg`<path d="M4 5c3-1 5.5-1 8 1 2.5-2 5-2 8-1v14c-3-1-5.5-1-8 1-2.5-2-5-2-8-1z" /><path d="M12 6v14" /><path d="M7 9h2.5M14.5 9H17" />`,
  dice: svg`<rect x="3" y="9.5" width="9.5" height="9.5" rx="2" /><rect x="12" y="4" width="9" height="9" rx="2" transform="rotate(14 16.5 8.5)" />${dot(6, 12.5)}${dot(9.5, 16)}${dot(7.8, 14.3)}${dot(15, 6.8)}${dot(18, 10)}`,
  medal: svg`<circle cx="12" cy="15" r="5.5" /><path d="M8 3l4 6.5L16 3" /><path d="M12 12.5v5M9.5 15h5" />`,
  pick: svg`<path d="M4.5 8.5c3.5-4.5 10-5.5 15-2.5" /><path d="M13 6.5L6 21" />${dot(17, 18, 1.8)}`,
  wreath: svg`<circle cx="12" cy="11" r="6.5" /><path d="M12 4.5c-1.2 1.8-1.2 3 0 4.2M5.5 11c1.8-1.2 3-1.2 4.2 0M12 17.5c1.2-1.8 1.2-3 0-4.2M18.5 11c-1.8 1.2-3 1.2-4.2 0" /><path d="M9.5 17.5L8 21.5M14.5 17.5l1.5 4" />`,
  tower: svg`<path d="M6 21V9h12v12" /><path d="M5 9V4.5h3v2h2v-2h4v2h2v-2h3V9" /><path d="M10 21v-4h4v4" />`,
};

/** The engraving for a kind of moment (the plain seal for one nobody drew). */
export function storyIcon(icon: StoryIcon | string, cls = ""): TemplateResult {
  const body = PATHS[icon as StoryIcon] ?? PATHS.seal;
  return html`<svg
    class="cq-icon cq-story-icon ${cls}"
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
}
