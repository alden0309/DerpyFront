// HOME (r12): the family tree, drawn as a genealogist's chart in a family
// Bible: the arms and the family's name in a cartouche, generations in
// ruled rows numbered down the margin, each person an oval portrait with
// their name, their years and how they're kin to you; husbands and wives
// joined by a double rule (lovers by a broken one), children hung from the
// couple they came of. The dead are in sepia with a cross; the heir wears a
// ribbon. Drag (or a finger) to move about, the wheel or a pinch (or + and
// −) to come closer, and click (or tap) anyone for their card.

import { html, nothing, svg, TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import { dateOf } from "../../engine/Calendar";
import { familyTree, KinTree, lifeSpan } from "../../engine/Kin";
import { lifeIsNative, lifeOfChar } from "../../engine/LifeQueries";
import { ageOf, charName } from "../../engine/Queries";
import { arms } from "../Arms";
import { portrait } from "../Portrait";
import type { GameUi } from "./Context";

/** A slot (one card and its margin), a generation's row, the card itself. */
const UW = 132;
const RH = 196;
const CW = 116;
const CH = 150;
/** Where the double rule between a couple runs: the portrait's middle. */
const BAR = 44;
const PADX = 64;
const PADY = 112;

const GEN_NAMES: Record<number, string> = {
  [-2]: "Grandparents",
  [-1]: "Parents",
  0: "Your generation",
  1: "Children",
  2: "Grandchildren",
};

interface View {
  x: number;
  y: number;
  k: number;
  /** The tree it was fitted to (fitted again when the tree changes shape). */
  key: string;
}

const views: Record<string, View> = {};

function sizeOf(t: KinTree): { w: number; h: number } {
  return {
    w: (t.maxX + 1) * UW + PADX * 2,
    h: (t.maxGen - t.minGen) * RH + CH + PADY + 40,
  };
}

const left = (x: number) => PADX + x * UW;
const topOf = (t: KinTree, gen: number) => PADY + (gen - t.minGen) * RH;

/** Fit the chart to the window: all of it, or close in on you. */
function fit(
  t: KinTree,
  el: HTMLElement,
  v: View,
  all: boolean,
  youX: number,
): void {
  const { w, h } = sizeOf(t);
  const vw = el.clientWidth || 360;
  const vh = el.clientHeight || 360;
  if (all) {
    v.k = Math.min(1, vw / w, vh / h) * 0.96;
    v.x = (vw - w * v.k) / 2;
    v.y = (vh - h * v.k) / 2;
    return;
  }
  // Three or four people across, you in the middle of the window.
  v.k = Math.max(0.42, Math.min(1, vw / (UW * 3.3)));
  const cx = left(youX) + CW / 2;
  const cy = topOf(t, 0) + CH / 2;
  v.x = vw / 2 - cx * v.k;
  v.y = vh / 2 - cy * v.k;
}

function apply(el: HTMLElement, v: View): void {
  const canvas = el.querySelector<HTMLElement>(".cq-kin-canvas");
  if (canvas)
    canvas.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  el.dataset.zoom = v.k.toFixed(2);
}

function zoomAt(el: HTMLElement, v: View, f: number, px: number, py: number) {
  const k = Math.max(0.25, Math.min(2.2, v.k * f));
  const r = k / v.k;
  v.x = px - (px - v.x) * r;
  v.y = py - (py - v.y) * r;
  v.k = k;
  apply(el, v);
}

/** Pointers down on a chart, for dragging and pinching. */
interface Gesture {
  pts: Map<number, { x: number; y: number }>;
  moved: number;
  target: EventTarget | null;
  pinch: number;
}
const gestures = new WeakMap<HTMLElement, Gesture>();

function gestureOf(el: HTMLElement): Gesture {
  let g = gestures.get(el);
  if (!g) {
    g = { pts: new Map(), moved: 0, target: null, pinch: 0 };
    gestures.set(el, g);
  }
  return g;
}

function spread(g: Gesture): { d: number; x: number; y: number } {
  const [a, b] = [...g.pts.values()];
  return {
    d: Math.hypot(a.x - b.x, a.y - b.y),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

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
  const v = (views[mode] ??= { x: 0, y: 0, k: 1, key: "" });
  const { w, h } = sizeOf(t);
  const you = t.nodes.find((n) => n.kind === "you")!;
  const year = (d: number) => dateOf(d).year;
  const native = lifeIsNative(s, life);
  const byId = new Map(t.nodes.map((n) => [n.c, n]));
  const cx = (id: number) => left(byId.get(id)!.x) + CW / 2;
  const tp = (id: number) => topOf(t, byId.get(id)!.gen);

  // ---------------------------------------------------------------- the lines

  const lines: ReturnType<typeof svg>[] = [];
  const nearCouple = (a: number, b: number) =>
    t.couples.find(
      (c) => c.near && ((c.a === a && c.b === b) || (c.a === b && c.b === a)),
    );
  const farCouple = (a: number, b: number) =>
    t.couples.find(
      (c) => !c.near && ((c.a === a && c.b === b) || (c.a === b && c.b === a)),
    );
  for (const c of t.couples) {
    const x1 = Math.min(cx(c.a), cx(c.b));
    const x2 = Math.max(cx(c.a), cx(c.b));
    const y = tp(c.a);
    const dash = c.kind === "lovers" ? "5 4" : "";
    if (c.near)
      lines.push(
        svg`<path class="cq-kin-wed ${c.kind}" d="M${x1 + CW / 2 - 2} ${y + BAR - 2.5} H${x2 - CW / 2 + 2} M${x1 + CW / 2 - 2} ${y + BAR + 2.5} H${x2 - CW / 2 + 2}" stroke-dasharray=${dash} />`,
      );
    else {
      const ly = y + CH + 10 + c.lane * 7;
      lines.push(
        svg`<path class="cq-kin-wed far ${c.kind}" d="M${x1} ${y + CH} V${ly} H${x2} V${y + CH}" stroke-dasharray=${dash} />`,
      );
    }
  }
  for (const d of t.descents) {
    const kids = d.children.filter((id) => byId.has(id));
    if (!kids.length) continue;
    const pTop = tp(d.parents[0]);
    const busY = pTop + CH + (RH - CH) / 2 + 6;
    let dropX: number;
    let dropY: number;
    if (d.parents.length === 2) {
      const [a, b] = d.parents;
      dropX = (cx(a) + cx(b)) / 2;
      const far = farCouple(a, b);
      dropY = far ? pTop + CH + 10 + far.lane * 7 : pTop + BAR + 2.5;
      if (!far && !nearCouple(a, b)) dropY = pTop + CH;
    } else {
      dropX = cx(d.parents[0]);
      dropY = pTop + CH;
    }
    const xs = kids.map((id) => cx(id));
    const lo = Math.min(dropX, ...xs);
    const hi = Math.max(dropX, ...xs);
    const kidTop = tp(kids[0]);
    const cls = `cq-kin-line ${d.hidden ? "hidden" : ""}`;
    lines.push(
      svg`<path class=${cls} d="M${dropX} ${dropY} V${busY} M${lo} ${busY} H${hi} ${xs
        .map((x) => `M${x} ${busY} V${kidTop - 3}`)
        .join(" ")}" />`,
    );
  }

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

  // ---------------------------------------------------------------- moving about

  const down = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const g = gestureOf(el);
    if ((e.target as HTMLElement).closest(".cq-kin-tools")) return;
    el.setPointerCapture(e.pointerId);
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pts.size === 1) {
      g.moved = 0;
      g.target = e.target;
    }
    if (g.pts.size === 2) g.pinch = spread(g).d;
  };
  const move = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const g = gestureOf(el);
    const p = g.pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (g.pts.size === 1) {
      g.moved += Math.abs(dx) + Math.abs(dy);
      v.x += dx;
      v.y += dy;
      apply(el, v);
    } else if (g.pts.size === 2) {
      g.moved += 10;
      const now = spread(g);
      const r = el.getBoundingClientRect();
      if (g.pinch > 0)
        zoomAt(el, v, now.d / g.pinch, now.x - r.left, now.y - r.top);
      g.pinch = now.d;
    }
  };
  const up = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const g = gestureOf(el);
    if (!g.pts.has(e.pointerId)) return;
    g.pts.delete(e.pointerId);
    if (g.pts.size === 1) g.pinch = 0;
    if (g.pts.size === 0 && g.moved < 8 && e.type === "pointerup") {
      const hit = (g.target as HTMLElement | null)?.closest?.(
        "[data-c]",
      ) as HTMLElement | null;
      if (hit) onOpen(Number(hit.dataset.c));
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    zoomAt(
      el,
      v,
      Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)),
      e.clientX - r.left,
      e.clientY - r.top,
    );
  };
  const tool = (f: (el: HTMLElement) => void) => (e: Event) => {
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>(
      ".cq-kin-view",
    )!;
    f(el);
  };
  const atFirst = (el?: Element) => {
    if (!el) return;
    const vp = el as HTMLElement;
    if (v.key !== key) {
      v.key = key;
      // Measured once it's laid out.
      requestAnimationFrame(() => {
        fit(t, vp, v, mode === "modal", you.x);
        apply(vp, v);
      });
    }
  };
  const generations = [];
  for (let g = t.minGen; g <= t.maxGen; g++) generations.push(g);

  return html`<div
    class="cq-kin-view ${mode}"
    ${ref(atFirst)}
    @pointerdown=${down}
    @pointermove=${move}
    @pointerup=${up}
    @pointercancel=${up}
    @wheel=${wheel}
  >
    <div
      class="cq-kin-canvas"
      style="width:${w}px;height:${h}px;transform:translate(${v.x}px, ${v.y}px) scale(${v.k})"
    >
      <div class="cq-kin-title">
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
      <svg
        class="cq-kin-lines"
        width=${w}
        height=${h}
        viewBox="0 0 ${w} ${h}"
        aria-hidden="true"
      >
        ${lines}
      </svg>
      ${t.nodes.map(card)}
    </div>
    <div class="cq-kin-tools">
      <button
        class="cq-kin-tool"
        title="Closer"
        aria-label="Closer"
        @click=${tool((el) =>
          zoomAt(el, v, 1.25, el.clientWidth / 2, el.clientHeight / 2),
        )}
      >
        +
      </button>
      <button
        class="cq-kin-tool"
        title="Further"
        aria-label="Further"
        @click=${tool((el) =>
          zoomAt(el, v, 0.8, el.clientWidth / 2, el.clientHeight / 2),
        )}
      >
        −
      </button>
      <button
        class="cq-kin-tool wide"
        title="The whole family"
        @click=${tool((el) => {
          fit(t, el, v, true, you.x);
          apply(el, v);
        })}
      >
        All
      </button>
      <button
        class="cq-kin-tool wide"
        title="Back to you"
        @click=${tool((el) => {
          fit(t, el, v, false, you.x);
          apply(el, v);
        })}
      >
        You
      </button>
    </div>
  </div>`;
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
