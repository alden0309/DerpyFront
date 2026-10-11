// The game screen: a banner along the top (your portrait, who you are, your
// purse, health, stress and renown, the date and the clock), ledger tabs down
// the left, the map filling the rest with you on it, and what happens to you
// arriving as letters that wait for an answer.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { bananaMark } from "../../derpland/Icons";
import { boatRoute, sailCheck } from "../engine/Boats";
import { formatDate } from "../engine/Calendar";
import { applyDelta } from "../engine/Delta";
import { fogged, fogView } from "../engine/Fog";
import {
  ageOfLife,
  hasKit,
  lifeIsNative,
  lifeOfSeat,
  lifeTitle,
  meOf,
  monthlyBudget,
  paceOf,
  promotionView,
  travelRoute,
} from "../engine/LifeQueries";
import { AMERICAS, worldOf } from "../engine/Map";
import { SKIP_DAYS_PER_SECOND } from "../engine/Pace";
import { findPath } from "../engine/Paths";
import { armySpeed, charName } from "../engine/Queries";
import {
  MAX_SPEED,
  SPEED_DAYS_PER_SECOND,
  SPEED_LABELS,
} from "../engine/Rules";
import type {
  Army,
  GameEvent,
  GameState,
  Life,
  LifeCommand,
  LifePlan,
  RawGood,
  Terrain,
} from "../engine/Types";
import type { ResultLine, SeatInfo, ServerMessage } from "../Protocol";
import {
  AffairsIcon,
  HereIcon,
  JournalIcon,
  LetterIcon,
  PeopleIcon,
  SelfIcon,
  WorldIcon,
} from "./Icons";
import {
  LifeMark,
  loadGeo,
  MapFog,
  MapMode,
  MapView,
  ramp,
  TERRAIN_TINT,
} from "./MapView";
import { Net } from "./Net";
import { likenessOf } from "./Portrait";
import { confirmMarch, setConfirmMarch } from "./Prefs";
import { music, play, unlockOnFirstGesture } from "./Sound";
import { describeEvent, GOOD_COLORS, GOOD_NAMES, TERRAIN_NAMES } from "./Text";
import { nationVars } from "./Theme";
import { hideTip, num, plain } from "./Tip";
import { affairsTab } from "./ui/Affairs";
import {
  captureAnchors,
  pointerOver,
  restoreAnchors,
  trackPointer,
} from "./ui/Anchor";
import { armyPanel } from "./ui/ArmyPanel";
import { battleDispatch, myBattleNation } from "./ui/Battle";
import {
  breakdownTip,
  DrawerView,
  GameUi,
  Modal,
  Tab,
  token,
} from "./ui/Context";
import { herePanel, provincePage } from "./ui/Here";
import { journalTab } from "./ui/Journal";
import { needsAttention, tradesPage } from "./ui/Livelihood";
import { ModalHooks, renderModal } from "./ui/Modals";
import { personPage, youTab } from "./ui/Sheet";
import { forgetSteady, setSteadyRedraw, touched } from "./ui/Steady";
import { nationPage, peopleTab, worldTab } from "./ui/World";
import { FigureColors, figureColorsOf } from "./Walkers";

export type GameStart = Extract<ServerMessage, { t: "game" }>;

const map = AMERICAS;
const world = worldOf(map);

export { loadGeo };

interface LogLine {
  id: number;
  day: number;
  text: string;
  tone: "good" | "bad" | "";
  battle?: number;
}

interface Toast {
  id: number;
  text: string;
  tone: "good" | "bad" | "";
}

const TABS: { id: Tab; label: string; icon: () => TemplateResult }[] = [
  { id: "here", label: "Here", icon: HereIcon },
  { id: "you", label: "You", icon: SelfIcon },
  { id: "people", label: "People", icon: PeopleIcon },
  { id: "affairs", label: "Affairs", icon: AffairsIcon },
  { id: "journal", label: "Journal", icon: JournalIcon },
  { id: "world", label: "World", icon: WorldIcon },
];

/** "1:05" */
function clockText(sec: number): string {
  const s = Math.ceil(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const MODES: { id: MapMode; label: string }[] = [
  { id: "nation", label: "Nations" },
  { id: "terrain", label: "Terrain" },
  { id: "economy", label: "Economy" },
  { id: "people", label: "People" },
];

const NO_SET = new Set<number>();
/** News big enough to be proclaimed: a rising, its victory, a revolution. */
const PROCLAIMED =
  /has risen in arms|has carried|declares itself free|has driven the|gives way to/;

@customElement("cq-game")
export class GameView extends LitElement {
  @property({ attribute: false }) net!: Net;
  @property({ attribute: false }) start!: GameStart;
  @property({ attribute: false }) signedIn = false;

  @state() private tick = 0;
  @state() private stack: DrawerView[] = [];
  @state() private modalView: Modal | null = null;
  @state() private mode: MapMode = "nation";
  @state() private log: LogLine[] = [];
  @state() private logOpen = false;
  @state() private toasts: Toast[] = [];
  /** Choosing on the map where your army marches. */
  @state() private picking = false;
  @state() private chatText = "";
  @state() private results: ResultLine[] | null = null;
  @state() private savedAt: string | null = null;
  /** Battles you were in that just ended, shown as dispatches. */
  @state() private dispatches: number[] = [];
  /** A rising or a revolution, nailed up across the top of the screen. */
  @state() private proclamation: {
    id: number;
    head: string;
    text: string;
    p: number;
  } | null = null;
  /** "Go there?" after a right-click, where it was clicked. */
  @state() private ask: {
    to: number;
    x: number;
    y: number;
    march: boolean;
  } | null = null;
  private logStuck = true;

  private s!: GameState;
  private you = "";
  private host = "";
  private solo = false;
  private code = "";
  private speed = 1;
  private paused = false;
  /** LIFE (r11): skipping ahead, and who has asked to (seat ids). */
  private skipOn = false;
  private skipAsked: string[] = [];
  private seats: SeatInfo[] = [];
  private dayAt = 0;

  private view: MapView | null = null;
  private selectedProv: number | null = null;
  private selectedArmy: number | null = null;
  private preview: number[] | null = null;
  private hoverProv: number | null = null;
  private flashes = new Map<number, number>();
  /** Where each page below the top of the drawer was scrolled to. */
  private scrolls: number[] = [];
  private drawerScroll: number | null = null;
  private seenEvents = new Set<number>();
  /** The clock was stopped for a letter (alone), not by the player. */
  private autoPaused = false;
  /** The last journal entry we've shown, to toast the new ones. */
  private journalMark = "";
  /** The last outcome shown in a scene. */
  private outcomeSeen = -1;
  /** The last outcome whose lines were kept out of the toasts. */
  private lastOutcomeN = -1;
  private nextId = 1;
  private frame = 0;
  private lastDraw = 0;
  private lastRender = 0;
  private renderTimer = 0;
  private resizeObs: ResizeObserver | null = null;
  private letterLeft = new Map<number, number>();
  private letterAt = 0;
  private letterTimer = 0;
  /** Where things were under the pointer, to keep them there when redrawn. */
  private anchors: ReturnType<typeof captureAnchors> = [];
  /** The page and scene shown at the last drawing. */
  private shownKey = "";
  /** Counts visits to pages, so a list's order is kept for one visit. */
  private visit = 0;
  /** Counts scenes opened, so a scene keeps its look while it's open. */
  private modalSeq = 0;
  /** WORLD r11: what you know and see of the map, worked out once per update. */
  private fogCache: { fog: MapFog | null } | null = null;
  /** WORLD r11: likenesses and clothes for the players' marks, made once each. */
  private markCache = new Map<
    string,
    { face: string | null; colors: FigureColors }
  >();
  private roadCache: {
    key: string;
    road: { from: number; path: number[]; sea: boolean[] } | null;
  } | null = null;

  createRenderRoot() {
    return this;
  }

  // ---------------------------------------------------------------- lifecycle

  connectedCallback(): void {
    super.connectedCallback();
    this.net.on(this.onNet);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("pointermove", trackPointer, { passive: true });
    window.addEventListener("pointerdown", trackPointer, { passive: true });
    window.addEventListener("touchstart", touched, { passive: true });
    window.addEventListener("touchmove", touched, { passive: true });
    setSteadyRedraw(() => this.requestRender());
    unlockOnFirstGesture();
    music.start();
    this.letterTimer = window.setInterval(() => {
      if (this.letterLeft.size && !this.paused) this.tick++;
    }, 1000);
    const loop = (t: number) => {
      this.frame = requestAnimationFrame(loop);
      this.drawMap(t);
    };
    this.frame = requestAnimationFrame(loop);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.net.off(this.onNet);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("pointermove", trackPointer);
    window.removeEventListener("pointerdown", trackPointer);
    window.removeEventListener("touchstart", touched);
    window.removeEventListener("touchmove", touched);
    setSteadyRedraw(null);
    cancelAnimationFrame(this.frame);
    this.resizeObs?.disconnect();
    clearTimeout(this.renderTimer);
    clearInterval(this.letterTimer);
    music.stop();
    hideTip();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("start") && this.start) this.load(this.start);
    if (!this.s) return;
    if ((changed as Map<string, unknown>).has("modalView")) this.modalSeq++;
    // The same page and scene as last time (the world ticked): note what's
    // under the pointer so it stays put. A new page starts where it starts.
    const shown = this.pageKey();
    this.anchors =
      shown === this.shownKey && this.drawerScroll === null
        ? captureAnchors(this)
        : [];
    // An open letter that's been settled (answered, or decided for you)
    // gives way to the next one waiting, or closes.
    const m = this.modalView;
    if (m?.k === "event") {
      const waiting = this.life?.events ?? [];
      const o = this.life?.outcome;
      if (!waiting.some((e) => e.id === m.id))
        // Answered (or decided for you): what came of it, then the next.
        this.modalView =
          o && o.kind === "event" && o.n !== this.outcomeSeen
            ? { k: "outcome" }
            : waiting[0]
              ? { k: "event", id: waiting[0].id }
              : null;
    }
    if (this.modalView?.k === "outcome")
      this.outcomeSeen = this.life?.outcome?.n ?? -1;
    // Alone, the clock stopped for a letter starts again once they're all
    // answered.
    if (
      this.autoPaused &&
      this.paused &&
      this.modalView === null &&
      (this.life?.events.length ?? 0) === 0
    ) {
      this.autoPaused = false;
      this.net.send({ t: "pause", p: false });
    }
  }

  protected updated(): void {
    this.shownKey = this.pageKey();
    restoreAnchors(this.anchors);
    this.anchors = [];
    // The news keeps to its latest line, unless you're pointing into it.
    const ol = this.querySelector<HTMLElement>(".cq-log");
    if (ol && this.logStuck && !pointerOver(ol)) ol.scrollTop = ol.scrollHeight;
    if (this.drawerScroll !== null) {
      const page = this.querySelector<HTMLElement>(".cq-drawer-page");
      if (page) page.scrollTop = this.drawerScroll;
      this.drawerScroll = null;
    }
  }

  /** Which page and scene are showing. */
  private pageKey(): string {
    const top = this.stack[this.stack.length - 1];
    return `${this.visit}|${top ? JSON.stringify(top) : ""}|${this.modalView ? JSON.stringify(this.modalView) : ""}`;
  }

  private onLogScroll(e: Event): void {
    const ol = e.target as HTMLElement;
    this.logStuck = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 24;
  }

  private get life(): Life | null {
    return this.s ? (lifeOfSeat(this.s, this.you) ?? null) : null;
  }

  private load(m: GameStart): void {
    const fresh = this.code !== m.code;
    this.s = m.state;
    this.you = m.you;
    this.host = m.host;
    this.solo = m.solo;
    this.code = m.code;
    this.speed = m.speed;
    this.paused = m.paused;
    this.seats = m.seats;
    this.dayAt = performance.now();
    this.setMood();
    const life = this.life;
    if (fresh) {
      forgetSteady();
      this.log = [];
      this.results = null;
      this.logOpen = window.innerWidth > 820;
      this.stack =
        life && !life.watching && window.innerWidth > 820
          ? [{ k: "tab", tab: "here" }]
          : [];
      this.modalView = null;
      this.seenEvents = new Set(life?.events.map((e) => e.id) ?? []);
      this.journalMark = this.markOf(life);
      this.selectedArmy = null;
      this.selectedProv = null;
      void this.updateComplete.then(() => this.attachMap(true));
      const first = life?.events[0];
      if (first && this.solo) this.modalView = { k: "event", id: first.id };
      // Joined a running world without a character: make one.
      if (!life && !m.state.over) this.modalView = { k: "maker" };
    }
    if (this.s.over) this.modalView = { k: "end" };
  }

  private async attachMap(focus: boolean): Promise<void> {
    const geo = await loadGeo();
    const host = this.querySelector<HTMLElement>(".cq-map-host");
    if (!host) return;
    this.view ??= new MapView(map, world, geo, {
      click: (p, army, e, person) => this.onMapClick(p, army, e, person),
      rightClick: (p, at) => this.onMapRightClick(p, at),
      hover: (p) => this.onHover(p),
    });
    this.view.mount(host);
    this.view.resize(host.clientWidth, host.clientHeight);
    this.resizeObs?.disconnect();
    this.resizeObs = new ResizeObserver(() =>
      this.view?.resize(host.clientWidth, host.clientHeight),
    );
    this.resizeObs.observe(host);
    if (focus) {
      const life = this.life;
      const at =
        life && life.c >= 0
          ? life.prov
          : (this.s.nations.find((n) => n.kind === "power" && n.alive)
              ?.capital ?? 0);
      this.view.focus(at, 3.2);
    }
  }

  // ---------------------------------------------------------------- server

  private onNet = (m: ServerMessage): void => {
    if (!this.s) return;
    switch (m.t) {
      case "d": {
        const before = this.life;
        const where = before?.prov ?? -1;
        const inArmy =
          !!before &&
          before.c >= 0 &&
          ((before.job?.army ?? -1) >= 0 ||
            this.s.armies.some((a) => a.commander === before.c));
        const wasWatching = before?.watching ?? true;
        applyDelta(this.s, m.d);
        this.dayAt = performance.now();
        for (const e of m.d.events ?? []) this.onEvent(e, where, inArmy);
        this.afterLife(wasWatching);
        if (m.d.over) this.modalView = { k: "end" };
        // WORLD r11: the chart is redrawn only when something on it changed.
        this.fogCache = null;
        if (this.view?.chartChanged(this.s, this.mode, this.fog()))
          this.view.markDirty();
        if (m.d.wars) this.setMood();
        this.requestRender();
        return;
      }
      case "letters": {
        this.letterLeft = new Map(
          Object.entries(m.left).map(([id, v]) => [Number(id), v]),
        );
        this.letterAt = performance.now();
        this.paused = m.paused;
        this.requestRender();
        return;
      }
      case "clock":
        this.speed = m.speed;
        this.paused = m.paused;
        this.dayAt = performance.now();
        if (m.by && m.by !== this.myName() && !this.solo)
          this.toast(
            `${m.by} ${m.paused ? "paused the game" : `set the speed to ${SPEED_LABELS[m.speed]}`}.`,
          );
        this.requestRender();
        return;
      case "skip": {
        const was = this.skipOn;
        this.skipOn = m.on;
        this.skipAsked = m.asked;
        this.dayAt = performance.now();
        if (m.why) this.toast(m.why, m.on ? "" : "good");
        else if (
          !m.on &&
          !was &&
          m.by &&
          m.by !== this.myName() &&
          m.asked.length &&
          !m.asked.includes(this.you)
        )
          this.toast(`${m.by} wants to skip ahead. Press ⏩ to agree.`);
        if (m.on && !was) play("paper");
        this.requestRender();
        return;
      }
      case "seats":
        this.seats = m.seats;
        this.host = m.host;
        this.requestRender();
        return;
      case "chat":
        this.addLog(`${m.from}: ${m.text}`, "");
        if (m.from !== this.myName()) this.toast(`${m.from}: ${m.text}`);
        return;
      case "end":
        this.results = m.results;
        this.modalView = { k: "end" };
        return;
      case "saved":
        this.savedAt = m.at;
        return;
      case "ack":
      case "err":
        return;
    }
  };

  /** After a delta: new letters, new journal lines, a new life begun. */
  private afterLife(wasWatching: boolean): void {
    const life = this.life;
    if (!life) return;
    if (wasWatching && !life.watching) {
      // A takeover or a new character: off we go.
      if (this.modalView?.k === "maker" || this.modalView?.k === "takeover")
        this.modalView = null;
      this.view?.focus(life.prov, 3.2);
      this.stack = [{ k: "tab", tab: "here" }];
      this.journalMark = this.markOf(life);
    }
    // What's new in the journal pops up for a moment (unless a scene shows it).
    const fresh = this.newEntries(life);
    const staged =
      this.modalView?.k === "event" ||
      this.modalView?.k === "interact" ||
      this.modalView?.k === "outcome";
    // Lines a scene is about to show aren't toasted as well.
    const o = life.outcome;
    const inScene =
      o && o.n !== this.lastOutcomeN ? new Set(o.lines) : new Set<string>();
    if (o) this.lastOutcomeN = o.n;
    if (!staged)
      for (const e of fresh.slice(-2))
        if (!inScene.has(e.text)) this.toast(e.text, e.tone ?? "");
    if (fresh.some((e) => e.tone === "good")) play("bell");
    // Events that need an answer.
    const waiting = life.events.filter((e) => !this.seenEvents.has(e.id));
    if (waiting.length) {
      for (const e of waiting) this.seenEvents.add(e.id);
      play("letter");
      if (this.solo) {
        this.modalView ??= { k: "event", id: waiting[0].id };
        if (!this.paused) {
          this.net.send({ t: "pause", p: true });
          this.autoPaused = true;
        }
      }
    }
    if (life.watching && !wasWatching) {
      this.stack = [{ k: "tab", tab: "here" }];
      play("defeat");
    }
  }

  private markOf(life: Life | null): string {
    const last = life?.journal[life.journal.length - 1];
    return last ? `${last.day}|${last.c}|${last.text}` : "";
  }

  private newEntries(life: Life): Life["journal"] {
    const j = life.journal;
    if (!this.journalMark) {
      this.journalMark = this.markOf(life);
      return j.slice(-1);
    }
    let i = j.length - 1;
    while (i >= 0 && `${j[i].day}|${j[i].c}|${j[i].text}` !== this.journalMark)
      i--;
    this.journalMark = this.markOf(life);
    return i < 0 ? j.slice(-2) : j.slice(i + 1);
  }

  /** Fife and drum while your people are at war, lute and harpsichord in peace. */
  private setMood(): void {
    const n = this.nationNow();
    const fighting = n >= 0 && this.s.wars.some((w) => w.a === n || w.b === n);
    music.setMood(fighting ? "war" : "peace");
  }

  /** The nation you feel the news through: the one you serve, or your own. */
  private nationNow(): number {
    const life = this.life;
    const me = life ? meOf(this.s, life) : undefined;
    if (!life || !me || life.watching) return -1;
    if (life.job && life.job.nation >= 0) return life.job.nation;
    return me.nation;
  }

  private myName(): string {
    return this.seats.find((x) => x.id === this.you)?.name ?? "";
  }

  private onEvent(e: GameEvent, where: number, inArmy: boolean): void {
    if (e.k === "battle") this.flashes.set(e.p, performance.now());
    const n = this.nationNow();
    const text = describeEvent(this.s, map, n, e);
    // Your battle: a dispatch explaining how it went.
    if (e.k === "battle" && inArmy && e.p === where) {
      play("cannon");
      const r = this.s.battles.find((b) => b.id === e.id);
      if (r) {
        const side = myBattleNation(this.ui, r);
        const won =
          side >= 0 && (r.winner === 0) === r.attacker.nations.includes(side);
        setTimeout(() => play(won ? "victory" : "defeat"), 900);
      }
      this.dispatches = [
        ...this.dispatches.filter((id) => id !== e.id),
        e.id,
      ].slice(-2);
      const id = e.id;
      setTimeout(
        () => (this.dispatches = this.dispatches.filter((x) => x !== id)),
        15000,
      );
    }
    if (e.k === "news" && PROCLAIMED.test(e.text)) this.proclaim(e);
    if (!text) return;
    let tone: LogLine["tone"] = "";
    switch (e.k) {
      case "battle":
        tone = (e.w === 0) === e.a.includes(n) ? "good" : "bad";
        break;
      case "war":
        tone = e.on === n ? "bad" : "";
        if (e.n === n || e.on === n) play("drums");
        break;
      case "occupied":
      case "razed":
        tone = e.from === n ? "bad" : "good";
        break;
      case "revolt":
        tone = "bad";
        break;
      case "peace":
        tone = "good";
        break;
    }
    this.addLog(text, tone, e.k === "battle" ? e.id : undefined, e.day);
  }

  /** Drums, and a broadside across the top of the screen. */
  private proclaim(e: Extract<GameEvent, { k: "news" }>): void {
    const id = this.nextId++;
    const risen = /risen/.test(e.text);
    this.proclamation = {
      id,
      head: risen
        ? "To arms!"
        : /free of the crown/.test(e.text)
          ? "Independence!"
          : "The day is carried",
      text: e.text,
      p: e.p ?? -1,
    };
    play("drums");
    setTimeout(() => {
      if (this.proclamation?.id === id) this.proclamation = null;
    }, 9000);
  }

  private proclamationView(): TemplateResult | typeof nothing {
    const pr = this.proclamation;
    if (!pr) return nothing;
    return html`<button
      class="cq-proclaim"
      title=${pr.p >= 0 ? "Show me where" : "Dismiss"}
      @click=${() => {
        if (pr.p >= 0) this.view?.focus(pr.p, 2.4);
        this.proclamation = null;
      }}
    >
      <span class="cq-proclaim-rod top"></span>
      <span class="cq-proclaim-head">${pr.head}</span>
      <span class="cq-proclaim-text">${pr.text}</span>
      <span class="cq-proclaim-seal" aria-hidden="true"></span>
      <span class="cq-proclaim-rod"></span>
    </button>`;
  }

  /** Seconds an event has left now (counting down while the clock runs). */
  private secondsLeft(id: number): number | null {
    const left = this.letterLeft.get(id);
    if (left === undefined) return null;
    const ran = this.paused ? 0 : (performance.now() - this.letterAt) / 1000;
    return Math.max(0, left - ran);
  }

  private addLog(
    text: string,
    tone: LogLine["tone"],
    battle?: number,
    day = this.s.day,
  ): void {
    this.log = [
      { id: this.nextId++, day, text, tone, battle },
      ...this.log,
    ].slice(0, 120);
  }

  private toast(text: string, tone: Toast["tone"] = ""): void {
    const id = this.nextId++;
    this.toasts = [...this.toasts.slice(-2), { id, text, tone }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 6000);
  }

  /**
   * Panels re-render a few times a second at most; at the faster speeds,
   * twice a second (WORLD r11: a whole drawer of people redrawn four times
   * a second was much of the lag on a phone).
   */
  private requestRender(): void {
    if (this.view) this.view.needsDraw = true;
    const now = performance.now();
    const every = !this.paused && this.speed >= 3 ? 500 : 250;
    if (now - this.lastRender > every) {
      this.lastRender = now;
      this.tick++;
      return;
    }
    clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(
      () => {
        this.lastRender = performance.now();
        this.tick++;
      },
      every - (now - this.lastRender) + 10,
    );
  }

  private async cmd(c: LifeCommand): Promise<boolean> {
    const err = await this.net.command(c);
    if (err) this.toast(err, "bad");
    this.requestRender();
    return err === null;
  }

  // ---------------------------------------------------------------- keys

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT"
    )
      return;
    if (e.key === " ") {
      e.preventDefault();
      this.setPaused(!this.paused);
    } else if (/^[1-4]$/.test(e.key)) {
      this.setSpeed(Number(e.key));
    } else if (e.key === "5") {
      this.toggleSkip();
    } else if (e.key === "Escape") {
      if (this.picking) this.picking = false;
      else if (this.ask) this.ask = null;
      else if (
        this.modalView &&
        this.modalView.k !== "event" &&
        this.modalView.k !== "end"
      )
        this.modalView = null;
      else if (this.stack.length) this.stack = [];
      this.selectedArmy = null;
      this.preview = null;
      if (this.view) this.view.needsDraw = true;
    } else if (e.key === "+" || e.key === "=") {
      this.view?.zoomBy(1.25);
    } else if (e.key === "-") {
      this.view?.zoomBy(0.8);
    }
  };

  private get canSetSpeed(): boolean {
    return this.solo || this.host === this.you;
  }

  private setPaused(p: boolean): void {
    if (this.s.over) return;
    this.autoPaused = false;
    if (!p && !this.canSetSpeed) {
      this.toast("The host sets the clock going again.");
      return;
    }
    this.net.send({ t: "pause", p });
  }

  /** LIFE (r11): skip ahead until something needs you (or ask the others to). */
  private toggleSkip(): void {
    if (this.s.over) return;
    const asked = this.skipAsked.includes(this.you);
    this.net.send({ t: "skip", on: !(this.skipOn || asked) });
  }

  private setSpeed(sp: number): void {
    if (this.s.over || sp < 1 || sp > MAX_SPEED) return;
    if (!this.canSetSpeed) {
      this.toast("The host sets the speed.");
      return;
    }
    this.net.send({ t: "speed", s: sp });
  }

  // ---------------------------------------------------------------- map

  private dayNow(): number {
    if (this.paused || this.s.over) return this.s.day;
    const elapsed = (performance.now() - this.dayAt) / 1000;
    if (this.skipOn)
      return this.s.day + Math.min(6, elapsed * SKIP_DAYS_PER_SECOND);
    return (
      this.s.day + Math.min(1.5, elapsed * SPEED_DAYS_PER_SECOND[this.speed])
    );
  }

  /** WORLD r11: your open leads, pinned on the map. */
  private leadPins(): { p: number; found: boolean; working: boolean }[] {
    const life = this.life;
    if (!life || life.watching) return [];
    const out: { p: number; found: boolean; working: boolean }[] = [];
    for (const ll of life.leads ?? []) {
      if (ll.status !== "open" && ll.status !== "found" && !ll.work) continue;
      const lead = this.s.leads?.find((x) => x.id === ll.id);
      if (lead)
        out.push({
          p: lead.p,
          found: ll.status === "found",
          working: !!ll.work,
        });
    }
    return out;
  }

  /** WORLD r11: the map's fog for you (none while watching). */
  private fog(): MapFog | null {
    if (this.fogCache) return this.fogCache.fog;
    const life = this.life;
    let fog: MapFog | null = null;
    if (fogged(life)) {
      const v = fogView(this.s, world, life);
      let sig = 0;
      for (const p of v.known)
        sig = (sig * 31 + p * 7 + (v.owner(p) ?? -3) + 3) | 0;
      fog = {
        ...v,
        key: `${v.known.size}|${sig}|${[...v.seen].sort((a, b) => a - b).join(".")}`,
      };
    }
    this.fogCache = { fog };
    return fog;
  }

  private marks(): LifeMark[] {
    const s = this.s;
    const out: LifeMark[] = [];
    for (const l of s.lives) {
      const c = meOf(s, l);
      if (!c || l.watching) continue;
      const n = s.nations[c.nation];
      const led = s.armies.find((a) => a.commander === c.id);
      const native = lifeIsNative(s, l);
      // The likeness and clothes, worked out once (not on every frame).
      const age = ageOfLife(s, l);
      const key = `${c.id}|${age}|${n?.color}|${native}|${l.frame}|${c.look ? JSON.stringify(c.look).length : 0}`;
      let look = this.markCache.get(key);
      if (!look) {
        if (this.markCache.size > 64) this.markCache.clear();
        look = {
          face: likenessOf(c, {
            age,
            color: n?.color ?? "#6b4f33",
            native,
          }),
          colors: figureColorsOf(c, native, l.frame),
        };
        this.markCache.set(key, look);
      }
      out.push({
        c: c.id,
        p: l.prov,
        travel: l.travel,
        army: led?.id ?? l.job?.army ?? -1,
        frame: l.frame,
        face: look.face,
        label: l.seat === this.you ? "" : l.name,
        you: l.seat === this.you,
        // Their own colours: their frame for a coat until the painted looks come.
        colors: look.colors,
        female: c.female,
        native,
        mounted: hasKit(s, l, "horse") || hasKit(s, l, "carriage"),
        boats: (l.boats ?? [])
          .filter((b) => l.travel?.boat !== b.id)
          .map((b) => ({ p: b.prov, kind: b.kind, name: b.name })),
      });
    }
    // Yours on top.
    return out.sort((a, b) => Number(a.you) - Number(b.you));
  }

  /** The road to the province you're looking at, if you could go. */
  private road(): { from: number; path: number[]; sea: boolean[] } | null {
    const life = this.life;
    const cur = this.stack[this.stack.length - 1];
    const p =
      cur?.k === "prov"
        ? cur.p
        : this.ask && !this.ask.march
          ? this.ask.to
          : null;
    if (!life || life.watching || life.c < 0 || p === null) return null;
    const from = life.travel ? life.travel.path[0] : life.prov;
    if (p === from) return null;
    const key = `${from}:${p}:${Math.floor(this.s.day / 10)}`;
    if (this.roadCache?.key === key) return this.roadCache.road;
    const native = lifeIsNative(this.s, life);
    const sailor = life.job?.kind === "sailor";
    const pace = paceOf(this.s, life);
    const land = travelRoute(this.s, map, from, p, false, native, sailor, pace);
    const sea = travelRoute(this.s, map, from, p, true, native, sailor, pace);
    const best =
      sea && sea.sea.some(Boolean) && (!land || sea.days < land.days - 1)
        ? sea
        : land;
    const road = best ? { from, path: best.path, sea: best.sea } : null;
    this.roadCache = { key, road };
    return road;
  }

  private drawMap(t: number): void {
    if (!this.view || !this.s) return;
    for (const [p, at] of this.flashes)
      if (performance.now() - at > 4000) this.flashes.delete(p);
    const moving = this.s.lives.some((l) => l.travel);
    // The world is alive at close range (smoke, fires, the sea): keep drawing,
    // a little slower when paused.
    const alive =
      this.view.view.scale >= 0.8 &&
      (this.mode === "nation" || this.mode === "terrain");
    const animating = !this.paused || this.flashes.size > 0 || moving || alive;
    // WORLD r11: paced to the device. Moving things at up to 30 frames a
    // second, the smoke and the sea alone at 15, paused at 10; and never
    // more than about a third of the time spent drawing.
    const base = this.paused ? 100 : this.view.movers > 0 ? 33 : 66;
    // At the quicker speeds the chart (owners, towns, sieges) keeps up once
    // a second rather than three times.
    this.view.chartEvery =
      this.paused || this.speed < 3 ? 300 : this.speed >= 4 ? 1600 : 1000;
    const gap = Math.max(base, this.view.frameCost * 3);
    if (this.view.needsDraw || (animating && t - this.lastDraw > gap)) {
      this.lastDraw = t;
      this.view.needsDraw = false;
      // What to draw, gathered only when drawing (not on every frame).
      this.view.overlay = {
        state: this.s,
        me: this.nationNow(),
        dayNow: this.dayNow(),
        running: !this.paused && !this.s.over,
        selectedProv: this.selectedProv,
        selectedArmy: this.selectedArmy,
        battles: this.flashes,
        preview: this.preview,
        mode: this.mode,
        colonizable: NO_SET,
        explored: null,
        lives: this.marks(),
        road: this.road(),
        // Skipping ahead, feet move fastest of all (LIFE r11).
        speed: this.skipOn ? 5 : this.speed,
        fog: this.fog(),
        leads: this.leadPins(),
      };
      this.view.draw(t);
    }
  }

  private commanded(): Army | undefined {
    const life = this.life;
    return life && life.c >= 0
      ? this.s.armies.find((a) => a.commander === life.c)
      : undefined;
  }

  private onMapClick(
    p: number | null,
    army: Army | null,
    e: PointerEvent,
    person: number | null,
  ): void {
    hideTip();
    this.ask = null;
    if (this.picking) {
      this.picking = false;
      this.preview = null;
      if (p !== null) this.march(p);
      return;
    }
    if (person !== null) {
      const life = this.life;
      this.open(
        life?.c === person
          ? { k: "tab", tab: "you" }
          : { k: "char", c: person },
      );
      return;
    }
    if (army) {
      this.selectedArmy = army.id;
      this.selectedProv = army.prov;
      this.preview = null;
      this.open({ k: "army", id: army.id });
      return;
    }
    if (e.shiftKey && p !== null) {
      this.onMapRightClick(p, { x: e.clientX, y: e.clientY });
      return;
    }
    this.selectedArmy = null;
    this.preview = null;
    this.selectedProv = p;
    const life = this.life;
    if (p !== null)
      this.open(
        life && !life.watching && p === life.prov && !life.travel
          ? { k: "tab", tab: "here" }
          : { k: "prov", p },
      );
    if (this.view) this.view.needsDraw = true;
  }

  /** Right-click (or long-press): go there, or march your army there. */
  private onMapRightClick(
    p: number | null,
    at?: { x: number; y: number },
  ): void {
    if (p === null) return;
    const life = this.life;
    if (!life || life.watching || life.c < 0) {
      this.selectedProv = p;
      this.open({ k: "prov", p });
      return;
    }
    const a = this.commanded();
    if (a) {
      if (confirmMarch() && at)
        this.ask = { to: p, x: at.x, y: at.y, march: true };
      else this.march(p);
      return;
    }
    if (p === life.prov && !life.travel) {
      this.open({ k: "tab", tab: "here" });
      return;
    }
    this.selectedProv = p;
    this.ask = {
      to: p,
      x: at?.x ?? innerWidth / 2,
      y: at?.y ?? innerHeight / 2,
      march: false,
    };
  }

  private march(to: number): void {
    this.ask = null;
    void this.cmd({ k: "march", to }).then((ok) => {
      if (ok) {
        this.preview = null;
        play("drums");
      }
    });
  }

  private travel(to: number, bySea: boolean): void {
    this.ask = null;
    void this.cmd({ k: "travel", to, bySea }).then((ok) => {
      if (ok) {
        play("paper");
        this.stack = [{ k: "tab", tab: "here" }];
      }
    });
  }

  private askPopup(): TemplateResult | typeof nothing {
    const m = this.ask;
    const life = this.life;
    if (!m || !life) return nothing;
    const place = map.provinces[m.to].name;
    const left = Math.max(8, Math.min(m.x + 8, window.innerWidth - 288));
    const top = Math.max(70, Math.min(m.y + 8, window.innerHeight - 190));
    let body: TemplateResult;
    if (m.march) {
      const a = this.commanded();
      const from =
        a && a.depart >= 0 && a.path.length
          ? a.path[0]
          : (a?.prov ?? life.prov);
      const route = a
        ? findPath(this.s, map, a.owner, from, m.to, armySpeed(a))
        : null;
      body = html`<p>
          March the army to <b>${place}</b>?
          <span class="cq-muted small"
            >${route
              ? `About ${Math.ceil(route.days)} days.`
              : "They can't get there."}</span
          >
        </p>
        <div class="cq-btnrow">
          <button
            class="cq-btn small primary"
            ?disabled=${!route}
            @click=${() => this.march(m.to)}
          >
            March
          </button>
          <button class="cq-btn small quiet" @click=${() => (this.ask = null)}>
            Cancel
          </button>
        </div>`;
    } else {
      const from = life.travel ? life.travel.path[0] : life.prov;
      const native = lifeIsNative(this.s, life);
      const sailor = life.job?.kind === "sailor";
      const pace = paceOf(this.s, life);
      const land = travelRoute(
        this.s,
        map,
        from,
        m.to,
        false,
        native,
        sailor,
        pace,
      );
      const sea = travelRoute(
        this.s,
        map,
        from,
        m.to,
        true,
        native,
        sailor,
        pace,
      );
      const seaBetter =
        sea && sea.sea.some(Boolean) && (!land || sea.days < land.days - 1);
      body = html`<p>Go to <b>${place}</b>?</p>
        ${!land && !seaBetter
          ? html`<p class="cq-muted small">There's no way there from here.</p>`
          : nothing}
        <div class="cq-btnrow">
          ${land
            ? html`<button
                class="cq-btn small primary"
                @click=${() => this.travel(m.to, false)}
              >
                Overland, ${Math.ceil(land.days)} days, ${land.cost}c
              </button>`
            : nothing}
          ${seaBetter
            ? html`<button
                class="cq-btn small"
                @click=${() => this.travel(m.to, true)}
              >
                By sea, ${Math.ceil(sea!.days)} days, ${sea!.cost}c
              </button>`
            : nothing}
          ${this.ownBoats(m.to)}
          <button
            class="cq-btn small quiet"
            @click=${() => {
              this.ask = null;
              this.open({ k: "prov", p: m.to });
            }}
          >
            Look first
          </button>
        </div>`;
    }
    return html`<div
      class="cq-march-ask"
      role="dialog"
      aria-label=${m.march ? "March" : "Travel"}
      style="left:${left}px;top:${top}px"
    >
      ${body}
      ${m.march
        ? html`<label class="cq-check small">
            <input
              type="checkbox"
              @change=${(e: Event) =>
                setConfirmMarch(!(e.target as HTMLInputElement).checked)}
            />
            Don't ask again
          </label>`
        : nothing}
    </div>`;
  }

  /** LIFE (r11): sail there in your own boat, if she lies here. */
  private ownBoats(to: number): TemplateResult | typeof nothing {
    const life = this.life;
    if (!life || life.travel) return nothing;
    const boats = (life.boats ?? []).filter((b) => b.prov === life.prov);
    if (!boats.length || !map.provinces[to]?.coastal) return nothing;
    return html`${boats.map((b) => {
      const route = boatRoute(map, life.prov, to, b.kind);
      const check = sailCheck(this.s, map, life, b, to);
      return html`<button
        class="cq-btn small"
        ?disabled=${!check.ok}
        title=${check.ok
          ? "No fare: her crew's wages and keep only"
          : check.why}
        @click=${() => {
          this.ask = null;
          void this.cmd({ k: "sail", to, boat: b.id }).then((ok) => {
            if (ok) {
              play("paper");
              this.stack = [{ k: "tab", tab: "here" }];
            }
          });
        }}
      >
        In the ${b.name}${route ? `, ${Math.ceil(route.days)} days` : ""}
      </button>`;
    })}`;
  }

  private onHover(p: number | null): void {
    if (p === this.hoverProv) return;
    this.hoverProv = p;
    const a = this.picking ? this.commanded() : undefined;
    if (!a || p === null || p === a.prov) {
      if (this.preview) {
        this.preview = null;
        if (this.view) this.view.needsDraw = true;
      }
      return;
    }
    const from = a.depart >= 0 && a.path.length ? a.path[0] : a.prov;
    const route = findPath(this.s, map, a.owner, from, p, armySpeed(a));
    this.preview = route
      ? a.depart >= 0 && a.path.length
        ? [a.path[0], ...route.path]
        : route.path
      : null;
    if (this.view) this.view.needsDraw = true;
  }

  // ---------------------------------------------------------------- the ui object panels use

  private open(v: DrawerView): void {
    hideTip();
    const cur = this.stack[this.stack.length - 1];
    if (cur && JSON.stringify(cur) === JSON.stringify(v)) return;
    // A new page opens at its top; going back returns to where you were.
    const page = this.querySelector<HTMLElement>(".cq-drawer-page");
    this.scrolls =
      v.k === "tab"
        ? []
        : [
            ...this.scrolls.slice(0, this.stack.length - 1),
            page?.scrollTop ?? 0,
          ].slice(-8);
    this.drawerScroll = 0;
    this.visit++;
    this.stack = v.k === "tab" ? [v] : [...this.stack.slice(-8), v];
    if (v.k === "army") this.selectedArmy = v.id;
    if (v.k === "prov") this.selectedProv = v.p;
    if (this.view) this.view.needsDraw = true;
  }

  private get ui(): GameUi {
    const life = this.life;
    const me = life ? (meOf(this.s, life) ?? null) : null;
    return {
      s: this.s,
      w: world,
      map,
      seat: this.you,
      life,
      me: life?.watching ? null : me,
      nation: this.nationNow(),
      solo: this.solo,
      isHost: this.host === this.you,
      cmd: (c) => this.cmd(c),
      open: (v) => this.open(v),
      visit: this.visit,
      modalSeq: this.modalSeq,
      back: () => {
        this.visit++;
        this.stack = this.stack.slice(0, -1);
        this.drawerScroll = this.scrolls.pop() ?? 0;
      },
      modal: (m) => {
        hideTip();
        this.modalView = m;
      },
      focusProv: (p) => {
        this.selectedProv = p;
        this.view?.focus(p);
        const l = this.life;
        this.open(
          l && !l.watching && p === l.prov && !l.travel
            ? { k: "tab", tab: "here" }
            : { k: "prov", p },
        );
      },
      pickMarch: () => {
        if (window.innerWidth <= 820) this.stack = [];
        this.picking = true;
        const a = this.commanded();
        if (a) this.selectedArmy = a.id;
        this.toast("Choose where to march: click a province on the map.");
      },
      toast: (text, tone) => this.toast(text, tone ?? ""),
      redraw: () => this.requestRender(),
    };
  }

  private get hooks(): ModalHooks {
    return {
      save: () => {
        this.net.send({ t: "save" });
        this.toast("Saving…");
      },
      leave: () => this.leave(),
      endGame: () => this.net.send({ t: "end" }),
      newLife: (plan: LifePlan) => {
        this.net.send({ t: "life", plan });
        this.toast("Setting out…");
      },
      isHost: this.host === this.you,
      signedIn: this.signedIn,
      savedAt: this.savedAt,
      code: this.code,
      results: this.results,
      letterLeft: (id) => this.secondsLeft(id),
      paused: this.paused,
    };
  }

  private leave(): void {
    if (this.solo && !this.paused && !this.s.over)
      this.net.send({ t: "pause", p: true });
    this.net.leave();
    this.dispatchEvent(new CustomEvent("cq-leave", { bubbles: true }));
  }

  // ---------------------------------------------------------------- render

  render(): TemplateResult {
    if (!this.s) return html``;
    void this.tick;
    const ui = this.ui;
    const n = ui.me ? this.s.nations[ui.me.nation] : null;
    const style = nationVars(ui.life?.frame ?? n?.color ?? "#6b4f33");
    const cur = this.stack[this.stack.length - 1];
    return html`<div
      class="cq-game ${this.picking ? "picking" : ""}"
      style=${style}
    >
      ${this.banner(ui)} ${this.eventTray(ui)}
      <div class="cq-body">
        ${this.tabs(cur, ui)}
        ${cur
          ? html`<aside class="cq-drawer" aria-label="Details">
              <div class="cq-drawer-bar">
                ${this.stack.length > 1
                  ? html`<button
                      class="cq-btn quiet small"
                      @click=${() => ui.back()}
                    >
                      ‹ Back
                    </button>`
                  : html`<span></span>`}
                <button
                  class="cq-drawer-x"
                  aria-label="Close"
                  @click=${() => (this.stack = [])}
                >
                  ×
                </button>
              </div>
              <div class="cq-drawer-page" data-steady>
                ${this.drawerBody(cur)}
              </div>
            </aside>`
          : nothing}
        <main class="cq-map-wrap">
          <div class="cq-map-host"></div>
          ${this.picking
            ? html`<div class="cq-picking">
                Where should the army march? Click a province.
                <button
                  class="cq-btn small"
                  @click=${() => (this.picking = false)}
                >
                  Cancel
                </button>
              </div>`
            : nothing}
          ${this.modes()} ${this.chronicle()}
          <div class="cq-zoom">
            ${ui.life && ui.life.c >= 0 && !ui.life.watching
              ? html`<button
                  aria-label="Find yourself"
                  title="Find yourself"
                  @click=${() => this.view?.focus(ui.life!.prov, 3.2)}
                >
                  ◎
                </button>`
              : nothing}
            <button aria-label="Zoom in" @click=${() => this.view?.zoomBy(1.3)}>
              +
            </button>
            <button
              aria-label="Zoom out"
              @click=${() => this.view?.zoomBy(0.77)}
            >
              −
            </button>
          </div>
        </main>
      </div>
      <div class="cq-toasts" aria-live="polite">
        ${this.dispatches.map((id) => {
          const r = this.s.battles.find((b) => b.id === id);
          return r
            ? battleDispatch(ui, r, () => {
                this.dispatches = this.dispatches.filter((x) => x !== id);
              })
            : nothing;
        })}
        ${this.toasts.map(
          (t) => html`<div class="cq-toast ${t.tone}">${t.text}</div>`,
        )}
      </div>
      ${this.proclamationView()} ${this.askPopup()}
      ${this.modalView ? renderModal(ui, this.modalView, this.hooks) : nothing}
    </div>`;
  }

  private drawerBody(v: DrawerView): TemplateResult {
    const ui = this.ui;
    switch (v.k) {
      case "prov":
        return provincePage(ui, v.p);
      case "army":
        return armyPanel(ui, v.id);
      case "nation":
        return nationPage(ui, v.n);
      case "char":
        return personPage(ui, v.c);
      case "life":
        return tradesPage(ui);
      case "tab":
        switch (v.tab) {
          case "here":
            return herePanel(ui);
          case "you":
            return youTab(ui);
          case "people":
            return peopleTab(ui);
          case "affairs":
            return affairsTab(ui);
          case "journal":
            return journalTab(ui);
          case "world":
            return worldTab(ui);
        }
    }
  }

  private banner(ui: GameUi): TemplateResult {
    const s = this.s;
    const life = ui.life;
    const me = ui.me;
    const events = life?.events.length ?? 0;
    const budget = life && me ? monthlyBudget(s, world, life) : null;
    return html`<header class="cq-banner">
      <a class="cq-home" href="/" title="Derp Land" aria-label="Derp Land"
        >${bananaMark("cq-home-mark")}</a
      >
      ${life && me
        ? html`<button
            class="cq-who"
            @click=${() => this.open({ k: "tab", tab: "you" })}
          >
            ${token(ui, me, "banner-token")}
            <span class="cq-who-text">
              <span class="cq-who-nation">${charName(me)}</span>
              <span class="cq-who-gov"
                >${lifeTitle(s, life)}, ${ageOfLife(s, life)}</span
              >
            </span>
          </button>`
        : html`<span class="cq-who watching">
            ${life?.ended ? "Watching the world" : "Not yet born"}
          </span>`}
      <div class="cq-clock ${this.skipOn ? "skipping" : ""}">
        <span class="cq-date">${formatDate(s.day)}</span>
        <div class="cq-speed" role="group" aria-label="Game speed">
          <button
            class="cq-pause ${this.paused ? "on" : ""}"
            ?disabled=${s.over}
            aria-pressed=${this.paused}
            title="Pause (space)"
            @click=${() => this.setPaused(!this.paused)}
          >
            ${this.paused
              ? html`<svg viewBox="0 0 12 12"><path d="M3 2l7 4-7 4z" /></svg>`
              : html`<svg viewBox="0 0 12 12">
                  <path d="M3 2h2v8H3zM7 2h2v8H7z" />
                </svg>`}
          </button>
          ${[1, 2, 3, 4].map(
            (sp) =>
              html`<button
                class="cq-speed-btn ${!this.paused && this.speed === sp
                  ? "on"
                  : ""}"
                ?disabled=${s.over || !this.canSetSpeed}
                title=${this.canSetSpeed
                  ? `Speed ${SPEED_LABELS[sp]} (key ${sp})`
                  : "The host sets the speed"}
                aria-label="Speed ${SPEED_LABELS[sp]}"
                aria-pressed=${!this.paused && this.speed === sp}
                @click=${() => this.setSpeed(sp)}
              >
                ${SPEED_LABELS[sp]}
              </button>`,
          )}
          ${this.skipButton()}
        </div>
      </div>
      ${life && me && budget
        ? html`<div class="cq-chips-bar">
            <span class="cq-chip-stat">
              <span class="lbl">Purse</span>
              ${num(
                html`${plain(life.purse)}
                  <small class=${budget.total >= 0 ? "up" : "down"}
                    >${budget.total >= 0 ? "+" : "−"}${plain(
                      Math.abs(budget.total),
                    )}</small
                  >`,
                () => breakdownTip("A month's money", budget),
                `val ${life.purse < 0 ? "bad" : ""}`,
              )}
            </span>
            ${this.meterChip(
              "Health",
              life.health,
              "0 is death. Rest, physic and good living mend it; age, fever and wounds wear it.",
              false,
            )}
            ${this.meterChip(
              "Stress",
              life.stress,
              "At 70 your health and judgement suffer. Drink, prayer, rest and company bring it down.",
              true,
            )}
            <span
              class="cq-chip-stat"
              title="Who knows your name. Opens offices, causes and doors."
            >
              <span class="lbl">Renown</span>
              <span class="val">${Math.round(life.renown)}</span>
            </span>
          </div>`
        : html`<div class="cq-chips-bar"></div>`}
      <div class="cq-banner-end">
        ${life && !life.watching
          ? html`<button
              class="cq-letters ${events ? "has" : ""}"
              ?disabled=${!events}
              title=${events
                ? `${events} waiting for an answer`
                : "Nothing waiting"}
              @click=${() =>
                life.events[0] &&
                (this.modalView = { k: "event", id: life.events[0].id })}
            >
              ${LetterIcon()}${events
                ? html`<span class="cq-count">${events}</span>`
                : nothing}
            </button>`
          : nothing}
        <button
          class="cq-menu-btn"
          aria-label="Menu"
          @click=${() => (this.modalView = { k: "menu" })}
        >
          <svg viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
        </button>
      </div>
    </header>`;
  }

  /** LIFE (r11): skip ahead through the quiet days, until something needs you. */
  private skipButton(): TemplateResult {
    const s = this.s;
    const voters = this.seats.filter(
      (x) => x.online && x.made && !x.watching,
    ).length;
    const asked = this.skipAsked.includes(this.you);
    const title = this.skipOn
      ? "Skipping ahead until something needs you. Click to stop (key 5)."
      : this.solo || voters <= 1
        ? "Skip ahead: the days run fast until something needs you (a letter, an arrival, news of your people), then the clock goes back as it was (key 5)."
        : asked
          ? `You've asked to skip ahead: ${this.skipAsked.length} of ${voters} agree. Click to take it back.`
          : `Skip ahead: everyone living a life must agree (${this.skipAsked.length} of ${voters} have). It stops for anyone's letters or news.`;
    return html`<button
      class="cq-skip-btn ${this.skipOn ? "on" : ""} ${asked && !this.skipOn
        ? "asked"
        : ""}"
      ?disabled=${s.over}
      title=${title}
      aria-label=${this.skipOn ? "Stop skipping ahead" : "Skip ahead"}
      aria-pressed=${this.skipOn || asked}
      @click=${() => this.toggleSkip()}
    >
      <svg viewBox="0 0 16 12" aria-hidden="true">
        <path d="M1 2l6 4-6 4zM8 2l6 4-6 4z" />
      </svg>
      ${!this.skipOn && !this.solo && this.skipAsked.length && voters > 1
        ? html`<small>${this.skipAsked.length}/${voters}</small>`
        : nothing}
    </button>`;
  }

  private meterChip(
    label: string,
    v: number,
    tip: string,
    invert: boolean,
  ): TemplateResult {
    const f = Math.max(0, Math.min(1, v / 100));
    const bad = invert ? f >= 0.7 : f < 0.35;
    return html`<span class="cq-chip-stat meter" title=${tip}>
      <span class="lbl">${label}</span>
      <span class="val ${bad ? "bad" : ""}">${Math.round(v)}</span>
      <span class="cq-minibar ${invert ? "invert" : ""} ${bad ? "bad" : ""}"
        ><span style="width:${Math.round(f * 100)}%"></span
      ></span>
    </span>`;
  }

  /** Events waiting for an answer, each with the time it has left. */
  private eventTray(ui: GameUi): TemplateResult | typeof nothing {
    const life = ui.life;
    if (!life || life.watching || life.events.length === 0) return nothing;
    if (this.modalView?.k === "event") return nothing;
    return html`<div
      class="cq-letter-tray"
      role="list"
      aria-label="Waiting for an answer"
    >
      ${repeat(
        // On a phone, two at most: more would come down over the page.
        life.events.slice(0, window.innerWidth <= 820 ? 2 : 4),
        (e) => e.id,
        (e) => {
          const left = this.secondsLeft(e.id);
          return html`<button
            role="listitem"
            class="cq-tray-letter ${left !== null && left < 20 ? "urgent" : ""}"
            @click=${() => (this.modalView = { k: "event", id: e.id })}
          >
            ${LetterIcon()}<span class="cq-tray-title">${e.title}</span>
            ${left !== null
              ? html`<span class="cq-countdown"
                  >${clockText(left)}${this.paused ? " (paused)" : ""}</span
                >`
              : nothing}
          </button>`;
        },
      )}
      ${window.innerWidth <= 820 && life.events.length > 2
        ? html`<button
            class="cq-tray-more"
            @click=${() => this.open({ k: "tab", tab: "journal" })}
          >
            and ${life.events.length - 2} more
          </button>`
        : nothing}
    </div>`;
  }

  private tabs(cur: DrawerView | undefined, ui: GameUi): TemplateResult {
    const life = ui.life;
    const badge: Partial<Record<Tab, boolean>> = {};
    if (life && !life.watching && life.c >= 0) {
      badge.affairs =
        !!life.invite ||
        (!!life.job && promotionView(this.s, life).check.ok) ||
        needsAttention(life);
      badge.journal = life.events.length > 0;
    }
    if (life?.watching) badge.here = true;
    return html`<nav class="cq-tabs" aria-label="Your life">
      ${TABS.map(
        (t) =>
          html`<button
            class="cq-tab ${cur?.k === "tab" && cur.tab === t.id ? "on" : ""}"
            aria-pressed=${cur?.k === "tab" && cur.tab === t.id}
            @click=${() =>
              cur?.k === "tab" && cur.tab === t.id
                ? (this.stack = [])
                : this.open({ k: "tab", tab: t.id })}
          >
            ${t.icon()}<span>${t.label}</span>${badge[t.id]
              ? html`<i class="cq-dot" aria-label="needs attention"></i>`
              : nothing}
          </button>`,
      )}
    </nav>`;
  }

  private modes(): TemplateResult {
    return html`<div class="cq-modes">
      <div class="cq-legend">${this.legend()}</div>
      <div class="cq-mode-switch" role="radiogroup" aria-label="Map view">
        ${MODES.map(
          (m) =>
            html`<button
              role="radio"
              aria-checked=${this.mode === m.id}
              class=${this.mode === m.id ? "on" : ""}
              @click=${() => {
                this.mode = m.id;
                this.view?.markDirty();
              }}
            >
              ${m.label}
            </button>`,
        )}
      </div>
    </div>`;
  }

  private legend(): TemplateResult {
    switch (this.mode) {
      case "nation":
        return html`<p>
          Each realm's name runs across its land. Click a province to see it and
          the road there; right-click (or hold) to set out.
        </p>`;
      case "terrain":
        return html`<ul class="cq-swatches">
          ${(Object.keys(TERRAIN_TINT) as Terrain[]).map(
            (t) =>
              html`<li>
                <i style="background:${TERRAIN_TINT[t]}"></i>${TERRAIN_NAMES[t]}
              </li>`,
          )}
        </ul>`;
      case "economy":
        return html`<ul class="cq-swatches">
            ${(
              [
                "grain",
                "fish",
                "furs",
                "tobacco",
                "sugar",
                "timber",
                "silver",
              ] as RawGood[]
            ).map(
              (g) =>
                html`<li>
                  <i style="background:${GOOD_COLORS[g]}"></i>${GOOD_NAMES[g]}
                </li>`,
            )}
          </ul>
          <p>What each province's land yields.</p>`;
      case "people":
        return html`<div
            class="cq-ramp"
            style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1]
              .map((t) => ramp(t))
              .join(",")})"
          ></div>
          <p class="cq-ramp-ends"><span>Empty</span><span>Crowded</span></p>`;
    }
  }

  private chronicle(): TemplateResult {
    const others = this.seats.filter((x) => x.made && x.id !== this.you);
    return html`<section class="cq-chronicle ${this.logOpen ? "open" : ""}">
      <button
        class="cq-chronicle-head"
        aria-expanded=${this.logOpen}
        @click=${() => (this.logOpen = !this.logOpen)}
      >
        <span>News</span>
        ${others.length
          ? html`<span class="cq-players"
              >${others.map(
                (x) =>
                  html`<i
                    class=${x.online ? "on" : ""}
                    title="${x.name}${x.online ? "" : " (away)"}"
                  ></i>`,
              )}</span
            >`
          : nothing}
      </button>
      ${this.logOpen
        ? html`<ol
              class="cq-log"
              data-steady
              @scroll=${(e: Event) => this.onLogScroll(e)}
            >
              ${this.log.length === 0
                ? html`<li class="cq-muted">News will gather here.</li>`
                : nothing}
              ${repeat(
                this.log.slice(0, 60).reverse(),
                (l) => l.id,
                (l) =>
                  html`<li class=${l.tone}>
                    <span class="cq-log-date"
                      >${formatDate(l.day).replace(/ \d{4}$/, "")}</span
                    >
                    ${l.battle !== undefined
                      ? html`<button
                          class="cq-link"
                          @click=${() =>
                            (this.modalView = { k: "battle", id: l.battle! })}
                        >
                          ${l.text}
                        </button>`
                      : l.text}
                  </li>`,
              )}
            </ol>
            ${!this.solo
              ? html`<form
                  class="cq-chat"
                  @submit=${(e: Event) => {
                    e.preventDefault();
                    const text = this.chatText.trim();
                    if (text) this.net.send({ t: "chat", text });
                    this.chatText = "";
                  }}
                >
                  <input
                    .value=${this.chatText}
                    maxlength="300"
                    placeholder="Say something to the other players"
                    aria-label="Chat"
                    @input=${(e: Event) =>
                      (this.chatText = (e.target as HTMLInputElement).value)}
                  />
                </form>`
              : nothing}`
        : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-game": GameView;
  }
}
