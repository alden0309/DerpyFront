// Derpy Conquest in the browser: the lobby, the room before a game, and the
// game itself, all over one connection to the server.

import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DERPY_ACCOUNT_EVENT, derpyUsername } from "../../derpland/Account";
import { CONQUEST_NEWS, news } from "../../derpland/News"; // NEWS (r25)
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
      this.net.send({ t: "join", code: this.joinCode });
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

  // NEWS (r25): Derp Land's What's New card may show on the start screen
  // only: never in a room, once a game has started, or watching one.
  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("screen"))
      news.setPlace(this.screen === "lobby" ? CONQUEST_NEWS : null);
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
        return;
      case "game":
        this.game = m;
        this.lobby = null;
        this.screen = "game";
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
    return html`${body}
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
