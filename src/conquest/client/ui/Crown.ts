// The crown back home: how much it trusts you, what it wants, what it gives,
// the wars it fights in Europe, and the three roads a colony can take.

import { html, nothing, TemplateResult } from "lit";
import { dayOf, formatDate } from "../../engine/Calendar";
import { HISTORY } from "../../engine/Crown";
import {
  autonomyTarget,
  emigration,
  expectedRemit,
  favorTarget,
  independenceCheck,
  pairKey,
  scoreOf,
} from "../../engine/Queries";
import { INDEPENDENCE_AUTONOMY, TITLE_NAMES } from "../../engine/Rules";
import "../Range";
import { nationName } from "../Text";
import { num } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  GameUi,
  more,
  nationLink,
  section,
} from "./Context";

const TITLE_REMITTED = [0, 150, 500, 1200, 2500];

export function crownTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const n = s.nations[ui.me];
  if (n.kind !== "power")
    return html`<p class="cq-muted">Native nations answer to no crown.</p>`;
  const ft = favorTarget(s, ui.w, ui.me);
  const at = autonomyTarget(s, ui.w, ui.me);
  const em = emigration(s, ui.me);
  const expected = expectedRemit(n);
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">
        ${n.independent ? "Independence" : `The ${n.adjective} crown`}
      </h2>
    </header>
    ${n.rebelling && n.rebellion
      ? html`<div class="cq-callout bad">
          <b>The War of Independence.</b> The crown has sent
          ${n.rebellion.expeditions}
          army${n.rebellion.expeditions === 1 ? "" : "ies"};
          ${n.rebellion.beaten} beaten. Beat three, or hold out until
          ${formatDate(n.rebellion.since + 365 * 8)}, and you're free. Lose your
          capital for six months and it's the gallows.
        </div>`
      : nothing}
    <div class="cq-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Crown favor</span>
        ${num(
          String(Math.round(n.favor)),
          () =>
            breakdownTip("Where crown favor is heading", ft, undefined, [
              `Now ${Math.round(n.favor)}; it moves a tenth of the way to ${ft.total} each month.`,
            ]),
          `cq-stat-value ${n.favor < 30 ? "bad" : n.favor > 70 ? "good" : ""}`,
        )}
        <span class="cq-stat-note">heading for ${ft.total}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Autonomy</span>
        ${num(
          String(Math.round(n.autonomy)),
          () =>
            breakdownTip("Where autonomy is heading", at, undefined, [
              `Now ${Math.round(n.autonomy)}. At ${INDEPENDENCE_AUTONOMY} you can declare independence.`,
            ]),
          "cq-stat-value",
        )}
        <span class="cq-stat-note">heading for ${at.total}</span>
      </div>
    </div>
    ${more(
      html`Honours and settlers
        <span class="cq-more-hint"
          >${n.title > 0 ? TITLE_NAMES[n.title] : "no honours yet"}, ${em.total}
          settlers a month</span
        >`,
      html`<div class="cq-stats">
        <div class="cq-stat">
          <span class="cq-stat-label">Settlers a month</span>
          ${num(
            String(em.total),
            () => breakdownTip("Settlers sailing from home each month", em),
            "cq-stat-value",
          )}
        </div>
        <div class="cq-stat">
          <span class="cq-stat-label">Honours</span
          ><span class="cq-stat-value small"
            >${n.title > 0 ? TITLE_NAMES[n.title] : "None yet"}</span
          >
          ${n.title < 4 && !n.independent
            ? html`<span class="cq-stat-note"
                >${TITLE_NAMES[n.title + 1]} needs favor 75 and
                ${TITLE_REMITTED[n.title + 1]} gold sent home
                (${Math.round(n.stats.remitted)} so far)</span
              >`
            : nothing}
        </div>
      </div>`,
    )}
    ${!n.independent && !n.rebelling
      ? section(
          "Money sent home",
          html`<cq-range
              label="Share of income"
              .min=${0}
              .max=${50}
              .step=${1}
              .value=${Math.round(n.remit * 100)}
              .format=${(v: number) => `${v}%`}
              .note=${(v: number) => remitNote(v, expected)}
              @cq-change=${(e: CustomEvent<number>) =>
                void ui.cmd({ k: "remit", share: e.detail / 100 })}
            ></cq-range>
            <p class="cq-muted small">
              The crown expects ${Math.round(expected * 100)}%. More earns
              favor; less keeps money at home and pushes autonomy up.
            </p>`,
        )
      : nothing}
    ${n.demand
      ? section(
          "The crown asks",
          html`<p><b>${n.demand.label}</b>, by ${formatDate(n.demand.due)}.</p>
            ${n.demand.key === "money"
              ? html`<div class="cq-btnrow">
                  ${action(
                    `Pay ${n.demand.amount} gold`,
                    n.gold >= n.demand.amount
                      ? { ok: true }
                      : { ok: false, why: "Not enough gold." },
                    () => void ui.cmd({ k: "demand", pay: true }),
                    "primary",
                  )}
                  <button
                    class="cq-btn"
                    @click=${() => void ui.cmd({ k: "demand", pay: false })}
                  >
                    Refuse (−15 favor)
                  </button>
                </div>`
              : html`<p class="cq-muted small">
                    Occupy one of their provinces before the deadline. Refusing
                    costs 15 favor.
                  </p>
                  <button
                    class="cq-btn"
                    @click=${() => void ui.cmd({ k: "demand", pay: false })}
                  >
                    Refuse
                  </button>`}`,
        )
      : nothing}
    ${section("Three roads", roads(ui))}
    ${more("Europe and the other crowns", europe(ui))}
    ${n.mods.length > 0
      ? section(
          "Lately",
          html`<ul class="cq-list">
            ${n.mods
              .filter((m) => m.until > s.day)
              .map(
                (m) =>
                  html`<li>
                    ${m.label}
                    <span class="cq-muted small"
                      >until ${formatDate(m.until)}</span
                    >
                  </li>`,
              )}
          </ul>`,
        )
      : nothing}
  `;
}

/** What a remit share means next to what the crown expects. */
function remitNote(v: number, expected: number): string {
  const e = Math.round(expected * 100);
  if (v === e) return "just what the crown expects";
  return v > e
    ? `${v - e} points over what's expected: favor rises`
    : `${e - v} points under what's expected: favor falls, autonomy rises`;
}

function roads(ui: GameUi): TemplateResult {
  const s = ui.s;
  const n = s.nations[ui.me];
  const score = scoreOf(s, ui.w, ui.me);
  const check = independenceCheck(s, ui.me);
  return html`<div class="cq-roads">
      <div class="cq-road">
        <h4>Loyal servant</h4>
        <p>
          Keep the crown's favor high, send money home, follow its demands.
          Honours (worth 25 points each) and royal grants follow.
        </p>
        ${bar(n.favor / 100)}
      </div>
      <div class="cq-road">
        <h4>Merchant colony</h4>
        <p>
          Grow rich and populous on your own terms. Wealth, settlers and land
          all score, and autonomy grows as you do.
        </p>
        ${bar(Math.min(1, n.autonomy / INDEPENDENCE_AUTONOMY))}
      </div>
      <div class="cq-road">
        <h4>Independence</h4>
        <p>
          At ${INDEPENDENCE_AUTONOMY} autonomy you may declare it. The crown
          will send armies; win and you're free (150 points), lose and you hang.
        </p>
        ${n.independent
          ? html`<span class="cq-chip good">Won</span>`
          : action(
              "Declare independence",
              check,
              () => {
                if (
                  confirm(
                    "Declare independence? The crown will send armies to crush you.",
                  )
                )
                  void ui.cmd({ k: "independence" });
              },
              "danger",
            )}
      </div>
    </div>
    <p class="cq-muted small">
      Your score now:
      ${num(String(score.total), () => breakdownTip("Victory points", score))}
    </p>`;
}

function europe(ui: GameUi): TemplateResult {
  const s = ui.s;
  const me = ui.me;
  const powers = s.nations.filter(
    (x) => x.kind === "power" && x.id !== me && x.alive,
  );
  const upcoming = HISTORY.filter((h) => {
    const mine = s.nations[me].key;
    return (
      (h.a === mine || h.b === mine) && dayOf(h.from[0], h.from[1]) > s.day
    );
  }).slice(0, 1);
  return html`<table class="cq-table compact">
      <thead>
        <tr>
          <th>Crown</th>
          <th>Tension</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${powers.map((p) => {
          const k = pairKey(me, p.id);
          const t = s.europe.tension[k] ?? 0;
          const war = s.europe.wars[k];
          return html`<tr>
            <td>${nationLink(ui, p.id)}</td>
            <td>
              ${num(bar(t / 100, "tension"), () => ({
                title: `Tension with ${nationName(p.name)}`,
                notes: [
                  `${Math.round(t)} of 100. Old rivalries push it up each month, fighting in the colonies more; at 100 the crowns go to war.`,
                ],
              }))}
            </td>
            <td>
              ${war !== undefined
                ? html`<span class="cq-chip bad"
                    >At war since ${formatDate(war)}</span
                  >`
                : nothing}
            </td>
          </tr>`;
        })}
      </tbody>
    </table>
    ${upcoming.length
      ? html`<p class="cq-muted small">
          Rumours from home: ${upcoming[0].name.replace(/^The /, "the ")} is
          brewing.
        </p>`
      : nothing}
    <p class="cq-muted small">
      When the crowns make peace in Europe, each side keeps the colonial
      provinces it holds.
    </p>`;
}
