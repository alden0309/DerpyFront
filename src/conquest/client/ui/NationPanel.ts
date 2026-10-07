// Another nation: who rules it, what they think of you, and what you can
// sign, send or declare. The Diplomacy tab lists everyone you deal with.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  armiesOf,
  armyMen,
  atWar,
  enemiesOf,
  giftCheck,
  nationPeople,
  nationsBorder,
  provincesOf,
  relationOf,
  rulerOf,
  treatyBetween,
  treatyCheck,
  treatyWillingness,
  truceUntil,
  warBetween,
  warCheck,
  warScore,
} from "../../engine/Queries";
import type { TreatyKind } from "../../engine/Types";
import { flagFor } from "../Flags";
import { nationName, people, TREATY_NAMES } from "../Text";
import { num } from "../Tip";
import {
  action,
  breakdownTip,
  charLink,
  GameUi,
  nationLink,
  section,
} from "./Context";

const TREATIES: TreatyKind[] = ["trade", "alliance", "access"];

export function nationPanel(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const nation = s.nations[n];
  if (!nation) return html``;
  const me = ui.me;
  const isMe = n === me;
  const ruler = rulerOf(s, n);
  const men = armiesOf(s, n).reduce((m, a) => m + armyMen(a), 0);
  const war = me >= 0 ? warBetween(s, me, n) : undefined;
  return html`
    <header class="cq-panel-head with-flag">
      ${flagFor(nation, "cq-flag lg")}
      <div>
        <h2 class="cq-h2">${nationName(nation.name)}</h2>
        <p class="cq-owner">
          ${nation.kind === "power"
            ? nation.independent
              ? "Independent"
              : "Colony"
            : nation.kind === "native"
              ? "Native nation"
              : "A crown in Europe"}
          ${nation.playerName
            ? html`<span class="cq-chip">${nation.playerName}</span>`
            : nothing}
          ${!nation.alive
            ? html`<span class="cq-chip bad">Fallen</span>`
            : nothing}
        </p>
      </div>
    </header>
    <div class="cq-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Ruler</span
        ><span class="cq-stat-value small">${charLink(ui, ruler)}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Provinces</span
        ><span class="cq-stat-value">${provincesOf(s, n).length}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">People</span
        ><span class="cq-stat-value">${people(nationPeople(s, n))}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Under arms</span
        ><span class="cq-stat-value">${people(men)}</span>
      </div>
      ${!isMe && me >= 0
        ? html`<div class="cq-stat">
            <span class="cq-stat-label">They think of you</span>
            ${num(
              String(relationOf(s, ui.w, n, me).total),
              () =>
                breakdownTip(
                  `What ${nation.name} thinks of you`,
                  relationOf(s, ui.w, n, me),
                ),
              `cq-stat-value ${relationOf(s, ui.w, n, me).total < -20 ? "bad" : relationOf(s, ui.w, n, me).total > 20 ? "good" : ""}`,
            )}
          </div>`
        : nothing}
    </div>
    ${war
      ? section(
          "At war",
          html`<p>
              ${war.why}, since ${formatDate(war.start)}. How it's going for
              you:
              ${num(String(warScore(s, war, me).total), () =>
                breakdownTip("War score (you)", warScore(s, war, me)),
              )}
            </p>
            <button
              class="cq-btn primary"
              @click=${() => ui.modal({ k: "peace", n })}
            >
              Offer terms…
            </button>`,
        )
      : nothing}
    ${!isMe && me >= 0 && nation.alive && nation.kind !== "crown"
      ? diplomacy(ui, n)
      : nothing}
    ${section(
      "Their wars",
      enemiesOf(s, n).length === 0
        ? html`<p class="cq-muted">At peace.</p>`
        : html`<ul class="cq-list">
            ${enemiesOf(s, n).map((x) => html`<li>${nationLink(ui, x)}</li>`)}
          </ul>`,
    )}
  `;
}

function diplomacy(ui: GameUi, n: number): TemplateResult {
  const s = ui.s;
  const me = ui.me;
  const at = atWar(s, me, n);
  const truce = truceUntil(s, me, n);
  return section(
    "Dealings",
    html`
      <ul class="cq-treaties">
        ${TREATIES.map((k) => {
          const has = treatyBetween(s, me, n, k);
          const check = treatyCheck(s, ui.w, me, n, k);
          const willing = treatyWillingness(s, ui.w, me, n, k);
          return html`<li>
            <span>${TREATY_NAMES[k]}</span>
            ${has
              ? html`<span class="cq-chip good">Signed</span>
                  <button
                    class="cq-btn small"
                    @click=${() => void ui.cmd({ k: "untreaty", n, t: k })}
                  >
                    End it
                  </button>`
              : html`${num(
                  willing.total >= 0 ? "Willing" : "Unwilling",
                  () =>
                    breakdownTip("Would they sign?", willing, undefined, [
                      "They sign at 0 or more.",
                    ]),
                  willing.total >= 0 ? "good" : "bad",
                )}
                ${action(
                  "Propose",
                  s.nations[n].player !== null && !at ? { ok: true } : check,
                  () => void ui.cmd({ k: "treaty", n, t: k }),
                  "small",
                )}`}
          </li>`;
        })}
      </ul>
      <div class="cq-btnrow">
        ${[25, 50, 100].map((gold) =>
          action(
            `Send ${gold} gold`,
            giftCheck(s, me, n, gold),
            () => void ui.cmd({ k: "gift", n, gold }),
            "small",
          ),
        )}
      </div>
      ${!at
        ? html`<div class="cq-btnrow">
              ${action(
                "Declare war",
                warCheck(s, me, n),
                () => {
                  if (confirm(`Declare war on ${s.nations[n].name}?`))
                    void ui.cmd({ k: "war", n });
                },
                "danger",
              )}
            </div>
            ${truce > s.day
              ? html`<p class="cq-muted small">
                  A truce holds until ${formatDate(truce)}.
                </p>`
              : nothing}`
        : nothing}
    `,
  );
}

/** Everyone you deal with: neighbours first, then the other powers. */
export function diplomacyTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const me = ui.me;
  const known = s.nations.filter(
    (n) =>
      n.alive &&
      n.id !== me &&
      n.kind !== "crown" &&
      (n.kind === "power" ||
        nationsBorder(s, ui.map, me, n.id) ||
        nationsBorder(s, ui.map, n.id, me) ||
        atWar(s, me, n.id) ||
        !!treatyBetween(s, me, n.id, "trade") ||
        !!treatyBetween(s, me, n.id, "alliance")),
  );
  const rows = known
    .map((n) => ({ n, opinion: relationOf(s, ui.w, n.id, me) }))
    .sort(
      (a, b) =>
        Number(b.n.kind === "power") - Number(a.n.kind === "power") ||
        a.opinion.total - b.opinion.total,
    );
  return html`
    <header class="cq-panel-head"><h2 class="cq-h2">Diplomacy</h2></header>
    <p class="cq-muted small">
      The colonial powers, and native nations on your borders or in your
      treaties. Lowest opinion first: those are the ones to watch.
    </p>
    <table class="cq-table">
      <thead>
        <tr>
          <th>Nation</th>
          <th class="r">Opinion</th>
          <th>Treaties</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          ({ n, opinion }) =>
            html`<tr>
              <td>
                ${nationLink(ui, n.id)}${atWar(s, me, n.id)
                  ? html` <span class="cq-chip bad">War</span>`
                  : nothing}
              </td>
              <td class="r">
                ${num(
                  String(opinion.total),
                  () => breakdownTip(`What ${n.name} thinks of you`, opinion),
                  opinion.total < -20
                    ? "bad"
                    : opinion.total > 20
                      ? "good"
                      : "",
                )}
              </td>
              <td class="small">
                ${TREATIES.filter((k) => treatyBetween(s, me, n.id, k))
                  .map((k) => TREATY_NAMES[k])
                  .join(", ") || html`<span class="cq-muted">None</span>`}
              </td>
            </tr>`,
        )}
      </tbody>
    </table>
  `;
}
