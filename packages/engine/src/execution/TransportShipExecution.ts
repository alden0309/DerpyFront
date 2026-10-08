import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  TerraNullius,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import { MotionPlanRecord } from "@openfront/engine-lib/game/MotionPlans";
import {
  zInt,
  zNum,
  zPlayerRef,
  zRef,
  zTile,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player, Unit } from "../game/Game";
import { targetTransportTile } from "../game/TransportShipUtils";
import { WaterPathFinder } from "../pathfinding/PathFinder";
import { PathStatus } from "../pathfinding/types";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import {
  restoreWaterPathFinder,
  WaterPathFinderSchema,
  waterPathFinderState,
} from "../snapshot/PathfinderSnapshots";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { AttackExecution } from "./AttackExecution";
import { ShellExecution } from "./ShellExecution";
import { WarshipExecution } from "./WarshipExecution";

const malusForRetreat = 25;

/** Derpy Front: warships an escorted transport turns into when it lands. */
const ESCORT_WARSHIPS = 2;
/** How far (in tile steps) from the landing spot the escort may come out. */
const ESCORT_SEARCH_RADIUS = 4;

/**
 * Derpy Front: what an escorted (armored) troop transport costs -- the price
 * of the player's next two warships, who sail on as warships once it lands.
 */
export function escortedTransportCost(mg: Game, player: Player): bigint {
  const info = mg.unitInfo(UnitType.Warship);
  return info.cost(mg, player) + info.cost(mg, player, 1);
}

export class TransportShipExecution implements Execution {
  private active = true;

  // TODO: make this configurable
  private ticksPerMove = 1;
  private lastMove: number;

  private mg: Game;
  private target: Player | TerraNullius;
  private pathFinder: WaterPathFinder;

  private dst: TileRef | null;
  private src: TileRef | null;
  private retreatDst: TileRef | false | null = null;
  private boat: Unit;
  private motionPlanId = 1;
  private motionPlanDst: TileRef | null = null;

  private originalOwner: Player;

  // Derpy Front: when the escorted (armored) transport last fired.
  private lastShot = -1_000_000;

  constructor(
    private attacker: Player,
    private ref: TileRef,
    private troops: number,
    private escorted = false,
  ) {
    this.originalOwner = this.attacker;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number) {
    if (!mg.isValidRef(this.ref)) {
      console.warn(`TransportShipExecution: ref ${this.ref} not valid`);
      this.active = false;
      return;
    }

    this.lastMove = ticks;
    this.mg = mg;
    this.target = mg.owner(this.ref);
    const stagger = mg.nextShipStagger("transportShip");
    this.pathFinder = new WaterPathFinder(mg, stagger);

    if (
      this.attacker.unitCount(UnitType.TransportShip) >=
      mg.config().boatMaxNumber()
    ) {
      mg.displayMessage(
        "events_display.no_boats_available",
        MessageType.ATTACK_FAILED,
        this.attacker.id(),
        undefined,
        { max: mg.config().boatMaxNumber() },
      );
      this.active = false;
      return;
    }

    if (this.target.isPlayer()) {
      const targetPlayer = this.target as Player;
      if (
        targetPlayer.type() !== PlayerType.Bot &&
        this.attacker.type() !== PlayerType.Bot
      ) {
        this.rejectIncomingAllianceRequests(targetPlayer);
      }
    }

    if (this.target === this.attacker) {
      this.active = false;
      return;
    }

    if (this.target.isPlayer() && !this.attacker.canAttackPlayer(this.target)) {
      this.active = false;
      return;
    }

    this.troops ??= this.mg
      .config()
      .boatAttackAmount(this.attacker, this.target);
    this.troops = Math.min(this.troops, this.attacker.troops());

    this.dst = targetTransportTile(this.mg, this.attacker, this.ref);

    if (this.dst === null) {
      console.warn(
        `${this.attacker} cannot send ship to ${this.target}, cannot find target tile`,
      );
      this.active = false;
      return;
    }

    const src = this.attacker.canBuild(UnitType.TransportShip, this.dst);

    if (src === false) {
      console.warn(
        `${this.attacker} cannot send ship to ${this.target}, cannot find start tile`,
      );
      this.active = false;
      return;
    }

    this.src = src;

    if (this.escorted && !this.canAffordEscort()) {
      this.active = false;
      return;
    }

    if (this.escorted) {
      this.attacker.removeGold(escortedTransportCost(this.mg, this.attacker));
    }
    this.boat = this.attacker.buildUnit(UnitType.TransportShip, this.src, {
      troops: this.troops,
      targetTile: this.dst,
      ...(this.escorted ? { escorted: true } : {}),
    });

    const fullPath = this.pathFinder.findPath(this.src, this.dst) ?? [this.src];
    if (fullPath.length === 0 || fullPath[0] !== this.src) {
      fullPath.unshift(this.src);
    }

    const motionPlan: MotionPlanRecord = {
      kind: "grid",
      unitId: this.boat.id(),
      planId: this.motionPlanId,
      startTick: ticks + this.ticksPerMove,
      ticksPerStep: this.ticksPerMove,
      path: fullPath,
    };
    this.mg.recordMotionPlan(motionPlan);
    this.motionPlanDst = this.dst;

    // Notify the target player about the incoming naval invasion
    if (this.target.id() !== mg.terraNullius().id()) {
      mg.displayIncomingUnit(
        this.boat.id(),
        // TODO TranslateText
        `Naval invasion incoming from ${this.attacker.displayName()} (${renderTroops(this.boat.troops())})`,
        MessageType.NAVAL_INVASION_INBOUND,
        this.target.id(),
      );
    }

    // Record stats
    this.mg
      .stats()
      .boatSendTroops(this.attacker, this.target, this.boat.troops());
  }

  tick(ticks: number) {
    this.tickTransport(ticks);
    if (this.escorted) this.tickEscorted(ticks);
  }

  private tickTransport(ticks: number) {
    if (this.dst === null) {
      this.active = false;
      return;
    }
    if (!this.active) {
      return;
    }
    if (!this.boat.isActive()) {
      this.active = false;
      return;
    }
    if (ticks - this.lastMove < this.ticksPerMove) {
      return;
    }
    this.lastMove = ticks;

    // Team mate can conquer disconnected player and get their ships
    // captureUnit has changed the owner of the unit, now update attacker
    const boatOwner = this.boat.owner();
    if (
      this.originalOwner.isDisconnected() &&
      boatOwner !== this.originalOwner &&
      boatOwner.isOnSameTeam(this.originalOwner)
    ) {
      this.attacker = boatOwner;
      this.originalOwner = boatOwner; // for when this owner disconnects too
    }

    if (this.pathFinder.rebuilt) {
      this.motionPlanDst = null; // Force motion plan re-recording
    }

    // Auto-retreat if destination was destroyed by nuke (turned to water)
    // Checked every tick (not just on graph rebuild) because graph rebuilds
    // are throttled and the tile may already be water before the version bumps.
    if (this.dst !== null && this.mg.isWater(this.dst)) {
      if (!this.boat.transportShipState().isRetreating) {
        this.boat.updateTransportShipState({ isRetreating: true });
      }
      // Reset cached retreat destination so it's recomputed from current position
      this.retreatDst = null;
    }

    if (this.boat.transportShipState().isRetreating) {
      // Resolve retreat destination once, based on current boat location when retreat begins.
      this.retreatDst ??= this.attacker.bestTransportShipSpawn(
        this.boat.tile(),
      );

      if (this.retreatDst === false) {
        console.warn(
          `TransportShipExecution: retreating but no retreat destination found`,
        );
        this.attacker.addTroops(this.boat.troops());
        this.finishTrip();
        return;
      } else {
        this.dst = this.retreatDst;

        if (this.boat.targetTile() !== this.dst) {
          this.boat.setTargetTile(this.dst);
        }
      }
    }

    const result = this.pathFinder.next(this.boat.tile(), this.dst);
    switch (result.status) {
      case PathStatus.COMPLETE:
        if (this.mg.owner(this.dst) === this.attacker) {
          const deaths = this.boat.troops() * (malusForRetreat / 100);
          const survivors = this.boat.troops() - deaths;
          this.attacker.addTroops(survivors);
          this.finishTrip();

          // Record stats
          this.mg
            .stats()
            .boatArriveTroops(this.attacker, this.target, survivors);
          if (deaths) {
            this.mg.displayMessage(
              "events_display.attack_cancelled_retreat",
              MessageType.ATTACK_CANCELLED,
              this.attacker.id(),
              undefined,
              { troops: renderTroops(deaths) },
            );
          }
          return;
        }
        this.attacker.conquer(this.dst);
        if (this.target.isPlayer() && this.attacker.isFriendly(this.target)) {
          this.attacker.addTroops(this.boat.troops());
        } else {
          this.mg.addExecution(
            new AttackExecution(
              this.boat.troops(),
              this.attacker,
              this.target.id(),
              this.dst,
              false,
            ),
          );
        }
        this.finishTrip();

        // Record stats
        this.mg
          .stats()
          .boatArriveTroops(this.attacker, this.target, this.boat.troops());
        return;
      case PathStatus.NEXT:
        this.boat.move(result.node);
        break;
      case PathStatus.NOT_FOUND: {
        // TODO: add to poisoned port list
        const map = this.mg.map();
        const boatTile = this.boat.tile();
        console.warn(
          `TransportShip path not found: boat@(${map.x(boatTile)},${map.y(boatTile)}) -> dst@(${map.x(this.dst)},${map.y(this.dst)}), attacker=${this.attacker.id()}, target=${this.target.id()}`,
        );
        this.attacker.addTroops(this.boat.troops());
        this.finishTrip();
        return;
      }
    }

    if (this.dst !== null && this.dst !== this.motionPlanDst) {
      this.motionPlanId++;
      const fullPath = this.pathFinder.findPath(this.boat.tile(), this.dst) ?? [
        this.boat.tile(),
      ];
      if (fullPath.length === 0 || fullPath[0] !== this.boat.tile()) {
        fullPath.unshift(this.boat.tile());
      }

      this.mg.recordMotionPlan({
        kind: "grid",
        unitId: this.boat.id(),
        planId: this.motionPlanId,
        startTick: ticks + this.ticksPerMove,
        ticksPerStep: this.ticksPerMove,
        path: fullPath,
      });
      this.motionPlanDst = this.dst;
    }
  }

  owner(): Player {
    return this.attacker;
  }

  /**
   * The boat ends its trip without being sunk (landed, home after a retreat,
   * or out of route): retire it, and let an escorted transport's escort sail
   * on as warships.
   */
  private finishTrip(): void {
    const tile = this.boat.tile();
    const health = this.boat.health();
    const maxHealth = this.boat.maxHealth();
    this.boat.delete(false);
    this.active = false;
    if (this.escorted) this.releaseEscort(tile, health, maxHealth);
  }

  /**
   * Derpy Front: the escort the player paid for when launching becomes
   * ESCORT_WARSHIPS ordinary warships next to where the transport stopped.
   * They are not charged again, and carry the convoy's damage: each has the
   * share of its max health that the transport had left.
   */
  private releaseEscort(from: TileRef, health: number, maxHealth: number) {
    const mg = this.mg;
    if (
      mg.config().isUnitDisabled(UnitType.Warship) ||
      !this.attacker.isAlive()
    ) {
      return;
    }
    const tile = this.escortWaterTile(from);
    if (tile === null) return;
    for (let i = 0; i < ESCORT_WARSHIPS; i++) {
      const warship = this.attacker.buildUnit(
        UnitType.Warship,
        tile,
        { patrolTile: tile },
        true,
      );
      const share = Math.max(
        1,
        Math.round((warship.maxHealth() * health) / maxHealth),
      );
      warship.modifyHealth(share - warship.health());
      mg.addExecution(new WarshipExecution(warship));
    }
  }

  /**
   * Where the escort comes out: the boat's tile if it is water, otherwise
   * the nearest water tile within ESCORT_SEARCH_RADIUS steps (BFS in
   * neighbor order), preferring the water body the boat sailed in on, then
   * the ocean. Null when there is no water that close.
   */
  private escortWaterTile(from: TileRef): TileRef | null {
    const map = this.mg.map();
    if (map.isWater(from)) return from;
    const last = this.boat.lastTile();
    const body = this.mg.getWaterComponent(map.isWater(last) ? last : from);
    let best: TileRef | null = null;
    let bestRank = Infinity;
    const seen = new Set<TileRef>([from]);
    let frontier = [from];
    for (let step = 0; step < ESCORT_SEARCH_RADIUS; step++) {
      const next: TileRef[] = [];
      for (const tile of frontier) {
        for (const n of map.neighbors(tile)) {
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
          if (!map.isWater(n)) continue;
          const otherBody =
            body !== null && !this.mg.hasWaterComponent(n, body);
          const rank = (otherBody ? 2 : 0) + (map.isOcean(n) ? 0 : 1);
          if (rank < bestRank) {
            best = n;
            bestRank = rank;
          }
        }
      }
      if (bestRank === 0) break;
      frontier = next;
    }
    return best;
  }

  /**
   * The escorted transport is priced like two warships; refuse (and say why)
   * when the player can't pay.
   */
  private canAffordEscort(): boolean {
    const mg = this.mg;
    if (mg.config().isUnitDisabled(UnitType.Warship)) {
      mg.displayMessage(
        "events_display.escort_unavailable",
        MessageType.ATTACK_FAILED,
        this.attacker.id(),
      );
      return false;
    }
    const cost = escortedTransportCost(mg, this.attacker);
    if (this.attacker.gold() < cost) {
      mg.displayMessage(
        "events_display.escort_too_expensive",
        MessageType.ATTACK_FAILED,
        this.attacker.id(),
        undefined,
        { gold: renderNumber(cost) },
      );
      return false;
    }
    return true;
  }

  /**
   * The escorted transport is one armored ship: it carries the troops, has
   * three warships' worth of health, and fires back at enemy ships with the
   * firepower of two warships (a shell every half warship reload).
   */
  private tickEscorted(ticks: number): void {
    if (!this.active || this.boat === undefined || !this.boat.isActive()) {
      return;
    }
    const reload = Math.max(
      1,
      Math.floor(this.mg.config().warshipShellAttackRate() / 2),
    );
    if (ticks - this.lastShot <= reload) return;
    const target = this.escortTarget(this.boat);
    if (target === undefined) return;
    this.mg.addExecution(
      new ShellExecution(this.boat.tile(), this.attacker, this.boat, target),
    );
    this.lastShot = ticks;
  }

  /** Nearest enemy transport (first) or warship the ship can shoot. */
  private escortTarget(escort: Unit): Unit | undefined {
    const owner = this.attacker;
    let best: Unit | undefined;
    let bestPriority = Infinity;
    let bestDist = Infinity;
    for (const { unit, distSquared } of this.mg.nearbyUnits(
      escort.tile(),
      this.mg.config().warshipTargettingRange(),
      [UnitType.TransportShip, UnitType.Warship],
    )) {
      const other = unit.owner();
      if (
        other === owner ||
        !owner.canAttackPlayer(other, true) ||
        owner.hasTradeAgreementWith(other) ||
        (unit.type() === UnitType.Warship &&
          unit.warshipState().state === "docked")
      ) {
        continue;
      }
      const priority = unit.type() === UnitType.TransportShip ? 0 : 1;
      if (
        priority < bestPriority ||
        (priority === bestPriority && distSquared < bestDist)
      ) {
        best = unit;
        bestPriority = priority;
        bestDist = distSquared;
      }
    }
    return best;
  }

  isActive(): boolean {
    return this.active;
  }

  private rejectIncomingAllianceRequests(target: Player) {
    const request = this.attacker
      .incomingAllianceRequests()
      .find((ar) => ar.requestor() === target);
    if (request !== undefined) {
      request.reject();
    }
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    // Fields init() leaves unset on an early return are stored as undefined.
    return TransportShipExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      ticksPerMove: this.ticksPerMove,
      lastMove: this.lastMove,
      target: this.target === undefined ? undefined : w.owner(this.target),
      pathFinder:
        this.pathFinder === undefined
          ? undefined
          : waterPathFinderState(this.pathFinder),
      dst: this.dst,
      src: this.src,
      retreatDst: this.retreatDst,
      boat: this.boat === undefined ? undefined : w.unit(this.boat),
      motionPlanId: this.motionPlanId,
      motionPlanDst: this.motionPlanDst,
      originalOwner: w.player(this.originalOwner),
      attacker: w.player(this.attacker),
      ref: this.ref,
      troops: this.troops,
      ...(this.escorted ? { escorted: true, lastShot: this.lastShot } : {}),
    });
  }

  restoreSnapshot(s: TransportShipExecutionState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.ticksPerMove = s.ticksPerMove;
    if (s.lastMove !== undefined) this.lastMove = s.lastMove;
    if (s.target !== undefined) this.target = r.owner(s.target);
    if (s.pathFinder !== undefined) {
      this.pathFinder = restoreWaterPathFinder(r.game, s.pathFinder);
    }
    if (s.dst !== undefined) this.dst = s.dst;
    if (s.src !== undefined) this.src = s.src;
    this.retreatDst = s.retreatDst;
    if (s.boat !== undefined) this.boat = r.unit(s.boat);
    this.motionPlanId = s.motionPlanId;
    this.motionPlanDst = s.motionPlanDst;
    this.originalOwner = r.player(s.originalOwner);
    this.attacker = r.player(s.attacker);
    this.ref = s.ref;
    this.troops = s.troops;
    this.escorted = s.escorted === true;
    this.lastShot = s.lastShot ?? -1_000_000;
  }
}

const TransportShipExecutionStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  ticksPerMove: zInt(),
  lastMove: zInt().optional(),
  target: zPlayerRef().optional(),
  pathFinder: WaterPathFinderSchema.optional(),
  dst: zTile().nullable().optional(),
  src: zTile().nullable().optional(),
  /** Unresolved (null), none found (false), or the retreat tile. */
  retreatDst: z.union([zTile(), z.literal(false)]).nullable(),
  boat: zRef().optional(),
  motionPlanId: zInt(),
  motionPlanDst: zTile().nullable(),
  originalOwner: zPlayerRef(),
  attacker: zPlayerRef(),
  // Unvalidated until init() checks it.
  ref: zInt(),
  troops: zNum(),
  escorted: z.boolean().optional(),
  lastShot: zInt().optional(),
});
type TransportShipExecutionState = z.infer<
  typeof TransportShipExecutionStateSchema
>;

export const TransportShipExecutionSnapshot = execSnapshotType({
  name: "TransportShip",
  version: 1,
  schema: TransportShipExecutionStateSchema,
  cls: () => TransportShipExecution,
});
