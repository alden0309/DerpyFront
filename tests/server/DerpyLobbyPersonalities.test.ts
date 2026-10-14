// DFSTORE (r21): a lobby's AI personality packs stick only if the host's
// account owns them; the admin bot's are taken as asked.

import { ADMIN_BOT_CLIENT_ID } from "@openfront/engine-api/Schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeClient, makeGame, startGame } from "../util/GameServerHarness";

const HOST = "11111111-1111-4111-8111-111111111111";

function lobby(owned: string[]) {
  const ownedAiPersonalities = vi.fn(
    async (_pid: string, asked: readonly string[]) =>
      asked.filter((p) => owned.includes(p)),
  );
  const game = makeGame({
    creatorPersistentID: HOST,
    deps: { ownedAiPersonalities },
  });
  const host = makeClient({ persistentID: HOST });
  game.joinClient(host);
  const actor = {
    clientID: host.clientID,
    isLobbyCreator: true,
    isAdmin: false,
    isAdminBot: false,
  };
  const ask = async (packs: string[]) => {
    const r = game.handleIntent(
      { type: "update_game_config", config: { aiPersonalities: packs } },
      actor,
    );
    await vi.waitFor(() => expect(ownedAiPersonalities).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    return r;
  };
  return { game, ask, ownedAiPersonalities, actor };
}

describe("a lobby's AI personality packs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the packs the host owns, and drops the rest", async () => {
    const { game, ask, ownedAiPersonalities } = lobby(["ai_pirates"]);
    expect((await ask(["ai_pirates", "ai_empires"])).status).toBe(200);
    expect(ownedAiPersonalities).toHaveBeenCalledWith(HOST, [
      "ai_pirates",
      "ai_empires",
    ]);
    expect(game.gameInfo().gameConfig?.aiPersonalities).toEqual(["ai_pirates"]);
  });

  it("owning none, or turning them off, clears them", async () => {
    const { game, ask } = lobby([]);
    await ask(["ai_pirates"]);
    expect(game.gameInfo().gameConfig?.aiPersonalities).toBeUndefined();
    const owner = lobby(["ai_pirates"]);
    await owner.ask(["ai_pirates"]);
    expect(owner.game.gameInfo().gameConfig?.aiPersonalities).toEqual([
      "ai_pirates",
    ]);
    owner.ownedAiPersonalities.mockClear();
    owner.game.handleIntent(
      { type: "update_game_config", config: { aiPersonalities: [] } },
      owner.actor,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(owner.game.gameInfo().gameConfig?.aiPersonalities).toBeUndefined();
  });

  it("unknown packs are never asked about", async () => {
    const { game, ownedAiPersonalities, actor } = lobby(["ai_pirates"]);
    game.handleIntent(
      { type: "update_game_config", config: { aiPersonalities: ["made_up"] } },
      actor,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(ownedAiPersonalities).not.toHaveBeenCalled();
    expect(game.gameInfo().gameConfig?.aiPersonalities).toBeUndefined();
  });

  it("the other settings in the same update apply at once", () => {
    const { game, actor } = lobby(["ai_pirates"]);
    game.handleIntent(
      {
        type: "update_game_config",
        config: { bots: 7, aiPersonalities: ["ai_pirates"] },
      },
      actor,
    );
    expect(game.gameInfo().gameConfig?.bots).toBe(7);
  });

  it("the admin bot's packs are taken as asked", async () => {
    const game = makeGame();
    game.handleIntent(
      {
        type: "update_game_config",
        config: { aiPersonalities: ["ai_warlords"] },
      },
      {
        clientID: ADMIN_BOT_CLIENT_ID,
        isLobbyCreator: false,
        isAdmin: true,
        isAdminBot: true,
      },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(game.gameInfo().gameConfig?.aiPersonalities).toEqual([
      "ai_warlords",
    ]);
  });

  it("an answer that comes after the game started changes nothing", async () => {
    let answer: (packs: string[]) => void = () => {};
    const ownedAiPersonalities = vi.fn(
      () => new Promise<string[]>((resolve) => (answer = resolve)),
    );
    const game = makeGame({
      creatorPersistentID: HOST,
      deps: { ownedAiPersonalities },
    });
    const host = makeClient({ persistentID: HOST });
    game.joinClient(host);
    game.handleIntent(
      {
        type: "update_game_config",
        config: { aiPersonalities: ["ai_pirates"] },
      },
      {
        clientID: host.clientID,
        isLobbyCreator: true,
        isAdmin: false,
        isAdminBot: false,
      },
    );
    startGame(game);
    answer(["ai_pirates"]);
    await new Promise((r) => setTimeout(r, 0));
    expect(game.gameInfo().gameConfig?.aiPersonalities).toBeUndefined();
  });
});
