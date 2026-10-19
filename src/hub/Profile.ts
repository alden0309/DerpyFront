// A player's page: their stats in both games and every saved game, with
// DerpyFront replays. /account shows yours; /player/<name> anyone's.

import { html, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, ApiError, signOut } from "../derpland/Account";
import { openSignIn } from "../derpland/DerpBar";
import {
  coinIcon,
  crownIcon,
  penIcon,
  replayIcon,
  scrollIcon, // LEGACY (r21)
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
import "./Friends"; // FRIENDS (r25)
import { HubPage } from "./HubPage";
import "./Rename"; // NAMES (r20)
import type { DerpRename } from "./Rename";

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
  /** LEGACY (r21): the characters the line was. */
  chars?: string[];
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
/** MAP (r12): a Derpy Conquest achievement the player has earned. */
interface ConquestAchievement {
  key: string;
  name: string;
  how: string;
  group: string;
  coins: number;
  at: string;
  /** CQACH (r22): "hard" or "rare". */
  tier?: string;
}
interface Profile {
  username: string;
  coins: number;
  createdAt: string;
  stats: FrontStats;
  games: FrontGame[];
  conquest: {
    stats: ConquestStats;
    games: ConquestGame[];
    achievements?: ConquestAchievement[];
    achievementCount?: number;
  };
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

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHash);
  }

  disconnectedCallback(): void {
    window.removeEventListener("hashchange", this.onHash);
    super.disconnectedCallback();
  }

  /** NAMES (r20): the account menu's "Change username" (#username) opens the form. */
  private renameAsked = location.hash === "#username";
  private onHash = () => {
    if (location.hash === "#username") {
      this.renameAsked = true;
      this.requestUpdate();
    }
  };

  private openRename(): void {
    void this.querySelector<DerpRename>("dl-rename")?.open();
  }

  protected updated(): void {
    if (!this.renameAsked || !this.profile) return;
    if (this.isMine(this.profile)) {
      this.renameAsked = false;
      this.openRename();
    }
  }

  private isMine(p: Profile): boolean {
    return (
      this.username !== null &&
      p.username.toLowerCase() === this.username.toLowerCase()
    );
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
        // NAMES (r20): a name given up lately still finds its player; the
        // address takes the name they have now.
        if (!this.self && p.username.toLowerCase() !== who.toLowerCase()) {
          this.name = p.username;
          history.replaceState(
            null,
            "",
            `/player/${encodeURIComponent(p.username)}`,
          );
        }
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
    const mine = this.isMine(p);
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
          ${!mine && this.username
            ? // FRIENDS (r25): where they are, and being friends.
              html`<dl-friend-status
                .username=${p.username}
              ></dl-friend-status>`
            : nothing}
        </div>
        ${mine
          ? html`<div class="dl-player-actions">
              <!-- NAMES (r20) -->
              <button class="dl-btn ghost" @click=${() => this.openRename()}>
                ${penIcon()} Change username
              </button>
              <button
                class="dl-btn ghost"
                @click=${() => {
                  void signOut().then(() => location.assign("/"));
                }}
              >
                ${signOutIcon()} Sign out
              </button>
            </div>`
          : nothing}
      </header>
      ${this.username
        ? // NAMES (r20): kept while the page reloads under the new name.
          html`<dl-rename></dl-rename>`
        : nothing}
      ${mine
        ? // FRIENDS (r25): your friends, and what they played lately.
          html`<dl-friends></dl-friends>`
        : nothing}
      <div class="dl-statgroups">
        ${this.frontStats(p.stats)} ${this.conquestStats(p.conquest.stats)}
      </div>
      ${this.achievements(p)}

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

  /** MAP (r12): the Derpy Conquest achievements this player has earned. */
  private achievements(p: Profile): TemplateResult {
    const got = p.conquest.achievements ?? [];
    const all = p.conquest.achievementCount ?? 0;
    if (!all) return html``;
    const coins = got.reduce((n, a) => n + a.coins, 0);
    return html`<section class="dl-panel dl-achievements">
      <h2 class="dl-h2 dl-ach-title">
        Derpy Conquest achievements
        <span class="dl-ach-count"
          >${got.length} of
          ${all}${coins ? html` · ${nf(coins)} coins` : ""}</span
        >
      </h2>
      <!-- CQACH (r22): these are the account's (overall); the rule. -->
      <p class="dl-ach-rule">
        The account's overall achievements, across every game it plays: earned
        only in games on Hard, each paying its coins once (any earned before
        stay). Every game also has its own achievements, which pay Derp Coins in
        that game on any difficulty.
      </p>
      ${got.length
        ? html`<ul class="dl-ach-list">
            ${got.map(
              (a) =>
                html`<li
                  class="dl-ach ${a.tier ?? ""}"
                  title="${a.how} Earned ${shortDate(a.at)}${a.coins
                    ? `, ${a.coins} coins`
                    : ""}${a.tier ? ` (${a.tier})` : ""}."
                >
                  <span class="dl-ach-medal" aria-hidden="true"></span>
                  <span class="dl-ach-name">${a.name}</span>
                  ${a.coins
                    ? html`<span class="dl-ach-coins">+${a.coins}</span>`
                    : ""}
                </li>`,
            )}
          </ul>`
        : html`<p class="dl-empty">
            None yet. Each one pays a few Derp Coins the first time it's earned
            in a game on Hard, from your first job to living to see 1776.
          </p>`}
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
      ${g.chars?.length
        ? // LEGACY (r21): every character the line was.
          html`<span class="dl-game-chars">${g.chars.join(" → ")}</span>`
        : nothing}
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
    <!-- LEGACY (r21): the game's page: every character, every chronicle. -->
    <a
      class="dl-btn small ghost"
      href="/chronicle/${encodeURIComponent(g.gameId)}"
      >${scrollIcon()} Story</a
    >
  </li>`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]} place`;
}
