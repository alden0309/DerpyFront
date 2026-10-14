// GOV (r21): the How to Play's chapters on expeditions (the kinds, who goes,
// the odds and the costs, the scenes on the way, grants, raids and their
// answer), the governor's desk (duties, a building programme, native
// affairs, the militia, pardons, the desk's matters) and breaking with the
// crown (the house, the declaration, the war, the sides). Founding's
// widening is in its own chapter's addition (`FOUNDING_R21`). Every table is
// made from the engine's own (ExpedCore.ts, ExpedGrant.ts, GovDesk.ts,
// Revolution.ts, FoundingR21.ts), so they can't drift.

import {
  DC,
  HELP,
  KIND_KEYS,
  KINDS,
  LOSS,
  PARTY,
  PLUNDER,
  RAID,
  REWARD,
  TRADE_BACK,
} from "../../engine/ExpedCore";
import { GRANT } from "../../engine/ExpedGrant";
import { PLANT, SEASONING } from "../../engine/FoundingR21";
import {
  COUNCIL,
  DUTIES,
  LICENCE,
  MUSTERS,
  PROG_EVERY,
  PROGRAMMES,
  RANGERS,
} from "../../engine/GovDesk";
import { SKILL_NAMES } from "../../engine/LifeRules";
import { REV } from "../../engine/Revolution";
import type { ModFx } from "../../engine/Types";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
const in100 = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;

function fx(f: Partial<Record<ModFx, number>>): string {
  const words: Partial<Record<ModFx, string>> = {
    tax: "taxes",
    production: "trade",
    favor: "favour",
    unrest: "unrest",
  };
  const out = (Object.entries(f) as [ModFx, number][])
    .filter(([, v]) => v)
    .map(([k, v]) =>
      k === "tax" || k === "production"
        ? `${words[k]} ${sg(Math.round(v * 100))}%`
        : `${words[k] ?? k} ${sg(v)}`,
    );
  return out.length ? out.join(", ") : "nothing";
}

function kindsTable(): string {
  const rows = KIND_KEYS.map((k) => {
    const d = KINDS[k];
    const r = REWARD[k];
    return `| **${d.name}** | ${SKILL_NAMES[d.skill]} | ${d.dc} | ${d.outfit}${d.treasury ? " (the colony's charge)" : ""} | ${d.minMen} | ${d.work} | +${r.renown[0]} / +${r.renown[1]} | +${r.favour[0]} / +${r.favour[1]} |`;
  });
  return `| Kind | Its work tests | Difficulty | Fitting out (coins) | Least men | Days' work there | Renown (well / poorly) | Favour (well / poorly) |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}`;
}

function dcTable(): string {
  return `| What | Levels |
|---|---|
| Each full ${DC.perKm} km of the way | +1 |
| Mountains, jungle, tundra; desert, forest, marsh, hills | +${DC.terrain.mountains}; +${DC.terrain.forest} |
| Winter when they get there (a raid +1) | +${DC.winter} |
| Fever country | +${DC.fever} |
| Trade and missions: the nation's regard for your colony, a level for each ${DC.regardPer} | ±, by their regard |
| A treaty of trade (trade) | −1 |
| An outpost on a native nation's land; where people live | +${DC.nativeLand}; +1 |
| A raid: the town's warriors against your men (a level for each half again) | ${sg(DC.raidMin)} to ${sg(DC.raidMax)} |
| A port on open coast (the town to make as well) | +${DC.openCoast} |`;
}

function helpTable(): string {
  return `| What | Levels |
|---|---|
| The leader's own skill at it | its level |
| The best of the party at it (your people who go, the players with it) | a third of what they know beyond the leader, to +${HELP.companionMax} |
| A raid, an outpost, a port: men | +1 for each ${HELP.menEvery} beyond ${HELP.menEvery}, to +${HELP.menMax} |
| Trade, a mission: a big armed party | −1 beyond ${HELP.crowdFrom} men, −1 more each ${HELP.crowdEvery}, to −${HELP.crowdMax} |
| Discovery, a river: porters and canoemen (6 or more men) | +${HELP.porters} |
| What happened on the way (guides gained, the men losing heart) | ±1 each |`;
}

function grantTable(): string {
  return `| What | In 100 |
|---|---|
| A governor is careful with the treasury | ${in100(GRANT.base)} |
| A full treasury (four times the ask); a thin one (under twice) | ${in100(GRANT.deep)}; ${in100(GRANT.thin)} |
| What the kind is worth to the colony | ${KIND_KEYS.filter(
    (k) => GRANT.worth[k],
  )
    .map((k) => `${KINDS[k].name.toLowerCase()} ${in100(GRANT.worth[k])}`)
    .join(", ")} |
| A mission, to a zealous governor | ${in100(GRANT.zealousMission)} |
| A raid: at war with them; in peacetime (a treaty in the way, more); a hard man; a just man | ${in100(GRANT.raidWar)}; ${in100(GRANT.raidPeace)} (${in100(GRANT.raidTreaty)}); ${in100(GRANT.raidHard)}; ${in100(-GRANT.raidHard)} |
| What he thinks of you | a point in ${1 / GRANT.opinionPer} |
| Your renown; your favour | a point in ${1 / GRANT.renownPer} (to ${in100(GRANT.renownMax)}); a point in ${1 / GRANT.favourPer} (to ${in100(GRANT.favourMax)}) |
| The party's odds at the work | ${in100(GRANT.oddsPer / 5)} for each 10 in 100 above even (to ±${Math.round(GRANT.oddsMax * 100)}) |
| Asked by letter | ${in100(GRANT.letter)} |
| A big ask: each 10 gold over ${GRANT.bigFrom} | ${in100(-GRANT.bigPer)} (to ${in100(-GRANT.bigMax)}) |
| Never above, nor below | ${Math.round(GRANT.max * 100)}, ${Math.round(GRANT.min * 100)} |`;
}

const kindsList = () =>
  KIND_KEYS.map(
    (k) => `- **${KINDS[k].name}**: ${KINDS[k].text} *${KINDS[k].gives}*`,
  ).join("\n");

export const EXPEDITIONS_CHAPTER: Chapter = {
  id: "expeditions",
  part: "living",
  title: "Expeditions",
  line: "Into the wilds: discovery, a river, trade, an outpost, a mission, a raid, a port; alone, with companions, by a man you hire, or with friends.",
  where:
    "Work › Expeditions. A governor: the same page, at the treasury's charge; petitions for grants there and on Society › Office.",
  body: `## The kinds
${kindsList()}

${kindsTable()}

## Getting one up
On **Work › Expeditions**, from any town of your own colony:
1. **What kind**, and **where**: the places it could go, nearest first, with the days there (on foot, and by canoe across water).
2. **Who leads**: **you** (the scenes on the way are yours), **one of your people** (a guide, a sword, an officer...), or **a man of the town** who knows the country (a hunter, a trader, an old soldier, a minister for a mission), who goes for you for a fee (${PARTY.fee} coins and ${PARTY.feePer} a level of his skill) and decides for himself on the way. A governor may send someone of the court, at the treasury's charge.
3. **The party**: [[expeditions|hands]] hired for the trip (${PARTY.hand} coins each, ${PARTY.ranger} a ranger for a raid), your own people who go (their wages go on), and for a trade, the goods (${PARTY.stakeMin} to ${PARTY.stakeMax} coins of cloth, kettles and knives). Everyone eats ${PARTY.food} a day there and back.
4. **Others along**: get it up first, then ask other players. They're asked in a scene; those who come must be at the town when it sets out. They share what it brings, and half the renown.
5. **A grant**: get it up first, then ask the governor for the treasury's gold (below).
6. **Set out**. Before you do, the page shows the odds at the far end (each outcome with its chance and what it brings), the cost on the button, the days, and whether your work will wait for you (a place you're away from six weeks is lost: ask leave first).

The party **travels on the map**, hop by hop, carrying you and the other players with it. Halfway out the country throws something at it, and at the far end the work is done; on the way home something may happen again. Leave it at any stop on the way (Halt), unless you lead it.

## The odds at the far end
The leader's skill in the kind's own work, helped by the party, against the country's difficulty: the same as any skill check (60 in 100 at even, 7 a level either way, never below 8 nor above 95). Its first way of going about the work is exactly the odds the planner showed; the others shift it.

**The party's skill:**
${helpTable()}

**The country's difficulty**, on top of the kind's own:
${dcTable()}

Then three ways it can go: **it goes well** (the odds), **a poor showing** (half what's left: half of what it brings), or **it fails** (the rest: ${pct(LOSS.men[0])} to ${pct(LOSS.men[1])} of the men lost; the leader hurt ${pct(LOSS.hurt.other)} of the time, ${pct(LOSS.hurt.raid)} on a raid, by ${LOSS.hurtBy[0]} to ${LOSS.hurtBy[1]} health; one of the computer's leaders may die of it).

**Trade** brings back ${TRADE_BACK.won}× the goods on a good showing, ${TRADE_BACK.half}× on a poor one, ${TRADE_BACK.failed}× if it fails. **A raid's plunder** is a coin for each ${PLUNDER.per} of the town's people (${PLUNDER.min} to ${PLUNDER.max}), ${pct(PLUNDER.half)} of it on a poor showing. **A discovery** surveys the country two rings round about (one on a poor showing), and rich land found is worth more renown and favour; **a river** is followed up to eight places along its course (four). The maps go to everyone of your colony when the party's home.

## On the way
White water, fever in the camp, warriors on the trail, lost, winter, short of stores, deserters, a guide who offers himself, a strange find in the woods: each fits the country and the season it happens in, with a safe way through (days lost) and bolder ones (a check, its odds on the button, the party's best at it helping). The party waits while its leader decides.

## A grant from the treasury
Ask the colony's governor for gold toward it: **in person at the capital** (an answer in ${GRANT.inPerson} days) or **by letter** (${GRANT.byLetter} days). A player who governs answers for himself (all, half, or none); the computer's governor answers at these odds:
${grantTable()}

A grant is the governor's **leave** too. What isn't spent goes back to the treasury; turned down, not again for ${GRANT.rest} days.

## A raid, and its answer
Raids on native towns were the frontier's oldest way of war, and the cause of most of its wars. Here they're told as history had them, without gore: the town falls at dawn, its people flee into the woods, its stores are carried off and its fields burned.
- **The town**: ruined (war damage +${pct(RAID.townRuin)}), and ${pct(RAID.townFled)} of its people gone to their kin.
- **The nation**: its regard for your colony ${sg(RAID.regard)} (${sg(RAID.regardHalf)} on a poor showing, ${sg(RAID.regardFailed)} if it's beaten off), for ${RAID.years} years. In peacetime, it **takes up the hatchet at once** ${pct(RAID.war)} of the time (+${pct(RAID.warStrong)} for a strong nation); otherwise, ${pct(RAID.reprisal)} of the time, **a war party falls on your frontier** ${RAID.reprisalDays[0]} to ${RAID.reprisalDays[1]} days later: the county nearest the town ruined (+${pct(RAID.ruin)}), its unrest +${RAID.unrest}, ${pct(RAID.settlersLost)} of its settlers lost, and everyone living there in a scene. Ranging companies meet and turn it (${pct(RAID.rangerTurns)} each, to ${pct(RAID.rangerMax)}).
- **The colony**: the frontier fears the answer (unrest +${RAID.fear} for a year). In peacetime London asks why (favour −2 for a year); a **private raid** the governor never gave leave for costs everyone in it favour ${sg(RAID.privateFavour)} and the colony's law's heat +${RAID.privateHeat}, and the colony favour −3 more.
- **People**: the tolerant and the just of the town think the worse of its leader; the cruel and the soldiers the better.

**Demand tribute** instead (Persuasion): if they pay, half the plunder and less anger; refused, no fight but a grudge (and an answer, half as likely).

> Tip: An ordinary colonist leads a discovery near home at fair odds; a trade wants a trader, a mission a minister, a raid many men. Hire the man who knows the work, take a guide or an interpreter of your own, and don't set out in November.`,
  glossary: [
    [
      "Hands",
      "Woodsmen, porters and boatmen hired for an expedition's trip.",
      "expeditions",
    ],
    [
      "Truck house",
      "A colony's own trading house with the native nations, with fair weights.",
      "governing",
    ],
    [
      "Grant",
      "Gold from the treasury toward an expedition, given by the governor.",
      "expeditions",
    ],
  ],
};

function dutiesTable(): string {
  return `| Duties | What they do | The merchants |
|---|---|---|
${DUTIES.map((d) => `| **${d.name}** | ${fx(d.fx)} | ${d.merchants ? sg(d.merchants) : "as they were"} |`).join("\n")}`;
}

function progTable(): string {
  return `| Programme | Builds | Where | Years |
|---|---|---|---|
${PROGRAMMES.map((p) => `| **${p.name}** | ${p.b === "tradingpost" ? "a trading house" : p.b} | ${p.text.split(":")[0].replace(/\.$/, "")} | ${p.years} |`).join("\n")}`;
}

export const GOVERNING_CHAPTER: Chapter = {
  id: "governing",
  part: "power",
  title: "The governor's desk",
  line: "What a governor decides month by month: duties, building, the native nations, the militia, mercy, and the matters that come to the desk.",
  where: "Society › Office, The governor's desk (when you govern).",
  body: `The old levers are still there (taxes, what goes home to the crown, a building, the militia called out, war and peace, the great laws, public works, the council, and the offices in your gift: the justices, the sheriff and the county lieutenant, to fill or dismiss). Below them, the desk:

## Customs duties
${dutiesTable()}

Once in six months. The colony's merchants and shipmasters remember it.

## A building programme
One at a time: every ${Math.round(PROG_EVERY / 30)} months the treasury pays for the next building where it's wanted (at its usual cost; if it can't, it waits a month).

${progTable()}

## Native affairs
- **A treaty council** with a neighbouring nation (${COUNCIL.gold} gold of presents from the treasury, once a year with each): ask for a covenant of friendship (Persuasion: +15 for ten years if it lands), a treaty of trade (Trade, if they're willing), land on the border (Persuasion, harder: the deed and its price from the treasury), or nothing (+8). At war, offer peace as things stand.
- **License the Indian trade**: every trader licensed and bonded and the weights inspected: the nations +${LICENCE.regard} (renewed each January); ${fx(LICENCE.fx)}.
- **Truck houses**: the building programme above.

## The militia
${MUSTERS.map((m) => (m.gold ? `- **${m.name}**: ${m.gold} gold a month; militia raised come out ${Math.round(m.morale * 100)}% steadier; ${fx(m.fx)}.` : `- **${m.name}**: nothing paid, and nothing changes.`)).join("\n")}
- **Ranging companies** on the frontier (to ${RANGERS.max}, ${RANGERS.gold} gold a month each): a war party coming over the frontier is met and turned ${pct(RAID.rangerTurns)} of the time for each.

## Courts and pardons
Any player in the colony's gaols is listed: **pardon** (out at once, the slate with the colony's law wiped clean; the attorney general thinks you soft) or **commute** (half the time left). Pleas for the mercy of others come to the desk.

## The desk's matters
Every month or two (about six a year) a matter comes to the desk as a scene, each with its own weight to carry: a boundary between two planters, a sloop seized for smuggling, a plea for mercy, envoys with a complaint about the traders, the frontier asking for protection, the smallpox in a ship, a privateer's commission in wartime, a day of fasting, a fire in the town, a place for a councillor's son, squatters beyond the line, the college asking, the house's grievances, pirates off the coast. Left unanswered, each takes its quiet course.

## Expeditions
A governor sends expeditions at the treasury's charge (Work › Expeditions: an outpost, a raid, discovery, opening trade, founding a port), led by himself, someone of the court, or a man of the town; and answers players' petitions for grants ([[expeditions|Expeditions]]).`,
  glossary: [
    [
      "Duties",
      "What the colony's ports charge on goods in and out; the governor sets them.",
      "governing",
    ],
    [
      "Ranging company",
      "Paid woodsmen who patrol the frontier against war parties.",
      "governing",
    ],
  ],
};

export const INDEPENDENCE_CHAPTER: Chapter = {
  id: "independence",
  part: "power",
  title: "Breaking with the crown",
  line: "A governor puts the question to the house; carried, he may declare it; then the crown's armies come.",
  where:
    "Society › Office, Breaking with the crown (when you govern); everyone of the colony chooses a side.",
  body: `## The question
The governor puts it to the house: *that this colony is, and of right ought to be, free*. Once a year. The house debates ${REV.debate} days and divides. Players in the house vote for themselves in a scene; the computer's members lean:

| What | Lean |
|---|---|
| The country party; the court party | ${sg(REV.country)}; ${sg(REV.court)} |
| The colony's own mind: its autonomy above ${REV.autonomyFrom} | a point in ${1 / REV.autonomyPer} |
| The crown's favour below ${REV.favourFrom} | a point in ${1 / REV.favourPer} |
| Each demand of the crown defied lately | ${sg(REV.defied)} |
| The gallows after a rising crushed | ${sg(REV.crushed)} |
| The governor's weight: renown, Persuasion | a point in ${1 / REV.swayRenownPer} (to ${REV.swayRenownMax}); a point in ${1 / REV.swayPersuasionPer} (to ${REV.swayPersuasionMax}) |
| Content or honest; ambitious or brave; craven | ${sg(REV.loyal)}; ${sg(REV.bold)}; ${sg(REV.craven)} |
| His own mind | ±${REV.noise} |

The page shows how they'd divide today. **Lost**, London hears of it: the colony's favour ${sg(REV.lostFavor)} for ${REV.lostYears} years, and a grievance against the governor (a recall is likelier). **Carried** (more for than against), the governor has ${REV.declareWithin} days to declare it.

## Declared
- **War with the crown.** It lands an army of regulars and guns about every ten months; the colony **wins** if it holds out eight years or beats three of them, and is **crushed** if the crown holds its capital half a year (the governor hangs).
- **The colony's generals fight at home**: the computer's armies go at the crown's men on the colony's soil when they're the stronger (no more than ${REV.attackAt} of theirs to one), and otherwise hold the capital. The colony's other wars wait. (An army you command goes where you send it.)
- **The crown's own regiments** already in the colony (its war drafts and fortress garrisons) go over to it at once.
- **Counties may hold for the King**: each has a chance (shown before), and one that holds is the crown's, with a company of its friends under arms, until the patriots take it back. A county with the crown's own fortress garrison holds; ${in100(REV.hold.base)} in 100 to begin with, more where the crown's favour is high (a point in ${1 / REV.hold.favourPer} above ${REV.hold.favourFrom}), among newcomers (${in100(REV.hold.newcomers)}) and in a port (${in100(REV.hold.port)}), less in the capital (${in100(REV.hold.capital)}); between ${Math.round(REV.hold.min * 100)} and ${Math.round(REV.hold.max * 100)}.
- **Everyone of the colony chooses a side** in a scene (and on Society › Office): with the patriots (renown +3 now), with the King (favour +5 now), or neither.

The war's chance is shown as an estimate (the colony's men, its settlers, what the crown can spare, a war in Europe keeping it busy, the regiments that go over, the counties likely to hold): the armies decide it. Tried 24 times from Virginia in 1700, it came out as often as shown (11 won, against 11.8 by the estimate).

## The end
- **Won**: the colony is free and the governor frames its government (Society › Colony: [[founding|A colony of your own]]). Patriots renown +${REV.wonRenown}; the King's friends lose ${Math.round(REV.loyalLost * 100)}% of their purse to the committees, and renown ${sg(REV.loyalLostRenown)}.
- **Crushed**: the governor hangs. Patriots: the law's heat +${REV.crushedHeat}, favour ${sg(REV.crushedFavour)}, renown ${sg(REV.crushedRenown)}. The King's friends: favour +${REV.loyalWonFavour}, renown +${REV.loyalWonRenown}.

> Tip: Wait for a war in Europe, a colony that's grown its own mind, and a house that leans your way; raise the militia and drill it first.`,
  glossary: [
    [
      "Patriot",
      "One who stood with the colony against its crown.",
      "independence",
    ],
    [
      "Loyalist",
      "One who stood with the King when the colony broke with him.",
      "independence",
    ],
  ],
};

/** Added to "A colony of your own": founding, widened. */
export const FOUNDING_R21 = `

## For whom
- **Your own crown**, with the governor's charter (renown +${PLANT.renown.charter}, favour +${PLANT.favour}) or as squatters (renown +${PLANT.renown.squatters}, and his anger).
- **Another crown** (as Peter Minuit planted New Sweden for the Swedes in 1638): its governor grants the charter (in person at their capital, or by letter); a stranger asks harder, a small colony is glad of settlers. Planted, the settlement is theirs and so are you and your families (renown +${PLANT.renown.other}); your old colony thinks the worse of them, and your favour at home is halved.
- **Your own colony**, answering to no crown (renown +${PLANT.renown.free}), and you frame its government.

## The founder's place
You hold its land as its **proprietor** (seigneur, adelantado, patroon), name its officers and draw the proprietor's pay; and the new town has its **mayor's chair** from the start (maire, alcalde, burgomaster), yours for its first year by the town's charter if you hold no other office.

## The first year
Before you set out, the page shows the odds of a **hard first year** (a starving time: ${Math.round(PLANT.hardLost * 100)}% of the settlers lost, renown ${sg(PLANT.hardRenown)}, stress +${PLANT.hardStress}): ${Math.round(SEASONING.base * 100)} in 100 to begin with; less with supplies beyond the need (to −${Math.round(SEASONING.spareMax * 100)}), arriving in time to plant (${in100(SEASONING.spring)}), your leadership and farming, and more households; more arriving with winter coming (${in100(SEASONING.winter)}), in fever country (${in100(SEASONING.fever)}) or where people live already (${in100(SEASONING.natives)}). Between ${Math.round(SEASONING.min * 100)} and ${Math.round(SEASONING.max * 100)}. And what's still to pay.`;

export const GOV_CHAPTERS = {
  EXPEDITIONS_CHAPTER,
  GOVERNING_CHAPTER,
  INDEPENDENCE_CHAPTER,
};
