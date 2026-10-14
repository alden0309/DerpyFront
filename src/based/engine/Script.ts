// Reads a Mr. Based chapter script (the format is in src/based/README.md)
// and compiles each scene into a flat list of ops the runtime steps through.
// Blocks (if, choose, investigate) close with `end`; indentation is only for
// the writer's eyes.
//
// r21 adds skills and checks (in the manner of Disco Elysium) and the 3D
// places: `@attribute`, `@skill`, `@archetype` and `@points` in the header;
// check options (`* white COMPOSURE challenging [Label]`) with `bonus` lines
// and a `fail` section; skills' voices (`~ TRADECRAFT 9: ...`); checked
// deductions; spots on a place's hotspots; and `@place`, `@actor`, `@focus`,
// `@vignette`, `@show`, `@hide` and `boost`.

import { parseDifficulty } from "./Dice";
import { parseExpr } from "./Expr";
import {
  ActorState,
  CastMember,
  Chapter,
  CheckSpec,
  ChoiceOption,
  Deduction,
  END,
  Expr,
  Mod,
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
      /** The open option's check op, or -1. */
      check: number;
      /** Its `fail` section has begun. */
      failing: boolean;
      src: number;
    }
  | {
      kind: "investigate";
      at: number;
      open: boolean;
      /** The deduction whose text is open, if it's one with a check. */
      ded: Deduction | null;
      failing: boolean;
      src: number;
    };

const SCENE_ID = /^[a-z][a-z0-9_]*$/;
const CAST_ID = /^[A-Z][A-Z0-9_]*$/;
const FLAG = /^[a-z_][a-z0-9_]*$/;
const KEY = /^[a-z0-9_]+$/;

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
    const m = /^([A-Za-z_]+)=(.*)$/.exec(w);
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
    attributes: [],
    skills: [],
    archetypes: [],
    points: { total: 9, min: 1, max: 5 },
  };
  const castIds = new Set<string>();
  const skillIds = new Set<string>();
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
  const skill = (id: string, line: number): string => {
    if (!skillIds.has(id)) err(line, `"${id}" isn't a @skill`);
    return id;
  };
  const difficulty = (word: string | undefined, line: number): number => {
    const d = word === undefined ? null : parseDifficulty(word);
    if (d === null) {
      err(
        line,
        `difficulty "${word ?? ""}": a number or trivial, easy, medium, challenging, formidable, legendary, heroic, godly, impossible`,
      );
      return 10;
    }
    return d;
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
    if (f.open) {
      const j = emit({ op: "jump", to: -1, src: line });
      f.ends.push(j);
      if (f.check >= 0) {
        const c = scene!.ops[f.check] as Extract<Op, { op: "check" }>;
        // No fail section: a failed check skips the success text.
        if (c.fail < 0) c.fail = j;
      }
    }
    f.open = false;
    f.check = -1;
    f.failing = false;
  };
  const closeBody = (f: Frame & { kind: "investigate" }, line: number) => {
    if (f.open) {
      const r = emit({ op: "return", src: line });
      if (f.ded && f.ded.failAt === undefined) f.ded.failAt = r;
    }
    f.open = false;
    f.ded = null;
    f.failing = false;
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
          if (kv.look) member.look = kv.look;
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
        case "@attribute": {
          const id = pos[0] ?? "";
          if (!CAST_ID.test(id)) {
            err(n, '@attribute ID "Name" "What it is"');
            break;
          }
          chapter.attributes.push({
            id,
            name: pos[1] ?? id,
            about: pos[2] ?? "",
          });
          break;
        }
        case "@skill": {
          const id = pos[0] ?? "";
          const attr = pos[1] ?? "";
          if (!CAST_ID.test(id)) {
            err(n, '@skill ID ATTRIBUTE "Name" "What it does"');
            break;
          }
          if (!chapter.attributes.some((a) => a.id === attr)) {
            err(n, `@skill ${id}: "${attr}" isn't an @attribute above it`);
          }
          if (skillIds.has(id) || castIds.has(id)) {
            err(n, `"${id}" is used twice`);
          }
          chapter.skills.push({
            id,
            attr,
            name: pos[2] ?? id,
            about: pos[3] ?? "",
          });
          skillIds.add(id);
          break;
        }
        case "@archetype": {
          const id = pos[0] ?? "";
          if (!CAST_ID.test(id)) {
            err(
              n,
              '@archetype ID "Name" ATTR=n ... signature=SKILL "What he was"',
            );
            break;
          }
          const attrs: Record<string, number> = {};
          for (const a of chapter.attributes) {
            const v = Number(kv[a.id]);
            if (!Number.isInteger(v)) {
              err(n, `@archetype ${id} needs ${a.id}=n`);
            }
            attrs[a.id] = v;
          }
          const sig = kv.signature ?? "";
          if (!skillIds.has(sig)) {
            err(n, `@archetype ${id}: signature=${sig} isn't a @skill`);
          }
          chapter.archetypes.push({
            id,
            name: pos[1] ?? id,
            about: pos[2] ?? "",
            attrs,
            signature: sig,
          });
          break;
        }
        case "@points": {
          const total = Number(pos[0]);
          const min = kv.min !== undefined ? Number(kv.min) : 1;
          const max = kv.max !== undefined ? Number(kv.max) : 5;
          if (
            ![total, min, max].every(Number.isInteger) ||
            min < 0 ||
            max < min
          ) {
            err(n, "@points N [min=1] [max=5]");
            break;
          }
          chapter.points = { total, min, max };
          break;
        }
        default:
          err(
            n,
            `before the first scene, only @chapter, @summary, @start, @cast, @carry, @attribute, @skill, @archetype and @points: "${line}"`,
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
      const mm =
        /^((?:(?:once|silent)\s+)*)(?:(white|red)\s+([A-Za-z_][A-Za-z0-9_]*)\s+([a-z]+|\d+)\s+)?(?:if\s+(.+))?$/.exec(
          mods ? `${mods} ` : "",
        );
      if (!mm) {
        err(
          n,
          `before the label: once, silent, then "white SKILL difficulty" or "red SKILL difficulty", then "if condition": "${mods}"`,
        );
      } else {
        opt.once = /\bonce\b/.test(mm[1]);
        opt.silent = /\bsilent\b/.test(mm[1]);
        if (mm[2]) {
          opt.check = {
            skill: skill(mm[3], n),
            diff: difficulty(mm[4], n),
            kind: mm[2] as "white" | "red",
            mods: [],
          };
        }
        if (mm[5]) opt.cond = cond(mm[5].trim(), n);
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
      if (opt.check) {
        if (m[5]) {
          err(n, `a check option can't jump with "->": put the jump in its text`);
        }
        f.check = emit({
          op: "check",
          id: `${op.id}/${opt.id}`,
          label,
          spec: opt.check,
          fail: -1,
          src: n,
        });
      } else if (m[5]) {
        emit({ op: "goto", scene: m[5], src: n });
        f.open = false;
      }
      continue;
    }

    switch (first) {
      case "@backdrop":
      case "@ambient":
      case "@place":
      case "@focus":
      case "@vignette": {
        const key = rest === "none" ? null : rest;
        if (key !== null && !KEY.test(key)) {
          err(n, `${first} takes a key or none: "${rest}"`);
        }
        const kind = first.slice(1) as
          | "backdrop"
          | "ambient"
          | "place"
          | "focus"
          | "vignette";
        emit({ op: kind, key, src: n });
        continue;
      }
      case "@show":
      case "@hide": {
        if (!KEY.test(rest)) err(n, `${first} takes a prop's key: "${rest}"`);
        emit({ op: "prop", key: rest, on: first === "@show", src: n });
        continue;
      }
      case "@actor": {
        const { pos, kv } = argsOf(rest);
        const who = pos[0] ?? "";
        if (!castIds.has(who)) err(n, `@actor: "${who}" isn't in the cast`);
        const mark = pos[1] ?? "";
        if (mark !== "none" && !KEY.test(mark)) {
          err(n, '@actor WHO mark [pose] [walk] [wear=look]  (or "none")');
        }
        let walk = false;
        let pose = "stand";
        for (const w of pos.slice(2)) {
          if (w === "walk") walk = true;
          else if (/^[a-z_]+$/.test(w)) pose = w;
          else err(n, `@actor: "${w}" isn't a pose`);
        }
        const state: ActorState | null =
          mark === "none" ? null : { at: mark, pose };
        if (state && kv.wear) state.wear = kv.wear;
        emit({ op: "actor", who, state, walk, src: n });
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
      case "boost": {
        const m = /^([A-Z][A-Z0-9_]*)\s+([+-]\d+)\s+"((?:[^"\\]|\\.)*)"$/.exec(
          rest,
        );
        if (!m) {
          err(n, 'boost SKILL +1 "Why"');
          continue;
        }
        emit({
          op: "boost",
          skill: skill(m[1], n),
          delta: Number(m[2]),
          why: m[3],
          src: n,
        });
        continue;
      }
      case "bonus": {
        // A modifier on the open option's check or deduction.
        const m =
          /^([+-]\d+)\s+(?:if\s+(.+?)\s+)?"((?:[^"\\]|\\.)*)"$/.exec(rest);
        const spec: CheckSpec | undefined =
          f?.kind === "choose" && f.check >= 0
            ? (scene.ops[f.check] as Extract<Op, { op: "check" }>).spec
            : f?.kind === "investigate" && f.ded?.check
              ? f.ded.check
              : undefined;
        if (spec === undefined) {
          err(n, `"bonus" belongs to a check option or a checked deduce`);
          continue;
        }
        if (!m) {
          err(n, 'bonus +2 [if condition] "Why"');
          continue;
        }
        const mod: Mod = { delta: Number(m[1]), why: m[3] };
        if (m[2]) mod.cond = cond(m[2], n);
        spec.mods.push(mod);
        continue;
      }
      case "fail": {
        if (rest !== "") err(n, `"fail" stands on its own line`);
        if (f?.kind === "choose" && f.check >= 0 && !f.failing) {
          f.ends.push(emit({ op: "jump", to: -1, src: n }));
          (scene.ops[f.check] as Extract<Op, { op: "check" }>).fail =
            scene.ops.length;
          f.failing = true;
        } else if (f?.kind === "investigate" && f.ded && !f.failing) {
          emit({ op: "return", src: n });
          f.ded.failAt = scene.ops.length;
          f.failing = true;
        } else {
          err(n, `"fail" belongs to a check option or a checked deduce`);
        }
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
        stack.push({
          kind: "choose",
          at,
          open: false,
          ends: [],
          check: -1,
          failing: false,
          src: n,
        });
        beats++;
        continue;
      }
      case "investigate": {
        const { pos, kv } = argsOf(rest);
        lookCount++;
        const still = pos.slice(1).includes("still");
        for (const w of pos.slice(1)) {
          if (w !== "still") err(n, `investigate: "${w}" isn't understood`);
        }
        const at = emit({
          op: "investigate",
          id: kv.id ?? `${scene.id}@${lookCount}`,
          title: pos[0] ?? "",
          min: kv.min !== undefined ? Number(kv.min) : 1,
          spots: [],
          deductions: [],
          leave: kv.leave ?? "Move on",
          still,
          exit: kv.exit,
          after: -1,
          src: n,
        });
        stack.push({
          kind: "investigate",
          at,
          open: false,
          ded: null,
          failing: false,
          src: n,
        });
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
          if (pos.length >= 3 && /^-?\d/.test(pos[1] ?? "")) {
            // On a flat picture: spot id X Y "Label".
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
            // In a place: spot id "Label" [at=hotspot].
            if (kv.at !== undefined && !KEY.test(kv.at)) {
              err(n, `spot ${id}: at= takes a hotspot's key`);
            }
            look.spots.push({
              id,
              label: pos[1] ?? id,
              x: -1,
              y: -1,
              anchor: kv.at ?? id,
              at: scene.ops.length,
            });
          }
        } else {
          const d: Deduction = {
            id,
            label: pos[1] ?? id,
            needs: (kv.needs ?? "").split(",").filter(Boolean),
            at: scene.ops.length,
          };
          if (kv.skill !== undefined || kv.diff !== undefined) {
            d.check = {
              skill: skill(kv.skill ?? "", n),
              diff: difficulty(kv.diff, n),
              kind: pos.slice(2).includes("red") ? "red" : "white",
              mods: [],
            };
            f.ded = d;
          }
          look.deductions.push(d);
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
      const body = line.slice(1).trim();
      // A skill's voice: "~ TRADECRAFT: ..." or, passive, "~ MEMORY 9: ...".
      const v = /^([A-Z][A-Z0-9_]*)(?:\s+([a-z]+|\d+))?:\s+(.+)$/.exec(body);
      if (v) {
        emit({
          op: "line",
          kind: "think",
          text: v[3].trim(),
          skill: skill(v[1], n),
          diff: v[2] !== undefined ? difficulty(v[2], n) : undefined,
          src: n,
        });
      } else {
        emit({ op: "line", kind: "think", text: body, src: n });
      }
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
  for (const a of chapter.archetypes) {
    const sum = Object.values(a.attrs).reduce((x, y) => x + y, 0);
    if (sum !== chapter.points.total) {
      err(
        1,
        `@archetype ${a.id}: its attributes add up to ${sum}, not @points ${chapter.points.total}`,
      );
    }
  }
  return { chapter, errors };
}
