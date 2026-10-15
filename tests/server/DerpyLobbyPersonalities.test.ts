// DFSTORE (r21), AIP (r23): a lobby's AI personalities stick only if the
// host's account owns them (Normal is free); the admin bot's are taken as
// asked.

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
  const ask = async (choices: string[]) => {
    const r = game.handleIntent(
      { type: "update_game_config", config: { aiPersonalities: choices } },
      actor,
    );
    await vi.waitFor(() => expect(ownedAiPersonalities).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    return r;
  };
  return { game, ask, ownedAiPersonalities, actor };
}

const config = (game: ReturnType<typeof makeGame>) =>
  game.gameInfo().gameConfig?.aiPersonalities;

describe("a lobby's AI personalities", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps Normal and the personalities the host owns, and drops the rest", async () => {
    const { game, ask, ownedAiPersonalities } = lobby(["trader"]);
    expect((await ask(["protector", "normal", "trader"])).status).toBe(200);
    // Only the personalities are asked about, in store order
    expect(ownedAiPersonalities).toHaveBeenCalledWith(HOST, [
      "trader",
      "protector",
    ]);
    expect(config(game)).toEqual(["normal", "trader"]);
  });

  it("one, several or all of them", async () => {
    const all = ["mad_scientist", "trader", "aggressive", "protector"];
    const one = lobby(all);
    await one.ask(["aggressive"]);
    expect(config(one.game)).toEqual(["aggressive"]);
    const every = lobby(all);
    await every.ask(["normal", ...all]);
    expect(config(every.game)).toEqual(["normal", ...all]);
  });

  it("owning none, only Normal, or turning them off, clears them", async () => {
    const { game, ask } = lobby([]);
    await ask(["normal", "trader"]);
    expect(config(game)).toBeUndefined();
    const owner = lobby(["trader"]);
    await owner.ask(["trader"]);
    expect(config(owner.game)).toEqual(["trader"]);
    owner.ownedAiPersonalities.mockClear();
    owner.game.handleIntent(
      { type: "update_game_config", config: { aiPersonalities: ["normal"] } },
      owner.actor,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(owner.ownedAiPersonalities).not.toHaveBeenCalled();
    expect(config(owner.game)).toBeUndefined();
    await owner.ask(["trader"]);
    owner.game.handleIntent(
      { type: "update_game_config", config: { aiPersonalities: [] } },
      owner.actor,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(config(owner.game)).toBeUndefined();
  });

  it("unknown ids, and the old packs, are never asked about", async () => {
    const { game, ownedAiPersonalities, actor } = lobby(["trader"]);
    game.handleIntent(
      {
        type: "update_game_config",
        config: { aiPersonalities: ["made_up", "ai_pirates", "ai_trader"] },
      },
      actor,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(ownedAiPersonalities).not.toHaveBeenCalled();
    expect(config(game)).toBeUndefined();
  });

  it("the other settings in the same update apply at once", () => {
    const { game, actor } = lobby(["trader"]);
    game.handleIntent(
      {
        type: "update_game_config",
        config: { bots: 7, aiPersonalities: ["trader"] },
      },
      actor,
    );
    expect(game.gameInfo().gameConfig?.bots).toBe(7);
  });

  it("the admin bot's personalities are taken as asked", async () => {
    const game = makeGame();
    game.handleIntent(
      {
        type: "update_game_config",
        config: { aiPersonalities: ["protector", "normal"] },
      },
      {
        clientID: ADMIN_BOT_CLIENT_ID,
        isLobbyCreator: false,
        isAdmin: true,
        isAdminBot: true,
      },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(config(game)).toEqual(["normal", "protector"]);
  });

  it("an answer that comes after the game started changes nothing", async () => {
    let answer: (owned: string[]) => void = () => {};
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
        config: { aiPersonalities: ["trader"] },
      },
      {
        clientID: host.clientID,
        isLobbyCreator: true,
        isAdmin: false,
        isAdminBot: false,
      },
    );
    startGame(game);
    answer(["trader"]);
    await new Promise((r) => setTimeout(r, 0));
    expect(config(game)).toBeUndefined();
  });
});
