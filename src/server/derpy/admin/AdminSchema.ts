// ADMIN (r26): the tables and columns the owner's admin page needs, run by
// DerpyDb's startup migration right after its own schema, under the same
// lock. Like everything there: IF NOT EXISTS only, nothing existing changed,
// so running it twice (or on the live database) only adds what's missing.

export const ADMIN_SCHEMA = `
-- Every admin action: who, what, to what, before and after, and when. No
-- foreign keys: the log outlives the accounts it's about.
CREATE TABLE IF NOT EXISTS derpy_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id BIGINT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  reason TEXT,
  before JSONB,
  after JSONB
);
CREATE INDEX IF NOT EXISTS derpy_admin_audit_at
  ON derpy_admin_audit (at DESC, id DESC);
CREATE INDEX IF NOT EXISTS derpy_admin_audit_target
  ON derpy_admin_audit (target_type, target_id);

-- Derp Coins given or taken by hand, and challenge fix-ups: the coin
-- history's lines that no game, challenge or purchase already records.
CREATE TABLE IF NOT EXISTS derpy_coin_adjustments (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'admin',
  reason TEXT NOT NULL,
  ref TEXT,
  balance INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS derpy_coin_adjustments_account
  ON derpy_coin_adjustments (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS derpy_coin_adjustments_at
  ON derpy_coin_adjustments (created_at DESC);

-- A suspended account can't sign in (or use a session) until it ends;
-- suspended_until null: until it's lifted.
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE derpy_accounts ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- The owner's sessions: when he last typed his password again (for actions
-- that need a sign-in within 12 hours), and the key (hashed) that the admin
-- page's cookie carries.
ALTER TABLE derpy_sessions ADD COLUMN IF NOT EXISTS admin_reauth_at TIMESTAMPTZ;
ALTER TABLE derpy_sessions ADD COLUMN IF NOT EXISTS admin_key TEXT;
CREATE INDEX IF NOT EXISTS derpy_sessions_admin_key
  ON derpy_sessions (admin_key) WHERE admin_key IS NOT NULL;

-- Store items given by hand rather than bought (not purchases in the coin
-- history), and what a purchase cost when it was made (rows from before
-- this are priced from the catalog).
ALTER TABLE derpy_owned ADD COLUMN IF NOT EXISTS granted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE derpy_owned ADD COLUMN IF NOT EXISTS price INTEGER;

-- Words no new username may contain (sign-ups and renames).
CREATE TABLE IF NOT EXISTS derpy_name_blocklist (
  word TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time password reset links the owner makes to send someone himself
-- (only their hash is kept).
CREATE TABLE IF NOT EXISTS derpy_password_resets (
  token_hash TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES derpy_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS derpy_password_resets_account
  ON derpy_password_resets (account_id);

-- The site banner: one row, shown in the top bar while it's on and not over.
CREATE TABLE IF NOT EXISTS derpy_site_banner (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  text TEXT NOT NULL DEFAULT '',
  link TEXT,
  link_text TEXT,
  ends_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
