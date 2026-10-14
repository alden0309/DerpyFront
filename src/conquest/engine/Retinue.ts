// LIFE (r21): positions for your own people, after Crusader Kings III's court
// positions. Anyone in your service can be given one post (and each post one
// person): a clerk of your accounts, a secretary, a steward, a bodyguard, a
// physician, a tutor for your children, a scout, a chaplain. What they do
// for you goes by their own skill in it, and each post pays a little over
// their wages. Someone with no post does what they always did (carry, fight
// beside you, trade or skipper when sent), and nothing more.
//
// Every effect is reckoned here, from `POSTS`, and read where it applies:
// your skills (LifeQueries' skillOf), living costs and the extra pay (the
// month's budget), fights, plots and the road (Followers' strength, Plots,
// the road's events), health and the death roll (Life.ts), your children's
// lessons, the country round, and your peace of mind (the month here).

import { dateOf } from "./Calendar";
import { reveal } from "./Fog";
import type { ConquestGame } from "./Game";
import { kidsAtHome } from "./Household";
import { addStress, gainXp, heal, journal, touchLife } from "./LifeCore";
import { lifestyleCost, meOf, npcSkill } from "./LifeQueries";
import { SKILL_NAMES } from "./LifeRules";
import type { World } from "./Map";
import { charName } from "./Queries";
import type { Follower, GameState, Life, Part, PostKey, Skill } from "./Types";

export interface PostDef {
  name: string;
  /** The skill that makes them good at it. */
  skill: Skill;
  /** Coins a month over their wages, for the post. */
  extra: number;
  /** What it does, in a line (the numbers by skill are in `postEffect`). */
  text: string;
}

export const POSTS: Record<PostKey, PostDef> = {
  bookkeeper: {
    name: "Clerk of your accounts",
    skill: "trade",
    extra: 0.5,
    text: "Keeps your books and reads the markets with you: your Trade is better by a point for each 5 of theirs (3 at most), at the market, in trading and in a business of your own.",
  },
  secretary: {
    name: "Secretary",
    skill: "letters",
    extra: 0.5,
    text: "Writes, copies and answers your letters: your Letters are better by a point for each 5 of theirs (3 at most).",
  },
  steward: {
    name: "Steward",
    skill: "trade",
    extra: 1,
    text: "Runs your household's money: your living costs less, 3 in 100 and 1 more for each point of their trade (15 in 100 at most).",
  },
  bodyguard: {
    name: "Bodyguard",
    skill: "fighting",
    extra: 0.5,
    text: "Never far from you: fights at your side at half again their weight, makes a plot against you less likely to come off, keeps men of the road off you, and stands between you and a dead man's kin after a duel.",
  },
  physician: {
    name: "Physician",
    skill: "medicine",
    extra: 1,
    text: "Sees to your health: a point back each month and 1 more for each 6 of their medicine (4 at most), and fewer deaths of sickness (3 in 100 fewer for each 2 points, a third at most).",
  },
  tutor: {
    name: "Tutor to your children",
    skill: "letters",
    extra: 0.5,
    text: "Teaches your children of 6 to 15 at home: each season a lesson in letters for each child, up to half the tutor's own letters (10 at most).",
  },
  scout: {
    name: "Scout",
    skill: "woodcraft",
    extra: 0.5,
    text: "Rides ahead and asks about: fewer bad turns on the road (by their woodcraft), and word each month of a place round about you haven't known.",
  },
  chaplain: {
    name: "Chaplain",
    skill: "faith",
    extra: 0.5,
    text: "Prays with you and your household: stress eased by a point a month and 1 more for each 6 of their faith (4 at most), and your faith grows a little.",
  },
};

export const POST_ORDER: PostKey[] = [
  "bookkeeper",
  "secretary",
  "steward",
  "bodyguard",
  "physician",
  "tutor",
  "scout",
  "chaplain",
];

/** Someone's skill at a post's work (their nature, and their trade if it's theirs). */
export function postSkill(s: GameState, f: Follower, key: PostKey): number {
  const c = s.chars[f.c];
  if (!c) return 0;
  const sk = POSTS[key].skill;
  // Their own kind's skill counts as their trade (as followerSkill does).
  const own: Partial<Record<string, Skill>> = {
    clerk: "trade",
    hand: "craft",
    sword: "fighting",
    rogue: "stealth",
    mate: "seamanship",
    guide: "woodcraft",
    officer: "leadership",
    interpreter: "persuasion",
    physician: "medicine",
    tutor: "letters",
  };
  return Math.min(
    20,
    npcSkill(s, c, sk) + (own[f.kind] === sk ? 2 + f.rank * 2 : 0),
  );
}

/** Who holds a post, if anyone (and they're at hand: not away on a task). */
export function holderOf(
  s: GameState,
  life: Life,
  key: PostKey,
): Follower | undefined {
  return (life.people ?? []).find(
    (f) => f.post === key && !f.task && s.chars[f.c]?.alive,
  );
}

/** What a post does with this skill: the number and the words. */
export function postEffect(
  key: PostKey,
  skill: number,
): { value: number; words: string } {
  switch (key) {
    case "bookkeeper": {
      const v = Math.min(3, Math.floor(skill / 5));
      return { value: v, words: `Trade +${v}` };
    }
    case "secretary": {
      const v = Math.min(3, Math.floor(skill / 5));
      return { value: v, words: `Letters +${v}` };
    }
    case "steward": {
      const v = Math.min(0.15, 0.03 + 0.01 * skill);
      return {
        value: v,
        words: `living costs ${Math.round(v * 100)} in 100 less`,
      };
    }
    case "bodyguard": {
      const v = Math.min(0.5, skill * 0.03);
      return {
        value: v,
        words: `a plot against you comes off ${Math.round(v * 100)} in 100 less often; men of the road ${Math.round(Math.min(0.6, skill * 0.04) * 100)} in 100 less`,
      };
    }
    case "physician": {
      const v = Math.min(4, 1 + Math.floor(skill / 6));
      const d = Math.min(1 / 3, Math.floor(skill / 2) * 0.03);
      return {
        value: v,
        words: `+${v} health a month; deaths of sickness ${Math.round(d * 100)} in 100 fewer`,
      };
    }
    case "tutor": {
      const v = Math.min(10, Math.floor(skill / 2));
      return {
        value: v,
        words: `a lesson in letters each season for each child, up to ${v}`,
      };
    }
    case "scout": {
      const v = Math.min(0.4, skill * 0.025);
      return {
        value: v,
        words: `${Math.round(v * 100)} in 100 fewer bad turns on the road; word of a new place each month`,
      };
    }
    case "chaplain": {
      const v = Math.min(4, 1 + Math.floor(skill / 6));
      return { value: v, words: `stress −${v} a month; faith grows` };
    }
  }
}

/** A post's effect for this life now (0 if nobody holds it, or they're away). */
export function postValue(s: GameState, life: Life, key: PostKey): number {
  const f = holderOf(s, life, key);
  return f ? postEffect(key, postSkill(s, f, key)).value : 0;
}

/** Skill bonuses from your clerk of accounts and your secretary (for skillOf). */
export function postSkillParts(s: GameState, life: Life, sk: Skill): Part[] {
  const out: Part[] = [];
  for (const key of ["bookkeeper", "secretary"] as const) {
    if (POSTS[key].skill !== sk) continue;
    const f = holderOf(s, life, key);
    if (!f) continue;
    const v = postEffect(key, postSkill(s, f, key)).value;
    if (v > 0)
      out.push({
        label: `${POSTS[key].name} (${s.chars[f.c]?.first ?? "?"})`,
        value: v,
      });
  }
  return out;
}

/** The month's budget: the posts' extra pay, and what your steward saves. */
export function postBudget(
  s: GameState,
  life: Life,
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const posted = (life.people ?? []).filter(
    (f) => f.post && s.chars[f.c]?.alive,
  );
  const extra = posted.reduce((m, f) => m + POSTS[f.post!].extra, 0);
  if (extra > 0)
    out.push({
      label: `Posts in your household (${posted.length})`,
      value: -Math.round(extra * 10) / 10,
    });
  const steward = postValue(s, life, "steward");
  if (steward > 0) {
    const living = lifestyleCost(s, life).total;
    const saved = Math.round(living * steward * 10) / 10;
    if (saved > 0)
      out.push({ label: "Your steward's economies", value: saved });
  }
  return out;
}

/** In a fight: your bodyguard counts half again (on top of being there). */
export function bodyguardFight(s: GameState, life: Life): number {
  const f = holderOf(s, life, "bodyguard");
  return f ? 0.5 * postSkill(s, f, "bodyguard") * 3 : 0;
}

/** A plot against you: what your bodyguard takes off its chance (a factor). */
export function bodyguardPlot(s: GameState, life: Life | undefined): number {
  if (!life) return 1;
  return 1 - postValue(s, life, "bodyguard");
}

/** The road's robbers and raiders: how much less likely, with a bodyguard. */
export function bodyguardRoad(s: GameState, life: Life): number {
  const f = holderOf(s, life, "bodyguard");
  return f ? 1 - Math.min(0.6, postSkill(s, f, "bodyguard") * 0.04) : 1;
}

/** Any bad turn on the road: how much less likely, with a scout. */
export function scoutRoad(s: GameState, life: Life): number {
  return 1 - postValue(s, life, "scout");
}

/** The death roll: what your physician takes off the chance of a sickness. */
export function physicianDeath(s: GameState, life: Life): number {
  const f = holderOf(s, life, "physician");
  if (!f) return 1;
  const sk = postSkill(s, f, "physician");
  return 1 - Math.min(1 / 3, Math.floor(sk / 2) * 0.03);
}

/** Put one of your people to a post (or none). */
export function setPost(
  g: ConquestGame,
  life: Life,
  id: number,
  post: PostKey | "",
): string | null {
  const f = (life.people ?? []).find((x) => x.id === id);
  if (!f) return "Not one of your people.";
  if (post && !POSTS[post]) return "No such post.";
  const c = g.s.chars[f.c];
  if (!c?.alive) return "They're gone.";
  touchLife(g, life);
  if (!post) {
    if (!f.post) return null;
    journal(
      g,
      life,
      `${charName(c)} is ${POSTS[f.post].name.toLowerCase()} no longer.`,
    );
    delete f.post;
    return null;
  }
  if (f.post === post) return null;
  // One to a post: whoever held it is stood down.
  for (const o of life.people ?? [])
    if (o !== f && o.post === post) {
      delete o.post;
      journal(
        g,
        life,
        `${charName(g.s.chars[o.c])} is stood down as ${POSTS[post].name.toLowerCase()}.`,
      );
    }
  f.post = post;
  const sk = postSkill(g.s, f, post);
  journal(
    g,
    life,
    `${charName(c)} is your ${POSTS[post].name.toLowerCase()} now (${SKILL_NAMES[POSTS[post].skill].toLowerCase()} ${sk}): ${postEffect(post, sk).words}.`,
    "good",
  );
  return null;
}

/** Each month: a physician's care, a chaplain's prayers, a tutor's lessons, a scout's news. */
export function postsMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (!life.people?.some((f) => f.post)) return;
  const me = meOf(s, life);
  if (!me) return;
  const physician = postValue(s, life, "physician");
  if (physician > 0) heal(g, life, physician);
  const chaplain = holderOf(s, life, "chaplain");
  if (chaplain) {
    addStress(g, life, -postValue(s, life, "chaplain"));
    gainXp(g, life, "faith", 2);
  }
  const tutor = holderOf(s, life, "tutor");
  if (tutor && dateOf(s.day).month % 3 === 0) teachChildren(g, life, tutor);
  const scout = holderOf(s, life, "scout");
  if (scout) scoutNews(g, life, scout);
}

/** The tutor's season: a lesson in letters for each child at home, 6 to 15. */
function teachChildren(g: ConquestGame, life: Life, f: Follower): void {
  const s = g.s;
  const most = postEffect("tutor", postSkill(s, f, "tutor")).value;
  const kids = kidsAtHome(s, life, 15, 6);
  let taught = 0;
  for (const k of kids) {
    const got = k.taught?.letters ?? 0;
    if (got >= most) continue;
    const kid = g.touchChar(k);
    kid.taught = { ...(kid.taught ?? {}), letters: got + 1 };
    taught++;
  }
  if (taught)
    journal(
      g,
      life,
      `${charName(s.chars[f.c])} has the children at their copybooks: ${taught === 1 ? "one" : taught} of them read and write the better for it.`,
      undefined,
      false,
    );
}

/** The scout's month: word of somewhere round about you didn't know. */
function scoutNews(g: ConquestGame, life: Life, f: Follower): void {
  const w: World = g.w;
  const p = life.prov;
  const near = w.map.provinces[p]?.nb.map((n) => n[0]) ?? [];
  const known = new Set(life.known ?? []);
  const fresh = near.filter((q) => !known.has(q));
  if (!fresh.length) return;
  const pick = fresh[(s0(g) + p) % fresh.length];
  if (reveal(g, life, [pick]))
    journal(
      g,
      life,
      `${charName(g.s.chars[f.c])}, your scout, brings word of ${w.map.provinces[pick].name}.`,
      undefined,
      false,
    );
}

const s0 = (g: ConquestGame) => Math.floor(g.s.day / 30);
