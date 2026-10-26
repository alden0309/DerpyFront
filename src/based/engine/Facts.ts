// r25: nothing he can't know. A chapter lists what he can only know once
// he's learned it (`@fact knows_oak "grandson"`): the flags that mean he
// knows it, and the words that give it away. A line in his own voice (the
// narration, his thoughts, what he says, a choice's prompt, its options and
// their reasons) that uses the words must come where he learns it (with the
// fact's `set` straight after it) or after a condition that makes sure of
// it: the scene's `@on ... if`, an `if` around it, an option's `if`, a flag
// set earlier on every way into it. Other people's lines are theirs: they
// can know what he doesn't.
//
// r26: and everything else the page shows him that comes from the script:
// the journal (`task`), what he's given (an item's name and what it says
// about itself), what changes his skills (`boost`), a title card, the
// thoughts in the column (`@on think "..."`), the scenes' titles (the one
// on screen while it plays, and the label over a thing he can look at,
// which shows whatever he knows), and what he carries on with (`@carry`).
//
// r26: and the names it gives people: who's speaking, the name under a
// portrait, and the pop-ups ("... warms to you."). A name can be a fact;
// until he knows it, the pop-ups call them by the body they are (`@cast ...
// body=`: the barman, say), and the script must give them their own name
// to speak or be pictured under only where he learns it, or after.
//
// The check follows each scene's ops, and the jumps between scenes, keeping
// what's certain on every way in (conditions as clauses: `a or b` is
// "a or b", which a fact of either flag accepts). Linear in the chapter's
// size, give or take a few passes for loops.

import { Chapter, Expr, Fact, Op, Scene } from "./Types";

/** What's certain at a point: clauses, each "at least one of these flags is set" ("a|b", sorted). */
export type Known = Set<string>;

const MAX_CLAUSES = 24;

/** The words of a fact as a pattern (whole words, any case). */
const patterns = new WeakMap<Fact, RegExp>();
function patternOf(f: Fact): RegExp {
  let re = patterns.get(f);
  if (!re) {
    const alts = f.words.map((w) =>
      w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    re = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`,
      "iu",
    );
    patterns.set(f, re);
  }
  return re;
}

/** The facts a piece of text gives away. */
export function factsIn(chapter: Chapter, text: string): Fact[] {
  return (chapter.facts ?? []).filter((f) => patternOf(f).test(text));
}

/** Whether the flags (as a run has them) mean he knows it. */
export function knowsFact(f: Fact, flags: Record<string, number>): boolean {
  return f.flags.some((x) => (flags[x] ?? 0) !== 0);
}

/** The name someone goes by, given what he knows of facts. */
function nameBy(
  chapter: Chapter,
  who: string,
  knows: (f: Fact) => boolean,
): string {
  let id = who;
  const seen = new Set<string>([id]);
  for (;;) {
    const c = chapter.cast.find((x) => x.id === id);
    if (!c) return id;
    if (factsIn(chapter, c.name).every(knows) || !c.body || seen.has(c.body)) {
      return c.name;
    }
    id = c.body;
    seen.add(id);
  }
}

/**
 * r26: what the page calls someone now: their name once he knows it, and
 * before that the name of the body they are (the barman, until he's learned
 * the barman's own name). The pop-ups use it.
 */
export function knownName(
  chapter: Chapter,
  who: string,
  flags: Record<string, number>,
): string {
  return nameBy(chapter, who, (f) => knowsFact(f, flags));
}

/** The same, from what's certain at a point in the script (the validator). */
export function knownNameAt(chapter: Chapter, who: string, k: Known): string {
  return nameBy(chapter, who, (f) => satisfied(f, k));
}

/** One person in the story so far: their body, and what the page calls them. */
export interface PersonKnown {
  body: string;
  /** The cast ids that are this person (the body first). */
  ids: string[];
  /** As he knows them now (knownName). */
  name: string;
  /** What they were before he learned the name ("the barman"), if it differs. */
  first?: string;
}

/**
 * r26: the people he's met (anyone who has spoken to him: `met`), one entry
 * per person however many names they go by, each called by the name he
 * knows them by now. The dossier lists them.
 */
export function peopleKnown(
  chapter: Chapter,
  met: Record<string, number>,
  flags: Record<string, number>,
): PersonKnown[] {
  const hero = chapter.cast[0]?.id;
  const groups = new Map<string, string[]>();
  for (const c of chapter.cast) {
    if (c.id === hero) continue;
    const body = c.body ?? c.id;
    groups.set(body, [...(groups.get(body) ?? []), c.id]);
  }
  const out: PersonKnown[] = [];
  for (const [body, ids] of groups) {
    if (!ids.some((id) => met[id] !== undefined)) continue;
    // The latest name they've spoken under, else the body's own.
    const named = ids.find((id) => id !== body && met[id] !== undefined);
    const name = knownName(chapter, named ?? body, flags);
    const bodyName = chapter.cast.find((c) => c.id === body)?.name ?? body;
    out.push({
      body,
      ids: [body, ...ids.filter((id) => id !== body)],
      name,
      first: name !== bodyName ? bodyName : undefined,
    });
  }
  return out;
}

/** The clauses a condition makes certain when it holds. */
export function clausesOf(e: Expr | undefined): string[][] {
  if (!e) return [];
  switch (e.k) {
    case "flag":
      return [[e.name]];
    case "cmp": {
      // flag >= 1, flag > 0, flag == 2, flag != 0
      if (e.a.k === "flag" && e.b.k === "num") {
        const v = e.b.v;
        const set =
          (e.op === ">=" && v >= 1) ||
          (e.op === ">" && v >= 0) ||
          (e.op === "==" && v !== 0) ||
          (e.op === "!=" && v === 0);
        return set ? [[e.a.name]] : [];
      }
      return [];
    }
    case "and":
      return [...clausesOf(e.a), ...clausesOf(e.b)].slice(0, MAX_CLAUSES);
    case "or": {
      const a = clausesOf(e.a);
      const b = clausesOf(e.b);
      const out: string[][] = [];
      for (const x of a) {
        for (const y of b) {
          if (out.length < MAX_CLAUSES) out.push([...new Set([...x, ...y])]);
        }
      }
      return out;
    }
    default:
      return [];
  }
}

const key = (c: string[]) => [...c].sort().join("|");

function withClauses(k: Known, cs: string[][]): Known {
  if (cs.length === 0) return k;
  const out = new Set(k);
  for (const c of cs) out.add(key(c));
  return out;
}

/** Whether what's certain at a point means he knows it. */
export function satisfied(f: Fact, k: Known): boolean {
  for (const c of k) {
    if (c.split("|").every((x) => f.flags.includes(x))) return true;
  }
  return false;
}

function meet(a: Known | undefined, b: Known): Known {
  if (a === undefined) return new Set(b);
  const out = new Set<string>();
  for (const c of a) if (b.has(c)) out.add(c);
  return out;
}

const same = (a: Known, b: Known) =>
  a.size === b.size && [...a].every((c) => b.has(c));

/** The ops that follow an op in a scene (where its flow can go next). */
function successors(scene: Scene, at: number): number[] {
  const op = scene.ops[at];
  switch (op.op) {
    case "if":
      return [at + 1, op.else];
    case "jump":
      return [op.to];
    case "goto":
    case "return":
    case "fall":
      return [];
    case "choose":
      return op.options.map((o) => o.at);
    case "investigate":
      return [op.after];
    case "check":
      return [at + 1, op.fail];
    default:
      return [at + 1];
  }
}

/**
 * Flags `set` after a line before the story stops to ask anything (the rest
 * of its run of lines, and an `if heard` straight after): it's where he
 * learns them.
 */
function learnedAt(scene: Scene, at: number): string[] {
  const out: string[] = [];
  for (let i = at + 1; i < scene.ops.length; i++) {
    const op = scene.ops[i];
    if (op.op === "set" && op.value !== 0) out.push(op.flag);
    else if (
      op.op === "choose" ||
      op.op === "goto" ||
      op.op === "check" ||
      op.op === "investigate" ||
      op.op === "card" ||
      op.op === "return" ||
      op.op === "fall"
    ) {
      break;
    }
  }
  return out;
}

export interface FactProblem {
  scene: string;
  line: number;
  message: string;
}

/**
 * What's certain at each op of each scene, on every way to it (scene id ->
 * op index -> clauses). Scenes nothing can reach aren't in it.
 */
export function factFlow(chapter: Chapter): Map<string, Map<number, Known>> {
  const order = chapter.order;
  // What's certain on the way into each scene: the start knows nothing, a
  // scene the open world starts knows its trigger's condition, and a scene
  // jumped to knows what every jump into it knows.
  const entry = new Map<string, Known>();
  const seed = (id: string, k: Known) => entry.set(id, meet(entry.get(id), k));
  if (chapter.start) seed(chapter.start, new Set());
  for (const id of order) {
    const t = chapter.scenes[id].trigger;
    if (t) seed(id, withClauses(new Set(), clausesOf(t.cond)));
  }

  const flow = (scene: Scene, start: Known) => {
    const at = new Map<number, Known>();
    const todo: number[] = [0];
    at.set(0, start);
    const jumps: { to: string; k: Known }[] = [];
    while (todo.length > 0) {
      const i = todo.pop()!;
      const k = at.get(i)!;
      const op = scene.ops[i];
      if (!op) continue;
      const push = (j: number, kj: Known) => {
        if (j < 0 || j >= scene.ops.length) return;
        const was = at.get(j);
        const now = meet(was, kj);
        if (was === undefined || !same(was, now)) {
          at.set(j, now);
          todo.push(j);
        }
      };
      switch (op.op) {
        case "if":
          push(i + 1, withClauses(k, clausesOf(op.cond)));
          push(op.else, k);
          break;
        case "set":
          if (op.value !== 0 && !(op.add && op.value < 0)) {
            push(i + 1, withClauses(k, [[op.flag]]));
          } else {
            const out = new Set(
              [...k].filter((c) => !c.split("|").includes(op.flag)),
            );
            push(i + 1, out);
          }
          break;
        case "choose":
          for (const o of op.options)
            push(o.at, withClauses(k, clausesOf(o.cond)));
          break;
        case "investigate":
          for (const s of op.spots) push(s.at, withClauses(k, [[s.id]]));
          for (const d of op.deductions) {
            const kd = withClauses(k, [[d.id], ...d.needs.map((n) => [n])]);
            push(d.at, kd);
            if (d.failAt !== undefined) {
              push(
                d.failAt,
                withClauses(
                  k,
                  d.needs.map((n) => [n]),
                ),
              );
            }
          }
          push(op.after, k);
          break;
        case "goto":
          if (chapter.scenes[op.scene]) jumps.push({ to: op.scene, k });
          break;
        default:
          for (const j of successors(scene, i)) push(j, k);
      }
    }
    return { at, jumps };
  };

  // Round the scenes until what's certain on the way into each settles.
  const results = new Map<string, ReturnType<typeof flow>>();
  for (let pass = 0; pass < 50; pass++) {
    let changed = false;
    for (const id of order) {
      const k = entry.get(id);
      if (k === undefined) continue;
      const r = flow(chapter.scenes[id], k);
      results.set(id, r);
      for (const j of r.jumps) {
        const was = entry.get(j.to);
        const now = meet(was, j.k);
        if (was === undefined || !same(was, now)) {
          entry.set(j.to, now);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return new Map([...results].map(([id, r]) => [id, r.at]));
}

/**
 * Every line in his voice that gives away a fact he may not have learned,
 * and every name the page gives someone that does.
 * `hero` is the cast id whose lines are his.
 */
export function checkFacts(chapter: Chapter): FactProblem[] {
  const facts = chapter.facts ?? [];
  if (facts.length === 0) return [];
  const hero = chapter.cast[0]?.id;
  const order = chapter.order;
  const results = factFlow(chapter);
  const nameOf = (who: string) =>
    chapter.cast.find((c) => c.id === who)?.name ?? who;

  const out: FactProblem[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const at = results.get(id);
    if (!at) continue;
    const scene = chapter.scenes[id];
    const check = (
      text: string,
      k: Known,
      line: number,
      what: string,
      also: string[] = [],
    ) => {
      for (const f of factsIn(chapter, text)) {
        const kk = withClauses(
          k,
          also.map((x) => [x]),
        );
        if (satisfied(f, kk)) continue;
        const tag = `${id}:${line}:${f.src}`;
        if (seen.has(tag)) continue;
        seen.add(tag);
        out.push({
          scene: id,
          line,
          message: `${what} "${text.length > 70 ? `${text.slice(0, 67)}...` : text}" gives away what he learns with ${f.flags.join(" or ")} ("${f.words[0]}"), but nothing before it makes sure he knows it`,
        });
      }
    };
    scene.ops.forEach((op: Op, i) => {
      const k = at.get(i);
      if (k === undefined) return;
      if (op.op === "line") {
        const learned = learnedAt(scene, i);
        // r26: whoever speaks, the page names them: by a name he knows, or
        // the one they've just told him.
        if (op.kind === "say" && op.who) {
          check(nameOf(op.who), k, op.src, "the speaker's name", learned);
        }
        const his = op.kind !== "say" || op.who === hero;
        if (!his) return;
        check(op.text, k, op.src, "the line", learned);
        // r26: what he makes of words in another language, at any level.
        for (const t of op.levels ?? []) {
          if (t) check(t, k, op.src, "the line", learned);
        }
      } else if (op.op === "figure" && op.who) {
        check(
          nameOf(op.who),
          k,
          op.src,
          "the name under the portrait",
          learnedAt(scene, i),
        );
      } else if (op.op === "rel" || op.op === "remember") {
        // The pop-up names them as he knows them (knownName): a name that
        // gives a fact away needs a body= to be known by before.
        check(knownNameAt(chapter, op.who, k), k, op.src, "the pop-up's name");
      } else if (op.op === "choose") {
        if (op.prompt) check(op.prompt, k, op.src, "the choice");
        for (const o of op.options) {
          const ko = withClauses(k, clausesOf(o.cond));
          check(o.label, ko, op.src, "the option");
          for (const m of o.check?.mods ?? []) {
            check(
              m.why,
              withClauses(ko, clausesOf(m.cond)),
              op.src,
              "the reason",
            );
          }
        }
      } else if (op.op === "task") {
        if (op.text) check(op.text, k, op.src, "the journal");
      } else if (op.op === "item") {
        const it = chapter.items[op.key];
        if (it && op.delta > 0) {
          check(it.name, k, op.src, "the item");
          check(it.about, k, op.src, "the item");
        }
      } else if (op.op === "boost") {
        check(op.why, k, op.src, "the reason");
      } else if (op.op === "news" && op.text) {
        // The television's ticker: on the screen, so on the page (and,
        // r26, what he makes of it when he reads it).
        check(op.text, k, op.src, "the news", learnedAt(scene, i));
        for (const t of op.levels ?? []) {
          if (t) check(t, k, op.src, "the news", learnedAt(scene, i));
        }
      } else if (op.op === "card") {
        check(op.title, k, op.src, "the card");
        if (op.sub) check(op.sub, k, op.src, "the card");
      } else if (op.op === "investigate") {
        check(op.title, k, op.src, "the look");
        for (const s of op.spots) check(s.label, k, op.src, "the spot");
        for (const d of op.deductions) {
          const kd = withClauses(
            k,
            d.needs.map((n) => [n]),
          );
          check(d.label, kd, op.src, "the deduction");
          for (const m of d.check?.mods ?? []) {
            check(
              m.why,
              withClauses(kd, clausesOf(m.cond)),
              op.src,
              "the reason",
            );
          }
        }
      }
    });
  }

  // r26: what isn't in a scene's flow: its title, a thought's label, the
  // label over a thing (the first scene that looks at it names it, whatever
  // he knows), what he carries on with.
  const once = (
    scene: string,
    text: string,
    k: Known,
    line: number,
    what: string,
  ) => {
    for (const f of factsIn(chapter, text)) {
      if (satisfied(f, k)) continue;
      const tag = `${scene}:${line}:${f.src}:${what}:${text}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push({
        scene,
        line,
        message: `${what} "${text.length > 70 ? `${text.slice(0, 67)}...` : text}" gives away what he learns with ${f.flags.join(" or ")} ("${f.words[0]}"), but nothing makes sure he knows it`,
      });
    }
  };
  const named = new Set<string>();
  for (const id of order) {
    const sc = chapter.scenes[id];
    const t = sc.trigger;
    const kt = withClauses(new Set(), clausesOf(t?.cond));
    once(id, sc.label, kt, sc.src, "the scene's title");
    if (t?.on === "think" && t.label) {
      once(id, t.label, kt, sc.src, "the thought");
    }
    if (t?.on === "look" && t.target && !named.has(t.target)) {
      named.add(t.target);
      once(id, sc.label, new Set(), sc.src, "the label over it");
    }
  }
  // What he starts with is in his pockets before anything happens.
  for (const it of Object.values(chapter.items)) {
    if (it.start === undefined) continue;
    once("@item", it.name, new Set(), 0, "what he starts with");
    once("@item", it.about, new Set(), 0, "what he starts with");
  }
  for (const c of chapter.carry) {
    once(
      "@carry",
      c.text,
      withClauses(new Set(), clausesOf(c.cond)),
      0,
      "what he carries on with",
    );
  }
  return out;
}
