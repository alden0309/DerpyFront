// BSTORY (r26): Mr. Based is American (ex-Agency), travelling on his own
// American passport; London hired him because he isn't one of theirs. The
// cover he tells people is one story, the same to everyone: his own name,
// a buyer for a wine importer in Boston, over for the tastings (the room
// booked by Lisle and Hart, the London shippers he buys from). Nothing calls
// him British or gives him another name or another home.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { PlaceDef } from "../../src/based/engine/Place";
import { chapterStart, StoryRun } from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { buildOf } from "../../src/based/engine/Skills";
import { Op } from "../../src/based/engine/Types";
import { freeActions, rng } from "./play";

const ROOT = path.resolve(__dirname, "../..");
const PLACES: Record<string, PlaceDef> = Object.fromEntries(
  fs
    .readdirSync(path.join(ROOT, "src/based/places"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(
        fs.readFileSync(path.join(ROOT, "src/based/places", f), "utf8"),
      ) as PlaceDef,
    ]),
);
const { chapter } = parseChapter(
  fs.readFileSync(path.join(ROOT, "src/based/story/chapter-01.story"), "utf8"),
);
const HERO = chapter.cast[0].id;

/** The cover, as written: name, home city, trade. */
const COVER = { name: "Based", city: "Boston", trade: /\bwine\b/i };
/** Places a man could say he's from (the cover's is Boston, and only it). */
const HOMES =
  /\b(Boston|New York|Chicago|Seattle|Denver|Philadelphia|San Francisco|Los Angeles|Baltimore|Atlanta|Dallas|Houston|Miami|Manchester|Leeds|Edinburgh|Glasgow|Bristol|Liverpool|Birmingham|Oxford|Cambridge|Dublin|Toronto|Sydney)\b/g;
/** What states a cover: his trade, his importer, the tastings, his name. */
const COVERISH =
  /\b(import(er)?|buy(ing)? (wine|from them|it)|wine (buyer|trade)|in wine|tastings?|claret)\b/i;

/** Every line in his voice, every option, item and carried-on line. */
function hisTexts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const id of chapter.order) {
    for (const op of chapter.scenes[id].ops as Op[]) {
      if (op.op === "line" && (op.kind !== "say" || op.who === HERO)) {
        out.push({ where: id, text: op.text });
      } else if (op.op === "choose") {
        for (const o of op.options) out.push({ where: id, text: o.label });
      }
    }
  }
  for (const it of Object.values(chapter.items)) {
    out.push({ where: `@item ${it.key}`, text: `${it.name}. ${it.about}` });
  }
  for (const c of chapter.carry) out.push({ where: "@carry", text: c.text });
  return out;
}

/** Every line anyone says or the story narrates. */
function allLines(): { where: string; who?: string; text: string }[] {
  const out: { where: string; who?: string; text: string }[] = [];
  for (const id of chapter.order) {
    for (const op of chapter.scenes[id].ops as Op[]) {
      if (op.op === "line") {
        out.push({ where: id, who: op.who, text: op.text });
        if (op.trans) out.push({ where: id, who: op.who, text: op.trans });
      }
    }
  }
  return out;
}

describe("his cover (r26): one American story, the same to everyone", () => {
  test("the passport and the opening set it: his own name, a wine buyer for an importer in Boston", () => {
    const passport = chapter.items.passport.about;
    expect(passport).toMatch(/American, in his own name/);
    expect(passport).toMatch(/wine importer in Boston/);
    const open = allLines().find((l) =>
      /Lisle and Hart, wine shippers/.test(l.text),
    );
    expect(open?.text).toMatch(/importer in Boston/);
  });

  test("every time he gives it, to the barman, the man in grey and the clerk, it's the same", () => {
    const told = allLines().filter(
      (l) => l.who === HERO && COVERISH.test(l.text),
    );
    const where = new Set(told.map((l) => l.where));
    for (const scene of ["order", "talk", "clerk_first", "clerk_ready"]) {
      expect(where, scene).toContain(scene);
    }
    for (const l of told) {
      expect(l.text, l.where).toMatch(COVER.trade);
      // Where he says where he's from, it's Boston, and nowhere else.
      if (/importer/.test(l.text)) expect(l.text, l.where).toMatch(/Boston/);
    }
  });

  test("no other home and no other name: Boston only, and Based or nothing", () => {
    for (const t of [...hisTexts(), ...allLines()]) {
      for (const m of t.text.matchAll(HOMES)) {
        expect(m[0], `${t.where}: ${t.text}`).toBe(COVER.city);
      }
      expect(t.text, t.where).not.toMatch(/\bWalker\b/);
    }
    // When the man in grey asks for a name: his own, or none.
    const name = chapter.scenes.name.ops.find((o) => o.op === "choose");
    expect(name?.op).toBe("choose");
    if (name?.op !== "choose") return;
    const said = name.options.flatMap((o) =>
      (chapter.scenes.name.ops as Op[])
        .slice(o.at, o.at + 2)
        .filter((x) => x.op === "line" && x.who === HERO)
        .map((x) => (x.op === "line" ? x.text : "")),
    );
    for (const t of said) {
      const names = t.match(/\b[A-Z][a-z]+\b/g) ?? [];
      for (const n of names.filter((x) => !/^(In|The|Names|I)$/.test(x))) {
        expect(n, t).toBe(COVER.name);
      }
    }
  });

  test("nothing calls him British or gives him a British past", () => {
    // Every line that says British, English or Englishman is about London's
    // people, the man in grey, or the language: listed, so a new one is read.
    const brit = allLines()
      .filter((l) =>
        /\b(British|English|Englishman|anglais|Brit)\b/i.test(l.text),
      )
      .map((l) => `${l.where}: ${l.text.split(" ").slice(0, 5).join(" ")}`);
    expect(brit).toEqual([
      "t_phone: Deniable. The most British word",
      "talk: His English was very good.",
      "talk: Westminster, then Sciences Po. The",
      "talk: My President thinks France has",
      "clerk_ask: Monsieur Delorme? He is up",
      "epilogue: Then I'll say it when",
      "epilogue: And the English?",
    ]);
    // What they call him, they call him American.
    const nationality = allLines().filter((l) =>
      /\b(Americans?|Américain)\b/.test(l.text),
    );
    expect(nationality.length).toBeGreaterThan(0);
    // English (British) is a language he can buy, not his own.
    expect(chapter.languages.find((l) => l.code === "en_gb")?.name).toBe(
      "English (British)",
    );
    const readme = fs.readFileSync(
      path.join(ROOT, "src/based/README.md"),
      "utf8",
    );
    expect(readme).toMatch(/American English/);
  });

  test("down random paths, whatever he tells anyone of himself is the cover", () => {
    const builds = chapter.archetypes.map(buildOf);
    let told = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const pick = rng(seed);
      const r = new StoryRun(
        chapter,
        chapterStart(chapter, undefined, {
          build: builds[seed % builds.length],
          seed,
        }),
      );
      for (let step = 0; step < 5000; step++) {
        const b = r.beat;
        if (b.kind === "end") break;
        if (b.kind === "line") {
          const t = b.text;
          const his = b.who === HERO || b.line !== "say";
          if (his && COVERISH.test(t) && b.who === HERO) {
            told++;
            expect(t).toMatch(COVER.trade);
            if (/importer/.test(t)) expect(t).toMatch(/Boston/);
          }
          for (const m of t.matchAll(HOMES)) expect(m[0], t).toBe(COVER.city);
          r.advance();
        } else if (b.kind === "card" || b.kind === "roll") r.advance();
        else if (b.kind === "choice") {
          const open = b.options.filter(
            (o) => !o.check?.locked && o.needs?.met !== false,
          );
          r.choose(open[pick(open.length)].id);
        } else if (b.kind === "free") {
          const acts = freeActions(r, PLACES);
          if (acts.length === 0) break;
          acts[pick(acts.length)]();
        } else {
          const unseen = b.spots.filter((s) => !s.seen);
          if (unseen.length > 0 && !b.canLeave) r.examine(unseen[0].id);
          else r.leave();
        }
      }
    }
    expect(told).toBeGreaterThan(20);
  }, 60_000);
});
