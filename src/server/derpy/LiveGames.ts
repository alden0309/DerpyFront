// SITE (r19): the games being played right now that anyone may watch, for
// Derp Land's front page and each game's own page. DerpyFront's come from
// the game workers (through the master's lobby service), Derpy Conquest's
// from its rooms here in the master. The master plugs both in at startup;
// until it does (or without them, in tests) the lists are empty.

import {
  type AssetManifest,
  buildAssetUrl,
} from "@openfront/engine-lib/AssetPaths";
import type { LiveRoom } from "../../conquest/Protocol";
import type { LiveFrontGame, LiveGames } from "../../derpland/LiveTypes";
import { getRuntimeAssetManifest } from "../RuntimeAssetManifest";
import { ServerEnv } from "../ServerEnv";

// The built site's asset names (hashed), so a map's thumbnail can be linked
// from pages that don't carry the manifest themselves.
let manifest: AssetManifest = {};
void getRuntimeAssetManifest().then((m) => (manifest = m));

function withThumb(g: LiveFrontGame): LiveFrontGame {
  return {
    ...g,
    thumb: buildAssetUrl(
      `maps/${g.mapKey}/thumbnail.webp`,
      manifest,
      ServerEnv.cdnBase(),
    ),
  };
}

let front: () => LiveFrontGame[] = () => [];
let conquest: () => LiveRoom[] = () => [];

/** Where the lists come from (the master, at startup). */
export function setLiveSources(sources: {
  derpyfront?: () => LiveFrontGame[];
  conquest?: () => LiveRoom[];
}): void {
  if (sources.derpyfront) front = sources.derpyfront;
  if (sources.conquest) conquest = sources.conquest;
}

/**
 * How long a list is kept before it's made again: pages ask every few
 * seconds, and nobody needs it fresher than this.
 */
export const LIVE_CACHE_MS = 2000;

let cached: { at: number; games: LiveGames } | null = null;

/** The games being played now, made at most every LIVE_CACHE_MS. */
export function liveGames(now: number = Date.now()): LiveGames {
  if (cached && now - cached.at < LIVE_CACHE_MS) return cached.games;
  const games: LiveGames = {
    serverTime: now,
    derpyfront: front().map(withThumb),
    conquest: conquest(),
  };
  cached = { at: now, games };
  return games;
}

/** For tests: forget the last list. */
export function forgetLiveGames(): void {
  cached = null;
}
