// The leaderboards: both games together, DerpyFront, or Derpy Conquest.
// The top three stand on a podium; everyone else is in the table below.

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, ApiError } from "../derpland/Account";
import { podiumIcon, tokenColor } from "../derpland/Icons";
import { gold, nf } from "./format";
import { HubPage } from "./HubPage";

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
  games: number;
  wins: number;
  bestTerritoryPct: number;
  goldEarned: string;
  conquests: number;
  mvps: number;
}
interface ConquestRow {
  username: string;
  games: number;
  wins: number;
  bestScore: number;
  mostProvinces: number;
  colonies: number;
  battlesWon: number;
  conquests: number;
}
type Row = OverallRow | FrontRow | ConquestRow;

interface Column {
  label: string;
  value: (r: Row) => string | number;
  /** The column the board is ranked by. */
  key?: boolean;
}

const pct = (r: { wins: number; games: number }) =>
  r.games ? `${Math.round((r.wins / r.games) * 100)}%` : "–";

const COLUMNS: Record<Board, Column[]> = {
  overall: [
    { label: "Wins", value: (r) => r.wins, key: true },
    { label: "Games", value: (r) => r.games },
    {
      label: "DerpyFront wins",
      value: (r) => (r as OverallRow).derpyFrontWins,
    },
    { label: "Conquest wins", value: (r) => (r as OverallRow).conquestWins },
    { label: "Coins earned", value: (r) => nf((r as OverallRow).coinsEarned) },
  ],
  derpyfront: [
    { label: "Wins", value: (r) => r.wins, key: true },
    { label: "Games", value: (r) => r.games },
    { label: "Win rate", value: (r) => pct(r) },
    {
      label: "Best land",
      value: (r) => `${(r as FrontRow).bestTerritoryPct}%`,
    },
    { label: "Gold earned", value: (r) => gold((r as FrontRow).goldEarned) },
    { label: "Conquests", value: (r) => (r as FrontRow).conquests },
    { label: "MVPs", value: (r) => (r as FrontRow).mvps },
  ],
  conquest: [
    { label: "Wins", value: (r) => r.wins, key: true },
    { label: "Games", value: (r) => r.games },
    { label: "Best score", value: (r) => nf((r as ConquestRow).bestScore) },
    {
      label: "Most provinces",
      value: (r) => (r as ConquestRow).mostProvinces,
    },
    { label: "Colonies", value: (r) => (r as ConquestRow).colonies },
    { label: "Battles won", value: (r) => (r as ConquestRow).battlesWon },
  ],
};

const BOARDS: [Board, string][] = [
  ["overall", "Both games"],
  ["derpyfront", "DerpyFront"],
  ["conquest", "Derpy Conquest"],
];

@customElement("dl-leaderboard")
export class DerpLeaderboard extends HubPage {
  @state() private board: Board = boardFromHash();
  @state() private rows: Row[] | null = null;
  @state() private error: string | null = null;

  protected async load(): Promise<void> {
    const board = this.board;
    this.rows = null;
    this.error = null;
    try {
      const res = await api<{ players: Row[] }>(`/leaderboard?game=${board}`);
      if (this.board === board)
        this.rows = res.players.filter((r) => r.games > 0);
    } catch (e) {
      this.rows = [];
      this.error =
        e instanceof ApiError && e.code === "accounts_unavailable"
          ? "Leaderboards aren't available on this server."
          : "Couldn't load the leaderboard. Refresh to try again.";
    }
  }

  private pick(board: Board): void {
    if (board === this.board) return;
    this.board = board;
    history.replaceState(
      null,
      "",
      board === "overall" ? location.pathname : `#${board}`,
    );
    void this.load();
  }

  render(): TemplateResult {
    return html`
      <header class="dl-pagehead">
        <span class="dl-pageicon">${podiumIcon()}</span>
        <div>
          <h1 class="dl-h1">Leaderboard</h1>
          <p class="dl-lede">Ranked by wins. Ties go to whoever earned more.</p>
        </div>
      </header>
      <div class="dl-seg" role="tablist" aria-label="Which game">
        ${BOARDS.map(
          ([b, label]) =>
            html`<button
              role="tab"
              aria-selected=${this.board === b}
              @click=${() => this.pick(b)}
            >
              ${label}
            </button>`,
        )}
      </div>
      ${this.renderBoard()}
    `;
  }

  private renderBoard(): TemplateResult {
    if (this.error) return html`<p class="dl-panel dl-quiet">${this.error}</p>`;
    if (this.rows === null) return html`<p class="dl-quiet">Loading…</p>`;
    if (this.rows.length === 0)
      return html`<div class="dl-panel dl-empty">
        <p>Nobody has finished a game here yet.</p>
        <a
          class="dl-btn"
          href=${this.board === "conquest" ? "/conquest" : "/derpyfront"}
          >Play one</a
        >
      </div>`;
    const cols = COLUMNS[this.board];
    const podium = this.rows.slice(0, 3);
    const order = [podium[1], podium[0], podium[2]];
    return html`
      <ol class="dl-podium" aria-label="Top three">
        ${order.map((r) => {
          if (!r) return html`<li class="dl-step empty"></li>`;
          const place = this.rows!.indexOf(r) + 1;
          return html`<li class="dl-step p${place}">
            <a class="dl-step-who" href="/player/${r.username}">
              <span class="dl-token" style="--token:${tokenColor(r.username)}"
                >${r.username.slice(0, 1).toUpperCase()}</span
              >
              <span class="dl-step-name">${r.username}</span>
              <span class="dl-step-stat"
                >${r.wins} ${r.wins === 1 ? "win" : "wins"}</span
              >
            </a>
            <span class="dl-block"><span>${place}</span></span>
          </li>`;
        })}
      </ol>
      <div class="dl-panel dl-tablewrap">
        <table class="dl-table">
          <thead>
            <tr>
              <th class="dl-rank" scope="col">Place</th>
              <th scope="col">Player</th>
              ${cols.map(
                (c) =>
                  html`<th scope="col" class=${c.key ? "key" : ""}>
                    ${c.label}
                  </th>`,
              )}
            </tr>
          </thead>
          <tbody>
            ${this.rows.map(
              (r, i) =>
                html`<tr class=${r.username === this.username ? "mine" : ""}>
                  <td class="dl-rank">${i + 1}</td>
                  <td>
                    <a class="dl-name" href="/player/${r.username}"
                      >${r.username}</a
                    >${r.username === this.username
                      ? html` <span class="dl-you">you</span>`
                      : nothing}
                  </td>
                  ${cols.map(
                    (c) =>
                      html`<td class=${c.key ? "key" : ""}>${c.value(r)}</td>`,
                  )}
                </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }
}

function boardFromHash(): Board {
  const h = location.hash.slice(1);
  return h === "derpyfront" || h === "conquest" ? h : "overall";
}
