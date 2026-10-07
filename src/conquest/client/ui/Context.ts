// What every in-game panel can see and do, and the small pieces they share:
// character tokens, links, bars and section headings.

import { html, nothing, TemplateResult } from "lit";
import type { World } from "../../engine/Map";
import { ageOf, charName } from "../../engine/Queries";
import type {
  Breakdown,
  Character,
  Command,
  GameState,
  MapDef,
  Nation,
  PeaceTerms,
} from "../../engine/Types";
import { flagFor } from "../Flags";
import { nationName } from "../Text";
import { num, plain, TipContent } from "../Tip";

export type DrawerView =
  | { k: "tab"; tab: Tab }
  | { k: "prov"; p: number }
  | { k: "army"; id: number }
  | { k: "nation"; n: number }
  | { k: "char"; c: number };

export type Tab =
  | "court"
  | "crown"
  | "economy"
  | "people"
  | "military"
  | "diplomacy";

export type Modal =
  | { k: "event"; id: number }
  | { k: "battle"; id: number }
  | { k: "peace"; n: number; terms?: PeaceTerms }
  | { k: "menu" }
  | { k: "help" }
  | { k: "end" };

export interface GameUi {
  s: GameState;
  w: World;
  map: MapDef;
  /** The player's nation, or -1 when watching. */
  me: number;
  solo: boolean;
  /** Send a command; false (and a note on screen) if it was refused. */
  cmd(c: Command): Promise<boolean>;
  open(view: DrawerView): void;
  back(): void;
  modal(m: Modal | null): void;
  focusProv(p: number): void;
  /** Start choosing where an army should march. */
  pickTarget(armyId: number): void;
  toast(text: string, tone?: "bad" | "good"): void;
  redraw(): void;
}

export function mine(ui: GameUi): Nation | null {
  return ui.me >= 0 ? ui.s.nations[ui.me] : null;
}

/** A round token with someone's initial, in their nation's colour. */
export function token(
  ui: GameUi,
  c: Character | undefined,
  cls = "",
): TemplateResult {
  if (!c) return html`<span class="cq-token empty ${cls}">?</span>`;
  const n = ui.s.nations[c.nation];
  const letter = (c.title ? c.title.replace(/^the /i, "") : c.first)
    .slice(0, 1)
    .toUpperCase();
  return html`<span
    class="cq-token ${cls} ${c.alive ? "" : "dead"}"
    style="--tok:${n?.color ?? "#888"}"
    >${letter}</span
  >`;
}

export function charLink(
  ui: GameUi,
  c: Character | undefined,
  withAge = true,
): TemplateResult {
  if (!c) return html`<span class="cq-muted">nobody</span>`;
  return html`<button
    class="cq-link"
    @click=${() => ui.open({ k: "char", c: c.id })}
  >
    ${charName(c)}${withAge && c.alive
      ? html`<span class="cq-muted"> (${ageOf(ui.s, c)})</span>`
      : nothing}
  </button>`;
}

export function nationLink(ui: GameUi, n: number): TemplateResult {
  const nation = ui.s.nations[n];
  if (!nation) return html`<span class="cq-muted">nobody</span>`;
  return html`<button
    class="cq-link cq-nation-link"
    @click=${() => ui.open({ k: "nation", n })}
  >
    ${flagFor(nation, "cq-flag sm")}${nationName(nation.name)}
  </button>`;
}

export function provLink(ui: GameUi, p: number): TemplateResult {
  return html`<button class="cq-link" @click=${() => ui.focusProv(p)}>
    ${ui.map.provinces[p].name}
  </button>`;
}

/** A bar from 0 to 1 (morale, needs met). */
export function bar(frac: number, cls = ""): TemplateResult {
  const f = Math.max(0, Math.min(1, frac));
  return html`<span
    class="cq-bar ${cls} ${f < 0.5 ? "low" : f < 0.85 ? "mid" : ""}"
    ><span style="width:${Math.round(f * 100)}%"></span
  ></span>`;
}

export function section(
  title: string,
  body: TemplateResult | TemplateResult[] | typeof nothing,
  extra?: TemplateResult,
): TemplateResult {
  return html`<section class="cq-section">
    <h3 class="cq-h3">${title}${extra ?? nothing}</h3>
    ${body}
  </section>`;
}

/** A labelled number with its tooltip, for stat grids. */
export function stat(
  label: string,
  value: string | number,
  tip: () => TipContent,
  note?: string,
): TemplateResult {
  return html`<div class="cq-stat">
    <span class="cq-stat-label">${label}</span>
    ${num(
      typeof value === "number" ? plain(value) : value,
      tip,
      "cq-stat-value",
    )}
    ${note ? html`<span class="cq-stat-note">${note}</span>` : nothing}
  </div>`;
}

export const breakdownTip = (
  title: string,
  b: Breakdown,
  fmt?: (v: number) => string,
  notes?: string[],
): TipContent => ({
  title,
  b,
  fmt,
  notes,
});

/** A command button that's disabled (with the reason on hover) when it can't be done. */
export function action(
  label: string | TemplateResult,
  check: { ok: true } | { ok: false; why: string },
  run: () => void,
  cls = "",
  hint?: string,
): TemplateResult {
  const why = check.ok ? hint : check.why;
  return html`<button
      class="cq-btn ${cls}"
      ?disabled=${!check.ok}
      title=${why ?? ""}
      @click=${run}
    >
      ${label}</button
    >${!check.ok ? html`<span class="cq-why">${check.why}</span>` : nothing}`;
}
