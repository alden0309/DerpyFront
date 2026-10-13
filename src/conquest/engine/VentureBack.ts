// ECON (r17): a sailor's venture for home. A merchant sailor's ship lies a
// few days at the far port while she unloads and takes on her cargo for
// home; the sailor's privilege runs both ways, so a venture of your own can
// go into her hold there: goods bought at the far port's market and sold at
// home (Havana's cochineal for Jamestown, Barbados's sugar for Boston).
//
// It's priced from the two markets as they are (your own merchant's cut on
// each side, and your buying dears the price there as your selling cheapens
// it at home), and rolled on its own dice, when she's home, from the same
// table a company's cargo is (wrecked, taken in a war, seized by the customs
// where the laws of trade forbid it, spoiled in part). The odds are on the
// choice before you buy.

import { formatDate } from "./Calendar";
import {
  CO_RISK,
  goodsName,
  rollVoyage,
  voyageDice,
  voyageRisks,
  type VoyageRisks,
} from "./Company";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { earn, journal, spend, touchLife } from "./LifeCore";
import type { World } from "./Map";
import { ITEMS, marketMove, quote, soldHere } from "./Markets";
import { chanceWords } from "./Odds";
import { seaChanged, seaOf } from "./SeaCore";
import type { GameState, Life, TradeItem, Voyage } from "./Types";
import { stakeFor } from "./Voyages";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** At most this many loads go in a sailor's venture (the hold has its own cargo to carry). */
export const VENTURE_BACK_MAX_LOADS = 6;

/** A venture you could buy at the far port, with what it should come to at home. */
export interface BackOption {
  item: TradeItem;
  loads: number;
  /** What it costs here, and what it would fetch at home at today's prices. */
  cost: number;
  sale: number;
  /** What's expected back, risks and all, less what it cost. */
  expected: number;
  risks: VoyageRisks;
}

/** The voyage a life is on, at the far port, that could take a venture for home. */
export function farVoyage(s: GameState, life: Life): Voyage | undefined {
  return seaOf(s).voyages.find(
    (v) =>
      v.seat === life.seat &&
      v.c === life.c &&
      v.kind === "merchant" &&
      v.phase === "there" &&
      !v.back,
  );
}

/** The three best ventures for home from a voyage's far port (each pays, at today's prices). */
export function backVentures(
  s: GameState,
  w: World,
  life: Life,
  v: Voyage,
): BackOption[] {
  if (v.kind !== "merchant" || v.back) return [];
  const stake = stakeFor(life, "merchant");
  if (!stake) return [];
  const far = v.to;
  const home = v.from;
  const out: BackOption[] = [];
  for (const item of ITEMS) {
    if (!soldHere(s, w, far, item)) continue;
    const one = quote(s, w, life, far, item, 1).total;
    if (one <= 0 || one > stake) continue;
    const loads = Math.min(VENTURE_BACK_MAX_LOADS, Math.floor(stake / one));
    const cost = quote(s, w, life, far, item, loads).total;
    const sale = quote(s, w, life, home, item, -loads).total;
    const risks = voyageRisks(s, w, {
      item,
      from: far,
      to: home,
      loads,
      every: 1,
    });
    const expected = r1(expectedBack(sale, risks) - cost);
    if (expected <= 0) continue;
    out.push({ item, loads, cost, sale, expected, risks });
  }
  return out.sort((a, b) => b.expected - a.expected).slice(0, 3);
}

/** What a venture's sale comes to on average: sold whole, or a third spoiled; lost, nothing. */
export function expectedBack(sale: number, k: VoyageRisks): number {
  const whole = 1 - k.lost - k.taken - k.seized - k.spoil;
  return sale * whole + sale * (1 - CO_RISK.spoilPart) * k.spoil;
}

/** The odds of a venture for home, in words (on its choice). */
export function backOddsWords(o: BackOption): string {
  const k = o.risks;
  const lost = k.lost + k.taken + k.seized;
  return `${o.loads} load${o.loads === 1 ? "" : "s"} for ${r1(o.cost)}; sold at home today they'd fetch ${r1(o.sale)}, about ${o.expected >= 0 ? "+" : ""}${o.expected} risks and all. Lost ${chanceWords(lost)} (${[
    "overboard in a blow",
    ...(k.taken ? ["privateers"] : []),
    ...(k.seized ? ["the customs"] : []),
  ].join(
    ", ",
  )}); spoiled in part ${chanceWords(k.spoil)}. Prices may move before she's home.`;
}

/** At the far port: the scene, if a venture would pay. */
export function offerVentureBack(g: ConquestGame, life: Life, v: Voyage): void {
  if (v.kind !== "merchant" || life.watching) return;
  if (life.events.some((e) => e.key === "econ-venture")) return;
  if (!backVentures(g.s, g.w, life, v).length) return;
  raiseEvent(g, life, "econ-venture", { v: v.id });
}

/** Buy a venture for home at the far port. */
export function buyVentureBack(
  g: ConquestGame,
  life: Life,
  id: number,
  item: TradeItem,
): string | null {
  const s = g.s;
  const v = seaOf(s).voyages.find((x) => x.id === id && x.seat === life.seat);
  if (!v || v.kind !== "merchant" || v.phase !== "there")
    return "She isn't lying at the far port now.";
  if (v.back) return "You have a venture in her hold for home already.";
  if (life.prov !== v.to) return `Be at ${g.map.provinces[v.to]?.name}.`;
  const o = backVentures(s, g.w, life, v).find((x) => x.item === item);
  if (!o) return "That wouldn't pay just now.";
  if (life.purse < o.cost) return `It costs ${r1(o.cost)}.`;
  withFlow(
    g,
    { key: `voy:${v.id}:back`, label: "A venture for home", aff: "sea" },
    () => spend(g, life, o.cost),
  );
  // Your buying dears the price here.
  marketMove(g, v.to, item, o.loads);
  v.back = {
    item,
    stake: o.cost,
    loads: o.loads,
    from: v.to,
    sailed: Math.max(s.day, v.sails),
  };
  seaChanged(g);
  touchLife(g, life);
  journal(
    g,
    life,
    `You put ${o.loads} load${o.loads === 1 ? "" : "s"} of ${goodsName(item).toLowerCase()} into the ${v.ship}'s hold for home (${r1(o.cost)} coins); she sails ${formatDate(v.sails)}.`,
  );
  return null;
}

/**
 * Home (or she came home without you, `mult` 0.8 for the master's trouble):
 * the venture is sold at home's market as it is now, or lost on the way.
 */
export function settleVentureBack(
  g: ConquestGame,
  v: Voyage,
  life: Life,
  mult: number,
): string {
  const s = g.s;
  const b = v.back;
  if (!b) return "";
  const k = voyageRisks(
    s,
    g.w,
    { item: b.item, from: b.from, to: v.from, loads: b.loads, every: 1 },
    b.sailed,
  );
  const end = rollVoyage(voyageDice(s, v.id + 0x51ed), k);
  const what = `your venture for home, ${b.loads} load${b.loads === 1 ? "" : "s"} of ${goodsName(b.item).toLowerCase()}`;
  if (end !== "home" && end !== "spoiled") {
    seaChanged(g);
    return `${what}: ${end === "lost" ? "thrown overboard in a blow to lighten her" : end === "taken" ? "taken by a privateer, who let the ship go" : "seized by the customs at the far port's bar"}`;
  }
  const loads =
    end === "spoiled"
      ? Math.max(1, Math.round(b.loads * (1 - CO_RISK.spoilPart)))
      : b.loads;
  const sale = r1(quote(s, g.w, life, v.from, b.item, -loads).total * mult);
  // Your selling cheapens the price at home.
  marketMove(g, v.from, b.item, -loads);
  if (sale > 0)
    withFlow(
      g,
      {
        key: `voy:${v.id}:back`,
        label: "A venture for home",
        chance: true,
        aff: "sea",
      },
      () => earn(g, life, sale),
    );
  seaChanged(g);
  return `${what}${end === "spoiled" ? ", a third of it spoiled," : ""} sold for ${sale} (it cost ${r1(b.stake)})`;
}
