// DFSTORE (r21): the gold display's average income per 10 seconds.

import { describe, expect, test } from "vitest";
import {
  GOLD_RATE_MIN_TICKS,
  GOLD_RATE_WINDOW_TICKS,
  GoldPer10s,
} from "../../src/client/hud/layers/lib/GoldPer10s";

describe("gold per 10 seconds", () => {
  test("nothing until there are five seconds to average", () => {
    const g = new GoldPer10s();
    expect(g.per10s()).toBeNull();
    g.record(0, 0);
    expect(g.per10s()).toBeNull();
    g.record(GOLD_RATE_MIN_TICKS - 1, 4000);
    expect(g.per10s()).toBeNull();
    g.record(GOLD_RATE_MIN_TICKS, 5000);
    // 5000 gold in 5 seconds: 10,000 per 10 seconds.
    expect(g.per10s()).toBe(10_000);
  });

  test("a steady income reads steadily", () => {
    const g = new GoldPer10s();
    // 300 gold a second, sampled every tick for two minutes.
    for (let t = 0; t <= 1200; t++) g.record(t, t * 30);
    expect(g.per10s()).toBeCloseTo(3000, 6);
  });

  test("it averages over the last minute, not the whole game", () => {
    const g = new GoldPer10s();
    // A minute at 100 a second, then a minute at 1,000 a second.
    for (let t = 0; t <= 600; t++) g.record(t, t * 10);
    for (let t = 601; t <= 1200; t++) g.record(t, 6000 + (t - 600) * 100);
    expect(g.per10s()).toBeCloseTo(10_000, 0);
    expect(GOLD_RATE_WINDOW_TICKS).toBe(600);
  });

  test("lumpy income (a trade ship now and then) is smoothed", () => {
    const g = new GoldPer10s();
    let earned = 0;
    for (let t = 0; t <= 900; t++) {
      if (t % 150 === 0) earned += 15_000; // a ship every 15 seconds
      g.record(t, earned);
    }
    // 15,000 every 15 s is 10,000 per 10 s; a minute holds four arrivals.
    const v = g.per10s()!;
    expect(v).toBeGreaterThan(9000);
    expect(v).toBeLessThan(11_000);
  });

  test("a paused game holds its figure; a new game starts again", () => {
    const g = new GoldPer10s();
    for (let t = 0; t <= 300; t++) g.record(t, t * 50);
    const before = g.per10s();
    for (let i = 0; i < 50; i++) g.record(300, 300 * 50);
    expect(g.per10s()).toBe(before);
    g.record(10, 0); // ticks went back: another game
    expect(g.per10s()).toBeNull();
  });
});
