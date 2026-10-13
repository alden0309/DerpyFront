// Derpy Front (rules 4+): how a nation reads the nuclear threat to it, and
// where a Dome of Alden would shield the most. These are pure reads of the
// game; NationStructureBehavior decides when to build and keeps the memory
// (nukes that came at us) these functions are handed.

import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  PlayerType,
  Relation,
  Structures,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { Game, Player, Unit } from "../../game/Game";

/** A nuke aimed at our land within this many ticks still marks the spot. */
export const NUKE_IMPACT_MEMORY_TICKS = 3000; // 5 minutes
/** How many recent nuke targets a nation remembers. */
export const NUKE_IMPACT_MEMORY = 8;

/** The nuclear threat a nation sees, worked out once per tick. */
export interface NukeThreat {
  /** A foe's nuke has come at our land (ever). */
  nuked: boolean;
  /** A foe that can nuke us now and has reason to. */
  armed: boolean;
  /** Where foes' silos stand (armed foes only). */
  foeSilos: TileRef[];
  /** The armed foes' small ids, to find the front we share with them. */
  foeIDs: ReadonlySet<number>;
  /** Where recent nukes at our land were aimed. */
  impacts: TileRef[];
}

export function threatIsReal(t: NukeThreat): boolean {
  return t.nuked || t.armed;
}

/**
 * Reads the threat to `player`. A foe is armed when it isn't on our side
 * (not a teammate or ally, not a tribe), owns a missile silo, and either
 * holds an atom bomb's price or has a nuke in the air. It has reason to
 * nuke us when it borders us, we fight, we hate each other, or it is a human
 * (who nukes whom they like).
 */
export function readNukeThreat(
  game: Game,
  player: Player,
  nuked: boolean,
  impacts: readonly TileRef[],
): NukeThreat {
  const atomCost = game.unitInfo(UnitType.AtomBomb).cost(game, player);
  const neighbors = new Set<Player>();
  for (const n of player.nearby()) {
    if (n.isPlayer()) neighbors.add(n);
  }
  const fighting = new Set<Player>();
  for (const a of player.incomingAttacks()) fighting.add(a.attacker());
  for (const a of player.outgoingAttacks()) {
    const t = a.target();
    if (t.isPlayer()) fighting.add(t);
  }

  const foeSilos: TileRef[] = [];
  const foeIDs = new Set<number>();
  let armed = false;
  for (const p of game.players()) {
    if (p === player || !p.isAlive()) continue;
    if (p.type() === PlayerType.Bot) continue;
    if (player.isFriendly(p)) continue;
    if (p.unitCount(UnitType.MissileSilo) === 0) continue;
    const canFire =
      p.gold() >= atomCost ||
      p.unitCount(UnitType.AtomBomb) > 0 ||
      p.unitCount(UnitType.HydrogenBomb) > 0 ||
      p.unitCount(UnitType.MIRV) > 0;
    if (!canFire) continue;
    const engaged =
      p.type() === PlayerType.Human ||
      neighbors.has(p) ||
      fighting.has(p) ||
      player.relation(p) === Relation.Hostile;
    if (!engaged) continue;
    armed = true;
    foeIDs.add(p.smallID());
    for (const silo of p.units(UnitType.MissileSilo)) {
      foeSilos.push(silo.tile());
    }
  }
  return { nuked, armed, foeSilos, foeIDs, impacts: impacts.slice() };
}

/**
 * What a nation would most hate to lose to a nuke, in points: the Capital
 * most, then cities and silos by level, SAMs, ports and factories. A Dome
 * covers itself, so it counts nothing.
 */
export function domeWorth(u: Unit): number {
  switch (u.type()) {
    case UnitType.Capital:
      return 20;
    case UnitType.City:
    case UnitType.MissileSilo:
      return 5 * u.level();
    case UnitType.SAMLauncher:
      return 4 * u.level();
    case UnitType.Port:
    case UnitType.Factory:
      return 3 * u.level();
    case UnitType.DefensePost:
      return 1;
    default:
      return 0;
  }
}

/**
 * How threatened a building is, in percent: more where nukes have come down
 * on us, the closer it stands to a foe's silos, and on the front line with
 * an armed foe (nukes clear the way for an attack).
 */
export function threatPercent(
  game: Game,
  tile: TileRef,
  threat: NukeThreat,
): number {
  const range = game.config().domeRange();
  let pct = 100;
  const r2 = range * range;
  if (threat.impacts.some((t) => game.euclideanDistSquared(t, tile) <= r2)) {
    pct += 100;
  }
  let nearest = Infinity;
  for (const s of threat.foeSilos) {
    const d = game.euclideanDistSquared(s, tile);
    if (d < nearest) nearest = d;
  }
  if (nearest <= (3 * range) ** 2) pct += 50;
  else if (nearest <= (6 * range) ** 2) pct += 25;
  if (threat.foeIDs.size > 0) {
    const reach = Math.floor(range / 2);
    const held = (t: TileRef) => threat.foeIDs.has(game.ownerID(t));
    if (ringDistance(game, tile, reach, held) < reach) pct += 25;
  }
  return pct;
}

/**
 * Manhattan distance from `tile` to the nearest tile where `hit` holds,
 * walking rings outward, or `cap` if none is closer.
 */
function ringDistance(
  game: Game,
  tile: TileRef,
  cap: number,
  hit: (t: TileRef) => boolean,
): number {
  const w = game.width();
  const h = game.height();
  const cx = game.x(tile);
  const cy = game.y(tile);
  for (let d = 0; d < cap; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= w) continue;
      const dy = d - Math.abs(dx);
      if (cy - dy >= 0 && hit(game.ref(x, cy - dy))) return d;
      if (dy !== 0 && cy + dy < h && hit(game.ref(x, cy + dy))) return d;
    }
  }
  return cap;
}

/**
 * Manhattan distance from `tile` to the nearest land a non-friendly player
 * holds (where a land attack would come from), or `cap` if none is that
 * close.
 */
export function landFrontDepth(
  game: Game,
  player: Player,
  tile: TileRef,
  cap: number,
): number {
  const mine = player.smallID();
  return ringDistance(game, tile, cap, (t) => {
    const id = game.ownerID(t);
    if (id === 0 || id === mine) return false;
    const owner = game.playerBySmallID(id);
    return owner.isPlayer() && !player.isFriendly(owner);
  });
}

/** A spot for a new Dome and the value it would newly cover. */
export interface DomeSpot {
  tile: TileRef;
  score: number;
}

/** Anchor buildings looked at when searching for a Dome's spot. */
const DOME_ANCHORS = 16;
/** The middle of a cluster and the eight spots around it. */
const AROUND: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * The best spot for a new Dome of Alden: our land where it covers the most
 * threatened value that no Dome of ours or a teammate's covers yet. Around
 * each of the most valuable buildings it takes the value-weighted middle of
 * the buildings in range (a mean-shift step toward the densest cluster) and
 * spots a little way off it, each snapped to a tile we can build on. A spot
 * within range of one of those Domes is refused, so shields don't pile up,
 * and one near land a foe holds is marked down (and refused right on the
 * front), since a Dome is taken with its land. Returns null if nothing is
 * left to cover.
 */
export function bestDomeSpot(
  game: Game,
  player: Player,
  threat: NukeThreat,
): DomeSpot | null {
  const config = game.config();
  const range = config.domeRange();
  const range2 = range * range;
  // Our Domes and our teammates' (built or building) already shield us
  const shields = game
    .units(UnitType.Dome)
    .filter((d) => d.owner() === player || player.isOnSameTeam(d.owner()))
    .map((d) => d.tile());
  const covered = (t: TileRef) =>
    shields.some((d) => game.euclideanDistSquared(d, t) <= range2);

  // Uncovered buildings and their threat-weighted value
  const assets: { tile: TileRef; value: number }[] = [];
  for (const u of player.units(Structures.types)) {
    const worth = domeWorth(u);
    if (worth === 0 || covered(u.tile())) continue;
    assets.push({
      tile: u.tile(),
      value: worth * threatPercent(game, u.tile(), threat),
    });
  }
  if (assets.length === 0) return null;

  // Most valuable first (stable on ties)
  const anchors = assets
    .map((a, i) => ({ ...a, i }))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, DOME_ANCHORS);

  // The middle itself is often a building's own crowded spot, so also try
  // a little way off it on each side.
  const gap = config.structureMinDist() + 5;
  const points = new Set<TileRef>();
  for (const anchor of anchors) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (const a of assets) {
      if (game.euclideanDistSquared(a.tile, anchor.tile) > range2) continue;
      sx += game.x(a.tile) * a.value;
      sy += game.y(a.tile) * a.value;
      sw += a.value;
    }
    const mx = Math.floor(sx / sw);
    const my = Math.floor(sy / sw);
    for (const [dx, dy] of AROUND) {
      const x = mx + dx * gap;
      const y = my + dy * gap;
      if (game.isValidCoord(x, y)) points.add(game.ref(x, y));
    }
  }

  const frontCap = Math.floor(range / 3);
  const frontMin = Math.floor(range / 10);
  const seen = new Set<TileRef>();
  let best: DomeSpot | null = null;
  for (const point of points) {
    if (game.owner(point) !== player) continue;
    const tile = player.canBuild(UnitType.Dome, point);
    if (tile === false || seen.has(tile)) continue;
    seen.add(tile);
    if (covered(tile)) continue;
    const depth = landFrontDepth(game, player, tile, frontCap);
    if (depth < frontMin) continue;
    let gain = 0;
    for (const a of assets) {
      if (game.euclideanDistSquared(a.tile, tile) <= range2) gain += a.value;
    }
    // Full value deep inside, 2/3 of it at the closest allowed to a front
    const score = Math.floor((gain * (frontCap + depth)) / (2 * frontCap));
    if (best === null || score > best.score) best = { tile, score };
  }
  return best;
}
