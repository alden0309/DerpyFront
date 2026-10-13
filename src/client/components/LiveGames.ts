// Derp Land (SITE r19): the DerpyFront games being played right now that
// anyone may watch, under the play buttons. Watching joins as a spectator
// (no seat, no say). Hidden while nothing's being played.

import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { timeIn, watchLive } from "../../derpland/LiveFeed";
import type { LiveFrontGame, LiveGames } from "../../derpland/LiveTypes";
import { getMapName, translateText } from "../Utils";

@customElement("derpy-live-games")
export class DerpyLiveGames extends LitElement {
  @state() private games: LiveFrontGame[] = [];
  private serverTime = 0;
  private fetchedAt = 0;
  private stop: (() => void) | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.stop = watchLive((g: LiveGames | null) => {
      if (g === null) return;
      this.serverTime = g.serverTime;
      this.fetchedAt = Date.now();
      this.games = g.derpyfront;
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stop?.();
    this.stop = null;
  }

  private timeText(g: LiveFrontGame): string {
    const t = timeIn(g.startedAt, this.serverTime, this.fetchedAt);
    return t.hours > 0
      ? translateText("live_games.hours_in", {
          hours: t.hours,
          minutes: t.minutes,
        })
      : translateText("live_games.minutes_in", { minutes: t.minutes });
  }

  render(): TemplateResult | typeof nothing {
    if (this.games.length === 0) return nothing;
    return html`<section
      class="flex flex-col gap-2 w-full px-4 sm:px-0"
      aria-label=${translateText("live_games.title")}
    >
      <h2
        class="m-0 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/70"
      >
        <span
          class="inline-block size-2 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]"
          aria-hidden="true"
        ></span>
        ${translateText("live_games.title")}
      </h2>
      <ul class="m-0 p-0 list-none flex flex-col gap-2">
        ${this.games.map((g) => this.row(g))}
      </ul>
    </section>`;
  }

  private row(g: LiveFrontGame): TemplateResult {
    const name = getMapName(g.map) ?? g.map;
    return html`<li
      class="flex items-center gap-3 rounded-lg border border-white/10 bg-surface/80 p-2 pr-3"
    >
      <img
        class="h-11 w-16 shrink-0 rounded object-cover bg-black/40"
        src=${assetUrl(`maps/${encodeURIComponent(g.mapKey)}/thumbnail.webp`)}
        alt=""
        loading="lazy"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 min-w-0">
          <span class="truncate font-semibold text-white">${name}</span>
          ${g.private
            ? html`<span
                class="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70"
                >${translateText("live_games.private")}</span
              >`
            : nothing}
        </div>
        <div class="truncate text-xs text-white/60">
          ${this.timeText(g)} ·
          ${translateText("live_games.players_left", {
            left: g.playersLeft,
            total: g.players,
          })}${g.watchers > 0
            ? html` ·
              ${translateText("live_games.watching_count", {
                count: g.watchers,
              })}`
            : nothing}
        </div>
      </div>
      ${g.full
        ? html`<span
            class="shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/50"
            >${translateText("live_games.full")}</span
          >`
        : html`<a
            class="shrink-0 rounded-md bg-malibu-blue px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white no-underline hover:bg-aquarius"
            href=${`/game/${encodeURIComponent(g.id)}?spectate`}
            >${translateText("live_games.watch")}</a
          >`}
    </li>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "derpy-live-games": DerpyLiveGames;
  }
}
