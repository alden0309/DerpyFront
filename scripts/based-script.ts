// Mr. Based's chapter as a script to read (r26): every scene in story order,
// grouped by where it happens, with every line, choice, check and condition
// in plain words, where each one leads, and a reference on every line
// ("S12.7") to write notes against. One self-contained HTML file, made
// offline from the engine's own parser, so it always says what the game
// does. It's for the owner to read: it isn't part of the site or any bundle,
// and nothing serves it.
//
//   npx tsx scripts/based-script.ts --chapter 1 --out /somewhere/script.html
//
// The flags' plain words are in scripts/based-script-words.ts.

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { tierName } from "../src/based/engine/Dice";
import { factFlow, Known, knownNameAt } from "../src/based/engine/Facts";
import { PlaceDef } from "../src/based/engine/Place";
import { parseChapter } from "../src/based/engine/Script";
import {
  LANG_LEVELS,
  LANG_MAX,
  langOf,
  LANGUAGES_SKILL,
} from "../src/based/engine/Skills";
import {
  Chapter,
  ChoiceOption,
  Deduction,
  END,
  Expr,
  FREE,
  Op,
  Scene,
  Spot,
} from "../src/based/engine/Types";
import { FLAG_WORDS, FlagWords, isCounter } from "./based-script-words";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const STORY = path.join(ROOT, "src/based/story");
const PLACES = path.join(ROOT, "src/based/places");

type OpOf<K extends Op["op"]> = Extract<Op, { op: K }>;

// --- The shape of a scene ---------------------------------------------------
// The parser compiles a scene to a flat list of ops with jumps; this gives
// back its blocks (ifs, choices and their options, checks, rooms to read),
// with the source lines to tell an `else`'s jump from the end of an option.

export interface Branch {
  /** null: the `else`. */
  cond: Expr | null;
  at: number;
  body: Node[];
  ref?: string;
}

export interface OptionNode {
  opt: ChoiceOption;
  body: Node[];
  ref?: string;
}

export type Part =
  | { k: "spot"; spot: Spot; body: Node[]; ref?: string }
  | {
      k: "ded";
      d: Deduction;
      pass: Node[];
      fail: Node[];
      ref?: string;
      passRef?: string;
      failRef?: string;
    };

export type Node =
  | { k: "op"; at: number; op: Op; ref?: string }
  | { k: "if"; at: number; branches: Branch[] }
  | {
      k: "choose";
      at: number;
      op: OpOf<"choose">;
      options: OptionNode[];
      end: number;
      ref?: string;
    }
  | {
      k: "check";
      at: number;
      op: OpOf<"check">;
      pass: Node[];
      fail: Node[];
      ref?: string;
      passRef?: string;
      failRef?: string;
    }
  | {
      k: "look";
      at: number;
      op: OpOf<"investigate">;
      parts: Part[];
      ref?: string;
    };

/** A scene's ops as blocks. `lines` is the script, to read `else` and `*`. */
export function shapeOf(scene: Scene, lines: string[]): Node[] {
  const ops = scene.ops;
  const head = (src: number) => (lines[src - 1] ?? "").trim();
  const word = (src: number) => head(src).split(/\s+/, 1)[0];
  const fault = (at: number, what: string): never => {
    throw new Error(
      `${scene.id}: ${what} (op ${at}, script line ${ops[at]?.src ?? "?"})`,
    );
  };
  const isJump = (o: Op | undefined): o is OpOf<"jump"> => o?.op === "jump";

  const seq = (a: number, b: number): Node[] => {
    const out: Node[] = [];
    let i = a;
    while (i < b) {
      const op = ops[i];
      if (op.op === "if") {
        const r = ifAt(i);
        out.push(r.node);
        i = r.next;
      } else if (op.op === "choose") {
        const r = chooseAt(i);
        out.push(r.node);
        i = r.next;
      } else if (op.op === "investigate") {
        const r = lookAt(i);
        out.push(r.node);
        i = r.next;
      } else if (op.op === "check") {
        out.push(checkAt(i, b));
        i = b;
      } else if (op.op === "fall") {
        i++;
      } else if (op.op === "jump" || op.op === "return") {
        fault(i, `a ${op.op} where none should be`);
      } else {
        out.push({ k: "op", at: i, op });
        i++;
      }
      if (i > b) fault(i, "a block runs past the end of the one around it");
    }
    return out;
  };

  const ifAt = (i: number): { node: Node; next: number } => {
    const branches: Branch[] = [];
    let at = i;
    for (;;) {
      const op = ops[at];
      if (op.op !== "if") return fault(at, "an elif without its if");
      const e = op.else;
      const j = e - 1;
      const jop = ops[j];
      const hasElse =
        j > at && isJump(jop) && ["else", "elif"].includes(word(jop.src));
      if (!hasElse || !isJump(jop)) {
        branches.push({ cond: op.cond, at, body: seq(at + 1, e) });
        return { node: { k: "if", at: i, branches }, next: e };
      }
      branches.push({ cond: op.cond, at, body: seq(at + 1, j) });
      if (word(jop.src) === "elif") {
        at = e;
        continue;
      }
      branches.push({ cond: null, at: e, body: seq(e, jop.to) });
      return { node: { k: "if", at: i, branches }, next: jop.to };
    }
  };

  const checkAt = (c: number, b: number): Node => {
    const op = ops[c] as OpOf<"check">;
    const f = op.fail;
    const pre = ops[f - 1];
    if (f - 1 > c && isJump(pre) && word(pre.src) === "fail") {
      return {
        k: "check",
        at: c,
        op,
        pass: seq(c + 1, f - 1),
        fail: seq(f, b),
      };
    }
    if (f !== b) fault(c, "a check whose failure isn't where it should be");
    return { k: "check", at: c, op, pass: seq(c + 1, b), fail: [] };
  };

  /** Where a choice ends, read from its last option. */
  const endFrom = (at: number): number => {
    let j = at;
    while (j < ops.length) {
      const o = ops[j];
      if (o.op === "jump") return o.to;
      // `* [Label] -> scene`: the option's own jump closes it.
      if (o.op === "goto" && head(o.src).startsWith("*")) return j + 1;
      if (o.op === "check") {
        const pre = ops[o.fail - 1];
        if (isJump(pre) && word(pre.src) === "fail") return pre.to;
        const close = ops[o.fail];
        if (isJump(close)) return close.to;
        return fault(j, "a check that never ends");
      }
      if (o.op === "if") j = ifAt(j).next;
      else if (o.op === "choose") j = chooseAt(j).next;
      else if (o.op === "investigate") j = o.after;
      else j++;
    }
    return fault(at, "a choice that never ends");
  };

  const chooseAt = (i: number): { node: Node; next: number } => {
    const op = ops[i] as OpOf<"choose">;
    const opts = op.options;
    const n = opts.length;
    if (n === 0) return fault(i, "a choice with no options");
    let end = -1;
    const ranges: [number, number][] = [];
    for (let k = 0; k < n - 1; k++) {
      const next = opts[k + 1].at;
      const last = ops[next - 1];
      if (isJump(last)) {
        end = last.to;
        ranges.push([opts[k].at, next - 1]);
      } else ranges.push([opts[k].at, next]);
    }
    const lastAt = opts[n - 1].at;
    if (end < 0) end = endFrom(lastAt);
    if (end <= lastAt) fault(i, "a choice that ends before its last option");
    ranges.push([lastAt, isJump(ops[end - 1]) ? end - 1 : end]);
    const options = opts.map((opt, k) => ({
      opt,
      body: seq(ranges[k][0], ranges[k][1]),
    }));
    return { node: { k: "choose", at: i, op, options, end }, next: end };
  };

  const lookAt = (i: number): { node: Node; next: number } => {
    const op = ops[i] as OpOf<"investigate">;
    const starts: ({ at: number } & (
      | { spot: Spot; d?: undefined }
      | { d: Deduction; spot?: undefined }
    ))[] = [
      ...op.spots.map((spot) => ({ at: spot.at, spot })),
      ...op.deductions.map((d) => ({ at: d.at, d })),
    ].sort((a, b) => a.at - b.at);
    const parts: Part[] = starts.map((s, k) => {
      const segEnd = k + 1 < starts.length ? starts[k + 1].at : op.after;
      const r = segEnd - 1;
      if (ops[r]?.op !== "return") fault(r, "a spot that doesn't end");
      if (s.spot) return { k: "spot", spot: s.spot, body: seq(s.at, r) };
      const d = s.d!;
      if (d.failAt !== undefined && d.failAt < r) {
        if (ops[d.failAt - 1]?.op !== "return") {
          fault(d.failAt, "a deduction's failure isn't where it should be");
        }
        return {
          k: "ded",
          d,
          pass: seq(s.at, d.failAt - 1),
          fail: seq(d.failAt, r),
        };
      }
      return { k: "ded", d, pass: seq(s.at, r), fail: [] };
    });
    return { node: { k: "look", at: i, op, parts }, next: op.after };
  };

  return seq(0, ops.length);
}

/** Every op index a shape shows or is built from (for the tests). */
export function opsShown(nodes: Node[], out = new Set<number>()): Set<number> {
  for (const n of nodes) {
    out.add(n.at);
    if (n.k === "if") {
      for (const b of n.branches) {
        out.add(b.at);
        opsShown(b.body, out);
      }
    } else if (n.k === "choose") {
      for (const o of n.options) opsShown(o.body, out);
    } else if (n.k === "check") {
      opsShown(n.pass, out);
      opsShown(n.fail, out);
    } else if (n.k === "look") {
      for (const p of n.parts) {
        if (p.k === "spot") opsShown(p.body, out);
        else {
          opsShown(p.pass, out);
          opsShown(p.fail, out);
        }
      }
    }
  }
  return out;
}

// --- Words ------------------------------------------------------------------

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A line's text, with its *stressed* words in italics, as the game types it. */
const words = (s: string) =>
  esc(s).replace(/\*([^*]+)\*/g, (_m, w: string) => `<em>${w}</em>`);

const quote = (s: string) => `“${words(s)}”`;

const lowerFirst = (s: string) =>
  /^(The|A|An|His|Her|Its|Their) /.test(s)
    ? s[0].toLowerCase() + s.slice(1)
    : s;

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const clock = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const WEATHER_YES: Record<string, string> = {
  rain: "it's raining",
  drizzle: "it's drizzling",
  clear: "the sky is clear",
  fog: "it's foggy",
};
const WEATHER_NO: Record<string, string> = {
  rain: "it isn't raining",
  drizzle: "it isn't drizzling",
  clear: "the sky isn't clear",
  fog: "it isn't foggy",
};

/** The groups scenes fall into, by where they happen (chapter one's places). */
const GROUPS: Record<string, { title: string; sub: string }> = {
  street: { title: "The street", sub: "Rue de Grenelle, outside Le Vauban" },
  "vauban:lobby": {
    title: "The hotel",
    sub: "The lobby of the Hôtel Vauban: the desk, the keys, the stairs",
  },
  "vauban:bar": { title: "The bar", sub: "Le Vauban" },
  anywhere: {
    title: "Wherever he is",
    sub: "What he carries, the thoughts in the column, and what happens by itself",
  },
  room: { title: "His room", sub: "Room twenty-three" },
  elysee: { title: "The palace window", sub: "A room in the palace" },
};
const GROUP_ORDER = [
  "street",
  "vauban:lobby",
  "vauban:bar",
  "anywhere",
  "room",
  "elysee",
];

export interface ScriptOptions {
  places: Record<string, PlaceDef>;
  /** The script's text (for its line numbers), as parsed. */
  source: string;
  /** What it was made from: "chapter-01.story at c20efc42f". */
  from?: string;
  /** When it was made. */
  made?: string;
}

interface SceneInfo {
  n: number;
  id: string;
  scene: Scene;
  shape: Node[];
  group: string;
  /** The rows of its head: the label over a thing, a thought's label. */
  labelRef?: string;
  thoughtRef?: string;
  /** Op index -> the reference of the row it's shown on. */
  refs: Map<number, string>;
}

export class ScriptExport {
  readonly lines: string[];
  readonly info = new Map<string, SceneInfo>();
  /** Scene id -> the rows that jump to it. */
  readonly incoming = new Map<string, string[]>();
  /** Flags with no plain words (shown by their names). */
  readonly unworded = new Set<string>();
  private readonly flagWords: Record<string, FlagWords>;
  /** What's certain at each op (the fact check's), for the pop-ups' names. */
  private readonly known: Map<string, Map<number, Known>>;
  /** A journal entry ticked off: its words then ("scene:op" -> text). */
  private readonly doneText = new Map<string, string>();

  constructor(
    readonly chapter: Chapter,
    readonly opts: ScriptOptions,
  ) {
    this.lines = opts.source.split(/\r?\n/);
    this.flagWords = FLAG_WORDS[chapter.n] ?? {};
    this.known = factFlow(chapter);
    chapter.order.forEach((id, k) => {
      const scene = chapter.scenes[id];
      this.info.set(id, {
        n: k + 1,
        id,
        scene,
        shape: shapeOf(scene, this.lines),
        group: "",
        refs: new Map(),
      });
    });
    for (const s of this.info.values()) this.number(s);
    this.groupScenes();
    // What a journal entry said when it's ticked off: its last words before,
    // in story order.
    const said = new Map<string, string>();
    for (const id of chapter.order) {
      chapter.scenes[id].ops.forEach((op, at) => {
        if (op.op !== "task") return;
        if (op.text) said.set(op.id, op.text);
        if (op.done && said.has(op.id)) {
          this.doneText.set(`${id}:${at}`, said.get(op.id)!);
        }
      });
    }
  }

  // --- References ---------------------------------------------------------

  /** Gives every row of a scene its reference, in the order they're shown. */
  private number(s: SceneInfo): void {
    let k = 0;
    const next = () => `S${s.n}.${++k}`;
    const t = s.scene.trigger;
    if (t?.on === "look") s.labelRef = next();
    if (t?.on === "think") s.thoughtRef = next();
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (!this.visible(n)) continue;
        if (n.k === "op") {
          if (!this.shows(n.op)) continue;
          n.ref = next();
          s.refs.set(n.at, n.ref);
          if (n.op.op === "goto" && this.info.has(n.op.scene)) {
            const l = this.incoming.get(n.op.scene) ?? [];
            l.push(n.ref);
            this.incoming.set(n.op.scene, l);
          }
        } else if (n.k === "if") {
          for (const b of n.branches) {
            b.ref = next();
            s.refs.set(b.at, b.ref);
            walk(b.body);
          }
        } else if (n.k === "choose") {
          n.ref = next();
          s.refs.set(n.at, n.ref);
          for (const o of n.options) {
            o.ref = next();
            walk(o.body);
          }
        } else if (n.k === "check") {
          n.ref = next();
          s.refs.set(n.at, n.ref);
          n.passRef = next();
          walk(n.pass);
          n.failRef = next();
          walk(n.fail);
        } else {
          n.ref = next();
          s.refs.set(n.at, n.ref);
          for (const p of n.parts) {
            p.ref = next();
            if (p.k === "spot") walk(p.body);
            else {
              p.passRef = next();
              walk(p.pass);
              if (p.fail.length > 0 || p.d.check) {
                p.failRef = next();
                walk(p.fail);
              }
            }
          }
        }
      }
    };
    walk(s.shape);
  }

  /** Whether a block shows anything (an `if` around a camera shot doesn't). */
  private visible(n: Node): boolean {
    if (n.k === "op") return this.shows(n.op);
    if (n.k === "if") {
      return n.branches.some((b) => b.body.some((x) => this.visible(x)));
    }
    return true;
  }

  /** The ops that are shown as rows (the rest is staging: who stands where). */
  private shows(op: Op): boolean {
    switch (op.op) {
      case "line":
      case "card":
      case "news":
      case "task":
      case "item":
      case "equip":
      case "unequip":
      case "money":
      case "boost":
      case "set":
      case "rel":
      case "remember":
      case "goto":
      case "place":
      case "time":
      case "weather":
        return true;
      default:
        return false;
    }
  }

  /** Where the story picks up after op `at` (past jumps and staging). */
  private resumeRef(s: SceneInfo, at: number): string | null {
    const ops = s.scene.ops;
    let c = at;
    for (let guard = 0; guard < 10_000 && c < ops.length; guard++) {
      const o = ops[c];
      if (o.op === "jump") {
        c = o.to;
        continue;
      }
      const r = s.refs.get(c);
      if (r) return r;
      if (o.op === "fall") return null;
      c++;
    }
    return null;
  }

  // --- Where scenes happen ------------------------------------------------

  private areaOf(place: string, x: number, z: number): string {
    const def = this.opts.places[place];
    if (!def || def.areas.length <= 1) return place;
    const a = def.areas.find(
      (r) =>
        x >= r.rect[0] && x <= r.rect[2] && z >= r.rect[1] && z <= r.rect[3],
    );
    return `${place}:${a?.id ?? def.areas[0].id}`;
  }

  private markGroup(place: string, mark: string): string {
    const m = this.opts.places[place]?.marks[mark];
    return m
      ? this.areaOf(place, m.at[0], m.at[1])
      : this.areaOf(place, 1e9, 1e9);
  }

  private groupScenes(): void {
    const ch = this.chapter;
    // Where each person is first put (their mark, in the place named or the
    // one the story is in).
    const where = new Map<string, { place: string; mark: string }>();
    let current = "";
    for (const id of ch.order) {
      for (const op of ch.scenes[id].ops) {
        if (op.op === "place" && op.key) current = op.key;
        if (op.op === "actor" && op.state && !where.has(op.who)) {
          const place = op.state.place ?? current;
          if (place) where.set(op.who, { place, mark: op.state.at });
        }
      }
    }
    const bodyOf = (who: string) =>
      ch.cast.find((c) => c.id === who)?.body ?? who;
    const placed = new Map<string, string>();
    for (const s of this.info.values()) {
      const ops = s.scene.ops;
      const place = ops.find((o) => o.op === "place" && o.key) as
        | OpOf<"place">
        | undefined;
      const t = s.scene.trigger;
      let g: string | undefined;
      if (place?.key) {
        const hero = ops.find(
          (o) => o.op === "actor" && o.who === ch.cast[0]?.id && o.state,
        ) as OpOf<"actor"> | undefined;
        g = hero?.state
          ? this.markGroup(place.key, hero.state.at)
          : this.areaOf(place.key, 1e9, 1e9);
      } else if (t?.on === "look" && t.target) {
        const key =
          t.place ??
          Object.keys(this.opts.places).find(
            (k) => this.opts.places[k].hotspots[t.target!],
          );
        const h = key ? this.opts.places[key]?.hotspots[t.target] : undefined;
        if (key && h) g = this.areaOf(key, h.at[0], h.at[2]);
      } else if (t?.on === "talk" && t.target) {
        const w = where.get(bodyOf(t.target)) ?? where.get(t.target);
        if (w) g = this.markGroup(w.place, w.mark);
      } else if (t?.on === "enter" && t.target) {
        g = this.areaOf(t.target, 1e9, 1e9);
        const def = this.opts.places[t.target];
        if (def && def.areas.length > 1) g = `${t.target}:${def.areas[0].id}`;
      } else if (t) {
        g = t.place ? this.areaOf(t.place, 1e9, 1e9) : "anywhere";
      }
      if (g) placed.set(s.id, g);
    }
    // A scene nothing starts but a jump is where the first jump to it is.
    for (let pass = 0; pass < 20; pass++) {
      let changed = false;
      for (const s of this.info.values()) {
        if (placed.has(s.id)) continue;
        const from = (this.incoming.get(s.id) ?? [])
          .map((r) => this.sceneOfRef(r))
          .find((id) => id && placed.has(id));
        if (from) {
          placed.set(s.id, placed.get(from)!);
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const s of this.info.values()) {
      s.group = placed.get(s.id) ?? "anywhere";
    }
  }

  private sceneOfRef(ref: string): string | undefined {
    const n = Number(/^S(\d+)\./.exec(ref)?.[1]);
    return this.chapter.order[n - 1];
  }

  private groupTitle(g: string): { title: string; sub: string } {
    if (GROUPS[g]) return GROUPS[g];
    const [place, area] = g.split(":");
    const name = this.opts.places[place]?.name ?? place;
    return { title: area ? `${name}: ${area}` : name, sub: "" };
  }

  // --- Plain words for the script's names ---------------------------------

  castName(who: string): string {
    return this.chapter.cast.find((c) => c.id === who)?.name ?? who;
  }

  /** Who someone is in a sentence: "the barman (Anselme)". */
  private person(who: string): string {
    const c = this.chapter.cast.find((x) => x.id === who);
    if (!c) return who;
    const also = this.chapter.cast
      .filter((x) => x.id !== c.id && (x.body === c.id || c.body === x.id))
      .map((x) => x.name);
    const name = lowerFirst(c.name);
    return also.length > 0 ? `${name} (${also.join(", ")})` : name;
  }

  skillName(id: string): string {
    const code = langOf(id);
    if (code !== null) {
      return `${this.skillName(LANGUAGES_SKILL)} (${this.langName(code)})`;
    }
    return this.chapter.skills.find((s) => s.id === id)?.name ?? id;
  }

  private langName(code: string): string {
    return this.chapter.languages.find((l) => l.code === code)?.name ?? code;
  }

  private attrOf(skill: string): number {
    const id = langOf(skill) === null ? skill : LANGUAGES_SKILL;
    const s = this.chapter.skills.find((x) => x.id === id);
    return Math.max(
      0,
      this.chapter.attributes.findIndex((a) => a.id === s?.attr),
    );
  }

  itemName(key: string): string {
    return this.chapter.items[key]?.name ?? key;
  }

  /** "the key to room twenty-three", "Delorme's card", "Le Vauban matches". */
  private item(key: string): string {
    const n = this.itemName(key);
    if (/^(Le|La|Les|L')\b/.test(n) || /^[A-Z][a-z]+'s\b/.test(n)) return n;
    return `the ${n.charAt(0).toLowerCase()}${n.slice(1)}`;
  }

  private placeName(key: string): string {
    return this.opts.places[key]?.name ?? key;
  }

  private gloss(flag: string): FlagWords | null {
    const w = this.flagWords[flag];
    if (!w) this.unworded.add(flag);
    return w ?? null;
  }

  private flagYes(flag: string): string {
    const w = this.gloss(flag);
    if (!w) return `“${flag}” is set`;
    return isCounter(w) ? w.count("at least 1") : w.yes;
  }

  private flagNo(flag: string): string {
    const w = this.gloss(flag);
    if (!w) return `“${flag}” isn't set`;
    return isCounter(w) ? w.count("none") : w.no;
  }

  /** A quantity: "at least 2", "more than 2", "fewer than 2"... */
  private amount(op: string, n: string, less = "fewer than"): string {
    switch (op) {
      case ">=":
        return `at least ${n}`;
      case ">":
        return `more than ${n}`;
      case "<=":
        return `at most ${n}`;
      case "<":
        return `${less} ${n}`;
      case "==":
        return `exactly ${n}`;
      default:
        return `anything but ${n}`;
    }
  }

  /** A condition in plain words, as a statement: "he speaks French". */
  cond(e: Expr): string {
    switch (e.k) {
      case "flag":
        return this.flagYes(e.name);
      case "lang":
        return `he speaks ${this.langName(e.code)}`;
      case "rel":
        return `${this.castName(e.who)}'s liking for him isn't nothing`;
      case "skill":
        return `his ${this.skillName(e.id)} isn't nothing`;
      case "has":
        return `he has ${this.item(e.item)}`;
      case "wears":
        return this.chapter.items[e.item]?.slot === "hand"
          ? `he's holding ${this.item(e.item)}`
          : `he's wearing ${this.item(e.item)}`;
      case "money":
        return "he has any money at all";
      case "armed":
        return "he has a weapon in his hand";
      case "time":
        return "it's any time but midnight";
      case "weather":
        return WEATHER_YES[e.kind] ?? `the weather is ${e.kind}`;
      case "heard":
        return "he heard the voice or the hard line just above (its check passed)";
      case "num":
        return e.v !== 0 ? "always" : "never";
      case "not":
        return this.neg(e.e);
      case "and": {
        const part = (x: Expr) =>
          x.k === "or" ? `either ${this.cond(x)}` : this.cond(x);
        return `${part(e.a)}, and ${part(e.b)}`;
      }
      case "or":
        return `${this.cond(e.a)}, or ${this.cond(e.b)}`;
      case "cmp":
        return this.cmp(e.op, e.a, e.b);
    }
  }

  /** The same, when it doesn't hold: "he doesn't speak French". */
  neg(e: Expr): string {
    switch (e.k) {
      case "flag":
        return this.flagNo(e.name);
      case "lang":
        return `he doesn't speak ${this.langName(e.code)}`;
      case "has":
        return `he doesn't have ${this.item(e.item)}`;
      case "wears":
        return this.chapter.items[e.item]?.slot === "hand"
          ? `he isn't holding ${this.item(e.item)}`
          : `he isn't wearing ${this.item(e.item)}`;
      case "money":
        return "he has no money";
      case "armed":
        return "he has no weapon in his hand";
      case "weather":
        return WEATHER_NO[e.kind] ?? `the weather isn't ${e.kind}`;
      case "heard":
        return "he didn't hear the voice or the hard line just above (its check failed)";
      case "num":
        return e.v !== 0 ? "never" : "always";
      case "not":
        return this.cond(e.e);
      case "and":
        return `${this.neg(e.a)}, or ${this.neg(e.b)}`;
      case "or": {
        const part = (x: Expr) =>
          x.k === "and" ? `either ${this.neg(x)}` : this.neg(x);
        return `${part(e.a)}, and ${part(e.b)}`;
      }
      case "cmp": {
        const flip: Record<string, string> = {
          ">=": "<",
          "<": ">=",
          ">": "<=",
          "<=": ">",
          "==": "!=",
          "!=": "==",
        };
        return this.cmp(flip[e.op], e.a, e.b);
      }
      default:
        return `not: ${this.cond(e)}`;
    }
  }

  private cmp(op: string, a: Expr, b: Expr): string {
    if (b.k !== "num") return `${this.term(a)} ${op} ${this.term(b)}`;
    const v = b.v;
    switch (a.k) {
      case "flag": {
        const w = this.gloss(a.name);
        if (w && isCounter(w)) {
          if ((op === "<" && v === 1) || (op === "==" && v === 0)) {
            return w.count("none");
          }
          return w.count(this.amount(op, String(v)));
        }
        const set =
          (op === ">=" && v === 1) ||
          (op === ">" && v === 0) ||
          (op === "!=" && v === 0) ||
          (op === "==" && v === 1);
        const unset =
          (op === "==" && v === 0) ||
          (op === "<" && v === 1) ||
          (op === "<=" && v === 0);
        if (set) return this.flagYes(a.name);
        if (unset) return this.flagNo(a.name);
        return `“${a.name}” is ${this.amount(op, String(v))}`;
      }
      case "lang": {
        const name = this.langName(a.code);
        const lv = (n: number) =>
          LANG_LEVELS[Math.max(0, Math.min(LANG_MAX, n))];
        if ((op === ">=" && v >= 1) || (op === ">" && v >= 0)) {
          const n = op === ">" ? v + 1 : v;
          if (n >= LANG_MAX) return `he speaks ${name} ${lv(LANG_MAX)}`;
          return `his ${name} is ${lv(n)} or better (${n} or more)`;
        }
        if ((op === "<" && v === 1) || (op === "==" && v === 0)) {
          return `he doesn't speak ${name}`;
        }
        return `his ${name} is ${this.amount(op, String(v), "less than")}`;
      }
      case "rel":
        return `${this.castName(a.who)}'s liking for him is ${this.amount(op, String(v), "less than")}`;
      case "skill":
        return `his ${this.skillName(a.id)} is ${this.amount(op, String(v), "less than")}`;
      case "money":
        return `he has ${this.amount(op, `€${v}`, "less than")}`;
      case "time": {
        const t = clock(v);
        switch (op) {
          case ">=":
            return `it's ${t} or later`;
          case ">":
            return `it's after ${t}`;
          case "<":
            return `it's before ${t}`;
          case "<=":
            return `it's ${t} or earlier`;
          case "==":
            return `it's ${t} exactly`;
          default:
            return `it isn't ${t}`;
        }
      }
      default:
        return `${this.term(a)} ${op} ${v}`;
    }
  }

  private term(e: Expr): string {
    switch (e.k) {
      case "num":
        return String(e.v);
      case "flag":
        return `“${e.name}”`;
      case "rel":
        return `${this.castName(e.who)}'s liking for him`;
      case "skill":
        return `his ${this.skillName(e.id)}`;
      case "lang":
        return `his ${this.langName(e.code)}`;
      case "money":
        return "his money";
      case "time":
        return "the time";
      default:
        return this.cond(e);
    }
  }

  // --- Rows ---------------------------------------------------------------

  private row(
    s: SceneInfo,
    ref: string | undefined,
    kind: string,
    body: string,
    src?: number,
  ): string {
    const r = ref ?? "";
    return `<div class="row ${kind}"${r ? ` id="${r}"` : ""} data-s="${s.id}"${src ? ` data-l="${src}"` : ""}><a class="ref" href="#${r}">${r}</a><div class="tx">${body}</div></div>`;
  }

  private sceneLink(id: string): string {
    const i = this.info.get(id);
    if (!i) return esc(id);
    return `<a class="go" href="#S${i.n}">S${i.n} · ${esc(i.scene.label)}</a>`;
  }

  private refLink(ref: string): string {
    return `<a class="go" href="#${ref}">${ref}</a>`;
  }

  private lineRow(
    s: SceneInfo,
    op: OpOf<"line">,
    ref: string | undefined,
    examine: boolean,
  ): string {
    const hero = this.chapter.cast[0]?.id;
    if (op.kind === "narr") {
      return this.row(
        s,
        ref,
        examine ? "examine" : "narr",
        `${examine ? `<span class="tag">Looking</span> ` : ""}${words(op.text)}`,
        op.src,
      );
    }
    if (op.kind === "think") {
      if (op.skill === undefined) {
        return this.row(
          s,
          ref,
          "think",
          `<span class="tag">Thought</span> ${words(op.text)}`,
          op.src,
        );
      }
      const name = this.skillName(op.skill);
      const tag =
        op.diff !== undefined
          ? `, ${tierName(op.diff).toLowerCase()} ${op.diff}`
          : "";
      const note =
        op.diff !== undefined
          ? `<div class="note">Heard only if his ${esc(name)}, plus six, makes ${op.diff}; otherwise it's skipped.</div>`
          : "";
      return this.row(
        s,
        ref,
        `voice a${this.attrOf(op.skill)}`,
        `<b class="who">${esc(name)}${tag}</b> ${words(op.text)}${note}`,
        op.src,
      );
    }
    const who = op.who ?? "";
    const how = op.how ? ` <i class="how">(${esc(op.how)})</i>` : "";
    const name = `<b class="who">${esc(this.castName(who))}</b>${how}`;
    if (op.lang === undefined) {
      return this.row(
        s,
        ref,
        `say${who === hero ? " hero" : ""}`,
        `${name}: ${words(op.text)}`,
        op.src,
      );
    }
    const lang = this.langName(op.lang);
    const meaning = op.trans ?? op.text;
    const note =
      op.langDiff !== undefined
        ? `Said low, or fast, or guardedly (Languages, ${tierName(op.langDiff).toLowerCase()} ${op.langDiff}): he follows it only if his Languages, plus his ${esc(lang)}, plus six, makes ${op.langDiff}, and then he reads ${quote(meaning)}. If not, he sees the words as said.`
        : `If he speaks ${esc(lang)}, he reads ${quote(meaning)}. If not, he sees the words as said.`;
    return this.row(
      s,
      ref,
      `say foreign${who === hero ? " hero" : ""}`,
      `${name} <span class="lang">in ${esc(lang)}</span>: ${words(op.text)}<div class="note">${note}</div>`,
      op.src,
    );
  }

  /** A row for an op that isn't a block. */
  private opRow(
    s: SceneInfo,
    n: Extract<Node, { k: "op" }>,
    examine: boolean,
  ): string {
    const op = n.op;
    const ref = n.ref;
    switch (op.op) {
      case "line":
        return this.lineRow(s, op, ref, examine);
      case "card":
        return this.row(
          s,
          ref,
          "card",
          `<span class="tag">Title card</span> <b>${words(op.title)}</b>${op.sub ? ` · ${words(op.sub)}` : ""}`,
          op.src,
        );
      case "news":
        return op.text
          ? this.row(
              s,
              ref,
              "news",
              `<span class="tag">The television's ticker</span> ${words(op.text)}`,
              op.src,
            )
          : this.row(
              s,
              ref,
              "stage",
              "The television's ticker goes off.",
              op.src,
            );
      case "task": {
        if (op.done) {
          const was = this.doneText.get(`${s.id}:${n.at}`);
          return this.row(
            s,
            ref,
            "fx",
            `<span class="tag">Journal</span> Done: ${was ? words(was) : `“${esc(op.id)}”`}`,
            op.src,
          );
        }
        return this.row(
          s,
          ref,
          "fx",
          `<span class="tag">Journal</span> ${words(op.text ?? op.id)}`,
          op.src,
        );
      }
      case "item": {
        const it = this.chapter.items[op.key];
        const k = Math.abs(op.delta);
        const many = k > 1 ? ` (${k})` : "";
        if (op.delta > 0) {
          return this.row(
            s,
            ref,
            "fx",
            `He gets: ${esc(this.item(op.key))}${many}.${it ? `<div class="note">In his pockets it says: ${quote(it.about)}</div>` : ""}`,
            op.src,
          );
        }
        return this.row(
          s,
          ref,
          "fx",
          `He loses: ${esc(this.item(op.key))}${many}.`,
          op.src,
        );
      }
      case "equip": {
        const held = this.chapter.items[op.key]?.slot === "hand";
        return this.row(
          s,
          ref,
          "fx",
          `${held ? "He takes in hand" : "He puts on"}: ${esc(this.item(op.key))}.`,
          op.src,
        );
      }
      case "unequip":
        return this.row(
          s,
          ref,
          "fx",
          op.slot === "hand"
            ? "He puts away what's in his hand."
            : `He takes off what he wears on his ${esc(op.slot)}.`,
          op.src,
        );
      case "money":
        return this.row(
          s,
          ref,
          "fx",
          op.delta < 0 ? `He pays €${-op.delta}.` : `He gets €${op.delta}.`,
          op.src,
        );
      case "boost":
        return this.row(
          s,
          ref,
          "fx",
          `<span class="tag">For good</span> ${esc(this.skillName(op.skill))} ${op.delta > 0 ? "+" : ""}${op.delta}: ${words(op.why)}`,
          op.src,
        );
      case "set": {
        const w = this.gloss(op.flag);
        let text: string;
        if (w && isCounter(w)) {
          text = op.add
            ? `Counted: ${esc(w.noun)}, ${op.value > 0 ? "+" : ""}${op.value}.`
            : `Counted: ${esc(w.noun)}, now ${op.value}.`;
        } else if (op.value === 0 && !op.add) {
          text = `No longer: ${esc(this.flagYes(op.flag))}.`;
        } else {
          text = `Noted: ${esc(this.flagYes(op.flag))}.`;
        }
        return this.row(s, ref, "fx flag", text, op.src);
      }
      case "rel":
      case "remember": {
        // The pop-up names them as he knows them then (Facts.knownName).
        const real = this.castName(op.who);
        const k = this.known.get(s.id)?.get(n.at);
        const name = k ? knownNameAt(this.chapter, op.who, k) : real;
        const said = (who: string) =>
          op.op === "remember"
            ? `${who} will remember that.`
            : op.delta >= 2
              ? `${who} trusts you more.`
              : op.delta > 0
                ? `${who} warms to you.`
                : op.delta <= -2
                  ? `${who} trusts you less.`
                  : `${who} cools.`;
        const later =
          name !== real
            ? ` <span class="dim">(“${esc(said(real))}” once he knows the name ${esc(real)})</span>`
            : "";
        const delta =
          op.op === "rel"
            ? ` <span class="dim">(${esc(real)}'s liking for him ${op.delta > 0 ? "+" : ""}${op.delta})</span>`
            : "";
        return this.row(
          s,
          ref,
          "fx",
          `<span class="tag">Pop-up</span> ${esc(upperFirst(said(name)))}${delta}${later}`,
          op.src,
        );
      }
      case "goto": {
        let to: string;
        if (op.scene === FREE) {
          to = "He's free: the player takes him where he likes.";
        } else if (op.scene === END) {
          to = "The end of the chapter.";
        } else {
          const t = this.info.get(op.scene);
          to = `${t && t.n <= s.n ? "back to" : "on to"} ${this.sceneLink(op.scene)}`;
        }
        return this.row(s, ref, "goto", `→ ${to}`, op.src);
      }
      case "place":
        return this.row(
          s,
          ref,
          "stage",
          op.key ? `Now: ${esc(this.placeName(op.key))}.` : "Nowhere.",
          op.src,
        );
      case "time":
        return this.row(
          s,
          ref,
          "stage",
          `The clock: ${clock(op.minutes)}.`,
          op.src,
        );
      case "weather":
        return this.row(
          s,
          ref,
          "stage",
          op.kind
            ? `The weather: ${esc(op.kind === "changing" ? "changing, as it likes" : op.kind)}.`
            : "The weather: as it likes.",
          op.src,
        );
      default:
        return "";
    }
  }

  private checkWords(
    spec: { skill: string; diff: number; kind: "white" | "red" },
    passive = false,
  ): string {
    const name = esc(this.skillName(spec.skill));
    const tier = `${tierName(spec.diff).toLowerCase()} ${spec.diff}`;
    const code = langOf(spec.skill);
    const tongue =
      code !== null
        ? ` (his Languages, with “His ${esc(this.langName(code))}”, his points in it, on top)`
        : "";
    if (passive) {
      return `<b>${name}, ${tier}</b>${tongue}: if his ${name}, plus six, makes ${spec.diff}, it speaks up at once; otherwise it's a white check, one easier for each other thing he's noticed here (“Everything else you've noticed”).`;
    }
    return `<b>Check: ${name}, ${tier}</b>${tongue}. Two dice plus his ${name} against ${spec.diff}. ${
      spec.kind === "red"
        ? "Red: one try only."
        : "White: if it fails, it can be tried again once something changes."
    }`;
  }

  private modsRows(
    s: SceneInfo,
    mods: { delta: number; cond?: Expr; why: string }[],
  ): string {
    if (mods.length === 0) return "";
    return `<ul class="mods">${mods
      .map(
        (m) =>
          `<li>${m.delta > 0 ? "+" : ""}${m.delta}${m.cond ? ` if ${esc(this.cond(m.cond))}` : ""}: ${quote(m.why)}</li>`,
      )
      .join("")}</ul>`;
  }

  /** Whether the story can run off the end of these (not every way ends in a jump). */
  private runsOn(nodes: Node[]): boolean {
    const last = nodes[nodes.length - 1];
    if (!last) return true;
    if (last.k === "op") return last.op.op !== "goto";
    if (last.k === "if") {
      if (last.branches[last.branches.length - 1].cond !== null) return true;
      return last.branches.some((b) => this.runsOn(b.body));
    }
    if (last.k === "choose") {
      return last.options.some((o) => this.runsOn(o.body));
    }
    if (last.k === "check")
      return this.runsOn(last.pass) || this.runsOn(last.fail);
    return true;
  }

  private renderNodes(
    s: SceneInfo,
    nodes: Node[],
    examine: boolean,
    resume?: string | null,
  ): string {
    nodes = nodes.filter((n) => this.visible(n));
    let out = "";
    nodes.forEach((n, k) => {
      const lastOne = k === nodes.length - 1;
      out += this.renderNode(s, n, examine, lastOne ? resume : undefined);
    });
    const last = nodes[nodes.length - 1];
    // A check or a choice last says where each of its ways goes on itself.
    if (
      resume &&
      last?.k !== "check" &&
      last?.k !== "choose" &&
      this.runsOn(nodes)
    ) {
      out += `<div class="resume">↓ then on at ${this.refLink(resume)}</div>`;
    }
    return out;
  }

  private renderNode(
    s: SceneInfo,
    n: Node,
    examine: boolean,
    resume?: string | null,
  ): string {
    switch (n.k) {
      case "op":
        return this.opRow(s, n, examine);
      case "if": {
        let out = "";
        n.branches.forEach((b, k) => {
          const head =
            b.cond === null
              ? "Otherwise:"
              : `${k === 0 ? "If" : "Otherwise, if"} ${esc(this.cond(b.cond))}:`;
          out += this.row(s, b.ref, "cond", head, s.scene.ops[b.at]?.src);
          const inner = this.renderNodes(s, b.body, examine);
          out += `<div class="body">${inner || `<div class="nothing">Nothing on the page: only the staging changes.</div>`}</div>`;
        });
        return out;
      }
      case "choose": {
        const op = n.op;
        const silent = op.options.find((o) => o.silent);
        const timer =
          op.timer > 0
            ? `<div class="note">${op.timer} seconds to answer (if the player keeps timers on). When the time runs out: ${silent ? `[${esc(silent.label)}], and “The moment passed. You said nothing.”` : `the first option, [${esc(op.options[0].label)}]`}.</div>`
            : "";
        let out = this.row(
          s,
          n.ref,
          "choice",
          `<span class="tag">Choice</span> <b>${words(op.prompt || "(no prompt)")}</b>${timer}`,
          op.src,
        );
        const after = this.resumeRef(s, n.end);
        out += `<div class="options">`;
        for (const o of n.options) {
          out += this.optionRow(s, o, op.timer > 0);
          out += `<div class="body">${this.renderNodes(s, o.body, examine, after)}</div>`;
        }
        out += `</div>`;
        return out;
      }
      case "check": {
        let out = this.row(
          s,
          n.ref,
          "check",
          `${this.checkWords(n.op.spec)}${this.modsRows(s, n.op.spec.mods)}`,
          n.op.src,
        );
        out += this.row(s, n.passRef, "cond", "If it passes:");
        out += `<div class="body">${this.renderNodes(s, n.pass, examine, resume)}</div>`;
        out += this.row(
          s,
          n.failRef,
          "cond",
          n.fail.length > 0
            ? "If it fails:"
            : "If it fails: nothing more here.",
        );
        if (n.fail.length > 0 || resume) {
          out += `<div class="body">${this.renderNodes(s, n.fail, examine, resume)}</div>`;
        }
        return out;
      }
      case "look":
        return this.lookRows(s, n);
    }
  }

  private optionRow(s: SceneInfo, o: OptionNode, timed: boolean): string {
    const opt = o.opt;
    const notes: string[] = [];
    if (opt.cond) notes.push(`only if ${esc(this.cond(opt.cond))}`);
    if (opt.needs) {
      const names = opt.needs.map((k) => esc(this.itemName(k))).join(" or ");
      notes.push(
        `needs ${opt.needs.map((k) => esc(this.item(k))).join(" or ")}: until he has it, it's shown shut, with “Needs ${names}.”`,
      );
    }
    if (opt.once) notes.push("gone once it's taken");
    if (opt.silent) {
      notes.push(
        timed ? "saying nothing: what the clock takes" : "saying nothing",
      );
    }
    const check = opt.check
      ? `<div class="note">A check, below (${esc(this.skillName(opt.check.skill))}, ${tierName(opt.check.diff).toLowerCase()} ${opt.check.diff}).</div>`
      : "";
    return this.row(
      s,
      o.ref,
      "opt",
      `<b>[${words(opt.label)}]</b>${notes.length > 0 ? ` <span class="meta">${notes.join("; ")}</span>` : ""}${check}`,
    );
  }

  private lookRows(s: SceneInfo, n: Extract<Node, { k: "look" }>): string {
    const op = n.op;
    const labelOf = new Map<string, string>();
    for (const p of op.spots) labelOf.set(p.id, p.label);
    for (const d of op.deductions) labelOf.set(d.id, d.label);
    const how = op.still
      ? "He reads it from where he is: the things glint as he notices them."
      : "He walks about; the things glint as he notices them.";
    let out = this.row(
      s,
      n.ref,
      "look",
      `<span class="tag">Reading the room</span> <b>${words(op.title)}</b><div class="note">${how} He has to look at ${op.min} before ${quote(op.leave)} lets him move on${op.exit ? `, or walk out through ${esc(op.exit.replace(/_/g, " "))}` : ""}.</div>`,
      op.src,
    );
    out += `<div class="options">`;
    for (const p of n.parts) {
      if (p.k === "spot") {
        out += this.row(
          s,
          p.ref,
          "hover",
          `<span class="tag">Hover label</span> ${words(p.spot.label)}`,
        );
        out += `<div class="body">${this.renderNodes(s, p.body, true)}</div>`;
        continue;
      }
      const d = p.d;
      const needs =
        d.needs.length > 0
          ? ` <span class="meta">once he's noticed ${d.needs.map((x) => esc(lowerFirst(labelOf.get(x) ?? x))).join(" and ")}</span>`
          : "";
      const check = d.check
        ? `<div class="note">${this.checkWords(d.check, true)}</div>${this.modsRows(s, d.check.mods)}`
        : "";
      out += this.row(
        s,
        p.ref,
        "ded",
        `<span class="tag">He can work out</span> <b>${words(d.label)}</b>${needs}${check}`,
      );
      out += this.row(s, p.passRef, "cond", "When he works it out:");
      out += `<div class="body">${this.renderNodes(s, p.pass, false)}</div>`;
      if (p.failRef) {
        out += this.row(
          s,
          p.failRef,
          "cond",
          p.fail.length > 0
            ? "If the check fails:"
            : "If the check fails: nothing.",
        );
        if (p.fail.length > 0) {
          out += `<div class="body">${this.renderNodes(s, p.fail, false)}</div>`;
        }
      }
    }
    out += `</div>`;
    return out;
  }

  // --- Scenes -------------------------------------------------------------

  /** What starts a scene, in plain words. */
  private starts(s: SceneInfo): string {
    const ch = this.chapter;
    const t = s.scene.trigger;
    if (!t) {
      return s.id === ch.start ? "The chapter opens here." : "";
    }
    let what: string;
    switch (t.on) {
      case "talk":
        what = `he goes up to ${esc(this.person(t.target ?? ""))}`;
        break;
      case "look":
        what = `he looks at ${esc(lowerFirst(this.thingLabel(t.target ?? "")))}`;
        break;
      case "enter":
        what = `he walks into ${esc(this.placeName(t.target ?? ""))}`;
        break;
      case "think":
        what = `he follows the thought ${quote(t.label ?? "")} in the column`;
        break;
      case "use":
        what = `he uses ${esc(this.item(t.target ?? ""))}, from his pockets`;
        break;
      default:
        what = "by itself";
    }
    const bits = [what];
    if (t.place) bits.push(`in ${esc(this.placeName(t.place))}`);
    if (t.once && t.on !== "think" && t.on !== "auto")
      bits.push("the first time only");
    if (t.cond) {
      bits.push(
        t.on === "auto"
          ? `as soon as ${esc(this.cond(t.cond))}`
          : `only if ${esc(this.cond(t.cond))}`,
      );
    }
    // Each person and thing answers with the first scene that can play.
    const before = ch.order
      .slice(0, s.n - 1)
      .map((id) => this.info.get(id)!)
      .filter((x) => {
        const u = x.scene.trigger;
        return (
          u &&
          (t.on === "talk" || t.on === "look" || t.on === "use") &&
          u.on === t.on &&
          (t.on === "talk"
            ? this.sameBody(u.target ?? "", t.target ?? "")
            : u.target === t.target) &&
          (u.place ?? "") === (t.place ?? "")
        );
      });
    const prior =
      before.length > 0
        ? ` <span class="dim">(when ${before.map((x) => `<a class="go" href="#S${x.n}">S${x.n}</a>`).join(", ")} ${before.length > 1 ? "don't" : "doesn't"} play first)</span>`
        : "";
    return `${upperFirst(bits.join(", "))}.${prior}`;
  }

  private sameBody(a: string, b: string): boolean {
    const body = (w: string) =>
      this.chapter.cast.find((c) => c.id === w)?.body ?? w;
    return body(a) === body(b);
  }

  /** What a thing he can look at is called on screen. */
  thingLabel(id: string): string {
    for (const def of Object.values(this.opts.places)) {
      const h = def.hotspots[id];
      if (h?.label) return h.label;
    }
    for (const sid of this.chapter.order) {
      const t = this.chapter.scenes[sid].trigger;
      if (t?.on === "look" && t.target === id) {
        return this.chapter.scenes[sid].label;
      }
    }
    return id.replace(/_/g, " ");
  }

  private sceneHtml(s: SceneInfo): string {
    const t = s.scene.trigger;
    const starts = this.starts(s);
    const from = this.incoming.get(s.id) ?? [];
    let head = "";
    if (starts)
      head += `<p class="starts"><span class="tag">Starts</span> ${starts}</p>`;
    if (from.length > 0) {
      head += `<p class="starts"><span class="tag">Comes from</span> ${from.map((r) => this.refLink(r)).join(", ")}</p>`;
    }
    let rows = "";
    if (t?.on === "look" && s.labelRef) {
      rows += this.row(
        s,
        s.labelRef,
        "hover",
        `<span class="tag">Hover label</span> ${words(this.thingLabel(t.target ?? ""))}`,
        s.scene.src,
      );
    }
    if (t?.on === "think" && s.thoughtRef) {
      rows += this.row(
        s,
        s.thoughtRef,
        "think thought-label",
        `<span class="tag">In the column</span> ${words(t.label ?? "")}`,
        s.scene.src,
      );
    }
    rows += this.renderNodes(s, s.shape, t?.on === "look");
    return `<details class="scene" id="S${s.n}" open><summary><span class="sref">S${s.n}</span> <span class="stitle">${words(s.scene.label)}</span> <code>${esc(s.id)}</code></summary><div class="shead">${head}</div><div class="rows">${rows}</div></details>`;
  }

  // --- Before and after ---------------------------------------------------

  private setupHtml(): string {
    const ch = this.chapter;
    let k = 0;
    const r = (body: string) =>
      `<div class="row plain" id="A.${++k}"><a class="ref" href="#A.${k}">A.${k}</a><div class="tx">${body}</div></div>`;
    let out = `<h3>Who's who</h3>`;
    for (const c of ch.cast) {
      const same = c.body
        ? ` <span class="dim">(the same person as ${esc(lowerFirst(this.castName(c.body)))}, once known by this name)</span>`
        : c === ch.cast[0]
          ? ` <span class="dim">(him)</span>`
          : "";
      out += r(`<b>${esc(c.name)}</b>${same}`);
    }
    out += `<h3>The setup screen</h3>`;
    for (const a of ch.attributes) {
      out += r(`<b>${esc(a.name)}</b>: ${words(a.about)}`);
      for (const sk of ch.skills.filter((x) => x.attr === a.id)) {
        out += r(
          `<span class="indent"></span><b>${esc(sk.name)}</b> <span class="dim">(${esc(a.name)})</span>: ${words(sk.about)}`,
        );
      }
    }
    for (const a of ch.archetypes) {
      const attrs = ch.attributes
        .map((x) => `${esc(x.name)} ${a.attrs[x.id] ?? 0}`)
        .join(", ");
      out += r(
        `<b>${esc(a.name)}</b>: ${words(a.about)} <span class="dim">(${attrs}; known for ${esc(this.skillName(a.signature))})</span>`,
      );
    }
    out += r(
      `Or his own man: ${ch.points.total} points across the attributes, ${ch.points.min} to ${ch.points.max} each.`,
    );
    out += r(
      `Languages: ${ch.languages.map((l) => esc(l.name)).join(", ")}. Points from his Languages skill, 0 to ${LANG_MAX} each: ${LANG_LEVELS.map((w, i) => `${i} ${esc(w)}`).join(", ")}.`,
    );
    out += `<h3>What he can carry</h3>`;
    out += r(`He starts with €${ch.money}.`);
    for (const it of Object.values(ch.items)) {
      const start =
        it.start === "worn"
          ? "he starts wearing it"
          : it.start !== undefined
            ? `he starts with ${it.start === 1 ? "it" : it.start}`
            : "";
      const bonus = it.bonus
        .map(
          (b) =>
            `${esc(this.skillName(b.skill))} ${b.delta > 0 ? "+" : ""}${b.delta}`,
        )
        .join(", ");
      const meta = [
        start,
        bonus ? `${bonus} while ${it.slot === "hand" ? "held" : "worn"}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      out += r(
        `<b>${esc(it.name)}</b>${meta ? ` <span class="dim">(${meta})</span>` : ""}: ${words(it.about)}`,
      );
    }
    return out;
  }

  private carryHtml(): string {
    let k = 0;
    return this.chapter.carry
      .map(
        (c) =>
          `<div class="row plain" id="C.${++k}"><a class="ref" href="#C.${k}">C.${k}</a><div class="tx">${words(c.text)}${c.cond ? ` <span class="meta">only if ${esc(this.cond(c.cond))}</span>` : ""}</div></div>`,
      )
      .join("");
  }

  /** The words painted on things in the places: doors, signs and posters. */
  private placeWordsHtml(): string {
    let k = 0;
    let out = "";
    for (const [key, def] of Object.entries(this.opts.places)) {
      const said: string[] = [];
      const add = (s: string) => {
        if (s && !said.includes(s)) said.push(s);
      };
      for (const h of Object.values(def.hotspots)) {
        if (h.label) add(`${h.to ? "A door" : "A label"}: ${h.label}`);
      }
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (typeof o.text === "string") {
            add(typeof o.sub === "string" ? `${o.text} · ${o.sub}` : o.text);
          } else if (typeof o.sub === "string") add(o.sub);
          for (const [f, x] of Object.entries(o)) {
            if (f !== "text" && f !== "sub") walk(x);
          }
        }
      };
      walk(def.items);
      if (said.length === 0) continue;
      out += `<h3>${esc(def.name)} <code>${esc(key)}</code></h3>`;
      for (const s of said) {
        out += `<div class="row plain" id="D.${++k}"><a class="ref" href="#D.${k}">D.${k}</a><div class="tx">${esc(s)}</div></div>`;
      }
    }
    return out;
  }

  // --- The page -----------------------------------------------------------

  html(): string {
    const ch = this.chapter;
    const groups = new Map<string, SceneInfo[]>();
    for (const g of GROUP_ORDER) groups.set(g, []);
    for (const s of this.info.values()) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group)!.push(s);
    }
    let toc = "";
    let body = "";
    for (const [g, list] of groups) {
      if (list.length === 0) continue;
      const { title, sub } = this.groupTitle(g);
      const gid = `g-${g.replace(/[^a-z0-9]+/g, "-")}`;
      toc += `<li><a href="#${gid}">${esc(title)}</a> <span class="dim">(${list.length})</span><ol>${list
        .map(
          (s) =>
            `<li data-s="S${s.n}"><a href="#S${s.n}">S${s.n} · ${words(s.scene.label)}</a> <code>${esc(s.id)}</code></li>`,
        )
        .join("")}</ol></li>`;
      body += `<section class="group" id="${gid}"><h2>${esc(title)}</h2>${sub ? `<p class="gsub">${esc(sub)}</p>` : ""}${list.map((s) => this.sceneHtml(s)).join("")}</section>`;
    }
    const title = `Mr. Based, chapter ${ch.n}: ${ch.title}`;
    const made = [this.opts.from, this.opts.made].filter(Boolean).join(", ");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: the script</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
<h1>${esc(title)}</h1>
<p class="sum">${words(ch.summary)}</p>
<p class="dim">The whole chapter as a script: every scene in story order, grouped by where it happens, with every line, choice and check, what each needs and where it leads.${made ? ` Made from ${esc(made)}.` : ""}</p>
<div class="howto">
<p><b>Notes:</b> every line has a reference, like <span class="ref-eg">S12.7</span> (scene 12, its seventh line). Write notes as “S12.7: change to …” and paste them in the chat, as with Copy my notes. Tap a reference to copy it with its line.</p>
<p class="legend"><span class="row narr"><span class="tx">Narration</span></span> <span class="row examine"><span class="tx"><span class="tag">Looking</span> What he sees when he looks at something</span></span> <span class="row say"><span class="tx"><b class="who">Someone</b>: what they say</span></span> <span class="row say hero"><span class="tx"><b class="who">Mr. Based</b>: what he says</span></span> <span class="row think"><span class="tx"><span class="tag">Thought</span> His thoughts</span></span> <span class="row voice a1"><span class="tx"><b class="who">Perception, medium 9</b> A skill's voice</span></span> <span class="row hover"><span class="tx"><span class="tag">Hover label</span> The words over a thing</span></span> <span class="row fx"><span class="tx">What he gets, pays, learns</span></span></p>
</div>
</header>
<div class="bar" id="bar">
<input id="q" type="search" placeholder="Search, or S12.7" aria-label="Search the script, or go to a reference such as S12.7 (Enter: the next match)" enterkeyhint="search">
<span id="count" class="dim"></span>
<button type="button" id="open-all">Open all</button>
<button type="button" id="close-all">Close all</button>
</div>
<main>
<nav class="toc"><details open><summary>Contents</summary><ol>
<li><a href="#before">Before the story</a></li>
${toc}
<li><a href="#after">At the end of the chapter</a></li>
<li><a href="#places">Words in the places</a></li>
</ol></details></nav>
<section class="group" id="before"><h2>Before the story</h2><p class="gsub">What the setup screen, his pockets and the cast say.</p>${this.setupHtml()}</section>
${body}
<section class="group" id="after"><h2>At the end of the chapter</h2><p class="gsub">What the end screen says he carries forward.</p>${this.carryHtml()}</section>
<section class="group" id="places"><h2>Words in the places</h2><p class="gsub">Painted on the doors, signs and posters of the 3D places.</p>${this.placeWordsHtml()}</section>
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script>${JS}</script>
</body>
</html>
`;
  }
}

const CSS = `
:root{--bg:#faf8f3;--ink:#1d1b18;--dim:#6b665d;--line:#e4dfd4;--card:#fff;--accent:#7a3b2e;--hero:#f1ebdf;--say:#2c4a6b;--think:#4d5d73;--ex:#f4efe2;--ex-b:#b49a62;--fx:#2f6b45;--flag:#5c6b2f;--goto:#7a3b2e;--hover:#efe9f6;--hover-b:#8a72b5;--news:#22252b;--news-ink:#f2efe6;--a0:#b0466b;--a1:#2f6aa8;--a2:#b07a1e;--hit:#fff1a8}
@media (prefers-color-scheme: dark){:root{--bg:#17181b;--ink:#ebe7df;--dim:#a29d93;--line:#34363b;--card:#202226;--accent:#e0957f;--hero:#2a2723;--say:#9ec1e6;--think:#aab7c9;--ex:#25231e;--ex-b:#a88f58;--fx:#86c99c;--flag:#c2cf8c;--goto:#e8a490;--hover:#28243a;--hover-b:#a993d6;--news:#0d0e10;--news-ink:#e8e4da;--a0:#e57fa2;--a1:#86b5ea;--a2:#e2b25e;--hit:#5a4d12}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 Georgia,"Times New Roman",serif}
a{color:inherit}
code{font:12px/1.2 ui-monospace,Menlo,Consolas,monospace;color:var(--dim)}
.top,main{max-width:50rem;margin:0 auto;padding:0 16px}
.top{padding-top:24px}
h1{font-size:1.6rem;margin:0 0 .3rem;line-height:1.2}
h2{font:600 1.35rem/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;margin:2.2rem 0 .2rem;padding-top:.6rem;border-top:3px solid var(--ink)}
h3{font:600 1rem/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;margin:1.4rem 0 .4rem}
.sum{font-style:italic;margin:.2rem 0 .6rem}
.dim{color:var(--dim)}
.gsub{color:var(--dim);margin:0 0 .8rem;font-style:italic}
.howto{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:12px 0}
.howto p{margin:.3rem 0}
.legend{display:flex;flex-wrap:wrap;gap:6px}
.legend .row{display:inline-block;margin:0;padding:2px 8px;border-radius:4px}
.ref-eg{font:600 12px ui-monospace,Menlo,Consolas,monospace;color:var(--accent)}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 16px;display:flex;gap:6px;align-items:center;justify-content:center}
.bar input{flex:1 1 auto;min-width:0;max-width:30rem;font:16px system-ui,sans-serif;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
.bar button{white-space:nowrap;font:14px system-ui,sans-serif;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);cursor:pointer}
#count{font:13px system-ui,sans-serif;white-space:nowrap}
#count:empty{display:none}
.toc{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;margin-top:16px}
.toc summary{font-weight:600;cursor:pointer}
.toc ol{padding-left:1.2rem;margin:.2rem 0}
.toc li li{list-style:none;margin-left:-1rem}
.toc a{text-decoration:none}
.toc a:hover{text-decoration:underline}
details.scene{border-top:1px solid var(--line);padding:.4rem 0}
details.scene>summary{cursor:pointer;font:600 1.05rem/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;padding:.3rem 0;list-style-position:outside}
.sref{color:var(--accent);font-family:ui-monospace,Menlo,Consolas,monospace}
.shead{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0 0 .4rem}
.starts{margin:.15rem 0}
.tag{font:600 10.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin-right:.3em}
.row{display:flex;gap:.6rem;margin:.25rem 0;padding:.15rem .3rem;border-radius:4px;scroll-margin-top:64px}
.row .ref{flex:0 0 3.4rem;font:600 11.5px/1.9 ui-monospace,Menlo,Consolas,monospace;color:var(--accent);text-decoration:none;cursor:copy;overflow-wrap:anywhere}
.row .tx{flex:1;min-width:0;overflow-wrap:break-word}
.row.hit{background:var(--hit)}
.row:target{outline:2px solid var(--accent)}
.note{font:13.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dim);margin-top:.15rem}
.meta{font:italic 13.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dim)}
.body{margin-left:1.1rem;padding-left:.5rem;border-left:2px solid var(--line)}
.options>.body{margin-bottom:.4rem}
.who{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.92em}
.say .who{color:var(--say)}
.say.hero{background:var(--hero)}
.say.hero .who{color:var(--accent)}
.how{color:var(--dim)}
.lang{font:600 11px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;border:1px solid var(--line);border-radius:3px;padding:0 4px;color:var(--dim)}
.think .tx{font-style:italic;color:var(--think)}
.think .tag{font-style:normal}
.voice .tx{font-style:italic}
.voice .who{font-style:normal}
.voice.a0 .tx{border-left:3px solid var(--a0);padding-left:.45rem}.voice.a0 .who{color:var(--a0)}
.voice.a1 .tx{border-left:3px solid var(--a1);padding-left:.45rem}.voice.a1 .who{color:var(--a1)}
.voice.a2 .tx{border-left:3px solid var(--a2);padding-left:.45rem}.voice.a2 .who{color:var(--a2)}
.voice .note{font-style:normal}
.examine .tx{background:var(--ex);border-left:3px solid var(--ex-b);padding:.1rem .5rem}
.hover .tx{font:14.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.hover .tx{display:inline;flex:0 1 auto;background:var(--hover);border:1px dashed var(--hover-b);border-radius:999px;padding:.1rem .65rem}
.card .tx{font:600 15px/1.4 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-align:center;border:1px solid var(--ink);padding:.3rem}
.news .tx{font:13.5px/1.45 ui-monospace,Menlo,Consolas,monospace;background:var(--news);color:var(--news-ink);padding:.3rem .5rem}
.news .tag{color:var(--news-ink);opacity:.7}
.choice .tx,.look .tx,.ded .tx{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.opt .tx{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.opt b{color:var(--accent)}
.check .tx{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;border:1px solid var(--line);border-radius:6px;padding:.25rem .5rem;background:var(--card)}
.mods{margin:.2rem 0 0;padding-left:1.1rem;font:13.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.cond .tx{font:italic 600 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dim)}
.fx .tx{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fx)}
.fx.flag .tx{color:var(--flag)}
.goto .tx{font:600 14.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--goto)}
.stage .tx{font:italic 13.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dim)}
.nothing{font:italic 13.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dim);margin:.1rem 0 .3rem 4rem}
.resume{font:italic 13.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--goto);margin:.1rem 0 .3rem 4rem}
.plain .tx{font-size:15.5px}
.indent{display:inline-block;width:1rem}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--bg);font:14px system-ui,sans-serif;padding:8px 14px;border-radius:6px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100vw - 32px)}
#toast.on{opacity:1}
[hidden]{display:none!important}
@media (max-width:540px){body{font-size:16px}.bar{padding:6px 10px}.bar button{padding:7px 8px;font-size:13px}#count{position:absolute;right:12px;bottom:-24px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:0 8px}.row{gap:.4rem;padding:.1rem 0}.row .ref{flex-basis:2.9rem;font-size:10.5px}.body{margin-left:.45rem;padding-left:.35rem}.resume{margin-left:3.2rem}}
@media print{:root{--bg:#fff;--ink:#000;--card:#fff;--hero:#f3f3f3;--ex:#f6f6f6;--hover:#f3f3f3;--news:#fff;--news-ink:#000;--hit:transparent}.bar,#toast,.toc{display:none}body{font-size:11pt}.row{break-inside:avoid}h2{break-after:avoid}details.scene>summary{break-after:avoid;list-style:none}a{text-decoration:none}.news .tx{border:1px solid #000}}
`;

const JS = `
(function(){
var q=document.getElementById("q"),count=document.getElementById("count"),toast=document.getElementById("toast");
var scenes=[].slice.call(document.querySelectorAll("details.scene"));
var groups=[].slice.call(document.querySelectorAll("section.group"));
function openTo(id){var el=document.getElementById(id);if(!el)return;var p=el;while(p){if(p.tagName==="DETAILS")p.open=true;p=p.parentElement;}}
function onHash(){var id=decodeURIComponent(location.hash.slice(1));if(id){openTo(id);var el=document.getElementById(id);if(el)el.scrollIntoView();}}
window.addEventListener("hashchange",onHash);onHash();
document.getElementById("open-all").onclick=function(){scenes.forEach(function(s){s.open=true;});};
document.getElementById("close-all").onclick=function(){scenes.forEach(function(s){s.open=false;});};
var timer=0;
function say(t){toast.textContent=t;toast.classList.add("on");clearTimeout(timer);timer=setTimeout(function(){toast.classList.remove("on");},1600);}
function search(){
  var v=q.value.trim().toLowerCase();
  [].forEach.call(document.querySelectorAll(".row.hit"),function(r){r.classList.remove("hit");});
  var lines=0,shown=0;
  scenes.forEach(function(s){
    var n=0;
    if(v){[].forEach.call(s.querySelectorAll(".rows .row"),function(r){if(r.textContent.toLowerCase().indexOf(v)>=0){r.classList.add("hit");n++;}});}
    var head=v&&s.querySelector("summary").textContent.toLowerCase().indexOf(v)>=0;
    var show=!v||n>0||head;
    s.hidden=!show;
    if(v&&show){s.open=true;shown++;lines+=n;}
    var li=document.querySelector('.toc li[data-s="'+s.id+'"]');if(li)li.hidden=!show;
  });
  groups.forEach(function(g){
    if(g.querySelector("details.scene")){g.hidden=!!v&&!g.querySelector("details.scene:not([hidden])");return;}
    // The cast, the setup, what he carries on with, the words in the places.
    var n=0;
    [].forEach.call(g.querySelectorAll(".row"),function(r){var hit=!!v&&r.textContent.toLowerCase().indexOf(v)>=0;if(hit){r.classList.add("hit");n++;}r.hidden=!!v&&!hit;});
    [].forEach.call(g.querySelectorAll("h3"),function(h){var x=h.nextElementSibling,any=false;while(x&&x.tagName!=="H3"){if(x.classList.contains("row")&&!x.hidden)any=true;x=x.nextElementSibling;}h.hidden=!!v&&!any;});
    g.hidden=!!v&&n===0;lines+=n;
  });
  count.textContent=v?(lines+" line"+(lines===1?"":"s")+(shown?" in "+shown+" scene"+(shown===1?"":"s"):"")):"";
}
q.addEventListener("input",function(){clearTimeout(q.t);q.t=setTimeout(search,150);});
var at=-1;
q.addEventListener("input",function(){at=-1;});
q.addEventListener("keydown",function(e){
  if(e.key!=="Enter")return;
  var v=q.value.trim().toUpperCase();
  if(/^S\\d+(\\.\\d+)?$/.test(v)||/^[ACD]\\.\\d+$/.test(v)){q.value="";search();location.hash=v;onHash();return;}
  clearTimeout(q.t);search();
  var hits=document.querySelectorAll(".row.hit");if(!hits.length)return;
  at=(at+1)%hits.length;hits[at].scrollIntoView({block:"center"});
  count.textContent=(at+1)+" of "+hits.length+" lines";
});
document.addEventListener("click",function(e){
  var a=e.target.closest&&e.target.closest(".row .ref");if(!a)return;
  e.preventDefault();
  var row=a.parentElement,tx=row.querySelector(".tx");
  var text=(tx?tx.innerText:"").replace(/\\s+/g," ").trim();
  var bits=[row.getAttribute("data-s"),row.getAttribute("data-l")?"script line "+row.getAttribute("data-l"):""].filter(Boolean).join(", ");
  var out=a.textContent+(bits?" ("+bits+")":"")+": "+text;
  history.replaceState(null,"","#"+a.textContent);
  function done(){say("Copied "+a.textContent);}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out).then(done,function(){fallback(out);});}else fallback(out);
  function fallback(t){var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");done();}catch(_){say("Couldn't copy");}document.body.removeChild(ta);}
});
var was=[];
window.addEventListener("beforeprint",function(){was=scenes.map(function(s){return s.open;});scenes.forEach(function(s){s.open=true;s.hidden=false;});});
window.addEventListener("afterprint",function(){scenes.forEach(function(s,i){s.open=was[i];});search();});
})();
`;

// --- Running it -------------------------------------------------------------

export function loadPlaces(): Record<string, PlaceDef> {
  return Object.fromEntries(
    fs
      .readdirSync(PLACES)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => [
        f.replace(/\.json$/, ""),
        JSON.parse(fs.readFileSync(path.join(PLACES, f), "utf8")) as PlaceDef,
      ]),
  );
}

/** A chapter's script as one HTML page. */
export function scriptHtml(
  n: number,
  extra: Partial<ScriptOptions> = {},
): { html: string; exp: ScriptExport } {
  const file = path.join(STORY, `chapter-${String(n).padStart(2, "0")}.story`);
  const source = fs.readFileSync(file, "utf8");
  const { chapter, errors } = parseChapter(source);
  if (errors.length > 0) {
    throw new Error(
      `${path.basename(file)} has mistakes:\n${errors.map((e) => `  line ${e.line}: ${e.message}`).join("\n")}`,
    );
  }
  const exp = new ScriptExport(chapter, {
    places: extra.places ?? loadPlaces(),
    source,
    from: extra.from,
    made: extra.made,
  });
  return { html: exp.html(), exp };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

function version(file: string): string {
  try {
    const rev = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", file], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    return `${path.relative(ROOT, file)} at ${rev}${dirty ? ", with changes not yet committed" : ""}`;
  } catch {
    return path.relative(ROOT, file);
  }
}

/** Why the page can't be written there (where the site serves or bundles from), or null. */
export function notHere(target: string): string | null {
  const t = path.resolve(target);
  for (const dir of ["static", "out", "dist", "public", "src", "resources"]) {
    const d = path.join(ROOT, dir);
    if (t === d || t.startsWith(d + path.sep)) {
      return `Not into ${dir}/: the script is for reading, and the site mustn't serve it.`;
    }
  }
  return null;
}

function main(): void {
  const n = Number(arg("chapter") ?? "1");
  const out = arg("out");
  if (!Number.isInteger(n) || n < 1 || !out) {
    console.error(
      "npx tsx scripts/based-script.ts --chapter 1 --out /somewhere/script.html",
    );
    process.exit(1);
  }
  const target = path.resolve(out);
  // Never where the site serves from, or what it bundles.
  const no = notHere(target);
  if (no) {
    console.error(no);
    process.exit(1);
  }
  const file = path.join(STORY, `chapter-${String(n).padStart(2, "0")}.story`);
  const { html, exp } = scriptHtml(n, {
    from: version(file),
    made: new Date().toISOString().slice(0, 10),
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(
    `${target}: ${exp.info.size} scenes, ${kb} KB${exp.unworded.size > 0 ? `; flags with no plain words yet: ${[...exp.unworded].join(", ")}` : ""}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
