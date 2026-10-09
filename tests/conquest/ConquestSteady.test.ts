// Lists that hold still while the world ticks: people keep their places,
// newcomers take a faded place or join at the end, and nothing closes up
// under the pointer.

import { describe, expect, test } from "vitest";
import {
  FADE_MS,
  FOLD_MS,
  forgetSteady,
  GRACE_MS,
  holdList,
  steady,
  steadySet,
} from "../../src/conquest/client/ui/Steady";

const ids = (rows: { key: number | string; state: string }[]) =>
  rows.map((r) => `${r.key}${r.state === "here" ? "" : `:${r.state}`}`);

const run = (items: number[], now: number, scope = "tavern") =>
  ids(steady("t", scope, items, (x) => x, now));

describe("steady lists", () => {
  test("people keep their places; newcomers go at the end", () => {
    forgetSteady();
    expect(run([1, 2, 3], 0)).toEqual(["1", "2", "3"]);
    // The world re-sorts them: the list doesn't.
    expect(run([3, 1, 2], 100)).toEqual(["1", "2", "3"]);
    expect(run([4, 3, 1, 2], 200)).toEqual(["1", "2", "3", "4:new"]);
    expect(run([4, 3, 1, 2], 2000)).toEqual(["1", "2", "3", "4"]);
  });

  test("a leaver stays a moment, fades, and their place is taken by the next to come", () => {
    forgetSteady();
    run([1, 2, 3], 0);
    // Out and back within the grace: as if never gone.
    expect(run([1, 3], 100)).toEqual(["1", "2", "3"]);
    expect(run([1, 2, 3], 300)).toEqual(["1", "2", "3"]);
    // Gone for good: faded, still in place.
    run([1, 3], 1000);
    expect(run([1, 3], 1000 + GRACE_MS + 10)).toEqual(["1", "2:leaving", "3"]);
    // Someone new comes before the fade is over: they go at the end.
    expect(run([1, 3, 4], 1000 + GRACE_MS + 20)).toEqual([
      "1",
      "2:leaving",
      "3",
      "4:new",
    ]);
    // Later, the next newcomer takes the faded place (nobody below moves).
    const t = 1000 + GRACE_MS + FADE_MS + 50;
    expect(run([1, 3, 4, 5], t)).toEqual(["1", "5:new", "3", "4"]);
  });

  test("a faded place nobody takes folds away, but not while the pointer is in the list", () => {
    forgetSteady();
    run([1, 2, 3], 0);
    run([1, 3], 10);
    holdList("t", true);
    const t = 10 + GRACE_MS + FADE_MS + 100;
    expect(run([1, 3], t)).toEqual(["1", "2:leaving", "3"]);
    expect(run([1, 3], t + 5000)).toEqual(["1", "2:leaving", "3"]);
    // Let go: it folds, then it's gone.
    holdList("t", false);
    expect(run([1, 3], t + 5010)).toEqual(["1", "2:folding", "3"]);
    expect(run([1, 3], t + 5020 + FOLD_MS)).toEqual(["1", "3"]);
  });

  test("a faded place at the end simply goes", () => {
    forgetSteady();
    run([1, 2, 3], 0);
    run([1, 2], 10);
    expect(run([1, 2], 20 + GRACE_MS + FADE_MS)).toEqual(["1", "2"]);
  });

  test("another place (or another visit) starts afresh", () => {
    forgetSteady();
    run([1, 2, 3], 0);
    run([3, 2, 1, 4], 100);
    expect(run([3, 2, 1, 4], 200, "church")).toEqual(["3", "2", "1", "4"]);
  });

  test("buttons once shown stay while you look; new ones go at the end", () => {
    forgetSteady();
    expect(steadySet("acts", "a", ["drink", "dice"])).toEqual([
      "drink",
      "dice",
    ]);
    expect(steadySet("acts", "a", ["dice", "fight"])).toEqual([
      "drink",
      "dice",
      "fight",
    ]);
    expect(steadySet("acts", "b", ["fight"])).toEqual(["fight"]);
  });
});
