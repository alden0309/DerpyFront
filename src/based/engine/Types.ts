// Mr. Based: the shapes a chapter compiles to. A chapter is written as a
// plain-text script (src/based/story/chapter-NN.story, format in
// src/based/README.md); the server parses it into these and sends the result
// to the one account allowed to play. Nothing here holds story text.

/** A condition, as written after `if` or `* if`. */
export type Expr =
  | { k: "flag"; name: string }
  /** r22: whether he speaks a language ("speaks.fr"). */
  | { k: "lang"; code: string }
  | { k: "rel"; who: string }
  | { k: "skill"; id: string }
  | { k: "num"; v: number }
  | { k: "not"; e: Expr }
  | { k: "and" | "or"; a: Expr; b: Expr }
  | {
      k: "cmp";
      op: ">=" | "<=" | ">" | "<" | "==" | "!=";
      a: Expr;
      b: Expr;
    };

export interface CastMember {
  /** As written in the script: BASED, BARMAN... */
  id: string;
  /** As shown: "Mr. Based", "The barman". */
  name: string;
  /** Art key of their framed portrait, if they have one. */
  portrait?: string;
  /** How they're dressed in the 3D scenes (a look the client knows). */
  look?: string;
  // BPEOPLE (r22): their own rigged model (models/<key>.glb), if they have one.
  model?: string;
  /**
   * Another cast member who is the same person in the 3D scenes (someone
   * known first by a description, then by name): speaking moves that body.
   */
  body?: string;
}

/** r22: a language he can be given at the start ("@language fr French"). */
export interface Language {
  /** As written in lines: [fr]. */
  code: string;
  name: string;
}

// --- Skills (r21) ----------------------------------------------------------

/** One of the three or four things his skills grow out of. */
export interface Attribute {
  id: string;
  name: string;
  about: string;
}

export interface SkillDef {
  id: string;
  name: string;
  /** The attribute it belongs to; it starts at that attribute's value. */
  attr: string;
  about: string;
}

/** A ready-made build for the setup screen. */
export interface Archetype {
  id: string;
  name: string;
  about: string;
  attrs: Record<string, number>;
  /** One skill a step above its attribute. */
  signature: string;
}

/** How the setup screen shares out attribute points. */
export interface PointRules {
  /** Points across all attributes. */
  total: number;
  min: number;
  max: number;
}

/** The player's build: what the setup screen produces. */
export interface Build {
  attrs: Record<string, number>;
  signature: string;
  /** The archetype it started from, if any. */
  archetype?: string;
  /**
   * r22: the languages he speaks (codes from the chapter's @language list).
   * How many he may have depends on his Languages skill (Skills.ts).
   */
  langs?: string[];
}

/** A modifier on a check: "+2 if came_down 'You saw his shoes'". */
export interface Mod {
  delta: number;
  cond?: Expr;
  why: string;
}

/** A skill check: 2d6 + skill + modifiers against a difficulty. */
export interface CheckSpec {
  skill: string;
  diff: number;
  /** White checks can be tried again once something changes; red can't. */
  kind: "white" | "red";
  mods: Mod[];
}

// --- Scenes ----------------------------------------------------------------

export interface ChoiceOption {
  id: string;
  label: string;
  cond?: Expr;
  /** Gone once taken (for a "think about..." menu that loops). */
  once: boolean;
  /** Saying nothing: what a timed choice picks when the time runs out. */
  silent: boolean;
  /** Where its body starts in the scene's ops. */
  at: number;
  /** A skill check: the option's body is the check op and what follows. */
  check?: CheckSpec;
}

export interface Spot {
  id: string;
  label: string;
  /**
   * On a flat picture: where, in percent of its width and height. In a 3D
   * place the spot is a hotspot of the place instead (`anchor`), and x/y are
   * -1.
   */
  x: number;
  y: number;
  /** The place's hotspot this spot is (r21); defaults to the spot's id. */
  anchor?: string;
  at: number;
}

export interface Deduction {
  id: string;
  label: string;
  /** Spots or deductions noticed first. */
  needs: string[];
  at: number;
  /**
   * r21: a skill works it out. A passive pass (skill + 6 >= difficulty)
   * makes it at once, in that skill's voice; otherwise it's a white check,
   * a step easier for each other thing noticed in the room.
   */
  check?: CheckSpec;
  /** Where its failure text starts (a `return` if it has none). */
  failAt?: number;
}

export type LineKind = "narr" | "say" | "think";

/** Where someone stands in a 3D place, and how. */
export interface ActorState {
  /** A mark in the place. */
  at: string;
  /** stand, sit, lean... (the client knows the poses). */
  pose: string;
  /** Their outfit, if not their usual one. */
  wear?: string;
  /**
   * r22: the place (area) the mark is in. The world has several now, and
   * people stay where they were left while he's elsewhere.
   */
  place?: string;
}

/**
 * r22: what starts a scene in the open world, once the opening has set him
 * free (`-> FREE`): talking to someone, looking at something, walking into
 * a place, a thought that comes to him, or something that simply happens as
 * soon as its condition holds.
 */
export interface Trigger {
  on: "talk" | "look" | "enter" | "think" | "auto";
  /** Who (talk), which hotspot (look) or which place (enter). */
  target?: string;
  /** What a thought is called in the column (think). */
  label?: string;
  /** Only in this place (look and talk; enter names its own). */
  place?: string;
  /** Plays only the first time (think and auto always are). */
  once: boolean;
  cond?: Expr;
}

/** r22: an entry in his journal: what he has set out to do. */
export interface TaskState {
  text: string;
  done: boolean;
}

/** `src` is the line in the script file, for error messages and notes. */
export type Op =
  | {
      op: "line";
      kind: LineKind;
      who?: string;
      how?: string;
      text: string;
      /** r21: a skill's voice ("~ INSTINCT 9: ..."), passive if `diff`. */
      skill?: string;
      diff?: number;
      /**
       * r22: spoken in another language ("WHO [fr]: Bonsoir. | Good
       * evening."): `text` is what's said, `trans` what it means, and
       * `langDiff` a Languages check that can get the gist without it.
       */
      lang?: string;
      trans?: string;
      langDiff?: number;
      src: number;
    }
  | { op: "card"; title: string; sub?: string; src: number }
  | { op: "news"; text: string | null; src: number }
  | { op: "backdrop"; key: string | null; src: number }
  | { op: "figure"; who: string | null; src: number }
  | { op: "ambient"; key: string | null; src: number }
  | { op: "place"; key: string | null; src: number }
  | {
      op: "actor";
      who: string;
      /** null: off the stage. */
      state: ActorState | null;
      /** Walk there rather than appear. */
      walk: boolean;
      src: number;
    }
  | { op: "focus"; key: string | null; src: number }
  | { op: "gesture"; who: string; name: string; src: number }
  | { op: "vignette"; key: string | null; src: number }
  | { op: "prop"; key: string; on: boolean; src: number }
  | { op: "boost"; skill: string; delta: number; why: string; src: number }
  | { op: "set"; flag: string; value: number; add: boolean; src: number }
  | { op: "rel"; who: string; delta: number; src: number }
  | { op: "remember"; who: string; src: number }
  | { op: "if"; cond: Expr; else: number; src: number }
  | { op: "jump"; to: number; src: number }
  | { op: "goto"; scene: string; src: number }
  | {
      op: "choose";
      id: string;
      prompt: string;
      /** Seconds to answer, or 0 for no clock. */
      timer: number;
      options: ChoiceOption[];
      src: number;
    }
  | {
      /** r21: roll an option's check; on to the next op, or to `fail`. */
      op: "check";
      id: string;
      label: string;
      spec: CheckSpec;
      fail: number;
      src: number;
    }
  | {
      op: "investigate";
      id: string;
      title: string;
      /** Spots to look at before he can move on. */
      min: number;
      spots: Spot[];
      deductions: Deduction[];
      leave: string;
      /** r21: he stays put and looks (no walking about). */
      still: boolean;
      /** r21: the place's hotspot that also leaves (a door). */
      exit?: string;
      after: number;
      src: number;
    }
  | { op: "return"; src: number }
  | { op: "fall"; src: number }
  /** r22: his journal: a task set (or its words changed), or done. */
  | { op: "task"; id: string; text: string | null; done: boolean; src: number }
  /** r22: the weather the story wants (rain, drizzle, clear, fog), or none. */
  | { op: "weather"; kind: string | null; src: number }
  /** r22: the clock, in minutes after midnight. */
  | { op: "time"; minutes: number; src: number };

export interface Scene {
  id: string;
  label: string;
  /** r22: what starts it in the open world, if anything does. */
  trigger?: Trigger;
  ops: Op[];
  src: number;
}

export interface Carry {
  text: string;
  cond?: Expr;
}

export interface Chapter {
  n: number;
  title: string;
  /** One line for chapter select. */
  summary: string;
  start: string;
  cast: CastMember[];
  scenes: Record<string, Scene>;
  /** Scene ids in the order they're written. */
  order: string[];
  /** What the chapter's end screen says you carry forward. */
  carry: Carry[];
  /** r21: the skills, what they grow from, and the ready-made builds. */
  attributes: Attribute[];
  skills: SkillDef[];
  archetypes: Archetype[];
  points: PointRules;
  /** r22: the languages he can be given at the start. */
  languages: Language[];
  /** r22: what the clock says when the chapter begins (minutes). */
  clock: number;
}

/** The goto target that ends the chapter. */
export const END = "END";

/** r22: the goto target that sets him free to go where he likes. */
export const FREE = "FREE";

export interface ScriptError {
  line: number;
  message: string;
}
