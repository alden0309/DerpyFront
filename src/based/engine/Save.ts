// A player's Mr. Based save, as kept on the server (one per account): where
// to continue, the checkpoints reached, what they've seen of each chapter
// (for the flowchart), and how each finished chapter ended (carried into the
// next).

import { Snapshot } from "./Runtime";
import { Boost } from "./Skills";
import { Build } from "./Types";

export interface CheckpointSave {
  label: string;
  /** ISO time it was reached. */
  at: string;
  snap: Snapshot;
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
}

export interface BasedSave {
  v: 1;
  current: Snapshot | null;
  /** chapter -> scene -> checkpoint */
  checkpoints: Record<string, Record<string, CheckpointSave>>;
  seen: Record<string, ChapterSeen>;
  finished: Record<string, Finished>;
}

export function emptySave(): BasedSave {
  return { v: 1, current: null, checkpoints: {}, seen: {}, finished: {} };
}

/** Folds a run's history into what the player has seen of a chapter. */
export function noteSeen(
  save: BasedSave,
  chapter: number,
  path: string[],
  found: string[] = [],
): void {
  const key = String(chapter);
  const seen = (save.seen[key] ??= { scenes: [], options: [], found: [] });
  seen.found ??= [];
  for (const step of path) {
    if (step.startsWith("s:")) {
      if (!seen.scenes.includes(step.slice(2))) seen.scenes.push(step.slice(2));
    } else if (step.startsWith("c:")) {
      if (!seen.options.includes(step.slice(2))) {
        seen.options.push(step.slice(2));
      }
    }
  }
  for (const f of found) if (!seen.found.includes(f)) seen.found.push(f);
}
