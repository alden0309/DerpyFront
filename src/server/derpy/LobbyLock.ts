// FRIENDS (r25): a password a host may give a DerpyFront lobby or a Derpy
// Conquest room. Every lobby is open to anyone on Derp Land; a host who
// wants it closed gives it a password.
//
// - The password lives only here, on the server, as a salted hash. It never
//   goes into the game config, the lobby info, who's online or any other
//   message to a client: those carry only whether there is one (`locked`).
// - It's checked where the join really happens: the game server's join
//   (GameServer.joinClient, which asks lobbyLock.admits) and the Conquest
//   room's (ConquestRooms.join).
// - An invite or a party leader's "come along" carries a pass instead: a
//   short token the master signs for one account and one lobby, good for
//   INVITE_PASS_MS. It lets that account in without typing anything. The
//   master and the game workers share the secret (DERPY_PASS_SECRET, made
//   by the master at startup and handed to the workers it forks).
// - Guesses are limited (mayGuess): per address and lobby, and per lobby.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** At most `limit` takes per key in any `windowMs`. */
export class Limiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (x) => t - x < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    // Keep the map from growing with keys nobody uses any more.
    if (this.hits.size > 5000)
      for (const [k, v] of this.hits)
        if (v.every((x) => t - x >= this.windowMs)) this.hits.delete(k);
    return true;
  }

  clear(): void {
    this.hits.clear();
  }
}

export const PASSWORD_MAX = 40;
/** A pass from an invite or a party's leader is good this long. */
export const INVITE_PASS_MS = 30 * 60_000;
/** Password guesses, per address and lobby. */
export const GUESSES = new Limiter(8, 60_000);
/** And per lobby from anywhere (an address is easy to change). */
export const LOBBY_GUESSES = new Limiter(30, 60_000);

/** Whether someone at `ip` may guess lobby `lobby`'s password now (counts the guess). */
export function mayGuess(ip: string, lobby: string): boolean {
  return GUESSES.take(`${ip}|${lobby}`) && LOBBY_GUESSES.take(lobby);
}

/** A password as a host may give it: 1 to 40 characters, trimmed. */
export function cleanPassword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const pw = raw.trim();
  return pw.length >= 1 && pw.length <= PASSWORD_MAX ? pw : null;
}

function digest(salt: Buffer, pw: string): Buffer {
  return createHash("sha256").update(salt).update(pw, "utf8").digest();
}

/** One lobby's password (or none), and who has already given it. */
export class LobbyLock {
  private salt: Buffer | null = null;
  private hash: Buffer | null = null;
  private readonly admitted = new Set<string>();

  get locked(): boolean {
    return this.hash !== null;
  }

  /** The host gives the lobby a password, or takes it away (null). */
  set(password: string | null): void {
    if (password === null) {
      this.salt = this.hash = null;
      return;
    }
    this.salt = randomBytes(16);
    this.hash = digest(this.salt, password);
  }

  /** Whether `password` is this lobby's. */
  check(password: string): boolean {
    if (!this.salt || !this.hash) return true;
    return timingSafeEqual(digest(this.salt, password), this.hash);
  }

  /** This player gave the password (or came by a pass): let them in. */
  admit(who: string): void {
    this.admitted.add(who);
  }

  /** Whether this player may come in: there's no password, or they gave it. */
  admits(who: string): boolean {
    return !this.locked || this.admitted.has(who);
  }

  /** What may be shown of it to anyone: only whether there is one. */
  toJSON(): { locked: boolean } {
    return { locked: this.locked };
  }
}

// ------------------------------------------------- which lobbies have one

// DerpyFront's lobbies live on the game workers; each reports which of its
// lobbies have a password (MasterLobbyService), and who's online asks here.
let frontLocks: () => ReadonlySet<string> = () => new Set();

/** Where the master's list of DerpyFront lobbies with a password comes from. */
export function setFrontLocks(source: () => ReadonlySet<string>): void {
  frontLocks = source;
}

/** Whether DerpyFront lobby `id` has a password. */
export function frontLocked(id: string): boolean {
  return frontLocks().has(id);
}

// ---------------------------------------------------------------- passes

let fallbackSecret: string | null = null;

function secret(): string {
  const s = process.env.DERPY_PASS_SECRET;
  if (s) return s;
  fallbackSecret ??= randomBytes(32).toString("hex");
  return fallbackSecret;
}

/** The master, before it forks its workers: one secret for all of them. */
export function ensurePassSecret(): void {
  process.env.DERPY_PASS_SECRET ??= randomBytes(32).toString("hex");
}

type Game = "derpyfront" | "conquest";

function sign(game: Game, id: string, account: number, exp: number): string {
  return createHmac("sha256", secret())
    .update(`${game}|${id}|${account}|${exp}`)
    .digest("base64url")
    .slice(0, 27);
}

/** A pass for `account` into lobby or room `id` (an invite's, a pull's). */
export function mintPass(
  game: Game,
  id: string,
  account: number,
  now = Date.now(),
): string {
  // Rounded up to five minutes, so a link stays the same from one look at
  // who's online to the next (it's good for 30 to 35 minutes).
  const exp = Math.ceil((now + INVITE_PASS_MS) / 300_000) * 300;
  return `${account.toString(36)}.${exp.toString(36)}.${sign(game, id, account, exp)}`;
}

/** The account a pass into `id` is for, or null: not one of ours, another lobby's, or old. */
export function readPass(
  pass: unknown,
  game: Game,
  id: string,
  now = Date.now(),
): number | null {
  if (typeof pass !== "string" || pass.length > 80) return null;
  const [a, e, sig] = pass.split(".");
  if (!a || !e || !sig) return null;
  const account = parseInt(a, 36);
  const exp = parseInt(e, 36);
  if (!Number.isSafeInteger(account) || !Number.isSafeInteger(exp)) return null;
  if (exp * 1000 < now) return null;
  const want = Buffer.from(sign(game, id, account, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return account;
}
