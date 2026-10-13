// CROWN (r18): the How to Play's chapter on the crowns' regiments in
// America: what each crown sends when its colony goes to war, the fortress
// garrisons, and a governor's petition for an expedition to take back a
// town. Its tables are made from the engine's own (CrownCore's MEANS,
// STAKE, FORTS, EXPEDITION and OFFER), so they can't drift from what the
// game rolls.

import {
  CROSSING,
  EXPEDITION,
  FORTS,
  MEANS,
  NPC_ASK,
  OFFER,
  PASSAGE,
  STAKE,
} from "../../engine/CrownCore";
import type { Chapter } from "./Chapters";

const in100 = (v: number) => `${Math.round(v * 100)} in 100`;
const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;
const CROWNS: Record<string, string> = {
  england: "England (Britain)",
  france: "France",
  spain: "Spain",
  netherlands: "The Netherlands",
};

/** What each crown could spare, by age (MEANS). */
function meansTable(): string {
  const rows: string[] = [];
  for (const [key, ages] of Object.entries(MEANS))
    ages.forEach((m, i) => {
      const to = ages[i + 1]?.from;
      const when =
        m.from === 0
          ? to
            ? `before ${to}`
            : "all along"
          : to
            ? `${m.from}–${to - 1}`
            : `from ${m.from}`;
      rows.push(
        `| ${CROWNS[key] ?? key}, ${when} | ${in100(m.chance)} | ${m.first} | ${m.season || "none"} | ${m.max} | ${m.exp}${m.ships ? `, ${m.ships} ships` : ""} |`,
      );
    });
  return `| The crown, the age | Sends, a war begun | Regiments | Each spring | At most | An expedition |
|---|---|---|---|---|---|
${rows.join("\n")}
| Sweden | never | | | | |`;
}

/** What each age's numbers come from. */
function meansNotes(): string {
  const out: string[] = [];
  for (const [key, ages] of Object.entries(MEANS))
    for (const m of ages)
      if (m.from > 0 || ages.length === 1)
        out.push(
          `- **${CROWNS[key] ?? key}${m.from ? `, from ${m.from}` : ""}:** ${m.note}`,
        );
  return out.join("\n");
}

/** The stake a war has for the crown (STAKE). */
function stakeTable(): string {
  const S = STAKE;
  return `| The war | Its stake |
|---|---|
| The crowns at war in Europe | ${S.europe} |
| To take back a town the colony lost | ${S.claim} |
| A quarrel with another crown's colony, not Europe's | ${S.power} |
| With a native nation | ${S.native} |
| An ally's war, or a tributary's | ${S.ally} |
| The enemy holds some of the colony's towns | +${S.lost} |
| The capital besieged or held | +${S.capital} |
| Never more than | ${S.max} |`;
}

/** The garrisons (FORTS). */
function fortsTable(): string {
  return `| Fortress | Whose | Men | From | |
|---|---|---|---|---|
${FORTS.map((f) => `| ${f.name} | ${CROWNS[f.key] ?? f.key} | ${f.men} | ${f.from} | ${f.note} |`).join("\n")}`;
}

/** A petition's odds (EXPEDITION). */
function oddsTable(): string {
  const X = EXPEDITION;
  return `| What | In 100 |
|---|---|
| The crown is slow to send its regiments across the sea | ${signed(X.base)} |
| The claim's weight | a point in ${Math.round(1 / X.claimPer)} of it (a claim of 50: ${signed(50 * X.claimPer)}) |
| At war with the town's holder already | ${signed(X.atWar)}; the crowns at war in Europe, ${signed(X.europe)} more |
| In peace with another crown's colony: it would mean war between the crowns | ${signed(X.peacePower)}, less a point for each ${Math.round(1 / X.tensionPer / 100)} of tension between them (in Europe) |
| In peace with a native nation | nothing either way |
| A truce with them, or an alliance | the crown won't (none in 100) |
| Their men within ${X.reach} km of the town (with the warriors a native nation's towns near would call up), against those who'd sail | nothing to ${Math.round(X.oddsFrom * 10)} in 10 of them; then ${Math.round(X.oddsPer * 10)} in 100 for each tenth more, to ${signed(-X.oddsMax)} |
| The crown busy with other wars in Europe | ${signed(X.busy)} each, to ${signed(X.busyMax)} |
| The colony's favour with the crown: ${X.trustMid} counts for nothing | a point in ${Math.round(1 / X.trustPer / 100)}, up to ${signed(X.trustMax)} either way |
| Your own favour at home (the computer's governor: his friends at home) | a point in ${Math.round(1 / X.favorPer / 100)}, up to ${signed(X.favorMax)} (${signed(X.npcMax)}) |
| Your case (renown, favour, a council seat, Diplomacy and Stewardship) | a point in ${Math.round(1 / X.casePer / 100)}, up to ${signed(X.caseMax)} |
| Each regiment the colony raises | ${signed(X.men)}, up to ${signed(X.menMax)} |
| Each 25 gold voted, or coins paid in | ${signed(25 * X.goldPer)}, up to ${signed(X.goldMax)} |
| Each councillor's letter · each member's | ${signed(X.council)} (to ${signed(X.councilMax)}) · ${signed(X.house)} (to ${signed(X.houseMax)}) |
| Each friend at court who'll speak for it | ${signed(X.court)} (up to ${X.maxCourt}) |
| Never above, nor below | ${in100(X.max)}, ${in100(X.min)} |`;
}

export const CROWN_CHAPTER: Chapter = {
  id: "crown",
  part: "power",
  title: "Regiments from Europe, and expeditions",
  line: "What the crowns send their colonies in wartime, the fortress garrisons, and asking the crown to take a lost town back.",
  where:
    "World › Regiments from Europe; a nation's page; Society › Standing or Society › Council › An expedition to take back a town.",
  body: `## Regiments from Europe
When a colony goes to war in America, its crown may send regiments across: some when the war begins, then a reinforcement each spring while it lasts. How many, and how likely, is by the crown's means in its age and the war's **stake** to it. A regiment in the game (a hundred men) stands for a battalion of the period: the game's colonies keep five to twenty regiments where the real ones mustered thousands, about a tenth.

In the table, "Sends" is the chance the crown sends any when a war begins, at a full stake; "Regiments" how many it sends then; "Each spring" the reinforcement while the war lasts; "At most" the most it keeps in America at once; and "An expedition" what it sends on a petition granted.

${meansTable()}

The chance and the number are each multiplied by the stake (so a war with a native nation, at ${STAKE.native}, brings few and seldom), and never more than the most it keeps there at once.

${stakeTable()}

- **They sail** for ${CROSSING.min} to ${CROSSING.max} days (you can watch the ships come in on the map), and **land** at the colony's port nearest the war's aim, or, where it holds no port, **in force** on the coast nearest it.
- **The computer sends them first for the war's aims:** a town of its own the enemy holds, then a town it lost and claims ([[claims|Lost towns, claims and risings]]), unless the enemy there is half again as strong.
- **They cost the colony:** ${PASSAGE} gold a regiment for passage and victuals when they sail (as far as the treasury has it), and their pay each month ("The crown's regiments" in the colony's ledger).
- **They suffer the fevers** and the winters as any troops do.
- **They go home at the peace**, and all of them if the colony declares its independence.
- The news and the gazette carry each landing ("Two regiments of English foot landed at Charles Town"); World › Regiments from Europe shows what each crown has sent.

${meansNotes()}

## The fortress garrisons
Spain's fortress ports, and France's posts of the troupes de la marine, keep a garrison of the crown's own. It's renewed every year with the fleet (the draft sails in May) while the crown holds the town, and the computer never marches it off. When the town is lost, its garrison sails for home; won back, it comes again.

${fortsTable()}

## A petition for an expedition
A governor can **petition the crown for an expedition** to take back a town his colony claims (Society › Standing). It costs an agent at court ${EXPEDITION.fee} coins, and ${EXPEDITION.retainer} a month while it runs. One at a time; after one is refused or fails, the crown won't hear another for ${Math.round(EXPEDITION.rest / 365)} years.

- **It gathers support ${Math.round(EXPEDITION.gather / 30)} months:** ask the council and the house for letters (Persuasion, every ${EXPEDITION.lettersEvery} days); write to friends at court (Letters, ${EXPEDITION.postage} coins, every ${EXPEDITION.courtEvery} days, up to ${EXPEDITION.maxCourt}); and put **the colony's offer** to the house: up to ${EXPEDITION.offerMen} regiments raised and ${EXPEDITION.offerGold} gold from the treasury. The house votes it at the odds shown (as often as not, less for each regiment (${signed(OFFER.perMan)}) and for a big share of the treasury, more for a town of its own people; turned down, it won't hear it again for ${OFFER.again} days). You can pay into it yourself, too.
- **Then it sails**, and the crown's answer comes ${Math.round(EXPEDITION.voyage / 30)} months later, rolled at the odds the page showed:

${oddsTable()}

- **Granted:** if the colony isn't at war with the town's holder, the crown makes war for it ("To take back St. Augustine"). The expedition sails: the crown's regiments (its means in the age, more if the holder has many men near the town), a regiment of guns for every four, and for a town on the coast a squadron (a regiment of its guns for every three ships). It lands in force at the town on the coast (or at the colony's port nearest it), with the colony's share raised from its people. **You may command it yourself** (you go with the army and march it) **or leave it to the crown's general**, who marches on the town as soon as it lands. Any player of the colony can **ride with it** from where its army stands.
- **Taken back** (the town is the colony's again, at the peace): renown +${EXPEDITION.wonRenown} and favour +${EXPEDITION.wonFavour} for the governor who asked; the colony's favour with the crown +${EXPEDITION.colonyWon} for three years; renown +${EXPEDITION.riderRenown} for its riders.
- **Failed** (its army broken, a year and a half without the town, the peace leaving the town where it was, or ${Math.round(EXPEDITION.recallDays / 365)} years after it landed with the town held but no peace to give it): favour ${EXPEDITION.failedFavour}, the colony's favour ${EXPEDITION.colonyFailed}, and the claim halved (twice, and it's given up). If a peace is made, or another power takes the town, while it's still at sea, it puts about and nobody is blamed.
- **Refused:** favour ${EXPEDITION.refusedFavour}; or +${EXPEDITION.modestFavour} if it was modest and sensible (it stood a fair chance, ${in100(0.35)} or better, and the colony offered a good share: two regiments' worth, in men or 50 gold a regiment).

## If you don't govern
You can **ask the governor to petition** for a town your colony claims (once in six months). The computer's governor weighs it at the month's turn, and goes on shorter odds than he would on his own; a player governor is told. Once it's under way you can **pay into the colony's share** (handed back if it never sails), **write to friends at court** for it (renown ${EXPEDITION.courtRenown}), and, if you sit on the council or in the house, put **your own letter** to it. When it lands, **ride with it**.

## The computer's governors
They petition too, for a town worth a war, when it would be granted ${in100(NPC_ASK.min)} or better (${in100(NPC_ASK.asked)} when a player of the colony has asked him), reckoning on the letters and the friend at court they'd gather, and offering what the colony can spare (a regiment or two, and a tenth of the treasury, to ${EXPEDITION.offerGold} gold). So towns are retaken where nobody plays.

## Secrecy
A petition is its colony's business. The town's holder, and the rest of the world, hear of the expedition when it sails, not before.

## In history
Spain kept St. Augustine through Moore's siege of 1702 (174 regulars and 14 gunners in the Castillo, relieved from Havana) and Oglethorpe's of 1740 (750), and lost it only by treaty, in 1763. Britain's regulars came rarely before the 1750s (Quebec 1711, Cartagena 1741, Oglethorpe's regiment for Georgia), then by the score. France kept its troupes de la marine in Canada from 1683 and sent line battalions from 1755. The Dutch retook New York in 1673 with Evertsen's fleet of 600 marines and sailors, and gave it back at the peace.`,
  glossary: [
    [
      "Regiments from Europe",
      "The crown's own soldiers, sent to a colony at war by its means and the war's stake; they land at its port, cost it their passage and pay, and go home at the peace.",
      "crown",
    ],
    [
      "Expedition",
      "Regiments and ships the crown sends to take back a town a colony lost, on its governor's petition.",
      "crown",
    ],
    [
      "Garrison",
      "A fortress port's soldiers of the crown's own, renewed every year while the crown holds the town.",
      "crown",
    ],
  ],
};
