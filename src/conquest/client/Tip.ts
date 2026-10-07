// Tooltips that explain a number: point at (or tap, or tab to) any figure
// and a slip of paper lists what made it, line by line.

import { html, TemplateResult } from "lit";
import type { Breakdown } from "../engine/Types";

export interface TipContent {
  title: string;
  /** A breakdown to list, and how to show its values. */
  b?: Breakdown;
  fmt?: (v: number) => string;
  /** Extra plain lines under the list. */
  notes?: string[];
}

let tipEl: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;

function ensureTip(): HTMLDivElement {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "cq-tip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  document.addEventListener("pointerdown", (e) => {
    if (owner && !owner.contains(e.target as Node)) hideTip();
  });
  window.addEventListener("scroll", hideTip, true);
  return tipEl;
}

const signed = (v: number, fmt: (v: number) => string) =>
  v > 0 ? `+${fmt(v)}` : fmt(v);

export const plain = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Math.abs(r) >= 100 ? Math.round(r).toLocaleString("en-US") : String(r);
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;

function render(c: TipContent): string {
  const esc = (t: string) =>
    t.replace(
      /[&<>"]/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!,
    );
  const fmt = c.fmt ?? plain;
  let out = `<div class="cq-tip-title">${esc(c.title)}</div>`;
  if (c.b) {
    out += `<table class="cq-tip-list">`;
    for (const p of c.b.parts) {
      const v = p.mul
        ? `×${Math.round(p.value * 100) / 100}`
        : signed(p.value, fmt);
      const cls = p.mul
        ? p.value >= 1
          ? "up"
          : "down"
        : p.value >= 0
          ? "up"
          : "down";
      out += `<tr><td>${esc(p.label)}</td><td class="${cls}">${esc(v)}</td></tr>`;
    }
    out += `<tr class="cq-tip-total"><td>Total</td><td>${esc(fmt(c.b.total))}</td></tr></table>`;
  }
  for (const n of c.notes ?? []) out += `<p>${esc(n)}</p>`;
  return out;
}

export function showTip(el: HTMLElement, c: TipContent): void {
  const t = ensureTip();
  owner = el;
  t.innerHTML = render(c);
  t.hidden = false;
  const r = el.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
  let y = r.bottom + 8;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function hideTip(): void {
  if (tipEl) tipEl.hidden = true;
  owner = null;
}

/**
 * A number with its explanation. `content` is a function so the breakdown
 * is only worked out when someone looks.
 */
export function num(
  text: string | number | TemplateResult,
  content: () => TipContent,
  cls = "",
): TemplateResult {
  const open = (e: Event) => showTip(e.currentTarget as HTMLElement, content());
  return html`<span
    class="cq-num ${cls}"
    tabindex="0"
    @pointerenter=${(e: PointerEvent) => e.pointerType === "mouse" && open(e)}
    @pointerleave=${(e: PointerEvent) => e.pointerType === "mouse" && hideTip()}
    @click=${(e: Event) => {
      e.stopPropagation();
      if (owner === e.currentTarget) hideTip();
      else open(e);
    }}
    @focus=${open}
    @blur=${hideTip}
    >${text}</span
  >`;
}
