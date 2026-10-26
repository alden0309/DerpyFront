// DFX (r26): "Random nations" in a scenario lobby: the host's deal of every
// seat (scenario_deal) crosses the wire, only the host may send it, the
// server checks it and every player has a seat after, and the game starts
// with the deal. In a turn it does nothing.

import { GameType } from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import {
  decodeClientMessage,
  encodeClientMessage,
} from "@openfront/shared/ZbinWire";
import { describe, expect, it } from "vitest";
import { dealRandomNations } from "../../src/client/scenario/RandomHistory";
import { authorizeIntent } from "../../src/server/IntentAuthorization";
import { makeClient, makeGame, startGame } from "../util/GameServerHarness";
import { scenarioGame } from "./ScenarioTestUtil";

const HOST = "11111111-1111-4111-8111-111111111111";
const europe = scenarioData("europe1939")!;

function lobby(players = 4) {
  const game = makeGame({
    creatorPersistentID: HOST,
    config: { gameType: GameType.Private },
  });
  const host = makeClient({ persistentID: HOST });
  const others = Array.from({ length: players - 1 }, () => makeClient());
  game.joinClient(host);
  for (const c of others) game.joinClient(c);
  const as = (c: typeof host, isLobbyCreator = false) => ({
    clientID: c.clientID,
    isLobbyCreator,
    isAdmin: false,
    isAdminBot: false,
  });
  game.handleIntent(
    { type: "update_game_config", config: { scenario: { id: "europe1939" } } },
    as(host, true),
  );
  return { game, host, others, as };
}

const seatsOf = (game: ReturnType<typeof makeGame>) =>
  game.gameInfo().gameConfig?.scenario?.seats;

describe("Random nations in a scenario lobby", () => {
  it("crosses the wire as one intent", () => {
    const msg = {
      type: "intent" as const,
      intent: {
        type: "scenario_deal" as const,
        seats: { germany: "AbCdEfGh", poland: "HjKmNpQr" },
      },
    };
    expect(
      decodeClientMessage(encodeClientMessage(msg, undefined), undefined),
    ).toEqual(msg);
  });

  it("only the host deals, and only before the start", () => {
    const deal = { type: "scenario_deal", seats: {} } as const;
    const actor = (isLobbyCreator: boolean) => ({
      clientID: "PLAYERAA",
      isLobbyCreator,
      isAdmin: false,
      isAdminBot: false,
    });
    const state = (o: Partial<{ hasStarted: boolean; isPublic: boolean }>) => ({
      isPublic: false,
      isListed: false,
      isQueued: false,
      hasStarted: false,
      ...o,
    });
    expect(authorizeIntent(deal, actor(true), state({}))).toBeNull();
    expect(authorizeIntent(deal, actor(false), state({}))?.status).toBe(403);
    expect(
      authorizeIntent(deal, actor(true), state({ hasStarted: true }))?.status,
    ).toBe(409);
    expect(
      authorizeIntent(deal, actor(true), state({ isPublic: true }))?.status,
    ).toBe(403);
  });

  it("every player is dealt a free seat; the game starts with the deal", () => {
    const { game, host, others, as } = lobby(5);
    // Someone had picked already: the deal replaces it.
    game.handleIntent(
      { type: "scenario_seat", nation: "france" },
      as(others[0]),
    );
    const players = [host, ...others].map((c) => c.clientID);
    const deal = dealRandomNations(europe, players);
    expect(
      game.handleIntent({ type: "scenario_deal", seats: deal }, as(host, true))
        .status,
    ).toBe(200);
    expect(seatsOf(game)).toEqual(deal);
    expect(new Set(Object.values(seatsOf(game)!))).toEqual(new Set(players));

    // A deal that leaves someone out, or seats someone twice, is refused.
    const short = { ...deal };
    delete short[Object.keys(short)[0]];
    expect(
      game.handleIntent({ type: "scenario_deal", seats: short }, as(host, true))
        .status,
    ).toBe(409);
    expect(seatsOf(game)).toEqual(deal);

    startGame(game);
    const start = (game as unknown as { gameStartInfo: { config: GameConfig } })
      .gameStartInfo;
    expect(start.config.scenario?.seats).toEqual(deal);
  });

  it("refused in a lobby without a scenario", () => {
    const game = makeGame({ creatorPersistentID: HOST });
    const host = makeClient({ persistentID: HOST });
    game.joinClient(host);
    expect(
      game.handleIntent(
        { type: "scenario_deal", seats: {} },
        {
          clientID: host.clientID,
          isLobbyCreator: true,
          isAdmin: false,
          isAdminBot: false,
        },
      ).status,
    ).toBe(409);
  });

  it("in a turn it does nothing (the engine)", async () => {
    const g = await scenarioGame("europe1939", {
      players: [{ clientID: "PLAYERAA", username: "Pat", nation: "poland" }],
    });
    g.runner.addTurn({
      turnNumber: g.game.ticks(),
      intents: [
        {
          type: "scenario_deal",
          seats: { germany: "PLAYERAA" },
          clientID: "PLAYERAA",
        },
      ],
    });
    expect(g.runner.executeNextTick()).toBe(true);
    expect(g.nation("poland").clientID()).toBe("PLAYERAA");
    expect(g.nation("germany").clientID()).toBeNull();
  });
});
