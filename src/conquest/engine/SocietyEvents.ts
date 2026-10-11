// The scenes of society: the turns of an evening at a gathering (a toast, a
// quarrel, a drunk, a romance, a fight, a ghost story, the first dance, the
// stag breaking cover), an affair found out, a child no one expected, a
// settlement planted and a nation to be named. Each is a scene with choices,
// like every other event.

import type { ConquestGame } from "./Game";
import { gatheringById, gatherMood, gatherTurn } from "./Gatherings";
import { duel } from "./Interactions";
import {
  acknowledge,
  affairWith,
  canDivorce,
  endAffair,
  partWays,
  scandalize,
} from "./Liaisons";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  heal,
  hurt,
  journal,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { lifeOfChar, meOf } from "./LifeQueries";
import { charName } from "./Queries";
import { dice } from "./SocietyCore";
import type { Character, Life, Skill } from "./Types";

const who = (g: ConquestGame, ctx: LCtx): Character | undefined =>
  g.s.chars[ctx.c];
const name = (g: ConquestGame, ctx: LCtx) => charName(who(g, ctx));
const first = (g: ConquestGame, ctx: LCtx) => who(g, ctx)?.first ?? "Someone";
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const host = (ctx: LCtx) => ctx.h === 1;
const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

function gat(g: ConquestGame, ctx: LCtx) {
  return gatheringById(g.s, ctx.g);
}

function venue(g: ConquestGame, _life: Life, ctx: LCtx): string {
  return gat(g, ctx)?.venue ?? "home";
}

interface TurnFx {
  mood?: number;
  /** What the other person makes of it. */
  op?: number;
  why?: string;
  renown?: number;
  stress?: number;
  coins?: number;
  health?: number;
  xp?: Partial<Record<Skill, number>>;
  line?: string;
}

/** A turn's effects, then on to the next. */
function turn(g: ConquestGame, life: Life, ctx: LCtx, f: TurnFx): void {
  const c = who(g, ctx);
  if (f.op && c?.alive && !lifeOfChar(g.s, c.id))
    remembers(g, life, g.char(c.id), f.why ?? "At the gathering", f.op, 2);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.coins) earn(g, life, f.coins);
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, "misadventure at a gathering");
  }
  for (const [k, v] of Object.entries(f.xp ?? {}))
    gainXp(g, life, k as Skill, v ?? 0);
  if (f.mood || f.line) gatherMood(g, ctx.g, f.mood ?? 0, f.line);
  gatherTurn(g, life, ctx.g);
}

/** A turn at a gathering: the shape every one shares. */
function sub(
  key: string,
  title: string | ((g: ConquestGame, life: Life, ctx: LCtx) => string),
  body: (g: ConquestGame, life: Life, ctx: LCtx) => string,
  choices: LifeEventDef["choices"],
): LifeEventDef {
  return {
    key: `gather-${key}`,
    pool: "raised",
    cooldown: 0,
    scene: venue,
    title,
    body,
    choices,
  };
}

export const SOCIETY_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ the turns of an evening
  sub(
    "toast",
    "A toast",
    (g, life, ctx) =>
      host(ctx)
        ? `The cloth is drawn and the decanters go round. Every eye turns to you: the host gives the first toast. ${cap(first(g, ctx))} raises ${his(who(g, ctx))} glass expectantly.`
        : `The host is on ${his(who(g, ctx))} feet, glass raised, and then (to your horror) looks at you: "Our friend will give us a toast!"`,
    [
      {
        label: "Something witty",
        tip: "Persuasion: the room laughs and warms to you; fail, and it falls flat.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 1,
                  line: "The toast brought the house down.",
                }
              : { mood: -1, stress: 3, line: "The toast fell flat." },
          ),
      },
      {
        label: (g, life, ctx) => `To ${first(g, ctx)}`,
        tip: "A toast to them by name: they'll remember it fondly.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 1, op: 10, why: "Toasted me by name" }),
      },
      {
        label: '"To absent friends"',
        tip: "Short, safe, a little moving.",
        apply: (g, life, ctx) => turn(g, life, ctx, { mood: 1, stress: -1 }),
      },
    ],
  ),
  sub(
    "quarrel",
    "Words over the table",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} has views on the governor, the price of tobacco and the Church, and is sharing all of them. ${cap(he(who(g, ctx)))} has just said something about people like you.`,
    [
      {
        label: "Laugh it off",
        tip: "Persuasion: turn it into a joke everyone enjoys; fail and they think you've no answer.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 1,
                  op: 3,
                  why: "Took it in good part",
                  line: "A quarrel turned into a joke.",
                }
              : { op: -5, why: "Couldn't answer me", stress: 3 },
          ),
      },
      {
        label: "Give as good as you get",
        tip: "A spirited answer: the table enjoys it, they don't.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: 0,
            op: -15,
            why: "Bested me at table",
            renown: 1,
            line: "Hot words at table.",
          }),
      },
      {
        label: "Change the subject",
        tip: "Peace, at the price of your pride.",
        apply: (g, life, ctx) => turn(g, life, ctx, { op: 2, stress: 2 }),
      },
    ],
  ),
  sub(
    "drunk",
    "One over the eight",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} has found the punch bowl and is now singing a song about a sailor's wife, with gestures. ${host(ctx) ? "Your guests are looking at you." : "The host looks at you, pleadingly."}`,
    [
      {
        label: (g, life, ctx) => `See ${him(who(g, ctx))} home yourself`,
        tip: "Kind, and they'll be grateful in the morning (once they remember).",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            op: 10,
            why: "Saw me home when I was in my cups",
            stress: 1,
          }),
      },
      {
        label: "Have them put out",
        tip: "Order restored; their pride won't be.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: 1,
            op: -10,
            why: "Had me put out",
            line: "A drunk guest was put out.",
          }),
      },
      {
        label: "Join in the chorus",
        tip: "The evening gets louder and better. Probably.",
        apply: (g, life, ctx) => {
          const ok = dice(g).chance(0.6);
          turn(
            g,
            life,
            ctx,
            ok
              ? {
                  mood: 2,
                  op: 5,
                  why: "Sang with me",
                  renown: 0.5,
                  line: "Half the room ended up singing.",
                }
              : { mood: -1, stress: 2, line: "The singing ended badly." },
          );
        },
      },
    ],
  ),
  sub(
    "insult",
    "A barb",
    (g, life, ctx) =>
      `${cap(name(g, ctx))}, who has never liked you, says loudly enough for the room: "I hear the bailiffs know the way to your door." There's a silence you could slice.`,
    [
      {
        label: "Rise above it",
        tip: "Dignity: the room thinks the better of you, and less of them.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 1, renown: 1, stress: 4 }),
      },
      {
        label: "A cutting answer",
        tip: "Persuasion: the laugh is on them; fail, and it's on you.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 2,
                  op: -10,
                  why: "Made me a laughing-stock",
                  line: "A barb was answered, brilliantly.",
                }
              : { mood: -1, renown: -1, stress: 4 },
          ),
      },
      {
        label: "Demand satisfaction",
        tip: "Outside, at dawn. A duel.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          gatherMood(g, ctx.g, -2, "A challenge was given.");
          if (c?.alive && !lifeOfChar(g.s, c.id))
            duel(g, life, g.char(c.id), false);
          gatherTurn(g, life, ctx.g);
        },
      },
    ],
  ),
  sub(
    "romance",
    "Across the room",
    (g, life, ctx) => {
      const c = who(g, ctx);
      const me = meOf(g.s, life)!;
      const wed = me.spouse >= 0 || (c?.spouse ?? -1) >= 0;
      return `${cap(name(g, ctx))} catches your eye over the candles, and holds it a moment too long. Later, by the door, ${he(c)} finds a reason to be standing next to you.${wed ? " One of you, at least, is married." : ""}`;
    },
    [
      {
        label: (g, life, ctx) =>
          `Walk out with ${him(who(g, ctx))} for some air`,
        tip: "Something may come of it. If either of you is married, it's the start of an affair, and people notice who leaves together.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          const me = meOf(g.s, life);
          if (c && me && !lifeOfChar(g.s, c.id)) {
            remembers(g, life, g.char(c.id), "A walk in the moonlight", 12, 2);
            if (me.spouse >= 0 || c.spouse >= 0) {
              const sp = g.s.chars[me.spouse];
              if (sp?.alive)
                remembers(
                  g,
                  life,
                  g.char(sp.id),
                  "Saw them leave together",
                  -6,
                  1,
                );
            }
          }
          turn(g, life, ctx, {
            stress: -3,
            line: "Two guests were seen walking in the garden.",
          });
        },
      },
      {
        label: "Dance with your own husband or wife",
        tip: "A good marriage, on display.",
        blocked: (g, life) =>
          meOf(g.s, life)!.spouse >= 0 ? null : "You're not married",
        apply: (g, life, ctx) => {
          const sp = g.s.chars[meOf(g.s, life)!.spouse];
          if (sp?.alive)
            remembers(
              g,
              life,
              g.char(sp.id),
              "Danced with me all evening",
              8,
              1,
            );
          turn(g, life, ctx, { mood: 1, stress: -2 });
        },
      },
      {
        label: "Take no notice",
        tip: "Nothing happens. Probably wise.",
        apply: (g, life, ctx) => turn(g, life, ctx, {}),
      },
    ],
  ),
  sub(
    "business",
    "A word in private",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} draws you into a window seat. "A ship of mine sails for the Islands next month with room in her hold. Ten coins would buy you a share in the cargo. Or I could put your name to the right people." `,
    [
      {
        label: "Put in 10 coins",
        tip: "A gamble: you may double it, or lose it.",
        blocked: (g, life) => poor(life, 10),
        apply: (g, life, ctx) => {
          spend(g, life, 10);
          const roll = dice(g).next();
          const back = roll < 0.25 ? 0 : roll < 0.55 ? 9 : roll < 0.9 ? 16 : 25;
          if (back) earn(g, life, back);
          journal(
            g,
            life,
            back
              ? `The cargo came home: ${back} coins for your ten.`
              : "The ship was taken by a privateer off Antigua. Ten coins gone.",
            back >= 10 ? "good" : "bad",
          );
          turn(g, life, ctx, {
            op: 6,
            why: "Went into business with me",
            xp: { trade: 5 },
          });
        },
      },
      {
        label: "Ask them to put your name about",
        tip: "Connections: they think well of you, and so may others.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { op: 4, renown: 1, xp: { persuasion: 3 } }),
      },
      {
        label: '"Not tonight"',
        tip: "Business can wait.",
        apply: (g, life, ctx) => turn(g, life, ctx, {}),
      },
    ],
  ),
  sub(
    "accident",
    "A crash",
    (g, life, ctx) =>
      `A candle catches a curtain, and in a moment the room is full of smoke and shrieks. ${cap(name(g, ctx))} is nearest, and frozen.`,
    [
      {
        label: "Tear it down yourself",
        tip: "Fighting: brave and quick, and the evening's saved; you may be burned.",
        check: { skill: "fighting", dc: 5 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 2,
                  op: 8,
                  why: "Put out the fire",
                  line: "A fire was put out by a hero with a tablecloth.",
                }
              : {
                  mood: 0,
                  health: -8,
                  renown: 1,
                  line: "A fire, and a burned hand.",
                },
          ),
      },
      {
        label: "Carry on as if nothing happened",
        tip: "Persuasion: sang-froid, if you can carry it off.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? { mood: 1, renown: 1 }
              : { mood: -2, stress: 4, line: "A fire spoiled the evening." },
          ),
      },
      {
        label: "Everybody out!",
        tip: "Safe, and the end of the fun.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: -2,
            line: "Everyone stood in the yard in the cold.",
          }),
      },
    ],
  ),
  sub(
    "fight",
    "Fisticuffs",
    (g, life, ctx) =>
      `There's a crash and a roar: ${name(g, ctx)} and a neighbour are rolling on the floor over a horse, a woman or a remark about the Pope. Nobody's quite sure which.`,
    [
      {
        label: "Pull them apart",
        tip: "Fighting: you separate them and look a hero; fail and you take a fist.",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 1,
                  renown: 1,
                  op: 4,
                  why: "Stopped a fight",
                  line: "A fight was stopped.",
                }
              : {
                  health: -6,
                  mood: -1,
                  line: "A fight, and the peacemaker got the worst of it.",
                },
          ),
      },
      {
        label: "Take bets",
        tip: "A shilling on the bigger man. Rowdy, and it might pay.",
        apply: (g, life, ctx) => {
          const won = dice(g).chance(0.5);
          turn(g, life, ctx, {
            mood: 1,
            coins: won ? 3 : -2,
            line: "A fight became a prize-fight.",
          });
        },
      },
      {
        label: "Throw them both out",
        tip: "Order, and two people who won't come again.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 0, op: -10, why: "Threw me out" }),
      },
    ],
  ),
  sub(
    "dish",
    "The pudding",
    (g) =>
      `The great pudding comes in to applause, is cut, and turns out to be raw in the middle. Someone's been at the cooking sherry. ${dice(g).chance(0.5) ? "The venison, too, has seen better days." : ""}`,
    [
      {
        label: "Laugh, and send out for pies (3)",
        tip: "Grace under fire, and pies.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          turn(g, life, ctx, {
            mood: 1,
            line: "A raw pudding, and pies from the tavern instead.",
          });
        },
      },
      {
        label: "Serve it anyway",
        tip: "Waste not. Someone will be ill.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: -2,
            line: "Several guests were unwell the next day.",
          }),
      },
      {
        label: "Blame the cook, loudly",
        tip: "The guests are embarrassed for you.",
        apply: (g, life, ctx) => turn(g, life, ctx, { mood: -1, stress: 2 }),
      },
    ],
  ),
  sub(
    "surprise",
    "An unexpected guest",
    (g, life, ctx) =>
      `There's a knock at the door, and in comes ${name(g, ctx)}, who was not asked, has heard there's something going on, and is already taking off ${his(who(g, ctx))} hat.`,
    [
      {
        label: "Welcome them in",
        tip: "Generous: a new acquaintance, and they'll remember it.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: 1,
            op: 10,
            why: "Made me welcome",
            line: `${name(g, ctx)} came, uninvited, and was welcome.`,
          }),
      },
      {
        label: "Turn them away, politely",
        tip: "Your table, your rules. They won't forget either.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { op: -8, why: "Turned me away at the door" }),
      },
    ],
  ),
  sub(
    "ghost",
    "A ghost story",
    (g, life, ctx) =>
      `The candles are low and the fire is red, and ${name(g, ctx)} is telling of the drowned man who walks the marsh road on Michaelmas eve, dripping. Somebody laughs, too loudly.`,
    [
      {
        label: "Tell a better one",
        tip: "Letters: the room hangs on every word.",
        check: { skill: "letters", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 1,
                  line: "The ghost stories went on till three.",
                }
              : { mood: 0, stress: 1 },
          ),
      },
      {
        label: "Admit you've seen one yourself",
        tip: "Everyone leans in. A few move their chairs closer.",
        apply: (g, life, ctx) => turn(g, life, ctx, { mood: 1, stress: -2 }),
      },
      {
        label: "Scoff",
        tip: "Reason wins; the evening loses.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: -1, op: -4, why: "Mocked my story" }),
      },
    ],
  ),
  // ------------------------------------------------ the gathering's own turn
  sub(
    "dance",
    "The first dance",
    (g, life, ctx) =>
      `The fiddlers strike up, and the floor clears for the first dance. ${cap(name(g, ctx))} is standing near, not quite looking at you.`,
    [
      {
        label: (g, life, ctx) => `Lead out ${first(g, ctx)}`,
        tip: "An honour for them, and the evening begins well.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: 1,
            op: 10,
            why: "Led me out for the first dance",
          }),
      },
      {
        label: "Show them how it's done",
        tip: "Persuasion (and nerve): the floor is yours; fail and you trip over the curate.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 1.5,
                  line: "Everyone talked of the dancing.",
                }
              : { mood: 0, stress: 3, line: "Somebody fell over the curate." },
          ),
      },
      {
        label: "Sit it out with the old folk",
        tip: "A quiet evening, and the old folk's good opinion.",
        apply: (g, life, ctx) => turn(g, life, ctx, { stress: -3 }),
      },
    ],
  ),
  sub(
    "cards",
    "High stakes",
    (g, life, ctx) =>
      `At the loo table the pool has grown, and only you and ${name(g, ctx)} are left in. ${cap(he(who(g, ctx)))} is smiling, which is either very good or very bad.`,
    [
      {
        label: "Raise (5)",
        tip: "Trade (reading people): you take the pool, or lose your stake.",
        check: { skill: "trade", dc: 7 },
        blocked: (g, life) => poor(life, 5),
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? { coins: 10, mood: 1, line: "A great hand of loo." }
              : { coins: -5, stress: 2 },
          ),
      },
      {
        label: "Fold gracefully",
        tip: "Good manners and a full purse.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 1, op: 3, why: "A gracious loser" }),
      },
      {
        label: '"You\'re cheating!"',
        tip: "Stealth (spotting it): if you're right, they're shamed; if not, you are.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  renown: 2,
                  op: -20,
                  why: "Caught me cheating",
                  line: "A cardsharp was unmasked.",
                }
              : {
                  renown: -2,
                  op: -15,
                  why: "Called me a cheat",
                  mood: -2,
                  line: "A false accusation at the card table.",
                },
          ),
      },
    ],
  ),
  sub(
    "hunt",
    "The stag breaks cover",
    (g, life, ctx) =>
      `The hounds give tongue, and out of the thicket bursts a great stag, twelve points at least, and away across the bottom. ${cap(name(g, ctx))} is beside you, reins in hand.`,
    [
      {
        label: "Ride hard after it",
        tip: "Woodcraft: the kill and the glory; fail and you're thrown.",
        check: { skill: "woodcraft", dc: 7 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 2,
                  xp: { woodcraft: 5 },
                  line: "A great stag was brought down.",
                }
              : {
                  health: -10,
                  mood: 0,
                  line: "Someone was thrown at a fence.",
                },
          ),
      },
      {
        label: (g, life, ctx) => `Let ${first(g, ctx)} take the shot`,
        tip: "Generous: the honour is theirs, and they'll remember who gave it.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 1, op: 12, why: "Gave me the shot" }),
      },
      {
        label: "Hang back with the breakfast",
        tip: "Safe, and the ham is excellent.",
        apply: (g, life, ctx) => turn(g, life, ctx, { stress: -2 }),
      },
    ],
  ),
  sub(
    "raising",
    "Up goes the frame",
    (g, life, ctx) =>
      `Forty neighbours on the ropes and pike poles, the bent rising inch by inch, ${name(g, ctx)} calling the heave. A beam sways.`,
    [
      {
        label: "Put your back into it",
        tip: "Craft: the frame goes up true; fail and a beam catches you.",
        check: { skill: "craft", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  op: 6,
                  why: "Worked beside me",
                  xp: { craft: 5 },
                  line: "The frame went up by noon.",
                }
              : {
                  health: -8,
                  mood: 0,
                  line: "A beam fell, and someone under it.",
                },
          ),
      },
      {
        label: "Take charge of the lifting",
        tip: "Leadership: organised, quick, admired.",
        check: { skill: "leadership", dc: 7 },
        apply: (g, life, ctx, pass) =>
          turn(g, life, ctx, pass ? { mood: 2, renown: 1 } : { mood: -1 }),
      },
      {
        label: "Keep the cider coming (2)",
        tip: "Everyone works better with cider. Up to a point.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life, ctx) => {
          spend(g, life, 2);
          turn(g, life, ctx, { mood: 1, line: "The cider flowed." });
        },
      },
    ],
  ),
  sub(
    "frolic",
    "A red ear",
    (g, life, ctx) =>
      `The husks fly, the fiddle scrapes, and ${name(g, ctx)} holds up a red ear of corn with a whoop: the finder claims a kiss from whoever they choose. Everyone looks to see who.`,
    [
      {
        label: "Cheer them on",
        tip: "The custom's the thing: the frolic roars.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 2, op: 4, why: "A merry frolic" }),
      },
      {
        label: "Find a red ear of your own",
        tip: "Stealth (and a pocket): nobody need know you brought it.",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? { mood: 2, stress: -4 }
              : {
                  mood: 0,
                  renown: -1,
                  line: "Somebody was caught with a red ear up their sleeve.",
                },
          ),
      },
      {
        label: "Keep husking",
        tip: "The corn won't husk itself.",
        apply: (g, life, ctx) => turn(g, life, ctx, { xp: { farming: 4 } }),
      },
    ],
  ),
  sub(
    "wedding",
    "The wedding",
    (g, life, ctx) => {
      const x = gat(g, ctx);
      const me = meOf(g.s, life)!;
      const mine = !!x?.about.includes(me.id);
      return mine
        ? `The vows are said, the ring is on, and ${name(g, ctx)} is your ${who(g, ctx)?.female ? "wife" : "husband"}. Now the feast: everyone wants a word with you, and the fiddler has started without anyone.`
        : `The vows are said and the couple come out into the light. ${cap(name(g, ctx))} catches your eye, beaming. Someone thrusts a glass into your hand.`;
    },
    [
      {
        label: "A toast to the couple",
        tip: "Persuasion: a toast they'll tell their grandchildren about.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  op: 10,
                  why: "A wedding toast to remember",
                  line: "A wedding toast to remember.",
                }
              : { mood: 0, stress: 2 },
          ),
      },
      {
        label: "Dance the night away",
        tip: "Joy, and sore feet.",
        apply: (g, life, ctx) => turn(g, life, ctx, { mood: 1, stress: -6 }),
      },
      {
        label: "A handsome gift (5)",
        tip: "Silver spoons: remembered at every meal.",
        blocked: (g, life) => poor(life, 5),
        apply: (g, life, ctx) => {
          spend(g, life, 5);
          turn(g, life, ctx, {
            op: 12,
            why: "A handsome wedding gift",
            mood: 1,
          });
        },
      },
    ],
  ),
  sub(
    "christening",
    "At the font",
    (g, life, ctx) =>
      `The minister takes ${name(g, ctx)} in his arms, and the child (who has opinions) roars through the whole of the service. The godparents look at each other.`,
    [
      {
        label: "Beam with pride",
        tip: "A good set of lungs is a sign of health.",
        apply: (g, life, ctx) => turn(g, life, ctx, { mood: 1, stress: -4 }),
      },
      {
        label: "A gift for the poor box (3)",
        tip: "The parish approves.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          turn(g, life, ctx, { mood: 1, renown: 1, xp: { faith: 3 } });
        },
      },
    ],
  ),
  sub(
    "eulogy",
    "Remembering the dead",
    (g, life, ctx) =>
      `They're all looking at you. ${cap(name(g, ctx))} lies in the coffin in ${his(who(g, ctx))} best, and somebody has to say something.`,
    [
      {
        label: "Speak from the heart",
        tip: "Persuasion: there won't be a dry eye.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  stress: -6,
                  renown: 1,
                  line: "The eulogy left no dry eye.",
                }
              : { mood: 0, stress: 2 },
          ),
      },
      {
        label: "Keep it short",
        tip: "Dignified and done.",
        apply: (g, life, ctx) => turn(g, life, ctx, { stress: -2 }),
      },
      {
        label: "Tell the funny stories",
        tip: "The wake becomes a celebration. Some will be shocked.",
        apply: (g, life, ctx) => {
          const ok = dice(g).chance(0.65);
          turn(
            g,
            life,
            ctx,
            ok
              ? { mood: 2, stress: -5, line: "The wake turned to laughter." }
              : { mood: -2, line: "Some found the stories shocking." },
          );
        },
      },
    ],
  ),
  sub(
    "speech",
    "Words of welcome",
    (g, life, ctx) =>
      `The kettles are set out and ${name(g, ctx)} stands to speak the words of welcome, then turns to you: the guests expect an answer, as is proper.`,
    [
      {
        label: "Answer in the old way",
        tip: "Persuasion: good words, well given, are remembered.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass
              ? { mood: 2, op: 8, why: "Spoke well at the feast", renown: 1 }
              : { mood: 0, stress: 2 },
          ),
      },
      {
        label: "Give gifts to every guest (3)",
        tip: "What is given is remembered longer than what is said.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          turn(g, life, ctx, {
            mood: 2,
            renown: 1.5,
            line: "Every guest went home with a gift.",
          });
        },
      },
      {
        label: "Let the elders speak",
        tip: "Respect for the old ones.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 1, op: 5, why: "Respectful" }),
      },
    ],
  ),
  sub(
    "council",
    "The pipe goes round",
    (g, life, ctx) =>
      `The pipe passes from hand to hand. ${cap(name(g, ctx))} lays out the matter: the young men want to go against an old enemy; the women want the corn in first. All wait for your words.`,
    [
      {
        label: "Speak for peace",
        tip: "Persuasion: the council comes to one mind.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) =>
          turn(
            g,
            life,
            ctx,
            pass ? { mood: 2, renown: 2, xp: { persuasion: 4 } } : { mood: 0 },
          ),
      },
      {
        label: "Speak for war",
        tip: "The young men cheer; the clan mothers don't.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: 1,
            renown: 1,
            op: -4,
            why: "Spoke for war",
          }),
      },
      {
        label: "Listen, and say little",
        tip: "Wisdom is often silent.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, {
            mood: 1,
            op: 4,
            why: "Listened well",
            stress: -2,
          }),
      },
    ],
  ),
  sub(
    "greencorn",
    "The new fire",
    (g, life, ctx) =>
      `The old fires are out. The square ground is swept, the black drink taken, and ${name(g, ctx)} kindles the new fire from which every hearth in the town will be lit. Old wrongs, it is said, are forgiven tonight.`,
    [
      {
        label: "Keep the fast and the customs",
        tip: "Faith: the town is renewed, and you with it.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: 2, stress: -8, xp: { faith: 5 } }),
      },
      {
        label: "Forgive an old wrong",
        tip: "A rival's grudge set down: enemies may become something less.",
        apply: (g, life, ctx) => {
          for (const [k, t] of Object.entries(life.ties))
            if (t === "rival") {
              setTie(g, life, Number(k), null);
              const c = g.s.chars[Number(k)];
              if (c?.alive)
                remembers(
                  g,
                  life,
                  g.char(c.id),
                  "Forgave me at the green corn",
                  20,
                  3,
                );
              break;
            }
          turn(g, life, ctx, { mood: 1, stress: -5, renown: 1 });
        },
      },
    ],
  ),
  sub(
    "empty",
    "Nobody came",
    () =>
      "The candles are lit, the table laid, the fiddler tuned. The clock strikes eight, then nine. Nobody comes.",
    [
      {
        label: "Eat it all yourself",
        tip: "Somebody has to.",
        apply: (g, life, ctx) =>
          turn(g, life, ctx, { mood: -3, stress: 6, health: 1 }),
      },
      {
        label: "Give it to the poor",
        tip: "A kindness, and better than waste.",
        apply: (g, life, ctx) => turn(g, life, ctx, { mood: -2, renown: 1 }),
      },
    ],
  ),

  // ------------------------------------------------ affairs found out
  {
    key: "affair-found-spouse",
    pool: "raised",
    cooldown: 0,
    scene: "home",
    title: "Found out",
    body: (g, life, ctx) => {
      const l = g.s.chars[ctx.l];
      return `${cap(name(g, ctx))} is waiting up for you, with a letter in ${his(who(g, ctx))} hand: one of ${l ? `${l.first}'s` : "your"} letters. ${cap(he(who(g, ctx)))} doesn't shout. That's the worst of it.`;
    },
    choices: [
      {
        label: "Beg forgiveness, and end it",
        tip: "Persuasion: forgiven, mostly; fail, and it's a wound that won't close.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, ctx, pass) => {
          const c = who(g, ctx);
          if (c)
            remembers(
              g,
              life,
              g.char(c.id),
              pass ? "Unfaithful, and sorry for it" : "Unfaithful",
              pass ? -15 : -45,
              6,
            );
          const a = affairWith(life, ctx.l);
          if (a) endAffair(g, life, a, "you promised");
          addStress(g, life, 8);
        },
      },
      {
        label: "End it, coldly",
        tip: "The affair ends; the marriage survives, cooler.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (c) remembers(g, life, g.char(c.id), "Unfaithful", -30, 6);
          const l = g.s.chars[ctx.l];
          if (l?.alive && !lifeOfChar(g.s, l.id))
            remembers(g, life, g.char(l.id), "Threw me over", -20, 3);
          const a = affairWith(life, ctx.l);
          if (a) endAffair(g, life, a, "you ended it");
        },
      },
      {
        label: "Brazen it out",
        tip: "You carry on. Your marriage won't recover, and people will hear.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (c)
            remembers(
              g,
              life,
              g.char(c.id),
              "Unfaithful, and unrepentant",
              -60,
              0,
            );
          addStress(g, life, 10);
          const a = affairWith(life, ctx.l);
          if (a) a.exposure = Math.max(a.exposure, 80);
          touchLife(g, life);
        },
      },
      {
        label: (g, life) =>
          canDivorce(g.s, life) ? "Ask for a divorce" : "Live apart",
        tip: (g, life) =>
          canDivorce(g.s, life)
            ? "Your church allows it, for adultery: the marriage is ended. Scandal follows."
            : "Your church won't end a marriage: you'll separate, still married in law.",
        apply: (g, life) => {
          partWays(g, life);
          scandalize(
            g,
            life,
            canDivorce(g.s, life)
              ? "A divorce, over an affair"
              : "Separated, over an affair",
          );
        },
      },
    ],
  },
  {
    key: "affair-found-theirs",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    title: "A wronged husband or wife",
    body: (g, life, ctx) => {
      const l = g.s.chars[ctx.l];
      return `${cap(name(g, ctx))} pushes through the crowd in the tavern and stops in front of you. "You know who I am. You know what you've done with ${l ? `my ${l.female ? "wife" : "husband"}` : "my family"}." The room goes quiet. ${cap(he(who(g, ctx)))} has ${his(who(g, ctx))} hand on ${his(who(g, ctx))} sword.`;
    },
    choices: [
      {
        label: "Meet them at dawn",
        tip: "A duel: fighting decides it, and someone may die.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          if (c?.alive) duel(g, life, g.char(c.id), true);
          scandalize(g, life, "A duel over an affair");
        },
      },
      {
        label: "Pay them off (15)",
        tip: "Money for silence and an end to it: the affair is over.",
        blocked: (g, life) => poor(life, 15),
        apply: (g, life, ctx) => {
          spend(g, life, 15);
          const c = who(g, ctx);
          if (c)
            remembers(g, life, g.char(c.id), "Paid me for my honour", -25, 5);
          const a = affairWith(life, ctx.l);
          if (a) endAffair(g, life, a, "bought off");
        },
      },
      {
        label: "Deny everything",
        tip: "Stealth: they half believe you; fail and the whole town hears it.",
        check: { skill: "stealth", dc: 9 },
        apply: (g, life, ctx, pass) => {
          const c = who(g, ctx);
          const a = affairWith(life, ctx.l);
          if (pass) {
            if (c) remembers(g, life, g.char(c.id), "Suspects me", -10, 3);
            if (a) a.exposure = 30;
            touchLife(g, life);
          } else {
            if (c)
              remembers(g, life, g.char(c.id), "Ruined my marriage", -40, 0);
            scandalize(g, life, "Caught in an affair and lying about it");
          }
        },
      },
      {
        label: "Leave town for a while",
        tip: "Discretion: the affair ends, the talk dies down, your name suffers.",
        apply: (g, life, ctx) => {
          addRenown(g, life, -3);
          addStress(g, life, 5);
          const a = affairWith(life, ctx.l);
          if (a) endAffair(g, life, a, "you left town");
        },
      },
    ],
  },
  {
    key: "affair-scandal",
    pool: "raised",
    cooldown: 0,
    scene: "tavern",
    title: "The talk of the town",
    body: (g, life, ctx) =>
      `Conversation stops when you come into the tavern, and starts again, lower. Everybody knows about you and ${name(g, ctx)}. The minister has preached a sermon on the seventh commandment, looking at your pew throughout.`,
    choices: [
      {
        label: "Hold your head high",
        tip: "Notoriety is a kind of fame: more renown, more stress.",
        apply: (g, life) => {
          addRenown(g, life, 2);
          addStress(g, life, 6);
        },
      },
      {
        label: "Lie low",
        tip: "Stay home a while; it'll pass sooner.",
        apply: (g, life) => {
          addStress(g, life, 2);
          if (life.scandal) touchLife(g, life).scandal!.until -= 200;
        },
      },
      {
        label: "Repent in church",
        tip: "Faith: the church takes you back; the town may follow.",
        check: { skill: "faith", dc: 6 },
        apply: (g, life, ctx, pass) => {
          gainXp(g, life, "faith", 5);
          if (pass && life.scandal) touchLife(g, life).scandal = null;
          if (pass)
            journal(
              g,
              life,
              "You stood in the white sheet before the congregation. It was dreadful, and it worked.",
              "good",
            );
        },
      },
    ],
  },
  {
    key: "affair-child",
    pool: "raised",
    cooldown: 0,
    scene: "home",
    title: "A child",
    body: (g, life, ctx) => {
      const kid = g.s.chars[ctx.k];
      const me = meOf(g.s, life)!;
      const lover = who(g, ctx);
      const sex = kid?.female ? "daughter" : "son";
      if (me.female)
        return `You have a ${sex}, ${kid?.first ?? ""}. ${me.spouse >= 0 ? `Your husband counts on his fingers, and counts again.` : "The parish counts on its fingers."} The child has, unmistakably, ${lover ? `${lover.first}'s` : "someone else's"} chin.`;
      return `Word comes, quietly, from ${lover?.first ?? "her"}: a ${sex}, ${kid?.first ?? ""}, healthy and loud. ${lover && lover.spouse >= 0 ? `${cap(his(lover))} husband thinks it's his.` : "Everyone wants to know whose it is."}`;
    },
    choices: [
      {
        label: "Acknowledge the child as yours",
        tip: "Honest, and a scandal: the child takes your name and may inherit.",
        blocked: (g, life) =>
          meOf(g.s, life)!.female ? "The child is yours already" : null,
        apply: (g, life, ctx) => {
          acknowledge(g, life, ctx.k);
          scandalize(g, life, "Acknowledged a natural child");
          journal(
            g,
            life,
            "You acknowledge the child as yours, before the parish and everyone.",
            "good",
          );
        },
      },
      {
        label: "Keep the secret",
        tip: "The child is someone else's, as far as the world knows. Secrets keep badly.",
        apply: (g, life, ctx) => {
          const a = affairWith(life, ctx.c);
          if (a) {
            a.exposure = Math.min(100, a.exposure + 15);
            touchLife(g, life);
          }
        },
      },
      {
        label: "Provide for them quietly (10)",
        tip: "Money for the child's keep: the other parent is grateful, and the secret's safer.",
        blocked: (g, life) => poor(life, 10),
        apply: (g, life, ctx) => {
          spend(g, life, 10);
          const c = who(g, ctx);
          if (c?.alive && !lifeOfChar(g.s, c.id))
            remembers(g, life, g.char(c.id), "Provided for our child", 15, 0);
        },
      },
    ],
  },
  {
    key: "spouse-unfaithful",
    pool: "raised",
    cooldown: 0,
    scene: "home",
    title: "Unfaithful",
    body: (g, life, ctx) => {
      const l = g.s.chars[ctx.l];
      return `You know now, for certain: ${name(g, ctx)} has been carrying on with ${l ? charName(l) : "someone"}. There's a letter, in a hand you know, that wasn't meant for you.`;
    },
    choices: [
      {
        label: "Forgive",
        tip: "Hard, and it costs you; the marriage goes on.",
        apply: (g, life) => addStress(g, life, 12),
      },
      {
        label: "Call the other one out",
        tip: "A duel with the lover, if they'll meet you.",
        blocked: (g, life, ctx) =>
          g.s.chars[ctx.l]?.alive ? null : "They're gone",
        apply: (g, life, ctx) => {
          const l = g.s.chars[ctx.l];
          if (l?.alive && !lifeOfChar(g.s, l.id))
            duel(g, life, g.char(l.id), false);
          else if (l) setTie(g, life, l.id, "rival");
        },
      },
      {
        label: (g, life) => (canDivorce(g.s, life) ? "Divorce" : "Live apart"),
        tip: "The marriage ends (or as near as your church allows).",
        apply: (g, life) => partWays(g, life),
      },
    ],
  },

  // ------------------------------------------------ settlements and nations
  {
    key: "found-planted",
    pool: "raised",
    cooldown: 0,
    scene: "fields",
    title: "A settlement planted",
    body: (g, life, ctx) =>
      `The wagons are unloaded, the first cabins are up, and the families stand in the clearing at ${g.map.provinces[ctx.p]?.name ?? "the new place"} while you read out the plan of the town: lots, a meeting house, a common. It's yours. Now it has to live.`,
    choices: [
      {
        label: "A prayer, and to work",
        tip: "Faith and farming: the settlement starts well.",
        apply: (g, life) => {
          gainXp(g, life, "leadership", 8);
          gainXp(g, life, "farming", 5);
          addStress(g, life, -5);
        },
      },
      {
        label: "A feast for the settlers",
        tip: "Hope matters as much as corn.",
        apply: (g, life) => {
          addRenown(g, life, 2);
          addStress(g, life, -8);
        },
      },
    ],
  },
  {
    key: "found-government",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A new government",
    body: (g, life, ctx) => {
      const n = g.s.nations[ctx.n];
      return `It's done, and it's yours. ${n ? `${n.name.replace(/^the /, "The ")}` : "The country"} waits to be told what it is: its name, its flag, what kind of state it will be, where it will be governed from and who will sit at your side. Set it up from your affairs (the new government), within the year.`;
    },
    choices: [
      {
        label: "To work",
        tip: "Open Affairs, then set up the new government: name, flag, colour, form, capital and first officers.",
        apply: (g, life) => {
          addRenown(g, life, 2);
          journal(
            g,
            life,
            'The new government waits on you: Affairs, then "Set up the government".',
            "good",
          );
        },
      },
    ],
  },
];
