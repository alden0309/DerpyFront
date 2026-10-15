// AIP (r23): which personality each AI nation plays (rules 6+).
//
// The deal (dealAiTypes) is a pure function of the game's config and its
// nations, both of which a snapshot keeps, so it is worked out on first use
// and remembered per game rather than stored: a restored game deals the same
// hand. Only the named AI nations play a personality, never tribes or humans.

import { PlayerID, PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  AIP_RULES,
  AiTuning,
  aiTuning,
  AiType,
  dealAiTypes,
  dealsPersonalities,
} from "@openfront/engine-lib/game/AiPersonalityTypes";
import type { Game, Player } from "./Game";

const deals = new WeakMap<Game, Map<PlayerID, AiType>>();

function dealFor(game: Game): Map<PlayerID, AiType> {
  let deal = deals.get(game);
  if (deal === undefined) {
    const config = game.config();
    const list = config.gameConfig().aiPersonalities;
    deal =
      config.derpyRules() >= AIP_RULES && dealsPersonalities(list)
        ? dealAiTypes(
            game.nations().map((n) => n.playerInfo.id),
            list,
          )
        : new Map();
    deals.set(game, deal);
  }
  return deal;
}

/** The personality the nation with this id plays, or null for Normal. */
export function nationAiType(game: Game, id: PlayerID): AiType | null {
  return dealFor(game).get(id) ?? null;
}

/** The personality `player` plays, or null (Normal, a tribe or a human). */
export function playerAiType(game: Game, player: Player): AiType | null {
  if (player.type() !== PlayerType.Nation) return null;
  return nationAiType(game, player.id());
}

/** How `player`'s personality tunes it (the usual tuning without one). */
export function playerAiTuning(game: Game, player: Player): AiTuning {
  return aiTuning(playerAiType(game, player));
}

/** Every nation dealt a personality in this game, by id. */
export function dealtAiTypes(game: Game): ReadonlyMap<PlayerID, AiType> {
  return dealFor(game);
}
