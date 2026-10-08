// Treaties, gifts and land deals between nations, and how nations remember
// what was done to them.

import { goodsMoved, tally } from "./Economy";
import { proposeTreaty } from "./Events";
import type { ConquestGame } from "./Game";
import {
  buyCheck,
  giftCheck,
  relationOf,
  treatyBetween,
  treatyCheck,
  tributeCheck,
} from "./Queries";
import { DAYS_PER_YEAR, INTEGRATE_DAYS } from "./Rules";
import { Command, TreatyKind } from "./Types";
import { startWar } from "./War";

const TREATY_NAMES: Record<TreatyKind, string> = {
  trade: "trade treaty",
  alliance: "alliance",
  access: "right of passage",
};

/** Native nation `n` pays `by` tribute from now on. */
export function makeTributary(g: ConquestGame, n: number, by: number): void {
  const s = g.s;
  const t = g.nation(n);
  t.overlord = by;
  (t.relations[by] ??= []).push({
    of: -1,
    why: "Made us pay tribute",
    value: -15,
    until: s.day + 15 * DAYS_PER_YEAR,
  });
  g.event({ k: "tributary", day: s.day, n, by, free: false });
}

function setFree(
  g: ConquestGame,
  n: number,
  reason: "released" | "rose",
): void {
  const s = g.s;
  const t = g.nation(n);
  const by = t.overlord;
  t.overlord = -1;
  if (by >= 0 && reason === "released")
    (t.relations[by] ??= []).push({
      of: -1,
      why: "Released us from tribute",
      value: 20,
      until: s.day + 15 * DAYS_PER_YEAR,
    });
  g.event({ k: "tributary", day: s.day, n, by, free: true });
}

/** A month of tribute: a fifth of their gold and a third of their furs. */
function tributeMonthly(g: ConquestGame): void {
  const s = g.s;
  for (const t of s.nations) {
    if (!t.alive || t.overlord < 0) continue;
    const lord = s.nations[t.overlord];
    if (!lord?.alive || lord.kind !== "power") {
      setFree(g, t.id, "rose");
      continue;
    }
    const x = g.nation(t.id);
    const L = g.nation(lord.id);
    const gold = Math.max(0, Math.round(x.gold * 0.2 * 10) / 10);
    if (gold > 0) {
      x.gold -= gold;
      L.gold += gold;
      tally(g, lord.id, `Tribute from the ${t.name}`, gold);
    }
    const furs = Math.floor(x.market.stock.furs / 3);
    if (furs > 0) {
      x.market.stock.furs -= furs;
      L.market.stock.furs += furs;
      goodsMoved(g, lord.id, "furs", furs, "came");
    }
    // Resentment boils over when the overlord seems far away or weak.
    const opinion = relationOf(s, g.w, t.id, lord.id).total;
    if (opinion < -50 && g.rng.chance(0.04)) {
      setFree(g, t.id, "rose");
      if (
        !s.wars.some(
          (w) =>
            (w.a === t.id && w.b === lord.id) ||
            (w.b === t.id && w.a === lord.id),
        )
      )
        startWar(g, t.id, lord.id, "Throwing off the yoke", false);
    }
  }
}

export function diplomacyMonthly(g: ConquestGame): void {
  const s = g.s;
  tributeMonthly(g);
  for (const n of s.nations) {
    if (!n.alive) continue;
    let changed = false;
    for (const [k, list] of Object.entries(n.relations)) {
      const keep = list.filter((m) => m.until === 0 || m.until > s.day);
      if (keep.length !== list.length) {
        n.relations[Number(k)] = keep;
        changed = true;
      }
    }
    if (changed) g.nation(n.id);
  }
  // Treaties fall apart when one side comes to hate the other.
  for (const t of [...s.treaties]) {
    const ab = relationOf(s, g.w, t.a, t.b).total;
    const ba = relationOf(s, g.w, t.b, t.a).total;
    if (Math.min(ab, ba) < -40) {
      s.treaties = s.treaties.filter((x) => x !== t);
      g.treatiesChanged();
      const breaker = ab < ba ? t.a : t.b;
      g.event({
        k: "untreaty",
        day: s.day,
        n: breaker,
        with: breaker === t.a ? t.b : t.a,
        t: t.kind,
      });
    }
  }
}

export function diplomacyCommand(
  g: ConquestGame,
  n: number,
  c: Command,
): string | null {
  const s = g.s;
  switch (c.k) {
    case "treaty": {
      if (!(c.t in TREATY_NAMES)) return "No such treaty.";
      const other = s.nations[c.n];
      const check = treatyCheck(s, g.w, n, c.n, c.t);
      // Another player decides for themselves, whatever their people think.
      if ((other?.player ?? null) !== null && !check.ok && check.willing) {
        proposeTreaty(g, n, c.n, c.t);
        return null;
      }
      if (!check.ok) return check.why;
      if (other.player !== null) {
        proposeTreaty(g, n, c.n, c.t);
        return null;
      }
      s.treaties.push({ kind: c.t, a: n, b: c.n, since: s.day });
      g.treatiesChanged();
      g.event({ k: "treaty", day: s.day, n, with: c.n, t: c.t });
      return null;
    }
    case "untreaty": {
      const t = treatyBetween(s, n, c.n, c.t);
      if (!t) return `You have no ${TREATY_NAMES[c.t]} with them.`;
      s.treaties = s.treaties.filter((x) => x !== t);
      g.treatiesChanged();
      const other = g.nation(c.n);
      (other.relations[n] ??= []).push({
        of: -1,
        why: `Broke our ${TREATY_NAMES[c.t]}`,
        value: c.t === "alliance" ? -30 : -15,
        until: s.day + 5 * DAYS_PER_YEAR,
      });
      g.event({ k: "untreaty", day: s.day, n, with: c.n, t: c.t });
      return null;
    }
    case "gift": {
      const check = giftCheck(s, n, c.n, c.gold);
      if (!check.ok) return check.why;
      const gold = Math.round(c.gold);
      g.nation(n).gold -= gold;
      const other = g.nation(c.n);
      other.gold += gold;
      const wealth = Math.max(30, other.kind === "native" ? 40 : other.gold);
      const value = Math.round(Math.min(40, (gold / wealth) * 25));
      (other.relations[n] ??= []).push({
        of: -1,
        why: `A gift of ${gold} gold`,
        value,
        until: s.day + 3 * DAYS_PER_YEAR,
      });
      g.event({ k: "gift", day: s.day, n, to: c.n, gold });
      return null;
    }
    case "buy": {
      const check = buyCheck(s, g.w, n, c.p);
      if (!check.ok) return check.why;
      const pr = g.prov(c.p);
      const seller = pr.owner;
      const price = check.price!;
      g.nation(n).gold -= price;
      const sellerNation = g.nation(seller);
      sellerNation.gold += price;
      pr.owner = n;
      pr.occupier = -1;
      pr.integrate = s.day + INTEGRATE_DAYS;
      const buyer = g.nation(n);
      buyer.stats.landBought++;
      (sellerNation.relations[n] ??= []).push({
        of: -1,
        why: `Sold them ${g.map.provinces[c.p].name}`,
        value: -10,
        until: s.day + 10 * DAYS_PER_YEAR,
      });
      g.event({
        k: "bought",
        day: s.day,
        n,
        p: c.p,
        from: seller,
        gold: price,
      });
      return null;
    }
    case "tribute": {
      const check = tributeCheck(s, g.w, n, c.n);
      if (check.ok) {
        makeTributary(g, c.n, n);
        return null;
      }
      if (!check.willing) return check.why;
      // They refuse, and remember being asked.
      const other = g.nation(c.n);
      (other.relations[n] ??= []).push({
        of: -1,
        why: "Demanded tribute",
        value: -10,
        until: s.day + 5 * DAYS_PER_YEAR,
      });
      g.event({ k: "refused", day: s.day, n, by: c.n });
      return null;
    }
    case "release": {
      const t = s.nations[c.n];
      if (!t || t.overlord !== n) return "They don't pay you tribute.";
      setFree(g, c.n, "released");
      return null;
    }
    default:
      return "Unknown command.";
  }
}
