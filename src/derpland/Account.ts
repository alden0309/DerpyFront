// Derp Land accounts, for the pages outside DerpyFront (the hub and Derpy
// Conquest). One account works across the whole site: signing in here signs
// you in to DerpyFront too, because both keep the session in the same
// browser storage.

import {
  DERPY_ACCOUNT_EVENT,
  DERPY_API,
  derpyStorage,
  derpyToken,
  derpyUsername,
  SIGNING_OUT_EVENT,
  TOKEN_KEY,
  USER_KEY,
} from "../client/derpy/DerpySession";
import type { RenameError } from "./Names";

export { DERPY_ACCOUNT_EVENT, derpyToken, derpyUsername };

/** DerpyFront plays signed-in games under this ID (see Auth.ts). */
const PLAY_ID_KEY = "derpy_play_id";

export type AuthError =
  | "invalid_username"
  | "invalid_password"
  | "username_taken"
  | "wrong_password"
  | "suspended" // ADMIN (r26)
  | "accounts_unavailable"
  | "server_error";

export const AUTH_ERROR_TEXT: Record<AuthError, string> = {
  invalid_username: "Usernames are 3 to 20 letters, numbers or underscores.",
  invalid_password: "Passwords need at least 6 characters.",
  username_taken: "That username is taken.",
  wrong_password: "Wrong username or password.",
  suspended: "This account is suspended.", // ADMIN (r26)
  accounts_unavailable: "Accounts aren't available right now.",
  server_error: "Something went wrong. Try again.",
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** NAMES (r20): a change of name refused as too soon: when it may be. */
    readonly nextChangeAt?: string,
  ) {
    super(code);
  }
}

function announce(): void {
  window.dispatchEvent(new CustomEvent(DERPY_ACCOUNT_EVENT));
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = derpyToken();
  const res = await fetch(`${DERPY_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && token !== null) forget();
  if (!res.ok) {
    let code = "server_error";
    let next: string | undefined;
    try {
      const body = (await res.json()) as {
        error?: string;
        nextChangeAt?: string;
      };
      code = body.error ?? code;
      next = body.nextChangeAt;
    } catch {
      // not JSON
    }
    throw new ApiError(code, res.status, next);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function remember(s: {
  token: string;
  playId: string;
  account: { username: string };
}): void {
  const st = derpyStorage();
  st?.setItem(TOKEN_KEY, s.token);
  st?.setItem(USER_KEY, s.account.username);
  st?.setItem(PLAY_ID_KEY, s.playId);
  announce();
}

function forget(): void {
  const st = derpyStorage();
  st?.removeItem(TOKEN_KEY);
  st?.removeItem(USER_KEY);
  st?.removeItem(PLAY_ID_KEY);
  announce();
}

async function authenticate(
  path: "/login" | "/register",
  username: string,
  password: string,
): Promise<AuthError | null> {
  try {
    remember(
      await api(path, {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      }),
    );
    return null;
  } catch (err) {
    return err instanceof ApiError ? (err.code as AuthError) : "server_error";
  }
}

export const signIn = (u: string, p: string) => authenticate("/login", u, p);
export const createAccount = (u: string, p: string) =>
  authenticate("/register", u, p);

export async function signOut(): Promise<void> {
  // FRIENDS (r25): off who's online at once, while the session still works.
  window.dispatchEvent(new CustomEvent(SIGNING_OUT_EVENT));
  try {
    await api("/logout", { method: "POST" });
  } catch {
    // signed out here either way
  }
  forget();
}

// ---- ADMIN (r26): a one-time password reset link (made by the owner) ----

/** Whose a reset link is, or null when it's used, expired or never was. */
export async function resetLinkOwner(token: string): Promise<string | null> {
  try {
    const r = await api<{ username: string }>("/password/reset/check", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return r.username;
  } catch {
    return null;
  }
}

/**
 * Sets a new password with a reset link. Every session the account had
 * ends; this browser is signed in (unless the account is suspended).
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<
  | { ok: true; username: string; signedIn: boolean }
  | { ok: false; error: "link_gone" | "invalid_password" | "server_error" }
> {
  try {
    const r = await api<{
      signedIn: boolean;
      username?: string;
      token?: string;
      playId?: string;
      account?: { username: string };
    }>("/password/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    if (r.signedIn && r.token && r.playId && r.account) {
      remember({ token: r.token, playId: r.playId, account: r.account });
      return { ok: true, username: r.account.username, signedIn: true };
    }
    return { ok: true, username: r.username ?? "", signedIn: false };
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "server_error";
    return {
      ok: false,
      error:
        code === "link_gone" || code === "invalid_password"
          ? code
          : "server_error",
    };
  }
}

export interface Me {
  username: string;
  coins: number;
  /** Store items: "pack:<name>" and "skin:<name>". */
  owned: string[];
  /** PROFILE (r26): their picture (Pictures.ts; null: the monogram) and pinned badges. */
  picture?: string | null;
  pinned?: string[];
  /** PROFILE (r26): the owner, who looks after uploaded pictures. */
  moderator?: boolean;
}

export async function me(): Promise<Me | null> {
  if (derpyToken() === null) return null;
  try {
    const r = await api<{
      account: { username: string; coins: number };
      owned: string[];
      // PROFILE (r26)
      picture?: string | null;
      pinned?: string[];
      moderator?: boolean;
    }>("/me");
    keepUsername(r.account.username);
    return {
      ...r.account,
      owned: r.owned ?? [],
      // PROFILE (r26)
      picture: r.picture ?? null,
      pinned: r.pinned ?? [],
      ...(r.moderator ? { moderator: true } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * NAMES (r20): the name this browser keeps for the signed-in account, put
 * right when the account says otherwise (it was changed here, in another
 * tab, or on another device), and every page told.
 */
function keepUsername(username: string): void {
  const st = derpyStorage();
  if (derpyToken() === null || !st || st.getItem(USER_KEY) === username) return;
  st.setItem(USER_KEY, username);
  announce();
}

// ---- NAMES (r20): changing your username ----

/** Where the account stands on changing its name. */
export interface NameStatus {
  username: string;
  /** When it last changed (ISO), or null: never. */
  changedAt: string | null;
  /** When it may change next (ISO), or null: now. */
  nextChangeAt: string | null;
  canChange: boolean;
  /** The name given up last, while nobody else may take it. */
  heldName: string | null;
  heldUntil: string | null;
}

export interface NameCheck {
  username: string;
  ok: boolean;
  reason?: RenameError;
  caseOnly?: boolean;
}

export const RENAME_ERROR_TEXT: Record<RenameError, string> = {
  invalid_username: "Usernames are 3 to 20 letters, numbers or underscores.",
  username_taken: "That username is taken.",
  username_held:
    "Someone gave that name up in the last 7 days. It's kept for them until then.",
  username_reserved: "That name is reserved.",
  same_name: "That's your name already.",
  too_soon: "You've changed your username in the last 7 days.",
  accounts_unavailable: "Accounts aren't available right now.",
  server_error: "Something went wrong. Try again.",
};

function renameError(err: unknown): RenameError {
  return err instanceof ApiError && err.code in RENAME_ERROR_TEXT
    ? (err.code as RenameError)
    : "server_error";
}

export function nameStatus(): Promise<NameStatus> {
  return api<NameStatus>("/username");
}

/** The live check as a name is typed: may this account change to it? */
export async function checkName(
  username: string,
  signal?: AbortSignal,
): Promise<NameCheck> {
  return api<NameCheck>(
    `/username/check?name=${encodeURIComponent(username)}`,
    { signal },
  );
}

/**
 * Change the signed-in account's username. The session stays (it holds no
 * name); this browser keeps the new name and every page hears of it.
 */
export async function changeUsername(
  username: string,
): Promise<NameStatus | { error: RenameError; nextChangeAt?: string }> {
  try {
    const r = await api<NameStatus>("/username", {
      method: "POST",
      body: JSON.stringify({ username: username.trim() }),
    });
    if (derpyToken() !== null) derpyStorage()?.setItem(USER_KEY, r.username);
    announce();
    return r;
  } catch (err) {
    return { error: renameError(err), nextChangeAt: nextOf(err) };
  }
}

function nextOf(err: unknown): string | undefined {
  return err instanceof ApiError ? err.nextChangeAt : undefined;
}

export interface Skin {
  name: string;
  displayName: string;
  url: string;
  /** SITE (r22): how it moves on the map, if it does. */
  motion?: "drift" | "ripple" | "shimmer" | "twinkle";
}

export interface Pack {
  name: string;
  displayName: string;
  description: string;
  price: number;
  skins: Skin[];
}

export async function storePacks(): Promise<Pack[]> {
  return (await api<{ packs: Pack[] }>("/store")).packs;
}

/** Buy a pack; resolves to your coins and items afterwards. */
export async function buyPack(
  pack: string,
): Promise<{ coins: number; owned: string[] }> {
  return buyItem(pack);
}

// ---- DFSTORE (r21): every item, under tabs by game and category ----

export type StoreGame = "derpyfront" | "conquest";
export type StoreCategory =
  | "skins"
  | "personalities"
  | "effects"
  | "fanfares"
  // SITE (r22): Derpy Conquest's tabs (were campaigns, legends, mapstyles).
  | "startdates"
  | "mapstyles"
  | "addons";

export interface StoreTab {
  game: StoreGame;
  label: string;
  categories: { id: StoreCategory; label: string; blurb: string }[];
}

export interface StoreItem {
  name: string;
  game: StoreGame;
  category: StoreCategory;
  displayName: string;
  description: string;
  price: number;
  skins?: Skin[];
  /** AIP (r23): an AI personality: which one it lets you deal. */
  aiType?: string;
  fx?: {
    trail: string[];
    burst: string[];
    dome: string;
    accent: string;
    shimmer: string;
  };
  fanfare?: { instruments: string; seconds: number };
  /** DLC (r21): a Derpy Conquest item: what it adds, how to use it. */
  conquest?: {
    features: string[];
    howTo: string;
    palette?: { sea: string; land: string; ink: string; accent: string };
  };
}

export interface StoreCatalog {
  items: StoreItem[];
  tabs: StoreTab[];
}

export async function storeCatalog(): Promise<StoreCatalog> {
  const r = await api<{
    packs: Pack[];
    items?: StoreItem[];
    tabs?: StoreTab[];
  }>("/store");
  return { items: r.items ?? [], tabs: r.tabs ?? [] };
}

/** Buy anything in the store; resolves to your coins and items afterwards. */
export async function buyItem(
  item: string,
): Promise<{ coins: number; owned: string[] }> {
  const r = await api<{ coins: number; owned: string[] }>("/store/buy", {
    method: "POST",
    body: JSON.stringify({ item }),
  });
  announce();
  return r;
}

/**
 * The skin you wear in DerpyFront. DerpyFront reads the same browser
 * setting ("skin:<name>" under territoryPattern, see UserSettings).
 */
const PATTERN_KEY = "territoryPattern";

export function wornSkin(): string | null {
  const v = derpyStorage()?.getItem(PATTERN_KEY) ?? null;
  return v?.startsWith("skin:") ? v.slice(5) : null;
}

export function wearSkin(name: string | null): void {
  const st = derpyStorage();
  if (name !== null) st?.setItem(PATTERN_KEY, `skin:${name}`);
  else if (wornSkin() !== null) st?.removeItem(PATTERN_KEY);
}

export function formatCoins(n: number): string {
  return n.toLocaleString("en-US");
}
