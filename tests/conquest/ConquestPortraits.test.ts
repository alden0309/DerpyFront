/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import "../../src/conquest/client/avatar/Editor";
import type { LookEditor } from "../../src/conquest/client/avatar/Editor";
import { paintPortrait } from "../../src/conquest/client/avatar/Render";
import {
  type Appearance,
  generateLook,
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
