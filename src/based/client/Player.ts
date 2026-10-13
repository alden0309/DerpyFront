// Mr. Based's player: one chapter, from a save or a checkpoint, drawn as a
// film. Full-screen graded pictures that drift, text that types in, framed
// portraits, choices against the clock, rooms to read, and the small
// reminders that people will remember what he said.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  Beat,
  chapterStart,
  InvestigateBeat,
  Snapshot,
  Stage,
  StoryEvent,
  StoryRun,
} from "../engine/Runtime";
import { Chapter } from "../engine/Types";
import { Credit, leaveNote, mediaNow, notesFor, WriterNote } from "./Api";
import { CPS, Prefs, savePrefs, TextSpeed } from "./Prefs";
import { Ambience } from "./Sound";

export interface PlayerHost {
  /** A scene began: save here. `checkpoint` when it's one to replay from. */
  scene(snap: Snapshot, history: string[], checkpoint?: string): void;
  /** An option was taken (or the clock took one). */
  pick(choice: string, option: string, history: string[]): void;
  /** A spot noticed or a deduction made. */
  found(id: string): void;
  /** The chapter is over. */
  end(run: StoryRun): void;
  /** Back to the title screen, or to chapter select. */
  quit(to: "title" | "chapters"): void;
}

interface Layer {
  id: number;
  key: string;
}

interface Toast {
  id: number;
  text: string;
  kind: "remember" | "rel" | "checkpoint";
}

interface LogLine {
  who?: string;
  text: string;
  kind: string;
}

type Overlay = null | "menu" | "note" | "settings" | "log" | "credits";

let nextId = 1;

/** "*word*" becomes emphasis; returns [text, emphasised] runs. */
function runs(text: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push([text.slice(last, m.index), false]);
    out.push([m[1], true]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push([text.slice(last), false]);
  return out;
}

export function plainText(text: string): string {
  return runs(text)
    .map(([t]) => t)
    .join("");
}

/** The text typed so far, with the rest kept invisible so nothing reflows. */
function typed(text: string, shown: number): TemplateResult {
  let left = shown;
  return html`${runs(text).map(([t, em]) => {
    const a = t.slice(0, Math.max(0, left));
    const b = t.slice(Math.max(0, left));
    left -= t.length;
    const inner = html`${a}${b
      ? html`<span class="mb-ghost">${b}</span>`
      : nothing}`;
    return em ? html`<em>${inner}</em>` : inner;
  })}`;
}

@customElement("based-player")
export class BasedPlayer extends LitElement {
  @property({ attribute: false }) chapter!: Chapter;
  @property({ attribute: false }) from: Snapshot | null = null;
  @property({ attribute: false }) carried: {
    flags: Record<string, number>;
    rels: Record<string, number>;
  } | null = null;
  @property({ attribute: false }) host!: PlayerHost;
  @property({ attribute: false }) prefs!: Prefs;
  @property({ attribute: false }) ambience!: Ambience;
  @property({ attribute: false }) credits: Credit[] = [];

  @state() private beat: Beat = { kind: "end" };
  @state() private stage: Stage = {
    backdrop: null,
    figure: null,
    ambient: null,
    news: null,
  };
  @state() private layers: Layer[] = [];
  @state() private shown = 0;
  @state() private toasts: Toast[] = [];
  @state() private timeLeft = 0;
  @state() private overlay: Overlay = null;
  @state() private sceneLabel = "";
  @state() private noteText = "";
  @state() private noteState: "idle" | "saving" | "saved" | "failed" = "idle";
  @state() private notes: WriterNote[] = [];
  @state() private size = { w: window.innerWidth, h: window.innerHeight };

  private run!: StoryRun;
  private log: LogLine[] = [];
  private typeStart = 0;
  private typeFrame = 0;
  private timerFrame = 0;
  private timerEnd = 0;
  private pausedLeft = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.run = new StoryRun(
      this.chapter,
      this.from ?? chapterStart(this.chapter, this.carried ?? undefined),
    );
    this.afterStep();
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    cancelAnimationFrame(this.typeFrame);
    cancelAnimationFrame(this.timerFrame);
    super.disconnectedCallback();
  }

  // --- stepping ------------------------------------------------------------

  private afterStep(): void {
    for (const e of this.run.drain()) this.onEvent(e);
    this.syncStage();
    const b = this.run.beat;
    this.beat = b;
    cancelAnimationFrame(this.timerFrame);
    if (b.kind === "line") {
      this.log.push({ who: b.who, text: plainText(b.text), kind: b.line });
      if (this.log.length > 300) this.log.shift();
      this.startTyping();
    } else if (b.kind === "choice") {
      this.startTimer(b.timer);
    } else if (b.kind === "end") {
      this.host.end(this.run);
    }
  }

  private onEvent(e: StoryEvent): void {
    if (e.type === "scene") {
      this.sceneLabel = e.label;
      this.host.scene(this.run.snapshot(), this.run.history(), e.checkpoint);
      if (e.checkpoint)
        this.toast(`Checkpoint · ${e.checkpoint}`, "checkpoint");
    } else if (e.type === "remember") {
      this.toast(`${this.nameOf(e.who)} will remember that.`, "remember");
    } else if (e.type === "rel") {
      const name = this.nameOf(e.who);
      const text =
        e.delta >= 2
          ? `${name} trusts you more.`
          : e.delta > 0
            ? `${name} warms to you.`
            : e.delta <= -2
              ? `${name} trusts you less.`
              : `${name} cools.`;
      this.toast(text, "rel");
    }
  }

  private nameOf(who: string): string {
    return this.chapter.cast.find((c) => c.id === who)?.name ?? who;
  }

  private toast(text: string, kind: Toast["kind"]): void {
    const t = { id: nextId++, text, kind };
    this.toasts = [...this.toasts.filter((x) => x.kind !== kind), t];
    window.setTimeout(
      () => (this.toasts = this.toasts.filter((x) => x.id !== t.id)),
      kind === "remember" ? 4200 : 3000,
    );
  }

  private syncStage(): void {
    const s = this.run.stage;
    if (s.backdrop !== this.stage.backdrop && s.backdrop !== null) {
      const layer = { id: nextId++, key: s.backdrop };
      this.layers = [...this.layers, layer];
      window.setTimeout(() => {
        this.layers = this.layers.filter(
          (l) => l.id === layer.id || l.id > layer.id,
        );
      }, 1400);
    } else if (s.backdrop === null && this.stage.backdrop !== null) {
      this.layers = [];
    }
    if (s.ambient !== this.stage.ambient) void this.ambience.play(s.ambient);
    this.stage = s;
  }

  private startTyping(): void {
    cancelAnimationFrame(this.typeFrame);
    const b = this.beat;
    if (b.kind !== "line") return;
    const len = plainText(b.text).length;
    const cps = CPS[this.prefs.speed];
    if (cps === 0) {
      this.shown = len;
      return;
    }
    this.shown = 0;
    this.typeStart = performance.now();
    const tick = (now: number) => {
      this.shown = Math.min(
        len,
        Math.floor(((now - this.typeStart) / 1000) * cps),
      );
      if (this.shown < len) this.typeFrame = requestAnimationFrame(tick);
    };
    this.typeFrame = requestAnimationFrame(tick);
  }

  private get typing(): boolean {
    const b = this.beat;
    return b.kind === "line" && this.shown < plainText(b.text).length;
  }

  private startTimer(seconds: number): void {
    cancelAnimationFrame(this.timerFrame);
    if (!this.prefs.timers || seconds <= 0) {
      this.timeLeft = 0;
      return;
    }
    this.timerEnd = performance.now() + seconds * 1000;
    this.timeLeft = seconds;
    this.tickTimer();
  }

  private tickTimer = () => {
    if (this.overlay !== null) return;
    const left = (this.timerEnd - performance.now()) / 1000;
    this.timeLeft = Math.max(0, left);
    if (left <= 0) {
      this.timeout();
      return;
    }
    this.timerFrame = requestAnimationFrame(this.tickTimer);
  };

  private pauseTimer(): void {
    if (this.beat.kind === "choice" && this.timeLeft > 0) {
      cancelAnimationFrame(this.timerFrame);
      this.pausedLeft = this.timeLeft;
    }
  }

  private resumeTimer(): void {
    if (this.beat.kind === "choice" && this.pausedLeft > 0) {
      this.timerEnd = performance.now() + this.pausedLeft * 1000;
      this.pausedLeft = 0;
      this.tickTimer();
    }
  }

  private advance(): void {
    this.ambience.unlock();
    if (this.overlay !== null) return;
    const b = this.beat;
    if (b.kind === "line") {
      if (this.typing) {
        cancelAnimationFrame(this.typeFrame);
        this.shown = plainText(b.text).length;
        return;
      }
      this.run.advance();
      this.afterStep();
    } else if (b.kind === "card") {
      this.run.advance();
      this.afterStep();
    }
  }

  private choose(id: string): void {
    this.ambience.unlock();
    const b = this.beat;
    if (b.kind !== "choice") return;
    cancelAnimationFrame(this.timerFrame);
    this.timeLeft = 0;
    this.run.choose(id);
    this.host.pick(b.id, id, this.run.history());
    this.afterStep();
  }

  private timeout(): void {
    const b = this.beat;
    if (b.kind !== "choice") return;
    const pick = b.options.find((o) => o.silent) ?? b.options[0];
    if (pick.silent) this.toast("The moment passed. You said nothing.", "rel");
    this.choose(pick.id);
  }

  private examine(id: string): void {
    this.ambience.unlock();
    this.run.examine(id);
    this.host.found(id);
    this.afterStep();
  }

  private deduce(id: string): void {
    this.run.deduce(id);
    this.host.found(id);
    this.afterStep();
  }

  private leave(): void {
    this.run.leave();
    this.afterStep();
  }

  // --- input ---------------------------------------------------------------

  private onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
    ) {
      if (e.key === "Escape") this.closeOverlay();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.overlay !== null) this.closeOverlay();
      else this.openOverlay("menu");
      return;
    }
    if (this.overlay !== null) return;
    const b = this.beat;
    if (e.key === " " || e.key === "Enter") {
      if (b.kind === "line" || b.kind === "card") {
        e.preventDefault();
        this.advance();
      }
    } else if (/^[1-9]$/.test(e.key) && b.kind === "choice") {
      const opt = b.options[Number(e.key) - 1];
      if (opt) this.choose(opt.id);
    } else if (e.key === "n" || e.key === "N") {
      this.openOverlay("note");
    }
  };

  private onResize = () => {
    this.size = { w: window.innerWidth, h: window.innerHeight };
  };

  private openOverlay(o: Overlay): void {
    if (this.overlay === null) this.pauseTimer();
    this.overlay = o;
    if (o === "note") {
      this.noteState = "idle";
      this.notes = [];
      void notesFor(this.chapter.n, this.run.sceneId)
        .then((n) => (this.notes = n))
        .catch(() => {});
    }
  }

  private closeOverlay(): void {
    this.overlay = null;
    this.resumeTimer();
  }

  private async saveNote(): Promise<void> {
    const note = this.noteText.trim();
    if (!note) return;
    this.noteState = "saving";
    const b = this.beat;
    const line =
      b.kind === "line"
        ? `${b.who ? `${b.who}: ` : b.line === "think" ? "~ " : ""}${plainText(b.text)}`
        : b.kind === "choice"
          ? `[choice] ${b.prompt} ${b.options.map((o) => `[${o.label}]`).join(" ")}`
          : b.kind === "investigate"
            ? `[investigate] ${b.title}`
            : b.kind === "card"
              ? `[card] ${b.title}`
              : "";
    try {
      await leaveNote({
        chapter: this.chapter.n,
        scene: this.run.sceneId,
        line,
        path: this.run.history(),
        note,
      });
      this.noteState = "saved";
      this.noteText = "";
      this.notes = await notesFor(this.chapter.n, this.run.sceneId).catch(
        () => this.notes,
      );
    } catch {
      this.noteState = "failed";
    }
  }

  private setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
    this.prefs = { ...this.prefs, [k]: v };
    savePrefs(this.prefs);
    this.ambience.setVolume(this.prefs.volume, !this.prefs.sound);
  }

  // --- drawing -------------------------------------------------------------

  render(): TemplateResult {
    const b = this.beat;
    const looking = b.kind === "investigate";
    const narrow = this.size.w / this.size.h < 1.05;
    return html`<div
      class="mb-stage ${looking ? "looking" : ""} ${narrow ? "narrow" : ""}"
      @click=${(e: MouseEvent) => {
        if (
          (e.target as HTMLElement).closest(
            "button, a, textarea, input, .mb-panel",
          )
        ) {
          return;
        }
        this.advance();
      }}
    >
      ${looking ? this.renderLook(b) : this.renderBackdrop()}
      <div class="mb-grain" aria-hidden="true"></div>
      <div class="mb-bars" aria-hidden="true"></div>
      ${this.stage.news && !looking
        ? this.renderNews(this.stage.news)
        : nothing}
      ${!looking ? this.renderFigure() : nothing}
      <div class="mb-toasts" aria-live="polite">
        ${this.toasts.map(
          (t) =>
            html`<div class="mb-toast ${t.kind}">
              ${t.kind === "remember"
                ? html`<span class="mb-toast-mark"></span>`
                : nothing}${t.text}
            </div>`,
        )}
      </div>
      ${this.renderHud()} ${b.kind === "line" ? this.renderLine(b) : nothing}
      ${b.kind === "choice" ? this.renderChoice(b) : nothing}
      ${b.kind === "card"
        ? html`<div class="mb-card">
            <div class="mb-card-title">${b.title}</div>
            ${b.sub ? html`<div class="mb-card-sub">${b.sub}</div>` : nothing}
            <div class="mb-hint">Tap to continue</div>
          </div>`
        : nothing}
      ${this.overlay ? this.renderOverlay(this.overlay) : nothing}
    </div>`;
  }

  private renderBackdrop(): TemplateResult {
    return html`<div class="mb-backdrop">
      ${this.layers.map((l) => {
        const url = mediaNow("art", l.key);
        return html`<div class="mb-layer" data-key=${l.key}>
          ${url ? html`<img src=${url} alt="" draggable="false" />` : nothing}
        </div>`;
      })}
    </div>`;
  }

  private renderNews(text: string): TemplateResult {
    return html`<div class="mb-news">
      <span class="mb-news-tag">EN DIRECT</span>
      <span class="mb-news-crawl"><span>${text}</span></span>
    </div>`;
  }

  private renderFigure(): TemplateResult | typeof nothing {
    const who = this.stage.figure;
    if (!who) return nothing;
    const c = this.chapter.cast.find((m) => m.id === who);
    const url = c?.portrait ? mediaNow("art", c.portrait) : null;
    if (!c || !url) return nothing;
    const b = this.beat;
    const speaking = b.kind === "line" && b.who === who;
    return html`<figure
      class="mb-figure ${speaking ? "speaking" : ""}"
      data-who=${who}
    >
      <div class="mb-figure-frame">
        <img src=${url} alt="" draggable="false" />
      </div>
      <figcaption>${c.name}</figcaption>
    </figure>`;
  }

  private renderHud(): TemplateResult {
    return html`<div class="mb-hud">
      <div class="mb-where">
        <span class="mb-where-ch">Chapter ${this.chapter.n}</span>
        <span class="mb-where-scene">${this.sceneLabel}</span>
      </div>
      <div class="mb-hud-buttons">
        <button
          class="mb-icon"
          title="Note for the writer (N)"
          aria-label="Note for the writer"
          @click=${() => this.openOverlay("note")}
        >
          ${penIcon()}
        </button>
        <button
          class="mb-icon"
          title=${this.prefs.sound ? "Sound off" : "Sound on"}
          aria-label=${this.prefs.sound ? "Sound off" : "Sound on"}
          @click=${() => {
            this.ambience.unlock();
            this.setPref("sound", !this.prefs.sound);
          }}
        >
          ${this.prefs.sound ? soundIcon() : muteIcon()}
        </button>
        <button
          class="mb-icon"
          title="Menu (Esc)"
          aria-label="Menu"
          @click=${() => this.openOverlay("menu")}
        >
          ${menuIcon()}
        </button>
      </div>
    </div>`;
  }

  private renderLine(b: Extract<Beat, { kind: "line" }>): TemplateResult {
    const name = b.who ? this.nameOf(b.who) : "";
    const hero = this.chapter.cast[0]?.id;
    return html`<div class="mb-text ${b.line} ${b.who === hero ? "hero" : ""}">
      <div class="mb-text-inner">
        ${b.line === "say"
          ? html`<div class="mb-speaker">
              ${name}${b.how
                ? html`<span class="mb-how">${b.how}</span>`
                : nothing}
            </div>`
          : nothing}
        <p class="mb-words">${typed(b.text, this.shown)}</p>
        <div
          class="mb-next ${this.typing ? "" : "on"}"
          aria-hidden="true"
        ></div>
      </div>
    </div>`;
  }

  private renderChoice(b: Extract<Beat, { kind: "choice" }>): TemplateResult {
    const timed = this.prefs.timers && b.timer > 0;
    const frac = timed ? this.timeLeft / b.timer : 0;
    return html`<div class="mb-choices ${timed ? "timed" : ""}">
      ${b.prompt ? html`<div class="mb-prompt">${b.prompt}</div>` : nothing}
      ${timed
        ? html`<div class="mb-timer" role="timer" aria-label="Time to answer">
            <span style="transform: scaleX(${frac.toFixed(4)})"></span>
          </div>`
        : nothing}
      <div class="mb-options n${Math.min(b.options.length, 5)}">
        ${b.options.map(
          (o, i) =>
            html`<button
              class="mb-option ${o.silent ? "silent" : ""}"
              @click=${() => this.choose(o.id)}
            >
              <span class="mb-key">${i + 1}</span>
              <span class="mb-option-label"
                >${o.silent
                  ? html`<span class="mb-dots">…</span>`
                  : nothing}${o.label}</span
              >
            </button>`,
        )}
      </div>
    </div>`;
  }

  private lookFrame(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const { w, h } = this.size;
    if (w / h < 1.05) {
      // Phones: the whole picture, at the top, with the list below.
      const width = w;
      return { left: 0, top: 58, width, height: (width * 9) / 16 };
    }
    const width = Math.max(w, (h * 16) / 9);
    const height = (width * 9) / 16;
    return { left: (w - width) / 2, top: (h - height) / 2, width, height };
  }

  private renderLook(b: InvestigateBeat): TemplateResult {
    const f = this.lookFrame();
    const { w, h } = this.size;
    const url = this.stage.backdrop
      ? mediaNow("art", this.stage.backdrop)
      : null;
    const seen = b.spots.filter((s) => s.seen).length;
    const need = Math.min(b.min, b.spots.length);
    const narrow = w / h < 1.05;
    const panelW = narrow ? 0 : 320;
    return html`<div class="mb-look">
      <div
        class="mb-look-frame"
        style="left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px"
      >
        ${url ? html`<img src=${url} alt="" draggable="false" />` : nothing}
      </div>
      <div class="mb-look-tint" aria-hidden="true"></div>
      ${b.spots.map((s) => {
        const x = Math.min(
          Math.max(f.left + (s.x / 100) * f.width, 28),
          w - panelW - 28,
        );
        const y = Math.min(
          Math.max(f.top + (s.y / 100) * f.height, 70),
          narrow ? f.top + f.height - 18 : h - 40,
        );
        return html`<button
          class="mb-spot ${s.seen ? "seen" : ""}"
          style="left:${x}px;top:${y}px"
          @click=${() => this.examine(s.id)}
          aria-label=${s.label}
        >
          <span class="mb-spot-ring"></span>
          <span class="mb-spot-label">${s.label}</span>
        </button>`;
      })}
      <aside class="mb-panel">
        <div class="mb-panel-head">
          <span class="mb-read">Read</span>
          <span class="mb-panel-title">${b.title}</span>
        </div>
        <div class="mb-count">
          ${seen} of ${b.spots.length}
          noticed${seen < need
            ? html` · notice ${need - seen} more to move on`
            : nothing}
        </div>
        <ul class="mb-clues">
          ${b.spots.map(
            (s) =>
              html`<li class=${s.seen ? "seen" : ""}>
                <button @click=${() => this.examine(s.id)}>
                  <span class="mb-dot"></span>${s.label}
                </button>
              </li>`,
          )}
        </ul>
        ${b.deductions.length > 0
          ? html`<div class="mb-panel-sub">What it means</div>
              <ul class="mb-deductions">
                ${b.deductions.map((d) =>
                  d.done
                    ? html`<li class="done">
                        <span class="mb-check"></span>${d.label}
                      </li>`
                    : d.ready
                      ? html`<li class="ready">
                          <button @click=${() => this.deduce(d.id)}>
                            <span class="mb-spark"></span>${d.label}
                          </button>
                        </li>`
                      : html`<li class="locked">
                          <span class="mb-lock"></span>Notice more
                        </li>`,
                )}
              </ul>`
          : nothing}
        <button
          class="mb-leave"
          ?disabled=${!b.canLeave}
          @click=${() => this.leave()}
        >
          ${b.leave}
        </button>
      </aside>
    </div>`;
  }

  private renderOverlay(o: Exclude<Overlay, null>): TemplateResult {
    const close = html`<button
      class="mb-x"
      aria-label="Close"
      @click=${() => this.closeOverlay()}
    >
      ${closeIcon()}
    </button>`;
    if (o === "note") {
      const b = this.beat;
      const on =
        b.kind === "line"
          ? plainText(b.text)
          : b.kind === "choice"
            ? b.prompt || "A choice"
            : b.kind === "investigate"
              ? b.title
              : "";
      return html`<div
        class="mb-overlay note"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="mb-sheet">
          ${close}
          <h2>Note for the writer</h2>
          <p class="mb-sheet-sub">
            Scene “${this.sceneLabel}” ·
            ${on
              ? html`on “${on.slice(0, 120)}${on.length > 120 ? "…" : ""}”`
              : nothing}
          </p>
          <textarea
            rows="5"
            maxlength="4000"
            placeholder="What should change? A line, a choice, a picture, the pace…"
            .value=${this.noteText}
            @input=${(e: Event) => {
              this.noteText = (e.target as HTMLTextAreaElement).value;
              this.noteState = "idle";
            }}
          ></textarea>
          <div class="mb-sheet-row">
            <span class="mb-note-state ${this.noteState}">
              ${this.noteState === "saved"
                ? "Saved. The writer will see it with this scene and the path you took."
                : this.noteState === "failed"
                  ? "That didn't save. Try again?"
                  : this.noteState === "saving"
                    ? "Saving…"
                    : "Saved with this scene and every choice that led here."}
            </span>
            <button
              class="mb-btn primary"
              ?disabled=${!this.noteText.trim() || this.noteState === "saving"}
              @click=${() => void this.saveNote()}
            >
              Save note
            </button>
          </div>
          ${this.notes.length > 0
            ? html`<div class="mb-notes">
                <div class="mb-panel-sub">Your notes on this scene</div>
                ${this.notes.map(
                  (n) =>
                    html`<div class="mb-note">
                      <div class="mb-note-when">
                        ${new Date(n.createdAt).toLocaleString()}
                      </div>
                      <div>${n.note}</div>
                    </div>`,
                )}
              </div>`
            : nothing}
        </div>
      </div>`;
    }
    if (o === "settings") {
      const speed = (s: TextSpeed, label: string) =>
        html`<button
          class="mb-seg ${this.prefs.speed === s ? "on" : ""}"
          aria-pressed=${this.prefs.speed === s}
          @click=${() => this.setPref("speed", s)}
        >
          ${label}
        </button>`;
      return html`<div
        class="mb-overlay"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="mb-sheet">
          ${close}
          <h2>Settings</h2>
          ${settingsBody(this.prefs, (k, v) => this.setPref(k, v), speed)}
          <button class="mb-btn" @click=${() => (this.overlay = "menu")}>
            Back
          </button>
        </div>
      </div>`;
    }
    if (o === "log") {
      return html`<div
        class="mb-overlay"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="mb-sheet tall">
          ${close}
          <h2>The story so far</h2>
          <div class="mb-log">
            ${this.log.map(
              (l) =>
                html`<p class="mb-log-line ${l.kind}">
                  ${l.who
                    ? html`<b>${this.nameOf(l.who)}</b> `
                    : nothing}${l.text}
                </p>`,
            )}
          </div>
          <button class="mb-btn" @click=${() => (this.overlay = "menu")}>
            Back
          </button>
        </div>
      </div>`;
    }
    if (o === "credits") {
      return html`<div
        class="mb-overlay"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="mb-sheet tall">
          ${close} ${creditsBody(this.credits)}
          <button class="mb-btn" @click=${() => (this.overlay = "menu")}>
            Back
          </button>
        </div>
      </div>`;
    }
    return html`<div
      class="mb-overlay"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <div class="mb-sheet menu">
        ${close}
        <div class="mb-menu-title">Mr. Based</div>
        <div class="mb-sheet-sub">
          Chapter ${this.chapter.n}: ${this.chapter.title}
        </div>
        <nav class="mb-menu">
          <button class="mb-btn primary" @click=${() => this.closeOverlay()}>
            Resume
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "note")}>
            Note for the writer
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "log")}>
            The story so far
          </button>
          <button class="mb-btn" @click=${() => this.host.quit("chapters")}>
            Chapters and checkpoints
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "settings")}>
            Settings
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "credits")}>
            Credits
          </button>
          <button class="mb-btn quiet" @click=${() => this.host.quit("title")}>
            Save and quit
          </button>
        </nav>
        <p class="mb-sheet-foot">
          Your progress is saved at the start of every scene.
        </p>
      </div>
    </div>`;
  }
}

export function settingsBody(
  prefs: Prefs,
  set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void,
  speed: (s: TextSpeed, label: string) => TemplateResult,
): TemplateResult {
  return html`<div class="mb-settings">
    <div class="mb-setting">
      <div>
        <div class="mb-setting-name">Timed choices</div>
        <div class="mb-setting-note">
          Some answers have a clock. When it runs out, he says nothing.
        </div>
      </div>
      <button
        class="mb-toggle ${prefs.timers ? "on" : ""}"
        role="switch"
        aria-checked=${prefs.timers}
        @click=${() => set("timers", !prefs.timers)}
      >
        <span></span>
      </button>
    </div>
    <div class="mb-setting">
      <div class="mb-setting-name">Text speed</div>
      <div class="mb-segs">
        ${speed("slow", "Slow")} ${speed("normal", "Normal")}
        ${speed("fast", "Fast")} ${speed("instant", "Instant")}
      </div>
    </div>
    <div class="mb-setting">
      <div class="mb-setting-name">Sound</div>
      <button
        class="mb-toggle ${prefs.sound ? "on" : ""}"
        role="switch"
        aria-checked=${prefs.sound}
        @click=${() => set("sound", !prefs.sound)}
      >
        <span></span>
      </button>
    </div>
    <div class="mb-setting">
      <div class="mb-setting-name">Volume</div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        .value=${String(prefs.volume)}
        @input=${(e: Event) =>
          set("volume", Number((e.target as HTMLInputElement).value))}
      />
    </div>
  </div>`;
}

export function creditsBody(credits: Credit[]): TemplateResult {
  return html`<h2>Credits</h2>
    <p class="mb-sheet-sub">
      Written for Derp Land. Every character, the party and the government are
      invented. The photographs are of real places and of people who agreed to
      be photographed; none of them is anyone in the story.
    </p>
    <ul class="mb-credits">
      ${credits.map(
        (c) =>
          html`<li>
            <span class="mb-credit-what">${c.what}</span>
            <a href=${c.source} target="_blank" rel="noopener noreferrer"
              >${c.title}</a
            >
            by ${c.author},
            <a href=${c.licenseUrl} target="_blank" rel="noopener noreferrer"
              >${c.license}</a
            >${c.changes ? html`. ${c.changes}` : nothing}
          </li>`,
      )}
    </ul>`;
}

function svg(d: TemplateResult): TemplateResult {
  return html`<svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${d}
  </svg>`;
}
function penIcon() {
  return svg(
    html`<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path
        d="M13.5 6.5l4 4"
      />`,
  );
}
function soundIcon() {
  return svg(
    html`<path d="M4 10v4h4l5 4V6L8 10z" /><path
        d="M16.5 9a4 4 0 0 1 0 6"
      /><path d="M19 6.5a7.5 7.5 0 0 1 0 11" />`,
  );
}
function muteIcon() {
  return svg(
    html`<path d="M4 10v4h4l5 4V6L8 10z" /><path d="M17 10l4 4M21 10l-4 4" />`,
  );
}
function menuIcon() {
  return svg(html`<path d="M4 7h16M4 12h16M4 17h10" />`);
}
export function closeIcon() {
  return svg(html`<path d="M6 6l12 12M18 6L6 18" />`);
}
