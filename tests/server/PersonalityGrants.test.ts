// AIP (r23): whoever bought one of r21's AI personality packs is given the
// four AI personalities that replaced them, by a startup migration that is
// safe to run on every start, against a database that already has data.
//
// Needs a throwaway Postgres: DERPY_TEST_DATABASE_URL=postgres://... (every
// derpy_ table in it is dropped first).

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { ownedInTab } from "../../src/derpland/StoreTabs";
import {
  DERPY_ITEMS,
  findItem,
  ownedAiTypes,
} from "../../src/server/derpy/DerpyCatalog";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

const FOUR = [
  "pack:ai_aggressive",
  "pack:ai_mad_scientist",
  "pack:ai_protector",
  "pack:ai_trader",
];

describe.skipIf(!TEST_DB)(
  "old personality packs become the four personalities",
  () => {
    let pool: pg.Pool;
    let db: () => Promise<pg.Pool>;
    let closeDb: () => Promise<void>;
    let grant: (q: pg.Pool) => Promise<number>;
    const ids: Record<string, number> = {};

    async function account(name: string, owned: string[]): Promise<void> {
      const r = await pool.query(
        `INSERT INTO derpy_accounts (username, username_key, password_hash, coins)
       VALUES ($1, $2, 'x', 100) RETURNING id`,
        [name, name.toLowerCase()],
      );
      ids[name] = Number(r.rows[0].id);
      for (const item of owned) {
        await pool.query(
          "INSERT INTO derpy_owned (account_id, item) VALUES ($1, $2)",
          [ids[name], item],
        );
      }
    }

    async function owned(name: string): Promise<string[]> {
      const r = await pool.query(
        "SELECT item FROM derpy_owned WHERE account_id = $1 ORDER BY item",
        [ids[name]],
      );
      return r.rows.map((row) => row.item as string);
    }

    /** The server stops and starts again: the next use migrates. */
    async function restart(): Promise<void> {
      await closeDb();
      pool = await db();
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DB;
      const pgm = await import("pg");
      const c = new pgm.default.Client({ connectionString: TEST_DB });
      await c.connect();
      await c.query(
        "DROP TABLE IF EXISTS derpy_conquest_days, derpy_conquest_play, derpy_based_slots, derpy_based_notes, derpy_based_picks, derpy_based_saves, derpy_conquest_achievements, derpy_conquest_saves, derpy_conquest_players, derpy_conquest_games, derpy_owned, derpy_game_players, derpy_games, derpy_sessions, derpy_accounts CASCADE",
      );
      await c.end();
      ({ db, closeDerpyDb: closeDb } =
        await import("../../src/server/derpy/DerpyDb"));
      ({ grantPersonalitiesToPackOwners: grant } =
        await import("../../src/server/derpy/PersonalityGrants"));
      pool = await db();
      // The live database already holds accounts that bought packs (and
      // other things) before this round
      await account("Pirate", ["pack:ai_pirates", "pack:classics"]);
      await account("Collector", [
        "pack:ai_scientists",
        "pack:ai_warlords",
        "pack:ai_trader",
      ]);
      await account("Skins", ["pack:classics", "skin:classic_camo"]);
      await account("Nobody", []);
    }, 60_000);

    afterAll(async () => {
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    test("on the next start, every old-pack owner owns all four; nobody else gets any", async () => {
      await restart();
      expect(await owned("Pirate")).toEqual(
        [...FOUR, "pack:ai_pirates", "pack:classics"].sort(),
      );
      expect(await owned("Collector")).toEqual(
        [...FOUR, "pack:ai_scientists", "pack:ai_warlords"].sort(),
      );
      expect(await owned("Skins")).toEqual([
        "pack:classics",
        "skin:classic_camo",
      ]);
      expect(await owned("Nobody")).toEqual([]);
    });

    test("starting again changes nothing: it is granted once", async () => {
      const before = await pool.query(
        "SELECT count(*)::int AS n FROM derpy_owned",
      );
      await restart();
      await restart();
      expect(await grant(pool)).toBe(0);
      const after = await pool.query(
        "SELECT count(*)::int AS n FROM derpy_owned",
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    test("their inventory shows the four, and an old pack's row breaks nothing", async () => {
      const rows = await owned("Pirate");
      const tab = { game: "derpyfront", category: "personalities" };
      expect(ownedInTab(DERPY_ITEMS, rows, tab).map((i) => i.name)).toEqual([
        "ai_trader",
        "ai_aggressive",
        "ai_protector",
        "ai_mad_scientist",
      ]);
      expect(ownedAiTypes(rows)).toEqual([
        "mad_scientist",
        "trader",
        "aggressive",
        "protector",
      ]);
      // The old packs aren't for sale, or anywhere in the catalog
      expect(findItem("ai_pirates")).toBeUndefined();
      expect(ownedInTab(DERPY_ITEMS, ["pack:ai_pirates"], tab)).toEqual([]);
    });
  },
);
