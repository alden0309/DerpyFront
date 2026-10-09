import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameType } from "@openfront/engine-api/game/GameTypes";
import {
  CHAT_BURST,
  CHAT_MAX_LENGTH,
  CHAT_REFILL_MS,
  normalizeChatText,
} from "@openfront/shared/Chat";
import { censorChatText } from "@openfront/shared/Profanity";
import {
  ServerChatMessage,
  ServerMessage,
} from "@openfront/shared/WireSchemas";
import { createGameWireContext } from "@openfront/shared/ZbinWire";
import { ClientMsgRateLimiter } from "../../src/server/ClientMsgRateLimiter";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

describe("normalizeChatText", () => {
  it("trims and collapses whitespace, newlines included", () => {
    expect(normalizeChatText("  hello \n\n  there\t friend  ")).toBe(
      "hello there friend",
    );
  });

  it("drops control and invisible characters", () => {
    expect(normalizeChatText("he\u0000ll​o‮!")).toBe("hello!");
  });

  it("is empty for nothing to send", () => {
    expect(normalizeChatText(" \n​ ")).toBe("");
  });

  it("cuts to the length limit without splitting an emoji", () => {
    const long = "a".repeat(CHAT_MAX_LENGTH - 1) + "😀😀";
    const out = normalizeChatText(long);
    expect(out.length).toBeLessThanOrEqual(CHAT_MAX_LENGTH);
    expect(out).toBe("a".repeat(CHAT_MAX_LENGTH - 1));
    expect(normalizeChatText("b".repeat(500))).toHaveLength(CHAT_MAX_LENGTH);
  });
});

describe("censorChatText", () => {
  it("stars out profanity and slurs, letter for letter", () => {
    expect(censorChatText("what the fuck")).toBe("what the ****");
    expect(censorChatText("you nazi")).toBe("you ****");
    expect(censorChatText("n i g g e r")).not.toMatch(/[a-z]/);
    expect(censorChatText("niiiigger")).not.toMatch(/[a-z]/);
    expect(censorChatText("white power")).toBe("***** *****");
    expect(censorChatText("kkk")).toBe("***");
    const text = "shit happens, ok?";
    expect(censorChatText(text)).toHaveLength(text.length);
  });

  it("leaves ordinary words alone", () => {
    for (const ok of [
      "I like spicy food",
      "that was despicable",
      "Heilbronn and Scunthorpe",
      "Holy Michael Nazario",
      "class assassin analysis cocktail",
      "Germany, want to be allies?",
      "Niger and the Niger River",
    ]) {
      expect(censorChatText(ok)).toBe(ok);
    }
  });
});

describe("chat rate limit", () => {
  afterEach(() => vi.useRealTimers());

  it("allows a burst, then one line per refill", () => {
    vi.useFakeTimers();
    const limiter = new ClientMsgRateLimiter();
    const A = "clientA" as any;
    for (let i = 0; i < CHAT_BURST; i++) {
      expect(limiter.check(A, "chat", 100)).toBe("ok");
    }
    expect(limiter.check(A, "chat", 100)).toBe("limit");
    vi.advanceTimersByTime(CHAT_REFILL_MS);
    expect(limiter.check(A, "chat", 100)).toBe("ok");
    expect(limiter.check(A, "chat", 100)).toBe("limit");
    // Per client.
    expect(limiter.check("clientB" as any, "chat", 100)).toBe("ok");
  });

  it("never lets more than twenty through in a minute", () => {
    vi.useFakeTimers();
    const limiter = new ClientMsgRateLimiter();
    const A = "clientA" as any;
    let ok = 0;
    for (let s = 0; s < 60; s++) {
      if (limiter.check(A, "chat", 100) === "ok") ok++;
      vi.advanceTimersByTime(900);
    }
    expect(ok).toBeLessThanOrEqual(20);
  });

  it("kicks a frame far bigger than any chat line", () => {
    const limiter = new ClientMsgRateLimiter();
    expect(limiter.check("clientA" as any, "chat", 5000)).toBe("kick");
  });
});

describe("GameServer chat relay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function setup() {
    const A = cid("alice");
    const B = cid("bob");
    const C = cid("carol");
    const W = cid("watcher");
    const game = makeGame({
      creatorPersistentID: "alice-pid",
      config: { gameType: GameType.Private, maxPlayers: 3 },
    });
    const alice = makeClient({ clientID: A, persistentID: "alice-pid" });
    const bob = makeClient({ clientID: B });
    const carol = makeClient({ clientID: C });
    const watcher = makeClient({ clientID: W, spectator: true });
    for (const c of [alice, bob, carol, watcher]) game.joinClient(c);
    const ctx = createGameWireContext([
      { clientID: A },
      { clientID: B },
      { clientID: C },
    ]);
    return { game, alice, bob, carol, watcher, ctx, A, B, C };
  }

  const chats = (msgs: ServerMessage[]): ServerChatMessage[] =>
    msgs.filter((m): m is ServerChatMessage => m.type === "chat");

  it("sends an all-players line to everyone, spectators included, unfiltered", async () => {
    const { game, alice, bob, carol, watcher, ctx, A } = setup();
    startGame(game);
    await mockWsOf(alice).emit({
      type: "chat",
      channel: "all",
      text: "  hello   shit  ",
    });
    for (const c of [alice, bob, carol, watcher]) {
      expect(chats(mockWsOf(c).sent(ctx))).toEqual([
        { type: "chat", from: A, channel: "all", text: "hello shit", seq: 0 },
      ]);
    }
  });

  it("sends a team or allies line only to the listed players and the sender", async () => {
    const { game, alice, bob, carol, watcher, ctx, B } = setup();
    startGame(game);
    await mockWsOf(alice).emit({
      type: "chat",
      channel: "allies",
      text: "attack carol at dawn",
      to: [B],
    });
    expect(chats(mockWsOf(alice).sent(ctx))).toHaveLength(1);
    expect(chats(mockWsOf(bob).sent(ctx))).toHaveLength(1);
    expect(chats(mockWsOf(carol).sent(ctx))).toHaveLength(0);
    expect(chats(mockWsOf(watcher).sent(ctx))).toHaveLength(0);
  });

  it("never puts chat in a turn", async () => {
    const { game, alice, bob, ctx } = setup();
    startGame(game);
    await mockWsOf(alice).emit({ type: "chat", channel: "all", text: "hi" });
    vi.advanceTimersByTime(500);
    const turns = mockWsOf(bob)
      .sent(ctx)
      .filter((m) => m.type === "turn");
    expect(turns.length).toBeGreaterThan(0);
    for (const t of turns) {
      if (t.type !== "turn") continue;
      expect(t.turn.intents.map((i) => i.type)).not.toContain("chat");
    }
  });

  it("ignores spectators and the lobby", async () => {
    const { game, alice, bob, watcher, ctx } = setup();
    await mockWsOf(alice).emit({ type: "chat", channel: "all", text: "early" });
    startGame(game);
    await mockWsOf(watcher).emit({ type: "chat", channel: "all", text: "hi" });
    expect(chats(mockWsOf(bob).sent(ctx))).toEqual([]);
  });

  it("drops lines over the rate limit instead of kicking", async () => {
    const { game, alice, bob, ctx } = setup();
    startGame(game);
    for (let i = 0; i < CHAT_BURST + 3; i++) {
      await mockWsOf(alice).emit({
        type: "chat",
        channel: "all",
        text: `${i}`,
      });
    }
    expect(chats(mockWsOf(bob).sent(ctx))).toHaveLength(CHAT_BURST);
    expect(mockWsOf(alice).close).not.toHaveBeenCalled();
  });
});
