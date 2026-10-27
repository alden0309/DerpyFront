/**
 * SCEN r25: a headless computer-only Scenario game, for the balance runs.
 *
 * Every nation is computer-run (no human seats). Plays until a side wins or
 * --minutes of game time pass, and prints one JSON line: the winner, how
 * long it took, the sides' land over time, who joined which side, and the
 * nations still alive.
 *
 * Usage (from the worktree root):
 *   nice -n 10 npx tsx tests/scenario/ScenarioBalance.ts --scenario europe1939 \
 *     --seed s1 --difficulty Medium --minutes 120 [--size Normal] [--goals] \
 *     [--seat germany] [--no-nukes]
 *
 * SCEN3 (r27): --seat <nation key> plays that nation as a person's seat:
 * a human player (PlayerType.Human, so the human's numbers and everything
 * the rules give or deny a person) seated at the nation, driven by the
 * computer's own logic (a NationExecution) at the game's difficulty.
 */
import {
  Cell,
  Difficulty,
  GameMapSize,
  GameMode,
  GameType,
  Nation,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { GameStartInfo } from "@openfront/engine-api/Schemas";
import { applyScenarioRules } from "@openfront/engine-lib/scenario/ScenarioConfig";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import {
  goalMetAt,
  goalTileXY,
  scenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals"; // DFX (r26)
import { NationExecution } from "@openfront/engine/execution/NationExecution";
import { createGameRunner } from "@openfront/engine/GameRunner";
import { GOAL_CHECK_INTERVAL } from "@openfront/engine/scenario/ScenarioGoals"; // DFX (r26)
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import path from "path";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";
import { ContestedSample, contestedStats, leaderOf } from "./ContestedMetric";

const args = process.argv.slice(2);
function arg(name: string, def: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const id = arg("scenario", "europe1939");
const seed = arg("seed", "s1");
const difficulty = arg("difficulty", "Medium") as Difficulty;
const minutes = parseInt(arg("minutes", "120"), 10);
const size = arg("size", "Normal") as GameMapSize;
const verbose = args.includes("--verbose");
// DFX (r26): --goals: the minute each nation's own computer player met its
// Scenario goal (null: it didn't), to see which goals happen anyway.
const withGoals = args.includes("--goals");
// Overtime from this minute on (the bars sink 2 points a minute), or off.
const overtime = parseInt(
  arg("overtime", process.env.SCEN_OVERTIME ?? "0"),
  10,
);
const ROOT = process.env.SCEN_ROOT ?? process.cwd();
// SCEN3 (r27): a person's seat (see the header), or none.
const seat = arg("seat", "");
// SCEN3 (r27): --no-nukes: the host's units off for nukes and silos, to
// compare a war without them.
const noNukes = args.includes("--no-nukes");
const SEAT_CLIENT = "SEAT0001";

async function main() {
  console.debug = () => {};
  const log = console.log;
  console.log = () => {};
  console.warn = () => {};
  const data = scenarioData(id);
  if (data === null) throw new Error(`no scenario ${id}`);
  const gameStart: GameStartInfo = {
    gameID: ("SC" + seed.replace(/[^A-Za-z0-9]/g, "") + "XXXXXXXX").slice(0, 8),
    lobbyCreatedAt: 0,
    config: {
      gameMap: data.map,
      gameMapSize: size,
      gameMode: GameMode.Team,
      playerTeams: data.sides.length,
      gameType: GameType.Singleplayer,
      difficulty,
      nations: "default",
      donateGold: true,
      donateTroops: true,
      bots: 0,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
      ...(noNukes
        ? {
            disabledUnits: [
              UnitType.AtomBomb,
              UnitType.HydrogenBomb,
              UnitType.MIRV,
              UnitType.MissileSilo,
            ],
          }
        : {}),
      scenario: { id, ...(seat ? { seats: { [seat]: SEAT_CLIENT } } : {}) },
    },
    players: seat
      ? [
          {
            clientID: SEAT_CLIENT,
            username: "Seat",
            clanTag: null,
            isLobbyCreator: true,
          },
        ]
      : [],
  };
  if (seat && !data.nations.some((n) => n.key === seat)) {
    throw new Error(`${id} has no nation ${seat}`);
  }
  // The scenario's fixed settings, as the solo screen and the server apply
  // them (its own Overtime among them); --overtime overrides.
  applyScenarioRules(gameStart.config);
  if (overtime > 0) {
    gameStart.config.overtime = { enabled: true, startMinutes: overtime };
  }
  const files = await loadMapFiles(
    new NodeGameMapLoader(path.join(ROOT, "resources/maps")),
    data.map,
    size,
  );
  let winner: unknown = null;
  const joins: string[] = [];
  // DIPLO (r27): the neutrals courted into a side, and when.
  const courted: string[] = [];
  // SCEN3 (r27): nukes launched, by the launcher's side (or "-").
  const nukes: Record<string, number> = {};
  const nukeIds = new Set<number>();
  const runner = await createGameRunner(gameStart, undefined, files, (gu) => {
    if ("errMsg" in gu) throw new Error(gu.errMsg + "\n" + gu.stack);
    const w = gu.updates[GameUpdateType.Win];
    if (w.length > 0 && winner === null) winner = w[0].winner ?? "none";
    for (const u of gu.updates[GameUpdateType.Unit]) {
      if (
        (u.unitType === UnitType.AtomBomb ||
          u.unitType === UnitType.HydrogenBomb ||
          u.unitType === UnitType.MIRV) &&
        !nukeIds.has(u.id)
      ) {
        nukeIds.add(u.id);
        const owner = runner.game.playerBySmallID(u.ownerID);
        const side = owner.isPlayer() ? (owner.team() ?? "-") : "-";
        nukes[side] = (nukes[side] ?? 0) + 1;
      }
    }
    for (const e of gu.updates[GameUpdateType.DisplayEvent]) {
      if (e.message === "scenario_diplomacy.msg_joined") {
        courted.push(
          `${(runner.game.ticks() / 600).toFixed(1)}m ${e.params?.name} -> ${e.params?.side}`,
        );
      }
      if (e.message === "events_display.scenario_joined_side") {
        joins.push(
          `${Math.round(runner.game.ticks() / 600)}m ${e.params?.name} -> ${e.params?.side} (by ${e.params?.by})`,
        );
      }
      // A special rule's news (a colony changing sides, a landing, a
      // wave, a hold, a nation entering the war).
      if (
        e.message === "events_display.scenario_loyalists" ||
        (e.message.startsWith("events_display.scenario_") &&
          e.message !== "events_display.scenario_joined_side")
      ) {
        joins.push(
          `${Math.round(runner.game.ticks() / 600)}m ${e.message.replace("events_display.scenario_", "")} ${e.params?.name}`,
        );
      }
    }
  });
  const t0 = Date.now();
  const game = runner.game;
  // SCEN3 (r27): the person's seat, driven by the computer's logic.
  if (seat) {
    const human = game.playerByClientID(SEAT_CLIENT);
    if (human === null) throw new Error("no seat player");
    const n = data.nations.find((x) => x.key === seat)!;
    const scale = size === GameMapSize.Compact ? 2 : 1;
    game.addExecution(
      new NationExecution(
        gameStart.gameID,
        new Nation(
          new Cell(
            Math.floor(n.capital[0] / scale),
            Math.floor(n.capital[1] / scale),
          ),
          human.info(),
        ),
      ),
    );
  }
  const land = game.numLandTiles();
  const shares: Record<string, number[]> = {};
  for (const s of data.sides) shares[s.id] = [];
  shares["neutral"] = [];
  const maxTicks = minutes * 600;
  // Every 30 s: each side's progress towards its bar (ContestedMetric.ts).
  const samples: ContestedSample[] = [];
  const start: Record<string, number> = {};
  // SCEN3 (r27): no land bars any more; a side's goal is all the land the
  // sides hold at the start (the other side beaten), so progress runs from
  // its own land at the start (0) to all of the sides' land (1).
  let sidesLand = 0;
  const bar = () => sidesLand;
  const sideLand = () => {
    const by: Record<string, number> = {};
    for (const s of data.sides) by[s.id] = 0;
    for (const p of game.players()) {
      const t = p.team();
      if (t !== null && t in by) by[t] += p.numTilesOwned();
    }
    return by;
  };
  // DFX (r26): --goals, checked as the engine checks a player's (every
  // GOAL_CHECK_INTERVAL ticks, and once more when the war ends).
  const goals: Record<string, number | null> = {};
  const checkGoals = (final: boolean) => {
    const sc = game.scenario();
    if (sc === null) return;
    const elapsed = Math.round(game.elapsedGameSeconds() * 10);
    for (const p of game.players()) {
      const nation = sc.nationOf(p);
      const goal = nation === null ? null : scenarioGoal(id, nation.key);
      if (nation === null || goal === null) continue;
      if (typeof goals[nation.key] === "number") continue;
      goals[nation.key] = null;
      const xy = goalTileXY(id, nation.key, sc.scale === 2);
      if (xy === null) continue;
      const owner = game.owner(game.ref(xy[0], xy[1]));
      const team = p.team();
      const holds =
        owner.isPlayer() &&
        (owner === p ||
          (goal.side === true && team !== null && owner.team() === team));
      const w = game.getWinner();
      const won = final && (typeof w === "string" ? team === w : w === p);
      if (
        goalMetAt(
          goal,
          { elapsed, holds, team, won, compact: sc.scale === 2 },
          final,
          GOAL_CHECK_INTERVAL,
        )
      )
        goals[nation.key] = Math.round(elapsed / 60) / 10;
    }
  };
  // DFX (r26) end
  const startTroops: Record<string, number> = {};
  let tick = 0;
  for (; tick < maxTicks && winner === null; tick++) {
    runner.addTurn({ turnNumber: tick, intents: [] });
    runner.executeNextTick();
    if (withGoals && tick % GOAL_CHECK_INTERVAL === 0) checkGoals(false); // DFX (r26)
    if (tick === 2 || (tick > 2 && tick % 300 === 0)) {
      const by = sideLand();
      const progress: Record<string, number> = {};
      if (tick === 2) {
        sidesLand = 0;
        for (const s of data.sides) sidesLand += (100 * by[s.id]) / land;
      }
      for (const s of data.sides) {
        const pct = (100 * by[s.id]) / land;
        if (tick === 2) start[s.id] = pct;
        progress[s.id] = (pct - start[s.id]) / (bar() - start[s.id]);
      }
      samples.push({ minute: tick / 600, progress });
    }
    // SCEN3 (r27): the sides' nations' troops a second in (as players see
    // them), to compare starting armies.
    if (tick === 12) {
      for (const p of game.players()) {
        if (p.team() === null) continue;
        startTroops[p.name()] = Math.round(p.troops() / 10);
      }
    }
    if (verbose && tick % 600 === 20) {
      const rows = game
        .players()
        .filter((p) => p.team() !== null)
        .map((p) => {
          const units = p.units().reduce<Record<string, number>>((m, u) => {
            m[u.type()] = (m[u.type()] ?? 0) + u.level();
            return m;
          }, {});
          return `  ${p.name()}: tiles ${p.numTilesOwned()} troops ${Math.round(p.troops() / 10)} / ${Math.round(game.config().maxTroops(p) / 10)} gold ${p.gold()} ${JSON.stringify(units)} attacks ${p.outgoingAttacks().length}`;
        });
      log(`t=${tick / 600}m\n` + rows.join("\n"));
    }
    if (tick % 3000 === 0) {
      const by: Record<string, number> = { neutral: 0 };
      for (const s of data.sides) by[s.id] = 0;
      for (const p of game.players()) {
        const t = p.team() ?? "neutral";
        by[t] = (by[t] ?? 0) + p.numTilesOwned();
      }
      for (const k of Object.keys(shares)) {
        shares[k].push(Math.round((1000 * (by[k] ?? 0)) / land) / 10);
      }
    }
  }
  if (withGoals) checkGoals(true); // DFX (r26)
  const alive = game
    .players()
    .filter(
      (p) => p.type() === PlayerType.Nation || p.type() === PlayerType.Human,
    )
    .map(
      (p) =>
        `${p.name()}[${p.team() ?? "-"}] ${Math.round((1000 * p.numTilesOwned()) / land) / 10}%`,
    );
  log(
    JSON.stringify({
      scenario: id,
      seed,
      seat: seat || null,
      ...(noNukes ? { noNukes } : {}),
      difficulty,
      size,
      winner,
      minutes: Math.round((tick / 600) * 10) / 10,
      ...(() => {
        const side =
          Array.isArray(winner) && winner[0] === "team"
            ? (winner[1] as string)
            : null;
        const c = contestedStats(samples, side, tick / 600);
        return {
          decidedMinute:
            c.decidedMinute === null
              ? null
              : Math.round(c.decidedMinute * 10) / 10,
          decidedFraction:
            c.decidedFraction === null
              ? null
              : Math.round(c.decidedFraction * 100) / 100,
          leadChanges: c.leadChanges,
        };
      })(),
      // The leader at each 30 s sample, by its side's place in the data
      // (0, 1, ...; "." for a tie): how the lead went (ContestedMetric.ts).
      leaders: samples
        .map((smp) => {
          const l = leaderOf(smp.progress);
          return l === null
            ? "."
            : String(data.sides.findIndex((x) => x.id === l));
        })
        .join(""),
      wallSeconds: Math.round((Date.now() - t0) / 1000),
      shares,
      joins,
      courted,
      alive,
      startTroops,
      nukes,
      ...(withGoals ? { goals } : {}), // DFX (r26)
    }),
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exit(1);
});
