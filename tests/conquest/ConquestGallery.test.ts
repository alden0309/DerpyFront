// The portrait gallery (r11, ART): its data, the pictures given to everyone,
// a player's look, and old drawn looks brought over.

import { existsSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import type { LikenessPicker } from "../../src/conquest/client/Likeness";
import { PORTRAIT_CREDITS } from "../../src/conquest/client/PortraitCredits";
import {
  ageBand,
  asLook,
  CLOTH_COLORS,
  figureColors,
  fitLook,
  generateLook,
  greyAt,
  HAIR_TONES,
  inheritLook,
  type Look,
  lookOf,
  migrateLook,
  migrateLooks,
  pickSitter,
  plainLook,
  sitterAt,
  sitterOf,
  SITTERS,
  validateLook,
} from "../../src/conquest/engine/Appearance";
import {
  birth,
  makeCharacter,
  marry,
} from "../../src/conquest/engine/Characters";
import { GALLERY } from "../../src/conquest/engine/Gallery";
import { planProblem } from "../../src/conquest/engine/Life";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { ageOf } from "../../src/conquest/engine/Queries";
import {
  AGE_BANDS,
  DRESSES,
  HAIR_TONE_KEYS,
  HEADWEARS,
  PEOPLES,
  SITTER_CLASSES,
} from "../../src/conquest/engine/Sitters";
import type { Character } from "../../src/conquest/engine/Types";
import { lifeOf, plan, world } from "./LifeUtil";

const ASSETS = join(__dirname, "../../src/conquest/client/portraits");

/** A drawn look of the kind saved before the gallery. */
const OLD_LOOK = {
  skin: 2,
  face: 0,
  jaw: 1,
  cheeks: 2,
  eyes: 0,
  eyeColor: 5,
  eyeSet: 1,
  brows: 2,
  nose: 1,
  mouth: 0,
  ears: 1,
  hair: "tie_wig",
  hairColor: 3,
  beard: "none",
  hat: "tricorne",
  clothes: "regimental",
  colors: [7, 9, 5],
  extras: ["gorget"],
  marks: [],
  lines: 1,
  greying: 2,
};

function npc(o: Partial<Character> & { id: number }): Character {
  return {
    first: "Jane",
    family: "Doe",
    title: null,
    female: false,
    born: -30 * 365,
    nation: 0,
    culture: "english",
    religion: "anglican",
    stats: { dip: 5, mar: 5, ste: 5, int: 5, lea: 5 },
    traits: [],
    alive: true,
    died: null,
    spouse: -1,
    father: -1,
    mother: -1,
    children: [],
    ambition: null,
    scheme: null,
    memories: [],
    lastBirth: 0,
    made: false,
    ...o,
  } as Character;
}

describe("Derpy Conquest portrait gallery: data", () => {
  test("about two hundred portraits, each tagged with known values", () => {
    expect(GALLERY.length).toBeGreaterThanOrEqual(150);
    const ids = new Set<string>();
    for (const s of GALLERY) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      expect(s.id).toMatch(/^[a-z]{2}-[mf]-\d{2}$/);
      expect(["m", "f"]).toContain(s.sex);
      expect(AGE_BANDS).toContain(s.age);
      expect(PEOPLES).toContain(s.people);
      expect(SITTER_CLASSES).toContain(s.cls);
      expect(HAIR_TONE_KEYS).toContain(s.hair);
      expect(HEADWEARS).toContain(s.head);
      expect(DRESSES).toContain(s.dress);
      expect(["l", "r", "f"]).toContain(s.look);
      expect(s.year).toBeGreaterThanOrEqual(1570);
      expect(s.year).toBeLessThanOrEqual(1840);
      for (const hex of [s.hx, s.cx, s.sx])
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.hl).toBeGreaterThan(0);
      expect(s.hl).toBeLessThan(1);
      expect(s.cl).toBeGreaterThan(0);
      expect(s.cl).toBeLessThan(1);
      // The id's prefix says whose people and which sex.
      expect(s.id.slice(3, 4)).toBe(s.sex);
    }
  });

  test("every portrait has its pictures, small enough, and a credit", () => {
    const credits = new Map(PORTRAIT_CREDITS.map((c) => [c.id, c]));
    expect(credits.size).toBe(GALLERY.length);
    let bytes = 0;
    for (const s of GALLERY) {
      for (const [dir, max] of [
        ["full", 64_000],
        ["thumb", 12_000],
        ["mask", 24_000],
      ] as const) {
        const f = join(ASSETS, dir, `${s.id}.webp`);
        expect(existsSync(f), f).toBe(true);
        const size = statSync(f).size;
        expect(size, f).toBeLessThan(max);
        bytes += size;
      }
      const c = credits.get(s.id)!;
      expect(c, s.id).toBeDefined();
      expect(c.title.length).toBeGreaterThan(2);
      expect(c.author.length).toBeGreaterThan(2);
      expect(c.source).toMatch(/^https:\/\//);
      expect(c.license).toMatch(/public domain|CC0/i);
    }
    // The whole gallery stays a reasonable download (and is fetched as shown).
    expect(bytes).toBeLessThan(18_000_000);
  });

  test("the gallery covers both sexes, every age, people and station", () => {
    const has = (f: (s: (typeof GALLERY)[number]) => boolean) =>
      GALLERY.some(f);
    for (const sex of ["m", "f"] as const) {
      for (const age of AGE_BANDS)
        expect(
          has((s) => s.sex === sex && s.age === age),
          `${sex} ${age}`,
        ).toBe(true);
      for (const people of [
        "english",
        "french",
        "spanish",
        "dutch",
        "native",
        "african",
      ] as const)
        expect(
          has((s) => s.sex === sex && s.people === people && s.age !== "child"),
          `${sex} ${people}`,
        ).toBe(true);
    }
    for (const cls of SITTER_CLASSES)
      expect(
        has((s) => s.cls === cls),
        cls,
      ).toBe(true);
    // Clergy of both kinds, and soldiers and officers.
    expect(has((s) => s.cls === "clergy" && s.sex === "f")).toBe(true);
    expect(has((s) => s.cls === "clergy" && s.sex === "m")).toBe(true);
  });
});

describe("Derpy Conquest portrait gallery: pictures for everyone", () => {
  test("the same person gets the same picture, and neighbours seldom share", () => {
    const seen = new Map<string, number>();
    for (let id = 1; id <= 120; id++) {
      const c = npc({ id, family: `Fam${id}` });
      const a = sitterOf(c, 30);
      expect(sitterOf(c, 30)).toBe(a);
      expect(lookOf(c, 30)).toEqual(lookOf(c, 30));
      seen.set(a.id, (seen.get(a.id) ?? 0) + 1);
    }
    // 120 English men of thirty spread over many faces.
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(Math.max(...seen.values())).toBeLessThan(40);
  });

  test("a picture fits the sitter's sex, age and people", () => {
    const cultures = [
      "english",
      "french",
      "spanish",
      "dutch",
      "swedish",
      "portuguese",
      "cherokee",
      "haudenosaunee",
      "maya",
    ];
    let id = 1;
    for (const culture of cultures)
      for (const female of [false, true])
        for (const age of [6, 20, 33, 48, 70]) {
          const c = npc({ id: id++, culture, female, born: -age * 365 });
          const s = sitterOf(c, age);
          expect(s.sex, `${culture} ${female} ${age}`).toBe(female ? "f" : "m");
          expect(s.age === "child", `${culture} ${age}`).toBe(age < 16);
          const native = ![
            "english",
            "french",
            "spanish",
            "dutch",
            "swedish",
            "portuguese",
          ].includes(culture);
          expect(s.people === "native", `${culture} ${age}`).toBe(native);
        }
  });

  test("as someone ages they move to pictures of their years", () => {
    let older = 0;
    for (let id = 1; id <= 40; id++) {
      const c = npc({ id, family: `F${id}`, female: id % 2 === 0 });
      const young = sitterOf(c, 22);
      const old = sitterOf(c, 72);
      expect(young.age === "child").toBe(false);
      if (old.age === "elder" || old.age === "middle") older++;
      expect(sitterOf(c, 8).age).toBe("child");
    }
    expect(older).toBeGreaterThan(30);
  });

  test("ancestry runs in a family name, and peoples with no pictures borrow their kin's", () => {
    // The same family gets the same people at every age.
    for (let id = 1; id <= 60; id++) {
      const a = npc({
        id,
        family: `Line${id % 7}`,
        culture: "spanish",
        role: "labourer",
      });
      const b = npc({
        id: id + 1000,
        family: `Line${id % 7}`,
        culture: "spanish",
        role: "labourer",
      });
      const pa = sitterOf(a, 30).people;
      const pb = sitterOf(b, 30).people;
      const group = (p: string) =>
        p === "african" ? "a" : p === "mestizo" ? "m" : "e";
      if (pa === "african" || pb === "african")
        expect(group(pa)).toBe(group(pb));
    }
    // Swedish women borrow northern pictures when the Swedish run short.
    const s = pickSitter({
      id: 3,
      female: true,
      age: 70,
      people: "swedish",
      cls: "labourer",
      year: 1650,
    });
    expect(["swedish", "dutch", "english", "french"]).toContain(s.people);
  });
});

describe("Derpy Conquest portrait gallery: a player's look", () => {
  const good: Look = {
    ...plainLook(GALLERY.find((s) => s.sex === "m" && s.age !== "child")!.id),
    grey: 1,
  };

  test("a look is checked part by part", () => {
    expect(validateLook(good)).toBeNull();
    expect(validateLook(good, { female: false })).toBeNull();
    expect(validateLook(good, { female: true })).toMatch(/man/);
    const kid = GALLERY.find((s) => s.age === "child")!;
    for (const bad of [
      null,
      [],
      "x",
      { ...good, p: "no-such-portrait" },
      { ...good, p: kid.id },
      { ...good, hair: HAIR_TONES.length },
      { ...good, hair: 1.5 },
      { ...good, cloth: CLOTH_COLORS.length },
      { ...good, hairL: 3 },
      { ...good, clothL: -3 },
      { ...good, grey: 3 },
      { ...good, flip: "yes" },
      { ...good, wings: true },
      { ...good, kid: good.p },
    ])
      expect(validateLook(bad), JSON.stringify(bad)).not.toBeNull();
    // A child of the family, not yet grown: a child's picture, the grown one to come.
    expect(validateLook({ ...good, p: "", kid: kid.id })).toBeNull();
    expect(validateLook({ ...good, p: "" })).toBeNull();
    expect(validateLook({ ...good, p: "" }, { grown: true })).toMatch(/choose/);
  });

  test("tuning shows in the walkers' colours, and the hair greys with the years", () => {
    const s = SITTERS.get(good.p)!;
    const plain = figureColors(good);
    expect(plain.coat).toBe(s.cx);
    const tuned = figureColors({ ...good, cloth: 7, hair: 5 });
    expect(tuned.coat).toBe(CLOTH_COLORS[7].hex);
    if (!s.wig && s.hair !== "hidden")
      expect(tuned.hair).toBe(HAIR_TONES[5].hex);
    const natural = GALLERY.find(
      (x) =>
        !x.wig &&
        x.hair !== "hidden" &&
        x.hair !== "grey" &&
        x.hair !== "white" &&
        x.age !== "child",
    )!;
    const l = { ...plainLook(natural.id), grey: 1 };
    expect(greyAt(l, 30, natural)).toBe(0);
    expect(greyAt(l, 60, natural)).toBeGreaterThan(0.5);
    expect(greyAt({ ...l, grey: 2 }, 50, natural)).toBeGreaterThan(
      greyAt(l, 50, natural),
    );
    expect(greyAt({ ...l, grey: 0 }, 80, natural)).toBe(0);
  });

  test("a new look suits the character, and a chosen one is kept when it still fits", () => {
    const seed = {
      id: 4,
      culture: "french",
      female: true,
      age: 30,
      station: "gentry" as const,
      year: 1700,
    };
    const a = generateLook(seed);
    expect(validateLook(a, { female: true })).toBeNull();
    expect(SITTERS.get(a.p)!.sex).toBe("f");
    const tuned = { ...a, hair: 2, cloth: 4 };
    expect(fitLook(tuned, { ...seed, age: 35 })).toEqual(tuned);
    const man = fitLook(tuned, { ...seed, female: false });
    expect(SITTERS.get(man.p)!.sex).toBe("m");
    expect(man.cloth).toBe(4);
    const native = fitLook(tuned, { ...seed, culture: "cherokee" });
    expect(SITTERS.get(native.p)!.people).toBe("native");
    // A draft from before the gallery starts afresh.
    expect(validateLook(fitLook(OLD_LOOK as unknown as Look, seed))).toBeNull();
  });

  test("a plan's look becomes the character's; a look of the other sex is refused", () => {
    const g = world({
      plans: [{ seat: "s1", name: "A", plan: plan({ look: good }) }],
    });
    const me = meOf(g.s, lifeOf(g))!;
    expect(me.look).toEqual(good);
    expect(sitterOf(me, ageOf(g.s, me)).id).toBe(good.p);
    expect(planProblem(g.s, plan({ look: good, female: true }))).toMatch(
      /Likeness/,
    );
    expect(planProblem(g.s, plan({ look: { ...good, p: "zz-m-99" } }))).toMatch(
      /Likeness/,
    );
  });

  test("a player sits for a new likeness in the game", () => {
    const g = world();
    const me = meOf(g.s, lifeOf(g))!;
    const other = GALLERY.filter((s) => s.sex === "m" && s.age === "elder")[0];
    const look = { ...plainLook(other.id), hair: 3, flip: true, grey: 2 };
    expect(g.lifeCommand("s1", { k: "likeness", look })).toBeNull();
    expect(g.s.chars[me.id].look).toEqual(look);
    const woman = GALLERY.find((s) => s.sex === "f" && s.age === "prime")!;
    expect(
      g.lifeCommand("s1", { k: "likeness", look: plainLook(woman.id) }),
    ).toMatch(/woman/);
    expect(
      g.lifeCommand("s1", { k: "likeness", look: { ...look, cloth: 99 } }),
    ).toMatch(/Likeness/);
  });

  test("a player's children get a child's picture, and a grown one with the family's hair", () => {
    const dark = GALLERY.find(
      (s) =>
        s.sex === "m" && s.age === "prime" && s.people === "english" && !s.wig,
    )!;
    const look: Look = { ...plainLook(dark.id), hair: 0, grey: 1 };
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
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const kid = birth(g.s, g.rng, me, wife);
      expect(kid.look).toBeDefined();
      expect(validateLook(kid.look)).toBeNull();
      expect(kid.look!.p).toBe("");
      const small = sitterAt(kid.look!, 6, kid);
      expect(small.age).toBe("child");
      expect(small.sex).toBe(kid.female ? "f" : "m");
      const grown = sitterAt(kid.look!, 20, kid);
      expect(grown.age === "child").toBe(false);
      expect(grown.sex).toBe(kid.female ? "f" : "m");
      // The same grown face each time it's asked for.
      expect(sitterAt(kid.look!, 20, kid)).toBe(grown);
      if (kid.look!.hair === 0) n++;
    }
    // Some take after the father's black hair (the rest after the mother's).
    expect(n).toBeGreaterThan(0);
    // Families with no player in them have no stored look.
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
    expect(birth(g.s, g.rng, a, b).look).toBeUndefined();
    expect(inheritLook(look, look, 5).kid).toBeDefined();
  });

  test("everyone in a world has a valid look and a picture of their sex and years", () => {
    const g = world({ start: 1700 });
    let n = 0;
    for (const c of Object.values(g.s.chars)) {
      const age = ageOf(g.s, c);
      const l = lookOf(c, age);
      expect(validateLook(l), `${c.first} ${c.family}`).toBeNull();
      const s = sitterOf(c, age);
      expect(s.sex).toBe(c.female ? "f" : "m");
      expect(s.age === "child").toBe(age < 16);
      n++;
    }
    expect(n).toBeGreaterThan(20);
    expect(ageBand(70)).toBe("elder");
  });
});

describe("Derpy Conquest portrait gallery: old drawn looks", () => {
  test("an old look is brought over to a portrait that fits it", () => {
    expect(validateLook(OLD_LOOK)).toBeNull();
    const l = migrateLook(OLD_LOOK, {
      id: 9,
      female: false,
      culture: "english",
      age: 34,
      year: 1750,
    })!;
    expect(validateLook(l, { female: false })).toBeNull();
    const s = SITTERS.get(l.p)!;
    expect(s.sex).toBe("m");
    expect(s.people === "native").toBe(false);
    // A wig keeps its powder; the coat keeps the colour chosen; early greying stays early.
    expect(l.hair).toBe(-1);
    expect(l.cloth).toBe(7);
    expect(l.grey).toBe(2);
    // The same old look always comes over the same way.
    expect(
      migrateLook(OLD_LOOK, {
        id: 9,
        female: false,
        culture: "english",
        age: 34,
        year: 1750,
      }),
    ).toEqual(l);
    // A native woman's old look comes over to a portrait of the peoples of the country.
    const n = migrateLook(
      {
        ...OLD_LOOK,
        hair: "n_parted",
        hat: "none",
        clothes: "n_wrap",
        hairColor: 0,
      },
      { id: 3, female: true, culture: "cherokee", age: 25, year: 1700 },
    )!;
    expect(SITTERS.get(n.p)!.people).toBe("native");
    expect(SITTERS.get(n.p)!.sex).toBe("f");
    // Her black hair, where the picture shows hair of her own.
    const ns = SITTERS.get(n.p)!;
    expect(n.hair).toBe(ns.wig || ns.hair === "hidden" ? -1 : 0);
    expect(
      migrateLook(
        { nonsense: 1 },
        { id: 1, female: false, culture: "english", age: 30, year: 1700 },
      ),
    ).toBeNull();
  });

  test("a look whose portrait has left the gallery keeps its tuning on another", () => {
    const o = { id: 4, female: true, culture: "dutch", age: 30, year: 1660 };
    const gone = { ...plainLook("nl-f-99"), hair: 3, cloth: 9, grey: 2 };
    const l = migrateLook(gone, o)!;
    expect(validateLook(l, { female: true })).toBeNull();
    expect(SITTERS.get(l.p)!.sex).toBe("f");
    expect([l.hair, l.cloth, l.grey]).toEqual([3, 9, 2]);
    // One of the other sex's is swapped too; a good one is kept as it is.
    const man = GALLERY.find((s) => s.sex === "m" && s.age === "prime")!;
    expect(SITTERS.get(migrateLook(plainLook(man.id), o)!.p)!.sex).toBe("f");
    const woman = GALLERY.find((s) => s.sex === "f" && s.age === "prime")!;
    expect(migrateLook(plainLook(woman.id), o)).toEqual(plainLook(woman.id));
  });

  test("a saved game's characters are brought over when it's loaded", () => {
    const g = world();
    const me = meOf(g.s, lifeOf(g))!;
    const state = structuredClone(g.s);
    state.chars[me.id].look = OLD_LOOK as unknown as Look;
    const bad = Object.values(state.chars).find((c) => c.id !== me.id)!;
    bad.look = { junk: true } as unknown as Look;
    migrateLooks(state);
    expect(validateLook(state.chars[me.id].look)).toBeNull();
    expect(state.chars[me.id].look!.cloth).toBe(7);
    expect(bad.look).toBeUndefined();
    // A plan from an older client, with an old look, makes a character with a portrait.
    const g2 = world({
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ look: OLD_LOOK as unknown as Look }),
        },
      ],
    });
    const me2 = meOf(g2.s, lifeOf(g2))!;
    expect(validateLook(me2.look)).toBeNull();
    expect(asLook(me2.look, me2)).toEqual(me2.look);
  });
});

describe("Derpy Conquest portrait gallery: the register", () => {
  test("the gallery shows the character's faces; choosing and tuning one changes the look", async () => {
    await import("../../src/conquest/client/Likeness");
    const el = document.createElement("cq-likeness") as LikenessPicker;
    el.look = generateLook({
      id: 5,
      culture: "english",
      female: false,
      age: 24,
      station: "labourer",
      year: 1650,
    });
    el.female = false;
    el.age = 24;
    el.culture = "english";
    el.station = "labourer";
    el.year = 1650;
    el.name = "Josiah Wexcombe";
    document.body.appendChild(el);
    await el.updateComplete;
    const thumbs = () =>
      [
        ...el.querySelectorAll<HTMLButtonElement>(
          ".cq-lk-grid:not(.near) .cq-lk-thumb",
        ),
      ].map((b) => [b, SITTERS.get(b.dataset.p!)!] as const);
    expect(thumbs().length).toBeGreaterThanOrEqual(4);
    for (const [, s] of thumbs()) {
      expect(s.sex).toBe("m");
      expect(s.people).toBe("english");
    }
    const looks: Look[] = [];
    el.addEventListener("cq-look", (e) =>
      looks.push((e as CustomEvent<Look>).detail),
    );
    const [button, sitter] = thumbs()[1];
    button.click();
    await el.updateComplete;
    expect(looks[looks.length - 1].p).toBe(sitter.id);
    expect(el.querySelector<HTMLElement>(".cq-lk-picture")!.dataset.p).toBe(
      sitter.id,
    );
    // Filter to African sitters.
    const people = el.querySelector<HTMLSelectElement>(
      "select[data-filter=people]",
    )!;
    people.value = "african";
    people.dispatchEvent(new Event("change"));
    await el.updateComplete;
    expect(thumbs().length).toBeGreaterThan(2);
    for (const [, s] of thumbs()) expect(s.people).toBe("african");
    // Tune the clothes and mirror it: the preview is drawn through the masks.
    el.querySelectorAll<HTMLButtonElement>(".cq-lk-tune .cq-lk-row")[1]
      .querySelectorAll<HTMLButtonElement>(".cq-swatches-pick button")[8]
      .click();
    await el.updateComplete;
    expect(looks[looks.length - 1].cloth).toBe(7);
    el.querySelector<HTMLButtonElement>(".cq-lk-flip")!.click();
    await el.updateComplete;
    expect(looks[looks.length - 1].flip).toBe(true);
    const svg = el.querySelector(".cq-lk-picture svg")!;
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll("mask").length).toBeGreaterThan(0);
    expect(
      validateLook(looks[looks.length - 1], { female: false, grown: true }),
    ).toBeNull();
    el.remove();
  }, 30_000);
});
