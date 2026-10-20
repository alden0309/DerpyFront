/**
 * SCEN (r25): how contested a scenario game was, for the balance runs.
 *
 * Each side's **progress** at a moment is how far it has come from its
 * starting land towards its bar for a land win:
 *
 *     progress = (land now - land at the start) / (its bar - land at the start)
 *
 * (0 at the start, 1 at the bar, below 0 while it loses ground). Raw land
 * would be useless as a lead, since the sides start very unequal (the
 * Allies hold 60% of Europe on the first tick); progress is what the win
 * rule itself measures at the timer.
 *
 * - The **leader** at a sample is the side with the most progress (a tie,
 *   within 0.5 percentage points of progress, is no leader).
 * - The **decided minute** is the start of the last stretch, up to the end,
 *   during which the eventual winner led at every sample: the moment it took
 *   the lead for good. A game the winner led from its first sample is
 *   decided at minute 0.
 * - **Lead changes** count every time the leader differs from the previous
 *   sample's leader (ties don't count as a change).
 */
export interface ContestedSample {
  minute: number;
  /** side id -> progress (see above) */
  progress: Record<string, number>;
}

export interface ContestedStats {
  decidedMinute: number | null;
  /** decidedMinute / game length, 0..1 (null with no winner). */
  decidedFraction: number | null;
  leadChanges: number;
}

const TIE = 0.005;

export function leaderOf(progress: Record<string, number>): string | null {
  let best: string | null = null;
  let bestP = -Infinity;
  let second = -Infinity;
  for (const [side, p] of Object.entries(progress)) {
    if (p > bestP) {
      second = bestP;
      bestP = p;
      best = side;
    } else if (p > second) {
      second = p;
    }
  }
  return bestP - second <= TIE ? null : best;
}

export function contestedStats(
  samples: readonly ContestedSample[],
  winner: string | null,
  lengthMinutes: number,
): ContestedStats {
  let leadChanges = 0;
  let previous: string | null = null;
  const leaders = samples.map((s) => leaderOf(s.progress));
  for (const l of leaders) {
    if (l === null) continue;
    if (previous !== null && l !== previous) leadChanges++;
    previous = l;
  }
  if (winner === null || samples.length === 0) {
    return { decidedMinute: null, decidedFraction: null, leadChanges };
  }
  // Walk back from the end while the winner leads.
  let i = samples.length;
  while (i > 0 && leaders[i - 1] === winner) i--;
  // It never led at the end (won on its last move): decided at the end.
  const decidedMinute =
    i === samples.length ? lengthMinutes : i === 0 ? 0 : samples[i].minute;
  return {
    decidedMinute,
    decidedFraction: lengthMinutes > 0 ? decidedMinute / lengthMinutes : 0,
    leadChanges,
  };
}
