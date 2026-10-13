// Before the game: the room. Each player makes the character they'll be
// (the register on the desk), the host sets the start date and difficulty
// (a note pinned to the side), and when everyone's ready they set out.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "../../derpland/DerpBar";
import { AMERICAS } from "../engine/Map";
import { newGameState } from "../engine/Setup";
import type { GameState, LifePlan, StartYear } from "../engine/Types";
import { END_YEAR, ServerMessage } from "../Protocol";
import { flag } from "./Flags";
import { guideOverlay } from "./guide/Guide";
import { settingsFields } from "./Lobby";
import "./Maker";
import { Net } from "./Net";

export type LobbyState = Extract<ServerMessage, { t: "lobby" }>;

const previews = new Map<StartYear, GameState>();

/** The world as it stands on a start date, for choosing where to be born. */
export function previewWorld(start: StartYear): GameState {
  let s = previews.get(start);
  if (!s) {
    s = newGameState(AMERICAS, {
      endYear: END_YEAR,
      difficulty: "normal",
      seed: 1,
      start,
    });
    previews.set(start, s);
  }
  return s;
}

@customElement("cq-room")
export class Room extends LitElement {
  @property({ attribute: false }) net!: Net;
  @property({ attribute: false }) lobby!: LobbyState;

  @state() private sent: string | null = null;
  @state() private copied = false;
  /** How to Play, open over the register (r11 wave 2). */
  @state() private guide: string | null = null;

  createRenderRoot() {
    return this;
  }

  private get me() {
    return this.lobby.seats.find((s) => s.id === this.lobby.you);
  }

  private leave(): void {
    this.net.leave();
    this.dispatchEvent(new CustomEvent("cq-leave", { bubbles: true }));
  }

  private sign(plan: LifePlan): void {
    this.net.send({ t: "plan", plan });
    this.sent = JSON.stringify(plan);
  }

  render(): TemplateResult {
    const L = this.lobby;
    const start = L.settings.start ?? 1607;
    const me = this.me;
    return html`<div class="cq-lobby cq-room">
      <derp-bar page="conquest"></derp-bar>
      <div class="cq-lobby-page">
        <header class="cq-room-head">
          <div>
            <h1 class="cq-title small">
              ${L.solo
                ? "A new life"
                : html`Game room <span class="cq-code">${L.code}</span>`}
            </h1>
            <p class="cq-muted">
              ${L.solo
                ? `The Americas from ${start} to ${END_YEAR}. Make the person you'll be.`
                : html`Each of you makes a character; you'll live in the same
                  world.
                  ${L.open
                    ? "Listed under open games."
                    : "Private: share the code."}`}
            </p>
          </div>
          <div class="cq-btnrow">
            ${!L.solo
              ? html`<button
                  class="cq-btn"
                  @click=${() => {
                    void navigator.clipboard
                      ?.writeText(`${location.origin}/conquest?join=${L.code}`)
                      .then(() => {
                        this.copied = true;
                        setTimeout(() => (this.copied = false), 2000);
                      });
                  }}
                >
                  ${this.copied ? "Link copied" : "Copy invite link"}
                </button>`
              : nothing}
            <button
              class="cq-btn"
              @click=${() => (this.guide = "maker")}
              title="How to Play: making a character, the first hour, and every part of the game"
            >
              How to play
            </button>
            <button class="cq-btn quiet" @click=${() => this.leave()}>
              Leave
            </button>
          </div>
        </header>

        <div class="cq-room-grid">
          <div class="cq-room-main">
            <cq-maker
              .world=${previewWorld(start)}
              .signed=${me?.made ? this.sent : null}
              .signLabel=${me?.made ? "Sign the changes" : "Sign the register"}
              .intro=${html`A register of persons setting out for the Americas,
                in the year ${start}. Everything here has a roll button: make as
                much or as little of it as you like.
                <button class="cq-link" @click=${() => (this.guide = "maker")}>
                  What each choice means ›
                </button>`}
              @cq-plan=${(e: CustomEvent<LifePlan>) => this.sign(e.detail)}
            ></cq-maker>
          </div>
          <aside class="cq-room-side">${this.side()}</aside>
        </div>
      </div>
      ${this.guide !== null
        ? guideOverlay(this.guide, () => (this.guide = null))
        : nothing}
    </div>`;
  }

  /**
   * SITE (r19): watching from Derp Land once the game begins. A game open to
   * all can always be watched; a private (or solo) one if its host allows.
   */
  private watchersPart(): TemplateResult {
    const L = this.lobby;
    const host = L.host === L.you;
    if (L.open && !L.solo)
      return html`<p class="cq-muted small cq-watch-note">
        Once it begins, anyone can watch it from Derp Land.
      </p>`;
    if (!host)
      return html`<p class="cq-muted small cq-watch-note">
        ${L.allowWatchers
          ? "The host lets people watch it from Derp Land once it begins."
          : "Only its players will see this game."}
      </p>`;
    return html`<label class="cq-check">
        <input
          type="checkbox"
          .checked=${L.allowWatchers === true}
          @change=${(e: Event) =>
            this.net.send({
              t: "allowwatch",
              allow: (e.target as HTMLInputElement).checked,
            })}
        />
        Let people watch from Derp Land
      </label>
      <p class="cq-muted small cq-watch-note">
        Watchers see the world as anyone may, never what's private to a player.
      </p>`;
  }

  private side(): TemplateResult {
    const L = this.lobby;
    const me = this.me;
    const host = L.host === L.you;
    const ready = me?.ready ?? false;
    const others = L.seats.filter((s) => s.id !== L.host);
    const canStart =
      !!me?.made && (L.solo || others.every((s) => s.made && s.ready));
    return html`<div class="cq-sheet">
      ${!L.solo
        ? html`<h2 class="cq-h3">Who's setting out</h2>
            <ul class="cq-seats">
              ${L.seats.map(
                (s) =>
                  html`<li class=${s.online ? "" : "away"}>
                    ${s.origin
                      ? flag(s.origin, "cq-flag sm")
                      : html`<span class="cq-flag sm empty"></span>`}
                    <span class="cq-seat-name"
                      >${s.name}${s.id === L.host
                        ? html` <span class="cq-muted small">host</span>`
                        : nothing}${s.character
                        ? html`<span class="cq-seat-char">${s.character}</span>`
                        : nothing}</span
                    >
                    <span class="cq-seat-state">
                      ${!s.made
                        ? "making a character"
                        : s.ready || s.id === L.host
                          ? html`<b class="good">ready</b>`
                          : "not ready"}
                    </span>
                  </li>`,
              )}
            </ul>`
        : nothing}
      <h2 class="cq-h3">The world</h2>
      ${settingsFields(
        L.settings,
        (settings) => this.net.send({ t: "settings", settings, open: L.open }),
        host,
      )}
      ${host && !L.solo
        ? html`<label class="cq-check">
            <input
              type="checkbox"
              .checked=${L.open}
              @change=${(e: Event) =>
                this.net.send({
                  t: "settings",
                  settings: L.settings,
                  open: (e.target as HTMLInputElement).checked,
                })}
            />
            Listed under open games
          </label>`
        : nothing}
      ${this.watchersPart() /* SITE (r19) */}
      <div class="cq-start">
        ${host
          ? html`<button
                class="cq-btn primary big"
                ?disabled=${!canStart}
                @click=${() => this.net.send({ t: "start" })}
              >
                Set out
              </button>
              <p class="cq-muted small">
                ${!me?.made
                  ? "Sign the register first."
                  : !canStart
                    ? "Waiting for everyone to be ready."
                    : L.solo
                      ? "The world starts paused so you can look around."
                      : "Everyone's ready."}
              </p>`
          : html`<button
                class="cq-btn ${ready ? "" : "primary"} big"
                ?disabled=${!me?.made}
                @click=${() => this.net.send({ t: "ready", ready: !ready })}
              >
                ${ready ? "Not ready yet" : "I'm ready"}
              </button>
              <p class="cq-muted small">
                ${me?.made
                  ? "The host sets out when everyone's ready."
                  : "Make your character and sign the register."}
              </p>`}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-room": Room;
  }
}
