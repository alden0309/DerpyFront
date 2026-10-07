import {
  Award,
  AwardKind,
  GameAwards,
} from "@openfront/engine-api/game/Awards";
import { PlayerType, Team } from "@openfront/engine-api/game/GameTypes";
import { Game, Player } from "./Game";
import { AwardTally } from "./StatsImpl";

/** MVP points for being on the winning side. */
export const MVP_WIN_BONUS = 250;
/** MVP points per weighted conquest (a human or nation counts 4, a bot 1). */
export const MVP_POINTS_PER_CONQUEST = 25;
/** Gold earned per MVP point. */
export const MVP_GOLD_PER_POINT = 100_000n;

/**
 * The MVP score: up to 1000 for territory (peak share of the map's land, in
 * tenths of a percent), 100 per human or nation conquered (25 per bot), one
 * per 100K gold earned, and a bonus for winning.
 */
export function mvpScore(
  tally: AwardTally,
  numLandTiles: number,
  won: boolean,
): number {
  const territory =
    numLandTiles > 0 ? Math.floor((tally.peakTiles * 1000) / numLandTiles) : 0;
  return (
    territory +
    tally.conquests * MVP_POINTS_PER_CONQUEST +
    Number(tally.gold / MVP_GOLD_PER_POINT) +
    (won ? MVP_WIN_BONUS : 0)
  );
}

function isWinner(player: Player, winner: Player | Team | null): boolean {
  if (winner === null) return false;
  if (typeof winner === "string") return player.team() === winner;
  return player === winner;
}

/**
 * Hands out the end-of-game awards to humans and nations (bots never win
 * one): MVP, most betrayals, most money made and most ships. An award nobody
 * earned (no betrayals all game, say) is left out. Ties go to the player who
 * joined first, so every client agrees.
 */
export function computeAwards(
  game: Game,
  winner: Player | Team | null,
): GameAwards {
  const tallies = game.stats().awardTallies();
  const numLandTiles = game.map().numLandTiles();
  const candidates: { player: Player; tally: AwardTally }[] = [];
  for (const player of game.allPlayers()) {
    if (player.type() === PlayerType.Bot) continue;
    const tally = tallies[player.id()];
    if (tally !== undefined) candidates.push({ player, tally });
  }
  candidates.sort((a, b) => a.player.smallID() - b.player.smallID());

  const measures: [AwardKind, (p: Player, t: AwardTally) => number][] = [
    ["mvp", (p, t) => mvpScore(t, numLandTiles, isWinner(p, winner))],
    ["betrayals", (_p, t) => t.betrayals],
    ["gold", (_p, t) => Number(t.gold)],
    ["ships", (_p, t) => t.ships],
  ];

  const awards: Award[] = [];
  for (const [kind, measure] of measures) {
    let best: { player: Player; value: number } | null = null;
    for (const { player, tally } of candidates) {
      const value = measure(player, tally);
      if (value > 0 && (best === null || value > best.value)) {
        best = { player, value };
      }
    }
    if (best !== null) {
      awards.push({
        kind,
        name: best.player.displayName(),
        clientID: best.player.clientID(),
        // Stays an exact whole number on the wire.
        value: Math.min(best.value, Number.MAX_SAFE_INTEGER),
      });
    }
  }
  return awards;
}
