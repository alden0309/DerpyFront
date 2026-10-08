// An engraved little sign for each building, and what it turns out, so the
// buildings list reads at a glance: a wheat sheaf for farms, a pelt for the
// trading post, a pick for the mine.

import { html, svg, SVGTemplateResult, TemplateResult } from "lit";
import type { BuildingKind, Good } from "../engine/Types";

const draw = (body: SVGTemplateResult, cls = ""): TemplateResult =>
  html`<svg
    class="cq-bicon ${cls}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${body}
  </svg>`;

const ICONS: Record<BuildingKind, SVGTemplateResult> = {
  farm: svg`<path d="M12 21V8" /><path d="M12 9c-2-1-3-3-3-5 2 1 3 3 3 5zM12 9c2-1 3-3 3-5-2 1-3 3-3 5z" /><path d="M12 13c-2-1-3.5-3-3.5-5 2 1 3.5 3 3.5 5zM12 13c2-1 3.5-3 3.5-5-2 1-3.5 3-3.5 5z" /><path d="M12 17c-2-1-3.5-3-3.5-5 2 1 3.5 3 3.5 5zM12 17c2-1 3.5-3 3.5-5-2 1-3.5 3-3.5 5z" />`,
  plantation: svg`<path d="M12 21c0-6 0-10 0-14" /><path d="M12 14c-5 0-8-3-8-7 5 0 8 3 8 7zM12 10c4 0 7-2.5 7-6-4 0-7 2.5-7 6z" />`,
  tradingpost: svg`<path d="M6 4c2 1 10 1 12 0 0 4 2 7 2 10s-3 6-8 6-8-3-8-6 2-6 2-10z" /><path d="M9 9h6M9 13h6" />`,
  mine: svg`<path d="M4 20l9-9" /><path d="M10 5c4-2 8-1 10 1-3 0-6 1-8 3" /><path d="M10 5c-1 2-1 4 1 6" />`,
  lumbercamp: svg`<path d="M5 20l10-10" /><path d="M13 4l7 7-3 1-5-5z" /><path d="M4 21h4" />`,
  port: svg`<circle cx="12" cy="5" r="2" /><path d="M12 7v14M8 10h8" /><path d="M5 15c0 3 3 6 7 6s7-3 7-6" />`,
  fort: svg`<path d="M4 21V8h3v3h3V8h4v3h3V8h3v13z" /><path d="M10 21v-5h4v5" />`,
  smithy: svg`<path d="M4 10h12l-2 4H6z" /><path d="M8 14v3h6v-3M6 21h10" /><path d="M16 10l4-4" />`,
  gunsmith: svg`<path d="M3 15l13-6 5-1-1 3-12 7z" /><path d="M8 16l1 4 3-1-1-4" />`,
  weaver: svg`<path d="M12 3v18" /><ellipse cx="12" cy="12" rx="5" ry="3" /><path d="M7 8c3 1 7 1 10 0M7 16c3-1 7-1 10 0" />`,
  church: svg`<path d="M12 2v5M10 4h4" /><path d="M7 21V11l5-4 5 4v10z" /><path d="M10 21v-5h4v5" />`,
  courthouse: svg`<path d="M12 3v17M5 20h14" /><path d="M5 7h14" /><path d="M5 7l-2 6h4zM19 7l-2 6h4z" />`,
};

export function buildingIcon(kind: BuildingKind, cls = ""): TemplateResult {
  return draw(ICONS[kind], cls);
}

/** What a building turns out (or what it's for), in a few words. */
export const BUILDING_MAKES: Record<
  BuildingKind,
  { good?: Good; text: string }
> = {
  farm: { good: "grain", text: "food" },
  plantation: { text: "tobacco or sugar" },
  tradingpost: { good: "furs", text: "furs" },
  mine: { good: "silver", text: "silver" },
  lumbercamp: { good: "timber", text: "timber" },
  port: { text: "shipping" },
  fort: { text: "defence" },
  smithy: { good: "tools", text: "tools" },
  gunsmith: { good: "guns", text: "guns" },
  weaver: { good: "cloth", text: "cloth" },
  church: { text: "calm" },
  courthouse: { text: "governing" },
};
