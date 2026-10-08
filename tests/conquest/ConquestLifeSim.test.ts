// A whole life (and the next, and the next) played headless by a scripted
// player over half a century: jobs, travel, people, courting and marriage,
// children, events, elections, death and the heir. Nothing may throw, and
// the state must stay consistent all the way.

import { describe, expect, test } from "vitest";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { homeChoices } from "../../src/conquest/engine/Life";
import {
  ACTS,
  actCheck,
  personCheck,
} from "../../src/conquest/engine/LifeActs";
import {
  isPlayed,
  jobCheck,
  meOf,
  opinionOf,
  peopleHere,
  placesIn,
  promotionView,
  takeoverCandidates,
} from "../../src/conquest/engine/LifeQueries";
import { JOBS, SKILL_MAX } from "../../src/conquest/engine/LifeRules";
import { standCheck } from "../../src/conquest/engine/Politics";
import { ageOf } from "../../src/conquest/engine/Queries";
import type { JobKind, Life } from "../../src/conquest/engine/Types";
import { SKILLS } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, world } from "./LifeUtil";

/** One week of a sensible, curious, slightly reckless player. */
function playWeek(
  g: ConquestGame,
  life: Life,
  week: number,
  log: string[],
): void {
  const s = g.s;
  const cmd = (c: Parameters<ConquestGame["lifeCommand"]>[1]) => {
    const err = g.lifeCommand(life.seat, c);
    if (!err) log.push(`${s.day} ${c.k}${"act" in c ? `:${c.act}` : ""}`);
    return err;
  };
  // Answer whatever's waiting, varying the choice.
  for (const ev of [...life.events]) {
    const pick = (week + ev.id) % ev.choices.length;
    if (cmd({ k: "event", id: ev.id, choice: pick }))
      cmd({ k: "event", id: ev.id, choice: 0 });
  }
  if (life.watching) {
    const c = takeoverCandidates(s).find((x) => x.home !== undefined);
    if (c && week % 2 === 0) cmd({ k: "takeover", c: c.id });
    else {
      const home = homeChoices(s, "england")[0];
      if (home !== undefined)
        g.beginLife(life.seat, life.name, plan({ home, first: "Ezra" }));
    }
    return;
  }
  const me = meOf(s, life);
  if (!me || life.travel) return;
  const age = ageOf(s, me);
  const here = placesIn(s, g.w, life.prov);
  // Work: take a job if idle; buy the next rung when it's affordable.
  if (!life.job && age >= 16) {
    for (const place of here)
      for (const kind of Object.keys(JOBS) as JobKind[])
        if (
          JOBS[kind].places.includes(place) &&
          jobCheck(s, g.w, life, place, kind).ok &&
          !life.job
        )
          cmd({ k: "job", place, job: kind });
  }
  const view = promotionView(s, life);
  if (view.next?.buy && life.purse > view.next.buy.cost + 10)
    cmd({ k: "act", place: life.job!.place, act: "buy" });
  // A couple of things to do here.
  const acts = ACTS.filter((a) => a.places.some((p) => here.includes(p)));
  for (let i = 0; i < 2 && acts.length; i++) {
    const a = acts[(week * 7 + i * 3) % acts.length];
    const place = a.places.find((p) => here.includes(p))!;
    if (a.key === "commission" || a.key === "runaway") continue;
    if (actCheck(s, g.w, life, place, a.key).ok)
      cmd({ k: "act", place, act: a.key });
  }
  // People: talk, give, court, and marry when someone's willing.
  const folk = peopleHere(s, life.prov, life).filter((c) => !isPlayed(s, c.id));
  const c = folk[week % Math.max(1, folk.length)];
  if (c) {
    for (const act of ["talk", "flatter", "befriend"] as const)
      if (personCheck(s, life, c.id, act).ok)
        cmd({ k: "person", c: c.id, act });
    if (life.purse > 15 && personCheck(s, life, c.id, "gift").ok)
      cmd({ k: "person", c: c.id, act: "gift", arg: 3 });
  }
  if (me.spouse < 0 && age >= 18) {
    const match = folk.find(
      (x) =>
        x.female !== me.female &&
        x.spouse < 0 &&
        ageOf(s, x) >= 16 &&
        ageOf(s, x) <= 40,
    );
    if (match) {
      if (personCheck(s, life, match.id, "propose").ok)
        cmd({ k: "person", c: match.id, act: "propose" });
      else if (personCheck(s, life, match.id, "court").ok)
        cmd({ k: "person", c: match.id, act: "court" });
      else if (life.purse > 6 && personCheck(s, life, match.id, "gift").ok)
        cmd({ k: "person", c: match.id, act: "gift", arg: 4 });
      else if (week % 9 === 0 && here.includes("church"))
        cmd({ k: "act", place: "church", act: "match" });
    }
  }
  if (week % 40 === 0 && standCheck(s, life).ok) cmd({ k: "stand" });
  // Now and then, a journey: to a neighbour, and home again.
  if (week % 26 === 13 && !(life.job && life.job.army >= 0)) {
    const nb = g.map.provinces[life.prov].nb;
    const to = nb[week % nb.length]?.[0];
    if (to !== undefined) cmd({ k: "travel", to });
  } else if (
    week % 26 === 20 &&
    life.prov !== life.home &&
    !(life.job && life.job.army >= 0)
  ) {
    cmd({ k: "travel", to: life.home });
  }
  if (week % 52 === 0)
    cmd({
      k: "lifestyle",
      v: life.purse > 60 ? "comfortable" : life.purse < 5 ? "frugal" : "modest",
    });
}

function checkConsistent(g: ConquestGame): void {
  const s = g.s;
  const played = new Map<number, string>();
  for (const life of s.lives) {
    expect(Number.isFinite(life.purse)).toBe(true);
    expect(life.health).toBeGreaterThanOrEqual(0);
    expect(life.health).toBeLessThanOrEqual(100);
    expect(life.stress).toBeGreaterThanOrEqual(0);
    expect(life.stress).toBeLessThanOrEqual(100);
    for (const k of SKILLS) {
      expect(life.skills[k]).toBeGreaterThanOrEqual(0);
      expect(life.skills[k]).toBeLessThanOrEqual(SKILL_MAX);
    }
    for (const v of Object.values(life.tally))
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    expect(g.map.provinces[life.prov]).toBeDefined();
    expect(life.events.length).toBeLessThanOrEqual(4);
    if (life.watching) {
      expect(life.c).toBe(-1);
      continue;
    }
    const me = s.chars[life.c];
    expect(me?.alive).toBe(true);
    expect(me.abroad).toBeFalsy();
    expect(played.has(me.id)).toBe(false);
    played.set(me.id, life.seat);
    if (life.job) {
      expect(life.job.rank).toBeGreaterThanOrEqual(0);
      expect(life.job.rank).toBeLessThan(JOBS[life.job.kind].ranks.length);
    }
    if (me.spouse >= 0) expect(s.chars[me.spouse].spouse).toBe(me.id);
    for (const id of Object.keys(life.ties))
      expect(s.chars[Number(id)]).toBeDefined();
  }
  for (const [p, ids] of Object.entries(s.locals)) {
    expect(g.map.provinces[Number(p)]).toBeDefined();
    for (const id of ids) expect(s.chars[id]).toBeDefined();
  }
  for (const m of s.movements) {
    if (m.status === "risen") expect(s.nations[m.rebels]?.kind).toBe("rebels");
    expect(m.support).toBeGreaterThanOrEqual(0);
    expect(m.support).toBeLessThanOrEqual(100);
  }
  for (const a of s.armies) expect(s.nations[a.owner]).toBeDefined();
}

describe("a scripted life, played headless", () => {
  test("fifty years from 1650: work, love, children, death and the heir", async () => {
    const g = world({
      start: 1650,
      seed: 1650,
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({ home: prov("Jamestown"), age: 18 }),
        },
        {
          seat: "s2",
          name: "Pat",
          plan: plan({
            origin: "france",
            home: prov("Quebec"),
            religion: "catholic",
            first: "Marie",
            family: "Lefebvre",
            female: true,
            background: "trapper",
            age: 20,
          }),
        },
      ],
    });
    const log: string[] = [];
    const years = 50;
    for (let week = 0; week < years * 52; week++) {
      for (let d = 0; d < 7 && !g.s.over; d++) g.tick();
      for (const life of g.s.lives) playWeek(g, life, week, log);
      if (week % 52 === 0) checkConsistent(g);
    }
    checkConsistent(g);
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    // A good deal happened.
    for (const life of [a, b]) {
      expect(life.tally.days).toBeGreaterThan(365 * 30);
      expect(life.tally.jobs).toBeGreaterThan(0);
      expect(life.tally.events).toBeGreaterThan(10);
      expect(life.journal.length).toBeGreaterThan(20);
    }
    const all = [a, b];
    expect(all.some((l) => l.tally.marriages > 0)).toBe(true);
    expect(all.some((l) => l.tally.children > 0)).toBe(true);
    expect(all.some((l) => l.tally.promotions > 0)).toBe(true);
    expect(all.some((l) => l.milestones.some((m) => m.kind === "died"))).toBe(
      true,
    );
    expect(
      all.some((l) =>
        l.milestones.some(
          (m) =>
            m.kind === "heir" || m.kind === "takeover" || m.kind === "begin",
        ),
      ),
    ).toBe(true);
    expect(log.length).toBeGreaterThan(500);
    // Nobody is in two places: each played character is someone's alone.
    if (process.env.LIFE_DUMP)
      (await import("fs")).writeFileSync(
        process.env.LIFE_DUMP,
        all
          .map(
            (l) =>
              `== ${l.name}: ${JSON.stringify(l.tally)}\npurse ${l.purse} renown ${l.renown} job ${JSON.stringify(l.job)}\n` +
              l.milestones
                .map((m) => `  * ${m.day} ${m.kind}: ${m.text}`)
                .join("\n") +
              "\n" +
              l.journal
                .slice(-60)
                .map((j) => `  - ${j.day} ${j.text}`)
                .join("\n"),
          )
          .join("\n\n") +
          "\nMOVEMENTS " +
          JSON.stringify(
            g.s.movements.map((m) => [m.name, m.status, m.support]),
          ),
      );
    const ids = all.filter((l) => l.c >= 0).map((l) => l.c);
    expect(new Set(ids).size).toBe(ids.length);
    void opinionOf;
  }, 600_000);
});
