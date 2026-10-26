/**
 * DFX (r26): a watch-together room's socket. Joins the room (with this
 * browser's host key and Derp Land session, if it has them), hands the
 * server's messages on, and joins again after a dropped connection, while
 * the room is there.
 */

import { CloseCode } from "@openfront/shared/CloseCodes";
import {
  WATCH_WS_PATH,
  type WatchClientMessage,
  type WatchErrorCode,
  type WatchServerMessage,
} from "../../derpland/WatchTypes";

export type WatchConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  /** The room is gone (or never was), or it's full: nothing more to try. */
  | "closed";

export interface WatchJoin {
  room: string;
  key?: string;
  token?: string;
  name?: string;
}

/** Waits between tries to get back in (ms). */
const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

export class WatchConnection {
  onMessage: ((msg: WatchServerMessage) => void) | null = null;
  onState: ((state: WatchConnectionState) => void) | null = null;
  state: WatchConnectionState = "connecting";
  /** Why it closed for good. */
  closedBecause: WatchErrorCode | "unreachable" | null = null;

  private ws: WebSocket | null = null;
  private tries = 0;
  private welcomed = false;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly join: () => WatchJoin,
    private readonly url: string = defaultUrl(),
    private readonly makeSocket: (url: string) => WebSocket = (u) =>
      new WebSocket(u),
  ) {}

  start(): void {
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retry !== null) clearTimeout(this.retry);
    if (this.pinger !== null) clearInterval(this.pinger);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: WatchClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.welcomed)
      this.ws.send(JSON.stringify(msg));
  }

  private setState(s: WatchConnectionState): void {
    this.state = s;
    this.onState?.(s);
  }

  private open(): void {
    if (this.stopped) return;
    this.welcomed = false;
    let ws: WebSocket;
    try {
      ws = this.makeSocket(this.url);
    } catch {
      this.again();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "join", ...this.join() }));
    };
    ws.onmessage = (e) => {
      let msg: WatchServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as WatchServerMessage;
      } catch {
        return;
      }
      if (msg.t === "welcome") {
        this.welcomed = true;
        this.tries = 0;
        this.setState("open");
        if (this.pinger !== null) clearInterval(this.pinger);
        // Keeps the server's idea of the time fresh, and the socket alive.
        this.pinger = setInterval(() => this.send({ t: "ping" }), 20_000);
      } else if (
        msg.t === "error" &&
        !this.welcomed &&
        (msg.code === "no_such_room" || msg.code === "room_full")
      ) {
        this.finish(msg.code);
        return;
      }
      this.onMessage?.(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pinger !== null) clearInterval(this.pinger);
      this.pinger = null;
      if (this.stopped || this.state === "closed") return;
      // The server said the room isn't there.
      if (e.code === CloseCode.GameNotFound) {
        this.finish("no_such_room");
        return;
      }
      this.again();
    };
    ws.onerror = () => {
      // onclose follows
    };
  }

  private again(): void {
    if (this.stopped) return;
    if (this.tries >= RETRY_MS.length) {
      this.finish("unreachable");
      return;
    }
    this.setState(
      this.welcomed || this.tries > 0 ? "reconnecting" : "connecting",
    );
    const wait = RETRY_MS[this.tries++];
    this.retry = setTimeout(() => this.open(), wait);
  }

  private finish(why: WatchErrorCode | "unreachable"): void {
    this.closedBecause = why;
    this.setState("closed");
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }
}

function defaultUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${WATCH_WS_PATH}`;
}
