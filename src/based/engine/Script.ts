// Reads a Mr. Based chapter script (the format is in src/based/README.md)
// and compiles each scene into a flat list of ops the runtime steps through.
// Blocks (if, choose, investigate) close with `end`; indentation is only for
// the writer's eyes.

import { parseExpr } from "./Expr";
import {
  CastMember,
  Chapter,
  ChoiceOption,
  END,
  Expr,
  Op,
  Scene,
  ScriptError,
} from "./Types";

type Frame =
  | { kind: "if"; pending: number; ends: number[]; src: number }
  | {
      kind: "choose";
      at: number;
      open: boolean;
      ends: number[];
      src: number;
    }
  | { kind: "investigate"; at: number; open: boolean; src: number };

const SCENE_ID = /^[a-z][a-z0-9_]*$/;
const CAST_ID = /^[A-Z][A-Z0-9_]*$/;
const FLAG = /^[a-z_][a-z0-9_]*$/;

/** Splits `"a b" c=d "e"` into words, keeping quoted strings whole. */
function words(s: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2]);
  }
  return out;
}

/** `key=value` pairs among the words, the rest in order. */
function split(ws: string[]): { pos: string[]; kv: Record<string, string> } {
  const pos: string[] = [];
  const kv: Record<string, string> = {};
  for (const w of ws) {
    const m = /^([a-z]+)=(.*)$/.exec(w);
    if (m) kv[m[1]] = m[2];
    else pos.push(w);
  }
  return { pos, kv };
}

/** Like split(), but quoted values after `key=` survive: leave="Move on". */
function argsOf(rest: string): { pos: string[]; kv: Record<string, string> } {
  const kv: Record<string, string> = {};
  const stripped = rest.replace(
    /\b([a-z]+)="((?:[^"\\]|\\.)*)"/g,
    (_m, k: string, v: string) => {
      kv[k] = v.replace(/\\"/g, '"');
      return "";
    },
  );
  const s = split(words(stripped));
  return { pos: s.pos, kv: { ...s.kv, ...kv } };
}

export function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "option"
  );
}

export interface ParseResult {
  chapter: Chapter;
  errors: ScriptError[];
}

export function parseChapter(text: string): ParseResult {
  const errors: ScriptError[] = [];
  const chapter: Chapter = {
    n: 0,
    title: "",
    summary: "",
    start: "",
    cast: [],
    scenes: {},
    order: [],
    carry: [],
  };
  const castIds = new Set<string>();
  let scene: Scene | null = null;
  let stack: Frame[] = [];
  let chooseCount = 0;
  let lookCount = 0;
  let beats = 0;

  const err = (line: number, message: string) => errors.push({ line, message });
  const emit = (op: Op): number => {
    scene!.ops.push(op);
    return scene!.ops.length - 1;
  };
  const cond = (src: string, line: number): Expr | undefined => {
    try {
      return parseExpr(src);
    } catch (e) {
      err(line, `condition "${src}": ${(e as Error).message}`);
      return undefined;
    }
  };
  const top = () => stack[stack.length - 1];

  const closeScene = (line: number) => {
    if (scene === null) return;
    for (const f of stack.reverse()) {
      err(f.src, `this ${f.kind} is never closed with "end"`);
    }
    stack = [];
    emit({ op: "fall", src: line });
    scene = null;
  };

  const closeOption = (f: Frame & { kind: "choose" }, line: number) => {
    if (f.open) f.ends.push(emit({ op: "jump", to: -1, src: line }));
    f.open = false;
  };
  const closeBody = (f: Frame & { kind: "investigate" }, line: number) => {
    if (f.open) emit({ op: "return", src: line });
    f.open = false;
  };

  const lines = text.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const n = idx + 1;
    const raw = lines[idx];
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;

    // A new scene.
    if (line.startsWith("==")) {
      closeScene(n);
      const ws = words(line.slice(2).trim());
      const id = ws[0] ?? "";
      if (!SCENE_ID.test(id)) {
        err(n, `scene ids are lower_case: "${id}"`);
        continue;
      }
      if (chapter.scenes[id]) err(n, `there are two scenes called "${id}"`);
      scene = { id, label: ws[1] ?? id, ops: [], src: n };
      chapter.scenes[id] = scene;
      chapter.order.push(id);
      chooseCount = 0;
      lookCount = 0;
      beats = 0;
      continue;
    }

    // The chapter's header, before the first scene.
    if (scene === null) {
      const ws = words(line);
      const { pos, kv } = split(ws.slice(1));
      switch (ws[0]) {
        case "@chapter":
          chapter.n = Number(pos[0]);
          chapter.title = pos[1] ?? "";
          if (!Number.isInteger(chapter.n) || chapter.n < 1) {
            err(n, "@chapter needs a number and a title");
          }
          break;
        case "@summary":
          chapter.summary = pos[0] ?? "";
          break;
        case "@start":
          chapter.start = pos[0] ?? "";
          break;
        case "@cast": {
          const id = pos[0] ?? "";
          if (!CAST_ID.test(id)) {
            err(n, `cast ids are UPPER_CASE: "${id}"`);
            break;
          }
          const member: CastMember = { id, name: pos[1] ?? id };
          if (kv.portrait) member.portrait = kv.portrait;
          chapter.cast.push(member);
          castIds.add(id);
          break;
        }
        case "@carry": {
          const m = /^@carry\s+"((?:[^"\\]|\\.)*)"(?:\s+if\s+(.+))?$/.exec(
            line,
          );
          if (!m) {
            err(n, '@carry "text" [if condition]');
            break;
          }
          chapter.carry.push({
            text: m[1],
            cond: m[2] ? cond(m[2], n) : undefined,
          });
          break;
        }
        default:
          err(
            n,
            `before the first scene, only @chapter, @summary, @start, @cast and @carry: "${line}"`,
          );
      }
      continue;
    }

    // Inside a scene.
    const f = top();
    const first = line.split(/\s+/, 1)[0];
    const rest = line.slice(first.length).trim();

    if (line.startsWith("->")) {
      const target = line.slice(2).trim();
      if (target !== END && !SCENE_ID.test(target)) {
        err(n, `"-> ${target}": jump to a scene id or END`);
      }
      emit({ op: "goto", scene: target, src: n });
      continue;
    }

    if (line.startsWith("*")) {
      if (f?.kind !== "choose") {
        err(n, `an option ("*") outside a choose block`);
        continue;
      }
      const m =
        /^\*\s*(.*?)\[([^\]]+)\]\s*(?:\{([a-z0-9-]+)\})?\s*(?:"((?:[^"\\]|\\.)*)")?\s*(?:->\s*(\S+))?\s*$/.exec(
          line,
        );
      if (!m) {
        err(
          n,
          `an option is: * [Label] "What he says" -> scene  (the line and the jump are optional)`,
        );
        continue;
      }
      closeOption(f, n);
      const mods = m[1].trim();
      const op = scene.ops[f.at] as Extract<Op, { op: "choose" }>;
      const label = m[2].trim();
      const opt: ChoiceOption = {
        id: m[3] ?? slug(label),
        label,
        once: false,
        silent: false,
        at: scene.ops.length,
      };
      const mm = /^((?:(?:once|silent)\s+)*)(?:if\s+(.+))?$/.exec(
        mods ? `${mods} ` : "",
      );
      if (!mm) {
        err(
          n,
          `before the label: once, silent, then "if condition": "${mods}"`,
        );
      } else {
        opt.once = /\bonce\b/.test(mm[1]);
        opt.silent = /\bsilent\b/.test(mm[1]);
        if (mm[2]) opt.cond = cond(mm[2].trim(), n);
      }
      if (op.options.some((o) => o.id === opt.id)) {
        err(n, `two options in this choice have the id "${opt.id}"`);
      }
      op.options.push(opt);
      f.open = true;
      if (m[4]) {
        // The line he says when he picks it, in the protagonist's voice.
        const hero = chapter.cast[0]?.id;
        if (hero === undefined) err(n, "a spoken option needs a @cast");
        emit({
          op: "line",
          kind: "say",
          who: hero,
          text: m[4].replace(/\\"/g, '"'),
          src: n,
        });
      }
      if (m[5]) {
        emit({ op: "goto", scene: m[5], src: n });
        f.open = false;
      }
      continue;
    }

    switch (first) {
      case "@backdrop":
      case "@ambient": {
        const key = rest === "none" ? null : rest;
        if (key !== null && !/^[a-z0-9_]+$/.test(key)) {
          err(n, `${first} takes an art key or none: "${rest}"`);
        }
        emit(
          first === "@backdrop"
            ? { op: "backdrop", key, src: n }
            : { op: "ambient", key, src: n },
        );
        continue;
      }
      case "@figure": {
        const who = rest === "none" ? null : rest;
        if (who !== null && !castIds.has(who)) {
          err(n, `@figure: "${rest}" isn't in the cast`);
        }
        emit({ op: "figure", who, src: n });
        continue;
      }
      case "@checkpoint": {
        const ws = words(rest);
        if (stack.length > 0 || beats > 0) {
          err(n, "@checkpoint goes at the top of a scene");
        }
        scene.checkpoint = ws[0] ?? scene.label;
        continue;
      }
      case "@card": {
        const ws = words(rest);
        if (!ws[0]) err(n, '@card "Title" ["Subtitle"]');
        emit({ op: "card", title: ws[0] ?? "", sub: ws[1], src: n });
        beats++;
        continue;
      }
      case "@news": {
        const ws = words(rest);
        emit({
          op: "news",
          text: rest === "none" ? null : (ws[0] ?? ""),
          src: n,
        });
        continue;
      }
      case "set":
      case "add":
      case "unset": {
        const m =
          first === "add"
            ? /^([a-z_][a-z0-9_]*)\s+(-?\d+)$/.exec(rest)
            : first === "set"
              ? /^([a-z_][a-z0-9_]*)(?:\s*=\s*(-?\d+))?$/.exec(rest)
              : /^([a-z_][a-z0-9_]*)$/.exec(rest);
        if (!m) {
          err(
            n,
            `"${first}" takes a lower_case flag${first === "add" ? " and a number" : ""}`,
          );
          continue;
        }
        if (first === "unset") {
          emit({ op: "set", flag: m[1], value: 0, add: false, src: n });
        } else if (first === "add") {
          emit({
            op: "set",
            flag: m[1],
            value: Number(m[2]),
            add: true,
            src: n,
          });
        } else {
          emit({
            op: "set",
            flag: m[1],
            value: m[2] !== undefined ? Number(m[2]) : 1,
            add: false,
            src: n,
          });
        }
        continue;
      }
      case "rel": {
        const m = /^([A-Z][A-Z0-9_]*)\s+([+-]\d+)$/.exec(rest);
        if (!m) {
          err(n, `rel WHO +1 (or -1)`);
          continue;
        }
        if (!castIds.has(m[1])) err(n, `rel: "${m[1]}" isn't in the cast`);
        emit({ op: "rel", who: m[1], delta: Number(m[2]), src: n });
        continue;
      }
      case "remember": {
        if (!castIds.has(rest)) err(n, `remember: "${rest}" isn't in the cast`);
        emit({ op: "remember", who: rest, src: n });
        continue;
      }
      case "if": {
        const c = cond(rest, n);
        const at = emit({
          op: "if",
          cond: c ?? { k: "num", v: 0 },
          else: -1,
          src: n,
        });
        stack.push({ kind: "if", pending: at, ends: [], src: n });
        continue;
      }
      case "elif":
      case "else": {
        if (f?.kind !== "if") {
          err(n, `"${first}" without an "if"`);
          continue;
        }
        if (f.pending < 0) {
          err(n, `"${first}" after "else"`);
          continue;
        }
        f.ends.push(emit({ op: "jump", to: -1, src: n }));
        (scene.ops[f.pending] as Extract<Op, { op: "if" }>).else =
          scene.ops.length;
        if (first === "elif") {
          const c = cond(rest, n);
          f.pending = emit({
            op: "if",
            cond: c ?? { k: "num", v: 0 },
            else: -1,
            src: n,
          });
        } else {
          f.pending = -1;
        }
        continue;
      }
      case "choose": {
        const { pos, kv } = argsOf(rest);
        chooseCount++;
        const timer = kv.timer !== undefined ? Number(kv.timer) : 0;
        if (!(timer >= 0)) err(n, "timer= takes seconds");
        const at = emit({
          op: "choose",
          id: kv.id ?? `${scene.id}#${chooseCount}`,
          prompt: pos[0] ?? "",
          timer,
          options: [],
          src: n,
        });
        stack.push({ kind: "choose", at, open: false, ends: [], src: n });
        beats++;
        continue;
      }
      case "investigate": {
        const { pos, kv } = argsOf(rest);
        lookCount++;
        const at = emit({
          op: "investigate",
          id: kv.id ?? `${scene.id}@${lookCount}`,
          title: pos[0] ?? "",
          min: kv.min !== undefined ? Number(kv.min) : 1,
          spots: [],
          deductions: [],
          leave: kv.leave ?? "Move on",
          after: -1,
          src: n,
        });
        stack.push({ kind: "investigate", at, open: false, src: n });
        beats++;
        continue;
      }
      case "spot":
      case "deduce": {
        if (f?.kind !== "investigate") {
          err(n, `"${first}" outside an investigate block`);
          continue;
        }
        closeBody(f, n);
        const look = scene.ops[f.at] as Extract<Op, { op: "investigate" }>;
        const { pos, kv } = argsOf(rest);
        const id = pos[0] ?? "";
        if (!FLAG.test(id)) err(n, `${first} ids are lower_case: "${id}"`);
        if (first === "spot") {
          const x = Number(pos[1]);
          const y = Number(pos[2]);
          if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) {
            err(n, 'spot id X Y "Label" (X and Y in percent)');
          }
          look.spots.push({
            id,
            label: pos[3] ?? id,
            x,
            y,
            at: scene.ops.length,
          });
        } else {
          look.deductions.push({
            id,
            label: pos[1] ?? id,
            needs: (kv.needs ?? "").split(",").filter(Boolean),
            at: scene.ops.length,
          });
        }
        f.open = true;
        continue;
      }
      case "end": {
        if (f === undefined) {
          err(n, `"end" with nothing to close`);
          continue;
        }
        stack.pop();
        if (f.kind === "if") {
          if (f.pending >= 0) {
            (scene.ops[f.pending] as Extract<Op, { op: "if" }>).else =
              scene.ops.length;
          }
          for (const j of f.ends) {
            (scene.ops[j] as Extract<Op, { op: "jump" }>).to = scene.ops.length;
          }
        } else if (f.kind === "choose") {
          closeOption(f, n);
          const op = scene.ops[f.at] as Extract<Op, { op: "choose" }>;
          if (op.options.length === 0) err(f.src, "a choice with no options");
          for (const j of f.ends) {
            (scene.ops[j] as Extract<Op, { op: "jump" }>).to = scene.ops.length;
          }
        } else {
          closeBody(f, n);
          const op = scene.ops[f.at] as Extract<Op, { op: "investigate" }>;
          op.after = scene.ops.length;
          if (op.spots.length === 0)
            err(f.src, "an investigation with no spots");
        }
        continue;
      }
      default:
        break;
    }

    if (first.startsWith("@")) {
      err(n, `unknown direction "${first}"`);
      continue;
    }

    // Inside a choose block, between "choose" and the first "*".
    if (f?.kind === "choose" && !f.open) {
      err(n, `text inside a choice must belong to an option ("*")`);
      continue;
    }
    if (f?.kind === "investigate" && !f.open) {
      err(n, `text inside an investigation must belong to a spot or deduce`);
      continue;
    }

    // A line of the story.
    if (line.startsWith("~")) {
      emit({ op: "line", kind: "think", text: line.slice(1).trim(), src: n });
      beats++;
      continue;
    }
    const say = /^([A-Z][A-Z0-9_]*)(?:\s*\(([^)]*)\))?:\s+(.+)$/.exec(line);
    if (say) {
      if (!castIds.has(say[1])) err(n, `"${say[1]}" isn't in the cast`);
      emit({
        op: "line",
        kind: "say",
        who: say[1],
        how: say[2]?.trim() || undefined,
        text: say[3].trim(),
        src: n,
      });
      beats++;
      continue;
    }
    emit({ op: "line", kind: "narr", text: line, src: n });
    beats++;
  }
  closeScene(lines.length);

  if (chapter.n === 0) err(1, 'the script needs @chapter N "Title"');
  if (!chapter.start) chapter.start = chapter.order[0] ?? "";
  if (chapter.start && !chapter.scenes[chapter.start]) {
    err(1, `@start: there's no scene "${chapter.start}"`);
  }
  return { chapter, errors };
}
