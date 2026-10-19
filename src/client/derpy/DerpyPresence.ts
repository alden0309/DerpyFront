// FRIENDS (r25): DerpyFront tells Derp Land's who's online where its player
// is: on the menu, in the store, setting up a solo game, in a lobby (solo,
// private or public), playing (and on which map) or watching. Main calls
// this beside the desktop shell's presence (the same moments: joining, the
// lobby's details arriving, the game starting, back to the menu), so the
// two never disagree.

import { social } from "../../derpland/Social";
import type { ClientWhere, FrontLobby } from "../../derpland/SocialTypes";
import type { PresencePayload } from "../DesktopPresence";

interface Joining {
  id: string;
  source?: string;
  replay: boolean;
  map?: string;
}

let joining: Joining | null = null;
/** The menu's page (showPage), for "in the store" and setting up a solo game. */
let menuPage = "page-play";

function menuWhere(): ClientWhere {
  if (menuPage === "page-item-store" || menuPage === "page-inventory")
    return { k: "store" };
  if (menuPage === "page-single-player")
    return { k: "df-lobby", lobby: "solo" };
  return { k: "df-menu" };
}

if (typeof window !== "undefined") {
  window.addEventListener("showPage", (e) => {
    menuPage = String((e as CustomEvent).detail ?? "page-play");
    if (joining === null) social.setWhere(menuWhere());
  });
}

/** A join is starting (Main's join-lobby): which game, and how it came. */
export function derpyJoining(
  e: { gameID: string; source?: string; gameRecord?: unknown },
  map?: string,
): void {
  joining = {
    id: e.gameID,
    source: e.source,
    replay: e.gameRecord !== undefined,
    map,
  };
}

/** The lobby's details came (the map isn't known until they do for a link). */
export function derpyLobbyMap(map: string | undefined): void {
  if (joining && map) joining.map = map;
}

function lobbyOf(gameType: string | undefined, j: Joining): FrontLobby {
  if (gameType === "Singleplayer" || j.source === "singleplayer") return "solo";
  if (j.source === "matchmaking") return "matched";
  if (gameType === "Public" || (!gameType && j.source === "public"))
    return "public";
  return "private";
}

/** Where DerpyFront's player is now, from the payload Main gives the shell. */
export function derpyPresence(
  p: Pick<PresencePayload, "state" | "gameType">,
): void {
  if (p.state === "menu") joining = null;
  const j = joining;
  if (j === null) {
    social.setWhere(menuWhere());
    return;
  }
  // A replay is nobody's game to join or watch.
  if (j.replay) {
    social.setWhere({ k: "df-menu" });
    return;
  }
  const lobby = lobbyOf(p.gameType, j);
  const map = j.map ? { map: j.map.slice(0, 60) } : {};
  if (p.state === "lobby") {
    social.setWhere({ k: "df-lobby", id: j.id, lobby, ...map });
    return;
  }
  social.setWhere({
    k: "df-game",
    id: j.id,
    lobby,
    ...map,
    ...(p.state === "spectating" ? { watching: true } : {}),
  });
}
