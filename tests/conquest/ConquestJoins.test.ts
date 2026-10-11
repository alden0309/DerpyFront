// Derpy Conquest round 11, wave 2: where the four wave-1 tracks meet. Your
// people and boats are eyes in the fog; interpreters work in tongues and
// carry you across a barrier; contracts a sword can see through; and the
// joins between the law, followers, boats, leads, tongues, letters,
// gatherings, offices and settlements, through saves, heirs and takeovers.

import { describe, expect, test } from "vitest";
import { buyBoat, setCrew } from "../../src/conquest/engine/Boats";
import {
  awayEyes,
  fogDaily,
  knownOf,
  sightOf,
} from "../../src/conquest/engine/Fog";
import { seedLocals } from "../../src/conquest/engine/Folk";
import {
  candidatesAt,
  FOLLOWER_KINDS,
  hireFollower,
} from "../../src/conquest/engine/Followers";
import {
  interactionView,
  talkView,
} from "../../src/conquest/engine/Interactions";
import {
  bridgeTongues,
  interpreterStudy,
} from "../../src/conquest/engine/Interpreters";
import { letterAcceptance } from "../../src/conquest/engine/Letters";
import { touchLife } from "../../src/conquest/engine/LifeCore";
import { answerLifeEvent } from "../../src/conquest/engine/LifeEvents";
import { peopleHere } from "../../src/conquest/engine/LifeQueries";
import { lifeTonguePoints, tonguesOf } from "../../src/conquest/engine/Tongues";
import { jobGate } from "../../src/conquest/engine/Trades";
import type { Follower, Life } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, toNextMonth, world } from "./LifeUtil";

/** Clear the letters waiting (so a test isn't stopped by a stray event). */
function clearEvents(g: ReturnType<typeof world>, life: Life): void {
  for (const ev of [...life.events])
    answerLifeEvent(g, life, ev.id, ev.choices.length - 1);
}

/** Someone of the town taken into your service, as a test shortcut. */
function follower(
  g: ReturnType<typeof world>,
  life: Life,
  kind: Follower["kind"],
): Follower {
  const c = Object.values(g.s.chars).find(
    (x) =>
      x.alive &&
      !x.abroad &&
      x.id !== life.c &&
      !g.s.lives.some((l) => l.c === x.id) &&
      !(life.people ?? []).some((f) => f.c === x.id),
  )!;
  touchLife(g, life);
  const f: Follower = {
    id: g.nextId(),
    c: c.id,
    kind,
    rank: 0,
    wage: 2,
    share: 0,
    loyalty: 70,
    joined: g.s.day,
    task: null,
  };
  (life.people ??= []).push(f);
  return f;
}

describe("your people and boats are eyes in the fog", () => {
  test("a clerk trading far off sees the country round him; at your side he sees what you see", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    clearEvents(g, life);
    const far = prov("Havana");
    expect(sightOf(g.s, g.w, life).has(far)).toBe(false);
    const f = follower(g, life, "clerk");
    expect(sightOf(g.s, g.w, life).has(far)).toBe(false);
    f.task = { kind: "trade", p: far, back: g.s.day + 40, stake: 20 };
    const seen = sightOf(g.s, g.w, life);
    expect(seen.has(far)).toBe(true);
    // The country round him too.
    const nb = g.map.provinces[far].nb.filter(([, km]) => km < 150);
    for (const [q] of nb) expect(seen.has(q)).toBe(true);
    // What he sees joins your map.
    fogDaily(g);
    expect(knownOf(life).has(far)).toBe(true);
    // Back at your side: the sight goes (the map stays).
    f.task = null;
    expect(sightOf(g.s, g.w, life).has(far)).toBe(false);
    expect(knownOf(life).has(far)).toBe(true);
  });

  test("a boat with hands aboard watches her harbour; an empty one doesn't; the one you sail in is with you", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    clearEvents(g, life);
    life.purse = 500;
    expect(buyBoat(g, life, "sloop", -1)).toBeNull();
    const b = life.boats![0];
    // Leave her where she lies, and go a long way off (put down at once).
    const far = prov("Havana");
    const home = b.prov;
    life.prov = far;
    expect(sightOf(g.s, g.w, life).has(home)).toBe(false);
    expect(awayEyes(g.s, life)).toEqual([]);
    expect(setCrew(g, life, b.id, 2)).not.toBeNull(); // you're not aboard
    b.crew = 2;
    expect(awayEyes(g.s, life)).toEqual([[home, 0]]);
    expect(sightOf(g.s, g.w, life).has(home)).toBe(true);
    // A skipper aboard and no crew to speak of: still someone to look.
    b.crew = 0;
    const mate = follower(g, life, "mate");
    mate.task = { kind: "boat", p: home, back: g.s.day + 99999, boat: b.id };
    const eyes = awayEyes(g.s, life);
    expect(eyes.some(([p]) => p === home)).toBe(true);
    // The boat you're sailing in adds nothing of her own.
    mate.task = null;
    b.crew = 2;
    life.travel = {
      dest: home,
      path: [home],
      sea: [true],
      depart: g.s.day,
      arrive: g.s.day + 10,
      cost: 0,
      boat: b.id,
    };
    expect(awayEyes(g.s, life)).toEqual([]);
  });

  test("a dead follower sees nothing", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const far = prov("Havana");
    const f = follower(g, life, "rogue");
    f.task = { kind: "job", p: far, back: g.s.day + 10, what: "robbery" };
    expect(awayEyes(g.s, life)).toEqual([[far, 0]]);
    g.s.chars[f.c].alive = false;
    expect(awayEyes(g.s, life)).toEqual([]);
  });
});

describe("interpreters work in tongues", () => {
  test("the trade asks for a colonists' tongue and a native one, both to talk in", () => {
    const g = world();
    const life = lifeOf(g);
    const gate = () => jobGate(g.s, g.w, life, "interpreter");
    expect(gate().ok).toBe(false);
    const why = gate();
    expect(why.ok ? "" : why.why).toMatch(/two tongues/);
    // Persuasion and woodcraft no longer open it.
    life.skills.persuasion = 12;
    life.skills.woodcraft = 12;
    expect(gate().ok).toBe(false);
    // A few words won't do.
    life.tongues = { c: life.c, pts: { coastal: 150 } };
    expect(gate().ok).toBe(false);
    // Conversational will.
    life.tongues.pts.coastal = 210;
    expect(gate().ok).toBe(true);
    // Two European tongues aren't a bridge between peoples, nor is a jargon.
    expect(bridgeTongues({ english: 3, french: 3 })).toBeNull();
    expect(bridgeTongues({ english: 3, mobilian: 3 })).toBeNull();
    expect(bridgeTongues({ english: 3, coastal: 2 })).toEqual([
      "english",
      "coastal",
    ]);
  });

  test("a go-between starts in the trade with both tongues, and learns more at the work", () => {
    const g = world({
      plans: [
        {
          seat: "s1",
          name: "N",
          plan: plan({
            origin: "powhatan",
            home: prov("Pamunkey"),
            religion: "native",
            background: "interpreter",
            first: "Matoaka",
            family: "of the Turtle clan",
            female: true,
          }),
        },
      ],
    });
    const life = lifeOf(g);
    clearEvents(g, life);
    expect(life.job?.kind).toBe("interpreter");
    const me = g.s.chars[life.c];
    expect(bridgeTongues(tonguesOf(g.s, g.map, me))).not.toBeNull();
    expect(jobGate(g.s, g.w, life, "interpreter").ok).toBe(true);
    const study = interpreterStudy(g.s, g.map, life);
    expect(study?.tongue).toBe("english");
    const before = lifeTonguePoints(g.s, g.map, life).english;
    toNextMonth(g);
    const after = lifeTonguePoints(g.s, g.map, life).english;
    expect(after - before).toBeGreaterThan(5);
    // Away from the post, no lessons.
    life.prov = prov("Jamestown");
    expect(interpreterStudy(g.s, g.map, life)).toBeNull();
  });

  test("an interpreter hired at the governor's house speaks for you, and writes your letters", () => {
    const g = world();
    const life = lifeOf(g);
    clearEvents(g, life);
    life.purse = 50;
    life.area = "governor";
    const j = prov("Jamestown");
    expect(FOLLOWER_KINDS.interpreter.where).toContain("governor");
    const cands = candidatesAt(g.s, g.w, life, j, "governor");
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.kind === "interpreter")).toBe(true);
    expect(cands[0].note).toMatch(/speaks .*English/);
    expect(hireFollower(g, life, cands[0].slot)).toBeNull();
    const f = life.people!.find((x) => x.kind === "interpreter")!;
    const x = g.s.chars[f.c];
    expect(x.learned).toBeTruthy();
    const theirs = tonguesOf(g.s, g.map, x);
    expect(theirs.english).toBeGreaterThanOrEqual(2);
    expect(theirs.coastal).toBeGreaterThanOrEqual(2);
    // Off to a Powhatan town, where you have no word of the tongue.
    life.prov = prov("Pamunkey");
    life.area = undefined;
    seedLocals(g, life.prov);
    const native = peopleHere(g.s, life.prov, life).find(
      (c) =>
        c.culture === "powhatan" &&
        !(life.people ?? []).some((p) => p.c === c.id),
    )!;
    expect(native).toBeTruthy();
    const t = talkView(g.s, g.w, life, native);
    expect(t.via).toBe(x.id);
    expect(t.sworn).toBe(true);
    expect(t.level).toBe(2);
    const v = interactionView(g.s, g.w, life, native.id, "befriend");
    const part = v.accept!.parts.find((p) =>
      /interpreter by trade/.test(p.label),
    );
    expect(part?.value).toBe(-4);
    // Your letters, put into their tongue.
    const letter = letterAcceptance(g.s, g.w, life, native, "friendly")!;
    expect(letter.parts.some((p) => /^Put into/.test(p.label))).toBe(true);
    // Sent off on an errand, they can't.
    f.task = { kind: "wait", p: j, back: g.s.day + 30 };
    const alone = letterAcceptance(g.s, g.w, life, native, "friendly")!;
    expect(alone.parts.some((p) => /Read out to them/.test(p.label))).toBe(
      true,
    );
  });
});
