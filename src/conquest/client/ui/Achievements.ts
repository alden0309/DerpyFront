// MAP (r12): achievements in the game. When one is earned, a small scene
// slides in: the medal struck, its name, what it was for and the Derp
// Coins it paid. The Journal's Achievements page shows them all, by kind:
// earned on your account (and when), earned in this game, and how to earn
// the rest.

import { html, nothing, svg, TemplateResult } from "lit";
import {
  ACHIEVEMENT_BY_KEY,
  ACHIEVEMENT_COINS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
  type AchievementDef,
  type AchievementGroup,
} from "../../engine/Achievements";
import { formatDate } from "../../engine/Calendar";
import type { GameUi } from "./Context";
import { pageHead } from "./Nav";

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
  /** Derp Coins paid (0: the account had it already; null: a guest). */
  coins: number | null;
  first: boolean;
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

/** One just earned: noted for the account (if it paid), and its toast. */
export function onAchieved(
  m: { key: string; coins: number | null; first: boolean },
  id: number,
): AchievementToast {
  if (m.first && m.coins !== null)
    achievementStore.have.set(m.key, {
      at: new Date().toISOString(),
      coins: m.coins,
    });
  return { id, key: m.key, coins: m.coins, first: m.first };
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
    default: // an hourglass
      return svg`<path d="M4 2h8v1.4c0 1.8-1.4 3.4-2.8 4.6 1.4 1.2 2.8 2.8 2.8 4.6V14H4v-1.4c0-1.8 1.4-3.4 2.8-4.6C5.4 6.8 4 5.2 4 3.4z"/>`;
  }
}

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
  return html`<svg
    class="cq-medal ${metal} ${cls}"
    viewBox="0 0 40 48"
    aria-hidden="true"
  >
    <path class="ribbon" d="M12 0h7l-3 16h-7zM21 0h7l3 16h-7z" />
    <circle class="disc" cx="20" cy="29" r="15" />
    <circle class="rim" cx="20" cy="29" r="12.4" />
    <g class="device" transform="translate(11 20) scale(1.125)">
      ${device(def.group)}
    </g>
  </svg>`;
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
    const paid =
      t.coins === null
        ? "Sign in to Derp Land to be paid Derp Coins for these."
        : t.first
          ? `+${t.coins} Derp Coin${t.coins === 1 ? "" : "s"}`
          : "Already on your account (paid once).";
    return html`<button
      class="cq-ach-toast ${t.first && t.coins ? "paid" : ""}"
      title="See your achievements"
      @click=${() => {
        dismiss(t.id);
        ui.open({ k: "tab", tab: "journal", sub: "achievements" });
      }}
    >
      ${medal(def, t.first && t.coins !== null ? "gold" : "silver", "toast")}
      <span class="cq-ach-toast-text">
        <span class="cq-ach-kicker">Achievement</span>
        <span class="cq-ach-name">${def.name}</span>
        <span class="cq-ach-how">${def.how}</span>
        <span class="cq-ach-paid">${paid}</span>
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

/** Journal › Achievements: every achievement, by kind, and where you stand. */
export function achievementsPage(ui: GameUi): TemplateResult {
  const life = ui.life;
  const here = life?.achieved ?? {};
  const store = achievementStore;
  const onAccount = ACHIEVEMENTS.filter((a) => store.have.has(a.key));
  const paid = onAccount.reduce(
    (n, a) => n + (store.have.get(a.key)?.coins ?? 0),
    0,
  );
  const thisGame = Object.keys(here).length;
  return html`${pageHead(
      "Achievements",
      `Marks of a life, from your first job to living to see 1776. Each pays a few Derp Coins the first time your account earns it, and never again.`,
    )}
    <div class="cq-ach-summary">
      ${store.signedIn
        ? html`<span class="cq-ach-stat"
              ><b>${onAccount.length}</b> of ${ACHIEVEMENTS.length} on your
              account</span
            >
            <span class="cq-ach-stat"
              ><b>${paid}</b> of ${ACHIEVEMENT_COINS} Derp Coins paid</span
            >`
        : html`<span class="cq-ach-stat guest"
            >Playing as a guest: sign in to Derp Land to be paid Derp Coins for
            these.</span
          >`}
      <span class="cq-ach-stat"><b>${thisGame}</b> earned in this game</span>
    </div>
    ${ACHIEVEMENT_GROUPS.map((g) => {
      const defs = ACHIEVEMENTS.filter((a) => a.group === g.id);
      const got = defs.filter(
        (a) => store.have.has(a.key) || here[a.key] !== undefined,
      ).length;
      return html`<section class="cq-section cq-ach-group">
        <h3 class="cq-h3">
          ${g.name} <span class="cq-muted small">${got} of ${defs.length}</span>
        </h3>
        <ul class="cq-ach-grid">
          ${defs.map((a) => {
            const acc = store.have.get(a.key);
            const day = here[a.key];
            const metal = acc ? "gold" : day !== undefined ? "silver" : "none";
            const state = acc
              ? `On your account since ${shortDay(acc.at)}${acc.coins ? `: ${acc.coins} Derp Coin${acc.coins === 1 ? "" : "s"}` : ""}`
              : day !== undefined
                ? `Earned in this game, ${formatDate(day)}`
                : "Not yet";
            return html`<li class="cq-ach-card ${metal}">
              ${medal(a, metal)}
              <div class="cq-ach-body">
                <span class="cq-ach-name">${a.name}</span>
                <span class="cq-ach-how">${a.how}</span>
                <span class="cq-ach-state">${state}</span>
              </div>
              <span
                class="cq-ach-coins"
                title="Derp Coins, paid once per account"
                >${a.coins}</span
              >
            </li>`;
          })}
        </ul>
      </section>`;
    })}`;
}
