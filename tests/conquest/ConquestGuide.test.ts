// How to Play (r11 wave 2): every link in the guide, every page's "?", every
// word's "more" and every "I want to…" goal leads to a chapter that exists;
// the chapters are well formed; the tables made from the rules match them;
// and the lists that hold still keep their order.

import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";
import {
  CHAPTERS,
  PARTS,
  WORDS,
} from "../../src/conquest/client/guide/Chapters";
import { forgetSteady, steadyOrder } from "../../src/conquest/client/ui/Steady";
import { TERMS } from "../../src/conquest/client/ui/Terms";
import { JOBS } from "../../src/conquest/engine/LifeRules";
import { OFFICES } from "../../src/conquest/engine/Offices";

const IDS = new Set([...CHAPTERS.map((c) => c.id), "glossary"]);
const src = (f: string) =>
  readFileSync(`${__dirname}/../../src/conquest/client/${f}`, "utf8");

describe("the guide", () => {
  test("chapters have unique ids, a known part, a title and a body", () => {
    expect(IDS.size).toBe(CHAPTERS.length + 1);
    const parts = new Set(PARTS.map((p) => p.id));
    for (const c of CHAPTERS) {
      expect(parts.has(c.part), c.id).toBe(true);
      expect(c.title.length, c.id).toBeGreaterThan(2);
      expect(c.body.length, c.id).toBeGreaterThan(200);
    }
  });

  test("every cross-link leads to a chapter", () => {
    const text = [
      ...CHAPTERS.map((c) => `${c.where ?? ""}\n${c.body}`),
      ...WORDS.map((w) => w[1]),
    ].join("\n");
    for (const m of text.matchAll(/\[\[([^\]|]+)/g))
      expect(IDS.has(m[1]), `[[${m[1]}]]`).toBe(true);
    for (const w of WORDS) if (w[2]) expect(IDS.has(w[2]), w[0]).toBe(true);
    for (const t of Object.values(TERMS))
      expect(IDS.has(t.ch), `${t.name} → ${t.ch}`).toBe(true);
  });

  test("every page's ? and every goal's guide is a chapter", () => {
    const nav = src("ui/Nav.ts");
    const finder = src("ui/Finder.ts");
    const asked = [
      ...nav.matchAll(/guide: "([a-z]+)"/g),
      ...nav.matchAll(/return "([a-z]+)";/g),
      ...finder.matchAll(/guide: "([a-z]+)"/g),
      ...finder.matchAll(/ch: "([a-z]+)"/g),
    ].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(40);
    for (const id of asked) expect(IDS.has(id), id).toBe(true);
  });

  test("tables are well formed: every row as wide as its header", () => {
    let tables = 0;
    for (const c of CHAPTERS) {
      const lines = c.body.split("\n").map((l) => l.trim());
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith("|") || lines[i - 1]?.startsWith("|"))
          continue;
        tables++;
        const width = (l: string) =>
          l.replace(/^\||\|$/g, "").split("|").length;
        const head = width(lines[i]);
        expect(head, `${c.id}: ${lines[i]}`).toBeGreaterThan(1);
        for (let j = i + 1; lines[j]?.startsWith("|"); j++)
          expect(width(lines[j]), `${c.id}: ${lines[j].slice(0, 70)}`).toBe(
            head,
          );
      }
    }
    expect(tables).toBeGreaterThan(15);
  });

  test("the trades and offices tables come from the rules", () => {
    const trades = CHAPTERS.find((c) => c.id === "trades")!.body;
    for (const [k, d] of Object.entries(JOBS)) {
      if (k === "servant") continue;
      expect(trades, d.name).toContain(`**${d.name}**`);
      for (const r of d.ranks) expect(trades, r.title).toContain(r.title);
    }
    const office = CHAPTERS.find((c) => c.id === "office")!.body;
    for (const o of Object.values(OFFICES))
      if (o.key !== "founder") expect(office, o.name).toContain(o.name);
  });

  test("the guide covers what the brief asks for", () => {
    for (const id of [
      "start",
      "maker",
      "lives",
      "time",
      "work",
      "trades",
      "money",
      "property",
      "markets",
      "wares",
      "leads",
      "boats",
      "followers",
      "crime",
      "people",
      "favour",
      "love",
      "family",
      "languages",
      "letters",
      "gatherings",
      "office",
      "military",
      "movements",
      "founding",
      "europe",
      "map",
      "multiplayer",
      "death",
      "end",
      "coins",
    ])
      expect(IDS.has(id), id).toBe(true);
  });
});

describe("lists in their first order", () => {
  test("new letters go at the end; answered ones keep their place", () => {
    forgetSteady();
    const key = (x: { id: number }) => x.id;
    const at = (xs: { id: number }[]) => xs.map((x) => x.id);
    expect(at(steadyOrder("l", "1", [{ id: 3 }, { id: 2 }], key))).toEqual([
      3, 2,
    ]);
    // A new letter arrives (newest first in the case): it goes last for now.
    expect(
      at(steadyOrder("l", "1", [{ id: 4 }, { id: 3 }, { id: 2 }], key)),
    ).toEqual([3, 2, 4]);
    // Next visit, the case's own order again.
    expect(
      at(steadyOrder("l", "2", [{ id: 4 }, { id: 3 }, { id: 2 }], key)),
    ).toEqual([4, 3, 2]);
  });
});
