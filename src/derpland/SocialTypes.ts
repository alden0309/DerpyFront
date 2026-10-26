// FRIENDS (r25): who's on Derp Land and where, friends, game invites and
// parties, as /derpy/api/social serves them (types only: the server and the
// pages share them).

import type { SiteBanner } from "./BannerTypes"; // ADMIN (r26)
import type { NewsBeat } from "./NewsTypes"; // NEWS (r25)
import type { Look } from "./Pictures"; // PROFILE (r26)

/** What kind of DerpyFront lobby (or game) someone is in. */
export type FrontLobby = "solo" | "private" | "public" | "matched";

/**
 * Where a page says its player is. DerpyFront's are the browser's word (a
 * singleplayer game has no server); Derpy Conquest's tables are known to the
 * server, which never takes a page's word for them. There's no kind for Mr.
 * Based: its pages say "around", and so does anything the server can't read.
 */
export type ClientWhere =
  | { k: "home" }
  | { k: "store" }
  | { k: "around" }
  | { k: "df-menu" }
  | { k: "cq-front" }
  /** A solo lobby (setting up a singleplayer game) has no id yet. */
  | { k: "df-lobby"; id?: string; lobby: FrontLobby; map?: string }
  | {
      k: "df-game";
      id: string;
      lobby: FrontLobby;
      map?: string;
      watching?: boolean;
    };

/** Where someone is, as others are shown it (no lobby ids or room codes). */
export interface Place {
  k:
    | "home"
    | "store"
    | "around"
    | "df-menu"
    | "df-lobby"
    | "df-game"
    | "cq-front"
    | "cq-room"
    | "cq-game"
    | "cq-watch";
  /** DerpyFront: the lobby's kind. */
  lobby?: FrontLobby;
  /** DerpyFront: the map, when known. */
  map?: string;
  /** DerpyFront: watching the game, not playing it. */
  watching?: boolean;
  /**
   * Derpy Conquest: the world's year, the place their character lives (a
   * town), and the power that holds it ("England").
   */
  year?: number;
  colony?: string;
  power?: string;
  /** Derpy Conquest: a private table (not open to anyone) or a solo one. */
  private?: boolean;
  solo?: boolean;
  /** The lobby or table has a password (its host's; never shown). */
  locked?: boolean;
}

/** Someone on the site (or a friend who isn't). */
export interface PersonRow {
  id: number;
  username: string;
  friend: boolean;
  /** Where they are, or null: offline (or appearing so). */
  place: Place | null;
  /** A link into the lobby or table they're in (any with room: one with a password asks for it). */
  join?: string;
  /** A link to watch the game they're playing, when it may be watched. */
  watch?: string;
  /** In your party. */
  inParty?: boolean;
  /** A friend request between you: theirs to you, or yours to them. */
  requested?: "in" | "out";
}

export interface FriendRequestRow {
  id: number;
  username: string;
  at: string;
}

/** A game invite to you, while the lobby or table it's for is open. */
export interface InviteRow {
  id: number;
  fromId: number;
  from: string;
  game: "derpyfront" | "conquest";
  place: Place;
  href: string;
  at: string;
}

export interface PartyMemberRow {
  id: number;
  username: string;
  leader: boolean;
  place: Place | null;
}

export interface PartyView {
  id: number;
  leaderId: number;
  /** You lead it. */
  leading: boolean;
  members: PartyMemberRow[];
  /** Asked, not yet answered. */
  invited: { id: number; username: string }[];
  max: number;
  /**
   * The leader went into a lobby or a table you aren't at: where, and the
   * link that takes you there (after you say so). `key` tells one apart from
   * the next, so a "not now" isn't asked again for the same one.
   */
  pull?: { key: string; href: string; leader: string; place: Place };
}

export interface PartyInviteRow {
  partyId: number;
  fromId: number;
  from: string;
  leader: string;
  size: number;
  at: string;
}

export interface SocialState {
  serverTime: number;
  me: {
    id: number;
    username: string;
    appearOffline: boolean;
    /** Where you are, as your friends see it (whether or not you appear offline). */
    place: Place | null;
    /** You're in a lobby or at a table others can be invited into. */
    canInvite: boolean;
  };
  /** Everyone else on the site who can be seen: friends first. */
  online: PersonRow[];
  /** Every friend, on the site or not. */
  friends: PersonRow[];
  requests: { incoming: FriendRequestRow[]; outgoing: FriendRequestRow[] };
  invites: InviteRow[];
  party: PartyView | null;
  partyInvites: PartyInviteRow[];
  /** NEWS (r25): on a beat, how much of What's New is new (News.ts). */
  news?: NewsBeat;
  /** ADMIN (r26): on a beat, the site banner (null: none). */
  banner?: SiteBanner | null;
  /**
   * PROFILE (r26): the picture and pinned badges of everyone in this state
   * (you too), by account id; anyone left out shows their monogram.
   */
  looks?: Record<string, Look>;
}

/** What the social actions answer when they can't. */
export type SocialError =
  | "no_such_player"
  | "yourself"
  | "already_friends"
  | "not_friends"
  | "no_request"
  | "rate_limited"
  | "not_in_a_game"
  | "already_there"
  | "not_online"
  | "no_party"
  | "not_leader"
  | "not_member"
  | "party_full"
  | "in_a_party"
  | "no_invite"
  | "invalid";

/** A finished game a friend played, for your page. */
export interface FriendGame {
  game: "derpyfront" | "conquest";
  gameId: string;
  endedAt: string;
  username: string;
  won: boolean;
  /** DerpyFront: the map; Derpy Conquest: the people they played. */
  where: string;
  numPlayers: number;
}
