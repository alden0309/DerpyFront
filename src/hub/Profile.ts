// A player's page: their stats in both games and every saved game, with
// DerpyFront replays. /account shows yours; /player/<name> anyone's.

import { html, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, ApiError, signOut } from "../derpland/Account";
import { openSignIn } from "../derpland/DerpBar";
import {
  coinIcon,
  crownIcon,
  replayIcon,
  signOutIcon,
  tokenColor,
} from "../derpland/Icons";
import {
  AWARD_NAMES,
  DIFFICULTY_NAMES,
  duration,
  gold,
  nationName,
  nf,
  shortDate,
} from "./format";
import { HubPage } from "./HubPage";

interface FrontStats {
  games: number;
  wins: number;
  bestTerritoryPct: number;
  goldEarned: string;
  mostGoldInAGame: string;
  conquests: number;
  ships: number;
  betrayals: number;
  nukes: number;
  mvps: number;
  awards: number;
  coinsEarned: number;
}
interface FrontGame {
  gameId: string;
  map: string;
  mode: string;
  endedAt: string;
  durationS: number;
  numPlayers: number;
  won: boolean;
  peakTerritoryPct: number;
  goldEarned: string;
  awards: string[];
  coins: number;
}
interface ConquestStats {
  games: number;
  wins: number;
  bestScore: number;
  mostProvinces: number;
  colonies: number;
  battlesWon: number;
  conquests: number;
  coinsEarned: number;
}
interface ConquestGame {
  gameId: string;
  endedAt: string;
  durationS: number;
  finalYear: number;
  difficulty: string;
  numPlayers: number;
  nation: string;
  won: boolean;
  rank: number;
  score: number;
  provinces: number;
  coins: number;
}
interface Profile {
  username: string;
  coins: number;
  createdAt: string;
  stats: FrontStats;
  games: FrontGame[];
  conquest: { stats: ConquestStats; games: ConquestGame[] };
}

type Filter = "all" | "derpyfront" | "conquest";

@customElement("dl-profile")
export class DerpProfile extends HubPage {
  /** Show the signed-in player's own page. */
  @property({ type: Boolean }) self = false;
  @property({ type: String }) name = "";

  @state() private profile: Profile | null = null;
  @state() private error: string | null = null;
  @state() private filter: Filter = "all";

  private who(): string | null {
    return this.self ? this.username : this.name;
  }

  protected async load(): Promise<void> {
    const who = this.who();
    this.error = null;
    if (!who) {
      this.profile = null;
      return;
    }
    try {
      const p = await api<Profile>(`/players/${encodeURIComponent(who)}`);
      if (this.who() === who) {
        this.profile = p;
        document.title = `${p.username} · Derp Land`;
      }
    } catch (e) {
      this.profile = null;
      this.error =
        e instanceof ApiError && e.code === "not_found"
          ? `There's no player called ${who}.`
          : e instanceof ApiError && e.code === "accounts_unavailable"
            ? "Player pages aren't available on this server."
            : "Couldn't load this player. Refresh to try again.";
    }
  }

  protected accountChanged(): void {
    if (this.self) void this.refreshAccount().then(() => this.load());
  }

  render(): TemplateResult {
    if (this.self && !this.username) {
      return html`<div class="dl-panel dl-empty dl-signin-card">
        <h1 class="dl-h1">Your account</h1>
        <p>
          Sign in to see your stats and replays from DerpyFront and Derpy
          Conquest.
        </p>
        <div class="dl-row">
          <button class="dl-btn" @click=${() => openSignIn()}>Sign in</button>
          <button class="dl-btn ghost" @click=${() => openSignIn("create")}>
            Make an account
          </button>
        </div>
      </div>`;
    }
    if (this.error) return html`<p class="dl-panel dl-quiet">${this.error}</p>`;
    const p = this.profile;
    if (!p) return html`<p class="dl-quiet">Loading…</p>`;
    const mine =
      this.username !== null &&
      p.username.toLowerCase() === this.username.toLowerCase();
    return html`
      <header class="dl-player">
        <span class="dl-token huge" style="--token:${tokenColor(p.username)}"
          >${p.username.slice(0, 1).toUpperCase()}</span
        >
        <div class="dl-player-text">
          <h1 class="dl-h1">${p.username}</h1>
          <p class="dl-lede">
            Joined ${shortDate(p.createdAt)}.
            <span class="dl-inline-coins"
              >${coinIcon("dl-coin")} ${nf(p.coins)}</span
            >
            Derp Coins in the bank.
          </p>
        </div>
        ${mine
          ? html`<button
              class="dl-btn ghost dl-signout"
              @click=${() => {
                void signOut().then(() => location.assign("/"));
              }}
            >
              ${signOutIcon()} Sign out
            </button>`
          : nothing}
      </header>

      <div class="dl-statgroups">
        ${this.frontStats(p.stats)} ${this.conquestStats(p.conquest.stats)}
      </div>

      <section class="dl-panel dl-history">
        <div class="dl-history-head">
          <h2 class="dl-h2">Games</h2>
          <div class="dl-seg small" role="tablist" aria-label="Which game">
            ${(
              [
                ["all", "Both"],
                ["derpyfront", "DerpyFront"],
                ["conquest", "Derpy Conquest"],
              ] as [Filter, string][]
            ).map(
              ([f, label]) =>
                html`<button
                  role="tab"
                  aria-selected=${this.filter === f}
                  @click=${() => (this.filter = f)}
                >
                  ${label}
                </button>`,
            )}
          </div>
        </div>
        ${this.renderGames(p)}
      </section>
    `;
  }

  private frontStats(s: FrontStats): TemplateResult {
    const any = s.games > 0;
    const rate = `${Math.round((s.wins / Math.max(1, s.games)) * 100)}% of games`;
    return html`<section class="dl-statgroup front">
      <h2 class="dl-statgroup-title">DerpyFront</h2>
      <dl class="dl-stats">
        ${stat("Games", s.games)}
        ${stat("Wins", s.wins, any ? rate : undefined)}
        ${stat(
          "Best land",
          `${s.bestTerritoryPct}%`,
          any ? "of the map at once" : undefined,
        )}
        ${stat(
          "Gold earned",
          gold(s.goldEarned),
          any ? `${gold(s.mostGoldInAGame)} in one game` : undefined,
        )}
        ${stat("Conquests", s.conquests, any ? "players wiped out" : undefined)}
        ${stat("Ships", s.ships)} ${stat("Betrayals", s.betrayals)}
        ${stat("Nukes", s.nukes)} ${stat("MVPs", s.mvps)}
        ${stat("Coins earned", nf(s.coinsEarned))}
      </dl>
    </section>`;
  }

  private conquestStats(s: ConquestStats): TemplateResult {
    const any = s.games > 0;
    const rate = `${Math.round((s.wins / Math.max(1, s.games)) * 100)}% of games`;
    return html`<section class="dl-statgroup conquest">
      <h2 class="dl-statgroup-title">Derpy Conquest</h2>
      <dl class="dl-stats">
        ${stat("Games", s.games)}
        ${stat("Wins", s.wins, any ? rate : undefined)}
        ${stat("Best score", nf(s.bestScore))}
        ${stat(
          "Most provinces",
          s.mostProvinces,
          any ? "held at once" : undefined,
        )}
        ${stat("Colonies founded", s.colonies)}
        ${stat("Battles won", s.battlesWon)}
        ${stat("Provinces taken", s.conquests)}
        ${stat("Coins earned", nf(s.coinsEarned))}
      </dl>
    </section>`;
  }

  private renderGames(p: Profile): TemplateResult {
    const rows: { at: string; row: TemplateResult }[] = [];
    if (this.filter !== "conquest") {
      for (const g of p.games) rows.push({ at: g.endedAt, row: frontRow(g) });
    }
    if (this.filter !== "derpyfront") {
      for (const g of p.conquest.games)
        rows.push({ at: g.endedAt, row: conquestRow(g) });
    }
    if (rows.length === 0) {
      return html`<p class="dl-quiet">
        No finished games yet. Games you finish signed in show up here.
      </p>`;
    }
    rows.sort((a, b) => b.at.localeCompare(a.at));
    return html`<ol class="dl-games">
      ${rows.map((r) => r.row)}
    </ol>`;
  }
}

function stat(label: string, value: string | number, note?: string) {
  return html`<div class="dl-stat">
    <dt>${label}</dt>
    <dd>${value}</dd>
    ${note ? html`<dd class="dl-stat-note">${note}</dd>` : nothing}
  </div>`;
}

function result(won: boolean, lost: string): TemplateResult {
  return won
    ? html`<span class="dl-result won">${crownIcon("dl-i")} Won</span>`
    : html`<span class="dl-result">${lost}</span>`;
}

function frontRow(g: FrontGame): TemplateResult {
  return html`<li class="dl-game front">
    <div class="dl-game-main">
      <span class="dl-game-title">${g.map}</span>
      <span class="dl-game-meta"
        >DerpyFront, ${shortDate(g.endedAt)}, ${duration(g.durationS)},
        ${g.numPlayers} ${g.numPlayers === 1 ? "player" : "players"}</span
      >
    </div>
    ${result(g.won, `${g.peakTerritoryPct}% land`)}
    <span class="dl-game-awards">
      ${g.awards.map(
        (a) => html`<span class="dl-award">${AWARD_NAMES[a] ?? a}</span>`,
      )}
    </span>
    <span class="dl-game-coins">+${nf(g.coins)} ${coinIcon("dl-coin sm")}</span>
    <a class="dl-btn small ghost" href="/game/${encodeURIComponent(g.gameId)}"
      >${replayIcon()} Replay</a
    >
  </li>`;
}

function conquestRow(g: ConquestGame): TemplateResult {
  return html`<li class="dl-game conquest">
    <div class="dl-game-main">
      <span class="dl-game-title">As ${nationName(g.nation)}</span>
      <span class="dl-game-meta"
        >Derpy Conquest, ${shortDate(g.endedAt)}, played to ${g.finalYear},
        ${DIFFICULTY_NAMES[g.difficulty] ?? g.difficulty}</span
      >
    </div>
    ${result(g.won, ordinal(g.rank))}
    <span class="dl-game-awards"
      ><span class="dl-award plain">${nf(g.score)} points</span
      ><span class="dl-award plain"
        >${g.provinces} ${g.provinces === 1 ? "province" : "provinces"}</span
      ></span
    >
    <span class="dl-game-coins">+${nf(g.coins)} ${coinIcon("dl-coin sm")}</span>
    <span class="dl-game-spacer"></span>
  </li>`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]} place`;
}
