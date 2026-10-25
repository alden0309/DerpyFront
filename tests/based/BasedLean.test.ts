// BSTORY (r26): "the bartender is leaning against the air not the bar." Every
// lean in the story lands with the forearms on the counter in front of the
// mark: elbows at its edge (within a few centimetres), hands on the top, the
// forearms' underside at the top's height (after the few centimetres the
// world lowers them by), the body clear of the edge (no clipping), and the
// spot somewhere he can walk to. And the story waits for the moves it asks
// for (engine/Moves.ts, client/Hold.ts): nothing advances while someone's
// on the way, and a stuck walk is finished so it can't hold the game.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { BeatHold, HOLD_POLL } from "../../src/based/client/Hold";
import {
  counters,
  customerSpot,
  LEAN_CLEAR,
  LEAN_FALLBACK,
  leanSpot,
  serveSpot,
} from "../../src/based/engine/Lean";
import { moveLimit, MoveWatch } from "../../src/based/engine/Moves";
import { navFor } from "../../src/based/engine/Nav";
import { PlaceDef } from "../../src/based/engine/Place";
import { parseChapter } from "../../src/based/engine/Script";
import { Op } from "../../src/based/engine/Types";
import { Walker } from "../../src/based/engine/Walk";

const ROOT = path.resolve(__dirname, "../..");
const PLACES: Record<string, PlaceDef> = Object.fromEntries(
  fs
    .readdirSync(path.join(ROOT, "src/based/places"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(
        fs.readFileSync(path.join(ROOT, "src/based/places", f), "utf8"),
      ) as PlaceDef,
    ]),
);
const { chapter } = parseChapter(
  fs.readFileSync(path.join(ROOT, "src/based/story/chapter-01.story"), "utf8"),
);

/** Every `@actor X mark lean` in the story, with the place it's in. */
function leans(): { scene: string; who: string; at: string; place: string }[] {
  const out: { scene: string; who: string; at: string; place: string }[] = [];
  for (const id of chapter.order) {
    let place: string | null = chapter.scenes[id].trigger?.place ?? null;
    for (const op of chapter.scenes[id].ops as Op[]) {
      if (op.op === "place" && op.key) place = op.key;
      if (op.op !== "actor" || op.state?.pose !== "lean") continue;
      const p =
        op.state.place ??
        place ??
        Object.keys(PLACES).find((k) => PLACES[k].marks[op.state!.at]);
      out.push({ scene: id, who: op.who, at: op.state.at, place: p! });
    }
  }
  return out;
}

/** Distance from a point to the line through two points. */
function toLine(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  return Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / Math.hypot(dx, dz);
}

describe("leaning on the counter (r26)", () => {
  const all = leans();

  test("the story's leans are the barman's, behind the bar", () => {
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(new Set(all.map((l) => l.who))).toEqual(new Set(["BARMAN"]));
    expect(new Set(all.map((l) => l.at))).toEqual(
      new Set(["behind_bar", "behind_bar_far"]),
    );
  });

  test("every lean puts his forearms on the counter top, his body clear of its edge", () => {
    const shape = LEAN_FALLBACK;
    for (const l of all) {
      const def = PLACES[l.place];
      const m = def.marks[l.at];
      const face = ((m.face ?? 0) * Math.PI) / 180;
      const s = leanSpot(def, m.at[0], m.at[1], face, shape);
      expect(s, `${l.scene}: ${l.at}`).not.toBeNull();
      const f: [number, number] = [Math.sin(s!.face), Math.cos(s!.face)];
      const ahead = (d: number): [number, number] => [
        s!.x + f[0] * d,
        s!.z + f[1] * d,
      ];
      const edge = s!.edge;
      // Which side of the edge a point is: + over the top, - his side.
      const side = (p: [number, number]) =>
        (p[0] - edge[0][0]) * f[0] + (p[1] - edge[0][1]) * f[1];
      // His body stops just short of the edge: no clipping into the counter.
      expect(side(ahead(shape.front)), l.at).toBeCloseTo(-LEAN_CLEAR, 3);
      // His elbows at the edge, within a few centimetres...
      expect(toLine(ahead(shape.elbow), edge[0], edge[1]), l.at).toBeLessThan(
        0.05,
      );
      // ...and his forearms and hands on the top, well in from the edge.
      expect(side(ahead(shape.elbow + 0.2)), l.at).toBeGreaterThan(0.1);
      const c = counters(def)[0];
      expect(side(ahead(shape.elbow + 0.2))).toBeLessThan(c.front - c.back);
      // At the top's height: what the world lowers him by is a few cm.
      expect(Math.abs(s!.top - shape.y), l.at).toBeLessThan(0.06);
      // He can walk there, and stands square on to the counter.
      expect(navFor(def).walkable(s!.x, s!.z), l.at).toBe(true);
      expect(Math.abs(Math.sin(s!.face - face))).toBeLessThan(0.01);
    }
  });

  test("the marks were too far back: that was the air he leant on", () => {
    // Before r26 he leant where the mark is: half a metre short of the edge.
    const def = PLACES.vauban;
    const m = def.marks.behind_bar;
    const c = counters(def)[0];
    const edgeZ = c.z + c.back;
    const elbowsAtMark = m.at[1] - LEAN_FALLBACK.feet + LEAN_FALLBACK.elbow;
    expect(edgeZ - elbowsAtMark).toBeGreaterThan(0.4);
  });

  test("no counter in front, no lean spot (he leans where the mark is)", () => {
    const def = PLACES.vauban;
    // Facing away from the bar, or far from it.
    expect(leanSpot(def, -1, -3.78, Math.PI, LEAN_FALLBACK)).toBeNull();
    expect(leanSpot(def, -1, 2.5, Math.PI, LEAN_FALLBACK)).toBeNull();
  });
});

describe("the barman comes over when Mr. Based talks to him (r26)", () => {
  const def = PLACES.vauban;
  const c = counters(def)[0];
  const from = def.marks.behind_bar.at;
  const nav = navFor(def);
  const edgeZ = c.z + c.back;

  test("in front of every stool at the bar, his arms on the counter, facing him", () => {
    const stools = Object.entries(def.marks).filter(([k]) => /^stool_/.test(k));
    expect(stools.length).toBeGreaterThanOrEqual(11);
    for (const [k, m] of stools) {
      const s = serveSpot(def, from, m.at, LEAN_FALLBACK);
      expect(s, k).not.toBeNull();
      // Straight across from the stool (or as near as the counter's end
      // lets his arms stay on it), on his side of the counter.
      const across = Math.max(
        c.x - c.len / 2 + 0.35,
        Math.min(c.x + c.len / 2 - 0.35, m.at[0]),
      );
      expect(s!.x, k).toBeCloseTo(across, 5);
      expect(Math.abs(s!.x - m.at[0]), k).toBeLessThan(0.3);
      expect(s!.z, k).toBeLessThan(edgeZ);
      // Leaning: body clear of the edge, elbows at it, facing the stool.
      expect(s!.z + LEAN_FALLBACK.front, k).toBeCloseTo(edgeZ - LEAN_CLEAR, 3);
      expect(Math.abs(s!.z + LEAN_FALLBACK.elbow - edgeZ), k).toBeLessThan(
        0.05,
      );
      expect(Math.cos(s!.face)).toBeCloseTo(1, 3);
      expect(s!.top).toBe(c.top);
      // Within reach of the stool across the counter.
      expect(m.at[1] - s!.z, k).toBeLessThan(1.4);
      // And his way there is clear, all of it behind the bar.
      expect(nav.walkable(s!.x, s!.z), k).toBe(true);
      const path = nav.path(from, [s!.x, s!.z]);
      expect(path, k).not.toBeNull();
      for (const pt of path!) expect(pt[1], k).toBeLessThan(edgeZ);
    }
  });

  test("from wherever he is now (after the man in grey, down the bar)", () => {
    const far = def.marks.behind_bar_far.at;
    const m = def.marks.stool_8.at;
    const s = serveSpot(def, far, m, LEAN_FALLBACK)!;
    expect(Math.abs(s.x - m[0])).toBeLessThan(0.01);
    expect(nav.path(far, [s.x, s.z])).not.toBeNull();
  });

  test("Mr. Based at a table: the end of the bar nearest him", () => {
    for (const k of ["couple_m", "reader_chair", "corner_seat", "booth"]) {
      const m = def.marks[k];
      if (!m) continue;
      const s = serveSpot(def, from, m.at, LEAN_FALLBACK)!;
      expect(s, k).not.toBeNull();
      const ends = [c.x - c.len / 2 + 0.35, c.x + c.len / 2 - 0.35];
      const nearest = Math.max(ends[0], Math.min(ends[1], m.at[0]));
      expect(s.x, k).toBeCloseTo(nearest, 5);
      expect(nav.walkable(s.x, s.z), k).toBe(true);
    }
  });

  test("going up to him, Mr. Based keeps to his own side of the bar", () => {
    const frontZ = c.z + c.front;
    for (const at of [
      [4.8, 2.3], // in from the street
      [-3.6, 2.0], // the reader's armchair
      [10.6, 0.4], // the lobby
    ] as [number, number][]) {
      const s = customerSpot(def, from, at, (x, z) => nav.walkable(x, z))!;
      expect(s, `${at}`).not.toBeNull();
      expect(s.z, `${at}`).toBeGreaterThan(frontZ);
      expect(s.z - frontZ, `${at}`).toBeLessThan(1.2);
      expect(nav.walkable(s.x, s.z)).toBe(true);
      expect(Math.cos(s.face)).toBeCloseTo(-1, 3);
      // His way there never goes round behind the bar.
      const p = nav.path(at, [s.x, s.z]);
      expect(p, `${at}`).not.toBeNull();
      for (const pt of p!) expect(pt[1], `${at}`).toBeGreaterThan(edgeZ);
    }
  });

  test("not from in front of the bar, or from the lobby", () => {
    expect(serveSpot(def, [-1, -1.9], [-1, -1.9], LEAN_FALLBACK)).toBeNull();
    expect(serveSpot(def, [10, 0], [-1, -1.9], LEAN_FALLBACK)).toBeNull();
  });

  test("every conversation with him is a talk to the barman (so he comes)", () => {
    const talks = chapter.order.filter(
      (id) =>
        chapter.scenes[id].trigger?.on === "talk" &&
        chapter.scenes[id].trigger?.target === "BARMAN",
    );
    expect(talks).toEqual(
      expect.arrayContaining(["order", "anselme_after", "anselme_idle"]),
    );
    const player = fs.readFileSync(
      path.join(ROOT, "src/based/client/Player.ts"),
      "utf8",
    );
    expect(player).toMatch(/this\.serving = this\.bodyOf\(who\)/);
    expect(player).toMatch(/this\.world\?\.serve\(this\.serving\)/);
  });
});

describe("the story waits for the moves it asks for (r26)", () => {
  /** A hand-cranked timer for the hold. */
  function timers() {
    const due: { id: number; fn: () => void }[] = [];
    let next = 1;
    return {
      t: {
        set: (fn: () => void, ms: number) => {
          expect(ms).toBe(HOLD_POLL);
          due.push({ id: next, fn });
          return next++;
        },
        clear: (id: number) => {
          const i = due.findIndex((d) => d.id === id);
          if (i >= 0) due.splice(i, 1);
        },
      },
      tick: () => due.splice(0).forEach((d) => d.fn()),
    };
  }

  test("a line waits while someone's on the way, and appears when they're there", () => {
    let walking = true;
    const shown: string[] = [];
    const { t, tick } = timers();
    const hold = new BeatHold<string>(
      () => walking,
      (b) => shown.push(b),
      t,
    );
    hold.offer("STRANGER: Un Ricard, Anselme.", true);
    // Held: not shown, and nothing may move the story on.
    expect(hold.held).toBe(true);
    expect(shown).toEqual([]);
    tick();
    tick();
    expect(hold.held).toBe(true);
    // He's sat down: the line comes.
    walking = false;
    tick();
    expect(hold.held).toBe(false);
    expect(shown).toEqual(["STRANGER: Un Ricard, Anselme."]);
  });

  test("not held: nobody moving, the free world or the end, or a loaded game", () => {
    const shown: string[] = [];
    const { t } = timers();
    let walking = false;
    const hold = new BeatHold<string>(
      () => walking,
      (b) => shown.push(b),
      t,
    );
    hold.offer("a line", true);
    walking = true;
    hold.offer("free", false);
    hold.offer("loaded", true, true);
    expect(shown).toEqual(["a line", "free", "loaded"]);
    expect(hold.held).toBe(false);
  });

  test("a stuck walk is finished on time, so it can't hold the story", () => {
    const w = new MoveWatch();
    w.start("STRANGER", 0, 3);
    const limit = moveLimit(3);
    expect(limit).toBeGreaterThan(3 / 1.3);
    // On the way: busy.
    expect(w.check(1, () => true)).toEqual({ busy: true, overdue: [] });
    // There: let go of.
    w.start("WOMAN", 0, 3);
    expect(w.check(2, (id) => id === "STRANGER")).toEqual({
      busy: true,
      overdue: [],
    });
    // Still walking long after he should be there: overdue, finished, gone.
    expect(w.check(limit + 0.1, () => true)).toEqual({
      busy: false,
      overdue: ["STRANGER"],
    });
    expect(w.size).toBe(0);
    // A walker told to finish is at the path's end, facing where he was going.
    const k = new Walker(0, 0, 0);
    k.go(
      [
        [2, 0],
        [2, 3],
      ],
      undefined,
      Math.PI,
    );
    k.step(0.1);
    k.finish();
    expect(k.moving).toBe(false);
    expect([k.x, k.z]).toEqual([2, 3]);
    expect(k.heading).toBeCloseTo(Math.PI);
  });

  test("every walk the story asks for is one the world watches", () => {
    // The scripted moves of chapter one: the man in grey sitting down and
    // leaving, the contact coming over and going, the barman down the bar,
    // the clerk to the rope and back, Mr. Based to his stool, the desk, the
    // bed. Each goes through World.moveActor's walk, which watches it.
    const walks: string[] = [];
    for (const id of chapter.order) {
      for (const op of chapter.scenes[id].ops as Op[]) {
        if (op.op === "actor" && op.walk)
          walks.push(`${op.who} ${op.state?.at}`);
      }
    }
    expect(walks).toEqual(
      expect.arrayContaining([
        "STRANGER stool_10",
        "STRANGER lobby_far",
        "WOMAN stool_10",
        "WOMAN street_cross",
        "BARMAN behind_bar_far",
        "PORTER rope_spot",
        "PORTER porter_spot",
        "BASED stool_end",
      ]),
    );
    const world = fs.readFileSync(
      path.join(ROOT, "src/based/client/world/World.ts"),
      "utf8",
    );
    // Both of moveActor's walks (to a mark, out of a door) are watched, and
    // the barman's coming over to serve him.
    expect(world.match(/this\.watchMove\(id, p0?\)/g)?.length).toBe(3);
  });
});
