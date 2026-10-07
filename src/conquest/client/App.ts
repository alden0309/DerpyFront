// Derpy Conquest in the browser: the lobby (solo, create, join) and the game
// screen around the map.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  DERPY_ACCOUNT_EVENT,
  derpyUsername,
  me as fetchMe,
  formatCoins,
} from "../../derpland/Account";
import { formatDate, formatMonth } from "../engine/Calendar";
import { CONQUEST_COINS } from "../engine/Coins";
import { applyDelta } from "../engine/Delta";
import { AMERICAS } from "../engine/Map";
import {
  armiesIn,
  armyMen,
  armyMorale,
  armySpeed,
  armyStrength,
  atWar,
  buildCheck,
  buyCheck,
  colonizeCheck,
  countRegs,
  dealBetween,
  findPath,
  giftCheck,
  nationsBorder,
  nativeTradeGold,
  peaceCheck,
  portConnected,
  provinceIncome,
  provincesOf,
  recruitCheck,
  regimentTypes,
  tradeCheck,
  truceUntil,
  warCheck,
} from "../engine/Queries";
import {
  BUILDINGS,
  CAPACITY_PER_FARM,
  GIFT_SIZES,
  GOOD_BASE_PRICE,
  GOOD_YIELD,
  MAX_COLONISTS,
  POWER_RULES,
  provinceCapacity,
  REGIMENT_MEN,
  REGIMENTS,
  SPEED_DAYS_PER_SECOND,
} from "../engine/Rules";
import {
  Army,
  BattleReport,
  BuildingKind,
  Command,
  GameState,
  GOODS,
  Nation,
  RegType,
} from "../engine/Types";
import {
  DIFFICULTIES,
  END_YEARS,
  ResultLine,
  RoomSettings,
  SeatInfo,
  ServerMessage,
} from "../Protocol";
import { Geo, MapView } from "./MapView";
import { clearRejoin, Net, savedRejoin } from "./Net";
import {
  BUILDING_HELP,
  BUILDING_NAMES,
  describeEvent,
  gold,
  GOOD_ICONS,
  GOOD_NAMES,
  LogLine,
  nationName,
  num,
  REG_NAMES,
  signed,
  TERRAIN_NAMES,
} from "./Text";

const NAME_KEY = "derpy_conquest_name";
const map = AMERICAS;

type Screen = "connecting" | "home" | "room" | "game";
type Modal =
  | null
  | { kind: "battle"; id: number }
  | { kind: "nations" }
  | { kind: "market" }
  | { kind: "help" }
  | { kind: "menu" }
  | { kind: "end" };

interface Toast {
  id: number;
  text: string;
  tone: "good" | "bad" | "neutral";
}

const HELP: [string, string][] = [
  [
    "The goal",
    "Have the highest score when the game ends: land, settlers, gold earned, battles won and conquests all count. Knock out every other power and you win early.",
  ],
  [
    "Time",
    "The game runs on its own. Pause any time (space bar) and change speed with 1 to 5. In multiplayer, anyone can pause.",
  ],
  [
    "Settle",
    "Colonists arrive from home every few months. Click open land (no owner) next to yours, or a short sail from your coast, and found a colony. Settlers grow and immigrants keep coming.",
  ],
  [
    "Trade",
    "Each province makes a trade good. Goods reaching a port sell at full price; landlocked goods sell for half. Prices drop when everyone sells the same thing. Trade deals with natives pay every month.",
  ],
  [
    "Natives",
    "Native nations own much of the land. Trade with them, give gifts, or buy land when they like you. Crowd their borders and they'll grow angry and raid your colonies.",
  ],
  [
    "Armies",
    "Raise regiments in your provinces. Click your army, then right-click (or tap Move here) to march. Armies can't enter anyone's land unless you're at war.",
  ],
  [
    "Battles",
    "When enemies meet they fight at once: dice, terrain, forts, rivers and regiment types decide it. Click a battle in the log to read the report.",
  ],
  [
    "Sieges",
    "Park an army in an enemy province to besiege it. Forts make that much slower; artillery speeds it up. When it falls, it's yours. Natives burn the colonies they take.",
  ],
];

@customElement("conquest-app")
export class ConquestApp extends LitElement {
  @state() private screen: Screen = "connecting";
  @state() private online = false;
  @state() private name = "";
  @state() private account: string | null = derpyUsername();
  @state() private coins: number | null = null;
  @state() private lobby: Extract<ServerMessage, { t: "lobby" }> | null = null;
  @state() private soloPower = "england";
  @state() private settings: RoomSettings = {
    endYear: 1650,
    difficulty: "normal",
  };
  @state() private joinCode = "";
  @state() private toasts: Toast[] = [];
  @state() private redraw = 0;
  @state() private modal: Modal = null;
  @state() private selectedProv: number | null = null;
  @state() private selectedArmy: number | null = null;
  @state() private selectedNation: number | null = null;
  @state() private log: LogLine[] = [];
  @state() private results: ResultLine[] | null = null;
  @state() private mapMode: "political" | "terrain" = "political";
  @state() private panelOpen = true;
  @state() private showIntro = false;
  @state() private chatOpen = false;
  @state() private chatText = "";

  private net = new Net();
  private game: {
    state: GameState;
    me: number;
    you: string;
    host: string;
    solo: boolean;
    code: string;
    speed: number;
    paused: boolean;
    seats: SeatInfo[];
    dayAt: number;
  } | null = null;
  private view: MapView | null = null;
  private geo: Promise<Geo>;
  private battleFlashes = new Map<number, number>();
  private toastId = 0;
  private frame = 0;
  private preview: number[] | null = null;
  private lastRender = 0;
  private lastDraw = 0;

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.geo = import("../data/americas-geo.json?url").then(async (m) => {
      const res = await fetch(m.default);
      return (await res.json()) as Geo;
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    let saved = "";
    try {
      saved = localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      // ignore
    }
    this.name = this.account ?? saved;
    this.net.name = this.name || "Explorer";
    this.net.on((m) => this.onMessage(m));
    this.net.onStatus = (online) => {
      this.online = online;
      if (online && this.screen === "connecting") this.screen = "home";
    };
    const params = new URLSearchParams(location.search);
    const join = params.get("join");
    const ticket = savedRejoin();
    if (join) this.joinCode = join.toUpperCase();
    else if (ticket)
      this.net.ticket = { code: ticket.code, secret: ticket.secret };
    this.net.connect();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    void this.refreshCoins();
    const loop = (t: number) => {
      this.frame = requestAnimationFrame(loop);
      this.drawMap(t);
    };
    this.frame = requestAnimationFrame(loop);
    if (join) {
      this.net.send({ t: "join", code: join });
      history.replaceState(null, "", location.pathname);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frame);
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    this.net.close();
  }

  private onAccount = () => {
    this.account = derpyUsername();
    if (this.account) this.name = this.account;
    void this.refreshCoins();
  };

  private async refreshCoins(): Promise<void> {
    const me = await fetchMe();
    this.coins = me?.coins ?? null;
    if (me) this.account = me.username;
  }

  private onResize = () => {
    const host = this.querySelector<HTMLElement>(".cq-map-host");
    if (this.view && host)
      this.view.resize(host.clientWidth, host.clientHeight);
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.game || this.screen !== "game") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (e.key === "Enter" && !this.game.solo) {
      e.preventDefault();
      this.chatOpen = true;
      void this.updateComplete.then(() =>
        this.querySelector<HTMLInputElement>(".cq-chat input")?.focus(),
      );
    } else if (e.key === " ") {
      e.preventDefault();
      this.net.send({ t: "pause", p: !this.game.paused });
    } else if (/^[1-5]$/.test(e.key)) {
      this.net.send({ t: "speed", s: Number(e.key) });
    } else if (e.key === "Escape") {
      if (this.modal) this.modal = null;
      else this.select(null, null);
    } else if (e.key === "+" || e.key === "=") {
      this.view?.zoomBy(1.25);
    } else if (e.key === "-") {
      this.view?.zoomBy(0.8);
    }
  };

  // ---------------------------------------------------------------- server

  private onMessage(m: ServerMessage): void {
    switch (m.t) {
      case "welcome":
        this.name = m.name;
        this.account = m.account;
        if (this.screen === "connecting") this.screen = "home";
        return;
      case "lobby":
        this.lobby = m;
        this.settings = m.settings;
        this.screen = "room";
        return;
      case "game":
        this.startGame(m);
        return;
      case "d":
        if (!this.game) return;
        applyDelta(this.game.state, m.d);
        this.game.dayAt = performance.now();
        for (const e of m.d.events ?? []) this.onEvent(e);
        if (m.d.over) this.modal = { kind: "end" };
        this.requestRender();
        return;
      case "clock":
        if (!this.game) return;
        this.game.speed = m.speed;
        this.game.paused = m.paused;
        this.game.dayAt = performance.now();
        if (m.by && this.game.seats.length > 1)
          this.toast(
            `${m.by} ${m.paused ? "paused" : `set speed ${m.speed}`}.`,
            "neutral",
          );
        this.requestRender();
        return;
      case "seats":
        if (this.game) {
          this.game.seats = m.seats;
          this.game.host = m.host;
          this.requestRender();
        }
        return;
      case "chat":
        this.toast(`${m.from}: ${m.text}`, "neutral");
        return;
      case "end":
        this.results = m.results;
        this.modal = { kind: "end" };
        void this.refreshCoins();
        return;
      case "err":
        this.toast(m.msg, "bad");
        if (/ended or closed/.test(m.msg)) {
          clearRejoin();
          this.net.ticket = null;
          if (this.screen !== "game") this.screen = "home";
        }
        return;
    }
  }

  private async startGame(
    m: Extract<ServerMessage, { t: "game" }>,
  ): Promise<void> {
    const state = m.state;
    const me = state.nations.findIndex((n) => n.player === m.you);
    const fresh = !this.game || this.game.code !== m.code;
    this.game = {
      state,
      me,
      you: m.you,
      host: m.host,
      solo: m.solo,
      code: m.code,
      speed: m.speed,
      paused: m.paused,
      seats: m.seats,
      dayAt: performance.now(),
    };
    if (fresh) {
      this.log = [];
      this.results = null;
      this.modal = null;
      this.select(null, null);
      try {
        this.showIntro =
          me >= 0 &&
          state.day < 60 &&
          localStorage.getItem("derpy_conquest_intro_seen") === null;
      } catch {
        this.showIntro = me >= 0;
      }
    }
    this.screen = "game";
    await this.updateComplete;
    const geo = await this.geo;
    const host = this.querySelector<HTMLElement>(".cq-map-host");
    if (!host) return;
    this.view ??= new MapView(map, geo, {
      click: (p, army, e) => this.onMapClick(p, army, e),
      rightClick: (p) => this.onMapRightClick(p),
      hover: () => {},
    });
    if (!host.contains(this.view.canvas)) host.appendChild(this.view.canvas);
    this.view.resize(host.clientWidth, host.clientHeight);
    if (fresh) {
      const capital =
        me >= 0 ? state.nations[me].capital : map.powers[0].provinces[0];
      this.view.focus(capital, 2.4);
    }
  }

  private onEvent(e: Parameters<typeof describeEvent>[2]): void {
    const g = this.game!;
    if (e.k === "battle") this.battleFlashes.set(e.p, performance.now());
    const line = describeEvent(g.state, map, e, g.me);
    if (!line) return;
    if (
      line.mine ||
      line.alert ||
      e.k === "war" ||
      e.k === "fallen" ||
      e.k === "peace"
    ) {
      this.log = [line, ...this.log].slice(0, 80);
    }
    if (line.alert) this.toast(line.text, line.tone);
  }

  private toast(text: string, tone: Toast["tone"]): void {
    const id = ++this.toastId;
    this.toasts = [...this.toasts.slice(-3), { id, text, tone }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 5000);
  }

  private requestRender(): void {
    // Panels re-render at most a few times a second.
    const now = performance.now();
    if (now - this.lastRender > 200) {
      this.lastRender = now;
      this.redraw++;
    } else {
      setTimeout(() => {
        if (performance.now() - this.lastRender >= 200) {
          this.lastRender = performance.now();
          this.redraw++;
        }
      }, 220);
    }
    if (this.view) this.view.needsDraw = true;
  }

  private async send(c: Command): Promise<boolean> {
    const err = await this.net.command(c);
    if (err) this.toast(err, "bad");
    return err === null;
  }

  // ---------------------------------------------------------------- map

  private dayNow(): number {
    const g = this.game!;
    if (g.paused || g.state.over) return g.state.day;
    const elapsed = (performance.now() - g.dayAt) / 1000;
    return (
      g.state.day + Math.min(1.5, elapsed * SPEED_DAYS_PER_SECOND[g.speed])
    );
  }

  private drawMap(t: number): void {
    if (!this.view || !this.game || this.screen !== "game") return;
    const g = this.game;
    this.view.overlay = {
      state: g.state,
      me: g.me,
      dayNow: this.dayNow(),
      selectedProv: this.selectedProv,
      selectedArmy: this.selectedArmy,
      battles: this.battleFlashes,
      preview: this.preview,
      mode: this.mapMode,
      colonizable: this.colonizable(),
    };
    // Moving armies animate at 30 frames a second; dragging and zooming
    // redraw at once.
    const animating = !g.paused || this.battleFlashes.size > 0;
    if (this.view.needsDraw || (animating && t - this.lastDraw > 32)) {
      this.lastDraw = t;
      this.view.draw(t);
    }
  }

  private colonizableCache: {
    day: number;
    key: string;
    set: Set<number>;
  } | null = null;

  /** Open land the player could settle now (refreshed when the day changes). */
  private colonizable(): Set<number> {
    const g = this.game!;
    const me = g.me >= 0 ? g.state.nations[g.me] : null;
    if (!me || me.kind !== "power" || me.colonists < 1 || g.state.over)
      return new Set();
    const key = `${me.colonists}:${Math.floor(me.gold)}`;
    const c = this.colonizableCache;
    if (c && c.day === g.state.day && c.key === key) return c.set;
    const set = new Set<number>();
    for (let p = 0; p < g.state.provinces.length; p++) {
      if (
        g.state.provinces[p].owner === -1 &&
        colonizeCheck(g.state, map, g.me, p).ok
      )
        set.add(p);
    }
    this.colonizableCache = { day: g.state.day, key, set };
    return set;
  }

  private select(
    p: number | null,
    army: number | null,
    nation: number | null = null,
  ): void {
    this.selectedProv = p;
    this.selectedArmy = army;
    this.selectedNation = nation;
    this.preview = null;
    if (p !== null || army !== null || nation !== null) this.panelOpen = true;
    if (this.view) this.view.needsDraw = true;
  }

  private onMapClick(
    p: number | null,
    army: Army | null,
    e: PointerEvent,
  ): void {
    const g = this.game;
    if (!g) return;
    if (army) {
      this.select(army.prov, army.id);
      return;
    }
    // Shift-click with an army selected moves it, like right-click.
    if (e.shiftKey && this.selectedArmy !== null && p !== null) {
      this.onMapRightClick(p);
      return;
    }
    const keepArmy =
      this.selectedArmy !== null &&
      g.state.armies.some(
        (a) => a.id === this.selectedArmy && a.owner === g.me,
      );
    this.selectedProv = p;
    this.selectedNation = null;
    if (!keepArmy) this.selectedArmy = null;
    this.updatePreview();
    this.panelOpen = true;
    if (this.view) this.view.needsDraw = true;
  }

  private updatePreview(): void {
    const g = this.game!;
    const a = g.state.armies.find((x) => x.id === this.selectedArmy);
    this.preview = null;
    if (
      !a ||
      a.owner !== g.me ||
      this.selectedProv === null ||
      this.selectedProv === a.prov
    )
      return;
    const from = a.depart >= 0 && a.path.length ? a.path[0] : a.prov;
    const route = findPath(
      g.state,
      map,
      g.me,
      from,
      this.selectedProv,
      armySpeed(a),
    );
    if (route)
      this.preview =
        a.depart >= 0 && a.path.length
          ? [a.path[0], ...route.path]
          : route.path;
  }

  private onMapRightClick(p: number | null): void {
    const g = this.game;
    if (!g || p === null) return;
    const a = g.state.armies.find((x) => x.id === this.selectedArmy);
    if (!a || a.owner !== g.me) {
      this.select(p, null);
      return;
    }
    void this.send({ k: "move", a: a.id, to: p }).then((ok) => {
      if (ok) this.preview = null;
    });
  }

  // ---------------------------------------------------------------- rendering

  render(): TemplateResult {
    return html`
      ${this.screen === "game" ? this.renderGame() : this.renderLobby()}
      <div
        class="pointer-events-none fixed inset-x-0 top-16 z-[80] flex flex-col items-center gap-2 px-4"
      >
        ${this.toasts.map(
          (t) =>
            html`<div
              class="cq-toast ${t.tone === "bad"
                ? "cq-toast-bad"
                : t.tone === "good"
                  ? "cq-toast-good"
                  : ""}"
            >
              ${t.text}
            </div>`,
        )}
      </div>
    `;
  }

  // ---------------------------------------------------------------- lobby

  private renderLobby(): TemplateResult {
    return html`
      <div class="cq-lobby min-h-full">
        <header
          class="flex items-center justify-between gap-3 px-4 py-3 sm:px-8"
        >
          <a href="/" class="cq-back">← Derp Land</a>
          <div class="text-right text-sm">${this.renderAccountLine()}</div>
        </header>
        <main class="mx-auto max-w-5xl px-4 pb-16 sm:px-8">
          <div class="py-6 text-center sm:py-10">
            <h1 class="cq-title">Derpy Conquest</h1>
            <p class="cq-subtitle">
              Colonize the Americas, 1607 – ${this.settings.endYear}
            </p>
          </div>
          ${this.screen === "connecting"
            ? html`<p class="cq-card text-center">
                Connecting to the game server…
              </p>`
            : this.screen === "room" && this.lobby
              ? this.renderRoom(this.lobby)
              : this.renderHome()}
          <p class="mt-10 text-center text-xs opacity-60">
            Map data from Natural Earth. Part of Derp Land.
            <a
              class="underline"
              href="https://github.com/alden0309/DerpyFront/tree/capital-mod"
              target="_blank"
              rel="noopener"
              >Source</a
            >
          </p>
        </main>
      </div>
    `;
  }

  private renderAccountLine(): TemplateResult {
    if (this.account) {
      return html`<span class="cq-pill"
        >Signed in as <b>${this.account}</b>${this.coins !== null
          ? html` ·
              <span title="Derp Coins">🪙 ${formatCoins(this.coins)}</span>`
          : nothing}</span
      >`;
    }
    return html`<a class="cq-pill" href="/#account"
      >Sign in on Derp Land to earn Derp Coins</a
    >`;
  }

  private setName(v: string): void {
    this.name = v.slice(0, 24);
    try {
      localStorage.setItem(NAME_KEY, this.name);
    } catch {
      // ignore
    }
    this.net.name = this.name || "Explorer";
  }

  private renderNameField(): TemplateResult | typeof nothing {
    if (this.account) return nothing;
    return html`<label class="mb-4 block">
      <span class="cq-label">Your name</span>
      <input
        class="cq-input"
        maxlength="24"
        placeholder="Explorer"
        .value=${this.name}
        @input=${(e: Event) =>
          this.setName((e.target as HTMLInputElement).value)}
        @change=${() => this.net.hello()}
      />
    </label>`;
  }

  private renderPowerCards(
    selected: string | null,
    takenBy: Map<string, string>,
    pick: (id: string) => void,
  ): TemplateResult {
    return html`<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      ${map.powers.map((p) => {
        const rules = POWER_RULES[p.id];
        const taken = takenBy.get(p.id);
        const starts = p.provinces.map((i) => map.provinces[i].name).join(", ");
        return html`<button
          class="cq-power ${selected === p.id ? "cq-power-on" : ""}"
          style="--power:${p.color}"
          ?disabled=${!!taken && selected !== p.id}
          @click=${() => pick(p.id)}
        >
          <span class="cq-power-name"
            ><span class="cq-swatch" style="background:${p.color}"></span
            >${p.name.replace(/^the /, "The ")}</span
          >
          <span class="cq-power-starts">${starts}</span>
          <span class="cq-power-blurb">${rules?.blurb ?? ""}</span>
          ${taken
            ? html`<span class="cq-power-taken">${taken}</span>`
            : nothing}
        </button>`;
      })}
    </div>`;
  }

  private renderSettings(
    editable: boolean,
    onChange: (s: RoomSettings) => void,
  ): TemplateResult {
    const s = this.settings;
    return html`<div class="flex flex-wrap gap-4">
      <label>
        <span class="cq-label">Computer players</span>
        <select
          class="cq-input"
          ?disabled=${!editable}
          @change=${(e: Event) =>
            onChange({
              ...s,
              difficulty: (e.target as HTMLSelectElement)
                .value as RoomSettings["difficulty"],
            })}
        >
          ${DIFFICULTIES.map(
            (d) =>
              html`<option value=${d} ?selected=${s.difficulty === d}>
                ${d[0].toUpperCase() + d.slice(1)}
              </option>`,
          )}
        </select>
      </label>
      <label>
        <span class="cq-label">Game ends</span>
        <select
          class="cq-input"
          ?disabled=${!editable}
          @change=${(e: Event) =>
            onChange({
              ...s,
              endYear: Number((e.target as HTMLSelectElement).value),
            })}
        >
          ${END_YEARS.map(
            (y) =>
              html`<option value=${y} ?selected=${s.endYear === y}>
                ${y}
                (${y === 1630
                  ? "about 40 min"
                  : y === 1650
                    ? "about 1 hour"
                    : y === 1675
                      ? "about 1½ hours"
                      : "about 2 hours"})
              </option>`,
          )}
        </select>
      </label>
    </div>`;
  }

  private renderHome(): TemplateResult {
    const ticket = this.net.ticket;
    return html`
      ${ticket
        ? html`<div
            class="cq-card mb-4 flex flex-wrap items-center justify-between gap-3"
          >
            <span>You were in a game (code <b>${ticket.code}</b>).</span>
            <span class="flex gap-2">
              <button
                class="cq-btn"
                @click=${() => this.net.send({ t: "rejoin", ...ticket })}
              >
                Rejoin
              </button>
              <button
                class="cq-btn-ghost"
                @click=${() => {
                  clearRejoin();
                  this.net.ticket = null;
                  this.requestUpdate();
                }}
              >
                Forget it
              </button>
            </span>
          </div>`
        : nothing}
      <div class="grid gap-4 md:grid-cols-[3fr_2fr]">
        <section class="cq-card">
          <h2 class="cq-h2">Play solo</h2>
          <p class="mb-4 text-sm opacity-80">
            You against five computer powers and dozens of native nations.
          </p>
          ${this.renderNameField()}
          <span class="cq-label">Your nation</span>
          ${this.renderPowerCards(
            this.soloPower,
            new Map(),
            (id) => (this.soloPower = id),
          )}
          <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
            ${this.renderSettings(true, (s) => (this.settings = s))}
            <button
              class="cq-btn cq-btn-big"
              ?disabled=${!this.online}
              @click=${() =>
                this.net.send({
                  t: "create",
                  solo: true,
                  power: this.soloPower,
                  settings: this.settings,
                })}
            >
              Start
            </button>
          </div>
        </section>
        <section class="cq-card flex flex-col gap-4">
          <div>
            <h2 class="cq-h2">Play with friends</h2>
            <p class="mb-3 text-sm opacity-80">
              Up to six players, each a colonial power. The computer runs the
              rest.
            </p>
            ${this.renderNameField()}
            <button
              class="cq-btn w-full"
              ?disabled=${!this.online}
              @click=${() =>
                this.net.send({
                  t: "create",
                  solo: false,
                  settings: this.settings,
                })}
            >
              Create a lobby
            </button>
          </div>
          <div class="border-t border-[#b89b6a]/50 pt-4">
            <span class="cq-label">Join with a code</span>
            <form
              class="flex gap-2"
              @submit=${(e: Event) => {
                e.preventDefault();
                if (this.joinCode.trim())
                  this.net.send({ t: "join", code: this.joinCode.trim() });
              }}
            >
              <input
                class="cq-input uppercase tracking-widest"
                maxlength="4"
                placeholder="ABCD"
                .value=${this.joinCode}
                @input=${(e: Event) =>
                  (this.joinCode = (
                    e.target as HTMLInputElement
                  ).value.toUpperCase())}
              />
              <button
                class="cq-btn"
                ?disabled=${!this.online || !this.joinCode.trim()}
              >
                Join
              </button>
            </form>
          </div>
          <div class="border-t border-[#b89b6a]/50 pt-4 text-sm opacity-80">
            <b>How it plays:</b> real time with pause. Settle open land, ship
            goods home for gold, trade with or fight the native nations, and
            battle rival powers. Battles resolve themselves and send you a
            report.
            <button
              class="underline"
              @click=${() => (this.modal = { kind: "help" })}
            >
              More…
            </button>
          </div>
        </section>
      </div>
      ${this.modal?.kind === "help"
        ? this.renderModal("How to play", this.renderHelp())
        : nothing}
    `;
  }

  private renderRoom(
    l: Extract<ServerMessage, { t: "lobby" }>,
  ): TemplateResult {
    const isHost = l.host === l.you;
    const me = l.seats.find((s) => s.id === l.you);
    const takenBy = new Map<string, string>();
    for (const s of l.seats)
      if (s.power && s.id !== l.you) takenBy.set(s.power, s.name);
    const link = `${location.origin}/conquest?join=${l.code}`;
    return html`
      <div class="grid gap-4 md:grid-cols-[2fr_3fr]">
        <section class="cq-card">
          <h2 class="cq-h2">Lobby <span class="cq-code">${l.code}</span></h2>
          <p class="mb-3 text-sm">Friends join with the code, or this link:</p>
          <div class="mb-4 flex gap-2">
            <input
              class="cq-input text-xs"
              readonly
              .value=${link}
              @focus=${(e: Event) => (e.target as HTMLInputElement).select()}
            />
            <button
              class="cq-btn"
              @click=${() => {
                void navigator.clipboard?.writeText(link);
                this.toast("Invite link copied.", "good");
              }}
            >
              Copy
            </button>
          </div>
          <span class="cq-label">Players</span>
          <ul class="mb-4 space-y-1">
            ${l.seats.map((s) => {
              const p = map.powers.find((x) => x.id === s.power);
              return html`<li class="flex items-center gap-2">
                <span class="cq-dot ${s.online ? "cq-dot-on" : ""}"></span>
                <b>${s.name}</b>${s.id === l.host
                  ? html`<span class="cq-tag">host</span>`
                  : nothing}${s.account
                  ? html`<span
                      class="cq-tag"
                      title="Signed in: earns Derp Coins"
                      >🪙</span
                    >`
                  : nothing}
                <span class="ml-auto text-sm"
                  >${p
                    ? html`<span
                          class="cq-swatch"
                          style="background:${p.color}"
                        ></span
                        >${p.name.replace(/^the /, "The ")}`
                    : html`<i class="opacity-60">picking…</i>`}</span
                >
              </li>`;
            })}
          </ul>
          ${this.renderSettings(isHost, (s) => {
            this.settings = s;
            this.net.send({ t: "settings", settings: s });
          })}
          <div class="mt-5 flex flex-wrap gap-2">
            ${isHost
              ? html`<button
                  class="cq-btn cq-btn-big"
                  ?disabled=${!l.seats.some((s) => s.power)}
                  @click=${() => this.net.send({ t: "start" })}
                >
                  Start the game
                </button>`
              : html`<span class="self-center text-sm opacity-80"
                  >Waiting for the host to start…</span
                >`}
            <button
              class="cq-btn-ghost"
              @click=${() => {
                this.net.send({ t: "leave" });
                clearRejoin();
                this.net.ticket = null;
                this.lobby = null;
                this.screen = "home";
              }}
            >
              Leave
            </button>
          </div>
          ${!l.seats.some((s) => s.power)
            ? html`<p class="mt-2 text-xs opacity-70">
                Pick nations first. Anyone who doesn't pick will watch.
              </p>`
            : nothing}
        </section>
        <section class="cq-card">
          <h2 class="cq-h2">Pick your nation</h2>
          ${this.renderPowerCards(me?.power ?? null, takenBy, (id) =>
            this.net.send({ t: "pick", power: me?.power === id ? null : id }),
          )}
        </section>
      </div>
    `;
  }

  // ---------------------------------------------------------------- game

  private renderGame(): TemplateResult {
    const g = this.game!;
    void this.redraw;
    const s = g.state;
    const me = g.me >= 0 ? s.nations[g.me] : null;
    const offers = s.offers.filter((o) => o.to === g.me);
    return html`
      <div class="cq-game">
        ${this.renderTopBar(g, me)}
        <div class="cq-map-host"></div>
        <div class="cq-map-tools">
          <button
            class="cq-tool"
            title="Zoom in (+)"
            @click=${() => this.view?.zoomBy(1.4)}
          >
            +
          </button>
          <button
            class="cq-tool"
            title="Zoom out (−)"
            @click=${() => this.view?.zoomBy(1 / 1.4)}
          >
            −
          </button>
          ${me
            ? html`<button
                class="cq-tool"
                title="Go to your capital"
                @click=${() => this.view?.focus(me.capital, 2.4)}
              >
                ⌂
              </button>`
            : nothing}
          <button
            class="cq-tool"
            title="Switch map: owners / terrain"
            @click=${() => {
              this.mapMode =
                this.mapMode === "political" ? "terrain" : "political";
              if (this.view) this.view.needsDraw = true;
            }}
          >
            ${this.mapMode === "political" ? "⛰" : "🏳"}
          </button>
        </div>
        ${offers.length
          ? html`<div class="cq-offers">
              ${offers.map(
                (o) =>
                  html`<div class="cq-offer">
                    <span
                      ><b>${nationName(s.nations[o.from].name)}</b> offers
                      peace.</span
                    >
                    <button
                      class="cq-btn"
                      @click=${() =>
                        this.send({ k: "answer", n: o.from, yes: true })}
                    >
                      Accept
                    </button>
                    <button
                      class="cq-btn-ghost"
                      @click=${() =>
                        this.send({ k: "answer", n: o.from, yes: false })}
                    >
                      Refuse
                    </button>
                  </div>`,
              )}
            </div>`
          : nothing}
        ${this.renderLog()} ${this.showIntro ? this.renderIntro() : nothing}
        ${this.chatOpen
          ? html`<form
              class="cq-chat"
              @submit=${(e: Event) => {
                e.preventDefault();
                const text = this.chatText.trim();
                if (text) this.net.send({ t: "chat", text });
                this.chatText = "";
                this.chatOpen = false;
              }}
            >
              <input
                maxlength="200"
                placeholder="Say something to everyone… (Enter to send, Esc to close)"
                .value=${this.chatText}
                @input=${(e: Event) =>
                  (this.chatText = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Escape") this.chatOpen = false;
                }}
              />
            </form>`
          : nothing}
        ${this.panelOpen &&
        (this.selectedProv !== null ||
          this.selectedArmy !== null ||
          this.selectedNation !== null)
          ? html`<aside class="cq-panel">
              <button
                class="cq-close"
                title="Close"
                @click=${() => this.select(null, null)}
              >
                ×
              </button>
              ${this.renderPanel()}
            </aside>`
          : nothing}
        ${g.paused && !s.over
          ? html`<div
              class="cq-paused"
              @click=${() => this.net.send({ t: "pause", p: false })}
            >
              Paused — click or press space to resume
            </div>`
          : nothing}
        ${this.renderGameModal()}
      </div>
    `;
  }

  private renderTopBar(
    g: NonNullable<ConquestApp["game"]>,
    me: Nation | null,
  ): TemplateResult {
    const s = g.state;
    return html`<header class="cq-top">
      <a href="/" class="cq-back hidden sm:inline" title="Back to Derp Land"
        >←</a
      >
      ${me
        ? html`<button
              class="cq-nation"
              @click=${() => this.select(null, null, g.me)}
            >
              <span class="cq-swatch" style="background:${me.color}"></span>
              <span class="hidden md:inline">${nationName(me.name)}</span>
            </button>
            <span
              class="cq-stat"
              title=${`Gold. Last month: goods ${me.ledger.goods}, taxes ${me.ledger.tax}, native trade ${me.ledger.trade}, the crown ${me.ledger.crown}, upkeep -${me.ledger.upkeep}`}
            >
              💰 <b>${gold(me.gold)}</b
              ><small class=${me.ledger.total >= 0 ? "cq-up" : "cq-down"}
                >${signed(me.ledger.total)}/mo</small
              >
            </span>
            <span
              class="cq-stat"
              title=${`Colonists ready to found colonies (up to ${MAX_COLONISTS}). Next ship in ${Math.max(0, me.nextColonist - s.day)} days.`}
            >
              🧭 <b>${me.colonists}</b><small>/${MAX_COLONISTS}</small>
            </span>
            <span
              class="cq-stat hidden sm:inline-flex"
              title="Manpower: men ready to fill new regiments (1,000 each)"
              >⚔ <b>${num(me.manpower)}</b></span
            >
            <span class="cq-stat hidden sm:inline-flex" title="Score"
              >🏆 <b>${me.score}</b></span
            >`
        : html`<span class="cq-stat">👁 Watching</span>`}
      <span class="flex-1"></span>
      <span class="cq-date hidden sm:inline">${formatDate(s.day)}</span>
      <span class="cq-date sm:hidden">${formatMonth(s.day)}</span>
      <span class="cq-speed">
        <button
          class="cq-speed-btn"
          title="Pause (space)"
          @click=${() => this.net.send({ t: "pause", p: !g.paused })}
        >
          ${g.paused ? "▶" : "⏸"}
        </button>
        ${[1, 2, 3, 4, 5].map(
          (n) =>
            html`<button
              class="cq-speed-dot ${n <= g.speed ? "on" : ""}"
              title="Speed ${n}"
              @click=${() => this.net.send({ t: "speed", s: n })}
            ></button>`,
        )}
      </span>
      ${!g.solo
        ? html`<button
            class="cq-topbtn"
            title="Chat (Enter)"
            @click=${() => {
              this.chatOpen = !this.chatOpen;
              void this.updateComplete.then(() =>
                this.querySelector<HTMLInputElement>(".cq-chat input")?.focus(),
              );
            }}
          >
            💬
          </button>`
        : nothing}
      <button
        class="cq-topbtn hidden sm:inline"
        @click=${() => (this.modal = { kind: "nations" })}
      >
        Nations
      </button>
      <button
        class="cq-topbtn hidden sm:inline"
        @click=${() => (this.modal = { kind: "market" })}
      >
        Market
      </button>
      <button
        class="cq-topbtn"
        title="Menu"
        @click=${() => (this.modal = { kind: "menu" })}
      >
        ☰
      </button>
    </header>`;
  }

  private renderIntro(): TemplateResult {
    const g = this.game!;
    const me = g.state.nations[g.me];
    const close = () => {
      this.showIntro = false;
      try {
        localStorage.setItem("derpy_conquest_intro_seen", "1");
      } catch {
        // ignore
      }
    };
    return html`<div class="cq-intro">
      <button class="cq-close" @click=${close}>×</button>
      <h2 class="cq-panel-title">Welcome to the New World</h2>
      <p class="cq-sub">
        You lead ${me.name}. It's 1607 and the race for the Americas is on.
      </p>
      <ol>
        <li>
          <b>Settle.</b> Green <b>+</b> marks show open land you can settle.
          Click one and <b>Found a colony</b>.
        </li>
        <li>
          <b>Grow rich.</b> Build ports so goods sell at full price, and farms
          so settlers multiply.
        </li>
        <li>
          <b>Mind the natives.</b> Trade with them and give gifts, or they'll
          raid your colonies. Click a nation's land to deal with them.
        </li>
        <li>
          <b>Fight.</b> Raise regiments, click your army, then right-click (or
          tap <b>Move army here</b>) to march.
        </li>
      </ol>
      <p class="cq-hint">
        Space pauses, 1–5 sets the speed. The highest score on 1 January
        ${g.state.settings.endYear} wins.
      </p>
      <button class="cq-btn" @click=${close}>Let's go</button>
    </div>`;
  }

  private renderLog(): TemplateResult {
    const lines = this.log.slice(0, 6);
    if (!lines.length) return html``;
    return html`<div class="cq-log">
      ${lines.map(
        (l) =>
          html`<button
            class="cq-log-line ${l.tone === "bad"
              ? "cq-log-bad"
              : l.tone === "good"
                ? "cq-log-good"
                : ""}"
            @click=${() => {
              if (l.battle !== undefined)
                this.modal = { kind: "battle", id: l.battle };
              if (l.prov !== undefined) {
                this.select(l.prov, null);
                this.view?.focus(l.prov);
              }
            }}
          >
            ${l.text}
          </button>`,
      )}
    </div>`;
  }

  private nationChip(n: number): TemplateResult {
    const nation = this.game!.state.nations[n];
    return html`<button
      class="cq-chip"
      @click=${() => this.select(null, null, n)}
    >
      <span class="cq-swatch" style="background:${nation.color}"></span
      >${nationName(nation.name)}${nation.playerName
        ? html` <small>(${nation.playerName})</small>`
        : nothing}
    </button>`;
  }

  private renderPanel(): TemplateResult {
    const g = this.game!;
    const army = g.state.armies.find((a) => a.id === this.selectedArmy);
    if (this.selectedNation !== null)
      return this.renderNationPanel(this.selectedNation);
    return html`${army ? this.renderArmyPanel(army) : nothing}
    ${this.selectedProv !== null
      ? this.renderProvincePanel(this.selectedProv, army)
      : nothing}`;
  }

  private actionButton(
    label: TemplateResult | string,
    check: { ok: true } | { ok: false; why: string },
    run: () => void,
    extra = "",
  ): TemplateResult {
    return html`<button
      class="cq-act ${extra}"
      ?disabled=${!check.ok}
      title=${check.ok ? "" : check.why}
      @click=${run}
    >
      ${label}${!check.ok
        ? html`<small class="cq-why">${check.why}</small>`
        : nothing}
    </button>`;
  }

  private renderProvincePanel(
    p: number,
    army: Army | undefined,
  ): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const def = map.provinces[p];
    const prov = s.provinces[p];
    const owner = prov.owner >= 0 ? s.nations[prov.owner] : null;
    const mine = prov.owner === g.me && g.me >= 0;
    const day = s.day;
    const cap = Math.round(
      provinceCapacity(def.terrain, def.areaKm2) *
        (1 + CAPACITY_PER_FARM * prov.farm),
    );
    const armiesHere = armiesIn(s, p);
    const myArmy = army && army.owner === g.me ? army : null;
    const meNation = g.me >= 0 ? s.nations[g.me] : null;
    let income: ReturnType<typeof provinceIncome> | null = null;
    if (owner?.kind === "power")
      income = provinceIncome(
        s,
        map,
        owner,
        p,
        portConnected(s, map, owner.id),
      );
    return html`
      <h2 class="cq-panel-title">${def.name}</h2>
      <div class="cq-sub">
        ${TERRAIN_NAMES[def.terrain]} · ${GOOD_ICONS[def.good]}
        ${GOOD_NAMES[def.good]} (${s.prices[def.good].toFixed(1)} gold) ·
        ${def.coastal ? "coast" : "inland"} · ${num(def.areaKm2)} km²
      </div>
      <div class="cq-row">
        ${owner
          ? html`Held by ${this.nationChip(prov.owner)}`
          : html`<i>Open wilderness</i>`}
      </div>
      ${owner?.kind === "power"
        ? html`<div class="cq-grid2">
            <span>Settlers</span
            ><b>${num(prov.pop)} <small>of ${num(cap)}</small></b>
            <span>Natives</span><b>${num(prov.natives)}</b>
            ${income
              ? html`<span>Makes</span
                  ><b
                    >${income.units.toFixed(1)}
                    ${GOOD_NAMES[def.good].toLowerCase()} →
                    ${(income.goods + income.tax).toFixed(1)} gold/mo</b
                  >`
              : nothing}
            <span>Buildings</span>
            <b>
              ${prov.farm ? `Farm ${prov.farm}` : ""} ${prov.port ? "Port" : ""}
              ${prov.fort ? `Fort ${prov.fort}` : ""}
              ${!prov.farm && !prov.port && !prov.fort ? "none" : ""}
            </b>
          </div>`
        : html`<div class="cq-grid2">
            <span>Natives</span><b>${num(prov.natives)}</b>
          </div>`}
      ${prov.colony
        ? html`<div class="cq-note">
            ⛺ ${s.nations[prov.colony.by].name} is founding a colony:
            ${Math.max(0, prov.colony.done - day)} days left.
          </div>`
        : nothing}
      ${prov.build
        ? html`<div class="cq-note">
            🔨 Building ${BUILDING_NAMES[prov.build.kind].toLowerCase()}:
            ${Math.max(0, prov.build.done - day)} days left.
          </div>`
        : nothing}
      ${prov.recruits.map(
        (r) =>
          html`<div class="cq-note">
            🎖 Raising ${REG_NAMES[r.type].toLowerCase()}:
            ${Math.max(0, r.done - day)} days left.
          </div>`,
      )}
      ${prov.siege
        ? html`<div class="cq-note cq-note-bad">
            🏰 Besieged by ${s.nations[prov.siege.by].name}: falls in
            ${Math.max(0, prov.siege.done - day)} days unless relieved.
          </div>`
        : nothing}
      ${myArmy && myArmy.prov !== p
        ? html`<div class="cq-actions">
            <button
              class="cq-act cq-act-main"
              @click=${() => this.onMapRightClick(p)}
            >
              Move army
              here${this.preview
                ? html`<small>${this.previewDays(myArmy)} days</small>`
                : nothing}
            </button>
          </div>`
        : nothing}
      ${meNation?.kind === "power" && prov.owner === -1
        ? this.renderColonize(p)
        : nothing}
      ${mine ? this.renderOwnActions(p) : nothing}
      ${meNation?.kind === "power" && owner?.kind === "native"
        ? html`<div class="cq-actions">
            ${(() => {
              const c = buyCheck(s, map, g.me, p);
              return this.actionButton(
                html`Buy this
                land${c.ok ? html`<small>${c.gold} gold</small>` : nothing}`,
                c,
                () => this.send({ k: "buy", p }),
              );
            })()}
          </div>`
        : nothing}
      ${armiesHere.length
        ? html`<h3 class="cq-h3">Armies here</h3>
            <ul class="space-y-1">
              ${armiesHere.map(
                (a) =>
                  html`<li>
                    <button
                      class="cq-army-row"
                      @click=${() => this.select(p, a.id)}
                    >
                      <span
                        class="cq-swatch"
                        style="background:${s.nations[a.owner].color}"
                      ></span>
                      ${s.nations[a.owner].name}: ${a.regs.length} regiments,
                      ${num(armyMen(a))} men
                    </button>
                  </li>`,
              )}
            </ul>`
        : nothing}
    `;
  }

  private previewDays(a: Army): number {
    const g = this.game!;
    if (!this.preview || this.selectedProv === null) return 0;
    const from = a.depart >= 0 && a.path.length ? a.path[0] : a.prov;
    return (
      findPath(g.state, map, g.me, from, this.selectedProv, armySpeed(a))
        ?.days ?? 0
    );
  }

  private renderColonize(p: number): TemplateResult {
    const g = this.game!;
    const c = colonizeCheck(g.state, map, g.me, p);
    return html`<div class="cq-actions">
      ${this.actionButton(
        html`⛺ Found a
        colony${c.ok
          ? html`<small>${c.gold} gold · 1 colonist · ${c.days} days</small>`
          : nothing}`,
        c,
        () => this.send({ k: "colonize", p }),
        "cq-act-main",
      )}
    </div>`;
  }

  private renderOwnActions(p: number): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const kinds: BuildingKind[] =
      s.nations[g.me].kind === "power" ? ["port", "farm", "fort"] : [];
    const types = regimentTypes(s.nations[g.me]);
    return html`
      ${kinds.length
        ? html`<h3 class="cq-h3">Build</h3>
            <div class="cq-actions">
              ${kinds.map((k) => {
                const c = buildCheck(s, map, g.me, p, k);
                const level = s.provinces[p][k];
                if (level >= BUILDINGS[k].max) return nothing;
                return html`<span title=${BUILDING_HELP[k]}
                  >${this.actionButton(
                    html`${BUILDING_NAMES[k]}${BUILDINGS[k].max > 1
                      ? ` ${level + 1}`
                      : ""}${c.ok
                      ? html`<small>${c.gold} gold · ${c.days} days</small>`
                      : nothing}`,
                    c,
                    () => this.send({ k: "build", p, b: k }),
                  )}</span
                >`;
              })}
            </div>`
        : nothing}
      <h3 class="cq-h3">Raise troops</h3>
      <div class="cq-actions">
        ${types.map((t: RegType) => {
          const c = recruitCheck(s, map, g.me, p, t);
          const r = REGIMENTS[t];
          return this.actionButton(
            html`${REG_NAMES[t]}${c.ok
              ? html`<small
                  >${r.gold} gold · ${REGIMENT_MEN} men · ${r.days} days</small
                >`
              : nothing}`,
            c,
            () => this.send({ k: "recruit", p, t }),
          );
        })}
      </div>
    `;
  }

  private renderArmyPanel(a: Army): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const mine = a.owner === g.me;
    const counts = countRegs(a);
    const others = s.armies.filter(
      (b) =>
        b.owner === a.owner &&
        b.prov === a.prov &&
        b.id !== a.id &&
        b.depart < 0 &&
        !b.retreating,
    );
    const dest = a.path.length
      ? map.provinces[a.path[a.path.length - 1]].name
      : null;
    return html`
      <h2 class="cq-panel-title">
        <span
          class="cq-swatch"
          style="background:${s.nations[a.owner].color}"
        ></span>
        ${s.nations[a.owner].adjective} army
      </h2>
      <div class="cq-sub">
        ${Object.entries(counts)
          .map(([t, n]) => `${n} ${REG_NAMES[t as RegType].toLowerCase()}`)
          .join(" · ")}
      </div>
      <div class="cq-grid2">
        <span>Men</span><b>${num(armyMen(a))}</b> <span>Morale</span
        ><b>${Math.round(armyMorale(a) * 100)}%</b> <span>Strength</span
        ><b>${armyStrength(a).toFixed(1)}</b> <span>Where</span
        ><b>${map.provinces[a.prov].name}</b>
        ${dest
          ? html`<span>Heading to</span
              ><b
                >${dest}
                <small
                  >(${Math.max(0, a.arrive - s.day)} days to next stop)</small
                ></b
              >`
          : nothing}
      </div>
      ${a.retreating
        ? html`<div class="cq-note cq-note-bad">
            🏳 Retreating after a defeat.
          </div>`
        : nothing}
      ${mine
        ? html`<p class="cq-hint">
              Right-click a province (or tap one, then <b>Move army here</b>) to
              march.
            </p>
            <div class="cq-actions">
              ${a.path.length
                ? html`<button
                    class="cq-act"
                    @click=${() => this.send({ k: "stop", a: a.id })}
                  >
                    Halt
                  </button>`
                : nothing}
              ${a.regs.length > 1 && a.depart < 0
                ? html`<button
                    class="cq-act"
                    @click=${() => this.send({ k: "split", a: a.id })}
                  >
                    Split in two
                  </button>`
                : nothing}
              ${others.map(
                (b) =>
                  html`<button
                    class="cq-act"
                    @click=${() => this.send({ k: "merge", a: a.id, b: b.id })}
                  >
                    Merge with ${b.regs.length}-regiment army
                  </button>`,
              )}
              <button
                class="cq-act cq-act-danger"
                @click=${() => {
                  if (
                    confirm(
                      "Disband this army? Half its men return to your manpower.",
                    )
                  )
                    void this.send({ k: "disband", a: a.id });
                }}
              >
                Disband
              </button>
            </div>`
        : nothing}
      <h3 class="cq-h3">Regiments</h3>
      <ul class="cq-regs">
        ${a.regs.map(
          (r) =>
            html`<li>
              <span>${REG_NAMES[r.type]}</span>
              <span class="cq-bar"
                ><span style="width:${(r.men / REGIMENT_MEN) * 100}%"></span
              ></span>
              <span class="cq-bar cq-bar-morale"
                ><span style="width:${r.morale * 100}%"></span
              ></span>
            </li>`,
        )}
      </ul>
      <p class="cq-hint">Bars: men (brown) and morale (gold).</p>
    `;
  }

  private renderNationPanel(n: number): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const nation = s.nations[n];
    const owned = provincesOf(s, n);
    const me = g.me >= 0 ? s.nations[g.me] : null;
    const isMe = n === g.me;
    const war = me ? atWar(s, g.me, n) : false;
    const truce = me ? truceUntil(s, g.me, n) : -1;
    const deal = me ? dealBetween(s, g.me, n) : undefined;
    const myStrength = s.armies
      .filter((a) => a.owner === n)
      .reduce((x, a) => x + armyStrength(a), 0);
    const offerFromThem = s.offers.find((o) => o.from === n && o.to === g.me);
    return html`
      <h2 class="cq-panel-title">
        <span class="cq-swatch" style="background:${nation.color}"></span
        >${nationName(nation.name)}
      </h2>
      <div class="cq-sub">
        ${nation.kind === "power"
          ? "Colonial power"
          : "Native nation"}${nation.playerName
          ? html` · played by <b>${nation.playerName}</b>`
          : nation.kind === "power"
            ? " · computer"
            : ""}
        ${!nation.alive ? html` · <b>fallen</b>` : nothing}
      </div>
      <div class="cq-grid2">
        <span>Provinces</span><b>${owned.length}</b> <span>Army strength</span
        ><b>${myStrength.toFixed(1)}</b>
        ${nation.kind === "power"
          ? html`<span>Score</span><b>${nation.score}</b>`
          : nothing}
        ${nation.kind === "power"
          ? html`<span>Battles won</span><b>${nation.stats.battlesWon}</b>`
          : nothing}
        ${nation.kind === "native" && me?.kind === "power"
          ? html`<span>Opinion of you</span
              ><b class=${nation.opinion[g.me] >= 0 ? "cq-up" : "cq-down"}
                >${Math.round(nation.opinion[g.me])}</b
              >`
          : nothing}
        ${me && !isMe
          ? html`<span>Relations</span>
              <b
                >${war
                  ? "⚔ At war"
                  : truce >= 0
                    ? `Truce until ${formatDate(truce)}`
                    : "At peace"}${deal ? " · trading" : ""}</b
              >`
          : nothing}
      </div>
      ${isMe && nation.kind === "power"
        ? html`<h3 class="cq-h3">Last month</h3>
            <div class="cq-grid2">
              <span>Goods</span><b>${signed(nation.ledger.goods)}</b>
              <span>Taxes</span><b>${signed(nation.ledger.tax)}</b>
              <span>Native trade</span><b>${signed(nation.ledger.trade)}</b>
              <span>The crown</span><b>${signed(nation.ledger.crown)}</b>
              <span>Upkeep</span><b>${signed(-nation.ledger.upkeep)}</b>
              <span>Total</span><b>${signed(nation.ledger.total)}</b>
            </div>
            <p class="cq-hint">${POWER_RULES[nation.key]?.blurb ?? ""}</p>`
        : nothing}
      ${offerFromThem
        ? html`<div class="cq-actions">
            <button
              class="cq-act cq-act-main"
              @click=${() => this.send({ k: "answer", n, yes: true })}
            >
              Accept their peace offer
            </button>
            <button
              class="cq-act"
              @click=${() => this.send({ k: "answer", n, yes: false })}
            >
              Refuse
            </button>
          </div>`
        : nothing}
      ${me && !isMe && nation.alive && me.alive
        ? this.renderDiplomacy(n)
        : nothing}
    `;
  }

  private renderDiplomacy(n: number): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const nation = s.nations[n];
    const me = s.nations[g.me];
    const war = atWar(s, g.me, n);
    const deal = dealBetween(s, g.me, n);
    const buttons: TemplateResult[] = [];
    if (war) {
      buttons.push(
        this.actionButton("🕊 Offer peace", peaceCheck(s, g.me, n), () =>
          this.send({ k: "peace", n }),
        ),
      );
    } else {
      buttons.push(
        this.actionButton(
          "⚔ Declare war",
          warCheck(s, g.me, n),
          () => {
            if (confirm(`Declare war on ${nation.name}?`))
              void this.send({ k: "war", n });
          },
          "cq-act-danger",
        ),
      );
    }
    if (me.kind === "power" && nation.kind === "native" && !war) {
      if (deal) {
        buttons.push(
          html`<button
            class="cq-act"
            @click=${() => this.send({ k: "untrade", n })}
          >
            End trade deal
          </button>`,
        );
      } else {
        const c = tradeCheck(s, map, g.me, n);
        buttons.push(
          this.actionButton(
            html`🤝 Trade deal<small
                >about ${nativeTradeGold(s, map, n).toFixed(1)} gold/mo</small
              >`,
            c,
            () => this.send({ k: "trade", n }),
          ),
        );
      }
      for (const amount of GIFT_SIZES) {
        buttons.push(
          this.actionButton(
            `🎁 Gift ${amount}`,
            giftCheck(s, g.me, n, amount),
            () => this.send({ k: "gift", n, gold: amount }),
          ),
        );
      }
    }
    const borders = me.kind === "power" ? nationsBorder(s, map, g.me, n) : true;
    return html`<h3 class="cq-h3">Diplomacy</h3>
      ${!borders && nation.kind === "native"
        ? html`<p class="cq-hint">You don't border them yet.</p>`
        : nothing}
      <div class="cq-actions">${buttons}</div>
      ${nation.kind === "native"
        ? html`<p class="cq-hint">
            To buy their land, click one of their provinces next to yours.
          </p>`
        : nothing}`;
  }

  // ---------------------------------------------------------------- modals

  private renderModal(
    title: string,
    body: TemplateResult,
    wide = false,
  ): TemplateResult {
    return html`<div
      class="cq-modal-back"
      @click=${(e: Event) =>
        e.target === e.currentTarget && (this.modal = null)}
    >
      <div class="cq-modal ${wide ? "cq-modal-wide" : ""}">
        <button class="cq-close" @click=${() => (this.modal = null)}>×</button>
        <h2 class="cq-panel-title">${title}</h2>
        ${body}
      </div>
    </div>`;
  }

  private renderGameModal(): TemplateResult | typeof nothing {
    const m = this.modal;
    const g = this.game!;
    if (!m) return nothing;
    switch (m.kind) {
      case "battle": {
        const r = g.state.battles.find((b) => b.id === m.id);
        return r
          ? this.renderModal(
              `Battle of ${map.provinces[r.prov].name}`,
              this.renderBattle(r),
              true,
            )
          : nothing;
      }
      case "nations":
        return this.renderModal("Nations", this.renderNations(), true);
      case "market":
        return this.renderModal("The market", this.renderMarket(), true);
      case "help":
        return this.renderModal("How to play", this.renderHelp());
      case "menu":
        return this.renderModal("Menu", this.renderMenu());
      case "end":
        return this.renderModal("The game is over", this.renderEnd(), true);
    }
  }

  private renderBattle(r: BattleReport): TemplateResult {
    const s = this.game!.state;
    const side = (label: string, x: BattleReport["attacker"], won: boolean) =>
      html`<div class="cq-side ${won ? "cq-side-won" : ""}">
        <div class="cq-label">${label}${won ? " · won" : ""}</div>
        ${x.nations.map(
          (n) =>
            html`<div>
              <span
                class="cq-swatch"
                style="background:${s.nations[n].color}"
              ></span
              >${nationName(s.nations[n].name)}
            </div>`,
        )}
        <div class="text-sm">
          ${Object.entries(x.regs)
            .map(([t, n]) => `${n} ${REG_NAMES[t as RegType].toLowerCase()}`)
            .join(", ")}
        </div>
        <div class="cq-grid2 mt-2">
          <span>Men</span><b>${num(x.men)}</b> <span>Lost</span
          ><b class="cq-down">${num(x.lost)}</b> <span>Morale at the end</span
          ><b>${Math.round(x.moraleEnd * 100)}%</b>
        </div>
      </div>`;
    return html`<p class="cq-sub">
        ${formatDate(r.day)} · ${TERRAIN_NAMES[map.provinces[r.prov].terrain]}
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        ${side("Attackers", r.attacker, r.winner === 0)}
        ${side("Defenders", r.defender, r.winner === 1)}
      </div>
      ${r.notes.length
        ? html`<ul class="cq-notes">
            ${r.notes.map((n) => html`<li>${n}</li>`)}
          </ul>`
        : nothing}
      <h3 class="cq-h3">Round by round</h3>
      <table class="cq-table">
        <tr>
          <th>Round</th>
          <th>Attackers' die</th>
          <th>Defenders' die</th>
          <th>Attackers lost</th>
          <th>Defenders lost</th>
        </tr>
        ${r.rounds.map(
          (x, i) =>
            html`<tr>
              <td>${i + 1}</td>
              <td>🎲 ${x.rolls[0]}</td>
              <td>🎲 ${x.rolls[1]}</td>
              <td>${x.lost[0]}</td>
              <td>${x.lost[1]}</td>
            </tr>`,
        )}
      </table>
      <p class="mt-3">
        <b>${r.winner === 0 ? "The attackers won." : "The defenders held."}</b>
        The losers
        ${r.outcome === "destroyed" ? "were destroyed." : "retreated."}
      </p>`;
  }

  private renderNations(): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const powers = s.nations
      .filter((n) => n.kind === "power")
      .sort((a, b) => b.score - a.score);
    const natives = s.nations
      .filter((n) => n.kind === "native" && n.alive)
      .map((n) => ({
        n,
        near:
          g.me >= 0 &&
          s.nations[g.me].kind === "power" &&
          nationsBorder(s, map, g.me, n.id),
      }))
      .sort(
        (a, b) =>
          Number(b.near) - Number(a.near) || a.n.name.localeCompare(b.n.name),
      );
    const row = (n: Nation, extra: TemplateResult | string) =>
      html`<tr
        class="cursor-pointer hover:bg-black/5"
        @click=${() => {
          this.modal = null;
          this.select(null, null, n.id);
        }}
      >
        <td>
          <span class="cq-swatch" style="background:${n.color}"></span
          >${nationName(n.name)}${n.playerName
            ? html` <small>(${n.playerName})</small>`
            : nothing}
        </td>
        <td>${provincesOf(s, n.id).length}</td>
        <td>${extra}</td>
        <td>
          ${g.me >= 0 && n.id !== g.me
            ? atWar(s, g.me, n.id)
              ? "⚔ war"
              : dealBetween(s, g.me, n.id)
                ? "🤝 trade"
                : ""
            : ""}
        </td>
      </tr>`;
    return html`<h3 class="cq-h3">Colonial powers</h3>
      <table class="cq-table">
        <tr>
          <th>Nation</th>
          <th>Provinces</th>
          <th>Score</th>
          <th></th>
        </tr>
        ${powers.map((n) => row(n, n.alive ? `${n.score}` : "fallen"))}
      </table>
      <h3 class="cq-h3">Native nations</h3>
      <table class="cq-table">
        <tr>
          <th>Nation</th>
          <th>Provinces</th>
          <th>Opinion of you</th>
          <th></th>
        </tr>
        ${natives.map(({ n, near }) =>
          row(
            n,
            g.me >= 0 && s.nations[g.me].kind === "power"
              ? html`${Math.round(n.opinion[g.me])}${near ? " · neighbour" : ""}`
              : "",
          ),
        )}
      </table>`;
  }

  private renderMarket(): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const made = new Map<string, number>();
    if (g.me >= 0) {
      for (const p of provincesOf(s, g.me)) {
        const good = map.provinces[p].good;
        made.set(
          good,
          (made.get(good) ?? 0) +
            (s.provinces[p].pop / 1000) * GOOD_YIELD[good],
        );
      }
    }
    return html`<p class="cq-hint">
        Prices change every month: the more everyone sells of a good, the less
        it fetches.
      </p>
      <table class="cq-table">
        <tr>
          <th>Good</th>
          <th>Price</th>
          <th>Usual price</th>
          <th>You make a month</th>
        </tr>
        ${[...GOODS]
          .sort((a, b) => s.prices[b] - s.prices[a])
          .map((good) => {
            const ratio = s.prices[good] / GOOD_BASE_PRICE[good];
            return html`<tr>
              <td>${GOOD_ICONS[good]} ${GOOD_NAMES[good]}</td>
              <td>
                <b class=${ratio >= 1 ? "cq-up" : "cq-down"}
                  >${s.prices[good].toFixed(2)}</b
                >
              </td>
              <td>${GOOD_BASE_PRICE[good].toFixed(2)}</td>
              <td>${(made.get(good) ?? 0).toFixed(1)}</td>
            </tr>`;
          })}
      </table>`;
  }

  private renderHelp(): TemplateResult {
    return html`<dl class="cq-help">
        ${HELP.map(
          ([t, d]) =>
            html`<dt>${t}</dt>
              <dd>${d}</dd>`,
        )}
      </dl>
      <p class="cq-hint">
        Keys: space pauses, 1–5 set the speed, + and − zoom, Esc closes things.
      </p>`;
  }

  private renderMenu(): TemplateResult {
    const g = this.game!;
    const canEnd = g.solo || g.host === g.you;
    return html`<div class="flex flex-col gap-2">
      <p class="cq-sub">
        Game code <b>${g.code}</b>${g.solo ? " (solo)" : ""} · ends 1 January
        ${g.state.settings.endYear} · computer: ${g.state.settings.difficulty}
      </p>
      ${!g.solo
        ? html`<div class="text-sm">
            ${g.seats.map(
              (x) =>
                html`<div>
                  <span class="cq-dot ${x.online ? "cq-dot-on" : ""}"></span>
                  ${x.name}${x.id === g.host ? " (host)" : ""}
                </div>`,
            )}
          </div>`
        : nothing}
      <button class="cq-act" @click=${() => (this.modal = { kind: "nations" })}>
        Nations and diplomacy
      </button>
      <button class="cq-act" @click=${() => (this.modal = { kind: "market" })}>
        The market
      </button>
      <button class="cq-act" @click=${() => (this.modal = { kind: "help" })}>
        How to play
      </button>
      ${canEnd && !g.state.over
        ? html`<button
            class="cq-act"
            @click=${() => {
              if (
                confirm(
                  "End the game now? The highest score wins and Derp Coins are paid out.",
                )
              )
                this.net.send({ t: "end" });
            }}
          >
            End the game now
          </button>`
        : nothing}
      <button
        class="cq-act cq-act-danger"
        @click=${() => {
          this.net.send({ t: "leave" });
          clearRejoin();
          location.href = "/conquest";
        }}
      >
        Leave the game
      </button>
      <a class="cq-act text-center" href="/">Back to Derp Land</a>
    </div>`;
  }

  private renderEnd(): TemplateResult {
    const g = this.game!;
    const s = g.state;
    const winner = s.winner >= 0 ? s.nations[s.winner] : null;
    const ranking = [...s.nations.filter((n) => n.kind === "power")].sort(
      (a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score,
    );
    const coinsFor = (n: Nation) =>
      this.results?.find((r) => r.power === n.key);
    return html`<p class="mb-3 text-lg">
        ${winner
          ? html`<b>${nationName(winner.name)}</b>${winner.playerName
                ? html` (${winner.playerName})`
                : nothing}
              wins on ${formatDate(s.day)}!`
          : nothing}
      </p>
      <table class="cq-table">
        <tr>
          <th>#</th>
          <th>Nation</th>
          <th>Score</th>
          <th>Provinces</th>
          <th>Colonies</th>
          <th>Battles won</th>
          <th>Derp Coins</th>
        </tr>
        ${ranking.map((n, i) => {
          const r = coinsFor(n);
          return html`<tr class=${n.id === g.me ? "font-bold" : ""}>
            <td>${i + 1}</td>
            <td>
              <span class="cq-swatch" style="background:${n.color}"></span
              >${nationName(n.name)}${n.playerName
                ? html` <small>(${n.playerName})</small>`
                : nothing}
            </td>
            <td>${n.score}</td>
            <td>${provincesOf(s, n.id).length}</td>
            <td>${n.stats.coloniesFounded}</td>
            <td>${n.stats.battlesWon}</td>
            <td>
              ${r
                ? r.coins === null
                  ? html`<small>sign in to earn</small>`
                  : `🪙 ${r.coins}`
                : ""}
            </td>
          </tr>`;
        })}
      </table>
      ${this.results === null
        ? html`<p class="cq-hint">Saving results…</p>`
        : nothing}
      <p class="cq-hint">
        Derp Coins: ${CONQUEST_COINS.played} for playing, plus provinces,
        colonies, battles and conquests, and ${CONQUEST_COINS.win} for the win.
        Games shorter than two game years pay nothing.
      </p>
      <div class="mt-4 flex flex-wrap gap-2">
        <a class="cq-btn" href="/conquest" @click=${() => clearRejoin()}
          >Play again</a
        >
        <a class="cq-btn-ghost" href="/" @click=${() => clearRejoin()}
          >Back to Derp Land</a
        >
        <button class="cq-btn-ghost" @click=${() => (this.modal = null)}>
          Look at the map
        </button>
      </div>`;
  }
}
