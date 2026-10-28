import type {
  ScenarioData,
  ScenarioNation,
  ScenarioSide,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { translateText } from "../Utils";

/**
 * SCEN (r25): a Scenario's words, all from en.json (resources/scenarios/
 * README.md lists the keys). Falls back to the data's English where a key
 * is missing, so a new scenario never shows a raw key.
 */
function tr(key: string, fallback: string, params?: Record<string, string>) {
  const t = translateText(key, params);
  return t === key ? fallback : t;
}

export function scenarioTitle(data: { id: string; title?: string }): string {
  return tr(`scenarios.${data.id}.title`, data.title ?? data.id);
}

export function scenarioDate(data: ScenarioData): string {
  return tr(`scenarios.${data.id}.date`, String(data.year));
}

export function scenarioDescription(data: { id: string }): string {
  return tr(`scenarios.${data.id}.description`, "");
}

export function nationName(n: ScenarioNation): string {
  return tr(`scenario_nation.${n.key}`, n.name);
}

/** A side's name ("Allies"), the same words its team label uses in game. */
export function sideName(side: ScenarioSide | string): string {
  const id = typeof side === "string" ? side : side.id;
  const name = typeof side === "string" ? side : side.name;
  return tr(`team_colors.${id.toLowerCase()}`, name);
}

/** The heading over a scenario's neutrals ("Neutral", "Native nations"). */
export function neutralName(data: { id: string }): string {
  return tr(`scenarios.${data.id}.neutral`, translateText("scenarios.neutral"));
}

/** "The Allies win". */
export function sideWinLine(side: ScenarioSide | string): string {
  const id = typeof side === "string" ? side : side.id;
  return tr(`scenarios.win.${id.toLowerCase()}`, sideName(side));
}

/**
 * SCEN3 (r27): "The United Nations win at the armistice": a war ended by its
 * armistice (ScenarioData.armistice), falling back to the plain win line.
 */
export function sideArmisticeLine(side: ScenarioSide | string): string {
  const id = typeof side === "string" ? side : side.id;
  return tr(`scenarios.win_armistice.${id.toLowerCase()}`, sideWinLine(side));
}

/** A side's mark for text-only lists: a coloured circle near its colour. */
export function sideMark(color: string): string {
  const h = color.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // A grey reads as black or white, not as the nearest hue.
  if (Math.max(r, g, b) - Math.min(r, g, b) < 40) {
    return (r + g + b) / 3 < 150 ? "⚫" : "⚪";
  }
  const marks: [string, number, number, number][] = [
    ["🔴", 200, 50, 45],
    ["🔵", 60, 110, 210],
    ["🟢", 60, 150, 70],
    ["🟡", 225, 190, 60],
    ["🟠", 230, 130, 50],
    ["🟣", 140, 90, 190],
    ["🟤", 140, 90, 50],
    ["⚫", 70, 70, 70],
    ["⚪", 225, 225, 225],
  ];
  let best = marks[0];
  let bestD = Infinity;
  for (const m of marks) {
    const d = (m[1] - r) ** 2 + (m[2] - g) ** 2 + (m[3] - b) ** 2;
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best[0];
}
