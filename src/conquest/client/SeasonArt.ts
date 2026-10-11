// MAP (r12): the season's marks. Its sign by the date (a snowflake, a
// sprouting shoot, the sun, a falling leaf, and the hurricane's whirl in
// its season), and the hurricanes themselves, wheeling across the
// Caribbean and the Gulf from August to October. The same storms on
// every screen: their tracks come from the year alone.

import { html, svg, TemplateResult } from "lit";
import { dayOf } from "../engine/Calendar";

/** The season's sign, as a small inline picture. */
export function seasonIcon(icon: string): TemplateResult {
  const body = (() => {
    switch (icon) {
      case "winter":
        return svg`<g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none">
          <path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5" />
          <path d="M6.3 2.6 8 4.2l1.7-1.6M6.3 13.4 8 11.8l1.7 1.6M2.6 7l2.3.7-.6 2.3M13.4 9l-2.3-.7.6-2.3M2.6 9l2.3-.7-.6-2.3M13.4 7l-2.3.7.6 2.3" stroke-width="1"/>
        </g>`;
      case "spring":
        return svg`<g fill="currentColor">
          <path d="M8 15c-.4 0-.7-.3-.7-.7V8.4h1.4v5.9c0 .4-.3.7-.7.7z"/>
          <path d="M7.6 9C4.2 9 2 6.9 2 3.6 5.4 3.6 7.6 5.7 7.6 9z"/>
          <path d="M8.4 7.6c0-3.3 2.2-5.4 5.6-5.4 0 3.3-2.2 5.4-5.6 5.4z" opacity=".75"/>
        </g>`;
      case "summer":
        return svg`<g stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
          <circle cx="8" cy="8" r="3.2" fill="currentColor" stroke="none"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/>
        </g>`;
      case "hurricane":
        return svg`<g fill="currentColor">
          <path d="M8 6.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z"/>
          <path d="M9.6 1.5C6.2.8 2.4 2.9 2 6.6c1.2-1.9 3.4-2.6 5.4-2.3l2.2-2.8z"/>
          <path d="M6.4 14.5c3.4.7 7.2-1.4 7.6-5.1-1.2 1.9-3.4 2.6-5.4 2.3l-2.2 2.8z"/>
        </g>`;
      default:
        // Autumn: a falling leaf.
        return svg`<g fill="currentColor">
          <path d="M13.8 2.2C8.5 1.6 3.4 4 2.6 9.2c-.2 1.3 0 2.5.4 3.6L1.6 14.4l.9.7 1.3-1.5c1.1.5 2.4.7 3.6.5C12.6 13.2 14.6 7.6 13.8 2.2zM5 12.6l5.6-6.2-.8-.6-5.4 6.1c-.2-.5-.3-1.1-.2-1.7"/>
        </g>`;
    }
  })();
  return html`<svg
    class="cq-season-icon"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    ${body}
  </svg>`;
}

/** A hurricane on the map: where its eye is (map units), how big, which way it turns. */
export interface Storm {
  x: number;
  y: number;
  r: number;
  /** 0 to 1: how far through its life (it builds, then blows itself out). */
  age: number;
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * The hurricanes out on `day` (fractional): two to four a season, born
 * east of the Windward Islands from August to October, running west-north-
 * west through the islands and the Gulf and recurving north. Map units for
 * a map `width` units across (the Americas map is 2332).
 */
export function stormsOn(day: number, width: number): Storm[] {
  const k = width / 2332;
  const year = Math.floor(day / 365) + 1607;
  const aug1 = dayOf(year, 7, 1);
  const out: Storm[] = [];
  const n = 2 + Math.floor(hash(year * 31) * 3);
  for (let i = 0; i < n; i++) {
    const h = (j: number) => hash(year * 97 + i * 13 + j);
    const born = aug1 + Math.floor(h(1) * 80);
    const life = 7 + h(2) * 4;
    const t = day - born;
    if (t < 0 || t > life) continue;
    // East of the islands, heading west-north-west, curving north.
    const x0 = 2160 + h(3) * 90;
    const y0 = 1170 + h(4) * 90;
    const speed = 70 + h(5) * 35;
    const turn = 0.03 + h(6) * 0.05;
    let x = x0;
    let y = y0;
    let dx = -1;
    let dy = -0.18 - h(7) * 0.2;
    const steps = Math.ceil(t * 4);
    for (let s = 0; s < steps; s++) {
      const dt = Math.min(0.25, t - s * 0.25);
      const len = Math.hypot(dx, dy);
      x += (dx / len) * speed * dt;
      y += (dy / len) * speed * dt;
      // Curving north (and some recurve north-east).
      dy -= turn * dt * 4;
      if (h(8) > 0.55) dx += turn * dt * 2.5;
    }
    const age = t / life;
    const r =
      (24 + h(9) * 14) * Math.sin(Math.PI * Math.min(1, age * 1.2 + 0.1));
    out.push({ x: x * k, y: y * k, r: Math.max(8, r) * k, age });
  }
  return out;
}

/** A hurricane as charts drew the great storms: whirling arms of cloud about a clear eye. */
export function drawStorm(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spin: number,
  alpha: number,
): void {
  c.save();
  c.translate(x, y);
  c.globalAlpha = alpha;
  // A shadow of rain under it.
  const g = c.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, "rgba(40,50,60,0.25)");
  g.addColorStop(0.6, "rgba(60,70,80,0.18)");
  g.addColorStop(1, "rgba(60,70,80,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  // Three arms, wheeling anticlockwise (as the northern storms do).
  c.rotate(-spin);
  for (let a = 0; a < 3; a++) {
    c.rotate((Math.PI * 2) / 3);
    c.beginPath();
    for (let k = 0; k <= 24; k++) {
      const f = k / 24;
      const ang = f * 2.6;
      const rr = r * (0.18 + f * 0.85);
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr * 0.92;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.strokeStyle = "rgba(244,246,248,0.75)";
    c.lineWidth = Math.max(1.5, r * 0.16);
    c.lineCap = "round";
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = Math.max(0.8, r * 0.06);
    c.stroke();
  }
  // The eye.
  c.fillStyle = "rgba(30,48,58,0.55)";
  c.beginPath();
  c.arc(0, 0, Math.max(1.5, r * 0.09), 0, Math.PI * 2);
  c.fill();
  c.restore();
}
