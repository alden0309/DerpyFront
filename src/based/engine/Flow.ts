// The shape of a chapter for its end-of-chapter flowchart: the scenes in the
// order they're written, the choices in each, and where they lead.

import { Chapter, END, Op } from "./Types";

export interface FlowOption {
  id: string;
  label: string;
  /** r21: a skill check, as "Composure" and its difficulty. */
  check?: { skill: string; diff: number; kind: "white" | "red" };
  /** Scenes this option can lead to before the scene's own flow resumes. */
  leads: string[];
}

export interface FlowChoice {
  id: string;
  prompt: string;
  options: FlowOption[];
}

export interface FlowLook {
  id: string;
  title: string;
  spots: number;
  deductions: { id: string; label: string }[];
}

export interface FlowScene {
  id: string;
  label: string;
  checkpoint?: string;
  choices: FlowChoice[];
  looks: FlowLook[];
  /** Scenes this one can go on to. */
  next: string[];
  ends: boolean;
}

function gotosFrom(ops: Op[], from: number, stopAt: number): string[] {
  const out = new Set<string>();
  const seen = new Set<number>();
  const todo = [from];
  while (todo.length > 0) {
    const at = todo.pop()!;
    if (seen.has(at) || at < 0 || at >= ops.length || at === stopAt) continue;
    seen.add(at);
    const op = ops[at];
    if (op.op === "goto") {
      out.add(op.scene);
      continue;
    }
    if (op.op === "return" || op.op === "fall") continue;
    if (op.op === "if") todo.push(at + 1, op.else);
    else if (op.op === "check") todo.push(at + 1, op.fail);
    else if (op.op === "jump") todo.push(op.to);
    else if (op.op === "choose") op.options.forEach((o) => todo.push(o.at));
    else if (op.op === "investigate") todo.push(op.after);
    else todo.push(at + 1);
  }
  return [...out];
}

export function flowOf(chapter: Chapter): FlowScene[] {
  return chapter.order.map((id) => {
    const scene = chapter.scenes[id];
    const choices: FlowChoice[] = [];
    const looks: FlowLook[] = [];
    scene.ops.forEach((op, at) => {
      if (op.op === "choose") {
        // Where the choice block ends: the first jump target past it.
        const after = scene.ops.findIndex(
          (o, i) => i > at && o.op === "jump" && o.to > at,
        );
        const end = after >= 0 ? (scene.ops[after] as { to: number }).to : -1;
        choices.push({
          id: op.id,
          prompt: op.prompt,
          options: op.options.map((o) => ({
            id: o.id,
            label: o.label,
            ...(o.check
              ? {
                  check: {
                    skill: o.check.skill,
                    diff: o.check.diff,
                    kind: o.check.kind,
                  },
                }
              : {}),
            leads: gotosFrom(scene.ops, o.at, end),
          })),
        });
      } else if (op.op === "investigate") {
        looks.push({
          id: op.id,
          title: op.title,
          spots: op.spots.length,
          deductions: op.deductions.map((d) => ({ id: d.id, label: d.label })),
        });
      }
    });
    const all = gotosFrom(scene.ops, 0, -1);
    return {
      id,
      label: scene.label,
      checkpoint: scene.checkpoint,
      choices,
      looks,
      next: all.filter((s) => s !== END),
      ends: all.includes(END),
    };
  });
}
