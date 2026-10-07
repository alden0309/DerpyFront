// The colony's money and markets: the treasury's last month, taxes, what
// everything costs here and in Europe, and the convoys at sea.

import { html, nothing, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import {
  corruption,
  europePrice,
  priceWhy,
  taxShare,
} from "../../engine/Queries";
import {
  POWER_RULES,
  SHIPPING_PER_UNIT,
  SPOILAGE,
  TAX_NAMES,
  TAX_RATE,
  TAX_UNREST,
} from "../../engine/Rules";
import type { Good, TaxLevel } from "../../engine/Types";
import { GOODS } from "../../engine/Types";
import { GOOD_COLORS, GOOD_NAMES, money } from "../Text";
import { num, pct, plain } from "../Tip";
import { breakdownTip, GameUi, section } from "./Context";

export function economyTab(ui: GameUi): TemplateResult {
  const s = ui.s;
  const n = s.nations[ui.me];
  if (n.kind !== "power") return nativeEconomy(ui);
  const L = n.ledger;
  const m = n.market;
  const tax = taxShare(s, ui.w, ui.me);
  const corr = corruption(s, ui.w, ui.me);
  const freight = SHIPPING_PER_UNIT * (1 - (POWER_RULES[n.key]?.shipping ?? 0));
  return html`
    <header class="cq-panel-head">
      <h2 class="cq-h2">Treasury and trade</h2>
    </header>
    <div class="cq-stats">
      <div class="cq-stat">
        <span class="cq-stat-label">Treasury</span
        ><span class="cq-stat-value ${n.gold < 0 ? "bad" : ""}"
          >${money(n.gold)} gold</span
        >
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Last month</span>
        ${num(
          `${L.net >= 0 ? "+" : ""}${plain(L.net)}`,
          () => ledgerTip(ui),
          `cq-stat-value ${L.net < 0 ? "bad" : "good"}`,
        )}
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Taxes take</span>
        ${num(
          pct(tax.total),
          () =>
            breakdownTip("Share of incomes the treasury collects", tax, pct),
          "cq-stat-value",
        )}
      </div>
      <div class="cq-stat">
        <span class="cq-stat-label">Lost to corruption</span>
        ${num(
          pct(corr.total),
          () => breakdownTip("Taxes that go astray", corr, pct),
          `cq-stat-value ${corr.total > 0.15 ? "bad" : ""}`,
        )}
      </div>
    </div>
    ${section(
      "Taxes",
      html`<div class="cq-seg">
        ${([0, 1, 2] as TaxLevel[]).map(
          (lvl) =>
            html`<button
              aria-pressed=${n.tax === lvl}
              @click=${() => void ui.cmd({ k: "tax", level: lvl })}
            >
              ${TAX_NAMES[lvl]}
              <span class="cq-muted small"
                >${Math.round(TAX_RATE[lvl] * 100)}%, +${TAX_UNREST[lvl]}
                unrest</span
              >
            </button>`,
        )}
      </div>`,
    )}
    ${section("The ledger", ledger(ui))}
    ${section(
      "Market",
      html`<table class="cq-table compact market">
          <thead>
            <tr>
              <th>Good</th>
              <th class="r">Here</th>
              <th class="r">Europe</th>
              <th class="r">Stock</th>
              <th class="r">Need</th>
              <th>Trade</th>
            </tr>
          </thead>
          <tbody>
            ${GOODS.map((g) => {
              const eu = europePrice(s, g);
              const out = n.noExport.includes(g);
              const inn = n.noImport.includes(g);
              return html`<tr>
                <td>
                  <i class="cq-good" style="--g:${GOOD_COLORS[g]}"></i
                  >${GOOD_NAMES[g]}
                </td>
                <td class="r">
                  ${num(plain(m.price[g]), () =>
                    breakdownTip(
                      `${GOOD_NAMES[g]} here`,
                      priceWhy(s, ui.me, g),
                    ),
                  )}
                </td>
                <td class="r">
                  ${num(plain(eu.total), () =>
                    breakdownTip(`${GOOD_NAMES[g]} in Europe`, eu, undefined, [
                      `Freight across costs ${plain(freight)} a unit each way.`,
                    ]),
                  )}
                </td>
                <td class="r">
                  ${num(String(Math.round(m.stock[g])), () => ({
                    title: `${GOOD_NAMES[g]} in the warehouses`,
                    notes: [
                      `Last month ${Math.round(m.supply[g])} came to market (made here, shipped in or traded from natives) and ${Math.round(m.demand[g])} was wanted.`,
                      `${Math.round(SPOILAGE * 100)}% of what's stored spoils or goes missing each month.`,
                    ],
                  }))}
                </td>
                <td class="r">${Math.round(m.demand[g])}</td>
                <td class="cq-bans">
                  <button
                    class="cq-ban ${out ? "on" : ""}"
                    aria-pressed=${out}
                    title=${out
                      ? `Exports of ${GOOD_NAMES[g].toLowerCase()} are banned. Click to allow them.`
                      : `Merchants may ship ${GOOD_NAMES[g].toLowerCase()} to Europe. Click to ban it.`}
                    @click=${() =>
                      void ui.cmd({
                        k: "ban",
                        good: g,
                        export: true,
                        on: !out,
                      })}
                  >
                    Sell
                  </button>
                  <button
                    class="cq-ban ${inn ? "on" : ""}"
                    aria-pressed=${inn}
                    title=${inn
                      ? `Imports of ${GOOD_NAMES[g].toLowerCase()} are banned. Click to allow them.`
                      : `Merchants may bring ${GOOD_NAMES[g].toLowerCase()} from Europe. Click to ban it.`}
                    @click=${() =>
                      void ui.cmd({
                        k: "ban",
                        good: g,
                        export: false,
                        on: !inn,
                      })}
                  >
                    Buy
                  </button>
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
        <p class="cq-muted small">
          Prices follow supply and demand. Merchants ship to Europe whatever
          sells for more there after freight, and bring back what's dearer here.
          Strike out Sell or Buy to keep a good at home, or keep it out.
        </p>`,
    )}
    ${section(
      "Convoys at sea",
      n.convoys.length === 0
        ? html`<p class="cq-muted">
            ${n.rebelling
              ? "The crown's navy blockades your ports."
              : "None at sea. A convoy sails every two months from your main port, ice permitting."}
          </p>`
        : html`<ul class="cq-list">
            ${n.convoys.map(
              (c) =>
                html`<li>
                  ${c.out ? "To Europe" : "Home"} from
                  ${ui.map.provinces[c.port].name}, arriving
                  ${formatDate(c.arrive)}:
                  <span class="cq-muted small"
                    >${cargo(c.cargo) || "empty"}${c.out &&
                    Object.keys(c.orders).length
                      ? `; to buy ${cargo(c.orders)}`
                      : ""}</span
                  >
                </li>`,
            )}
          </ul>`,
    )}
  `;
}

function cargo(c: Partial<Record<Good, number>>): string {
  return Object.entries(c)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([g, v]) => `${v} ${GOOD_NAMES[g as Good].toLowerCase()}`)
    .join(", ");
}

function ledger(ui: GameUi): TemplateResult {
  const L = ui.s.nations[ui.me].ledger;
  if (L.income.length === 0 && L.spending.length === 0)
    return html`<p class="cq-empty">
      The first month's accounts come in on the 1st of next month.
    </p>`;
  return html`<table class="cq-table compact">
    <tbody>
      ${L.income.map(
        (l) =>
          html`<tr>
            <td>${l.label}</td>
            <td class="r good">+${plain(l.value)}</td>
          </tr>`,
      )}
      ${L.spending.map(
        (l) =>
          html`<tr>
            <td>${l.label}</td>
            <td class="r bad">−${plain(l.value)}</td>
          </tr>`,
      )}
      <tr class="total">
        <td>Net</td>
        <td class="r">${L.net >= 0 ? "+" : "−"}${plain(Math.abs(L.net))}</td>
      </tr>
    </tbody>
  </table>`;
}

function ledgerTip(ui: GameUi) {
  const L = ui.s.nations[ui.me].ledger;
  return {
    title: "Last month's treasury",
    b: {
      total: L.net,
      parts: [
        ...L.income.map((l) => ({ label: l.label, value: l.value })),
        ...L.spending.map((l) => ({ label: l.label, value: -l.value })),
      ],
    },
  };
}

function nativeEconomy(ui: GameUi): TemplateResult {
  const n = ui.s.nations[ui.me];
  return html`<header class="cq-panel-head">
      <h2 class="cq-h2">Stores</h2>
    </header>
    <p>${money(n.gold)} gold from trade.</p>
    <ul class="cq-list">
      ${GOODS.filter((g) => n.market.stock[g] > 0).map(
        (g) =>
          html`<li>${GOOD_NAMES[g]}: ${Math.round(n.market.stock[g])}</li>`,
      )}
    </ul>
    ${nothing}`;
}
