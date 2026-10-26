// ADMIN (r26): the Derp Coin ledger. There was never a table of coin
// changes, so the ledger is put together from the records that already say
// what was paid and when: each DerpyFront game's pay, a Derpy Conquest
// game's pay at its end and at the table, achievements, weekly challenges,
// purchases (what each cost when bought; older ones at today's price), and
// the coins given or taken by hand (derpy_coin_adjustments). A challenge
// paid by hand (Weekly challenges' fix-up) is a challenge line like any. Items given by
// hand aren't purchases. Retired items' refunds (CQ24) kept no date and
// aren't in it.

import { DERPY_ITEMS } from "../DerpyCatalog";
import { db } from "../DerpyDb";

export const LEDGER_KINDS = [
  "game",
  "conquest",
  "table",
  "achievement",
  "challenge",
  "purchase",
  "admin",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_NAMES: Record<LedgerKind, string> = {
  game: "DerpyFront game",
  conquest: "Conquest game's end",
  table: "Conquest at the table",
  achievement: "Conquest achievement",
  challenge: "Weekly challenge",
  purchase: "Purchase",
  admin: "Given or taken by hand",
};

export interface LedgerRow {
  at: string;
  accountId: number;
  username: string;
  kind: LedgerKind;
  delta: number;
  what: string;
  ref: string | null;
}

export interface LedgerFilter {
  accountId?: number;
  kinds?: LedgerKind[];
  /** Only lines before this moment (ISO), for the next page. */
  before?: string;
  /** Only lines since this moment (ISO). */
  since?: string;
  limit?: number;
}

function catalogArgs(): [string[], number[], string[]] {
  return [
    DERPY_ITEMS.map((i) => `pack:${i.name}`),
    DERPY_ITEMS.map((i) => i.price),
    DERPY_ITEMS.map((i) => i.displayName),
  ];
}

/**
 * Each kind's lines, as (at, account_id, kind, delta, what, ref). `cat` is
 * where the catalog's three arrays are in the query's parameters.
 */
const BRANCHES: Record<LedgerKind, string | ((cat: number) => string)> = {
  game: `SELECT g.ended_at AS at, gp.account_id, 'game' AS kind, gp.coins AS delta,
           'DerpyFront on ' || g.map AS what, g.game_id AS ref
         FROM derpy_game_players gp JOIN derpy_games g ON g.game_id = gp.game_id
         WHERE gp.coins <> 0`,
  conquest: `SELECT cg.ended_at, cp.account_id, 'conquest', cp.coins,
           'Derpy Conquest, the end of the game', cg.game_id
         FROM derpy_conquest_players cp
         JOIN derpy_conquest_games cg ON cg.game_id = cp.game_id
         WHERE cp.coins <> 0`,
  table: `SELECT p.updated_at, p.account_id, 'table', p.play + p.lines,
           'Derpy Conquest, at the table', p.game_id
         FROM derpy_conquest_play p WHERE p.play + p.lines <> 0`,
  achievement: `SELECT x.earned_at, x.account_id, 'achievement', x.coins,
           'Achievement: ' || x.key, x.game_id
         FROM derpy_conquest_achievements x WHERE x.coins <> 0`,
  challenge: `SELECT ch.done_at, ch.account_id, 'challenge', ch.coins,
           'Weekly challenge: ' || ch.key, ch.game_id
         FROM derpy_challenges ch WHERE ch.done_at IS NOT NULL AND ch.coins <> 0`,
  purchase: (cat) => `SELECT o.acquired_at, o.account_id, 'purchase',
           -COALESCE(o.price, cat.price, 0),
           'Bought ' || COALESCE(cat.label, o.item), o.item
         FROM derpy_owned o
         LEFT JOIN unnest($${cat}::text[], $${cat + 1}::int[], $${cat + 2}::text[])
           AS cat(item, price, label) ON cat.item = o.item
         WHERE o.item LIKE 'pack:%' AND NOT o.granted`,
  admin: `SELECT ad.created_at, ad.account_id, 'admin', ad.delta, ad.reason, ad.ref
         FROM derpy_coin_adjustments ad`,
};

const branch = (k: LedgerKind, cat: number): string => {
  const b = BRANCHES[k];
  return typeof b === "string" ? b : b(cat);
};

/** The ledger's lines, newest first. */
export async function ledger(f: LedgerFilter = {}): Promise<LedgerRow[]> {
  const kinds = f.kinds?.length ? f.kinds : [...LEDGER_KINDS];
  const limit = Math.min(Math.max(1, f.limit ?? 100), 500);
  // $1 the account (or null), $2 before, $3 since; $4-$6 the catalog, only
  // when purchases are asked for (a parameter nothing uses is an error).
  const args: unknown[] = [
    f.accountId ?? null,
    f.before ?? null,
    f.since ?? null,
  ];
  if (kinds.includes("purchase")) args.push(...catalogArgs());
  // Each branch is cut to the page on its own, so the union stays small.
  const parts = kinds.map(
    (
      k,
    ) => `(SELECT * FROM (${branch(k, 4)}) b(at, account_id, kind, delta, what, ref)
      WHERE ($1::bigint IS NULL OR b.account_id = $1)
        AND ($2::timestamptz IS NULL OR b.at < $2)
        AND ($3::timestamptz IS NULL OR b.at >= $3)
      ORDER BY b.at DESC LIMIT ${limit})`,
  );
  const r = await (
    await db()
  ).query(
    `SELECT l.*, a.username FROM (${parts.join(" UNION ALL ")}) l
     JOIN derpy_accounts a ON a.id = l.account_id
     ORDER BY l.at DESC LIMIT ${limit}`,
    args,
  );
  return r.rows.map((x) => ({
    at: new Date(x.at).toISOString(),
    accountId: Number(x.account_id),
    username: String(x.username),
    kind: x.kind as LedgerKind,
    delta: Number(x.delta),
    what: String(x.what),
    ref: x.ref === null ? null : String(x.ref),
  }));
}

export interface DayTotal {
  /** YYYY-MM-DD (UTC). */
  day: string;
  /** Paid out by games, challenges and achievements. */
  earned: number;
  /** Spent in the store (a positive number). */
  spent: number;
  /** Given (or, negative, taken) by hand. */
  admin: number;
  purchases: number;
}

/** Each of the last `days` days' totals (UTC days), newest first. */
export async function dailyTotals(days = 30): Promise<DayTotal[]> {
  const parts = LEDGER_KINDS.map(
    (k) => `(SELECT b.at, b.kind, b.delta FROM (${branch(k, 2)})
      b(at, account_id, kind, delta, what, ref)
      WHERE b.at >= ((now() AT TIME ZONE 'UTC')::date - ($1::int - 1)) AT TIME ZONE 'UTC')`,
  );
  const r = await (
    await db()
  ).query(
    `SELECT to_char((l.at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
       sum(l.delta) FILTER (WHERE l.kind IN ('game','conquest','table','achievement','challenge')) AS earned,
       -sum(l.delta) FILTER (WHERE l.kind = 'purchase') AS spent,
       count(*) FILTER (WHERE l.kind = 'purchase') AS purchases,
       sum(l.delta) FILTER (WHERE l.kind = 'admin') AS admin
     FROM (${parts.join(" UNION ALL ")}) l
     GROUP BY 1 ORDER BY 1 DESC`,
    [days, ...catalogArgs()],
  );
  const byDay = new Map(
    r.rows.map((x) => [
      String(x.day),
      {
        earned: Number(x.earned ?? 0),
        spent: Number(x.spent ?? 0),
        admin: Number(x.admin ?? 0),
        purchases: Number(x.purchases ?? 0),
      },
    ]),
  );
  const out: DayTotal[] = [];
  const today = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  for (let i = 0; i < days; i++) {
    const day = new Date(today - i * 86_400_000).toISOString().slice(0, 10);
    out.push({
      day,
      ...(byDay.get(day) ?? { earned: 0, spent: 0, admin: 0, purchases: 0 }),
    });
  }
  return out;
}
