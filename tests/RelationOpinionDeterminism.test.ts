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
 * (bd7450b7), and recorded again on the merge with OpenFront's 2026-10-14
 * main (r24), whose nation and attack changes play every game differently,
 * once the same games were seen to come out the same with the panel opened
 * and without: the game hash every 100 ticks (as a digest, and the last one),
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
      hashes: 1934719460,
      lastHash: 4072150276057829,
      relations: 347108884,
      alliances:
        "1-18,1-30,1-31,1-44,1-54,10-11,10-13,10-31,14-40,3-10,3-11,3-14,3-17,3-24,3-30,3-31,3-41,3-44,3-48,3-52,3-54,3-55,3-6,3-9,4-10",
    },
  ],
  [
    "medium",
    { difficulty: Difficulty.Medium },
    {
      hashes: 568997880,
      lastHash: 7709514715928215,
      relations: 58264025,
      alliances: "4-10,4-6,7-14,9-11,9-13",
    },
  ],
  [
    "hard",
    { difficulty: Difficulty.Hard },
    {
      hashes: 94926099,
      lastHash: 18983605163368156,
      relations: 980618766,
      alliances: "10-13,12-14,12-15,13-15,7-15",
    },
  ],
  [
    "impossible",
    { difficulty: Difficulty.Impossible },
    {
      hashes: 1032225940,
      lastHash: 11112889899028864,
      relations: 832348149,
      alliances: "",
    },
  ],
  [
    "medium teams",
    { difficulty: Difficulty.Medium, gameMode: GameMode.Team, playerTeams: 3 },
    {
      hashes: 1509931442,
      lastHash: 3556421396667646,
      relations: 1151014637,
      alliances: "12-14",
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
