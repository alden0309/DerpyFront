// The in-game chat: a small panel in the bottom-left corner that folds down
// to a button. Players' lines (all players, team, allies) come from the
// server (ChatReceivedEvent); the AI nations' lines from NationChatter, which
// reads the game's own updates. Names are drawn from this client's view of
// the game, so anonymized games and the "hide names" setting are respected.
//
// The chat can be dragged anywhere on the screen by its grip (the dotted tab
// beside the folded button, or the open panel's header), with the mouse or a
// finger. Where it is put is remembered per browser (ChatPlacement.ts) and
// kept on screen; double-clicking the grip, or the panel's reset button,
// puts it back in its corner. A drag never reaches the map underneath.

import { GameMode, PlayerType } from "@openfront/engine-api/game/GameTypes";
import { assetUrl } from "@openfront/shared/AssetUrls";
import {
  CHAT_BURST,
  CHAT_MAX_LENGTH,
  CHAT_PER_MINUTE,
  CHAT_REFILL_MS,
  ChatChannel,
  normalizeChatText,
} from "@openfront/shared/Chat";
import { EventBus } from "@openfront/shared/EventBus";
import { ServerChatMessage } from "@openfront/shared/WireSchemas";
import { Colord } from "colord";
import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import {
  ChatReceivedEvent,
  OpenChatEvent,
  SendChatEvent,
} from "../../chat/ChatEvents";
import {
  ChatOffsets,
  ChatPlacement,
  clampDrag,
  fitOffsets,
  loadChatPlacement,
  placementFromBox,
  saveChatPlacement,
  scaledOffsets,
} from "../../chat/ChatPlacement";
import {
  ChatterLine,
  ChatterPlayer,
  ChatterWorld,
  NationChatter,
} from "../../chat/NationChatter";
import { Controller } from "../../Controller";
import { USER_SETTINGS_CHANGED_EVENT, UserSettings } from "../../UserSettings";
import { formatKeyForDisplay, translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";

const MAX_LINES = 200;
const PREVIEW_MS = 7000;
const PREVIEW_LINES = 3;

type Kind = "player" | "ai" | "system";

interface ChatEntry {
  id: number;
  kind: Kind;
  channel: ChatChannel;
  /** The speaker (players and nations). */
  from?: number;
  text: string;
  /** For nations' lines: who "{name}" is. */
  about?: number | null;
  at: number;
}

/** The chatter's view of the game, answered by this client's GameView. */
export function gameViewWorld(game: GameView): ChatterWorld {
  const view = (id: number): PlayerView | null => {
    try {
      const p = game.playerBySmallID(id);
      return p.isPlayer() ? (p as PlayerView) : null;
    } catch {
      return null; // not (yet) a player this client knows
    }
  };
  const info = (p: PlayerView): ChatterPlayer => {
    // A nation's flag rides its cosmetics as "/flags/<code>.svg".
    const flag = /^\/flags\/(.+)\.svg$/.exec(p.equippedCosmetics.flag ?? "");
    return {
      smallID: p.smallID(),
      id: p.id(),
      type: p.type(),
      name: p.type() === PlayerType.Human ? p.displayName() : p.static.name,
      flag: flag === null ? null : decodeURIComponent(flag[1]),
    };
  };
  return {
    gameID: () => game.gameID(),
    map: () => game.config().gameConfig().gameMap,
    ticks: () => game.ticks(),
    inSpawnPhase: () => game.inSpawnPhase(),
    player: (id) => {
      const p = view(id);
      return p === null ? null : info(p);
    },
    playerById: (id) => {
      try {
        return info(game.player(id));
      } catch {
        return null;
      }
    },
    playerByClientID: (id) => {
      const p = game.playerByClientID(id);
      return p === null ? null : info(p);
    },
    players: () => game.players().map(info),
    nations: () =>
      game
        .players()
        .filter((p) => p.type() === PlayerType.Nation)
        .map(info),
    tiles: (id) => view(id)?.numTilesOwned() ?? 0,
    isAlive: (id) => view(id)?.isAlive() ?? false,
    allies: (id) =>
      view(id)
        ?.allies()
        .map((a) => a.smallID()) ?? [],
    numLandTiles: () => game.numLandTiles(),
  };
}

/** A drag of the chat by its grip, from pointerdown to pointerup. */
interface ChatDrag {
  pointerId: number;
  grip: HTMLElement;
  startX: number;
  startY: number;
  /** The chat's box when the drag began. */
  start: { left: number; top: number; width: number; height: number };
  dx: number;
  dy: number;
  moved: boolean;
}

/** Pointer travel (px) before a press on the grip counts as a drag. */
const DRAG_SLOP = 3;

/** Readable on the panel's dark glass: dark player colours are lifted. */
function readable(c: Colord): string {
  let out = c;
  for (let i = 0; i < 4 && out.brightness() < 0.55; i++)
    out = out.lighten(0.12);
  return out.toHex();
}

@customElement("chat-display")
export class ChatDisplay extends LitElement implements Controller {
  public eventBus: EventBus;
  public game: GameView;

  private userSettings = new UserSettings();
  private chatter: NationChatter | null = null;
  private nextId = 1;
  private sentAt: number[] = [];
  private burst = CHAT_BURST;
  private burstAt = 0;
  private teardown: (() => void)[] = [];
  private previewTimer: number | null = null;
  private stickToBottom = true;
  private ignoreOpenUntil = 0;

  @state() private open = false;
  @state() private entries: ChatEntry[] = [];
  @state() private unread = 0;
  @state() private channel: ChatChannel = "all";
  @state() private draft = "";
  @state() private muted = new Set<number>();
  @state() private menuFor: number | null = null;
  @state() private bottom = 12;
  @state() private aiOn = true;
  @state() private now = Date.now();
  /** Where the player dragged the chat; null for its usual corner. */
  @state() private placement: ChatPlacement | null = null;
  /** The placement's offsets, fitted to this screen and the chat's size. */
  @state() private fitted: ChatOffsets | null = null;
  @state() private viewport = { w: 0, h: 0 };
  @state() private dragging = false;
  private drag: ChatDrag | null = null;

  @query(".chat-input") private input?: HTMLInputElement;
  @query(".chat-scroll") private scroller?: HTMLDivElement;
  @query(".chat-box") private box?: HTMLDivElement;

  createRenderRoot() {
    return this;
  }

  init() {
    // The element and the event bus outlive a game; start each one clean.
    for (const undo of this.teardown) undo();
    this.teardown = [];
    this.entries = [];
    this.unread = 0;
    this.open = false;
    this.muted = new Set();
    this.chatter = null;
    this.aiOn = this.userSettings.aiChatter();
    this.placement = loadChatPlacement();
    this.fitted = null;
    this.endDrag(false);

    const onReceive = (e: ChatReceivedEvent) => this.onReceive(e.message);
    const onOpen = () => this.openAndFocus();
    const onSetting = () => (this.aiOn = this.userSettings.aiChatter());
    const settingEvent = `${USER_SETTINGS_CHANGED_EVENT}:settings.aiChatter`;
    this.eventBus.on(ChatReceivedEvent, onReceive);
    this.eventBus.on(OpenChatEvent, onOpen);
    globalThis.addEventListener?.(settingEvent, onSetting);
    this.teardown.push(
      () => this.eventBus.off(ChatReceivedEvent, onReceive),
      () => this.eventBus.off(OpenChatEvent, onOpen),
      () => globalThis.removeEventListener?.(settingEvent, onSetting),
    );
    this.watchHud();
    this.system(translateText("game_chat.welcome"));
  }

  tick() {
    const updates = this.game.updatesSinceLastTick();
    if (updates === null) return;
    this.chatter ??= new NationChatter(gameViewWorld(this.game));
    const lines = this.chatter.tick(updates);
    if (!this.aiOn) return;
    for (const line of lines) this.addNationLine(line);
  }

  // ---------------------------------------------------------------- input

  private openAndFocus() {
    // The Enter that just sent a line comes back as a keyup on the page.
    if (Date.now() < this.ignoreOpenUntil) return;
    this.open = true;
    this.unread = 0;
    this.stickToBottom = true;
    void this.updateComplete.then(() => this.input?.focus());
  }

  private close() {
    this.open = false;
    this.menuFor = null;
    this.input?.blur();
  }

  private toggle() {
    if (this.open) this.close();
    else this.openAndFocus();
  }

  private readOnly(): "spectator" | "replay" | null {
    if (this.game.config().isReplay()) return "replay";
    if (this.game.myPlayer() === null) return "spectator";
    return null;
  }

  private channels(): ChatChannel[] {
    const isTeamGame =
      this.game.config().gameConfig().gameMode === GameMode.Team &&
      this.game.myPlayer()?.team() !== null;
    return isTeamGame ? ["all", "team", "allies"] : ["all", "allies"];
  }

  private cycleChannel() {
    const list = this.channels();
    this.channel = list[(list.indexOf(this.channel) + 1) % list.length];
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.ignoreOpenUntil = Date.now() + 400;
      if (normalizeChatText(this.draft) === "") {
        this.input?.blur();
      } else {
        this.send();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.cycleChannel();
    }
    e.stopPropagation();
  }

  /**
   * The server's limit (a burst, refilled slowly, and a cap a minute),
   * applied here first so a line is never silently dropped.
   */
  private allowedNow(): boolean {
    const now = Date.now();
    const refilled = Math.floor((now - this.burstAt) / CHAT_REFILL_MS);
    if (refilled > 0) {
      this.burst = Math.min(CHAT_BURST, this.burst + refilled);
      this.burstAt += refilled * CHAT_REFILL_MS;
    }
    if (this.burst >= CHAT_BURST) this.burstAt = now;
    this.sentAt = this.sentAt.filter((t) => now - t < 60_000);
    if (this.burst < 1 || this.sentAt.length >= CHAT_PER_MINUTE) return false;
    this.burst--;
    this.sentAt.push(now);
    return true;
  }

  private send() {
    const text = normalizeChatText(this.draft);
    if (text === "" || this.readOnly() !== null) return;
    const me = this.game.myPlayer();
    if (me === null) return;
    let to: string[] = [];
    if (this.channel !== "all") {
      const hearers = this.game
        .players()
        .filter(
          (p) =>
            p !== me &&
            p.type() === PlayerType.Human &&
            p.clientID() !== null &&
            (this.channel === "team" ? p.isOnSameTeam(me) : p.isAlliedWith(me)),
        );
      if (hearers.length === 0) {
        this.system(
          translateText(
            this.channel === "team"
              ? "game_chat.no_team"
              : "game_chat.no_allies",
          ),
        );
        return;
      }
      to = hearers.map((p) => p.clientID()!);
    }
    if (!this.allowedNow()) {
      this.system(translateText("game_chat.slow_down"));
      return;
    }
    this.eventBus.emit(new SendChatEvent(this.channel, text, to));
    this.draft = "";
    this.stickToBottom = true;
  }

  // -------------------------------------------------------------- receive

  private onReceive(msg: ServerChatMessage) {
    const sender = this.game.playerByClientID(msg.from);
    if (sender === null) return;
    const me = this.game.myPlayer();
    const mine = me !== null && sender === me;
    if (!mine && msg.channel !== "all") {
      // The server delivers what the sender's client listed; check that the
      // sender really is on our team or allied, as this client sees it.
      if (me === null) return;
      if (msg.channel === "team" && !sender.isOnSameTeam(me)) return;
      if (msg.channel === "allies" && !sender.isAlliedWith(me)) return;
    }
    if (this.muted.has(sender.smallID())) return;
    this.add({
      kind: "player",
      channel: msg.channel,
      from: sender.smallID(),
      text: msg.text,
    });
    if (msg.channel === "all") {
      this.chatter?.onChat(msg.from, msg.text, msg.seq);
    }
    if (!mine && !this.open) this.unread++;
  }

  private addNationLine(line: ChatterLine) {
    if (this.muted.has(line.speaker)) return;
    this.add({
      kind: "ai",
      channel: "all",
      from: line.speaker,
      text: line.text,
      about: line.about,
    });
    if (!this.open) this.unread++;
  }

  private system(text: string) {
    this.add({ kind: "system", channel: "all", text });
  }

  private add(e: Omit<ChatEntry, "id" | "at">) {
    const entry: ChatEntry = { ...e, id: this.nextId++, at: Date.now() };
    this.entries = [...this.entries, entry].slice(-MAX_LINES);
    this.now = Date.now();
    this.schedulePreviewExpiry();
  }

  private schedulePreviewExpiry() {
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.now = Date.now();
    }, PREVIEW_MS + 50);
  }

  // ----------------------------------------------------------------- mute

  private toggleMute(smallID: number) {
    const p = this.player(smallID);
    const next = new Set(this.muted);
    const name = p?.displayName() ?? "";
    if (next.has(smallID)) {
      next.delete(smallID);
      this.muted = next;
      this.system(translateText("game_chat.unmuted", { name }));
    } else {
      next.add(smallID);
      this.muted = next;
      this.entries = this.entries.filter((e) => e.from !== smallID);
      this.system(translateText("game_chat.muted", { name }));
    }
    this.menuFor = null;
  }

  private toggleAi() {
    this.userSettings.setAiChatter(!this.aiOn);
    this.aiOn = this.userSettings.aiChatter();
    this.system(
      translateText(this.aiOn ? "game_chat.ai_on" : "game_chat.ai_off"),
    );
  }

  // --------------------------------------------------------------- layout

  /**
   * Sit just above the bottom HUD, which spans the screen below desktop
   * width; on desktop the bottom-left corner is free.
   */
  private watchHud() {
    const hud = document.getElementById("bottom-hud");
    const place = () => {
      const desktop = window.innerWidth >= 1024;
      this.bottom = desktop || hud === null ? 12 : hud.offsetHeight + 8;
      this.viewport = { w: window.innerWidth, h: window.innerHeight };
    };
    place();
    if (hud !== null && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(place);
      observer.observe(hud);
      this.teardown.push(() => observer.disconnect());
    }
    window.addEventListener("resize", place);
    this.teardown.push(() => window.removeEventListener("resize", place));
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (this.open && this.scroller && this.stickToBottom) {
      this.scroller.scrollTop = this.scroller.scrollHeight;
    }
    this.fitToScreen();
  }

  // ----------------------------------------------------------------- drag

  /**
   * Keep a placed chat wholly on screen: its size changes as it opens, folds
   * and shows new lines, and the screen as the window is resized or turned.
   */
  private fitToScreen() {
    if (this.placement === null || this.dragging || !this.box) {
      if (this.placement === null && this.fitted !== null) this.fitted = null;
      return;
    }
    const { w, h } = this.viewport;
    if (w <= 0 || h <= 0) return;
    const r = this.box.getBoundingClientRect();
    const next = fitOffsets(
      scaledOffsets(this.placement, w, h),
      r.width,
      r.height,
      w,
      h,
    );
    const cur = this.fitted;
    if (
      cur === null ||
      cur.h !== next.h ||
      cur.v !== next.v ||
      cur.x !== next.x ||
      cur.y !== next.y
    ) {
      this.fitted = next;
    }
  }

  private onGripDown(e: PointerEvent) {
    if (e.button !== 0 || this.drag !== null || !this.box) return;
    // The header's own buttons keep working; only its bare parts are a grip.
    const target = e.target as Element | null;
    if (target?.closest?.("button, input, a, kbd") ?? false) return;
    // Nothing underneath sees the press: no map pan, no click, no selection.
    e.preventDefault();
    e.stopPropagation();
    const grip = e.currentTarget as HTMLElement;
    const r = this.box.getBoundingClientRect();
    this.drag = {
      pointerId: e.pointerId,
      grip,
      startX: e.clientX,
      startY: e.clientY,
      start: { left: r.left, top: r.top, width: r.width, height: r.height },
      dx: 0,
      dy: 0,
      moved: false,
    };
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (or jsdom); moves still arrive.
    }
    this.dragging = true;
  }

  private onGripMove(e: PointerEvent) {
    const d = this.drag;
    if (d === null || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    const { w, h } = this.viewport;
    const c = clampDrag(d.start, dx, dy, w, h);
    d.dx = c.dx;
    d.dy = c.dy;
    // Moved with a transform while the finger is down: no re-render per move.
    if (this.box) this.box.style.transform = `translate(${c.dx}px, ${c.dy}px)`;
  }

  private onGripUp(e: PointerEvent) {
    const d = this.drag;
    if (d === null || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    this.endDrag(e.type === "pointerup");
  }

  /** Finish a drag: drop the chat where it is (`keep`), or snap it back. */
  private endDrag(keep: boolean) {
    const d = this.drag;
    this.drag = null;
    this.dragging = false;
    if (d === null) return;
    try {
      if (d.grip.hasPointerCapture?.(d.pointerId)) {
        d.grip.releasePointerCapture(d.pointerId);
      }
    } catch {
      // Already released.
    }
    if (keep && d.moved && this.box) {
      const r = this.box.getBoundingClientRect();
      const { w, h } = this.viewport;
      const p = placementFromBox(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        w,
        h,
      );
      this.placement = p;
      this.fitted = null;
      saveChatPlacement(p);
    }
    // The new placement's offsets take over from the drag's transform.
    if (this.box) this.box.style.transform = "";
  }

  /** Back to the usual corner, and forget the saved spot. */
  private resetPlacement() {
    this.endDrag(false);
    this.placement = null;
    this.fitted = null;
    saveChatPlacement(null);
  }

  /** The grip's handlers, shared by the folded tab and the open header. */
  private gripHandlers() {
    return {
      down: (e: PointerEvent) => this.onGripDown(e),
      move: (e: PointerEvent) => this.onGripMove(e),
      up: (e: PointerEvent) => this.onGripUp(e),
      dbl: (e: MouseEvent) => {
        if ((e.target as Element | null)?.closest?.("button") ?? false) return;
        e.preventDefault();
        e.stopPropagation();
        this.resetPlacement();
      },
    };
  }

  private renderGripDots(): TemplateResult {
    return html`<svg
      viewBox="0 0 8 14"
      width="8"
      height="14"
      aria-hidden="true"
      class="fill-current"
    >
      <circle cx="2" cy="2" r="1.3" />
      <circle cx="6" cy="2" r="1.3" />
      <circle cx="2" cy="7" r="1.3" />
      <circle cx="6" cy="7" r="1.3" />
      <circle cx="2" cy="12" r="1.3" />
      <circle cx="6" cy="12" r="1.3" />
    </svg>`;
  }

  private onScroll() {
    const s = this.scroller;
    if (!s) return;
    this.stickToBottom = s.scrollHeight - s.scrollTop - s.clientHeight < 24;
  }

  // --------------------------------------------------------------- render

  private player(smallID: number | null | undefined): PlayerView | null {
    if (smallID === null || smallID === undefined) return null;
    try {
      const p = this.game.playerBySmallID(smallID);
      return p.isPlayer() ? (p as PlayerView) : null;
    } catch {
      return null;
    }
  }

  private nameOf(smallID: number | null | undefined): string {
    return this.player(smallID)?.displayName() ?? "?";
  }

  private renderName(e: ChatEntry): TemplateResult {
    const p = this.player(e.from);
    if (p === null) return html``;
    const me = this.game.myPlayer();
    const canMute = p !== me;
    const flag = e.kind === "ai" ? p.cosmetics.flag : undefined;
    return html`<span class="relative inline-flex items-baseline gap-1">
      ${flag
        ? html`<img
            src=${assetUrl(flag)}
            alt=""
            class="h-3 w-auto self-center rounded-[2px] shadow-sm"
          />`
        : nothing}
      <button
        class="font-bold hover:underline ${canMute
          ? "cursor-pointer"
          : "cursor-default"}"
        style="color: ${readable(p.territoryColor())}"
        @click=${(ev: Event) => {
          ev.stopPropagation();
          if (canMute) this.menuFor = this.menuFor === e.id ? null : e.id;
        }}
      >
        ${p.displayName()}
      </button>
      ${e.kind === "ai"
        ? html`<span
            class="text-[9px] leading-none font-bold tracking-wide px-1 py-0.5 rounded bg-sky-400/20 text-sky-200 border border-sky-300/30 self-center"
            >${translateText("game_chat.ai_tag")}</span
          >`
        : nothing}
      ${this.menuFor === e.id
        ? html`<span
            class="absolute left-0 bottom-full mb-1 z-10 whitespace-nowrap"
          >
            <button
              class="px-2 py-1 text-xs rounded-md bg-gray-900 border border-white/20 text-white shadow-lg hover:bg-gray-700"
              @click=${(ev: Event) => {
                ev.stopPropagation();
                this.toggleMute(p.smallID());
              }}
            >
              🔇
              ${translateText(
                this.muted.has(p.smallID())
                  ? "game_chat.unmute"
                  : "game_chat.mute",
                { name: p.displayName() },
              )}
            </button>
          </span>`
        : nothing}
    </span>`;
  }

  private channelTag(channel: ChatChannel): TemplateResult {
    if (channel === "all") return html``;
    const style =
      channel === "team"
        ? "bg-emerald-400/20 text-emerald-200 border-emerald-300/30"
        : "bg-amber-400/20 text-amber-200 border-amber-300/30";
    return html`<span
      class="text-[9px] leading-none font-bold uppercase px-1 py-0.5 mr-1 rounded border align-middle ${style}"
      >${translateText(`game_chat.channel_${channel}`)}</span
    >`;
  }

  private renderEntry(e: ChatEntry): TemplateResult {
    if (e.kind === "system") {
      return html`<div
        class="px-2 py-0.5 text-[11px] lg:text-xs italic text-gray-400"
      >
        ${e.text}
      </div>`;
    }
    const text =
      e.kind === "ai"
        ? e.text.split("{name}").join(this.nameOf(e.about))
        : e.text;
    return html`<div
      class="px-2 py-0.5 text-xs lg:text-sm leading-snug break-words ${e.kind ===
      "ai"
        ? "bg-sky-300/[0.06] border-l-2 border-sky-300/40"
        : ""}"
    >
      ${this.channelTag(e.channel)}${this.renderName(e)}<span
        class="text-gray-400"
        >:</span
      >
      <span class="${e.kind === "ai" ? "italic text-sky-50/90" : "text-white"}"
        >${text}</span
      >
    </div>`;
  }

  private placeholder(): string {
    const ro = this.readOnly();
    if (ro !== null) return translateText(`game_chat.${ro}`);
    return translateText(`game_chat.placeholder_${this.channel}`);
  }

  private renderPreview(): TemplateResult {
    const recent = this.entries
      .filter((e) => e.kind !== "system" && this.now - e.at < PREVIEW_MS)
      .slice(-PREVIEW_LINES);
    if (recent.length === 0) return html``;
    // Below a chat parked at the top, newest nearest the button.
    const below = this.placement?.v === "top";
    return html`<div
      class="${below
        ? "mt-1.5 flex-col-reverse"
        : "mb-1.5 flex-col"} flex gap-1 pointer-events-none max-w-[min(360px,calc(100vw-16px))]"
    >
      ${recent.map(
        (e) =>
          html`<div
            class="chat-preview rounded-md bg-gray-900/75 backdrop-blur-sm shadow"
          >
            ${this.renderEntry(e)}
          </div>`,
      )}
    </div>`;
  }

  private renderCollapsed(): TemplateResult {
    const key = formatKeyForDisplay(
      this.userSettings.keybinds(false).openChat ?? "Enter",
    ).replace(/^Enter$/, "↵");
    const grip = this.gripHandlers();
    return html`
      ${this.renderPreview()}
      <div
        class="pointer-events-auto inline-flex items-stretch rounded-full bg-gray-800/92 backdrop-blur-sm shadow-lg border border-white/10 text-white"
      >
        <span
          class="chat-grip inline-flex items-center justify-center w-6 pl-1.5 rounded-l-full border-r border-white/10 text-white/45 hover:text-white/80 hover:bg-white/10 touch-none select-none ${this
            .dragging
            ? "cursor-grabbing"
            : "cursor-grab"}"
          title=${translateText("game_chat.drag")}
          aria-label=${translateText("game_chat.drag")}
          @pointerdown=${grip.down}
          @pointermove=${grip.move}
          @pointerup=${grip.up}
          @pointercancel=${grip.up}
          @dblclick=${grip.dbl}
          >${this.renderGripDots()}</span
        >
        <button
          class="inline-flex items-center gap-2 rounded-r-full text-sm font-semibold pl-2.5 pr-3.5 py-1.5 hover:bg-gray-700/95 transition-colors"
          @click=${() => this.openAndFocus()}
          aria-label=${translateText("game_chat.open")}
          title="${translateText("game_chat.open")} (${key})"
        >
          <span aria-hidden="true">💬</span>
          ${translateText("game_chat.title")}
          ${this.unread > 0
            ? html`<span
                class="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none"
                aria-label=${translateText("game_chat.unread", {
                  count: this.unread,
                })}
                >${this.unread > 99 ? "99+" : this.unread}</span
              >`
            : html`<kbd
                class="hidden sm:inline text-[10px] font-normal text-white/50 border border-white/20 rounded px-1"
                >${key}</kbd
              >`}
        </button>
      </div>
    `;
  }

  private renderOpen(): TemplateResult {
    const ro = this.readOnly();
    const visible = this.entries;
    const len = this.draft.length;
    const grip = this.gripHandlers();
    // Room for the lines: the panel never runs off a short screen.
    const roomBelow =
      this.placement === null
        ? `calc(100vh - ${this.bottom}px - 170px)`
        : "calc(100vh - 160px)";
    return html`
      <div
        class="pointer-events-auto flex flex-col w-[calc(100vw-16px)] sm:w-[360px] rounded-xl bg-gray-800/92 backdrop-blur-sm shadow-2xl border border-white/10 text-white overflow-hidden"
        @click=${() => (this.menuFor = null)}
      >
        <div
          class="chat-grip flex items-center gap-2 pl-2 pr-3 py-1.5 bg-black/30 border-b border-white/10 touch-none select-none ${this
            .dragging
            ? "cursor-grabbing"
            : "cursor-grab"}"
          title=${translateText("game_chat.drag")}
          @pointerdown=${grip.down}
          @pointermove=${grip.move}
          @pointerup=${grip.up}
          @pointercancel=${grip.up}
          @dblclick=${grip.dbl}
        >
          <span class="text-white/40 inline-flex"
            >${this.renderGripDots()}</span
          >
          <span class="font-semibold text-sm"
            >💬 ${translateText("game_chat.title")}</span
          >
          <span class="flex-1"></span>
          ${this.placement !== null
            ? html`<button
                class="chat-reset w-6 h-6 inline-flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10"
                @click=${(ev: Event) => {
                  ev.stopPropagation();
                  this.resetPlacement();
                }}
                title=${translateText("game_chat.reset_position")}
                aria-label=${translateText("game_chat.reset_position")}
              >
                ↺
              </button>`
            : nothing}
          <button
            class="text-xs px-2 py-0.5 rounded-full border ${this.aiOn
              ? "border-sky-300/40 bg-sky-400/20 text-sky-100"
              : "border-white/15 text-white/50"} hover:bg-white/10"
            @click=${() => this.toggleAi()}
            title=${translateText(
              this.aiOn ? "game_chat.ai_on" : "game_chat.ai_off",
            )}
            aria-pressed=${this.aiOn ? "true" : "false"}
          >
            🤖 ${translateText("game_chat.ai_tag")}
          </button>
          <button
            class="w-6 h-6 inline-flex items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10"
            @click=${() => this.close()}
            aria-label=${translateText("game_chat.close")}
          >
            ✕
          </button>
        </div>
        <div
          class="chat-scroll overflow-y-auto py-1 min-h-[72px]"
          style="max-height: min(38vh, ${roomBelow})"
          @scroll=${() => this.onScroll()}
        >
          ${visible.length === 0
            ? html`<div class="px-3 py-2 text-xs text-gray-400 italic">
                ${translateText("game_chat.empty")}
              </div>`
            : visible.map((e) => this.renderEntry(e))}
        </div>
        <div
          class="border-t border-white/10 bg-black/20 p-1.5 flex flex-col gap-1"
        >
          ${ro === null
            ? html`<div class="flex gap-1" role="tablist">
                ${this.channels().map(
                  (c) =>
                    html`<button
                      role="tab"
                      aria-selected=${c === this.channel ? "true" : "false"}
                      class="text-[11px] px-2 py-0.5 rounded-full border transition-colors ${c ===
                      this.channel
                        ? c === "all"
                          ? "bg-white/20 border-white/30 text-white"
                          : c === "team"
                            ? "bg-emerald-400/25 border-emerald-300/40 text-emerald-100"
                            : "bg-amber-400/25 border-amber-300/40 text-amber-100"
                        : "border-white/10 text-white/60 hover:text-white hover:bg-white/10"}"
                      @click=${() => {
                        this.channel = c;
                        this.input?.focus();
                      }}
                    >
                      ${translateText(`game_chat.channel_${c}`)}
                    </button>`,
                )}
                <span class="flex-1"></span>
                ${len > CHAT_MAX_LENGTH - 40
                  ? html`<span
                      class="text-[10px] self-center ${len >= CHAT_MAX_LENGTH
                        ? "text-red-300"
                        : "text-white/50"}"
                      >${len}/${CHAT_MAX_LENGTH}</span
                    >`
                  : nothing}
              </div>`
            : nothing}
          <form
            class="flex gap-1"
            @submit=${(ev: Event) => {
              ev.preventDefault();
              this.send();
            }}
          >
            <input
              class="chat-input flex-1 min-w-0 rounded-md bg-gray-900/80 border border-white/15 px-2 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-sky-300/60 disabled:opacity-50"
              type="text"
              maxlength=${CHAT_MAX_LENGTH}
              autocomplete="off"
              enterkeyhint="send"
              .value=${this.draft}
              placeholder=${this.placeholder()}
              ?disabled=${ro !== null}
              @input=${(ev: Event) =>
                (this.draft = (ev.target as HTMLInputElement).value)}
              @keydown=${(ev: KeyboardEvent) => this.onKeyDown(ev)}
            />
            <button
              type="submit"
              class="shrink-0 rounded-md px-3 text-sm font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600"
              ?disabled=${ro !== null || normalizeChatText(this.draft) === ""}
            >
              ${translateText("game_chat.send")}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  render() {
    if (!this.game) return html``;
    const body = this.open ? this.renderOpen() : this.renderCollapsed();
    if (this.placement === null) {
      return html`
        <div
          class="chat-box fixed left-2 sm:left-3 z-[205] flex flex-col items-start pointer-events-none"
          style="bottom: calc(${this.bottom}px + env(safe-area-inset-bottom))"
        >
          ${body}
        </div>
      `;
    }
    // A placed chat grows away from the edges it hugs: down from the top,
    // up from the bottom, left from the right.
    const o =
      this.fitted ??
      scaledOffsets(this.placement, this.viewport.w, this.viewport.h);
    const column = o.v === "top" ? "flex-col-reverse" : "flex-col";
    const align = o.h === "left" ? "items-start" : "items-end";
    return html`
      <div
        class="chat-box fixed z-[205] flex ${column} ${align} pointer-events-none"
        style="${o.h}: ${o.x}px; ${o.v}: ${o.y}px"
      >
        ${body}
      </div>
    `;
  }
}
