// Plays a compiled Mr. Based chapter: steps through a scene's ops until
// something needs the player (a line to read, a choice, a room to read, a
// roll of the dice), and remembers where it is so the game can be saved.
//
// r22: the open world. Once a scene says `-> FREE` he's free: the player
// walks him where they like, and the story waits for something to start a
// scene (`@on`): talking to someone, looking at something, walking into a
// place, a thought that has come to him, or a condition coming true. Each
// person and thing answers with the first scene, in the order they're
// written, whose condition holds.
//
// A save holds the state at the start of the scene he's in, or, while he's
// free, the state as it is: a save still loads after the scene it's in has
// been rewritten. Pure and deterministic: no clock, no Math.random. The
// dice come from a seed kept in the save (Dice.ts); the in-game clock moves
// with what's read and chosen, not with real time.

import { chance, passes, passive, percent, rollDice, tierName } from "./Dice";
import { evalExpr, Values } from "./Expr";
import {
  Boost,
  defaultBuild,
  LANGUAGES_SKILL,
  skillValues,
  withLanguages,
} from "./Skills";
import {
  ActorState,
  Build,
  Chapter,
  CheckSpec,
  Deduction,
  END,
  FREE,
  LineKind,
  Op,
  Scene,
  TaskState,
  Trigger,
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
  /** Who stands where (r22: in which place), and how. */
  actors: Record<string, ActorState>;
  /** A camera shot of the place, or null to follow him. */
  focus: string | null;
  /** A painted memory shown in the dialogue column. */
  vignette: string | null;
  /** The place's props switched on (true) or off (false) by the story. */
  props: Record<string, boolean>;
  /** r22: the weather the story has asked for, or null for the place's. */
  weather: string | null;
}

/** What's known of a check after it's been tried. */
export interface CheckMemo {
  tries: number;
  result: "pass" | "fail";
  /** The bonus it was last tried with: a white check opens again above it. */
  bonus: number;
}

/** Everything needed to start a scene over (or, free, to carry on). */
export interface Snapshot {
  chapter: number;
  /** The scene he's in, or FREE. */
  scene: string;
  flags: Record<string, number>;
  rels: Record<string, number>;
  stage: Stage;
  /**
   * "s:<scene>" for each scene entered, "c:<choice>=<option>" for each pick.
   * r22: only the latest steps are kept in a save (SAVED_PATH).
   */
  path: string[];
  /** "<choice>/<option>" for options marked once that were taken. */
  taken: string[];
  /** r21: his build (null until the setup screen), boosts, dice, checks. */
  build?: Build | null;
  boosts?: Boost[];
  seed?: number;
  checks?: Record<string, CheckMemo>;
  /** r22: scenes started by a once `@on` that have played. */
  done?: string[];
  /** r22: his journal, in the order things were set. */
  tasks?: Record<string, TaskState>;
  /** r22: the in-game clock, in seconds from midnight on the first night. */
  clock?: number;
  /**
   * r22: what he carries, by item id and how many. Nothing fills it yet:
   * it's here so saves already have a place for an inventory.
   */
  inv?: Record<string, number>;
}

export type StoryEvent =
  | { type: "scene"; scene: string; label: string }
  | { type: "free" }
  | { type: "rel"; who: string; delta: number }
  | { type: "remember"; who: string }
  | { type: "actor"; who: string; state: ActorState | null; walk: boolean }
  | { type: "prop"; key: string; on: boolean }
  | { type: "gesture"; who: string; name: string }
  | { type: "boost"; skill: string; delta: number; why: string }
  | { type: "task"; id: string; text: string; done: boolean; fresh: boolean }
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
  /**
   * r22: said in another language. `understood` when he speaks it (or his
   * Languages got the gist: `via` "skill"); then `text` is the meaning and
   * `original` what was said. Otherwise `text` is what was said.
   */
  lang?: {
    code: string;
    name: string;
    understood: boolean;
    original: string;
    via?: "skill";
    tier?: string;
    diff?: number;
  };
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
  /** r22: he's free; the story waits for the player to start something. */
  | { kind: "free" }
  | { kind: "end" };

/** What the player can start, where he is, while he's free. */
export interface Available {
  /** Cast ids with something to say (or to be said to). */
  talk: string[];
  /** Hotspots with something to see. */
  look: string[];
  /** Thoughts he can follow, by scene id. */
  think: { id: string; label: string }[];
}

const MAX_STEPS = 20_000;
/** Steps of the path kept in memory, and in a save. */
const MAX_PATH = 4000;
export const SAVED_PATH = 300;
/** How long a line and a choice take, in game seconds. */
export const LINE_SECONDS = 20;
export const CHOICE_SECONDS = 10;
const DAY = 24 * 3600;

function copy<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
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
    weather: null,
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
    done: [],
    tasks: {},
    clock: chapter.clock * 60,
  };
}

/** "21:40", and the night it is (0 the first). */
export function clockText(seconds: number): { time: string; day: number } {
  const day = Math.floor(seconds / DAY);
  const s = seconds - day * DAY;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return {
    time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    day,
  };
}

/**
 * Each scene's trigger, by what starts it, for quick lookups: talk and look
 * by who or what, and by place too where the trigger names one ("thing" and
 * "thing@street"), so a long game with the same hotspot names in many
 * places asks only the scenes of the place he's in.
 */
interface TriggerIndex {
  talk: Map<string, string[]>;
  look: Map<string, string[]>;
  enter: Map<string, string[]>;
  think: string[];
  auto: string[];
  /** Where each scene is written, to keep written order across lists. */
  order: Map<string, number>;
  /** Every thing something can be looked at for. */
  things: Set<string>;
}

const indexes = new WeakMap<Chapter, TriggerIndex>();

function triggerIndex(ch: Chapter): TriggerIndex {
  let idx = indexes.get(ch);
  if (idx) return idx;
  idx = {
    talk: new Map(),
    look: new Map(),
    enter: new Map(),
    think: [],
    auto: [],
    order: new Map(),
    things: new Set(),
  };
  ch.order.forEach((id, i) => {
    idx!.order.set(id, i);
    const t = ch.scenes[id].trigger;
    if (!t) return;
    if (t.on === "think" || t.on === "auto") idx![t.on].push(id);
    else {
      const m = idx![t.on];
      const key =
        t.on !== "enter" && t.place !== undefined
          ? `${t.target}@${t.place}`
          : t.target!;
      const list = m.get(key) ?? [];
      list.push(id);
      m.set(key, list);
      if (t.on === "look") idx!.things.add(t.target!);
    }
  });
  indexes.set(ch, idx);
  return idx;
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
  private doneList: string[];
  private doneSet: Set<string>;
  private taskList: Record<string, TaskState>;
  private clockNow: number;
  private inv: Record<string, number>;
  private entry: Snapshot;
  /** Steps of the path dropped from its front (MAX_PATH), and where it stood. */
  private trimmed = 0;
  private entryPath = 0;
  private beatNow: Beat;
  private pending: StoryEvent[] = [];
  private readonly idx: TriggerIndex;
  readonly hero: string;

  constructor(
    readonly chapter: Chapter,
    from: Snapshot = chapterStart(chapter),
  ) {
    const s = copy(from);
    // Saves from before r21 and r22 have none of these.
    s.stage = { ...emptyStage(), ...s.stage };
    s.build = s.build ? withLanguages(chapter, s.build) : null;
    s.boosts ??= [];
    s.seed ??= 1;
    s.checks ??= {};
    s.done ??= [];
    s.tasks ??= {};
    s.clock ??= chapter.clock * 60;
    s.inv ??= {};
    this.flags = s.flags;
    this.rels = s.rels;
    this.stageNow = s.stage;
    this.path = s.path;
    this.taken = s.taken;
    this.buildNow = s.build;
    this.boostList = s.boosts;
    this.seed = s.seed;
    this.checks = s.checks;
    this.doneList = s.done;
    this.doneSet = new Set(s.done);
    this.taskList = s.tasks;
    this.clockNow = s.clock;
    this.inv = s.inv;
    this.entry = s;
    this.entryPath = s.path.length;
    this.idx = triggerIndex(chapter);
    this.hero = chapter.cast[0]?.id ?? "";
    if (s.scene === FREE) {
      this.scene = FREE;
      this.ip = -1;
      this.beatNow = { kind: "free" };
      return;
    }
    if (!chapter.scenes[s.scene]) {
      throw new Error(`no scene "${s.scene}" in chapter ${chapter.n}`);
    }
    this.begin(s.scene, false);
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

  /** r22: free to go where he likes. */
  get free(): boolean {
    return this.scene === FREE;
  }

  /** The state at the start of the current scene (or now, if he's free). */
  snapshot(): Snapshot {
    const s = this.free ? this.capture(FREE) : copy(this.entry);
    // The path as it stood then: only its latest steps.
    const end = this.free
      ? this.path.length
      : Math.max(0, this.entryPath - this.trimmed);
    s.path = this.path.slice(Math.max(0, end - SAVED_PATH), end);
    return s;
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

  /** r22: his journal, in the order its entries were first set. */
  get tasks(): { id: string; text: string; done: boolean }[] {
    return Object.entries(this.taskList).map(([id, t]) => ({ id, ...t }));
  }

  /** r22: the in-game clock, in seconds. */
  get clock(): number {
    return this.clockNow;
  }

  /** r22: what he carries (empty until the story gives him things). */
  get items(): Record<string, number> {
    return { ...this.inv };
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
    this.step(`c:${op.id}=${opt.id}`);
    if (opt.once) this.taken.push(`${op.id}/${opt.id}`);
    this.clockNow += CHOICE_SECONDS;
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

  // --- the open world (r22) -------------------------------------------------

  private matches(id: string, v?: Values): boolean {
    const t = this.chapter.scenes[id].trigger as Trigger;
    if (t.once && this.doneSet.has(id)) return false;
    if (t.place !== undefined && t.place !== this.stageNow.place) return false;
    return t.cond === undefined || !!evalExpr(t.cond, v ?? this.vals());
  }

  /** The cast ids a body answers to (one person can go by two names). */
  private namesOf(who: string): string[] {
    const out = [who];
    for (const c of this.chapter.cast) {
      if (c.body === who && c.id !== who) out.push(c.id);
      if (c.id === who && c.body && !out.includes(c.body)) out.push(c.body);
    }
    return out;
  }

  /** The first scene, in written order, of those listed under the keys. */
  private first(
    m: Map<string, string[]>,
    keys: string[],
    v?: Values,
  ): string | null {
    let best: string | null = null;
    let at = Infinity;
    for (const k of keys) {
      for (const id of m.get(k) ?? []) {
        const o = this.idx.order.get(id)!;
        if (o >= at) break;
        if (this.matches(id, v)) {
          best = id;
          at = o;
          break;
        }
      }
    }
    return best;
  }

  /** The scene talking to someone starts now, if any. */
  private talkScene(who: string, v?: Values): string | null {
    const here = this.stageNow.place;
    const keys: string[] = [];
    for (const name of this.namesOf(who)) {
      keys.push(name);
      if (here) keys.push(`${name}@${here}`);
    }
    return this.first(this.idx.talk, keys, v);
  }

  private lookScene(thing: string, v?: Values): string | null {
    const here = this.stageNow.place;
    return this.first(
      this.idx.look,
      here ? [thing, `${thing}@${here}`] : [thing],
      v,
    );
  }

  /**
   * What he can start where he is (only while he's free). `things`: the
   * hotspots of the place he's in (the world knows them); without it every
   * thing in the story is asked, which a long game shouldn't do often.
   */
  available(things?: Iterable<string>): Available {
    const out: Available = { talk: [], look: [], think: [] };
    if (!this.free) return out;
    const v = this.vals();
    const here = this.stageNow.place;
    for (const [who, st] of Object.entries(this.stageNow.actors)) {
      if (who === this.hero || (st.place ?? here) !== here) continue;
      if (this.talkScene(who, v)) out.talk.push(who);
    }
    for (const thing of things ?? this.idx.things) {
      if (this.lookScene(thing, v)) out.look.push(thing);
    }
    for (const id of this.idx.think) {
      if (this.matches(id, v)) {
        out.think.push({
          id,
          label: this.chapter.scenes[id].trigger!.label ?? id,
        });
      }
    }
    return out;
  }

  /** He goes up to someone: their scene, or null if they've nothing. */
  talk(who: string): Beat | null {
    if (!this.free) return null;
    const id = this.talkScene(who);
    return id ? this.startFree(id) : null;
  }

  /** He looks at something: its scene, or null if there's nothing to see. */
  look(thing: string): Beat | null {
    if (!this.free) return null;
    const id = this.lookScene(thing);
    return id ? this.startFree(id) : null;
  }

  /** He follows a thought that has come to him. */
  think(id: string): Beat {
    if (!this.free) throw new Error("not free");
    const t = this.chapter.scenes[id]?.trigger;
    if (t?.on !== "think" || !this.matches(id)) {
      throw new Error(`"${id}" isn't a thought he can have now`);
    }
    return this.startFree(id);
  }

  /**
   * He walks into a place (through a door), arriving at a mark. Anything
   * that starts on arriving there starts.
   */
  enterPlace(place: string, mark: string): Beat {
    if (!this.free) throw new Error("not free");
    this.stageNow.place = place;
    this.stageNow.focus = null;
    this.stageNow.actors[this.hero] = {
      ...(this.stageNow.actors[this.hero] ?? {}),
      at: mark,
      pose: "stand",
      place,
    };
    for (const id of this.idx.enter.get(place) ?? []) {
      if (this.matches(id)) return this.startFree(id);
    }
    return (this.beatNow = this.settleFree());
  }

  private startFree(id: string): Beat {
    this.begin(id, true);
    return (this.beatNow = this.run());
  }

  /** Free again: anything that happens by itself now happens. */
  private settleFree(): Beat {
    for (const id of this.idx.auto) {
      if (this.matches(id)) {
        this.begin(id, true);
        return this.run();
      }
    }
    return { kind: "free" };
  }

  // --- checks ---------------------------------------------------------------

  private vals(): Values {
    return {
      flags: this.flags,
      rels: this.rels,
      skills: this.skills(),
      langs: this.build.langs ?? [],
    };
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

  private step(s: string): void {
    this.path.push(s);
    if (this.path.length > MAX_PATH + 500) {
      const drop = this.path.length - MAX_PATH;
      this.path.splice(0, drop);
      this.trimmed += drop;
    }
  }

  /**
   * The state as it is now, as a save at the start of `scene`. (The path is
   * left out: snapshot() adds its latest steps. Copying all of it at every
   * scene would grow slower the longer the game.)
   */
  private capture(scene: string): Snapshot {
    return {
      chapter: this.chapter.n,
      scene,
      flags: copy(this.flags),
      rels: copy(this.rels),
      stage: copy(this.stageNow),
      path: [],
      taken: [...this.taken],
      build: copy(this.buildNow),
      boosts: copy(this.boostList),
      seed: this.seed,
      checks: copy(this.checks),
      done: [...this.doneList],
      tasks: copy(this.taskList),
      clock: this.clockNow,
      inv: { ...this.inv },
    };
  }

  /** Starts a scene; `triggered` when the open world started it. */
  private begin(id: string, triggered: boolean): void {
    const scene: Scene = this.chapter.scenes[id];
    if (triggered && scene.trigger?.once && !this.doneSet.has(id)) {
      this.doneSet.add(id);
      this.doneList.push(id);
    }
    this.entry = this.capture(id);
    this.entryPath = this.trimmed + this.path.length;
    this.scene = id;
    this.ip = 0;
    this.ret = -1;
    this.step(`s:${id}`);
    this.pending.push({ type: "scene", scene: id, label: scene.label });
  }

  private langLine(op: Extract<Op, { op: "line" }>, beat: LineBeat): void {
    const code = op.lang!;
    const langs = this.build.langs ?? [];
    const speaks = langs.includes(code);
    const name =
      this.chapter.languages.find((l) => l.code === code)?.name ?? code;
    let understood = speaks;
    let via: "skill" | undefined;
    if (op.langDiff !== undefined) {
      // Hard for anyone: a speaker has an easier time of it.
      const skill = this.skills()[LANGUAGES_SKILL] ?? 0;
      if (speaks) understood = passive(skill + 2, op.langDiff);
      else if (passive(skill, op.langDiff)) {
        understood = true;
        via = "skill";
      }
    }
    beat.text = understood ? (op.trans ?? op.text) : op.text;
    beat.lang = { code, name, understood, original: op.text };
    if (via) beat.lang.via = via;
    if (op.langDiff !== undefined) {
      beat.lang.diff = op.langDiff;
      beat.lang.tier = tierName(op.langDiff);
    }
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
          if (op.lang !== undefined) this.langLine(op, beat);
          this.clockNow += LINE_SECONDS;
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
        case "weather":
          this.stageNow.weather = op.kind;
          this.ip++;
          break;
        case "time": {
          // A time earlier in the day than now is the next day's.
          const day = Math.floor(this.clockNow / DAY);
          let t = day * DAY + op.minutes * 60;
          if (t < this.clockNow) t += DAY;
          this.clockNow = t;
          this.ip++;
          break;
        }
        case "task": {
          const had = this.taskList[op.id];
          const t: TaskState = {
            text: op.text ?? had?.text ?? op.id,
            done: op.done,
          };
          this.taskList[op.id] = t;
          this.pending.push({
            type: "task",
            id: op.id,
            text: t.text,
            done: t.done,
            fresh: had === undefined,
          });
          this.ip++;
          break;
        }
        case "actor": {
          // r22: a mark in the place named, or the one the story is in.
          const state = op.state
            ? {
                ...op.state,
                place: op.state.place ?? this.stageNow.place ?? undefined,
              }
            : null;
          if (state && state.place === undefined) delete state.place;
          if (state === null) delete this.stageNow.actors[op.who];
          else this.stageNow.actors[op.who] = state;
          this.pending.push({
            type: "actor",
            who: op.who,
            state: state ? { ...state } : null,
            walk: op.walk,
          });
          this.ip++;
          break;
        }
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
          if (op.scene === FREE) {
            // r22: he's free. The camera follows him again.
            this.scene = FREE;
            this.ip = -1;
            this.stageNow.focus = null;
            this.stageNow.figure = null;
            this.stageNow.vignette = null;
            this.pending.push({ type: "free" });
            return this.settleFree();
          }
          this.begin(op.scene, false);
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
