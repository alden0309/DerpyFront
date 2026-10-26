// The flags of each Mr. Based chapter in plain words, for the script export
// (scripts/based-script.ts): what it means when a flag is set, and when it
// isn't, so a condition reads "only if he knows about room forty-one" and
// not "if knows_room". tests/based/BasedScript.test.ts fails when a flag the
// chapter sets or reads has no words here, or words here name a flag the
// chapter no longer has.

/** A flag that's on or off. */
export interface Gloss {
  /** What it means when it's set: "he has met London's contact". */
  yes: string;
  /** And when it isn't: "he hasn't met London's contact yet". */
  no: string;
}

/** A flag that counts (`add thoughts 1`, `if thoughts >= 2`). */
export interface Counter {
  /** The count in a sentence, given "at least 2", "fewer than 3"... */
  count: (q: string) => string;
  /** What's counted, for `add`: "thoughts he has followed while waiting". */
  noun: string;
}

export type FlagWords = Gloss | Counter;

export const isCounter = (w: FlagWords): w is Counter => "count" in w;

const CHAPTER_1: Record<string, FlagWords> = {
  anselme_named: {
    yes: "Anselme has told him his name",
    no: "Anselme hasn't told him his name yet",
  },
  anselme_told: {
    yes: "Anselme told him the man in grey asked about him (room forty-one)",
    no: "Anselme hasn't told him what the man in grey asked",
  },
  asked_lift: {
    yes: "he asked the clerk about the lift",
    no: "he hasn't asked the clerk about the lift",
  },
  called_out: {
    yes: "he called the man in grey out, and it landed",
    no: "he hasn't called the man in grey out",
  },
  came_down: {
    yes: "he worked out that the man in grey came down from upstairs",
    no: "he hasn't worked out that the man in grey came down from upstairs",
  },
  coats: {
    yes: "he looked at the coat stand (the dry camel coat)",
    no: "he hasn't looked at the coat stand",
  },
  corner: {
    yes: "he looked at the woman in the corner",
    no: "he hasn't looked at the woman in the corner",
  },
  counted_ends: {
    yes: "he counted the cigarette ends under the awning",
    no: "he hasn't counted the cigarette ends",
  },
  crowd: {
    yes: "the regulars are in their places in the bar",
    no: "the regulars aren't in the bar yet (a save from before they came)",
  },
  curfew: {
    yes: "he read the Préfecture's notice in the pharmacy window (with some French)",
    no: "he hasn't read the notice in the pharmacy window",
  },
  delorme_41: {
    yes: "the clerk told him Delorme has room forty-one",
    no: "the clerk hasn't told him who has room forty-one",
  },
  delorme_gone: {
    yes: "the man in grey has left the bar",
    no: "the man in grey hasn't left the bar yet",
  },
  delorme_word: {
    yes: "the man in grey had a word with the barman on his way out",
    no: "the man in grey didn't stop to talk to the barman",
  },
  door: {
    yes: "he looked at the footprints by the door",
    no: "he hasn't looked at the footprints by the door",
  },
  drink_beer: { yes: "he ordered a beer", no: "he didn't order a beer" },
  drink_scotch: {
    yes: "he ordered the scotch",
    no: "he didn't order the scotch",
  },
  drink_water: { yes: "he ordered water", no: "he didn't order water" },
  dumped_leaflets: {
    yes: "he saw the leaflets dumped in the bin",
    no: "he hasn't looked in the bin",
  },
  flyer: {
    yes: "he read the Volunteers' leaflet in the gutter",
    no: "he hasn't read the leaflet in the gutter",
  },
  gave_alias: {
    yes: "he gave the man in grey his alias, John Locke",
    no: "he didn't give the man in grey his alias",
  },
  gave_name: {
    yes: "he gave the man in grey his name",
    no: "he didn't give the man in grey his name",
  },
  has_light: {
    yes: "he has a light (matches)",
    no: "he hasn't got a light",
  },
  has_room: {
    yes: "the clerk has given him his key",
    no: "he hasn't got his key yet",
  },
  heard_41: {
    yes: "he has heard about room forty-one from the clerk",
    no: "he hasn't heard about room forty-one from the clerk",
  },
  heard_alone: {
    yes: "he understood the man under the awning wants to be alone",
    no: "he didn't follow what the man under the awning wanted",
  },
  heard_anselme: {
    yes: "he heard the man in grey call the barman Anselme",
    no: "he hasn't heard the barman's name",
  },
  heard_grandson: {
    yes: "the barman has mentioned his grandson",
    no: "the barman hasn't mentioned his grandson",
  },
  his_mirror: {
    yes: "he saw the signal in the mirror (the man under the awning lit his cigarette)",
    no: "he didn't see the signal in the mirror",
  },
  kept_name: {
    yes: "he kept his name from the man in grey",
    no: "he didn't keep his name from the man in grey",
  },
  kept_quiet: {
    yes: "he kept the man in grey to himself",
    no: "he didn't keep the man in grey to himself",
  },
  key_gone: {
    yes: "he noticed forty-one's key is missing from the board",
    no: "he hasn't noticed the missing key",
  },
  knew_seen: {
    yes: "he and Penhallow worked out that the man in grey saw them together",
    no: "they didn't work out that the man in grey saw them together",
  },
  knows_army: {
    yes: "Penhallow told him what the army is doing",
    no: "Penhallow hasn't told him what the army is doing",
  },
  knows_car: {
    yes: "he knows forty-one has a car at six",
    no: "he doesn't know about forty-one's car at six",
  },
  knows_clovis: {
    yes: "Penhallow told him about CLOVIS",
    no: "Penhallow hasn't told him about CLOVIS",
  },
  knows_delorme: {
    yes: "the man in grey gave his name, Delorme",
    no: "the man in grey hasn't given his name",
  },
  knows_marchal: {
    yes: "he knows the woman on the old posters is Marchal",
    no: "he doesn't know who the woman on the old posters is",
  },
  knows_oak: {
    yes: "Anselme told him about his grandson's oak-leaf pin",
    no: "Anselme hasn't told him about his grandson's pin",
  },
  knows_satory: {
    yes: "he knows the car at six goes to Satory",
    no: "he doesn't know where the car at six goes",
  },
  knows_room: {
    yes: "he knows about room forty-one",
    no: "he doesn't know about room forty-one",
  },
  knows_stairs: {
    yes: "he knows about the service stairs down to the bar",
    no: "he doesn't know about the service stairs",
  },
  knows_versailles: {
    yes: "he found the Versailles number pressed into Delorme's card",
    no: "he hasn't found the number pressed into Delorme's card",
  },
  knows_vidal: {
    yes: "he read the journalist's press card (Claire Vidal)",
    no: "he hasn't read the press card in the parked car",
  },
  lapel: {
    yes: "he saw the pin under the man in grey's lapel",
    no: "he didn't see under the man in grey's lapel",
  },
  met_contact: {
    yes: "he has met London's contact",
    no: "he hasn't met London's contact yet",
  },
  met_watcher: {
    yes: "he offered the man under the awning a light",
    no: "he hasn't offered the man under the awning a light",
  },
  missed_watch: {
    yes: "he and Penhallow couldn't make anything of the man in grey",
    no: "it isn't settled that they couldn't make anything of the man in grey",
  },
  moved_away: {
    yes: "he moved a stool away from the man in grey",
    no: "he didn't move away from the man in grey",
  },
  old_night_task: {
    yes: "the save is from before the night was reshaped (its old last task)",
    no: "the save isn't from before the night was reshaped",
  },
  on_duty: {
    yes: "he worked out that the man in grey is on duty",
    no: "he hasn't worked out that the man in grey is on duty",
  },
  order: {
    yes: "he noticed the man in grey's untouched drink",
    no: "he didn't notice the man in grey's drink",
  },
  ordered: { yes: "he has ordered a drink", no: "he hasn't ordered yet" },
  paid: {
    yes: "he has paid for his drink",
    no: "he hasn't paid for his drink",
  },
  party_man: {
    yes: "he worked out that the man in grey is the party's man",
    no: "he hasn't worked out that the man in grey is the party's",
  },
  posters: {
    yes: "he looked at the posters",
    no: "he hasn't looked at the posters",
  },
  pours_drinks: {
    yes: "he found out the palm drinks the man in grey's Ricard",
    no: "he hasn't found out about the palm",
  },
  read_kiosk: {
    yes: "he read the kiosk's front page",
    no: "he hasn't read the kiosk's front page",
  },
  read_paper: {
    yes: "he read the evening paper",
    no: "he hasn't read the evening paper",
  },
  ring: {
    yes: "he noticed the man in grey's missing ring",
    no: "he didn't look at the man in grey's left hand",
  },
  room_late: {
    yes: "the clerk told him his room isn't ready",
    no: "the clerk hasn't told him his room isn't ready",
  },
  room_mirror: {
    yes: "he saw the man under the awning in the bar's mirror",
    no: "he hasn't looked in the bar's mirror",
  },
  room_tv: {
    yes: "he looked at the television",
    no: "he hasn't looked at the television",
  },
  saw_lit_window: {
    yes: "he saw the woman at the lit window",
    no: "he hasn't seen the woman at the lit window",
  },
  saw_moped: {
    yes: "he saw the oak leaf on the moped",
    no: "he hasn't looked at the moped",
  },
  saw_morris: {
    yes: "he looked at the Morris column",
    no: "he hasn't looked at the Morris column",
  },
  saw_oak_emblem: {
    yes: "he noticed the party's oak leaf on the posters",
    no: "he didn't notice the oak leaf on the posters",
  },
  saw_photo: {
    yes: "he looked at the old photograph of the bar",
    no: "he hasn't looked at the old photograph",
  },
  saw_the_look: {
    yes: "he saw the man in grey's look at the corner table",
    no: "he didn't see the man in grey's look at the corner table",
  },
  saw_upstairs: {
    yes: "he saw a figure watching from a window, in the puddle",
    no: "he hasn't seen the figure in the window",
  },
  saw_watcher: {
    yes: "he nodded to the man under the awning",
    no: "he hasn't nodded to the man under the awning",
  },
  she_is_blown: {
    yes: "Penhallow knows she's blown",
    no: "Penhallow doesn't know she's blown",
  },
  shoes: {
    yes: "he looked at the man in grey's shoes",
    no: "he didn't look at the man in grey's shoes",
  },
  stairs_open: {
    yes: "the clerk has unhooked the rope across the stairs",
    no: "the stairs are still roped off",
  },
  stayed_close: {
    yes: "he stayed next to the man in grey",
    no: "he didn't stay next to the man in grey",
  },
  texted_london: {
    yes: "he texted London about the car",
    no: "he hasn't texted London about the car",
  },
  thought_phone: {
    yes: "he thought about the phone in his jacket (the British)",
    no: "he didn't think about the phone",
  },
  thought_rain: {
    yes: "he thought about the rain (Paris at twenty-six)",
    no: "he didn't think about the rain",
  },
  thought_scar: {
    yes: "he thought about his left hand (Vienna)",
    no: "he didn't think about his left hand",
  },
  thought_vidal: {
    yes: "he wondered who Claire Vidal is watching",
    no: "he hasn't wondered about Claire Vidal",
  },
  thoughts: {
    count: (q) => `he has followed ${q} of his thoughts while waiting`,
    noun: "thoughts he has followed while waiting",
  },
  tipped: {
    yes: "he put two euros in the tip jar",
    no: "he hasn't tipped",
  },
  told_grey_wine: {
    yes: "he told the man in grey he buys wine",
    no: "he hasn't told the man in grey he buys wine",
  },
  told_penhallow: {
    yes: "he told Penhallow what the man in grey wanted",
    no: "he didn't tell Penhallow what the man in grey wanted",
  },
  told_telling: {
    count: (q) =>
      `he has told Penhallow ${q} telling things about the man in grey (his look at her table counts as two)`,
    noun: "telling things he has told Penhallow",
  },
  told_vienna: {
    yes: "he told Penhallow a little about Vienna",
    no: "he didn't tell Penhallow about Vienna",
  },
  took_card: {
    yes: "he picked up Delorme's card",
    no: "he hasn't picked up Delorme's card",
  },
  took_twenty: {
    yes: "he took the twenty-euro note from the paperback",
    no: "he left the twenty-euro note",
  },
  tried_parole: {
    yes: "he asked the woman in the corner about seven down before he'd ordered",
    no: "he hasn't asked the woman in the corner about seven down",
  },
  tv_off: {
    yes: "the barman has turned the television off",
    no: "the television is still on",
  },
  umbrella: {
    yes: "he looked at the man in grey's umbrella",
    no: "he didn't look at the man in grey's umbrella",
  },
  van: {
    yes: "he looked at the police van",
    no: "he hasn't looked at the police van",
  },
  wine_cover: {
    yes: "he has given someone his wine-buyer cover",
    no: "he hasn't given anyone his cover",
  },
};

export const FLAG_WORDS: Record<number, Record<string, FlagWords>> = {
  1: CHAPTER_1,
};
