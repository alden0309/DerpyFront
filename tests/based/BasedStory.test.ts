// Mr. Based's validator, and every chapter actually written: each must parse
// cleanly, every jump must land, no scene may run off its end, every flag
// that's read must be set somewhere, every scene must be reachable, and the
// chapter must be finishable. Also plays each chapter down many random paths.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { NavGrid } from "../../src/based/engine/Nav";
import { PlaceDef } from "../../src/based/engine/Place";
import {
  chapterStart,
  StoryRun,
  upgradeSnapshot,
} from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { buildOf } from "../../src/based/engine/Skills";
import {
  errorsOf,
  formatProblem,
  validateChapter,
} from "../../src/based/engine/Validate";

const ROOT = path.resolve(__dirname, "../..");
const STORY = path.join(ROOT, "src/based/story");
const ART = new Set(
  fs
    .readdirSync(path.join(ROOT, "src/based/art"))
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, "")),
);
const SOUNDS = new Set(
  fs
    .readdirSync(path.join(ROOT, "src/based/audio"))
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.replace(/\.mp3$/, "")),
);
// r21: the 3D places and the models they're built from.
const MODELS = new Set(
  fs
    .readdirSync(path.join(ROOT, "src/based/models"))
    .filter((f) => f.endsWith(".glb"))
    .map((f) => f.replace(/\.glb$/, "")),
);
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

function problems(src: string) {
  const { chapter, errors } = parseChapter(src);
  expect(errors).toEqual([]);
  return errorsOf(validateChapter(chapter)).map((p) => p.message);
}

describe("the validator", () => {
  const head = `@chapter 1 "T"\n@cast HERO "Hero"\n`;

  test("a jump to a scene that doesn't exist", () => {
    expect(problems(`${head}== a\nHi.\n-> b\n`)).toContainEqual(
      `"-> b": there's no such scene`,
    );
  });

  test("a scene that runs off its end", () => {
    const p = problems(
      `${head}== a\nchoose\n  * [x] -> END\n  * [y]\n    Hm.\nend\n`,
    );
    expect(p.some((m) => m.includes("can run off its end"))).toBe(true);
  });

  test("a flag read but never set", () => {
    expect(
      problems(`${head}== a\nif ghost\n  Boo.\nend\n-> END\n`),
    ).toContainEqual(`flag "ghost" is read but never set`);
  });

  test("a scene nobody can reach", () => {
    expect(problems(`${head}== a\n-> END\n== b\n-> END\n`)).toContainEqual(
      `scene "b" can't be reached from "a"`,
    );
  });

  test("a chapter that never ends", () => {
    const p = problems(`${head}== a\n-> b\n== b\n-> a\n`);
    expect(p).toContainEqual(`nothing ever reaches "-> END"`);
    expect(p).toContainEqual(`from "a" the chapter can never end`);
  });

  test("a choice that can run out of options", () => {
    const p = problems(
      `${head}== a\nset x\nchoose\n  * once [x] -> a\n  * if x [y] -> END\nend\n-> END\n`,
    );
    expect(p.some((m) => m.includes("could run out of options"))).toBe(true);
  });

  test("a spot whose text leaves the room", () => {
    const p = problems(
      `${head}== a\ninvestigate "Look"\n  spot s 1 1 "S"\n    -> END\nend\n-> END\n`,
    );
    expect(p.some((m) => m.includes("can't leave the room"))).toBe(true);
  });

  test("a deduction that needs something that isn't there", () => {
    const p = problems(
      `${head}== a\ninvestigate "Look"\n  spot s 1 1 "S"\n    S.\n  deduce d "D" needs=s,t\n    D.\nend\n-> END\n`,
    );
    expect(p.some((m) => m.includes(`needs "t"`))).toBe(true);
  });

  test("missing art", () => {
    const { chapter } = parseChapter(
      `${head}== a\n@backdrop nowhere\nHi.\n-> END\n`,
    );
    const p = validateChapter(chapter, { art: new Set(["bar"]) });
    expect(p.map((x) => x.message)).toContainEqual(
      "@backdrop nowhere: no such picture in the art folder",
    );
  });

  test("a clean chapter has no errors", () => {
    expect(
      problems(
        `${head}== a\nset x\nif x\n  Hi.\nend\nchoose\n  * [Go] -> b\n  * [Stay]\nend\n-> b\n== b\n-> END\n`,
      ),
    ).toEqual([]);
  });
});

describe("the art and sound", () => {
  const credits = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/based/art/credits.json"), "utf8"),
  ) as {
    items: {
      keys: string[];
      author: string;
      license: string;
      source: string;
    }[];
  };
  const credited = new Set(credits.items.flatMap((c) => c.keys));

  test("every picture, sound and model is credited", () => {
    expect(
      [...ART, ...SOUNDS, ...MODELS].filter((k) => !credited.has(k)),
    ).toEqual([]);
    for (const c of credits.items) {
      expect(c.author.length).toBeGreaterThan(0);
      expect(c.license).toMatch(/^CC/);
      expect(c.source).toMatch(/^https:\/\//);
    }
  });

  test("every model is a small, compressed glTF binary", () => {
    expect([...MODELS].sort()).toEqual(["mannequin_f", "mannequin_m", "props"]);
    for (const key of MODELS) {
      const buf = fs.readFileSync(
        path.join(ROOT, "src/based/models", `${key}.glb`),
      );
      expect(buf.subarray(0, 4).toString(), key).toBe("glTF");
      expect(buf.length, key).toBeLessThanOrEqual(300_000);
      // meshopt-compressed (the client decodes it).
      const json = buf.subarray(20, 20 + buf.readUInt32LE(12)).toString();
      expect(json, key).toContain("EXT_meshopt_compression");
    }
  });

  test("every picture is a small WebP", () => {
    for (const key of ART) {
      const size = fs.statSync(
        path.join(ROOT, "src/based/art", `${key}.webp`),
      ).size;
      expect(size, key).toBeLessThanOrEqual(250_000);
    }
  });
});

const files = fs.readdirSync(STORY).filter((f) => f.endsWith(".story"));

describe("the places (r21)", () => {
  test.each(Object.keys(PLACES))("%s: every mark can be walked to", (key) => {
    const p = PLACES[key];
    expect(p.key).toBe(key);
    const nav = new NavGrid(p.nav.bounds, p.nav.cell, p.nav.blocks);
    const marks = Object.entries(p.marks);
    expect(marks.length).toBeGreaterThan(0);
    // From the first mark, every other mark has a path (the last step may
    // be onto a stool, which is in the way of walking but not of sitting).
    const [, from] = marks[0];
    for (const [name, m] of marks) {
      const path = nav.path(from.at, m.at);
      expect(path, `${key}: no way to ${name}`).not.toBeNull();
    }
    // Hotspots that send him somewhere send him to a mark.
    for (const [name, h] of Object.entries(p.hotspots)) {
      if (h.stand) expect(p.marks, `${key}.${name}`).toHaveProperty(h.stand);
    }
    // Every room that can be cut away is inside the walkable plan.
    for (const a of p.areas) {
      expect(a.rect[0]).toBeGreaterThanOrEqual(p.nav.bounds[0]);
      expect(a.rect[2]).toBeLessThanOrEqual(p.nav.bounds[2]);
    }
  });
});

describe("the chapters as written", () => {
  test("there is at least chapter one", () => {
    expect(files).toContain("chapter-01.story");
  });

  test.each(files)("%s parses and validates", (file) => {
    const { chapter, errors } = parseChapter(
      fs.readFileSync(path.join(STORY, file), "utf8"),
    );
    expect(errors.map((e) => `line ${e.line}: ${e.message}`)).toEqual([]);
    const found = validateChapter(chapter, {
      art: ART,
      sounds: SOUNDS,
      places: PLACES,
    });
    expect(errorsOf(found).map(formatProblem)).toEqual([]);
    expect(file).toBe(`chapter-${String(chapter.n).padStart(2, "0")}.story`);
  });

  test.each(files)(
    "%s can be played to the end down many paths",
    (file) => {
      const { chapter } = parseChapter(
        fs.readFileSync(path.join(STORY, file), "utf8"),
      );
      let seed = 1;
      const pick = (n: number) => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed % n;
      };
      const scenesSeen = new Set<string>();
      const optionsSeen = new Set<string>();
      for (let run = 0; run < 200; run++) {
        // Every archetype, and a different throw of the dice each time.
        const builds = chapter.archetypes.map(buildOf);
        const r = new StoryRun(
          chapter,
          chapterStart(chapter, undefined, {
            build: builds.length > 0 ? builds[run % builds.length] : null,
            seed: run + 1,
          }),
        );
        for (let steps = 0; ; steps++) {
          expect(steps).toBeLessThan(5000);
          const b = r.beat;
          if (b.kind === "end") break;
          if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
            r.advance();
          } else if (b.kind === "choice") {
            const open = b.options.filter((o) => !o.check?.locked);
            expect(open.length).toBeGreaterThan(0);
            if (pick(5) === 0 && b.timer > 0) r.timeout();
            else r.choose(open[pick(open.length)].id);
          } else {
            const unseen = b.spots.filter((s) => !s.seen);
            const ready = b.deductions.filter(
              (d) => d.ready && !d.done && !d.check?.locked,
            );
            const k = pick(4);
            if (k === 0 && ready.length > 0) r.deduce(ready[0].id);
            else if (k === 1 && b.canLeave) r.leave();
            else if (unseen.length > 0)
              r.examine(unseen[pick(unseen.length)].id);
            else if (ready.length > 0) r.deduce(ready[0].id);
            else r.leave();
          }
        }
        for (const step of r.history()) {
          if (step.startsWith("s:")) scenesSeen.add(step.slice(2));
          else optionsSeen.add(step.slice(2));
        }
      }
      // Every scene turns up on some path.
      expect([...chapter.order].filter((s) => !scenesSeen.has(s))).toEqual([]);
      expect(optionsSeen.size).toBeGreaterThan(10);
    },
    60_000,
  );
});

describe("saves from before the 3D chapter (r21)", () => {
  const { chapter } = parseChapter(
    fs.readFileSync(path.join(STORY, "chapter-01.story"), "utf8"),
  );

  test("an old save in the bar gets its place and its people back", () => {
    // As round 19 saved it, at the start of "anselme".
    const old = {
      chapter: 1,
      scene: "anselme",
      flags: {
        thoughts: 2,
        thought_glass: 1,
        thought_scar: 1,
        posters: 1,
        van: 1,
      },
      rels: {},
      stage: {
        backdrop: "glass",
        figure: null,
        ambient: "rain_in",
        news: null,
      },
      path: [
        "s:open",
        "s:vauban",
        "s:reverie",
        "c:reverie#1=the-first-glass",
        "s:t_glass",
        "s:reverie",
        "c:reverie#1=his-left-hand",
        "s:t_scar",
        "s:reverie",
        "s:interrupted",
      ],
      taken: ["reverie#1/the-first-glass", "reverie#1/his-left-hand"],
    };
    const up = upgradeSnapshot(chapter, old as never);
    expect(up.stage.place).toBe("grenelle");
    expect(up.stage.actors.BASED).toMatchObject({
      at: "stool_end",
      pose: "sit",
    });
    expect(up.stage.actors.ANSELME).toMatchObject({ at: "behind_bar_based" });
    // The save's own state is kept.
    expect(up.flags).toEqual(old.flags);
    expect(up.path).toEqual(old.path);
    expect(up.scene).toBe("anselme");
    const r = new StoryRun(chapter, up);
    expect(r.stage.place).toBe("grenelle");
  });

  test("a new save is left alone", () => {
    const snap = new StoryRun(chapter).snapshot();
    expect(upgradeSnapshot(chapter, snap)).toBe(snap);
  });
});
