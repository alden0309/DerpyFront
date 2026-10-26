/**
 * DFX (r26): the watch-together panel over the replay viewer: who's
 * watching, who hosts and who holds the controls (with handing them on and
 * taking them back), the room's link, inviting friends who are on Derp
 * Land, and the game's emoji as reactions that float up for everyone.
 *
 * Desktop: a card at the top right, open. Phone: a pill above the replay's
 * controls that opens into the same card.
 */

import { flattenedEmojiTable } from "@openfront/engine-api/Schemas";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { social, SOCIAL_EVENT } from "../../derpland/Social";
import type { PersonRow } from "../../derpland/SocialTypes";
import {
  WATCH_REACTIONS,
  watchRoomPath,
  type WatchGame,
  type WatchMember,
} from "../../derpland/WatchTypes";
import { mapName } from "../derpy/DerpyUi";
import { scenarioTitle } from "../scenario/ScenarioText";
import { copyToClipboard, translateText } from "../Utils";
import type { WatchConnectionState } from "./WatchConnection";
import type { WatchSync } from "./WatchSync";

interface Floating {
  id: number;
  emoji: string;
  name: string;
  left: number;
}

/** Reactions on screen at once (the oldest goes). */
const MAX_FLOATING = 12;
const FLOAT_MS = 3200;

let floatId = 0;

@customElement("watch-panel")
export class WatchPanel extends LitElement {
  @property({ attribute: false }) sync: WatchSync | null = null;
  @property() room = "";
  @property({ attribute: false }) game: WatchGame | null = null;
  @property() connection: WatchConnectionState = "open";
  /** The room closed under us: the replay plays on, alone. */
  @property({ type: Boolean }) alone = false;

  @state() private open = window.matchMedia?.("(min-width: 640px)").matches;
  @state() private copied = false;
  @state() private inviting = false;
  @state() private invited = new Set<number>();
  @state() private floating: Floating[] = [];
  private readonly abort = new AbortController();

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(SOCIAL_EVENT, () => this.requestUpdate(), {
      signal: this.abort.signal,
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.abort.abort();
  }

  /** A reaction came: float it up from the bottom. */
  float(from: WatchMember | null, e: number): void {
    const emoji = flattenedEmojiTable[e];
    if (emoji === undefined) return;
    const f: Floating = {
      id: ++floatId,
      emoji,
      name: from?.name ?? "",
      left: 8 + Math.random() * 64,
    };
    this.floating = [...this.floating, f].slice(-MAX_FLOATING);
    setTimeout(() => {
      this.floating = this.floating.filter((x) => x.id !== f.id);
    }, FLOAT_MS);
  }

  private link(): string {
    return `${window.location.origin}${watchRoomPath(this.room)}`;
  }

  private async copy(): Promise<void> {
    try {
      await copyToClipboard(
        this.link(),
        () => (this.copied = true),
        () => (this.copied = false),
      );
    } catch {
      // The browser said no: the address bar has the link too.
    }
  }

  private async invite(row: PersonRow): Promise<void> {
    const err = await social.act("/invite", { id: row.id });
    if (err === null || err === "already_there") {
      this.invited = new Set([...this.invited, row.id]);
    }
  }

  private gameTitle(): string {
    const g = this.game;
    if (g === null) return "";
    return g.scenario ? scenarioTitle({ id: g.scenario }) : mapName(g.map);
  }

  render() {
    const sync = this.sync;
    if (sync === null) return nothing;
    const count = sync.members.length;
    return html`
      <div
        class="fixed z-[9001] flex flex-col gap-2 text-white select-none max-sm:left-2 max-sm:right-2 max-sm:bottom-20 sm:top-3 sm:right-3 sm:w-72"
        data-watch-panel
      >
        ${this.open
          ? this.renderCard(sync, count)
          : this.renderPill(sync, count)}
      </div>
      ${this.renderFloating()}
    `;
  }

  private renderPill(sync: WatchSync, count: number): TemplateResult {
    return html`<button
      class="flex items-center gap-2 self-start rounded-full border border-white/15 bg-gray-900/90 px-3 py-1.5 text-sm shadow-lg backdrop-blur-sm sm:self-end"
      aria-expanded="false"
      data-watch-pill
      @click=${() => (this.open = true)}
    >
      ${eyeIcon()}
      <span class="font-semibold"
        >${translateText("watch_together.watching_count", { count })}</span
      >
      ${this.renderState(sync, true)}
      <span aria-hidden="true" class="text-white/50">▴</span>
    </button>`;
  }

  private renderCard(sync: WatchSync, count: number): TemplateResult {
    return html`<section
      class="flex max-h-[min(70vh,34rem)] flex-col overflow-hidden rounded-xl border border-white/15 bg-gray-900/92 shadow-2xl backdrop-blur-sm"
      aria-label=${translateText("watch_together.title")}
    >
      <header
        class="flex items-center gap-2 border-b border-white/10 px-3 py-2"
      >
        ${eyeIcon()}
        <div class="flex min-w-0 flex-1 flex-col leading-tight">
          <span class="text-sm font-bold"
            >${translateText("watch_together.title")}</span
          >
          <span class="truncate text-xs text-white/55"
            >${this.gameTitle()} ·
            ${translateText("watch_together.watching_count", {
              count,
            })}</span
          >
        </div>
        <button
          class="rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          aria-expanded="true"
          @click=${() => (this.open = false)}
        >
          ${translateText("watch_together.hide")}
        </button>
      </header>
      <div class="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-2.5">
        ${this.renderState(sync, false)} ${this.renderControlLine(sync)}
        <ul class="flex flex-col gap-1" data-watch-members>
          ${sync.members.map((m) => this.renderMember(sync, m))}
        </ul>
        ${this.alone ? nothing : this.renderShare()}
        ${this.alone ? nothing : this.renderInvite()}
      </div>
      ${this.alone ? nothing : this.renderReactions(sync)}
    </section>`;
  }

  /** Reconnecting, catching up, or the end. */
  private renderState(sync: WatchSync, compact: boolean) {
    let text = "";
    let tone = "text-amber-200";
    if (this.alone) {
      text = translateText("watch_together.left_alone");
      tone = "text-white/70";
    } else if (this.connection === "reconnecting") {
      text = translateText("watch_together.reconnecting");
    } else if (sync.behind) {
      text = translateText("watch_together.catching_up");
    } else if (sync.ended) {
      text = translateText("watch_together.ended");
      tone = "text-white/60";
    }
    if (text === "") return nothing;
    return compact
      ? html`<span class="max-w-[10rem] truncate text-xs ${tone}"
          >${text}</span
        >`
      : html`<p role="status" class="text-xs ${tone}" data-watch-state>
          ${text}
        </p>`;
  }

  /** Who holds the controls, and taking them back. */
  private renderControlLine(sync: WatchSync) {
    if (this.alone) return nothing;
    const mine = sync.inControl;
    return html`<div
      class="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-xs"
      data-watch-control
    >
      ${remoteIcon(mine ? "text-cyber-yellow" : "text-white/60")}
      <span class="min-w-0 flex-1 truncate ${mine ? "font-semibold" : ""}"
        >${mine
          ? translateText("watch_together.you_have_controls")
          : translateText("watch_together.controls_with", {
              name: sync.controllerName(),
            })}</span
      >
      ${sync.isHost && !mine
        ? html`<button
            class="shrink-0 rounded-md border border-cyber-yellow/50 px-2 py-0.5 font-semibold text-cyber-yellow hover:bg-cyber-yellow/10"
            data-watch-take
            @click=${() => sync.takeControl()}
          >
            ${translateText("watch_together.take_controls")}
          </button>`
        : nothing}
    </div>`;
  }

  private renderMember(sync: WatchSync, m: WatchMember): TemplateResult {
    const you = m.id === sync.you;
    const canHand =
      !this.alone && (sync.inControl || sync.isHost) && m.id !== sync.ctl;
    return html`<li class="flex items-center gap-2 text-sm" data-member=${m.id}>
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full ${m.account
          ? "bg-malibu-blue/70"
          : "bg-white/15"} text-xs font-bold uppercase"
        aria-hidden="true"
        >${m.name.slice(0, 1)}</span
      >
      <span class="min-w-0 flex-1 truncate"
        >${m.name}${you
          ? html` <span class="text-white/45"
              >(${translateText("watch_together.you")})</span
            >`
          : nothing}</span
      >
      ${m.id === sync.host
        ? html`<span
            class="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70"
            >${translateText("watch_together.host")}</span
          >`
        : nothing}
      ${m.id === sync.ctl
        ? html`<span
            class="shrink-0"
            title=${translateText("watch_together.controls")}
            aria-label=${translateText("watch_together.controls")}
            >${remoteIcon("text-cyber-yellow")}</span
          >`
        : canHand
          ? html`<button
              class="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
              data-watch-hand=${m.id}
              @click=${() => sync.handTo(m.id)}
            >
              ${translateText("watch_together.give_controls")}
            </button>`
          : nothing}
    </li>`;
  }

  private renderShare(): TemplateResult {
    return html`<div class="flex flex-col gap-1">
      <button
        class="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
        data-watch-copy
        @click=${() => void this.copy()}
      >
        ${this.copied
          ? translateText("watch_together.link_copied")
          : translateText("watch_together.copy_link")}
      </button>
      <span class="text-center text-[11px] text-white/45"
        >${translateText("watch_together.share_hint")}</span
      >
    </div>`;
  }

  private renderInvite() {
    const s = social.state;
    if (s === null) {
      return html`<p class="text-xs text-white/45">
        ${translateText("watch_together.sign_in_to_invite")}
      </p>`;
    }
    if (!this.inviting) {
      return html`<button
        class="rounded-lg px-3 py-1.5 text-sm text-malibu-blue hover:bg-white/5"
        data-watch-invite-open
        @click=${() => {
          this.inviting = true;
          social.refresh();
        }}
      >
        ${translateText("watch_together.invite_friends")}
      </button>`;
    }
    const friends = s.friends.filter((f) => f.place !== null);
    return html`<div class="flex flex-col gap-1" data-watch-invite>
      <span class="text-xs font-bold uppercase tracking-wide text-white/45"
        >${translateText("watch_together.invite_friends")}</span
      >
      ${friends.length === 0
        ? html`<p class="text-xs text-white/50">
            ${translateText("watch_together.no_friends_online")}
          </p>`
        : friends.map(
            (f) =>
              html`<div class="flex items-center gap-2 text-sm">
                <span class="min-w-0 flex-1 truncate">${f.username}</span>
                ${this.invited.has(f.id)
                  ? html`<span class="text-xs text-white/50"
                      >${translateText("watch_together.invited")}</span
                    >`
                  : html`<button
                      class="rounded-md border border-white/15 px-2 py-0.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40"
                      ?disabled=${!s.me.canInvite}
                      @click=${() => void this.invite(f)}
                    >
                      ${translateText("watch_together.invite")}
                    </button>`}
              </div>`,
          )}
    </div>`;
  }

  private renderReactions(sync: WatchSync): TemplateResult {
    return html`<div
      class="flex items-center justify-between gap-0.5 border-t border-white/10 px-2 py-1.5"
      role="group"
      aria-label=${translateText("watch_together.react")}
      data-watch-reactions
    >
      ${WATCH_REACTIONS.map(
        (e) =>
          html`<button
            class="flex size-8 items-center justify-center rounded-md text-lg leading-none transition-transform hover:scale-110 hover:bg-white/10 active:scale-95"
            @click=${() => sync.react(e)}
          >
            ${flattenedEmojiTable[e]}
          </button>`,
      )}
    </div>`;
  }

  private renderFloating() {
    if (this.floating.length === 0) return nothing;
    return html`<div
      class="pointer-events-none fixed inset-0 z-[9001] overflow-hidden"
      aria-hidden="true"
    >
      ${this.floating.map(
        (f) =>
          html`<span
            class="watch-float absolute bottom-24 flex flex-col items-center"
            style="left:${f.left}%"
            ><span class="text-4xl drop-shadow">${f.emoji}</span
            ><span
              class="mt-0.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/90"
              >${f.name}</span
            ></span
          >`,
      )}
      <style>
        .watch-float {
          animation: watch-float ${FLOAT_MS}ms ease-out forwards;
        }
        @keyframes watch-float {
          0% {
            transform: translateY(20px) scale(0.6);
            opacity: 0;
          }
          12% {
            transform: translateY(0) scale(1.1);
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            transform: translateY(-45vh) scale(1);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .watch-float {
            animation: watch-fade ${FLOAT_MS}ms linear forwards;
          }
          @keyframes watch-fade {
            0%,
            80% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }
        }
      </style>
    </div>`;
  }
}

function eyeIcon(): TemplateResult {
  return html`<svg
    viewBox="0 0 24 24"
    class="size-5 shrink-0 text-malibu-blue"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>`;
}

/** A remote control: who holds the controls. */
function remoteIcon(cls: string): TemplateResult {
  return html`<svg
    viewBox="0 0 24 24"
    class="size-4 shrink-0 ${cls}"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <rect x="7" y="2" width="10" height="20" rx="3" />
    <circle cx="12" cy="8" r="2" />
    <path d="M10 14h.01M14 14h.01M10 17h.01M14 17h.01" />
  </svg>`;
}
