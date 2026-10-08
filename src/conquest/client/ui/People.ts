// The colony's people as a whole: who they are, whether their needs are met,
// who keeps arriving, and whether the officials can keep up with the land.

import { html, nothing, TemplateResult } from "lit";
import {
  adminCapacity,
  adminUsed,
  emigration,
  nationSettlers,
  overextension,
  people,
  provinceAdminCost,
  provincesOf,
  unrestOf,
} from "../../engine/Queries";
import { CLASS_NAMES, RELIGION_NAMES } from "../../engine/Rules";
import type { PopClass, Religion } from "../../engine/Types";
import { POP_CLASSES } from "../../engine/Types";
import { nationName, people as peopleText } from "../Text";
import { num, pct, plain } from "../Tip";
import {
  bar,
  breakdownTip,
  GameUi,
  more,
  provLink,
  section,
  stat,
} from "./Context";

interface ClassRow {
  size: number;
  met: [number, number, number];
  wealth: number;
  income: number;
}

export function peopleTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const n = s.nations[ui.me];
  const mineProvs = provincesOf(s, ui.me);
  const classes = new Map<PopClass, ClassRow>();
  const faiths = new Map<Religion, number>();
  const cultures = new Map<string, number>();
  let total = 0;
  for (const p of mineProvs) {
    for (const pop of s.provinces[p].pops) {
      total += pop.size;
      const row = classes.get(pop.cls) ?? {
        size: 0,
        met: [0, 0, 0],
        wealth: 0,
        income: 0,
      };
      row.size += pop.size;
      row.met = row.met.map((m, i) => m + pop.met[i] * pop.size) as [
        number,
        number,
        number,
      ];
      row.wealth += pop.wealth;
      row.income += pop.income;
      classes.set(pop.cls, row);
      faiths.set(pop.religion, (faiths.get(pop.religion) ?? 0) + pop.size);
      const culture = nationName(
        pop.cls === "tribe"
          ? (s.nations.find((x) => x.key === pop.culture)?.name ?? pop.culture)
          : pop.culture,
      );
      cultures.set(culture, (cultures.get(culture) ?? 0) + pop.size);
    }
  }
  const cap = adminCapacity(s, ui.me);
  const used = adminUsed(s, ui.w, ui.me);
  const over = overextension(s, ui.w, ui.me);
  const restless = mineProvs
    .map((p) => ({
      p,
      unrest: s.provinces[p].unrest,
      folk: people(s.provinces[p]),
    }))
    .sort((a, b) => b.unrest - a.unrest);
  const isPower = n.kind === "power";
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">${isPower ? "The colony's people" : "The people"}</h2>
    </header>
    <div class="cq-stats">
      ${stat("Everyone", peopleText(total), () => ({
        title: "Everyone in your provinces",
        notes: [
          `${Math.round(total).toLocaleString("en-US")} people in ${mineProvs.length} provinces.`,
        ],
      }))}
      ${isPower
        ? html`${stat(
            "Arriving a month",
            emigration(s, ui.me).total,
            () =>
              breakdownTip(
                "Settlers sailing from home each month",
                emigration(s, ui.me),
              ),
            `${peopleText(nationSettlers(s, ui.me))} settlers in all`,
          )}`
        : nothing}
      <div class="cq-stat">
        <span class="cq-stat-label">Administration</span>
        ${num(
          `${plain(used.total)} / ${plain(cap.total)}`,
          () =>
            breakdownTip("Administration your land takes", used, undefined, [
              `Your officials can handle ${plain(cap.total)}. Past that, unrest and corruption grow.`,
            ]),
          `cq-stat-value ${over > 0 ? "bad" : ""}`,
        )}
        <span class="cq-stat-note"
          >${num("capacity", () =>
            breakdownTip("What your officials can govern", cap),
          )}</span
        >
      </div>
    </div>
    ${over > 0
      ? html`<div class="cq-callout bad">
          You hold ${pct(over)} more land than your officials can govern. Every
          province gets restless, taxes go astray, and far-off ones may break
          away. Build courthouses, appoint a better treasurer, or let some land
          go.
        </div>`
      : nothing}
    ${section(
      "Classes",
      html`<table class="cq-table compact">
          <thead>
            <tr>
              <th>Class</th>
              <th class="r">People</th>
              <th>Food</th>
              <th>Goods</th>
              <th>Luxury</th>
              <th class="r">Earns</th>
            </tr>
          </thead>
          <tbody>
            ${POP_CLASSES.filter((c) => classes.has(c)).map((c) => {
              const row = classes.get(c)!;
              const m = row.met.map((v) => v / Math.max(1, row.size));
              return html`<tr>
                <td>${c === "tribe" ? "Tribes" : CLASS_NAMES[c]}</td>
                <td class="r">${peopleText(row.size)}</td>
                <td>
                  ${num(bar(m[0]), () => ({
                    title: `${CLASS_NAMES[c]}: food`,
                    notes: [
                      `${pct(m[0])} of what they need to eat. Hunger is the strongest cause of unrest, and people starve below half.`,
                    ],
                  }))}
                </td>
                <td>
                  ${num(bar(m[1]), () => ({
                    title: `${CLASS_NAMES[c]}: everyday goods`,
                    notes: [`${pct(m[1])} of the cloth and tools they need.`],
                  }))}
                </td>
                <td>
                  ${num(bar(m[2]), () => ({
                    title: `${CLASS_NAMES[c]}: luxuries`,
                    notes: [
                      `${pct(m[2])} of the sugar, tobacco and finery they'd like. Matters most to gentry and merchants.`,
                    ],
                  }))}
                </td>
                <td class="r">
                  ${num(plain(row.income), () => ({
                    title: `${CLASS_NAMES[c]}: last month`,
                    notes: [
                      `Earned ${plain(row.income)} gold between them, ${plain((row.income / Math.max(1, row.size)) * 1000)} per thousand people.`,
                      `Savings: ${plain(row.wealth)} gold.`,
                    ],
                  }))}
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
        <p class="cq-muted small">
          What people can afford decides what they get: when goods are dear, the
          poor go without first.
        </p>`,
    )}
    ${more(
      html`Faith and tongue
        <span class="cq-more-hint"
          >${faiths.size} faith${faiths.size === 1 ? "" : "s"}, ${cultures.size}
          people${cultures.size === 1 ? "" : "s"}</span
        >`,
      html`<div class="cq-split">
        <ul class="cq-list tight">
          ${[...faiths.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(
              ([r, size]) =>
                html`<li>
                  ${RELIGION_NAMES[r]}${r === n.religion
                    ? html` <span class="cq-chip">yours</span>`
                    : nothing}<span class="cq-muted">
                    ${pct(size / Math.max(1, total))}</span
                  >
                </li>`,
            )}
        </ul>
        <ul class="cq-list tight">
          ${[...cultures.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(
              ([c, size]) =>
                html`<li>
                  ${c}<span class="cq-muted">
                    ${pct(size / Math.max(1, total))}</span
                  >
                </li>`,
            )}
        </ul>
      </div>`,
    )}
    ${section("Most restless", provinceTable(ui, restless.slice(0, 5)))}
    ${restless.length > 5
      ? more(
          `All ${restless.length} provinces`,
          provinceTable(ui, restless.slice(5)),
        )
      : nothing}
  `;
}

function provinceTable(
  ui: GameUi,
  list: { p: number; unrest: number; folk: number }[],
): TemplateResult {
  const s = ui.s;
  const restless = list;
  return html`<table class="cq-table compact">
    <thead>
      <tr>
        <th>Province</th>
        <th class="r">People</th>
        <th class="r">Unrest</th>
        <th class="r">Admin</th>
      </tr>
    </thead>
    <tbody>
      ${restless.map(
        ({ p, unrest, folk }) =>
          html`<tr>
            <td>
              ${provLink(ui, p)}${s.provinces[p].occupier >= 0
                ? html` <span class="cq-chip bad">Occupied</span>`
                : nothing}
            </td>
            <td class="r">${peopleText(folk)}</td>
            <td class="r">
              ${num(
                String(Math.round(unrest)),
                () =>
                  breakdownTip(
                    "Unrest (revolt at 100)",
                    unrestOf(s, ui.w, p),
                    (v) => String(Math.round(v)),
                  ),
                unrest >= 60 ? "bad" : "",
              )}
            </td>
            <td class="r">
              ${num(plain(provinceAdminCost(s, ui.w, ui.me, p).total), () =>
                breakdownTip(
                  "Administration it takes",
                  provinceAdminCost(s, ui.w, ui.me, p),
                ),
              )}
            </td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}
