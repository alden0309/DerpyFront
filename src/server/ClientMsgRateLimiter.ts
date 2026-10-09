import { ClientID } from "@openfront/engine-api/Schemas";
import {
  CHAT_BURST,
  CHAT_PER_MINUTE,
  CHAT_REFILL_MS,
} from "@openfront/shared/Chat";
import { RateLimiter, TokenBucket } from "limiter";

const INTENTS_PER_SECOND = 10;
const INTENTS_PER_MINUTE = 150;
const MAX_INTENT_SIZE = 2000;
// A rejoin makes the server serialize and send the turn history since
// `lastTurn`, which is the full game so far when lastTurn is 0. A real client
// only sends one per (re)connect, so anything beyond a handful per minute is
// abuse.
const REJOINS_PER_MINUTE = 5;
const TOTAL_BYTES = 5 * 1024 * 1024; // 5MB per client
// A chat frame is at most 200 characters of text plus a recipient list; one
// far bigger than that was not built by our client.
const MAX_CHAT_SIZE = 4000;
export type RateLimitResult = "ok" | "limit" | "kick";

interface ClientBucket {
  perSecond: RateLimiter;
  perMinute: RateLimiter;
  rejoinPerMinute: RateLimiter;
  // Derpy Front chat: a small burst refilled slowly, and a per-minute cap.
  // Over the limit a line is dropped, not the player kicked: typing fast is
  // not an attack.
  chatBurst: TokenBucket;
  chatPerMinute: RateLimiter;
  totalBytes: number;
}

export class ClientMsgRateLimiter {
  private buckets = new Map<ClientID, ClientBucket>();

  check(clientID: ClientID, type: string, bytes: number): RateLimitResult {
    const bucket = this.getOrCreate(clientID);
    bucket.totalBytes += bytes;

    if (bucket.totalBytes >= TOTAL_BYTES) return "kick";

    if (type === "intent") {
      // Intents are stored in turn history for the duration of the game, so
      // oversized intents would accumulate and fill up server RAM.
      // Intents are also sent to all players, so it increase outgoing
      // data.
      // Intents should never be larger than MAX_INTENT_SIZE, so we assume the client is malicious.
      if (bytes > MAX_INTENT_SIZE) {
        return "kick";
      }
      if (
        !bucket.perSecond.tryRemoveTokens(1) ||
        !bucket.perMinute.tryRemoveTokens(1)
      ) {
        return "limit";
      }
    } else if (type === "rejoin") {
      if (!bucket.rejoinPerMinute.tryRemoveTokens(1)) {
        return "limit";
      }
    } else if (type === "chat") {
      if (bytes > MAX_CHAT_SIZE) {
        return "kick";
      }
      // The burst is checked before the per-minute cap is spent, and spent
      // only once the cap has agreed, so a refused line costs nothing.
      bucket.chatBurst.drip();
      if (
        bucket.chatBurst.content < 1 ||
        !bucket.chatPerMinute.tryRemoveTokens(1)
      ) {
        return "limit";
      }
      bucket.chatBurst.tryRemoveTokens(1);
    }

    return "ok";
  }

  private getOrCreate(clientID: ClientID): ClientBucket {
    const existing = this.buckets.get(clientID);
    if (existing) {
      return existing;
    }
    const bucket = {
      perSecond: new RateLimiter({
        tokensPerInterval: INTENTS_PER_SECOND,
        interval: "second",
      }),
      perMinute: new RateLimiter({
        tokensPerInterval: INTENTS_PER_MINUTE,
        interval: "minute",
      }),
      rejoinPerMinute: new RateLimiter({
        tokensPerInterval: REJOINS_PER_MINUTE,
        interval: "minute",
      }),
      chatBurst: fullBucket(
        new TokenBucket({
          bucketSize: CHAT_BURST,
          tokensPerInterval: 1,
          interval: CHAT_REFILL_MS,
        }),
      ),
      chatPerMinute: new RateLimiter({
        tokensPerInterval: CHAT_PER_MINUTE,
        interval: "minute",
      }),
      totalBytes: 0,
    };
    this.buckets.set(clientID, bucket);
    return bucket;
  }
}

// A TokenBucket starts empty; a player's first lines should not wait.
function fullBucket(bucket: TokenBucket): TokenBucket {
  bucket.content = bucket.bucketSize;
  return bucket;
}
