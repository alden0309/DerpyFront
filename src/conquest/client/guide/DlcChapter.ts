// DLC (r21): the How to Play's chapters on the Derp Store's items for
// Conquest: the 1776 campaign (the start, the war's chronology, sides,
// commissions, battles, spying, the peace), Legends (how a trail goes, every
// legend and its odds, the sacred places kept or (CQ24, r24) plundered, the
// Fountain of Youth) and the map styles. Every table is made from the
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
import "../../engine/Campaign1776Later"; // CQ24 (r24): the years after the peace, in BEATS
import { KEEP } from "../../engine/LegendEvents";
import { KEPT_FAITH } from "../../engine/Legends"; // CQ24 (r24)
import {
  FOUNTAIN,
  LEGEND_RULES,
  LEGENDS,
  type LegendOutcome,
} from "../../engine/LegendsData";
import { SKILL_NAMES } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import { PLUNDER, plunderRows, RECKONING } from "../../engine/SacredPlunder"; // CQ24 (r24)
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

/** CQ24 (r24): what a dig at each sacred place may find, from SacredPlunder.ts's table. */
function plunderTable(): string {
  return `| The place | Whose | What a dig may find, once dug unseen |
|---|---|---|
${plunderRows()
  .map(
    ({ def, finds }) =>
      `| **${def.name}** | ${def.people === "oceti" ? "the Lakota and Dakota" : def.people === "illinois" ? "the Illinois nations" : `the ${def.people?.[0].toUpperCase()}${def.people?.slice(1)}`} | ${finds
        .map(
          (f) =>
            `${chanceWords(f.chance)}: ${f.coins[1] > 0 ? `${f.coins[0]} to ${f.coins[1]} coins` : "nothing"}${f.relic ? `, and ${f.relic} kept (renown +${f.renown ?? 0})` : ""}`,
        )
        .join("; ")} |`,
  )
  .join("\n")}`;
}

export const CAMPAIGN_CHAPTER: Chapter = {
  id: "campaign1776",
  part: "world",
  title: "1776: The Revolution",
  line: "A campaign in the Derp Store: the War of Independence from the siege of Boston to the Treaty of Paris, the republic's first years to 1800, and your part in them.",
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

## History, unless you change it
The war's great events come on their dates, as they happened: news for everyone, and what they did to the map (towns taken and given up, the armies and Congress moving, the alliance with France, France, Spain and the Dutch at war with Britain, the peace). The computer is steered to play it as it went: the war's main armies move as they did, the computer's members of Congress vote as their counterparts did, and the computer's own generals keep out of the war's battles. Real people appear only as the record has them: generals, officers and statesmen named in the news. Nobody real is a character you meet, and nobody's words are invented.

**But players can change it.** When you do something big, the world follows what actually happened, and the news says so in a line beginning *History turns*:
- **A battle where a player commands** (the Continental Army, a detachment of it, or the King's) is fought for real, by the game's own battles, and its result stands. Beat the King's main army before New York, and New York doesn't fall.
- **A town a player's army holds** has to be fought for when the King's army comes for it; a town a player's army takes or frees is what it is.
- **The armies of the war, beaten or destroyed** by players, are gone from history's plans: what needed them doesn't happen, and Britain's will to fight goes with them. A great American victory brings France in.
- **Votes in Congress** are divided for real: the **Declaration of Independence** (debated from 7 June 1776), the **Constitution** (from 28 September 1787) and **Jay's Treaty** (from 8 June 1795). Players sitting in Congress are asked how they'll vote (a scene, with how the house leans); enough of them the other way, and it's lost: the Declaration and the Constitution are put again a few months or a year later.
- **A player who governs the United States** decides where Congress sits; a town held for the King by a player's army when the peace comes stays British.

Later history adapts. What needed something that didn't happen waits for it, or never comes (no French alliance without a declaration and a victory; no federal government without the Constitution; the British don't leave a city they never took). If there's no Yorktown, the war goes on, and each year tires Britain more until it makes peace; if players beat the King's armies, the peace comes sooner. If the Continental Army is lost, Congress raises another; if it's lost and Congress's own seat held half a year, the rising is put down. Society › The war lists where history turned.

At the **Treaty of Paris** (3 September 1783) Britain recognises the United States, the Floridas go to Spain and Tobago to France, and the west to the Mississippi to the Americans.

## After the war, to 1800
The world runs on through the republic's first years: the Loyalists gone to Nova Scotia and New Brunswick, the Confederation's troubles and Shays' Rebellion, the Constitution and Washington's government, the Bill of Rights, the war in the Northwest (St. Clair's defeat, Fallen Timbers and the Treaty of Greenville, which gives the Ohio country's south and east to the United States), the Whiskey Rebellion, Jay's Treaty (the British hand over Détroit) and Pinckney's (Spain hands over Natchez), the Haitian Revolution and what it meant for the Caribbean and the slave trade, Spain in Florida and Louisiana, President Adams, the XYZ Affair, the Quasi-War with France (privateers sail from American ports again) and the Alien and Sedition Acts, Congress at New York, Philadelphia and at last the city of Washington, and the election of 1800. The war in the Northwest and the Quasi-War are history's too: the computer's armies don't fight them, but a player's can. The game ends at the **end of 1800**.

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
  line: "In the Derp Store: old American legends to follow, for the bold and the learned, and the native nations' sacred places to keep, or to plunder.",
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
Kituwah, Cahokia's mounds, the Great Serpent, the Black Hills and Bdote can be kept, or plundered. It's your choice, and each road has its own rewards and its own price.

**Keeping faith.** The trail is earning a people's trust (speaking their tongue helps: skill +${LEGEND_RULES.tongue.bonus}), listening through a winter, and walking the place with an elder. You leave nothing and take nothing: renown, and their nation's goodwill toward yours (+${KEPT_FAITH.value} for ${KEPT_FAITH.years} years). Months later someone means the place harm (a surveyor's chain, a man with a spade), and its people remember your promise: speak for it (persuasion against ${KEEP.speak.dc}), write to the governor (letters against ${KEEP.write.dc}), or pay the treasure-seeker to dig elsewhere (${KEEP.pay} coins), and they think the better of you again. Doing nothing breaks your word.

**Plundering.** From the day you hear of a place you can go to it and dig for what's buried there: a digging party costs ${PLUNDER.cost} coins, and getting in and out unseen is ${SKILL_NAMES[PLUNDER.skill].toLowerCase()} against ${PLUNDER.dc}, with +${PLUNDER.known} for each step of their trust you've earned (you know where to dig, and when they're away). Journal › Legends shows every figure before you choose.

${plunderTable()}

Failed, half the time you come away with nothing and unseen (try again after a season), and half the time you're caught: beaten (health −${PLUNDER.hurt}), driven off and never let near the place again, and their nation's opinion of yours ${PLUNDER.tried.value} for ${PLUNDER.tried.years} years.

What follows a dig: the place stays dug, and the world hears of it. Its people's nation thinks worse of yours (${PLUNDER.people.value} for ${PLUNDER.people.years} years, ${PLUNDER.faith.value} more if they'd trusted you, and renown ${PLUNDER.faith.renown}), and so do their allies (${PLUNDER.allies.value}): raids and war come likelier. Those of them who know you remember it (${PLUNDER.person.value}). At home the bold admire the daring and the devout think it shameful (renown +${PLUNDER.renown}). In time their people come for what was taken: give it all back (their anger eases to ${RECKONING.eased.value}), pay amends (${Math.round(RECKONING.pay * 100)}% of what it came to), talk them round (persuasion against ${RECKONING.talk.dc}), stand your ground (fighting against ${RECKONING.fight.dc}), or let them take it (half your purse, at most what it came to, and what you kept). Whoever dug a place is never told of it again; anyone who later walks it with an elder finds the cut still there.

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
