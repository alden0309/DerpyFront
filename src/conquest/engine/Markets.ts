// Each province's own market. Prices start from the colony's (or, in a
// native village, from what the people there want), shift with the season,
// war and blockade, and with whatever news has shaken them (a failed
// harvest, a glut of furs, a strike in the hills). Then they answer to
// trade: every load you buy makes the next one dearer, every load you sell
// makes the next one cheaper, and the town takes a couple of months to eat,
// make and ship its way back to normal. Buying low and selling high still
// pays, if you know where to go, spread your loads around, and don't come
// back to the same well too soon.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  earn,
  gainXp,
  journal,
  outcomeMeta,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import { carried, CARRY, meOf, placesIn } from "./LifeQueries";
import { isWinter, type World } from "./Map";
import { charName, hasTrait, people } from "./Queries";
import { EUROPE_PRICE } from "./Rules";
import { rumour } from "./Rumours";
import type {
  GameState,
  Good,
  Life,
  MarketShock,
  ProvMarket,
  TradeItem,
  WareId,
} from "./Types";
import { GOODS } from "./Types";
import {
  isTradeItem,
  isWare,
  WARE_IDS,
  WARES,
  waresMadeIn,
  waresOfPeople,
} from "./Wares";
import { worldRng } from "./WorldRng";

/** How hard each load moves the price (per market depth). */
export const MARKET_ALPHA = 0.5;
/** Days for a glut or a shortage to ease back by about two thirds. */
export const MARKET_EASE_DAYS = 90;
/** The merchant's cut on each side of a trade, before skill. */
export const MERCHANT_CUT = 0.12;
/** However shrewd you are, the merchants keep this much. */
export const MIN_CUT = 0.03;
/** Prices never fall below or rise above these multiples of normal. */
const FLOOR = 0.25;
const CEILING = 4;
/** Months of prices kept for the trend. */
const HISTORY = 6;

/** How many loads of each good a middling market takes (× the town's size). */
const GOOD_DEPTH: Record<Good, number> = {
  grain: 2,
  fish: 1.5,
  furs: 1,
  tobacco: 1,
  sugar: 1,
  timber: 1.5,
  silver: 0.6,
  tools: 0.9,
  guns: 0.6,
  cloth: 1,
};

/** What a native village pays for each good, against Europe's price. */
const NATIVE_PRICE: Record<Good, number> = {
  grain: 0.8,
  fish: 0.8,
  furs: 0.6,
  tobacco: 0.8,
  sugar: 1.1,
  timber: 0.6,
  silver: 0.7,
  tools: 1.45,
  guns: 1.6,
  cloth: 1.4,
};

/** Goods merchants at a port buy for Europe (so the port takes plenty). */
const EXPORTS = new Set<TradeItem>([
  "furs",
  "tobacco",
  "sugar",
  "silver",
  "deerskins",
  "robes",
  "cochineal",
  "brazilwood",
]);
/** Goods the colonies import (dearer inland, and under blockade). */
const IMPORTS = new Set<TradeItem>([
  "tools",
  "guns",
  "cloth",
  "woollens",
  "brandy",
  "wine",
  "finecloth",
  "spices",
  "gin",
  "iron",
]);
const FOOD = new Set<TradeItem>(["grain", "fish", "maize"]);

export const ITEMS: TradeItem[] = [...GOODS, ...WARE_IDS];

// ---------------------------------------------------------------- who trades here

export interface MarketSide {
  /** A native village (or open country's villagers), not a colony. */
  native: boolean;
  /** The colony's power key, or the native people's key. */
  key: string;
  /** The owning nation, or -1 (open country). */
  nation: number;
}

/** Whether a traveller can buy and sell here at all. */
export function hasMarket(s: GameState, w: World, p: number): boolean {
  if (!w.map.provinces[p] || w.map.provinces[p].closed) return false;
  return placesIn(s, w, p).some(
    (x) => x === "market" || x === "village" || x === "docks",
  );
}

export function sideOf(s: GameState, p: number): MarketSide {
  const pr = s.provinces[p];
  const owner = pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (owner?.kind === "power")
    return { native: false, key: owner.key, nation: owner.id };
  if (owner?.kind === "native")
    return { native: true, key: owner.key, nation: owner.id };
  const tribe = pr.pops.find((x) => x.cls === "tribe");
  return { native: true, key: tribe?.culture ?? "local", nation: -1 };
}

/** What a province makes of the ten goods, and of the wares. */
function makes(s: GameState, w: World, p: number, item: TradeItem): boolean {
  if (isWare(item))
    return waresMadeIn(s, w, p).includes(item) || openMade(s, p, item);
  const pr = s.provinces[p];
  if (w.raw[p] === item) return true;
  return (pr.made[item] ?? 0) >= 1;
}

/** Villagers in open country make their people's wares. */
function openMade(s: GameState, p: number, item: WareId): boolean {
  const pr = s.provinces[p];
  if (pr.owner >= 0) return false;
  const side = sideOf(s, p);
  return waresOfPeople(side.key).includes(item);
}

/** Can you buy it here (does the market stock it)? Anything can be sold. */
export function soldHere(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): boolean {
  if (!hasMarket(s, w, p)) return false;
  const side = sideOf(s, p);
  if (isWare(item)) return makes(s, w, p, item);
  const good = item;
  if (side.native) {
    if (good === "furs" || good === "grain") return true;
    if (good === "fish") return w.map.provinces[p].coastal;
    return w.raw[p] === good;
  }
  if (makes(s, w, p, good)) return true;
  const m = s.nations[side.nation].market;
  return m.stock[good] + m.supply[good] >= 2;
}

// ---------------------------------------------------------------- the price

/** How many loads the market takes before each one sags the price by a third. */
export function depthOf(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): number {
  const pr = s.provinces[p];
  const size = 5 + Math.sqrt(people(pr)) / 12;
  let d = size * (isWare(item) ? WARES[item].depth : GOOD_DEPTH[item]);
  if (makes(s, w, p, item)) d *= 2.2;
  if (EXPORTS.has(item) && (pr.b.port ?? 0) > 0) d *= 1.6;
  return Math.max(2, d);
}

/** The price a load would fetch here with nobody's trading in the way. */
export function basePrice(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): number {
  const side = sideOf(s, p);
  const def = w.map.provinces[p];
  const made = makes(s, w, p, item);
  if (isWare(item)) {
    const ware = WARES[item];
    if (made) return ware.base * (side.native ? 0.7 : 0.82);
    const want = side.native
      ? ware.want.natives
      : (ware.want.powers?.[side.key] ?? ware.want.colonists);
    return ware.base * want;
  }
  const good = item;
  let price: number;
  if (side.native) price = EUROPE_PRICE[good] * NATIVE_PRICE[good];
  else
    price = Math.max(
      0.3,
      s.nations[side.nation].market.price[good] || EUROPE_PRICE[good],
    );
  if (made) price *= 0.85;
  if (!side.native && !def.coastal) {
    if (IMPORTS.has(good)) price *= 1.12;
    if (EXPORTS.has(good)) price *= 0.92;
  }
  return price;
}

/** The season's turn: harvests, the fur season, hurricanes. */
export function seasonOf(
  w: World,
  p: number,
  item: TradeItem,
  day: number,
): number {
  const def = w.map.provinces[p];
  const month = dateOf(day).month;
  const north = def.lat > 30;
  switch (item) {
    case "grain":
    case "maize":
      if (!north) return month >= 8 && month <= 10 ? 0.93 : 1.03;
      if (month >= 8 && month <= 10) return 0.82;
      if (month >= 2 && month <= 5) return 1.18;
      return 1;
    case "fish":
      if (north && isWinter(def.lat, month)) return 1.2;
      return month === 3 || month === 4 ? 0.86 : 1;
    case "furs":
      if (month >= 2 && month <= 4) return 0.88;
      return month === 7 || month === 8 ? 1.1 : 1;
    case "deerskins":
    case "robes":
      return month >= 2 && month <= 3 ? 0.9 : 1;
    case "tobacco":
      if (month >= 9) return 0.9;
      return month >= 4 && month <= 6 ? 1.08 : 1;
    case "sugar":
      if (month <= 4) return 0.9;
      return month >= 7 && month <= 9 ? 1.08 : 1;
    case "timber":
      return north && isWinter(def.lat, month) ? 0.9 : 1;
    default:
      return 1;
  }
}

/** War, siege and blockade. */
export function warOf(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): { mul: number; why: string | null } {
  const pr = s.provinces[p];
  if (pr.siege || pr.occupier >= 0)
    return FOOD.has(item)
      ? { mul: 1.6, why: "the town is besieged" }
      : { mul: 1.25, why: "the town is besieged" };
  if (pr.owner < 0) return { mul: 1, why: null };
  const nation = s.nations[pr.owner];
  let mul = 1;
  let why: string | null = null;
  const fighting = s.wars.some((x) => x.a === nation.id || x.b === nation.id);
  if (fighting) {
    if (item === "guns") mul *= 1.35;
    else if (item === "tools" || item === "iron") mul *= 1.1;
    else if (FOOD.has(item)) mul *= 1.12;
    if (mul !== 1) why = "war";
  }
  // Blockade: a colony fighting another power (or its own crown) can't get
  // ships in or out freely.
  const blockaded =
    w.map.provinces[p].coastal &&
    nation.kind === "power" &&
    (nation.rebelling ||
      s.wars.some(
        (x) =>
          (x.a === nation.id || x.b === nation.id) &&
          s.nations[x.a === nation.id ? x.b : x.a]?.kind !== "native",
      ));
  if (blockaded) {
    if (IMPORTS.has(item)) {
      mul *= 1.25;
      why = "blockade";
    } else if (EXPORTS.has(item)) {
      mul *= 0.85;
      why = "blockade";
    }
  }
  return { mul, why };
}

function shockOf(m: ProvMarket | undefined, item: TradeItem, day: number) {
  let mul = 1;
  const why: string[] = [];
  for (const x of m?.shocks ?? []) {
    if (x.until <= day) continue;
    if (
      x.item === item ||
      x.item === "all" ||
      (x.item === "food" && FOOD.has(item))
    ) {
      mul *= x.mul;
      why.push(x.why);
    }
  }
  return { mul, why };
}

/** Loads sold in (+) or bought out (−), eased back to today. */
export function netNow(
  m: ProvMarket | undefined,
  item: TradeItem,
  day: number,
): number {
  const net = m?.net[item] ?? 0;
  if (!net) return 0;
  return net * Math.exp(-Math.max(0, day - m!.d) / MARKET_EASE_DAYS);
}

export interface PriceView {
  /** A load's price now, before the merchant's cut. */
  price: number;
  /** What it would be with nobody's trading in the way. */
  base: number;
  /** Season, war and news together, as a multiplier on the base. */
  mul: number;
  /** Loads sold in (+) or bought out (−) lately. */
  net: number;
  depth: number;
  /** Reasons it's up or down: "harvest", "war", "a glut"... */
  why: string[];
}

function priceAt(
  base: number,
  depth: number,
  net: number,
  mul: number,
): number {
  const p = base * mul * Math.exp((-MARKET_ALPHA * net) / depth);
  return Math.min(base * CEILING, Math.max(base * FLOOR, p));
}

/** The price of a load here today, and why. */
export function priceView(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
  day = s.day,
): PriceView {
  const m = s.markets?.[p];
  const base = basePrice(s, w, p, item);
  const season = seasonOf(w, p, item, day);
  const war = warOf(s, w, p, item);
  const shock = shockOf(m, item, day);
  const depth = depthOf(s, w, p, item);
  const net = netNow(m, item, day);
  const why: string[] = [];
  if (season < 0.97) why.push("in season");
  if (season > 1.03) why.push("out of season");
  if (war.why) why.push(war.why);
  why.push(...shock.why);
  if (net > depth * 0.3) why.push("a glut: traders have been selling here");
  if (net < -depth * 0.3) why.push("bought up: traders have been buying here");
  const mul = season * war.mul * shock.mul;
  return {
    price: round2(priceAt(base, depth, net, mul)),
    base: round2(base),
    mul,
    net,
    depth,
    why,
  };
}

/** The merchant's cut for you: skill and a shrewd head shave it, even past nothing. */
export function cutFor(s: GameState, life: Life): number {
  const me = meOf(s, life);
  const shrewd = me && hasTrait(me, "shrewd") ? 0.05 : 0;
  const skill = Math.min(0.1, life.skills.trade * 0.006);
  return Math.max(MIN_CUT, MERCHANT_CUT - shrewd - skill);
}

export interface Quote {
  /** Coins for the lot (paid when buying, got when selling). */
  total: number;
  /** The price per load before and after the deal. */
  before: number;
  after: number;
  /** Average per load. */
  each: number;
}

/** What buying (qty > 0) or selling (qty < 0) would come to here, load by load. */
export function quote(
  s: GameState,
  w: World,
  life: Life,
  p: number,
  item: TradeItem,
  qty: number,
): Quote {
  const v = priceView(s, w, p, item);
  const base = basePrice(s, w, p, item);
  const mul = v.mul;
  const cut = cutFor(s, life);
  const n = Math.abs(qty);
  const dir = qty > 0 ? -1 : 1;
  let total = 0;
  for (let k = 0; k < n; k++) {
    const at = priceAt(base, v.depth, v.net + dir * (k + 0.5), mul);
    total += at;
  }
  total *= qty > 0 ? 1 + cut : 1 - cut;
  const after = priceAt(base, v.depth, v.net + dir * n, mul);
  return {
    total: round2(total),
    before: v.price,
    after: round2(after),
    each: n ? round2(total / n) : 0,
  };
}

/** One load's buying and selling price for you here (for lists). */
export function ratesFor(
  s: GameState,
  w: World,
  life: Life,
  p: number,
  item: TradeItem,
): { buy: number; sell: number } {
  return {
    buy: quote(s, w, life, p, item, 1).total,
    sell: quote(s, w, life, p, item, -1).total,
  };
}

// ---------------------------------------------------------------- trading

function marketAt(g: ConquestGame, p: number): ProvMarket {
  const s = g.s;
  s.markets ??= {};
  let m = s.markets[p];
  if (!m) m = s.markets[p] = { net: {}, d: s.day };
  settle(m, s.day);
  g.marketsChanged(p);
  return m;
}

/** Bring a market's gluts and shortages up to today. */
function settle(m: ProvMarket, day: number): void {
  if (m.d === day) return;
  const k = Math.exp(-Math.max(0, day - m.d) / MARKET_EASE_DAYS);
  for (const key of Object.keys(m.net) as TradeItem[]) {
    const v = (m.net[key] ?? 0) * k;
    if (Math.abs(v) < 0.05) delete m.net[key];
    else m.net[key] = Math.round(v * 100) / 100;
  }
  m.d = day;
}

/** Loads of an item you carry. */
export function holding(life: Life, item: TradeItem): number {
  return isWare(item) ? (life.wares?.[item] ?? 0) : (life.goods[item] ?? 0);
}

function addHolding(life: Life, item: TradeItem, qty: number): void {
  if (isWare(item)) {
    const wares = (life.wares ??= {});
    const v = (wares[item] ?? 0) + qty;
    if (v > 0) wares[item] = v;
    else delete wares[item];
  } else {
    const v = (life.goods[item] ?? 0) + qty;
    if (v > 0) life.goods[item] = v;
    else delete life.goods[item];
  }
}

export type Check = { ok: true } | { ok: false; why: string };

export function tradeCheck(
  s: GameState,
  w: World,
  life: Life,
  item: TradeItem,
  qty: number,
): Check {
  if (!isTradeItem(item) || !Number.isInteger(qty) || qty === 0)
    return { ok: false, why: "Bad trade." };
  if (life.travel) return { ok: false, why: "Not on the road." };
  if (!hasMarket(s, w, life.prov))
    return { ok: false, why: "There's no market here." };
  if (qty > 0) {
    if (!soldHere(s, w, life.prov, item))
      return { ok: false, why: "Nobody sells that here." };
    if (carried(life) + qty > CARRY)
      return { ok: false, why: `You can carry ${CARRY} loads at most.` };
    const q = quote(s, w, life, life.prov, item, qty);
    if (life.purse < q.total)
      return { ok: false, why: `That costs ${q.total.toFixed(1)} coins.` };
  } else if (holding(life, item) < -qty)
    return { ok: false, why: "You don't have that much." };
  return { ok: true };
}

/** Buy (qty > 0) or sell (qty < 0) at the market where you are. */
export function marketTrade(
  g: ConquestGame,
  life: Life,
  item: TradeItem,
  qty: number,
): string | null {
  const s = g.s;
  const check = tradeCheck(s, g.w, life, item, qty);
  if (!check.ok) return check.why;
  const q = quote(s, g.w, life, life.prov, item, qty);
  touchLife(g, life);
  if (qty > 0) spend(g, life, q.total);
  else earn(g, life, q.total);
  addHolding(life, item, qty);
  const m = marketAt(g, life.prov);
  m.net[item] = round2((m.net[item] ?? 0) - qty);
  gainXp(g, life, "trade", 2 + Math.abs(qty));
  return null;
}

// ---------------------------------------------------------------- gifts at the council fire

/** Present a load at a native council fire: goodwill, renown, and the elders remember. */
export function presentCheck(
  s: GameState,
  w: World,
  life: Life,
  item: TradeItem,
): Check {
  if (!isTradeItem(item)) return { ok: false, why: "Bad gift." };
  if (life.travel) return { ok: false, why: "Not on the road." };
  const side = sideOf(s, life.prov);
  if (!side.native || side.nation < 0)
    return { ok: false, why: "Gifts like these are for a native council." };
  if (!placesIn(s, w, life.prov).includes("councilfire"))
    return { ok: false, why: "There's no council fire here." };
  if (holding(life, item) < 1)
    return { ok: false, why: "You have none to give." };
  if ((life.cooldowns["present"] ?? 0) > s.day)
    return {
      ok: false,
      why: "You gave gifts here lately; let them be talked about first.",
    };
  return { ok: true };
}

/** How much goodwill a gift buys, by what it's worth to them. */
export function giftWorth(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): number {
  const v = priceView(s, w, p, item).price;
  const prized = isWare(item) && WARES[item].gift;
  return Math.round(v * (prized ? 2 : 1) * 10) / 10;
}

export function present(
  g: ConquestGame,
  life: Life,
  item: TradeItem,
): string | null {
  const s = g.s;
  const check = presentCheck(s, g.w, life, item);
  if (!check.ok) return check.why;
  const side = sideOf(s, life.prov);
  const worth = giftWorth(s, g.w, life.prov, item);
  touchLife(g, life);
  addHolding(life, item, -1);
  life.cooldowns["present"] = s.day + 30;
  const me = meOf(s, life)!;
  const nation = g.nation(side.nation);
  // The people remember who brought gifts.
  if (me.nation !== side.nation) {
    (nation.relations[me.nation] ??= []).push({
      of: -1,
      why: `Gifts from ${me.family}`,
      value: Math.min(6, Math.round(worth / 2)),
      until: s.day + 365 * 2,
    });
  }
  const chief = s.chars[nation.ruler];
  outcomeMeta(g, life, {
    key: "present",
    title: "Gifts for the council",
    scene: "councilfire",
    c: chief?.alive ? chief.id : -1,
    ok: true,
  });
  if (chief?.alive)
    remembers(
      g,
      life,
      g.char(chief.id),
      "Brought gifts to the council",
      Math.min(15, Math.round(worth * 1.5)),
      2,
    );
  addRenown(g, life, worth >= 8 ? 2 : 1);
  gainXp(g, life, "persuasion", 6);
  const name = isWare(item) ? WARES[item].name.toLowerCase() : item;
  journal(
    g,
    life,
    `You laid ${name} before the council at ${g.map.provinces[life.prov].name}. ${chief ? `${charName(chief)} accepted them` : "The elders accepted them"}${worth >= 8 ? " with real pleasure" : ""}.`,
    "good",
  );
  return null;
}

// ---------------------------------------------------------------- the month

/** Shake a market: a failed harvest, a glut, a ship that didn't come. */
export function shockMarket(
  g: ConquestGame,
  p: number,
  shock: MarketShock,
): void {
  const m = marketAt(g, p);
  m.shocks = [...(m.shocks ?? []).filter((x) => x.until > g.s.day), shock];
}

const SHOCKS: {
  item: MarketShock["item"];
  mul: number;
  months: number;
  why: string;
  say: (place: string) => string;
  when: (s: GameState, w: World, p: number) => boolean;
}[] = [
  {
    item: "food",
    mul: 1.45,
    months: 4,
    why: "the harvest failed",
    say: (x) => `The harvest has failed around ${x}: corn is dear there.`,
    when: (s, w, p) => !w.tropical[p],
  },
  {
    item: "food",
    mul: 0.72,
    months: 3,
    why: "a bumper harvest",
    say: (x) => `A bumper harvest at ${x}: they're giving corn away.`,
    when: () => true,
  },
  {
    item: "furs",
    mul: 0.7,
    months: 3,
    why: "a glut of furs",
    say: (x) =>
      `The canoes came down to ${x} loaded to the gunwales: furs are cheap there.`,
    when: (s, w, p) => w.raw[p] === "furs" || w.northern[p],
  },
  {
    item: "cloth",
    mul: 1.4,
    months: 4,
    why: "no ship from home",
    say: (x) => `No ship has reached ${x} in months: cloth and tools are dear.`,
    when: (s, w, p) =>
      s.provinces[p].owner >= 0 &&
      s.nations[s.provinces[p].owner].kind === "power",
  },
  {
    item: "tools",
    mul: 1.35,
    months: 4,
    why: "no ship from home",
    say: (x) => `They're short of tools and nails at ${x}.`,
    when: (s, w, p) =>
      s.provinces[p].owner >= 0 &&
      s.nations[s.provinces[p].owner].kind === "power",
  },
  {
    item: "all",
    mul: 1.18,
    months: 2,
    why: "a fire in the warehouses",
    say: (x) => `Fire in the warehouses at ${x}: everything's dearer there.`,
    when: (s, w, p) => (s.provinces[p].b.port ?? 0) > 0,
  },
  {
    item: "tobacco",
    mul: 0.75,
    months: 4,
    why: "the crop is in",
    say: (x) =>
      `A great crop of tobacco at ${x}: the planters can't sell it fast enough.`,
    when: (s, w, p) => w.raw[p] === "tobacco",
  },
  {
    item: "sugar",
    mul: 1.4,
    months: 3,
    why: "the hurricane",
    say: (x) => `A hurricane has flattened the cane at ${x}: sugar is dear.`,
    when: (s, w, p) => w.raw[p] === "sugar" && w.tropical[p],
  },
];

/** Each month: prices sampled for the trends, old shocks cleared, new ones. */
export function marketsMonthly(g: ConquestGame): void {
  const s = g.s;
  const w = g.w;
  s.markets ??= {};
  // Places players know: where they are and have been lately.
  const watched = new Set<number>();
  for (const life of s.lives) {
    if (life.watching || life.c < 0) continue;
    watched.add(life.prov);
    for (let i = life.trail.length - 1; i >= 0 && watched.size < 60; i--)
      if (s.day - life.trail[i].day < 730) watched.add(life.trail[i].p);
  }
  for (const key of Object.keys(s.markets)) {
    const p = Number(key);
    const m = s.markets[p];
    const before = JSON.stringify(m);
    settle(m, s.day);
    if (m.shocks) {
      m.shocks = m.shocks.filter((x) => x.until > s.day);
      if (!m.shocks.length) delete m.shocks;
    }
    if (!watched.has(p)) delete m.hist;
    if (!Object.keys(m.net).length && !m.shocks && !m.hist) {
      delete s.markets[p];
      g.marketsChanged(p);
    } else if (JSON.stringify(m) !== before) g.marketsChanged(p);
  }
  for (const p of watched) {
    if (!hasMarket(s, w, p)) continue;
    const m = (s.markets[p] ??= { net: {}, d: s.day });
    const hist = (m.hist ??= {});
    for (const item of ITEMS) {
      if (!soldHere(s, w, p, item) && !wanted(s, w, p, item)) continue;
      const list = (hist[item] ??= []);
      list.push(priceView(s, w, p, item).price);
      if (list.length > HISTORY) list.splice(0, list.length - HISTORY);
    }
    g.marketsChanged(p);
  }
  // A shock or two somewhere in the Americas, talked about from there.
  const rng = worldRng(s, 11);
  const tries = rng.int(0, 2);
  for (let i = 0; i < tries; i++) {
    const p = rng.int(0, s.provinces.length - 1);
    if (!hasMarket(s, w, p) || s.provinces[p].owner < 0) continue;
    const options = SHOCKS.filter((x) => x.when(s, w, p));
    const pick = rng.pick(options);
    if (!pick) continue;
    shockMarket(g, p, {
      item: pick.item,
      mul: pick.mul,
      until: s.day + pick.months * 30,
      why: pick.why,
    });
    rumour(
      g,
      p,
      pick.say(w.map.provinces[p].name),
      -1,
      pick.mul > 1 ? "bad" : undefined,
    );
  }
}

/** Whether the people here want it especially (so it's worth listing to sell). */
export function wanted(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): boolean {
  if (!isWare(item)) return true;
  const side = sideOf(s, p);
  const ware = WARES[item];
  const want = side.native
    ? ware.want.natives
    : (ware.want.powers?.[side.key] ?? ware.want.colonists);
  return want >= 1.1;
}

/** The last few months' prices and today's, for a sparkline. */
export function trendOf(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
): number[] {
  const past = s.markets?.[p]?.hist?.[item] ?? [];
  return [...past, priceView(s, w, p, item).price];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
