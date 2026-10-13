// Checks a compiled chapter the way an editor would before a read-through:
// every jump lands, no scene runs off its end, every flag that's read is set
// somewhere, every scene can be reached, and the chapter can be finished.
// Run by the tests and by the server when it loads a chapter.

import { exprReads } from "./Expr";
import { Chapter, END, Expr, Op, Scene } from "./Types";

export interface Problem {
  scene?: string;
  line: number;
  message: string;
  /** Warnings don't fail the tests; errors do. */
  level: "error" | "warning";
}

export interface ValidateOptions {
  /** Art keys that exist (backdrops and portraits). */
  art?: Set<string>;
  /** Sound keys that exist. */
  sounds?: Set<string>;
}

/** Ops reachable from `from` inside one scene, stopping at gotos/returns. */
function walk(
  scene: Scene,
  from: number,
  visit: (op: Op, at: number) => void,
): void {
  const seen = new Set<number>();
  const todo = [from];
  while (todo.length > 0) {
    const at = todo.pop()!;
    if (seen.has(at) || at < 0 || at >= scene.ops.length) continue;
    seen.add(at);
    const op = scene.ops[at];
    visit(op, at);
    switch (op.op) {
      case "if":
        todo.push(at + 1, op.else);
        break;
      case "jump":
        todo.push(op.to);
        break;
      case "goto":
      case "return":
      case "fall":
        break;
      case "choose":
        for (const o of op.options) todo.push(o.at);
        break;
      case "investigate":
        todo.push(op.after);
        break;
      default:
        todo.push(at + 1);
    }
  }
}

export function validateChapter(
  chapter: Chapter,
  opts: ValidateOptions = {},
): Problem[] {
  const out: Problem[] = [];
  const add = (
    level: Problem["level"],
    scene: string | undefined,
    line: number,
    message: string,
  ) => out.push({ level, scene, line, message });

  const cast = new Set(chapter.cast.map((c) => c.id));
  const flagsSet = new Set<string>();
  /** Flags set with set/add (spots and deductions set their own). */
  const written = new Set<string>();
  const reads: { flag: string; scene: string; line: number }[] = [];
  const readExpr = (e: Expr | undefined, scene: string, line: number) => {
    if (!e) return;
    const r = exprReads(e, { flags: [], rels: [] });
    for (const f of r.flags) reads.push({ flag: f, scene, line });
    for (const w of r.rels) {
      if (!cast.has(w)) add("error", scene, line, `rel.${w}: not in the cast`);
    }
  };

  for (const c of chapter.cast) {
    if (c.portrait && opts.art && !opts.art.has(c.portrait)) {
      add(
        "error",
        undefined,
        1,
        `${c.id}'s portrait "${c.portrait}" isn't in the art folder`,
      );
    }
  }

  const edges = new Map<string, Set<string>>();
  let ends = false;

  for (const id of chapter.order) {
    const scene = chapter.scenes[id];
    const targets = new Set<string>();
    edges.set(id, targets);

    // Every op, for flags set and things referenced.
    scene.ops.forEach((op) => {
      switch (op.op) {
        case "set":
          flagsSet.add(op.flag);
          written.add(op.flag);
          break;
        case "if":
          readExpr(op.cond, id, op.src);
          break;
        case "backdrop":
          if (op.key && opts.art && !opts.art.has(op.key)) {
            add(
              "error",
              id,
              op.src,
              `@backdrop ${op.key}: no such picture in the art folder`,
            );
          }
          break;
        case "ambient":
          if (op.key && opts.sounds && !opts.sounds.has(op.key)) {
            add("error", id, op.src, `@ambient ${op.key}: no such sound`);
          }
          break;
        case "figure":
          if (op.who) {
            const who = chapter.cast.find((c) => c.id === op.who);
            if (who && !who.portrait) {
              add(
                "error",
                id,
                op.src,
                `@figure ${op.who}: they have no portrait=`,
              );
            }
          }
          break;
        case "choose": {
          for (const o of op.options) readExpr(o.cond, id, op.src);
          const always = op.options.filter((o) => !o.cond && !o.once);
          if (always.length === 0) {
            add(
              "error",
              id,
              op.src,
              `choice "${op.prompt || op.id}" could run out of options: give it one with no "if" or "once"`,
            );
          }
          if (
            op.timer > 0 &&
            !op.options.some((o) => o.silent && !o.cond && !o.once)
          ) {
            add(
              "warning",
              id,
              op.src,
              `timed choice "${op.prompt || op.id}" has no silent option; the clock picks the first`,
            );
          }
          break;
        }
        case "investigate": {
          const ids = new Set<string>();
          for (const s of op.spots) {
            flagsSet.add(s.id);
            ids.add(s.id);
          }
          for (const d of op.deductions) {
            flagsSet.add(d.id);
            ids.add(d.id);
          }
          for (const d of op.deductions) {
            for (const need of d.needs) {
              reads.push({ flag: need, scene: id, line: op.src });
              if (!ids.has(need)) {
                add(
                  "error",
                  id,
                  op.src,
                  `deduce ${d.id} needs "${need}", which isn't a spot or deduction here`,
                );
              }
            }
            if (d.needs.length === 0) {
              add(
                "warning",
                id,
                op.src,
                `deduce ${d.id} needs nothing; it's ready at once`,
              );
            }
          }
          if (op.min > op.spots.length) {
            add(
              "error",
              id,
              op.src,
              `min=${op.min}, but there are only ${op.spots.length} spots`,
            );
          }
          // Spot and deduction texts must come back to the room.
          for (const body of [...op.spots, ...op.deductions]) {
            walk(scene, body.at, (inner) => {
              if (inner.op === "goto") {
                add(
                  "error",
                  id,
                  inner.src,
                  `"-> ${inner.scene}" inside ${body.id}: a spot's text can't leave the room`,
                );
              } else if (inner.op === "investigate") {
                add(
                  "error",
                  id,
                  inner.src,
                  `an investigation inside ${body.id}`,
                );
              } else if (inner.op === "fall") {
                add(
                  "error",
                  id,
                  inner.src,
                  `${body.id}'s text never comes back`,
                );
              }
            });
          }
          break;
        }
        default:
          break;
      }
    });

    // What the scene's own flow reaches.
    walk(scene, 0, (op) => {
      if (op.op === "goto") {
        if (op.scene === END) ends = true;
        else if (!chapter.scenes[op.scene]) {
          add("error", id, op.src, `"-> ${op.scene}": there's no such scene`);
        } else targets.add(op.scene);
      } else if (op.op === "fall") {
        add(
          "error",
          id,
          scene.src,
          `scene "${id}" can run off its end: finish every path with "-> scene" or "-> END"`,
        );
      } else if (op.op === "return") {
        add(
          "error",
          id,
          op.src,
          `the story walks into a spot's text without examining it`,
        );
      }
    });
  }

  for (const c of chapter.carry) readExpr(c.cond, "", 1);

  for (const r of reads) {
    if (!flagsSet.has(r.flag)) {
      add(
        "error",
        r.scene || undefined,
        r.line,
        `flag "${r.flag}" is read but never set`,
      );
    }
  }
  const readSet = new Set(reads.map((r) => r.flag));
  for (const f of written) {
    if (!readSet.has(f)) {
      add(
        "warning",
        undefined,
        1,
        `flag "${f}" is set but never read (fine if a later chapter reads it)`,
      );
    }
  }

  // Reachability from the start.
  const reached = new Set<string>();
  const todo = chapter.start ? [chapter.start] : [];
  while (todo.length > 0) {
    const id = todo.pop()!;
    if (reached.has(id) || !chapter.scenes[id]) continue;
    reached.add(id);
    for (const t of edges.get(id) ?? []) todo.push(t);
  }
  for (const id of chapter.order) {
    if (!reached.has(id)) {
      add(
        "error",
        id,
        chapter.scenes[id].src,
        `scene "${id}" can't be reached from "${chapter.start}"`,
      );
    }
  }
  if (!ends) add("error", undefined, 1, `nothing ever reaches "-> END"`);

  // A scene from which END can't be reached is a trap.
  const reachesEnd = new Set<string>();
  let grew = true;
  const endsHere = (id: string) => {
    let found = false;
    walk(chapter.scenes[id], 0, (op) => {
      if (op.op === "goto" && op.scene === END) found = true;
    });
    return found;
  };
  for (const id of chapter.order) if (endsHere(id)) reachesEnd.add(id);
  while (grew) {
    grew = false;
    for (const id of chapter.order) {
      if (reachesEnd.has(id)) continue;
      if ([...(edges.get(id) ?? [])].some((t) => reachesEnd.has(t))) {
        reachesEnd.add(id);
        grew = true;
      }
    }
  }
  for (const id of reached) {
    if (!reachesEnd.has(id)) {
      add(
        "error",
        id,
        chapter.scenes[id].src,
        `from "${id}" the chapter can never end`,
      );
    }
  }

  return out;
}

export function errorsOf(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.level === "error");
}

export function formatProblem(p: Problem): string {
  return `${p.level} line ${p.line}${p.scene ? ` (${p.scene})` : ""}: ${p.message}`;
}
