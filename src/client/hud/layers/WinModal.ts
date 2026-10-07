import { Award, GameAwards } from "@openfront/engine-api/game/Awards";
import { RankedType } from "@openfront/engine-api/game/GameTypes";
import {
  GameUpdateType,
  WinUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { renderNumber } from "@openfront/engine-lib/Format";
import {
  conquestsFromStats,
  DerpCoinResult,
  derpCoinsForGame,
  goldEarnedFromStats,
  isWinningClient,
  peakTilesFromStats,
} from "@openfront/shared/DerpCoins";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { homeHref, translateText } from "../../../client/Utils";
import { Controller } from "../../Controller";
import { crazyGamesSDK } from "../../CrazyGamesSDK";
import { isDerpySignedIn } from "../../derpy/DerpySession";
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

  private _title: string;

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
        <div class="min-h-0 flex-1 overflow-y-auto pr-0.5">
          ${this.innerHtml()}
        </div>
        <div class="mt-4 flex justify-between gap-2.5 shrink-0">
          <o-button
            variant="primary"
            width="block"
            class="flex-1"
            translationKey="win_modal.exit"
            @click=${this._handleExit}
          ></o-button>
          ${this.isRankedGame
            ? html`
                <o-button
                  variant="primary"
                  width="block"
                  class="flex-1"
                  translationKey="win_modal.requeue"
                  @click=${this._handleRequeue}
                ></o-button>
              `
            : null}
          <o-button
            variant="primary"
            width="block"
            class="flex-1"
            .title=${this.game?.myPlayer()?.isAlive()
              ? translateText("win_modal.keep")
              : translateText("win_modal.spectate")}
            @click=${this.hide}
          ></o-button>
        </div>
      </div>
    `;
  }

  innerHtml(): TemplateResult {
    if (!this.gameOver) {
      return html`<p class="m-0 mb-2 text-center text-white/70">
        ${translateText("derpy.awards_at_end")}
      </p>`;
    }
    return html`${this.awardsPanel()}${this.coinsPanel()}`;
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
    return html`
      <section
        class="mb-2 flex flex-col items-center gap-2 rounded-lg border border-cyber-yellow/30 bg-black/30 p-4 text-center"
      >
        <span class="text-2xl font-black text-cyber-yellow">
          ${signedIn
            ? translateText("derpy.coins_earned", { coins: result.total })
            : translateText("derpy.coins_would_earn", {
                coins: result.total,
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
    crazyGamesSDK.gameplayStop();
    this.isRankedGame =
      this.game.config().gameConfig().rankedType !== undefined;
    this.isVisible = true;
    this.requestUpdate();
  }

  hide() {
    this.isVisible = false;
    this.requestUpdate();
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
    document.dispatchEvent(
      new CustomEvent("matchmaking-requeue", {
        detail: {
          mode:
            this.game.config().gameConfig().rankedType === RankedType.TwoVTwo
              ? ("2v2" as const)
              : ("1v1" as const),
        },
      }),
    );
  }

  init() {}

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
      this.show();
    }
    const updates = this.game.updatesSinceLastTick();
    const winUpdates = updates?.[GameUpdateType.Win] ?? [];
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
          crazyGamesSDK.happytime();
        } else {
          this._title = translateText("win_modal.other_team", {
            team: wu.winner[1],
          });
          this.isWin = false;
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
          crazyGamesSDK.happytime();
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
  }

  private playEndOfGameSound(): void {
    if (this.isWin) {
      this.eventBus.emit(new PlaySoundEffectEvent("victory"));
    } else if (!this.hasShownDeathModal && this.game.myPlayer()?.hasSpawned()) {
      // Spawned check: spectators and replay viewers shouldn't get a
      // personal defeat sting. The cue also already played if the player
      // died earlier (hasShownDeathModal).
      this.eventBus.emit(new PlaySoundEffectEvent("defeat"));
    }
  }
}
