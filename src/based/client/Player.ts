// Mr. Based's player (r21), in the manner of Disco Elysium: the place in 3D
// on the left, seen from above at an angle, where he walks where you click;
// the dialogue column on the right (a bottom sheet on a phone), where the
// story scrolls up with speakers' names, his skills' voices, the dice, and
// numbered choices. Rooms and people are read by walking up to things and
// looking. Memories are painted vignettes in the column.
//
// One chapter, from a save or a checkpoint. The story itself comes from the
// server; this file and the world know nothing of it.

import { html, LitElement, nothing, svg, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { PlaceDef } from "../engine/Place";
import {
  Beat,
  chapterStart,
  CheckView,
  ChoiceBeat,
  emptyStage,
  InvestigateBeat,
  RollBeat,
  Snapshot,
  Stage,
  StoryEvent,
  StoryRun,
} from "../engine/Runtime";
import { Boost } from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";
import { Credit, leaveNote, mediaNow, notesFor, WriterNote } from "./Api";
import { CPS, Prefs, savePrefs, TextSpeed } from "./Prefs";
import { Ambience } from "./Sound";
import {
  closeIcon,
  creditsBody,
  eyeIcon,
  menuIcon,
  muteIcon,
  penIcon,
  personIcon,
  plainText,
  settingsBody,
  soundIcon,
  typed,
} from "./Ui";
import { WorldAssets } from "./world/Assets";
import { HotspotOnScreen, pickTier, World } from "./world/World";

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

interface Toast {
  id: number;
  text: string;
  kind: "remember" | "rel" | "checkpoint" | "boost";
}

interface Entry {
  id: number;
  kind: "narr" | "say" | "think" | "voice" | "roll" | "card" | "pick";
  who?: string;
  how?: string;
  text: string;
  skill?: string;
  /** "Medium: Success" for a passive voice. */
  tag?: string;
  roll?: RollBeat;
}

type Overlay =
  | null
  | "menu"
  | "note"
  | "settings"
  | "log"
  | "credits"
  | "sheet";

let nextId = 1;

/** Each attribute's colour in the column, as Disco Elysium colours its four. */
const ATTR_COLORS = ["#7fb2e5", "#e0715a", "#b98be0", "#d9b45a"];

@customElement("based-player")
export class BasedPlayer extends LitElement {
  @property({ attribute: false }) chapter!: Chapter;
  @property({ attribute: false }) from: Snapshot | null = null;
  @property({ attribute: false }) carried: {
    flags: Record<string, number>;
    rels: Record<string, number>;
    build?: Build | null;
    boosts?: Boost[];
  } | null = null;
  @property({ attribute: false }) build: Build | null = null;
  @property({ attribute: false }) host!: PlayerHost;
  @property({ attribute: false }) prefs!: Prefs;
  @property({ attribute: false }) ambience!: Ambience;
  @property({ attribute: false }) credits: Credit[] = [];
  @property({ attribute: false }) assets: WorldAssets | null = null;
  @property({ attribute: false }) places: Record<string, PlaceDef> = {};

  @state() private beat: Beat = { kind: "end" };
  @state() private stage: Stage = emptyStage();
  @state() private entries: Entry[] = [];
  @state() private shown = 0;
  @state() private toasts: Toast[] = [];
  @state() private timeLeft = 0;
  @state() private overlay: Overlay = null;
  @state() private sceneLabel = "";
  @state() private noteText = "";
  @state() private noteState: "idle" | "saving" | "saved" | "failed" = "idle";
  @state() private notes: WriterNote[] = [];
  @state() private size = { w: window.innerWidth, h: window.innerHeight };
  @state() private hover: string | null = null;
  @state() private card: { title: string; sub?: string } | null = null;
  @state() private rolled = false;
  @state() private tab = false;
  @state() private noWorld = false;
  @state() private walkingTo: string | null = null;

  private run!: StoryRun;
  private world: World | null = null;
  private log: Entry[] = [];
  private typeStart = 0;
  private typeFrame = 0;
  private timerFrame = 0;
  private timerEnd = 0;
  private pausedLeft = 0;
  private rollTimer = 0;
  private talkTimer = 0;
  private marks = new Map<string, HTMLElement>();

  createRenderRoot() {
    return this;
  }

  // --- life ----------------------------------------------------------------

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    const start =
      this.from ??
      chapterStart(this.chapter, this.carried ?? undefined, {
        build: this.build,
        seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 || 1,
      });
    if (this.build && !start.build) start.build = this.build;
    this.run = new StoryRun(this.chapter, start);
  }

  firstUpdated(): void {
    const canvas = this.querySelector<HTMLCanvasElement>("canvas.mb-world");
    if (canvas && this.assets) {
      try {
        const tier =
          this.prefs.quality === "auto" ? pickTier() : this.prefs.quality;
        this.world = new World(
          canvas,
          this.assets,
          this.chapter.cast.map((c) => ({ id: c.id, look: c.look ?? "" })),
          tier,
          {
            hotspot: (id) => this.clickHotspot(id),
            floor: (x, z) => this.clickFloor(x, z),
            person: () => {},
            hover: (id) => (this.hover = id),
          },
        );
        this.world.hero = this.chapter.cast[0]?.id ?? "";
        this.world.onHotspots = (h) => this.moveMarks(h);
        this.placeInset();
      } catch {
        this.world = null;
        this.noWorld = true;
      }
    } else {
      this.noWorld = true;
    }
    this.afterStep(true);
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    cancelAnimationFrame(this.typeFrame);
    cancelAnimationFrame(this.timerFrame);
    window.clearTimeout(this.rollTimer);
    window.clearTimeout(this.talkTimer);
    this.world?.dispose();
    this.world = null;
    super.disconnectedCallback();
  }

  updated(): void {
    // The newest line at the bottom of the column, always in view.
    const logEl = this.querySelector(".mb-col-log");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  private get narrow(): boolean {
    return this.size.w < 760 || this.size.w / this.size.h < 0.9;
  }

  private placeInset(): void {
    if (!this.world) return;
    const n = this.narrow;
    const colW = n ? 0 : Math.min(460, Math.max(360, this.size.w * 0.32));
    const sheetH = n ? this.size.h * 0.44 : 0;
    this.world.setInset(colW, sheetH);
  }

  // --- stepping ------------------------------------------------------------

  private afterStep(first = false): void {
    const events = this.run.drain();
    this.syncStage(first);
    for (const e of events) this.onEvent(e, first);
    const b = this.run.beat;
    this.beat = b;
    cancelAnimationFrame(this.timerFrame);
    window.clearTimeout(this.rollTimer);
    this.card = null;
    this.walkingTo = null;
    this.setActive(b);
    if (b.kind === "line") {
      const voice = b.voice;
      const e: Entry = {
        id: nextId++,
        kind: voice ? "voice" : b.line,
        who: b.who,
        how: b.how,
        text: b.text,
      };
      if (voice) {
        e.skill = voice.skill;
        if (voice.tier) e.tag = `${voice.tier}: Success`;
      }
      this.push(e);
      this.startTyping();
      this.talk(b.who ?? null);
    } else if (b.kind === "card") {
      this.card = { title: b.title, sub: b.sub };
      this.push({
        id: nextId++,
        kind: "card",
        text: b.sub ? `${b.title} · ${b.sub}` : b.title,
      });
      this.talk(null);
    } else if (b.kind === "roll") {
      this.push({
        id: nextId++,
        kind: "roll",
        text: b.label,
        roll: b,
        skill: b.skill,
      });
      this.rolled = b.dice === null;
      if (!this.rolled) {
        this.rollTimer = window.setTimeout(() => (this.rolled = true), 900);
      }
      this.talk(null);
    } else if (b.kind === "choice") {
      this.startTimer(b.timer);
      this.talk(null);
    } else if (b.kind === "investigate") {
      this.talk(null);
    } else if (b.kind === "end") {
      this.talk(null);
      this.host.end(this.run);
    }
  }

  private push(e: Entry): void {
    this.log.push(e);
    if (this.log.length > 400) this.log.shift();
    this.entries = [...this.entries, e].slice(-90);
  }

  private onEvent(e: StoryEvent, first: boolean): void {
    switch (e.type) {
      case "scene":
        this.sceneLabel = e.label;
        this.host.scene(this.run.snapshot(), this.run.history(), e.checkpoint);
        if (e.checkpoint && !first) {
          this.toast(`Checkpoint · ${e.checkpoint}`, "checkpoint");
        }
        break;
      case "remember":
        this.toast(`${this.nameOf(e.who)} will remember that.`, "remember");
        break;
      case "rel": {
        const name = this.nameOf(e.who);
        this.toast(
          e.delta >= 2
            ? `${name} trusts you more.`
            : e.delta > 0
              ? `${name} warms to you.`
              : e.delta <= -2
                ? `${name} trusts you less.`
                : `${name} cools.`,
          "rel",
        );
        break;
      }
      case "boost":
        this.toast(
          `${this.skillName(e.skill)} ${e.delta > 0 ? "+" : ""}${e.delta}: ${e.why}`,
          "boost",
        );
        break;
      case "actor":
        if (!first) this.world?.moveActor(e.who, e.state, e.walk);
        break;
      case "prop":
        this.world?.setProp(e.key, e.on);
        break;
      case "gesture":
        this.world?.gesture(this.bodyOf(e.who), e.name);
        break;
      default:
        break;
    }
  }

  private syncStage(first: boolean): void {
    const s = this.run.stage;
    const was = this.stage;
    const w = this.world;
    if (w) {
      if (first || s.place !== was.place) {
        w.setPlace(s.place ? (this.places[s.place] ?? null) : null);
        w.placeCast(s.actors);
        for (const [k, on] of Object.entries(s.props)) w.setProp(k, on);
      }
      if (first || s.focus !== was.focus) w.setFocus(s.focus);
      if (first || s.news !== was.news) w.setNews(s.news);
    }
    if (s.ambient !== was.ambient || first) void this.ambience.play(s.ambient);
    this.stage = s;
  }

  /** Which body a speaker moves (one person can go by two names). */
  private bodyOf(who: string): string {
    return this.chapter.cast.find((c) => c.id === who)?.body ?? who;
  }

  private talk(who: string | null): void {
    window.clearTimeout(this.talkTimer);
    this.world?.setTalking(who ? this.bodyOf(who) : null);
  }

  private nameOf(who: string): string {
    return this.chapter.cast.find((c) => c.id === who)?.name ?? who;
  }

  private skillName(id: string): string {
    return this.chapter.skills.find((s) => s.id === id)?.name ?? id;
  }

  private skillColor(id: string): string {
    const s = this.chapter.skills.find((x) => x.id === id);
    const i = this.chapter.attributes.findIndex((a) => a.id === s?.attr);
    return ATTR_COLORS[Math.max(0, i) % ATTR_COLORS.length];
  }

  private toast(text: string, kind: Toast["kind"]): void {
    const t = { id: nextId++, text, kind };
    this.toasts = [...this.toasts.filter((x) => x.kind !== kind), t];
    window.setTimeout(
      () => (this.toasts = this.toasts.filter((x) => x.id !== t.id)),
      kind === "remember" || kind === "boost" ? 4200 : 3000,
    );
  }

  private startTyping(): void {
    cancelAnimationFrame(this.typeFrame);
    const b = this.beat;
    if (b.kind !== "line") return;
    const len = plainText(b.text).length;
    const cps = CPS[this.prefs.speed];
    if (cps === 0) {
      this.shown = len;
      this.doneTyping();
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
      else this.doneTyping();
    };
    this.typeFrame = requestAnimationFrame(tick);
  }

  private doneTyping(): void {
    window.clearTimeout(this.talkTimer);
    this.talkTimer = window.setTimeout(() => this.world?.setTalking(null), 400);
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
        this.doneTyping();
        return;
      }
      this.run.advance();
      this.afterStep();
    } else if (b.kind === "card") {
      this.run.advance();
      this.afterStep();
    } else if (b.kind === "roll") {
      if (!this.rolled) {
        window.clearTimeout(this.rollTimer);
        this.rolled = true;
        return;
      }
      this.run.advance();
      this.afterStep();
    }
  }

  private choose(id: string): void {
    this.ambience.unlock();
    const b = this.beat;
    if (b.kind !== "choice") return;
    const opt = b.options.find((o) => o.id === id);
    if (!opt || opt.check?.locked) return;
    cancelAnimationFrame(this.timerFrame);
    this.timeLeft = 0;
    this.push({
      id: nextId++,
      kind: "pick",
      text: opt.silent ? "Say nothing." : opt.label,
      skill: opt.check?.skill,
    });
    this.run.choose(id);
    this.host.pick(b.id, id, this.run.history());
    this.afterStep();
  }

  private timeout(): void {
    const b = this.beat;
    if (b.kind !== "choice") return;
    const open = b.options.filter((o) => !o.check?.locked);
    const pick = open.find((o) => o.silent) ?? open[0];
    if (!pick) return;
    if (pick.silent) this.toast("The moment passed. You said nothing.", "rel");
    this.choose(pick.id);
  }

  private examine(id: string): void {
    this.ambience.unlock();
    if (this.beat.kind !== "investigate") return;
    this.run.examine(id);
    this.host.found(id);
    this.afterStep();
  }

  private deduce(id: string): void {
    if (this.beat.kind !== "investigate") return;
    this.run.deduce(id);
    this.host.found(id);
    this.afterStep();
  }

  private leave(): void {
    if (this.beat.kind !== "investigate" || !this.beat.canLeave) return;
    this.run.leave();
    this.afterStep();
  }

  // --- the world -------------------------------------------------------------

  /** Which hotspots can be clicked, and whether he may walk about. */
  private setActive(b: Beat): void {
    const w = this.world;
    if (!w) return;
    w.active.clear();
    w.walkable = false;
    if (b.kind === "investigate" && this.is3d(b)) {
      for (const s of b.spots) w.active.add(s.anchor ?? s.id);
      if (b.exit) w.active.add(b.exit);
      w.walkable = !b.still;
    }
    this.marks.clear();
  }

  private is3d(b: InvestigateBeat): boolean {
    return b.spots.some((s) => s.anchor !== undefined);
  }

  private spotFor(anchor: string): InvestigateBeat["spots"][number] | null {
    const b = this.beat;
    if (b.kind !== "investigate") return null;
    return b.spots.find((s) => (s.anchor ?? s.id) === anchor) ?? null;
  }

  private clickHotspot(anchor: string): void {
    this.ambience.unlock();
    const b = this.beat;
    if (b.kind !== "investigate" || this.overlay) return;
    if (anchor === b.exit) {
      if (!b.canLeave) {
        const need =
          Math.min(b.min, b.spots.length) -
          b.spots.filter((s) => s.seen).length;
        this.toast(`Look around first: ${need} more.`, "rel");
        return;
      }
      this.walkingTo = anchor;
      this.world?.walkToHotspot(anchor, () => {
        if (this.walkingTo === anchor) this.leave();
      });
      return;
    }
    const spot = this.spotFor(anchor);
    if (!spot) return;
    this.lookAt(spot.id);
  }

  /** Walks over to a spot (unless he stays put), then looks. */
  private lookAt(id: string): void {
    const b = this.beat;
    if (b.kind !== "investigate") return;
    const spot = b.spots.find((s) => s.id === id);
    if (!spot) return;
    if (!this.world || b.still || spot.anchor === undefined) {
      this.examine(id);
      return;
    }
    this.walkingTo = id;
    this.world.walkToHotspot(spot.anchor, () => {
      if (this.walkingTo === id && this.beat.kind === "investigate") {
        this.examine(id);
      }
    });
  }

  private clickFloor(x: number, z: number): void {
    const b = this.beat;
    if (this.overlay) return;
    if (b.kind === "investigate" && this.world?.walkable) {
      this.walkingTo = null;
      this.world.walkHero(x, z);
      return;
    }
    // Anywhere else, a click on the world moves the story on.
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      this.advance();
    }
  }

  /** Keeps the marks over their hotspots as the camera moves. */
  private moveMarks(list: HotspotOnScreen[]): void {
    // Labels that would sit on top of each other step down a line.
    const placed: { x: number; y: number }[] = [];
    for (const h of [...list].sort((a, b) => a.y - b.y)) {
      let el = this.marks.get(h.id);
      if (!el) {
        el =
          this.querySelector<HTMLElement>(`.mb-mark[data-id="${h.id}"]`) ??
          undefined;
        if (!el) continue;
        this.marks.set(h.id, el);
      }
      el.style.transform = `translate(${h.x.toFixed(1)}px, ${h.y.toFixed(1)}px)`;
      el.style.visibility = h.visible ? "visible" : "hidden";
      let dy = 0;
      if (h.visible) {
        while (
          placed.some(
            (p) => Math.abs(p.x - h.x) < 150 && Math.abs(p.y - (h.y + dy)) < 26,
          )
        ) {
          dy += 26;
        }
        placed.push({ x: h.x, y: h.y + dy });
      }
      el.style.setProperty("--ly", `${dy}px`);
    }
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
    if (e.key === "Tab") {
      e.preventDefault();
      this.tab = true;
      return;
    }
    if (this.overlay !== null) return;
    const b = this.beat;
    if (e.key === " " || e.key === "Enter") {
      if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
        e.preventDefault();
        this.advance();
      }
    } else if (/^[1-9]$/.test(e.key) && b.kind === "choice") {
      const opt = b.options[Number(e.key) - 1];
      if (opt) this.choose(opt.id);
    } else if (e.key === "n" || e.key === "N") {
      this.openOverlay("note");
    } else if (e.key === "c" || e.key === "C") {
      this.openOverlay("sheet");
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Tab") this.tab = false;
  };

  private onResize = () => {
    this.size = { w: window.innerWidth, h: window.innerHeight };
    this.placeInset();
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
              : b.kind === "roll"
                ? `[check] ${b.skill} ${b.diff}: ${b.label}`
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
    const flat = b.kind === "investigate" && !this.is3d(b) ? b : null;
    const noPlace = this.stage.place === null || this.noWorld;
    return html`<div
      class="mb-play ${this.narrow ? "narrow" : ""} ${this.tab ||
      this.prefs.marks
        ? "marks-on"
        : ""}"
    >
      <canvas class="mb-world"></canvas>
      ${noPlace && !flat ? this.renderPicture() : nothing}
      ${this.noWorld && this.stage.place
        ? html`<div class="mb-noworld">
            This chapter is drawn in 3D, which this browser can't show (WebGL is
            off). The story plays on in the column.
          </div>`
        : nothing}
      ${flat ? this.renderFlat(flat) : nothing}
      ${b.kind === "investigate" && !flat ? this.renderMarks(b) : nothing}
      ${this.renderHud()}
      ${this.stage.news && this.stage.place
        ? this.renderNews(this.stage.news)
        : nothing}
      ${this.card
        ? html`<div class="mb-titlecard" @click=${() => this.advance()}>
            <div class="mb-card-title">${this.card.title}</div>
            ${this.card.sub
              ? html`<div class="mb-card-sub">${this.card.sub}</div>`
              : nothing}
          </div>`
        : nothing}
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
      ${this.renderColumn()}
      ${this.overlay ? this.renderOverlay(this.overlay) : nothing}
    </div>`;
  }

  /** A flat picture where there's no 3D place (or no WebGL). */
  private renderPicture(): TemplateResult | typeof nothing {
    const key = this.stage.backdrop;
    const url = key ? mediaNow("art", key) : null;
    if (!url) return html`<div class="mb-picture empty"></div>`;
    return html`<div class="mb-picture">
      <img src=${url} alt="" draggable="false" />
    </div>`;
  }

  private renderMarks(b: InvestigateBeat): TemplateResult {
    const marks = [
      ...b.spots.map((s) => ({
        id: s.anchor ?? s.id,
        label: s.label,
        seen: s.seen,
        exit: false,
      })),
      ...(b.exit
        ? [{ id: b.exit, label: b.leave, seen: false, exit: true }]
        : []),
    ];
    return html`<div class="mb-marks">
      ${marks.map(
        (m) =>
          html`<button
            class="mb-mark ${m.seen ? "seen" : ""} ${m.exit
              ? "exit"
              : ""} ${this.hover === m.id ? "hover" : ""}"
            data-id=${m.id}
            aria-label=${m.label}
            @click=${() => this.clickHotspot(m.id)}
            @pointerenter=${() => (this.hover = m.id)}
            @pointerleave=${() => (this.hover = null)}
          >
            <span class="mb-mark-dot"></span>
            <span class="mb-mark-label">${m.label}</span>
          </button>`,
      )}
    </div>`;
  }

  /** Looking at something flat, held up close: the photograph. */
  private renderFlat(b: InvestigateBeat): TemplateResult {
    const url = this.stage.backdrop
      ? mediaNow("art", this.stage.backdrop)
      : null;
    return html`<div class="mb-flat">
      <div class="mb-flat-frame">
        ${url ? html`<img src=${url} alt="" draggable="false" />` : nothing}
        ${b.spots.map(
          (s) =>
            html`<button
              class="mb-mark static ${s.seen ? "seen" : ""}"
              style="left:${s.x}%;top:${s.y}%"
              aria-label=${s.label}
              @click=${() => this.examine(s.id)}
            >
              <span class="mb-mark-dot"></span>
              <span class="mb-mark-label">${s.label}</span>
            </button>`,
        )}
      </div>
    </div>`;
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
          title="Him (C)"
          aria-label="His skills"
          @click=${() => this.openOverlay("sheet")}
        >
          ${personIcon()}
        </button>
        <button
          class="mb-icon ${this.prefs.marks ? "on" : ""}"
          title="Show what he can look at (Tab)"
          aria-label="Show what he can look at"
          @click=${() => this.setPref("marks", !this.prefs.marks)}
        >
          ${eyeIcon()}
        </button>
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

  private renderNews(text: string): TemplateResult {
    return html`<div class="mb-news">
      <span class="mb-news-tag">EN DIRECT</span>
      <span class="mb-news-crawl"><span>${text}</span></span>
    </div>`;
  }

  // --- the column ------------------------------------------------------------

  private renderColumn(): TemplateResult {
    const b = this.beat;
    return html`<aside class="mb-column" aria-label="The story">
      ${this.renderHead()}
      <div
        class="mb-col-log"
        role="log"
        @click=${() => {
          if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
            this.advance();
          }
        }}
      >
        ${this.entries.map((e, i) =>
          this.renderEntry(e, i === this.entries.length - 1),
        )}
      </div>
      <div class="mb-col-act">${this.renderAction(b)}</div>
    </aside>`;
  }

  /** The column's head: a memory's painting, or who he's talking to. */
  private renderHead(): TemplateResult | typeof nothing {
    const v = this.stage.vignette;
    if (v) {
      const url = mediaNow("art", v);
      return html`<div class="mb-col-head vignette">
        ${url ? html`<img src=${url} alt="" draggable="false" />` : nothing}
      </div>`;
    }
    const who = this.stage.figure;
    const c = who ? this.chapter.cast.find((m) => m.id === who) : undefined;
    const url = c?.portrait ? mediaNow("art", c.portrait) : null;
    if (!c || !url) return nothing;
    const b = this.beat;
    const speaking = b.kind === "line" && b.who === who;
    return html`<div class="mb-col-head portrait ${speaking ? "speaking" : ""}">
      <img src=${url} alt="" draggable="false" />
      <div class="mb-col-head-name">${c.name}</div>
    </div>`;
  }

  private renderEntry(e: Entry, last: boolean): TemplateResult {
    const live = last && this.beat.kind === "line";
    const text = live ? typed(e.text, this.shown) : html`${typed(e.text, 1e9)}`;
    const hero = this.chapter.cast[0]?.id;
    switch (e.kind) {
      case "say":
        return html`<p class="mb-e say ${e.who === hero ? "hero" : ""}">
          <b class="mb-e-who">${this.nameOf(e.who ?? "").toUpperCase()}</b
          >${e.how ? html` <i class="mb-e-how">(${e.how})</i>` : nothing} –
          ${text}
        </p>`;
      case "voice":
        return html`<p class="mb-e voice">
          <b class="mb-e-who" style="color:${this.skillColor(e.skill ?? "")}"
            >${this.skillName(e.skill ?? "").toUpperCase()}</b
          >${e.tag ? html` <span class="mb-e-tag">[${e.tag}]</span>` : nothing}
          – ${text}
        </p>`;
      case "think":
        return html`<p class="mb-e think">${text}</p>`;
      case "card":
        return html`<p class="mb-e card">${e.text}</p>`;
      case "pick":
        return html`<p class="mb-e pick">
          <span class="mb-e-arrow">→</span>${e.text}
        </p>`;
      case "roll":
        return this.renderRollEntry(e.roll!, last);
      default:
        return html`<p class="mb-e narr">${text}</p>`;
    }
  }

  private renderRollEntry(r: RollBeat, last: boolean): TemplateResult {
    const color = this.skillColor(r.skill);
    const name = this.skillName(r.skill);
    const pending = last && !this.rolled && r.dice !== null;
    return html`<div
      class="mb-e roll ${r.pass ? "pass" : "fail"} ${pending ? "pending" : ""}"
    >
      <div class="mb-roll-head">
        <b style="color:${color}">${name.toUpperCase()}</b>
        <span class="mb-roll-diff">[${r.tier} ${r.diff}]</span>
        <span class="mb-roll-result"
          >${pending
            ? "…"
            : r.pass
              ? r.crit === "six"
                ? "Critical success"
                : "Success"
              : r.crit === "one"
                ? "Critical failure"
                : "Failure"}</span
        >
      </div>
      <div class="mb-roll-what">${r.label}</div>
      ${r.dice
        ? html`<div class="mb-roll-dice">
            ${r.dice.map(
              (d, i) =>
                html`<span
                  class="mb-die ${pending ? "tumbling" : ""}"
                  style="animation-delay:${i * 90}ms"
                  >${dieFace(
                    pending ? ((Date.now() / 97 + i) % 6) + 1 : d,
                  )}</span
                >`,
            )}
            <span class="mb-roll-sum"
              >${pending
                ? ""
                : `${r.dice[0]} + ${r.dice[1]} + ${r.bonus} = ${r.total} against ${r.diff}`}</span
            >
          </div>`
        : html`<div class="mb-roll-sum passive">
            Passive: ${name}
            ${r.base}${r.mods.length > 0
              ? ` ${r.mods.map((m) => `${m.delta > 0 ? "+" : ""}${m.delta}`).join(" ")}`
              : ""}
            + 6 against ${r.diff}
          </div>`}
    </div>`;
  }

  private renderAction(b: Beat): TemplateResult | typeof nothing {
    switch (b.kind) {
      case "line":
      case "card":
        return html`<button class="mb-continue" @click=${() => this.advance()}>
          ${this.typing ? "…" : "Continue"}
        </button>`;
      case "roll":
        return html`<button
          class="mb-continue ${this.rolled ? "" : "wait"}"
          @click=${() => this.advance()}
        >
          ${this.rolled ? "Continue" : "Rolling…"}
        </button>`;
      case "choice":
        return this.renderChoice(b);
      case "investigate":
        return this.renderLookPanel(b);
      default:
        return nothing;
    }
  }

  private checkLabel(c: CheckView): TemplateResult {
    return html`<span
      class="mb-ck ${c.kind}"
      style="--c:${this.skillColor(c.skill)}"
      title=${[
        `${this.skillName(c.skill)} ${c.base}`,
        ...c.mods.map((m) => `${m.delta > 0 ? "+" : ""}${m.delta} ${m.why}`),
        `2d6 + ${c.bonus} against ${c.diff}`,
        c.kind === "red"
          ? "Red: one try only"
          : "White: can be tried again when something changes",
      ].join("\n")}
      >[${this.skillName(c.skill)} – ${c.tier} ${c.diff}]
      <b>${c.locked ? "Locked" : `${c.percent}%`}</b></span
    >`;
  }

  private renderChoice(b: ChoiceBeat): TemplateResult {
    const timed = this.prefs.timers && b.timer > 0;
    const frac = timed ? this.timeLeft / b.timer : 0;
    return html`<div class="mb-choices">
      ${b.prompt ? html`<div class="mb-prompt">${b.prompt}</div>` : nothing}
      ${timed
        ? html`<div class="mb-timer" role="timer" aria-label="Time to answer">
            <span style="transform: scaleX(${frac.toFixed(4)})"></span>
          </div>`
        : nothing}
      <ol class="mb-options">
        ${b.options.map(
          (o, i) =>
            html`<li>
              <button
                class="mb-option ${o.silent ? "silent" : ""} ${o.check?.locked
                  ? "locked"
                  : ""}"
                ?disabled=${o.check?.locked}
                @click=${() => this.choose(o.id)}
              >
                <span class="mb-key">${i + 1}.</span>
                <span class="mb-option-label"
                  >${o.check ? this.checkLabel(o.check) : nothing}
                  ${o.silent ? html`<i>…</i> ` : nothing}${o.label}</span
                >
              </button>
              ${o.check?.locked
                ? html`<div class="mb-locked-why">
                    Tried and failed. It opens again when his
                    ${this.skillName(o.check.skill)} rises or something new
                    turns up.
                  </div>`
                : nothing}
            </li>`,
        )}
      </ol>
    </div>`;
  }

  private renderLookPanel(b: InvestigateBeat): TemplateResult {
    const seen = b.spots.filter((s) => s.seen).length;
    const need = Math.min(b.min, b.spots.length);
    const flat = !this.is3d(b);
    return html`<div class="mb-look-panel">
      <div class="mb-panel-head">
        <span class="mb-read"
          >${flat ? "Look" : b.still ? "Read" : "Look around"}</span
        >
        <span class="mb-panel-title">${b.title}</span>
      </div>
      <div class="mb-count">
        ${seen} of ${b.spots.length}
        noticed${seen < need
          ? html` · ${need - seen} more before he moves on`
          : nothing}
      </div>
      ${!flat && !b.still
        ? html`<div class="mb-walk-hint">
            ${this.narrow ? "Tap" : "Click"} the floor to walk, a mark to look.
          </div>`
        : nothing}
      <ul class="mb-clues">
        ${b.spots.map(
          (s) =>
            html`<li class=${s.seen ? "seen" : ""}>
              <button
                class=${this.walkingTo === s.id ? "going" : ""}
                @click=${() => this.lookAt(s.id)}
                @pointerenter=${() => (this.hover = s.anchor ?? null)}
                @pointerleave=${() => (this.hover = null)}
              >
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
                      <span class="mb-check-mark"></span>${d.label}
                    </li>`
                  : d.ready
                    ? html`<li class="ready ${d.check?.locked ? "locked" : ""}">
                        <button
                          ?disabled=${d.check?.locked}
                          @click=${() => this.deduce(d.id)}
                        >
                          ${d.check
                            ? this.checkLabel(d.check)
                            : html`<span class="mb-spark"></span>`}
                          ${d.label}
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
        @click=${() => {
          if (b.exit && this.world) this.clickHotspot(b.exit);
          else this.leave();
        }}
      >
        ${b.leave}
      </button>
    </div>`;
  }

  // --- sheets ----------------------------------------------------------------

  private renderSheet(): TemplateResult {
    const values = this.run.skills();
    const build = this.run.build;
    const boosts = this.run.boosts;
    const arch = this.chapter.archetypes.find((a) => a.id === build.archetype);
    return html`<h2>Mr. Based</h2>
      <p class="mb-sheet-sub">
        ${arch ? html`${arch.name}. ${arch.about}` : "His own man."}
      </p>
      <div class="mb-skills">
        ${this.chapter.attributes.map(
          (a, i) =>
            html`<section
              class="mb-attr"
              style="--c:${ATTR_COLORS[i % ATTR_COLORS.length]}"
            >
              <div class="mb-attr-head">
                <b>${a.name.toUpperCase()}</b>
                <span class="mb-attr-val">${build.attrs[a.id] ?? 0}</span>
              </div>
              <p class="mb-attr-about">${a.about}</p>
              ${this.chapter.skills
                .filter((s) => s.attr === a.id)
                .map(
                  (s) =>
                    html`<div class="mb-skill">
                      <div class="mb-skill-name">
                        ${s.name}${build.signature === s.id
                          ? html` <span class="mb-sig">signature</span>`
                          : nothing}
                      </div>
                      <div class="mb-skill-val">${values[s.id] ?? 0}</div>
                      <div class="mb-skill-about">${s.about}</div>
                    </div>`,
                )}
            </section>`,
        )}
      </div>
      ${boosts.length > 0
        ? html`<div class="mb-panel-sub">On his mind</div>
            <ul class="mb-boosts">
              ${boosts.map(
                (x) =>
                  html`<li>
                    <b
                      >${x.delta > 0 ? "+" : ""}${x.delta}
                      ${this.skillName(x.skill)}</b
                    >
                    ${x.why}
                  </li>`,
              )}
            </ul>`
        : nothing}
      <p class="mb-sheet-foot">
        Checks are two dice plus the skill against the difficulty. A double six
        always succeeds, a double one always fails. White checks can be tried
        again when something changes; red ones only once. His skills also speak
        up on their own when they're good enough (skill + 6).
      </p>`;
  }

  private renderOverlay(o: Exclude<Overlay, null>): TemplateResult {
    const close = html`<button
      class="mb-x"
      aria-label="Close"
      @click=${() => this.closeOverlay()}
    >
      ${closeIcon()}
    </button>`;
    const sheet = (body: TemplateResult, cls = "") =>
      html`<div class="mb-overlay" @click=${(e: Event) => e.stopPropagation()}>
        <div class="mb-sheet ${cls}">${close} ${body}</div>
      </div>`;
    if (o === "note") {
      const b = this.beat;
      const on =
        b.kind === "line"
          ? plainText(b.text)
          : b.kind === "choice"
            ? b.prompt || "A choice"
            : b.kind === "investigate"
              ? b.title
              : b.kind === "roll"
                ? b.label
                : "";
      return sheet(
        html`<h2>Note for the writer</h2>
          <p class="mb-sheet-sub">
            Scene “${this.sceneLabel}” ·
            ${on
              ? html`on “${on.slice(0, 120)}${on.length > 120 ? "…" : ""}”`
              : nothing}
          </p>
          <textarea
            rows="5"
            maxlength="4000"
            placeholder="What should change? A line, a choice, a check, the room, the pace…"
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
                      <div class="mb-note-text">${n.note}</div>
                    </div>`,
                )}
              </div>`
            : nothing}`,
      );
    }
    if (o === "sheet") return sheet(this.renderSheet(), "tall");
    if (o === "settings") {
      const speed = (s: TextSpeed, label: string) =>
        html`<button
          class="mb-seg ${this.prefs.speed === s ? "on" : ""}"
          aria-pressed=${this.prefs.speed === s}
          @click=${() => this.setPref("speed", s)}
        >
          ${label}
        </button>`;
      return sheet(
        html`<h2>Settings</h2>
          ${settingsBody(this.prefs, (k, v) => this.setPref(k, v), speed)}
          <button class="mb-btn" @click=${() => (this.overlay = "menu")}>
            Back
          </button>`,
      );
    }
    if (o === "log") {
      return sheet(
        html`<h2>The story so far</h2>
          <div class="mb-log">
            ${this.log.map(
              (l) =>
                html`<p class="mb-log-line ${l.kind}">
                  ${l.who
                    ? html`<b>${this.nameOf(l.who)}</b> `
                    : l.skill && l.kind !== "pick"
                      ? html`<b>${this.skillName(l.skill)}</b> `
                      : nothing}${l.kind === "roll" && l.roll
                    ? `[${l.roll.tier} ${l.roll.diff}] ${l.roll.pass ? "Success" : "Failure"}: ${l.text}`
                    : plainText(l.text)}
                </p>`,
            )}
          </div>
          <button class="mb-btn" @click=${() => (this.overlay = "menu")}>
            Back
          </button>`,
        "tall",
      );
    }
    if (o === "credits") {
      return sheet(
        html`${creditsBody(this.credits)}
          <button class="mb-btn" @click=${() => (this.overlay = "menu")}>
            Back
          </button>`,
        "tall",
      );
    }
    return sheet(
      html`<div class="mb-menu-title">Mr. Based</div>
        <div class="mb-sheet-sub">
          Chapter ${this.chapter.n}: ${this.chapter.title}
        </div>
        <nav class="mb-menu">
          <button class="mb-btn primary" @click=${() => this.closeOverlay()}>
            Resume
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "sheet")}>
            His skills
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
        </p>`,
      "menu",
    );
  }
}

/** A die's face as pips. */
function dieFace(n: number): TemplateResult {
  const v = Math.max(1, Math.min(6, Math.floor(n)));
  const pips: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [
      [0, 0],
      [2, 2],
    ],
    3: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    4: [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ],
    5: [
      [0, 0],
      [2, 0],
      [1, 1],
      [0, 2],
      [2, 2],
    ],
    6: [
      [0, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [2, 2],
    ],
  };
  return html`<svg
    viewBox="0 0 30 30"
    width="30"
    height="30"
    aria-label=${String(v)}
  >
    <rect x="1" y="1" width="28" height="28" rx="6" />
    ${pips[v].map(
      ([x, y]) =>
        svg`<circle cx=${7 + x * 8} cy=${7 + y * 8} r="2.6"></circle>`,
    )}
  </svg>`;
}
