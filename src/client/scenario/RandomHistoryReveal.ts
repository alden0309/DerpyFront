import { Difficulty } from "@openfront/engine-api/game/GameTypes";
import {
  scenarioData,
  scenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../components/baseComponents/Button";
import { loadModal } from "../LazyModals";
import type { SinglePlayerModal } from "../SinglePlayerModal";
import { translateText } from "../Utils";
import { type HistoryPick, pickRandomHistory } from "./RandomHistory";
import { randomHistoryIcon } from "./RandomHistoryIcon";
import { renderGoalLine } from "./ScenarioGoalText";
import "./ScenarioPreview";
import {
  nationName,
  neutralName,
  scenarioDate,
  scenarioTitle,
  sideMark,
  sideName,
} from "./ScenarioText";

/**
 * DFX (r26): Random history's reveal. A random Scenario and nation ("You are
 * Poland, 1 September 1939") over the war's map, for a moment, with Reroll;
 * then the solo game starts (the solo screen's usual settings). Loaded on
 * demand from the menu and the Scenarios screen.
 */

/** How long the reveal shows before the game starts (ms). */
export const REVEAL_MS = 4000;

/**
 * The difficulty the game starts at: the solo screen's usual one (its
 * DEFAULT_OPTIONS; RandomHistory.test.ts checks they agree).
 */
export const RANDOM_HISTORY_DIFFICULTY = Difficulty.Easy;

/** Opens the reveal (one at a time). */
export function showRandomHistory(): RandomHistoryReveal {
  const open = document.querySelector<RandomHistoryReveal>(
    "random-history-reveal",
  );
  if (open !== null) return open;
  const el = new RandomHistoryReveal();
  document.body.appendChild(el);
  return el;
}

@customElement("random-history-reveal")
export class RandomHistoryReveal extends LitElement {
  @state() pick: HistoryPick = pickRandomHistory();
  /** Counts the rerolls, so the reveal animates again. */
  @state() private round = 0;
  @state() private left = REVEAL_MS;
  @state() private starting = false;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly abort = new AbortController();

  /** Starts the solo game (replaceable for tests). */
  startSolo: (pick: HistoryPick) => Promise<void> = async (pick) => {
    await loadModal("single-player-modal");
    const sp = document.querySelector(
      "single-player-modal",
    ) as SinglePlayerModal | null;
    await sp?.startScenario(pick);
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", (e) => this.onKey(e), {
      signal: this.abort.signal,
    });
    this.countdown();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.abort.abort();
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private countdown(): void {
    this.stopTimer();
    this.startedAt = performance.now();
    this.left = REVEAL_MS;
    this.timer = setInterval(() => {
      this.left = Math.max(0, REVEAL_MS - (performance.now() - this.startedAt));
      if (this.left <= 0) void this.play();
    }, 50);
  }

  reroll(): void {
    if (this.starting) return;
    this.pick = pickRandomHistory(Math.random, this.pick);
    this.round++;
    this.countdown();
  }

  cancel(): void {
    this.stopTimer();
    this.remove();
  }

  async play(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    this.stopTimer();
    try {
      await this.startSolo(this.pick);
    } finally {
      this.remove();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      void this.play();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      this.reroll();
    }
  }

  render() {
    const data = scenarioData(this.pick.id);
    const nation =
      data === null ? null : scenarioNation(data, this.pick.nation);
    if (data === null || nation === null) return nothing;
    const side =
      nation.side === null
        ? null
        : (data.sides.find((s) => s.id === nation.side) ?? null);
    const seconds = Math.ceil(this.left / 1000);
    const difficulty = translateText(
      `difficulty.${RANDOM_HISTORY_DIFFICULTY.toLowerCase()}`,
    );
    return html`
      <div
        class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="random-history-title"
        data-random-history
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.cancel();
        }}
      >
        <div
          class="rh-card relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-cyber-yellow/30 bg-gray-900/95 text-white shadow-2xl"
        >
          <div class="flex items-center gap-2 px-4 pt-3 pb-2">
            ${randomHistoryIcon("size-4 text-cyber-yellow")}
            <span
              class="flex-1 text-[11px] font-bold uppercase tracking-[0.22em] text-cyber-yellow/90"
              >${translateText("random_history.title")}</span
            >
            <button
              class="rounded-md px-2 text-xl leading-none text-white/50 hover:bg-white/10 hover:text-white"
              aria-label=${translateText("common.close")}
              @click=${() => this.cancel()}
            >
              ×
            </button>
          </div>
          <div class="relative px-4">
            <scenario-preview
              class="block overflow-hidden rounded-xl"
              .scenarioId=${data.id}
              .highlight=${nation.key}
              fixedHeight="11rem"
            ></scenario-preview>
          </div>
          ${this.renderWho(nation.flag, nationName(nation), {
            date: scenarioDate(data),
            title: scenarioTitle(data),
            side:
              side === null
                ? `⚪ ${neutralName(data)}`
                : `${sideMark(side.color)} ${sideName(side)}`,
            difficulty,
          })}
          <div class="px-5 pb-1">
            <div
              class="h-1 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax=${REVEAL_MS}
              aria-valuenow=${REVEAL_MS - this.left}
            >
              <div
                class="h-full rounded-full bg-malibu-blue"
                style="width:${((REVEAL_MS - this.left) / REVEAL_MS) * 100}%"
              ></div>
            </div>
            <p class="mt-1.5 text-center text-xs text-white/50 tabular-nums">
              ${this.starting
                ? translateText("random_history.starting_now")
                : translateText("random_history.starting_in", {
                    seconds,
                  })}
            </p>
          </div>
          <div class="flex gap-3 p-4 pt-2">
            <o-button
              class="flex-1"
              variant="secondary"
              width="block"
              size="md"
              title=${translateText("random_history.reroll")}
              .disable=${this.starting}
              @click=${() => this.reroll()}
              data-reroll
            ></o-button>
            <o-button
              class="flex-1"
              variant="primary"
              width="block"
              size="md"
              title=${translateText("random_history.play_now")}
              .disable=${this.starting}
              @click=${() => void this.play()}
              data-play
            ></o-button>
          </div>
        </div>
        ${styles()}
      </div>
    `;
  }

  private renderWho(
    flag: string,
    name: string,
    about: { date: string; title: string; side: string; difficulty: string },
  ): TemplateResult {
    // Keyed by the round, so a reroll plays the reveal again.
    return html`<div
      class="rh-who flex flex-col items-center gap-1 px-5 pt-0 pb-3 text-center"
      data-round=${this.round}
    >
      <img
        src=${assetUrl(`flags/${flag}.svg`)}
        alt=""
        class="rh-flag -mt-7 h-14 w-20 rounded-md object-cover shadow-lg ring-2 ring-gray-900"
      />
      <h2
        id="random-history-title"
        class="rh-line mt-2 text-2xl font-black leading-tight"
      >
        ${youAreLine(name, about.date)}
      </h2>
      <p class="text-sm text-white/60">
        ${about.title} · ${about.side} ·
        ${translateText("random_history.solo", {
          difficulty: about.difficulty,
        })}
      </p>
      <!-- the nation's optional goal -->
      <div class="mt-2 w-full">
        ${renderGoalLine(this.pick.id, this.pick.nation)}
      </div>
    </div>`;
  }

  protected updated(changed: Map<string, unknown>): void {
    // Replay the reveal's animation on a reroll.
    if (changed.has("round") && this.round > 0) {
      const who = this.querySelector<HTMLElement>(".rh-who");
      if (who !== null) {
        who.classList.remove("rh-again");
        void who.offsetWidth;
        who.classList.add("rh-again");
      }
    }
  }
}

/**
 * "You are Poland, 1 September 1939", with the nation picked out. The words
 * come from en.json with the name as a marker, so a translation can put the
 * name and date where its language wants them.
 */
function youAreLine(name: string, date: string): TemplateResult {
  const MARK = "\u0000";
  const text = translateText("random_history.you_are", {
    nation: MARK,
    date,
  });
  const [before, after = ""] = text.split(MARK);
  return html`${before}<span class="text-cyber-yellow">${name}</span>${after}`;
}

function styles(): TemplateResult {
  return html`<style>
    .rh-card {
      animation: rh-pop 260ms ease-out both;
    }
    .rh-who .rh-flag,
    .rh-who .rh-line {
      animation: rh-in 420ms 120ms ease-out both;
    }
    .rh-who.rh-again .rh-flag,
    .rh-who.rh-again .rh-line {
      animation: rh-again 380ms ease-out both;
    }
    @keyframes rh-pop {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes rh-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes rh-again {
      0% {
        opacity: 0;
        transform: rotateX(70deg);
      }
      100% {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .rh-card,
      .rh-who .rh-flag,
      .rh-who .rh-line,
      .rh-who.rh-again .rh-flag,
      .rh-who.rh-again .rh-line {
        animation: none;
      }
    }
  </style>`;
}
