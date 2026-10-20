// Mr. Based's sound (r25 BSTORY): what's in each file (built from CC0 and
// public-domain sounds and from code; credited in art/credits.json), for
// Sound.ts. Plain data, so the tests can read it.

/** The intended length of each loop (MP3 decoders differ at the ends). */
export const LOOPS: Record<string, number> = {
  awning: 12,
  traffic: 32,
  murmur: 41,
  lobby: 8,
  tv_hum: 3,
};
/** LAME's encoder delay, for a decoder that leaves it in. */
export const MP3_DELAY = 1105 / 44100;

/** Short sounds packed one after another in a file, each in a slot. */
export const SPRITES: Record<string, { slot: number; names: string[] }> = {
  things: {
    slot: 2,
    names: [
      "door_open",
      "door_close",
      "bar_bell",
      "desk_bell",
      "lift_button",
      "rope",
      "key",
      "tv_off",
      "coins",
      "match",
      "glass",
    ],
  },
  paper: {
    slot: 1,
    names: [
      "page1",
      "page2",
      "page3",
      "book_open",
      "book_close",
      "cloth",
      "slip",
    ],
  },
  dice: { slot: 1.5, names: ["shake", "throw1", "throw2", "throw3"] },
  stings: { slot: 3, names: ["pass", "fail", "stamp"] },
  clinks: { slot: 0.6, names: ["clink1", "clink2", "clink3", "clink4"] },
  steps_stone: { slot: 0.5, names: ["s1", "s2", "s3", "s4"] },
  steps_wet: { slot: 0.5, names: ["s1", "s2", "s3", "s4"] },
  steps_tile: { slot: 0.5, names: ["s1", "s2", "s3", "s4"] },
  steps_wood: { slot: 0.5, names: ["s1", "s2", "s3", "s4"] },
  steps_carpet: { slot: 0.5, names: ["s1", "s2", "s3", "s4"] },
};

/** Where each named effect is, and how loud. */
export const EFFECTS: Record<
  string,
  { sprite: string; names: string[]; gain: number }
> = {
  door_open: { sprite: "things", names: ["door_open"], gain: 0.5 },
  door_close: { sprite: "things", names: ["door_close"], gain: 0.45 },
  bar_bell: { sprite: "things", names: ["bar_bell"], gain: 0.4 },
  desk_bell: { sprite: "things", names: ["desk_bell"], gain: 0.45 },
  lift_button: { sprite: "things", names: ["lift_button"], gain: 0.55 },
  rope: { sprite: "things", names: ["rope"], gain: 0.5 },
  key: { sprite: "things", names: ["key"], gain: 0.45 },
  tv_off: { sprite: "things", names: ["tv_off"], gain: 0.5 },
  coins: { sprite: "things", names: ["coins"], gain: 0.4 },
  match: { sprite: "things", names: ["match"], gain: 0.45 },
  glass: { sprite: "things", names: ["glass"], gain: 0.35 },
  page: { sprite: "paper", names: ["page1", "page2", "page3"], gain: 0.35 },
  book_open: { sprite: "paper", names: ["book_open"], gain: 0.3 },
  book_close: { sprite: "paper", names: ["book_close"], gain: 0.28 },
  cloth: { sprite: "paper", names: ["cloth"], gain: 0.3 },
  slip: { sprite: "paper", names: ["slip"], gain: 0.35 },
  dice: { sprite: "dice", names: ["throw1", "throw2", "throw3"], gain: 0.5 },
  shake: { sprite: "dice", names: ["shake"], gain: 0.4 },
  pass: { sprite: "stings", names: ["pass"], gain: 0.32 },
  fail: { sprite: "stings", names: ["fail"], gain: 0.3 },
  stamp: { sprite: "stings", names: ["stamp"], gain: 0.4 },
  clink: {
    sprite: "clinks",
    names: ["clink1", "clink2", "clink3", "clink4"],
    gain: 0.25,
  },
};

/** The score: a cue a place (or a room) asks for, by its name. */
export const CUES: Record<string, string> = {
  street: "score_street",
  bar: "score_bar",
  night: "score_night",
};
