// A province: the few things that matter at a glance (who lives here, how
// restless they are, what the land makes), what's built, and what you can do
// with it. The detail is a click away.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { isExplored } from "../../engine/Missions";
import {
  abandonCheck,
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
  RICH_WORD,
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
  EXPEDITION,
  OUTPOST,
  REG_NAMES,
  REGIMENTS,
  RELIGION_NAMES,
} from "../../engine/Rules";
import type { BuildingKind, Good, Province } from "../../engine/Types";
import { BUILDING_MAKES, buildingIcon } from "../BuildingIcons";
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
  more,
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
  const known = ui.me < 0 || isExplored(s, ui.me, p);
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">${def.name}</h2>
      <p class="cq-owner">
        ${pr.owner >= 0
          ? nationLink(ui, pr.owner)
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
      <p class="cq-place-facts">
        ${TERRAIN_NAMES[def.terrain]}${def.coastal ? ", on the coast" : ""}.
        ${known
          ? html`<span class="cq-good-tag"
                ><i class="cq-good" style="--g:${GOOD_COLORS[raw]}"></i
                >${GOOD_NAMES[raw]}</span
              >${pr.rich
                ? html` <span class="cq-chip gold"
                    >Rich ${RICH_WORD[raw]}</span
                  >`
                : nothing}`
          : html`<span class="cq-muted"
              >Unsurveyed: nobody knows what it yields.</span
            >`}
        ${pr.outpost
          ? html`<span class="cq-chip"
              >Outpost (${nationName(s.nations[pr.outpost.by].name)})</span
            >`
          : nothing}
      </p>
    </header>
    ${progress(ui, p, pr)} ${figures(ui, p, pr, known)}
    ${ours || pr.owner >= 0 ? buildingsSection(ui, p, pr, ours) : nothing}
    ${actionsSection(ui, p, pr, me !== null, known)} ${armiesSection(ui, p)}
    ${ours ? recruitSection(ui, p, pr) : nothing} ${peopleDetail(ui, p, pr)}
    ${modsSection(ui, pr)}
  `;
}

function progress(ui: GameUi, p: number, pr: Province): TemplateResult {
  const s = ui.s;
  return html`${pr.colony
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
  ${pr.build
    ? html`<div class="cq-progress-line">
        ${buildingIcon(pr.build.kind)} Building
        ${BUILDING_LABELS[pr.build.kind].toLowerCase()}, done
        ${formatDate(pr.build.done)}
        ${bar(
          (s.day - pr.build.start) /
            Math.max(1, pr.build.done - pr.build.start),
        )}
      </div>`
    : nothing}`;
}

/** The three or four numbers worth seeing first. */
function figures(
  ui: GameUi,
  p: number,
  pr: Province,
  known: boolean,
): TemplateResult {
  const s = ui.s;
  const total = people(pr);
  const settled = settlers(pr);
  const native = tribesfolk(pr);
  const raw = ui.w.raw[p];
  const cap = capacityOf(s, ui.w, p);
  const food = foodOutput(s, ui.w, p);
  const res = resourceOutput(s, ui.w, p);
  const owned = pr.owner >= 0;
  return html`<div class="cq-figures">
    <div>
      <span>People</span>
      ${total <= 0
        ? html`<b>none</b>`
        : num(
            peopleText(total),
            () =>
              breakdownTip(
                "Room for settlers",
                cap,
                (v) => Math.round(v).toLocaleString("en-US"),
                [
                  `${Math.round(settled).toLocaleString("en-US")} settlers and ${Math.round(native).toLocaleString("en-US")} natives live here.`,
                ],
              ),
            "cq-figure",
          )}
    </div>
    ${owned
      ? html`<div>
          <span>Unrest</span>
          ${num(
            String(Math.round(pr.unrest)),
            () =>
              breakdownTip(
                "Unrest (revolt at 100)",
                unrestOf(s, ui.w, p),
                (v) => String(Math.round(v)),
              ),
            `cq-figure ${pr.unrest >= 60 ? "bad" : ""}`,
          )}
        </div>`
      : nothing}
    ${owned && total > 0
      ? html`<div>
          <span>Food / month</span>
          ${num(
            plain(food.total),
            () => breakdownTip("Grain and fish a month", food),
            "cq-figure",
          )}
        </div>`
      : nothing}
    ${owned && total > 0 && known
      ? html`<div>
          <span>${GOOD_NAMES[raw]} / month</span>
          ${num(
            plain(res.total),
            () => breakdownTip(`${GOOD_NAMES[raw]} a month`, res),
            "cq-figure",
          )}
        </div>`
      : nothing}
  </div>`;
}

/** Who lives here and how they're getting on: one click away. */
function peopleDetail(ui: GameUi, p: number, pr: Province): TemplateResult {
  const s = ui.s;
  if (people(pr) <= 0) return html``;
  const rows = [...pr.pops].sort((a, b) => b.size - a.size);
  const admin =
    pr.owner >= 0 && s.nations[pr.owner].kind !== "crown"
      ? provinceAdminCost(s, ui.w, pr.owner, p)
      : null;
  return more(
    "Who lives here",
    html`<table class="cq-table compact">
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
      ${admin
        ? html`<p class="cq-muted small">
            Takes
            ${num(plain(admin.total), () =>
              breakdownTip("Administration it takes", admin),
            )}
            of your officials' attention.
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
  const built = BUILD_ORDER.filter((k) => (pr.b[k] ?? 0) > 0);
  const options = ours
    ? BUILD_ORDER.filter((k) => (pr.b[k] ?? 0) === 0 && relevant(ui, p, k))
    : [];
  if (built.length === 0 && options.length === 0) return html``;
  const row = (k: BuildingKind) => {
    const lvl = pr.b[k] ?? 0;
    const max = BUILDINGS[k].max;
    const cost = buildCost(k, lvl);
    const check = buildCheck(s, ui.w, ui.me, p, k);
    const goods = Object.entries(cost.goods)
      .map(([g, v]) => `${v} ${GOOD_NAMES[g as Good].toLowerCase()}`)
      .join(", ");
    const makes = BUILDING_MAKES[k];
    const good = k === "plantation" ? ui.w.raw[p] : makes.good;
    return html`<li>
      <span
        class="cq-bicon-wrap"
        style=${good ? `--g:${GOOD_COLORS[good]}` : ""}
        >${buildingIcon(k)}</span
      >
      <div class="cq-build-text">
        ${num(
          html`${BUILDING_LABELS[k]}`,
          () => ({
            title: BUILDING_LABELS[k],
            notes: [
              BUILDING_HELP[k],
              `Upkeep ${BUILDINGS[k].upkeep} gold a month per level.`,
            ],
          }),
          "cq-tipped",
        )}
        <span class="cq-muted small"
          >${good ? GOOD_NAMES[good].toLowerCase() : makes.text}${lvl > 0
            ? html`, level ${lvl} of ${max}`
            : nothing}</span
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
  };
  return section(
    "Buildings",
    html`${built.length
      ? html`<ul class="cq-builds">
          ${built.map(row)}
        </ul>`
      : html`<p class="cq-muted">Nothing built yet.</p>`}
    ${options.length
      ? more(
          `Build something new (${options.length})`,
          html`<ul class="cq-builds">
            ${options.map(row)}
          </ul>`,
          built.length === 0,
        )
      : nothing}`,
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
  return more(
    pr.recruits.length
      ? `Raise troops (${pr.recruits.length} training)`
      : "Raise troops",
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
    pr.recruits.length > 0,
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
              ${nationName(ui.s.nations[a.owner].name)}:
              ${Math.round(armyMen(a)).toLocaleString("en-US")} men
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
  known: boolean,
): TemplateResult {
  if (!player) return html``;
  const s = ui.s;
  const me = s.nations[ui.me];
  const out: TemplateResult[] = [];
  if (pr.owner === -1 && !pr.colony && me.kind === "power") {
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
              The settlers leave
              ${ui.map.provinces[check.source!].name}.${known
                ? ""
                : " Nobody has surveyed this land yet."}
            </p>`
          : nothing}
      </div>`,
    );
  }
  if (
    pr.owner >= 0 &&
    s.nations[pr.owner].kind === "native" &&
    me.kind === "power"
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
  if (me.kind === "power" && pr.owner !== ui.me) {
    out.push(
      html`<div class="cq-act">
        ${!known
          ? html`<button
              class="cq-btn"
              @click=${() => ui.modal({ k: "mission", p, kind: "explore" })}
            >
              Send an expedition
              <span class="cq-cost">${EXPEDITION.gold}g</span>
            </button>`
          : nothing}
        ${!pr.outpost && (pr.owner < 0 || s.nations[pr.owner].kind === "native")
          ? html`<button
              class="cq-btn"
              @click=${() => ui.modal({ k: "mission", p, kind: "outpost" })}
            >
              Build an outpost
              <span class="cq-cost">${OUTPOST.gold}g, timber, tools</span>
            </button>`
          : nothing}
      </div>`,
    );
  } else if (me.kind === "power" && pr.owner === ui.me && !pr.outpost) {
    out.push(
      html`<div class="cq-act">
        <button
          class="cq-btn"
          @click=${() => ui.modal({ k: "mission", p, kind: "outpost" })}
        >
          Build an outpost here <span class="cq-cost">${OUTPOST.gold}g</span>
        </button>
      </div>`,
    );
  }
  if (me.kind === "power" && pr.owner === ui.me) {
    const check = abandonCheck(s, ui.map, ui.me, p);
    const name = ui.map.provinces[p].name;
    const folk = Math.round(settlers(pr));
    out.push(
      html`<div class="cq-act cq-abandon">
        ${action(
          "Abandon this settlement",
          check,
          () => {
            if (
              confirm(
                `Abandon ${name}? Most of its ${folk} settlers move to your nearest settlement, its buildings are left to rot, and the land goes back to the wild. The crown won't like it; the natives around it will.`,
              )
            )
              void ui.cmd({ k: "abandon", p });
          },
          "quiet danger small",
          "Give it up and bring its people home",
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
  return out.length > 0 ? section("What you can do", html`${out}`) : html``;
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
