// SITE (r19): the game as each viewer may be sent it, in one place. Every
// track that keeps something to one player (DICE r14: the dice under each
// cup; INTRIGUE r15: schemes, private letters, a plot's lines; LABOUR r15: a
// household's door opened to someone fleeing; POLLS r16: the sheriff's
// present and the canvass's book, through IntrigueCore; ECON r17: bonds and
// their lines in the books; CROWN r18: a colony's petition until it sails)
// has its own redaction for a seat. They're composed here, so the server
// sends a player the same view whatever it's sending, and a watcher (seat
// null: nobody's) the most redacted view of them all. A new redaction goes
// in here, and both players and watchers get it.

import {
  labourDeltaForSeat,
  labourDeltaSecret,
  labourStateForSeat,
} from "./BondCore";
import { cardsStateForSeat, cardsView } from "./CardsCore"; // EVENTS (r21)
import { crownDeltaForSeat, crownStateForSeat } from "./CrownCore";
import { diceView, stateForSeat } from "./DiceCore";
import {
  deltaForSeat,
  deltaHasSecrets,
  stateForIntrigue,
} from "./IntrigueCore";
import {
  loanDeltaForSeat,
  loanDeltaSecret,
  loanStateForSeat,
} from "./LoanCore";
import type { GameDelta, GameState } from "./Types";

/** The whole game as `seat` may see it (null: a watcher, who holds no seat). */
export function stateForViewer(s: GameState, seat: string | null): GameState {
  // EVENTS (r21): and the cards in each hand at the card tables.
  return cardsStateForSeat(stateForViewerR19(s, seat), seat);
}

function stateForViewerR19(s: GameState, seat: string | null): GameState {
  return crownStateForSeat(
    loanStateForSeat(
      labourStateForSeat(stateForIntrigue(stateForSeat(s, seat), seat), seat),
      seat,
    ),
    seat,
  );
}

/** Whether a delta must be sent differently to each viewer. */
export function deltaIsPerViewer(d: GameDelta): boolean {
  return (
    !!d.dice ||
    deltaHasSecrets(d) ||
    labourDeltaSecret(d) ||
    loanDeltaSecret(d) ||
    !!d.crown ||
    !!d.cards // EVENTS (r21)
  );
}

/** A delta as `seat` may see it (null: a watcher). `s` is the game's own state. */
export function deltaForViewer(
  s: GameState,
  d: GameDelta,
  seat: string | null,
): GameDelta {
  const secret = deltaHasSecrets(d);
  const bond = labourDeltaSecret(d);
  const loans = loanDeltaSecret(d);
  let out = d.dice ? { ...d, dice: diceView(d.dice, seat) } : d;
  if (secret) out = deltaForSeat(s, out, seat);
  if (bond) out = labourDeltaForSeat(out, seat);
  if (loans) out = loanDeltaForSeat(out, seat);
  if (d.crown) out = crownDeltaForSeat(s, out, seat);
  if (d.cards) out = { ...out, cards: cardsView(d.cards, seat) }; // EVENTS (r21)
  return out;
}

/** What a watcher is sent on arriving: nobody's secrets. */
export function stateForWatcher(s: GameState): GameState {
  return stateForViewer(s, null);
}

/** What a watcher is sent of a change: nobody's secrets. */
export function deltaForWatcher(s: GameState, d: GameDelta): GameDelta {
  return deltaForViewer(s, d, null);
}
