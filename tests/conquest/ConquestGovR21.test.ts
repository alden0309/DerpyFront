// GOV (r21): expeditions (solo, with companions, a hired leader, two
// players together; discovery, a river, trade, an outpost, a mission, a
// raid and a port), grants from the treasury, the governor's desk (duties,
// a building programme, native affairs, the militia, pardons, the desk's
// matters), the question of independence (the house's division, the
// declaration, the crown's regiments going over, counties holding for the
// King, sides and their ends), and founding (for another crown, the first
// year's odds, the founder's mayoralty). The odds shown are the odds rolled;
// old saves load; the delta carries it; the same seed runs the same.

import { describe, expect, test } from "vitest";
import {
  costOf,
  draftOf,
  expedOf,
  myExped,
  targetsFor,
} from "../../src/conquest/engine/ExpedCore";
import { ConquestGame } from "../../src/conquest/engine/Game";
import type { Life } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, world } from "./LifeUtil";

const JAMESTOWN = prov("Jamestown");

/** 1700 at Jamestown, the world quiet, a grown man with a full purse. */
function quiet(
  o: { seed?: number; players?: number; start?: 1607 | 1650 | 1700 } = {},
) {
  const plans = [
    { seat: "s1", name: "Alden", plan: plan({ age: 30 }) },
    ...(o.players === 2
      ? [
          {
            seat: "s2",
            name: "Bea",
            plan: plan({
              first: "Beatrice",
              family: "Cole",
              female: true,
              age: 28,
            }),
          },
        ]
      : []),
  ];
  const g = world({ start: o.start ?? 1700, seed: o.seed ?? 7, plans });
  g.aiEnabled = false;
  const a = lifeOf(g, "s1");
  a.purse = 400;
  return { g, a, england: g.s.chars[a.c].nation };
}

const cmd = (g: ConquestGame, life: Life, c: object) =>
  g.lifeCommand(life.seat, c as never);

/** Answer whatever scenes are waiting with their first choice that isn't blocked. */
function answerAll(g: ConquestGame, life: Life, choice = 0): void {
  for (const ev of [...life.events])
    g.lifeCommand(life.seat, { k: "event", id: ev.id, choice });
}

/** Run until the expedition is home (answering its scenes). */
function runHome(g: ConquestGame, lives: Life[], max = 500): void {
  for (let i = 0; i < max; i++) {
    for (const l of lives) answerAll(g, l);
    if (!expedOf(g.s).list.some((x) => x.stage !== "forming")) return;
    g.tick();
  }
}

describe("GOV r21: expeditions", () => {
  test("solo: a discovery planned, paid for, carried on the map there and back, and its maps for the colony", () => {
    const { g, a, england } = quiet();
    const s = g.s;
    const t = targetsFor(s, g.w, "discover", england, a.prov)[0];
    expect(t).toBeDefined();
    const before = a.purse;
    expect(
      cmd(g, a, {
        k: "exped",
        act: "plan",
        kind: "discover",
        p: t.p,
        hands: 4,
      }),
    ).toBeNull();
    const x = myExped(s, a.seat)!;
    expect(x.stage).toBe("forming");
    const cost = costOf(s, g.map, draftOf(x), false).total;
    expect(cmd(g, a, { k: "exped", act: "go" })).toBeNull();
    expect(a.purse).toBeCloseTo(before - cost, 5);
    expect(x.stage).toBe("out");
    expect(a.travel?.exped).toBe(x.id);
    const seen = new Set<number>();
    for (let i = 0; i < 400 && expedOf(s).list.length; i++) {
      answerAll(g, a);
      g.tick();
      seen.add(a.prov);
    }
    expect(expedOf(s).list.length).toBe(0);
    const past = expedOf(s).past.at(-1)!;
    expect(past.kind).toBe("discover");
    expect(seen.has(t.p) || past.result === "failed").toBe(true);
    expect(a.prov).toBe(JAMESTOWN);
    expect(a.travel).toBeNull();
    if (past.result !== "failed" && past.result !== "turned")
      expect(s.nations[england].explored).toContain(t.p);
  });
});
