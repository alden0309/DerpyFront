import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import {
  DerpyApiError,
  DerpyGameSummary,
  DerpyProfile,
  derpyProfile,
  replayHref,
} from "./DerpyAccount";
import {
  awardLabel,
  coinAmount,
  duration,
  gold,
  mapName,
  shortDate,
  statTile,
} from "./DerpyUi";

/**
 * One player's stats and saved games, each with a replay link. Used on your
 * own account page and when you pick someone on the leaderboard.
 */
@customElement("derpy-profile-view")
export class DerpyProfileView extends LitElement {
  @property({ type: String }) username = "";

  @state() private profile: DerpyProfile | null = null;
  @state() private error: string | null = null;
  @state() private loading = false;

  private loadedFor = "";

  createRenderRoot() {
    return this;
  }

  protected willUpdate(): void {
    if (this.username && this.username !== this.loadedFor) {
      void this.load();
    }
  }

  /** Fetch again (after a game, say). */
  async reload(): Promise<void> {
    this.loadedFor = "";
    await this.load();
  }

  private async load(): Promise<void> {
    const username = this.username;
    this.loadedFor = username;
    this.loading = true;
    this.error = null;
    try {
      const p = await derpyProfile(username);
      if (this.username === username) this.profile = p;
    } catch (err) {
      if (this.username !== username) return;
      this.profile = null;
      this.error =
        err instanceof DerpyApiError && err.code === "not_found"
          ? translateText("derpy.player_not_found")
          : translateText("derpy.load_failed");
    } finally {
      if (this.username === username) this.loading = false;
    }
  }

  render() {
    if (this.error) {
      return html`<p class="p-6 text-center text-white/60">${this.error}</p>`;
    }
    const p = this.profile;
    if (
      p === null ||
      p.username.toLowerCase() !== this.username.toLowerCase()
    ) {
      return html`<p class="p-6 text-center text-white/50">
        ${translateText("derpy.loading")}
      </p>`;
    }
    const s = p.stats;
    const winRate =
      s.games > 0 ? Math.round((s.wins * 100) / s.games) + "%" : "–";
    return html`
      <div class="flex flex-col gap-6 p-4 lg:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="flex flex-col">
            <span class="text-3xl font-black text-white">${p.username}</span>
            <span class="text-sm text-white/50"
              >${translateText("derpy.joined", {
                date: shortDate(p.createdAt),
              })}</span
            >
          </div>
          <div
            class="flex items-center gap-2 rounded-full border border-cyber-yellow/30 bg-cyber-yellow/10 px-4 py-1.5"
          >
            ${coinAmount(p.coins, "text-lg")}
            <span class="text-sm text-white/60"
              >${translateText("derpy.derp_coins")}</span
            >
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          ${statTile(translateText("derpy.stat_games"), s.games)}
          ${statTile(
            translateText("derpy.stat_wins"),
            s.wins,
            translateText("derpy.win_rate", { rate: winRate }),
          )}
          ${statTile(
            translateText("derpy.stat_best_territory"),
            `${s.bestTerritoryPct}%`,
          )}
          ${statTile(
            translateText("derpy.stat_gold_earned"),
            gold(s.goldEarned),
            translateText("derpy.most_in_one_game", {
              gold: gold(s.mostGoldInAGame),
            }),
          )}
          ${statTile(translateText("derpy.stat_conquests"), s.conquests)}
          ${statTile(translateText("derpy.stat_ships"), s.ships)}
          ${statTile(translateText("derpy.stat_betrayals"), s.betrayals)}
          ${statTile(translateText("derpy.stat_nukes"), s.nukes)}
          ${statTile(translateText("derpy.stat_mvps"), s.mvps)}
          ${statTile(translateText("derpy.stat_awards"), s.awards)}
          ${statTile(
            translateText("derpy.stat_coins_earned"),
            s.coinsEarned.toLocaleString(),
          )}
        </div>

        <section class="flex flex-col gap-3">
          <h3 class="m-0 text-lg font-bold text-white">
            ${translateText("derpy.saved_games")}
          </h3>
          ${p.games.length === 0
            ? html`<p
                class="m-0 rounded-xl border border-dashed border-white/15 p-6 text-center text-white/50"
              >
                ${translateText("derpy.no_games")}
              </p>`
            : html`<ul class="m-0 flex list-none flex-col gap-2 p-0">
                ${p.games.map((g) => this.gameRow(g))}
              </ul>`}
        </section>
      </div>
    `;
  }

  private gameRow(g: DerpyGameSummary): TemplateResult {
    return html`<li
      class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
    >
      <span
        class="w-14 shrink-0 text-center text-xs font-black uppercase tracking-wide ${g.won
          ? "text-emerald-300"
          : "text-white/40"}"
        >${g.won
          ? translateText("derpy.won")
          : translateText("derpy.lost")}</span
      >
      <div class="flex min-w-40 flex-1 flex-col">
        <span class="font-semibold text-white">${mapName(g.map)}</span>
        <span class="text-xs text-white/50"
          >${shortDate(g.endedAt)} · ${duration(g.durationS)} ·
          ${translateText("derpy.players_count", { count: g.numPlayers })}</span
        >
      </div>
      <div class="flex flex-col text-sm text-white/70">
        <span
          >${translateText("derpy.game_territory", {
            pct: g.peakTerritoryPct,
          })}</span
        >
        <span
          >${translateText("derpy.game_gold", {
            gold: gold(g.goldEarned),
          })}</span
        >
      </div>
      <div class="flex flex-wrap gap-1">
        ${g.awards.map(
          (a) =>
            html`<span
              class="rounded-full bg-cyber-yellow/15 px-2 py-0.5 text-xs font-semibold text-cyber-yellow"
              >${awardLabel(a)}</span
            >`,
        )}
      </div>
      <span class="ml-auto">${coinAmount(g.coins)}</span>
      <a
        href=${replayHref(g.gameId)}
        class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-white/20"
        >${translateText("derpy.watch_replay")}</a
      >
    </li>`;
  }
}
