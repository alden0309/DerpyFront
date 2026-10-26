// ADMIN (r26): what the admin page reads from the rest of the server, which
// the master plugs in at startup (as LiveGames does): DerpyFront's games on
// the game workers (asked over IPC, MasterLobbyService), Derpy Conquest's
// rooms (here in the master), and when each account last used Mr. Based.
// Until they're plugged in (and in tests that don't), there are none.

import type {
  AdminConquestRoom,
  ConquestRooms,
} from "../../conquest/ConquestRooms";
import type { AdminFrontGame, AdminWorkerHealth } from "../../IPCBridgeSchema";

export interface FrontAdmin {
  list(): Promise<{ games: AdminFrontGame[]; workers: AdminWorkerHealth[] }>;
  end(gameID: string, reason: string): Promise<boolean>;
}

export interface ConquestAdmin {
  rooms(): AdminConquestRoom[];
  close(code: string, reason: string): Promise<boolean>;
}

let front: FrontAdmin | null = null;
let conquest: ConquestAdmin | null = null;

export function setAdminSources(s: {
  front?: FrontAdmin | null;
  conquest?: ConquestAdmin | ConquestRooms | null;
}): void {
  if (s.front !== undefined) front = s.front;
  if (s.conquest !== undefined) {
    const c = s.conquest;
    conquest =
      c === null
        ? null
        : "adminRooms" in c
          ? {
              rooms: () => c.adminRooms(),
              close: (code, reason) => c.adminClose(code, reason),
            }
          : c;
  }
}

export function frontAdmin(): FrontAdmin | null {
  return front;
}

export function conquestAdmin(): ConquestAdmin | null {
  return conquest;
}

// ---- Mr. Based: who used it lately -----------------------------------------

/**
 * Its pages say "around" to who's online (nobody else may know it exists),
 * so the owner's Overview tells who's playing it from its own API: the last
 * time each account asked it for anything.
 */
const basedSeen = new Map<number, number>();

export function noteBased(accountId: number, at = Date.now()): void {
  basedSeen.set(accountId, at);
  if (basedSeen.size > 500) {
    const oldest = [...basedSeen.entries()].sort((a, b) => a[1] - b[1])[0];
    basedSeen.delete(oldest[0]);
  }
}

/** When each account last used Mr. Based (ms), since `since`. */
export function basedSince(since: number): Map<number, number> {
  return new Map([...basedSeen].filter(([, at]) => at >= since));
}

/** For tests. */
export function forgetBased(): void {
  basedSeen.clear();
}
