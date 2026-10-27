import {
  ScenarioAskJoinIntent,
  ScenarioGiftIntent,
  ScenarioInviteIntent,
  ScenarioJoinReplyIntent,
} from "@openfront/engine-api/Schemas";
import { simpleHash } from "@openfront/engine-lib/Util";
import {
  zInt,
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
import {
  registerDiplomacy,
  ScenarioDiplomacy,
  scenarioDiplomacy,
} from "./ScenarioDiplomacy";

/**
 * DIPLO (r27): runs courting in a Scenario game (ScenarioDiplomacy.ts) for
 * the whole game: goodwill fading, invitations and asks timing out, and the
 * computer-run sides' gifts. GameRunner adds it when the game's scenario
 * edition has courting (diplomacyEnabled). It holds the state, so the state
 * is in the game's snapshot.
 */
export class ScenarioDiplomacyExecution implements Execution {
  private d: ScenarioDiplomacy | null = null;

  constructor(private gameID: string = "") {}

  init(mg: Game): void {
    this.d = new ScenarioDiplomacy(mg, simpleHash(this.gameID) + 27);
    registerDiplomacy(mg, this.d);
  }

  tick(): void {
    this.d?.tick();
  }

  isActive(): boolean {
    return true;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(): ExecRecord {
    return ScenarioDiplomacyExecutionSnapshot.write({
      gameID: this.gameID,
      state: this.d === null ? null : this.d.toData(),
    });
  }

  restoreSnapshot(s: ScenarioDiplomacyState, r: SnapshotReader): void {
    this.gameID = s.gameID;
    this.d =
      s.state === null ? null : ScenarioDiplomacy.fromData(r.game, s.state);
    if (this.d !== null) registerDiplomacy(r.game, this.d);
  }
}

const DiplomacyDataSchema = z.object({
  started: zInt().nullable(),
  size: z.array(z.tuple([zInt(), zInt()])),
  goodwill: z.array(z.tuple([z.string(), zInt()])),
  rate: zInt(),
  invitedAt: z.array(z.tuple([z.string(), zInt()])),
  askedAt: z.array(z.tuple([z.string(), zInt()])),
  invites: z.array(z.tuple([z.string(), z.tuple([zInt(), zInt()])])),
  asks: z.array(z.tuple([z.string(), zInt()])),
  ai: z.array(z.tuple([zInt(), z.tuple([zInt(), zInt()])])),
  random: zRandom(),
});

const ScenarioDiplomacyStateSchema = z.object({
  gameID: z.string(),
  state: DiplomacyDataSchema.nullable(),
});
type ScenarioDiplomacyState = z.infer<typeof ScenarioDiplomacyStateSchema>;

export const ScenarioDiplomacyExecutionSnapshot = execSnapshotType({
  name: "ScenarioDiplomacy",
  version: 1,
  schema: ScenarioDiplomacyStateSchema,
  cls: () => ScenarioDiplomacyExecution,
});

type DiplomacyIntent =
  | ScenarioGiftIntent
  | ScenarioInviteIntent
  | ScenarioAskJoinIntent
  | ScenarioJoinReplyIntent;

/**
 * DIPLO (r27): one player's courting intent (a gift, an invitation, an ask
 * to join, an answer), applied on the tick it arrives. Does nothing in a
 * game without courting.
 */
export class ScenarioDiplomacyIntentExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private intent: DiplomacyIntent,
  ) {}

  init(mg: Game): void {
    this.active = false;
    const d = scenarioDiplomacy(mg);
    if (d === null) return;
    const i = this.intent;
    const other = (id: string): Player | null =>
      mg.hasPlayer(id) ? mg.player(id) : null;
    switch (i.type) {
      case "scenario_gift": {
        const n = other(i.neutral);
        if (n !== null) d.gift(this.player, n, i.gold);
        return;
      }
      case "scenario_invite": {
        const n = other(i.neutral);
        if (n !== null) d.invite(this.player, n);
        return;
      }
      case "scenario_ask_join":
        d.askToJoin(this.player, i.side);
        return;
      case "scenario_join_reply": {
        const o = other(i.other);
        if (o !== null) d.reply(this.player, o, i.accept);
        return;
      }
    }
  }

  tick(): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return ScenarioDiplomacyIntentExecutionSnapshot.write({
      active: this.active,
      player: w.player(this.player),
      intent: JSON.stringify(this.intent),
    });
  }

  restoreSnapshot(s: ScenarioDiplomacyIntentState, r: SnapshotReader): void {
    this.active = s.active;
    this.player = r.player(s.player);
    this.intent = JSON.parse(s.intent) as DiplomacyIntent;
  }
}

const ScenarioDiplomacyIntentStateSchema = z.object({
  active: z.boolean(),
  player: zPlayerRef(),
  intent: z.string(),
});
type ScenarioDiplomacyIntentState = z.infer<
  typeof ScenarioDiplomacyIntentStateSchema
>;

export const ScenarioDiplomacyIntentExecutionSnapshot = execSnapshotType({
  name: "ScenarioDiplomacyIntent",
  version: 1,
  schema: ScenarioDiplomacyIntentStateSchema,
  cls: () => ScenarioDiplomacyIntentExecution,
});
