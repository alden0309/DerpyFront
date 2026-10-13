// SITE (r19): what a watcher of a Derpy Conquest game is sent. A watcher
// holds no seat, so it gets the view of nobody's seat: every per-seat
// redaction (the dice, intrigue, labour, the polls, bonds, the crown's
// petition) composed, and nothing any player keeps to themselves.

import { describe, expect, test } from "vitest";
import { labourStateForSeat } from "../../src/conquest/engine/BondCore";
import { crownStateForSeat } from "../../src/conquest/engine/CrownCore";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { stateForSeat } from "../../src/conquest/engine/DiceCore";
import { stateForIntrigue } from "../../src/conquest/engine/IntrigueCore";
import { loanStateForSeat } from "../../src/conquest/engine/LoanCore";
import type { GameState } from "../../src/conquest/engine/Types";
import {
  deltaForViewer,
  deltaForWatcher,
  deltaIsPerViewer,
  stateForViewer,
  stateForWatcher,
} from "../../src/conquest/engine/Viewers";
import { plan, prov, world } from "./LifeUtil";
import { plantSecrets, SECRET, secretsIn } from "./WatchUtil";

function twoPlayers() {
  const g = world({
    start: 1650,
    plans: [
      { seat: "s1", name: "Alden", plan: plan() },
      {
        seat: "s2",
        name: "Hal",
        plan: plan({ first: "Hal", family: "Cole", home: prov("Jamestown") }),
      },
    ],
  });
  g.takeDelta(); // the beginning, sent with the first state
  return g;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("a watcher's view of a Conquest game (SITE r19)", () => {
  test("the planted secrets are real: s1 sees its own, s2 sees none of them", () => {
    const g = twoPlayers();
    plantSecrets(g);
    expect(JSON.stringify(stateForViewer(g.s, "s1"))).toContain(SECRET);
    const theirs = stateForViewer(g.s, "s2");
    expect(
      JSON.stringify(theirs.lives.find((l) => l.seat === "s1")),
    ).not.toContain(SECRET);
  });

  test("on arriving, a watcher is sent nobody's secrets", () => {
    const g = twoPlayers();
    plantSecrets(g);
    const seen = stateForWatcher(g.s);
    expect(secretsIn(seen)).toEqual([]);
    // The world itself is all there.
    expect(seen.lives.map((l) => l.seat)).toEqual(["s1", "s2"]);
    expect(seen.provinces.length).toBe(g.s.provinces.length);
    expect(seen.armies.length).toBe(g.s.armies.length);
    expect(seen.dice?.tables[0].seats.map((x) => x.n)).toEqual([3, 2, 3]);
    // ...and the game's own state is untouched.
    expect(secretsIn(g.s).length).toBeGreaterThan(5);
  });

  test("it's the most redacted view: no one redaction would take anything more out", () => {
    const g = twoPlayers();
    plantSecrets(g);
    const seen = stateForWatcher(g.s);
    const again: ((s: GameState) => GameState)[] = [
      (s) => stateForSeat(s, null),
      (s) => stateForIntrigue(s, null),
      (s) => labourStateForSeat(s, null),
      (s) => loanStateForSeat(s, null),
      (s) => crownStateForSeat(s, null),
    ];
    for (const f of again) expect(clone(f(seen))).toEqual(clone(seen));
    // And it holds no more than either player is sent of the other.
    for (const seat of ["s1", "s2"]) {
      const theirs = stateForViewer(g.s, seat);
      for (const l of seen.lives)
        if (l.seat !== seat)
          expect(clone(l)).toEqual(
            clone(theirs.lives.find((x) => x.seat === l.seat)),
          );
    }
  });

  test("each change is sent without anyone's secrets", () => {
    const g = twoPlayers();
    plantSecrets(g);
    const d = g.takeDelta();
    expect(deltaIsPerViewer(d)).toBe(true);
    const json = JSON.stringify(deltaForWatcher(g.s, d));
    expect(json).not.toContain(SECRET);
    const w = deltaForWatcher(g.s, d);
    expect(w.dice?.tables.every((t) => t.rng === 0)).toBe(true);
    expect(
      w.dice?.tables.every((t) => t.seats.every((x) => x.dice.length === 0)),
    ).toBe(true);
    expect(w.dice?.tables.every((t) => t.tells.length === 0)).toBe(true);
    expect(w.intrigue?.schemes).toEqual([]);
    expect(w.intrigue?.kept).toEqual([]);
    expect(w.intrigue?.guards).toEqual({});
    expect(w.loans?.list).toEqual([]);
    expect(w.crown?.asks).toEqual([]);
    expect(w.crown?.past).toEqual([]);
    // The player whose secrets they are still gets them.
    expect(JSON.stringify(deltaForViewer(g.s, d, "s1"))).toContain(SECRET);
  });

  test("a watcher's copy, kept by its own deltas, never holds a secret", () => {
    const g = twoPlayers();
    const mine = clone(stateForWatcher(g.s));
    for (let day = 0; day < 40; day++) {
      if (day === 10) plantSecrets(g);
      g.tick();
      applyDelta(mine, deltaForWatcher(g.s, g.takeDelta()));
      expect(secretsIn(mine)).toEqual([]);
    }
    expect(mine.day).toBe(g.s.day);
  });

  test("and it stays the same world as the server's (just without the secrets)", () => {
    const g = twoPlayers();
    const mine = clone(stateForWatcher(g.s));
    for (let day = 0; day < 120; day++) {
      g.tick();
      applyDelta(mine, deltaForWatcher(g.s, g.takeDelta()));
    }
    const truth = clone(stateForWatcher(g.s));
    expect(mine.lives.map((l) => [l.seat, l.c, l.watching])).toEqual(
      truth.lives.map((l) => [l.seat, l.c, l.watching]),
    );
    expect(clone(mine.lives)).toEqual(truth.lives);
    expect(clone(mine.armies)).toEqual(truth.armies);
    expect(clone(mine.nations)).toEqual(truth.nations);
  });
});
