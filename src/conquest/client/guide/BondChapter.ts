// LABOUR (r15): the How to Play's chapter on bondage, written as history:
// what it was, where and when the law allowed it (a table made from the
// game's own law, BondLaw.ts, so the two can't disagree), the people, their
// resistance, freedom and its hurdles, the voices raised against it, and
// how the game plays it. Restrained, and in the game's own words: the
// period's legal terms appear only where the law is quoted.

import {
  ACRES_EACH,
  AWAY_FACTOR,
  basePrice,
  CROP_LUCK,
  CROPS,
  FOOD_COST,
  FREEDOM_DUES,
  HOUSING_COST,
  INDENTURE_YEAR,
  REFUGE_ODDS,
  RISE_MIN,
  SALE_SHARE,
} from "../../engine/BondCore";
import {
  BOND_HISTORY,
  COLONY_NAMES,
  freeRule,
  lawfulIn,
  MARKETS,
  REFUGE_SHORT,
  type Colony,
  type LawOf,
} from "../../engine/BondLaw";
import { HAND_WAGE } from "../../engine/LifeRules";
import { chanceWords } from "../../engine/Odds";
import type { Chapter } from "./Chapters";

const YEARS = [1640, 1670, 1700, 1740, 1760, 1775];

const PLACES: {
  name: string;
  law: LawOf | ((y: number) => LawOf);
  col: Colony;
}[] = [
  { name: "Virginia", law: "english", col: "virginia" },
  { name: "Maryland", law: "english", col: "maryland" },
  { name: "Massachusetts", law: "english", col: "massachusetts" },
  {
    name: "New Netherland, then New York",
    law: (y) => (y < 1664 ? "dutch" : "english"),
    col: "newyork",
  },
  { name: "Pennsylvania", law: "english", col: "pennsylvania" },
  { name: "South Carolina", law: "english", col: "southcarolina" },
  { name: "Georgia", law: "english", col: "georgia" },
  { name: "The English islands", law: "english", col: "islands" },
  { name: "New France (Canada)", law: "french", col: "canada" },
  { name: "Louisiana", law: "french", col: "louisiana" },
  { name: "The French islands", law: "french", col: "hispaniola" },
  { name: "Spanish Florida and Cuba", law: "spanish", col: "florida" },
];

/** Where and when people could be held: made from the game's own law. */
function lawTable(): string {
  const head = `| | ${YEARS.join(" | ")} |\n|---|${YEARS.map(() => "---").join("|")}|`;
  const rows = PLACES.map((pl) => {
    const cells = YEARS.map((y) => {
      // Before a colony was founded there was nothing to say.
      if (
        (pl.col === "southcarolina" && y < 1670) ||
        (pl.col === "georgia" && y < 1733) ||
        (pl.col === "louisiana" && y < 1700) ||
        (pl.col === "pennsylvania" && y < 1682)
      )
        return "·";
      const law = typeof pl.law === "function" ? pl.law(y) : pl.law;
      const h = lawfulIn(law, pl.col, y);
      return h.legal
        ? "lawful"
        : /custom/.test(h.code)
          ? "by custom"
          : "**no**";
    });
    return `| **${pl.name}** | ${cells.join(" | ")} |`;
  });
  return `${head}\n${rows.join("\n")}\n\n"·": not yet a colony. "By custom": Virginia and Maryland held Africans by custom (some as servants for a term, some for life by the courts) before their laws made bondage hereditary in 1662 and 1664; New France had no leave from the king until 1689; Georgia's Trustees banned it from the colony's founding until 1 January 1751.`;
}

/** How freeing someone went, colony by colony: made from the game's own law. */
function freeTable(): string {
  const at = [1700, 1730, 1760];
  const cols: [string, LawOf, Colony][] = [
    ["Virginia", "english", "virginia"],
    ["Maryland", "english", "maryland"],
    ["North Carolina", "english", "northcarolina"],
    ["South Carolina", "english", "southcarolina"],
    ["New York", "english", "newyork"],
    ["New Jersey", "english", "newjersey"],
    ["Pennsylvania", "english", "pennsylvania"],
    ["Massachusetts", "english", "massachusetts"],
    ["Rhode Island", "english", "rhodeisland"],
    ["The French islands", "french", "hispaniola"],
    ["Louisiana", "french", "louisiana"],
    ["Spain's colonies", "spanish", "florida"],
  ];
  const cell = (law: LawOf, col: Colony, y: number) => {
    const r = freeRule(law, col, y);
    const bits = [
      r.kind === "petition"
        ? `a petition to ${r.petition!.who}`
        : r.kind === "security"
          ? "a deed, with security"
          : "a deed",
    ];
    if (r.security) bits.push(`£${Math.round(r.security / 1.5)} bond`);
    if (r.leave) bits.push(`must leave within ${r.leave} months`);
    if (r.allowance)
      bits.push(`£${Math.round(r.allowance / 1.5)} a year to them`);
    if (!r.will) bits.push("no will");
    if (r.maxAge) bits.push(`none over ${r.maxAge}`);
    return bits.join("; ");
  };
  return `| | ${at.join(" | ")} |\n|---|---|---|---|\n${cols
    .map(
      ([n, law, col]) =>
        `| **${n}** | ${at.map((y) => cell(law, col, y)).join(" | ")} |`,
    )
    .join("\n")}`;
}

/** The dated history, newest last, by kind. */
function history(kind: "rising" | "native" | "law"): string {
  return BOND_HISTORY.filter((e) =>
    kind === "rising"
      ? e.rising
      : kind === "native"
        ? e.native
        : !e.rising && !e.native,
  )
    .map(
      (e) =>
        `- **${e.year}**${
          e.where === "all"
            ? ""
            : ` (${e.where
                .map((c) => COLONY_NAMES[c])
                .slice(0, 3)
                .join(", ")})`
        }: ${e.text}`,
    )
    .join("\n");
}

const ports = () => {
  const names: Record<string, string> = {
    jamestown: "Jamestown",
    rappahannock: "the Rappahannock",
    pamunkey: "the York (Pamunkey)",
    severn: "Annapolis (the Severn)",
    "st-mary-s": "St. Mary's",
    "charles-town": "Charles Town",
    "cape-fear": "the Cape Fear",
    albemarle: "Albemarle",
    guale: "Savannah (from 1751)",
    "new-amsterdam": "New Amsterdam and New York",
    raritan: "Perth Amboy",
    upland: "Philadelphia",
    "massachusetts-bay": "Boston",
    narragansett: "Newport",
    barbados: "Barbados",
    antigua: "Antigua",
    "st-kitts": "St. Kitts",
    jamaica: "Jamaica",
    martinique: "Martinique",
    guadeloupe: "Guadeloupe",
    "le-cap": "Cap-Français",
    leogane: "Léogâne",
    bayogoula: "New Orleans (the Company's ships, 1719 to 1731)",
    mobile: "Mobile",
    havana: "Havana",
    "santiago-de-cuba": "Santiago de Cuba",
    "santo-domingo": "Santo Domingo",
    "san-juan": "San Juan",
    veracruz: "Veracruz",
    portobelo: "Portobelo",
    curacao: "Curaçao",
  };
  return [...new Set(MARKETS.map((m) => names[m.id] ?? m.id))].join(", ");
};

const pr = (y: number) => Math.round(basePrice(y));

export const BOND_CHAPTER: Chapter = {
  id: "bondage",
  part: "world",
  title: "Bondage in the colonies",
  line: "Slavery and indentured servitude as they were: where and when the law allowed them, the people held, their resistance, freedom and its hurdles, the voices raised against it, and how the game plays it.",
  where:
    "Estate › Bondage (those your household holds, how they're kept, the risks, freedom, the law where you live and its history); the docks of the ports where people were sold; the journal, where the history comes as news.",
  body: `## What it was
In the English, French, Spanish and Dutch colonies, Africans and their descendants were held in **slavery**: for life, as property, with any child born to an enslaved woman held as she was (Virginia made that the law in 1662; the Code Noir and Spain's law said the same). Of the more than twelve million people carried from Africa across the Atlantic, most went to the sugar islands and Brazil; about 400,000 came directly to the mainland colonies that became the United States. Alongside them, hundreds of thousands of English, Irish, Scots and German **servants under indenture** worked off their passage over for a term of four to seven years, and went free at the end of it.

Native people were enslaved too: captives of the colonial wars sold to the islands, and above all Carolina's trade in Native captives, taken in raids its traders paid allies to make across the south-east, which helped bring on the Yamasee War of 1715. In the game that trade is the world's history, told as news, and never something to buy.

## Where and when the law allowed it
The law decided everything: whether anyone could be held, how they could be bought, and how they could be freed. It differed from colony to colony and changed over the years, and the game follows it. Where a colony changes hands, its new ruler's law runs.

${lawTable()}

People were sold openly only at certain ports, and a ship didn't come every month: ${ports()}. From December 1774 the Continental Association stopped the ships (Rhode Island and Connecticut had stopped them already); only estates' sales went on.

## The people
Those held were people, with names, families, faiths, skills and wills of their own. Many kept the names their families gave them: Akan day names (Kwadwo, Kofi, Afua, which English clerks wrote Cudjoe, Cuffee, Phibbah), Igbo market-day names, Kongo, Mande, Wolof, Fon and Yoruba names; enslavers gave others (Caesar, Pompey, Venus, Dido, Jack, Bess). Some were Muslims from Senegambia, some Catholics from the Kingdom of Kongo, most kept the faiths of their own peoples, and many became Christians in the Awakening. Marriages among the enslaved had no standing in English colonial law, and families were broken by sales, by moves, by death.

Ships' captives arrived weak from the passage, and many died in their first year in a strange country (the **seasoning**). The work killed too: sugar most of all, then the rice swamps. In the Lowcountry rice was grown by the **task system** (a day's task, then time of one's own, to grow and sell and save); in the Chesapeake's tobacco and the islands' sugar, by **gangs** under a driver.

## Resistance
Every day, in slow work, broken tools and feigned sickness; and in flight, to wherever freedom might be: Spanish Florida, where the king's edict of 1693 freed those who reached St. Augustine and became Catholics, and where Fort Mose was founded in 1738 as a free town; the maroon settlements of the Great Dismal Swamp and Jamaica's mountains; the Native nations; the towns, to pass as free; the sea; and in 1775 Lord Dunmore's lines. Risings were rare, and the colonies answered them with terror and harder law:

${history("rising")}

## Freedom
Freeing someone (**manumission**) was a matter for the law, and the law put hurdles in the way: fees, security that the freed would never come on the town, petitions, leaving the colony, a yearly allowance to the freed, or no freeing by will at all.

${freeTable()}

In Spain's colonies the enslaved could have their price fixed and buy their freedom, and a master couldn't refuse (*coartación*). Elsewhere it was the master's to agree. The freed lived as free people, often poor, and always at risk of being taken and sold again; free Black communities grew in Philadelphia, New York, Newport, St. Augustine and New Orleans.

## The voices raised against it
${history("law")
  .split("\n")
  .filter((l) =>
    /Germantown|Sewall|Whitefield|Woolman|Yearly Meeting|Benezet|Slew|Wheatley|Somerset|Society|Association|Rhode Island forbids/.test(
      l,
    ),
  )
  .join("\n")}

## The Native captives
${history("native")}

## In the game
- **Estate › Bondage** shows the law where your household lives, everyone it holds (their names, families, health, how they bear it, what they think of you, their chance of flight), how they're kept, the risks with their odds, freedom and what it costs, and the history.
- **Buying.** Only at the ports above, only while the law allows it where your household lives, and only when a ship or an estate's sale has come (the docks show a notice). An adult in their prime cost about ${pr(1700)} coins in 1700, ${pr(1740)} by 1740 and ${pr(1770)} by 1770 (more in Spain's colonies, less in the islands); a servant's indenture about ${INDENTURE_YEAR} coins a year of the term, with freedom dues of ${FREEDOM_DUES} at the end. A hired hand costs ${HAND_WAGE} a month and needs a business to work in. Not everyone of the colonial world did any of this: most colonists held nobody.
- **The work.** In the fields (each worker needs ${ACRES_EACH} acres of your land, or your farm), in the house (an easier mind at home), or a trade hired out in a town. What the fields bring depends on the crop (${Object.values(
    CROPS,
  )
    .map((c) => `${c.name} ${c.value}`)
    .join(
      ", ",
    )} a month for a worker in good heart), their skill, their health and their spirits, and the month's luck (${CROP_LUCK.map((x) => `${x.label} ${chanceWords(x.p)}`).join(", ")}). Away from home, ${Math.round(AWAY_FACTOR * 100)}%. It's in the month's figure, with the keep: provisions ${FOOD_COST.join(", ")} and quarters ${HOUSING_COST.join(", ")} a person a month (scant, customary, ample).
- **How the household is kept**: provisions, quarters, gangs or the task system, never selling families apart, passes to visit family, church, letters (where the law allows), and punishment. **Harshness buys nothing**: it saves a little on provisions, and costs health, spirits, the work, and more flight and risings than it saves.
- **Flight**: each person's chance is shown, and rises with despair, grief (someone sold away or dead), youth and refuges near; patrols cut it. Of those who flee, most are brought back; some reach freedom (${Object.entries(
    REFUGE_ODDS,
  )
    .map(
      ([k, v]) =>
        `${REFUGE_SHORT[k as keyof typeof REFUGE_SHORT]} ${chanceWords(v)}`,
    )
    .join(
      ", ",
    )}). **Risings** need ${RISE_MIN} grown people or more, come of despair, and are rare and grave.
- **Selling** goes through a dealer at ${Math.round(SALE_SHARE * 100)}% of a price, and a sale that parts a family is put to you first, in their words.
- **Freedom**: by deed, by petition where the law demands it, in your will, or (when they've saved their price) by their own purchase, with the law's fees on the button. The freed live on in the world as free people. An indenture ends with its freedom dues.
- **An heir** takes those the family holds, as the law treated them; a will frees those it names, if the law lets it.
- **In company**: a freedom seeker may come to another player's door, and it's theirs to decide, as their own business.

! Pitfall: Buying people is no shortcut to wealth. The price is great, the seasoning kills, the law sends the freed away or forbids freeing at all, and those held are people, who flee, grieve, resist and remember.

## Sources
The laws are as their colonies passed them: Virginia's acts of 1662, 1667, 1680, 1691, 1705 and 1723 (Hening's Statutes); Maryland's of 1664 and June 1752; the Massachusetts Body of Liberties (1641) and act of 1703; New York's of 1702, 1712 and 1730; New Jersey's of 1714; Pennsylvania's of 1726; Delaware's of 31 October 1767; South Carolina's of 1712, 1722, 1735 and the Negro Act of 1740; North Carolina's of 1741; Georgia's of 1735, its repeal from 1751, and its codes of 1755 and 1770; the Code Noir of 1685 and Louisiana's of 1724; the ordinances of 1689, 1709, 1713 and 1736 in New France and the islands; Charles II of Spain's edict of 1693; Barbados's act of 1661; the Continental Association of 1774.`,
  glossary: [
    [
      "Bondage",
      "Being held as another's property: slavery for life, or servitude under indenture for a term.",
      "bondage",
    ],
    [
      "Indenture",
      "A contract binding a servant to a master for a term of years, for the passage over and freedom dues at the end.",
      "bondage",
    ],
    [
      "Manumission",
      "Freeing someone held in slavery, by deed, will or purchase, as the law allowed.",
      "bondage",
    ],
    [
      "The seasoning",
      "A newcomer's first year in the colonies, when strange fevers killed many.",
      "bondage",
    ],
    [
      "Coartación",
      "Spanish law and custom by which the enslaved could have their price fixed and buy their freedom.",
      "bondage",
    ],
    [
      "Maroons",
      "Communities of those who fled slavery, living free in swamps and mountains.",
      "bondage",
    ],
    [
      "The task system",
      "A day's set task, then time of one's own: how Lowcountry rice was grown.",
      "bondage",
    ],
    [
      "Freedom dues",
      "What a master owed a servant at the end of an indenture: clothes, tools, corn.",
      "bondage",
    ],
  ],
};
