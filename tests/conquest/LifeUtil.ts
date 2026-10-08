// Helpers for Derpy Conquest life tests: a valid character plan, a fresh
// world with a player in it, and ticking time.

import { dayOf } from "../../src/conquest/engine/Calendar";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { lifeOfSeat } from "../../src/conquest/engine/LifeQueries";
import { FRAME_COLORS } from "../../src/conquest/engine/LifeRules";
import { AMERICAS } from "../../src/conquest/engine/Map";
import type {
  BackgroundId,
  Life,
  LifePlan,
  StartYear,
} from "../../src/conquest/engine/Types";

export const map = AMERICAS;

export function prov(name: string): number {
  const i = map.provinces.findIndex((p) => p.name === name);
  if (i < 0) throw new Error(`no province ${name}`);
  return i;
}

export function plan(o: Partial<LifePlan> = {}): LifePlan {
  return {
    origin: "england",
    home: prov("Jamestown"),
    first: "Alden",
    family: "Drackley",
    female: false,
    age: 22,
    religion: "anglican",
    face: 0,
    sigil: {
      field: "azure",
      division: "chevron",
      tincture: "or",
      charge: "star",
      chargeTincture: "argent",
    },
    frame: FRAME_COLORS[0],
    motto: "Steady on",
    background: "farmer" as BackgroundId,
    stats: { dip: 6, mar: 6, ste: 6, int: 5, lea: 5 },
    skills: { persuasion: 2, fighting: 1 },
    traits: [],
    ...o,
  };
}

export function world(
  o: {
    start?: StartYear;
    seed?: number;
    plans?: { seat: string; name: string; plan: LifePlan }[];
  } = {},
): ConquestGame {
  const g = ConquestGame.create(
    map,
    { endYear: 1776, difficulty: "normal", seed: o.seed ?? 7, start: o.start },
    o.plans ?? [{ seat: "s1", name: "Alden", plan: plan() }],
  );
  return g;
}

export function lifeOf(g: ConquestGame, seat = "s1"): Life {
  const l = lifeOfSeat(g.s, seat);
  if (!l) throw new Error(`no life for ${seat}`);
  return l;
}

export function ticks(g: ConquestGame, days: number): void {
  for (let i = 0; i < days && !g.s.over; i++) g.tick();
}

/** Run until the first of next month. */
export function toNextMonth(g: ConquestGame): void {
  do g.tick();
  while (
    !g.s.over &&
    new Set([0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]).has(
      ((g.s.day % 365) + 365) % 365,
    ) === false
  );
}

export const YEAR = (y: number) => dayOf(y);
