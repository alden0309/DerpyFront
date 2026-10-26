/**
 * DFX (r26): a watch-together room's page (/watch/<room>). Main puts it in
 * place of the menu, as it does the replay viewer. It joins the room, then
 * plays the room's game in the replay viewer with the room's clock, and the
 * watch panel over it. If the room closes under it, the replay plays on as
 * an ordinary replay.
 */

import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { derpyToken } from "../../derpland/Account";
import { social } from "../../derpland/Social";
import { hostKeyFor, rememberHostKey } from "../../derpland/Watch";
import type {
  WatchErrorCode,
  WatchGame,
  WatchServerMessage,
} from "../../derpland/WatchTypes";
import "../components/baseComponents/Button";
import { homeHref, translateText } from "../Utils";
import { exitButton } from "./ReplayControls";
import "./ReplayViewer";
import type { ReplayViewer } from "./ReplayViewer";
import { WatchConnection, type WatchConnectionState } from "./WatchConnection";
import "./WatchPanel";
import type { WatchPanel } from "./WatchPanel";
import { takeHostKeyFromHash } from "./WatchRoute";
import { WatchSync } from "./WatchSync";

/** The name a guest goes by: the one DerpyFront's menu remembers. */
function guestName(): string | undefined {
  try {
    const n = localStorage.getItem("username");
    return n && n.trim() !== "" ? n.trim().slice(0, 20) : undefined;
  } catch {
    return undefined;
  }
}

@customElement("watch-room")
export class WatchRoom extends LitElement {
  @property() room = "";

  @state() private status: "joining" | "ready" | "closed" = "joining";
  @state() private connection: WatchConnectionState = "connecting";
  @state() private closedBecause: WatchErrorCode | "unreachable" | null = null;
  /** The room closed after we were in it: the replay plays on alone. */
  @state() private alone = false;
  @state() private game: WatchGame | null = null;

  private conn: WatchConnection | null = null;
  private sync: WatchSync | null = null;
  private key: string | undefined;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    // A "Watch together" link carries the host key; keep it and take it
    // off the address, so a copied link doesn't make its reader the host.
    const fromHash = takeHostKeyFromHash(window.location.hash);
    if (fromHash !== null) {
      rememberHostKey(this.room, fromHash);
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    this.key = fromHash ?? hostKeyFor(this.room);
    const conn = new WatchConnection(() => ({
      room: this.room,
      ...(this.key ? { key: this.key } : {}),
      ...(derpyToken() ? { token: derpyToken()! } : {}),
      ...(guestName() ? { name: guestName() } : {}),
    }));
    const sync = new WatchSync((msg) => conn.send(msg));
    sync.onChange = () => this.refresh();
    sync.onReact = (from, e) => this.panel()?.float(from, e);
    conn.onMessage = (msg) => this.receive(msg);
    conn.onState = (s) => {
      this.connection = s;
      if (s === "closed") this.closed(conn.closedBecause);
      this.refresh();
    };
    this.conn = conn;
    this.sync = sync;
    conn.start();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.conn?.stop();
    this.sync?.detach();
  }

  private receive(msg: WatchServerMessage): void {
    if (msg.t === "welcome") {
      this.game = msg.room.game;
      this.status = "ready";
      // Friends see where we are, and can be invited (or follow the party).
      social.setWhere({
        k: "df-replay",
        room: this.room,
        map: msg.room.game.map.slice(0, 60),
      });
    }
    this.sync?.receive(msg);
  }

  private closed(why: WatchErrorCode | "unreachable" | null): void {
    this.closedBecause = why;
    if (this.status === "ready") {
      // The replay plays on, as an ordinary replay.
      this.alone = true;
      this.sync?.detach();
      const viewer = this.viewer();
      if (viewer) viewer.together = null;
      social.setWhere({ k: "df-menu" });
    } else {
      this.status = "closed";
    }
  }

  private viewer(): ReplayViewer | null {
    return this.querySelector("replay-viewer");
  }

  private panel(): WatchPanel | null {
    return this.querySelector("watch-panel");
  }

  private refresh(): void {
    this.requestUpdate();
    this.viewer()?.requestUpdate();
    this.panel()?.requestUpdate();
  }

  render() {
    if (this.status === "ready" && this.game !== null) {
      return html`<replay-viewer
          .gameID=${this.game.id}
          .together=${this.alone ? null : this.sync}
        ></replay-viewer>
        <watch-panel
          .sync=${this.sync}
          .room=${this.room}
          .game=${this.game}
          .connection=${this.connection}
          .alone=${this.alone}
        ></watch-panel>`;
    }
    return html`<div
      class="fixed inset-0 z-[9000] flex items-center justify-center bg-black p-4 text-white"
    >
      <div
        class="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/70 p-6 text-center shadow-2xl backdrop-blur-xl"
      >
        ${this.status === "joining"
          ? html`<div
                class="flex size-14 items-center justify-center rounded-full border border-malibu-blue/40 bg-malibu-blue/10"
              >
                <div
                  class="size-7 animate-spin rounded-full border-[3px] border-white/20 border-t-white"
                ></div>
              </div>
              <h2 class="text-lg font-bold">
                ${translateText("watch_together.joining")}
              </h2>`
          : this.renderClosed()}
      </div>
      <div
        class="absolute bottom-0 right-0 rounded-tl-lg bg-gray-800/92 p-2 backdrop-blur-sm"
      >
        ${exitButton()}
      </div>
    </div>`;
  }

  private renderClosed() {
    const key =
      this.closedBecause === "room_full"
        ? "watch_together.closed_room_full"
        : this.closedBecause === "unreachable"
          ? "watch_together.closed_unreachable"
          : "watch_together.closed_no_such_room";
    return html`<div
        class="flex size-14 items-center justify-center rounded-full border border-white/20 bg-white/5 text-2xl"
        aria-hidden="true"
      >
        ⏏
      </div>
      <p role="alert" class="text-sm font-medium text-white/85">
        ${translateText(key)}
      </p>
      <div class="flex w-full flex-col gap-2">
        <o-button
          width="block"
          size="sm"
          variant="secondary"
          translationKey="watch_together.go_home"
          @click=${() => (window.location.href = homeHref())}
        ></o-button>
      </div>`;
  }
}
