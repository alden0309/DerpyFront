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

import {
  html,
  LitElement,
  nothing,
  PropertyValues,
  render,
  svg,
  TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { rollDice, tierName } from "../engine/Dice";
import { evalExpr } from "../engine/Expr";
import { peopleKnown } from "../engine/Facts";
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
  Kit,
  LineBeat,
  RollBeat,
  Stage,
  StoryEvent,
  StoryRun,
} from "../engine/Runtime";
import { slotOf, SlotSave } from "../engine/Save";
import {
  Boost,
  LANG_MAX,
  langLevel,
  langOf,
  LANGUAGES_SKILL,
} from "../engine/Skills";
import { Build, Chapter, GEAR_SLOTS, GearSlot } from "../engine/Types";
import {
  Credit,
  leaveNote,
  mediaNow,
  notesFor,
  SlotInfo,
  WriterNote,
} from "./Api";
import { dossierBody, DossierTab, DossierView } from "./Dossier";
import { helpBody } from "./Help";
import { BeatHold } from "./Hold";
import { inventoryBody, SLOT_NAMES } from "./Inventory";
import { NotesDesk } from "./Notes";
import { CPS, levelsOf, Prefs, savePrefs, TextSpeed } from "./Prefs";
import { Soundscape } from "./Sound";
import {
  bagIcon,
  bookIcon,
  closeIcon,
  creditsBody,
  eyeIcon,
  menuIcon,
  muteIcon,
  penIcon,
  personIcon,
  plainText,
  playedText,
  settingsBody,
  slotsBody,
  soundIcon,
  typed,
  voice,
  VOICES,
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
  kind:
    | "remember"
    | "rel"
    | "task"
    | "boost"
    | "help"
    | "saved"
    | "item"
    | "money";
}

interface Entry {
  id: number;
  /** r22 BPLAY: the story's clock when it was said ("22:14"). */
  at?: string;
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
  | "notes"
  | "settings"
  | "log"
  | "credits"
  | "sheet"
  | "help"
  | "journal"
  | "save"
  | "load"
  /** r22 BPLAY: what he carries, and the story so far. */
  | "inventory";

let nextId = 1;

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
    kit?: Kit;
  } | null = null;
  @property({ attribute: false }) build: Build | null = null;
  @property({ attribute: false }) host!: PlayerHost;
  @property({ attribute: false }) prefs!: Prefs;
  @property({ attribute: false }) ambience!: Soundscape;
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
  /** r26: all his notes, to copy out to the writer. */
  private readonly desk = new NotesDesk(() => this.requestUpdate());
  @state() private size = { w: window.innerWidth, h: window.innerHeight };
  @state() private hover: string | null = null;
  @state() private card: { title: string; sub?: string } | null = null;
  @state() private placeCard: string | null = null;
  @state() private rolled = false;
  /** r26: the beat waits for someone the story moved (afterStep). */
  @state() private held = false;
  private firstStep = false;
  /** r26: who he's just started talking to (afterStep has them come over). */
  private serving: string | null = null;
  private readonly hold = new BeatHold<Beat>(
    () => this.world?.storyBusy() ?? false,
    (b) => {
      this.held = false;
      if (this.beat === b) this.present(b, this.firstStep);
    },
  );
  @state() private tab = false;
  @state() private noWorld = false;
  /** r22 BPLAY: the thing picked out in the inventory. */
  @state() private invSel: string | null = null;
  /** r22 BPLAY: the dossier's page. */
  @state() private dossierTab: DossierTab = "places";
  @state() private avail: Available = {
    talk: [],
    look: [],
    think: [],
    use: [],
  };
  /**
   * What he's noticed, as the labels need it. The labels are drawn when the
   * set changes (`marksKey`); as the camera moves they're only moved.
   */
  private onScreen: ThingOnScreen[] = [];
  @state() private marksKey = "";
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
  /** Going through a door (the fade): clicks wait. */
  private busy = false;
  /** Each click on the world gets a ticket; a walk acts only if it's the latest. */
  private walkTicket = 0;
  private marks = new Map<string, HTMLElement>();
  private lastSave = 0;
  private playClock = 0;
  private playTick = 0;
  private sinceAuto = 0;
  private autoTimer = 0;
  /** r25: how often the sound hears where he is. */
  private soundTick = 0;

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
          // BPEOPLE (r22): and their own model, if they have one.
          this.chapter.cast.map((c) => ({
            id: c.id,
            look: c.look ?? (c.model ? "suit_dark" : ""),
            model: c.model,
          })),
          tier,
          {
            hotspot: (id, o) => this.clickThing(id, o.seated, o.run),
            floor: (x, z, run) => this.clickFloor(x, z, run),
            // BFIX (r23): a stool or a chair: he goes and sits on it.
            seat: (i, run) => this.clickSeat(i, run),
            person: (id) => this.clickPerson(id),
            hover: (id) => (this.hover = id),
          },
        );
        this.world.hero = this.chapter.cast[0]?.id ?? "";
        // r25: the sound follows him: his steps, and where he is.
        this.world.onStep = (s) => this.ambience.step(s);
        this.soundTick = window.setInterval(() => this.hearWorld(), 200);
        this.dressFromGear();
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
    this.hold.cancel();
    window.clearTimeout(this.timerTimeout);
    window.clearTimeout(this.rollTimer);
    window.clearTimeout(this.talkTimer);
    window.clearTimeout(this.placeTimer);
    window.clearTimeout(this.autoTimer);
    window.clearInterval(this.playTick);
    window.clearInterval(this.soundTick);
    this.world?.dispose();
    this.world = null;
    super.disconnectedCallback();
  }

  /** r25: the panels open and close on paper; the dice land with a sting. */
  willUpdate(changed: PropertyValues): void {
    if (changed.has("overlay")) {
      const was = changed.get("overlay") as Overlay | undefined;
      if (was === undefined && this.overlay === null) {
        // first render
      } else if (!was && this.overlay) this.ambience.effect("book_open");
      else if (was && !this.overlay) this.ambience.effect("book_close");
      else if (was !== this.overlay) this.ambience.effect("page");
    }
    if (
      changed.has("rolled") &&
      this.rolled &&
      changed.get("rolled") === false
    ) {
      const b = this.beat;
      if (b.kind === "roll" && b.dice !== null) {
        this.ambience.effect(b.pass ? "pass" : "fail");
        window.setTimeout(() => this.ambience.effect("stamp"), 260);
      }
    }
  }

  /** r25: where he is and how hard it's raining, for the sound. */
  private hearWorld(): void {
    const w = this.world;
    if (!w) return;
    const at = w.heroAt();
    if (at) this.ambience.setListener(at.x, at.z, w.areaIdAt(at.x, at.z));
    this.ambience.setRain(w.rainNow);
  }

  updated(): void {
    // The newest line at the bottom of the column, always in view.
    const logEl = this.querySelector(".mb-col-log");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
    if (this.typingNow) this.drawLive();
    // Labels just drawn: put them where they belong.
    if (this.onScreen.length > 0 && this.marks.size === 0) {
      const list = this.onScreen;
      this.marksKey = list
        .map((h) => `${h.id}:${h.near ? 1 : 0}${h.door ? 1 : 0}`)
        .join("|");
      this.placeMarks(list);
    }
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
    // r26: he's started talking to someone behind a counter: they come over
    // (after the scene's own moves, so to the stool he's going to).
    if (this.serving) {
      this.world?.serve(this.serving);
      this.serving = null;
    }
    // r26: someone the story moved is still on the way: the next line (or
    // choice) waits until they're there and settled (client/Hold.ts).
    window.clearTimeout(this.timerTimeout);
    this.timerTimeout = 0;
    this.firstStep = first;
    this.hold.offer(b, b.kind !== "free" && b.kind !== "end", first);
    this.held = this.hold.held;
    if (this.held) this.ambience.setDialogue(true);
  }

  /** The beat on the page: its line typed, its choice timed, its sounds. */
  private present(b: Beat, first: boolean): void {
    // r25: the score steps back while there's talk or a choice on screen.
    this.ambience.setDialogue(b.kind !== "free" && b.kind !== "end");
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
        // A passive check heard: how hard it was, in the transcript's own words.
        if (voice.tier)
          e.tag = `${voice.tier.toLowerCase()} ${voice.diff ?? ""}`;
      }
      this.push(e);
      this.startTyping();
      this.talk(b.who ?? null);
    } else if (b.kind === "card") {
      this.card = { title: b.title, sub: b.sub };
      this.push({
        id: nextId++,
        kind: "card",
        text: b.sub ? `${b.title}. ${b.sub}` : b.title,
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
      // r25: the dice, shaken and thrown (a passive check is heard, not thrown).
      if (b.dice !== null) {
        this.ambience.effect("shake");
        window.setTimeout(() => this.ambience.effect("dice"), 330);
      } else if (!first) this.ambience.effect(b.pass ? "pass" : "fail", 0.6);
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
    e.at ??= clockText(this.run.clock).time;
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
        // r26: by the name he knows them by then (Facts.knownName).
        this.toast(
          `${e.name ?? this.nameOf(e.who)} will remember that.`,
          "remember",
        );
        break;
      case "rel": {
        const name = e.name ?? this.nameOf(e.who);
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
      case "item": {
        // r22 BPLAY: something into his pockets, or gone.
        const it = this.chapter.items[e.key];
        if (!first && it && e.delta > 0) {
          // r25: paper for papers, a key for a key, cloth for the rest.
          this.ambience.effect(
            it.kind === "document"
              ? "page"
              : it.kind === "key"
                ? "key"
                : "cloth",
          );
        }
        if (!first && it) {
          this.toast(
            e.delta > 0
              ? `${it.name}${e.delta > 1 ? ` ×${e.delta}` : ""}: into his pockets.`
              : `${it.name}: gone.`,
            "item",
          );
        }
        break;
      }
      case "gear":
        this.dressFromGear();
        break;
      case "money":
        if (!first) this.ambience.effect("coins");
        if (!first) {
          this.toast(
            e.delta > 0 ? `+€${e.delta}` : `−€${Math.abs(e.delta)}`,
            "money",
          );
        }
        break;
      case "gesture":
        this.world?.gesture(this.bodyOf(e.who), e.name);
        break;
      case "sound":
        // r25: what the scene asks for (a bell, the lift's dead button).
        if (!first) {
          const key = e.key;
          // After whoever the story has walking gets there (the rope).
          if (this.world)
            this.world.afterWalks(() => this.ambience.effect(key));
          else this.ambience.effect(key);
        }
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
    // r25: the place's own sound; the story's @ambient where a place has none.
    if (first || s.place !== was.place) {
      this.ambience.setPlace(s.place ? (this.places[s.place] ?? null) : null);
    }
    if (s.ambient !== was.ambient || first)
      this.ambience.setStoryAmbient(s.ambient);
    this.ambience.setTv(!!s.news);
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
    // r22 BPLAY: "LANGUAGES.fr" is his Languages in French.
    const code = langOf(id);
    if (code !== null) {
      const lang = this.chapter.languages.find((l) => l.code === code);
      return `${this.skillName(LANGUAGES_SKILL)} (${lang?.name ?? code})`;
    }
    return this.chapter.skills.find((s) => s.id === id)?.name ?? id;
  }

  /** The skill a check names, for its colour: "LANGUAGES.fr" is Languages. */
  private skillOf(id: string): string {
    return langOf(id) === null ? id : LANGUAGES_SKILL;
  }

  /** r22 BPLAY: an attribute's voice: "--c" on the night, "--ci" on paper. */
  private attrColor(attr: string): string {
    const v = voice(this.chapter.attributes.findIndex((a) => a.id === attr));
    return `${v.night};--ci:${v.paper}`;
  }

  private skillColor(id: string): string {
    const s = this.chapter.skills.find((x) => x.id === this.skillOf(id));
    return voice(this.chapter.attributes.findIndex((a) => a.id === s?.attr))
      .night;
  }

  private skillInk(id: string): string {
    const s = this.chapter.skills.find((x) => x.id === this.skillOf(id));
    return voice(this.chapter.attributes.findIndex((a) => a.id === s?.attr))
      .paper;
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
    if (this.overlay !== null || this.held) return;
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
    if (b.kind !== "choice" || this.held) return;
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
    if (b.kind !== "choice" || this.held) return;
    const open = b.options.filter((o) => !o.check?.locked);
    const pick = open.find((o) => o.silent) ?? open[0];
    if (!pick) return;
    if (pick.silent) this.toast("The moment passed. You said nothing.", "rel");
    this.choose(pick.id);
  }

  private examine(id: string): void {
    this.ambience.unlock();
    if (this.beat.kind !== "investigate" || this.held) return;
    this.run.examine(id);
    this.host.seen([], [id]);
    this.afterStep();
  }

  private deduce(id: string): void {
    if (this.beat.kind !== "investigate" || this.held) return;
    this.run.deduce(id);
    this.host.seen([], [id]);
    this.afterStep();
  }

  private leave(): void {
    if (this.beat.kind !== "investigate" || !this.beat.canLeave || this.held)
      return;
    this.run.leave();
    this.afterStep();
  }

  // --- what he carries (r22 BPLAY) ---------------------------------------------

  /**
   * His look and what's in his hand, from what he wears: the first worn
   * thing with a look (only outfits with a model have one), and the held
   * thing's drawing.
   */
  private dressFromGear(): void {
    const w = this.world;
    if (!w) return;
    const gear = this.run.gear;
    let look: string | null = null;
    for (const s of GEAR_SLOTS) {
      const it = gear[s] ? this.chapter.items[gear[s]!] : undefined;
      if (it?.look) {
        look = it.look;
        break;
      }
    }
    w.dressHero(look);
    const held = gear.hand ? this.chapter.items[gear.hand] : undefined;
    w.holdHero(held ? (held.icon ?? held.kind) : null);
  }

  /** After the player changes what he wears: the checks on screen, his eyes. */
  private afterGear(): void {
    for (const e of this.run.drain()) this.onEvent(e, false);
    this.beat = this.run.beat;
    if (this.world) this.world.perception = this.run.skills().PERCEPTION ?? 2;
    if (this.run.free) this.setWorldState(this.beat);
  }

  private wearItem(key: string): void {
    if (this.run.equip(key)) {
      this.invSel = key;
      this.afterGear();
    }
  }

  private takeOff(slot: GearSlot): void {
    if (this.run.unequip(slot)) this.afterGear();
  }

  private useItem(key: string): void {
    this.ambience.unlock();
    if (!this.run.free) return;
    this.closeOverlay();
    if (this.run.use(key)) this.afterStep();
  }

  /** Items with any use in the story (the Use button shows for them). */
  private get useful(): string[] {
    if (this.usefulCache) return this.usefulCache;
    const out = new Set<string>();
    for (const id of this.chapter.order) {
      const t = this.chapter.scenes[id].trigger;
      if (t?.on === "use" && t.target) out.add(t.target);
    }
    return (this.usefulCache = [...out]);
  }

  private usefulCache: string[] | null = null;

  // --- the story so far (r22 BPLAY) ---------------------------------------------

  /** The story's choices and checks by id, for naming what's in his path. */
  private lookups(): {
    choices: Map<
      string,
      { scene: string; options: Map<string, { label: string; check: boolean }> }
    >;
    checks: Map<string, { label: string; skill: string; diff: number }>;
    vignettes: Map<string, string>;
  } {
    if (this.lookupCache) return this.lookupCache;
    const choices = new Map<
      string,
      { scene: string; options: Map<string, { label: string; check: boolean }> }
    >();
    const checks = new Map<
      string,
      { label: string; skill: string; diff: number }
    >();
    const vignettes = new Map<string, string>();
    for (const id of this.chapter.order) {
      const sc = this.chapter.scenes[id];
      for (const op of sc.ops) {
        if (op.op === "choose") {
          const options = new Map<string, { label: string; check: boolean }>();
          for (const o of op.options) {
            options.set(o.id, { label: o.label, check: !!o.check });
            if (o.check) {
              checks.set(`${op.id}/${o.id}`, {
                label: o.label,
                skill: o.check.skill,
                diff: o.check.diff,
              });
            }
          }
          choices.set(op.id, { scene: sc.label, options });
        } else if (op.op === "investigate") {
          for (const d of op.deductions) {
            if (d.check) {
              checks.set(`${op.id}:${d.id}`, {
                label: d.label,
                skill: d.check.skill,
                diff: d.check.diff,
              });
            }
          }
        } else if (op.op === "vignette" && op.key && !vignettes.has(op.key)) {
          vignettes.set(op.key, sc.label);
        }
      }
    }
    this.lookupCache = { choices, checks, vignettes };
    return this.lookupCache;
  }

  private lookupCache: ReturnType<BasedPlayer["lookups"]> | null = null;

  /** Where things stand with someone, from how he's made them feel. */
  private standing(rel: number): string {
    if (rel >= 3) return "Trusts him";
    if (rel === 2) return "Has decided he likes him";
    if (rel === 1) return "Warming to him";
    if (rel === 0) return "Hasn't made up their mind";
    if (rel === -1) return "Cool towards him";
    return "Doesn't trust him";
  }

  private dossier(): DossierView {
    const run = this.run;
    const rec = run.record;
    const ch = this.chapter;
    const hero = ch.cast[0];
    const build = run.build;
    const arch = ch.archetypes.find((a) => a.id === build.archetype);
    const t = (sec: number) => clockText(sec).time;
    const clock = clockText(run.clock);
    const art = (k?: string) => (k ? mediaNow("art", k) : null);
    // People, one entry per person (a name learned later is the same body),
    // r26: each by the name he knows them by now (Facts.peopleKnown).
    const vals = run.values();
    const rels = vals.rels;
    const people: (DossierView["people"][number] & { at: number })[] = [];
    for (const p of peopleKnown(ch, rec.met, vals.flags)) {
      const ids = p.ids;
      const met = ids.filter((id) => rec.met[id] !== undefined);
      const who = ch.cast.find((c) => c.name === p.name && ids.includes(c.id));
      const first = ch.cast.find((c) => c.id === p.body)!;
      const rel = ids.reduce((a, id) => a + (rels[id] ?? 0), 0);
      const at = Math.min(...met.map((id) => rec.met[id]));
      people.push({
        name: p.name,
        first: p.first?.replace(/^The /, "the "),
        portrait: art(who?.portrait ?? first.portrait),
        met: `at ${t(at)}`,
        stand: this.standing(Math.max(-3, Math.min(3, rel))),
        warmth: Math.max(-3, Math.min(3, rel)),
        remembers: ids.some((id) => rec.remembers.includes(id)),
        at,
      });
    }
    people.sort((a, b) => a.at - b.at);
    // What he chose, scene by scene, from his path (the latest forty).
    const look = this.lookups();
    const path = run.history();
    const picks: { scene: string; label: string; check?: string }[] = [];
    for (const step of path) {
      if (!step.startsWith("c:")) continue;
      const [choice, opt] = step.slice(2).split("=");
      const c = look.choices.get(choice);
      const o = c?.options.get(opt);
      if (!c || !o) continue;
      const memo = o.check ? rec.checks[`${choice}/${opt}`] : undefined;
      picks.push({
        scene: c.scene,
        label: o.label,
        check: memo
          ? memo.result === "pass"
            ? "passed"
            : "failed"
          : undefined,
      });
    }
    const shown = picks.slice(-40);
    const decisions: DossierView["decisions"] = [];
    for (const p of shown) {
      const lastGroup = decisions[decisions.length - 1];
      if (lastGroup && lastGroup.scene === p.scene) lastGroup.picks.push(p);
      else decisions.push({ scene: p.scene, picks: [p] });
    }
    // The throws, with their dice read back from the seed.
    const dice: DossierView["dice"] = Object.entries(rec.checks)
      .map(([id, m]) => {
        const c = look.checks.get(id);
        if (!c) return null;
        return {
          skill: this.skillName(c.skill),
          color: this.skillInk(c.skill),
          label: c.label,
          diff: c.diff,
          tier: tierName(c.diff),
          dice:
            m.tries > 0
              ? rollDice(rec.seed, id, m.tries - 1)
              : (null as [number, number] | null),
          bonus: m.bonus,
          pass: m.result === "pass",
          tries: m.tries,
          at: m.at !== undefined ? t(m.at) : "",
          sort: m.at ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.sort - b.sort)
      .slice(-30);
    // What he carries that matters: papers, keys, tools, a weapon, and
    // anything with a use.
    const gear = run.gear;
    const useful = new Set(this.useful);
    const things = Object.keys(run.items)
      .concat(gear.hand ? [gear.hand] : [])
      .map((k) => ch.items[k])
      .filter(
        (it) =>
          it &&
          ((it.kind !== "clothes" && it.kind !== "small") ||
            useful.has(it.key)),
      )
      .map((it) => ({
        name: it.name,
        icon: it.icon,
        kind: it.kind,
        about: it.about,
      }));
    const worn = GEAR_SLOTS.filter((sl) => sl !== "hand" && gear[sl]).map(
      (sl) => {
        const it = ch.items[gear[sl]!];
        return {
          name: it?.name ?? gear[sl]!,
          icon: it?.icon,
          kind: it?.kind ?? "clothes",
          slot: SLOT_NAMES[sl].toLowerCase(),
        };
      },
    );
    const rated = run.languages();
    const langs = [
      "American English",
      ...ch.languages
        .filter((l) => (rated[l.code] ?? 0) > 0)
        .map((l) => `${l.name}, ${langLevel(rated[l.code])}`),
    ].join("; ");
    const values = run.values();
    return {
      tab: this.dossierTab,
      setTab: (tab) => (this.dossierTab = tab),
      cover: {
        portrait: art(hero?.portrait),
        archetype: arch?.name.replace(/^The /, "") ?? "His own man",
        about: arch?.about ?? "",
        clock: clock.time,
        nights: clock.day,
        played: `${playedText(this.played)} played`,
        langs,
      },
      places: Object.entries(rec.visited)
        .sort((a, b) => a[1] - b[1])
        .map(([k, at]) => ({
          name: this.places[k]?.name ?? k,
          at: t(at),
          here: k === this.stage.place,
        })),
      people,
      record: ch.carry
        .filter((c) => !c.cond || evalExpr(c.cond, values))
        .map((c) => c.text),
      decisions,
      earlier: picks.length - shown.length,
      dice,
      effects: { money: run.euros, worn, things },
      tasks: run.tasks,
      memories: rec.memories.map((k) => ({
        url: art(k),
        caption: look.vignettes.get(k) ?? "",
      })),
      transcript: this.log.slice(-200).map((l) => ({
        who: l.who
          ? this.nameOf(l.who)
          : l.skill && l.kind !== "pick"
            ? this.skillName(l.skill)
            : undefined,
        text:
          l.kind === "roll" && l.roll
            ? `${l.roll.tier} ${l.roll.diff}, ${l.roll.pass ? "passed" : "failed"}: ${l.text}`
            : plainText(l.text),
        kind: l.kind,
      })),
    };
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
    // r22 BPLAY: what's said of the weather is what's on screen.
    this.run.setWeather(w ? w.weatherNow : null);
    const here = this.stage.place ? this.places[this.stage.place] : undefined;
    const things = new Map<string, { door: boolean }>();
    let avail: Available = { talk: [], look: [], think: [], use: [] };
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
      // A click while he's walking somewhere else changes his mind.
      if (h?.to) {
        const to = h.to;
        w.walkToHotspot(
          id,
          this.walkThen(() => {
            if (!this.run.free || this.busy) return;
            // The story may stop him at the door; otherwise, through it.
            if (this.run.look(id)) this.afterStep();
            else void this.travel(to.place, to.mark, h.sound);
          }),
          run,
        );
        return;
      }
      if (!w.things.has(id)) return;
      if (seated || w.heroSeated) {
        // Read from his seat: turn, and look.
        this.walkTicket++;
        w.faceHotspot(id);
        this.lookAt(id);
        return;
      }
      w.walkToHotspot(
        id,
        this.walkThen(() => this.lookAt(id)),
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
      w.walkToHotspot(
        id,
        this.walkThen(() => {
          if (this.beat.kind === "investigate") this.leave();
        }),
        run,
      );
      return;
    }
    const spot = this.spotFor(id);
    if (!spot) return;
    if (b.still || seated || spot.anchor === undefined) {
      this.walkTicket++;
      w.faceHotspot(id);
      this.examine(spot.id);
      return;
    }
    w.walkToHotspot(
      spot.anchor,
      this.walkThen(() => {
        if (this.beat.kind === "investigate") this.examine(spot.id);
      }),
      run,
    );
  }

  /** What to do on arriving, unless another click has sent him elsewhere. */
  private walkThen(fn: () => void): () => void {
    const ticket = ++this.walkTicket;
    return () => {
      if (ticket === this.walkTicket) fn();
    };
  }

  private lookAt(id: string): void {
    if (!this.run.free) return;
    this.run.setWeather(this.world ? this.world.weatherNow : null);
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
    const start = this.walkThen(() => {
      if (!this.run.free || this.busy) return;
      // r26: whoever serves from behind a counter comes over to him.
      this.serving = this.bodyOf(who);
      if (this.run.talk(who)) this.afterStep();
      this.serving = null;
    });
    if (w.heroSeated) {
      start();
      return;
    }
    if (!w.walkUpTo(id, start)) start();
  }

  private clickFloor(x: number, z: number, run: boolean): void {
    const b = this.beat;
    if (this.overlay) return;
    if (this.world?.walkable) {
      if (this.busy) return;
      this.walkTicket++;
      this.world.walkHero(x, z, run);
      return;
    }
    // Anywhere else, a click on the world moves the story on.
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      this.advance();
    }
  }

  /**
   * BFIX (r23): a seat clicked while he's free: he walks over and sits
   * (and reads the room from it, as on the story's stools). Otherwise as
   * a click on the floor.
   */
  private clickSeat(index: number, run: boolean): void {
    const w = this.world;
    if (!w || this.overlay) return;
    if (w.walkable && !this.busy) {
      this.walkTicket++;
      w.sitHero(index, run);
      return;
    }
    const b = this.beat;
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      this.advance();
    }
  }

  /**
   * Through a door: a fade, the next place, its name. r25: and its sound
   * (the door, the bar's bell, or footsteps up the stairs).
   */
  private async travel(
    place: string,
    mark: string,
    sound?: string,
  ): Promise<void> {
    const w = this.world;
    const def = this.places[place];
    if (!w || !def || !this.run.free) return;
    this.busy = true;
    const cue = sound ?? "door";
    if (cue === "stairs") {
      for (let i = 0; i < 6; i++) {
        window.setTimeout(
          () =>
            this.ambience.step({
              surface: "wood",
              run: false,
              hero: true,
              wet: 0,
              x: 0,
              z: 0,
            }),
          i * 430,
        );
      }
    } else {
      this.ambience.effect("door_open");
      if (cue === "bar_bell") {
        window.setTimeout(() => this.ambience.effect("bar_bell"), 120);
      }
    }
    const ready = w.prepare(def);
    await w.fadeOut();
    // Built and compiled next door already, nearly always; if not, it's
    // finished now, behind the black.
    await Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]);
    this.busy = false;
    this.run.enterPlace(place, mark);
    if (cue !== "stairs") this.ambience.effect("door_close");
    this.afterStep();
    // Through a door is a good moment for the autosave.
    this.autosaveSoon();
  }

  /** Keeps the labels over what he's noticed as the camera moves. */
  private moveMarks(list: ThingOnScreen[]): void {
    this.onScreen = list;
    const key = list
      .map((h) => `${h.id}:${h.near ? 1 : 0}${h.door ? 1 : 0}`)
      .join("|");
    if (key !== this.marksKey) {
      // Something noticed, or near, or gone: draw the labels again.
      this.marksKey = key;
      this.marks.clear();
      return;
    }
    this.placeMarks(list);
  }

  private placeMarks(list: ThingOnScreen[]): void {
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
    // r25: a key counts as the first touch the browser wants before sound.
    this.ambience.unlock();
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
    // The same key closes the panel it opened.
    const toggles: Record<string, Exclude<Overlay, null>> = {
      i: "inventory",
      j: "journal",
      c: "sheet",
    };
    const own = toggles[e.key.toLowerCase()];
    if (own && this.overlay === own) {
      this.closeOverlay();
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
    } else if (e.key === "i" || e.key === "I") {
      this.openOverlay("inventory");
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
    if (o === "notes") void this.desk.load();
  }

  /** r26: the sheet of all his notes (from the menu or the note sheet). */
  private openNotes(): void {
    this.overlay = "notes";
    void this.desk.load();
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
    this.ambience.setLevels(levelsOf(this.prefs));
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
      ${
        /* r22 hotfix: the news crawls on the bar's television only, not
      as a band across the top of the screen. */ nothing
      }
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
            <span class="mb-plaque ${this.plaqueKind()}"
              >${this.placeCard}</span
            >
            <span class="mb-placecard-time"
              >${clockText(this.run.clock).time}</span
            >
          </div>`
        : nothing}
      <div class="mb-toasts" aria-live="polite">
        ${this.toasts.map(
          (t) => html`<div class="mb-toast ${t.kind}">${t.text}</div>`,
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

  /**
   * r22 BPLAY: the sign a place is named on: the street's blue enamel
   * plaque outdoors, a brass plate indoors.
   */
  private plaqueKind(): "enamel" | "brass" {
    const def = this.stage.place ? this.places[this.stage.place] : undefined;
    return def && def.areas.some((a) => !a.inside) ? "enamel" : "brass";
  }

  private renderHud(): TemplateResult {
    const place = this.stage.place ? this.places[this.stage.place] : undefined;
    const clock = clockText(this.run.clock);
    return html`<div class="mb-hud">
      <div class="mb-where">
        <span class="mb-plaque ${this.plaqueKind()}"
          >${place?.name ?? this.sceneLabel}</span
        >
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
          title="What he carries (I)"
          aria-label="What he carries"
          @click=${() => this.openOverlay("inventory")}
        >
          ${bagIcon()}
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
          class="mb-icon wide-only"
          title="Note for the writer (N)"
          aria-label="Note for the writer"
          @click=${() => this.openOverlay("note")}
        >
          ${penIcon()}
        </button>
        <button
          class="mb-icon wide-only"
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
    // A transcript: the time in the margin when it moves on.
    let last = "";
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
        ${this.entries.map((e, i) => {
          const t = e.at && e.at !== last ? e.at : "";
          if (e.at) last = e.at;
          return this.renderEntry(e, i === this.entries.length - 1, t);
        })}
        ${this.entries.length === 0 && b.kind === "free"
          ? this.renderResume()
          : nothing}
      </div>
      <div class="mb-col-act">${this.renderAction(b)}</div>
    </aside>`;
  }

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

  private renderEntry(e: Entry, last: boolean, time = ""): TemplateResult {
    const live = last && this.beat.kind === "line" && this.typingNow;
    // The live line's words are drawn into its span by drawLive(), so the
    // column isn't drawn again for every letter.
    const text = live
      ? html`<span class="mb-live"></span>`
      : html`${typed(e.text, 1e9)}`;
    const hero = this.chapter.cast[0]?.id;
    const t = html`<span class="mb-e-t" aria-hidden="true">${time}</span>`;
    switch (e.kind) {
      case "say":
        return html`<div
          class="mb-e say ${e.who === hero ? "hero" : ""} ${e.lang &&
          !e.lang.understood
            ? "foreign"
            : ""}"
        >
          ${t}
          <p>
            <b class="mb-e-who">${this.nameOf(e.who ?? "")}</b>${e.how
              ? html` <i class="mb-e-how">(${e.how})</i>`
              : nothing}${e.lang ? html` ${this.langTag(e.lang)}` : nothing}
            <span class="mb-e-words">${text}</span>
          </p>
        </div>`;
      case "voice":
        return html`<div
          class="mb-e voice"
          style="--c:${this.skillColor(e.skill ?? "")}"
        >
          ${t}
          <p>
            <b class="mb-e-who">${this.skillName(e.skill ?? "")}</b>${e.tag
              ? html` <span class="mb-e-tag">${e.tag}</span>`
              : nothing}
            <span class="mb-e-words">${text}</span>
          </p>
        </div>`;
      case "think":
        return html`<div class="mb-e think">
          ${t}
          <p>${text}</p>
        </div>`;
      case "card":
        return html`<div class="mb-e card">
          ${t}
          <p>${e.text}</p>
        </div>`;
      case "pick":
        return html`<div class="mb-e pick">
          ${t}
          <p><span class="mb-e-arrow" aria-hidden="true"></span>${e.text}</p>
        </div>`;
      case "roll":
        return html`<div class="mb-e rollrow">
          ${t}${this.renderRollEntry(e.roll!, last)}
        </div>`;
      default:
        return html`<div class="mb-e narr">
          ${t}
          <p>${text}</p>
        </div>`;
    }
  }

  /**
   * r22 BPLAY: a check, thrown: a carbon slip in the column with the dice,
   * the sum and every modifier, and the stamp.
   */
  private renderRollEntry(r: RollBeat, last: boolean): TemplateResult {
    const name = this.skillName(r.skill);
    const pending = last && !this.rolled && r.dice !== null;
    const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    const verdict = r.pass
      ? r.crit === "six"
        ? "Passed, double six"
        : "Passed"
      : r.crit === "one"
        ? "Failed, double one"
        : "Failed";
    return html`<div
      class="mb-slip ${r.pass ? "pass" : "fail"} ${pending
        ? "pending"
        : ""} ${r.kind2}"
      style="--c:${this.skillInk(r.skill)}"
    >
      <div class="mb-slip-head">
        <b>${name}</b>
        <span>${r.tier} ${r.diff}</span>
      </div>
      <div class="mb-slip-what">${r.label}</div>
      ${r.dice
        ? html`<div class="mb-slip-dice">
            ${r.dice.map(
              (d, i) =>
                html`<span
                  class="mb-die ${pending ? "tumbling" : ""}"
                  style="animation-delay:${i * 90}ms"
                  >${dieFace(pending ? ((i * 3 + 2) % 6) + 1 : d)}</span
                >`,
            )}
            <span class="mb-slip-sum"
              >${pending
                ? ""
                : `${r.dice[0]} + ${r.dice[1]} + ${r.bonus} = ${r.total}`}</span
            >
          </div>`
        : html`<div class="mb-slip-dice passive">
            <span class="mb-slip-sum"
              >No throw: ${r.bonus} + 6 = ${r.bonus + 6}</span
            >
          </div>`}
      <ul class="mb-slip-mods">
        <li><b>${r.base}</b> ${name}</li>
        ${r.mods.map(
          (m) =>
            html`<li class=${m.item ? "gear" : ""}>
              <b>${sign(m.delta)}</b> ${m.why}
            </li>`,
        )}
        <li class="against">against <b>${r.diff}</b></li>
      </ul>
      ${pending
        ? nothing
        : html`<div class="mb-stamp-mark ${r.crit ? "crit" : ""}" role="status">
            ${verdict}
          </div>`}
    </div>`;
  }

  private renderAction(b: Beat): TemplateResult | typeof nothing {
    // r26: someone's still on the way: a quiet sign that the scene waits.
    if (this.held) {
      return html`<button
        class="mb-continue wait held"
        disabled
        aria-label="Waiting for them to get there"
      >
        …
      </button>`;
    }
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

  /** A check before it's thrown: in pencil (can be retried) or ink (once). */
  private checkLabel(c: CheckView): TemplateResult {
    const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    return html`<span
      class="mb-ck ${c.kind === "red" ? "ink" : "pencil"} ${c.locked
        ? "locked"
        : ""}"
      style="--c:${this.skillColor(c.skill)}"
      title=${[
        `${this.skillName(c.skill)} ${c.base}`,
        ...c.mods.map((m) => `${sign(m.delta)} ${m.why}`),
        `Two dice + ${c.bonus} against ${c.diff}`,
        c.kind === "red"
          ? "In ink: one throw only"
          : "In pencil: can be tried again when something changes",
      ].join("\n")}
      ><b class="mb-ck-skill">${this.skillName(c.skill)}</b>
      <span class="mb-ck-tier">${c.tier} ${c.diff}</span>
      <span class="mb-ck-pct">${c.locked ? "locked" : `${c.percent}%`}</span
      >${c.kind === "red"
        ? html`<span class="mb-ck-once">once</span>`
        : nothing}</span
    >`;
  }

  private renderChoice(b: ChoiceBeat): TemplateResult {
    const timed = this.prefs.timers && this.timed > 0;
    const itemName = (k: string) => this.chapter.items[k]?.name ?? k;
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
        ${b.options.map((o, i) => {
          const shut = !!o.check?.locked || o.needs?.met === false;
          return html`<li>
            <button
              class="mb-option ${o.silent ? "silent" : ""} ${shut
                ? "locked"
                : ""}"
              ?disabled=${shut}
              @click=${() => this.choose(o.id)}
            >
              <span class="mb-key">${i + 1}.</span>
              <span class="mb-option-label"
                >${o.check ? this.checkLabel(o.check) : nothing}
                ${o.silent ? html`<i>…</i> ` : nothing}${o.label}</span
              >
            </button>
            ${o.needs && !o.needs.met
              ? html`<div class="mb-locked-why">
                  Needs ${o.needs.items.map(itemName).join(" or ")}.
                </div>`
              : o.check?.locked
                ? html`<div class="mb-locked-why">
                    Tried and failed. It opens again when his
                    ${this.skillName(o.check.skill)} rises, or something new
                    turns up.
                  </div>`
                : nothing}
          </li>`;
        })}
      </ol>
    </div>`;
  }

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
  /** A loaded game starts with an empty column: where he is, and when. */
  private renderResume(): TemplateResult {
    const place = this.stage.place ? this.places[this.stage.place] : undefined;
    const clock = clockText(this.run.clock);
    return html`<p class="mb-resume">
      ${place ? `${place.name}, ${clock.time}.` : `${clock.time}.`} Where he
      left off.
    </p>`;
  }

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

  /**
   * Where a skill's value comes from (r22 BPLAY): its attribute, the
   * signature step, what's happened to him, and what he's wearing.
   */
  private skillParts(
    id: string,
  ): { why: string; delta: number; gear?: boolean }[] {
    const build = this.run.build;
    const s = this.chapter.skills.find((x) => x.id === id);
    const attr = this.chapter.attributes.find((a) => a.id === s?.attr);
    const out: { why: string; delta: number; gear?: boolean }[] = [
      { why: attr?.name ?? "", delta: build.attrs[s?.attr ?? ""] ?? 0 },
    ];
    if (build.signature === id) out.push({ why: "known for it", delta: 1 });
    for (const b of this.run.boosts) {
      if (b.skill === id) out.push({ why: b.why, delta: b.delta });
    }
    for (const g of this.run.gearMods()) {
      if (g.skill === id) out.push({ why: g.why, delta: g.delta, gear: true });
    }
    return out;
  }

  private renderSheet(): TemplateResult {
    const values = this.run.skills();
    const build = this.run.build;
    const arch = this.chapter.archetypes.find((a) => a.id === build.archetype);
    const gear = this.run.gearMods();
    const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    return html`<div class="mb-file">
      <header class="mb-file-head">
        <h2>Your skills</h2>
        <p class="mb-file-sub">
          ${arch ? html`<b>${arch.name}.</b> ${arch.about}` : "His own man."}
        </p>
      </header>
      <div class="mb-skills">
        ${this.chapter.attributes.map(
          (a) =>
            html`<section class="mb-attr" style="--c:${this.attrColor(a.id)}">
              <div class="mb-attr-head">
                <span class="mb-attr-name">${a.name}</span>
                <span class="mb-attr-val">${build.attrs[a.id] ?? 0}</span>
              </div>
              <p class="mb-attr-about">${a.about}</p>
              ${this.chapter.skills
                .filter((s) => s.attr === a.id)
                .map((s) => {
                  const parts = this.skillParts(s.id);
                  return html`<div class="mb-skill">
                    <div class="mb-skill-name">${s.name}</div>
                    <div class="mb-skill-val">${values[s.id] ?? 0}</div>
                    <div class="mb-skill-about">${s.about}</div>
                    <div class="mb-skill-from">
                      ${parts.map(
                        (p, i) =>
                          html`<span class=${p.gear ? "gear" : ""}
                            >${i === 0 ? p.delta : sign(p.delta)} ${p.why}</span
                          >`,
                      )}
                    </div>
                    ${s.id === LANGUAGES_SKILL &&
                    this.chapter.languages.length > 0
                      ? this.renderLangSheet()
                      : nothing}
                  </div>`;
                })}
            </section>`,
        )}
      </div>
      ${gear.length > 0
        ? html`<div class="mb-file-sub2">What he's wearing does</div>
            <ul class="mb-boosts">
              ${gear.map(
                (g) =>
                  html`<li>
                    <b>${sign(g.delta)} ${this.skillName(g.skill)}</b>
                    ${g.why}
                  </li>`,
              )}
            </ul>`
        : nothing}
      <p class="mb-sheet-foot">
        A check is two dice plus the skill against the difficulty; a double six
        always passes, a double one always fails. Checks in pencil can be tried
        again when something changes (a skill rises, he learns something, he
        puts on something that helps); checks in ink are one throw. His skills
        also speak up by themselves when they're good enough: the skill plus
        six.
      </p>
    </div>`;
  }

  /**
   * r22 BPLAY: his languages under Languages on the sheet: each rating, in
   * pips and words, and where it comes from.
   */
  private renderLangSheet(): TemplateResult {
    const rated = this.run.languages();
    const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
    return html`<ul class="mb-sheet-langs" aria-label="His languages">
      ${this.chapter.languages.map((l) => {
        const n = rated[l.code] ?? 0;
        const parts = this.run.languageParts(l.code);
        return html`<li class=${n > 0 ? "on" : ""}>
          <span class="mb-lang-what">
            <span class="mb-lang-name">${l.name}</span>
            <span class="mb-lang-level">${langLevel(n)}</span>
          </span>
          <span class="mb-lang-pips" role="img" aria-label="${n} of ${LANG_MAX}"
            >${Array.from(
              { length: Math.max(LANG_MAX, n) },
              (_, i) => html`<i class=${i < n ? "on" : ""}></i>`,
            )}</span
          >
          ${parts.some((p) => !p.start)
            ? html`<span class="mb-skill-from">
                ${parts.map(
                  (p) =>
                    html`<span class=${p.item ? "gear" : ""}
                      >${p.start ? p.delta : sign(p.delta)} ${p.why}</span
                    >`,
                )}
              </span>`
            : nothing}
        </li>`;
      })}
      <li class="mb-sheet-langs-own">And American English, his own.</li>
    </ul>`;
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
            ${this.run.free
              ? "Exploring"
              : html`Scene “${this.sceneLabel}”`}${on
              ? html`, on “${on.slice(0, 120)}${on.length > 120 ? "…" : ""}”`
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
            : nothing}
          <div class="mb-sheet-row mb-notes-actions">
            <button class="mb-btn" @click=${() => this.openNotes()}>
              All your notes, to send the writer
            </button>
          </div>`,
      );
    }
    if (o === "notes") {
      return sheet(
        html`${this.desk.render()}
          <div class="mb-sheet-row">${back}</div>`,
      );
    }
    if (o === "sheet")
      return sheet(html`${this.renderSheet()} ${back}`, "tall");
    if (o === "journal") {
      return sheet(
        html`${this.renderJournal()}
          <div class="mb-sheet-row">
            ${back}
            <button
              class="mb-btn"
              @click=${() => {
                this.dossierTab = "places";
                this.overlay = "log";
              }}
            >
              The story so far
            </button>
          </div>`,
      );
    }
    if (o === "inventory") {
      const avail = this.run.free
        ? this.run.available([]).use
        : ([] as string[]);
      return sheet(
        html`${inventoryBody({
          items: this.chapter.items,
          pockets: this.run.items,
          gear: this.run.gear,
          money: this.run.euros,
          selected: this.invSel,
          usable: avail,
          useful: this.useful,
          free: this.run.free,
          skillName: (id) => this.skillName(id),
          skillColor: (id) => this.skillInk(id),
          select: (k) => (this.invSel = k),
          equip: (k) => this.wearItem(k),
          unequip: (slot) => this.takeOff(slot),
          use: (k) => this.useItem(k),
        })}`,
        "paper inventory",
      );
    }
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
        html`${helpBody(this.chapter, VOICES, touch)} ${back}`,
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
      return sheet(html`${dossierBody(this.dossier(), back)}`, "dossier");
    }
    if (o === "credits") {
      return sheet(html`${creditsBody(this.credits)} ${back}`, "tall");
    }
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const line = (label: string, key: string, go: () => void, cls = "") =>
      html`<li>
        <button class="mb-menu-line ${cls}" @click=${go}>
          <span class="mb-menu-label">${label}</span>
          <span class="mb-menu-dots" aria-hidden="true"></span>
          ${touch || !key ? nothing : html`<kbd>${key}</kbd>`}
        </button>
      </li>`;
    const place = this.stage.place ? this.places[this.stage.place] : undefined;
    const clock = clockText(this.run.clock);
    return sheet(
      html`<div class="mb-menu-title">Mr. Based</div>
        <div class="mb-menu-where">
          ${place?.name ?? this.sceneLabel},
          ${clock.day > 0 ? `night ${clock.day + 1}, ` : ""}${clock.time}
        </div>
        <ol class="mb-menu">
          ${line("Resume", "Esc", () => this.closeOverlay(), "primary")}
          ${line("Save game", "", () => (this.overlay = "save"))}
          ${line("Load game", "F9", () => (this.overlay = "load"))}
          ${line("What he carries", "I", () => (this.overlay = "inventory"))}
          ${line("Your skills", "C", () => (this.overlay = "sheet"))}
          ${line("Journal", "J", () => (this.overlay = "journal"))}
          ${line("The story so far", "", () => (this.overlay = "log"))}
          ${line("How to play", "H", () => (this.overlay = "help"))}
          ${line("Note for the writer", "N", () => (this.overlay = "note"))}
          ${line("Your notes for the writer", "", () => this.openNotes())}
          ${line("Settings", "", () => (this.overlay = "settings"))}
          ${line("Credits", "", () => (this.overlay = "credits"))}
          ${line(
            "Save and quit",
            "",
            () => {
              this.autosave();
              this.countPlayed();
              this.host.quit();
            },
            "quiet",
          )}
        </ol>
        <p class="mb-sheet-foot">
          The game saves by itself as you go (the autosave).
          ${touch
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
