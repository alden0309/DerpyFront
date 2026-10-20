import { GameConfigSchema } from "@openfront/engine-api/Schemas";
import {
  PublicGameInfoSchema,
  PublicGameTypeSchema,
} from "@openfront/shared/WireSchemas";
import { z } from "zod";

export type InternalGameInfo = z.infer<typeof InternalGameInfoSchema>;
export type InternalPublicGames = z.infer<typeof InternalPublicGamesSchema>;
export type WorkerLobbyList = z.infer<typeof WorkerLobbyListSchema>;
export type WorkerReady = z.infer<typeof WorkerReadySchema>;
export type MasterLobbiesBroadcast = z.infer<
  typeof MasterLobbiesBroadcastSchema
>;

export type MasterUpdateGame = z.infer<typeof MasterUpdateGameSchema>;
export type MasterCreateGame = z.infer<typeof MasterCreateGameSchema>;
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;
export type MasterMessage = z.infer<typeof MasterMessageSchema>;

// Master/worker-internal lobby info: PublicGameInfo plus the hashed creator
// ID (hosted lobbies only) used for the one-listed-lobby-per-creator check,
// and the lobby's creation time (used for queue order).
// Never sent to browsers — WorkerLobbyService.sanitizeGames converts to plain
// PublicGameInfo before anything reaches a client.
export const InternalGameInfoSchema = PublicGameInfoSchema.extend({
  creatorID: z.string().optional(),
  // When the worker created the lobby. The master orders the queue behind the
  // counting-down lobby by this, so lobbies advance one place as the front one
  // starts instead of shuffling when a new one spawns.
  createdAt: z.number().optional(),
  // Paid-queued hosted lobbies only: when the host paid. The master puts
  // these right behind the counting-down lobby, oldest payment first.
  queuedAt: z.number().optional(),
});

export const InternalPublicGamesSchema = z.object({
  serverTime: z.number(),
  games: z.partialRecord(PublicGameTypeSchema, z.array(InternalGameInfoSchema)),
});

// --- Worker Messages ---

// Worker tells the master about its lobbies. Entries are deliberately not
// validated here: the master checks each against InternalGameInfoSchema and
// drops bad ones (MasterLobbyService.validLobbies), so a single malformed
// lobby can't invalidate the whole report and freeze the master's view of
// this worker's lobbies.
const WorkerLobbyListSchema = z.object({
  type: z.literal("lobbyList"),
  lobbies: z.array(z.unknown()),
  // Games this worker is running, lobbies included. The master sums them
  // for the cluster check-in (ClusterCheckin.ts), so an operator can tell
  // when a draining server is empty. Optional for a worker build that
  // predates it; absent counts as zero.
  liveGames: z.number().int().min(0).optional(),
  // Derp Land (SITE r19): this worker's games being played that may be
  // watched, sent only when they changed (absent: as last sent). Entries are
  // checked one by one, like lobbies (LiveFrontGameSchema).
  running: z.array(z.unknown()).optional(),
  // Derp Land (FRIENDS r25): this worker's lobbies whose host gave them a
  // password: only their ids, for the lock in who's online. Absent (an
  // older worker): none.
  locked: z.array(z.string().max(20)).max(2000).optional(),
});

// Derp Land (SITE r19): one game being played, as the front page lists it.
export const LiveFrontGameSchema = z.object({
  game: z.literal("derpyfront"),
  id: z.string().max(20),
  map: z.string().max(100),
  mapKey: z.string().max(100),
  mode: z.string().max(40),
  scenario: z.string().max(60).optional(), // SCEN (r25)
  private: z.boolean(),
  startedAt: z.number(),
  players: z.number().int().min(0),
  playersLeft: z.number().int().min(0),
  watchers: z.number().int().min(0),
  full: z.boolean(),
});

const WorkerReadySchema = z.object({
  type: z.literal("workerReady"),
  workerId: z.number(),
});

export const WorkerMessageSchema = z.discriminatedUnion("type", [
  WorkerLobbyListSchema,
  WorkerReadySchema,
]);

// --- Master Messages ---

const MasterUpdateGameSchema = z.object({
  type: z.literal("updateLobby"),
  gameID: z.string(),
  startsAt: z.number(),
});

// Broadcasts all public game info to all workers.
// Workers need information on all public lobbies so
// it can send it to the client.
const MasterLobbiesBroadcastSchema = z.object({
  type: z.literal("lobbiesBroadcast"),
  publicGames: InternalPublicGamesSchema,
  // Hosted lobbies the master wants delisted: a creator got two lobbies
  // listed concurrently on different workers, and only the dedup winner may
  // stay advertised. The owning worker clears the loser's listed flag so
  // worker state, host UI, and the broadcast agree.
  delistGameIDs: z.array(z.string()).optional(),
  // Whether this deployment is the one the load balancer routes to. Workers
  // stamp it onto the public-lobby feed so pinned homepage tabs on a draining
  // deployment learn to reload (see PublicLobbyFullSchema.active). Optional
  // only for old fixtures; the master always sends it, absent means active.
  active: z.boolean().optional(),
});

// Master sends a message to worker to schedule a new public game/lobby.
const MasterCreateGameSchema = z.object({
  type: z.literal("createGame"),
  gameID: z.string(),
  gameConfig: GameConfigSchema,
  publicGameType: PublicGameTypeSchema,
});

export const MasterMessageSchema = z.discriminatedUnion("type", [
  MasterLobbiesBroadcastSchema,
  MasterCreateGameSchema,
  MasterUpdateGameSchema,
]);
