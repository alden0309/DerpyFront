// EVENTS (r21): the guide's words for the round: where things happen (a new
// part of "Things that happen", its table made from the events themselves),
// "Spot on!" at Liar's dice, and a chapter for vingt-et-un, its numbers taken
// from the rules the engine plays by.

import {
  BANK_STANDS,
  CARD_STAKES,
  CARD_STALL_SECONDS,
  MAX_PUNTERS,
} from "../../engine/CardsCore";
import { DICE_EACH } from "../../engine/DiceCore";
import {
  ENTER_CHANCE,
  ENTER_REST,
  PLACE_BOOST,
  ROAD_KEYS,
  SEA_KEYS,
  WHERE,
} from "../../engine/EventPlaces";
import { R21_EVENTS } from "../../engine/EventsR21";
import { R21_MATTERS } from "../../engine/MattersR21";
import { XP_HAND, XP_WEEK } from "../../engine/VingtEtUn";
import type { Chapter } from "./Chapters";

/** The round's events of place, by family: their place, and a few of their titles. */
const PLACE_FAMILIES: [string, string, string][] = [
  [
    "tvn",
    "The tavern",
    "a blind fiddler, the gazette read aloud, arm-wrestling a carter, whist with a man who touches his ear",
  ],
  [
    "hom",
    "Home",
    "supper with nobody in a hurry, a smoking chimney, the neighbour's hens, a kite on a wet day, an old friend with a bottle",
  ],
  [
    "dck",
    "The docks",
    "a sling of casks giving way, a launching, a seaman left ashore, a monkey loose in the rigging, a man in the water",
  ],
  [
    "chu",
    "The church",
    "the fifteenthly of a long sermon, the poor box, the new singing, the banns, the churchyard",
  ],
  [
    "mkt",
    "The market",
    "a horse trader's grey mare, a ballad singer, two women and a cheese, a mountebank, a lost child",
  ],
  [
    "gov",
    "The governor's house",
    "the levee, a clerk who knows things, court day, a petition going round",
  ],
  [
    "fld",
    "The fields",
    "a lark in the morning, a loose bull, hands wanted at harvest, a ploughing match",
  ],
  [
    "wds",
    "The woods",
    "a bee tree, turned round in the woods, the pigeons passing over, ginseng, a rattle in the leaves",
  ],
  [
    "vil",
    "A native town",
    "a guest's welcome, a tail of children, an old man's story of the turtle, the ball game in the meadow",
  ],
  ["cfr", "The council fire", "listening to the council, a string of wampum"],
  [
    "abr",
    "Abroad",
    "a foreign customs officer, another church's service, a goose for bread, a saint's day, strange fruit, a northern winter",
  ],
  [
    "wld",
    "Open country",
    "a night under the stars, wolves at the edge of the firelight, a clear spring",
  ],
];

const count = (fam: string) =>
  R21_EVENTS.filter((e) => e.key.startsWith(`${fam}-`)).length;
const others = () =>
  R21_EVENTS.filter((e) => /^(wsh|prs|apo|frt)-/.test(e.key)).length;

/** "Where things happen", for the chapter on things that happen. */
export function placesSection(): string {
  const rows = PLACE_FAMILIES.map(
    ([f, place, what]) => `| ${place} | ${what} | ${count(f)} |`,
  ).join("\n");
  return `## Where things happen
Every event says where it can come, and comes only there (the ${Object.keys(WHERE).length + ROAD_KEYS.length + SEA_KEYS.length} drawn before this round were each read and tagged):
- **At home or abroad.** What happens with your family, your house and your own town's affairs (a sick child, a quarrel at home, your turn on the watch, the vestry's pews) comes only in your home province. Away from home, you get what happens to a stranger instead.
- **What kind of place.** A colonial town (fifty settlers or more: a tavern and a market), a native town, open country, the road, the sea. A tavern's goings-on need a tavern; a cabin raising needs settlers; the green corn needs a native town.
- **Which places are here.** The docks need a port; home needs a house of yours; the governor's ball needs a governor's house. A scene is always set somewhere that's really there.
- **Your work.** Something at work (the mill's saw, the press, the drill yard) comes only where your work is.
- **Where you are now.** What belongs to a place comes **${PLACE_BOOST} times as readily** while you're in it, and some things come only in the place itself (a card sharp at the tavern, a pickpocket at the market). Going into a place, there's a **1 in ${Math.round(1 / ENTER_CHANCE)}** chance something of the place's own happens there and then (at most once in ${ENTER_REST} days).

| Place | What can happen there (a few of them) | How many |
|---|---|---|
${rows}
| The workshops, the printing house, the apothecary, the fort | apprentices at blows, a broadside wanted, a bleeding for your health, the sutler's tent | ${others()} |

Matters at work have grown too: ${R21_MATTERS.length} more, six to every honest trade (some only on the higher rungs, a foreman's or a master's, some only on the lowest), three more big jobs to every crooked trade, and five more rounds for the watch and the thief-takers.`;
}

/** "Spot on!", for the Liar's dice chapter. */
export const SPOT_SECTION = `## Spot on!
Instead of raising or calling "Liar!", whoever's turn it is may say the bid standing is **exactly** right: **Spot on!** Every cup comes up.
- **Exactly that many** (wild ones counted): you **win back a die**, up to the ${DICE_EACH} you began with. With all ${DICE_EACH}, there's none to win back, but you lose nothing.
- **More or fewer**: you **lose a die**.
- Nobody else gains or loses a die. Either way, **you open the next round**.
- This is the rule of the Spanish and South American game (the calza). In some houses a right call takes a die from everyone else instead; not at this table.
- The picker shows how likely "exactly" is from what you can see (it's never very likely: with ten dice hidden, the likeliest count comes up about 1 time in 4). It's worth saying when the bid looks about right, a raise looks risky, and you have a die to win back. The town's people say it then too.`;

/** The chapter on vingt-et-un. */
export const VINGT_CHAPTER: Chapter = {
  id: "vingtetun",
  part: "people",
  title: "Vingt-et-un",
  line: "Cards against the innkeeper's bank: the nearest to twenty-one without going over.",
  where:
    "The tavern: Things to do › Vingt-et-un… (or sit down at a table there). A table you're sitting at waits at the top of the screen while you step away from it.",
  body: `The French game the English called "vingt-un": the ancestor of blackjack. The **innkeeper keeps the bank** (the house, if there's no innkeeper); up to ${MAX_PUNTERS} **punters**, players and the town's people, each play their own hand against it.

## A hand
- Each punter **stakes** (the table's stake: ${CARD_STAKES.join(", ")} coins a hand). The banker deals **two cards** to each and two to himself, all face down; you see only your own.
- **What the cards count**: an ace one or eleven (whichever is better without going over), a king, queen or knave ten, the rest their pips. A hand with an ace counted as eleven is **soft**: it can't go over on the next card.
- A **natural** (an ace with a ten or a court card) is turned up at once and paid **double**, unless the banker has one too (a stand-off: your stake back). If the **banker** has a natural, he shows it at once and takes every stake but a natural's.
- Then each punter, at their own pace: **A card** (draw another) as often as you dare, or **Content** (stand). Over twenty-one and you're **over**: your cards are turned up and your stake is the bank's at once. At twenty-one you're content without asking.
- When everyone's content or over, the **banker turns his cards up** and draws until he has **${BANK_STANDS} or more** (a soft ${BANK_STANDS} too), and stops.
- **Settling**: banker over twenty-one, he pays everyone still in. Otherwise, more than his count is paid **even money**; less loses; the same is a **stand-off** (your stake back).
- Between hands, **Deal** (your stake on the next) or **Sit this one out**. The hand is dealt when everyone at the table has said.

## The odds on your hand
While you decide, the table shows, from the cards you can't see (the deck less yours and any turned up):
- **A card**: how likely the next card takes you over;
- **Content at your count**: how likely the banker goes over or stops short of you, ties you, or beats you.
These are worked out card by card, the same way the town's people reckon (it's how they decide). As a rule: draw on eleven or less; on twelve to sixteen it's close (the odds say which way); stand on seventeen or more.

## The cards
Period cards, as the colonies had them from France and England: no numbers in the corners (cards had none until the next century), square corners, plain backs, and full-length court figures named as the Paris pattern named them: the kings David, Charles, César and Alexandre; the queens Pallas, Judic, Rachel and Argine; the knaves Hogier, La Hire, Hector and Lancelot.

## Who sits in
Open a table: choose the stake and ask anyone in the tavern. The town's people decide at once, with their reasons, much as at the dice: their means against the stake, what they think of you, their nature (a drunkard never says no; the greedy think they can beat the bank; the shrewd can count; the craven and the diligent hold back; a zealot calls cards the devil's picture book) and their calling (a minister doesn't play; the innkeeper keeps the bank). Each comes with money for the evening and stays a while: until it's gone, or they've had enough.
- Other players get an invitation (left unanswered, it's a no), or sit down on their own.
- **Your cards are yours alone**: nobody else's game is sent your cards until they're turned up, nor the banker's until he plays, nor the deck, ever.
- **Nobody can hold up the table.** In company, a player has ${CARD_STALL_SECONDS} seconds to play their hand (or to say whether they're in the next one, while someone's waiting); then the table plays it for them by the town's sense (a card under fifteen, content from fifteen), or sits them out. Twice sat out, they're stood up from the table.
- Alone, the world holds still while you sit at the table.
- A table left without a deal for three days is put away. The bank won't deal to a debtor; a drunkard plays on tick.

## What it comes to
- What you win or lose, hand by hand (the table shows each punter up or down).
- A little **Trade** experience (reckoning the odds): ${XP_HAND} a hand, ${XP_WEEK} a week at most. A hand won eases the mind; a stake that's a fifth of your purse, lost, doesn't.
- The innkeeper remembers a winner who broke his bank (twenty or more up), and a good customer.
- The house has a small edge: punters act first, and a punter who goes over loses even if the banker goes over afterwards.

> Tip: On twelve to sixteen, look at the two odds side by side: if going over is less likely than the banker beating you, take a card.`,
  glossary: [
    [
      "Vingt-et-un",
      "Cards against the innkeeper's bank: draw or stand; the nearest to twenty-one without going over wins.",
      "vingtetun",
    ],
    [
      "Natural",
      "At vingt-et-un, an ace with a ten or a court card in the first two cards: paid double.",
      "vingtetun",
    ],
    [
      "Stand-off",
      "At vingt-et-un, a tie with the banker: your stake back.",
      "vingtetun",
    ],
  ],
};
