// FRIENDS (r25): every word the who's online, friends, invites and party
// parts of Derp Land show, in English. DerpyFront shows them through its
// own translations (the same keys under "derp_social" in en.json); every
// other page uses these. `{name}`-style blanks are filled in by fill().

import type { Place, SocialError } from "./SocialTypes";

export const SOCIAL_TEXT = {
  people: "People",
  people_and_party: "People and your party",
  notifications: "Notifications",
  nothing_new: "Nothing new.",
  signed_out:
    "Sign in to see who's on Derp Land, add friends and start a party.",
  unavailable: "Can't see who's on right now.",
  you_are: "You: {place}",
  you_offline: "You appear offline. Nobody sees you on the list.",
  appear_offline: "Appear offline",
  // Where someone is
  place_home: "On the home page",
  place_store: "In the store",
  place_around: "Around Derp Land",
  place_df_menu: "On DerpyFront's menu",
  place_df_lobby_solo: "In a DerpyFront lobby (Solo)",
  place_df_lobby_private: "In a DerpyFront lobby (private)",
  place_df_lobby_public: "In a DerpyFront lobby (public)",
  place_df_game: "Playing DerpyFront: {map}",
  place_df_game_any: "Playing DerpyFront",
  place_df_watch: "Watching DerpyFront: {map}",
  place_cq_front: "Choosing a Derpy Conquest game",
  place_cq_room: "In a Conquest lobby",
  place_cq_game: "Playing Derpy Conquest: {year}, {where}",
  place_cq_game_year: "Playing Derpy Conquest: {year}",
  place_cq_watch: "Watching Derpy Conquest",
  offline: "Offline",
  // The list
  online_title: "On Derp Land now",
  friends_heading: "Friends",
  others_heading: "Everyone else",
  nobody_online: "Nobody else is here right now.",
  offline_friends: "Offline friends",
  no_friends_yet: "No friends yet. Add someone by their username.",
  party_tag: "Party",
  join: "Join",
  watch: "Watch",
  invite: "Invite to my game",
  invited: "Invited",
  add_friend: "Add friend",
  request_sent_short: "Request sent",
  accept_request: "Accept request",
  remove_friend: "Remove friend",
  profile: "Profile",
  more: "More for {name}",
  // Adding a friend
  add_friend_label: "Add a friend",
  username: "Username",
  add: "Add",
  request_sent: "Friend request sent to {name}.",
  now_friends: "You and {name} are friends now.",
  requests_title: "Friend requests",
  wants_friends: "{name} wants to be friends",
  accept: "Accept",
  decline: "Decline",
  waiting_on: "Waiting on {name}",
  cancel: "Cancel",
  // The party
  party_title: "Your party",
  party_count: "{count} of {max}",
  party_leader: "Leader",
  party_blurb:
    "When the leader goes into a DerpyFront lobby or a Derpy Conquest game, everyone in the party is asked to come along.",
  start_party: "Start a party",
  invite_to_party: "Invite to party",
  party_asked: "Asked: {names}",
  leave_party: "Leave party",
  disband: "Disband",
  make_leader: "Make leader",
  // Notifications
  invite_df: "{name} invited you into their DerpyFront lobby.",
  invite_cq: "{name} invited you to their Derpy Conquest game.",
  party_invite: "{name} asked you to join their party ({count} of {max}).",
  join_party: "Join party",
  pull_df: "{name}, your party's leader, went into a DerpyFront lobby.",
  pull_cq: "{name}, your party's leader, went to a Derpy Conquest table.",
  follow: "Join them",
  not_now: "Not now",
  dismiss: "Dismiss",
  // When something can't be done
  err_no_such_player: "There's nobody called that.",
  err_yourself: "That's you.",
  err_already_friends: "You're friends already.",
  err_not_friends: "Only friends can be asked into a party.",
  err_rate_limited: "Slow down a moment, then try again.",
  err_not_in_a_game: "Go into a lobby or a game first.",
  err_already_there: "They're there already.",
  err_party_full: "The party is full (8 at most).",
  err_not_leader: "Only the party's leader can do that.",
  err_generic: "That didn't work. Try again.",
} as const;

export type SocialKey = keyof typeof SOCIAL_TEXT;

/** Words for a key, with its blanks filled. */
export type SocialTranslate = (
  key: SocialKey,
  params?: Record<string, string | number>,
) => string;

/** Fills `{name}`-style blanks. */
export function fill(
  text: string,
  params: Record<string, string | number> = {},
): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in params ? String(params[k]) : m,
  );
}

/** The English words (every page but DerpyFront's). */
export const englishSocial: SocialTranslate = (key, params) =>
  fill(SOCIAL_TEXT[key], params);

/** Where someone is, in words. Mr. Based never appears: its pages say "around". */
export function placeText(p: Place | null, t: SocialTranslate): string {
  if (!p) return t("offline");
  switch (p.k) {
    case "home":
      return t("place_home");
    case "store":
      return t("place_store");
    case "df-menu":
      return t("place_df_menu");
    case "df-lobby":
      return p.lobby === "solo"
        ? t("place_df_lobby_solo")
        : p.lobby === "private"
          ? t("place_df_lobby_private")
          : t("place_df_lobby_public");
    case "df-game":
      if (!p.map) return t("place_df_game_any");
      return p.watching
        ? t("place_df_watch", { map: p.map })
        : t("place_df_game", { map: p.map });
    case "cq-front":
      return t("place_cq_front");
    case "cq-room":
      return t("place_cq_room");
    case "cq-game": {
      const where =
        p.colony && p.power
          ? `${p.colony} (${p.power})`
          : p.colony || p.power || "";
      return where
        ? t("place_cq_game", { year: p.year ?? "", where })
        : t("place_cq_game_year", { year: p.year ?? "" });
    }
    case "cq-watch":
      return t("place_cq_watch");
    default:
      return t("place_around");
  }
}

/** How busy a place is, for the dot beside a name: playing, in a lobby, or about. */
export function placeTone(p: Place | null): "off" | "play" | "lobby" | "about" {
  if (!p) return "off";
  if ((p.k === "df-game" && !p.watching) || p.k === "cq-game") return "play";
  if (
    p.k === "df-lobby" ||
    p.k === "cq-room" ||
    p.k === "cq-watch" ||
    p.k === "df-game"
  )
    return "lobby";
  return "about";
}

export function socialErrorText(
  e: SocialError | null,
  t: SocialTranslate,
): string {
  switch (e) {
    case null:
      return "";
    case "no_such_player":
      return t("err_no_such_player");
    case "yourself":
      return t("err_yourself");
    case "already_friends":
      return t("err_already_friends");
    case "not_friends":
      return t("err_not_friends");
    case "rate_limited":
      return t("err_rate_limited");
    case "not_in_a_game":
      return t("err_not_in_a_game");
    case "already_there":
      return t("err_already_there");
    case "party_full":
      return t("err_party_full");
    case "not_leader":
      return t("err_not_leader");
    default:
      return t("err_generic");
  }
}
