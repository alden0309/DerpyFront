/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import "../../src/conquest/client/avatar/Editor";
import type { LookEditor } from "../../src/conquest/client/avatar/Editor";
import { buildHead } from "../../src/conquest/client/avatar/Head";
import { paintPortrait } from "../../src/conquest/client/avatar/Render";
import {
  type Appearance,
  generateLook,
  validateLook,
} from "../../src/conquest/engine/Appearance";

const look = generateLook({
  id: 21,
  culture: "english",
  female: false,
  age: 30,
  station: "gentry",
  year: 1700,
});
const opts = {
  female: false,
  age: 30,
  year: 1700,
  culture: "english",
  seed: 21,
};

describe("Derpy Conquest painted portraits", () => {
  test("the same sitting paints the same picture", () => {
    const a = paintPortrait(look, opts);
    expect(a.startsWith("<svg")).toBe(true);
    expect(a).toBe(paintPortrait(look, opts));
    // Facing left is the same picture turned about.
    expect(paintPortrait(look, { ...opts, facing: "left" })).toContain(
      'transform="matrix(-1 0 0 1 240 0)"',
    );
    expect(paintPortrait(look, { ...opts, expression: "smile" })).not.toBe(a);
    expect(paintPortrait(look, { ...opts, age: 70 })).not.toBe(a);
  });

  test("a sitter facing left is lit from the right, not left in the dark", () => {
    const right = paintPortrait(look, opts);
    const left = paintPortrait(look, { ...opts, facing: "left" });
    const lightX = (svg: string) =>
      Number(/<fePointLight x="([-\d.]+)"/.exec(svg)![1]);
    // The light is mirrored with the picture...
    expect(lightX(left)).toBeCloseTo(240 - lightX(right), 0);
    // ...and the lit figure is mirrored inside the lighting filter, never
    // the filter inside the mirror (which misplaces the light).
    expect(left).toContain(
      '<g filter="url(#lightF)"><g transform="matrix(-1 0 0 1 240 0)">',
    );
    expect(left).not.toMatch(
      /transform="matrix\(-1 0 0 1 240 0\)"><g filter="url\(#lightF\)"/,
    );
  });

  test("small portraits draw expressions larger, and each reads differently", () => {
    const sit = (expression: "smile" | "frown" | "worried" | "angry") => ({
      look,
      female: false,
      age: 30,
      year: 1700,
      native: false,
      region: "woodlands" as const,
      culture: "english",
      expression,
      seed: 21,
      bg: "#333333",
    });
    const big = buildHead({ ...sit("smile"), detail: "full" }).expr;
    const small = buildHead({ ...sit("smile"), detail: "lite" }).expr;
    expect(small.mouth).toBeGreaterThan(big.mouth);
    expect(big.mouth).toBeGreaterThan(0);
    expect(
      buildHead({ ...sit("frown"), detail: "full" }).expr.mouth,
    ).toBeLessThan(0);
    const worried = buildHead({ ...sit("worried"), detail: "full" }).expr;
    const angry = buildHead({ ...sit("angry"), detail: "full" }).expr;
    expect(worried.browUp).toBeGreaterThan(angry.browUp);
    expect(angry.browIn).toBeGreaterThan(worried.browIn);
  });

  test("looks saved before the newer features still load and paint", () => {
    // A look from an older save: every index within the shorter lists of
    // the time.
    const old: Appearance = {
      skin: 2,
      face: 5,
      jaw: 4,
      cheeks: 3,
      eyes: 5,
      eyeColor: 6,
      eyeSet: 2,
      brows: 4,
      nose: 6,
      mouth: 4,
      ears: 3,
      hair: "full_wig",
      hairColor: 8,
      beard: "none",
      hat: "tricorne",
      clothes: "justaucorps",
      colors: [7, 15, 13],
      extras: ["gorget"],
      marks: ["scar"],
      lines: 3,
      greying: 3,
    };
    expect(validateLook(old)).toBeNull();
    const svg = paintPortrait(old, opts);
    expect(svg).not.toMatch(/NaN|undefined/);
    // And the new choices are as valid, and no further.
    expect(
      validateLook({ ...old, face: 7, jaw: 6, eyes: 7, nose: 7 }),
    ).toBeNull();
    expect(validateLook({ ...old, face: 8 })).not.toBeNull();
    for (const f of [6, 7])
      expect(
        paintPortrait({ ...old, face: f, jaw: 6, eyes: 7, nose: 7 }, opts),
      ).not.toMatch(/NaN|undefined/);
  });

  test("every part of the wardrobe paints", () => {
    const parse = new DOMParser();
    const people = [
      ["english", false, 1610],
      ["dutch", true, 1650],
      ["french", false, 1710],
      ["spanish", true, 1760],
      ["haudenosaunee", false, 1700],
      ["pueblo", true, 1680],
      ["maya", true, 1650],
      ["tlingit", false, 1700],
    ] as const;
    let i = 0;
    for (const [culture, female, year] of people)
      for (let id = 0; id < 6; id++) {
        const l = generateLook({
          id: id * 31 + i++,
          culture,
          female,
          age: 20 + id * 9,
          station: (
            [
              "gentry",
              "labourer",
              "soldier",
              "clergy",
              "merchant",
              "sailor",
            ] as const
          )[id],
          year,
        });
        const svg = paintPortrait(l, {
          female,
          age: 20 + id * 9,
          year,
          culture,
          seed: id,
        });
        const doc = parse.parseFromString(svg, "image/svg+xml");
        expect(
          doc.getElementsByTagName("parsererror").length,
          `${culture} ${l.clothes} ${l.hair} ${l.hat}`,
        ).toBe(0);
        expect(svg).not.toMatch(/NaN|undefined/);
      }
  });
});

describe("Derpy Conquest likeness editor", () => {
  async function mount(): Promise<LookEditor> {
    const el = document.createElement("cq-look-editor") as LookEditor;
    el.look = look;
    el.female = false;
    el.age = 30;
    el.year = 1700;
    el.culture = "english";
    el.station = "gentry";
    el.name = "Alden Drackley";
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }
  const preview = (el: HTMLElement) =>
    el
      .querySelector<HTMLImageElement>(".cq-look-picture img")!
      .getAttribute("src");

  test("stepping through a part changes the look and the preview", async () => {
    const el = await mount();
    const looks: Appearance[] = [];
    el.addEventListener("cq-look", (e) =>
      looks.push((e as CustomEvent<Appearance>).detail),
    );
    const before = preview(el);
    expect(before).toMatch(/^(data:image\/svg|blob:)/);
    el.querySelector<HTMLButtonElement>(
      '.cq-look-tab[data-tab="hair"]',
    )!.click();
    await el.updateComplete;
    const next = el.querySelector<HTMLButtonElement>(
      '.cq-look-row[data-part="hair"] .cq-step-btn[aria-label^="Next"]',
    )!;
    next.click();
    await el.updateComplete;
    expect(looks).toHaveLength(1);
    expect(looks[0].hair).not.toBe(look.hair);
    expect(el.look.hair).toBe(looks[0].hair);
    expect(preview(el)).not.toBe(before);
  });

  test("swatches and dice change the preview too", async () => {
    const el = await mount();
    const before = preview(el);
    el.querySelector<HTMLButtonElement>(
      '.cq-look-tab[data-tab="colours"]',
    )!.click();
    await el.updateComplete;
    const swatches = el.querySelectorAll<HTMLButtonElement>(
      ".cq-swatches-pick button",
    );
    const target = [...swatches].find(
      (b) => b.getAttribute("aria-checked") !== "true",
    )!;
    target.click();
    await el.updateComplete;
    expect(preview(el)).not.toBe(before);
    const mid = preview(el);
    el.querySelector<HTMLButtonElement>(".cq-look-roll-all")!.click();
    await el.updateComplete;
    expect(preview(el)).not.toBe(mid);
    // Seen in old age.
    const young = preview(el);
    el.querySelector<HTMLButtonElement>(
      ".cq-look-ages button:nth-child(3)",
    )!.click();
    await el.updateComplete;
    expect(preview(el)).not.toBe(young);
  });

  test("a woman's register has no beard to choose", async () => {
    const el = await mount();
    el.female = true;
    el.look = generateLook({
      id: 3,
      culture: "english",
      female: true,
      age: 30,
      station: "gentry",
      year: 1700,
    });
    await el.updateComplete;
    expect(el.querySelector('.cq-look-tab[data-tab="beard"]')).toBeNull();
    expect(el.querySelector('.cq-look-tab[data-tab="hat"]')).not.toBeNull();
  });
});
