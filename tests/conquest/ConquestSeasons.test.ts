// MAP (r12): seasons that matter. Winter roads in the north, rivers crossed
// on the ice and in flood, harbours frozen shut, the mud of the thaw;
// harvest wages and the harvest stint, prime winter furs, little fishing
// in the ice; bread dear in the hungry months; sickness in its season;
// fewer travellers in a hard winter; the season on the date line. All of
// it from the date and the place, so it stays deterministic.

import { describe, expect, test } from "vitest";
import { seasonLook } from "../../src/conquest/client/MapView";
import { stormsOn } from "../../src/conquest/client/SeasonArt";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { raiseEvent } from "../../src/conquest/engine/Hooks";
import { actCheck } from "../../src/conquest/engine/LifeActs";
import {
  monthlyBudget,
  travelRoute,
} from "../../src/conquest/engine/LifeQueries";
import { priceView } from "../../src/conquest/engine/Markets";
import { routeTree } from "../../src/conquest/engine/Paths";
import {
  foodSeasonFactor,
  harvestOf,
  iceBound,
  riverFactor,
  roadFactor,
  seasonLabel,
  seasonNotes,
  seasonOfMonth,
  seasonPay,
  travelFactor,
} from "../../src/conquest/engine/Seasons";
import { lifeOf, map, plan, prov, ticks, world } from "./LifeUtil";

const P = map.provinces;
const at = (name: string) => P[prov(name)];

describe("the seasons (MAP r12)", () => {
  test("the year turns: winter, spring, summer, autumn", () => {
    expect([11, 0, 1].map(seasonOfMonth)).toEqual([
      "winter",
      "winter",
      "winter",
    ]);
    expect(seasonOfMonth(3)).toBe("spring");
    expect(seasonOfMonth(6)).toBe("summer");
    expect(seasonOfMonth(9)).toBe("autumn");
  });

  test("northern roads: snow in winter, mud in the thaw, good in summer", () => {
    const quebec = at("Quebec");
    expect(roadFactor(quebec, 0)).toBeGreaterThan(1.3);
    expect(roadFactor(quebec, 3)).toBeGreaterThan(1.1);
    expect(roadFactor(quebec, 6)).toBe(1);
    // The south's winter is mild.
    expect(roadFactor(at("Havana"), 0)).toBe(1);
    // Rivers crossed on the ice; twice as long in flood.
    expect(riverFactor(47, 0)).toBe(0);
    expect(riverFactor(47, 3)).toBe(2);
    expect(riverFactor(30, 0)).toBe(1);
  });

  test("ice shuts the St. Lawrence, Hudson's Bay and the lakes, not Boston", () => {
    expect(iceBound(at("Quebec"), 0)).toBe(true);
    expect(iceBound(at("Quebec"), 6)).toBe(false);
    expect(iceBound(at("York Factory"), 4)).toBe(true);
    expect(iceBound(at("Massachusetts Bay"), 0)).toBe(false);
    expect(iceBound(at("Avalon"), 0)).toBe(false);
    expect(iceBound(at("Détroit"), 1)).toBe(true);
  });

  test("a winter journey in the north takes longer; ships don't sail from a frozen port", () => {
    const g = world({
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({
            origin: "france",
            home: prov("Quebec"),
            religion: "catholic",
            family: "Lefebvre",
          }),
        },
      ],
    });
    const life = lifeOf(g);
    const to = prov("Hochelaga");
    g.s.day = dayOf(1608, 0, 10);
    const winter = travelRoute(g.s, map, life.prov, to, true)!;
    g.s.day = dayOf(1608, 6, 10);
    const summer = travelRoute(g.s, map, life.prov, to, true)!;
    expect(winter.days).toBeGreaterThan(summer.days);
    // In January the river is frozen: overland only.
    expect(winter.sea.some(Boolean)).toBe(false);
    // Armies too.
    const fr = g.s.nations.findIndex((n) => n.key === "france");
    g.s.day = dayOf(1608, 0, 10);
    const armyWinter = routeTree(g.s, map, fr, life.prov, 1, to).days[to];
    g.s.day = dayOf(1608, 6, 10);
    const armySummer = routeTree(g.s, map, fr, life.prov, 1, to).days[to];
    expect(armyWinter).toBeGreaterThan(armySummer);
  });

  test("the harvest: fair most years, good or poor some, the same in every game", () => {
    const n = { poor: 0, fair: 0, good: 0 };
    for (let y = 1607; y < 1776; y++) n[harvestOf(37.5, -76.5, y)]++;
    expect(n.fair).toBeGreaterThan(n.poor);
    expect(n.good).toBeGreaterThan(10);
    expect(n.poor).toBeGreaterThan(10);
    // Neighbours share a harvest; the great frost of 1709 was hard everywhere.
    expect(harvestOf(37.5, -76.5, 1650)).toBe(harvestOf(37.9, -76.9, 1650));
    expect(harvestOf(37.5, -76.5, 1650)).toBe(harvestOf(37.5, -76.5, 1650));
  });

  test("bread is dear in the hungry months and cheap after the harvest", () => {
    const d = (m: number) => dayOf(1650, m, 15);
    const j = at("Jamestown");
    expect(foodSeasonFactor(j.lat, j.lon, d(2))).toBeGreaterThan(
      foodSeasonFactor(j.lat, j.lon, d(9)),
    );
    const g = world();
    const p = prov("Jamestown");
    g.s.day = d(2);
    const march = priceView(g.s, g.w, p, "grain");
    g.s.day = d(9);
    const october = priceView(g.s, g.w, p, "grain");
    expect(march.price).toBeGreaterThan(october.price);
    expect(march.why.join(" ")).toMatch(/hungry months/);
  });

  test("harvest wages for a hand in the fields; prime winter furs; frozen harbours idle", () => {
    const j = at("Jamestown");
    const sept = seasonPay(j, dayOf(1650, 8, 10), "farmer", 4, 3);
    expect(sept.some((x) => /Harvest wages/.test(x.label) && x.value > 0)).toBe(
      true,
    );
    const q = at("Quebec");
    const jan = (job: string) => seasonPay(q, dayOf(1650, 0, 10), job, 4, 3);
    expect(jan("trapper").some((x) => /Prime winter furs/.test(x.label))).toBe(
      true,
    );
    expect(jan("farmer").some((x) => x.value < 0)).toBe(true);
    expect(jan("sailor").some((x) => /frozen/.test(x.label))).toBe(true);
    // The hungry months cost a little more to live in the north.
    const march = seasonPay(q, dayOf(1650, 2, 10), null, 0, 3);
    expect(march[0].value).toBeLessThan(0);
    // And the month's money shows it.
    const g = world();
    const life = lifeOf(g);
    g.s.day = dayOf(1608, 8, 5);
    const b = monthlyBudget(g.s, g.w, life);
    expect(b.parts.some((x) => /Harvest wages/.test(x.label))).toBe(true);
  });

  test("helping bring in the harvest: only in its months, for harvest wages", () => {
    const g = world();
    const life = lifeOf(g);
    g.s.day = dayOf(1608, 5, 5);
    expect(actCheck(g.s, g.w, life, "fields", "harvest").ok).toBe(false);
    g.s.day = dayOf(1608, 8, 5);
    expect(actCheck(g.s, g.w, life, "fields", "harvest").ok).toBe(true);
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", { k: "act", place: "fields", act: "harvest" }),
    ).toBeNull();
    expect(life.purse).toBeGreaterThan(purse);
    expect(life.journal.some((j) => /harvest/.test(j.text))).toBe(true);
    // Not again at once.
    expect(actCheck(g.s, g.w, life, "fields", "harvest").ok).toBe(false);
  });

  test("a chill on the chest in a northern winter", () => {
    const g = world({
      plans: [
        {
          seat: "s1",
          name: "Alden",
          plan: plan({
            origin: "france",
            home: prov("Quebec"),
            religion: "catholic",
            family: "Lefebvre",
          }),
        },
      ],
    });
    const life = lifeOf(g);
    g.s.day = dayOf(1608, 0, 10);
    raiseEvent(g, life, "season-chill");
    const ev = life.events.find((e) => e.key === "season-chill")!;
    expect(ev).toBeDefined();
    const health = life.health;
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 }),
    ).toBeNull();
    expect(life.health).toBeLessThan(health);
  });

  test("fewer people on the roads in a hard winter", () => {
    expect(travelFactor(47, 0)).toBeLessThan(0.6);
    expect(travelFactor(30, 0)).toBe(1);
  });

  test("the date line: the season, and what it brings where you are", () => {
    const q = at("Quebec");
    const jan = seasonLabel(q, dayOf(1650, 0, 10));
    expect(jan.name).toBe("Winter");
    expect(jan.note).toBe("ice-bound");
    const h = at("Havana");
    expect(seasonLabel(h, dayOf(1650, 8, 10)).icon).toBe("hurricane");
    const notes = seasonNotes(q, dayOf(1650, 0, 10), false);
    expect(notes.join(" ")).toMatch(/ice/);
    expect(
      seasonNotes(at("Jamestown"), dayOf(1650, 8, 10), false).join(" "),
    ).toMatch(/harvest/);
  });

  test("the chart changes with the season's look, nine times a year", () => {
    const looks = new Set(Array.from({ length: 12 }, (_, m) => seasonLook(m)));
    expect(looks.size).toBeLessThanOrEqual(9);
    expect(seasonLook(0)).not.toBe(seasonLook(6));
  });

  test("hurricanes only in their season, the same on every screen", () => {
    let seen = 0;
    for (let d = dayOf(1650, 0, 1); d < dayOf(1651, 0, 1); d += 1) {
      const storms = stormsOn(d, map.width);
      if (storms.length) {
        seen++;
        const m = new Date(Date.UTC(2001, 0, 1 + (d % 365))).getUTCMonth();
        expect(m).toBeGreaterThanOrEqual(7);
        expect(m).toBeLessThanOrEqual(11);
      }
    }
    expect(seen).toBeGreaterThan(5);
    expect(stormsOn(dayOf(1650, 8, 20), map.width)).toEqual(
      stormsOn(dayOf(1650, 8, 20), map.width),
    );
  });

  test("the same seasons in two games played alike", () => {
    const run = () => {
      const g = world({
        plans: [
          {
            seat: "s1",
            name: "Alden",
            plan: plan({
              origin: "france",
              home: prov("Quebec"),
              religion: "catholic",
              family: "Lefebvre",
            }),
          },
        ],
      });
      ticks(g, 400);
      const life = lifeOf(g);
      return JSON.stringify([life.purse, life.health, life.journal.length]);
    };
    expect(run()).toBe(run());
  }, 60_000);
});
