// Derpy Front (DFSTORE r21): AI personality packs from the Derp Store.
//
// A host who owns a pack may give the AI nations of the games they host (or
// play alone) a themed persona from it: a name, an emblem (a flag the client
// draws from /flags/persona_<id>.svg), a chat voice, and a temperament that
// leans the nation's play. The packs a game uses travel in its config
// (GameConfig.aiPersonalities), so every client assigns the same personas
// and plays them the same way. Rules edition 5 and later only.
//
// This file is data the engine and the client both read: the personas, and
// how each temperament tunes a nation. Nothing here draws a random number.

import { UnitType } from "@openfront/engine-api/game/GameTypes";

/** How a persona leans its play. */
export const TEMPERAMENTS = [
  "aggressive",
  "trader",
  "turtle",
  "nuker",
  "opportunist",
] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];

export interface AiPersona {
  /** Unique id; the nation's flag is `persona_<id>`. */
  id: string;
  /** The pack that sells it. */
  pack: string;
  /** The nation's name in game. Short: it labels the map. */
  name: string;
  temperament: Temperament;
}

export interface AiPersonalityPack {
  /** Store item id (lowercase letters, digits, underscores). */
  id: string;
  personas: readonly AiPersona[];
}

function pack(
  id: string,
  personas: [string, string, Temperament][],
): AiPersonalityPack {
  return {
    id,
    personas: personas.map(([pid, name, temperament]) => ({
      id: `${id.replace(/^ai_/, "")}_${pid}`,
      pack: id,
      name,
      temperament,
    })),
  };
}

/** Every pack, in store order. Persona ids and names are unique. */
export const AI_PERSONALITY_PACKS: readonly AiPersonalityPack[] = [
  pack("ai_pirates", [
    ["redbeard", "Redbeard's Brethren", "aggressive"],
    ["saltqueen", "The Salt Queen", "opportunist"],
    ["blackwake", "Blackwake Raiders", "aggressive"],
    ["coinhook", "Captain Coinhook", "trader"],
    ["barnacle", "Old Barnacle's Cove", "turtle"],
    ["powderkeg", "The Powder Keg", "nuker"],
  ]),
  pack("ai_empires", [
    ["ironcrown", "The Iron Crown", "aggressive"],
    ["marble", "The Marble Throne", "turtle"],
    ["gilded", "The Gilded Dynasty", "trader"],
    ["eagle", "The Eagle Throne", "opportunist"],
    ["citadel", "Citadel of Ages", "turtle"],
    ["wildfire", "The Wildfire Dominion", "nuker"],
  ]),
  pack("ai_merchants", [
    ["goldleaf", "House Goldleaf", "trader"],
    ["saffron", "The Saffron Company", "trader"],
    ["ledger", "Ledger & Sons", "turtle"],
    ["lantern", "Silk Lantern League", "trader"],
    ["tollgate", "The Tollgate Barons", "opportunist"],
    ["monopolia", "Monopolia", "aggressive"],
  ]),
  pack("ai_scientists", [
    ["voltwhistle", "Doctor Voltwhistle", "nuker"],
    ["beaker", "The Bubbling Beaker", "turtle"],
    ["clockwork", "Clockwork Collective", "aggressive"],
    ["gamma", "Gamma Labs", "nuker"],
    ["fizzbang", "Professor Fizzbang", "opportunist"],
    ["zeppelin", "Zeppelin Academy", "trader"],
  ]),
  pack("ai_warlords", [
    ["dustdevil", "Dust Devil Horde", "aggressive"],
    ["ironhoof", "Ironhoof Riders", "aggressive"],
    ["canyon", "The Canyon Kings", "turtle"],
    ["greywolf", "The Grey Wolf Clan", "opportunist"],
    ["railhead", "Railhead Barons", "trader"],
    ["dynamite", "Dynamite Jack's Gang", "nuker"],
  ]),
];

const PERSONAS = new Map<string, AiPersona>(
  AI_PERSONALITY_PACKS.flatMap((p) => p.personas.map((x) => [x.id, x])),
);

/** The flag code a persona's nation carries. */
export const PERSONA_FLAG_PREFIX = "persona_";

export function personaFlag(persona: AiPersona): string {
  return PERSONA_FLAG_PREFIX + persona.id;
}

export function findPersona(id: string): AiPersona | undefined {
  return PERSONAS.get(id);
}

/** The persona a nation flag names, if it names one. */
export function personaFromFlag(
  flag: string | null | undefined,
): AiPersona | undefined {
  if (!flag?.startsWith(PERSONA_FLAG_PREFIX)) return undefined;
  return PERSONAS.get(flag.slice(PERSONA_FLAG_PREFIX.length));
}

export function isAiPersonalityPack(id: string): boolean {
  return AI_PERSONALITY_PACKS.some((p) => p.id === id);
}

/**
 * The personas a game's packs offer, in a fixed order: the packs in catalog
 * order (not the order the host clicked them), each pack's personas in turn.
 * Unknown and repeated pack ids are ignored.
 */
export function personaPool(packs: readonly string[] | undefined): AiPersona[] {
  if (!packs || packs.length === 0) return [];
  const chosen = new Set(packs);
  return AI_PERSONALITY_PACKS.filter((p) => chosen.has(p.id)).flatMap(
    (p) => p.personas,
  );
}

const ROMAN = ["", "", " II", " III", " IV", " V", " VI", " VII", " VIII"];

/** "Redbeard's Brethren", then "Redbeard's Brethren II", "… III" and so on. */
export function personaName(persona: AiPersona, round: number): string {
  if (round <= 1) return persona.name;
  return persona.name + (ROMAN[round] ?? ` ${round}`);
}

// ---------------------------------------------------------------------------
// Temperaments: how each one tunes a nation (rules 5+, persona nations only).

export interface TemperamentTuning {
  /** Multiplies the ticks between a nation's decisions (below 1: busier). */
  attackRate: number;
  /** Added to the share of its troop cap a nation waits for before attacking. */
  trigger: number;
  /** Added to the share of its troop cap it keeps home. */
  reserve: number;
  /** Added to the share it may spend grabbing empty land. */
  expand: number;
  /** Multiplies how many of each structure it wants per city. */
  structures: Partial<Record<UnitType, number>>;
  /** The most missile silos it builds (3 is the usual cap). */
  maxSilos: number;
  /** The first silo's ratio per city (0.4 is usual): higher, sooner. */
  firstSiloRatio: number;
  /** Starts embargoes against hostile players (the usual habit). */
  embargoes: boolean;
  /** Only nukes players who are attacking it. */
  nukesOnlyAttackers: boolean;
  /** Multiplies the incoming-troops share that makes it build defense posts. */
  defenseThreat: number;
}

const BASE: TemperamentTuning = {
  attackRate: 1,
  trigger: 0,
  reserve: 0,
  expand: 0,
  structures: {},
  maxSilos: 3,
  firstSiloRatio: 0.4,
  embargoes: true,
  nukesOnlyAttackers: false,
  defenseThreat: 1,
};

export const TEMPERAMENT_TUNING: Record<Temperament, TemperamentTuning> = {
  // Strikes often and early, keeps little at home, skimps on SAMs.
  aggressive: {
    ...BASE,
    attackRate: 0.8,
    trigger: -0.12,
    reserve: -0.08,
    structures: { [UnitType.SAMLauncher]: 0.6 },
  },
  // Ports, factories and trade first; slow to fight, never embargoes, and
  // only nukes those who attack it.
  trader: {
    ...BASE,
    attackRate: 1.15,
    trigger: 0.08,
    reserve: 0.05,
    structures: {
      [UnitType.Port]: 1.6,
      [UnitType.Factory]: 1.5,
      [UnitType.MissileSilo]: 0.5,
    },
    maxSilos: 2,
    embargoes: false,
    nukesOnlyAttackers: true,
  },
  // Digs in: twice the SAMs, defense posts at the first sign of trouble, a
  // big reserve, and nukes only in answer.
  turtle: {
    ...BASE,
    attackRate: 1.25,
    trigger: 0.15,
    reserve: 0.12,
    expand: -0.03,
    structures: {
      [UnitType.SAMLauncher]: 2,
      [UnitType.MissileSilo]: 0.5,
    },
    maxSilos: 2,
    nukesOnlyAttackers: true,
    defenseThreat: 0.6,
  },
  // Silos early and many, and a few more SAMs to keep them.
  nuker: {
    ...BASE,
    trigger: 0.05,
    reserve: 0.05,
    structures: {
      [UnitType.MissileSilo]: 2.5,
      [UnitType.SAMLauncher]: 1.3,
    },
    maxSilos: 6,
    firstSiloRatio: 0.7,
  },
  // Quick to grab land and pounce, a little more trade on the side.
  opportunist: {
    ...BASE,
    attackRate: 0.9,
    trigger: -0.06,
    reserve: -0.03,
    expand: 0.05,
    structures: { [UnitType.Port]: 1.2 },
  },
};

/** The usual tuning: what a nation without a persona plays by. */
export const NO_TEMPERAMENT: TemperamentTuning = BASE;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * A nation's attack ratios, leaned by its temperament and kept sensible: the
 * reserve stays below the trigger, and both inside the usual bounds.
 */
export function temperedRatios(
  t: TemperamentTuning,
  ratios: { trigger: number; reserve: number; expand: number },
): { trigger: number; reserve: number; expand: number } {
  const trigger = clamp(ratios.trigger + t.trigger, 0.3, 0.85);
  const reserve = clamp(ratios.reserve + t.reserve, 0.15, trigger - 0.1);
  const expand = clamp(ratios.expand + t.expand, 0.05, 0.3);
  return { trigger, reserve, expand };
}

/** A nation's ticks between decisions, leaned by its temperament. */
export function temperedAttackRate(t: TemperamentTuning, rate: number): number {
  return Math.max(10, Math.round(rate * t.attackRate));
}
