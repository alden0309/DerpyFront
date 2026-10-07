// An army: its regiments, who leads it, whether it's fed, what it's losing
// to the weather and the land, and where it's going.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { nationCharacters } from "../../engine/Characters";
import {
  ageOf,
  armyMen,
  armyMorale,
  attritionOf,
  charName,
  stat,
  supplyLimit,
} from "../../engine/Queries";
import { ADULT_AGE, REG_NAMES } from "../../engine/Rules";
import type { Army } from "../../engine/Types";
import { num, pct, plain } from "../Tip";
import {
  bar,
  breakdownTip,
  charLink,
  GameUi,
  nationLink,
  provLink,
  section,
} from "./Context";

export function armyPanel(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const a = s.armies.find((x) => x.id === id);
  if (!a) return html`<p class="cq-muted">That army is gone.</p>`;
  const ours = a.owner === ui.me;
  const men = armyMen(a);
  const morale = armyMorale(a);
  const att = attritionOf(s, ui.w, a);
  const commander = s.chars[a.commander];
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">
        ${ours ? "Your army" : `${s.nations[a.owner].adjective} army`}
      </h2>
      <p class="cq-owner">
        ${nationLink(ui, a.owner)} at ${provLink(ui, a.prov)}
      </p>
    </header>
    <div class="cq-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Men</span
        ><span class="cq-stat-value">${Math.round(men)}</span>
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Morale</span>
        ${num(
          pct(morale),
          () => ({
            title: "Morale",
            notes: [
              "Falls in battle and with hunger; comes back with rest, food and pay.",
              `Capped at ${pct(0.4 + 0.6 * a.supply)} by their supplies.`,
            ],
          }),
          "cq-stat-value",
        )}
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Supplies</span>
        ${num(
          pct(a.supply),
          () => supplyTip(ui, a),
          `cq-stat-value ${a.supply < 0.5 ? "bad" : ""}`,
        )}
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Losses a month</span>
        ${num(
          pct(att.total),
          () =>
            breakdownTip(
              "Men lost each month to hardship",
              att,
              (v) => `${plain(v * 100)}%`,
            ),
          `cq-stat-value ${att.total > 0.03 ? "bad" : ""}`,
        )}
      </div>
    </div>
    ${a.depart >= 0 && a.path.length > 0
      ? html`<p class="cq-progress-line">
          ${a.retreating ? "Retreating" : "Marching"} to
          ${provLink(ui, a.path[a.path.length - 1])}, next stop
          ${ui.map.provinces[a.path[0]].name} on
          ${formatDate(a.arrive)}${a.sea ? " (by sea)" : ""}
        </p>`
      : nothing}
    ${section(
      "Commander",
      html`<div class="cq-commander">
        ${commander?.alive
          ? html`${charLink(ui, commander)}
              <span class="cq-muted"
                >martial ${stat(s, commander, "mar")}</span
              >`
          : html`<span class="cq-muted"
              >Nobody leads it (−8% in battle).</span
            >`}
        ${ours ? commanderPicker(ui, a) : nothing}
      </div>`,
    )}
    ${section(
      "Regiments",
      html`<table class="cq-table compact">
        <tbody>
          ${a.regs.map(
            (r) =>
              html`<tr>
                <td>${REG_NAMES[r.type]}</td>
                <td class="r">${Math.round(r.men)}</td>
                <td>${bar(r.morale)}</td>
                <td class="cq-muted small">
                  ${r.home >= 0
                    ? ui.map.provinces[r.home]?.name
                    : "the crown's"}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>`,
    )}
    ${ours
      ? section(
          "Orders",
          html`<div class="cq-btnrow">
              <button
                class="cq-btn primary"
                ?disabled=${a.retreating}
                @click=${() => ui.pickTarget(a.id)}
              >
                March to…
              </button>
              <button
                class="cq-btn"
                ?disabled=${a.depart < 0 && a.path.length === 0}
                @click=${() => void ui.cmd({ k: "stop", a: a.id })}
              >
                Halt
              </button>
              <button
                class="cq-btn"
                ?disabled=${a.regs.length < 2 || a.depart >= 0}
                @click=${() => void ui.cmd({ k: "split", a: a.id })}
              >
                Split in two
              </button>
              ${s.armies
                .filter(
                  (x) =>
                    x !== a &&
                    x.owner === a.owner &&
                    x.prov === a.prov &&
                    x.depart < 0 &&
                    a.depart < 0,
                )
                .map(
                  (x) =>
                    html`<button
                      class="cq-btn"
                      @click=${() =>
                        void ui.cmd({ k: "merge", a: a.id, b: x.id })}
                    >
                      Join army of ${x.regs.length}
                    </button>`,
                )}
              <button
                class="cq-btn danger"
                @click=${() => void ui.cmd({ k: "disband", a: a.id })}
              >
                Send them home
              </button>
            </div>
            <p class="cq-muted small">
              Or, with the army selected, right-click a province on the map.
            </p>`,
        )
      : nothing}
  `;
}

function supplyTip(ui: GameUi, a: Army) {
  const s = ui.s;
  const pr = s.provinces[a.prov];
  const own = pr.owner === a.owner && pr.occupier < 0;
  const limit = supplyLimit(s, ui.w, a.owner, a.prov);
  return breakdownTip(
    "What this land can feed (thousands of men)",
    limit,
    (v) => plain(v),
    own && s.nations[a.owner].kind === "power"
      ? [
          "On your own land the army eats from your warehouses: supplies follow how much food the market has.",
        ]
      : [
          `Away from home they live off the land: ${Math.round(armyMen(a))} men here. Short of food, morale and men fall.`,
        ],
  );
}

function commanderPicker(ui: GameUi, a: Army): TemplateResult {
  const s = ui.s;
  const leading = new Set(
    s.armies.filter((x) => x !== a).map((x) => x.commander),
  );
  const options = nationCharacters(s, a.owner)
    .filter((c) => c.alive && ageOf(s, c) >= ADULT_AGE && !leading.has(c.id))
    .sort((x, y) => stat(s, y, "mar") - stat(s, x, "mar"));
  return html`<select
    class="cq-select"
    @change=${(e: Event) =>
      void ui.cmd({
        k: "lead",
        a: a.id,
        c: Number((e.target as HTMLSelectElement).value),
      })}
  >
    <option value="-1" ?selected=${a.commander < 0}>Nobody</option>
    ${options.map(
      (c) =>
        html`<option value=${c.id} ?selected=${c.id === a.commander}>
          ${charName(c)} (martial ${stat(s, c, "mar")})
        </option>`,
    )}
  </select>`;
}
