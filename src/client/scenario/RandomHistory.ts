import {
  allScenarioData,
  isPlayable,
  type ScenarioData,
  type ScenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import sizesFile from "resources/scenarios/sizes.json";

/**
 * DFX (r26): Random history. A quick play that picks a random Scenario and a
 * random nation in it to play solo ("You are Poland, 1 September 1939"),
 * and in a scenario lobby, "Random nations" deals the players onto random
 * free seats.
 *
 * Only nations a newcomer can do something with: a nation on a side needs
 * at least SIDE_MIN_SHARE of the land the scenario's sides hold at the
 * start, and a neutral at least NEUTRAL_MIN_SHARE (sizeable ones only).
 * Each nation's starting land is in resources/scenarios/sizes.json (made by
 * scripts/scenario-sizes.ts, checked by its test).
 */

/** A side's nation: at least this share of the land all sides hold. */
export const SIDE_MIN_SHARE = 0.015;
/** A neutral: at least this share of the land all sides hold. */
export const NEUTRAL_MIN_SHARE = 0.05;

/** A random number in [0, 1). */
export type Rand = () => number;

export interface HistoryPick {
  id: string;
  nation: string;
}

const SIZES = (
  sizesFile as { scenarios: Record<string, Record<string, number>> }
).scenarios;

/** A nation's starting land (map4x tiles), or 0 if it isn't known. */
export function nationLand(scenarioId: string, nation: string): number {
  return SIZES[scenarioId]?.[nation] ?? 0;
}

/** The land the scenario's sides hold at the start (neutrals not counted). */
export function sideLand(data: ScenarioData): number {
  let total = 0;
  for (const n of data.nations)
    if (n.side !== null) total += nationLand(data.id, n.key);
  return total;
}

/** The least starting land a nation needs to be dealt by Random history. */
export function minLandFor(data: ScenarioData, n: ScenarioNation): number {
  const share = n.side === null ? NEUTRAL_MIN_SHARE : SIDE_MIN_SHARE;
  return sideLand(data) * share;
}

/** Whether Random history may deal this nation: playable, and big enough. */
export function isEligible(data: ScenarioData, n: ScenarioNation): boolean {
  if (!isPlayable(n)) return false;
  const land = nationLand(data.id, n.key);
  return land > 0 && land >= minLandFor(data, n);
}

// The data never changes: each scenario's list is worked out once.
const eligibleCache = new Map<string, ScenarioNation[]>();

export function eligibleNations(data: ScenarioData): ScenarioNation[] {
  let list = eligibleCache.get(data.id);
  if (list === undefined) {
    list = data.nations.filter((n) => isEligible(data, n));
    eligibleCache.set(data.id, list);
  }
  return list;
}

/** The scenarios with a nation to deal, in the menu's order. */
export function eligibleScenarios(): ScenarioData[] {
  return allScenarioData().filter((d) => eligibleNations(d).length > 0);
}

function pickOf<T>(list: readonly T[], rand: Rand): T {
  const i = Math.min(list.length - 1, Math.floor(rand() * list.length));
  return list[i];
}

/**
 * A random scenario (each as likely), then a random nation in it (each
 * eligible one as likely). `avoid` (the pick being rerolled) isn't dealt
 * again while anything else can be.
 */
export function pickRandomHistory(
  rand: Rand = Math.random,
  avoid: HistoryPick | null = null,
): HistoryPick {
  const scenarios = eligibleScenarios();
  if (scenarios.length === 0) throw new Error("no scenario to pick");
  const total = scenarios.reduce((n, d) => n + eligibleNations(d).length, 0);
  for (let tries = 0; ; tries++) {
    const data = pickOf(scenarios, rand);
    const nation = pickOf(eligibleNations(data), rand);
    const pick = { id: data.id, nation: nation.key };
    const same =
      avoid !== null && avoid.id === pick.id && avoid.nation === pick.nation;
    if (!same || total <= 1 || tries >= 50) return pick;
  }
}

function shuffle<T>(list: readonly T[], rand: Rand): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * "Random nations" in a scenario lobby: every player (`players`: clientIDs)
 * dealt a random free seat, spread over the sides so they're mixed (each in
 * turn to the side with the fewest dealt so far). With `keepTogether`, the
 * `friends` (the host's party, or friends) go onto one side and everyone
 * else is spread as before. Eligible nations (big enough) are dealt first,
 * and the rest only when those run out; neutrals only when the sides are
 * full. Returns nation key -> clientID.
 */
export function dealRandomNations(
  data: ScenarioData,
  players: readonly string[],
  opts: {
    friends?: ReadonlySet<string>;
    keepTogether?: boolean;
    rand?: Rand;
  } = {},
): Record<string, string> {
  const rand = opts.rand ?? Math.random;
  const free = new Set(data.nations.filter(isPlayable).map((n) => n.key));
  const seats: Record<string, string> = {};
  const sides = data.sides.map((s) => s.id);
  const dealtOn = new Map(sides.map((s) => [s, 0]));

  /** The free seats on a side (or the neutrals' when `side` is null), best first. */
  const freeOn = (side: string | null): ScenarioNation[] => {
    const list = data.nations.filter((n) => n.side === side && free.has(n.key));
    const big = list.filter((n) => isEligible(data, n));
    return big.length > 0 ? big : list;
  };
  const seat = (clientID: string, side: string | null): boolean => {
    const list = freeOn(side);
    if (list.length === 0) return false;
    const n = pickOf(list, rand);
    free.delete(n.key);
    seats[n.key] = clientID;
    if (side !== null) dealtOn.set(side, (dealtOn.get(side) ?? 0) + 1);
    return true;
  };
  /** The side with the fewest dealt that still has a seat (ties at random). */
  const nextSide = (): string | null => {
    const open = shuffle(sides, rand).filter((s) => freeOn(s).length > 0);
    if (open.length === 0) return null;
    return open.reduce((a, b) => (dealtOn.get(b)! < dealtOn.get(a)! ? b : a));
  };
  const seatAnywhere = (clientID: string) => {
    const side = nextSide();
    if (side !== null) seat(clientID, side);
    else seat(clientID, null); // the sides are full: a neutral
  };

  const group =
    opts.keepTogether === true
      ? players.filter((p) => opts.friends?.has(p) === true)
      : [];
  if (group.length > 1) {
    // One side for all of them: one with room for them all, else the
    // roomiest; at random among the ones as good.
    const room = (s: string) =>
      data.nations.filter((n) => n.side === s && free.has(n.key)).length;
    const fits = sides.filter((s) => room(s) >= group.length);
    const side =
      fits.length > 0
        ? pickOf(shuffle(fits, rand), rand)
        : shuffle(sides, rand).reduce((a, b) => (room(b) > room(a) ? b : a));
    for (const p of shuffle(group, rand)) {
      if (!seat(p, side)) seatAnywhere(p);
    }
  }
  const inGroup = new Set(group.length > 1 ? group : []);
  for (const p of shuffle(
    players.filter((p) => !inGroup.has(p)),
    rand,
  )) {
    seatAnywhere(p);
  }
  return seats;
}
