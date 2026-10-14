// Walking about a place (r21): the nav grid, A* around furniture and
// walls, no cutting corners, smoothing, and the places that can't be
// reached.

import { describe, expect, test } from "vitest";
import { NavGrid, P, pathLength } from "../../src/based/engine/Nav";
import { Rect } from "../../src/based/engine/Place";

/** A 10 x 10 room with a wall across the middle, open at the right end. */
function room(): NavGrid {
  return new NavGrid([0, 0, 10, 10], 0.25, [[0, 4.9, 8, 5.1]]);
}

function allClear(g: NavGrid, path: P[]): boolean {
  for (let k = 1; k < path.length; k++) {
    if (!g.clear(path[k - 1], path[k])) return false;
  }
  return true;
}

describe("the nav grid", () => {
  test("a straight walk when nothing is in the way", () => {
    const g = room();
    const p = g.path([1, 1], [7, 3])!;
    expect(p).toEqual([
      [1, 1],
      [7, 3],
    ]);
  });

  test("around a wall, through the gap, in straight lines", () => {
    const g = room();
    const p = g.path([1, 2], [1, 8])!;
    expect(p).not.toBeNull();
    expect(p[0]).toEqual([1, 2]);
    expect(p[p.length - 1]).toEqual([1, 8]);
    // It goes round the end of the wall (x > 8), not through it.
    expect(Math.max(...p.map((q) => q[0]))).toBeGreaterThan(8);
    expect(allClear(g, p)).toBe(true);
    // Smoothed: a handful of bends, not a staircase of cells.
    expect(p.length).toBeLessThanOrEqual(5);
    // And not much longer than the way round really is.
    expect(pathLength(p)).toBeLessThan(2 * Math.hypot(8, 3) + 1.5);
  });

  test("never slips diagonally between two blocked corners", () => {
    // Two blocks touching at a corner leave no gap to squeeze through.
    const blocks: Rect[] = [
      [0, 0, 5, 5],
      [5, 5, 10, 10],
    ];
    const g = new NavGrid([0, 0, 10, 10], 0.5, blocks);
    expect(g.path([7.5, 2.5], [2.5, 7.5])).toBeNull();
  });

  test("a place walled off can't be reached", () => {
    const g = new NavGrid([0, 0, 10, 10], 0.25, [
      [6, 6, 10, 6.3],
      [6, 6, 6.3, 10],
    ]);
    expect(g.path([1, 1], [8, 8])).toBeNull();
  });

  test("a click on furniture walks to the nearest free spot", () => {
    const g = new NavGrid([0, 0, 10, 10], 0.25, [[4, 4, 6, 6]]);
    const p = g.path([1, 1], [5, 5])!;
    const end = p[p.length - 1];
    expect(g.walkable(end[0], end[1])).toBe(true);
    expect(Math.hypot(end[0] - 5, end[1] - 5)).toBeLessThan(1.5);
  });

  test("the same question always gets the same answer", () => {
    const g = room();
    expect(g.path([2, 1], [3, 9])).toEqual(g.path([2, 1], [3, 9]));
  });
});
