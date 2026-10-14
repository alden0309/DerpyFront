// Derpy Front (DFSTORE r21): giving AI nations the personas of the host's AI
// personality packs. Runs once, when a game's nations are made: each nation
// takes a persona's name and flag (the flag also tells the engine its
// temperament, see nationTemperament). The personas are dealt from their own
// seeded stream, so the game's other random draws don't move.

import {
  Nation,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import {
  NO_TEMPERAMENT,
  personaFlag,
  personaFromFlag,
  personaName,
  personaPool,
  TEMPERAMENT_TUNING,
  TemperamentTuning,
} from "@openfront/engine-lib/game/AiPersonalities";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { simpleHash } from "@openfront/engine-lib/Util";
import type { Game, Player } from "./Game";

/** Rules edition from which AI personas exist. */
export const PERSONA_RULES = 5;

function personasOn(config: GameConfig, rules: number): boolean {
  return rules >= PERSONA_RULES && (config.aiPersonalities?.length ?? 0) > 0;
}

/**
 * The game's nations, each playing a persona from the packs in `config`.
 * Nations are dealt the personas in a shuffled order; once every persona is
 * in play the deal starts again with numbered names ("… II"). With no packs,
 * or rules before 5, the nations come back unchanged.
 */
export function applyNationPersonas(
  nations: Nation[],
  config: GameConfig,
  rules: number,
  gameID: string,
): Nation[] {
  if (!personasOn(config, rules) || nations.length === 0) return nations;
  const pool = personaPool(config.aiPersonalities);
  if (pool.length === 0) return nations;
  const random = new PseudoRandom(simpleHash(`${gameID}:personas`));
  const deck = random.shuffleArray(pool);
  return nations.map((n, i) => {
    const persona = deck[i % deck.length];
    const round = Math.floor(i / deck.length) + 1;
    const info = n.playerInfo;
    return new Nation(
      n.spawnCell,
      new PlayerInfo(
        personaName(persona, round),
        PlayerType.Nation,
        info.clientID,
        info.id,
        info.isLobbyCreator,
        info.clanTag,
        info.friends,
        info.teamIndex,
        personaFlag(persona),
      ),
    );
  });
}

/**
 * How a nation flying `flag` is tuned: its persona's temperament, in a rules
 * 5+ game whose config lists the persona's pack; the usual tuning otherwise.
 */
export function temperamentForFlag(
  game: Game,
  flag: string | null,
): TemperamentTuning {
  const config = game.config();
  if (config.derpyRules() < PERSONA_RULES) return NO_TEMPERAMENT;
  const persona = personaFromFlag(flag);
  if (!persona) return NO_TEMPERAMENT;
  const packs = config.gameConfig().aiPersonalities;
  if (!packs?.includes(persona.pack)) return NO_TEMPERAMENT;
  return TEMPERAMENT_TUNING[persona.temperament];
}

/** How `player`'s temperament tunes it (the usual tuning for non-nations). */
export function nationTemperament(
  game: Game,
  player: Player,
): TemperamentTuning {
  if (player.type() !== PlayerType.Nation) return NO_TEMPERAMENT;
  return temperamentForFlag(game, player.info().nationFlag);
}
