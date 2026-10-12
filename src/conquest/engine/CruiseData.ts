// SEA (r15): what a cruise is made of. The hunting grounds of the period,
// the pirates' havens and their years, the ships you meet and what they
// fetch, how the prize money is shared, and the difficulty of a chase, a
// boarding and a run from a man-of-war. One table: the engine rolls from
// it and the odds shown before you sign are reckoned from it (CruiseOdds.ts).

import type { BoatKind, CruiseFlag, CruiseRole, MapDef } from "./Types";

// ---------------------------------------------------------------- the grounds

export interface Ground {
  key: string;
  name: string;
  text: string;
  /** The stations she cruises between, in turn (province ids). */
  stations: string[];
  /** Whose ships pass (power keys), in proportion. */
  flags: string[];
  /** A treasure ship now and then (the plate fleet's stragglers, the galleons of the Main). */
  galleons?: boolean;
  /** Only in the open months (the north's harbours freeze). */
  summer?: boolean;
}

export const GROUNDS: Ground[] = [
  {
    key: "straits",
    name: "the Florida Straits",
    text: "Between the Florida Keys, Havana and the Bahamas: every ship homeward from the Gulf passes, and the treasure fleet out of Havana.",
    stations: ["havana", "tequesta", "andros", "new-providence"],
    flags: ["spain", "spain", "england", "france"],
    galleons: true,
  },
  {
    key: "windward",
    name: "the Windward Passage",
    text: "Between Cuba and Hispaniola: the door from Jamaica and the French islands to the open Atlantic.",
    stations: ["santiago-de-cuba", "le-cap", "guanahani", "jamaica"],
    flags: ["spain", "france", "england"],
  },
  {
    key: "hispaniola",
    name: "off Hispaniola",
    text: "The south coast of Hispaniola and the Mona Passage over to Puerto Rico.",
    stations: ["santo-domingo", "higuey", "san-juan", "tiburon"],
    flags: ["spain", "spain", "france"],
  },
  {
    key: "main",
    name: "the Spanish Main",
    text: "Portobelo and the Isthmus, Curaçao and Margarita: the galleons' coast.",
    stations: ["portobelo", "darien", "curacao", "margarita"],
    flags: ["spain", "spain", "netherlands"],
    galleons: true,
  },
  {
    key: "leewards",
    name: "the Leeward Islands",
    text: "The sugar islands from Antigua to Martinique: deep-laden ships making for Europe.",
    stations: ["antigua", "st-kitts", "guadeloupe", "martinique"],
    flags: ["england", "france", "netherlands"],
  },
  {
    key: "campeche",
    name: "the Bay of Campeche",
    text: "The logwood cutters' coast, and the Veracruz trade.",
    stations: ["campeche", "tabasco", "veracruz"],
    flags: ["spain"],
  },
  {
    key: "capes",
    name: "the Virginia capes",
    text: "Off the Chesapeake's mouth, where the tobacco fleets gather and the coasting trade runs north and south.",
    stations: ["accomac", "nansemond", "roanoke", "zwaanendael"],
    flags: ["england", "england", "netherlands"],
  },
  {
    key: "banks",
    name: "Newfoundland and the Banks",
    text: "The fishing fleets on the Grand Banks, the French at Placentia and Île Royale. Only in the open months.",
    stations: ["avalon", "placentia", "ile-royale", "chebucto"],
    flags: ["france", "england"],
    summer: true,
  },
];

export const GROUND_BY_KEY = new Map(GROUNDS.map((x) => [x.key, x]));

// ---------------------------------------------------------------- the havens

export interface Haven {
  key: string;
  /** The province it's in. */
  prov: string;
  name: string;
  /** The years it welcomed pirates (from the first to the last, whole). */
  from: number;
  to: number;
  text: string;
}

export const HAVENS: Haven[] = [
  {
    key: "tortuga",
    prov: "le-cap",
    name: "Tortuga",
    from: 1630,
    to: 1688,
    text: "Tortuga, off Hispaniola's north coast: the buccaneers' rock, under the French.",
  },
  {
    key: "port-royal",
    prov: "jamaica",
    name: "Port Royal",
    from: 1655,
    to: 1691,
    text: "Port Royal, Jamaica: the buccaneers' town, until the earthquake of 1692 took half of it into the sea.",
  },
  {
    key: "nassau",
    prov: "new-providence",
    name: "Nassau",
    from: 1713,
    to: 1717,
    text: "Nassau on New Providence: the pirates' republic, until Woodes Rogers came in July 1718 with the King's pardon and a gallows.",
  },
];

/** The haven at a province in a year, if any. */
export function havenIn(map: MapDef, p: number, year: number): Haven | null {
  const id = map.provinces[p]?.id;
  return (
    HAVENS.find((h) => h.prov === id && year >= h.from && year <= h.to) ?? null
  );
}

// ---------------------------------------------------------------- what you meet

export interface PreyDef {
  kind: string;
  /** Weight among the sails sighted (a galleon only where they sail). */
  w: number;
  /** What she and her cargo fetch at a fair sale, least and most. */
  value: [number, number];
  guns: [number, number];
  /** Her pace against a passage's (a sloop is 1.25). */
  speed: number;
  /** Ships' names, by their flag's tongue. */
}

export const PREY: PreyDef[] = [
  { kind: "sloop", w: 30, value: [40, 85], guns: [0, 4], speed: 1.25 },
  { kind: "schooner", w: 22, value: [60, 125], guns: [0, 6], speed: 1.4 },
  { kind: "snow", w: 26, value: [100, 195], guns: [2, 8], speed: 1.05 },
  { kind: "ship", w: 18, value: [170, 360], guns: [6, 16], speed: 1.0 },
  { kind: "galleon", w: 4, value: [550, 1250], guns: [24, 40], speed: 0.8 },
];

/** A man-of-war: fast, and a broadside nobody wants. */
export const WARSHIP = { kind: "man-of-war", guns: 32, speed: 1.15 };

/** The numbers of a cruise. */
export const CRUISE = {
  /** Days on the ground: a short cruise and a long one. */
  hunt: { short: 30, long: 55 },
  /** A chance at a sail every so many days on the ground. */
  chanceDays: 6,
  /** The chance a sail is sighted at each. */
  sail: 0.62,
  /** Of the sails sighted, a man-of-war (more in wartime). */
  warship: 0.06,
  warshipWar: 0.1,
  /** A prize sent in is retaken on her way to port. */
  retake: 0.03,
  retakeWar: 0.08,
  /** Her plunder only: what's worth carrying off. */
  plunder: 0.35,
  /** The prize court's fees and the crown's part. */
  court: 0.15,
  /** Days the court takes to condemn; a fence's. */
  courtDays: 12,
  fenceDays: 3,
  /** The owners' half of a privateer's prizes. */
  owners: 0.5,
  /** A pirate who brings his own ship takes a ship's share first. */
  pirateShip: 0.2,
  /** What a fence pays: at a haven, at a den you know, otherwise. */
  fence: { haven: 0.6, den: 0.45, quay: 0.3 },
  /** Victuals, powder and shot for the owners to find, a month for each part of her company. */
  outfit: 0.5,
  /** A fitting cruise sails this many days after the first signs. */
  fitting: [3, 6] as [number, number],
  /** An encounter left unanswered this long is settled by the captain. */
  waitDays: 4,
  /** Scurvy takes hold after this many days at sea. */
  scurvyAfter: 45,
};

/** Her company besides the players: parts of the crew's share (a hand is one). */
export const CREW_PARTS: Record<BoatKind, number> = {
  canoe: 0,
  shallop: 4,
  sloop: 8,
  schooner: 10,
  brig: 14,
  ship: 20,
};

/** Men aboard, for the tale (a privateer is crowded, to board and to man her prizes). */
export function menAboard(kind: BoatKind): number {
  return CREW_PARTS[kind] * 5;
}

/** Each role's parts of the crew's share: a privateer's articles, and the pirates'. */
export const ROLE_PARTS: Record<CruiseFlag, Record<CruiseRole, number>> = {
  privateer: { captain: 4, officer: 2, crew: 1 },
  pirate: { captain: 2, officer: 1.5, crew: 1 },
};

export const ROLE_NAMES: Record<CruiseFlag, Record<CruiseRole, string>> = {
  privateer: { captain: "Captain", officer: "Lieutenant", crew: "Hand" },
  pirate: { captain: "Captain", officer: "Quartermaster", crew: "Hand" },
};

/** Fighting wounds in a boarding, by role (the captain's on the quarterdeck). */
export const WOUND: Record<CruiseRole, number> = {
  captain: 0.08,
  officer: 0.14,
  crew: 0.2,
};

// ---------------------------------------------------------------- the difficulties

/** Her hull, as a pace: a foul, battered bottom drags. */
export function hullPace(speed: number, hull: number): number {
  return speed * (0.8 + (0.2 * Math.max(0, Math.min(100, hull))) / 100);
}

/** To come up with her: seamanship against this (her pace against yours). */
export function chaseDc(prey: number, ours: number): number {
  return Math.round(7 + (prey - ours) * 10);
}

/** To make her strike without a fight: leadership against this (the black flag frightens). */
export function strikeDc(guns: number, flag: CruiseFlag): number {
  return 5 + Math.floor(guns / 3) - (flag === "pirate" ? 2 : 0);
}

/** To carry her by boarding: fighting against this (her guns against yours). */
export function boardDc(guns: number, ours: number): number {
  return Math.round(4 + (guns - ours * 0.6) / 2);
}

/** To run from a man-of-war: seamanship against this. */
export function runDc(ours: number): number {
  return Math.round(8 + (WARSHIP.speed - ours) * 10);
}

/** To fight a man-of-war off: fighting against this (it hardly ever goes well). */
export function fightWarshipDc(ours: number): number {
  return Math.round(13 - ours / 6);
}

/** Skills of a captain nobody knows (the computer's). */
export const NPC_CAPTAIN = { seamanship: 9, fighting: 8, leadership: 8 };
