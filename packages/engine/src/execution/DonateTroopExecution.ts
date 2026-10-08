import { PlayerID, PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  TROOP_GIFT_RELATION,
  troopGiftRelationRange,
} from "@openfront/engine-lib/execution/RelationRules";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import {
  zNum,
  zPlayerRef,
  zRandom,
} from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";
import { EmojiExecution } from "./EmojiExecution";
import {
  EMOJI_DONATION_TOO_SMALL,
  EMOJI_LOVE,
} from "./nation/NationEmojiBehavior";

export class DonateTroopsExecution implements Execution {
  private recipient: Player;

  private random: PseudoRandom;
  private mg: Game;

  private active = true;

  constructor(
    private sender: Player,
    private recipientID: PlayerID,
    private troops: number | null,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.random = new PseudoRandom(mg.ticks());

    if (!mg.hasPlayer(this.recipientID)) {
      console.warn(
        `DonateTroopExecution recipient ${this.recipientID} not found`,
      );
      this.active = false;
      return;
    }

    this.recipient = mg.player(this.recipientID);
    this.troops ??= mg.config().defaultDonationAmount(this.sender);
    const maxDonation =
      mg.config().maxTroops(this.recipient) - this.recipient.troops();
    this.troops = Math.min(this.troops, maxDonation);

    if (this.troops <= 0) {
      this.active = false;
    }
  }

  tick(ticks: number): void {
    if (this.troops === null) throw new Error("not initialized");

    const minTroops = this.getMinTroopsForRelationUpdate();

    if (
      this.sender.canDonateTroops(this.recipient) &&
      this.sender.donateTroops(this.recipient, this.troops)
    ) {
      // Prevent players from just buying a good relation by sending 1% troops. Instead, a minimum is needed, and it's random.
      if (this.troops >= minTroops) {
        this.recipient.updateRelation(
          this.sender,
          TROOP_GIFT_RELATION,
          "gift_troops",
        );
      }

      // Only AI nations auto-respond with emojis, human players should not
      if (
        this.recipient.type() === PlayerType.Nation &&
        this.recipient.canSendEmoji(this.sender)
      ) {
        this.mg.addExecution(
          new EmojiExecution(
            this.recipient,
            this.sender.id(),
            this.random.randElement(
              this.troops >= minTroops ? EMOJI_LOVE : EMOJI_DONATION_TOO_SMALL,
            ),
          ),
        );
      }
    } else {
      console.warn(
        `cannot send troops from ${this.sender} to ${this.recipient}`,
      );
    }
    this.active = false;
  }

  private getMinTroopsForRelationUpdate(): number {
    const { difficulty } = this.mg.config().gameConfig();
    const recipientMaxTroops = this.mg.config().maxTroops(this.recipient);
    const [min, max] = troopGiftRelationRange(difficulty, recipientMaxTroops);
    return this.random.nextInt(min, max);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return DonateTroopsExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      recipient: this.recipient === undefined ? null : w.player(this.recipient),
      random: this.random === undefined ? null : w.random(this.random),
      sender: w.player(this.sender),
      recipientID: this.recipientID,
      troops: this.troops,
    });
  }

  restoreSnapshot(s: DonateTroopsState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    if (s.recipient !== null) this.recipient = r.player(s.recipient);
    if (s.random !== null) this.random = r.random(s.random);
    this.sender = r.player(s.sender);
    this.recipientID = s.recipientID;
    this.troops = s.troops;
  }
}

const DonateTroopsStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  recipient: zPlayerRef().nullable(),
  random: zRandom().nullable(),
  sender: zPlayerRef(),
  recipientID: z.string(),
  troops: zNum().nullable(),
});
type DonateTroopsState = z.infer<typeof DonateTroopsStateSchema>;

export const DonateTroopsExecutionSnapshot = execSnapshotType({
  name: "DonateTroops",
  version: 1,
  schema: DonateTroopsStateSchema,
  cls: () => DonateTroopsExecution,
});
