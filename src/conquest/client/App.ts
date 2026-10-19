// Derpy Conquest in the browser: the lobby, the room before a game, and the
// game itself, all over one connection to the server.

import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DERPY_ACCOUNT_EVENT, derpyUsername } from "../../derpland/Account";
import { type ConquestDlcOwned, NO_DLC } from "../DlcIds"; // DLC (r21)
import type { LiveRoom, OpenRoom, SavedGame, ServerMessage } from "../Protocol";
import { setDlcOwned } from "./Dlc"; // DLC (r21)
import "./GameView";
import { GameStart, loadGeo } from "./GameView";
import "./Lobby";
import { clearRejoin, Net, savedRejoin } from "./Net";
import "./Room";
import { LobbyState } from "./Room";

const NAME_KEY = "derpy_conquest_name";

type Screen = "connecting" | "lobby" | "room" | "game";

interface Notice {
  id: number;
  text: string;
  /** STORY (r17): good news (a save deleted), else a refusal. */
  tone?: "good" | "bad";
}

@customElement("conquest-app")
export class ConquestApp extends LitElement {
  @state() private screen: Screen = "connecting";
  @state() private online = false;
  @state() private name = "";
  @state() private account: string | null = derpyUsername();
  /** DLC (r21): what the account owns of Conquest's store items. */
  @state() private dlc: ConquestDlcOwned = NO_DLC;
  @state() private open: OpenRoom[] = [];
  @state() private saved: SavedGame[] = [];
  /** STORY (r17): finished games, and those saved by an older version. */
  @state() private finished: SavedGame[] = [];
  /** SITE (r19): games being played now that anyone may watch. */
  @state() private live: LiveRoom[] = [];
  @state() private lobby: LobbyState | null = null;
  @state() private game: GameStart | null = null;
  @state() private joinCode = "";
  @state() private notices: Notice[] = [];
  /** FRIENDS (r25): a room with a password, asking for it. */
  @state() private asked: {
    code: string;
    why: "required" | "wrong" | "too_many";
  } | null = null;
  @state() private typed = "";

  private net = new Net();
  private noticeId = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    let saved = "";
    try {
      saved = localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      // ignore
    }
    this.name = this.account ?? saved;
    this.net.name = this.name || "Traveller";
    this.net.on(this.onMessage);
    this.net.onStatus = (online) => {
      this.online = online;
      // SITE (r19): come to watch, the game itself comes next.
      if (online && this.screen === "connecting" && !this.net.watchId)
        this.screen = "lobby";
    };
    const params = new URLSearchParams(location.search);
    const join = params.get("join");
    // FRIENDS (r25): an invite's link carries a pass past a room's password.
    const pass = params.get("pass");
    // SITE (r19): a Watch button on Derp Land (or the lobby) comes here with ?watch=.
    const watch = params.get("watch");
    const ticket = savedRejoin();
    if (watch && /^[A-Za-z0-9_-]{1,40}$/.test(watch)) {
      this.net.watchId = watch;
      history.replaceState(null, "", location.pathname);
    } else if (join) this.joinCode = join.toUpperCase().slice(0, 4);
    else if (ticket)
      this.net.ticket = { code: ticket.code, secret: ticket.secret };
    this.net.connect();
    if (join) {
      this.net.send({
        t: "join",
        code: this.joinCode,
        ...(pass ? { pass: pass.slice(0, 80) } : {}),
      });
      history.replaceState(null, "", location.pathname);
    }
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    // Start fetching the map's shapes while people pick nations.
    void loadGeo();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    this.net.close();
  }

  protected updated(changed: Map<string, unknown>): void {
    // FRIENDS (r25): the password box takes the keys as it opens.
    if (changed.has("asked") && this.asked && !changed.get("asked"))
      this.querySelector<HTMLInputElement>(".cq-pw-ask input")?.focus();
  }

  private onAccount = (): void => {
    this.account = derpyUsername();
    if (this.account) this.name = this.account;
    this.net.name = this.name || "Traveller";
    this.net.hello();
    this.net.send({ t: "list" });
  };

  private onMessage = (m: ServerMessage): void => {
    switch (m.t) {
      case "welcome":
        this.name = m.name;
        this.account = m.account;
        this.dlc = m.dlc ?? NO_DLC; // DLC (r21)
        setDlcOwned(this.dlc);
        if (this.screen === "connecting" && !this.net.watchId)
          this.screen = "lobby";
        if (this.screen === "lobby") this.net.send({ t: "list" });
        return;
      case "rooms":
        this.open = m.open;
        this.saved = m.saved;
        this.finished = m.finished ?? []; // STORY (r17)
        this.live = m.live ?? []; // SITE (r19)
        return;
      // SITE (r19): watching's over (the game closed, the host shut watchers
      // out, or it couldn't begin): say why, and back to the lobby.
      case "watchend":
        this.notice(m.why);
        if (this.screen === "game" || this.screen === "connecting")
          this.toLobby();
        return;
      case "forgot": // STORY (r17): saved games deleted or taken off your list
        this.notice(m.text, "good");
        return;
      case "lobby":
        this.lobby = m;
        this.game = null;
        this.screen = "room";
        this.asked = null; // FRIENDS (r25): in
        return;
      case "game":
        this.game = m;
        this.lobby = null;
        this.screen = "game";
        this.asked = null;
        return;
      // FRIENDS (r25): that room has a password: ask for it (again).
      case "needpass":
        if (this.asked?.code !== m.code) this.typed = "";
        this.asked = { code: m.code, why: m.why };
        return;
      case "err":
        this.notice(m.msg);
        if (/ended or closed|somewhere else/.test(m.msg)) {
          clearRejoin();
          this.net.ticket = null;
          if (this.screen !== "game") this.toLobby();
        }
        return;
    }
  };

  /** FRIENDS (r25): "This game has a password": type it, Join or Never mind. */
  private passwordDialog(): TemplateResult {
    const a = this.asked!;
    const close = () => {
      this.asked = null;
      if (this.screen === "connecting") this.screen = "lobby";
    };
    const say =
      a.why === "wrong"
        ? "That isn't the password."
        : a.why === "too_many"
          ? "Too many tries. Wait a minute, then try again."
          : "Its host gave it a password. Type it in to join.";
    return html`<div
      class="cq-ask-back"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) close();
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      }}
    >
      <form
        class="cq-ask cq-sheet cq-pw-ask"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cq-pw-head"
        @submit=${(e: Event) => {
          e.preventDefault();
          const password = this.typed.trim();
          if (password) this.net.send({ t: "join", code: a.code, password });
        }}
      >
        <h2 class="cq-h2" id="cq-pw-head">
          Game <span class="cq-code">${a.code}</span> has a password
        </h2>
        <p class=${a.why === "required" ? "" : "cq-pw-wrong"} role="alert">
          ${say}
        </p>
        <label class="cq-field">
          <span>Password</span>
          <input
            type="password"
            autocomplete="off"
            maxlength="40"
            .value=${this.typed}
            @input=${(e: Event) =>
              (this.typed = (e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="cq-btnrow end">
          <button type="button" class="cq-btn" @click=${close}>
            Never mind
          </button>
          <button
            type="submit"
            class="cq-btn primary"
            ?disabled=${!this.typed.trim()}
          >
            Join
          </button>
        </div>
      </form>
    </div>`;
  }

  private notice(text: string, tone: "good" | "bad" = "bad"): void {
    const id = ++this.noticeId;
    this.notices = [...this.notices.slice(-2), { id, text, tone }];
    setTimeout(
      () => (this.notices = this.notices.filter((n) => n.id !== id)),
      6000,
    );
  }

  private toLobby(): void {
    this.screen = "lobby";
    this.lobby = null;
    this.game = null;
    this.net.send({ t: "list" });
  }

  private setName(v: string): void {
    const name = v.trim().slice(0, 24);
    this.name = name;
    this.net.name = name || "Traveller";
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // ignore
    }
    this.net.hello();
  }

  render(): TemplateResult {
    let body: TemplateResult;
    switch (this.screen) {
      case "connecting":
        body = html`<div class="cq-lobby">
          <derp-bar page="conquest"></derp-bar>
          <p class="cq-connecting">Crossing the Atlantic…</p>
        </div>`;
        break;
      case "lobby":
        body = html`<cq-lobby
          .net=${this.net}
          .open=${this.open}
          .saved=${this.saved}
          .finished=${this.finished}
          .live=${this.live}
          .account=${this.account}
          .name=${this.name}
          .online=${this.online}
          .joinCode=${this.joinCode}
          .dlc=${this.dlc}
          @cq-name=${(e: CustomEvent<string>) => this.setName(e.detail)}
        ></cq-lobby>`;
        break;
      case "room":
        body = html`<cq-room
          .net=${this.net}
          .lobby=${this.lobby!}
          .dlc=${this.dlc}
          @cq-leave=${() => this.toLobby()}
        ></cq-room>`;
        break;
      case "game":
        body = html`<cq-game
          .net=${this.net}
          .start=${this.game!}
          .signedIn=${this.account !== null}
          @cq-leave=${() => this.toLobby()}
        ></cq-game>`;
        break;
    }
    return html`${body} ${this.asked ? this.passwordDialog() : ""}
      <div class="cq-notices" aria-live="assertive">
        ${this.notices.map(
          (n) => html`<div class="cq-toast ${n.tone ?? "bad"}">${n.text}</div>`,
        )}
      </div>
      ${!this.online && this.screen !== "connecting"
        ? html`<div class="cq-offline">Reconnecting to the server…</div>`
        : ""}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "conquest-app": ConquestApp;
  }
}
