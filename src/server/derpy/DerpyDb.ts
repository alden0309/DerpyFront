// Derp Land's database: accounts, sessions, saved DerpyFront games (for
// stats and replays), Derpy Conquest results, saved campaigns, dynasties
// and achievements, store purchases, weekly challenges (CHAL r25), Mr.
// Based's saves and notes, and friends, parties and game invites
// (FRIENDS r25), in the
// Postgres that DATABASE_URL points at
// (a free Neon database on the hosted site). Without DATABASE_URL the game
// still runs; accounts and the store just say they aren't set up.

import pg from "pg";
import { logger } from "../Logger";
import { grantBasedByName } from "./BasedAccess"; // NAMES (r20)
import { grantPersonalitiesToPackOwners } from "./PersonalityGrants"; // AIP (r23)
import { refundRetiredItems } from "./RetiredRefunds"; // CQ24 (r24)

const log = logger.child({ component: "DerpyDb" });

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

export function derpyDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * The shared pool, created (and the schema migrated) on first use. Small on
 * purpose: the free database allows few connections, and the master and the
 * game worker each hold their own pool.
 */
export async function db(): Promise<pg.Pool> {
  if (!derpyDbConfigured()) throw new DerpyDbUnavailable();
  if (pool === null) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
      // Neon suspends an idle database; waking it takes a few seconds.
      connectionTimeoutMillis: 15_000,
    });
    pool.on("error", (err) => log.warn(`idle client error: ${err.message}`));
  }
  ready ??= migrate(pool).catch((err) => {
    ready = null;
    throw err;
  });
  await ready;
  return pool;
}

export class DerpyDbUnavailable extends Error {
  constructor() {
    super("DATABASE_URL is not set");
  }
}

/** Runs `fn` in a transaction, rolling back if it throws. */
export async function inTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await db()).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS derpy_accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS derpy_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  play_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS derpy_games (
  game_id TEXT PRIMARY KEY,
  map TEXT NOT NULL,
  mode TEXT NOT NULL,
  game_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_s INTEGER NOT NULL,
  winner TEXT,
  num_players INTEGER NOT NULL,
  awards JSONB NOT NULL DEFAULT '[]',
  record BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS derpy_game_players (
  game_id TEXT NOT NULL REFERENCES derpy_games(game_id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  won BOOLEAN NOT NULL,
  peak_territory_pct REAL NOT NULL,
  gold_earned BIGINT NOT NULL,
  conquests INTEGER NOT NULL,
  ships INTEGER NOT NULL,
  betrayals INTEGER NOT NULL,
  nukes INTEGER NOT NULL,
  awards TEXT[] NOT NULL DEFAULT '{}',
  coins INTEGER NOT NULL,
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS derpy_game_players_account
  ON derpy_game_players (account_id);

CREATE TABLE IF NOT EXISTS derpy_owned (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item)
);

CREATE TABLE IF NOT EXISTS derpy_conquest_games (
  game_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_s INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  final_year INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  num_players INTEGER NOT NULL,
  winner TEXT,
  summary JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS derpy_conquest_players (
  game_id TEXT NOT NULL REFERENCES derpy_conquest_games(game_id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  nation TEXT NOT NULL,
  won BOOLEAN NOT NULL,
  rank INTEGER NOT NULL,
  score INTEGER NOT NULL,
  provinces INTEGER NOT NULL,
  peak_provinces INTEGER NOT NULL,
  colonies INTEGER NOT NULL,
  battles_won INTEGER NOT NULL,
  conquests INTEGER NOT NULL,
  gold_earned BIGINT NOT NULL,
  coins INTEGER NOT NULL,
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS derpy_conquest_players_account
  ON derpy_conquest_players (account_id);

CREATE TABLE IF NOT EXISTS derpy_conquest_saves (
  game_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  seats JSONB NOT NULL,
  accounts BIGINT[] NOT NULL DEFAULT '{}',
  state BYTEA NOT NULL,
  over BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS derpy_conquest_saves_accounts
  ON derpy_conquest_saves USING GIN (accounts);
-- The game state's version: saves from another version can't be loaded, so
-- they aren't offered. Saves from before this column existed were version 2.
ALTER TABLE derpy_conquest_saves
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 2;
-- STORY (r17): who began a game (only they may delete it; before this column,
-- the first signed-in seat), and the players who took it off their own list.
ALTER TABLE derpy_conquest_saves
  ADD COLUMN IF NOT EXISTS owner BIGINT;
ALTER TABLE derpy_conquest_saves
  ADD COLUMN IF NOT EXISTS hidden BIGINT[] NOT NULL DEFAULT '{}';

-- Derpy Conquest achievements (MAP r12): each paid once per account.
CREATE TABLE IF NOT EXISTS derpy_conquest_achievements (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  game_id TEXT,
  coins INTEGER NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, key)
);

-- BASED (r19): Mr. Based, the story game. Each player's save (where to
-- continue, checkpoints, what they've seen of each chapter), the option they
-- last picked at each choice (for the flowchart's shares), and notes left
-- for the writer on a scene.
CREATE TABLE IF NOT EXISTS derpy_based_saves (
  account_id BIGINT PRIMARY KEY REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  save JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS derpy_based_picks (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  chapter INTEGER NOT NULL,
  choice TEXT NOT NULL,
  option TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, chapter, choice)
);
CREATE TABLE IF NOT EXISTS derpy_based_notes (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  chapter INTEGER NOT NULL,
  scene TEXT NOT NULL,
  line TEXT NOT NULL DEFAULT '',
  path JSONB NOT NULL DEFAULT '[]',
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS derpy_based_notes_scene
  ON derpy_based_notes (chapter, scene);
-- BWORLD (r22): Mr. Based saves in slots (an autosave, a quicksave and ten
-- of the player's own), one row each, so saving one never rewrites the
-- rest; derpy_based_saves keeps the account's profile beside them.
CREATE TABLE IF NOT EXISTS derpy_based_slots (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  meta JSONB NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, slot)
);

-- NAMES (r20): changing your username. When it last changed (once in 7 days),
-- and the name given up then, which stays with this account for 7 days so
-- nobody else can take it and pass as them.
ALTER TABLE derpy_accounts
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS old_username TEXT;
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS old_username_key TEXT;
CREATE INDEX IF NOT EXISTS derpy_accounts_old_username_key
  ON derpy_accounts (old_username_key) WHERE old_username_key IS NOT NULL;
-- A DerpyFront player row's username is the name it shows, which follows a
-- rename when it was the account's own; played_as keeps the name in the
-- game's replay when that's different (null: the same).
ALTER TABLE derpy_game_players ADD COLUMN IF NOT EXISTS played_as TEXT;
-- Mr. Based goes by account: the mark, and the BASED_PLAYERS name it was
-- first given under (each name marks one account, once).
ALTER TABLE derpy_accounts
  ADD COLUMN IF NOT EXISTS based_access BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS based_granted_as TEXT;

-- LEGACY (r21): Derp Coins paid while a Derpy Conquest game is played, per
-- game and account: for time at the table (play), the line's coins as they
-- were reached (lines), and the seconds at the table that counted (secs:
-- the line's coins are held to an hour's worth for each hour). The end of a
-- game pays the rest (derpy_conquest_players.coins).
CREATE TABLE IF NOT EXISTS derpy_conquest_play (
  game_id TEXT NOT NULL,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  play INTEGER NOT NULL DEFAULT 0,
  lines INTEGER NOT NULL DEFAULT 0,
  secs INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS derpy_conquest_play_account
  ON derpy_conquest_play (account_id);
-- LEGACY (r21): seconds at the table an account was paid for each day (UTC),
-- all games together (PLAY_PAY.dailyHours at most).
CREATE TABLE IF NOT EXISTS derpy_conquest_days (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  secs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
-- CQ24 (r24): store items taken off sale whose price this account has been
-- given back (RetiredRefunds.ts), so each is refunded once.
ALTER TABLE derpy_accounts
  ADD COLUMN IF NOT EXISTS refunded TEXT[] NOT NULL DEFAULT '{}';

-- TREE (r25): each account's Derpy Conquest dynasty in each game: its
-- line's family tree and every life on it (nothing secret, no ids), kept
-- each time the game is saved and for good when it ends (over), for the
-- profile's Dynasties (ConquestDynasties.ts). A new table: nothing else moves.
CREATE TABLE IF NOT EXISTS derpy_conquest_dynasties (
  game_id TEXT NOT NULL,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  family TEXT NOT NULL,
  from_year INTEGER NOT NULL,
  to_year INTEGER NOT NULL,
  lives INTEGER NOT NULL,
  names JSONB NOT NULL DEFAULT '[]',
  over BOOLEAN NOT NULL DEFAULT false,
  record JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, account_id)
);
CREATE INDEX IF NOT EXISTS derpy_conquest_dynasties_account
  ON derpy_conquest_dynasties (account_id, updated_at DESC);
-- CHAL (r25): weekly challenges (DerpyChallenges.ts). Each account's
-- progress on each of a week's challenges (week: weeks since 1970 on New
-- York's calendar, Monday to Monday), when it was done and what it paid,
-- and the game that did it; a game's bonus is a row of its own
-- (key 'bonus:<game>'). Paid once: only the update that sets done_at pays.
CREATE TABLE IF NOT EXISTS derpy_challenges (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  done_at TIMESTAMPTZ,
  coins INTEGER NOT NULL DEFAULT 0,
  game_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, week, key)
);
CREATE INDEX IF NOT EXISTS derpy_challenges_game
  ON derpy_challenges (account_id, game_id) WHERE game_id IS NOT NULL;
-- CHAL (r25): for a challenge done in one game (the most coins in one game,
-- the most years with one character), each game's progress this week, and
-- the character it was with: {"<game>": {"p": 120, "c": 7}}.
ALTER TABLE derpy_challenges
  ADD COLUMN IF NOT EXISTS games JSONB NOT NULL DEFAULT '{}';
-- CHAL (r25): the DerpyFront games that counted for an account's
-- challenges, timed by the server, so two played at once count once.
CREATE TABLE IF NOT EXISTS derpy_challenge_games (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  week INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, game_id)
);
CREATE INDEX IF NOT EXISTS derpy_challenge_games_time
  ON derpy_challenge_games (account_id, ended_at);
-- FRIENDS (r25): friends, friend requests, parties and game invites, all by
-- account id (so a rename changes nothing here). Who's online, and where, is
-- kept in the master's memory (Presence.ts), never here; an account that
-- appears offline is marked here so it stays so between sessions.
ALTER TABLE derpy_accounts
  ADD COLUMN IF NOT EXISTS appear_offline BOOLEAN NOT NULL DEFAULT false;
-- Each friendship is two rows, one each way.
CREATE TABLE IF NOT EXISTS derpy_friends (
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  friend_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  since TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, friend_id)
);
CREATE TABLE IF NOT EXISTS derpy_friend_requests (
  from_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  to_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS derpy_friend_requests_to
  ON derpy_friend_requests (to_id);
CREATE TABLE IF NOT EXISTS derpy_parties (
  id BIGSERIAL PRIMARY KEY,
  leader_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One party at a time: the leader is a member too.
CREATE TABLE IF NOT EXISTS derpy_party_members (
  account_id BIGINT PRIMARY KEY REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  party_id BIGINT NOT NULL REFERENCES derpy_parties(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS derpy_party_members_party
  ON derpy_party_members (party_id);
CREATE TABLE IF NOT EXISTS derpy_party_invites (
  party_id BIGINT NOT NULL REFERENCES derpy_parties(id) ON DELETE CASCADE,
  to_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  from_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, to_id)
);
CREATE INDEX IF NOT EXISTS derpy_party_invites_to
  ON derpy_party_invites (to_id);
-- An invite into a DerpyFront lobby (target: its game id) or a Derpy
-- Conquest table (its room code). It shows while its sender is still there
-- and the lobby or table still has room; closed once used or waved off.
CREATE TABLE IF NOT EXISTS derpy_invites (
  id BIGSERIAL PRIMARY KEY,
  from_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  to_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS derpy_invites_to
  ON derpy_invites (to_id) WHERE NOT closed;
-- NEWS (r25): What's New (DerpyNews.ts). The newest entry each account has
-- seen: an entry id from src/server/derpy/news/entries.json, or 0000-00-00
-- (none yet). Null until the account first looks, when it becomes the
-- newest entry then, so old news is never new to a new account.
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS news_seen TEXT;
`;

// The master and the game worker both migrate at startup; the lock keeps two
// CREATE TABLE IF NOT EXISTS from racing each other.
const MIGRATION_LOCK = 7_317_001;

async function migrate(p: pg.Pool): Promise<void> {
  const client = await p.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(SCHEMA);
    // NAMES (r20): Mr. Based's players marked by account, from their names
    // in BASED_PLAYERS, once each (the owner's "Alden" on the first start).
    const marked = await grantBasedByName(client);
    if (marked.length > 0) log.info("Mr. Based: accounts marked", { marked });
    // AIP (r23): owners of the old AI personality packs get the four
    // personalities that replaced them, once (later starts add nothing).
    const granted = await grantPersonalitiesToPackOwners(client);
    if (granted > 0) log.info("AI personalities granted", { rows: granted });
    // CQ24 (r24): Hard Winter's buyers get its price back, once.
    for (const r of await refundRetiredItems(client))
      log.info("retired item refunded", { ...r });
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK])
      .catch(() => {});
    client.release();
  }
  log.info("Derp Land database ready");
}

/** For tests: drop the pool so the next db() call reconnects. */
export async function closeDerpyDb(): Promise<void> {
  const p = pool;
  pool = null;
  ready = null;
  await p?.end();
}
