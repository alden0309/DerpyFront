// LABOUR2 (r21): the How to Play's chapter on an overseer, those held in
// bondage at a household's businesses, and a house in the trade in people
// between the colonies. Written as history, in LABOUR r15's register; the
// tables are made from the game's own rules (each colony's duty from
// TradeLaw.ts, an overseer's ways from Labour2Rules.ts, a voyage's numbers
// from TradeCore.ts, what people thought from TradeRep.ts), so the page and
// the game can't disagree.

import { AWAY_FACTOR } from "../../engine/BondCore";
import type { Colony } from "../../engine/BondLaw";
import { CAPITAL_RATE, CAPITAL_YEARS } from "../../engine/Labour2Core";
import {
  BIZ_AGE,
  BIZ_FLIGHT,
  BIZ_WILL,
  MANNER_ORDER,
  MANNERS,
  MOST_SHARES,
  overseerMind,
  RESTRAINT,
  SHARE_PAY,
} from "../../engine/Labour2Rules";
import { HAND_WAGE } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import {
  BUY_CUT,
  CHARTER,
  DEATH_DAY,
  EVERY,
  FOOD,
  HOUSE_SETUP,
  PART,
  PART_OLDER,
  RISE_AWAY,
  RISE_BASE,
  RISE_MOST,
  SELL_CUT,
  SIZES,
  TAKEN_WAR,
  TOGETHER_DAYS,
  TOGETHER_PRICE,
} from "../../engine/TradeCore";
import { importDuty } from "../../engine/TradeLaw";
import { tradeStanding } from "../../engine/TradeRep";
import type { Chapter } from "./Chapters";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const sg = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

/** An overseer's ways, from the game's own numbers. */
function mannerTable(): string {
  const rows = MANNER_ORDER.map((k) => {
    const m = MANNERS[k];
    return `| **${m.name}** | ${sg(m.mood)} | ${sg(m.health)} | ×${m.drive} |`;
  });
  rows.push(
    `| Paid by shares of the crop (as well) | ${sg(SHARE_PAY.mood)} | ${sg(SHARE_PAY.health)} | ×${SHARE_PAY.drive} |`,
  );
  return `| | Spirits (a month's tendency) | Health | The work |\n|---|---|---|---|\n${rows.join("\n")}`;
}

const DUTY_YEARS = [1705, 1715, 1725, 1735, 1742, 1752, 1757, 1763, 1767, 1772];
const DUTY_COLS: [string, Colony][] = [
  ["Virginia", "virginia"],
  ["Maryland", "maryland"],
  ["South Carolina", "southcarolina"],
  ["Pennsylvania", "pennsylvania"],
  ["New Jersey", "newjersey"],
  ["New York", "newyork"],
  ["Massachusetts", "massachusetts"],
  ["Rhode Island", "rhodeisland"],
];

/** Each colony's duty on a grown person lately come from Africa, at a price of 50: from the game's own law. */
function dutyTable(): string {
  const head = `| | ${DUTY_YEARS.join(" | ")} |\n|---|${DUTY_YEARS.map(() => "---").join("|")}|`;
  const rows = DUTY_COLS.map(([name, col]) => {
    const cells = DUTY_YEARS.map((y) => {
      const d = importDuty(col, "english", y, 6, {
        price: 50,
        fresh: true,
        age: 25,
      });
      if (!d.coins) return "·";
      const v = Math.round(d.coins * 10) / 10;
      return d.prohibitive ? `**${v}** (to stop it)` : String(v);
    });
    return `| **${name}** | ${cells.join(" | ")} |`;
  });
  return `${head}\n${rows.join("\n")}`;
}

/** What people thought of a house in the trade, by the years: from the game's own reckoning. */
function standingTable(): string {
  const years = [1730, 1750, 1760, 1770, 1774];
  const row = (label: string, f: (y: number) => number) =>
    `| ${label} | ${years.map((y) => sg(f(y))).join(" | ")} |`;
  return [
    `| | ${years.join(" | ")} |`,
    `|---|${years.map(() => "---").join("|")}|`,
    row(
      "Ministers, the just, the devout",
      (y) => tradeStanding(y, "virginia").conscience,
    ),
    row("Planters and merchants", (y) => tradeStanding(y, "virginia").trade),
    row("Everyone else", (y) => tradeStanding(y, "virginia").others),
    row(
      "Everyone else, where Friends are many",
      (y) => tradeStanding(y, "pennsylvania").others,
    ),
  ].join("\n");
}

const KIN_WORDS: [string, number][] = [
  ["A mother and her young child", PART.mother],
  ["A husband and wife", PART.wife],
  ["A sister or brother", PART.sister],
  ["Shipmates (bound to each other on the passage)", PART.shipmate],
];

export const LABOUR2_CHAPTER: Chapter = {
  id: "bondage2",
  part: "world",
  title: "Overseers, work in town, and the trade between colonies",
  line: "An overseer for a household's enslaved people, those set to work at a business of yours, and a merchant's house in the trade in people from port to port: as they were, and what they cost the people in them.",
  where:
    "Estate › Bondage (the overseer, who works where, a house in the trade); a business's card (those held there); anyone held in bondage: click their name.",
  body: `This chapter goes on from [[bondage|Bondage in the colonies]]. Everything there holds here: those held are people, with names, families and wills of their own; the law decides where and when; and **harshness never pays**.

## An overseer
Most households that held people were small, and their holders oversaw the work themselves. Larger ones, and any whose holder was often away, hired an **overseer**: a working man, often young, paid wages or a part of the crop. Washington's agreement of 1762 with Edward Violet gave him "two clear Shares of all the Tobacco corn and other Grain which he may raise" and asked him to take "all necessary and proper care" of the people "committed to his management". Lowcountry rice planters, often away in Charles Town for the sickly months, mostly paid their overseers wages. Many overseers had a name for hardness; planters complained of overseers who drove the people for this year's crop and wore them out.

**In the game** (Estate › Bondage, once your household holds anyone): three men are for hire at your home each month, each with his own nature and skill, and his wages (more in the Lowcountry). Take one on for **wages** or for **shares of the crop** (as many shares as would come to his wages by the fields' expected crop, at most ${MOST_SHARES}; too small a crop and he won't take shares at all).

${mannerTable()}

- **His orders.** He sets the work as he sees fit (the fields while there are acres, the best at a trade to a business of yours in the same town, a trade hired out where the town is big enough, two to the house, rest for children, the old and the ill), or keeps it as you set it. He never sends anyone to another town: that parts families. **Restraint** keeps ${pct(RESTRAINT)} of his harshness and of his drive. He writes each season while you're away, if you ask him to.
- **What he's worth** is minding the place while you're away: ${pct(overseerMind(0))} to ${pct(overseerMind(12))} of the work gets done by his skill, against ${pct(AWAY_FACTOR)} with nobody. At home, he usually costs more than he adds.
- **Harshness never pays.** A hard man gets a little more out of each day, and loses it again in spirits and health, in flight, sickness and risings. Shares cost at least what wages would, and the man paid by the crop drives them for it. Measured over a household of eight, a hard overseer nets least of the three at the same pay, under any keeping, and a household kept harshly gains nothing from any overseer at all.
- **Two months unpaid** and he leaves.

## Work in town
Enslaved men and women worked in the colonies' towns as smiths, coopers, carpenters, shipwrights, ropemakers, tanners, bakers, cooks and waiting-men at inns, at their holders' own businesses or hired out. Charles Town's free tradesmen complained of it for decades; Pennsylvania's free labourers petitioned their assembly against it in 1721, and the assembly refused them: such a law, it resolved, would be "unjust to those who owned" people "and hired them out" (Turner, Slavery in Pennsylvania).

**In the game**: someone of your household, ${BIZ_AGE} or older and well enough to work, can be set to work at a business of yours (their card on Estate › Bondage, or the business's card). They **live there**, among its hands, in its town: if that's away from their family, they're parted, and grieve. They're counted among its hands and draw **no wage**: the business pays their **keep** (their provisions and quarters, by how your household is kept). They run every risk your household's people run, and more chances to go in a town (flight ×${BIZ_FLIGHT}). Their trade grows with the work; a little of what passes through their hands is theirs to put by (toward their price, where the law lets them buy their freedom).

What they do is a part of a hired hand's work, by their trade, health and spirits, and ${pct(BIZ_WILL)} of that: work for nothing is work without a stake in it. The business's card sets the sum out as Franklin did in 1751 ("Reckon then the Interest of the first Purchase of a Slave, the Insurance or Risque on his Life, his Cloathing and Diet ... Loss by his Neglect of Business ... compare the whole Amount with the Wages"): a hired hand at ${HAND_WAGE} a month, against their keep, their price spread over ${CAPITAL_YEARS} years with the ${pct(CAPITAL_RATE)} it would earn lent out, and what flight and death take. Kept well and skilled, someone held does about what a hired hand nets; kept as custom kept people, less; kept harshly, far less. Franklin's answer to why colonists bought people all the same was that "hired Men are continually leaving their Master".

## The trade between the colonies
Most Africans brought to the mainland colonies came straight from Africa, but many came by way of the islands: as many as a quarter of all the Africans who reached the Americas were shipped on again, in more than seven thousand voyages from Jamaica, Barbados, Antigua and the rest to the mainland and to Spanish America. These were short passages in small sloops and schooners, with a few, or a few dozen, people aboard; their rate of dying, day by day, was worse than the Atlantic crossing's. At each sale people were parted again from the shipmates, kin and countrymen they had found.

**The law of it.** Holding anyone had to be lawful at both ends, and almost every English colony laid a duty on each person brought in: to raise money, to "discourage" the trade, or to keep out people sold away from another colony for "ill behaviour". Some duties were meant to stop it altogether. Here is each colony's duty on a grown person lately come from Africa and sold for 50 coins (in the game's coins, from each colony's own money; "·" for none):

${dutyTable()}

South Carolina laid far more on anyone six months in another colony (£30 against £3 from 1716, £50 against £10 from 1722, in its own money), and graded its duty by age (1722) and by height (1751), so its factors bought only new arrivals. Rhode Island and Connecticut forbade bringing anyone in from 1774, and the Continental Association stopped it everywhere from 1 December 1774. A house of the French crown traded only with French ports (Louisiana's trade was the Company of the Indies' alone from 1719 to 1731); Spain's ports took people only from the company holding the asiento.

**In the game** (Estate › Bondage, A house in the trade; from 16): set up a house (${HOUSE_SETUP} coins), named for your family, and choose a route (a port to buy at, a port of your crown to sell at, both where the law then allowed it), how many a voyage (${SIZES.join(", ")}), how often (every ${EVERY.join(", ")} months), how they're fed, and whether families are always sold together. Before you set it up, the page shows who its factor would buy, by name, and what's likely to become of them, then the money.

- **The voyage.** The factor buys by the lot (with ${pct(BUY_CUT)} commission), and a chartered sloop sails (${CHARTER.fixed} coins, ${CHARTER.perDay} a day, ${CHARTER.perHeadDay} a person a day, with their provisions). On the passage people die (about ${pct(DEATH_DAY * 30)} over a month at sea, more for the old, the young and the weak, and with scant provisions); the people may rise (${chanceWords(RISE_BASE)} at twelve aboard and three weeks out, up to ${chanceWords(RISE_MOST)}); ${pct(RISE_AWAY)} of risings get away, and the rest are put down, some dying in it; in wartime a privateer may take the vessel (${chanceWords(TAKEN_WAR)}).

| Provisions | A person a day | Deaths | Risings |
|---|---|---|---|
${FOOD.map((f) => `| ${f.name} | ${f.day} | ×${f.death} | ×${f.rise} |`).join("\n")}

- **The sale.** The factor sells at the far port for ${pct(SELL_CUT)} commission (as Austin & Laurens charged at Charles Town), and the colony's duty is paid on each person. Sold to whoever bids most, people are parted from those aboard with them:

| Who | Parted, sold to whoever bids most |
|---|---|
${KIN_WORDS.map(([w, p]) => `| ${w} | ${chanceWords(p)} |`).join("\n")}

An older child is parted from a mother ${chanceWords(PART_OLDER)}. A family sold **together** fetches ${pct(TOGETHER_PRICE)} as much and takes ${TOGETHER_DAYS} days longer, and nobody is parted. Before a sale that would part a family, they plead with you in their own words: sell every family together, take them into your own household (where the law at your home allows it), or leave it to the factor.
- **The account.** Each voyage's people are listed with what became of each (died on the passage, got free, sold, and to whom, and whom they were parted from), then the money. A port where your house has lately sold many pays less for a while. Margins are thin: on most routes, in most years, a voyage loses money, and in years when a colony's duty was meant to stop the trade it loses heavily.
- **Your name.** What people thought of anyone in the trade changed over the century:

${standingTable()}

The period's voices come to a house in the trade, where and when they were heard: Samuel Sewall's The Selling of Joseph (Boston, 1700), Postlethwayt's "great pillar" (1745), the Friends' minutes (1758, 1774), Henry Laurens giving the trade up (1763-1764), Benezet's A Caution and Warning (1766), Samuel Hopkins at Newport, the Virginia burgesses' address (1772), Thomas Thompson's defence (1772), Benjamin Rush and Richard Nisbet (1773), and the Association's committees (1774-1775). Each lets you give the trade up.

! Pitfall: A house in the trade is no road to riches. Most routes lose money most years; prohibitive duties ruin a voyage; deaths, risings and privateers take what's left. And every voyage is a list of names.

## Sources
The duties are each colony's acts as W. E. B. Du Bois abstracts them, with their citations, in The Suppression of the African Slave-Trade (1896), Appendix A, and Pennsylvania's as Edward Raymond Turner tells them in Slavery in Pennsylvania (1911); each colony's money against sterling from John J. McCusker, Money and Exchange in Europe and America, 1600-1775 (1978); South Carolina's years without new arrivals (1766-1768) from the Charleston County Public Library's Charleston Time Machine. The trade between the colonies from Gregory E. O'Malley, Final Passages: The Intercolonial Slave Trade of British America, 1619-1807 (2014), and the Intra-American database (slavevoyages.org); risings aboard from David Richardson, "Shipboard Revolts, African Authority, and the Atlantic Slave Trade" (William and Mary Quarterly, 2001). An overseer's shares from Washington's agreement with Edward Violet (5 August 1762, The Papers of George Washington). Franklin's reckoning from his Observations Concerning the Increase of Mankind (1751). The voices from their own texts: Sewall (1700), Postlethwayt (1745), Benezet (1766), Thompson (1772), the Virginia burgesses' address (1772), Rush (1773), the Continental Association (1774).`,
  glossary: [
    [
      "The intercolonial trade",
      "The trade in people from one colony to another, above all from the islands to the mainland and to Spanish America.",
      "bondage2",
    ],
    [
      "Asiento",
      "Spain's contract for bringing people to its colonies, held by Britain's South Sea Company from 1713 to 1739.",
      "bondage2",
    ],
  ],
};
