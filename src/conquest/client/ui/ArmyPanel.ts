// An army: its regiments, who leads it, whether it's fed, what it's losing
// to the weather and the land, and where it's going. If you command it, its
// orders are yours.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { COMMAND_RANK } from "../../engine/LifeRules";
import {
  armyMen,
  armyMorale,
  attritionOf,
  stat,
  supplyLimit,
} from "../../engine/Queries";
import { REG_NAMES } from "../../engine/Rules";
import type { Army } from "../../engine/Types";
import { num, pct, plain } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  charLink,
  GameUi,
  nationLink,
  provLink,
  section,
} from "./Context";
import { sightOf } from "./WorldUi";

export function armyPanel(ui: GameUi, id: number): TemplateResult {
  const s = ui.s;
  const a = s.armies.find((x) => x.id === id);
  if (!a) return html`<p class="cq-muted">That army is gone.</p>`;
  const me = ui.me;
  const life = ui.life;
  // WORLD r11: an army out of sight is only a rumour.
  const sight = sightOf(ui, a.prov);
  if (
    (sight === "known" || sight === "unknown") &&
    !(me && (a.commander === me.id || life?.job?.army === a.id))
  )
    return html`<header class="cq-panel-head">
        <h2 class="cq-h2">The ${s.nations[a.owner].adjective} army</h2>
      </header>
      <p class="cq-muted cq-fog-note">
        Out of sight. Whatever you know of its numbers and its marching is
        hearsay; get closer to see for yourself.
      </p>`;
  const yours = !!me && a.commander === me.id;
  const marching = !!life?.job && life.job.army === a.id;
  const men = armyMen(a);
  const morale = armyMorale(a);
  const att = attritionOf(s, ui.w, a);
  const commander = s.chars[a.commander];
  const job = life?.job;
  const n = s.nations[a.owner];
  const canLead =
    !!me &&
    !yours &&
    ((!!job &&
      (job.kind === "soldier" || job.kind === "warrior") &&
      job.nation === a.owner &&
      job.rank >= (COMMAND_RANK[job.kind] ?? 99)) ||
      n.council.marshal === me.id ||
      n.ruler === me.id);
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">${yours ? "Your army" : `The ${n.adjective} army`}</h2>
      <p class="cq-owner">
        ${nationLink(ui, a.owner)} at ${provLink(ui, a.prov)}
      </p>
      ${marching && !yours
        ? html`<p class="cq-chip">You march with it</p>`
        : nothing}
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
        ${canLead
          ? action(
              "Take command",
              a.prov === life!.prov && !life!.travel
                ? { ok: true }
                : { ok: false, why: "Go to where it is" },
              () => void ui.cmd({ k: "command", army: a.id }),
              "small",
            )
          : nothing}
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
    ${yours
      ? section(
          "Your orders",
          html`<div class="cq-btnrow">
              <button
                class="cq-btn primary"
                ?disabled=${a.retreating}
                @click=${() => ui.pickMarch()}
              >
                March to…
              </button>
              <button
                class="cq-btn"
                ?disabled=${a.depart < 0 || a.path.length < 2 || a.retreating}
                @click=${() => void ui.cmd({ k: "march", to: a.path[0] })}
              >
                Halt at the next stop
              </button>
              <button
                class="cq-btn quiet"
                @click=${() => void ui.cmd({ k: "command", army: -1 })}
              >
                Give up the command
              </button>
            </div>
            <p class="cq-muted small">
              Or right-click (long-press) a province on the map. You go where
              the army goes, and share its battles.
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
          "On their own land the army eats from the colony's warehouses: supplies follow how much food the market has.",
        ]
      : [
          `Away from home they live off the land: ${Math.round(armyMen(a))} men here. Short of food, morale and men fall.`,
        ],
  );
}
