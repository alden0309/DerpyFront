// POLLS (r16): elections that can be lost (the canvass week by week, money
// laid out on a poll, rivals with patrons and money, the governor's
// interest, the reasons at the count), renown and favour on a curve, favour
// that slips in an unchanged seat, and a paper that speaks for its owner.

import { describe, expect, test } from "vitest";
import { ACHIEVEMENTS } from "../../src/conquest/engine/Achievements";
import { nameMark } from "../../src/conquest/engine/Ambitions";
import { pollDay } from "../../src/conquest/engine/Calendar";
import {
  canvassingSeat,
  canvassNow,
  canvassValue,
  challengersAtCount,
  countLuck,
  countyLean,
  countyLeanBy,
  fieldAt,
  govInterest,
  localView,
  npcPatron,
  npcStanding,
  partyLine,
  partyOf,
  patronsFor,
  playerStanding,
  POLL,
  pollOf,
  rivalFor,
  sheriffOf,
  treatValue,
  treatView,
  winChance,
} from "../../src/conquest/engine/Canvass";
import {
  ensureCabinet,
  SEAT_CASE,
  seatClaim,
} from "../../src/conquest/engine/Council";
import { householdsOf } from "../../src/conquest/engine/Folk";
import {
  deltaForSeat,
  deltaHasSecrets,
  stateForIntrigue,
} from "../../src/conquest/engine/IntrigueCore";
import { ACTS } from "../../src/conquest/engine/LifeActs";
import { addRenown } from "../../src/conquest/engine/LifeCore";
import { meOf, stationOf } from "../../src/conquest/engine/LifeQueries";
import { ROLES } from "../../src/conquest/engine/LifeRules";
import { ensureOffices, OFFICES } from "../../src/conquest/engine/Offices";
import { holdsPost } from "../../src/conquest/engine/OneOffice";
import { campaignBoost } from "../../src/conquest/engine/Politics";
import { addSway, power } from "../../src/conquest/engine/PowerCore";
import {
  mockChance,
  pieceTargets,
  PUFF,
  puffEffect,
} from "../../src/conquest/engine/Press";
import { ageOf } from "../../src/conquest/engine/Queries";
import { Rng } from "../../src/conquest/engine/Rng";
import {
  addFavor,
  delivered,
  seatOf,
  seatSlip,
  standingMonth,
} from "../../src/conquest/engine/Standing";
import {
  afterGain,
  FAVOUR_CURVE,
  gainFactor,
  monthlyFade,
  RENOWN_CURVE,
  settlesAt,
} from "../../src/conquest/engine/StandingCurve";
import type { Life, LocalOffice, Paper } from "../../src/conquest/engine/Types";
import { lifeOf, plan, ticks, world } from "./LifeUtil";

/** A county office with a poll, the player standing for it. */
function standing(
  g: ReturnType<typeof world>,
  key: "warden" | "burgess" | "selectman" = "burgess",
  days = 200,
): { life: Life; o: LocalOffice } {
  const life = lifeOf(g);
  life.purse = 200;
  life.renown = Math.max(life.renown, 30);
  const o = ensureOffices(g, life.prov).find((x) => x.key === key)!;
  o.election = pollDay(g.s.day + days);
  expect(
    g.lifeCommand("s1", { k: "society", act: "stand", id: o.id }),
  ).toBeNull();
  return { life, o };
}

describe("POLLS r16: renown and favour on a curve", () => {
  test("below 60 a gain counts in full; above, less and less", () => {
    expect(afterGain(RENOWN_CURVE, 20, 15)).toBe(35);
    expect(afterGain(RENOWN_CURVE, 50, 10)).toBe(60);
    expect(gainFactor(RENOWN_CURVE, 60)).toBe(1);
    expect(gainFactor(RENOWN_CURVE, 100)).toBeCloseTo(0.5, 5);
    expect(gainFactor(RENOWN_CURVE, 140)).toBeCloseTo(1 / 3, 5);
    // From 50, twenty gained: ten in full, then ten on the curve.
    const x = afterGain(RENOWN_CURVE, 50, 20);
    expect(x).toBeGreaterThan(68);
    expect(x).toBeLessThan(70);
    // Favour: at 85 a gain counts half; never past 100.
    expect(gainFactor(FAVOUR_CURVE, 85)).toBeCloseTo(0.5, 5);
    expect(afterGain(FAVOUR_CURVE, 95, 50)).toBeLessThanOrEqual(100);
  });

  test("addRenown is unchanged below 60 and on the curve above", () => {
    const g = world();
    const life = lifeOf(g);
    life.renown = 30;
    addRenown(g, life, 12);
    expect(life.renown).toBe(42);
    life.renown = 100;
    const me = meOf(g.s, life)!;
    me.traits = me.traits.filter((t) => t !== "famous");
    addRenown(g, life, 10);
    expect(life.renown).toBeGreaterThan(104);
    expect(life.renown).toBeLessThan(106);
    addRenown(g, life, -5);
    expect(life.renown).toBeLessThan(101);
  });

  test("the month's fading is the old 2% below 60, and faster the higher it stands", () => {
    const old = (r: number) =>
      r > 15 ? Math.round((r - (r - 15) * 0.02) * 10) / 10 : r;
    for (const r of [10, 16, 25.3, 40, 59.9]) {
      const life = { renown: r, favor: 0 } as Life;
      standingMonth(life);
      expect(life.renown).toBe(old(r));
    }
    for (const f of [3, 22.7, 40, 60]) {
      const life = { renown: 0, favor: f } as Life;
      standingMonth(life);
      expect(life.favor).toBe(Math.round(f * 0.98 * 10) / 10);
    }
    // Above the knee: more than the old 2% of the excess.
    const hi = { renown: 150, favor: 90 } as Life;
    standingMonth(hi);
    expect(150 - hi.renown).toBeGreaterThan((150 - 15) * 0.02 + 1);
    expect(90 - hi.favor).toBeGreaterThan(90 * 0.02 + 0.5);
    expect(monthlyFade(RENOWN_CURVE, 200)).toBeGreaterThan(
      2 * monthlyFade(RENOWN_CURVE, 100),
    );
  });

  test("a busy politician settles near 100, not 300; a quiet life is as it was", () => {
    // About 6 renown a month was a busy politician's in the playthrough.
    const busy = settlesAt(RENOWN_CURVE, 6);
    expect(busy).toBeGreaterThan(90);
    expect(busy).toBeLessThan(115);
    // A quiet life (under a renown a month) never reaches the knee: no change.
    expect(settlesAt(RENOWN_CURVE, 0.75)).toBeLessThan(60);
    // Favour from letters home and a seat: well short of 100.
    expect(settlesAt(FAVOUR_CURVE, 3)).toBeLessThan(80);
    expect(settlesAt(FAVOUR_CURVE, 3)).toBeGreaterThan(55);
  });

  test("addFavor puts gains on the curve and losses in full", () => {
    const g = world();
    const life = lifeOf(g);
    life.favor = 50;
    addFavor(g, life, 6);
    expect(life.favor).toBe(56);
    life.favor = 85;
    addFavor(g, life, 6);
    expect(life.favor).toBeGreaterThan(87);
    expect(life.favor).toBeLessThan(89);
    addFavor(g, life, -10);
    expect(life.favor).toBeLessThan(79);
    life.favor = 3;
    addFavor(g, life, -10);
    expect(life.favor).toBe(0);
  });

  test("thresholds are re-set for the curve: Famous at 100, the great at 100, a name's mark nearer", () => {
    const famous = ACHIEVEMENTS.find((a) => a.key === "famous")!;
    expect(famous.how).toContain("100");
    const g = world();
    const life = lifeOf(g);
    life.tally.peakRenown = 101;
    expect(famous.check(g, life)).toBe(true);
    life.tally.peakRenown = 99;
    expect(famous.check(g, life)).toBe(false);
    life.renown = 101;
    expect(stationOf(g.s, life).level).toBeGreaterThanOrEqual(3);
    expect(nameMark(10)).toBe(20);
    expect(nameMark(80)).toBeLessThan(15);
    expect(nameMark(200)).toBe(8);
  });

  test("a council seat's case counts renown to 100 and favour to 60, where their curves flatten", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const n = meOf(g.s, life)!.nation;
    const line = (re: RegExp) =>
      seatClaim(g.s, life, n, "attorney").parts.find((p) => re.test(p.label))
        ?.value ?? 0;
    life.renown = 60;
    life.favor = 48;
    const r60 = line(/^Renown/);
    const f48 = line(/^Favour at home/);
    life.renown = 100;
    life.favor = 60;
    // The years above 60 still make a case.
    expect(line(/^Renown/)).toBeGreaterThan(r60);
    expect(line(/^Favour at home/)).toBeGreaterThan(f48);
    expect(line(/^Renown/)).toBe(SEAT_CASE.renownCap);
    expect(line(/^Favour at home/)).toBe(SEAT_CASE.favourCap);
    // And no further: they stay where their curves flatten.
    life.renown = 300;
    life.favor = 100;
    expect(line(/^Renown/)).toBe(SEAT_CASE.renownCap);
    expect(line(/^Favour at home/)).toBe(SEAT_CASE.favourCap);
    // A busy politician's renown and favour settle where they're worth it.
    expect(settlesAt(RENOWN_CURVE, 6)).toBeGreaterThanOrEqual(
      SEAT_CASE.renownCap * SEAT_CASE.renownDiv * 0.9,
    );
  });
});

describe("POLLS r16: favour slips in an unchanged seat unless something is delivered", () => {
  function seated(g: ReturnType<typeof world>): { life: Life; label: string } {
    const life = lifeOf(g);
    const o = ensureOffices(g, life.prov).find((x) => x.key === "justice")!;
    g.lifeCommand("s1", { k: "society", act: "resign", id: o.id });
    o.holder = life.c;
    o.since = g.s.day;
    g.societyChanged(`o${o.prov}`);
    const seat = seatOf(g.s, life.c)!;
    return { life, label: seat.label };
  }

  test("a year with nothing delivered costs favour, more each idle year", () => {
    const g = world({ start: 1700 });
    const { life, label } = seated(g);
    expect(label).toMatch(/Justice/);
    ticks(g, 40);
    life.favor = 50;
    // Keep doing the duty so the office isn't lost, but deliver nothing.
    for (let i = 0; i < 13; i++) {
      const o = ensureOffices(g, life.prov).find((x) => x.key === "justice")!;
      o.duty = g.s.day;
      life.favor = Math.max(life.favor, 40);
      ticks(g, 30);
    }
    const slip = life.journal.find((j) =>
      /nothing to show for it/.test(j.text),
    );
    expect(slip).toBeDefined();
    expect(slip!.text).toContain(`−${seatSlip(1)}`);
    expect(seatSlip(1)).toBe(4);
    expect(seatSlip(2)).toBe(6);
    expect(seatSlip(5)).toBe(10);
  });

  test("something delivered in the year and the favour holds", () => {
    const g = world({ start: 1700 });
    const { life } = seated(g);
    ticks(g, 40);
    life.favor = 50;
    for (let i = 0; i < 13; i++) {
      const o = ensureOffices(g, life.prov).find((x) => x.key === "justice")!;
      o.duty = g.s.day;
      if (i % 4 === 0) delivered(g, life, "a bridge over the creek");
      ticks(g, 30);
    }
    expect(
      life.journal.some((j) => /nothing to show for it/.test(j.text)),
    ).toBe(false);
    expect(
      life.journal.some((j) => /your record speaks for you/.test(j.text)),
    ).toBe(true);
  });
});

describe("POLLS r16: elections that can be lost", () => {
  test("renown counts lightly and only so far", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g);
    const ref = { kind: "local" as const, o };
    life.renown = 40;
    const a = playerStanding(g.s, life, ref).lines.find((l) => l.k === "name")!;
    expect(a.v).toBeCloseTo(40 * POLL.renownPer, 1);
    life.renown = 300;
    const b = playerStanding(g.s, life, ref).lines.find((l) => l.k === "name")!;
    expect(b.v).toBe(POLL.renownCap);
  });

  test("renown can't carry a poll: a famous man with a scandal, who doesn't canvass, loses and is told why", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 120);
    life.renown = 250;
    life.purse = 45; // a freeholder by his purse; no treating, no canvass
    ensureCabinet(g, o.nation).faction[life.c] = "country";
    ticks(g, 100);
    // Before: renown 250 was worth 100 at a county poll (0.4 a point).
    const now = canvassNow(g.s, life)!;
    expect(now.me.lines.find((l) => l.k === "name")!.v).toBe(POLL.renownCap);
    expect(now.me.lines.find((l) => l.k === "gov")!.v).toBe(-POLL.govAgainst);
    expect(now.rival).not.toBeNull();
    // Renown is a tenth of his standing, not the whole of it.
    expect(now.me.total).toBeLessThan(60);
    // A scandal on top, and a rival the papers praise: the count can't save him.
    addSway(g, now.rival!.c, 12);
    life.scandal = { until: g.s.day + 400, text: "Talk of the tavern" };
    let lost = false;
    for (let i = 0; i < 60 && !lost; i++) {
      g.tick();
      lost = life.journal.some((j) => /You lost the poll for/.test(j.text));
    }
    expect(lost).toBe(true);
    expect(o.holder).not.toBe(life.c);
    const why = life.journal.find((j) => /^Why you lost the poll/.test(j.text));
    expect(why?.text).toMatch(/scandal|papers/);
    expect(life.polls?.last?.won).toBe(false);
    expect(life.polls!.last!.why.length).toBeGreaterThan(0);
    expect(life.polls?.canvass ?? null).toBeNull();
  });

  test("a candidate struck off the list at the count is told why", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 20);
    life.purse = 5; // no longer a freeholder
    let told = false;
    for (let i = 0; i < 60 && !told; i++) {
      g.tick();
      told = life.journal.some((j) => /struck off the list/.test(j.text));
    }
    expect(told).toBe(true);
    expect(o.holder).not.toBe(life.c);
  });

  test("the canvass is written week by week, with the rival and what moved it", () => {
    const g = world({ start: 1700 });
    const { life } = standing(g, "burgess", 200);
    ticks(g, 30);
    const cv = life.polls!.canvass!;
    expect(cv.weeks.length).toBeGreaterThanOrEqual(4);
    expect(cv.rival).toBeGreaterThanOrEqual(0);
    // Canvass at the tavern: next week it shows as moving your standing.
    life.cooldowns = {};
    for (const place of ["tavern", "market"] as const)
      g.lifeCommand("s1", { k: "act", place, act: "canvass" });
    ticks(g, 7);
    expect(cv.moved.some((m) => /Canvassing/.test(m.label) && m.v > 0)).toBe(
      true,
    );
    const now = canvassNow(g.s, life)!;
    expect(now.rival?.c).toBe(cv.rival);
    expect(now.chance).toBeGreaterThanOrEqual(0);
    expect(now.chance).toBeLessThanOrEqual(1);
  });

  test("canvassing fades a tenth a week unless it's kept up", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 200);
    o.candidates.find((x) => x.c === life.c)!.points = 40;
    ticks(g, 14);
    const pts = o.candidates.find((x) => x.c === life.c)!.points;
    expect(pts).toBeLessThan(40 * 0.9 + 0.1);
    expect(pts).toBeGreaterThan(40 * 0.81 - 0.2);
    expect(canvassValue(1000)).toBeLessThan(POLL.canvassCap);
    expect(treatValue(1000)).toBeLessThan(POLL.treatCap);
  });

  test("treating costs what its button says and moves the standing by what it says", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 200);
    const ref = { kind: "local" as const, o };
    const v = treatView(g.s, life);
    expect(v.ok).toBe(true);
    const before = playerStanding(g.s, life, ref).total;
    const purse = life.purse;
    expect(g.lifeCommand("s1", { k: "polls", act: "treat" })).toBeNull();
    expect(life.purse).toBeCloseTo(purse - v.cost, 5);
    const after = playerStanding(g.s, life, ref).total;
    expect(after - before).toBeCloseTo(v.gain, 0);
    // Once a week.
    expect(g.lifeCommand("s1", { k: "polls", act: "treat" })).toMatch(
      /Again in/,
    );
    // In the books under the poll's name.
    expect(JSON.stringify(life.books?.lines ?? [])).toMatch(
      /The poll for .*treating/,
    );
  });

  test("the sheriff's goodwill and a patron's interest: costs and effects as shown", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 200);
    const ref = { kind: "local" as const, o };
    const sh = sheriffOf(g.s, o.prov);
    if (sh) {
      sh.traits = sh.traits.filter((t) => t !== "honest");
      const before = playerStanding(g.s, life, ref).total;
      let tries = 0;
      // A plain sheriff takes it 6 times in 7; try on later days if he balks.
      while (life.polls?.canvass?.sheriff !== sh.id && tries++ < 1) {
        expect(g.lifeCommand("s1", { k: "polls", act: "sheriff" })).toBeNull();
      }
      if (life.polls!.canvass!.sheriff === sh.id) {
        const after = playerStanding(g.s, life, ref).total;
        expect(after - before).toBeCloseTo(POLL.sheriffBought, 0);
      } else
        expect(
          life.journal.some((j) => /sends your present back/.test(j.text)),
        ).toBe(true);
    }
    const pats = patronsFor(g.s, ref, life);
    expect(pats.length).toBeGreaterThan(0);
    const p = pats[0];
    // Make him willing.
    g.char(p.c.id).memories.push({
      of: meOf(g.s, life)!.id,
      why: "A friend",
      value: 40,
      until: g.s.day + 1000,
    });
    const before = playerStanding(g.s, life, ref).total;
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "polls", act: "patron", c: p.c.id }),
    ).toBeNull();
    expect(life.purse).toBeCloseTo(purse - p.price, 5);
    const after = playerStanding(g.s, life, ref).total;
    expect(after - before).toBeGreaterThanOrEqual(
      POLL.patronBought - POLL.patronOwn,
    );
  });

  test("the governor's friends work against a member of the country party", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 200);
    const n = o.nation;
    const ref = { kind: "local" as const, o };
    ensureCabinet(g, n).faction[life.c] = "country";
    expect(govInterest(g.s, ref, life)).toBe(-POLL.govAgainst);
    expect(
      playerStanding(g.s, life, ref).lines.find((l) => l.k === "gov")?.v,
    ).toBe(-POLL.govAgainst);
    ticks(g, 8);
    expect(
      life.journal.some((j) =>
        /governor's friends are working against you/.test(j.text),
      ),
    ).toBe(true);
  });

  test("the computer's challengers carry patrons and money, and the house's field has them", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 200;
    life.renown = 40;
    const n = meOf(g.s, life)!.nation;
    const pol = g.s.polities[n];
    pol.election = pollDay(g.s.day + 200);
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    ticks(g, 2);
    expect(pol.candidates.length).toBeGreaterThan(0);
    const ref = { kind: "assembly" as const, n };
    const field = fieldAt(g.s, ref);
    const npc = field.filter((x) => !x.player);
    expect(npc.length).toBeGreaterThanOrEqual(pol.candidates.length);
    // Some of them have a great man's interest, and money to treat as the poll nears.
    pol.election = pollDay(g.s.day + 20);
    const lines = fieldAt(g.s, ref)
      .filter((x) => !x.player)
      .flatMap((x) => x.st.lines.map((l) => l.k));
    expect(lines).toContain("treat");
    expect(lines).toContain("patron");
    const rival = rivalFor(g.s, life, ref);
    expect(rival).not.toBeNull();
    expect(life.journal.some((j) => /means to stand for/.test(j.text))).toBe(
      true,
    );
  });

  test("a seat in the house is fought in your county: beaten by its challenger, you lose it", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 200;
    life.renown = 60;
    const me = meOf(g.s, life)!;
    const pol = g.s.polities[me.nation];
    pol.election = pollDay(g.s.day + 60);
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    ticks(g, 2);
    const ref = { kind: "assembly" as const, n: me.nation };
    const rival = rivalFor(g.s, life, ref)!;
    // The rival shown is the county's own challenger, not the last seat.
    expect(pol.candidates.some((x) => x.c === rival.c)).toBe(true);
    expect(g.s.chars[rival.c].home).toBe(life.home);
    // The papers make him unbeatable in the county.
    addSway(g, rival.c, 30);
    addSway(g, me.id, -30);
    let done = false;
    for (let i = 0; i < 90 && !done; i++) {
      g.tick();
      done = life.journal.some((j) =>
        /election to|Elected to|Returned to/.test(j.text),
      );
    }
    expect(pol.assembly).not.toContain(me.id);
    expect(pol.assembly).toContain(rival.c);
    const why = life.journal.find((j) =>
      /^Why you lost the poll for/.test(j.text),
    )!;
    expect(why.text).toContain(g.s.chars[rival.c].first);
    expect(life.polls!.last!.rival).toBe(rival.c);
  });

  test("the chance shown is the count's own luck", () => {
    const r = new Rng({ rng: 12345 });
    for (const gap of [-6, -2, 0, 1, 3, 7]) {
      let win = 0;
      const N = 40000;
      for (let i = 0; i < N; i++) {
        const d =
          gap + r.int(-POLL.luck, POLL.luck) - r.int(-POLL.luck, POLL.luck);
        win += d > 0 ? 1 : d === 0 ? 0.5 : 0;
      }
      expect(win / N).toBeCloseTo(winChance(gap), 1);
    }
    expect(winChance(2 * POLL.luck + 1)).toBe(1);
    expect(winChance(-2 * POLL.luck - 1)).toBe(0);
  });

  test("the count's luck is on POLLS' own dice: the same seed, the same luck", () => {
    const a = world({ start: 1700, seed: 3 });
    const b = world({ start: 1700, seed: 3 });
    expect(countLuck(a, 42)).toBe(countLuck(b, 42));
    expect(Math.abs(countLuck(a, 42))).toBeLessThanOrEqual(POLL.luck);
  });

  test("a poll with no player in it is counted as it always was", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const o = ensureOffices(g, life.prov).find((x) => x.key === "selectman")!;
    // Nobody played stands; the count picks from the county by the old reckoning.
    expect(o.candidates.length).toBe(0);
    const due = pollDay(g.s.day + 10);
    o.election = due;
    ticks(g, 40);
    expect(o.election).not.toBe(due);
    expect(life.polls?.last ?? null).toBeNull();
  });

  test("the County offices row and the canvass agree", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 200);
    const row = localView(g.s, life, o);
    const now = canvassNow(g.s, life)!;
    expect(row.me.total).toBe(now.me.total);
    expect(row.rival?.c).toBe(now.rival?.c);
    expect(pollOf(g.s, life)?.kind).toBe("local");
    expect(OFFICES[o.key].how).toBe("elected");
  });

  test("a sitting member's canvass begins half a year before the count", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const o = ensureOffices(g, life.prov).find((x) => x.key === "burgess")!;
    o.holder = life.c;
    o.election = pollDay(g.s.day + 400);
    ticks(g, 2);
    expect(life.polls?.canvass ?? null).toBeNull();
    o.election = pollDay(g.s.day + 100);
    ticks(g, 2);
    expect(life.polls?.canvass?.kind).toBe("local");
  });

  test("a sitting member canvasses for the count ahead: the acts serve, the points count and fade", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    const pol = g.s.polities[me.nation];
    pol.assembly.push(me.id);
    pol.election = pollDay(g.s.day + 400);
    const canvassAct = ACTS.find((a) => a.key === "canvass")!;
    const broadside = ACTS.find((a) => a.key === "broadside")!;
    // Far from the count: nothing to canvass for.
    expect(canvassingSeat(g.s, life)).toBe(false);
    expect(canvassAct.when!(g.s, g.w, life).ok).toBe(false);
    pol.election = pollDay(g.s.day + 100);
    ticks(g, 2);
    expect(pollOf(g.s, life)?.kind).toBe("assembly");
    expect(canvassingSeat(g.s, life)).toBe(true);
    expect(canvassAct.when!(g.s, g.w, life).ok).toBe(true);
    expect(broadside.when!(g.s, g.w, life).ok).toBe(true);
    const ref = { kind: "assembly" as const, n: me.nation };
    const line = () =>
      playerStanding(g.s, life, ref).lines.find((l) => l.k === "canvass")?.v ??
      0;
    expect(line()).toBe(0);
    campaignBoost(g, life, 6, "a broadside");
    expect(life.polls!.canvass!.pts).toBe(6);
    expect(line()).toBeCloseTo(canvassValue(6), 1);
    expect(life.journal[life.journal.length - 1].text).toMatch(
      /Your campaign gains/,
    );
    // A week later it has faded a tenth.
    ticks(g, 7);
    expect(life.polls!.canvass!.pts).toBeCloseTo(6 * POLL.canvassFade, 1);
  });

  test("standing for a county office and the house at once, the canvass is for the one counted first", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 300);
    const me = meOf(g.s, life)!;
    const pol = g.s.polities[me.nation];
    pol.election = pollDay(g.s.day + 100);
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    ticks(g, 2);
    expect(pollOf(g.s, life)?.kind).toBe("assembly");
    expect(life.polls?.canvass?.kind).toBe("assembly");
    // The house's challenger was put up in the county.
    expect(pol.candidates.some((x) => g.s.chars[x.c].home === life.home)).toBe(
      true,
    );
    // With the county's poll sooner, the county's.
    o.election = pollDay(g.s.day + 30);
    expect(pollOf(g.s, life)?.kind).toBe("local");
  });

  test("nobody is returned unopposed by accident: at the count a challenger stands in the county", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 100;
    life.renown = 30;
    const me = meOf(g.s, life)!;
    const n = me.nation;
    const pol = g.s.polities[n];
    pol.election = pollDay(g.s.day + 200);
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    // As if the canvass had been for something else: nobody stands against him.
    pol.candidates = [];
    challengersAtCount(g, n);
    const put = pol.candidates.find((x) => g.s.chars[x.c].home === life.home);
    expect(put).toBeDefined();
    expect(put!.since).toBe(g.s.day);
    expect(
      life.journal.some((j) =>
        /stands against you at the last moment/.test(j.text),
      ),
    ).toBe(true);
    // Put up at the last moment, his canvass is a quarter of what it might be.
    pol.election = pollDay(g.s.day + 1);
    const ref = { kind: "assembly" as const, n };
    const st = npcStanding(g.s, ref, put!.c);
    const cv = st.lines.find((l) => l.k === "canvass")?.v ?? 0;
    expect(cv).toBeLessThanOrEqual(POLL.canvassCap * 0.25 + 0.05);
    expect(cv).toBeGreaterThan(0);
    // And he always has a great man's interest behind him.
    expect(npcPatron(g.s, ref, put!.c)).toBeGreaterThanOrEqual(0);
    expect(st.lines.some((l) => l.k === "patron")).toBe(true);
    // A second call puts up nobody more.
    const count = pol.candidates.length;
    challengersAtCount(g, n);
    expect(pol.candidates.length).toBe(count);
  });

  test("the challenger is the other party's man where the county has one, and his backers pay his treating", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    life.purse = 100;
    life.renown = 30;
    const me = meOf(g.s, life)!;
    const n = me.nation;
    const cab = ensureCabinet(g, n);
    cab.faction[life.c] = "court";
    // Every man who might stand is of the court, but one.
    const men = householdsOf(g.s, life.home).filter(
      (c) =>
        !c.female &&
        c.id !== me.id &&
        (c.role ? ROLES[c.role].status : 1) >= 3 &&
        c.nation === n,
    );
    for (const c of men) cab.faction[c.id] = "court";
    const odd = men.find((c) => !holdsPost(g.s, c.id) && ageOf(g.s, c) >= 25);
    if (odd) cab.faction[odd.id] = "country";
    const pol = g.s.polities[n];
    pol.election = pollDay(g.s.day + 200);
    expect(g.lifeCommand("s1", { k: "stand" })).toBeNull();
    ticks(g, 2);
    const first = pol.candidates.find(
      (x) => g.s.chars[x.c].home === life.home,
    )!;
    expect(first).toBeDefined();
    if (odd) expect(first.c).toBe(odd.id);
    expect(partyOf(g.s, n, first.c)).not.toBe("court");
    // Near the count he treats at least as his backers pay for it.
    pol.election = pollDay(g.s.day + 1);
    first.since = g.s.day - 400;
    const ref = { kind: "assembly" as const, n };
    const treat =
      npcStanding(g.s, ref, first.c).lines.find((l) => l.k === "treat")?.v ?? 0;
    expect(treat).toBeGreaterThanOrEqual(
      POLL.treatCap * POLL.challengerTreat - 0.05,
    );
  });

  test("a county's lean is graded: near the middle a party counts only a little", () => {
    const g = world({ start: 1700 });
    let mild = 0;
    for (let p = 0; p < g.s.provinces.length; p++) {
      const by = countyLeanBy(g.s, p);
      expect(Math.abs(by)).toBeLessThanOrEqual(1);
      const court = partyLine(g.s, p, "court");
      expect(court).toBeCloseTo(-partyLine(g.s, p, "country"), 6);
      expect(Math.abs(court)).toBeLessThanOrEqual(POLL.party);
      expect(countyLean(g.s, p)).toBe(by > 0 ? "country" : "court");
      if (Math.abs(by) < 0.5) {
        mild++;
        expect(Math.abs(court)).toBeLessThan(POLL.party / 2);
      }
    }
    expect(mild).toBeGreaterThan(0);
  });

  test("the computer's people are counted on a player's scale: station, a freehold, address", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const o = ensureOffices(g, life.prov).find((x) => x.key === "burgess")!;
    const ref = { kind: "local" as const, o };
    const man = householdsOf(g.s, life.home).find(
      (c) => c.role && ROLES[c.role].status === 4,
    )!;
    expect(man).toBeDefined();
    const st = npcStanding(g.s, ref, man.id);
    const v = (k: string) => st.lines.find((l) => l.k === k)?.v ?? 0;
    expect(v("station")).toBe(3 * POLL.stationPer);
    expect(v("freehold")).toBe(POLL.freeholder);
    expect(v("skill")).toBeLessThanOrEqual(POLL.persuasionCap);
    // A player's persuasion counts only so far too.
    life.skills.persuasion = 40;
    const mine = playerStanding(g.s, life, ref).lines.find(
      (l) => l.k === "skill",
    )!;
    expect(mine.v).toBeLessThanOrEqual(POLL.persuasionCap);
  });
});

describe("POLLS r16: a paper that speaks for its owner", () => {
  function paper(g: ReturnType<typeof world>, life: Life): Paper {
    const ps = power(g);
    const x: Paper = {
      id: g.nextId(),
      name: "The Virginia Courant",
      owner: life.c,
      p: life.home,
      nation: meOf(g.s, life)!.nation,
      founded: g.s.day,
      readers: 300,
      credit: 60,
      stance: "country",
      writers: [],
      next: [],
      printed: [],
      issued: g.s.day,
      licensed: true,
    };
    ps.papers.push(x);
    return x;
  }

  test("you may print in your own favour, never against yourself", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    paper(g, life);
    const t = pieceTargets(g.s, life, "c");
    const me = t.find((x) => x.id === life.c)!;
    expect(me.label).toBe("Yourself");
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "print",
        on: "c",
        c: life.c,
        side: -1,
      }),
    ).toMatch(/won't print against you/);
    expect(
      g.lifeCommand("s1", {
        k: "power",
        act: "print",
        on: "c",
        c: life.c,
        side: 1,
      }),
    ).toBeNull();
    const puff = life.polls!.puff!;
    expect(puff.v).toBeGreaterThan(0);
    expect(puff.v).toBeLessThanOrEqual(PUFF.max);
  });

  test("it persuades your own readers more, and raises eyebrows elsewhere", () => {
    const g = world({ start: 1700 });
    const { life, o } = standing(g, "burgess", 200);
    const x = paper(g, life);
    const fx = puffEffect(life, x, 4, g.s.day);
    expect(fx.here).toBeCloseTo(4 * PUFF.here, 5);
    expect(fx.elsewhere).toBeLessThan(0);
    (life.polls ??= {}).puff = { p: o.prov, v: fx.here, until: g.s.day + 100 };
    const here = playerStanding(g.s, life, { kind: "local", o }).lines.find(
      (l) => l.k === "puff",
    )!;
    expect(here.v).toBeCloseTo(fx.here, 1);
    life.polls!.puff = { p: o.prov + 1, v: fx.here, until: g.s.day + 100 };
    const there = playerStanding(g.s, life, { kind: "local", o }).lines.find(
      (l) => l.k === "puff",
    )!;
    expect(there.v).toBeLessThan(0);
  });

  test("a rival paper may mock it, at the chance shown", () => {
    const g = world({ start: 1700 });
    const life = lifeOf(g);
    const x = paper(g, life);
    expect(mockChance(g.s, x)).toBe(0);
    const ps = power(g);
    ps.papers.push({ ...x, id: g.nextId(), owner: -5, name: "The Gazette" });
    expect(mockChance(g.s, x)).toBeCloseTo(PUFF.mock, 5);
    x.credit = 30;
    expect(mockChance(g.s, x)).toBeCloseTo(PUFF.mock + PUFF.mockLowCredit, 5);
    // Over many months, the mockery comes about as often as shown.
    let mocked = 0;
    let printed = 0;
    for (let i = 0; i < 160; i++) {
      x.printed = [];
      x.credit = 30;
      const before = life.journal.length;
      if (
        g.lifeCommand("s1", {
          k: "power",
          act: "print",
          on: "c",
          c: life.c,
          side: 1,
        }) === null
      ) {
        printed++;
        if (
          life.journal
            .slice(before)
            .some((j) => /has some fun with it/.test(j.text))
        )
          mocked++;
      }
      ticks(g, 3);
    }
    expect(printed).toBeGreaterThan(100);
    const shown = PUFF.mock + PUFF.mockLowCredit;
    expect(mocked / printed).toBeGreaterThan(shown - 0.12);
    expect(mocked / printed).toBeLessThan(shown + 0.12);
  });
});

describe("POLLS r16: saves and the delta", () => {
  test("a canvass survives save and load; an old save without it loads", () => {
    const g = world({ start: 1700 });
    const { life } = standing(g, "burgess", 200);
    ticks(g, 15);
    const json = JSON.parse(JSON.stringify(g.s));
    const l2 = json.lives.find((l: Life) => l.seat === "s1") as Life;
    expect(l2.polls?.canvass?.weeks.length).toBe(
      life.polls!.canvass!.weeks.length,
    );
    // An old save: no polls on the life.
    delete l2.polls;
    expect(l2.polls).toBeUndefined();
    const life3 = { ...l2, renown: 70, favor: 70 } as Life;
    standingMonth(life3);
    expect(life3.renown).toBeLessThan(70);
  });

  test("the canvass rides the delta to the player's screen", () => {
    const g = world({ start: 1700 });
    standing(g, "burgess", 200);
    g.takeDelta();
    ticks(g, 7);
    const d = g.takeDelta();
    const l =
      (d.lifePatch?.s1 as Partial<Life> | undefined) ??
      (d.lives?.s1 as Partial<Life> | undefined);
    expect(l?.polls?.canvass?.weeks.length).toBeGreaterThan(0);
  });

  test("in company, a present to the sheriff and the canvass's book are sent to nobody else", () => {
    const g = world({
      start: 1700,
      plans: [
        { seat: "s1", name: "Alden", plan: plan() },
        {
          seat: "s2",
          name: "Beatrice",
          plan: plan({ first: "Beatrice", female: true }),
        },
      ],
    });
    const { life, o } = standing(g, "burgess", 200);
    const sh = sheriffOf(g.s, o.prov);
    expect(sh).toBeDefined();
    sh!.traits = sh!.traits.filter((t) => t !== "honest");
    g.takeDelta();
    expect(g.lifeCommand("s1", { k: "polls", act: "treat" })).toBeNull();
    expect(g.lifeCommand("s1", { k: "polls", act: "sheriff" })).toBeNull();
    ticks(g, 8);
    const cv = life.polls!.canvass!;
    const bribe = /present for|sends your present back/;
    // His own copy has it all.
    expect(cv.spent.treat).toBeGreaterThan(0);
    expect(life.journal.some((j) => bribe.test(j.text))).toBe(true);
    expect(cv.weeks.length).toBeGreaterThan(0);
    // Beatrice's copy, on joining or a resync: the treating, not the present.
    const hers = stateForIntrigue(g.s, "s2").lives.find(
      (l) => l.seat === "s1",
    )!;
    expect(hers.polls!.canvass!.sheriff).toBe(-1);
    expect(hers.polls!.canvass!.spent).toEqual({});
    expect(hers.polls!.canvass!.weeks).toEqual([]);
    expect(hers.polls!.canvass!.treat).toBe(cv.treat);
    expect(hers.journal.some((j) => bribe.test(j.text))).toBe(false);
    // His own copy is untouched.
    const his = stateForIntrigue(g.s, "s1").lives.find((l) => l.seat === "s1")!;
    expect(his.polls!.canvass!.spent.sheriff ?? cv.spent.sheriff).toBe(
      cv.spent.sheriff,
    );
    // And the delta, seat by seat.
    g.lifeCommand("s1", { k: "polls", act: "treat" });
    ticks(g, 1);
    const d = g.takeDelta();
    expect(deltaHasSecrets(d)).toBe(true);
    const toHer = deltaForSeat(g.s, d, "s2");
    const lp = (toHer.lifePatch?.s1 ?? toHer.lives?.s1) as
      | Partial<Life>
      | undefined;
    if (lp?.polls?.canvass) {
      expect(lp.polls.canvass.sheriff).toBe(-1);
      expect(lp.polls.canvass.spent).toEqual({});
    }
    expect((lp?.journal ?? []).some((j) => bribe.test(j.text))).toBe(false);
    // At the count, the reasons are his alone.
    o.election = pollDay(g.s.day + 2);
    ticks(g, 40);
    expect(life.polls!.last).toBeTruthy();
    expect(life.polls!.last!.why.length).toBeGreaterThan(0);
    const after = stateForIntrigue(g.s, "s2").lives.find(
      (l) => l.seat === "s1",
    )!;
    expect(after.polls!.last!.won).toBe(life.polls!.last!.won);
    expect(after.polls!.last!.why).toEqual([]);
    expect(after.journal.some((j) => /^Why you (won|lost)/.test(j.text))).toBe(
      false,
    );
  });

  test("a life's plan with no politics never gets a canvass", () => {
    const g = world({
      start: 1700,
      plans: [
        { seat: "s1", name: "Alden", plan: plan({ background: "farmer" }) },
      ],
    });
    ticks(g, 60);
    expect(lifeOf(g).polls?.canvass ?? null).toBeNull();
  });
});
