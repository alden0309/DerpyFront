/**
 * <replay-controls>: the replay viewer's bottom bar with the timeline,
 * play/pause, speed menu, settings, fullscreen and exit. It only displays
 * what the viewer gives it and reports clicks as events:
 *   replay-toggle-play, replay-seek (detail: frame),
 *   replay-speed (detail: speed), replay-menu
 * DFX (r26): and the rewind buttons (back 10 seconds, back 1 minute, back
 * to the start), which are seeks too.
 */

import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { isDesktopShell } from "../DesktopShell";
import { gamePortal } from "../GamePortal";
import { homeHref, translateText } from "../Utils";
import { TICKS_PER_SECOND } from "./ReplayPlayback";

const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32];
// Same icons as the in-game controls (GameRightSidebar).
const playIcon = assetUrl("images/PlayIconWhite.svg");
const pauseIcon = assetUrl("images/PauseIconWhite.svg");
const speedIcon = assetUrl("images/FastForwardIconSolidWhite.svg");
const settingsIcon = assetUrl("images/SettingIconWhite.svg");
const fullscreenIcon = assetUrl("images/FullscreenIconWhite.svg");
const exitFullscreenIcon = assetUrl("images/ExitFullscreenIconWhite.svg");
const exitIcon = assetUrl("images/ExitIconWhite.svg");

// DFX (r26): rewinding. A replay seeks to any frame (ReplayReader: the
// chunk's keyframe and its deltas), backwards as cheaply as forwards, so a
// rewind is a seek; in a watch room it goes through the room like any seek.
/** The short and long rewinds, in seconds of game time. */
export const REWIND_SHORT_S = 10;
export const REWIND_LONG_S = 60;

/** The frame `seconds` of game time before `frame` (one frame a tick), or 0. */
export function rewindFrame(frame: number, seconds: number): number {
  return Math.max(0, Math.floor(frame) - seconds * TICKS_PER_SECOND);
}

/** A rewind button's icon: an arrow turning back, with its label inside. */
function rewindIcon(label: string) {
  return html`<svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 9.5A8 8 0 1 1 4 13" />
    <path d="M4 4.5v5h5" />
    <text
      x="13.2"
      y="16.2"
      text-anchor="middle"
      font-size="7.5"
      font-weight="700"
      font-family="ui-sans-serif, system-ui, sans-serif"
      fill="currentColor"
      stroke="none"
    >
      ${label}
    </text>
  </svg>`;
}

/** Back to the start: a bar and a double arrow. */
function startIcon() {
  return html`<svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="currentColor"
    aria-hidden="true"
  >
    <rect x="4" y="5" width="2.4" height="14" rx="1" />
    <path d="M12.5 12 20 6.5v11z" />
    <path d="M7 12l6.5-5.5v11z" />
  </svg>`;
}
// DFX (r26) end

/** Game time of a tick, as m:ss or h:mm:ss. */
export function formatGameTime(tick: number): string {
  const total = Math.floor(Math.max(0, tick) / TICKS_PER_SECOND);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * How many frames the timeline covers: the whole game while it's still
 * being processed (if the length is known), otherwise what's loaded.
 */
export function timelineFrames(
  loaded: number,
  gameLength: number | null,
  growing: boolean,
): number {
  return growing && gameLength !== null ? Math.max(loaded, gameLength) : loaded;
}

/** An icon button in the in-game style (GameRightSidebar). */
export function iconButton(src: string, label: string, onClick: () => void) {
  return html`<button
    class="p-1 rounded-md cursor-pointer hover:bg-white/10"
    title=${label}
    aria-label=${label}
    @click=${onClick}
  >
    <img src=${src} alt="" width="20" height="20" />
  </button>`;
}

/** Leaves the viewer (same as leaving a game). */
export function exitButton() {
  return iconButton(
    exitIcon,
    translateText("user_setting.exit_game_label"),
    () => (window.location.href = homeHref()),
  );
}

@customElement("replay-controls")
export class ReplayControls extends LitElement {
  /** The frame on screen. */
  @property({ type: Number }) frame = 0;
  /** The tick of the frame on screen. */
  @property({ type: Number }) tick = 0;
  /** Frames that can be played. */
  @property({ type: Number }) loaded = 0;
  /** Frames the timeline covers (see timelineFrames). */
  @property({ type: Number }) total = 0;
  @property({ type: Boolean }) playing = false;
  @property({ type: Number }) speed = 1;
  /**
   * DFX (r26): watching together, someone else holds the controls: the
   * timeline shows where the room is, and play, speed and seeking are theirs.
   */
  @property({ type: Boolean }) locked = false;
  @property({ type: String }) lockedBy = "";

  @state() private speedMenuOpen = false;
  @state() private isFullscreen = document.fullscreenElement !== null;
  /**
   * Portals have their own fullscreen button and the desktop shell manages
   * its own window, so we hide ours there (same as in game).
   */
  private readonly showFullscreen =
    document.fullscreenEnabled &&
    !gamePortal.isOnGamePortal() &&
    !isDesktopShell();
  private readonly abort = new AbortController();

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(
      "fullscreenchange",
      () => (this.isFullscreen = document.fullscreenElement !== null),
      { signal: this.abort.signal },
    );
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.abort.abort();
  }

  private emit(name: string, detail?: number): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  /** Seek, but not past what's been loaded (the thumb snaps back). */
  private onTimelineInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const frame = Math.min(Number(input.value), this.loaded - 1);
    if (frame !== Number(input.value)) input.value = String(frame);
    this.emit("replay-seek", frame);
  }

  /** DFX (r26): back `seconds` of game time (0: back to the start). */
  private rewind(seconds: number): void {
    const frame = Math.max(0, this.frame);
    this.emit("replay-seek", seconds === 0 ? 0 : rewindFrame(frame, seconds));
  }

  /** DFX (r26): a rewind button, with its key in its title. */
  private rewindButton(
    key: string,
    shortcut: string,
    icon: ReturnType<typeof html>,
    seconds: number,
  ) {
    const label = translateText(`replay_viewer.${key}`);
    const title = translateText("replay_viewer.key_hint", {
      label,
      key: shortcut,
    });
    return html`<button
      class="p-0.5 rounded-md text-white cursor-pointer hover:bg-white/10"
      title=${title}
      aria-label=${label}
      data-rewind=${key}
      @click=${() => this.rewind(seconds)}
    >
      ${icon}
    </button>`;
  }

  private setSpeed(speed: number): void {
    this.speedMenuOpen = false;
    this.emit("replay-speed", speed);
  }

  private openMenu(): void {
    this.speedMenuOpen = false;
    this.emit("replay-menu");
  }

  private toggleFullscreen(): void {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    change.catch((err) => console.warn("replay viewer: fullscreen", err));
  }

  render() {
    const frame = Math.max(0, this.frame);
    const last = Math.max(1, this.total - 1);
    // Two fills: up to the last loaded frame, and up to the current one.
    const loadedPct = Math.min(
      100,
      (Math.max(0, this.loaded - 1) / last) * 100,
    );
    const playedPct = Math.min(100, (frame / last) * 100);
    // One frame per tick, so the last frame's tick is this far ahead.
    const lastTick = this.tick + (this.total - 1 - frame);
    return html`
      <!-- DFX (r26): on a phone the buttons take a row of their own, under
        the timeline (with the rewinds there are too many for one). -->
      <div
        class="absolute left-0 right-0 bottom-0 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-gray-800/92 backdrop-blur-sm"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div class="relative flex-1 h-4 flex items-center">
          <div
            class="absolute inset-x-0 h-1.5 rounded-full bg-white/10 overflow-hidden pointer-events-none"
          >
            <div
              class="absolute inset-y-0 left-0 bg-zinc-400/60 transition-[width] duration-700 ease-out"
              style=${`width: ${loadedPct}%`}
            ></div>
            <div
              class="absolute inset-y-0 left-0 bg-sky-400"
              style=${`width: ${playedPct}%`}
            ></div>
          </div>
          <input
            type="range"
            ?disabled=${this.locked}
            class="relative w-full h-4 m-0 appearance-none bg-transparent disabled:cursor-default cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sky-400"
            min="0"
            max=${Math.max(0, this.total - 1)}
            .value=${String(frame)}
            aria-label=${translateText("replay_viewer.timeline")}
            @input=${this.onTimelineInput}
          />
        </div>
        <span class="tabular-nums text-sm text-white/80">
          ${formatGameTime(this.tick)} / ${formatGameTime(lastTick)}
        </span>
        <div
          class="relative flex items-center gap-3 max-sm:basis-full max-sm:justify-between max-sm:gap-1"
        >
          ${this.locked
            ? this.renderLocked()
            : html`<!-- DFX (r26): rewind -->
                ${this.rewindButton("back_start", "Home", startIcon(), 0)}
                ${this.rewindButton(
                  "back_1m",
                  "Shift+J",
                  rewindIcon("1m"),
                  REWIND_LONG_S,
                )}
                ${this.rewindButton(
                  "back_10s",
                  "J",
                  rewindIcon("10"),
                  REWIND_SHORT_S,
                )}
                ${iconButton(
                  this.playing ? pauseIcon : playIcon,
                  translateText(
                    this.playing ? "replay_viewer.pause" : "replay_viewer.play",
                  ),
                  () => this.emit("replay-toggle-play"),
                )}
                ${iconButton(
                  speedIcon,
                  translateText("replay_panel.replay_speed"),
                  () => (this.speedMenuOpen = !this.speedMenuOpen),
                )}`}
          ${iconButton(
            settingsIcon,
            translateText("user_setting.game_menu_title"),
            () => this.openMenu(),
          )}
          ${this.showFullscreen
            ? iconButton(
                this.isFullscreen ? exitFullscreenIcon : fullscreenIcon,
                translateText(
                  this.isFullscreen ? "fullscreen.exit" : "fullscreen.enter",
                ),
                () => this.toggleFullscreen(),
              )
            : nothing}
          ${exitButton()}
          ${this.speedMenuOpen && !this.locked
            ? this.renderSpeedMenu()
            : nothing}
        </div>
      </div>
    `;
  }

  /** DFX (r26): who holds the controls, where play and speed would be. */
  private renderLocked() {
    return html`<span
      class="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-white/80"
      data-watch-locked
    >
      <span aria-hidden="true">${this.playing ? "▶" : "❚❚"}</span>
      <span class="hidden min-[480px]:inline tabular-nums">×${this.speed}</span>
      <span class="max-w-[12rem] truncate sm:max-w-[16rem]"
        >${translateText("watch_together.controls_with", {
          name: this.lockedBy,
        })}</span
      >
    </span>`;
  }

  /** Speed menu, styled like the classic replay panel (ReplayPanel). */
  private renderSpeedMenu() {
    return html`
      <div
        class="absolute bottom-full right-0 mb-4 p-2 bg-gray-800/92 backdrop-blur-sm shadow-xs rounded-lg"
      >
        <div class="mb-2 text-white" translate="no">
          ${translateText("replay_panel.replay_speed")}
        </div>
        <div class="grid grid-cols-4 gap-2">
          ${SPEEDS.map(
            (sp) =>
              html`<button
                class="py-0.5 px-1 text-sm text-white rounded-sm border transition border-gray-500 hover:border-gray-200 ${sp ===
                this.speed
                  ? "bg-malibu-blue"
                  : ""}"
                @click=${() => this.setSpeed(sp)}
              >
                ×${sp}
              </button>`,
          )}
        </div>
      </div>
    `;
  }
}
