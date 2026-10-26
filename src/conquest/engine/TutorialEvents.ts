// CQTUT (r26): the first life's own letters, raised by the lessons
// (Tutorial.ts) at their steps and nowhere else. They're gentle: a check
// that fails costs a little peace of mind, never health, and at most a coin
// or two is spent, by choice. Boston and Plymouth in 1700 as they were: the
// Town Dock and Middle Street, the dame school, Sunday meeting, coopers'
// marks cut in a barrel's head.

import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  remembers,
  setTie,
  spend,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { skillLevel } from "./LifeQueries";
import { charName } from "./Queries";
import type { Character, Life, Skill } from "./Types";

const who = (
  g: ConquestGame,
  id: number | undefined,
): Character | undefined => {
  const c = id === undefined ? undefined : g.s.chars[id];
  return c?.alive ? c : undefined;
};
const name = (g: ConquestGame, id: number | undefined, or: string) => {
  const c = who(g, id);
  return c ? charName(c) : or;
};
const first = (g: ConquestGame, id: number | undefined, or: string) =>
  who(g, id)?.first ?? or;
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const He = (c: Character | undefined) => (c?.female ? "She" : "He");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");

/** A check set so its odds come out near `odds` for this life (the shown odds are the rolled ones). */
function dcFor(g: ConquestGame, life: Life, sk: Skill, odds: number): number {
  const lvl = skillLevel(g.s, life, sk);
  return Math.round(lvl - (odds - 0.6) / 0.07);
}

/** Someone remembers it (if they're still about). */
function mind(
  g: ConquestGame,
  life: Life,
  id: number | undefined,
  why: string,
  v: number,
): void {
  const c = who(g, id);
  if (c) remembers(g, life, c, why, v);
}

/** Make someone a friend, or a rival (if they're still about). */
function tie(
  g: ConquestGame,
  life: Life,
  id: number | undefined,
  t: "friend" | "rival",
): void {
  const c = who(g, id);
  if (c && life.ties[c.id] !== t) setTie(g, life, c.id, t);
}

const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coin${n === 1 ? "" : "s"}` : null;

let made: LifeEventDef[] | null = null;

/** The letters, made once (LifeEvents adds them the first time one is looked up). */
export function tutorialEvents(): LifeEventDef[] {
  return (made ??= [
    // ------------------------------------------------ step "talk": a friend
    {
      key: "tut-friend",
      pool: "raised",
      cooldown: 0,
      scene: "workshop",
      where: {},
      title: "A favour from next door",
      body: (g, life, ctx: LCtx) => {
        const c = who(g, ctx.c);
        return `${name(g, ctx.c, "Your neighbour")}, who keeps the cooperage next to your master's, comes round the partition wiping ${his(c)} hands. "${first(g, ctx.w, "My wife")}'s time has come early," ${he(c)} says, "and I've forty hogsheads promised to the Bristol ship by Saturday. Could you take my bench this afternoon? I'll not forget it."`;
      },
      choices: [
        {
          label: "Take the bench for the afternoon",
          tip: "An afternoon's work for thanks alone: a friend made, a little tired. You learn something of your craft.",
          apply: (g, life, ctx) => {
            tie(g, life, ctx.c, "friend");
            mind(g, life, ctx.c, "took my bench when I needed it", 15);
            gainXp(g, life, "craft", 10);
            addStress(g, life, 3);
            say(
              g,
              life,
              `You worked ${name(g, ctx.c, "your neighbour")}'s bench till dark. A daughter, ${he(who(g, ctx.c))} tells you in the morning, grinning like a fool. You have a friend next door.`,
              "good",
            );
          },
        },
        {
          label: "Lend a coin for the midwife (1 coin)",
          tip: "A coin, gladly given: a friend made, and your own work done.",
          blocked: (g, life) => poor(life, 1),
          apply: (g, life, ctx) => {
            spend(g, life, 1);
            tie(g, life, ctx.c, "friend");
            mind(g, life, ctx.c, "lent me the midwife's fee", 12);
            say(
              g,
              life,
              `You pressed a coin on ${name(g, ctx.c, "your neighbour")} for the midwife. A daughter, by the morning, and a friend next door.`,
              "good",
            );
          },
        },
        {
          label: "You've barrels of your own to hoop",
          tip: "No friend made, and no harm done.",
          apply: (g, life, ctx) => {
            say(
              g,
              life,
              `${name(g, ctx.c, "Your neighbour")} nods and goes to ask someone else. ${He(who(g, ctx.c))} doesn't hold it against you.`,
            );
          },
        },
      ],
    },
    // ------------------------------------------------ step "rival": a letter with odds
    {
      key: "tut-rival",
      pool: "raised",
      cooldown: 0,
      scene: "workshop",
      where: {},
      title: "The Bristol hogsheads",
      body: (g, life, ctx) => {
        const c = who(g, ctx.c);
        const m = who(g, ctx.m);
        return `${name(g, ctx.c, "A cooper from across the lane")} is in your master's yard with ${his(c)} hat on, which is never a good sign. ${He(c)} swears the six hogsheads you hooped for the Bristol ship are ${his(c)} shop's work, sold cheap and passed off as yours. ${m ? charName(m) : "Your master"} looks from ${first(g, ctx.c, "the cooper")} to you and back again.`;
      },
      choices: [
        {
          label: "Show them your mark on the heads",
          tip: "If it goes your way: +2 renown, and your master thinks the better of you. If not: a little stress. Either way, an enemy across the lane.",
          check: {
            skill: "craft",
            dc: (g, life) => dcFor(g, life, "craft", 0.8),
          },
          apply: (g, life, ctx, pass) => {
            tie(g, life, ctx.c, "rival");
            mind(g, life, ctx.c, "shamed me before a customer", -20);
            if (pass) {
              addRenown(g, life, 2);
              mind(g, life, ctx.m, "proved their work in my yard", 10);
              gainXp(g, life, "craft", 6);
              say(
                g,
                life,
                `You turn the hogsheads over: your mark is cut in every head. ${first(g, ctx.c, "The cooper")} goes red, says there must be some mistake, and won't look at you in the street again. You have a rival.`,
                "good",
              );
            } else {
              addStress(g, life, 3);
              say(
                g,
                life,
                `Your mark is there, but faint, and ${first(g, ctx.c, "the cooper")} talks louder than you. Your master lets it drop; nobody is quite satisfied. You have a rival.`,
              );
            }
          },
        },
        {
          label: "Talk them round",
          tip: "If it goes your way: +1 renown, and the thing laughed off. If not: a little stress. Either way, an enemy across the lane.",
          check: {
            skill: "persuasion",
            dc: (g, life) => dcFor(g, life, "persuasion", 0.5),
          },
          apply: (g, life, ctx, pass) => {
            tie(g, life, ctx.c, "rival");
            mind(g, life, ctx.c, "made a fool of me", -15);
            if (pass) {
              addRenown(g, life, 1);
              gainXp(g, life, "persuasion", 6);
              say(
                g,
                life,
                `By the end of it your master is laughing and ${first(g, ctx.c, "the cooper")} has to laugh too, though not with the eyes. You have a rival.`,
                "good",
              );
            } else {
              addStress(g, life, 3);
              say(
                g,
                life,
                `You talk, and ${first(g, ctx.c, "the cooper")} talks over you. It's left unsettled, and so are you. You have a rival.`,
              );
            }
          },
        },
        {
          label: "Let them have their say",
          tip: "No test: some stress, and they go off pleased with themselves. An enemy all the same.",
          apply: (g, life, ctx) => {
            tie(g, life, ctx.c, "rival");
            addStress(g, life, 4);
            say(
              g,
              life,
              `You hold your tongue. ${first(g, ctx.c, "The cooper")} goes off pleased, and tells it round the Town Dock by dinner. You have a rival.`,
            );
          },
        },
      ],
    },
    // ------------------------------------------------ step "road": the errand done
    {
      key: "tut-barrels",
      pool: "raised",
      cooldown: 0,
      scene: "docks",
      where: {},
      title: "Barrels for Plymouth",
      body: (g, life, ctx) =>
        `The barrels come off the cart at Plymouth's town wharf, all twelve of them sound. ${name(g, ctx.c, "The merchant who ordered them")} counts out your master's money, looks at the hoops a while, and gives you two coins for yourself. "Tell your master they're the best I've had from Boston," ${he(who(g, ctx.c))} says.`,
      choices: [
        {
          label: "A night at the ordinary before the road home (1 coin)",
          tip: "+2 coins for the barrels; a bed and a hot supper: less stress.",
          apply: (g, life) => {
            earn(g, life, 2);
            spend(g, life, 1);
            addStress(g, life, -5);
            say(
              g,
              life,
              "Two coins for the barrels, and a night at the ordinary: a feather bed, a fish supper, and a landlord who wanted all the news of Boston.",
              "good",
            );
          },
        },
        {
          label: "A length of ribbon for your mother (1 coin)",
          tip: "+2 coins for the barrels; a present she'll make much of.",
          apply: (g, life, ctx) => {
            earn(g, life, 2);
            spend(g, life, 1);
            mind(g, life, ctx.m, "brought me ribbon from Plymouth", 10);
            say(
              g,
              life,
              "Two coins for the barrels. One goes on a length of blue ribbon for your mother; the other in your purse.",
              "good",
            );
          },
        },
        {
          label: "Pocket it and start for home",
          tip: "+2 coins for the barrels, and every one of them kept.",
          apply: (g, life) => {
            earn(g, life, 2);
            say(
              g,
              life,
              "Two coins for the barrels, in your purse, and the Boston road under your feet.",
              "good",
            );
          },
        },
      ],
    },
    // ------------------------------------------------ step "family": Sunday dinner
    {
      key: "tut-family",
      pool: "raised",
      cooldown: 0,
      scene: "home",
      where: {},
      title: "Sunday at your mother's",
      body: (g, life, ctx) => {
        const sis = who(g, ctx.k);
        return `Sunday, after meeting. Your mother has a fowl on the spit and the good cloth on the table, and ${sis ? sis.first : "your sister"}, fourteen and all elbows, can hardly wait for the grace to be over. She wants to learn her letters properly: to read the Bible for herself and write a fair hand, like the girls at the dame school in Middle Street. Your mother looks at you. Money has been short since your father died.`;
      },
      choices: [
        {
          label: "Pay for a quarter at the dame school (2 coins)",
          tip: "Two coins: your sister's delight, and your mother's gratitude.",
          blocked: (g, life) => poor(life, 2),
          apply: (g, life, ctx) => {
            spend(g, life, 2);
            mind(
              g,
              life,
              ctx.c,
              `paid for ${first(g, ctx.k, "the girl")}'s schooling`,
              15,
            );
            mind(g, life, ctx.k, "sent me to the dame school", 20);
            addStress(g, life, -2);
            say(
              g,
              life,
              `You put two coins by your mother's plate. ${first(g, ctx.k, "Your sister")} starts at the dame school on Monday, and talks of nothing else.`,
              "good",
            );
          },
        },
        {
          label: "Teach her yourself, of an evening",
          tip: "If it goes your way: she reads well by the autumn, and you both learn. If not: you're a better cooper than a schoolmaster (a little stress).",
          check: {
            skill: "letters",
            dc: (g, life) => dcFor(g, life, "letters", 0.6),
          },
          apply: (g, life, ctx, pass) => {
            gainXp(g, life, "letters", 8);
            if (pass) {
              mind(g, life, ctx.k, "taught me my letters", 15);
              mind(
                g,
                life,
                ctx.c,
                `taught ${first(g, ctx.k, "the girl")} her letters`,
                8,
              );
              say(
                g,
                life,
                `Evenings at your mother's table with a primer and a slate. By the end of the month ${first(g, ctx.k, "your sister")} reads the psalm aloud on Sunday, and doesn't stumble once.`,
                "good",
              );
            } else {
              mind(g, life, ctx.k, "tried to teach me my letters", 5);
              addStress(g, life, 3);
              say(
                g,
                life,
                `Evenings with a primer and a slate. ${first(g, ctx.k, "Your sister")} learns her letters slowly, and you learn patience faster.`,
              );
            }
          },
        },
        {
          label: "Not this year",
          tip: "Nothing spent. Your sister is disappointed, and says so.",
          apply: (g, life, ctx) => {
            mind(g, life, ctx.k, "said no to the dame school", -5);
            say(
              g,
              life,
              `"Next year, then," says your mother. ${first(g, ctx.k, "Your sister")} says nothing at all, which is worse.`,
            );
          },
        },
      ],
    },
    // ------------------------------------------------ step "birthday": a year older
    {
      key: "tut-birthday",
      pool: "raised",
      cooldown: 0,
      scene: "workshop",
      where: {},
      title: "Twenty-one",
      body: (g, life, ctx) =>
        `You are twenty-one today. Your master shakes your hand and says your father would be proud, and ${first(g, ctx.c, "your neighbour")} from next door has a jug of cider under ${his(who(g, ctx.c))} apron. At twenty-one the years ahead feel like a fortune. They are one, and they're spent the same way.`,
      choices: [
        {
          label: "Stand the shop a round at the tavern (1 coin)",
          tip: "A coin: a merry evening, less stress, a little renown.",
          blocked: (g, life) => poor(life, 1),
          apply: (g, life, ctx) => {
            spend(g, life, 1);
            addStress(g, life, -6);
            addRenown(g, life, 1);
            mind(g, life, ctx.c, "stood us all a round", 5);
            say(
              g,
              life,
              "A round for the shop at the tavern on King Street, and a song you'll be ashamed of tomorrow. Twenty-one.",
              "good",
            );
          },
        },
        {
          label: "A quiet supper at your mother's",
          tip: "Nothing spent: less stress, and your mother glad of you.",
          apply: (g, life, ctx) => {
            addStress(g, life, -4);
            mind(g, life, ctx.m, "spent the birthday at home", 8);
            say(
              g,
              life,
              "Supper at your mother's, your father's chair by the fire, and a cake your sister made and won't let anyone else cut. Twenty-one.",
              "good",
            );
          },
        },
      ],
    },
  ]);
}

/** Every one of the lessons' letters' keys. */
export const TUT_EVENT_KEYS = [
  "tut-friend",
  "tut-rival",
  "tut-barrels",
  "tut-family",
  "tut-birthday",
];
