// EVENTS (r15): the town and its people, the port, and what your station
// brings to the door. The fire bell, a purse in the gutter, a subscription
// for a fire engine, slander, the stocks, the candidate's punch, the
// tooth-drawer, a ballad about you, a runaway horse, a vendue, your turn on
// the watch, the hog-reeve; news off a ship, a parrot, wreckage on the
// beach, the yellow flag; and for those who hold office, own land or boats
// or keep people, or have money (or none), what comes with it.

import { setTie, touchLife } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import {
  adult,
  atHome,
  colonist,
  costs,
  fx,
  genteel,
  hasBoat,
  hasPeople,
  he,
  him,
  inOffice,
  like,
  local,
  me,
  owns,
  poor,
  port,
  say,
  spouse,
  town,
  warNow,
  who,
  year,
} from "./LifeR15Kit";
import { postTitle } from "./OneOffice";
import { ageOf, charName } from "./Queries";

const REST = 1460;

export const TOWN_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ the street
  {
    key: "town-fire-bell",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!adult(g, life) || !town(g, life)) return null;
      const c = local(g, life, 61, (x) => !!x.role);
      return c ? { c: c.id } : null;
    },
    scene: "market",
    title: "The fire bell",
    body: (g, life, ctx) =>
      `The church bell is ringing backwards in the night: fire. It's ${charName(g.s.chars[ctx.c])}'s house, two streets over, and the thatch next door has caught.`,
    choices: [
      {
        label: "Take a place in the bucket line",
        tip: "Leadership: you organise the line and save the street (+2 renown, +20 opinion). Fail: burns and smoke.",
        check: { skill: "leadership", dc: 6 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Fought the fire at my house", pass ? 20 : 10, 5);
          fx(
            g,
            life,
            pass
              ? { renown: 2, xp: { leadership: 10 } }
              : { health: -8, renown: 1 },
            "a house fire",
          );
          say(
            g,
            life,
            pass
              ? "Two lines of buckets, the river to the street. The fire went out with one house lost and not the whole row."
              : "You were too close when the roof came in.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Carry out their goods",
        tip: "Their chairs, their Bible, their clock: +15 opinion.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Saved my things from the fire", 15, 5);
          fx(g, life, { stress: 4 });
          say(
            g,
            life,
            "A clock, two chairs, a Bible and a very angry cat, all saved.",
          );
        },
      },
      {
        label: "Wet your own roof and stay home",
        tip: "Prudent. The street notices who came.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Didn't come when we burned", -10, 4);
          fx(g, life, { renown: -1 });
          say(
            g,
            life,
            "Your roof was never in danger. Your name in the street is a little scorched.",
          );
        },
      },
    ],
  },
  {
    key: "town-found-purse",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && town(g, life) ? {} : null),
    scene: "market",
    title: "A purse in the gutter",
    body: () =>
      'A purse in the gutter outside the counting house: good leather, a brass clasp, twelve coins and a note to a lady signed only "Your devoted H."',
    choices: [
      {
        label: "Have it cried in the market",
        tip: "Honest: the owner may reward you (2 coins, +1 renown).",
        apply: (g, life) => {
          fx(g, life, { coins: 2, renown: 1, gain: "honest" });
          say(
            g,
            life,
            "The crier found its owner, a very red merchant, who rewarded you and asked you to forget the note.",
            "good",
          );
        },
      },
      {
        label: "Keep the money, burn the note",
        tip: "+12 coins. A little stain on the soul.",
        apply: (g, life) => {
          fx(g, life, { coins: 12, stress: 2 });
          say(g, life, "Twelve coins. You never did find out who H. was.");
        },
      },
      {
        label: "Keep the note",
        tip: "Stealth: a secret worth more than twelve coins, if you're careful.",
        check: { skill: "stealth", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { coins: 15, xp: { stealth: 10 }, gain: "deceitful" });
            say(
              g,
              life,
              "H. turned out to be a deacon. He paid fifteen for his note, and smiles at you in church.",
            );
          } else {
            fx(g, life, { renown: -2, stress: 5 });
            say(
              g,
              life,
              "H. turned out to be the magistrate. You returned the note with profuse apologies.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "town-subscription",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && town(g, life) && life.purse >= 5 ? {} : null,
    scene: "tavern",
    title: "A subscription",
    body: (g) =>
      `A paper is going round the tavern: subscribers wanted for ${year(g) >= 1730 ? "a fire engine from London" : "a new bell for the church"}, names and sums, to be printed in the gazette. The paper is coming your way, and so are everyone's eyes.`,
    choices: [
      {
        label: costs("Put your name down handsomely", 10),
        tip: "+3 renown; your name heads the list.",
        blocked: (g, life) => poor(life, 10),
        apply: (g, life) => {
          fx(g, life, { coins: -10, renown: 3, favor: 1 });
          say(
            g,
            life,
            "Your name at the top, in the gazette, in a fine large type.",
            "good",
          );
        },
      },
      {
        label: costs("A modest sum", 2),
        tip: "+0.5 renown.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, renown: 0.5 });
          say(g, life, "A modest sum, modestly given.");
        },
      },
      {
        label: "Pass the paper on",
        tip: "Your purse is safe. The gazette prints the names of those who did give.",
        apply: (g, life) => {
          fx(g, life, { renown: -0.5 });
          say(g, life, "You passed it on. Everyone saw.");
        },
      },
    ],
  },
  {
    key: "town-slander",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!adult(g, life) || !colonist(g, life) || life.renown < 3) return null;
      const c = local(g, life, 67, (x) => ageOf(g.s, x) >= 25);
      return c ? { c: c.id } : null;
    },
    scene: "tavern",
    title: "Slander",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} has been saying in every tavern in town that you water your rum, cheat at cards and once kissed a Dutchman. Only one of these is true, and it was a long time ago.`,
    choices: [
      {
        label: "Have it out in public",
        tip: "Persuasion: the town laughs at them (+1 renown). Fail: at you.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          like(
            g,
            life,
            ctx,
            pass ? "Made a fool of me" : "Bested by me",
            pass ? -15 : 5,
            3,
          );
          fx(g, life, pass ? { renown: 1.5 } : { renown: -1.5, stress: 4 });
          say(
            g,
            life,
            pass
              ? "You made them repeat it all, slowly, to the whole taproom. They left early."
              : "They repeated it, slowly, to the whole taproom. Including the Dutchman.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: costs("Sue for slander", 3),
        tip: "Letters: damages of 8 and a public apology. Fail: costs and a laughing court.",
        check: { skill: "letters", dc: 7 },
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx, pass) => {
          fx(g, life, { coins: -3 });
          like(g, life, ctx, "Took me to law", -25, 5);
          if (pass) {
            fx(g, life, { coins: 8, renown: 1 });
            say(
              g,
              life,
              "Damages, costs, and an apology read out on the courthouse steps.",
              "good",
            );
          } else {
            fx(g, life, { stress: 6 });
            say(
              g,
              life,
              "The jury found it was, technically, a Dutchman.",
              "bad",
            );
          }
        },
      },
      {
        label: "Let it blow over",
        tip: "Most talk does. Some doesn't (−1 renown).",
        apply: (g, life) => {
          fx(g, life, { renown: -1, stress: 2 });
          say(
            g,
            life,
            "It blew over, mostly. Someone still asks about the Dutchman now and then.",
          );
        },
      },
    ],
  },
  {
    key: "town-stocks",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!adult(g, life) || !town(g, life)) return null;
      const c = local(g, life, 71, (x) => !x.role);
      return c ? { c: c.id } : null;
    },
    scene: "market",
    title: "A neighbour in the stocks",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)} is in the stocks in the market square for a day, for ${["profane swearing", "selling short weight", "drunkenness on the Sabbath", "striking a constable with a cabbage"][ctx.c % 4]}. The boys have found the rotten eggs.`;
    },
    choices: [
      {
        label: "Bring them water, and stand by them",
        tip: "+20 opinion; the town thinks you soft (−0.5 renown).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Brought me water in the stocks", 20, 8);
          fx(g, life, { renown: -0.5, stress: -2 });
          say(
            g,
            life,
            "A cup of water and a little company. They'll not forget it.",
            "good",
          );
        },
      },
      {
        label: "Throw a cabbage with everyone else",
        tip: "The crowd cheers (+0.5 renown); they don't (−15).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Threw a cabbage at me", -15, 4);
          fx(g, life, { renown: 0.5 });
          say(g, life, "A good throw. Everyone said so, except the target.");
        },
      },
      {
        label: "Walk past",
        tip: "It's none of your business.",
        apply: (g, life) =>
          say(
            g,
            life,
            "None of your business. You walked the long way round anyway.",
          ),
      },
    ],
  },
  {
    key: "town-punch",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && town(g, life) ? {} : null),
    scene: "tavern",
    title: "The candidate's punch",
    body: () =>
      "Election day, and one of the candidates for the assembly has a barrel of rum punch on the courthouse green and is ladling it out with his own hand to any freeholder who will look him in the eye and say his name.",
    choices: [
      {
        label: "Drink, and vote for him",
        tip: "Free punch (−4 stress). He'll remember you (and so will his opponent).",
        apply: (g, life) => {
          fx(g, life, { stress: -4 });
          say(g, life, "A cup of punch and a vote. Democracy is thirsty work.");
        },
      },
      {
        label: "Drink, and vote against him",
        tip: "Stealth: nobody notices. Caught: the other side's man shakes your hand anyway.",
        check: { skill: "stealth", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -6, xp: { stealth: 8 } } : { renown: -1 },
          );
          say(
            g,
            life,
            pass
              ? "His punch, the other man's vote. A fine day for liberty."
              : "Voting is out loud, at the courthouse door. He heard.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Refuse it: votes aren't for sale",
        tip: "+1 renown with the sober part of the town.",
        apply: (g, life) => {
          fx(g, life, { renown: 1, gain: "honest" });
          say(
            g,
            life,
            "You declined loudly. The sober part of the town approved, quietly.",
          );
        },
      },
    ],
  },
  {
    key: "town-tooth",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && town(g, life) ? {} : null),
    scene: "market",
    title: "The tooth-drawer",
    body: () =>
      "A back tooth has been killing you for a week, and there's a tooth-drawer at the market with a pair of iron pliers, a drum to drown the screams, and a string of teeth round his hat by way of advertisement.",
    choices: [
      {
        label: costs("Have it out", 1),
        tip: "A moment's agony: −4 health now, −10 stress after.",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life) => {
          fx(
            g,
            life,
            { coins: -1, health: -4, stress: -10 },
            "the tooth-drawer",
          );
          say(
            g,
            life,
            "The drum beat, the crowd cheered, and your tooth joined his hat.",
            "good",
          );
        },
      },
      {
        label: "Oil of cloves, and patience",
        tip: "Medicine: it settles. Fail: a fortnight of misery.",
        check: { skill: "medicine", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { xp: { medicine: 8 } } : { stress: 10, health: -3 },
            "a rotten tooth",
          );
          say(
            g,
            life,
            pass
              ? "Cloves did it. The tooth lives to ache another day."
              : "A fortnight of misery, and then the tooth-drawer after all.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "A string and a slammed door",
        tip: "Fighting (nerve): free, and quick, if you've the nerve.",
        check: { skill: "fighting", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -8 } : { health: -6, stress: 6 },
            "a slammed door",
          );
          say(
            g,
            life,
            pass
              ? "Slam. Done. You'll keep the tooth on your watch chain."
              : "Slam. The tooth stayed; the door came off its hinges.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "town-ballad",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && town(g, life) && life.renown >= 15 ? {} : null,
    scene: "market",
    title: "A ballad about you",
    body: () =>
      'A ballad-seller in the market is crying a new song, a penny a sheet, about a certain well-known person of this town, and the person is you, and the tune is "The Vicar of Bray", and the third verse is not kind.',
    choices: [
      {
        label: costs("Buy every copy", 4),
        tip: "The verse is gone (no renown lost); the seller prints more tomorrow (−4 coins).",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life) => {
          fx(g, life, { coins: -4, stress: 2 });
          say(
            g,
            life,
            "Every copy, into the fire. He'll print more, now he knows there's a buyer.",
          );
        },
      },
      {
        label: "Sing it yourself, loudly",
        tip: "Persuasion: the town loves you for it (+2 renown). Fail: you sing badly too.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 2, stress: -4 } : { renown: -1, stress: 4 },
          );
          say(
            g,
            life,
            pass
              ? "You sang the third verse loudest of all. The ballad is now about how good a sport you are."
              : "You sang the third verse. Everyone heard it twice.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Pretend you haven't heard",
        tip: "Fame has its price (−1 renown; +0.5 if you're thick-skinned enough).",
        apply: (g, life) => {
          fx(g, life, { renown: -0.5 });
          say(g, life, "You hummed something else, firmly, all the way home.");
        },
      },
    ],
  },
  {
    key: "town-runaway",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && town(g, life) ? {} : null),
    scene: "market",
    title: "A runaway horse",
    body: () =>
      "A carter's horse has bolted with the cart behind it, straight down the high street, and there are children playing marbles in the road where it narrows.",
    choices: [
      {
        label: "Run for its head",
        tip: "Fighting: the hero of the street (+3 renown). Fail: trampled (−15 health).",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 3, gain: "brave" } : { health: -15, renown: 1 },
            "a runaway horse",
          );
          say(
            g,
            life,
            pass
              ? "You caught the bridle and hung on, and the horse stopped six feet from the marbles."
              : "You caught the bridle, and the horse caught you.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Snatch the children out of the road",
        tip: "Safe enough; the mothers bless you (+1.5 renown).",
        apply: (g, life) => {
          fx(g, life, { renown: 1.5, stress: 3 });
          say(
            g,
            life,
            "Four children under your arms and the cart thundering past. Their mothers kissed you in the street.",
            "good",
          );
        },
      },
      {
        label: "Shout a warning from the doorway",
        tip: "The children scatter. Probably.",
        apply: (g, life) => {
          fx(g, life, { stress: 4 });
          say(g, life, "They scattered. The marbles didn't.");
        },
      },
    ],
  },
  {
    key: "town-vendue",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && town(g, life) && life.purse >= 4 ? {} : null,
    scene: "market",
    title: "A vendue",
    body: () =>
      "A dead merchant's household is being sold at public vendue in the market: a tall clock, a shelf of books, a set of china with only one cup missing, and a portrait of the merchant that nobody is bidding on.",
    choices: [
      {
        label: costs("Bid for the books", 4),
        tip: "Letters: +20 letters over the winter, and a learned air.",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life) => {
          fx(g, life, { coins: -4, xp: { letters: 20 }, stress: -4 });
          say(
            g,
            life,
            "Locke, Tillotson's sermons, a herbal and a very improper French novel. Your winter is spoken for.",
            "good",
          );
        },
      },
      {
        label: costs("Bid for the clock", 6),
        tip: "A tall clock in your hall: +1 renown.",
        blocked: (g, life) => poor(life, 6),
        apply: (g, life) => {
          fx(g, life, { coins: -6, renown: 1 });
          say(
            g,
            life,
            "It ticks in your hall like a second heart, and visitors check their watches by it.",
            "good",
          );
        },
      },
      {
        label: costs("Bid for the portrait, out of pity", 1),
        tip: "Nobody else will. +0.5 renown for wit.",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life) => {
          fx(g, life, { coins: -1, renown: 0.5, stress: -3 });
          say(
            g,
            life,
            "He hangs over your mantel now, looking disapproving. Guests ask who he was, and you invent a different answer each time.",
          );
        },
      },
    ],
  },
  {
    key: "town-watch-turn",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) &&
      town(g, life) &&
      !me(g, life).female &&
      life.job?.kind !== "watch"
        ? {}
        : null,
    scene: "market",
    title: "Your turn on the watch",
    body: () =>
      "Every householder takes his turn walking the night watch: a lantern, a staff, a rattle, and calling the hour and the weather until dawn. Tonight, says the constable's list, is yours.",
    choices: [
      {
        label: "Walk the watch",
        tip: "Fighting: you catch a thief (+1 renown, 2 coins). Or a cold, quiet night (+4 stress).",
        check: { skill: "fighting", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { renown: 1, coins: 2 } : { stress: 4 });
          say(
            g,
            life,
            pass
              ? "\"Two o'clock and a fine starry night,\" and a burglar at the baker's back door, who you sat on until morning."
              : '"Three o\'clock and raining." It was. All night.',
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: costs("Pay a substitute", 1),
        tip: "An old soldier walks it for you.",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life) => {
          fx(g, life, { coins: -1 });
          say(
            g,
            life,
            "An old soldier walked your watch. He's walked half the town's.",
          );
        },
      },
      {
        label: "Don't turn up",
        tip: "Fined 2 coins, if they bother.",
        apply: (g, life) => {
          if (g.rng.chance(0.6)) {
            fx(g, life, { coins: -2, renown: -0.5 });
            say(g, life, "They bothered.", "bad");
          } else say(g, life, "They didn't bother.");
        },
      },
    ],
  },
  {
    key: "town-hog-reeve",
    pool: "any",
    cooldown: 99999,
    when: (g, life) => {
      const sp = spouse(g, life);
      return adult(g, life) &&
        colonist(g, life) &&
        !me(g, life).female &&
        sp &&
        me(g, life).nation >= 0 &&
        g.s.nations[me(g, life).nation]?.key === "england" &&
        (g.map.provinces[life.prov]?.lat ?? 0) >= 40
        ? {}
        : null;
    },
    scene: "church",
    title: "Hog-reeve",
    body: () =>
      "The town meeting has elected you hog-reeve, whose duty is to catch stray hogs and see that every hog in town is yoked and ringed. It is the custom to elect the latest married men to it. The meeting found this very funny.",
    choices: [
      {
        label: "Serve with dignity",
        tip: "Fighting (hogs): a year of hogs. The town respects it (+1.5 renown).",
        check: { skill: "fighting", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 1.5, coins: 1 } : { renown: 0.5, health: -3 },
          );
          say(
            g,
            life,
            pass
              ? "Every hog in town ringed and yoked. You have a reputation now, of a sort."
              : "A sow put you in the pond. The town has a new story.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Pay the fine to refuse",
        tip: "−2 coins; no hogs.",
        apply: (g, life) => {
          fx(g, life, { coins: -2 });
          say(g, life, "Two coins to the town, and no hogs. A bargain.");
        },
      },
    ],
  },
  {
    key: "town-short-weight",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!adult(g, life) || !town(g, life)) return null;
      const c = local(
        g,
        life,
        79,
        (x) => x.role === "master" || x.role === "merchant",
      );
      return c ? { c: c.id } : null;
    },
    scene: "market",
    title: "Short weight",
    body: (g, life, ctx) =>
      `The loaves from ${charName(g.s.chars[ctx.c])}'s shop have been getting lighter for a month. You weighed today's on the market scales: two ounces short of the assize.`,
    choices: [
      {
        label: "Complain to the clerk of the market",
        tip: "Letters: they're fined and the bread gets heavier (+1 renown). They don't forget (−15).",
        check: { skill: "letters", dc: 5 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Reported me to the clerk", -15, 4);
          fx(g, life, pass ? { renown: 1 } : { stress: 3 });
          say(
            g,
            life,
            pass
              ? "Fined and warned. The bread is heavy as a brick now, out of spite."
              : "The clerk buys his bread there too.",
          );
        },
      },
      {
        label: "Have a quiet word",
        tip: "Persuasion: a fair loaf from now on, and no hard feelings.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, ctx, pass) => {
          like(
            g,
            life,
            ctx,
            pass ? "Came to me first" : "Accused me of cheating",
            pass ? 8 : -8,
            3,
          );
          say(
            g,
            life,
            pass
              ? "A word, a nod, and a loaf that weighs what it should."
              : "Indignation, flour everywhere, and no change in the loaf.",
          );
        },
      },
      {
        label: "Buy your bread elsewhere",
        tip: "A longer walk.",
        apply: (g, life) =>
          say(g, life, "The baker by the ferry. Better bread, worse company."),
      },
    ],
  },
  {
    key: "town-orrery",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && town(g, life) && year(g) >= 1720 ? {} : null,
    scene: "tavern",
    title: "A lecture on the heavens",
    body: () =>
      "A travelling lecturer has hired the long room for a course on natural philosophy, with an orrery that shows the planets going round the sun by clockwork, a magic lantern, and a vacuum pump in which he proposes to suffocate a sparrow.",
    choices: [
      {
        label: costs("Buy a ticket for the course", 1),
        tip: "Letters (+15), and something to talk about at dinner.",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life) => {
          fx(g, life, { coins: -1, xp: { letters: 15 }, stress: -3 });
          say(
            g,
            life,
            "Saturn has rings. The sparrow was spared, by popular demand.",
            "good",
          );
        },
      },
      {
        label: "Ask him a hard question",
        tip: "Letters: you best him before the room (+1 renown). Fail: he bests you.",
        check: { skill: "letters", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 1, xp: { letters: 10 } } : { renown: -0.5 },
          );
          say(
            g,
            life,
            pass
              ? '"And the comets, sir?" He had no answer. The room had a great deal to say.'
              : "He had an answer, at length, with diagrams.",
          );
        },
      },
      {
        label: "Stay away from godless clockwork",
        tip: "Faith.",
        apply: (g, life) => {
          fx(g, life, { xp: { faith: 6 } });
          say(
            g,
            life,
            "The heavens go round as God pleases, and need no clock.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ the port
  {
    key: "port-news",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && port(g, life) ? {} : null),
    scene: "docks",
    title: "News off the ship",
    body: () =>
      "A packet is in from England, forty days out, and the mate says on the wharf that the price of tobacco in London has jumped since the Dutch war scare. The merchants here won't have heard for an hour yet.",
    choices: [
      {
        label: "Buy up what you can before they hear",
        tip: "Trade: a quick profit (6 coins). Wrong: the mate was drunk (−4).",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 6, xp: { trade: 12 } } : { coins: -4 });
          say(
            g,
            life,
            pass
              ? "An hour's start is a fortune. Yours was a small fortune."
              : "The mate was drunk, and wrong, and both.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Tell the merchants, for a fee",
        tip: "Persuasion: they pay for the news (3 coins) and remember who brought it.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 3, renown: 0.5 } : {});
          say(
            g,
            life,
            pass
              ? "Three coins and a name on 'Change as someone who hears things."
              : "They'd heard already, from the captain.",
          );
        },
      },
      {
        label: "Buy a gazette from home and read it all",
        tip: "Letters, and the world's news.",
        apply: (g, life) => {
          fx(g, life, { xp: { letters: 8 }, coins: -0.2 });
          say(
            g,
            life,
            "A London gazette six weeks old, read to rags. The King is well. So, it seems, is everybody's enemy.",
          );
        },
      },
    ],
  },
  {
    key: "port-parrot",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && port(g, life) ? {} : null),
    scene: "docks",
    title: "A parrot for sale",
    body: () =>
      "A sailor on the wharf has a green parrot in a cage who speaks Spanish, Dutch and something worse, and he wants three coins for it, and the parrot has already said something about your hat.",
    choices: [
      {
        label: costs("Buy the parrot", 3),
        tip: "−8 stress for a year, and the talk of the street (+0.5 renown).",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, stress: -8, renown: 0.5 });
          say(
            g,
            life,
            "The parrot lives in your window now, and greets the minister every morning in a way you've had to apologise for.",
            "good",
          );
        },
      },
      {
        label: "Haggle for it",
        tip: "Trade: yours for one coin. Fail: the parrot insults your bargaining.",
        check: { skill: "trade", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { coins: -1, stress: -8, xp: { trade: 8 } } : { stress: 2 },
          );
          say(
            g,
            life,
            pass
              ? "One coin, and the parrot thrown in with the cage."
              : "He wouldn't come down. The parrot laughed.",
          );
        },
      },
      {
        label: "Walk on",
        tip: "The parrot calls something after you.",
        apply: (g, life) =>
          say(
            g,
            life,
            "It called something after you in Dutch. A passing Dutchman blushed.",
          ),
      },
    ],
  },
  {
    key: "port-wreckage",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && port(g, life) ? {} : null),
    scene: "docks",
    title: "Wreckage on the beach",
    body: () =>
      "After the night's gale the beach below the town is strewn with barrels, spars and a ship's figurehead with a startled expression. By law wreck belongs to the crown, or the admiralty, or the lord of the shore, depending who you ask. Half the town is already down there.",
    choices: [
      {
        label: "Roll a barrel home",
        tip: "Stealth: a barrel of wine (6 coins). Caught: the wreck-master's fine.",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { coins: 6, stress: -2 } : { coins: -3, renown: -1 },
          );
          say(
            g,
            life,
            pass
              ? "Canary wine, by the smell. Your cellar has been salvaged."
              : "The wreck-master had a list, and you were on it.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Help the wreck-master save it",
        tip: "Salvage money: 3 coins, honestly earned.",
        apply: (g, life) => {
          fx(g, life, { coins: 3, xp: { seamanship: 6 } });
          say(
            g,
            life,
            "A day hauling barrels above the tide line. Salvage paid in silver.",
          );
        },
      },
      {
        label: "Look for survivors",
        tip: "Medicine: you find one, half drowned (+2 renown).",
        check: { skill: "medicine", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 2, xp: { medicine: 10 } } : { stress: 6 },
          );
          say(
            g,
            life,
            pass
              ? "A ship's boy in the rocks, alive. He'll live, and he'll never forget your face."
              : "Nobody. Only the figurehead, staring.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "port-yellow-flag",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && port(g, life) && year(g) >= 1690 ? {} : null,
    scene: "docks",
    title: "The yellow flag",
    body: () =>
      "A ship from the islands lies in the roads with a yellow flag at the fore: sickness aboard. The town has ordered her to stay out. A boat has come from her anyway, and a man in it is calling for a doctor, and for water.",
    choices: [
      {
        label: "Row out with water and physic",
        tip: "Medicine: lives saved (+3 renown). Fail: you bring the fever home (−20 health).",
        check: { skill: "medicine", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { renown: 3, xp: { medicine: 14 } }
              : { health: -20, renown: 1 },
            "the yellow fever",
          );
          say(
            g,
            life,
            pass
              ? "Water, bark and a week aboard her. Most of them lived."
              : "You came back with water casks empty and the fever in your blood.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Send water out on a raft",
        tip: "Kind, and at a distance (+1 renown).",
        apply: (g, life) => {
          fx(g, life, { renown: 1, coins: -0.5 });
          say(
            g,
            life,
            "Casks lashed to a raft and floated out on the ebb. They raised a cheer you could hear from the wharf.",
          );
        },
      },
      {
        label: "Keep away, and keep your family away",
        tip: "Safe.",
        apply: (g, life) => {
          fx(g, life, { stress: 3 });
          say(
            g,
            life,
            "The boat went back. The ship sailed on the third day, lighter by six men.",
          );
        },
      },
    ],
  },
  {
    key: "port-letter-home",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && port(g, life) && colonist(g, life) ? {} : null,
    scene: "docks",
    title: "A ship for home",
    body: () =>
      "A ship sails for the old country on the tide, and her captain will carry letters and small parcels for a fee. There are people across the water who haven't heard from you in years, and one or two who could do you good.",
    choices: [
      {
        label: costs("Write to a great man at home", 1),
        tip: "Letters: your name spoken in the right rooms (+3 favour).",
        check: { skill: "letters", dc: 6 },
        blocked: (g, life) => poor(life, 1),
        apply: (g, life, _c, pass) => {
          fx(g, life, { coins: -1, favor: pass ? 3 : 1, xp: { letters: 8 } });
          say(
            g,
            life,
            pass
              ? "A well-turned letter, with a box of tobacco. It'll be read."
              : "A letter that will be read, briefly, by a secretary.",
          );
        },
      },
      {
        label: costs("Send a parcel to your family", 2),
        tip: "−6 stress; somebody at home weeps over it.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, stress: -6 });
          say(
            g,
            life,
            "Tobacco, a beaver hat and a long letter. Somebody at home will weep over it.",
            "good",
          );
        },
      },
      {
        label: "Wave her off",
        tip: "Another time.",
        apply: (g, life) =>
          say(
            g,
            life,
            "She stood down the river on the ebb, and you watched her out of sight.",
          ),
      },
    ],
  },
  // ------------------------------------------------ your station
  {
    key: "role-petitioner",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!inOffice(g, life)) return null;
      const c = local(g, life, 83, (x) => !x.role && ageOf(g.s, x) >= 40);
      return c ? { c: c.id } : null;
    },
    scene: "governor",
    title: "A petitioner in the rain",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} has stood in the rain outside your door since dawn to ask the ${postTitle(g.s, life.c) ?? "officer"} for help: a son taken up for debt, a field the neighbour has moved the fence into, a pension promised and never paid.`,
    choices: [
      {
        label: "Take the matter in hand",
        tip: "Persuasion: put right (+2 renown, +25 opinion). Fail: you tried (+10).",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          like(g, life, ctx, "Took up my cause", pass ? 25 : 10, 6);
          fx(g, life, pass ? { renown: 2 } : { stress: 4 });
          say(
            g,
            life,
            pass
              ? "A word here, a letter there, and it was put right. The town heard of it."
              : "You tried. They know you tried.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: costs("Pay it yourself", 4),
        tip: "Quick and quiet: +30 opinion, +1 renown.",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life, ctx) => {
          fx(g, life, { coins: -4, renown: 1 });
          like(g, life, ctx, "Paid out of their own pocket", 30, 8);
          say(
            g,
            life,
            "Four coins out of your own purse. Simpler than justice, sometimes.",
            "good",
          );
        },
      },
      {
        label: "Refer them to the proper court",
        tip: "Correct. Cold (−10).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Sent me to the court", -10, 3);
          say(
            g,
            life,
            "The proper court sits in April. They thanked you, wetly.",
          );
        },
      },
    ],
  },
  {
    key: "role-office-gift",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!inOffice(g, life)) return null;
      const c = local(
        g,
        life,
        89,
        (x) => x.role === "merchant" || x.role === "planter",
      );
      return c ? { c: c.id } : null;
    },
    scene: "governor",
    title: "A present for the office",
    body: (g, life, ctx) =>
      `A cask of Madeira has arrived from ${charName(g.s.chars[ctx.c])}, "with compliments", the week before a matter of theirs comes before you. The note says nothing about the matter. It doesn't need to.`,
    choices: [
      {
        label: "Send it back",
        tip: "+1 renown, honest name; they're offended (−10).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Sent back my Madeira", -10, 3);
          fx(g, life, { renown: 1, gain: "honest" });
          say(
            g,
            life,
            "Back it went, unopened. The town hears these things.",
            "good",
          );
        },
      },
      {
        label: "Drink it, and judge the matter fairly anyway",
        tip: "Stealth: nobody minds. Found out: talk (−2 renown).",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { stress: -6 } : { renown: -2, stress: 3 });
          say(
            g,
            life,
            pass
              ? "Excellent Madeira. You found against them. They were very surprised."
              : "The cask was seen going in. The verdict was seen going against them. Nobody believed either.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "Drink it, and find for them",
        tip: "+20 opinion, +3 coins' worth. The law's eye, if it's found out.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "A friend in office", 20, 5);
          fx(g, life, { coins: 3, stress: -4 });
          if (g.rng.chance(0.3)) {
            fx(g, life, { renown: -3 });
            say(
              g,
              life,
              "It was found out. The gazette was very witty about Madeira.",
              "bad",
            );
          } else
            say(g, life, "A fine cask, a fine decision, a fine friendship.");
        },
      },
    ],
  },
  {
    key: "role-tenant",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      (life.property ?? []).some((p) => p.kind === "land" || p.let) ? {} : null,
    scene: "fields",
    title: "Behind with the rent",
    body: () =>
      "A tenant of yours is three quarters behind with the rent: a bad harvest, a sick wife, a cow that died. He's come to the door with his hat in his hands and a basket of eggs.",
    choices: [
      {
        label: "Forgive the arrears",
        tip: "−3 coins; generous (+2 renown).",
        apply: (g, life) => {
          fx(g, life, { coins: -3, renown: 2, gain: "generous" });
          say(
            g,
            life,
            "Forgiven, the lot. He went home and told the whole county.",
            "good",
          );
        },
      },
      {
        label: "Take the eggs and give him till Michaelmas",
        tip: "Persuasion: he pays in the autumn (+2 coins). Fail: he doesn't.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 2 } : { coins: -2 });
          say(
            g,
            life,
            pass
              ? "He paid at Michaelmas, every penny, and a goose."
              : "Michaelmas came, and he'd gone west.",
          );
        },
      },
      {
        label: "Distrain his goods",
        tip: "+3 coins; −2 renown, and a hard name.",
        apply: (g, life) => {
          fx(g, life, { coins: 3, renown: -2, gain: "greedy" });
          say(
            g,
            life,
            "The bailiff took his plough and his bed. Your rent is paid; your name is not.",
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "role-careen",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      hasBoat(life) &&
      (life.boats ?? []).some((b) => b.condition < 90 && !b.away)
        ? {}
        : null,
    scene: "docks",
    title: "Weed on her bottom",
    body: (g, life) => {
      const b = (life.boats ?? []).find((x) => x.condition < 90 && !x.away);
      return `The ${b?.name ?? "boat"} is slow through the water and sluggish in stays: weed and barnacles thick on her bottom, and worm, for all you know, in the planks.`;
    },
    choices: [
      {
        label: costs("Haul her out and scrape her", 2),
        tip: "+15 condition.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          const b = (life.boats ?? []).find((x) => x.condition < 90 && !x.away);
          fx(g, life, { coins: -2, xp: { seamanship: 6 } });
          if (b) {
            touchLife(g, life);
            b.condition = Math.min(100, b.condition + 15);
          }
          say(
            g,
            life,
            "Hove down on the beach, scraped and paid with tallow. She sails like a girl again.",
            "good",
          );
        },
      },
      {
        label: "Do it yourself on the tide",
        tip: "Seamanship: +10 condition for nothing. Fail: she lies over badly (−5).",
        check: { skill: "seamanship", dc: 6 },
        apply: (g, life, _c, pass) => {
          const b = (life.boats ?? []).find((x) => x.condition < 90 && !x.away);
          if (b) {
            touchLife(g, life);
            b.condition = Math.max(
              0,
              Math.min(100, b.condition + (pass ? 10 : -5)),
            );
          }
          fx(g, life, { xp: { seamanship: 10 }, stress: 3 });
          say(
            g,
            life,
            pass
              ? "Two tides and a sore back, and she's clean."
              : "She lay over on a rock. Worse than before.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Leave it for now",
        tip: "−5 condition by the season's end.",
        apply: (g, life) => {
          const b = (life.boats ?? []).find((x) => x.condition < 90 && !x.away);
          if (b) {
            touchLife(g, life);
            b.condition = Math.max(0, b.condition - 5);
          }
          say(g, life, "Another month of weed. She knows, and she sulks.");
        },
      },
    ],
  },
  {
    key: "role-holiday",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (hasPeople(life) && atHome(g, life) ? {} : null),
    scene: "tavern",
    title: "Your people want a holiday",
    body: () =>
      "The people in your service have sent one of their number to ask, very respectfully, for a day off for the fair, and something to drink to your health with.",
    choices: [
      {
        label: costs("A day off and a barrel", 3),
        tip: "+10 loyalty for every one of them.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, renown: 0.5 });
          touchLife(g, life);
          for (const f of life.people ?? [])
            f.loyalty = Math.min(100, f.loyalty + 10);
          say(
            g,
            life,
            "They drank your health so often you're fairly sure you'll live for ever.",
            "good",
          );
        },
      },
      {
        label: "A day off, nothing more",
        tip: "+4 loyalty.",
        apply: (g, life) => {
          touchLife(g, life);
          for (const f of life.people ?? [])
            f.loyalty = Math.min(100, f.loyalty + 4);
          say(g, life, "A day at the fair. They came back on time, mostly.");
        },
      },
      {
        label: "Work is work",
        tip: "−8 loyalty; they grumble.",
        apply: (g, life) => {
          touchLife(g, life);
          for (const f of life.people ?? [])
            f.loyalty = Math.max(0, f.loyalty - 8);
          say(
            g,
            life,
            "No holiday. You can hear them grumbling from the next room.",
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "role-admirer",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (life.renown < 30 || !adult(g, life)) return null;
      const c = local(g, life, 97, (x) => ageOf(g.s, x) <= 24);
      return c ? { c: c.id } : null;
    },
    title: "Someone who's heard of you",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)}, young and earnest, has been following you about the town for a week, and has finally worked up the nerve to say that ${he(c)} has heard everything you've done, and would you, possibly, tell ${him(c)} how?`;
    },
    choices: [
      {
        label: "Tell them, honestly",
        tip: "Persuasion: a young friend for life (a friend). Fail: they're disillusioned.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, ctx, pass) => {
          const c = who(g, ctx);
          if (pass && c) {
            like(g, life, ctx, "Took me seriously", 25, 8);
            if (!life.ties[c.id]) setTie(g, life, c.id, "friend");
            say(
              g,
              life,
              `${charName(c)} hangs on your every word and has started dressing like you. A friend, it seems.`,
              "good",
            );
          } else {
            like(g, life, ctx, "Not what I thought", -5, 3);
            say(
              g,
              life,
              "The truth was duller than the stories. They wandered off.",
            );
          }
        },
      },
      {
        label: "Tell them the legend",
        tip: "+1 renown as the tale spreads.",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Told me great stories", 10, 4);
          fx(g, life, { renown: 1 });
          say(
            g,
            life,
            "You may have added a bear. The tale is all over town by Thursday.",
          );
        },
      },
    ],
  },
  {
    key: "role-almsgiving",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && life.purse >= 120 && colonist(g, life) ? {} : null,
    scene: "home",
    title: "At the gate",
    body: () =>
      "There are beggars at your gate every morning now (a discharged soldier with one leg, a widow with three children, a man who says he was a schoolmaster) because word has gone round that you are rich. It's true.",
    choices: [
      {
        label: costs("Found a charity for the town's poor", 20),
        tip: "+4 renown, +2 favour, and your name on a stone.",
        blocked: (g, life) => poor(life, 20),
        apply: (g, life) => {
          fx(g, life, { coins: -20, renown: 4, favor: 2, gain: "generous" });
          say(
            g,
            life,
            "A fund for bread and firewood, governed by the vestry, and your name carved over the door of the poorhouse.",
            "good",
          );
        },
      },
      {
        label: costs("Give to each of them, every morning", 3),
        tip: "+1.5 renown; the gate gets busier.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, renown: 1.5, stress: -3 });
          say(
            g,
            life,
            "A coin each, every morning. The gate is a little busier, and your heart a little lighter.",
          );
        },
      },
      {
        label: "Have the gate shut",
        tip: "−2 renown. Hard, but cheap.",
        apply: (g, life) => {
          fx(g, life, { renown: -2 });
          say(
            g,
            life,
            "The gate is shut. The town has noticed, and says so in the pew behind yours.",
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "role-hard-times",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && life.purse < 3 && atHome(g, life) ? {} : null,
    scene: "home",
    title: "Hard times",
    body: () =>
      "There's nothing in the cupboard but half a loaf and a promise, the rent is due on Lady Day, and your good coat is hanging on the peg looking at you.",
    choices: [
      {
        label: "Pawn the coat",
        tip: "+3 coins now. You'll be cold, and seen to be.",
        apply: (g, life) => {
          fx(g, life, { coins: 3, stress: 4, renown: -0.5 });
          say(
            g,
            life,
            "Three coins for the coat. Your uncle the pawnbroker, as they say.",
          );
        },
      },
      {
        label: "Go to the overseers of the poor",
        tip: "+2 coins of relief. They'll want you to wear a P on your sleeve.",
        apply: (g, life) => {
          fx(g, life, { coins: 2, renown: -1.5, stress: 5 });
          say(
            g,
            life,
            "Relief, and a badge with a P on it. You wear it under your sleeve.",
            "bad",
          );
        },
      },
      {
        label: "Tighten your belt",
        tip: "Robust or not: −4 health, −1 stress for the pride of it.",
        apply: (g, life) => {
          fx(g, life, { health: -4, stress: -1 }, "hunger");
          say(
            g,
            life,
            "Half a loaf, sliced very thin, and a great deal of water. Something will turn up.",
          );
        },
      },
    ],
  },
  {
    key: "role-rival-shop",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (owns(life, "business") ? {} : null),
    scene: "market",
    title: "A rival across the street",
    body: () =>
      "Someone has opened the same business as yours across the street, with a new painted sign and prices a penny lower, and your customers are walking past your door to look.",
    choices: [
      {
        label: "Do it better",
        tip: "Trade: your custom grows (+5 coins). Fail: a price war you lose (−3).",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { coins: 5, xp: { trade: 12 } } : { coins: -3, stress: 4 },
          );
          say(
            g,
            life,
            pass
              ? "Better goods, a warmer welcome. Their sign is very pretty; their shop is empty."
              : "A penny lower, then two. Nobody wins a price war but the customer.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Offer to buy them out",
        tip: "Persuasion: they sell for 8 (and your business grows; +2 renown).",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: -8, renown: 2 } : { stress: 2 });
          say(
            g,
            life,
            pass
              ? "Eight coins and a handshake. Their sign hangs in your back room."
              : "They laughed. They're new; they still believe in it.",
          );
        },
      },
      {
        label: "Wait them out",
        tip: "Most new shops close within the year. Most.",
        apply: (g, life) => {
          if (g.rng.chance(0.6)) say(g, life, "They closed by Candlemas.");
          else {
            fx(g, life, { coins: -2 });
            say(
              g,
              life,
              "They didn't close. They're doing rather well.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "role-horse-race",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && genteel(life) && colonist(g, life) ? {} : null,
    scene: "fields",
    title: "A quarter race",
    body: () =>
      "A planter with more horse than sense has challenged you to a quarter-mile race on the straight behind the courthouse, for a purse of ten coins a side and the honour of the county.",
    choices: [
      {
        label: costs("Ride it yourself", 10),
        tip: "Woodcraft (horsemanship): win 20 and the county's admiration (+3 renown). Lose: 10 and a fall.",
        check: { skill: "woodcraft", dc: 8 },
        blocked: (g, life) => poor(life, 10),
        apply: (g, life, _c, pass) => {
          fx(g, life, { coins: -10 });
          if (pass) {
            fx(g, life, { coins: 20, renown: 3 });
            say(
              g,
              life,
              "By a neck, in a cloud of dust and shouting. The county drank your health till Tuesday.",
              "good",
            );
          } else {
            fx(g, life, { health: -8, renown: -1 }, "a fall at the races");
            say(g, life, "His horse, his purse, and your collarbone.", "bad");
          }
        },
      },
      {
        label: "Put up a jockey and bet on him",
        tip: "Trade: a canny wager (+6). Fail: −4.",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 6 } : { coins: -4 });
          say(
            g,
            life,
            pass
              ? "A stable boy who weighs nothing and fears less. He won."
              : "A stable boy who weighs nothing. Neither did his chances.",
          );
        },
      },
      {
        label: "Decline: your horse is for carriages",
        tip: "−0.5 renown with the sporting set.",
        apply: (g, life) => {
          fx(g, life, { renown: -0.5 });
          say(
            g,
            life,
            "The sporting set think you dull. The carriage horse is relieved.",
          );
        },
      },
    ],
  },
  {
    key: "role-war-billet",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      warNow(g, life) &&
      owns(life, "house") &&
      atHome(g, life) &&
      colonist(g, life)
        ? {}
        : null,
    scene: "home",
    title: "Soldiers billeted on you",
    body: () =>
      "The war has brought soldiers to town, and the quartermaster has chalked a number on your door: four men of the regiment, to be lodged and fed in your house until further notice, at a rate the crown will pay, eventually.",
    choices: [
      {
        label: "Take them in with a good grace",
        tip: "−2 coins, +4 stress; +1 renown and +2 favour for loyalty.",
        apply: (g, life) => {
          fx(g, life, { coins: -2, stress: 4, renown: 1, favor: 2 });
          say(
            g,
            life,
            "Four soldiers in the back rooms. They eat like wolves and sing like angels.",
            "good",
          );
        },
      },
      {
        label: "Argue with the quartermaster",
        tip: "Persuasion: they go elsewhere. Fail: six of them.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { stress: -2 } : { coins: -3, stress: 8 });
          say(
            g,
            life,
            pass
              ? "The chalk was rubbed off your door and put on the tavern's."
              : "Six. With a drummer.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: costs("Pay to be excused", 4),
        tip: "Money talks to quartermasters.",
        blocked: (g, life) => poor(life, 4),
        apply: (g, life) => {
          fx(g, life, { coins: -4 });
          say(g, life, "Four coins, and the chalk mark faded quite suddenly.");
        },
      },
    ],
  },
];
