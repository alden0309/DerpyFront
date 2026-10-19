// NEWS (r25): the words around What's New (the bar's link and the card), in
// English. DerpyFront shows them through its own translations, the same
// keys under "derp_news" in en.json; every other page uses these. The
// entries themselves are plain English from the server's file and are never
// translated.

import { fill } from "./SocialText";

export const NEWS_TEXT = {
  whats_new: "What's New",
  and_more: "and {n} more",
  see_all: "See what's new",
  close: "Close",
  link: "Take a look",
} as const;

export type NewsKey = keyof typeof NEWS_TEXT;

export type NewsTranslate = (
  key: NewsKey,
  params?: Record<string, string | number>,
) => string;

export const englishNews: NewsTranslate = (key, params) =>
  fill(NEWS_TEXT[key], params);
