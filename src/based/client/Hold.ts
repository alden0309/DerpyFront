// r26: the next line waits for someone the story moved. When the story
// steps on and a move it asked for is under way (World.storyBusy), the beat
// is held: not shown, nothing advances or is chosen, until the move is done
// (the world finishes a stuck one after a while, so a hold always ends).
// A loaded game, the free world and the end are never held. Pure (the page
// gives it what's busy, how to show a beat, and a timer).

export interface HoldTimers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const browserTimers: HoldTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

/** How often a held beat looks again (ms). */
export const HOLD_POLL = 80;

export class BeatHold<B> {
  /** The beat waiting, if one is. */
  private waiting: B | null = null;
  private timer = 0;

  constructor(
    private readonly busy: () => boolean,
    private readonly show: (b: B) => void,
    private readonly timers: HoldTimers = browserTimers,
  ) {}

  /** Whether a beat is waiting (nothing may move the story on). */
  get held(): boolean {
    return this.waiting !== null;
  }

  /**
   * A new beat: shown now, or held while a move is under way. `waits`:
   * whether this kind of beat waits (a line, a card, a check, a choice, a
   * room to read; not the free world or the end); `first`: a loaded game.
   */
  offer(b: B, waits: boolean, first = false): void {
    this.cancel();
    if (!first && waits && this.busy()) {
      this.waiting = b;
      this.timer = this.timers.set(() => this.poll(), HOLD_POLL);
      return;
    }
    this.show(b);
  }

  /** Let go of a waiting beat without showing it (the story moved on). */
  cancel(): void {
    this.timers.clear(this.timer);
    this.waiting = null;
  }

  private poll(): void {
    const b = this.waiting;
    if (b === null) return;
    if (this.busy()) {
      this.timer = this.timers.set(() => this.poll(), HOLD_POLL);
      return;
    }
    this.waiting = null;
    this.show(b);
  }
}
