// The end of the game: the colony as it finished, drawn as a small chart
// with the places that mattered pinned on it, how it grew year by year, and
// the timeline of its big moments.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { dateOf, formatDate } from "../../engine/Calendar";
import { nationSettlers, provincesOf } from "../../engine/Queries";
import type { GameEvent, Nation, YearMark } from "../../engine/Types";
import { flagFor } from "../Flags";
import { Geo, loadGeo, provincePaths } from "../MapView";
import { describeEvent, nationName, people } from "../Text";
import { plain } from "../Tip";
import type { GameUi } from "./Context";

/** The place an event happened, if it has one. */
function placeOf(e: GameEvent): number | null {
  switch (e.k) {
    case "colony":
    case "battle":
    case "ceded":
    case "bought":
    case "abandoned":
    case "revolt":
    case "mission":
      return e.p;
    default:
      return null;
  }
}

type Tone = "good" | "bad" | "";

function toneOf(e: GameEvent, me: number): Tone {
  switch (e.k) {
    case "colony":
    case "bought":
    case "peace":
    case "mission":
      return "good";
    case "battle": {
      const weAttacked = e.a.includes(me);
      return (e.w === 0) === weAttacked ? "good" : "bad";
    }
    case "ceded":
      return e.n === me ? "good" : "bad";
    case "tributary":
      return e.by === me ? "good" : e.free ? "good" : "bad";
    case "independence":
      return e.won === false ? "bad" : "good";
    case "war":
    case "revolt":
    case "abandoned":
    case "fallen":
      return "bad";
    default:
      return "";
  }
}

interface Moment {
  e: GameEvent;
  text: string;
  tone: Tone;
  /** Pin number on the map, for moments with a place. */
  pin: number | null;
  p: number | null;
}

function momentsOf(ui: GameUi, n: Nation): Moment[] {
  const out: Moment[] = [];
  let pin = 0;
  const seen = new Set<string>();
  for (const e of n.milestones) {
    const text = describeEvent(ui.s, ui.map, n.id, e);
    if (!text) continue;
    // The same moment can be recorded twice (both sides of a battle).
    const key = `${e.day}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = placeOf(e);
    const p = at !== null && ui.map.provinces[at] ? at : null;
    out.push({
      e,
      text,
      tone: toneOf(e, n.id),
      p,
      pin: p !== null ? ++pin : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- the chart

@customElement("cq-colony-map")
export class ColonyMap extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @property({ type: Number }) nation = -1;
  @property({ attribute: false }) moments: Moment[] = [];
  @property({ type: Number }) lit: number | null = null;
  @state() private geo: Geo | null = null;
  private paths: Path2D[] = [];

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void loadGeo().then((g) => {
      this.paths = provincePaths(g);
      this.geo = g;
    });
  }

  render(): TemplateResult {
    return html`<canvas
      class="cq-colony-canvas"
      role="img"
      aria-label="Map of the colony at the end of the game"
    ></canvas>`;
  }

  protected updated(_: PropertyValues): void {
    this.draw();
  }

  private frame(): [number, number, number, number] {
    const ui = this.ui;
    const geo = this.geo!;
    const ps = new Set<number>(provincesOf(ui.s, this.nation));
    for (const m of this.moments) if (m.p !== null) ps.add(m.p);
    const n = ui.s.nations[this.nation];
    if (ps.size === 0) return [0, 0, geo.width, geo.height];
    // The heart of the colony: far-flung posts (a fort on Hudson Bay, an
    // island in the Caribbean) are left at the edge rather than shrinking
    // everything else to fit them in.
    const xs = [...ps].map((p) => ui.map.provinces[p].x).sort((a, b) => a - b);
    const ys = [...ps].map((p) => ui.map.provinces[p].y).sort((a, b) => a - b);
    const q = (v: number[], f: number) => v[Math.round(f * (v.length - 1))];
    const span = (v: number[]): [number, number] => {
      if (v.length < 6) return [v[0], v[v.length - 1]];
      const a = q(v, 0.25);
      const b = q(v, 0.75);
      const reach = Math.max(b - a, geo.width * 0.03) * 0.9;
      return [Math.max(v[0], a - reach), Math.min(v[v.length - 1], b + reach)];
    };
    let [x0, x1] = span(xs);
    let [y0, y1] = span(ys);
    if (n.capital >= 0) {
      const c = ui.map.provinces[n.capital];
      x0 = Math.min(x0, c.x);
      x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.y);
      y1 = Math.max(y1, c.y);
    }
    // Room around it, and never so close that one province fills the frame.
    const pad = Math.max(geo.width * 0.03, (x1 - x0) * 0.12, (y1 - y0) * 0.12);
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  private draw(): void {
    const canvas = this.querySelector("canvas");
    const geo = this.geo;
    if (!canvas || !geo || !this.ui) return;
    const ui = this.ui;
    const s = ui.s;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(200, Math.round(rect.width));
    const H = Math.max(150, Math.round(rect.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the frame, keeping the map's proportions.
    const [fx0, fy0, fx1, fy1] = this.frame();
    const want = W / H;
    const fw = fx1 - fx0;
    const fh = fy1 - fy0;
    // Widen whichever way is short; only the top-left corner and the scale
    // matter after that.
    const x0 = fw / fh < want ? fx0 - (fh * want - fw) / 2 : fx0;
    const y0 = fw / fh < want ? fy0 : fy0 - (fw / want - fh) / 2;
    const k = fw / fh < want ? H / fh : W / fw;

    const sea = c.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, "#2f6577");
    sea.addColorStop(1, "#204a5a");
    c.fillStyle = sea;
    c.fillRect(0, 0, W, H);

    c.save();
    c.scale(k, k);
    c.translate(-x0, -y0);
    const me = this.nation;
    const color = s.nations[me].color;
    for (let p = 0; p < this.paths.length; p++) {
      const owner = s.provinces[p]?.owner ?? -1;
      c.fillStyle =
        owner === me
          ? color
          : owner >= 0
            ? fade(s.nations[owner].color, 0.72)
            : "#e3d6ad";
      c.fill(this.paths[p], "evenodd");
    }
    c.lineWidth = 0.6 / k;
    c.strokeStyle = "rgba(60,40,20,0.35)";
    for (const path of this.paths) c.stroke(path);
    // Your land, outlined.
    c.lineWidth = 1.6 / k;
    c.strokeStyle = "rgba(30,20,10,0.85)";
    for (const p of provincesOf(s, me)) c.stroke(this.paths[p]);
    c.restore();

    const at = (p: number): [number, number] => {
      const d = ui.map.provinces[p];
      return [(d.x - x0) * k, (d.y - y0) * k];
    };

    // The capital.
    const cap = s.nations[me].capital;
    if (cap >= 0 && s.provinces[cap]?.owner === me) {
      const [x, y] = at(cap);
      star(c, x, y, 7);
    }

    // Pins for the moments, later ones on top; several at one place share it.
    const byPlace = new Map<number, Moment[]>();
    for (const m of this.moments)
      if (m.p !== null) byPlace.set(m.p, [...(byPlace.get(m.p) ?? []), m]);
    c.font = "600 10px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const [p, list] of byPlace) {
      const [x, y] = at(p);
      const lit = list.some((m) => m.pin === this.lit);
      const last = list[list.length - 1];
      const label = list.length === 1 ? String(last.pin) : `${list[0].pin}+`;
      const r = lit ? 10 : 8;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle =
        last.tone === "bad"
          ? "#8c2f22"
          : last.tone === "good"
            ? "#2f5a2a"
            : "#4a3b28";
      c.fill();
      c.lineWidth = lit ? 2.5 : 1.5;
      c.strokeStyle = lit ? "#f6d77a" : "#f4ead0";
      c.stroke();
      c.fillStyle = "#fbf4e1";
      c.fillText(label, x, y + 0.5);
    }
  }
}

function fade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const paper = [227, 214, 173];
  const m = rgb.map((v, i) => Math.round(v * (1 - amount) + paper[i] * amount));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = "#f6d77a";
  c.fill();
  c.lineWidth = 1.2;
  c.strokeStyle = "#3a2a14";
  c.stroke();
}

// ---------------------------------------------------------------- growth

function spark(
  label: string,
  years: YearMark[],
  pick: (y: YearMark) => number,
  fmt: (v: number) => string,
  last: number,
): TemplateResult {
  const vals = [...years.map(pick), last];
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const W = 160;
  const H = 40;
  const pts = vals
    .map((v, i) => {
      const x = vals.length === 1 ? W : (i / (vals.length - 1)) * W;
      const y = H - ((v - lo) / (hi - lo)) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = vals[0];
  return html`<figure class="cq-spark">
    <figcaption>${label}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="0,${H} ${pts} ${W},${H}" class="area" />
      <polyline points=${pts} class="line" />
    </svg>
    <p><span class="cq-muted">${fmt(first)} →</span> <b>${fmt(last)}</b></p>
  </figure>`;
}

// ---------------------------------------------------------------- the story

@customElement("cq-colony-story")
export class ColonyStory extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @property({ type: Number }) nation = -1;
  @state() private lit: number | null = null;

  createRenderRoot() {
    return this;
  }

  render(): TemplateResult {
    const ui = this.ui;
    if (!ui || this.nation < 0) return html``;
    const s = ui.s;
    const n = s.nations[this.nation];
    const moments = momentsOf(ui, n);
    const startYear = dateOf(s.startDay).year;
    const endYear = dateOf(s.day).year;
    const provinces = provincesOf(s, n.id).length;
    const settlers = Math.round(nationSettlers(s, n.id));
    const started = n.stats.startProvinces ?? 0;
    return html`<section class="cq-story">
      <header class="cq-story-head">
        ${flagFor(n, "cq-flag lg")}
        <div>
          <h3 class="cq-h2">
            ${nationName(n.name)}, ${startYear} to ${endYear}
          </h3>
          <p class="cq-muted">
            ${n.alive
              ? html`Began with ${started} province${started === 1 ? "" : "s"}
                  and ended with <b>${provinces}</b>, home to
                  ${people(settlers)}.`
              : html`The colony did not survive to the end.`}
          </p>
        </div>
      </header>
      <div class="cq-story-cols">
        <div class="cq-story-map">
          <cq-colony-map
            .ui=${ui}
            .nation=${n.id}
            .moments=${moments}
            .lit=${this.lit}
          ></cq-colony-map>
          ${n.yearly.length
            ? html`<div class="cq-sparks">
                ${spark(
                  "Provinces",
                  n.yearly,
                  (y) => y.provinces,
                  (v) => String(v),
                  provinces,
                )}
                ${spark(
                  "Settlers",
                  n.yearly,
                  (y) => y.settlers,
                  (v) => people(v),
                  settlers,
                )}
                ${spark(
                  "Treasury",
                  n.yearly,
                  (y) => y.gold,
                  (v) => plain(v),
                  Math.round(n.gold),
                )}
                ${spark(
                  "Score",
                  n.yearly,
                  (y) => y.score,
                  (v) => String(v),
                  n.score,
                )}
              </div>`
            : nothing}
        </div>
        <ol class="cq-timeline" aria-label="The colony's big moments">
          ${moments.length === 0
            ? html`<li class="cq-muted">A quiet history.</li>`
            : moments.map(
                (m) =>
                  html`<li
                    class="${m.tone} ${m.pin !== null && m.pin === this.lit
                      ? "lit"
                      : ""}"
                    @mouseenter=${() => (this.lit = m.pin)}
                    @mouseleave=${() => (this.lit = null)}
                    @focusin=${() => (this.lit = m.pin)}
                  >
                    <time>${formatDate(m.e.day)}</time>
                    ${m.pin !== null
                      ? html`<span class="cq-pin ${m.tone}">${m.pin}</span>`
                      : nothing}
                    <span>${m.text}</span>
                  </li>`,
              )}
        </ol>
      </div>
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-colony-map": ColonyMap;
    "cq-colony-story": ColonyStory;
  }
}
