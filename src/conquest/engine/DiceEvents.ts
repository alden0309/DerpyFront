// DICE (r14): the scenes around the dice. Another player's invitation to
// sit down (taken as a no if it isn't answered); a stranger winning too
// often with loaded dice (a sharp eye catches him); and a sore loser after
// you take a big pot off him.

import { presentAt } from "./Areas";
import { declineTable, joinProblem, joinTable } from "./Dice";
import { ddice, seatedAt, tableById } from "./DiceCore";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  remembers,
  spend,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { hasPlace, isChildLife } from "./LifeQueries";
import { charName } from "./Queries";
import type { Life } from "./Types";

const who = (g: ConquestGame, ctx: LCtx) => g.s.chars[ctx.c];
const he = (g: ConquestGame, ctx: LCtx) => (who(g, ctx)?.female ? "she" : "he");
const him = (g: ConquestGame, ctx: LCtx) =>
  who(g, ctx)?.female ? "her" : "him";

/** Chance a day that something happens at the dice while you're in the tavern. */
export const CHEAT_CHANCE = 1 / 150;

export const DICE_EVENTS: LifeEventDef[] = [
  {
    key: "p2p-dice",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    title: "A game of Liar's dice",
    body: (g, _life, ctx) =>
      `${charName(who(g, ctx))} has a table at the tavern: Liar's dice, ${ctx.stake} coins a seat. "Will you make one of us?"\nFive dice each under a cup; you bid on what lies under all the cups (ones are wild) until someone calls "Liar!". The last with dice takes the pot.`,
    choices: [
      {
        label: (_g, _l, ctx) => `Take a seat (${ctx.stake} coins)`,
        tip: "You go over to the tavern and sit down.",
        blocked: (g, life, ctx) =>
          joinProblem(g.s, g.w, life, tableById(g.s, ctx.t)),
        apply: (g, life, ctx) => {
          const err = joinTable(g, life, tableById(g.s, ctx.t));
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Not tonight",
        tip: "They'll play without you.",
        apply: (g, life, ctx) => declineTable(g, life, ctx.t),
      },
    ],
  },
  {
    key: "dice-loaded",
    pool: "raised",
    cooldown: 3 * 365,
    scene: "tavern",
    title: "Loaded dice",
    body: (g, _life, ctx) =>
      `${charName(who(g, ctx))} has been winning at the dice all evening: sixes, and more sixes, and a way of sweeping up ${who(g, ctx)?.female ? "her" : "his"} cup before anyone looks too close. The losers are going quiet, the way people do before trouble.`,
    choices: [
      {
        label: (g, _l, ctx) =>
          `Ask to see ${him(g, ctx) === "her" ? "her" : "his"} dice`,
        tip: "Stealth: catch the weighted pair before they're palmed, and the room is yours.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, ctx, pass) => {
          const c = who(g, ctx);
          if (!c) return;
          if (pass) {
            addRenown(g, life, 1);
            earn(g, life, 3);
            remembers(
              g,
              life,
              g.char(c.id),
              "Showed me up for a cheat",
              -20,
              5,
            );
            const keeper = presentAt(g.s, g.w, life.prov, "tavern").find(
              (x) => g.s.chars[x.c]?.role === "innkeeper",
            );
            if (keeper)
              remembers(
                g,
                life,
                g.char(keeper.c),
                "Caught a cheat in my house",
                6,
                3,
              );
            journal(
              g,
              life,
              `You had ${charName(c)}'s dice off the table before ${he(g, ctx)} could palm them: weighted, both of them. The losers stood you 3 coins of what they won back, and the house cheered you.`,
              "good",
            );
          } else {
            addStress(g, life, 4);
            remembers(g, life, g.char(c.id), "Called me a cheat", -10, 3);
            journal(
              g,
              life,
              `${charName(c)} was quicker than you: the dice ${he(g, ctx)} handed over were as honest as a parson. The room laughed at you, not ${him(g, ctx)}.`,
              "bad",
            );
          }
        },
      },
      {
        label: "Sit in and watch close (3)",
        tip: "Lose a few coins to learn the trick of it (Stealth).",
        blocked: (_g, life) => (life.purse < 3 ? "Needs 3 coins" : null),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          gainXp(g, life, "stealth", 12);
          journal(
            g,
            life,
            `Three coins to ${charName(who(g, ctx))}, and an education: the thumb over the cup, the second pair in the sleeve. You'll know it next time.`,
          );
        },
      },
      {
        label: "Leave them to it",
        tip: "Not your quarrel, nor your money.",
        apply: (g, life) =>
          journal(g, life, "You keep out of it. Somebody else will find out."),
      },
    ],
  },
  {
    key: "dice-sore",
    pool: "raised",
    cooldown: 365,
    scene: "tavern",
    title: "A sore loser",
    body: (g, _life, ctx) =>
      `${charName(who(g, ctx))} lost ${ctx.stake} coins at your table and isn't taking it well. "Nobody's that lucky," ${he(g, ctx)} says, loud enough for the room. "Let's see what's up your sleeve."`,
    choices: [
      {
        label: "Stand them a drink (1)",
        tip: "No harm done: they'll think the better of it.",
        blocked: (_g, life) => (life.purse < 1 ? "Needs a coin" : null),
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          spend(g, life, 1);
          if (c) {
            const ch = g.char(c.id);
            ch.memories = ch.memories.filter(
              (m) =>
                !(m.of === life.c && m.why === "Took my money at the dice"),
            );
            remembers(g, life, ch, "Stood me a drink after the dice", 4, 1);
          }
          journal(
            g,
            life,
            `A pot of ale settles it. ${charName(c)} allows you were lucky, and that ${he(g, ctx)} was a fool to bid fives.`,
          );
        },
      },
      {
        label: "Turn out your pockets",
        tip: "Persuasion: carry it off, and the room is on your side.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            addRenown(g, life, 1);
            journal(
              g,
              life,
              `Your pockets, your sleeves, your hat: nothing. The room jeers ${charName(who(g, ctx))} out of the door.`,
              "good",
            );
          } else {
            addRenown(g, life, -1);
            addStress(g, life, 3);
            journal(
              g,
              life,
              "Nothing up your sleeve, but you protested a little too much. People will wonder.",
              "bad",
            );
          }
        },
      },
      {
        label: "Step outside",
        tip: "Fighting.",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, ctx, pass) => {
          const c = who(g, ctx);
          if (pass) {
            addRenown(g, life, 1);
            if (c)
              remembers(
                g,
                life,
                g.char(c.id),
                "Knocked me down in the yard",
                -10,
                3,
              );
            journal(
              g,
              life,
              `It was over in the yard in a minute. ${charName(c)} won't call you a cheat again soon.`,
              "good",
            );
          } else {
            journal(
              g,
              life,
              "You came off worse in the yard, and the pot doesn't seem so large now.",
              "bad",
            );
            hurt(
              g,
              life,
              4 + Math.floor(ddice(g).next() * 7),
              "a fight over the dice",
            );
          }
        },
      },
    ],
  },
];

/**
 * Now and then, in the tavern, for someone who plays at the dice (a table
 * played before): a stranger with loaded dice.
 */
function tavernDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (life.watching || life.c < 0 || life.travel || life.area !== "tavern")
    return;
  if (!life.achCount?.["dice-tables"]) return;
  if (life.events.length >= 2 || isChildLife(s, life)) return;
  if ((life.cooldowns["ev:dice-loaded"] ?? 0) > s.day) return;
  if (seatedAt(s, life.c)) return;
  const r = ddice(g);
  if (!r.chance(CHEAT_CHANCE)) return;
  if (!hasPlace(s, g.w, life.prov, "tavern")) return;
  const folk = presentAt(s, g.w, life.prov, "tavern", s.day, life).filter(
    (x) => x.kind !== "player" && s.chars[x.c]?.role !== "innkeeper",
  );
  const strangers = folk.filter((x) => x.kind === "traveller");
  const pool = strangers.length ? strangers : folk;
  if (!pool.length) return;
  const cheat = pool[r.int(0, pool.length - 1)];
  raiseEvent(g, life, "dice-loaded", { c: cheat.c });
}

hooks.lifeDaily.push(tavernDaily);
