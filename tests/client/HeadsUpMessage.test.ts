import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadsUpMessage } from "../../src/client/hud/layers/HeadsUpMessage";

// The words as en.json has them would need the language loaded: the key
// and the time are what this file checks.
vi.mock("../../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Utils")>()),
  translateText: (key: string, params?: Record<string, string | number>) =>
    params?.time !== undefined ? `${key} ${params.time}` : key,
}));

function dispatchPointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    button: 0,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
}

describe("HeadsUpMessage toast gestures", () => {
  let element: HeadsUpMessage;

  beforeEach(async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    if (!customElements.get("heads-up-message")) {
      customElements.define("heads-up-message", HeadsUpMessage);
    }
    element = document.createElement("heads-up-message") as HeadsUpMessage;
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
    vi.unstubAllGlobals();
  });

  async function showToast(): Promise<HTMLElement> {
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: {
          message: "Connection failed",
          color: "red",
          duration: 60_000,
        },
      }),
    );
    await element.updateComplete;
    const toast = element.querySelector<HTMLElement>("[data-game-toast]");
    expect(toast).not.toBeNull();
    Object.defineProperty(toast, "setPointerCapture", { value: () => {} });
    return toast!;
  }

  it("follows a drag and snaps back below the dismissal threshold", async () => {
    const toast = await showToast();

    dispatchPointer(toast, "pointerdown", 10, 10);
    dispatchPointer(toast, "pointermove", 50, 30);
    await element.updateComplete;
    expect(
      element.querySelector<HTMLElement>("[data-game-toast-content]")?.style
        .transform,
    ).toBe("translate3d(40px, 20px, 0)");

    dispatchPointer(toast, "pointerup", 50, 30);
    await element.updateComplete;
    expect(element.querySelector("[data-game-toast]")).not.toBeNull();
    expect(
      element.querySelector<HTMLElement>("[data-game-toast-content]")?.style
        .transform,
    ).toBe("translate3d(0px, 0px, 0)");
  });

  it("dismisses the toast after dragging past the threshold", async () => {
    const toast = await showToast();

    dispatchPointer(toast, "pointerdown", 0, 0);
    dispatchPointer(toast, "pointermove", 80, 0);
    dispatchPointer(toast, "pointerup", 80, 0);
    await element.updateComplete;

    expect(element.querySelector("[data-game-toast]")).toBeNull();
  });

  it("uses the final pointer position when no move event arrives", async () => {
    const toast = await showToast();

    dispatchPointer(toast, "pointerdown", 0, 0);
    dispatchPointer(toast, "pointerup", 80, 0);
    await element.updateComplete;

    expect(element.querySelector("[data-game-toast]")).toBeNull();
  });

  it("restores the toast when the pointer gesture is cancelled", async () => {
    const toast = await showToast();

    dispatchPointer(toast, "pointerdown", 0, 0);
    dispatchPointer(toast, "pointermove", 100, 20);
    dispatchPointer(toast, "pointercancel", 100, 20);
    await element.updateComplete;

    expect(element.querySelector("[data-game-toast]")).not.toBeNull();
    expect(
      element.querySelector<HTMLElement>("[data-game-toast-content]")?.style
        .transform,
    ).toBe("translate3d(0px, 0px, 0)");
  });
});

// SCEN3 (r27): a scenario hold's countdown ("North Korea holds the South:
// 2:14"), from the engine's news when the hold starts, gone when it breaks.
describe("HeadsUpMessage scenario hold countdown", () => {
  let element: HeadsUpMessage;
  let ticks = 1000;
  let events: { message: string; params?: Record<string, unknown> }[] = [];
  let wins: unknown[] = [];

  const game = {
    ticks: () => ticks,
    updatesSinceLastTick: () => ({
      [GameUpdateType.DisplayEvent]: events,
      [GameUpdateType.GamePaused]: [],
      [GameUpdateType.Win]: wins,
    }),
    inSpawnPhase: () => false,
    isSpawnImmunityActive: () => false,
    isCatchingUp: () => false,
    elapsedGameSeconds: () => ticks / 10,
    config: () => ({
      hasExtendedSpawnImmunity: () => false,
      numSpawnPhaseTurns: () => 100,
      isReplay: () => false,
      isIntentionalSpectator: () => false,
      isRandomSpawn: () => false,
      spawnImmunityDuration: () => 50,
      overtimeConfig: () => ({ enabled: false, startMinutes: 30 }),
      gameConfig: () => ({}),
    }),
  };

  beforeEach(async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    if (!customElements.get("heads-up-message")) {
      customElements.define("heads-up-message", HeadsUpMessage);
    }
    element = document.createElement("heads-up-message") as HeadsUpMessage;
    element.game = game as never;
    document.body.appendChild(element);
    ticks = 1000;
    events = [];
    wins = [];
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
    vi.unstubAllGlobals();
  });

  const banner = () =>
    element.querySelector<HTMLElement>("[data-scenario-hold]");

  it("counts down from the hold's start to its end, and goes when the hold breaks", async () => {
    element.tick();
    await element.updateComplete;
    expect(banner()).toBeNull();
    events = [
      {
        message: "events_display.scenario_hold_started_northkorea",
        params: { side: "NorthKorea", until: 2500, time: "2:30" },
      },
    ];
    element.tick();
    await element.updateComplete;
    expect(banner()?.textContent).toContain("2:30");
    expect(banner()?.textContent).toContain(
      "heads_up_message.scenario_hold_northkorea",
    );
    events = [];
    ticks = 1000 + 64 * 10;
    element.tick();
    await element.updateComplete;
    expect(banner()?.textContent).toContain("1:26");
    events = [
      {
        message: "events_display.scenario_hold_broken_northkorea",
        params: { side: "NorthKorea" },
      },
    ];
    element.tick();
    await element.updateComplete;
    expect(banner()).toBeNull();
  });

  it("goes when the war ends", async () => {
    events = [
      {
        message: "events_display.scenario_hold_started_northkorea",
        params: { side: "NorthKorea", until: 2500, time: "2:30" },
      },
    ];
    element.tick();
    await element.updateComplete;
    expect(banner()).not.toBeNull();
    events = [];
    ticks = 2500;
    wins = [{ winner: ["team", "NorthKorea"] }];
    element.tick();
    await element.updateComplete;
    expect(banner()).toBeNull();
  });
});
