// Treaties, gifts and land deals between nations, and how nations remember
// what was done to them.

import { proposeTreaty } from "./Events";
import type { ConquestGame } from "./Game";
import {
  buyCheck,
  giftCheck,
  relationOf,
  treatyBetween,
  treatyCheck,
} from "./Queries";
import { DAYS_PER_YEAR, INTEGRATE_DAYS } from "./Rules";
import { Command, TreatyKind } from "./Types";

const TREATY_NAMES: Record<TreatyKind, string> = {
  trade: "trade treaty",
  alliance: "alliance",
  access: "right of passage",
};

export function diplomacyMonthly(g: ConquestGame): void {
  const s = g.s;
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
    default:
      return "Unknown command.";
  }
}
