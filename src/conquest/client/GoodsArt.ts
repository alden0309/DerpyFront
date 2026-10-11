// WORLD r11: little engraved pictures for the goods and the wares, tinted
// with each one's own colour: a wheat sheaf, a beaver pelt, a sugarloaf, a
// cask of brandy, a belt of wampum, a birchbark canoe...

import { html, svg, SVGTemplateResult, TemplateResult } from "lit";
import type { TradeItem } from "../engine/Types";
import { isWare, WARES } from "../engine/Wares";
import { GOOD_COLORS, GOOD_NAMES } from "./Text";

const INK = "#3a2a1a";

const ART: Record<TradeItem, (c: string) => SVGTemplateResult> = {
  grain: (c) =>
    svg`<path d="M12 21V8" stroke=${INK}/><path d="M12 8c-2-1-3-3-3-5 2 1 3 3 3 5zM12 8c2-1 3-3 3-5-2 1-3 3-3 5zM12 12c-2-1-4-2-4-5 2 1 4 2 4 5zM12 12c2-1 4-2 4-5-2 1-4 2-4 5zM12 16c-2-1-4-2-4-5 2 1 4 2 4 5zM12 16c2-1 4-2 4-5-2 1-4 2-4 5z" fill=${c}/>`,
  fish: (c) =>
    svg`<path d="M3 12c3-4 8-5 13-2l4-3v10l-4-3c-5 3-10 2-13-2z" fill=${c}/><circle cx="7" cy="11" r=".9" fill=${INK}/>`,
  furs: (c) =>
    svg`<path d="M8 3h8l1 3 3 2-2 3 1 6-4 4h-6l-4-4 1-6-2-3 3-2z" fill=${c}/><path d="M12 7v11" stroke="rgba(0,0,0,.25)"/>`,
  tobacco: (c) =>
    svg`<path d="M12 21C6 16 5 9 12 3c7 6 6 13 0 18z" fill=${c}/><path d="M12 21V6M12 10l-3-2M12 14l3-2M12 17l-3-2" stroke="rgba(0,0,0,.35)"/>`,
  sugar: (c) =>
    svg`<path d="M12 3l6 16H6z" fill=${c}/><path d="M5 19h14v2H5z" fill="#3e6aa0"/>`,
  timber: (c) =>
    svg`<rect x="3" y="7" width="15" height="4" rx="2" fill=${c}/><rect x="6" y="12" width="15" height="4" rx="2" fill=${c}/><circle cx="18" cy="9" r="1.6" fill="#c9a66b"/><circle cx="21" cy="14" r="1.6" fill="#c9a66b"/>`,
  silver: (c) =>
    svg`<path d="M4 15l3-6h10l3 6z" fill=${c}/><path d="M7 9l2 6M17 9l-2 6" stroke="rgba(255,255,255,.6)"/>`,
  tools: (c) =>
    svg`<path d="M5 20l9-9" stroke="#8a6a3e" stroke-width="2.2"/><path d="M12 6l4-3 5 5-3 4z" fill=${c}/><path d="M19 20l-8-8" stroke="#8a6a3e" stroke-width="2"/>`,
  guns: (c) =>
    svg`<path d="M2 15l14-7 1 2-6 4 1 2-3 2-2-2-4 2z" fill="#7a5532"/><path d="M10 11l12-6" stroke=${c} stroke-width="2"/>`,
  cloth: (c) =>
    svg`<rect x="4" y="6" width="13" height="12" rx="2" fill=${c}/><path d="M17 8c3 0 3 8 0 8" fill="none" stroke=${INK}/><path d="M4 10h13M4 14h13" stroke="rgba(255,255,255,.35)"/>`,
  woollens: (c) =>
    svg`<path d="M3 7h18v11H3z" fill=${c}/><path d="M3 9h18M3 16h18" stroke="#e8dcc0" stroke-width="1.4"/><path d="M5 18v2M8 18v2M11 18v2M14 18v2M17 18v2" stroke=${INK}/>`,
  brandy: (c) =>
    svg`<path d="M6 4h12c2 5 2 11 0 16H6C4 15 4 9 6 4z" fill=${c}/><path d="M5 9h14M5 15h14" stroke=${INK}/>`,
  wine: (c) =>
    svg`<path d="M8 21h5V10l-1-3V3h-3v4l-1 3z" fill=${c}/><path d="M15 9h5c0 4-1 5-2.5 5S15 13 15 9zM17.5 14v6M15.5 21h4" fill="#e9e1cf"/>`,
  cochineal: (c) =>
    svg`<ellipse cx="12" cy="13" rx="6" ry="5" fill=${c}/><path d="M7 10l-3-2M17 10l3-2M7 15l-3 2M17 15l3 2M12 8V5" stroke=${INK}/>`,
  chocolate: (c) =>
    svg`<path d="M12 3c5 3 6 13 0 18-6-5-5-15 0-18z" fill=${c}/><path d="M12 3v18M9 6c1 4 1 8 0 12M15 6c-1 4-1 8 0 12" stroke="rgba(255,255,255,.3)"/>`,
  finecloth: (c) =>
    svg`<rect x="4" y="6" width="13" height="12" rx="2" fill=${c}/><path d="M6 6v12M9 6v12M12 6v12M15 6v12" stroke="rgba(255,255,255,.3)"/><path d="M17 8c3 0 3 8 0 8" fill="none" stroke=${INK}/>`,
  spices: (c) =>
    svg`<path d="M7 8c0-3 10-3 10 0l2 12H5z" fill=${c}/><path d="M8 8h8" stroke=${INK}/><circle cx="10" cy="14" r="1" fill=${INK}/><circle cx="14" cy="16" r="1" fill=${INK}/>`,
  gin: (c) =>
    svg`<path d="M7 7h10v14H7z" fill=${c}/><path d="M10 3h4v4h-4z" fill="#8a7a5a"/><path d="M9 12h6v4H9z" fill="#efe6cf"/>`,
  brazilwood: (c) =>
    svg`<rect x="3" y="8" width="17" height="7" rx="3.5" fill="#8a6a46"/><ellipse cx="19" cy="11.5" rx="2.5" ry="3.5" fill=${c}/>`,
  iron: (c) =>
    svg`<path d="M5 10h14c0 6-3 9-7 9s-7-3-7-9z" fill=${c}/><path d="M6 10c0-4 12-4 12 0" fill="none" stroke=${INK} stroke-width="1.4"/>`,
  wampum: (c) =>
    svg`<rect x="3" y="8" width="18" height="8" rx="1" fill="#efe8da"/><path d="M5 8v8M8 8v8M11 8v8M14 8v8M17 8v8" stroke=${c} stroke-width="1.6"/><path d="M3 12h18" stroke=${c}/>`,
  maize: (c) =>
    svg`<path d="M12 3c3 2 4 9 0 16-4-7-3-14 0-16z" fill=${c}/><path d="M12 19c-3-1-6-4-6-9 3 2 5 5 6 9zM12 19c3-1 6-4 6-9-3 2-5 5-6 9z" fill="#8aa04a"/>`,
  deerskins: (c) =>
    svg`<path d="M6 4l3 2h6l3-2 1 5-2 3 1 7-3 2h-6l-3-2 1-7-2-3z" fill=${c}/>`,
  canoes: (c) =>
    svg`<path d="M2 12c3 4 17 4 20 0-2 1-18 1-20 0z" fill=${c}/><path d="M3 11l1-3M21 11l-1-3" stroke=${INK} stroke-width="1.4"/><path d="M5 13h14" stroke="rgba(0,0,0,.3)"/>`,
  pottery: (c) =>
    svg`<path d="M9 4h6l-1 3c4 2 5 6 3 10l-2 3H9l-2-3c-2-4-1-8 3-10z" fill=${c}/><path d="M8 11h8M8 14h8" stroke="#efe6cf"/>`,
  robes: (c) =>
    svg`<path d="M4 6l4-2h8l4 2-1 7 1 6H4l1-6z" fill=${c}/><circle cx="12" cy="12" r="3" fill="none" stroke="#e7c97a" stroke-width="1.4"/>`,
};

/** An item's colour. */
export function itemColor(item: TradeItem): string {
  return isWare(item) ? WARES[item].color : GOOD_COLORS[item];
}

/** An item's name. */
export function itemName(item: TradeItem): string {
  return isWare(item) ? WARES[item].name : GOOD_NAMES[item];
}

/** A small picture of a good or ware, inline with text. */
export function itemIcon(item: TradeItem, cls = ""): TemplateResult {
  return html`<svg
    class="cq-good-icon ${cls}"
    viewBox="0 0 24 24"
    stroke-width="1"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${ART[item](itemColor(item))}
  </svg>`;
}
