import { Difficulty, PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  allianceDice,
  AllianceEmoji,
  AllianceFacts,
  AllianceStrength,
  decideAlliance,
} from "@openfront/engine-lib/execution/AllianceRules";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  readVersioned,
  snapshotType,
  Versioned,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Game, Player } from "../../game/Game";
import { playerAiTuning } from "../../game/NationAiTypes";
import type {
  SnapshotReader,
  SnapshotWriter,
} from "../../snapshot/SnapshotContext";
import { AllianceExtensionExecution } from "../alliance/AllianceExtensionExecution";
import { AllianceRequestExecution } from "../alliance/AllianceRequestExecution";
import {
  EMOJI_CONFUSED,
  EMOJI_HANDSHAKE,
  EMOJI_LOVE,
  EMOJI_SCARED_OF_THREAT,
  NationEmojiBehavior,
} from "./NationEmojiBehavior";
import { findJuiciestTarget, findRunawayLeader } from "./NationUtils";

const ALLIANCE_EMOJIS: Record<AllianceEmoji, number[]> = {
  confused: EMOJI_CONFUSED,
  scared: EMOJI_SCARED_OF_THREAT,
  love: EMOJI_LOVE,
  handshake: EMOJI_HANDSHAKE,
};

/**
 * What `nation` weighs about `other` when deciding on an alliance (see
 * AllianceRules). Each fact is read when the decision first needs it.
 */
export function nationAllianceFacts(
  game: Game,
  nation: Player,
  other: Player,
  isResponse: boolean,
): AllianceFacts {
  const { difficulty, gameMode } = game.config().gameConfig();
  let strength: AllianceStrength | null = null;
  const attackTroops = (p: Player) =>
    p.outgoingAttacks().reduce((sum, attack) => sum + attack.troops(), 0);
  return {
    difficulty,
    gameMode,
    isResponse,
    ticks: game.ticks(),
    numSpawnPhaseTurns: game.config().numSpawnPhaseTurns(),
    isTraitor: () => other.isTraitor(),
    theirAlliances: () => other.alliances().length,
    nonTribePlayers: () =>
      game.players().filter((p) => p.type() !== PlayerType.Bot).length,
    isRunawayLeader: () => findRunawayLeader(game) === other,
    relation: () => nation.relation(other),
    ourAlliances: () => nation.alliances().length,
    neighbours: () => {
      const bordering = nation
        .nearby()
        .filter(
          (n): n is Player => n.isPlayer() && n.type() !== PlayerType.Bot,
        );
      return {
        count: bordering.length,
        friendly: bordering.filter((o) => nation.isFriendly(o) === true).length,
        includesThem: bordering.includes(other),
      };
    },
    strength: () =>
      (strength ??= {
        ourTroops: nation.troops(),
        theirTroops: other.troops(),
        ourMaxTroops: game.config().maxTroops(nation),
        theirMaxTroops: game.config().maxTroops(other),
        ourTiles: nation.numTilesOwned(),
        theirTiles: other.numTilesOwned(),
        ourAttackTroops: attackTroops(nation),
        theirAttackTroops: attackTroops(other),
      }),
  };
}

export class NationAllianceBehavior {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
    private emojiBehavior: NationEmojiBehavior,
  ) {}

  /** No state of its own; the owner supplies the shared references. */
  snapshot(w: SnapshotWriter): Versioned {
    return w.versioned(NationAllianceBehaviorSnapshot, {});
  }

  /** Fills a prototype-only shell; only assigns (see README). */
  restoreSnapshot(
    raw: unknown,
    r: SnapshotReader,
    random: PseudoRandom,
    player: Player,
    emojiBehavior: NationEmojiBehavior,
  ): void {
    readVersioned(NationAllianceBehaviorSnapshot, raw);
    this.random = random;
    this.game = r.game;
    this.player = player;
    this.emojiBehavior = emojiBehavior;
  }

  handleAllianceRequests() {
    if (this.game.config().disableAlliances()) return;

    for (const req of this.player.incomingAllianceRequests()) {
      // Alliance Request intents created during the spawn phase are executed on
      // the first tick post-spawn phase. With the following condition we reject
      // all requests created during the spawn phase.
      if (req.createdAt() <= this.game.config().numSpawnPhaseTurns() + 1) {
        req.reject();
        continue;
      }
      if (this.getAllianceDecision(req.requestor(), true)) {
        req.accept();
      } else {
        req.reject();
      }
    }
  }

  handleAllianceExtensionRequests() {
    if (this.game.config().disableAlliances()) return;

    for (const alliance of this.player.alliances()) {
      // Alliance expiration tracked by Events Panel, only human ally can click Request to Renew
      // Skip if no expiration yet/ ally didn't request extension yet / nation already agreed to extend
      if (!alliance.onlyOneAgreedToExtend()) continue;

      const human = alliance.other(this.player);
      if (!this.getAllianceDecision(human, true)) continue;

      this.game.addExecution(
        new AllianceExtensionExecution(this.player, human.id()),
      );
    }
  }

  maybeSendAllianceRequests(borderingEnemies: Player[]) {
    if (this.game.config().disableAlliances()) return;

    // Only easy nations are allowed to send alliance requests to bots
    const isAcceptablePlayerType = (p: Player) =>
      (p.type() === PlayerType.Bot &&
        this.game.config().gameConfig().difficulty === Difficulty.Easy) ||
      p.type() !== PlayerType.Bot;

    // AIP (r23): Traders and Protectors ask more often (rules 6+)
    const odds = playerAiTuning(this.game, this.player).allyAskOdds;
    for (const enemy of borderingEnemies) {
      if (
        this.random.chance(odds) &&
        isAcceptablePlayerType(enemy) &&
        this.player.canSendAllianceRequest(enemy) &&
        this.getAllianceDecision(enemy, false)
      ) {
        this.game.addExecution(
          new AllianceRequestExecution(this.player, enemy.id()),
        );
      }
    }
  }

  private getAllianceDecision(
    otherPlayer: Player,
    isResponse: boolean,
  ): boolean {
    return decideAlliance(
      nationAllianceFacts(this.game, this.player, otherPlayer, isResponse),
      allianceDice(this.random),
      (e) => this.emojiBehavior.sendEmoji(otherPlayer, ALLIANCE_EMOJIS[e]),
    ).accept;
  }

  // juiciestAlly comes from findJuiciestAlly(borderingFriends) - callers looping
  // over borderingFriends should compute it once, not on every call
  maybeBetray(
    otherPlayer: Player,
    juiciestAlly: Player | null,
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ): boolean {
    if (!this.player.isAlliedWith(otherPlayer)) return false;

    // AIP (r23): a personality turns on its allies more or less readily
    // (rules 6+)
    const style = playerAiTuning(this.game, this.player).betrayal;
    if (style !== "usual") {
      return this.maybeBetrayAs(
        style,
        otherPlayer,
        juiciestAlly,
        borderingFriends,
        borderingEnemies,
      );
    }

    const { difficulty } = this.game.config().gameConfig();

    // Betray our juiciest ally (e.g. a MIRVed one), if it's safe to do so (everybody around us is weak)
    if (
      (difficulty === Difficulty.Hard ||
        difficulty === Difficulty.Impossible) &&
      juiciestAlly === otherPlayer &&
      this.isSafeToBetray(otherPlayer, borderingFriends, borderingEnemies)
    ) {
      this.betray(otherPlayer);
      return true;
    }

    // Betray very weak players (similar check as above but for the easier difficulties)
    // This doesn't check for maxTroops and isn't really smart. It makes nations vulnerable, but that's intended.
    // On easy, don't betray humans
    if (
      (difficulty === Difficulty.Easy || difficulty === Difficulty.Medium) &&
      !(
        difficulty === Difficulty.Easy &&
        otherPlayer.type() === PlayerType.Human
      ) &&
      this.player.troops() >= otherPlayer.troops() * 10
    ) {
      this.betray(otherPlayer);
      return true;
    }

    // Betray traitors who aren't significantly stronger than us
    if (
      difficulty !== Difficulty.Easy &&
      otherPlayer.isTraitor() &&
      otherPlayer.troops() < this.player.troops() * 1.2
    ) {
      this.betray(otherPlayer);
      return true;
    }

    // Betray our only bordering player if we are much stronger than them
    if (
      difficulty !== Difficulty.Easy &&
      borderingFriends.length + borderingEnemies.length === 1 &&
      otherPlayer.troops() * 3 < this.player.troops()
    ) {
      this.betray(otherPlayer);
      return true;
    }

    return false;
  }

  /**
   * AIP (r23): betrayal by personality.
   * - rarely (Protector): only a traitor ally with less than half its troops.
   * - less (Trader): only a traitor ally not much stronger than itself, or
   *   on Easy and Medium an ally twenty times weaker (ten, usually).
   * - more (Aggressive): on every difficulty, its juiciest ally once those
   *   around it hold under half its troops (a third, usually, and Hard and
   *   up only), an ally four times weaker (ten), a traitor ally not much
   *   stronger, and its only neighbour once twice as strong (three times).
   */
  private maybeBetrayAs(
    style: "rarely" | "less" | "more",
    otherPlayer: Player,
    juiciestAlly: Player | null,
    borderingFriends: Player[],
    borderingEnemies: Player[],
  ): boolean {
    const ours = this.player.troops();
    const theirs = otherPlayer.troops();
    const { difficulty } = this.game.config().gameConfig();
    let betray = false;
    switch (style) {
      case "rarely":
        betray = otherPlayer.isTraitor() && theirs * 2 < ours;
        break;
      case "less":
        betray =
          (otherPlayer.isTraitor() && theirs < ours * 1.2) ||
          ((difficulty === Difficulty.Easy ||
            difficulty === Difficulty.Medium) &&
            ours >= theirs * 20);
        break;
      case "more":
        betray =
          (juiciestAlly === otherPlayer &&
            this.isSafeToBetray(
              otherPlayer,
              borderingFriends,
              borderingEnemies,
              0.5,
            )) ||
          ours >= theirs * 4 ||
          (otherPlayer.isTraitor() && theirs < ours * 1.2) ||
          (borderingFriends.length + borderingEnemies.length === 1 &&
            theirs * 2 < ours);
        break;
    }
    if (betray) this.betray(otherPlayer);
    return betray;
  }

  // Juiciest ally regardless of strength; isSafeToBetray() rejects the too-strong ones
  findJuiciestAlly(borderingFriends: Player[]): Player | null {
    const candidates = borderingFriends.filter((friend) =>
      this.player.isAlliedWith(friend),
    );
    return findJuiciestTarget(this.game, candidates);
  }

  // Safe if target + non-allied neighbors + (unless target's already a traitor,
  // since betraying them wouldn't make us one) our other allies stay under a third of our troops
  private isSafeToBetray(
    target: Player,
    borderingFriends: Player[],
    borderingEnemies: Player[],
    share = 0.33,
  ): boolean {
    const otherAllies = target.isTraitor()
      ? []
      : borderingFriends.filter(
          (f) => f !== target && this.player.isAlliedWith(f),
        );
    const threats = [target, ...borderingEnemies, ...otherAllies];
    const nearbyThreatTroops = threats.reduce((sum, threat) => {
      const outgoing = threat
        .outgoingAttacks()
        .reduce((s, attack) => s + attack.troops(), 0);
      return sum + threat.troops() + outgoing;
    }, 0);
    return nearbyThreatTroops < this.player.troops() * share;
  }

  private betray(target: Player): void {
    const alliance = this.player.allianceWith(target);
    if (!alliance) return;
    this.player.breakAlliance(alliance);
  }
}

export const NationAllianceBehaviorSnapshot = snapshotType({
  name: "NationAllianceBehavior",
  version: 1,
  schema: z.object({}),
});
