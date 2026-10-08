import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import type {
  AllianceBlocker,
  AllianceOutlook,
  AllianceSituation,
  Opinion,
} from "@openfront/engine-api/game/Opinion";
import {
  acceptChance,
  allianceCapShare,
  allianceOdds,
} from "@openfront/engine-lib/execution/AllianceRules";
import {
  attackRelationPenalty,
  goldPerRelationStep,
  troopGiftRelationRange,
} from "@openfront/engine-lib/execution/RelationRules";
import { Game, Player } from "../../game/Game";
import { shownRelationValue } from "../../game/RelationReasons";
import { nationAllianceFacts } from "./NationAllianceBehavior";

/**
 * The player panel's "Their opinion of you": what a nation or tribe thinks
 * of a human, why, and whether it would ally with them right now. Built on
 * request when the panel asks (GameRunner.playerProfile) and only reads the
 * game: the alliance odds come from AllianceRules.allianceOdds, which
 * replays the nation's own decision without drawing from any PRNG.
 */
export function opinionOfViewer(
  game: Game,
  subject: Player,
  viewer: Player,
): Opinion | undefined {
  if (subject === viewer) return undefined;
  if (subject.type() === PlayerType.Human) return undefined;
  if (viewer.type() !== PlayerType.Human) return undefined;
  const config = game.config();
  const { difficulty } = config.gameConfig();
  const [, troopMax] = troopGiftRelationRange(
    difficulty,
    config.maxTroops(subject),
  );
  return {
    value: shownRelationValue(subject.relationValue(viewer)),
    relation: subject.relation(viewer),
    reasons: subject.relationReasons(viewer),
    attackPenalty: attackRelationPenalty(difficulty),
    goldPerStep: Number(
      goldPerRelationStep(
        difficulty,
        game.ticks(),
        config.numSpawnPhaseTurns(),
      ),
    ),
    troopsForBonus: Math.floor(troopMax),
    alliance: allianceOutlook(game, subject, viewer),
  };
}

/**
 * Whether `subject` (a nation or tribe) would ally with `viewer` now. The
 * checks before the decision mirror canSendAllianceRequest,
 * AllianceRequestExecution and NationAllianceBehavior.handleAllianceRequests.
 */
export function allianceOutlook(
  game: Game,
  subject: Player,
  viewer: Player,
): AllianceOutlook {
  const config = game.config();
  const blocked = (blocker: AllianceBlocker): AllianceOutlook => ({
    situation: "blocked",
    blocker,
    chance: 0,
    outcomes: [],
  });
  const tribe = subject.type() === PlayerType.Bot;
  if (config.disableAlliances()) return blocked("alliances_disabled");
  if (viewer.isOnSameTeam(subject)) return blocked("same_team");
  if (viewer.isDisconnected() || subject.isDisconnected()) {
    return blocked("disconnected");
  }
  const allied = viewer.isAlliedWith(subject);
  if (
    !allied &&
    subject.outgoingAllianceRequests().some((r) => r.recipient() === viewer)
  ) {
    return { situation: "they_asked", chance: 1, outcomes: [] };
  }
  // A nation turns down every request made before the game starts.
  if (!allied && !tribe && game.ticks() <= config.numSpawnPhaseTurns()) {
    return blocked("spawn_phase");
  }

  const cooldownTicks = viewer.allianceRequestCooldownTicks(subject);
  let situation: AllianceSituation = "request";
  if (allied) situation = "renewal";
  else if (
    viewer.outgoingAllianceRequests().some((r) => r.recipient() === subject)
  ) {
    situation = "pending";
  } else if (cooldownTicks > 0) situation = "cooldown";
  const base = {
    situation,
    ...(situation === "cooldown" ? { cooldownTicks } : {}),
  };

  // Tribes take every request and every renewal (TribeExecution).
  if (tribe) return { ...base, tribe: true, chance: 1, outcomes: [] };

  const facts = nationAllianceFacts(game, subject, viewer, true);
  const outcomes = allianceOdds(facts);
  const capShare = allianceCapShare(config.gameConfig().difficulty);
  return {
    ...base,
    chance: acceptChance(outcomes),
    outcomes,
    ...(capShare === null
      ? {}
      : { allianceCap: Math.ceil(facts.nonTribePlayers() * capShare) }),
  };
}
