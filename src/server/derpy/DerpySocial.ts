// FRIENDS (r25): friends, game invites and parties, served at
// /derpy/api/social. Who's online comes from the board in Presence.ts (in
// memory); friends, requests, parties and invites are kept in Postgres.
//
// Pages poll: each open page of a signed-in player posts a beat every 15
// seconds (30 while hidden) saying where it is, and gets back everything it
// shows (who's on and where, friends, requests, invites, the party). One
// small request, no socket to hold open per page, nothing to reconnect after
// the free plan's server sleeps or restarts, and a beat doubles as the
// heartbeat that keeps someone "online". What each account's rows say is
// kept here between beats (this process makes every change to them, and
// drops what it kept for whoever a change touches), and so is who a session
// belongs to (dropped at sign-out): a beat doesn't touch the database at
// all, so an open page doesn't keep the free database awake.

import express, { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type pg from "pg";
import { z } from "zod";
import type { Look } from "../../derpland/Pictures"; // PROFILE (r26)
import type {
  FriendGame,
  FriendRequestRow,
  InviteRow,
  PartyInviteRow,
  PartyView,
  PersonRow,
  SocialError,
  SocialState,
} from "../../derpland/SocialTypes";
import { type Account, accountForToken, hashToken } from "./DerpyAuth";
import { grantBadgesSoon } from "./DerpyBadges"; // PROFILE (r26)
import { db, DerpyDbUnavailable, inTransaction } from "./DerpyDb";
import { isDefaultLook, looksOf } from "./DerpyLooks"; // PROFILE (r26)
import { newsBeat } from "./DerpyNews"; // NEWS (r25)
import { liveGames } from "./LiveGames";
import { Limiter, mintPass } from "./LobbyLock"; // a password's pass
import {
  isAt,
  joinHref,
  placeOf,
  presence,
  readClientWhere,
  type Target,
  targetOf,
  watchHref,
} from "./Presence";
import { currentBanner } from "./SiteBanner"; // ADMIN (r26)

/** Most in a party, its leader included. */
export const PARTY_MAX = 8;
/** An invite (to a game or a party) is good for this long at most. */
export const INVITE_MAX_AGE_MS = 30 * 60_000;
/**
 * What's kept of an account's rows is read again after this long anyway
 * (every change made here drops it at once).
 */
export const SOCIAL_CACHE_MS = 30 * 60_000;
/** Who a session belongs to, kept for beats this long (sign-out drops it). */
export const SESSION_CACHE_MS = 30 * 60_000;

// ---------------------------------------------------------------- limits

// The limiter is LobbyLock's (it limits password guesses too).
export { Limiter };

/** Friend requests, game invites and party invites, per account. */
export const LIMITS = {
  /** Friend requests sent. */
  requests: new Limiter(10, 10 * 60_000),
  /** Game invites sent, all together. */
  invites: new Limiter(12, 60_000),
  /** Game or party invites to one person. */
  perPerson: new Limiter(1, 15_000),
  /** Party invites sent. */
  partyInvites: new Limiter(12, 60_000),
};

// ---------------------------------------------------------------- rows

interface Snapshot {
  at: number;
  friends: { id: number; username: string; since: string }[];
  incoming: FriendRequestRow[];
  outgoing: FriendRequestRow[];
  party: {
    id: number;
    leaderId: number;
    members: { id: number; username: string }[];
    invited: { id: number; username: string }[];
  } | null;
  partyInvites: PartyInviteRow[];
  invites: {
    id: number;
    fromId: number;
    from: string;
    game: "derpyfront" | "conquest" | "replay"; // DFX (r26): replay
    target: string;
    at: string;
  }[];
}

const cache = new Map<number, Snapshot>();

/** These accounts' rows changed: read them again next time. */
function forget(ids: Iterable<number>): void {
  for (const id of ids) cache.delete(id);
}

/** Every account's rows (a rename shows in everyone's lists). */
export function forgetAllSocial(): void {
  cache.clear();
}

const iso = (d: Date | string) => new Date(d).toISOString();
const cutoff = () => new Date(Date.now() - INVITE_MAX_AGE_MS);

async function readSnapshot(id: number): Promise<Snapshot> {
  const pool = await db();
  const since = cutoff();
  const [friends, requests, party, partyInvites, invites] = await Promise.all([
    pool.query(
      `SELECT a.id, a.username, f.since
       FROM derpy_friends f JOIN derpy_accounts a ON a.id = f.friend_id
       WHERE f.account_id = $1
       ORDER BY a.username_key`,
      [id],
    ),
    pool.query(
      `SELECT r.from_id, a.id, a.username, r.created_at
       FROM derpy_friend_requests r
       JOIN derpy_accounts a
         ON a.id = CASE WHEN r.from_id = $1 THEN r.to_id ELSE r.from_id END
       WHERE r.from_id = $1 OR r.to_id = $1
       ORDER BY r.created_at`,
      [id],
    ),
    pool.query(
      `SELECT p.id, p.leader_id,
         (SELECT json_agg(json_build_object('id', a.id, 'username', a.username)
                          ORDER BY m2.joined_at, a.id)
          FROM derpy_party_members m2 JOIN derpy_accounts a ON a.id = m2.account_id
          WHERE m2.party_id = p.id) AS members,
         (SELECT json_agg(json_build_object('id', a.id, 'username', a.username)
                          ORDER BY i.created_at)
          FROM derpy_party_invites i JOIN derpy_accounts a ON a.id = i.to_id
          WHERE i.party_id = p.id AND i.created_at > $2) AS invited
       FROM derpy_party_members m JOIN derpy_parties p ON p.id = m.party_id
       WHERE m.account_id = $1`,
      [id, since],
    ),
    pool.query(
      `SELECT i.party_id, i.from_id, f.username AS from_name,
         l.username AS leader, i.created_at,
         (SELECT count(*) FROM derpy_party_members m
          WHERE m.party_id = i.party_id)::int AS size
       FROM derpy_party_invites i
       JOIN derpy_parties p ON p.id = i.party_id
       JOIN derpy_accounts f ON f.id = i.from_id
       JOIN derpy_accounts l ON l.id = p.leader_id
       WHERE i.to_id = $1 AND i.created_at > $2
       ORDER BY i.created_at DESC`,
      [id, since],
    ),
    pool.query(
      `SELECT i.id, i.from_id, a.username, i.game, i.target, i.created_at
       FROM derpy_invites i JOIN derpy_accounts a ON a.id = i.from_id
       WHERE i.to_id = $1 AND NOT i.closed AND i.created_at > $2
       ORDER BY i.created_at DESC
       LIMIT 20`,
      [id, since],
    ),
  ]);
  const p = party.rows[0];
  const people = (v: unknown) =>
    ((v as { id: string | number; username: string }[] | null) ?? []).map(
      (x) => ({ id: Number(x.id), username: x.username }),
    );
  return {
    at: Date.now(),
    friends: friends.rows.map((r) => ({
      id: Number(r.id),
      username: r.username,
      since: iso(r.since),
    })),
    incoming: requests.rows
      .filter((r) => Number(r.from_id) !== id)
      .map((r) => ({
        id: Number(r.id),
        username: r.username,
        at: iso(r.created_at),
      })),
    outgoing: requests.rows
      .filter((r) => Number(r.from_id) === id)
      .map((r) => ({
        id: Number(r.id),
        username: r.username,
        at: iso(r.created_at),
      })),
    party: p
      ? {
          id: Number(p.id),
          leaderId: Number(p.leader_id),
          members: people(p.members),
          invited: people(p.invited),
        }
      : null,
    partyInvites: partyInvites.rows.map((r) => ({
      partyId: Number(r.party_id),
      fromId: Number(r.from_id),
      from: r.from_name,
      leader: r.leader,
      size: Number(r.size),
      at: iso(r.created_at),
    })),
    invites: invites.rows.map((r) => ({
      id: Number(r.id),
      fromId: Number(r.from_id),
      from: r.username,
      // DFX (r26): or a room watching a replay together.
      game:
        r.game === "conquest" || r.game === "replay" ? r.game : "derpyfront",
      target: r.target,
      at: iso(r.created_at),
    })),
  };
}

async function snapshotOf(id: number): Promise<Snapshot> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < SOCIAL_CACHE_MS) return hit;
  const fresh = await readSnapshot(id);
  cache.set(id, fresh);
  return fresh;
}

// ---------------------------------------------------------------- what a page is shown

const byName = (a: { username: string }, b: { username: string }) =>
  a.username.toLowerCase().localeCompare(b.username.toLowerCase());

/** The DerpyFront games that may be watched now (and aren't full of watchers). */
function watchableFront(): Set<string> {
  return new Set(
    liveGames()
      .derpyfront.filter((g) => !g.full)
      .map((g) => g.id),
  );
}

/** The pass an invite or a pull carries (DFX r26: a watch room needs none). */
function passFor(t: Target, account: number): string | undefined {
  return t.game === "replay" ? undefined : mintPass(t.game, t.id, account);
}

/** Everything a signed-in player's pages show of the people on the site. */
export async function socialState(me: Account): Promise<SocialState> {
  const s = await snapshotOf(me.id);
  const here = presence.snapshot();
  const watchable = watchableFront();
  const mine = here.get(me.id) ?? null;
  const myTarget = targetOf(mine);
  const friendIds = new Set(s.friends.map((f) => f.id));
  const partyIds = new Set(s.party?.members.map((m) => m.id) ?? []);
  const incoming = new Set(s.incoming.map((r) => r.id));
  const outgoing = new Set(s.outgoing.map((r) => r.id));

  // Invites still good: their sender is still in the lobby or at the table
  // they asked you to, it still has room, and you aren't there yet. One
  // appearing offline still sent it, so their own whereabouts count. Each
  // carries a pass, so a password doesn't stop the invited (nor the party's
  // pull, below).
  const invites: InviteRow[] = [];
  const invitedTargets: Target[] = [];
  const fresh = (at: string) => Date.now() - Date.parse(at) < INVITE_MAX_AGE_MS;
  for (const inv of s.invites) {
    if (!fresh(inv.at)) continue;
    const w = here.get(inv.fromId);
    const t = targetOf(w);
    if (!w || !t || t.game !== inv.game || t.id !== inv.target) continue;
    if (isAt(mine, t)) continue;
    if (invitedTargets.some((x) => x.game === t.game && x.id === t.id))
      continue;
    invitedTargets.push(t);
    invites.push({
      id: inv.id,
      fromId: inv.fromId,
      from: presence.username(inv.fromId) ?? inv.from,
      game: inv.game,
      place: placeOf(w),
      // A pass for you: a lobby with a password lets you in without it.
      href: joinHref(t, passFor(t, me.id)),
      at: inv.at,
    });
  }

  const row = (id: number, username: string, friend: boolean): PersonRow => {
    const w = presence.visible(here, id) ? here.get(id)! : null;
    const t = targetOf(w);
    // Every lobby is open to anyone on Derp Land (the owner's rule); one
    // its host gave a password asks for it when you get there.
    const mayJoin = t !== null && !isAt(mine, t);
    const watch = watchHref(w, watchable);
    return {
      id,
      username: presence.username(id) ?? username,
      friend,
      place: w ? placeOf(w) : null,
      ...(mayJoin ? { join: joinHref(t) } : {}),
      ...(watch ? { watch } : {}),
      ...(partyIds.has(id) ? { inParty: true } : {}),
      ...(incoming.has(id)
        ? { requested: "in" as const }
        : outgoing.has(id)
          ? { requested: "out" as const }
          : {}),
    };
  };

  const online: PersonRow[] = [];
  for (const id of here.keys()) {
    if (id === me.id || !presence.visible(here, id)) continue;
    online.push(row(id, presence.username(id)!, friendIds.has(id)));
  }
  online.sort((a, b) => Number(b.friend) - Number(a.friend) || byName(a, b));

  const friends = s.friends
    .map((f) => row(f.id, f.username, true))
    .sort((a, b) => Number(!!b.place) - Number(!!a.place) || byName(a, b));

  let party: PartyView | null = null;
  if (s.party) {
    const leaderId = s.party.leaderId;
    const leaderWhere = here.get(leaderId);
    const pullTo = leaderId !== me.id ? targetOf(leaderWhere) : null;
    const leaderName =
      presence.username(leaderId) ??
      s.party.members.find((m) => m.id === leaderId)?.username ??
      "";
    party = {
      id: s.party.id,
      leaderId,
      leading: leaderId === me.id,
      members: s.party.members.map((m) => {
        const w =
          m.id === me.id
            ? mine
            : presence.visible(here, m.id)
              ? here.get(m.id)!
              : null;
        return {
          id: m.id,
          username: presence.username(m.id) ?? m.username,
          leader: m.id === leaderId,
          place: w ? placeOf(w) : null,
        };
      }),
      invited: s.party.invited.map((x) => ({
        id: x.id,
        username: presence.username(x.id) ?? x.username,
      })),
      max: PARTY_MAX,
      // The leader went into a lobby or to a table: the members are asked
      // (once each) whether to follow. Nobody is moved without saying so.
      ...(pullTo && leaderWhere && !isAt(mine, pullTo)
        ? {
            pull: {
              key: `${pullTo.game}:${pullTo.id}`,
              href: joinHref(pullTo, passFor(pullTo, me.id)),
              leader: leaderName,
              place: placeOf(leaderWhere),
            },
          }
        : {}),
    };
  }

  // PROFILE (r26): everyone's picture and pins, from what's kept (read once
  // for someone new; a change made here is seen at the next beat).
  const ids = new Set<number>([me.id]);
  for (const r of [...online, ...friends]) ids.add(r.id);
  for (const r of [...s.incoming, ...s.outgoing]) ids.add(r.id);
  for (const m of s.party?.members ?? []) ids.add(m.id);
  for (const x of s.party?.invited ?? []) ids.add(x.id);
  for (const x of invites) ids.add(x.fromId);
  for (const x of s.partyInvites) ids.add(x.fromId);
  const looks: Record<string, Look> = {};
  for (const [id, look] of await looksOf(ids))
    if (!isDefaultLook(look)) looks[id] = look;

  return {
    serverTime: Date.now(),
    looks, // PROFILE (r26)
    me: {
      id: me.id,
      username: presence.username(me.id) ?? me.username,
      appearOffline: presence.hidden(me.id),
      place: mine ? placeOf(mine) : null,
      canInvite: myTarget !== null,
    },
    online,
    friends,
    requests: { incoming: s.incoming, outgoing: s.outgoing },
    invites,
    party,
    partyInvites: s.partyInvites
      .filter((x) => fresh(x.at))
      .map((x) => ({
        ...x,
        from: presence.username(x.fromId) ?? x.from,
      })),
  };
}

// ---------------------------------------------------------------- friends

type Outcome<T = object> = { ok: true } & T;
type Result<T = object> = Outcome<T> | { error: SocialError };

async function accountByName(
  c: pg.PoolClient | pg.Pool,
  username: string,
): Promise<{ id: number; username: string } | null> {
  const r = await c.query(
    "SELECT id, username FROM derpy_accounts WHERE username_key = $1",
    [username.trim().toLowerCase()],
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), username: row.username } : null;
}

async function accountExists(c: pg.PoolClient, id: number): Promise<boolean> {
  const r = await c.query("SELECT 1 FROM derpy_accounts WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

async function makeFriends(c: pg.PoolClient, a: number, b: number) {
  await c.query(
    `INSERT INTO derpy_friends (account_id, friend_id)
     VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
    [a, b],
  );
  await c.query(
    `DELETE FROM derpy_friend_requests
     WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)`,
    [a, b],
  );
}

async function areFriends(c: pg.PoolClient, a: number, b: number) {
  const r = await c.query(
    "SELECT 1 FROM derpy_friends WHERE account_id = $1 AND friend_id = $2",
    [a, b],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Ask someone (by username) to be friends; if they'd asked you, you're friends. */
export async function requestFriend(
  me: number,
  username: string,
): Promise<Result<{ status: "sent" | "accepted" }>> {
  const result = await inTransaction(async (c) => {
    const them = await accountByName(c, username);
    if (!them) return { error: "no_such_player" as const };
    if (them.id === me) return { error: "yourself" as const };
    if (await areFriends(c, me, them.id))
      return { error: "already_friends" as const };
    const theirs = await c.query(
      "SELECT 1 FROM derpy_friend_requests WHERE from_id = $1 AND to_id = $2",
      [them.id, me],
    );
    if ((theirs.rowCount ?? 0) > 0) {
      await makeFriends(c, me, them.id);
      return { ok: true as const, status: "accepted" as const, them: them.id };
    }
    if (!LIMITS.requests.take(String(me)))
      return { error: "rate_limited" as const };
    await c.query(
      `INSERT INTO derpy_friend_requests (from_id, to_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [me, them.id],
    );
    return { ok: true as const, status: "sent" as const, them: them.id };
  });
  if ("error" in result) return result;
  forget([me, result.them]);
  return { ok: true, status: result.status };
}

/** Say yes to a friend request. */
export async function acceptFriend(me: number, from: number): Promise<Result> {
  const r = await inTransaction(async (c) => {
    const had = await c.query(
      "DELETE FROM derpy_friend_requests WHERE from_id = $1 AND to_id = $2",
      [from, me],
    );
    if ((had.rowCount ?? 0) === 0) return false;
    await makeFriends(c, me, from);
    return true;
  });
  if (!r) return { error: "no_request" };
  forget([me, from]);
  return { ok: true };
}

/** Say no to a request (`from` asked you), or take yours back (you asked `to`). */
export async function dropRequest(from: number, to: number): Promise<Result> {
  const r = await (
    await db()
  ).query(
    "DELETE FROM derpy_friend_requests WHERE from_id = $1 AND to_id = $2",
    [from, to],
  );
  if ((r.rowCount ?? 0) === 0) return { error: "no_request" };
  forget([from, to]);
  return { ok: true };
}

export async function removeFriend(me: number, them: number): Promise<Result> {
  const r = await (
    await db()
  ).query(
    `DELETE FROM derpy_friends
     WHERE (account_id = $1 AND friend_id = $2)
        OR (account_id = $2 AND friend_id = $1)`,
    [me, them],
  );
  if ((r.rowCount ?? 0) === 0) return { error: "not_friends" };
  forget([me, them]);
  return { ok: true };
}

/** Appear offline (or not): nobody sees you on the site while you do. */
export async function setAppearOffline(
  me: number,
  hidden: boolean,
): Promise<void> {
  await (
    await db()
  ).query("UPDATE derpy_accounts SET appear_offline = $2 WHERE id = $1", [
    me,
    hidden,
  ]);
  presence.setHidden(me, hidden);
}

// ---------------------------------------------------------------- game invites

/** Invite someone into the DerpyFront lobby or Conquest table you're in. */
export async function inviteToGame(me: number, to: number): Promise<Result> {
  if (to === me) return { error: "yourself" };
  const here = presence.snapshot();
  const t = targetOf(here.get(me));
  if (!t) return { error: "not_in_a_game" };
  if (isAt(here.get(to), t)) return { error: "already_there" };
  const result = await inTransaction(async (c) => {
    if (!(await accountExists(c, to)))
      return { error: "no_such_player" as const };
    if (
      !LIMITS.perPerson.take(`g:${me}:${to}`) ||
      !LIMITS.invites.take(String(me))
    )
      return { error: "rate_limited" as const };
    // One invite from you to them at a time: the newest.
    await c.query(
      `UPDATE derpy_invites SET closed = true
       WHERE from_id = $1 AND to_id = $2 AND NOT closed`,
      [me, to],
    );
    await c.query(
      `INSERT INTO derpy_invites (from_id, to_id, game, target)
       VALUES ($1, $2, $3, $4)`,
      [me, to, t.game, t.id],
    );
    return { ok: true as const };
  });
  if ("error" in result) return result;
  forget([to]);
  void sweepInvites().catch(() => {});
  return { ok: true };
}

/** An invite used or waved off: it's gone from your list. */
export async function closeInvite(me: number, id: number): Promise<Result> {
  const r = await (
    await db()
  ).query(
    "UPDATE derpy_invites SET closed = true WHERE id = $1 AND to_id = $2 AND NOT closed",
    [id, me],
  );
  if ((r.rowCount ?? 0) === 0) return { error: "no_invite" };
  forget([me]);
  return { ok: true };
}

/** Invites older than any can be (and closed ones a while back) are cleared now and then. */
let lastSwept = 0;
async function sweepInvites(): Promise<void> {
  const now = Date.now();
  if (now - lastSwept < 10 * 60_000) return;
  lastSwept = now;
  const pool = await db();
  const old = new Date(now - 2 * INVITE_MAX_AGE_MS);
  await pool.query("DELETE FROM derpy_invites WHERE created_at < $1", [old]);
  await pool.query("DELETE FROM derpy_party_invites WHERE created_at < $1", [
    old,
  ]);
}

// ---------------------------------------------------------------- parties

async function partyOf(
  c: pg.PoolClient,
  me: number,
  lock = false,
): Promise<{ id: number; leaderId: number; members: number[] } | null> {
  const r = await c.query(
    `SELECT p.id, p.leader_id FROM derpy_party_members m
     JOIN derpy_parties p ON p.id = m.party_id
     WHERE m.account_id = $1${lock ? " FOR UPDATE OF p" : ""}`,
    [me],
  );
  const row = r.rows[0];
  if (!row) return null;
  return membersOf(c, Number(row.id), Number(row.leader_id));
}

async function membersOf(c: pg.PoolClient, id: number, leaderId: number) {
  const m = await c.query(
    `SELECT account_id FROM derpy_party_members WHERE party_id = $1
     ORDER BY joined_at, account_id`,
    [id],
  );
  return { id, leaderId, members: m.rows.map((x) => Number(x.account_id)) };
}

async function invitedTo(c: pg.PoolClient, party: number): Promise<number[]> {
  const r = await c.query(
    "SELECT to_id FROM derpy_party_invites WHERE party_id = $1",
    [party],
  );
  return r.rows.map((x) => Number(x.to_id));
}

/**
 * Take `me` out of their party (if any). A leader who goes hands it to the
 * member who's been in longest; the last one out ends it. Returns who to
 * tell.
 */
async function leaveIn(c: pg.PoolClient, me: number): Promise<number[]> {
  const p = await partyOf(c, me, true);
  if (!p) return [];
  const tell = [...p.members, ...(await invitedTo(c, p.id))];
  await c.query("DELETE FROM derpy_party_members WHERE account_id = $1", [me]);
  const rest = p.members.filter((x) => x !== me);
  if (rest.length === 0) {
    await c.query("DELETE FROM derpy_parties WHERE id = $1", [p.id]);
  } else if (p.leaderId === me) {
    await c.query("UPDATE derpy_parties SET leader_id = $2 WHERE id = $1", [
      p.id,
      rest[0],
    ]);
  }
  return tell;
}

export async function createParty(me: number): Promise<Result> {
  const r = await inTransaction(async (c) => {
    if (await partyOf(c, me)) return false;
    const made = await c.query(
      "INSERT INTO derpy_parties (leader_id) VALUES ($1) RETURNING id",
      [me],
    );
    await c.query(
      "INSERT INTO derpy_party_members (account_id, party_id) VALUES ($1, $2)",
      [me, made.rows[0].id],
    );
    return true;
  });
  if (!r) return { error: "in_a_party" };
  forget([me]);
  return { ok: true };
}

/** Ask a friend into your party (one is made for you if you're in none). */
export async function inviteToParty(me: number, to: number): Promise<Result> {
  if (to === me) return { error: "yourself" };
  const result = await inTransaction(async (c) => {
    if (!(await areFriends(c, me, to)))
      return { error: "not_friends" as const };
    // Before a party is made for you, so a refusal changes nothing.
    if (
      !LIMITS.perPerson.take(`p:${me}:${to}`) ||
      !LIMITS.partyInvites.take(String(me))
    )
      return { error: "rate_limited" as const };
    let p = await partyOf(c, me, true);
    if (!p) {
      const made = await c.query(
        "INSERT INTO derpy_parties (leader_id) VALUES ($1) RETURNING id",
        [me],
      );
      await c.query(
        "INSERT INTO derpy_party_members (account_id, party_id) VALUES ($1, $2)",
        [me, made.rows[0].id],
      );
      p = { id: Number(made.rows[0].id), leaderId: me, members: [me] };
    }
    if (p.leaderId !== me) return { error: "not_leader" as const };
    if (p.members.includes(to)) return { error: "already_there" as const };
    if (p.members.length >= PARTY_MAX) return { error: "party_full" as const };
    await c.query(
      `INSERT INTO derpy_party_invites (party_id, to_id, from_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (party_id, to_id)
       DO UPDATE SET created_at = now(), from_id = EXCLUDED.from_id`,
      [p.id, to, me],
    );
    return { ok: true as const, tell: [...p.members, to] };
  });
  if ("error" in result) return result;
  forget(result.tell);
  return { ok: true };
}

/** Join a party you were asked into (leaving any you're in). */
export async function acceptParty(me: number, party: number): Promise<Result> {
  const result = await inTransaction(async (c) => {
    const inv = await c.query(
      `SELECT 1 FROM derpy_party_invites
       WHERE party_id = $1 AND to_id = $2 AND created_at > $3`,
      [party, me, cutoff()],
    );
    if ((inv.rowCount ?? 0) === 0) return { error: "no_invite" as const };
    const locked = await c.query(
      "SELECT leader_id FROM derpy_parties WHERE id = $1 FOR UPDATE",
      [party],
    );
    if (locked.rowCount === 0) return { error: "no_invite" as const };
    const target = await membersOf(c, party, Number(locked.rows[0].leader_id));
    if (target.members.includes(me)) return { error: "already_there" as const };
    if (target.members.length >= PARTY_MAX)
      return { error: "party_full" as const };
    const told = await leaveIn(c, me);
    await c.query(
      "INSERT INTO derpy_party_members (account_id, party_id) VALUES ($1, $2)",
      [me, party],
    );
    await c.query(
      "DELETE FROM derpy_party_invites WHERE party_id = $1 AND to_id = $2",
      [party, me],
    );
    return {
      ok: true as const,
      tell: [...told, ...target.members, me],
      party: [...target.members, me], // PROFILE (r26)
    };
  });
  if ("error" in result) return result;
  forget(result.tell);
  grantBadgesSoon(result.party, ["dl-party"]); // PROFILE (r26): Party Up
  return { ok: true };
}

export async function declineParty(me: number, party: number): Promise<Result> {
  const result = await inTransaction(async (c) => {
    const r = await c.query(
      "DELETE FROM derpy_party_invites WHERE party_id = $1 AND to_id = $2 RETURNING from_id",
      [party, me],
    );
    if ((r.rowCount ?? 0) === 0) return null;
    const p = await c.query(
      "SELECT account_id FROM derpy_party_members WHERE party_id = $1",
      [party],
    );
    return [me, ...p.rows.map((x) => Number(x.account_id))];
  });
  if (!result) return { error: "no_invite" };
  forget(result);
  return { ok: true };
}

export async function leaveParty(me: number): Promise<Result> {
  const tell = await inTransaction((c) => leaveIn(c, me));
  if (tell.length === 0) return { error: "no_party" };
  forget([...tell, me]);
  return { ok: true };
}

/** The leader hands the party to another member. */
export async function handOverParty(me: number, to: number): Promise<Result> {
  const result = await inTransaction(async (c) => {
    const p = await partyOf(c, me, true);
    if (!p) return { error: "no_party" as const };
    if (p.leaderId !== me) return { error: "not_leader" as const };
    if (!p.members.includes(to)) return { error: "not_member" as const };
    await c.query("UPDATE derpy_parties SET leader_id = $2 WHERE id = $1", [
      p.id,
      to,
    ]);
    return { ok: true as const, tell: p.members };
  });
  if ("error" in result) return result;
  forget(result.tell);
  return { ok: true };
}

/** The leader ends the party for everyone. */
export async function disbandParty(me: number): Promise<Result> {
  const result = await inTransaction(async (c) => {
    const p = await partyOf(c, me, true);
    if (!p) return { error: "no_party" as const };
    if (p.leaderId !== me) return { error: "not_leader" as const };
    const tell = [...p.members, ...(await invitedTo(c, p.id))];
    await c.query("DELETE FROM derpy_parties WHERE id = $1", [p.id]);
    return { ok: true as const, tell };
  });
  if ("error" in result) return result;
  forget(result.tell);
  return { ok: true };
}

// ---------------------------------------------------------------- friends' games

/** Your friends' latest finished games, in either game, for your page. */
export async function friendGames(
  me: number,
  limit = 20,
): Promise<FriendGame[]> {
  const pool = await db();
  const [front, conquest] = await Promise.all([
    pool.query(
      `SELECT g.game_id, g.ended_at, g.map, g.num_players, a.username, gp.won
       FROM derpy_friends f
       JOIN derpy_game_players gp ON gp.account_id = f.friend_id
       JOIN derpy_games g ON g.game_id = gp.game_id
       JOIN derpy_accounts a ON a.id = gp.account_id
       WHERE f.account_id = $1
       ORDER BY g.ended_at DESC
       LIMIT $2`,
      [me, limit],
    ),
    pool.query(
      `SELECT g.game_id, g.ended_at, g.num_players, a.username, cp.nation,
         cp.won
       FROM derpy_friends f
       JOIN derpy_conquest_players cp ON cp.account_id = f.friend_id
       JOIN derpy_conquest_games g ON g.game_id = cp.game_id
       JOIN derpy_accounts a ON a.id = cp.account_id
       WHERE f.account_id = $1
       ORDER BY g.ended_at DESC
       LIMIT $2`,
      [me, limit],
    ),
  ]);
  return [
    ...front.rows.map((r) => ({
      game: "derpyfront" as const,
      gameId: r.game_id,
      endedAt: iso(r.ended_at),
      username: r.username,
      won: r.won,
      where: r.map,
      numPlayers: r.num_players,
    })),
    ...conquest.rows.map((r) => ({
      game: "conquest" as const,
      gameId: r.game_id,
      endedAt: iso(r.ended_at),
      username: r.username,
      won: r.won,
      where: r.nation,
      numPlayers: r.num_players,
    })),
  ]
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------- the routes

type Authed = Request & { derpy?: { account: Account; token: string } };
type Handler = (req: Authed, res: Response) => Promise<unknown>;

export interface SocialRouterDeps {
  /** Signed in, or a 401 (the token may come in a beacon's body). */
  requireAccount: (
    fn: Handler,
  ) => (req: Request, res: Response, next: NextFunction) => void;
}

const ERROR_STATUS: Record<SocialError, number> = {
  no_such_player: 404,
  yourself: 400,
  already_friends: 409,
  not_friends: 409,
  no_request: 404,
  rate_limited: 429,
  not_in_a_game: 409,
  already_there: 409,
  not_online: 409,
  no_party: 409,
  not_leader: 403,
  not_member: 409,
  party_full: 409,
  in_a_party: 409,
  no_invite: 404,
  invalid: 400,
};

const TAB = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/);
const Id = z.object({ id: z.coerce.number().int().positive() });

const sessions = new Map<string, { account: Account; at: number }>();

/**
 * The account a session token belongs to, for beats: from what's kept when
 * it can be (no database), else as every other route finds it.
 */
async function beatAccount(token: string): Promise<Account | null> {
  if (!token) return null;
  const key = hashToken(token);
  const hit = sessions.get(key);
  if (
    hit &&
    Date.now() - hit.at < SESSION_CACHE_MS &&
    presence.username(hit.account.id) !== null
  )
    return hit.account;
  const found = await accountForToken(token);
  if (!found) {
    sessions.delete(key);
    return null;
  }
  if (sessions.size >= 5000) sessions.delete(sessions.keys().next().value!);
  sessions.set(key, { account: found.account, at: Date.now() });
  return found.account;
}

/** Signed out: the session isn't taken for a beat any more. */
export function socialSignedOut(token: string): void {
  if (token) sessions.delete(hashToken(token));
}

/**
 * ADMIN (r26): an account signed out everywhere, suspended or deleted by
 * the owner: its kept sessions stop beating at once, it's off who's online,
 * and every list is read again.
 */
export function socialForgetAccount(id: number): void {
  for (const [key, s] of sessions)
    if (s.account.id === id) sessions.delete(key);
  presence.leave(id);
  forgetAllSocial();
}

/** A renamed account: its new name shows in everyone's lists at once. */
export function socialRenamed(id: number, username: string): void {
  presence.learn(id, username);
  forgetAllSocial();
}

export function socialRouter({
  requireAccount,
}: SocialRouterDeps): express.Router {
  const router = express.Router();
  const json = express.json({ limit: "8kb" });
  // Counted per session (several friends may share a house's address), or
  // per address without one. A page beats every 15 seconds: a few tabs, a
  // reload or two. The actions that bother someone else (friend requests,
  // invites) have their own limits per account (LIMITS).
  const perSession = (req: Request) => {
    const token =
      req.headers.authorization ??
      (typeof req.body?.token === "string" ? req.body.token : "");
    return token
      ? `s:${hashToken(String(token)).slice(0, 24)}`
      : ipKeyGenerator(req.ip ?? "");
  };
  const beatLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    keyGenerator: perSession,
  });
  const actLimiter = rateLimit({
    windowMs: 60_000,
    limit: 90,
    keyGenerator: perSession,
  });

  const me = (req: Authed) => req.derpy!.account;
  const answer = async (req: Authed, res: Response, result: Result) => {
    if ("error" in result) {
      res.status(ERROR_STATUS[result.error]).json({ error: result.error });
      return;
    }
    const rest: Record<string, unknown> = { ...result };
    delete rest.ok;
    res.json({ ...rest, state: await socialState(me(req)) });
  };
  const withId = (fn: (me: number, id: number) => Promise<Result>) =>
    requireAccount(async (req, res) => {
      const body = Id.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      await answer(req, res, await fn(me(req).id, body.data.id));
    });
  const plain = (fn: (me: number) => Promise<Result>) =>
    requireAccount(async (req, res) => answer(req, res, await fn(me(req).id)));
  /** Signed in (from the kept sessions), or a 401; errors as a JSON 500 or 503. */
  const beating =
    (fn: (account: Account, req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response) => {
      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ")
        ? auth.slice("Bearer ".length).trim()
        : typeof req.body?.token === "string"
          ? (req.body.token as string)
          : "";
      void (async () => {
        const account = await beatAccount(token);
        if (!account) {
          res.status(401).json({ error: "signed_out" });
          return;
        }
        await fn(account, req, res);
      })().catch((err: unknown) => {
        if (res.headersSent) return;
        if (err instanceof DerpyDbUnavailable)
          res.status(503).json({ error: "accounts_unavailable" });
        else res.status(500).json({ error: "server_error" });
      });
    };

  // Where this page is, and what it shows. `leaving`: the page is closing
  // (a beacon), so it's gone from the list at once.
  router.post(
    "/beat",
    json,
    beatLimiter,
    beating(async (account, req, res) => {
      const tab = TAB.safeParse(req.body?.tab);
      if (!tab.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      if (req.body?.leaving === true) {
        presence.leave(account.id, tab.data);
        res.status(204).end();
        return;
      }
      presence.beat(account.id, tab.data, readClientWhere(req.body?.where));
      // NEWS (r25): and how much of What's New is new to them (kept, so no
      // database either); without it the bar just shows no dot.
      const news = await newsBeat(account.id).catch(() => undefined);
      // ADMIN (r26): and the site banner (kept in memory: no query either).
      res.json({
        ...(await socialState(account)),
        news,
        banner: await currentBanner(),
      });
    }),
  );

  router.get(
    "/state",
    beating(async (account, _req, res) => {
      res.json(await socialState(account));
    }),
  );

  router.post(
    "/hidden",
    json,
    actLimiter,
    requireAccount(async (req, res) => {
      const body = z.object({ hidden: z.boolean() }).safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      await setAppearOffline(me(req).id, body.data.hidden);
      res.json({ state: await socialState(me(req)) });
    }),
  );

  router.post(
    "/friends/request",
    json,
    actLimiter,
    requireAccount(async (req, res) => {
      const body = z
        .object({ username: z.string().min(1).max(40) })
        .safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "no_such_player" });
        return;
      }
      await answer(
        req,
        res,
        await requestFriend(me(req).id, body.data.username),
      );
    }),
  );
  router.post(
    "/friends/accept",
    json,
    actLimiter,
    withId((m, id) => acceptFriend(m, id)),
  );
  router.post(
    "/friends/decline",
    json,
    actLimiter,
    withId((m, id) => dropRequest(id, m)),
  );
  router.post(
    "/friends/cancel",
    json,
    actLimiter,
    withId((m, id) => dropRequest(m, id)),
  );
  router.post(
    "/friends/remove",
    json,
    actLimiter,
    withId((m, id) => removeFriend(m, id)),
  );
  router.get(
    "/friends/games",
    requireAccount(async (req, res) => {
      res.json({ games: await friendGames(me(req).id) });
    }),
  );

  router.post("/invite", json, actLimiter, withId(inviteToGame));
  router.post("/invite/close", json, actLimiter, withId(closeInvite));

  router.post("/party/create", json, actLimiter, plain(createParty));
  router.post("/party/invite", json, actLimiter, withId(inviteToParty));
  router.post("/party/accept", json, actLimiter, withId(acceptParty));
  router.post("/party/decline", json, actLimiter, withId(declineParty));
  router.post("/party/leave", json, actLimiter, plain(leaveParty));
  router.post("/party/lead", json, actLimiter, withId(handOverParty));
  router.post("/party/disband", json, actLimiter, plain(disbandParty));

  return router;
}

/** For tests: forget every account's rows and every limit. */
export function resetSocial(): void {
  cache.clear();
  sessions.clear();
  for (const l of Object.values(LIMITS)) l.clear();
  lastSwept = 0;
}
