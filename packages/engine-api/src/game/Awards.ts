import { zb } from "@openfront/zbin";
import { z } from "zod";
import { ID } from "../Schemas";

/**
 * Derpy Front's end-of-game awards. The engine hands them out when the game
 * is decided (GameImpl.setWinner) and they ride the Win update to the end
 * screen; the client also sends them with its winner vote so the server can
 * pay award bonuses in Derp Coins.
 */
export const AWARD_KINDS = ["mvp", "betrayals", "gold", "ships"] as const;
export const AwardKindSchema = z.enum(AWARD_KINDS);
export type AwardKind = z.infer<typeof AwardKindSchema>;

export const AwardSchema = z.object({
  kind: AwardKindSchema,
  /** Display name of the player or nation that won it. */
  name: zb.string({ max: 200 }),
  /** The winner's clientID, or null when a nation won it. */
  clientID: ID.nullable(),
  /**
   * What they won it with: the MVP score, betrayals, gold earned, or ships
   * launched. A whole number, not a bigint, so it stays plain JSON.
   */
  value: zb.uint(),
});
export type Award = z.infer<typeof AwardSchema>;

export const GameAwardsSchema = AwardSchema.array().max(AWARD_KINDS.length);
export type GameAwards = z.infer<typeof GameAwardsSchema>;
