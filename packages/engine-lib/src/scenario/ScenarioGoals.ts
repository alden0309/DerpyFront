import goalsFile from "resources/scenarios/goals.json";
import { ScenarioData } from "./ScenarioData";

/**
 * DFX (r26): Scenario goals. Each playable scenario nation has one optional
 * historical goal ("Hold Warsaw past minute 20", "Take Paris before minute
 * 25"), in resources/scenarios/goals.json (the format is in that folder's
 * README.md, "Goals"). Meeting it pays GOAL_COINS bonus Derp Coins, once
 * per goal per account; it never decides the war.
 *
 * The engine checks a player's goal as the war goes and writes the tick it
 * was met into their stats (`goal`), which the saved game carries and the
 * server pays from. The client follows the same rules to show the goal's
 * line under the timer. Everything here is pure: the place is a tile, held
 * or not, and the time is ticks since the war began.
 */

/** Bonus Derp Coins for a goal met, once per goal per account. */
export const GOAL_COINS = 75;

/** Ticks a minute (10 a second). */
export const TICKS_PER_MINUTE = 600;

export type GoalKind = "hold" | "take" | "keep";

/** Where a goal is: a nation's capital, or a named spot (full-size pixels). */
export type GoalPlace =
  | { capitalOf: string }
  | { name: string; at: [number, number] };

export interface ScenarioGoal {
  /**
   * hold: hold the place at `minute` (or when the war ends, if sooner);
   * take: hold it at any moment, before `minute` if set;
   * keep: hold it when the war ends.
   */
  kind: GoalKind;
  place: GoalPlace;
  minute?: number;
  /** Your side holding the place counts (not only you). */
  side?: boolean;
  /**
   * When it's checked you must be on this side ("any": on a side at all,
   * which for a neutral means in the war).
   */
  onSide?: string;
}

const GOALS = (
  goalsFile as unknown as {
    goals: Record<string, Record<string, ScenarioGoal>>;
  }
).goals;

/** A scenario nation's goal, or null. */
export function scenarioGoal(
  scenarioId: string | undefined,
  nation: string | undefined,
): ScenarioGoal | null {
  if (scenarioId === undefined || nation === undefined) return null;
  const byNation = Object.prototype.hasOwnProperty.call(GOALS, scenarioId)
    ? GOALS[scenarioId]
    : undefined;
  if (byNation === undefined) return null;
  return Object.prototype.hasOwnProperty.call(byNation, nation)
    ? byNation[nation]
    : null;
}

/** The scenarios' goals, by scenario and nation (for tests and tools). */
export function allScenarioGoals(): Readonly<
  Record<string, Readonly<Record<string, ScenarioGoal>>>
> {
  return GOALS;
}

/** A goal's key: what an account is paid for once ("europe1939:poland"). */
export function goalKey(scenarioId: string, nation: string): string {
  return `${scenarioId}:${nation}`;
}

/** Its words' key in en.json. */
export function goalTextKey(scenarioId: string, nation: string): string {
  return `scenario_goal_text.${scenarioId}.${nation}`;
}

/** The goal's place in full-size map pixels, or null if the data lacks it. */
export function goalPlaceAt(
  data: ScenarioData,
  goal: ScenarioGoal,
): [number, number] | null {
  if ("at" in goal.place) return goal.place.at;
  const key = goal.place.capitalOf;
  const n = data.nations.find((x) => x.key === key);
  return n === undefined ? null : [n.capital[0], n.capital[1]];
}

/** The bits of a map a goal's place needs (a GameMap has them). */
export interface GoalMap {
  width(): number;
  height(): number;
  isLand(ref: number): boolean;
  isImpassable(ref: number): boolean;
}

/** How far (in this map's pixels) a place may be from land. */
const PLACE_SEARCH = 40;

/**
 * The tile a goal's place stands for in this game's map (`scale`: 1, or 2
 * in a Compact game): the passable land tile nearest the spot, searched in
 * square rings, the nearest in each ring winning and the first scanned on a
 * tie. The same on every machine. Null when there's no land near it.
 */
export function goalTile(
  at: readonly [number, number],
  map: GoalMap,
  scale: number,
): number | null {
  const W = map.width();
  const H = map.height();
  const cx = Math.floor(at[0] / scale);
  const cy = Math.floor(at[1] / scale);
  for (let r = 0; r <= PLACE_SEARCH; r++) {
    let best: number | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      const edge = Math.abs(dy) === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r || 1) {
        const x = cx + dx;
        if (x < 0 || x >= W) continue;
        const t = y * W + x;
        if (!map.isLand(t) || map.isImpassable(t)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/** What a goal is checked against at a moment of the war. */
export interface GoalCheck {
  /** Ticks since the war began. */
  elapsed: number;
  /** The place is held: by you, or (a `side` goal) by your side. */
  holds: boolean;
  /** Your side now (a neutral's is null until it joins the war). */
  team: string | null;
}

function onSideOk(goal: ScenarioGoal, team: string | null): boolean {
  if (goal.onSide === undefined) return true;
  if (goal.onSide === "any") return team !== null;
  return team === goal.onSide;
}

/**
 * Whether the goal is met at this check. The checks come every `interval`
 * ticks (a hold goal is judged at the first check from its minute on);
 * `final` is the check at the war's end.
 */
export function goalMetAt(
  goal: ScenarioGoal,
  c: GoalCheck,
  final: boolean,
  interval: number,
): boolean {
  const due =
    goal.minute === undefined ? Infinity : goal.minute * TICKS_PER_MINUTE;
  switch (goal.kind) {
    case "take":
      return c.holds && c.elapsed < due && onSideOk(goal, c.team);
    case "hold":
      if (!c.holds || !onSideOk(goal, c.team)) return false;
      // Its minute came, or the war ended first with the place held.
      return final
        ? c.elapsed < due + interval
        : c.elapsed >= due && c.elapsed < due + interval;
    case "keep":
      return final && c.holds && onSideOk(goal, c.team);
  }
}

/** Whether a goal not met by now can't be any more. */
export function goalMissed(
  goal: ScenarioGoal,
  elapsed: number,
  ended: boolean,
  interval: number,
): boolean {
  if (ended) return true;
  const due =
    goal.minute === undefined ? Infinity : goal.minute * TICKS_PER_MINUTE;
  switch (goal.kind) {
    case "take":
      return elapsed >= due;
    case "hold":
      return elapsed >= due + interval;
    case "keep":
      return false;
  }
}

/**
 * The minute a goal is about (its deadline or its moment), for the line
 * under the timer's countdown; null for "to the end" and "ever".
 */
export function goalMinute(goal: ScenarioGoal): number | null {
  return goal.kind === "keep" ? null : (goal.minute ?? null);
}
