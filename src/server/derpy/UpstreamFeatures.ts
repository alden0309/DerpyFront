// Derpy Front (DFX r26): OpenFront server features switched off on this
// site, the server's counterpart to src/client/derpy/UpstreamFeatures.ts.
// Each flag is checked where its feature starts, so upstream's own code
// stays as it is and later merges stay simple. Turning a flag on brings that
// feature back as upstream ships it.

/**
 * Ranked matchmaking: the worker's check-in loops (RankedCheckin.ts) that
 * offer this server to OpenFront's matchmaking API for 1v1, 2v2, FFA and
 * clan wars, about once a second between them. That API isn't ours (here
 * it's localhost:8787, where nothing listens), so while on they only log
 * "Error polling ... lobby: fetch failed" forever. Nothing else depends on
 * them: the menu has no Ranked (GameModeSelector), and a matchmade game is
 * only ever created from an assignment those loops bring back.
 */
export const RANKED_MATCHMAKING_ENABLED: boolean = false;
