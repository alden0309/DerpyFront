// WORLD r11 panels: the province's market (with each deal's effect on the
// price shown before you make it), gifts at a council fire, your leads, a
// people's own goods, and how much of a place you can see.

import { html, nothing, svg, TemplateResult } from "lit";
import { formatDate } from "../../engine/Calendar";
import { fogged, fogView, type FogView } from "../../engine/Fog";
import { leadsHere, leadViews, type LeadView } from "../../engine/Leads";
import { carried, CARRY } from "../../engine/LifeQueries";
import {
  giftWorth,
  hasMarket,
  holding,
  ITEMS,
  presentCheck,
  priceView,
  quote,
  sideOf,
  soldHere,
  tradeCheck,
  trendOf,
  wanted,
} from "../../engine/Markets";
import type { LeadKind, TradeItem, WareId } from "../../engine/Types";
import { cultureGoods, isWare, WARES } from "../../engine/Wares";
import { itemIcon, itemName } from "../GoodsArt";
import { action, GameUi, odds, section } from "./Context";

// ---------------------------------------------------------------- what you can see

let fogMemo: { key: string; fog: FogView | null } | null = null;

/** What you know and see of the map (null: everything, as when watching). */
export function fogOfUi(ui: GameUi): FogView | null {
  const life = ui.life;
  if (!fogged(life)) return null;
  const key = `${ui.s.day}|${life.seat}|${life.prov}|${life.travel?.arrive ?? -1}|${life.known?.length ?? 0}`;
  if (fogMemo?.key === key) return fogMemo.fog;
  const fog = fogView(ui.s, ui.w, life);
  fogMemo = { key, fog };
  return fog;
}

export type Sight = "all" | "seen" | "known" | "unknown";

/** How much of a province you can make out from here. */
export function sightOf(ui: GameUi, p: number): Sight {
  const fog = fogOfUi(ui);
  if (!fog) return "all";
  if (fog.seen.has(p)) return "seen";
  return fog.known.has(p) ? "known" : "unknown";
}

/** A province you've never seen or heard of: nothing but its name. */
export function unknownPlace(ui: GameUi, p: number): TemplateResult {
  const def = ui.map.provinces[p];
  return html`<header class="cq-panel-head">
      <h2 class="cq-h1">${def.name}</h2>
      <p class="cq-owner cq-fog-note">Terra incognita</p>
    </header>
    <p class="cq-muted cq-pad">
      You know nothing of this country: who lives there, who holds it, what it
      yields. Go and see, or listen for news of it in the taverns and the
      gazette.
    </p>`;
}

/** A note on a known place you can't see from here. */
export function lastSeenNote(ui: GameUi, p: number): TemplateResult {
  const life = ui.life;
  const owner = life?.seenOwner?.[p];
  const name =
    owner === undefined
      ? null
      : owner < 0
        ? "open country"
        : ui.s.nations[owner]?.name.replace(/^the /, "the ");
  return html`<p class="cq-callout cq-fog-note small">
    Out of sight from where you are: you know the land and its
    towns${name ? html` (${name} when you last had word)` : nothing}, but not
    who or what is moving there now.
  </p>`;
}

// ---------------------------------------------------------------- a people's goods

/** "Known for: woollens, tobacco" on a province or a nation. */
export function cultureChips(ui: GameUi, n: number): TemplateResult {
  const { goods, wares } = cultureGoods(ui.s, n);
  const items: TradeItem[] = [...goods, ...wares];
  if (!items.length) return html``;
  return html`<p class="cq-culture-goods">
    <span class="cq-muted small">Known for</span>
    ${items.map(
      (x) =>
        html`<span
          class="cq-chip cq-good-chip"
          title=${isWare(x) ? WARES[x].text : itemName(x)}
          >${itemIcon(x)}${itemName(x)}</span
        >`,
    )}
  </p>`;
}

// ---------------------------------------------------------------- the market

let pick: { item: TradeItem; qty: number; buy: boolean } | null = null;
let pickAt = -1;

function sparkline(points: number[]): TemplateResult {
  if (points.length < 2) return html`<span class="cq-spark empty"></span>`;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = Math.max(0.01, hi - lo);
  const w = 46;
  const h = 14;
  const xy = points.map(
    (v, i) =>
      `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 1 - ((v - lo) / span) * (h - 2)).toFixed(1)}`,
  );
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dir = last > prev * 1.03 ? "up" : last < prev * 0.97 ? "down" : "flat";
  return html`<span class="cq-spark ${dir}" title="The last few months"
    ><svg viewBox="0 0 ${w} ${h}" width=${w} height=${h} aria-hidden="true">
      ${svg`<polyline points=${xy.join(" ")} />`}
    </svg>
    <i>${dir === "up" ? "▲" : dir === "down" ? "▼" : "–"}</i></span
  >`;
}

/** How full the market is of something: plenty, short, glutted. */
function stockWord(net: number, depth: number, sold: boolean): string {
  if (net > depth * 0.6) return "glutted";
  if (net > depth * 0.25) return "plenty";
  if (net < -depth * 0.5) return "bought out";
  if (net < -depth * 0.2) return "short";
  return sold ? "in stock" : "wanted";
}

/** The market where you are: prices, trends, and what a deal would do to them. */
export function marketPage(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life;
  if (!life || !ui.me) return html`<p class="cq-muted">You're watching.</p>`;
  const p = life.prov;
  const place = ui.map.provinces[p].name;
  if (!hasMarket(s, ui.w, p))
    return html`<h2 class="cq-h1">No market at ${place}</h2>
      <p class="cq-lede small">There's nobody here to buy from or sell to.</p>`;
  if (pickAt !== p) {
    pick = null;
    pickAt = p;
  }
  const load = carried(life);
  const side = sideOf(s, p);
  // The ten goods; wares sold here or carried; and the few most wanted here.
  const keen = ITEMS.filter(
    (x) =>
      isWare(x) &&
      !soldHere(s, ui.w, p, x) &&
      holding(life, x) === 0 &&
      wanted(s, ui.w, p, x),
  )
    .sort(
      (a, b) =>
        priceView(s, ui.w, p, b).price / WARES[b as WareId].base -
        priceView(s, ui.w, p, a).price / WARES[a as WareId].base,
    )
    .slice(0, 4);
  const rows = ITEMS.filter(
    (x) => soldHere(s, ui.w, p, x) || holding(life, x) > 0 || keen.includes(x),
  );
  const goods = rows.filter((x) => !isWare(x));
  const wares = rows.filter((x) => isWare(x));
  // What's moving the prices here, good by good.
  const reasons: string[] = [];
  for (const x of rows) {
    const why = priceView(s, ui.w, p, x).why.filter(
      (r) => !r.startsWith("a glut") && !r.startsWith("bought up"),
    );
    if (why.length && (soldHere(s, ui.w, p, x) || holding(life, x) > 0))
      reasons.push(`${itemName(x)} ${why.join(", ")}`);
  }
  const row = (x: TradeItem) => {
    const v = priceView(s, ui.w, p, x);
    const sold = soldHere(s, ui.w, p, x);
    const buy = sold ? quote(s, ui.w, life, p, x, 1).total : null;
    const sell = quote(s, ui.w, life, p, x, -1).total;
    const have = holding(life, x);
    const on = pick?.item === x;
    return html`<tr
      class="cq-market-row ${on ? "on" : ""}"
      @click=${() => {
        pick = { item: x, qty: 1, buy: sold };
        ui.redraw();
      }}
    >
      <td class="cq-market-good">
        ${itemIcon(x)}
        <span
          >${itemName(x)}${isWare(x)
            ? html`<small class="cq-muted">${WARES[x].origin}</small>`
            : nothing}</span
        >
      </td>
      <td class="r">${buy !== null ? buy.toFixed(1) : "—"}</td>
      <td class="r">${sell.toFixed(1)}</td>
      <td class="cq-market-trend">${sparkline(trendOf(s, ui.w, p, x))}</td>
      <td class="cq-market-stock small">${stockWord(v.net, v.depth, sold)}</td>
      <td class="r">${have || ""}</td>
    </tr>`;
  };
  const table = (list: TradeItem[]) =>
    html`<table class="cq-table cq-market">
      <thead>
        <tr>
          <th>Good</th>
          <th class="r" title="What a load costs you here">Buy</th>
          <th class="r" title="What a load fetches here">Sell</th>
          <th>Lately</th>
          <th>Here</th>
          <th class="r">Yours</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(row)}
      </tbody>
    </table>`;
  return html`
    <h2 class="cq-h1">The market at ${place}</h2>
    <p class="cq-market-lede">
      ${side.native
        ? "The village trades what it makes for what it wants."
        : "The merchants here buy and sell by the load."}
      Every load you buy makes the next dearer, and every load you sell makes
      the next cheaper; it takes the town a couple of months to settle again.
      Spread your loads around. You carry <b>${load}</b> of ${CARRY}; purse
      <b>${Math.floor(life.purse)}</b>.
    </p>
    ${reasons.length
      ? html`<p class="cq-market-news small">
          <b>Prices here now:</b> ${reasons.slice(0, 6).join("; ")}.
        </p>`
      : nothing}
    ${dealBox(ui)} ${table(goods)}
    ${wares.length
      ? html`<h3 class="cq-h3">Each people's own goods</h3>
          <p class="cq-muted small">
            Cheap where they're made, dear where they're wanted: woollens and
            iron in the villages, wine and spices in the towns.
          </p>
          ${table(wares)}`
      : nothing}
    ${giftsBlock(ui)}
  `;
}

/** The deal you're weighing: how many, what it costs, and how it moves the price. */
function dealBox(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const p = life.prov;
  if (!pick)
    return html`<p class="cq-deal-hint cq-muted small">
      Choose a good to see what a deal would cost, and how it would move the
      price here.
    </p>`;
  const x = pick.item;
  const sold = soldHere(s, ui.w, p, x);
  const have = holding(life, x);
  const room = CARRY - carried(life);
  const max = pick.buy ? Math.max(1, Math.min(room, 20)) : Math.max(1, have);
  const qty = Math.max(1, Math.min(pick.qty, max));
  const signed = pick.buy ? qty : -qty;
  const q = quote(s, ui.w, life, p, x, signed);
  const check = tradeCheck(s, ui.w, life, x, signed);
  const set = (o: Partial<typeof pick>) => {
    pick = { ...pick!, ...o };
    ui.redraw();
  };
  const name = itemName(x).toLowerCase();
  const move = q.after - q.before;
  return html`<section class="cq-deal">
    <div class="cq-deal-head">
      ${itemIcon(x, "lg")}
      <div>
        <b>${itemName(x)}</b>
        <span class="cq-muted small"
          >${isWare(x)
            ? WARES[x].text
            : `${priceView(s, ui.w, p, x).why.join("; ") || "An ordinary price."}`}</span
        >
      </div>
    </div>
    <div class="cq-deal-controls">
      <div class="cq-seg small" role="radiogroup" aria-label="Buy or sell">
        <button
          role="radio"
          aria-checked=${pick.buy}
          ?disabled=${!sold}
          @click=${() => set({ buy: true, qty: 1 })}
        >
          Buy
        </button>
        <button
          role="radio"
          aria-checked=${!pick.buy}
          ?disabled=${have < 1}
          @click=${() => set({ buy: false, qty: Math.max(1, have) })}
        >
          Sell
        </button>
      </div>
      <div class="cq-stepper" aria-label="How many loads">
        <button
          class="cq-btn small"
          ?disabled=${qty <= 1}
          @click=${() => set({ qty: qty - 1 })}
        >
          −
        </button>
        <b>${qty}</b>
        <button
          class="cq-btn small"
          ?disabled=${qty >= max}
          @click=${() => set({ qty: qty + 1 })}
        >
          +
        </button>
        ${[5, 10]
          .filter((n) => n <= max && n !== qty)
          .map(
            (n) =>
              html`<button
                class="cq-btn small quiet"
                @click=${() => set({ qty: n })}
              >
                ${n}
              </button>`,
          )}
        ${max > 1 && qty !== max
          ? html`<button
              class="cq-btn small quiet"
              @click=${() => set({ qty: max })}
            >
              ${pick.buy ? "all you can carry" : "all"}
            </button>`
          : nothing}
      </div>
    </div>
    <p class="cq-deal-sum">
      ${pick.buy ? "Buying" : "Selling"} ${qty} ${qty === 1 ? "load" : "loads"}
      of ${name}: <b>${q.total.toFixed(1)} coins</b>
      <span class="cq-muted">(${q.each.toFixed(1)} each)</span>.
      <span class="cq-deal-move ${move > 0 ? "up" : "down"}">
        The price here ${move > 0 ? "rises" : "falls"} from
        ${q.before.toFixed(1)} to <b>${q.after.toFixed(1)}</b>.</span
      >
    </p>
    <div class="cq-btnrow">
      ${action(
        pick.buy ? `Buy ${qty}` : `Sell ${qty}`,
        check,
        () =>
          void ui.cmd({ k: "market", item: x, qty: signed }).then((ok) => {
            if (ok && pick && !pick.buy && holding(ui.life!, x) < 1)
              pick = null;
            ui.redraw();
          }),
        "small primary",
      )}
      <button
        class="cq-btn small quiet"
        @click=${() => {
          pick = null;
          ui.redraw();
        }}
      >
        Never mind
      </button>
    </div>
  </section>`;
}

/** At a native council fire: loads you could lay before the elders. */
function giftsBlock(ui: GameUi): TemplateResult {
  const s = ui.s;
  const life = ui.life!;
  const p = life.prov;
  const side = sideOf(s, p);
  if (!side.native || side.nation < 0) return html``;
  const held = ITEMS.filter((x) => holding(life, x) > 0);
  const first = held[0];
  const check = first
    ? presentCheck(s, ui.w, life, first)
    : { ok: false as const, why: "You carry nothing to give." };
  return section(
    "Gifts for the council",
    html`<p class="cq-muted small">
        Among the ${s.nations[side.nation].name}, trade begins with gifts. A
        load laid before the council wins the elders' goodwill and your name;
        woollens, iron kettles, fine cloth, brandy and wampum are prized above
        all.
      </p>
      ${held.length
        ? html`<ul class="cq-gifts">
              ${held.map((x) => {
                const c = presentCheck(s, ui.w, life, x);
                return html`<li>
                  ${itemIcon(x)} <span>${itemName(x)}</span>
                  <span class="cq-muted small"
                    >worth ${giftWorth(s, ui.w, p, x).toFixed(0)} in
                    goodwill</span
                  >
                  ${action(
                    "Give a load",
                    c,
                    () =>
                      void ui
                        .cmd({ k: "present", item: x })
                        .then(() => ui.modal({ k: "outcome" })),
                    "small",
                    undefined,
                    false,
                  )}
                </li>`;
              })}
            </ul>
            ${!check.ok ? html`<p class="cq-why">${check.why}</p>` : nothing}`
        : html`<p class="cq-muted small">You carry nothing to give.</p>`}`,
  );
}

// ---------------------------------------------------------------- leads

const LEAD_ICON: Record<LeadKind, string> = {
  gold: "◆",
  silver: "◇",
  wreck: "⚓",
  mine: "⛏",
  treasure: "✕",
  land: "▦",
  crew: "⛵",
  outlaw: "☠",
  furs: "❦",
  pearls: "◯",
  inheritance: "✉",
  spring: "♨",
};

function statusChip(v: LeadView): TemplateResult {
  const ll = v.ll;
  if (ll.work)
    return html`<span class="cq-chip lead-working"
      >working · ${v.left} day${v.left === 1 ? "" : "s"} left</span
    >`;
  switch (ll.status) {
    case "found":
      return html`<span class="cq-chip good">found!</span>`;
    case "dry":
      return html`<span class="cq-chip bad">a false story</span>`;
    case "done":
      return html`<span class="cq-chip">done</span>`;
    case "faded":
      return html`<span class="cq-chip">gone cold</span>`;
    default:
      return html`<span class="cq-chip">to follow up</span>`;
  }
}

function leadRow(ui: GameUi, v: LeadView, here: boolean): TemplateResult {
  const life = ui.life!;
  const open = v.ll.status === "open" || v.ll.status === "found";
  const atPlace = life.prov === v.lead.p && !life.travel;
  return html`<li class="cq-lead ${v.ll.status} ${v.ll.work ? "working" : ""}">
    <div class="cq-lead-head">
      <span class="cq-lead-mark" aria-hidden="true"
        >${LEAD_ICON[v.lead.kind]}</span
      >
      <div class="cq-lead-text">
        <b>${v.def.title}</b>
        <span class="cq-lead-where"
          >at
          <button class="cq-link" @click=${() => ui.focusProv(v.lead.p)}>
            ${v.place}</button
          >${here ? nothing : html`, ${Math.round(v.km)} km away`}</span
        >
        <span class="cq-lead-story">“${v.lead.text}”</span>
        <span class="cq-muted small"
          >Heard ${formatDate(v.ll.heard)} from ${v.ll.from}. You'd put it at
          <b>${v.ll.trust}%</b> likely
          true.${v.lead.boom !== undefined
            ? html` <b class="good">A rush is on!</b>`
            : nothing}${v.lead.rush > 0 && v.lead.real !== false
            ? ` ${v.lead.rush} others have gone after it.`
            : ""}</span
        >
        ${v.ll.note
          ? html`<span class="cq-lead-note small">${v.ll.note}</span>`
          : nothing}
      </div>
      ${statusChip(v)}
    </div>
    ${open && !v.ll.work
      ? html`<div class="cq-lead-acts">
          ${atPlace
            ? v.acts.map(
                (a) =>
                  html`<span class="cq-lead-act">
                    ${action(
                      html`${a.def.label} ${odds(a.odds)}`,
                      a.check,
                      () => void ui.cmd({ k: "lead", id: v.ll.id, act: a.act }),
                      "small",
                      `${a.def.text} ${a.def.days} days, ${a.def.cost} coins.`,
                    )}
                    <span class="cq-muted small"
                      >${a.def.days}
                      days${a.def.cost ? `, ${a.def.cost} coins` : ""}</span
                    >
                  </span>`,
              )
            : html`<button
                class="cq-btn small"
                @click=${() => ui.open({ k: "prov", p: v.lead.p })}
              >
                The road there
              </button>`}
          <button
            class="cq-btn small quiet"
            title="Forget this lead"
            @click=${() => void ui.cmd({ k: "lead", id: v.ll.id, act: "drop" })}
          >
            Forget it
          </button>
        </div>`
      : nothing}
  </li>`;
}

/** Your leads, for the journal: the stories you're following. */
export function leadsSection(ui: GameUi): TemplateResult {
  const life = ui.life;
  if (!life || life.watching) return html``;
  const views = leadViews(ui.s, ui.w, life);
  return section(
    html`Leads${views.length
      ? html` <span class="cq-count-chip">${views.length}</span>`
      : nothing}`,
    views.length
      ? html`<ul class="cq-leads">
          ${views.map((v) => leadRow(ui, v, false))}
        </ul>`
      : html`<p class="cq-muted small">
          No leads yet. Read the gazette, or drink and listen at the tavern:
          gold in the hills, wrecks on the reefs, cheap land, rewards for
          outlaws. Some of it's even true.
        </p>`,
  );
}

/** Leads at the place you're standing: work them here. */
export function leadsHereBlock(ui: GameUi): TemplateResult {
  const life = ui.life;
  if (!life || life.watching || life.travel) return html``;
  const views = leadsHere(ui.s, ui.w, life).filter(
    (v) => v.ll.status === "open" || v.ll.status === "found" || v.ll.work,
  );
  if (!views.length) return html``;
  return html`<section class="cq-section cq-leads-here">
    <h3 class="cq-h3">Your leads here</h3>
    <ul class="cq-leads">
      ${views.map((v) => leadRow(ui, v, true))}
    </ul>
  </section>`;
}
