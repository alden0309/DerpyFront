// r25: nothing he can't know. The `@fact` lines, the validator's check that
// a line in his voice which gives a fact away is where he learns it or
// comes after a condition that makes sure of it, `if heard` after a passive
// check, and chapter one played down random paths, never once showing him
// knowing what he hasn't learned.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { evalExpr } from "../../src/based/engine/Expr";
import { factsIn, knowsFact } from "../../src/based/engine/Facts";
import { PlaceDef } from "../../src/based/engine/Place";
import { chapterStart, StoryRun } from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { buildOf } from "../../src/based/engine/Skills";
import { Chapter } from "../../src/based/engine/Types";
import { errorsOf, validateChapter } from "../../src/based/engine/Validate";
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

const head = `@chapter 1 "T"\n@cast HERO "Hero"\n@cast BAR "The barman"\n@fact knows_pin "grandson"\n@fact knows_room|key_gone "forty-one"\n`;

function factErrors(src: string): string[] {
  const { chapter, errors } = parseChapter(head + src);
  expect(errors).toEqual([]);
  return errorsOf(validateChapter(chapter))
    .map((p) => p.message)
    .filter((m) => m.includes("gives away"));
}

describe("@fact and the validator (r25)", () => {
  test("@fact is parsed: its flags and its words", () => {
    const { chapter, errors } = parseChapter(`${head}== a\n-> END\n`);
    expect(errors).toEqual([]);
    expect(chapter.facts).toEqual([
      { flags: ["knows_pin"], words: ["grandson"], src: 4 },
      { flags: ["knows_room", "key_gone"], words: ["forty-one"], src: 5 },
    ]);
    expect(
      parseChapter(`@chapter 1 "T"\n@fact\n== a\n-> END\n`).errors,
    ).toHaveLength(1);
    expect(
      parseChapter(`@chapter 1 "T"\n@fact Bad "x"\n== a\n-> END\n`).errors,
    ).toHaveLength(1);
  });

  test("a line in his voice that gives a fact away, ungated, is an error", () => {
    const p = factErrors(
      `== a\nset knows_pin\n-> b\n== b\n@on look x\n~ The barman's grandson wears one.\n-> END\n`,
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("knows_pin");
    // In narration, what he says, a choice and its options too.
    expect(
      factErrors(
        `== a\nset knows_pin\nHis grandson.\nchoose "The grandson?"\n  * [Ask about forty-one] "Forty-one?"\n  * [No]\nend\n-> END\n== z\n@on auto\nThe grandson again.\n-> END\n`,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("gated by an if, the scene's trigger, an option, a set before, or every way in", () => {
    const ok = [
      // an if
      `== a\nset knows_pin\nif knows_pin\n  ~ The grandson.\nend\n-> END\n`,
      // the trigger
      `== a\nset knows_pin\n-> FREE\n== b\n@on look x if knows_pin\n~ The grandson.\n-> END\n`,
      // an option
      `== a\nset knows_pin\nchoose "?"\n  * if knows_pin [The grandson] "Your grandson."\n  * [No]\nend\n-> END\n`,
      // set earlier in the scene
      `== a\nset knows_pin\n~ The grandson.\n-> END\n`,
      // where he learns it: the set right after the line
      `== a\nBAR: My grandson wears a pin.\n~ A grandson with a pin.\nset knows_pin\n-> END\n`,
      // any of the fact's flags, or a clause of them
      `== a\nset key_gone\n-> FREE\n== b\n@on look x if key_gone or knows_room\n~ Forty-one.\n-> END\n`,
      // every jump in knows it
      `== a\nset knows_pin\nchoose "?"\n  * [x] -> c\n  * [y] -> c\nend\n== c\n~ The grandson.\n-> END\n`,
    ];
    for (const src of ok) expect(factErrors(src), src).toEqual([]);
  });

  test("not when only some of the ways in know it, or the condition doesn't say", () => {
    expect(
      factErrors(
        `== a\nchoose "?"\n  * [x]\n    set knows_pin\n    -> c\n  * [y] -> c\nend\n== c\n~ The grandson.\n-> END\n`,
      ),
    ).toHaveLength(1);
    expect(
      factErrors(
        `== a\nset knows_pin\nset other\n-> FREE\n== b\n@on look x if knows_pin or other\n~ The grandson.\n-> END\n`,
      ),
    ).toHaveLength(1);
    // Other people may know it.
    expect(
      factErrors(`== a\nBAR: My grandson.\nset knows_pin\n-> END\n`),
    ).toEqual([]);
  });

  test("r26: and everything else the page shows: titles, labels, thoughts, the journal, his pockets, cards, the news, what he carries on", () => {
    const sources: [string, string][] = [
      [
        "a scene's title",
        `== a\nset knows_pin\n-> END\n== b "The grandson"\n@on talk BAR\nHi.\n-> FREE\n`,
      ],
      [
        "the label over a thing",
        `== a\nset knows_pin\n-> END\n== b "The grandson's photo"\n@on look photo if knows_pin\nHi.\n-> FREE\n== c "The photo"\n@on look photo\nHi.\n-> FREE\n`,
      ],
      [
        "a thought",
        `== a\nset knows_pin\n-> END\n== b "A thought"\n@on think "What about the grandson?"\nHmm.\n-> FREE\n`,
      ],
      [
        "the journal",
        `== a\ntask t "Find the grandson."\nset knows_pin\nchoose "x"\n  * [y]\nend\n-> END\n`,
      ],
      [
        "what he's given",
        `@item pin "The grandson's pin" kind=small "Small."\n== a\ngive pin\nchoose "x"\n  * [y]\nend\nset knows_pin\n-> END\n`,
      ],
      ["a card", `== a\n@card "THE GRANDSON" "Later"\nset knows_pin\n-> END\n`],
      [
        "the news",
        `== a\n@news "Le grandson parle"\nchoose "x"\n  * [y]\nend\nset knows_pin\n-> END\n`,
      ],
      [
        "what he carries on with",
        `@carry "You know the grandson."\n== a\nset knows_pin\n-> END\n`,
      ],
    ];
    for (const [what, src] of sources) {
      expect(factErrors(src), what).not.toEqual([]);
    }
    // Gated, they're fine.
    expect(
      factErrors(
        `@carry "You know the grandson." if knows_pin\n== a\nset knows_pin\n-> END\n== b "The grandson"\n@on talk BAR if knows_pin\nHi.\n-> FREE\n`,
      ),
    ).toEqual([]);
  });

  test("a @fact flag nobody sets is an error", () => {
    const { chapter } = parseChapter(`${head}== a\n-> END\n`);
    expect(
      errorsOf(validateChapter(chapter)).map((p) => p.message),
    ).toContainEqual("@fact knows_pin: the flag is never set");
  });

  test("`if heard`: what he only knows if a passive check was heard", () => {
    const src = `@chapter 1 "T"\n@cast HERO "Hero"\n@attribute A "A" "a"\n@skill EYES A "Eyes" "e"\n@points 2 min=1 max=5\n@archetype SHARP "Sharp" A=2 signature=EYES "s"\n== a\n~ EYES medium: Nine ends.\nif heard\n  set counted\nend\nif counted\n  Counted.\nend\n-> END\n`;
    const { chapter, errors } = parseChapter(src);
    expect(errors).toEqual([]);
    // Eyes 3 (signature): 3 + 6 >= 9, heard.
    const sharp = new StoryRun(
      chapter,
      chapterStart(chapter, undefined, {
        build: buildOf(chapter.archetypes[0]),
      }),
    );
    expect(sharp.beat).toMatchObject({ kind: "line", text: "Nine ends." });
    sharp.advance();
    expect(sharp.flag("counted")).toBe(1);
    // Eyes 1: not heard, not set.
    const dull = new StoryRun(
      chapter,
      chapterStart(chapter, undefined, {
        build: { attrs: { A: 1 }, signature: "EYES" },
      }),
    );
    expect(dull.beat).toEqual({ kind: "end" });
    expect(dull.flag("counted")).toBe(0);
    expect(
      parseChapter(`@chapter 1 "T"\n== a\nset heard\n-> END\n`).errors,
    ).toHaveLength(1);
  });
});

/**
 * Chapter one down random paths: everything the page shows him that comes
 * from the script gives a fact away only when he knows it (or with it set
 * before the story next stops to ask): his lines,
 * choices, options and the reasons on their checks, the dice and what
 * counted, the rooms he reads (title, spots, the deductions he's ready for
 * and their reasons), the journal, what he carries and what it says about
 * itself, the thoughts in the column, the scene's title, the label over
 * each thing he can look at, the television's ticker, and at the end what
 * he carries on with.
 */
function wander(chapter: Chapter, seed: number, problems: Set<string>) {
  const pick = rng(seed);
  const builds = chapter.archetypes.map(buildOf);
  const r = new StoryRun(
    chapter,
    chapterStart(chapter, undefined, {
      build: builds[seed % builds.length],
      seed,
    }),
  );
  // What a thing he can look at is called (the first scene that looks at it).
  const labelOf = new Map<string, string>();
  for (const id of chapter.order) {
    const t = chapter.scenes[id].trigger;
    if (t?.on === "look" && t.target && !labelOf.has(t.target))
      labelOf.set(t.target, chapter.scenes[id].label);
  }
  let pending: {
    text: string;
    scene: string;
    f: ReturnType<typeof factsIn>[number];
  }[] = [];
  const said = new Set<string>();
  const later = (what: string, text: string, flags: Record<string, number>) => {
    for (const f of factsIn(chapter, text)) {
      if (!knowsFact(f, flags))
        pending.push({ text: `${what}: ${text}`, scene: r.sceneId, f });
    }
  };
  for (let step = 0; step < 5000; step++) {
    const b = r.beat;
    const flags = r.values().flags;
    if (b.kind !== "line" || pending[0]?.scene !== r.sceneId) {
      for (const p of pending) {
        if (!knowsFact(p.f, flags)) problems.add(`${p.scene}: ${p.text}`);
      }
      pending = [];
    }
    const shown: string[] = [];
    if (b.kind === "line") {
      if (b.line !== "say" || b.who === r.hero) later("line", b.text, flags);
    } else if (b.kind === "choice") {
      shown.push(b.prompt, ...b.options.map((o) => o.label));
      for (const o of b.options)
        shown.push(...(o.check?.mods ?? []).map((m) => m.why));
    } else if (b.kind === "roll") {
      shown.push(b.label, ...b.mods.map((m) => m.why));
    } else if (b.kind === "investigate") {
      shown.push(b.title, ...b.spots.map((s) => s.label));
      for (const d of b.deductions.filter((x) => x.ready)) {
        shown.push(d.label, ...(d.check?.mods ?? []).map((m) => m.why));
      }
    } else if (b.kind === "free") {
      const here = r.stage.place ? PLACES[r.stage.place] : undefined;
      const a = r.available(Object.keys(here?.hotspots ?? {}));
      shown.push(...a.think.map((t) => t.label));
      for (const t of a.look) shown.push(labelOf.get(t) ?? "");
    }
    if (b.kind !== "free" && b.kind !== "end" && r.sceneId !== "FREE") {
      shown.push(chapter.scenes[r.sceneId]?.label ?? "");
    }
    // The journal, his pockets, the ticker: as they change, once each.
    const now = [
      ...r.tasks.map((t) => `journal: ${t.text}`),
      ...Object.keys(r.items).flatMap((k) => [
        `item: ${chapter.items[k]?.name}`,
        `item: ${chapter.items[k]?.about}`,
      ]),
      ...(r.stage.news ? [`news: ${r.stage.news}`] : []),
    ];
    for (const t of now) {
      if (said.has(t)) continue;
      said.add(t);
      later(t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 2), flags);
    }
    for (const t of shown) {
      for (const f of factsIn(chapter, t)) {
        if (!knowsFact(f, flags)) problems.add(`${r.sceneId}: ${t}`);
      }
    }
    if (b.kind === "end") {
      // What he carries on with, as the end of the chapter lists it.
      const v = r.values();
      for (const c of chapter.carry) {
        if (c.cond && !evalExpr(c.cond, v as Parameters<typeof evalExpr>[1]))
          continue;
        for (const f of factsIn(chapter, c.text)) {
          if (!knowsFact(f, v.flags)) problems.add(`@carry: ${c.text}`);
        }
      }
      return true;
    }
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll")
      r.advance();
    else if (b.kind === "choice") {
      const open = b.options.filter(
        (o) => !o.check?.locked && o.needs?.met !== false,
      );
      if (pick(5) === 0 && b.timer > 0) r.timeout();
      else r.choose(open[pick(open.length)].id);
    } else if (b.kind === "free") {
      const acts = freeActions(r, PLACES);
      if (acts.length === 0) return false;
      acts[pick(acts.length)]();
    } else {
      const unseen = b.spots.filter((s) => !s.seen);
      const ready = b.deductions.filter(
        (d) => d.ready && !d.done && !d.check?.locked,
      );
      const k = pick(4);
      if (k === 0 && ready.length > 0) r.deduce(ready[0].id);
      else if (k === 1 && b.canLeave) r.leave();
      else if (unseen.length > 0) r.examine(unseen[pick(unseen.length)].id);
      else if (ready.length > 0) r.deduce(ready[0].id);
      else r.leave();
    }
  }
  return false;
}

describe("chapter one: nothing he can't know (r25)", () => {
  const { chapter } = parseChapter(
    fs.readFileSync(
      path.join(ROOT, "src/based/story/chapter-01.story"),
      "utf8",
    ),
  );

  test("it lists what he can only know once he's learned it", () => {
    const words = (chapter.facts ?? []).flatMap((f) => f.words);
    // The owner's example: the barman's grandson's pin.
    expect(words).toContain("grandson");
    expect(words).toEqual(
      expect.arrayContaining(["forty-one", "Satory", "Marchal", "Delorme"]),
    );
  });

  test("random paths never show him a fact before he's learned it", () => {
    const problems = new Set<string>();
    let ended = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (wander(chapter, seed, problems)) ended++;
    }
    expect([...problems]).toEqual([]);
    expect(ended).toBe(200);
  }, 60_000);
});
