// LEDGER (r15): money made plain, in the browser. The month's figure with
// what's certain and what runs on luck apart (Estate › Purse, and the top
// bar's tooltip); Estate › Ledger, with everything of yours out working,
// news of your own affairs apart from the world's, and the month's
// statements; the acres you own by province (Estate › House & land); and the
// notices your own news comes as.

import { html, nothing, svg, TemplateResult } from "lit";
import { formatDate, formatMonth } from "../../engine/Calendar";
import {
  acresOf,
  affairsOf,
  type ForecastLine,
  LEDGER_GROUPS,
  ledgerForecast,
  statementTotals,
} from "../../engine/Ledger";
import { isChildLife } from "../../engine/LifeQueries";
import type {
  AffairItem,
  AffairKind,
  BookLine,
  JournalEntry,
  Life,
  Statement,
} from "../../engine/Types";
import { num } from "../Tip";
import { breakdownTip, GameUi, section } from "./Context";
import { howTo, pageHead } from "./Nav";
import { coins } from "./Price";

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${coins(Math.abs(v))}`;

// ---------------------------------------------------------------- the month's figure

/** A forecast line, with what made it on hover (a luck line: its range too). */
function fcLine(l: ForecastLine): TemplateResult {
  const val = html`<b class=${l.value >= 0 ? "good" : "bad"}
    >${l.chance ? "≈" : ""}${signed(l.value)}</b
  >`;
  const shown = l.parts?.length
    ? num(val, () =>
        breakdownTip(l.label, {
          total: l.value,
          parts: l.parts!.filter((p) => !p.mul),
        }),
      )
    : val;
  if (!l.chance)
    return html`<li>
      <span title=${l.label}>${l.label}</span><span>${shown}</span>
    </li>`;
  const range = l.chance[0] !== l.value || l.chance[1] !== l.value;
  const trip = l.key.startsWith("tr:");
  return html`<li class="luck">
    <span title=${l.label}
      >${trip ? l.label.replace(/ \(a trip:.*\)$/, "") : l.label}</span
    >
    <span class="cq-range"
      >${range
        ? `${signed(l.chance[0])} to ${signed(l.chance[1])}${trip ? " a trip" : ""}`
        : "about"}</span
    >
    ${shown}
  </li>`;
}

/**
 * The month as it should come: what comes in and goes out for certain, then
 * what runs on luck (voyages, cargoes, dividends, rents) as what's expected
 * and its range, and the month all told.
 */
export function forecastBlock(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const f = ledgerForecast(ui.s, ui.w, life);
  const order = (a: ForecastLine, b: ForecastLine) =>
    LEDGER_GROUPS.findIndex((x) => x.id === a.group) -
      LEDGER_GROUPS.findIndex((x) => x.id === b.group) ||
    Math.abs(b.value) - Math.abs(a.value);
  const fixed = f.lines.filter((l) => !l.chance).sort(order);
  const ins = fixed.filter((l) => l.value > 0);
  const outs = fixed.filter((l) => l.value < 0);
  const luck = f.lines.filter((l) => l.chance).sort(order);
  return html`<div class="cq-forecast">
    <div class="cq-forecast-cols">
      <div>
        <h4>Coming in</h4>
        <ul aria-label="Coming in">
          ${ins.length
            ? ins.map(fcLine)
            : html`<li class="cq-muted"><span>Nothing for certain</span></li>`}
        </ul>
      </div>
      <div>
        <h4>Going out</h4>
        <ul aria-label="Going out">
          ${outs.length
            ? outs.map(fcLine)
            : html`<li class="cq-muted"><span>Nothing</span></li>`}
        </ul>
      </div>
    </div>
    ${luck.length
      ? html`<div class="cq-forecast-chance">
          <h4>By luck: what's expected, from worst to best</h4>
          <ul aria-label="By luck">
            ${luck.map(fcLine)}
          </ul>
        </div>`
      : nothing}
    <p class="cq-forecast-total">
      <span
        >For certain:
        <b class=${f.fixed >= 0 ? "good" : "bad"}>${signed(f.fixed)}</b></span
      >
      ${luck.length
        ? html`<span
            >By luck, expected:
            <b class=${f.expected >= 0 ? "good" : "bad"}
              >≈${signed(f.expected)}</b
            ></span
          >`
        : nothing}
      <span
        >A month, all told:
        <b class=${f.total >= 0 ? "good" : "bad"}
          >${luck.length ? "≈" : ""}${signed(f.total)}</b
        >${luck.length && f.lo !== f.hi
          ? html`<span class="cq-range"
              >(from ${signed(f.lo)} to ${signed(f.hi)})</span
            >`
          : nothing}</span
      >
    </p>
  </div>`;
}

// ---------------------------------------------------------------- your own news

const KIND_NAMES: Record<AffairKind, string> = {
  boat: "Your boats",
  cargo: "A cargo",
  shares: "Your shares",
  trader: "Your trader",
  band: "Your band",
  people: "Your people",
  company: "Your company",
  firm: "Your partnership",
  paper: "Your newspaper",
  property: "Your property",
  contract: "A contract",
  statement: "The month's accounts",
};

/** What a notice of your own affairs is headed with. */
export function affairKindName(kind: AffairKind): string {
  return KIND_NAMES[kind] ?? "Your affairs";
}

const seenKey = (life: Life) => `cq-ledger-seen:${life.seat}:${life.joined}`;
const seenMemo = new Map<string, number>();

/** The day up to which your own news has been looked at. */
function seenDay(life: Life): number {
  const k = seenKey(life);
  if (!seenMemo.has(k)) {
    let v: number;
    try {
      v = Number(localStorage.getItem(k) ?? -1);
    } catch {
      v = -1;
    }
    seenMemo.set(k, Number.isFinite(v) ? v : -1);
  }
  return seenMemo.get(k)!;
}

function markSeen(life: Life, day: number): void {
  const k = seenKey(life);
  if ((seenMemo.get(k) ?? -1) >= day) return;
  seenMemo.set(k, day);
  try {
    localStorage.setItem(k, String(day));
  } catch {
    // A private window: it's remembered for this visit only.
  }
}

/** News of your own affairs (not the month's accounts) you haven't looked at yet. */
export function affairsUnseen(life: Life | null): number {
  if (!life || life.watching) return 0;
  const since = seenDay(life);
  let n = 0;
  for (let i = life.journal.length - 1; i >= 0; i--) {
    const e = life.journal[i];
    if (e.day <= since) break;
    if (e.aff && e.aff !== "statement") n++;
  }
  return n;
}

// ---------------------------------------------------------------- icons

const ico = (body: TemplateResult | ReturnType<typeof svg>) =>
  html`<svg
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${body}
  </svg>`;

function affairIcon(kind: AffairKind): TemplateResult {
  switch (kind) {
    case "boat":
      return ico(
        svg`<path d="M4 21h24l-4 6H8z"/><path d="M16 21V4"/><path d="M16 5q8 7 0 14z"/><path d="M15 7q-7 6 0 11z"/>`,
      );
    case "cargo":
      return ico(
        svg`<path d="M6 11l10-5 10 5v11l-10 5-10-5z"/><path d="M6 11l10 5 10-5M16 16v11"/><path d="M11 8.5l10 5"/>`,
      );
    case "shares":
      return ico(
        svg`<path d="M8 4h13l4 4v20H8z"/><path d="M21 4v4h4"/><path d="M12 13h9M12 17h9M12 21h6"/>`,
      );
    case "trader":
      return ico(
        svg`<path d="M16 5v22M8 27h16"/><path d="M6 9h20"/><path d="M6 9l-3 8h6zM26 9l-3 8h6z"/>`,
      );
    case "band":
      return ico(
        svg`<path d="M5 12q11-5 22 0-1 7-6 7-3 0-5-3-2 3-5 3-5 0-6-7z"/><circle cx="11" cy="13" r="1.4"/><circle cx="21" cy="13" r="1.4"/>`,
      );
    case "company":
      return ico(svg`<path d="M9 28V4"/><path d="M9 5h15l-4 5 4 5H9"/>`);
    case "firm":
      return ico(
        svg`<path d="M4 8h24"/><path d="M9 8v4M23 8v4"/><rect x="6" y="12" width="20" height="9" rx="1"/><path d="M10 16.5h12"/>`,
      );
    case "paper":
      return ico(
        svg`<rect x="5" y="6" width="22" height="20" rx="1"/><path d="M9 10h14M9 14h6M9 18h6M9 22h6M18 14h5v8h-5z"/>`,
      );
    case "contract":
      return ico(
        svg`<path d="M7 4h14l4 4v12"/><path d="M7 4v22h10"/><circle cx="22" cy="24" r="4"/><path d="M20 27.5l-1 3 3-1.5 3 1.5-1-3"/>`,
      );
    default:
      return ico(
        svg`<circle cx="16" cy="11" r="4.5"/><path d="M7 27q1-9 9-9t9 9"/>`,
      );
  }
}

// ---------------------------------------------------------------- the tracker

/** "back in 12 days", "home about 3 May 1702", "reckoned at the month's turn". */
function dueWords(ui: GameUi, a: AffairItem): string {
  if (a.due === undefined) return "";
  const left = a.due - ui.s.day;
  if (a.kind === "boat" || a.kind === "shares" || a.kind === "paper")
    return left <= 1 ? "reckoned tomorrow" : `reckoned in ${left} days`;
  if (left <= 0) return "due now";
  return left <= 45
    ? `back in ${left} day${left === 1 ? "" : "s"}`
    : `due about ${formatDate(a.due)}`;
}

function affairCard(ui: GameUi, a: AffairItem): TemplateResult {
  const e = a.expected;
  const per =
    e?.per === "month" ? "a month" : e?.per === "trip" ? "a trip" : "when home";
  return html`<li class="cq-affair ${a.warn ? "warn" : ""}">
    <span class="cq-affair-icon">${affairIcon(a.kind)}</span>
    <div class="cq-affair-body">
      <b>${a.title}</b>
      <p>${a.what}</p>
      ${a.warn ? html`<p class="cq-why">${a.warn}</p>` : nothing}
    </div>
    <div class="cq-affair-side">
      <span class="cq-chip">${a.status}</span>
      ${e
        ? html`<small
            >${e.per === "home" ? "" : "≈"}<b
              class=${e.value >= 0 ? "good" : "bad"}
              >${e.per === "home" ? coins(e.value) : signed(e.value)}</b
            >
            ${per}${e.lo !== e.hi
              ? html` (${e.per === "home" ? coins(e.lo) : signed(e.lo)} to
                ${e.per === "home" ? coins(e.hi) : signed(e.hi)})`
              : nothing}</small
          >`
        : nothing}
      ${a.cost
        ? html`<small
            ><span class=${a.cost < 0 ? "bad" : "good"}>${signed(a.cost)}</span>
            a month to keep</small
          >`
        : nothing}
      ${a.due !== undefined ? html`<small>${dueWords(ui, a)}</small>` : nothing}
      ${a.go
        ? html`<button
            class="cq-btn small quiet"
            @click=${() =>
              ui.open({
                k: "tab",
                tab: a.go!.tab as "estate",
                sub: a.go!.sub,
              })}
          >
            See to it
          </button>`
        : nothing}
    </div>
  </li>`;
}

// ---------------------------------------------------------------- statements

/** The statement opened from a notice (by the day it was closed). */
let openStatement: number | null = null;

/** Open Estate › Ledger at the latest month's accounts. */
export function showStatement(ui: GameUi, day?: number): void {
  const life = ui.life;
  const list = life?.statements ?? [];
  openStatement = day ?? list[list.length - 1]?.to ?? null;
  ui.open({ k: "tab", tab: "estate", sub: "ledger" });
}

function stmtRows(
  lines: BookLine[],
  exp: Record<string, number> | undefined,
  head = false,
): TemplateResult {
  return html`<table>
    ${head && exp
      ? html`<tr class="cq-stmt-head">
          <td></td>
          <td class="exp">expected</td>
          <td class="exp">came to</td>
        </tr>`
      : nothing}
    ${lines.map(
      (l) =>
        html`<tr>
          <td class=${l.c ? "luck" : ""}>${l.l}</td>
          ${exp
            ? html`<td class="exp" title="What the month's forecast expected">
                ${exp[l.k] !== undefined
                  ? `${l.c ? "≈" : ""}${signed(exp[l.k])}`
                  : ""}
              </td>`
            : nothing}
          <td class=${l.v >= 0 ? "good" : "bad"}>${signed(l.v)}</td>
        </tr>`,
    )}
  </table>`;
}

function statementView(st: Statement): TemplateResult {
  const turn = st.lines.filter((l) => l.t);
  const fixedIn = turn.filter((l) => !l.c && l.v > 0);
  const fixedOut = turn.filter((l) => !l.c && l.v < 0);
  const luck = turn.filter((l) => l.c);
  const during = st.lines
    .filter((l) => !l.t)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const t = statementTotals(st);
  const exp = st.exp;
  return html`<div class="cq-statement">
    ${fixedIn.length
      ? html`<h5>At the month's turn: in</h5>
          ${stmtRows(fixedIn, exp, true)}`
      : nothing}
    ${fixedOut.length
      ? html`<h5>At the month's turn: out</h5>
          ${stmtRows(fixedOut, exp, !fixedIn.length)}`
      : nothing}
    ${luck.length
      ? html`<h5>By luck</h5>
          ${stmtRows(luck, exp)}`
      : nothing}
    ${during.length
      ? html`<h5>During the month</h5>
          ${stmtRows(during, undefined)}`
      : nothing}
    <p class="cq-statement-foot">
      <span>Purse ${coins(st.open)} → ${coins(st.close)}</span>
      <span>In ${coins(t.inn)}, out ${coins(t.out)}</span>
      <b class=${t.net >= 0 ? "good" : "bad"}>${signed(t.net)} all told</b>
      ${st.expected !== undefined
        ? html`<span class="cq-muted"
            >The month's turn was expected at ${signed(st.expected)}</span
          >`
        : nothing}
    </p>
  </div>`;
}

function statementsSection(ui: GameUi): TemplateResult {
  const life = ui.life!;
  const list = (life.statements ?? []).slice().reverse();
  const want = openStatement;
  openStatement = null;
  return section(
    "The month's accounts",
    list.length
      ? html`<ul class="cq-statements">
          ${list.map((st, i) => {
            const t = statementTotals(st);
            return html`<li>
              <details ?open=${want !== null ? st.to === want : i === 0}>
                <summary>
                  <span>${formatMonth(st.to - 1)}</span>
                  <span class="wide">in ${coins(t.inn)}</span>
                  <span class="wide">out ${coins(t.out)}</span>
                  <b class=${t.net >= 0 ? "good" : "bad"}>${signed(t.net)}</b>
                </summary>
                ${statementView(st)}
              </details>
            </li>`;
          })}
        </ul>`
      : howTo(
          "The first month's accounts come at the month's turn: every coin in and out, line by line.",
          [],
        ),
  );
}

// ---------------------------------------------------------------- the page

/** Estate › Ledger: what's out working, your own news, and the month's accounts. */
export function ledgerPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const head = pageHead(
    "Ledger",
    "Everything of yours out working, news of your own affairs kept apart from the world's, and every month's accounts, line by line.",
  );
  if (isChildLife(s, life))
    return html`${head}
      <p class="cq-empty">Not until you're sixteen.</p>`;
  const items = affairsOf(s, ui.w, life);
  const since = seenDay(life);
  const unseen = affairsUnseen(life);
  markSeen(life, s.day);
  // The tab's mark was drawn before this page: draw it again, unmarked.
  if (unseen) queueMicrotask(() => ui.redraw());
  const news: JournalEntry[] = [];
  for (let i = life.journal.length - 1; i >= 0 && news.length < 14; i--) {
    const e = life.journal[i];
    if (e.aff && e.aff !== "statement") news.push(e);
  }
  const costs = items.reduce((m, a) => m + Math.min(0, a.cost ?? 0), 0);
  const monthly = items.reduce(
    (m, a) => m + (a.expected?.per === "month" ? a.expected.value : 0),
    0,
  );
  return html`${head}
  ${section(
    html`Out working
      <span class="cq-muted small"
        >${items.length ? `${items.length}` : "nothing yet"}</span
      >`,
    items.length
      ? html`<p class="cq-affairs-sum">
            ${costs
              ? html`<span
                  >Keeping them: <b class="bad">${signed(costs)}</b> a
                  month</span
                >`
              : nothing}
            ${monthly
              ? html`<span
                  >Their work, expected:
                  <b class=${monthly >= 0 ? "good" : "bad"}
                    >≈${signed(monthly)}</b
                  >
                  a month</span
                >`
              : nothing}
          </p>
          <ul class="cq-affairs">
            ${items.map((a) => affairCard(ui, a))}
          </ul>`
      : howTo("Nothing of yours is out working yet. Money can work for you:", [
          "A boat of your own fishing, whaling, trading or privateering (the docks' boatyard, Estate › Boats), with a crew and you or a mate aboard.",
          "A clerk sent trading with a stake (hire one at the market or the docks: People › Your people).",
          "A cargo ventured, or shares in a company (the docks, the market).",
          "A partnership (anyone's card, or Estate › Partnerships).",
        ]),
  )}
  ${section(
    "News of your affairs",
    news.length
      ? html`<ul class="cq-own-news">
          ${news.map(
            (e) =>
              html`<li class="${e.tone ?? ""} ${e.day > since ? "fresh" : ""}">
                <time>${formatDate(e.day).replace(/ \d{4}$/, "")}</time>
                <span>${e.text}</span>
              </li>`,
          )}
        </ul>`
      : html`<p class="cq-muted small">
          What your boats, cargoes, traders and partnerships come to will be
          written here, apart from the news of the world.
        </p>`,
    html`<button
      class="cq-btn small quiet"
      style="margin-left:auto"
      @click=${() => {
        journalAffairs();
        ui.open({ k: "tab", tab: "journal", sub: "diary" });
      }}
    >
      All of it in the Journal
    </button>`,
  )}
  ${statementsSection(ui)}`;
}

/** The Journal opens on your affairs (set by the ledger's link). */
let wantAffairs = false;
export function journalAffairs(): void {
  wantAffairs = true;
}
/** Whether the Journal should open on your affairs (once). */
export function takeJournalAffairs(): boolean {
  const v = wantAffairs;
  wantAffairs = false;
  return v;
}

// ---------------------------------------------------------------- acres

/** The acres you own, province by province, with a subtotal for each and a grand total. */
export function acresSection(ui: GameUi): TemplateResult | typeof nothing {
  const life = ui.life!;
  const a = acresOf(ui.s, ui.w, life);
  if (!a.rows.length) return nothing;
  return section(
    html`Your acres
      <span class="cq-muted small"
        >${a.total.toLocaleString("en-US")} in all</span
      >`,
    html`<table class="cq-acres">
      ${a.rows.map(
        (r) =>
          html`<tbody>
            <tr>
              <th colspan="2">
                ${r.name}${r.prov === life.home
                  ? html` <span class="cq-muted small">(home)</span>`
                  : nothing}
              </th>
            </tr>
            ${r.lines.map(
              (l) =>
                html`<tr>
                  <td>${l.label}</td>
                  <td>${l.acres.toLocaleString("en-US")} acres</td>
                </tr>`,
            )}
            <tr class="sub">
              <td>At ${r.name}</td>
              <td>${r.total.toLocaleString("en-US")} acres</td>
            </tr>
          </tbody>`,
      )}
      <tfoot>
        <tr>
          <td>
            In all${a.rows.length > 1 ? `, in ${a.rows.length} provinces` : ""}
          </td>
          <td>${a.total.toLocaleString("en-US")} acres</td>
        </tr>
      </tfoot>
    </table>`,
  );
}
