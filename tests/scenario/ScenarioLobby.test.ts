// SCEN (r25): picking nations in a scenario lobby, and the settings a
// scenario fixes.

import {
  GameMapType,
  GameMode,
  GameType,
} from "@openfront/engine-api/game/GameTypes";
import {
  SCENARIO_EDITION,
  scenarioEdition,
  scenarioReplayable,
} from "@openfront/engine-api/game/Scenarios";
import { GameConfig } from "@openfront/engine-api/Schemas";
import {
  applyScenarioRules,
  changeScenarioSeat,
  scenarioSeatCount,
} from "@openfront/engine-lib/scenario/ScenarioConfig";
import { scenarioData } from "@openfront/engine-lib/scenario/ScenarioData";
import { describe, expect, it } from "vitest";
import { applyGameConfigPatch } from "../../src/server/ConfigPatch";
import { authorizeIntent } from "../../src/server/IntentAuthorization";
import { makeClient, makeGame, startGame } from "../util/GameServerHarness";
import { testGameConfig } from "../util/Wire";

const europe = scenarioData("europe1939")!;
const HOST = "11111111-1111-4111-8111-111111111111";

describe("a scenario's fixed settings", () => {
  it("sets its map, team mode with its sides, no tribes and a seat cap", () => {
    const c = applyScenarioRules(
      testGameConfig({
        gameMap: GameMapType.World,
        bots: 400,
        randomSpawn: true,
        nations: 3,
        maxPlayers: 99,
        scenario: { id: "europe1939" },
      }),
    );
    expect(c.gameMap).toBe(GameMapType.Europe);
    expect(c.gameMode).toBe(GameMode.Team);
    expect(c.playerTeams).toBe(2);
    expect(c.bots).toBe(0);
    expect(c.randomSpawn).toBe(false);
    expect(c.nations).toBe("default");
    expect(c.maxPlayers).toBe(scenarioSeatCount(europe));
    expect(scenarioSeatCount(europe)).toBe(europe.nations.length);
    // The host's own options stay.
    expect(c.difficulty).toBe(testGameConfig().difficulty);
  });

  it("leaves an ordinary config alone", () => {
    const before = testGameConfig({ bots: 400, randomSpawn: true });
    const after = applyScenarioRules({ ...before });
    expect(after).toEqual(before);
  });

  it("a host's patch picks the scenario; seats come only from the players", () => {
    const target: GameConfig = testGameConfig();
    applyGameConfigPatch(target, {
      bots: 50,
      scenario: { id: "colonies1776", seats: { virginia: "PLAYERAA" } },
    });
    // Played under this edition of the scenarios, on the scenario's map.
    expect(target.scenario).toEqual({
      id: "colonies1776",
      seats: {},
      edition: scenarioEdition("colonies1776"),
    });
    expect(target.gameMap).toBe(GameMapType.AmericanRevolutionDetailed);
    expect(target.bots).toBe(0);
    // The same scenario again keeps the seats taken meanwhile.
    target.scenario!.seats = { virginia: "PLAYERAA" };
    applyGameConfigPatch(target, { scenario: { id: "colonies1776" } });
    expect(target.scenario!.seats).toEqual({ virginia: "PLAYERAA" });
    // So does a patch without one (the host changing an option).
    applyGameConfigPatch(target, { difficulty: testGameConfig().difficulty });
    expect(target.scenario!.seats).toEqual({ virginia: "PLAYERAA" });
    // Another scenario starts over.
    applyGameConfigPatch(target, { scenario: { id: "continental1776" } });
    expect(target.scenario).toEqual({
      id: "continental1776",
      seats: {},
      edition: SCENARIO_EDITION,
    });
  });
});

describe("old scenario games", () => {
  it("replay only under the edition they were played in", () => {
    // Round 1's games recorded no edition: their 1776 was on the plain map,
    // without the fronts, so their replays are refused like another build's.
    expect(scenarioReplayable({})).toBe(true);
    expect(scenarioReplayable({ scenario: { id: "colonies1776" } })).toBe(
      false,
    );
    expect(
      scenarioReplayable({
        scenario: { id: "europe1939", edition: SCENARIO_EDITION - 1 },
      }),
    ).toBe(false);
    const config: GameConfig = applyScenarioRules({
      ...testGameConfig(),
      scenario: { id: "colonies1776", seats: {} },
    });
    expect(config.scenario!.edition).toBe(scenarioEdition("colonies1776"));
    expect(scenarioReplayable(config)).toBe(true);
    // An old saved choice of scenario still starts, on the scenario's map.
    const old = applyScenarioRules({
      ...testGameConfig(),
      gameMap: GameMapType.ThirteenColonies,
      scenario: { id: "continental1776" },
    });
    expect(old.gameMap).toBe(GameMapType.AmericanRevolutionDetailed);
  });
});

describe("changing seats", () => {
  const present = new Set(["PLAYERAA", "PLAYERBB", "PLAYERCC"]);
  const change = (
    seats: Record<string, string>,
    clientID: string,
    nation: string | null,
    byHost = false,
  ) => changeScenarioSeat(europe, seats, { clientID, nation, byHost }, present);

  it("takes a free nation, leaving the old one", () => {
    expect(change({}, "PLAYERAA", "france")).toEqual({
      seats: { france: "PLAYERAA" },
    });
    expect(change({ france: "PLAYERAA" }, "PLAYERAA", "germany")).toEqual({
      seats: { germany: "PLAYERAA" },
    });
  });

  it("one player per nation: a taken seat is refused, except by the host", () => {
    expect(change({ france: "PLAYERAA" }, "PLAYERBB", "france")).toEqual({
      error: "seat taken",
    });
    // The host moves PLAYERBB onto France; PLAYERAA is left without a seat.
    expect(
      change(
        { france: "PLAYERAA", italy: "PLAYERBB" },
        "PLAYERBB",
        "france",
        true,
      ),
    ).toEqual({ seats: { france: "PLAYERBB" } });
  });

  it("frees a seat, and a seat whose player left counts as free", () => {
    expect(change({ france: "PLAYERAA" }, "PLAYERAA", null)).toEqual({
      seats: {},
    });
    expect(change({ france: "GONEAWAY" }, "PLAYERBB", "france")).toEqual({
      seats: { france: "PLAYERBB" },
    });
  });

  it("refuses a nation the scenario doesn't have", () => {
    expect(change({}, "PLAYERAA", "narnia")).toEqual({
      error: "no such nation",
    });
  });

  it("only the host seats someone else, and only before the start", () => {
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
    const own = { type: "scenario_seat", nation: "france" } as const;
    const other = { ...own, target: "PLAYERBB" };
    expect(authorizeIntent(own, actor(false), state({}))).toBeNull();
    expect(authorizeIntent(other, actor(false), state({}))?.status).toBe(403);
    expect(authorizeIntent(other, actor(true), state({}))).toBeNull();
    expect(
      authorizeIntent(own, actor(true), state({ hasStarted: true }))?.status,
    ).toBe(409);
    expect(
      authorizeIntent(own, actor(true), state({ isPublic: true }))?.status,
    ).toBe(403);
  });
});

describe("a scenario lobby", () => {
  function lobby() {
    const game = makeGame({
      creatorPersistentID: HOST,
      config: { gameType: GameType.Private },
    });
    const host = makeClient({ persistentID: HOST });
    const guest = makeClient();
    const third = makeClient();
    game.joinClient(host);
    game.joinClient(guest);
    game.joinClient(third);
    const as = (c: typeof host, isLobbyCreator = false) => ({
      clientID: c.clientID,
      isLobbyCreator,
      isAdmin: false,
      isAdminBot: false,
    });
    game.handleIntent(
      {
        type: "update_game_config",
        config: { scenario: { id: "europe1939" } },
      },
      as(host, true),
    );
    return { game, host, guest, third, as };
  }
  const seatsOf = (game: ReturnType<typeof makeGame>) =>
    game.gameInfo().gameConfig?.scenario?.seats;

  it("players pick nations, the host moves them, and the start keeps the picks", () => {
    const { game, host, guest, third, as } = lobby();
    expect(game.gameInfo().gameConfig?.gameMap).toBe(GameMapType.Europe);
    const seat = (
      by: typeof host,
      nation: string | null,
      target?: string,
      isHost = false,
    ) =>
      game.handleIntent(
        { type: "scenario_seat", nation, ...(target ? { target } : {}) },
        as(by, isHost),
      ).status;
    expect(seat(host, "united_kingdom", undefined, true)).toBe(200);
    expect(seat(guest, "germany")).toBe(200);
    // One player per nation.
    expect(seat(third, "germany")).toBe(409);
    // A guest can't move someone else.
    expect(seat(third, "italy", guest.clientID)).toBe(403);
    // The host moves the guest to Italy, then frees the third's pick.
    expect(seat(host, "italy", guest.clientID, true)).toBe(200);
    expect(seat(third, "germany")).toBe(200);
    expect(seat(host, null, third.clientID, true)).toBe(200);
    expect(seatsOf(game)).toEqual({
      united_kingdom: host.clientID,
      italy: guest.clientID,
    });
    startGame(game);
    const start = (
      game as unknown as {
        gameStartInfo: { config: GameConfig; players: { clientID: string }[] };
      }
    ).gameStartInfo;
    expect(start.config.scenario?.seats).toEqual({
      united_kingdom: host.clientID,
      italy: guest.clientID,
    });
    expect(start.config.gameMode).toBe(GameMode.Team);
    expect(start.players).toHaveLength(3);
    // No more seat changes once it has begun.
    expect(seat(guest, "france")).toBe(409);
  });

  it("refuses seats in a lobby without a scenario", () => {
    const game = makeGame({ creatorPersistentID: HOST });
    const host = makeClient({ persistentID: HOST });
    game.joinClient(host);
    expect(
      game.handleIntent(
        { type: "scenario_seat", nation: "france" },
        {
          clientID: host.clientID,
          isLobbyCreator: true,
          isAdmin: false,
          isAdminBot: false,
        },
      ).status,
    ).toBe(409);
  });
});
