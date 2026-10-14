// FIXES (r15): the whole story of a Liar's dice table, for its log. The
// server keeps a table's last 90 moves; this keeps every move this screen
// has been sent, so earlier rounds stay readable however long the table
// runs, and writes them as lines: each round as it was rolled (and who
// opened it), every bid and call, every reveal with its outcome, who went
// out or got up, and who took the pot. Oldest first, like the game's log.

import { bidWords, numberWord, tablesOf } from "../../engine/DiceCore";
import type { DiceAct, DiceTable, GameState } from "../../engine/Types";

/**
 * Every move each table has made, as this screen has seen them. The server
 * keeps a table's last 90 moves; the log keeps all it's been sent, so the
 * rounds before stay readable however long the table runs.
 */
const seenActs = new Map<number, Map<number, DiceAct>>();

/** Note what every table has done (after each change from the server). */
export function noteDiceActs(s: GameState): void {
  for (const t of tablesOf(s)) noteActs(t);
}

function noteActs(t: DiceTable): Map<number, DiceAct> {
  let m = seenActs.get(t.id);
  if (!m) seenActs.set(t.id, (m = new Map()));
  // A move's "whose turn after" can be filled in later: keep the latest.
  for (const a of t.acts) m.set(a.n, a);
  if (m.size > 800) {
    const keys = [...m.keys()].sort((a, b) => a - b);
    for (const k of keys.slice(0, m.size - 800)) m.delete(k);
  }
  return m;
}

/** The table's moves, oldest first, all this screen has seen. */
export function tableStory(t: DiceTable): DiceAct[] {
  return [...noteActs(t).values()].sort((a, b) => a.n - b.n);
}

/** A line of the table's log. */
export interface StoryLine {
  n: number;
  kind:
    | "round"
    | "bid"
    | "liar"
    | "reveal"
    | "out"
    | "gone"
    | "void"
    | "win"
    | "sit"
    | "refuse";
  /** Who spoke (a bid or a call). */
  who?: string;
  text: string;
  /** Made for them (a player who stalled or went away). */
  auto?: boolean;
}

/**
 * The whole table's story up to move `upTo`, oldest first: each round as
 * it was rolled (who opened it), every bid and call, every reveal with its
 * outcome, who went out or got up, and who took the pot. `first` names a
 * character; you're "You".
 */
export function storyLines(
  t: DiceTable,
  acts: DiceAct[],
  upTo: number,
  me: number,
  first: (c: number) => string,
): StoryLine[] {
  const Who = (c: number) => (c === me ? "You" : first(c));
  const who = (c: number) => (c === me ? "you" : first(c));
  const verb = (c: number, they: string, you: string) =>
    c === me ? you : they;
  const out: StoryLine[] = [];
  for (const a of acts) {
    if (a.n > upTo) break;
    const line = (kind: StoryLine["kind"], text: string, w?: string) =>
      out.push({
        n: a.n,
        kind,
        text,
        ...(w !== undefined ? { who: w } : {}),
        ...(a.auto ? { auto: true } : {}),
      });
    switch (a.k) {
      case "sit":
        line("sit", `${Who(a.c)} ${verb(a.c, "sits", "sit")} down.`);
        break;
      case "refuse":
        line(
          "refuse",
          `${Who(a.c)} won't sit down${a.why ? `: ${a.why.charAt(0).toLowerCase()}${a.why.slice(1).replace(/\.$/, "")}` : ""}.`,
        );
        break;
      case "roll": {
        const dice = Object.values(a.ns ?? {}).reduce((m, k) => m + k, 0);
        line(
          "round",
          `Round ${a.round}: ${who(a.c)} ${verb(a.c, "opens", "open")}, ${dice} dice under the cups.`,
        );
        break;
      }
      case "bid":
        if (a.bid) line("bid", bidWords(a.bid), Who(a.c));
        break;
      case "liar":
        line("liar", a.spot ? "Spot on!" : "Liar!", Who(a.c)); // EVENTS (r21)
        break;
      case "reveal": {
        if (!a.bid) break;
        const count = a.count ?? 0;
        const wild = Object.values(a.cups ?? {})
          .flat()
          .filter((d) => d === 1).length;
        const stands = count >= a.bid.q;
        const whose =
          a.bidder === undefined
            ? ""
            : a.bidder === me
              ? "your "
              : `${first(a.bidder)}'s `;
        const loser = a.loser ?? -1;
        // EVENTS (r21): "Spot on!": exactly, or not.
        if (a.spot) {
          const exact = count === a.bid.q;
          line(
            "reveal",
            `${Who(a.c)} called ${whose}${bidWords(a.bid)} spot on: ${numberWord(count)} showing${wild ? `, ${numberWord(wild)} of them wild` : ""}. ${
              exact
                ? a.gain !== undefined
                  ? `Exactly: ${who(a.gain)} ${verb(a.gain, "wins", "win")} back a die.`
                  : "Exactly (with all five dice, there's none to win back)."
                : `Not exact: ${who(loser)} ${verb(loser, "loses", "lose")} a die.`
            }`,
          );
          break;
        }
        line(
          "reveal",
          `${Who(a.c)} called Liar! on ${whose}${bidWords(a.bid)}: ${numberWord(count)} showing${wild ? `, ${numberWord(wild)} of them wild` : ""}. ${stands ? "The bid stands" : "A lie"}: ${who(loser)} ${verb(loser, "loses", "lose")} a die.`,
        );
        break;
      }
      case "out":
        line("out", `${Who(a.c)} ${verb(a.c, "is", "are")} out of dice.`);
        break;
      case "gone": {
        const why = a.why ?? "leaves the table";
        line(
          "gone",
          /^[A-Z]/.test(why)
            ? why
            : `${Who(a.c)} ${
                a.c === me
                  ? why
                      .replace(/^leaves/, "leave")
                      .replace(/^sets/, "set")
                      .replace(/^is /, "are ")
                  : why
              }.`,
        );
        break;
      }
      case "void":
        line(
          "void",
          `${Who(a.c)} had to go: the round is thrown in and rolled again.`,
        );
        break;
      case "win":
        line(
          "win",
          `${Who(a.c)} ${verb(a.c, "takes", "take")} the pot of ${t.pot}.`,
        );
        break;
    }
  }
  return out;
}
