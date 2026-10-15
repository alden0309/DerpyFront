// CQ24 (r24): Derpy Conquest's round 24.
// - Its new description, everywhere it was said.
// - Hard Winter off the Derp Store, its buyers refunded once (a startup
//   migration that's safe on a database that already has data), and an
//   account that still owns the old row breaking nothing.
// - The winter on everyone's map: which provinces get it, in which months,
//   and nowhere else touched; never against what the engine does with winter.
// - Legends: a sacred place plundered as well as kept: the odds shown are
//   the odds rolled, what follows (their people, their allies, the
//   neighbours, the reckoning), and the place remembered as dug; keeping
//   faith still pays.
//
// The database part needs a throwaway Postgres:
// DERPY_TEST_DATABASE_URL=postgres://... (every derpy_ table in it is
// dropped first).

import fs from "fs";
import path from "path";
import type pg from "pg";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { seasonKeyOf } from "../../src/conquest/client/MapView";
import { dlcFromOwned, MAP_STYLES } from "../../src/conquest/DlcIds";
import { dateOf, dayOf } from "../../src/conquest/engine/Calendar";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { lifeForOthers } from "../../src/conquest/engine/IntrigueCore";
import {
  canHear,
  KEPT_FAITH,
  ldice,
  LEGENDS,
  progressOf,
  rememberRumour,
  setLegendsOwned,
} from "../../src/conquest/engine/Legends";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { checkChance } from "../../src/conquest/engine/LifeRules";
import { isWinter } from "../../src/conquest/engine/Map";
import {
  amendsOf,
  pickFind,
  PLUNDER,
  PLUNDER_FINDS,
  plunderCheck,
  plunderedMark,
  plunderOdds,
  RECKONING,
  sacredPeople,
  sacredProv,
} from "../../src/conquest/engine/SacredPlunder";
import { roadFactor } from "../../src/conquest/engine/Seasons";
import {
  roadSnow,
  snowKey,
  snowOn,
  winterReach,
  winterStrength,
} from "../../src/conquest/engine/Snow";
import { ownedInTab } from "../../src/derpland/StoreTabs";
import {
  DERPY_ITEMS,
  findItem,
  RETIRED_ITEM_REFUNDS,
} from "../../src/server/derpy/DerpyCatalog";
import { lifeOf, plan, toNextMonth, world } from "./LifeUtil";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const map = (await import("../../src/conquest/engine/Map")).AMERICAS;
const P = (name: string) => {
  const p = map.provinces.find((x) => x.name === name);
  if (!p) throw new Error(`no province ${name}`);
  return p;
};

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

// ---------------------------------------------------------------- everyone's winter

describe("the winter on everyone's map", () => {
  const reach = (name: string) => winterReach(P(name));

  test("where: the north and the mountains fully, the Chesapeake lightly, the south not at all", () => {
    // New England, New France, the northern interior, the mountains.
    for (const n of [
      "Massachusetts Bay",
      "Plymouth",
      "Connecticut",
      "Narragansett",
      "Piscataqua",
      "Quebec",
      "Hochelaga",
      "Trois-Rivières",
      "Port-Royal",
      "Mohawk",
      "Onondaga",
      "Fort Orange",
      "Allegheny",
      "Susquehannock",
      "Détroit",
      "Shenandoah",
      "Taos",
      "Ute",
      "Great Salt Lake",
    ])
      expect(reach(n), n).toBe(1);
    // The middle colonies' coast: most of it.
    for (const n of ["New Amsterdam", "Raritan", "Fort Christina"])
      expect(reach(n), n).toBe(0.75);
    // The Chesapeake: a lighter touch.
    for (const n of [
      "Jamestown",
      "Nansemond",
      "Accomac",
      "St. Mary's",
      "Severn",
      "Rappahannock",
      "Pamunkey",
    ]) {
      expect(reach(n), n).toBeGreaterThan(0);
      expect(reach(n), n).toBeLessThan(0.5);
    }
    // The Carolinas' coast, Florida, the Gulf, the islands, New Spain, the Pacific coast.
    for (const n of [
      "Albemarle",
      "Roanoke",
      "Pamlico",
      "Cape Fear",
      "Winyah",
      "Charles Town",
      "Guale",
      "St. Augustine",
      "Calusa",
      "Pensacola",
      "Mobile",
      "Bayogoula",
      "Havana",
      "Jamaica",
      "Barbados",
      "Le Cap",
      "Bermuda",
      "Tenochtitlan",
      "Veracruz",
      "Ohlone",
      "Monterey",
    ])
      expect(reach(n), n).toBe(0);
    // Off the board: nothing drawn.
    const closed = map.provinces.find((p) => p.closed)!;
    expect(winterReach(closed)).toBe(0);
  });

  test("when: first frosts late in November, deep winter in December and January, the thaw in early February", () => {
    const boston = P("Massachusetts Bay");
    const york = P("New Amsterdam");
    const at = (y: number, m: number, d: number) => dayOf(y, m - 1, d);
    expect(snowOn(york, at(1777, 11, 10))).toBe(0);
    expect(snowOn(york, at(1777, 11, 20))).toBeGreaterThan(0);
    expect(snowOn(york, at(1777, 11, 20))).toBeLessThan(
      snowOn(york, at(1777, 11, 28)),
    );
    expect(snowOn(york, at(1777, 12, 15))).toBe(0.75);
    expect(snowOn(york, at(1778, 1, 20))).toBe(0.75);
    expect(snowOn(york, at(1778, 2, 3))).toBeGreaterThan(0);
    expect(snowOn(york, at(1778, 2, 3))).toBeLessThan(0.75);
    expect(snowOn(york, at(1778, 2, 20))).toBe(0);
    for (const m of [3, 4, 5, 6, 7, 8, 9, 10])
      expect(snowOn(york, at(1778, m, 15)), `month ${m}`).toBe(0);
    expect(snowOn(boston, at(1777, 12, 25))).toBe(1);
    // The year's strength, the same everywhere.
    expect(winterStrength(at(1777, 7, 1))).toBe(0);
    expect(winterStrength(at(1778, 1, 1))).toBe(1);
    // The southern hemisphere's winter in its own months (no province there yet).
    const south = { lat: -48, lon: -70, coastal: false, terrain: "hills" };
    expect(winterReach(south)).toBe(1);
    expect(snowOn(south, at(1778, 7, 10))).toBe(1);
    expect(snowOn(south, at(1778, 1, 10))).toBe(0);
  });

  test("never against the engine: snow only where it has a winter, and on every snowbound road", () => {
    for (const p of map.provinces) {
      if (p.closed) continue;
      for (let d = dayOf(1777, 6, 1); d < dayOf(1778, 6, 1); d += 3) {
        const month = dateOf(d).month;
        const snow = snowOn(p, d);
        if (snow > 0)
          expect(isWinter(p.lat, month) || month === 10, p.name).toBe(true);
        // Where the engine slows the roads for snow, the map shows snow.
        if (roadSnow(p.lat, month) && winterReach(p) > 0)
          expect(snow, `${p.name} ${month}`).toBeGreaterThan(0);
        if (roadSnow(p.lat, month))
          expect(roadFactor({ ...p }, month)).toBeGreaterThan(1);
      }
    }
  });

  test("everywhere else is untouched, all year; the chart is redrawn only when the winter changes", () => {
    const none = map.provinces.filter((p) => winterReach(p) === 0);
    expect(none.length).toBeGreaterThan(150);
    for (const p of none)
      for (let d = dayOf(1777); d < dayOf(1778); d++)
        expect(snowOn(p, d), p.name).toBe(0);
    // A handful of looks a year, not one a day.
    const keys = new Set<string>();
    let changes = 0;
    let last = "";
    for (let d = dayOf(1777); d < dayOf(1778); d++) {
      const k = seasonKeyOf(d);
      keys.add(snowKey(d));
      if (k !== last) changes++;
      last = k;
    }
    // (each hemisphere's stages, and the far north's lingering snow)
    expect(keys.size).toBeLessThanOrEqual(14);
    expect(changes).toBeLessThanOrEqual(24);
  });
});

// ---------------------------------------------------------------- a sacred place, kept or plundered

describe("Legends: a sacred place kept, or plundered", () => {
  /** A colonist of 1700 who owns Legends, at the place, having heard of it. */
  function atPlace(key: string, seed = 11, stealth = 8) {
    const g = world({
      start: 1700,
      seed,
      plans: [{ seat: "s1", name: "Alden", plan: plan({ age: 30 }) }],
    });
    setLegendsOwned(g, "s1", true);
    const life = lifeOf(g);
    const s = g.s;
    const i = LEGENDS.findIndex((d) => d.key === key);
    const def = LEGENDS[i];
    life.prov = sacredProv(g.w, def);
    life.travel = null;
    rememberRumour(g, life, i, life.prov);
    life.purse = 200;
    life.skills.stealth = stealth;
    life.events = [];
    g.takeDelta();
    return { g, s, life, def, i, n: sacredPeople(s, def) };
  }
  const dig = (g: ConquestGame, key: string) =>
    g.lifeCommand("s1", { k: "legend", act: "plunder", key } as never);

  test("only where it is, with the price on hand, never your own people's: the odds come from the table", () => {
    const { g, s, life, def } = atPlace("cahokia");
    expect(plunderCheck(s, g.w, life, "cahokia").ok).toBe(true);
    const o = plunderOdds(s, life, def);
    expect(o.cost).toBe(PLUNDER.cost);
    expect(o.pass).toBeCloseTo(checkChance(o.level + o.bonus, PLUNDER.dc), 9);
    expect(o.caught + o.empty + o.pass).toBeCloseTo(1, 9);
    expect(o.caught).toBeCloseTo((1 - o.pass) * PLUNDER.caught, 9);
    expect(o.finds.reduce((m, f) => m + f.p, 0)).toBeCloseTo(o.pass, 9);
    // Their trust earned makes it surer.
    progressOf(life, "cahokia")!.step = 2;
    expect(plunderOdds(s, life, def).bonus).toBe(2 * PLUNDER.known);
    progressOf(life, "cahokia")!.step = 0;
    life.prov = sacredProv(g.w, LEGENDS.find((d) => d.key === "kituwah")!);
    expect(plunderCheck(s, g.w, life, "cahokia").ok).toBe(false);
    life.prov = sacredProv(g.w, def);
    life.purse = PLUNDER.cost - 1;
    expect(plunderCheck(s, g.w, life, "cahokia")).toMatchObject({ ok: false });
    // A place you haven't heard of, or a legend that isn't a sacred place.
    expect(plunderCheck(s, g.w, life, "kituwah").ok).toBe(false);
    expect(plunderCheck(s, g.w, life, "fountain").ok).toBe(false);
  });

  test("dug, caught, or nothing: each exactly as the shown odds roll it, and the dice as often as the odds", () => {
    let dug = 0;
    let caught = 0;
    let empty = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { g, s, life, def, i, n } = atPlace(
        seed % 2 ? "cahokia" : "kituwah",
        seed,
        6 + (seed % 9),
      );
      const me = meOf(s, life)!;
      const o = plunderOdds(s, life, def);
      const d = ldice(s, 0x10, life.c, s.day, i);
      const pass = d.chance(o.pass);
      const find = pass ? pickFind(def.key, d.next())! : undefined;
      const coins =
        find && find.coins[1] > 0 ? d.int(find.coins[0], find.coins[1]) : 0;
      const willBeCaught = !pass && d.chance(PLUNDER.caught);
      const purse = life.purse;
      const health = life.health;
      expect(dig(g, def.key)).toBeNull();
      const x = progressOf(life, def.key)!;
      const delta = g.takeDelta();
      if (pass) {
        dug++;
        expect(x.plundered).toBe(s.day);
        expect(x.outcome).toBe(`plunder:${find!.key}`);
        expect(x.got).toBe(coins);
        expect(x.relic).toBe(find!.relic);
        expect(life.purse).toBeCloseTo(purse - PLUNDER.cost + coins, 5);
        // Remembered: on their nation, for everyone; and the world's news.
        expect(plunderedMark(s, def)).toMatchObject({ day: s.day, by: me.id });
        expect(
          (delta.events ?? []).some(
            (e) =>
              e.k === "news" && e.text.startsWith("Treasure-seekers have dug"),
          ),
        ).toBe(true);
        // Their nation thinks worse of yours, for a generation.
        const m = s.nations[n].relations[me.nation]?.find((r) =>
          r.why.startsWith("The plundering of"),
        );
        expect(m?.value).toBe(PLUNDER.people.value);
        expect(m!.until - s.day).toBeGreaterThan(PLUNDER.people.years * 360);
        // Nothing left to take, and never told of it again.
        expect(plunderCheck(s, g.w, life, def.key).ok).toBe(false);
        expect(canHear(s, g.w, life, def)).toBe(false);
        expect(life.events.some((e) => e.key === "legend-plundered")).toBe(
          true,
        );
        // Their people come for it, if anything was taken.
        expect(x.reckonDue !== undefined).toBe(coins > 0 || !!find!.relic);
      } else if (willBeCaught) {
        caught++;
        expect(x.caught).toBe(s.day);
        expect(x.cold).toBe(s.day);
        expect(life.health).toBeLessThan(health);
        expect(plunderedMark(s, def)).toBeUndefined();
        expect(
          s.nations[n].relations[me.nation]?.find((r) =>
            r.why.startsWith("Diggers caught"),
          )?.value,
        ).toBe(PLUNDER.tried.value);
        expect(plunderCheck(s, g.w, life, def.key).ok).toBe(false);
      } else {
        empty++;
        expect(x.plundered).toBeUndefined();
        expect(x.caught).toBeUndefined();
        expect(x.next).toBe(s.day + PLUNDER.retry);
        expect(life.purse).toBe(purse - PLUNDER.cost);
      }
    }
    expect(dug + caught + empty).toBe(24);
    expect(dug).toBeGreaterThan(0);
    expect(caught + empty).toBeGreaterThan(0);
    // The dice come up as often as the odds say.
    const { s, life } = atPlace("cahokia");
    for (const p of [0.25, 0.6]) {
      let hits = 0;
      const N = 4000;
      for (let k = 0; k < N; k++)
        if (
          ldice({ ...s, day: s.day + k }, 0x10, life.c, s.day + k, 3).chance(p)
        )
          hits++;
      expect(Math.abs(hits / N - p)).toBeLessThan(0.03);
    }
    // Each place's finds by their chances.
    for (const [key, finds] of Object.entries(PLUNDER_FINDS)) {
      const N = 10000;
      const counts = new Map<string, number>();
      for (let k = 0; k < N; k++) {
        const f = pickFind(key, (k + 0.5) / N)!;
        counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
      }
      for (const f of finds)
        expect(Math.abs((counts.get(f.key) ?? 0) / N - f.chance)).toBeLessThan(
          0.002,
        );
    }
  });

  /** A dig that comes off (a seed whose roll passes, with a master's stealth). */
  function plundered(key = "kituwah") {
    for (let seed = 1; seed < 60; seed++) {
      const w = atPlace(key, seed, 25);
      const o = plunderOdds(w.s, w.life, w.def);
      const d = ldice(w.s, 0x10, w.life.c, w.s.day, w.i);
      if (!d.chance(o.pass)) continue;
      const f = pickFind(key, d.next())!;
      if (f.coins[1] <= 0 && !f.relic) continue;
      expect(dig(w.g, key)).toBeNull();
      return w;
    }
    throw new Error("no dig came off");
  }

  test("remembered: every seat sees it dug, the delta and a save carry it, and later visitors find the cut", () => {
    const { g, s, life, def, n } = plundered("kituwah");
    const mine = JSON.parse(JSON.stringify(s));
    applyDelta(mine, g.takeDelta());
    expect(mine.nations[n].sacred?.kituwah?.by).toBe(meOf(s, life)!.id);
    // Your own trail's details stay yours.
    expect(lifeForOthers(life).legends).toBeUndefined();
    const g2 = new ConquestGame(g.map, JSON.parse(JSON.stringify(s)));
    expect(plunderedMark(g2.s, def)?.day).toBe(s.day);
    // An old save, with no plunder in it, loads.
    const old = JSON.parse(JSON.stringify(world({ start: 1700 }).s));
    for (const nn of old.nations) delete nn.sacred;
    expect(() => new ConquestGame(g.map, old)).not.toThrow();
  });

  test("their people come for what was taken: each way it ends", () => {
    for (const choice of [0, 1, 4]) {
      const { g, s, life, def, n } = plundered("kituwah");
      const me = meOf(s, life)!;
      const x = progressOf(life, def.key)!;
      const got = x.got ?? 0;
      life.events = [];
      x.reckonDue = s.day;
      toNextMonth(g);
      const ev = life.events.find((e) => e.key === "legend-reckoning");
      expect(ev, `choice ${choice}`).toBeDefined();
      life.purse = 300;
      const owed = amendsOf(x);
      expect(
        g.lifeCommand("s1", { k: "event", id: ev!.id, choice }),
      ).toBeNull();
      const anger = () =>
        s.nations[n].relations[me.nation]?.find(
          (r) => r.why === `The plundering of ${def.name.replace(/,.*$/, "")}`,
        )?.value;
      if (choice === 0) {
        expect(x.reckoned).toBe("returned");
        expect(x.relic).toBeUndefined();
        expect(life.purse).toBeCloseTo(300 - got, 5);
        expect(anger()).toBe(RECKONING.eased.value);
      } else if (choice === 1) {
        expect(x.reckoned).toBe("paid");
        expect(life.purse).toBeCloseTo(300 - owed, 5);
        expect(anger()).toBe(PLUNDER.people.value);
      } else {
        expect(x.reckoned).toBe("lost");
        expect(x.relic).toBeUndefined();
        expect(life.purse).toBeLessThan(300);
      }
    }
  });

  test("keeping faith still pays: the walk with an elder, their goodwill, and the promise kept", () => {
    const { g, s, life, def, i, n } = atPlace("cahokia", 7);
    const me = meOf(s, life)!;
    life.skills.persuasion = 25;
    life.skills.faith = 25;
    const x = progressOf(life, "cahokia")!;
    for (let step = 0; step < def.steps.length; step++) {
      // Each step where it's worked, on a day whose roll passes.
      let guard = 0;
      for (;;) {
        x.next = s.day;
        const at = [...Array(s.provinces.length).keys()].find((p) => {
          life.prov = p;
          return (
            g.lifeCommand !== undefined &&
            (step === def.steps.length - 1
              ? p === sacredProv(g.w, def)
              : s.provinces[p].owner === n)
          );
        });
        life.prov = at!;
        const before = x.step;
        g.lifeCommand("s1", {
          k: "legend",
          act: "work",
          key: "cahokia",
        } as never);
        if (x.step > before || x.found !== undefined) break;
        x.tries = 0;
        g.tick();
        expect(++guard).toBeLessThan(200);
      }
    }
    expect(x.found).toBeDefined();
    expect(x.plundered).toBeUndefined();
    const good = s.nations[n].relations[me.nation]?.find((r) =>
      r.why.startsWith("Walked"),
    );
    expect(good?.value).toBe(KEPT_FAITH.value);
    // Kept: nothing dug, and nobody can dig it while... it's still there to dig for another.
    expect(plunderedMark(s, def)).toBeUndefined();
    void i;
  });
});
