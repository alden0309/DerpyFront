// CQ24 (r24): Derpy Conquest's round 24.
// - Its new description, everywhere it was said.
// - Hard Winter off the Derp Store, its buyers refunded once (a startup
//   migration that's safe on a database that already has data), and an
//   account that still owns the old row breaking nothing.
//
// The database part needs a throwaway Postgres:
// DERPY_TEST_DATABASE_URL=postgres://... (every derpy_ table in it is
// dropped first).

import fs from "fs";
import path from "path";
import type pg from "pg";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { dlcFromOwned, MAP_STYLES } from "../../src/conquest/DlcIds";
import { ownedInTab } from "../../src/derpland/StoreTabs";
import {
  DERPY_ITEMS,
  findItem,
  RETIRED_ITEM_REFUNDS,
} from "../../src/server/derpy/DerpyCatalog";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

// ---------------------------------------------------------------- the description

describe("Derpy Conquest's description", () => {
  const short =
    "Live one life in the colonial Americas. Make history, or be one of the many who kept it moving.";
  const long =
    "Live one life in the colonial Americas, from the first settlements to the Revolution. Make history, or be one of the many who kept it moving.";

  test("the short one in the bar and the translations, the long one on the hub", () => {
    const en = JSON.parse(read("resources/lang/en.json"));
    expect(en.derp_bar.conquest_blurb).toBe(short);
    expect(read("src/derpland/DerpBar.ts")).toContain(short);
    expect(read("src/hub/Hub.ts")).toContain(long);
    expect(read("conquest.html")).toContain(
      "live one life in the colonial Americas",
    );
  });

  test("nothing still says the old words", () => {
    for (const f of [
      "resources/lang/en.json",
      "src/derpland/DerpBar.ts",
      "src/hub/Hub.ts",
      "conquest.html",
      "derpland.html",
      "src/conquest/client/Lobby.ts",
    ]) {
      const text = read(f);
      expect(text, f).not.toContain("Govern a colony in the 1600s");
      expect(text, f).not.toContain("colonize the 1600s Americas");
    }
  });
});

// ---------------------------------------------------------------- Hard Winter off the store

describe("Hard Winter is no longer sold", () => {
  test("not in the store, the map style list or the settings; Legends' words updated", () => {
    expect(findItem("map_winter")).toBeUndefined();
    expect(DERPY_ITEMS.some((i) => i.name === "map_winter")).toBe(false);
    expect(MAP_STYLES as readonly string[]).not.toContain("winter");
    expect(RETIRED_ITEM_REFUNDS.map_winter).toBe(700);
    const legends = findItem("legends")!;
    const words = legends.conquest!.features.join(" ");
    expect(words).not.toContain("never plundered");
    expect(words).toContain("plunder");
  });

  test("an account that still owns the old row is shown nothing for it, and draws the usual chart", () => {
    const rows = ["pack:map_winter", "pack:map_antique"];
    expect(dlcFromOwned(rows).styles).toEqual(["antique"]);
    expect(
      ownedInTab(DERPY_ITEMS, rows, { game: "conquest", category: "mapstyles" })
        .map((i) => i.name)
        .sort(),
    ).toEqual(["map_antique"]);
    expect(dlcFromOwned(["pack:map_winter"]).styles).toEqual([]);
  });
});

const TEST_DB = process.env.DERPY_TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)(
  "Hard Winter's buyers are refunded, once, by the startup migration",
  () => {
    let pool: pg.Pool;
    let db: () => Promise<pg.Pool>;
    let closeDb: () => Promise<void>;
    let refund: (q: pg.Pool) => Promise<unknown[]>;
    const ids: Record<string, number> = {};

    async function account(
      name: string,
      coins: number,
      owned: string[],
    ): Promise<void> {
      const r = await pool.query(
        `INSERT INTO derpy_accounts (username, username_key, password_hash, coins)
         VALUES ($1, $2, 'x', $3) RETURNING id`,
        [name, name.toLowerCase(), coins],
      );
      ids[name] = Number(r.rows[0].id);
      for (const item of owned)
        await pool.query(
          "INSERT INTO derpy_owned (account_id, item) VALUES ($1, $2)",
          [ids[name], item],
        );
    }

    async function coins(name: string): Promise<number> {
      const r = await pool.query(
        "SELECT coins FROM derpy_accounts WHERE id = $1",
        [ids[name]],
      );
      return Number(r.rows[0].coins);
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
      ({ refundRetiredItems: refund } =
        await import("../../src/server/derpy/RetiredRefunds"));
      pool = await db();
      // The live database as it was before this round: no refunds column,
      // and accounts that bought Hard Winter (and other things) already.
      await pool.query("ALTER TABLE derpy_accounts DROP COLUMN refunded");
      await account("Frost", 100, ["pack:map_winter"]);
      await account("Collector", 50, [
        "pack:map_winter",
        "pack:map_antique",
        "pack:legends",
      ]);
      await account("Antiquarian", 100, ["pack:map_antique"]);
      await account("Nobody", 0, []);
    }, 60_000);

    afterAll(async () => {
      await closeDb?.();
      delete process.env.DATABASE_URL;
    });

    test("on the next start, each buyer has 700 coins back; nobody else gets any", async () => {
      await restart();
      expect(await coins("Frost")).toBe(800);
      expect(await coins("Collector")).toBe(750);
      expect(await coins("Antiquarian")).toBe(100);
      expect(await coins("Nobody")).toBe(0);
      const r = await pool.query(
        "SELECT refunded FROM derpy_accounts WHERE id = $1",
        [ids.Frost],
      );
      expect(r.rows[0].refunded).toEqual(["map_winter"]);
    });

    test("starting again pays nobody twice", async () => {
      await restart();
      await restart();
      expect(await refund(pool)).toEqual([]);
      expect(await coins("Frost")).toBe(800);
      expect(await coins("Collector")).toBe(750);
    });

    test("the old row stays, and breaks nothing", async () => {
      const rows = await owned("Collector");
      expect(rows).toContain("pack:map_winter");
      expect(dlcFromOwned(rows).styles).toEqual(["antique"]);
      expect(dlcFromOwned(rows).legends).toBe(true);
    });
  },
);
