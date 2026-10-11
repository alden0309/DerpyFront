// PARTNERS (r13): business partnerships in the browser. Estate ›
// Partnerships (every firm you're in: its signboard, the partners and their
// shares, the books month by month, the chest and the debts, what's put to
// the partners and how they voted, and what you could put to them); the
// articles of copartnership drawn up from someone's card or at the market
// (in person, or by post); the scene in which another player's articles
// are signed, declined or answered with terms of your own; the firm's name
// on its place's tile; and the market's "Partnerships".

import { html, nothing, svg, TemplateResult } from "lit";
import { formatDate, formatMonth } from "../../engine/Calendar";
import {
  avgProfit,
  bizName,
  buyoutPrice,
  decisionCheck,
  decisionCost,
  DECISIONS,
  decisionWords,
  firmMonthView,
  tally,
  windingUpShares,
} from "../../engine/Firms";
import {
  isChildLife,
  lifeOfChar,
  meOf,
  peopleHere,
} from "../../engine/LifeQueries";
import { JOBS, ROLES } from "../../engine/LifeRules";
import {
  articlesAcceptance,
  articlesForecast,
  articlesText,
  bizJobOfRole,
  fairShares,
  foundingCost,
  holdChoices,
  lawyersHere,
  likelyPartners,
  routeTo,
  suggestTerms,
  termsCheck,
  type HoldChoice,
} from "../../engine/Partners";
import {
  bizCost,
  bizRoom,
  CALLS,
  CARGOES,
  firmById,
  firmsAt,
  firmsOf,
  firmsWith,
  LOANS,
  managerOf,
  MAX_FIRMS,
  offerById,
  offersFrom,
  offersTo,
  partnerIn,
} from "../../engine/PartnersCore";
import { ageOf, charName } from "../../engine/Queries";
import type {
  Character,
  Firm,
  FirmDecision,
  FirmDecisionKey,
  FirmTerms,
  JobKind,
  LifeEventPending,
  PlaceKind,
} from "../../engine/Types";
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
import type { PlacePart } from "./Livelihood";
import { letterClock, ModalHooks } from "./Modals";
import { howTo, pageHead } from "./Nav";
import { curly, reasons, shell, stage } from "./Scene";

const money = (v: number) =>
  `${v < 0 ? "−" : ""}${Math.abs(Math.round(v * 10) / 10)}`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${money(v)}`;

// ---------------------------------------------------------------- badges

/** What waits on you in partnerships (Nav's badge on Estate › Partnerships). */
export function partnerMarks(ui: GameUi): number {
  const life = ui.life;
  if (!life || life.c < 0 || life.watching) return 0;
  const s = ui.s;
  let n = offersTo(s, life.c).length;
  for (const f of firmsWith(s, life.c))
    n += f.decisions.filter(
      (d) => d.status === "open" && d.votes[life.c] === undefined,
    ).length;
  return n;
}

// ---------------------------------------------------------------- the page

const pickFor = new Map<
  number,
  { key: FirmDecisionKey; arg: number; c: number; cap: number }
>();
let renaming = -1;
let newName = "";

/** Estate › Partnerships. */
export function partnersPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = ui.me!;
  const firms = firmsWith(s, me.id);
  const past = firmsOf(s).filter(
    (f) => f.status === "dissolved" && f.partners.some((p) => p.c === me.id),
  );
  const incoming = offersTo(s, me.id);
  const outgoing = offersFrom(s, me.id);
  return html`${pageHead(
    "Partnerships",
    html`Firms you're a partner in: who holds what share, the books month by
    month, and what's put to the partners. You're in ${firms.length} of the
    ${MAX_FIRMS} a person can manage at once.`,
  )}
  ${incoming.length || outgoing.length
    ? section(
        "Articles in hand",
        html`<ul class="cq-pa-offers">
          ${incoming.map((o) => {
            const ev = life.events.find(
              (e) => e.key === "p2p-articles" && e.ctx.o === o.id,
            );
            return html`<li class="in">
              ${token(ui, s.chars[o.from], "small")}
              <span class="cq-folk-text">
                <b>${o.terms.name}</b>
                <span class="cq-muted small"
                  >${o.round ? "Terms of their own from" : "Articles from"}
                  ${charName(s.chars[o.from])}, for your answer</span
                >
              </span>
              ${ev
                ? html`<button
                    class="cq-btn small primary"
                    @click=${() => ui.modal({ k: "event", id: ev.id })}
                  >
                    Read them
                  </button>`
                : nothing}
            </li>`;
          })}
          ${outgoing.map(
            (o) =>
              html`<li class="out">
                ${token(ui, s.chars[o.to], "small")}
                <span class="cq-folk-text">
                  <b>${o.terms.name}</b>
                  <span class="cq-muted small"
                    >${o.status === "post"
                      ? `Your articles are on their way to ${charName(s.chars[o.to])} by post`
                      : o.status === "answered"
                        ? `${charName(s.chars[o.to])}'s answer is on its way back`
                        : `Waiting on ${charName(s.chars[o.to])}'s answer`}</span
                  >
                </span>
                <span class="cq-chip"
                  >${o.status === "open" ? "asked" : "in the post"}</span
                >
              </li>`,
          )}
        </ul>`,
      )
    : nothing}
  ${isChildLife(s, life)
    ? html`<p class="cq-empty">Not until you're sixteen.</p>`
    : firms.length
      ? firms.map((f) => firmCard(ui, f))
      : howTo(
          "You're in no partnership. Two can set up what one alone can't, and a silent partner's money works while someone else does the work.",
          [
            html`From anyone's card: <i>In business › Propose a partnership</i>.
              In person if they're here, or by post if they're far off (another
              player answers it themselves).`,
            html`At the market: <i>Partnerships</i> lists who in town might go
              into business with you.`,
            "Bring in your own business, buy a share of theirs, found a new one together (any trade with a business of its own), or pool money for cargoes.",
          ],
          life.travel
            ? undefined
            : {
                label: "Go to the market",
                run: async () => {
                  if (life.area !== "market")
                    await ui.cmd({ k: "enter", area: "market" });
                  ui.open({ k: "tab", tab: "here" });
                },
              },
          false,
        )}
  ${past.length
    ? section(
        "Wound up",
        html`<ul class="cq-pa-past small">
          ${past.map(
            (f) =>
              html`<li>
                <b>${f.name}</b>
                <span class="cq-muted"
                  >${f.ended ? formatDate(f.ended) : ""}:
                  ${f.lines[f.lines.length - 1]?.text.replace(
                    /^Wound up: /,
                    "",
                  ) ?? ""}</span
                >
              </li>`,
          )}
        </ul>`,
      )
    : nothing}`;
}

/** What a firm holds, in a line. */
function holdLine(ui: GameUi, f: Firm): string {
  const s = ui.s;
  const town = ui.map.provinces[f.prov]?.name ?? "";
  if (f.hold === "paper") {
    const x = s.power?.papers.find((p) => p.id === f.paper);
    return `${x?.name ?? "A newspaper"}, printed at ${town}`;
  }
  if (f.biz)
    return `${bizName(f.biz.job, f.biz.level)[0].toUpperCase()}${bizName(f.biz.job, f.biz.level).slice(1)} at ${town} · ${["", "I", "II", "III"][f.biz.level]} · ${f.biz.hands} of ${bizRoom(f.biz.level)} hands`;
  if (f.lost) return `Cargoes, out of ${town} (its ${f.lost.name} lost)`;
  return `Cargoes, out of ${town}`;
}

/** One firm: signboard, partners, the books, matters, and what you could do. */
function firmCard(ui: GameUi, f: Firm): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = partnerIn(f, life.c)!;
  const mgr = managerOf(f);
  const v = f.hold === "paper" ? null : firmMonthView(s, f);
  const last = f.books[f.books.length - 1];
  const worth = buyoutPrice(s, f, life.c);
  const wind = windingUpShares(s, f).get(life.c) ?? 0;
  return html`<article class="cq-firm">
    <header class="cq-firm-board">
      <span class="cq-firm-est">Est. ${formatMonth(f.founded)}</span>
      <h3 class="cq-firm-name">${f.name}</h3>
      <p class="cq-firm-hold">${holdLine(ui, f)}</p>
      <p class="cq-firm-chips">
        <span class="cq-chip ${me.role === "managing" ? "gold" : ""}"
          >You: ${me.role === "managing" ? "managing" : "silent"} partner</span
        >
        <span class="cq-chip"
          >${f.rule === "unanimous"
            ? "All must agree"
            : "By the greater part"}</span
        >
        ${f.drafted >= 0
          ? html`<span
              class="cq-chip"
              title="Drawn up by a lawyer: the clauses lean their way in a dispute"
              >Articles by
              ${s.chars[f.lawyer]?.first ?? "a lawyer"}${f.drafted === life.c
                ? ", yours"
                : ""}</span
            >`
          : nothing}
        ${f.suit ? html`<span class="cq-chip bad">At law</span>` : nothing}
        ${f.seized
          ? html`<span class="cq-chip bad">A share seized</span>`
          : nothing}
        ${me.cooking
          ? html`<span class="cq-chip bad">Two sets of books</span>`
          : nothing}
      </p>
    </header>
    <div class="cq-firm-partners">
      ${f.partners.map((p) => {
        const c = s.chars[p.c];
        return html`<div class="cq-firm-partner ${p.c === life.c ? "you" : ""}">
          ${token(ui, c, "small")}
          <span class="cq-firm-pname">
            ${p.c === life.c ? html`<b>You</b>` : charLink(ui, c, false)}
            <span class="cq-muted small"
              >${p.role === "managing" ? "managing" : "silent"}${lifeOfChar(
                s,
                p.c,
              ) && p.c !== life.c
                ? " · player"
                : ""}</span
            >
          </span>
          <span class="cq-firm-share" title="Share of profit and loss">
            <span class="cq-firm-sharebar"
              ><i style="width:${Math.max(2, Math.min(100, p.share))}%"></i
            ></span>
            <b>${Math.round(p.share * 10) / 10}%</b>
          </span>
          <span class="cq-firm-cap small"
            >${num(money(p.capital), () => ({
              title: "Capital account",
              notes: [
                "What they brought in (coins, and a business or a paper at what it would fetch). A winding up pays the debts, then returns capital, then shares out the rest.",
                `Drawn so far: ${money(p.drawn)} coins.`,
              ],
            }))}
            in</span
          >
        </div>`;
      })}
    </div>
    <div class="cq-stats cq-firm-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">The chest</span>
        <span class="cq-stat-value">${money(f.chest)}</span>
        <span class="cq-stat-note"
          >${f.debt ? `owes ${money(f.debt)}` : "owes nothing"}</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Last month</span>
        ${last
          ? num(
              signed(last.profit),
              () => ({
                title: `${formatMonth(last.day)}: the books`,
                b: {
                  total: last.profit,
                  parts: [
                    { label: "Takings", value: last.takings },
                    { label: "Costs", value: -last.costs },
                  ],
                },
                notes: last.note ? [last.note] : undefined,
              }),
              `cq-stat-value ${last.profit < 0 ? "bad" : ""}`,
            )
          : html`<span class="cq-stat-value">–</span>`}
        <span class="cq-stat-note"
          >${last
            ? `yours ${signed((last.profit * me.share) / 100)}`
            : "first books at the month's end"}</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">A month, going</span>
        ${v
          ? num(
              signed(v.profit),
              () => breakdownTip("A month as it stands", v.why, signed),
              `cq-stat-value ${v.profit < 0 ? "bad" : ""}`,
            )
          : html`<span class="cq-stat-value">${signed(avgProfit(s, f))}</span>`}
        <span class="cq-stat-note"
          >${v
            ? v.minding
              ? `${mgr?.c === life.c ? "you mind" : `${s.chars[mgr?.c ?? -1]?.first ?? "the manager"} minds`} it`
              : (v.away ?? "nobody minding it")
            : "the paper's sales"}</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Your share's worth</span>
        ${num(
          money(worth),
          () => ({
            title: "What your share is worth",
            notes: [
              `Wound up today it would bring you ${money(wind)}.`,
              "A fair price to buy it (or be bought out): that, and a year of your share of its profit.",
            ],
          }),
          "cq-stat-value",
        )}
        <span class="cq-stat-note">a fair price</span>
      </div>
    </div>
    ${f.cargo
      ? html`<p class="cq-firm-cargo small">
          <span class="cq-chip">At sea</span> A cargo of ${f.cargo.name},
          ${f.cargo.stake} coins' worth, due home about
          ${formatMonth(f.cargo.due)}.
        </p>`
      : nothing}
    ${booksBlock(ui, f, me.share)} ${mattersBlock(ui, f)} ${putBlock(ui, f)}
    ${ownBlock(ui, f)}
    ${f.lines.length
      ? html`<details class="cq-more cq-firm-story">
          <summary>The firm's story</summary>
          <ul class="cq-more-body small">
            ${[...f.lines]
              .reverse()
              .slice(0, 8)
              .map(
                (l) =>
                  html`<li>
                    <span class="cq-muted">${formatDate(l.day)}</span> ${l.text}
                  </li>`,
              )}
          </ul>
        </details>`
      : nothing}
  </article>`;
}

/** The books: a year of months as a chart, and the last few as a ledger. */
function booksBlock(ui: GameUi, f: Firm, share: number): TemplateResult {
  const rows = f.books.slice(-12);
  if (!rows.length)
    return html`<p class="cq-muted small cq-firm-nobooks">
      The books open at the month's end: takings, costs, and what's divided.
    </p>`;
  const W = 240;
  const H = 54;
  const max = Math.max(1, ...rows.map((b) => Math.abs(b.profit)));
  const bw = W / 12;
  // The line of nothing at the foot when every month made money, at the
  // top when none did, and in the middle otherwise.
  const ups = rows.some((b) => b.profit > 0);
  const downs = rows.some((b) => b.profit < 0);
  const zero = ups && downs ? H / 2 : downs ? 3 : H - 3;
  const room = ups && downs ? H / 2 - 3 : H - 6;
  const chart = svg`<svg class="cq-firm-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit by month">
    <line x1="0" x2="${W}" y1="${zero}" y2="${zero}" class="axis" />
    ${rows.map((b, i) => {
      const h = Math.max(1, (Math.abs(b.profit) / max) * room);
      const x = (12 - rows.length + i) * bw + bw * 0.18;
      const y = b.profit >= 0 ? zero - h : zero;
      return svg`<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${h}" class=${b.profit >= 0 ? "up" : "down"}><title>${formatMonth(b.day)}: ${signed(b.profit)}</title></rect>`;
    })}
  </svg>`;
  const recent = [...f.books].slice(-5).reverse();
  return html`<div class="cq-firm-books">
    <h4 class="cq-int-group">The books</h4>
    ${chart}
    <table class="cq-firm-ledger small">
      <thead>
        <tr>
          <th>Month</th>
          <th>Takings</th>
          <th>Costs</th>
          <th>Divided</th>
          <th>Yours</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map(
          (b) =>
            html`<tr title=${b.note ?? ""}>
              <td>
                ${formatMonth(b.day)}${b.note ? html` <i>*</i>` : nothing}
              </td>
              <td>${money(b.takings)}</td>
              <td>${money(b.costs)}</td>
              <td class=${b.profit < 0 ? "bad" : ""}>${signed(b.profit)}</td>
              <td class=${b.profit < 0 ? "bad" : ""}>
                ${signed((b.profit * share) / 100)}
              </td>
            </tr>`,
        )}
      </tbody>
    </table>
    ${recent.some((b) => b.note)
      ? html`<p class="cq-muted small cq-firm-notes">
          ${recent
            .filter((b) => b.note)
            .slice(0, 2)
            .map((b) => html`* ${formatMonth(b.day)}: ${b.note}. `)}
        </p>`
      : nothing}
  </div>`;
}

/** Matters before the partners, and how they've gone lately. */
function mattersBlock(ui: GameUi, f: Firm): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const open = f.decisions.filter((d) => d.status === "open");
  const done = f.decisions
    .filter((d) => d.status !== "open")
    .slice(-3)
    .reverse();
  if (!open.length && !done.length) return html``;
  return html`<div class="cq-firm-matters">
    <h4 class="cq-int-group">Put to the partners</h4>
    <ul class="cq-firm-dlist">
      ${open.map((d) => matterRow(ui, f, d, life.c))}
      ${done.map(
        (d) =>
          html`<li class="done ${d.status}">
            <span class="cq-firm-dwords"
              >${decisionWords(s, f, d)}
              <span class="cq-muted small"
                >${formatDate(d.day)}, put by
                ${d.by === life.c ? "you" : charName(s.chars[d.by])}</span
              ></span
            >
            <span class="cq-chip ${d.status === "carried" ? "good" : "bad"}"
              >${d.status}</span
            >
          </li>`,
      )}
    </ul>
  </div>`;
}

function matterRow(
  ui: GameUi,
  f: Firm,
  d: FirmDecision,
  me: number,
): TemplateResult {
  const s = ui.s;
  const t = tally(f, d);
  const mine = d.votes[me];
  return html`<li class="open">
    <span class="cq-firm-dwords"
      >${decisionWords(s, f, d)}
      <span class="cq-muted small"
        >put by ${d.by === me ? "you" : charName(s.chars[d.by])}; decided by
        ${formatDate(d.until)} at the latest</span
      >
    </span>
    <span class="cq-firm-tally" aria-label="Votes so far">
      <i class="aye" style="width:${t.aye}%"></i
      ><i class="no" style="width:${t.no}%"></i>
    </span>
    <span class="cq-firm-votes small">
      ${f.partners.map((p) => {
        const v = d.votes[p.c];
        const why = d.why?.[p.c];
        return html`<span
          class="cq-firm-vote ${v === 1 ? "aye" : v === -1 ? "no" : ""}"
          title=${why ?? ""}
          >${p.c === me ? "You" : s.chars[p.c]?.first}:
          ${v === 1 ? "aye" : v === -1 ? "no" : "…"}${why
            ? html` <i>(${why.toLowerCase()})</i>`
            : nothing}</span
        >`;
      })}
    </span>
    ${mine === undefined
      ? html`<span class="cq-btnrow">
          <button
            class="cq-btn small primary"
            @click=${() =>
              ui.cmd({
                k: "partners",
                act: "vote",
                id: f.id,
                d: d.id,
                yes: true,
              })}
          >
            Aye
          </button>
          <button
            class="cq-btn small"
            @click=${() =>
              ui.cmd({
                k: "partners",
                act: "vote",
                id: f.id,
                d: d.id,
                yes: false,
              })}
          >
            No
          </button>
        </span>`
      : nothing}
  </li>`;
}

const ARG_CHOICES: Partial<Record<FirmDecisionKey, number[]>> = {
  loan: LOANS,
  goods: CARGOES,
  call: CALLS,
};

/** What you could put to the partners now. */
function putBlock(ui: GameUi, f: Firm): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const pick = pickFor.get(f.id) ?? {
    key: "goods" as FirmDecisionKey,
    arg: 0,
    c: -1,
    cap: 20,
  };
  pickFor.set(f.id, pick);
  const others = f.partners.filter((p) => p.c !== life.c);
  const newcomers = [
    ...new Map(
      [
        ...peopleHere(s, life.prov, life),
        ...s.lives
          .filter((l) => l.c >= 0 && !l.watching)
          .map((l) => s.chars[l.c]),
      ]
        .filter(
          (c): c is Character =>
            !!c?.alive &&
            ageOf(s, c) >= 16 &&
            c.id !== life.c &&
            !partnerIn(f, c.id),
        )
        .map((c) => [c.id, c]),
    ).values(),
  ].slice(0, 12);
  const keys = (Object.keys(DECISIONS) as FirmDecisionKey[]).filter(
    (k) =>
      f.hold !== "paper" || k === "admit" || k === "buyout" || k === "sell",
  );
  const arg = (k: FirmDecisionKey) =>
    ARG_CHOICES[k]
      ? ARG_CHOICES[k]!.includes(pick.arg) && pick.key === k
        ? pick.arg
        : ARG_CHOICES[k]![0]
      : k === "admit"
        ? Math.max(5, Math.min(50, pick.key === k ? pick.arg || 20 : 20))
        : 0;
  const who = (k: FirmDecisionKey) =>
    k === "admit"
      ? newcomers.some((c) => c.id === pick.c) && pick.key === k
        ? pick.c
        : (newcomers[0]?.id ?? -1)
      : k === "buyout" || k === "manager"
        ? others.some((p) => p.c === pick.c) && pick.key === k
          ? pick.c
          : (others[0]?.c ?? -1)
        : -1;
  const set = (patch: Partial<typeof pick>) => {
    Object.assign(pick, patch);
    ui.redraw();
  };
  const row = (k: FirmDecisionKey) => {
    const a = arg(k);
    const c = who(k);
    const check = decisionCheck(s, life, f, k, a, c, pick.cap);
    const cost = decisionCost(f, k);
    const label =
      k === "expand"
        ? f.biz
          ? `Grow it (${cost})`
          : f.lost
            ? `Fit out another ${f.lost.name} (${cost})`
            : DECISIONS[k].label
        : k === "buyout" && c >= 0
          ? `Buy them out (${buyoutPrice(s, f, c)})`
          : DECISIONS[k].label;
    return html`<li class="cq-firm-put">
      <span class="cq-firm-put-text">
        <b>${DECISIONS[k].label}</b>
        <span class="cq-muted small">${DECISIONS[k].text}</span>
      </span>
      <span class="cq-firm-put-do">
        ${ARG_CHOICES[k]
          ? html`<span
              class="cq-seg small"
              role="radiogroup"
              aria-label="How much"
            >
              ${ARG_CHOICES[k]!.map(
                (n) =>
                  html`<button
                    role="radio"
                    aria-checked=${a === n}
                    @click=${() => set({ key: k, arg: n })}
                  >
                    ${n}
                  </button>`,
              )}
            </span>`
          : nothing}
        ${k === "buyout" || k === "manager"
          ? html`<select
              class="cq-firm-pick"
              aria-label="Which partner"
              @change=${(e: Event) =>
                set({
                  key: k,
                  c: Number((e.target as HTMLSelectElement).value),
                })}
            >
              ${others.map(
                (p) =>
                  html`<option value=${p.c} ?selected=${p.c === c}>
                    ${charName(s.chars[p.c])}
                  </option>`,
              )}
            </select>`
          : nothing}
        ${k === "admit"
          ? html`<select
                class="cq-firm-pick"
                aria-label="Who"
                @change=${(e: Event) =>
                  set({
                    key: k,
                    c: Number((e.target as HTMLSelectElement).value),
                  })}
              >
                ${newcomers.map(
                  (n) =>
                    html`<option value=${n.id} ?selected=${n.id === c}>
                      ${charName(n)}
                    </option>`,
                )}
              </select>
              <label class="cq-firm-num"
                >share
                <input
                  type="number"
                  min="5"
                  max="50"
                  step="5"
                  .value=${String(a)}
                  @change=${(e: Event) =>
                    set({
                      key: k,
                      arg: Number((e.target as HTMLInputElement).value) || 20,
                    })}
              /></label>
              <label class="cq-firm-num"
                >for
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="5"
                  .value=${String(pick.cap)}
                  @change=${(e: Event) =>
                    set({
                      key: k,
                      cap: Math.max(
                        0,
                        Number((e.target as HTMLInputElement).value) || 0,
                      ),
                    })}
              /></label>`
          : nothing}
        ${action(
          k === "sell"
            ? "Put it"
            : label.startsWith("Buy") ||
                label.startsWith("Grow") ||
                label.startsWith("Fit")
              ? label
              : "Put it",
          check,
          () =>
            ui.cmd({
              k: "partners",
              act: "decide",
              id: f.id,
              key: k,
              arg: a,
              c,
              cap: pick.cap,
            }),
          `small ${k === "sell" ? "risky" : ""}`,
        )}
      </span>
    </li>`;
  };
  return html`<details class="cq-more cq-firm-putmore">
    <summary>Put something to the partners</summary>
    <ul class="cq-more-body cq-firm-putlist">
      ${keys.map(row)}
    </ul>
  </details>`;
}

/** The managing partner's own business: the books, the name. */
function ownBlock(ui: GameUi, f: Firm): TemplateResult {
  const life = ui.life!;
  const me = partnerIn(f, life.c)!;
  const managing = me.role === "managing";
  const others = f.partners.length > 1;
  if (!managing) return html``;
  return html`<div class="cq-firm-own">
    ${renaming === f.id
      ? html`<span class="cq-firm-rename">
          <input
            type="text"
            maxlength="40"
            aria-label="The firm's name"
            .value=${newName}
            @input=${(e: Event) =>
              (newName = (e.target as HTMLInputElement).value)}
          />
          <button
            class="cq-btn small primary"
            @click=${async () => {
              if (
                await ui.cmd({
                  k: "partners",
                  act: "name",
                  id: f.id,
                  name: newName,
                })
              )
                renaming = -1;
              ui.redraw();
            }}
          >
            Paint the sign
          </button>
          <button
            class="cq-btn small quiet"
            @click=${() => {
              renaming = -1;
              ui.redraw();
            }}
          >
            Cancel
          </button>
        </span>`
      : html`<button
          class="cq-btn small quiet"
          @click=${() => {
            renaming = f.id;
            newName = f.name;
            ui.redraw();
          }}
        >
          Rename the firm
        </button>`}
    ${others
      ? me.cooking
        ? html`<button
            class="cq-btn small"
            @click=${() =>
              ui.cmd({ k: "partners", act: "books", id: f.id, yes: false })}
          >
            Keep honest books again
          </button>`
        : html`<button
            class="cq-btn small quiet risky"
            title="A quarter of the takings into your own pocket each month, until a partner looks: a lawsuit, or the end of the firm."
            @click=${() =>
              ui.cmd({ k: "partners", act: "books", id: f.id, yes: true })}
          >
            Keep a second set of books…
          </button>`
      : nothing}
  </div>`;
}

// ---------------------------------------------------------------- the articles (drawing them up)

interface Draft {
  key: string;
  c: number;
  choice: string;
  job: JobKind | null;
  level: number;
  terms: FirmTerms | null;
}
let draft: Draft = {
  key: "",
  c: -1,
  choice: "",
  job: null,
  level: 1,
  terms: null,
};

/** The choices, with every "found:" folded into one. */
function choicesFor(
  ui: GameUi,
  c: Character,
): {
  list: HoldChoice[];
  found: HoldChoice[];
} {
  const all = holdChoices(ui.s, ui.w, ui.life!, c);
  return {
    list: all.filter((x) => !x.key.startsWith("found:")),
    found: all.filter((x) => x.key.startsWith("found:")),
  };
}

function rebuild(ui: GameUi, c: Character): void {
  const { list, found } = choicesFor(ui, c);
  let ch: HoldChoice | undefined;
  if (draft.choice === "found") {
    // Your own trade first, then theirs, then whatever the town has room for.
    const want = [draft.job, ui.life!.job?.kind ?? null, bizJobOfRole(c)];
    ch =
      want.map((j) => found.find((x) => x.job === j)).find(Boolean) ?? found[0];
    draft.job = ch?.job ?? null;
  } else ch = list.find((x) => x.key === draft.choice);
  if (!ch) {
    ch = list.find((x) => !x.why) ?? found[0] ?? list[0];
    draft.choice = ch?.key.startsWith("found:") ? "found" : (ch?.key ?? "");
    draft.job = ch?.job ?? null;
  }
  draft.terms = ch
    ? suggestTerms(ui.s, ui.w, ui.life!, c, ch, draft.level)
    : null;
}

/** The articles drawn up: what the firm holds, shares, capital, who manages. */
export function articlesModal(ui: GameUi, m: { c: number }): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  const me = ui.me;
  const c = s.chars[m.c];
  if (!life || !me || !c) return html`<p class="cq-muted">You're watching.</p>`;
  const key = `${ui.modalSeq}|${m.c}`;
  if (draft.key !== key) {
    draft = { key, c: m.c, choice: "", job: null, level: 1, terms: null };
    rebuild(ui, c);
  }
  const t = draft.terms;
  const here =
    !life.travel && peopleHere(s, life.prov, life).some((x) => x.id === c.id);
  const post = !here;
  const route = post ? routeTo(s, ui.map, life, c) : null;
  const other = lifeOfChar(s, c.id);
  const { list, found } = choicesFor(ui, c);
  const redraw = () => ui.redraw();
  if (!t)
    return html`<p class="cq-muted">
      There's nothing the two of you could go into.
    </p>`;
  const check = termsCheck(s, ui.w, life, t, post);
  const fair = fairShares(s, t);
  const fc = articlesForecast(s, t);
  const accept = other ? null : articlesAcceptance(s, t, c, life);
  const lawyers = lawyersHere(s, life);
  const cost = foundingCost(t);
  const chest = t.sides[0].cap + t.sides[1].cap - cost;
  const setShare = (v: number) => {
    t.sides[0].share = Math.max(5, Math.min(95, Math.round(v / 5) * 5));
    t.sides[1].share = 100 - t.sides[0].share;
    redraw();
  };
  const setCap = (i: 0 | 1, v: number) => {
    t.sides[i].cap = Math.max(0, Math.min(999, Math.round(v) || 0));
    redraw();
  };
  const pickChoice = (k: string) => {
    if (k === "found" && draft.choice !== "found") draft.job = null;
    draft.choice = k;
    rebuild(ui, c);
    redraw();
  };
  const youManage = t.sides[0].role === "managing";
  const lockedManager =
    t.hold === "paper" || (t.hold === "biz" && t.holder === c.id && !other);
  return html`<div class="cq-articles">
    <header class="cq-articles-head">
      <span class="cq-articles-sitter"
        >${token(ui, me, "small")}<b>You</b></span
      >
      <span class="cq-articles-title">
        <span class="cq-articles-kicker">Articles of</span>
        <h2>Copartnership</h2>
        <span class="cq-muted small"
          >between ${charName(me)} and
          ${charName(c)}${post
            ? route
              ? html`, by post: about ${route.days} days, ${route.cost}
                postage${route.risk
                  ? `, ${Math.round(route.risk * 100)}% lost at sea`
                  : ""}`
              : ", but no post goes there"
            : ", in person"}</span
        >
      </span>
      <span class="cq-articles-sitter"
        >${token(ui, c, "small")}<b>${c.first}</b></span
      >
    </header>
    <div class="cq-articles-body">
      <div class="cq-articles-main">
        <ol class="cq-articles-clauses">
          <li>
            <h4><span>I.</span> What the firm shall hold</h4>
            <div
              class="cq-articles-holds"
              role="radiogroup"
              aria-label="What the firm holds"
            >
              ${list.map(
                (x) =>
                  html`<button
                    role="radio"
                    aria-checked=${draft.choice === x.key}
                    class="cq-articles-hold ${draft.choice === x.key
                      ? "on"
                      : ""}"
                    ?disabled=${!!x.why}
                    title=${x.why ?? ""}
                    @click=${() => pickChoice(x.key)}
                  >
                    ${x.label}${x.why
                      ? html`<span class="cq-why">${x.why}</span>`
                      : nothing}
                  </button>`,
              )}
              ${found.length
                ? html`<button
                    role="radio"
                    aria-checked=${draft.choice === "found"}
                    class="cq-articles-hold ${draft.choice === "found"
                      ? "on"
                      : ""}"
                    @click=${() => pickChoice("found")}
                  >
                    A new business at ${ui.map.provinces[life.prov]?.name},
                    founded together
                  </button>`
                : nothing}
            </div>
            ${draft.choice === "found"
              ? html`<div class="cq-articles-found">
                  <label class="cq-field"
                    ><span>The trade</span>
                    <select
                      @change=${(e: Event) => {
                        draft.job = (e.target as HTMLSelectElement)
                          .value as JobKind;
                        rebuild(ui, c);
                        redraw();
                      }}
                    >
                      ${found.map(
                        (x) =>
                          html`<option
                            value=${x.job!}
                            ?selected=${x.job === draft.job}
                          >
                            ${bizName(x.job!, 1)}
                            (${JOBS[x.job!].name.toLowerCase()})
                          </option>`,
                      )}
                    </select></label
                  >
                  <span
                    class="cq-seg small"
                    role="radiogroup"
                    aria-label="How big"
                  >
                    ${[1, 2, 3].map(
                      (lv) =>
                        html`<button
                          role="radio"
                          aria-checked=${draft.level === lv}
                          @click=${() => {
                            draft.level = lv;
                            rebuild(ui, c);
                            redraw();
                          }}
                        >
                          ${["", "I", "II", "III"][lv]}
                          <span
                            >${bizCost(draft.job ?? "craftsman", lv)},
                            ${bizRoom(lv)} hands</span
                          >
                        </button>`,
                    )}
                  </span>
                </div>`
              : nothing}
          </li>
          <li>
            <h4><span>II.</span> The name and firm</h4>
            <input
              class="cq-articles-name"
              type="text"
              maxlength="40"
              aria-label="The firm's name"
              .value=${t.name}
              @input=${(e: Event) => {
                t.name = (e.target as HTMLInputElement).value;
              }}
              @change=${redraw}
            />
          </li>
          <li>
            <h4><span>III.</span> Shares of the profit and loss</h4>
            <div class="cq-articles-shares">
              <span class="cq-articles-side"
                ><b>${t.sides[0].share}</b> yours</span
              >
              <span class="cq-articles-slider">
                <input
                  type="range"
                  min="5"
                  max="95"
                  step="5"
                  aria-label="Your share"
                  .value=${String(t.sides[0].share)}
                  @input=${(e: Event) =>
                    setShare(Number((e.target as HTMLInputElement).value))}
                />
                <i
                  class="cq-articles-fair"
                  style="left:${fair[0]}%"
                  title="A fair split: ${fair[0]} to ${fair[1]}"
                ></i>
              </span>
              <span class="cq-articles-side right"
                ><b>${t.sides[1].share}</b> ${c.first}'s</span
              >
            </div>
            <p class="cq-muted small">
              Fair, by what each brings and who does the work: ${fair[0]} to
              ${fair[1]}.
            </p>
          </li>
          <li>
            <h4><span>IV.</span> Capital brought in</h4>
            <div class="cq-articles-caps">
              <label class="cq-firm-num"
                >Yours
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="5"
                  .value=${String(t.sides[0].cap)}
                  @change=${(e: Event) =>
                    setCap(0, Number((e.target as HTMLInputElement).value))}
                />
                coins</label
              >
              <label class="cq-firm-num"
                >${c.first}'s
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="5"
                  .value=${String(t.sides[1].cap)}
                  @change=${(e: Event) =>
                    setCap(1, Number((e.target as HTMLInputElement).value))}
                />
                coins</label
              >
            </div>
            <p class="cq-muted small">
              ${cost
                ? html`Setting it up costs ${cost}; the chest keeps
                    <b class=${chest < 0 ? "bad" : ""}>${chest}</b> to work
                    with.`
                : html`In the chest at signing: <b>${chest}</b>.`}
              You have ${Math.floor(life.purse)}.
            </p>
          </li>
          <li>
            <h4><span>V.</span> The management</h4>
            <span
              class="cq-seg small"
              role="radiogroup"
              aria-label="Who manages"
            >
              <button
                role="radio"
                aria-checked=${youManage}
                ?disabled=${lockedManager && !youManage}
                @click=${() => {
                  t.sides[0].role = "managing";
                  t.sides[1].role = "silent";
                  redraw();
                }}
              >
                You manage
              </button>
              <button
                role="radio"
                aria-checked=${!youManage}
                ?disabled=${lockedManager && youManage}
                @click=${() => {
                  t.sides[0].role = "silent";
                  t.sides[1].role = "managing";
                  redraw();
                }}
              >
                ${c.first} manages
              </button>
            </span>
            <span
              class="cq-seg small"
              role="radiogroup"
              aria-label="How it's decided"
            >
              <button
                role="radio"
                aria-checked=${t.rule === "majority"}
                @click=${() => {
                  t.rule = "majority";
                  redraw();
                }}
              >
                By the greater part
              </button>
              <button
                role="radio"
                aria-checked=${t.rule === "unanimous"}
                @click=${() => {
                  t.rule = "unanimous";
                  redraw();
                }}
              >
                All together
              </button>
            </span>
            <p class="cq-muted small">
              The managing partner does the work and keeps the books; their
              skill in the trade makes the takings.
            </p>
          </li>
          <li>
            <h4><span>VI.</span> Drawn up by</h4>
            <select
              aria-label="Who draws up the articles"
              @change=${(e: Event) => {
                t.lawyer = Number((e.target as HTMLSelectElement).value);
                redraw();
              }}
            >
              <option value="-1" ?selected=${t.lawyer < 0}>
                Yourselves, no lawyer
              </option>
              ${lawyers.map(
                (x) =>
                  html`<option value=${x.c} ?selected=${t.lawyer === x.c}>
                    ${x.c === life.c
                      ? "You, as a lawyer"
                      : `${charName(s.chars[x.c])}, ${x.title.toLowerCase()}`}${x.fee
                      ? ` (${x.fee} coins)`
                      : ""}
                  </option>`,
              )}
            </select>
            <p class="cq-muted small">
              ${lawyers.length
                ? "A lawyer's articles lean your way when partners fall out: at arbitration, and in court."
                : "No attorney or law clerk here to draw them up."}
            </p>
          </li>
        </ol>
        <blockquote class="cq-articles-text">
          ${curly(articlesText(s, ui.map, t))}
        </blockquote>
      </div>
      <aside class="cq-articles-panel">
        <div class="cq-articles-verdict">
          <p class="small">
            ${t.hold === "venture"
              ? "Its profit is what its cargoes bring home."
              : html`Going, it should make about
                ${num(`${signed(fc.profit)} a month`, () =>
                  breakdownTip("A month, once it's going", fc.why, signed),
                )}:
                yours ${signed((fc.profit * t.sides[0].share) / 100)}.`}
          </p>
          ${other
            ? html`<div class="cq-accept player">
                <span class="cq-accept-verdict">${c.first} will decide</span>
                <span class="cq-muted small"
                  >Another player: they'll get the articles as a scene to sign,
                  decline or answer with their own terms.</span
                >
              </div>`
            : accept
              ? html`<div
                  class="cq-accept ${accept.total > 0 ? "will" : "wont"}"
                >
                  <span class="cq-accept-verdict"
                    >${accept.total > 0 ? "Will sign" : "Will refuse"}</span
                  >
                  <span class="cq-accept-score"
                    >${accept.total > 0 ? "+" : ""}${accept.total}</span
                  >
                  ${reasons(accept, 9, 9)}
                </div>`
              : nothing}
        </div>
        <div class="cq-articles-actions">
          <button
            class="cq-btn primary ${accept && accept.total <= 0 ? "risky" : ""}"
            ?disabled=${!check.ok}
            @click=${async () => {
              if (
                await ui.cmd({ k: "partners", act: "propose", terms: t, post })
              ) {
                play("seal");
                ui.modal({ k: "outcome" });
              }
            }}
          >
            ${post
              ? `Send them to ${c.first} by post`
              : `Put them to ${c.first}`}
          </button>
          <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
            Back
          </button>
          <p class="cq-why ${check.ok ? "none" : ""}">
            ${check.ok ? "" : check.why}
          </p>
        </div>
      </aside>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- the scene: articles put to you

let counter: {
  id: number;
  open: boolean;
  share: number;
  mine: number;
  theirs: number;
} = {
  id: -1,
  open: false,
  share: 50,
  mine: 0,
  theirs: 0,
};

/** Another player's articles (or their answer to yours): sign, decline, or your own terms. */
export function articlesScene(
  ui: GameUi,
  ev: LifeEventPending,
  hooks: ModalHooks,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const o = offerById(s, ev.ctx.o);
  const other = s.chars[ev.ctx.c];
  const scene = ev.scene ?? "market";
  if (!o || o.status !== "open" || o.to !== life.c)
    return shell(
      html`${stage(ui, {
          scene,
          other,
          me: "neutral",
          them: "neutral",
          day: ev.day,
        })}
        <div class="cq-scene-ribbon"><h2>${ev.title}</h2></div>
        <div class="cq-scene-text">
          <p>These articles have been settled.</p>
        </div>
        <div class="cq-scene-actions">
          <button class="cq-btn" @click=${() => ui.modal(null)}>Close</button>
        </div>`,
      scene,
      ev.key,
    );
  const t = o.terms;
  const i = t.sides[0].c === life.c ? 0 : 1;
  const mine = t.sides[i];
  const theirs = t.sides[1 - i];
  if (counter.id !== o.id)
    counter = {
      id: o.id,
      open: false,
      share: mine.share,
      mine: mine.cap,
      theirs: theirs.cap,
    };
  const firm = o.firm >= 0 ? firmById(s, o.firm) : undefined;
  const fc = articlesForecast(s, t, firm);
  const canPay = life.purse >= mine.cap;
  const run = async (c: Parameters<GameUi["cmd"]>[0]) => {
    if (await ui.cmd(c)) {
      play("seal");
      ui.modal({ k: "outcome" });
    }
  };
  const rows: [string, string, string][] = [
    [
      "Share of profit and loss",
      `${mine.share} in a hundred`,
      `${theirs.share} in a hundred`,
    ],
    [
      "Brings in",
      [
        t.holder === mine.c
          ? t.hold === "paper"
            ? "the paper"
            : "the business"
          : "",
        mine.cap ? `${mine.cap} coins` : "",
      ]
        .filter(Boolean)
        .join(" and ") || "nothing",
      [
        t.holder === theirs.c
          ? t.hold === "paper"
            ? "the paper"
            : "the business"
          : "",
        theirs.cap ? `${theirs.cap} coins` : "",
      ]
        .filter(Boolean)
        .join(" and ") || "nothing",
    ],
    [
      "Role",
      mine.role === "managing" ? "managing partner" : "silent partner",
      theirs.role === "managing" ? "managing partner" : "silent partner",
    ],
  ];
  return shell(
    html`${stage(ui, {
        scene,
        other,
        me: "neutral",
        them: "smile",
        day: ev.day,
        themSays: o.round ? "Their own terms" : undefined,
      })}
      <div class="cq-scene-ribbon">
        <h2>${ev.title}</h2>
        <span class="cq-scene-group"
          >${t.name}${o.round ? ` · round ${o.round + 1}` : ""}</span
        >
      </div>
      <div class="cq-scene-text cq-articles-deed">
        <p><i>${curly(articlesText(s, ui.map, t, o.day))}</i></p>
      </div>
      <table class="cq-articles-table small">
        <thead>
          <tr>
            <th></th>
            <th>You</th>
            <th>${other?.first ?? "They"}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            ([k, a, b]) =>
              html`<tr>
                <th>${k}</th>
                <td>${a}</td>
                <td>${b}</td>
              </tr>`,
          )}
        </tbody>
      </table>
      <p class="cq-muted small cq-articles-fc">
        ${t.hold === "venture"
          ? "A company for cargoes: its profit is what they bring home."
          : html`Going, it should make about
            ${num(`${signed(fc.profit)} a month`, () =>
              breakdownTip("A month, once it's going", fc.why, signed),
            )}:
            your share ${signed((fc.profit * mine.share) / 100)}.`}
        You have ${Math.floor(life.purse)} coins.
      </p>
      ${counter.open
        ? html`<div class="cq-articles-counter">
            <h4>Your own terms</h4>
            <div class="cq-articles-shares">
              <span class="cq-articles-side"
                ><b>${counter.share}</b> yours</span
              >
              <span class="cq-articles-slider">
                <input
                  type="range"
                  min="5"
                  max="95"
                  step="5"
                  aria-label="Your share"
                  .value=${String(counter.share)}
                  @input=${(e: Event) => {
                    counter.share = Number(
                      (e.target as HTMLInputElement).value,
                    );
                    ui.redraw();
                  }}
                />
              </span>
              <span class="cq-articles-side right"
                ><b>${100 - counter.share}</b> ${other?.first ??
                "theirs"}'s</span
              >
            </div>
            <div class="cq-articles-caps">
              <label class="cq-firm-num"
                >You put in
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="5"
                  .value=${String(counter.mine)}
                  @change=${(e: Event) => {
                    counter.mine = Math.max(
                      0,
                      Math.round(
                        Number((e.target as HTMLInputElement).value) || 0,
                      ),
                    );
                    ui.redraw();
                  }}
              /></label>
              <label class="cq-firm-num"
                >${other?.first ?? "They"} put${other ? "s" : ""} in
                <input
                  type="number"
                  min="0"
                  max="999"
                  step="5"
                  .value=${String(counter.theirs)}
                  @change=${(e: Event) => {
                    counter.theirs = Math.max(
                      0,
                      Math.round(
                        Number((e.target as HTMLInputElement).value) || 0,
                      ),
                    );
                    ui.redraw();
                  }}
              /></label>
            </div>
          </div>`
        : nothing}
      <ol class="cq-scene-choices cq-articles-choices">
        ${counter.open
          ? html`<li>
                <button
                  class="cq-choice"
                  @click=${() =>
                    run({
                      k: "partners",
                      act: "counter",
                      id: o.id,
                      share: counter.share,
                      mine: counter.mine,
                      theirs: counter.theirs,
                    })}
                >
                  <span class="cq-choice-label">Send back your terms</span>
                  <span class="cq-choice-tip"
                    >${other?.first ?? "They"} will see them as you put
                    them${lifeOfChar(s, o.from) &&
                    lifeOfChar(s, o.from)!.prov !== life.prov
                      ? ", by post"
                      : ""}.</span
                  >
                </button>
              </li>
              <li>
                <button
                  class="cq-choice"
                  @click=${() => {
                    counter.open = false;
                    ui.redraw();
                  }}
                >
                  <span class="cq-choice-label">Back to their terms</span>
                </button>
              </li>`
          : html`<li>
                <button
                  class="cq-choice ${canPay ? "" : "blocked"}"
                  ?disabled=${!canPay}
                  @click=${() => run({ k: "partners", act: "sign", id: o.id })}
                >
                  <span class="cq-choice-label">Sign the articles</span>
                  <span class="cq-choice-tip"
                    >${canPay
                      ? `The firm is made: ${mine.cap ? `${mine.cap} coins go into it, and ` : ""}your share of the profit comes out every month.`
                      : `You need ${mine.cap} coins.`}</span
                  >
                </button>
              </li>
              ${o.firm < 0
                ? html`<li>
                    <button
                      class="cq-choice"
                      @click=${() => {
                        counter.open = true;
                        ui.redraw();
                      }}
                    >
                      <span class="cq-choice-label">Your own terms…</span>
                      <span class="cq-choice-tip"
                        >Change the shares and what each of you puts in, and
                        send them back.</span
                      >
                    </button>
                  </li>`
                : nothing}
              <li>
                <button
                  class="cq-choice"
                  @click=${() =>
                    run({ k: "partners", act: "refuse", id: o.id })}
                >
                  <span class="cq-choice-label">Decline</span>
                  <span class="cq-choice-tip">They'll hear you said no.</span>
                </button>
              </li>`}
      </ol>
      <div class="cq-scene-foot">
        <p class="cq-muted small">
          ${letterClock(hooks, ev.id, "it's taken as a no")}
        </p>
        <button class="cq-btn quiet small" @click=${() => ui.modal(null)}>
          Decide later
        </button>
      </div>`,
    scene,
    ev.key,
  );
}

// ---------------------------------------------------------------- on someone's card

/** "In business": firms you share, theirs, and the articles. */
export function partnerCard(ui: GameUi, c: Character): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  if (isChildLife(s, life) || ageOf(s, c) < 16) return html``;
  const shared = firmsWith(s, life.c).filter((f) => partnerIn(f, c.id));
  const theirs = firmsWith(s, c.id).filter((f) => !partnerIn(f, life.c));
  const here =
    !life.travel && peopleHere(s, life.prov, life).some((x) => x.id === c.id);
  const can =
    firmsWith(s, life.c).length >= MAX_FIRMS
      ? {
          ok: false as const,
          why: `You're in ${MAX_FIRMS} partnerships already.`,
        }
      : life.travel
        ? { ok: false as const, why: "Not from the road." }
        : { ok: true as const };
  return html`<section class="cq-section cq-pa-card">
    <h3 class="cq-h3">In business</h3>
    <p class="cq-muted small">
      Go into partnership with ${c.first}: a business one of you has, a new one
      founded together, or cargoes.
      ${lifeOfChar(s, c.id)
        ? `${c.first} answers the articles ${c.female ? "herself" : "himself"}.`
        : `${c.first} will say yes or no, and why.`}
    </p>
    ${shared.length
      ? html`<ul class="cq-list small">
          ${shared.map(
            (f) =>
              html`<li>
                <button
                  class="cq-link"
                  @click=${() =>
                    ui.open({ k: "tab", tab: "estate", sub: "partners" })}
                >
                  ${f.name}
                </button>
                <span class="cq-muted"
                  >you ${partnerIn(f, life.c)!.share}, ${c.first}
                  ${partnerIn(f, c.id)!.share}</span
                >
              </li>`,
          )}
        </ul>`
      : nothing}
    ${theirs.length
      ? html`<p class="cq-muted small">
          A partner in ${theirs.map((f) => f.name).join(", ")}.
        </p>`
      : nothing}
    <div class="cq-btnrow">
      ${action(
        here ? "Propose a partnership…" : "Propose a partnership by post…",
        can,
        () => ui.modal({ k: "articles", c: c.id }),
        "small",
        undefined,
        true,
      )}
    </div>
  </section>`;
}

// ---------------------------------------------------------------- at the market, on the tiles

/** The market's "Partnerships": who here might go into business with you. */
export function partnerPart(
  ui: GameUi,
  p: number,
  area: PlaceKind,
): PlacePart | null {
  if (area !== "market") return null;
  const s = ui.s;
  const life = ui.life!;
  if (life.travel || life.prov !== p || isChildLife(s, life)) return null;
  const folk = likelyPartners(s, life);
  const firms = firmsAt(s, p);
  if (!folk.length && !firms.length) return null;
  return {
    key: "partners",
    title: "Partnerships",
    count: folk.length,
    note: firms.length
      ? `${firms.length} firm${firms.length > 1 ? "s" : ""} in town`
      : undefined,
    body: html`<ul class="cq-hiring cq-find-list cq-pa-folk">
        ${folk.map(
          (c) =>
            html`<li>
              ${token(ui, c, "small")}
              <span class="cq-folk-text">
                <b>${charName(c)}</b>
                <span class="cq-muted small"
                  >${lifeOfChar(s, c.id)
                    ? "another player"
                    : c.role
                      ? ROLES[c.role].title
                      : ""}${firmsWith(s, c.id).length
                    ? ` · partner in ${firmsWith(s, c.id)[0].name}`
                    : ""}</span
                >
              </span>
              <button
                class="cq-btn small cq-ask"
                @click=${() => ui.modal({ k: "articles", c: c.id })}
              >
                Articles…
              </button>
            </li>`,
        )}
      </ul>
      ${firms.length
        ? html`<p class="cq-muted small cq-pa-town">
            In town:
            ${firms.map(
              (f) =>
                html`<b>${f.name}</b> (${f.biz
                    ? bizName(f.biz.job, f.biz.level)
                    : "cargoes"}) `,
            )}
          </p>`
        : nothing}`,
  };
}

/** A firm's name on its place's tile (Here). */
export function firmTag(
  ui: GameUi,
  p: number,
  a: PlaceKind,
): TemplateResult | typeof nothing {
  const f = firmsAt(ui.s, p, a)[0];
  if (!f) return nothing;
  const mine = ui.life ? !!partnerIn(f, ui.life.c) : false;
  return html`<span
    class="cq-area-firm ${mine ? "mine" : ""}"
    title=${`${f.name}: ${f.biz ? bizName(f.biz.job, f.biz.level) : ""}`}
    >${f.name}</span
  >`;
}

void meOf;
