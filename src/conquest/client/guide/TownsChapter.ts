// TOWNS (r17): the How to Play's chapter on a town's people and its public
// works: newcomers as settlers come, nobody stuck with no one to marry,
// what becomes of a town's places and people when it changes hands, and
// the town's own government voting, paying for and building its works. Its
// tables are made from the engine's own (Newcomers, TownsCore, WorksCore,
// Works, Towns), so they can't drift from what the game does.

import {
  ARRIVALS,
  DRIFT_IN,
  dryDays,
  HOUSEHOLDS,
  LEAVE_UNDER,
  MARRYING_AGES,
  SHORT_BOOST,
  turnoverOf,
} from "../../engine/TownsCore";
import {
  LOST_REST,
  MAX_OPEN,
  NPC_BRINGS,
  PLEDGES,
  REPAIR,
  SUBS,
  TOWN_WORKS,
  VOTE,
  WORK_KEYS,
} from "../../engine/WorksCore";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)}`;
const sg = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 10) / 10}`;

const KIND_WORDS: Record<string, string> = {
  family: "A family (a tradesman's or a farmer's, with children)",
  daughters: "A family with a grown daughter (or two)",
  sons: "A family with a grown son",
  couple: "A young couple",
  man: "A single man (a journeyman, a servant, a sailor come ashore)",
  woman: "A single woman (in service, a seamstress, come to kin)",
  widow: "A widow, with her children",
  widower: "A widower, with his children",
  note: "A person of note and his family",
};

/** Who comes, and how often, from the table the arrivals are drawn from. */
function arrivalsTable(): string {
  const col = ARRIVALS.colony;
  const nat = ARRIVALS.native;
  const sum = (t: Record<string, number | undefined>) =>
    Object.values(t).reduce((m: number, v) => m + (v ?? 0), 0);
  const tc = sum(col);
  const tn = sum(nat);
  const keys = Object.keys(KIND_WORDS);
  return `| Who comes | A colonial town, in 100 | A native town, in 100 |
|---|---|---|
${keys
  .map(
    (k) =>
      `| ${KIND_WORDS[k]} | ${col[k as keyof typeof col] ? Math.round(((col[k as keyof typeof col] ?? 0) / tc) * 100) : "–"} | ${nat[k as keyof typeof nat] ? Math.round(((nat[k as keyof typeof nat] ?? 0) / tn) * 100) : "–"} |`,
  )
  .join("\n")}`;
}

/** Every work, from the table the votes, costs and buildings are reckoned from. */
function worksTable(): string {
  const rows = WORK_KEYS.map((k) => {
    const d = TOWN_WORKS[k];
    const needs = [
      d.coast ? "on the coast" : "",
      d.folk ? `${d.folk} settlers` : "",
      k === "lighthouse" ? "docks" : "",
      k === "school" ? "and a church (or 400 settlers)" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `| ${d.name} | ${d.native ? "native" : "colonial"} | ${d.cost} (a repair ${Math.round(d.cost * REPAIR.cost)}) | ${d.months} (${Math.max(1, Math.ceil(d.months * REPAIR.time))}) | ${needs || "–"} | ${d.does} |`;
  });
  return `| The work | A town | Coins (a repair) | Months (a repair) | Needs | What it does |
|---|---|---|---|---|---|
${rows.join("\n")}`;
}

/** How a member leans, from VOTE (the table each vote is rolled from). */
function voteTable(): string {
  const V = VOTE;
  return `| What sways a member | Points |
|---|---|
| Their interest wants the work (the merchants a wharf, the clergy a church; in a native town, the post's own: the war captain a palisade) | ${sg(V.interest)} |
| Their interest is against it (the merchants a fort, the planters a lighthouse) | ${sg(-V.interest)} |
| Their party wants it, or is against it | ${sg(V.interest / 2)} / ${sg(-V.interest / 2)} |
| It repairs what was ruined | ${sg(V.repair)} |
| Petitioned for by someone who doesn't sit | ${sg(V.petition)} |
| What they think of whoever brought it | a point for each ${V.opinionPer} of opinion, up to ${V.opinionCap} either way |
| The levy: a point for each ${V.levyPer} coins on each hundred of the town's people | up to ${sg(-V.levyCap)} |
| The country party, against any new rate; a rich member, who pays more of it | ${sg(V.country)}; ${sg(V.rich)} |
| The mover puts money down | a point for each ${V.pledgePer} coins, up to ${sg(V.pledgeCap)} |
| The town is restless (unrest 50 or more) | ${sg(V.restless)} |
| A war on: a fort or a palisade; anything else | ${sg(V.war)}; ${sg(V.warOther)} |
| Of their own mind | up to ${V.mind} either way |

A member's chance of voting aye is an even chance and ${pct(V.step)} in 100 for each point (never below ${pct(V.floor)} or above ${pct(V.ceil)}). A player who sits votes for themselves; one who hasn't voted by the sitting stands aside.`;
}

export const TOWNS_CHAPTER: Chapter = {
  id: "towns",
  part: "power",
  title: "The town: its people and its works",
  line: "Newcomers as a town grows, someone to marry, what becomes of a town that's taken, and the town's own government voting its public works.",
  where:
    "Society › Town (the town's body and what's before it, works to put or petition for, the subscription, ruins, who's lately come); Here (a town's ruins); a person's card (where a newcomer came from).",
  body: `## A town's people grow with it
A town has its posts (the innkeeper, the minister, the merchant, the sergeant...), and now its other households too: families, single men and women, widows and widowers, servants, tradesmen, and now and then a person of note. They're the people you meet, hire, befriend and marry.
- **How many**: a colonial town has room for one household for each **${HOUSEHOLDS.per} settlers** (at least ${HOUSEHOLDS.min}, at most ${HOUSEHOLDS.max}); a native town one for each **${HOUSEHOLDS.nativePer}** of its people (at most ${HOUSEHOLDS.nativeMax}). The posts are fourteen at most, as before.
- **When they come**: one household for each ${HOUSEHOLDS.per} settlers a town grows by (immigrant ships land at the colony's main port); a town short of households sees one come about ${pct(DRIFT_IN)} times in 100 a month for each it's short; a full town still sees comings and goings (a household a month ${pct(turnoverOf(3))} times in 100 in a town of 300, ${pct(turnoverOf(HOUSEHOLDS.max))} in a great town), and when it has ${HOUSEHOLDS.over} more than it holds, one that's been there ${Math.round(HOUSEHOLDS.stay / 365)} years or more moves on.
- **From where**: a port's ships (Bristol, London, Plymouth; Cádiz, Seville, the Canaries; La Rochelle, Rouen; Amsterdam, the Texel; Gothenburg; Lisbon), or down the road from another town of the colony. A native town takes in kin from the nation's other towns.
- **Who comes**:

${arrivalsTable()}

- **Households of their own.** A child of the town who marries and has children keeps house of their own, so the grandchildren belong to the town too.
- **Widows keep house.** When someone who held a post dies, the widow (or widower) and the children stay in the town.
- **A stranger for a year.** A newcomer isn't married off by the town's own for a year: there's time to court them.
- **The news**: each arrival is told in the journal of those who live there ("A ship from Cádiz: the Herreras, a cooper's family, with their daughters Isabel (19) and Juana (17).") and listed on Society › Town; their card says where they came from.

## Nobody is stuck
A town that has had nobody free to marry of a sex (unmarried, ${MARRYING_AGES.w[0]} to ${MARRYING_AGES.w[1]} for women and ${MARRYING_AGES.m[0]} to ${MARRYING_AGES.m[1]} for men, not promised, not bound) for **a year or two** (${Math.round(dryDays(0, true) / 30)} months to two years, by the town) draws someone through ordinary life, in this order: a grown child of the town setting up house; a widow or a niece come from another town of the colony to kin here (never the last one there); a household off a ship or down the road that brings one. A town short of one sex sees households that bring them ${SHORT_BOOST} times as often. The same holds for you: living at home with nobody of your own people you could court, someone comes within a year or two.

## When a town changes hands
- **Its places are remembered.** What stood (the wharf, the church, the fort, the court-house, and works of the town's own) and is gone now is a **ruin**: burned, if the town was laid waste (warriors burn a colony they take: every building loses a level), or left to rot, if a peace handed it over and the settlers fled. Ruins show on Society › Town and on the province's page, and can be repaired by vote for **half the cost** in **three fifths of the time**.
- **A native nation keeps a port's landing**: the beach and trading place where canoes put in and traders' boats anchor. It serves as the town's docks (**The landing**): ships call there, and a colonist can take passage away. If the wharf was burned in the taking, the council fire can vote to clear a landing again, cheaply. When colonists take the town back, the landing is their docks until they repair the old wharf.
- **Its people**: when a native nation takes a colonial town and the settlers flee, the colonists go with them (all but a player's own family and friends), and the nation's people take up the town's posts. Under a new crown, about ${pct(LEAVE_UNDER.crown)} in 100 of the old crown's households leave rather than stay; the posts stay. Works before the town's body, carried or building, lapse.

## The town's body
Each town's public works are voted by the body that really sat there:

| Where | The body | Who sits | What it raises |
|---|---|---|---|
| Virginia, Maryland and the other English colonies | the county court (the vestry for a church) | the justices, with the sheriff and the county's officers (the churchwardens and vestrymen) | a county levy (a parish levy) |
| New England (the puritan colonies) | the town meeting | the selectmen and the town's freeholders (a player with property in the town, a man of 21, among them) | a town rate |
| A Spanish town | the cabildo | the alcaldes, the regidores and the alguacil | a derrama |
| A Portuguese town | the câmara | the juízes and the vereadores | a town levy |
| A French town | the habitants' assembly | the habitants, called by the captain of militia, with the syndic | a corvée and a levy |
| A Dutch town | the burgomasters and schepens | the burgomasters, the schepens and the schout | a burgher levy |
| A Swedish town | the court | the commander's court and the freemen | a levy on the freemen |
| A native town | the council fire | the sachem, the war captain, the speaker, the clan mothers and the elders | the town's own labour and gifts |

Its members are the holders of the county's offices (Society › Office), and as many of the town's chief householders as make it up (3; 7 at a town meeting; 5 at a council fire). **Hold a county office and you sit on it**: you put works to it and vote. Anyone else of the town **petitions** it.

## The works

${worksTable()}

## Putting a work, and the vote
- **Society › Town › Put a work** (or **Petition**): choose a work. The panel shows what it is, a pledge of your own (${PLEDGES.filter(
    (x) => x,
  )
    .map((x) => x)
    .join(
      ", ",
    )} coins, paid only if it carries), and **the odds as they'd stand**, from the same numbers the sitting rolls. The button says what you pledge.
- **The body sits on the first of the month**, at least two weeks after a work is put. No more than ${MAX_OPEN} works before it at once; one thrown out can't be brought again for ${Math.round(LOST_REST / 30)} months.
- **How the members lean** (each with their reasons, on the work's card):

${voteTable()}

- **More ayes than noes carries it**; a tie throws it out. The result is news in the town ("The cabildo sat on a wharf at St. Augustine: carried, 4 to 1 (Diego de Avilés: the consulado want a wharf…)").

## Paying for it
- **The levy** raises up to half the cost, as the town can bear it (about a coin for each 30 settlers). It makes the town a little more restless for a year (1 to 5 unrest).
- **The subscription** raises the rest. The town's people of means put down a share of their means when it carries (a member who voted aye ${pct(SUBS.aye)} in 100, others ${pct(SUBS.other)}), and ${pct(SUBS.drip)} in 100 of that again each month. You can **subscribe** 5, 10, 25 or the rest (the sum's on the button): it's in your month's books ("Subscribed: a wharf at St. Augustine"), the members think the better of you, and it brings a little renown. If it isn't subscribed in ${Math.round(SUBS.days / 30)} months, a second levy raises the rest.
- When it's subscribed in full, **work begins**. Society › Town shows its progress and when it should be done. Nothing is built while the town is held by an enemy.

## When it stands
A wharf brings the docks back (passages by sea, ships' work, boats); a church, a fort or a court-house its place; a market house, a road and bridge or a warehouse the town's trade; a lighthouse more ships; a schoolhouse lets a town of any size keep its school (the Latin school too); a council house calms a native town. Whoever brought it has renown, and a line in their story; for an office holder it's something **delivered** (their favour holds).

## When nobody brings it
The town's own members bring a ruin's repair themselves (about ${Math.round(NPC_BRINGS.ruin * 100)} times in 100 a month, so within a year or so), and now and then a wharf or a church a town of 300 lacks. Only in towns someone has lived in.`,
  glossary: [
    [
      "The town's body",
      "Whoever votes a town's public works: the county court, the vestry, the town meeting, the cabildo, the habitants' assembly, the council fire.",
      "towns",
    ],
    [
      "Levy",
      "What a town raises from its people toward a work it voted (up to half its cost); a little unrest for a year.",
      "towns",
    ],
    [
      "Subscription",
      "What the town's people of means, and players, pay toward a work on top of the levy.",
      "towns",
    ],
    [
      "Ruins",
      "What stood in a town and was burned or left to rot when it was taken: repaired by vote for half the cost.",
      "towns",
    ],
    [
      "Newcomers",
      "Households come to a town by ship or road as it grows; in a native town, kin from the nation's other towns.",
      "towns",
    ],
    [
      "The landing",
      "A native town's docks: the beach and trading place where canoes put in and traders' ships call.",
      "towns",
    ],
  ],
};
