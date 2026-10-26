// DFX (r26): your Scenario goal's line under the game timer: its words, and
// the state it's in (open, met, missed) as this client sees the war, with
// the engine's end-of-game stats having the last word.

import { goalTileXY } from "@openfront/engine-lib/scenario/ScenarioGoals";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: vi.fn((key: string, p: { minute?: number } = {}) =>
    key === "scenario_goal_text.europe1939.poland"
      ? `Hold Warsaw past minute ${p.minute}`
      : key === "scenario_goal_text.europe1939.germany"
        ? `Take Paris before minute ${p.minute}`
        : key,
  ),
}));

import "../../src/client/components/ScenarioGoalPanel";
import type { ScenarioGoalPanel } from "../../src/client/components/ScenarioGoalPanel";
import type { GameView } from "../../src/client/view";

const ME = "HUMAN001";

/** A Europe 1939 game as the panel sees it: who holds the goal's tile, and the time. */
function game(nation: string, difficulty = "Hard", size = "Normal") {
  const s = {
    seconds: 60,
    owner: "me" as "me" | "them" | "ally",
    spawn: false,
  };
  const compact = size === "Compact";
  const W = compact ? 1452 : 2904;
  const [gx, gy] = goalTileXY("europe1939", nation, compact)!;
  const goalTile = gy * W + gx;
  const me = { id: () => 1, clientID: () => ME, team: () => "Allies" };
  const them = { id: () => 2, team: () => "Axis", isPlayer: () => true };
  const ally = { id: () => 3, team: () => "Allies", isPlayer: () => true };
  const view = {
    myPlayer: () => me,
    scenario: () => ({
      data: { id: "europe1939" },
      seats: new Map([[nation, ME]]),
    }),
    inSpawnPhase: () => s.spawn,
    elapsedGameSeconds: () => s.seconds,
    config: () => ({
      gameConfig: () => ({ gameMapSize: size, difficulty }),
    }),
    isValidCoord: () => true,
    ref: (x: number, y: number) => y * W + x,
    owner: (t: number) => {
      expect(t).toBe(goalTile);
      return s.owner === "me"
        ? { ...me, isPlayer: () => true }
        : s.owner === "ally"
          ? ally
          : them;
    },
  } as unknown as GameView;
  return { s, view };
}

function panel(view: GameView): ScenarioGoalPanel {
  const el = document.createElement("scenario-goal-panel") as ScenarioGoalPanel;
  el.game = view;
  document.body.appendChild(el);
  return el;
}

const state = (el: ScenarioGoalPanel) =>
  el.querySelector("[data-goal-state]")?.getAttribute("data-goal-state");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the goal's line under the timer", () => {
  it("hold: holding until its minute, then met", async () => {
    const { s, view } = game("poland");
    const el = panel(view);
    await el.updateComplete;
    expect(el.textContent).toContain("Hold Warsaw past minute 20");
    expect(state(el)).toBe("open");
    expect(el.textContent).toContain("scenario_goal.holding");
    s.seconds = 20 * 60;
    el.refreshKey = 1;
    await el.updateComplete;
    expect(state(el)).toBe("met");
    // Met stays met.
    s.owner = "them";
    el.refreshKey = 2;
    await el.updateComplete;
    expect(state(el)).toBe("met");
  });

  it("hold: lost at its minute is missed", async () => {
    const { s, view } = game("poland");
    s.owner = "them";
    const el = panel(view);
    await el.updateComplete;
    expect(el.textContent).toContain("scenario_goal.not_holding");
    s.seconds = 20 * 60 + 3;
    el.refreshKey = 1;
    await el.updateComplete;
    expect(state(el)).toBe("missed");
  });

  it("take: met when the place is yours in time; missed after", async () => {
    const { s, view } = game("germany");
    s.owner = "them";
    const el = panel(view);
    await el.updateComplete;
    expect(state(el)).toBe("open");
    s.owner = "me";
    s.seconds = 24 * 60;
    el.refreshKey = 1;
    await el.updateComplete;
    expect(state(el)).toBe("met");

    const late = game("germany");
    late.s.owner = "them";
    late.s.seconds = 25 * 60;
    const el2 = panel(late.view);
    await el2.updateComplete;
    expect(state(el2)).toBe("missed");
  });

  it("on a Compact map its minute is half, in its words and its countdown", async () => {
    const { s, view } = game("poland", "Hard", "Compact");
    const el = panel(view);
    await el.updateComplete;
    expect(el.textContent).toContain("Hold Warsaw past minute 10");
    s.seconds = 10 * 60;
    el.refreshKey = 1;
    await el.updateComplete;
    expect(state(el)).toBe("met");

    const late = game("germany", "Hard", "Compact");
    late.s.owner = "them";
    late.s.seconds = 13 * 60;
    const el2 = panel(late.view);
    await el2.updateComplete;
    expect(el2.textContent).toContain("Take Paris before minute 13");
    expect(state(el2)).toBe("missed");
  });

  it("the end-of-game stats have the last word", async () => {
    const { view } = game("germany");
    const el = panel(view);
    el.hasWinner = true;
    el.finalStats = { [ME]: { goal: 1234 } } as never;
    await el.updateComplete;
    expect(state(el)).toBe("met");
    const other = panel(game("poland").view);
    other.hasWinner = true;
    other.finalStats = { [ME]: {} } as never;
    await other.updateComplete;
    expect(state(other)).toBe("missed");
  });

  it("below Hard it says goals pay on Hard and Impossible", async () => {
    const hard = panel(game("poland").view);
    await hard.updateComplete;
    expect(hard.querySelector("[data-goal-no-pay]")).toBeNull();
    for (const difficulty of ["Easy", "Medium"]) {
      const { s, view } = game("poland", difficulty);
      const el = panel(view);
      await el.updateComplete;
      expect(
        el.querySelector("[data-goal-no-pay]")?.textContent?.trim(),
        difficulty,
      ).toBe("scenario_goal.pays_on_hard");
      // The line still follows the goal.
      s.seconds = 20 * 60;
      el.refreshKey = 1;
      await el.updateComplete;
      expect(state(el)).toBe("met");
    }
  });

  it("hidden outside a scenario and for spectators", async () => {
    const { view } = game("poland");
    (view as unknown as { scenario: () => null }).scenario = () => null;
    const el = panel(view);
    await el.updateComplete;
    expect(el.style.display).toBe("none");
    const watcher = game("poland");
    (watcher.view as unknown as { myPlayer: () => null }).myPlayer = () => null;
    const el2 = panel(watcher.view);
    await el2.updateComplete;
    expect(el2.style.display).toBe("none");
  });
});
