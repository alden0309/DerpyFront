// LEDGER (r15): risk and reward, shown plainly before you commit: each way a
// piece of work can go with its chance and what it brings, the cost a month,
// what's expected a month all told, the dangers, and what changes the odds.
// The figures come from engine/Odds.ts, which reckons them from the tables
// the engine rolls from.

import { html, nothing, TemplateResult } from "lit";
import { USE_NAMES } from "../../engine/Boats";
import { boatChoices, chanceWords, type OddsView } from "../../engine/Odds";
import type { Boat, BoatUse } from "../../engine/Types";
import type { GameUi } from "./Context";
import { coins } from "./Price";

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${coins(Math.abs(v))}`;

const pct = (p: number) =>
  p < 0.01 && p > 0
    ? `${Math.round(p * 1000) / 10}%`
    : `${Math.round(p * 100)}%`;

/** An outcome's amount: "+40 to +70", "nothing", "−50". */
function amount(lo: number, hi: number, trip: boolean, stake: number): string {
  if (trip) {
    // SEA (r15): a range (a cruise's prizes), net of what was put in.
    if (lo !== hi) return `${signed(lo - stake)} to ${signed(hi - stake)}`;
    const net = lo - stake;
    // SEA (r15): with nothing put in (a hand's cruise), nothing back is nothing.
    if (net === 0) return stake ? "your stake back" : "nothing";
    return signed(net);
  }
  if (hi <= 0) return "nothing";
  return lo === hi ? signed(lo) : `${signed(lo)} to ${signed(hi)}`;
}

/**
 * The whole picture of a piece of work: outcomes with their chances, the
 * month's cost, what's expected, the risks, and what changes the odds.
 */
export function oddsPanel(
  v: OddsView,
  o: { factors?: boolean; title?: string } = {},
): TemplateResult {
  const trip = v.per === "trip";
  const stake = trip ? v.costNow : 0;
  const expectedLine = trip
    ? html`Expected ${signed(v.expected)} a trip
        (${v.days
          ? v.days[0] === v.days[1]
            ? `${v.days[0]} days` /* BUSINESS (r15): one length */
            : `${v.days[0]} to ${v.days[1]} days`
          : ""});
        <b class="cq-odds-net ${v.net >= 0 ? "good" : "bad"}"
          >${signed(v.net)} a month</b
        >${v.costMonth ? html` after ${coins(v.costMonth)} wages` : nothing}`
    : html`Brings in
        ${v.expected ? html`≈${coins(v.expected)}` : "nothing"}${v.costMonth
          ? html`, costs ${coins(v.costMonth)}`
          : nothing}:
        <b class="cq-odds-net ${v.net >= 0 ? "good" : "bad"}"
          >${signed(v.net)} a month</b
        >`;
  const max = Math.max(0.0001, ...v.outcomes.map((x) => x.p));
  // What can't happen isn't shown (a clerk too good to lose it all).
  const outcomes = v.outcomes.filter((x) => x.p > 0);
  const risks = v.risks.filter((x) => x.p > 0);
  return html`<div class="cq-odds-panel">
    <p class="cq-odds-head">
      <b>${o.title ?? v.title}</b><span>${expectedLine}</span>
    </p>
    ${outcomes.length
      ? html`<ul class="cq-odds-rows">
          ${outcomes.map(
            (x) =>
              html`<li class=${x.bad ? "bad" : ""}>
                <span class="cq-odds-chance" title=${pct(x.p)}
                  >${chanceWords(x.p)}</span
                >
                <span class="cq-odds-what"
                  >${x.label}${x.note && !trip
                    ? html` <small>(${x.note})</small>`
                    : nothing}
                  <span class="cq-odds-bar"
                    ><span
                      style="width:${Math.round((x.p / max) * 100)}%"
                    ></span
                  ></span>
                </span>
                <span class="cq-odds-amt"
                  >${amount(x.lo, x.hi, trip, stake)}</span
                >
              </li>`,
          )}
        </ul>`
      : nothing}
    ${risks.length
      ? html`<ul class="cq-odds-risks">
          ${risks.map(
            (r) =>
              html`<li>
                ${r.p < 1
                  ? html`<b>${chanceWords(r.p)}</b> a
                      ${trip ? "trip" : "month"}: `
                  : nothing}${r.label}
              </li>`,
          )}
        </ul>`
      : nothing}
    ${o.factors !== false && v.factors.length
      ? html`<details class="cq-more">
          <summary>What changes the odds</summary>
          <ul class="cq-odds-factors">
            ${v.factors.map((f) => html`<li>${f}</li>`)}
          </ul>
        </details>`
      : nothing}
    ${!v.ok && v.why ? html`<p class="cq-odds-why">${v.why}</p>` : nothing}
  </div>`;
}

/** One line: "≈ +3.1 a month (+5.7 to +10.6 in, less 5.5)". */
export function oddsLine(v: OddsView): string {
  if (v.per === "trip")
    return `${signed(v.expected)} a trip expected (${signed(v.lo)} to ${signed(v.hi)}); ${signed(v.net)} a month after wages`;
  return `${signed(v.net)} a month expected (in ${coins(v.lo)} to ${coins(v.hi)}, less ${coins(v.costMonth)})`;
}

/**
 * Every use a boat can be put to, side by side: what each brings in a
 * month, what's left after her crew and keep, and its worst danger; with the
 * full picture of the one she's at (or the one picked).
 */
export function boatUses(
  ui: GameUi,
  b: Boat,
  pick: BoatUse,
  o: { crew?: number } = {},
): TemplateResult {
  const life = ui.life!;
  const rows = boatChoices(ui.s, ui.w, life, b, o);
  const shown = rows.find((r) => r.use === pick) ?? rows[0];
  const worst = (v: OddsView) => {
    const r = v.risks.filter((x) => x.p < 1).sort((a, z) => z.p - a.p)[0];
    return r
      ? `${chanceWords(r.p)}: ${r.label.replace(/:.*$/, "").toLowerCase()}`
      : "";
  };
  return html`<table class="cq-uses-table">
      <thead>
        <tr>
          <th>Her work</th>
          <th title="What she brings in a month, on average">In ≈</th>
          <th title="After her crew's wages and her keep">A month</th>
          <th class="wide">The danger</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          ({ use, view }) =>
            html`<tr class=${use === b.use ? "on" : ""}>
              <td>${USE_NAMES[use]}</td>
              ${view.ok || use === "idle"
                ? html`<td>${view.expected ? coins(view.expected) : "–"}</td>
                    <td class=${view.net >= 0 ? "good" : "bad"}>
                      ${signed(view.net)}
                    </td>`
                : html`<td class="na" colspan="2" title=${view.why ?? ""}>
                    ${/whales/.test(view.why ?? "")
                      ? "no whales here"
                      : /hands/.test(view.why ?? "")
                        ? "short-handed"
                        : "nobody to sail her"}
                  </td>`}
              <td class="wide">${worst(view)}</td>
            </tr>`,
        )}
      </tbody>
    </table>
    ${shown && shown.use !== "idle" ? oddsPanel(shown.view) : nothing}`;
}
