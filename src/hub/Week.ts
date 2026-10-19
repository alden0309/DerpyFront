// CHAL (r25): the weekly challenges on Derp Land: "This week" on the front
// page (both games' three, progress bars, the time left and the coins) and a
// player's own on their profile, with the last few weeks done. The server
// works out the week and everyone's progress; these only show it.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, DERPY_ACCOUNT_EVENT } from "../derpland/Account";
import {
  CHALLENGE_BONUS,
  CHALLENGE_COINS,
  timeLeftWords,
  type ChallengeGame,
  type ChallengeGameView,
  type ChallengeView,
  type PlayerChallenges,
  type WeekHistory,
  type WeekView,
} from "../derpland/Challenges";
import { openSignIn } from "../derpland/DerpBar";
import { coinIcon, tickIcon } from "../derpland/Icons";
import { nf } from "./format";
import "./week.css";

const GAME_NAMES: Record<ChallengeGame, string> = {
  derpyfront: "DerpyFront",
  conquest: "Derpy Conquest",
};

const TIER_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

/** "Oct 19". */
function monthDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** The time left, by the server's clock carried on by this page's. */
function leftOf(w: WeekView, fetchedAt: number): number {
  return Date.parse(w.endsAt) - (w.serverTime + (Date.now() - fetchedAt));
}

function progressWords(c: ChallengeView): string {
  if (c.doneAt) return "Done";
  if (c.of <= 1 && !c.unit) return "Not yet";
  return `${nf(c.have)} / ${nf(c.of)}${c.unit ? ` ${c.unit}` : ""}`;
}

/** One challenge: its tier, name and how, the bar, and the coins. */
function challengeRow(c: ChallengeView, signedIn: boolean): TemplateResult {
  const done = c.doneAt !== null;
  const pct = done ? 100 : c.of > 0 ? Math.round((c.have / c.of) * 100) : 0;
  return html`<li class="dl-chal ${c.tier} ${done ? "done" : ""}">
    <span class="dl-chal-tier">${TIER_NAMES[c.tier]}</span>
    <span class="dl-chal-text">
      <b class="dl-chal-name">${c.name}</b>
      <span class="dl-chal-how">${c.how}</span>
    </span>
    <span class="dl-chal-pay" title="Derp Coins it pays, once this week">
      ${done ? tickIcon("dl-i dl-chal-tick") : nothing}+${nf(c.coins)}
      ${coinIcon("dl-coin sm")}
    </span>
    ${signedIn
      ? html`<span class="dl-chal-progress">
          <span
            class="dl-chal-bar"
            role="progressbar"
            aria-label="${c.name}: ${progressWords(c)}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${pct}
            ><span style="width:${pct}%"></span
          ></span>
          <span class="dl-chal-count">${progressWords(c)}</span>
        </span>`
      : nothing}
  </li>`;
}

/** A game's three, and its bonus. */
function gameCard(g: ChallengeGameView, signedIn: boolean): TemplateResult {
  const done = g.challenges.filter((c) => c.doneAt !== null).length;
  const bonusDone = g.bonus.doneAt !== null;
  return html`<div class="dl-chal-game ${g.game}">
    <div class="dl-chal-game-head">
      <h3 class="dl-chal-game-name">${GAME_NAMES[g.game]}</h3>
      <span
        class="dl-chal-bonus ${bonusDone ? "done" : ""}"
        title="Finish all three this week for ${g.bonus.coins} more"
      >
        ${bonusDone
          ? html`${tickIcon("dl-i dl-chal-tick")} All three:`
          : signedIn
            ? `${done} of 3 · all three:`
            : "All three:"}
        +${nf(g.bonus.coins)} ${coinIcon("dl-coin sm")}
      </span>
    </div>
    <ol class="dl-chal-list">
      ${g.challenges.map((c) => challengeRow(c, signedIn))}
    </ol>
  </div>`;
}

const RULES = html`<details class="dl-chal-rules">
  <summary>How challenges count</summary>
  <ul>
    <li>
      Everyone gets the same six each week, from Monday 00:00 to the next
      Monday, New York time. Each pays once: ${CHALLENGE_COINS.easy},
      ${CHALLENGE_COINS.medium} or ${CHALLENGE_COINS.hard} Derp Coins by how
      hard it is, and ${CHALLENGE_BONUS} more for all three of a game's.
    </li>
    <li>
      <b>DerpyFront:</b> a game counts when it would pay coins (2 minutes or
      longer), you spawned, nobody used cheats, there was someone to play (a
      nation, a bot or a person), and you weren't playing another game at the
      same time.
    </li>
    <li>
      <b>Derpy Conquest:</b> what you do at the table counts, the way time at
      the table pays: a choice of your own in the last 5 minutes, and the clock
      running. Each game counts once you've played it 10 minutes. Where you
      stood when the week began is where each starts.
    </li>
    <li>No challenge needs anything from the store.</li>
  </ul>
</details>`;

/** The front page's "This week". */
@customElement("dl-week")
export class DerpWeek extends LitElement {
  @state() private week: WeekView | null = null;
  @state() private failed = false;
  private fetchedAt = 0;
  private clock = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.reload);
    document.addEventListener("visibilitychange", this.onVisible);
    void this.load();
    // The time left ticks on; past Monday, the new week is fetched.
    this.clock = window.setInterval(() => {
      if (this.week && leftOf(this.week, this.fetchedAt) <= 0) void this.load();
      else this.requestUpdate();
    }, 60_000);
  }

  disconnectedCallback(): void {
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.reload);
    document.removeEventListener("visibilitychange", this.onVisible);
    clearInterval(this.clock);
    super.disconnectedCallback();
  }

  private reload = () => void this.load();
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.load();
  };

  private async load(): Promise<void> {
    try {
      this.week = await api<WeekView>("/challenges");
      this.fetchedAt = Date.now();
      this.failed = false;
    } catch {
      this.failed = this.week === null;
    }
  }

  render(): TemplateResult {
    const w = this.week;
    return html`<section class="dl-week" aria-labelledby="dl-week-h">
      <div class="dl-week-head">
        <h2 class="dl-h2 dl-week-h" id="dl-week-h">This week's challenges</h2>
        ${w
          ? html`<p class="dl-week-when">
              Week of ${monthDay(w.startsAt)} ·
              <b>${timeLeftWords(leftOf(w, this.fetchedAt))}</b>
            </p>`
          : nothing}
      </div>
      ${w === null
        ? html`<p class="dl-quiet dl-week-empty">
            ${this.failed
              ? "This week's challenges aren't available just now."
              : "Looking up this week's challenges…"}
          </p>`
        : html`<div class="dl-chal-games">
              ${w.games.map((g) => gameCard(g, w.signedIn))}
            </div>
            <div class="dl-week-foot">
              ${w.signedIn
                ? nothing
                : html`<p class="dl-week-signin">
                    <button
                      class="dl-btn small"
                      @click=${() => openSignIn("create")}
                    >
                      Make an account
                    </button>
                    <span
                      >or
                      <button class="dl-textbtn" @click=${() => openSignIn()}>
                        sign in</button
                      >, and this week's challenges count for you.</span
                    >
                  </p>`}
              ${RULES}
            </div>`}
    </section>`;
  }
}

/** A player's challenges on their profile: this week's, and weeks gone by. */
@customElement("dl-week-player")
export class DerpWeekPlayer extends LitElement {
  @property({ type: String }) name = "";
  /** It's the signed-in player's own page. */
  @property({ type: Boolean }) mine = false;
  @state() private data: PlayerChallenges | null = null;
  private fetchedAt = 0;
  private loaded = "";

  createRenderRoot() {
    return this;
  }

  protected willUpdate(): void {
    if (this.name && this.name !== this.loaded) {
      this.loaded = this.name;
      void this.load();
    }
  }

  private async load(): Promise<void> {
    const name = this.name;
    try {
      const d = await api<PlayerChallenges>(
        `/challenges/player/${encodeURIComponent(name)}`,
      );
      if (name !== this.name) return;
      this.data = d;
      this.fetchedAt = Date.now();
    } catch {
      // No challenges on this server (or no such player): the page goes on without them.
    }
  }

  render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    const w = d.week;
    const done = w.games.reduce(
      (n, g) => n + g.challenges.filter((c) => c.doneAt).length,
      0,
    );
    return html`<section class="dl-panel dl-week-player">
      <div class="dl-week-head">
        <h2 class="dl-h2 dl-week-h">Weekly challenges</h2>
        <p class="dl-week-when">
          ${done} of 6 this week · ${timeLeftWords(leftOf(w, this.fetchedAt))}
        </p>
      </div>
      <div class="dl-chal-games compact">
        ${w.games.map((g) => gameCard(g, true))}
      </div>
      ${d.history.length
        ? html`<h3 class="dl-week-past-h">Weeks gone by</h3>
            <ol class="dl-week-past">
              ${d.history.map((h) => pastWeek(h))}
            </ol>`
        : html`<p class="dl-quiet dl-week-none">
            ${this.mine
              ? "Challenges you finish show here week by week."
              : `No challenges finished in the weeks before this one.`}
          </p>`}
    </section>`;
  }
}

function pastWeek(h: WeekHistory): TemplateResult {
  return html`<li>
    <span class="dl-week-past-when">Week of ${monthDay(h.startsAt)}</span>
    <span class="dl-week-past-done">
      ${h.done.map(
        (x) =>
          html`<span class="dl-chal-chip ${x.game}"
            >${x.name}<span class="dl-sr"> (${GAME_NAMES[x.game]})</span></span
          >`,
      )}
    </span>
    <span class="dl-week-past-coins"
      >+${nf(h.coins)} ${coinIcon("dl-coin sm")}</span
    >
  </li>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "dl-week": DerpWeek;
    "dl-week-player": DerpWeekPlayer;
  }
}
