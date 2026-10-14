// LIFE (r21): a teacher of your own (Interactions' "Ask them to teach you").
// How much they teach a month goes by how far above you they stand in the
// skill: just ahead of you, little; a master to a beginner, a great deal.
// Before you ask, the card shows the skill, their level against yours, the
// rate, and a forecast (the next level, and where a year with them leaves
// you, your own work in it counted too). The month (Life.ts's ties) pays
// exactly what this table says.

import { charSkill, skillLevel } from "./LifeQueries";
import { JOBS, ROLES, SKILL_MAX, xpToNext } from "./LifeRules";
import { EFFORTS } from "./Trades";
import type { Character, GameState, Life, Skill } from "./Types";

export const TEACH = {
  /** XP a month at a rate of ×1, when they live where you do. */
  base: 8,
  /** Living elsewhere, they teach a third as much (by letter, and visits). */
  far: 1 / 3,
  /** They must stand this far above you to take you on. */
  gap: 3,
  /** The rate at that gap, and what each level more adds, up to the most. */
  atGap: 0.75,
  perLevel: 0.15,
  most: 2.5,
  /** Below the gap (you've nearly caught them up), a little; level with you, nothing. */
  close: 0.25,
};

/** How well someone at `theirs` teaches someone at `mine`: ×0 to ×2.5. */
export function teachRate(theirs: number, mine: number): number {
  const gap = theirs - mine;
  if (gap <= 0) return 0;
  if (gap < TEACH.gap) return TEACH.close;
  return Math.min(
    TEACH.most,
    Math.round((TEACH.atGap + TEACH.perLevel * (gap - TEACH.gap)) * 100) / 100,
  );
}

/** The skill a teacher teaches: what their trade is about. */
export function teacherSkill(c: Character): Skill {
  return c.role ? ROLES[c.role].skill : "persuasion";
}

/** Whether they're near enough to teach in person. */
export function teacherNear(c: Character, life: Life): boolean {
  return c.home === life.prov || c.home === undefined;
}

/** XP a month from a teacher, as the month pays it. */
export function teachXp(s: GameState, life: Life, c: Character): number {
  const sk = teacherSkill(c);
  const rate = teachRate(charSkill(s, c, sk), skillLevel(s, life, sk));
  return (
    Math.round(
      TEACH.base * rate * (teacherNear(c, life) ? 1 : TEACH.far) * 10,
    ) / 10
  );
}

export interface TeachView {
  skill: Skill;
  theirs: number;
  mine: number;
  rate: number;
  near: boolean;
  /** XP a month from them, and from your own work in it (your trade's skills). */
  perMonth: number;
  work: number;
  /** Your learned level, the XP toward the next, and what the next costs. */
  learned: number;
  xp: number;
  need: number;
  /** Months to the next level with them (and without them), and your learned level after a year with them. */
  nextIn: number | null;
  nextAlone: number | null;
  yearLevel: number;
  yearAlone: number;
}

/** What your work teaches a month in a skill (hard or steady, as you go at it). */
export function workXp(life: Life, sk: Skill): number {
  const job = life.job;
  if (!job) return 0;
  const def = JOBS[job.kind];
  const e = EFFORTS[life.work?.effort ?? "steady"]?.xp ?? 1;
  if (def.main === sk) return Math.round(7 * e * 10) / 10;
  if (def.second === sk) return Math.round(3 * e * 10) / 10;
  return 0;
}

/** Step a learned level forward month by month (the rate falls as you catch them up). */
function project(
  learned: number,
  xp: number,
  months: number,
  perMonth: (lvl: number) => number,
): { level: number; first: number | null } {
  let lvl = learned;
  let x = xp;
  let first: number | null = null;
  for (let m = 1; m <= months; m++) {
    const add = perMonth(lvl);
    if (add <= 0) break;
    x += add;
    while (lvl < SKILL_MAX && x >= xpToNext(lvl)) {
      x -= xpToNext(lvl);
      lvl++;
      if (first === null) first = m;
    }
  }
  return { level: lvl, first };
}

/** Everything the card shows before you ask them to teach you. */
export function teachView(s: GameState, life: Life, c: Character): TeachView {
  const sk = teacherSkill(c);
  const theirs = charSkill(s, c, sk);
  const mine = skillLevel(s, life, sk);
  const near = teacherNear(c, life);
  const rate = teachRate(theirs, mine);
  const work = workXp(life, sk);
  const learned = life.skills[sk] ?? 0;
  const xp = life.xp[sk] ?? 0;
  // Your shown level carries your attribute, traits and tools on top of what's learned.
  const bonus = mine - learned;
  const withThem = (lvl: number) =>
    TEACH.base * teachRate(theirs, lvl + bonus) * (near ? 1 : TEACH.far) + work;
  const alone = () => work;
  const a = project(learned, xp, 12, withThem);
  const b = project(learned, xp, 12, alone);
  const nextWith = project(learned, xp, 600, withThem).first;
  const nextAlone = work > 0 ? project(learned, xp, 600, alone).first : null;
  return {
    skill: sk,
    theirs,
    mine,
    rate,
    near,
    perMonth: Math.round(TEACH.base * rate * (near ? 1 : TEACH.far) * 10) / 10,
    work,
    learned,
    xp: Math.floor(xp),
    need: xpToNext(learned),
    nextIn: nextWith,
    nextAlone,
    yearLevel: a.level,
    yearAlone: b.level,
  };
}
