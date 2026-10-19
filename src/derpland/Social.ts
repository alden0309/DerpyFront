// FRIENDS (r25): this page's side of who's online, friends, invites and
// parties. One per page, whatever shows it (the top bar, the home page's
// list, your account page): it tells the server where this page is every
// 15 seconds (30 while the page is hidden) and keeps what comes back, and
// says so on window (SOCIAL_EVENT) for whatever draws it.
//
// The page says where it is with setWhere(); until it does, where comes
// from its address (Mr. Based's pages are only ever "around Derp Land").

import { DERPY_API, SIGNING_OUT_EVENT } from "../client/derpy/DerpySession";
import { api, ApiError, DERPY_ACCOUNT_EVENT, derpyToken } from "./Account";
import type {
  ClientWhere,
  PartyView,
  SocialError,
  SocialState,
} from "./SocialTypes";

/** Fired on window when what the social side knows changes. */
export const SOCIAL_EVENT = "derp-social";
export { SIGNING_OUT_EVENT };

export const BEAT_MS = 15_000;
export const HIDDEN_BEAT_MS = 30_000;

/** Where a page is, from its bar and its address, until it says. */
export function defaultWhere(page: string, path: string): ClientWhere {
  // Mr. Based is never named to anyone.
  if (/^\/based(\/|$)/.test(path)) return { k: "around" };
  if (page === "derpyfront") return { k: "df-menu" };
  if (page === "conquest") return { k: "cq-front" };
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return { k: "home" };
  if (p === "/store" || p === "/inventory") return { k: "store" };
  return { k: "around" };
}

function newTab(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  } catch {
    return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

const SEEN_KEY = "derp_social_seen";
const NOT_NOW_KEY = "derp_social_not_now";

function readKeys(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeKeys(key: string, keys: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(keys.slice(-200)));
  } catch {
    // private window: remembered for this page only
  }
}

/** Something to tell the player about, in the bell (and once as a toast). */
export type Notice =
  | {
      key: string;
      kind: "invite";
      id: number;
      from: string;
      game: "derpyfront" | "conquest";
      href: string;
    }
  | {
      key: string;
      kind: "party";
      partyId: number;
      from: string;
      count: number;
      max: number;
    }
  | {
      key: string;
      kind: "pull";
      leader: string;
      game: "derpyfront" | "conquest";
      href: string;
    }
  | { key: string; kind: "request"; id: number; from: string };

export class SocialClient {
  state: SocialState | null = null;
  /** The last beat didn't get through (the state shown may be old). */
  failed = false;
  readonly tab = newTab();

  private base: ClientWhere = { k: "around" };
  private said: ClientWhere | null = null;
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private soon: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private again = false;
  private seen = new Set(readKeys(SEEN_KEY));
  private notNow = new Set(readKeys(NOT_NOW_KEY));

  /** Begin (once per page), where the page is until it says otherwise. */
  start(where: ClientWhere): void {
    if (this.started) return;
    this.started = true;
    this.base = where;
    window.addEventListener(DERPY_ACCOUNT_EVENT, this.onAccount);
    window.addEventListener(SIGNING_OUT_EVENT, this.onSigningOut);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    document.addEventListener("visibilitychange", this.onVisible);
    void this.beat();
  }

  /** Where this page is now (null: back to what its address says). */
  setWhere(where: ClientWhere | null): void {
    if (JSON.stringify(where) === JSON.stringify(this.said)) return;
    this.said = where;
    if (!this.started) return;
    // A few changes in a row (joining, the lobby's details) make one beat.
    if (this.soon) clearTimeout(this.soon);
    this.soon = setTimeout(() => {
      this.soon = null;
      void this.beat();
    }, 300);
  }

  where(): ClientWhere {
    return this.said ?? this.base;
  }

  /** Ask now, not at the next beat. */
  refresh(): void {
    void this.beat();
  }

  private onAccount = () => {
    if (!derpyToken()) {
      this.state = null;
      this.emit();
      return;
    }
    void this.beat();
  };

  private onSigningOut = () => this.leave();

  private onPageHide = () => this.leave();

  private onPageShow = (e: PageTransitionEvent) => {
    // Back from the browser's page cache: here again.
    if (e.persisted) void this.beat();
  };

  private onVisible = () => {
    if (!document.hidden) void this.beat();
    else this.schedule();
  };

  private emit(): void {
    window.dispatchEvent(new CustomEvent(SOCIAL_EVENT));
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!derpyToken()) return;
    this.timer = setTimeout(
      () => void this.beat(),
      document.hidden ? HIDDEN_BEAT_MS : BEAT_MS,
    );
  }

  private async beat(): Promise<void> {
    if (!derpyToken()) {
      if (this.state !== null) {
        this.state = null;
        this.emit();
      }
      return;
    }
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      this.state = await api<SocialState>("/social/beat", {
        method: "POST",
        body: JSON.stringify({ tab: this.tab, where: this.where() }),
      });
      this.failed = false;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) this.state = null;
      else this.failed = true;
    } finally {
      this.busy = false;
    }
    this.emit();
    this.schedule();
    if (this.again) {
      this.again = false;
      void this.beat();
    }
  }

  /** This page is going: off the list at once (the token rides in the body). */
  private leave(): void {
    const token = derpyToken();
    if (!token || !this.started) return;
    const body = JSON.stringify({ tab: this.tab, leaving: true, token });
    try {
      void fetch(`${DERPY_API}/social/beat`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    } catch {
      try {
        navigator.sendBeacon?.(
          `${DERPY_API}/social/beat`,
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        // gone within a minute anyway
      }
    }
  }

  /**
   * Do something (befriend, invite, party...). Resolves to null when it
   * worked (and the lists are up to date), else why not.
   */
  async act(path: string, body: object = {}): Promise<SocialError | null> {
    try {
      const r = await api<{ state: SocialState }>(`/social${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (r?.state) {
        this.state = r.state;
        this.emit();
      }
      return null;
    } catch (err) {
      return err instanceof ApiError
        ? (err.code as SocialError)
        : ("invalid" as const);
    }
  }

  // ---- what to tell the player

  /** The bell's list: invites, party invites, the leader's pull, friend requests. */
  notices(): Notice[] {
    const s = this.state;
    if (!s) return [];
    const out: Notice[] = [];
    const pull = pullOf(s.party);
    // The leader who asked you in already, to the same lobby: one notice.
    if (
      pull &&
      !this.notNow.has(pull.key) &&
      !s.invites.some((i) => i.href === pull.href)
    )
      out.push(pull);
    for (const i of s.invites)
      out.push({
        key: `inv:${i.id}`,
        kind: "invite",
        id: i.id,
        from: i.from,
        game: i.game,
        href: i.href,
      });
    for (const p of s.partyInvites)
      out.push({
        key: `party:${p.partyId}:${p.at}`,
        kind: "party",
        partyId: p.partyId,
        from: p.from,
        count: p.size,
        max: 8,
      });
    for (const r of s.requests.incoming)
      out.push({
        key: `req:${r.id}:${r.at}`,
        kind: "request",
        id: r.id,
        from: r.username,
      });
    return out;
  }

  /** Notices not shown as a toast yet (in this browser); marks them shown. */
  fresh(): Notice[] {
    const out = this.notices().filter((n) => !this.seen.has(n.key));
    if (out.length) {
      for (const n of out) this.seen.add(n.key);
      writeKeys(SEEN_KEY, [...this.seen]);
    }
    return out;
  }

  /** "Not now" to the leader's pull: it isn't asked again for that lobby. */
  notNowTo(key: string): void {
    this.notNow.add(key);
    writeKeys(NOT_NOW_KEY, [...this.notNow]);
    this.emit();
  }

  /** Go where a notice (or a Join) leads: an invite is used up on the way. */
  async go(href: string, inviteId?: number): Promise<void> {
    if (inviteId !== undefined)
      await Promise.race([
        this.act("/invite/close", { id: inviteId }),
        new Promise((r) => setTimeout(r, 600)),
      ]);
    // Leaving this page takes it off the list; the next one says where it is.
    window.location.assign(href);
  }
}

function pullOf(p: PartyView | null): Notice | null {
  if (!p?.pull) return null;
  return {
    key: `pull:${p.id}:${p.pull.key}`,
    kind: "pull",
    leader: p.pull.leader,
    game: p.pull.key.startsWith("conquest:") ? "conquest" : "derpyfront",
    href: p.pull.href,
  };
}

/** This page's. */
export const social = new SocialClient();
