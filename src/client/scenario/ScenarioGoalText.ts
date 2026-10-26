import {
  GOAL_COINS,
  goalTextKey,
  scenarioGoal,
} from "@openfront/engine-lib/scenario/ScenarioGoals";
import { html, nothing, type TemplateResult } from "lit";
import { derpCoinIcon } from "../derpy/DerpyUi";
import { translateText } from "../Utils";

/**
 * DFX (r26): a Scenario nation's optional goal, in words ("Hold Warsaw past
 * minute 20"), or null when it has none. From en.json's
 * scenario_goal_text.<scenario>.<nation>.
 */
export function goalText(scenarioId: string, nation: string): string | null {
  if (scenarioGoal(scenarioId, nation) === null) return null;
  const key = goalTextKey(scenarioId, nation);
  const t = translateText(key);
  return t === key ? null : t;
}

/** A small flag on a pole: a goal. */
export function goalIcon(cls = "size-4"): TemplateResult {
  return html`<svg
    viewBox="0 0 20 20"
    class="${cls} shrink-0"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 18V3" />
    <path d="M5 3.5h9l-2 3 2 3H5" fill="currentColor" fill-opacity="0.35" />
  </svg>`;
}

/**
 * The goal's line where a nation is picked (the Scenarios screen, the solo
 * screen's panel, Random history's reveal): "Optional goal", its words and
 * the coins it pays.
 */
export function renderGoalLine(
  scenarioId: string,
  nation: string | null,
): TemplateResult | typeof nothing {
  if (nation === null) return nothing;
  const text = goalText(scenarioId, nation);
  if (text === null) return nothing;
  return html`<div
    class="flex items-start gap-2 rounded-lg border border-cyber-yellow/25 bg-cyber-yellow/[0.06] px-2.5 py-1.5 text-left"
    data-scenario-goal
    title=${translateText("scenario_goal.help", { coins: GOAL_COINS })}
  >
    <span class="mt-0.5 text-cyber-yellow">${goalIcon()}</span>
    <span class="flex min-w-0 flex-1 flex-col leading-tight">
      <span
        class="text-[10px] font-bold uppercase tracking-wider text-cyber-yellow/90"
        >${translateText("scenario_goal.optional")}</span
      >
      <span class="text-sm text-white/90">${text}</span>
    </span>
    <span
      class="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums text-cyber-yellow"
      >${derpCoinIcon("size-3.5")}+${GOAL_COINS}</span
    >
  </div>`;
}
