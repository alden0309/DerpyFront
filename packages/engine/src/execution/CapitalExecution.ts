import { MessageType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { renderNumber } from "@openfront/engine-lib/Format";
import { zInt, zRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { TrainStationExecution } from "./TrainStationExecution";

/**
 * Capital: a one-per-player building. Once it finishes building it grants a
 * one-time troop bonus (the troop cap rises by the same amount in Config),
 * then pays its owner a fixed amount of gold on a fixed interval for as long
 * as it stands. Like a city, it joins the rail network as a trade station
 * when a factory is in range.
 *
 * Losing it to an enemy costs its owner half their gold (see loseCapital).
 */
/**
 * Derpy Front: settles the loss of a Capital to an enemy, at the moment it
 * falls (callers then delete it). Its owner loses half their gold: when the
 * enemy captured it (took its tile) the enemy gets that gold, and when the
 * enemy destroyed it some other way (a nuke) the gold is simply gone. Not
 * called for a voluntary delete or for an owner being eliminated.
 */
export function loseCapital(
  mg: Game,
  capital: Unit,
  enemy: Player,
  captured: boolean,
): void {
  const owner = capital.owner();
  if (capital.type() !== UnitType.Capital || capital.isUnderConstruction()) {
    return;
  }
  if (owner === enemy || !owner.isAlive()) return;

  const lost = owner.removeGold(owner.gold() / 2n);
  if (captured && lost > 0n) {
    enemy.addGold(lost, capital.tile());
    mg.stats().goldCapitalCaptured(enemy, lost);
  }
  const gold = renderNumber(lost);
  mg.displayMessage(
    captured
      ? "events_display.capital_captured_by"
      : "events_display.capital_destroyed_by",
    MessageType.UNIT_DESTROYED,
    owner.id(),
    undefined,
    { name: enemy.displayName(), gold },
    undefined,
    enemy.id(),
  );
  if (captured) {
    mg.displayMessage(
      "events_display.captured_enemy_capital",
      MessageType.CAPTURED_ENEMY_UNIT,
      enemy.id(),
      lost,
      { name: owner.displayName(), gold },
      undefined,
      owner.id(),
    );
  }
}

export class CapitalExecution implements Execution {
  private mg: Game;
  private active: boolean = true;
  private troopsGranted = false;
  private stationCreated = false;
  private ticksUntilPayout = 0;

  constructor(private capital: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.ticksUntilPayout = mg.config().capitalPayoutInterval();
  }

  tick(ticks: number): void {
    if (!this.capital.isActive()) {
      this.active = false;
      return;
    }
    const owner = this.capital.owner();
    const config = this.mg.config();

    if (!this.stationCreated) {
      this.createStation();
      this.stationCreated = true;
    }

    if (!this.troopsGranted) {
      owner.addTroops(config.capitalTroopBonus());
      this.troopsGranted = true;
    }

    this.ticksUntilPayout--;
    if (this.ticksUntilPayout <= 0) {
      const gold = config.capitalGoldPayout();
      owner.addGold(gold, this.capital.tile());
      this.mg.stats().goldWork(owner, gold);
      this.ticksUntilPayout = config.capitalPayoutInterval();
    }
  }

  private createStation(): void {
    const nearbyFactory = this.mg.hasUnitNearby(
      this.capital.tile(),
      this.mg.config().trainStationMaxRange(),
      UnitType.Factory,
    );
    if (nearbyFactory && !this.capital.hasTrainStation()) {
      this.mg.addExecution(new TrainStationExecution(this.capital));
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return CapitalExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      troopsGranted: this.troopsGranted,
      stationCreated: this.stationCreated,
      ticksUntilPayout: this.ticksUntilPayout,
      capital: w.unit(this.capital),
    });
  }

  restoreSnapshot(s: CapitalState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.troopsGranted = s.troopsGranted;
    this.stationCreated = s.stationCreated;
    this.ticksUntilPayout = s.ticksUntilPayout;
    this.capital = r.unit(s.capital);
  }
}

const CapitalStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  troopsGranted: z.boolean(),
  stationCreated: z.boolean(),
  ticksUntilPayout: zInt(),
  capital: zRef(),
});
type CapitalState = z.infer<typeof CapitalStateSchema>;

export const CapitalExecutionSnapshot = execSnapshotType({
  name: "Capital",
  version: 1,
  schema: CapitalStateSchema,
  cls: () => CapitalExecution,
});
