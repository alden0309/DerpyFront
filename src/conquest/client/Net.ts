// The connection to the Derpy Conquest server: one WebSocket that comes back
// by itself when the network blips, rejoining the game you were in.

import { derpyToken } from "../../derpland/Account";
import type { Command } from "../engine/Types";
import { ClientMessage, CONQUEST_WS_PATH, ServerMessage } from "../Protocol";

const REJOIN_KEY = "derpy_conquest_rejoin";

export interface RejoinTicket {
  code: string;
  secret: string;
  at: number;
}

export function savedRejoin(): RejoinTicket | null {
  try {
    const t = JSON.parse(
      localStorage.getItem(REJOIN_KEY) ?? "null",
    ) as RejoinTicket | null;
    // Rooms close half an hour after everyone leaves.
    if (t && Date.now() - t.at < 6 * 60 * 60_000) return t;
  } catch {
    // ignore
  }
  return null;
}

export function saveRejoin(code: string, secret: string): void {
  try {
    localStorage.setItem(
      REJOIN_KEY,
      JSON.stringify({ code, secret, at: Date.now() }),
    );
  } catch {
    // ignore
  }
}

export function clearRejoin(): void {
  try {
    localStorage.removeItem(REJOIN_KEY);
  } catch {
    // ignore
  }
}

type Listener = (m: ServerMessage) => void;

export class Net {
  private ws: WebSocket | null = null;
  private listeners: Listener[] = [];
  private nextId = 1;
  private pending = new Map<number, (err: string | null) => void>();
  private queue: ClientMessage[] = [];
  private retry = 0;
  private closed = false;
  /** Sent first on every (re)connect. */
  name = "Explorer";
  /** The room to rejoin after a reconnect. */
  ticket: { code: string; secret: string } | null = null;
  onStatus: (online: boolean) => void = () => {};

  connect(): void {
    this.closed = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}${CONQUEST_WS_PATH}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
      this.raw({
        t: "hello",
        name: this.name,
        token: derpyToken() ?? undefined,
      });
      if (this.ticket) this.raw({ t: "rejoin", ...this.ticket });
      for (const m of this.queue.splice(0)) this.raw(m);
    };
    ws.onmessage = (e) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (m.t === "ack") {
        this.pending.get(m.id)?.(m.err);
        this.pending.delete(m.id);
      }
      if (m.t === "lobby" || m.t === "game") {
        this.ticket = { code: m.code, secret: m.secret };
        saveRejoin(m.code, m.secret);
      }
      for (const l of this.listeners) l(m);
    };
    ws.onclose = () => {
      this.ws = null;
      this.onStatus(false);
      for (const done of this.pending.values())
        done("Lost connection to the server.");
      this.pending.clear();
      if (this.closed) return;
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  on(l: Listener): void {
    this.listeners.push(l);
  }

  private raw(m: ClientMessage): void {
    this.ws?.send(JSON.stringify(m));
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.raw(m);
    else this.queue.push(m);
  }

  /** Sends a game command; resolves with why it failed, or null. */
  command(c: Command): Promise<string | null> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ t: "cmd", id, c });
    });
  }

  /** Re-says hello, e.g. after signing in, so the server knows. */
  hello(): void {
    this.send({
      t: "hello",
      name: this.name,
      token: derpyToken() ?? undefined,
    });
    if (this.ticket) this.send({ t: "rejoin", ...this.ticket });
  }
}
