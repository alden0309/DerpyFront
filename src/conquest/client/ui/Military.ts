// War as a whole: every army you have and how it's faring, the wars you're
// in and how they're going, offers of peace, and the battles lately fought.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  alliesOf,
  armiesOf,
  armyMen,
  armyMorale,
  attritionOf,
  charName,
  warScore,
} from "../../engine/Queries";
import { REG_NAMES } from "../../engine/Rules";
import type { Army, PeaceTerms } from "../../engine/Types";
import { nationName, people } from "../Text";
import { num, pct, plain } from "../Tip";
import {
  bar,
  breakdownTip,
  GameUi,
  more,
  nationLink,
  provLink,
  section,
} from "./Context";

export function militaryTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const me = ui.me;
  const n = s.nations[me];
  const armies = armiesOf(s, me);
  const men = armies.reduce((m, a) => m + armyMen(a), 0);
  const wars = s.wars.filter((w) => w.a === me || w.b === me);
  const offers = s.offers.filter((o) => o.to === me);
  const battles = s.battles
    .filter(
      (b) => b.attacker.nations.includes(me) || b.defender.nations.includes(me),
    )
    .slice(-8)
    .reverse();
  const training: { p: number; type: string; done: number }[] = [];
  s.provinces.forEach((pr, p) => {
    if (pr.owner === me)
      for (const r of pr.recruits)
        training.push({ p, type: REG_NAMES[r.type], done: r.done });
  });
  return html`
    <header class="cq-panel-head"><h2 class="cq-h2">War</h2></header>
    <div class="cq-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Under arms</span
        ><span class="cq-stat-value">${people(men)}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Armies</span
        ><span class="cq-stat-value">${armies.length}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">War weariness</span>
        ${num(
          plain(n.warExhaustion),
          () => ({
            title: "War weariness (0 to 50)",
            notes: [
              "Grows by half a point each month at war, and with every man lost in battle or to hardship. Falls 1.5 a month at peace.",
              `Right now it adds ${plain(n.warExhaustion / 4)} unrest in every province, and makes your enemies' terms look ${plain(n.warExhaustion * 0.5)} points better to you.`,
            ],
          }),
          `cq-stat-value ${n.warExhaustion > 20 ? "bad" : ""}`,
        )}
      </div>
    </div>
    ${offers.length > 0
      ? section(
          "Offers of peace",
          html`${offers.map(
            (o) =>
              html`<div class="cq-offer">
                <p>
                  ${nationLink(ui, o.from)} offers:
                  ${termsText(ui, o.from, o.terms)}
                </p>
                <div class="cq-btnrow">
                  <button
                    class="cq-btn primary"
                    @click=${() =>
                      void ui.cmd({ k: "answer", offer: o.id, yes: true })}
                  >
                    Accept
                  </button>
                  <button
                    class="cq-btn"
                    @click=${() =>
                      void ui.cmd({ k: "answer", offer: o.id, yes: false })}
                  >
                    Refuse
                  </button>
                </div>
              </div>`,
          )}`,
        )
      : nothing}
    ${section(
      "Wars",
      wars.length === 0
        ? html`<p class="cq-muted">At peace.</p>`
        : html`<ul class="cq-wars">
            ${wars.map((w) => {
              const them = w.a === me ? w.b : w.a;
              const score = warScore(s, w, me);
              const friends = alliesOf(s, me).filter((x) =>
                s.wars.some(
                  (v) =>
                    (v.a === x && v.b === them) || (v.b === x && v.a === them),
                ),
              );
              return html`<li class="cq-war">
                <div class="cq-war-head">
                  <span>Against ${nationLink(ui, them)}</span>
                  ${num(
                    `${score.total > 0 ? "+" : ""}${score.total}`,
                    () =>
                      breakdownTip(
                        "How the war is going for you (−100 to +100)",
                        score,
                      ),
                    `cq-score ${score.total > 0 ? "good" : score.total < 0 ? "bad" : ""}`,
                  )}
                </div>
                <p class="cq-muted small">
                  ${w.why}, since ${formatDate(w.start)}. Battles
                  ${w.won[w.a === me ? 0 : 1]} won, ${w.won[w.a === me ? 1 : 0]}
                  lost.
                  ${friends.length
                    ? html`Allies fighting with you:
                      ${friends
                        .map((f) => nationName(s.nations[f].name))
                        .join(", ")}.`
                    : nothing}
                </p>
                <button
                  class="cq-btn small"
                  @click=${() => ui.modal({ k: "peace", n: them })}
                >
                  Offer terms…
                </button>
              </li>`;
            })}
          </ul>`,
    )}
    ${section(
      "Armies",
      armies.length === 0
        ? html`<p class="cq-muted">
            No armies. Raise regiments in one of your provinces.
          </p>`
        : html`<table class="cq-table compact clickable">
            <thead>
              <tr>
                <th>Where</th>
                <th class="r">Men</th>
                <th>Morale</th>
                <th class="r">Supplies</th>
                <th>Leader</th>
              </tr>
            </thead>
            <tbody>
              ${armies.map((a) => armyRow(ui, a))}
            </tbody>
          </table>`,
    )}
    ${training.length > 0
      ? more(
          html`Training
            <span class="cq-more-hint"
              >${training.length} regiment${training.length === 1 ? "" : "s"}
              being raised</span
            >`,
          html`<ul class="cq-list tight">
            ${training.map(
              (t) =>
                html`<li>
                  ${t.type} at ${provLink(ui, t.p)}
                  <span class="cq-muted small"
                    >ready ${formatDate(t.done)}</span
                  >
                </li>`,
            )}
          </ul>`,
        )
      : nothing}
    ${more(
      html`Recent battles
        <span class="cq-more-hint"
          >${battles.length === 0
            ? "none yet"
            : `${battles.filter((b) => b.winner === (b.attacker.nations.includes(me) ? 0 : 1)).length} won of the last ${battles.length}`}</span
        >`,
      battles.length === 0
        ? html`<p class="cq-muted">None yet.</p>`
        : html`<ul class="cq-list">
            ${battles.map((b) => {
              const ours = b.attacker.nations.includes(me) ? 0 : 1;
              const won = b.winner === ours;
              const us = ours === 0 ? b.attacker : b.defender;
              const them = ours === 0 ? b.defender : b.attacker;
              return html`<li>
                <button
                  class="cq-link"
                  @click=${() => ui.modal({ k: "battle", id: b.id })}
                >
                  <b class=${won ? "good" : "bad"}
                    >${won ? "Victory" : "Defeat"}</b
                  >
                  at ${ui.map.provinces[b.prov].name}
                </button>
                <span class="cq-muted small"
                  >${formatDate(b.day)}: we lost ${Math.round(us.lost)}, they
                  lost ${Math.round(them.lost)}</span
                >
              </li>`;
            })}
          </ul>`,
    )}
  `;
}

function armyRow(ui: GameUi, a: Army): TemplateResult {
  const s = ui.s;
  const att = attritionOf(s, ui.w, a);
  const c = s.chars[a.commander];
  const where =
    a.depart >= 0 && a.path.length
      ? html`${ui.map.provinces[a.prov].name} →
        ${ui.map.provinces[a.path[a.path.length - 1]].name}`
      : ui.map.provinces[a.prov].name;
  const siege = s.provinces[a.prov].siege;
  return html`<tr @click=${() => ui.open({ k: "army", id: a.id })}>
    <td>
      ${where}
      ${siege && siege.by === a.owner && a.depart < 0
        ? html`<span class="cq-chip"
            >Siege ${Math.round(siege.progress)}%</span
          >`
        : nothing}
      ${a.retreating
        ? html`<span class="cq-chip bad">Retreating</span>`
        : nothing}
    </td>
    <td class="r">${Math.round(armyMen(a))}</td>
    <td>${bar(armyMorale(a))}</td>
    <td class="r">
      ${num(
        pct(a.supply),
        () =>
          breakdownTip(
            "Men lost each month to hardship",
            att,
            (v) => `${plain(v * 100)}%`,
            [`Supplies ${pct(a.supply)}.`],
          ),
        a.supply < 0.5 ? "bad" : "",
      )}
    </td>
    <td class="small">
      ${c?.alive ? charName(c) : html`<span class="cq-muted">nobody</span>`}
    </td>
  </tr>`;
}

/** Peace terms in words, from the point of view of whoever receives them. */
export function termsText(ui: GameUi, from: number, t: PeaceTerms): string {
  const P = (ps: number[]) =>
    ps.map((p) => ui.map.provinces[p].name).join(", ");
  const bits: string[] = [];
  const them = nationName(ui.s.nations[from].name);
  if (t.take.length) bits.push(`you give ${them} ${P(t.take)}`);
  if (t.give.length) bits.push(`they give back ${P(t.give)}`);
  if (t.gold > 0) bits.push(`you pay ${t.gold} gold`);
  if (t.gold < 0) bits.push(`they pay you ${-t.gold} gold`);
  return bits.length
    ? `${bits.join("; ")}.`
    : "peace as things stand (white peace).";
}
