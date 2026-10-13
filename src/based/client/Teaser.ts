// The public face of Mr. Based: what everyone sees on the Derp Land home and
// on the Coming Soon page. Nothing of the story itself is in the site's
// JavaScript; the chapters come from the server, to the owner only.

export const BASED_TITLE = "Mr. Based";

export const BASED_TAGLINE = "A spy story, told in chapters.";

export const BASED_TEASER = [
  "Nobody knows his first name. He was the CIA's best until the night he wasn't, and now he works for whoever can afford him.",
  "Tonight that's the British. France has elected a government that promises to keep its word, and London would like to know which word it means.",
];

export const BASED_FACTS = [
  "Choices that remember you",
  "Paris, a wet night",
  "Played a chapter at a time",
] as const;

/** The public key art, and who made it. */
export const BASED_COVER = "/derpland/based-cover.webp";
export const BASED_BOX = "/derpland/based-box.webp";
export const BASED_COVER_CREDIT =
  'Key art from "Deep in Thought" by Kreg Steppe (CC BY-SA 2.0) and "Randomness." by Tiomax80 (CC BY 2.0), graded and combined.';
