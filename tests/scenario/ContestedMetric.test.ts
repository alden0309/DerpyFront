// SCEN (r25): the balance runs' "how contested was it" numbers.

import { describe, expect, it } from "vitest";
import { contestedStats, leaderOf } from "./ContestedMetric";

const s = (minute: number, a: number, b: number) => ({
  minute,
  progress: { A: a, B: b },
});

describe("the contested metric", () => {
  it("finds the leader, with near-ties as no leader", () => {
    expect(leaderOf({ A: 0.3, B: 0.1 })).toBe("A");
    expect(leaderOf({ A: 0.1, B: 0.102 })).toBeNull();
    expect(leaderOf({ A: -0.2, B: -0.1 })).toBe("B");
  });

  it("dates the decision from when the winner took the lead for good", () => {
    const samples = [
      s(0, 0, 0),
      s(1, 0.1, 0),
      s(2, 0, 0.2), // B leads
      s(3, 0.3, 0), // A again
      s(4, 0, 0.1), // B
      s(5, 0, 0.4),
      s(6, 0, 0.9),
    ];
    const c = contestedStats(samples, "B", 6.5);
    expect(c.decidedMinute).toBe(4);
    expect(c.decidedFraction).toBeCloseTo(4 / 6.5);
    // A, B, A, B: three changes.
    expect(c.leadChanges).toBe(3);
  });

  it("a game the winner led throughout is decided at minute 0", () => {
    const c = contestedStats([s(0, 0.1, 0), s(1, 0.5, 0)], "A", 2);
    expect(c.decidedMinute).toBe(0);
    expect(c.leadChanges).toBe(0);
  });

  it("a winner that never led at the end was decided at the end", () => {
    const c = contestedStats([s(0, 0, 0.1), s(1, 0, 0.5)], "A", 3);
    expect(c.decidedMinute).toBe(3);
    expect(c.decidedFraction).toBe(1);
  });

  it("no winner, no decision", () => {
    const c = contestedStats([s(0, 0.1, 0), s(1, 0, 0.5)], null, 3);
    expect(c.decidedMinute).toBeNull();
    expect(c.leadChanges).toBe(1);
  });
});
