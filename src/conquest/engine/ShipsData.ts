// SHIPS (r21): the numbers a ship's life is made of, in one place, so the
// engine rolls from the same tables the pages show the odds from: her
// company's roles (the ladder Hiring.ts takes people on by), what each of
// her people does for her, the charters at the quay and what they pay, the
// sea's dangers on a passage, her refits, beaching and anchoring where
// there's no port, a captain's stay at a port on the way, and the coaster
// you can hail from a shore with no port.
//
// A leaf (it imports only types and the ladder's shape), so the client's
// pages and the guide can read it.

import type { Ladder, RoleDef } from "./Hiring";
import type { BoatKind, CharterKind, RefitKey } from "./Types";

// ---------------------------------------------------------------- her company

/** A ship's roles, from the bottom up (the ladder Hiring.ts takes people on by). */
export const SHIP_ROLES: RoleDef[] = [
  {
    key: "hand",
    title: "Hand",
    rank: 0,
    pay: 1.5,
    skills: { seamanship: 1 },
    need: 2,
    jobRank: 0,
    text: "Works the ship: one of the hands she needs to sail. A good seaman makes her a little better at everything.",
  },
  {
    key: "bosun",
    title: "Bosun",
    rank: 1,
    pay: 2.5,
    skills: { seamanship: 0.6, leadership: 0.4 },
    need: 5,
    jobRank: 1,
    text: "Keeps her rigging, her hull and her hands in order: less wear on her every month, and better spirits.",
  },
  {
    key: "surgeon",
    title: "Surgeon",
    rank: 2,
    pay: 3,
    skills: { medicine: 1 },
    need: 4,
    jobRank: 1,
    text: "Physic, splints and the saw: fewer men lost to wounds, fevers and the scurvy.",
  },
  {
    key: "navigator",
    title: "Navigator",
    rank: 2,
    pay: 3,
    skills: { seamanship: 0.5, letters: 0.5 },
    need: 6,
    jobRank: 1,
    text: "Charts, quadrant and the log-line: quicker passages, fewer late, and fewer ships put on a reef.",
  },
  {
    key: "mate",
    title: "Mate",
    rank: 3,
    pay: 3.5,
    skills: { seamanship: 0.6, leadership: 0.4 },
    need: 7,
    jobRank: 2,
    text: "Second in command: commands her when there's no captain with her, and keeps the men's spirits up.",
  },
  {
    key: "captain",
    title: "Captain",
    rank: 4,
    pay: 5,
    skills: { seamanship: 0.6, leadership: 0.3, trade: 0.1 },
    need: 9,
    jobRank: 3,
    text: "Commands her: what she brings in, her passages and her name ride on his seamanship and leadership. She works and sails without you.",
  },
];

/** A ship's ladder: a player taken on is a sailor at the docks, paid by her owner. */
export const SHIP_LADDER: Ladder = {
  key: "ship",
  noun: "her company",
  roles: SHIP_ROLES,
  job: { kind: "sailor", place: "docks" },
};

/** The officers each kind of boat has room for (hands: as many as she can carry, below). */
export const ROLE_ROOM: Record<BoatKind, Partial<Record<string, number>>> = {
  canoe: {},
  shallop: { captain: 1 },
  sloop: { bosun: 1, navigator: 1, mate: 1, captain: 1 },
  schooner: { bosun: 1, surgeon: 1, navigator: 1, mate: 1, captain: 1 },
  brig: { bosun: 1, surgeon: 1, navigator: 1, mate: 2, captain: 1 },
  ship: { bosun: 1, surgeon: 1, navigator: 1, mate: 2, captain: 1 },
};

/** Hands she can carry, named and not: half again what she needs to sail. */
export const HANDS_ROOM = 1.5;

/** What her people do for her (fitness is on the skills' own scale, 0 to SKILL_MAX). */
export const SHIP_FX = {
  /** A bosun at the top of his trade takes this much off her monthly wear. */
  bosunWear: 0.4,
  /** A navigator at the top: this much off the chance she's lost, and off each passage's days. */
  navLoss: 0.5,
  navDays: 0.12,
  /** And off the chance a passage runs late. */
  navLate: 0.5,
  /** A surgeon at the top: this much off the men lost. */
  surgeonMen: 0.6,
  /** Her captain's or mate's leadership at the top: spirits a month. */
  spirits: 6,
  /** Each point of a named hand's seamanship over a common hand's (3), by their share of her hands. */
  handsKnack: 0.02,
  /** A common hand's seamanship. */
  commonHand: 3,
  /** In low spirits (under 30), what she brings in. */
  lowSpirits: 0.85,
  /** With nobody of yours to command her: her senior hand, at least this seamanship. */
  seniorHand: 3,
};

// ---------------------------------------------------------------- charters

/** What a charter is, in words. */
export const CHARTER_NAMES: Record<CharterKind, string> = {
  freight: "Freight",
  passengers: "Passengers",
  packet: "The coastal packet",
  fishing: "The fishing grounds",
  whaling: "A whaling season",
  smuggling: "A smuggling run",
  venture: "A venture of your own",
};

export const CHARTER_TEXT: Record<CharterKind, string> = {
  freight:
    "A merchant's cargo to a port: paid on delivery, a quarter docked if she's late.",
  passengers: "Passengers to a port: paid a head on landing them.",
  packet:
    "The colony's post and passengers between two ports, back and forth: a steady sum a month from the post office.",
  fishing:
    "A season on rich grounds away from home: what she catches is hers, then home.",
  whaling: "A season on the whaling grounds: rich voyages and stove boats.",
  smuggling:
    "Goods run past the customs into a port: twice and more a freight's pay, the law's heat, and the risk she's seized.",
  venture:
    "A cargo of your own: bought here at the market, sold there. Your buying makes it dearer here, your selling cheaper there.",
};

export const CHARTER = {
  /** Charters at a quay each month, by its port (none, a harbour, a great port). */
  offers: [2, 3, 4],
  /** A good name brings more: above this, one more offer. */
  repMore: 70,
  /** A great port's great lading each month: this many loads, to a port at least this far. */
  great: { loads: [150, 200, 250, 300], minKm: 800 },
  /** Freight: coins a load, and a load per 100 km of the passage. */
  freight: { perLoad: 0.03, per100: 0.018, minKm: 80, maxKm: 2600 },
  /** Passengers: coins a head, and a head per 100 km. */
  passengers: { perHead: 0.4, per100: 0.08 },
  /** The packet: a month's pay by her kind (about her keep and crew, and a third more), for this many months, between ports at most this far apart. */
  packet: {
    months: 3,
    pay: {
      canoe: 0,
      shallop: 3.5,
      sloop: 8,
      schooner: 15,
      brig: 28,
      ship: 0,
    } as Record<BoatKind, number>,
    minKm: 100,
    maxKm: 600,
    /** Days in port at each end before she sails again. */
    turn: 2,
  },
  /** A season on the grounds: her fishing, this much better than at home, for this long. */
  fishing: { months: 3, grounds: 2, maxKm: 1200 },
  whaling: { months: 4, maxKm: 1500 },
  /** Smuggling: a freight's pay times this; the law's heat; seized at the far port. */
  smuggling: { pay: 2.4, heat: 5, seized: 0.09, seizedHeat: 20 },
  /** Days allowed: the passage's days times this, plus these. */
  dueMul: 1.5,
  dueAdd: 3,
  /** Delivered late: this share of the pay. */
  latePay: 0.75,
  /** Delivered after this many days past due: the charter's forfeit. */
  forfeitDays: 45,
  /** A good name pays: ×(this + rep/333), 0.85 to 1.15. */
  repPay: 0.85,
};

/** A passage's dangers with nobody of yours aboard (with you aboard, they come as scenes). */
export const PASSAGE_RISK = {
  /** Lost with her cargo, per 1,000 km sailed, a sound ship (more as she's worn, less with a navigator). */
  lostPer1000: 0.012,
  /** Worn ships are lost more: at soundness under this, the chance is half again. */
  worn: 50,
  /** Days lost to weather: the chance on a passage, and how many (a share of its days). */
  late: 0.18,
  lateShare: [0.3, 0.8] as [number, number],
  /** Battered by the sea: the chance on a passage, and the damage. */
  damage: { p: 0.06, hull: [3, 8] as [number, number] },
  /** Wear per 500 km at sea. */
  wear: 0.5,
};

/** Her name on the waterfront: what moves it. */
export const REP = {
  start: 50,
  delivered: 4,
  late: -3,
  forfeit: -10,
  seized: -15,
  /** Her crew deserted, unpaid (Boats.ts). */
  unpaid: -5,
};

// ---------------------------------------------------------------- refits

export interface RefitDef {
  name: string;
  text: string;
  /** Of her price new. */
  cost: number;
  /** Kinds she must be (none: any). */
  kinds?: BoatKind[];
  /** Not before this year. */
  since?: number;
}

export const REFITS: Record<RefitKey, RefitDef> = {
  copper: {
    name: "Copper her bottom",
    text: "Sheathed in copper against the worm and the weed: half the wear a month, and a little quicker (+4%).",
    cost: 0.25,
    kinds: ["sloop", "schooner", "brig", "ship"],
    since: 1761,
  },
  sails: {
    name: "A new suit of sails",
    text: "New canvas and running rigging: quicker on every passage (+6%).",
    cost: 0.12,
    kinds: ["shallop", "sloop", "schooner", "brig", "ship"],
  },
  guns: {
    name: "More guns",
    text: "Half again her guns: better prizes privateering, and pirates think twice.",
    cost: 0.15,
    kinds: ["sloop", "schooner", "brig", "ship"],
  },
  cabins: {
    name: "Cabins for passengers",
    text: "Half again her berths, and passengers pay a fifth more to travel in comfort.",
    cost: 0.1,
    kinds: ["sloop", "schooner", "brig", "ship"],
  },
};

export const REFIT_KEYS = Object.keys(REFITS) as RefitKey[];

/** Refits' effects. */
export const REFIT_FX = {
  copperWear: 0.5,
  copperSpeed: 1.04,
  sailsSpeed: 1.06,
  guns: 1.5,
  cabins: 1.5,
  cabinsPay: 1.2,
};

// ---------------------------------------------------------------- where there's no port

/** Beached (small enough to run up on a strand) or at anchor offshore (too big). */
export const BEACHED: BoatKind[] = ["canoe", "shallop", "sloop", "schooner"];

export const MOOR = {
  /** Getting her off a beach: a day more to get away, on the tide. */
  floatDays: 1,
  /** At anchor in an open road: extra wear a month. */
  anchorWear: 0.5,
  /** Careening her on a beach yourself: this share of a yard's price, up to this soundness. */
  careenCost: 0.6,
  careenTo: 85,
};

/** A captain's stay at a port on the way: under this many days, the voyage resumes. */
export const STAY_DAYS = 60;

/** The ship that landed you where there's no port lies off it this long. */
export const LIE_DAYS = 12;

/** Hailing a passing coaster from a shore with no port: days to wait (a settled shore, open country). */
export const COASTER = { settled: 5, wild: 10 };
