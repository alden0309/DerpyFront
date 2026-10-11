// A whole life (and the next, and the next) played headless by a scripted
// player over half a century: jobs, travel, people, courting and marriage,
// children, events, elections, death and the heir. Nothing may throw, and
// the state must stay consistent all the way.

import { describe, expect, test } from "vitest";
import { offeredHere } from "../../src/conquest/engine/Contracts";
import { crimeActCheck } from "../../src/conquest/engine/Crime";
import {
  heatOf,
  knowsDen,
  lawAt,
} from "../../src/conquest/engine/CrimeQueries";
import {
  candidatesAt,
  peopleOf,
  raiseCheck,
} from "../../src/conquest/engine/Followers";
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
import { ageOf, enemiesOf } from "../../src/conquest/engine/Queries";
import { takeUpCheck } from "../../src/conquest/engine/Trades";
import type { JobKind, Life } from "../../src/conquest/engine/Types";
import { SKILLS } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, world } from "./LifeUtil";

// LIFE (r11): what the rogue and the sword got up to, for the assertions.
const seen = {
  crookedWeeks: 0,
  maxNotoriety: 0,
  maxHeat: 0,
  jailed: 0,
  bandHired: 0,
  swordWeeks: 0,
  contractsTaken: 0,
  contractsDone: 0,
  swordsHired: 0,
  companies: 0,
  companyWeeks: 0,
  inPayWeeks: 0,
  marches: 0,
  fielded: 0,
  topMilitia: 0,
};

/** LIFE (r11): a life of crime, played for fifty years by a careful rogue. */
function playRogue(
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
  for (const ev of [...life.events]) {
    // Usually go quietly; now and then run for it.
    const pick =
      ev.key === "crime-seized"
        ? week % 3 === 0
          ? 2
          : 0
        : (week + ev.id) % ev.choices.length;
    if (cmd({ k: "event", id: ev.id, choice: pick }))
      cmd({ k: "event", id: ev.id, choice: 0 });
  }
  if (life.watching) {
    const home = homeChoices(s, "england")[0];
    if (home !== undefined)
      g.beginLife(
        life.seat,
        life.name,
        plan({ home, first: "Moll", female: true, background: "pickpocket" }),
      );
    return;
  }
  const me = meOf(s, life);
  if (!me || ageOf(s, me) < 16) return;
  if (life.crime?.jail) {
    seen.jailed++;
    if (life.purse > 60 && week % 4 === 0) cmd({ k: "crime", act: "gaoler" });
    return;
  }
  if (life.travel) return;
  const here = placesIn(s, g.w, life.prov);
  if (life.job && JOBS[life.job.kind].crime) seen.crookedWeeks++;
  seen.maxNotoriety = Math.max(seen.maxNotoriety, life.crime?.notoriety ?? 0);
  const n = lawAt(s, life.prov);
  seen.maxHeat = Math.max(seen.maxHeat, heatOf(life, n));
  if (!life.job) {
    if (here.includes("tavern") && !knowsDen(life, life.prov)) {
      cmd({ k: "enter", area: "tavern" });
      if (crimeActCheck(s, g.w, life, "tavern", "listen").ok)
        cmd({ k: "crime", act: "listen" });
    }
    for (const place of ["den", "market"] as const)
      if (
        !life.job &&
        here.includes(place) &&
        takeUpCheck(s, g.w, life, "thief", place).ok
      )
        cmd({ k: "takeup", job: "thief", place });
  }
  // Hot: lie low; cool: work hard.
  const hot = heatOf(life, n) >= 35;
  cmd({ k: "effort", v: hot ? "shirk" : "hard" });
  if (hot && here.includes("den") && knowsDen(life, life.prov)) {
    cmd({ k: "enter", area: "den" });
    if (crimeActCheck(s, g.w, life, "den", "lielow").ok)
      cmd({ k: "crime", act: "lielow" });
  }
  if (week % 6 === 3 && here.includes("den") && knowsDen(life, life.prov)) {
    cmd({ k: "enter", area: "den" });
    if (crimeActCheck(s, g.w, life, "den", "score").ok)
      cmd({ k: "crime", act: "score" });
  }
  // A band of their own.
  if (
    week % 5 === 1 &&
    here.includes("den") &&
    knowsDen(life, life.prov) &&
    life.purse > 8
  ) {
    cmd({ k: "enter", area: "den" });
    const c = candidatesAt(s, g.w, life, life.prov, "den")[0];
    if (c && !cmd({ k: "people", act: "hire", arg: c.slot })) seen.bandHired++;
  }
  if (
    week % 3 === 2 &&
    peopleOf(life).some((f) => f.kind === "rogue" && !f.task)
  )
    cmd({ k: "people", act: "job", kind: "robbery" });
}

/** LIFE (r11): a sword for hire who rises to captain a company of their own. */
function playSword(
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
  for (const ev of [...life.events]) {
    // Contracts: attack. Anything else varies.
    const pick = ev.key.startsWith("contract-")
      ? 0
      : (week + ev.id) % ev.choices.length;
    if (cmd({ k: "event", id: ev.id, choice: pick }))
      cmd({ k: "event", id: ev.id, choice: 0 });
  }
  if (life.watching) {
    const home = homeChoices(s, "england")[0];
    if (home !== undefined)
      g.beginLife(
        life.seat,
        life.name,
        plan({ home, first: "Ezekiel", background: "militiaman" }),
      );
    return;
  }
  const me = meOf(s, life);
  if (!me || ageOf(s, me) < 16 || life.crime?.jail) return;
  seen.swordWeeks++;
  seen.contractsDone = Math.max(
    seen.contractsDone,
    (life.contracts ?? []).filter((c) => c.status === "done").length,
  );
  const taken = (life.contracts ?? []).find((c) => c.status === "taken");
  if (life.travel) return;
  seen.topMilitia = Math.max(
    seen.topMilitia,
    life.job?.kind === "militia" ? life.job.rank : 0,
  );
  // Off on a contract: get there and see it through.
  if (taken) {
    if (taken.target !== life.prov) cmd({ k: "travel", to: taken.target });
    return;
  }
  // Otherwise home to the muster, where the pay and the promotions are.
  if (life.prov !== life.home) {
    cmd({ k: "travel", to: life.home });
    return;
  }
  const here = placesIn(s, g.w, life.prov);
  if (!life.job)
    for (const place of ["tavern", "fort"] as const)
      if (
        !life.job &&
        here.includes(place) &&
        takeUpCheck(s, g.w, life, "militia", place).ok
      )
        cmd({ k: "takeup", job: "militia", place });
  cmd({ k: "effort", v: "hard" });
  // A captain (or someone famous enough) raises a company when there's a
  // war to sell it to, takes the field, and stands down at the peace.
  const co = life.company;
  const war = enemiesOf(s, me.nation).length > 0;
  if (
    !co &&
    war &&
    raiseCheck(s, life).ok &&
    !cmd({ k: "people", act: "raise" })
  )
    seen.companies++;
  if (co) {
    seen.companyWeeks++;
    if (co.inPay) seen.inPayWeeks++;
    const army = s.armies.find((a) => a.id === co.army);
    if (co.army < 0 && war) {
      if (!cmd({ k: "people", act: "field" })) seen.fielded++;
    } else if (army && war && army.depart < 0 && week % 4 === 0) {
      // March on the nearest enemy province.
      const foes = new Set(enemiesOf(s, army.owner));
      const at = g.map.provinces[army.prov];
      let best = -1;
      let far = Infinity;
      s.provinces.forEach((pr, p) => {
        if (!foes.has(pr.owner)) return;
        const d = g.map.provinces[p];
        const km = Math.hypot(d.lat - at.lat, d.lon - at.lon);
        if (km < far) {
          far = km;
          best = p;
        }
      });
      if (best >= 0 && !cmd({ k: "march", to: best })) seen.marches++;
    } else if (co.army >= 0 && !war) cmd({ k: "people", act: "standdown" });
    else if (co.army < 0 && !war && life.purse < 30)
      cmd({ k: "people", act: "disband" });
  }
  // A sword or two at their back, once there's money for wages.
  if (
    week % 4 === 0 &&
    here.includes("tavern") &&
    life.purse > 40 &&
    peopleOf(life).length < 2
  ) {
    cmd({ k: "enter", area: "tavern" });
    const c = candidatesAt(s, g.w, life, life.prov, "tavern").find(
      (x) => x.kind === "sword",
    );
    if (c && !cmd({ k: "people", act: "hire", arg: c.slot }))
      seen.swordsHired++;
  }
  // Contracts: the near work, when there's money for the road.
  if (week % 3 !== 0 || life.purse < 15) return;
  for (const place of ["tavern", "governor", "gaol"] as const) {
    if (!here.includes(place)) continue;
    cmd({ k: "enter", area: place });
    const offer = offeredHere(s, g.w, life, place).find(
      (c) => c.kind !== "explore",
    );
    if (offer && !cmd({ k: "contract", act: "take", id: offer.id })) {
      seen.contractsTaken++;
      return;
    }
  }
}

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
    // LIFE (r11): people, boats, the company and the law stay sane.
    for (const f of life.people ?? []) expect(s.chars[f.c]).toBeDefined();
    for (const b of life.boats ?? [])
      expect(g.map.provinces[b.prov]).toBeDefined();
    if (life.company) expect(life.company.men).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(life.crime?.heat ?? {})) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
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
        // LIFE (r11): a life of crime, and a mercenary captain.
        {
          seat: "s3",
          name: "Moll",
          plan: plan({
            home: prov("Jamestown"),
            first: "Moll",
            family: "Cutpurse",
            female: true,
            background: "pickpocket",
            age: 18,
            skills: { stealth: 2, persuasion: 1 },
          }),
        },
        {
          seat: "s4",
          name: "Swords",
          plan: plan({
            home: prov("Jamestown"),
            first: "Ezekiel",
            family: "Blackwood",
            background: "militiaman",
            age: 24,
            skills: { fighting: 2, leadership: 1 },
          }),
        },
      ],
    });
    const log: string[] = [];
    const years = 50;
    for (let week = 0; week < years * 52; week++) {
      for (let d = 0; d < 7 && !g.s.over; d++) g.tick();
      for (const life of g.s.lives)
        if (life.seat === "s3") playRogue(g, life, week, log);
        else if (life.seat === "s4") playSword(g, life, week, log);
        else playWeek(g, life, week, log);
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
        g.s.lives
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
    // LIFE (r11): the rogue lived by crime, made a name, and the law noticed;
    // the sword took contracts, hired swords and saw work through.
    expect(seen.crookedWeeks).toBeGreaterThan(50);
    expect(seen.maxNotoriety).toBeGreaterThanOrEqual(10);
    expect(seen.maxHeat > 20 || seen.jailed > 0).toBe(true);
    expect(seen.swordWeeks).toBeGreaterThan(100);
    expect(seen.contractsTaken).toBeGreaterThan(0);
    expect(seen.swordsHired + seen.companies).toBeGreaterThan(0);
    // ...and rose in the militia, or captained a company of their own.
    expect(seen.topMilitia >= 3 || seen.companies > 0).toBe(true);
    if (process.env.LIFE_DUMP)
      (await import("fs")).appendFileSync(
        process.env.LIFE_DUMP,
        `\nR11 ${JSON.stringify(seen)}\n`,
      );
    void opinionOf;
  }, 600_000);
});
