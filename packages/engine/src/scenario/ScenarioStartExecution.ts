import { TileRef } from "@openfront/engine-api/game/GameMap";
import { UnitType } from "@openfront/engine-api/game/GameTypes";
import {
  SCENARIO_STRUCTURE_UNITS,
  ScenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { z } from "zod";
import { CapitalExecution } from "../execution/CapitalExecution";
import { CityExecution } from "../execution/CityExecution";
import { DefensePostExecution } from "../execution/DefensePostExecution";
import { FactoryExecution } from "../execution/FactoryExecution";
import { MissileSiloExecution } from "../execution/MissileSiloExecution";
import { PlayerExecution } from "../execution/PlayerExecution";
import { PortExecution } from "../execution/PortExecution";
import { SAMLauncherExecution } from "../execution/SAMLauncherExecution";
import { WarshipExecution } from "../execution/WarshipExecution";
import { Execution, Game, Player, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type { ExecRecord, SnapshotReader } from "../snapshot/SnapshotContext";
import { ScenarioRuntime } from "./Scenario";
import { scenarioStartLabels } from "./ScenarioLabels";
import { scenarioRule } from "./ScenarioRules";

/**
 * SCEN (r25): sets a Scenario's board on the game's first tick, then ends
 * the spawn phase. Every nation gets its historical land (all of it, every
 * land tile owned), its capital and structures, its warships, and its
 * starting troops and gold. Runs first, before the nations' own executions
 * see the tick, so none of them ever looks for a place to spawn.
 */
export class ScenarioStartExecution implements Execution {
  private mg: Game | null = null;
  private done = false;

  init(mg: Game): void {
    this.mg = mg;
  }

  tick(): void {
    if (this.done || this.mg === null) return;
    this.done = true;
    const scenario = this.mg.scenario();
    if (scenario !== null) startScenario(this.mg, scenario);
    this.mg.endSpawnPhase();
  }

  isActive(): boolean {
    return !this.done;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  snapshot(): ExecRecord {
    return ScenarioStartExecutionSnapshot.write({
      initialized: this.mg !== null,
      done: this.done,
    });
  }

  restoreSnapshot(s: ScenarioStartState, r: SnapshotReader): void {
    this.mg = s.initialized ? r.game : null;
    this.done = s.done;
  }
}

const ScenarioStartStateSchema = z.object({
  initialized: z.boolean(),
  done: z.boolean(),
});
type ScenarioStartState = z.infer<typeof ScenarioStartStateSchema>;

export const ScenarioStartExecutionSnapshot = execSnapshotType({
  name: "ScenarioStart",
  version: 1,
  schema: ScenarioStartStateSchema,
  cls: () => ScenarioStartExecution,
});

/** Lays out the scenario's starting board (see ScenarioStartExecution). */
export function startScenario(game: Game, scenario: ScenarioRuntime): void {
  const data = scenario.data;
  const byIndex: (Player | null)[] = data.nations.map(() => null);
  for (const p of game.allPlayers()) {
    const n = scenario.nationOf(p);
    if (n !== null) byIndex[data.nations.indexOf(n)] = p;
  }

  const labels = scenarioStartLabels(game, scenario);
  for (let t = 0; t < labels.length; t++) {
    const label = labels[t];
    if (label === 0) continue;
    const p = byIndex[label - 1];
    if (p !== null) p.conquer(t);
  }

  data.nations.forEach((n, i) => {
    const p = byIndex[i];
    if (p === null || p.numTilesOwned() === 0) return;
    const capital = nearestOwnTile(game, p, scenario.px(n.capital));
    if (capital === null) return;
    p.setSpawnTile(capital);
    game.stats().recordSpawnTile(p, capital);
    game.addExecution(new PlayerExecution(p));
    placeStructures(game, p, n, capital, scenario);
    setStartingStrength(game, p, n);
  });
  scenarioRule(game)?.start?.(game);
}

function placeStructures(
  game: Game,
  p: Player,
  n: ScenarioNation,
  capital: TileRef,
  scenario: ScenarioRuntime,
): void {
  const config = game.config();
  if (!config.isUnitDisabled(UnitType.Capital)) {
    const at = p.landBasedStructureSpawn(capital);
    if (at !== false) {
      const unit = p.buildUnit(UnitType.Capital, at, {}, true);
      game.addExecution(new CapitalExecution(unit));
    }
  }
  for (const s of n.structures ?? []) {
    const type = SCENARIO_STRUCTURE_UNITS[s.type];
    if (type === undefined || config.isUnitDisabled(type)) continue;
    const near = nearestOwnTile(game, p, scenario.px(s.at));
    if (near === null) continue;
    const at =
      type === UnitType.Port
        ? p.portSpawn(near, null)
        : p.landBasedStructureSpawn(near);
    if (at === false) continue;
    const unit = p.buildUnit(type, at, {}, true);
    for (let level = 1; level < (s.level ?? 1); level++) unit.increaseLevel();
    const exec = structureExecution(game, p, type, unit);
    if (exec !== null) game.addExecution(exec);
  }
  if (config.isUnitDisabled(UnitType.Warship)) return;
  for (const w of n.warships ?? []) {
    const [x, y] = scenario.px(w);
    if (!game.isValidCoord(x, y)) continue;
    const tile = game.ref(x, y);
    const at = p.warshipSpawn(tile);
    if (at === false) continue;
    const ship = p.buildUnit(UnitType.Warship, at, { patrolTile: tile }, true);
    game.addExecution(new WarshipExecution(ship));
  }
}

function structureExecution(
  game: Game,
  p: Player,
  type: UnitType,
  unit: Unit,
): Execution | null {
  switch (type) {
    // SCEN3 (r27): a Dome of Alden runs nothing: a nuke asks for the Domes
    // near where it lands (DomeShield.ts).
    case UnitType.Dome:
      return null;
    case UnitType.Port:
      return new PortExecution(unit);
    case UnitType.MissileSilo:
      return new MissileSiloExecution(unit);
    case UnitType.DefensePost:
      return new DefensePostExecution(unit);
    case UnitType.SAMLauncher:
      return new SAMLauncherExecution(p, null, unit);
    case UnitType.Factory:
      return new FactoryExecution(unit);
    default:
      return new CityExecution(unit);
  }
}

/**
 * Troops are a share of the nation's cap (its capital and cities stand
 * now); the capital adds its own bonus on its first tick, so that part is
 * left out here. Gold comes on top of any the host's options give.
 */
function setStartingStrength(game: Game, p: Player, n: ScenarioNation): void {
  const config = game.config();
  const target = (config.maxTroops(p) * n.troopsPercent) / 100;
  const capitalBonus =
    p.units(UnitType.Capital).length > 0 ? config.capitalTroopBonusFor(p) : 0;
  p.setTroops(Math.max(0, Math.floor(target - capitalBonus)));
  p.setScenarioGold(p.gold() + BigInt(n.gold));
}

/** The tile of `p` nearest to (x, y), searching outwards in square rings. */
function nearestOwnTile(
  game: Game,
  p: Player,
  at: [number, number],
): TileRef | null {
  const W = game.width();
  const H = game.height();
  const cx = Math.min(Math.max(at[0], 0), W - 1);
  const cy = Math.min(Math.max(at[1], 0), H - 1);
  const id = p.smallID();
  const maxR = Math.max(W, H);
  for (let r = 0; r < maxR; r++) {
    let best: TileRef | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      const edge = Math.abs(dy) === r;
      for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r || 1) {
        const x = cx + dx;
        if (x < 0 || x >= W) continue;
        const t = game.ref(x, y);
        if (game.ownerID(t) !== id) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}
