// Walking about a place (r21): the nav grid, A* around furniture and
// walls, no cutting corners, smoothing, and the places that can't be
// reached. BFIX (r23): the furniture's blocks come from the pieces
// themselves, and no path, rounded as the world walks it, goes through any.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { navFor, NavGrid, P, pathLength } from "../../src/based/engine/Nav";
import { PlaceDef, Rect } from "../../src/based/engine/Place";
import { polyDist, solids } from "../../src/based/engine/Solid";
import { roundCorners } from "../../src/based/engine/Walk";

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
    // Two blocks touching at a corner leave no gap to squeeze through:
    // BFIX (r23) he goes as near as he can, on his own side.
    const blocks: Rect[] = [
      [0, 0, 5, 5],
      [5, 5, 10, 10],
    ];
    const g = new NavGrid([0, 0, 10, 10], 0.5, blocks);
    const p = g.path([7.5, 2.5], [2.5, 7.5])!;
    const end = p[p.length - 1];
    expect(end[0]).toBeGreaterThan(5);
    expect(end[1]).toBeLessThan(5);
    expect(allClear(g, p)).toBe(true);
  });

  test("a place walled off: he goes as near as he can get", () => {
    const g = new NavGrid([0, 0, 10, 10], 0.25, [
      [6, 6, 10, 6.3],
      [6, 6, 6.3, 10],
    ]);
    const p = g.path([1, 1], [8, 8])!;
    const end = p[p.length - 1];
    // Outside the walls, at the corner nearest the point he wanted.
    expect(end[0] < 6 || end[1] < 6).toBe(true);
    expect(Math.hypot(end[0] - 8, end[1] - 8)).toBeLessThan(3.3);
    expect(allClear(g, p)).toBe(true);
    // Nowhere at all to go: null.
    const shut = new NavGrid([0, 0, 2, 2], 0.25, [[0, 0, 2, 2]]);
    expect(shut.path([1, 1], [1.5, 1.5])).toBeNull();
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

// --- BFIX (r23): nothing walks through anything ------------------------------

const PLACES: Record<string, PlaceDef> = Object.fromEntries(
  ["street", "vauban", "elysee"].map((k) => [
    k,
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, `../../src/based/places/${k}.json`),
        "utf8",
      ),
    ) as PlaceDef,
  ]),
);

/** A seeded sequence, so the walks are the same every run. */
function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Every point along a path, every 5 cm (the corners rounded, as the world walks it). */
function along(nav: NavGrid, pts: P[]): P[] {
  const curve = roundCorners(pts, (a, b) => nav.clear(a, b));
  const out: P[] = [];
  for (let k = 1; k < curve.length; k++) {
    const [a, b] = [curve[k - 1], curve[k]];
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05),
    );
    for (let i = 0; i <= n; i++) {
      out.push([
        a[0] + ((b[0] - a[0]) * i) / n,
        a[1] + ((b[1] - a[1]) * i) / n,
      ]);
    }
  }
  return out;
}

/** The worst a path comes to any solid piece, as a share of its margin. */
function closest(
  nav: NavGrid,
  path: P[],
  solid: ReturnType<typeof solids>,
): { share: number; what: string } {
  let share = Infinity;
  let what = "";
  // Each piece's box, grown by its margin, to skip the far ones quickly.
  const boxes = solid.map((s) => {
    const xs = s.poly.map((p) => p[0]);
    const zs = s.poly.map((p) => p[1]);
    return [
      Math.min(...xs) - s.margin,
      Math.min(...zs) - s.margin,
      Math.max(...xs) + s.margin,
      Math.max(...zs) + s.margin,
    ];
  });
  for (const q of along(nav, path)) {
    solid.forEach((s, i) => {
      const b = boxes[i];
      if (q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) return;
      const k = polyDist(q, s.poly) / s.margin;
      if (k < share) {
        share = k;
        what = s.what;
      }
    });
  }
  return { share, what };
}

describe("the walking grid from the pieces (r23)", () => {
  test("every solid piece blocks, flat things don't; the hand-written blocks are walls", () => {
    const v = PLACES.vauban;
    const nav = navFor(v);
    const solid = solids(v);
    const what = new Set(solid.map((s) => s.what));
    for (const w of [
      "stoolBar",
      "tableRound",
      "chair",
      "loungeChair",
      "coatRackStanding",
      "pottedPlant",
      "bar",
      "backbar",
      // r25: the lobby's front desk and the staircase (Furnish.ts).
      "desk",
      "stairs",
      "rope",
      "machine",
      "standjar",
      // (r26: the lost-property tray under the stairs is gone.)
      "coats",
    ]) {
      expect(what.has(w), w).toBe(true);
    }
    // The middle of each is blocked.
    for (const s of solid) {
      const cx = s.poly.reduce((a, p) => a + p[0], 0) / s.poly.length;
      const cz = s.poly.reduce((a, p) => a + p[1], 0) / s.poly.length;
      expect(nav.walkable(cx, cz), `${s.what} at ${cx},${cz}`).toBe(false);
    }
    // The rug, the footprints, the lobby's carpet: walked on.
    expect(what.has("rugDoormat")).toBe(false);
    expect(nav.walkable(4.8, 2.45)).toBe(true);
    const street = solids(PLACES.street).map((s) => s.what);
    for (const w of [
      "van",
      "sedan",
      "bench",
      "trashcan",
      "lamppost",
      "morrisColumn",
      "kiosk",
      "moped",
      "postbox",
      "aframe",
      "bollard",
    ]) {
      expect(street, w).toContain(w);
    }
    // No puddles, glows, drains or kerbs.
    for (const w of ["puddle", "glow", "streak", "grate", "litter", "note"]) {
      expect(street, w).not.toContain(w);
    }
    // What's still written by hand is only walls: thin, or along an edge.
    for (const p of Object.values(PLACES)) {
      for (const [x0, z0, x1, z1] of p.nav.blocks) {
        expect(Math.min(x1 - x0, z1 - z0), `${p.key} block`).toBeLessThan(0.9);
      }
    }
  });

  test.each(["street", "vauban", "elysee"])(
    "%s: no path crosses anything solid",
    (key) => {
      const p = PLACES[key];
      const nav = navFor(p);
      const solid = solids(p);
      const r = lcg(key.length * 7919);
      const [x0, z0, x1, z1] = p.nav.bounds;
      let walks = 0;
      for (let i = 0; i < 160; i++) {
        const a: P = [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)];
        const b: P = [x0 + r() * (x1 - x0), z0 + r() * (z1 - z0)];
        if (!nav.walkable(a[0], a[1])) continue;
        const path = nav.path(a, b);
        if (!path) continue;
        walks++;
        const c = closest(nav, path, solid);
        // Kept clear by at least half its margin, everywhere.
        expect(
          c.share,
          `${key}: ${a} to ${b} passes through the ${c.what}`,
        ).toBeGreaterThanOrEqual(0.5);
      }
      expect(walks).toBeGreaterThan(20);
    },
  );

  test.each(["street", "vauban"])(
    "%s: everyone's walks between marks keep off the furniture",
    (key) => {
      const p = PLACES[key];
      const nav = navFor(p);
      const solid = solids(p);
      const marks = Object.entries(p.marks).filter(([, m]) => !m.seat);
      for (const [na, a] of marks) {
        for (const [nb, b] of marks.slice(0, 12)) {
          const path = nav.path(a.at, b.at)!;
          expect(path, `${na} to ${nb}`).not.toBeNull();
          const c = closest(nav, path, solid);
          expect(c.share, `${na} to ${nb}: ${c.what}`).toBeGreaterThanOrEqual(
            0.5,
          );
        }
      }
    },
  );

  test("a click on a stool or a car walks him to the nearest point he can reach", () => {
    const v = PLACES.vauban;
    const nav = navFor(v);
    const stool = solids(v).find((s) => s.what === "stoolBar")!;
    const at: P = [
      stool.poly.reduce((a, p) => a + p[0], 0) / stool.poly.length,
      stool.poly.reduce((a, p) => a + p[1], 0) / stool.poly.length,
    ];
    const p = nav.path([0.2, -0.6], at)!;
    const end = p[p.length - 1];
    expect(nav.walkable(end[0], end[1])).toBe(true);
    expect(Math.hypot(end[0] - at[0], end[1] - at[1])).toBeLessThan(0.7);
    const s = PLACES.street;
    const sn = navFor(s);
    const q = sn.path([19, 4.3], [-19, 6.8])!; // the middle of the van
    const qe = q[q.length - 1];
    expect(sn.walkable(qe[0], qe[1])).toBe(true);
    expect(Math.hypot(qe[0] + 19, qe[1] - 6.8)).toBeLessThan(1.6);
    // Behind the bar is reached round one of its ends, not over it.
    const behind = nav.path([0.2, -0.6], [-1, -3.78])!;
    expect(behind[behind.length - 1]).toEqual([-1, -3.78]);
    expect(behind.some((x) => x[0] > 4.0 || x[0] < -5.6)).toBe(true);
  });

  test("the same grid, and the same answers, every time", () => {
    const a = navFor(PLACES.street);
    const b = navFor(PLACES.street);
    expect(a.path([19, 4.3], [-17.5, 13.6])).toEqual(
      b.path([19, 4.3], [-17.5, 13.6]),
    );
  });
});
