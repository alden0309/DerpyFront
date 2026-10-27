import type { ScenarioNation } from "./ScenarioData";

/**
 * DIPLO (r27): a neutral's historical leaning toward a side, in a Scenario's
 * data (resources/scenarios/README.md, "Courting the neutrals"). A word, so
 * the table reads as history, not as numbers; each word multiplies the
 * neutral's price for that side (engine scenario/ScenarioDiplomacy.ts).
 */
export const LEANING_WORDS = [
  "eager",
  "leans",
  "open",
  "reluctant",
  "opposed",
  "aloof",
  "never",
] as const;

export type ScenarioLeaningWord = (typeof LEANING_WORDS)[number];

/**
 * What each word does to the price, in percent (null: it will not join that
 * side at any price).
 *  - eager: it joined this side in the real war, or allied with it;
 *  - leans: sympathy, a treaty, trade or a dynasty pulled it this way;
 *  - open: no strong pull either way (a side the data doesn't name);
 *  - reluctant: distrust or old grievances;
 *  - opposed: it opposed this side's aims, or fought it;
 *  - aloof: it held to strict neutrality all war (Switzerland, Sweden);
 *  - never: history says it could not happen (use sparingly).
 */
export const LEANING_PRICE_PERCENT: Readonly<
  Record<ScenarioLeaningWord, number | null>
> = {
  eager: 60,
  leans: 80,
  open: 100,
  reluctant: 150,
  opposed: 250,
  aloof: 600,
  never: null,
};

/** The leanings a computer-run side courts on its own: the ones its way. */
export const COURTED_LEANINGS: readonly ScenarioLeaningWord[] = [
  "eager",
  "leans",
];

export function isLeaningWord(w: unknown): w is ScenarioLeaningWord {
  return (
    typeof w === "string" &&
    (LEANING_WORDS as readonly string[]).includes(w as ScenarioLeaningWord)
  );
}

/**
 * A neutral's leaning toward `side` at `minute` (the war's minutes, as its
 * timer counts them): its `leaningLate` word for that side from its minute
 * on, else its `leaning` word, else "open".
 */
export function leaningOf(
  nation: Pick<ScenarioNation, "leaning" | "leaningLate">,
  side: string,
  minute: number,
): ScenarioLeaningWord {
  const late = nation.leaningLate;
  if (
    late !== undefined &&
    minute >= late.minute &&
    Object.prototype.hasOwnProperty.call(late.sides, side)
  ) {
    return late.sides[side];
  }
  const own = nation.leaning;
  if (own !== undefined && Object.prototype.hasOwnProperty.call(own, side)) {
    return own[side];
  }
  return "open";
}
