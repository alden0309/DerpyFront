/**
 * The in-game chat panel: which lines it shows (channel checks against this
 * client's own view of teams and alliances, mutes), what it sends and to
 * whom, the client-side rate limit, and the nations' chatter switch.
 */

vi.mock("lit", () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
  nothing: Symbol("nothing"),
  LitElement: class extends EventTarget {
    updateComplete = Promise.resolve(true);
    requestUpdate() {}
  },
}));

vi.mock("lit/decorators.js", () => ({
  customElement: () => (clazz: unknown) => clazz,
  state: () => () => {},
  property: () => () => {},
  query: () => () => {},
}));

vi.mock("../../../../src/client/Utils", () => ({
  translateText: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  formatKeyForDisplay: (k: string) => k,
}));

import {
  GameMapType,
  GameMode,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { CHAT_BURST } from "@openfront/shared/Chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendChatEvent } from "../../../../src/client/chat/ChatEvents";
import { ChatDisplay } from "../../../../src/client/hud/layers/ChatDisplay";

interface FakePlayer {
  smallID(): number;
  clientID(): string | null;
  id(): string;
  type(): PlayerType;
  displayName(): string;
  isPlayer(): boolean;
  isAlive(): boolean;
  team(): string | null;
  isOnSameTeam(o: FakePlayer): boolean;
  isAlliedWith(o: FakePlayer): boolean;
}

function fakePlayer(
  smallID: number,
  clientID: string | null,
  name: string,
  type: PlayerType,
  allies: number[] = [],
): FakePlayer {
  return {
    smallID: () => smallID,
    clientID: () => clientID,
    id: () => `p${smallID}`,
    type: () => type,
    displayName: () => name,
    isPlayer: () => true,
    isAlive: () => true,
    team: () => null,
    isOnSameTeam: () => false,
    isAlliedWith: (o) => allies.includes(o.smallID()),
  };
}

const alice = fakePlayer(1, "AAAAAAAA", "Alice", PlayerType.Human, [2, 4]);
const bob = fakePlayer(2, "BBBBBBBB", "Bob", PlayerType.Human, [1]);
const carol = fakePlayer(3, "CCCCCCCC", "Carol", PlayerType.Human);
const germany = fakePlayer(4, null, "Germany", PlayerType.Nation, [1]);
const all = [alice, bob, carol, germany];

interface Entry {
  kind: string;
  channel: string;
  from?: number;
  text: string;
}

interface Panel {
  entries: Entry[];
  unread: number;
  channel: string;
  draft: string;
  open: boolean;
  game: unknown;
  eventBus: unknown;
  init(): void;
  onReceive(m: unknown): void;
  send(): void;
  toggleMute(id: number): void;
  addNationLine(l: unknown): void;
  toggleAi(): void;
}

describe("ChatDisplay", () => {
  let panel: Panel;
  let emitted: unknown[];
  let me: FakePlayer | null;

  const chat = (from: string, channel: string, text: string, seq = 0) => ({
    type: "chat",
    from,
    channel,
    text,
    seq,
  });
  const lines = (kind = "player") =>
    panel.entries.filter((e) => e.kind === kind);
  const system = () => lines("system").map((e) => e.text);
  const last = (xs: string[]) => xs[xs.length - 1];

  beforeEach(() => {
    localStorage.clear();
    me = alice;
    emitted = [];
    panel = new ChatDisplay() as unknown as Panel;
    panel.eventBus = { on: vi.fn(), emit: (e: unknown) => emitted.push(e) };
    panel.game = {
      myPlayer: () => me,
      players: () => all,
      playerByClientID: (id: string) =>
        all.find((p) => p.clientID() === id) ?? null,
      playerBySmallID: (id: number) => all.find((p) => p.smallID() === id),
      config: () => ({
        isReplay: () => false,
        gameConfig: () => ({
          gameMode: GameMode.FFA,
          gameMap: GameMapType.World,
        }),
      }),
      updatesSinceLastTick: () => null,
      ticks: () => 100,
    };
    panel.init();
  });

  afterEach(() => vi.useRealTimers());

  it("greets with the house rules", () => {
    expect(system()).toEqual(["game_chat.welcome"]);
  });

  it("shows other players' lines and counts them unread while folded", () => {
    panel.onReceive(chat("BBBBBBBB", "all", "hello all"));
    expect(lines()).toMatchObject([{ from: 2, text: "hello all" }]);
    expect(panel.unread).toBe(1);
  });

  it("does not count your own line as unread", () => {
    panel.onReceive(chat("AAAAAAAA", "all", "me"));
    expect(lines()).toHaveLength(1);
    expect(panel.unread).toBe(0);
  });

  it("drops an allies line from someone who is not an ally here", () => {
    panel.onReceive(chat("CCCCCCCC", "allies", "secret"));
    panel.onReceive(chat("CCCCCCCC", "team", "secret"));
    panel.onReceive(chat("BBBBBBBB", "allies", "real ally"));
    expect(lines().map((e) => e.text)).toEqual(["real ally"]);
  });

  it("hides a muted player, and says so", () => {
    panel.onReceive(chat("BBBBBBBB", "all", "before"));
    panel.toggleMute(2);
    panel.onReceive(chat("BBBBBBBB", "all", "after"));
    expect(lines()).toHaveLength(0);
    expect(last(system())).toContain("game_chat.muted");
    panel.toggleMute(2);
    panel.onReceive(chat("BBBBBBBB", "all", "again"));
    expect(lines().map((e) => e.text)).toEqual(["again"]);
  });

  it("sends everyone's line without a recipient list", () => {
    panel.draft = "  hi   there ";
    panel.send();
    expect(emitted).toEqual([new SendChatEvent("all", "hi there", [])]);
    expect(panel.draft).toBe("");
  });

  it("sends an allies line to the allied players only", () => {
    panel.channel = "allies";
    panel.draft = "go north";
    panel.send();
    // Germany is an ally too, but a nation has no ears on the wire.
    expect(emitted).toEqual([
      new SendChatEvent("allies", "go north", ["BBBBBBBB"]),
    ]);
  });

  it("says when nobody would hear a team line", () => {
    panel.channel = "team";
    panel.draft = "anyone?";
    panel.send();
    expect(emitted).toEqual([]);
    expect(last(system())).toBe("game_chat.no_team");
    expect(panel.draft).toBe("anyone?");
  });

  it("asks you to slow down rather than lose a line", () => {
    vi.useFakeTimers();
    for (let i = 0; i < CHAT_BURST + 2; i++) {
      panel.draft = `line ${i}`;
      panel.send();
    }
    expect(emitted).toHaveLength(CHAT_BURST);
    expect(last(system())).toBe("game_chat.slow_down");
    vi.advanceTimersByTime(2_000);
    panel.draft = "later";
    panel.send();
    expect(emitted).toHaveLength(CHAT_BURST + 1);
  });

  it("lets spectators read but not send", () => {
    me = null;
    panel.onReceive(chat("BBBBBBBB", "all", "hello watcher"));
    panel.draft = "can I talk?";
    panel.send();
    expect(lines()).toHaveLength(1);
    expect(emitted).toEqual([]);
  });

  it("shows the nations' lines, unless their chatter is switched off", () => {
    const line = {
      speaker: 4,
      event: "idle",
      text: "Wunderbar!",
      about: null,
      tick: 100,
      reply: false,
    };
    panel.addNationLine(line);
    expect(lines("ai")).toMatchObject([{ from: 4, text: "Wunderbar!" }]);
    panel.toggleAi();
    expect(localStorage.getItem("settings.aiChatter")).toBe("false");
    expect(last(system())).toBe("game_chat.ai_off");
  });
});
