// A nation's own history, kept as the game goes: the big moments (founding
// colonies, wars and peaces, great battles, land won and lost, successions,
// independence) and how it stood each New Year, for the end-of-game screen.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { nationSettlers, provincesOf } from "./Queries";
import type { GameEvent } from "./Types";

const MAX_MILESTONES = 120;
const MAX_YEARS = 200;
/** Battles this size (both sides together) or bigger are remembered. */
const BIG_BATTLE = 1500;

/** Which nations remember this event, if any. */
function rememberedBy(g: ConquestGame, e: GameEvent): number[] {
  const s = g.s;
  switch (e.k) {
    case "colony": {
      const n = s.nations[e.n];
      const count = n?.stats.coloniesFounded ?? 0;
      return count <= 3 || count % 5 === 0 ? [e.n] : [];
    }
    case "war":
      return [e.n, e.on];
    case "peace":
      return [e.n, e.with];
    case "battle": {
      const r = s.battles.find((b) => b.id === e.id);
      if (!r || r.attacker.men + r.defender.men < BIG_BATTLE) return [];
      return [...e.a, ...e.d];
    }
    case "ceded":
      return [e.n, e.from];
    case "bought":
    case "abandoned":
    case "revolt":
    case "succession":
    case "independence":
    case "crown":
      return [e.n];
    case "fallen":
      return [e.n, e.by];
    case "tributary":
      return [e.n, e.by];
    case "mission":
      return e.result === "done" ? [e.n] : [];
    default:
      return [];
  }
}

export function recordMilestone(g: ConquestGame, e: GameEvent): void {
  for (const n of new Set(rememberedBy(g, e))) {
    const nation = g.s.nations[n];
    if (!nation || nation.kind === "crown") continue;
    const list = g.nation(n).milestones;
    list.push(e);
    if (list.length > MAX_MILESTONES)
      list.splice(0, list.length - MAX_MILESTONES);
  }
}

/** Each 1 January: where every colony stands. */
export function yearlyMarks(g: ConquestGame): void {
  const s = g.s;
  const year = dateOf(s.day).year;
  for (const n of s.nations) {
    if (n.kind !== "power" || !n.alive) continue;
    if (n.yearly.some((y) => y.year === year)) continue;
    const x = g.nation(n.id);
    x.yearly.push({
      year,
      provinces: provincesOf(s, n.id).length,
      settlers: Math.round(nationSettlers(s, n.id)),
      gold: Math.round(n.gold),
      score: n.score,
    });
    if (x.yearly.length > MAX_YEARS) x.yearly.splice(0, 1);
  }
}
