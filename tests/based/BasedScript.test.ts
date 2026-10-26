// r26: the script export (scripts/based-script.ts): a chapter as one page to
// read. The blocks come back as the parser built them (ifs, elifs, choices,
// checks and their failures, rooms to read), chapter one's page holds every
// line the player can reach and everything random paths show him, every
// flag has plain words, every reference is one of a kind and every link
// lands, and it never goes where the site serves from.

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import {
  Node,
  notHere,
  opsShown,
  ScriptExport,
  scriptHtml,
  shapeOf,
} from "../../scripts/based-script";
import { FLAG_WORDS } from "../../scripts/based-script-words";
import { exprReads } from "../../src/based/engine/Expr";
import { chapterStart, StoryRun } from "../../src/based/engine/Runtime";
import { parseChapter } from "../../src/based/engine/Script";
import { buildOf } from "../../src/based/engine/Skills";
import { Chapter, Expr, Op } from "../../src/based/engine/Types";
import { freeActions, rng } from "./play";

const ROOT = path.resolve(__dirname, "../..");

/** What a page says, as text: no tags, entities read, spaces as one. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** A line as the page shows it: *stressed* words without their stars. */
const plain = (t: string) =>
  t
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** The lines of a shape, in order (for the shape tests). */
function lines(nodes: Node[]): string[] {
  return nodes.flatMap((n) =>
    n.k === "op" && n.op.op === "line" ? [n.op.text] : [],
  );
}

describe("the shape of a scene", () => {
  const src = `@chapter 1 "T"
@cast HERO "Hero"
@cast BAR "The barman"
@attribute A "A" "a"
@skill EYES A "Eyes" "e"
@points 2 min=1 max=5
@archetype SHARP "Sharp" A=2 signature=EYES "s"
== a
if x
  One.
elif y
  Two.
else
  if z
    Three.
  end
end
choose "Pick"
  * [Go] -> b
  * [Say] "Hi."
    BAR: Hello.
  * white EYES medium [Look]
    bonus +1 if x "Because"
    Seen.
  fail
    Missed.
  * white EYES easy [Peek]
    Peeked.
end
Last.
-> b
== b
investigate "Room" min=1 leave="Done"
  spot s1 "Spot one"
    A spot.
  deduce d1 "Worked out" needs=s1 skill=EYES diff=medium
    Yes.
  fail
    No.
  deduce d2 "Also" needs=s1
    Plain.
end
-> c
== c
if x
  choose "?"
    * [One] -> a
    * [Two] -> b
  end
else
  Else.
end
-> END
`;
  const { chapter, errors } = parseChapter(src);
  const lns = src.split("\n");

  test("ifs, elifs and the else, choices, checks with and without a failure", () => {
    expect(errors).toEqual([]);
    const a = shapeOf(chapter.scenes.a, lns);
    expect(a.map((n) => n.k)).toEqual(["if", "choose", "op", "op"]);
    const iff = a[0] as Extract<Node, { k: "if" }>;
    expect(iff.branches.map((b) => b.cond === null)).toEqual([
      false,
      false,
      true,
    ]);
    expect(lines(iff.branches[0].body)).toEqual(["One."]);
    expect(lines(iff.branches[1].body)).toEqual(["Two."]);
    expect(iff.branches[2].body.map((n) => n.k)).toEqual(["if"]);
    const ch = a[1] as Extract<Node, { k: "choose" }>;
    expect(ch.options.map((o) => o.opt.label)).toEqual([
      "Go",
      "Say",
      "Look",
      "Peek",
    ]);
    const go = ch.options[0].body;
    expect(go).toHaveLength(1);
    expect(go[0].k === "op" && go[0].op).toMatchObject({
      op: "goto",
      scene: "b",
    });
    expect(lines(ch.options[1].body)).toEqual(["Hi.", "Hello."]);
    const look = ch.options[2].body[0] as Extract<Node, { k: "check" }>;
    expect(look.k).toBe("check");
    expect(lines(look.pass)).toEqual(["Seen."]);
    expect(lines(look.fail)).toEqual(["Missed."]);
    const peek = ch.options[3].body[0] as Extract<Node, { k: "check" }>;
    expect(lines(peek.pass)).toEqual(["Peeked."]);
    expect(peek.fail).toEqual([]);
    expect(lines(a)).toEqual(["Last."]);
  });

  test("a room to read: spots, deductions and their failures", () => {
    const b = shapeOf(chapter.scenes.b, lns);
    expect(b.map((n) => n.k)).toEqual(["look", "op"]);
    const parts = (b[0] as Extract<Node, { k: "look" }>).parts;
    expect(parts.map((p) => p.k)).toEqual(["spot", "ded", "ded"]);
    if (parts[0].k === "spot")
      expect(lines(parts[0].body)).toEqual(["A spot."]);
    if (parts[1].k === "ded") {
      expect(lines(parts[1].pass)).toEqual(["Yes."]);
      expect(lines(parts[1].fail)).toEqual(["No."]);
    }
    if (parts[2].k === "ded") {
      expect(lines(parts[2].pass)).toEqual(["Plain."]);
      expect(parts[2].fail).toEqual([]);
    }
  });

  test("a choice whose options all jump, inside an if with an else", () => {
    const c = shapeOf(chapter.scenes.c, lns);
    expect(c.map((n) => n.k)).toEqual(["if", "op"]);
    const iff = c[0] as Extract<Node, { k: "if" }>;
    expect(iff.branches).toHaveLength(2);
    const ch = iff.branches[0].body[0] as Extract<Node, { k: "choose" }>;
    expect(ch.k).toBe("choose");
    expect(ch.options.map((o) => o.body.length)).toEqual([1, 1]);
    expect(lines(iff.branches[1].body)).toEqual(["Else."]);
  });
});

/** The ops a scene can reach, from its first. */
function reachable(ops: Op[]): Set<number> {
  const next = (i: number): number[] => {
    const op = ops[i];
    switch (op.op) {
      case "if":
        return [i + 1, op.else];
      case "jump":
        return [op.to];
      case "goto":
      case "return":
      case "fall":
        return [];
      case "choose":
        return op.options.map((o) => o.at);
      case "investigate":
        return [
          ...op.spots.map((s) => s.at),
          ...op.deductions.flatMap((d) =>
            d.failAt !== undefined ? [d.at, d.failAt] : [d.at],
          ),
          op.after,
        ];
      case "check":
        return [i + 1, op.fail];
      default:
        return [i + 1];
    }
  };
  const seen = new Set<number>();
  const todo = [0];
  while (todo.length > 0) {
    const i = todo.pop()!;
    if (seen.has(i) || i < 0 || i >= ops.length) continue;
    seen.add(i);
    todo.push(...next(i));
  }
  return seen;
}

/** Every flag a chapter sets, reads, or names a spot or a deduction after. */
function flagsOf(ch: Chapter): Set<string> {
  const out = new Set<string>();
  const read = (e: Expr | undefined) => {
    if (e)
      for (const f of exprReads(e, { flags: [], rels: [] }).flags) out.add(f);
  };
  for (const c of ch.carry) read(c.cond);
  for (const id of ch.order) {
    const sc = ch.scenes[id];
    read(sc.trigger?.cond);
    for (const op of sc.ops) {
      if (op.op === "set") out.add(op.flag);
      if (op.op === "if") read(op.cond);
      if (op.op === "choose") {
        for (const o of op.options) {
          read(o.cond);
          for (const m of o.check?.mods ?? []) read(m.cond);
        }
      }
      if (op.op === "investigate") {
        for (const s of op.spots) out.add(s.id);
        for (const d of op.deductions) {
          out.add(d.id);
          for (const m of d.check?.mods ?? []) read(m.cond);
        }
      }
    }
  }
  return out;
}

describe("chapter one's script", () => {
  const { html, exp } = scriptHtml(1, { made: "test" });
  const page = textOf(html);
  const ch = exp.chapter;
  const has = (t: string | undefined | null) => !t || page.includes(plain(t));

  test("every step every scene can reach is on the page", () => {
    const missing: string[] = [];
    for (const id of ch.order) {
      const sc = ch.scenes[id];
      const shown = opsShown(exp.info.get(id)!.shape);
      for (const i of reachable(sc.ops)) {
        const op = sc.ops[i];
        if (op.op === "jump" || op.op === "return" || op.op === "fall")
          continue;
        if (!shown.has(i)) missing.push(`${id}: ${op.op} (line ${op.src})`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("every reachable line of chapter one is in it, word for word", () => {
    const missing: string[] = [];
    const want = (t: string | undefined | null, where: string) => {
      if (!has(t)) missing.push(`${where}: ${t}`);
    };
    let count = 0;
    for (const id of ch.order) {
      const sc = ch.scenes[id];
      want(sc.label, `${id} title`);
      want(sc.trigger?.label, `${id} thought`);
      for (const i of reachable(sc.ops)) {
        const op = sc.ops[i];
        const at = `${id}:${op.src}`;
        if (op.op === "line") {
          count++;
          want(op.text, at);
          for (const t of op.levels ?? []) want(t, at);
        } else if (op.op === "card") {
          want(op.title, at);
          want(op.sub, at);
        } else if (op.op === "news") want(op.text, at);
        else if (op.op === "task") want(op.text, at);
        else if (op.op === "boost") want(op.why, at);
        else if (op.op === "item" && op.delta > 0) {
          want(ch.items[op.key].name, at);
          want(ch.items[op.key].about, at);
        } else if (op.op === "choose") {
          want(op.prompt, at);
          for (const o of op.options) {
            want(o.label, at);
            for (const m of o.check?.mods ?? []) want(m.why, at);
          }
        } else if (op.op === "investigate") {
          want(op.title, at);
          want(op.leave, at);
          for (const s of op.spots) want(s.label, at);
          for (const d of op.deductions) {
            want(d.label, at);
            for (const m of d.check?.mods ?? []) want(m.why, at);
          }
        }
      }
    }
    for (const it of Object.values(ch.items)) {
      want(it.name, "@item");
      want(it.about, "@item");
    }
    for (const c of ch.carry) want(c.text, "@carry");
    for (const c of ch.cast) want(c.name, "@cast");
    for (const s of ch.skills) want(s.about, "@skill");
    for (const a of ch.archetypes) want(a.about, "@archetype");
    expect(missing).toEqual([]);
    expect(count).toBeGreaterThan(500);
  });

  test("and everything random paths show the player", () => {
    const missing = new Set<string>();
    const builds = ch.archetypes.map(buildOf);
    for (let seed = 1; seed <= 60; seed++) {
      const pick = rng(seed);
      // r26: at every level of French, 0 to 3.
      const fr = seed % 4;
      const r = new StoryRun(
        ch,
        chapterStart(ch, undefined, {
          build: {
            ...builds[seed % builds.length],
            langPts: { fr, ru: Math.min(3, 4 - fr) },
          },
          seed,
        }),
      );
      const see = (t: string | undefined) => {
        if (t && !has(t)) missing.add(t);
      };
      for (let step = 0; step < 5000; step++) {
        const b = r.beat;
        for (const e of r.drain()) {
          // The pop-ups, as the player shows them.
          if (e.type === "rel") {
            see(
              e.delta >= 2
                ? `${e.name} trusts you more.`
                : e.delta > 0
                  ? `${e.name} warms to you.`
                  : e.delta <= -2
                    ? `${e.name} trusts you less.`
                    : `${e.name} cools.`,
            );
          } else if (e.type === "remember") {
            see(`${e.name} will remember that.`);
          } else if (e.type === "task") see(e.text);
          else if (e.type === "boost") see(e.why);
          else if (e.type === "item" && e.delta > 0) {
            see(ch.items[e.key]?.name);
          }
        }
        if (b.kind === "line") {
          see(b.text);
          see(b.lang?.original);
          if (b.who) see(exp.castName(b.who));
          if (b.voice) see(exp.skillName(b.voice.skill));
        } else if (b.kind === "card") {
          see(b.title);
          see(b.sub);
        } else if (b.kind === "choice") {
          see(b.prompt);
          for (const o of b.options) {
            see(o.label);
            for (const m of o.check?.mods ?? []) {
              if (!m.item) see(m.why);
            }
          }
        } else if (b.kind === "roll") see(b.label);
        else if (b.kind === "investigate") {
          see(b.title);
          for (const s of b.spots) see(s.label);
          for (const d of b.deductions) see(d.label);
        }
        if (b.kind === "end") break;
        if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
          r.advance();
        } else if (b.kind === "choice") {
          const open = b.options.filter(
            (o) => !o.check?.locked && o.needs?.met !== false,
          );
          r.choose(open[pick(open.length)].id);
        } else if (b.kind === "free") {
          const acts = freeActions(r, exp.opts.places);
          if (acts.length === 0) break;
          acts[pick(acts.length)]();
        } else {
          const unseen = b.spots.filter((s) => !s.seen);
          const ready = b.deductions.filter(
            (d) => d.ready && !d.done && !d.check?.locked,
          );
          if (unseen.length > 0) r.examine(unseen[pick(unseen.length)].id);
          else if (ready.length > 0) r.deduce(ready[0].id);
          else r.leave();
        }
      }
    }
    expect([...missing]).toEqual([]);
  }, 60_000);

  test("every flag in plain words, and no words for flags that are gone", () => {
    const flags = flagsOf(ch);
    expect(exp.unworded.size).toBe(0);
    expect([...flags].filter((f) => !(f in FLAG_WORDS[1])).sort()).toEqual([]);
    expect(
      Object.keys(FLAG_WORDS[1])
        .filter((f) => !flags.has(f))
        .sort(),
    ).toEqual([]);
    // As the owner would say them.
    expect(page).toContain(
      "If Anselme told him about his grandson's oak-leaf pin:",
    );
    expect(page).toContain("only if he has Le Vauban matches");
    expect(page).toContain("only if he doesn't have Le Vauban matches");
    expect(exp.cond({ k: "lang", code: "ru" })).toBe(
      "he has some Russian (1 or more)",
    );
    // r26: the language system's levels: none, poor, decent, perfect.
    const fr = (op: string, v: number) =>
      exp.cond({
        k: "cmp",
        op: op as ">=",
        a: { k: "lang", code: "fr" },
        b: { k: "num", v },
      });
    expect(fr(">=", 3)).toBe("his French is perfect (3)");
    expect(fr("<", 2)).toBe("his French is below decent (under 2)");
    expect(fr("<", 1)).toBe("he has no French");
    expect(fr("==", 1)).toBe("his French is poor (1)");
    expect(
      exp.cond({
        k: "cmp",
        op: ">=",
        a: { k: "lang", code: "ru" },
        b: { k: "num", v: 2 },
      }),
    ).toBe("his Russian is decent or better (2 or more)");
    expect(exp.neg({ k: "has", item: "umbrella" })).toBe(
      "he doesn't have the black umbrella",
    );
  });

  test("a reference on every row, each one of a kind, and every link lands", () => {
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const rows = html.match(/<div class="row /g) ?? [];
    const refs = html.match(/<a class="ref" href="#[^"]+">[^<]+<\/a>/g) ?? [];
    expect(refs.length).toBe(rows.length);
    const known = new Set(ids);
    const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(links.filter((l) => !known.has(l))).toEqual([]);
    // Scene 1's first lines, as the owner would write a note against them.
    expect(ids).toEqual(expect.arrayContaining(["S1", "S1.1", "S1.10"]));
    expect(html).toContain('id="S1.7"');
    // Where a way goes on is said once, not again by the choice around it.
    expect(html).not.toMatch(
      /<div class="resume">[^<]*<a[^>]*>[^<]*<\/a><\/div>(?:<\/div>)+<div class="resume">/,
    );
  });

  test("scenes are grouped by where they happen, in story order", () => {
    const g = (id: string) => exp.info.get(id)!.group;
    expect(g("open")).toBe("street");
    expect(g("posters")).toBe("street");
    expect(g("watcher")).toBe("street");
    expect(g("clerk_first")).toBe("vauban:lobby");
    expect(g("key_board")).toBe("vauban:lobby");
    expect(g("clerk_ask")).toBe("vauban:lobby");
    expect(g("order")).toBe("vauban:bar");
    expect(g("read_stranger")).toBe("vauban:bar");
    expect(g("matches")).toBe("vauban:bar");
    expect(g("use_phone")).toBe("anywhere");
    expect(g("idea_vidal")).toBe("anywhere");
    expect(g("room")).toBe("room");
    expect(g("epilogue")).toBe("elysee");
    const heads = [
      ...html.matchAll(/<section class="group" id="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(heads).toEqual([
      "before",
      "g-street",
      "g-vauban-lobby",
      "g-vauban-bar",
      "g-anywhere",
      "g-room",
      "g-elysee",
      "after",
      "places",
    ]);
    // Within a group, the order they're written in.
    const bar = [...html.matchAll(/<details class="scene" id="S(\d+)"/g)].map(
      (m) => Number(m[1]),
    );
    const inBar = bar.filter(
      (n) => exp.info.get(ch.order[n - 1])!.group === "vauban:bar",
    );
    expect(inBar).toEqual([...inBar].sort((x, y) => x - y));
  });

  test("the pop-ups name people as he knows them then", () => {
    const sceneText = (id: string) => {
      const n = exp.info.get(id)!.n;
      const m = new RegExp(
        `<details class="scene" id="S${n}"[\\s\\S]*?</details>`,
      ).exec(html);
      return textOf(m![0]);
    };
    expect(sceneText("order")).toContain("The barman warms to you.");
    expect(sceneText("talk")).toContain("The man in grey warms to you.");
    expect(sceneText("contact")).toContain(
      "The woman in the corner warms to you.",
    );
    expect(sceneText("vienna")).toContain("Penhallow warms to you.");
    expect(sceneText("vienna")).not.toContain("The woman in the corner");
    expect(sceneText("anselme_after")).toContain("Anselme warms to you.");
  });

  test("it's one page with nothing to fetch, and never where the site serves from", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(notHere(path.join(ROOT, "static/script.html"))).not.toBeNull();
    expect(notHere(path.join(ROOT, "src/based/script.html"))).not.toBeNull();
    expect(notHere("/tmp/mr-based-script.html")).toBeNull();
    // And it isn't in any bundle: nothing the site builds imports it.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|js|mjs)$/.test(e.name)) {
          if (fs.readFileSync(p, "utf8").includes("based-script")) hits.push(p);
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(hits).toEqual([]);
  });

  test("a new export from the same script is the same page", () => {
    expect(scriptHtml(1, { made: "test" }).html).toBe(html);
    expect(new ScriptExport(ch, exp.opts).html()).toBe(html);
  });
});
