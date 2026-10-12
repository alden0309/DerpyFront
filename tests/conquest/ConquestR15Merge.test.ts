// Round 15, where the tracks meet: nobody held in bondage or bound to service
// (LABOUR) can be courted, seduced, taken to bed or plotted against
// (INTRIGUE), nor drawn into a plot as an accomplice.

import { describe, expect, test } from "vitest";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { interactionView } from "../../src/conquest/engine/Interactions";
import { ADULT_AGE } from "../../src/conquest/engine/IntrigueCore";
import { peopleHere } from "../../src/conquest/engine/LifeQueries";
import { PLOT_METHODS, plotCheck } from "../../src/conquest/engine/Plots";
import { ageOf } from "../../src/conquest/engine/Queries";
import { seduceCheck } from "../../src/conquest/engine/Seduction";
import type {
  BondMark,
  Character,
  Life,
  PlotMethod,
} from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, world } from "./LifeUtil";

const JT = prov("Jamestown");

function solo(seed = 7): { g: ConquestGame; life: Life } {
  const g = world({
    start: 1700,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Alden",
        plan: plan({ home: JT, background: "clerk" }),
      },
    ],
  });
  return { g, life: lifeOf(g, "s1") };
}

/** A grown, unmarried woman here, not played. */
function someone(g: ConquestGame, life: Life): Character {
  const c = peopleHere(g.s, life.prov, life).find(
    (x) =>
      !g.s.lives.some((l) => l.c === x.id) &&
      x.female &&
      ageOf(g.s, x) >= ADULT_AGE &&
      ageOf(g.s, x) <= 45,
  );
  expect(c).toBeDefined();
  const sp = g.s.chars[c!.spouse];
  if (sp) sp.spouse = -1;
  c!.spouse = -1;
  life.met.push(c!.id);
  return c!;
}

function bind(
  g: ConquestGame,
  life: Life,
  c: Character,
  status: "held" | "indenture",
): void {
  c.bond = {
    status,
    seat: life.seat,
    at: life.prov,
    origin: "creole",
    faith: "own",
    health: 70,
    mood: 50,
    sk: { field: 5, house: 3, craft: 3 },
    work: "house",
    since: g.s.day - 400,
    ...(status === "indenture" ? { until: g.s.day + 4 * 365 } : {}),
  } as BondMark;
}

describe("round 15: bondage and intrigue", () => {
  for (const status of ["held", "indenture"] as const)
    test(`someone ${status === "held" ? "held in bondage" : "bound by indenture"} can't be courted, seduced or plotted against`, () => {
      const { g, life } = solo();
      const s = g.s;
      const her = someone(g, life);
      const before = seduceCheck(s, g.w, life, her);
      expect(before.ok ? "" : before.why).not.toMatch(/Not free/);
      bind(g, life, her, status);
      for (const aim of ["lover", "keep"] as const) {
        const v = seduceCheck(s, g.w, life, her, aim);
        expect(v.ok ? "" : v.why).toMatch(/Not free/);
      }
      for (const act of ["court", "propose", "tryst"] as const)
        expect(
          interactionView(s, g.w, life, her.id, act, 1).check.ok,
          act,
        ).toBe(false);
      for (const m of Object.keys(PLOT_METHODS) as PlotMethod[]) {
        const v = plotCheck(s, g.w, life, her, m);
        expect(v.ok ? "" : v.why, m).toMatch(/held or bound/);
      }
    });
});
