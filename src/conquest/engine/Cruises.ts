// SEA (r15): to sea in person. A cruise takes your character aboard a ship
// that sails on the map from her port to a hunting ground of the period
// (the Florida Straits, the Windward Passage, off Hispaniola and the Spanish
// Main, the Leeward Islands, the Virginia capes, the Banks), cruises
// between its stations, and comes home. A privateer sails under a letter
// of marque from a governor whose colony is at war, and takes only the
// enemy's ships; a pirate takes anyone's, and the law hunts him for it.
//
// You sign on at the quay: as a hand, an officer (a lieutenant, or the
// pirates' quartermaster) or the captain, by your skill and your name; or
// you take your own boat out, or a privateering company's ship. Every few
// days on the ground a sail may be sighted: a scene (chase or let her go;
// call on her to strike, or board her; send her in with a prize crew, take
// what's worth carrying, or burn her; a man-of-war, and run), with the odds
// shown, decided by the highest of the players aboard (the captain's
// skill, if a computer captain has command). Scurvy and the men's temper
// come with a long cruise, and the hurricanes in their season.
//
// Home again, a privateer's prizes go to the prize court (its fees, then
// half to her owners and half to her company by their parts); a pirate's
// go to a fence (best at a haven: Tortuga to 1688, Port Royal to 1691,
// Nassau 1713 to 1718), shared by the pirates' articles. A privateer who
// takes a neutral, or her commission's own, is a pirate from that day.
// Pirates draw the law's heat (and its gallows); the King's pardon of
// 1717-18 (and James II's of 1688) clears it for those who take it.
//
// While at sea you can't do things ashore, and letters wait for you in
// port. The world's dice are never touched: the sea's own (sdice) roll for
// the ship, and a scene's choice rolls as every scene does.

import { BOATS, boatRoute } from "./Boats";
import { dateOf, formatDate } from "./Calendar";
import { addHeat, addNotoriety, jail } from "./Crime";
import { knowsDen, lawAt } from "./CrimeQueries";
import {
  CREW_PARTS,
  CRUISE,
  GROUND_BY_KEY,
  GROUNDS,
  type Ground,
  havenIn,
  HAVENS,
  hullPace,
  menAboard,
  NPC_CAPTAIN,
  PREY,
  ROLE_NAMES,
  ROLE_PARTS,
  WARSHIP,
  WOUND,
  boardDc,
  chaseDc,
  fightWarshipDc,
  runDc,
  strikeDc,
} from "./CruiseData";
import {
  chancesIn,
  cruiseOdds,
  type CruisePlan,
  shareFraction,
  totalParts,
  wouldChase,
} from "./CruiseOdds";
import { reveal } from "./Fog";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { affairNews } from "./Ledger";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import {
  type Check,
  charSkill,
  isChildLife,
  lifeOfChar,
  lifeOfSeat,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance } from "./LifeRules";
import type { World } from "./Map";
import type { OddsView } from "./Odds";
import { wake } from "./Pace";
import { charName, yearOf } from "./Queries";
import { Rng } from "./Rng";
import { rumour } from "./Rumours";
import {
  aRig,
  kmApart,
  sdice,
  seaChanged,
  seaOf,
  seaState,
  wayAt,
} from "./SeaCore";
import { SEA_KM_DAY } from "./SeaSpeed";
import { madeReady, STORM_AT_SEA, STORM_SIGNS, stormName } from "./Storms";
import { pirateWaters } from "./Trades";
import type {
  BoatKind,
  Cruise,
  CruiseFlag,
  CruiseRole,
  Encounter,
  GameState,
  Hand,
  Life,
  LifeCommand,
  MapDef,
  Prize,
  Skill,
  Storm,
} from "./Types";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------------------------------------------------------------- who and where

/** A power's index by its key, or -1. */
export function powerIndex(s: GameState, key: string): number {
  return s.nations.findIndex((n) => n.key === key && n.kind === "power");
}

/** The nations at war with `n` (other powers: the natives' canoes aren't prizes). */
export function enemiesOf(s: GameState, n: number): Set<number> {
  const out = new Set<number>();
  for (const w of s.wars) {
    const other = w.a === n ? w.b : w.b === n ? w.a : -1;
    if (other >= 0 && s.nations[other]?.kind === "power") out.add(other);
  }
  return out;
}

/** The ground's stations, as provinces (those on this map). */
export function stationsOf(map: MapDef, g: Ground): number[] {
  return g.stations
    .map((id) => map.provinces.findIndex((p) => p.id === id))
    .filter((p) => p >= 0);
}

/** Whose ships pass on a ground, as nations (-1 for a power that's gone). */
export function groundFlags(s: GameState, g: Ground): number[] {
  return g.flags.map((k) => {
    const i = powerIndex(s, k);
    return i >= 0 && s.nations[i].alive ? i : -1;
  });
}

/** Days out to a ground from a port in a ship of this kind (or -1 if she can't reach it). */
export function daysTo(
  map: MapDef,
  port: number,
  g: Ground,
  kind: BoatKind,
): number {
  const st = stationsOf(map, g);
  if (!st.length) return -1;
  if (st.includes(port)) return 0;
  let best = -1;
  for (const p of st) {
    const r = boatRoute(map, port, p, kind);
    if (r && (best < 0 || r.days < best)) best = r.days;
  }
  return best;
}

/** The grounds a ship can cruise from here: within three weeks' sail, and in their season. */
export function groundsFrom(
  s: GameState,
  map: MapDef,
  port: number,
  kind: BoatKind,
): { g: Ground; days: number }[] {
  const month = dateOf(s.day).month;
  const out: { g: Ground; days: number }[] = [];
  for (const g of GROUNDS) {
    if (g.summer && (month < 4 || month > 9)) continue;
    const days = daysTo(map, port, g, kind);
    if (days < 0 || days > 21) continue;
    out.push({ g, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** What a fence pays at a port for a pirate (a haven, a den you know, or a smuggler on the quiet). */
export function fenceAt(
  s: GameState,
  map: MapDef,
  p: number,
  life?: Life,
): { rate: number; where: string } {
  const year = yearOf(s);
  const haven = havenIn(map, p, year);
  if (haven) return { rate: CRUISE.fence.haven, where: haven.name };
  if (life && knowsDen(life, p))
    return { rate: CRUISE.fence.den, where: "the den's fence" };
  return { rate: CRUISE.fence.quay, where: "a smuggler on the quiet" };
}

/** A pirate haven within reach of a ship, open this year (the nearest). */
export function havenNear(
  s: GameState,
  map: MapDef,
  from: number,
  kind: BoatKind,
): { p: number; name: string; days: number } | null {
  const year = yearOf(s);
  let best: { p: number; name: string; days: number } | null = null;
  for (const h of HAVENS) {
    if (year < h.from || year > h.to) continue;
    const p = map.provinces.findIndex((d) => d.id === h.prov);
    if (p < 0) continue;
    const days = p === from ? 0 : (boatRoute(map, from, p, kind)?.days ?? -1);
    if (days < 0) continue;
    if (!best || days < best.days) best = { p, name: h.name, days };
  }
  return best;
}

/** The cruise by id. */
export function cruiseById(s: GameState, id: number): Cruise | undefined {
  return s.sea?.cruises.find((c) => c.id === id);
}

/** The player aboard who decides for the ship: the captain, else the highest. */
export function deciderOf(s: GameState, cr: Cruise): Life | undefined {
  const order: CruiseRole[] = ["captain", "officer", "crew"];
  for (const role of order)
    for (const h of cr.hands) {
      if (h.role !== role) continue;
      const l = lifeOfSeat(s, h.seat);
      if (l && !l.watching && l.c === h.c) return l;
    }
  return undefined;
}

/** The captain's skill at something: a player's, a known character's, or a stranger's. */
export function commanderSkill(s: GameState, cr: Cruise, sk: Skill): number {
  const c = s.chars[cr.captain];
  if (c?.alive) return charSkill(s, c, sk);
  return NPC_CAPTAIN[sk as keyof typeof NPC_CAPTAIN] ?? 7;
}

/** The difficulty for a player's choice, so the odds are the captain's when another commands. */
export function effDc(
  s: GameState,
  cr: Cruise,
  life: Life,
  sk: Skill,
  dc: number,
): number {
  const h = cr.hands.find((x) => x.seat === life.seat);
  if (h?.role === "captain") return dc;
  return dc + (skillLevel(s, life, sk) - commanderSkill(s, cr, sk));
}

/** At war, the commission's nation (a privateer). */
function inWar(s: GameState, n: number): boolean {
  return enemiesOf(s, n).size > 0;
}

/** The odds' plan for a cruise as she stands. */
export function planOf(s: GameState, map: MapDef, cr: Cruise): CruisePlan {
  const g = GROUND_BY_KEY.get(cr.ground)!;
  const foes = enemiesOf(s, cr.nation);
  const hunted = Math.max(
    0,
    cr.phase === "hunting" ? cr.until - s.day : cr.until - cr.start,
  );
  return {
    flag: cr.flag,
    nation: cr.nation,
    kind: cr.kind,
    guns: cr.guns,
    hull: cr.hull,
    ground: cr.ground,
    hunt: cr.phase === "fitting" ? cr.until - cr.start : hunted,
    sea: commanderSkill(s, cr, "seamanship"),
    fight: commanderSkill(s, cr, "fighting"),
    lead: commanderSkill(s, cr, "leadership"),
    war: foes.size > 0,
    lawful: (n) => cr.flag === "pirate" || foes.has(n),
    flags: groundFlags(s, g),
  };
}

/** A hand's part of a prize's value, as the articles have it. */
export function handFraction(
  s: GameState,
  map: MapDef,
  cr: Cruise,
  h: Hand,
  fence = 0,
): number {
  const life = lifeOfSeat(s, h.seat);
  const owner =
    cr.owner === "boat" && cr.boat?.seat === h.seat
      ? 1
      : 0;
  return shareFraction({
    flag: cr.flag,
    kind: cr.kind,
    role: h.role,
    others: cr.hands.filter((x) => x !== h).map((x) => x.role),
    owner,
    fence:
      fence ||
      (cr.flag === "pirate" ? fenceAt(s, map, cr.port, life).rate : 1),
  });
}

// ---------------------------------------------------------------- names

const PIRATE_SHIPS = [
  "Revenge",
  "Ranger",
  "Fancy",
  "Adventure",
  "Delight",
  "Royal James",
  "Rising Sun",
  "Night Rambler",
  "Good Fortune",
  "Black Joke",
  "Bachelor's Delight",
  "Happy Return",
];
const PRIVATEER_SHIPS: Record<string, string[]> = {
  england: ["Tartar", "Defiance", "Dragon", "Duke", "Duchess", "Charming Sally", "Prince William", "Terrible", "Hawke", "Boscawen"],
  france: ["La Concorde", "Le Triomphant", "La Fortune", "Le Hardi", "La Belle Poule", "Le Comte de Toulouse"],
  spain: ["San José", "El Volante", "Nuestra Señora del Carmen", "La Galga", "San Antonio", "El Rayo"],
  netherlands: ["De Vliegende Draak", "Fortuyn", "De Hoop", "Zeepaard", "De Eendracht"],
  sweden: ["Fortuna", "Kalmar Nyckel", "Svärdet"],
};
const PRIZE_NAMES: Record<string, string[]> = {
  england: ["Mary and Sarah", "Prosperous", "Charming Betty", "Two Friends", "Endeavour", "Susannah", "Good Hope", "Hannah", "Swift", "Sea Nymph"],
  france: ["Saint-Pierre", "Marie-Anne", "Bonne Espérance", "Saint-Louis", "Diligente", "Jeune Henriette", "Aimable"],
  spain: ["Santa Rosa", "Nuestra Señora de Begoña", "San Felipe", "Santísima Trinidad", "San Francisco de Asís", "Santa Catalina", "Buen Jesús"],
  netherlands: ["Vergulde Swaen", "Hoop", "Witte Paard", "Sint Jan", "Eenhoorn"],
  sweden: ["Kronan", "Svanen", "Fortuna"],
};
const CAPTAINS = [
  "Josiah Penhallow",
  "Nathaniel Crabb",
  "Elias Thorne",
  "Bartholomew Leach",
  "Walter Kemp",
  "Ezekiel Dare",
  "John Hawkhurst",
  "Samuel Fenn",
  "Thomas Gale",
  "Jacques Lemaire",
  "Diego Varela",
  "Pieter Smit",
];

function hashOf(...xs: number[]): number {
  let h = 2166136261 | 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
  }
  return h | 0;
}

/** A prize's name, by her flag's tongue. */
function prizeName(s: GameState, r: Rng, flag: number, kind: string): string {
  const key = s.nations[flag]?.key ?? "england";
  const list = PRIZE_NAMES[key] ?? PRIZE_NAMES.england;
  const n = r.pick(list) ?? "Fortune";
  if (kind === "galleon") return `the ${n.startsWith("Nuestra") || n.startsWith("San") || n.startsWith("Santa") ? n : "Nuestra Señora de la Concepción"}`;
  return `the ${n}`;
}

// ---------------------------------------------------------------- offers at the quay

/** A cruise to sign on for: fitting out at the quay, or one already fitting you could join. */
export interface CruiseOffer {
  /** The quay's offer ("o:<port>:<month>:<slot>"), or the fitting cruise's id. */
  key: string;
  cruise?: number;
  flag: CruiseFlag;
  nation: number;
  ship: string;
  kind: BoatKind;
  guns: number;
  captain: number;
  cname: string;
  owner: Cruise["owner"];
  port: number;
  ground: string;
  hunt: number;
  /** Days to the ground (one way). */
  passage: number;
  sails: number;
  /** The players aboard already (their roles). */
  aboard: CruiseRole[];
}

/** Ports where pirates fit out this year: pirate waters in the pirate years, or a haven. */
export function piratesFitHere(s: GameState, w: World, p: number): boolean {
  const year = yearOf(s);
  if (havenIn(w.map, p, year)) return true;
  if (!w.map.provinces[p]?.coastal) return false;
  if ((s.provinces[p].b.port ?? 0) <= 0) return false;
  return pirateWaters(w, p) && year >= 1650 && year <= 1730;
}

/** Privateers fit out at a port whose colony is at war with another power. */
export function privateersFitHere(s: GameState, w: World, p: number): number {
  const owner = s.provinces[p]?.owner ?? -1;
  if (owner < 0 || s.nations[owner]?.kind !== "power") return -1;
  if (!w.map.provinces[p]?.coastal || (s.provinces[p].b.port ?? 0) <= 0)
    return -1;
  return inWar(s, owner) ? owner : -1;
}

/** Ships fitting out at a port this month (the same for everyone), and cruises fitting you could join. */
export function cruiseOffers(
  s: GameState,
  w: World,
  p: number,
): CruiseOffer[] {
  const out: CruiseOffer[] = [];
  const map = w.map;
  const month = Math.floor(s.day / 30);
  for (const cr of seaOf(s).cruises)
    if (cr.phase === "fitting" && cr.port === p)
      out.push({
        key: `c:${cr.id}`,
        cruise: cr.id,
        flag: cr.flag,
        nation: cr.nation,
        ship: cr.ship,
        kind: cr.kind,
        guns: cr.guns,
        captain: cr.captain,
        cname: cr.cname,
        owner: cr.owner,
        port: cr.port,
        ground: cr.ground,
        hunt: cr.until - cr.start,
        passage: Math.max(0, daysTo(map, p, GROUND_BY_KEY.get(cr.ground)!, cr.kind)),
        sails: cr.sails,
        aboard: cr.hands.map((h) => h.role),
      });
  const taken = new Set(seaOf(s).cruises.map((c) => c.offer).filter(Boolean));
  const kinds = (port: number): BoatKind[] => {
    const lv = s.provinces[port].b.port ?? 0;
    return lv >= 2
      ? ["sloop", "schooner", "brig", "ship"]
      : lv >= 1
        ? ["sloop", "schooner", "brig"]
        : ["sloop", "schooner"];
  };
  const make = (flag: CruiseFlag, nation: number, salt: number) => {
    const rng = new Rng({ rng: hashOf(s.settings.seed, p, month, salt) });
    const n = rng.int(0, 2) > 0 ? (rng.chance(0.4) ? 2 : 1) : 1;
    for (let slot = 0; slot < n; slot++) {
      const key = `o:${p}:${month}:${salt}:${slot}`;
      const ks = kinds(p);
      const kind = ks[Math.min(ks.length - 1, Math.floor(rng.next() * rng.next() * ks.length))];
      const grounds = groundsFrom(s, map, p, kind);
      if (!grounds.length) {
        rng.next();
        continue;
      }
      const gi = grounds[Math.min(grounds.length - 1, Math.floor(rng.next() * rng.next() * grounds.length))];
      const nkey = s.nations[nation]?.key ?? "england";
      const ship =
        flag === "pirate"
          ? (rng.pick(PIRATE_SHIPS) ?? "Revenge")
          : (rng.pick(PRIVATEER_SHIPS[nkey] ?? PRIVATEER_SHIPS.england) ?? "Tartar");
      const cname = rng.pick(CAPTAINS) ?? "Thomas Gale";
      const long = rng.chance(0.45);
      const guns = Math.round(BOATS[kind].guns * (0.8 + rng.next() * 0.5));
      const sails = s.day + rng.int(CRUISE.fitting[0], CRUISE.fitting[1]);
      if (taken.has(key)) continue;
      out.push({
        key,
        flag,
        nation,
        ship,
        kind,
        guns,
        captain: -1,
        cname,
        owner: "outfit",
        port: p,
        ground: gi.g.key,
        hunt: long ? CRUISE.hunt.long : CRUISE.hunt.short,
        passage: gi.days,
        sails,
        aboard: [],
      });
    }
  };
  if (piratesFitHere(s, w, p))
    make("pirate", s.provinces[p].owner, 515);
  const priv = privateersFitHere(s, w, p);
  if (priv >= 0) make("privateer", priv, 616);
  return out;
}

// ---------------------------------------------------------------- who may sign

/** A life at sea already, or bound to sail: on a cruise or a voyage. */
export function seaBusy(s: GameState, life: Life): string | null {
  for (const cr of seaOf(s).cruises)
    if (
      cr.phase !== "done" &&
      cr.phase !== "lost" &&
      cr.hands.some((h) => h.seat === life.seat && h.c === life.c)
    )
      return `You've signed the articles of the ${cr.ship}.`;
  for (const v of seaOf(s).voyages)
    if (v.phase !== "done" && !v.sent && v.seat === life.seat && v.c === life.c)
      return "You're bound on a voyage already.";
  return null;
}

/** Whether you may sign aboard in a role: your skill, your name, and the law. */
export function roleCheck(
  s: GameState,
  life: Life,
  flag: CruiseFlag,
  role: CruiseRole,
  owner: Cruise["owner"],
): Check {
  const sea = skillLevel(s, life, "seamanship");
  const fight = skillLevel(s, life, "fighting");
  const job = life.job;
  const seaLife =
    ["sailor", "fisherman", "whaler", "pirate", "smuggler"].includes(
      life.background,
    ) || (!!job && ["sailor", "fisherman", "whaler", "pirate", "smuggler"].includes(job.kind));
  const name = life.crime?.notoriety ?? 0;
  if (role === "crew") {
    if (sea < 2 && !seaLife && fight < 4)
      return no("Needs seamanship 2 (or fighting 4): a landsman's no use aboard.");
    return yes;
  }
  if (role === "officer") {
    if (flag === "pirate") {
      const qm = job?.kind === "pirate" && job.rank >= 2;
      if (!qm && name < 25 && sea < 8)
        return no("The pirates choose their quartermaster: a pirate's name (notoriety 25), or seamanship 8.");
      return yes;
    }
    const mate = job?.kind === "sailor" && job.rank >= 2;
    if (!mate && sea < 7 && fight < 8)
      return no("An officer: seamanship 7 or fighting 8 (or a mate's rank).");
    return yes;
  }
  // The captain.
  if (owner !== "outfit") {
    if (sea < 2 && !seaLife) return no("Needs seamanship 2 at the least.");
    return yes;
  }
  if (flag === "pirate") {
    const cpt = job?.kind === "pirate" && job.rank >= 3;
    if (!cpt && (name < 50 || sea < 9))
      return no("The pirates elect their captain: a pirate captain's rank, or a great name (notoriety 50) and seamanship 9.");
    return yes;
  }
  const master =
    job?.kind === "sailor" && job.rank >= 3;
  if (!master && (sea < 10 || life.renown < 8))
    return no("The owners want a master they know: a ship's captain's rank, or seamanship 10 and renown 8.");
  return yes;
}

/** Whether you can sign aboard this offer in this role now. */
export function signCheck(
  s: GameState,
  w: World,
  life: Life,
  o: CruiseOffer,
  role: CruiseRole,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.crime?.jail) return no("Not from a cell.");
  if (life.travel) return no("You're on the road.");
  if (life.prov !== o.port)
    return no(`She fits out at ${w.map.provinces[o.port].name}.`);
  if (s.armies.some((a) => a.commander === me.id) || (life.job?.army ?? -1) >= 0)
    return no("You march with an army.");
  if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
    return no("Servants don't come and go as they please.");
  const busy = seaBusy(s, life);
  if (busy) return no(busy);
  if (o.flag === "privateer" && enemiesOf(s, o.nation).size === 0)
    return no("The war's over: her commission is void.");
  const cr = o.cruise !== undefined ? cruiseById(s, o.cruise) : undefined;
  if (role === "captain") {
    if (cr && (cr.hands.some((h) => h.role === "captain") || cr.owner !== "outfit"))
      return no("She has her captain.");
  }
  if (role === "officer" && cr && cr.hands.filter((h) => h.role === "officer").length >= 2)
    return no("Her officers' berths are taken.");
  return roleCheck(s, life, o.flag, role, o.owner);
}

/** What a hand stands to make: the odds of the cruise for you in that role. */
export function offerOdds(
  s: GameState,
  w: World,
  life: Life,
  o: CruiseOffer,
  role: CruiseRole,
): OddsView {
  const g = GROUND_BY_KEY.get(o.ground)!;
  const foes = enemiesOf(s, o.nation);
  const sk = (k: Skill) =>
    role === "captain"
      ? skillLevel(s, life, k)
      : o.captain >= 0 && s.chars[o.captain]
        ? charSkill(s, s.chars[o.captain], k)
        : (NPC_CAPTAIN[k as keyof typeof NPC_CAPTAIN] ?? 7);
  const plan: CruisePlan = {
    flag: o.flag,
    nation: o.nation,
    kind: o.kind,
    guns: o.guns,
    hull: 100,
    ground: o.ground,
    hunt: o.hunt,
    sea: sk("seamanship"),
    fight: sk("fighting"),
    lead: sk("leadership"),
    war: foes.size > 0,
    lawful: (n) => o.flag === "pirate" || foes.has(n),
    flags: groundFlags(s, g),
  };
  const fence = o.flag === "pirate" ? fenceAt(s, w.map, o.port, life).rate : 1;
  const ownerShare = o.owner === "boat" && role === "captain" ? 1 : 0;
  const parts = totalParts(o.kind, o.flag, [role, ...o.aboard]);
  const outfit =
    ownerShare > 0
      ? r1(CRUISE.outfit * parts * ((o.hunt + o.passage * 2) / 30))
      : 0;
  return cruiseOdds(s, {
    plan,
    role,
    others: o.aboard,
    owner: ownerShare,
    fence,
    passage: o.passage * 2,
    outfit,
    title: `A cruise ${g.name}, as ${ROLE_NAMES[o.flag][role].toLowerCase()}`,
  });
}

// ---------------------------------------------------------------- signing

/** A new cruise from an offer (the quay's, your own boat's, a company's). */
export function newCruise(
  g: ConquestGame,
  o: CruiseOffer,
  extra: Partial<Cruise>,
): Cruise {
  const s = g.s;
  const gd = GROUND_BY_KEY.get(o.ground)!;
  const cr: Cruise = {
    id: g.nextId(),
    flag: o.flag,
    nation: o.nation,
    ship: o.ship,
    kind: o.kind,
    guns: o.guns,
    men: menAboard(o.kind),
    hull: 100,
    morale: 70,
    owner: o.owner,
    captain: o.captain,
    cname: o.cname,
    hands: [],
    port: o.port,
    ground: o.ground,
    stations: stationsOf(g.map, gd),
    phase: "fitting",
    way: null,
    sails: o.sails,
    until: s.day + o.hunt,
    start: s.day,
    chances: 0,
    encounter: null,
    prizes: [],
    idle: 0,
    scurvy: 0,
    log: [],
    ...extra,
  };
  // `until` is reckoned again when she reaches the ground; `start` too.
  cr.until = cr.start + o.hunt;
  seaState(g).cruises.push(cr);
  seaChanged(g);
  return cr;
}

function logLine(g: ConquestGame, cr: Cruise, text: string): void {
  cr.log.push({ day: g.s.day, text });
  if (cr.log.length > 40) cr.log.splice(0, cr.log.length - 40);
  seaChanged(g);
}

/** Tell everyone aboard (their journals), as news of their own affairs. */
function tellAll(
  g: ConquestGame,
  cr: Cruise,
  text: string,
  tone?: "good" | "bad",
  loud = false,
): void {
  for (const h of cr.hands) {
    const l = lifeOfSeat(g.s, h.seat);
    if (!l || l.watching || l.c !== h.c) continue;
    affairNews(g, l, "sea", text, tone);
    if (loud) wake(g, l, text);
  }
}

/** Sign the articles of a ship at the quay (or one fitting out), in a role. */
export function signOn(
  g: ConquestGame,
  life: Life,
  key: string,
  role: CruiseRole,
): string | null {
  const s = g.s;
  if (!["captain", "officer", "crew"].includes(role)) return "No such berth.";
  const o = cruiseOffers(s, g.w, life.prov).find((x) => x.key === key);
  if (!o) return "She's sailed, or was never here.";
  const check = signCheck(s, g.w, life, o, role);
  if (!check.ok) return check.why;
  const cr =
    o.cruise !== undefined
      ? cruiseById(s, o.cruise)!
      : newCruise(g, o, { offer: o.key });
  touchLife(g, life);
  cr.hands.push({ seat: life.seat, c: life.c, role, joined: s.day });
  if (role === "captain") {
    cr.captain = life.c;
    cr.cname = charName(meOf(s, life));
  }
  seaChanged(g);
  const gd = GROUND_BY_KEY.get(cr.ground)!;
  const what =
    cr.flag === "pirate"
      ? "the articles of a pirate company"
      : `a privateer's articles under ${aRig(`${s.nations[cr.nation]?.adjective ?? ""} commission`)}`;
  journal(
    g,
    life,
    `You sign ${what}: ${ROLE_NAMES[cr.flag][role].toLowerCase()} of the ${cr.ship}, ${aRig(BOATS[cr.kind].name.toLowerCase())} of ${cr.guns} guns, for a cruise ${gd.name}. She sails on ${formatDate(cr.sails)}: be aboard.`,
  );
  logLine(g, cr, `${charName(meOf(s, life))} signs as ${ROLE_NAMES[cr.flag][role].toLowerCase()}.`);
  if (cr.flag === "pirate") addNotoriety(g, life, 2);
  return null;
}

/** Your own boat out on a cruise, with you in command. */
export function ownCruiseCheck(
  s: GameState,
  w: World,
  life: Life,
  boatId: number,
  ground: string,
  pirate: boolean,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (life.travel) return no("You're on the road.");
  const b = (life.boats ?? []).find((x) => x.id === boatId);
  if (!b) return no("Not your boat.");
  if (b.prov !== life.prov) return no(`She lies at ${w.map.provinces[b.prov].name}.`);
  if (b.away) return no("She's away with her skipper.");
  if (!BOATS[b.kind].uses.includes("privateering"))
    return no(`A ${BOATS[b.kind].name.toLowerCase()} is no ship to take prizes in.`);
  if (b.crew < BOATS[b.kind].crew)
    return no(`She needs ${BOATS[b.kind].crew} hands (she has ${b.crew}).`);
  if (b.condition < 50) return no("Her hull's not fit for a cruise: repair her first.");
  const busy = seaBusy(s, life);
  if (busy) return no(busy);
  const g = GROUND_BY_KEY.get(ground);
  if (!g) return no("Choose a ground.");
  if (!groundsFrom(s, w.map, b.prov, b.kind).some((x) => x.g.key === ground))
    return no(`${cap(g.name)} is out of her reach (or out of season).`);
  if (!pirate) {
    const m = b.marque;
    if (!m) return no("She has no letter of marque: take one out at the governor's house.");
    if (!inWar(s, m.nation)) return no("Her letter of marque lapsed with the peace.");
  }
  const roles = roleCheck(s, life, pirate ? "pirate" : "privateer", "captain", "boat");
  if (!roles.ok) return roles;
  const outfit = ownOutfit(b.kind, pirate, CRUISE.hunt.short, 0);
  if (life.purse < outfit)
    return no(`Victuals, powder and shot for her company: ${outfit} coins.`);
  return yes;
}

/** Victuals and powder for your own boat's company, for a cruise of so many days. */
export function ownOutfit(
  kind: BoatKind,
  pirate: boolean,
  hunt: number,
  passage: number,
): number {
  const parts = totalParts(kind, pirate ? "pirate" : "privateer", ["captain"]);
  return r1(CRUISE.outfit * parts * ((hunt + passage * 2) / 30));
}

/** Take your own boat on a cruise: privateering under her letter of marque, or on the account. */
export function ownCruise(
  g: ConquestGame,
  life: Life,
  boatId: number,
  ground: string,
  long: boolean,
  pirate: boolean,
): string | null {
  const s = g.s;
  const check = ownCruiseCheck(s, g.w, life, boatId, ground, pirate);
  if (!check.ok) return check.why;
  const b = (life.boats ?? []).find((x) => x.id === boatId)!;
  const gd = GROUND_BY_KEY.get(ground)!;
  const hunt = long ? CRUISE.hunt.long : CRUISE.hunt.short;
  const passage = Math.max(0, daysTo(g.map, b.prov, gd, b.kind));
  const outfit = ownOutfit(b.kind, pirate, hunt, passage);
  if (life.purse < outfit) return `Victuals and powder: ${outfit} coins.`;
  const me = meOf(s, life)!;
  const nation = pirate ? me.nation : b.marque!.nation;
  const cr = newCruise(
    g,
    {
      key: `b:${b.id}`,
      flag: pirate ? "pirate" : "privateer",
      nation,
      ship: b.name,
      kind: b.kind,
      guns: BOATS[b.kind].guns,
      captain: life.c,
      cname: charName(me),
      owner: "boat",
      port: b.prov,
      ground,
      hunt,
      passage,
      sails: s.day + 1,
      aboard: [],
    },
    { boat: { seat: life.seat, id: b.id }, hull: b.condition, morale: b.morale },
  );
  withFlow(g, { key: `sea:${cr.id}`, label: `The ${b.name}'s cruise: victuals and powder`, aff: "sea" }, () =>
    spend(g, life, outfit),
  );
  cr.hands.push({ seat: life.seat, c: life.c, role: "captain", joined: s.day });
  journal(
    g,
    life,
    `You fit out the ${b.name} for a cruise ${gd.name}${pirate ? ", on the account (no commission: piracy)" : ` under her letter of marque`}: ${outfit} coins of victuals, powder and shot. She sails tomorrow.`,
  );
  if (pirate) addNotoriety(g, life, 3);
  logLine(g, cr, `${charName(me)} fits her out for a cruise ${gd.name}.`);
  return null;
}

/** Leave the articles before she sails (in port). */
export function unsign(g: ConquestGame, life: Life): string | null {
  for (const cr of seaOf(g.s).cruises) {
    const h = cr.hands.find((x) => x.seat === life.seat && x.c === life.c);
    if (!h) continue;
    if (cr.phase !== "fitting") return "She's sailed: you're aboard till she's home.";
    if (cr.owner === "boat" && cr.boat?.seat === life.seat)
      return cancelOwn(g, cr, "her captain changed his mind");
    cr.hands = cr.hands.filter((x) => x !== h);
    if (h.role === "captain") {
      cr.captain = -1;
      cr.cname = CAPTAINS[cr.id % CAPTAINS.length];
    }
    seaChanged(g);
    journal(g, life, `You take your name off the ${cr.ship}'s articles.`);
    return null;
  }
  return "You've signed nothing.";
}

function cancelOwn(g: ConquestGame, cr: Cruise, why: string): string | null {
  cr.phase = "done";
  cr.end = `Never sailed: ${why}.`;
  seaChanged(g);
  const life = cr.boat ? lifeOfSeat(g.s, cr.boat.seat) : undefined;
  if (life) journal(g, life, `The ${cr.ship}'s cruise is given up: ${why}.`);
  return null;
}

// ---------------------------------------------------------------- the ship's way

/** Days for a leg: under a passage's sail out and home, easy sail on the ground. */
function legDays(map: MapDef, from: number, to: number, cr: Cruise, hunting: boolean): number {
  const lane = map.provinces[from].sea.find(([q]) => q === to);
  const km = lane ? lane[1] : 300;
  const pace = hullPace(BOATS[cr.kind].speed, cr.hull) * (hunting ? 0.5 : 1);
  return 1 + Math.ceil(km / (SEA_KM_DAY * pace));
}

/** Set her on her way from `from` to `to` (a passage), or false if there's none. */
function setCourse(g: ConquestGame, cr: Cruise, from: number, to: number, hunting: boolean): boolean {
  const s = g.s;
  if (from === to) {
    cr.way = { prov: from, path: [], sea: [], depart: s.day, arrive: s.day };
    return true;
  }
  let path: number[];
  if (hunting && g.map.provinces[from].sea.some(([q]) => q === to)) path = [to];
  else {
    const r = boatRoute(g.map, from, to, cr.kind);
    if (!r) return false;
    path = r.path;
  }
  cr.way = {
    prov: from,
    path,
    sea: path.map(() => true),
    depart: s.day,
    arrive: s.day + legDays(g.map, from, path[0], cr, hunting),
  };
  return true;
}

/** Everyone aboard goes where she goes: their travel is her way (so the map shows them aboard). */
export function syncHands(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  const atSea =
    cr.way !== null &&
    (cr.phase === "out" || cr.phase === "hunting" || cr.phase === "home");
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.watching || life.c !== h.c) continue;
    touchLife(g, life);
    if (atSea && cr.way) {
      const w = cr.way;
      const path = w.path.length ? [...w.path] : [w.prov];
      life.prov = w.prov;
      life.travel = {
        dest: cr.port,
        path,
        sea: path.map(() => true),
        depart: w.depart,
        arrive: Math.max(w.arrive, s.day + 1),
        cost: 0,
        ship: cr.id,
        ...(cr.boat && cr.boat.seat === life.seat ? { boat: cr.boat.id } : {}),
      };
      life.area = undefined;
    } else if (life.travel?.ship === cr.id) {
      life.travel = null;
      life.prov = cr.way?.prov ?? cr.port;
      life.area = "docks";
    }
  }
}

/** A day's sailing: arrivals at a station or home. Returns the province reached, or -1. */
function sailOn(g: ConquestGame, cr: Cruise): number {
  const w = cr.way;
  if (!w || !w.path.length) return -1;
  if (g.s.day < w.arrive) return -1;
  const next = w.path.shift()!;
  w.sea.shift();
  w.prov = next;
  if (w.path.length) {
    w.depart = g.s.day;
    w.arrive = g.s.day + legDays(g.map, next, w.path[0], cr, cr.phase === "hunting");
  }
  seaChanged(g);
  // The coast seen from the deck.
  for (const h of cr.hands) {
    const life = lifeOfSeat(g.s, h.seat);
    if (life && life.c === h.c) {
      reveal(g, life, [next]);
      gainXp(g, life, "seamanship", 3);
      life.trail.push({ day: g.s.day, p: next, c: life.c });
      if (life.trail.length > 400) life.trail.splice(0, life.trail.length - 400);
    }
  }
  return w.path.length ? -1 : next;
}

/** The next station on the ground after this one. */
function nextStation(cr: Cruise, at: number): number {
  const i = cr.stations.indexOf(at);
  return cr.stations[(i + 1) % cr.stations.length] ?? cr.stations[0];
}

// ---------------------------------------------------------------- each day

/** Each day: every ship at sea moves, hunts, comes home and settles. */
export function cruisesDaily(g: ConquestGame): void {
  const s = g.s;
  const list = s.sea?.cruises;
  if (!list?.length) return;
  for (const cr of [...list]) {
    peaceNews(g, cr);
    switch (cr.phase) {
      case "fitting":
        if (s.day >= cr.sails) setSail(g, cr);
        break;
      case "out": {
        const at = sailOn(g, cr);
        if (at >= 0) {
          cr.phase = "hunting";
          const hunt = cr.until - cr.start;
          cr.start = s.day;
          cr.until = s.day + hunt;
          const gd = GROUND_BY_KEY.get(cr.ground)!;
          logLine(g, cr, `On the ground: ${gd.name}.`);
          tellAll(g, cr, `The ${cr.ship} is on her cruising ground, ${gd.name}: a sharp lookout now.`);
          setCourse(g, cr, at, nextStation(cr, at), true);
        }
        dayAtSea(g, cr);
        break;
      }
      case "hunting": {
        const at = sailOn(g, cr);
        if (at >= 0) setCourse(g, cr, at, nextStation(cr, at), true);
        hunt(g, cr);
        if (cr.phase === "hunting" && s.day >= cr.until && !cr.encounter)
          turnForHome(g, cr, "Her time on the ground is up: she puts about for home.");
        dayAtSea(g, cr);
        break;
      }
      case "home": {
        const at = sailOn(g, cr);
        if (at >= 0 || (cr.way && !cr.way.path.length)) makePort(g, cr);
        else dayAtSea(g, cr);
        break;
      }
      case "selling":
        if (s.day >= (cr.court ?? s.day)) settle(g, cr);
        break;
      case "done":
      case "lost":
        // Kept a while for the tale, then gone.
        if (s.day - (cr.log[cr.log.length - 1]?.day ?? cr.start) > 60) {
          seaState(g).cruises = seaState(g).cruises.filter((x) => x !== cr);
          seaChanged(g);
        }
        break;
    }
    if (cr.phase === "out" || cr.phase === "hunting" || cr.phase === "home")
      syncHands(g, cr);
  }
}

/**
 * The peace reaches a privateer: her commission is void. At sea she puts
 * about for home (anything taken after the peace is restored to its owners);
 * fitting out, she's given up.
 */
function peaceNews(g: ConquestGame, cr: Cruise): void {
  if (cr.flag !== "privateer" || cr.peace !== undefined) return;
  if (inWar(g.s, cr.nation)) return;
  if (cr.phase === "fitting") {
    cr.phase = "done";
    cr.end = "The peace came before she sailed: her commission is void.";
    logLine(g, cr, cr.end);
    tellAll(g, cr, `The peace is signed: the ${cr.ship}'s commission is void, and she won't sail.`);
    return;
  }
  if (cr.phase !== "out" && cr.phase !== "hunting") return;
  cr.peace = g.s.day;
  cr.encounter = null;
  clearEncounterEvents(g, cr);
  seaChanged(g);
  logLine(g, cr, "News of the peace: her commission is void.");
  tellAll(
    g,
    cr,
    `A packet brings news of the peace: the ${cr.ship}'s letter of marque is void. Anything taken now is piracy, and must be given back.`,
    undefined,
    true,
  );
  turnForHome(g, cr, "With the peace, she puts about for home.");
}

/** She sails: those not aboard are left on the quay; the owners find her victuals. */
function setSail(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  for (const h of [...cr.hands]) {
    const life = lifeOfSeat(s, h.seat);
    const aboard =
      !!life && !life.watching && life.c === h.c && life.prov === cr.port && !life.travel && !life.crime?.jail;
    if (aboard) continue;
    cr.hands = cr.hands.filter((x) => x !== h);
    if (h.role === "captain") {
      cr.captain = -1;
      cr.cname = CAPTAINS[cr.id % CAPTAINS.length];
    }
    if (life && life.c === h.c)
      journal(g, life, `The ${cr.ship} sailed without you: you weren't aboard.`, "bad");
  }
  if (cr.owner === "boat") {
    const life = cr.boat ? lifeOfSeat(s, cr.boat.seat) : undefined;
    const b = life?.boats?.find((x) => x.id === cr.boat!.id);
    if (!life || !b || !cr.hands.some((h) => h.seat === life.seat)) {
      cancelOwn(g, cr, "her captain wasn't aboard");
      return;
    }
  }
  if (!cr.hands.length && cr.owner !== "firm") {
    // Nobody we follow: she sails out of the tale.
    seaState(g).cruises = seaState(g).cruises.filter((x) => x !== cr);
    seaChanged(g);
    return;
  }
  const gd = GROUND_BY_KEY.get(cr.ground)!;
  const first = nearestStation(g.map, cr);
  if (first < 0 || !setCourse(g, cr, cr.port, first, false)) {
    cr.phase = "done";
    cr.end = "She couldn't find a way to her ground.";
    seaChanged(g);
    return;
  }
  cr.phase = cr.way && cr.way.path.length ? "out" : "hunting";
  if (cr.phase === "hunting") {
    setCourse(g, cr, first, nextStation(cr, first), true);
    const hunt = cr.until - cr.start;
    cr.start = s.day;
    cr.until = s.day + hunt;
  } else {
    // The hunting's length is kept; the start moves to her arrival.
    const hunt = cr.until - cr.start;
    cr.start = s.day;
    cr.until = s.day + hunt;
  }
  cr.men = menAboard(cr.kind);
  logLine(g, cr, `Sails from ${g.map.provinces[cr.port].name} for ${gd.name}.`);
  tellAll(g, cr, `The ${cr.ship} sails on the morning tide for ${gd.name}, with you aboard.`);
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (life && life.c === h.c)
      milestone(g, life, "voyage", `Sailed in the ${cr.ship} on a cruise ${gd.name}`);
  }
  syncHands(g, cr);
}

/** The station she makes for first: the nearest of the ground's. */
function nearestStation(map: MapDef, cr: Cruise): number {
  let best = -1;
  let bestDays = Infinity;
  for (const p of cr.stations) {
    if (p === cr.port) return p;
    const r = boatRoute(map, cr.port, p, cr.kind);
    if (r && r.days < bestDays) {
      bestDays = r.days;
      best = p;
    }
  }
  return best;
}

/** A day at sea: the men's temper, scurvy, wear on her hull. */
function dayAtSea(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  cr.idle++;
  const atSeaDays = s.day - cr.sails;
  if (atSeaDays > CRUISE.scurvyAfter) cr.scurvy = Math.min(100, cr.scurvy + 2);
  if (s.day % 10 === 0) cr.hull = Math.max(0, cr.hull - 1);
  // Restless without a prize.
  if (cr.idle > 25 && s.day % 5 === 0) cr.morale = Math.max(0, cr.morale - 3);
  const r = sdice(g);
  // Scurvy, once it has a hold: a scene for the one who decides.
  if (cr.scurvy >= 30 && !cr.encounter && r.chance(0.04)) {
    const d = deciderOf(s, cr);
    if (d) raiseEvent(g, d, "sea-scurvy", { cr: cr.id });
    else scurvyNow(g, cr, "press");
  }
  // A mutinous temper.
  if (cr.morale < 25 && !cr.encounter && r.chance(0.03)) {
    const d = deciderOf(s, cr);
    if (d) raiseEvent(g, d, "sea-mutiny", { cr: cr.id, c: npcCaptain(s, cr) });
    else mutinyNow(g, cr, "promise", r.chance(0.5));
  }
}

/** The computer's captain in command (for a scene's figure), or -1. */
function npcCaptain(s: GameState, cr: Cruise): number {
  const c = s.chars[cr.captain];
  return c?.alive && !lifeOfChar(s, c.id) ? c.id : -1;
}

// ---------------------------------------------------------------- the hunt

/** A chance at a sail, every few days on the ground. */
function hunt(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  // An encounter left too long: the captain settles it his way.
  if (cr.encounter) {
    if (s.day - cr.encounter.day >= CRUISE.waitDays) {
      clearEncounterEvents(g, cr);
      autoResolve(g, cr);
    }
    return;
  }
  const since = s.day - cr.start;
  const due = Math.floor(since / CRUISE.chanceDays);
  if (due <= cr.chances || s.day >= cr.until) return;
  cr.chances++;
  seaChanged(g);
  sight(g, cr, sdice(g));
}

/** Roll a chance: a sail (her kind, flag, guns and worth), a man-of-war, or an empty sea. */
export function sight(g: ConquestGame, cr: Cruise, r: Rng): Encounter | null {
  const s = g.s;
  const gd = GROUND_BY_KEY.get(cr.ground)!;
  if (!r.chance(CRUISE.sail)) return null;
  const war = inWar(s, cr.nation);
  if (r.chance(war ? CRUISE.warshipWar : CRUISE.warship)) {
    const flags = groundFlags(s, gd).filter((f) => f >= 0);
    // Her own navy for a pirate; the enemy's for a privateer.
    const foes = [...enemiesOf(s, cr.nation)];
    const flag =
      cr.flag === "pirate"
        ? (r.pick(flags) ?? cr.nation)
        : (r.pick(foes.length ? foes : flags) ?? -1);
    cr.encounter = {
      kind: WARSHIP.kind,
      flag,
      guns: WARSHIP.guns,
      value: 0,
      name: s.nations[flag]?.adjective ? aRig(`${s.nations[flag].adjective} man-of-war`) : "a man-of-war",
      stage: "warship",
      day: s.day,
    };
    seaChanged(g);
    pose(g, cr);
    return cr.encounter;
  }
  const kinds = PREY.filter((k) => k.kind !== "galleon" || gd.galleons);
  const total = kinds.reduce((m, k) => m + k.w, 0);
  let roll = r.next() * total;
  let k = kinds[kinds.length - 1];
  for (const x of kinds) {
    roll -= x.w;
    if (roll < 0) {
      k = x;
      break;
    }
  }
  const flags = groundFlags(s, gd);
  const flag = flags[r.int(0, flags.length - 1)];
  const guns = r.int(k.guns[0], k.guns[1]);
  const value = Math.round(k.value[0] + r.next() * (k.value[1] - k.value[0]));
  cr.encounter = {
    kind: k.kind,
    flag,
    guns,
    value,
    name: prizeName(s, r, flag, k.kind),
    stage: "sighted",
    day: s.day,
  };
  seaChanged(g);
  pose(g, cr);
  return cr.encounter;
}

/** Put the matter before whoever decides (a scene), or settle it the captain's way. */
function pose(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  const e = cr.encounter;
  if (!e) return;
  const d = deciderOf(s, cr);
  if (!d) {
    autoResolve(g, cr);
    return;
  }
  const ctx = { cr: cr.id, c: npcCaptain(s, cr) };
  // A hand isn't asked whether to chase or what to do with a prize: the
  // captain decides, and the hand is told. The boarding and a man-of-war
  // are everyone's business.
  const hand = cr.hands.find((h) => h.seat === d.seat)?.role === "crew";
  if (hand && (e.stage === "sighted" || e.stage === "taken")) {
    autoResolveStage(g, cr);
    if (cr.encounter?.stage === "alongside") pose(g, cr);
    return;
  }
  if (hand && e.stage === "alongside") {
    // The captain hails her to strike; if she won't, it's a boarding, and
    // the hand's part in it is their own to choose.
    const plan = planOf(s, g.map, cr);
    const r = sdice(g);
    if (r.next() < chanceOf(plan.lead, strikeDc(e.guns, cr.flag))) {
      tellAll(g, cr, `The ${cr.ship} ran up alongside ${describe(s, e)} and her captain hailed her to strike: she did, without a shot.`);
      boardNow(g, cr, "strike", true, r);
      return;
    }
    raiseEvent(g, d, "sea-board-hand", ctx);
    wake(g, d, "Boarders away!");
    return;
  }
  switch (e.stage) {
    case "warship":
      raiseEvent(g, d, "sea-warship", ctx);
      break;
    case "sighted":
      raiseEvent(
        g,
        d,
        wouldChase(planOf(s, g.map, cr), e.kind, e.flag) ? "sea-sail" : "sea-sail-let",
        ctx,
      );
      break;
    case "alongside":
      raiseEvent(g, d, "sea-board", ctx);
      break;
    case "taken":
      raiseEvent(g, d, "sea-prize", ctx);
      break;
  }
  wake(g, d, e.stage === "warship" ? "A man-of-war!" : "A sail!");
}

/** The scenes still waiting for this ship's matter (taken away when it's settled another way). */
function clearEncounterEvents(g: ConquestGame, cr: Cruise): void {
  for (const life of g.s.lives) {
    const before = life.events.length;
    life.events = life.events.filter(
      (e) => !(e.key.startsWith("sea-") && e.ctx.cr === cr.id && SHIP_SCENES.has(e.key)),
    );
    if (life.events.length !== before) touchLife(g, life);
  }
}

const SHIP_SCENES = new Set([
  "sea-sail",
  "sea-sail-let",
  "sea-board",
  "sea-prize",
  "sea-warship",
  "sea-board-hand",
]);

/** The captain's own way with the matter (no player deciding, or none answered in time). */
export function autoResolve(g: ConquestGame, cr: Cruise, r: Rng = sdice(g)): void {
  const s = g.s;
  let guard = 0;
  while (cr.encounter && guard++ < 6) {
    const e = cr.encounter;
    const plan = planOf(s, g.map, cr);
    const ours = hullPace(BOATS[cr.kind].speed, cr.hull);
    switch (e.stage) {
      case "warship":
        warshipNow(g, cr, "run", r.next() < chanceOf(plan.sea, runDc(ours)));
        break;
      case "sighted": {
        const go = wouldChase(plan, e.kind, e.flag);
        const k = PREY.find((x) => x.kind === e.kind)!;
        chaseNow(g, cr, go, go && r.next() < chanceOf(plan.sea, chaseDc(k.speed, ours)), false);
        break;
      }
      case "alongside":
        boardNow(g, cr, "strike", r.next() < chanceOf(plan.lead, strikeDc(e.guns, cr.flag)), r, false);
        break;
      case "taken":
        prizeNow(g, cr, "send", false);
        break;
    }
  }
}

const chanceOf = (skill: number, dc: number) => checkChance(skill, dc);

/** The captain's way with the matter's present stage only (a hand isn't asked). */
function autoResolveStage(g: ConquestGame, cr: Cruise, r: Rng = sdice(g)): void {
  const e = cr.encounter;
  if (!e) return;
  const plan = planOf(g.s, g.map, cr);
  const ours = hullPace(BOATS[cr.kind].speed, cr.hull);
  if (e.stage === "sighted") {
    const go = wouldChase(plan, e.kind, e.flag);
    const k = PREY.find((x) => x.kind === e.kind)!;
    const caught = go && r.next() < chanceOf(plan.sea, chaseDc(k.speed, ours));
    if (go)
      tellAll(g, cr, caught ? `"Sail ho!" The ${cr.ship} gives chase to ${describe(g.s, e)}, and comes up with her.` : `"Sail ho!" The ${cr.ship} gives chase to ${describe(g.s, e)}, and loses her.`);
    chaseNow(g, cr, go, caught, false);
  } else if (e.stage === "taken") prizeNow(g, cr, "send");
}

/** The chase: given (and won or lost), or let her go. */
export function chaseNow(
  g: ConquestGame,
  cr: Cruise,
  chase: boolean,
  pass: boolean,
  ask = true,
): void {
  const e = cr.encounter;
  if (!e || e.stage !== "sighted") return;
  const who = describe(g.s, e);
  if (!chase) {
    logLine(g, cr, `Let ${who} go by.`);
    cr.encounter = null;
    seaChanged(g);
    return;
  }
  if (!pass) {
    logLine(g, cr, `Chased ${who}; she showed us her heels.`);
    tellAll(g, cr, `The ${cr.ship} chased ${who} all day, and lost her in the dusk.`);
    cr.encounter = null;
    cr.morale = Math.max(0, cr.morale - 2);
    seaChanged(g);
    return;
  }
  e.stage = "alongside";
  e.day = g.s.day;
  seaChanged(g);
  logLine(g, cr, `Came up with ${who}.`);
  if (ask) pose(g, cr);
}

/** Alongside: call on her to strike (and board her if she won't), board at once, or sheer off. */
export function boardNow(
  g: ConquestGame,
  cr: Cruise,
  how: "strike" | "board" | "sheer",
  pass: boolean,
  r: Rng = sdice(g),
  ask = true,
): void {
  const s = g.s;
  const e = cr.encounter;
  if (!e || e.stage !== "alongside") return;
  const who = describe(s, e);
  if (how === "sheer") {
    logLine(g, cr, `Sheered off from ${who}.`);
    cr.encounter = null;
    seaChanged(g);
    return;
  }
  let taken = false;
  let fought = false;
  if (how === "strike") {
    if (pass) {
      taken = true;
      logLine(g, cr, `${cap(who)} struck her colours without a shot.`);
    } else {
      // She won't: board her.
      fought = true;
      const plan = planOf(s, g.map, cr);
      taken = r.next() < chanceOf(plan.fight, boardDc(e.guns, cr.guns));
    }
  } else {
    fought = true;
    taken = pass;
  }
  if (fought) fight(g, cr, e.guns, taken, r);
  if (!taken) {
    logLine(g, cr, `Boarded ${who}, and were beaten off.`);
    tellAll(g, cr, `The ${cr.ship} boarded ${who} and was beaten off: men hurt, the rigging cut about.`, "bad");
    cr.encounter = null;
    seaChanged(g);
    return;
  }
  e.stage = "taken";
  e.day = s.day;
  seaChanged(g);
  if (fought) logLine(g, cr, `Carried ${who} by boarding.`);
  if (ask) pose(g, cr);
}

/** How a hand went into a boarding: first over the rail, with the rest, or hanging back. */
const HAND_PART = new Map<string, "first" | "with" | "back">();

/** A hand's boarding: the captain's men go over; the hand's own part is theirs. */
export function handBoard(
  g: ConquestGame,
  cr: Cruise,
  life: Life,
  how: "first" | "with" | "back",
  pass: boolean,
): void {
  const e = cr.encounter;
  if (!e || e.stage !== "alongside") return;
  const plan = planOf(g.s, g.map, cr);
  const r = sdice(g);
  // The boarding goes as the captain's fighting has it; first over the rail
  // and winning your fight, you carry the men with you.
  let chance = chanceOf(plan.fight, boardDc(e.guns, cr.guns));
  if (how === "first" && pass) chance = Math.min(0.95, chance + 0.1);
  HAND_PART.set(life.seat, how === "first" && !pass ? "first" : how);
  boardNow(g, cr, "board", r.next() < chance, r);
  HAND_PART.delete(life.seat);
  if (how === "first" && pass) addRenown(g, life, 1.5);
  if (how === "back") {
    addRenown(g, life, -1);
    journal(g, life, "You hung back at the rail. Nobody said anything; nobody had to.", "bad");
  }
}

/** A fight at close quarters: hull and men, wounds among the players aboard. */
function fight(g: ConquestGame, cr: Cruise, guns: number, won: boolean, r: Rng): void {
  const s = g.s;
  const hurtHull = Math.round(4 + guns * 0.8 + r.next() * 8) * (won ? 1 : 1.5);
  cr.hull = Math.max(5, Math.round(cr.hull - hurtHull));
  cr.men = Math.max(4, cr.men - r.int(1, 3 + Math.floor(guns / 4)));
  cr.morale = Math.max(0, Math.min(100, cr.morale + (won ? 6 : -10)));
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.c !== h.c || life.watching) continue;
    gainXp(g, life, "fighting", 6);
    const part = HAND_PART.get(h.seat);
    const wound =
      part === "back" ? 0 : part === "first" ? WOUND[h.role] * 1.8 : WOUND[h.role];
    if (r.next() < wound) {
      const n = 8 + r.int(0, 18);
      const died = hurt(g, life, n, "a boarding fight");
      if (!died) {
        journal(g, life, `You took a wound in the boarding: a cutlass cut, and a splinter in the leg.`, "bad");
        addStress(g, life, 6);
      }
    } else if (won) addRenown(g, life, h.role === "captain" ? 1.5 : 0.5);
  }
}

/** Her taken: send her in, take her plunder, or burn her (or let her go, her people with her). */
export function prizeNow(
  g: ConquestGame,
  cr: Cruise,
  how: "send" | "plunder" | "burn" | "free",
  _ask = true,
): void {
  const s = g.s;
  const e = cr.encounter;
  if (!e || e.stage !== "taken") return;
  cr.encounter = null;
  const war = inWar(s, cr.nation);
  const foes = enemiesOf(s, cr.nation);
  const lawful =
    cr.flag === "privateer" && foes.has(e.flag) && cr.peace === undefined;
  // A privateer who takes a neutral (or her own nation's) is a pirate from now.
  if (cr.flag === "privateer" && !foes.has(e.flag) && cr.peace === undefined) {
    cr.flag = "pirate";
    logLine(g, cr, "She has taken a ship her commission doesn't cover: piracy.");
    tellAll(g, cr, `The ${cr.ship} has taken ${describe(s, e)}, whom her commission doesn't cover. Her letter of marque is no shield now: every soul aboard is a pirate in the law's eyes.`, "bad", true);
  }
  cr.idle = 0;
  cr.morale = Math.min(100, cr.morale + 8);
  const who = describe(s, e);
  if (how === "burn" || how === "free") {
    logLine(g, cr, how === "burn" ? `Burned ${who}.` : `Let ${who} go, her people unharmed.`);
    for (const h of cr.hands) {
      const life = lifeOfSeat(s, h.seat);
      if (!life || life.c !== h.c) continue;
      if (how === "free") addRenown(g, life, 0.5);
      else if (cr.flag === "pirate") addNotoriety(g, life, 3);
    }
    pirateHeat(g, cr, e.flag);
    seaChanged(g);
    return;
  }
  const prize: Prize = {
    id: g.nextId(),
    name: e.name,
    kind: e.kind,
    flag: e.flag,
    value: how === "plunder" ? Math.round(e.value * CRUISE.plunder) : e.value,
    day: s.day,
    how: how === "plunder" ? "plunder" : "sent",
    lawful: cr.flag === "pirate" ? false : lawful,
    status: how === "plunder" ? "home" : "at sea",
  };
  if (cr.flag === "privateer" && !lawful)
    prize.lawful = false; // after the peace: to be restored
  // A prize crew: she may be retaken before she makes port.
  if (how === "send") {
    cr.men = Math.max(4, cr.men - Math.ceil(cr.men * 0.08));
    const retake = war ? CRUISE.retakeWar : CRUISE.retake;
    if (sdice(g).next() < retake) prize.status = "retaken";
    else prize.status = "home";
  }
  cr.prizes.push(prize);
  seaChanged(g);
  const where = g.map.provinces[cr.way?.prov ?? cr.port]?.name ?? "the coast";
  logLine(g, cr, `Took ${who}${how === "plunder" ? ", her plunder carried off" : ", sent in with a prize crew"}${prize.status === "retaken" ? " (retaken before she made port)" : ""}.`);
  tellAll(g, cr, `A prize! The ${cr.ship} has taken ${who} off ${where}: ${how === "plunder" ? `her plunder, about ${prize.value} coins' worth,` : `she should fetch about ${prize.value} coins, and is`} ${how === "plunder" ? "carried aboard" : prize.status === "retaken" ? "sent in, and retaken by her own people on the way" : "sent in with a prize crew"}.`, prize.status === "retaken" ? "bad" : "good", true);
  rumour(g, cr.way?.prov ?? cr.port, `The ${cr.flag === "pirate" ? "pirate" : "privateer"} ${cr.ship} has taken ${who}.`, -1, "bad");
  pirateHeat(g, cr, e.flag);
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.c !== h.c) continue;
    gainXp(g, life, "seamanship", 4);
    if (cr.flag === "privateer") addRenown(g, life, h.role === "captain" ? 1 : 0.3);
  }
}

/** Piracy draws the law: the heat of the nation robbed, and of her home port's. */
function pirateHeat(g: ConquestGame, cr: Cruise, flag: number): void {
  if (cr.flag !== "pirate") return;
  const s = g.s;
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.c !== h.c) continue;
    const relapsed = (life.cooldowns["pardoned"] ?? 0) > 0;
    const mult = relapsed ? 2 : 1;
    life.cooldowns["sea:pirate"] = s.day; // for the King's pardon
    if (flag >= 0) addHeat(g, life, flag, 10 * mult);
    addHeat(g, life, lawAt(s, cr.port), 5 * mult);
    addNotoriety(g, life, 3);
  }
}

/** A man-of-war: run, fight (seldom wise), or strike your colours. */
export function warshipNow(
  g: ConquestGame,
  cr: Cruise,
  how: "run" | "fight" | "strike",
  pass: boolean,
): void {
  const s = g.s;
  const e = cr.encounter;
  if (!e || e.stage !== "warship") return;
  cr.encounter = null;
  seaChanged(g);
  if ((how === "run" || how === "fight") && pass) {
    if (how === "fight") {
      fight(g, cr, e.guns, true, sdice(g));
      logLine(g, cr, `Fought off ${e.name}, and got clear.`);
      tellAll(g, cr, `${cap(e.name)} came down on the ${cr.ship}: she fought her off, battered, and got clear.`, "good", true);
    } else {
      logLine(g, cr, `Ran from ${e.name}, and lost her in the night.`);
      tellAll(g, cr, `${cap(e.name)}! The ${cr.ship} crowded on sail and ran, and lost her in the night.`, undefined, true);
      cr.hull = Math.max(5, cr.hull - 3);
    }
    return;
  }
  if (how === "fight") fight(g, cr, e.guns, false, sdice(g));
  captured(g, cr, e);
}

/** Taken by a man-of-war: a privateer's company are prisoners; a pirate's go to the gaol and the rope. */
function captured(g: ConquestGame, cr: Cruise, e: Encounter): void {
  const s = g.s;
  const at = cr.way?.prov ?? cr.port;
  cr.phase = "lost";
  cr.end = `Taken by ${e.name}.`;
  logLine(g, cr, `Taken by ${e.name}.`);
  // Prizes sent in still make port and are sold; the plunder aboard is lost.
  for (const pz of cr.prizes) if (pz.how === "plunder") pz.status = "retaken";
  // Her owner's boat is lost.
  if (cr.owner === "boat" && cr.boat) {
    const life = lifeOfSeat(s, cr.boat.seat);
    if (life) {
      touchLife(g, life);
      life.boats = (life.boats ?? []).filter((b) => b.id !== cr.boat!.id);
      for (const f of life.people ?? [])
        if (f.task?.kind === "boat" && f.task.boat === cr.boat.id) f.task = null;
    }
  }
  for (const hook of CRUISE_LOST) hook(g, cr);
  // Where the prisoners are put ashore: the man-of-war's nearest port of her own.
  const navy = e.flag;
  let port = -1;
  let bestKm = Infinity;
  s.provinces.forEach((pr, p) => {
    if (pr.owner !== navy || !g.map.provinces[p].coastal) return;
    const km = kmApart(g.map.provinces[p].lat, g.map.provinces[p].lon, g.map.provinces[at].lat, g.map.provinces[at].lon);
    if (km < bestKm) {
      bestKm = km;
      port = p;
    }
  });
  if (port < 0) port = at;
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.c !== h.c || life.watching) continue;
    touchLife(g, life);
    life.travel = null;
    life.prov = port;
    life.area = "docks";
    reveal(g, life, [port]);
    if (cr.flag === "pirate") {
      jail(g, life, "piracy", 3, navy >= 0 ? navy : lawAt(s, port));
      affairNews(g, life, "sea", `Taken by ${e.name}: the ${cr.ship}'s company are carried to ${g.map.provinces[port].name} in irons, to be tried for piracy.`, "bad");
    } else {
      addStress(g, life, 15);
      affairNews(g, life, "sea", `Taken by ${e.name}! The ${cr.ship} is a prize herself. You're carried into ${g.map.provinces[port].name} a prisoner, and let go on your parole to find your own way home.`, "bad");
      wake(g, life, `The ${cr.ship} was taken.`);
    }
  }
  // The prize court still sits for the prizes sent in (for a privateer).
  if (cr.flag === "privateer" && cr.prizes.some((p) => p.status === "home")) {
    cr.court = s.day + CRUISE.courtDays;
    cr.phase = "selling";
    cr.way = null;
    // The hands are prisoners: their shares are paid when the court sits.
  }
  seaChanged(g);
}

/** Hooks for when a cruise's ship is lost (a company's ship). */
export const CRUISE_LOST: ((g: ConquestGame, cr: Cruise) => void)[] = [];

/** Scurvy: put in for limes and water (days lost), or press on. */
export function scurvyNow(g: ConquestGame, cr: Cruise, how: "limes" | "press"): void {
  const s = g.s;
  if (how === "limes") {
    cr.scurvy = 0;
    cr.until = Math.max(s.day, cr.until - 6);
    logLine(g, cr, "Put in for limes and water: the scurvy's beaten.");
    tellAll(g, cr, `The ${cr.ship} puts in at a quiet bay for limes and water. Six days lost; the men's gums are mending.`);
    return;
  }
  cr.scurvy = Math.min(100, cr.scurvy + 10);
  cr.men = Math.max(4, cr.men - sdice(g).int(1, 4));
  cr.morale = Math.max(0, cr.morale - 8);
  logLine(g, cr, "Pressed on with the scurvy among the men.");
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (life && life.c === h.c && sdice(g).chance(0.35))
      hurt(g, life, 6, "scurvy");
  }
}

/** A mutinous temper: promise the next prize doubled, seize the ringleaders, or put about for home. */
export function mutinyNow(
  g: ConquestGame,
  cr: Cruise,
  how: "promise" | "seize" | "home",
  pass: boolean,
): void {
  if (how === "home") {
    cr.morale = Math.min(100, cr.morale + 25);
    turnForHome(g, cr, "The men would have it: she puts about for home.");
    return;
  }
  if (pass) {
    cr.morale = Math.min(100, cr.morale + (how === "seize" ? 20 : 30));
    logLine(g, cr, how === "seize" ? "Seized the ringleaders; the rest went back to their duty." : "Promised them the next prize; the grumbling stopped.");
    return;
  }
  cr.morale = Math.min(100, cr.morale + 15);
  cr.men = Math.max(4, cr.men - 3);
  logLine(g, cr, "The men rose. When it was over, three were in irons and she was going home.");
  tellAll(g, cr, `Mutiny aboard the ${cr.ship}! It was put down, but she's going home.`, "bad", true);
  turnForHome(g, cr, "After the mutiny she puts about for home.");
}

/** For home: the cruise's end (a pirate captain may make for a haven to sell). */
export function turnForHome(g: ConquestGame, cr: Cruise, why: string, to = cr.port): void {
  const ok =
    cr.phase === "out" ||
    cr.phase === "hunting" ||
    (cr.phase === "home" && to !== cr.port);
  if (!ok) return;
  const w = cr.way;
  cr.phase = "home";
  cr.port = to;
  if (w && w.path.length) {
    // She finishes the leg she's on, then sets her course.
    const next = w.path[0];
    if (next === to) w.path = [next];
    else {
      const r = boatRoute(g.map, next, to, cr.kind);
      if (r) w.path = [next, ...r.path];
      else {
        w.path = [next];
        cr.port = next;
      }
    }
    w.sea = w.path.map(() => true);
  } else {
    const from = w?.prov ?? cr.port;
    if (!setCourse(g, cr, from, to, false)) {
      cr.port = from;
      cr.way = { prov: from, path: [], sea: [], depart: g.s.day, arrive: g.s.day };
    }
  }
  logLine(g, cr, why);
  tellAll(g, cr, `${why.replace(/\.$/, "")} (for ${g.map.provinces[cr.port].name}).`);
  seaChanged(g);
}

/** Home: the prize court (a privateer) or the fence (a pirate) settles soon. */
function makePort(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  cr.phase = "selling";
  const p = cr.port;
  cr.way = { prov: p, path: [], sea: [], depart: s.day, arrive: s.day };
  cr.court = s.day + (cr.flag === "pirate" ? CRUISE.fenceDays : CRUISE.courtDays);
  logLine(g, cr, `Home: ${g.map.provinces[p].name}.`);
  // Your own boat lies here now.
  if (cr.owner === "boat" && cr.boat) {
    const life = lifeOfSeat(s, cr.boat.seat);
    const b = life?.boats?.find((x) => x.id === cr.boat!.id);
    if (life && b) {
      touchLife(g, life);
      b.prov = p;
      b.condition = Math.max(1, Math.round(cr.hull));
      b.morale = Math.round(cr.morale);
    }
  }
  syncHands(g, cr);
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.c !== h.c) continue;
    life.travel = null;
    life.prov = p;
    life.area = "docks";
    reveal(g, life, [p]);
    const n = cr.prizes.filter((x) => x.status === "home").length;
    affairNews(g, life, "sea", `The ${cr.ship} is home at ${g.map.provinces[p].name}${n ? ` with ${n} prize${n === 1 ? "" : "s"}: ${cr.flag === "pirate" ? "the fence will see you" : "the prize court sits"} on ${formatDate(cr.court)}` : ", empty-handed"}.`, n ? "good" : undefined);
    wake(g, life, `The ${cr.ship} is home.`);
  }
  // Letters held while at sea come now.
  for (const m of cr.mail ?? []) {
    const life = lifeOfSeat(s, m.seat);
    if (life && !life.watching) raiseEvent(g, life, m.key, m.ctx);
  }
  cr.mail = [];
  if (!cr.prizes.some((x) => x.status === "home")) settle(g, cr);
}

/** The court sits (or the fence pays): the prizes sold and every share paid. */
export function settle(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  const map = g.map;
  const home = cr.prizes.filter((p) => p.status === "home");
  let gross = 0;
  let restored = 0;
  let fenceRate = 1;
  let where = "the prize court";
  if (cr.flag === "pirate") {
    const cap0 = cr.hands.find((h) => h.role === "captain");
    const f = fenceAt(s, map, cr.port, cap0 ? lifeOfSeat(s, cap0.seat) : undefined);
    fenceRate = f.rate;
    where = f.where;
  }
  for (const p of home) {
    if (cr.flag === "privateer" && !p.lawful) {
      restored += p.value;
      p.status = "sold";
      p.sold = 0;
      continue;
    }
    const v = r2(cr.flag === "pirate" ? p.value * fenceRate : p.value * (1 - CRUISE.court));
    p.sold = v;
    p.status = "sold";
    gross += v;
  }
  gross = r2(gross);
  const ownersHalf =
    cr.flag === "privateer" ? r2(gross * CRUISE.owners) : 0;
  const shipShare =
    cr.flag === "pirate" && cr.owner !== "outfit" ? r2(gross * CRUISE.pirateShip) : 0;
  const crewPart = r2(gross - ownersHalf - shipShare);
  const parts = totalParts(cr.kind, cr.flag, cr.hands.map((h) => h.role));
  const perPart = parts ? crewPart / parts : 0;
  const owners = r2(ownersHalf + shipShare);
  // The owners: your own boat's (you), a company's chest, or the town's merchants.
  if (owners > 0) {
    if (cr.owner === "boat" && cr.boat) {
      const life = lifeOfSeat(s, cr.boat.seat);
      if (life && !life.watching)
        withFlow(g, { key: `sea:${cr.id}`, label: `The ${cr.ship}'s prizes: the owner's part`, chance: true, aff: "sea" }, () =>
          earn(g, life, owners),
        );
    } else if (cr.owner === "firm" && cr.firm !== undefined)
      for (const h of CRUISE_OWNERS) h(g, cr, owners);
  }
  // The company, by their parts.
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.watching || life.c !== h.c) continue;
    const mine = r2(perPart * ROLE_PARTS[cr.flag][h.role]);
    if (mine > 0)
      withFlow(g, { key: `sea:${cr.id}`, label: `The ${cr.ship}'s cruise: your share`, chance: true, aff: "sea" }, () =>
        earn(g, life, mine),
      );
    const own = cr.owner === "boat" && cr.boat?.seat === h.seat ? owners : 0;
    if (!home.length) {
      affairNews(g, life, "sea", `The ${cr.ship}'s company is paid off: home without a prize, there's nothing to share.`);
      continue;
    }
    const lines: string[] = [];
    if (home.length)
      lines.push(
        cr.flag === "pirate"
          ? `${where} paid ${gross} coins for ${home.length} prize${home.length === 1 ? "" : "s"}`
          : `The court condemned ${home.filter((x) => x.lawful).length} prize${home.filter((x) => x.lawful).length === 1 ? "" : "s"}: ${gross} coins after its fees`,
      );
    if (restored)
      lines.push(`${restored} coins' worth taken after the peace was restored to her owners`);
    lines.push(
      `your ${ROLE_PARTS[cr.flag][h.role]} part${ROLE_PARTS[cr.flag][h.role] === 1 ? "" : "s"} of ${Math.round(parts * 10) / 10}: ${mine} coins${own ? `, and ${own} as her owner` : ""}`,
    );
    affairNews(g, life, "sea", `The ${cr.ship}'s cruise is paid off. ${cap(lines.join("; "))}.`, mine + own > 0 ? "good" : undefined);
    if (cr.flag === "pirate" && mine > 0)
      rumour(g, cr.port, `Pirates are spending gold freely at ${map.provinces[cr.port].name}.`, -1, "bad");
  }
  cr.phase = "done";
  cr.end = home.length ? `Paid off: ${gross} coins for ${home.length} prize${home.length === 1 ? "" : "s"}.` : "Home without a prize.";
  logLine(g, cr, cr.end);
  seaChanged(g);
}

/** Who gets the owners' half of a company's cruise (Privateers.ts). */
export const CRUISE_OWNERS: ((g: ConquestGame, cr: Cruise, coins: number) => void)[] = [];

/** "a Spanish snow, the Santa Rosa (6 guns)", "an English sloop, the Swift (no guns)". */
export function describe(s: GameState, e: Encounter): string {
  const adj = s.nations[e.flag]?.adjective;
  if (e.stage === "warship") return e.name;
  return `${adj ? aRig(`${adj} ${e.kind}`) : aRig(e.kind)}, ${e.name} (${e.guns ? `${e.guns} gun${e.guns === 1 ? "" : "s"}` : "no guns"})`;
}

// ---------------------------------------------------------------- storms at sea

STORM_AT_SEA.unshift((g, life, st) => {
  const cr = s0(g, life);
  if (!cr) return false;
  // One scene for the ship, to whoever decides; the rest are told.
  const key = `cr:${cr.id}`;
  if (st.warned.includes(key)) return true;
  st.warned.push(key);
  seaChanged(g);
  const d = deciderOf(g.s, cr);
  const sheltered = d && madeReady(d, st);
  if (sheltered) {
    logLine(g, cr, `Lay in shelter while ${stormName(st)} blew past.`);
    tellAll(g, cr, `The ${cr.ship} lay snug in a sheltered road while ${stormName(st)} blew itself out to seaward.`, "good");
    return true;
  }
  if (d) raiseEvent(g, d, "sea-storm-ship", { cr: cr.id, st: st.id, f: Math.round(st.force * 10) / 10 });
  else stormNow(g, cr, st.force, "heave", sdice(g).chance(0.6));
  return true;
});

/** The signs at sea: whoever decides for her is asked; the rest see the master eyeing the glass. */
STORM_SIGNS.push((g, life, st) => {
  const cr = s0(g, life);
  if (!cr) return false;
  const d = deciderOf(g.s, cr);
  if (d && d.seat === life.seat) return false;
  journal(
    g,
    life,
    `A long swell from the south-east and a falling glass: ${stormName(st)} is coming, and ${d ? charName(meOf(g.s, d)) : cap(cr.cname)} must decide what the ${cr.ship} does about it.`,
  );
  return true;
});

function s0(g: ConquestGame, life: Life): Cruise | undefined {
  const id = life.travel?.ship;
  return id !== undefined ? cruiseById(g.s, id) : undefined;
}

/** A hurricane at sea: run before it, heave to, or (on a passage) make for a harbour. */
export function stormNow(
  g: ConquestGame,
  cr: Cruise,
  force: number,
  how: "run" | "heave",
  pass: boolean,
): void {
  const r = sdice(g);
  const base = 6 + force * 6;
  const hit = Math.round(base * (pass ? 0.5 : 1.5) * (how === "run" ? 1.2 : 1));
  cr.hull = Math.max(0, cr.hull - hit);
  cr.men = Math.max(4, cr.men - (pass ? 0 : r.int(1, 2 + Math.round(force))));
  cr.until = Math.max(g.s.day, cr.until - (how === "heave" ? 3 : 1));
  logLine(g, cr, pass ? `Rode out a hurricane (hull ${Math.round(cr.hull)}).` : `Mauled by a hurricane (hull ${Math.round(cr.hull)}).`);
  for (const h of cr.hands) {
    const life = lifeOfSeat(g.s, h.seat);
    if (!life || life.c !== h.c) continue;
    life.cooldowns["ev:trv-hurricane"] = Math.max(life.cooldowns["ev:trv-hurricane"] ?? 0, g.s.day + 330); // MAP (r12): the achievement
    gainXp(g, life, "seamanship", 8);
    if (!pass && r.chance(0.4)) hurt(g, life, 6 + r.int(0, 10), "a hurricane");
  }
  if (cr.hull <= 0) foundered(g, cr);
  else if (cr.hull < 30 && (cr.phase === "hunting" || cr.phase === "out"))
    turnForHome(g, cr, "Too battered to cruise: she limps for home.");
}

/** She went down: the hands who live come ashore on the nearest coast. */
function foundered(g: ConquestGame, cr: Cruise): void {
  const s = g.s;
  const at = cr.way?.path[0] ?? cr.way?.prov ?? cr.port;
  cr.phase = "lost";
  cr.end = "Foundered in a hurricane.";
  logLine(g, cr, cr.end);
  if (cr.owner === "boat" && cr.boat) {
    const life = lifeOfSeat(s, cr.boat.seat);
    if (life) life.boats = (life.boats ?? []).filter((b) => b.id !== cr.boat!.id);
  }
  for (const hook of CRUISE_LOST) hook(g, cr);
  for (const h of cr.hands) {
    const life = lifeOfSeat(s, h.seat);
    if (!life || life.c !== h.c || life.watching) continue;
    if (hurt(g, life, 25, "shipwreck")) continue;
    touchLife(g, life);
    life.travel = null;
    life.prov = at;
    life.area = undefined;
    reveal(g, life, [at]);
    affairNews(g, life, "sea", `The ${cr.ship} went down in the hurricane. You came ashore on a spar at ${g.map.provinces[at].name}, with your life and little else.`, "bad");
    wake(g, life, `The ${cr.ship} foundered.`);
  }
  seaChanged(g);
}

// ---------------------------------------------------------------- the pardon

/** The Acts of Grace for pirates who surrender: James II's (1688) and George I's (1717-18). */
export const PARDONS: { power: string; text: string }[] = [
  {
    power: "england",
    text: "King James's proclamation of 1688: a pardon for the pirates of America who surrender within the year.",
  },
  {
    power: "england",
    text: "King George's Proclamation for Suppressing of Pirates (5 September 1717): a pardon for every pirate who surrenders to a governor within the year.",
  },
];

/** Whether a pardon is to be had now (and whose), or null. */
export function pardonOpen(s: GameState): { power: string; text: string } | null {
  const d = dateOf(s.day);
  const ym = d.year * 12 + d.month;
  if (ym >= 1688 * 12 && ym < 1689 * 12) return PARDONS[0];
  if (ym >= 1717 * 12 + 8 && ym < 1718 * 12 + 9) return PARDONS[1];
  return null;
}

export function pardonCheck(s: GameState, w: World, life: Life): Check {
  const open = pardonOpen(s);
  if (!open) return no("No pardon is on offer: the Acts of Grace came in 1688 and in 1717-18.");
  if (life.travel) return no("You're at sea.");
  const n = powerIndex(s, open.power);
  if (n < 0 || s.provinces[life.prov]?.owner !== n)
    return no(`Surrender to a governor of ${s.nations[n]?.name ?? "the Crown"}'s colonies.`);
  const pirate =
    life.job?.kind === "pirate" || (life.cooldowns["sea:pirate"] ?? 0) > 0;
  if (!pirate) return no("You've no piracy to be pardoned for.");
  if ((life.cooldowns["pardoned"] ?? 0) > 0) return no("You've had the King's pardon once.");
  if (life.crime?.jail) return no("Not from a cell.");
  void w;
  return yes;
}

/** Take the King's pardon: the heat of piracy is gone; going on the account again doubles it. */
export function takePardon(g: ConquestGame, life: Life): string | null {
  const check = pardonCheck(g.s, g.w, life);
  if (!check.ok) return check.why;
  touchLife(g, life);
  const c = life.crime!;
  c.heat = {};
  life.cooldowns["pardoned"] = g.s.day;
  journal(g, life, "You surrender to the governor and take the King's pardon. The past is forgiven; a pirate taken again after it will hang without a second thought.", "good");
  milestone(g, life, "convicted", "Took the King's pardon for piracy");
  return null;
}

// ---------------------------------------------------------------- your own boat's commission

/** A letter of marque for your boat: at a governor's house in a colony at war. */
export function marqueCheck(s: GameState, w: World, life: Life, boatId: number): Check {
  const b = (life.boats ?? []).find((x) => x.id === boatId);
  if (!b) return no("Not your boat.");
  if (!BOATS[b.kind].uses.includes("privateering")) return no("She's no privateer.");
  if (life.travel) return no("You're on the road.");
  const owner = s.provinces[life.prov]?.owner ?? -1;
  if (owner < 0 || s.nations[owner]?.kind !== "power") return no("Only a colony's governor grants letters of marque.");
  if (!inWar(s, owner)) return no(`${s.nations[owner].name} isn't at war: no commissions are granted.`);
  if (b.marque && b.marque.nation === owner && inWar(s, b.marque.nation)) return no("She has her letter of marque.");
  if (life.purse < marqueFee(b.kind)) return no(`The commission and its bond: ${marqueFee(b.kind)} coins.`);
  return yes;
}

/** The fee for a letter of marque (and the clerk's, and the bond's keeping). */
export function marqueFee(kind: BoatKind): number {
  return 3 + Math.round(BOATS[kind].guns / 2);
}

export function takeMarque(g: ConquestGame, life: Life, boatId: number): string | null {
  const check = marqueCheck(g.s, g.w, life, boatId);
  if (!check.ok) return check.why;
  const b = (life.boats ?? []).find((x) => x.id === boatId)!;
  const owner = g.s.provinces[life.prov].owner;
  const fee = marqueFee(b.kind);
  spend(g, life, fee);
  touchLife(g, life);
  b.marque = { nation: owner, day: g.s.day };
  journal(g, life, `The governor signs a letter of marque for the ${b.name} against ${[...enemiesOf(g.s, owner)].map((n) => g.s.nations[n].name).join(" and ")}: ${fee} coins in fees. She may take their ships as prizes while the war lasts.`);
  return null;
}

// ---------------------------------------------------------------- what a hand's cruise stands to make

/** Your share of what's taken so far (if it all sells as hoped), for the page. */
export function shareSoFar(s: GameState, map: MapDef, cr: Cruise, life: Life): number {
  const h = cr.hands.find((x) => x.seat === life.seat && x.c === life.c);
  if (!h) return 0;
  const frac = handFraction(s, map, cr, h);
  let v = 0;
  for (const p of cr.prizes) {
    if (p.status === "retaken") continue;
    if (cr.flag === "privateer" && !p.lawful) continue;
    v += p.value * frac;
  }
  return r1(v);
}

/** What a hand's whole cruise should bring: what's taken, and what the rest of it may. */
export function cruiseExpect(
  s: GameState,
  map: MapDef,
  cr: Cruise,
  life: Life,
): { value: number; lo: number; hi: number } {
  const so = shareSoFar(s, map, cr, life);
  const h = cr.hands.find((x) => x.seat === life.seat && x.c === life.c);
  if (!h || (cr.phase !== "fitting" && cr.phase !== "out" && cr.phase !== "hunting"))
    return { value: so, lo: so, hi: so };
  const plan = planOf(s, map, cr);
  const left = cr.phase === "hunting" ? Math.max(0, cr.until - s.day) : cr.until - cr.start;
  const odds = cruiseOdds(s, {
    plan: { ...plan, hunt: left },
    role: h.role,
    others: cr.hands.filter((x) => x !== h).map((x) => x.role),
    owner: cr.owner === "boat" && cr.boat?.seat === life.seat ? 1 : 0,
    fence: cr.flag === "pirate" ? fenceAt(s, map, cr.port, life).rate : 1,
    passage: 0,
    outfit: 0,
    title: "",
  });
  return { value: r1(so + odds.expected), lo: so, hi: r1(so + odds.hi) };
}

const PHASE_WORDS: Record<Cruise["phase"], string> = {
  fitting: "fitting out",
  out: "at sea, outward",
  hunting: "on her ground",
  home: "homeward",
  selling: "home: the prizes to sell",
  done: "paid off",
  lost: "lost",
};

/** LEDGER (r15): your cruise in the tracker (Estate › Ledger, out working). */
hooks.affairs.push((s, w, life) => {
  const out: import("./Types").AffairItem[] = [];
  for (const cr of seaOf(s).cruises) {
    if (cr.phase === "done" || cr.phase === "lost") continue;
    const h = cr.hands.find((x) => x.seat === life.seat && x.c === life.c);
    if (!h) continue;
    const gd = GROUND_BY_KEY.get(cr.ground);
    const x = cruiseExpect(s, w.map, cr, life);
    out.push({
      kind: "sea",
      id: `sea:${cr.id}`,
      title: `The ${cr.ship}'s cruise`,
      what: `${ROLE_NAMES[cr.flag][h.role]}, ${cr.flag === "pirate" ? "on the account" : "privateering"} ${gd?.name ?? ""}${cr.prizes.length ? ` · ${cr.prizes.filter((p) => p.status !== "retaken").length} prize${cr.prizes.length === 1 ? "" : "s"}` : ""}`,
      status: PHASE_WORDS[cr.phase],
      p: cr.way?.prov ?? cr.port,
      due: cr.phase === "selling" ? cr.court : cr.phase === "fitting" ? cr.sails : cr.until,
      ...(cr.flag === "pirate" ? { warn: "piracy: the law's heat with every prize" } : {}),
      expected: { value: x.value, lo: x.lo, hi: x.hi, per: "home" },
      go: { tab: "work", sub: "sea" },
    });
  }
  return out;
});

/** LEDGER (r15): prizes to be paid this month, by luck. */
hooks.forecast.push((s, life, w) => {
  const out: import("./Types").Part[] = [];
  if (!w) return out;
  for (const cr of seaOf(s).cruises) {
    if (cr.phase !== "selling") continue;
    if (!cr.hands.some((x) => x.seat === life.seat && x.c === life.c)) continue;
    const v = shareSoFar(s, w.map, cr, life);
    if (v > 0)
      out.push({
        key: `sea:${cr.id}`,
        label: `The ${cr.ship}'s prizes: your share`,
        value: v,
        chance: [0, r1(v * 1.2)],
      });
  }
  return out;
});

// ---------------------------------------------------------------- hooks

/** Ashore things can't be done at sea. */
const ASHORE = new Set([
  "travel",
  "halt",
  "sail",
  "act",
  "job",
  "takeup",
  "enter",
  "trade",
  "market",
  "lead",
  "present",
  "crime",
  "law",
  "dice",
  "property",
  "boat",
  "home",
  "edu",
]);

hooks.gate.push((g, life, c) => {
  const id = life.travel?.ship;
  if (id === undefined) return null;
  const cr = cruiseById(g.s, id);
  if (!cr || !(cr.phase === "out" || cr.phase === "hunting" || cr.phase === "home"))
    return null;
  if (!ASHORE.has(c.k)) return null;
  return `You're at sea aboard the ${cr.ship}: that waits till she makes port.`;
});

/** Letters from afar wait for you in port. */
hooks.holdLetter.push((g, life, key, ctx) => {
  const id = life.travel?.ship;
  if (id === undefined) return false;
  const cr = cruiseById(g.s, id);
  if (!cr) return false;
  (cr.mail ??= []).push({ seat: life.seat, key, ctx });
  seaChanged(g);
  return true;
});

/** A player's letter for someone at sea waits on the quay till they're home. */
hooks.letterArrives.push((g, _writer, l) => {
  const reader = lifeOfChar(g.s, l.to);
  if (!reader || reader.travel?.ship === undefined) return false;
  l.arrive = g.s.day + 1;
  return true;
});

/** A hand who dies is struck off; a captain's place goes to the quartermaster. */
hooks.death.push((g, c) => {
  for (const cr of seaOf(g.s).cruises) {
    const h = cr.hands.find((x) => x.c === c.id);
    if (!h) continue;
    cr.hands = cr.hands.filter((x) => x !== h);
    if (cr.captain === c.id) {
      cr.captain = -1;
      cr.cname = `the quartermaster, ${CAPTAINS[(cr.id + 3) % CAPTAINS.length]}`;
    }
    logLine(g, cr, `${charName(c)} died aboard.`);
  }
});

/** The sea's commands. */
export function cruiseCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "sea") return undefined;
  if (isChildLife(g.s, life)) return "Not as a child.";
  switch (c.act) {
    case "sign":
      return signOn(g, life, c.key ?? "", (c.name ?? "crew") as CruiseRole);
    case "unsign":
      return unsign(g, life);
    case "own":
      return ownCruise(g, life, c.id ?? -1, c.key ?? "", (c.arg ?? 0) > 0, c.name === "pirate");
    case "home": {
      const cr = cruiseById(g.s, life.travel?.ship ?? -1);
      if (!cr) return "You're not at sea.";
      const h = cr.hands.find((x) => x.seat === life.seat);
      if (h?.role !== "captain") return "Only her captain can put her about for home.";
      if (cr.phase !== "hunting" && cr.phase !== "out") return "She's on her way home.";
      if (cr.encounter) return "Settle the matter in hand first.";
      turnForHome(g, cr, "Her captain puts her about for home.");
      syncHands(g, cr);
      return null;
    }
    case "haven": {
      const cr = cruiseById(g.s, life.travel?.ship ?? -1);
      if (!cr) return "You're not at sea.";
      const h = cr.hands.find((x) => x.seat === life.seat);
      if (h?.role !== "captain") return "Only her captain decides where she sells.";
      if (cr.flag !== "pirate") return "A privateer's prizes go to the prize court at home.";
      if (cr.encounter) return "Settle the matter in hand first.";
      const from = cr.way?.path[0] ?? cr.way?.prov ?? cr.port;
      const hv = havenNear(g.s, g.map, from, cr.kind);
      if (!hv) return "No pirates' haven is open within her reach.";
      turnForHome(g, cr, `Her captain makes for ${hv.name} to sell.`, hv.p);
      syncHands(g, cr);
      return null;
    }
    case "pardon":
      return takePardon(g, life);
    case "marque":
      return takeMarque(g, life, c.id ?? -1);
  }
  return undefined;
}

/** Seamen hear of a ship fitting out: a pirate by trade, any, or a seaman, a privateer beating for men. */
function fittingNotice(g: ConquestGame, life: Life): void {
  const s = g.s;
  const job = life.job?.kind;
  const rogue = job === "pirate" || job === "smuggler";
  if (!rogue && job !== "sailor" && job !== "fisherman" && job !== "whaler") return;
  if (life.travel || life.crime?.jail || isChildLife(s, life)) return;
  if ((life.cooldowns["sea:fit"] ?? 0) > s.day) return;
  if (life.events.some((e) => e.key === "sea-fitting") || seaBusy(s, life)) return;
  if (!sdice(g).chance(1 / 30)) return;
  const o = cruiseOffers(s, g.w, life.prov).find(
    (x) =>
      (rogue || x.flag === "privateer") &&
      signCheck(s, g.w, life, x, "crew").ok,
  );
  if (!o) return;
  touchLife(g, life).cooldowns["sea:fit"] = s.day + 75;
  const ctx: Record<string, number> = { c: -1 };
  if (o.cruise !== undefined) ctx.cr = o.cruise;
  else {
    const [, p, m, salt, slot] = o.key.split(":").map(Number);
    Object.assign(ctx, { p, m, salt, slot });
  }
  raiseEvent(g, life, "sea-fitting", ctx);
}

/** The King's pardon is proclaimed: every pirate hears of it, once. */
function pardonNotice(g: ConquestGame, life: Life): void {
  if (!pardonOpen(g.s) || life.cooldowns["sea:pardon"]) return;
  const pirate =
    life.job?.kind === "pirate" || (life.cooldowns["sea:pirate"] ?? 0) > 0;
  if (!pirate || life.travel || isChildLife(g.s, life)) return;
  touchLife(g, life).cooldowns["sea:pardon"] = g.s.day;
  raiseEvent(g, life, "sea-pardon", {});
}

hooks.command.push(cruiseCommand);
hooks.daily.push((g) => {
  cruisesDaily(g);
  for (const life of g.s.lives) {
    if (life.watching || life.c < 0 || !meOf(g.s, life)) continue;
    fittingNotice(g, life);
    pardonNotice(g, life);
  }
});

// The old drawn hurricanes come only with a real storm now (Storms.ts raises them).
hooks.eventWeight.push((_g, _life, key, pool, _ctx, w) =>
  pool !== "raised" && (key === "hurricane" || key === "trv-hurricane") ? 0 : w,
);

export { wayAt, chancesIn, CREW_PARTS, havenIn, menAboard };
export type { Storm };
