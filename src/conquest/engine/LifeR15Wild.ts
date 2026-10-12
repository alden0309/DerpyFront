// EVENTS (r15): the edge of things and the turn of the year. The frontier
// (a cabin raising, a panther at the springhouse, a land jobber, a rumour of
// raiders, neighbours from the next nation come to trade, a salt lick); the
// peoples' own life (a name earned, winter stories, a dream to fulfil, an
// adopted kinsman, the trader's heavy weights, the plum-stone game, rum in
// the village, the giveaway, the clan mother's question); the weather (a
// flood in the street, the dog days, the first snow, the frozen pond, a
// thunderstorm, an Indian summer, the mosquitoes); and a few more for the
// road and the sea.

import type { ConquestGame } from "./Game";
import { touchLife } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import {
  adult,
  atHome,
  child,
  colonist,
  costs,
  frontier,
  fx,
  like,
  local,
  months,
  native,
  northern,
  owns,
  poor,
  say,
  southern,
  warNow,
  winter,
  year,
} from "./LifeR15Kit";
import { ageOf, charName } from "./Queries";
import type { Life } from "./Types";

const REST = 1460;

/** The place a road or sea event happens near. */
const along = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.travel?.path[0] ?? life.prov]?.name ?? "the next town";

export const WILD_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ the frontier
  {
    key: "front-cabin",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && frontier(g, life) ? {} : null),
    scene: "woods",
    title: "A cabin raising",
    body: () =>
      "A new family has come up the creek with a wagon, an axe, five children and nothing else, and the neighbours are going to put a roof over them in a day. The logs are cut. They need hands, and someone who knows how to notch a corner.",
    choices: [
      {
        label: "Notch the corners",
        tip: "Craft: a tight cabin by sundown (+2 renown, a new family who'd die for you).",
        check: { skill: "craft", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { renown: 2, xp: { craft: 12 }, stress: -4 }
              : { health: -5, xp: { craft: 6 } },
            "a cabin raising",
          );
          say(
            g,
            life,
            pass
              ? "Saddle notches, tight as a drum. They had a roof by dark and a fire by supper."
              : "A log rolled. The cabin went up; so did your foot.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Bring food and a pot",
        tip: "−1 coin; the woman of the house won't forget it (+1 renown).",
        apply: (g, life) => {
          fx(g, life, { coins: -1, renown: 1, stress: -3 });
          say(
            g,
            life,
            "A kettle, a ham and a sack of meal. You'd think it was Christmas.",
          );
        },
      },
      {
        label: "Too busy",
        tip: "Neighbours notice who comes.",
        apply: (g, life) => {
          fx(g, life, { renown: -0.5 });
          say(
            g,
            life,
            "Too busy. The new family know your name already, it seems.",
          );
        },
      },
    ],
  },
  {
    key: "front-panther",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && (frontier(g, life) || native(g, life)) ? {} : null,
    scene: "woods",
    title: "A panther at the springhouse",
    body: () =>
      "Something has been at the springhouse two nights running: the milk crocks knocked over, a lamb gone, and tracks in the mud by the spring as wide as your palm. Last night the dog wouldn't go out.",
    choices: [
      {
        label: "Sit up for it with a gun",
        tip: "Fighting: a panther skin and the settlement's thanks (+2 renown). Fail: claws.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { renown: 2, coins: 2, xp: { fighting: 12 } }
              : { health: -16, xp: { fighting: 6 } },
            "a panther",
          );
          say(
            g,
            life,
            pass
              ? "It came at moonrise, and you didn't miss. The skin hangs over your door."
              : "It came at moonrise from the side you weren't watching.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Track it to its den",
        tip: "Woodcraft: you find it, and leave it be; it moves on.",
        check: { skill: "woodcraft", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { xp: { woodcraft: 14 } } : { coins: -1, stress: 4 },
          );
          say(
            g,
            life,
            pass
              ? "A ledge above the creek, with cubs. You left them. The springhouse has been quiet since."
              : "Lost the track in the laurel. Another lamb gone.",
          );
        },
      },
      {
        label: "Bar the springhouse and wait",
        tip: "−1 coin in lambs; it'll move on in time.",
        apply: (g, life) => {
          fx(g, life, { coins: -1, stress: 2 });
          say(
            g,
            life,
            "Barred and bolted. It took one more lamb from the pen, and went.",
          );
        },
      },
    ],
  },
  {
    key: "front-land-jobber",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && colonist(g, life) && life.purse >= 10 ? {} : null,
    scene: "tavern",
    title: "A land jobber",
    body: () =>
      'A man with a map, a seal and a great deal of confidence is selling titles to land beyond the mountains at a shilling an acre, "the finest bottom land in the world, and the savages entirely peaceable". He has a crowd.',
    choices: [
      {
        label: costs("Buy a hundred acres on paper", 8),
        tip: "A 25% chance the title's good and sells on for 25. Otherwise worthless.",
        blocked: (g, life) => poor(life, 8),
        apply: (g, life) => {
          fx(g, life, { coins: -8 });
          if (g.rng.chance(0.25)) {
            fx(g, life, { coins: 25 });
            say(
              g,
              life,
              "Against all odds the title was good, and a German family paid handsomely for it.",
              "good",
            );
          } else
            say(
              g,
              life,
              "The land was real. The title wasn't. Neither, it turned out, was the jobber's name.",
              "bad",
            );
        },
      },
      {
        label: "Ask to see his patent",
        tip: "Letters: you expose him (+2 renown). Fail: he talks rings round you.",
        check: { skill: "letters", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 2, xp: { letters: 10 } } : { renown: -0.5 },
          );
          say(
            g,
            life,
            pass
              ? "The seal was a button. The crowd took their shillings back, and him out of town on a rail."
              : "His patent had more seals than a royal wedding. The crowd bought more.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Have a drink and watch",
        tip: "Instructive.",
        apply: (g, life) => {
          fx(g, life, { xp: { trade: 6 } });
          say(
            g,
            life,
            "Forty people bought land in a country none of them will ever see. You learned a great deal about selling.",
          );
        },
      },
    ],
  },
  {
    key: "front-rumour",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && frontier(g, life) && warNow(g, life) ? {} : null,
    scene: "woods",
    title: "A rumour of raiders",
    body: () =>
      "A man rode in at dawn on a lathered horse: smoke over the next valley, a family burned out, a war party on the trails. Or a lightning fire and a drunk's imagination. The settlement is arguing in the road.",
    choices: [
      {
        label: "Scout the trails yourself",
        tip: "Woodcraft: you learn the truth (+2 renown). Fail: you meet it (−14 health).",
        check: { skill: "woodcraft", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { renown: 2, xp: { woodcraft: 14 } }
              : { health: -14, stress: 6 },
            "raiders on the trail",
          );
          say(
            g,
            life,
            pass
              ? "A lightning fire, and a family safe at their neighbour's. You rode back with the truth."
              : "It was no lightning fire.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Fort up at the blockhouse",
        tip: "A week of crowded waiting (+5 stress); safe.",
        apply: (g, life) => {
          fx(g, life, { stress: 5, coins: -1 });
          say(
            g,
            life,
            "A week in the blockhouse with forty people and their cows. Nothing came.",
          );
        },
      },
      {
        label: "Go on with your work",
        tip: "Most rumours are rumours. Most.",
        apply: (g, life) => {
          if (g.rng.chance(0.75))
            say(g, life, "A rumour. The man on the horse was the drunk.");
          else {
            fx(g, life, { health: -10, coins: -3 }, "raiders");
            say(
              g,
              life,
              "Not a rumour. You got your family out the back as the barn went up.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "front-neighbours",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && frontier(g, life) && !warNow(g, life) ? {} : null,
    scene: "woods",
    title: "Visitors from over the line",
    body: () =>
      "A family of the nation whose country begins at the ridge has come down to your clearing with venison and deerskins, wanting salt, a kettle and a little powder. They wait at the edge of the trees, politely, to see what kind of neighbour you are.",
    choices: [
      {
        label: "Trade fairly, and feed them",
        tip: "Trade, and neighbours for life (+2 renown, safer for it).",
        apply: (g, life) => {
          fx(g, life, {
            coins: 1,
            renown: 2,
            xp: { trade: 10, persuasion: 6 },
          });
          say(
            g,
            life,
            "Salt for venison, a kettle for skins, and supper on both sides. They'll come again, and warn you when there's trouble.",
            "good",
          );
        },
      },
      {
        label: "Drive a hard bargain",
        tip: "Trade: +4 coins. They'll remember the price.",
        check: { skill: "trade", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { coins: 4, renown: -1 } : { coins: 1 });
          say(
            g,
            life,
            pass
              ? "A fine bargain. They didn't come back."
              : "They knew the price of salt better than you.",
          );
        },
      },
      {
        label: "Wave them off",
        tip: "−1 renown; nobody on the ridge will warn you of anything.",
        apply: (g, life) => {
          fx(g, life, { renown: -1, stress: 2 });
          say(
            g,
            life,
            "They went back into the trees. You feel watched now, which is new.",
          );
        },
      },
    ],
  },
  {
    key: "front-salt-lick",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && (frontier(g, life) || native(g, life)) ? {} : null,
    scene: "woods",
    title: "A salt lick",
    body: () =>
      "Following a buffalo trace beaten deep as a sunken lane, you come out at a salt lick in a clearing: the ground licked bare, springs of brackish water, and the bones of animals older than anyone's grandfather.",
    choices: [
      {
        label: "Boil salt from the springs",
        tip: "Craft: a week's work, and salt worth 5 coins.",
        check: { skill: "craft", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { coins: 5, xp: { craft: 10 } } : { coins: 1, stress: 3 },
          );
          say(
            g,
            life,
            pass
              ? "Kettles going day and night. Salt is silver out here."
              : "Thin, bitter salt, and not much of it.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Hunt the lick",
        tip: "Woodcraft: game comes to salt (+4 coins in meat and hides).",
        check: { skill: "woodcraft", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { coins: 4, xp: { woodcraft: 12 } } : { stress: 2 },
          );
          say(
            g,
            life,
            pass
              ? "Elk at dusk, deer at dawn. Meat for the winter."
              : "The game came at night, and left before you woke.",
          );
        },
      },
      {
        label: "Bring home one of the great bones",
        tip: "A curiosity: +1 renown when the learned men come to look.",
        apply: (g, life) => {
          fx(g, life, { renown: 1, xp: { letters: 4 } });
          say(
            g,
            life,
            "A tooth the size of your fist. A learned man wrote to London about it, and spelled your name wrong.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ the peoples' own life
  {
    key: "nat-name-earned",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      native(g, life) && adult(g, life) && life.renown >= 8 ? {} : null,
    scene: "councilfire",
    title: "A name earned",
    body: () =>
      "The elders have talked of what you've done, and at the fire tonight they mean to give you a new name, one that says it. It's a great honour. It's also, the young men warn you, sometimes a joke.",
    choices: [
      {
        label: "Accept it with thanks",
        tip: "+3 renown among the people.",
        apply: (g, life) => {
          fx(g, life, { renown: 3, stress: -5 });
          say(
            g,
            life,
            "A good name, a strong one. The children use it already.",
            "good",
          );
        },
      },
      {
        label: costs("Give a feast in its honour", 3),
        tip: "+5 renown; the whole village eats.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, renown: 5, stress: -6 });
          say(
            g,
            life,
            "Venison, corn soup and dancing till morning. Your name was sung a hundred times.",
            "good",
          );
        },
      },
    ],
  },
  {
    key: "nat-stories",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (native(g, life) && winter(g, life) ? {} : null),
    scene: "village",
    title: "Winter stories",
    body: () =>
      "Snow on the lodges, and the season for stories, which may only be told when the snakes and the little people are asleep. The children are looking at you: it's your turn.",
    choices: [
      {
        label: "Tell the old story properly",
        tip: "Persuasion: the children hang on every word (+1 renown).",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { renown: 1, xp: { persuasion: 12 }, stress: -6 }
              : { xp: { persuasion: 6 } },
          );
          say(
            g,
            life,
            pass
              ? "Rabbit, and the moon, and the trick that went wrong. The children made you tell it twice."
              : "You lost the thread in the middle. An old woman took it up.",
          );
        },
      },
      {
        label: "Tell one of your own adventures",
        tip: "+0.5 renown; the young men want to hear more.",
        apply: (g, life) => {
          fx(g, life, { renown: 0.5, stress: -4 });
          say(g, life, "The bear was bigger every time. Nobody minded.");
        },
      },
      {
        label: "Ask the oldest woman to tell one",
        tip: "Faith: you learn something you'd forgotten.",
        apply: (g, life) => {
          fx(g, life, { xp: { faith: 10 }, stress: -5 });
          say(
            g,
            life,
            "Her mother's mother's story, word for word. You'll tell it yourself, one winter.",
          );
        },
      },
    ],
  },
  {
    key: "nat-dream",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    scene: "village",
    title: "A dream to fulfil",
    body: () =>
      "You dreamed, three nights running, of a red blanket and a dog with a white face. Among the people a dream is the soul's wish, and a wish unfulfilled makes the dreamer sick. The village will try to guess it, if you tell them.",
    choices: [
      {
        label: "Tell the dream at the fire",
        tip: "The village fulfils it: −12 stress, +6 health.",
        apply: (g, life) => {
          fx(g, life, { stress: -12, health: 6 });
          say(
            g,
            life,
            "By morning there was a red blanket on your lodge and a white-faced puppy asleep on it. You feel very well.",
            "good",
          );
        },
      },
      {
        label: "Keep it to yourself",
        tip: "Faith: the dream fades. Or it doesn't (+8 stress).",
        check: { skill: "faith", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { xp: { faith: 8 } } : { stress: 8, health: -3 });
          say(
            g,
            life,
            pass
              ? "It faded."
              : "It came back, every night, until you told it.",
            pass ? undefined : "bad",
          );
        },
      },
    ],
  },
  {
    key: "nat-adoptee",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!native(g, life) || !adult(g, life)) return null;
      const c = local(g, life, 101, (x) => !x.female && ageOf(g.s, x) <= 30);
      return c ? { c: c.id } : null;
    },
    scene: "village",
    title: "A new kinsman",
    body: (g, life, ctx) =>
      `The clan has adopted ${charName(g.s.chars[ctx.c])} to fill the place of a man killed last summer: a captive once, a kinsman now, with the dead man's name and the dead man's mother. He knows nothing of the people's ways, and the clan mother has given him to you to teach.`,
    choices: [
      {
        label: "Teach him as a brother",
        tip: "Leadership: he becomes one of the people (+2 renown, +25 opinion).",
        check: { skill: "leadership", dc: 6 },
        apply: (g, life, ctx, pass) => {
          like(
            g,
            life,
            ctx,
            "Taught me to be one of the people",
            pass ? 25 : 10,
            10,
          );
          fx(
            g,
            life,
            pass ? { renown: 2, xp: { leadership: 10 } } : { stress: 4 },
          );
          say(
            g,
            life,
            pass
              ? "By spring he hunted with you and laughed at the same jokes. A brother."
              : "He learns slowly, and looks east when he thinks nobody sees.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Keep a wary eye on him",
        tip: "Safe, and cold (−10).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Never trusted me", -10, 5);
          say(g, life, "He knows you watch him. He watches you back.");
        },
      },
    ],
  },
  {
    key: "nat-weights",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    scene: "village",
    title: "The trader's heavy weights",
    body: () =>
      "The colonist trader at the post weighs your furs on his own scales, and his pound weight has been getting heavier every season. Your sister weighed it against a musket ball. It's a pound and a half.",
    choices: [
      {
        label: "Confront him before the others",
        tip: "Persuasion: he's shamed into fair weights (+2 renown, +3 coins back).",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { renown: 2, coins: 3 } : { stress: 5 });
          say(
            g,
            life,
            pass
              ? "Before twenty hunters, with the musket ball. He filed his weight down that afternoon."
              : "He said the musket ball was light. The hunters went on trading. Where else would they go?",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Take your furs to the French",
        tip: "A long way, and a better price (+2 coins).",
        apply: (g, life) => {
          fx(g, life, { coins: 2, stress: 3, xp: { trade: 8 } });
          say(
            g,
            life,
            "Ten days to the French post. Honest scales, worse brandy.",
          );
        },
      },
      {
        label: "Bring your own weights",
        tip: "Craft: a stone pound, true. He grumbles and accepts.",
        apply: (g, life) => {
          fx(g, life, { coins: 1, xp: { craft: 6 } });
          say(
            g,
            life,
            "A river stone, ground to a pound against the church's own weight. He uses it now, with bad grace.",
          );
        },
      },
    ],
  },
  {
    key: "nat-plum-stones",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    scene: "village",
    title: "The plum-stone game",
    body: () =>
      "The women's game is going in the long lodge: six plum stones, black on one side, shaken in a bowl and struck on a blanket, and wagers piled beside the players: beads, kettles, a good blanket, a canoe.",
    choices: [
      {
        label: costs("Play, and wager a kettle", 2),
        tip: "A fair game: 50% you win 4.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2 });
          if (g.rng.chance(0.5)) {
            fx(g, life, { coins: 4, stress: -4 });
            say(
              g,
              life,
              "Five black. The kettle is yours, and its neighbour.",
              "good",
            );
          } else
            say(
              g,
              life,
              "Three and three. The kettle went to your cousin, who will mention it.",
            );
        },
      },
      {
        label: "Cheer for your clan",
        tip: "−5 stress.",
        apply: (g, life) => {
          fx(g, life, { stress: -5 });
          say(
            g,
            life,
            "Your clan won a canoe. You cheered as if you'd won it yourself.",
          );
        },
      },
    ],
  },
  {
    key: "nat-rum",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      native(g, life) && adult(g, life) && year(g) >= 1660 ? {} : null,
    scene: "village",
    title: "Rum in the village",
    body: () =>
      "Traders came yesterday with kegs of rum, and the young men traded a winter's furs for it, and now there's shouting, a lodge on fire, and a man you love lying in the snow singing.",
    choices: [
      {
        label: "Stave in the kegs",
        tip: "Fighting: the rum is gone (+2 renown with the elders). Fail: the young men's fists.",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { renown: 2 } : { health: -10, renown: 1 });
          say(
            g,
            life,
            pass
              ? "Every keg broached into the snow. The young men will thank you, eventually."
              : "You broke one keg. The young men broke you a little.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Carry the drunk ones in from the cold",
        tip: "Medicine: nobody freezes tonight.",
        check: { skill: "medicine", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 1, xp: { medicine: 8 } } : { stress: 8 },
          );
          say(
            g,
            life,
            pass
              ? "Into the lodges, one by one. Nobody froze."
              : "You couldn't get to all of them.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "Drink with them",
        tip: "−10 stress tonight. You might like it too much (drunkard).",
        apply: (g, life) => {
          fx(g, life, { stress: -10, health: -3 });
          if (g.rng.chance(0.25)) fx(g, life, { gain: "drunkard" });
          say(g, life, "You woke in the snow, singing.");
        },
      },
    ],
  },
  {
    key: "nat-giveaway",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      native(g, life) && adult(g, life) && life.purse >= 6 ? {} : null,
    scene: "village",
    title: "The giveaway",
    body: () =>
      "Among the people a great one is measured by what they give away, not what they keep. There's a feast at the next moon, and those with plenty are expected to show it, the generous way.",
    choices: [
      {
        label: costs("Give away handsomely", 6),
        tip: "+4 renown, and the people's love.",
        blocked: (g, life) => poor(life, 6),
        apply: (g, life) => {
          fx(g, life, { coins: -6, renown: 4, gain: "generous" });
          say(
            g,
            life,
            "Blankets, kettles, knives and a fine gun, given away before everyone. You've never been richer.",
            "good",
          );
        },
      },
      {
        label: costs("Give what's proper", 2),
        tip: "+1 renown.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, renown: 1 });
          say(g, life, "A proper gift, properly given.");
        },
      },
      {
        label: "Keep what's yours",
        tip: "−2 renown; the colonists' way.",
        apply: (g, life) => {
          fx(g, life, { renown: -2 });
          say(
            g,
            life,
            "The people noticed. They say you've been too long among the traders.",
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "nat-clan-mother",
    pool: "any",
    cooldown: REST,
    when: (g, life) => {
      if (!native(g, life) || !adult(g, life)) return null;
      const c = local(g, life, 103, (x) => !x.female && ageOf(g.s, x) >= 30);
      return c ? { c: c.id } : null;
    },
    scene: "councilfire",
    title: "The clan mother's question",
    body: (g, life, ctx) =>
      `The clan mothers choose who will sit at the council for the clan, and one of them has drawn you aside to ask, quietly, what you think of ${charName(g.s.chars[ctx.c])}. Is he wise? Is he generous? Does he listen?`,
    choices: [
      {
        label: "Speak well of him",
        tip: "He may rise (+20 opinion; +1 renown if he does).",
        apply: (g, life, ctx) => {
          like(g, life, ctx, "Spoke for me to the clan mothers", 20, 8);
          fx(g, life, { renown: 1 });
          say(
            g,
            life,
            "You spoke well of him. He sits at the fire now, and knows who spoke.",
            "good",
          );
        },
      },
      {
        label: "Speak the truth, faults and all",
        tip: "Persuasion: the clan mothers trust your judgement (+2 renown).",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { renown: 2 } : { renown: 0.5 });
          say(
            g,
            life,
            pass
              ? "She nodded slowly. They'll ask you again."
              : "She thanked you. You're not sure what she'll do.",
          );
        },
      },
      {
        label: "Say nothing against anyone",
        tip: "Safe.",
        apply: (g, life) =>
          say(g, life, "You said he was a man. She knew that already."),
      },
    ],
  },
  {
    key: "nat-children-games",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      native(g, life) && child(g, life) && winter(g, life) ? {} : null,
    scene: "village",
    title: "The snow-snake",
    body: () =>
      "The boys and girls have made a long track in the snow, packed and iced, and are throwing polished sticks down it to see whose snow-snake slides furthest. Yours is crooked. Your uncle offers to carve you a better one, if you'll split his firewood.",
    choices: [
      {
        label: "Split the firewood",
        tip: "A fine snow-snake, and craft.",
        apply: (g, life) => {
          fx(g, life, { xp: { craft: 10 }, stress: -4 });
          say(
            g,
            life,
            "A week of firewood, and a snow-snake of maple, polished with fat. It flew.",
            "good",
          );
        },
      },
      {
        label: "Throw the crooked one anyway",
        tip: "Woodcraft (luck and wrist): it might go far.",
        check: { skill: "woodcraft", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { renown: 0.5, stress: -6 } : { stress: 2 });
          say(
            g,
            life,
            pass
              ? "It wobbled, it skipped, it went further than any. Nobody can explain it."
              : "It went into a snowbank. Everybody laughed, including you, eventually.",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ the weather
  {
    key: "wthr-flood",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      adult(g, life) && atHome(g, life) && months(2, 4)(g) && northern(g, life)
        ? {}
        : null,
    scene: "river",
    title: "The river in the street",
    body: () =>
      "The ice went out upriver in the night and the water came down with it: by morning the river is in the lower street, knee-deep and rising, carrying firewood, a henhouse and somebody's door.",
    choices: [
      {
        label: "Help the neighbours first",
        tip: "Fighting (strength): +2 renown. Fail: a soaking and a chill (−8 health).",
        check: { skill: "fighting", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 2, stress: 3 } : { health: -8, renown: 1 },
            "a flood",
          );
          say(
            g,
            life,
            pass
              ? "Three families up their stairs with their goods dry. You were the last out of the water."
              : "You saved a henhouse and caught a chill.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Get your own goods upstairs",
        tip: "Your things are safe.",
        apply: (g, life) => {
          fx(g, life, { stress: 4 });
          say(
            g,
            life,
            "Everything up the stairs by noon. The water came to the third step and stopped.",
          );
        },
      },
      {
        label: "Trust to luck",
        tip: "40% the water stays low; otherwise −4 coins of spoilt goods.",
        apply: (g, life) => {
          if (g.rng.chance(0.4)) say(g, life, "It stopped at the doorstep.");
          else {
            fx(g, life, { coins: -4, stress: 5 });
            say(g, life, "It didn't stop at the doorstep.", "bad");
          }
        },
      },
    ],
  },
  {
    key: "wthr-dog-days",
    pool: "any",
    cooldown: REST,
    when: (g, life) => (adult(g, life) && months(6, 7)(g) ? {} : null),
    scene: "fields",
    title: "The dog days",
    body: () =>
      "Sirius rises with the sun and the heat sits on the town like a wet blanket: the milk turns by noon, the dogs lie in the road, and every sensible creature is in the shade except, it seems, you.",
    choices: [
      {
        label: "Rest in the heat of the day",
        tip: "−8 stress; a little lost (−1 coin).",
        apply: (g, life) => {
          fx(g, life, { stress: -8, coins: -1 });
          say(
            g,
            life,
            "A long noon in the shade with your hat over your face. The world went on without you, slowly.",
          );
        },
      },
      {
        label: "Work through it",
        tip: "Robust or not: −5 health; +2 coins.",
        apply: (g, life) => {
          fx(g, life, { health: -5, coins: 2 }, "the heat");
          say(
            g,
            life,
            "You worked through it. You'll remember this summer in your bones.",
          );
        },
      },
      {
        label: "Swim in the river",
        tip: "Woodcraft: cool and happy (−10 stress). Fail: the current.",
        check: { skill: "woodcraft", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -10, health: 2 } : { health: -6, stress: 3 },
            "the river",
          );
          say(
            g,
            life,
            pass
              ? "Cold green water and the whole town's boys. Best hour of the summer."
              : "The current had you half a mile before the bank did.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "wthr-first-snow",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      months(10, 11)(g) && northern(g, life) && atHome(g, life) ? {} : null,
    scene: "snow",
    title: "First snow",
    body: () =>
      "You woke to the particular silence of the first snow: the roofs white, the road gone, and every child in the town already out in it.",
    choices: [
      {
        label: costs("Hire a sleigh for the afternoon", 1),
        tip: "Bells, rugs, a flask: −12 stress (and good for a courtship).",
        blocked: (g, life) => poor(life, 1),
        apply: (g, life) => {
          fx(g, life, { coins: -1, stress: -12 });
          say(
            g,
            life,
            "Sleigh bells all down the river road, and home by dark with cold cheeks and warm insides.",
            "good",
          );
        },
      },
      {
        label: "Join the snowball war",
        tip: "Fighting (aim): −8 stress, and glory among the children.",
        check: { skill: "fighting", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -8, renown: 0.3 } : { stress: -3, health: -1 },
          );
          say(
            g,
            life,
            pass
              ? "You held the churchyard wall against all comers."
              : "Eleven children, one adult. The children won.",
          );
        },
      },
      {
        label: "Stay by the fire",
        tip: "−5 stress.",
        apply: (g, life) => {
          fx(g, life, { stress: -5 });
          say(g, life, "Cider, the fire, a book. Let it snow.");
        },
      },
    ],
  },
  {
    key: "wthr-skating",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      winter(g, life) && northern(g, life) && !life.travel ? {} : null,
    scene: "snow",
    title: "The pond is frozen",
    body: () =>
      "The millpond has frozen black and clear, and half the town is on it: the Dutch on long skates with their hands behind their backs, the boys playing hockey with a bung, and a few brave souls who have never skated before, briefly.",
    choices: [
      {
        label: "Skate",
        tip: "Woodcraft (balance): −10 stress. Fail: −5 health, and a sore dignity.",
        check: { skill: "woodcraft", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -10 } : { health: -5, stress: 2 },
            "a fall on the ice",
          );
          say(
            g,
            life,
            pass
              ? "Round and round in the low sun. You'd forgotten you could."
              : "Once round, and then the ice came up to meet you.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: costs("Sell hot cider at the edge", 1),
        tip: "Trade: +3 coins.",
        check: { skill: "trade", dc: 4 },
        blocked: (g, life) => poor(life, 1),
        apply: (g, life, _c, pass) => {
          fx(g, life, { coins: pass ? 2 : -0.5 });
          say(
            g,
            life,
            pass
              ? "A kettle of cider and a ladle. Sold out by dusk."
              : "The tavern was selling it cheaper.",
          );
        },
      },
      {
        label: "Watch from the bank",
        tip: "−3 stress, and some fine falls to watch.",
        apply: (g, life) => {
          fx(g, life, { stress: -3 });
          say(g, life, "The magistrate fell twice. A good day.");
        },
      },
    ],
  },
  {
    key: "wthr-thunder",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      months(5, 8)(g) && atHome(g, life) && owns(life, "house") ? {} : null,
    scene: "home",
    title: "A thunderstorm",
    body: (g) =>
      `A summer storm over the town: thunder like cannon, rain in sheets, and a flash so close the whole house rang. There's a smell of burning from the chimney end.${year(g) >= 1752 ? " The printer in town has been selling Mr Franklin's lightning rods." : ""}`,
    choices: [
      {
        label: "Up the ladder with a bucket",
        tip: "Fighting (nerve): the fire's out. Fail: −10 health.",
        check: { skill: "fighting", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 0.5, stress: 3 } : { health: -10, coins: -2 },
            "lightning",
          );
          say(
            g,
            life,
            pass
              ? "The chimney top was smouldering. One bucket, and it was out."
              : "The ladder slipped. The fire went out anyway, in the rain.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: costs("Put up one of Franklin's rods", 3),
        tip: "Letters: the next one goes to ground. Only after 1752.",
        blocked: (g, life) =>
          year(g) < 1752 ? "Not yet invented" : poor(life, 3),
        apply: (g, life) => {
          fx(g, life, {
            coins: -3,
            xp: { letters: 6 },
            renown: 0.5,
            stress: -4,
          });
          say(
            g,
            life,
            "An iron rod on the chimney and a wire to the ground. The minister says it's tempting Providence.",
            "good",
          );
        },
      },
      {
        label: "Pray",
        tip: "Faith.",
        apply: (g, life) => {
          fx(g, life, { xp: { faith: 8 } });
          say(
            g,
            life,
            "The rain put it out. Providence, or the rain; you'll take either.",
          );
        },
      },
    ],
  },
  {
    key: "wthr-indian-summer",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      months(9, 10)(g) && northern(g, life) && adult(g, life) ? {} : null,
    scene: "woods",
    title: "A golden autumn",
    body: () =>
      "After the first frosts, a week of warm still days: the woods red and gold, a blue haze on the hills, the air smelling of smoke and apples. The old people say it's the last kindness of the year.",
    choices: [
      {
        label: "Take a day in the woods",
        tip: "−12 stress, +woodcraft.",
        apply: (g, life) => {
          fx(g, life, { stress: -12, xp: { woodcraft: 8 } });
          say(
            g,
            life,
            "A whole day with nothing in it but leaves and light. You'd forgotten what that was like.",
            "good",
          );
        },
      },
      {
        label: "Get the last of the work done",
        tip: "+2 coins.",
        apply: (g, life) => {
          fx(g, life, { coins: 2, stress: 2 });
          say(
            g,
            life,
            "The woodpile stacked, the roof mended, the cellar full. Winter can come.",
          );
        },
      },
    ],
  },
  {
    key: "wthr-mosquitoes",
    pool: "any",
    cooldown: REST,
    when: (g, life) =>
      months(5, 8)(g) && southern(g, life) && adult(g, life) ? {} : null,
    scene: "swamp",
    title: "The mosquitoes",
    body: () =>
      "The mosquitoes have come up from the swamps in clouds, whining in your ears all night, and the people of the country say the fever comes with them, though the physicians say it's the bad air.",
    choices: [
      {
        label: "Smudge fires and gauze at the windows",
        tip: "−1 coin; fewer bites, and (whatever the physicians say) less fever.",
        apply: (g, life) => {
          fx(g, life, { coins: -1, health: 2, stress: -3 });
          say(
            g,
            life,
            "Green wood smoking at every door and gauze over the beds. You smell like a ham, and sleep like a baby.",
            "good",
          );
        },
      },
      {
        label: "Go up to the hills for a month",
        tip: "−3 coins; −10 stress, +5 health, as the planters do.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, stress: -10, health: 5 });
          say(
            g,
            life,
            "A month in the cool hills with the planters' families. The lowlands can keep their fevers.",
            "good",
          );
        },
      },
      {
        label: "Grin and scratch",
        tip: "40% you take a fever (−10 health).",
        apply: (g, life) => {
          if (g.rng.chance(0.4)) {
            fx(g, life, { health: -10 }, "a marsh fever");
            say(
              g,
              life,
              "A fortnight of shaking. The physicians blame the air.",
              "bad",
            );
          } else say(g, life, "Bitten from head to foot, and somehow well.");
        },
      },
    ],
  },
  // ------------------------------------------------ the road
  {
    key: "way-bedfellow",
    pool: "road",
    cooldown: 400,
    weight: 2,
    when: (g, life) => (adult(g, life) && colonist(g, life) ? {} : null),
    title: "A bedfellow",
    body: (g, life) =>
      `The ordinary near ${along(g, life)} has one bed for travellers, and a stranger is already in it: a large man in a nightcap who has kept his boots on and is talking, in his sleep, about Dutch cheese.`,
    choices: [
      {
        label: "Get in, as custom is",
        tip: "A poor night (+4 stress); you hear a great deal about cheese.",
        apply: (g, life) => {
          fx(g, life, { stress: 4 });
          say(
            g,
            life,
            "He snored, he kicked, he dreamed of Gouda. You learned more about cheese than any man should.",
          );
        },
      },
      {
        label: "Sleep in the barn",
        tip: "Woodcraft: a fine night in the hay. Fail: rats.",
        check: { skill: "woodcraft", dc: 4 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { stress: -4 } : { stress: 5, health: -2 });
          say(
            g,
            life,
            pass
              ? "Sweet hay and a cat for company. Better than any bed."
              : "The rats had prior claim.",
          );
        },
      },
      {
        label: costs("Pay for the landlord's own room", 2),
        tip: "A good night's sleep (−6 stress).",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, stress: -6 });
          say(
            g,
            life,
            "The landlord's own bed, the landlord's own fleas. Still better than cheese.",
          );
        },
      },
    ],
  },
  {
    key: "way-tinker",
    pool: "road",
    cooldown: 400,
    weight: 2,
    title: "A tinker's cart",
    body: () =>
      "A tinker's cart is stopped by the road, its pots clanking in the wind, and the tinker (a brown little man with one eye and two donkeys) offers to mend anything, sell anything, and tell your fortune for nothing, which is about what it's worth.",
    choices: [
      {
        label: "Buy a good knife",
        tip: "−1 coin; trade, and a knife that holds an edge.",
        apply: (g, life) => {
          fx(g, life, { coins: -1, xp: { trade: 6, woodcraft: 4 } });
          say(g, life, "Sheffield steel, he swore. It might even be.");
        },
      },
      {
        label: "Hear his news of the road",
        tip: "Persuasion: you learn the safe ways ahead (a day saved).",
        check: { skill: "persuasion", dc: 4 },
        apply: (g, life, _c, pass) => {
          if (pass && life.travel) {
            touchLife(g, life);
            life.travel.arrive = Math.max(g.s.day + 1, life.travel.arrive - 1);
          }
          fx(g, life, { xp: { persuasion: 6 } });
          say(
            g,
            life,
            pass
              ? "A ford that isn't on any map, and an inn with clean beds. A day saved."
              : "He talked a great deal about his donkeys.",
          );
        },
      },
      {
        label: "Have your fortune told",
        tip: "Free, and the fortune is excellent.",
        apply: (g, life) => {
          fx(g, life, { stress: -3 });
          say(
            g,
            life,
            "A long life, a great fortune, and a tall dark stranger. He tells everyone that, but still.",
          );
        },
      },
    ],
  },
  {
    key: "way-wagon-mired",
    pool: "road",
    cooldown: 400,
    weight: 2,
    when: (g, life) => (adult(g, life) ? {} : null),
    title: "A wagon in the mire",
    body: (g, life) =>
      `On the road to ${along(g, life)} a German family's wagon is in the mud to the hubs: four horses straining, the father swearing in his own tongue, the mother praying in it, and six children watching you.`,
    choices: [
      {
        label: "Put your shoulder to the wheel",
        tip: "Fighting (strength): out in an hour; they feed you (−4 stress, +1 renown). Fail: you're in the mud too.",
        check: { skill: "fighting", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: -4, renown: 1 } : { stress: 4, health: -2 },
          );
          say(
            g,
            life,
            pass
              ? "Out with a heave and a cheer. Sausage, black bread and a song you didn't understand."
              : "Now there are two of you in the mud, and the wagon hasn't moved.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: "Show them how to lay brush under the wheels",
        tip: "Woodcraft: out without a strain.",
        check: { skill: "woodcraft", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { xp: { woodcraft: 10 }, renown: 0.5 } : { stress: 2 },
          );
          say(
            g,
            life,
            pass
              ? "Brush and poles under the wheels, and she rolled out like a carriage."
              : "The brush sank too.",
          );
        },
      },
      {
        label: "Ride round them",
        tip: "Not your wagon.",
        apply: (g, life) =>
          say(
            g,
            life,
            "You rode round them. The children watched you all the way.",
          ),
      },
    ],
  },
  {
    key: "way-meeting-house",
    pool: "road",
    cooldown: 400,
    when: (g, life) => (colonist(g, life) ? {} : null),
    title: "A silent meeting",
    body: () =>
      "It's First Day, and the road passes a plain Quaker meeting house with its door open. Inside, forty people are sitting in perfect silence, waiting for the Spirit to move someone to speak. Nobody looks round as you stand in the door.",
    choices: [
      {
        label: "Go in and sit with them",
        tip: "An hour of silence: −10 stress, faith.",
        apply: (g, life) => {
          fx(g, life, { stress: -10, xp: { faith: 8 } });
          say(
            g,
            life,
            "An hour of silence. Then an old woman stood and said one sentence, and sat down. You've thought about it since.",
            "good",
          );
        },
      },
      {
        label: "Ride on",
        tip: "The road's long.",
        apply: (g, life) =>
          say(g, life, "You rode on. The silence followed you a mile or so."),
      },
    ],
  },
  {
    key: "way-strangers-fire",
    pool: "road",
    cooldown: 400,
    when: (g, life) => (adult(g, life) ? {} : null),
    title: "Strangers at your fire",
    body: () =>
      "Two men come out of the dark to your campfire: hunters, they say, though their rifles are very clean, and they'd be glad to share your fire and whatever's in the pot.",
    choices: [
      {
        label: "Share, and sleep light",
        tip: "Stealth (watchfulness): good company and news. Fail: they're gone at dawn with your purse's worth of goods (−3 coins).",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass
              ? { stress: -3, xp: { persuasion: 6 } }
              : { coins: -3, stress: 5 },
          );
          say(
            g,
            life,
            pass
              ? "Good company, better stories, and in the morning they were gone with nothing of yours."
              : "In the morning they were gone, with the better half of your kit.",
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "Tell them to find their own fire",
        tip: "Persuasion (with a hand on your gun): they go.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { stress: 2 } : { health: -8, coins: -2 },
            "strangers on the road",
          );
          say(
            g,
            life,
            pass
              ? "They went, with a look. You slept with one eye open."
              : "They didn't go.",
            pass ? undefined : "bad",
          );
        },
      },
    ],
  },
  // ------------------------------------------------ the sea
  {
    key: "voy-flying-fish",
    pool: "sea",
    cooldown: 400,
    weight: 2,
    when: (g, life) => (southern(g, life) ? {} : null),
    title: "Flying fish",
    body: () =>
      "In the warm water south of the islands the flying fish come out of the waves in silver flocks, skimming yards over the sea, and in the night a dozen of them land on deck, flapping, and the cook is delighted.",
    choices: [
      {
        label: "Fry them for breakfast",
        tip: "−6 stress, +2 health.",
        apply: (g, life) => {
          fx(g, life, { stress: -6, health: 2 });
          say(
            g,
            life,
            "Fried in butter with ship's biscuit. The best breakfast of the voyage.",
            "good",
          );
        },
      },
      {
        label: "Dry one for a curiosity",
        tip: "Letters; a curiosity for your cabinet.",
        apply: (g, life) => {
          fx(g, life, { xp: { letters: 6 } });
          say(
            g,
            life,
            "Spread and dried, wings and all. It'll astonish people at home.",
          );
        },
      },
    ],
  },
  {
    key: "voy-serpent",
    pool: "sea",
    cooldown: 400,
    title: "A sea serpent",
    body: () =>
      "The whole forenoon watch swears they saw it: a great dark length rising and falling off the larboard quarter, a head like a horse's, a mane, and an eye that looked at them. The captain wants it out of the log. The crew want it in.",
    choices: [
      {
        label: "Swear you saw it too",
        tip: "+0.5 renown in every tavern you tell it in.",
        apply: (g, life) => {
          fx(g, life, { renown: 0.5, stress: -2 });
          say(
            g,
            life,
            "You saw it too, now you think of it. It gets longer every time you tell it.",
          );
        },
      },
      {
        label: "Say it was a line of porpoises",
        tip: "Seamanship: the captain's good opinion.",
        check: { skill: "seamanship", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { seamanship: pass ? 10 : 4 } });
          say(
            g,
            life,
            pass
              ? "Porpoises, in line, you said. The captain gave you a glass of his port."
              : "The crew didn't speak to you for a week.",
          );
        },
      },
    ],
  },
  {
    key: "voy-stowaway",
    pool: "sea",
    cooldown: 400,
    when: (g, life) => (adult(g, life) ? {} : null),
    title: "A stowaway",
    body: () =>
      "A boy of twelve or so has been found in the bread room, black with dirt, three days out: a runaway apprentice, he says, or an orphan, or both. The mate wants to put him ashore at the first island, or overboard, or to work for nothing till he's twenty.",
    choices: [
      {
        label: "Speak for him",
        tip: "Persuasion: he signs on as cabin boy, fairly (+1 renown).",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? { renown: 1, stress: -3 } : { stress: 3 });
          say(
            g,
            life,
            pass
              ? "Cabin boy, at a wage. He follows you about the deck like a dog."
              : "The mate had his way.",
            pass ? "good" : undefined,
          );
        },
      },
      {
        label: costs("Pay his passage", 3),
        tip: "+1.5 renown, and a grateful boy.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          fx(g, life, { coins: -3, renown: 1.5 });
          say(
            g,
            life,
            "Paid in full. He'll never forget it, he says, and you believe him.",
            "good",
          );
        },
      },
      {
        label: "Leave it to the captain",
        tip: "Not your ship.",
        apply: (g, life) =>
          say(g, life, "The captain put him to work. He seemed glad enough."),
      },
    ],
  },
  {
    key: "voy-ship-cat",
    pool: "sea",
    cooldown: 400,
    title: "The ship's cat",
    body: () =>
      "The ship's cat, a scarred tom who has killed every rat between here and Guinea, has decided that your hammock is his, and is in it, and is not getting out.",
    choices: [
      {
        label: "Share",
        tip: "−6 stress; good luck, the sailors say.",
        apply: (g, life) => {
          fx(g, life, { stress: -6 });
          say(
            g,
            life,
            "He sleeps on your chest and purrs like a pump. The sailors say you're lucky now.",
            "good",
          );
        },
      },
      {
        label: "Evict him",
        tip: "Fighting: he goes. Fail: scratches.",
        check: { skill: "fighting", dc: 5 },
        apply: (g, life, _c, pass) => {
          fx(g, life, pass ? {} : { health: -3 }, "a cat");
          say(
            g,
            life,
            pass
              ? "He went, with dignity, and sat where he could watch you all night."
              : "He didn't go.",
          );
        },
      },
    ],
  },
];
