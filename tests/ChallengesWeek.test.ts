// CHAL (r25): the challenge week (Monday to Monday, New York time, through
// daylight saving) and the week's picks (the same for everyone, mixed
// tiers, never repeating the week before or after).

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import {
  CHALLENGE_BONUS,
  CHALLENGE_BY_KEY,
  CHALLENGE_COINS,
  CHALLENGE_GAMES,
  CHALLENGE_TIERS,
  challengesFor,
  CONQUEST_CHALLENGES,
  FRONT_ALTS,
  FRONT_CHALLENGES,
  poolOf,
  progressUnits,
  timeLeftWords,
  weekChallenges,
  weekEnd,
  weekMonday,
  weekOf,
  weekStart,
} from "../src/derpland/Challenges";

const H = 3_600_000;
const D = 24 * H;
const at = (iso: string) => new Date(iso).getTime();

describe("the challenge week", () => {
  test("runs Monday 00:00 to Monday 00:00 in New York", () => {
    // Monday 19 October 2026, 00:00 EDT is 04:00 UTC.
    const mon = at("2026-10-19T04:00:00Z");
    const w = weekOf(mon);
    expect(weekStart(w)).toBe(mon);
    expect(weekOf(mon - 1000)).toBe(w - 1);
    expect(weekOf(mon + 7 * D - 1000)).toBe(w);
    expect(weekMonday(w)).toBe("2026-10-19");
    // Sunday 23:59 in New York is already Monday in UTC: still last week.
    expect(weekOf(at("2026-10-19T03:59:00Z"))).toBe(w - 1);
    // Monday 01:00 UTC is still Sunday evening in New York.
    expect(weekOf(at("2026-10-19T01:00:00Z"))).toBe(w - 1);
  });

  test("moves with daylight saving: a week of 167 hours in March, 169 in November", () => {
    // DST began Sunday 8 March 2026: the week from 2 March (EST) to 9 March (EDT).
    const m2 = at("2026-03-02T05:00:00Z");
    const m9 = at("2026-03-09T04:00:00Z");
    const w = weekOf(m2);
    expect(weekStart(w)).toBe(m2);
    expect(weekEnd(w)).toBe(m9);
    expect(m9 - m2).toBe(7 * D - H);
    expect(weekOf(m9 - 1)).toBe(w);
    expect(weekOf(m9)).toBe(w + 1);
    // The hour that doesn't exist (02:00-03:00 on 8 March) is still that week.
    expect(weekOf(at("2026-03-08T07:30:00Z"))).toBe(w);

    // DST ended Sunday 1 November 2026: 26 October (EDT) to 2 November (EST).
    const o26 = at("2026-10-26T04:00:00Z");
    const n2 = at("2026-11-02T05:00:00Z");
    const v = weekOf(o26);
    expect(weekStart(v)).toBe(o26);
    expect(weekEnd(v)).toBe(n2);
    expect(n2 - o26).toBe(7 * D + H);
    expect(weekOf(n2 - 1)).toBe(v);
    expect(weekOf(n2)).toBe(v + 1);
    // 01:30 twice on 1 November: both that week.
    expect(weekOf(at("2026-11-01T05:30:00Z"))).toBe(v);
    expect(weekOf(at("2026-11-01T06:30:00Z"))).toBe(v);
  });

  test("weeks follow on, every Monday at midnight New York time, for years", () => {
    let w = weekOf(at("2025-01-06T12:00:00Z"));
    for (let i = 0; i < 260; i++, w++) {
      const s = weekStart(w);
      expect(weekEnd(w)).toBe(weekStart(w + 1));
      expect(weekOf(s)).toBe(w);
      expect(weekOf(s - 1)).toBe(w - 1);
      const local = new Date(s).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      expect(local).toBe("Mon 00:00");
      expect([7 * D - H, 7 * D, 7 * D + H]).toContain(weekEnd(w) - s);
    }
  });

  test("time left in words", () => {
    expect(timeLeftWords(3 * D + 4 * H + 5 * 60_000)).toBe("3 days 4 h left");
    expect(timeLeftWords(D)).toBe("1 day left");
    expect(timeLeftWords(5 * H + 12 * 60_000)).toBe("5 h 12 min left");
    expect(timeLeftWords(12 * 60_000 + 30_000)).toBe("12 min left");
    expect(timeLeftWords(10_000)).toBe("Ending now");
  });
});

describe("the week's challenges", () => {
  test("pools of at least 20 a game, every tier in each, keys unique", () => {
    for (const game of CHALLENGE_GAMES) {
      const pool = poolOf(game);
      expect(pool.length).toBeGreaterThanOrEqual(20);
      for (const t of CHALLENGE_TIERS)
        expect(pool.filter((d) => d.tier === t).length).toBeGreaterThanOrEqual(
          5,
        );
      expect(pool.every((d) => d.game === game)).toBe(true);
    }
    const keys = [...FRONT_CHALLENGES, ...FRONT_ALTS, ...CONQUEST_CHALLENGES];
    expect(new Set(keys.map((d) => d.key)).size).toBe(keys.length);
    expect(CHALLENGE_BY_KEY.size).toBe(keys.length);
    // Nothing for Mr. Based.
    expect(keys.some((d) => /based/i.test(`${d.key} ${d.name}`))).toBe(false);
  });

  test("DerpyFront's (shown on its win screen) have their names in en.json", () => {
    const en = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "resources", "lang", "en.json"),
        "utf8",
      ),
    ) as { derpy: Record<string, string> };
    for (const d of [...FRONT_CHALLENGES, ...FRONT_ALTS])
      expect(en.derpy[`challenge_${d.key}`], d.key).toBe(d.name);
  });

  test("pay about 100, 175 and 250, with 150 for all three", () => {
    expect(CHALLENGE_COINS).toEqual({ easy: 100, medium: 175, hard: 250 });
    expect(CHALLENGE_BONUS).toBe(150);
  });

  test("the same picks for the same week, one of each tier", () => {
    const w = weekOf(at("2026-10-21T15:00:00Z"));
    for (const game of CHALLENGE_GAMES) {
      const a = weekChallenges(w, game);
      expect(a.map((d) => d.tier)).toEqual(["easy", "medium", "hard"]);
      expect(weekChallenges(w, game).map((d) => d.key)).toEqual(
        a.map((d) => d.key),
      );
    }
  });

  test("no week repeats its neighbours', and each run deals the whole pool", () => {
    const from = weekOf(at("2026-01-05T12:00:00Z"));
    for (const game of CHALLENGE_GAMES) {
      let last: string[] = [];
      const seen = new Map<string, number>();
      for (let w = from; w < from + 400; w++) {
        const keys = weekChallenges(w, game).map((d) => d.key);
        for (const k of keys) {
          expect(last).not.toContain(k);
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
        last = keys;
      }
      // Over 400 weeks every challenge comes up, about as often as its tier allows.
      for (const d of poolOf(game)) {
        const n = poolOf(game).filter((x) => x.tier === d.tier).length;
        expect(seen.get(d.key) ?? 0).toBeGreaterThanOrEqual(
          Math.floor(400 / n) - 1,
        );
      }
    }
  });

  test("an account without AI personalities gets the stand-in", () => {
    const w0 = weekOf(at("2026-01-05T12:00:00Z"));
    let w = w0;
    while (!weekChallenges(w, "derpyfront").some((d) => d.key === "df-ai-win"))
      w++;
    expect(w - w0).toBeLessThan(20);
    const owner = challengesFor(w, "derpyfront", { aiPersonality: true });
    const other = challengesFor(w, "derpyfront", { aiPersonality: false });
    expect(owner.map((d) => d.key)).toContain("df-ai-win");
    expect(other.map((d) => d.key)).toContain("df-win-long");
    expect(other.map((d) => d.key)).not.toContain("df-ai-win");
    expect(other.find((d) => d.key === "df-win-long")!.tier).toBe("hard");
    // Conquest needs nothing from the store.
    expect(CONQUEST_CHALLENGES.some((d) => d.needs)).toBe(false);
  });

  test("progress in whole units", () => {
    const hour = CHALLENGE_BY_KEY.get("cq-hour")!;
    expect(progressUnits(hour, 59 * 60 + 59)).toEqual({ have: 59, of: 60 });
    expect(progressUnits(hour, 99_999)).toEqual({ have: 60, of: 60 });
    const years = CHALLENGE_BY_KEY.get("cq-30-years")!;
    expect(progressUnits(years, 365 * 12 + 200)).toEqual({ have: 12, of: 30 });
  });
});
