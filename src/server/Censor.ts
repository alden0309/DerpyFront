import { simpleHash } from "@openfront/engine-lib/Util";
import { profanityMatcher } from "@openfront/shared/Profanity";

export const shadowNames = [
  "UnhuggedToday",
  "DaddysLilChamp",
  "BunnyKisses67",
  "SnugglePuppy",
  "CuddleMonster67",
  "DaddysLilStar",
  "SnuggleMuffin",
  "PeesALittle",
  "PleaseFullSendMe",
  "NanasLilMan",
  "NoAlliances",
  "TryingTooHard67",
  "MommysLilStinker",
  "NeedHugs",
  "MommysLilPeanut",
  "IWillBetrayU",
  "DaddysLilTater",
  "PreciousBubbles",
  "67 Cringelord",
  "Peace And Love",
  "AlmostPottyTrained",
];

// The word lists and the matcher live in @openfront/shared/Profanity, which
// chat uses as well; re-exported here for the name checks below.
export { profanityMatcher };

/**
 * Same censoring semantics as the API's join_verify: a profane username is
 * replaced with its deterministic shadow name (same pool and hash the API
 * uses); a profane clan tag, the literal "ss", or a banned word completed
 * across the tag/name boundary (tag HIT + name LER — which also shadow-names
 * the username) drops the tag; a surviving tag is uppercased.
 */
export function censorPlayer(
  username: string,
  clanTag: string | null,
): { username: string; clanTag: string | null } {
  const usernameIsProfane = profanityMatcher.hasMatch(username);
  const clanTagIsProfane = clanTag
    ? profanityMatcher.hasMatch(clanTag) || clanTag.toLowerCase() === "ss"
    : false;
  const combinedSlurAcrossBoundary = clanTag
    ? profanityMatcher.getAllMatches(clanTag + username).some(
        (match) =>
          // Match must start in the clan and extend into the name — otherwise
          // it's already handled by the clan-only or name-only checks above.
          match.startIndex < clanTag.length && match.endIndex >= clanTag.length,
      )
    : false;

  const censoredName =
    usernameIsProfane || combinedSlurAcrossBoundary
      ? shadowNames[simpleHash(username) % shadowNames.length]
      : username;

  const censoredClanTag =
    clanTag && !clanTagIsProfane && !combinedSlurAcrossBoundary
      ? clanTag.toUpperCase()
      : null;

  return { username: censoredName, clanTag: censoredClanTag };
}
