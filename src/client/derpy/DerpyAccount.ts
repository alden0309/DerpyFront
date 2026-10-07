// The browser side of Derpy Front accounts: signing in and out, and the
// calls to the game server's /derpy/api (stats, leaderboard, store, saved
// games).

import { GameAwards } from "@openfront/engine-api/game/Awards";
import { replacer } from "@openfront/shared/SharedUtil";
import { PartialGameRecord } from "@openfront/shared/WireSchemas";
import { setLocalPersistentID } from "../Auth";
import {
  DERPY_ACCOUNT_EVENT,
  DERPY_API,
  derpyStorage,
  derpyToken,
  isDerpySignedIn,
  TOKEN_KEY,
  USER_KEY,
} from "./DerpySession";

export {
  DERPY_ACCOUNT_EVENT,
  DERPY_API,
  derpyToken,
  derpyUsername,
  isDerpySignedIn,
} from "./DerpySession";

export interface DerpyStats {
  games: number;
  wins: number;
  bestTerritoryPct: number;
  goldEarned: string;
  mostGoldInAGame: string;
  conquests: number;
  ships: number;
  betrayals: number;
  nukes: number;
  mvps: number;
  awards: number;
  coinsEarned: number;
}

export interface DerpyLeaderboardRow extends DerpyStats {
  username: string;
  coins: number;
}

export interface DerpyGameSummary {
  gameId: string;
  map: string;
  mode: string;
  gameType: string;
  endedAt: string;
  durationS: number;
  winner: string | null;
  numPlayers: number;
  playedAs: string;
  won: boolean;
  peakTerritoryPct: number;
  goldEarned: string;
  awards: string[];
  coins: number;
}

export interface DerpyProfile {
  username: string;
  coins: number;
  createdAt: string;
  stats: DerpyStats;
  games: DerpyGameSummary[];
}

export interface DerpySkin {
  name: string;
  displayName: string;
  url: string;
}

export interface DerpyPack {
  name: string;
  displayName: string;
  description: string;
  price: number;
  skins: DerpySkin[];
}

export interface DerpyMe {
  username: string;
  coins: number;
  owned: string[];
}

export type DerpyAuthError =
  | "invalid_username"
  | "invalid_password"
  | "username_taken"
  | "wrong_password"
  | "accounts_unavailable"
  | "server_error";

function announce(): void {
  window.dispatchEvent(new CustomEvent(DERPY_ACCOUNT_EVENT));
}

function authHeaders(): Record<string, string> {
  const token = derpyToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DERPY_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && derpyToken() !== null) {
    // The session is gone (signed out elsewhere): forget it here too.
    forgetSession();
  }
  if (!res.ok) {
    let error = "server_error";
    try {
      error = ((await res.json()) as { error?: string }).error ?? error;
    } catch {
      // not JSON
    }
    throw new DerpyApiError(error, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class DerpyApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

function startSession(s: {
  token: string;
  playId: string;
  account: { username: string };
}): void {
  const st = derpyStorage();
  st?.setItem(TOKEN_KEY, s.token);
  st?.setItem(USER_KEY, s.account.username);
  setLocalPersistentID(s.playId);
  announce();
}

function forgetSession(): void {
  const st = derpyStorage();
  st?.removeItem(TOKEN_KEY);
  st?.removeItem(USER_KEY);
  setLocalPersistentID(null);
  announce();
}

async function authenticate(
  path: "/login" | "/register",
  username: string,
  password: string,
): Promise<DerpyAuthError | null> {
  try {
    const session = await api<{
      token: string;
      playId: string;
      account: { username: string };
    }>(path, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    startSession(session);
    return null;
  } catch (err) {
    if (err instanceof DerpyApiError) {
      return err.code as DerpyAuthError;
    }
    return "server_error";
  }
}

export function derpySignIn(username: string, password: string) {
  return authenticate("/login", username, password);
}

export function derpyCreateAccount(username: string, password: string) {
  return authenticate("/register", username, password);
}

export async function derpySignOut(): Promise<void> {
  try {
    await api("/logout", { method: "POST" });
  } catch {
    // Signed out locally either way.
  }
  forgetSession();
}

export async function derpyMe(): Promise<DerpyMe | null> {
  if (!isDerpySignedIn()) return null;
  try {
    const me = await api<{
      account: { username: string; coins: number };
      owned: string[];
    }>("/me");
    return { ...me.account, owned: me.owned };
  } catch {
    return null;
  }
}

export function derpyLeaderboard(): Promise<{
  players: DerpyLeaderboardRow[];
}> {
  return api("/leaderboard");
}

export function derpyProfile(username: string): Promise<DerpyProfile> {
  return api(`/players/${encodeURIComponent(username)}`);
}

export function derpyStore(): Promise<{ packs: DerpyPack[] }> {
  return api("/store");
}

export async function derpyBuyPack(
  pack: string,
): Promise<{ coins: number; owned: string[] }> {
  const result = await api<{ coins: number; owned: string[] }>("/store/buy", {
    method: "POST",
    body: JSON.stringify({ pack }),
  });
  announce();
  return result;
}

/**
 * Saves a finished singleplayer game to the signed-in account (there's no
 * game server to do it). Returns the Derp Coins it paid, or null when it
 * couldn't be saved.
 */
export async function derpySaveSingleplayerGame(
  record: PartialGameRecord,
  awards: GameAwards,
  keepalive: boolean,
): Promise<number | null> {
  if (!isDerpySignedIn()) return null;
  try {
    const json = JSON.stringify({ record, awards }, replacer);
    if (keepalive) {
      // The page is going away. A beacon is the one request browsers promise
      // to finish after unload; it can't carry headers, so the session token
      // rides in the body. It doesn't wait for an answer, so the coins it
      // paid aren't known here.
      const beacon = JSON.stringify(
        { record, awards, token: derpyToken() },
        replacer,
      );
      if (
        beacon.length < 60_000 &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(
          `${DERPY_API}/games/singleplayer`,
          new Blob([beacon], { type: "application/json" }),
        )
      ) {
        return 0;
      }
    }
    let request: Promise<{ coins: number }>;
    if (keepalive && json.length < 60_000) {
      // The page is going away: send it in this same tick (no awaiting a
      // compressor first) with keepalive, which caps the body at 64 KiB.
      request = api("/games/singleplayer", {
        method: "POST",
        body: json,
        keepalive: true,
      });
    } else {
      const body = await gzip(json);
      request = api("/games/singleplayer", {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
        },
        keepalive: false,
      });
    }
    const res = await request;
    announce();
    return res.coins;
  } catch (err) {
    console.warn("Failed to save the game to your Derpy Front account", err);
    return null;
  }
}

async function gzip(data: string): Promise<ArrayBuffer> {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  void writer.write(new TextEncoder().encode(data));
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

/** Where a saved game's replay opens. */
export function replayHref(gameId: string): string {
  return `/game/${encodeURIComponent(gameId)}`;
}
