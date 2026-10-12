// CHAMBER (r16): the factions of a colony's politics, and what they remember.
//
// Everyone in a colony's politics (the governor, his council, the house and
// the people at court) belongs to one of the two parties, the court party
// (the governor's friends) or the country party (the house's men, wary of
// him), and to one of four interests: the merchants, the planters (the
// landed men), the backcountry (the frontier) and the clergy. Each colony
// calls them by its own names (the peninsulars and the creoles in New
// Spain, the governor's and the intendant's parties in New France).
//
// A faction remembers how a player voted on the matters it cares about and
// where they stood at the assembly's session. Its members think the better
// or the worse of them for it: a line in each member's opinion, with the
// reasons ("The merchants: you voted against paper money"). A councillor of
// a faction you've pleased leans toward the measures you bring.

import { inHouse, lifeOfC, onCouncil, playedC } from "./ChamberCore";
import type { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { AMERICAS } from "./Map";
import { powerChanged } from "./PowerCore";
import { DAYS_PER_YEAR } from "./Rules";
import { hash01 } from "./SocietyCore";
import type {
  Cabinet,
  Character,
  FactionKey,
  FactionMark,
  GameState,
  Life,
  Nation,
} from "./Types";

export const PARTIES: FactionKey[] = ["court", "country"];
export const INTERESTS: FactionKey[] = [
  "merchants",
  "planters",
  "frontier",
  "clergy",
];
export const FACTION_KEYS: FactionKey[] = [...PARTIES, ...INTERESTS];

/** What each faction wants, in a line (the same everywhere). */
export const FACTION_WANTS: Record<FactionKey, string> = {
  court:
    "The governor's friends: his measures carried, his salary paid, places for themselves.",
  country:
    "The house's men: low taxes and quitrents, the purse in the house's hands, and a governor who listens.",
  merchants:
    "The trading interest: open markets, hard money, safe seas and light duties.",
  planters:
    "The landed men: cheap credit, light quitrents, roads to the landings and good prices for the crop.",
  frontier:
    "The backcountry: land, forts and rangers against raiders, and no presents for the people who raid them.",
  clergy:
    "The church: its ministers paid, days of thanksgiving, missions, schools, and no lotteries.",
};

type Names = Record<FactionKey, string>;

const NAMES: Record<string, Names> = {
  english: {
    court: "the court party",
    country: "the country party",
    merchants: "the merchants",
    planters: "the planters",
    frontier: "the backcountry men",
    clergy: "the clergy",
  },
  puritan: {
    court: "the prerogative men",
    country: "the popular party",
    merchants: "the merchants",
    planters: "the farmers",
    frontier: "the frontier towns",
    clergy: "the ministers",
  },
  french: {
    court: "the governor's party",
    country: "the intendant's party",
    merchants: "the négociants",
    planters: "the seigneurs",
    frontier: "the coureurs de bois",
    clergy: "the bishop's men",
  },
  spanish: {
    court: "the peninsulars",
    country: "the creoles",
    merchants: "the consulado",
    planters: "the hacendados",
    frontier: "the frontier captains",
    clergy: "the friars",
  },
  dutch: {
    court: "the Company's men",
    country: "the burghers",
    merchants: "the merchants",
    planters: "the patroons",
    frontier: "the fur traders",
    clergy: "the dominies",
  },
  swedish: {
    court: "the Company's men",
    country: "the freemen",
    merchants: "the traders",
    planters: "the farmers",
    frontier: "the river traders",
    clergy: "the pastors",
  },
  portuguese: {
    court: "the governor's men",
    country: "the men of the câmara",
    merchants: "the merchants",
    planters: "the senhores de engenho",
    frontier: "the bandeirantes",
    clergy: "the Jesuits",
  },
};

/** A people's names for the factions ("english", "puritan", "french"...), for the guide. */
export function factionNamesOf(people: string): Names {
  return NAMES[people] ?? NAMES.english;
}

function namesOf(nation: Nation | undefined): Names {
  if (nation?.religion === "puritan") return NAMES.puritan;
  return NAMES[nation?.culture ?? "english"] ?? NAMES.english;
}

/** A faction's name in a colony: "the country party", "the creoles". */
export function factionName(s: GameState, n: number, f: FactionKey): string {
  return namesOf(s.nations[n])[f];
}

/** Whether a nation keeps factions a player can have dealings with (a colony with a council). */
export function hasFactions(s: GameState, n: number): boolean {
  return s.nations[n]?.kind === "power" && !!s.nations[n]?.alive;
}

// ---------------------------------------------------------------- who belongs

/**
 * A character's party: the court party or the country party. A councillor's
 * is the council's reckoning (most lean the governor's way), a member's the
 * house's; a player's comes of their record of votes, or of how the two
 * parties regard them (null: a player who hasn't taken a side).
 *
 * POLLS (r16) reads a candidate's party from here.
 */
export function partyOf(
  s: GameState,
  n: number,
  c: number,
): "court" | "country" | null {
  const cab = s.power?.cabinets[n];
  const set = cab?.faction[c];
  if (playedC(s, c)) {
    if (set && cab?.record?.[c] !== undefined) return set;
    const court = cab?.stand?.[c]?.court?.v ?? 0;
    const country = cab?.stand?.[c]?.country?.v ?? 0;
    if (country - court >= 6) return "country";
    if (court - country >= 6) return "court";
    return set ?? null;
  }
  if (set) return set;
  if (s.nations[n]?.ruler === c) return "court";
  // The same reckoning Council.ts (factionOf) and Assembly.ts (memberFaction) use.
  if (onCouncil(s, n, c))
    return hash01(c * 7919 + n * 104729, 77) < 0.68 ? "court" : "country";
  return hash01(c, n, 77) < 0.45 ? "court" : "country";
}

const MERCHANT_ROLES = new Set([
  "merchant",
  "trader",
  "captain",
  "printer",
  "innkeeper",
]);
const PLANTER_ROLES = new Set(["planter", "master"]);
const FRONTIER_ROLES = new Set(["hunter", "sergeant", "soldier"]);
const MERCHANT_JOBS = new Set([
  "trader",
  "shopkeeper",
  "clerk",
  "sailor",
  "distiller",
  "innkeeper",
  "newsman",
]);
const PLANTER_JOBS = new Set(["farmer", "grower", "miller"]);
const FRONTIER_JOBS = new Set([
  "trapper",
  "surveyor",
  "guide",
  "soldier",
  "militia",
  "hunter",
  "interpreter",
]);

/** A province on the frontier: a native nation or open country next door. */
export function frontierProv(s: GameState, p: number): boolean {
  const def = AMERICAS.provinces[p];
  if (!def) return false;
  for (const [q] of def.nb) {
    const o = s.provinces[q]?.owner ?? -1;
    if (o < 0 || s.nations[o]?.kind === "native") return true;
  }
  return false;
}

/** A character's interest: by their trade, their seat or their home. */
export function interestOf(s: GameState, n: number, c: number): FactionKey {
  const ch = s.chars[c];
  if (!ch) return "planters";
  const life = lifeOfC(s, c);
  const kind = life?.job?.kind as string | undefined;
  if (kind) {
    if (kind === "preacher") return "clergy";
    if (MERCHANT_JOBS.has(kind)) return "merchants";
    if (PLANTER_JOBS.has(kind)) return "planters";
    if (FRONTIER_JOBS.has(kind)) return "frontier";
  }
  if (ch.role === "preacher") return "clergy";
  if (ch.role && MERCHANT_ROLES.has(ch.role)) return "merchants";
  if (ch.role && PLANTER_ROLES.has(ch.role)) return "planters";
  if (ch.role && FRONTIER_ROLES.has(ch.role)) return "frontier";
  const cab = s.power?.cabinets[n];
  if (cab && s.nations[n]?.council.chaplain === c) return "clergy";
  const home = ch.home ?? life?.home;
  if (home !== undefined && home >= 0) {
    if (frontierProv(s, home) && hash01(c, 31) < 0.7) return "frontier";
    if (s.provinces[home]?.b.port && hash01(c, 37) < 0.45) return "merchants";
  }
  const h = hash01(c, n, 41);
  return h < 0.5
    ? "planters"
    : h < 0.8
      ? "merchants"
      : h < 0.92
        ? "frontier"
        : "clergy";
}

/** A character's two factions: their party and their interest (a player may have no party yet). */
export function factionsOf(s: GameState, n: number, c: number): FactionKey[] {
  const p = partyOf(s, n, c);
  return p ? [p, interestOf(s, n, c)] : [interestOf(s, n, c)];
}

/** Whether someone is in the colony's politics: the governor, his council, the house, the court. */
export function inPolitics(s: GameState, n: number, c: Character): boolean {
  if (!c.alive || c.nation !== n || !hasFactions(s, n)) return false;
  const nation = s.nations[n];
  return (
    nation.ruler === c.id ||
    onCouncil(s, n, c.id) ||
    inHouse(s, n, c.id) ||
    nation.court.includes(c.id)
  );
}

/** The computer's people in a colony's politics, by faction (for the chamber's page). */
export function factionMembers(
  s: GameState,
  n: number,
): Record<FactionKey, number[]> {
  const out = {} as Record<FactionKey, number[]>;
  for (const f of FACTION_KEYS) out[f] = [];
  const nation = s.nations[n];
  if (!nation || !hasFactions(s, n)) return out;
  const ids = new Set<number>([nation.ruler, ...nation.court]);
  for (const c of s.polities[n]?.assembly ?? []) ids.add(c);
  for (const seat of Object.values(nation.council)) ids.add(seat);
  const cab = s.power?.cabinets[n];
  for (const id of [cab?.attorney, cab?.surveyor, cab?.speaker])
    if (id !== undefined) ids.add(id);
  for (const id of [...ids].sort((a, b) => a - b)) {
    const c = s.chars[id];
    if (!c?.alive || playedC(s, id) || c.nation !== n) continue;
    for (const f of factionsOf(s, n, id)) out[f].push(id);
  }
  return out;
}

// ---------------------------------------------------------------- what they remember

/** How far a faction's regard can go either way. */
export const MARK_CAP = 40;

/** A player's standing with a faction (0 if it has no view). */
export function standWith(
  s: GameState,
  n: number,
  c: number,
  f: FactionKey,
): FactionMark | undefined {
  return s.power?.cabinets[n]?.stand?.[c]?.[f];
}

/** A faction remembers something a player did. */
export function markFaction(
  g: ConquestGame,
  cab: Cabinet,
  c: number,
  f: FactionKey,
  dv: number,
  why: string,
): void {
  if (!dv || !playedC(g.s, c)) return;
  const all = (cab.stand ??= {});
  const mine = (all[c] ??= {});
  const m = (mine[f] ??= { v: 0, why: [] });
  m.v = Math.max(
    -MARK_CAP,
    Math.min(MARK_CAP, Math.round((m.v + dv) * 10) / 10),
  );
  m.why = [
    ...m.why.filter((x) => x.t !== why),
    { t: why, v: dv, day: g.s.day },
  ].slice(-4);
  powerChanged(g, `c${cab.n}`);
}

/** Each January: what the factions remember fades by a fifth, and old reasons with it. */
export function fadeFactions(g: ConquestGame, cab: Cabinet): void {
  if (!cab.stand) return;
  const day = g.s.day;
  for (const [c, marks] of Object.entries(cab.stand)) {
    for (const f of FACTION_KEYS) {
      const m = marks[f];
      if (!m) continue;
      m.v = Math.round(m.v * 0.8 * 10) / 10;
      m.why = m.why.filter((x) => day - x.day < 3 * DAYS_PER_YEAR);
      if (Math.abs(m.v) < 1 && !m.why.length) delete marks[f];
    }
    if (!Object.keys(marks).length) delete cab.stand[Number(c)];
  }
  powerChanged(g, `c${cab.n}`);
}

/** The reasons a faction gives, in a line: "you voted against paper money; for a guard ship". */
export function whyWords(m: FactionMark): string {
  const recent = m.why.slice(-2).reverse();
  return recent.map((x) => x.t).join("; ");
}

/** How much a faction's regard moves its members' opinion of a player. */
export const OPINION_PER_MARK = 0.25;

/**
 * CHAMBER (r16): what someone in a colony's politics thinks of a player for
 * what their factions remember (a line each, with the reasons).
 */
export function chamberOpinion(
  s: GameState,
  c: Character,
  life: Life,
  e: Explain,
): void {
  const me = s.chars[life.c];
  if (!me || c.id === me.id || playedC(s, c.id)) return;
  const n = c.nation;
  const marks = s.power?.cabinets[n]?.stand?.[life.c];
  if (!marks || !inPolitics(s, n, c)) return;
  for (const f of factionsOf(s, n, c.id)) {
    const m = marks[f];
    if (!m) continue;
    const v = Math.round(m.v * OPINION_PER_MARK);
    if (!v) continue;
    const name = factionName(s, n, f);
    e.add(
      `${name.charAt(0).toUpperCase()}${name.slice(1)} remember${m.why.length ? `: ${whyWords(m)}` : " you"}`,
      v,
    );
  }
}

/** How a computer councillor leans toward a measure a player brings, for what their factions remember (−4 to 4). */
export function factionLean(
  s: GameState,
  n: number,
  c: number,
  by: number,
): number {
  if (!playedC(s, by) || playedC(s, c)) return 0;
  const marks = s.power?.cabinets[n]?.stand?.[by];
  if (!marks) return 0;
  let v = 0;
  for (const f of factionsOf(s, n, c)) v += marks[f]?.v ?? 0;
  return Math.max(-4, Math.min(4, v / 12));
}
