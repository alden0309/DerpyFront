// Money and goods at a glance: what came in and went out of the treasury
// last month, what the colony made and used of every good, where to get
// more of something you're short of, goods bought outright in Europe, and
// trading goods with another nation.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { formatDate } from "../../engine/Calendar";
import {
  atWar,
  buildCheck,
  convoyRoom,
  europePrice,
  mainPortOf,
  nationsBorder,
  provincesOf,
  regimentTypes,
  treatyBetween,
} from "../../engine/Queries";
import { BUILDINGS, REGIMENTS, WORKSHOPS } from "../../engine/Rules";
import {
  dealCheck,
  dealWillingness,
  orderCheck,
  orderQuote,
} from "../../engine/Trade";
import type { BuildingKind, Good, TradeTerms } from "../../engine/Types";
import { GOODS } from "../../engine/Types";
import "../Range";
import { GOOD_COLORS, GOOD_NAMES, goodsText, money, nationName } from "../Text";
import { num, plain } from "../Tip";
import { breakdownTip, GameUi, nationLink } from "./Context";

// ---------------------------------------------------------------- money

/** In against out, last month, as two bars and three numbers. */
export function moneyBalance(ui: GameUi): TemplateResult {
  const L = ui.s.nations[ui.me].ledger;
  const totalIn = L.income.reduce((a, l) => a + l.value, 0);
  const totalOut = L.spending.reduce((a, l) => a + l.value, 0);
  const top = Math.max(1, totalIn, totalOut);
  const line = (
    label: string,
    v: number,
    cls: string,
    parts: { label: string; value: number }[],
  ) =>
    html`<div class="cq-balance-row ${cls}">
      <span class="cq-balance-label">${label}</span>
      <span class="cq-balance-bar"
        ><i style="width:${(v / top) * 100}%"></i
      ></span>
      ${num(
        `${plain(v)}`,
        () => ({
          title: `${label} last month`,
          b: { total: v, parts },
        }),
        "cq-balance-n",
      )}
    </div>`;
  if (L.income.length === 0 && L.spending.length === 0)
    return html`<div class="cq-balance">
      <p class="cq-muted">
        The first month's accounts come in on the 1st of next month: what came
        in, what went out, and what the colony made and used of every good.
      </p>
    </div>`;
  return html`<div class="cq-balance" aria-label="Last month's money">
    ${line("Coming in", totalIn, "in", L.income)}
    ${line("Going out", totalOut, "out", L.spending)}
    <p class="cq-balance-net ${L.net >= 0 ? "good" : "bad"}">
      ${L.net >= 0 ? "Saving" : "Losing"}
      <b>${plain(Math.abs(L.net))} gold</b> a month
    </p>
  </div>`;
}

// ---------------------------------------------------------------- goods

/** Last month, good by good: made, used, came, went, and what's in store. */
export function goodsBalance(
  ui: GameUi,
  open: Good | null,
  toggle: (g: Good) => void,
): TemplateResult {
  const n = ui.s.nations[ui.me];
  const m = n.market;
  const f = m.flow;
  const rows = GOODS.filter(
    (g) =>
      m.stock[g] >= 1 ||
      f.made[g] > 0.05 ||
      f.used[g] > 0.05 ||
      f.came[g] > 0.05 ||
      f.went[g] > 0.05 ||
      ["timber", "tools", "guns", "cloth", "grain"].includes(g),
  );
  const cell = (v: number) =>
    v > 0.05 ? plain(v) : html`<span class="cq-muted">·</span>`;
  return html`<table class="cq-table compact cq-goods">
      <thead>
        <tr>
          <th>Good</th>
          <th class="r" title="Made in your provinces">Made</th>
          <th class="r" title="Eaten, worn out, spoiled, or built with">
            Used
          </th>
          <th class="r" title="Shipped in or traded in">In</th>
          <th class="r" title="Shipped to Europe or traded away">Out</th>
          <th class="r" title="Change in the warehouses">Net</th>
          <th class="r">Stock</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((g) => {
          const net = f.made[g] - f.used[g] + f.came[g] - f.went[g];
          // Running out within three months at last month's rate.
          const short = m.stock[g] < 5 || (net < 0 && m.stock[g] < -net * 3);
          return html`<tr
              class="cq-goods-row ${open === g ? "open" : ""}"
              @click=${() => toggle(g)}
            >
              <td>
                <i class="cq-good" style="--g:${GOOD_COLORS[g]}"></i
                >${GOOD_NAMES[g]}
                ${short
                  ? html`<span class="cq-chip bad small">short</span>`
                  : nothing}
              </td>
              <td class="r">${cell(f.made[g])}</td>
              <td class="r">${cell(f.used[g])}</td>
              <td class="r">${cell(f.came[g])}</td>
              <td class="r">${cell(f.went[g])}</td>
              <td class="r ${net > 0.05 ? "good" : net < -0.05 ? "bad" : ""}">
                ${Math.abs(net) < 0.05
                  ? "0"
                  : `${net > 0 ? "+" : "−"}${plain(Math.abs(net))}`}
              </td>
              <td class="r"><b>${Math.floor(m.stock[g])}</b></td>
            </tr>
            ${open === g
              ? html`<tr class="cq-goods-help">
                  <td colspan="7">${howToGet(ui, g)}</td>
                </tr>`
              : nothing}`;
        })}
      </tbody>
    </table>
    <p class="cq-muted small">
      Click a good to see where more of it can come from.
    </p>`;
}

/** Where more of a good can come from, for this colony as it is now. */
export function howToGet(ui: GameUi, g: Good): TemplateResult {
  const s = ui.s;
  const me = ui.me;
  const n = s.nations[me];
  const mine = provincesOf(s, me);
  const tips: TemplateResult[] = [];
  const raw = (good: Good) => mine.filter((p) => ui.w.raw[p] === good);
  const canBuild = (b: BuildingKind) =>
    mine.filter((p) => buildCheck(s, ui.w, me, p, b).ok);
  const placeNames = (ps: number[]) =>
    ps
      .slice(0, 3)
      .map((p) => ui.map.provinces[p].name)
      .join(", ") + (ps.length > 3 ? ` and ${ps.length - 3} more` : "");
  const shop = (
    Object.entries(WORKSHOPS) as [
      BuildingKind,
      NonNullable<(typeof WORKSHOPS)[BuildingKind]>,
    ][]
  ).find(([, w]) => w.out === g);
  if (g === "timber") {
    tips.push(
      html`<li>
        Every settlement cuts some timber clearing land, most in forest. More
        laborers, more timber.
      </li>`,
    );
    const land = raw("timber");
    tips.push(
      land.length
        ? html`<li>
            A <b>lumber camp</b> in your timber country (${placeNames(land)})
            adds a third more for each level.
          </li>`
        : html`<li>
            None of your land is timber country; a colony on forest land with
            timber would let you build a lumber camp.
          </li>`,
    );
  } else if (shop) {
    const [kind, w] = shop;
    const inputs = goodsText(w.inputs);
    const where = canBuild(kind);
    tips.push(
      html`<li>
        Artisans make it in a <b>${BUILDINGS[kind] ? kindName(kind) : kind}</b>
        from ${inputs}.
        ${where.length
          ? html`You could build one at ${placeNames(where)}.`
          : html`You can't build one right now (it needs gold and building
            goods, and artisans to staff it).`}
      </li>`,
    );
  } else if (g === "grain") {
    tips.push(
      html`<li>
        Laborers grow it; <b>farms</b> add a fifth more each level. Coastal
        provinces fish as well.
      </li>`,
    );
  } else {
    const land = raw(g);
    tips.push(
      land.length
        ? html`<li>Your laborers in ${placeNames(land)} bring it in.</li>`
        : html`<li>
            None of your land yields it. Settle land that does (the Economy map
            shows what each province yields).
          </li>`,
    );
  }
  // Europe.
  const eu = europePrice(s, g).total;
  tips.push(
    html`<li>
      <b>Buy it in Europe</b> (below): about ${plain(eu * 1.2)} gold a unit
      landed, arriving a few months later.
    </li>`,
  );
  // Neighbours who have it.
  const sellers = s.nations
    .filter(
      (x) =>
        x.alive &&
        x.id !== me &&
        x.kind !== "crown" &&
        x.market.stock[g] >= 5 &&
        !atWar(s, me, x.id) &&
        (x.kind === "power" ||
          nationsBorder(s, ui.w.map, me, x.id) ||
          nationsBorder(s, ui.w.map, x.id, me)),
    )
    .sort((a, b) => b.market.stock[g] - a.market.stock[g])
    .slice(0, 4);
  if (sellers.length)
    tips.push(
      html`<li>
        <b>Trade for it</b> with
        ${sellers.map(
          (x, i) =>
            html`${i ? ", " : ""}${nationLink(ui, x.id)}
              <span class="cq-muted">(${Math.floor(x.market.stock[g])})</span>`,
        )}:
        open their page and choose Trade goods.
      </li>`,
    );
  const natives = s.nations.filter(
    (x) =>
      x.kind === "native" &&
      x.alive &&
      treatyBetween(s, me, x.id, "trade") !== undefined,
  );
  if (["tools", "guns", "cloth"].includes(g) === false && natives.length)
    tips.push(
      html`<li>
        Native nations you have a trade treaty with sell you their furs and
        crops every month.
      </li>`,
    );
  // What it's needed for.
  const uses: string[] = [];
  for (const [k, b] of Object.entries(BUILDINGS) as [
    BuildingKind,
    (typeof BUILDINGS)[BuildingKind],
  ][])
    if (b.goods[g]) uses.push(`${kindName(k).toLowerCase()} (${b.goods[g]})`);
  for (const t of regimentTypes(n))
    if (REGIMENTS[t].goods[g]) uses.push(`${t} (${REGIMENTS[t].goods[g]})`);
  return html`<div class="cq-howto">
    <p class="cq-howto-title">Getting more ${GOOD_NAMES[g].toLowerCase()}</p>
    <ul>
      ${tips}
    </ul>
    ${uses.length
      ? html`<p class="cq-muted small">Needed to build: ${uses.join(", ")}.</p>`
      : nothing}
    ${g === "timber" || g === "tools"
      ? html`<p class="cq-muted small">
          Laborers come with settlers from home every month and grow with food;
          raising soldiers takes them from the fields.
        </p>`
      : nothing}
  </div>`;
}

function kindName(k: BuildingKind): string {
  const names: Record<BuildingKind, string> = {
    farm: "Farm",
    plantation: "Plantation",
    tradingpost: "Trading post",
    mine: "Mine",
    lumbercamp: "Lumber camp",
    port: "Port",
    fort: "Fort",
    smithy: "Smithy",
    gunsmith: "Gunsmith",
    weaver: "Weavers",
    church: "Church",
    courthouse: "Courthouse",
  };
  return names[k];
}

// ---------------------------------------------------------------- Europe

@customElement("cq-europe-order")
export class EuropeOrder extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @state() private good: Good = "timber";
  @state() private qty = 20;

  createRenderRoot() {
    return this;
  }

  render(): TemplateResult {
    const ui = this.ui;
    if (!ui) return html``;
    const s = ui.s;
    const port = mainPortOf(s, ui.map, ui.me);
    const room = convoyRoom(s, ui.me);
    const goods = { [this.good]: this.qty } as Partial<Record<Good, number>>;
    const quote = orderQuote({ s, w: ui.w }, ui.me, goods, port);
    const check = orderCheck({ s, w: ui.w }, ui.me, goods, port);
    const waiting = s.nations[ui.me].convoys.filter((c) => c.ordered);
    return html`<div class="cq-order">
      <div class="cq-order-goods" role="radiogroup" aria-label="What to buy">
        ${GOODS.map(
          (g) =>
            html`<button
              role="radio"
              aria-checked=${this.good === g}
              class=${this.good === g ? "on" : ""}
              @click=${() => (this.good = g)}
            >
              <i class="cq-good" style="--g:${GOOD_COLORS[g]}"></i>${GOOD_NAMES[
                g
              ]}
            </button>`,
        )}
      </div>
      <cq-range
        label="How much"
        .min=${5}
        .max=${Math.max(5, Math.min(room, 300))}
        .step=${5}
        .value=${this.qty}
        .format=${(v: number) => `${v} ${GOOD_NAMES[this.good].toLowerCase()}`}
        .note=${(v: number) => {
          const q = orderQuote(
            { s, w: ui.w },
            ui.me,
            { [this.good]: v } as Partial<Record<Good, number>>,
            port,
          );
          return `${q.gold} gold, landing about ${formatDate(s.day + q.days)}`;
        }}
        @cq-input=${(e: CustomEvent<number>) => (this.qty = e.detail)}
      ></cq-range>
      <div class="cq-btnrow">
        <button
          class="cq-btn primary"
          ?disabled=${!check.ok}
          title=${check.ok ? "" : check.why}
          @click=${async () => {
            if (await ui.cmd({ k: "order", goods }))
              ui.toast(
                `Ordered ${goodsText(goods)} from Europe for ${quote.gold} gold.`,
                "good",
              );
          }}
        >
          Buy for ${quote.gold} gold
        </button>
        ${!check.ok ? html`<span class="cq-why">${check.why}</span>` : nothing}
      </div>
      <p class="cq-muted small">
        Bought at Europe's price plus freight and a tenth for the agent. The
        order crosses the ocean and the goods sail back, so it takes two
        crossings (longer in winter).
      </p>
      ${waiting.length
        ? html`<ul class="cq-list tight">
            ${waiting.map(
              (c) =>
                html`<li>
                  On its way: ${goodsText(c.cargo)}, landing
                  ${formatDate(c.arrive)}
                </li>`,
            )}
          </ul>`
        : nothing}
    </div>`;
  }
}

// ---------------------------------------------------------------- trade

@customElement("cq-deal")
export class DealTable extends LitElement {
  @property({ attribute: false }) ui!: GameUi;
  @property({ type: Number }) other = -1;
  @state() private give: Partial<Record<Good, number>> = {};
  @state() private get: Partial<Record<Good, number>> = {};
  @state() private gold = 0;

  createRenderRoot() {
    return this;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("other")) {
      this.give = {};
      this.get = {};
      this.gold = 0;
    }
  }

  private terms(): TradeTerms {
    const clean = (x: Partial<Record<Good, number>>) =>
      Object.fromEntries(Object.entries(x).filter(([, v]) => (v ?? 0) > 0));
    return { give: clean(this.give), get: clean(this.get), gold: this.gold };
  }

  private side(
    title: string,
    nation: number,
    picked: Partial<Record<Good, number>>,
    set: (next: Partial<Record<Good, number>>) => void,
  ): TemplateResult {
    const m = this.ui.s.nations[nation].market;
    const stocked = GOODS.filter((g) => m.stock[g] >= 1);
    const chosen = (Object.keys(picked) as Good[]).filter((g) =>
      stocked.includes(g),
    );
    const left = stocked.filter((g) => !chosen.includes(g));
    return html`<fieldset class="cq-deal-side">
      <legend>${title}</legend>
      ${stocked.length === 0
        ? html`<p class="cq-empty">Nothing in store.</p>`
        : nothing}
      ${chosen.map(
        (g) =>
          html`<div class="cq-deal-good">
            <cq-range
              .label=${`${GOOD_NAMES[g]} (${Math.floor(m.stock[g])} in store)`}
              .min=${1}
              .max=${Math.max(1, Math.min(Math.floor(m.stock[g]), 400))}
              .step=${1}
              .value=${picked[g] ?? 1}
              .format=${(v: number) => String(v)}
              @cq-input=${(e: CustomEvent<number>) =>
                set({ ...picked, [g]: e.detail })}
            ></cq-range>
            <button
              class="cq-deal-drop"
              aria-label=${`Leave out ${GOOD_NAMES[g].toLowerCase()}`}
              title="Leave it out"
              @click=${() => {
                const next = { ...picked };
                delete next[g];
                set(next);
              }}
            >
              ×
            </button>
          </div>`,
      )}
      ${left.length
        ? html`<div class="cq-order-goods small" aria-label="Add a good">
            ${left.map(
              (g) =>
                html`<button
                  @click=${() =>
                    set({
                      ...picked,
                      [g]: Math.min(10, Math.floor(m.stock[g])),
                    })}
                >
                  <i class="cq-good" style="--g:${GOOD_COLORS[g]}"></i
                  >${GOOD_NAMES[g]}
                  <span class="cq-muted">${Math.floor(m.stock[g])}</span>
                </button>`,
            )}
          </div>`
        : nothing}
    </fieldset>`;
  }

  render(): TemplateResult {
    const ui = this.ui;
    if (!ui || this.other < 0) return html``;
    const s = ui.s;
    const them = s.nations[this.other];
    const me = s.nations[ui.me];
    const terms = this.terms();
    const empty =
      Object.keys(terms.give).length + Object.keys(terms.get).length === 0 &&
      terms.gold === 0;
    const check = dealCheck(s, ui.w, ui.me, this.other, terms);
    const human = them.player !== null;
    const willing = human
      ? null
      : dealWillingness(s, ui.w, ui.me, this.other, terms);
    return html`
      <h2 class="cq-h1">Trade with ${nationName(them.name)}</h2>
      <p class="cq-lede small">
        Choose what you'd hand over and what you want for it. Gold can go either
        way.
      </p>
      <div class="cq-deal-cols">
        ${this.side("You give", ui.me, this.give, (next) => {
          this.give = next;
        })}
        ${this.side("You get", this.other, this.get, (next) => {
          this.get = next;
        })}
      </div>
      <cq-range
        label="Gold"
        .min=${-Math.max(0, Math.floor(them.gold))}
        .max=${Math.max(0, Math.floor(me.gold))}
        .step=${1}
        .value=${this.gold}
        .format=${(g: number) =>
          g > 0
            ? `You pay ${money(g)}`
            : g < 0
              ? `They pay ${money(-g)}`
              : "No gold"}
        @cq-input=${(e: CustomEvent<number>) => (this.gold = e.detail)}
      ></cq-range>
      <div
        class="cq-verdict ${empty
          ? ""
          : willing && willing.total < 0
            ? "bad"
            : "good"}"
      >
        ${empty
          ? html`<span class="cq-muted"
              >Add goods to either side, or gold, to see what they'd say.</span
            >`
          : human
            ? html`${nationName(them.name)} is played by ${them.playerName};
              they'll decide.`
            : willing
              ? html`${num(
                  willing.total >= 0 ? "They'd accept" : "They'd refuse",
                  () =>
                    breakdownTip(
                      "Would they take it? (yes at 0 or more)",
                      willing,
                    ),
                )}`
              : nothing}
      </div>
      <div class="cq-btnrow end">
        <button class="cq-btn quiet" @click=${() => ui.modal(null)}>
          Not now
        </button>
        <button
          class="cq-btn primary"
          ?disabled=${!check.ok}
          title=${check.ok ? "" : check.why}
          @click=${async () => {
            if (await ui.cmd({ k: "deal", n: this.other, terms })) {
              ui.modal(null);
              if (human) ui.toast("Offer sent.", "good");
            }
          }}
        >
          ${human ? "Send the offer" : "Make the trade"}
        </button>
      </div>
      ${!check.ok && !empty
        ? html`<p class="cq-why">${check.why}</p>`
        : nothing}
    `;
  }
}

/** Trades other players have offered you, to take or turn down. */
export function dealOffers(ui: GameUi): TemplateResult | typeof nothing {
  const offers = ui.s.deals.filter((d) => d.to === ui.me);
  if (offers.length === 0) return nothing;
  return html`<ul class="cq-deal-offers">
    ${offers.map((d) => {
      const them = nationName(ui.s.nations[d.from].name);
      const t = d.terms;
      const theyGive = [goodsText(t.give), t.gold > 0 ? `${t.gold} gold` : ""]
        .filter(Boolean)
        .join(" and ");
      const youGive = [goodsText(t.get), t.gold < 0 ? `${-t.gold} gold` : ""]
        .filter(Boolean)
        .join(" and ");
      const check = dealCheck(ui.s, ui.w, d.from, ui.me, t);
      return html`<li class="cq-offer">
        <p>
          ${nationLink(ui, d.from)} offers <b>${theyGive || "nothing"}</b> for
          your <b>${youGive || "nothing"}</b>.
        </p>
        <div class="cq-btnrow">
          <button
            class="cq-btn primary small"
            ?disabled=${!check.ok}
            title=${check.ok ? "" : check.why}
            @click=${() =>
              void ui.cmd({ k: "dealAnswer", deal: d.id, yes: true })}
          >
            Accept
          </button>
          <button
            class="cq-btn small"
            @click=${() =>
              void ui.cmd({ k: "dealAnswer", deal: d.id, yes: false })}
          >
            Turn down
          </button>
        </div>
        <span class="cq-muted small">from ${them}, ${formatDate(d.day)}</span>
      </li>`;
    })}
  </ul>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-europe-order": EuropeOrder;
    "cq-deal": DealTable;
  }
}
