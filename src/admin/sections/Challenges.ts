// ADMIN (r26): Weekly challenges, read-only: a week's picks for both games,
// how many did each and what it paid, the latest done, and one fix-up: pay
// an account for one of its challenges that week (logged).

import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { calendarIcon } from "../icons";
import { AdminPage } from "../Page";
import { registerSection } from "../Registry";
import { accountLink, ago, nf, pill, table, when } from "../ui";

interface Pick {
  key: string;
  tier: "easy" | "medium" | "hard";
  name: string;
  how: string;
  coins: number;
  standIn: boolean;
  done: number;
  tried: number;
  paid: number;
}

interface WeekData {
  week: number;
  current: number;
  startsAt: string;
  endsAt: string;
  players: number;
  games: {
    game: "derpyfront" | "conquest";
    picks: Pick[];
    bonus: { coins: number; done: number; paid: number };
  }[];
  recent: {
    accountId: number;
    username: string;
    key: string;
    name: string;
    doneAt: string;
    coins: number;
  }[];
}

const GAME_NAME = { derpyfront: "DerpyFront", conquest: "Derpy Conquest" };
const TIER_TONE = { easy: "good", medium: "warn", hard: "bad" } as const;

@customElement("adm-challenges")
export class AdminChallenges extends AdminPage {
  @state() private data: WeekData | null = null;
  @state() private payAccount = "";
  @state() private payKey = "";

  protected async fetch(): Promise<void> {
    const w = this.view.query.get("week");
    this.data = await this.view.get<WeekData>(`/challenges${w ? `?week=${encodeURIComponent(w)}` : ""}`);
    if (!this.data.games.some((g) => g.picks.some((p) => p.key === this.payKey)))
      this.payKey = "";
  }

  render(): TemplateResult {
    const d = this.data;
    return html`<div class="adm-head">
        <div>
          <h1>Weekly challenges</h1>
          <p class="adm-sub">
            ${d
              ? html`Week of ${new Date(d.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  (Monday to Monday, New York time). ${nf(d.players)} accounts have made progress.`
              : "Loading…"}
          </p>
        </div>
        ${d
          ? html`<div class="adm-row">
              <button class="dl-btn ghost small" @click=${() => this.view.go(`/admin/challenges?week=${d.week - 1}`)}>‹ Week before</button>
              ${d.week < d.current
                ? html`<button class="dl-btn ghost small" @click=${() => this.view.go(`/admin/challenges?week=${d.week + 1}`)}>Week after ›</button>
                    <button class="dl-btn ghost small" @click=${() => this.view.go("/admin/challenges")}>This week</button>`
                : nothing}
            </div>`
          : nothing}
      </div>
      ${this.error ? this.failed() : nothing} ${d ? this.body(d) : nothing}`;
  }

  private body(d: WeekData): TemplateResult {
    const all = d.games.flatMap((g) => g.picks.map((p) => ({ ...p, game: g.game })));
    const pay = async () => {
      const p = all.find((x) => x.key === this.payKey);
      const who = this.payAccount.trim();
      if (!p || !who) return;
      const ok = await this.view.confirm({
        title: `Pay ${who} for "${p.name}"`,
        body: `Marks it done for them in the week of ${new Date(d.startsAt).toLocaleDateString("en-GB")} and pays ${p.coins} coins (and the game's ${GAME_NAME[p.game]} bonus, if that makes all three).`,
        action: `Pay ${p.coins}`,
        reason: true,
        reasonRequired: true,
      });
      if (!ok) return;
      const r = await this.act(() =>
        this.view.post<{ paid: number; bonus: number; username: string }>("/challenges/pay", {
          account: who,
          week: d.week,
          key: p.key,
          reason: ok.reason,
        }),
      );
      if (r) {
        this.view.toast(`${r.username} paid ${nf(r.paid)}${r.bonus ? ` (with the ${r.bonus} bonus)` : ""}.`, "good");
        this.payAccount = "";
      }
    };
    return html`<div class="adm-grid">
      <div class="adm-cols">
        ${d.games.map(
          (g) => html`<div class="adm-box">
            <h2>${GAME_NAME[g.game]} <span class="adm-aside">all three: ${nf(g.bonus.done)} accounts, +${g.bonus.coins} each</span></h2>
            ${table(
              [
                {
                  label: "Challenge",
                  lead: true,
                  cell: (p) => html`${pill(p.tier, TIER_TONE[p.tier])} ${p.name}
                    ${p.standIn ? html` <span class="adm-small">(stand-in for those without an AI personality)</span>` : nothing}
                    <div class="adm-small">${p.how}</div>`,
                },
                { label: "Pays", num: true, cell: (p) => nf(p.coins) },
                { label: "Done", num: true, cell: (p) => html`${nf(p.done)} <span class="adm-small">of ${nf(p.tried)}</span>` },
                { label: "Paid", num: true, cell: (p) => nf(p.paid) },
              ],
              g.picks,
            )}
          </div>`,
        )}
      </div>
      <div class="adm-cols">
        <div class="adm-box">
          <h2>Latest done</h2>
          ${table(
            [
              { label: "When", cls: "nowrap", cell: (r) => html`<span title=${when(r.doneAt)}>${ago(r.doneAt)}</span>` },
              { label: "Account", cell: (r) => accountLink(r.accountId, r.username) },
              { label: "Challenge", lead: true, cell: (r) => (r.key.startsWith("bonus:") ? "All three: the bonus" : r.name) },
              { label: "Coins", num: true, cell: (r) => nf(r.coins) },
            ],
            d.recent,
            "Nobody has done one this week yet.",
          )}
        </div>
        <div class="adm-box">
          <h2>Fix-up: pay a challenge</h2>
          <p class="adm-quiet" style="margin-bottom:10px">
            When a challenge was done but didn't count. It's marked done for
            them this week and paid, and the log keeps your reason.
          </p>
          <div class="adm-form">
            <label
              >Account (name or #id)
              <input class="adm-input" autocomplete="off" .value=${this.payAccount} @input=${(e: InputEvent) => (this.payAccount = (e.target as HTMLInputElement).value)}
            /></label>
            <label
              >Challenge
              <select class="adm-select" @change=${(e: Event) => (this.payKey = (e.target as HTMLSelectElement).value)}>
                <option value="" ?selected=${this.payKey === ""}>Pick one…</option>
                ${d.games.map(
                  (g) => html`<optgroup label=${GAME_NAME[g.game]}>
                    ${g.picks.map((p) => html`<option value=${p.key} ?selected=${this.payKey === p.key}>${p.name} (${p.tier}, ${p.coins})</option>`)}
                  </optgroup>`,
                )}
              </select></label
            >
            <div>
              <button class="dl-btn small" ?disabled=${!this.payKey || !this.payAccount.trim() || this.busy} @click=${() => void pay()}>Pay it…</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }
}

registerSection({
  id: "challenges",
  label: "Challenges",
  order: 60,
  icon: () => calendarIcon(),
  render: (view) => html`<adm-challenges .view=${view}></adm-challenges>`,
});
