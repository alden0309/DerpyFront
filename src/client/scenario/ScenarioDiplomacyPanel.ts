import {
  GoodwillStanding,
  GoodwillWord,
  ScenarioAskView,
  ScenarioDiplomacyView,
} from "@openfront/engine-api/game/ScenarioDiplomacy";
import { renderNumber } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, TemplateResult } from "lit";
import { actionButton } from "../components/ui/ActionButton";
import { renderDuration, translateText } from "../Utils";
import { activeScenarioSide } from "./ScenarioClient";
import { goodwillWordText, sideInSentence } from "./ScenarioDiplomacyClient";
import { sideName } from "./ScenarioText";

/**
 * DIPLO (r27): the player panel's "Courting" section. On a neutral, its
 * goodwill toward each side (a bar in the side's colour and a word), and for
 * a side's nation the gift and invitation buttons; for a neutral's own
 * player, its standing and an "Ask to join" button per side (or, on a side's
 * nation, for that side).
 */

const giftIcon = assetUrl("images/DonateGoldIconWhite.svg");
const inviteIcon = assetUrl("images/AllianceIconWhite.svg");

export interface DiplomacyPanelHandlers {
  gift(e: MouseEvent): void;
  invite(e: MouseEvent): void;
  ask(e: MouseEvent, side: string): void;
}

const WORD_CLASS: Record<GoodwillWord, string> = {
  cold: "text-sky-200",
  wary: "text-amber-200",
  friendly: "text-emerald-200",
  ready: "text-emerald-300 font-bold",
  never: "text-zinc-500",
};

/** A disabled button, dimmed (the panel's buttons don't dim themselves). */
function dimmed(off: boolean, button: TemplateResult): TemplateResult {
  return off ? html`<div class="opacity-50">${button}</div>` : button;
}

function seconds(ticks: number): string {
  return renderDuration(Math.ceil(ticks / 10));
}

function renderRow(s: GoodwillStanding, mine: boolean): TemplateResult {
  const color = activeScenarioSide(s.side)?.color ?? "#a1a1aa";
  return html`
    <li
      class="flex flex-col gap-1 rounded-md px-1.5 py-1 ${mine
        ? "bg-white/5 ring-1 ring-white/15"
        : ""}"
      data-goodwill=${s.side}
    >
      <div class="flex items-center justify-between gap-2 text-[14px]">
        <span class="inline-flex min-w-0 items-center gap-1.5 text-zinc-100">
          <span
            class="size-2.5 shrink-0 rounded-full ring-1 ring-black/40"
            style="background:${color}"
          ></span>
          <span class="truncate">${sideName(s.side)}</span>
        </span>
        <span class="shrink-0 text-[13px] font-semibold ${WORD_CLASS[s.word]}"
          >${s.word === "ready" ? "✓ " : ""}${goodwillWordText(s.word)}</span
        >
      </div>
      <div
        class="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label=${sideName(s.side)}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${s.percent}
        aria-valuetext=${goodwillWordText(s.word)}
      >
        <div
          class="h-full rounded-full"
          style="width:${s.percent}%; background:${color}; ${s.word === "ready"
            ? "box-shadow:0 0 6px rgba(52,211,153,.6)"
            : ""}"
        ></div>
      </div>
    </li>
  `;
}

function renderAsk(a: ScenarioAskView, h: DiplomacyPanelHandlers) {
  const label = a.pending
    ? translateText("scenario_diplomacy.ask_pending", {
        side: sideInSentence(a.side),
      })
    : a.cooldown > 0
      ? translateText("scenario_diplomacy.ask_wait", {
          time: seconds(a.cooldown),
        })
      : translateText("scenario_diplomacy.ask_join", {
          side: sideInSentence(a.side),
        });
  const color = activeScenarioSide(a.side)?.color ?? "#a1a1aa";
  return html`
    <button
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2
             text-[14px] font-semibold text-emerald-300 shadow-xs transition-all duration-150
             enabled:hover:bg-emerald-500/10 enabled:hover:text-emerald-200
             disabled:cursor-not-allowed disabled:text-zinc-400 active:translate-y-[1px]"
      ?disabled=${!a.canAsk}
      data-ask-join=${a.side}
      @click=${(e: MouseEvent) => h.ask(e, a.side)}
    >
      <span
        class="size-2.5 shrink-0 rounded-full ring-1 ring-black/40"
        style="background:${color}"
      ></span>
      <span class="min-w-0 truncate">${label}</span>
    </button>
  `;
}

/** The section, or nothing when there is no courting between the two. */
export function renderScenarioDiplomacy(
  view: ScenarioDiplomacyView | undefined,
  neutralName: string,
  h: DiplomacyPanelHandlers,
): TemplateResult | "" {
  if (view === undefined) return "";
  const court = view.court;
  const mySide = court?.side ?? null;
  return html`
    <ui-divider></ui-divider>
    <div class="select-none" data-scenario-diplomacy>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-x-3">
        <div class="text-[15px] font-medium text-zinc-200">
          ${translateText("scenario_diplomacy.courting")}
        </div>
        ${view.notBeforeMinute !== undefined
          ? html`<span class="text-[12px] text-amber-200/90"
              >⏳
              ${translateText("scenario_diplomacy.not_before", {
                minute: view.notBeforeMinute,
              })}</span
            >`
          : ""}
      </div>
      <ul
        class="flex flex-col gap-1 rounded-lg bg-zinc-800/70 p-1.5 ring-1 ring-zinc-700/60"
        role="list"
      >
        ${view.standing.map((s) => renderRow(s, s.side === mySide))}
      </ul>
      ${court !== undefined && court.goldToGo > 0
        ? html`<p class="mt-1.5 px-1 text-[13px] leading-snug text-zinc-400">
            ${translateText("scenario_diplomacy.gold_to_go", {
              gold: renderNumber(court.goldToGo),
              name: neutralName,
            })}
          </p>`
        : ""}
      ${court !== undefined
        ? html`<div class="mt-2 grid auto-cols-fr grid-flow-col gap-1">
            ${dimmed(
              !court.canGift,
              actionButton({
                onClick: (e: MouseEvent) => h.gift(e),
                icon: giftIcon,
                iconAlt: "Gift",
                title: translateText("scenario_diplomacy.gift"),
                label: translateText("scenario_diplomacy.gift"),
                type: "yellow",
                disabled: !court.canGift,
              }),
            )}
            ${dimmed(
              !court.canInvite,
              actionButton({
                onClick: (e: MouseEvent) => h.invite(e),
                icon: inviteIcon,
                iconAlt: "Invite",
                title: translateText("scenario_diplomacy.invite"),
                label:
                  court.inviteCooldown > 0
                    ? translateText("scenario_diplomacy.invite_wait", {
                        time: seconds(court.inviteCooldown),
                      })
                    : translateText("scenario_diplomacy.invite"),
                type: "green",
                disabled: !court.canInvite,
              }),
            )}
          </div>`
        : ""}
      ${view.ask !== undefined && view.ask.length > 0
        ? html`<div class="mt-2 flex flex-col gap-1">
            ${view.ask.map((a) => renderAsk(a, h))}
          </div>`
        : ""}
    </div>
  `;
}
