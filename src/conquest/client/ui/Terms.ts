// The words the game counts by (renown, favour, station, heat, loyalty...),
// each with what it is, what it's for and how to raise it. Every number in
// the banner and on the pages can be pointed at (or tapped) for this, and the
// How to Play's glossary is made of the same entries, so the two never
// disagree. Facts here are checked against the engine (the file each comes
// from is named beside it).

import { html, TemplateResult } from "lit";
import { num, type TipContent } from "../Tip";

export interface Term {
  /** The word as shown. */
  name: string;
  /** What it is, in a line. */
  what: string;
  /** What it does for you. */
  good: string;
  /** How to get more of it (or less, for the bad ones). */
  raise: string;
  /** The guide's chapter about it. */
  ch: string;
}

export const TERMS: Record<string, Term> = {
  // Life.ts (monthly purse), Money.ts
  purse: {
    name: "Purse",
    what: "Your coins. The small figure beside it is what a month brings in or takes out, all told.",
    good: "Pays for how you live, houses, land, boats, gatherings, lessons, bribes and everything else with a price.",
    raise:
      "Work (wages at the month's end), rents from land, a business's takings, trade between markets, ventures and shares, contracts, leads.",
    ch: "money",
  },
  // Life.ts: renown above 15 slips back 2% of the excess a month.
  renown: {
    name: "Renown",
    what: "How many people know your name, and think it worth knowing.",
    good: "Opens doors: the governor's levee (5), a place at court and the assembly (20), a company of your own (40), an invitation to Parliament (50, with favour 15). Helps with offices, petitions, letters and a governor's reprieve.",
    raise:
      "Promotions, office and its duties, gatherings that go well, gifts to the town, standing a round, contracts, battles, leads that pay, reaching an ambition. Above 15 it fades a little each month unless it's fed.",
    ch: "standing",
  },
  // Politics.ts governorScore, writeToCrown; Life.ts favour fades 2% a month.
  favour: {
    name: "Favour",
    what: "Whether your name is known and liked at home: the crown's ear (for native peoples, the elders' regard). From 0 to 100.",
    good: "Counts half again as much as renown toward being made governor. With renown 50 and favour 15 an invitation to Parliament may come. It helps petitions (a pardon, redress, a charter for a settlement) and appointments the governor makes.",
    raise:
      "Write to the crown at the governor's house or the docks (2 coins, every 60 days: +6 if the letter is well judged, +1 if not). Gifts to the town, a burgess's bill that passes, carrying a wampum belt, and some choices in letters. It fades by 2% a month; an heir keeps less than a third.",
    ch: "favour",
  },
  // Life.ts monthly health
  health: {
    name: "Health",
    what: "Your body, from 0 to 100. At 0 you die, and low health makes a sudden death likelier.",
    good: "Keeps you alive. Below 45 the risk of dying in any month rises; below 25 it triples.",
    raise:
      "It mends a little each month by itself (faster when low). Rest at home, buy physic at the apothecary (3), visit a village healer (0.5), live comfortably. Age from 45, tropical summers, frugal winters, wounds, overtime and stress of 70 or more wear it down.",
    ch: "health",
  },
  stress: {
    name: "Stress",
    what: "Worry and strain, from 0 to 100.",
    good: "Keep it low: at 70 or more it costs you health every month, and at 95 strain can hurt you outright.",
    raise:
      "To bring it down: rest at home, take a room at the tavern (1), pray, drink and listen, an evening with your family, a gift to the town, shirking at work. Hard work, overtime, debt, grief, scandal and living beneath your station push it up.",
    ch: "health",
  },
  // LifeQueries stationOf, beneathStation
  station: {
    name: "Station",
    what: "Where the town ranks you: labouring folk, the middling sort, gentlefolk, the better sort, the great. It's set by what your rung pays, the offices you hold, your renown (60, 150) and a fine house.",
    good: "Each station expects a way of living (frugal up to grand) and, from gentlefolk up, a house. Live beneath it while you could afford better and it costs 3 stress and 0.4 renown a month for each step short.",
    raise:
      "Climb your trade (a rung paying 3, 7, 13 or 21 a month lifts you a station), hold office, become well known. Then live up to it: Estate › Purse sets how you live; Estate › House & land buys the house.",
    ch: "money",
  },
  // Interactions.ts, LifeQueries opinionOf
  opinion: {
    name: "Opinion",
    what: "What someone thinks of you, from −100 to +100. Point at the number to see every reason.",
    good: "Decides whether they'll agree: hire you, promote you, lend, marry, appoint, come to your gatherings, follow you.",
    raise:
      "Talk with them, flatter, give gifts, do them favours, invite them to gatherings, share their faith, people and tongue. Insults, threats, rivals and scandal lower it.",
    ch: "people",
  },
  ties: {
    name: "Ties",
    what: "Friend, rival, lover, patron, betrothed and the rest: what you are to someone, beyond what they think of you today.",
    good: "Friends help and forgive; a patron (someone powerful who backs you) helps with posts, pardons and the gallows; rivals and nemeses work against you.",
    raise:
      "Make friends by spending time and doing kindnesses (their card); ask someone well placed who likes you to be your patron.",
    ch: "people",
  },
  // Crime.ts: HEAT_COOL 0.985 a day while in crooked work, 0.98 otherwise.
  heat: {
    name: "Heat",
    what: "How much the law of a nation wants you, from 0 to 100 (each nation keeps its own).",
    good: "Keep it low. The hotter you are, the likelier the watch takes you on a crooked day; from 25 lawmen (players too) can arrest you where they serve; at 45 you're wanted.",
    raise:
      "To cool it: it fades every day (about a third a month while you keep at crooked work, nearly half when you don't). Lie low at the den (4), square the watch (10 and half your heat), buy forged papers (25), make amends at the watch-house, or leave that nation's land.",
    ch: "crime",
  },
  notoriety: {
    name: "Notoriety",
    what: "Your name in the underworld, from 0 to 100.",
    good: "Opens the higher crooked rungs, the fence's trade (10), the big jobs at the den (5) and a band's respect. Honest folk think the less of you for it.",
    raise:
      "Crooked work and crimes raise it. It fades by half a point a month while you keep out of crooked work.",
    ch: "crime",
  },
  // Followers.ts
  loyalty: {
    name: "Loyalty",
    what: "How far someone in your service will stand by you, from 0 to 100.",
    good: "Below 15 they may leave in any month, and two months unpaid they go for certain. A clerk below 25 may run off with your stake; a rogue below 45 who's taken may talk.",
    raise:
      "Pay them on time, give a bonus, promote them. It drifts each month with what they think of you; a month unpaid costs 15.",
    ch: "followers",
  },
  strength: {
    name: "Strength",
    what: "How many you can put in a fight on a contract: you, the people with you, and your company.",
    good: "A contract's fight weighs your strength against the opposition's, shown as odds before you go.",
    raise:
      "Hire swords and officers, raise a company and drill it, get better at fighting and leadership.",
    ch: "followers",
  },
  skills: {
    name: "Skills",
    what: "What you're good at: fighting, leadership, persuasion, trade, craft, farming, seamanship, woodcraft, letters, faith, medicine and stealth. Your attributes (diplomacy, martial, stewardship, intrigue, learning) add to the skills they govern.",
    good: "Every check in the game (odds shown as a percentage) leans on a skill; trades need them to climb.",
    raise:
      "Doing the work (working hard teaches faster, overtime faster still), studying (the church, the bench, the apothecary), a tutor, and the acts that practise them (drill, hunt, read the gazette...). Diligent people learn faster at work.",
    ch: "you",
  },
  // Tongues.ts
  tongues: {
    name: "Tongues",
    what: "The languages you speak, each at a level: none, a few words, conversational, fluent.",
    good: "With no tongue in common you can only talk by signs; at a few words most things are harder. Kindred tongues help each other.",
    raise:
      "Lessons from anyone fluent (4 coins, their card), a grammar or dictionary where one's sold (You › Tongues shows them; good up to conversational), living among speakers, and talking with them. A good Learning makes it all quicker.",
    ch: "languages",
  },
  // Leads.ts
  trust: {
    name: "Trust",
    what: "How far a lead can be believed: a percentage, your judgement of the story.",
    good: "Whether the story was ever true is settled the first time anyone works it. Better trust means a truer story is likelier.",
    raise:
      "The gazette prints better-checked stories than the tavern. Good Letters judge print better; good Persuasion judges talk better.",
    ch: "leads",
  },
  campaign: {
    name: "Campaign points",
    what: "How your canvass is going while you stand for an election.",
    good: "At the count, the best-supported candidates win the seats.",
    raise:
      "Canvass the voters (tavern, market, council fire), print a broadside at the press (2), stand a round.",
    ch: "office",
  },
  scandal: {
    name: "Scandal",
    what: "Talk all over town about something you did (an affair found out, a threat made good).",
    good: "While it lasts you lose renown and people think less of you; it fades over the months.",
    raise:
      "Lie low and let it pass; keep secret affairs secret (Stealth and Intrigue help).",
    ch: "love",
  },
  // DICE (r14): DiceCore.ts (stakes, wilds), Dice.ts (the pot, experience).
  dice: {
    name: "Liar's dice",
    what: 'A tavern game for two to six: five dice each under a cup, bids on how many of a face lie under all the cups, and a call of "Liar!" to lift them.',
    good: "Win the pot (everyone's stake), ease your mind, and learn a straight face and a quick eye: it teaches Stealth. A big pot is talked about.",
    raise:
      "Open a table at the tavern (Things to do › Liar's dice…), or sit down at one. Bid what your own dice make likely, and call a bid that needs more than the table can hold.",
    ch: "dice",
  },
  dicewild: {
    name: "Wild ones",
    what: "At Liar's dice a one counts as whatever face was bid. Nobody bids on ones.",
    good: "Every one under the cups helps any bid: a third of the dice you can't see count for any face.",
    raise:
      "Count your own ones with the face you bid. Four of five dice hidden? Expect about a third of them to count.",
    ch: "dice",
  },
  // SEA (r15): Cruises.ts, CruiseData.ts, Privateers.ts, Storms.ts
  articles: {
    name: "Articles",
    what: "The agreement a ship's company signs before a cruise: the shares of every prize, by rank (a privateer's captain has 4 parts, an officer 2, a hand 1; pirates share more evenly: 2, 1½ and 1).",
    good: "Signing puts you aboard: you sail with her on the map, and are paid your parts when her prizes are sold.",
    raise:
      "Sign at the quay where a ship is fitting out (Work › At sea). Seamanship and a name get you a better berth: an officer's needs seamanship 7, a captain's 10 and renown, or a pirate's name.",
    ch: "sea",
  },
  marque: {
    name: "Letter of marque",
    what: "A governor's commission to take the enemy's ships as prizes, granted only while the colony is at war. It's what makes a privateer not a pirate.",
    good: "Prizes taken under it are condemned by the prize court and sold lawfully; it lapses with the peace.",
    raise:
      "Take one out for your own boat at a port of a colony at war (the fees are on the button), or get up a privateering company. Take a ship it doesn't cover (a neutral, or your own nation's) and you're a pirate.",
    ch: "sea",
  },
  "prize-court": {
    name: "The prize court",
    what: "The vice-admiralty court at home that condemns a privateer's prizes as lawful and sells them. Its fees and the Crown's part take 15 in a hundred.",
    good: "Of what's left, half goes to her owners and half to her company by their parts. Pirates have no court: a fence pays 30 to 60 in a hundred, best at a pirates' haven.",
    raise:
      "Send prizes in with a prize crew (all her worth, if she isn't retaken) or carry off her plunder (a third, but sure).",
    ch: "sea",
  },
  "privateer-company": {
    name: "Privateering company",
    what: "A partnership of owners who fit out a privateer: a ship, her letter of marque, and her cruises, with shares by what each put in.",
    good: "The owners have half of what the prize court condemns, paid out at once by share. Players can sail in her as captain or officers.",
    raise:
      "In wartime, at a port of a colony at war: Work › At sea, Get up a company. Ask other players by letter; the town's merchants take up the rest.",
    ch: "sea",
  },
  hurricane: {
    name: "Hurricane",
    what: "A great storm out of the tropical sea, June to November (worst in August and September), moving 300 to 600 km a day across the map.",
    good: "Ships in its path are battered, blown off course or lost; towns it strikes lose roofs, crops, ships in harbour and people, and prices rise after.",
    raise:
      "Watch for the signs a day or two ahead (a long swell, a falling glass, a red sky): batten down ashore, or run for a harbour at sea.",
    ch: "sea",
  },
  dicepot: {
    name: "The pot",
    what: "Everyone's stake at a table of Liar's dice, put in when they sit down.",
    good: "The last with dice takes it all. Getting up from a game leaves your stake in it; getting up before the first roll gives it back.",
    raise:
      "A bigger stake makes a bigger pot: 2, 5, 10 or 25 coins a seat. The town's people of small means won't sit down at the big ones.",
    ch: "dice",
  },
  // LEDGER (r15): Ledger.ts (the forecast, the books, the tracker)
  byluck: {
    name: "By luck",
    what: "Money that depends on chance: what a boat brings in at her work, a clerk's trading, a dividend, a cargo come home, the rents your tenants manage. Shown as what's expected, with the worst and the best.",
    good: "Over many months it comes to about what's expected; in any one month it can be the worst or the best.",
    raise:
      "A better master for a boat, a better clerk for a stake, the right waters and the right season, peace for a cargo. The odds are shown before you commit: under a boat, beside a clerk's stake, at the boatyard and among people for hire.",
    ch: "ledger",
  },
  outworking: {
    name: "Out working",
    what: "Everything of yours away earning: boats at work, cargoes at sea, shares, clerks trading, a band on a job, partnerships, a company, a newspaper, contracts in hand.",
    good: "Estate › Ledger lists them all: how each stands, when it's due back, what it costs to keep and what it should bring.",
    raise:
      "Buy a boat and crew her, send a clerk trading, venture a cargo, take shares, go into partnership.",
    ch: "ledger",
  },
  statement: {
    name: "The month's accounts",
    what: "At each month's turn, a statement of every coin that came in and went out, line by line: at the turn (with what was expected beside it), by luck, and during the month.",
    good: "Shows where the money went, and what each boat, clerk and venture really made. The last twelve months are kept in Estate › Ledger.",
    raise: "Open Estate › Ledger, or click the month's notice when it comes.",
    ch: "ledger",
  },
  // BUSINESS (r15): Business.ts, Company.ts
  custom: {
    name: "Custom",
    what: "The trade a town has for a business of its kind, counted in hands' worth: more in a bigger town, at a port, or where the country makes what the trade works; less for each rival (another inn, another store).",
    good: "Hands within it bring in their full takings; a hand past it brings in about a third. A new business builds its custom over three months, and the season moves it.",
    raise:
      "Choose a bigger town, or a trade the town has few of; start small and grow when the custom is there (Estate › Business shows it).",
    ch: "business",
  },
  minded: {
    name: "Minded",
    what: "A business with someone there to run it: you in the town with no other work (or at your own trade there), a managing partner who's free, or a manager of yours.",
    good: "A minded business takes all its takings; nobody minding it, it takes 0.6 of them, and its hands no longer earn their wages.",
    raise:
      "Stay in town and keep clear of other work, or put one of your people in as its manager (on its page).",
    ch: "business",
  },
  factor: {
    name: "Factor",
    what: "A trading company's agent at a port: buys and sells its goods for a commission and a small retainer.",
    good: "Where the country makes the goods, factors buy at the landings for less than the market; they hold a cargo back while prices wouldn't pay.",
    raise: "One at each port of the Americas a company uses.",
    ch: "business",
  },
  // INTRIGUE (r15): Seduction.ts, Plots.ts, Weddings.ts
  scheme: {
    name: "A scheme",
    what: "Something you have going on someone over weeks: winning them (as a lover, or to keep), or a plot to have them killed.",
    good: "Society › Intrigue shows each as it ripens: the weeks gone, the chance it comes off, the chance it's found out, and what's happened.",
    raise:
      "Open someone's card: Hearts and schemes. The odds are shown before you begin. Nobody else is told of it unless it comes out.",
    ch: "intrigue",
  },
  kept: {
    name: "Kept",
    what: "A lover kept at a monthly allowance: a mistress, or a kept man, with rooms of their own.",
    good: "As close as lovers, without a marriage. The allowance is a line in the month's figure; two months unpaid and it's over.",
    raise:
      "Seduce… on their card, and choose To keep. Grown people only, and never close kin. End it on Society › Intrigue.",
    ch: "intrigue",
  },
  betrothal: {
    name: "Betrothed",
    what: "Promised to marry, with the wedding still to plan.",
    good: "Plan the wedding as an event (the rite, how grand, the day, the guests), or marry quietly before the minister. Breaking it off costs damages and goodwill.",
    raise:
      "Ask for their hand (Interactions on their card), or say yes when you're asked.",
    ch: "intrigue",
  },
  drill: {
    name: "Drill and spirits",
    what: "How trained your company is, and how glad they are to be in it.",
    good: "Both make the company count for more in a fight. A month unpaid, a quarter of the men desert and spirits fall; three months and the company is gone.",
    raise:
      "Time in quarters drills them (officers among your people speed it); every month's pay lifts their spirits.",
    ch: "followers",
  },
};

/** A term's explanation, as a tooltip. */
export function termTip(key: string): TipContent {
  const t = TERMS[key];
  if (!t) return { title: key };
  return {
    title: t.name,
    notes: [t.what, `What it's for: ${t.good}`, `How: ${t.raise}`],
  };
}

/**
 * A word (or a number) that explains itself: point at it, tap it or tab to
 * it for what it is, what it's for and how to raise it.
 */
export function term(
  key: string,
  label?: string | TemplateResult,
  cls = "",
): TemplateResult {
  return num(
    label ?? TERMS[key]?.name ?? key,
    () => termTip(key),
    `cq-term ${cls}`,
  );
}

/** "?" beside a heading: a tooltip for the word, for headings that are words. */
export function termMark(key: string): TemplateResult {
  return html`${num("?", () => termTip(key), "cq-term-mark")}`;
}
