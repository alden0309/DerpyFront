// HOME (r12): the family tree, drawn as a genealogist's chart in a family
// Bible: the arms and the family's name in a cartouche, generations in
// ruled rows numbered down the margin, each person an oval portrait with
// their name, their years and how they're kin to you; husbands and wives
// joined by a double rule (lovers by a broken one), children hung from the
// couple they came of. The dead are in sepia with a cross; the heir wears a
// ribbon. Drag (or a finger) to move about, the wheel or a pinch (or + and
// −) to come closer, and click (or tap) anyone for their card.

import { html, nothing, TemplateResult } from "lit";
import { dateOf } from "../../engine/Calendar";
import { familyTree, KinTree, lifeSpan } from "../../engine/Kin";
import { chartLeft, chartTop, KIN_DIMS } from "../../engine/KinChart"; // TREE (r25)
import { lifeIsNative, lifeOfChar } from "../../engine/LifeQueries";
import { ageOf, charName } from "../../engine/Queries";
import { arms } from "../Arms";
import { portrait } from "../Portrait";
import type { GameUi } from "./Context";
import { kinView } from "./KinView"; // TREE (r25): the window, shared with the dynasty
import { eduKinBadge } from "./Schooling"; // EDU (r13)

const GEN_NAMES: Record<number, string> = {
  [-2]: "Grandparents",
  [-1]: "Parents",
  0: "Your generation",
  1: "Children",
  2: "Grandchildren",
};

const left = (x: number) => chartLeft(KIN_DIMS, x);
const topOf = (t: KinTree, gen: number) => chartTop(t, KIN_DIMS, gen);

/**
 * The family tree in a window of its own size. `mode` keeps the page's
 * view and the big window's apart; `onOpen` is what clicking someone does.
 */
export function familyTreeView(
  ui: GameUi,
  mode: "page" | "modal",
  onOpen: (c: number) => void,
): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0) return html``;
  const t = familyTree(s, life);
  if (!t) return html``;
  const key = `${t.nodes.length}|${t.maxX}|${t.minGen}|${t.maxGen}`;
  const you = t.nodes.find((n) => n.kind === "you")!;
  const year = (d: number) => dateOf(d).year;
  const native = lifeIsNative(s, life);

  // ---------------------------------------------------------------- the people

  const card = (n: (typeof t.nodes)[number]) => {
    const c = s.chars[n.c];
    if (!c) return nothing;
    const nat = s.nations[c.nation];
    const played = lifeOfChar(s, c.id);
    return html`<button
      class="cq-kin-card kind-${n.kind} ${c.alive ? "" : "dead"} ${n.heir
        ? "heir"
        : ""}"
      style="left:${left(n.x)}px;top:${topOf(t, n.gen)}px"
      data-c=${c.id}
      title=${`${charName(c)}: ${n.label}`}
      @click=${(e: MouseEvent) => {
        // The mouse and fingers open cards on lifting (see below); keys here.
        if (e.detail === 0) onOpen(c.id);
      }}
    >
      ${n.heir ? html`<span class="cq-kin-ribbon">Heir</span>` : nothing}
      ${n.kind === "you" ? nothing : eduKinBadge(c)}
      ${portrait(
        c,
        {
          age: c.alive ? ageOf(s, c) : Math.max(0, ageOf(s, c)),
          color: nat?.color ?? "#6b4f33",
          native: nat?.kind === "native" || c.religion === "native",
        },
        "cq-kin-face",
      )}
      <span class="cq-kin-name"
        >${c.title ?? c.first}${c.title
          ? ""
          : html` <i>${c.family}</i>`}${c.alive
          ? ""
          : html` <span class="cq-kin-cross">†</span>`}</span
      >
      <span class="cq-kin-dates">${lifeSpan(s, c, year)}</span>
      <span class="cq-kin-rel"
        >${n.label}${played && n.kind !== "you"
          ? html` <b class="cq-kin-player">player</b>`
          : nothing}${c.abroad ? " · in Europe" : ""}</span
      >
    </button>`;
  };

  const generations = [];
  for (let g = t.minGen; g <= t.maxGen; g++) generations.push(g);

  return kinView({
    mode,
    cls: mode,
    key,
    t,
    dims: KIN_DIMS,
    focus: { x: you.x, gen: 0 },
    fitAll: mode === "modal",
    focusLabel: "You",
    focusTitle: "Back to you",
    onOpen,
    body: html`<div class="cq-kin-title">
        ${arms(life.sigil, "cq-kin-arms", native, "Your arms")}
        <div>
          <p class="cq-kin-head">The Family of ${t.family}</p>
          <p class="cq-kin-sub">
            as set down in the year
            ${dateOf(s.day).year}${life.motto
              ? html` · <i>“${life.motto}”</i>`
              : nothing}
          </p>
        </div>
      </div>
      ${generations.map(
        (g) =>
          html`<p class="cq-kin-gen" style="top:${topOf(t, g) + 54}px">
            <span>${["I", "II", "III", "IV", "V"][g - t.minGen]}</span>
            ${GEN_NAMES[g]}
          </p>`,
      )}
      ${t.nodes.map(card)}`,
  });
}

/** The tree on You › Family: the window, and the way to the big one. */
export function familyTreeSection(ui: GameUi): TemplateResult {
  const life = ui.life;
  if (!life || life.c < 0) return html``;
  const t = familyTree(ui.s, life);
  const n = t?.nodes.length ?? 0;
  return html`<section class="cq-section cq-kin-section">
    <h3 class="cq-h3">
      The family tree
      <span class="cq-muted small">${n} ${n === 1 ? "soul" : "souls"}</span>
    </h3>
    ${familyTreeView(ui, "page", (c) => ui.open({ k: "char", c }))}
    <div class="cq-btnrow">
      <button class="cq-btn small" @click=${() => ui.modal({ k: "tree" })}>
        Open it large
      </button>
      <span class="cq-muted small cq-kin-hint"
        >Drag to move, pinch or scroll to come closer; click anyone for their
        card.</span
      >
    </div>
  </section>`;
}

/** The big window. */
export function familyTreeModal(ui: GameUi): TemplateResult {
  return html`<div class="cq-kin-modal">
    <h2 class="cq-h1">Your family</h2>
    ${familyTreeView(ui, "modal", (c) => {
      ui.modal(null);
      ui.open({ k: "char", c });
    })}
  </div>`;
}
