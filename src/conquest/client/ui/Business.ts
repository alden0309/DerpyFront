// BUSINESS (r15): businesses in the browser. Estate › Business: every
// business of yours (alone, in a partnership, or a trading company), each on
// a page of its own with the month's account and a chart of the year, plain
// advice on why it makes or loses money, the controls (hands, a manager,
// growing it, selling it) and a warning before losses pile up. The "Start a
// business" window: what kind, how big and where; what it costs (on the
// button); its months one by one until it's paid for itself; what drives
// its takings and what could go wrong; and going alone or with a partner
// (the articles' presets). A trading company: its goods and its route, the
// size and pace of its cargoes, and the odds before you commit.

import { html, nothing, svg, TemplateResult } from "lit";
import { presetTerms, type PresetKey } from "../../engine/BizPresets";
import {
  bizAdvice,
  bizTradesAt,
  foundCheck,
  handCount,
  managerChoices,
  managerOf,
  mindWords,
  propertyView,
  RAMP,
  startView,
  takeHandCheck,
  townCustom,
  UNMINDED,
  type Advice,
  type StartView,
} from "../../engine/Business";
import { formatDate, formatMonth } from "../../engine/Calendar";
import {
  backChoices, // ECON (r17)
  backLoadsOf, // ECON (r17)
  backOdds, // ECON (r17)
  backPlan,
  CO_EVERY,
  CO_GOODS,
  CO_LOADS,
  CO_SETUP, // ECON (r17)
  companyCheck,
  companyDests,
  companyOdds,
  companyQuote,
  defaultPlan,
  goodsName,
  placeName,
  planCheck,
} from "../../engine/Company";
import {
  bizName,
  firmAdvice,
  firmHowItPays,
  firmMonthView,
} from "../../engine/Firms";
import { followerTitle } from "../../engine/Followers";
import { isChildLife, lifeOfChar } from "../../engine/LifeQueries";
import {
  BUSINESS_HANDS,
  EXPAND_COST,
  HAND_WAGE,
  JOBS,
  SKILL_NAMES,
} from "../../engine/LifeRules";
import { soldHere } from "../../engine/Markets";
import { likelyPartners } from "../../engine/Partners";
import {
  managerOf as firmManager,
  firmsWith,
  partnerIn,
} from "../../engine/PartnersCore";
import { expandCheck, propertyWorth } from "../../engine/Property";
import { charName } from "../../engine/Queries";
import type {
  Character,
  CompanyPlan,
  Firm,
  JobKind,
  Property,
  TradeItem,
} from "../../engine/Types";
import { play } from "../Sound";
import { num } from "../Tip";
import { action, breakdownTip, GameUi, more, section, token } from "./Context";
import { howTo, pageHead } from "./Nav";
import { oddsPanel } from "./Odds";
import { coins, price, priceWords } from "./Price";
import { term } from "./Terms";
import { companyMarkets, staffPart, waysBlock } from "./WorkR21"; // WORK (r21)
import { boundBizPart } from "./Labour2Ui"; // LABOUR2 (r21)

const r1 = (v: number) => Math.round(v * 10) / 10;
const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${coins(Math.abs(v))}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Advice without its "Losing money: ", as a sentence. */
const sentence = (t: string) => cap(t.replace(/^Losing money: /, ""));
/** A business's name in the start window (the trapper's is a fur company, not a trading company). */
const kindName = (job: JobKind, level: number) =>
  job === "trapper"
    ? "Fur company"
    : cap(
        job === "farmer" && level >= 3
          ? "plantation"
          : (JOBS[job].business ?? job),
      );
const SIZE = ["", "small", "middling", "great"];
const ROMAN = ["", "I", "II", "III"];

// ---------------------------------------------------------------- opening the articles with a preset

/** A preset to apply when the articles window next opens (from the start window). */
let pending: {
  key: PresetKey;
  job?: JobKind;
  level?: number;
  co?: CompanyPlan;
} | null = null;

/** Open the articles with someone, filled in by a preset. */
export function openArticles(
  ui: GameUi,
  c: number,
  key: PresetKey,
  o: { job?: JobKind; level?: number; co?: CompanyPlan } = {},
): void {
  pending = { key, ...o };
  ui.modal({ k: "articles", c });
}

/** The preset waiting for the articles window, taken once. */
export function takePendingPreset(): typeof pending {
  const p = pending;
  pending = null;
  return p;
}

// ---------------------------------------------------------------- Estate › Business

/** Estate › Business: every business of yours, and starting another. */
export function businessPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const mine = (life.property ?? []).filter(
    (x) => x.kind === "business" && x.job,
  );
  const firms = firmsWith(s, life.c);
  const inFirms = firms.filter((f) => f.biz);
  const companies = firms.filter((f) => f.hold === "company" && f.co);
  const child = isChildLife(s, life);
  const start = child
    ? html``
    : html`<div class="cq-btnrow">
        <button
          class="cq-btn primary"
          ?disabled=${!!life.travel}
          title=${life.travel ? "Not from the road" : ""}
          @click=${() => ui.modal({ k: "startbiz" })}
        >
          Start a business…
        </button>
      </div>`;
  const warnings = [
    ...mine.flatMap((pr) => {
      const v = propertyView(s, life, pr);
      if (v.profit - v.mgr >= 0) return [];
      const worst = bizAdvice(s, v, { owner: true }).find(
        (a) => a.tone === "bad",
      );
      return [
        html`<li>
          <b>${cap(pr.name)} at ${ui.map.provinces[pr.prov]?.name}</b>:
          ${signed(r1(v.profit - v.mgr))} a month as it stands.
          ${worst ? sentence(worst.text) : ""}
        </li>`,
      ];
    }),
    ...inFirms.flatMap((f) => {
      const v = firmMonthView(s, f);
      if (v.profit >= 0) return [];
      const worst = firmAdvice(s, ui.w, f).find((a) => a.tone === "bad");
      return [
        html`<li>
          <b>${f.name}</b>: ${signed(v.profit)} a month as it stands.
          ${worst ? sentence(worst.text) : ""}
        </li>`,
      ];
    }),
  ];
  return html`${pageHead(
    "Business",
    html`Your businesses, alone or in partnership, and your trading companies:
    what each made, why, and what to do about it.`,
    start,
  )}
  ${warnings.length
    ? html`<div class="cq-biz-alarm" role="status">
        <b>Losing money</b>
        <ul>
          ${warnings}
        </ul>
      </div>`
    : nothing}
  ${child
    ? html`<p class="cq-empty">Not until you're sixteen.</p>`
    : !mine.length && !inFirms.length && !companies.length
      ? howTo(
          "You have no business yet. One that's run sensibly pays from its first months: a trade you know, in a town with custom for it, with you (or a manager) there to mind it.",
          [
            html`<b>Start a business</b> (the button above, at the market, or
              Work › Find work): choose the kind and size, see its months one by
              one before you pay, and go alone or with a partner.`,
            html`Or put money into someone else's as a silent partner (anyone's
              card: <i>In business</i>).`,
            html`Or set up a <b>trading company</b> for particular goods,
              shipped on a cycle you set.`,
            "Some trades come with a business of their own at their higher rungs (a storekeeper's store, a master's shop).",
          ],
        )
      : nothing}
  ${mine.map((pr) => bizCard(ui, pr))}
  ${inFirms.length
    ? section("In partnership", html`${inFirms.map((f) => firmBizCard(ui, f))}`)
    : nothing}
  ${companies.length
    ? section(
        "Trading companies",
        html`${companies.map((f) => companyCard(ui, f))}`,
      )
    : nothing}`;
}

// ---------------------------------------------------------------- a business of your own

/** The month's money of a property, from the month's statements (newest last). */
function monthsOf(ui: GameUi, pr: Property): { day: number; profit: number }[] {
  const out: { day: number; profit: number }[] = [];
  for (const st of ui.life!.statements ?? []) {
    if (st.to < pr.since) continue;
    const v = st.lines
      .filter((l) => l.k === `p:${pr.id}` || l.k === `ps:${pr.id}`) // WORK (r21): its staff's pay
      .reduce((m, l) => m + l.v, 0);
    out.push({ day: st.from, profit: r1(v) });
  }
  return out.slice(-12);
}

/** Twelve months as bars: green when it made money, red when it lost. */
export function monthChart(
  rows: { day: number; profit: number }[],
  label = "Profit by month",
): TemplateResult {
  const W = 240;
  const H = 54;
  const max = Math.max(1, ...rows.map((b) => Math.abs(b.profit)));
  const bw = W / 12;
  const ups = rows.some((b) => b.profit > 0);
  const downs = rows.some((b) => b.profit < 0);
  const zero = ups && downs ? H / 2 : downs ? 3 : H - 3;
  const room = ups && downs ? H / 2 - 3 : H - 6;
  return svg`<svg class="cq-firm-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label=${label}>
    <line x1="0" x2="${W}" y1="${zero}" y2="${zero}" class="axis" />
    ${rows.map((b, i) => {
      const h = Math.max(1, (Math.abs(b.profit) / max) * room);
      const x = (12 - rows.length + i) * bw + bw * 0.18;
      const y = b.profit >= 0 ? zero - h : zero;
      return svg`<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${h}" class=${b.profit >= 0 ? "up" : "down"}><title>${formatMonth(b.day)}: ${signed(b.profit)}</title></rect>`;
    })}
  </svg>`;
}

/** Advice as a list: bad first, in red; good in green; notes plain. */
export function adviceList(list: Advice[]): TemplateResult {
  if (!list.length) return html``;
  return html`<ul class="cq-biz-advice">
    ${list.map((a) => html`<li class=${a.tone}>${a.text}</li>`)}
  </ul>`;
}

/** Which manager to put in, by business. */
const pickMgr = new Map<number, number>();

/** A business of your own: its sign, its month, its books, advice and controls. */
function bizCard(ui: GameUi, pr: Property): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const town = ui.map.provinces[pr.prov]?.name ?? "";
  const v = propertyView(s, life, pr);
  const net = r1(v.profit - v.mgr);
  const st = pr.biz ?? {};
  const acct = (st.acct ?? []).slice(-5).reverse();
  const last = st.acct?.[st.acct.length - 1];
  const tc = townCustom(s, pr.prov, pr.job!, { prop: pr.id }, ui.w);
  const advice = bizAdvice(s, v, {
    owner: true,
    rivals: tc.rivals,
    room: tc.room,
  });
  const hands = handCount(pr);
  const room = BUSINESS_HANDS[pr.level] ?? 0;
  const mgr = managerOf(life, pr);
  const choices = managerChoices(s, life, pr).filter((x) => x.f !== mgr);
  const pick = choices.some((x) => x.f.id === pickMgr.get(pr.id))
    ? pickMgr.get(pr.id)!
    : (choices[0]?.f.id ?? -1);
  const worth = propertyWorth(s, life, pr);
  const ex = expandCheck(life, pr);
  const auto = st.auto !== false;
  const here = !life.travel && life.prov === pr.prov;
  const cmd = async (c: Parameters<GameUi["cmd"]>[0], sound?: string) => {
    if ((await ui.cmd(c)) && sound) play(sound as never);
  };
  const months = monthsOf(ui, pr);
  return html`<article class="cq-firm cq-biz">
    <header class="cq-firm-board">
      <span class="cq-firm-est">Est. ${formatMonth(pr.since)}</span>
      <h3 class="cq-firm-name">${cap(pr.name)}</h3>
      <p class="cq-firm-hold">
        At ${town} · ${ROMAN[pr.level]} · ${hands} of ${room}
        hand${room === 1 ? "" : "s"}
      </p>
      <p class="cq-firm-chips">
        <span class="cq-chip ${v.input.minded ? "gold" : "bad"}"
          >${cap(mindWords(v).replace(/ \(.*\)$/, ""))}</span
        >
        ${auto ? html`<span class="cq-chip">Hands as they pay</span>` : nothing}
        ${v.ramp < 1
          ? html`<span class="cq-chip">Custom building</span>`
          : nothing}
      </p>
    </header>
    ${net < 0
      ? html`<p class="cq-biz-warn" role="status">
          <b>Losing money</b>, ${signed(net)} a month as it stands.
          ${sentence(advice.find((a) => a.tone === "bad")?.text ?? "")}
        </p>`
      : nothing}
    <div class="cq-stats cq-firm-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Last month</span>
        ${last
          ? num(
              signed(last.profit),
              () => ({
                title: `${formatMonth(last.day)}: the account`,
                b: {
                  total: last.profit,
                  parts: [
                    { label: "Takings", value: last.takings },
                    { label: "Hands' wages", value: -last.wages },
                    { label: "Keep", value: -last.upkeep },
                    { label: "Excise and duties", value: -last.excise },
                    ...(last.mgr
                      ? [{ label: "The manager's wage", value: -last.mgr }]
                      : []),
                    ...(last.staff // WORK (r21)
                      ? [{ label: "Its staff's pay", value: -last.staff }]
                      : []),
                    ...(last.bound // LABOUR2 (r21)
                      ? [{ label: "Keep of those held in bondage here", value: -last.bound }]
                      : []),
                  ],
                },
              }),
              `cq-stat-value ${last.profit < 0 ? "bad" : ""}`,
            )
          : html`<span class="cq-stat-value">–</span>`}
        <span class="cq-stat-note"
          >${last
            ? `${last.hands} hands`
            : "first account at the month's end"}</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">A month, as it stands</span>
        ${num(
          signed(net),
          () =>
            breakdownTip(
              "This month, as it stands",
              {
                total: net,
                parts: [
                  {
                    label: `Takings: ${hands} hand${hands === 1 ? "" : "s"} at ${v.perHand}${v.master ? `, and ${v.input.who === "you" ? "your" : "the manager's"} own work (${v.master})` : ""}`,
                    value: v.takings,
                  },
                  { label: "Hands' wages", value: -v.wages },
                  { label: "Keep", value: -v.upkeep },
                  { label: "Excise and duties", value: -v.excise },
                  ...(v.mgr
                    ? [{ label: "The manager's wage", value: -v.mgr }]
                    : []),
                  ...(v.staff // WORK (r21)
                    ? [{ label: "Its staff's pay", value: -v.staff }]
                    : []),
                  ...(v.bound // LABOUR2 (r21)
                    ? [{ label: "Keep of those held in bondage here", value: -v.bound }]
                    : []),
                ],
              },
              signed,
              [
                `The season: ${Math.round(v.season * 100)} in a hundred of the usual custom.`,
                v.ramp < 1
                  ? `New: ${Math.round(v.ramp * 100)} in a hundred of its custom so far.`
                  : "",
              ].filter(Boolean),
            ),
          `cq-stat-value ${net < 0 ? "bad" : ""}`,
        )}
        <span class="cq-stat-note">${mindWords(v)}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label"
          >${term("custom", "The town's custom")}</span
        >
        ${num(
          `${r1(tc.free)} of ${r1(tc.room)}`,
          () => ({
            title: "Custom for it in the town, in hands' worth",
            notes: [
              `What makes it: ${tc.why.join(", ")}.`,
              tc.rivals.length
                ? `Rivals: ${tc.rivals.map((x) => `${x.name} (${x.hands})`).join(", ")}.`
                : "No rivals in the town.",
              "Hands past the custom bring in little; the season moves it month by month.",
            ],
          }),
          "cq-stat-value",
        )}
        <span class="cq-stat-note"
          >${tc.rivals.length
            ? `${tc.rivals.length} rival${tc.rivals.length === 1 ? "" : "s"}`
            : "no rivals"}</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">It would sell for</span>
        <span class="cq-stat-value">${coins(worth)}</span>
        <span class="cq-stat-note">half what it cost</span>
      </div>
    </div>
    <div class="cq-firm-books">
      <h4 class="cq-int-group">The month's account</h4>
      ${months.length
        ? monthChart(months)
        : html`<p class="cq-muted small">
            Its account opens at the month's end.
          </p>`}
      ${acct.length
        ? html`<table class="cq-firm-ledger small">
            <thead>
              <tr>
                <th>Month</th>
                <th>Takings</th>
                <th>Wages</th>
                <th>Keep</th>
                <th>Excise</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              ${acct.map(
                (a) =>
                  html`<tr
                    title=${a.minded === 0
                      ? "Nobody minded it"
                      : a.minded === 2
                        ? "Your manager minded it"
                        : "You minded it"}
                  >
                    <td>
                      ${formatMonth(a.day)}${a.minded === 0
                        ? html` <i class="bad">*</i>`
                        : nothing}
                    </td>
                    <td>${coins(a.takings)}</td>
                    <td>${coins(a.wages + (a.mgr ?? 0) + (a.staff ?? 0))}</td>
                    <td>${coins(a.upkeep + (a.bound ?? 0)) /* LABOUR2 (r21): and the bound workers' keep */}</td>
                    <td>${coins(a.excise)}</td>
                    <td class=${a.profit < 0 ? "bad" : ""}>
                      ${signed(a.profit)}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>`
        : nothing}
      ${acct.some((a) => a.minded === 0)
        ? html`<p class="cq-muted small cq-firm-notes">
            * Nobody minded it that month: it took ${UNMINDED} of its takings.
          </p>`
        : nothing}
    </div>
    <div class="cq-biz-why">
      <h4 class="cq-int-group">Why it makes what it makes</h4>
      ${adviceList(advice)}
    </div>
    <div class="cq-biz-controls">
      <h4 class="cq-int-group">Running it</h4>
      <div class="cq-biz-row">
        <span class="cq-biz-row-what"
          ><b>Hands</b>
          <span class="cq-muted small"
            >${hands} of ${room}, ${HAND_WAGE} a month each.
            ${pr.hands.length
              ? html`By name:
                ${pr.hands.map(
                  (h, i) =>
                    html`${i ? ", " : ""}${charName(s.chars[h])}
                      <button
                        class="cq-link small"
                        title="Let them go"
                        @click=${() =>
                          cmd({
                            k: "business",
                            act: "unhand",
                            id: pr.id,
                            c: h,
                          })}
                      >
                        (let go)
                      </button>`,
                )}`
              : nothing}</span
          ></span
        >
        <span class="cq-btnrow">
          ${action(
            html`Take on a hand${price(HAND_WAGE, { per: "month" })}`,
            takeHandCheck(life, pr),
            () => cmd({ k: "business", act: "hand", id: pr.id }, "coins"),
            "small",
            "A hand from the town's labouring folk",
            false,
          )}
          ${action(
            "Let one go",
            (pr.biz?.extra ?? 0) > 0
              ? { ok: true }
              : { ok: false, why: "No hands from the town to let go" },
            () => cmd({ k: "business", act: "unhand", id: pr.id }),
            "small quiet",
            undefined,
            false,
          )}
        </span>
      </div>
      ${staffPart(ui, pr) /* WORK (r21): its staff by name */}
      ${boundBizPart(ui, pr) /* LABOUR2 (r21): those of your household held here */}
      <label class="cq-biz-auto small">
        <input
          type="checkbox"
          .checked=${auto}
          @change=${(e: Event) =>
            cmd({
              k: "business",
              act: "auto",
              id: pr.id,
              level: (e.target as HTMLInputElement).checked ? 1 : 0,
            })}
        />
        Take on and let go hands from the town as they pay (one a month)
      </label>
      <div class="cq-biz-row">
        <span class="cq-biz-row-what"
          ><b>A manager</b>
          <span class="cq-muted small"
            >${mgr
              ? html`${charName(s.chars[mgr.c])} (${followerTitle(mgr)},
                ${SKILL_NAMES[JOBS[pr.job!].main].toLowerCase()}
                ${v.input.skill}) minds it, for ${mgr.wage} a month.`
              : "One of your people minds it while you're away or busy, with their own skill in the trade."}</span
          ></span
        >
        <span class="cq-btnrow">
          ${mgr
            ? html`<button
                class="cq-btn small quiet"
                @click=${() =>
                  cmd({ k: "business", act: "unmanager", id: pr.id })}
              >
                Take it back
              </button>`
            : nothing}
          ${choices.length
            ? html`<select
                  class="cq-firm-pick"
                  aria-label="Who minds it"
                  @change=${(e: Event) => {
                    pickMgr.set(
                      pr.id,
                      Number((e.target as HTMLSelectElement).value),
                    );
                    ui.redraw();
                  }}
                >
                  ${choices.map(
                    (x) =>
                      html`<option value=${x.f.id} ?selected=${x.f.id === pick}>
                        ${charName(s.chars[x.f.c])}
                        (${SKILL_NAMES[JOBS[pr.job!].main].toLowerCase()}
                        ${x.skill}, ${x.f.wage} a month)
                      </option>`,
                  )}
                </select>
                <button
                  class="cq-btn small"
                  @click=${() =>
                    cmd({
                      k: "business",
                      act: "manager",
                      id: pr.id,
                      c: pick,
                    })}
                >
                  ${mgr ? "Put them in instead" : "Put them in to mind it"}
                </button>`
            : html`<span class="cq-muted small"
                >Take someone into your service first (People › Your
                people).</span
              >`}
        </span>
      </div>
      <div class="cq-biz-row">
        <span class="cq-biz-row-what"
          ><b>Grow it, or sell it</b>
          <span class="cq-muted small"
            >${EXPAND_COST[pr.level] !== undefined
              ? `A ${SIZE[pr.level + 1]} ${pr.name} has room for ${BUSINESS_HANDS[pr.level + 1]} hands, and costs more to keep: only worth it where the custom is.`
              : "It's as big as it gets."}
            Sold, it fetches half what it cost.</span
          ></span
        >
        <span class="cq-btnrow">
          ${EXPAND_COST[pr.level] !== undefined
            ? action(
                html`Grow
                it${price(EXPAND_COST[pr.level], {
                  have: life.purse,
                })}`,
                ex,
                () => cmd({ k: "property", act: "expand", id: pr.id }, "coins"),
                "small",
                undefined,
                false,
              )
            : nothing}
          <button
            class="cq-btn small quiet"
            ?disabled=${!here}
            title=${here ? "" : "That's done where the business is"}
            @click=${() =>
              confirm(
                `Sell the ${pr.name} at ${town} for ${priceWords(worth)}?`,
              ) && cmd({ k: "property", act: "sell", id: pr.id }, "coins")}
          >
            Sell${price(worth, { gain: true })}
          </button>
        </span>
      </div>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- in partnership

/** A firm's business, in brief: how it's doing, why, and how it makes money. */
function firmBizCard(ui: GameUi, f: Firm): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const me = partnerIn(f, life.c)!;
  const v = firmMonthView(s, f);
  const last = f.books[f.books.length - 1];
  const mgr = firmManager(f);
  return html`<article class="cq-biz-mini">
    <header>
      <b class="cq-biz-mini-name">${f.name}</b>
      <span class="cq-muted small"
        >${cap(bizName(f.biz!.job, f.biz!.level))} at
        ${ui.map.provinces[f.prov]?.name} · ${me.share}% yours ·
        ${mgr?.c === life.c
          ? "you manage it"
          : `${s.chars[mgr?.c ?? -1]?.first ?? "a partner"} manages it`}</span
      >
    </header>
    <p class="cq-biz-mini-figs small">
      Last month
      <b class=${(last?.profit ?? 0) < 0 ? "bad" : ""}
        >${last ? signed(last.profit) : "–"}</b
      >
      (yours ${last ? signed(r1((last.profit * me.share) / 100)) : "–"}); a
      month as it stands
      <b class=${v.profit < 0 ? "bad" : ""}>${signed(v.profit)}</b>
      (yours ${signed(r1((v.profit * me.share) / 100))}).
    </p>
    ${adviceList(firmAdvice(s, ui.w, f).slice(0, 3))}
    ${more(
      "How it makes its money",
      html`<ul class="cq-biz-how small">
        ${firmHowItPays(s, ui.w, f).map((x) => html`<li>${x}</li>`)}
      </ul>`,
    )}
    <div class="cq-btnrow">
      <button
        class="cq-btn small"
        @click=${() => ui.open({ k: "tab", tab: "estate", sub: "partners" })}
      >
        Its partnership: books, votes, hands
      </button>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- trading companies

/**
 * A trading company, in brief: its trade, its cargoes at sea, its odds, and
 * (for its managing partner) changing its trade. `onBusiness`: on Estate ›
 * Business, with its name and a way to its partnership's page.
 */
export function companyCard(
  ui: GameUi,
  f: Firm,
  onBusiness = true,
): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const co = f.co!;
  const me = partnerIn(f, life.c);
  const plan = co.plan;
  const o = companyOdds(s, ui.w, plan);
  const q = companyQuote(s, ui.w, plan);
  const last = f.books[f.books.length - 1];
  const managing = me?.role === "managing";
  const warn: string[] = [];
  if (f.chest < q.cost)
    warn.push(
      `The chest has ${coins(f.chest)} of the ${coins(q.cost)} a cargo costs: no cargo sails until capital is called in (put it to the partners), or the cargoes are made smaller.`,
    );
  if ((co.held ?? -1e9) + 60 > s.day)
    warn.push(
      `Its factors held back a cargo ${formatDate(co.held!)}: prices didn't pay. Smaller cargoes, less often, or another market would.`,
    );
  if (o.net < 0)
    warn.push(
      `As it stands this trade loses ${signed(o.net)} a month once it's going: change it below.`,
    );
  return html`<article class="cq-biz-mini cq-co ${onBusiness ? "" : "inner"}">
    ${onBusiness
      ? html`<header>
          <b class="cq-biz-mini-name">${f.name}</b>
          <span class="cq-muted small"
            >${tradeWords(ui, plan)} · every
            ${plan.every === 1 ? "month" : `${plan.every} months`} ·
            ${me ? `${me.share}% yours` : ""}</span
          >
        </header>`
      : nothing}
    ${warn.length
      ? html`<ul class="cq-biz-advice">
          ${warn.map((w) => html`<li class="bad">${w}</li>`)}
        </ul>`
      : nothing}
    <p class="cq-biz-mini-figs small">
      The chest <b>${coins(f.chest)}</b>; voyages made <b>${co.made}</b>, lost
      <b>${co.lost}</b>; last month
      <b class=${(last?.profit ?? 0) < 0 ? "bad" : ""}
        >${last ? signed(last.profit) : "–"}</b
      >.
    </p>
    ${legsLine(co) /* ECON (r17): each leg's record */}
    ${companyMarkets(ui, plan) /* WORK (r21): its trade moves the prices */}
    ${co.voyages.length
      ? html`<ul class="cq-co-voyages small">
          ${co.voyages.map(
            (v) =>
              html`<li>
                <span class="cq-chip"
                  >${v.leg === "back" ? "Homeward" : "At sea"}</span
                >
                ${v.loads} loads of ${goodsName(v.item).toLowerCase()}
                ${v.leg === "back"
                  ? html`home from ${placeName(s, ui.w, v.from, v.to, v.sailed)}`
                  : html`for ${placeName(s, ui.w, v.to, v.from, v.sailed)}`},
                ${coins(v.cost)} laid out; due about ${formatDate(v.due)}
              </li>`,
          )}
        </ul>`
      : html`<p class="cq-muted small">
          No cargo at sea. The next sails about ${formatDate(co.next)}.
        </p>`}
    ${more(
      plan.back
        ? "The odds of each leg, and what changes them"
        : "The odds of a voyage, and what changes them",
      legPanels(ui, plan),
    )}
    ${managing ? planEditor(ui, f) : nothing}
    ${onBusiness
      ? html`<div class="cq-btnrow">
          <button
            class="cq-btn small"
            @click=${() =>
              ui.open({ k: "tab", tab: "estate", sub: "partners" })}
          >
            Its books, chest and partners
          </button>
        </div>`
      : nothing}
  </article>`;
}

/** The plan being edited for a company, by firm. */
const editing = new Map<number, CompanyPlan>();

function planEditor(ui: GameUi, f: Firm): TemplateResult {
  const s = ui.s;
  const cur = f.co!.plan;
  const plan = editing.get(f.id) ?? { ...cur };
  const set = (p: CompanyPlan) => {
    editing.set(f.id, p);
    ui.redraw();
  };
  const same = JSON.stringify(plan) === JSON.stringify(cur);
  const check = planCheck(s, ui.w, plan);
  return more(
    "Change its trade",
    html`${planPicker(ui, plan, set, cur.from)}
      ${!same ? legPanels(ui, plan, false) : nothing}
      <div class="cq-btnrow">
        ${action(
          "Set its course",
          same ? { ok: false, why: "That's its trade already" } : check,
          async () => {
            if (await ui.cmd({ k: "business", act: "plan", id: f.id, plan })) {
              editing.delete(f.id);
              play("seal");
            }
          },
          "small primary",
        )}
      </div>`,
  );
}

/**
 * What a company trades and where: the goods (those its port sells), where
 * it sells them (Europe, or the nearest ports of the Americas), how many
 * loads a cargo and how often. `from`: the port it buys at.
 */
export function planPicker(
  ui: GameUi,
  plan: CompanyPlan,
  set: (p: CompanyPlan) => void,
  from = plan.from,
): TemplateResult {
  const s = ui.s;
  const w = ui.w;
  const goods = (Object.keys(CO_GOODS) as TradeItem[]).filter((g) =>
    soldHere(s, w, from, g),
  );
  const dests = [-1, ...companyDests(w, s, from)];
  // ECON (r17): a line already running to a farther port keeps it in the list.
  if (plan.to >= 0 && from === plan.from && !dests.includes(plan.to))
    dests.push(plan.to);
  return html`<div class="cq-co-plan">
    <label class="cq-field"
      ><span>The goods</span>
      <select
        @change=${(e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          // ECON (r17): nothing outward, when it brings goods home.
          if (!v)
            set({ ...plan, loads: 0, back: plan.back ?? bestBack(ui, plan) });
          else set({ ...plan, item: v as TradeItem, loads: plan.loads || 10 });
        }}
      >
        <option value="" ?selected=${plan.loads === 0}>
          Nothing (in ballast)
        </option>
        ${goods.map(
          (g) =>
            html`<option
              value=${g}
              ?selected=${plan.loads > 0 && g === plan.item}
            >
              ${goodsName(g)}
            </option>`,
        )}
      </select></label
    >
    <label class="cq-field"
      ><span>Sold at</span>
      <select
        @change=${(e: Event) =>
          set({ ...plan, to: Number((e.target as HTMLSelectElement).value) })}
      >
        ${dests.map(
          (d) =>
            html`<option value=${d} ?selected=${d === plan.to}>
              ${d < 0
                ? `${placeName(s, w, -1, from)} (Europe)`
                : w.map.provinces[d]?.name}
            </option>`,
        )}
      </select></label
    >
    <span class="cq-field"
      ><span>Loads a cargo</span>
      <span class="cq-seg small" role="radiogroup" aria-label="Loads a cargo">
        ${CO_LOADS.map(
          (n) =>
            html`<button
              role="radio"
              aria-checked=${plan.loads === n}
              ?disabled=${plan.loads === 0}
              @click=${() => set({ ...plan, loads: n })}
            >
              ${n}
            </button>`,
        )}
      </span></span
    >
    ${backPicker(ui, plan, set) /* ECON (r17): the return cargo */}
    <span class="cq-field"
      ><span>A cargo every</span>
      <span class="cq-seg small" role="radiogroup" aria-label="How often">
        ${CO_EVERY.map(
          (n) =>
            html`<button
              role="radio"
              aria-checked=${plan.every === n}
              @click=${() => set({ ...plan, every: n })}
            >
              ${n === 1 ? "month" : `${n} months`}
            </button>`,
        )}
      </span></span
    >
  </div>`;
}

// ---------------------------------------------------------------- ECON (r17): the return cargo

/** "Tobacco from Jamestown to Havana, home with cochineal". */
function tradeWords(ui: GameUi, plan: CompanyPlan): string {
  const s = ui.s;
  const far = placeName(s, ui.w, plan.to, plan.from);
  const home = placeName(s, ui.w, plan.from, plan.from);
  const back = plan.back
    ? `${goodsName(plan.back).toLowerCase()} home (${backLoadsOf(plan)} loads)`
    : "";
  return plan.loads > 0
    ? `${goodsName(plan.item)} from ${home} to ${far} (${plan.loads} loads)${back ? `, ${back}` : ""}`
    : `Nothing out; ${back} from ${far} to ${home}`;
}

/** Each leg's record: cargoes, what they cost and fetched, lost. */
function legsLine(
  co: NonNullable<Firm["co"]>,
): TemplateResult | typeof nothing {
  const l = co.legs;
  if (!l || !co.plan.back || (!l.out.n && !l.back.n)) return nothing;
  const leg = (name: string, x: typeof l.out) =>
    x.n
      ? html`<span
          >${name}: <b>${x.n}</b> cargo${x.n === 1 ? "" : "es"},
          ${coins(x.cost)} laid out, ${coins(x.sale)}
          fetched${x.lost
            ? html`, <b class="bad">${x.lost} lost</b>`
            : nothing}</span
        >`
      : html`<span class="cq-muted">${name}: none yet</span>`;
  return html`<p class="cq-co-legs small">
    ${leg("Outward", l.out)} ${leg("Homeward", l.back)}
  </p>`;
}

/** The odds of the outward leg and of the homeward leg, each its own. */
function legPanels(
  ui: GameUi,
  plan: CompanyPlan,
  factors = true,
): TemplateResult {
  const o = companyOdds(ui.s, ui.w, plan);
  const bo = backOdds(ui.s, ui.w, plan);
  return html`${plan.loads > 0
    ? oddsPanel(o, {
        factors,
        ...(bo ? { title: `Out: ${o.title.toLowerCase()}` } : {}),
      })
    : html`<p class="cq-muted small">${o.factors[0]}</p>`}
  ${bo ? oddsPanel(bo, { factors }) : nothing}
  ${bo
    ? html`<p class="cq-co-round small">
        The round voyage, once it's going:
        <b class=${o.net >= 0 ? "good" : "bad"}>${signed(o.net)} a month</b>
        after its factors.
      </p>`
    : nothing}`;
}

/** The best goods home on this line, if any pays. */
function bestBack(ui: GameUi, plan: CompanyPlan): TradeItem | undefined {
  const c = backChoices(ui.s, ui.w, plan);
  return (c.find((x) => x.gain > 0) ?? c[0])?.item;
}

/** What it brings home: nothing, or goods the far end sells, each with what it'd make a voyage. */
function backPicker(
  ui: GameUi,
  plan: CompanyPlan,
  set: (p: CompanyPlan) => void,
): TemplateResult {
  const choices = backChoices(ui.s, ui.w, plan);
  const loads = backLoadsOf(plan);
  return html`<label class="cq-field"
      ><span>Home with</span>
      <select
        @change=${(e: Event) => {
          const v = (e.target as HTMLSelectElement).value as TradeItem | "";
          set(
            v
              ? { ...plan, back: v, backLoads: plan.backLoads ?? 5 }
              : {
                  ...plan,
                  back: undefined,
                  backLoads: undefined,
                  loads: plan.loads || 10,
                },
          );
        }}
      >
        <option value="" ?selected=${!plan.back}>
          Nothing (home in ballast)
        </option>
        ${choices.map(
          (c) =>
            html`<option value=${c.item} ?selected=${c.item === plan.back}>
              ${goodsName(c.item)} (${signed(c.gain)} a voyage)
            </option>`,
        )}
      </select></label
    >
    <span class="cq-field"
      ><span>Loads home</span>
      <span class="cq-seg small" role="radiogroup" aria-label="Loads home">
        ${CO_LOADS.map(
          (n) =>
            html`<button
              role="radio"
              aria-checked=${!!plan.back && loads === n}
              ?disabled=${!plan.back}
              @click=${() => set({ ...plan, backLoads: n })}
            >
              ${n}
            </button>`,
        )}
      </span></span
    >`;
}

// ---------------------------------------------------------------- the "Start a business" window

interface StartDraft {
  key: string;
  tab: "biz" | "company";
  job: JobKind | null;
  level: number;
  plan: CompanyPlan | null;
  cap: number;
}
let draft: StartDraft = {
  key: "",
  tab: "biz",
  job: null,
  level: 1,
  plan: null,
  cap: 0,
};

/** The trades' views at a size, kept for the day (the window redraws as the world ticks). */
let views: { key: string; list: StartView[] } = { key: "", list: [] };

function viewsFor(ui: GameUi, level: number): StartView[] {
  const life = ui.life!;
  const key = `${ui.s.day}|${life.prov}|${level}|${life.job?.kind ?? ""}|${(life.property ?? []).length}`;
  if (views.key !== key) {
    const list = bizTradesAt(ui.s, ui.w, life.prov).map((job) =>
      startView(ui.s, ui.w, life, job, level),
    );
    list.sort((a, b) => b.plan.going.profit - a.plan.going.profit);
    views = { key, list };
  }
  // The check (your purse) changes as you spend: always fresh.
  for (const v of views.list)
    v.check = foundCheck(ui.s, ui.w, life, v.job, v.level);
  return views.list;
}

/** The window to start a business: a business here, or a trading company. */
export function startBizModal(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || !ui.me) return html`<p class="cq-muted">You're watching.</p>`;
  const key = `${ui.modalSeq}`;
  if (draft.key !== key) {
    draft = {
      key,
      tab: "biz",
      job:
        life.job?.kind && JOBS[life.job.kind].business ? life.job.kind : null,
      level: 1,
      plan: null,
      cap: 0,
    };
  }
  const town = ui.map.provinces[life.prov]?.name ?? "";
  const tabs = html`<span
    class="cq-seg cq-sb-tabs"
    role="radiogroup"
    aria-label="What to start"
  >
    <button
      role="radio"
      aria-checked=${draft.tab === "biz"}
      @click=${() => {
        draft.tab = "biz";
        ui.redraw();
      }}
    >
      A business at ${town}
    </button>
    <button
      role="radio"
      aria-checked=${draft.tab === "company"}
      @click=${() => {
        draft.tab = "company";
        ui.redraw();
      }}
    >
      A trading company
    </button>
  </span>`;
  return html`<div class="cq-sb">
    <header class="cq-articles-head cq-sb-head">
      <span class="cq-articles-sitter"
        >${token(ui, ui.me, "small")}<b>You</b></span
      >
      <span class="cq-articles-title">
        <span class="cq-articles-kicker">A prospectus for</span>
        <h2>A Business of Your Own</h2>
        <span class="cq-muted small"
          >What it costs, what it should bring month by month, and why; alone or
          with a partner. You have ${coins(life.purse)}.</span
        >
      </span>
    </header>
    ${tabs}
    ${life.travel
      ? html`<p class="cq-empty">
          Not from the road: look again when you arrive.
        </p>`
      : isChildLife(s, life)
        ? html`<p class="cq-empty">Not until you're sixteen.</p>`
        : draft.tab === "biz"
          ? startBizTab(ui)
          : startCompanyTab(ui)}
  </div>`;
}

/** Bars of each month's profit and a line of all told, from setting it up. */
function planChart(v: StartView): TemplateResult {
  const W = 300;
  const H = 96;
  const ms = v.plan.months;
  const cum = ms.map((m) => m.cum);
  const lo = Math.min(-v.cost, ...cum, ...ms.map((m) => m.profit), 0);
  const hi = Math.max(1, ...cum, ...ms.map((m) => m.profit));
  const y = (val: number) => 6 + ((hi - val) / (hi - lo)) * (H - 12);
  const bw = W / ms.length;
  const pts = ms.map((m, i) => `${(i + 0.5) * bw},${y(m.cum)}`).join(" ");
  const be = v.plan.breakEven;
  return svg`<svg class="cq-sb-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Its months, one by one">
    <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="axis" />
    ${ms.map((m, i) => {
      const top = y(Math.max(0, m.profit));
      const h = Math.max(1, Math.abs(y(m.profit) - y(0)));
      return svg`<rect x="${i * bw + bw * 0.2}" y="${top}" width="${bw * 0.6}" height="${h}" class=${m.profit >= 0 ? "up" : "down"}><title>${formatMonth(m.day)}: ${signed(m.profit)} (${m.hands} hands); all told ${signed(m.cum)}</title></rect>`;
    })}
    <polyline points="${pts}" class="cum" />
    ${be ? svg`<line x1="${(be - 0.5) * bw}" x2="${(be - 0.5) * bw}" y1="2" y2="${H - 2}" class="be" />` : svg``}
  </svg>`;
}

function startBizTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const list = viewsFor(ui, draft.level);
  if (!list.length)
    return html`<p class="cq-empty">
      ${ui.map.provinces[life.prov]?.name} has no place for a business of any
      trade. A town with a market, a workshop or docks has.
    </p>`;
  const v = list.find((x) => x.job === draft.job) ?? list[0];
  draft.job = v.job;
  const def = JOBS[v.job];
  const name = def.business ?? "business";
  const g = v.plan.going;
  const bad = v.advice.filter((a) => a.tone === "bad");
  const partners = likelyPartners(s, life);
  const six = v.plan.months.slice(0, 6);
  return html`<div class="cq-sb-body">
    <div class="cq-sb-main">
      <section class="cq-sb-step">
        <h4><span>I.</span> What kind, and how big</h4>
        <div class="cq-sb-kinds" role="radiogroup" aria-label="What kind">
          ${list.map(
            (x) =>
              html`<button
                role="radio"
                aria-checked=${x.job === v.job}
                class="cq-sb-kind ${x.job === v.job ? "on" : ""}"
                @click=${() => {
                  draft.job = x.job;
                  ui.redraw();
                }}
              >
                <b>${kindName(x.job, draft.level)}</b>
                <span class="cq-sb-kind-figs"
                  >${coins(x.cost)} ·
                  <i class=${x.plan.going.profit < 0 ? "bad" : "good"}
                    >${signed(r1(x.plan.going.profit))}</i
                  >
                  a month</span
                >
              </button>`,
          )}
        </div>
        <span class="cq-seg small" role="radiogroup" aria-label="How big">
          ${[1, 2, 3].map(
            (lv) =>
              html`<button
                role="radio"
                aria-checked=${draft.level === lv}
                @click=${() => {
                  draft.level = lv;
                  ui.redraw();
                }}
              >
                ${ROMAN[lv]} ${SIZE[lv]}
                <span>${BUSINESS_HANDS[lv]} hands</span>
              </button>`,
          )}
        </span>
        <p class="cq-muted small">
          Where: here at ${ui.map.provinces[life.prov]?.name}, where you are. To
          set up somewhere else, go there first. ${cap(def.name)}: ${def.text}
        </p>
      </section>
      <section class="cq-sb-step">
        <h4><span>II.</span> Its months, one by one</h4>
        <div class="cq-stats cq-sb-figs">
          <div class="cq-stat">
            <span class="cq-stat-label">To set up</span>
            <span class="cq-stat-value">${coins(v.cost)}</span>
            <span class="cq-stat-note">${SIZE[v.level]} ${name}</span>
          </div>
          <div class="cq-stat">
            <span class="cq-stat-label">Once it's going</span>
            ${num(
              `${signed(r1(g.profit - g.mgr))} a month`,
              () =>
                breakdownTip(
                  "A month once its custom is built (the year's average)",
                  {
                    total: r1(g.profit - g.mgr),
                    parts: [
                      {
                        label: `Takings: ${g.input.hands} hands${g.master ? " and your own work" : ""}`,
                        value: g.takings,
                      },
                      { label: "Hands' wages", value: -g.wages },
                      { label: "Keep", value: -g.upkeep },
                      { label: "Excise and duties", value: -g.excise },
                    ],
                  },
                  signed,
                ),
              `cq-stat-value ${g.profit < 0 ? "bad" : "good"}`,
            )}
            <span class="cq-stat-note"
              >${v.plan.goingHands}
              hand${v.plan.goingHands === 1 ? "" : "s"}${g.master
                ? " and you"
                : ""}</span
            >
          </div>
          <div class="cq-stat">
            <span class="cq-stat-label">Makes money from</span>
            <span class="cq-stat-value ${v.plan.paysFrom ? "" : "bad"}"
              >${v.plan.paysFrom ? `month ${v.plan.paysFrom}` : "never"}</span
            >
            <span class="cq-stat-note"
              >${v.plan.paysFrom ? "on average" : "as things are"}</span
            >
          </div>
          <div class="cq-stat">
            <span class="cq-stat-label">Paid for itself</span>
            <span class="cq-stat-value ${v.plan.breakEven ? "" : "bad"}"
              >${v.plan.breakEven
                ? `month ${v.plan.breakEven}`
                : "not in 2 years"}</span
            >
            <span class="cq-stat-note">its cost back</span>
          </div>
        </div>
        ${planChart(v)}
        <table class="cq-firm-ledger small cq-sb-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Hands</th>
              <th>Takings</th>
              <th>Costs</th>
              <th>Profit</th>
              <th>All told</th>
            </tr>
          </thead>
          <tbody>
            ${six.map(
              (m) =>
                html`<tr>
                  <td>${formatMonth(m.day)}</td>
                  <td>${m.hands}</td>
                  <td>${coins(m.takings)}</td>
                  <td>${coins(m.costs)}</td>
                  <td class=${m.profit < 0 ? "bad" : ""}>
                    ${signed(m.profit)}
                  </td>
                  <td class=${m.cum < 0 ? "bad" : ""}>${signed(m.cum)}</td>
                </tr>`,
            )}
          </tbody>
        </table>
        <p class="cq-muted small">
          All told starts at what it costs to set up. Custom takes
          ${RAMP.length} months to build; the season comes and goes; hands are
          taken on as they pay.
        </p>
        ${waysBlock(ui, v.job, v.level) /* WORK (r21): minded, or not */}
      </section>
      <section class="cq-sb-step cq-sb-two">
        <div>
          <h4><span>III.</span> What drives its takings</h4>
          <ul class="cq-biz-how small">
            ${v.drivers.map((d) => html`<li>${d}</li>`)}
          </ul>
        </div>
        <div>
          <h4><span>IV.</span> The risks</h4>
          <ul class="cq-biz-how small">
            ${v.risks.map((d) => html`<li>${d}</li>`)}
          </ul>
        </div>
      </section>
    </div>
    <aside class="cq-articles-panel cq-sb-panel">
      ${bad.length
        ? html`<div class="cq-biz-warn">
            <b>It would lose money.</b> ${sentence(bad[0].text)}
          </div>`
        : html`<div class="cq-biz-good">
            <b>A sound start.</b> It should pay from month
            ${v.plan.paysFrom || "–"} and have paid for itself by month
            ${v.plan.breakEven || "–"}.
          </div>`}
      ${adviceList(v.advice.filter((a) => a.tone !== "bad").slice(0, 3))}
      <h4 class="cq-int-group">Alone</h4>
      <div class="cq-articles-actions">
        ${action(
          html`Set it up${price(v.cost, { have: life.purse })}`,
          v.check,
          async () => {
            if (
              await ui.cmd({
                k: "business",
                act: "found",
                job: v.job,
                level: v.level,
              })
            ) {
              play("coins");
              ui.modal(null);
              ui.open({ k: "tab", tab: "estate", sub: "business" });
            }
          },
          `primary ${bad.length ? "risky" : ""}`,
        )}
      </div>
      <h4 class="cq-int-group">With a partner</h4>
      ${partners.length
        ? html`<ul class="cq-sb-partners">
            ${partners.slice(0, 5).map((c) => partnerRow(ui, c, v))}
          </ul>`
        : html`<p class="cq-muted small">
            Nobody here likely to go into business just now. Anyone's card has
            <i>In business</i>, and the post reaches further.
          </p>`}
    </aside>
  </div>`;
}

/** Someone who might found it with you: who'd run it, and the articles. */
function partnerRow(ui: GameUi, c: Character, v: StartView): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const t = presetTerms(s, ui.w, life, c, "found", {
    job: v.job,
    level: v.level,
  });
  const role = c.role ?? (lifeOfChar(s, c.id) ? "player" : "");
  return html`<li>
    ${token(ui, c, "small")}
    <span class="cq-folk-text">
      <b>${charName(c)}</b>
      <span class="cq-muted small"
        >${role}${t
          ? `; ${t.sides[0].role === "managing" ? "you'd run it" : `${c.first} would run it`}, ${t.sides[0].share} in a hundred yours`
          : ""}</span
      >
    </span>
    <button
      class="cq-btn small"
      ?disabled=${!t}
      @click=${() =>
        openArticles(ui, c.id, "found", { job: v.job, level: v.level })}
    >
      Articles…
    </button>
  </li>`;
}

function startCompanyTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const base = defaultPlan(s, ui.w, life.prov);
  if (!base)
    return html`<p class="cq-empty">
      A company is set up at a port with a market and docks.
      ${ui.map.provinces[life.prov]?.name} hasn't both.
    </p>`;
  if (!draft.plan || draft.plan.from !== life.prov) {
    draft.plan = { ...base };
    draft.cap = 0;
  }
  const plan = draft.plan;
  const q = companyQuote(s, ui.w, plan);
  const o = companyOdds(s, ui.w, plan);
  // ECON (r17): a chest for both legs' cargoes.
  const bp = backPlan(plan);
  const want = Math.ceil(
    (q.cost + (bp ? companyQuote(s, ui.w, bp).cost : 0)) * 2,
  );
  const chest = draft.cap || want;
  const check = companyCheck(s, ui.w, life, plan, chest);
  const set = (p: CompanyPlan) => {
    draft.plan = p;
    draft.cap = 0;
    ui.redraw();
  };
  const partners = likelyPartners(s, life);
  return html`<div class="cq-sb-body">
    <div class="cq-sb-main">
      <section class="cq-sb-step">
        <h4><span>I.</span> Its trade</h4>
        ${planPicker(ui, plan, set, life.prov)}
        <p class="cq-muted small">
          It buys at ${ui.map.provinces[life.prov]?.name} on the cycle you set,
          at the market's own prices, and sells where you send it. Its buying
          dears the price here and its selling cheapens it there; its factors
          hold a cargo back while prices wouldn't pay.
        </p>
      </section>
      <section class="cq-sb-step">
        <h4>
          <span>II.</span> Risk and
          reward${plan.back ? " of each leg" : " of a voyage"}
        </h4>
        ${legPanels(ui, plan)}
      </section>
    </div>
    <aside class="cq-articles-panel cq-sb-panel">
      ${o.net < 0
        ? html`<div class="cq-biz-warn">
            <b>It would lose money</b> once it's going (${signed(o.net)} a
            month). Try other goods, another market, smaller cargoes or a slower
            pace.
          </div>`
        : html`<div class="cq-biz-good">
            <b>About ${signed(o.net)} a month</b> once it's going, after its
            factors; ${signed(o.expected)} a voyage now, risks and all.
          </div>`}
      <label class="cq-field"
        ><span>Its chest to start</span>
        <input
          type="number"
          min=${Math.ceil(q.cost)}
          max="999"
          step="5"
          .value=${String(chest)}
          @change=${(e: Event) => {
            draft.cap = Math.max(
              0,
              Math.round(Number((e.target as HTMLInputElement).value) || 0),
            );
            ui.redraw();
          }}
        />
      </label>
      <p class="cq-muted small">
        ${plan.loads > 0
          ? html`A cargo costs about ${coins(q.cost)}`
          : html`Nothing goes out`}${bp
          ? html`${plan.loads > 0 ? "; " : ": "}the return cargo about
            ${coins(companyQuote(s, ui.w, bp).cost)}`
          : nothing};
        a chest of two keeps it sailing while the first is at sea. Its profit is
        yours each month; a loss comes out of the chest.
      </p>
      <h4 class="cq-int-group">Alone</h4>
      <div class="cq-articles-actions">
        ${action(
          html`Set it
          up${price(CO_SETUP + chest, {
            have: life.purse,
            note: `${CO_SETUP} for the counting room and its books, and ${chest} in its chest`,
          })}`,
          check,
          async () => {
            if (
              await ui.cmd({
                k: "business",
                act: "company",
                plan,
                cap: chest,
              })
            ) {
              play("seal");
              ui.modal(null);
              ui.open({ k: "tab", tab: "estate", sub: "business" });
            }
          },
          `primary ${o.net < 0 ? "risky" : ""}`,
        )}
      </div>
      <h4 class="cq-int-group">With partners</h4>
      ${partners.length
        ? html`<ul class="cq-sb-partners">
            ${partners.slice(0, 5).map(
              (c) =>
                html`<li>
                  ${token(ui, c, "small")}
                  <span class="cq-folk-text">
                    <b>${charName(c)}</b>
                    <span class="cq-muted small"
                      >${c.role ?? (lifeOfChar(s, c.id) ? "player" : "")}</span
                    >
                  </span>
                  <button
                    class="cq-btn small"
                    @click=${() =>
                      openArticles(ui, c.id, "company", { co: plan })}
                  >
                    Articles…
                  </button>
                </li>`,
            )}
          </ul>`
        : html`<p class="cq-muted small">
            Nobody here likely to join just now; anyone's card has
            <i>In business</i>.
          </p>`}
    </aside>
  </div>`;
}

/** A line for where else a business can be started from (Work, the market). */
export function startBizButton(
  ui: GameUi,
  label = "Start a business…",
): TemplateResult {
  const life = ui.life;
  if (!life || isChildLife(ui.s, life)) return html``;
  return html`<button
    class="cq-btn small primary"
    ?disabled=${!!life.travel}
    @click=${() => ui.modal({ k: "startbiz" })}
  >
    ${label}
  </button>`;
}
