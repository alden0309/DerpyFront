import { zInt, zRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/**
 * Capital: a one-per-player building. Once it finishes building it grants a
 * one-time troop bonus (the troop cap rises by the same amount in Config),
 * then pays its owner a fixed amount of gold on a fixed interval for as long
 * as it stands.
 */
export class CapitalExecution implements Execution {
  private mg: Game;
  private active: boolean = true;
  private troopsGranted = false;
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
      ticksUntilPayout: this.ticksUntilPayout,
      capital: w.unit(this.capital),
    });
  }

  restoreSnapshot(s: CapitalState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.troopsGranted = s.troopsGranted;
    this.ticksUntilPayout = s.ticksUntilPayout;
    this.capital = r.unit(s.capital);
  }
}

const CapitalStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  troopsGranted: z.boolean(),
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
