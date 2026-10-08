// Goods between nations: a governor offers some of their stores (and gold)
// for some of another nation's, colony or native. The computer weighs what
// each good is worth to it and what it thinks of you; a player decides for
// themselves. And goods bought outright in Europe, shipped over on the next
// sailing.

import { goodsMoved, mainPort, tally } from "./Economy";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import type { World } from "./Map";
import {
  atWar,
  convoyRoom,
  crossing,
  europePrice,
  nationsBorder,
  relationOf,
} from "./Queries";
import { POWER_RULES, SHIPPING_PER_UNIT } from "./Rules";
import type { Breakdown, Command, GameState, Good, TradeTerms } from "./Types";
import { GOODS } from "./Types";

type Check = { ok: true } | { ok: false; why: string };
const yes: Check = { ok: true };
const no = (why: string): Check => ({ ok: false, why });

/** How much native nations want each good, against its price in Europe. */
const NATIVE_WANT: Record<Good, number> = {
  grain: 0.8,
  fish: 0.6,
  furs: 0.5,
  tobacco: 0.6,
  sugar: 1,
  timber: 0.4,
  silver: 0.7,
  tools: 1.8,
  guns: 2.2,
  cloth: 1.6,
};

/** Offers to players wait this long. */
export const DEAL_DAYS = 30;
/** A merchant's commission on goods bought in Europe for the governor. */
export const ORDER_FEE = 0.1;
/** Days for an order to reach Europe, be bought, and come back: × crossing. */
export const ORDER_CROSSINGS = 2;

function clean(goods: unknown): Partial<Record<Good, number>> | null {
  if (!goods || typeof goods !== "object") return {};
  const out: Partial<Record<Good, number>> = {};
  for (const [k, v] of Object.entries(goods as Record<string, unknown>)) {
    if (!GOODS.includes(k as Good)) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    const q = Math.floor(v);
    if (q > 0) out[k as Good] = q;
  }
  return out;
}

/** The terms, tidied up, or null if they make no sense. */
export function cleanTerms(t: unknown): TradeTerms | null {
  if (!t || typeof t !== "object") return null;
  const x = t as Partial<TradeTerms>;
  const give = clean(x.give);
  const get = clean(x.get);
  if (!give || !get) return null;
  const gold =
    typeof x.gold === "number" && Number.isFinite(x.gold)
      ? Math.round(x.gold)
      : 0;
  return { give, get, gold };
}

const count = (g: Partial<Record<Good, number>>) =>
  Object.values(g).reduce((a, b) => a + (b ?? 0), 0);

/** Whether `n` can put these terms to `other` at all. */
export function dealCheck(
  s: GameState,
  w: World,
  n: number,
  other: number,
  terms: TradeTerms,
): Check {
  const me = s.nations[n];
  const them = s.nations[other];
  if (n === other) return no("That's you.");
  if (!them?.alive || them.kind === "crown") return no("They can't trade.");
  if (atWar(s, n, other)) return no("Not while you're at war.");
  if (count(terms.give) + count(terms.get) === 0 && terms.gold === 0)
    return no("Choose something to trade.");
  if (count(terms.give) === 0 && terms.gold <= 0)
    return no("Offer them something in return.");
  if (count(terms.get) === 0 && terms.gold >= 0)
    return no("Ask for something in return.");
  if (
    (me.kind === "native" || them.kind === "native") &&
    !nationsBorder(s, w.map, n, other) &&
    !nationsBorder(s, w.map, other, n)
  )
    return no("You need to share a border to trade with them.");
  for (const [good, q] of Object.entries(terms.give) as [Good, number][])
    if (me.market.stock[good] < q)
      return no(`You only have ${Math.floor(me.market.stock[good])} ${good}.`);
  for (const [good, q] of Object.entries(terms.get) as [Good, number][])
    if (them.market.stock[good] < q)
      return no(
        `They only have ${Math.floor(them.market.stock[good])} ${good}.`,
      );
  if (terms.gold > 0 && me.gold < terms.gold)
    return no("You don't have that much gold.");
  if (terms.gold < 0 && them.gold < -terms.gold)
    return no(`They only have ${Math.floor(them.gold)} gold.`);
  return yes;
}

/** What a good is worth to a nation, a unit. */
export function worthTo(s: GameState, n: number, good: Good): number {
  const nation = s.nations[n];
  if (nation.kind === "native")
    return europePrice(s, good).total * NATIVE_WANT[good];
  return nation.market.price[good];
}

/** Why the other side would (≥ 0) or wouldn't take the deal. */
export function dealWillingness(
  s: GameState,
  w: World,
  from: number,
  to: number,
  terms: TradeTerms,
): Breakdown {
  const them = s.nations[to];
  let gain = Math.max(0, terms.gold);
  let loss = Math.max(0, -terms.gold);
  for (const [good, q] of Object.entries(terms.give) as [Good, number][])
    gain += q * worthTo(s, to, good);
  for (const [good, q] of Object.entries(terms.get) as [Good, number][]) {
    // What they need themselves is dearer to part with.
    const left = them.market.stock[good] - q;
    const need =
      them.kind === "power"
        ? them.market.demand[good] * 2
        : good === "grain"
          ? 20
          : 0;
    loss += q * worthTo(s, to, good) * (left < need ? 1.5 : 1);
  }
  const e = new Explain();
  const total = Math.max(5, gain + loss);
  e.add(
    `What they get (${Math.round(gain)}) against what they give (${Math.round(loss)})`,
    Math.round(((gain - loss) / total) * 100),
    true,
  );
  const opinion = relationOf(s, w, to, from).total;
  e.add(`What they think of you (${opinion})`, Math.round(opinion / 3));
  e.add("Their merchants want a margin", -8);
  if (opinion < -50) e.add("They won't deal with you at all", -100);
  return e.done(0);
}

/** Move the goods and gold. */
function carryOut(
  g: ConquestGame,
  from: number,
  to: number,
  terms: TradeTerms,
): void {
  const a = g.nation(from);
  const b = g.nation(to);
  const move = (
    x: typeof a,
    y: typeof b,
    goods: Partial<Record<Good, number>>,
  ) => {
    for (const [good, q] of Object.entries(goods) as [Good, number][]) {
      x.market.stock[good] = Math.round((x.market.stock[good] - q) * 10) / 10;
      y.market.stock[good] = Math.round((y.market.stock[good] + q) * 10) / 10;
      goodsMoved(g, x.id, good, q, "went");
      goodsMoved(g, y.id, good, q, "came");
    }
  };
  move(a, b, terms.give);
  move(b, a, terms.get);
  a.gold = Math.round((a.gold - terms.gold) * 10) / 10;
  b.gold = Math.round((b.gold + terms.gold) * 10) / 10;
  if (terms.gold > 0) {
    tally(g, from, "Goods bought from other nations", -terms.gold);
    tally(g, to, "Goods sold to other nations", terms.gold);
  } else if (terms.gold < 0) {
    tally(g, from, "Goods sold to other nations", -terms.gold);
    tally(g, to, "Goods bought from other nations", terms.gold);
  }
  if (b.kind === "native") {
    (b.relations[from] ??= []).push({
      of: -1,
      why: "Traded fairly with us",
      value: 3,
      until: g.s.day + 365,
    });
  }
  g.event({
    k: "deal",
    day: g.s.day,
    n: from,
    with: to,
    status: "done",
    terms,
  });
}

// ---------------------------------------------------------------- Europe

/** What goods bought in Europe would cost, landed here, and when they'd come. */
export function orderQuote(
  g: { s: GameState; w: World },
  n: number,
  goods: Partial<Record<Good, number>>,
  port: number,
): { gold: number; days: number; units: number } {
  const s = g.s;
  const nation = s.nations[n];
  const freight =
    SHIPPING_PER_UNIT * (1 - (POWER_RULES[nation.key]?.shipping ?? 0));
  let gold = 0;
  let units = 0;
  for (const [good, q] of Object.entries(goods) as [Good, number][]) {
    gold += q * (europePrice(s, good).total + freight);
    units += q;
  }
  gold = Math.ceil(gold * (1 + ORDER_FEE));
  const days =
    port >= 0 ? crossing(s, g.w, port, s.day).total * ORDER_CROSSINGS : 0;
  return { gold, days, units };
}

export function orderCheck(
  g: { s: GameState; w: World },
  n: number,
  goods: Partial<Record<Good, number>>,
  port: number,
): Check {
  const nation = g.s.nations[n];
  if (nation.kind !== "power") return no("Only colonies trade with Europe.");
  if (nation.rebelling) return no("The crown's navy blockades your ports.");
  if (port < 0) return no("You need a port to land the goods.");
  const q = orderQuote(g, n, goods, port);
  if (q.units <= 0) return no("Choose what to buy.");
  const room = convoyRoom(g.s, n);
  if (q.units > room) return no(`A convoy holds up to ${room} units.`);
  if (nation.gold < q.gold) return no(`Costs ${q.gold} gold.`);
  return yes;
}

export function tradeCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  const s = g.s;
  switch (c.k) {
    case "deal": {
      const terms = cleanTerms(c.terms);
      if (!terms) return "Bad terms.";
      if (typeof c.n !== "number") return "Trade with whom?";
      const check = dealCheck(s, g.w, n, c.n, terms);
      if (!check.ok) return check.why;
      const them = s.nations[c.n];
      if (them.player !== null) {
        s.deals = s.deals.filter((d) => !(d.from === n && d.to === c.n));
        s.deals.push({ id: g.nextId(), from: n, to: c.n, day: s.day, terms });
        g.dealsChanged();
        g.event({
          k: "deal",
          day: s.day,
          n,
          with: c.n,
          status: "offered",
          terms,
        });
        return null;
      }
      if (dealWillingness(s, g.w, n, c.n, terms).total >= 0)
        carryOut(g, n, c.n, terms);
      else
        g.event({
          k: "deal",
          day: s.day,
          n,
          with: c.n,
          status: "refused",
          terms,
        });
      return null;
    }
    case "dealAnswer": {
      const deal = s.deals.find((d) => d.id === c.deal && d.to === n);
      if (!deal) return "That offer is gone.";
      s.deals = s.deals.filter((d) => d !== deal);
      g.dealsChanged();
      if (!c.yes) {
        g.event({
          k: "deal",
          day: s.day,
          n: deal.from,
          with: n,
          status: "refused",
          terms: deal.terms,
        });
        return null;
      }
      const check = dealCheck(s, g.w, deal.from, n, deal.terms);
      if (!check.ok) return check.why;
      carryOut(g, deal.from, n, deal.terms);
      return null;
    }
    case "order": {
      const goods = clean(c.goods);
      if (!goods) return "Bad order.";
      const port = mainPort(g, n);
      const check = orderCheck(g, n, goods, port);
      if (!check.ok) return check.why;
      const q = orderQuote(g, n, goods, port);
      const nation = g.nation(n);
      nation.gold = Math.round((nation.gold - q.gold) * 10) / 10;
      tally(g, n, "Goods bought in Europe", -q.gold);
      nation.convoys.push({
        id: g.nextId(),
        port,
        out: false,
        departed: s.day,
        arrive: s.day + q.days,
        cargo: goods,
        paid: q.gold,
        orders: {},
        ordered: true,
      });
      g.event({ k: "ordered", day: s.day, n, goods, gold: q.gold });
      return null;
    }
    default:
      return "Unknown command.";
  }
}

/** Offers to players that nobody answered go away. */
export function dealsMonthly(g: ConquestGame): void {
  const s = g.s;
  const before = s.deals.length;
  s.deals = s.deals.filter((d) => s.day - d.day < DEAL_DAYS);
  if (s.deals.length !== before) g.dealsChanged();
}
