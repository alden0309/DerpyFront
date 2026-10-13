// ECON (r17): bonds in the browser. Your bonds, lent and owed, on Estate ›
// Ledger (and someone's on their card): the terms, the interest a month,
// its day and how it stands, and what can be done now, each with its cost on
// the button and, where one of the computer's people decides, the odds from
// the same reckoning the engine rolls. The window to lend or borrow: the
// sum, the term, interest at the lawful rate (or none), and their likely
// answer with its reasons. Only the two parties are ever sent a bond.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { lifeOfChar } from "../../engine/LifeQueries";
import {
  bondBetween,
  lawfulRate,
  LOAN_MORE,
  LOAN_REMIND_DAYS,
  LOAN_SUMS,
  LOAN_TERM_DEFAULT,
  LOAN_TERMS,
  loansOf,
  monthInterest,
  owedNow,
  rateWords,
} from "../../engine/LoanCore";
import {
  bondWords,
  borrowCheck,
  courtFor,
  dueRepayChance,
  earlyChance,
  kindWorth,
  lendCheck,
  lenderAtDue,
  lenderOnDefault,
  placeOf,
  repayOdds,
  suitOdds,
  timeChance,
  willBorrow,
  willLend,
} from "../../engine/Loans";
import { chanceWords } from "../../engine/Odds";
import { charName } from "../../engine/Queries";
import type { Breakdown, Character, Loan } from "../../engine/Types";
import { play } from "../Sound";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  charLink,
  GameUi,
  section,
  token,
} from "./Context";
import { howTo } from "./Nav";
import { coins, price } from "./Price";
import { term } from "./Terms";

const r1 = (v: number) => Math.round(v * 10) / 10;
const ok = { ok: true } as const;
const not = (why: string) => ({ ok: false as const, why });

/** "in 3 months", "in 12 days", "today", "12 days ago". */
function when(ui: GameUi, day: number): string {
  const d = day - ui.s.day;
  if (d === 0) return "today";
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} ago`;
  return d > 60
    ? `in ${Math.round(d / 30.4)} months`
    : `in ${d} day${d === 1 ? "" : "s"}`;
}

/** Where a bond stands, in words. */
function standing(ui: GameUi, l: Loan, mine: "lent" | "owed"): string {
  const s = ui.s;
  switch (l.status) {
    case "offered":
      return (l.asked === "lender") === (mine === "lent")
        ? "Waiting on their answer."
        : "Waiting on your answer.";
    case "running":
      return `Running: falls due ${formatDate(l.due)} (${when(ui, l.due)}).`;
    case "due":
      return mine === "lent"
        ? "Fallen due: call it in when you like; it runs on at interest meanwhile."
        : "Fallen due: payable when it's called in; it runs on at interest meanwhile.";
    case "called":
      return (l.ask ?? 0) > 0
        ? `Called in; ${months(l.ask!)} more time asked.`
        : "Called in: to be paid now.";
    case "time":
      return `More time given, to ${formatDate(l.due)} (${when(ui, l.due)}).`;
    case "default":
      return mine === "lent"
        ? `${charName(s.chars[l.borrower])} can't pay: it's yours to decide.`
        : "You couldn't pay: the lender decides.";
    case "court":
      return "Before the court: a suit for debt.";
    default:
      return l.end === "paid"
        ? "Repaid."
        : l.end === "forgiven"
          ? "Forgiven."
          : l.end === "kind"
            ? "Taken in kind."
            : l.end === "judgment"
              ? "Settled by judgment."
              : l.end === "declined"
                ? "Declined."
                : "Lapsed.";
  }
}

const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

/** A tip with the reasons for a computer character's likely answer. */
const reasons = (title: string, b: Breakdown) => () => breakdownTip(title, b);

/** What one of the computer's people would likely do, for the bond's row. */
function likely(
  ui: GameUi,
  l: Loan,
  mine: "lent" | "owed",
): TemplateResult | typeof nothing {
  const s = ui.s;
  if (mine === "lent" && !lifeOfChar(s, l.borrower)) {
    if (l.status === "offered" || l.status === "closed" || l.status === "court")
      return nothing;
    const o = repayOdds(s, l);
    return html`<p class="cq-bond-likely small">
      ${l.status === "running"
        ? html`On its day ${s.chars[l.borrower]?.first} comes to pay of
          ${s.chars[l.borrower]?.female ? "her" : "his"} own accord
          ${chanceWords(dueRepayChance(s, l))};
          ${earlyChance(s, l) > 0
            ? html`may repay early (${chanceWords(earlyChance(s, l))} a month).`
            : nothing}`
        : nothing}
      ${l.status !== "default"
        ? html`Called in:
          ${num(
            html`pays ${chanceWords(o.pay)}, asks for time
            ${chanceWords(o.time)}, can't ${chanceWords(o.cannot)}`,
            reasons(`What makes ${s.chars[l.borrower]?.first} pay`, o.why),
            "cq-odds-inline",
          )}.`
        : nothing}
    </p>`;
  }
  if (mine === "owed" && !lifeOfChar(s, l.lender)) {
    const name = s.chars[l.lender]?.first ?? "They";
    const lines: string[] = [];
    if (l.status === "running")
      lines.push(
        lenderAtDue(s, l) === "renew"
          ? `At its day ${name} will likely let it run on at interest.`
          : `At its day ${name} will likely call it in.`,
      );
    if (
      ["running", "due", "called", "time"].includes(l.status) &&
      l.ask === undefined
    )
      lines.push(
        `Asked for more time, ${name} gives it ${chanceWords(timeChance(s, l))}.`,
      );
    const d = lenderOnDefault(s, ui.w, l);
    if (l.status !== "closed" && l.status !== "court")
      lines.push(
        `If you couldn't pay, ${name} would ${d === "time" ? "give you more time" : d === "kind" ? "take the goods you carry in kind" : d === "sue" ? `sue you for it (the court finds for ${s.chars[l.lender]?.female ? "her" : "him"} ${chanceWords(suitOdds(s, l))})` : "write it off, and never forget it"}.`,
      );
    return lines.length
      ? html`<p class="cq-bond-likely small">${lines.join(" ")}</p>`
      : nothing;
  }
  return nothing;
}

/** What can be done about a bond now, by whoever you are in it. */
function bondActs(ui: GameUi, l: Loan, mine: "lent" | "owed"): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const all = owedNow(l);
  const half = Math.max(1, Math.round(all / 2));
  const cmd = async (
    c: Record<string, unknown>,
    sound: Parameters<typeof play>[0] = "coins",
  ) => {
    if (await ui.cmd({ k: "econ", ...c } as never)) play(sound);
  };
  const acts: TemplateResult[] = [];
  if (l.status === "offered") {
    const answering = (l.asked === "lender") === (mine === "owed");
    if (answering) {
      acts.push(
        action(
          mine === "lent"
            ? html`Lend it${price(l.sum, { have: life.purse })}`
            : html`Take it${price(l.sum, { gain: true })}`,
          mine === "lent" && life.purse < l.sum
            ? not(`You have ${coins(life.purse)}`)
            : ok,
          () => void cmd({ act: "accept", id: l.id }),
          "small primary",
        ),
        action(
          "Decline",
          ok,
          () => void cmd({ act: "decline", id: l.id }, "paper"),
          "small quiet",
        ),
      );
    }
    return html`<div class="cq-bond-acts">${acts}</div>`;
  }
  if (mine === "owed") {
    const can = ["running", "due", "called", "time", "default"].includes(
      l.status,
    );
    if (can) {
      if (all > 1.5)
        acts.push(
          action(
            html`Repay half${price(half, { have: life.purse })}`,
            life.purse < half ? not(`You have ${coins(life.purse)}`) : ok,
            () => void cmd({ act: "repay", id: l.id, sum: half }),
            "small",
          ),
        );
      acts.push(
        action(
          html`${l.status === "called" ? "Pay it" : "Repay it all"}${price(
            all,
            { have: life.purse },
          )}`,
          life.purse < all ? not(`You have ${coins(life.purse)}`) : ok,
          () => void cmd({ act: "repay", id: l.id }),
          `small ${l.status === "called" ? "primary" : ""}`,
        ),
      );
    }
    const near = l.status !== "running" || l.due - s.day <= LOAN_REMIND_DAYS;
    if (["running", "due", "called", "time"].includes(l.status) && near)
      acts.push(
        action(
          `Ask for ${months(LOAN_MORE[0])} more`,
          l.ask === -1
            ? not("Refused already")
            : (l.ask ?? 0) > 0
              ? not("Asked already")
              : ok,
          () =>
            void cmd({ act: "time", id: l.id, months: LOAN_MORE[0] }, "paper"),
          "small",
        ),
      );
    if (["called", "due", "time"].includes(l.status))
      acts.push(
        action(
          "Say you can't pay",
          ok,
          () => void cmd({ act: "cant", id: l.id }, "paper"),
          "small quiet",
        ),
      );
  } else {
    if (
      ["due", "time"].includes(l.status) ||
      (l.status === "running" && s.day >= l.due)
    )
      acts.push(
        action(
          "Call it in",
          ok,
          () => void cmd({ act: "call", id: l.id }, "seal"),
          "small primary",
        ),
      );
    else if (l.status === "running")
      acts.push(
        action(
          "Call it in",
          not(`Not until ${formatDate(l.due)}`),
          () => {},
          "small",
          undefined,
          false,
        ),
      );
    if ((l.ask ?? 0) > 0)
      acts.push(
        action(
          `Give ${months(l.ask!)} more`,
          ok,
          () => void cmd({ act: "grant", id: l.id }, "paper"),
          "small",
        ),
        action(
          "Refuse",
          ok,
          () => void cmd({ act: "refuse", id: l.id }, "paper"),
          "small quiet",
        ),
      );
    if (l.status === "default") {
      const worth = kindWorth(s, ui.w, l);
      acts.push(
        action(
          `Give ${months(LOAN_MORE[0])} more`,
          ok,
          () =>
            void cmd({ act: "grant", id: l.id, months: LOAN_MORE[0] }, "paper"),
          "small",
        ),
        action(
          "Forgive it",
          ok,
          () => void cmd({ act: "forgive", id: l.id }, "paper"),
          "small",
        ),
        action(
          html`Take it in kind${price(worth, { gain: true, approx: true })}`,
          worth <= 0.5 ? not("Nothing worth taking") : ok,
          () => void cmd({ act: "kind", id: l.id }),
          "small",
        ),
        action(
          `Sue for it (${chanceWords(suitOdds(s, l))})`,
          courtFor(s, l) < 0 ? not("No court of a crown where they live") : ok,
          () => void cmd({ act: "sue", id: l.id }, "seal"),
          "small rough",
        ),
      );
    }
  }
  return html`<div class="cq-bond-acts">${acts}</div>`;
}

/** One bond, as its lender or borrower sees it. */
export function bondRow(ui: GameUi, l: Loan, card = false): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = l.lender === life.c ? "lent" : "owed";
  const other = s.chars[mine === "lent" ? l.borrower : l.lender];
  const interest = monthInterest(l);
  const open = l.status !== "closed";
  return html`<li class="cq-bond ${l.status} ${mine}">
    ${card || !other ? nothing : token(ui, other, "small")}
    <div class="cq-bond-body">
      <b
        >${mine === "lent" ? "Lent to " : "Owed to "}${other
          ? charLink(ui, other, false)
          : "someone"}</b
      >
      <p class="small">
        ${bondWords(l)}${open && l.status !== "offered"
          ? html` · <b>${coins(owedNow(l))}</b> owed${l.arrears
                ? html` (${coins(l.arrears)} interest behind)`
                : nothing}`
          : nothing}${interest > 0 && open
          ? html` · interest
            ${price(interest, { per: "month", gain: mine === "lent" })}`
          : nothing}
      </p>
      <p class="cq-muted small">${standing(ui, l, mine)}</p>
      ${open ? likely(ui, l, mine) : nothing}
    </div>
    ${open ? bondActs(ui, l, mine) : nothing}
  </li>`;
}

/** Estate › Ledger: your bonds, lent and owed. */
export function bondsSection(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = loansOf(s).filter(
    (l) => l.lender === life.c || l.borrower === life.c,
  );
  const open = mine.filter((l) => l.status !== "closed");
  const done = mine
    .filter((l) => l.status === "closed")
    .slice(-4)
    .reverse();
  const out = open.filter((l) => l.lender === life.c);
  const owed = open.filter((l) => l.borrower === life.c);
  const sum = (xs: Loan[]) =>
    xs.reduce((m, l) => m + (l.status === "offered" ? 0 : owedNow(l)), 0);
  return section(
    html`${term("bond")}
      <span class="cq-muted small"
        >${open.length
          ? `${out.length} lent, ${owed.length} owed`
          : "none"}</span
      >`,
    open.length || done.length
      ? html`${open.length
          ? html`<p class="cq-affairs-sum">
                ${out.length
                  ? html`<span
                      >Owed you: <b class="good">${coins(sum(out))}</b></span
                    >`
                  : nothing}
                ${owed.length
                  ? html`<span
                      >You owe: <b class="bad">${coins(sum(owed))}</b></span
                    >`
                  : nothing}
              </p>
              <ul class="cq-bonds">
                ${[...owed, ...out].map((l) => bondRow(ui, l))}
              </ul>`
          : nothing}
        ${done.length
          ? html`<details class="cq-more">
              <summary>Settled lately</summary>
              <ul class="cq-bonds settled">
                ${done.map((l) => bondRow(ui, l))}
              </ul>
            </details>`
          : nothing}`
      : howTo(
          "You have no bonds. Money lent on bond earns interest at the lawful rate:",
          [
            "Anyone's card: Money between you › Lend money… (the sum, the term, the interest a month, and whether they'd take it).",
            "Borrowing is there too, and by letter (Society › Letters, Ask a favour).",
            "A bond falls due at its day: the lender may call it in, or let it run on at interest. The borrower may repay sooner, whole or in part.",
          ],
        ),
  );
}

/** "Money between you" on someone's card: a bond between you, and lending or borrowing. */
export function moneyBetween(
  ui: GameUi,
  c: Character,
): TemplateResult | typeof nothing {
  const s = ui.s;
  const life = ui.life;
  if (!life || life.c < 0 || life.watching) return nothing;
  const bond = bondBetween(s, life.c, c.id);
  const lendOk = lendCheck(s, life, c, 5, LOAN_TERM_DEFAULT);
  const borrowOk = borrowCheck(s, life, c, 5, LOAN_TERM_DEFAULT);
  const rate = lawfulRate(s, ui.map, placeOf(s, life.c, c.id));
  const quiet = (why: string) =>
    /You're watching|child|That's you|sixteen/.test(why);
  if (!bond && !lendOk.ok && quiet(lendOk.why)) return nothing;
  return html`<section class="cq-section cq-bond-card">
    <h3 class="cq-h3">Money between you</h3>
    ${bond
      ? html`<ul class="cq-bonds">
          ${bondRow(ui, bond, true)}
        </ul>`
      : html`<p class="cq-muted small">
          Lent on bond, at ${rateWords(rate.rate)} (${rate.law.toLowerCase()}).
        </p>`}
    <div class="cq-btnrow">
      ${action(
        "Lend money…",
        bond
          ? not("There's a bond between you already")
          : lendOk.ok || /coins/.test(lendOk.why)
            ? ok
            : lendOk,
        () => ui.modal({ k: "bond", c: c.id, side: "lend" }),
        "small",
      )}
      ${action(
        "Borrow money…",
        bond
          ? not("There's a bond between you already")
          : borrowOk.ok || /spare/.test(borrowOk.why)
            ? ok
            : borrowOk,
        () => ui.modal({ k: "bond", c: c.id, side: "borrow" }),
        "small",
      )}
    </div>
  </section>`;
}

// ---------------------------------------------------------------- the window

let draft = { key: "", sum: 20, months: LOAN_TERM_DEFAULT, free: false };

/** The window to lend someone money on bond, or to borrow from them. */
export function bondModal(
  ui: GameUi,
  m: { c: number; side: "lend" | "borrow" },
): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const c = s.chars[m.c];
  if (!life || !c) return html`<p class="cq-empty">Nobody by that name.</p>`;
  const key = `${ui.modalSeq}:${m.c}:${m.side}`;
  if (draft.key !== key)
    draft = { key, sum: 20, months: LOAN_TERM_DEFAULT, free: false };
  const lending = m.side === "lend";
  const lender = lending ? life.c : c.id;
  const borrower = lending ? c.id : life.c;
  const law = lawfulRate(s, ui.map, placeOf(s, lender, borrower));
  const rate = draft.free ? 0 : law.rate;
  const interest = Math.round(((draft.sum * rate) / 12) * 100) / 100;
  const due = s.day + Math.round(draft.months * 30.4);
  const other = lifeOfChar(s, c.id);
  const check = lending
    ? lendCheck(s, life, c, draft.sum, draft.months)
    : borrowCheck(s, life, c, draft.sum, draft.months);
  const answer = other
    ? null
    : lending
      ? willBorrow(s, life, c, draft.sum, draft.months, draft.free, rate)
      : willLend(s, life, c, draft.sum, draft.months, draft.free);
  const set = (o: Partial<typeof draft>) => {
    draft = { ...draft, ...o };
    ui.redraw();
  };
  return html`<div class="cq-bondwin">
    <header class="cq-bondwin-head">
      ${token(ui, c, "small")}
      <span>
        <span class="cq-kicker"
          >${lending ? "Lend on bond" : "Borrow on bond"}</span
        >
        <h2>
          ${lending ? `A loan to ${charName(c)}` : `A loan from ${charName(c)}`}
        </h2>
      </span>
    </header>
    <p class="cq-bondwin-law small"><b>The law here:</b> ${law.law}.</p>
    <div class="cq-bondwin-terms">
      <span class="cq-field"
        ><span>The sum</span>
        <span class="cq-seg small" role="radiogroup" aria-label="The sum">
          ${LOAN_SUMS.map(
            (n) =>
              html`<button
                role="radio"
                aria-checked=${draft.sum === n}
                @click=${() => set({ sum: n })}
              >
                ${n}
              </button>`,
          )}
        </span></span
      >
      <span class="cq-field"
        ><span>Its term</span>
        <span class="cq-seg small" role="radiogroup" aria-label="Its term">
          ${LOAN_TERMS.map(
            (n) =>
              html`<button
                role="radio"
                aria-checked=${draft.months === n}
                @click=${() => set({ months: n })}
              >
                ${n < 12
                  ? `${n} months`
                  : n === 12
                    ? "a year"
                    : `${n / 12} years`}
              </button>`,
          )}
        </span></span
      >
      <label class="cq-check small">
        <input
          type="checkbox"
          .checked=${draft.free}
          @change=${(e: Event) =>
            set({ free: (e.target as HTMLInputElement).checked })}
        />
        Without interest (a friend's loan)
      </label>
    </div>
    <p class="cq-bondwin-sum">
      ${draft.sum} coins for
      ${draft.months < 12
        ? `${draft.months} months`
        : draft.months === 12
          ? "a year"
          : `${draft.months / 12} years`}
      at ${rateWords(rate)}:
      ${interest > 0
        ? html`interest ${price(interest, { per: "month", gain: lending })}
          (${coins(interest * draft.months)} over the term), paid at each
          month's turn;`
        : "no interest;"}
      the sum ${lending ? "repaid to you" : "repaid"} by ${formatDate(due)}, or
      sooner, whole or in part. At its day the lender may call it in, or let it
      run on.
    </p>
    ${other
      ? html`<p class="cq-bondwin-answer">
          ${c.first} is another player: ${c.female ? "she's" : "he's"} asked,
          and answers for ${c.female ? "herself" : "himself"}.
          ${lending
            ? "The money goes when the loan is taken."
            : "The money comes when it's lent."}
        </p>`
      : answer
        ? html`<p
            class="cq-bondwin-answer ${answer.total > 0 ? "good" : "bad"}"
          >
            ${num(
              answer.total > 0
                ? lending
                  ? `${c.first} would take it`
                  : `${c.first} would lend it`
                : lending
                  ? `${c.first} wouldn't take it`
                  : `${c.first} wouldn't lend it`,
              reasons(
                lending
                  ? `Would ${c.first} take it?`
                  : `Would ${c.first} lend it?`,
                answer,
              ),
              "cq-verdict",
            )}
            <span class="cq-muted small"
              >${answer.parts
                .slice(0, 4)
                .map(
                  (p) =>
                    `${p.label} (${p.value > 0 ? "+" : ""}${Math.round(p.value)})`,
                )
                .join(" · ")}</span
            >
          </p>`
        : nothing}
    <div class="cq-btnrow">
      ${action(
        lending
          ? html`${other ? "Offer the loan" : "Lend it"}${price(draft.sum, {
              have: life.purse,
            })}`
          : html`${other ? "Ask for it" : "Borrow it"}${price(draft.sum, {
              gain: true,
            })}`,
        !check.ok
          ? check
          : answer && answer.total <= 0
            ? not(lending ? "They'd say no" : "They'd say no")
            : ok,
        async () => {
          if (
            await ui.cmd({
              k: "econ",
              act: lending ? "lend" : "borrow",
              c: c.id,
              sum: draft.sum,
              months: draft.months,
              free: draft.free,
            })
          ) {
            play(lending ? "coins" : "paper");
            ui.modal(null);
          }
        },
        "primary",
      )}
      <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
        Not now
      </button>
    </div>
  </div>`;
}

/** The goods-and-debts section's bonds you owe (the "You" page). */
export function owedList(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life!;
  const owed = loansOf(ui.s).filter(
    (l) =>
      l.borrower === life.c && l.status !== "closed" && l.status !== "offered",
  );
  if (!owed.length) return nothing;
  return html`<ul class="cq-bonds">
    ${owed.map((l) => bondRow(ui, l))}
  </ul>`;
}
