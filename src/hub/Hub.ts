// Derp Land: the front page of the site. Pick a game, sign in (one account
// for every game), and see who's winning.

import {
  html,
  LitElement,
  nothing,
  svg,
  SVGTemplateResult,
  TemplateResult,
} from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  api,
  AUTH_ERROR_TEXT,
  AuthError,
  createAccount,
  DERPY_ACCOUNT_EVENT,
  derpyUsername,
  formatCoins,
  me,
  signIn,
  signOut,
} from "../derpland/Account";

export const SOURCE_CODE_URL =
  "https://github.com/alden0309/DerpyFront/tree/capital-mod";
export const CREDITS = [
  "Made by: Alden",
  "Taped by Michael",
  "Robert'd by Gary",
] as const;

type Board = "overall" | "derpyfront" | "conquest";

interface OverallRow {
  username: string;
  coins: number;
  games: number;
  wins: number;
  derpyFrontGames: number;
  derpyFrontWins: number;
  conquestGames: number;
  conquestWins: number;
  coinsEarned: number;
}
interface FrontRow {
  username: string;
  coins: number;
  games: number;
  wins: number;
  bestTerritoryPct: number;
  goldEarned: string;
  conquests: number;
  mvps: number;
  coinsEarned: number;
}
interface ConquestRow {
  username: string;
  coins: number;
  games: number;
  wins: number;
  bestScore: number;
  mostProvinces: number;
  colonies: number;
  battlesWon: number;
  conquests: number;
  coinsEarned: number;
}
type Row = OverallRow | FrontRow | ConquestRow;

interface Profile {
  username: string;
  coins: number;
  createdAt: string;
  stats: FrontRow & { ships: number; nukes: number; betrayals: number };
  games: {
    gameId: string;
    map: string;
    endedAt: string;
    won: boolean;
    peakTerritoryPct: number;
    coins: number;
    numPlayers: number;
  }[];
  conquest: {
    stats: Omit<ConquestRow, "username" | "coins">;
    games: {
      gameId: string;
      endedAt: string;
      finalYear: number;
      nation: string;
      won: boolean;
      rank: number;
      score: number;
      provinces: number;
      coins: number;
      difficulty: string;
    }[];
  };
}

const NATION_NAMES: Record<string, string> = {
  england: "England",
  france: "France",
  spain: "Spain",
  portugal: "Portugal",
  netherlands: "The Netherlands",
  sweden: "Sweden",
};

const nf = (n: number | string) => Number(n).toLocaleString("en-US");
const shortGold = (s: string) => {
  const n = Number(s);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
};

@customElement("derp-land")
export class DerpLand extends LitElement {
  @state() private username: string | null = derpyUsername();
  @state() private coins: number | null = null;
  @state() private authMode: "signin" | "create" = "create";
  @state() private authError: string | null = null;
  @state() private authBusy = false;
  @state() private board: Board = "overall";
  @state() private rows: Row[] | null = null;
  @state() private boardError: string | null = null;
  @state() private profile: Profile | null = null;
  @state() private profileLoading: string | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    void this.refreshMe();
    void this.loadBoard(this.board);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
  }

  private onAccount = () => {
    this.username = derpyUsername();
    void this.refreshMe();
    void this.loadBoard(this.board);
  };

  private async refreshMe(): Promise<void> {
    const m = await me();
    this.coins = m?.coins ?? null;
    if (m) this.username = m.username;
  }

  private async loadBoard(board: Board): Promise<void> {
    this.board = board;
    this.boardError = null;
    try {
      const res = await api<{ players: Row[] }>(`/leaderboard?game=${board}`);
      if (this.board === board) this.rows = res.players;
    } catch (err) {
      this.rows = [];
      this.boardError =
        (err as { code?: string }).code === "accounts_unavailable"
          ? "Accounts aren't set up on this server yet."
          : "Couldn't load the leaderboard.";
    }
  }

  private async openProfile(username: string): Promise<void> {
    this.profileLoading = username;
    try {
      this.profile = await api<Profile>(
        `/players/${encodeURIComponent(username)}`,
      );
    } catch {
      this.profile = null;
    }
    this.profileLoading = null;
  }

  private async submitAuth(e: Event): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "");
    const password = String(data.get("password") ?? "");
    this.authBusy = true;
    this.authError = null;
    const err: AuthError | null =
      this.authMode === "create"
        ? await createAccount(username, password)
        : await signIn(username, password);
    this.authBusy = false;
    if (err) this.authError = AUTH_ERROR_TEXT[err];
    else form.reset();
  }

  render(): TemplateResult {
    return html`
      <div class="dl-page">
        <header class="dl-header">
          <a href="/" class="dl-brand"
            ><span class="dl-logo-mark">🚩</span> Derp Land</a
          >
          <nav class="dl-nav">
            <a href="#games">Games</a>
            <a href="#leaderboard">Leaderboard</a>
            ${this.username
              ? html`<span class="dl-me">
                  <b>${this.username}</b>${this.coins !== null
                    ? html` · 🪙 ${formatCoins(this.coins)}`
                    : nothing}
                </span>`
              : html`<a href="#account" class="dl-nav-cta">Sign in</a>`}
          </nav>
        </header>

        <section class="dl-hero">
          <h1 class="dl-title">Derp Land</h1>
          <p class="dl-tagline">
            Two games, one account, one pile of Derp Coins. Bragging rights
            included.
          </p>
        </section>

        <section id="games" class="dl-games">
          <a class="dl-game dl-game-front" href="/derpyfront">
            <div class="dl-game-art">${frontArt()}</div>
            <div class="dl-game-body">
              <h2>DerpyFront</h2>
              <p>
                Grab the whole map in real time. Build cities, ports and a
                Capital, sign trade deals, then betray everyone.
              </p>
              <span class="dl-play">Play DerpyFront →</span>
            </div>
          </a>
          <a class="dl-game dl-game-conquest" href="/conquest">
            <div class="dl-game-art">${conquestArt()}</div>
            <div class="dl-game-body">
              <span class="dl-new">New</span>
              <h2>Derpy Conquest</h2>
              <p>
                Colonize the Americas from 1607. Settle the wilderness, trade
                with native nations, and outfight rival empires.
              </p>
              <span class="dl-play">Play Derpy Conquest →</span>
            </div>
          </a>
        </section>

        <section class="dl-row">
          <div id="account" class="dl-card dl-account">
            ${this.renderAccount()}
          </div>
          <div class="dl-card dl-coins">
            <h2 class="dl-h2">🪙 Derp Coins</h2>
            <p>
              Every game you finish signed in pays Derp Coins: more for winning,
              conquering and doing well. They're the same coins in both games.
            </p>
            <p>
              Spend them on territory skins in the
              <a href="/derpyfront#modal=store">Derp Store</a>.
            </p>
          </div>
        </section>

        <section id="leaderboard" class="dl-card dl-board">
          <div class="dl-board-head">
            <h2 class="dl-h2">Leaderboard</h2>
            <div class="dl-tabs" role="tablist">
              ${(["overall", "derpyfront", "conquest"] as Board[]).map(
                (b) =>
                  html`<button
                    role="tab"
                    aria-selected=${this.board === b}
                    class="dl-tab ${this.board === b ? "on" : ""}"
                    @click=${() => this.loadBoard(b)}
                  >
                    ${b === "overall"
                      ? "Overall"
                      : b === "derpyfront"
                        ? "DerpyFront"
                        : "Derpy Conquest"}
                  </button>`,
              )}
            </div>
          </div>
          ${this.renderBoard()}
        </section>

        ${this.renderFooter()}
      </div>
      ${this.profile || this.profileLoading ? this.renderProfile() : nothing}
    `;
  }

  private renderAccount(): TemplateResult {
    if (this.username) {
      return html`<h2 class="dl-h2">Your account</h2>
        <p class="dl-big">Signed in as <b>${this.username}</b></p>
        <p>
          ${this.coins !== null
            ? html`You have <b>🪙 ${formatCoins(this.coins)}</b> Derp Coins.`
            : nothing}
          This account works in DerpyFront and Derpy Conquest.
        </p>
        <div class="dl-buttons">
          <button
            class="dl-btn"
            @click=${() => this.openProfile(this.username!)}
          >
            My stats
          </button>
          <button class="dl-btn-ghost" @click=${() => signOut()}>
            Sign out
          </button>
        </div>`;
    }
    const create = this.authMode === "create";
    return html`<h2 class="dl-h2">${create ? "Make an account" : "Sign in"}</h2>
      <p class="dl-muted">
        Free and open to anyone. One account for every Derp Land game: your
        stats, Derp Coins and skins follow you.
      </p>
      <form class="dl-form" @submit=${(e: Event) => this.submitAuth(e)}>
        <label>
          <span>Username</span>
          <input
            name="username"
            autocomplete="username"
            required
            minlength="3"
            maxlength="20"
            pattern="[A-Za-z0-9_]+"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            name="password"
            type="password"
            autocomplete=${create ? "new-password" : "current-password"}
            required
            minlength="6"
          />
        </label>
        ${this.authError
          ? html`<p class="dl-error">${this.authError}</p>`
          : nothing}
        <button class="dl-btn" ?disabled=${this.authBusy}>
          ${create ? "Create account" : "Sign in"}
        </button>
      </form>
      <p class="dl-muted">
        ${create ? "Already have one?" : "New here?"}
        <button
          class="dl-link"
          @click=${() => {
            this.authMode = create ? "signin" : "create";
            this.authError = null;
          }}
        >
          ${create ? "Sign in" : "Make an account"}
        </button>
      </p>`;
  }

  private renderBoard(): TemplateResult {
    if (this.boardError)
      return html`<p class="dl-muted">${this.boardError}</p>`;
    if (this.rows === null) return html`<p class="dl-muted">Loading…</p>`;
    const rows = this.rows.filter((r) => r.games > 0);
    if (rows.length === 0)
      return html`<p class="dl-muted">
        Nobody has finished a game yet. Be the first!
      </p>`;
    const nameCell = (r: Row, i: number) =>
      html`<td class="dl-rank">${i + 1}</td>
        <td>
          <button class="dl-link" @click=${() => this.openProfile(r.username)}>
            ${r.username}
          </button>
        </td>`;
    const mine = (r: Row) => (r.username === this.username ? "dl-mine" : "");
    if (this.board === "overall") {
      return html`<div class="dl-scroll">
        <table class="dl-table">
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Wins</th>
            <th>Games</th>
            <th>DerpyFront wins</th>
            <th>Conquest wins</th>
            <th>Coins earned</th>
            <th>Derp Coins</th>
          </tr>
          ${(rows as OverallRow[]).map(
            (r, i) =>
              html`<tr class=${mine(r)}>
                ${nameCell(r, i)}
                <td><b>${r.wins}</b></td>
                <td>${r.games}</td>
                <td>${r.derpyFrontWins}</td>
                <td>${r.conquestWins}</td>
                <td>${nf(r.coinsEarned)}</td>
                <td>🪙 ${nf(r.coins)}</td>
              </tr>`,
          )}
        </table>
      </div>`;
    }
    if (this.board === "derpyfront") {
      return html`<div class="dl-scroll">
        <table class="dl-table">
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Wins</th>
            <th>Games</th>
            <th>Win rate</th>
            <th>Best land</th>
            <th>Gold earned</th>
            <th>Conquests</th>
            <th>MVPs</th>
          </tr>
          ${(rows as FrontRow[]).map(
            (r, i) =>
              html`<tr class=${mine(r)}>
                ${nameCell(r, i)}
                <td><b>${r.wins}</b></td>
                <td>${r.games}</td>
                <td>${r.games ? Math.round((r.wins / r.games) * 100) : 0}%</td>
                <td>${r.bestTerritoryPct}%</td>
                <td>${shortGold(r.goldEarned)}</td>
                <td>${r.conquests}</td>
                <td>${r.mvps}</td>
              </tr>`,
          )}
        </table>
      </div>`;
    }
    return html`<div class="dl-scroll">
      <table class="dl-table">
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Wins</th>
          <th>Games</th>
          <th>Best score</th>
          <th>Most provinces</th>
          <th>Colonies</th>
          <th>Battles won</th>
          <th>Conquests</th>
        </tr>
        ${(rows as ConquestRow[]).map(
          (r, i) =>
            html`<tr class=${mine(r)}>
              ${nameCell(r, i)}
              <td><b>${r.wins}</b></td>
              <td>${r.games}</td>
              <td>${nf(r.bestScore)}</td>
              <td>${r.mostProvinces}</td>
              <td>${r.colonies}</td>
              <td>${r.battlesWon}</td>
              <td>${r.conquests}</td>
            </tr>`,
        )}
      </table>
    </div>`;
  }

  private renderProfile(): TemplateResult {
    const p = this.profile;
    const close = () => {
      this.profile = null;
      this.profileLoading = null;
    };
    return html`<div
      class="dl-modal-back"
      @click=${(e: Event) => e.target === e.currentTarget && close()}
    >
      <div class="dl-modal">
        <button class="dl-close" @click=${close}>×</button>
        ${!p
          ? html`<p>Loading ${this.profileLoading}…</p>`
          : html`<h2 class="dl-h2">${p.username}</h2>
              <p class="dl-muted">
                Joined ${new Date(p.createdAt).toLocaleDateString()} · 🪙
                ${nf(p.coins)} Derp Coins
              </p>
              <div class="dl-two">
                <div>
                  <h3>DerpyFront</h3>
                  <dl class="dl-stats">
                    <dt>Games</dt>
                    <dd>${p.stats.games}</dd>
                    <dt>Wins</dt>
                    <dd>${p.stats.wins}</dd>
                    <dt>Best land</dt>
                    <dd>${p.stats.bestTerritoryPct}%</dd>
                    <dt>Gold earned</dt>
                    <dd>${shortGold(p.stats.goldEarned)}</dd>
                    <dt>Conquests</dt>
                    <dd>${p.stats.conquests}</dd>
                    <dt>MVPs</dt>
                    <dd>${p.stats.mvps}</dd>
                  </dl>
                </div>
                <div>
                  <h3>Derpy Conquest</h3>
                  <dl class="dl-stats">
                    <dt>Games</dt>
                    <dd>${p.conquest.stats.games}</dd>
                    <dt>Wins</dt>
                    <dd>${p.conquest.stats.wins}</dd>
                    <dt>Best score</dt>
                    <dd>${nf(p.conquest.stats.bestScore)}</dd>
                    <dt>Most provinces</dt>
                    <dd>${p.conquest.stats.mostProvinces}</dd>
                    <dt>Colonies</dt>
                    <dd>${p.conquest.stats.colonies}</dd>
                    <dt>Battles won</dt>
                    <dd>${p.conquest.stats.battlesWon}</dd>
                  </dl>
                </div>
              </div>
              <h3>Recent games</h3>
              <ul class="dl-games-list">
                ${[
                  ...p.games.map((g) => ({
                    at: g.endedAt,
                    row: html`<li>
                      <span class="dl-tag">DerpyFront</span> ${g.map} ·
                      ${g.won ? "🏆 won" : `${g.peakTerritoryPct}% land`} · 🪙
                      ${g.coins} ·
                      <a href=${`/game/${encodeURIComponent(g.gameId)}`}
                        >replay</a
                      >
                    </li>`,
                  })),
                  ...p.conquest.games.map((g) => ({
                    at: g.endedAt,
                    row: html`<li>
                      <span class="dl-tag dl-tag-c">Conquest</span>
                      ${NATION_NAMES[g.nation] ?? g.nation} to ${g.finalYear} ·
                      ${g.won ? "🏆 won" : `#${g.rank}`} · score ${nf(g.score)}
                      · 🪙 ${g.coins}
                    </li>`,
                  })),
                ]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 25)
                  .map((x) => x.row)}
                ${p.games.length + p.conquest.games.length === 0
                  ? html`<li class="dl-muted">No games yet.</li>`
                  : nothing}
              </ul>`}
      </div>
    </div>`;
  }

  private renderFooter(): TemplateResult {
    return html`<footer class="dl-footer">
      <p class="dl-hey">Hey Buddy</p>
      <p class="dl-credits">
        ${CREDITS.map(
          (c, i) =>
            html`${i ? html`<span aria-hidden="true">•</span>` : nothing}<span
                >${c}</span
              >`,
        )}
      </p>
      <p class="dl-legal">
        <a href="/terms-of-service.html" target="_blank">Terms of Service</a>
        <a href="/privacy-policy.html" target="_blank">Privacy Policy</a>
        <a href=${SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer"
          >Source</a
        >
        <span
          >DerpyFront is based on OpenFront (AGPL-3.0). © OpenFront and
          Contributors.</span
        >
        <span>Derpy Conquest map data: Natural Earth.</span>
      </p>
    </footer>`;
  }
}

function frontArt(): TemplateResult {
  // Blocky territories with a capitol dome: DerpyFront's pixel war.
  const cells: SVGTemplateResult[] = [];
  const colors = ["#ef4444", "#3b82f6", "#22c55e", "#eab308"];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 14; x++) {
      const owner =
        x < 5 + ((y * 3) % 4) ? 0 : x < 9 + (y % 3) ? 1 : y < 4 ? 2 : 3;
      if ((x + y * 3) % 11 === 0) continue;
      cells.push(
        svg`<rect x=${x * 20} y=${y * 20} width="19" height="19" rx="3" fill=${colors[owner]} opacity="0.85"></rect>`,
      );
    }
  }
  return html`<svg
    viewBox="0 0 280 160"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <rect width="280" height="160" fill="#0f1d33"></rect>
    ${cells}
    <g transform="translate(118 46)">
      <rect
        x="-10"
        y="-8"
        width="64"
        height="66"
        rx="12"
        fill="#0f1d33"
        opacity="0.85"
      ></rect>
      <rect x="0" y="40" width="44" height="12" fill="#f8fafc"></rect>
      <rect x="6" y="26" width="32" height="14" fill="#e2e8f0"></rect>
      <path d="M8 26 Q22 0 36 26 Z" fill="#f8fafc"></path>
      <rect x="20" y="0" width="4" height="10" fill="#f8fafc"></rect>
    </g>
  </svg>`;
}

function conquestArt(): TemplateResult {
  return html`<svg
    viewBox="0 0 280 160"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="dl-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2f6577"></stop>
        <stop offset="1" stop-color="#1c3f4c"></stop>
      </linearGradient>
    </defs>
    <rect width="280" height="160" fill="url(#dl-sea)"></rect>
    <path
      d="M60 10 C95 6 120 20 128 36 C134 50 118 58 110 70 C104 80 112 88 104 96 C98 102 90 98 86 104 L80 112 C76 104 70 100 62 92 C50 80 40 60 44 40 C46 26 50 14 60 10 Z"
      fill="#ecdcae"
      stroke="#5a3d24"
      stroke-width="1.5"
    ></path>
    <path
      d="M100 112 C116 110 132 118 136 132 C140 148 126 160 116 160 L96 160 C94 146 96 128 100 112 Z"
      fill="#ecdcae"
      stroke="#5a3d24"
      stroke-width="1.5"
    ></path>
    <path
      d="M62 30 L100 34 L96 62 L70 58 Z"
      fill="#c8263a"
      opacity="0.55"
    ></path>
    <path d="M64 62 L94 66 L86 92 L72 88 Z" fill="#2f5bd3" opacity="0.5"></path>
    <path
      d="M102 118 L130 126 L126 150 L104 150 Z"
      fill="#16894a"
      opacity="0.5"
    ></path>
    <g transform="translate(176 70)">
      <path d="M0 22 L44 22 L38 32 L6 32 Z" fill="#5a3820"></path>
      <rect x="20" y="0" width="2.5" height="22" fill="#3b2b1a"></rect>
      <path d="M22.5 2 L40 10 L22.5 18 Z" fill="#f4e9cd"></path>
      <path d="M20 4 L6 12 L20 18 Z" fill="#f4e9cd"></path>
    </g>
    <path
      d="M150 104 q8 -4 16 0 t16 0 t16 0"
      stroke="#9fd0dc"
      stroke-width="2"
      fill="none"
      opacity="0.6"
    ></path>
  </svg>`;
}
