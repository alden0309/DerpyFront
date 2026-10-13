// TOWNS (r17): a town's people grow with it, nobody is stuck with no one to
// marry, a town taken keeps its places as ruins (a native nation its
// landing), and the town's own government builds and repairs its works by
// vote: the odds shown are the odds rolled, a ruined dock rebuilt works for
// travel again, and old saves load.

import { describe, expect, test } from "vitest";
import { kill } from "../../src/conquest/engine/Characters";
import { cede } from "../../src/conquest/engine/Crown";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { householdsOf, postsIn } from "../../src/conquest/engine/Folk";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { hooks } from "../../src/conquest/engine/Hooks";
import {
  canEmbark,
  placesIn,
  travelRoute,
} from "../../src/conquest/engine/LifeQueries";
import { LOCALS_CAP, PLACES } from "../../src/conquest/engine/LifeRules";
import { ensureOffices } from "../../src/conquest/engine/Offices";
import { Rng } from "../../src/conquest/engine/Rng";
import {
  headsOf,
  householdRoom,
  HOUSEHOLDS,
  marriageable,
  townsState,
} from "../../src/conquest/engine/TownsCore";
import type { GameState, Life } from "../../src/conquest/engine/Types";
import {
  bodyOf,
  carryChance,
  leansOn,
  membersOf,
  proposeCheck,
  REPAIR,
  stillWanted,
  TOWN_WORKS,
  workCost,
  workFits,
} from "../../src/conquest/engine/WorksCore";
import { lifeOf, map, plan, prov, ticks, toNextMonth, world } from "./LifeUtil";

const STA = prov("St. Augustine");

function spanish(start: 1607 | 1650 | 1700 = 1700, seed = 7, female = false) {
  return world({
    start,
    seed,
    plans: [
      {
        seat: "s1",
        name: "Diego",
        plan: plan({
          origin: "spain",
          home: STA,
          religion: "catholic",
          first: female ? "Ana" : "Diego",
          family: "Ruiz",
          female,
          age: 24,
        }),
      },
    ],
  });
}

function nationKey(g: ConquestGame, key: string): number {
  return g.s.nations.findIndex((n) => n.key === key);
}

/** The player sits on the town's body (as a justice, or the alcalde). */
function seat(g: ConquestGame, life: Life): void {
  const list = ensureOffices(g, life.prov);
  const o = list.find((x) => x.key === "justice") ?? list[0];
  o.holder = life.c;
}

/** Each month for `months`, whether the town had a woman free to marry. */
function marketMonths(g: ConquestGame, p: number, months: number): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < months; i++) {
    toNextMonth(g);
    const owner = g.s.nations[g.s.provinces[p].owner];
    out.push(
      householdsOf(g.s, p).some(
        (c) => c.female && marriageable(g.s, c) && c.culture === owner.culture,
      ),
    );
  }
  return out;
}

function longestFalse(xs: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const x of xs) {
    run = x ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

describe("newcomers with the settlers", () => {
  test("ships and the road bring households, and both sexes stay on the marriage market", () => {
    const g = spanish(1607, 3);
    const months = marketMonths(g, STA, 12 * 12);
    const t = townsState(g);
    const came = t.came[STA] ?? [];
    // People came, by ship or down the road, with the news of who.
    expect(
      came.some((a) => !a.gone && (a.how === "ship" || a.how === "road")),
    ).toBe(true);
    expect(came.every((a) => a.text.length > 20)).toBe(true);
    // Before: 9 months in 10 had no woman free to marry, for up to 10 years at a stretch.
    const share = months.filter(Boolean).length / months.length;
    expect(share).toBeGreaterThan(0.6);
    expect(longestFalse(months)).toBeLessThanOrEqual(26);
    // Men too.
    expect(
      householdsOf(g.s, STA).some((c) => !c.female && marriageable(g.s, c)),
    ).toBe(true);
  });

  test("settlers arriving bring people in proportion", () => {
    const g = spanish();
    toNextMonth(g);
    toNextMonth(g);
    const t = townsState(g);
    // Make room, then land 400 more settlers at the port.
    const before = (t.came[STA] ?? []).filter((a) => !a.gone).length;
    for (const id of [...(g.s.locals[STA] ?? [])]) {
      const c = g.s.chars[id];
      if (c && !c.role)
        g.s.locals[STA] = g.s.locals[STA].filter((x) => x !== id);
    }
    const pr = g.s.provinces[STA];
    pr.pops[0].size += 400;
    toNextMonth(g);
    const after = (t.came[STA] ?? []).filter((a) => !a.gone).length;
    expect(after).toBeGreaterThan(before);
  });

  test("the caps hold: households by the town's size, and the posts at fourteen", () => {
    const g = spanish(1650, 11);
    for (let y = 0; y < 8; y++) {
      for (let m = 0; m < 12; m++) toNextMonth(g);
      for (const key of Object.keys(g.s.locals)) {
        const p = Number(key);
        const list = g.s.locals[p];
        expect(postsIn(g.s, list)).toBeLessThanOrEqual(LOCALS_CAP);
        // What it holds, the turnover over it, and the one who came because nobody could marry.
        expect(headsOf(g.s, p).length).toBeLessThanOrEqual(
          Math.max(householdRoom(g.s, p), HOUSEHOLDS.min) + HOUSEHOLDS.over + 3,
        );
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });

  test("a widow keeps house with her children when the holder of a post dies", () => {
    const g = spanish();
    toNextMonth(g);
    const holder = (g.s.locals[STA] ?? [])
      .map((id) => g.s.chars[id])
      .find((c) => c?.role && c.alive && g.s.chars[c.spouse]?.alive);
    expect(holder).toBeDefined();
    const wife = g.s.chars[holder!.spouse];
    kill(g, holder!, "a fever at 50");
    toNextMonth(g);
    expect(g.s.locals[STA]).toContain(wife.id);
    expect(wife.came?.how).toBe("widow");
    expect(householdsOf(g.s, STA).map((c) => c.id)).toContain(wife.id);
  });

  test("a town with nobody to marry for a year or two draws someone through ordinary life", () => {
    const g = spanish();
    toNextMonth(g);
    const t = townsState(g);
    // Nobody free to marry among the women; and nobody to come for a year.
    for (const c of householdsOf(g.s, STA))
      if (c.female && marriageable(g.s, c)) c.spouse = 999999;
    t.dry[STA] = { w: g.s.day - 900 };
    const before = (t.came[STA] ?? []).length;
    toNextMonth(g);
    const now = householdsOf(g.s, STA).filter(
      (c) => c.female && marriageable(g.s, c),
    );
    expect(now.length).toBeGreaterThan(0);
    // It came as news (a grown child of the town keeps house without it).
    const came = t.came[STA] ?? [];
    expect(came.length).toBeGreaterThanOrEqual(before);
  });

  test("a native town takes in kin from the nation's other towns", () => {
    const g = world({
      start: 1700,
      seed: 5,
      plans: [
        {
          seat: "s1",
          name: "Pat",
          plan: plan({
            origin: "muscogee",
            home: prov("Coweta"),
            religion: "native",
            first: "Hothli",
            family: "of the Wind clan",
            background: "warrior",
          }),
        },
      ],
    });
    const p = prov("Coweta");
    for (let i = 0; i < 36; i++) toNextMonth(g);
    const t = townsState(g);
    const heads = headsOf(g.s, p);
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.every((c) => c.religion === "native")).toBe(true);
    for (const a of t.came[p] ?? [])
      if (!a.gone) expect(["visit", "marry", "kin", "grown"]).toContain(a.how);
  });
});

describe("a town taken: ruins, a landing, and its people", () => {
  test("a burned wharf is a ruin, not gone; a peace that hands the town to a native nation keeps its landing", () => {
    const g = spanish();
    toNextMonth(g);
    const s = g.s;
    const pr = s.provinces[STA];
    expect(pr.b.port).toBeGreaterThan(0);
    const muscogee = nationKey(g, "muscogee");
    // Warriors take it and burn it (as War.ts's raze does).
    pr.occupier = muscogee;
    pr.b.port = 0;
    pr.devastation = 0.7;
    toNextMonth(g);
    const ruin = townsState(g).ruins[STA]?.find((r) => r.key === "wharf");
    expect(ruin).toMatchObject({ lvl: 1, how: "burned", by: muscogee });
    pr.occupier = -1;
    // A second town, not burned: the peace hands it over and the landing stays.
    const g2 = spanish();
    toNextMonth(g2);
    const s2 = g2.s;
    const timucua = nationKey(g2, "timucua");
    s2.provinces[STA].b = {}; // the settlers flee and leave it all (War.ts's giveProvince)
    s2.provinces[STA].pops = s2.provinces[STA].pops.filter(
      (x) => x.cls === "tribe",
    );
    cede(g2, STA, timucua);
    expect(s2.provinces[STA].b.port).toBe(1);
    expect(placesIn(s2, g2.w, STA)).toContain("docks");
    expect(PLACES.docks.nativeName).toBe("The landing");
    expect(canEmbark(s2, map, STA, false)).toBe(true);
    // What else stood is remembered as ruins.
    expect(
      (townsState(g2).ruins[STA] ?? []).every((r) => r.how === "abandoned"),
    ).toBe(true);
    expect(bodyOf(s2, STA).name).toBe("the council fire");
  });

  test("the hook does nothing the second time; colonists go with the settlers and the nation's people take the posts", () => {
    const g = spanish();
    toNextMonth(g);
    const s = g.s;
    const timucua = nationKey(g, "timucua");
    const spain = s.provinces[STA].owner;
    const life = lifeOf(g);
    const colonists = (s.locals[STA] ?? []).filter(
      (id) => s.chars[id]?.religion !== "native" && id !== life.c,
    );
    expect(colonists.length).toBeGreaterThan(3);
    s.provinces[STA].pops = s.provinces[STA].pops.filter(
      (x) => x.cls === "tribe",
    );
    s.provinces[STA].b = {};
    cede(g, STA, timucua);
    const after = [...(s.locals[STA] ?? [])];
    for (const h of hooks.provinceTaken) h(g, STA, spain, timucua);
    expect(s.locals[STA]).toEqual(after);
    // The colonists (save any of the player's own) have gone; the nation's people hold the posts.
    const left = (s.locals[STA] ?? []).filter(
      (id) => s.chars[id]?.religion !== "native",
    );
    expect(left.length).toBeLessThan(colonists.length / 2);
    expect(
      (s.locals[STA] ?? []).some((id) => s.chars[id]?.role === "sachem"),
    ).toBe(true);
    expect(
      (townsState(g).came[STA] ?? []).some(
        (a) => a.gone && /with the settlers/.test(a.text),
      ),
    ).toBe(true);
  });
});

describe("public works by vote", () => {
  test("the odds shown are the odds the sitting rolls", () => {
    const g = spanish();
    toNextMonth(g);
    const life = lifeOf(g);
    seat(g, life);
    const s = g.s;
    const motion = {
      p: STA,
      key: "markethouse" as const,
      repair: false,
      by: life.c,
      petition: false,
      levy: 20,
      pledge: 0,
      seed: 4242,
    };
    const leans = leansOn(s, motion, { [life.c]: 1 });
    expect(leans.length).toBeGreaterThanOrEqual(3);
    const odds = carryChance(leans);
    const r = new Rng({ rng: 12345 });
    let carried = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      let ayes = 0;
      let noes = 0;
      for (const l of leans) {
        const v = l.player ? (l.cast ?? 0) : r.chance(l.p) ? 1 : -1;
        if (v > 0) ayes++;
        else if (v < 0) noes++;
      }
      if (ayes > noes) carried++;
    }
    expect(Math.abs(carried / N - odds)).toBeLessThan(0.025);
    // A player who votes against moves the odds.
    const against = carryChance(leansOn(s, motion, { [life.c]: -1 }));
    expect(against).toBeLessThan(odds);
  });

  test("a proposal carries or is thrown out by its votes, as the members lean", () => {
    const g = spanish();
    toNextMonth(g);
    const life = lifeOf(g);
    seat(g, life);
    const s = g.s;
    life.purse = 200;
    // The members' minds made up: everyone on the body loves the mover...
    for (const id of membersOf(s, STA)) {
      const c = s.chars[id];
      if (!c || id === life.c) continue;
      c.memories.push({
        of: life.c,
        why: "A great friend",
        value: 90,
        until: 0,
      });
    }
    expect(proposeCheck(s, g.w, life, "markethouse", 25).ok).toBe(true);
    expect(
      g.lifeCommand("s1", {
        k: "towns",
        act: "propose",
        key: "markethouse",
        coins: 25,
      }),
    ).toBeNull();
    const work = townsState(g).works.find((x) => x.key === "markethouse")!;
    expect(work.stage).toBe("proposed");
    while (g.s.day < work.sits) g.tick();
    toNextMonth(g);
    const done = [...townsState(g).works, ...townsState(g).past].find(
      (x) => x.id === work.id,
    )!;
    expect(["carried", "building", "done"]).toContain(done.stage);
    expect(done.votes?.length).toBe(membersOf(s, STA).length);
    expect(done.ayes).toBeGreaterThan(done.noes ?? 0);
    expect(
      done.votes?.filter((v) => v.v > 0 && v.c !== life.c).every((v) => v.why),
    ).toBe(true);
    // ...and hate the next one.
    for (const id of membersOf(s, STA)) {
      const c = s.chars[id];
      if (!c || id === life.c) continue;
      c.memories = c.memories.filter((m) => m.of !== life.c);
      c.memories.push({
        of: life.c,
        why: "A sworn enemy",
        value: -90,
        until: 0,
      });
    }
    expect(
      g.lifeCommand("s1", { k: "towns", act: "propose", key: "road" }),
    ).toBeNull();
    const road = townsState(g).works.find((x) => x.key === "road")!;
    const odds = carryChance(
      leansOn(
        s,
        {
          p: STA,
          key: "road",
          repair: false,
          by: life.c,
          petition: false,
          levy: road.levy,
          pledge: 0,
          seed: road.id,
        },
        road.cast,
      ),
    );
    expect(odds).toBeLessThan(0.2);
    while (g.s.day < road.sits) g.tick();
    toNextMonth(g);
    const lost = townsState(g).past.find((x) => x.id === road.id);
    expect(lost?.stage).toBe("lost");
    // Not again for half a year.
    expect(proposeCheck(s, g.w, life, "road").ok).toBe(false);
  });

  test("a ruined dock is repaired by vote, paid by levy and subscription, and works for travel again", () => {
    const g = spanish();
    toNextMonth(g);
    const s = g.s;
    const life = lifeOf(g);
    const pr = s.provinces[STA];
    const muscogee = nationKey(g, "muscogee");
    pr.occupier = muscogee;
    pr.b.port = 0;
    pr.devastation = 0.7;
    toNextMonth(g);
    pr.occupier = -1;
    expect(canEmbark(s, map, STA, false)).toBe(false);
    expect(placesIn(s, g.w, STA)).not.toContain("docks");
    seat(g, life);
    life.purse = 300;
    for (const id of membersOf(s, STA))
      if (id !== life.c)
        s.chars[id]?.memories.push({
          of: life.c,
          why: "Trusted",
          value: 60,
          until: 0,
        });
    const cost = workCost(s, STA, "wharf");
    expect(cost.repair).toBe(true);
    expect(cost.cost).toBe(Math.round(TOWN_WORKS.wharf.cost * REPAIR.cost));
    expect(workFits(s, g.w, STA, "wharf").ok).toBe(true);
    const purse = life.purse;
    expect(
      g.lifeCommand("s1", {
        k: "towns",
        act: "propose",
        key: "wharf",
        coins: 10,
      }),
    ).toBeNull();
    const work = townsState(g).works.find((x) => x.key === "wharf")!;
    while (g.s.day < work.sits) g.tick();
    toNextMonth(g);
    expect(work.stage === "carried" || work.stage === "building").toBe(true);
    // The pledge was paid when it carried; the levy makes the town a little restless.
    expect(life.purse).toBeLessThan(purse);
    expect(pr.mods.some((m) => m.key === `town-levy-${work.id}`)).toBe(true);
    // Subscribe what's still wanted (the button's sum), and it's begun.
    if (work.stage === "carried") {
      const want = stillWanted(work);
      expect(
        g.lifeCommand("s1", {
          k: "towns",
          act: "subscribe",
          id: work.id,
          coins: want,
        }),
      ).toBeNull();
      expect(life.books?.lines.some((l) => /Subscribed/.test(l.l))).toBe(true);
    }
    expect(work.stage).toBe("building");
    ticks(g, (work.done ?? g.s.day) - g.s.day + 1);
    toNextMonth(g);
    expect(work.stage).toBe("done");
    expect(pr.b.port).toBe(1);
    expect(
      townsState(g).ruins[STA]?.find((r) => r.key === "wharf"),
    ).toBeUndefined();
    expect(placesIn(s, g.w, STA)).toContain("docks");
    expect(canEmbark(s, map, STA, false)).toBe(true);
    const route = travelRoute(s, map, STA, prov("Havana"), true);
    expect(route?.sea.some(Boolean)).toBe(true);
    expect(life.milestones.some((m) => /wharf/i.test(m.text))).toBe(true);
  });

  test("a petition from someone who doesn't sit, and the computer's members bring a repair themselves", () => {
    const g = spanish();
    toNextMonth(g);
    const s = g.s;
    const life = lifeOf(g);
    // Not a member: a petition.
    expect(
      g.lifeCommand("s1", { k: "towns", act: "propose", key: "markethouse" }),
    ).toBeNull();
    const pet = townsState(g).works.find((x) => x.key === "markethouse")!;
    expect(pet.petition).toBe(true);
    expect(pet.cast[life.c]).toBeUndefined();
    // A ruin nobody brings: the town's own people do, within a couple of years.
    s.provinces[STA].b.port = 0;
    s.provinces[STA].devastation = 0.5;
    toNextMonth(g);
    let brought = false;
    for (let i = 0; i < 30 && !brought; i++) {
      toNextMonth(g);
      brought = [...townsState(g).works, ...townsState(g).past].some(
        (x) => x.key === "wharf" && x.by !== life.c,
      );
    }
    expect(brought).toBe(true);
  });
});

describe("saves and the delta", () => {
  test("old saves load, and the towns ride the delta", () => {
    const g = spanish();
    toNextMonth(g);
    toNextMonth(g);
    const json = JSON.parse(JSON.stringify(g.s)) as GameState;
    delete json.towns;
    for (const c of Object.values(json.chars)) delete c.came;
    const old = new ConquestGame(map, json);
    for (let i = 0; i < 3; i++) toNextMonth(old);
    expect(old.s.towns).toBeDefined();
    // A player's copy follows the delta.
    const copy = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 4; i++) {
      toNextMonth(g);
      applyDelta(copy, g.takeDelta());
    }
    expect(copy.towns?.came).toEqual(g.s.towns?.came);
    expect(copy.towns?.works).toEqual(g.s.towns?.works);
    expect(copy.locals[STA]).toEqual(g.s.locals[STA]);
    // The same seed runs the same.
    const a = spanish(1700, 9);
    const b = spanish(1700, 9);
    for (let i = 0; i < 6; i++) {
      toNextMonth(a);
      toNextMonth(b);
    }
    expect(JSON.stringify(a.s.towns)).toBe(JSON.stringify(b.s.towns));
    expect(a.s.locals[STA]).toEqual(b.s.locals[STA]);
  });
});
