// MAP (r12): the season beside the date in the top banner: its sign and
// name (the hurricane's whirl in its season), and, pointed at or tapped,
// what it brings where you are: the roads, the rivers and the harbour,
// sickness, the harvest and the price of bread.

import { html, TemplateResult } from "lit";
import { AMERICAS, worldOf } from "../../engine/Map";
import { seasonLabel, seasonNotes } from "../../engine/Seasons";
import type { GameState, Life } from "../../engine/Types";
import { seasonIcon } from "../SeasonArt";
import { num } from "../Tip";

const world = worldOf(AMERICAS);

/** Where the season is reckoned for you: where you are (or your nation's seat, or the middle colonies). */
function placeOf(s: GameState, life: Life | null): number {
  if (life && !life.watching && life.c >= 0) return life.prov;
  const n = life ? s.nations.find((x) => x.key === life.origin) : undefined;
  if (n && n.capital >= 0) return n.capital;
  return Math.max(
    0,
    AMERICAS.provinces.findIndex((p) => p.id === "jamestown"),
  );
}

export function seasonChip(s: GameState, life: Life | null): TemplateResult {
  const p = placeOf(s, life);
  const def = AMERICAS.provinces[p];
  const label = seasonLabel(def, s.day);
  return html`<span class="cq-season-wrap"
    >${num(
      html`${seasonIcon(label.icon)}<span class="cq-season-name"
          >${label.name}</span
        >`,
      () => ({
        title: `${label.name}${label.note ? `: ${label.note}` : ""}, at ${def.name}`,
        notes: seasonNotes(def, s.day, world.tropical[p]),
      }),
      `cq-season ${label.icon}`,
    )}</span
  >`;
}
