// r26: the owner: "When you start a convo or in the middle of a convo when
// someone is walking to you or away or whatever, don't let me skip the convo
// until they get to where they need to go." The moves the story asks for
// (`@actor ... walk`: to a mark, onto a stool, out of the door), watched from
// when they start until the person is there and settled. One that runs far
// past what its walk should take is overdue: the world finishes it on the
// spot, so a stuck walk can never hold the story for ever. Pure: the world
// says who's still going, and the time (its own, sped up in tests).

/** Pace a walk's time limit is worked out at (metres a second). */
export const MOVE_PACE = 1.3;
/** The least a move is given, and what's added to its walk's time (seconds). */
export const MOVE_MIN = 6;
export const MOVE_SPARE = 4;

/** How long a move of `metres` may take before it's overdue. */
export function moveLimit(metres: number): number {
  return Math.max(MOVE_MIN, (metres / MOVE_PACE) * 2.5 + MOVE_SPARE);
}

export class MoveWatch {
  private readonly moves = new Map<string, { since: number; limit: number }>();

  /** Someone set off (`metres` to walk) at `now`. */
  start(id: string, now: number, metres: number): void {
    this.moves.set(id, { since: now, limit: moveLimit(metres) });
  }

  /** Everyone where they are (a load, a new place). */
  clear(): void {
    this.moves.clear();
  }

  get size(): number {
    return this.moves.size;
  }

  /**
   * Who's still on the way at `now` (`going`: walking, sitting down, getting
   * up, turning, or with the story's next things for them still waiting):
   * whether anyone is, and who's overdue (to be finished, and let go of).
   */
  check(
    now: number,
    going: (id: string) => boolean,
  ): { busy: boolean; overdue: string[] } {
    let busy = false;
    const overdue: string[] = [];
    for (const [id, m] of this.moves) {
      if (!going(id)) {
        this.moves.delete(id);
      } else if (now - m.since > m.limit) {
        this.moves.delete(id);
        overdue.push(id);
      } else {
        busy = true;
      }
    }
    return { busy, overdue };
  }
}
