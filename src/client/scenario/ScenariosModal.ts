import {
  allScenarioData,
  isPlayable,
  ScenarioData,
  scenarioData,
  scenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import "../components/baseComponents/Button";
import { BaseModal } from "../components/BaseModal";
import { modalHeader } from "../components/ui/ModalHeader";
import type { HostLobbyModal } from "../HostLobbyModal";
import { loadModal } from "../LazyModals";
import type { SinglePlayerModal } from "../SinglePlayerModal";
import { translateText } from "../Utils";
import { randomHistoryIcon } from "./RandomHistoryIcon"; // DFX (r26)
import { renderGoalLine } from "./ScenarioGoalText"; // DFX (r26)
import "./ScenarioNationBoard";
import { ScenarioPick, scenarioPickFromArgs } from "./ScenarioPick";
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
 * SCEN (r25): the Scenarios screen. Each scenario with its picture (the map
 * and its starting borders by side), date and a few lines about it; then its
 * nations by side to pick one, and "Play solo" (the solo screen, with the
 * scenario set) or "Host with friends" (a private lobby with it set).
 */
@customElement("scenarios-modal")
export class ScenariosModal extends BaseModal {
  protected routerName = "scenarios";

  @state() private selectedId = allScenarioData()[0]?.id ?? "";
  @state() private nation: string | null = null;

  protected onOpen(args?: Record<string, unknown>): void {
    const pick = scenarioPickFromArgs(args);
    if (pick !== null) {
      this.selectedId = pick.id;
      this.nation = pick.nation;
    }
  }

  private get data(): ScenarioData | null {
    return scenarioData(this.selectedId);
  }

  private select(id: string) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.nation = null;
  }

  private pickNation = (e: CustomEvent<string>) => {
    const data = this.data;
    const n = data === null ? null : scenarioNation(data, e.detail);
    if (n !== null && isPlayable(n)) this.nation = n.key;
  };

  private pick(): ScenarioPick | null {
    if (this.data === null || this.nation === null) return null;
    return { id: this.selectedId, nation: this.nation };
  }

  private playSolo = async () => {
    const pick = this.pick();
    if (pick === null) return;
    await loadModal("single-player-modal");
    const sp = document.querySelector(
      "single-player-modal",
    ) as SinglePlayerModal | null;
    sp?.open({ scenario: pick.id, nation: pick.nation });
  };

  private hostWithFriends = async () => {
    const pick = this.pick();
    if (pick === null) return;
    await loadModal("host-lobby-modal");
    const host = document.querySelector(
      "host-lobby-modal",
    ) as HostLobbyModal | null;
    host?.open({ scenario: pick.id, nation: pick.nation });
  };

  // DFX (r26): Random history (the reveal, then a solo game).
  private randomHistory = async () => {
    const { showRandomHistory } = await import("./RandomHistoryReveal");
    showRandomHistory();
  };

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("scenarios.title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  private renderCard(d: ScenarioData): TemplateResult {
    const selected = d.id === this.selectedId;
    return html`<button
      class="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border text-left transition-colors sm:w-full ${selected
        ? "border-cyber-yellow/70 bg-cyber-yellow/10"
        : "border-white/10 bg-white/5 hover:border-malibu-blue/50 hover:bg-malibu-blue/10"}"
      aria-pressed=${selected}
      data-scenario=${d.id}
      @click=${() => this.select(d.id)}
    >
      <scenario-preview
        class="block pointer-events-none"
        .scenarioId=${d.id}
        fixedHeight="8.5rem"
      ></scenario-preview>
      <span class="flex flex-col gap-0.5 px-3 py-2">
        <span class="text-sm font-bold text-white">${scenarioTitle(d)}</span>
        <span class="text-xs text-white/60">${scenarioDate(d)}</span>
        <span class="mt-1 flex flex-wrap gap-x-2 text-[11px] text-white/50">
          ${d.sides.map(
            (s) =>
              html`<span
                >${sideMark(s.color)} ${sideName(s)}
                ${d.nations.filter((n) => n.side === s.id).length}</span
              >`,
          )}
        </span>
      </span>
    </button>`;
  }

  private renderDetail(d: ScenarioData): TemplateResult {
    const n = this.nation === null ? null : scenarioNation(d, this.nation);
    return html`<section class="space-y-4" data-scenario-detail=${d.id}>
      <div class="flex flex-col gap-4 lg:flex-row">
        <scenario-preview
          class="block lg:w-3/5"
          .scenarioId=${d.id}
          .highlight=${this.nation}
          pickable
          maxHeight="28rem"
          @nation-picked=${this.pickNation}
        ></scenario-preview>
        <div class="flex flex-col gap-2 lg:w-2/5">
          <h3 class="text-xl font-bold text-white">${scenarioTitle(d)}</h3>
          <p class="text-sm font-semibold text-cyber-yellow/90">
            ${scenarioDate(d)}
          </p>
          <p class="text-sm leading-relaxed text-white/75">
            ${scenarioDescription(d)}
          </p>
          <!-- SCEN (r25): the fronts rule, in one line -->
          <p class="text-xs leading-relaxed text-white/50" data-fronts-help>
            ${translateText("scenarios.fronts_help")}
          </p>
          ${n !== null
            ? html`<p class="mt-2 flex items-center gap-2 text-sm text-white">
                <span class="text-white/50"
                  >${translateText("scenarios.your_nation")}</span
                >
                <img
                  src=${assetUrl(`flags/${n.flag}.svg`)}
                  alt=""
                  class="h-5 w-7 rounded-sm object-cover"
                />
                <b>${nationName(n)}</b>
              </p>`
            : nothing}
          <!-- DFX (r26): the nation's optional goal -->
          ${renderGoalLine(d.id, n?.key ?? null)}
        </div>
      </div>
      <h3
        class="text-xs font-bold uppercase tracking-widest text-white/40 pl-1"
      >
        ${translateText("scenarios.pick_nation")}
      </h3>
      <scenario-nation-board
        .scenarioId=${d.id}
        .selected=${this.nation}
        @nation-picked=${this.pickNation}
      ></scenario-nation-board>
    </section>`;
  }

  protected renderBody() {
    const all = allScenarioData();
    const d = this.data;
    const ready = this.pick() !== null;
    return html`<div class="flex h-full flex-col">
      <div
        class="flex-1 min-h-0 overflow-y-auto custom-scrollbar mx-auto w-full max-w-5xl space-y-6 px-4 pb-6 pt-4 sm:px-6"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-sm font-semibold text-white/80">
              ${translateText("scenarios.subtitle")}
            </p>
            <p class="hidden text-xs leading-relaxed text-white/50 sm:block">
              ${translateText("scenarios.help_text")}
            </p>
          </div>
          <!-- DFX (r26): Random history, a random war and nation, solo. -->
          <button
            class="flex shrink-0 items-center gap-2 rounded-lg border border-cyber-yellow/40 bg-cyber-yellow/10 px-3 py-2 text-sm font-bold text-cyber-yellow transition-colors hover:bg-cyber-yellow/20"
            data-random-history-button
            title=${translateText("random_history.blurb")}
            @click=${this.randomHistory}
          >
            ${randomHistoryIcon("size-5")}
            <span>${translateText("random_history.button")}</span>
          </button>
        </div>
        <div
          class="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0"
        >
          ${all.map((s) => this.renderCard(s))}
        </div>
        ${d !== null ? this.renderDetail(d) : nothing}
      </div>
      <div
        class="flex shrink-0 flex-row gap-3 border-t border-white/10 bg-black/20 p-3 sm:p-6"
      >
        <o-button
          class="flex-1"
          variant="primary"
          width="block"
          size="lg"
          title=${translateText("scenarios.play_solo")}
          .disable=${!ready}
          @click=${this.playSolo}
        ></o-button>
        <o-button
          class="flex-1"
          variant="secondary"
          width="block"
          size="lg"
          title=${translateText("scenarios.host_with_friends")}
          .disable=${!ready}
          @click=${this.hostWithFriends}
        ></o-button>
      </div>
    </div>`;
  }
}
