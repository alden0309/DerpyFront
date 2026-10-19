import {
  isPlayable,
  scenarioData,
  ScenarioNation,
} from "@openfront/engine-lib/scenario/ScenarioData";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import { nationName, neutralName, sideMark, sideName } from "./ScenarioText";

/** A lobby seat as the board shows it: who holds the nation. */
export interface BoardSeat {
  clientID: string;
  name: string;
}

/**
 * A lobby's seats for the board, from its config's seats and its players:
 * only players in the lobby hold seats (spectators hold none), and players
 * without one are listed apart.
 */
export function boardSeats(
  seats: Readonly<Record<string, string>> | undefined,
  clients: readonly {
    clientID: string;
    username: string;
    spectator?: boolean;
  }[],
): { seats: Record<string, BoardSeat>; unseated: BoardSeat[] } {
  const players = clients.filter((c) => c.spectator !== true);
  const byID = new Map(players.map((c) => [c.clientID, c]));
  const out: Record<string, BoardSeat> = {};
  const seated = new Set<string>();
  for (const [key, clientID] of Object.entries(seats ?? {})) {
    const c = byID.get(clientID);
    if (c === undefined || seated.has(clientID)) continue;
    out[key] = { clientID, name: c.username };
    seated.add(clientID);
  }
  return {
    seats: out,
    unseated: players
      .filter((c) => !seated.has(c.clientID))
      .map((c) => ({ clientID: c.clientID, name: c.username })),
  };
}

/**
 * SCEN (r25): a Scenario's nations, grouped by side, to pick one from. On the
 * Scenarios screen it picks your nation; in a scenario lobby it also shows
 * who holds each seat ("Computer" where nobody does) and, for the host, moves
 * players: pick a player, then a nation, or free their seat.
 *
 * Events (bubbling): "nation-picked" (detail: the nation's key) when you pick
 * one for yourself; "seat-change" (detail: { nation: key | null, target })
 * when the host moves someone or frees their seat.
 */
@customElement("scenario-nation-board")
export class ScenarioNationBoard extends LitElement {
  @property({ type: String }) scenarioId = "";
  /** The nation picked (the Scenarios screen) or your seat (the lobby). */
  @property({ type: String }) selected: string | null = null;
  /** Lobby seats by nation key; absent on the Scenarios screen. */
  @property({ attribute: false }) seats: Record<string, BoardSeat> | null =
    null;
  /** Players in the lobby without a seat. */
  @property({ attribute: false }) unseated: BoardSeat[] = [];
  @property({ type: String }) myClientID = "";
  /** The host may move other players and free their seats. */
  @property({ type: Boolean }) canManage = false;
  /** Read-only (a lobby that is starting). */
  @property({ type: Boolean }) locked = false;
  /** The player the host is moving, picked from the board. */
  @state() private moving: BoardSeat | null = null;

  createRenderRoot() {
    return this;
  }

  private emit(name: string, detail: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  private pick(n: ScenarioNation) {
    if (this.locked || !isPlayable(n)) return;
    const holder = this.seats?.[n.key];
    if (this.moving !== null) {
      this.emit("seat-change", { nation: n.key, target: this.moving.clientID });
      this.moving = null;
      return;
    }
    if (holder !== undefined && holder.clientID !== this.myClientID) {
      // The host can pick up a seated player to move them.
      if (this.canManage) this.moving = holder;
      return;
    }
    this.emit("nation-picked", n.key);
  }

  private startMoving(seat: BoardSeat, e: Event) {
    e.stopPropagation();
    if (this.locked || !this.canManage) return;
    this.moving = this.moving?.clientID === seat.clientID ? null : { ...seat };
  }

  private free(seat: BoardSeat, e: Event) {
    e.stopPropagation();
    if (this.locked) return;
    this.moving = null;
    this.emit("seat-change", { nation: null, target: seat.clientID });
  }

  private renderNation(n: ScenarioNation): TemplateResult {
    const holder = this.seats?.[n.key];
    const mine =
      this.seats === null
        ? this.selected === n.key
        : holder?.clientID === this.myClientID;
    const takenByOther =
      holder !== undefined && holder.clientID !== this.myClientID;
    const lobby = this.seats !== null;
    const clickable =
      !this.locked &&
      isPlayable(n) &&
      (this.moving !== null || !takenByOther || this.canManage);
    const label = nationName(n);
    return html`<div
      class="group relative flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${mine
        ? "border-cyber-yellow/80 bg-cyber-yellow/15"
        : takenByOther
          ? "border-white/15 bg-white/10"
          : "border-white/10 bg-white/[0.04]"} ${clickable
        ? "cursor-pointer hover:border-malibu-blue/60 hover:bg-malibu-blue/15"
        : "opacity-70"}"
      role="button"
      tabindex=${clickable ? "0" : "-1"}
      aria-pressed=${mine}
      data-nation=${n.key}
      title=${this.moving !== null
        ? translateText("scenarios.move_here", { name: this.moving.name })
        : label}
      @click=${() => this.pick(n)}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.pick(n);
        }
      }}
    >
      <img
        src=${assetUrl(`flags/${n.flag}.svg`)}
        alt=""
        class="h-5 w-7 shrink-0 rounded-sm object-cover shadow"
        loading="lazy"
      />
      <span class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="truncate text-sm font-semibold text-white">${label}</span>
        ${lobby
          ? html`<span
              class="truncate text-[11px] ${holder === undefined
                ? "text-white/40"
                : mine
                  ? "text-cyber-yellow"
                  : "text-white/80"}"
              >${holder === undefined
                ? translateText("scenarios.computer")
                : mine
                  ? translateText("scenarios.you")
                  : holder.name}</span
            >`
          : nothing}
      </span>
      ${lobby && holder !== undefined && !this.locked && this.canManage
        ? html`<span class="flex shrink-0 gap-1">
            ${holder.clientID !== this.myClientID
              ? html`<button
                  class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/60 hover:bg-white/10 hover:text-white ${this
                    .moving?.clientID === holder.clientID
                    ? "bg-malibu-blue/40 text-white"
                    : ""}"
                  title=${translateText("scenarios.change")}
                  @click=${(e: Event) => this.startMoving(holder, e)}
                >
                  ⇄
                </button>`
              : nothing}
            <button
              class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/60 hover:bg-red-500/30 hover:text-white"
              title=${translateText("scenarios.free_seat")}
              aria-label=${translateText("scenarios.free_seat")}
              @click=${(e: Event) => this.free(holder, e)}
            >
              ✕
            </button>
          </span>`
        : nothing}
    </div>`;
  }

  private renderGroup(
    title: string,
    mark: string,
    nations: ScenarioNation[],
  ): TemplateResult | typeof nothing {
    if (nations.length === 0) return nothing;
    return html`<section class="space-y-2" data-side-group>
      <h4
        class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/70"
      >
        <span aria-hidden="true">${mark}</span>${title}
        <span class="font-medium normal-case tracking-normal text-white/40"
          >${translateText("scenarios.nations_count", {
            count: nations.length,
          })}</span
        >
      </h4>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        ${nations.map((n) => this.renderNation(n))}
      </div>
    </section>`;
  }

  render() {
    const data = scenarioData(this.scenarioId);
    if (data === null) return nothing;
    return html`<div class="space-y-4">
      ${this.seats !== null && this.unseated.length > 0
        ? html`<div
            class="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            <span>${translateText("scenarios.unseated")}</span>
            ${this.unseated.map(
              (u) =>
                html`<button
                  class="rounded-full border px-2 py-0.5 font-semibold ${this
                    .moving?.clientID === u.clientID
                    ? "border-malibu-blue bg-malibu-blue/40 text-white"
                    : "border-white/20 text-white"} ${this.canManage
                    ? ""
                    : "cursor-default"}"
                  @click=${(e: Event) => this.startMoving(u, e)}
                >
                  ${u.clientID === this.myClientID
                    ? translateText("scenarios.you")
                    : u.name}
                </button>`,
            )}
          </div>`
        : nothing}
      ${this.moving !== null
        ? html`<div
            class="rounded-lg border border-malibu-blue/40 bg-malibu-blue/15 px-3 py-2 text-xs text-white"
          >
            ${translateText("scenarios.move_here", { name: this.moving.name })}
          </div>`
        : nothing}
      ${data.sides.map((s) =>
        this.renderGroup(
          sideName(s),
          sideMark(s.color),
          data.nations.filter((n) => n.side === s.id),
        ),
      )}
      ${this.renderGroup(
        neutralName(data),
        "⚪",
        data.nations.filter((n) => n.side === null),
      )}
    </div>`;
  }
}
