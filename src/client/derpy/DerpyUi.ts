// Small pieces shared by the account, leaderboard and store pages.

import { maps } from "@openfront/engine-api/game/Maps.gen";
import { renderNumber } from "@openfront/engine-lib/Format";
import { html, TemplateResult } from "lit";
import { translateText } from "../Utils";

/** The Derp Coin: a gold coin with a lopsided D. */
export function derpCoinIcon(cls = "w-5 h-5"): TemplateResult {
  return html`<svg
    class="${cls} shrink-0"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="11" fill="#b8860b" />
    <circle cx="12" cy="12" r="9" fill="#ffd23f" />
    <path
      d="M9 6.5h3.2c3.3 0 5.3 2.3 5.3 5.6 0 3.2-2.1 5.4-5.4 5.4H9z"
      fill="none"
      stroke="#8a5a00"
      stroke-width="2.2"
      stroke-linejoin="round"
      transform="rotate(-6 12 12)"
    />
  </svg>`;
}

export function coinAmount(coins: number, cls = ""): TemplateResult {
  return html`<span
    class="inline-flex items-center gap-1.5 font-bold tabular-nums text-cyber-yellow ${cls}"
    >${derpCoinIcon("w-4 h-4")}${coins.toLocaleString()}</span
  >`;
}

export function gold(value: string | number | bigint): string {
  return renderNumber(BigInt(value));
}

export function mapName(gameMap: string): string {
  const info = maps.find((m) => m.type === gameMap);
  return info ? translateText(info.translationKey) : gameMap;
}

export function awardLabel(kind: string): string {
  return translateText(`derpy.award_${kind}`);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A labelled number in a stats grid. */
export function statTile(
  label: string,
  value: string | number,
  note?: string,
): TemplateResult {
  return html`<div
    class="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
  >
    <span class="text-xs font-medium text-white/50">${label}</span>
    <span class="text-2xl font-bold tabular-nums text-white">${value}</span>
    ${note ? html`<span class="text-xs text-white/40">${note}</span>` : ""}
  </div>`;
}
