// The words the game counts by (renown, favour, station, heat, loyalty...),
// each with what it is, what it's for and how to raise it. Every number in
// the banner and on the pages can be pointed at (or tapped) for this, and the
// How to Play's glossary is made of the same entries, so the two never
// disagree. Facts here are checked against the engine (the file each comes
// from is named beside it).

import { html, TemplateResult } from "lit";
import { STRESS_TIERS } from "../../engine/Body"; // LIFE (r21)
import { num, type TipContent } from "../Tip";

/** LIFE (r21): "×1.1 from 20, ×1.25 from 40, …", from the table the engine applies. */
const STRAIN = STRESS_TIERS.slice(1)
  .map((t) => `×${t.mult} from ${t.from}`)
  .join(", ");

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
  // ---- WAR (r17): ReclaimCore.ts (CLAIM, FERMENT)
  ferment: {
    name: "Ferment",
    what: "How near a town under foreign rule is to rising against its rulers, from 0 to 100. Each month it moves about an eighth of the way to where it's heading.",
    good: "From 70 a plot may form among its people (a chance a month, more the higher it stands). On its day the plot rises: found out, beaten in the streets, or the town taken, and then held six months to win it back for its old owner.",
    raise:
      "Its people of another tongue and faith than their rulers, still loyal to their old owner (colonists under a native nation most of all); no garrison; high taxes, a cruel or greedy ruler; hunger; the first years; the old owner's army near, or at war with its rulers. A player can stir it up (Persuasion). It falls with a garrison, a tolerant or just ruler, and the years, as people get used to it; a rising crushed cows the town for five years.",
    ch: "claims",
  },
  claim: {
    name: "Claim",
    what: "A nation's wish to have back a town it lost, from 0 to 100: its size, whether it was their capital, how long it was theirs, and whether its people are still theirs.",
    good: "A claim of 35 or more (40 against another crown's colony) makes the computer's nations go to war for the town when they're stronger in the field; in any war their armies are drawn to it, and at the peace they ask for it first.",
    raise:
      "It's set when the town is lost. It holds ten years, then fades to nothing by thirty; a war for it that ends without it halves it, and after two it's given up. A town sold leaves no claim.",
    ch: "claims",
  },
  // ---- end WAR (r17)
  // ---- CROWN (r18): CrownCore.ts (MEANS, FORTS, EXPEDITION)
  regiments: {
    name: "Regiments from Europe",
    what: "The crown's own soldiers, sent across when its colony goes to war in America: some when the war begins, a reinforcement each spring, by the crown's means in its age and what the war is to it.",
    good: "They land at the colony's port and join its armies; the computer sends them first against the war's aims (a town of its own the enemy holds, or one it lost and claims).",
    raise:
      "Britain sent few before the 1750s and many after; France its troupes de la marine all along and line battalions from 1755; Spain fleets of relief; the Dutch few. The colony pays their passage and pay; they suffer the fevers, and go home at the peace.",
    ch: "crown",
  },
  expedition: {
    name: "Expedition",
    what: "Regiments, guns and (for a town on the coast) a squadron, sent by the crown on a governor's petition to take back a town his colony lost.",
    good: "Taken back: renown and favour for the governor who asked, and for those who rode with it. If the colony isn't at war with the town's holder, the crown makes war for it.",
    raise:
      "The governor petitions (four months of letters, friends at court and the colony's offer, then the answer two months later, at the odds shown). Anyone of the colony can ask him for it, pay in, write to court for it, and ride with it when it lands.",
    ch: "crown",
  },
  garrison: {
    name: "Garrison",
    what: "A fortress port's soldiers of the crown's own: Spain's (Havana, St. Augustine, Veracruz and the rest) and France's troupes de la marine (Quebec, Montreal, Louisbourg, Mobile).",
    good: "It holds the town: an enemy must beat it in the field before a siege can begin. The computer never marches it off.",
    raise:
      "Renewed every year with the fleet while the crown holds the town; when the town is lost, it sails for home.",
    ch: "crown",
  },
  // ---- end CROWN (r18)
  // Life.ts (monthly purse), Money.ts
  purse: {
    name: "Purse",
    what: "Your coins. The small figure beside it is what a month brings in or takes out, all told.",
    good: "Pays for how you live, houses, land, boats, gatherings, lessons, bribes and everything else with a price.",
    raise:
      "Work (wages at the month's end), rents from land, a business's takings, trade between markets, ventures and shares, contracts, leads.",
    ch: "money",
  },
  // Life.ts / StandingCurve.ts (POLLS r16): above 15 it slips back 2% of the
  // excess a month, more above 60; above 60 each gain counts for less.
  renown: {
    name: "Renown",
    what: "How many people know your name, and think it worth knowing.",
    good: "Opens doors: the governor's levee (5), a place at court and the assembly (20), a company of your own (40), an invitation to Parliament (50, with favour 15), being thought famous (60, and 100). A council seat's case counts it up to 100. Helps with offices, petitions, letters and a governor's reprieve. At a poll it counts only lightly (0.12 a point, 10 at most): the county's regard, the canvass and a patron count for more.",
    raise:
      "Promotions, office and its duties, gatherings that go well, gifts to the town, standing a round, contracts, battles, leads that pay, reaching an ambition. Above 15 it fades a little each month unless it's fed. Above 60 it comes harder (at 100 a gain counts half) and fades faster the higher it stands: the great are forgotten fast.",
    ch: "standing",
  },
  // Politics.ts governorScore, writeToCrown; Standing.ts (POLLS r16): the
  // curve above 60, and the slip in an unchanged seat.
  favour: {
    name: "Favour",
    what: "Whether your name is known and liked at home: the crown's ear (for native peoples, the elders' regard). From 0 to 100.",
    good: "Counts half again as much as renown toward being made governor. With renown 50 and favour 15 an invitation to Parliament may come. It helps petitions (a pardon, redress, a charter for a settlement), appointments the governor makes, and a council seat's case (up to 60).",
    raise:
      "Write to the crown at the governor's house or the docks (2 coins, every 60 days: +6 if the letter is well judged, +1 if not). Gifts to the town, a burgess's bill that passes, carrying a wampum belt, and some choices in letters. It fades by 2% a month, faster above 60, where each gain counts for less (at 85, half). A year in the same seat with nothing delivered (a law, a work, a power or a measure carried) and it slips (4, then 6, 8, 10). An heir keeps less than a third.",
    ch: "favour",
  },
  // Life.ts monthly health
  // LIFE (r21): the most it can be falls from 45; strain makes every hurt worse.
  health: {
    name: "Health",
    what: "Your body, from 0 to the most it can be now (100 to 45, then less with the years: 95 at 50, 80 at 60, 60 at 70; less for the sickly, the gouty, an old wound, the pox). At 0 you die.",
    good: "Keeps you alive. Below 45 the risk of dying in any month rises; below 25 it triples.",
    raise: `It mends a little each month by itself (faster when low). Rest at home, buy physic at the apothecary (3), visit a village healer (0.5), live comfortably, keep a physician. Age, tropical summers, frugal winters, wounds, overtime and stress wear it down, and stress makes every hurt take more (${STRAIN}).`,
    ch: "health",
  },
  stress: {
    name: "Stress",
    what: "Worry and strain, from 0 to 100.",
    good: `Keep it low: every hurt takes more under strain (${STRAIN}); at 70 or more it costs you health every month, and at 95 strain can hurt you outright.`, // LIFE (r21)
    raise:
      "To bring it down: rest at home, take a room at the tavern (1), pray, drink and listen, an evening with your family, a gift to the town, shirking at work. Hard work, overtime, debt, grief, scandal and living beneath your station push it up.",
    ch: "health",
  },
  // LifeQueries stationOf, beneathStation
  station: {
    name: "Station",
    what: "Where the town ranks you: labouring folk, the middling sort, gentlefolk, the better sort, the great. It's set by what your rung pays, the offices you hold, your renown (60, 100) and a fine house.",
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
      "Talk with them, flatter, give gifts, do them favours, invite them to gatherings, share their faith, people and tongue. Talk, flattery, gifts, courting, a round and alms each add less again than the last time, and together count half past 25: it takes time. Insults, threats, rivals and scandal lower it in full.", // LIFE (r21)
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
    good: "Every check in the game (odds shown as a percentage) leans on a skill; trades need them to climb. Thirty levels: able at 8, skilled at 12, expert at 16, a master at 20, a legend at 30.", // LIFE (r21)
    raise:
      "Doing the work (working hard teaches faster, overtime faster still), studying (the church, the bench, the apothecary), a tutor, someone who'll teach you (the further above you they stand, the more), and the acts that practise them (drill, hunt, read the gazette...). Each level costs more than the last: from 10, much more. Diligent people learn faster at work.",
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
  // LEGACY (r21): server/conquest/ConquestPay.ts, Coins.ts (PLAY_PAY), ConquestRooms.ts (PAUSE_LOCK_MS)
  tabletime: {
    name: "Time at the table",
    what: "Real minutes you spend playing a game, counted by the server: each pays 2.5 Derp Coins (150 an hour), about once a minute while the world goes on.",
    good: "Most of what a game pays you. It also lets your line's marks be paid as they're reached: 60 coins of them for every hour you've played this game.",
    raise:
      "Play: a minute counts when you've made a choice of your own in the last 5 minutes (anything you do, a letter answered). With the clock stopped, only the first 10 minutes of each stop count; the speed (or skipping ahead) makes no difference; at most 6 hours a day are paid.",
    ch: "coins",
  },
  pauselock: {
    name: "The pause in company",
    what: "In a game with others, anyone may stop the clock or start it again; but for 10 seconds after someone stops it, only they may start it.",
    good: "Gives whoever paused a moment to read a letter or look at the map without someone else setting the clock going at once.",
    raise:
      "Under the clock it says who paused, and counts down the seconds; after that anyone may start it. The host still sets the speed (and a new speed waits for the clock to start).",
    ch: "multiplayer",
  },
  // LEGACY (r21): Legacy.ts, Chronicle.ts
  familyline: {
    name: "The family's line",
    what: "Each life of your line in order: who they married, their children, and the one who carried the line on (gilt). A life taken up from someone else's family is marked so.",
    good: "Each of them has a chapter in your story: how they came into it, what they did, the people who mattered, their numbers and their roads. When the game ends, Derp Land keeps every character with their stats.",
    raise:
      "Marry and raise children: when you die, the eldest (or the heir you name) carries the line on. With no heir, the line ends; you can take up someone else's life, or begin again.",
    ch: "story",
  },
  // STORY (r17): StoryCore.ts, StoryBook.ts
  greatmoment: {
    name: "A great moment",
    what: "One of the moments a life is remembered for above the rest: drawn larger in your story, ringed in gilt, with a gilt pin on its map.",
    good: "The story keeps them however long your line runs (the small things go first).",
    raise:
      "Marry, win a battle in command, take the governor's chair, a galleon or a degree, find a fortune, ride out a great storm. A birth and a death are great moments too.",
    ch: "story",
  },
  // CHAIR (r16): ChairCore.ts, Chair.ts
  commission: {
    name: "Commission",
    what: "The crown's appointment of a governor: three to eight years, then renewed for a few more, or another man named.",
    good: "When it runs out the chair can fall empty without anyone dying. Society › Standing shows when, the crown's odds of renewing it, and your chance of being named in his place (the crown weighs the colony's best case against a man of its own).",
    raise:
      "The crown renews a governor it trusts (the colony's favour) and hasn't heard grievances against: an address carried, a petition near-run, towns lost.",
    ch: "chair",
  },
  lieutenant: {
    name: "Lieutenant governor",
    what: "The crown's commission to act for the governor in his absence and succeed him: named when he grows old or ill.",
    good: "Acting, you preside at the council with the acting governor's pay; when the chair falls empty, you take it.",
    raise:
      "Be the best case in the colony (70 or more) when the governor grows old or ill: the crown offers it to you first.",
    ch: "chair",
  },
  petition: {
    name: "A petition for recall",
    what: "A petition to the crown, got up over months, asking it to recall the governor.",
    good: "Granted, the chair falls empty. Thrown out, he's your enemy for ten years.",
    raise:
      "His misrule (unrest, towns lost, grievances), the crown's cooling on him, your favour at home, councillors' and members' names, and friends at court make it land.",
    ch: "chair",
  },
  address: {
    name: "The house's address",
    what: "The house's resolution against the governor, moved by the speaker: his salary withheld, supply refused, or both, for a year.",
    good: "It hurts him (and refusing supply hurts the colony too); the crown hears of it, and he may give way, dissolve the house, or hold out.",
    raise:
      "Move it from the speaker's chair (Society › Standing). The country party leans for it; high taxes, unrest and vetoes bring the rest.",
    ch: "chair",
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
  // POLLS (r16): Canvass.ts, Standing.ts
  canvass: {
    name: "The canvass",
    what: "Your standing at a poll as it moves, week by week, against the strongest rival (for the house, the challenger put up in your county).",
    good: "The highest standing at the count wins (each side has a little luck, ±4). Society › Office shows it while you stand, with your chance at the count and what moved it this week.",
    raise:
      "Canvass at the tavern or the market, stand a round, print a broadside, treat the voters, win the county's regard, buy the sheriff's goodwill or a great man's interest. Canvassing and treating fade unless they're kept up.",
    ch: "polls",
  },
  treating: {
    name: "Treating",
    what: "Punch at the hustings and dinners for the freeholders, at your charge.",
    good: "Counts at the poll (up to 8, each treat for less than the one before); it fades 1 in 20 a week.",
    raise:
      "Society › Office, the canvass: Treat the voters, once a week in the county (3 to 9 coins by the county's size).",
    ch: "polls",
  },
  govfriends: {
    name: "The governor's friends",
    what: "The governor's party at the polls.",
    good: "They work for a court-party man the governor thinks well of (+6), and against a member of the country party or anyone he dislikes (−8).",
    raise:
      "Be received at court and keep the governor's good opinion; or win without them, with a patron and the sheriff.",
    ch: "polls",
  },
  interest: {
    name: "A great man's interest",
    what: "A councillor's or a grandee's word to his tenants and friends at a poll.",
    good: "+8 at the poll (+4 for a patron of your own in the colony). Many of the computer's candidates have one.",
    raise:
      "Society › Office, the canvass: buy a great man's interest, if he thinks well enough of you (10). His price is on the button.",
    ch: "polls",
  },
  delivered: {
    name: "Delivered",
    what: "Something to show for a year in a seat: a bill of yours made law, a work or a market day, bread for the poor, the militia mustered, a power or a measure carried, a governor's law or work.",
    good: "A year in the same seat with something delivered and your favour holds; with nothing, it slips (4, then 6, 8, 10 a year).",
    raise:
      "Use your office's powers and levers, and bring in bills and measures.",
    ch: "polls",
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
  // CHAMBER (r16): Factions.ts, Session.ts, Docket.ts
  faction: {
    name: "Faction",
    what: "A party (the governor's friends, or the house's men) or an interest (the merchants, the landed men, the backcountry, the church) in a colony's politics.",
    good: "It remembers how you vote in council and where you stand at the session, and its members think the better or the worse of you for it (at most 10 either way). Its councillors lean toward the measures of someone it likes.",
    raise:
      "Vote and speak for what it wants. Society › Council shows each, what it thinks of you and why. It fades by a fifth each January.",
    ch: "chamber",
  },
  session: {
    name: "The session",
    what: "The assembly's yearly sitting on its great question: 1 April, dividing a month later.",
    good: "What the house carries is done (supply voted or refused, bills of credit, roads, a salary settled or withheld). Your speech pulls over the members who lean only a little the other way; the factions remember where you stood.",
    raise:
      "Sit in the house or on the council. A scene asks where you stand; the odds of your speech are on its buttons.",
    ch: "chamber",
  },
  docket: {
    name: "The docket",
    what: "The council's business: war and peace, the crown's demands, boundaries, the counties' petitions, a scandal in the treasury, and more.",
    good: "No kind of business comes before the council twice in a year, whoever brings it.",
    raise:
      "The governor, a county or the councillor whose business it is brings it; a councillor's own measures wait their turn.",
    ch: "chamber",
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
  // ECON (r17): LoanCore.ts, Loans.ts, Leave.ts, Company.ts
  bond: {
    name: "Bonds",
    what: "Money lent or borrowed on terms: the sum, its day, and interest at the lawful rate of the place (6 in 100 a year in most English colonies; 5 in Virginia from 1748, in France's and Spain's colonies; none among the native nations).",
    good: "Money lent earns its interest at every month's turn. On its day the lender may call it in, or let it run on; the borrower may repay sooner, half or all.",
    raise:
      "Anyone's card: Money between you. Called in and unpaid, the lender gives more time, forgives it, takes goods in kind, or sues at the court-house.",
    ch: "econ",
  },
  lawful: {
    name: "The lawful rate",
    what: "The most interest the law against usury allows where a bond is made, by the colony and the year.",
    good: "Every bond in the game is at the lawful rate, or at none (a friend's loan).",
    raise: "The guide's chapter has the laws, colony by colony.",
    ch: "econ",
  },
  leave: {
    name: "Leave",
    what: "Days away from your post your master has agreed to.",
    good: "On leave you aren't counted as away, so your place is kept. You're paid nothing (an officer is on half pay). Be back by its last day: overstay it a week and a letter comes, three and your place is gone.",
    raise:
      "Work › Your work › Ask for leave, or Ask for leave first on the travel choices. Your master decides by what they think of you, your place, how long, and the work.",
    ch: "econ",
  },
  returncargo: {
    name: "Return cargo",
    what: "Goods a trading company buys where its cargo is sold, and brings home.",
    good: "The ship comes home laden, not in ballast, at a lower freight; its own odds are shown beside the outward leg's.",
    raise: "A company's plan: Home with.",
    ch: "econ",
  },
  drill: {
    name: "Drill and spirits",
    what: "How trained your company is, and how glad they are to be in it.",
    good: "Both make the company count for more in a fight. A month unpaid, a quarter of the men desert and spirits fall; three months and the company is gone.",
    raise:
      "Time in quarters drills them (officers among your people speed it); every month's pay lifts their spirits.",
    ch: "followers",
  },
  // ---- TOWNS (r17): engine/WorksCore.ts, Works.ts, Newcomers.ts
  townbody: {
    name: "The town's body",
    what: "Whoever sits on a town's public business: the county court or the vestry (Virginia and Maryland), the town meeting (New England), the cabildo (a Spanish town), the habitants' assembly (a French one), the council fire (a native town). Its members are the county's office holders, and enough of the town's chief householders to make it up.",
    good: "It votes the town's public works: a wharf, a church or meeting house, a market house, a fort, a schoolhouse, a road and bridge, a warehouse, a lighthouse, a court-house; in a native town a landing, a palisade, a council house, a cleared trail. It repairs what was ruined for half the cost.",
    raise:
      "Hold a county office (Society › Office) and you sit on it: you propose works and vote. Anyone else of the town petitions it (Society › Town).",
    ch: "towns",
  },
  levy: {
    name: "The levy",
    what: "What a town raises from its own people toward a work it has voted: a county levy, a town rate, a derrama, the town's own labour. Up to half the work's cost, as the town can bear it.",
    good: "Pays part of a work without anyone's purse. The rest is the subscription.",
    raise:
      "It makes the town a little more restless for a year (1 to 5 unrest, by the levy on each hundred of its people). A subscription not filled in six months is made up by a second levy.",
    ch: "towns",
  },
  subscription: {
    name: "The subscription",
    what: "What the town's people of means, and any player, pay toward a work the town has voted, on top of the levy.",
    good: "When it's subscribed in full the work begins. Members who voted for it put down a quarter of their means, others a little; the mover's pledge counts in it.",
    raise:
      "Subscribe on Society › Town (the sum is on the button). The members think the better of you for it, and it brings a little renown.",
    ch: "towns",
  },
  newcomers: {
    name: "Newcomers",
    what: "Families, single men and women, widows, servants, tradesmen and now and then a person of note, come to a town by ship or down the road as it grows; in a native town, kin from the nation's other towns.",
    good: "A town's people grow with it, so there's someone to marry, to hire, to befriend. A newcomer isn't married off by the town's own for a year.",
    raise:
      "They come in proportion to the settlers who arrive, and to keep a town filled to what its size holds. A town with nobody of a sex free to marry for a year or two draws someone.",
    ch: "towns",
  },
  ruins: {
    name: "Ruins",
    what: "What stood in a town and was burned when it was taken, or left to rot when its settlers fled: a wharf, a church, a fort, a court-house, a work of the town's own.",
    good: "A ruin can be repaired by the town's vote for half the cost of building new, and in three fifths of the time.",
    raise:
      "Propose the repair (or petition for it) on Society › Town. If nobody does, the town's own members bring it in a year or so.",
    ch: "towns",
  },
  // ---- LIFE (r21)
  strain: {
    name: "Strain",
    what: `How much worse stress makes a hurt: at ease (under ${STRESS_TIERS[1].from}) a wound takes what it says; ${STRESS_TIERS.slice(
      1,
    )
      .map((t) => `${t.name.toLowerCase()} (${t.from}) ×${t.mult}`)
      .join(", ")}.`,
    good: "Low stress keeps wounds, fevers and the month's wear from costing more than they should.",
    raise: "Ease your stress: rest, prayer, family, a chaplain, a quiet month.",
    ch: "health",
  },
  post: {
    name: "A post",
    what: "A position in your household for one of your people: clerk of your accounts, secretary, steward, bodyguard, physician, tutor to your children, scout, chaplain. One to a post.",
    good: "What they do for you goes by their own skill in it (shown on the picker); someone with no post does only what they're sent to.",
    raise:
      "People › Your people: the picker under each. Each post pays a little over their wages.",
    ch: "followers",
  },
  todeath: {
    name: "To the death",
    what: "A duel with no first blood, no shots into the air and no yielding: the one who goes down dies.",
    good: "Settles a quarrel for good, and a win is one of the great moments of a life.",
    raise:
      "Challenge to the death from their card (they may not take your terms), or be called out by a sworn enemy. Losing, you may run, and be called a coward for three years.",
    ch: "duels",
  },
  coward: {
    name: "Called a coward",
    what: "You ran from a duel to the death. For three years everyone thinks 12 the worse of you (the brave and the soldiers 20).",
    good: "You're alive.",
    raise: "It fades with time; nothing else mends it.",
    ch: "duels",
  },
  bawdy: {
    name: "The bawdy house",
    what: "A house by the water in a great port or a capital: punch and cards in the parlour, company upstairs (only grown, free people; the door closes).",
    good: "Eases stress (5 in the parlour, 12 upstairs).",
    raise:
      "Spend an evening there once a fortnight. People may see you (the minister, a scandal if you're married, your husband or wife), and upstairs there's the French pox.",
    ch: "bawdy",
  },
  pox: {
    name: "The French pox",
    what: "Caught at the bawdy house: the most your health can be is 10 less, for good.",
    good: "Nothing.",
    raise:
      "Mercury from the apothecary eases the worst of it. It doesn't leave.",
    ch: "bawdy",
  },
  // ---- end LIFE (r21)
  // ---- SHIPS (r21): ShipsData.ts, Hiring.ts, Parties.ts
  shipcompany: {
    name: "Her company by name",
    what: "The people taken on into your ship by name (a computer's seaman, or another player), each with a role (hand, bosun, surgeon, navigator, mate, captain) and the pay you set.",
    good: "Her captain commands her and her takings ride on his seamanship; a bosun saves her wear, a navigator quickens her passages and makes them safer, a surgeon saves her men, a mate commands when there's no captain. With a captain or mate she takes charters and sails without you.",
    raise:
      "On her card (Estate › Boats), at the port where she lies: people looking for a berth at the quay, the town's seamen, or an offer to another player. Promote, demote or change anyone's pay whenever you like.",
    ch: "ships",
  },
  shiprep: {
    name: "Her name",
    what: "A ship's name on the waterfront, from 0 to 100 (50 when nobody knows her yet).",
    good: "A good name pays more on her charters (up to 1.15×) and makes seamen readier to sign.",
    raise:
      "Charters delivered in time raise it; late, given up, forfeit or seized lower it, and so does a crew that deserts unpaid.",
    ch: "ships",
  },
  layover: {
    name: "Lying over",
    what: "A ship stopped at a port on the way, by her commander's choice, for as long as he likes.",
    good: "Within two months of coming in, the voyage goes on to where she was going, her charter and everyone aboard with her.",
    raise:
      "On the road (Here): Lie over at the next port; then Sail on. After two months the voyage is over, and a charter's forfeit.",
    ch: "ships",
  },
  party: {
    name: "Travelling together",
    what: "Players who've agreed to go where one of them goes.",
    good: "When the leader sets out from where you both are, you go too: in their own boat for nothing, on a passage or the road paying your way. Get off at any stop on the way.",
    raise:
      "Here, under In town: ask to travel with a player, or ask them along. They're asked, and may agree.",
    ch: "ships",
  },
};

/** A term's explanation, as a tooltip. */
export function termTip(key: string, extra?: () => string[]): TipContent {
  const t = TERMS[key];
  if (!t) return { title: key };
  return {
    title: t.name,
    // POLLS (r16): a number may add what's true of it now (renown's curve).
    notes: [
      t.what,
      `What it's for: ${t.good}`,
      `How: ${t.raise}`,
      ...(extra?.() ?? []),
    ],
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
  extra?: () => string[], // POLLS (r16): what's true of this number now
): TemplateResult {
  return num(
    label ?? TERMS[key]?.name ?? key,
    () => termTip(key, extra),
    `cq-term ${cls}`,
  );
}

/** "?" beside a heading: a tooltip for the word, for headings that are words. */
export function termMark(key: string): TemplateResult {
  return html`${num("?", () => termTip(key), "cq-term-mark")}`;
}
