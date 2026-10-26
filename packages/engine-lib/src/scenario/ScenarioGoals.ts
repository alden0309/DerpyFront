import tilesFile from "resources/scenarios/goal-tiles.json";
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

/**
 * Where a goal is: a nation's capital, or a named spot (full-size pixels)
 * and the nation it belongs to at the start (`of`).
 */
export type GoalPlace =
  | { capitalOf: string }
  | { name: string; at: [number, number]; of: string };

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

/** The nation whose place it is at the start. */
export function goalPlaceOf(goal: ScenarioGoal): string {
  return "capitalOf" in goal.place ? goal.place.capitalOf : goal.place.of;
}

const TILES = (
  tilesFile as unknown as {
    tiles: Record<
      string,
      Record<string, { normal: [number, number]; compact: [number, number] }>
    >;
  }
).tiles;

/**
 * The tile that stands for a goal's place, [x, y] in this game's map (a
 * Compact game's or a Normal one's): the one nearest the place that its
 * nation holds at the start, worked out ahead (resources/scenarios/
 * goal-tiles.json, by scripts/scenario-goal-tiles.ts). Null if it has none.
 */
export function goalTileXY(
  scenarioId: string,
  nation: string,
  compact: boolean,
): [number, number] | null {
  const t = Object.prototype.hasOwnProperty.call(TILES, scenarioId)
    ? TILES[scenarioId][nation]
    : undefined;
  if (t === undefined) return null;
  return compact ? t.compact : t.normal;
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
