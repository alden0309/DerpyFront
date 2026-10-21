import {
  scenarioData,
  scenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, nothing, TemplateResult } from "lit";
import { translateText } from "../Utils";
import "./ScenarioPreview";
import {
  nationName,
  scenarioDate,
  scenarioDescription,
  scenarioTitle,
  sideMark,
  sideName,
} from "./ScenarioText";

/**
 * SCEN (r25): the minute a picked scenario turns Overtime on from, whatever
 * the host picks (its data's overtimeFrom), or undefined. The solo screen and
 * the host lobby show their Overtime option on and locked then.
 */
export function scenarioOvertimeFrom(
  pick: { id: string } | null,
): number | undefined {
  return pick === null ? undefined : scenarioData(pick.id)?.overtimeFrom;
}

/**
 * SCEN (r25): the scenario at the top of the solo screen and the host lobby,
 * in place of the map and mode pickers: its picture, name, date, the nation
 * you play and a way back to the Scenarios screen. `below` is shown under it
 * (the lobby's seats).
 */
export function renderScenarioPanel(
  pick: { id: string; nation: string | null },
  onChange: (() => void) | null,
  below: TemplateResult | typeof nothing = nothing,
): TemplateResult {
  const data = scenarioData(pick.id);
  if (data === null) return html``;
  const n = pick.nation === null ? null : scenarioNation(data, pick.nation);
  const side =
    n === null || n.side === null
      ? null
      : (data.sides.find((s) => s.id === n.side) ?? null);
  return html`<section
    class="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"
    data-scenario-panel=${data.id}
  >
    <div class="flex flex-col gap-4 sm:flex-row">
      <scenario-preview
        class="block sm:w-1/2"
        .scenarioId=${data.id}
        .highlight=${pick.nation}
        maxHeight="16rem"
      ></scenario-preview>
      <div class="flex min-w-0 flex-col gap-2 sm:w-1/2">
        <span
          class="text-[10px] font-bold uppercase tracking-[0.2em] text-cyber-yellow/90"
          >${translateText("scenarios.title")}</span
        >
        <h3 class="text-lg font-bold text-white">${scenarioTitle(data)}</h3>
        <p class="text-xs font-semibold text-white/60">${scenarioDate(data)}</p>
        <p class="text-xs leading-relaxed text-white/60">
          ${scenarioDescription(data)}
        </p>
        ${n !== null
          ? html`<p class="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span class="text-white/50"
                >${translateText("scenarios.your_nation")}</span
              >
              <img
                src=${assetUrl(`flags/${n.flag}.svg`)}
                alt=""
                class="h-5 w-7 rounded-sm object-cover"
              />
              <b class="text-white">${nationName(n)}</b>
              ${side !== null
                ? html`<span class="text-xs text-white/60"
                    >${sideMark(side.color)} ${sideName(side)}</span
                  >`
                : nothing}
            </p>`
          : nothing}
        ${onChange !== null
          ? html`<button
              class="mt-1 self-start rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/10"
              @click=${onChange}
            >
              ${translateText("scenarios.back")}
            </button>`
          : nothing}
      </div>
    </div>
    ${below}
  </section>`;
}
