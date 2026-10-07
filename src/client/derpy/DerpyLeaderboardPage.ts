import { html, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseModal } from "../components/BaseModal";
import { modalHeader } from "../components/ui/ModalHeader";
import { translateText } from "../Utils";
import {
  DerpyApiError,
  derpyLeaderboard,
  DerpyLeaderboardRow,
  derpyUsername,
} from "./DerpyAccount";
import "./DerpyProfileView";
import { coinAmount, gold } from "./DerpyUi";

type SortKey =
  | "wins"
  | "games"
  | "winRate"
  | "bestTerritoryPct"
  | "goldEarned"
  | "conquests"
  | "mvps"
  | "coins";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "wins", label: "derpy.stat_wins" },
  { key: "games", label: "derpy.stat_games" },
  { key: "winRate", label: "derpy.stat_win_rate" },
  { key: "bestTerritoryPct", label: "derpy.stat_best_territory" },
  { key: "goldEarned", label: "derpy.stat_gold_earned" },
  { key: "conquests", label: "derpy.stat_conquests" },
  { key: "mvps", label: "derpy.stat_mvps" },
  { key: "coins", label: "derpy.derp_coins" },
];

function winRate(r: DerpyLeaderboardRow): number {
  return r.games > 0 ? r.wins / r.games : 0;
}

function sortValue(r: DerpyLeaderboardRow, key: SortKey): number {
  switch (key) {
    case "winRate":
      return winRate(r);
    case "goldEarned":
      return Number(r.goldEarned);
    default:
      return r[key];
  }
}

/** Everyone's stats, sortable, and a click-through to each player's games. */
@customElement("derpy-leaderboard-page")
export class DerpyLeaderboardPage extends BaseModal {
  protected routerName = "leaderboard";

  @state() private rows: DerpyLeaderboardRow[] | null = null;
  @state() private error: string | null = null;
  @state() private sortKey: SortKey = "wins";
  @state() private viewing: string | null = null;

  protected onOpen(): void {
    this.viewing = null;
    void this.load();
  }

  private async load(): Promise<void> {
    this.error = null;
    try {
      this.rows = (await derpyLeaderboard()).players;
    } catch (err) {
      this.error =
        err instanceof DerpyApiError && err.code === "accounts_unavailable"
          ? translateText("derpy.accounts_unavailable")
          : translateText("derpy.load_failed");
    }
  }

  protected renderHeaderSlot(): TemplateResult {
    return modalHeader({
      title: this.viewing ?? translateText("derpy.leaderboard_title"),
      onBack: () => {
        if (this.viewing !== null) {
          this.viewing = null;
        } else {
          this.close();
        }
      },
      ariaLabel: translateText("common.close"),
    });
  }

  protected renderBody(): TemplateResult {
    if (this.viewing !== null) {
      return html`<derpy-profile-view
        .username=${this.viewing}
      ></derpy-profile-view>`;
    }
    if (this.error) {
      return html`<p class="p-6 text-center text-white/60">${this.error}</p>`;
    }
    if (this.rows === null) {
      return html`<p class="p-6 text-center text-white/50">
        ${translateText("derpy.loading")}
      </p>`;
    }
    if (this.rows.length === 0) {
      return html`<p class="p-6 text-center text-white/50">
        ${translateText("derpy.leaderboard_empty")}
      </p>`;
    }
    const me = derpyUsername()?.toLowerCase();
    const sorted = [...this.rows].sort(
      (a, b) =>
        sortValue(b, this.sortKey) - sortValue(a, this.sortKey) ||
        b.games - a.games ||
        a.username.localeCompare(b.username),
    );
    return html`
      <div class="p-4 lg:p-6">
        <p class="m-0 mb-4 text-sm text-white/55">
          ${translateText("derpy.leaderboard_blurb")}
        </p>
        <div class="overflow-x-auto rounded-xl border border-white/10">
          <table class="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr class="bg-white/5 text-left text-white/60">
                <th class="px-2 py-2 font-semibold">#</th>
                <th class="px-2 py-2 font-semibold">
                  ${translateText("derpy.player")}
                </th>
                ${COLUMNS.map(
                  (c) =>
                    html`<th class="px-2 py-2 text-right font-semibold">
                      <button
                        class="cursor-pointer text-right leading-tight ${this
                          .sortKey === c.key
                          ? "text-cyber-yellow"
                          : "text-white/60 hover:text-white"}"
                        @click=${() => (this.sortKey = c.key)}
                        aria-pressed=${this.sortKey === c.key}
                      >
                        ${translateText(c.label)}${this.sortKey === c.key
                          ? " ↓"
                          : ""}
                      </button>
                    </th>`,
                )}
              </tr>
            </thead>
            <tbody>
              ${sorted.map(
                (r, i) =>
                  html`<tr
                    class="border-t border-white/5 ${r.username.toLowerCase() ===
                    me
                      ? "bg-cyber-yellow/10"
                      : "hover:bg-white/5"}"
                  >
                    <td class="px-2 py-2 font-bold text-white/50">${i + 1}</td>
                    <td class="px-2 py-2">
                      <button
                        class="cursor-pointer font-semibold text-white underline decoration-white/20 underline-offset-4 hover:decoration-white"
                        @click=${() => (this.viewing = r.username)}
                      >
                        ${r.username}
                      </button>
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white">
                      ${r.wins}
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white/80">
                      ${r.games}
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white/80">
                      ${r.games > 0 ? Math.round(winRate(r) * 100) + "%" : "–"}
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white/80">
                      ${r.bestTerritoryPct}%
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white/80">
                      ${gold(r.goldEarned)}
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white/80">
                      ${r.conquests}
                    </td>
                    <td class="px-2 py-2 text-right tabular-nums text-white/80">
                      ${r.mvps}
                    </td>
                    <td class="px-2 py-2 text-right">${coinAmount(r.coins)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}
