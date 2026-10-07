// Derpy Front accounts: username + password, scrypt-hashed. Signing in
// creates a session: a random bearer token (only its hash is stored) and a
// play ID, a fresh UUID the browser uses as its player ID in games while
// signed in. Finished games are credited to whichever account's session
// owns the player ID that played them.

import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { db, inTransaction } from "./DerpyDb";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(
    password,
    Buffer.from(saltB64, "base64"),
    expected.length,
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface Account {
  id: number;
  username: string;
  coins: number;
}

export interface Session {
  token: string;
  playId: string;
  account: Account;
}

export type AuthError =
  | "invalid_username"
  | "invalid_password"
  | "username_taken"
  | "wrong_password";

function rowToAccount(row: {
  id: string | number;
  username: string;
  coins: number;
}): Account {
  return { id: Number(row.id), username: row.username, coins: row.coins };
}

async function createSession(accountId: number): Promise<{
  token: string;
  playId: string;
}> {
  const token = randomBytes(32).toString("base64url");
  const playId = randomUUID();
  await (
    await db()
  ).query(
    "INSERT INTO derpy_sessions (token_hash, account_id, play_id) VALUES ($1, $2, $3)",
    [hashToken(token), accountId, playId],
  );
  return { token, playId };
}

export async function register(
  username: string,
  password: string,
): Promise<Session | AuthError> {
  if (!USERNAME_RE.test(username)) return "invalid_username";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return "invalid_password";
  }
  const passwordHash = await hashPassword(password);
  const row = await inTransaction(async (c) => {
    const res = await c.query(
      `INSERT INTO derpy_accounts (username, username_key, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (username_key) DO NOTHING
       RETURNING id, username, coins`,
      [username, username.toLowerCase(), passwordHash],
    );
    return res.rows[0] ?? null;
  });
  if (row === null) return "username_taken";
  const account = rowToAccount(row);
  return { ...(await createSession(account.id)), account };
}

export async function login(
  username: string,
  password: string,
): Promise<Session | AuthError> {
  const res = await (
    await db()
  ).query(
    "SELECT id, username, coins, password_hash FROM derpy_accounts WHERE username_key = $1",
    [username.toLowerCase()],
  );
  const row = res.rows[0];
  // Hash anyway when there's no such account, so the response time doesn't
  // say which usernames exist.
  const ok = row
    ? await verifyPassword(password, row.password_hash)
    : (await hashPassword(password), false);
  if (!row || !ok) return "wrong_password";
  const account = rowToAccount(row);
  return { ...(await createSession(account.id)), account };
}

/** The account a bearer token belongs to, or null. */
export async function accountForToken(token: string): Promise<{
  account: Account;
  playId: string;
} | null> {
  if (!token) return null;
  const res = await (
    await db()
  ).query(
    `UPDATE derpy_sessions s SET last_seen = now()
     FROM derpy_accounts a
     WHERE s.token_hash = $1 AND a.id = s.account_id
     RETURNING a.id, a.username, a.coins, s.play_id`,
    [hashToken(token)],
  );
  const row = res.rows[0];
  return row ? { account: rowToAccount(row), playId: row.play_id } : null;
}

export async function logout(token: string): Promise<void> {
  await (
    await db()
  ).query("DELETE FROM derpy_sessions WHERE token_hash = $1", [
    hashToken(token),
  ]);
}

/** Account IDs for the given in-game player IDs (session play IDs). */
export async function accountsForPlayIds(
  playIds: string[],
): Promise<Map<string, number>> {
  const ids = playIds.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  );
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const res = await (
    await db()
  ).query(
    "SELECT play_id, account_id FROM derpy_sessions WHERE play_id = ANY($1::uuid[])",
    [ids],
  );
  for (const row of res.rows) {
    out.set(String(row.play_id).toLowerCase(), Number(row.account_id));
  }
  return out;
}

/** Store items (e.g. "skin:florida_gator") an account owns. */
export async function ownedItems(accountId: number): Promise<string[]> {
  const res = await (
    await db()
  ).query("SELECT item FROM derpy_owned WHERE account_id = $1 ORDER BY item", [
    accountId,
  ]);
  return res.rows.map((r) => r.item as string);
}

/** Store items owned by whoever is playing under `playId`, for join checks. */
export async function ownedItemsForPlayId(playId: string): Promise<string[]> {
  const accounts = await accountsForPlayIds([playId]);
  const accountId = accounts.get(playId.toLowerCase());
  return accountId === undefined ? [] : ownedItems(accountId);
}
