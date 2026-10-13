// Plays a compiled Mr. Based chapter: steps through a scene's ops until
// something needs the player (a line to read, a choice, a room to read),
// and remembers where it is so the game can be saved.
//
// Saves are taken as each scene begins, not mid-scene, so a save still loads
// after the scene it's in has been rewritten. Pure and deterministic: no
// clock, no randomness, no DOM.

import { evalExpr } from "./Expr";
import { Chapter, END, LineKind, Op } from "./Types";

export interface Stage {
  backdrop: string | null;
  /** Cast id of the framed portrait on screen. */
  figure: string | null;
  ambient: string | null;
  /** The TV's crawl, while it's on. */
  news: string | null;
}

/** Everything needed to start a scene over: what a save holds. */
export interface Snapshot {
  chapter: number;
  scene: string;
  flags: Record<string, number>;
  rels: Record<string, number>;
  stage: Stage;
  /** "s:<scene>" for each scene entered, "c:<choice>=<option>" for each pick. */
  path: string[];
  /** "<choice>/<option>" for options marked once that were taken. */
  taken: string[];
}

export type StoryEvent =
  | { type: "scene"; scene: string; label: string; checkpoint?: string }
  | { type: "rel"; who: string; delta: number }
  | { type: "remember"; who: string }
  | { type: "end" };

export interface LineBeat {
  kind: "line";
  line: LineKind;
  who?: string;
  how?: string;
  text: string;
  src: number;
}

export interface ChoiceBeat {
  kind: "choice";
  id: string;
  prompt: string;
  timer: number;
  options: { id: string; label: string; silent: boolean }[];
  src: number;
}

export interface InvestigateBeat {
  kind: "investigate";
  id: string;
  title: string;
  min: number;
  spots: { id: string; label: string; x: number; y: number; seen: boolean }[];
  deductions: { id: string; label: string; ready: boolean; done: boolean }[];
  canLeave: boolean;
  leave: string;
  src: number;
}

export type Beat =
  | LineBeat
  | { kind: "card"; title: string; sub?: string; src: number }
  | ChoiceBeat
  | InvestigateBeat
  | { kind: "end" };

const MAX_STEPS = 20_000;

function copy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function emptyStage(): Stage {
  return { backdrop: null, figure: null, ambient: null, news: null };
}

/** A snapshot for the very start of a chapter, carrying flags forward. */
export function chapterStart(
  chapter: Chapter,
  carried?: { flags: Record<string, number>; rels: Record<string, number> },
): Snapshot {
  return {
    chapter: chapter.n,
    scene: chapter.start,
    flags: { ...(carried?.flags ?? {}) },
    rels: { ...(carried?.rels ?? {}) },
    stage: emptyStage(),
    path: [],
    taken: [],
  };
}

export class StoryRun {
  private scene = "";
  private ip = 0;
  /** The investigation a spot's text returns to. */
  private ret = -1;
  private flags: Record<string, number>;
  private rels: Record<string, number>;
  private stageNow: Stage;
  private path: string[];
  private taken: string[];
  private entry: Snapshot;
  private beatNow: Beat;
  private pending: StoryEvent[] = [];

  constructor(
    readonly chapter: Chapter,
    from: Snapshot = chapterStart(chapter),
  ) {
    const s = copy(from);
    this.flags = s.flags;
    this.rels = s.rels;
    this.stageNow = s.stage;
    this.path = s.path;
    this.taken = s.taken;
    this.entry = s;
    if (!chapter.scenes[s.scene]) {
      throw new Error(`no scene "${s.scene}" in chapter ${chapter.n}`);
    }
    this.enter(s.scene);
    this.beatNow = this.run();
  }

  get beat(): Beat {
    return this.beatNow;
  }

  get stage(): Stage {
    return { ...this.stageNow };
  }

  get sceneId(): string {
    return this.scene;
  }

  /** The state at the start of the current scene: what to save. */
  snapshot(): Snapshot {
    return copy(this.entry);
  }

  /** Where this run has been so far, scene entries and picks. */
  history(): string[] {
    return [...this.path];
  }

  flag(name: string): number {
    return this.flags[name] ?? 0;
  }

  rel(who: string): number {
    return this.rels[who] ?? 0;
  }

  values(): { flags: Record<string, number>; rels: Record<string, number> } {
    return { flags: { ...this.flags }, rels: { ...this.rels } };
  }

  /** Events since the last call: scenes begun, relationships moved. */
  drain(): StoryEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Past a line or a title card. */
  advance(): Beat {
    const b = this.beatNow;
    if (b.kind !== "line" && b.kind !== "card") return b;
    this.ip++;
    return (this.beatNow = this.run());
  }

  choose(optionId: string): Beat {
    const op = this.op();
    if (op.op !== "choose" || this.beatNow.kind !== "choice") {
      throw new Error("not at a choice");
    }
    if (!this.beatNow.options.some((o) => o.id === optionId)) {
      throw new Error(`"${optionId}" isn't one of the options`);
    }
    const opt = op.options.find((o) => o.id === optionId)!;
    this.path.push(`c:${op.id}=${opt.id}`);
    if (opt.once) this.taken.push(`${op.id}/${opt.id}`);
    this.ip = opt.at;
    return (this.beatNow = this.run());
  }

  /** The clock ran out: say nothing, or take the first option. */
  timeout(): Beat {
    const b = this.beatNow;
    if (b.kind !== "choice") return b;
    const pick = b.options.find((o) => o.silent) ?? b.options[0];
    return this.choose(pick.id);
  }

  examine(spotId: string): Beat {
    const op = this.op();
    if (op.op !== "investigate") throw new Error("not investigating");
    const spot = op.spots.find((s) => s.id === spotId);
    if (spot === undefined) throw new Error(`no spot "${spotId}"`);
    this.flags[spot.id] = 1;
    this.ret = this.ip;
    this.ip = spot.at;
    return (this.beatNow = this.run());
  }

  deduce(id: string): Beat {
    const op = this.op();
    if (op.op !== "investigate") throw new Error("not investigating");
    const d = op.deductions.find((x) => x.id === id);
    if (d === undefined) throw new Error(`no deduction "${id}"`);
    if (!d.needs.every((n) => this.flags[n])) {
      throw new Error(`"${id}" isn't ready yet`);
    }
    this.flags[d.id] = 1;
    this.ret = this.ip;
    this.ip = d.at;
    return (this.beatNow = this.run());
  }

  leave(): Beat {
    const op = this.op();
    const b = this.beatNow;
    if (op.op !== "investigate" || b.kind !== "investigate") {
      throw new Error("not investigating");
    }
    if (!b.canLeave) throw new Error("look at more first");
    this.ip = op.after;
    return (this.beatNow = this.run());
  }

  private op(): Op {
    return this.chapter.scenes[this.scene].ops[this.ip];
  }

  private enter(id: string): void {
    const scene = this.chapter.scenes[id];
    this.entry = {
      chapter: this.chapter.n,
      scene: id,
      flags: copy(this.flags),
      rels: copy(this.rels),
      stage: copy(this.stageNow),
      path: [...this.path],
      taken: [...this.taken],
    };
    this.scene = id;
    this.ip = 0;
    this.ret = -1;
    this.path.push(`s:${id}`);
    this.pending.push({
      type: "scene",
      scene: id,
      label: scene.label,
      checkpoint: scene.checkpoint,
    });
  }

  private run(): Beat {
    const vals = () => ({ flags: this.flags, rels: this.rels });
    for (let steps = 0; steps < MAX_STEPS; steps++) {
      const op = this.op();
      if (op === undefined) {
        throw new Error(`scene "${this.scene}" ran out of ops`);
      }
      switch (op.op) {
        case "line":
          return {
            kind: "line",
            line: op.kind,
            who: op.who,
            how: op.how,
            text: op.text,
            src: op.src,
          };
        case "card":
          return { kind: "card", title: op.title, sub: op.sub, src: op.src };
        case "news":
          this.stageNow.news = op.text;
          this.ip++;
          break;
        case "backdrop":
          this.stageNow.backdrop = op.key;
          this.ip++;
          break;
        case "figure":
          this.stageNow.figure = op.who;
          this.ip++;
          break;
        case "ambient":
          this.stageNow.ambient = op.key;
          this.ip++;
          break;
        case "set":
          this.flags[op.flag] = op.add
            ? (this.flags[op.flag] ?? 0) + op.value
            : op.value;
          if (this.flags[op.flag] === 0) delete this.flags[op.flag];
          this.ip++;
          break;
        case "rel":
          this.rels[op.who] = (this.rels[op.who] ?? 0) + op.delta;
          this.pending.push({ type: "rel", who: op.who, delta: op.delta });
          this.ip++;
          break;
        case "remember":
          this.pending.push({ type: "remember", who: op.who });
          this.ip++;
          break;
        case "if":
          this.ip = evalExpr(op.cond, vals()) ? this.ip + 1 : op.else;
          break;
        case "jump":
          this.ip = op.to;
          break;
        case "goto":
          if (op.scene === END) {
            this.pending.push({ type: "end" });
            return { kind: "end" };
          }
          this.enter(op.scene);
          break;
        case "choose": {
          const options = op.options
            .filter(
              (o) =>
                (!o.once || !this.taken.includes(`${op.id}/${o.id}`)) &&
                (o.cond === undefined || evalExpr(o.cond, vals())),
            )
            .map((o) => ({ id: o.id, label: o.label, silent: o.silent }));
          return {
            kind: "choice",
            id: op.id,
            prompt: op.prompt,
            timer: op.timer,
            options,
            src: op.src,
          };
        }
        case "investigate": {
          const spots = op.spots.map((s) => ({
            id: s.id,
            label: s.label,
            x: s.x,
            y: s.y,
            seen: !!this.flags[s.id],
          }));
          const seen = spots.filter((s) => s.seen).length;
          return {
            kind: "investigate",
            id: op.id,
            title: op.title,
            min: op.min,
            spots,
            deductions: op.deductions.map((d) => ({
              id: d.id,
              label: d.label,
              ready: d.needs.every((n) => !!this.flags[n]),
              done: !!this.flags[d.id],
            })),
            canLeave: seen >= Math.min(op.min, spots.length),
            leave: op.leave,
            src: op.src,
          };
        }
        case "return":
          this.ip = this.ret;
          this.ret = -1;
          break;
        case "fall":
          throw new Error(`scene "${this.scene}" runs off its end`);
      }
    }
    throw new Error(`scene "${this.scene}" loops without stopping`);
  }
}
