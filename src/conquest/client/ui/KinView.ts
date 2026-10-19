// HOME (r12), TREE (r25): a genealogist's chart in a window of its own size,
// to move about in: drag (or a finger) to move, the wheel or a pinch (or +
// and −) to come closer, "All" for the whole chart and "You" (or whoever
// it centres on) to go back; click (or tap) anyone. The family tree
// (FamilyTree.ts) and the dynasty (Dynasty.ts) are both drawn in it.

import { html, svg, TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import {
  type Chart,
  type ChartDims,
  chartLeft,
  chartLines,
  chartSize,
  chartTop,
} from "../../engine/KinChart";

interface View {
  x: number;
  y: number;
  k: number;
  /** The chart it was fitted to (fitted again when the chart changes shape). */
  key: string;
}

const views: Record<string, View> = {};

export interface KinViewModel {
  /** Whose place to keep: each page's view and the big window's are apart. */
  mode: string;
  /** "page" or "modal" (its size). */
  cls: string;
  /** The chart's shape: the view is fitted again when it changes. */
  key: string;
  t: Chart;
  dims: ChartDims;
  /** Who the first look (and the button) centres on: a slot and a generation. */
  focus: { x: number; gen: number };
  /** The first look shows the whole chart (else it closes in on the focus). */
  fitAll: boolean;
  /** What's on the canvas besides the lines: the title, the rows' names, the cards. */
  body: TemplateResult;
  /** The button that goes back to the focus ("You"). */
  focusLabel: string;
  focusTitle: string;
  /** Clicking (or tapping) someone: their `data-c`. */
  onOpen: (id: number) => void;
}

/** Fit the chart to the window: all of it, or close in on the focus. */
function fit(m: KinViewModel, el: HTMLElement, v: View, all: boolean): void {
  const { w, h } = chartSize(m.t, m.dims);
  const vw = el.clientWidth || 360;
  const vh = el.clientHeight || 360;
  if (all) {
    v.k = Math.min(1, vw / w, vh / h) * 0.96;
    v.x = (vw - w * v.k) / 2;
    v.y = (vh - h * v.k) / 2;
    return;
  }
  // Three or four people across, the focus in the middle of the window.
  v.k = Math.max(0.42, Math.min(1, vw / (m.dims.UW * 3.3)));
  const cx = chartLeft(m.dims, m.focus.x) + m.dims.CW / 2;
  const cy = chartTop(m.t, m.dims, m.focus.gen) + m.dims.CH / 2;
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
  const k = Math.max(0.2, Math.min(2.2, v.k * f));
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

/** The lines of a chart, as SVG under its cards. */
export function chartSvg(t: Chart, dims: ChartDims): TemplateResult {
  const { w, h } = chartSize(t, dims);
  return html`<svg
    class="cq-kin-lines"
    width=${w}
    height=${h}
    viewBox="0 0 ${w} ${h}"
    aria-hidden="true"
  >
    ${chartLines(t, dims).map(
      (l) =>
        svg`<path class="cq-kin-${l.kind} ${l.mods.join(" ")}" d=${l.d} stroke-dasharray=${l.dash} />`,
    )}
  </svg>`;
}

/** The chart in its window, with the tools in the corner. */
export function kinView(m: KinViewModel): TemplateResult {
  const v = (views[m.mode] ??= { x: 0, y: 0, k: 1, key: "" });
  const { w, h } = chartSize(m.t, m.dims);

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
      if (hit) m.onOpen(Number(hit.dataset.c));
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
    if (v.key !== m.key) {
      v.key = m.key;
      // Measured once it's laid out.
      requestAnimationFrame(() => {
        fit(m, vp, v, m.fitAll);
        apply(vp, v);
      });
    }
  };

  return html`<div
    class="cq-kin-view ${m.cls}"
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
      ${chartSvg(m.t, m.dims)} ${m.body}
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
          fit(m, el, v, true);
          apply(el, v);
        })}
      >
        All
      </button>
      <button
        class="cq-kin-tool wide"
        title=${m.focusTitle}
        @click=${tool((el) => {
          fit(m, el, v, false);
          apply(el, v);
        })}
      >
        ${m.focusLabel}
      </button>
    </div>
  </div>`;
}
