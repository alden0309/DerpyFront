// A province: who lives there and how they're doing, what the land makes,
// what's built, and what you can do with it.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  armiesIn,
  armyMen,
  buildCheck,
  buildCost,
  buyCheck,
  capacityOf,
  colonizeCheck,
  foodOutput,
  holder,
  people,
  provinceAdminCost,
  recruitCheck,
  regimentTypes,
  resourceOutput,
  settlers,
  siegeSpeed,
  tribesfolk,
  unrestOf,
} from "../../engine/Queries";
import {
  BUILDINGS,
  CLASS_NAMES,
  COLONY_GOLD,
  COLONY_SETTLERS,
  REG_NAMES,
  REGIMENTS,
  RELIGION_NAMES,
} from "../../engine/Rules";
import type { BuildingKind, Good, Province } from "../../engine/Types";
import {
  BUILDING_HELP,
  BUILDING_LABELS,
  GOOD_COLORS,
  GOOD_NAMES,
  nationName,
  people as peopleText,
  TERRAIN_NAMES,
} from "../Text";
import { num, pct, plain } from "../Tip";
import {
  action,
  bar,
  breakdownTip,
  GameUi,
  mine,
  nationLink,
  section,
} from "./Context";

const BUILD_ORDER: BuildingKind[] = [
  "farm",
  "plantation",
  "tradingpost",
  "mine",
  "lumbercamp",
  "port",
  "fort",
  "smithy",
  "gunsmith",
  "weaver",
  "church",
  "courthouse",
];

export function provincePanel(ui: GameUi, p: number): TemplateResult {
  const s = ui.s;
  const def = ui.map.provinces[p];
  const pr = s.provinces[p];
  const raw = ui.w.raw[p];
  const me = mine(ui);
  const ours = pr.owner === ui.me && ui.me >= 0;
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">${def.name}</h2>
      <div class="cq-chips">
        <span class="cq-chip">${TERRAIN_NAMES[def.terrain]}</span>
        <span class="cq-chip"
          ><i class="cq-good" style="--g:${GOOD_COLORS[raw]}"></i>${GOOD_NAMES[
            raw
          ]}</span
        >
        ${def.coastal ? html`<span class="cq-chip">Coast</span>` : nothing}
        <span class="cq-chip"
          >${Math.round(def.areaKm2 / 1000).toLocaleString("en-US")}k km²</span
        >
      </div>
      <p class="cq-owner">
        ${pr.owner >= 0
          ? html`${nationLink(ui, pr.owner)}`
          : html`<span class="cq-muted">Open country</span>`}
        ${pr.occupier >= 0
          ? html`<span class="cq-held"
              >held by ${nationLink(ui, pr.occupier)}</span
            >`
          : nothing}
        ${pr.owner >= 0 && s.nations[pr.owner].capital === p
          ? html`<span class="cq-chip gold">Capital</span>`
          : nothing}
      </p>
    </header>
    ${pr.colony
      ? html`<div class="cq-progress-line">
          Colony being founded by ${nationLink(ui, pr.colony.by)}, ready
          ${formatDate(pr.colony.done)}
          ${bar(
            (s.day - pr.colony.start) /
              Math.max(1, pr.colony.done - pr.colony.start),
          )}
        </div>`
      : nothing}
    ${pr.siege
      ? html`<div class="cq-progress-line warn">
          ${nationLink(ui, pr.siege.by)}
          ${pr.b.fort ? "besieges" : "is taking control of"} it:
          ${num(`${Math.round(pr.siege.progress)}%`, () =>
            breakdownTip(
              "Siege progress a day",
              siegeSpeed(s, ui.w, p, pr.siege!.by),
              (v) => `${plain(v)}`,
              ["The province falls at 100%."],
            ),
          )}
          ${bar(pr.siege.progress / 100)}
        </div>`
      : nothing}
    ${peopleSection(ui, p, pr)} ${landSection(ui, p, pr)}
    ${ours || pr.owner >= 0 ? buildingsSection(ui, p, pr, ours) : nothing}
    ${ours ? recruitSection(ui, p, pr) : nothing} ${armiesSection(ui, p)}
    ${actionsSection(ui, p, pr, me !== null)} ${modsSection(ui, pr)}
  `;
}

function peopleSection(ui: GameUi, p: number, pr: Province): TemplateResult {
  const s = ui.s;
  const total = people(pr);
  if (total <= 0)
    return section("People", html`<p class="cq-muted">Nobody lives here.</p>`);
  const settled = settlers(pr);
  const native = tribesfolk(pr);
  const cap = capacityOf(s, ui.w, p);
  const rows = [...pr.pops].sort((a, b) => b.size - a.size);
  return section(
    "People",
    html`
      <div class="cq-stats">
        ${settled > 0
          ? html`<div class="cq-stat">
              <span class="cq-stat-label">Settlers</span>
              ${num(
                peopleText(settled),
                () =>
                  breakdownTip(
                    "Room for settlers",
                    cap,
                    (v) => Math.round(v).toLocaleString("en-US"),
                    [
                      `${Math.round(settled).toLocaleString("en-US")} live here now.`,
                    ],
                  ),
                "cq-stat-value",
              )}
              <span class="cq-stat-note"
                >room for ${peopleText(cap.total)}</span
              >
            </div>`
          : nothing}
        ${native > 0
          ? html`<div class="cq-stat">
              <span class="cq-stat-label">Natives</span
              ><span class="cq-stat-value">${peopleText(native)}</span>
            </div>`
          : nothing}
        ${pr.owner >= 0
          ? html`<div class="cq-stat">
              <span class="cq-stat-label">Unrest</span>
              ${num(
                String(Math.round(pr.unrest)),
                () =>
                  breakdownTip(
                    "Unrest (revolt at 100)",
                    unrestOf(s, ui.w, p),
                    (v) => String(Math.round(v)),
                  ),
                `cq-stat-value ${pr.unrest >= 60 ? "bad" : ""}`,
              )}
            </div>`
          : nothing}
        ${pr.owner >= 0 && s.nations[pr.owner].kind !== "crown"
          ? html`<div class="cq-stat">
              <span class="cq-stat-label">Admin cost</span>
              ${num(
                plain(provinceAdminCost(s, ui.w, pr.owner, p).total),
                () =>
                  breakdownTip(
                    "Administration it takes",
                    provinceAdminCost(s, ui.w, pr.owner, p),
                  ),
                "cq-stat-value",
              )}
            </div>`
          : nothing}
      </div>
      <table class="cq-table compact">
        <thead>
          <tr>
            <th>Who</th>
            <th class="r">People</th>
            <th>Food</th>
            <th>Goods</th>
            <th>Luxury</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (pop) =>
              html`<tr>
                <td>
                  ${pop.cls === "tribe"
                    ? (s.nations.find((n) => n.key === pop.culture)?.name ??
                      "Natives")
                    : CLASS_NAMES[pop.cls]}
                  <span class="cq-muted small"
                    >${pop.cls === "tribe"
                      ? RELIGION_NAMES[pop.religion]
                      : `${nationName(pop.culture)}, ${RELIGION_NAMES[pop.religion]}`}</span
                  >
                </td>
                <td class="r">${peopleText(pop.size)}</td>
                <td>
                  ${num(bar(pop.met[0]), () => ({
                    title: "Food",
                    notes: [`${pct(pop.met[0])} of what they need to eat.`],
                  }))}
                </td>
                <td>
                  ${num(bar(pop.met[1]), () => ({
                    title: "Everyday goods",
                    notes: [
                      `${pct(pop.met[1])} of the cloth and tools they need.`,
                    ],
                  }))}
                </td>
                <td>
                  ${num(bar(pop.met[2]), () => ({
                    title: "Luxuries",
                    notes: [`${pct(pop.met[2])} of the luxuries they'd like.`],
                  }))}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>
    `,
  );
}

function landSection(ui: GameUi, p: number, pr: Province): TemplateResult {
  const s = ui.s;
  const raw = ui.w.raw[p];
  if (pr.owner < 0 && people(pr) <= 0) return html``;
  const food = foodOutput(s, ui.w, p);
  const res = resourceOutput(s, ui.w, p);
  const made = Object.entries(pr.made).filter(([, v]) => (v ?? 0) > 0) as [
    Good,
    number,
  ][];
  return section(
    "The land",
    html`<div class="cq-stats">
        <div class="cq-stat">
          <span class="cq-stat-label">Food a month</span>
          ${num(
            plain(food.total),
            () => breakdownTip("Grain and fish a month", food),
            "cq-stat-value",
          )}
        </div>
        <div class="cq-stat">
          <span class="cq-stat-label">${GOOD_NAMES[raw]} a month</span>
          ${num(
            plain(res.total),
            () => breakdownTip(`${GOOD_NAMES[raw]} a month`, res),
            "cq-stat-value",
          )}
        </div>
        ${raw === "furs" && pr.depletion > 0
          ? html`<div class="cq-stat">
              <span class="cq-stat-label">Trapped out</span
              ><span class="cq-stat-value">${pct(pr.depletion)}</span>
            </div>`
          : nothing}
      </div>
      ${made.length > 0
        ? html`<p class="cq-muted small">
            Last month:
            ${made.map(
              ([g, v], i) =>
                html`${i ? ", " : ""}${plain(v)} ${GOOD_NAMES[g].toLowerCase()}`,
            )}
          </p>`
        : nothing}`,
  );
}

function buildingsSection(
  ui: GameUi,
  p: number,
  pr: Province,
  ours: boolean,
): TemplateResult {
  const s = ui.s;
  const kinds = BUILD_ORDER.filter(
    (k) =>
      (pr.b[k] ?? 0) > 0 ||
      (ours && buildCheck(s, ui.w, ui.me, p, k).ok) ||
      (ours && relevant(ui, p, k)),
  );
  if (kinds.length === 0 && !pr.build) return html``;
  return section(
    "Buildings",
    html`
      ${pr.build
        ? html`<div class="cq-progress-line">
            Building ${BUILDING_LABELS[pr.build.kind].toLowerCase()}, done
            ${formatDate(pr.build.done)}
            ${bar(
              (s.day - pr.build.start) /
                Math.max(1, pr.build.done - pr.build.start),
            )}
          </div>`
        : nothing}
      <ul class="cq-builds">
        ${kinds.map((k) => {
          const lvl = pr.b[k] ?? 0;
          const max = BUILDINGS[k].max;
          const cost = buildCost(k, lvl);
          const check = buildCheck(s, ui.w, ui.me, p, k);
          const goods = Object.entries(cost.goods)
            .map(([g, v]) => `${v} ${GOOD_NAMES[g as Good].toLowerCase()}`)
            .join(", ");
          return html`<li>
            <div class="cq-build-name">
              ${num(
                BUILDING_LABELS[k],
                () => ({
                  title: BUILDING_LABELS[k],
                  notes: [
                    BUILDING_HELP[k],
                    `Upkeep ${BUILDINGS[k].upkeep} gold a month per level.`,
                  ],
                }),
                "cq-tipped",
              )}
              <span class="cq-pips"
                >${Array.from(
                  { length: max },
                  (_, i) => html`<i class=${i < lvl ? "on" : ""}></i>`,
                )}</span
              >
            </div>
            ${ours && lvl < max
              ? action(
                  html`${lvl === 0 ? "Build" : "Improve"}
                    <span class="cq-cost"
                      >${cost.gold}g${goods ? `, ${goods}` : ""},
                      ${Math.round(cost.days / 30)} mo</span
                    >`,
                  check,
                  () => void ui.cmd({ k: "build", p, b: k }),
                  "small",
                )
              : nothing}
          </li>`;
        })}
      </ul>
    `,
  );
}

function relevant(ui: GameUi, p: number, k: BuildingKind): boolean {
  const raw = ui.w.raw[p];
  const def = ui.map.provinces[p];
  if (k === "port") return def.coastal;
  if (k === "plantation") return raw === "tobacco" || raw === "sugar";
  if (k === "tradingpost") return raw === "furs";
  if (k === "mine") return raw === "silver";
  if (k === "lumbercamp") return raw === "timber";
  return true;
}

function recruitSection(ui: GameUi, p: number, pr: Province): TemplateResult {
  const s = ui.s;
  const nation = s.nations[ui.me];
  return section(
    "Raise troops",
    html`
      ${pr.recruits.map(
        (r) =>
          html`<div class="cq-progress-line">
            ${REG_NAMES[r.type]} training, ready ${formatDate(r.done)}
            ${bar((s.day - r.start) / Math.max(1, r.done - r.start))}
          </div>`,
      )}
      <div class="cq-recruits">
        ${regimentTypes(nation).map((t) => {
          const r = REGIMENTS[t];
          const goods = Object.entries(r.goods)
            .map(([g, v]) => `${v} ${GOOD_NAMES[g as Good].toLowerCase()}`)
            .join(", ");
          return html`<div class="cq-recruit">
            ${action(
              html`${REG_NAMES[t]}
                <span class="cq-cost"
                  >${r.gold ? `${r.gold}g` : "free"}${goods
                    ? `, ${goods}`
                    : ""},
                  ${r.men} men</span
                >`,
              recruitCheck(s, ui.me, p, t),
              () => void ui.cmd({ k: "recruit", p, t }),
              "small",
              `${r.days} days to train. Upkeep ${r.upkeep} gold a month.`,
            )}
          </div>`;
        })}
      </div>
      <p class="cq-muted small">
        Soldiers are drafted from the laborers here: fewer hands in the fields
        while they serve.
      </p>
    `,
  );
}

function armiesSection(ui: GameUi, p: number): TemplateResult {
  const here = armiesIn(ui.s, p);
  if (here.length === 0) return html``;
  return section(
    "Armies here",
    html`<ul class="cq-list">
      ${here.map(
        (a) =>
          html`<li>
            <button
              class="cq-link"
              @click=${() => ui.open({ k: "army", id: a.id })}
            >
              ${ui.s.nations[a.owner].name}: ${a.regs.length}
              regiment${a.regs.length === 1 ? "" : "s"},
              ${Math.round(armyMen(a))} men
            </button>
          </li>`,
      )}
    </ul>`,
  );
}

function actionsSection(
  ui: GameUi,
  p: number,
  pr: Province,
  player: boolean,
): TemplateResult {
  if (!player) return html``;
  const s = ui.s;
  const out: TemplateResult[] = [];
  if (pr.owner === -1 && !pr.colony && s.nations[ui.me].kind === "power") {
    const check = colonizeCheck(s, ui.w, ui.me, p);
    out.push(
      html`<div class="cq-act">
        ${action(
          html`Found a colony
            <span class="cq-cost"
              >${COLONY_GOLD}g, ${COLONY_SETTLERS}
              settlers${check.ok ? `, ${check.days} days` : ""}</span
            >`,
          check,
          () => void ui.cmd({ k: "colonize", p }),
          "primary",
        )}
        ${check.ok
          ? html`<p class="cq-muted small">
              The settlers leave ${ui.map.provinces[check.source!].name}.
            </p>`
          : nothing}
      </div>`,
    );
  }
  if (
    pr.owner >= 0 &&
    s.nations[pr.owner].kind === "native" &&
    s.nations[ui.me].kind === "power"
  ) {
    const check = buyCheck(s, ui.w, ui.me, p);
    out.push(
      html`<div class="cq-act">
        ${action(
          html`Buy this land
            <span class="cq-cost">${check.ok ? `${check.price}g` : ""}</span>`,
          check,
          () => void ui.cmd({ k: "buy", p }),
        )}
      </div>`,
    );
  }
  if (holder(pr) === ui.me && pr.owner !== ui.me && pr.owner >= 0) {
    out.push(
      html`<p class="cq-muted small">
        You hold this province, but it's still theirs until a peace treaty hands
        it over.
      </p>`,
    );
  }
  return out.length > 0 ? section("Actions", html`${out}`) : html``;
}

function modsSection(ui: GameUi, pr: Province): TemplateResult {
  const mods = pr.mods.filter((m) => m.until > ui.s.day);
  if (mods.length === 0) return html``;
  return section(
    "Lately",
    html`<ul class="cq-list">
      ${mods.map(
        (m) =>
          html`<li>
            ${m.label}
            <span class="cq-muted small">until ${formatDate(m.until)}</span>
          </li>`,
      )}
    </ul>`,
  );
}
