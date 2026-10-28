/**
 * DIPLO (r27): a headless computer-only Scenario game, for the sanity runs of
 * courting the neutrals (ScenarioDiplomacy.ts). Not the balance runs
 * (ScenarioBalance.ts): it reports which neutrals joined which side and when,
 * what they cost (the gifts each side gave each neutral), and the neutrals
 * pulled in by invasion instead.
 *
 * It plays on to --minutes even after a side has won by today's land bars
 * (the war goes on), so courting has the time it would under SCEN3's rule.
 *
 * Usage (from the worktree root):
 *   nice -n 15 npx tsx tests/scenario/ScenarioDiplomacyRun.ts --scenario europe1939 \
 *     --seed s1 --difficulty Hard --minutes 45 [--size Normal]
 */
import {
  Difficulty,
  GameMapSize,
  GameMode,
  GameType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { DIPLOMACY_MESSAGES } from "@openfront/engine-api/game/ScenarioDiplomacy";
import { GameStartInfo } from "@openfront/engine-api/Schemas";
import { applyScenarioRules } from "@openfront/engine-lib/scenario/ScenarioConfig";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { leaningOf } from "@openfront/engine-lib/scenario/ScenarioLeaning";
import { Player } from "@openfront/engine/game/Game";
import { createGameRunner } from "@openfront/engine/GameRunner";
import {
  ScenarioDiplomacy,
  scenarioDiplomacy,
} from "@openfront/engine/scenario/ScenarioDiplomacy";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import path from "path";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";

const args = process.argv.slice(2);
function arg(name: string, def: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const id = arg("scenario", "europe1939");
const seed = arg("seed", "s1");
const difficulty = arg("difficulty", "Hard") as Difficulty;
const minutes = parseInt(arg("minutes", "45"), 10);
const size = arg("size", "Normal") as GameMapSize;
const ROOT = process.env.SCEN_ROOT ?? process.cwd();
// --table: each neutral's size, earliest minute and price per side (in
// minutes of a big nation's income, the going rate), then stop.
const table = args.includes("--table");

const mins = (ticks: number) => Math.round(ticks / 60) / 10;

async function main() {
  console.debug = () => {};
  const log = console.log;
  console.log = () => {};
  console.warn = () => {};
  const data = scenarioData(id);
  if (data === null) throw new Error(`no scenario ${id}`);
  const gameStart: GameStartInfo = {
    gameID: ("DP" + seed.replace(/[^A-Za-z0-9]/g, "") + "XXXXXXXX").slice(0, 8),
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
    },
    players: [],
  };
  applyScenarioRules(gameStart.config);

  // Every gift, by neutral and side (the computer's courting).
  const gifts = new Map<string, number>();
  const proto = ScenarioDiplomacy.prototype as unknown as {
    receive(n: Player, side: string, gold: bigint): void;
  };
  const receive = proto.receive;
  proto.receive = function (n: Player, side: string, gold: bigint) {
    const k = `${n.name()}|${side}`;
    gifts.set(k, (gifts.get(k) ?? 0) + Number(gold));
    receive.call(this, n, side, gold);
  };

  const files = await loadMapFiles(
    new NodeGameMapLoader(path.join(ROOT, "resources/maps")),
    data.map,
    size,
  );
  let winner: unknown = null;
  let winnerMinute: number | null = null;
  const events: {
    minute: number;
    name: string;
    side: string;
    how: "courted" | "invaded";
    by?: string;
    cost?: number;
    price?: number;
    leaning?: string;
  }[] = [];
  const runner = await createGameRunner(gameStart, undefined, files, (gu) => {
    if ("errMsg" in gu) throw new Error(gu.errMsg + "\n" + gu.stack);
    const w = gu.updates[GameUpdateType.Win];
    if (w.length > 0 && winner === null) {
      winner = w[0].winner ?? "none";
      winnerMinute = mins(runner.game.ticks());
    }
    for (const e of gu.updates[GameUpdateType.DisplayEvent]) {
      const name = String(e.params?.name ?? "");
      const side = String(e.params?.side ?? "");
      if (e.message === DIPLOMACY_MESSAGES.joined) {
        const nation = data.nations.find((n) => n.name === name);
        events.push({
          minute: mins(runner.game.ticks()),
          name,
          side,
          how: "courted",
          cost: Math.round((gifts.get(`${name}|${side}`) ?? 0) / 1e5) / 10,
          leaning:
            nation === undefined
              ? undefined
              : leaningOf(nation, side, Math.floor(runner.game.ticks() / 600)),
        });
      } else if (e.message === "events_display.scenario_joined_side") {
        events.push({
          minute: mins(runner.game.ticks()),
          name,
          side,
          how: "invaded",
          by: String(e.params?.by ?? ""),
        });
      }
    }
  });
  const game = runner.game;
  const t0 = Date.now();
  // Prices at minutes 5, 15 and 30 (millions), for the report.
  const prices: Record<
    string,
    Record<string, Record<string, number | null>>
  > = {};
  const samplePrices = (minute: number) => {
    const dip = scenarioDiplomacy(game);
    if (dip === null) return;
    const row: Record<string, Record<string, number | null>> = {};
    for (const p of game.players()) {
      if (!dip.isNeutral(p)) continue;
      row[p.name()] = {};
      for (const s of data.sides) {
        const price = dip.price(p, s.id);
        row[p.name()][s.id] =
          price === null ? null : Math.round(price / 1e5) / 10;
      }
    }
    prices[`m${minute}`] = row;
    prices[`m${minute}`]["_rate"] = { rate: Math.round(dip.rate / 1e5) / 10 };
  };
  if (table) {
    for (let t = 0; t < 30; t++) {
      runner.addTurn({ turnNumber: t, intents: [] });
      runner.executeNextTick();
    }
    const dip = scenarioDiplomacy(game)!;
    const rows = game
      .players()
      .filter((p) => dip.isNeutral(p))
      .map((p) => {
        const nation = dip.nation(p)!;
        const sides: Record<string, string> = {};
        for (const s of data.sides) {
          const word = leaningOf(nation, s.id, 0);
          const pct = dip.leaningPercent(p, s.id);
          sides[s.id] =
            pct === null
              ? "never"
              : `${word} ${Math.round((dip.sizeOf(p) * pct) / 1000) / 10}`;
          const late = nation.leaningLate;
          if (late !== undefined && s.id in late.sides) {
            sides[s.id] += ` (from minute ${late.minute}: ${late.sides[s.id]})`;
          }
        }
        return {
          key: nation.key,
          name: nation.name,
          size: dip.sizeOf(p) / 100,
          earliest: dip.earliestTick(p) / 600,
          sides,
        };
      });
    log(JSON.stringify({ scenario: id, difficulty, size, rows }));
    process.exit(0);
  }
  let tick = 0;
  // On to the cap even after a side has won by today's land bars: the wars
  // run longer under SCEN3's rule (a side wins when the other is beaten).
  for (; tick < minutes * 600; tick++) {
    runner.addTurn({ turnNumber: tick, intents: [] });
    runner.executeNextTick();
    if (tick === 5 * 600 || tick === 15 * 600 || tick === 30 * 600) {
      samplePrices(tick / 600);
    }
  }
  // What each side gave in all (millions), and to whom.
  const given: Record<string, Record<string, number>> = {};
  for (const [k, v] of gifts) {
    const [n, s] = k.split("|");
    given[s] ??= {};
    given[s][n] = Math.round(v / 1e5) / 10;
  }
  log(
    JSON.stringify({
      scenario: id,
      seed,
      difficulty,
      size,
      winner,
      winnerMinute,
      minutes: mins(tick),
      wallSeconds: Math.round((Date.now() - t0) / 1000),
      events,
      given,
      prices,
    }),
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exit(1);
});
