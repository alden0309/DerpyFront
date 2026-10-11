// The story of a life (or a line of them): the roads they travelled drawn on
// a small chart with the places that mattered pinned on it, what they came
// to, and the timeline of their big moments, generation by generation.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { dateOf, formatDate } from "../../engine/Calendar";
import { lifeIsNative, lifeScore } from "../../engine/LifeQueries";
import { JOBS } from "../../engine/LifeRules";
import { charName } from "../../engine/Queries";
import type { Character, Life, LifeMilestone } from "../../engine/Types";
import { arms } from "../Arms";
import { Geo, loadGeo, provincePaths } from "../MapView";
import type { GameUi } from "./Context";
import { token } from "./Context";

type Tone = "good" | "bad" | "";

function toneOf(m: LifeMilestone): Tone {
  if (m.kind === "died" || m.kind === "wounded" || m.kind === "convicted")
    return "bad";
  if (m.kind === "battle") return m.text.startsWith("Lost") ? "bad" : "good";
  if (m.kind === "rising")
    return /crushed|hanged|failed/i.test(m.text) ? "bad" : "good";
  if (
    m.kind === "promoted" ||
    m.kind === "married" ||
    m.kind === "child" ||
    m.kind === "office" ||
    m.kind === "renown"
  )
    return "good";
  return "";
}

interface Moment {
  m: LifeMilestone;
  tone: Tone;
  pin: number | null;
}

function momentsOf(life: Life): Moment[] {
  let pin = 0;
  return life.milestones.map((m) => ({
    m,
    tone: toneOf(m),
    pin: m.p !== undefined ? ++pin : null,
  }));
}

/** A colour for each generation's road. */
const ROADS = [
  "#8c2f22",
  "#2f4f7a",
  "#2f5a2a",
  "#7a4f8c",
  "#9a6a1a",
  "#1f6a6a",
];

// ---------------------------------------------------------------- the chart

@customElement("cq-life-map")
export class LifeMap extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @property({ attribute: false }) life!: Life;
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
      aria-label="Map of the roads travelled"
    ></canvas>`;
  }

  protected updated(_: PropertyValues): void {
    this.draw();
  }

  private frame(): [number, number, number, number] {
    const ui = this.ui;
    const geo = this.geo!;
    const ps = new Set<number>(this.life.trail.map((t) => t.p));
    for (const m of this.moments) if (m.m.p !== undefined) ps.add(m.m.p);
    if (ps.size === 0) return [0, 0, geo.width, geo.height];
    const xs = [...ps].map((p) => ui.map.provinces[p].x);
    const ys = [...ps].map((p) => ui.map.provinces[p].y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const pad = Math.max(geo.width * 0.04, (x1 - x0) * 0.15, (y1 - y0) * 0.15);
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  private draw(): void {
    const canvas = this.querySelector("canvas");
    const geo = this.geo;
    if (!canvas || !geo || !this.ui || !this.life) return;
    const ui = this.ui;
    const s = ui.s;
    const life = this.life;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(200, Math.round(rect.width));
    const H = Math.max(150, Math.round(rect.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const [fx0, fy0, fx1, fy1] = this.frame();
    const want = W / H;
    const fw = fx1 - fx0;
    const fh = fy1 - fy0;
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
    const visited = new Set(life.visited);
    for (let p = 0; p < this.paths.length; p++) {
      const owner = s.provinces[p]?.owner ?? -1;
      const base = owner >= 0 ? s.nations[owner].color : "#e3d6ad";
      c.fillStyle = fade(base, visited.has(p) ? 0.45 : 0.75);
      c.fill(this.paths[p], "evenodd");
    }
    c.lineWidth = 0.6 / k;
    c.strokeStyle = "rgba(60,40,20,0.35)";
    for (const path of this.paths) c.stroke(path);
    c.restore();

    const at = (p: number): [number, number] => {
      const d = ui.map.provinces[p];
      return [(d.x - x0) * k, (d.y - y0) * k];
    };

    // The roads, one colour per generation, dashed like a chart's track.
    const gens = life.line;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.setLineDash([6, 4]);
    for (let i = 1; i < life.trail.length; i++) {
      const a = life.trail[i - 1];
      const b = life.trail[i];
      if (a.p === b.p) continue;
      const gen = Math.max(0, gens.indexOf(b.c));
      c.strokeStyle = ROADS[gen % ROADS.length];
      c.lineWidth = 2.2;
      const [ax, ay] = at(a.p);
      const [bx, by] = at(b.p);
      c.beginPath();
      c.moveTo(ax, ay);
      // A gentle curve, so out-and-back roads don't overlap exactly.
      const mx = (ax + bx) / 2 + (by - ay) * 0.12;
      const my = (ay + by) / 2 - (bx - ax) * 0.12;
      c.quadraticCurveTo(mx, my, bx, by);
      c.stroke();
    }
    c.setLineDash([]);

    // Home: a small house mark where the line lived.
    if (life.home >= 0 && ui.map.provinces[life.home]) {
      const [hx, hy] = at(life.home);
      c.fillStyle = "#f6d77a";
      c.strokeStyle = "#3a2a14";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(hx - 6, hy + 5);
      c.lineTo(hx - 6, hy - 1);
      c.lineTo(hx, hy - 7);
      c.lineTo(hx + 6, hy - 1);
      c.lineTo(hx + 6, hy + 5);
      c.closePath();
      c.fill();
      c.stroke();
    }

    // Pins for the moments; several at one place share it.
    const byPlace = new Map<number, Moment[]>();
    for (const m of this.moments)
      if (m.m.p !== undefined)
        byPlace.set(m.m.p, [...(byPlace.get(m.m.p) ?? []), m]);
    c.font = "600 10px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const [p, list] of byPlace) {
      if (!ui.map.provinces[p]) continue;
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

// ---------------------------------------------------------------- the story

@customElement("cq-life-story")
export class LifeStory extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @property({ attribute: false }) life!: Life;
  @state() private lit: number | null = null;

  createRenderRoot() {
    return this;
  }

  render(): TemplateResult {
    const ui = this.ui;
    const life = this.life;
    if (!ui || !life) return html``;
    const s = ui.s;
    const moments = momentsOf(life);
    const people = life.line
      .map((id) => s.chars[id])
      .filter((c): c is Character => !!c);
    const first = people[0];
    const last = people[people.length - 1];
    const from = first
      ? dateOf(Math.max(first.born, life.joined)).year
      : dateOf(life.joined).year;
    const to = dateOf(s.day).year;
    const t = life.tally;
    const native = lifeIsNative(s, life);
    const family = first?.family ?? life.name;
    const facts: string[] = [];
    if (t.generations > 1) facts.push(`${t.generations} generations`);
    const years = Math.round(t.days / 365);
    if (years > 0) facts.push(`${years} year${years === 1 ? "" : "s"} lived`);
    if (t.provinces)
      facts.push(`${t.provinces} place${t.provinces === 1 ? "" : "s"} seen`);
    if (t.jobs)
      facts.push(
        `${t.jobs} trade${t.jobs === 1 ? "" : "s"}, ${t.promotions} promotion${t.promotions === 1 ? "" : "s"}`,
      );
    if (t.marriages)
      facts.push(
        `${t.marriages} marriage${t.marriages === 1 ? "" : "s"}, ${t.children} child${t.children === 1 ? "" : "ren"}`,
      );
    if (t.battles)
      facts.push(
        `${t.battles} battle${t.battles === 1 ? "" : "s"} (${t.battlesWon} won)`,
      );
    if (t.elections)
      facts.push(`${t.elections} election${t.elections === 1 ? "" : "s"} won`);
    if (t.risings)
      facts.push(`${t.risings} rising${t.risings === 1 ? "" : "s"}`);
    facts.push(`renown at its height ${Math.round(t.peakRenown)}`);
    facts.push(`${Math.round(t.earned)} coins earned`);
    const OFFICE = [
      "",
      "sat in an assembly",
      "sat on a council",
      native ? "led their people" : "governed a colony",
    ];
    return html`<section class="cq-story">
      <header class="cq-story-head">
        <span class="cq-story-arms"
          >${arms(life.sigil, "cq-arms", native, "Arms")}</span
        >
        <div>
          <h3 class="cq-h2">
            The ${family} ${people.length > 1 ? "line" : "story"}, ${from} to
            ${to}
          </h3>
          ${life.motto
            ? html`<p class="cq-motto">“${life.motto}”</p>`
            : nothing}
          <p class="cq-muted small">
            ${facts.join("; ")}.
            ${t.topOffice > 0
              ? html`At the height of it, they <b>${OFFICE[t.topOffice]}</b>.`
              : nothing}
            ${t.europe ? html`In the end, <b>Europe</b>.` : nothing} Score
            ${lifeScore(s, life)}.
          </p>
        </div>
      </header>
      <ol class="cq-generations" aria-label="The generations">
        ${people.map(
          (c, i) =>
            html`<li>
              ${token(ui, c, "small")}
              <span>
                <b style="color:${ROADS[i % ROADS.length]}">${charName(c)}</b>
                <span class="cq-muted small">
                  ${dateOf(c.born).year}–${c.alive
                    ? c.abroad
                      ? "to Europe"
                      : ""
                    : dateOf(c.died?.day ?? s.day).year}
                  ${c.died ? `: ${c.died.cause}` : ""}
                </span>
              </span>
            </li>`,
        )}
      </ol>
      <div class="cq-story-cols">
        <div class="cq-story-map">
          <cq-life-map
            .ui=${ui}
            .life=${life}
            .moments=${moments}
            .lit=${this.lit}
          ></cq-life-map>
          <p class="cq-muted small">
            Dashed: the roads travelled, a colour for each generation. The house
            is home; the pins are the moments listed beside it.
          </p>
        </div>
        <ol class="cq-timeline" aria-label="The big moments">
          ${moments.length === 0
            ? html`<li class="cq-muted">A quiet life.</li>`
            : moments.map((m, i) => {
                const prev = moments[i - 1];
                const head =
                  people.length > 1 &&
                  (!prev || prev.m.c !== m.m.c) &&
                  s.chars[m.m.c]
                    ? html`<li class="cq-journal-who">
                        ${charName(s.chars[m.m.c])}
                      </li>`
                    : nothing;
                return html`${head}
                  <li
                    class="${m.tone} ${m.pin !== null && m.pin === this.lit
                      ? "lit"
                      : ""}"
                    @mouseenter=${() => (this.lit = m.pin)}
                    @mouseleave=${() => (this.lit = null)}
                    @focusin=${() => (this.lit = m.pin)}
                  >
                    <time>${formatDate(m.m.day)}</time>
                    ${m.pin !== null
                      ? html`<span class="cq-pin ${m.tone}">${m.pin}</span>`
                      : nothing}
                    <span>${m.m.text}</span>
                  </li>`;
              })}
        </ol>
      </div>
      ${last && life.job && !life.watching
        ? html`<p class="cq-muted small">
            Last seen as
            ${JOBS[life.job.kind].ranks[life.job.rank].title.toLowerCase()}.
          </p>`
        : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-life-map": LifeMap;
    "cq-life-story": LifeStory;
  }
}
