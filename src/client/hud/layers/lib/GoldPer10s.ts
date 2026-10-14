/**
 * DFSTORE (r21): your gold income, as an average per 10 seconds over the
 * last minute of game time, for the gold display.
 *
 * It reads the player's cumulative gold received (PlayerView.goldEarned: all
 * income, spending not deducted), so the slope between the oldest and newest
 * sample in the window is the average rate. Time is game ticks (10 a second),
 * so a paused game holds its figure rather than drifting.
 */

const TICKS_PER_SECOND = 10;
/** The average runs over this much game time. */
export const GOLD_RATE_WINDOW_TICKS = 60 * TICKS_PER_SECOND;
/** Less history than this shows nothing yet, rather than a wild guess. */
export const GOLD_RATE_MIN_TICKS = 5 * TICKS_PER_SECOND;

interface Sample {
  tick: number;
  earned: number;
}

export class GoldPer10s {
  private samples: Sample[] = [];

  constructor(private readonly windowTicks = GOLD_RATE_WINDOW_TICKS) {}

  /** Note the cumulative gold received as of `tick`. */
  record(tick: number, earned: number): void {
    const last = this.samples[this.samples.length - 1];
    // A new game (or a replay jumping back) starts the history over.
    if (last !== undefined && (tick < last.tick || earned < last.earned)) {
      this.samples = [];
    } else if (last !== undefined && tick === last.tick) {
      last.earned = earned;
      return;
    }
    this.samples.push({ tick, earned });
    // Keep the newest sample at or before the window's start, so the average
    // spans the whole window once there is that much history.
    const start = tick - this.windowTicks;
    while (this.samples.length > 2 && this.samples[1].tick <= start) {
      this.samples.shift();
    }
  }

  /** Average gold received per 10 seconds, or null with too little history. */
  per10s(): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (first === undefined || last === first) return null;
    const span = last.tick - first.tick;
    if (span < GOLD_RATE_MIN_TICKS) return null;
    return ((last.earned - first.earned) / span) * 10 * TICKS_PER_SECOND;
  }

  reset(): void {
    this.samples = [];
  }
}
