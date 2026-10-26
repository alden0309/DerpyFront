// CQTUT (r26): the first life, guided: what the tutorial is made of, kept
// light (no game logic) so anything may read it: the client's card, the
// achievements, the server. Tutorial.ts runs it.
//
// A newcomer lives a short first life in Boston in the spring of 1700, a
// journeyman cooper with a mother and a sister in town, learning the game a
// step at a time: the town's places, work, people, a letter with odds, the
// map and the road, the clock, pay day, family, an ambition, a birthday and
// the heir. Each step moves on when the player does it (or skips it); the
// lessons can be left at any time, and the life goes on as a normal game.

import type { Present } from "./Areas";
import type { GameState, Life, PlaceKind, TutorialState } from "./Types";

/** The achievement for finishing the lessons, and what it pays the account (once). */
export const FIRST_LIFE = "first-life";
export const FIRST_LIFE_COINS = 250;

/** Where and when: Boston (Massachusetts Bay), 1 May 1700. */
export const TUT_HOME = "Massachusetts Bay";
export const TUT_TOWN = "Boston";
export const TUT_ERRAND = "Plymouth";
export const TUT_START_YEAR = 1700;
/** The month (0: January) and day the life begins. */
export const TUT_START_MONTH = 4;
export const TUT_START_DAY = 1;
/** The world's seed: the same world every time. */
export const TUT_SEED = 17000501;
/** The birthday: 15 June (month 5), turning twenty-one. */
export const TUT_BIRTH_MONTH = 5;
export const TUT_BIRTH_DAY = 15;
export const TUT_AGE = 20;
/** The family name, and the first names by sex. */
export const TUT_FAMILY = "Hale";
export const TUT_FIRST = { man: "Thomas", woman: "Hannah" };
/** The least health a life may fall to while the lessons run. */
export const TUT_FLOOR = 40;

/** The steps, in order. */
export const TUTORIAL_STEPS = [
  "places", // step into the workshops
  "work", // choose how hard you work
  "talk", // talk with someone; a neighbour's favour
  "rival", // a letter with odds on its choices; a rival
  "map", // set out for Plymouth on the map
  "road", // the clock runs; arrive; the barrels delivered
  "home", // home, and skip ahead to pay day
  "family", // supper at your mother's
  "aim", // an ambition
  "birthday", // skip ahead to your birthday
  "heir", // the heir, on You › Family
] as const;

export type TutStep = (typeof TUTORIAL_STEPS)[number];

/** The pages the client tells of being looked at ("saw"), by step. */
export const TUT_SAW: Partial<Record<TutStep, string>> = { heir: "heir" };

/** The lessons' own letters (their keys begin so). */
export const TUT_EVENT_PREFIX = "tut-";

export function isTutKey(key: string): boolean {
  return key.startsWith(TUT_EVENT_PREFIX);
}

/** A first life's lessons, if this life has them. */
export function tutOf(
  life: Life | null | undefined,
): TutorialState | undefined {
  return life?.tut;
}

/** Whether the lessons are running (begun, and neither finished nor left). */
export function tutRunning(life: Life | null | undefined): boolean {
  const t = life?.tut;
  return !!t && !t.over;
}

/** The step the lessons are at, or null at the end (or with none). */
export function tutStep(life: Life | null | undefined): TutStep | null {
  const t = life?.tut;
  if (!t || t.over) return null;
  return TUTORIAL_STEPS[t.step] ?? null;
}

/** How many steps there are, and the one shown as "n of N" (1-based). */
export const TUT_STEP_COUNT = TUTORIAL_STEPS.length;

/**
 * Who's about, as the lessons would have it: until you've spoken with him,
 * your neighbour is at the next bench in your workplace (Areas.ts presence
 * asks), so the newcomer who steps in finds him there.
 */
export function tutBench(
  s: GameState,
  p: number,
  out: Map<PlaceKind, Present[]>,
  life: Life,
): void {
  const t = life.tut;
  if (!t || t.over || t.step > TUTORIAL_STEPS.indexOf("talk")) return;
  const job = life.job;
  const c = s.chars[t.cast.friend];
  if (!job || job.prov !== p || !c?.alive || c.abroad) return;
  const bench = out.get(job.place);
  if (!bench) return;
  for (const list of out.values()) {
    const i = list.findIndex((x) => x.c === c.id);
    if (i >= 0) list.splice(i, 1);
  }
  bench.push({ c: c.id, doing: "at the next bench", kind: "work" });
}
