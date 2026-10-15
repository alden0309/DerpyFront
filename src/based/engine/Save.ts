// Mr. Based's saves (r22). The game saves in slots, whenever the player
// likes: an autosave the game keeps, a quicksave (F5, loaded with F9) and
// ten slots of the player's own. Each slot is its own small record on the
// server (one row per slot, so saving one never rewrites the others): where
// he is, the story's state, and a few words to list it by (the place, the
// in-game time, when it was saved and how long had been played). Beside
// them, one profile per account: what's been seen of the story (for the
// flowchart) and how long has been played in all.
//
// Round 21 kept one save per account with chapters and checkpoints (v1);
// fromV1 turns one into a profile and an autosave.

import { PlaceDef } from "./Place";
import { chapterStart, Kit, Snapshot, StoryRun } from "./Runtime";
import { Boost, buildOf, withLanguages } from "./Skills";
import { Build, Chapter, FREE } from "./Types";

export const SAVE_VERSION = 2;

/** The slots, in the order they're listed. */
export const MANUAL_SLOTS = 10;
export const SLOTS: readonly string[] = [
  "auto",
  "quick",
  ...Array.from({ length: MANUAL_SLOTS }, (_, i) => String(i + 1)),
];

export function isSlot(s: string): boolean {
  return SLOTS.includes(s);
}

/** Where he stood in the world, which the story itself doesn't track. */
export interface SlotWorld {
  x: number;
  z: number;
  /** Facing, in radians. */
  heading: number;
  /** How wet his clothes are, 0 to 1. */
  wet: number;
}

/** What the load screen lists a slot by. */
export interface SlotMeta {
  /** The place's key and its name. */
  place: string;
  placeName: string;
  chapter: number;
  /** The in-game clock, in seconds. */
  clock: number;
  /** ISO time it was saved. */
  savedAt: string;
  /** Seconds played when it was saved. */
  played: number;
  /** The scene he was in, or FREE. */
  scene: string;
  /** What the scene's called, or what he was doing. */
  label: string;
}

export interface SlotSave {
  v: 2;
  meta: SlotMeta;
  snap: Snapshot;
  world?: SlotWorld;
}

export interface ChapterSeen {
  scenes: string[];
  /** "<choice>=<option>" for every option ever picked. */
  options: string[];
  /** Deductions and spots ever found, by id. */
  found: string[];
}

export interface Finished {
  at: string;
  flags: Record<string, number>;
  rels: Record<string, number>;
  /** The path that ended it. */
  path: string[];
  /** r21: who he was, and what he'd been through, carried on. */
  build?: Build;
  boosts?: Boost[];
  /** r22 BPLAY: what he carried at the end. */
  kit?: Kit;
}

/** The account's own record beside its slots. */
export interface Profile {
  v: 2;
  seen: Record<string, ChapterSeen>;
  finished: Record<string, Finished>;
  /** Seconds played in all. */
  played: number;
  /** Set when a round-21 save was converted, saying what became of it. */
  migrated?: string;
}

export function emptyProfile(): Profile {
  return { v: 2, seen: {}, finished: {}, played: 0 };
}

/** Folds a run's history into what the player has seen of a chapter. */
export function noteSeen(
  p: Profile,
  chapter: number,
  path: string[],
  found: string[] = [],
): void {
  const key = String(chapter);
  const seen = (p.seen[key] ??= { scenes: [], options: [], found: [] });
  seen.found ??= [];
  const scenes = new Set(seen.scenes);
  const options = new Set(seen.options);
  const founds = new Set(seen.found);
  for (const step of path) {
    if (step.startsWith("s:")) {
      if (!scenes.has(step.slice(2))) {
        scenes.add(step.slice(2));
        seen.scenes.push(step.slice(2));
      }
    } else if (step.startsWith("c:")) {
      if (!options.has(step.slice(2))) {
        options.add(step.slice(2));
        seen.options.push(step.slice(2));
      }
    }
  }
  for (const f of found) {
    if (!founds.has(f)) {
      founds.add(f);
      seen.found.push(f);
    }
  }
}

/** A slot's record of a run as it is now. */
export function slotOf(
  run: StoryRun,
  opts: {
    placeName: string;
    played: number;
    savedAt: string;
    world?: SlotWorld;
  },
): SlotSave {
  const snap = run.snapshot();
  const scene = run.chapter.scenes[snap.scene];
  return {
    v: 2,
    meta: {
      place: snap.stage.place ?? "",
      placeName: opts.placeName,
      chapter: run.chapter.n,
      clock: snap.clock ?? 0,
      savedAt: opts.savedAt,
      played: Math.max(0, Math.round(opts.played)),
      scene: snap.scene,
      label: snap.scene === FREE ? "Free to go" : (scene?.label ?? ""),
    },
    snap,
    world: opts.world,
  };
}

// --- Round 21's saves --------------------------------------------------------

/** A save as round 21 kept it: one per account, with checkpoints. */
export interface V1Save {
  v: 1;
  current: (Snapshot & { chapter: number }) | null;
  checkpoints?: Record<string, Record<string, { snap: Snapshot }>>;
  seen?: Record<string, ChapterSeen>;
  finished?: Record<string, Finished>;
}

/** Round 21's skills, and the ones that took their place. */
const OLD_SKILLS: Record<string, string> = {
  TRADECRAFT: "INSTINCT",
  MEMORY: "MEMORY",
  LANGUAGES: "LANGUAGES",
  COMPOSURE: "FOCUS",
  INSTINCT: "PERCEPTION",
  MENACE: "INTIMIDATION",
  READ_PEOPLE: "EMPATHY",
  CHARM: "CHARISMA",
  CONSCIENCE: "ENDURANCE",
};
const OLD_ATTRS: Record<string, string> = {
  WITS: "INTELLIGENCE",
  NERVE: "PHYSICAL",
  HEART: "SOCIAL",
};

/** A round-21 build in the new skills: his archetype if he had one. */
export function buildFromV1(
  ch: Chapter,
  old: Build | null | undefined,
): Build | null {
  if (!old) return null;
  const arch = ch.archetypes.find((a) => a.id === old.archetype);
  if (arch) return withLanguages(ch, buildOf(arch));
  const attrs: Record<string, number> = {};
  for (const [k, v] of Object.entries(old.attrs)) {
    const to = OLD_ATTRS[k] ?? k;
    if (ch.attributes.some((a) => a.id === to)) attrs[to] = v;
  }
  for (const a of ch.attributes) attrs[a.id] ??= ch.points.min;
  const sig = OLD_SKILLS[old.signature] ?? old.signature;
  const b: Build = {
    attrs,
    signature: ch.skills.some((s) => s.id === sig)
      ? sig
      : (ch.skills[0]?.id ?? ""),
  };
  return withLanguages(ch, b);
}

/**
 * Round 21's save as a profile and an autosave. Chapter one was rewritten
 * (r22), so the old scenes are gone: the nearest sensible point is the
 * start of the new chapter, or, for a save past the meeting with London's
 * contact (or a finished chapter), the moment the world opens after it in
 * the new one, reached by playing the new chapter's first choices. Who he
 * was carries over; flags, the flowchart and checkpoints don't, because
 * they name scenes that no longer exist (the profile says so).
 */
export function fromV1(
  old: V1Save,
  ch: Chapter,
  opts: {
    now: string;
    pastScenes: readonly string[];
    openFlag: string;
    places?: Record<string, PlaceDef>;
  },
): { profile: Profile; auto: SlotSave | null } {
  const profile = emptyProfile();
  const cur = old.current;
  const finishedOne = !!old.finished?.[String(ch.n)];
  const oldBuild = cur?.build ?? old.finished?.[String(ch.n)]?.build ?? null;
  if (!cur && !finishedOne) {
    profile.migrated = "Your earlier save was empty: nothing to carry over.";
    return { profile, auto: null };
  }
  const build = buildFromV1(ch, oldBuild) ?? null;
  const start = chapterStart(ch, undefined, {
    build,
    seed: cur?.seed ?? 1,
  });
  const past =
    finishedOne || (cur !== null && opts.pastScenes.includes(cur.scene));
  let run = new StoryRun(ch, start);
  let where = "the start of chapter one";
  if (past) {
    const r = playUntil(ch, start, opts.openFlag, opts.places ?? {});
    if (r) {
      run = r;
      where = "the moment the world opens, after the meeting";
    }
  }
  profile.migrated = `Your earlier save (chapter one${
    cur ? `, scene "${cur.scene}"` : ", finished"
  }) became the autosave at ${where}. Chapter one was rewritten, so its old checkpoints and flowchart were dropped.`;
  const auto = slotOf(run, {
    placeName: "",
    played: 0,
    savedAt: opts.now,
  });
  return { profile, auto };
}

/**
 * Plays a chapter from a snapshot, taking the first open option, and, free,
 * trying each thing there is to do in turn (thoughts, people, things, then
 * doors), until `flag` is set and he's free. Null if it never is (within a
 * bound). Deterministic.
 */
export function playUntil(
  ch: Chapter,
  from: Snapshot,
  flag: string,
  places: Record<string, PlaceDef>,
): StoryRun | null {
  const r = new StoryRun(ch, from);
  const tried = new Set<string>();
  let doorTurn = 0;
  for (let steps = 0; steps < 20_000; steps++) {
    const b = r.beat;
    if (b.kind === "end") return null;
    if (b.kind === "free") {
      if (r.flag(flag)) return r;
      const here = r.stage.place ?? "";
      const def = places[here];
      const a = r.available(Object.keys(def?.hotspots ?? {}));
      const acts: [string, () => void][] = [
        ...a.think.map(
          (t) => [`think:${t.id}`, () => r.think(t.id)] as [string, () => void],
        ),
        ...a.talk.map(
          (w) => [`talk:${here}:${w}`, () => r.talk(w)] as [string, () => void],
        ),
        ...a.look
          .filter((t) => def?.hotspots[t] && !def.hotspots[t].to)
          .map(
            (t) =>
              [`look:${here}:${t}`, () => r.look(t)] as [string, () => void],
          ),
      ];
      const next = acts.find(([k]) => !tried.has(k));
      if (next) {
        tried.add(next[0]);
        next[1]();
        continue;
      }
      const doors = Object.entries(def?.hotspots ?? {}).filter(([, h]) => h.to);
      if (doors.length === 0) return null;
      const [id, h] = doors[doorTurn++ % doors.length];
      if (r.look(id) === null) r.enterPlace(h.to!.place, h.to!.mark);
    } else if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      r.advance();
    } else if (b.kind === "choice") {
      const open = b.options.filter((o) => !o.check?.locked && !o.check);
      r.choose((open[0] ?? b.options.find((o) => !o.check?.locked)!).id);
    } else {
      const spot = b.spots.find((s) => !s.seen);
      if (b.canLeave) r.leave();
      else if (spot) r.examine(spot.id);
      else return null;
    }
  }
  return null;
}
