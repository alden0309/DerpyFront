// DLC (r21): the How to Play's chapters on the Derp Store's items for
// Conquest: the 1776 campaign (the start, the war's chronology, sides,
// commissions, battles, spying, the peace), Legends (how a trail goes, every
// legend and its odds, the sacred places and why nothing's taken from them,
// the Fountain of Youth) and the map styles. Every table is made from the
// engine's own (Campaign1776.ts, Campaign1776Events.ts, LegendsData.ts), so
// they can't drift.

import { MAP_STYLE_NAMES, MAP_STYLES } from "../../DlcIds";
import {
  beatDate,
  BEATS,
  COMMISSION,
  SPY,
  TURNCOAT,
} from "../../engine/Campaign1776";
import { BATTLE } from "../../engine/Campaign1776Events";
import { KEEP } from "../../engine/LegendEvents";
import {
  FOUNTAIN,
  LEGEND_RULES,
  LEGENDS,
  type LegendOutcome,
} from "../../engine/LegendsData";
import { SKILL_NAMES } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function chronology(): string {
  return `| When | What |
|---|---|
${BEATS.map((b) => `| ${beatDate(b)} | **${b.title}**${b.battle ? " (a battle)" : ""} |`).join("\n")}`;
}

function battleTable(): string {
  const L = BATTLE.line;
  const D = BATTLE.lead;
  const B = BATTLE.back;
  return `| How you fight | The check | Renown (passed / failed) | Wounded | Killed |
|---|---|---|---|---|
| **Hold your place in the line** | Fighting against ${L.dc} | +${L.renown[0]} / +${L.renown[1]} | ${pct(L.wound[0])} passed, ${pct(L.wound[1])} failed | ${pct(L.death)} |
| **Lead the men forward** | Leadership against ${D.dc} | +${D.renown[0]} / +${D.renown[1]} | ${pct(D.wound[0])} passed, ${pct(D.wound[1])} failed | ${pct(D.death)} |
| **Keep your head down** | none | +${B.renown} | ${pct(B.wound)} | ${pct(B.death)} |

On the winning side, renown +${BATTLE.won} more. A wound costs ${BATTLE.wound[0]} to ${BATTLE.wound[1]} health. Leading passed may win you promotion (${pct(D.promote)}).`;
}

function outcomeWords(o: LegendOutcome): string {
  if (o.keep)
    return "learned and kept (renown, and later you're asked to speak for it)";
  if (o.waters) return "something more than water (see below)";
  const bits: string[] = [];
  if (o.coins) bits.push(`${o.coins[0]} to ${o.coins[1]} coins`);
  if (o.renown) bits.push(`renown +${o.renown}`);
  if (o.health) bits.push(`health ${o.health > 0 ? "+" : ""}${o.health}`);
  return bits.join(", ");
}

function legendsTable(): string {
  return `| Legend | Heard of from | Its trail (skill against difficulty, coins a try) | At its end |
|---|---|---|---|
${LEGENDS.map(
  (d) =>
    `| **${d.name}**${d.kind === "sacred" ? " (a sacred place)" : ""} | ${d.from ? `${d.from}` : "any year"} | ${d.steps
      .map(
        (st) =>
          `${st.title}: ${SKILL_NAMES[st.skill].toLowerCase()} ${st.dc}${st.cost ? `, ${st.cost}` : ""}`,
      )
      .join("; ")} | ${d.outcomes
      .map((o) => `${chanceWords(o.chance)}: ${outcomeWords(o)}`)
      .join(
        "; ",
      )}${d.fever ? `; the fever ${chanceWords(d.fever.chance)} (health −${d.fever.health})` : ""} |`,
).join("\n")}`;
}

export const CAMPAIGN_CHAPTER: Chapter = {
  id: "campaign1776",
  part: "world",
  title: "1776: The Revolution",
  line: "A campaign in the Derp Store: the War of Independence from the siege of Boston to the Treaty of Paris, and your part in it.",
  where:
    "The lobby: Begin in 1776 (its owner hosts; anyone can join). In the game: Society › The war.",
  body: `## Who can play it
**1776: The Revolution** is in the Derp Store (Derpy Conquest › Start Dates). Only someone who owns it can **host** a game that begins in 1776, or load one that was saved; **anyone can join** their game for free and play their own character in it. The server checks the host's account, never the browser.

## The world of 1776
The game begins on 1 January 1776. Boston is under siege, the Americans lie before Quebec after their assault failed, and the Continental Congress at Philadelphia is at war with the King without having declared independence. On the map:
- **The United Colonies** (from 4 July 1776, **the United States**): the thirteen colonies, at war with the King since Lexington and Concord. Its assembly is the **Continental Congress**; its head is the President of the Congress, and the council's seats are Congress's officers.
- **British America**: Quebec, Nova Scotia, Newfoundland, the Floridas, the West Indies and the posts of the west, which stayed loyal; and **the British crown**, the King's army in America.
- France, Spain and the Netherlands in their islands and their empires, and the native nations as they stood.

The map keeps its own names for the colonies' first towns (New Amsterdam for New York, Fort Christina for Philadelphia, Massachusetts Bay for Boston): Society › The war lists them by their names of 1776.

## The war follows history
The war's great events come on their dates, as they happened: news for everyone, and what they did to the map (towns taken and given up, the armies and Congress moving, the alliance with France, France, Spain and the Dutch at war with Britain, the peace). The armies of the war are moved by the campaign, not the computer; the rising's own rules (crushed if the capital falls, won in eight years) don't apply. Real people appear only as the record has them: generals and officers named in the news. Nobody real is a character you meet, and nobody's words are invented.

At the **Treaty of Paris** (3 September 1783) Britain recognises the United States, the Floridas go to Spain and Tobago to France, and the west to the Mississippi to the Americans. The game ends on **1 January 1784**.

${chronology()}

## Your side
Everyone of the United Colonies is asked, once, where they stand: **with the patriots**, **with the King**, or **neither**. Change it on Society › The war. Going from one side to the other makes you a turncoat: renown ${TURNCOAT.renown}, and not again within a year. When the war's won, the patriots win renown and the King's friends lose a third of their purse; a loyalist may go to Nova Scotia or England, or stay and hope they forget.

## A commission
On Society › The war, **Ask for a commission** (${COMMISSION.cost} coins for the kit, paid only if they say yes; once a season): a patriot from Congress (where it sits) or at the army's headquarters, a loyalist from the King's commander in a town his army holds. The odds are your leadership against ${COMMISSION.leadershipDc}, more for renown, a soldier's fighting, a gentleman's family or a sergeant's stripes, less for a turncoat; they're shown, with what makes them, before you ask. You're made a lieutenant, or a captain with leadership ${COMMISSION.captain.leadership} and renown ${COMMISSION.captain.renown}. A loyalist may also enlist as a private soldier wherever the King's army holds the town (Work › Find work).

## Battles
A soldier of the Continental Army's main army, or of the King's army, is in its battles as they come: a scene with three ways to fight, each with its odds.

${battleTable()}

Valley Forge's winter, the Sullivan expedition's burning of the Iroquois towns and the army going home at the peace (a land warrant, sold or kept) come as scenes to those they touch.

## Spying
In a town the other side holds, **Spy here** (stealth against ${SPY.dc}; once in ${SPY.rest} days): a report pays ${SPY.pay.patriot} coins from the committee or ${SPY.pay.loyal} from the British, and renown +${SPY.renown}. Failed, you're taken ${pct(SPY.caught)} of the time: bluff (persuasion against ${SPY.bluffDc}), bribe the sergeant (${SPY.bribe} coins, ${pct(SPY.bribeWorks)}), or say nothing and be tried: hanged ${pct(SPY.hanged)}, or held in the provost's prison ${SPY.heldDays} days until you're exchanged. Nobody else sees your reports.

## Privateers
The United States and British America are at war, so their ports send out privateers: sign aboard, or fit out your own (Work › At sea: [[sea|At sea]]).`,
  glossary: [
    [
      "The United Colonies",
      "In the 1776 campaign, the thirteen colonies at war with the King (the United States from 4 July 1776).",
      "campaign1776",
    ],
    [
      "British America",
      "In the 1776 campaign, the colonies that stayed loyal: Quebec, Nova Scotia, the Floridas, the West Indies.",
      "campaign1776",
    ],
  ],
};

export const LEGENDS_CHAPTER: Chapter = {
  id: "legends",
  part: "world",
  title: "Legends",
  line: "In the Derp Store: old American legends to follow, for the bold and the learned, and the native nations' sacred places to learn and keep.",
  where: "Journal › Legends (for whoever owns Legends, in any game).",
  body: `## Who hears of them
**Legends** is in the Derp Store (Derpy Conquest › Add-Ons). It comes to the characters of whoever owns it, in any game, whoever hosts. Everything about your legends is your own: nobody else sees what you've heard or how far you've got.

## Hearing of one
Talk of a legend comes rarely: ${chanceWords(LEGEND_RULES.rumour)} a month (${chanceWords(Math.min(1, LEGEND_RULES.rumour * LEGEND_RULES.region))} in its own country), from ${LEGEND_RULES.age}. Or stand a round at a tavern, the docks or a native town and ask after old stories (${LEGEND_RULES.ask.cost} coin, once in ${LEGEND_RULES.ask.rest} days): ${SKILL_NAMES[LEGEND_RULES.ask.skill].toLowerCase()} against ${LEGEND_RULES.ask.dc}, then ${chanceWords(LEGEND_RULES.ask.then)} it's one worth following. Remember it, and it goes in Journal › Legends.

## Following the trail
Each legend is a trail of clues that need a master's skill, each worked at its own place (an archive at the governor's house, a port's taverns, a people's towns), then a journey to its end. Journal › Legends shows each step: what you do, where, the skill and its difficulty, your odds and the coins a try. Passed, the next step opens after ${LEGEND_RULES.next} days; failed, try again after ${LEGEND_RULES.retry} days. Fail one step ${LEGEND_RULES.tries} times and the trail goes cold. A cold trail, or a legend you've followed to its end, can't be heard of again for ${Math.round(LEGEND_RULES.coldRest / 365)} years.

${legendsTable()}

Most legends were never what they promised, and the game says so: El Dorado's Seven Cities were Zuni towns, Quivira was the Wichita's villages, and Norumbega a native word for a quiet place on a river. The reward is renown, learning and a little trade. Blackbeard's hoard and Swift's mine are the gambles. Once followed to its end, a legend's page says what history knows of it.

## The native nations' sacred places
Kituwah, Cahokia's mounds, the Great Serpent, the Black Hills and Bdote are places to learn about and to protect. Their trail is earning a people's trust (speaking their tongue helps: skill +${LEGEND_RULES.tongue.bonus}), listening through a winter, and walking the place with an elder. You leave nothing and take nothing; there's nothing to dig and nothing to sell. Months later someone means the place harm (a surveyor's chain, a man with a spade), and its people remember your promise: speak for it (persuasion against ${KEEP.speak.dc}), write to the governor (letters against ${KEEP.write.dc}), or pay the treasure-seeker to dig elsewhere (${KEEP.pay} coins). Doing nothing breaks your word.

## The Fountain of Youth
The Fountain is a real spring, and almost always only that: cold, clear water in a blue hole in the limestone, a week's rest, renown, health. In ${chanceWords(LEGENDS.find((d) => d.key === "fountain")?.outcomes.find((o) => o.waters)?.chance ?? 0)} journeys that reach it, the one who drinks carries something away that's never explained: their body's decline begins ${FOUNTAIN.years} years later than it would. Nobody can say whether it was the water, the rest or the faith; nobody can find the spring again, sell it or share it; and the journey into the Florida interior costs coins, a master's woodcraft and a chance of fever. It's rare and uncertain on purpose: a legend that could be farmed wouldn't be one.`,
  glossary: [
    [
      "Legend",
      "An old story worth following (Journal › Legends): clues that need a master's skill, then a journey to its end.",
      "legends",
    ],
  ],
};

export const MAP_STYLES_CHAPTER: Chapter = {
  id: "mapstyles",
  part: "reference",
  title: "Map styles",
  line: "Other looks for the map, from the Derp Store: only you see them, and they change nothing in the game.",
  where: "The menu › Settings › Map style (or the Derp Store's Inventory).",
  body: `## Choosing one
Map styles are in the Derp Store (Derpy Conquest › Map Styles). Once you own one, choose it in the menu's **Settings › Map style**, or in the store's Inventory; the usual chart is always there to go back to. The choice is kept in this browser, and only you see it.

## The styles
${MAP_STYLES.map((k) => `- **${MAP_STYLE_NAMES[k]}**`).join("\n")}

A style is painted into the chart when it's redrawn, as the usual chart is, so the map runs as fast in any of them.

The winter's snow (once the Hard Winter style) is everyone's now, in every style: it comes over the snowy country from late November to early February ([[seasons|The seasons]]).`,
};

/** The chapters, in the order they're listed. */
export const DLC_CHAPTERS = [
  CAMPAIGN_CHAPTER,
  LEGENDS_CHAPTER,
  MAP_STYLES_CHAPTER,
];
