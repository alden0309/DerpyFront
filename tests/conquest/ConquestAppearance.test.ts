import { describe, expect, test } from "vitest";
import {
  type Appearance,
  BEARDS,
  CLOTHES,
  copyLook,
  figureColors,
  fitLook,
  generateLook,
  HAIR,
  HEADWEAR,
  inheritLook,
  isNativeCulture,
  itemOf,
  lookOf,
  STATIONS,
  validateLook,
} from "../../src/conquest/engine/Appearance";
import {
  birth,
  makeCharacter,
  marry,
} from "../../src/conquest/engine/Characters";
import { planProblem } from "../../src/conquest/engine/Life";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { ageOf } from "../../src/conquest/engine/Queries";
import { lifeOf, plan, world } from "./LifeUtil";

const CULTURES = [
  "english",
  "french",
  "spanish",
  "dutch",
  "swedish",
  "powhatan",
  "haudenosaunee",
  "cherokee",
  "oceti",
  "pueblo",
  "maya",
  "tlingit",
  "cree",
];
const YEARS = [1610, 1655, 1700, 1760];

function everyone(): {
  id: number;
  culture: string;
  female: boolean;
  age: number;
  year: number;
  station: (typeof STATIONS)[number];
}[] {
  const out = [];
  let id = 1;
  for (const culture of CULTURES)
    for (const year of YEARS)
      for (const station of STATIONS)
        for (const female of [false, true])
          for (const age of [5, 24, 61])
            out.push({ id: id++, culture, female, age, year, station });
  return out;
}

describe("Derpy Conquest likenesses", () => {
  test("the same person always looks the same", () => {
    const seed = {
      id: 4242,
      culture: "dutch",
      female: true,
      age: 37,
      station: "merchant" as const,
      year: 1650,
      religion: "reformed",
    };
    expect(generateLook(seed)).toEqual(generateLook(seed));
    // Different people look different.
    const looks = new Set(
      Array.from({ length: 40 }, (_, i) =>
        JSON.stringify(generateLook({ ...seed, id: i })),
      ),
    );
    expect(looks.size).toBe(40);
    // A birthday changes nothing but what the years do; their face stays.
    const older = generateLook({ ...seed, age: 38 });
    for (const k of ["skin", "face", "jaw", "nose", "eyeColor"] as const)
      expect(older[k]).toBe(generateLook(seed)[k]);
  });

  test("everyone generated is a valid look that suits them", () => {
    for (const p of everyone()) {
      const look = generateLook(p);
      expect(validateLook(look), JSON.stringify(p)).toBeNull();
      const native = isNativeCulture(p.culture);
      for (const [kind, key] of [
        ["hair", look.hair],
        ["beard", look.beard],
        ["hat", look.hat],
        ["clothes", look.clothes],
      ] as const) {
        const item = itemOf(kind, key)!;
        expect(item.from, `${kind} ${key} in ${p.year}`).toBeLessThanOrEqual(
          p.year,
        );
        if (item.sex !== "a")
          expect(item.sex === "f", `${kind} ${key}`).toBe(p.female);
        if (item.people !== "a")
          expect(item.people === "n", `${kind} ${key}`).toBe(native);
      }
      if (p.female || p.age < 14) expect(look.beard).toBe("none");
    }
  });

  test("natives and colonists dress as their own people", () => {
    const n = generateLook({
      id: 7,
      culture: "haudenosaunee",
      female: false,
      age: 30,
      station: "officer",
      year: 1700,
    });
    expect(n.clothes.startsWith("n_")).toBe(true);
    expect(n.skin).toBeGreaterThanOrEqual(4);
    const e = generateLook({
      id: 7,
      culture: "english",
      female: false,
      age: 30,
      station: "soldier",
      year: 1750,
    });
    expect(e.clothes).toBe("regimental");
    // Red coats for the English.
    expect(figureColors(e).coat).toBe("#b6312a");
  });

  test("validation rejects what isn't a look", () => {
    const good = generateLook({
      id: 1,
      culture: "french",
      female: false,
      age: 40,
      station: "gentry",
      year: 1700,
    });
    expect(validateLook(good)).toBeNull();
    const bad = (patch: Record<string, unknown>) =>
      validateLook({ ...copyLook(good), ...patch });
    expect(bad({ skin: -1 })).not.toBeNull();
    expect(bad({ skin: 99 })).not.toBeNull();
    expect(bad({ nose: 1.5 })).not.toBeNull();
    expect(bad({ eyeColor: "blue" })).not.toBeNull();
    expect(bad({ hair: "mohawk-of-gold" })).not.toBeNull();
    expect(bad({ hat: 3 })).not.toBeNull();
    expect(bad({ clothes: "n_nothing" })).not.toBeNull();
    expect(bad({ colors: [1, 2] })).not.toBeNull();
    expect(bad({ colors: [1, 2, 999] })).not.toBeNull();
    expect(bad({ extras: ["crown jewels"] })).not.toBeNull();
    expect(bad({ extras: ["pipe", "pipe"] })).not.toBeNull();
    expect(bad({ marks: "freckles" })).not.toBeNull();
    expect(bad({ lines: 4 })).not.toBeNull();
    expect(bad({ secret: 1 })).not.toBeNull();
    expect(validateLook(null)).not.toBeNull();
    expect(validateLook("look")).not.toBeNull();
    expect(validateLook([])).not.toBeNull();
  });

  test("children take after their parents", () => {
    const mother = generateLook({
      id: 11,
      culture: "english",
      female: true,
      age: 30,
      station: "merchant",
      year: 1700,
    });
    const father: Appearance = {
      ...generateLook({
        id: 12,
        culture: "english",
        female: false,
        age: 33,
        station: "merchant",
        year: 1700,
      }),
      skin: 0,
      hairColor: 5,
      eyeColor: 6,
    };
    const child = { female: false, culture: "english", year: 1700 };
    const a = inheritLook(mother, father, 99, child);
    expect(inheritLook(mother, father, 99, child)).toEqual(a);
    expect(validateLook(a)).toBeNull();
    const genes = [
      "face",
      "jaw",
      "cheeks",
      "eyes",
      "eyeColor",
      "eyeSet",
      "brows",
      "nose",
      "mouth",
      "ears",
    ] as const;
    // Every child's features come from one parent or the other.
    for (let seed = 0; seed < 30; seed++) {
      const kid = inheritLook(mother, father, seed, child);
      for (const g of genes) expect([mother[g], father[g]]).toContain(kid[g]);
      expect(kid.skin).toBeGreaterThanOrEqual(Math.min(mother.skin, 0));
      expect(kid.skin).toBeLessThanOrEqual(Math.max(mother.skin, father.skin));
    }
    // A daughter dresses as a woman.
    const girl = inheritLook(mother, father, 5, { ...child, female: true });
    expect(itemOf("clothes", girl.clothes)!.sex).not.toBe("m");
    expect(girl.beard).toBe("none");
  });

  test("a look fitted to someone new keeps the face and changes the dress", () => {
    const man = generateLook({
      id: 3,
      culture: "english",
      female: false,
      age: 30,
      station: "gentry",
      year: 1700,
    });
    const woman = fitLook(man, {
      id: 4,
      culture: "english",
      female: true,
      age: 30,
      station: "gentry",
      year: 1700,
    });
    expect(validateLook(woman)).toBeNull();
    expect(woman.nose).toBe(man.nose);
    expect(woman.beard).toBe("none");
    expect(itemOf("clothes", woman.clothes)!.sex).not.toBe("m");
  });

  test("the item tables are consistent", () => {
    for (const list of [HAIR, BEARDS, HEADWEAR, CLOTHES]) {
      const keys = list.map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const i of list) expect(i.from).toBeLessThanOrEqual(i.to);
    }
  });
});

describe("Derpy Conquest likenesses in the world", () => {
  test("a plan's look becomes the character's", () => {
    const look = generateLook({
      id: 5,
      culture: "english",
      female: false,
      age: 22,
      station: "labourer",
      year: 1607,
    });
    look.hat = "capotain";
    const g = world({
      plans: [{ seat: "s1", name: "A", plan: plan({ look }) }],
    });
    const me = meOf(g.s, lifeOf(g))!;
    expect(me.look).toEqual(look);
    // A copy, not the plan's own object.
    expect(me.look).not.toBe(look);
    expect(lookOf(me, ageOf(g.s, me))).toEqual(look);
  });

  test("a plan with a bad look is refused", () => {
    const g = world();
    const look = {
      ...generateLook({
        id: 1,
        culture: "english",
        female: false,
        age: 22,
        station: "labourer",
        year: 1607,
      }),
      hair: "nonsense",
    };
    expect(planProblem(g.s, plan({ look }))).toMatch(/Likeness/);
    expect(planProblem(g.s, plan())).toBeNull();
  });

  test("a player's children carry a look that follows the family", () => {
    const look = generateLook({
      id: 8,
      culture: "english",
      female: false,
      age: 22,
      station: "gentry",
      year: 1607,
    });
    const g = world({
      plans: [{ seat: "s1", name: "A", plan: plan({ look }) }],
    });
    const me = meOf(g.s, lifeOf(g))!;
    const wife = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: me.culture,
      religion: me.religion,
      female: true,
      age: 21,
    });
    marry(g.s, me, wife);
    const kid = birth(g.s, g.rng, me, wife);
    expect(kid.look).toBeDefined();
    expect(validateLook(kid.look)).toBeNull();
    const wifeLook = lookOf(wife, ageOf(g.s, wife));
    for (const k of ["face", "nose", "eyes", "mouth"] as const)
      expect([look[k], wifeLook[k]]).toContain(kid.look![k]);
    // Two families with no player in them keep generated looks.
    const a = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: false,
      age: 30,
    });
    const b = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: "english",
      religion: "anglican",
      female: true,
      age: 28,
    });
    const other = birth(g.s, g.rng, a, b);
    expect(other.look).toBeUndefined();
    const l1 = lookOf(other, 0);
    expect(lookOf(other, 0)).toEqual(l1);
    expect(validateLook(l1)).toBeNull();
  });

  test("everyone in a world has a valid look", () => {
    const g = world({ start: 1700 });
    let n = 0;
    for (const c of Object.values(g.s.chars)) {
      const l = lookOf(c, ageOf(g.s, c));
      expect(validateLook(l), `${c.first} ${c.family}`).toBeNull();
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });
});
