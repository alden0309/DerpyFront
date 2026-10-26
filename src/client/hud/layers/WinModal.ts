import { Award, GameAwards } from "@openfront/engine-api/game/Awards";
import { RankedType } from "@openfront/engine-api/game/GameTypes";
import {
  GameUpdateType,
  WinUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { renderNumber } from "@openfront/engine-lib/Format";
import type { GameXpEligible, Progress } from "@openfront/shared/ApiSchemas";
import {
  conquestsFromStats,
  DerpCoinResult,
  derpCoinsForGame,
  goldEarnedFromStats,
  isWinningClient,
  peakTilesFromStats,
} from "@openfront/shared/DerpCoins";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  getTranslatedPlayerTeamLabel,
  homeHref,
  showToast,
  translateText,
} from "../../../client/Utils";
import type { ChallengeDone } from "../../../derpland/Challenges"; // CHAL (r25)
import { replaySaved } from "../../../derpland/Watch"; // DFX (r26)
import { fetchUserMeUncached, invalidateUserMe } from "../../Api";
import type { GameXpPanelState } from "../../components/GameXpPanel";
import type { LegendCeremony } from "../../components/LegendCeremony";
import "../../components/ProfileShare";
import { Controller } from "../../Controller";
import { derpyGameChallenges } from "../../derpy/DerpyAccount"; // CHAL (r25)
import { isDerpySignedIn } from "../../derpy/DerpySession";
import "../../derpy/DerpyWatchButton"; // DFX (r26)
import { derpyGameGoal } from "../../derpy/DerpyAccount"; // DFX (r26)
import { GOAL_COINS } from "@openfront/engine-lib/scenario/ScenarioGoals"; // DFX (r26)
import { PROGRESSION_ENABLED } from "../../derpy/UpstreamFeatures";
import { playVictoryFanfare } from "../../derpy/VictoryFanfare";
import { gamePortal } from "../../GamePortal";
import {
  gameShareMoment,
  momentShareLabel,
  momentShareText,
  momentShareUrl,
} from "../../MomentShare";
import { MAX_PRESTIGE, reachedLegendThisGame } from "../../Progression";
import { resolveXpAccount } from "../../ProgressionAccount";
import { fetchProgressionConfig, pollGameXp } from "../../ProgressionApi";
import {
  loadProvisionalXp,
  type ProvisionalXp,
  provisionalXpRules,
  reconcileXp,
} from "../../ProvisionalXpAtDeath";
import { sideWinLine } from "../../scenario/ScenarioText"; // SCEN (r25)
import { PlaySoundEffectEvent } from "../../sound/Sounds";
import { SendWinnerEvent } from "../../Transport";
import { GameView } from "../../view";

function awardValueText(a: Award): string {
  switch (a.kind) {
    case "mvp":
      return translateText("derpy.award_value_mvp", { score: a.value });
    case "betrayals":
      return translateText("derpy.award_value_betrayals", { count: a.value });
    case "gold":
      return translateText("derpy.award_value_gold", {
        gold: renderNumber(a.value),
      });
    case "ships":
      return translateText("derpy.award_value_ships", { count: a.value });
  }
}

/** CHAL (r25): a weekly challenge's name, in the player's language. */
function challengeName(c: ChallengeDone): string {
  const key = `derpy.challenge_${c.key}`;
  const t = translateText(key);
  return t === key ? c.name : t;
}

type LegendCeremonyModule = typeof import("../../components/LegendCeremony");

// The XP section stays out of the startup bundle: it's fetched when a game
// starts (see init), long before the game ends, so the reveal never waits on
// it. Should it still be on its way, the section shows the moment it lands.
let xpPanelModule: Promise<unknown> | null = null;
function loadGameXpPanel(): void {
  xpPanelModule ??= import("../../components/GameXpPanel").catch(
    (err: unknown) => {
      // Tried again at the end of the game, or the next one.
      xpPanelModule = null;
      console.warn("WinModal: XP section failed to load", err);
    },
  );
}

@customElement("win-modal")
export class WinModal extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  private hasShownDeathModal = false;

  @state()
  isVisible = false;

  @state()
  private isWin = false;

  @state()
  private isRankedGame = false;

  // Derpy Front: set once the game is decided (a Win update arrived).
  @state()
  private gameOver = false;

  @state()
  private awards: GameAwards = [];

  @state()
  private coins: DerpCoinResult | null = null;

  // CHAL (r25): the weekly challenges this game finished (asked of the
  // server once the game is decided, until it has saved the game).
  @state()
  private challenges: ChallengeDone[] = [];
  private challengeAbort: AbortController | null = null;

  // DFX (r26): this game's replay is saved, so it can be watched together.
  @state()
  private replayIsSaved = false;
  // DFX (r26): the Scenario goal this game met (the end-of-game stats say
  // so), and what the server paid for it.
  @state()
  private goalMet = false;
  @state()
  private goalPaid: { coins: number } | null = null;
  private savedAbort: AbortController | null = null;

  // DFSTORE (r21): your fanfare played, so the win screen offers it again.
  @state()
  private fanfarePlayed = false;

  // The XP this game earned. Stays hidden unless there is something to say:
  // no progression, a spectator or a replay never see the section at all.
  @state()
  private xpView: GameXpPanelState = { kind: "hidden" };
  // Polling starts once, at the end of the game.
  private xpPolling = false;
  private xpAbort: AbortController | null = null;
  // The XP result the panel has finished revealing (or skipped to the end
  // of): the share button waits for it.
  @state()
  private xpSettled: GameXpPanelState | null = null;
  // The signed-in player's public ID, for the share link. Empty when signed
  // out (or unknown): no share button.
  @state()
  private sharePublicId = "";
  // The provisional figure shown at death, if any: the server's figure is
  // compared with it when the game ends.
  private provisionalXp: ProvisionalXp | null = null;
  // A detach cut the end-of-game poll short; re-attaching restarts it (the
  // Win update that started it is delivered only once).
  private xpPollAborted = false;
  // Whose XP the section shows: the Legend ceremony plays once per account.
  private xpPublicId: string | null = null;
  // The Legend ceremony, fetched only for a player who could become a Legend
  // (see preloadLegendCeremony); null until it has arrived.
  private legendCeremony: LegendCeremonyModule | null = null;
  private legendCeremonyLoad: Promise<void> | null = null;
  // Replaceable for tests.
  loadLegendCeremony: () => Promise<LegendCeremonyModule> = () =>
    import("../../components/LegendCeremony");

  private _title: string;

  // SCEN (r25): who was on the winning side of a scenario, for the line
  // under the title.
  @state()
  private sideMembers: string[] = [];

  // Override to prevent shadow DOM creation
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
  }

  render() {
    return html`
      <div
        class="${this.isVisible
          ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800/70 p-4 md:p-6 shrink-0 rounded-lg z-[10010] shadow-2xl backdrop-blur-xs text-white w-[min(90vw,700px)] max-w-[90%] max-h-[90dvh] overflow-hidden flex flex-col"
          : "hidden"}"
      >
        <h2 class="m-0 mb-4 text-[26px] text-center text-white shrink-0">
          ${this._title || ""}
        </h2>
        ${this.sideMembers.length > 0
          ? html`<p
              class="-mt-2 mb-4 text-center text-sm text-white/75 shrink-0"
              data-scenario-winners
            >
              ${translateText("scenarios.winning_side", {
                names: this.sideMembers.join(", "),
              })}
            </p>`
          : nothing}
        <div class="min-h-0 flex-1 overflow-y-auto pr-0.5">
          ${PROGRESSION_ENABLED
            ? html`<game-xp-panel
                .view=${this.xpView}
                .onScreen=${this.isVisible}
                @xp-reveal-settled=${(e: CustomEvent<GameXpPanelState>) =>
                  (this.xpSettled = e.detail)}
                .gameType=${this.game?.config().gameConfig().gameType ?? null}
                @xp-legend=${this.onXpLegend}
              ></game-xp-panel>`
            : nothing}
          ${this.innerHtml()}
        </div>
        <!-- Leaving is the quieter action, on the left; staying in the game
             is the main one, on the right. Sharing a milestone sits between
             them, or on its own row above where three don't fit. -->
        <div class="mt-4 flex flex-wrap justify-between gap-2.5 shrink-0">
          ${this.actionButton(
            "quiet",
            translateText("win_modal.exit"),
            () => this._handleExit(),
            "exit",
          )}
          ${this.renderShare()}
          ${this.isRankedGame
            ? this.actionButton(
                "main",
                translateText("win_modal.requeue"),
                () => this._handleRequeue(),
                "requeue",
              )
            : null}
          ${this.actionButton(
            "main",
            this.game?.myPlayer()?.isAlive()
              ? translateText("win_modal.keep")
              : translateText("win_modal.spectate"),
            () => this.hide(),
            "keep",
          )}
        </div>
        ${this.renderActionStyles()}
      </div>
      ${PROGRESSION_ENABLED
        ? html`<legend-ceremony
            @legend-ceremony-closed=${this.onLegendCeremonyClosed}
          ></legend-ceremony>`
        : nothing}
    `;
  }

  // The server's result for this game made the player a Legend: the moment
  // gets the whole screen, the first time on this account. The XP section
  // rests on its final state behind it, so Continue comes back to the
  // settled popup. Should the ceremony not have arrived (a slow or failed
  // fetch), the XP section plays its own Legend moment instead.
  private onXpLegend = (e: CustomEvent<GameXpEligible>): void => {
    const publicId = this.xpPublicId;
    const legend = this.legendCeremony;
    if (publicId === null || legend === null) return;
    if (legend.legendCeremonySeen(publicId)) return;
    const ceremony = this.querySelector<LegendCeremony>("legend-ceremony");
    if (ceremony === null) return;
    e.preventDefault();
    legend.markLegendCeremonySeen(publicId);
    ceremony.show({
      lifetimeXp: e.detail.after.lifetimeXp,
      at: new Date(),
      publicId,
    });
  };

  // Fetches the Legend ceremony ahead of its moment: once the account is
  // known to be on its last prestige run, and again (should that have missed
  // it) as soon as the server's result says this game made a Legend, while
  // the reveal is still climbing to level 100.
  private preloadLegendCeremony(): void {
    if (this.legendCeremonyLoad !== null) return;
    this.legendCeremonyLoad = this.loadLegendCeremony().then(
      (module) => {
        this.legendCeremony = module;
      },
      (err: unknown) => {
        this.legendCeremonyLoad = null;
        console.warn("WinModal: Legend ceremony failed to load", err);
      },
    );
  }

  // The first of those: where the last run is comes from the config, as the
  // server may move it, and from the client's own constant only without one.
  private async preloadIfLastRun(prestige: number): Promise<void> {
    const config = await fetchProgressionConfig();
    const last =
      config !== false && config.maxPrestige > 0
        ? config.maxPrestige
        : MAX_PRESTIGE;
    if (prestige >= last) this.preloadLegendCeremony();
  }

  private onLegendCeremonyClosed = (): void => {
    this.querySelector<HTMLElement>('[data-win-action="keep"]')?.focus();
  };

  // The modal's own buttons, textured like the store's tiles and buy buttons:
  // a tinted gradient with a coloured border, and on hover they lift, glow
  // and a light streak sweeps across. "main" is the blue action (keep playing,
  // play again); "quiet" is leaving.
  private actionButton(
    tone: "main" | "quiet",
    label: string,
    onClick: () => void,
    action: string,
  ): TemplateResult {
    return html`<button
      type="button"
      data-win-action=${action}
      class="win-action win-action-${tone} flex-1"
      @click=${onClick}
    >
      <span class="relative">${label}</span>
    </button>`;
  }

  // Sharing a milestone or becoming a Legend, once the reveal has shown it.
  // Only for the server's result (gameShareMoment), and only for a signed-in
  // player with a profile to link to.
  private renderShare(): TemplateResult | null {
    if (this.sharePublicId === "" || this.xpSettled !== this.xpView) {
      return null;
    }
    const moment = gameShareMoment(this.xpView);
    if (moment === null || moment.kind === "prestige") return null;
    const url = momentShareUrl(this.sharePublicId, moment);
    if (url === null) return null;
    // Three labelled buttons fit side by side from md up; below that (and
    // beside a ranked game's requeue button) it takes a row of its own.
    const placement = this.isRankedGame
      ? "order-first basis-full"
      : "order-first basis-full md:order-none md:basis-0 md:flex-1";
    return html`<profile-share
      data-win-share
      class="flex ${placement}"
      layout="menu"
      .label=${momentShareLabel(moment)}
      .url=${url}
      .text=${momentShareText(moment)}
      triggerClass="win-action win-action-quiet w-full"
    ></profile-share>`;
  }

  private renderActionStyles(): TemplateResult {
    return html`<style>
      .win-action {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 3rem;
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        border: 1px solid;
        color: #fff;
        font-weight: 700;
        font-size: 1.0625rem;
        line-height: 1.25;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition:
          transform 200ms ease-out,
          box-shadow 200ms ease-out,
          border-color 200ms ease-out,
          background 200ms ease-out;
      }
      /* The light streak, parked off the left edge until hover. */
      .win-action::after {
        content: "";
        position: absolute;
        top: -20%;
        bottom: -20%;
        left: -60%;
        width: 40%;
        transform: skewX(-20deg);
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.28),
          transparent
        );
        pointer-events: none;
      }
      /* The streak sweeps across on the way in only; leaving, it snaps back
         out of sight rather than sweeping back across the button. */
      .win-action:hover::after,
      .win-action:focus-visible::after {
        left: 130%;
        transition: left 550ms ease-out;
      }
      .win-action:hover,
      .win-action:focus-visible {
        transform: translateY(-2px);
      }
      .win-action:active {
        transform: translateY(0) scale(0.98);
      }
      .win-action:focus-visible {
        outline: 2px solid #3fa9f5;
        outline-offset: 2px;
      }
      .win-action-main {
        background: linear-gradient(
          to top,
          rgba(0, 132, 209, 0.95) 0%,
          rgba(0, 101, 170, 0.8) 100%
        );
        border-color: rgba(63, 169, 245, 0.55);
      }
      .win-action-main:hover,
      .win-action-main:focus-visible {
        background: linear-gradient(
          to top,
          rgba(29, 150, 230, 1) 0%,
          rgba(0, 120, 200, 0.9) 100%
        );
        border-color: rgba(125, 200, 255, 0.9);
        box-shadow: 0 0 20px rgba(63, 169, 245, 0.55);
      }
      .win-action-quiet {
        background: linear-gradient(
          to top,
          rgba(80, 80, 80, 0.55) 0%,
          rgba(15, 15, 20, 0.85) 100%
        );
        border-color: rgba(255, 255, 255, 0.15);
      }
      .win-action-quiet:hover,
      .win-action-quiet:focus-visible {
        background: linear-gradient(
          to top,
          rgba(110, 110, 120, 0.6) 0%,
          rgba(25, 25, 32, 0.9) 100%
        );
        border-color: rgba(255, 255, 255, 0.35);
        box-shadow: 0 0 14px rgba(255, 255, 255, 0.25);
      }
      @media (prefers-reduced-motion: reduce) {
        .win-action,
        .win-action::after {
          transition: none;
        }
        .win-action:hover,
        .win-action:focus-visible,
        .win-action:active {
          transform: none;
        }
      }
    </style>`;
  }

  innerHtml(): TemplateResult {
    if (!this.gameOver) {
      return html`<p class="m-0 mb-2 text-center text-white/70">
        ${translateText("derpy.awards_at_end")}
      </p>`;
    }
    return html`${this.fanfareButton()}${this.awardsPanel()}${this.coinsPanel()}${this.watchTogetherLine()}`;
  }

  /** DFSTORE (r21): hear your victory fanfare again. */
  private fanfareButton(): TemplateResult | string {
    if (!this.isWin || !this.fanfarePlayed) return "";
    return html`<div class="mb-3 flex justify-center">
      <button
        class="flex items-center gap-1.5 rounded-full border border-cyber-yellow/40 bg-cyber-yellow/10 px-3 py-1 text-sm font-bold text-cyber-yellow hover:bg-cyber-yellow/20"
        @click=${() => void playVictoryFanfare()}
      >
        <span aria-hidden="true">♪</span>
        ${translateText("derpy.fanfare_play_again")}
      </button>
    </div>`;
  }

  /** The end-of-game awards: MVP, most betrayals, most money, most ships. */
  private awardsPanel(): TemplateResult {
    const myClientID = this.game?.myPlayer()?.clientID() ?? null;
    return html`
      <section class="mb-4">
        <h3 class="m-0 mb-3 text-center text-lg font-bold text-white">
          ${translateText("derpy.awards_title")}
        </h3>
        ${this.awards.length === 0
          ? html`<p class="m-0 text-center text-white/60">
              ${translateText("derpy.no_awards")}
            </p>`
          : html`<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              ${this.awards.map((a) => {
                const mine = myClientID !== null && a.clientID === myClientID;
                return html`<div
                  data-award=${a.kind}
                  class="flex flex-col gap-0.5 rounded-lg border px-4 py-3 ${mine
                    ? "border-cyber-yellow bg-cyber-yellow/15"
                    : "border-white/10 bg-black/30"}"
                >
                  <span class="text-xs font-bold text-cyber-yellow"
                    >${translateText(`derpy.award_${a.kind}`)}</span
                  >
                  <span class="truncate text-lg font-bold text-white"
                    >${a.name}${mine
                      ? html` <span class="text-sm text-white/70"
                          >${translateText("derpy.award_you")}</span
                        >`
                      : ""}</span
                  >
                  <span class="text-sm text-white/60"
                    >${awardValueText(a)}</span
                  >
                </div>`;
              })}
            </div>`}
      </section>
    `;
  }

  /** What this game paid (or would have paid) in Derp Coins. */
  private coinsPanel(): TemplateResult | null {
    const result = this.coins;
    if (result === null) return null;
    const signedIn = isDerpySignedIn();
    // CHAL (r25): with any weekly challenges it finished.
    const chal = signedIn ? this.challenges : [];
    // DFX (r26): and the Scenario goal met, once the server has paid it
    // (signed out: what it would pay).
    const goal = this.goalLine(signedIn);
    const extra =
      chal.reduce((n, c) => n + c.coins + (c.bonus ?? 0), 0) +
      (goal?.coins ?? 0);
    return html`
      <section
        class="mb-2 flex flex-col items-center gap-2 rounded-lg border border-cyber-yellow/30 bg-black/30 p-4 text-center"
      >
        <span class="text-2xl font-black text-cyber-yellow">
          ${signedIn
            ? translateText("derpy.coins_earned", {
                coins: result.total + extra,
              })
            : translateText("derpy.coins_would_earn", {
                coins: result.total + (goal?.coins ?? 0),
              })}
        </span>
        ${result.lines.length > 0
          ? html`<div class="flex flex-wrap justify-center gap-1.5">
              ${result.lines.map(
                (l) =>
                  html`<span
                    class="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80"
                    >${translateText(`derpy.coin_line_${l.line}`)}
                    +${l.coins}</span
                  >`,
              )}
            </div>`
          : html`<span class="text-sm text-white/60"
              >${translateText("derpy.coins_too_short")}</span
            >`}
        ${goal !== null
          ? html`<span
              class="rounded-full border border-green-400/40 bg-green-500/15 px-2.5 py-0.5 text-xs font-bold text-green-300"
              data-goal-line
              >${goal.coins > 0
                ? translateText("scenario_goal.coin_line", {
                    coins: goal.coins,
                  })
                : translateText("scenario_goal.collected")}</span
            >`
          : null}
        ${chal.length > 0
          ? html`<div
              class="flex flex-col items-center gap-1.5"
              data-challenges
            >
              <span class="text-xs font-bold uppercase text-cyber-yellow/80"
                >${translateText("derpy.challenges_title")}</span
              >
              <div class="flex flex-wrap justify-center gap-1.5">
                ${chal.map(
                  (c) =>
                    html`<span
                        class="rounded-full border border-cyber-yellow/40 bg-cyber-yellow/15 px-2.5 py-0.5 text-xs font-bold text-cyber-yellow"
                        >${translateText("derpy.challenge_line", {
                          name: challengeName(c),
                          coins: c.coins,
                        })}</span
                      >${c.bonus
                        ? html`<span
                            class="rounded-full border border-cyber-yellow/40 bg-cyber-yellow/15 px-2.5 py-0.5 text-xs font-bold text-cyber-yellow"
                            >${translateText("derpy.challenge_bonus_line", {
                              coins: c.bonus,
                            })}</span
                          >`
                        : null}`,
                )}
              </div>
            </div>`
          : null}
        ${signedIn
          ? null
          : html`<span class="text-sm text-white/60"
              >${translateText("derpy.coins_sign_in")}</span
            >`}
      </section>
    `;
  }

  /** Derp Coins for this game, by the same rules the server pays. */
  private computeCoins(wu: WinUpdate): DerpCoinResult | null {
    try {
      const clientID = this.game.myPlayer()?.clientID();
      if (!clientID) return null;
      const stats = wu.allPlayersStats[clientID];
      if (stats === undefined) return null;
      const land = this.game.numLandTiles();
      const conquests = conquestsFromStats(stats);
      return derpCoinsForGame({
        won: isWinningClient(wu.winner ?? null, clientID),
        peakTerritoryPercent:
          land > 0 ? (peakTilesFromStats(stats) * 100) / land : 0,
        goldEarned: goldEarnedFromStats(stats),
        humansAndNationsConquered: conquests.humansAndNations,
        botsConquered: conquests.bots,
        awards: (wu.awards ?? [])
          .filter((a) => a.clientID === clientID)
          .map((a) => a.kind),
        durationSeconds: Math.floor(this.game.ticks() / 10),
      });
    } catch {
      return null;
    }
  }

  async show() {
    gamePortal.gameplayStop();
    this.isRankedGame =
      this.game.config().gameConfig().rankedType !== undefined;
    this.isVisible = true;
    this.requestUpdate();
  }

  hide() {
    this.isVisible = false;
    this.requestUpdate();
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.xpPollAborted) {
      this.xpPollAborted = false;
      void this.updateXp(true);
    }
  }

  disconnectedCallback(): void {
    this.xpAbort?.abort();
    this.challengeAbort?.abort(); // CHAL (r25)
    this.savedAbort?.abort(); // DFX (r26)
    super.disconnectedCallback();
  }

  /**
   * CHAL (r25): asks the server, a few times over the next minute, what
   * weekly challenges this game finished (it saves the game once the winner
   * is settled, or when a solo game's upload arrives), and toasts each.
   */
  private async watchChallenges(): Promise<void> {
    const game = this.game;
    if (!isDerpySignedIn() || game.config().isReplay() || !game.myPlayer())
      return;
    this.challengeAbort?.abort();
    const abort = new AbortController();
    this.challengeAbort = abort;
    const gameId = game.gameID();
    for (const wait of [2000, 3000, 5000, 8000, 12000, 20000, 30000]) {
      await new Promise((r) => setTimeout(r, wait));
      if (abort.signal.aborted) return;
      const r = await derpyGameChallenges(gameId);
      if (abort.signal.aborted || r === null) continue;
      const seen = new Set(this.challenges.map((c) => c.key));
      for (const c of r.done) {
        if (seen.has(c.key)) continue;
        showToast(
          translateText("derpy.challenge_toast", {
            name: challengeName(c),
            coins: c.coins,
          }),
          "green",
          6000,
        );
        if (c.bonus)
          showToast(
            translateText("derpy.challenge_bonus_toast", { coins: c.bonus }),
            "green",
            6000,
          );
      }
      this.challenges = r.done;
      if (r.recorded) return;
    }
  }

  /**
   * Fills the XP section. `gameOver` is false when the player died while the
   * game carries on: the server only awards XP once the game is archived, so
   * that shows a provisional figure worked out here (or, when there can't be
   * one, says XP comes at the end), and the poll starts when the game really
   * ends.
   */
  private async updateXp(gameOver: boolean): Promise<void> {
    // Derpy Front: no XP (see derpy/UpstreamFeatures), so nothing here asks
    // OpenFront's API, at death or at the end of the game.
    if (!PROGRESSION_ENABLED) return;
    if (this.xpPolling) return;
    // Normally here since the game started; tried again should that fetch
    // have failed.
    loadGameXpPanel();
    try {
      const game = this.game;
      // Spectators and replay viewers have no XP of their own.
      if (game.config().isReplay() || !game.myPlayer()) return;
      const account = await resolveXpAccount();
      // /users/@me failed while there is a session: a signed-in player must
      // not be told to sign in over a network blip, so say nothing.
      if (account.kind === "unknown") return;
      if (account.kind === "signed_out") {
        // Only pitch XP when progression is actually on. There is no
        // /users/@me progress to go by here, so ask the public config (404
        // when progression is off; any failure also says nothing).
        const config = await fetchProgressionConfig();
        if (config === false || this.xpPolling) return;
        this.xpView = { kind: "signed_out" };
        return;
      }
      // /users/@me carries progress whenever progression is on (level 1
      // before a first scored game); absent means off: no section at all.
      const progress = account.me.player.progress;
      if (progress === undefined) return;
      this.sharePublicId = account.me.player.publicId;
      this.xpPublicId = account.me.player.publicId ?? null;
      if (!progress.legend) void this.preloadIfLastRun(progress.prestige);
      // The game may have ended while this was resolving; the end-of-game
      // call owns the section from then on.
      if (this.xpPolling) return;
      if (!gameOver) {
        const provisional = await this.loadProvisionalXp(progress);
        if (this.xpPolling) return;
        if (provisional === null) {
          this.xpView = { kind: "awaiting_end" };
          return;
        }
        this.provisionalXp = provisional;
        this.xpView = { kind: "provisional", provisional, confirming: false };
        return;
      }
      this.xpPolling = true;
      const provisional = this.provisionalXp;
      // A provisional figure stays up while the server's is fetched.
      this.xpView =
        provisional === null
          ? { kind: "calculating" }
          : { kind: "provisional", provisional, confirming: true };
      const abort = new AbortController();
      this.xpAbort = abort;
      const result = await pollGameXp(game.gameID(), { signal: abort.signal });
      // Detached mid-poll: leave the section be (a provisional figure stays
      // up, still confirming) and poll again on re-attach (right away if that
      // happened while this poll was winding down).
      if (abort.signal.aborted) {
        this.xpPolling = false;
        if (this.isConnected) void this.updateXp(true);
        else this.xpPollAborted = true;
        return;
      }
      if (result?.eligible && reachedLegendThisGame(result)) {
        this.preloadLegendCeremony();
      }
      if (result === null) {
        // Timed out, signed out or unreadable: hide rather than show an error
        // (or, worse, a zero). A provisional figure stays, still provisional.
        this.xpView =
          provisional === null
            ? { kind: "hidden" }
            : { kind: "provisional", provisional, confirming: false };
        return;
      }
      // A game that unlocked cosmetics changed what the player owns: the
      // Locker (and everything else reading /users/@me) refetches.
      if (result.eligible && (result.flares ?? []).length > 0) {
        invalidateUserMe();
      }
      if (provisional === null) {
        this.xpView = { kind: "result", data: result };
        return;
      }
      const outcome = reconcileXp(provisional.result, result, {
        disconnectedOpponents: provisional.inputs.disconnectedOpponents,
      });
      if (outcome.drift) {
        // Not explained by what only the end of the game adds: the client's
        // copy of the formula may have drifted from the server's.
        console.warn("Provisional XP differed from the server's", {
          gameId: result.gameId,
          provisional: outcome.provisionalTotal,
          server: result.eligible ? result.breakdown.total : null,
          provisionalResult: provisional.result,
          serverResult: result.eligible
            ? result.breakdown
            : { reason: result.reason },
          inputs: provisional.inputs,
        });
      }
      this.xpView = {
        kind: "result",
        data: result,
        reconciled: { provisional, outcome },
      };
    } catch (err) {
      console.warn("WinModal: XP section failed", err);
      this.xpView = { kind: "hidden" };
    }
  }

  // The provisional XP figure for a player who has just died, or null when
  // there can't be one (see loadProvisionalXp).
  private async loadProvisionalXp(
    progress: Progress,
  ): Promise<ProvisionalXp | null> {
    const progression = await fetchProgressionConfig();
    if (progression === false || provisionalXpRules(progression) === null) {
      return null;
    }
    const game = this.game;
    const myClientID = game.myClientID();
    if (myClientID === undefined) return null;
    // A provisional figure starts from where the player is now, and counts
    // today's allowances as they are now: ask /users/@me afresh (the page's
    // copy is from when the game started, and a game left earlier may have
    // been scored since). Past the page's cache, so a failed ask can't cost
    // the game-end figure its copy; the page's progress stands in for it.
    const fresh = await fetchUserMeUncached();
    return loadProvisionalXp({
      gameId: game.gameID(),
      myClientID,
      config: game.config().gameConfig(),
      progress:
        fresh !== false && fresh.player.progress !== undefined
          ? fresh.player.progress
          : progress,
      progression,
      humanStats: () => game.worker.humanStats(),
    });
  }

  private _handleExit() {
    this.hide();
    window.location.href = homeHref();
  }

  private _handleRequeue() {
    this.hide();
    // Requeue for the same mode; Main owns the mechanism (currently a
    // reload with the requeue param, which reopens the queue after the
    // page teardown).
    const rankedType = this.game.config().gameConfig().rankedType;
    document.dispatchEvent(
      new CustomEvent("matchmaking-requeue", {
        detail: {
          mode:
            rankedType === RankedType.TwoVTwo
              ? ("2v2" as const)
              : rankedType === RankedType.FreeForAll
                ? ("ffa" as const)
                : rankedType === RankedType.ClanWars
                  ? ("clanwars" as const)
                  : ("1v1" as const),
        },
      }),
    );
  }

  init() {
    if (PROGRESSION_ENABLED && !this.game.config().isReplay()) {
      loadGameXpPanel();
    }
  }

  tick() {
    const myPlayer = this.game.myPlayer();
    if (
      !this.hasShownDeathModal &&
      myPlayer &&
      !myPlayer.isAlive() &&
      !this.game.inSpawnPhase() &&
      myPlayer.hasSpawned()
    ) {
      this.hasShownDeathModal = true;
      this._title = translateText("win_modal.died");
      this.eventBus.emit(new PlaySoundEffectEvent("defeat"));
      void this.updateXp(false);
      this.show();
    }
    const updates = this.game.updatesSinceLastTick();
    const winUpdates = updates?.[GameUpdateType.Win] ?? [];
    if (winUpdates.length > 0) void this.updateXp(true);
    winUpdates.forEach((wu) => {
      const awards = wu.awards ?? [];
      if (wu.winner === undefined) {
        // Match cancelled (e.g. a ranked 2v2 that didn't fill or fully
        // spawn): the game ends with no winner. Still vote the result to the
        // server so the record is archived winnerless (never ranked).
        this.eventBus.emit(
          new SendWinnerEvent(undefined, wu.allPlayersStats, awards),
        );
        this._title = translateText("win_modal.match_cancelled");
        this.isWin = false;
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.showResults(wu);
      } else if (wu.winner[0] === "team") {
        this.eventBus.emit(
          new SendWinnerEvent(wu.winner, wu.allPlayersStats, awards),
        );
        if (wu.winner[1] === this.game.myPlayer()?.team()) {
          this._title = translateText("win_modal.your_team");
          this.isWin = true;
          gamePortal.happytime();
        } else {
          this._title = translateText("win_modal.other_team", {
            team: getTranslatedPlayerTeamLabel(wu.winner[1]),
          });
          this.isWin = false;
        }
        // SCEN (r25): a scenario's side wins together, by name ("The
        // Allies win"), with everyone who was on it.
        if ((this.game.scenario?.() ?? null) !== null) {
          const side = wu.winner[1];
          this._title = sideWinLine(side);
          this.sideMembers = this.game
            .playerViews()
            .filter((p) => p.team() === side)
            .map((p) => p.displayName());
        }
        this.playEndOfGameSound();
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.showResults(wu);
      } else if (wu.winner[0] === "nation") {
        this.eventBus.emit(
          new SendWinnerEvent(wu.winner, wu.allPlayersStats, awards),
        );
        this._title = translateText("win_modal.nation_won", {
          nation: wu.winner[1],
        });
        this.isWin = false;
        this.playEndOfGameSound();
        this.showResults(wu);
      } else {
        const winner = this.game.playerByClientID(wu.winner[1]);
        if (!winner?.isPlayer()) return;
        const winnerClient = winner.clientID();
        if (winnerClient !== null) {
          this.eventBus.emit(
            new SendWinnerEvent(
              ["player", winnerClient],
              wu.allPlayersStats,
              awards,
            ),
          );
        }
        if (
          winnerClient !== null &&
          winnerClient === this.game.myPlayer()?.clientID()
        ) {
          this._title = translateText("win_modal.you_won");
          this.isWin = true;
          gamePortal.happytime();
        } else {
          this._title = translateText("win_modal.other_won", {
            player: winner.displayName(),
          });
          this.isWin = false;
        }
        this.playEndOfGameSound();
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.showResults(wu);
      }
    });
  }

  /** The game is decided: show the awards and what it paid in Derp Coins. */
  private showResults(wu: WinUpdate): void {
    this.gameOver = true;
    this.awards = wu.awards ?? [];
    this.coins = this.computeCoins(wu);
    void this.show();
    void this.watchChallenges(); // CHAL (r25)
    void this.watchSaved(); // DFX (r26)
    // DFX (r26): the Scenario goal met, from the engine's end-of-game stats.
    const me = this.game.myPlayer()?.clientID();
    this.goalMet =
      !this.game.config().isReplay() &&
      me !== undefined &&
      me !== null &&
      wu.allPlayersStats[me]?.goal !== undefined;
    void this.watchGoal();
  }

  /**
   * DFX (r26): asks, a few times over the next minute, whether the server
   * has saved this game (it does once the winner is settled, or when a solo
   * game's upload arrives); then it can be watched together.
   */
  private async watchSaved(): Promise<void> {
    if (this.game.config().isReplay()) return;
    this.savedAbort?.abort();
    const abort = new AbortController();
    this.savedAbort = abort;
    const gameId = this.game.gameID();
    for (const wait of [2500, 3000, 5000, 8000, 12000, 20000, 30000]) {
      await new Promise((r) => setTimeout(r, wait));
      if (abort.signal.aborted) return;
      if (await replaySaved(gameId)) {
        if (!abort.signal.aborted) this.replayIsSaved = true;
        return;
      }
    }
  }

  /**
   * DFX (r26): the Scenario goal this game met, for the coin line: the
   * server's word once it has saved the game (signed in), or what it would
   * pay (signed out, from the end-of-game stats). Null when none was met.
   */
  private goalLine(signedIn: boolean): { coins: number } | null {
    if (!this.goalMet) return null;
    if (!signedIn) return { coins: GOAL_COINS };
    return this.goalPaid;
  }

  /**
   * DFX (r26): asks, a few times over the next minute, what the server paid
   * for this game's Scenario goal (it saves the game once the winner is
   * settled, or when a solo game's upload arrives).
   */
  private async watchGoal(): Promise<void> {
    if (!this.goalMet || !isDerpySignedIn()) return;
    const abort = this.savedAbort;
    const gameId = this.game.gameID();
    for (const wait of [2000, 3000, 5000, 8000, 12000, 20000, 30000]) {
      await new Promise((r) => setTimeout(r, wait));
      if (abort?.signal.aborted) return;
      const r = await derpyGameGoal(gameId);
      if (r === null) continue;
      if (r.goal !== null) {
        this.goalPaid = { coins: r.goal.coins };
        if (r.goal.coins > 0)
          showToast(
            translateText("scenario_goal.coin_line", { coins: r.goal.coins }),
            "green",
            6000,
          );
      }
      if (r.recorded) return;
    }
  }

  /** DFX (r26): watch this game's replay with friends, once it's saved. */
  private watchTogetherLine(): TemplateResult | typeof nothing {
    if (!this.replayIsSaved) return nothing;
    return html`<div
      class="mb-2 flex flex-wrap items-center justify-center gap-2 text-sm text-white/70"
      data-win-watch
    >
      <span>${translateText("watch_together.win_line")}</span>
      <derpy-watch-button .gameId=${this.game.gameID()}></derpy-watch-button>
    </div>`;
  }

  private playEndOfGameSound(): void {
    if (this.isWin) {
      // DFSTORE (r21): your victory fanfare, if you chose and own one (and
      // music isn't muted); the usual victory sound otherwise.
      void playVictoryFanfare().then((played) => {
        this.fanfarePlayed = played;
        if (!played) this.eventBus.emit(new PlaySoundEffectEvent("victory"));
      });
    } else if (!this.hasShownDeathModal && this.game.myPlayer()?.hasSpawned()) {
      // Spawned check: spectators and replay viewers shouldn't get a
      // personal defeat sting. The cue also already played if the player
      // died earlier (hasShownDeathModal).
      this.eventBus.emit(new PlaySoundEffectEvent("defeat"));
    }
  }
}
