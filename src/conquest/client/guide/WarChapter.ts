// WAR (r17): the How to Play's chapter on towns that change hands: the
// claims their old owners keep on them and the wars to take them back, a
// town's ferment under foreign rule, and the plots and risings of its
// people. Its tables are made from the engine's own (ReclaimCore's CLAIM,
// FERMENT and RISING), so they can't drift from what the game rolls.

import { INFORM, STIR, STIR_RISK } from "../../engine/Reclaim";
import { CLAIM, FERMENT, RISING } from "../../engine/ReclaimCore";
import type { Chapter } from "./Chapters";

const in100 = (v: number) => `${Math.round(v * 100)} in 100`;
const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 10) / 10)}`;

/** What a lost town is worth to its old owner, from the table claimParts reads. */
function claimTable(): string {
  const C = CLAIM;
  const k = (v: number) => Math.round(v * C.scale);
  return `| What | Counts |
|---|---|
| Its size | ${k(C.sizePer)} for each doubling of its people past ${C.sizeStep}, up to ${k(C.sizeMax)} |
| How long it was theirs | ${Math.round(C.perYear * C.scale * 10) / 10} a year, up to ${k(C.yearsMax)} (a town held since before the game: in full) |
| Its people | size and years count in full when all of its people are the claimant's own, a quarter when none are |
| Their capital | ${k(C.capital)}, whoever lives there now |
| Held less than ${C.minYears} years | no claim at all |`;
}

/** What pushes a town's ferment up or down, from the table fermentTarget reads. */
function fermentTable(): string {
  const F = FERMENT;
  return `| What | Its ferment heads for |
|---|---|
| Its people of another tongue than their rulers | ${signed(F.tongue)} (all of them; less for fewer) |
| Of another faith | ${signed(F.faith)} (half again under a zealous ruler, half under a tolerant one) |
| Its old owner's own people, loyal to them | ${signed(F.loyal)} (all of them) |
| Colonists under a native nation, cut off from their own courts, church and trade | ${signed(F.nativeRule)} (all of them) |
| No soldiers of its rulers in the town | ${signed(F.noGarrison)} |
| A garrison: one soldier in ${F.garrisonPer} of its people (at least ${F.garrisonMin}) | ${signed(F.garrison)}, down to ${signed(F.garrison * 2)} at twice that |
| High taxes · a cruel ruler · a greedy one · a just one | ${signed(F.highTax)} · ${signed(F.cruel)} · ${signed(F.greedy)} · ${signed(F.just)} |
| A tolerant ruler | ${signed(F.tolerance)} |
| Hunger | up to ${signed(F.hunger)} (all of its food wanting) |
| Newly taken (the first ${F.freshYears} years) | ${signed(F.fresh)} |
| Used to it | ${signed(F.usedPerYear)} a year from the ${F.usedFrom}th, to ${signed(F.usedMax)} |
| An army of its old owner within ${F.oldArmyKm} km, in a war with its rulers | ${signed(F.oldArmy)} |
| Its old owner at war with its rulers | ${signed(F.oldAtWar)} |
| A rising crushed or found out (for ${F.cowedYears} years) | ${signed(F.cowed)} |`;
}

/** A rising's first night, from the table risingOdds reads. */
function nightTable(): string {
  const R = RISING;
  return `| What | Found out before it begins |
|---|---|
| To begin with | ${in100(R.found)} |
| Its rulers have a spymaster | ${in100(R.spymaster)} more |
| A garrison enough to hold the town | ${in100(R.garrisonFound)} more (less for a smaller one) |
| Each sworn past three | ${in100(R.member)} more |
| Never below, nor above | ${in100(R.foundMin)}, ${in100(R.foundMax)} |`;
}

export const WAR_CHAPTER: Chapter = {
  id: "claims",
  part: "power",
  title: "Lost towns, claims and risings",
  line: "Towns change hands at a peace. Their old owners want them back, and their people may rise against their new rulers.",
  where:
    "A town's page (Here, or click it on the map): Under foreign rule, or Claims on it; World › Lost towns and claims; a nation's page; Society › Causes, once you're sworn to a plot.",
  body: `## When a town changes hands
Holding a town in a war isn't owning it: land changes hands at a peace (its terms, or Europe's peace, where each side keeps what it holds), or when a rising wins. A town sold isn't taken. When a town is taken, its old owner keeps a **claim** on it.

${claimTable()}

A claim is on a scale of 100. A capital, a big town and a town whose people are still theirs are wanted most; a town of strangers held a few years, hardly at all.

## Wanting it back
- **A claim worth a war** (${CLAIM.war}; against another crown's colony ${CLAIM.warPower}) makes the computer's nations go to war for it, but only when they're stronger in the field than whoever holds it (by ${CLAIM.edge} times, or at all while the town's own people hold it in a rising). The chance a month is ${in100(CLAIM.warChance)} at a claim of 50 (${in100(CLAIM.warChancePower)} against another crown's colony), more for a stronger claim.
- **In any war** their armies are drawn to the towns they claim, the more the stronger the claim.
- **At the peace** they ask for a claimed town they hold as soon as the war is going their way (a war score of ${CLAIM.peaceScore}), before anything else.
- **Claims fade.** One holds its strength ${CLAIM.holdYears} years and fades to nothing by ${CLAIM.fadeYears}. A war for it that ends without it halves every claim on that rival's towns; after ${CLAIM.maxTries} such wars they're given up. So nobody fights the same neighbour for ever.
- **No ping-pong.** A town taken back gives its loser a claim only if they'd held it ${CLAIM.minYears} years or more, and only a weak one if its people aren't theirs.

## A town under foreign rule
A town held by rulers who aren't its people's own, with a claim on it from the nation whose people they are, has a **ferment**: how near it is to rising, from 0 to 100. Each month it moves about an eighth of the way to where it's heading:

${fermentTable()}

From **${FERMENT.plot}** a plot may form among its people: a chance a month of 1 in 40 for each point above ${FERMENT.plotFrom} (at 80, 3 in 8).

## A plot, and the rising
Everyone living in the town (a player there) is told, and chooses:
- **Swear yourself to it**: its fate is yours. If it wins, renown; if it's broken, the lists of names, or worse.
- **Lead it**: renown 10. You call the rising (Society › Causes) when it has support 40 and three sworn, and choose what it's for: back to the nation it was taken from, or a free town.
- **Inform on it**: its rulers take its ringleaders and pay you ${INFORM.reward} coins; 1 in 3 its people learn who talked, and don't forget it.
- **Keep out of it.**

Otherwise it rises on its day. Its first night is rolled from the odds shown on the town's page:

${nightTable()}

If it isn't found out, it fights the garrison in the streets: its men (a hundred for every 20 of support, every two sworn and every 10 arms put by, 200 to 1,000) against the garrison, man for man counting ${RISING.garrisonEdge} times as many. Win, and the garrison marches out; lose, and the ringleaders are taken. Either way, found out or beaten, the town is cowed for ${FERMENT.cowedYears} years.

Having taken its town, the rising is a war like any other ([[movements|Causes and risings]]): its host is a nation of its own, and its rulers come to take the town back. **Held ${RISING.holdMonths} months, it wins:** the town goes back to the nation it was taken from (or, with nobody left to go back to, it's a free town). A native town's people drive the colonists out; the colonists go to their own people's nearest town.

## Stirring a town up
In a town under foreign rule, its page has **Stir up the town**: a test of Persuasion (the odds on the button), +${FERMENT.stir} ferment (+${FERMENT.stirPoor} on a poor showing), once in ${STIR.days} days. Talk travels: ${STIR_RISK.pass * 100} in 100 you're informed upon, ${STIR_RISK.fail * 100} in 100 if it goes badly.

## Occupations that nobody could end
An occupation is ended by a peace. Two kinds used to last for ever: a third nation that took a town from its occupiers (and was at peace with its owner), and a town that broke away from its owner while an enemy held it. Now a nation that drives the occupiers out of a friend's town hands it back to its owner, a town under occupation doesn't break away, and any occupation with no war behind it ends at the month's turn (a town with no owner but its occupier becomes theirs, with a claim for the people who live there).

## In history
St. Augustine changed hands only by treaty: to Britain in 1763 and back to Spain in 1783; Moore's siege in 1702 and Oglethorpe's in 1740 both failed. The Pueblo Revolt of 1680 drove the Spanish out of New Mexico for twelve years, after drought and hunger and friars who burned the kivas (in the game, a zealous ruler and hunger). The Spanish of Jamaica fought on in the hills for five years after the English took it in 1655. Acadia's French people under the British, from 1710, never rose: no French army was near, and they held to their neutrality until the British deported them in 1755.`,
  glossary: [
    [
      "Claim",
      "A nation's wish to have back a town it lost: by its size, whether it was their capital, how long it was theirs and whether its people are theirs. It fades within a generation.",
      "claims",
    ],
    [
      "Ferment",
      "How near a town under foreign rule is to rising, 0 to 100. From 70 a plot may form.",
      "claims",
    ],
    [
      "Foreign rule",
      "A town held by rulers who aren't its people's own, with a claim on it from the nation whose people they are.",
      "claims",
    ],
  ],
};
