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
 *     --seed s1 --difficulty Medium --minutes 120 [--size Normal]
 */
import {
  Difficulty,
  GameMapSize,
  GameMode,
  GameType,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { GameStartInfo } from "@openfront/engine-api/Schemas";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { createGameRunner } from "@openfront/engine/GameRunner";
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
// Overtime from this minute on (the bars sink 2 points a minute), or off.
const overtime = parseInt(
  arg("overtime", process.env.SCEN_OVERTIME ?? "0"),
  10,
);
const ROOT = process.env.SCEN_ROOT ?? process.cwd();

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
      scenario: { id },
      ...(overtime > 0
        ? { overtime: { enabled: true, startMinutes: overtime } }
        : {}),
    },
    players: [],
  };
  const files = await loadMapFiles(
    new NodeGameMapLoader(path.join(ROOT, "resources/maps")),
    data.map,
    size,
  );
  let winner: unknown = null;
  const joins: string[] = [];
  const runner = await createGameRunner(gameStart, undefined, files, (gu) => {
    if ("errMsg" in gu) throw new Error(gu.errMsg + "\n" + gu.stack);
    const w = gu.updates[GameUpdateType.Win];
    if (w.length > 0 && winner === null) winner = w[0].winner ?? "none";
    for (const e of gu.updates[GameUpdateType.DisplayEvent]) {
      if (e.message === "events_display.scenario_joined_side") {
        joins.push(
          `${Math.round(runner.game.ticks() / 600)}m ${e.params?.name} -> ${e.params?.side} (by ${e.params?.by})`,
        );
      }
      // A special rule's news (a colony changing sides, a landing).
      if (
        e.message === "events_display.scenario_loyalists" ||
        e.message.startsWith("events_display.scenario_landing_")
      ) {
        joins.push(
          `${Math.round(runner.game.ticks() / 600)}m ${e.message.replace("events_display.scenario_", "")} ${e.params?.name}`,
        );
      }
    }
  });
  const t0 = Date.now();
  const game = runner.game;
  const land = game.numLandTiles();
  const shares: Record<string, number[]> = {};
  for (const s of data.sides) shares[s.id] = [];
  shares["neutral"] = [];
  const maxTicks = minutes * 600;
  // Every 30 s: each side's progress towards its bar (ContestedMetric.ts).
  const samples: ContestedSample[] = [];
  const start: Record<string, number> = {};
  const bar = (side: string) =>
    data.sides.find((s) => s.id === side)?.winPercent ?? data.winPercent;
  const sideLand = () => {
    const by: Record<string, number> = {};
    for (const s of data.sides) by[s.id] = 0;
    for (const p of game.players()) {
      const t = p.team();
      if (t !== null && t in by) by[t] += p.numTilesOwned();
    }
    return by;
  };
  let tick = 0;
  for (; tick < maxTicks && winner === null; tick++) {
    runner.addTurn({ turnNumber: tick, intents: [] });
    runner.executeNextTick();
    if (tick === 2 || (tick > 2 && tick % 300 === 0)) {
      const by = sideLand();
      const progress: Record<string, number> = {};
      for (const s of data.sides) {
        const pct = (100 * by[s.id]) / land;
        if (tick === 2) start[s.id] = pct;
        progress[s.id] = (pct - start[s.id]) / (bar(s.id) - start[s.id]);
      }
      samples.push({ minute: tick / 600, progress });
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
  const alive = game
    .players()
    .filter((p) => p.type() === PlayerType.Nation)
    .map(
      (p) =>
        `${p.name()}[${p.team() ?? "-"}] ${Math.round((1000 * p.numTilesOwned()) / land) / 10}%`,
    );
  log(
    JSON.stringify({
      scenario: id,
      seed,
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
      alive,
    }),
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exit(1);
});
