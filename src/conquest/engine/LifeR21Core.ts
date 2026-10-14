// LIFE (r21): the small shared pieces of round 21's life systems: a life's
// own state (`life.r21`), the marks a character carries for a while (a
// coward's name, the pox, a rake's), what they do to people's opinion, old
// saves' skill progress carried onto the longer road, and learning grown by
// study.

import type { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { journal, touchLife } from "./LifeCore";
import { meOf } from "./LifeQueries";
import { oldXpToNext, SKILL_MAX, xpToNext } from "./LifeRules";
import { hasTrait } from "./Queries";
import type { Rng } from "./Rng";
import type { Character, GameState, Life, LifeMarkR21, LifeR21 } from "./Types";
import { SKILLS } from "./Types";
import { worldRng } from "./WorldRng";

/** The skill scale every life's XP is reckoned on since round 21. */
export const SKILL_SCALE = 2;

export function r21Of(life: Life): LifeR21 {
  return (life.r21 ??= {});
}

// ---------------------------------------------------------------- marks

/** A mark this character carries now (a coward's name, the pox, a rake's). */
export function markOn(
  s: GameState,
  life: Life | undefined,
  k: LifeMarkR21["k"],
  c?: number,
): LifeMarkR21 | undefined {
  if (!life) return undefined;
  const who = c ?? life.c;
  return life.r21?.marks?.find(
    (m) => m.k === k && m.c === who && (m.until === 0 || m.until > s.day),
  );
}

/** Put a mark on the character played now (or refresh it). */
export function setMark(
  g: ConquestGame,
  life: Life,
  k: LifeMarkR21["k"],
  days: number,
): void {
  if (life.c < 0) return;
  const r = r21Of(touchLife(g, life));
  const marks = (r.marks ??= []).filter(
    (m) =>
      !(m.k === k && m.c === life.c) && (m.until === 0 || m.until > g.s.day),
  );
  marks.push({
    k,
    c: life.c,
    day: g.s.day,
    until: days > 0 ? g.s.day + days : 0,
  });
  r.marks = marks;
}

/** How long a coward's name lasts, and a rake's. */
export const COWARD_DAYS = 3 * 365;
export const RAKE_DAYS = 365;

/** What people think of a coward, a rake, the pox (a line each in their opinion). */
export const MARK_OPINION = {
  coward: { label: "Ran from the field", value: -12, proud: -20 },
  rake: { label: "Keeps company at the bawdy house", value: -3, godly: -12 },
};

/** LIFE (r21): the marks' lines in someone's opinion of a player. */
export function r21Opinion(
  s: GameState,
  c: Character,
  life: Life,
  e: Explain,
): void {
  if (markOn(s, life, "coward")) {
    const proud =
      hasTrait(c, "brave") || hasTrait(c, "cruel") || c.role === "soldier";
    e.add(
      MARK_OPINION.coward.label,
      proud ? MARK_OPINION.coward.proud : MARK_OPINION.coward.value,
    );
  }
  if (markOn(s, life, "rake")) {
    const godly =
      c.role === "preacher" ||
      hasTrait(c, "zealous") ||
      hasTrait(c, "just") ||
      c.religion === "puritan";
    const me = meOf(s, life);
    const wife = me && me.spouse === c.id;
    if (!wife)
      e.add(
        MARK_OPINION.rake.label,
        godly ? MARK_OPINION.rake.godly : MARK_OPINION.rake.value,
      );
  }
}

// ---------------------------------------------------------------- skills

/**
 * An old save's progress toward each next level is carried onto the longer
 * road as the same share of the way (levels are kept as they were: a 20 is
 * still 20, and can go on to 30). Done once per life.
 */
export function carrySkills(life: Life): boolean {
  const r = r21Of(life);
  if (r.sk === SKILL_SCALE) return false;
  for (const sk of SKILLS) {
    const lvl = life.skills[sk] ?? 0;
    const xp = life.xp[sk] ?? 0;
    if (lvl >= SKILL_MAX) {
      life.xp[sk] = 0;
      continue;
    }
    const share = Math.max(0, Math.min(0.999, xp / oldXpToNext(lvl)));
    life.xp[sk] = Math.round(share * xpToNext(lvl) * 10) / 10;
  }
  r.sk = SKILL_SCALE;
  return true;
}

/** Every life in a state that was saved before round 21. */
export function carryAllSkills(s: GameState): void {
  for (const life of s.lives) carrySkills(life);
}

// ---------------------------------------------------------------- study

/** Learning grown by study: points to the next point, and the most it grows. */
export const STUDY = {
  /** What a lesson with the minister brings toward Learning. */
  pts: 4,
  /** Points to the next point of Learning (25 lessons, about half a year of weeks). */
  per: 100,
  /** The most study adds to a character's Learning in a life. */
  most: 3,
  /** And never past this. */
  ceiling: 14,
};

/** Where this character's study stands. */
export function studyOf(life: Life): { pts: number; grown: number } {
  const st = life.r21?.study;
  return st && st.c === life.c
    ? { pts: st.pts, grown: st.grown }
    : { pts: 0, grown: 0 };
}

/**
 * A lesson's worth of study toward Learning. Returns whether Learning grew
 * (the caller writes the line).
 */
export function studyLearning(g: ConquestGame, life: Life): boolean {
  const me = meOf(g.s, life);
  if (!me) return false;
  const r = r21Of(touchLife(g, life));
  const st =
    r.study && r.study.c === life.c ? r.study : { c: life.c, pts: 0, grown: 0 };
  if (st.grown >= STUDY.most || me.stats.lea >= STUDY.ceiling) {
    r.study = st;
    return false;
  }
  st.pts += STUDY.pts;
  let grew = false;
  if (st.pts >= STUDY.per) {
    st.pts -= STUDY.per;
    st.grown++;
    g.touchChar(me).stats.lea = Math.min(STUDY.ceiling, me.stats.lea + 1);
    grew = true;
  }
  r.study = st;
  return grew;
}

// ---------------------------------------------------------------- dice

/**
 * LIFE (r21): round 21's own side dice (a duel's terms, a run from the
 * field, a dead man's kin, the bawdy house), from the seed, the day and a
 * salt, so the world's own luck isn't moved by them.
 */
export function ldice(s: GameState, salt: number, ...xs: number[]): Rng {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x21a0000 + (k & 0xffff));
}

// ---------------------------------------------------------------- secrets

/**
 * LIFE (r21): an evening at the bawdy house is its own player's business
 * until someone sees them (then the town talks, and the rake's mark is
 * public). Nobody else is sent: the visits, the pox (and when it will show),
 * the house's scenes and their lines, its cooldown, or its money in the books.
 */
export function bawdyKey(key: string): boolean {
  return key.startsWith("bawdy") || key === "act:bawdy";
}

const bawdyLine = (k: string) => k === "bawdy";

/** Whether a (whole or patched) life carries a bawdy house secret. */
export function r21HasSecrets(l: Partial<Life>): boolean {
  const r = l.r21;
  if (r && (r.bawdy?.length || r.poxDue || r.marks?.some((m) => m.k === "pox")))
    return true;
  if (l.cooldowns && Object.keys(l.cooldowns).some((k) => bawdyKey(k.replace(/^ev:/, ""))))
    return true;
  if (l.events?.some((e) => bawdyKey(e.key))) return true;
  if (l.outcome && bawdyKey(l.outcome.key)) return true;
  if (l.books?.lines.some((x) => bawdyLine(x.k))) return true;
  return !!l.statements?.some((st) => st.lines.some((x) => bawdyLine(x.k)));
}

/** A life as anyone else is sent it: the bawdy house's secrets taken out. */
export function r21ForOthers<T extends Partial<Life>>(l: T, out: T): void {
  if (l.r21) {
    const { bawdy: _b, poxDue: _p, ...rest } = l.r21;
    void _b;
    void _p;
    out.r21 = {
      ...rest,
      ...(rest.marks ? { marks: rest.marks.filter((m) => m.k !== "pox") } : {}),
    };
  }
  if (out.cooldowns)
    out.cooldowns = Object.fromEntries(
      Object.entries(out.cooldowns).filter(
        ([k]) => !bawdyKey(k.replace(/^ev:/, "")),
      ),
    );
  if (out.events) out.events = out.events.filter((e) => !bawdyKey(e.key));
  if (out.outcome && bawdyKey(out.outcome.key)) out.outcome = null;
  const strip = <
    B extends { lines: { k: string }[]; exp?: Record<string, number> },
  >(
    b: B,
  ): B => ({
    ...b,
    lines: b.lines.filter((x) => !bawdyLine(x.k)),
    ...(b.exp
      ? {
          exp: Object.fromEntries(
            Object.entries(b.exp).filter(([k]) => !bawdyLine(k)),
          ),
        }
      : {}),
  });
  if (out.books) out.books = strip(out.books);
  if (out.statements) out.statements = out.statements.map(strip);
}

/** A journal line only this life's own player is sent (the bawdy house's). */
export function privateNote(
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
): void {
  journal(g, life, text, tone, false);
  const last = life.journal[life.journal.length - 1];
  if (last && last.text === text) last.sec = true;
  touchLife(g, life);
}
