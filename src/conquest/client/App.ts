// Derpy Conquest in the browser: the lobby, the room before a game, and the
// game itself, all over one connection to the server.

import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DERPY_ACCOUNT_EVENT, derpyUsername } from "../../derpland/Account";
import type { OpenRoom, SavedGame, ServerMessage } from "../Protocol";
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
}

@customElement("conquest-app")
export class ConquestApp extends LitElement {
  @state() private screen: Screen = "connecting";
  @state() private online = false;
  @state() private name = "";
  @state() private account: string | null = derpyUsername();
  @state() private open: OpenRoom[] = [];
  @state() private saved: SavedGame[] = [];
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
    this.net.name = this.name || "Governor";
    this.net.on(this.onMessage);
    this.net.onStatus = (online) => {
      this.online = online;
      if (online && this.screen === "connecting") this.screen = "lobby";
    };
    const params = new URLSearchParams(location.search);
    const join = params.get("join");
    const ticket = savedRejoin();
    if (join) this.joinCode = join.toUpperCase().slice(0, 4);
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

  private onAccount = (): void => {
    this.account = derpyUsername();
    if (this.account) this.name = this.account;
    this.net.name = this.name || "Governor";
    this.net.hello();
    this.net.send({ t: "list" });
  };

  private onMessage = (m: ServerMessage): void => {
    switch (m.t) {
      case "welcome":
        this.name = m.name;
        this.account = m.account;
        if (this.screen === "connecting") this.screen = "lobby";
        if (this.screen === "lobby") this.net.send({ t: "list" });
        return;
      case "rooms":
        this.open = m.open;
        this.saved = m.saved;
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

  private notice(text: string): void {
    const id = ++this.noticeId;
    this.notices = [...this.notices.slice(-2), { id, text }];
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
    this.net.name = name || "Governor";
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
          .account=${this.account}
          .name=${this.name}
          .online=${this.online}
          .joinCode=${this.joinCode}
          @cq-name=${(e: CustomEvent<string>) => this.setName(e.detail)}
        ></cq-lobby>`;
        break;
      case "room":
        body = html`<cq-room
          .net=${this.net}
          .lobby=${this.lobby!}
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
          (n) => html`<div class="cq-toast bad">${n.text}</div>`,
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
