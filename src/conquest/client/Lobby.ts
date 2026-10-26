// Derpy Conquest's front page: begin a life (alone or with friends), join
// one of the worlds running now, or pick up a saved one.

import { html, LitElement, nothing, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "../../derpland/DerpBar";
import { openSignIn } from "../../derpland/DerpBar";
import { type ConquestDlcOwned, NO_DLC } from "../DlcIds"; // DLC (r21)
import { countsOverall } from "../engine/Achievements"; // CQACH (r22)
import { AMERICAS } from "../engine/Map";
import {
  endYearOf,
  lastYearOf,
  START_SUMMARY_1607,
  START_YEARS,
  STARTS,
} from "../engine/Starts";
import type { Difficulty, StartYear } from "../engine/Types";
import {
  DIFFICULTIES,
  END_YEAR,
  LiveRoom,
  OpenRoom,
  RoomSettings,
  SavedGame,
} from "../Protocol";
import deskMap from "./art/desk_map.webp?url";
import { creditsList } from "./Credits";
import { STORE_CAMPAIGNS } from "./Dlc"; // DLC (r21)
import { emblem, flag } from "./Flags";
import { guideOverlay } from "./guide/Guide";
import { Net } from "./Net";
import { firstLifeSeen, setFirstLifeSeen } from "./Prefs"; // CQTUT (r26)
import "./Range";

const PEOPLE_NAME: Record<string, string> = Object.fromEntries([
  ...AMERICAS.powers.map((p) => [p.id, p.name.replace(/^the /, "")]),
  ...AMERICAS.natives.map((n) => [n.id, n.name]),
]);
const NATIVE_COLOR = Object.fromEntries(
  AMERICAS.natives.map((n) => [n.id, n.color]),
);

function originFlag(key: string): TemplateResult {
  return NATIVE_COLOR[key]
    ? emblem(NATIVE_COLOR[key], "cq-flag sm")
    : flag(key, "cq-flag sm");
}

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: "The colonies are poorer and pick fewer fights; native nations are slower to go to war. A gentler world to live in.",
  normal: "Everyone starts as history had it.",
  hard: "The colonies are richer and fight more readily; native nations anger sooner. Wars come often.",
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
  /** STORY (r17): finished games, and those saved by an older version. */
  @property({ attribute: false }) finished: SavedGame[] = [];
  /** SITE (r19): games being played now that anyone may watch. */
  @property({ attribute: false }) live: LiveRoom[] = [];
  @property({ attribute: false }) account: string | null = null;
  @property({ attribute: false }) name = "";
  @property({ attribute: false }) online = false;
  @property({ attribute: false }) joinCode = "";
  /** DLC (r21): what the account owns (the server's word, from its welcome). */
  @property({ attribute: false }) dlc: ConquestDlcOwned = NO_DLC;

  @state() private together = false;
  @state() private isPublic = true;
  @state() private settings: RoomSettings = {
    difficulty: "normal",
    start: 1650,
  };
  @state() private code = "";
  /** How to Play, open over the lobby (r11 wave 2). */
  @state() private guide = false;
  /** STORY (r17): what we're asking you to confirm: deleting a game, taking it off your list, or clearing the finished ones. */
  @state() private asking: {
    what: "delete" | "hide" | "clear";
    g?: SavedGame;
  } | null = null;
  /** STORY (r17): saved games on their way out (greyed until the server's list comes back). */
  @state() private going = new Set<string>();
  /** CQTUT (r26): the first life turned down just now. */
  @state() private declined = false;

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
    window.removeEventListener("keydown", this.onKey);
  }

  // STORY (r17): the server's list is the truth: whatever was going is gone (or back).
  protected willUpdate(changed: PropertyValues<this>): void {
    if ((changed.has("saved") || changed.has("finished")) && this.going.size)
      this.going = new Set();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("asking") && this.asking)
      this.querySelector<HTMLButtonElement>(".cq-ask .cq-ask-keep")?.focus();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.asking) this.asking = null;
  };

  private ask(what: "delete" | "hide" | "clear", g?: SavedGame): void {
    this.asking = { what, g };
    window.addEventListener("keydown", this.onKey);
  }

  private answer(yes: boolean): void {
    const a = this.asking;
    this.asking = null;
    window.removeEventListener("keydown", this.onKey);
    if (!yes || !a) return;
    if (a.what === "clear") {
      this.going = new Set([...this.going, ...this.finished.map((g) => g.id)]);
      this.net.send({ t: "clearsaves" });
      return;
    }
    if (!a.g) return;
    this.going = new Set([...this.going, a.g.id]);
    this.net.send({
      t: a.what === "delete" ? "delsave" : "hidesave",
      id: a.g.id,
    });
  }

  // ---------------------------------------------------------------- CQTUT (r26)

  /** The first life: who to be (the app asks). */
  private askFirstLife(): void {
    this.dispatchEvent(new CustomEvent("cq-tutorial-ask", { bubbles: true }));
  }

  /**
   * A first visit (nothing saved or finished, and it hasn't been taken or
   * turned down in this browser): the first life, offered.
   */
  private firstVisit(
    where: "top" | "in-start",
  ): TemplateResult | typeof nothing {
    if (this.declined || firstLifeSeen() !== "") return nothing;
    if (this.saved.length || this.finished.length) return nothing;
    return html`<div class="cq-firstlife ${where}" role="note">
      <p class="cq-firstlife-head">New to Derpy Conquest?</p>
      <p class="small">
        Take a short first life: a young cooper in Boston, 1700, learning the
        ropes with someone at your elbow. About fifteen minutes, and the life is
        yours to keep.
      </p>
      <div class="cq-btnrow">
        <button
          class="cq-btn primary small"
          ?disabled=${!this.online}
          @click=${() => this.askFirstLife()}
        >
          Take a short first life
        </button>
        <button
          class="cq-btn quiet small"
          @click=${() => {
            setFirstLifeSeen("no");
            this.declined = true;
          }}
        >
          No thanks
        </button>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- /CQTUT (r26)

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
        ${this.firstVisit("top") /* CQTUT (r26): first, on a phone */}
        <section class="cq-hero">
          <figure class="cq-hero-art">
            <img
              src=${deskMap}
              alt="Willem Blaeu's map of the Americas, with galleons on the Atlantic and Pacific"
              width="1600"
              height="1244"
            />
            <figcaption>
              <i>Americae nova Tabula</i>, Willem Blaeu, Amsterdam, 1617
            </figcaption>
          </figure>
          <div class="cq-hero-text">
            <h1 class="cq-title">Derpy Conquest</h1>
            <p class="cq-tagline">
              The Americas, 1607 to 1776. You are one life in them.
            </p>
            <p>
              A farmer in Virginia, a printer's devil in Boston, a fur trapper
              out of Quebec, a Powhatan hunter or a Spanish soldier in Havana.
              Work, marry, raise heirs, make friends and enemies; join a
              rebellion or start one, sit in the assembly, rise to colonel or
              governor, or sail home rich. The colonies and nations go on around
              you. Real time with pause, alone or with friends.
            </p>
            <p>
              <button class="cq-btn" @click=${() => (this.guide = true)}>
                How to play
              </button>
              <span class="cq-muted small"
                >The first hour, five example lives, and a chapter for every
                part of the game.</span
              >
            </p>
            ${
              /* CQTUT (r26): the first life, always to hand. */
              html`<p>
                <button class="cq-btn" @click=${() => this.askFirstLife()}>
                  First life (tutorial)
                </button>
                <span class="cq-muted small"
                  >A short guided life in Boston, 1700: about fifteen
                  minutes.</span
                >
              </p>`
            }
            ${this.online
              ? nothing
              : html`<p class="cq-warn">Connecting to the game server…</p>`}
          </div>
        </section>

        <div class="cq-lobby-grid">
          <section class="cq-sheet cq-new">
            <span class="cq-seal cq-sheet-seal" aria-hidden="true"></span>
            <h2 class="cq-h2">Start a game</h2>
            ${this.firstVisit("in-start") /* CQTUT (r26) */}
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
                <b>Alone</b><span>One life in a living world</span>
              </button>
              <button
                role="radio"
                aria-checked=${this.together}
                @click=${() => (this.together = true)}
              >
                <b>With friends</b><span>Several lives, the same world</span>
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
            ${settingsFields(
              this.settings,
              (s) => (this.settings = s),
              true,
              this.dlc,
            )}
            <button
              class="cq-btn primary big"
              ?disabled=${!this.online}
              @click=${() => this.create()}
            >
              ${this.together ? "Open a game room" : "Make your character"}
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
            ${this.watchPart() /* SITE (r19) */}
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
            ${this.account ? this.finishedPart() : nothing}
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
      ${this.guide
        ? guideOverlay("start", () => (this.guide = false))
        : nothing}
      ${this.asking ? this.askDialog() : nothing}
    </div>`;
  }

  private roomRow(r: OpenRoom): TemplateResult {
    const made = r.players.filter((p) => p.origin);
    return html`<li class="cq-room-row">
      <div class="cq-room-flags">
        ${made.length
          ? made.map((p) => originFlag(p.origin!))
          : html`<span class="cq-muted small">nobody made yet</span>`}
      </div>
      <div class="cq-room-info">
        <b>${r.host}'s game</b>
        <span class="cq-muted small">
          ${r.players.length} player${r.players.length === 1 ? "" : "s"}, from
          ${r.settings.start ?? 1607}, ${r.settings.difficulty}
          ${r.started
            ? html`<span class="cq-chip">Living, ${r.year}</span>`
            : html`<span class="cq-chip good">Making characters</span>`}
          ${r.locked /* FRIENDS (r25) */
            ? html`<span
                class="cq-chip cq-pw-chip"
                title="Joining asks for its password"
                >${padlock()} Password</span
              >`
            : nothing}
        </span>
      </div>
      <div class="cq-open-acts">
        ${r.watchId /* SITE (r19): a game begun can be watched too */
          ? html`<button
              class="cq-btn quiet small"
              title="Watch it without joining: no character, no say"
              @click=${() => this.net.watch(r.watchId!)}
            >
              Watch
            </button>`
          : nothing}
        <button
          class="cq-btn small"
          @click=${() => this.net.send({ t: "join", code: r.code })}
        >
          ${r.started ? "Drop in" : "Join"}
        </button>
      </div>
    </li>`;
  }

  /**
   * SITE (r19): games being played that anyone may watch, but not join: a
   * private game (or someone's solo one) whose host lets people watch.
   */
  private watchPart(): TemplateResult | typeof nothing {
    const rooms = this.live.filter((r) => !r.open);
    if (!rooms.length) return nothing;
    return html`<h3 class="cq-h3 cq-watch-head">Games you can watch</h3>
      <ul class="cq-rooms">
        ${rooms.map((r) => {
          const made = r.players.filter((p) => p.origin);
          return html`<li class="cq-room-row">
            <div class="cq-room-flags">
              ${made.map((p) => originFlag(p.origin!))}
            </div>
            <div class="cq-room-info">
              <b>${r.title}</b>
              <span class="cq-muted small">
                ${r.date}. ${r.players.map((p) => p.name).join(", ")}
                ${r.solo ? "alone" : ""}${r.watchers
                  ? `; ${r.watchers} watching`
                  : ""}
              </span>
            </div>
            <button
              class="cq-btn small"
              ?disabled=${r.full}
              title=${r.full ? "As many are watching as may" : "Watch it"}
              @click=${() => this.net.watch(r.watchId)}
            >
              ${r.full ? "Full" : "Watch"}
            </button>
          </li>`;
        })}
      </ul>`;
  }

  private savedRow(g: SavedGame): TemplateResult {
    const going = this.going.has(g.id);
    const ended = g.over === true || g.old === true;
    return html`<li class="cq-room-row cq-save-row ${going ? "going" : ""}">
      <div class="cq-room-flags">
        ${g.power ? originFlag(g.power) : nothing}
      </div>
      <div class="cq-room-info">
        <b>${g.title}</b>
        <span class="cq-muted small"
          >${PEOPLE_NAME[g.power] ?? ""}${g.over
            ? `, ended in ${g.year}.`
            : g.old
              ? `, ${g.year}: saved by an older version, and can't be loaded.`
              : `, now ${g.year}.`}</span
        >
        <span class="cq-muted small"
          >${g.players.length > 1 ? `With ${g.players.join(", ")}. ` : ""}Saved
          ${ago(g.savedAt)}.</span
        >
      </div>
      <div class="cq-save-acts">
        ${ended
          ? nothing
          : html`<button
              class="cq-btn small ${g.live ? "" : "primary"}"
              ?disabled=${going}
              @click=${() => this.net.send({ t: "resume", id: g.id })}
            >
              ${g.live ? "Rejoin" : "Resume"}
            </button>`}
        <button
          class="cq-link small cq-save-forget"
          ?disabled=${going}
          title=${g.mine
            ? "Delete this saved game for good"
            : `It's ${g.by ?? "another player"}'s game: take it off your own list`}
          @click=${() => this.ask(g.mine ? "delete" : "hide", g)}
        >
          ${going ? "Going…" : g.mine ? "Delete…" : "Remove from my list"}
        </button>
      </div>
    </li>`;
  }

  /** STORY (r17): finished games, and those saved by an older version: to look back on, or clear away. */
  private finishedPart(): TemplateResult {
    const list = this.finished;
    if (!list.length) return html``;
    return html`<details class="cq-finished" ?open=${this.saved.length === 0}>
      <summary>
        Finished and old games <span class="cq-chip">${list.length}</span>
      </summary>
      <ul class="cq-rooms">
        ${list.map((g) => this.savedRow(g))}
      </ul>
      <div class="cq-btnrow">
        <button
          class="cq-btn small danger"
          ?disabled=${list.every((g) => this.going.has(g.id))}
          @click=${() => this.ask("clear")}
        >
          Delete all finished games
        </button>
      </div>
    </details>`;
  }

  /** STORY (r17): "Delete A Virginia life? This can't be undone." */
  private askDialog(): TemplateResult {
    const a = this.asking!;
    const g = a.g;
    let head: TemplateResult;
    let body: string;
    let yes: string;
    if (a.what === "clear") {
      const mine = this.finished.filter((x) => x.mine).length;
      const theirs = this.finished.length - mine;
      head = html`Delete all finished games?`;
      body = `${mine ? `${mine} game${mine === 1 ? "" : "s"} you began will be deleted` : "Nothing of yours will be deleted"}${theirs ? `; ${theirs} you only joined will be taken off your list` : ""}. Results already counted stay on the leaderboards. This can't be undone.`;
      yes = mine ? "Delete them" : "Take them off my list";
    } else if (a.what === "hide") {
      head = html`Take <i>${g!.title}</i> off your list?`;
      body = `It stays saved for ${g!.by ?? "whoever began it"} and the others who played in it. It comes back to your list if you play in it again.`;
      yes = "Take it off my list";
    } else {
      const others = g!.players.filter((p) => p !== this.account);
      head = html`Delete <i>${g!.title}</i>?`;
      body = `This can't be undone.${others.length ? ` It's gone for ${others.join(" and ")} too.` : ""}${g!.over ? " Its results stay on the leaderboards." : ""}${g!.live ? " It's open now with nobody in it: it will be closed." : ""}`;
      yes = "Delete it";
    }
    return html`<div
      class="cq-ask-back"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.answer(false);
      }}
    >
      <div
        class="cq-ask cq-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cq-ask-head"
        aria-describedby="cq-ask-body"
      >
        <h2 class="cq-h2" id="cq-ask-head">${head}</h2>
        <p id="cq-ask-body">${body}</p>
        <div class="cq-btnrow end">
          <button class="cq-btn cq-ask-keep" @click=${() => this.answer(false)}>
            ${a.what === "clear"
              ? "Keep them"
              : a.what === "hide"
                ? "Keep it on my list"
                : "Keep it"}
          </button>
          <button class="cq-btn danger" @click=${() => this.answer(true)}>
            ${yes}
          </button>
        </div>
      </div>
    </div>`;
  }
}

const START_TITLE: Record<StartYear, string> = {
  1607: "The first colonies",
  1650: "Colonies taking root",
  1700: "Empires at the brink",
  1776: "The Revolution", // DLC (r21)
};

export function startSummary(start: StartYear): string {
  return start === 1607 ? START_SUMMARY_1607 : (STARTS[start]?.summary ?? "");
}

/** The start date and difficulty, shared by the lobby and the room. */
export function settingsFields(
  s: RoomSettings,
  set: (s: RoomSettings) => void,
  editable: boolean,
  dlc: ConquestDlcOwned = NO_DLC, // DLC (r21)
): TemplateResult {
  const start = s.start ?? 1607;
  // DLC (r21): a start that's a store item shows locked to a host who
  // doesn't own it (the server refuses it anyway); anyone can join one.
  const locked = (y: StartYear) =>
    STARTS[y]?.dlc === "campaign_1776" && !dlc.campaign1776;
  const end = endYearOf(start, END_YEAR);
  return html`<div class="cq-settings">
    <div class="cq-field">
      <span class="cq-field-label" id="cq-start-label">Begin in</span>
      <div class="cq-starts" role="radiogroup" aria-labelledby="cq-start-label">
        ${START_YEARS.map(
          (y) =>
            html`<button
              role="radio"
              class=${editable && locked(y) && y !== start
                ? "cq-start-locked"
                : ""}
              aria-checked=${y === start}
              ?disabled=${(!editable || locked(y)) && y !== start}
              title=${editable && locked(y)
                ? "1776: The Revolution is in the Derp Store. Its owner can host a game that begins in 1776; anyone can join one."
                : ""}
              @click=${() => editable && y !== start && set({ ...s, start: y })}
            >
              <b>${y}</b><span>${START_TITLE[y]}</span>
              ${editable && locked(y)
                ? html`<em class="cq-start-lock">In the Derp Store</em>`
                : nothing}
            </button>`,
        )}
      </div>
      <p class="cq-muted small cq-start-summary">${startSummary(start)}</p>
      ${editable && START_YEARS.some(locked)
        ? html`<p class="cq-muted small cq-dlc-note">
            1776, the Revolution, is a campaign in the
            <a href=${STORE_CAMPAIGNS}>Derp Store</a>. Its owner can host it,
            and anyone can join their game.
          </p>`
        : nothing}
      <p class="cq-muted small">
        ${end === END_YEAR
          ? `The world runs until 1 January ${END_YEAR}: ${END_YEAR - start} years, several lifetimes.`
          : // CQ24 (r24): to the end of 1800
            `The campaign runs to the end of ${lastYearOf(start, END_YEAR)}: the war, the peace and the republic's first years, ${end - start} years. Then the story ends.`}
      </p>
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
    <!-- CQACH (r22): the two kinds of achievement, and Hard's part in them. -->
    <p class="cq-muted small cq-settings-note cq-ach-lobby">
      ${countsOverall(s.difficulty)
        ? html`<b>On Hard, achievements count twice:</b> each pays Derp Coins in
            this game, and goes onto your account's overall achievements.`
        : html`<b>Achievements:</b> each pays Derp Coins in this game on any
            difficulty; your account's overall achievements are earned only on
            Hard.`}
    </p>
  </div>`;
}

declare global {
  interface HTMLElementTagNameMap {
    "cq-lobby": Lobby;
  }
}

/** FRIENDS (r25): a small padlock, for a game with a password. */
function padlock(): TemplateResult {
  return html`<svg
    class="cq-pw-lock"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>`;
}
