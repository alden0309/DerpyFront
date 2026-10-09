// Money over a lifetime, played headless by three kinds of player in one
// world for fifty years: one who works and never spends, one who spends
// sensibly (a house, land, a business, the next rung, a good name), and a
// soldier who rises through the ranks. Their purses should tell a story:
// thrift keeps you comfortable but not rich, money spent well buys standing,
// and a general lives like one rather than sitting on a mountain of coin.

import { writeFileSync } from "fs";
import { describe, expect, test } from "vitest";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { bribeCost } from "../../src/conquest/engine/Interactions";
import { actCheck, personCheck } from "../../src/conquest/engine/LifeActs";
import { LIFE_EVENTS } from "../../src/conquest/engine/LifeEvents";
import {
  beneathStation,
  jobCheck,
  meOf,
  monthlyBudget,
  officesOf,
  peopleHere,
  placesIn,
  promotionView,
  skillLevel,
  stationOf,
  travelRoute,
  weddingCost,
} from "../../src/conquest/engine/LifeQueries";
import {
  JOBS,
  KIT,
  LAND_GRANT,
  LIFESTYLES,
  STATION_LIFESTYLE,
  TITHE,
  WORKS,
} from "../../src/conquest/engine/LifeRules";
import {
  BAILIFFS_AT,
  moneyMonthly,
  shareStake,
  ventureStake,
} from "../../src/conquest/engine/Money";
import { housePrice } from "../../src/conquest/engine/Property";
import { ageOf } from "../../src/conquest/engine/Queries";
import type { JobKind, Life } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, world } from "./LifeUtil";

/** Make a life's job a given rung of a ladder (for station tests). */
function setRank(life: Life, kind: JobKind, rank: number): void {
  life.job = {
    kind,
    rank,
    prov: life.prov,
    place: JOBS[kind].places[0],
    employer: -1,
    nation: 0,
    army: -1,
    since: 0,
    months: 0,
    away: 0,
    worked: 0,
    awayDays: 0,
  };
}

describe("station: how people expect you to live", () => {
  test("a tenant lives frugally, a captain comfortably, a general grandly", () => {
    const g = world();
    const life = lifeOf(g);
    expect(stationOf(g.s, life).expected).toBe("frugal");
    setRank(life, "soldier", 4);
    expect(stationOf(g.s, life).expected).toBe("comfortable");
    expect(stationOf(g.s, life).who).toBe("a captain");
    setRank(life, "soldier", 7);
    expect(stationOf(g.s, life).expected).toBe("grand");
    expect(STATION_LIFESTYLE).toEqual(LIFESTYLES);
  });

  test("living beneath it, when you could afford better, costs stress and renown", () => {
    const g = world();
    const life = lifeOf(g);
    setRank(life, "soldier", 6); // a colonel
    life.lifestyle = "modest";
    life.purse = 500;
    life.stress = 20;
    life.renown = 50;
    const b = beneathStation(g.s, life);
    expect(b.living).toBe(2);
    expect(b.house).toBe("Fine house");
    moneyMonthly(g, life);
    expect(life.stress).toBeGreaterThan(20);
    expect(life.renown).toBeLessThan(50);
    expect(life.journal[life.journal.length - 1]?.text).toMatch(/People talk/);
    // Fallen on hard times: they pity you instead.
    life.purse = 3;
    life.stress = 20;
    moneyMonthly(g, life);
    expect(life.stress).toBe(20);
  });

  test("weddings and portions cost more the higher you stand", () => {
    const g = world();
    const life = lifeOf(g);
    const low = weddingCost(g.s, life);
    setRank(life, "soldier", 7);
    expect(weddingCost(g.s, life)).toBeGreaterThan(low * 5);
    const match = LIFE_EVENTS.find((e) => e.key === "child-match")!;
    expect(match.choices).toHaveLength(3);
  });
});

describe("dues: tithes and taxes", () => {
  test("a colonist pays tithes and the colony's taxes on what they earn", () => {
    const g = world();
    const life = lifeOf(g);
    const b = monthlyBudget(g.s, g.w, life);
    const wage = b.parts.find((p) => p.label.startsWith("Wage"))!.value;
    const tithe = b.parts.find((p) => /Tithes/.test(p.label))!;
    expect(tithe.value).toBeCloseTo(-wage * TITHE, 1);
    expect(b.parts.some((p) => /^Taxes/.test(p.label))).toBe(true);
  });

  test("native peoples pay neither", () => {
    const g = world({
      plans: [
        {
          seat: "s1",
          name: "N",
          plan: plan({
            origin: "powhatan",
            home: prov("Pamunkey"),
            religion: "native",
            background: "grower",
            first: "Matoaka",
            family: "of the Turtle clan",
            female: true,
          }),
        },
      ],
    });
    const life = lifeOf(g);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => /Tithes|Taxes/.test(p.label))).toBe(false);
  });

  test("a governor who holds a commission draws the larger pay, not both", () => {
    const g = world();
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    g.s.nations[me.nation].ruler = me.id;
    setRank(life, "soldier", 7);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((p) => /overnor/.test(p.label))).toBe(false);
    expect(stationOf(g.s, life).level).toBe(4);
  });
});

describe("things money buys", () => {
  test("a horse halves... well, shortens the road, and costs its keep", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    const to = prov("Massachusetts Bay");
    const walk = travelRoute(g.s, g.map, life.prov, to, false)!;
    const p = g.s.provinces[life.prov];
    void p;
    life.area = "market";
    expect(
      g.lifeCommand("s1", { k: "act", place: "market", act: "horse" }),
    ).toBeNull();
    expect(life.purse).toBe(100 - KIT.horse.cost);
    const ride = travelRoute(
      g.s,
      g.map,
      life.prov,
      to,
      false,
      false,
      false,
      1.5,
    );
    expect(ride!.days).toBeLessThan(walk.days * 0.75);
    const before = life.purse;
    moneyMonthly(g, life);
    expect(life.purse).toBeCloseTo(before - KIT.horse.upkeep, 2);
  });

  test("good tools give a point of skill in your trade", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 50;
    const main = JOBS[life.job!.kind].main;
    const before = skillLevel(g.s, life, main);
    expect(
      g.lifeCommand("s1", { k: "act", place: "market", act: "tools" }),
    ).toBeNull();
    expect(skillLevel(g.s, life, main)).toBe(before + 1);
  });

  test("a cargo ventured comes home (or doesn't) months later; shares can be sold", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 400;
    setRank(life, "clerk", 2); // a merchant: gentlefolk
    const stake = ventureStake(g.s, life);
    expect(
      g.lifeCommand("s1", { k: "act", place: "docks", act: "venture" }),
    ).toBeNull();
    expect(life.ventures).toHaveLength(1);
    expect(
      g.lifeCommand("s1", { k: "act", place: "market", act: "shares" }),
    ).toBeNull();
    expect(life.purse).toBe(400 - stake - shareStake(g.s, life));
    const cargo = life.ventures!.find((v) => v.kind === "cargo")!;
    g.s.day = cargo.due;
    moneyMonthly(g, life);
    expect(life.ventures!.some((v) => v.kind === "cargo")).toBe(false);
    expect(life.journal.some((j) => /Your cargo/.test(j.text))).toBe(true);
    const share = life.ventures!.find((v) => v.kind === "shares")!;
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "property", act: "cash", id: share.id }),
    ).toBeNull();
    expect(life.purse).toBeCloseTo(purse + share.value, 1);
    expect(life.ventures).toHaveLength(0);
  });

  test("a land grant needs the governor's good opinion", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 100;
    const check = () => actCheck(g.s, g.w, life, "governor", "grant");
    const gov = g.s.nations[meOf(g.s, life)!.nation].ruler;
    if (gov >= 0) {
      g.char(gov).memories.push({
        of: life.c,
        why: "Test",
        value: -40,
        until: g.s.day + 999,
      });
      expect(check().ok).toBe(false);
      g.char(gov).memories.push({
        of: life.c,
        why: "Test",
        value: 120,
        until: g.s.day + 999,
      });
    }
    expect(check().ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "act", place: "governor", act: "grant" }),
    ).toBeNull();
    expect(life.property!.find((p) => p.kind === "land")!.level).toBe(
      LAND_GRANT.lots,
    );
    expect(check().ok).toBe(false);
  });

  test("great works want money and a name", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 1000;
    life.renown = 0;
    expect(actCheck(g.s, g.w, life, "church", "work-church").ok).toBe(false);
    life.renown = WORKS.church.need;
    expect(
      g.lifeCommand("s1", { k: "act", place: "church", act: "work-church" }),
    ).toBeNull();
    expect(life.purse).toBe(1000 - WORKS.church.cost);
    expect(life.renown).toBeGreaterThan(WORKS.church.need);
  });

  test("a bribe buys a good word, or a bad name", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 200;
    life.renown = 20;
    const boss = g.s.chars[life.job!.employer];
    const cost = bribeCost(g.s, boss);
    expect(cost).toBeGreaterThan(0);
    expect(personCheck(g.s, life, boss.id, "bribe").ok).toBe(true);
    const renown = life.renown;
    expect(
      g.lifeCommand("s1", { k: "person", c: boss.id, act: "bribe" }),
    ).toBeNull();
    const paid = life.purse === 200 - cost;
    const caught = life.renown < renown;
    expect(paid !== caught).toBe(true);
  });

  test("deep in debt, the bailiffs sell what costs most to keep", () => {
    const g = world();
    const life = lifeOf(g);
    life.purse = 500;
    expect(g.lifeCommand("s1", { k: "property", act: "house" })).toBeNull();
    expect(life.property!.some((p) => p.kind === "house")).toBe(true);
    life.purse = BAILIFFS_AT - 20;
    moneyMonthly(g, life);
    expect(life.property!.some((p) => p.kind === "house")).toBe(false);
    expect(life.journal[life.journal.length - 1]?.text).toMatch(/bailiffs/);
  });
});

describe("letters left unanswered", () => {
  test("the recruiting party and a rising leave you be if you don't answer", () => {
    const first = (key: string) =>
      [...LIFE_EVENTS].find((e) => e.key === key)!.choices[0];
    expect(String(first("war-news").label)).toMatch(/head down/);
    expect(String(first("tavern-recruiter").label)).toMatch(/Push the pot/);
    expect(String(first("rising-call").label)).toMatch(/head down/);
  });
});

type Profile = "passive" | "spender" | "soldier";

interface Row {
  year: number;
  age: number;
  purse: number;
  /** Shares and cargoes at sea. */
  out: number;
  stress: number;
  renown: number;
  station: number;
  office: string;
  rank: string;
  owns: string;
  living: string;
}

/** A few commands a week, as each kind of player would. */
function playWeek(
  g: ConquestGame,
  life: Life,
  who: Profile,
  week: number,
): void {
  const s = g.s;
  const cmd = (c: Parameters<ConquestGame["lifeCommand"]>[1]) =>
    g.lifeCommand(life.seat, c);
  for (const ev of [...life.events]) cmd({ k: "event", id: ev.id, choice: 0 });
  if (life.watching) return;
  const me = meOf(s, life);
  if (!me || life.travel) return;
  const age = ageOf(s, me);
  // Work: their own trade at home if they can, anything else if not.
  if (!life.job && age >= 16) {
    const first: JobKind = who === "soldier" ? "soldier" : "farmer";
    const want: JobKind[] =
      who === "soldier"
        ? ["soldier"]
        : [first, ...(Object.keys(JOBS) as JobKind[])];
    for (const kind of want)
      for (const place of placesIn(s, g.w, life.prov))
        if (
          !life.job &&
          JOBS[kind].places.includes(place) &&
          jobCheck(s, g.w, life, place, kind).ok
        )
          cmd({ k: "job", place, job: kind });
  }
  if (life.job) {
    const boss = s.chars[life.job.employer];
    const v = promotionView(s, life);
    // Everyone asks for the next rung when it's earned.
    if (v.check.ok && boss?.alive && !v.next?.buy)
      cmd({ k: "person", c: boss.id, act: "promote" });
    // A soldier keeps on the right side of the governor and the marshal.
    if (who === "soldier" && week % 4 === 0) {
      const n = s.nations[me.nation];
      for (const id of [n?.council.marshal, n?.ruler]) {
        if (id === undefined || id < 0) continue;
        for (const act of ["talk", "flatter"] as const)
          if (personCheck(s, life, id, act).ok)
            cmd({ k: "person", c: id, act });
      }
    }
    // The spender and the soldier buy the next rung when it's sensible.
    if (who !== "passive" && v.next?.buy && life.purse > v.next.buy.cost + 25)
      cmd({ k: "act", place: life.job.place, act: "buy" });
  }
  // Everyone marries if they can: an heir to leave it all to.
  if (me.spouse < 0 && age >= 18 && week % 2 === 0) {
    const match = peopleHere(s, life.prov, life).find(
      (x) =>
        x.female !== me.female &&
        x.spouse < 0 &&
        ageOf(s, x) >= 16 &&
        ageOf(s, x) <= 35,
    );
    if (match)
      for (const a of ["propose", "court", "talk"] as const)
        if (personCheck(s, life, match.id, a).ok) {
          cmd({ k: "person", c: match.id, act: a });
          break;
        }
  }
  if (who === "passive") return;
  // A house fit for their station.
  if (week % 8 === 0) {
    const b = beneathStation(s, life);
    if (b.house && life.purse > housePrice(s, life) + 25)
      cmd({ k: "property", act: "house" });
  }
  // Living as their station expects (a step down when money's short).
  if (week % 4 === 0) {
    const want = stationOf(s, life).expected;
    const i = LIFESTYLES.indexOf(want);
    const v =
      life.purse < 5 && i > 0
        ? LIFESTYLES[i - 1]
        : life.purse < -5
          ? "frugal"
          : want;
    if (life.lifestyle !== v) cmd({ k: "lifestyle", v });
  }
  const act = (place: Parameters<typeof actCheck>[3], key: string) =>
    actCheck(s, g.w, life, place, key).ok && cmd({ k: "act", place, act: key });
  if (who === "soldier") {
    if (week % 13 === 0 && life.purse > 30) act("market", "tools");
    return;
  }
  // The spender saves for the next rung first, then spends the rest:
  // tools, a horse, land, ventures, a pew, dinners, a coach, good works.
  if (week % 4 !== 0) return;
  // Saving first for the next rung, or a house fit for their station.
  const b = beneathStation(s, life);
  const rung = Math.max(
    promotionView(s, life).next?.buy?.cost ?? 0,
    b.house ? housePrice(s, life) : 0,
  );
  if (b.house && life.purse > housePrice(s, life))
    cmd({ k: "property", act: "house" });
  const spare = life.purse - rung - 20;
  // Hands for the business.
  const firm = (life.property ?? []).find((p) => p.kind === "business");
  if (firm && life.purse > 10)
    for (const c of peopleHere(s, life.prov, life).slice(0, 12))
      if (personCheck(s, life, c.id, "hire").ok) {
        cmd({ k: "person", c: c.id, act: "hire" });
        break;
      }
  if (spare > 10) act("market", "tools");
  if (spare > 40) act("market", "horse");
  if (spare > 50) cmd({ k: "property", act: "land" });
  const biz = (life.property ?? []).find((p) => p.kind === "business");
  if (biz && spare > 150) cmd({ k: "property", act: "expand", id: biz.id });
  if (spare > 40) act("church", "pew");
  if (spare > 3 * ventureStake(s, life)) act("docks", "venture");
  if (spare > 4 * Math.max(1, shareStake(s, life))) act("market", "shares");
  for (const v of life.ventures ?? [])
    if (v.kind === "shares" && v.value > v.stake * 1.4)
      cmd({ k: "property", act: "cash", id: v.id });
  if (week % 52 === 0 && spare > 30) act("home", "dinner");
  if (spare > 250) act("market", "carriage");
  if (spare > 200) cmd({ k: "property", act: "endow", what: "school" });
  if (spare > 400) act("church", "work-church");
}

function rowOf(g: ConquestGame, life: Life, year: number): Row {
  const me = meOf(g.s, life);
  const job = life.job;
  return {
    year,
    age: me ? ageOf(g.s, me) : -1,
    purse: Math.round(life.purse),
    out: Math.round((life.ventures ?? []).reduce((a, v) => a + v.value, 0)),
    stress: Math.round(life.stress),
    renown: Math.round(life.renown),
    station: stationOf(g.s, life).level,
    office: officesOf(g.s, life.c)
      .map((o) => o.kind)
      .join(","),
    rank: job ? JOBS[job.kind].ranks[job.rank].title : "-",
    owns: (life.property ?? []).map((p) => `${p.kind[0]}${p.level}`).join(" "),
    living: life.lifestyle,
  };
}

describe("money over a lifetime", () => {
  test("fifty years: a saver, a spender and a soldier", () => {
    const home = prov("Jamestown");
    const g = world({
      start: 1650,
      seed: Number(process.env.MONEY_SEED ?? 41),
      plans: [
        {
          seat: "passive",
          name: "Pat",
          plan: plan({
            home,
            age: 20,
            first: "Prudence",
            female: true,
            traits: ["robust"],
          }),
        },
        {
          seat: "spender",
          name: "Sam",
          plan: plan({ home, age: 20, first: "Samuel", traits: ["robust"] }),
        },
        {
          seat: "soldier",
          name: "Sol",
          plan: plan({
            home,
            age: 20,
            first: "Miles",
            background: "soldier",
            skills: { fighting: 3, leadership: 3 },
            stats: { dip: 5, mar: 8, ste: 5, int: 5, lea: 5 },
            traits: ["robust"],
          }),
        },
      ],
    });
    const who: Profile[] = ["passive", "spender", "soldier"];
    const rows: Record<Profile, Row[]> = {
      passive: [],
      spender: [],
      soldier: [],
    };
    const years = 50;
    for (let week = 0; week < years * 52; week++) {
      for (let d = 0; d < 7 && !g.s.over; d++) g.tick();
      for (const p of who) playWeek(g, lifeOf(g, p), p, week);
      if (week % 52 === 51)
        for (const p of who)
          rows[p].push(rowOf(g, lifeOf(g, p), Math.round((week + 1) / 52)));
    }
    const table = who
      .map(
        (p) =>
          `== ${p}\n` +
          rows[p]
            .map(
              (r) =>
                `${String(r.year).padStart(2)}y age ${String(r.age).padStart(2)} purse ${String(r.purse).padStart(5)} out ${String(r.out).padStart(4)} stress ${String(r.stress).padStart(3)} renown ${String(r.renown).padStart(3)} st${r.station} ${r.rank}${r.office ? ` +${r.office}` : ""} [${r.living}] ${r.owns}`,
            )
            .join("\n"),
      )
      .join("\n");
    if (process.env.MONEY_DUMP) writeFileSync(process.env.MONEY_DUMP, table);
    expect(rows.passive.length).toBe(years);
    const peak = (p: Profile) => Math.max(...rows[p].map((r) => r.purse));
    // Thrift keeps you out of want, but a tenant who never spends isn't rich.
    expect(peak("passive")).toBeLessThan(400);
    // The spender has things to show for it: land, a house, a business.
    const owns = rows.spender.map((r) => r.owns).join(" ");
    expect(owns).toMatch(/h\d/);
    expect(owns).toMatch(/[lb]\d/);
    // The soldier rises, and lives like it: savings, but no mountain of coin.
    expect(
      rows.soldier.some((r) => /Captain|Major|Colonel|General/.test(r.rank)),
    ).toBe(true);
    expect(peak("soldier")).toBeLessThan(2000);
    // Nobody sinks for ever: the bailiffs see to that.
    for (const p of who)
      expect(Math.min(...rows[p].map((r) => r.purse))).toBeGreaterThan(-250);
  }, 900_000);
});
