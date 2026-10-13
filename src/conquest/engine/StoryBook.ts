// STORY (r17): a life's story, made from its milestones: generation by
// generation, year by year, each moment with its engraving, how it went and
// how much it weighs; the small things of a year told in one line; and how
// many of each kind there were, all told. The story so far (Journal › The
// story) and the story told at the end are both made here, so they always
// agree.

import { ACHIEVEMENT_BY_KEY } from "./Achievements";
import { dateOf } from "./Calendar";
import {
  achievementText,
  kindDef,
  STORY_KINDS,
  StoryIcon,
  storyKind,
  storyTone,
  storyWeight,
  Tone,
  Weight,
} from "./StoryCore";
import type { GameState, Life, LifeMilestone } from "./Types";

export interface StoryLine {
  day: number;
  text: string;
  tone: Tone;
  p?: number;
}

export interface StoryEntry {
  /** Stable while the story grows (for the page's lists). */
  key: string;
  day: number;
  /** The kind it's told as (StoryCore's table, or another system's own). */
  kind: string;
  icon: StoryIcon;
  text: string;
  tone: Tone;
  weight: Weight;
  /** Where it happened. */
  p?: number;
  /** Its number on the map (the moments, not the small things), or null. */
  pin: number | null;
  /** The small things of a year told as one: each of them. */
  many?: StoryLine[];
}

export interface StoryYear {
  year: number;
  entries: StoryEntry[];
}

export interface StoryGeneration {
  /** The character it was (-1 when nobody is known). */
  c: number;
  years: StoryYear[];
}

export interface StoryCount {
  kind: string;
  icon: StoryIcon;
  n: number;
  /** "3 duels". */
  label: string;
}

export interface Story {
  generations: StoryGeneration[];
  /** Every entry, in order (the map's pins). */
  entries: StoryEntry[];
  /** How many of each kind, all told. */
  counts: StoryCount[];
}

/** The order the counts are shown in (the rest after, as they come). */
const COUNT_ORDER = [
  "battle",
  "duel",
  "fight",
  "wounded",
  "prize",
  "storm",
  "wreck",
  "voyage",
  "business",
  "company",
  "office",
  "election",
  "petition",
  "trial",
  "arrest",
  "convicted",
  "escape",
  "crime",
  "plot",
  "school",
  "freed",
  "find",
  "dice",
  "achievement",
];

/** Kinds counted in the life's tally as they come (round 17's, each only ever recorded under its own kind). */
const COUNTED_AS_THEY_COME = new Set([
  "fight",
  "duel",
  "crime",
  "arrest",
  "trial",
  "escape",
  "prize",
  "storm",
  "wreck",
  "business",
  "company",
  "election",
  "petition",
  "school",
  "freed",
  "dice",
  "find",
]);

/** Kinds never counted (a life's beginnings and ends, its family: the header has those). */
const NOT_COUNTED = new Set([
  "born",
  "begin",
  "died",
  "heir",
  "takeover",
  "watching",
  "end",
  "europe",
  "married",
  "child",
  "promoted",
  "job",
  "moved",
  "renown",
  "loss",
  "home",
  "movement",
  "rising",
]);

/** Achievements earned before the story kept them (an old save): told from the day each was earned. */
function earnedEarlier(life: Life): LifeMilestone[] {
  const told = new Set(
    life.milestones.filter((m) => m.kind === "achievement").map((m) => m.text),
  );
  const out: LifeMilestone[] = [];
  for (const [key, day] of Object.entries(life.achieved ?? {})) {
    const def = ACHIEVEMENT_BY_KEY.get(key);
    if (!def) continue;
    const text = achievementText(def.name);
    if (told.has(text)) continue;
    // Whoever of the line was living it then.
    let c = life.line[0] ?? life.c;
    for (const m of life.milestones) if (m.day <= day) c = m.c;
    out.push({ day, kind: "achievement", c, text });
  }
  return out;
}

/** The moments in order, the old save's achievements among them. */
function momentsOf(life: Life): LifeMilestone[] {
  const extra = earnedEarlier(life);
  if (!extra.length) return life.milestones;
  const all = [
    ...life.milestones.map((m, i) => ({ m, i })),
    ...extra.map((m, i) => ({ m, i: life.milestones.length + i })),
  ];
  all.sort((a, b) => a.m.day - b.m.day || a.i - b.i);
  return all.map((x) => x.m);
}

/** The story of a life (or a line of them), as both of its pages tell it. */
export function storyOf(s: GameState, life: Life): Story {
  const moments = momentsOf(life);
  const generations: StoryGeneration[] = [];
  const seen = new Map<string, number>();
  for (const m of moments) {
    const who = s.chars[m.c] ? m.c : -1;
    let gen = generations[generations.length - 1];
    if (!gen || gen.c !== who) {
      gen = { c: who, years: [] };
      generations.push(gen);
    }
    const year = dateOf(m.day).year;
    let y = gen.years[gen.years.length - 1];
    if (!y || y.year !== year) {
      y = { year, entries: [] };
      gen.years.push(y);
    }
    const kind = storyKind(m);
    const def = kindDef(kind);
    const tone = storyTone(m);
    const weight = storyWeight(m);
    // A small thing of the same kind already told this year: one line for them all.
    if (weight === 1) {
      const same = y.entries.find((e) => e.kind === kind && e.weight === 1);
      if (same) {
        same.many ??= [
          { day: same.day, text: same.text, tone: same.tone, p: same.p },
        ];
        same.many.push({ day: m.day, text: m.text, tone, p: m.p });
        same.text = def.many(same.many.length);
        same.tone = same.many.every((x) => x.tone === same.many![0].tone)
          ? same.many[0].tone
          : "";
        continue;
      }
    }
    const base = `${m.day}|${m.c}|${kind}|${m.text}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    y.entries.push({
      key: `${base}|${k}`,
      day: m.day,
      kind,
      icon: def.icon,
      text: m.text,
      tone,
      weight,
      ...(m.p !== undefined ? { p: m.p } : {}),
      pin: null,
    });
  }
  // The map's pins: the moments with a place, in order (not the small things).
  const entries: StoryEntry[] = [];
  let pin = 0;
  for (const gen of generations)
    for (const y of gen.years)
      for (const e of y.entries) {
        if (e.p !== undefined && e.weight >= 2 && !e.many) e.pin = ++pin;
        entries.push(e);
      }
  return { generations, entries, counts: countsOf(life, moments) };
}

/** How many of each kind: the life's own count where it kept one, else what the story holds. */
function countsOf(life: Life, moments: LifeMilestone[]): StoryCount[] {
  const kept = new Map<string, number>();
  for (const m of moments) {
    const k = storyKind(m);
    kept.set(k, (kept.get(k) ?? 0) + 1);
  }
  const all = new Map(kept);
  // Every one of the kinds counted as they came (the story keeps only the
  // greatest of a long line's small things); the older kinds by what's kept.
  for (const [k, v] of Object.entries(life.tally.kinds ?? {}))
    if (COUNTED_AS_THEY_COME.has(k) || !STORY_KINDS[k])
      all.set(k, Math.max(all.get(k) ?? 0, v));
  all.set("battle", Math.max(all.get("battle") ?? 0, life.tally.battles));
  const achieved = Object.keys(life.achieved ?? {}).length;
  if (achieved)
    all.set("achievement", Math.max(all.get("achievement") ?? 0, achieved));
  const order = (k: string) => {
    const i = COUNT_ORDER.indexOf(k);
    return i < 0 ? COUNT_ORDER.length : i;
  };
  return [...all.entries()]
    .filter(([k, v]) => v > 0 && !NOT_COUNTED.has(k))
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([kind, v]) => {
      const def = kindDef(kind);
      return { kind, icon: def.icon, n: v, label: def.many(v) };
    });
}
