import {
  Difficulty,
  GameMode,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { simpleHash } from "@openfront/engine-lib/Util";
import { Game, Player } from "@openfront/engine/game/Game";
import { GameRunner } from "@openfront/engine/GameRunner";
import {
  createScriptedRunner,
  scriptedGameStart,
  stepScripted,
} from "./util/ScriptedGame";

/**
 * The player panel's "Their opinion of you" keeps a breakdown of relations,
 * and the nations' alliance decision moved into engine-lib so the panel can
 * replay it. Neither may change a game, and neither may opening the panel.
 *
 * These are the scripted World games of the snapshot tests (12 nations, 40
 * tribes and three scripted humans who attack, nuke, ally, betray, gift,
 * embargo, target and emoji), on every difficulty and as a team game. The
 * expected values were recorded on the commit before the feature existed
 * (bd7450b7): the game hash every 100 ticks (as a digest, and the last one),
 * and at the end a digest of every relation value and the alliances in
 * force. Relations aren't in the game hash, so their digest shows the
 * nations' feelings came out the same too.
 *
 * Every 100 ticks each human also "opens the panel" on every nation and
 * tribe (GameRunner.playerProfile with a viewer, as the worker does), which
 * replays the alliance decision down every branch; the game must not notice.
 */

const MAP = "world";
const TICKS = 3000;
const CHECK_EVERY = 100;
const TEST_TIMEOUT = 300_000;

function hash(game: Game): number {
  return (game as unknown as { hash(): number }).hash();
}

function relationDigest(game: Game): number {
  const parts: string[] = [];
  const players = [...game.allPlayers()].sort(
    (a, b) => a.smallID() - b.smallID(),
  );
  for (const p of players) {
    const relations = (p as unknown as { relations: Map<Player, number> })
      .relations;
    const rows = [...relations]
      .map(([o, v]) => [o.smallID(), v] as const)
      .sort((a, b) => a[0] - b[0]);
    for (const [o, v] of rows) parts.push(`${p.smallID()}>${o}=${v}`);
  }
  return simpleHash(parts.join(";"));
}

function allianceDigest(game: Game): string {
  const pairs: string[] = [];
  for (const p of game.allPlayers()) {
    for (const a of p.alliances()) {
      const o = a.other(p);
      if (p.smallID() < o.smallID()) {
        pairs.push(`${p.smallID()}-${o.smallID()}`);
      }
    }
  }
  return pairs.sort().join(",");
}

/** Opens every human's panel on every nation and tribe, and checks it. */
function openPanels(runner: GameRunner): number {
  const game = runner.game;
  let opened = 0;
  for (const human of game.players()) {
    if (human.type() !== PlayerType.Human) continue;
    for (const ai of game.players()) {
      if (ai.type() === PlayerType.Human) continue;
      const opinion = runner.playerProfile(
        ai.smallID(),
        human.smallID(),
      ).opinionOfViewer;
      if (opinion === undefined) throw new Error("no opinion");
      const sum = opinion.reasons.reduce((s, r) => s + r.amount, 0);
      if (sum !== opinion.value) {
        throw new Error(`reasons add up to ${sum}, not ${opinion.value}`);
      }
      const { chance, outcomes } = opinion.alliance;
      if (!(chance >= 0 && chance <= 1)) throw new Error(`chance ${chance}`);
      const total = outcomes.reduce((s, o) => s + o.chance, 0);
      if (outcomes.length > 0 && Math.abs(total - 1) > 1e-9) {
        throw new Error(`outcomes add up to ${total}`);
      }
      opened++;
    }
  }
  return opened;
}

interface Fingerprint {
  hashes: number;
  lastHash: number;
  relations: number;
  alliances: string;
}

async function play(overrides: Partial<GameConfig>): Promise<Fingerprint> {
  const runner = await createScriptedRunner(MAP, scriptedGameStart(overrides));
  const hashes: number[] = [];
  let opened = 0;
  while (runner.game.ticks() < TICKS) {
    stepScripted(runner);
    if (runner.game.ticks() % CHECK_EVERY === 0) {
      hashes.push(hash(runner.game));
      if (!runner.game.inSpawnPhase()) opened += openPanels(runner);
    }
  }
  expect(opened).toBeGreaterThan(500);
  return {
    hashes: simpleHash(hashes.join(",")),
    lastHash: hashes[hashes.length - 1],
    relations: relationDigest(runner.game),
    alliances: allianceDigest(runner.game),
  };
}

const CASES: [string, Partial<GameConfig>, Fingerprint][] = [
  [
    "easy",
    { difficulty: Difficulty.Easy },
    {
      hashes: 1486167213,
      lastHash: 2519264077921894,
      relations: 548539663,
      alliances: "10-11,11-53,2-19,2-53,3-10,3-11,3-19,3-23,3-29,3-5,3-50,6-50",
    },
  ],
  [
    "medium",
    { difficulty: Difficulty.Medium },
    {
      hashes: 448945092,
      lastHash: 1329588575458908,
      relations: 1297502768,
      alliances: "1-2,1-27,2-23,2-27,2-29,5-14",
    },
  ],
  [
    "hard",
    { difficulty: Difficulty.Hard },
    {
      hashes: 2134044515,
      lastHash: 1445002337337683,
      relations: 1628788095,
      alliances: "1-12,1-2,1-29,12-15,2-15,2-19,2-29,2-8,5-7",
    },
  ],
  [
    "impossible",
    { difficulty: Difficulty.Impossible },
    {
      hashes: 1829128710,
      lastHash: 19227645657391440,
      relations: 2122634716,
      alliances: "11-12,12-13,14-15,5-11,7-14",
    },
  ],
  [
    "medium teams",
    { difficulty: Difficulty.Medium, gameMode: GameMode.Team, playerTeams: 3 },
    {
      hashes: 123480867,
      lastHash: 4167163903960013,
      relations: 2006369646,
      alliances: "1-2,1-48,1-5,2-19,2-27,2-48,3-48",
    },
  ],
];

describe.each(CASES)(
  "relation reasons and the opinion panel leave the game alone: %s",
  (_, overrides, expected) => {
    test(
      "hashes, relations and alliances match the game before the feature",
      async () => {
        expect(await play(overrides)).toEqual(expected);
      },
      TEST_TIMEOUT,
    );
  },
);
