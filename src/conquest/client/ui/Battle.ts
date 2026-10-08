// Why a battle went the way it did, in plain words: how strong each side
// really was once everything was counted, and the handful of things that
// made the difference. Shown as a dispatch when one of your battles ends,
// and at the top of the full report.

import { html, nothing, TemplateResult } from "lit";
import type { BattleReport, BattleSide, GameState } from "../../engine/Types";
import { nationName } from "../Text";
import type { GameUi } from "./Context";

export interface Verdict {
  /** -1: not yours to judge (you weren't in it). */
  ours: 0 | 1 | -1;
  won: boolean;
  headline: string;
  /** Effective strength at the start, ours (or attacker's) first. */
  strength: [number, number];
  reasons: { text: string; good: boolean }[];
}

const pct = (v: number) =>
  `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))}%`;

export function battleVerdict(
  s: GameState,
  r: BattleReport,
  me: number,
): Verdict {
  const ours: 0 | 1 | -1 = r.attacker.nations.includes(me)
    ? 0
    : r.defender.nations.includes(me)
      ? 1
      : -1;
  const us = ours === 1 ? r.defender : r.attacker;
  const them = ours === 1 ? r.attacker : r.defender;
  const usWon = r.winner === (ours === 1 ? 1 : 0);
  const name = (side: BattleSide) =>
    nationName(s.nations[side.nations[0]]?.name ?? "them");
  const who = (side: BattleSide, mine: boolean) =>
    ours >= 0 ? (mine ? "your" : "their") : `${name(side)}'s`;
  const reasons: { text: string; good: boolean; weight: number }[] = [];

  // Numbers.
  const ratio = us.men / Math.max(1, them.men);
  if (ratio >= 1.25)
    reasons.push({
      text: `${ours >= 0 ? "You" : name(us)} had ${ratio.toFixed(1)}× the men`,
      good: true,
      weight: Math.log(ratio),
    });
  else if (ratio <= 0.8)
    reasons.push({
      text: `${ours >= 0 ? "They" : name(them)} had ${(1 / ratio).toFixed(1)}× the men`,
      good: false,
      weight: Math.log(1 / ratio),
    });
  // Every factor that pushed one way or the other.
  for (const f of us.factors)
    reasons.push({
      text: `${capital(who(us, true))} side: ${f.label.toLowerCase()} (${pct(f.value)})`,
      good: f.value >= 1,
      weight: Math.abs(Math.log(f.value)),
    });
  for (const f of them.factors)
    reasons.push({
      text: `${capital(who(them, false))} side: ${f.label.toLowerCase()} (${pct(f.value)})`,
      good: f.value < 1,
      weight: Math.abs(Math.log(f.value)),
    });
  // How it ended.
  const loser = usWon ? them : us;
  if (loser.moraleEnd < 0.3)
    reasons.push({
      text: `${usWon ? (ours >= 0 ? "Their" : `${name(them)}'s`) : ours >= 0 ? "Your" : `${name(us)}'s`} men broke (morale fell to ${Math.round(loser.moraleEnd * 100)}%)`,
      good: usWon,
      weight: 0.25,
    });
  // What mattered most, and on the side that won.
  const decisive = reasons
    .filter((x) => x.good === usWon)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const against = reasons
    .filter((x) => x.good !== usWon)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 1);
  const headline =
    ours < 0
      ? `${r.winner === 0 ? name(r.attacker) : name(r.defender)} won`
      : usWon
        ? r.outcome === "destroyed"
          ? "A victory: their army was destroyed"
          : "A victory: they fell back"
        : r.outcome === "destroyed"
          ? "A defeat: your army was destroyed"
          : "A defeat: your army fell back";
  return {
    ours,
    won: usWon,
    headline,
    strength: [us.power || us.men, them.power || them.men],
    reasons: [...decisive, ...against].map(({ text, good }) => ({
      text,
      good,
    })),
  };
}

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Two bars: how strong each side really was. */
export function strengthBars(
  v: Verdict,
  labels: [string, string],
): TemplateResult {
  const total = Math.max(1, v.strength[0] + v.strength[1]);
  const a = (v.strength[0] / total) * 100;
  return html`<div
      class="cq-strength"
      role="img"
      aria-label="${labels[0]} ${Math.round(
        v.strength[0],
      )} against ${labels[1]} ${Math.round(v.strength[1])}"
    >
      <span class="cq-strength-a" style="width:${a}%"></span
      ><span class="cq-strength-b" style="width:${100 - a}%"></span>
    </div>
    <p class="cq-strength-labels">
      <span>${labels[0]}</span><span>${labels[1]}</span>
    </p>`;
}

export function reasonList(v: Verdict): TemplateResult {
  return html`<ul class="cq-reasons">
    ${v.reasons.map(
      (x) => html`<li class=${x.good ? "good" : "bad"}>${x.text}</li>`,
    )}
  </ul>`;
}

/** The dispatch that appears when one of your battles ends. */
export function battleDispatch(
  ui: GameUi,
  r: BattleReport,
  close: () => void,
): TemplateResult {
  const v = battleVerdict(ui.s, r, ui.me);
  const place = ui.map.provinces[r.prov].name;
  return html`<aside
    class="cq-dispatch ${v.won ? "won" : "lost"}"
    role="status"
  >
    <button class="cq-dispatch-x" aria-label="Dismiss" @click=${close}>
      ×
    </button>
    <p class="cq-dispatch-kicker">From the field at ${place}</p>
    <h3 class="cq-dispatch-title">${v.headline}</h3>
    ${strengthBars(v, ["Your strength", "Theirs"])}
    ${v.reasons.length
      ? html`<p class="cq-dispatch-why">Why:</p>
          ${reasonList(v)}`
      : nothing}
    <button
      class="cq-btn small"
      @click=${() => {
        close();
        ui.modal({ k: "battle", id: r.id });
      }}
    >
      Read the full report
    </button>
  </aside>`;
}
