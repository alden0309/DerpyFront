// SITE (r19): Derp Land's "Being played now": the games of DerpyFront and
// Derpy Conquest in progress that anyone may watch, with a Watch button
// each. Watching needs no account. A public game can always be watched; a
// private one when its host allows watchers.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { LiveRoom } from "../conquest/Protocol";
import { timeIn, watchLive } from "../derpland/LiveFeed";
import type { LiveFrontGame, LiveGames } from "../derpland/LiveTypes";
import { nationName } from "./format";
import "./live.css";

const eye = (): TemplateResult =>
  html`<svg
    class="dl-live-eye"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>`;

const MODES: Record<string, string> = {
  "Free For All": "Free for all",
  Team: "Teams",
};

@customElement("dl-live")
export class DerpLive extends LitElement {
  @state() private games: LiveGames | null = null;
  @state() private failed = false;
  private fetchedAt = 0;
  private stop: (() => void) | null = null;
  private clock = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.stop = watchLive((g) => {
      if (g === null) {
        this.failed = this.games === null;
        return;
      }
      this.failed = false;
      this.fetchedAt = Date.now();
      this.games = g;
    });
    // The time each game has been going ticks on between fetches.
    this.clock = window.setInterval(() => this.requestUpdate(), 30_000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stop?.();
    this.stop = null;
    clearInterval(this.clock);
  }

  private since(startedAt: number): string {
    if (!this.games) return "";
    const t = timeIn(startedAt, this.games.serverTime, this.fetchedAt);
    if (t.hours > 0) return `${t.hours} h ${t.minutes} min in`;
    return t.minutes < 1 ? "Just begun" : `${t.minutes} min in`;
  }

  render(): TemplateResult {
    const g = this.games;
    const count = g ? g.derpyfront.length + g.conquest.length : 0;
    return html`<section class="dl-live" aria-labelledby="dl-live-h">
      <div class="dl-live-head">
        <h2 class="dl-h2 dl-live-h" id="dl-live-h">
          <span
            class="dl-live-dot ${count ? "on" : ""}"
            aria-hidden="true"
          ></span>
          Being played now
        </h2>
        <p class="dl-live-note">
          Watch any game in progress. No account needed, no seat taken.
        </p>
      </div>
      ${g === null
        ? html`<p class="dl-quiet dl-live-empty">
            ${this.failed
              ? "Can't see the games being played just now."
              : "Looking for games…"}
          </p>`
        : count === 0
          ? html`<p class="dl-quiet dl-live-empty">
              Nobody's playing right now. Start a game, and others can watch it
              here.
            </p>`
          : html`<ul class="dl-live-grid">
              ${g.derpyfront.map((x) => this.frontCard(x))}
              ${g.conquest.map((x) => this.conquestCard(x))}
            </ul>`}
    </section>`;
  }

  private watchers(n: number): TemplateResult | typeof nothing {
    return n > 0
      ? html`<span class="dl-live-watching">${eye()} ${n} watching</span>`
      : nothing;
  }

  private watchButton(href: string, full: boolean, what: string) {
    return full
      ? html`<span class="dl-live-full" title="As many are watching as may"
          >Full</span
        >`
      : html`<a class="dl-btn small dl-live-watch" href=${href}
          >${eye()} Watch<span class="dl-sr"> ${what}</span></a
        >`;
  }

  private frontCard(x: LiveFrontGame): TemplateResult {
    return html`<li class="dl-live-card derpyfront">
      <span class="dl-live-thumb">
        <img
          src=${x.thumb ??
          `/maps/${encodeURIComponent(x.mapKey)}/thumbnail.webp`}
          alt=""
          loading="lazy"
          @error=${(e: Event) =>
            ((e.target as HTMLImageElement).style.visibility = "hidden")}
        />
      </span>
      <span class="dl-live-body">
        <span class="dl-live-game"
          >DerpyFront${x.private
            ? html`<span class="dl-live-tag">Private</span>`
            : nothing}</span
        >
        <b class="dl-live-title">${x.scenario ?? x.map}</b>
        <span class="dl-live-meta"
          >${MODES[x.mode] ?? x.mode} · ${this.since(x.startedAt)}</span
        >
        <span class="dl-live-meta"
          ><b>${x.playersLeft}</b> of ${x.players}
          ${x.players === 1 ? "player" : "players"} left
          ${this.watchers(x.watchers)}</span
        >
      </span>
      ${this.watchButton(
        `/game/${encodeURIComponent(x.id)}?spectate`,
        x.full,
        `the DerpyFront game on ${x.map}`,
      )}
    </li>`;
  }

  private conquestCard(x: LiveRoom): TemplateResult {
    const who = x.players.map((p) => p.name);
    const peoples = [
      ...new Set(x.players.flatMap((p) => (p.origin ? [p.origin] : []))),
    ];
    return html`<li class="dl-live-card conquest">
      <span class="dl-live-thumb conquest">
        <span class="dl-live-year">${x.year}</span>
      </span>
      <span class="dl-live-body">
        <span class="dl-live-game"
          >Derpy
          Conquest${!x.open
            ? html`<span class="dl-live-tag"
                >${x.solo ? "Solo" : "Private"}</span
              >`
            : nothing}</span
        >
        <b class="dl-live-title">${x.title}</b>
        <span class="dl-live-meta"
          >${x.date}${x.paused ? " (paused)" : ""} ·
          ${this.since(x.startedAt)}</span
        >
        <span class="dl-live-meta"
          >${who.join(", ")}${peoples.length
            ? html` <span class="dl-live-peoples"
                >(${peoples.map((p) => nationName(p)).join(", ")})</span
              >`
            : nothing}
          ${this.watchers(x.watchers)}</span
        >
      </span>
      ${this.watchButton(
        `/conquest?watch=${encodeURIComponent(x.watchId)}`,
        x.full,
        `the Derpy Conquest game ${x.title}`,
      )}
    </li>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-live": DerpLive;
  }
}
