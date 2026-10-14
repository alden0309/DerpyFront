// BUSINESS (r15): a trading company for particular goods. Alone, or with
// partners (a firm of its own kind, run by the partnership code), it keeps a
// factor at each port it uses, and on the cycle you set buys a cargo of its
// goods at the market's real price (its buying dears the price there), ships
// it, and sells it where you send it (its selling cheapens the price there):
// to another port of the Americas, the West Indies among them, or to Europe.
// At sea a cargo may be wrecked, taken by a privateer in wartime, seized by
// the customs where the laws of trade forbid it (the Navigation Acts, Spain's
// and France's rules for their colonies), or spoil in part. No two enemies
// trade, the Hudson's Bay Company keeps the Bay to itself, and the Company
// of the Indies licenses Louisiana's trade in its years. Every voyage is
// written in the firm's books and told in the partners' own news; the odds
// before you commit come from the same tables the voyage is rolled from.
// No trade in people: that's not this company's business.
//
// ECON (r17): a return cargo. A company can also buy goods where its cargo
// is sold and bring them home (Jamestown's tobacco to Havana, Havana's
// cochineal back to Jamestown; or London's woollens for Virginia), and
// either leg may carry nothing. Each leg is priced from the markets at its
// two ends, rolled on its own dice from the same table its odds are shown
// from, written in the books and told in the partners' news.

import { dateOf } from "./Calendar";
import { book, callIn, divide, tell } from "./Firms";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { journal, milestone, spend } from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  lifeOfChar,
  meOf,
  no,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import {
  depthOf,
  hasMarket,
  makes,
  MARKET_ALPHA,
  MARKET_EASE_DAYS,
  marketMove,
  netNow,
  quoteCut,
  soldHere,
} from "./Markets";
import type { OddsOutcome, OddsView } from "./Odds";
import { chanceWords } from "./Odds";
import {
  firmLine,
  firmsWith,
  LOAN_RATE,
  MAX_FIRMS,
  partners,
  partnersChanged,
} from "./PartnersCore";
import { seaHopDays } from "./Paths";
import { charName, crossing, europePrice } from "./Queries";
import { Rng } from "./Rng";
import { rumour } from "./Rumours";
import type {
  AffairItem,
  CompanyLegs, // ECON (r17)
  CompanyPlan,
  CompanyState,
  CompanyVoyage,
  Firm,
  GameState,
  Good,
  Life,
  TradeItem,
} from "./Types";
import { GOODS } from "./Types";
import { isWare, WARES } from "./Wares";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the rules' numbers

/** Setting a company up: the counting room, its books and its seal. */
export const CO_SETUP = 15;
/**
 * A factor's retainer a month, at each port of the Americas the company uses
 * (they live mostly by their commission on what they buy and sell).
 */
export const CO_FACTOR = 0.5;
/** Loads a cargo, and months between sailings, to choose from. */
export const CO_LOADS = [5, 10, 20, 40];
export const CO_EVERY = [1, 2, 3, 6];
/** Its factors' commission on each side of a trade (a stranger pays the merchants 12 in 100). */
export const CO_CUT = 0.02;
/**
 * How much of each load moves a port's price. WORK (r21): every load, as a
 * person's buying and selling does (it was half: the factors were reckoned to
 * buy up and down the country, so a company's cargo hardly showed in the
 * port's price, unlike buying the same loads yourself).
 */
export const CO_MOVE = 1;
/**
 * Where the country makes the goods, its factors buy from the planters, the
 * trappers and the millers at their landings, for goods and credit, ahead of
 * the market: this much of the market's price.
 */
export const CO_LANDING = 0.8;
/** A correspondent's commission in Europe. */
export const CO_EUROPE_CUT = 0.025;
/**
 * Freight and port charges a load: lading at each end, and a day at sea
 * (an Atlantic crossing comes to about half a coin a load, a company's own
 * charter a little under the 0.7 a load the colonies' merchants reckon on).
 */
export const CO_FREIGHT = { port: 0.1, perDay: 0.0045 };
/** Freight and insurance in wartime, against peace. */
export const CO_WAR_FREIGHT = 1.5;
/** What can befall a cargo at sea (each a chance a voyage). */
export const CO_RISK = {
  /** Wrecked: a little for any voyage, more for every day at sea (1 in 25 across the Atlantic). */
  wreck: { base: 0.01, perDay: 0.0004 },
  /** Taken by a privateer, when either end's nation is at war with a sea power. */
  privateer: 0.14,
  /** Seized by the customs, where the laws of trade forbid the voyage. */
  laws: 0.12,
  /** Of a cargo that spoils, the part lost. */
  spoilPart: 0.35,
};
/** The chance a cargo of each kind spoils in part on a voyage (damp, rot, worm, moth). */
export const CO_SPOIL: Partial<Record<TradeItem, number>> = {
  fish: 0.18,
  grain: 0.12,
  maize: 0.12,
  chocolate: 0.1,
  sugar: 0.08,
  tobacco: 0.07,
  furs: 0.06,
  deerskins: 0.06,
  wine: 0.06,
  robes: 0.05,
  cloth: 0.04,
  woollens: 0.04,
  finecloth: 0.04,
  spices: 0.03,
  brandy: 0.03,
  gin: 0.03,
};
const SPOIL_ELSE = 0.02;
/** A cargo sails only if it's expected to make this much of its cost, risks and all. */
export const CO_MARGIN = 0.04;
/** The Company of the Indies' licence on Louisiana's trade (1719 to 1731), of a cargo's cost. */
export const CO_LICENCE = 0.05;

/** The goods a company may trade, by their names in the trade (and when England enumerated them). */
export const CO_GOODS: Partial<
  Record<TradeItem, { name: string; short: string; enumerated?: number }>
> = {
  tobacco: { name: "Tobacco", short: "Tobacco", enumerated: 1660 },
  sugar: { name: "Sugar, rum and molasses", short: "Sugar", enumerated: 1660 },
  furs: { name: "Furs and peltry", short: "Fur", enumerated: 1721 },
  deerskins: { name: "Deerskins", short: "Deerskin", enumerated: 1722 },
  fish: { name: "Salt fish", short: "Fish" },
  timber: {
    name: "Timber and naval stores",
    short: "Timber",
    enumerated: 1705,
  },
  grain: { name: "Flour and bread", short: "Flour" },
  maize: { name: "Indian corn", short: "Corn" },
  iron: { name: "Bar iron", short: "Iron", enumerated: 1764 },
  cloth: { name: "Cloth", short: "Cloth" },
  woollens: { name: "English woollens", short: "Woollen" },
  finecloth: { name: "Fine cloth", short: "Cloth" },
  wine: { name: "Wine", short: "Wine" },
  brandy: { name: "Brandy", short: "Brandy" },
  gin: { name: "Gin", short: "Gin" },
  tools: { name: "Ironmongery", short: "Hardware" },
  guns: { name: "Arms and powder", short: "Arms" },
  cochineal: { name: "Cochineal", short: "Cochineal" },
  chocolate: { name: "Cacao and chocolate", short: "Cacao" },
  spices: { name: "Spices", short: "Spice" },
  silver: { name: "Silver", short: "Silver" },
  brazilwood: { name: "Dyewood", short: "Dyewood" },
  robes: { name: "Buffalo robes", short: "Robe" },
};

/** What a company calls its goods. */
export function goodsName(item: TradeItem): string {
  return (
    CO_GOODS[item]?.name ??
    (isWare(item) ? WARES[item].name : item[0].toUpperCase() + item.slice(1))
  );
}

/** The Hudson's Bay Company's posts on the Bay (its charter's country, from 1670). */
const HBC_POSTS = new Set([
  "York Factory",
  "Churchill",
  "Fort Albany",
  "Moose River",
  "Fort Severn",
  "Eastmain",
  "Great Whale",
]);

// ---------------------------------------------------------------- the route

const year = (day: number) => dateOf(day).year;

/** The power key of the nation holding a port ("england"), or "" for none. */
function keyAt(s: GameState, p: number): string {
  const pr = s.provinces[p];
  const n = pr
    ? s.nations[pr.occupier >= 0 ? pr.occupier : pr.owner]
    : undefined;
  return n?.kind === "power" ? n.key : (n?.key ?? "");
}

function nationAt(s: GameState, p: number): number {
  const pr = s.provinces[p];
  return pr ? (pr.occupier >= 0 ? pr.occupier : pr.owner) : -1;
}

/** Where a company of a nation sells in Europe. */
export function europePort(key: string, day: number): string {
  switch (key) {
    case "france":
      return "La Rochelle";
    case "spain":
      return year(day) >= 1717 ? "Cádiz" : "Seville";
    case "netherlands":
      return "Amsterdam";
    case "portugal":
      return "Lisbon";
    case "sweden":
      return "Gothenburg";
    default:
      return "London";
  }
}

/** A port's name, or Europe's by the nation trading. */
export function placeName(
  s: GameState,
  w: World,
  p: number,
  from: number,
  day = s.day,
): string {
  return p >= 0
    ? (w.map.provinces[p]?.name ?? "somewhere")
    : europePort(keyAt(s, from), day);
}

/** Kilometres between two places, as the crow flies. */
function km(w: World, a: number, b: number): number {
  const A = w.map.provinces[a];
  const B = w.map.provinces[b];
  if (!A || !B) return 0;
  const rad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * rad;
  const dLon = (B.lon - A.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Days a cargo is at sea: along the coasts (a third longer than the crow), or across the Atlantic. */
export function voyageDays(
  s: GameState,
  w: World,
  plan: Pick<CompanyPlan, "from" | "to">,
  day = s.day,
): number {
  if (plan.to < 0) return crossing(s, w, plan.from, day).total;
  if (plan.from < 0) return crossing(s, w, plan.to, day).total; // ECON (r17): home from Europe
  return seaHopDays(km(w, plan.from, plan.to) * 1.3);
}

/** Either end's nation at war with a power at sea: privateers are out. */
export function warAtSea(
  s: GameState,
  plan: Pick<CompanyPlan, "from" | "to">,
): boolean {
  const ends = [
    nationAt(s, plan.from),
    plan.to >= 0 ? nationAt(s, plan.to) : -1,
  ];
  return s.wars.some((x) =>
    ends.some(
      (n) =>
        n >= 0 &&
        (x.a === n || x.b === n) &&
        s.nations[x.a === n ? x.b : x.a]?.kind === "power",
    ),
  );
}

/** Why the laws of trade forbid this voyage, if they do (the customs may seize it). */
export function againstTheLaws(
  s: GameState,
  plan: Pick<CompanyPlan, "from" | "to" | "item">,
  day = s.day,
): string | null {
  // ECON (r17): from its own nation's port in Europe to its colony: the law's own way.
  if (plan.from < 0) return null;
  const a = keyAt(s, plan.from);
  const b = plan.to >= 0 ? keyAt(s, plan.to) : a;
  const native = (k: string) =>
    ![
      "england",
      "france",
      "spain",
      "netherlands",
      "portugal",
      "sweden",
    ].includes(k);
  if (native(a) || native(b) || a === b) {
    const en = CO_GOODS[plan.item]?.enumerated;
    if (
      a === "england" &&
      plan.to >= 0 &&
      b !== "england" &&
      en &&
      year(day) >= en
    )
      return `the Navigation Acts: ${goodsName(plan.item).toLowerCase()} is enumerated, for English ports only`;
    return null;
  }
  const en = CO_GOODS[plan.item]?.enumerated;
  if (a === "england" && en && year(day) >= en)
    return `the Navigation Acts: ${goodsName(plan.item).toLowerCase()} is enumerated, for English ports only`;
  if (a === "spain" || b === "spain")
    return "Spain's law: her colonies trade only with Spain (the guarda costa takes smugglers)";
  if (a === "france" || b === "france")
    return "France's Exclusif: her colonies trade only with France";
  return null;
}

/** The Company of the Indies holds Louisiana's trade (1719 to 1731): a licence on each cargo. */
export function indiesLicence(
  s: GameState,
  w: World,
  plan: Pick<CompanyPlan, "from">,
  day = s.day,
): boolean {
  const def = w.map.provinces[plan.from];
  const y = year(day);
  return (
    keyAt(s, plan.from) === "france" &&
    !!def &&
    def.lat < 33 &&
    def.lon < -85 &&
    y >= 1719 &&
    y <= 1731
  );
}

/** What can befall a cargo on this voyage, with why. */
export interface VoyageRisks {
  lost: number;
  taken: number;
  seized: number;
  spoil: number;
  days: number;
  war: boolean;
  laws: string | null;
}

/** The chances on a voyage, from the same table it's rolled from. */
export function voyageRisks(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): VoyageRisks {
  const days = voyageDays(s, w, plan, day);
  const war = warAtSea(s, plan);
  const laws = againstTheLaws(s, plan, day);
  return {
    lost: r2(Math.min(0.3, CO_RISK.wreck.base + CO_RISK.wreck.perDay * days)),
    taken: war ? CO_RISK.privateer : 0,
    seized: laws ? CO_RISK.laws : 0,
    spoil: CO_SPOIL[plan.item] ?? SPOIL_ELSE,
    days,
    war,
    laws,
  };
}

/** How a voyage went: rolled once, with dice of its own. */
export type VoyageEnd = "lost" | "taken" | "seized" | "spoiled" | "home";

export function rollVoyage(r: Rng, k: VoyageRisks): VoyageEnd {
  const u = r.next();
  let acc = k.lost;
  if (u < acc) return "lost";
  acc += k.taken;
  if (u < acc) return "taken";
  acc += k.seized;
  if (u < acc) return "seized";
  acc += k.spoil;
  if (u < acc) return "spoiled";
  return "home";
}

/** A voyage's own dice: from the game's seed and the voyage, apart from the world's luck. */
export function voyageDice(s: GameState, id: number): Rng {
  return new Rng({
    rng:
      (Math.imul(s.settings.seed | 0, 0x2c1b3c6d) ^
        Math.imul(id + 7717, 0x297a2d39) ^
        0x5bd1e995) |
      0,
  });
}

// ---------------------------------------------------------------- what a cargo costs and fetches

export interface CompanyQuote {
  /** The goods bought at the port. */
  buy: number;
  freight: number;
  licence: number;
  /** All it costs to send. */
  cost: number;
  /** What it would fetch where it's going, at today's prices. */
  sale: number;
  days: number;
}

/** What a sale in Europe fetches, after the correspondent's commission. */
function europeSale(s: GameState, item: TradeItem, loads: number): number {
  if (isWare(item)) return 0;
  const good = item as Good;
  const glut = s.europe?.glut?.[good] ?? 0;
  // Each load landed sags the price a little (as Economy's convoys do).
  let total = 0;
  for (let k = 0; k < loads; k++) {
    const ss = {
      ...s,
      europe: {
        ...s.europe,
        glut: { ...s.europe.glut, [good]: glut + k + 0.5 },
      },
    } as GameState;
    total += europePrice(ss, good).total;
  }
  return r2(total * (1 - CO_EUROPE_CUT));
}

/** A cargo's cost and what it would fetch, at today's prices. */
export function companyQuote(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): CompanyQuote {
  const days = voyageDays(s, w, plan, day);
  const buy = r2(
    plan.from < 0
      ? europeBuy(s, keyAt(s, plan.to), plan.item, plan.loads) // ECON (r17)
      : quoteCut(s, w, plan.from, plan.item, plan.loads, CO_CUT, day, CO_MOVE)
          .total * landing(s, w, plan),
  );
  const war = warAtSea(s, plan);
  const freight = r2(
    plan.loads *
      (CO_FREIGHT.port * 2 + CO_FREIGHT.perDay * days) *
      (war ? CO_WAR_FREIGHT : 1) *
      (plan.round ? CO_BACK_FREIGHT : 1), // ECON (r17): the round voyage's ship comes home with it
  );
  const licence = indiesLicence(s, w, plan, day) ? r2(buy * CO_LICENCE) : 0;
  const sale =
    plan.to >= 0
      ? quoteCut(s, w, plan.to, plan.item, -plan.loads, CO_CUT, day, CO_MOVE)
          .total
      : europeSale(s, plan.item, plan.loads);
  return {
    buy,
    freight,
    licence,
    cost: r2(buy + freight + licence),
    sale,
    days,
  };
}

/** What its factors pay of the market's price: less where the country makes the goods. */
export function landing(
  s: GameState,
  w: World,
  plan: Pick<CompanyPlan, "from" | "item">,
): number {
  if (plan.from < 0) return 1; // ECON (r17): bought in Europe
  return makes(s, w, plan.from, plan.item) ? CO_LANDING : 1;
}

/** Factors the company keeps (one at each port of the Americas it uses). */
export function factorsOf(plan: Pick<CompanyPlan, "to">): number {
  return plan.to >= 0 ? 2 : 1;
}

/** Its factors' wages a month. */
export function companyWages(plan: Pick<CompanyPlan, "to">): number {
  return r2(factorsOf(plan) * CO_FACTOR);
}

// ---------------------------------------------------------------- the pace

/**
 * Once it's going, how much its own buying and selling at this pace keep the
 * prices against it, beyond what they are today (a market takes about three
 * months to ease back): fractions dearer to buy, and cheaper to sell.
 */
export function paceDrag(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): { buy: number; sell: number } {
  const keep = Math.exp(-(plan.every * 30.4) / MARKET_EASE_DAYS);
  // Loads' worth of its own trade still in each market when the next cargo comes.
  const left = (CO_MOVE * plan.loads * keep) / (1 - keep);
  const now = (p: number) => netNow(s.markets?.[p], plan.item, day);
  const extraBuy = Math.max(0, left - Math.max(0, -now(plan.from)));
  const buy =
    plan.from < 0
      ? 0 // ECON (r17): Europe's merchants are many; a company hardly moves them
      : Math.exp(
          (MARKET_ALPHA * extraBuy) / depthOf(s, w, plan.from, plan.item),
        ) - 1;
  let sell = 0;
  if (plan.to >= 0) {
    const extraSell = Math.max(0, left - Math.max(0, now(plan.to)));
    sell =
      1 -
      Math.exp((-MARKET_ALPHA * extraSell) / depthOf(s, w, plan.to, plan.item));
  }
  return { buy: r2(buy), sell: r2(sell) };
}

/** A cargo's expected gain once the company is going at its pace (prices settled against it). */
export function steadyGain(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): number {
  const q = companyQuote(s, w, plan, day);
  const k = voyageRisks(s, w, plan, day);
  const d = paceDrag(s, w, plan, day);
  const home = 1 - k.lost - k.taken - k.seized - k.spoil;
  const back = home + k.spoil * (1 - CO_RISK.spoilPart);
  const cost = q.buy * (1 + d.buy) + q.freight + q.licence;
  return r2(q.sale * (1 - d.sell) * back - cost);
}

// ---------------------------------------------------------------- the odds

/** Risk and reward of a company's voyages, before you commit (per the conventions). */
export function companyOdds(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): OddsView {
  // ECON (r17): nothing outward (the ship fetches a return cargo), and a leg home from Europe.
  if (plan.loads === 0) return ballastOdds(s, w, plan, day);
  const ref = plan.from >= 0 ? plan.from : plan.to;
  const q = companyQuote(s, w, plan, day);
  const k = voyageRisks(s, w, plan, day);
  const spoiled = r1(q.sale * (1 - CO_RISK.spoilPart));
  const home = 1 - k.lost - k.taken - k.seized - k.spoil;
  const outcomes: OddsOutcome[] = [
    {
      label: "sold at its price",
      p: home,
      lo: r1(q.sale),
      hi: r1(q.sale),
      note: `${r1(q.sale)} for a cargo that cost ${r1(q.cost)}`,
    },
    {
      label: "spoiled in part",
      p: k.spoil,
      lo: spoiled,
      hi: spoiled,
      note: `a third of it lost to damp, rot or worm`,
      bad: spoiled < q.cost,
    },
    {
      label: "wrecked",
      p: k.lost,
      lo: 0,
      hi: 0,
      note: `ship and cargo lost: ${r1(q.cost)} gone`,
      bad: true,
    },
  ];
  if (k.taken)
    outcomes.push({
      label: "taken by a privateer",
      p: k.taken,
      lo: 0,
      hi: 0,
      note: "a war is on",
      bad: true,
    });
  if (k.seized)
    outcomes.push({
      label: "seized by the customs",
      p: k.seized,
      lo: 0,
      hi: 0,
      note: k.laws ?? "",
      bad: true,
    });
  const ev = outcomes.reduce((m, o) => m + o.p * o.lo, 0);
  const wages = companyWages(plan);
  // A month all told, once it's going at its pace.
  const steady = steadyGain(s, w, plan, day);
  const drag = paceDrag(s, w, plan, day);
  // ECON (r17): with a return cargo, the round voyage's month.
  const back = plan.back ? backShare(s, w, plan, day) : 0;
  const net = r1((steady + back) / plan.every - wages);
  const factors = [
    `Prices: bought at ${placeName(s, w, plan.from, ref, day)} for ${r1(q.buy)} (its buying dears the price there), sold at ${placeName(s, w, plan.to, ref, day)} for about ${r1(q.sale)} (its selling cheapens it). Prices move with the season, war and other traders.`,
    `The voyage: about ${q.days} days at sea; freight and port charges ${r1(q.freight)}${k.war ? " (dearer in wartime)" : ""}.`,
    `The goods: ${goodsName(plan.item).toLowerCase()} spoil ${chanceWords(k.spoil)} voyages${k.spoil >= 0.1 ? " (salt fish and grain go off at sea)" : ""}.`,
    k.war
      ? "War: privateers are out, and freight and insurance cost half as much again."
      : "War would bring privateers, and dearer freight and insurance.",
    k.laws
      ? `The laws of trade: ${k.laws}. The customs may seize it.`
      : "The laws of trade allow it.",
    `Its factors: ${factorsOf(plan)} at ${CO_FACTOR} a month each${landing(s, w, plan) < 1 ? `; where the country makes the goods they buy at the landings, ${Math.round((1 - CO_LANDING) * 100)} in a hundred under the market` : ""}.`,
    drag.buy + drag.sell >= 0.02
      ? `The pace: ${plan.loads} loads every ${plan.every === 1 ? "month" : `${plan.every} months`}. Its own buying keeps ${placeName(s, w, plan.from, ref, day)}'s price about ${Math.round(drag.buy * 100)} in a hundred dearer${plan.to >= 0 ? `, and its selling ${placeName(s, w, plan.to, ref, day)}'s ${Math.round(drag.sell * 100)} cheaper` : ""}, once it's going (a market takes about three months to ease back): about ${steady >= 0 ? "+" : ""}${r1(steady)} a voyage then. Smaller cargoes, or less often, spare the markets.`
      : `The pace: ${plan.loads} loads every ${plan.every === 1 ? "month" : `${plan.every} months`} hardly moves the prices.`,
    `Its factors hold a cargo back while prices wouldn't pay (it costs only their wages).`,
    // ECON (r17): the return cargo's part in the month.
    ...(plan.back
      ? [
          `Home with ${goodsName(plan.back).toLowerCase()} from ${placeName(s, w, plan.to, ref, day)}: about ${back >= 0 ? "+" : ""}${r1(back)} a voyage once it's going, risks and all (the homeward leg's own odds are shown apart).`,
        ]
      : []),
    ...(q.licence
      ? [
          `The Company of the Indies holds Louisiana's trade: its licence is ${r1(q.licence)} a cargo.`,
        ]
      : []),
  ];
  return {
    title: `${goodsName(plan.item)} from ${placeName(s, w, plan.from, ref, day)} to ${placeName(s, w, plan.to, ref, day)}`,
    ok: true,
    costNow: r1(q.cost),
    costMonth: wages,
    per: "trip",
    days: [q.days, q.days],
    outcomes,
    expected: r1(ev - q.cost),
    lo: r1(-q.cost),
    hi: r1(q.sale - q.cost),
    net,
    risks: [
      { label: "Wrecked, ship and cargo", p: k.lost },
      ...(k.taken ? [{ label: "Taken by a privateer", p: k.taken }] : []),
      ...(k.seized ? [{ label: "Seized by the customs", p: k.seized }] : []),
      { label: "Spoiled in part", p: k.spoil },
    ],
    factors,
  };
}

// ---------------------------------------------------------------- checks

/** Ports a company could buy at or sell to: a market and docks on the coast. */
export function companyPort(s: GameState, w: World, p: number): boolean {
  return (
    !!w.map.provinces[p]?.coastal &&
    hasMarket(s, w, p) &&
    hasPlace(s, w, p, "docks")
  );
}

/** Whether a line of trade can be run: what's sold, where, and who allows it. */
export function planCheck(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): Check {
  if (!plan || !CO_GOODS[plan.item]) return no("Choose the goods it trades.");
  // ECON (r17): nothing outward is a plan only with something to bring home.
  if (plan.loads === 0 && !plan.back)
    return no("Send something out, or bring something home.");
  if (!CO_LOADS.includes(plan.loads) && plan.loads !== 0)
    return no("Choose a cargo's size.");
  if (!CO_EVERY.includes(plan.every)) return no("Choose how often it sails.");
  if (!companyPort(s, w, plan.from))
    return no("It buys at a port with a market and docks.");
  if (plan.loads > 0 && !soldHere(s, w, plan.from, plan.item))
    return no(
      `${w.map.provinces[plan.from]?.name ?? "That port"} doesn't sell ${goodsName(plan.item).toLowerCase()}.`,
    );
  if (
    HBC_POSTS.has(w.map.provinces[plan.from]?.name ?? "") &&
    year(day) >= 1670
  )
    return no(
      "The Bay is the Hudson's Bay Company's by its charter: no other company trades there.",
    );
  if (plan.to === plan.from) return no("Sell somewhere else than you buy.");
  if (plan.to >= 0) {
    if (!companyPort(s, w, plan.to))
      return no("It sells at a port with a market and docks.");
    const a = nationAt(s, plan.from);
    const b = nationAt(s, plan.to);
    if (
      a >= 0 &&
      b >= 0 &&
      s.wars.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
    )
      return no("An embargo: no ship sails between enemies.");
  } else if (plan.loads > 0 && isWare(plan.item))
    return no(
      `Europe sends ${goodsName(plan.item).toLowerCase()} out; it doesn't buy it back.`,
    );
  else if (plan.loads > 0 && !(GOODS as readonly string[]).includes(plan.item))
    return no("Europe doesn't buy that.");
  // ECON (r17): the return cargo.
  if (plan.back) return backCheck(s, w, plan, day);
  return yes;
}

/** Whether you could set up a company alone, with this much in its chest. */
export function companyCheck(
  s: GameState,
  w: World,
  life: Life,
  plan: CompanyPlan,
  capital: number,
): Check {
  if (!meOf(s, life) || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.travel) return no("Not from the road.");
  if (firmsWith(s, life.c).length >= MAX_FIRMS)
    return no(`You're in ${MAX_FIRMS} partnerships and companies already.`);
  const pc = planCheck(s, w, plan);
  if (!pc.ok) return pc;
  if (plan.from !== life.prov && plan.to !== life.prov)
    return no("Set it up at one of its ports.");
  if (!Number.isFinite(capital) || capital < 0 || capital > 9999)
    return no("How much does it start with?");
  // ECON (r17): with nothing outward, the first cargo is the one bought for home.
  const bp = backPlan(plan);
  const first =
    plan.loads > 0
      ? companyQuote(s, w, plan).cost
      : bp
        ? companyQuote(s, w, bp).cost
        : 0;
  if (capital < first)
    return no(`Its chest must hold a first cargo: ${Math.ceil(first)}.`);
  if (life.purse < capital + CO_SETUP)
    return no(`Setting it up and its chest: ${Math.ceil(capital + CO_SETUP)}.`);
  return yes;
}

/** A company's name: "The Drackley Tobacco Company". */
export function companyTitle(family: string, item: TradeItem): string {
  const short = CO_GOODS[item]?.short ?? "Trading";
  return `The ${family} ${short} Company`.slice(0, 40);
}

/** A company's state, new. */
export function newCompany(plan: CompanyPlan, day: number): CompanyState {
  return { plan: { ...plan }, next: day, voyages: [], made: 0, lost: 0 };
}

/** Set up a company alone: you're its only partner, and it sails at once. */
export function foundCompany(
  g: ConquestGame,
  life: Life,
  plan: CompanyPlan,
  capital: number,
): string | null {
  const s = g.s;
  const check = companyCheck(s, g.w, life, plan, capital);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  spend(g, life, capital + CO_SETUP);
  const f: Firm = {
    id: g.nextId(),
    name: companyTitle(me.family, plan.item),
    hold: "company",
    biz: null,
    prov: plan.from,
    partners: [
      {
        c: life.c,
        share: 100,
        role: "managing",
        capital,
        since: s.day,
        drawn: 0,
      },
    ],
    chest: capital,
    debt: 0,
    rule: "majority",
    lawyer: -1,
    drafted: -1,
    founded: s.day,
    status: "trading",
    cargo: null,
    books: [],
    decisions: [],
    lines: [],
    co: newCompany(plan, s.day),
  };
  partners(g).firms.push(f);
  partnersChanged(g, "f");
  firmLine(
    g,
    f,
    `Set up by ${charName(me)} to trade ${goodsName(plan.item).toLowerCase()} from ${placeName(s, g.w, plan.from, plan.from)} to ${placeName(s, g.w, plan.to, plan.from)}, with ${capital} in its chest.`,
  );
  journal(
    g,
    life,
    `You set up ${f.name} (${CO_SETUP} for the counting room and its books), with ${capital} in its chest: ${goodsName(plan.item).toLowerCase()} from ${placeName(s, g.w, plan.from, plan.from)} to ${placeName(s, g.w, plan.to, plan.from)}, a cargo every ${plan.every === 1 ? "month" : `${plan.every} months`}.`,
    "good",
  );
  milestone(g, life, "business", `Set up ${f.name}`, plan.from); // STORY (r17): was "job"
  rumour(
    g,
    plan.from,
    `${charName(me)} has set up a company to trade ${goodsName(plan.item).toLowerCase()}.`,
    me.id,
    "good",
  );
  companyDaily(g, f);
  return null;
}

/** Change what a company trades (its managing partner does). */
export function changePlan(
  g: ConquestGame,
  life: Life,
  f: Firm,
  plan: CompanyPlan,
): string | null {
  if (f.hold !== "company" || !f.co || f.status !== "trading")
    return "Not a trading company.";
  const me = f.partners.find((p) => p.c === life.c);
  if (!me) return "You're not a partner.";
  if (me.role !== "managing") return "Its managing partner sets its trade.";
  const check = planCheck(g.s, g.w, plan);
  if (!check.ok) return check.why;
  f.co.plan = { ...plan };
  f.prov = plan.from;
  firmLine(
    g,
    f,
    `It trades ${goodsName(plan.item).toLowerCase()} from ${placeName(g.s, g.w, plan.from, plan.from)} to ${placeName(g.s, g.w, plan.to, plan.from)} now, ${plan.loads} loads every ${plan.every === 1 ? "month" : `${plan.every} months`}.`,
  );
  partnersChanged(g, "f");
  return null;
}

// ---------------------------------------------------------------- ECON (r17): the return cargo

/** Days a homeward cargo waits in the far port while the ship unloads and takes it on. */
export const CO_LAY_DAYS = 10;
/** What Europe's merchants ask for their own wares, against a ware's price where it's neither made nor wanted. */
export const CO_EUROPE_WARE = 0.6;
/** What a correspondent pays for ironmongery, arms and cloth at prime cost, against Europe's price. */
export const CO_EUROPE_PRIME = 0.85;
/**
 * The return cargo's freight in the ship chartered for the round voyage,
 * against a cargo's own (she'd come home in ballast otherwise).
 */
export const CO_BACK_FREIGHT = 0.5;
/** What each nation's merchants in Europe ship to its colonies (besides ironmongery, arms and cloth). */
const EUROPE_WARES: Record<string, TradeItem[]> = {
  england: ["woollens"],
  france: ["brandy", "wine"],
  spain: ["wine"],
  netherlands: ["finecloth", "spices", "gin"],
  portugal: ["wine"],
  sweden: ["iron"],
};

/** The goods a nation's merchants in Europe ship out to its colonies. */
export function europeSends(key: string): TradeItem[] {
  return ["tools", "guns", "cloth", ...(EUROPE_WARES[key] ?? [])];
}

/** What a company's correspondent pays in Europe for its nation's goods, with his commission. */
export function europeBuy(
  s: GameState,
  key: string,
  item: TradeItem,
  loads: number,
): number {
  const each = isWare(item)
    ? WARES[item].base * CO_EUROPE_WARE
    : europePrice(s, item as Good).total * CO_EUROPE_PRIME;
  void key;
  return r2(each * loads * (1 + CO_EUROPE_CUT));
}

/** Loads of the return cargo. */
export function backLoadsOf(plan: CompanyPlan): number {
  return plan.backLoads ?? (plan.loads || 10);
}

/** The homeward leg of a plan: its return goods, from where the outward cargo is sold, home. */
export function backPlan(plan: CompanyPlan): CompanyPlan | null {
  if (!plan.back) return null;
  return {
    item: plan.back,
    from: plan.to,
    to: plan.from,
    loads: backLoadsOf(plan),
    every: plan.every,
    ...(plan.loads > 0 ? { round: true } : {}),
  };
}

/** Whether a plan's return cargo can be had: sold at the far end, and allowed home. */
export function backCheck(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): Check {
  const item = plan.back;
  if (!item) return yes;
  if (!CO_GOODS[item]) return no("Choose the goods it brings home.");
  if (!CO_LOADS.includes(backLoadsOf(plan)))
    return no("Choose the return cargo's size.");
  if (plan.to < 0) {
    const key = keyAt(s, plan.from);
    if (!europeSends(key).includes(item))
      return no(
        `${europePort(key, day)} doesn't ship ${goodsName(item).toLowerCase()} to the colonies.`,
      );
    return yes;
  }
  if (!soldHere(s, w, plan.to, item))
    return no(
      `${w.map.provinces[plan.to]?.name ?? "That port"} doesn't sell ${goodsName(item).toLowerCase()}.`,
    );
  return yes;
}

/** The chance the outward ship gets to the far port at all (spoiled or not): a return cargo waits on her. */
function shipThere(s: GameState, w: World, plan: CompanyPlan, day: number) {
  if (plan.loads === 0) return 1;
  const k = voyageRisks(s, w, plan, day);
  return Math.max(0, 1 - k.lost - k.taken - k.seized);
}

/**
 * What the return cargo adds to a round voyage once it's going, risks and
 * all: its own expected gain (only if it would pay, as its factors buy it
 * only then), as often as the outward ship gets there.
 */
export function backShare(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): number {
  const bp = backPlan(plan);
  if (!bp || !backCheck(s, w, plan, day).ok) return 0;
  return r2(
    shipThere(s, w, plan, day) * Math.max(0, steadyGain(s, w, bp, day)),
  );
}

/** Risk and reward of the homeward leg, before you commit (the same table it's rolled from). */
export function backOdds(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): OddsView | null {
  const bp = backPlan(plan);
  if (!bp) return null;
  const o = companyOdds(s, w, bp, day);
  const there = shipThere(s, w, plan, day);
  const far = placeName(s, w, plan.to, plan.from, day);
  const steady = steadyGain(s, w, bp, day);
  return {
    ...o,
    title: `Home: ${goodsName(bp.item).toLowerCase()} from ${far} to ${placeName(s, w, plan.from, plan.from, day)}`,
    costMonth: 0,
    net: r1((Math.max(0, steady) * there) / plan.every),
    factors: [
      plan.loads > 0
        ? `Bought at ${far} with what the outward cargo fetched there, when she gets there (${chanceWords(there)} voyages), and shipped home ${CO_LAY_DAYS} days later.`
        : `Nothing goes out: the factor at ${far} buys on the company's bills and ships it home.`,
      ...o.factors.filter((f) => !/^Its factors: /.test(f)),
    ],
  };
}

/** The outward leg when nothing goes out: no cargo, no risk to it. */
function ballastOdds(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day: number,
): OddsView {
  const bp = backPlan(plan);
  const q = bp ? companyQuote(s, w, bp, day) : null;
  const wages = companyWages(plan);
  const back = backShare(s, w, plan, day);
  return {
    title: `Nothing out from ${placeName(s, w, plan.from, plan.from, day)}`,
    ok: true,
    costNow: r1(q?.cost ?? 0),
    costMonth: wages,
    per: "trip",
    days: q ? [q.days, q.days] : undefined,
    outcomes: [
      {
        label: "nothing sent out",
        p: 1,
        lo: 0,
        hi: 0,
        note: "its factor at the far port buys the return cargo on the company's bills",
      },
    ],
    expected: 0,
    lo: 0,
    hi: 0,
    net: r1(back / plan.every - wages),
    risks: [],
    factors: [
      `Nothing goes out from ${placeName(s, w, plan.from, plan.from, day)}: the company only brings goods home.`,
      `Its factors: ${factorsOf(plan)} at ${CO_FACTOR} a month each.`,
    ],
  };
}

/** The best goods to bring home on a line of trade, if any pays (for the window's suggestion). */
export function backChoices(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): { item: TradeItem; gain: number }[] {
  const out: { item: TradeItem; gain: number }[] = [];
  const items =
    plan.to < 0
      ? europeSends(keyAt(s, plan.from))
      : (Object.keys(CO_GOODS) as TradeItem[]).filter((g) =>
          soldHere(s, w, plan.to, g),
        );
  for (const item of items) {
    if (!CO_GOODS[item]) continue;
    const p = { ...plan, back: item };
    if (!backCheck(s, w, p, day).ok) continue;
    const bp = backPlan(p)!;
    out.push({ item, gain: r1(steadyGain(s, w, bp, day)) });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** The return cargo's expected gain at today's prices, as often as the ship gets there (0 if it wouldn't pay). */
export function backNow(
  s: GameState,
  w: World,
  plan: CompanyPlan,
  day = s.day,
): number {
  const bp = backPlan(plan);
  if (!bp || !backCheck(s, w, plan, day).ok) return 0;
  const o = companyOdds(s, w, bp, day);
  if (o.expected < o.costNow * CO_MARGIN) return 0;
  return r2(shipThere(s, w, plan, day) * o.expected);
}

/** Each leg's record, made the first time it's needed. */
function legsOf(co: CompanyState): CompanyLegs {
  return (co.legs ??= {
    out: { n: 0, cost: 0, sale: 0, lost: 0 },
    back: { n: 0, cost: 0, sale: 0, lost: 0 },
  });
}

/**
 * The return cargo: bought where the outward cargo was sold (or, with nothing
 * outward, by the factor there on the company's bills), and shipped home. Its
 * factors buy only if it would pay, risks and all, and only what the chest
 * can pay for.
 */
function loadBack(g: ConquestGame, f: Firm, from: number, home: number): void {
  const s = g.s;
  const co = f.co!;
  const plan = co.plan;
  if (!plan.back) return;
  const where = placeName(s, g.w, from, home);
  const say = (text: string, tone?: "good" | "bad") => {
    firmLine(g, f, text[0].toUpperCase() + text.slice(1));
    news(g, f, text, tone);
  };
  if (plan.to !== from || plan.from !== home) {
    say(
      `no return cargo from ${where}: its trade has changed since she sailed.`,
    );
    return;
  }
  const check = backCheck(s, g.w, plan);
  if (!check.ok) {
    say(`no return cargo from ${where}: ${check.why}`, "bad");
    return;
  }
  const bp = backPlan(plan)!;
  const q = companyQuote(s, g.w, bp);
  if (f.chest < q.cost) {
    say(
      `no return cargo from ${where}: it costs ${Math.ceil(q.cost)}, and the chest has ${Math.floor(f.chest)}.`,
      "bad",
    );
    return;
  }
  const gain = companyOdds(s, g.w, bp).expected;
  if (gain < q.cost * CO_MARGIN) {
    say(
      `no return cargo from ${where}: at today's prices ${bp.loads} loads of ${goodsName(bp.item).toLowerCase()} would fetch about ${Math.round(q.cost + gain)} at home for the ${Math.round(q.cost)} they'd cost, risks and all. The ship comes home in ballast.`,
      "bad",
    );
    return;
  }
  const moved = priceMove(s, g.w, bp.from, bp.item, bp.loads); // WORK (r21)
  if (bp.from >= 0) marketMove(g, bp.from, bp.item, bp.loads, CO_MOVE);
  f.chest = r2(f.chest - q.cost);
  const v: CompanyVoyage = {
    id: g.nextId(),
    item: bp.item,
    loads: bp.loads,
    cost: q.cost,
    from: bp.from,
    to: bp.to,
    sailed: s.day,
    due: s.day + CO_LAY_DAYS + q.days,
    leg: "back",
  };
  co.voyages.push(v);
  const leg = legsOf(co).back;
  leg.n++;
  leg.cost = r2(leg.cost + q.cost);
  say(
    `homeward: a return cargo of ${bp.loads} loads of ${goodsName(bp.item).toLowerCase()} bought at ${where} for ${Math.round(q.cost)}, for ${placeName(s, g.w, home, home)}.${moved}`,
  );
  partnersChanged(g, "f");
}

// ---------------------------------------------------------------- the days and the months

/** A partner's own news of the company. */
function news(
  g: ConquestGame,
  f: Firm,
  text: string,
  tone?: "good" | "bad",
): void {
  for (const p of f.partners) {
    const l = lifeOfChar(g.s, p.c);
    if (!l || l.watching) continue;
    withFlow(g, { key: "news", label: "", aff: "firm" }, () =>
      journal(g, l, `${f.name}: ${text}`, tone),
    );
  }
}

/** Each day: a cargo sails when it's due, and cargoes come home (or don't). */
export function companyDaily(g: ConquestGame, f: Firm): void {
  const s = g.s;
  const co = f.co;
  if (!co || f.status !== "trading") return;
  // Home, or not.
  const keep: CompanyVoyage[] = [];
  for (const v of co.voyages) {
    if (v.due > s.day) {
      keep.push(v);
      continue;
    }
    arrive(g, f, v);
  }
  if (keep.length !== co.voyages.length) {
    co.voyages = keep;
    partnersChanged(g, "f");
  }
  if (co.next > s.day) return;
  const plan = co.plan;
  const check = planCheck(s, g.w, plan);
  if (!check.ok) {
    co.next = s.day + 30;
    firmLine(g, f, `No cargo this time: ${check.why}`);
    partnersChanged(g, "f");
    return;
  }
  // ECON (r17): nothing outward: the factor at the far port buys the return cargo.
  if (plan.loads === 0) {
    co.next = s.day + Math.round(plan.every * 30.4);
    const n = co.voyages.length;
    loadBack(g, f, plan.to, plan.from);
    if (co.voyages.length > n) co.made++;
    partnersChanged(g, "f");
    return;
  }
  const q = companyQuote(s, g.w, plan);
  if (f.chest < q.cost) {
    co.next = s.day + 30;
    firmLine(
      g,
      f,
      `No cargo this time: it costs ${Math.ceil(q.cost)}, and the chest has ${Math.floor(f.chest)}.`,
    );
    news(
      g,
      f,
      `no cargo sails this month: the chest has ${Math.floor(f.chest)} of the ${Math.ceil(q.cost)} it needs. Call in capital, or send smaller cargoes.`,
      "bad",
    );
    partnersChanged(g, "f");
    return;
  }
  // A sensible factor holds a cargo that wouldn't pay at today's prices
  // (their own buying and selling may have moved them), and tries again.
  // ECON (r17): with a return cargo, the round voyage is what must pay.
  const gain = companyOdds(s, g.w, plan).expected + backNow(s, g.w, plan);
  if (gain < q.cost * CO_MARGIN) {
    co.next = s.day + 15;
    if ((co.held ?? -1e9) + 60 <= s.day) {
      co.held = s.day;
      const text = `no cargo sails just now: at today's prices ${plan.loads} loads of ${goodsName(plan.item).toLowerCase()} would fetch about ${Math.round(q.cost + gain)} for the ${Math.round(q.cost)} they'd cost, risks and all. The factors wait for prices to mend; smaller cargoes, less often, or another market would pay.`;
      firmLine(g, f, text[0].toUpperCase() + text.slice(1));
      news(g, f, text, "bad");
    }
    partnersChanged(g, "f");
    return;
  }
  // Bought at the port (the price there rises), and away.
  const moved = priceMove(s, g.w, plan.from, plan.item, plan.loads); // WORK (r21)
  marketMove(g, plan.from, plan.item, plan.loads, CO_MOVE);
  f.chest = r2(f.chest - q.cost);
  const v: CompanyVoyage = {
    id: g.nextId(),
    item: plan.item,
    loads: plan.loads,
    cost: q.cost,
    from: plan.from,
    to: plan.to,
    sailed: s.day,
    due: s.day + q.days,
    leg: "out", // ECON (r17)
  };
  co.voyages.push(v);
  co.made++;
  // ECON (r17): the outward leg's record.
  const out = legsOf(co).out;
  out.n++;
  out.cost = r2(out.cost + q.cost);
  co.next = s.day + Math.round(plan.every * 30.4);
  firmLine(
    g,
    f,
    `A cargo of ${plan.loads} loads of ${goodsName(plan.item).toLowerCase()} sails for ${placeName(s, g.w, plan.to, plan.from)}: ${Math.round(q.cost)} laid out.${moved}`,
  );
  partnersChanged(g, "f");
}

/**
 * WORK (r21): what a company's own buying (loads > 0) or selling (< 0) does
 * to a port's price, in words for its books and news: " Its buying put the
 * price of tobacco at Jamestown up from 1.2 to 1.5 a load."
 */
export function priceMove(
  s: GameState,
  w: World,
  p: number,
  item: TradeItem,
  loads: number,
): string {
  if (p < 0 || !loads) return "";
  const q = quoteCut(s, w, p, item, loads, CO_CUT, s.day, CO_MOVE);
  if (Math.abs(q.after - q.before) < 0.01) return "";
  return ` Its ${loads > 0 ? "buying put" : "selling brought"} the price of ${goodsName(item).toLowerCase()} at ${w.map.provinces[p]?.name ?? "the port"} ${loads > 0 ? "up" : "down"} from ${q.before} to ${q.after} a load.`;
}

/** A cargo arrives (or doesn't): sold where it's going, its proceeds into the chest. */
function arrive(g: ConquestGame, f: Firm, v: CompanyVoyage): void {
  const s = g.s;
  const co = f.co!;
  const plan: CompanyPlan = {
    ...co.plan,
    item: v.item,
    from: v.from,
    to: v.to,
    loads: v.loads,
  };
  const k = voyageRisks(s, g.w, plan, v.sailed);
  const end = rollVoyage(voyageDice(s, v.id), k);
  const where = placeName(s, g.w, v.to, v.from, v.sailed);
  // ECON (r17): a homeward cargo says so (and where it came from).
  const homeward = v.leg === "back";
  const what = homeward
    ? `${v.loads} loads of ${goodsName(v.item).toLowerCase()} home from ${placeName(s, g.w, v.from, v.to, v.sailed)}`
    : `${v.loads} loads of ${goodsName(v.item).toLowerCase()} for ${where}`;
  let sale = 0;
  let moved = ""; // WORK (r21): what its selling did to the port's price
  let text: string;
  if (end === "home" || end === "spoiled") {
    const loads =
      end === "spoiled"
        ? Math.max(1, Math.round(v.loads * (1 - CO_RISK.spoilPart)))
        : v.loads;
    if (v.to >= 0) {
      sale = quoteCut(
        s,
        g.w,
        v.to,
        v.item,
        -loads,
        CO_CUT,
        s.day,
        CO_MOVE,
      ).total;
      moved = priceMove(s, g.w, v.to, v.item, -loads); // WORK (r21)
      marketMove(g, v.to, v.item, -loads, CO_MOVE);
    } else {
      sale = europeSale(s, v.item, loads);
      if (!isWare(v.item)) {
        s.europe.glut[v.item as Good] =
          (s.europe.glut[v.item as Good] ?? 0) + loads;
        g.europeChanged();
      }
    }
    sale = r2(sale);
    text =
      end === "spoiled"
        ? `the cargo of ${what} came in spoiled in part: ${loads} loads sold for ${Math.round(sale)} (it cost ${Math.round(v.cost)})`
        : `the cargo of ${what} is sold for ${Math.round(sale)} (it cost ${Math.round(v.cost)})`;
  } else {
    co.lost++;
    text =
      end === "lost"
        ? `the cargo of ${what} is lost: the ship went down`
        : end === "taken"
          ? `the cargo of ${what} is taken by a privateer`
          : `the cargo of ${what} is seized by the customs (${k.laws ?? "the laws of trade"})`;
  }
  f.chest = r2(f.chest + sale);
  co.sales = r2((co.sales ?? 0) + sale);
  co.closed = r2((co.closed ?? 0) + v.cost);
  // ECON (r17): each leg's record, and its own words in the news.
  const leg = legsOf(co)[homeward ? "back" : "out"];
  leg.sale = r2(leg.sale + sale);
  if (end !== "home" && end !== "spoiled") leg.lost++;
  const said = `${homeward ? "homeward" : "outward"}: ${text}`;
  (co.notes ??= []).push(said);
  firmLine(g, f, `${said[0].toUpperCase()}${said.slice(1)}.${moved}`);
  news(g, f, `${said}.${moved}`, sale > v.cost ? "good" : "bad");
  // STORY (r17): a great voyage, or a great cargo lost, is in each partner's story.
  if (sale >= v.cost * 1.6 || (sale === 0 && v.cost >= 40))
    for (const pt of f.partners) {
      const l = lifeOfChar(s, pt.c);
      if (!l || l.watching || l.c < 0) continue;
      milestone(
        g,
        l,
        "company",
        `${f.name}: ${said}`,
        homeward ? v.to : v.from,
        {
          quiet: true,
          tone: sale > v.cost ? "good" : "bad",
          big: sale >= v.cost * 2.5 && sale >= 150,
        },
      );
    }
  if (sale >= v.cost * 1.6) {
    rumour(
      g,
      homeward ? v.to : v.from,
      `${f.name} have done handsomely by a cargo of ${goodsName(v.item).toLowerCase()}.`,
      -1,
      "good",
    );
  }
  // ECON (r17): the return cargo, bought where this one was sold.
  if (!homeward && (end === "home" || end === "spoiled"))
    loadBack(g, f, v.to, v.from);
}

/**
 * The month's books of a company: what its cargoes sold for, less what
 * those cargoes cost and its factors' wages (and interest), divided among
 * the partners by share; a loss comes out of the chest, and when the chest is
 * empty it's called from them.
 */
export function companyMonth(g: ConquestGame, f: Firm): number {
  const co = f.co;
  if (!co || f.status !== "trading") return 0;
  const wages = companyWages(co.plan);
  const interest = r2(f.debt * LOAN_RATE);
  f.chest = r2(f.chest - wages - interest);
  const takings = r2(co.sales ?? 0);
  const costs = r2((co.closed ?? 0) + wages + interest);
  const profit = r2(takings - costs);
  const notes = co.notes ?? [];
  delete co.sales;
  delete co.closed;
  delete co.notes;
  if (profit > 0) divide(g, f, Math.min(profit, Math.max(0, f.chest)));
  if (f.chest < 0) {
    const short = r2(-f.chest);
    callIn(g, f, short, `is ${short} coins short this month`);
  }
  book(g, f, takings, costs, profit, notes.join("; ") || undefined);
  if (notes.length || profit)
    for (const p of f.partners)
      tell(
        g,
        p.c,
        `${f.name}'s month: ${takings ? `${Math.round(takings)} from its cargoes, ` : ""}${Math.round(costs)} in costs, ${profit >= 0 ? "+" : "−"}${Math.abs(r1(profit))} all told.`,
        profit < 0 ? "bad" : undefined,
      );
  partnersChanged(g, "f");
  return profit;
}

/** A company's month as it's expected: its wages for certain, its voyages on average. */
export function companyForecast(
  s: GameState,
  w: World,
  f: Firm,
): { fixed: number; expected: number; lo: number; hi: number } {
  const co = f.co;
  if (!co) return { fixed: 0, expected: 0, lo: 0, hi: 0 };
  const o = companyOdds(s, w, co.plan);
  const bo = backOdds(s, w, co.plan); // ECON (r17)
  const fixed = -r2(companyWages(co.plan) + f.debt * LOAN_RATE);
  return {
    fixed,
    // Once it's going at its pace (its own trade settled into the prices).
    // ECON (r17): the return cargo too, on average.
    expected: r2(
      (Math.max(0, steadyGain(s, w, co.plan)) +
        (co.plan.back ? backShare(s, w, co.plan) : 0)) /
        co.plan.every,
    ),
    // ECON (r17): a month may bring both legs home, or lose both.
    lo: r2(fixed + o.lo + (bo ? bo.lo : 0)),
    hi: r2(fixed + o.hi + (bo ? bo.hi : 0)),
  };
}

// ---------------------------------------------------------------- your affairs, and the commands

/** Each company's cargoes at sea, for the tracker (Estate › Ledger). */
function companyAffairs(s: GameState, w: World, life: Life): AffairItem[] {
  const out: AffairItem[] = [];
  for (const f of firmsWith(s, life.c)) {
    if (f.hold !== "company" || !f.co) continue;
    const share = f.partners.find((p) => p.c === life.c)?.share ?? 0;
    for (const v of f.co.voyages) {
      const k = voyageRisks(
        s,
        w,
        { ...f.co.plan, item: v.item, from: v.from, to: v.to, loads: v.loads },
        v.sailed,
      );
      out.push({
        kind: "cargo",
        id: `cv:${v.id}`,
        title: `${f.name}: ${v.loads} loads of ${goodsName(v.item).toLowerCase()}`,
        // ECON (r17): which leg it is.
        what: `${v.leg === "back" ? "homeward, " : f.co.plan.back ? "outward, " : ""}from ${placeName(s, w, v.from, v.leg === "back" ? v.to : v.from, v.sailed)} to ${placeName(s, w, v.to, v.from, v.sailed)}, ${Math.round(v.cost)} laid out (${share}% yours)`,
        status: v.leg === "back" ? "homeward" : "at sea",
        ...(k.taken ? { warn: "Privateers are out in this war" } : {}),
        p: v.from,
        due: v.due,
        go: { tab: "estate", sub: "business" },
      });
    }
  }
  return out;
}
hooks.affairs.push(companyAffairs);

function companyCommand(
  g: ConquestGame,
  life: Life,
  c: import("./Types").LifeCommand,
): string | null | undefined {
  if (c.k !== "business") return undefined;
  switch (c.act) {
    case "company":
      if (!c.plan) return "What will it trade?";
      return withFlow(
        g,
        { key: "biz:company", label: "Setting up a trading company" },
        () => foundCompany(g, life, c.plan!, c.cap ?? 0),
      );
    case "plan": {
      const f = partners(g).firms.find((x) => x.id === c.id);
      if (!f || !c.plan) return "No such company.";
      return changePlan(g, life, f, c.plan);
    }
  }
  return undefined;
}
hooks.command.push(companyCommand);

/** A firm's trading company, if it is one. */
export function companyOf(f: Firm): CompanyState | undefined {
  return f.hold === "company" ? f.co : undefined;
}

/**
 * A sensible line of trade to start from at a port: the goods the port
 * sells that Europe buys dearest against their price here (or, if none, to
 * the nearest other port that pays more).
 */
export function defaultPlan(
  s: GameState,
  w: World,
  p: number,
): CompanyPlan | null {
  const key = `${s.day}:${p}`;
  let memo = PLANS.get(s);
  if (!memo || memo.day !== s.day)
    PLANS.set(s, (memo = { day: s.day, m: new Map() }));
  if (memo.m.has(key)) return memo.m.get(key) ?? null;
  const plan = bestPlan(s, w, p);
  memo.m.set(key, plan);
  return plan;
}

const PLANS = new WeakMap<
  GameState,
  { day: number; m: Map<string, CompanyPlan | null> }
>();

/** The ports a company could sell to from a port: Europe, and the nearest few of the Americas. */
export function companyDests(w: World, s: GameState, p: number): number[] {
  return w.map.provinces
    .map((_, q) => q)
    .filter((q) => q !== p && companyPort(s, w, q))
    .sort((a, b) => km(w, p, a) - km(w, p, b))
    .slice(0, 8);
}

/**
 * The line of trade that pays best from a port once it's going (lawful
 * before smuggling), at a size and pace its markets can bear.
 */
function bestPlan(s: GameState, w: World, p: number): CompanyPlan | null {
  if (!companyPort(s, w, p)) return null;
  let best: { plan: CompanyPlan; gain: number } | null = null;
  // If nothing pays from here just now, the least bad (its odds will say so).
  let least: { plan: CompanyPlan; gain: number } | null = null;
  const near = companyDests(w, s, p);
  for (const item of Object.keys(CO_GOODS) as TradeItem[]) {
    if (!soldHere(s, w, p, item)) continue;
    const dests = [...(isWare(item) ? [] : [-1]), ...near];
    for (const to of dests) {
      for (const loads of [5, 10, 20])
        for (const every of [2, 3]) {
          const plan: CompanyPlan = { item, from: p, to, loads, every };
          if (!planCheck(s, w, plan).ok) continue;
          const steady = steadyGain(s, w, plan);
          const q = companyQuote(s, w, plan);
          const net = steady / every - companyWages(plan);
          if (!least || net > least.gain) least = { plan, gain: net };
          // The first cargo must sail, and the smuggler's risk counts against it.
          const now = companyOdds(s, w, plan).expected;
          if (now < q.cost * CO_MARGIN) continue;
          const lawful = againstTheLaws(s, plan) ? 0.5 : 1;
          const gain =
            (steady / every - companyWages(plan)) * (steady > 0 ? lawful : 1);
          if (!best || gain > best.gain + 0.05) best = { plan, gain };
        }
    }
  }
  return best?.plan ?? least?.plan ?? null;
}
