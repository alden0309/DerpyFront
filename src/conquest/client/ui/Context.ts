// What every in-game panel can see and do, and the small pieces they share:
// portraits, links, bars, headings and buttons that say why they're greyed.

import { html, nothing, TemplateResult } from "lit";
import { lifeOfChar } from "../../engine/LifeQueries";
import type { World } from "../../engine/Map";
import { ageOf, charName } from "../../engine/Queries";
import type {
  Breakdown,
  Character,
  GameState,
  Life,
  LifeCommand,
  MapDef,
  PersonAct,
} from "../../engine/Types";
import { flagFor } from "../Flags";
import { portrait } from "../Portrait";
import { nationName } from "../Text";
import { num, plain, TipContent } from "../Tip";

export type Tab = "here" | "you" | "people" | "affairs" | "journal" | "world";

export type DrawerView =
  | { k: "tab"; tab: Tab }
  | { k: "prov"; p: number }
  | { k: "char"; c: number }
  | { k: "army"; id: number }
  | { k: "nation"; n: number };

export type Modal =
  | { k: "event"; id: number }
  /** An interaction with someone, before you do it: will they, and why. */
  | { k: "interact"; c: number; act: PersonAct; arg?: number }
  /** What just happened (the last act, interaction or choice). */
  | { k: "outcome" }
  | { k: "battle"; id: number }
  | { k: "menu" }
  | { k: "help" }
  | { k: "end" }
  | { k: "credits" }
  | { k: "maker" }
  | { k: "takeover" }
  | { k: "trade" }
  // ART (r11): sit for a new likeness.
  | { k: "likeness" };

export interface GameUi {
  s: GameState;
  w: World;
  map: MapDef;
  /** Your seat. */
  seat: string;
  /** Your life (null before you've made a character). */
  life: Life | null;
  /** The character you play now (null while watching). */
  me: Character | null;
  /** Your character's nation, for news (−1 when watching). */
  nation: number;
  solo: boolean;
  isHost: boolean;
  /** Counts page visits: a list keeps its order for the length of one. */
  visit: number;
  /** Counts scenes opened: a scene keeps its backdrop while it's open. */
  modalSeq: number;
  cmd(c: LifeCommand): Promise<boolean>;
  open(view: DrawerView): void;
  back(): void;
  modal(m: Modal | null): void;
  focusProv(p: number): void;
  /** Start choosing on the map where your army should march. */
  pickMarch(): void;
  toast(text: string, tone?: "bad" | "good"): void;
  redraw(): void;
}

/** Someone's portrait, framed, sized by `cls` (xl, banner-token, or small). */
export function token(
  ui: GameUi,
  c: Character | undefined,
  cls = "",
): TemplateResult {
  const n = c ? ui.s.nations[c.nation] : undefined;
  const life = c ? lifeOfChar(ui.s, c.id) : undefined;
  const pic = portrait(
    c,
    {
      age: c ? ageOf(ui.s, c) : 30,
      color: n?.color ?? "#6b4f33",
      native: n?.kind === "native" || c?.religion === "native",
    },
    cls,
  );
  return life
    ? html`<span class="cq-sitter played" style="--frame:${life.frame}"
        >${pic}</span
      >`
    : pic;
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
    ${ui.map.provinces[p]?.name ?? "somewhere"}
  </button>`;
}

/** A bar from 0 to 1 (health, support, progress). */
export function bar(frac: number, cls = ""): TemplateResult {
  const f = Math.max(0, Math.min(1, frac));
  return html`<span
    class="cq-bar ${cls} ${f < 0.35 ? "low" : f < 0.7 ? "mid" : ""}"
    ><span style="width:${Math.round(f * 100)}%"></span
  ></span>`;
}

export function section(
  title: string | TemplateResult,
  body: TemplateResult | TemplateResult[] | typeof nothing,
  extra?: TemplateResult,
): TemplateResult {
  return html`<section class="cq-section">
    <h3 class="cq-h3">${title}${extra ?? nothing}</h3>
    ${body}
  </section>`;
}

/** A heading that opens to show more. */
export function more(
  summary: string | TemplateResult,
  body: TemplateResult,
  open = false,
): TemplateResult {
  return html`<details class="cq-more" ?open=${open}>
    <summary>${summary}</summary>
    <div class="cq-more-body">${body}</div>
  </details>`;
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
): TipContent => ({ title, b, fmt, notes });

/** A button that's greyed (with the reason beside it) when it can't be done. */
export function action(
  label: string | TemplateResult,
  check: { ok: true } | { ok: false; why: string },
  run: () => void,
  cls = "",
  hint?: string,
  showWhy = true,
): TemplateResult {
  const why = check.ok ? hint : check.why;
  return html`<button
      class="cq-btn ${cls}"
      ?disabled=${!check.ok}
      title=${why ?? ""}
      @click=${run}
    >
      ${label}</button
    >${!check.ok && showWhy
      ? html`<span class="cq-why">${check.why}</span>`
      : nothing}`;
}

/** "62%" for a check's odds. */
export function odds(p: number | null): TemplateResult | typeof nothing {
  if (p === null) return nothing;
  const pct = Math.round(p * 100);
  return html`<span
    class="cq-odds ${pct >= 65 ? "good" : pct < 40 ? "bad" : ""}"
    >${pct}%</span
  >`;
}
