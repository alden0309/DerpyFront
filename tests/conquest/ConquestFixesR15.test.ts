// FIXES (r15): the owner's questions, and what was put right. Polls are
// counted at the turn of the month, so the dates shown are the day of the
// count; friendships no longer end without a word; a teacher who was a
// friend is a friend again after.

import { describe, expect, test } from "vitest";
import {
  dateOf,
  formatDate,
  isMonthStart,
  pollDay,
} from "../../src/conquest/engine/Calendar";
import { kill } from "../../src/conquest/engine/Characters";
import {
  doInteraction,
  interactionView,
} from "../../src/conquest/engine/Interactions";
import { setTie } from "../../src/conquest/engine/LifeCore";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { ensureOffices } from "../../src/conquest/engine/Offices";
import { charName } from "../../src/conquest/engine/Queries";
import type { Character } from "../../src/conquest/engine/Types";
import { lifeOf, plan, ticks, world } from "./LifeUtil";

describe("FIXES r15: elections are shown on the day they're counted", () => {
  test("pollDay is the first of the month on or after the day", () => {
    for (let d = 33000; d < 33800; d += 7) {
      const p = pollDay(d);
      expect(isMonthStart(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(d);
      expect(p - d).toBeLessThan(31);
      // Nothing between the day and the count is a month's first day.
      for (let x = d; x < p; x++) expect(isMonthStart(x)).toBe(false);
    }
  });

  test("the assembly's election is held on the day shown, mid-month due dates included", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const n = meOf(g.s, life)!.nation;
    const pol = g.s.polities[n];
    // Due on the 14th of next month.
    const due = pollDay(g.s.day + 1) + 13;
    expect(dateOf(due).day).toBe(14);
    pol.election = due;
    const shown = pollDay(pol.election);
    let held = -1;
    for (let i = 0; i < 80 && held < 0; i++) {
      g.tick();
      if (pol.election !== due) held = g.s.day;
    }
    expect(held).toBe(shown);
    expect(formatDate(held)).toMatch(/^1 /);
  });

  test("a county poll is held on the day shown", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const burgess = ensureOffices(g, life.prov).find(
      (o) => o.key === "selectman" || o.key === "burgess",
    )!;
    const due = pollDay(g.s.day + 1) + 20;
    burgess.election = due;
    const shown = pollDay(due);
    let held = -1;
    for (let i = 0; i < 80 && held < 0; i++) {
      g.tick();
      if (burgess.election !== due) held = g.s.day;
    }
    expect(held).toBe(shown);
  });

  test("standing for the assembly names the day of the count, not the month before", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 80;
    life.renown = 40;
    const pol = g.s.polities[meOf(g.s, life)!.nation];
    // The 1st of April: the old reckoning (days / 30.42) called it March.
    pol.election = pollDay(g.s.day + 400);
    while (dateOf(pol.election).month !== 3)
      pol.election = pollDay(pol.election + 1);
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    const line = life.journal.find((j) => /put your name/.test(j.text))!.text;
    expect(line).toContain(formatDate(pol.election));
    expect(line).toContain("April");
  });

  test("standing for a county office names the day, and 1 month isn't 1 months", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 80;
    life.renown = 60;
    const office = ensureOffices(g, life.prov).find(
      (o) => o.key === "burgess",
    )!;
    office.election = pollDay(g.s.day + 20) + 3;
    const err = g.lifeCommand("s1", {
      k: "society",
      act: "stand",
      id: office.id,
    });
    expect(err).toBeNull();
    const line = life.journal.find((j) => /put your name/.test(j.text))!.text;
    expect(line).toContain(formatDate(pollDay(office.election)));
    expect(line).not.toMatch(/\b1 months\b/);
  });
});

describe("FIXES r15: friendships don't vanish without a word", () => {
  function someone(g: ReturnType<typeof world>, notId: number): Character {
    const life = lifeOf(g);
    return Object.values(g.s.chars).find(
      (c) =>
        c.alive &&
        !c.abroad &&
        c.id !== notId &&
        c.home === life.prov &&
        c.id !== meOf(g.s, life)!.spouse,
    )!;
  }

  test("a friendship that ends says so; becoming lovers doesn't", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const a = someone(g, me.id);
    setTie(g, life, a.id, "friend");
    const before = life.journal.length;
    setTie(g, life, a.id, null);
    const lines = life.journal.slice(before).map((j) => j.text);
    expect(lines).toContain(`You and ${charName(a)} are friends no longer.`);
    // Friend to rival.
    setTie(g, life, a.id, "friend");
    setTie(g, life, a.id, "rival");
    expect(life.journal[life.journal.length - 1].text).toBe(
      `${charName(a)}, once your friend, is your rival now.`,
    );
    // Friend to lover: closer, not an ending.
    setTie(g, life, a.id, "friend");
    const n = life.journal.length;
    setTie(g, life, a.id, "lover");
    expect(life.journal.length).toBe(n);
  });

  test("a friend's death is written in the journal", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const a = someone(g, me.id);
    setTie(g, life, a.id, "friend");
    kill(g, a, "a fever");
    expect(
      life.journal.some(
        (j) => j.text === `Your friend ${charName(a)} died: a fever.`,
      ),
    ).toBe(true);
    // The tie goes at the month's turn, quietly (the death has said it).
    ticks(g, 40);
    expect(life.ties[a.id]).toBeUndefined();
  });

  test("a friend who goes away for good is missed out loud", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const a = someone(g, meOf(g.s, life)!.id);
    setTie(g, life, a.id, "friend");
    g.char(a.id).abroad = true;
    ticks(g, 40);
    expect(life.ties[a.id]).toBeUndefined();
    expect(
      life.journal.some(
        (j) => j.text === `Your friend ${charName(a)} has gone away for good.`,
      ),
    ).toBe(true);
  });

  test("a friend who taught you is a friend again when you take another teacher", () => {
    const g = world({
      start: 1700,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 20 }) }],
    });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    // Two of the town who could teach you, and think the world of you.
    const teachers = Object.values(g.s.chars).filter((c) => {
      if (!c.alive || c.abroad || c.id === me.id || c.home !== life.prov)
        return false;
      g.char(c.id).memories.push({
        of: me.id,
        why: "Test",
        value: 100,
        until: 0,
      });
      return interactionView(g.s, g.w, life, c.id, "mentor").check.ok;
    });
    expect(teachers.length).toBeGreaterThanOrEqual(2);
    const [a, b] = teachers;
    // Befriended, as the interaction does it.
    expect(doInteraction(g, life, a.id, "befriend")).toBeNull();
    expect(life.ties[a.id]).toBe("friend");
    const before = life.journal.length;
    expect(doInteraction(g, life, a.id, "mentor")).toBeNull();
    expect(life.ties[a.id]).toBe("mentor");
    // Becoming your teacher isn't the end of a friendship.
    expect(
      life.journal.slice(before).some((j) => /friends no longer/.test(j.text)),
    ).toBe(false);
    // Another teacher: the old one goes back to being a friend.
    expect(doInteraction(g, life, b.id, "mentor")).toBeNull();
    expect(life.ties[b.id]).toBe("mentor");
    expect(life.ties[a.id]).toBe("friend");
  });
});
