import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenChatEvent } from "../../src/client/chat/ChatEvents";
import {
  PROGRESSION_ENABLED,
  QUICK_CHAT_SHORTCUTS_ENABLED,
} from "../../src/client/derpy/UpstreamFeatures";
import {
  DoTargetPlayerEvent,
  InputHandler,
  RefreshGraphicsEvent,
  ShowChatMenuEvent,
} from "../../src/client/InputHandler";
import {
  getDefaultKeybinds,
  KEYBINDS_KEY,
  UserSettings,
} from "../../src/client/UserSettings";
import { GameView } from "../../src/client/view";

// Derpy Front (r24): OpenFront's XP and its preset-phrase quick chat on R are
// switched off on our site. Our typed chat stays on Enter, and OpenFront's
// target key sits on J (N builds a Dome of Alden).
describe("Derpy Front: OpenFront features switched off", () => {
  it("has XP and the quick chat shortcuts off", () => {
    expect(PROGRESSION_ENABLED).toBe(false);
    expect(QUICK_CHAT_SHORTCUTS_ENABLED).toBe(false);
  });

  it("binds no key to quick chat, J to target and N to the Dome", () => {
    for (const isMac of [false, true]) {
      const keybinds = getDefaultKeybinds(isMac);
      expect(keybinds.quickChat).toBeUndefined();
      expect(keybinds.openChat).toBe("Enter");
      expect(keybinds.targetPlayer).toBe("KeyJ");
      expect(keybinds.buildDome).toBe("KeyN");
      expect(keybinds.emojiMenu).toBe("KeyF");
      // R is left to reset graphics (with its modifier).
      const onR = Object.entries(keybinds)
        .filter(([, key]) => key === "KeyR")
        .map(([action]) => action);
      expect(onR).toEqual(["resetGfx"]);
      // Nothing else is on J.
      const onJ = Object.entries(keybinds)
        .filter(([, key]) => key === "KeyJ")
        .map(([action]) => action);
      expect(onJ).toEqual(["targetPlayer"]);
    }
  });

  describe("keys in game", () => {
    let input: InputHandler;
    let bus: EventBus;
    let canvas: HTMLCanvasElement;

    beforeEach(() => {
      new UserSettings().removeCached(KEYBINDS_KEY, false);
      bus = new EventBus();
      canvas = document.createElement("canvas");
      input = new InputHandler(
        {
          inSpawnPhase: () => false,
          myPlayer: () => ({ isAlive: () => true }),
        } as GameView,
        {
          attackRatio: 20,
          ghostStructure: null,
          rocketDirectionUp: true,
          upgradeMultiplier: 1,
        },
        canvas,
        bus,
      );
      input.initialize();
    });

    afterEach(() => {
      input.destroy();
    });

    function heard() {
      const seen = { chatMenu: 0, refresh: 0, target: 0, chat: 0 };
      bus.on(ShowChatMenuEvent, () => seen.chatMenu++);
      bus.on(RefreshGraphicsEvent, () => seen.refresh++);
      bus.on(DoTargetPlayerEvent, () => seen.target++);
      bus.on(OpenChatEvent, () => seen.chat++);
      return seen;
    }

    it("R on its own does nothing", () => {
      const seen = heard();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyR" }));
      expect(seen).toEqual({ chatMenu: 0, refresh: 0, target: 0, chat: 0 });
    });

    it("Alt+R still resets graphics", () => {
      const seen = heard();
      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "KeyR", altKey: true }),
      );
      expect(seen.refresh).toBe(1);
      expect(seen.chatMenu).toBe(0);
    });

    it("J targets, Enter opens our chat", () => {
      const seen = heard();
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyJ" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Enter" }));
      expect(seen.target).toBe(1);
      expect(seen.chat).toBe(1);
      expect(seen.chatMenu).toBe(0);
    });
  });
});
