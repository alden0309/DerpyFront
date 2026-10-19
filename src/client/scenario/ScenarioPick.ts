import {
  isPlayable,
  scenarioData,
  scenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";

/**
 * SCEN (r25): what the Scenarios screen hands the solo screen and the host
 * lobby: a scenario and the nation picked. It travels as their open() args
 * ({ scenario, nation }), which the modal router also keeps in the URL.
 */
export interface ScenarioPick {
  id: string;
  nation: string;
}

/** A pick from a modal's open() args, if they name a scenario. */
export function scenarioPickFromArgs(
  args: Record<string, unknown> | undefined,
): ScenarioPick | null {
  const id = args?.scenario;
  if (typeof id !== "string") return null;
  const data = scenarioData(id);
  if (data === null) return null;
  const asked = typeof args?.nation === "string" ? args.nation : "";
  const n = scenarioNation(data, asked);
  const nation =
    n !== null && isPlayable(n)
      ? n.key
      : (data.nations.find(isPlayable)?.key ?? "");
  return { id, nation };
}
