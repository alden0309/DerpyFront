// WORK (r21): the people you work beside, and what your master asks of you.
// At your post on a working day, now and then one of the people you work
// with comes to you (asks you to cover a shift, shows you a trick of the
// trade, quarrels, has an eye on the same rung, is hurt and the others take
// up a collection, goes for a drink after the week's work; at the higher
// rungs, a new boy is put under you), or your master asks something of you
// (come in on the Sabbath, mind the place while he's away, do something not
// quite honest, collect a debt). Each is a small decision with its own
// consequences: their opinion, your master's, skill, money, stress.
//
// The people in these scenes are the computer's (the town's people who work
// where you do, your master): another player is never put into one. They
// come about one in two months between them at the most, each family rests
// after it comes, and each scene rests most of a year; when you'd have too
// many letters waiting, nothing comes. Who and which are chosen on WORK's
// own dice, so the world's dice don't move.

import { npcMaster, wdice } from "./Duties";
import { familyResting, played, registerFamily, wouldBeg } from "./EventPacing";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { type JobGroup, jobGroupOf } from "./JobsData";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import {
  atPost,
  hasPlace,
  isChildLife,
  lifeIsNative,
  meOf,
  promotionView,
  rankOf,
} from "./LifeQueries";
import { JOBS, ROLES } from "./LifeRules";
import type { World } from "./Map";
import { ageOf, charName, hasTrait } from "./Queries";
import { rumour } from "./Rumours";
import type { Character, GameState, Life } from "./Types";
import { leaveJob } from "./Work";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Chance a working day at your post brings someone you work with to you. */
export const COLLEAGUE_CHANCE = 1 / 55;
/** Chance a working day brings a request from your master. */
export const MASTER_CHANCE = 1 / 80;
/** Days before the same scene can come again. */
export const SCENE_REST = 300;
/** Days the families rest after one comes. */
export const FAMILY_DAYS = { colleagues: 45, masters: 60 };

/** Whether the working day's scenes come at all (off only to measure the game without them). */
export const WORKDAY = { on: true };

// ---------------------------------------------------------------- the people you work beside

/**
 * The people you work beside (computer characters only), up to four: those
 * whose work is at your place (and not your master), the grown family of
 * your master and of those who work there (a family business), and, in a
 * small town, the labouring families round about.
 */
export function colleaguesOf(s: GameState, w: World, life: Life): Character[] {
  const job = life.job;
  if (!job || job.own) return [];
  const seen = new Set<number>([life.c, job.employer]);
  const out: Character[] = [];
  const add = (c: Character | undefined) => {
    if (out.length >= 4) return;
    if (!c?.alive || c.abroad || seen.has(c.id) || played(s, c.id)) return;
    if (ageOf(s, c) < 14 || ageOf(s, c) > 65) return;
    if (c.role && ROLES[c.role].status > 2) return;
    seen.add(c.id);
    out.push(c);
  };
  const fam = (c: Character | undefined): Character[] =>
    c ? [s.chars[c.spouse], ...c.children.map((k) => s.chars[k])] : [];
  // Your fellows at a player's business, the old way.
  for (const l of s.lives)
    for (const pr of l.property ?? [])
      if (pr.prov === job.prov && pr.hands.includes(life.c))
        for (const h of [...pr.hands].sort((a, b) => a - b)) add(s.chars[h]);
  const here = (s.locals[job.prov] ?? [])
    .map((id) => s.chars[id])
    .filter(
      (c): c is Character => !!c?.role && ROLES[c.role].place === job.place,
    )
    .sort((a, b) => a.id - b.id);
  for (const c of here) add(c);
  for (const c of [s.chars[job.employer], ...here])
    for (const x of fam(c).sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0))) add(x);
  if (out.length < 2) {
    const folk = householdsOf(s, job.prov)
      .filter((c) => !c.role || ROLES[c.role].status <= 1)
      .sort((a, b) => a.id - b.id);
    for (const c of folk) add(c);
  }
  void w;
  return out;
}

// ---------------------------------------------------------------- the words of each kind of work

interface Words {
  /** A trick of the trade: "true a joint by eye". */
  task: string;
  /** What hurts people at it: "the saw". */
  hazard: string;
  /** The place: "the bench". */
  bench: string;
  /** An order that won't wait: "an order for the town". */
  order: string;
  /** A master's dishonest request, if the work has one: "give short weight". */
  cheat?: string;
}

const WORDS: Record<JobGroup, Words> = {
  land: {
    task: "get a field in before the rain without killing the team",
    hazard: "a reaping hook",
    bench: "the farm",
    order: "a cartload promised to the mill",
    cheat: "wet the tobacco so it weighs heavier",
  },
  craft: {
    task: "do by eye what you'd been doing with a rule",
    hazard: "the saw",
    bench: "the shop",
    order: "an order for a gentleman",
    cheat: "pass off seconds as best work",
  },
  sea: {
    task: "reef a topsail in half the time",
    hazard: "a falling block",
    bench: "the ship",
    order: "a lading that must catch the tide",
    cheat: "short the crew's rations and sell the difference",
  },
  trade: {
    task: "tot up a column in your head as fast as on paper",
    hazard: "a runaway dray",
    bench: "the counting room",
    order: "a ship's lading to check",
    cheat: "give short weight",
  },
  learned: {
    task: "find anything in the records in a minute",
    hazard: "a fever",
    bench: "the office",
    order: "papers wanted for the court",
  },
  arms: {
    task: "load and fire in three motions",
    hazard: "a musket that burst",
    bench: "the fort",
    order: "the colonel's inspection",
  },
  law: {
    task: "read a lying face",
    hazard: "a rogue's knife",
    bench: "the watch-house",
    order: "the sessions",
  },
  crime: {
    task: "lift a purse without a touch",
    hazard: "the watch's cudgels",
    bench: "the den",
    order: "a job tonight",
  },
  native: {
    task: "track a deer across bare stone",
    hazard: "a wounded bear",
    bench: "the village",
    order: "the trading season",
  },
};

function wordsOf(life: Life): Words {
  const job = life.job!;
  return WORDS[jobGroupOf(job.kind, JOBS[job.kind])];
}

/** A day's wage at your rung, at least a coin. */
function dayPay(life: Life): number {
  return Math.max(1, r1((rankOf(life)?.wage ?? 2) / 12));
}

const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Someone of the scene's: its character, if still alive and nobody's played character. */
function who(g: ConquestGame, ctx: LCtx): Character | undefined {
  const c = g.s.chars[ctx.c];
  return c?.alive && !played(g.s, c.id) ? c : undefined;
}

/** Remember it, if they're still there to. */
function mind(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  why: string,
  v: number,
  years = 1,
): void {
  const c = who(g, ctx);
  if (c) remembers(g, life, c, why, v, years);
}

/** Everyone you work with remembers it. */
function allMind(g: ConquestGame, life: Life, why: string, v: number): void {
  for (const c of colleaguesOf(g.s, g.w, life))
    remembers(g, life, c, why, v, 1);
}

// ---------------------------------------------------------------- the scenes

type When = (g: ConquestGame, life: Life) => boolean;

interface Scene {
  def: LifeEventDef;
  /** Who it's with: a colleague, or your master. */
  with: "colleague" | "master";
  when?: When;
}

const colonist: When = (g, life) => !lifeIsNative(g.s, life);
const rungFrom =
  (n: number): When =>
  (g, life) =>
    (life.job?.rank ?? 0) >= n;
const groups =
  (...xs: JobGroup[]): When =>
  (g, life) =>
    !!life.job && xs.includes(jobGroupOf(life.job.kind, JOBS[life.job.kind]));
const all =
  (...ws: When[]): When =>
  (g, life) =>
    ws.every((x) => x(g, life));

const SCENES = (): Scene[] => [
  // ---- the people you work beside
  {
    with: "colleague",
    def: {
      key: "cw-cover",
      pool: "raised",
      cooldown: 0,
      title: (g, life, ctx) =>
        `${who(g, ctx)?.first ?? "A fellow"} asks a favour`,
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)}, who works beside you at ${wordsOf(life).bench}, has a child sick at home and asks you to take ${his(c)} turn tomorrow as well as your own. ${cap(he(c))}'d do the same for you, ${he(c)} says.`;
      },
      choices: [
        {
          label: "Take the turn",
          tip: "A long day: a little more learned, a little more tired, and a friend at work.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "Covered for me", 8);
            addStress(g, life, 2);
            const job = life.job;
            if (job) gainXp(g, life, JOBS[job.kind].main, 4, true);
          },
        },
        {
          label: "Not this time",
          tip: "They'll find someone else, and remember you didn't.",
          apply: (g, life, ctx) => mind(g, life, ctx, "Wouldn't help me", -3),
        },
      ],
    },
  },
  {
    with: "colleague",
    def: {
      key: "cw-trick",
      pool: "raised",
      cooldown: 0,
      title: "A trick of the trade",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)}, who has been at it longer than you, watches you work and shakes ${his(c)} head. "Here," ${he(c)} says, and shows you how to ${wordsOf(life).task}.`;
      },
      choices: [
        {
          label: "Stand them a drink for it (½ coin)",
          tip: "You learn it properly, and they think the better of you.",
          blocked: (g, life) =>
            life.purse < 0.5 ? "Not a farthing on you" : null,
          apply: (g, life, ctx) => {
            spend(g, life, 0.5);
            const job = life.job;
            if (job) gainXp(g, life, JOBS[job.kind].main, 10, true);
            mind(g, life, ctx, "Stood me a drink", 4);
          },
        },
        {
          label: "Thank them, and practise it",
          tip: "You learn most of it.",
          apply: (g, life, ctx) => {
            const job = life.job;
            if (job) gainXp(g, life, JOBS[job.kind].main, 6, true);
            mind(g, life, ctx, "Willing to learn", 2);
          },
        },
        {
          label: "You know your own way",
          tip: "Nothing learned, and they're put out.",
          apply: (g, life, ctx) =>
            mind(g, life, ctx, "Thinks he knows best", -3),
        },
      ],
    },
  },
  {
    with: "colleague",
    def: {
      key: "cw-quarrel",
      pool: "raised",
      cooldown: 0,
      title: (g, life, ctx) =>
        `${who(g, ctx)?.first ?? "A fellow"} has a grievance`,
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)} says, in front of the others, that you took the credit for ${his(c)} work last week. It isn't quite true, and it isn't quite false.`;
      },
      choices: [
        {
          label: "Talk it through with them",
          tip: "Done well, you're friends after. Done badly, it's worse.",
          check: { skill: "persuasion", dc: 6 },
          apply: (g, life, ctx, pass) => {
            if (pass) mind(g, life, ctx, "Made it up with me", 5);
            else {
              mind(g, life, ctx, "Took my credit", -6);
              addStress(g, life, 3);
            }
          },
        },
        {
          label: "Give them the credit, and your master hears of it",
          tip: "They're mollified; your master thinks a little less of you.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "Owned up", 6);
            const boss = npcMaster(g.s, life);
            if (boss)
              remembers(g, life, boss, "Took another's credit", -2, 0.5);
          },
        },
        {
          label: "Tell them to mind their own work",
          tip: "A grudge at work.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "Told me where to go", -10, 2);
            addStress(g, life, -1);
          },
        },
      ],
    },
  },
  {
    with: "colleague",
    when: (g, life) => {
      const job = life.job;
      if (!job || job.own || !npcMaster(g.s, life)) return false;
      const v = promotionView(g.s, life);
      return !!v.next && !v.next.buy && job.months >= v.next.months - 2;
    },
    def: {
      key: "cw-rival",
      pool: "raised",
      cooldown: 0,
      title: "A rival for the next rung",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        const next = promotionView(g.s, life).next;
        return `${charName(c)} has an eye on the same rung as you (${next?.title.toLowerCase() ?? "the next"}), and is making sure the master sees ${his(c)} work.`;
      },
      choices: [
        {
          label: "Outwork them",
          tip: "Long hours for a month: your master notices, and you feel it.",
          apply: (g, life, ctx) => {
            const boss = npcMaster(g.s, life);
            if (boss)
              remembers(g, life, boss, "Works harder than anyone", 8, 0.5);
            addStress(g, life, 4);
            const job = life.job;
            if (job) gainXp(g, life, JOBS[job.kind].main, 6, true);
            mind(g, life, ctx, "A hard rival", -2);
          },
        },
        {
          label: "Put a word in the master's ear about them",
          tip: "Quietly done, they're out of the running. Seen, you're the tale-bearer.",
          check: { skill: "stealth", dc: 7 },
          apply: (g, life, ctx, pass) => {
            const boss = npcMaster(g.s, life);
            mind(g, life, ctx, "Told tales on me", -15, 3);
            if (boss)
              remembers(
                g,
                life,
                boss,
                pass ? "Keeps me informed" : "A tale-bearer",
                pass ? 3 : -8,
                1,
              );
          },
        },
        {
          label: "Let the better one win",
          tip: "A fair rival: they respect you for it, and so does the town.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "A fair rival", 5);
            addRenown(g, life, 0.5);
          },
        },
      ],
    },
  },
  {
    with: "colleague",
    def: {
      key: "cw-collection",
      pool: "raised",
      cooldown: 0,
      title: "A collection",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)} was hurt by ${wordsOf(life).hazard} and can't work for a month or more. The others are putting something in a hat for ${his(c)} family.`;
      },
      choices: [
        {
          label: (g, life) => `Give a day's pay (${dayPay(life)} coins)`,
          tip: "Everyone you work with thinks the better of you, and the town hears.",
          blocked: (g, life) =>
            life.purse < dayPay(life) ? "You haven't it to give" : null,
          apply: (g, life, ctx) => {
            spend(g, life, dayPay(life));
            allMind(g, life, "Gave to the collection", 3);
            mind(g, life, ctx, "Helped my family", 8);
            addRenown(g, life, 0.5);
          },
        },
        {
          label: "Give what you can spare (½ coin)",
          tip: "Enough.",
          blocked: (g, life) => (life.purse < 0.5 ? "You haven't it" : null),
          apply: (g, life, ctx) => {
            spend(g, life, 0.5);
            mind(g, life, ctx, "Helped my family", 3);
          },
        },
        {
          label: "Keep your coin",
          tip: "The others notice.",
          apply: (g, life) => allMind(g, life, "Tight-fisted", -2),
        },
      ],
    },
  },
  {
    with: "colleague",
    when: (g, life) =>
      colonist(g, life) && hasPlace(g.s, g.w, life.prov, "tavern"),
    def: {
      key: "cw-drink",
      pool: "raised",
      cooldown: 0,
      scene: "tavern",
      title: "After the week's work",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `It's Saturday night, and ${charName(c)} and the others from ${wordsOf(life).bench} are going to the tavern. "Coming?"`;
      },
      choices: [
        {
          label: "Go along (½ coin)",
          tip: "An easier mind, and the people you work with like you better.",
          blocked: (g, life) =>
            life.purse < 0.5 ? "Not a farthing on you" : null,
          apply: (g, life) => {
            spend(g, life, 0.5);
            addStress(g, life, -4);
            allMind(g, life, "Good company after work", 2);
          },
        },
        {
          label: "Go home",
          tip: "Another time.",
          apply: () => undefined,
        },
      ],
    },
  },
  {
    with: "colleague",
    when: all(
      rungFrom(2),
      groups("craft", "land", "sea", "trade", "learned"),
      (g, life) => !!npcMaster(g.s, life),
    ),
    def: {
      key: "cw-boy",
      pool: "raised",
      cooldown: 0,
      title: "A new boy put under you",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `Your master puts a new boy under you, ${charName(c)}'s nephew: willing, clumsy, and yours to make something of.`;
      },
      choices: [
        {
          label: "Teach him properly",
          tip: "Leadership, your master's good opinion, a little more on your mind.",
          apply: (g, life, ctx) => {
            gainXp(g, life, "leadership", 8, true);
            const boss = npcMaster(g.s, life);
            if (boss) remembers(g, life, boss, "Brings the boys on", 4, 0.5);
            mind(g, life, ctx, "Taught my nephew", 5);
            addStress(g, life, 2);
          },
        },
        {
          label: "Set him to sweeping",
          tip: "It'll do.",
          apply: () => undefined,
        },
      ],
    },
  },
  // ---- your master
  {
    with: "master",
    when: all(colonist, groups("land", "craft", "sea", "trade", "learned")),
    def: {
      key: "mw-sabbath",
      pool: "raised",
      cooldown: 0,
      title: "Work on the Sabbath",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)} wants you in on the Sabbath: ${wordsOf(life).order} won't wait. ${cap(he(c))}'ll pay double for the day.`;
      },
      choices: [
        {
          label: (g, life) => `Come in (${r1(dayPay(life) * 2)} coins)`,
          tip: "Double a day's pay and your master's thanks; tired, and the godly won't like it.",
          apply: (g, life, ctx) => {
            earn(g, life, r1(dayPay(life) * 2));
            mind(g, life, ctx, "Came in on the Sabbath", 5, 0.5);
            const me = meOf(g.s, life);
            addStress(g, life, me && hasTrait(me, "zealous") ? 5 : 2);
          },
        },
        {
          label: "Keep the Sabbath",
          tip: "Your master is put out; your conscience isn't.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "Kept the Sabbath on me", -3, 0.5);
            gainXp(g, life, "faith", 4);
            addStress(g, life, -1);
          },
        },
      ],
    },
  },
  {
    with: "master",
    when: rungFrom(1),
    def: {
      key: "mw-mind",
      pool: "raised",
      cooldown: 0,
      title: "Mind the place",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)} is away for a week on business and asks you to mind ${wordsOf(life).bench} in ${his(c)} place: the people, the orders, the money.`;
      },
      choices: [
        {
          label: "Mind it",
          tip: "Done well: your master's trust, renown, a little more pay. Done badly: a mess to answer for.",
          check: {
            skill: (g, life) => JOBS[life.job?.kind ?? "farmer"].main,
            dc: (g, life) => 6 + (life.job?.rank ?? 0),
          },
          apply: (g, life, ctx, pass) => {
            gainXp(g, life, "leadership", 6, true);
            if (pass) {
              mind(g, life, ctx, "Minded the place for me", 10, 1);
              addRenown(g, life, 1);
              earn(g, life, r1((rankOf(life)?.wage ?? 2) * 0.25));
              journal(g, life, "The week went off without a hitch.", "good");
            } else {
              mind(g, life, ctx, "Made a mess of it", -6, 1);
              addStress(g, life, 4);
              journal(g, life, "It was a long week, and it shows.", "bad");
            }
          },
        },
        {
          label: "You're not ready",
          tip: "No harm done; no trust earned.",
          apply: (g, life, ctx) =>
            mind(g, life, ctx, "Wouldn't step up", -1, 0.5),
        },
      ],
    },
  },
  {
    with: "master",
    when: all(colonist, groups("land", "craft", "sea", "trade")),
    def: {
      key: "mw-short",
      pool: "raised",
      cooldown: 0,
      title: "Not quite honest",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `${charName(c)} wants you to ${wordsOf(life).cheat ?? "cut a corner"}. "Everybody does it," ${he(c)} says, and slips you something for your trouble.`;
      },
      choices: [
        {
          label: "Do as you're told",
          tip: "A little extra and your master's favour; 1 in 6 it comes out, and the town talks.",
          apply: (g, life, ctx) => {
            earn(g, life, r1((rankOf(life)?.wage ?? 2) * 0.25));
            mind(g, life, ctx, "Does as he's told", 6, 1);
            const me = meOf(g.s, life);
            if (me && hasTrait(me, "honest")) addStress(g, life, 6);
            if (wdice(g.s, 3, life.c, g.s.day).chance(1 / 6)) {
              addRenown(g, life, -2);
              rumour(
                g,
                life.prov,
                `They say ${charName(me)} cheats the customers at ${charName(who(g, ctx))}'s.`,
                life.c,
                "bad",
              );
              journal(g, life, "It came out. People talk.", "bad");
            }
          },
        },
        {
          label: "Refuse",
          tip: "Your master is put out; an honest heart rests easier.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "Wouldn't do as asked", -8, 1);
            const me = meOf(g.s, life);
            if (me && hasTrait(me, "honest")) {
              addStress(g, life, -2);
              addRenown(g, life, 0.5);
            }
          },
        },
        {
          label: "Refuse, and tell the magistrate",
          tip: "Renown for it, and an enemy of your master: 1 in 3 he turns you off.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx, "Informed on me", -20, 3);
            addRenown(g, life, 2);
            if (wdice(g.s, 4, life.c, g.s.day).chance(1 / 3) && life.job) {
              journal(
                g,
                life,
                `${charName(who(g, ctx))} turns you off.`,
                "bad",
              );
              leaveJob(g, life, "for informing on your master");
            }
          },
        },
      ],
    },
  },
  {
    with: "master",
    when: all(colonist, groups("land", "craft", "sea", "trade", "learned")),
    def: {
      key: "mw-debt",
      pool: "raised",
      cooldown: 0,
      title: "A debt to collect",
      body: (g, life, ctx) => {
        const c = who(g, ctx);
        return `A customer has been dodging ${charName(c)} for months over a bill. ${cap(he(c))} wants you to go round and get the money, and you'll have a share of it.`;
      },
      choices: [
        {
          label: "Talk him into paying",
          tip: "A share of it and your master's thanks; or a wasted afternoon.",
          check: { skill: "persuasion", dc: 7 },
          apply: (g, life, ctx, pass) => {
            if (pass) {
              earn(g, life, r1((rankOf(life)?.wage ?? 2) * 0.2));
              mind(g, life, ctx, "Got my money back", 6, 1);
            } else {
              mind(g, life, ctx, "Came back empty-handed", -2, 0.5);
              addStress(g, life, 2);
            }
          },
        },
        {
          label: "Lean on him",
          tip: "More of it, and a rough name; or a black eye.",
          check: { skill: "fighting", dc: 6 },
          apply: (g, life, ctx, pass) => {
            if (pass) {
              earn(g, life, r1((rankOf(life)?.wage ?? 2) * 0.3));
              mind(g, life, ctx, "Got my money back", 4, 1);
              addRenown(g, life, -0.5);
            } else {
              hurt(g, life, 5, "a debtor who hit back");
              addStress(g, life, 3);
            }
          },
        },
        {
          label: "That's not your work",
          tip: "Your master is a little put out.",
          apply: (g, life, ctx) =>
            mind(g, life, ctx, "Wouldn't do as asked", -2, 0.5),
        },
      ],
    },
  },
];

let built: Scene[] | null = null;

function scenes(): Scene[] {
  if (built) return built;
  built = SCENES();
  for (const sc of built)
    sc.def.scene ??= (g, life) => life.job?.place ?? "home";
  registerFamily(
    "colleagues",
    built.filter((x) => x.with === "colleague").map((x) => x.def.key),
    FAMILY_DAYS.colleagues,
  );
  registerFamily(
    "masters",
    built.filter((x) => x.with === "master").map((x) => x.def.key),
    FAMILY_DAYS.masters,
  );
  return built;
}

/** The scenes of the working day (LifeEvents adds them the first time it looks one up). */
export function workDayEvents(): LifeEventDef[] {
  return scenes().map((x) => x.def);
}

/** Left unanswered, each takes its quiet course: nothing ventured, nobody informed on. */
export const QUIET: Record<string, number> = {
  "cw-cover": 1,
  "cw-trick": 1,
  "cw-quarrel": 1,
  "cw-rival": 2,
  "cw-collection": 2,
  "cw-drink": 1,
  "cw-boy": 1,
  "mw-sabbath": 1,
  "mw-mind": 1,
  "mw-short": 1,
  "mw-debt": 2,
};

export function workDayQuiet(): Record<string, number> {
  scenes();
  return QUIET;
}

// ---------------------------------------------------------------- when they come

/**
 * Each day at your post, a working day, with no letters waiting: maybe one
 * of the people you work with comes to you, or your master asks something.
 */
export function workDayDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  const job = life.job;
  if (!WORKDAY.on) return;
  if (!job || life.c < 0 || life.watching || life.events.length) return;
  if (((s.day % 7) + 7) % 7 === 0 || isChildLife(s, life)) return;
  if (!atPost(s, g.w, life) || life.travel) return;
  const r = wdice(s, 5, life.c, s.day);
  const roll = r.next();
  const kind: "colleague" | "master" | null =
    roll < COLLEAGUE_CHANCE
      ? "colleague"
      : roll < COLLEAGUE_CHANCE + MASTER_CHANCE
        ? "master"
        : null;
  if (!kind) return;
  const fam = kind === "colleague" ? "colleagues" : "masters";
  if (familyResting(s, life, fam)) return;
  const boss = npcMaster(s, life);
  const mates = colleaguesOf(s, g.w, life);
  if (kind === "master" && !boss) return;
  if (kind === "colleague" && !mates.length) return;
  const open = scenes().filter(
    (x) =>
      x.with === kind &&
      (life.cooldowns[`ev:${x.def.key}`] ?? 0) <= s.day &&
      (!x.when || x.when(g, life)),
  );
  if (!open.length) return;
  const pick = open[r.int(0, open.length - 1)];
  const c = kind === "master" ? boss! : mates[r.int(0, mates.length - 1)];
  // Nobody begs who isn't short: a collection is for someone who'd need it.
  if (pick.def.key === "cw-collection" && !wouldBeg(s, c, 3)) return;
  touchLife(g, life).cooldowns[`ev:${pick.def.key}`] = s.day + SCENE_REST;
  raiseEvent(g, life, pick.def.key, { c: c.id });
}

hooks.lifeDaily.push(workDayDaily);
