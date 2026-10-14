// LIFE (r21): what you know of someone, for their page's stats. You know
// your own people best (family, friends and lovers, a rival you've watched,
// those in your service, your master), then those you've talked with often,
// then those you've met; of a stranger you know only what shows (their age,
// their trade, their marked traits). A sharp eye (Intrigue 9 or more) reads
// people a step better. Fog is shown as a range, or a question mark.

import { duelPreview } from "./Duels";
import {
  charSkill,
  lifeOfChar,
  meOf,
  npcSkill,
  opinionOf,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { ageOf, stat, statOf } from "./Queries";
import { talksWith } from "./Regard";
import type { Character, GameState, Life, Skill, Stat } from "./Types";
import { SKILLS, STATS } from "./Types";

export type Know = 0 | 1 | 2 | 3;

export const KNOW_WORDS: Record<Know, { name: string; text: string }> = {
  0: {
    name: "A stranger",
    text: "You know only what shows: their age, their trade, their manner.",
  },
  1: {
    name: "Met",
    text: "You've met: a fair guess at what they're good at (within 3).",
  },
  2: {
    name: "Acquainted",
    text: "You've talked often, or worked together: a close guess (within 1).",
  },
  3: {
    name: "Known well",
    text: "Family, a friend, a rival you've watched, or one of your own people: you know them as they are.",
  },
};

/** How well you know them, and why. */
export function knowOf(
  s: GameState,
  life: Life,
  c: Character,
): { know: Know; why: string } {
  const me = meOf(s, life);
  if (!me) return { know: 0, why: "" };
  if (c.id === me.id) return { know: 3, why: "Yourself" };
  const tie = life.ties[c.id];
  const kin =
    me.spouse === c.id ||
    me.children.includes(c.id) ||
    c.children.includes(me.id) ||
    (c.father >= 0 && c.father === me.father) ||
    (c.mother >= 0 && c.mother === me.mother);
  const yours = (life.people ?? []).some((f) => f.c === c.id);
  const boss = life.job && !life.job.own && life.job.employer === c.id;
  let know: Know = 0;
  let why = "Never met";
  if (kin) [know, why] = [3, "Your family"];
  else if (tie) [know, why] = [3, `Your ${tie}`];
  else if (yours) [know, why] = [3, "In your service"];
  else if (boss) [know, why] = [3, "Your master"];
  else if (talksWith(c, me.id, s.day) >= 3)
    [know, why] = [2, "You've talked often"];
  else if (life.met.includes(c.id)) [know, why] = [1, "You've met"];
  if (know < 3 && stat(s, me, "int") >= 9) {
    know = (know + 1) as Know;
    why += "; you read people well (Intrigue 9 or more)";
  }
  return { know, why };
}

export interface FoggedNumber {
  /** The true value when known, else null. */
  value: number | null;
  /** A guess's range, when it isn't known exactly. */
  lo?: number;
  hi?: number;
}

/** A number as you'd know it: exact, within some, or not at all. */
function fog(
  v: number,
  know: Know,
  /** Is it something that shows (their own trade's skill)? */
  shows: boolean,
  seed: number,
): FoggedNumber {
  if (know >= 3) return { value: v };
  const spread = know === 2 ? 1 : know === 1 ? 3 : shows ? 4 : -1;
  if (spread < 0) return { value: null };
  // The guess is off-centre, the same way each time (no peeking by refreshing).
  const shift = ((seed % (2 * spread + 1)) + 2 * spread + 1) % (2 * spread + 1);
  const lo = Math.max(0, v - shift);
  return { value: null, lo, hi: lo + 2 * spread };
}

export interface StatsView {
  know: Know;
  knowWhy: string;
  played: boolean;
  /** What their trade is about (it shows). */
  trade: Skill | null;
  attributes: { stat: Stat; v: FoggedNumber }[];
  skills: { skill: Skill; v: FoggedNumber }[];
  fighting: FoggedNumber;
  /** For another player, their health; else how they look. */
  health: { value: number | null; words: string };
  duel: ReturnType<typeof duelPreview> | null;
  opinion: number | null;
}

const hash = (a: number, b: number, c: number) =>
  Math.abs((Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503) ^ c) | 0);

/** Everything their page's stats show, as you'd know it. */
export function statsView(s: GameState, life: Life, c: Character): StatsView {
  const { know, why } = knowOf(s, life, c);
  const other = lifeOfChar(s, c.id);
  const trade: Skill | null = c.role ? ROLES[c.role].skill : null;
  const attributes = STATS.map((st) => ({
    stat: st,
    v: fog(statOf(s, c, st).total, know, false, hash(c.id, life.c, st.length)),
  }));
  const skills = SKILLS.map((sk) => ({
    skill: sk,
    v: fog(
      other ? charSkill(s, c, sk) : npcSkill(s, c, sk),
      know,
      sk === trade,
      hash(c.id, life.c, sk.length * 7 + sk.charCodeAt(0)),
    ),
  }));
  const fighting = fog(
    charSkill(s, c, "fighting"),
    know,
    trade === "fighting",
    hash(c.id, life.c, 99),
  );
  const age = ageOf(s, c);
  const ills = c.traits.filter((t) =>
    ["sickly", "wounded", "gouty", "robust", "strong"].includes(t),
  );
  const words = other
    ? `${Math.round(other.health)} of 100`
    : ills.includes("sickly")
      ? "looks sickly"
      : ills.includes("wounded")
        ? "carries an old wound"
        : ills.includes("gouty")
          ? "gouty"
          : ills.includes("robust") || ills.includes("strong")
            ? "hale and strong"
            : age >= 60
              ? "showing their years"
              : "in good health, by the look of them";
  const me = meOf(s, life);
  return {
    know,
    knowWhy: why,
    played: !!other,
    trade,
    attributes,
    skills,
    fighting,
    health: { value: other ? Math.round(other.health) : null, words },
    duel:
      me && c.alive && !c.abroad && c.id !== me.id && ageOf(s, c) >= 16
        ? duelPreview(s, life, c)
        : null,
    opinion: me && c.id !== me.id ? opinionOf(s, c, life).total : null,
  };
}
