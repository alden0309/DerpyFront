// Plays a compiled Mr. Based chapter: steps through a scene's ops until
// something needs the player (a line to read, a choice, a room to read, a
// roll of the dice), and remembers where it is so the game can be saved.
//
// Saves are taken as each scene begins, not mid-scene, so a save still loads
// after the scene it's in has been rewritten. Pure and deterministic: no
// clock, no Math.random. The dice come from a seed kept in the save (Dice.ts).

import { chance, passes, passive, percent, rollDice, tierName } from "./Dice";
import { evalExpr, Values } from "./Expr";
import { Boost, defaultBuild, skillValues } from "./Skills";
import {
  ActorState,
  Build,
  Chapter,
  CheckSpec,
  Deduction,
  END,
  LineKind,
  Op,
} from "./Types";

export interface Stage {
  backdrop: string | null;
  /** Cast id of the framed portrait on screen. */
  figure: string | null;
  ambient: string | null;
  /** The TV's crawl, while it's on. */
  news: string | null;
  /** r21: the 3D place, or null for a flat picture. */
  place: string | null;
  /** Who stands where in the place, and how. */
  actors: Record<string, ActorState>;
  /** A camera shot of the place, or null to follow him. */
  focus: string | null;
  /** A painted memory shown in the dialogue column. */
  vignette: string | null;
  /** The place's props switched on (true) or off (false) by the story. */
  props: Record<string, boolean>;
}

/** What's known of a check after it's been tried. */
export interface CheckMemo {
  tries: number;
  result: "pass" | "fail";
  /** The bonus it was last tried with: a white check opens again above it. */
  bonus: number;
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
  /** r21: his build (null until the setup screen), boosts, dice, checks. */
  build?: Build | null;
  boosts?: Boost[];
  seed?: number;
  checks?: Record<string, CheckMemo>;
}

export type StoryEvent =
  | { type: "scene"; scene: string; label: string; checkpoint?: string }
  | { type: "rel"; who: string; delta: number }
  | { type: "remember"; who: string }
  | { type: "actor"; who: string; state: ActorState | null; walk: boolean }
  | { type: "prop"; key: string; on: boolean }
  | { type: "gesture"; who: string; name: string }
  | { type: "boost"; skill: string; delta: number; why: string }
  | { type: "end" };

/** A check as the column shows it, before it's rolled. */
export interface CheckView {
  skill: string;
  diff: number;
  tier: string;
  kind: "white" | "red";
  /** The skill's value. */
  base: number;
  /** Modifiers that apply now. */
  mods: { delta: number; why: string }[];
  /** base + mods: what's added to the dice. */
  bonus: number;
  /** 0 to 1, and as a whole percent. */
  chance: number;
  percent: number;
  tries: number;
  /** A failed white check waits for something to change; red ones are gone. */
  locked: boolean;
}

export interface LineBeat {
  kind: "line";
  line: LineKind;
  who?: string;
  how?: string;
  text: string;
  /** r21: spoken by one of his skills; `diff` when it was a passive check. */
  voice?: { skill: string; diff?: number; tier?: string };
  src: number;
}

export interface ChoiceBeat {
  kind: "choice";
  id: string;
  prompt: string;
  timer: number;
  options: {
    id: string;
    label: string;
    silent: boolean;
    check?: CheckView;
  }[];
  src: number;
}

export interface InvestigateBeat {
  kind: "investigate";
  id: string;
  title: string;
  min: number;
  spots: {
    id: string;
    label: string;
    x: number;
    y: number;
    anchor?: string;
    seen: boolean;
  }[];
  deductions: {
    id: string;
    label: string;
    ready: boolean;
    done: boolean;
    check?: CheckView;
  }[];
  canLeave: boolean;
  leave: string;
  still: boolean;
  exit?: string;
  src: number;
}

/** The dice, or a passive check's verdict, before its outcome plays. */
export interface RollBeat {
  kind: "roll";
  id: string;
  /** What was tried: the option's or the deduction's label. */
  label: string;
  skill: string;
  diff: number;
  tier: string;
  kind2: "white" | "red";
  /** Null for a passive check (no dice). */
  dice: [number, number] | null;
  base: number;
  mods: { delta: number; why: string }[];
  bonus: number;
  total: number;
  pass: boolean;
  /** Double six or double one. */
  crit: "six" | "one" | null;
  chance: number;
  src: number;
}

export type Beat =
  | LineBeat
  | { kind: "card"; title: string; sub?: string; src: number }
  | ChoiceBeat
  | InvestigateBeat
  | RollBeat
  | { kind: "end" };

const MAX_STEPS = 20_000;

function copy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function emptyStage(): Stage {
  return {
    backdrop: null,
    figure: null,
    ambient: null,
    news: null,
    place: null,
    actors: {},
    focus: null,
    vignette: null,
    props: {},
  };
}

/** A snapshot for the very start of a chapter, carrying flags forward. */
export function chapterStart(
  chapter: Chapter,
  carried?: {
    flags: Record<string, number>;
    rels: Record<string, number>;
    build?: Build | null;
    boosts?: Boost[];
  },
  opts: { build?: Build | null; seed?: number } = {},
): Snapshot {
  return {
    chapter: chapter.n,
    scene: chapter.start,
    flags: { ...(carried?.flags ?? {}) },
    rels: { ...(carried?.rels ?? {}) },
    stage: emptyStage(),
    path: [],
    taken: [],
    build: opts.build ?? carried?.build ?? null,
    boosts: [...(carried?.boosts ?? [])],
    seed: opts.seed ?? 1,
    checks: {},
  };
}

export class StoryRun {
  private scene = "";
  private ip = 0;
  /** The investigation a spot's text returns to. */
  private ret = -1;
  /** Where a roll goes on to, once the player has seen the dice. */
  private afterRoll = -1;
  private flags: Record<string, number>;
  private rels: Record<string, number>;
  private stageNow: Stage;
  private path: string[];
  private taken: string[];
  private buildNow: Build | null;
  private boostList: Boost[];
  private seed: number;
  private checks: Record<string, CheckMemo>;
  private entry: Snapshot;
  private beatNow: Beat;
  private pending: StoryEvent[] = [];

  constructor(
    readonly chapter: Chapter,
    from: Snapshot = chapterStart(chapter),
  ) {
    const s = copy(from);
    // Saves from before r21 have none of these.
    s.stage = { ...emptyStage(), ...s.stage };
    s.build ??= null;
    s.boosts ??= [];
    s.seed ??= 1;
    s.checks ??= {};
    this.flags = s.flags;
    this.rels = s.rels;
    this.stageNow = s.stage;
    this.path = s.path;
    this.taken = s.taken;
    this.buildNow = s.build;
    this.boostList = s.boosts;
    this.seed = s.seed;
    this.checks = s.checks;
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
    return copy(this.stageNow);
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

  /** His build (the chapter's first archetype until one is chosen). */
  get build(): Build {
    return this.buildNow ?? defaultBuild(this.chapter);
  }

  get boosts(): Boost[] {
    return copy(this.boostList);
  }

  /** Every skill's value now, boosts included. */
  skills(): Record<string, number> {
    return skillValues(this.chapter, this.buildNow, this.boostList);
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

  /** Past a line, a title card or the dice. */
  advance(): Beat {
    const b = this.beatNow;
    if (b.kind === "roll") {
      this.ip = this.afterRoll;
      this.afterRoll = -1;
      return (this.beatNow = this.run());
    }
    if (b.kind !== "line" && b.kind !== "card") return b;
    this.ip++;
    return (this.beatNow = this.run());
  }

  choose(optionId: string): Beat {
    const op = this.op();
    if (op.op !== "choose" || this.beatNow.kind !== "choice") {
      throw new Error("not at a choice");
    }
    const shown = this.beatNow.options.find((o) => o.id === optionId);
    if (shown === undefined) {
      throw new Error(`"${optionId}" isn't one of the options`);
    }
    if (shown.check?.locked) throw new Error(`"${optionId}" is locked`);
    const opt = op.options.find((o) => o.id === optionId)!;
    this.path.push(`c:${op.id}=${opt.id}`);
    if (opt.once) this.taken.push(`${op.id}/${opt.id}`);
    this.ip = opt.at;
    return (this.beatNow = this.run());
  }

  /** The clock ran out: say nothing, or take the first open option. */
  timeout(): Beat {
    const b = this.beatNow;
    if (b.kind !== "choice") return b;
    const open = b.options.filter((o) => !o.check?.locked);
    const pick = open.find((o) => o.silent) ?? open[0];
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
    if (this.flags[d.id]) throw new Error(`"${id}" is already worked out`);
    this.ret = this.ip;
    if (d.check) {
      const view = this.dedView(op, d);
      if (view.locked) throw new Error(`"${id}" is locked`);
      return (this.beatNow = this.roll(
        `${op.id}:${d.id}`,
        d.label,
        d.check,
        view,
        d.at,
        d.failAt ?? -1,
        () => (this.flags[d.id] = 1),
        op.src,
      ));
    }
    this.flags[d.id] = 1;
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

  // --- checks ---------------------------------------------------------------

  private vals(): Values {
    return { flags: this.flags, rels: this.rels, skills: this.skills() };
  }

  /** A check's odds now, with `extra` modifiers on top of its own. */
  checkView(
    id: string,
    spec: CheckSpec,
    extra: { delta: number; why: string }[] = [],
  ): CheckView {
    const v = this.vals();
    const base = v.skills![spec.skill] ?? 0;
    const mods = [
      ...spec.mods
        .filter((m) => m.cond === undefined || evalExpr(m.cond, v))
        .map((m) => ({ delta: m.delta, why: m.why })),
      ...extra,
    ];
    const bonus = base + mods.reduce((a, m) => a + m.delta, 0);
    const memo = this.checks[id];
    const locked =
      memo !== undefined &&
      (memo.result === "pass" || spec.kind === "red" || bonus <= memo.bonus);
    return {
      skill: spec.skill,
      diff: spec.diff,
      tier: tierName(spec.diff),
      kind: spec.kind,
      base,
      mods,
      bonus,
      chance: chance(bonus, spec.diff),
      percent: percent(bonus, spec.diff),
      tries: memo?.tries ?? 0,
      locked,
    };
  }

  /** A deduction's odds: a step easier for each other thing noticed. */
  private dedView(
    op: Extract<Op, { op: "investigate" }>,
    d: Deduction,
  ): CheckView {
    const others = op.spots.filter(
      (s) => this.flags[s.id] && !d.needs.includes(s.id),
    ).length;
    const extra =
      others > 0
        ? [{ delta: others, why: "Everything else you've noticed" }]
        : [];
    return this.checkView(`${op.id}:${d.id}`, d.check!, extra);
  }

  /** Rolls a check now; the outcome plays once the dice have been seen. */
  private roll(
    id: string,
    label: string,
    spec: CheckSpec,
    view: CheckView,
    passAt: number,
    failAt: number,
    onPass: () => void,
    src: number,
  ): RollBeat {
    const attempt = this.checks[id]?.tries ?? 0;
    const [a, b] = rollDice(this.seed, id, attempt);
    const pass = passes(a, b, view.bonus, spec.diff);
    this.checks[id] = {
      tries: attempt + 1,
      result: pass ? "pass" : "fail",
      bonus: view.bonus,
    };
    if (pass) onPass();
    this.afterRoll = pass ? passAt : failAt;
    return {
      kind: "roll",
      id,
      label,
      skill: spec.skill,
      diff: spec.diff,
      tier: view.tier,
      kind2: spec.kind,
      dice: [a, b],
      base: view.base,
      mods: view.mods,
      bonus: view.bonus,
      total: a + b + view.bonus,
      pass,
      crit: a === 6 && b === 6 ? "six" : a === 1 && b === 1 ? "one" : null,
      chance: view.chance,
      src,
    };
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
      build: copy(this.buildNow),
      boosts: copy(this.boostList),
      seed: this.seed,
      checks: copy(this.checks),
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
    for (let steps = 0; steps < MAX_STEPS; steps++) {
      const op = this.op();
      if (op === undefined) {
        throw new Error(`scene "${this.scene}" ran out of ops`);
      }
      switch (op.op) {
        case "line": {
          if (op.skill !== undefined && op.diff !== undefined) {
            // A passive check: the voice speaks only if the skill is up to it.
            if (!passive(this.skills()[op.skill] ?? 0, op.diff)) {
              this.ip++;
              break;
            }
          }
          const beat: LineBeat = {
            kind: "line",
            line: op.kind,
            who: op.who,
            how: op.how,
            text: op.text,
            src: op.src,
          };
          if (op.skill !== undefined) {
            beat.voice = { skill: op.skill };
            if (op.diff !== undefined) {
              beat.voice.diff = op.diff;
              beat.voice.tier = tierName(op.diff);
            }
          }
          return beat;
        }
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
        case "place":
          this.stageNow.place = op.key;
          this.ip++;
          break;
        case "focus":
          this.stageNow.focus = op.key;
          this.ip++;
          break;
        case "vignette":
          this.stageNow.vignette = op.key;
          this.ip++;
          break;
        case "actor":
          if (op.state === null) delete this.stageNow.actors[op.who];
          else this.stageNow.actors[op.who] = { ...op.state };
          this.pending.push({
            type: "actor",
            who: op.who,
            state: op.state ? { ...op.state } : null,
            walk: op.walk,
          });
          this.ip++;
          break;
        case "gesture":
          this.pending.push({ type: "gesture", who: op.who, name: op.name });
          this.ip++;
          break;
        case "prop":
          this.stageNow.props[op.key] = op.on;
          this.pending.push({ type: "prop", key: op.key, on: op.on });
          this.ip++;
          break;
        case "boost":
          this.boostList.push({
            skill: op.skill,
            delta: op.delta,
            why: op.why,
          });
          this.pending.push({
            type: "boost",
            skill: op.skill,
            delta: op.delta,
            why: op.why,
          });
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
          this.ip = evalExpr(op.cond, this.vals()) ? this.ip + 1 : op.else;
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
        case "check": {
          const view = this.checkView(op.id, op.spec);
          return this.roll(
            op.id,
            op.label,
            op.spec,
            view,
            this.ip + 1,
            op.fail,
            () => {},
            op.src,
          );
        }
        case "choose": {
          const v = this.vals();
          const options: ChoiceBeat["options"] = [];
          for (const o of op.options) {
            if (o.once && this.taken.includes(`${op.id}/${o.id}`)) continue;
            if (o.cond !== undefined && !evalExpr(o.cond, v)) continue;
            const shown: ChoiceBeat["options"][number] = {
              id: o.id,
              label: o.label,
              silent: o.silent,
            };
            if (o.check) {
              const id = `${op.id}/${o.id}`;
              const view = this.checkView(id, o.check);
              const memo = this.checks[id];
              // Passed, or a red check tried: gone. A failed white check
              // stays, locked, until something changes.
              if (memo && (memo.result === "pass" || o.check.kind === "red")) {
                continue;
              }
              shown.check = view;
            }
            options.push(shown);
          }
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
          // A deduction his skill sees at once speaks up by itself.
          for (const d of op.deductions) {
            if (
              d.check &&
              !this.flags[d.id] &&
              this.checks[`${op.id}:${d.id}`] === undefined &&
              d.needs.every((n) => this.flags[n])
            ) {
              const view = this.dedView(op, d);
              if (passive(view.bonus, d.check.diff)) {
                this.flags[d.id] = 1;
                this.checks[`${op.id}:${d.id}`] = {
                  tries: 0,
                  result: "pass",
                  bonus: view.bonus,
                };
                this.ret = this.ip;
                this.afterRoll = d.at;
                return {
                  kind: "roll",
                  id: `${op.id}:${d.id}`,
                  label: d.label,
                  skill: d.check.skill,
                  diff: d.check.diff,
                  tier: view.tier,
                  kind2: d.check.kind,
                  dice: null,
                  base: view.base,
                  mods: view.mods,
                  bonus: view.bonus,
                  total: view.bonus + 6,
                  pass: true,
                  crit: null,
                  chance: 1,
                  src: op.src,
                };
              }
            }
          }
          const spots = op.spots.map((s) => ({
            id: s.id,
            label: s.label,
            x: s.x,
            y: s.y,
            anchor: s.anchor,
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
              check: d.check ? this.dedView(op, d) : undefined,
            })),
            canLeave: seen >= Math.min(op.min, spots.length),
            leave: op.leave,
            still: op.still,
            exit: op.exit,
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
