// The profanity filter, shared by the server (player names, chat) and the
// singleplayer local server (chat). Moved here from src/server/Censor.ts so
// both sides screen chat with the same list; Censor.ts re-exports the matcher.
//
// The client loads this module lazily (LocalServer imports it on the first
// chat message), so the word lists stay out of the main bundle.

import {
  DataSet,
  RegExpMatcher,
  collapseDuplicatesTransformer,
  englishDataset,
  englishRecommendedTransformers,
  pattern,
  resolveConfusablesTransformer,
  resolveLeetSpeakTransformer,
  skipNonAlphabeticTransformer,
  toAsciiLowerCaseTransformer,
} from "obscenity";

// Basic obscenity check. Full username moderation happens in the API
// (join_verify); this static list plus the obscenity englishDataset only
// screens the paths that call never covers: Dev, API failure (fail-open
// joins), and re-admitted reconnects with no stored identity.
//
// Every word here is needed even when englishDataset also covers it: the
// dataset has no hate/extremism terms (hitler, nazi, spic, ...), and its
// patterns are partly word-anchored and keep double letters, so only the
// unanchored + deduped patterns built from this list catch substring and
// repeated-character bypasses ("xXfaggotXx", "niiiigger").
const bannedWords = [
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "faggot",
  "retard",
  "hitler",
  "adolf",
  "nazi",
  "auschwitz",
  "whitepower",
  "heil",
];

function buildDataset(dedup: boolean) {
  const dataset = new DataSet<{ originalWord: string }>().addAll(
    englishDataset,
  );
  for (const word of bannedWords) {
    const w = dedup ? word.replace(/(.)\1+/g, "$1") : word;
    dataset.addPhrase((phrase) =>
      phrase.setMetadata({ originalWord: word }).addPattern(pattern`${w}`),
    );
  }
  return dataset.build();
}

function createMatcher(): RegExpMatcher {
  const baseTransformers = [
    toAsciiLowerCaseTransformer(),
    resolveConfusablesTransformer(),
    resolveLeetSpeakTransformer(),
  ];
  // substringMatcher: literal patterns, no collapse — catches "niggertesting" as a substring
  // collapseMatcher: deduped patterns + collapse transformer — catches "niiiigger", "hiiitler"
  // skipNonAlphabeticTransformer is applied last to catch punctuation-separated bypasses
  // like "n.i.g.g.e.r".
  const substringMatcher = new RegExpMatcher({
    ...buildDataset(false),
    blacklistMatcherTransformers: [
      ...baseTransformers,
      skipNonAlphabeticTransformer(),
    ],
  });
  const collapseMatcher = new RegExpMatcher({
    ...buildDataset(true),
    blacklistMatcherTransformers: [
      ...baseTransformers,
      collapseDuplicatesTransformer(),
      skipNonAlphabeticTransformer(),
    ],
  });
  return {
    hasMatch: (input: string) =>
      input.toLowerCase().includes("kkk") ||
      substringMatcher.hasMatch(input) ||
      collapseMatcher.hasMatch(input),
    getAllMatches: (input: string, sorted?: boolean) => [
      ...substringMatcher.getAllMatches(input, sorted),
      ...collapseMatcher.getAllMatches(input, sorted),
    ],
  } as unknown as RegExpMatcher;
}

/** The name filter: any hit anywhere in a name or clan tag counts. */
export const profanityMatcher = createMatcher();

// Chat needs the same words, but not the same reach. A name is one token, so
// the name filter matches inside other words; in a sentence that would star
// out "spicy", "despicable", "Heilbronn" and "Adolfo". So chat screens in two
// passes over the same list:
//
//  - Words: englishDataset with its recommended (word-aware) transformers,
//    plus the banned words. The short ones that hide inside ordinary words
//    are anchored at the start of a word ("|spic|", "|nazi" which still
//    catches "nazis"); the rest match anywhere.
//  - Spelled-out slurs: the unmistakable ones, matched with every
//    non-letter skipped, so "n i g g e r" and "white power" are caught too.
const CHAT_ANCHOR_BOTH = new Set(["spic", "adolf", "heil"]);
const CHAT_ANCHOR_START = new Set(["chink", "kike", "retard", "nazi"]);
const CHAT_SPELLED_OUT = [
  "nigger",
  "nigga",
  "faggot",
  "hitler",
  "auschwitz",
  "whitepower",
];
// Ordinary words the word pass would otherwise star out.
const CHAT_WHITELIST = [
  "shiitake",
  "retardant",
  "scunthorpe",
  "assolutamente",
  "dikes",
  "sabich",
];

function createChatMatchers(): RegExpMatcher[] {
  const words = new DataSet<{ originalWord: string }>().addAll(englishDataset);
  for (const w of bannedWords) {
    words.addPhrase((phrase) =>
      phrase
        .setMetadata({ originalWord: w })
        .addPattern(
          CHAT_ANCHOR_BOTH.has(w)
            ? pattern`|${w}|`
            : CHAT_ANCHOR_START.has(w)
              ? pattern`|${w}`
              : pattern`${w}`,
        ),
    );
  }
  const built = words.build();
  const wordMatcher = new RegExpMatcher({
    ...built,
    whitelistedTerms: [...(built.whitelistedTerms ?? []), ...CHAT_WHITELIST],
    ...englishRecommendedTransformers,
  });

  // The words as written (not deduped: "niger" would star out Niger), with
  // every non-letter skipped. The word pass above already collapses
  // repeated letters.
  const spelled = new DataSet<{ originalWord: string }>();
  for (const w of CHAT_SPELLED_OUT) {
    spelled.addPhrase((phrase) =>
      phrase.setMetadata({ originalWord: w }).addPattern(pattern`${w}`),
    );
  }
  const spelledMatcher = new RegExpMatcher({
    ...spelled.build(),
    blacklistMatcherTransformers: [
      toAsciiLowerCaseTransformer(),
      resolveConfusablesTransformer(),
      resolveLeetSpeakTransformer(),
      skipNonAlphabeticTransformer(),
    ],
  });
  return [wordMatcher, spelledMatcher];
}

let chatMatchers: RegExpMatcher[] | null = null;

/**
 * A chat message with every profane word starred out, character for
 * character, so the message keeps its length and shape ("what the ****").
 */
export function censorChatText(text: string): string {
  chatMatchers ??= createChatMatchers();
  const masked = new Array<boolean>(text.length).fill(false);
  for (const matcher of chatMatchers) {
    for (const m of matcher.getAllMatches(text)) {
      for (let i = m.startIndex; i <= m.endIndex && i < text.length; i++) {
        masked[i] = true;
      }
    }
  }
  const kkk = /k{3,}/gi;
  for (let m = kkk.exec(text); m !== null; m = kkk.exec(text)) {
    for (let i = m.index; i < m.index + m[0].length; i++) masked[i] = true;
  }
  if (!masked.includes(true)) return text;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    // Never star the inside of a word separator: keeps "f*** you" readable.
    out += masked[i] && !/\s/.test(text[i]) ? "*" : text[i];
  }
  return out;
}
