// WORK (r21): what you do at your post, by your kind of work and your rung.
// Every trade's ordinary work is "the usual" (the old monthly learning, the
// wage and nothing else); each family of work has duties besides, some of
// them only from a rung up (an apprentice fetches and carries, a journeyman
// takes orders of his own, a master teaches and keeps the books). A duty
// turns what you learn towards other skills, and may bring a little more
// money (tips, a piece-rate, a commission, a prize), a risk, your master's
// good opinion, renown, or the next rung sooner. The odds are the ones the
// month is rolled from, shown on the Work page.

import type { JobGroup } from "./JobsData";
import type { JobKind, Skill } from "./Types";

/** A skill a duty teaches: by name, or the trade's own main or second skill. */
export type SkillRef = Skill | "main" | "second";

export interface DutyDef {
  key: string;
  /** The families of work (or particular trades) it's for. */
  for: (JobGroup | JobKind)[];
  /** Not for these trades (within its families). */
  not?: JobKind[];
  name: string;
  /** What it is, plainly. */
  text: string;
  /** The least rung (0 the first), and the highest it's done at. */
  from: number;
  to?: number;
  /** What a month of it teaches: shares of the month's learning (the usual is main 7, second 3). */
  xp: [SkillRef, number][];
  /** A chance a month of more money: `x` of the month's wage. */
  bonus?: { p: number; x: number; what: string };
  /** A chance a month of a mishap: a hurt, a cost (`x` of the month's wage), or the law's heat. */
  mishap?: {
    p: number;
    hurt?: number;
    x?: number;
    heat?: number;
    what: string;
  };
  /** What your master thinks of it (a computer master), and why. */
  boss?: { v: number; why: string };
  /** Stress a month. */
  stress?: number;
  /** Renown a month. */
  renown?: number;
  /** × on the month's chance of the next rung. */
  promo?: number;
  /** Your own business at your post: × (1 + this) on its takings. */
  biz?: number;
  /** A crooked living: × on the heat a day's work draws. */
  heat?: number;
  /** Your master would never ask for it (it's for your own good). */
  own?: boolean;
}

/** The usual work: the old monthly learning, the wage and nothing else. */
export const USUAL = "usual";

export const DUTIES: DutyDef[] = [
  // ---------------------------------------------------------------- the land
  {
    key: "land-rows",
    for: ["land"],
    not: ["trapper"],
    name: "Hoe the rows and mend the fences",
    text: "The plain work of the fields, done well and seen to be done.",
    from: 0,
    xp: [
      ["main", 8],
      ["craft", 2],
    ],
    boss: { v: 4, why: "Keeps the fields clean" },
  },
  {
    key: "land-stock",
    for: ["land"],
    not: ["trapper"],
    name: "Mind the stock",
    text: "Cows, hogs and the plough team: a beast well kept is money in the spring, and a kick from a mule is a hazard of it.",
    from: 0,
    xp: [
      ["main", 5],
      ["medicine", 2],
      ["craft", 3],
    ],
    bonus: { p: 0.15, x: 0.5, what: "A fine calf dropped, and sold" },
    mishap: { p: 0.03, hurt: 6, what: "A kick from the mule" },
  },
  {
    key: "land-market",
    for: ["land"],
    not: ["trapper", "servant"],
    name: "Take the produce to market",
    text: "The cart to town on market days: your bargaining sets what the crop fetches.",
    from: 1,
    xp: [
      ["trade", 6],
      ["main", 3],
      ["persuasion", 1],
    ],
    bonus: { p: 0.35, x: 0.3, what: "A good price at market" },
    biz: 0.05,
  },
  {
    key: "land-hands",
    for: ["land"],
    not: ["trapper", "servant"],
    name: "See to the hired men",
    text: "Set the day's work and see it done: the fields go further with you over them.",
    from: 2,
    xp: [
      ["leadership", 6],
      ["main", 4],
    ],
    boss: { v: 5, why: "Gets work out of the men" },
    promo: 1.2,
    biz: 0.08,
  },
  {
    key: "trap-far",
    for: ["trapper"],
    name: "Run the far traplines",
    text: "Two weeks out at a time on the far creeks: richer beaver, colder nights, and nobody to help if it goes wrong.",
    from: 0,
    xp: [
      ["woodcraft", 8],
      ["fighting", 2],
    ],
    bonus: { p: 0.4, x: 0.35, what: "Prime pelts from the far creeks" },
    mishap: { p: 0.05, hurt: 10, what: "A fall through the ice" },
    stress: 1,
  },
  {
    key: "trap-post",
    for: ["trapper"],
    name: "Trade at the posts",
    text: "Bargain your pelts at the posts instead of selling to the first factor who asks.",
    from: 1,
    xp: [
      ["trade", 6],
      ["persuasion", 2],
      ["woodcraft", 2],
    ],
    bonus: { p: 0.35, x: 0.3, what: "A good price at the post" },
  },
  // ---------------------------------------------------------------- crafts
  {
    key: "craft-fetch",
    for: ["craft"],
    name: "Fetch, carry and sweep",
    text: "The first rung's lot: stoke, sweep, run for the master. Not much learned, but he sees you're willing.",
    from: 0,
    to: 0,
    xp: [
      ["main", 6],
      ["second", 2],
      ["fighting", 2],
    ],
    boss: { v: 6, why: "A willing pair of hands" },
    stress: -1,
  },
  {
    key: "craft-watch",
    for: ["craft"],
    name: "Watch the master at work",
    text: "Stand at his elbow and learn the trade's secrets, rather than turn out work of your own.",
    from: 0,
    to: 1,
    xp: [
      ["main", 11],
      ["second", 1],
    ],
    own: true,
  },
  {
    key: "craft-orders",
    for: ["craft"],
    name: "Take orders of your own",
    text: "Customers who ask for you by name, paid by the piece over your wage.",
    from: 1,
    xp: [
      ["main", 6],
      ["trade", 3],
      ["persuasion", 1],
    ],
    bonus: { p: 0.4, x: 0.3, what: "Orders by the piece" },
    biz: 0.06,
  },
  {
    key: "craft-fine",
    for: ["craft"],
    name: "Work a fine piece",
    text: "Something to be proud of: slow, and now and then the talk of the town (and a buyer to match).",
    from: 1,
    xp: [
      ["main", 9],
      ["letters", 1],
    ],
    bonus: { p: 0.12, x: 0.8, what: "Your fine piece sold to a gentleman" },
    renown: 0.25,
    stress: 1,
  },
  {
    key: "craft-teach",
    for: ["craft"],
    name: "Teach the apprentices",
    text: "The boys learn the trade at your bench: the master notices, and so does the guild.",
    from: 2,
    xp: [
      ["leadership", 4],
      ["main", 4],
      ["persuasion", 2],
    ],
    boss: { v: 5, why: "Brings the boys on" },
    promo: 1.2,
  },
  {
    key: "craft-books",
    for: ["craft"],
    name: "Keep the shop's books",
    text: "Orders, debts and the timber merchant's bill: a shop well kept loses less.",
    from: 2,
    xp: [
      ["trade", 6],
      ["letters", 4],
    ],
    boss: { v: 3, why: "Keeps the books straight" },
    biz: 0.06,
  },
  // ---------------------------------------------------------------- the sea
  {
    key: "sea-deck",
    for: ["sea"],
    name: "Haul, splice and pump",
    text: "A sailor's ordinary work, done without being told twice.",
    from: 0,
    xp: [
      ["main", 7],
      ["craft", 2],
      ["fighting", 1],
    ],
    boss: { v: 3, why: "A handy seaman" },
  },
  {
    key: "sea-aloft",
    for: ["sea"],
    name: "Go aloft in all weathers",
    text: "Topmen are paid a little more, and fall a little further.",
    from: 0,
    xp: [
      ["main", 9],
      ["fighting", 1],
    ],
    bonus: { p: 0.5, x: 0.15, what: "A topman's extra" },
    mishap: { p: 0.04, hurt: 12, what: "A fall from the yards" },
    renown: 0.1,
  },
  {
    key: "sea-helm",
    for: ["sea"],
    name: "Stand watch at the helm",
    text: "Steer and con the ship: the navigation, the stars and the lead line.",
    from: 1,
    xp: [
      ["main", 6],
      ["letters", 3],
      ["leadership", 1],
    ],
    promo: 1.15,
  },
  {
    key: "sea-venture",
    for: ["sea"],
    name: "Trade a little on your own account",
    text: "A sailor's private venture: a few goods in your sea chest, sold at the far end.",
    from: 1,
    xp: [
      ["trade", 6],
      ["main", 4],
    ],
    bonus: { p: 0.45, x: 0.3, what: "Your private venture sold" },
    mishap: { p: 0.1, x: 0.25, what: "Your venture spoiled in the hold" },
  },
  {
    key: "sea-log",
    for: ["sea"],
    name: "Keep the log and the stores",
    text: "Write up the log, count the casks, settle the purser's accounts.",
    from: 2,
    xp: [
      ["letters", 5],
      ["trade", 3],
      ["leadership", 2],
    ],
    boss: { v: 4, why: "Keeps a true log" },
    biz: 0.05,
  },
  // ---------------------------------------------------------------- trade
  {
    key: "trade-counter",
    for: ["trade"],
    name: "Mind the counter",
    text: "Serve, weigh, measure and make change: the custom of the house.",
    from: 0,
    xp: [
      ["main", 7],
      ["persuasion", 3],
    ],
    bonus: { p: 0.3, x: 0.1, what: "Tips from the customers" },
  },
  {
    key: "trade-ledgers",
    for: ["trade"],
    name: "Keep the ledgers",
    text: "Day-book, journal and ledger, in a fair hand: the master sleeps better.",
    from: 0,
    xp: [
      ["letters", 5],
      ["main", 5],
    ],
    boss: { v: 5, why: "Keeps the books to the farthing" },
    biz: 0.05,
  },
  {
    key: "trade-custom",
    for: ["trade"],
    name: "Go out after custom",
    text: "Call on the planters and the ships' masters, and bring the business in: a commission on what they buy.",
    from: 1,
    xp: [
      ["persuasion", 6],
      ["main", 4],
    ],
    bonus: { p: 0.4, x: 0.3, what: "A commission on new custom" },
    biz: 0.08,
  },
  {
    key: "trade-ships",
    for: ["trade"],
    not: ["innkeeper"],
    name: "Deal with the ships' masters",
    text: "Buy cargoes off the ships before they reach the wharf: sharp dealing, sometimes too sharp.",
    from: 2,
    xp: [
      ["main", 7],
      ["persuasion", 3],
    ],
    bonus: { p: 0.35, x: 0.45, what: "A cargo bought cheap off a ship" },
    mishap: { p: 0.1, x: 0.3, what: "A cargo that wasn't what was promised" },
    renown: 0.1,
  },
  {
    key: "inn-host",
    for: ["innkeeper"],
    name: "Play the host",
    text: "Know every traveller's name and every local's tab: the house fills, and you hear everything.",
    from: 0,
    xp: [
      ["persuasion", 6],
      ["main", 4],
    ],
    bonus: { p: 0.35, x: 0.2, what: "A good week in the taproom" },
    stress: 1,
  },
  // ---------------------------------------------------------------- the learned
  {
    key: "learned-copy",
    for: ["learned"],
    name: "Copy, file and fair-write",
    text: "The paper that keeps the place going, in a clear hand.",
    from: 0,
    xp: [
      ["letters", 7],
      ["main", 3],
    ],
    boss: { v: 4, why: "A clear hand and a tidy desk" },
  },
  {
    key: "learned-study",
    for: ["learned"],
    name: "Read in the evenings",
    text: "The books of your calling, by candlelight: more learned, a little more tired.",
    from: 0,
    xp: [
      ["main", 9],
      ["letters", 3],
    ],
    stress: 1,
    own: true,
  },
  {
    key: "learned-people",
    for: ["learned"],
    not: ["physician", "midwife", "apothecary"],
    name: "Go among the people",
    text: "The parish, the petitioners, the readers, the families of your pupils: you're known, and your name grows.",
    from: 1,
    xp: [
      ["persuasion", 5],
      ["main", 5],
    ],
    renown: 0.2,
  },
  {
    key: "learned-sick",
    for: ["physician", "midwife", "apothecary"],
    name: "Visit the sick",
    text: "House calls at all hours: fees from those who can pay, and a fever now and then for your trouble.",
    from: 0,
    xp: [
      ["medicine", 8],
      ["persuasion", 2],
    ],
    bonus: { p: 0.4, x: 0.3, what: "Fees from house calls" },
    mishap: { p: 0.04, hurt: 8, what: "A fever caught at a bedside" },
    renown: 0.1,
  },
  {
    key: "learned-pupils",
    for: ["learned"],
    name: "Take pupils of your own",
    text: "Young men and women who'd learn your calling, paying for the privilege.",
    from: 2,
    xp: [
      ["leadership", 3],
      ["letters", 4],
      ["main", 3],
    ],
    bonus: { p: 0.5, x: 0.2, what: "Your pupils' fees" },
    promo: 1.15,
  },
  {
    key: "learned-press",
    for: ["learned"],
    name: "Write for the press",
    text: "Letters to the papers and a pamphlet now and then, under a Roman name.",
    from: 1,
    xp: [
      ["letters", 7],
      ["persuasion", 3],
    ],
    bonus: { p: 0.15, x: 0.4, what: "A pamphlet that sold" },
    renown: 0.2,
    stress: 1,
  },
  // ---------------------------------------------------------------- arms
  {
    key: "arms-drill",
    for: ["arms"],
    name: "Drill and stand your sentries",
    text: "The manual exercise, the guard roster, the button stick: done smartly.",
    from: 0,
    xp: [
      ["main", 7],
      ["leadership", 3],
    ],
    boss: { v: 4, why: "A smart soldier" },
  },
  {
    key: "arms-pickets",
    for: ["arms"],
    name: "Volunteer for the pickets",
    text: "The forward posts and the patrols: dangerous, noticed, and good for a name.",
    from: 0,
    xp: [
      ["main", 7],
      ["woodcraft", 3],
    ],
    mishap: { p: 0.05, hurt: 12, what: "A skirmish at the picket" },
    renown: 0.3,
    promo: 1.25,
    stress: 2,
  },
  {
    key: "arms-forage",
    for: ["arms"],
    name: "Forage and scout",
    text: "Out after firewood, fodder and news of the country: the woods teach you.",
    from: 0,
    xp: [
      ["woodcraft", 6],
      ["main", 3],
      ["trade", 1],
    ],
    bonus: {
      p: 0.25,
      x: 0.25,
      what: "Something worth having found on the road",
    },
  },
  {
    key: "arms-books",
    for: ["arms"],
    name: "Keep the company's books",
    text: "Musters, rations and pay lists: the quartermaster's friend.",
    from: 1,
    xp: [
      ["letters", 6],
      ["trade", 2],
      ["leadership", 2],
    ],
    boss: { v: 4, why: "Keeps the rolls straight" },
  },
  {
    key: "arms-recruits",
    for: ["arms"],
    name: "Drill the recruits",
    text: "Make soldiers of ploughboys: the officers notice who does it well.",
    from: 2,
    xp: [
      ["leadership", 7],
      ["main", 3],
    ],
    boss: { v: 6, why: "Makes soldiers of them" },
    promo: 1.3,
    stress: 1,
  },
  // ---------------------------------------------------------------- the law
  {
    key: "law-rounds",
    for: ["law"],
    name: "Walk the rounds",
    text: "Lantern and staff, the night's rounds, the hour called: the town sleeps easier.",
    from: 0,
    xp: [
      ["main", 7],
      ["persuasion", 3],
    ],
    boss: { v: 3, why: "Never misses a round" },
  },
  {
    key: "law-taverns",
    for: ["law"],
    name: "Sit in the taverns in plain clothes",
    text: "Listen for who's spending what they shouldn't have: a reward now and then, and a knife now and then.",
    from: 0,
    xp: [
      ["stealth", 6],
      ["persuasion", 4],
    ],
    bonus: { p: 0.25, x: 0.4, what: "A reward for a rogue taken" },
    mishap: { p: 0.04, hurt: 10, what: "A knife in a back lane" },
  },
  {
    key: "law-book",
    for: ["law"],
    name: "Keep the watch-house book",
    text: "Who was taken up, for what, and by whom: the justices read it.",
    from: 1,
    xp: [
      ["letters", 6],
      ["main", 4],
    ],
    boss: { v: 4, why: "Keeps a true book" },
    promo: 1.1,
  },
  {
    key: "law-lead",
    for: ["law"],
    name: "Lead the night watch",
    text: "Set the watchmen their beats and see they walk them.",
    from: 2,
    xp: [
      ["leadership", 6],
      ["main", 4],
    ],
    renown: 0.2,
    promo: 1.2,
  },
  // ---------------------------------------------------------------- the wrong side of the law
  {
    key: "crime-low",
    for: ["crime"],
    name: "Keep a low profile",
    text: "Small takings, quiet nights, and the watch looking elsewhere.",
    from: 0,
    xp: [
      ["stealth", 7],
      ["main", 3],
    ],
    heat: 0.6,
    stress: -1,
  },
  {
    key: "crime-bold",
    for: ["crime"],
    name: "Go after the big prizes",
    text: "The rich houses, the fat purses, the full cargoes: more taken, more heat, and the rope if it goes wrong.",
    from: 1,
    xp: [
      ["main", 7],
      ["stealth", 3],
    ],
    bonus: { p: 0.35, x: 0.5, what: "A rich haul" },
    mishap: { p: 0.06, heat: 12, what: "Seen at it" },
    heat: 1.4,
    stress: 2,
  },
  {
    key: "crime-gang",
    for: ["crime"],
    name: "Run with the gang",
    text: "Share the work and the take with others: safer, and you learn to lead men who'd cut your throat.",
    from: 1,
    xp: [
      ["leadership", 5],
      ["fighting", 3],
      ["main", 2],
    ],
    heat: 0.9,
    promo: 1.15,
  },
  // ---------------------------------------------------------------- the native peoples
  {
    key: "native-hunt",
    for: ["native"],
    name: "Hunt with the others",
    text: "The long hunts of the season, shared: meat for the village, skins for trade.",
    from: 0,
    xp: [
      ["woodcraft", 7],
      ["fighting", 3],
    ],
    bonus: { p: 0.3, x: 0.3, what: "Skins from a good hunt, traded" },
    mishap: { p: 0.03, hurt: 8, what: "Gored by a buck" },
  },
  {
    key: "native-young",
    for: ["native"],
    name: "Teach the young ones",
    text: "The old ways and the skills of your calling, passed on at the fire: the elders notice.",
    from: 1,
    xp: [
      ["leadership", 4],
      ["main", 4],
      ["persuasion", 2],
    ],
    renown: 0.25,
    promo: 1.15,
  },
  {
    key: "native-posts",
    for: ["native"],
    name: "Trade at the posts",
    text: "Take the village's goods to the colonists' posts, and bargain hard.",
    from: 1,
    xp: [
      ["trade", 6],
      ["persuasion", 4],
    ],
    bonus: { p: 0.35, x: 0.3, what: "A good bargain at the post" },
  },
  {
    key: "native-council",
    for: ["native"],
    name: "Speak at the council fire",
    text: "Have your say when the elders sit: words well chosen are remembered.",
    from: 2,
    xp: [
      ["persuasion", 7],
      ["leadership", 3],
    ],
    renown: 0.35,
    stress: 1,
  },
];

/** What each kind of work calls the usual, in a line. */
export const USUAL_TEXT: Record<JobGroup, string> = {
  land: "The year's round of the fields: whatever the season wants.",
  craft: "Whatever the bench wants of you today.",
  sea: "Whatever the mate wants of you.",
  trade: "Whatever the counting room wants.",
  learned: "The ordinary round of your calling.",
  arms: "Whatever the sergeant wants of you.",
  law: "Whatever the constable wants of you.",
  crime: "Whatever comes your way.",
  native: "Whatever the season and the village need.",
};
