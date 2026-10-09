// More of what happens in a life: the master who writes when you're away
// and the one who calls you in to move you up, letters from friends and
// family far off, a rival turned nemesis, and everything another player puts
// to you (friendship, courting, marriage, a duel, a job, a trade), each a
// scene to answer.

import type { ConquestGame } from "./Game";
import { answerProposal } from "./Interactions";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { meOf, opinionOf, rankOf } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import { charName } from "./Queries";
import type { Character, Life, PersonAct } from "./Types";
import { GOODS, PERSON_ACTS } from "./Types";
import { leaveJob, promote } from "./Work";

const who = (g: ConquestGame, ctx: LCtx): Character | undefined =>
  g.s.chars[ctx.c];
const name = (g: ConquestGame, ctx: LCtx) => charName(who(g, ctx));
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const title = (life: Life) => rankOf(life)?.title.toLowerCase() ?? "hand";

/** A proposal from another player: accept or refuse. */
function p2p(
  act: PersonAct,
  heading: string,
  body: (g: ConquestGame, life: Life, ctx: LCtx) => string,
  yes: string,
  no: string,
  yesTip: string,
  scene = "tavern",
): LifeEventDef {
  return {
    key: `p2p-${act}`,
    pool: "raised",
    cooldown: 0,
    scene,
    title: heading,
    body,
    choices: [
      {
        label: yes,
        tip: yesTip,
        apply: (g, life, ctx) => answerProposal(g, life, act, ctx, true),
      },
      {
        label: no,
        tip: "They'll hear you said no.",
        apply: (g, life, ctx) => answerProposal(g, life, act, ctx, false),
      },
    ],
  };
}

export const MORE_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ your master
  {
    key: "boss-where",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "A letter from your master",
    body: (g, life, ctx) =>
      `"Where the devil are you? Three weeks now and your place stands empty. I can hold it another three, and not a day more." It's signed ${name(g, ctx)}, and underlined twice.`,
    choices: [
      {
        label: "Hurry back",
        tip: "Nothing changes, but you'd better be at your post within three weeks.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (c?.alive)
            remembers(g, life, g.char(c.id), "Answered my letter", 3, 1);
        },
      },
      {
        label: "Write back that you've quit",
        tip: "You leave your work now, on your own terms.",
        apply: (g, life) => leaveJob(g, life, "by letter"),
      },
    ],
  },
  {
    key: "boss-dismissed",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "Your place is gone",
    body: (g, life, ctx) =>
      `${cap(name(g, ctx))} has given your place to someone who turns up. ${cap(he(who(g, ctx)))} won't say you were a bad worker, exactly. ${cap(he(who(g, ctx)))} won't say much about you at all.`,
    choices: [
      {
        label: "Their loss",
        tip: "You'll find work elsewhere: ask whoever hires.",
        apply: (g, life) => addStress(g, life, 4),
      },
    ],
  },
  {
    key: "boss-promotion",
    pool: "raised",
    cooldown: 0,
    title: "Called in",
    body: (g, life, ctx) => {
      const next = life.job
        ? JOBS[life.job.kind].ranks[life.job.rank + 1]
        : undefined;
      return `${cap(name(g, ctx))} calls you in, shuts the door, and pours two glasses. "You've done well here. I want you as ${next?.title.toLowerCase() ?? "something better"}: ${next?.wage ?? "more"} coins a month. Well?"`;
    },
    choices: [
      {
        label: "Accept, gratefully",
        tip: "Promoted. Your master thinks the better of you.",
        blocked: (g, life) => (life.job ? null : "You've no work now"),
        apply: (g, life, ctx) => {
          if (!life.job) return;
          promote(g, life);
          const c = who(g, ctx);
          if (c?.alive)
            remembers(g, life, g.char(c.id), "Grateful for the chance", 6, 2);
        },
      },
      {
        label: "Ask for a little more",
        tip: "Persuasion: a bonus of 5 coins too; fail, and they're put out (still promoted).",
        check: { skill: "persuasion", dc: 8 },
        blocked: (g, life) => (life.job ? null : "You've no work now"),
        apply: (g, life, ctx, pass) => {
          if (!life.job) return;
          promote(g, life);
          const c = who(g, ctx);
          if (pass) {
            earn(g, life, 5);
            journal(g, life, "And a purse of five coins to seal it.", "good");
          } else if (c?.alive)
            remembers(g, life, g.char(c.id), "Greedy", -6, 2);
        },
      },
      {
        label: "Decline: you're happy as you are",
        tip: "Stay on your rung. Less stress, a puzzled master.",
        apply: (g, life) => addStress(g, life, -5),
      },
    ],
  },
  {
    key: "commission-offer",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A commission",
    body: (g, life, ctx) => {
      const next = life.job
        ? JOBS[life.job.kind].ranks[life.job.rank + 1]
        : undefined;
      return `${cap(name(g, ctx))} has signed a commission with your name on it: ${next?.title.toLowerCase() ?? "an officer"}. "The colony needs officers who've seen the thing done. Don't make me regret it."`;
    },
    choices: [
      {
        label: "Take the commission",
        tip: "Promoted to the next rank.",
        blocked: (g, life) =>
          life.job ? null : "You've no commission to take up",
        apply: (g, life, ctx) => {
          if (!life.job) return;
          promote(g, life);
          const c = who(g, ctx);
          if (c?.alive) remembers(g, life, g.char(c.id), "My officer", 5, 3);
        },
      },
      {
        label: "Not yet",
        tip: "Nothing changes.",
        apply: () => undefined,
      },
    ],
  },
  // ------------------------------------------------ enemies
  {
    key: "nemesis-sworn",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    title: "An enemy for life",
    body: (g, life, ctx) =>
      `${cap(name(g, ctx))} crossed the room to say it to your face, so everyone could hear: there's no room in this country for the both of you. Rivals fall out; this is something else.`,
    choices: [
      {
        label: "So be it",
        tip: "They become your nemesis: they'll work against you, and you against them.",
        apply: (g, life, ctx) => {
          setTie(g, life, ctx.c, "nemesis");
          addStress(g, life, 6);
        },
      },
      {
        label: "Try to make peace (5 coins)",
        tip: "Persuasion: the quarrel cools to a rivalry and some of the bile drains away.",
        check: { skill: "persuasion", dc: 10 },
        blocked: (g, life) => (life.purse < 5 ? "Needs 5 coins" : null),
        apply: (g, life, ctx, pass) => {
          spend(g, life, 5);
          const c = who(g, ctx);
          if (!c?.alive) return;
          if (pass) {
            remembers(g, life, g.char(c.id), "Offered peace", 25, 3);
            journal(
              g,
              life,
              `${charName(c)} took the coins and, grudgingly, your hand.`,
              "good",
            );
          } else {
            setTie(g, life, c.id, "nemesis");
            journal(
              g,
              life,
              `${charName(c)} threw the coins in your face.`,
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "nemesis-plot",
    pool: "any",
    cooldown: 300,
    weight: 3,
    when: (g, life) => {
      const id = Object.entries(life.ties).find(
        ([, t]) => t === "nemesis",
      )?.[0];
      const c = id !== undefined ? g.s.chars[Number(id)] : undefined;
      return c?.alive ? { c: c.id } : null;
    },
    scene: "road",
    title: "Footsteps behind you",
    body: (g, life, ctx) =>
      `Two men have been behind you since the market. One of them you've seen drinking with ${name(g, ctx)}. The lane ahead is narrow and dark.`,
    choices: [
      {
        label: "Turn and face them",
        tip: "Fighting: they run, and the town hears of it; lose and you're beaten badly.",
        check: { skill: "fighting", dc: 9 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            addRenown(g, life, 3);
            journal(
              g,
              life,
              `You sent ${name(g, ctx)}'s bullies off with bloody noses.`,
              "good",
            );
          } else {
            touchLife(g, life).health = Math.max(1, life.health - 18);
            journal(
              g,
              life,
              `${cap(name(g, ctx))}'s men left you in the gutter.`,
              "bad",
            );
          }
        },
      },
      {
        label: "Duck into a doorway",
        tip: "Stealth: they lose you. Fail and they catch you anyway.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, ctx, pass) => {
          if (!pass) {
            touchLife(g, life).health = Math.max(1, life.health - 12);
            journal(g, life, "They found the doorway too.", "bad");
          } else journal(g, life, "They walked straight past you, swearing.");
        },
      },
    ],
  },
  // ------------------------------------------------ letters
  {
    key: "letter-friend",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "A letter from a friend",
    body: (g, life, ctx) => {
      const c = who(g, ctx);
      const where = g.map.provinces[c?.home ?? -1]?.name ?? "far off";
      return `${cap(name(g, ctx))} writes from ${where}: the harvest, a new baby down the lane, a quarrel with the minister, and at the end, "I think of you often, and of the old times. Write back, you dog."`;
    },
    choices: [
      {
        label: "Write a long letter back",
        tip: "Letters; your friendship grows (+10). Less stress.",
        apply: (g, life, ctx) => {
          gainXp(g, life, "letters", 6);
          addStress(g, life, -5);
          const c = who(g, ctx);
          if (c?.alive)
            remembers(g, life, g.char(c.id), "Writes faithfully", 10, 2);
        },
      },
      {
        label: "Mean to answer, and don't",
        tip: "Their opinion of you slips (−5).",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (c?.alive) remembers(g, life, g.char(c.id), "Never writes", -5, 1);
        },
      },
    ],
  },
  {
    key: "letter-kin",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "News from home",
    body: (g, life, ctx) =>
      `A letter in ${name(g, ctx)}'s hand, crossed and recrossed to save paper. Everyone is well, except those who aren't. There's a line at the end about money, very small.`,
    choices: [
      {
        label: "Send something home (5 coins)",
        tip: "Family is family. +15 opinion.",
        blocked: (g, life) => (life.purse < 5 ? "Needs 5 coins" : null),
        apply: (g, life, ctx) => {
          spend(g, life, 5);
          addStress(g, life, -4);
          const c = who(g, ctx);
          if (c?.alive)
            remembers(g, life, g.char(c.id), "Sent money home", 15, 3);
        },
      },
      {
        label: "Send your love, and nothing else",
        tip: "Nothing changes much.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "letter-patron",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "Your patron writes",
    body: (g, life, ctx) =>
      `${cap(name(g, ctx))} has heard good things, ${his(who(g, ctx))} letter says, and would like to hear more of them. A dinner is mentioned. So, in passing, is a favour.`,
    choices: [
      {
        label: "Do the favour",
        tip: "Costs 4 coins and some trouble; your patron is pleased (+15), renown +2.",
        blocked: (g, life) => (life.purse < 4 ? "Needs 4 coins" : null),
        apply: (g, life, ctx) => {
          spend(g, life, 4);
          addRenown(g, life, 2);
          const c = who(g, ctx);
          if (c?.alive) remembers(g, life, g.char(c.id), "Obliging", 15, 2);
        },
      },
      {
        label: "Plead pressing business",
        tip: "Your patron cools (−8).",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (c?.alive)
            remembers(g, life, g.char(c.id), "Too busy for me", -8, 2);
        },
      },
    ],
  },
  {
    key: "friend-visit",
    pool: "any",
    cooldown: 200,
    weight: 2,
    when: (g, life) => {
      if (life.prov !== life.home || life.travel) return null;
      const id = Object.entries(life.ties).find(
        ([k, t]) =>
          (t === "friend" || t === "mentor") &&
          g.s.chars[Number(k)]?.alive &&
          g.s.chars[Number(k)].home === life.prov,
      )?.[0];
      return id !== undefined ? { c: Number(id) } : null;
    },
    scene: "home",
    title: "A knock at the door",
    body: (g, life, ctx) =>
      `${cap(name(g, ctx))} has come to call, with a jug under one arm and a grievance about the price of everything under the other. "I was passing," ${he(who(g, ctx))} says. Nobody passes your door by accident.`,
    choices: [
      {
        label: "Open the good bottle",
        tip: "A fine evening: −10 stress, +8 opinion. Costs 1 coin.",
        apply: (g, life, ctx) => {
          spend(g, life, 1);
          addStress(g, life, -10);
          const c = who(g, ctx);
          if (c?.alive)
            remembers(g, life, g.char(c.id), "A fine evening", 8, 2);
        },
      },
      {
        label: "Talk business",
        tip: "Trade: you learn something useful (+trade XP), and they find you a little dull.",
        apply: (g, life, ctx) => {
          gainXp(g, life, "trade", 8);
          const c = who(g, ctx);
          if (c?.alive) remembers(g, life, g.char(c.id), "All business", -3, 1);
        },
      },
    ],
  },
  // ------------------------------------------------ other players
  p2p(
    "befriend",
    "A hand of friendship",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} holds out a hand: "We've knocked about long enough. Friends?" It's a fair question, and the room is watching.`,
    "Take their hand",
    "Not just now",
    "You become friends: each of you eases the other's cares.",
  ),
  p2p(
    "court",
    "Walking out",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} asks, with more nerve than is usual, whether you'd walk out together after church. There are flowers involved, slightly crushed.`,
    "Walk out with them",
    "Decline politely",
    "You both think better of each other; sweethearts if you're fond enough.",
    "market",
  ),
  p2p(
    "propose",
    "A proposal",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} goes down on one knee, which in that coat is brave. "Marry me." If you say yes you'll go to live at ${g.map.provinces[g.s.lives.find((l) => l.c === ctx.c)?.home ?? -1]?.name ?? "their home"}.`,
    "Yes",
    "No",
    "Married: you move into their home.",
    "church",
  ),
  p2p(
    "duel",
    "A challenge",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} has thrown down a glove: pistols at dawn, or swords, your choice. Refuse and the whole town will hear of it by noon.`,
    "Accept the challenge",
    "Refuse",
    "Fight: fighting against fighting. The loser is hurt; someone may die. Refusing costs renown.",
    "duel",
  ),
  p2p(
    "recruit",
    "Join the cause?",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} leans close over the table. There's a cause, and a meeting, and they want you in it. They say the hour is coming.`,
    "Swear yourself to it",
    "Keep out of it",
    "You join their movement.",
  ),
  p2p(
    "hire",
    "An offer of work",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} needs a hand at ${his(who(g, ctx))} business and would take you on: ${ctx.wage ?? 3} coins a month or so, paid out of ${his(who(g, ctx))} own purse.`,
    "Take the place",
    "No, thank you",
    "You go to work for them (you'll need to be without other work).",
    "workshop",
  ),
  p2p(
    "trade",
    "An offer to trade",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} has ${ctx.qty} loads of ${GOODS[ctx.good] ?? "goods"} and will let you have the lot for ${ctx.price} coins.`,
    "Buy them",
    "Not at that price",
    "You pay the price and take the goods (if you can carry them).",
    "market",
  ),
  {
    key: "p2p-reply",
    pool: "raised",
    cooldown: 0,
    title: (g, life, ctx) => `${cap(name(g, ctx))} answers`,
    body: (g, life, ctx) => {
      const act = PERSON_ACTS[ctx.act] ?? "talk";
      const yes = ctx.yes === 1;
      const what: Partial<Record<PersonAct, string>> = {
        befriend: yes
          ? "takes your hand: friends."
          : "isn't ready to call you a friend.",
        court: yes
          ? "walked out with you, and it went well."
          : "won't walk out with you.",
        propose: yes ? "said yes! You're married." : "said no. Gently, but no.",
        duel: yes
          ? "met you at dawn."
          : "refused your challenge, and the town knows it.",
        recruit: yes
          ? "is with the cause."
          : "wants nothing to do with your cause.",
        hire: yes ? "comes to work for you." : "won't work for you.",
        trade: yes
          ? "bought what you were selling."
          : "wouldn't pay your price.",
      };
      return `${cap(name(g, ctx))} ${what[act] ?? (yes ? "agreed." : "said no.")}`;
    },
    choices: [
      {
        label: "Very well",
        tip: "",
        apply: () => undefined,
      },
    ],
  },
];

/** Events that come by letter, carried by a messenger on the map. */
export const LETTER_KEYS = [
  "boss-where",
  "letter-friend",
  "letter-kin",
  "letter-patron",
];

/** Someone a life might hear from this month, and what they'd write. */
export function letterWriter(
  g: ConquestGame,
  life: Life,
): { key: string; from: Character } | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return null;
  const far = (c: Character | undefined) =>
    !!c?.alive && !c.abroad && c.home !== undefined && c.home !== life.prov;
  for (const [k, t] of Object.entries(life.ties)) {
    const c = s.chars[Number(k)];
    if ((t === "friend" || t === "lover") && far(c) && g.rng.chance(0.06))
      return { key: "letter-friend", from: c };
  }
  for (const id of [me.father, me.mother]) {
    const c = s.chars[id];
    if (far(c) && g.rng.chance(0.04)) return { key: "letter-kin", from: c };
  }
  const patron = s.chars[life.patron];
  if (
    far(patron) &&
    opinionOf(s, patron, life).total > 20 &&
    g.rng.chance(0.04)
  )
    return { key: "letter-patron", from: patron };
  void title;
  return null;
}
