// LABOUR (r15): the law of bondage, colony by colony and year by year.
//
// Slavery in the colonies is played as history, so whether anyone may be
// held, bought or freed, and on what terms, follows the law that ran in a
// place in a year: the colony a province lies in (Virginia, the Lowcountry
// of Carolina, Barbados, Louisiana...), the crown that holds it now (English,
// French, Spanish, Dutch or Swedish law), and the date. A colonist can only
// hold people where and when the law allowed it, buy them only at the ports
// where they were sold, and free them only past the hurdles the law put in
// the way. The history the game tells (BOND_HISTORY) is dated and placed the
// same way, for the Estate page and the guide.
//
// Sources for what follows (checked for this round; see the FEATURES notes):
// Virginia's acts of 1662, 1667, 1669, 1680, 1691, 1705 and 1723 (Hening's
// Statutes; the 1723 act's "meritorious services" licence by the governor
// and council, fewer than 25 granted before the Revolution); Maryland's 1664
// act and its June 1752 act against freeing by will and freeing anyone over
// fifty; the Massachusetts Body of Liberties (1641, liberty 91) and the 1703
// act's £50 bond; Rhode Island's 1652 Providence and Warwick act, its 1728
// £100 bond and its June 1774 act against importing; Connecticut's 1690 pass
// law and its 1774 act against importing; New York's 1712 act after the
// rising (£200 security and £20 a year to the freed) and its 1730 act (a
// £200 bond with sureties); New Jersey's 1714 act (£200 security) and 1769
// duty act; Pennsylvania's 1726 "Act for the better regulating of Negroes"
// (£30 security), the 1688 Germantown protest, the Yearly Meeting's minute of
// 1758 and the duty of 1773; Delaware's act of 31 October 1767 (£60 a
// person); Carolina's Fundamental Constitutions (1669), South Carolina's 1704
// patrols, its 1722 act (the freed to leave within twelve months), 1735 act
// (six months) and the Negro Act of 10 May 1740 (no teaching to write; silent
// on freeing); North Carolina's 1741 act (the county court's leave, for
// meritorious services, and the freed to leave within six months); Georgia's
// 1735 act and its repeal from 1 January 1751, its 1755 and 1770 codes; the
// Code Noir of March 1685 (articles 2, 47, 55) and the edict of 24 October
// 1713; Louisiana's Code Noir registered 10 September 1724 (articles 43, 50);
// Louis XIV's leave of 1689 and the Raudot ordinance of 13 April 1709 for New
// France; Charles II of Spain's edict of 1693 and Fort Mose (1738); the
// Barbados council's resolution of 1636 and its 1661 act; the Continental
// Association of 20 October 1774.

import { dateOf } from "./Calendar";
import type { GameState, MapDef } from "./Types";

// ---------------------------------------------------------------- the colonies

/** A colony (or a stretch of country) as the law of bondage knew it. */
export type Colony =
  | "newfoundland"
  | "acadia"
  | "canada"
  | "maine"
  | "newhampshire"
  | "massachusetts"
  | "rhodeisland"
  | "connecticut"
  | "newyork"
  | "newjersey"
  | "pennsylvania"
  | "delaware"
  | "maryland"
  | "virginia"
  | "northcarolina"
  | "southcarolina"
  | "georgia"
  | "florida"
  | "louisiana"
  | "illinois"
  | "ohio"
  | "bermuda"
  | "bahamas"
  | "islands"
  | "jamaica"
  | "cuba"
  | "hispaniola"
  | "puertorico"
  | "curacao"
  | "newspain"
  | "mainland"
  | "north"
  | "west";

export const COLONY_NAMES: Record<Colony, string> = {
  newfoundland: "Newfoundland",
  acadia: "Acadia and Nova Scotia",
  canada: "Canada",
  maine: "Maine",
  newhampshire: "New Hampshire",
  massachusetts: "Massachusetts",
  rhodeisland: "Rhode Island",
  connecticut: "Connecticut",
  newyork: "New York",
  newjersey: "New Jersey",
  pennsylvania: "Pennsylvania",
  delaware: "the Lower Counties (Delaware)",
  maryland: "Maryland",
  virginia: "Virginia",
  northcarolina: "North Carolina",
  southcarolina: "South Carolina",
  georgia: "Georgia",
  florida: "Florida",
  louisiana: "Louisiana",
  illinois: "the Illinois country",
  ohio: "the Ohio country",
  bermuda: "Bermuda",
  bahamas: "the Bahamas",
  islands: "the sugar islands",
  jamaica: "Jamaica",
  cuba: "Cuba",
  hispaniola: "Hispaniola",
  puertorico: "Puerto Rico",
  curacao: "Curaçao",
  newspain: "New Spain",
  mainland: "the Spanish Main",
  north: "the far north",
  west: "the far west",
};

/** Which colony each province lies in (others are placed by where they are). */
const PROVINCE_COLONY: Record<string, Colony> = {
  avalon: "newfoundland",
  placentia: "newfoundland",
  "bay-of-exploits": "newfoundland",
  "petit-nord": "newfoundland",
  "red-bay": "newfoundland",
  "port-royal": "acadia",
  "la-heve": "acadia",
  chebucto: "acadia",
  beaubassin: "acadia",
  "saint-jean": "acadia",
  "ile-saint-jean": "acadia",
  "ile-royale": "acadia",
  miramichi: "acadia",
  quebec: "canada",
  "trois-rivieres": "canada",
  hochelaga: "canada",
  tadoussac: "canada",
  saguenay: "canada",
  gaspe: "canada",
  outaouais: "canada",
  cataraqui: "canada",
  champlain: "canada",
  "sept-iles": "canada",
  wendake: "canada",
  teiaiagon: "canada",
  niagara: "canada",
  attawandaron: "canada",
  detroit: "canada",
  michilimackinac: "canada",
  "la-baye": "canada",
  "saint-joseph": "canada",
  saginaw: "canada",
  "grand-river": "canada",
  bawating: "canada",
  odawa: "canada",
  chequamegon: "canada",
  checagou: "canada",
  ouisconsin: "canada",
  sagadahoc: "maine",
  norridgewock: "maine",
  pentagoet: "maine",
  madawaska: "maine",
  piscataqua: "newhampshire",
  pennacook: "newhampshire",
  "massachusetts-bay": "massachusetts",
  plymouth: "massachusetts",
  pocumtuck: "massachusetts",
  narragansett: "rhodeisland",
  connecticut: "connecticut",
  pequot: "connecticut",
  "new-amsterdam": "newyork",
  paumanok: "newyork",
  esopus: "newyork",
  "fort-orange": "newyork",
  mohawk: "newyork",
  oneida: "newyork",
  onondaga: "newyork",
  seneca: "newyork",
  adirondack: "newyork",
  raritan: "newjersey",
  minisink: "newjersey",
  upland: "pennsylvania",
  susquehannock: "pennsylvania",
  shamokin: "pennsylvania",
  allegheny: "pennsylvania",
  "forks-of-the-ohio": "pennsylvania",
  erie: "pennsylvania",
  "fort-christina": "delaware",
  zwaanendael: "delaware",
  "st-mary-s": "maryland",
  piscataway: "maryland",
  severn: "maryland",
  jamestown: "virginia",
  pamunkey: "virginia",
  appamattuck: "virginia",
  nansemond: "virginia",
  rappahannock: "virginia",
  monacan: "virginia",
  accomac: "virginia",
  shenandoah: "virginia",
  "blue-ridge": "virginia",
  kanawha: "virginia",
  bluegrass: "virginia",
  "falls-of-the-ohio": "virginia",
  cumberland: "northcarolina",
  albemarle: "northcarolina",
  roanoke: "northcarolina",
  pamlico: "northcarolina",
  "cape-fear": "northcarolina",
  tuscarora: "northcarolina",
  saura: "northcarolina",
  kituwah: "northcarolina",
  chota: "northcarolina",
  "charles-town": "southcarolina",
  "santa-elena": "southcarolina",
  winyah: "southcarolina",
  congaree: "southcarolina",
  catawba: "southcarolina",
  keowee: "southcarolina",
  etowah: "georgia",
  guale: "georgia",
  ocmulgee: "georgia",
  coweta: "georgia",
  tallapoosa: "georgia",
  coosa: "georgia",
  "st-augustine": "florida",
  timucua: "florida",
  apalachee: "florida",
  mayaimi: "florida",
  tequesta: "florida",
  calusa: "florida",
  tocobaga: "florida",
  ais: "florida",
  pensacola: "florida",
  bayogoula: "louisiana",
  mobile: "louisiana",
  natchez: "louisiana",
  tunica: "louisiana",
  atakapa: "louisiana",
  quapaw: "louisiana",
  ouachita: "louisiana",
  choctaw: "louisiana",
  chickasaw: "louisiana",
  "muscle-shoals": "louisiana",
  kadohadacho: "louisiana",
  cahokia: "illinois",
  peoria: "illinois",
  wabash: "illinois",
  osage: "illinois",
  kansa: "illinois",
  scioto: "ohio",
  cuyahoga: "ohio",
  sandusky: "ohio",
  kekionga: "ohio",
  bermuda: "bermuda",
  "new-providence": "bahamas",
  abaco: "bahamas",
  andros: "bahamas",
  guanahani: "bahamas",
  barbados: "islands",
  antigua: "islands",
  "st-kitts": "islands",
  "st-thomas": "islands",
  martinique: "islands",
  guadeloupe: "islands",
  dominica: "islands",
  "st-lucia": "islands",
  "st-vincent": "islands",
  grenada: "islands",
  tobago: "islands",
  trinidad: "islands",
  margarita: "mainland",
  jamaica: "jamaica",
  havana: "cuba",
  "santiago-de-cuba": "cuba",
  bayamo: "cuba",
  "puerto-principe": "cuba",
  "sancti-spiritus": "cuba",
  "vuelta-abajo": "cuba",
  "santo-domingo": "hispaniola",
  higuey: "hispaniola",
  cibao: "hispaniola",
  "le-cap": "hispaniola",
  leogane: "hispaniola",
  tiburon: "hispaniola",
  "san-juan": "puertorico",
  curacao: "curacao",
  aruba: "curacao",
  bonaire: "curacao",
  portobelo: "mainland",
  panama: "mainland",
  darien: "mainland",
};

/** The colony a province lies in. */
export function colonyOf(map: MapDef, p: number): Colony {
  const def = map.provinces[p];
  if (!def) return "west";
  const known = PROVINCE_COLONY[def.id];
  if (known) return known;
  if (def.lat >= 50) return "north";
  if (def.lon <= -100) return def.lat < 33 ? "newspain" : "west";
  if (def.lat < 24) return def.lon < -86 ? "newspain" : "mainland";
  if (def.lon < -95) return "newspain";
  if (def.lat > 44) return "canada";
  return "ohio";
}

/** The English colonies that joined the Continental Association (Georgia late). */
const THIRTEEN: Colony[] = [
  "maine",
  "newhampshire",
  "massachusetts",
  "rhodeisland",
  "connecticut",
  "newyork",
  "newjersey",
  "pennsylvania",
  "delaware",
  "maryland",
  "virginia",
  "northcarolina",
  "southcarolina",
  "georgia",
];

export function isThirteen(c: Colony): boolean {
  return THIRTEEN.includes(c);
}

// ---------------------------------------------------------------- whose law

/** Whose law runs: the people of the crown that holds a province now. */
export type LawOf =
  | "english"
  | "french"
  | "spanish"
  | "dutch"
  | "swedish"
  | "native"
  | "none";

/** Whose law runs in a province now, and the adjective for it. */
export function lawOf(
  s: GameState,
  p: number,
): { law: LawOf; nation: number; adjective: string } {
  const pr = s.provinces[p];
  const n = pr && pr.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!n) return { law: "none", nation: -1, adjective: "nobody's" };
  if (n.kind === "native")
    return { law: "native", nation: n.id, adjective: n.adjective };
  const c = n.culture;
  const law: LawOf =
    c === "english" ||
    c === "french" ||
    c === "spanish" ||
    c === "dutch" ||
    c === "swedish"
      ? c
      : "english";
  return { law, nation: n.id, adjective: n.adjective };
}

// ---------------------------------------------------------------- the money of the time

/** Coins to a pound of colonial money (a hand's wage, 2 a month, is about £16 a year). */
export const POUND = 1.5;
/** What a deed of manumission costs to draw and record (the clerk's and the court's fees). */
export const DEED_FEE = 2;
/** What carrying someone freed out of the colony costs, when the law sends them away. */
export const PASSAGE = 6;

// ---------------------------------------------------------------- freeing someone

/** The kind of hurdle the law set before freeing someone. */
export type FreeKind =
  /** A deed (or a will), recorded. */
  | "deed"
  /** A deed, and security given that they'll never come on the town. */
  | "security"
  /** A petition: the governor and council, the county court, the Superior Council... */
  | "petition"
  /** Not at all here. */
  | "none";

export interface FreeRule {
  kind: FreeKind;
  /** The law, named: "the act of 1723". */
  law: string;
  /** In plain words. */
  text: string;
  /** Fees paid now, in coins (on the button). */
  fee: number;
  /** A bond or security: coins you must show you have; not spent unless they come on the town. */
  security?: number;
  /** Coins a year the law has you pay the freed (New York, 1712 to 1729). */
  allowance?: number;
  /** Months before the freed must leave the colony (they go, at your cost: PASSAGE). */
  leave?: number;
  /** Who decides a petition, how often they grant one, and how long it takes. */
  petition?: { who: string; odds: number; days: number };
  /** Whether a will can free them. */
  will: boolean;
  /** Only people this age or under may be freed. */
  maxAge?: number;
  /** The master must be this old (the Code Noir). */
  minAge?: number;
}

const deed = (law: string, text: string, will = true): FreeRule => ({
  kind: "deed",
  law,
  text,
  fee: DEED_FEE,
  will,
});

/** How someone may be freed in a colony under a crown's law in a year. */
export function freeRule(law: LawOf, col: Colony, year: number): FreeRule {
  switch (law) {
    case "english":
      return englishFreeing(col, year);
    case "french":
      if (col === "louisiana" || col === "illinois")
        return year >= 1724
          ? {
              kind: "petition",
              law: "the Code Noir of Louisiana (1724), article 50",
              text: "A master of twenty-five may free someone only by a decree of the Superior Council; a freeing without it is void.",
              fee: 4,
              petition: { who: "the Superior Council", odds: 0.6, days: 60 },
              will: true,
              minAge: 25,
            }
          : deed(
              "the king's law in the colonies",
              "Freed by a written act before the commissary.",
            );
      if (col === "canada" || col === "acadia" || col === "north")
        return deed(
          year >= 1736
            ? "the intendant Hocquart's ordinance of 1736"
            : "the custom of New France",
          year >= 1736
            ? "Freed only by an act drawn before a notary and registered."
            : "Freed by a written act; most of those held here were panis, Indigenous captives from the west.",
        );
      return year >= 1713
        ? {
            kind: "petition",
            law: "the Code Noir (1685), article 55, and the edict of 1713",
            text: "Since 1713 freeing anyone in the islands needs the written leave of the governor and the intendant, and a tax paid.",
            fee: 10,
            petition: {
              who: "the governor and the intendant",
              odds: 0.75,
              days: 45,
            },
            will: true,
            minAge: 20,
          }
        : {
            ...deed(
              "the Code Noir (1685), article 55",
              "A master of twenty may free someone by a deed or by will, without giving a reason. The freed are French subjects.",
            ),
            minAge: 20,
          };
    case "spanish":
      return deed(
        "the Siete Partidas and the Laws of the Indies",
        "Freed by a letter of liberty before a notary. By custom (coartación) the enslaved may have their price fixed and buy their own freedom, and a master can't refuse it.",
      );
    case "dutch":
      return deed(
        "the West India Company's ordinances",
        "Freed by a deed before the Company's secretary (in 1644 New Netherland gave eleven men a 'half-freedom' that left their children bound).",
      );
    case "swedish":
      return deed(
        "Swedish law, which had no slave code",
        "Freed by a written act.",
      );
    default:
      return {
        kind: "none",
        law: "none",
        text: "No colony's law runs here.",
        fee: 0,
        will: false,
      };
  }
}

function englishFreeing(col: Colony, year: number): FreeRule {
  switch (col) {
    case "virginia":
      if (year >= 1723)
        return {
          kind: "petition",
          law: "the act of 1723",
          text: 'No one may be freed "upon any pretence whatsoever, except for some meritorious services", judged by the governor and council, who must grant a licence. A will that frees anyone without it is void. Fewer than twenty-five were freed this way before the Revolution.',
          fee: 3,
          petition: { who: "the governor and council", odds: 0.12, days: 90 },
          will: false,
        };
      if (year >= 1691)
        return {
          kind: "deed",
          law: "the act of 1691",
          text: "Freed by a deed or a will, but the one who frees them must pay to carry them out of Virginia within six months.",
          fee: DEED_FEE,
          leave: 6,
          will: true,
        };
      return deed("the custom of Virginia", "Freed by a deed or by will.");
    case "maryland":
      return year >= 1752
        ? {
            kind: "deed",
            law: "the act of June 1752",
            text: "Only by a deed signed, sealed, witnessed by two, acknowledged before a justice and recorded within six months; never by a will; and only someone of fifty or under, sound and able to work.",
            fee: 3,
            will: false,
            maxAge: 50,
          }
        : deed("the custom of Maryland", "Freed by a deed or by will.");
    case "northcarolina":
      return year >= 1741
        ? {
            kind: "petition",
            law: "the act of 1741",
            text: "Only for meritorious services, allowed by the county court; and the freed must leave the colony within six months.",
            fee: 3,
            petition: { who: "the county court", odds: 0.35, days: 60 },
            leave: 6,
            will: true,
          }
        : deed("the custom of Carolina", "Freed by a deed or by will.");
    case "southcarolina":
      if (year >= 1740)
        return deed(
          "the Negro Act of 1740 (silent on freeing)",
          "Freed by a deed or by will; the act of 1740 dropped the old rule that the freed must leave.",
        );
      if (year >= 1735)
        return {
          kind: "deed",
          law: "the act of 1735",
          text: "Freed by a deed or a will, but they must leave the province within six months and never come back.",
          fee: DEED_FEE,
          leave: 6,
          will: true,
        };
      if (year >= 1722)
        return {
          kind: "deed",
          law: "the act of 1722",
          text: "Freed by a deed or a will, but they must leave the province within twelve months, unless both houses of the Assembly allow them to stay.",
          fee: DEED_FEE,
          leave: 12,
          will: true,
        };
      return deed("the custom of Carolina", "Freed by a deed or by will.");
    case "georgia":
      return deed(
        "Georgia's codes of 1755 and 1770",
        "Freed by a deed or by will.",
      );
    case "pennsylvania":
      return year >= 1726
        ? {
            kind: "security",
            law: "the act of 1726",
            text: "Freed by a deed, with security of £30 to the county that they won't come on the poor rates.",
            fee: DEED_FEE,
            security: Math.round(30 * POUND),
            will: true,
          }
        : deed("the custom of Pennsylvania", "Freed by a deed or by will.");
    case "delaware":
      return year >= 1767
        ? {
            kind: "security",
            law: "the act of 31 October 1767",
            text: "Freed by a deed or a will, with a recognizance of £60 for each person at the county's quarter sessions; until it's given they aren't free.",
            fee: DEED_FEE,
            security: Math.round(60 * POUND),
            will: true,
          }
        : deed("the custom of the Lower Counties", "Freed by a deed or by will.");
    case "newjersey":
      return year >= 1714
        ? {
            kind: "security",
            law: "the act of 1714",
            text: "Freed by a deed, with security of £200 for their keep; and the act forbade the freed to hold land.",
            fee: 3,
            security: Math.round(200 * POUND),
            will: true,
          }
        : deed("the custom of New Jersey", "Freed by a deed or by will.");
    case "newyork":
      if (year >= 1730)
        return {
          kind: "security",
          law: "the act of 1730",
          text: "Freed by a deed or a will, with a bond of £200 and two sureties; without it the freeing is void.",
          fee: 3,
          security: Math.round(200 * POUND),
          will: true,
        };
      if (year >= 1712)
        return {
          kind: "security",
          law: "the act of December 1712",
          text: "Freed by a deed or a will, with security of £200 to the Crown, and £20 a year paid to the freed for life.",
          fee: 3,
          security: Math.round(200 * POUND),
          allowance: Math.round(20 * POUND),
          will: true,
        };
      return deed("the Duke's Laws (1665)", "Freed by a deed or by will.");
    case "massachusetts":
    case "maine":
      return year >= 1703
        ? {
            kind: "security",
            law: "the act of 1703",
            text: "Freed by a deed, with a bond of £50 to the town for their keep if they ever come to want.",
            fee: DEED_FEE,
            security: Math.round(50 * POUND),
            will: true,
          }
        : deed("the Body of Liberties (1641)", "Freed by a deed or by will.");
    case "rhodeisland":
      return year >= 1728
        ? {
            kind: "security",
            law: "the act of 1728",
            text: "Freed by a deed, with a bond of £100 to the town.",
            fee: DEED_FEE,
            security: Math.round(100 * POUND),
            will: true,
          }
        : deed("the custom of Rhode Island", "Freed by a deed or by will.");
    case "connecticut":
      return deed(
        year >= 1702 ? "the act of 1702" : "the custom of Connecticut",
        year >= 1702
          ? "Freed by a deed; the one who frees them stays liable for their keep if they ever come to want."
          : "Freed by a deed or by will.",
      );
    default:
      return deed("the law of England's colonies", "Freed by a deed or by will.");
  }
}

// ---------------------------------------------------------------- whether people may be held

interface Held {
  legal: boolean;
  /** The law it rests on, in force now. */
  code: string;
  /** Since when (or until when, if forbidden). */
  why: string;
}

const held = (code: string, why: string): Held => ({ legal: true, code, why });
const banned = (code: string, why: string): Held => ({
  legal: false,
  code,
  why,
});

/** Whether people may be held in bondage in a colony under a crown's law in a year. */
function holding(law: LawOf, col: Colony, year: number): Held {
  switch (law) {
    case "english":
      return englishHolding(col, year);
    case "french":
      if (col === "louisiana" || col === "illinois")
        return year >= 1724
          ? held(
              "the Code Noir of Louisiana (1724)",
              "Lawful: the Code Noir of 1724, which governs the enslaved and those who hold them.",
            )
          : held(
              "the king's law in the colonies",
              "Lawful: the Company of the Indies brings ships from Africa from 1719.",
            );
      if (col === "canada" || col === "acadia" || col === "north")
        return year >= 1689
          ? held(
              year >= 1709
                ? "the Raudot ordinance (1709)"
                : "the king's leave (1689)",
              year >= 1709
                ? "Lawful: the intendant Raudot's ordinance of 1709 says the panis and Africans bought here belong to those who bought them."
                : "Lawful: Louis XIV gave the colonists leave to hold slaves in 1689.",
            )
          : banned(
              "no law yet",
              "Not yet: the king hasn't given New France leave to hold slaves (he will in 1689).",
            );
      return held(
        year >= 1685 ? "the Code Noir (1685)" : "the king's law in the colonies",
        year >= 1685
          ? "Lawful: the Code Noir of March 1685 governs the enslaved in the islands."
          : "Lawful, by custom: the islands have been worked by enslaved Africans since their first years.",
      );
    case "spanish":
      return held(
        "the Siete Partidas and the Laws of the Indies",
        "Lawful: Spain's law allows it, with the Church's rules on marriage and freedom.",
      );
    case "dutch":
      return held(
        "the West India Company's ordinances",
        "Lawful: the West India Company brought the first eleven African men to New Amsterdam in 1626.",
      );
    case "swedish":
      return held(
        "Swedish law (no slave code)",
        "Not forbidden: Sweden has no slave code; a very few are held here, and none are sold.",
      );
    case "native":
      return banned(
        "the people's own ways",
        "No colony's law runs in the people's own country: you can't hold anyone in bondage here.",
      );
    default:
      return banned("no law", "Nobody's law runs here.");
  }
}

function englishHolding(col: Colony, year: number): Held {
  switch (col) {
    case "virginia":
      return year >= 1662
        ? held(
            year >= 1705 ? "the slave code of 1705" : "the act of 1662",
            year >= 1705
              ? "Lawful: the code of October 1705, on the act of 1662 that children follow their mother's condition."
              : "Lawful: the act of December 1662 makes bondage hereditary through the mother.",
          )
        : banned(
            "custom, not yet law",
            "Not yet in the law: Africans have been here since 1619, held as servants with terms set by custom, a few for life by the courts (John Punch, 1640). Virginia's law makes bondage hereditary in 1662; until then only indentures are bought here.",
          );
    case "maryland":
      return year >= 1664
        ? held(
            "the act of 1664",
            "Lawful: the act of 1664 makes servitude for life (durante vita).",
          )
        : banned(
            "custom, not yet law",
            "Not yet in the law: Maryland's act of 1664 will make servitude for life. Until then only indentures are bought here.",
          );
    case "massachusetts":
    case "maine":
    case "newhampshire":
      return year >= 1641
        ? held(
            "the Body of Liberties (1641)",
            'Lawful: the Body of Liberties (1641) forbids "bond slaverie" except for "lawfull Captives taken in just warres, and such strangers as willingly selle themselves or are sold to us".',
          )
        : banned("no law yet", "Not yet: Massachusetts writes its law in 1641.");
    case "connecticut":
      return year >= 1650
        ? held(
            "the Code of 1650",
            "Lawful: the Code of 1650 copies Massachusetts' article on bondage.",
          )
        : banned("no law yet", "Not yet: Connecticut's code comes in 1650.");
    case "rhodeisland":
      return year >= 1652
        ? held(
            "the colony's acts",
            year < 1703
              ? "Lawful, though Providence and Warwick's act of 1652 limits anyone's bondage to ten years (a law nobody enforces)."
              : "Lawful: the act of 1652 that limited bondage to ten years has fallen out of use, and Newport is fast becoming the colonies' great slaving port.",
          )
        : banned("no law yet", "Not yet.");
    case "newyork":
      return year >= 1664
        ? held(
            year >= 1712 ? "the act of 1712" : "the Duke's Laws (1665)",
            year >= 1712
              ? "Lawful, under New York's slave codes of 1702 and 1712, among the strictest in the north."
              : "Lawful: the Duke's Laws of 1665 recognise it, as the Dutch did before.",
          )
        : banned("no law yet", "Not yet English.");
    case "newjersey":
      return held(
        year >= 1714 ? "the act of 1714" : "the Concessions (1665)",
        "Lawful: the proprietors' Concessions of 1665 even gave land for each slave brought in.",
      );
    case "pennsylvania":
      return year >= 1682
        ? held(
            year >= 1726 ? "the act of 1726" : "the act of 1700",
            year >= 1758
              ? "Lawful, but the Quakers' Yearly Meeting resolved in 1758 to keep Friends who buy or sell anyone out of its business."
              : "Lawful: Penn himself held slaves, though the Friends of Germantown protested in 1688.",
          )
        : held("the Dutch and Swedes' custom", "Lawful, by custom.");
    case "delaware":
      return held(
        year >= 1767 ? "the act of 1767" : "the Lower Counties' acts",
        "Lawful.",
      );
    case "northcarolina":
    case "southcarolina":
      if (year < 1669)
        return banned("no colony yet", "Not yet: Carolina is chartered in 1663 and settled in 1670.");
      return held(
        col === "southcarolina"
          ? year >= 1740
            ? "the Negro Act of 1740"
            : year >= 1712
              ? "the act of 1712"
              : "the Fundamental Constitutions (1669)"
          : year >= 1741
            ? "the act of 1741"
            : year >= 1715
              ? "the act of 1715"
              : "the Fundamental Constitutions (1669)",
        year >= 1740 && col === "southcarolina"
          ? "Lawful: the Negro Act of May 1740, passed after the rising at Stono, governs every part of the enslaved's lives."
          : 'Lawful: the Fundamental Constitutions give every freeman "absolute power and authority over his negro slaves".',
      );
    case "georgia":
      if (year < 1733)
        return held(
          "South Carolina's acts",
          "Lawful: this is Carolina's frontier until Georgia is founded in 1733.",
        );
      if (year < 1751)
        return banned(
          "the Trustees' act of 1735",
          "Forbidden: Georgia's Trustees banned slavery from the colony's founding, by the act of 1735. Repealed from 1 January 1751.",
        );
      return held(
        year >= 1770
          ? "the code of 1770"
          : year >= 1755
            ? "the code of 1755"
            : "the repeal of 1750",
        "Lawful since 1 January 1751, when the Trustees' ban was lifted; Georgia's code of 1755 copies South Carolina's.",
      );
    case "islands":
    case "jamaica":
    case "bermuda":
    case "bahamas":
      return held(
        year >= 1661 ? "Barbados' act of 1661 and its copies" : "the islands' custom",
        year >= 1661
          ? "Lawful: Barbados' 'Act for the better ordering and governing of Negroes' (1661) is the model for every English island's code."
          : "Lawful: Barbados' council resolved in 1636 that Africans and Indians brought to be sold serve for life.",
      );
    case "canada":
      return held(
        "the capitulation of Montreal (1760)",
        "Lawful: under British rule, article 47 of the capitulation of 1760 leaves the enslaved to those who held them.",
      );
    default:
      return held(
        "the law of England's colonies",
        "Lawful: no code of its own, but nothing here forbids it.",
      );
  }
}

// ---------------------------------------------------------------- the law's other rules

export interface BondLaw {
  p: number;
  colony: Colony;
  /** "Virginia". */
  where: string;
  law: LawOf;
  /** "English". */
  ruler: string;
  legal: boolean;
  /** The law in force, named. */
  code: string;
  /** In a sentence: lawful or not, and on what. */
  why: string;
  /** How someone may be freed here. */
  freeing: FreeRule;
  /** Whether the law lets them be taught to read, and to write. */
  reading: boolean;
  writing: boolean;
  /** Why not, if not. */
  lettersWhy?: string;
  /** Religious instruction: free to choose, or the law requires it. */
  church: "free" | "required";
  /** Whether a family may be sold apart (the Code Noir forbids it). */
  apart: boolean;
  /** May the enslaved buy their own freedom by right (Spanish coartación), or only if you agree. */
  selfPurchase: "right" | "consent";
  /** Patrols ride at night here. */
  patrols: boolean;
  /** Other rules worth knowing, in plain words. */
  notes: string[];
}

/** The law of bondage in a province on a day. */
export function bondLaw(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): BondLaw {
  const year = dateOf(day).year;
  const col = colonyOf(map, p);
  const { law, adjective } = lawOf(s, p);
  const h = holding(law, col, year);
  const notes: string[] = [];
  let reading = true;
  let writing = true;
  let lettersWhy: string | undefined;
  let church: "free" | "required" = "free";
  let apart = true;
  let patrols = false;
  if (law === "english") {
    if (col === "southcarolina" && year >= 1740) {
      writing = false;
      lettersWhy =
        "The Negro Act of 1740 fines anyone who teaches an enslaved person to write £100.";
    }
    if (col === "georgia" && year >= 1755) {
      writing = false;
      lettersWhy =
        "Georgia's code of 1755 forbids teaching an enslaved person to write.";
      if (year >= 1770) {
        reading = false;
        lettersWhy =
          "Georgia's code of 1770 forbids teaching an enslaved person to read or to write.";
      }
    }
    patrols =
      (col === "southcarolina" && year >= 1704) ||
      (col === "virginia" && year >= 1727) ||
      (col === "northcarolina" && year >= 1753) ||
      (col === "georgia" && year >= 1757);
    if (col === "virginia" && year >= 1667)
      notes.push(
        "Baptism doesn't free anyone (1667); a certificate is needed to leave the plantation (1680).",
      );
    if (col === "virginia" && year >= 1705)
      notes.push(
        "The code of 1705 counts the enslaved as real estate, passing to heirs with the land.",
      );
    if (col === "southcarolina" && year >= 1740)
      notes.push(
        "The Negro Act limits the day's work to fifteen hours in summer and fourteen in winter, forbids work on Sundays, and needs a ticket for anyone off the plantation.",
      );
    if (col === "newyork" && year >= 1712)
      notes.push(
        "No more than three may gather together; none may carry arms (the act of 1712).",
      );
    if (
      (col === "massachusetts" || col === "maine") &&
      year >= 1766
    )
      notes.push(
        "Freedom suits are heard in the courts (Jenny Slew won hers in 1766), and the enslaved of Boston petition the General Court for freedom (1773).",
      );
    if (col === "pennsylvania" && year >= 1773)
      notes.push(
        "The duty of 1773 adds £20 to the price of anyone brought in: few ships come.",
      );
  } else if (law === "french") {
    church = "required";
    if (col === "louisiana" || col === "illinois") {
      if (year >= 1724) {
        apart = false;
        notes.push(
          "The Code Noir of 1724 (article 43) forbids selling a husband and wife apart, or children under fourteen from their parents: such a sale is void.",
        );
      }
    } else if (col !== "canada" && col !== "acadia" && col !== "north" && year >= 1685) {
      apart = false;
      notes.push(
        "The Code Noir (article 47) forbids selling a husband, a wife and their young children apart.",
      );
    }
    notes.push(
      "The Code Noir (article 2) has every enslaved person baptized and taught the Catholic faith, and Sundays and feast days kept.",
    );
  } else if (law === "spanish") {
    church = "required";
    notes.push(
      "The Church marries the enslaved and baptizes their children; by custom they may buy their freedom at a price fixed (coartación).",
    );
    if (col === "florida" && year >= 1693 && year < 1763)
      notes.push(
        "By the king's edict of 1693, anyone fleeing slavery in the English colonies who reaches Florida and becomes a Catholic is free.",
      );
  }
  const freeing = freeRule(law, col, year);
  return {
    p,
    colony: col,
    where: COLONY_NAMES[col],
    law,
    ruler: adjective,
    legal: h.legal,
    code: h.code,
    why: h.why,
    freeing,
    reading,
    writing,
    ...(lettersWhy ? { lettersWhy } : {}),
    church,
    apart,
    selfPurchase: law === "spanish" ? "right" : "consent",
    patrols,
    notes,
  };
}

/** Whether people may be held in a province on a day (the quick check). */
export function holdingLawful(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): boolean {
  const year = dateOf(day).year;
  const { law } = lawOf(s, p);
  return holding(law, colonyOf(map, p), year).legal;
}

// ---------------------------------------------------------------- where people were sold

/** A port where people were sold: whose, from when, and how often a ship came. */
export interface MarketDef {
  /** The province's id. */
  id: string;
  law: LawOf;
  from: number;
  to?: number;
  /** Chance in a month that a ship (or an estate's sale) has people to sell. */
  chance: number;
  /** The years the trade was at its height, when ships came more often. */
  peak?: [number, number, number];
}

/**
 * The ports of the trade, as they were. A ship didn't come every month; the
 * chance a month rises at the trade's height. Nowhere else sold people
 * openly enough to buy them in the game.
 */
export const MARKETS: MarketDef[] = [
  // English: the Chesapeake, the Carolinas, Georgia, the north, the islands.
  { id: "jamestown", law: "english", from: 1662, chance: 0.15, peak: [1700, 1774, 0.35] },
  { id: "rappahannock", law: "english", from: 1662, chance: 0.08, peak: [1700, 1774, 0.25] },
  { id: "pamunkey", law: "english", from: 1662, chance: 0.08, peak: [1700, 1774, 0.2] },
  { id: "severn", law: "english", from: 1664, chance: 0.08, peak: [1700, 1774, 0.25] },
  { id: "st-mary-s", law: "english", from: 1664, chance: 0.06 },
  { id: "charles-town", law: "english", from: 1670, chance: 0.15, peak: [1700, 1774, 0.5] },
  { id: "cape-fear", law: "english", from: 1730, chance: 0.06 },
  { id: "albemarle", law: "english", from: 1670, chance: 0.04 },
  { id: "guale", law: "english", from: 1751, chance: 0.12, peak: [1766, 1775, 0.35] },
  { id: "new-amsterdam", law: "english", from: 1664, chance: 0.1, peak: [1700, 1774, 0.14] },
  { id: "raritan", law: "english", from: 1665, chance: 0.04 },
  { id: "upland", law: "english", from: 1682, chance: 0.08 },
  { id: "massachusetts-bay", law: "english", from: 1641, chance: 0.05 },
  { id: "narragansett", law: "english", from: 1700, chance: 0.08, peak: [1725, 1774, 0.12] },
  { id: "barbados", law: "english", from: 1636, chance: 0.6, peak: [1660, 1774, 0.75] },
  { id: "antigua", law: "english", from: 1650, chance: 0.4 },
  { id: "st-kitts", law: "english", from: 1640, chance: 0.4 },
  { id: "jamaica", law: "english", from: 1656, chance: 0.5, peak: [1690, 1774, 0.8] },
  // French: the islands, Saint-Domingue, Louisiana (the Company's ships, 1719 to 1731).
  { id: "martinique", law: "french", from: 1640, chance: 0.5 },
  { id: "guadeloupe", law: "french", from: 1640, chance: 0.45 },
  { id: "le-cap", law: "french", from: 1697, chance: 0.5, peak: [1730, 1774, 0.8] },
  { id: "leogane", law: "french", from: 1697, chance: 0.4 },
  { id: "bayogoula", law: "french", from: 1719, chance: 0.04, peak: [1719, 1731, 0.3] },
  { id: "mobile", law: "french", from: 1719, chance: 0.02, peak: [1719, 1731, 0.12] },
  // Spanish: the asiento's ports.
  { id: "havana", law: "spanish", from: 1607, chance: 0.4 },
  { id: "santiago-de-cuba", law: "spanish", from: 1607, chance: 0.15 },
  { id: "santo-domingo", law: "spanish", from: 1607, chance: 0.15 },
  { id: "san-juan", law: "spanish", from: 1607, chance: 0.12 },
  { id: "veracruz", law: "spanish", from: 1607, chance: 0.3 },
  { id: "portobelo", law: "spanish", from: 1607, chance: 0.25 },
  // Dutch: New Amsterdam under the Company; Curaçao, the great depot.
  { id: "new-amsterdam", law: "dutch", from: 1626, to: 1664, chance: 0.06, peak: [1655, 1664, 0.12] },
  { id: "curacao", law: "dutch", from: 1660, chance: 0.6 },
];

/** Ports where servants' indentures were sold (and New France's engagés), by crown. */
export function indenturesAt(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): boolean {
  const def = map.provinces[p];
  if (!def?.coastal) return false;
  const year = dateOf(day).year;
  const { law } = lawOf(s, p);
  const pr = s.provinces[p];
  if (!pr?.b.port && !(pr && pr.pops.length)) return false;
  if (law === "english") return true;
  // French engagés: three years' service, until the 1730s.
  if (law === "french") return year < 1735;
  return false;
}

/** Why no ship brings people for sale here now, if the law stopped the trade. */
export function importBan(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): string | null {
  const d = dateOf(day);
  const col = colonyOf(map, p);
  const { law } = lawOf(s, p);
  if (law !== "english") return null;
  const ym = d.year * 12 + d.month;
  if (col === "rhodeisland" && ym >= 1774 * 12 + 5)
    return "Rhode Island's act of June 1774 forbids bringing anyone enslaved into the colony; those brought in are free.";
  if (col === "connecticut" && ym >= 1774 * 12 + 9)
    return "Connecticut's act of 1774 forbids bringing anyone enslaved into the colony.";
  if (isThirteen(col) && ym >= 1774 * 12 + 11 && (col !== "georgia" || ym >= 1775 * 12 + 6))
    return 'The Continental Association: from 1 December 1774 the colonies "will neither import nor purchase any slave imported".';
  return null;
}

/** The chance in a month that people are for sale at a port now (0 if none). */
export function saleChance(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): number {
  const id = map.provinces[p]?.id;
  if (!id) return 0;
  const year = dateOf(day).year;
  const { law } = lawOf(s, p);
  const m = MARKETS.find(
    (x) =>
      x.id === id && x.law === law && year >= x.from && (x.to === undefined || year < x.to),
  );
  if (!m) return 0;
  if (!holdingLawful(s, map, p, day)) return 0;
  // The Association stops the ships, not the sales of an estate.
  let chance = m.peak && year >= m.peak[0] && year <= m.peak[1] ? m.peak[2] : m.chance;
  if (importBan(s, map, p, day)) chance = Math.min(chance, 0.04);
  if (colonyOf(map, p) === "pennsylvania" && year >= 1773) chance *= 0.3;
  return Math.round(chance * 1000) / 1000;
}

// ---------------------------------------------------------------- where those who flee make for

/** Where a freedom seeker might make for. */
export type Refuge =
  | "florida"
  | "swamp"
  | "nations"
  | "town"
  | "sea"
  | "maroons"
  | "dunmore"
  | "north";

export const REFUGE_NAMES: Record<Refuge, string> = {
  florida: "Spanish Florida, where the king's edict promises freedom",
  swamp: "the maroon settlements of the Great Dismal Swamp",
  nations: "the Native nations beyond the frontier",
  town: "a town, to pass as free among the free Black people there",
  sea: "a ship: sailors' work asks few questions",
  maroons: "the maroons in the island's mountains",
  dunmore: "Lord Dunmore's lines, where he promises freedom to any who fight",
  north: "the north, far from anyone who knows them",
};

/** Short names for the same, for tables. */
export const REFUGE_SHORT: Record<Refuge, string> = {
  florida: "Spanish Florida",
  swamp: "the Dismal Swamp",
  nations: "the Native nations",
  town: "a town",
  sea: "to sea",
  maroons: "the maroons",
  dunmore: "Dunmore's lines",
  north: "the north",
};

/**
 * The places someone fleeing a household in a province might make for, with
 * how much each draws (and whether it's near enough to matter).
 */
export function refugesFrom(
  s: GameState,
  map: MapDef,
  p: number,
  day: number = s.day,
): { to: Refuge; w: number }[] {
  const d = dateOf(day);
  const col = colonyOf(map, p);
  const out: { to: Refuge; w: number }[] = [];
  // Florida: from 1687 (the first eight men and two women reached St.
  // Augustine), promised by the edict of 1693, until Spain gave Florida up
  // in 1763. Only while Spain still holds St. Augustine.
  const aug = map.provinces.findIndex((x) => x.id === "st-augustine");
  const spanishAug =
    aug >= 0 && lawOf(s, aug).law === "spanish" && d.year >= 1687 && d.year < 1763;
  if (spanishAug && (col === "southcarolina" || col === "georgia"))
    out.push({ to: "florida", w: 4 });
  else if (spanishAug && col === "northcarolina") out.push({ to: "florida", w: 1 });
  if ((col === "virginia" || col === "northcarolina") && d.year >= 1700)
    out.push({ to: "swamp", w: 2 });
  if (col === "jamaica" || col === "hispaniola" || col === "cuba")
    out.push({ to: "maroons", w: col === "jamaica" && d.year >= 1740 ? 1 : 2 });
  if (
    col === "virginia" &&
    d.year === 1775 &&
    d.month >= 10
  )
    out.push({ to: "dunmore", w: 5 });
  const island = map.provinces[p] && !["virginia", "maryland", "northcarolina", "southcarolina", "georgia", "pennsylvania", "newyork", "newjersey", "delaware", "massachusetts", "connecticut", "rhodeisland", "newhampshire", "maine", "louisiana", "illinois", "canada", "acadia", "florida", "ohio"].includes(col);
  if (!island) out.push({ to: "nations", w: 1.2 });
  out.push({ to: "town", w: 1.5 });
  if (map.provinces[p]?.coastal) out.push({ to: "sea", w: 1 });
  if (
    col === "maryland" ||
    col === "virginia" ||
    col === "delaware" ||
    col === "newjersey"
  )
    out.push({ to: "north", w: 0.8 });
  return out;
}

// ---------------------------------------------------------------- the history

/** Something that happened, dated and placed, for the Estate page and the guide. */
export interface BondEvent {
  year: number;
  /** 1 to 12, if known. */
  month?: number;
  /** The colonies it belongs to ("all": everywhere). */
  where: Colony[] | "all";
  text: string;
  /** Native enslavement, part of the world's history (never something players buy). */
  native?: boolean;
  /** A rising, a plot or a flight: the resistance. */
  rising?: boolean;
}

/** Bondage in the Americas, 1607 to 1776, as the game tells it. */
export const BOND_HISTORY: BondEvent[] = [
  { year: 1619, month: 8, where: ["virginia"], text: "\"Twenty and odd Negroes\", taken from a Portuguese slaver, are landed at Point Comfort from the White Lion and traded for food." },
  { year: 1626, where: ["newyork"], text: "The Dutch West India Company brings eleven African men to New Amsterdam: Paulo Angola, Simon Congo and Anthony Portuguese among them." },
  { year: 1636, where: ["islands"], text: "Barbados' council resolves that Africans and Indians brought to be sold \"should serve for life\"." },
  { year: 1637, where: ["massachusetts", "connecticut"], native: true, text: "After the Pequot War, captive Pequot women and children are given out as servants in New England, and men shipped to Bermuda and Providence Island." },
  { year: 1641, where: ["massachusetts", "maine", "newhampshire"], text: "The Massachusetts Body of Liberties forbids \"bond slaverie\", except for captives taken in just wars and strangers sold to the colony: the first English colonial law to allow it." },
  { year: 1644, where: ["newyork"], text: "New Netherland gives eleven Company men a \"half-freedom\": land of their own and a yearly due, but their children still bound." },
  { year: 1652, where: ["rhodeisland"], text: "Providence and Warwick limit anyone's bondage to ten years. The law is never enforced." },
  { year: 1661, where: ["islands", "jamaica"], text: "Barbados passes \"An Act for the better ordering and governing of Negroes\", the model for Jamaica's, South Carolina's and Antigua's codes." },
  { year: 1662, month: 12, where: ["virginia"], text: "Virginia's assembly rules that a child is \"bond or free only according to the condition of the mother\": bondage becomes hereditary." },
  { year: 1663, where: ["virginia"], rising: true, text: "In Gloucester County, indentured servants and enslaved men plot a rising; a servant betrays it." },
  { year: 1664, where: ["maryland"], text: "Maryland makes the servitude of Africans for life (durante vita)." },
  { year: 1667, where: ["virginia"], text: "Virginia declares that baptism does not free anyone from bondage." },
  { year: 1669, where: ["northcarolina", "southcarolina"], text: "Carolina's Fundamental Constitutions give every freeman \"absolute power and authority over his negro slaves\"." },
  { year: 1676, where: ["massachusetts", "rhodeisland", "connecticut"], native: true, text: "After King Philip's War, hundreds of Wampanoag, Narragansett and Nipmuc captives are sold into slavery in the West Indies." },
  { year: 1680, where: ["virginia"], text: "Virginia forbids the enslaved to carry arms or leave a plantation without a certificate." },
  { year: 1685, month: 3, where: ["islands", "hispaniola"], text: "Louis XIV's Code Noir governs the enslaved of the French islands: baptism, Sundays, families not to be sold apart, and terrible punishments." },
  { year: 1687, where: ["florida", "southcarolina"], rising: true, text: "Eight men, two women and a child flee Carolina by canoe and reach St. Augustine. Spain refuses to send them back." },
  { year: 1688, month: 2, where: ["pennsylvania", "newjersey", "delaware"], text: "Four Friends of Germantown write the first protest against slavery in the English colonies: \"Is there any that would be done or handled at this manner?\"" },
  { year: 1689, where: ["canada"], text: "Louis XIV gives the colonists of New France leave to hold slaves." },
  { year: 1691, where: ["virginia"], text: "Virginia: anyone who frees a slave must pay to carry them out of the colony." },
  { year: 1693, month: 11, where: ["florida", "southcarolina", "georgia"], text: "Charles II of Spain decrees that those fleeing slavery in the English colonies who reach Florida and become Catholics shall be free." },
  { year: 1704, where: ["florida", "southcarolina"], native: true, text: "James Moore's Carolinians and their Creek allies destroy the Apalachee missions and carry off more than a thousand Apalachee to be sold at Charles Town." },
  { year: 1704, where: ["southcarolina"], text: "South Carolina sets up the first slave patrols in the colonies; the other plantation colonies follow." },
  { year: 1705, month: 10, where: ["virginia"], text: "Virginia's slave code gathers the old acts and declares the enslaved real estate." },
  { year: 1709, month: 4, where: ["canada"], text: "The intendant Raudot's ordinance: the panis, Indigenous captives traded from the west, and Africans bought in New France belong to those who bought them." },
  { year: 1712, month: 4, where: ["newyork"], rising: true, text: "In New York some two dozen enslaved men and women, most of them Akan, set a fire on Maiden Lane and fight those who come to put it out; nine colonists die. Twenty-one are executed, and the assembly passes a harsher code." },
  { year: 1715, month: 4, where: ["southcarolina", "northcarolina", "georgia"], native: true, text: "The Yamasee War: the nations rise against Carolina's traders, whose trade in Native captives had driven raids across the southeast. When it ends, so does the great Indian slave trade." },
  { year: 1722, where: ["southcarolina"], text: "South Carolina orders that anyone freed must leave the province within twelve months." },
  { year: 1723, where: ["virginia"], text: "Virginia forbids freeing anyone \"except for some meritorious services\", by the governor and council's licence." },
  { year: 1724, month: 9, where: ["louisiana", "illinois"], text: "Louisiana's Code Noir: no selling husband and wife apart, or children under fourteen; no freeing without the Superior Council's decree." },
  { year: 1734, month: 4, where: ["canada"], rising: true, text: "Marie-Joseph Angélique, enslaved in Montreal, is accused of the fire that burns the merchants' quarter, and hanged." },
  { year: 1735, where: ["georgia"], text: "Parliament approves the Trustees' act banning slavery in Georgia." },
  { year: 1736, where: ["islands"], rising: true, text: "In Antigua a plot led by Court (\"Prince Klaas\") is discovered before it begins; dozens are executed." },
  { year: 1738, where: ["florida", "southcarolina", "georgia"], text: "Florida's governor founds Gracia Real de Santa Teresa de Mose north of St. Augustine: a free town of those who fled the English colonies, with Francisco Menéndez as captain of its militia." },
  { year: 1739, month: 3, where: ["jamaica"], rising: true, text: "After ten years of war, Jamaica's Leeward Maroons under Cudjoe make a treaty: their freedom and land, in return for sending back new runaways." },
  { year: 1739, month: 9, where: ["southcarolina", "georgia"], rising: true, text: "The Stono rising: some twenty Kongolese men under Jemmy march south for Florida with drums and a banner, crying \"Liberty\"; others join them. Militia catch them at the Edisto; about twenty colonists and some forty of the rebels die." },
  { year: 1740, month: 5, where: ["southcarolina"], text: "South Carolina's Negro Act: no gathering, no growing or selling for themselves, no teaching to write, a ticket for every journey." },
  { year: 1740, where: ["virginia", "maryland", "northcarolina", "southcarolina"], text: "George Whitefield's open letter rebukes the planters of the southern colonies for their cruelty to the enslaved." },
  { year: 1741, where: ["newyork"], rising: true, text: "A run of fires in New York sets off a panic about a plot of the enslaved and the poor: thirty Black men and four white people are executed, and seventy deported." },
  { year: 1746, where: ["virginia", "maryland", "northcarolina"], text: "John Woolman, a Quaker tailor of New Jersey, travels through Virginia and Carolina, and is troubled by what he sees in the houses that feed him." },
  { year: 1751, month: 1, where: ["georgia"], text: "Georgia's ban ends: slavery is lawful there from 1 January 1751." },
  { year: 1752, month: 6, where: ["maryland"], text: "Maryland forbids freeing anyone by will, or anyone over fifty." },
  { year: 1754, where: ["pennsylvania", "newjersey", "delaware", "rhodeisland"], text: "Woolman publishes Some Considerations on the Keeping of Negroes." },
  { year: 1758, where: ["pennsylvania", "newjersey", "delaware"], text: "The Philadelphia Yearly Meeting resolves to keep Friends who buy or sell slaves out of its business, and sends Woolman and others to visit those who hold them." },
  { year: 1760, month: 4, where: ["jamaica"], rising: true, text: "Tacky's War: hundreds of Coromantee men and women rise in Jamaica's St. Mary's parish. It takes months to put down." },
  { year: 1763, where: ["florida", "southcarolina", "georgia"], text: "Spain gives Florida up to Britain; the people of Mose leave with the Spanish for Cuba." },
  { year: 1766, where: ["massachusetts"], text: "Jenny Slew sues for her freedom in Massachusetts, and wins." },
  { year: 1770, where: ["pennsylvania"], text: "Anthony Benezet opens a school for Black children in Philadelphia." },
  { year: 1772, month: 6, where: "all", text: "In London, Lord Mansfield rules in Somerset's case that a slave brought to England can't be forced out of it. The news reaches the colonies by late summer." },
  { year: 1773, where: "all", text: "Phillis Wheatley, enslaved in Boston, publishes her Poems on Various Subjects in London. In Boston, enslaved men petition the General Court for their freedom." },
  { year: 1774, month: 6, where: ["rhodeisland"], text: "Rhode Island forbids bringing anyone enslaved into the colony." },
  { year: 1774, month: 10, where: "all", text: "The Continental Congress's Association: the colonies agree to \"neither import nor purchase any slave imported after the first day of December next\"." },
  { year: 1775, month: 4, where: ["pennsylvania"], text: "Philadelphians found the Society for the Relief of Free Negroes Unlawfully Held in Bondage." },
  { year: 1775, month: 11, where: ["virginia"], rising: true, text: "Lord Dunmore proclaims freedom for the enslaved men of rebels who will fight for the king; hundreds escape to his lines." },
];

/** The history of a colony up to a year (newest first), and what's everywhere. */
export function historyOf(col: Colony, year: number): BondEvent[] {
  return BOND_HISTORY.filter(
    (e) => e.year <= year && (e.where === "all" || e.where.includes(col)),
  ).sort((a, b) => b.year - a.year || (b.month ?? 0) - (a.month ?? 0));
}
