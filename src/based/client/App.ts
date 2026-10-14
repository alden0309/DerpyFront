// Mr. Based's page. Asks the server who may play: everyone else sees Coming
// Soon (the title, the key art and a few lines, and no way in). The owner
// gets the title screen, chapter select, the game itself and the flowchart
// at the end of each chapter. Progress is saved to his account as he plays.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DERPY_ACCOUNT_EVENT } from "../../derpland/Account";
import "../../derpland/DerpBar";
import { evalExpr } from "../engine/Expr";
import { Snapshot, StoryRun } from "../engine/Runtime";
import { BasedSave, emptySave, noteSeen } from "../engine/Save";
import { Boost } from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";
import * as Api from "./Api";
import { renderFlowchart } from "./Flowchart";
// r21: the player and its 3D world load only when a chapter starts, so the
// Coming Soon page never downloads them.
import type { PlayerHost } from "./Player";
import { loadPrefs, Prefs, savePrefs, TextSpeed } from "./Prefs";
import "./Setup";
import { Ambience } from "./Sound";
import { BASED_COVER, BASED_COVER_CREDIT, BASED_TAGLINE } from "./Teaser";
import { creditsBody, settingsBody } from "./Ui";
import type { WorldAssets } from "./world/Assets";

type Screen =
  | "loading"
  | "soon"
  | "title"
  | "chapters"
  | "flow"
  | "settings"
  | "credits"
  | "setup"
  | "preparing"
  | "play"
  | "end"
  | "broken";

const WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];
export const chapterWord = (n: number) => WORDS[n] ?? String(n);

@customElement("based-app")
export class BasedApp extends LitElement {
  @state() private screen: Screen = "loading";
  @state() private access: Api.Access = { signedIn: false, play: false };
  @state() private list: Api.ChapterInfo[] = [];
  @state() private next = 2;
  @state() private save: BasedSave = emptySave();
  @state() private prefs: Prefs = loadPrefs();
  @state() private progress = { done: 0, total: 0 };
  @state() private problems: string[] = [];
  @state() private loaded: Api.LoadedChapter | null = null;
  @state() private from: Snapshot | null = null;
  @state() private carried: {
    flags: Record<string, number>;
    rels: Record<string, number>;
    build?: Build | null;
    boosts?: Boost[];
  } | null = null;
  @state() private build: Build | null = null;
  @state() private assets: WorldAssets | null = null;
  private setupFor: { n: number; from: Snapshot | null } | null = null;
  @state() private ended: {
    path: string[];
    values: { flags: Record<string, number>; rels: Record<string, number> };
  } | null = null;
  @state() private stats: Api.Stats = { players: 0, picks: {} };
  @state() private endNote = "";
  @state() private endNoteState: "idle" | "saving" | "saved" | "failed" =
    "idle";

  private ambience = new Ambience();
  private chapters = new Map<number, Api.LoadedChapter>();
  private saveTimer = 0;
  private playKey = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.addEventListener("beforeunload", this.flush);
    this.ambience.setVolume(this.prefs.volume, !this.prefs.sound);
    void this.start();
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.removeEventListener("beforeunload", this.flush);
    super.disconnectedCallback();
  }

  private onAccount = () => {
    if (this.screen !== "play") void this.start();
  };

  private async start(): Promise<void> {
    this.access = await Api.access();
    if (!this.access.play) {
      this.screen = "soon";
      document.title = "Mr. Based · Coming soon · Derp Land";
      return;
    }
    document.title = "Mr. Based · Derp Land";
    try {
      const [list, save] = await Promise.all([Api.chapters(), Api.loadSave()]);
      this.list = list.chapters;
      this.next = list.next;
      this.save = save ?? emptySave();
    } catch {
      this.screen = "soon";
      return;
    }
    this.screen = "title";
  }

  // --- saving --------------------------------------------------------------

  private dirty(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 600);
  }

  private flush = () => {
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = 0;
      void this.persist();
    }
  };

  private async persist(): Promise<void> {
    this.saveTimer = 0;
    try {
      await Api.storeSave(this.save);
    } catch {
      // the next scene will try again
    }
  }

  private host(n: number): PlayerHost {
    return {
      scene: (snap, history, checkpoint) => {
        const s = this.save;
        s.current = snap;
        noteSeen(s, n, history);
        if (checkpoint) {
          (s.checkpoints[String(n)] ??= {})[snap.scene] = {
            label: checkpoint,
            at: new Date().toISOString(),
            snap,
          };
        }
        this.dirty();
      },
      pick: (choice, option, history) => {
        noteSeen(this.save, n, history);
        void Api.recordPicks(n, [{ choice, option }]).catch(() => {});
        this.dirty();
      },
      found: (id) => {
        noteSeen(this.save, n, [], [id]);
        this.dirty();
      },
      end: (run) => void this.finish(n, run),
      quit: (to) => {
        this.flush();
        this.ambience.stop();
        this.screen = to;
      },
    };
  }

  private async finish(n: number, run: StoryRun): Promise<void> {
    const values = run.values();
    const path = run.history();
    this.save.finished[String(n)] = {
      at: new Date().toISOString(),
      flags: values.flags,
      rels: values.rels,
      path,
      build: run.build,
      boosts: run.boosts,
    };
    this.save.current = null;
    noteSeen(this.save, n, path);
    this.flush();
    void this.persist();
    this.ended = { path, values };
    this.endNote = "";
    this.endNoteState = "idle";
    this.ambience.stop();
    this.stats = await Api.stats(n).catch(() => ({ players: 1, picks: {} }));
    this.screen = "end";
  }

  // --- starting play -------------------------------------------------------

  private async chapter(n: number): Promise<Api.LoadedChapter | null> {
    const hit = this.chapters.get(n);
    if (hit) return hit;
    const r = await Api.loadChapter(n);
    if (!r.ok) {
      // A chapter mid-edit with mistakes in it: show them.
      this.problems = r.problems;
      this.screen = "broken";
      return null;
    }
    this.chapters.set(n, r.chapter);
    return r.chapter;
  }

  private artKeys(c: Chapter): string[] {
    const keys = new Set<string>();
    for (const id of c.order) {
      for (const op of c.scenes[id].ops) {
        if ((op.op === "backdrop" || op.op === "vignette") && op.key) {
          keys.add(op.key);
        }
      }
    }
    for (const m of c.cast) if (m.portrait) keys.add(m.portrait);
    return [...keys];
  }

  private async play(n: number, from: Snapshot | null): Promise<void> {
    this.ambience.unlock();
    const c = await this.chapter(n);
    if (c === null) return;
    const prev = this.save.finished[String(n - 1)];
    this.carried = prev
      ? {
          flags: prev.flags,
          rels: prev.rels,
          build: prev.build ?? null,
          boosts: prev.boosts ?? [],
        }
      : null;
    // r21: a chapter with skills asks who he was, unless he's been decided.
    const decided = from?.build ?? this.carried?.build ?? null;
    if (c.chapter.skills.length > 0 && !decided) {
      this.loaded = c;
      this.setupFor = { n, from };
      this.screen = "setup";
      return;
    }
    await this.start3d(n, from, decided);
  }

  private async start3d(
    n: number,
    from: Snapshot | null,
    build: Build | null,
  ): Promise<void> {
    this.screen = "preparing";
    this.progress = { done: 0, total: 1 };
    const c = await this.chapter(n);
    if (c === null) return;
    const art = this.artKeys(c.chapter);
    const total = art.length + 3;
    let artDone = 0;
    let modelsDone = 0;
    const tick = () => (this.progress = { done: artDone + modelsDone, total });
    const [, assets] = await Promise.all([
      Api.preload(art, (done) => {
        artDone = done;
        tick();
      }),
      Object.keys(c.places ?? {}).length > 0
        ? (async () => {
            const [{ loadWorldAssets }] = await Promise.all([
              import("./world/Assets"),
              import("./Player"),
            ]);
            return loadWorldAssets(
              (key) => Api.media("model", key),
              (done) => {
                modelsDone = done;
                tick();
              },
            ).catch(() => null);
          })()
        : import("./Player").then(() => null),
    ]);
    this.assets = assets;
    this.loaded = c;
    this.from = from;
    this.build = build;
    this.playKey++;
    this.screen = "play";
  }

  private async showFlow(n: number): Promise<void> {
    const c = await this.chapter(n);
    if (c === null) return;
    this.loaded = c;
    this.stats = await Api.stats(n).catch(() => ({ players: 1, picks: {} }));
    this.ended = null;
    this.screen = "flow";
  }

  private async showCredits(): Promise<void> {
    const n = this.list[0]?.n ?? 1;
    const c = await this.chapter(n);
    if (c === null) return;
    this.loaded = c;
    this.screen = "credits";
  }

  private setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
    this.prefs = { ...this.prefs, [k]: v };
    savePrefs(this.prefs);
    this.ambience.setVolume(this.prefs.volume, !this.prefs.sound);
  }

  // --- drawing -------------------------------------------------------------

  render(): TemplateResult {
    switch (this.screen) {
      case "loading":
        return html`<derp-bar page="home"></derp-bar>
          <div class="mb-loading"><span class="mb-spinner"></span></div>`;
      case "soon":
        return this.renderSoon();
      case "title":
        return this.renderTitle();
      case "chapters":
        return this.renderChapters();
      case "flow":
        return this.renderFlowScreen();
      case "settings":
        return this.renderSettings();
      case "credits":
        return this.renderCredits();
      case "setup":
        return html`<derp-bar page="home"></derp-bar>
          <based-setup
            .chapter=${this.loaded!.chapter}
            .done=${(b: Build) => {
              const s = this.setupFor;
              if (s) void this.start3d(s.n, s.from, b);
            }}
            .back=${() => (this.screen = "title")}
          ></based-setup>`;
      case "preparing":
        return html`<div class="mb-preparing">
          <div class="mb-wordmark small">Mr. Based</div>
          <div class="mb-developing">Setting the scene…</div>
          <div class="mb-progress">
            <span
              style="transform: scaleX(${(
                this.progress.done / Math.max(1, this.progress.total)
              ).toFixed(3)})"
            ></span>
          </div>
        </div>`;
      case "play":
        return this.renderPlay();
      case "end":
        return this.renderEnd();
      case "broken":
        return html`<derp-bar page="home"></derp-bar>
          <main class="mb-page">
            <h1 class="mb-h1">This chapter has mistakes in its script</h1>
            <p class="mb-p">Fix these in the chapter file and reload:</p>
            <ul class="mb-problems">
              ${this.problems.map((p) => html`<li>${p}</li>`)}
            </ul>
            <button class="mb-btn" @click=${() => (this.screen = "title")}>
              Back
            </button>
          </main>`;
    }
  }

  private renderSoon(): TemplateResult {
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-soon">
        <div class="mb-soon-art" aria-hidden="true">
          <img src=${BASED_COVER} alt="" />
        </div>
        <div class="mb-soon-body">
          <div class="mb-stamp">Coming soon</div>
          <h1 class="mb-wordmark">Mr. Based</h1>
          <p class="mb-cover-credit">${BASED_COVER_CREDIT}</p>
        </div>
      </main>`;
  }

  private renderTitle(): TemplateResult {
    const cur = this.save.current;
    const first = this.list[0];
    const finished = (n: number) => !!this.save.finished[String(n)];
    const curChapter = cur
      ? this.list.find((c) => c.n === cur.chapter)
      : undefined;
    const curLabel = cur
      ? (this.save.checkpoints[String(cur.chapter)]?.[cur.scene]?.label ??
        curChapter?.checkpoints.find((k) => k.scene === cur.scene)?.label ??
        null)
      : null;
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-title">
        <div class="mb-title-art" aria-hidden="true">
          <img src=${BASED_COVER} alt="" />
        </div>
        <div class="mb-title-body">
          <div class="mb-early">Early access · written as you play</div>
          <h1 class="mb-wordmark">Mr. Based</h1>
          <p class="mb-tagline">${BASED_TAGLINE}</p>
          <nav class="mb-title-menu">
            ${cur
              ? html`<button
                  class="mb-btn primary big"
                  @click=${() => void this.play(cur.chapter, cur)}
                >
                  Continue
                  <small
                    >Chapter
                    ${chapterWord(cur.chapter)}${curLabel
                      ? html` · ${curLabel}`
                      : nothing}</small
                  >
                </button>`
              : first
                ? html`<button
                    class="mb-btn primary big"
                    @click=${() => void this.play(first.n, null)}
                  >
                    ${finished(first.n) ? "Play chapter one again" : "Begin"}
                    <small
                      >Chapter ${chapterWord(first.n)}: ${first.title}</small
                    >
                  </button>`
                : nothing}
            <button class="mb-btn" @click=${() => (this.screen = "chapters")}>
              Chapters and checkpoints
            </button>
            <button class="mb-btn" @click=${() => (this.screen = "settings")}>
              Settings
            </button>
            <button class="mb-btn" @click=${() => void this.showCredits()}>
              Credits
            </button>
          </nav>
          ${this.list.length > 0 && this.list.every((c) => finished(c.n))
            ? html`<p class="mb-title-note">
                Chapter ${chapterWord(this.next)} is being written. Your choices
                are waiting for it.
              </p>`
            : html`<p class="mb-title-note">
                Only you can see this. Press <kbd>N</kbd> or the pen while
                playing to leave a note for the writer on any scene.
              </p>`}
        </div>
      </main>`;
  }

  private renderChapters(): TemplateResult {
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-page">
        <button class="mb-back" @click=${() => (this.screen = "title")}>
          ← Mr. Based
        </button>
        <h1 class="mb-h1">Chapters</h1>
        <div class="mb-chapters">
          ${this.list.map((c) => {
            const reached = this.save.checkpoints[String(c.n)] ?? {};
            const done = this.save.finished[String(c.n)];
            const seen = this.save.seen[String(c.n)];
            const canStart = c.n === 1 || !!this.save.finished[String(c.n - 1)];
            return html`<section class="mb-chapter">
              <div class="mb-chapter-num">${chapterWord(c.n)}</div>
              <div class="mb-chapter-body">
                <h2>${c.title}</h2>
                <p class="mb-p">${c.summary}</p>
                <div class="mb-chapter-status">
                  ${done
                    ? html`Finished ${new Date(done.at).toLocaleDateString()}`
                    : seen
                      ? "In progress"
                      : "Not started"}
                  ${c.ok
                    ? nothing
                    : html` · <b class="bad">script has mistakes</b>`}
                </div>
                <div class="mb-chapter-actions">
                  <button
                    class="mb-btn primary"
                    ?disabled=${!canStart}
                    @click=${() => void this.play(c.n, null)}
                  >
                    Play from the beginning
                  </button>
                  ${seen
                    ? html`<button
                        class="mb-btn"
                        @click=${() => void this.showFlow(c.n)}
                      >
                        Flowchart
                      </button>`
                    : nothing}
                </div>
                <div class="mb-panel-sub">Checkpoints</div>
                <ol class="mb-checkpoints">
                  ${c.checkpoints.map((k) => {
                    const r = reached[k.scene];
                    return r
                      ? html`<li>
                          <button @click=${() => void this.play(c.n, r.snap)}>
                            <span class="mb-cp-mark">◆</span>${k.label}
                          </button>
                        </li>`
                      : html`<li class="locked">
                          <span class="mb-cp-mark">◇</span>?
                        </li>`;
                  })}
                </ol>
              </div>
            </section>`;
          })}
          <section class="mb-chapter upcoming">
            <div class="mb-chapter-num">${chapterWord(this.next)}</div>
            <div class="mb-chapter-body">
              <h2>Being written</h2>
              <p class="mb-p">
                The next chapter picks up from where you left chapter
                ${chapterWord(this.next - 1).toLowerCase()}, with everything you
                chose.
              </p>
            </div>
          </section>
        </div>
      </main>`;
  }

  private renderSettings(): TemplateResult {
    const speed = (s: TextSpeed, label: string) =>
      html`<button
        class="mb-seg ${this.prefs.speed === s ? "on" : ""}"
        aria-pressed=${this.prefs.speed === s}
        @click=${() => this.setPref("speed", s)}
      >
        ${label}
      </button>`;
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-page narrow">
        <button class="mb-back" @click=${() => (this.screen = "title")}>
          ← Mr. Based
        </button>
        <h1 class="mb-h1">Settings</h1>
        ${settingsBody(this.prefs, (k, v) => this.setPref(k, v), speed)}
        <div class="mb-danger">
          <div class="mb-panel-sub">Start over</div>
          <p class="mb-p">
            Forget where you are, your checkpoints and your flowchart. Notes for
            the writer are kept.
          </p>
          <button
            class="mb-btn quiet"
            @click=${async () => {
              if (!window.confirm("Erase your Mr. Based progress?")) return;
              await Api.eraseSave().catch(() => {});
              this.save = emptySave();
              this.screen = "title";
            }}
          >
            Erase my progress
          </button>
        </div>
      </main>`;
  }

  private renderCredits(): TemplateResult {
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-page narrow">
        <button class="mb-back" @click=${() => (this.screen = "title")}>
          ← Mr. Based
        </button>
        ${creditsBody(this.loaded?.credits.items ?? [])}
        <p class="mb-p small">${this.loaded?.credits.note ?? ""}</p>
      </main>`;
  }

  private renderPlay(): TemplateResult {
    const c = this.loaded!;
    // A fresh element each time play starts, so the run begins anew.
    return html`${[this.playKey].map(
      () =>
        html`<based-player
          .chapter=${c.chapter}
          .from=${this.from}
          .carried=${this.carried}
          .build=${this.build}
          .host=${this.host(c.chapter.n)}
          .prefs=${this.prefs}
          .ambience=${this.ambience}
          .credits=${c.credits.items}
          .assets=${this.assets}
          .places=${c.places ?? {}}
        ></based-player>`,
    )}`;
  }

  private carryLines(c: Chapter): string[] {
    const v = this.ended?.values;
    if (!v) return [];
    return c.carry
      .filter((k) => !k.cond || evalExpr(k.cond, v))
      .map((k) => k.text);
  }

  private renderEnd(): TemplateResult {
    const c = this.loaded!;
    const n = c.chapter.n;
    const lines = this.carryLines(c.chapter);
    return html`<main class="mb-end">
      <div class="mb-end-head">
        <div class="mb-end-kicker">End of Chapter ${chapterWord(n)}</div>
        <h1 class="mb-wordmark small">${c.chapter.title}</h1>
      </div>
      ${lines.length > 0
        ? html`<section class="mb-carry">
            <div class="mb-panel-sub">
              What you carry into chapter ${chapterWord(n + 1).toLowerCase()}
            </div>
            <ul>
              ${lines.map((l) => html`<li>${l}</li>`)}
            </ul>
          </section>`
        : nothing}
      <section class="mb-end-flow">
        <div class="mb-panel-sub">Flowchart</div>
        ${renderFlowchart({
          flow: c.flow,
          seen: this.save.seen[String(n)] ?? {
            scenes: [],
            options: [],
            found: [],
          },
          path: this.ended?.path ?? [],
          players: this.stats.players,
          picks: this.stats.picks,
        })}
      </section>
      <section class="mb-end-note">
        <div class="mb-panel-sub">
          Chapter ${chapterWord(n + 1)} is being written
        </div>
        <p class="mb-p">
          Anything the writer should know before it is? It's kept with this
          chapter's ending.
        </p>
        <textarea
          rows="4"
          maxlength="4000"
          .value=${this.endNote}
          placeholder="What worked, what didn't, what you want to happen next…"
          @input=${(e: Event) => {
            this.endNote = (e.target as HTMLTextAreaElement).value;
            this.endNoteState = "idle";
          }}
        ></textarea>
        <div class="mb-sheet-row">
          <span class="mb-note-state ${this.endNoteState}"
            >${this.endNoteState === "saved"
              ? "Saved for the writer."
              : this.endNoteState === "failed"
                ? "That didn't save. Try again?"
                : ""}</span
          >
          <button
            class="mb-btn primary"
            ?disabled=${!this.endNote.trim() || this.endNoteState === "saving"}
            @click=${async () => {
              this.endNoteState = "saving";
              try {
                await Api.leaveNote({
                  chapter: n,
                  scene: "end",
                  line: "[end of chapter]",
                  path: this.ended?.path ?? [],
                  note: this.endNote.trim(),
                });
                this.endNote = "";
                this.endNoteState = "saved";
              } catch {
                this.endNoteState = "failed";
              }
            }}
          >
            Save note
          </button>
        </div>
      </section>
      <nav class="mb-end-actions">
        <button
          class="mb-btn primary"
          @click=${() => (this.screen = "chapters")}
        >
          Replay from a checkpoint
        </button>
        <button class="mb-btn" @click=${() => (this.screen = "title")}>
          Title screen
        </button>
      </nav>
    </main>`;
  }

  private renderFlowScreen(): TemplateResult {
    const c = this.loaded!;
    const n = c.chapter.n;
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-page wide">
        <button class="mb-back" @click=${() => (this.screen = "chapters")}>
          ← Chapters
        </button>
        <h1 class="mb-h1">Chapter ${chapterWord(n)}: ${c.chapter.title}</h1>
        ${renderFlowchart({
          flow: c.flow,
          seen: this.save.seen[String(n)] ?? {
            scenes: [],
            options: [],
            found: [],
          },
          path:
            this.save.finished[String(n)]?.path ??
            this.save.current?.path ??
            [],
          players: this.stats.players,
          picks: this.stats.picks,
        })}
      </main>`;
  }
}
