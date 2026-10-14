// LEGACY (r21): the story in chapters, and every character kept on Derp Land.
// STORY (r17): the How to Play's chapters on the story of a life (what goes
// into it, and how it's told) and on your saved games (deleting them, taking
// one off your list, clearing the finished ones). The table of what's told is
// made from the engine's own (StoryCore's STORY_KINDS), so the guide says
// what the story really keeps and how much each weighs.

import { MAX_MILESTONES } from "../../engine/LifeCore";
import { STORY_KINDS } from "../../engine/StoryCore";
import type { Chapter } from "./Chapters";

/** What each kind of moment is, with an example as the story tells it. */
const EXAMPLES: [kind: string, example: string][] = [
  ["born", "Alden Drackley, farmer, 22, at Jamestown"],
  ["married", "Married Mary Hale"],
  ["child", "A son, Thomas, was born"],
  ["loss", "Widowed: your wife Mary died, a fever"],
  ["school", "Thomas entered Harvard College, to read divinity"],
  ["promoted", "Rose to master cooper"],
  ["business", "Set up a store at Jamestown"],
  [
    "company",
    "Drackley & Co.: the cargo of 20 loads of tobacco for London is sold for 640",
  ],
  ["voyage", "Struck a whale with your own iron off Nantucket"],
  ["prize", "The Tartar took the Marie off Cap-Français"],
  ["storm", "Rode out the San Mateo hurricane at Havana"],
  ["wreck", "The Tartar foundered in a hurricane: you came ashore on a spar"],
  ["battle", "Won the battle of Port Royal against France, in command"],
  ["wounded", "Wounded at Port Royal"],
  ["duel", "Won a duel against Tom Fell with pistols"],
  ["fight", "Knocked a loudmouth flat in the tavern at Boston"],
  ["crime", "The chandler's till at Boston: it came off"],
  ["arrest", "Taken up for theft at Boston"],
  ["escape", "Broke out of the gaol at Boston"],
  ["trial", "Tried for slander at Jamestown, and acquitted"],
  ["convicted", "Convicted of theft: a whipping and three months in the gaol"],
  ["office", "Became churchwarden of Jamestown"],
  ["election", "Lost the poll for burgess to Walter Fleet"],
  ["petition", "Carried the house's address against the governor, 6 to 3"],
  ["plot", "Survived an attempt on your life: a knife in the dark"],
  ["freed", "Freed Phillis, by deed"],
  ["find", "Gold in the creeks at the Fall Line: a strike"],
  ["dice", "Won a pot of 48 coins at Liar's dice at Jamestown"],
  ["achievement", "Achievement: A name known"],
  ["home", "Jamestown, your home, was taken by France"],
  ["rising", "The Sons of the Soil rose at Albemarle"],
  ["renown", "Built a mansion at Williamsburg"],
];

const WEIGHT = [
  "",
  "a small thing: several in a year are told in one line",
  "a moment",
  "one of the great moments",
];

function kindsTable(): string {
  const rows = EXAMPLES.filter(([k]) => STORY_KINDS[k]).map(
    ([k, ex]) =>
      `| ${STORY_KINDS[k].name} | ${ex} | ${WEIGHT[STORY_KINDS[k].weight]} |`,
  );
  return `| What | As the story tells it | How it's drawn |
|---|---|---|
${rows.join("\n")}`;
}

export const STORY_CHAPTER: Chapter = {
  id: "story",
  part: "world",
  title: "Your story: what a life is remembered for",
  line: "Everything memorable your line did or went through: told in chapters, a life to each, or year by year, with the maps of the roads travelled.",
  where:
    "Journal › The story (the story so far); the menu › Your story so far; and at the end, in 1776.",
  body: `## What goes into it
Everything worth the telling, as it happens:
- **your family**: births, marriages, children, and losing a husband, wife or child; your children's **schooling**, apprenticeships and **degrees**;
- **fights**: brawls, **duels** (won, lost, fired into the air), **battles** and **sieges** carried by your army, wounds;
- **the law**: being **taken up**, breaking out of the gaol, **trials** (acquitted, or a case you brought), convictions, a big job that came off;
- **the sea**: cruises and voyages, **prizes** taken, **hurricanes** ridden out, being wrecked or taken;
- **money**: a **business** or partnership begun or sold, your own master at last, a **trading company** and its great voyages (and the cargoes it lost), strikes and treasure;
- **office**: offices won and given up (or lapsed when a town fell), **polls** won and lost, the governorship, **petitions** and the house's addresses;
- **plots**, yours or against you, **only as far as you know them**: a plot of your own stays in your story alone (nobody else is ever sent it) until it comes out;
- people you **freed**; **tables won at Liar's dice**; your **achievements**; your home taken, freed or burned in a war; and whatever else a cause, a rising or the world brings.

${kindsTable()}

## In chapters
The story opens **in chapters**: a chapter for each life of your line (the first, each heir, a life taken up), written from its moments:
- **how they came into the story** (where, when, as what), their **work and fortune** (every rung they rose to, what they earned and left), their **family** (marriages, children by name, the ones lost), their **wars and quarrels** (battles, sieges, brawls, the law, their home in the wars), their **public life** (offices, polls, portraits, renown), **the sea and the road**, and **how their part ended** (and who carried the family on);
- **the people who mattered**: husband or wife, father or mother, children (the heir marked), friends, rivals, a mentor, a sworn enemy, a patron. Click one to see them;
- **their numbers**: years in the story, age at the end, children, battles, duels, places seen, coins earned, renown at its height; their best skills, health and what they left;
- **a map of their own roads**.

Above the chapters: the line's opening, **its big numbers** (years, lives, places, children, marriages, battles, coins earned, the richest it was, its renown at the height, its score), and **the family's line**: each generation, who they married, their children, and the one who carried it on (gilt). The end, in 1776, tells it in the same chapters.

When a game ends, every player's characters and chronicle are kept on Derp Land: your profile's Derpy Conquest games each have a **Story** page with every character of every line, their stats and their chapters (what only you know of your line stays out of it).

**Year by year** (the button above the story) tells it the other way:

## Year by year
- **Year by year, generation by generation**: each of your line under their own name, in the colour of their road on the map, and each year with its moments in order.
- **An engraving for each kind**, in green for what went well and red for what went badly. A kind of moment the game adds later is told plainly, with a seal and its own words.
- **The great moments are drawn larger**, ringed in gilt: a birth and a marriage, a battle won in command, the governor's chair, a duel to the death, a degree, a galleon taken, a fortune found, a great storm, a ship lost under you, the end.
- **The small things** (a brawl, a table at dice, a big job, a prize, an achievement) are told in one line a year ("3 tables won at Liar's dice"): open it for each.
- **How many of each, all told**, at the top: the battles, duels, prizes, hurricanes, polls and the rest.
- **The map**: the roads travelled, dashed in each generation's colour, home marked, and a number for each moment with a place (gilt for the great ones). Point at a moment to light its pin.

The story so far and the story told in 1776 are the same story: the Journal shows it as it stands, the end tells it whole. A long line keeps its beginnings, its great moments and its endings: when there are more than ${MAX_MILESTONES} moments, the oldest small things go first (they're still counted).`,
};

export const SAVES_CHAPTER: Chapter = {
  id: "saves",
  part: "world",
  title: "Your saved games",
  line: "Picking a game up again, deleting one you began, taking one you joined off your list, and clearing away finished games.",
  where: "The lobby: Your saved games.",
  body: `## Picking up
Signed-in players' games save every few minutes and whenever the game is paused (and with Save now, in the menu). **Your saved games** in the lobby lists them, newest first: **Resume** loads one; **Rejoin** joins one that's running now.

## Deleting a game
- **Delete…** under a game you began asks first ("Delete *The Drackleys, from 1650*? This can't be undone") and then deletes it for everyone who played in it. Only whoever began a game can delete it: the server checks, whatever a browser says.
- **Remove from my list** under a game someone else began takes it off your list only. It stays saved for them and the others, and comes back to your list if you play in it again.
- A game being played right now can't be deleted until everyone has left it. One that's open with nobody in it is closed, and never saved again.

## Finished and old games
**Finished and old games** (folded under your saved games) lists games that have ended, and games saved by an older version of Derpy Conquest (they can't be loaded). Delete them one by one, or **Delete all finished games** at once: the ones you began are deleted, the ones you only joined are taken off your list. A finished game's results stay on the leaderboards.`,
};
