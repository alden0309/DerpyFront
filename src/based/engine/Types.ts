// Mr. Based: the shapes a chapter compiles to. A chapter is written as a
// plain-text script (src/based/story/chapter-NN.story, format in
// src/based/README.md); the server parses it into these and sends the result
// to the one account allowed to play. Nothing here holds story text.

/** A condition, as written after `if` or `* if`. */
export type Expr =
  | { k: "flag"; name: string }
  | { k: "rel"; who: string }
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
  /** As written in the script: BASED, ANSELME... */
  id: string;
  /** As shown: "Mr. Based", "Anselme". */
  name: string;
  /** Art key of their framed portrait, if they have one. */
  portrait?: string;
}

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
}

export interface Spot {
  id: string;
  label: string;
  /** Where on the backdrop, in percent of the picture's width and height. */
  x: number;
  y: number;
  at: number;
}

export interface Deduction {
  id: string;
  label: string;
  /** Spots or deductions noticed first. */
  needs: string[];
  at: number;
}

export type LineKind = "narr" | "say" | "think";

/** `src` is the line in the script file, for error messages and notes. */
export type Op =
  | {
      op: "line";
      kind: LineKind;
      who?: string;
      how?: string;
      text: string;
      src: number;
    }
  | { op: "card"; title: string; sub?: string; src: number }
  | { op: "news"; text: string | null; src: number }
  | { op: "backdrop"; key: string | null; src: number }
  | { op: "figure"; who: string | null; src: number }
  | { op: "ambient"; key: string | null; src: number }
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
      op: "investigate";
      id: string;
      title: string;
      /** Spots to look at before he can move on. */
      min: number;
      spots: Spot[];
      deductions: Deduction[];
      leave: string;
      after: number;
      src: number;
    }
  | { op: "return"; src: number }
  | { op: "fall"; src: number };

export interface Scene {
  id: string;
  label: string;
  /** Set when the scene is a checkpoint you can replay from. */
  checkpoint?: string;
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
}

/** The goto target that ends the chapter. */
export const END = "END";

export interface ScriptError {
  line: number;
  message: string;
}
