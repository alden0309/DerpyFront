// Plays a Mr. Based chapter as a careless player would (r22): reads on,
// picks options at random, and, free in the open world, wanders: goes up to
// whoever is about, looks at whatever there is to see where he is, follows
// thoughts, and walks through doors. Deterministic for a given seed.

import { PlaceDef } from "../../src/based/engine/Place";
import {
  chapterStart,
  Snapshot,
  StoryRun,
} from "../../src/based/engine/Runtime";
import { Build, Chapter } from "../../src/based/engine/Types";

export interface Played {
  run: StoryRun;
  ended: boolean;
  steps: number;
}

export function rng(seed: number): (n: number) => number {
  // mulberry32: the low bits of a plain LCG repeat too soon for this.
  let a = (seed * 2_654_435_761) >>> 0 || 1;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** What the player can do while he's free, where he is. */
export function freeActions(
  r: StoryRun,
  places: Record<string, PlaceDef>,
): (() => void)[] {
  const here = r.stage.place;
  const def = here ? places[here] : undefined;
  const a = r.available(Object.keys(def?.hotspots ?? {}));
  const out: (() => void)[] = [];
  for (const who of a.talk) out.push(() => r.talk(who));
  for (const t of a.look) {
    if (def?.hotspots[t] && !def.hotspots[t].to) out.push(() => r.look(t));
  }
  for (const t of a.think) out.push(() => r.think(t.id));
  for (const [id, h] of Object.entries(def?.hotspots ?? {})) {
    if (!h.to) continue;
    const to = h.to;
    out.push(() => {
      // The story may stop him at the door.
      if (r.look(id) === null) r.enterPlace(to.place, to.mark);
    });
  }
  return out;
}

export function playRandomly(
  ch: Chapter,
  places: Record<string, PlaceDef>,
  opts: { seed: number; build?: Build | null; from?: Snapshot; max?: number },
): Played {
  const pick = rng(opts.seed);
  const r = new StoryRun(
    ch,
    opts.from ??
      chapterStart(ch, undefined, {
        build: opts.build ?? null,
        seed: opts.seed,
      }),
  );
  const max = opts.max ?? 20_000;
  for (let steps = 0; steps < max; steps++) {
    const b = r.beat;
    if (b.kind === "end") return { run: r, ended: true, steps };
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll") {
      r.advance();
    } else if (b.kind === "choice") {
      const open = b.options.filter((o) => !o.check?.locked);
      if (pick(5) === 0 && b.timer > 0) r.timeout();
      else r.choose(open[pick(open.length)].id);
    } else if (b.kind === "free") {
      const acts = freeActions(r, places);
      if (acts.length === 0) return { run: r, ended: false, steps };
      acts[pick(acts.length)]();
    } else {
      const unseen = b.spots.filter((s) => !s.seen);
      const ready = b.deductions.filter(
        (d) => d.ready && !d.done && !d.check?.locked,
      );
      const k = pick(4);
      if (k === 0 && ready.length > 0) r.deduce(ready[0].id);
      else if (k === 1 && b.canLeave) r.leave();
      else if (unseen.length > 0) r.examine(unseen[pick(unseen.length)].id);
      else if (ready.length > 0) r.deduce(ready[0].id);
      else r.leave();
    }
  }
  return { run: r, ended: false, steps: max };
}
