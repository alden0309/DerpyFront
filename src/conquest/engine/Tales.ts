// Still more of what happens in a life: at work in every trade, about the
// town's places, with your property and hands, between friends, lovers,
// mentors and enemies, in the round of a native year, with the seasons and
// the great events of the century, and when a cause rises in arms.

import { dateOf } from "./Calendar";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { wed } from "./Interactions";
import {
  addRenown,
  addStress,
  earn,
  gainTrait,
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
import {
  isChildLife,
  isNativeChar,
  lifeIsNative,
  meOf,
  opinionOf,
  weddingCost,
} from "./LifeQueries";
import { joinMovement, movementOf } from "./Movements";
import { businessOf, houseOf, landOf } from "./Property";
import { ageOf, charName } from "./Queries";
import type { Character, JobKind, Life, Skill, TraitId } from "./Types";
import { leaveJob, takeJob } from "./Work";

// ---------------------------------------------------------------- helpers

const me = (g: ConquestGame, life: Life) => meOf(g.s, life)!;
const month = (g: ConquestGame) => dateOf(g.s.day).month;
const year = (g: ConquestGame) => dateOf(g.s.day).year;
const adult = (g: ConquestGame, life: Life) => !isChildLife(g.s, life);
const job = (life: Life, ...kinds: JobKind[]) =>
  !!life.job && kinds.includes(life.job.kind);
const working = (life: Life, ...kinds: JobKind[]) =>
  job(life, ...kinds) && life.job!.prov === life.prov;
const native = (g: ConquestGame, life: Life) => lifeIsNative(g.s, life);
const colonist = (g: ConquestGame, life: Life) => !lifeIsNative(g.s, life);
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const nameOf = (g: ConquestGame, ctx: LCtx) => charName(g.s.chars[ctx.c]);
const who = (g: ConquestGame, ctx: LCtx) => g.s.chars[ctx.c];
const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

interface Fx {
  coins?: number;
  renown?: number;
  stress?: number;
  health?: number;
  favor?: number;
  xp?: Partial<Record<Skill, number>>;
  gain?: TraitId;
}

function fx(g: ConquestGame, life: Life, f: Fx, cause = "misadventure"): void {
  if (f.coins) earn(g, life, f.coins);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.favor) touchLife(g, life).favor = Math.max(0, life.favor + f.favor);
  for (const [k, v] of Object.entries(f.xp ?? {}))
    gainXp(g, life, k as Skill, v ?? 0);
  if (f.gain) gainTrait(g, life, f.gain);
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, cause);
  }
}

const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

/** Someone of the town for an event's face. */
function local(
  g: ConquestGame,
  life: Life,
  pick: (c: Character) => boolean = () => true,
): Character | undefined {
  const s = g.s;
  return g.rng.pick(
    householdsOf(s, life.prov).filter(
      (c) =>
        c.id !== life.c &&
        ageOf(s, c) >= 16 &&
        pick(c) &&
        !s.lives.some((l) => l.c === c.id),
    ),
  );
}

function bossCtx(g: ConquestGame, life: Life): LCtx | null {
  const id = life.job && !life.job.own ? life.job.employer : -1;
  return g.s.chars[id]?.alive ? { c: id } : {};
}

const like = (
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  why: string,
  v: number,
) => {
  const c = who(g, ctx);
  if (c?.alive) remembers(g, life, g.char(c.id), why, v, 2);
};

// ---------------------------------------------------------------- the tales

export const TALES: LifeEventDef[] = [
  // ------------------------------------------------ at work
  {
    key: "farm-hogs",
    pool: "any",
    cooldown: 400,
    when: (g, life) =>
      working(life, "farmer", "grower") ? bossCtx(g, life) : null,
    title: "Hogs in the corn",
    body: () =>
      "Somebody's hogs have broken through the fence and are making a meal of the corn. Their owner is a known quantity: large, litigious and fond of his hogs.",
    choices: [
      {
        label: "Drive them out and mend the fence",
        tip: "A day's hard work: farming, a little stress.",
        apply: (g, life) => fx(g, life, { xp: { farming: 6 }, stress: 3 }),
      },
      {
        label: "Take one for your trouble",
        tip: "Stealth: a fine side of bacon (+3 coins). Caught, and you're the talk of the county (−3 renown).",
        check: { skill: "stealth", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { coins: 3 });
            say(g, life, "Bacon all winter, and nobody the wiser.", "good");
          } else {
            fx(g, life, { renown: -3, stress: 4 });
            say(
              g,
              life,
              "The hog's owner saw. So did the whole parish, by Sunday.",
              "bad",
            );
          }
        },
      },
      {
        label: "Take him to the magistrate",
        tip: "Letters: damages of 4 coins, and an enemy for life.",
        check: { skill: "letters", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { coins: 4, xp: { letters: 4 } });
          else fx(g, life, { coins: -2, stress: 3 });
          say(
            g,
            life,
            pass
              ? "The magistrate found for you. The hogs did not attend."
              : "The magistrate found for the hogs, essentially.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "farm-price",
    pool: "any",
    cooldown: 600,
    when: (g, life) => (job(life, "farmer") && life.job!.rank >= 1 ? {} : null),
    title: "Prices in London",
    body: (g) =>
      `Letters from the factors: ${g.s.europe.price.tobacco > 5 ? "tobacco sells dear this year, and everyone is planting more of it, which will cure that" : "tobacco is a drug on the market, and the factors want to be paid for the freight anyway"}.`,
    choices: [
      {
        label: "Plant more tobacco",
        tip: "Trade: a good year (+8 coins), or a glut (−4).",
        check: { skill: "trade", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { coins: 8, xp: { trade: 5 } } : { coins: -4, stress: 5 },
          ),
      },
      {
        label: "Plant corn and wheat: safe",
        tip: "Farming; +2 coins.",
        apply: (g, life) => fx(g, life, { coins: 2, xp: { farming: 5 } }),
      },
    ],
  },
  {
    key: "mill-wages",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      if (!job(life, "millhand", "craftsman") || life.job!.rank < 2)
        return null;
      return {};
    },
    title: "The hands want more",
    body: () =>
      "The men have put down their tools and sent a spokesman, cap in hand and jaw set. Bread is dear, they say, and the wages aren't.",
    choices: [
      {
        label: "Meet them halfway (4 coins)",
        tip: "Peace in the yard; leadership; less stress.",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life) => {
          spend(g, life, 4);
          fx(g, life, { xp: { leadership: 6 }, stress: -4, renown: 1 });
        },
      },
      {
        label: "Talk them round",
        tip: "Persuasion: back to work for a promise. Fail and the yard stands idle a week.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { xp: { persuasion: 6, leadership: 4 } }
              : { stress: 8, coins: -3 },
          );
          say(
            g,
            life,
            pass
              ? "A speech, a barrel of small beer, and back to work."
              : "A week of nothing, and bad feeling for longer.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Sack the spokesman",
        tip: "Order kept; you're hated in the taverns (−3 renown).",
        apply: (g, life) => fx(g, life, { renown: -3, xp: { leadership: 3 } }),
      },
    ],
  },
  {
    key: "craft-commission",
    pool: "any",
    cooldown: 400,
    when: (g, life) => {
      if (!job(life, "craftsman", "maker", "millhand")) return null;
      const c = local(
        g,
        life,
        (x) =>
          !!x.role &&
          ["planter", "merchant", "official", "sachem"].includes(x.role),
      );
      return c ? { c: c.id } : null;
    },
    title: "A fine commission",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} wants something fine made: ${native(g, life) ? "a canoe fit for a council, prow carved with the clan's sign" : "a walnut chest with brass corners, to impress a visitor from home"}. ${cap(he(who(g, ctx)))} will pay well, and talk if it's poor.`,
    choices: [
      {
        label: "Do your very best work",
        tip: "Craft: +8 coins and renown; spoil it and you're a laughing stock.",
        check: { skill: "craft", dc: 9 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            fx(g, life, { coins: 8, renown: 3, xp: { craft: 10 } });
            like(g, life, ctx, "Fine work", 12);
          } else {
            fx(g, life, { renown: -2, stress: 5, xp: { craft: 5 } });
            like(g, life, ctx, "Botched my commission", -10);
          }
        },
      },
      {
        label: "Turn it down: you're busy enough",
        tip: "Nothing ventured.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "press-retraction",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      if (!job(life, "newsman") || life.job!.rank < 1) return null;
      const n = g.s.nations[g.s.provinces[life.prov].owner];
      const gov = g.s.chars[n?.ruler ?? -1];
      return gov?.alive ? { c: gov.id } : null;
    },
    scene: "press",
    title: "The governor objects",
    body: (g, life, ctx) =>
      `A paragraph in last week's sheet suggested the colony's accounts were kept "with more imagination than arithmetic". ${cap(nameOf(g, ctx))} has written, in a hand that shakes slightly, to demand a retraction.`,
    choices: [
      {
        label: "Print the retraction",
        tip: "The governor is mollified (+10); the readers are disappointed (−2 renown).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Printed my retraction", 10);
          fx(g, life, { renown: -2 });
        },
      },
      {
        label: "Print the accounts",
        tip: "Letters: +6 renown and the town's delight; the governor's lasting enmity (−25).",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Printed the accounts", -25);
          fx(
            g,
            life,
            pass ? { renown: 6, xp: { letters: 8 } } : { renown: 2, stress: 8 },
          );
          say(
            g,
            life,
            pass
              ? "Every tavern in the colony read them aloud."
              : "The figures were dull, and the governor's men were not.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "soldier-deserter",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      if (!job(life, "soldier", "warrior")) return null;
      const c = local(g, life, (x) => !x.female);
      return c ? { c: c.id } : null;
    },
    scene: "fort",
    title: "A comrade's secret",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} whispers it over the cookpot: ${he(who(g, ctx))} means to slip away tonight, before the march. ${cap(his(who(g, ctx)))} wife is sick. ${cap(he(who(g, ctx)))} asks you to look the other way.`,
    choices: [
      {
        label: "Look the other way",
        tip: "A friend for life (+25); if it comes out, trouble for you.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Let me go home", 25);
          if (g.rng.chance(0.25)) {
            fx(g, life, { renown: -3, stress: 6 });
            say(
              g,
              life,
              "The sergeant asked who was on watch. You were.",
              "bad",
            );
          }
        },
      },
      {
        label: "Report it",
        tip: "Your officers approve (+favour); the men don't (−2 renown).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Informed on me", -40);
          fx(g, life, { favor: 3, renown: -2 });
        },
      },
      {
        label: "Talk him out of it",
        tip: "Persuasion: he stays, and thanks you later.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          if (pass) like(g, life, ctx, "Talked sense into me", 15);
          else
            say(
              g,
              life,
              "He went anyway. The roll call was short a name.",
              "bad",
            );
        },
      },
    ],
  },
  {
    key: "soldier-inspection",
    pool: "any",
    cooldown: 400,
    when: (g, life) => (working(life, "soldier") ? {} : null),
    scene: "fort",
    title: "The colonel's inspection",
    body: () =>
      "The colonel is coming down the line with a white glove, a bad temper and a scrap of paper on which he writes the names of the slovenly.",
    choices: [
      {
        label: "Pipeclay, blacking and brick-dust all night",
        tip: "Leadership and fighting; a good word on the colonel's paper.",
        check: { skill: "leadership", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 2, favor: 1, xp: { fighting: 4 } } : { stress: 6 },
          );
          if (life.job) life.job.months += pass ? 2 : 0;
          say(
            g,
            life,
            pass
              ? '"That man," said the colonel, pointing at you, "is a soldier."'
              : "A speck of rust. The colonel noticed. He always does.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Trust to luck",
        tip: "A roll of the dice.",
        apply: (g, life) => {
          if (g.rng.chance(0.5))
            say(g, life, "He passed you by without a glance.");
          else {
            fx(g, life, { stress: 5 });
            say(
              g,
              life,
              "Extra drill for a week. Your feet know all about it.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "sailor-mutiny",
    pool: "sea",
    cooldown: 600,
    when: (g, life) => (job(life, "sailor") ? {} : null),
    title: "Grumbling below decks",
    body: () =>
      "The salt beef has turned, the water's green and the captain flogs for less than a look. The men in the forecastle are muttering, and a knife has been passed from hand to hand.",
    choices: [
      {
        label: "Go to the captain",
        tip: "Seamanship and leadership: you stop it before it starts; the crew won't thank you.",
        check: { skill: "leadership", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 3, xp: { leadership: 6 } }
              : { health: -10, stress: 8 },
            "a knife below decks",
          ),
      },
      {
        label: "Keep your head down",
        tip: "It blows over, mostly.",
        apply: (g, life) => fx(g, life, { stress: 4 }),
      },
      {
        label: "Stand with the men",
        tip: "Fighting: better rations by morning; fail and it's the cat-o'-nine-tails.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 2, stress: -3 } : { health: -15, stress: 10 },
            "a flogging at sea",
          ),
      },
    ],
  },
  {
    key: "sailor-whale",
    pool: "sea",
    cooldown: 500,
    title: "There she blows",
    body: () =>
      "A spout off the starboard bow, then another: whales, a whole pod of them, rolling in the swell. Every hand is at the rail. One of the old men takes off his hat.",
    choices: [
      {
        label: "Watch them go",
        tip: "Some things are worth seeing once. −8 stress.",
        apply: (g, life) => fx(g, life, { stress: -8 }),
      },
      {
        label: "Lower a boat after them",
        tip: "Seamanship: oil worth 6 coins; fail and the boat's stove in.",
        check: { skill: "seamanship", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { coins: 6, renown: 2, xp: { seamanship: 8 } }
              : { health: -12, stress: 6 },
            "a whale's tail",
          ),
      },
    ],
  },
  {
    key: "clerk-ledger",
    pool: "any",
    cooldown: 500,
    when: (g, life) =>
      job(life, "clerk", "official") ? bossCtx(g, life) : null,
    scene: "market",
    title: "The books don't balance",
    body: () =>
      "Forty pounds, near enough, have gone missing between the ledger and the strongbox. You've been over it three times. The answer is either a careless entry or someone's sticky fingers, and you can guess whose.",
    choices: [
      {
        label: "Find the mistake, however long it takes",
        tip: "Letters: it was an error, and you've saved a reputation (+renown, master +10).",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            fx(g, life, { renown: 2, xp: { letters: 8, trade: 4 } });
            like(g, life, ctx, "Saved the books", 10);
          } else fx(g, life, { stress: 8 });
        },
      },
      {
        label: "Quietly make it balance",
        tip: "Stealth: nobody need ever know. If they do, you're finished here.",
        check: { skill: "stealth", dc: 9 },
        apply: (g, life, ctx, pass) => {
          if (!pass) {
            like(g, life, ctx, "Cooked my books", -40);
            fx(g, life, { renown: -6 });
            leaveJob(g, life, "in disgrace");
          }
        },
      },
    ],
  },
  {
    key: "law-case",
    pool: "any",
    cooldown: 450,
    when: (g, life) => (job(life, "law") ? {} : null),
    scene: "governor",
    title: "Two clients",
    body: () =>
      "A widow whose late husband's land is claimed by a planter, and the planter, who offers twice your usual fee to represent him instead. The widow can pay in eggs.",
    choices: [
      {
        label: "Take the widow's case",
        tip: "Persuasion: win and the county loves you (+5 renown); lose and you're out of pocket.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 5, xp: { persuasion: 8 } }
              : { stress: 6, coins: -1 },
          ),
      },
      {
        label: "Take the planter's money",
        tip: "+8 coins; the gentry like you; the county doesn't (−2 renown).",
        apply: (g, life) =>
          fx(g, life, { coins: 8, renown: -2, xp: { letters: 4 } }),
      },
    ],
  },
  {
    key: "preacher-dancing",
    pool: "any",
    cooldown: 500,
    when: (g, life) => (job(life, "preacher") && colonist(g, life) ? {} : null),
    scene: "church",
    title: "Dancing on the Sabbath",
    body: () =>
      "Word reaches the vestry that the young people of the parish were seen dancing, on a Sunday, to a fiddle, in a barn. There was also, it is reported, laughter.",
    choices: [
      {
        label: "Thunder from the pulpit",
        tip: "Faith: the godly approve (+renown); the young sulk.",
        check: { skill: "faith", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { renown: 3, xp: { faith: 6 } } : { renown: -1 }),
      },
      {
        label: "Have a quiet word, and let it go",
        tip: "Persuasion; the young like you better; the elders mutter.",
        apply: (g, life) => fx(g, life, { xp: { persuasion: 5 }, stress: -3 }),
      },
      {
        label: "Go to the next one",
        tip: "−10 stress. Scandal, if anyone talks (−4 renown).",
        apply: (g, life) => {
          fx(g, life, { stress: -10 });
          if (g.rng.chance(0.4)) {
            fx(g, life, { renown: -4 });
            say(g, life, "Somebody talked. The vestry has questions.", "bad");
          } else say(g, life, "A fine evening, and nobody need know.", "good");
        },
      },
    ],
  },
  {
    key: "physician-inoculation",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      job(life, "physician", "healer") && year(g) >= 1715 ? {} : null,
    scene: "apothecary",
    title: "Inoculation",
    body: () =>
      "A letter from Boston describes a practice from Africa and the Turks: matter from a smallpox sore scratched into a healthy arm, a mild case, and safety ever after. The ministers are for it. The town is against it. Somebody threw a firebomb through Mather's window.",
    choices: [
      {
        label: "Inoculate those who'll let you",
        tip: "Medicine: lives saved and renown (+6); fail and a patient dies, and you're blamed.",
        check: { skill: "medicine", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 6, xp: { medicine: 12 } }
              : { renown: -5, stress: 12 },
          ),
      },
      {
        label: "Wait and see",
        tip: "Safe, and a little shameful.",
        apply: (g, life) => fx(g, life, { stress: 2 }),
      },
    ],
  },
  {
    key: "innkeeper-guest",
    pool: "any",
    cooldown: 400,
    when: (g, life) => (working(life, "innkeeper") ? {} : null),
    scene: "tavern",
    title: "The gentleman in the best room",
    body: () =>
      "He has eaten for three, drunk for five, called for the best room and the second-best wine, and now, with a beautiful bow, regrets that his purse was stolen on the road. He is expecting a remittance. From London.",
    choices: [
      {
        label: "Put it on the slate",
        tip: "Trade: he pays, with interest (+6). Or vanishes.",
        check: { skill: "trade", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 6 } : { coins: -3, stress: 4 });
          say(
            g,
            life,
            pass
              ? "The remittance came. Astonishing."
              : "Gone before dawn, with the candlesticks.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Send for the constable",
        tip: "Your money's gone, but so is he.",
        apply: (g, life) => fx(g, life, { coins: -1, renown: 1 }),
      },
      {
        label: "Have him wash pots",
        tip: "Fighting: he works off the debt. He may object.",
        check: { skill: "fighting", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { stress: -4, renown: 1 } : { health: -6 },
            "a gentleman's cane",
          ),
      },
    ],
  },
  {
    key: "trapper-poachers",
    pool: "any",
    cooldown: 450,
    when: (g, life) => (job(life, "trapper", "hunter") ? {} : null),
    scene: "woods",
    title: "Someone's on your lines",
    body: () =>
      "Your traps have been sprung and emptied, the beaver gone and the sets left lying. Boot prints, two men, heading upriver toward a camp whose smoke you can see from the ridge.",
    choices: [
      {
        label: "Confront them",
        tip: "Fighting: your furs back (+4 coins); lose and you're hurt.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { coins: 4, renown: 2 } : { health: -14 },
            "a fight over beaver",
          ),
      },
      {
        label: "Move your lines further out",
        tip: "Woodcraft; nothing lost but time.",
        apply: (g, life) => fx(g, life, { xp: { woodcraft: 8 }, stress: 2 }),
      },
      {
        label: "Steal their furs instead",
        tip: "Stealth: +6 coins of somebody else's beaver.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { coins: 6 } : { health: -10, stress: 6 },
            "two angry trappers",
          ),
      },
    ],
  },
  {
    key: "hunter-white-deer",
    pool: "any",
    cooldown: 900,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    scene: "woods",
    title: "The white deer",
    body: () =>
      "In the half-light by the stream: a deer, white as frost, watching you. The old people say such a one is a messenger, and that whoever kills it will be sorry for the rest of a short life.",
    choices: [
      {
        label: "Lower your bow, and watch it go",
        tip: "Faith; the elders hear of it (+renown); peace of mind.",
        apply: (g, life) =>
          fx(g, life, { stress: -12, renown: 2, xp: { faith: 6 } }),
      },
      {
        label: "Loose the arrow",
        tip: "Woodcraft: a hide traders would pay 10 coins for. And the old people's warning.",
        check: { skill: "woodcraft", dc: 9 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { coins: 10, stress: 8 });
            say(g, life, "You have the hide. You do not sleep well.", "bad");
          } else say(g, life, "The arrow went wide. The deer was gone.");
        },
      },
    ],
  },
  {
    key: "warrior-captive",
    pool: "any",
    cooldown: 700,
    when: (g, life) => (job(life, "warrior") ? {} : null),
    scene: "village",
    title: "A captive",
    body: () =>
      "The war party is back with a captive: a young man of an enemy town, bruised and silent. The clan mothers will decide whether he is adopted to replace one of the dead, or not. A mother who lost a son last winter is looking at him.",
    choices: [
      {
        label: "Speak for adoption",
        tip: "Persuasion: a new kinsman, and the mother's gratitude.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 3, stress: -6, xp: { persuasion: 5 } }
              : { stress: 3 },
          ),
      },
      {
        label: "Say nothing: it's for the clan mothers",
        tip: "Nothing changes.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "trader-rivals",
    pool: "any",
    cooldown: 600,
    when: (g, life) => (job(life, "trader") ? {} : null),
    scene: "village",
    title: "Two flags at the trading ground",
    body: () =>
      "A French trader and an English one have arrived the same week, each with a canoe full of kettles and cloth and a speech about which king loves your people more. Each would like you to send the furs his way.",
    choices: [
      {
        label: "Play them off against each other",
        tip: "Trade: better prices from both (+8 coins).",
        check: { skill: "trade", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { coins: 8, xp: { trade: 10 } }
              : { coins: 2, xp: { trade: 4 } },
          ),
      },
      {
        label: "Deal with the one who came first",
        tip: "+3 coins, and a reputation for keeping your word.",
        apply: (g, life) => fx(g, life, { coins: 3, renown: 2 }),
      },
    ],
  },
  {
    key: "speaker-wampum",
    pool: "any",
    cooldown: 600,
    when: (g, life) => (job(life, "speaker") ? {} : null),
    scene: "councilfire",
    title: "A belt to carry",
    body: () =>
      "The sachem gives you a belt of wampum, purple and white, its pattern a message the colonists' governor must hear and remember: the path between your peoples is to be kept clear of brambles. You are to speak the words that go with it.",
    choices: [
      {
        label: "Carry it with all due ceremony",
        tip: "Persuasion: the governor takes it seriously (+renown, +favour).",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 5, favor: 3, xp: { persuasion: 8, letters: 4 } }
              : { stress: 5, xp: { persuasion: 4 } },
          ),
      },
      {
        label: "Ask an elder to go with you",
        tip: "Safer; less of the glory.",
        apply: (g, life) => fx(g, life, { renown: 2, xp: { letters: 4 } }),
      },
    ],
  },
  {
    key: "servant-bolt",
    pool: "any",
    cooldown: 500,
    when: (g, life) => (job(life, "servant") ? {} : null),
    scene: "fields",
    title: '"Come with me"',
    body: () =>
      "Another of the master's servants has a plan: a boat, a moonless night, and a cousin in the next colony who asks no questions. There's room for two.",
    choices: [
      {
        label: "Go with them",
        tip: "Stealth: free. Caught: a year added to your term, and the lash.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            touchLife(g, life).job = null;
            fx(g, life, { renown: -2 });
            say(
              g,
              life,
              "Across the water by dawn, and nobody's servant now.",
              "good",
            );
          } else {
            if (life.job) life.job.until = (life.job.until ?? g.s.day) + 365;
            fx(g, life, { health: -12 }, "a flogging for running away");
            say(
              g,
              life,
              "Caught at the river. Another year on your term.",
              "bad",
            );
          }
        },
      },
      {
        label: "Wish them luck and stay",
        tip: "Your term runs on.",
        apply: (g, life) => fx(g, life, { stress: 3 }),
      },
    ],
  },
  // ------------------------------------------------ about town
  {
    key: "tavern-sharper",
    pool: "any",
    cooldown: 400,
    when: (g, life) =>
      adult(g, life) && life.area === "tavern" && colonist(g, life) ? {} : null,
    scene: "tavern",
    title: "A friendly game",
    body: () =>
      "A stranger in a good coat, with clean hands and an easy laugh, invites you to a friendly game of loo. He has lost three hands in a row to the blacksmith, and seems not to mind at all.",
    choices: [
      {
        label: "Sit down (5 coins)",
        tip: "Trade: you spot the marked cards and win (+8); or you don't (−5).",
        check: { skill: "trade", dc: 9 },
        blocked: (g, life) => poor(life, 5),
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { coins: 8, renown: 1 } : { coins: -5, stress: 4 },
          );
          say(
            g,
            life,
            pass
              ? "You turned his own marked deck on him. He left town at a trot."
              : "Your money left with him.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Warn the blacksmith",
        tip: "A friend in the blacksmith; a stranger who'd like a word.",
        apply: (g, life) => fx(g, life, { renown: 2 }),
      },
    ],
  },
  {
    key: "tavern-recruiter",
    pool: "any",
    cooldown: 600,
    when: (g, life) =>
      adult(g, life) &&
      colonist(g, life) &&
      !me(g, life).female &&
      !life.job &&
      life.area === "tavern"
        ? {}
        : null,
    scene: "tavern",
    title: "The king's shilling",
    body: () =>
      "A sergeant with a ribboned hat is buying the whole tavern drinks and telling stories of glory, prize money and the girls of Flanders. At the bottom of your third pot there's a shilling. You know what that means.",
    choices: [
      {
        // Unanswered, you leave the shilling in the pot.
        label: "Push the pot away",
        tip: "No shilling, no soldiering. The sergeant finds a drunker man.",
        apply: (g, life) =>
          say(
            g,
            life,
            "You push the pot away, shilling and all. The sergeant shrugs and moves down the bench.",
          ),
      },
      {
        label: "Take it: enlist",
        tip: "You're a soldier now (if there's a fort to serve at).",
        apply: (g, life) => {
          if (
            g.s.provinces[life.prov].b.fort ||
            g.s.nations[g.s.provinces[life.prov].owner]?.capital === life.prov
          ) {
            const err = enlistHere(g, life);
            if (err) say(g, life, err);
          } else
            say(
              g,
              life,
              "There's no fort here to take you. The sergeant is disappointed.",
            );
        },
      },
      {
        label: "Spit it out and run",
        tip: "Stealth: away clean.",
        check: { skill: "stealth", dc: 5 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { stress: -2 } : { health: -5, stress: 4 },
            "a sergeant's cudgel",
          ),
      },
    ],
  },
  {
    key: "market-thief",
    pool: "any",
    cooldown: 400,
    when: (g, life) =>
      adult(g, life) && life.area === "market" && life.purse > 5 ? {} : null,
    scene: "market",
    title: "Stop, thief!",
    body: () =>
      "A tug at your belt, and a boy is away through the stalls with your purse, scattering cabbages and chickens. Everyone is shouting. Nobody is chasing.",
    choices: [
      {
        label: "After him!",
        tip: "Fighting (your legs, really): your purse back, and a crowd's cheer.",
        check: { skill: "fighting", dc: 6 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { renown: 2 });
          else {
            const lost = Math.min(Math.floor(life.purse * 0.3), 15);
            spend(g, life, lost);
            say(g, life, `Gone, with ${lost} coins of yours.`, "bad");
          }
        },
      },
      {
        label: "Let him go: he looked hungry",
        tip: "Lose some coins; feel better about it than you should (−5 stress).",
        apply: (g, life) => {
          spend(g, life, Math.min(Math.floor(life.purse * 0.25), 10));
          fx(g, life, { stress: -5 });
        },
      },
    ],
  },
  {
    key: "church-pew",
    pool: "any",
    cooldown: 700,
    when: (g, life) => {
      if (!adult(g, life) || !colonist(g, life) || life.renown < 5) return null;
      const c = local(
        g,
        life,
        (x) =>
          !!x.role &&
          ["planter", "merchant", "official", "lawyer"].includes(x.role),
      );
      return c ? { c: c.id } : null;
    },
    scene: "church",
    title: "The matter of the pews",
    body: (g, life, ctx) =>
      `The vestry is reseating the church by rank and estate. ${cap(nameOf(g, ctx))} has been given the pew in front of yours, and has mentioned it twice.`,
    choices: [
      {
        label: "Pay for a better pew (6 coins)",
        tip: "+3 renown, a view of the pulpit, and a pew of your own (half a coin a month to keep).",
        blocked: (g, life) => poor(life, 6),
        apply: (g, life) => {
          spend(g, life, 6);
          touchLife(g, life).kit = { ...(life.kit ?? {}), pew: g.s.day };
          fx(g, life, { renown: 3 });
        },
      },
      {
        label: "Rise above it",
        tip: "Faith; less stress; they'll think you've no ambition.",
        apply: (g, life) => fx(g, life, { stress: -3, xp: { faith: 3 } }),
      },
      {
        label: "Make a scene at the vestry",
        tip: "Persuasion: you win the pew (+2 renown); they hate you (−15).",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Squabbled over a pew", -15);
          fx(g, life, pass ? { renown: 2 } : { renown: -2, stress: 5 });
        },
      },
    ],
  },
  {
    key: "docks-pressgang",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      adult(g, life) &&
      colonist(g, life) &&
      !me(g, life).female &&
      life.area === "docks" &&
      !job(life, "sailor")
        ? {}
        : null,
    scene: "docks",
    title: "The press gang",
    body: () =>
      "Six men with cudgels and a lieutenant with a warrant: His Majesty's ship in the roads is short of hands, and His Majesty is not particular about whose.",
    choices: [
      {
        label: "Run for it",
        tip: "Stealth: away. Caught: a beating and a month at sea against your will.",
        check: { skill: "stealth", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (!pass) {
            fx(
              g,
              life,
              { health: -10, stress: 12, xp: { seamanship: 15 } },
              "the press gang",
            );
            say(
              g,
              life,
              "They had you aboard before dark. A month before you got off again.",
              "bad",
            );
          }
        },
      },
      {
        label: "Show your papers, loudly",
        tip: "Letters: free men have rights. The lieutenant disagrees, but leaves.",
        check: { skill: "letters", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { renown: 2 } : { health: -8 }, "the press gang"),
      },
      {
        label: "Buy them a drink (2 coins)",
        tip: "Money talks: they look elsewhere.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => spend(g, life, 2),
      },
    ],
  },
  {
    key: "governor-ball",
    pool: "any",
    cooldown: 700,
    when: (g, life) => {
      if (!adult(g, life) || !colonist(g, life) || life.renown < 12)
        return null;
      const n = g.s.nations[g.s.provinces[life.prov].owner];
      if (!n || n.capital !== life.prov) return null;
      const gov = g.s.chars[n.ruler];
      return gov?.alive && gov.id !== life.c ? { c: gov.id } : null;
    },
    scene: "governor",
    title: "The governor's ball",
    body: (g, life, ctx) =>
      `An invitation, gilt-edged: ${nameOf(g, ctx)} requests the pleasure of your company on the King's birthday. There will be dancing, toasts, and everyone who matters watching everyone else.`,
    choices: [
      {
        label: "Go in your best (4 coins)",
        tip: "Persuasion: you shine (+renown, the governor +10); or you step on the governor's lady.",
        check: { skill: "persuasion", dc: 8 },
        blocked: (g, life) => poor(life, 4),
        apply: (g, life, ctx, pass) => {
          spend(g, life, 4);
          if (pass) {
            fx(g, life, { renown: 4, favor: 2 });
            like(g, life, ctx, "A credit at my ball", 10);
          } else fx(g, life, { stress: 6, renown: -1 });
        },
      },
      {
        label: "Send regrets",
        tip: "Nothing changes; you're noticed by your absence.",
        apply: (g, life, ctx) => like(g, life, ctx, "Declined my ball", -4),
      },
    ],
  },
  {
    key: "home-roof",
    pool: "any",
    cooldown: 700,
    when: (g, life) => (houseOf(life) && life.prov === life.home ? {} : null),
    scene: "home",
    title: "The roof",
    body: () =>
      "It rained in the night, and it rained in the house too, mostly over the bed. The shingles are rotten, the man who could fix them is busy until spring, and spring is a long way off.",
    choices: [
      {
        label: "Pay to have it done now (6 coins)",
        tip: "Dry, and less stress.",
        blocked: (g, life) => poor(life, 6),
        apply: (g, life) => {
          spend(g, life, 6);
          fx(g, life, { stress: -3 });
        },
      },
      {
        label: "Do it yourself",
        tip: "Craft: done. Fail: a fall from the ladder.",
        check: { skill: "craft", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { xp: { craft: 8 } } : { health: -12 },
            "a fall from the roof",
          ),
      },
      {
        label: "Put a bucket under it",
        tip: "Free; damp; +5 stress all winter.",
        apply: (g, life) => fx(g, life, { stress: 5, health: -2 }),
      },
    ],
  },
  // ------------------------------------------------ business and property
  {
    key: "business-thief",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      const b = businessOf(life);
      const h = b?.hands.find(
        (id) => g.s.chars[id]?.alive && !g.s.lives.some((l) => l.c === id),
      );
      return h !== undefined ? { c: h } : null;
    },
    title: "Light fingers",
    body: (g, life, ctx) =>
      `Stock has been walking out of your business, a little at a time, and ${nameOf(g, ctx)} has been seen walking out with it. ${cap(he(who(g, ctx)))} has a family, and a good excuse, and three of them.`,
    choices: [
      {
        label: "Turn them off",
        tip: "Lose a hand; stop the losses.",
        apply: (g, life, ctx) => {
          const b = businessOf(life);
          if (b) {
            touchLife(g, life);
            b.hands = b.hands.filter((x) => x !== ctx.c);
          }
          like(g, life, ctx, "Turned me off", -20);
        },
      },
      {
        label: "Forgive them, once",
        tip: "They're grateful (+20); it may happen again.",
        apply: (g, life, ctx) => like(g, life, ctx, "Forgave me", 20),
      },
    ],
  },
  {
    key: "business-order",
    pool: "any",
    cooldown: 400,
    when: (g, life) => (businessOf(life) ? {} : null),
    title: "A great order",
    body: (g, life) =>
      `A merchant from away wants more from your ${businessOf(life)?.name ?? "business"} than you can make in a month, and will pay handsomely if it's done by the next ship.`,
    choices: [
      {
        label: "Work everyone day and night",
        tip: "Leadership: +12 coins; −stress for nobody.",
        check: { skill: "leadership", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { coins: 12, stress: 8, xp: { leadership: 6 } }
              : { coins: 4, stress: 12 },
          ),
      },
      {
        label: "Take what you can do well",
        tip: "+5 coins, a good name.",
        apply: (g, life) => fx(g, life, { coins: 5, renown: 1 }),
      },
    ],
  },
  {
    key: "land-squatters",
    pool: "any",
    cooldown: 700,
    when: (g, life) => (landOf(life) ? {} : null),
    scene: "fields",
    title: "Squatters",
    body: () =>
      "A family has built a cabin on the far corner of your land: two cows, five children, a long rifle, and a firm view that land nobody was using belongs to whoever uses it.",
    choices: [
      {
        label: "Let them stay, for rent",
        tip: "Persuasion: they pay (+2 coins a year, roughly); or they don't.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { coins: 3, renown: 1 } : { stress: 3 }),
      },
      {
        label: "Have the sheriff put them off",
        tip: "Your land, cleared; your name, muttered in the backcountry.",
        apply: (g, life) => fx(g, life, { renown: -2, coins: -1 }),
      },
    ],
  },
  {
    key: "house-relatives",
    pool: "any",
    cooldown: 900,
    when: (g, life) => {
      const h = houseOf(life);
      return h && h.level >= 2 ? {} : null;
    },
    scene: "home",
    title: "Relations",
    body: () =>
      "Your spouse's cousins have arrived from the old country, all six of them, with a trunk each and no plans to leave. They admire the house. They admire the dinner. They admire the dinner again.",
    choices: [
      {
        label: "Make them welcome (5 coins)",
        tip: "Family is family: +renown for open-handedness.",
        blocked: (g, life) => poor(life, 5),
        apply: (g, life) => {
          spend(g, life, 5);
          fx(g, life, { renown: 2, stress: 4 });
        },
      },
      {
        label: "Find them all work, quickly",
        tip: "Persuasion: they're gone in a month.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { stress: -3 } : { stress: 8, coins: -3 }),
      },
    ],
  },
  // ------------------------------------------------ ties
  {
    key: "lover-scandal",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      if (me(g, life).spouse < 0) return null;
      const id = Object.entries(life.ties).find(([, t]) => t === "lover")?.[0];
      return id !== undefined && g.s.chars[Number(id)]?.alive
        ? { c: Number(id) }
        : null;
    },
    scene: "home",
    title: "Talk",
    body: (g, life, ctx) =>
      `Your ${me(g, life).female ? "husband" : "wife"} has heard something about you and ${nameOf(g, ctx)}. So, it seems, has the whole street.`,
    choices: [
      {
        label: "End it",
        tip: "Your lover is heartbroken (−30); home is quieter.",
        apply: (g, life, ctx) => {
          setTie(g, life, ctx.c, null);
          like(g, life, ctx, "Threw me over", -30);
          fx(g, life, { stress: 5 });
        },
      },
      {
        label: "Deny everything",
        tip: "Stealth: believed. Not believed: renown −4, and a cold house.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (!pass) {
            fx(g, life, { renown: -4, stress: 10 });
            const sp = g.s.chars[me(g, life).spouse];
            if (sp?.alive)
              remembers(g, life, g.char(sp.id), "Faithless", -30, 5);
          }
        },
      },
    ],
  },
  {
    key: "sweetheart-asks",
    pool: "any",
    weight: 2,
    cooldown: 200,
    when: (g, life) => {
      const m = me(g, life);
      if (m.spouse >= 0 || !adult(g, life) || life.purse < 0) return null;
      const id = Object.entries(life.ties).find(([k, t]) => {
        const c = g.s.chars[Number(k)];
        return (
          t === "lover" &&
          !!c?.alive &&
          !c.abroad &&
          c.spouse < 0 &&
          c.female !== m.female &&
          ageOf(g.s, c) >= 16 &&
          !g.s.lives.some((l) => l.c === c.id)
        );
      })?.[0];
      return id !== undefined ? { c: Number(id) } : null;
    },
    scene: "church",
    title: "A question by the churchyard wall",
    body: (g, life, ctx) => {
      const c = who(g, ctx);
      return `${cap(nameOf(g, ctx))} has walked out with you long enough for the whole parish to hold an opinion, and the parish has held several. Today, by the churchyard wall, ${he(c)} asks you straight: is it to be a wedding, or isn't it?`;
    },
    choices: [
      {
        label: (g, life) =>
          `Marry them (${weddingCost(g.s, life)} coins for the parson)`,
        tip: "A wedding: a spouse and a household, perhaps a dowry. Much less stress.",
        blocked: (g, life) => poor(life, weddingCost(g.s, life)),
        apply: (g, life, ctx) => {
          const err = wed(g, life, g.char(ctx.c));
          if (err) say(g, life, err);
        },
      },
      {
        label: "Not yet",
        tip: "They'll wait, a while (−10 opinion).",
        apply: (g, life, ctx) => {
          const c = g.char(ctx.c);
          remembers(g, life, c, "Kept me waiting", -10, 1);
          say(
            g,
            life,
            `${cap(he(c))} says ${he(c)} will wait. ${cap(he(c))} doesn't say how long.`,
          );
        },
      },
      {
        label: "Break it off",
        tip: "Sweethearts no more, and not friends either (−30).",
        apply: (g, life, ctx) => {
          const c = g.char(ctx.c);
          setTie(g, life, c.id, null);
          remembers(g, life, c, "Broke my heart", -30, 4);
          addStress(g, life, 4);
          say(
            g,
            life,
            `You and ${charName(c)} are done. The parish has a new opinion.`,
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "rival-challenge",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      if (!adult(g, life)) return null;
      const id = Object.entries(life.ties).find(
        ([k, t]) =>
          (t === "rival" || t === "nemesis") &&
          g.s.chars[Number(k)]?.alive &&
          g.s.chars[Number(k)].home === life.prov,
      )?.[0];
      return id !== undefined ? { c: Number(id) } : null;
    },
    scene: "duel",
    title: "A glove across the face",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} has had enough of you, and says so with a glove, in front of witnesses. Tomorrow at dawn, by the old oak.`,
    choices: [
      {
        label: "Meet them at dawn",
        tip: "Fighting against theirs: win renown; lose blood.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            fx(g, life, { renown: 6, xp: { fighting: 10 } });
            like(g, life, ctx, "Beat me at dawn", -20);
            say(
              g,
              life,
              `You put ${nameOf(g, ctx)} on the grass, and walked away.`,
              "good",
            );
          } else {
            fx(
              g,
              life,
              { health: -25, renown: 1 },
              `a duel with ${nameOf(g, ctx)}`,
            );
          }
        },
      },
      {
        label: "Apologise in public",
        tip: "Safe; humiliating (−4 renown); the quarrel cools.",
        apply: (g, life, ctx) => {
          fx(g, life, { renown: -4 });
          like(g, life, ctx, "Ate humble pie", 20);
        },
      },
    ],
  },
  {
    key: "friend-debt",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      const id = Object.entries(life.ties).find(
        ([k, t]) => t === "friend" && g.s.chars[Number(k)]?.alive,
      )?.[0];
      return id !== undefined && life.purse >= 10 ? { c: Number(id) } : null;
    },
    title: "A friend in trouble",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} comes to you red-eyed: a debt called in, the bailiffs at the door, ten coins between ${him(who(g, ctx))} and ruin.`,
    choices: [
      {
        label: "Give it",
        tip: "−10 coins; a friend forever (+30).",
        blocked: (g, life) => poor(life, 10),
        apply: (g, life, ctx) => {
          spend(g, life, 10);
          like(g, life, ctx, "Saved me from ruin", 30);
          fx(g, life, { stress: -4 });
        },
      },
      {
        label: "Lend it, with a note",
        tip: "Business is business: they're hurt (−5); you'll likely see it again.",
        blocked: (g, life) => poor(life, 10),
        apply: (g, life, ctx) => {
          spend(g, life, 10);
          like(g, life, ctx, "Made me sign a note", -5);
          if (g.rng.chance(0.7)) earn(g, life, 10);
        },
      },
      {
        label: "You haven't got it to spare",
        tip: "The friendship cools (−20).",
        apply: (g, life, ctx) => like(g, life, ctx, "Turned me away", -20),
      },
    ],
  },
  {
    key: "mentor-lesson",
    pool: "any",
    cooldown: 300,
    weight: 2,
    when: (g, life) => {
      const id = Object.entries(life.ties).find(
        ([k, t]) => t === "mentor" && g.s.chars[Number(k)]?.alive,
      )?.[0];
      return id !== undefined ? { c: Number(id) } : null;
    },
    title: "A hard lesson",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} sets you a task ${he(who(g, ctx))} knows you can't quite do, and watches you try. "The only way to learn it," ${he(who(g, ctx))} says, "is to get it wrong in front of me first."`,
    choices: [
      {
        label: "Try your hardest",
        tip: "A big lesson in their craft; −stress if you manage it.",
        apply: (g, life, ctx) => {
          const c = who(g, ctx);
          const sk =
            (c?.role
              ? (
                  {
                    innkeeper: "trade",
                    preacher: "faith",
                    merchant: "trade",
                    captain: "seamanship",
                    sergeant: "fighting",
                    master: "craft",
                    printer: "letters",
                    planter: "farming",
                    physician: "medicine",
                    official: "letters",
                    lawyer: "persuasion",
                    sachem: "persuasion",
                    warleader: "fighting",
                    healer: "medicine",
                    hunter: "woodcraft",
                    elder: "farming",
                    trader: "trade",
                    maker: "craft",
                  } as Record<string, Skill>
                )[c.role]
              : "persuasion") ?? "persuasion";
          fx(g, life, {
            xp: { [sk]: 25 } as Partial<Record<Skill, number>>,
            stress: 3,
          });
          like(g, life, ctx, "A good pupil", 5);
        },
      },
      {
        label: "Make your excuses",
        tip: "Your teacher is disappointed (−10).",
        apply: (g, life, ctx) => like(g, life, ctx, "A lazy pupil", -10),
      },
    ],
  },
  {
    key: "spouse-surprise",
    pool: "any",
    cooldown: 400,
    when: (g, life) => {
      const sp = g.s.chars[me(g, life).spouse];
      return sp?.alive && opinionOf(g.s, sp, life).total >= 40
        ? { c: sp.id }
        : null;
    },
    scene: "home",
    title: "A surprise",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))} has been hiding something under the bed for a month: ${me(g, life).female ? "a new hat, which is either a peace offering or a declaration of war" : "a coat, sewn by hand by candlelight, exactly your size"}.`,
    choices: [
      {
        label: "Be delighted",
        tip: "−10 stress, +10 opinion.",
        apply: (g, life, ctx) => {
          fx(g, life, { stress: -10 });
          like(g, life, ctx, "Loved my gift", 10);
        },
      },
      {
        label: "Ask what it cost",
        tip: "−15 opinion. Accurate, but −15.",
        apply: (g, life, ctx) => like(g, life, ctx, "Asked what it cost", -15),
      },
    ],
  },
  {
    key: "child-apprentice",
    pool: "any",
    cooldown: 700,
    when: (g, life) => {
      const kid = me(g, life)
        .children.map((k) => g.s.chars[k])
        .find(
          (c) =>
            c?.alive && !c.abroad && ageOf(g.s, c) >= 12 && ageOf(g.s, c) <= 15,
        );
      return kid ? { c: kid.id } : null;
    },
    scene: "home",
    title: "What to do with the child",
    body: (g, life, ctx) =>
      `${cap(who(g, ctx)?.first ?? "The child")} is ${ageOf(g.s, who(g, ctx)!)} and growing out of everything at once. It's time to decide: apprentice ${him(who(g, ctx))} to a trade, send ${him(who(g, ctx))} to school, or keep ${him(who(g, ctx))} at home to learn yours.`,
    choices: [
      {
        label: "Apprentice them (5 coins)",
        tip: "A trade in their hands; the heir will know their work.",
        blocked: (g, life) => poor(life, 5),
        apply: (g, life, ctx) => {
          spend(g, life, 5);
          like(g, life, ctx, "Found me a trade", 10);
        },
      },
      {
        label: "Send them to school (10 coins)",
        tip: "Letters; renown for an educated family.",
        blocked: (g, life) => poor(life, 10),
        apply: (g, life, ctx) => {
          spend(g, life, 10);
          fx(g, life, { renown: 2 });
          like(g, life, ctx, "Sent me to school", 15);
        },
      },
      {
        label: "Keep them at home",
        tip: "Free; they learn your trade.",
        apply: (g, life, ctx) => like(g, life, ctx, "Kept me close", 5),
      },
    ],
  },
  // ------------------------------------------------ the native year
  {
    key: "condolence",
    pool: "any",
    cooldown: 700,
    when: (g, life) => {
      if (!native(g, life) || !adult(g, life)) return null;
      const c = local(g, life, (x) => isNativeChar(g.s, x));
      return c ? { c: c.id } : null;
    },
    scene: "councilfire",
    title: "The condolence",
    body: (g, life, ctx) =>
      `${cap(nameOf(g, ctx))}'s family is in mourning, and grief clouds the mind. The custom is old: the words that wipe the tears from the eyes, clear the ears, open the throat, so the mourner can see and hear and speak again.`,
    choices: [
      {
        label: "Speak the words of condolence",
        tip: "Persuasion and faith: the family's gratitude (+20), renown.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Spoke the condolence", pass ? 20 : 8);
          fx(g, life, { renown: pass ? 3 : 1, xp: { faith: 5 } });
        },
      },
      {
        label: "Bring gifts to cover the grave (3 coins)",
        tip: "+15 opinion, less stress.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          like(g, life, ctx, "Covered our grave", 15);
          fx(g, life, { stress: -3 });
        },
      },
    ],
  },
  {
    key: "mourning-war",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      native(g, life) && adult(g, life) && !me(g, life).female ? {} : null,
    scene: "councilfire",
    title: "The clan mothers' call",
    body: () =>
      "Too many have died this year: fevers, the colonists' guns, a hard winter. The clan mothers have spoken: the young men are to bring back captives to fill the empty places at the fires. A war party leaves at the new moon.",
    choices: [
      {
        label: "Join the war party",
        tip: "Fighting: glory (+5 renown) and a captive; fail and you come back hurt, or don't.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 5, xp: { fighting: 10, woodcraft: 6 } }
              : { health: -20, stress: 8 },
            "a raid gone wrong",
          ),
      },
      {
        label: "Speak against it at the fire",
        tip: "Persuasion: the elders listen (+renown); the young men call you old before your time.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 4, xp: { persuasion: 6 } } : { renown: -2 },
          ),
      },
    ],
  },
  {
    key: "midwinter",
    pool: "any",
    cooldown: 300,
    when: (g, life) => (native(g, life) && month(g) === 0 ? {} : null),
    scene: "village",
    title: "Midwinter",
    body: () =>
      "The new year: the fires are stirred, the false faces go from lodge to lodge, and people tell their dreams for others to guess. A dream guessed and fulfilled lifts a weight from the soul.",
    choices: [
      {
        label: "Tell your dream",
        tip: "−15 stress; your people are closer.",
        apply: (g, life) => fx(g, life, { stress: -15, xp: { faith: 6 } }),
      },
      {
        label: "Guess the dreams of others",
        tip: "Persuasion and faith: renown if you guess well.",
        check: { skill: "faith", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { renown: 3, stress: -6 } : { stress: -3 }),
      },
    ],
  },
  {
    key: "maple-sugar",
    pool: "any",
    cooldown: 300,
    when: (g, life) => (native(g, life) && month(g) === 2 ? {} : null),
    scene: "woods",
    title: "The sugar moon",
    body: () =>
      "The sap is running. Whole families move out to the sugar camps, with bark buckets and kettles traded from the English; the children are sticky from dawn to dark.",
    choices: [
      {
        label: "Work the sugar camp",
        tip: "Sugar to trade (+3 coins); craft; health.",
        apply: (g, life) =>
          fx(g, life, { coins: 3, health: 3, xp: { craft: 4 } }),
      },
      {
        label: "Trade the sugar to the colonists",
        tip: "Trade: +6 coins at a good price.",
        check: { skill: "trade", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { coins: 6, xp: { trade: 6 } } : { coins: 2 }),
      },
    ],
  },
  {
    key: "strawberry",
    pool: "any",
    cooldown: 300,
    when: (g, life) => (native(g, life) && month(g) === 5 ? {} : null),
    scene: "village",
    title: "The strawberries",
    body: () =>
      "The first fruit of the year: strawberries, small and sweet, crushed with water for the thanksgiving. Everyone gives thanks for being alive another summer, which this year feels like something.",
    choices: [
      {
        label: "Give thanks with your people",
        tip: "−12 stress, +health.",
        apply: (g, life) => fx(g, life, { stress: -12, health: 3 }),
      },
    ],
  },
  {
    key: "land-deed",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      native(g, life) && adult(g, life) && (life.job?.rank ?? 0) >= 1
        ? {}
        : null,
    scene: "councilfire",
    title: "Marks on a paper",
    body: () =>
      "Three colonists with a deed, a bolt of cloth and a cask of rum want marks on their paper. They say it gives them the right to hunt on the land by the river. The paper is long and you can't read it, and you suspect it says a good deal more.",
    choices: [
      {
        label: "Have it read to you first",
        tip: "Letters: you find the trick in it, and the elders honour you (+renown).",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { renown: 5, xp: { letters: 8 } } : { stress: 5 }),
      },
      {
        label: "Take the cloth and the rum, make your mark",
        tip: "+5 coins; your people may not forgive it (−4 renown).",
        apply: (g, life) => fx(g, life, { coins: 5, renown: -4 }),
      },
      {
        label: "Send them away",
        tip: "Nothing given, nothing lost; the colonists remember.",
        apply: (g, life) => fx(g, life, { renown: 1 }),
      },
    ],
  },
  {
    key: "black-robe",
    pool: "any",
    cooldown: 900,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    scene: "village",
    title: "The black robe",
    body: () =>
      "A Jesuit has walked in from the north in a black robe, thin as a stick and cheerful as a bird. He speaks your language badly and with great determination. He asks to winter in your lodge.",
    choices: [
      {
        label: "Take him in",
        tip: "Letters and faith; you learn about the French (+lots of letters); some think it unwise.",
        apply: (g, life) =>
          fx(g, life, { xp: { letters: 10, faith: 4 }, renown: -1 }),
      },
      {
        label: "Send him on to the next town",
        tip: "Nothing changes.",
        apply: () => undefined,
      },
    ],
  },
  // ------------------------------------------------ seasons and the century
  {
    key: "harvest-home",
    pool: "any",
    cooldown: 300,
    when: (g, life) =>
      colonist(g, life) && month(g) === 9 && adult(g, life) ? {} : null,
    scene: "fields",
    title: "Harvest home",
    body: () =>
      "The last cart is in, garlanded, with a boy riding on top. There's cider, a fiddler, a goose, and the minister pretending not to see the dancing.",
    choices: [
      {
        label: "Dance till dawn",
        tip: "−12 stress; +1 renown; a sore head.",
        apply: (g, life) => fx(g, life, { stress: -12, renown: 1 }),
      },
      {
        label: "Give a toast (persuasion)",
        tip: "Persuasion: they'll remember it (+3 renown).",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { renown: 3, stress: -6 } : { stress: 2 }),
      },
    ],
  },
  {
    key: "twelfth-night",
    pool: "any",
    cooldown: 300,
    when: (g, life) =>
      colonist(g, life) && month(g) === 0 && dateOf(g.s.day).day <= 7
        ? {}
        : null,
    scene: "tavern",
    title: "Twelfth Night",
    body: () =>
      "A cake with a bean in it: whoever finds the bean is king for the night, and may command anyone to do anything, within reason, and somewhat beyond it.",
    choices: [
      {
        label: "Eat the cake",
        tip: "Luck: if you find the bean, +3 renown and the night of your life.",
        apply: (g, life) => {
          if (g.rng.chance(0.25)) {
            fx(g, life, { renown: 3, stress: -12 });
            say(
              g,
              life,
              "The bean was in your slice. You were a very great king, briefly.",
              "good",
            );
          } else fx(g, life, { stress: -5 });
        },
      },
    ],
  },
  {
    key: "whitefield",
    pool: "any",
    cooldown: 3000,
    when: (g, life) =>
      colonist(g, life) && year(g) >= 1739 && year(g) <= 1745 ? {} : null,
    scene: "church",
    title: "The Grand Itinerant",
    body: () =>
      "George Whitefield is preaching in the fields, to more people than live in the town, without notes, in a voice they say carries a mile. Benjamin Franklin went to hear him meaning to give nothing and emptied his pockets into the plate.",
    choices: [
      {
        label: "Go and hear him",
        tip: "Faith: you're moved (+faith, −stress), and you'll give something.",
        apply: (g, life) => {
          spend(g, life, Math.min(3, Math.max(0, Math.floor(life.purse))));
          fx(g, life, { stress: -15, xp: { faith: 12 } });
        },
      },
      {
        label: "Stay away: enthusiasm is dangerous",
        tip: "Your minister approves; you miss the century's great show.",
        apply: (g, life) => fx(g, life, { favor: 1 }),
      },
    ],
  },
  {
    key: "eclipse",
    pool: "any",
    cooldown: 6000,
    weight: 0.3,
    title: "The sun goes out",
    scene: "fields",
    body: () =>
      "At noon the light went strange, then thin, then gone, and the birds went quiet and the dogs howled. A black disc where the sun had been, and a ring of fire around it. Then, slowly, the world came back.",
    choices: [
      {
        label: "Pray",
        tip: "Faith; −stress.",
        apply: (g, life) => fx(g, life, { stress: -5, xp: { faith: 6 } }),
      },
      {
        label: "Explain it to the frightened",
        tip: "Letters: you're thought wise (+renown).",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 4, xp: { letters: 6 } } : { renown: -1 },
          ),
      },
    ],
  },
  // ------------------------------------------------ risings
  {
    key: "rising-call",
    pool: "raised",
    cooldown: 0,
    scene: "rising",
    title: (g, life, ctx) =>
      `${g.s.movements.find((m) => m.id === ctx.m)?.name ?? "The rising"} has risen`,
    body: (g, life, ctx) => {
      const m = g.s.movements.find((x) => x.id === ctx.m);
      return `Drums in the street at dawn, men with muskets and green boughs in their hats, a proclamation nailed to the church door. ${m?.name ?? "The rising"} has taken up arms against ${g.s.nations[m?.against ?? 0]?.name ?? "the government"}. Everyone is asking everyone else which side they're on. They're asking you.`;
    },
    choices: [
      {
        // Unanswered, you keep out of it.
        label: "Bar the door and keep your head down",
        tip: "Safe, mostly. −0 renown, +stress.",
        apply: (g, life) => fx(g, life, { stress: 8 }),
      },
      {
        label: "Take up a musket with them",
        tip: "Join the rising: its fate is yours now.",
        blocked: (g, life, ctx) =>
          movementOf(g.s, life.c)
            ? "You follow another cause"
            : g.s.movements.find((m) => m.id === ctx.m)?.status !== "risen"
              ? "It's over"
              : null,
        apply: (g, life, ctx) => {
          const err = joinMovement(g, life, ctx.m);
          if (err) say(g, life, err);
          else fx(g, life, { renown: 3, stress: 6 });
        },
      },
      {
        label: "Stand with the governor",
        tip: "The crown remembers its friends (+favour, +renown with the loyal). The rebels remember too.",
        apply: (g, life) => fx(g, life, { favor: 6, renown: 2, stress: 5 }),
      },
    ],
  },
  {
    key: "rising-standard",
    pool: "raised",
    cooldown: 0,
    scene: "rising",
    title: "The standard is raised",
    body: (g, life, ctx) => {
      const m = g.s.movements.find((x) => x.id === ctx.m);
      return `It's begun. ${m?.name ?? "The cause"} is in arms: the bells ringing backwards, the magazine broken open, every hedge full of men with fowling pieces and grievances. There's no going back from this, and from the look of them nobody wants to.`;
    },
    choices: [
      {
        label: "To arms!",
        tip: "+3 renown. Win, and the colony changes. Lose, and there's the rope.",
        apply: (g, life) => fx(g, life, { renown: 3, stress: 4 }),
      },
    ],
  },
  {
    key: "rising-victory",
    pool: "raised",
    cooldown: 0,
    scene: "rising",
    title: "The day is ours",
    body: (g, life, ctx) => {
      const m = g.s.movements.find((x) => x.id === ctx.m);
      return `${m?.name ?? "The cause"} has carried the day. Bonfires on every hill, the old governor's portrait in the river, and men who were outlaws a month ago making speeches from the courthouse steps. Your name is in some of them.`;
    },
    choices: [
      {
        label: "Drink to it",
        tip: "−20 stress.",
        apply: (g, life) => fx(g, life, { stress: -20 }),
      },
      {
        label: "Make a speech of your own",
        tip: "Persuasion: +6 renown.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { renown: 6 } : { renown: 1 }),
      },
    ],
  },
];

/** A colonist is taken on at the fort here. */
function enlistHere(g: ConquestGame, life: Life): string | null {
  return takeJob(g, life, "fort", "soldier");
}
