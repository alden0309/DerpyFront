// EVENTS (r15): the makings of a trade's matters at work, and of a rogue's
// big jobs and a lawman's rounds. Each variant is its own event with its own
// story, choices and outcomes; Matters.ts turns them into scenes and picks
// which comes when. Kept apart from the lists (MattersHonest.ts,
// MattersRogues.ts) so those can be plain data.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import { isWinter } from "./Map";
import { isHarvest, isMudSeason } from "./Seasons";
import type { JobKind, Life, Skill, TraitId } from "./Types";

/** What a choice comes to. Coins by the rung's wage keep it fair at every rung. */
export interface MFx {
  /** Coins as a share of the rung's monthly wage (−0.5: half a month's wage lost). */
  pay?: number;
  /** Coins, fixed. */
  coins?: number;
  renown?: number;
  stress?: number;
  /** Below 0, a wound. */
  health?: number;
  /** Experience in the matter's skill (or the trade's own), or in `sk`. */
  xp?: number;
  sk?: Skill;
  /** What your master thinks of it (a computer master only). */
  boss?: number;
  /** The law's interest, and your name in the underworld (crooked work). */
  heat?: number;
  name?: number;
  /** The chance the watch takes you up for it (crooked work). */
  seize?: number;
  /** A trait it leaves you with. */
  gain?: TraitId;
  /** What's written in your journal. */
  say: string;
}

export interface MChoice {
  label: string;
  /** A few words before the reckoning in the tip. */
  tip?: string;
  /** A skill check against the matter's usual difficulty (and `dc` more). */
  check?: { skill?: Skill; dc?: number };
  /** No skill to it: the chance it comes off. */
  odds?: number;
  /** Coins paid on choosing it (shown on the button). */
  cost?: number;
  /** How it goes (or, with a check or odds, how it goes well). */
  win: MFx;
  /** How it goes badly. */
  lose?: MFx;
}

export type MatterKind = "task" | "trouble" | "score" | "collar" | "bribe";

export interface Variant {
  /** The event's key. */
  key: string;
  jobs: JobKind[];
  kind: MatterKind;
  title: string;
  /** "{here}" is the town, "{boss}" your master (or the foreman). */
  body: string;
  choices: MChoice[];
  /** Only when this holds (a season, a place, a rung). */
  when?: (g: ConquestGame, life: Life) => boolean;
  /** The backdrop (the trade's own place if absent). */
  scene?: string;
}

/** A choice. */
export function C(
  label: string,
  o: Omit<MChoice, "label" | "win" | "lose">,
  win: MFx,
  lose?: MFx,
): MChoice {
  return { label, ...o, win, lose };
}

/** A matter for one trade or several. */
export function M(
  jobs: JobKind | JobKind[],
  kind: MatterKind,
  slug: string,
  title: string,
  body: string,
  choices: MChoice[],
  more: Pick<Variant, "when" | "scene"> = {},
): Variant {
  const list = Array.isArray(jobs) ? jobs : [jobs];
  const prefix =
    kind === "score"
      ? "rogue"
      : kind === "collar" || kind === "bribe"
        ? "law"
        : "work";
  return {
    key: `${prefix}-${list[0]}-${slug}`,
    jobs: list,
    kind,
    title,
    body,
    choices,
    ...more,
  };
}

// ---------------------------------------------------------------- when

const monthNow = (g: ConquestGame) => dateOf(g.s.day).month;
const latHere = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.prov]?.lat ?? 40;

/** Months, 0 for January; `from` to `to` inclusive, wrapping the year. */
export function months(from: number, to: number) {
  return (g: ConquestGame): boolean => {
    const m = monthNow(g);
    return from <= to ? m >= from && m <= to : m >= from || m <= to;
  };
}

/** Winter where you are (the north's deep months). */
export const winterHere = (g: ConquestGame, life: Life): boolean =>
  isWinter(latHere(g, life), monthNow(g));

/** Not winter where you are. */
export const openWater = (g: ConquestGame, life: Life): boolean =>
  !isWinter(latHere(g, life), monthNow(g));

/** The harvest where you are. */
export const harvestHere = (g: ConquestGame, life: Life): boolean =>
  isHarvest(latHere(g, life), monthNow(g));

/** Winter, or the mud and floods of spring after it. */
export const coldOrMud = (g: ConquestGame, life: Life): boolean =>
  isWinter(latHere(g, life), monthNow(g)) ||
  isMudSeason(latHere(g, life), monthNow(g));

/** Somewhere the winters are hard (north of the Chesapeake). */
export const north = (g: ConquestGame, life: Life): boolean =>
  latHere(g, life) >= 39;

/** The warm south and the islands. */
export const south = (g: ConquestGame, life: Life): boolean =>
  latHere(g, life) < 35;

/** On a rung at least this high (0 is the first). */
export const rankAtLeast =
  (r: number) =>
  (_g: ConquestGame, life: Life): boolean =>
    (life.job?.rank ?? 0) >= r;

/** Working for a master (not your own business). */
export const employed = (g: ConquestGame, life: Life): boolean => {
  const job = life.job;
  return !!job && !job.own && !!g.s.chars[job.employer]?.alive;
};

/** A town with a port. */
export const port = (g: ConquestGame, life: Life): boolean =>
  !!g.s.provinces[life.prov]?.b.port;

/** A war on with your nation. */
export const atWarNow = (g: ConquestGame, life: Life): boolean => {
  const n = g.s.chars[life.c]?.nation;
  return g.s.wars.some((w) => w.a === n || w.b === n);
};

/** At peace. */
export const peaceNow = (g: ConquestGame, life: Life): boolean =>
  !atWarNow(g, life);

/** From a year on. */
export const since =
  (year: number) =>
  (g: ConquestGame): boolean =>
    dateOf(g.s.day).year >= year;

/** All of them. */
export function all(
  ...fs: ((g: ConquestGame, life: Life) => boolean)[]
): (g: ConquestGame, life: Life) => boolean {
  return (g, life) => fs.every((f) => f(g, life));
}
