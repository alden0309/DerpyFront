// FIXES (r15): the owner's questions, and what was put right. Polls are
// counted at the turn of the month, so the dates shown are the day of the
// count; friendships no longer end without a word; a teacher who was a
// friend is a friend again after.

import { describe, expect, test } from "vitest";
import {
  CameraKeys,
  PAN_FAST,
  PAN_PACE,
  panDir,
  panStep,
  typing,
  type Pannable,
} from "../../src/conquest/client/CameraKeys";
import {
  noteDiceActs,
  storyLines,
  tableStory,
} from "../../src/conquest/client/ui/DiceLog";
import { ACHIEVEMENTS } from "../../src/conquest/engine/Achievements";
import { presentAt } from "../../src/conquest/engine/Areas";
import {
  dateOf,
  formatDate,
  isMonthStart,
  pollDay,
} from "../../src/conquest/engine/Calendar";
import { kill } from "../../src/conquest/engine/Characters";
import {
  MEASURES,
  seatCouncillor,
  settleMatter,
} from "../../src/conquest/engine/Council";
import { cede } from "../../src/conquest/engine/Crown";
import { sitAcceptance } from "../../src/conquest/engine/DiceAi";
import { tablesOf } from "../../src/conquest/engine/DiceCore";
import {
  doInteraction,
  interactionView,
} from "../../src/conquest/engine/Interactions";
import { LEAD_DEFS } from "../../src/conquest/engine/Leads";
import { gainXp, setTie } from "../../src/conquest/engine/LifeCore";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import {
  ensureOffices,
  localOfficesOf,
} from "../../src/conquest/engine/Offices";
import { charName } from "../../src/conquest/engine/Queries";
import type { Character } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, ticks, world } from "./LifeUtil";

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

describe("FIXES r15: W A S D and the arrows move the camera", () => {
  class FakeMap implements Pannable {
    moved: [number, number][] = [];
    screenSize = { width: 1440, height: 900 };
    panBy(dx: number, dy: number): void {
      this.moved.push([dx, dy]);
    }
    get total(): [number, number] {
      return this.moved.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0] as [
        number,
        number,
      ]);
    }
  }
  const key = (
    type: "keydown" | "keyup",
    code: string,
    o: KeyboardEventInit = {},
    target: EventTarget = window,
  ) => {
    const e = new KeyboardEvent(type, {
      code,
      bubbles: true,
      cancelable: true,
      ...o,
    });
    target.dispatchEvent(e);
    return e;
  };
  /** Hold for `ms` in frames of 16 ms. */
  const hold = (k: CameraKeys, map: FakeMap, ms: number) => {
    let t = performance.now();
    for (let i = 0; i < ms / 16; i++) {
      t += 16;
      k.step(t, map);
    }
  };

  test("each key moves the camera its way (the map slides the other)", () => {
    const k = new CameraKeys(() => false);
    k.attach();
    const cases: [string, number, number][] = [
      ["KeyD", -1, 0],
      ["ArrowRight", -1, 0],
      ["KeyA", 1, 0],
      ["ArrowLeft", 1, 0],
      ["KeyW", 0, 1],
      ["ArrowUp", 0, 1],
      ["KeyS", 0, -1],
      ["ArrowDown", 0, -1],
    ];
    for (const [code, sx, sy] of cases) {
      const map = new FakeMap();
      const e = key("keydown", code);
      expect(e.defaultPrevented).toBe(true);
      expect(k.moving).toBe(true);
      hold(k, map, 400);
      key("keyup", code);
      expect(k.moving).toBe(false);
      const [x, y] = map.total;
      expect(Math.sign(Math.round(x))).toBe(sx);
      expect(Math.sign(Math.round(y))).toBe(sy);
    }
    k.detach();
  });

  test("diagonals no faster than straight; Shift goes faster; a short ramp", () => {
    const [x1, y1] = panStep(1, 0, 0.1, 1, false, 1440, 900);
    const [x2, y2] = panStep(1, 1, 0.1, 1, false, 1440, 900);
    expect(Math.hypot(x2, y2)).toBeCloseTo(Math.hypot(x1, y1), 6);
    const [xf] = panStep(1, 0, 0.1, 1, true, 1440, 900);
    expect(xf / x1).toBeCloseTo(PAN_FAST, 6);
    // Full pace: PAN_PACE screen widths a second.
    expect(x1).toBeCloseTo(PAN_PACE * 1440 * 0.1, 6);
    const [x0] = panStep(1, 0, 0.1, 0, false, 1440, 900);
    expect(x0).toBeLessThan(x1);
    expect(x0).toBeGreaterThan(0);
  });

  test("left alone while typing, while a window is open, and with Ctrl or Cmd", () => {
    let blocked = false;
    const k = new CameraKeys(() => blocked);
    k.attach();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const e = key("keydown", "KeyW", {}, input);
    expect(e.defaultPrevented).toBe(false);
    expect(k.moving).toBe(false);
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    key("keydown", "ArrowUp", {}, area);
    expect(k.moving).toBe(false);
    expect(typing(input)).toBe(true);
    expect(typing(document.body)).toBe(false);
    // Ctrl-S, Cmd-A: the browser's.
    key("keydown", "KeyS", { ctrlKey: true });
    key("keydown", "KeyA", { metaKey: true });
    expect(k.moving).toBe(false);
    // A window open: nothing moves, and a key held when it opens lets go.
    blocked = true;
    key("keydown", "KeyD");
    expect(k.moving).toBe(false);
    blocked = false;
    key("keydown", "KeyD");
    expect(k.moving).toBe(true);
    blocked = true;
    const map = new FakeMap();
    hold(k, map, 100);
    expect(map.moved.length).toBe(0);
    expect(k.moving).toBe(false);
    // Losing the window's focus lets go too.
    blocked = false;
    key("keydown", "KeyD");
    window.dispatchEvent(new Event("blur"));
    expect(k.moving).toBe(false);
    // Other keys are none of its business.
    expect(panDir("Space")).toBeNull();
    expect(panDir("KeyQ")).toBeNull();
    input.remove();
    area.remove();
    k.detach();
  });
});

describe("FIXES r15: the Liar's dice log keeps the whole table's story", () => {
  test("every round, bid, call and reveal, oldest first, beyond the server's last 90 moves", () => {
    const g = world({
      start: 1700,
      seed: 5,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: prov("Jamestown"), background: "clerk" }),
        },
      ],
    });
    g.aiEnabled = false;
    const life = lifeOf(g);
    const here = () =>
      presentAt(g.s, g.w, life.prov, "tavern", g.s.day, life)
        .filter((x) => x.kind !== "player")
        .map((x) => g.s.chars[x.c]);
    for (let i = 0; i < 120 && here().length < 5; i++) {
      g.tick();
      life.events = [];
    }
    life.events = [];
    life.purse = 300;
    life.area = "tavern";
    const folk = here();
    for (const c of folk)
      g.char(c.id).memories.push({
        of: life.c,
        why: "Test",
        value: 90,
        until: 0,
      });
    const ask = folk
      .filter((c) => sitAcceptance(g.s, life, c, 5).total > 0)
      .slice(0, 5)
      .map((c) => c.id);
    expect(ask.length).toBeGreaterThanOrEqual(3);
    const cmd = (c: object) =>
      g.lifeCommand(life.seat, { k: "dice", ...c } as never);
    expect(cmd({ act: "open", stake: 5, ask })).toBeNull();
    const t = tablesOf(g.s).find((x) => x.status === "open")!;
    expect(cmd({ act: "start", id: t.id })).toBeNull();
    // As the browser does: note the table after every change.
    noteDiceActs(g.s);
    for (let i = 0; i < 900 && t.status === "playing"; i++) {
      expect(cmd({ act: "auto", id: t.id })).toBeNull();
      noteDiceActs(g.s);
    }
    expect(t.status).toBe("done");
    // The server kept only the last 90; the log has them all from the first.
    const story = tableStory(t);
    expect(t.acts.length).toBeLessThanOrEqual(90);
    expect(story[0].n).toBe(1);
    expect(story.length).toBeGreaterThan(t.acts.length);
    for (let i = 1; i < story.length; i++)
      expect(story[i].n).toBe(story[i - 1].n + 1);
    const lines = storyLines(t, story, Infinity, life.c, (c) =>
      charName(g.s.chars[c]),
    );
    // Oldest first, ending with the pot.
    for (let i = 1; i < lines.length; i++)
      expect(lines[i].n).toBeGreaterThan(lines[i - 1].n);
    expect(lines[lines.length - 1].kind).toBe("win");
    expect(lines[lines.length - 1].text).toMatch(/the pot of \d+\./);
    // A round line for every round rolled, saying who opened it.
    const rounds = lines.filter((l) => l.kind === "round");
    expect(rounds.length).toBe(t.round);
    expect(rounds[0].text).toMatch(/^Round 1: .* opens?, \d+ dice/);
    // Every call has its reveal and its outcome, in plain words.
    const reveals = story.filter((a) => a.k === "reveal");
    const said = lines.filter((l) => l.kind === "reveal");
    expect(said.length).toBe(reveals.length);
    reveals.forEach((r, i) => {
      const caller = r.c === life.c ? "You" : charName(g.s.chars[r.c]);
      // EVENTS (r21): the town's people may say "Spot on!" instead of Liar!.
      if (r.spot) {
        expect(said[i].text.startsWith(`${caller} called `)).toBe(true);
        expect(said[i].text).toMatch(
          /spot on: .* showing.*\. (Exactly|Not exact)[:(. ].*\.\)?$/,
        );
        expect(said[i].text.includes("Exactly")).toBe(
          (r.count ?? 0) === r.bid!.q,
        );
        return;
      }
      expect(said[i].text.startsWith(`${caller} called Liar! on `)).toBe(true);
      expect(said[i].text).toMatch(
        /showing.*\. (The bid stands|A lie): .* (loses|lose) a die\.$/,
      );
      const stands = (r.count ?? 0) >= r.bid!.q;
      expect(said[i].text.includes("The bid stands")).toBe(stands);
    });
    // Every bid is there, by name.
    expect(lines.filter((l) => l.kind === "bid").length).toBe(
      story.filter((a) => a.k === "bid").length,
    );
    // Played back only as far as the table has been shown.
    const mid = story[Math.floor(story.length / 2)].n;
    expect(
      storyLines(t, story, mid, life.c, (c) => charName(g.s.chars[c])).every(
        (l) => l.n <= mid,
      ),
    ).toBe(true);
  });
});

describe("FIXES r15: what the political playthrough turned up", () => {
  test("a county office lost to conquest is told to the player who held it", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const list = ensureOffices(g, life.prov);
    const o = list.find((x) => x.key === "warden" || x.key === "constable")!;
    o.holder = life.c;
    const enemy = g.s.nations.findIndex((x) => x.key === "france");
    cede(g, life.prov, enemy);
    ensureOffices(g, life.prov);
    const adj = g.s.nations[enemy].adjective;
    expect(
      life.journal.some((j) =>
        new RegExp(
          `is in ${adj} hands now: your place as .* has lapsed\\.$`,
        ).test(j.text),
      ),
    ).toBe(true);
    expect(localOfficesOf(g.s, life.c).length).toBe(0);
  });

  test("council measures keep their proper names, and say when a carried one can't be done", () => {
    const g = world({ start: 1700 });
    const s = g.s;
    const life = lifeOf(g);
    const n = meOf(s, life)!.nation;
    seatCouncillor(g, n, "spymaster", life.c, "test");
    const o = s.nations.findIndex((x) => x.kind === "native" && x.alive);
    const title = MEASURES.presents.title(g, n, o);
    const matter = (id: number) => ({
      id,
      key: "presents",
      title,
      text: "",
      by: s.nations[n].ruler,
      arg: o,
      day: s.day,
      until: s.day,
      votes: {},
      status: "open" as "open" | "carried" | "lost",
      undone: undefined as string | undefined,
    });
    g.nation(n).gold = 0;
    const m1 = matter(1);
    settleMatter(g, n, m1, true, 5, 1);
    // The chamber shows it: carried, not done, and why.
    expect(m1.status).toBe("lost");
    expect(m1.undone).toBe("The treasury can't spare it.");
    const undone = life.journal[life.journal.length - 1].text;
    expect(undone).toBe(
      `The council carries presents for the ${s.nations[o].name} (5 to 1), but it can't be done: the treasury can't spare it.`,
    );
    g.nation(n).gold = 100;
    settleMatter(g, n, matter(2), true, 6, 0);
    const done = life.journal[life.journal.length - 1].text;
    expect(
      done.startsWith(
        `The council carries presents for the ${s.nations[o].name} (6 to 0).`,
      ),
    ).toBe(true);
    // A proper name keeps its capital.
    expect(s.nations[o].name.charAt(0)).toBe(
      s.nations[o].name.charAt(0).toUpperCase(),
    );
  });

  test("“Elected” is paid for winning a poll, not for an appointment to the council", () => {
    const g = world({ start: 1700 });
    const s = g.s;
    const life = lifeOf(g);
    const elected = ACHIEVEMENTS.find((a) => a.name === "Elected")!;
    const n = meOf(s, life)!.nation;
    seatCouncillor(g, n, "spymaster", life.c, "test");
    expect(life.tally.topOffice).toBeGreaterThanOrEqual(1);
    expect(elected.check(g, life)).toBe(false);
    life.tally.elections = 1;
    expect(elected.check(g, life)).toBe(true);
  });

  test("your letters have grown (not has); your trade has", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    gainXp(g, life, "letters", 400);
    gainXp(g, life, "trade", 400);
    const texts = life.journal.map((j) => j.text);
    expect(
      texts.some((x) => /^Your letters have grown to \d+\.$/.test(x)),
    ).toBe(true);
    expect(texts.some((x) => /^Your trade has grown to \d+\.$/.test(x))).toBe(
      true,
    );
  });

  test("the Harpe brothers have robbed the post road (not has)", () => {
    const says = LEAD_DEFS.outlaw.says[0];
    expect(says("Hochelaga", "the Harpe brothers")).toMatch(
      /^the Harpe brothers have robbed/,
    );
    expect(says("Hochelaga", "Molly Raike")).toMatch(/^Molly Raike has robbed/);
  });
});
