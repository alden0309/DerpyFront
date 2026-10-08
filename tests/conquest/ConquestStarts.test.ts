import { describe, expect, test } from "vitest";
import { dateOf } from "../../src/conquest/engine/Calendar";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { AMERICAS } from "../../src/conquest/engine/Map";
import {
  adminCapacity,
  adminUsed,
  nationSettlers,
  provincesOf,
} from "../../src/conquest/engine/Queries";
import { STARTS } from "../../src/conquest/engine/Starts";
import type { GameEvent, StartYear } from "../../src/conquest/engine/Types";

const map = AMERICAS;

function game(start: StartYear, seed = 5) {
  return ConquestGame.create(
    map,
    { endYear: 1780, difficulty: "normal", seed, start },
    [],
  );
}

const key = (g: ConquestGame, k: string) =>
  g.state.nations.findIndex((n) => n.key === k);
const name = (p: number) => map.provinces[p].name;

describe("start dates", () => {
  test("the start data only names real provinces and nations", () => {
    const names = new Set(map.provinces.map((p) => p.name));
    const keys = new Set([
      ...map.powers.map((p) => p.id),
      ...map.natives.map((n) => n.id),
    ]);
    for (const era of Object.values(STARTS)) {
      for (const [p, n] of Object.entries(era!.owners)) {
        expect(names.has(p), p).toBe(true);
        expect(keys.has(n), n).toBe(true);
      }
      for (const [n, p] of Object.entries(era!.capitals))
        expect(era!.owners[p], `${n} capital ${p}`).toBe(n);
    }
  });

  test("1650: the game begins that New Year with the colonies of the day", () => {
    const g = game(1650);
    const s = g.state;
    expect(dateOf(s.day)).toMatchObject({ year: 1650, month: 0 });
    expect(s.startDay).toBe(s.day);
    const en = key(g, "england");
    const nl = key(g, "netherlands");
    const se = key(g, "sweden");
    expect(provincesOf(s, en).length).toBeGreaterThan(15);
    expect(provincesOf(s, en).map(name)).toContain("Massachusetts Bay");
    expect(provincesOf(s, nl).map(name)).toContain("New Amsterdam");
    expect(s.nations[se].alive).toBe(true);
    // The Powhatan are gone by then.
    expect(s.nations[key(g, "powhatan")].alive).toBe(false);
    // Older colonies are bigger than a 1607 one.
    expect(nationSettlers(s, en)).toBeGreaterThan(5000);
    // People alive today were born before it.
    const gov = s.chars[s.nations[en].ruler];
    expect(s.day - gov.born).toBeGreaterThan(20 * 365);
  });

  test("1700: Sweden has no colony, England runs the coast, and the books balance", () => {
    const g = game(1700);
    const s = g.state;
    const en = key(g, "england");
    expect(s.nations[key(g, "sweden")].alive).toBe(false);
    expect(game(1650).state.nations[key(g, "sweden")].alive).toBe(true);
    expect(provincesOf(s, en).length).toBeGreaterThan(30);
    expect(provincesOf(s, en).map(name)).toContain("New Amsterdam");
    // A big old colony can govern what it starts with.
    expect(adminCapacity(s, en).total).toBeGreaterThanOrEqual(
      adminUsed(s, g.w, en).total * 0.9,
    );
  });

  test("later starts find the militia mustered at each capital", () => {
    expect(game(1607).state.armies).toHaveLength(0);
    const g = game(1700);
    const s = g.state;
    const en = key(g, "england");
    const army = s.armies.find((a) => a.owner === en);
    expect(army?.prov).toBe(s.nations[en].capital);
    expect(army!.regs.some((r) => r.type === "militia")).toBe(true);
    // England is big enough for a regiment of regulars too.
    expect(army!.regs.some((r) => r.type === "regulars")).toBe(true);
    // Every living power has one, and ids stay unique.
    for (const n of s.nations.filter((x) => x.kind === "power" && x.alive))
      expect(s.armies.some((a) => a.owner === n.id)).toBe(true);
    expect(new Set(s.armies.map((a) => a.id)).size).toBe(s.armies.length);
  });

  test("a later game runs: the War of the Spanish Succession comes on time", () => {
    const g = game(1700, 9);
    const events: GameEvent[] = [];
    for (let i = 0; i < 365 * 3; i++) {
      g.tick();
      events.push(...(g.takeDelta().events ?? []));
    }
    expect(
      events.some(
        (e) =>
          e.k === "war" &&
          e.why.startsWith("The War of the Spanish Succession"),
      ),
    ).toBe(true);
    const en = key(g, "england");
    // A history is being kept.
    expect(g.state.nations[en].yearly.length).toBeGreaterThanOrEqual(2);
    expect(g.state.nations[en].milestones.length).toBeGreaterThan(0);
  });
});
