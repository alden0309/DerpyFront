// TREE (r25): a Derpy Conquest dynasty on Derp Land,
// /dynasty/<player>/<game>: the family tree of a player's line in one game
// (everyone they were, the husbands and wives, the children, the parents
// and brothers and sisters), set down on vellum as the game sets it down,
// with each life on a card beside it. Kept as the game was saved and for
// good at its end (nothing secret); a game finished before dynasties were
// kept shows the smaller tree its chronicle tells. Scroll or drag to move
// about, + and − to come closer; on a phone, a tree too wide opens as a list.

import { html, nothing, svg, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type DynastyPage,
  type DynastyRecord,
  dynastyCharts,
  type DynChart,
  dynName,
  type DynPerson,
  dynRelation,
  dynYears,
  roman,
} from "../conquest/engine/DynastyCore";
import {
  type ChartDims,
  chartLeft,
  chartLines,
  chartSize,
  chartTop,
  KIN_DIMS,
} from "../conquest/engine/KinChart";
import { api, ApiError } from "../derpland/Account";
import { scrollIcon } from "../derpland/Icons";
import "./dynasty.css";
import { shortDate } from "./format";
import { HubPage } from "./HubPage";

const DIMS: ChartDims = KIN_DIMS;

/** A family tree, for the profile's Dynasties and the dynasty's page. */
export function treeIcon(cls = "dl-i"): TemplateResult {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="2.5" width="6" height="5" rx="1.2" />
    <rect x="2.5" y="16.5" width="6" height="5" rx="1.2" />
    <rect x="15.5" y="16.5" width="6" height="5" rx="1.2" />
    <path d="M12 7.5v4.5M5.5 16.5V12h13v4.5" />
  </svg>`;
}

/** The address of a dynasty's page. */
export function dynastyHref(username: string, gameId: string): string {
  return `/dynasty/${encodeURIComponent(username)}/${encodeURIComponent(gameId)}`;
}

@customElement("dl-dynasty")
export class DerpDynasty extends HubPage {
  @property({ type: String }) name = "";
  @property({ type: String }) gameId = "";
  @state() private page: DynastyPage | null = null;
  @state() private error: string | null = null;
  @state() private house = 0;
  @state() private who: number | null = null;
  @state() private view: "tree" | "list" | null = null;
  @state() private zoom = 1;

  private loaded = "";
  private charts: DynChart[] = [];
  /** The tree's first look is centred once (each house). */
  private centred = "";

  protected updated(changed: Map<string, unknown>): void {
    if (
      (changed.has("name") || changed.has("gameId")) &&
      `${this.name}/${this.gameId}` !== this.loaded
    )
      void this.load();
    this.centre();
  }

  protected async load(): Promise<void> {
    const key = `${this.name}/${this.gameId}`;
    if (!this.name || !this.gameId || this.loaded === key) return;
    this.loaded = key;
    try {
      const p = await api<DynastyPage>(
        `/players/${encodeURIComponent(this.name)}/dynasty/${encodeURIComponent(this.gameId)}`,
      );
      this.charts = dynastyCharts(p.record);
      const now = p.record.line[p.record.line.length - 1];
      this.house = Math.max(
        0,
        this.charts.findIndex((c) => c.people.includes(now)),
      );
      this.page = p;
      document.title = `The ${p.summary.family}s · ${p.username} · Derp Land`;
      // A rename: the address takes the name they have now.
      if (p.username.toLowerCase() !== this.name.toLowerCase())
        history.replaceState(null, "", dynastyHref(p.username, this.gameId));
    } catch (e) {
      this.error =
        e instanceof ApiError && e.code === "not_found"
          ? "There's no dynasty here."
          : e instanceof ApiError && e.code === "accounts_unavailable"
            ? "Dynasties aren't available on this server."
            : "Couldn't load this dynasty. Refresh to try again.";
    }
  }

  private chart(): DynChart | null {
    return this.charts[this.house] ?? null;
  }

  private viewNow(t: DynChart): "tree" | "list" {
    if (this.view) return this.view;
    return window.matchMedia?.("(max-width: 640px)").matches && t.maxX + 1 > 3
      ? "list"
      : "tree";
  }

  /** Bring whoever's at the heart of the house into view, the first time. */
  private centre(): void {
    const t = this.chart();
    const vp = this.querySelector<HTMLElement>(".dl-dyn-view");
    const key = `${this.house}|${this.loaded}`;
    if (!t || !vp || this.centred === key) return;
    this.centred = key;
    const n = t.nodes.find((x) => x.c === t.focus) ?? t.nodes[0];
    const cx = (chartLeft(DIMS, n.x) + DIMS.CW / 2) * this.zoom;
    const cy = (chartTop(t, DIMS, n.gen) + DIMS.CH / 2) * this.zoom;
    vp.scrollLeft = Math.max(0, cx - vp.clientWidth / 2);
    vp.scrollTop = Math.max(0, cy - vp.clientHeight / 2);
  }

  private setZoom(k: number): void {
    const vp = this.querySelector<HTMLElement>(".dl-dyn-view");
    const was = this.zoom;
    const z = Math.max(0.3, Math.min(1.6, k));
    if (vp) {
      // Keep the middle of the window where it is.
      const mx = (vp.scrollLeft + vp.clientWidth / 2) / was;
      const my = (vp.scrollTop + vp.clientHeight / 2) / was;
      this.zoom = z;
      void this.updateComplete.then(() => {
        vp.scrollLeft = mx * z - vp.clientWidth / 2;
        vp.scrollTop = my * z - vp.clientHeight / 2;
      });
    } else this.zoom = z;
  }

  private fitAll(): void {
    const t = this.chart();
    const vp = this.querySelector<HTMLElement>(".dl-dyn-view");
    if (!t || !vp) return;
    const { w, h } = chartSize(t, DIMS);
    this.zoom = Math.max(
      0.3,
      Math.min(1, (vp.clientWidth - 8) / w, (vp.clientHeight - 8) / h),
    );
    void this.updateComplete.then(() => {
      vp.scrollLeft = 0;
      vp.scrollTop = 0;
    });
  }

  render(): TemplateResult {
    if (this.error) return html`<p class="dl-panel dl-quiet">${this.error}</p>`;
    const p = this.page;
    const t = this.chart();
    if (!p || !t) return html`<p class="dl-quiet">Loading…</p>`;
    const rec = p.record;
    const sel =
      this.who !== null && t.people.includes(this.who) ? this.who : t.focus;
    const view = this.viewNow(t);
    const s = p.summary;
    return html`
      <header class="dl-chron-head">
        <p class="dl-chron-kicker">${treeIcon("dl-i")} Derpy Conquest</p>
        <h1 class="dl-h1 dl-chron-title">The dynasty of the ${s.family}s</h1>
        <p class="dl-lede">
          ${s.lives} ${s.lives === 1 ? "life" : "lives"}, ${s.from} to
          ${s.to}, played by
          <a href="/player/${encodeURIComponent(p.username)}">${p.username}</a>.
          ${s.over
            ? html`Finished ${shortDate(s.at)}.`
            : html`Still being played: set down ${shortDate(s.at)}, at the last save.`}
          ${s.over
            ? html`<a
                class="dl-dyn-story-link"
                href="/chronicle/${encodeURIComponent(s.gameId)}"
                >${scrollIcon("dl-i")} The game's story</a
              >`
            : nothing}
        </p>
        ${rec.thin
          ? html`<p class="dl-quiet dl-dyn-thin">
              This game was finished before Derp Land kept dynasties: the tree
              is the one its story tells (the line, their marriages and their
              children).
            </p>`
          : nothing}
      </header>
      <div class="dl-dyn-controls">
        ${this.charts.length > 1
          ? html`<div class="dl-seg small" role="tablist" aria-label="House">
              ${this.charts.map(
                (c, i) =>
                  html`<button
                    role="tab"
                    aria-selected=${i === this.house}
                    @click=${() => {
                      this.house = i;
                      this.who = null;
                    }}
                  >
                    The ${c.family}s
                  </button>`,
              )}
            </div>`
          : nothing}
        <div class="dl-seg small" role="tablist" aria-label="Show as">
          ${(["tree", "list"] as const).map(
            (v) =>
              html`<button
                role="tab"
                aria-selected=${view === v}
                @click=${() => {
                  this.view = v;
                  this.centred = "";
                }}
              >
                ${v === "tree" ? "Tree" : "List"}
              </button>`,
          )}
        </div>
        ${view === "tree"
          ? html`<div class="dl-dyn-zoom">
              <button
                class="dl-btn small ghost"
                aria-label="Closer"
                @click=${() => this.setZoom(this.zoom * 1.25)}
              >
                +
              </button>
              <button
                class="dl-btn small ghost"
                aria-label="Further"
                @click=${() => this.setZoom(this.zoom * 0.8)}
              >
                −
              </button>
              <button class="dl-btn small ghost" @click=${() => this.fitAll()}>
                All
              </button>
            </div>`
          : nothing}
      </div>
      <div class="dl-dyn-split">
        <section class="dl-dyn-sheet" aria-label="The family tree">
          ${view === "tree" ? this.tree(rec, t, sel) : this.list(rec, t, sel)}
        </section>
        <aside class="dl-panel dl-dyn-life" aria-live="polite">
          ${lifeCard(rec, sel)}
        </aside>
      </div>
    `;
  }

  private tree(rec: DynastyRecord, t: DynChart, sel: number): TemplateResult {
    const { w, h } = chartSize(t, DIMS);
    const k = this.zoom;
    const gens: number[] = [];
    for (let g = t.minGen; g <= t.maxGen; g++) gens.push(g);
    const lines = chartLines(t, DIMS);
    return html`<div
      class="dl-dyn-view"
      @pointerdown=${this.dragStart}
      @pointermove=${this.dragMove}
      @pointerup=${this.dragEnd}
      @pointercancel=${this.dragEnd}
    >
      <div class="dl-dyn-size" style="width:${w * k}px;height:${h * k}px">
        <div
          class="dl-dyn-canvas"
          style="width:${w}px;height:${h}px;transform:scale(${k})"
        >
          <div class="dl-dyn-title">
            <p class="dl-dyn-head">The House of ${t.family}</p>
            <p class="dl-dyn-sub">
              ${t.from !== null ? `${t.from}–${t.to ?? ""} · ` : ""}as set down
              in ${rec.year}${rec.motto && this.house === 0
                ? html` · <i>“${rec.motto}”</i>`
                : nothing}
            </p>
          </div>
          ${gens.map(
            (g) =>
              html`<p
                class="dl-dyn-gen"
                style="top:${chartTop(t, DIMS, g) + 54}px"
              >
                ${roman(g - t.minGen + 1)}
              </p>`,
          )}
          <svg
            class="dl-dyn-lines"
            width=${w}
            height=${h}
            viewBox="0 0 ${w} ${h}"
            aria-hidden="true"
          >
            ${lines.map(
              (l) =>
                svg`<path class="dl-dyn-${l.kind} ${l.mods.join(" ")}" d=${l.d} stroke-dasharray=${l.dash} />`,
            )}
          </svg>
          ${t.nodes.map((n) => {
            const p = rec.people[n.c];
            return html`<button
              class="dl-dyn-card ${kindOf(p)} ${p.dead ? "dead" : ""} ${n.c ===
              sel
                ? "chosen"
                : ""}"
              style="left:${chartLeft(DIMS, n.x)}px;top:${chartTop(t, DIMS, n.gen)}px"
              aria-pressed=${n.c === sel}
              title=${`${dynName(p)}: ${dynRelation(rec, n.c)}`}
              @click=${() => this.choose(n.c)}
            >
              ${p.heir ? html`<span class="dl-dyn-ribbon">Heir</span>` : nothing}
              ${emblem(p)}
              <span class="dl-dyn-name"
                >${p.styled ?? p.first}${p.styled
                  ? ""
                  : html` <i>${p.family}</i>`}${p.dead
                  ? html` <span class="dl-dyn-cross">†</span>`
                  : nothing}</span
              >
              <span class="dl-dyn-dates">${dynYears(p) || " "}</span>
              <span class="dl-dyn-rel">${dynRelation(rec, n.c)}</span>
            </button>`;
          })}
        </div>
      </div>
    </div>`;
  }

  private list(rec: DynastyRecord, t: DynChart, sel: number): TemplateResult {
    const gens: number[] = [];
    for (let g = t.minGen; g <= t.maxGen; g++) gens.push(g);
    return html`<ol class="dl-dyn-list">
      ${gens.map(
        (g) =>
          html`<li>
            <p class="dl-dyn-list-gen">
              <span>${roman(g - t.minGen + 1)}</span> Generation
            </p>
            <ul>
              ${t.nodes
                .filter((n) => n.gen === g)
                .sort((a, b) => a.x - b.x)
                .map((n) => {
                  const p = rec.people[n.c];
                  return html`<li>
                    <button
                      class="dl-dyn-row ${kindOf(p)} ${p.dead
                        ? "dead"
                        : ""} ${n.c === sel ? "chosen" : ""}"
                      aria-pressed=${n.c === sel}
                      @click=${() => this.choose(n.c)}
                    >
                      ${emblem(p, "small")}
                      <span class="dl-dyn-row-text">
                        <b
                          >${dynName(p)}${p.dead
                            ? html` <span class="dl-dyn-cross">†</span>`
                            : nothing}</b
                        >
                        <span class="dl-quiet"
                          >${[dynYears(p), dynRelation(rec, n.c)]
                            .filter(Boolean)
                            .join(" · ")}</span
                        >
                      </span>
                    </button>
                  </li>`;
                })}
            </ul>
          </li>`,
      )}
    </ol>`;
  }

  private choose(i: number): void {
    this.who = i;
    // On a narrow screen the card is below: bring it into view.
    if (window.matchMedia?.("(max-width: 900px)").matches)
      void this.updateComplete.then(() =>
        this.querySelector(".dl-dyn-life")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
  }

  // ---------------------------------------------------------------- dragging with a mouse

  private drag: { x: number; y: number; moved: number; id: number } | null =
    null;

  private dragStart = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    this.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  };

  private dragMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const vp = e.currentTarget as HTMLElement;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.moved > 4) {
      vp.classList.add("dragging");
      vp.scrollLeft -= dx;
      vp.scrollTop -= dy;
    }
  };

  private dragEnd = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const vp = e.currentTarget as HTMLElement;
    vp.classList.remove("dragging");
    // A drag isn't a click on whoever it ended over.
    if (d.moved > 6)
      vp.addEventListener(
        "click",
        (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        },
        { capture: true, once: true },
      );
    this.drag = null;
  };
}

function kindOf(p: DynPerson): string {
  return p.you ? "you" : p.life ? "played" : "kin";
}

/** A small oval with their initial (and the line's number, on the line's own). */
function emblem(p: DynPerson, size = ""): TemplateResult {
  const letter = (p.styled ?? p.first).replace(/^the /i, "").charAt(0) || "?";
  return html`<span
    class="dl-dyn-emblem ${size} ${p.female ? "f" : "m"} ${p.unsexed ? "u" : ""}"
    aria-hidden="true"
    >${letter}${p.life
      ? html`<span class="dl-dyn-seal">${roman(p.life.n)}</span>`
      : nothing}</span
  >`;
}

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const CAME: Record<string, string> = {
  born: "Began the line",
  begin: "Began anew",
  heir: "Came to it as heir",
  takeover: "Taken up",
};

/** Someone's life, on the card beside the tree. */
export function lifeCard(rec: DynastyRecord, i: number): TemplateResult {
  const p = rec.people[i];
  if (!p) return html``;
  const L = p.life;
  const fact = (label: string, value: string | number) =>
    html`<div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>`;
  return html`<div class="dl-dyn-life-head">
      ${emblem(p, "big")}
      <div>
        <h2 class="dl-h2">
          ${dynName(p)}${p.dead ? html` <span class="dl-dyn-cross">†</span>` : nothing}
        </h2>
        <p class="dl-quiet">
          ${[dynYears(p), dynRelation(rec, i)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
    ${p.other !== undefined
      ? html`<p class="dl-quiet">
          Another player's character, on this tree as far as the marriage goes.
        </p>`
      : L
        ? html`<p class="dl-dyn-fate">
              <b>${L.title || "Of no fixed trade"}</b>${L.office
                ? `; ${L.office}`
                : ""}${L.home ? `, ${L.home}` : ""}. ${cap(L.fate)}.
              <span class="dl-quiet"
                >${CAME[L.came] ?? L.came}, ${L.from}–${L.to ?? "now"}.</span
              >
            </p>
            <dl class="dl-chron-facts dl-dyn-facts">
              ${fact("Age", L.age)} ${fact("Renown", nf(L.renown))}
              ${fact(L.ended === "living" ? "Purse" : "Left", nf(L.purse))}
              ${fact("Earned", nf(L.earned))} ${fact("Children", L.children)}
              ${fact("Battles", L.battles ? `${L.battles} (${L.battlesWon} won)` : 0)}
              ${L.duels ? fact("Duels", L.duels) : nothing}
              ${L.wounds ? fact("Wounds", L.wounds) : nothing}
              ${fact("Places", L.places)}
            </dl>
            ${L.skills.length || p.traits?.length
              ? html`<p class="dl-chron-skills">
                  ${L.skills.length
                    ? html`<b>Best at</b>
                        ${L.skills.map(([k, v]) => `${k} ${v}`).join(", ")}.`
                    : nothing}
                  ${p.traits?.length
                    ? html`<b>Traits</b> ${p.traits.map(cap).join(", ")}.`
                    : nothing}
                </p>`
              : nothing}
            ${list("Work and ranks", L.work, true)}
            ${list("Offices", L.offices, false)}
            ${L.ach.length
              ? html`<h3 class="dl-chron-h3">Achievements</h3>
                  <ul class="dl-chron-kids">
                    ${L.ach.map((a) => html`<li>${a}</li>`)}
                  </ul>`
              : nothing}
            ${L.moments.length
              ? html`<h3 class="dl-chron-h3">Moments</h3>
                  <ol class="dl-dyn-moments">
                    ${L.moments.map(
                      (m) =>
                        html`<li class=${m.big ? "big" : ""}>
                          <time>${m.y}</time><span>${m.t}</span>
                        </li>`,
                    )}
                  </ol>`
              : nothing}
            ${L.story.length
              ? html`<details class="dl-chron-chapter dl-dyn-chapter">
                  <summary>
                    <span class="dl-chron-roman">${roman(L.n)}</span>
                    <span class="dl-chron-ch-name">Their chapter</span>
                  </summary>
                  ${L.story.map((t) => html`<p>${t}</p>`)}
                </details>`
              : nothing}`
        : html`${p.title ? html`<p class="dl-dyn-fate">${p.title}.</p>` : nothing}
          ${p.dead
            ? html`<p>
                Died${p.died !== null ? ` in ${p.died}` : p.young ? " young" : ""}${p.cause
                  ? `, ${p.cause}`
                  : ""}.
              </p>`
            : nothing}
          ${p.traits?.length
            ? html`<p class="dl-chron-skills">
                <b>Traits</b> ${p.traits.map(cap).join(", ")}.
              </p>`
            : nothing}`}
    ${p.now && p.other === undefined
      ? html`<p class="dl-dyn-now"><b>${rec.over ? "In the end:" : "Now:"}</b> ${p.now}.</p>`
      : nothing}`;
}

function list(title: string, items: string[], ordered: boolean): TemplateResult {
  if (!items.length) return html``;
  const body = items.map((w) => html`<li>${w}</li>`);
  return html`<h3 class="dl-chron-h3">${title}</h3>
    ${ordered
      ? html`<ol class="dl-dyn-work">${body}</ol>`
      : html`<ul class="dl-dyn-work">${body}</ul>`}`;
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-dynasty": DerpDynasty;
  }
}
