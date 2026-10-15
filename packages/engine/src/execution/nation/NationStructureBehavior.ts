import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  Difficulty,
  GameMode,
  Gold,
  PlayerType,
  Structures,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { NO_TEMPERAMENT } from "@openfront/engine-lib/game/AiPersonalities";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  readVersioned,
  snapshotType,
  Versioned,
  zInt,
  zTile,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { assertNever } from "@openfront/engine-lib/Util";
import { z } from "zod";
import { Attack, Game, Player, Unit } from "../../game/Game";
import { playerAiTuning } from "../../game/NationAiTypes";
import { nationTemperament } from "../../game/NationPersonas";
import { Cluster } from "../../game/TrainStation";
import type {
  SnapshotReader,
  SnapshotWriter,
} from "../../snapshot/SnapshotContext";
import { ConstructionExecution } from "../ConstructionExecution";
import { UpgradeStructureExecution } from "../UpgradeStructureExecution";
import { nearestTileDist, nearestTileDistCapped } from "../Util";
import {
  bestDomeSpot,
  NUKE_IMPACT_MEMORY,
  NUKE_IMPACT_MEMORY_TICKS,
  NukeThreat,
  readNukeThreat,
  threatIsReal,
} from "./NationDomes";
import { randTerritoryTileArray } from "./NationUtils";

/**
 * Configuration for how many structures of each type a nation should build
 * relative to the number of cities it owns.
 */
interface StructureRatioConfig {
  /** How many of this structure per city (e.g., 0.75 means 3 ports for every 4 cities) */
  ratioPerCity: number;
  /** Perceived cost increase percentage per owned structure (e.g., 0.1 = 10% more expensive per owned) */
  perceivedCostIncreasePerOwned: number;
}

/** SAM launcher ratio per city, keyed by difficulty */
const SAM_RATIO_BY_DIFFICULTY: Record<Difficulty, number> = {
  [Difficulty.Easy]: 0.15,
  [Difficulty.Medium]: 0.2,
  [Difficulty.Hard]: 0.25,
  [Difficulty.Impossible]: 0.3,
};

/**
 * Returns structure ratios relative to city count, adjusted by difficulty.
 * Cities are always prioritized and built first.
 * When cities are disabled, we use TILES_PER_CITY_EQUIVALENT. That's not ideal, nations won't properly upgrade structures, but it's better than nothing. Probably 99.9% of players won't disable cities anyway.
 */
function getStructureRatios(
  difficulty: Difficulty,
): Partial<Record<UnitType, StructureRatioConfig>> {
  return {
    [UnitType.Port]: { ratioPerCity: 0.75, perceivedCostIncreasePerOwned: 1 },
    [UnitType.Factory]: {
      ratioPerCity: 0.75,
      perceivedCostIncreasePerOwned: 1,
    },
    [UnitType.SAMLauncher]: {
      ratioPerCity: SAM_RATIO_BY_DIFFICULTY[difficulty],
      perceivedCostIncreasePerOwned: 0.3,
    },
    [UnitType.MissileSilo]: {
      ratioPerCity: 0.2,
      perceivedCostIncreasePerOwned: 1,
    },
  };
}

/** Structures a train can stop at, for rail connectivity scoring. */
const TRADE_STRUCTURE_TYPES: readonly UnitType[] = [
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
  UnitType.Capital,
];

/** Cities a nation builds before it starts saving for its Capital. */
const CITIES_BEFORE_CAPITAL = 1;

/**
 * Derpy Front: percent chance a nation places its Capital strategically
 * (deep inside its land, away from borders and coasts, under its SAMs)
 * rather than wherever a city would go.
 */
const CAPITAL_STRATEGY_PERCENT: Record<Difficulty, number> = {
  [Difficulty.Easy]: 0,
  [Difficulty.Medium]: 50,
  [Difficulty.Hard]: 85,
  [Difficulty.Impossible]: 100,
};

/** Derpy Front: SAM launchers a nation keeps covering its Capital. */
const CAPITAL_GUARD_SAMS: Record<Difficulty, number> = {
  [Difficulty.Easy]: 0,
  [Difficulty.Medium]: 1,
  [Difficulty.Hard]: 2,
  [Difficulty.Impossible]: 3,
};

/** Tiles sampled when placing a Capital strategically (25 otherwise). */
const CAPITAL_STRATEGIC_SAMPLES = 80;

/** Perceived cost increase percentage per city owned */
const CITY_PERCEIVED_COST_INCREASE_PER_OWNED = 1;

/** Cities owned before saving up for nukes inflates structure costs (not on Easy) */
const CITIES_BEFORE_SAVING = 3;

/** Factory ratio multiplier when the nation has coastal tiles */
const FACTORY_COASTAL_RATIO_MULTIPLIER = 0.33;

/** Maximum number of missile silos a nation will build */
const MAX_MISSILE_SILOS = 3;

/** Ratio per city used for the first missile silo so nations start nuking earlier */
const FIRST_MISSILE_SILO_RATIO = 0.4;
const FIRST_MISSILE_SILO_PERCENT = 40;

/** If we have more than this many structures per tiles, prefer upgrading over building */
const UPGRADE_DENSITY_THRESHOLD = 1 / 1500;

/**
 * Minimum number of full-map water tiles a water body must have for the AI to
 * consider placing a port on it.  Prevents the AI from wasting ports on tiny
 * decorative ponds scattered across the map.
 */
const MIN_PORT_WATER_COMPONENT_SIZE = 3000;

/** Estimated number of tiles per city equivalent, used when cities are disabled */
const TILES_PER_CITY_EQUIVALENT = 2000;

/**
 * When map-wide nation density (nations per land tile) is above this threshold,
 * a nation's very first structure is a port (or factory if no water access)
 */
const HIGH_NATION_DENSITY_THRESHOLD = 1 / 7500;

/**
 * Starting-gold threshold above which nations enter the
 * "high-gold" early game: they build a SAM first and wait between structure
 * placements. Without this, high-starting-gold games let a nation
 * drop many structures within a short timespan, which ballooned its maxTroops
 * before troop count caught up (delaying its attacks) and clustered the
 * new structures inside a single nuke blast radius.
 */
const HIGH_STARTING_GOLD_THRESHOLD = 3_000_000n;

/** Tick gap a high-starting-gold nation must wait before placing its Nth structure */
const HIGH_GOLD_STRUCTURE_COOLDOWN_TICKS: readonly number[] = [
  0, // before #1 (SAM) — no pause
  0, // before #2 — no pause
  250, // before #3 — 25s
  150, // before #4 — 15s
  100, // before #5 — 10s
];

/** Length in ticks of each on/off phase after the team-mode save-up target is first reached */
const TEAM_POST_SAVE_UP_PHASE_TICKS = 150; // 15s

/**
 * Incoming land-attack troop count as a fraction of own troops below which
 * the nation does not build defensive structures.
 */
const UNDER_ATTACK_THREAT_RATIO = 0.35;

/**
 * Hard / Impossible: one additional defense post is allowed per this fraction
 * of the incoming-to-own-troop ratio (e.g. 0.4 → 1 post at 0–40%, 2 at
 * 40–80%, 3 at 80–120%, …).
 */
const DEFENSE_POST_RATIO_PER_POST = 0.4;

/**
 * Derpy Front (rules 4+): a Dome built before any nuke has come at us must
 * newly cover at least this many points of buildings (see domeWorth: the
 * Capital is 20, a city 5 a level), and one built after at least this.
 */
const DOME_MIN_POINTS_PREEMPTIVE = 40;
const DOME_MIN_POINTS_NUKED = 10;
// Domes a nation builds before any nuke has come at it: 3, or its
// personality's number (AiTuning.preemptiveDomes).
/** Ticks between ordering one Dome and the next, before being nuked. */
const DOME_COOLDOWN_TICKS = 600;
/** Ticks before looking again when no spot was worth a Dome. */
const DOME_RETRY_TICKS = 300;
/**
 * A nation holding this many tenths of a worthwhile first Dome's price saves
 * the rest (Medium and up)...
 */
const DOME_SAVE_FROM_TENTHS = 6n;
/** ...for at most this many ticks out of twice as many. */
const DOME_SAVE_MAX_TICKS = 3000; // 5 minutes
/** Structures a nation prefers to put under its Domes when threatened. */
const SHELTERED_TYPES: ReadonlySet<UnitType> = new Set([
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
  UnitType.MissileSilo,
  UnitType.SAMLauncher,
]);
/** Extra spots sampled under our Domes when placing a structure. */
const SHELTER_SAMPLES = 10;
/**
 * The bonus for a spot under a Dome halves once the Dome covers this many
 * of the type, and keeps fading after.
 */
const SHELTER_CROWD = 4;
/** Upgrade score for a structure under one of our Domes (a SAM gives 10). */
const SHELTERED_UPGRADE_SCORE = 20;

// Reusable neighbor buffer for hot loops; the simulation is single-threaded.
const NEIGHBOR_SCRATCH: TileRef[] = [0, 0, 0, 0];

export class NationStructureBehavior {
  private reachableStationsCache: Array<{
    tile: TileRef;
    cluster: Cluster | null;
    weight: number;
  }> | null = null;
  private _sharedWaterComponents: Set<number> | null = null;
  private lastStructureTick: number | null = null;
  private placementsCount = 0;
  private builtCrowdedMapFirstStructure = false;
  private _hasHighStartingGold: boolean | null = null;
  private _postSaveUpStartTick: number | null = null;
  /** Derpy Front: when we last saw an enemy nuke heading for our land. */
  private nukedTick: number | null = null;
  /** Derpy Front (rules 4+): recent [tick, target] of nukes sent at us. */
  private nukeImpacts: [number, TileRef][] = [];
  /** Derpy Front (rules 4+): when we last ordered a Dome. */
  private lastDomeTick: number | null = null;
  /** Derpy Front (rules 4+): no Dome search before this tick. */
  private domeRetryTick: number | null = null;
  /** Derpy Front (rules 4+): saving for a Dome until this tick. */
  private domeSavingUntil: number | null = null;
  /** Derpy Front (rules 4+): when this spell of saving for a Dome began. */
  private domeSaveStartTick: number | null = null;

  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  /**
   * reachableStationsCache and _sharedWaterComponents are not stored: both
   * are reset at the start of doHandleStructures and only read inside it.
   */
  snapshot(w: SnapshotWriter): Versioned {
    return w.versioned(NationStructureBehaviorSnapshot, {
      lastStructureTick: this.lastStructureTick,
      placementsCount: this.placementsCount,
      builtCrowdedMapFirstStructure: this.builtCrowdedMapFirstStructure,
      hasHighStartingGold: this._hasHighStartingGold,
      postSaveUpStartTick: this._postSaveUpStartTick,
      nukedTick: this.nukedTick,
      nukeImpacts: this.nukeImpacts.map(
        ([tick, tile]) => [tick, tile] as [number, number],
      ),
      lastDomeTick: this.lastDomeTick,
      domeRetryTick: this.domeRetryTick,
      domeSavingUntil: this.domeSavingUntil,
      domeSaveStartTick: this.domeSaveStartTick,
    });
  }

  /** Fills a prototype-only shell; only assigns (see README). */
  restoreSnapshot(
    raw: unknown,
    r: SnapshotReader,
    random: PseudoRandom,
    player: Player,
  ): void {
    const s = readVersioned(NationStructureBehaviorSnapshot, raw);
    this.random = random;
    this.game = r.game;
    this.player = player;
    this.reachableStationsCache = null;
    this._sharedWaterComponents = null;
    this.lastStructureTick = s.lastStructureTick;
    this.placementsCount = s.placementsCount;
    this.builtCrowdedMapFirstStructure = s.builtCrowdedMapFirstStructure;
    this._hasHighStartingGold = s.hasHighStartingGold;
    this._postSaveUpStartTick = s.postSaveUpStartTick;
    this.nukedTick = s.nukedTick ?? null;
    this.nukeImpacts = s.nukeImpacts.map(([tick, tile]) => [tick, tile]);
    this.lastDomeTick = s.lastDomeTick;
    this.domeRetryTick = s.domeRetryTick;
    this.domeSavingUntil = s.domeSavingUntil;
    this.domeSaveStartTick = s.domeSaveStartTick;
  }

  handleStructures(): boolean {
    // Derpy Front (rules 4+): whatever we build, note the nukes at us.
    if (this.game.config().derpyRules() >= 4) this.noteNukesAtUs();
    // Derpy Front: guarding the Capital comes first, outside the normal
    // pacing (like defense posts below).
    if (this.tryProtectCapital()) {
      return true;
    }
    if (this.game.config().derpyRules() >= 4) {
      // Derpy Front (rules 4+): guard our Domes' land, and raise a Dome
      // over what matters once a foe can nuke us.
      if (this.tryGuardDomes() || this.tryBuildSmartDome()) {
        return true;
      }
    } else if (this.tryBuildDome()) {
      // Derpy Front: once nuked, a rich nation shields what it has with a Dome.
      return true;
    }

    // Defense posts are handled outside the normal pacing/counter system:
    // they don't increment placementsCount or lastStructureTick, and they
    // are never built as the very first structure.
    if (
      this.placementsCount > 0 &&
      !this.game.config().isUnitDisabled(UnitType.DefensePost)
    ) {
      if (this.tryBuildDefensePost()) {
        return true;
      }
      // If the attack threshold is met, block other structures even when
      // placement failed (no tile found / can't afford).
      if (this.defensePostNeeded()) {
        return false;
      }
    }

    if (this.isOnStructureCooldown()) {
      return false;
    }
    if (this.isInPostSaveUpBlockedPhase()) {
      return false;
    }
    // Derpy Front (rules 4+): nothing new while saving for a Dome
    if (this.savingForDome() !== null) {
      return false;
    }
    const built = this.doHandleStructures();
    if (built) {
      this.lastStructureTick = this.game.ticks();
      this.placementsCount++;
    }
    return built;
  }

  /**
   * Derpy Front: protects a finished Capital. Medium and up keep SAM
   * launchers covering it (1 / 2 / 3 by difficulty) so a nuke can't take it
   * out; Hard and up also put a defense post on any attack front that gets
   * close to it, and Impossible stacks that post. Easy leaves it alone.
   */
  private tryProtectCapital(): boolean {
    const capital = this.player
      .units(UnitType.Capital)
      .find((u) => !u.isUnderConstruction());
    if (capital === undefined) return false;
    const { difficulty } = this.game.config().gameConfig();
    return (
      this.tryCoverCapitalWithSams(capital, difficulty) ||
      this.tryGuardCapitalFront(capital, difficulty)
    );
  }

  /**
   * Derpy Front (rules 3+): a nation that has had a nuke sent at it, and
   * holds the price of a Dome of Alden, builds one over what it would most
   * hate to lose that no Dome of its own covers yet. One at a time, up to
   * the limit.
   */
  private tryBuildDome(): boolean {
    const config = this.game.config();
    if (!config.factoryRework() || config.isUnitDisabled(UnitType.Dome)) {
      return false;
    }
    this.noteIncomingNukes();
    if (this.nukedTick === null) return false;
    const domes = this.player.units(UnitType.Dome);
    if (domes.length >= config.domeLimit()) return false;
    if (domes.some((d) => d.isUnderConstruction())) return false;
    if (this.player.gold() < this.cost(UnitType.Dome)) return false;
    for (const tile of this.domeSpots(domes)) {
      if (this.player.canBuild(UnitType.Dome, tile) === false) continue;
      this.game.addExecution(
        new ConstructionExecution(this.player, UnitType.Dome, tile),
      );
      return true;
    }
    return false;
  }

  /** Remembers it if another player's nuke is flying at our land. */
  private noteIncomingNukes(): void {
    const nukes = this.game.units([
      UnitType.AtomBomb,
      UnitType.HydrogenBomb,
      UnitType.MIRV,
      UnitType.MIRVWarhead,
    ]);
    for (const nuke of nukes) {
      if (nuke.owner() === this.player) continue;
      const target = nuke.targetTile();
      if (target !== undefined && this.game.owner(target) === this.player) {
        this.nukedTick = this.game.ticks();
        return;
      }
    }
  }

  /**
   * Where a new Dome would shield the most: our land just beside one of our
   * buildings (a building's own spot is too crowded to build on), scored by
   * the buildings in range that no Dome of ours covers yet (the Capital
   * counts most, then cities by level). Best first, at most five.
   */
  private domeSpots(domes: readonly Unit[]): TileRef[] {
    const game = this.game;
    const range2 = game.config().domeRange() ** 2;
    const covered = (t: TileRef) =>
      domes.some((d) => game.euclideanDistSquared(d.tile(), t) <= range2);
    const assets = this.player
      .units(Structures.types)
      .filter((u) => u.type() !== UnitType.Dome && !covered(u.tile()));
    if (assets.length === 0) return [];
    const worth = (u: Unit): number => {
      switch (u.type()) {
        case UnitType.Capital:
          return 8;
        case UnitType.City:
          return 2 * u.level();
        default:
          return u.level();
      }
    };
    // Beside up to 40 buildings, spread over the list
    const step = Math.max(1, Math.floor(assets.length / 40));
    const gap = game.config().structureMinDist() + 5;
    const candidates: TileRef[] = [];
    for (let i = 0; i < assets.length; i += step) {
      const x = game.x(assets[i].tile());
      const y = game.y(assets[i].tile());
      for (const [dx, dy] of [
        [gap, 0],
        [-gap, 0],
        [0, gap],
        [0, -gap],
      ]) {
        if (!game.isValidCoord(x + dx, y + dy)) continue;
        const t = game.ref(x + dx, y + dy);
        if (game.owner(t) === this.player) candidates.push(t);
      }
    }
    const scored = candidates.map((tile) => {
      let score = 0;
      for (const a of assets) {
        if (game.euclideanDistSquared(tile, a.tile()) <= range2) {
          score += worth(a);
        }
      }
      return { tile, score };
    });
    // Stable sort: on ties the earlier candidate wins
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((s) => s.tile);
  }

  /**
   * Derpy Front (rules 4+): raises a Dome of Alden before the bombs fall.
   * Once a foe can nuke us (it has a silo and a bomb's price, and a reason:
   * it borders us, we fight, we hate each other, or it is a human), Medium
   * and up build one over the most threatened value no Dome of ours covers,
   * if that is worth it and they keep a quarter of the price in hand. Once
   * a nuke has come at us, every difficulty builds one wherever it covers
   * enough, at the bare price. Under a heavy land attack a Dome waits until
   * the nation could pay for it twice, so its land defence comes first.
   * One at a time, a minute apart before we are nuked, at most three then.
   * A nation already holding 60% of the price of its first saves the rest
   * (see savingForDome).
   */
  private tryBuildSmartDome(): boolean {
    const config = this.game.config();
    if (config.isUnitDisabled(UnitType.Dome)) return false;
    const domes = this.player.units(UnitType.Dome);
    if (domes.length >= config.domeLimit()) return false;
    if (domes.some((d) => d.isUnderConstruction())) return false;
    const ticks = this.game.ticks();
    if (this.domeRetryTick !== null && ticks < this.domeRetryTick) {
      return false;
    }
    const nuked = this.nukedTick !== null;
    // AIP (r23): Mad Scientists and Protectors raise more Domes, sooner
    // (rules 6+)
    const aip = playerAiTuning(this.game, this.player);
    if (!nuked) {
      if (config.gameConfig().difficulty === Difficulty.Easy) return false;
      if (!this.nukesPossible()) return false;
      if (domes.length >= aip.preemptiveDomes) return false;
      if (
        this.lastDomeTick !== null &&
        ticks - this.lastDomeTick < (DOME_COOLDOWN_TICKS * aip.domeBarPct) / 100
      ) {
        return false;
      }
    }
    const pressed = this.underLandPressure();
    const needed = this.domePrice(pressed);
    const gold = this.player.gold();
    if (gold < needed) {
      if (
        pressed ||
        domes.length > 0 ||
        config.gameConfig().difficulty === Difficulty.Easy ||
        gold * 10n < needed * DOME_SAVE_FROM_TENTHS ||
        this.savingForDome() !== null ||
        !this.mayStartSaving(ticks)
      ) {
        return false;
      }
      // Most of the way there: save the rest if a Dome is worth it
      if (this.worthyDomeSpot(nuked) !== null) {
        this.domeSavingUntil = ticks + DOME_RETRY_TICKS;
        this.domeSaveStartTick ??= ticks;
      }
      return false;
    }

    const spot = this.worthyDomeSpot(nuked);
    if (spot === null) return false;
    this.game.addExecution(
      new ConstructionExecution(this.player, UnitType.Dome, spot),
    );
    this.lastDomeTick = ticks;
    this.domeRetryTick = null;
    this.domeSavingUntil = null;
    this.domeSaveStartTick = null;
    return true;
  }

  /**
   * Saving for a Dome goes on for at most five minutes, then rests as long,
   * so a nation whose income can't get it there doesn't sit on its gold.
   */
  private mayStartSaving(ticks: number): boolean {
    const start = this.domeSaveStartTick;
    if (start === null || ticks - start < DOME_SAVE_MAX_TICKS) return true;
    if (ticks - start < 2 * DOME_SAVE_MAX_TICKS) return false;
    this.domeSaveStartTick = null;
    return true;
  }

  /**
   * Gold a nation wants in hand to build a Dome: the price after a nuke has
   * come at it, a quarter more before, and the price again on top while a
   * land attack presses it.
   */
  private domePrice(pressed: boolean): Gold {
    const cost = this.cost(UnitType.Dome);
    const price = this.nukedTick !== null ? cost : (cost * 5n) / 4n;
    return pressed ? price + cost : price;
  }

  /**
   * Where a Dome would be worth building now (it newly covers enough of
   * what a foe could nuke), or null; when nothing is, we look again in 30
   * seconds.
   */
  private worthyDomeSpot(nuked: boolean): TileRef | null {
    const threat = this.nukeThreat();
    if (!threatIsReal(threat)) return null;
    const spot = bestDomeSpot(this.game, this.player, threat);
    const barPct = playerAiTuning(this.game, this.player).domeBarPct;
    const minPoints =
      ((nuked ? DOME_MIN_POINTS_NUKED : DOME_MIN_POINTS_PREEMPTIVE) * barPct) /
      100;
    // Scores are points times the threat percent
    if (spot === null || spot.score < minPoints * 100) {
      this.domeRetryTick = this.game.ticks() + DOME_RETRY_TICKS;
      return null;
    }
    return spot.tile;
  }

  /**
   * Derpy Front (rules 4+): the gold we are holding for a Dome, or null if
   * we aren't saving for one. A nation of Medium or up with no Dome yet
   * that holds 60% of a worthwhile Dome's price, and no land attack
   * presses, saves the rest: it starts no new buildings (defense posts and
   * its Capital's SAMs still go up), and holds the bombs that would cut
   * into the price unless it is being overrun (NationNukeBehavior). The
   * decision lasts 30 seconds and is then looked at again, for at most five
   * minutes out of ten.
   */
  savingForDome(): Gold | null {
    if (
      this.domeSavingUntil === null ||
      this.game.ticks() >= this.domeSavingUntil ||
      this.game.config().derpyRules() < 4
    ) {
      return null;
    }
    return this.domePrice(false);
  }

  /** Whether anyone in this game could build a silo and fire a nuke. */
  private nukesPossible(): boolean {
    const config = this.game.config();
    return (
      !config.isUnitDisabled(UnitType.MissileSilo) &&
      (!config.isUnitDisabled(UnitType.AtomBomb) ||
        !config.isUnitDisabled(UnitType.HydrogenBomb) ||
        !config.isUnitDisabled(UnitType.MIRV))
    );
  }

  /**
   * Derpy Front (rules 4+): remembers every foe's nuke flying at our land,
   * and where it was aimed, for a few minutes.
   */
  private noteNukesAtUs(): void {
    const ticks = this.game.ticks();
    this.nukeImpacts = this.nukeImpacts.filter(
      ([tick]) => ticks - tick <= NUKE_IMPACT_MEMORY_TICKS,
    );
    const nukes = this.game.units([
      UnitType.AtomBomb,
      UnitType.HydrogenBomb,
      UnitType.MIRV,
      UnitType.MIRVWarhead,
    ]);
    for (const nuke of nukes) {
      if (nuke.owner() === this.player) continue;
      const target = nuke.targetTile();
      if (target === undefined || this.game.owner(target) !== this.player) {
        continue;
      }
      this.nukedTick = ticks;
      if (this.nukeImpacts.some(([, t]) => t === target)) continue;
      this.nukeImpacts.push([ticks, target]);
      if (this.nukeImpacts.length > NUKE_IMPACT_MEMORY) {
        this.nukeImpacts.shift();
      }
    }
  }

  /** Derpy Front (rules 4+): the nuclear threat to us right now. */
  private nukeThreat(): NukeThreat {
    return readNukeThreat(
      this.game,
      this.player,
      this.nukedTick !== null,
      this.nukeImpacts.map(([, tile]) => tile),
    );
  }

  /** Incoming land attacks at least this share of our troops. */
  private underLandPressure(): boolean {
    const ourTroops = this.player.troops();
    if (ourTroops <= 0) return false;
    let incoming = 0;
    for (const a of this.player.incomingAttacks()) {
      if (a.sourceTile() === null) incoming += a.troops();
    }
    return incoming / ourTroops >= UNDER_ATTACK_THREAT_RATIO;
  }

  /**
   * Derpy Front (rules 4+): a Dome is taken with its land, so on Hard and
   * up a land attack that gets within half its range of one of our Domes
   * meets a defense post (stacked on Impossible), as at the Capital.
   */
  private tryGuardDomes(): boolean {
    const config = this.game.config();
    const { difficulty } = config.gameConfig();
    if (
      difficulty !== Difficulty.Hard &&
      difficulty !== Difficulty.Impossible
    ) {
      return false;
    }
    if (config.isUnitDisabled(UnitType.DefensePost)) return false;
    const domes = this.player
      .units(UnitType.Dome)
      .filter((d) => !d.isUnderConstruction());
    if (domes.length === 0) return false;
    const landAttacks = this.player
      .incomingAttacks()
      .filter((a) => a.sourceTile() === null);
    if (landAttacks.length === 0) return false;
    const front = this.getAttackFrontTiles(landAttacks);
    const guard = Math.floor(config.domeRange() / 2);
    for (const dome of domes) {
      if (this.guardFront(dome.tile(), guard, front, difficulty)) return true;
    }
    return false;
  }

  private tryCoverCapitalWithSams(capital: Unit, difficulty: Difficulty) {
    const wanted = CAPITAL_GUARD_SAMS[difficulty];
    const config = this.game.config();
    const nukesEnabled =
      !config.isUnitDisabled(UnitType.AtomBomb) ||
      !config.isUnitDisabled(UnitType.HydrogenBomb) ||
      !config.isUnitDisabled(UnitType.MIRV);
    if (
      wanted === 0 ||
      !nukesEnabled ||
      config.isUnitDisabled(UnitType.SAMLauncher)
    ) {
      return false;
    }
    const game = this.game;
    // A SAM well inside its range of the Capital counts as covering it.
    const reach = Math.floor((config.defaultSamRange() * 3) / 4);
    const covering = this.player
      .units(UnitType.SAMLauncher)
      .filter(
        (sam) =>
          game.euclideanDistSquared(sam.tile(), capital.tile()) <=
          reach * reach,
      ).length;
    if (covering >= wanted) return false;
    if (this.player.gold() < this.cost(UnitType.SAMLauncher)) return false;

    // Spread the guards around the Capital, inside half the SAM's range.
    const radius = Math.floor(config.defaultSamRange() / 2);
    const cx = game.x(capital.tile());
    const cy = game.y(capital.tile());
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = this.random.nextInt(cx - radius, cx + radius + 1);
      const y = this.random.nextInt(cy - radius, cy + radius + 1);
      if (!game.isValidCoord(x, y)) continue;
      const tile = game.ref(x, y);
      if (game.owner(tile) !== this.player) continue;
      if (!this.player.canBuild(UnitType.SAMLauncher, tile)) continue;
      game.addExecution(
        new ConstructionExecution(this.player, UnitType.SAMLauncher, tile),
      );
      return true;
    }
    return false;
  }

  private tryGuardCapitalFront(capital: Unit, difficulty: Difficulty) {
    if (
      difficulty !== Difficulty.Hard &&
      difficulty !== Difficulty.Impossible
    ) {
      return false;
    }
    const config = this.game.config();
    if (config.isUnitDisabled(UnitType.DefensePost)) return false;
    const landAttacks = this.player
      .incomingAttacks()
      .filter((a) => a.sourceTile() === null);
    if (landAttacks.length === 0) return false;

    return this.guardFront(
      capital.tile(),
      config.capitalDefenseRange() + 40,
      this.getAttackFrontTiles(landAttacks),
      difficulty,
    );
  }

  /**
   * Puts a defense post on the part of an attack front within `guard` of
   * `center`, or on Impossible upgrades the one already there.
   */
  private guardFront(
    center: TileRef,
    guard: number,
    attackFront: TileRef[],
    difficulty: Difficulty,
  ): boolean {
    const config = this.game.config();
    const game = this.game;
    const front = attackFront.filter(
      (t) => game.euclideanDistSquared(t, center) <= guard * guard,
    );
    if (front.length === 0) return false;

    if (this.countDefensePostsNearFront(front, 1) >= 1) {
      // Impossible stacks the post guarding this front.
      if (difficulty !== Difficulty.Impossible) return false;
      const { borderSpacing } = this.spacingConstants();
      const near = (borderSpacing * 3) / 2;
      const post = this.player
        .units(UnitType.DefensePost)
        .find(
          (dp) =>
            !dp.isUnderConstruction() &&
            dp.level() <
              (config.unitInfo(UnitType.DefensePost).maxLevel ?? 1) &&
            front.some(
              (t) => game.euclideanDistSquared(dp.tile(), t) <= near * near,
            ),
        );
      if (
        post === undefined ||
        this.player.gold() < this.cost(UnitType.DefensePost) ||
        this.player.canUpgradeUnit(post) === false
      ) {
        return false;
      }
      game.addExecution(new UpgradeStructureExecution(this.player, post.id()));
      return true;
    }

    if (this.player.gold() < this.cost(UnitType.DefensePost)) return false;
    for (const tile of this.sampleTilesNearFront(
      front,
      25,
      UnitType.DefensePost,
    )) {
      if (!this.player.canBuild(UnitType.DefensePost, tile)) continue;
      game.addExecution(
        new ConstructionExecution(this.player, UnitType.DefensePost, tile),
      );
      return true;
    }
    return false;
  }

  /**
   * Tries to place one defense post near an active land-attack front.
   * Not called on Easy. Medium: 50% chance per call, 1 post total. Hard/Impossible:
   * ceil(ratio / 0.4) posts total. Boat attacks (sourceTile != null) are ignored.
   * Does not touch placementsCount or lastStructureTick.
   */
  private tryBuildDefensePost(): boolean {
    const { difficulty } = this.game.config().gameConfig();
    if (difficulty === Difficulty.Easy) return false;
    // AIP (r23): a Protector (rules 6+) wants twice the posts: on Medium
    // that's two, every time it looks
    const postsPct = playerAiTuning(this.game, this.player).defensePostsPct;
    if (
      difficulty === Difficulty.Medium &&
      postsPct <= 100 &&
      !this.random.chance(2)
    )
      return false;

    const player = this.player;
    const landAttacks = player
      .incomingAttacks()
      .filter((a) => a.sourceTile() === null);
    if (landAttacks.length === 0) return false;

    const ourTroops = player.troops();
    if (ourTroops <= 0) return false;

    const incomingTroops = landAttacks.reduce((sum, a) => sum + a.troops(), 0);
    const ratio = incomingTroops / ourTroops;
    if (ratio < this.defenseThreatRatio()) return false;

    let allowed: number;
    if (difficulty === Difficulty.Medium) {
      allowed = 1;
    } else {
      allowed = Math.ceil(ratio / DEFENSE_POST_RATIO_PER_POST);
    }
    if (postsPct !== 100) {
      allowed = Math.max(1, Math.round((allowed * postsPct) / 100));
    }

    const frontTiles = this.getAttackFrontTiles(landAttacks);
    if (this.countDefensePostsNearFront(frontTiles, allowed) >= allowed)
      return false;

    const cost = this.cost(UnitType.DefensePost);
    if (player.gold() < cost) return false;

    const tiles = this.sampleTilesNearFront(
      frontTiles,
      25,
      UnitType.DefensePost,
    );
    for (const tile of tiles) {
      if (!player.canBuild(UnitType.DefensePost, tile)) continue;
      this.game.addExecution(
        new ConstructionExecution(player, UnitType.DefensePost, tile),
      );
      return true;
    }
    return false;
  }

  private defensePostNeeded(): boolean {
    const { difficulty } = this.game.config().gameConfig();
    if (difficulty === Difficulty.Easy) return false;
    const landAttacks = this.player
      .incomingAttacks()
      .filter((a) => a.sourceTile() === null);
    if (landAttacks.length === 0) return false;
    const ourTroops = this.player.troops();
    if (ourTroops <= 0) return false;
    const incomingTroops = landAttacks.reduce((sum, a) => sum + a.troops(), 0);
    return incomingTroops / ourTroops >= this.defenseThreatRatio();
  }

  /**
   * DFSTORE (r21): the incoming-troops share that calls for defense posts,
   * lower for a turtle persona (rules 5+).
   */
  private defenseThreatRatio(): number {
    const ratio =
      UNDER_ATTACK_THREAT_RATIO *
      nationTemperament(this.game, this.player).defenseThreat;
    // AIP (r23): a Protector calls for posts at a smaller attack (rules 6+)
    const pct = playerAiTuning(this.game, this.player).defenseThreatPct;
    return pct === 100 ? ratio : (ratio * pct) / 100;
  }

  /**
   * Returns our border tiles that are adjacent to a tile owned by any of the
   * attacking players.
   */
  private getAttackFrontTiles(landAttacks: Attack[]): TileRef[] {
    const game = this.game;
    const player = this.player;
    const attackerSet = new Set(landAttacks.map((a) => a.attacker()));
    if (attackerSet.size === 0) return [];

    // Set.forEach + a reused neighbor buffer: border sets are huge, and
    // for..of over a Set allocates an iterator-result object per element.
    // "Any neighbor is an attacker" is order-insensitive.
    const frontTiles: TileRef[] = [];
    const nbuf = NEIGHBOR_SCRATCH;
    player.borderTiles().forEach((borderTile) => {
      const n = game.neighbors4(borderTile, nbuf);
      for (let i = 0; i < n; i++) {
        const owner = game.owner(nbuf[i]);
        if (attackerSet.has(owner as Player)) {
          frontTiles.push(borderTile);
          return;
        }
      }
    });
    return frontTiles;
  }

  /**
   * Counts defense posts within 1.5 × borderSpacing of any front tile.
   * `cap` short-circuits the scan once that many are found.
   */
  private countDefensePostsNearFront(
    frontTiles: TileRef[],
    cap?: number,
  ): number {
    if (frontTiles.length === 0) return 0;

    const game = this.game;
    const { borderSpacing } = this.spacingConstants();
    const rangeSquared = (borderSpacing * 1.5) ** 2;

    let count = 0;
    for (const dp of this.player.units(UnitType.DefensePost)) {
      for (const frontTile of frontTiles) {
        if (game.euclideanDistSquared(dp.tile(), frontTile) <= rangeSquared) {
          count++;
          if (cap !== undefined && count >= cap) return count;
          break;
        }
      }
    }
    return count;
  }

  /**
   * Samples territory tiles for defense-post placement, using the full attack
   * front as anchors. Only tiles where canBuild passes are collected.
   * Anchors near existing defense posts are filtered out first so successive
   * posts spread along the front rather than clustering together.
   *
   * Phase 1: tiles at depth [0.75×, 1.5×] borderSpacing from any border.
   * Fallback 1: relax depth constraint (territory smaller than borderSpacing).
   * Fallback 2: pure random territory sampling (canBuild checked by caller).
   */
  private sampleTilesNearFront(
    frontTiles: TileRef[],
    count: number,
    unitType: UnitType,
  ): TileRef[] {
    const game = this.game;
    const player = this.player;

    if (frontTiles.length === 0) {
      return [];
    }

    const { borderSpacing } = this.spacingConstants();
    const searchRadius = Math.ceil(borderSpacing * 1.5);
    const minBorderDist = Math.ceil(borderSpacing * 0.75);
    const maxBorderDist = Math.ceil(borderSpacing * 1.5);
    const borderTiles = player.borderTiles();

    // Spread: prefer front tiles far from existing defense posts so successive
    // posts don't cluster at the same spot along the attack line.
    const spreadRangeSquared = (borderSpacing * 1.5) ** 2;
    const existingDPTiles = player
      .units(UnitType.DefensePost)
      .map((u) => u.tile());

    let anchors: TileRef[];
    if (existingDPTiles.length > 0) {
      anchors = frontTiles.filter(
        (ft) =>
          !existingDPTiles.some(
            (dp) => game.euclideanDistSquared(ft, dp) < spreadRangeSquared,
          ),
      );
      if (anchors.length === 0) anchors = frontTiles;
    } else {
      anchors = frontTiles;
    }

    const result: TileRef[] = [];
    for (
      let attempt = 0;
      attempt < count * 6 && result.length < count;
      attempt++
    ) {
      const anchor = this.random.randElement(anchors);
      const ax = game.x(anchor);
      const ay = game.y(anchor);
      const x = this.random.nextInt(ax - searchRadius, ax + searchRadius + 1);
      const y = this.random.nextInt(ay - searchRadius, ay + searchRadius + 1);
      if (!game.isValidCoord(x, y)) continue;
      const t = game.ref(x, y);
      if (game.owner(t) !== player) continue;
      // Only "inside [min, max]" matters, so the search is capped at max.
      const borderDist = nearestTileDistCapped(
        game,
        borderTiles,
        t,
        maxBorderDist,
      );
      if (borderDist < minBorderDist || borderDist > maxBorderDist) continue;
      if (!player.canBuild(unitType, t)) continue;
      result.push(t);
    }

    if (result.length > 0) return result;

    // Fallback: relax border-depth constraint (territory too small for depth ring)
    const fallback: TileRef[] = [];
    for (
      let attempt = 0;
      attempt < count * 4 && fallback.length < count;
      attempt++
    ) {
      const anchor = this.random.randElement(anchors);
      const ax = game.x(anchor);
      const ay = game.y(anchor);
      const x = this.random.nextInt(ax - searchRadius, ax + searchRadius + 1);
      const y = this.random.nextInt(ay - searchRadius, ay + searchRadius + 1);
      if (!game.isValidCoord(x, y)) continue;
      const t = game.ref(x, y);
      if (game.owner(t) !== player) continue;
      fallback.push(t);
    }

    return fallback;
  }

  private isOnStructureCooldown(): boolean {
    // Only high-starting-gold nations pause
    if (this.lastStructureTick === null || !this.hasHighStartingGold()) {
      return false;
    }
    const requiredGap =
      HIGH_GOLD_STRUCTURE_COOLDOWN_TICKS[this.placementsCount] ?? 0;
    if (requiredGap === 0) {
      return false;
    }
    return this.game.ticks() - this.lastStructureTick < requiredGap;
  }

  // Spreads placements after the save-up target is first reached:
  // 15s ON / 15s OFF, alternating, to allow NationNukeBehavior to spend the gold.
  private isInPostSaveUpBlockedPhase(): boolean {
    if (this.game.config().isUnitDisabled(UnitType.MissileSilo)) {
      return false;
    }
    const saveUpTarget = this.getSaveUpTarget();
    if (this._postSaveUpStartTick === null) {
      if (this.player.gold() < saveUpTarget) {
        return false;
      }
      this._postSaveUpStartTick = this.game.ticks();
    }
    const elapsed = this.game.ticks() - this._postSaveUpStartTick;
    return (
      elapsed % (TEAM_POST_SAVE_UP_PHASE_TICKS * 2) >=
      TEAM_POST_SAVE_UP_PHASE_TICKS
    );
  }

  private doHandleStructures(): boolean {
    this.reachableStationsCache = null;
    const config = this.game.config();
    const citiesDisabled = config.isUnitDisabled(UnitType.City);
    const cityCount = this.cityCount();
    this._sharedWaterComponents = this.game.sharedWaterComponents(this.player);
    const hasCoastalTiles = this._sharedWaterComponents !== null;

    const missileSilosEnabled = !config.isUnitDisabled(UnitType.MissileSilo);

    // High-starting-gold Hard/Impossible nations build a SAM first so their
    // next structures get SAM coverage and aren't clustered under the same nuke target.
    const { difficulty } = config.gameConfig();
    if (
      this.placementsCount === 0 &&
      (difficulty === Difficulty.Hard ||
        difficulty === Difficulty.Impossible) &&
      !config.isUnitDisabled(UnitType.AtomBomb) &&
      missileSilosEnabled &&
      !config.isUnitDisabled(UnitType.SAMLauncher) &&
      this.hasHighStartingGold() &&
      this.maybeSpawnStructure(UnitType.SAMLauncher)
    ) {
      return true;
    }

    // On crowded maps, and when teams start apart in their own spawn areas (not on Easy),
    // the first structure is a port (or factory if landlocked) instead of a city, so nations
    // can get income earlier. Crowded maps are mainly private 200+ nation HvN games.
    // Own one-shot flag, set only on success: unitsOwned(City) never clears
    // (starves cities forever) and placementsCount can get consumed by the
    // SAM-first branch above.
    if (
      !citiesDisabled &&
      !this.builtCrowdedMapFirstStructure &&
      (this.isHighNationDensity() ||
        (difficulty !== Difficulty.Easy && this.startsInTeamSpawnArea()))
    ) {
      const preferredFirst =
        hasCoastalTiles && !config.isUnitDisabled(UnitType.Port)
          ? UnitType.Port
          : UnitType.Factory;
      if (config.isUnitDisabled(preferredFirst)) {
        this.builtCrowdedMapFirstStructure = true;
      } else if (this.maybeSpawnStructure(preferredFirst)) {
        this.builtCrowdedMapFirstStructure = true;
        return true;
      }
    }

    // Capital (one per player): once the first city stands, it comes before
    // everything else, since its gold, troops and defense all pay off
    // immediately. It goes up as soon as the nation holds its full price,
    // which nations reach once they start saving after their first cities.
    if (
      (citiesDisabled || cityCount >= CITIES_BEFORE_CAPITAL) &&
      !config.isUnitDisabled(UnitType.Capital) &&
      this.player.units(UnitType.Capital).length === 0 &&
      this.maybeSpawnStructure(UnitType.Capital)
    ) {
      return true;
    }

    // Build order for non-city structures (priority order)
    const buildOrder: UnitType[] = [
      UnitType.Port,
      UnitType.Factory,
      UnitType.SAMLauncher,
      UnitType.MissileSilo,
    ];

    const nukesEnabled =
      !config.isUnitDisabled(UnitType.AtomBomb) ||
      !config.isUnitDisabled(UnitType.HydrogenBomb) ||
      !config.isUnitDisabled(UnitType.MIRV);

    for (const structureType of buildOrder) {
      // Skip disabled structure types
      if (config.isUnitDisabled(structureType)) {
        continue;
      }

      // Skip ports if no coastal tiles
      if (structureType === UnitType.Port && !hasCoastalTiles) {
        continue;
      }

      // Skip missile silos and SAM launchers if all nukes are disabled
      if (
        !nukesEnabled &&
        (structureType === UnitType.MissileSilo ||
          structureType === UnitType.SAMLauncher)
      ) {
        continue;
      }

      // Skip SAM launchers if missile silos are disabled
      if (!missileSilosEnabled && structureType === UnitType.SAMLauncher) {
        continue;
      }

      if (
        this.shouldBuildStructure(structureType, cityCount, hasCoastalTiles)
      ) {
        if (this.maybeSpawnStructure(structureType)) {
          return true;
        }
      }
    }

    if (!citiesDisabled && this.maybeSpawnStructure(UnitType.City)) {
      return true;
    }

    return false;
  }

  // Cities owned, or a territory-based equivalent when cities are disabled
  private cityCount(): number {
    if (this.game.config().isUnitDisabled(UnitType.City)) {
      return Math.max(
        1,
        Math.floor(this.player.numTilesOwned() / TILES_PER_CITY_EQUIVALENT),
      );
    }
    return this.player.unitsOwned(UnitType.City);
  }

  private startsInTeamSpawnArea(): boolean {
    const team = this.player.team();
    return team !== null && this.game.teamSpawnArea(team) !== undefined;
  }

  private hasHighStartingGold(): boolean {
    this._hasHighStartingGold ??=
      this.game.config().startingGold(this.player.info()) >=
      HIGH_STARTING_GOLD_THRESHOLD;
    return this._hasHighStartingGold;
  }

  private isHighNationDensity(): boolean {
    const landTiles = this.game.numLandTiles();
    if (landTiles <= 0) return false;
    return (
      this.game.nations().length / landTiles > HIGH_NATION_DENSITY_THRESHOLD
    );
  }

  /**
   * Determines if we should build more of this structure type based on
   * the current city count and the configured ratio.
   */
  private shouldBuildStructure(
    type: UnitType,
    cityCount: number,
    hasCoastalTiles: boolean,
  ): boolean {
    const gameConfig = this.game.config();
    const { difficulty } = gameConfig.gameConfig();
    const ratios = getStructureRatios(difficulty);
    const config = ratios[type];
    if (config === undefined) {
      return false;
    }

    // DFSTORE (r21): a persona's temperament leans what it builds (rules 5).
    const tuning = nationTemperament(this.game, this.player);
    let ratio = config.ratioPerCity * (tuning.structures[type] ?? 1);
    // AIP (r23): and so does a personality (rules 6+)
    const aip = playerAiTuning(this.game, this.player);
    const pct = aip.structuresPct[type];
    if (pct !== undefined) ratio = (ratio * pct) / 100;

    // Heavily reduce factory spawning if we have coastal tiles
    if (
      type === UnitType.Factory &&
      hasCoastalTiles &&
      !gameConfig.isUnitDisabled(UnitType.Port)
    ) {
      ratio *= FACTORY_COASTAL_RATIO_MULTIPLIER;
    }

    const owned = this.player.unitsOwned(type);

    // Hard cap on missile silos
    const maxSilos =
      tuning !== NO_TEMPERAMENT
        ? tuning.maxSilos
        : aip.maxSilos !== MAX_MISSILE_SILOS
          ? aip.maxSilos
          : MAX_MISSILE_SILOS;
    if (type === UnitType.MissileSilo && owned >= maxSilos) {
      return false;
    }

    // First missile silo uses a higher ratio so nations can start nuking earlier
    if (type === UnitType.MissileSilo && owned === 0) {
      ratio =
        tuning !== NO_TEMPERAMENT
          ? tuning.firstSiloRatio
          : aip.firstSiloPct !== FIRST_MISSILE_SILO_PERCENT
            ? aip.firstSiloPct / 100
            : FIRST_MISSILE_SILO_RATIO;
    }

    const targetCount = Math.floor(cityCount * ratio);

    return owned < targetCount;
  }

  private cost(type: UnitType): Gold {
    return this.game.unitInfo(type).cost(this.game, this.player);
  }

  private maybeSpawnStructure(type: UnitType): boolean {
    const game = this.game;
    const perceivedCost = this.getPerceivedCost(type);
    if (this.player.gold() < perceivedCost) {
      return false;
    }

    // Check if we should upgrade instead of building new
    const structures = this.player.units(type);
    if (
      this.getTotalStructureDensity() > UPGRADE_DENSITY_THRESHOLD &&
      game.config().unitInfo(type).upgradable
    ) {
      if (this.maybeUpgradeStructure(structures)) {
        return true;
      }
      // Density too high but couldn't upgrade (e.g. all under construction) — don't build new, wait for construction (most relevant for SAMs)
      if (structures.length > 0) {
        return false;
      }
      // No structures of this type exist yet — fall through to build the first one
      // (even if density is high - the nation is probably on a tiny island and we need to use all building spots we can find)
    }

    const tile = this.structureSpawnTile(type);
    if (tile === null) {
      return false;
    }
    const canBuild = this.player.canBuild(type, tile);
    if (canBuild === false) {
      return false;
    }
    game.addExecution(new ConstructionExecution(this.player, type, tile));
    return true;
  }

  /**
   * Calculates the perceived cost for a structure type.
   * The perceived cost increases by a percentage for each structure of that type already owned.
   * This makes nations save up gold for nukes.
   * Once the nation can afford its target stockpile, stop inflating costs.
   */
  private getPerceivedCost(type: UnitType): Gold {
    const realCost = this.cost(type);

    const saveUpTarget = this.getSaveUpTarget();
    if (saveUpTarget === 0n || this.player.gold() >= saveUpTarget) {
      return realCost;
    }

    // Like humans, nations don't save up before their first few cities stand. The build order
    // still holds: until then, whatever is due before the next city is cheaper than that city.
    if (
      this.cityCount() < CITIES_BEFORE_SAVING &&
      this.game.config().gameConfig().difficulty !== Difficulty.Easy
    ) {
      return realCost;
    }

    const owned = this.player.unitsOwned(type);

    let increasePerOwned: number;
    if (type === UnitType.City) {
      increasePerOwned = CITY_PERCEIVED_COST_INCREASE_PER_OWNED;
      // AIP (r23): Aggressive and Protector nations put more into cities
      // (rules 6+)
      const pct = playerAiTuning(this.game, this.player).cityCostPct;
      if (pct !== 100) increasePerOwned = (increasePerOwned * pct) / 100;
    } else {
      const { difficulty } = this.game.config().gameConfig();
      const ratios = getStructureRatios(difficulty);
      const config = ratios[type];
      increasePerOwned = config?.perceivedCostIncreasePerOwned ?? 0.1;
    }

    // Each owned structure makes the next one feel more expensive
    // Formula: realCost * (1 + increasePerOwned * owned)
    const multiplier = 1 + increasePerOwned * owned;
    return BigInt(Math.ceil(Number(realCost) * multiplier));
  }

  /**
   * Determines the gold target we want to save up for based on which nukes are enabled.
   * Returns 0 if no saving is needed.
   */
  private getSaveUpTarget(): Gold {
    const config = this.game.config();

    // Just save up for SAMs if missile silos are disabled
    if (config.isUnitDisabled(UnitType.MissileSilo)) {
      return this.cost(UnitType.SAMLauncher);
    }

    // Save up a limited amount in team games, synced with NationNukeBehavior
    // Saving up for a MIRV is not relevant
    if (this.game.config().gameConfig().gameMode === GameMode.Team) {
      return this.cost(UnitType.HydrogenBomb);
    }

    const mirvEnabled = !config.isUnitDisabled(UnitType.MIRV);
    const hydroEnabled = !config.isUnitDisabled(UnitType.HydrogenBomb);
    const atomEnabled = !config.isUnitDisabled(UnitType.AtomBomb);

    if (mirvEnabled) {
      // Save up for MIRV + Hydrogen Bomb
      return this.cost(UnitType.MIRV) + this.cost(UnitType.HydrogenBomb);
    }
    if (hydroEnabled) {
      // Save up for 5 hydrogen bombs
      return this.cost(UnitType.HydrogenBomb) * 5n;
    }
    if (atomEnabled) {
      // Save up for 20 atom bombs
      return this.cost(UnitType.AtomBomb) * 20n;
    }
    // No nukes enabled, just save up for SAMs
    return this.cost(UnitType.SAMLauncher);
  }

  /**
   * Tries to upgrade an existing structure if density threshold is exceeded.
   * @param structures The pool of structures to consider for upgrading
   * @returns true if an upgrade was initiated, false otherwise
   */
  private maybeUpgradeStructure(structures: Unit[]): boolean {
    if (this.getTotalStructureDensity() <= UPGRADE_DENSITY_THRESHOLD) {
      return false;
    }
    if (structures.length === 0) {
      return false;
    }
    const structureToUpgrade = this.findBestStructureToUpgrade(structures);
    if (structureToUpgrade !== null) {
      //canUpgradeUnit already checked in findBestStructureToUpgrade and again in UpgradeStructureExecution
      this.game.addExecution(
        new UpgradeStructureExecution(this.player, structureToUpgrade.id()),
      );
      return true;
    }
    return false;
  }

  /**
   * Calculates total structure density across player's territory.
   */
  private getTotalStructureDensity(): number {
    const tilesOwned = this.player.numTilesOwned();
    return tilesOwned > 0
      ? this.player.units(Structures.types).length / tilesOwned
      : 0; //ignoring levels for structures
  }

  /**
   * Finds the best structure to upgrade, preferring structures protected by a SAM.
   * In 50% of cases, picks the second or third best to add variety.
   */
  private findBestStructureToUpgrade(structures: Unit[]): Unit | null {
    const game = this.game;
    if (structures.length === 0) {
      return null;
    }

    // Filter to only upgradable structures
    const upgradable = structures.filter((s) => this.player.canUpgradeUnit(s));
    if (upgradable.length === 0) {
      return null;
    }

    // Based on difficulty, chance to just pick a random structure
    const { difficulty } = game.config().gameConfig();
    let randomChance: number;
    switch (difficulty) {
      case Difficulty.Easy:
        randomChance = 70;
        break;
      case Difficulty.Medium:
        randomChance = 40;
        break;
      case Difficulty.Hard:
        randomChance = 25;
        break;
      case Difficulty.Impossible:
        randomChance = 10;
        break;
      default:
        assertNever(difficulty);
    }

    if (this.random.nextInt(0, 100) < randomChance) {
      return this.random.randElement(upgradable);
    }

    const samLaunchers = this.player.units(UnitType.SAMLauncher);
    // Derpy Front (rules 4+): under a real nuclear threat, prefer to grow
    // what our Domes shield.
    const shelters = this.upgradeShelters();

    // Score each structure based on SAM protection
    const scored: { structure: Unit; score: number }[] = [];

    for (const structure of upgradable) {
      let score = 0;

      // Check if protected by any SAM, using per-SAM level-based range
      for (const sam of samLaunchers) {
        const samRange = game.config().samRange(sam.level());
        const samRangeSquared = samRange * samRange;
        const distSquared = game.euclideanDistSquared(
          structure.tile(),
          sam.tile(),
        );
        if (distSquared <= samRangeSquared) {
          // Protected by this SAM, add score based on SAM level
          score += 10;
          if (sam.level() > 1) {
            score += (sam.level() - 1) * 7.5;
          }
        }
      }

      if (
        shelters.some(
          (d) => game.euclideanDistSquared(d, structure.tile()) <= shelters.r2,
        )
      ) {
        score += SHELTERED_UPGRADE_SCORE;
      }

      // Add small random factor to break ties
      score += this.random.nextInt(0, 5);

      scored.push({ structure, score });
    }

    if (scored.length === 0) {
      return null;
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // 50% of the time, pick the second or third best for variety
    if (scored.length >= 2 && this.random.chance(2)) {
      const pickIndex =
        scored.length >= 3
          ? this.random.nextInt(1, 3) // pick index 1 or 2
          : 1; // only index 1 available
      return scored[pickIndex].structure;
    }

    return scored[0].structure;
  }

  /**
   * Derpy Front (rules 4+): our finished Domes' tiles when a foe can nuke us
   * (none otherwise), with their range squared.
   */
  private upgradeShelters(): TileRef[] & { r2: number } {
    const config = this.game.config();
    const none = Object.assign([] as TileRef[], { r2: 0 });
    if (config.derpyRules() < 4) return none;
    const domes = this.player
      .units(UnitType.Dome)
      .filter((d) => !d.isUnderConstruction())
      .map((d) => d.tile());
    if (domes.length === 0 || !threatIsReal(this.nukeThreat())) return none;
    return Object.assign(domes, { r2: config.domeRange() ** 2 });
  }

  private structureSpawnTile(type: UnitType): TileRef | null {
    // Derpy Front: a strategic Capital looks at more spots and scores them
    // for safety instead of like a city.
    const strategicCapital =
      type === UnitType.Capital && this.placesCapitalStrategically();
    const samples = strategicCapital ? CAPITAL_STRATEGIC_SAMPLES : 25;
    const coastal = type === UnitType.Port ? this.coastalTiles() : [];
    let tiles =
      type === UnitType.Port
        ? Array.from(this.arraySampler(coastal, samples))
        : randTerritoryTileArray(this.random, this.game, this.player, samples);
    // Derpy Front (rules 4+): under a real nuclear threat, also look under
    // our Domes, first, so a tie goes to the sheltered spot.
    const shelter = this.shelter(type, coastal);
    if (shelter !== null) tiles = shelter.tiles.concat(tiles);
    if (tiles.length === 0) return null;
    const baseValue = strategicCapital
      ? this.strategicCapitalValue()
      : this.structureSpawnTileValue(type);
    if (baseValue === null) return null;
    const valueFunction =
      shelter === null
        ? baseValue
        : (t: TileRef) => baseValue(t) + shelter.bonus(t);
    let bestTile: TileRef | null = null;
    let bestValue = 0;
    for (const t of tiles) {
      const v = valueFunction(t);
      if (v <= bestValue && bestTile !== null) continue;
      if (!this.player.canBuild(type, t)) continue;
      // Found a better tile
      bestTile = t;
      bestValue = v;
    }
    return bestTile;
  }

  /** Shore tiles adjacent to water reachable by another player (=> trading possible) */
  private coastalTiles(): TileRef[] {
    const shared = this._sharedWaterComponents;
    return Array.from(this.player.borderTiles()).filter((t) => {
      if (!this.game.isShore(t)) return false;
      if (shared === null) return false;
      for (const neighbor of this.game.neighbors(t)) {
        if (!this.game.isWater(neighbor)) continue;
        // Ocean is always considered shared, so any ocean neighbor makes the
        // tile a valid port site — skip the component lookup.
        if (this.game.isOcean(neighbor)) return true;
        const comp = this.game.getWaterComponent(neighbor);
        if (comp === null || !shared.has(comp)) continue;
        // Skip tiny lakes that are too small for meaningful port use (not on Easy).
        const { difficulty } = this.game.config().gameConfig();
        if (difficulty !== Difficulty.Easy) {
          const size = this.game.getWaterComponentSize(neighbor);
          if (size !== null && size < MIN_PORT_WATER_COMPONENT_SIZE) continue;
        }
        return true;
      }
      return false;
    });
  }

  /**
   * Derpy Front (rules 4+): when a foe can nuke us and we have finished
   * Domes, where to also look for a new city, port, factory, silo or SAM:
   * spots well inside our Domes (shore spots for a port), and a bonus for a
   * spot under one, worth a structure spacing, that fades with each
   * building of the type the Dome already covers (to half at four), so the
   * type spreads over our Domes instead of piling up. The usual spacing
   * from buildings of the same type still counts.
   * Null when none of that applies.
   */
  private shelter(
    type: UnitType,
    coastal: readonly TileRef[],
  ): { tiles: TileRef[]; bonus: (t: TileRef) => number } | null {
    const game = this.game;
    if (game.config().derpyRules() < 4 || !SHELTERED_TYPES.has(type)) {
      return null;
    }
    const domes = this.player
      .units(UnitType.Dome)
      .filter((d) => !d.isUnderConstruction())
      .map((d) => d.tile());
    if (domes.length === 0) return null;
    if (!threatIsReal(this.nukeThreat())) return null;

    const range = game.config().domeRange();
    const range2 = range * range;
    const inside = (t: TileRef) =>
      domes.some((d) => game.euclideanDistSquared(d, t) <= range2);
    // How many of this type each Dome already covers
    const crowd = domes.map(
      (d) =>
        this.player
          .units(type)
          .filter((u) => game.euclideanDistSquared(d, u.tile()) <= range2)
          .length,
    );

    let tiles: TileRef[];
    if (type === UnitType.Port) {
      tiles = Array.from(
        this.arraySampler(coastal.filter(inside), SHELTER_SAMPLES),
      );
    } else {
      // Well inside, so the build spot a few tiles off still falls under it
      const r = Math.floor((range * 4) / 5);
      tiles = [];
      for (let i = 0; i < SHELTER_SAMPLES; i++) {
        const d = this.random.randElement(domes);
        const x = game.x(d) + this.random.nextInt(-r, r + 1);
        const y = game.y(d) + this.random.nextInt(-r, r + 1);
        if (!game.isValidCoord(x, y)) continue;
        const t = game.ref(x, y);
        if (game.euclideanDistSquared(d, t) > r * r) continue;
        if (game.owner(t) !== this.player) continue;
        tiles.push(t);
      }
    }

    const { structureSpacing } = this.spacingConstants();
    const bonus = (t: TileRef): number => {
      let fewest = Infinity;
      for (let i = 0; i < domes.length; i++) {
        if (game.euclideanDistSquared(domes[i], t) > range2) continue;
        fewest = Math.min(fewest, crowd[i]);
      }
      if (fewest === Infinity) return 0;
      return Math.floor(
        (structureSpacing * SHELTER_CROWD) / (SHELTER_CROWD + fewest),
      );
    };
    return { tiles, bonus };
  }

  private *arraySampler<T>(a: T[], sampleSize: number): Generator<T> {
    if (a.length <= sampleSize) {
      // Return all elements
      yield* a;
    } else {
      // Sample `sampleSize` elements
      const remaining = new Set<T>(a);
      while (sampleSize--) {
        const t = this.random.randFromSet(remaining);
        remaining.delete(t);
        yield t;
      }
    }
  }

  private structureSpawnTileValue(
    type: UnitType,
  ): ((tile: TileRef) => number) | null {
    switch (type) {
      // A Capital wants what a city wants: deep inside the border, spaced
      // from other structures, and near the rail network.
      case UnitType.City:
      case UnitType.Capital:
        return this.cityValue();
      case UnitType.MissileSilo:
        return this.missileSiloValue();
      case UnitType.Factory:
        return this.factoryValue();
      case UnitType.Port:
        return this.portValue();
      case UnitType.SAMLauncher:
        return this.samLauncherValue();
      default:
        throw new Error(`Value function not implemented for ${type}`);
    }
  }

  private placesCapitalStrategically(): boolean {
    const { difficulty } = this.game.config().gameConfig();
    const percent = CAPITAL_STRATEGY_PERCENT[difficulty];
    return percent > 0 && this.random.nextInt(0, 100) < percent;
  }

  /**
   * Derpy Front: value function for a strategically placed Capital. Above
   * all it wants to be deep inside the nation's land, far from every border
   * and coast (where attacks and naval landings come from); on Hard and up it
   * also prefers a spot its SAM launchers already cover.
   */
  private strategicCapitalValue(): (tile: TileRef) => number {
    const game = this.game;
    const borderTiles = this.player.borderTiles();
    const { borderSpacing } = this.spacingConstants();
    const depthCap = borderSpacing * 4;
    const { difficulty } = game.config().gameConfig();
    const samReach = Math.floor((game.config().defaultSamRange() * 3) / 4);
    const sams =
      difficulty === Difficulty.Hard || difficulty === Difficulty.Impossible
        ? this.player.units(UnitType.SAMLauncher).map((u) => u.tile())
        : [];

    return (tile) => {
      let w = 3 * nearestTileDistCapped(game, borderTiles, tile, depthCap) + 1;
      if (
        sams.some(
          (s) => game.euclideanDistSquared(s, tile) <= samReach * samReach,
        )
      ) {
        w += borderSpacing;
      }
      return w;
    };
  }

  /**
   * Value function for MissileSilo.
   * Prefers high elevation, distance from border, and spacing from same-type structures.
   */
  private missileSiloValue(): (tile: TileRef) => number {
    const game = this.game;
    const borderTiles = this.player.borderTiles();
    const otherUnits = this.player.units(UnitType.MissileSilo);
    const { borderSpacing, structureSpacing } = this.spacingConstants();

    return (tile) => {
      let w = 0;

      // Prefer higher elevations
      w += game.magnitude(tile);

      // Prefer to be away from the border
      // Clamped at borderSpacing, so the ring search may stop there.
      const closestBorderDist = nearestTileDistCapped(
        game,
        borderTiles,
        tile,
        borderSpacing,
      );
      w += Math.min(closestBorderDist, borderSpacing);

      // Prefer to be away from other structures of the same type
      const otherTiles: Set<TileRef> = new Set(otherUnits.map((u) => u.tile()));
      otherTiles.delete(tile);
      const d = nearestTileDist(game, otherTiles, tile);
      if (d !== Infinity) w += Math.min(d, structureSpacing);

      return w;
    };
  }

  /**
   * Value function for ports.
   * Prefers spacing from other ports.
   */
  private portValue(): (tile: TileRef) => number {
    const game = this.game;
    const otherUnits = this.player.units(UnitType.Port);

    return (tile) => {
      let w = 0;

      // Prefer to be as far as possible from other ports
      const otherTiles: Set<TileRef> = new Set(otherUnits.map((u) => u.tile()));
      otherTiles.delete(tile);
      const closestOtherDist = nearestTileDist(game, otherTiles, tile);
      w += closestOtherDist;

      return w;
    };
  }

  /**
   * Value function for factories.
   * Prefers high elevation, spacing from other factories, and distance from border.
   * Based on difficulty, scores connectivity by the number of distinct rail
   * clusters within train-station range, weighted by trade gold:
   * ally (1.0) > team/neutral (~0.71) > self (~0.29).
   * Embargoed and bot neighbors are excluded. Per cluster, the best reachable
   * trade relationship determines the weight.
   */
  private factoryValue(): (tile: TileRef) => number {
    const game = this.game;
    const player = this.player;
    const borderTiles = this.player.borderTiles();
    const otherUnits = player.units(UnitType.Factory);
    const { borderSpacing, structureSpacing } = this.spacingConstants();
    const stationRange = game.config().trainStationMaxRange();
    const stationRangeSquared = stationRange * stationRange;
    const { difficulty } = game.config().gameConfig();
    const useConnectionScore = this.shouldUseConnectivityScore(difficulty);

    const reachableStations = useConnectionScore
      ? this.getOrBuildReachableStations()
      : [];
    const minRangeSquared = game.config().trainStationMinRange() ** 2;

    // Cross-type spacing: prefer to be away from cities.
    const cityTiles: Set<TileRef> = new Set(
      player.units(UnitType.City).map((u) => u.tile()),
    );

    return (tile) => {
      let w = 0;

      // Prefer higher elevations
      w += game.magnitude(tile);

      // Prefer to be away from the border
      // Clamped at borderSpacing, so the ring search may stop there.
      const closestBorderDist = nearestTileDistCapped(
        game,
        borderTiles,
        tile,
        borderSpacing,
      );
      w += Math.min(closestBorderDist, borderSpacing);

      // Prefer to be away from other factories
      const otherTiles: Set<TileRef> = new Set(otherUnits.map((u) => u.tile()));
      otherTiles.delete(tile);
      const d = nearestTileDist(game, otherTiles, tile);
      if (d !== Infinity) w += Math.min(d, stationRange);

      // Prefer to be away from cities (cross-type spacing)
      const d2 = nearestTileDist(game, cityTiles, tile);
      if (d2 !== Infinity) w += Math.min(d2, structureSpacing);

      if (!useConnectionScore) {
        return w;
      }

      w +=
        this.computeConnectivityScore(
          tile,
          reachableStations,
          minRangeSquared,
          stationRangeSquared,
        ) * structureSpacing;

      return w;
    };
  }

  /**
   * Given the game difficulty, decide if we should use connectivity scoring
   * to determine the best placement for factories and cities.
   */
  private shouldUseConnectivityScore(difficulty: Difficulty): boolean {
    let randomChance: number;
    switch (difficulty) {
      case Difficulty.Easy:
        randomChance = 0;
        break;
      case Difficulty.Medium:
        randomChance = 60;
        break;
      case Difficulty.Hard:
        randomChance = 75;
        break;
      case Difficulty.Impossible:
        randomChance = 100;
        break;
      default:
        assertNever(difficulty);
    }

    return this.random.nextInt(0, 100) < randomChance;
  }

  private getOrBuildReachableStations(): Array<{
    tile: TileRef;
    cluster: Cluster | null;
    weight: number;
  }> {
    this.reachableStationsCache ??= this.buildReachableStations();
    return this.reachableStationsCache;
  }

  /**
   * Precomputes trade-weighted station entries for connectivity scoring.
   * Iterates all stations once (O(total_stations)) to build a unit→cluster map,
   * then collects own and non-embargoed non-bot neighbor structures with a
   * normalized weight derived from config.trainGold().
   */
  private buildReachableStations(): Array<{
    tile: TileRef;
    cluster: Cluster | null;
    weight: number;
  }> {
    const game = this.game;
    const player = this.player;

    // Build unit → cluster lookup in one O(total_stations) pass.
    const stationManager = game.railNetwork().stationManager();
    const unitToCluster = new Map<Unit, Cluster | null>();
    for (const station of stationManager.getAll()) {
      unitToCluster.set(station.unit, station.getCluster());
    }

    const maxTradeGold = Math.max(
      Number(game.config().trainGold("ally", 0, player)),
      1,
    );
    const result: Array<{
      tile: TileRef;
      cluster: Cluster | null;
      weight: number;
    }> = [];

    // Own structures — weighted by "self" trade gold.
    const selfWeight =
      Number(game.config().trainGold("self", 0, player)) / maxTradeGold;
    for (const unit of player.units(TRADE_STRUCTURE_TYPES)) {
      if (unitToCluster.has(unit)) {
        result.push({
          tile: unit.tile(),
          cluster: unitToCluster.get(unit)!,
          weight: selfWeight,
        });
      }
    }

    // Neighbor structures — all non-embargoed non-bot neighbors.
    for (const neighbor of player.nearby()) {
      if (!neighbor.isPlayer()) continue;
      if (neighbor.type() === PlayerType.Bot) continue;
      if (!player.canTrade(neighbor)) continue;
      const relType = player.isOnSameTeam(neighbor)
        ? "team"
        : player.isAlliedWith(neighbor)
          ? "ally"
          : "other";
      const weight =
        Number(game.config().trainGold(relType, 0, player)) / maxTradeGold;
      for (const unit of neighbor.units(TRADE_STRUCTURE_TYPES)) {
        if (unitToCluster.has(unit)) {
          result.push({
            tile: unit.tile(),
            cluster: unitToCluster.get(unit)!,
            weight,
          });
        }
      }
    }

    return result;
  }

  /**
   * Returns the summed cluster-deduplicated connectivity weight for a candidate
   * tile. Stations outside [minRangeSquared, stationRangeSquared] are ignored.
   * Per cluster the max weight of any station in range is taken; isolated
   * stations (no cluster) contribute their individual weights.
   */
  private computeConnectivityScore(
    tile: TileRef,
    reachableStations: Array<{
      tile: TileRef;
      cluster: Cluster | null;
      weight: number;
    }>,
    minRangeSquared: number,
    stationRangeSquared: number,
  ): number {
    const clustersInRange = new Map<Cluster, number>();
    let isolatedWeight = 0;
    for (const { tile: stationTile, cluster, weight } of reachableStations) {
      const dist = this.game.euclideanDistSquared(tile, stationTile);
      if (dist < minRangeSquared || dist > stationRangeSquared) continue;
      if (cluster !== null) {
        clustersInRange.set(
          cluster,
          Math.max(clustersInRange.get(cluster) ?? 0, weight),
        );
      } else {
        isolatedWeight += weight;
      }
    }
    let score = isolatedWeight;
    for (const cw of clustersInRange.values()) score += cw;
    return score;
  }

  /**
   * Value function for cities.
   * Inherits interior placement criteria (elevation, border distance, spacing)
   * and adds cluster-connectivity scoring so cities prefer positions that extend
   * or bridge the existing rail network. Connectivity is difficulty-gated.
   */
  private cityValue(): (tile: TileRef) => number {
    const game = this.game;
    const player = this.player;
    const borderTiles = player.borderTiles();
    const otherUnits = player.units(UnitType.City);
    const { borderSpacing, structureSpacing } = this.spacingConstants();
    const stationRange = game.config().trainStationMaxRange();
    const stationRangeSquared = stationRange * stationRange;
    const { difficulty } = game.config().gameConfig();
    const useConnectionScore = this.shouldUseConnectivityScore(difficulty);

    const reachableStations = useConnectionScore
      ? this.getOrBuildReachableStations()
      : [];
    const minRangeSquared = game.config().trainStationMinRange() ** 2;

    // Cross-type spacing: prefer to be away from factories.
    const factoryTiles: Set<TileRef> = new Set(
      player.units(UnitType.Factory).map((u) => u.tile()),
    );

    return (tile) => {
      let w = 0;

      w += game.magnitude(tile);

      // Clamped at borderSpacing, so the ring search may stop there.
      const closestBorderDist = nearestTileDistCapped(
        game,
        borderTiles,
        tile,
        borderSpacing,
      );
      w += Math.min(closestBorderDist, borderSpacing);

      const otherTiles: Set<TileRef> = new Set(otherUnits.map((u) => u.tile()));
      otherTiles.delete(tile);
      const d = nearestTileDist(game, otherTiles, tile);
      if (d !== Infinity) w += Math.min(d, structureSpacing);

      // Prefer to be away from factories (cross-type spacing)
      const d2 = nearestTileDist(game, factoryTiles, tile);
      if (d2 !== Infinity) w += Math.min(d2, structureSpacing);

      if (!useConnectionScore) {
        return w;
      }

      w +=
        this.computeConnectivityScore(
          tile,
          reachableStations,
          minRangeSquared,
          stationRangeSquared,
        ) * structureSpacing;

      return w;
    };
  }

  /**
   * Value function for SAM launchers.
   * Prefers elevation, distance from border, spacing, and proximity to protectable structures.
   * On harder difficulties, weights by structure level and considers existing SAM coverage.
   */
  private samLauncherValue(): (tile: TileRef) => number {
    const game = this.game;
    const player = this.player;
    const borderTiles = player.borderTiles();
    const otherUnits = player.units(UnitType.SAMLauncher);
    const { borderSpacing, structureSpacing } = this.spacingConstants();

    const { difficulty } = game.config().gameConfig();
    const weightByLevel =
      difficulty === Difficulty.Hard || difficulty === Difficulty.Impossible;

    const protectEntries: { tile: TileRef; weight: number }[] = [];
    for (const unit of player.units()) {
      switch (unit.type()) {
        case UnitType.City:
        case UnitType.Factory:
        case UnitType.MissileSilo:
        case UnitType.Port:
        case UnitType.Capital:
          protectEntries.push({
            tile: unit.tile(),
            weight: weightByLevel ? unit.level() : 1,
          });
      }
    }
    const range = game.config().defaultSamRange();
    const rangeSquared = range * range;

    const useCoverageWeighting =
      difficulty !== Difficulty.Easy && this.random.nextInt(0, 100) < 25;

    // Pre-compute existing SAM coverage for each protectable structure
    let structureCoverage: Map<TileRef, number> | null = null;
    if (useCoverageWeighting) {
      structureCoverage = new Map<TileRef, number>();
      const existingSams = player.units(UnitType.SAMLauncher);
      for (const entry of protectEntries) {
        let coverageScore = 0;
        for (const sam of existingSams) {
          const samRange = game.config().samRange(sam.level());
          const dist = game.euclideanDistSquared(entry.tile, sam.tile());
          if (dist <= samRange * samRange) {
            coverageScore += sam.level();
          }
        }
        structureCoverage.set(entry.tile, coverageScore);
      }
    }

    return (tile) => {
      let w = 0;

      // Prefer higher elevations
      w += game.magnitude(tile);

      // Prefer to be away from the border
      const closestBorderDist = nearestTileDistCapped(
        game,
        borderTiles,
        tile,
        borderSpacing,
      );
      // Infinity here also means "farther than borderSpacing", which still
      // earns the clamped term; only an empty border set contributes nothing.
      if (borderTiles.size > 0) {
        w += Math.min(closestBorderDist, borderSpacing);
      }

      // Prefer to be away from other structures of the same type
      const otherTiles: Set<TileRef> = new Set(otherUnits.map((u) => u.tile()));
      otherTiles.delete(tile);
      const d = nearestTileDist(game, otherTiles, tile);
      if (d !== Infinity) w += Math.min(d, structureSpacing);

      // Prefer to be in range of other structures (skip on easy difficulty)
      if (difficulty !== Difficulty.Easy) {
        for (const entry of protectEntries) {
          const distanceSquared = game.euclideanDistSquared(tile, entry.tile);
          if (distanceSquared > rangeSquared) continue;
          if (useCoverageWeighting && structureCoverage !== null) {
            const coverage = structureCoverage.get(entry.tile) ?? 0;
            const coverageWeight = 1 / (1 + coverage);
            w += structureSpacing * entry.weight * coverageWeight;
          } else {
            w += structureSpacing * entry.weight;
          }
        }
      }

      return w;
    };
  }

  /** Shared spacing constants derived from atom bomb range. */
  private spacingConstants(): {
    borderSpacing: number;
    structureSpacing: number;
  } {
    const borderSpacing = this.game
      .config()
      .nukeMagnitudes(UnitType.AtomBomb).outer;
    return { borderSpacing, structureSpacing: borderSpacing * 2 };
  }
}

export const NationStructureBehaviorSnapshot = snapshotType({
  name: "NationStructureBehavior",
  version: 2,
  schema: z.object({
    lastStructureTick: zInt().nullable(),
    placementsCount: zInt(),
    builtCrowdedMapFirstStructure: z.boolean(),
    hasHighStartingGold: z.boolean().nullable(),
    postSaveUpStartTick: zInt().nullable(),
    nukedTick: zInt().nullable().optional(),
    nukeImpacts: z.array(z.tuple([zInt(), zTile()])),
    lastDomeTick: zInt().nullable(),
    domeRetryTick: zInt().nullable(),
    domeSavingUntil: zInt().nullable(),
    domeSaveStartTick: zInt().nullable(),
  }),
  migrations: {
    // v1 nations kept no Dome memory (rules 4 adds it)
    1: (d) => ({
      ...d,
      nukeImpacts: [],
      lastDomeTick: null,
      domeRetryTick: null,
      domeSavingUntil: null,
      domeSaveStartTick: null,
    }),
  },
});
