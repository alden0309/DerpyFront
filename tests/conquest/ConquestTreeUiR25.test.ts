// @vitest-environment jsdom
// TREE (r25): Journal › Dynasty draws the line's tree (a card for everyone
// on it, a seal for each of the line's own, the lines between them) with
// the chosen one's life beside it; the list shows the same people,
// generation by generation; the story told at the end leads to it.

import { render } from "lit";
import { describe, expect, test } from "vitest";
import type { GameUi } from "../../src/conquest/client/ui/Context";
import {
  dynastyModal,
  dynastyNow,
  dynastyPage,
  dynastyPick,
} from "../../src/conquest/client/ui/Dynasty";
import { kill, makeCharacter, marry } from "../../src/conquest/engine/Characters";
import { milestone } from "../../src/conquest/engine/LifeCore";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import type { Character } from "../../src/conquest/engine/Types";
import { lifeOf, map, world } from "./LifeUtil";

function family() {
  const g = world({ start: 1700, seed: 21 });
  g.aiEnabled = false;
  const life = lifeOf(g);
  const me = meOf(g.s, life)!;
  const mk = (female: boolean, age: number, first: string): Character => {
    const c = makeCharacter(g.s, g.rng, {
      nation: me.nation,
      culture: g.s.nations[me.nation].culture,
      religion: me.religion,
      female,
      age,
      first,
      family: me.family,
    });
    c.home = life.home;
    return c;
  };
  const wife = mk(true, 21, "Mary");
  marry(g.s, me, wife);
  milestone(g, life, "married", "Married Mary Cole", life.prov, {
    quiet: true,
  });
  const kids = [mk(false, 20, "Thomas"), mk(true, 18, "Ann")];
  for (const k of kids) {
    k.father = me.id;
    k.mother = wife.id;
    me.children.push(k.id);
    wife.children.push(k.id);
  }
  kill(g, me, "a fever at 45");
  const modals: unknown[] = [];
  const opened: unknown[] = [];
  const ui = {
    s: g.s,
    life,
    me: meOf(g.s, life) ?? null,
    map,
    seat: life.seat,
    open: (v: unknown) => opened.push(v),
    modal: (m: unknown) => modals.push(m),
    redraw: () => undefined,
  } as unknown as GameUi;
  return { g, life, ui, modals, opened, kids };
}

describe("Journal › Dynasty (TREE r25)", () => {
  test("a card for everyone on the tree, a seal for each of the line's own, and the life of whoever's chosen", () => {
    const f = family();
    dynastyPick({ house: -1, who: null, view: "tree" });
    const m = dynastyNow(f.ui)!;
    const div = document.createElement("div");
    render(dynastyPage(f.ui), div);
    expect(div.querySelectorAll(".cq-dyn-card")).toHaveLength(
      m.rec.people.length,
    );
    expect(div.querySelectorAll(".cq-dyn-card .cq-dyn-seal")).toHaveLength(2);
    expect(div.querySelectorAll(".cq-kin-lines path").length).toBeGreaterThan(
      1,
    );
    expect(div.querySelector(".cq-kin-head")?.textContent).toMatch(
      /The House of Drackley/,
    );
    // The one played now is chosen at first: their life, and where they are.
    expect(div.querySelector(".cq-dyn-card.chosen .cq-kin-name")?.textContent).toMatch(
      /Thomas/,
    );
    expect(div.querySelector(".cq-dyn-life .cq-dyn-now")?.textContent).toMatch(
      /At Jamestown/,
    );
    // Choose the first of the line: his life, how he died, the story's chapter.
    const alden = [...div.querySelectorAll<HTMLButtonElement>(".cq-dyn-card")].find(
      (b) => /Alden/.test(b.textContent ?? ""),
    )!;
    alden.click(); // a key's click (detail 0) opens; pointers open on lifting
    render(dynastyPage(f.ui), div);
    const life = div.querySelector(".cq-dyn-life")!;
    expect(life.querySelector(".cq-h3")?.textContent).toMatch(/Alden Drackley/);
    expect(life.textContent).toMatch(/Died of a fever at 45/);
    expect(life.querySelector(".cq-dyn-story")).not.toBeNull();
    // Their card in the game.
    (life.querySelector(".cq-btnrow .cq-btn") as HTMLButtonElement).click();
    expect(f.opened[f.opened.length - 1]).toMatchObject({ k: "char" });
  });

  test("the list shows the same people generation by generation", () => {
    const f = family();
    dynastyPick({ house: -1, who: null, view: "list" });
    const m = dynastyNow(f.ui)!;
    const div = document.createElement("div");
    render(dynastyPage(f.ui), div);
    expect(div.querySelectorAll(".cq-dyn-row")).toHaveLength(
      m.rec.people.length,
    );
    expect(div.querySelectorAll(".cq-dyn-gen")).toHaveLength(2);
    const ann = [...div.querySelectorAll<HTMLButtonElement>(".cq-dyn-row")].find(
      (b) => /Ann/.test(b.textContent ?? ""),
    )!;
    ann.click();
    render(dynastyPage(f.ui), div);
    expect(div.querySelector(".cq-dyn-life .cq-h3")?.textContent).toMatch(/Ann/);
    expect(div.querySelector(".cq-dyn-life")?.textContent).toMatch(
      /Daughter of Alden/,
    );
    dynastyPick({ view: null });
  });

  test("the big window, opened from the story told, goes back to it", () => {
    const f = family();
    dynastyPick({ house: -1, who: null, view: "tree" });
    const div = document.createElement("div");
    render(dynastyModal(f.ui, "end"), div);
    expect(div.querySelector(".cq-dyn-split-life .cq-dyn-life")).not.toBeNull();
    const back = [...div.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => /Back to the story/.test(b.textContent ?? ""),
    )!;
    back.click();
    expect(f.modals[f.modals.length - 1]).toEqual({ k: "end" });
    dynastyPick({ view: null });
  });
});
