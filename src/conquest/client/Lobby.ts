// Derpy Conquest's front page: start a game (alone or with friends), join
// one of the public games running now, or pick up a saved one.

import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "../../derpland/DerpBar";
import { openSignIn } from "../../derpland/DerpBar";
import { AMERICAS } from "../engine/Map";
import { START_SUMMARY_1607, START_YEARS, STARTS } from "../engine/Starts";
import type { Difficulty, StartYear } from "../engine/Types";
import {
  DIFFICULTIES,
  END_YEAR_MAX,
  minEndYear,
  OpenRoom,
  RoomSettings,
  SavedGame,
} from "../Protocol";
import { creditsList } from "./Credits";
import { flag } from "./Flags";
import { Net } from "./Net";
import "./Range";

const POWER_NAME = Object.fromEntries(
  AMERICAS.powers.map((p) => [p.id, p.name.replace(/^the /, "")]),
);

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: "Computer powers start poorer and pick fewer fights; native nations are slower to go to war.",
  normal: "Everyone starts as history had it.",
  hard: "Computer powers start richer and fight more readily; native nations anger sooner.",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

@customElement("cq-lobby")
export class Lobby extends LitElement {
  @property({ attribute: false }) net!: Net;
  @property({ attribute: false }) open: OpenRoom[] = [];
  @property({ attribute: false }) saved: SavedGame[] = [];
  @property({ attribute: false }) account: string | null = null;
  @property({ attribute: false }) name = "";
  @property({ attribute: false }) online = false;
  @property({ attribute: false }) joinCode = "";

  @state() private together = false;
  @state() private isPublic = true;
  @state() private settings: RoomSettings = {
    endYear: 1675,
    difficulty: "normal",
  };
  @state() private code = "";

  private refresh = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.code = this.joinCode;
    this.net.send({ t: "list" });
    this.refresh = window.setInterval(() => this.net.send({ t: "list" }), 8000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.refresh);
  }

  private create(): void {
    this.net.send({
      t: "create",
      solo: !this.together,
      open: this.together && this.isPublic,
      settings: this.settings,
    });
  }

  private setName(v: string): void {
    this.dispatchEvent(
      new CustomEvent("cq-name", { detail: v, bubbles: true }),
    );
  }

  render(): TemplateResult {
    return html`<div class="cq-lobby">
      <derp-bar page="conquest"></derp-bar>
      <div class="cq-lobby-page">
        <section class="cq-hero">
          <figure class="cq-hero-art">
            <img
              src="/derpland/conquest-box.webp"
              alt="An old map of the Atlantic coast with sailing ships and colonial forts"
              width="900"
              height="600"
            />
          </figure>
          <div class="cq-hero-text">
            <h1 class="cq-title">Derpy Conquest</h1>
            <p class="cq-tagline">
              The Americas, 1607 to 1800. You are the governor.
            </p>
            <p>
              Your crown has granted you a charter: a few hundred settlers in
              1607, or a colony already taking root in 1650 or 1700. Feed them,
              trade with the native nations or fight them, keep the crown paid
              or break with it. Real time with pause, for one to five players.
            </p>
            ${this.online
              ? nothing
              : html`<p class="cq-warn">Connecting to the game server…</p>`}
          </div>
        </section>

        <div class="cq-lobby-grid">
          <section class="cq-sheet cq-new">
            <h2 class="cq-h2">Start a game</h2>
            ${this.account
              ? html`<p class="cq-muted">
                  Playing as <b>${this.account}</b>. Your games are saved to
                  your account.
                </p>`
              : html`<label class="cq-field">
                    <span>Your name</span>
                    <input
                      .value=${this.name}
                      maxlength="24"
                      autocomplete="nickname"
                      @change=${(e: Event) =>
                        this.setName((e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <p class="cq-muted small">
                    <button
                      class="cq-link"
                      @click=${() => openSignIn("signin")}
                    >
                      Sign in
                    </button>
                    or
                    <button
                      class="cq-link"
                      @click=${() => openSignIn("create")}
                    >
                      make an account
                    </button>
                    to save games and earn Derp Coins.
                  </p>`}
            <div class="cq-seg big" role="radiogroup" aria-label="Who plays">
              <button
                role="radio"
                aria-checked=${!this.together}
                @click=${() => (this.together = false)}
              >
                <b>Alone</b><span>You and the computer's nations</span>
              </button>
              <button
                role="radio"
                aria-checked=${this.together}
                @click=${() => (this.together = true)}
              >
                <b>With friends</b><span>Up to five, one nation each</span>
              </button>
            </div>
            ${this.together
              ? html`<label class="cq-check">
                  <input
                    type="checkbox"
                    .checked=${this.isPublic}
                    @change=${(e: Event) =>
                      (this.isPublic = (e.target as HTMLInputElement).checked)}
                  />
                  List it under open games so anyone can join
                </label>`
              : nothing}
            ${settingsFields(this.settings, (s) => (this.settings = s), true)}
            <button
              class="cq-btn primary big"
              ?disabled=${!this.online}
              @click=${() => this.create()}
            >
              ${this.together ? "Open a game room" : "Choose your nation"}
            </button>
          </section>

          <section class="cq-sheet cq-open">
            <div class="cq-sheet-head">
              <h2 class="cq-h2">Open games</h2>
              <button
                class="cq-btn quiet small"
                @click=${() => this.net.send({ t: "list" })}
              >
                Refresh
              </button>
            </div>
            ${this.open.length === 0
              ? html`<p class="cq-empty">
                  No public games right now. Open one and it will show up here
                  for everyone.
                </p>`
              : html`<ul class="cq-rooms">
                  ${this.open.map((r) => this.roomRow(r))}
                </ul>`}
            <form
              class="cq-join"
              @submit=${(e: Event) => {
                e.preventDefault();
                if (this.code.trim())
                  this.net.send({
                    t: "join",
                    code: this.code.trim().toUpperCase(),
                  });
              }}
            >
              <label class="cq-field inline">
                <span>Have a code?</span>
                <input
                  .value=${this.code}
                  maxlength="4"
                  placeholder="ABCD"
                  autocapitalize="characters"
                  spellcheck="false"
                  @input=${(e: Event) =>
                    (this.code = (
                      e.target as HTMLInputElement
                    ).value.toUpperCase())}
                />
              </label>
              <button class="cq-btn" ?disabled=${this.code.trim().length !== 4}>
                Join
              </button>
            </form>
          </section>

          <section class="cq-sheet cq-saved">
            <h2 class="cq-h2">Your saved games</h2>
            ${!this.account
              ? html`<p class="cq-empty">
                  <button class="cq-link" @click=${() => openSignIn("signin")}>
                    Sign in
                  </button>
                  to keep games and come back to them.
                </p>`
              : this.saved.length === 0
                ? html`<p class="cq-empty">
                    None yet. Games save by themselves as you play.
                  </p>`
                : html`<ul class="cq-rooms">
                    ${this.saved.map((g) => this.savedRow(g))}
                  </ul>`}
          </section>
        </div>
        <footer class="cq-foot">
          Derpy Conquest is part of <a href="/">Derp Land</a>. © OpenFront and
          Contributors.
          <a
            href="https://github.com/alden0309/DerpyFront"
            target="_blank"
            rel="noopener"
            >Source code</a
          >
          <details class="cq-foot-credits">
            <summary>Credits for the art, sounds and music</summary>
            ${creditsList()}
          </details>
        </footer>
      </div>
    </div>`;
  }

  private roomRow(r: OpenRoom): TemplateResult {
    const nations = r.players.filter((p) => p.power);
    return html`<li class="cq-room-row">
      <div class="cq-room-flags">
        ${nations.length
          ? nations.map((p) => flag(p.power!, "cq-flag sm"))
          : html`<span class="cq-muted small">no nations picked</span>`}
      </div>
      <div class="cq-room-info">
        <b>${r.host}'s game</b>
        <span class="cq-muted small">
          ${r.players.length} player${r.players.length === 1 ? "" : "s"},
          ${r.settings.start ?? 1607} to ${r.settings.endYear},
          ${r.settings.difficulty}
          ${r.started
            ? html`<span class="cq-chip">Playing, ${r.year}</span>`
            : html`<span class="cq-chip good">Choosing nations</span>`}
        </span>
      </div>
      <button
        class="cq-btn small"
        @click=${() => this.net.send({ t: "join", code: r.code })}
      >
        ${r.started ? "Watch" : "Join"}
      </button>
    </li>`;
  }

  private savedRow(g: SavedGame): TemplateResult {
    return html`<li class="cq-room-row">
      <div class="cq-room-flags">
        ${g.power ? flag(g.power, "cq-flag sm") : nothing}
      </div>
      <div class="cq-room-info">
        <b>${POWER_NAME[g.power] ?? "A game"}, ${g.year}</b>
        <span class="cq-muted small"
          >${g.players.length > 1 ? `With ${g.players.join(", ")}. ` : ""}Saved
          ${ago(g.savedAt)}.</span
        >
      </div>
      <button
        class="cq-btn small ${g.live ? "" : "primary"}"
        @click=${() => this.net.send({ t: "resume", id: g.id })}
      >
        ${g.live ? "Rejoin" : "Resume"}
      </button>
    </li>`;
  }
}

const START_TITLE: Record<StartYear, string> = {
  1607: "The first colonies",
  1650: "Colonies taking root",
  1700: "Empires at the brink",
};

export function startSummary(start: StartYear): string {
  return start === 1607 ? START_SUMMARY_1607 : (STARTS[start]?.summary ?? "");
}

/** The start date, end year and difficulty, shared by the lobby and the room. */
export function settingsFields(
  s: RoomSettings,
  set: (s: RoomSettings) => void,
  editable: boolean,
): TemplateResult {
  const start = s.start ?? 1607;
  const pickStart = (y: StartYear) => {
    if (y === start) return;
    const end = Math.max(
      minEndYear(y),
      Math.min(END_YEAR_MAX, s.endYear + (y - start)),
    );
    set({ ...s, start: y, endYear: end });
  };
  return html`<div class="cq-settings">
    <div class="cq-field">
      <span class="cq-field-label" id="cq-start-label">Begin in</span>
      <div class="cq-starts" role="radiogroup" aria-labelledby="cq-start-label">
        ${START_YEARS.map(
          (y) =>
            html`<button
              role="radio"
              aria-checked=${y === start}
              ?disabled=${!editable && y !== start}
              @click=${() => editable && pickStart(y)}
            >
              <b>${y}</b><span>${START_TITLE[y]}</span>
            </button>`,
        )}
      </div>
      <p class="cq-muted small cq-start-summary">${startSummary(start)}</p>
    </div>
    <div class="cq-field">
      <cq-range
        label="Play until"
        .min=${minEndYear(start)}
        .max=${END_YEAR_MAX}
        .step=${5}
        .value=${s.endYear}
        ?disabled=${!editable}
        .note=${(y: number) => `${y - start} years of play`}
        @cq-change=${(e: CustomEvent<number>) =>
          set({ ...s, endYear: e.detail })}
      ></cq-range>
    </div>
    <label class="cq-field">
      <span>Difficulty</span>
      <select
        ?disabled=${!editable}
        @change=${(e: Event) =>
          set({
            ...s,
            difficulty: (e.target as HTMLSelectElement).value as Difficulty,
          })}
      >
        ${DIFFICULTIES.map(
          (d) =>
            html`<option value=${d} ?selected=${s.difficulty === d}>
              ${d[0].toUpperCase() + d.slice(1)}
            </option>`,
        )}
      </select>
    </label>
    <p class="cq-muted small cq-settings-note">
      ${DIFFICULTY_TEXT[s.difficulty]}
    </p>
  </div>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-lobby": Lobby;
  }
}
