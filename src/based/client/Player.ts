// Mr. Based's player (r21), in the manner of Disco Elysium: the place in 3D
// on the left, seen from above at an angle, where he walks where you click;
// the dialogue column on the right (a bottom sheet on a phone), where the
// story scrolls up with speakers' names, his skills' voices, the dice, and
// numbered choices. Memories are painted vignettes in the column.
//
// r22: an open world. After a short opening he's free: the player walks
// him about (double-click runs), goes through doors into other places (a
// short fade and the place's name), and finds what's worth a look by
// walking near it: it glints when he can see it, Tab shows what's near.
// Clicking a person talks; clicking a thing he's noticed walks him over
// and looks. Seated, he reads the room from his seat (drag or the arrow
// keys to look about). Thoughts that come to him wait in the column. His
// journal (J) keeps what he's set out to do. The game saves in slots (F5,
// F9, the menu), and to an autosave as he goes.
//
// The story itself comes from the server; this file and the world know
// nothing of it.

import { html, LitElement, nothing, render, svg, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { neighbours, PlaceDef } from "../engine/Place";
import {
  Available,
  Beat,
  chapterStart,
  CheckView,
  ChoiceBeat,
  clockText,
  emptyStage,
  InvestigateBeat,
  LineBeat,
  RollBeat,
  Stage,
  StoryEvent,
  StoryRun,
} from "../engine/Runtime";
import { slotOf, SlotSave } from "../engine/Save";
import { Boost, fluency, LANGUAGES_SKILL } from "../engine/Skills";
import { Build, Chapter } from "../engine/Types";
import {
  Credit,
  leaveNote,
  mediaNow,
  notesFor,
  SlotInfo,
  WriterNote,
} from "./Api";
import { helpBody } from "./Help";
import { CPS, Prefs, savePrefs, TextSpeed } from "./Prefs";
import { Ambience } from "./Sound";
import {
  bookIcon,
  closeIcon,
  creditsBody,
  eyeIcon,
  menuIcon,
  muteIcon,
  penIcon,
  personIcon,
  plainText,
  settingsBody,
  slotsBody,
  soundIcon,
  typed,
} from "./Ui";
import { WorldAssets } from "./world/Assets";
import { pickTier, ThingOnScreen, World } from "./world/World";

export interface PlayerHost {
  /** Saves to a slot (the autosave, the quicksave or one of his own). */
  save(slot: string, save: SlotSave): Promise<void>;
  /** Loads a slot: the player starts again from it. */
  load(slot: string): void;
  /** What he's seen: scenes entered, picks, things found (for the flowchart). */
  seen(path: string[], found?: string[]): void;
  /** An option was taken (or the clock took one). */
  pick(choice: string, option: string): void;
  /** Seconds played since the last call. */
  played(seconds: number): void;
  /** The chapter is over. */
  end(run: StoryRun): void;
  /** Back to the title screen. */
  quit(): void;
}

interface Toast {
  id: number;
  text: string;
  kind: "remember" | "rel" | "task" | "boost" | "help" | "saved";
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
  /** r22: said in another language. */
  lang?: LineBeat["lang"];
}

type Overlay =
  | null
  | "menu"
  | "note"
  | "settings"
  | "log"
  | "credits"
  | "sheet"
  | "help"
  | "journal"
  | "save"
  | "load";

let nextId = 1;

/** Each attribute's colour in the column, as Disco Elysium colours its four. */
const ATTR_COLORS = ["#e0715a", "#7fb2e5", "#d9b45a", "#b98be0"];

/** How often the game saves by itself while he's free, in seconds. */
const AUTOSAVE_EVERY = 120;

@customElement("based-player")
export class BasedPlayer extends LitElement {
  @property({ attribute: false }) chapter!: Chapter;
  @property({ attribute: false }) from: SlotSave | null = null;
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
  @property({ attribute: false }) slots: SlotInfo[] = [];
  @property({ attribute: false }) played = 0;

  @state() private beat: Beat = { kind: "end" };
  @state() private stage: Stage = emptyStage();
  @state() private entries: Entry[] = [];
  @state() private toasts: Toast[] = [];
  @state() private timed = 0;
  @state() private overlay: Overlay = null;
  @state() private sceneLabel = "";
  @state() private noteText = "";
  @state() private noteState: "idle" | "saving" | "saved" | "failed" = "idle";
  @state() private notes: WriterNote[] = [];
  @state() private size = { w: window.innerWidth, h: window.innerHeight };
  @state() private hover: string | null = null;
  @state() private card: { title: string; sub?: string } | null = null;
  @state() private placeCard: string | null = null;
  @state() private rolled = false;
  @state() private tab = false;
  @state() private noWorld = false;
  @state() private avail: Available = { talk: [], look: [], think: [] };
  @state() private onScreen: ThingOnScreen[] = [];
  @state() private seated = false;
  @state() private saving: string | null = null;
  @state() private typingNow = false;

  private run!: StoryRun;
  private world: World | null = null;
  private log: Entry[] = [];
  /** Characters of the live line shown so far (not a state: see typeLine). */
  private shown = 0;
  private typeStart = 0;
  private typeFrame = 0;
  private timerLeft = 0;
  private timerStart = 0;
  private timerTimeout = 0;
  private rollTimer = 0;
  private talkTimer = 0;
  private placeTimer = 0;
  private busy = false;
  private marks = new Map<string, HTMLElement>();
  private lastSave = 0;
  private playClock = 0;
  private playTick = 0;
  private sinceAuto = 0;
  private autoTimer = 0;

  createRenderRoot() {
    return this;
  }

  // --- life ----------------------------------------------------------------

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisible);
    const start =
      this.from?.snap ??
      chapterStart(this.chapter, this.carried ?? undefined, {
        build: this.build,
        seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 || 1,
      });
    if (this.build && !start.build) start.build = this.build;
    this.run = new StoryRun(this.chapter, start);
    this.playClock = performance.now();
    this.playTick = window.setInterval(() => this.countPlayed(), 15_000);
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
            hotspot: (id, o) => this.clickThing(id, o.seated, o.run),
            floor: (x, z, run) => this.clickFloor(x, z, run),
            person: (id) => this.clickPerson(id),
            hover: (id) => (this.hover = id),
          },
        );
        this.world.hero = this.chapter.cast[0]?.id ?? "";
        this.world.onThings = (h) => this.moveMarks(h);
        this.world.showAll = this.prefs.marks;
        this.placeInset();
      } catch {
        this.world = null;
        this.noWorld = true;
      }
    } else {
      this.noWorld = true;
    }
    this.afterStep(true);
    if (this.from?.world) this.world?.restoreHero(this.from.world);
    if (!this.from && !this.carried) this.hintHelp();
  }

  /** Once per browser, at the start: where the help is. */
  private hintHelp(): void {
    try {
      if (localStorage.getItem("based_help_hint_r22")) return;
      localStorage.setItem("based_help_hint_r22", "1");
    } catch {
      return;
    }
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    window.setTimeout(
      () =>
        this.toast(
          touch
            ? "New here? How to play is in the menu. Tap twice to run."
            : "New here? Press H for how to play. Double-click to run.",
          "help",
        ),
      2500,
    );
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.countPlayed();
    cancelAnimationFrame(this.typeFrame);
    window.clearTimeout(this.timerTimeout);
    window.clearTimeout(this.rollTimer);
    window.clearTimeout(this.talkTimer);
    window.clearTimeout(this.placeTimer);
    window.clearTimeout(this.autoTimer);
    window.clearInterval(this.playTick);
    this.world?.dispose();
    this.world = null;
    super.disconnectedCallback();
  }

  updated(): void {
    // The newest line at the bottom of the column, always in view.
    const logEl = this.querySelector(".mb-col-log");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
    if (this.typingNow) this.drawLive();
  }

  private get narrow(): boolean {
    return this.size.w < 760 || this.size.w / this.size.h < 0.9;
  }

  private placeInset(): void {
    if (!this.world) return;
    const n = this.narrow;
    const colW = n ? 0 : Math.min(460, Math.max(360, this.size.w * 0.32));
    const sheetH = n ? this.size.h * 0.44 : 0;
    this.inset = { right: colW, bottom: sheetH };
    this.world.setInset(colW, sheetH);
  }

  /** How much of the world the column covers (right, or bottom on phones). */
  private inset = { right: 0, bottom: 0 };

  /** Time at the game, counted while the page is in view. */
  private countPlayed(): void {
    const now = performance.now();
    if (document.visibilityState === "visible" && this.playClock > 0) {
      const s = Math.min(600, (now - this.playClock) / 1000);
      if (s > 0) {
        this.played += s;
        this.sinceAuto += s;
        this.host?.played(s);
      }
    }
    this.playClock = now;
    if (this.sinceAuto >= AUTOSAVE_EVERY && this.run?.free) this.autosave();
  }

  private onVisible = () => this.countPlayed();

  // --- stepping ------------------------------------------------------------

  private afterStep(first = false): void {
    const events = this.run.drain();
    this.syncStage(first);
    for (const e of events) this.onEvent(e, first);
    const b = this.run.beat;
    this.beat = b;
    window.clearTimeout(this.timerTimeout);
    window.clearTimeout(this.rollTimer);
    this.timed = 0;
    this.card = null;
    this.busy = false;
    this.setWorldState(b);
    if (b.kind === "line") {
      const voice = b.voice;
      const e: Entry = {
        id: nextId++,
        kind: voice ? "voice" : b.line,
        who: b.who,
        how: b.how,
        text: b.text,
        lang: b.lang,
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
    } else if (b.kind === "investigate" || b.kind === "free") {
      this.talk(null);
    } else if (b.kind === "end") {
      this.talk(null);
      this.host.seen(this.run.history());
      this.host.end(this.run);
    }
  }

  private push(e: Entry): void {
    this.log.push(e);
    if (this.log.length > 600) this.log.shift();
    this.entries = [...this.entries, e].slice(-90);
  }

  private onEvent(e: StoryEvent, first: boolean): void {
    switch (e.type) {
      case "scene":
        this.sceneLabel = e.label;
        this.host.seen([`s:${e.scene}`]);
        // A save as each scene begins: the autosave, a moment later.
        if (!first) this.autosaveSoon();
        break;
      case "free":
        if (!first) this.autosaveSoon();
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
      case "task":
        if (!first) {
          this.toast(
            e.done
              ? `Done: ${e.text}`
              : e.fresh
                ? `Journal: ${e.text}`
                : `Journal updated: ${e.text}`,
            "task",
          );
        }
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
        const def = s.place ? (this.places[s.place] ?? null) : null;
        w.setPlace(def);
        w.placeCast(s.actors);
        for (const [k, on] of Object.entries(s.props)) w.setProp(k, on);
        if (def) this.prepareAround(def);
        if (!first && def) this.showPlace(def.name);
      }
      if (first || s.focus !== was.focus) w.setFocus(s.focus);
      if (first || s.news !== was.news) w.setNews(s.news);
      if (first || s.weather !== was.weather) w.setWeather(s.weather);
    }
    if (s.ambient !== was.ambient || first) void this.ambience.play(s.ambient);
    this.stage = s;
  }

  /** Builds the places next door in the background; frees the rest. */
  private prepareAround(def: PlaceDef): void {
    const w = this.world;
    if (!w) return;
    const next = neighbours(def).filter((k) => this.places[k]);
    w.keepOnly(next);
    for (const k of next) void w.prepare(this.places[k]);
  }

  /** The place's name, for a moment, as he arrives. */
  private showPlace(name: string): void {
    window.clearTimeout(this.placeTimer);
    this.placeCard = name;
    this.placeTimer = window.setTimeout(() => (this.placeCard = null), 1800);
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
      kind === "help"
        ? 7000
        : kind === "remember" || kind === "boost" || kind === "task"
          ? 4200
          : 3000,
    );
  }

  // --- typing (r22: draws only the live line, not the whole column) --------

  private startTyping(): void {
    cancelAnimationFrame(this.typeFrame);
    const b = this.beat;
    if (b.kind !== "line") return;
    const len = plainText(b.text).length;
    const cps = CPS[this.prefs.speed];
    if (cps === 0) {
      this.shown = len;
      this.typingNow = false;
      this.doneTyping();
      return;
    }
    this.shown = 0;
    this.typingNow = true;
    this.typeStart = performance.now();
    const tick = (now: number) => {
      this.shown = Math.min(
        len,
        Math.floor(((now - this.typeStart) / 1000) * cps),
      );
      this.drawLive();
      if (this.shown < len) this.typeFrame = requestAnimationFrame(tick);
      else {
        this.typingNow = false;
        this.doneTyping();
      }
    };
    this.typeFrame = requestAnimationFrame(tick);
  }

  /** The live line's words so far, drawn into its own little element. */
  private drawLive(): void {
    const el = this.querySelector<HTMLElement>(".mb-live");
    const b = this.beat;
    if (el && b.kind === "line") render(typed(b.text, this.shown), el);
  }

  private doneTyping(): void {
    window.clearTimeout(this.talkTimer);
    this.talkTimer = window.setTimeout(() => this.world?.setTalking(null), 400);
  }

  private get typing(): boolean {
    const b = this.beat;
    return b.kind === "line" && this.shown < plainText(b.text).length;
  }

  private finishTyping(): void {
    const b = this.beat;
    if (b.kind !== "line") return;
    cancelAnimationFrame(this.typeFrame);
    this.shown = plainText(b.text).length;
    this.typingNow = false;
    this.drawLive();
    this.doneTyping();
  }

  // --- the clock on a choice (r22: a CSS animation, not a frame loop) -----

  private startTimer(seconds: number): void {
    window.clearTimeout(this.timerTimeout);
    if (!this.prefs.timers || seconds <= 0) {
      this.timed = 0;
      return;
    }
    this.timed = seconds;
    this.timerLeft = seconds * 1000;
    this.resumeTimer();
  }

  private pauseTimer(): void {
    if (this.timed > 0 && this.timerTimeout) {
      window.clearTimeout(this.timerTimeout);
      this.timerTimeout = 0;
      this.timerLeft -= performance.now() - this.timerStart;
    }
  }

  private resumeTimer(): void {
    if (this.timed > 0 && this.beat.kind === "choice" && !this.timerTimeout) {
      this.timerStart = performance.now();
      this.timerTimeout = window.setTimeout(
        () => this.timeout(),
        Math.max(0, this.timerLeft),
      );
    }
  }

  // --- moving the story on ---------------------------------------------------

  private advance(): void {
    this.ambience.unlock();
    if (this.overlay !== null) return;
    const b = this.beat;
    if (b.kind === "line") {
      if (this.typing) {
        this.finishTyping();
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
    window.clearTimeout(this.timerTimeout);
    this.timerTimeout = 0;
    this.push({
      id: nextId++,
      kind: "pick",
      text: opt.silent ? "Say nothing." : opt.label,
      skill: opt.check?.skill,
    });
    this.run.choose(id);
    this.host.pick(b.id, id);
    this.host.seen([`c:${b.id}=${id}`]);
    this.afterStep();
  }

  private timeout(): void {
    this.timerTimeout = 0;
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
    this.host.seen([], [id]);
    this.afterStep();
  }

  private deduce(id: string): void {
    if (this.beat.kind !== "investigate") return;
    this.run.deduce(id);
    this.host.seen([], [id]);
    this.afterStep();
  }

  private leave(): void {
    if (this.beat.kind !== "investigate" || !this.beat.canLeave) return;
    this.run.leave();
    this.afterStep();
  }

  private think(id: string): void {
    this.ambience.unlock();
    if (!this.run.free || this.overlay) return;
    this.run.think(id);
    this.afterStep();
  }

  // --- the world -------------------------------------------------------------

  /**
   * r22: what's worth a look where he is, and who'll talk: things with a
   * scene now, and the doors (while he's free); the spots of a room he's
   * reading. Nothing else glints, and nothing is listed.
   */
  private setWorldState(b: Beat): void {
    const w = this.world;
    const here = this.stage.place ? this.places[this.stage.place] : undefined;
    const things = new Map<string, { door: boolean }>();
    let avail: Available = { talk: [], look: [], think: [] };
    if (b.kind === "free") {
      avail = this.run.available(Object.keys(here?.hotspots ?? {}));
      for (const id of avail.look) {
        if (here?.hotspots[id]) things.set(id, { door: false });
      }
      for (const [id, h] of Object.entries(here?.hotspots ?? {})) {
        if (h.to && this.places[h.to.place]) things.set(id, { door: true });
      }
    } else if (b.kind === "investigate" && this.is3d(b)) {
      for (const s of b.spots) {
        if (!s.seen) things.set(s.anchor ?? s.id, { door: false });
      }
      if (b.exit) things.set(b.exit, { door: true });
    }
    this.avail = avail;
    if (!w) return;
    w.things = things;
    w.talkers = new Set(avail.talk.map((x) => this.bodyOf(x)));
    w.walkable =
      b.kind === "free" ||
      (b.kind === "investigate" && this.is3d(b) && !b.still);
    w.still = b.kind === "investigate" && b.still;
    w.perception = this.run.skills().PERCEPTION ?? 2;
    this.seated = w.heroSeated || w.still;
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

  /** A thing (or door) clicked in the world, or its label. */
  private clickThing(id: string, seated: boolean, run: boolean): void {
    this.ambience.unlock();
    const b = this.beat;
    const w = this.world;
    if (this.overlay || this.busy || !w) return;
    const here = this.stage.place ? this.places[this.stage.place] : undefined;
    const h = here?.hotspots[id];
    if (b.kind === "free") {
      if (h?.to) {
        const to = h.to;
        this.busy = true;
        w.walkToHotspot(
          id,
          () => {
            this.busy = false;
            if (!this.run.free) return;
            // The story may stop him at the door; otherwise, through it.
            if (this.run.look(id)) this.afterStep();
            else void this.travel(to.place, to.mark);
          },
          run,
        );
        return;
      }
      if (!w.things.has(id)) return;
      if (seated || w.heroSeated) {
        // Read from his seat: turn, and look.
        w.faceHotspot(id);
        this.lookAt(id);
        return;
      }
      this.busy = true;
      w.walkToHotspot(
        id,
        () => {
          this.busy = false;
          this.lookAt(id);
        },
        run,
      );
      return;
    }
    if (b.kind !== "investigate") return;
    if (id === b.exit) {
      if (!b.canLeave) {
        const need =
          Math.min(b.min, b.spots.length) -
          b.spots.filter((s) => s.seen).length;
        this.toast(`Not yet: there's more to notice (${need}).`, "rel");
        return;
      }
      this.busy = true;
      w.walkToHotspot(
        id,
        () => {
          this.busy = false;
          this.leave();
        },
        run,
      );
      return;
    }
    const spot = this.spotFor(id);
    if (!spot) return;
    if (b.still || seated || spot.anchor === undefined) {
      w.faceHotspot(id);
      this.examine(spot.id);
      return;
    }
    this.busy = true;
    w.walkToHotspot(
      spot.anchor,
      () => {
        this.busy = false;
        if (this.beat.kind === "investigate") this.examine(spot.id);
      },
      run,
    );
  }

  private lookAt(id: string): void {
    if (!this.run.free) return;
    if (this.run.look(id)) {
      this.host.seen([], [id]);
      this.afterStep();
    }
  }

  /** Someone clicked: he goes up to them and talks, if they've anything. */
  private clickPerson(id: string): void {
    this.ambience.unlock();
    const w = this.world;
    if (!this.run.free || this.overlay || this.busy || !w) return;
    const cast = this.chapter.cast
      .filter((c) => (c.body ?? c.id) === id)
      .map((c) => c.id);
    const who = this.avail.talk.find((t) => cast.includes(t) || t === id);
    if (!who) {
      this.toast("Nothing to say to them just now.", "rel");
      return;
    }
    const start = () => {
      this.busy = false;
      if (!this.run.free) return;
      if (this.run.talk(who)) this.afterStep();
    };
    if (w.heroSeated) {
      start();
      return;
    }
    this.busy = true;
    if (!w.walkUpTo(id, start)) start();
  }

  private clickFloor(x: number, z: number, run: boolean): void {
    const b = this.beat;
    if (this.overlay) return;
    if (this.world?.walkable) {
      this.busy = false;
      this.world.walkHero(x, z, run);
      return;
    }
    // Anywhere else, a click on the world moves the story on.
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      this.advance();
    }
  }

  /** Through a door: a fade, the next place, its name. */
  private async travel(place: string, mark: string): Promise<void> {
    const w = this.world;
    const def = this.places[place];
    if (!w || !def || !this.run.free) return;
    this.busy = true;
    const ready = w.prepare(def);
    await w.fadeOut();
    // Built and compiled next door already, nearly always; if not, it's
    // finished now, behind the black.
    await Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]);
    this.busy = false;
    this.run.enterPlace(place, mark);
    this.afterStep();
  }

  /** Keeps the labels over what he's noticed as the camera moves. */
  private moveMarks(list: ThingOnScreen[]): void {
    this.onScreen = list;
    for (const h of list) {
      let el = this.marks.get(h.id);
      if (!el || !el.isConnected) {
        el =
          this.querySelector<HTMLElement>(`.mb-mark[data-id="${h.id}"]`) ??
          undefined;
        if (!el) continue;
        this.marks.set(h.id, el);
      }
      el.style.transform = `translate(${h.x}px, ${h.y}px)`;
      el.style.visibility = h.visible ? "visible" : "hidden";
      el.dataset.side =
        h.x > (this.size.w - this.inset.right) * 0.72 ? "left" : "right";
    }
  }

  // --- saving and loading (r22) ----------------------------------------------

  private slotFor(): SlotSave {
    const place = this.stage.place ? this.places[this.stage.place] : undefined;
    const world = this.run.free ? this.world?.heroState() : null;
    return slotOf(this.run, {
      placeName: place?.name ?? "",
      played: this.played,
      savedAt: new Date().toISOString(),
      world: world ?? undefined,
    });
  }

  private autosaveSoon(): void {
    window.clearTimeout(this.autoTimer);
    this.autoTimer = window.setTimeout(() => this.autosave(), 1500);
  }

  private autosave(): void {
    window.clearTimeout(this.autoTimer);
    if (this.beat.kind === "end") return;
    this.sinceAuto = 0;
    void this.host.save("auto", this.slotFor()).catch(() => {});
  }

  private async saveTo(slot: string): Promise<void> {
    this.countPlayed();
    this.saving = slot;
    try {
      await this.host.save(slot, this.slotFor());
      this.toast(
        slot === "quick" ? "Quicksaved." : `Saved in slot ${slot}.`,
        "saved",
      );
      if (this.overlay === "save") this.closeOverlay();
    } catch {
      this.toast("That didn't save. Try again?", "saved");
    } finally {
      this.saving = null;
    }
  }

  private loadFrom(slot: string): void {
    if (!this.slots.some((s) => s.slot === slot)) {
      this.toast(
        slot === "quick" ? "No quicksave yet." : "That slot is empty.",
        "saved",
      );
      return;
    }
    this.countPlayed();
    this.host.load(slot);
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
    if (e.key === "F5") {
      e.preventDefault();
      void this.saveTo("quick");
      return;
    }
    if (e.key === "F9") {
      e.preventDefault();
      this.loadFrom("quick");
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
      if (this.world) this.world.showAll = true;
      return;
    }
    if (this.overlay !== null) return;
    const b = this.beat;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [-0.7, 0.7],
      ArrowRight: [0.7, -0.7],
      ArrowUp: [-0.7, -0.7],
      ArrowDown: [0.7, 0.7],
    };
    if (
      pan[e.key] &&
      this.world &&
      (this.world.heroSeated || this.world.still)
    ) {
      e.preventDefault();
      this.world.pan(...pan[e.key]);
      return;
    }
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
    } else if (e.key === "j" || e.key === "J") {
      this.openOverlay("journal");
    } else if (e.key === "h" || e.key === "H" || e.key === "?") {
      this.openOverlay("help");
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      this.tab = false;
      if (this.world) this.world.showAll = this.prefs.marks;
    }
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
                : b.kind === "free"
                  ? `[free] ${this.stage.place ? (this.places[this.stage.place]?.name ?? "") : ""}`
                  : "";
    try {
      await leaveNote({
        chapter: this.chapter.n,
        scene: this.run.sceneId,
        line,
        path: this.run.history().slice(-300),
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
    if (k === "marks" && this.world) this.world.showAll = !!v || this.tab;
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
            This story is drawn in 3D, which this browser can't show (WebGL is
            off). It plays on in the column.
          </div>`
        : nothing}
      ${flat ? this.renderFlat(flat) : nothing} ${this.renderMarks()}
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
      ${this.placeCard
        ? html`<div class="mb-placecard" aria-live="polite">
            ${this.placeCard}
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

  /**
   * Labels over what he's noticed: shown on hover, or for what's near him
   * while Tab is held (or the eye is on). Only what he's noticed is here at
   * all; nothing in the place is listed.
   */
  private renderMarks(): TemplateResult | typeof nothing {
    const w = this.world;
    if (!w || this.onScreen.length === 0) return nothing;
    const here = this.stage.place ? this.places[this.stage.place] : undefined;
    const b = this.beat;
    return html`<div class="mb-marks">
      ${this.onScreen.map((t) => {
        const h = here?.hotspots[t.id];
        const spot = b.kind === "investigate" ? this.spotFor(t.id) : null;
        const label = t.door
          ? (h?.label ?? "A door")
          : (spot?.label ?? h?.label ?? this.thingLabel(t.id));
        return html`<button
          class="mb-mark ${t.door ? "exit" : ""} ${t.near
            ? "near"
            : "seen"} ${this.hover === t.id ? "hover" : ""}"
          data-id=${t.id}
          aria-label=${label}
          style="transform: translate(${t.x}px, ${t.y}px)"
          @click=${() =>
            this.clickThing(t.id, this.world?.heroSeated ?? false, false)}
          @pointerenter=${() => (this.hover = t.id)}
          @pointerleave=${() => (this.hover = null)}
        >
          <span class="mb-mark-dot"></span>
          <span class="mb-mark-label">${label}</span>
        </button>`;
      })}
    </div>`;
  }

  /** What a thing is called: the label its first scene gives it. */
  private thingLabel(id: string): string {
    for (const sid of this.chapter.order) {
      const s = this.chapter.scenes[sid];
      if (s.trigger?.on === "look" && s.trigger.target === id) return s.label;
    }
    return id.replace(/_/g, " ");
  }

  /** Looking at something flat, held up close: a photograph, a letter. */
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
    const place = this.stage.place ? this.places[this.stage.place] : undefined;
    const clock = clockText(this.run.clock);
    return html`<div class="mb-hud">
      <div class="mb-where">
        <span class="mb-where-ch">${place?.name ?? this.sceneLabel}</span>
        <span class="mb-where-scene mb-clock">${clock.time}</span>
      </div>
      <div class="mb-hud-buttons">
        <button
          class="mb-icon"
          title="Your skills (C)"
          aria-label="Your skills"
          @click=${() => this.openOverlay("sheet")}
        >
          ${personIcon()}
        </button>
        <button
          class="mb-icon"
          title="Journal (J)"
          aria-label="Journal"
          @click=${() => this.openOverlay("journal")}
        >
          ${bookIcon()}
        </button>
        <button
          class="mb-icon ${this.prefs.marks ? "on" : ""}"
          title="Show what's near him (hold Tab)"
          aria-label="Show what's near him"
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

  /** Words in another language: what it means, or what was said. */
  private langTag(l: NonNullable<Entry["lang"]>): TemplateResult {
    if (!l.understood) {
      return html`<span class="mb-e-lang lost" title="He doesn't speak it"
        >${l.name}</span
      >`;
    }
    return html`<span
      class="mb-e-lang"
      title=${l.via === "skill"
        ? `Languages – ${l.tier ?? ""}: he caught the gist. Said: “${l.original}”`
        : `In ${l.name}: “${l.original}”`}
      >${l.via === "skill" ? `${l.name}, the gist` : l.name}</span
    >`;
  }

  private renderEntry(e: Entry, last: boolean): TemplateResult {
    const live = last && this.beat.kind === "line" && this.typingNow;
    const text = live
      ? html`<span class="mb-live">${typed(e.text, this.shown)}</span>`
      : html`${typed(e.text, 1e9)}`;
    const hero = this.chapter.cast[0]?.id;
    switch (e.kind) {
      case "say":
        return html`<p
          class="mb-e say ${e.who === hero ? "hero" : ""} ${e.lang &&
          !e.lang.understood
            ? "foreign"
            : ""}"
        >
          <b class="mb-e-who">${this.nameOf(e.who ?? "").toUpperCase()}</b
          >${e.how
            ? html` <i class="mb-e-how">(${e.how})</i>`
            : nothing}${e.lang ? html` ${this.langTag(e.lang)}` : nothing}
          – ${text}
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
                  >${dieFace(pending ? ((i * 3 + 2) % 6) + 1 : d)}</span
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
          ${this.typingNow ? "…" : "Continue"}
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
      case "free":
        return this.renderFree();
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
    const timed = this.prefs.timers && this.timed > 0;
    return html`<div class="mb-choices">
      ${b.prompt ? html`<div class="mb-prompt">${b.prompt}</div>` : nothing}
      ${timed
        ? html`<div
            class="mb-timer ${this.overlay ? "paused" : ""}"
            role="timer"
            aria-label="Time to answer"
          >
            <span style="animation-duration:${this.timed}s"></span>
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

  /**
   * Reading a room or a man (r22): no list of what's there. Marks appear on
   * what he notices as he looks about; what it adds up to comes to him as a
   * thought, here, when he's noticed enough.
   */
  private renderLookPanel(b: InvestigateBeat): TemplateResult {
    const flat = !this.is3d(b);
    const ready = b.deductions.filter((d) => d.ready && !d.done);
    const done = b.deductions.filter((d) => d.done);
    return html`<div class="mb-look-panel">
      <div class="mb-panel-head">
        <span class="mb-read"
          >${flat ? "Look" : b.still ? "Read" : "Look"}</span
        >
        <span class="mb-panel-title">${b.title}</span>
      </div>
      <div class="mb-walk-hint">
        ${flat
          ? html`${this.narrow ? "Tap" : "Click"} what catches his eye.`
          : b.still
            ? html`He reads it from where he sits.
              ${this.narrow
                ? "Drag to look about; tap what he sees."
                : "Drag, or the arrow keys, to look about; click what he sees."}`
            : html`Walk about; what he notices glints.
              ${this.narrow
                ? ""
                : html`Hold <kbd>Tab</kbd> to see what's near.`}`}
      </div>
      ${ready.length > 0 || done.length > 0
        ? html`<ul class="mb-thoughts">
            ${done.map(
              (d) =>
                html`<li class="done">
                  <span class="mb-check-mark"></span>${d.label}
                </li>`,
            )}
            ${ready.map(
              (d) =>
                html`<li class="ready ${d.check?.locked ? "locked" : ""}">
                  <button
                    ?disabled=${d.check?.locked}
                    @click=${() => this.deduce(d.id)}
                  >
                    ${d.check
                      ? this.checkLabel(d.check)
                      : html`<span class="mb-spark"></span>`}
                    ${d.label}
                  </button>
                </li>`,
            )}
          </ul>`
        : nothing}
      ${b.canLeave
        ? html`<button
            class="mb-leave"
            @click=${() => {
              if (b.exit && this.world) this.clickThing(b.exit, false, false);
              else this.leave();
            }}
          >
            ${b.leave}
          </button>`
        : nothing}
    </div>`;
  }

  /** Free: thoughts he can follow, and a word on what to do. */
  private renderFree(): TemplateResult {
    const t = this.avail.think;
    const journal = this.run.tasks.filter((x) => !x.done);
    return html`<div class="mb-free">
      ${t.length > 0
        ? html`<ul class="mb-thoughts">
            ${t.map(
              (x) =>
                html`<li class="ready">
                  <button @click=${() => this.think(x.id)}>
                    <span class="mb-spark"></span>${x.label}
                  </button>
                </li>`,
            )}
          </ul>`
        : nothing}
      ${journal.length > 0
        ? html`<button
            class="mb-free-task"
            @click=${() => this.openOverlay("journal")}
          >
            ${journal[journal.length - 1].text}
          </button>`
        : nothing}
      <div class="mb-walk-hint">
        ${this.seated
          ? this.narrow
            ? "Seated. Drag to look about the room; tap the floor to get up."
            : "Seated. Drag (or the arrow keys) to look about the room; click the floor to get up."
          : this.narrow
            ? "Tap to walk, twice to run. Tap what catches his eye."
            : "Click to walk, double-click to run. What he notices glints."}
      </div>
    </div>`;
  }

  // --- sheets ----------------------------------------------------------------

  private renderSheet(): TemplateResult {
    const values = this.run.skills();
    const build = this.run.build;
    const boosts = this.run.boosts;
    const arch = this.chapter.archetypes.find((a) => a.id === build.archetype);
    const langs = (build.langs ?? [])
      .map((c) => this.chapter.languages.find((l) => l.code === c)?.name ?? c)
      .join(", ");
    return html`<h2>Your skills</h2>
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
      ${langs
        ? html`<p class="mb-sheet-langs">
            <b>Speaks</b> ${langs}, ${fluency(values[LANGUAGES_SKILL] ?? 0)};
            and American English.
          </p>`
        : nothing}
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

  private renderJournal(): TemplateResult {
    const tasks = this.run.tasks;
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const clock = clockText(this.run.clock);
    return html`<h2>Journal</h2>
      <p class="mb-sheet-sub">
        ${clock.day > 0 ? `Night ${clock.day + 1}, ` : ""}${clock.time}. What
        he's set out to do.
      </p>
      ${open.length === 0
        ? html`<p class="mb-p">Nothing, for now.</p>`
        : html`<ul class="mb-journal">
            ${open.map((t) => html`<li>${t.text}</li>`)}
          </ul>`}
      ${done.length > 0
        ? html`<div class="mb-panel-sub">Done</div>
            <ul class="mb-journal done">
              ${done.map((t) => html`<li>${t.text}</li>`)}
            </ul>`
        : nothing}`;
  }

  private renderOverlay(o: Exclude<Overlay, null>): TemplateResult {
    const close = html`<button
      class="mb-x"
      aria-label="Close"
      @click=${() => this.closeOverlay()}
    >
      ${closeIcon()}
    </button>`;
    const back = html`<button
      class="mb-btn"
      @click=${() => (this.overlay = "menu")}
    >
      Back
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
            ${this.run.free ? "Exploring" : html`Scene “${this.sceneLabel}”`} ·
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
    if (o === "sheet")
      return sheet(html`${this.renderSheet()} ${back}`, "tall");
    if (o === "journal") return sheet(html`${this.renderJournal()} ${back}`);
    if (o === "save" || o === "load") {
      return sheet(
        html`<h2>${o === "save" ? "Save game" : "Load game"}</h2>
          ${slotsBody({
            slots: this.slots,
            mode: o,
            busy: this.saving,
            pick: (slot) => {
              if (o === "save") void this.saveTo(slot);
              else this.loadFrom(slot);
            },
          })}
          ${back}`,
        "tall",
      );
    }
    if (o === "help") {
      const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      return sheet(
        html`${helpBody(this.chapter, ATTR_COLORS, touch)} ${back}`,
        "tall",
      );
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
      return sheet(
        html`<h2>Settings</h2>
          ${settingsBody(this.prefs, (k, v) => this.setPref(k, v), speed)}
          ${back}`,
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
          ${back}`,
        "tall",
      );
    }
    if (o === "credits") {
      return sheet(html`${creditsBody(this.credits)} ${back}`, "tall");
    }
    return sheet(
      html`<div class="mb-menu-title">Mr. Based</div>
        <div class="mb-sheet-sub">
          ${this.stage.place ? (this.places[this.stage.place]?.name ?? "") : ""}
          · ${clockText(this.run.clock).time}
        </div>
        <nav class="mb-menu">
          <button class="mb-btn primary" @click=${() => this.closeOverlay()}>
            Resume
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "save")}>
            Save game
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "load")}>
            Load game
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "sheet")}>
            Your skills
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "journal")}>
            Journal
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "help")}>
            How to play
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "note")}>
            Note for the writer
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "log")}>
            The story so far
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "settings")}>
            Settings
          </button>
          <button class="mb-btn" @click=${() => (this.overlay = "credits")}>
            Credits
          </button>
          <button
            class="mb-btn quiet"
            @click=${() => {
              this.autosave();
              this.countPlayed();
              this.host.quit();
            }}
          >
            Save and quit
          </button>
        </nav>
        <p class="mb-sheet-foot">
          The game saves by itself as you go (the autosave).
          ${window.matchMedia?.("(pointer: coarse)").matches
            ? nothing
            : html`<kbd>F5</kbd> quicksaves; <kbd>F9</kbd> loads it.`}
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
