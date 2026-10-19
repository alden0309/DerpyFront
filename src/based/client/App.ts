// Mr. Based's page. Asks the server who may play: everyone else sees Coming
// Soon (the title, the key art and a few lines, and no way in). The owner
// gets the title screen, the game itself and, when a chapter of the story
// ends, the flowchart of what he chose.
//
// r22: no chapters to pick and no checkpoints. The game saves in slots
// (an autosave, a quicksave and ten of his own), each on the server with
// his account; Continue picks up the latest, Load game lists them all. The
// story's chapters follow on from each other by themselves.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DERPY_ACCOUNT_EVENT } from "../../derpland/Account";
import "../../derpland/DerpBar";
import { evalExpr } from "../engine/Expr";
import { clockText, Kit, StoryRun } from "../engine/Runtime";
import { emptyProfile, noteSeen, Profile, SlotSave } from "../engine/Save";
import { Boost } from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";
import * as Api from "./Api";
import { renderFlowchart } from "./Flowchart";
// r21: the player and its 3D world load only when the game starts, so the
// Coming Soon page never downloads them.
import type { PlayerHost } from "./Player";
import { levelsOf, loadPrefs, Prefs, savePrefs, TextSpeed } from "./Prefs";
import "./Setup";
import { Soundscape } from "./Sound";
import { BASED_COVER, BASED_COVER_CREDIT, BASED_TAGLINE } from "./Teaser";
import {
  creditsBody,
  playedText,
  settingsBody,
  slotName,
  slotsBody,
} from "./Ui";
import type { WorldAssets } from "./world/Assets";

type Screen =
  | "loading"
  | "soon"
  | "title"
  | "load"
  | "flow"
  | "settings"
  | "credits"
  | "setup"
  | "preparing"
  | "play"
  | "end"
  | "broken";

@customElement("based-app")
export class BasedApp extends LitElement {
  @state() private screen: Screen = "loading";
  @state() private access: Api.Access = { signedIn: false, play: false };
  @state() private list: Api.ChapterInfo[] = [];
  @state() private next = 2;
  @state() private profile: Profile = emptyProfile();
  @state() private slots: Api.SlotInfo[] = [];
  @state() private prefs: Prefs = loadPrefs();
  @state() private progress = { done: 0, total: 0 };
  @state() private problems: string[] = [];
  @state() private loaded: Api.LoadedChapter | null = null;
  @state() private from: SlotSave | null = null;
  @state() private carried: {
    flags: Record<string, number>;
    rels: Record<string, number>;
    build?: Build | null;
    boosts?: Boost[];
    kit?: Kit;
  } | null = null;
  @state() private build: Build | null = null;
  @state() private assets: WorldAssets | null = null;
  @state() private loadError = "";
  private setupFor: number | null = null;
  @state() private ended: {
    path: string[];
    values: { flags: Record<string, number>; rels: Record<string, number> };
  } | null = null;
  @state() private stats: Api.Stats = { players: 0, picks: {} };
  @state() private endNote = "";
  @state() private endNoteState: "idle" | "saving" | "saved" | "failed" =
    "idle";

  private ambience = new Soundscape();
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
    this.ambience.setLevels(levelsOf(this.prefs));
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
      const [list, p] = await Promise.all([Api.chapters(), Api.loadProfile()]);
      this.list = list.chapters;
      this.next = list.next;
      this.profile = p.save ?? emptyProfile();
      this.slots = p.slots;
    } catch {
      this.screen = "soon";
      return;
    }
    this.screen = "title";
  }

  // --- saving --------------------------------------------------------------

  /** The profile (what's been seen, time played), a moment after a change. */
  private dirty(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 2000);
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
      await Api.storeProfile(this.profile);
    } catch {
      // the next change will try again
    }
  }

  private host(n: number): PlayerHost {
    return {
      save: async (slot, save) => {
        await Api.storeSlot(slot, save);
        const info: Api.SlotInfo = {
          slot,
          meta: save.meta,
          updatedAt: new Date().toISOString(),
        };
        this.slots = [...this.slots.filter((s) => s.slot !== slot), info];
      },
      load: (slot) => void this.loadSlot(slot),
      seen: (path, found) => {
        noteSeen(this.profile, n, path, found);
        this.dirty();
      },
      pick: (choice, option) => {
        void Api.recordPicks(n, [{ choice, option }]).catch(() => {});
      },
      played: (s) => {
        this.profile.played = Math.round(this.profile.played + s);
        this.dirty();
      },
      end: (run) => void this.finish(n, run),
      quit: () => {
        this.flush();
        this.ambience.stop();
        this.screen = "title";
      },
    };
  }

  private async finish(n: number, run: StoryRun): Promise<void> {
    const values = run.values();
    const path = run.history();
    this.profile.finished[String(n)] = {
      at: new Date().toISOString(),
      flags: values.flags,
      rels: values.rels,
      path: path.slice(-3000),
      build: run.build,
      boosts: run.boosts,
      kit: run.kit,
    };
    noteSeen(this.profile, n, path);
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

  /** A new game, or the next chapter after one that's finished. */
  private async newGame(n: number): Promise<void> {
    this.ambience.unlock();
    const c = await this.chapter(n);
    if (c === null) return;
    const prev = this.profile.finished[String(n - 1)];
    this.carried =
      prev && n > 1
        ? {
            flags: prev.flags,
            rels: prev.rels,
            build: prev.build ?? null,
            boosts: prev.boosts ?? [],
            kit: prev.kit,
          }
        : null;
    const decided = this.carried?.build ?? null;
    if (c.chapter.skills.length > 0 && !decided) {
      this.loaded = c;
      this.setupFor = n;
      this.screen = "setup";
      return;
    }
    await this.start3d(n, null, decided);
  }

  private async loadSlot(slot: string): Promise<void> {
    this.ambience.unlock();
    this.loadError = "";
    const save: SlotSave | null = await Api.loadSlot(slot).catch(() => null);
    if (!save) {
      this.loadError = `${slotName(slot)} couldn't be loaded.`;
      return;
    }
    this.carried = null;
    await this.start3d(save.meta.chapter, save, save.snap.build ?? null);
  }

  private async start3d(
    n: number,
    from: SlotSave | null,
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
    this.ambience.setLevels(levelsOf(this.prefs));
  }

  /** The slot saved last: what Continue picks up. */
  private get latest(): Api.SlotInfo | null {
    let best: Api.SlotInfo | null = null;
    for (const s of this.slots) {
      if (!best || s.meta.savedAt > best.meta.savedAt) best = s;
    }
    return best;
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
      case "load":
        return this.renderLoad();
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
              if (this.setupFor !== null) {
                void this.start3d(this.setupFor, null, b);
              }
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
            <h1 class="mb-h1">The story has mistakes in its script</h1>
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
    const cur = this.latest;
    const first = this.list[0];
    const c = cur ? clockText(cur.meta.clock) : null;
    const seen = Object.keys(this.profile.seen).length > 0;
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-title">
        <div class="mb-title-art" aria-hidden="true">
          <img src=${BASED_COVER} alt="" />
        </div>
        <div class="mb-title-body">
          <div class="mb-early">Early access</div>
          <h1 class="mb-wordmark">Mr. Based</h1>
          <p class="mb-tagline">${BASED_TAGLINE}</p>
          <nav class="mb-title-menu">
            ${cur
              ? html`<button
                  class="mb-btn primary big"
                  @click=${() => void this.loadSlot(cur.slot)}
                >
                  Continue
                  <small
                    >${cur.meta.placeName || cur.meta.label}${c
                      ? `, ${c.time}`
                      : ""}
                    (${slotName(cur.slot).toLowerCase()})</small
                  >
                </button>`
              : nothing}
            ${first
              ? html`<button
                  class="mb-btn ${cur ? "" : "primary big"}"
                  @click=${() => {
                    if (
                      cur &&
                      !window.confirm(
                        "Start a new game? Your saves are kept; the autosave will be the new game's.",
                      )
                    ) {
                      return;
                    }
                    void this.newGame(first.n);
                  }}
                >
                  New game
                  ${cur ? nothing : html`<small>Paris, a wet night</small>`}
                </button>`
              : nothing}
            ${this.slots.length > 0
              ? html`<button
                  class="mb-btn"
                  @click=${() => {
                    this.loadError = "";
                    this.screen = "load";
                  }}
                >
                  Load game
                </button>`
              : nothing}
            ${seen
              ? html`<button
                  class="mb-btn"
                  @click=${() => void this.showFlow(first?.n ?? 1)}
                >
                  Flowchart
                </button>`
              : nothing}
            <button class="mb-btn" @click=${() => (this.screen = "settings")}>
              Settings
            </button>
            <button class="mb-btn" @click=${() => void this.showCredits()}>
              Credits
            </button>
          </nav>
          ${this.profile.migrated
            ? html`<p class="mb-title-note">${this.profile.migrated}</p>`
            : this.profile.played > 0
              ? html`<p class="mb-title-note">
                  Played ${playedText(this.profile.played)} so far. Press
                  <kbd>N</kbd> or the pen while playing to leave a note for the
                  writer.
                </p>`
              : html`<p class="mb-title-note">
                  Only you can see this. Press <kbd>N</kbd> or the pen while
                  playing to leave a note for the writer on any moment.
                </p>`}
        </div>
      </main>`;
  }

  private renderLoad(): TemplateResult {
    return html`<derp-bar page="home"></derp-bar>
      <main class="mb-page narrow">
        <button class="mb-back" @click=${() => (this.screen = "title")}>
          ← Mr. Based
        </button>
        <h1 class="mb-h1">Load game</h1>
        ${this.loadError
          ? html`<p class="mb-p bad">${this.loadError}</p>`
          : nothing}
        ${slotsBody({
          slots: this.slots,
          mode: "load",
          busy: null,
          pick: (slot) => void this.loadSlot(slot),
        })}
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
            Erase every save slot and your flowchart. Notes for the writer are
            kept.
          </p>
          <button
            class="mb-btn quiet"
            @click=${async () => {
              if (!window.confirm("Erase all your Mr. Based saves?")) return;
              await Api.eraseSave().catch(() => {});
              this.profile = emptyProfile();
              this.slots = [];
              this.screen = "title";
            }}
          >
            Erase my saves
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
          .slots=${this.slots}
          .played=${this.profile.played}
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
    const more = this.list.some((x) => x.n === n + 1);
    return html`<main class="mb-end">
      <div class="mb-end-head">
        <div class="mb-end-kicker">The file is closed, for tonight</div>
        <h1 class="mb-wordmark small">${c.chapter.title}</h1>
      </div>
      ${lines.length > 0
        ? html`<section class="mb-carry">
            <div class="mb-panel-sub">What you carry on with</div>
            <ul>
              ${lines.map((l) => html`<li>${l}</li>`)}
            </ul>
          </section>`
        : nothing}
      <section class="mb-end-flow">
        <div class="mb-panel-sub">Flowchart</div>
        ${renderFlowchart({
          flow: c.flow,
          seen: this.profile.seen[String(n)] ?? {
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
          ${more
            ? "Before the story goes on"
            : "What happens next is being written"}
        </div>
        <p class="mb-p">
          Anything the writer should know? It's kept with this ending.
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
                  path: (this.ended?.path ?? []).slice(-300),
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
        ${more
          ? html`<button
              class="mb-btn primary"
              @click=${() => void this.newGame(n + 1)}
            >
              Carry on
            </button>`
          : nothing}
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
        <button class="mb-back" @click=${() => (this.screen = "title")}>
          ← Mr. Based
        </button>
        <h1 class="mb-h1">${c.chapter.title}</h1>
        <p class="mb-p">
          Every scene and choice so far. What you haven't found yet is blacked
          out.
        </p>
        ${renderFlowchart({
          flow: c.flow,
          seen: this.profile.seen[String(n)] ?? {
            scenes: [],
            options: [],
            found: [],
          },
          path: this.profile.finished[String(n)]?.path ?? [],
          players: this.stats.players,
          picks: this.stats.picks,
        })}
      </main>`;
  }
}
