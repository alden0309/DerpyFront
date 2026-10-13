// SITE (r19): the games being played right now that anyone may watch, as
// Derp Land's /derpy/api/live serves them (types only: the server and the
// pages share them).

import type { LiveRoom } from "../conquest/Protocol";

/** A DerpyFront game in progress. Watched at /game/<id>?spectate. */
export interface LiveFrontGame {
  game: "derpyfront";
  id: string;
  /** The map's name ("World", "Orlando - Detailed"). */
  map: string;
  /** Its folder under /maps/, for the thumbnail ("world", "orlandodetailed"). */
  mapKey: string;
  /** "Free For All" or "Team". */
  mode: string;
  /** A private game its host opened to watchers (else a public one). */
  private: boolean;
  /** When it began (ms since 1970, the server's clock). */
  startedAt: number;
  /** Players it began with, and those still in it. */
  players: number;
  playersLeft: number;
  /** People watching it now, and whether as many as may already are. */
  watchers: number;
  full: boolean;
}

export interface LiveGames {
  /** The server's clock when this was made, to count "time in" from. */
  serverTime: number;
  derpyfront: LiveFrontGame[];
  conquest: LiveRoom[];
}
