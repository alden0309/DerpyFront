import { GameMapSize } from "@openfront/engine-api/game/GameTypes";
import type { AllPlayersStats } from "@openfront/engine-api/Schemas";
import {
  goalPaysOn,
  goalTileXY,
  scenarioGoal,
  TICKS_PER_MINUTE,
  type ScenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals";
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { goalIcon, goalText } from "../scenario/ScenarioGoalText";
import { translateText } from "../Utils";
import type { GameView } from "../view";

export type GoalState = "open" | "met" | "missed";

/**
 * DFX (r26): your Scenario nation's optional goal, in a line under the game
 * timer ("Hold Warsaw past minute 20"), ticked when it's met. Followed here
 * by the engine's own rules (engine-lib's ScenarioGoals) on what this client
 * sees; when the game ends, the engine's word in the end-of-game stats
 * settles it. Below Hard it says goals pay on Hard and Impossible only.
 * Hidden in other games and for spectators.
 */
@customElement("scenario-goal-panel")
export class ScenarioGoalPanel extends LitElement {
  @property({ attribute: false }) game!: GameView;
  @property({ attribute: false }) hasWinner = false;
  /** The end-of-game stats, once the game is decided (the engine's word). */
  @property({ attribute: false }) finalStats: AllPlayersStats | null = null;
  // Bumped by the parent each tick so the line follows the game.
  @property({ attribute: false }) refreshKey = 0;

  private state: GoalState = "open";
  private tile: number | null | undefined = undefined;

  // Light DOM so Tailwind classes apply and it stacks in the parent's flex.
  createRenderRoot() {
    return this;
  }

  /** Your goal (and nation), or null. */
  private mine(): {
    goal: ScenarioGoal;
    scenario: string;
    nation: string;
  } | null {
    const roster = this.game?.scenario?.() ?? null;
    const me = this.game?.myPlayer();
    if (roster === null || !me) return null;
    const clientID = me.clientID();
    for (const [nation, holder] of roster.seats) {
      if (holder !== clientID) continue;
      const goal = scenarioGoal(roster.data.id, nation);
      return goal === null ? null : { goal, scenario: roster.data.id, nation };
    }
    return null;
  }

  /** Whether you (or your side, for a side goal) hold the goal's place. */
  private holds(goal: ScenarioGoal, scenario: string, nation: string): boolean {
    if (this.tile === undefined) {
      const xy = goalTileXY(
        scenario,
        nation,
        this.game.config().gameConfig().gameMapSize === GameMapSize.Compact,
      );
      this.tile =
        xy !== null && this.game.isValidCoord(xy[0], xy[1])
          ? this.game.ref(xy[0], xy[1])
          : null;
    }
    if (this.tile === null) return false;
    const owner = this.game.owner(this.tile);
    if (!owner.isPlayer()) return false;
    const me = this.game.myPlayer()!;
    if (owner.id() === me.id()) return true;
    const team = me.team();
    return goal.side === true && team !== null && owner.team() === team;
  }

  /** Follows the goal from what this client sees. */
  private follow(goal: ScenarioGoal, scenario: string, nation: string): void {
    const me = this.game.myPlayer();
    if (!me) return;
    const stats = this.finalStats?.[me.clientID() ?? ""];
    if (this.finalStats !== null) {
      // The engine's word settles it.
      this.state = stats?.goal !== undefined ? "met" : "missed";
      return;
    }
    if (this.state !== "open" || this.game.inSpawnPhase()) return;
    const elapsed = Math.floor(this.game.elapsedGameSeconds() * 10);
    const due =
      goal.minute === undefined ? Infinity : goal.minute * TICKS_PER_MINUTE;
    const team = me.team();
    const sideOk =
      goal.onSide === undefined ||
      (goal.onSide === "any" ? team !== null : team === goal.onSide);
    const holds = this.holds(goal, scenario, nation);
    switch (goal.kind) {
      case "take":
        if (holds && elapsed < due) this.state = "met";
        else if (elapsed >= due) this.state = "missed";
        break;
      case "hold":
        // A war over before its minute: the end-of-game stats settle it.
        if (elapsed >= due) this.state = holds && sideOk ? "met" : "missed";
        break;
      case "keep":
        if (this.hasWinner) this.state = holds && sideOk ? "met" : "missed";
        break;
    }
  }

  render() {
    const mine = this.game ? this.mine() : null;
    const text = mine ? goalText(mine.scenario, mine.nation) : null;
    this.style.display = mine && text ? "block" : "none";
    if (!mine || !text) return nothing;
    this.follow(mine.goal, mine.scenario, mine.nation);
    const open = this.state === "open";
    const holding =
      open && mine.goal.kind !== "take"
        ? this.holds(mine.goal, mine.scenario, mine.nation)
        : null;
    const pays = goalPaysOn(this.game.config().gameConfig().difficulty);
    const tone =
      this.state === "met"
        ? "text-green-400"
        : this.state === "missed"
          ? "text-white/40"
          : "text-cyber-yellow";
    return html`<div
      class="flex w-fit max-w-[17rem] items-center gap-2 rounded-bl-lg bg-gray-800/92 px-3 py-1.5 text-xs text-white shadow-xs backdrop-blur-sm"
      data-goal-state=${this.state}
      title=${translateText("scenario_goal.your_goal")}
    >
      <span class=${tone}>${goalIcon("size-4")}</span>
      <span class="flex min-w-0 flex-1 flex-col leading-snug">
        <span
          class=${this.state === "missed"
            ? "text-white/45 line-through decoration-white/30"
            : "text-white/90"}
          >${text}</span
        >
        ${pays
          ? nothing
          : html`<span class="text-[10px] text-white/50" data-goal-no-pay
              >${translateText("scenario_goal.pays_on_hard")}</span
            >`}
      </span>
      ${this.state === "met"
        ? html`<span
            class="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-500/90 text-[11px] font-black text-white"
            aria-label=${translateText("scenario_goal.met")}
            >✓</span
          >`
        : this.state === "missed"
          ? html`<span class="shrink-0 text-[10px] uppercase text-white/45"
              >${translateText("scenario_goal.missed")}</span
            >`
          : holding !== null
            ? html`<span
                class="shrink-0 text-[10px] uppercase ${holding
                  ? "text-green-300/80"
                  : "text-red-300/80"}"
                >${translateText(
                  holding
                    ? "scenario_goal.holding"
                    : "scenario_goal.not_holding",
                )}</span
              >`
            : nothing}
    </div>`;
  }
}
