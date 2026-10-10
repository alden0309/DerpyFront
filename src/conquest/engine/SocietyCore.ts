// Society's own bookkeeping: where its state lives in the game, its own
// dice (so letters, gatherings and offices don't shift the rest of the
// world's luck), and the delta that carries its changes to players.

import type { ConquestGame } from "./Game";
import { Rng } from "./Rng";
import type { GameState, SocietyDelta, SocietyState } from "./Types";

/** The society state, made the first time it's needed (and sent to players). */
export function society(g: ConquestGame): SocietyState {
  const s = g.s;
  if (!s.society) {
    s.society = { offices: {}, gatherings: [] };
    g.societyChanged("g");
  }
  return s.society;
}

const DICE = new WeakMap<ConquestGame, { day: number; rng: number }>();

/**
 * Society's own dice: seeded afresh each day from the game's seed, so they
 * never touch the world's dice and need nothing saved.
 */
export function dice(g: ConquestGame): Rng {
  const s = g.s;
  let d = DICE.get(g);
  if (!d || d.day !== s.day) {
    d = {
      day: s.day,
      rng:
        (Math.imul(s.settings.seed | 0, 2654435761) ^
          Math.imul(s.day + 7919, 0x5eed50c)) |
        0,
    };
    DICE.set(g, d);
  }
  return new Rng(d);
}

/** Read-only: the offices of a province (none if never filled). */
export function officesIn(s: GameState, p: number) {
  return s.society?.offices[p] ?? [];
}

export function gatheringsOf(s: GameState) {
  return s.society?.gatherings ?? [];
}

/** A number in [0, 1) from a few integers: the same everywhere, no dice used. */
export function hash01(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

/** What changed, for the delta: "g" (gatherings) and "o<p>" (a province's offices). */
export function societyDelta(s: GameState, keys: Set<string>): SocietyDelta {
  const soc = s.society;
  const d: SocietyDelta = {};
  if (!soc) return d;
  for (const k of keys) {
    if (k === "g") d.gatherings = soc.gatherings;
    else if (k.startsWith("o")) {
      const p = Number(k.slice(1));
      (d.offices ??= {})[p] = soc.offices[p] ?? [];
    }
  }
  return d;
}

export function applySocietyDelta(s: GameState, d: SocietyDelta): void {
  s.society ??= { offices: {}, gatherings: [] };
  if (d.gatherings) s.society.gatherings = d.gatherings;
  if (d.offices)
    for (const [p, list] of Object.entries(d.offices))
      s.society.offices[Number(p)] = list;
}
