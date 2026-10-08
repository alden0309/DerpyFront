// The game screen: a banner in your nation's colours along the top (who you
// are, the date, the treasury, the crown), ledger tabs down the left, the
// map filling the rest, and letters that arrive and wait for an answer.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { bananaMark } from "../../derpland/Icons";
import { formatDate } from "../engine/Calendar";
import { applyDelta } from "../engine/Delta";
import { AMERICAS, worldOf } from "../engine/Map";
import { findPath } from "../engine/Paths";
import {
  adminCapacity,
  adminUsed,
  armySpeed,
  autonomyTarget,
  colonizeCheck,
  emigration,
  favorTarget,
  nationSettlers,
  overextension,
  rulerOf,
} from "../engine/Queries";
import { INDEPENDENCE_AUTONOMY, SPEED_DAYS_PER_SECOND } from "../engine/Rules";
import type {
  Army,
  Command,
  GameEvent,
  GameState,
  RawGood,
  Terrain,
} from "../engine/Types";
import type { ResultLine, SeatInfo, ServerMessage } from "../Protocol";
import { flagFor } from "./Flags";
import {
  ArmyIcon,
  CrownIcon,
  LedgerIcon,
  LetterIcon,
  PeopleIcon,
  QuillIcon,
  ScrollIcon,
} from "./Icons";
import { loadGeo, MapMode, MapView, ramp, TERRAIN_TINT } from "./MapView";
import { Net } from "./Net";
import { confirmMarch, setConfirmMarch } from "./Prefs";
import { music, play, unlockOnFirstGesture } from "./Sound";
import {
  describeEvent,
  GOOD_COLORS,
  GOOD_NAMES,
  money,
  nationName,
  people,
  TERRAIN_NAMES,
} from "./Text";
import { nationVars } from "./Theme";
import { hideTip, num, plain } from "./Tip";
import { armyPanel } from "./ui/ArmyPanel";
import { battleDispatch } from "./ui/Battle";
import {
  breakdownTip,
  DrawerView,
  GameUi,
  Modal,
  Tab,
  token,
} from "./ui/Context";
import { characterSheet, courtTab } from "./ui/Court";
import { crownTab } from "./ui/Crown";
import { economyTab } from "./ui/Economy";
import { militaryTab } from "./ui/Military";
import { ModalHooks, renderModal } from "./ui/Modals";
import { diplomacyTab, nationPanel } from "./ui/NationPanel";
import { peopleTab } from "./ui/People";
import { provincePanel } from "./ui/ProvincePanel";

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
  { id: "court", label: "Court", icon: QuillIcon },
  { id: "crown", label: "Crown", icon: CrownIcon },
  { id: "economy", label: "Treasury", icon: LedgerIcon },
  { id: "people", label: "People", icon: PeopleIcon },
  { id: "military", label: "War", icon: ArmyIcon },
  { id: "diplomacy", label: "Diplomacy", icon: ScrollIcon },
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
  @state() private logOpen = window.innerWidth > 820;
  @state() private toasts: Toast[] = [];
  @state() private picking: number | null = null;
  @state() private chatText = "";
  @state() private results: ResultLine[] | null = null;
  @state() private savedAt: string | null = null;
  /** Battles of yours that just ended, shown as dispatches. */
  @state() private dispatches: number[] = [];
  /** "March there?" after a right-click, where it was clicked. */
  @state() private marchAsk: {
    army: number;
    to: number;
    days: number;
    x: number;
    y: number;
  } | null = null;
  /** The log follows the newest line unless the player has scrolled up. */
  private logStuck = true;

  private s!: GameState;
  private me = -1;
  private you = "";
  private host = "";
  private solo = false;
  private code = "";
  private speed = 2;
  private paused = false;
  private seats: SeatInfo[] = [];
  private dayAt = 0;

  private view: MapView | null = null;
  private selectedProv: number | null = null;
  private selectedArmy: number | null = null;
  private preview: number[] | null = null;
  private hoverProv: number | null = null;
  private flashes = new Map<number, number>();
  private seenLetters = new Set<number>();
  private nextId = 1;
  private frame = 0;
  private lastDraw = 0;
  private lastRender = 0;
  private renderTimer = 0;
  private resizeObs: ResizeObserver | null = null;
  private colonizable: { key: string; set: Set<number> } | null = null;
  private explored: { n: number; set: Set<number> } | null = null;
  /** Seconds left on each letter, as the server last said, and when. */
  private letterLeft = new Map<number, number>();
  private letterAt = 0;
  private letterTimer = 0;

  createRenderRoot() {
    return this;
  }

  // ---------------------------------------------------------------- life

  connectedCallback(): void {
    super.connectedCallback();
    this.net.on(this.onNet);
    window.addEventListener("keydown", this.onKey);
    unlockOnFirstGesture();
    music.start();
    // Letter countdowns tick once a second while the clock runs.
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
    cancelAnimationFrame(this.frame);
    this.resizeObs?.disconnect();
    clearTimeout(this.renderTimer);
    clearInterval(this.letterTimer);
    music.stop();
    hideTip();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("start") && this.start) this.load(this.start);
  }

  protected updated(): void {
    const ol = this.querySelector<HTMLElement>(".cq-log");
    if (ol && this.logStuck) ol.scrollTop = ol.scrollHeight;
  }

  private onLogScroll(e: Event): void {
    const ol = e.target as HTMLElement;
    this.logStuck = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 24;
  }

  private load(m: GameStart): void {
    const fresh = this.code !== m.code;
    this.s = m.state;
    this.you = m.you;
    this.me = m.state.nations.findIndex((n) => n.player === m.you);
    this.host = m.host;
    this.solo = m.solo;
    this.code = m.code;
    this.speed = m.speed;
    this.paused = m.paused;
    this.seats = m.seats;
    this.dayAt = performance.now();
    this.setMood();
    if (fresh) {
      this.log = [];
      this.results = null;
      this.stack =
        this.me >= 0 && this.s.day < 30 ? [{ k: "tab", tab: "court" }] : [];
      this.modalView = null;
      this.seenLetters = new Set(
        this.me >= 0 ? this.s.nations[this.me].events.map((e) => e.id) : [],
      );
      this.selectedArmy = null;
      this.selectedProv = null;
      void this.updateComplete.then(() => this.attachMap(true));
      // A letter already waiting when you sit down (solo; in company it waits
      // in the tray so the game isn't blocked).
      const first =
        this.me >= 0 ? this.s.nations[this.me].events[0] : undefined;
      if (first && this.solo) this.modalView = { k: "event", id: first.id };
    }
    if (this.s.over) this.modalView = { k: "end" };
  }

  private async attachMap(focus: boolean): Promise<void> {
    const geo = await loadGeo();
    const host = this.querySelector<HTMLElement>(".cq-map-host");
    if (!host) return;
    this.view ??= new MapView(map, world, geo, {
      click: (p, army, e) => this.onMapClick(p, army, e),
      rightClick: (p, at) => this.onMapRightClick(p, at),
      hover: (p) => this.onHover(p),
    });
    if (!host.contains(this.view.canvas)) host.appendChild(this.view.canvas);
    this.view.resize(host.clientWidth, host.clientHeight);
    this.resizeObs?.disconnect();
    this.resizeObs = new ResizeObserver(() =>
      this.view?.resize(host.clientWidth, host.clientHeight),
    );
    this.resizeObs.observe(host);
    if (focus) {
      const capital =
        this.me >= 0
          ? this.s.nations[this.me].capital
          : map.powers[0].provinces[0];
      this.view.focus(capital, 2.6);
    }
  }

  // ---------------------------------------------------------------- server

  private onNet = (m: ServerMessage): void => {
    if (!this.s) return;
    switch (m.t) {
      case "d": {
        applyDelta(this.s, m.d);
        this.dayAt = performance.now();
        for (const e of m.d.events ?? []) this.onEvent(e);
        this.checkLetters();
        if (m.d.over) this.modalView = { k: "end" };
        if (m.d.prov || m.d.nations) this.view?.markDirty();
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
            `${m.by} ${m.paused ? "paused the game" : `set the speed to ${m.speed}`}.`,
          );
        this.requestRender();
        return;
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

  /** Fife and drum while we're at war, lute and harpsichord in peace. */
  private setMood(): void {
    const me = this.me;
    const fighting =
      me >= 0 && this.s.wars.some((w) => w.a === me || w.b === me);
    music.setMood(fighting ? "war" : "peace");
  }

  private myName(): string {
    return this.seats.find((x) => x.id === this.you)?.name ?? "";
  }

  private onEvent(e: GameEvent): void {
    if (e.k === "battle") this.flashes.set(e.p, performance.now());
    this.soundFor(e);
    const text = describeEvent(this.s, map, this.me, e);
    if (!text) return;
    const me = this.me;
    let tone: LogLine["tone"] = "";
    let alert = false;
    switch (e.k) {
      case "battle": {
        const weAttacked = e.a.includes(me);
        tone = (e.w === 0) === weAttacked ? "good" : "bad";
        alert = true;
        break;
      }
      case "war":
        tone = e.on === me ? "bad" : "";
        alert = e.on === me || e.n === me;
        break;
      case "occupied":
      case "razed":
        tone = e.from === me ? "bad" : "good";
        alert = true;
        break;
      case "siege":
        alert = e.from === me;
        tone = e.from === me ? "bad" : "";
        break;
      case "revolt":
        tone = "bad";
        alert = true;
        break;
      case "peace":
      case "treaty":
      case "colony":
      case "bought":
      case "ceded":
        tone = e.k === "ceded" && e.from === me ? "bad" : "good";
        alert = e.k !== "colony" || e.n === me;
        break;
      case "offer":
        alert = true;
        break;
      case "refused":
        tone = "bad";
        alert = true;
        break;
      case "died":
      case "succession":
      case "scheme":
        alert = e.n === me;
        tone = e.k === "scheme" && e.done ? "bad" : "";
        break;
      case "independence":
      case "over":
      case "fallen":
      case "europe":
        alert = true;
        break;
      case "deal":
        tone =
          e.status === "refused" ? "bad" : e.status === "done" ? "good" : "";
        alert = e.n === me || e.with === me;
        break;
      case "tributary":
        tone =
          e.by === me ? (e.free ? "bad" : "good") : e.n === me ? "bad" : "";
        alert = e.by === me || e.n === me;
        break;
      case "abandoned":
      case "ordered":
        alert = e.n === me;
        break;
    }
    this.addLog(text, tone, e.k === "battle" ? e.id : undefined, e.day);
    // Your battles get a dispatch explaining the outcome instead of a note.
    if (e.k === "battle" && (e.a.includes(me) || e.d.includes(me))) {
      this.dispatches = [
        ...this.dispatches.filter((id) => id !== e.id),
        e.id,
      ].slice(-2);
      const id = e.id;
      setTimeout(
        () => (this.dispatches = this.dispatches.filter((x) => x !== id)),
        15000,
      );
      return;
    }
    if (alert) this.toast(text, tone);
  }

  private soundFor(e: GameEvent): void {
    const me = this.me;
    if (me < 0) return;
    switch (e.k) {
      case "battle":
        if (e.a.includes(me) || e.d.includes(me)) {
          play("cannon");
          const won = (e.w === 0) === e.a.includes(me);
          setTimeout(() => play(won ? "victory" : "defeat"), 900);
        }
        return;
      case "war":
        if (e.n === me || e.on === me) play("drums");
        return;
      case "colony":
        if (e.n === me) play("colony");
        return;
      case "convoy":
        if (e.n === me && !e.out) play("bell");
        return;
      case "mission":
        if (e.n === me && e.result !== "lost") play("bell");
        return;
      case "deal":
        if ((e.n === me || e.with === me) && e.status === "done") play("coins");
        if (e.with === me && e.status === "offered") play("paper");
        return;
      case "ordered":
        if (e.n === me) play("coins");
        return;
      case "tributary":
        if (e.by === me && !e.free) play("honour");
        return;
      case "crown":
        if (e.n === me) play("honour");
        return;
    }
  }

  /** Seconds a letter has left now (counting down while the clock runs). */
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

  /** New letters: in a solo game the clock stops and the letter opens. */
  private checkLetters(): void {
    if (this.me < 0) return;
    const fresh = this.s.nations[this.me].events.filter(
      (e) => !this.seenLetters.has(e.id),
    );
    if (fresh.length === 0) return;
    for (const e of fresh) this.seenLetters.add(e.id);
    play("letter");
    if (this.solo) {
      // Alone, the clock stops and the letter opens.
      this.modalView ??= { k: "event", id: fresh[0].id };
      if (!this.paused) this.net.send({ t: "pause", p: true });
    }
  }

  private toast(text: string, tone: Toast["tone"] = ""): void {
    const id = this.nextId++;
    this.toasts = [...this.toasts.slice(-2), { id, text, tone }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 5500);
  }

  /** Panels re-render a few times a second at most. */
  private requestRender(): void {
    if (this.view) this.view.needsDraw = true;
    const now = performance.now();
    if (now - this.lastRender > 250) {
      this.lastRender = now;
      this.tick++;
      return;
    }
    clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.lastRender = performance.now();
      this.tick++;
    }, 260);
  }

  private async cmd(c: Command): Promise<boolean> {
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
    } else if (/^[1-5]$/.test(e.key)) {
      this.setSpeed(Number(e.key));
    } else if (e.key === "Escape") {
      if (this.picking !== null) this.picking = null;
      else if (this.modalView && this.modalView.k !== "event")
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

  private setPaused(p: boolean): void {
    if (this.me < 0 || this.s.over) return;
    this.net.send({ t: "pause", p });
  }

  private setSpeed(sp: number): void {
    if (this.me < 0 || this.s.over) return;
    this.net.send({ t: "speed", s: sp });
  }

  // ---------------------------------------------------------------- map

  private dayNow(): number {
    if (this.paused || this.s.over) return this.s.day;
    const elapsed = (performance.now() - this.dayAt) / 1000;
    return (
      this.s.day + Math.min(1.5, elapsed * SPEED_DAYS_PER_SECOND[this.speed])
    );
  }

  private drawMap(t: number): void {
    if (!this.view || !this.s) return;
    for (const [p, at] of this.flashes)
      if (performance.now() - at > 4000) this.flashes.delete(p);
    this.view.overlay = {
      state: this.s,
      me: this.me,
      dayNow: this.dayNow(),
      selectedProv: this.selectedProv,
      selectedArmy: this.selectedArmy,
      battles: this.flashes,
      preview: this.preview,
      mode: this.mode,
      colonizable: this.colonizableSet(),
      explored: this.exploredSet(),
    };
    const animating = !this.paused || this.flashes.size > 0;
    if (this.view.needsDraw || (animating && t - this.lastDraw > 32)) {
      this.lastDraw = t;
      this.view.needsDraw = false;
      this.view.draw(t);
    }
  }

  /** What you've surveyed (null when watching: you see everything). */
  private exploredSet(): Set<number> | null {
    const me = this.me >= 0 ? this.s.nations[this.me] : null;
    if (!me || me.kind !== "power") return null;
    if (this.explored?.n !== me.explored.length) {
      this.explored = { n: me.explored.length, set: new Set(me.explored) };
      this.view?.markDirty();
    }
    return this.explored.set;
  }

  /** Open land you could settle now; worked out again when the day or treasury changes. */
  private colonizableSet(): Set<number> {
    const me = this.me >= 0 ? this.s.nations[this.me] : null;
    if (!me || me.kind !== "power" || this.s.over || this.mode !== "nation")
      return new Set();
    const key = `${this.s.day}:${Math.floor(me.gold)}`;
    if (this.colonizable?.key === key) return this.colonizable.set;
    const set = new Set<number>();
    for (let p = 0; p < this.s.provinces.length; p++) {
      const pr = this.s.provinces[p];
      if (
        pr.owner === -1 &&
        !pr.colony &&
        colonizeCheck(this.s, world, this.me, p).ok
      )
        set.add(p);
    }
    this.colonizable = { key, set };
    this.view?.markDirty();
    return set;
  }

  private onMapClick(
    p: number | null,
    army: Army | null,
    e: PointerEvent,
  ): void {
    hideTip();
    if (this.picking !== null) {
      const id = this.picking;
      this.picking = null;
      if (p !== null) void this.cmd({ k: "move", a: id, to: p });
      this.preview = null;
      return;
    }
    if (army) {
      this.selectedArmy = army.id;
      this.selectedProv = army.prov;
      this.preview = null;
      this.open({ k: "army", id: army.id });
      return;
    }
    if (e.shiftKey && p !== null && this.ownSelectedArmy()) {
      this.onMapRightClick(p, { x: e.clientX, y: e.clientY });
      return;
    }
    this.marchAsk = null;
    this.selectedArmy = null;
    this.preview = null;
    this.selectedProv = p;
    if (p !== null) this.open({ k: "prov", p });
    if (this.view) this.view.needsDraw = true;
  }

  private ownSelectedArmy(): Army | undefined {
    return this.s.armies.find(
      (a) => a.id === this.selectedArmy && a.owner === this.me,
    );
  }

  private onMapRightClick(
    p: number | null,
    at?: { x: number; y: number },
  ): void {
    if (p === null) return;
    const a = this.ownSelectedArmy();
    if (!a) {
      this.selectedProv = p;
      this.open({ k: "prov", p });
      return;
    }
    if (confirmMarch() && at) {
      const from = a.depart >= 0 && a.path.length ? a.path[0] : a.prov;
      const route = findPath(this.s, map, this.me, from, p, armySpeed(a));
      if (!route) {
        this.toast("They can't get there.", "bad");
        return;
      }
      this.marchAsk = {
        army: a.id,
        to: p,
        days: Math.ceil(route.days),
        x: at.x,
        y: at.y,
      };
      return;
    }
    this.march(a.id, p);
  }

  private march(army: number, to: number): void {
    this.marchAsk = null;
    void this.cmd({ k: "move", a: army, to }).then((ok) => {
      if (ok) {
        this.preview = null;
        play("drums");
      }
    });
  }

  private marchPopup(): TemplateResult | typeof nothing {
    const m = this.marchAsk;
    if (!m) return nothing;
    const place = map.provinces[m.to].name;
    const left = Math.max(8, Math.min(m.x + 8, window.innerWidth - 268));
    const top = Math.max(70, Math.min(m.y + 8, window.innerHeight - 160));
    return html`<div
      class="cq-march-ask"
      role="dialog"
      aria-label="March"
      style="left:${left}px;top:${top}px"
    >
      <p>
        March to <b>${place}</b>?
        <span class="cq-muted small">About ${m.days} days.</span>
      </p>
      <div class="cq-btnrow">
        <button
          class="cq-btn small primary"
          @click=${() => this.march(m.army, m.to)}
        >
          March
        </button>
        <button
          class="cq-btn small quiet"
          @click=${() => (this.marchAsk = null)}
        >
          Cancel
        </button>
      </div>
      <label class="cq-check small">
        <input
          type="checkbox"
          @change=${(e: Event) =>
            setConfirmMarch(!(e.target as HTMLInputElement).checked)}
        />
        Don't ask again (turn it back on in the menu)
      </label>
    </div>`;
  }

  private onHover(p: number | null): void {
    if (p === this.hoverProv) return;
    this.hoverProv = p;
    const id = this.picking ?? this.selectedArmy;
    const a = this.s.armies.find((x) => x.id === id && x.owner === this.me);
    if (!a || p === null || p === a.prov) {
      if (this.preview) {
        this.preview = null;
        if (this.view) this.view.needsDraw = true;
      }
      return;
    }
    const from = a.depart >= 0 && a.path.length ? a.path[0] : a.prov;
    const route = findPath(this.s, map, this.me, from, p, armySpeed(a));
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
    // Tabs start a fresh trail; everything else stacks for the back button.
    this.stack = v.k === "tab" ? [v] : [...this.stack.slice(-8), v];
    if (v.k === "army") this.selectedArmy = v.id;
    if (this.view) this.view.needsDraw = true;
  }

  private get ui(): GameUi {
    return {
      s: this.s,
      w: world,
      map,
      me: this.me,
      solo: this.solo,
      cmd: (c) => this.cmd(c),
      open: (v) => this.open(v),
      back: () => {
        this.stack = this.stack.slice(0, -1);
      },
      modal: (m) => {
        hideTip();
        this.modalView = m;
      },
      focusProv: (p) => {
        this.selectedProv = p;
        this.view?.focus(p);
        this.open({ k: "prov", p });
      },
      pickTarget: (id) => {
        this.picking = id;
        this.selectedArmy = id;
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
    const n = this.me >= 0 ? this.s.nations[this.me] : null;
    const style = nationVars(n?.color ?? "#6b4f33");
    const cur = this.stack[this.stack.length - 1];
    const ui = this.ui;
    return html`<div
      class="cq-game ${this.picking !== null ? "picking" : ""}"
      style=${style}
    >
      ${this.banner()} ${this.letterTray()}
      <div class="cq-body">
        ${n ? this.tabs(cur) : nothing}
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
              <div class="cq-drawer-page">${this.drawerBody(cur)}</div>
            </aside>`
          : nothing}
        <main class="cq-map-wrap">
          <div class="cq-map-host"></div>
          ${this.picking !== null
            ? html`<div class="cq-picking">
                Where should the army march? Click a province.
                <button
                  class="cq-btn small"
                  @click=${() => (this.picking = null)}
                >
                  Cancel
                </button>
              </div>`
            : nothing}
          ${this.modes()} ${this.chronicle()}
          <div class="cq-zoom">
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
      ${this.marchPopup()}
      ${this.modalView ? renderModal(ui, this.modalView, this.hooks) : nothing}
    </div>`;
  }

  private drawerBody(v: DrawerView): TemplateResult {
    const ui = this.ui;
    switch (v.k) {
      case "prov":
        return provincePanel(ui, v.p);
      case "army":
        return armyPanel(ui, v.id);
      case "nation":
        return nationPanel(ui, v.n);
      case "char":
        return characterSheet(ui, v.c);
      case "tab":
        switch (v.tab) {
          case "court":
            return courtTab(ui);
          case "crown":
            return crownTab(ui);
          case "economy":
            return economyTab(ui);
          case "people":
            return peopleTab(ui);
          case "military":
            return militaryTab(ui);
          case "diplomacy":
            return diplomacyTab(ui);
        }
    }
  }

  private banner(): TemplateResult {
    const s = this.s;
    const n = this.me >= 0 ? s.nations[this.me] : null;
    const ruler = n ? rulerOf(s, this.me) : undefined;
    const letters = n?.events.length ?? 0;
    return html`<header class="cq-banner">
      <a class="cq-home" href="/" title="Derp Land" aria-label="Derp Land">
        ${bananaMark("cq-home-mark")}
      </a>
      ${n
        ? html`<button
            class="cq-who"
            @click=${() => this.open({ k: "tab", tab: "court" })}
          >
            ${flagFor(n, "cq-flag banner")}
            <span class="cq-who-text">
              <span class="cq-who-nation">${nationName(n.name)}</span>
              <span class="cq-who-gov"
                >${n.title > 0 ? "" : "Gov. "}${ruler
                  ? (ruler.title ?? `${ruler.first} ${ruler.family}`)
                  : "—"}</span
              >
            </span>
            ${token(this.ui, ruler, "banner-token")}
          </button>`
        : html`<span class="cq-who watching">Watching</span>`}
      <div class="cq-clock">
        <span class="cq-date">${formatDate(s.day)}</span>
        <div class="cq-speed" role="group" aria-label="Game speed">
          <button
            class="cq-pause ${this.paused ? "on" : ""}"
            ?disabled=${!n || s.over}
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
          ${[1, 2, 3, 4, 5].map(
            (sp) =>
              html`<button
                class="cq-pip ${!this.paused && this.speed >= sp ? "on" : ""}"
                ?disabled=${!n || s.over}
                title="Speed ${sp} (key ${sp})"
                aria-label="Speed ${sp}"
                @click=${() => this.setSpeed(sp)}
              ></button>`,
          )}
        </div>
      </div>
      ${n && n.kind === "power"
        ? this.chips()
        : html`<div class="cq-chips-bar"></div>`}
      <div class="cq-banner-end">
        ${n
          ? html`<button
              class="cq-letters ${letters ? "has" : ""}"
              ?disabled=${!letters}
              title=${letters
                ? `${letters} letter${letters === 1 ? "" : "s"} waiting`
                : "No letters"}
              @click=${() =>
                n.events[0] &&
                (this.modalView = { k: "event", id: n.events[0].id })}
            >
              ${LetterIcon()}${letters
                ? html`<span class="cq-count">${letters}</span>`
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

  /** Letters waiting for an answer, each with the time it has left. */
  private letterTray(): TemplateResult | typeof nothing {
    const n = this.me >= 0 ? this.s.nations[this.me] : null;
    if (!n || n.events.length === 0) return nothing;
    if (this.modalView?.k === "event") return nothing;
    return html`<div
      class="cq-letter-tray"
      role="list"
      aria-label="Letters waiting"
    >
      ${n.events.map((e) => {
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
      })}
    </div>`;
  }

  private chips(): TemplateResult {
    const s = this.s;
    const me = this.me;
    const n = s.nations[me];
    const L = n.ledger;
    const used = adminUsed(s, world, me);
    const cap = adminCapacity(s, me);
    const over = overextension(s, world, me);
    const ft = favorTarget(s, world, me);
    const at = autonomyTarget(s, world, me);
    return html`<div class="cq-chips-bar">
      <span class="cq-chip-stat">
        <span class="lbl">Gold</span>
        ${num(
          html`${money(n.gold)}
            <small class=${L.net >= 0 ? "up" : "down"}
              >${L.net >= 0 ? "+" : "−"}${plain(Math.abs(L.net))}</small
            >`,
          () => ({
            title: "Treasury: last month",
            b: {
              total: L.net,
              parts: [
                ...L.income.map((l) => ({ label: l.label, value: l.value })),
                ...L.spending.map((l) => ({ label: l.label, value: -l.value })),
              ],
            },
          }),
          `val ${n.gold < 0 ? "bad" : ""}`,
        )}
      </span>
      ${!n.independent
        ? html`<span class="cq-chip-stat">
            <span class="lbl">Favor</span>
            ${num(
              String(Math.round(n.favor)),
              () =>
                breakdownTip("Crown favor is heading for", ft, undefined, [
                  `Now ${Math.round(n.favor)}; it moves a tenth of the way each month.`,
                ]),
              `val ${n.favor < 30 ? "bad" : ""}`,
            )}
          </span>`
        : nothing}
      <span class="cq-chip-stat">
        <span class="lbl">Autonomy</span>
        ${num(
          String(Math.round(n.autonomy)),
          () =>
            breakdownTip("Autonomy is heading for", at, undefined, [
              `Now ${Math.round(n.autonomy)}. At ${INDEPENDENCE_AUTONOMY} you may declare independence.`,
            ]),
          "val",
        )}
      </span>
      <span class="cq-chip-stat">
        <span class="lbl">Admin</span>
        ${num(
          `${plain(used.total)}/${plain(cap.total)}`,
          () =>
            breakdownTip("Administration your land takes", used, undefined, [
              `You can govern ${plain(cap.total)}.${over > 0 ? ` You're ${Math.round(over * 100)}% over: unrest and corruption follow.` : ""}`,
            ]),
          `val ${over > 0 ? "bad" : ""}`,
        )}
      </span>
      <span class="cq-chip-stat">
        <span class="lbl">Settlers</span>
        ${num(
          people(nationSettlers(s, me)),
          () =>
            breakdownTip(
              "Settlers sailing from home each month",
              emigration(s, me),
            ),
          "val",
        )}
      </span>
    </div>`;
  }

  private tabs(cur: DrawerView | undefined): TemplateResult {
    const n = this.s.nations[this.me];
    const offers = this.s.offers.some((o) => o.to === this.me);
    const plots = n.court.some((c) => this.s.chars[c]?.scheme?.exposed);
    const demand = !!n.demand;
    const badge: Partial<Record<Tab, boolean>> = {
      military: offers,
      court: plots,
      crown: demand,
    };
    return html`<nav class="cq-tabs" aria-label="Your realm">
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
          Each realm's name runs across its land. Hatching: held by an enemy.
          Faint tint: a colony being founded.
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
          <p>
            What each province's land yields. Deeper colour: making more of it.
            ${this.me >= 0 && this.s.nations[this.me].kind === "power"
              ? html`A <b>?</b> marks land nobody has surveyed: send an
                  expedition to learn what it holds.`
              : nothing}
          </p>`;
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
    const others = this.seats.filter((x) => x.power && x.id !== this.you);
    return html`<section class="cq-chronicle ${this.logOpen ? "open" : ""}">
      <button
        class="cq-chronicle-head"
        aria-expanded=${this.logOpen}
        @click=${() => (this.logOpen = !this.logOpen)}
      >
        <span>Game Log</span>
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
        ? html`<ol class="cq-log" @scroll=${(e: Event) => this.onLogScroll(e)}>
              ${this.log.length === 0
                ? html`<li class="cq-muted">
                    Nothing yet. News will gather here.
                  </li>`
                : nothing}
              ${this.log
                .slice(0, 60)
                .reverse()
                .map(
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
