// Mr. Based: the shapes a chapter compiles to. A chapter is written as a
// plain-text script (src/based/story/chapter-NN.story, format in
// src/based/README.md); the server parses it into these and sends the result
// to the one account allowed to play. Nothing here holds story text.

/** A condition, as written after `if` or `* if`. */
export type Expr =
  | { k: "flag"; name: string }
  /** r22: his rating in a language ("speaks.fr"; 0 if he doesn't speak it). */
  | { k: "lang"; code: string }
  | { k: "rel"; who: string }
  | { k: "skill"; id: string }
  /** r22 BPLAY: he has an item (pockets, worn or held): "has.matchbook". */
  | { k: "has"; item: string }
  /** r22 BPLAY: he wears or holds it: "wears.reading_glasses". */
  | { k: "wears"; item: string }
  /** r22 BPLAY: his euros ("money >= 20"). */
  | { k: "money" }
  /** r22 BPLAY: he's holding a weapon. */
  | { k: "armed" }
  /** r22 BPLAY: the time of day, in minutes ("time >= 23:00"). */
  | { k: "time" }
  /** r22 BPLAY: the weather where he is now ("weather.clear"). */
  | { k: "weather"; kind: string }
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
   * r22 BPLAY: what he speaks, as points spent at the start on each of the
   * chapter's @language codes: 0 he doesn't speak it, 1 he gets by, 2
   * fluent, 3 like a native. The pool comes from his Languages skill
   * (Skills.ts); boosts and items can add to a language later.
   */
  langPts?: Record<string, number>;
  /**
   * BWORLD's r22 saves: the languages he was given, all as well as his
   * Languages skill allowed. Turned into points when loaded (Skills.ts).
   */
  langs?: string[];
}

// --- What he carries (r22 BPLAY) -------------------------------------------

/** The kinds of thing he can carry. Money is a number, not an item. */
export const ITEM_KINDS = [
  "clothes",
  "tool",
  "weapon",
  "document",
  "key",
  "small",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Where clothes go on him, and the hand for something held. */
export const CLOTHES_SLOTS = [
  "hat",
  "glasses",
  "neck",
  "jacket",
  "shirt",
  "gloves",
  "trousers",
  "shoes",
] as const;
export const GEAR_SLOTS = [...CLOTHES_SLOTS, "hand"] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

/**
 * `@item KEY "Name" kind=... [slot=...] [bonus=SKILL+N,...] [look=...]
 * [icon=...] [start=worn|N] "What it is"`.
 */
export interface ItemDef {
  key: string;
  name: string;
  kind: ItemKind;
  /** Wearable (clothes) or held (the hand); absent: pockets only. */
  slot?: GearSlot;
  /** What it does to his skills while it's worn or held. */
  bonus: { skill: string; delta: number }[];
  /** The 3D look he wears with it, where a model of it exists. */
  look?: string;
  /** Its picture in the inventory (a drawing the client knows). */
  icon?: string;
  about: string;
  /** What he starts with: wearing it, or so many in his pockets. */
  start?: "worn" | number;
  src: number;
}

/** A modifier on a check: "+2 if came_down 'You saw his shoes'". */
export interface Mod {
  delta: number;
  cond?: Expr;
  why: string;
  /** r22 BPLAY: the item it comes from (clothes, or something carried). */
  item?: string;
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
  /**
   * r22 BPLAY: items it needs (any one of them): shown, but locked, until
   * he has one ("* needs=lighter|matchbook [Give him a light]").
   */
  needs?: string[];
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
  /** r22 BPLAY: `use` is using something he carries (the inventory). */
  on: "talk" | "look" | "enter" | "think" | "auto" | "use";
  /** Who (talk), which hotspot (look), which place (enter), which item (use). */
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
  | { op: "time"; minutes: number; src: number }
  /** r22 BPLAY: `give KEY [N]` (delta > 0) or `take KEY [N]` (delta < 0). */
  | { op: "item"; key: string; delta: number; src: number }
  /** r22 BPLAY: he puts it on, or takes it in hand. */
  | { op: "equip"; key: string; src: number }
  /** r22 BPLAY: he takes off what's in a slot (into his pockets). */
  | { op: "unequip"; slot: GearSlot; src: number }
  /** r22 BPLAY: `earn N` (delta > 0) or `pay N` (delta < 0), in euros. */
  | { op: "money"; delta: number; src: number };

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
  /** r22 BPLAY: everything he can carry, by key, in the order written. */
  items: Record<string, ItemDef>;
  /** r22 BPLAY: the euros he starts with (`@money N`). */
  money: number;
}

/** The goto target that ends the chapter. */
export const END = "END";

/** r22: the goto target that sets him free to go where he likes. */
export const FREE = "FREE";

export interface ScriptError {
  line: number;
  message: string;
}
