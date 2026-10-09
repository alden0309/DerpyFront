import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  ErrorUpdate,
  GameUpdateViewData,
} from "@openfront/engine-api/game/GameUpdates";
import { IntentSchema } from "@openfront/engine-api/Schemas";
import { simpleHash } from "@openfront/engine-lib/Util";
import { Game, Player } from "@openfront/engine/game/Game";
import { createGameRunner } from "@openfront/engine/GameRunner";
import {
  ChatterLine,
  ChatterPlayer,
  ChatterWorld,
  NationChatter,
} from "../src/client/chat/NationChatter";
import {
  SCRIPTED_HUMANS,
  scriptedGameStart,
  scriptedTurn,
  TestDataMapLoader,
} from "./util/ScriptedGame";

/**
 * Chat and the nations' chatter change nothing in a game, so they need no
 * DERPY_RULES bump. This is the proof.
 *
 * Players' chat is a server message of its own (ClientChatMessageSchema),
 * never an intent: it is not in the turn, so the simulation never sees it.
 * The nations' chatter runs on the client from the updates the simulation
 * already sends for drawing, with its own RNG.
 *
 * The scripted World game of the snapshot tests (12 nations, 40 tribes and
 * three scripted humans who attack, nuke, ally, betray, gift, embargo, target
 * and emoji) is played twice: once as before, once with the chatter reading
 * every tick's updates and the humans chatting at the nations by name. The
 * game hash every 100 ticks must be the same both times, and the same as the
 * values recorded on the commit before chat existed (3242ce6c).
 */

const TICKS = 2500;
const CHECK_EVERY = 100;
const TEST_TIMEOUT = 300_000;

const BEFORE_CHAT = {
  hashes: 1420112849,
  lastHash: 4877903200292966,
};

function info(p: Player): ChatterPlayer {
  return {
    smallID: p.smallID(),
    id: p.id(),
    type: p.type(),
    name: p.name(),
    flag: p.info().nationFlag,
  };
}

/** The chatter's read-only view, answered from the engine's own Game. */
function engineWorld(game: Game): ChatterWorld {
  const bySmallID = (id: number): Player | null => {
    const p = game.playerBySmallID(id);
    return p.isPlayer() ? (p as Player) : null;
  };
  return {
    gameID: () => "SNAPTEST1",
    map: () => game.config().gameConfig().gameMap,
    ticks: () => game.ticks(),
    inSpawnPhase: () => game.inSpawnPhase(),
    player: (id) => {
      const p = bySmallID(id);
      return p === null ? null : info(p);
    },
    playerById: (id) => (game.hasPlayer(id) ? info(game.player(id)) : null),
    playerByClientID: (id) => {
      const p = game.playerByClientID(id);
      return p === null ? null : info(p);
    },
    players: () => game.allPlayers().map(info),
    nations: () =>
      game
        .allPlayers()
        .filter((p) => p.type() === PlayerType.Nation)
        .map(info),
    tiles: (id) => bySmallID(id)?.numTilesOwned() ?? 0,
    isAlive: (id) => bySmallID(id)?.isAlive() ?? false,
    allies: (id) =>
      bySmallID(id)
        ?.allies()
        .map((a) => a.smallID()) ?? [],
    numLandTiles: () => game.numLandTiles(),
  };
}

interface Run {
  hashes: number;
  lastHash: number;
  lines: ChatterLine[];
  names: Map<number, string>;
}

async function play(withChat: boolean): Promise<Run> {
  let last: GameUpdateViewData | null = null;
  const runner = await createGameRunner(
    scriptedGameStart(),
    undefined,
    new TestDataMapLoader("world"),
    (gu: GameUpdateViewData | ErrorUpdate) => {
      if ("errMsg" in gu) throw new Error(`${gu.errMsg}\n${gu.stack}`);
      last = gu;
    },
  );
  const game = runner.game;
  const chatter = withChat ? new NationChatter(engineWorld(game)) : null;
  const hashes: number[] = [];
  const lines: ChatterLine[] = [];
  let seq = 0;
  while (game.ticks() < TICKS) {
    runner.addTurn(scriptedTurn(game));
    if (!runner.executeNextTick()) throw new Error("tick failed");
    const tick = game.ticks();
    if (chatter !== null && last !== null) {
      lines.push(...chatter.tick((last as GameUpdateViewData).updates));
      // Every 30 seconds a human talks to a nation by name, the way a
      // chat line from the server reaches the chatter.
      if (tick % 300 === 150 && !game.inSpawnPhase()) {
        const nations = game
          .allPlayers()
          .filter((p) => p.type() === PlayerType.Nation && p.isAlive());
        if (nations.length > 0) {
          const n = nations[((tick / 300) % nations.length) | 0];
          const said = [
            `hello ${n.name()}!`,
            `${n.name()} want to be allies?`,
            `I'm coming for you ${n.name()}`,
            `thanks ${n.name()}`,
          ][seq % 4];
          chatter.onChat(SCRIPTED_HUMANS[seq % 3], said, seq++);
        }
      }
    }
    if (tick % CHECK_EVERY === 0) {
      hashes.push((game as unknown as { hash(): number }).hash());
    }
  }
  const names = new Map(game.allPlayers().map((p) => [p.smallID(), p.name()]));
  return {
    hashes: simpleHash(hashes.join(",")),
    lastHash: hashes[hashes.length - 1],
    lines,
    names,
  };
}

describe("chat and the nations' chatter leave the game alone", () => {
  let without: Run;
  let withChat: Run;
  let again: Run;

  beforeAll(async () => {
    without = await play(false);
    withChat = await play(true);
    again = await play(true);
  }, TEST_TIMEOUT);

  test("the game hashes match the game before chat existed", () => {
    expect({ hashes: without.hashes, lastHash: without.lastHash }).toEqual(
      BEFORE_CHAT,
    );
    expect({ hashes: withChat.hashes, lastHash: withChat.lastHash }).toEqual(
      BEFORE_CHAT,
    );
  });

  test("chat is not an intent, so it can never reach a turn", () => {
    expect(
      IntentSchema.safeParse({ type: "chat", channel: "all", text: "hi" })
        .success,
    ).toBe(false);
  });

  test("every client says the same things", () => {
    expect(withChat.lines.length).toBeGreaterThan(5);
    expect(again.lines).toEqual(withChat.lines);
  });

  test("only nations talk, and about what happened", () => {
    for (const line of withChat.lines) {
      expect(line.text).not.toMatch(/\{(?!name\})/);
      expect(line.text.length).toBeLessThanOrEqual(200);
      if (line.text.includes("{name}")) expect(line.about).not.toBeNull();
    }
    const speakers = new Set(withChat.lines.map((l) => l.speaker));
    expect(speakers.size).toBeGreaterThan(2);
    const events = new Set(withChat.lines.map((l) => l.event));
    expect(events.size).toBeGreaterThanOrEqual(4);
    expect(withChat.lines.some((l) => l.reply)).toBe(true);
  });

  test("they don't spam: a few lines a minute at most", () => {
    const told = withChat.lines.filter((l) => !l.reply).map((l) => l.tick);
    for (const t of told) {
      const inMinute = told.filter((u) => u >= t && u < t + 600).length;
      expect(inMinute).toBeLessThanOrEqual(8);
    }
    const minutes = TICKS / 600;
    expect(told.length / minutes).toBeLessThanOrEqual(5);
  });

  test("a sample, for the record", () => {
    const sample = withChat.lines
      .slice(0, 12)
      .map(
        (l) =>
          `${withChat.names.get(l.speaker)} [${l.event}]: ${l.text
            .split("{name}")
            .join(
              l.about === null ? "" : (withChat.names.get(l.about) ?? "?"),
            )}`,
      );
    console.log(sample.join("\n"));
    expect(sample.length).toBeGreaterThan(0);
  });
});
