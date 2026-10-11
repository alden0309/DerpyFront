// POWER (r12): the track's own bookkeeping. Where its state lives in the
// game (the council, bills, trials, newspapers, the papers' sway at the
// polls), its own dice (so its doings don't shift the rest of the world's
// luck), and the delta that carries its changes to players.

import type { ConquestGame } from "./Game";
import { Rng } from "./Rng";
import type {
  Cabinet,
  GameState,
  Paper,
  PowerDelta,
  PowerState,
  Trial,
} from "./Types";

const CHANGED = new WeakMap<ConquestGame, Set<string>>();

/** Note what changed: "c<n>" a council, "t" the trials, "p" the papers, "s" the sway. */
export function powerChanged(g: ConquestGame, key: string): void {
  let set = CHANGED.get(g);
  if (!set) CHANGED.set(g, (set = new Set()));
  set.add(key);
}

/** The state, made the first time it's needed. */
export function power(g: ConquestGame): PowerState {
  const s = g.s;
  if (!s.power) {
    s.power = { cabinets: {}, trials: [], papers: [], sway: {}, dunned: {} };
    powerChanged(g, "t");
    powerChanged(g, "p");
    powerChanged(g, "s");
  }
  s.power.dunned ??= {};
  return s.power;
}

/** Read-only views, for the engine's queries and the browser. */
export const cabinetOf = (s: GameState, n: number): Cabinet | undefined =>
  s.power?.cabinets[n];
export const trialsOf = (s: GameState): Trial[] => s.power?.trials ?? [];
export const papersOf = (s: GameState): Paper[] => s.power?.papers ?? [];

/** What changed since the last call, for the players (and clears it). */
export function takePowerDelta(g: ConquestGame): PowerDelta | undefined {
  const keys = CHANGED.get(g);
  const ps = g.s.power;
  if (!keys?.size || !ps) return undefined;
  const d: PowerDelta = {};
  for (const k of keys) {
    if (k === "t") d.trials = ps.trials;
    else if (k === "p") d.papers = ps.papers;
    else if (k === "s") d.sway = ps.sway;
    else if (k.startsWith("c")) {
      const n = Number(k.slice(1));
      if (ps.cabinets[n]) (d.cabinets ??= {})[n] = ps.cabinets[n];
    }
  }
  keys.clear();
  return d;
}

export function applyPowerDelta(s: GameState, d: PowerDelta): void {
  s.power ??= { cabinets: {}, trials: [], papers: [], sway: {}, dunned: {} };
  if (d.trials) s.power.trials = d.trials;
  if (d.papers) s.power.papers = d.papers;
  if (d.sway) s.power.sway = d.sway;
  if (d.cabinets)
    for (const [n, c] of Object.entries(d.cabinets))
      s.power.cabinets[Number(n)] = c;
}

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * The track's own dice: seeded afresh each day from the game's seed (with a
 * salt of its own), so they never touch the world's dice and need nothing
 * saved.
 */
export function pdice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 0x2c1b3c6d) ^
          Math.imul(s.day + 4271, 0x297a2d39) ^
          0x7f4a7c15) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

// ---------------------------------------------------------------- sway at the polls

/** How the papers (and a friendly sheriff) have moved a person's chances at the polls. */
export function swayOf(s: GameState, c: number): number {
  const x = s.power?.sway[c];
  return x && x.until > s.day ? x.v : 0;
}

/** Add to someone's sway at the polls (it fades after a year and a half). */
export function addSway(g: ConquestGame, c: number, v: number): void {
  const ps = power(g);
  const s = g.s;
  const cur = swayOf(s, c);
  const next = Math.max(-30, Math.min(30, Math.round((cur + v) * 10) / 10));
  ps.sway[c] = { v: next, until: s.day + 540 };
  // Drop the faded, so the record stays small.
  for (const k of Object.keys(ps.sway))
    if (ps.sway[Number(k)].until <= s.day) delete ps.sway[Number(k)];
  powerChanged(g, "s");
}
