// MAP (r12): achievements in the game. When one is earned, a small scene
// slides in: the medal struck, its name, what it was for and the Derp
// Coins it paid. The Journal's Achievements page shows them all, by kind:
// earned on your account (and when), earned in this game, and how to earn
// the rest.
//
// CQACH (r22): two kinds. This game's: earned in the game you're playing,
// paid in it on any difficulty (with the line's marks, held to the time
// played). Overall: your account's, across all your games, earned only on
// Hard. The page has a switch between them, the toast says both, secret
// ones keep their secret until earned, and the add-ons' are shown only to
// their owners.

import { html, nothing, svg, TemplateResult } from "lit";
import type { ChallengeDone } from "../../../derpland/Challenges"; // CHAL (r25)
import { CHALLENGE_BONUS, CHALLENGE_COINS } from "../../../derpland/Challenges"; // CHAL (r25)
import {
  ACHIEVEMENT_BY_KEY,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
  achievementsFor,
  countsOverall,
  GAME_RULE,
  gameAchievements,
  gameCoins,
  OVERALL_RULE,
  type AchievementDef,
  type AchievementGroup,
} from "../../engine/Achievements";
import { formatDate } from "../../engine/Calendar";
import {
  GAME_ACH_LINE,
  lifeCoins,
  lineCap,
  perMinuteWords,
} from "../../engine/Coins"; // LEGACY (r21); CQACH (r22)
import { LIFE_COINS, PLAY_PAY } from "../../engine/LifeRules"; // LEGACY (r21)
import type { PayNote } from "../../Protocol"; // LEGACY (r21)
import { dlcOwned, STORE_CAMPAIGNS, STORE_LEGENDS } from "../Dlc"; // CQACH (r22)
import type { GameUi } from "./Context";
import { pageHead } from "./Nav";

/** CHAL (r25): minutes at the table before a game counts for the challenges (the server's CHALLENGE_MIN_TABLE_SECS). */
const CHALLENGE_MIN_MINUTES = 10;

// ---------------------------------------------------------------- LEGACY (r21): Derp Coins as you play

/** What the server has told us of this game's pay (null until it has). */
export const payStore: { last: PayNote | null } = { last: null };

/** A payment (or where you stand, on sitting down). */
export function onPaid(m: PayNote): void {
  payStore.last = m;
}

/** CHAL (r25): the weekly challenges finished while you've been playing (this sitting). */
export const challengeStore: { done: ChallengeDone[] } = { done: [] };

/** CHAL (r25): weekly challenges just finished: kept, and their toasts' words. */
export function onChallenge(done: ChallengeDone[]): string[] {
  const words: string[] = [];
  for (const c of done) {
    if (challengeStore.done.some((x) => x.key === c.key)) continue;
    challengeStore.done.push(c);
    words.push(`Weekly challenge done: ${c.name}. +${c.coins} Derp Coins.`);
    if (c.bonus)
      words.push(
        `All three of this week's Conquest challenges: +${c.bonus} Derp Coins more!`,
      );
  }
  return words;
}

/** CHAL (r25): the Derp Coins they paid. */
export function challengeCoins(done: ChallengeDone[]): number {
  return done.reduce((n, c) => n + c.coins + (c.bonus ?? 0), 0);
}

/** "rose in a trade, renown and children": the lines that just paid, in words. */
export function grewWords(grew: string[]): string {
  const w = grew.map((g) => g.toLowerCase());
  return w.length <= 1
    ? (w[0] ?? "")
    : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

/** Journal › Achievements: what this game has paid you, and how pay works. */
function coinsPanel(ui: GameUi): TemplateResult {
  const life = ui.life;
  const p = payStore.last;
  const rules = html`<ul class="cq-coin-rules">
    <li>
      <b>Time at the table:</b> ${PLAY_PAY.perHour} coins an hour (about
      ${perMinuteWords()} a minute), paid about once a minute while the world
      goes on. A minute counts when you've made a choice of your own in the last
      ${PLAY_PAY.idleMinutes} minutes (anything you do, a letter answered). With
      the clock stopped, the first ${PLAY_PAY.pausedMinutes} minutes of each
      stop count; skipping ahead counts by the minute like any other. At most
      ${PLAY_PAY.dailyHours} hours a day are paid, all games together.
    </li>
    <li>
      <b>Your line's marks:</b> the coins below are paid as your line reaches
      them, up to ${PLAY_PAY.linesPerHour} for each hour at the table in this
      game; the rest wait for more time, or the end.
    </li>
    <li>
      <b>This game's achievements:</b> each pays ${PLAY_PAY.achievementTimes}
      times its coins in this game, on any difficulty, as one of your line's
      marks (so held to the time played like them).
    </li>
    <li>
      <b>At the end:</b> whatever is left, and ${LIFE_COINS.reached1776} for
      living to see 1776.
    </li>
    <li>
      <b>Weekly challenges:</b> three a week, the same for everyone (the Derp
      Land home page shows them and where you stand). Each pays once,
      ${CHALLENGE_COINS.easy} to ${CHALLENGE_COINS.hard} coins, and all three
      ${CHALLENGE_BONUS} more. What you do at the table counts, once you've
      played a game ${CHALLENGE_MIN_MINUTES} minutes.
    </li>
  </ul>`;
  if (!p || !p.signedIn || !life)
    return html`<section class="cq-section cq-coins-panel">
      <h3 class="cq-h3">Derp Coins in this game</h3>
      <p class="cq-muted small">
        ${p && !p.signedIn
          ? "Playing as a guest: sign in to Derp Land to be paid Derp Coins as you play."
          : "Nothing paid yet."}
      </p>
      ${rules}
    </section>`;
  const sofar = lifeCoins(life, false);
  const cap = lineCap(p.minutes * 60);
  return html`<section class="cq-section cq-coins-panel">
    <h3 class="cq-h3">Derp Coins in this game</h3>
    <div class="cq-ach-summary">
      <span class="cq-ach-stat"><b>${p.play + p.linePaid}</b> paid so far</span>
      <span class="cq-ach-stat"
        ><b>${p.play}</b> for ${p.minutes} minute${p.minutes === 1 ? "" : "s"}
        at the table</span
      >
      <span class="cq-ach-stat"
        ><b>${p.linePaid}</b> for your line's marks and achievements</span
      >
      ${challengeStore.done.length
        ? html`<span
            class="cq-ach-stat"
            title=${challengeStore.done.map((c) => c.name).join(", ")}
            ><b>${challengeCoins(challengeStore.done)}</b> for this week's
            challenges (${challengeStore.done.length})</span
          >`
        : nothing}
      ${p.held > 0
        ? html`<span
            class="cq-ach-stat"
            title="Your line has earned these, but they wait on more time at the table (${PLAY_PAY.linesPerHour} an hour; ${cap} so far)."
            ><b>${p.held}</b> waiting on more time</span
          >`
        : nothing}
    </div>
    ${p.capped
      ? html`<p class="cq-muted small">
          Time at the table has paid all it may today (${PLAY_PAY.dailyHours}
          hours); it pays again tomorrow.
        </p>`
      : nothing}
    ${sofar.lines.length
      ? html`<table class="cq-table compact cq-coin-lines">
          <tbody>
            ${sofar.lines.map(
              (l) =>
                html`<tr>
                  <td>
                    ${l.line === GAME_ACH_LINE
                      ? html`${l.line} (${gameAchievements(life).keys.length})`
                      : l.line}
                  </td>
                  <td class="r">${l.coins}</td>
                </tr>`,
            )}
            <tr class="cq-muted">
              <td>Living to see 1776 (at the end)</td>
              <td class="r">${LIFE_COINS.reached1776}</td>
            </tr>
          </tbody>
        </table>`
      : html`<p class="cq-muted small">
          Your line's marks begin to pay once it has lived two years; this
          game's achievements, from the first.
        </p>`}
    ${rules}
  </section>`;
}
// ---------------------------------------------------------------- /LEGACY (r21)

/** What the server has told us of the account's achievements. */
export const achievementStore = {
  /** The account's list has come. */
  known: false,
  signedIn: false,
  have: new Map<string, { at: string; coins: number }>(),
};

export interface AchievementToast {
  id: number;
  key: string;
  /** Derp Coins paid onto the account (0: had it already, or not on Hard; null: a guest). */
  coins: number | null;
  first: boolean;
  /** CQACH (r22): what it pays in this game. */
  game: number;
  /** CQACH (r22): the game counts for overall achievements (Hard). */
  overall: boolean;
}

/** The account's achievements, when you join a game. */
export function onAchievementList(m: {
  signedIn: boolean;
  have: { key: string; at: string; coins: number }[];
}): void {
  achievementStore.known = true;
  achievementStore.signedIn = m.signedIn;
  achievementStore.have = new Map(
    m.have.map((a) => [a.key, { at: a.at, coins: a.coins }]),
  );
}

/** One just earned: noted for the account (if it went onto it), and its toast. */
export function onAchieved(
  m: {
    key: string;
    coins: number | null;
    first: boolean;
    game?: number;
    overall?: boolean;
  },
  id: number,
): AchievementToast {
  if (m.first && m.coins !== null)
    achievementStore.have.set(m.key, {
      at: new Date().toISOString(),
      coins: m.coins,
    });
  const def = ACHIEVEMENT_BY_KEY.get(m.key);
  return {
    id,
    key: m.key,
    coins: m.coins,
    first: m.first,
    game: m.game ?? (def ? gameCoins(def) : 0),
    overall: m.overall ?? false,
  };
}

// ---------------------------------------------------------------- the medal

/** Each kind of achievement's device on its medal. */
function device(group: AchievementGroup): TemplateResult {
  switch (group) {
    case "work": // a hammer
      return svg`<path d="M5 13.5 10.2 8.3l1.5 1.5-5.2 5.2c-.4.4-1.1.4-1.5 0s-.4-1.1 0-1.5z"/><path d="M8.6 4.4 11 2l3 3-1.4 1.4-1-1-1.3 1.3-1.7-1.7z"/>`;
    case "home": // a house
      return svg`<path d="M8 2.2 2.2 7.6h1.6V14h3V10.3h2.4V14h3V7.6h1.6z"/>`;
    case "society": // a quill
      return svg`<path d="M13.8 2.2C9 2.6 5.6 6 4.6 10.4l-1.4 3.4.9.4 1.2-2.8c3.6-.5 6.8-3.3 8.5-9.2z"/><path d="M3.6 14.6h7" stroke="currentColor" stroke-width="1" fill="none"/>`;
    case "office": // a crown
      return svg`<path d="M2.5 12.5h11l.9-7-3.2 2.4L8 3.2 4.8 7.9 1.6 5.5z"/><rect x="2.5" y="13.2" width="11" height="1.4" rx=".4"/>`;
    case "wealth": // a stack of coins
      return svg`<ellipse cx="8" cy="12" rx="5" ry="2"/><ellipse cx="8" cy="9" rx="5" ry="2"/><ellipse cx="8" cy="6" rx="5" ry="2"/>`;
    case "travel": // an anchor
      return svg`<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="3.4" r="1.4"/><path d="M8 4.8v9.2M5 7h6M3 10.2c.6 2.4 2.6 3.8 5 3.8s4.4-1.4 5-3.8"/></g>`;
    case "arms": // crossed swords
      return svg`<g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l9.5 9.5M13 3 3.5 12.5"/><path d="M10.5 13.5l3-3M2.5 10.5l3 3" stroke-width="1.3"/></g>`;
    case "native": // a feather
      return svg`<path d="M12.8 2.4C8.4 3.2 5.2 6.8 4.6 11.2L3.2 14l.9.5 1.4-2.6c4-.8 7-4.4 7.3-9.5z"/><path d="M6 9.8l3.6-3.6M7.2 11.2l3.4-3.4" stroke="#fff6" stroke-width=".8" fill="none"/>`;
    case "seasons": // an ear of wheat
      return svg`<g><path d="M8 15V5.6" stroke="currentColor" stroke-width="1.2" fill="none"/><ellipse cx="8" cy="3.4" rx="1.3" ry="2"/><ellipse cx="6.2" cy="6.6" rx="1.2" ry="1.9" transform="rotate(-30 6.2 6.6)"/><ellipse cx="9.8" cy="6.6" rx="1.2" ry="1.9" transform="rotate(30 9.8 6.6)"/><ellipse cx="6.2" cy="9.8" rx="1.2" ry="1.9" transform="rotate(-30 6.2 9.8)"/><ellipse cx="9.8" cy="9.8" rx="1.2" ry="1.9" transform="rotate(30 9.8 9.8)"/></g>`;
    // CQACH (r22)
    case "business": // a pair of scales
      return svg`<g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 2.5v11M4.5 14h7M3 4.5h10"/><path d="M3 4.5 1.4 8.6h3.2zM13 4.5l-1.6 4.1h3.2z"/></g><path d="M1.4 8.6a1.6 1 0 0 0 3.2 0zM11.4 8.6a1.6 1 0 0 0 3.2 0z"/>`;
    case "ships": // a ship under sail
      return svg`<path d="M2 11h12l-1.8 3H3.8z"/><path d="M7.4 1.8v8.6H3.2c1.4-2.4 2.8-5.4 4.2-8.6zM8.6 3.4v7h3.8c-1-2.2-2.2-4.6-3.8-7z"/>`;
    case "tavern": // a die
      return svg`<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2"/><g fill="#fff8"><circle cx="5.3" cy="5.3" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="10.7" cy="10.7" r="1"/></g>`;
    case "revolution": // a liberty bell
      return svg`<path d="M8 2c-2.4 0-3.6 1.8-3.6 4.4v3L3 11.6h10l-1.4-2.2v-3C11.6 3.8 10.4 2 8 2z"/><circle cx="8" cy="13.2" r="1.2"/><path d="M7.6 4.2v3.2" stroke="#fff8" stroke-width=".7"/>`;
    case "campaign": // a star of thirteen points' worth: a five-pointed star
      return svg`<path d="M8 1.6l1.9 4.2 4.5.4-3.4 3 1 4.5L8 11.4l-4 2.3 1-4.5-3.4-3 4.5-.4z"/>`;
    case "legends": // a compass rose
      return svg`<path d="M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8 6.7 6.7z"/><circle cx="8" cy="8" r="1.2" fill="#fff8"/>`;
    default: // an hourglass
      return svg`<path d="M4 2h8v1.4c0 1.8-1.4 3.4-2.8 4.6 1.4 1.2 2.8 2.8 2.8 4.6V14H4v-1.4c0-1.8 1.4-3.4 2.8-4.6C5.4 6.8 4 5.2 4 3.4z"/>`;
  }
}

/** CQACH (r22): a secret's device, until it's earned. */
const SECRET_DEVICE = svg`<path d="M5.6 5.6a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.2 1-1.2 1.9v.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="12.8" r="1.1"/>`;

/**
 * A medal: a struck disc on a ribbon, its device in relief. "gold" for one
 * on your account, "silver" for one earned in this game (a guest's, or one
 * the account had already), "none" for one not yet earned.
 */
export function medal(
  def: AchievementDef,
  metal: "gold" | "silver" | "none",
  cls = "",
): TemplateResult {
  const hidden = def.secret && metal === "none"; // CQACH (r22)
  return html`<svg
    class="cq-medal ${metal} ${cls}"
    viewBox="0 0 40 48"
    aria-hidden="true"
  >
    <path class="ribbon" d="M12 0h7l-3 16h-7zM21 0h7l3 16h-7z" />
    <circle class="disc" cx="20" cy="29" r="15" />
    <circle class="rim" cx="20" cy="29" r="12.4" />
    <g class="device" transform="translate(11 20) scale(1.125)">
      ${hidden ? SECRET_DEVICE : device(def.group)}
    </g>
  </svg>`;
}

/** CQACH (r22): "Hard", "Rare", "Secret": a small tag by the name. */
function tierTag(def: AchievementDef): TemplateResult | typeof nothing {
  const tags: TemplateResult[] = [];
  if (def.tier === "hard")
    tags.push(
      html`<span class="cq-ach-tag hard" title="A long road">Hard</span>`,
    );
  if (def.tier === "rare")
    tags.push(
      html`<span class="cq-ach-tag rare" title="Few lines will ever see it"
        >Rare</span
      >`,
    );
  if (def.secret)
    tags.push(
      html`<span class="cq-ach-tag secret" title="Hidden until it's earned"
        >Secret</span
      >`,
    );
  return tags.length ? html`${tags}` : nothing;
}

// ---------------------------------------------------------------- the toast

/** The toasts for achievements just earned: a little scene each. */
export function achievementToasts(
  ui: GameUi,
  list: AchievementToast[],
  dismiss: (id: number) => void,
): TemplateResult {
  return html`${list.map((t) => {
    const def = ACHIEVEMENT_BY_KEY.get(t.key);
    if (!def) return nothing;
    // CQACH (r22): this game's coins, and the account's.
    const here =
      t.coins === null
        ? "Sign in to Derp Land to be paid Derp Coins for these."
        : def.account // CQTUT (r26): the account's alone, nothing in the game
          ? null
          : `+${t.game} Derp Coin${t.game === 1 ? "" : "s"} in this game`;
    const overall =
      t.coins === null
        ? null
        : !t.overall
          ? "Overall achievements are earned only on Hard."
          : t.first
            ? `+${t.coins} on your account (overall)`
            : "Already on your account (overall).";
    const onAccount = t.first && t.coins !== null;
    return html`<button
      class="cq-ach-toast ${t.coins !== null ? "paid" : ""}"
      title="See your achievements"
      @click=${() => {
        dismiss(t.id);
        ui.open({ k: "tab", tab: "journal", sub: "achievements" });
      }}
    >
      ${medal(def, onAccount ? "gold" : "silver", "toast")}
      <span class="cq-ach-toast-text">
        <span class="cq-ach-kicker"
          >${def.secret ? "A secret achievement" : "Achievement"}</span
        >
        <span class="cq-ach-name">${def.name}</span>
        <span class="cq-ach-how">${def.how}</span>
        ${here ? html`<span class="cq-ach-paid">${here}</span>` : nothing}
        ${overall
          ? html`<span class="cq-ach-overall ${onAccount ? "on" : ""}"
              >${overall}</span
            >`
          : nothing}
      </span>
    </button>`;
  })}`;
}

// ---------------------------------------------------------------- the page

const shortDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

/** CQACH (r22): which kind the page shows (kept while you play). */
let view: "game" | "overall" = "game";

/** CQACH (r22): what this browser's account owns of the add-ons, as the achievements need it. */
function owned(): { campaign1776: boolean; legends: boolean } {
  const d = dlcOwned();
  return { campaign1776: d.campaign1776, legends: d.legends };
}

/** Journal › Achievements: every achievement, by kind, and where you stand. */
export function achievementsPage(ui: GameUi): TemplateResult {
  const life = ui.life;
  const here = life?.achieved ?? {};
  const store = achievementStore;
  const own = owned();
  const all = achievementsFor(own);
  // The add-ons' that aren't shown (not owned), and which add-ons.
  const hidden =
    ACHIEVEMENTS.filter((a) => a.dlc).length - all.filter((a) => a.dlc).length;
  const missing = [
    own.campaign1776 ? "" : "1776: The Revolution",
    own.legends ? "" : "Legends",
  ].filter(Boolean);
  const hard = countsOverall(ui.s.settings.difficulty);
  const diff = ui.s.settings.difficulty;
  const diffName = diff.charAt(0).toUpperCase() + diff.slice(1);
  // This game's.
  const mine = gameAchievements({ achieved: here });
  // Overall.
  const onAccount = all.filter((a) => store.have.has(a.key));
  const paid = onAccount.reduce(
    (n, a) => n + (store.have.get(a.key)?.coins ?? 0),
    0,
  );
  const worth = all.reduce((n, a) => n + a.coins, 0);
  const setView = (v: typeof view) => {
    view = v;
    ui.redraw();
  };
  const switcher = html`<div
    class="cq-seg small cq-ach-view"
    role="radiogroup"
    aria-label="Which achievements"
  >
    ${(
      [
        ["game", "This game", mine.keys.length],
        ["overall", "Overall", onAccount.length],
      ] as const
    ).map(
      ([k, label, n]) =>
        html`<button
          role="radio"
          aria-checked=${view === k}
          @click=${() => setView(k)}
        >
          ${label} <span>${n}</span>
        </button>`,
    )}
  </div>`;
  const rule =
    view === "game"
      ? html`<p class="cq-ach-rule">
          ${GAME_RULE}
          ${hard
            ? html`<b>This game is on Hard:</b> what you earn here goes onto
                your account too.`
            : html`<b>This game is on ${diffName}:</b> overall achievements are
                earned only on Hard.`}
        </p>`
      : html`<p class="cq-ach-rule">
          ${OVERALL_RULE} Each pays its Derp Coins once, the first time your
          account earns it.
          ${hard
            ? html`<b>This game is on Hard:</b> it counts.`
            : html`<b>This game is on ${diffName}:</b> it doesn't count for
                these.`}
        </p>`;
  const summary =
    view === "game"
      ? html`<div class="cq-ach-summary">
          <span class="cq-ach-stat"
            ><b>${mine.keys.length}</b> of ${all.length} earned in this
            game</span
          >
          <span
            class="cq-ach-stat"
            title="Paid with your line's marks as you play, held to the time at the table"
            ><b>${mine.coins}</b> Derp Coins in this game</span
          >
        </div>`
      : html`<div class="cq-ach-summary">
          ${store.signedIn
            ? html`<span class="cq-ach-stat"
                  ><b>${onAccount.length}</b> of ${all.length} on your
                  account</span
                >
                <span class="cq-ach-stat"
                  ><b>${paid}</b> of ${worth} Derp Coins paid</span
                >`
            : html`<span class="cq-ach-stat guest"
                >Playing as a guest: sign in to Derp Land to keep achievements
                on an account.</span
              >`}
        </div>`;
  return html`${pageHead(
      "Derp Coins and achievements",
      `What this game has paid you as you play, and the marks of a life, from your first job to living to see 1776. This game's achievements pay Derp Coins in this game on any difficulty; overall achievements are your account's, earned only on Hard.`,
    )}
    ${coinsPanel(ui) /* LEGACY (r21) */}
    <h3 class="cq-h3">Achievements</h3>
    ${switcher} ${rule} ${summary}
    ${ACHIEVEMENT_GROUPS.map((g) => {
      const defs = all.filter((a) => a.group === g.id);
      if (!defs.length) return nothing;
      const got = defs.filter((a) =>
        view === "game" ? here[a.key] !== undefined : store.have.has(a.key),
      ).length;
      return html`<section class="cq-section cq-ach-group">
        <h3 class="cq-h3">
          ${g.name} <span class="cq-muted small">${got} of ${defs.length}</span>
        </h3>
        <ul class="cq-ach-grid">
          ${defs.map((a) => card(a, here[a.key], store.have.get(a.key)))}
        </ul>
      </section>`;
    })}
    ${hidden > 0
      ? html`<p class="cq-muted small cq-ach-dlc">
          ${hidden} more come with ${missing.join(" and ")}, for their owners:
          <a href=${own.campaign1776 ? STORE_LEGENDS : STORE_CAMPAIGNS}
            >the Derp Store</a
          >.
        </p>`
      : nothing}`;
}

/** One achievement's card, as the page's view tells it. */
function card(
  a: AchievementDef,
  day: number | undefined,
  acc: { at: string; coins: number } | undefined,
): TemplateResult {
  const earnedHere = day !== undefined;
  const metal: "gold" | "silver" | "none" =
    view === "game"
      ? earnedHere
        ? "gold"
        : "none"
      : acc
        ? "gold"
        : earnedHere
          ? "silver"
          : "none";
  const secret = !!a.secret && !earnedHere && !acc;
  const state =
    view === "game"
      ? earnedHere
        ? a.account // CQTUT (r26): paid onto the account alone
          ? `Earned ${formatDate(day)}${acc ? ": on your account" : ""}`
          : `Earned ${formatDate(day)}: ${gameCoins(a)} Derp Coins in this game${acc ? "; on your account" : ""}`
        : acc
          ? "Not yet in this game (on your account)"
          : "Not yet"
      : acc
        ? `On your account since ${shortDay(acc.at)}${acc.coins ? `: ${acc.coins} Derp Coin${acc.coins === 1 ? "" : "s"}` : ""}`
        : earnedHere
          ? "Earned in this game, not on your account"
          : "Not yet";
  // CQTUT (r26): the first life's lessons pay the account (once, any difficulty).
  const coins = view === "game" && !a.account ? gameCoins(a) : a.coins;
  return html`<li class="cq-ach-card ${metal} ${secret ? "secret" : ""}">
    ${medal(a, metal)}
    <div class="cq-ach-body">
      <span class="cq-ach-name"
        >${secret ? "A secret" : a.name} ${tierTag(a)}</span
      >
      <span class="cq-ach-how"
        >${secret ? "Earn it to learn what it was." : a.how}</span
      >
      <span class="cq-ach-state">${state}</span>
    </div>
    <span
      class="cq-ach-coins"
      title=${a.account
        ? "Derp Coins it pays your account, once (any difficulty)"
        : view === "game"
          ? "Derp Coins it pays in this game (any difficulty)"
          : "Derp Coins it pays your account, once (on Hard)"}
      >${coins}</span
    >
  </li>`;
}
