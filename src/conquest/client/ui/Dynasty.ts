// TREE (r25): Journal › Dynasty, the family tree of your line: everyone
// you've been (the line of heirs, and anyone taken up or begun anew), their
// husbands and wives, their children played or not, and their parents and
// brothers and sisters, set down as a genealogist would in the family
// Bible's look (the same window as You › Family's tree: drag, pinch, + and
// −, All, and back to whoever you are now). Each house the line was gets
// its own chart. Click anyone for their life beside it: how they lived and
// died, their work and ranks, offices, what they left, renown, achievements
// and the moments of it, from the game's own records; the living, where they
// are. On a phone a tree too wide for it opens as a list, generation by
// generation. Only your own line: anyone else's is on it only as far as a
// marriage goes.

import { html, nothing, TemplateResult } from "lit";
import { dynastyOf } from "../../engine/Dynasty";
import {
  type DynastyRecord,
  dynastyCharts,
  type DynChart,
  dynName,
  type DynPerson,
  dynRelation,
  dynYears,
  roman,
} from "../../engine/DynastyCore";
import { chartLeft, chartTop, KIN_DIMS } from "../../engine/KinChart";
import { lifeIsNative } from "../../engine/LifeQueries";
import { ageOf } from "../../engine/Queries";
import { kindDef } from "../../engine/StoryCore";
import type { Life } from "../../engine/Types";
import { arms } from "../Arms";
import { portrait } from "../Portrait";
import type { GameUi } from "./Context";
import { kinView } from "./KinView";
import { pageHead } from "./Nav";
import { storyIcon } from "./StoryIcons";

// ---------------------------------------------------------------- the record, kept a while

interface Made {
  key: string;
  rec: DynastyRecord;
  charts: DynChart[];
}
const made = new WeakMap<Life, Made>();

/** The seat's dynasty, made again when the month turns or the family changes. */
export function dynastyNow(ui: GameUi): Made | null {
  const life = ui.life;
  if (!life || !life.line.length) return null;
  const me = life.c >= 0 ? ui.s.chars[life.c] : undefined;
  const key = [
    Math.floor(ui.s.day / 30),
    life.line.length,
    life.c,
    life.milestones.length,
    me?.spouse ?? -1,
    me?.children.length ?? 0,
    ui.s.over ? 1 : 0,
  ].join("|");
  const was = made.get(life);
  if (was?.key === key) return was;
  const rec = dynastyOf(ui.s, life, ui.map);
  const m = { key, rec, charts: dynastyCharts(rec) };
  made.set(life, m);
  return m;
}

// ---------------------------------------------------------------- what's chosen

/** The house shown, whose life is open, and tree or list (null: as the screen suits). */
const pick: { house: number; who: number | null; view: "tree" | "list" | null } =
  { house: -1, who: null, view: null };

function houseOf(m: Made): DynChart {
  if (pick.house < 0 || pick.house >= m.charts.length) {
    // The house of the one played now (or the last of the line).
    const now = m.rec.line[m.rec.line.length - 1];
    const at = m.charts.findIndex((c) => c.people.includes(now));
    pick.house = at < 0 ? 0 : at;
  }
  return m.charts[pick.house];
}

function chosen(m: Made, t: DynChart): number {
  if (pick.who === null || !t.people.includes(pick.who)) pick.who = t.focus;
  return pick.who;
}

/** A tree too wide for a phone opens as a list. */
function viewFor(t: DynChart): "tree" | "list" {
  if (pick.view) return pick.view;
  const narrow =
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 560px)").matches;
  return narrow && t.maxX + 1 > 4 ? "list" : "tree";
}

// ---------------------------------------------------------------- a person

function face(ui: GameUi, p: DynPerson, cls: string): TemplateResult {
  const c = p.c !== undefined ? ui.s.chars[p.c] : undefined;
  if (!c) return html`<span class="cq-portrait empty ${cls}"></span>`;
  const nat = ui.s.nations[c.nation];
  return portrait(
    c,
    {
      age: Math.max(0, ageOf(ui.s, c)),
      color: nat?.color ?? "#6b4f33",
      native: nat?.kind === "native" || c.religion === "native",
    },
    cls,
  );
}

function kindOf(p: DynPerson): string {
  if (p.you) return "you";
  if (p.life) return "played";
  return "kin";
}

function card(
  ui: GameUi,
  m: Made,
  t: DynChart,
  n: DynChart["nodes"][number],
  sel: number,
  open: (i: number) => void,
): TemplateResult {
  const p = m.rec.people[n.c];
  const rel = dynRelation(m.rec, n.c);
  return html`<button
    class="cq-kin-card cq-dyn-card kind-${kindOf(p)} ${p.dead
      ? "dead"
      : ""} ${p.heir ? "heir" : ""} ${n.c === sel ? "chosen" : ""}"
    style="left:${chartLeft(KIN_DIMS, n.x)}px;top:${chartTop(t, KIN_DIMS, n.gen)}px"
    data-c=${n.c}
    title=${`${dynName(p)}: ${rel}`}
    aria-pressed=${n.c === sel}
    @click=${(e: MouseEvent) => {
      if (e.detail === 0) open(n.c);
    }}
  >
    ${p.heir ? html`<span class="cq-kin-ribbon">Heir</span>` : nothing}
    ${p.life
      ? html`<span class="cq-dyn-seal" title="You played them">${roman(p.life.n)}</span>`
      : nothing}
    ${face(ui, p, "cq-kin-face")}
    <span class="cq-kin-name"
      >${p.styled ?? p.first}${p.styled
        ? ""
        : html` <i>${p.family}</i>`}${p.dead
        ? html` <span class="cq-kin-cross">†</span>`
        : nothing}</span
    >
    <span class="cq-kin-dates">${dynYears(p) || " "}</span>
    <span class="cq-kin-rel"
      >${rel}${p.other !== undefined
        ? html` <b class="cq-kin-player">player</b>`
        : nothing}${p.abroad ? " · in Europe" : ""}</span
    >
  </button>`;
}

/** The tree in its window. */
function treeView(
  ui: GameUi,
  m: Made,
  t: DynChart,
  mode: "page" | "modal",
  sel: number,
  open: (i: number) => void,
): TemplateResult {
  const life = ui.life!;
  const native = lifeIsNative(ui.s, life);
  const focusNode = t.nodes.find((n) => n.c === t.focus) ?? t.nodes[0];
  const gens: number[] = [];
  for (let g = t.minGen; g <= t.maxGen; g++) gens.push(g);
  const playedIn = (g: number) =>
    t.nodes
      .filter((n) => n.gen === g && m.rec.people[n.c].life)
      .map((n) => m.rec.people[n.c].styled ?? m.rec.people[n.c].first);
  const years = t.from !== null ? `${t.from}${t.to && t.to !== t.from ? `–${t.to}` : ""}` : "";
  return kinView({
    mode: `dyn-${mode}-${pick.house}`,
    cls: `${mode} cq-dyn-view`,
    key: `${t.nodes.length}|${t.maxX}|${t.minGen}|${t.maxGen}|${pick.house}`,
    t,
    dims: KIN_DIMS,
    focus: { x: focusNode.x, gen: focusNode.gen },
    fitAll: false,
    focusLabel: m.rec.people[t.focus]?.you ? "You" : "Last",
    focusTitle: m.rec.people[t.focus]?.you
      ? "Back to you"
      : "Back to the last of the line",
    onOpen: open,
    body: html`<div class="cq-kin-title">
        ${arms(life.sigil, "cq-kin-arms", native, "Your arms")}
        <div>
          <p class="cq-kin-head">The House of ${t.family}</p>
          <p class="cq-kin-sub">
            ${years ? html`${years} · ` : nothing}as set down in the year
            ${m.rec.year}${m.rec.motto && pick.house === 0
              ? html` · <i>“${m.rec.motto}”</i>`
              : nothing}
          </p>
        </div>
      </div>
      ${gens.map((g) => {
        const names = playedIn(g);
        return html`<p
          class="cq-kin-gen"
          style="top:${chartTop(t, KIN_DIMS, g) + 54}px"
        >
          <span>${roman(g - t.minGen + 1)}</span>
          ${names.length ? names.join(", ") : nothing}
        </p>`;
      })}
      ${t.nodes.map((n) => card(ui, m, t, n, sel, open))}`,
  });
}

/** Generation by generation, for a phone (or by choice). */
function listView(
  ui: GameUi,
  m: Made,
  t: DynChart,
  sel: number,
  open: (i: number) => void,
): TemplateResult {
  const gens: number[] = [];
  for (let g = t.minGen; g <= t.maxGen; g++) gens.push(g);
  return html`<ol class="cq-dyn-list">
    ${gens.map((g) => {
      const row = t.nodes.filter((n) => n.gen === g).sort((a, b) => a.x - b.x);
      return html`<li class="cq-dyn-gen">
        <p class="cq-dyn-gen-name">
          <span>${roman(g - t.minGen + 1)}</span> Generation
        </p>
        <ul>
          ${row.map((n) => {
            const p = m.rec.people[n.c];
            return html`<li>
              <button
                class="cq-dyn-row kind-${kindOf(p)} ${p.dead ? "dead" : ""} ${n.c ===
                sel
                  ? "chosen"
                  : ""}"
                aria-pressed=${n.c === sel}
                @click=${() => open(n.c)}
              >
                ${face(ui, p, "cq-dyn-row-face")}
                <span class="cq-dyn-row-text">
                  <b
                    >${dynName(p)}${p.dead
                      ? html` <span class="cq-kin-cross">†</span>`
                      : nothing}</b
                  >
                  <span class="cq-muted small"
                    >${[dynYears(p), dynRelation(m.rec, n.c)]
                      .filter(Boolean)
                      .join(" · ")}</span
                  >
                </span>
                ${p.life
                  ? html`<span class="cq-dyn-seal inline">${roman(p.life.n)}</span>`
                  : p.heir
                    ? html`<span class="cq-chip">Heir</span>`
                    : p.other !== undefined
                      ? html`<b class="cq-kin-player">player</b>`
                      : nothing}
              </button>
            </li>`;
          })}
        </ul>
      </li>`;
    })}
  </ol>`;
}

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** Their life, beside the tree. */
export function lifePanel(
  ui: GameUi,
  rec: DynastyRecord,
  i: number,
  inModal: boolean,
): TemplateResult {
  const p = rec.people[i];
  if (!p) return html``;
  const L = p.life;
  const fact = (label: string, value: string | number) =>
    html`<div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>`;
  const open = () => {
    if (p.c === undefined) return;
    if (inModal) ui.modal(null);
    ui.open({ k: "char", c: p.c });
  };
  const deathLine = p.dead
    ? `Died${p.died !== null ? ` in ${p.died}` : p.young ? " young" : ""}${p.cause ? `, ${p.cause}` : ""}.`
    : "";
  return html`<article class="cq-dyn-life" aria-live="polite">
    <header class="cq-dyn-life-head">
      ${face(ui, p, "cq-dyn-life-face")}
      <div>
        <h3 class="cq-h3">
          ${dynName(p)}${p.dead ? html` <span class="cq-kin-cross">†</span>` : nothing}
        </h3>
        <p class="cq-muted small">
          ${[dynYears(p), dynRelation(rec, i)].filter(Boolean).join(" · ")}
        </p>
        ${p.title && !L ? html`<p class="cq-dyn-title">${p.title}</p>` : nothing}
      </div>
    </header>
    ${p.other !== undefined
      ? html`<p class="cq-muted">
          Another player's character${p.other ? html` (<b>${p.other}</b>)` : nothing}:
          on your tree as far as the marriage goes. Their own line is theirs to tell.
        </p>`
      : L
        ? html`<p class="cq-dyn-fate">
              ${L.title ? html`<b>${L.title}</b>` : "Of no fixed trade"}${L.office
                ? `; ${L.office}`
                : ""}${L.home ? `, ${L.home}` : ""}.
              ${cap(L.fate)}.
              <span class="cq-muted small"
                >${came(L.came)}, ${L.from}–${L.to ?? "now"}.</span
              >
            </p>
            <dl class="cq-dyn-facts">
              ${fact("Age", L.age)} ${fact("Renown", nf(L.renown))}
              ${fact(L.ended === "living" ? "Purse" : "Left", `${nf(L.purse)} coins`)}
              ${fact("Earned", nf(L.earned))} ${fact("Children", L.children)}
              ${fact("Battles", L.battles ? `${L.battles} (${L.battlesWon} won)` : 0)}
              ${L.duels ? fact("Duels", L.duels) : nothing}
              ${L.wounds ? fact("Wounds", L.wounds) : nothing}
              ${fact("Places", L.places)}
            </dl>
            ${L.skills.length
              ? html`<p class="cq-muted small">
                  <b>Best at</b>
                  ${L.skills.map(([k, v]) => `${k} ${v}`).join(", ")}.
                  ${p.traits?.length ? html`<b>Traits</b> ${p.traits.join(", ")}.` : nothing}
                </p>`
              : nothing}
            ${L.work.length
              ? html`<h4 class="cq-dyn-h4">Work and ranks</h4>
                  <ol class="cq-dyn-work">
                    ${L.work.map((w) => html`<li>${w}</li>`)}
                  </ol>`
              : nothing}
            ${L.offices.length
              ? html`<h4 class="cq-dyn-h4">Offices</h4>
                  <ul class="cq-dyn-work">
                    ${L.offices.map((w) => html`<li>${w}</li>`)}
                  </ul>`
              : nothing}
            ${L.ach.length
              ? html`<h4 class="cq-dyn-h4">Achievements</h4>
                  <p class="cq-dyn-ach">
                    ${L.ach.map((a) => html`<span class="cq-chip">${a}</span>`)}
                  </p>`
              : nothing}
            ${L.moments.length
              ? html`<h4 class="cq-dyn-h4">Moments</h4>
                  <ol class="cq-dyn-moments">
                    ${L.moments.map(
                      (x) =>
                        html`<li class=${x.big ? "big" : ""}>
                          <time>${x.y}</time>
                          ${storyIcon(kindDef(x.k).icon)}
                          <span>${x.t}</span>
                        </li>`,
                    )}
                  </ol>`
              : nothing}
            ${L.story.length
              ? html`<details class="cq-dyn-story">
                  <summary>Their chapter of the story</summary>
                  ${L.story.map((t) => html`<p>${t}</p>`)}
                </details>`
              : nothing}`
        : html`${deathLine ? html`<p>${deathLine}</p>` : nothing}
          ${p.traits?.length
            ? html`<p class="cq-muted small"><b>Traits</b> ${p.traits.join(", ")}.</p>`
            : nothing}`}
    ${p.now && p.other === undefined
      ? html`<p class="cq-dyn-now"><b>Now:</b> ${p.now}.</p>`
      : nothing}
    ${p.c !== undefined && ui.s.chars[p.c]
      ? html`<div class="cq-btnrow">
          <button class="cq-btn small" @click=${open}>Their card</button>
        </div>`
      : nothing}
  </article>`;
}

function came(c: string): string {
  switch (c) {
    case "born":
      return "Began the line";
    case "begin":
      return "Began anew";
    case "heir":
      return "Came to it as heir";
    default:
      return "Taken up";
  }
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The house switch and tree or list. */
function controls(ui: GameUi, m: Made, t: DynChart, view: "tree" | "list"): TemplateResult {
  return html`<div class="cq-dyn-controls">
    ${m.charts.length > 1
      ? html`<div class="cq-seg small" role="radiogroup" aria-label="House">
          ${m.charts.map(
            (c, i) =>
              html`<button
                role="radio"
                aria-checked=${i === pick.house}
                @click=${() => {
                  pick.house = i;
                  pick.who = null;
                  ui.redraw();
                }}
              >
                The ${c.family}s
              </button>`,
          )}
        </div>`
      : nothing}
    <div class="cq-seg small" role="radiogroup" aria-label="Show as">
      ${(["tree", "list"] as const).map(
        (v) =>
          html`<button
            role="radio"
            aria-checked=${view === v}
            @click=${() => {
              pick.view = v;
              ui.redraw();
            }}
          >
            ${v === "tree" ? "Tree" : "List"}
          </button>`,
      )}
    </div>
    <span class="cq-muted small cq-dyn-count"
      >${t.people.length} ${t.people.length === 1 ? "soul" : "souls"},
      ${m.rec.line.filter((i) => t.people.includes(i)).length} of them yours</span
    >
  </div>`;
}

// ---------------------------------------------------------------- the page and the big window

/** Journal › Dynasty. */
export function dynastyPage(ui: GameUi): TemplateResult {
  const m = dynastyNow(ui);
  const head = pageHead(
    "Dynasty",
    "Your line's family tree: everyone you've been, their husbands and wives, their children and their parents. Click anyone for their life.",
    m
      ? html`<div class="cq-btnrow">
          <button
            class="cq-btn small"
            @click=${() => ui.modal({ k: "dynasty" })}
          >
            Open it large
          </button>
        </div>`
      : undefined,
  );
  if (!m || !m.charts.length)
    return html`${head}
      <p class="cq-empty">No one yet. Make a character, and your line begins.</p>`;
  const t = houseOf(m);
  const sel = chosen(m, t);
  const view = viewFor(t);
  const open = (i: number) => {
    pick.who = i;
    ui.redraw();
  };
  return html`${head} ${controls(ui, m, t, view)}
    <div class="cq-dyn-page">
      ${view === "tree"
        ? html`${treeView(ui, m, t, "page", sel, open)}
            <p class="cq-muted small cq-kin-hint">
              Drag to move, pinch or scroll to come closer; click anyone for
              their life below.
            </p>`
        : listView(ui, m, t, sel, open)}
      ${lifePanel(ui, m.rec, sel, false)}
    </div>`;
}

/** The big window (from the page, or from the story told at the end). */
export function dynastyModal(ui: GameUi, from?: "end"): TemplateResult {
  const m = dynastyNow(ui);
  if (!m || !m.charts.length)
    return html`<h2 class="cq-h1">Your dynasty</h2>
      <p class="cq-empty">No one yet.</p>`;
  const t = houseOf(m);
  const sel = chosen(m, t);
  const view = viewFor(t);
  const open = (i: number) => {
    pick.who = i;
    ui.redraw();
  };
  return html`<div class="cq-kin-modal cq-dyn-modal">
    <h2 class="cq-h1">
      The dynasty of the ${m.rec.family}s
      <span class="cq-muted small"
        >${m.rec.line.length}
        ${m.rec.line.length === 1 ? "life" : "lives"}, ${m.rec.from} to
        ${m.rec.year}</span
      >
    </h2>
    ${controls(ui, m, t, view)}
    <div class="cq-dyn-split">
      <div class="cq-dyn-split-tree">
        ${view === "tree"
          ? treeView(ui, m, t, "modal", sel, open)
          : listView(ui, m, t, sel, open)}
      </div>
      <div class="cq-dyn-split-life">${lifePanel(ui, m.rec, sel, true)}</div>
    </div>
    ${from === "end"
      ? html`<div class="cq-btnrow end">
          <button class="cq-btn" @click=${() => ui.modal({ k: "end" })}>
            Back to the story
          </button>
        </div>`
      : nothing}
  </div>`;
}

/** For tests and screenshots: choose someone, a house, or tree or list. */
export function dynastyPick(o: Partial<typeof pick>): void {
  Object.assign(pick, o);
}
