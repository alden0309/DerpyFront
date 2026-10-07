import {
  MessageType,
  PlayerID,
  PlayerType,
  Relation,
} from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/**
 * Derpy Front: Trade Agreements.
 *
 * Two players with a Trade Agreement never have their ships attack each
 * other: warships don't shoot each other or each other's transports, and
 * don't capture each other's trade ships (WarshipExecution). Land war is
 * unaffected. A human answers a request from the events panel; a nation or
 * bot answers on the spot (aiAcceptsTradeAgreement). Either side can end it.
 */

/** Forms the agreement on both sides and tells both players. */
export function formTradeAgreement(mg: Game, a: Player, b: Player): void {
  a.addTradeAgreement(b);
  b.addTradeAgreement(a);
  a.clearTradeAgreementRequest(b);
  b.clearTradeAgreementRequest(a);
  for (const [me, other] of [
    [a, b],
    [b, a],
  ] as const) {
    mg.displayMessage(
      "events_display.trade_agreement_formed",
      MessageType.TRADE_AGREEMENT_ACCEPTED,
      me.id(),
      undefined,
      { name: other.displayName() },
      undefined,
      other.id(),
    );
  }
}

/**
 * Whether a nation (or bot) takes a Trade Agreement: yes, unless the two
 * are fighting on land right now or the nation already dislikes the asker.
 */
export function aiAcceptsTradeAgreement(
  ai: Player,
  requestor: Player,
): boolean {
  if (ai.type() === PlayerType.Bot) return true;
  const fighting =
    ai.outgoingAttacks().some((a) => a.target() === requestor) ||
    ai.incomingAttacks().some((a) => a.attacker() === requestor);
  if (fighting) return false;
  return ai.relation(requestor) >= Relation.Neutral;
}

export class TradeAgreementRequestExecution implements Execution {
  private active = true;

  constructor(
    private requestor: Player,
    private recipientID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.recipientID)) return;
    const recipient = mg.player(this.recipientID);
    const requestor = this.requestor;
    if (recipient === requestor || !recipient.isAlive()) return;
    if (requestor.hasTradeAgreementWith(recipient)) return;

    // They already asked us: asking back accepts.
    if (requestor.hasPendingTradeAgreementRequestFrom(recipient)) {
      formTradeAgreement(mg, requestor, recipient);
      return;
    }
    if (!requestor.canRequestTradeAgreement(recipient)) return;

    if (recipient.type() !== PlayerType.Human) {
      if (aiAcceptsTradeAgreement(recipient, requestor)) {
        formTradeAgreement(mg, requestor, recipient);
      } else {
        mg.displayMessage(
          "events_display.trade_agreement_declined",
          MessageType.TRADE_AGREEMENT_REJECTED,
          requestor.id(),
          undefined,
          { name: recipient.displayName() },
          undefined,
          recipient.id(),
        );
      }
      return;
    }

    recipient.receiveTradeAgreementRequest(requestor);
    // The recipient's events panel turns this into Accept / Decline buttons.
    mg.displayMessage(
      "events_display.trade_agreement_request",
      MessageType.TRADE_AGREEMENT_REQUEST,
      recipient.id(),
      undefined,
      { name: requestor.displayName() },
      undefined,
      requestor.id(),
    );
    mg.displayMessage(
      "events_display.trade_agreement_request_sent",
      MessageType.TRADE_AGREEMENT_REQUEST,
      requestor.id(),
      undefined,
      { name: recipient.displayName() },
      undefined,
      recipient.id(),
    );
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeAgreementRequestExecutionSnapshot.write({
      active: this.active,
      requestor: w.player(this.requestor),
      recipientID: this.recipientID,
    });
  }

  restoreSnapshot(s: TradeAgreementRequestState, r: SnapshotReader): void {
    this.active = s.active;
    this.requestor = r.player(s.requestor);
    this.recipientID = s.recipientID;
  }
}

export class TradeAgreementReplyExecution implements Execution {
  private active = true;

  constructor(
    private recipient: Player,
    private requestorID: PlayerID,
    private accept: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.requestorID)) return;
    const requestor = mg.player(this.requestorID);
    if (!this.recipient.hasPendingTradeAgreementRequestFrom(requestor)) return;
    this.recipient.clearTradeAgreementRequest(requestor);
    if (this.accept && requestor.isAlive() && this.recipient.isAlive()) {
      formTradeAgreement(mg, requestor, this.recipient);
      return;
    }
    mg.displayMessage(
      "events_display.trade_agreement_declined",
      MessageType.TRADE_AGREEMENT_REJECTED,
      requestor.id(),
      undefined,
      { name: this.recipient.displayName() },
      undefined,
      this.recipient.id(),
    );
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeAgreementReplyExecutionSnapshot.write({
      active: this.active,
      recipient: w.player(this.recipient),
      requestorID: this.requestorID,
      accept: this.accept,
    });
  }

  restoreSnapshot(s: TradeAgreementReplyState, r: SnapshotReader): void {
    this.active = s.active;
    this.recipient = r.player(s.recipient);
    this.requestorID = s.requestorID;
    this.accept = s.accept;
  }
}

export class TradeAgreementCancelExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private otherID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.otherID)) return;
    const other = mg.player(this.otherID);
    if (!this.player.hasTradeAgreementWith(other)) return;
    this.player.removeTradeAgreement(other);
    other.removeTradeAgreement(this.player);
    for (const [me, them] of [
      [this.player, other],
      [other, this.player],
    ] as const) {
      mg.displayMessage(
        "events_display.trade_agreement_ended",
        MessageType.TRADE_AGREEMENT_ENDED,
        me.id(),
        undefined,
        { name: them.displayName() },
        undefined,
        them.id(),
      );
    }
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return TradeAgreementCancelExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      otherID: this.otherID,
    });
  }

  restoreSnapshot(s: TradeAgreementCancelState, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.otherID = s.otherID;
  }
}

const TradeAgreementRequestStateSchema = z.object({
  active: z.boolean(),
  requestor: zPlayerRef(),
  recipientID: z.string(),
});
type TradeAgreementRequestState = z.infer<
  typeof TradeAgreementRequestStateSchema
>;

const TradeAgreementReplyStateSchema = z.object({
  active: z.boolean(),
  recipient: zPlayerRef(),
  requestorID: z.string(),
  accept: z.boolean(),
});
type TradeAgreementReplyState = z.infer<typeof TradeAgreementReplyStateSchema>;

const TradeAgreementCancelStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  otherID: z.string(),
});
type TradeAgreementCancelState = z.infer<
  typeof TradeAgreementCancelStateSchema
>;

export const TradeAgreementRequestExecutionSnapshot = execSnapshotType({
  name: "TradeAgreementRequest",
  version: 1,
  schema: TradeAgreementRequestStateSchema,
  cls: () => TradeAgreementRequestExecution,
});

export const TradeAgreementReplyExecutionSnapshot = execSnapshotType({
  name: "TradeAgreementReply",
  version: 1,
  schema: TradeAgreementReplyStateSchema,
  cls: () => TradeAgreementReplyExecution,
});

export const TradeAgreementCancelExecutionSnapshot = execSnapshotType({
  name: "TradeAgreementCancel",
  version: 1,
  schema: TradeAgreementCancelStateSchema,
  cls: () => TradeAgreementCancelExecution,
});
