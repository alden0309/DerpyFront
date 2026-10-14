// EVENTS (r21): more matters at work for the town's trades, so a trade's
// matters aren't the same three or four. Six more to each: tasks and
// troubles, colleagues and masters, and some that come only on the higher
// rungs (a foreman's decisions, a master's) or the lowest (an apprentice's
// lot). Written like the others (MatterKit.ts): coins by the rung's wage,
// "{boss}" your master (or the foreman), "{here}" the town.

import {
  all,
  C,
  employed,
  harvestHere,
  M,
  months,
  north,
  port,
  rankAtLeast,
  since,
  type Variant,
  winterHere,
} from "./MatterKit";

/** On the lowest rungs (an apprentice, a hand). */
export const rankBelow =
  (r: number) =>
  (_g: unknown, life: { job: { rank: number } | null }): boolean =>
    (life.job?.rank ?? 0) < r;

export const TOWN_MATTERS_R21: Variant[] = [
  // ------------------------------------------------ the farmer
  M(
    "farmer",
    "task",
    "seed-wheat",
    "Seed wheat from the Palatines",
    "A German family down the road swear by a red wheat they brought from the Rhine: heavier in the ear, they say, and proof against the rust. They'd part with two bushels for a share of your crop.",
    [
      C(
        "Sow a field of it",
        { check: { skill: "farming" } },
        {
          pay: 1,
          xp: 12,
          say: "It stood up to the rust and filled the barn. The neighbours are asking you for seed now.",
        },
        {
          pay: -0.3,
          say: "It came up thin in your clay. The Palatines were very sorry.",
        },
      ),
      C(
        "Try a row or two",
        {},
        {
          pay: 0.2,
          xp: 5,
          say: "A row or two, and a fair showing. Next year, perhaps a field.",
        },
      ),
      C(
        "Stick to what you know",
        {},
        { say: "Your father's wheat did for him." },
      ),
    ],
  ),
  M(
    "farmer",
    "trouble",
    "fly-in-wheat",
    "The fly in the wheat",
    "Little grey flies over the wheat at dusk, and the stalks folding over where the maggots have eaten them through. Half the county has it.",
    [
      C(
        "Burn the stubble and sow late",
        { check: { skill: "farming", dc: 1 } },
        {
          pay: 0.4,
          xp: 12,
          say: "Late sowing missed the fly. A thin year, but a year.",
        },
        {
          pay: -0.6,
          stress: 4,
          say: "The fly came anyway, late as you were.",
        },
      ),
      C(
        "Turn the field over to corn",
        {},
        { pay: -0.2, say: "Corn the fly doesn't fancy. Less money, no ruin." },
      ),
      C(
        "Pray over it",
        { odds: 0.35 },
        { say: "A cold snap killed the fly. The minister takes the credit." },
        { pay: -0.7, stress: 5, say: "The fly had the wheat." },
      ),
    ],
    { when: months(4, 7) },
  ),
  M(
    "farmer",
    "task",
    "frolic",
    "A husking frolic",
    "The corn's in the barn and wants husking, and the custom is a frolic: the young people of the parish, cider, a fiddle, and whoever finds a red ear kisses whom they please.",
    [
      C(
        "Throw the frolic",
        { cost: 2 },
        {
          renown: 1,
          stress: -6,
          pay: 0.3,
          say: "Every ear husked by midnight, and two engagements by morning.",
        },
      ),
      C(
        "Husk it yourselves",
        {},
        { xp: 5, stress: 3, say: "Two weeks of evenings, and sore thumbs." },
      ),
    ],
    { when: months(9, 10) },
  ),
  M(
    "farmer",
    "trouble",
    "plough-ox-lame",
    "The ox is lame",
    "Your near ox came back from the field holding up a foreleg, and the ploughing's only half done. {boss} wants to know when the north field will be in.",
    [
      C(
        "Doctor the hoof yourself",
        { check: { skill: "medicine" } },
        {
          xp: 10,
          boss: 3,
          say: "A stone, deep in the cleft. Out with a knife, a poultice, and he's back in the yoke in a week.",
        },
        {
          pay: -0.4,
          say: "You made it worse. The farrier made it better, and charged for both.",
        },
      ),
      C(
        "Borrow a neighbour's team",
        {},
        {
          pay: -0.2,
          say: "Borrowed oxen, and a day of your work on his fields in return.",
        },
      ),
      C(
        "Plough with the one ox and a horse",
        { odds: 0.5 },
        { xp: 6, say: "A crooked furrow, but a furrow." },
        {
          health: -6,
          say: "The horse and the ox disagreed, with you between them.",
        },
      ),
    ],
    { when: months(2, 5) },
  ),
  M(
    "farmer",
    "task",
    "market-day-ride",
    "Butter and eggs for the market",
    "Market day in {here}, and the dairy's full: butter in crocks, eggs in straw, a cheese that has turned out very well. The question is who sells it and at what price.",
    [
      C(
        "Sell it yourself, and haggle",
        { check: { skill: "trade" } },
        {
          pay: 0.5,
          xp: 10,
          say: "The cheese went to a sea captain's cook for a price you'll boast of.",
        },
        {
          pay: 0.1,
          say: "The butter went soft in the sun while you argued.",
        },
      ),
      C(
        "Let the higgler take it all",
        {},
        { pay: 0.2, say: "The higgler paid low and saved you a day." },
      ),
    ],
  ),
  M(
    "farmer",
    "task",
    "hired-man",
    "A hired man for the season",
    "A big, quiet man walked up the lane asking for harvest work: food, a bed in the barn and a wage at the end. He has no letter from anyone.",
    [
      C(
        "Take him on",
        { odds: 0.75 },
        {
          pay: 0.6,
          say: "He worked like two men and left at Michaelmas with a handshake.",
        },
        {
          pay: -0.4,
          say: "He worked like two men for a week and left one night with the mare.",
        },
      ),
      C(
        "Ask about him first",
        { check: { skill: "persuasion" } },
        {
          pay: 0.5,
          xp: 6,
          say: "The minister knew of him: a widower from over the ridge. Worth his wage.",
        },
        { say: "Nobody knew him. You sent him on." },
      ),
      C(
        "Manage without",
        {},
        { stress: 4, say: "You managed. Your back says otherwise." },
      ),
    ],
    { when: harvestHere },
  ),

  // ------------------------------------------------ the mill hand
  M(
    "millhand",
    "task",
    "new-saw",
    "A Dutch saw-frame",
    "A millwright from New York offers to fit a gang of saws in one frame: three boards at a stroke instead of one. {boss} wants to know if it's worth the money.",
    [
      C(
        "Speak for it",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          boss: 5,
          xp: 10,
          say: "Three boards at a stroke. {boss} pretends it was his idea.",
        },
        {
          boss: -4,
          say: "It jammed on knots twice a day. {boss} remembers who spoke for it.",
        },
      ),
      C("Keep your counsel", {}, { say: "No saw-frame. No blame." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "millhand",
    "trouble",
    "logjam",
    "A jam above the dam",
    "The spring drive has jammed on the rocks above the dam: a hundred logs piled like spillikins, and the water rising behind them.",
    [
      C(
        "Go out and find the key log",
        { check: { skill: "woodcraft", dc: 1 } },
        {
          pay: 0.6,
          renown: 1,
          xp: 12,
          say: "One log pried loose, and the whole jam went with a roar. You were on the bank by then. Just.",
        },
        {
          health: -12,
          stress: 5,
          say: "The jam went while you were on it.",
        },
      ),
      C(
        "Wait for the water to lift it",
        { odds: 0.6 },
        {
          say: "The water came up and took the jam over the dam in the night.",
        },
        { pay: -0.3, say: "Three idle days, and a flooded meadow." },
      ),
    ],
    { when: months(2, 5) },
  ),
  M(
    "millhand",
    "trouble",
    "new-hand-hurt",
    "The new boy's hand",
    "The new boy put his hand where he shouldn't, and there's a great deal of blood and a great deal of noise, and everyone's looking at you.",
    [
      C(
        "Bind it, and send for the surgeon",
        { check: { skill: "medicine" } },
        {
          xp: 10,
          renown: 1,
          say: "He'll keep all his fingers. His mother brought you a pie.",
        },
        { stress: 4, say: "He'll keep three of them." },
      ),
      C(
        "Send him home and get back to work",
        {},
        { boss: 2, stress: 3, say: "The saw didn't stop. The men noticed." },
      ),
    ],
  ),
  M(
    "millhand",
    "task",
    "foreman-week",
    "The foreman's away",
    "The foreman has gone to his sister's wedding for a week and left the mill to whoever takes it in hand. Nobody has, yet.",
    [
      C(
        "Take it in hand",
        { check: { skill: "leadership" } },
        {
          pay: 0.4,
          boss: 5,
          xp: 12,
          say: "A week's boards cut, sorted and stacked. The foreman came back a little worried.",
        },
        { boss: -3, say: "Two quarrels and a broken pitman arm. A long week." },
      ),
      C("Mind your own saw", {}, { say: "A quiet week, for you." }),
    ],
    { when: rankBelow(2) },
  ),
  M(
    "millhand",
    "trouble",
    "ice-on-wheel",
    "Ice on the wheel",
    "The wheel froze in the night and stands like a great white cake, and a contract for planking is due in a fortnight.",
    [
      C(
        "Chip and steam it free",
        { check: { skill: "craft" } },
        {
          pay: 0.3,
          xp: 8,
          say: "Kettles of boiling water and two days with an axe. She turns.",
        },
        { health: -5, say: "You slipped on the ice you were chipping." },
      ),
      C(
        "Tell the buyer it'll be late",
        { check: { skill: "persuasion" } },
        { say: "He'd sooner have it late than not at all." },
        { pay: -0.4, say: "He went to another mill." },
      ),
    ],
    { when: winterHere },
  ),
  M(
    "millhand",
    "task",
    "masts-marked",
    "Trees with the broad arrow",
    "Three great white pines in the mill's woods are marked with the King's broad arrow: reserved for the navy's masts. They'd make a fortune in boards, and nobody comes this far to look.",
    [
      C(
        "Cut them, and saw them small",
        { odds: 0.7 },
        {
          pay: 1.5,
          say: "Boards too narrow to be masts, and nobody the wiser.",
        },
        {
          pay: -0.8,
          renown: -2,
          say: "The surveyor of the King's woods came after all.",
        },
      ),
      C(
        "Leave the King his trees",
        {},
        { say: "The pines will stand till the navy wants them." },
      ),
    ],
    { when: north },
  ),

  // ------------------------------------------------ the printer
  M(
    "newsman",
    "task",
    "almanac",
    "An almanac for next year",
    "The printer wants an almanac for next year: the tides, the eclipses, the courts, the roads, and something to make people buy it, a proverb on every page, or a prophecy.",
    [
      C(
        "Write the proverbs yourself",
        { check: { skill: "letters" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 12,
          say: '"A fat kitchen makes a lean will." They\'re quoting you in the tavern.',
        },
        { pay: 0.2, say: "It sold. Nobody quoted it." },
      ),
      C(
        "Copy last year's from Philadelphia",
        {},
        { pay: 0.3, say: "Nobody noticed. Nobody ever does." },
      ),
    ],
    { when: months(8, 10) },
  ),
  M(
    "newsman",
    "trouble",
    "apprentice-ink",
    "The devil and the ink",
    "The printer's devil has upset a whole pot of ink over a form of type that was ready for the press, and the paper goes out tomorrow.",
    [
      C(
        "Wash and reset it by candle",
        { check: { skill: "craft" } },
        {
          pay: 0.3,
          xp: 10,
          boss: 3,
          say: "Out on time, and only one wrong letter.",
        },
        { stress: 6, say: "Out a day late, and black to the elbow." },
      ),
      C(
        "Let the boy do it",
        { odds: 0.5 },
        { xp: 4, say: "He did it. He'll never upset a pot again." },
        { boss: -3, say: "He did it, upside down." },
      ),
    ],
  ),
  M(
    "newsman",
    "task",
    "ship-news",
    "News off the packet",
    "A packet is in, and the captain has London papers six weeks old. Whoever has them set first sells every copy in town.",
    [
      C(
        "Row out to her before she's in",
        { check: { skill: "seamanship" } },
        {
          pay: 0.6,
          renown: 1,
          xp: 8,
          say: "The papers were in your coat before she dropped anchor.",
        },
        { health: -4, say: "You got wet. The other printer got the papers." },
      ),
      C(
        "Wait on the wharf with the rest",
        {},
        { pay: 0.1, say: "Everyone had the same news." },
      ),
    ],
    { when: port },
  ),
  M(
    "newsman",
    "trouble",
    "subscribers",
    "Subscribers who don't pay",
    "Two hundred names on the subscription book, and half of them haven't paid in a year. The paper merchant wants his money.",
    [
      C(
        "Print their names",
        { odds: 0.6 },
        {
          pay: 0.6,
          say: "A list of defaulters in the corner. They paid within the week, swearing.",
        },
        { renown: -2, say: "They paid, and stopped taking the paper." },
      ),
      C(
        "Ride round and collect",
        { check: { skill: "persuasion" } },
        {
          pay: 0.5,
          xp: 8,
          say: "A week in the saddle and most of it paid, some in turnips.",
        },
        { stress: 4, say: "A week in the saddle and a sack of turnips." },
      ),
    ],
  ),
  M(
    "newsman",
    "task",
    "assembly-votes",
    "The votes of the assembly",
    "The assembly wants its journal printed, at the colony's price, by the colony's printer. {boss} wants to be the colony's printer.",
    [
      C(
        "Set it clean and quick",
        { check: { skill: "letters", dc: 1 } },
        {
          pay: 1,
          boss: 5,
          xp: 10,
          say: "Not a line wrong. The speaker himself complimented the type.",
        },
        { boss: -4, say: "A member's name misspelled, and he noticed." },
      ),
      C("Do it at the ordinary pace", {}, { pay: 0.4, say: "Done, and dull." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "newsman",
    "trouble",
    "anonymous-letter",
    "A letter signed 'Cato'",
    "A letter left under the door, signed 'Cato', calls the collector of customs a thief, with particulars. The particulars are interesting.",
    [
      C(
        "Print it",
        { odds: 0.55 },
        {
          pay: 0.6,
          renown: 2,
          say: "The town bought every copy, and the collector left for the islands.",
        },
        {
          pay: -0.5,
          stress: 8,
          say: "The collector sued. Cato did not come forward.",
        },
      ),
      C(
        "Ask Cato to sign his name",
        {},
        { say: "Cato declined to have a name. The letter went in the fire." },
      ),
    ],
  ),

  // ------------------------------------------------ the clerk
  M(
    "clerk",
    "task",
    "captain-protest",
    "A captain's protest",
    "A captain in from a hard passage wants a protest drawn and sworn before a notary: the storms, the jettison, the damage, so the owners can claim on the insurers. He tells it well. Some of it is true.",
    [
      C(
        "Draw it close and careful",
        { check: { skill: "letters" } },
        {
          pay: 0.5,
          xp: 10,
          say: "The underwriters paid. The captain bought you a dinner.",
        },
        { pay: 0.1, say: "The underwriters found the holes in it." },
      ),
      C(
        "Write what he says",
        {},
        { pay: 0.3, say: "His words, his oath, his business." },
      ),
    ],
    { when: port },
  ),
  M(
    "clerk",
    "trouble",
    "short-cargo",
    "Twelve casks short",
    "The bill of lading says a hundred casks of rum; the wharf counts eighty-eight. The master shrugs. {boss} wants someone to find out.",
    [
      C(
        "Count the hold yourself",
        { check: { skill: "stealth" } },
        {
          boss: 6,
          xp: 10,
          say: "Twelve casks under the cable tier, where the mate had a buyer waiting.",
        },
        { boss: -2, say: "You counted eighty-eight, twice." },
      ),
      C(
        "Write it off to leakage",
        {},
        { boss: -3, say: "Leakage. Twelve casks of it." },
      ),
    ],
    { when: port },
  ),
  M(
    "clerk",
    "task",
    "price-current",
    "The price current",
    "{boss} wants a price current drawn up for the correspondents in London and Bristol: what everything fetches in {here} this month, by Friday's ship.",
    [
      C(
        "Walk the wharves and ask",
        { check: { skill: "trade" } },
        {
          pay: 0.3,
          boss: 4,
          xp: 12,
          say: "Every price right to the farthing. London wrote back with orders.",
        },
        { boss: -2, say: "Molasses wrong by a shilling. Bristol noticed." },
      ),
      C(
        "Copy last month's",
        {},
        { boss: -2, say: "Prices had moved. So had {boss}'s temper." },
      ),
    ],
  ),
  M(
    "clerk",
    "trouble",
    "rival-clerk",
    "The other clerk",
    "The other clerk in the counting house has been taking your fair copies to {boss} as his own, and getting the praise for them.",
    [
      C(
        "Put your mark in the margin",
        { check: { skill: "stealth" } },
        {
          boss: 5,
          xp: 8,
          say: "{boss} found your mark. The other clerk found a new place.",
        },
        { stress: 5, say: "He found the mark first and scraped it out." },
      ),
      C(
        "Have it out with him",
        { check: { skill: "persuasion" } },
        { stress: -2, say: "He'll copy his own letters now." },
        { stress: 4, say: "He denied it, warmly, in front of {boss}." },
      ),
      C("Let it be", {}, { stress: 3, say: "There'll be other letters." }),
    ],
    { when: employed },
  ),
  M(
    "clerk",
    "task",
    "insurance-line",
    "A line on a ship",
    "A broker in the coffee house has a policy on a brig for Madeira with room for one more underwriter's line: take a share of the risk for a share of the premium.",
    [
      C(
        "Write a line",
        { odds: 0.85, tip: "Usually the brig comes home" },
        { pay: 0.6, xp: 6, say: "She came home. The premium is yours." },
        {
          pay: -1.2,
          stress: 6,
          say: "She was lost off the Azores. You pay your line.",
        },
      ),
      C("Not this one", {}, { say: "You watch others take the risk." }),
    ],
    { when: all(port, rankAtLeast(1)) },
  ),
  M(
    "clerk",
    "task",
    "factor-up-country",
    "A season up-country",
    "{boss} needs someone to go up the river for the season and sit in a store among the planters: buy their crop, sell them cloth and nails, and keep the books straight.",
    [
      C(
        "Go up the river",
        { check: { skill: "trade", dc: 1 } },
        {
          pay: 1.2,
          xp: 14,
          boss: 5,
          say: "A good season. The planters ask for you by name.",
        },
        { pay: 0.2, stress: 5, say: "A bad season, and a fever to end it." },
      ),
      C("Stay in town", {}, { say: "Somebody else went up the river." }),
    ],
    { when: rankBelow(2) },
  ),

  // ------------------------------------------------ the official
  M(
    "official",
    "task",
    "quitrents",
    "The quitrents",
    "Nobody has paid the King's quitrent on their land in the county for six years, and the receiver-general has asked for a list of who owes what.",
    [
      C(
        "Draw up the rent roll",
        { check: { skill: "letters" } },
        {
          pay: 0.6,
          boss: 5,
          xp: 12,
          say: "A rent roll that matched the deeds. The receiver-general was astonished.",
        },
        {
          boss: -3,
          say: "Half the deeds were missing. So is half the rent roll.",
        },
      ),
      C(
        "Ask the great planters to pay first",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 1,
          boss: 3,
          say: "They paid, with ill grace, and the small men followed.",
        },
        { renown: -1, say: "They laughed. The small men laughed too." },
      ),
    ],
  ),
  M(
    "official",
    "trouble",
    "missing-seal",
    "The minute book's gone",
    "The council's minute book for last year is missing from the secretary's office, and a man in the assembly is asking to see it.",
    [
      C(
        "Search the office",
        { check: { skill: "letters" } },
        {
          boss: 4,
          xp: 8,
          say: "Behind the press, where the secretary dropped it in March.",
        },
        { stress: 5, say: "Not behind the press. Not anywhere." },
      ),
      C(
        "Say it's been sent to London",
        { odds: 0.6 },
        { say: "Nobody can check a book in London." },
        { renown: -2, say: "It turned up in a tavern, and so did the truth." },
      ),
    ],
  ),
  M(
    "official",
    "task",
    "proclamation",
    "A proclamation to be read",
    "A proclamation from the governor must be read at every courthouse and church door in the county: a fast day, a reward for runaway sailors, and new prices for ferries.",
    [
      C(
        "Ride the county and read it yourself",
        { check: { skill: "leadership" } },
        {
          pay: 0.3,
          renown: 1,
          xp: 8,
          say: "A week in the saddle and your voice gone. Everyone knows your face now.",
        },
        { health: -4, say: "A week in the rain and a cold to end it." },
      ),
      C(
        "Send copies to the sheriffs",
        {},
        { pay: 0.1, say: "Read, or nailed up, or lost." },
      ),
    ],
  ),
  M(
    "official",
    "trouble",
    "clerk-fees",
    "Fees above the table",
    "The clerks under you have been taking a shilling over the lawful fee for every paper, and the freeholders are grumbling to their assemblymen.",
    [
      C(
        "Stop it, and make them pay back",
        { check: { skill: "leadership" } },
        {
          renown: 2,
          boss: 3,
          say: "The shillings went back. The clerks hate you. The freeholders don't.",
        },
        { stress: 5, say: "They stopped for a month." },
      ),
      C(
        "Take your cut",
        { odds: 0.7 },
        {
          pay: 0.8,
          say: "A shilling on a shilling. Nobody minds, until they do.",
        },
        {
          pay: -0.5,
          renown: -3,
          say: "An assemblyman made a speech about you.",
        },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "official",
    "task",
    "boundary-commission",
    "The boundary commissioners",
    "Commissioners from the next colony are coming to settle the line between you, with chains, maps and opinions. Someone must meet them, feed them, and keep them from the rum until noon.",
    [
      C(
        "Host them",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 2,
          boss: 5,
          xp: 10,
          say: "The line was run, the dinners eaten, and three miles of good land are still ours.",
        },
        {
          boss: -3,
          say: "They ran the line where they pleased, after dinner.",
        },
      ),
      C(
        "Leave it to the surveyors",
        {},
        { say: "The surveyors argued for a month." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "official",
    "task",
    "tavern-licences",
    "Tavern licences",
    "Every ordinary in the county wants its licence renewed, and the bench wants to know which of them keep good order. One of them is run by {boss}'s cousin.",
    [
      C(
        "Report them all as you find them",
        {},
        {
          renown: 1,
          boss: -3,
          say: "The cousin's licence lapsed. So did {boss}'s smile.",
        },
      ),
      C(
        "Look kindly on the cousin",
        {},
        { boss: 4, say: "The cousin keeps his licence, and his fiddler." },
      ),
    ],
    { when: employed },
  ),

  // ------------------------------------------------ the law
  M(
    "law",
    "task",
    "debtor-defence",
    "A debtor's defence",
    "A blacksmith owes a merchant thirty pounds and the merchant wants him in the debtors' prison, where he can earn nothing and pay nothing. The smith can pay you in horseshoes.",
    [
      C(
        "Plead for time to pay",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          xp: 10,
          say: "A year to pay. The smith shod your horse for life.",
        },
        { stress: 4, say: "The smith went to prison. You'll visit him." },
      ),
      C(
        "Decline the brief",
        {},
        { say: "Somebody else took it, or nobody did." },
      ),
    ],
  ),
  M(
    "law",
    "trouble",
    "opposing-counsel",
    "Opposing counsel",
    "The attorney against you has filed his pleadings late, and wrong, and the judge is a friend of his. You could object, and win on a point, or let it pass and win on the facts.",
    [
      C(
        "Object on the point",
        { check: { skill: "letters" } },
        { pay: 0.6, xp: 10, say: "Won on a demurrer. Not glorious, but won." },
        {
          stress: 4,
          say: "The judge allowed the amendment, and frowned at you.",
        },
      ),
      C(
        "Win on the facts",
        { check: { skill: "persuasion", dc: 1 } },
        {
          pay: 0.8,
          renown: 2,
          say: "A verdict the whole courthouse talked about.",
        },
        { pay: -0.2, say: "The jury liked the other man's facts better." },
      ),
    ],
  ),
  M(
    "law",
    "task",
    "court-week-crowd",
    "Court week",
    "Court week, and every inn is full: litigants, witnesses, horse traders, a puppet show. Twenty clients want twenty minutes each.",
    [
      C(
        "See them all",
        { check: { skill: "letters" } },
        {
          pay: 1,
          xp: 12,
          stress: 4,
          say: "Twenty clients, twenty fees, and no sleep.",
        },
        {
          pay: 0.4,
          stress: 8,
          say: "Twenty clients, and two of them mixed up.",
        },
      ),
      C(
        "Take the best five",
        {},
        { pay: 0.5, say: "Five good cases, and supper." },
      ),
    ],
  ),
  M(
    "law",
    "trouble",
    "client-lied",
    "A client lied",
    "Halfway through the trial your client's story has turned out to be a lie, and the other side has the letter that proves it.",
    [
      C(
        "Throw yourself on the court's mercy",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "Lost, but the judge thought you honest." },
        { renown: -2, say: "Lost, and laughed at." },
      ),
      C(
        "Attack the letter",
        { check: { skill: "letters", dc: 1 } },
        { pay: 0.8, say: "The letter was dated wrongly. Won, God help you." },
        {
          renown: -3,
          say: "The letter was right, and so was the judge about you.",
        },
      ),
    ],
  ),
  M(
    "law",
    "task",
    "apprentice-articles",
    "Articles for an apprentice",
    "A widow wants articles drawn binding her son to a cooper: seven years, his keep, his schooling, a suit of clothes at the end. The cooper wants the schooling left out.",
    [
      C(
        "Keep the schooling in",
        {},
        {
          renown: 1,
          pay: 0.2,
          say: "The boy will read. The cooper grumbled and signed.",
        },
      ),
      C(
        "Draw it as the cooper likes",
        {},
        { pay: 0.4, say: "The cooper paid better." },
      ),
    ],
  ),
  M(
    "law",
    "task",
    "kings-counsel",
    "For the crown",
    "The attorney-general is ill, and a case for the crown comes up at the assizes: a man accused of uttering forged bills. He's guilty, probably.",
    [
      C(
        "Prosecute it hard",
        { check: { skill: "letters", dc: 1 } },
        { renown: 2, boss: 5, say: "Convicted. The governor sent his thanks." },
        { boss: -3, say: "Acquitted. The jury didn't like you." },
      ),
      C(
        "Prosecute it fair",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "Convicted on the evidence, and nobody can say otherwise.",
        },
        { say: "Acquitted on the evidence. Fair is fair." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),

  // ------------------------------------------------ the craftsman
  M(
    "craftsman",
    "task",
    "journeyman-piece",
    "Your masterpiece",
    "The masters say it's time you made your piece: one thing, made alone, to show you're fit to be called master. A chest, a lock, a chair: your choice.",
    [
      C(
        "Make something ambitious",
        { check: { skill: "craft", dc: 1 } },
        {
          renown: 2,
          xp: 16,
          say: "A desk with a secret drawer. The masters argued over who'd buy it.",
        },
        { stress: 6, xp: 6, say: "Ambitious, and it shows where it failed." },
      ),
      C(
        "Make something sound",
        { check: { skill: "craft" } },
        { renown: 1, xp: 10, say: "A plain chest, perfectly made. Passed." },
        { xp: 4, say: "Sound, mostly. Another year." },
      ),
    ],
    { when: rankBelow(2) },
  ),
  M(
    "craftsman",
    "trouble",
    "tools-stolen",
    "Your tools are gone",
    "Somebody broke into the shop in the night and took your chest of tools: planes, chisels, saws, a lifetime's edges.",
    [
      C(
        "Ask at the pawnshops",
        { check: { skill: "stealth" } },
        {
          xp: 8,
          say: "Your planes in a pawnbroker's window, and the thief's name with them.",
        },
        {
          pay: -0.8,
          stress: 6,
          say: "Gone. New tools, and new blisters breaking them in.",
        },
      ),
      C(
        "Buy new and swear",
        {},
        {
          pay: -0.6,
          stress: 4,
          say: "New tools. They'll be old friends in a year.",
        },
      ),
    ],
  ),
  M(
    "craftsman",
    "task",
    "guild-feast",
    "The masters' feast",
    "The masters of the trade dine together once a year, and they've asked you to give the toast. Half of them can't stand the other half.",
    [
      C(
        "Give a toast that offends nobody",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          xp: 8,
          say: "To the trade, to the King, and to wood that doesn't warp. Cheers from both ends of the table.",
        },
        { renown: -1, say: "You offended both halves, impartially." },
      ),
      C(
        "Plead a sore throat",
        {},
        { say: "Somebody else gave the toast, badly." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "craftsman",
    "trouble",
    "customer-refuses",
    "He won't take it",
    "A merchant ordered a set of chairs, and now they're made he says the backs are too plain and he won't take them or pay.",
    [
      C(
        "Carve the backs, for a price",
        { check: { skill: "craft" } },
        { pay: 0.6, xp: 10, say: "Carved backs, and a carved price. He paid." },
        { pay: -0.2, say: "He liked the carving less than the plain." },
      ),
      C(
        "Take him to the justice",
        { check: { skill: "letters" } },
        { pay: 0.5, say: "The justice read the order and made him pay." },
        { pay: -0.3, say: "The justice was his brother-in-law." },
      ),
      C(
        "Sell them to someone else",
        {},
        { pay: 0.2, say: "Sold at a loss, to a tavern." },
      ),
    ],
  ),
  M(
    "craftsman",
    "task",
    "apprentice-taken",
    "A boy to teach",
    "A widow asks you to take her boy as apprentice: twelve, bright, clumsy, and hungry. She can pay nothing but his labour.",
    [
      C(
        "Take him",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          xp: 8,
          pay: 0.2,
          say: "He's clumsy, and learning. He'll be good.",
        },
        { stress: 5, say: "He breaks something every day." },
      ),
      C("Not now", {}, { say: "Another master took him." }),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "craftsman",
    "task",
    "export-order",
    "An order for the islands",
    "A Barbados planter wants furniture: mahogany, and lots of it, shipped in a month. The wood's here; the time isn't.",
    [
      C(
        "Hire hands and do it",
        { check: { skill: "leadership" } },
        {
          pay: 1.2,
          xp: 10,
          say: "Shipped on the day. The planter wants more.",
        },
        { pay: 0.2, stress: 6, say: "Shipped late and some of it badly." },
      ),
      C(
        "Do what you can alone",
        {},
        { pay: 0.4, say: "Half the order, and a polite letter." },
      ),
    ],
    { when: port },
  ),

  // ------------------------------------------------ the servant
  M(
    "servant",
    "task",
    "mistress-errand",
    "An errand to town",
    "The mistress sends you to town with a list and a purse: thread, tea, a letter to the post, and something from the apothecary she doesn't name aloud.",
    [
      C(
        "Do it well and quick",
        {},
        {
          boss: 4,
          say: "Everything bought, the change counted out. The mistress nodded, which is a lot from her.",
        },
      ),
      C(
        "Take the long way, and the afternoon",
        { odds: 0.7 },
        { stress: -6, say: "An afternoon in town, and nobody the wiser." },
        { boss: -5, say: "Somebody was the wiser." },
      ),
    ],
  ),
  M(
    "servant",
    "trouble",
    "broken-china",
    "The china",
    "A cup from the good china, the set that came from England in straw, is lying on the kitchen floor in three pieces. Nobody saw.",
    [
      C(
        "Own up",
        {},
        {
          boss: -2,
          stress: 2,
          say: "Two months added to your time. You told the truth, anyway.",
        },
      ),
      C(
        "Mend it with paste",
        { check: { skill: "craft" } },
        { xp: 6, say: "Mended so well the mistress drinks from it still." },
        { boss: -6, say: "It came apart in her hand at tea." },
      ),
      C(
        "Hide the pieces",
        { odds: 0.6 },
        { say: "The set is one cup short. Nobody counts." },
        { boss: -8, stress: 4, say: "Somebody counted." },
      ),
    ],
  ),
  M(
    "servant",
    "task",
    "harvest-help",
    "Harvest on the next place",
    "The neighbour is short-handed at harvest and offers your master a fee for your labour for a week, and you a shilling a day for yourself if you work hard.",
    [
      C(
        "Work like two men",
        { check: { skill: "farming" } },
        {
          pay: 0.5,
          xp: 8,
          say: "A shilling a day, every day. Your own money.",
        },
        { health: -4, say: "A shilling a day and a back like an old man's." },
      ),
      C(
        "Work like one",
        {},
        { pay: 0.2, say: "A few shillings. Better than none." },
      ),
    ],
    { when: harvestHere },
  ),
  M(
    "servant",
    "trouble",
    "fellow-sick",
    "A fellow servant's fever",
    "The girl who works beside you is burning with fever and the overseer says she's shamming. She can't stand.",
    [
      C(
        "Nurse her at night",
        { check: { skill: "medicine" } },
        {
          xp: 10,
          stress: 2,
          say: "She lived. She'd die for you now, she says.",
        },
        { stress: 6, say: "You did what you could. It wasn't enough." },
      ),
      C(
        "Speak to the mistress",
        { check: { skill: "persuasion" } },
        {
          boss: -1,
          say: "The mistress sent for the doctor, and the overseer won't forgive you.",
        },
        { boss: -3, say: "The mistress sided with the overseer." },
      ),
    ],
  ),
  M(
    "servant",
    "task",
    "freedom-dues",
    "What you'll have at the end",
    "A servant whose time is up is leaving with his freedom dues: a suit of clothes, a hoe, an axe, three barrels of corn. He says he got them only because he wrote it all down.",
    [
      C(
        "Learn your own indenture by heart",
        { check: { skill: "letters" } },
        {
          xp: 12,
          say: "You know your articles now, line by line. So does your master.",
        },
        { xp: 4, say: "The lawyer's words swim on the page." },
      ),
      C(
        "Trust to the master",
        {},
        { say: "He's a hard man, but an honest one. You hope." },
      ),
    ],
  ),
  M(
    "servant",
    "trouble",
    "runaway-hunt",
    "Sent after a runaway",
    "Another servant ran last night and the master wants you to go with the overseer and the dogs to bring him back.",
    [
      C(
        "Go, and lose the trail",
        { check: { skill: "woodcraft" } },
        { stress: -2, say: "The dogs went the wrong way. Somehow." },
        { boss: -4, say: "The overseer saw what you did." },
      ),
      C(
        "Go, and do as you're told",
        {},
        {
          boss: 3,
          stress: 6,
          say: "You brought him back. You don't sleep well.",
        },
      ),
      C("Refuse", {}, { boss: -6, say: "A month added to your time." }),
    ],
  ),

  // ------------------------------------------------ the minister
  M(
    "preacher",
    "task",
    "funeral-sermon",
    "A funeral sermon",
    "The richest man in the parish is dead, and his widow wants a funeral sermon to match: two hours, printed after. He was not a good man.",
    [
      C(
        "Preach his virtues",
        { check: { skill: "letters" } },
        {
          pay: 0.8,
          xp: 10,
          say: "You found three. Printed, with a black border.",
        },
        { renown: -1, say: "You found one, and dwelt on it." },
      ),
      C(
        "Preach on mortality",
        { check: { skill: "faith" } },
        {
          renown: 2,
          xp: 10,
          say: "Not a word of praise, and not a dry eye. The widow paid anyway.",
        },
        { pay: -0.2, say: "The widow noticed." },
      ),
    ],
  ),
  M(
    "preacher",
    "trouble",
    "glebe-tobacco",
    "The glebe and the salary",
    "Your salary is paid in tobacco, and this year's tobacco is the worst in the county: the vestry has picked out the trash for you.",
    [
      C(
        "Complain to the commissary",
        { check: { skill: "letters" } },
        {
          pay: 0.5,
          say: "The commissary wrote. The vestry paid in sweet-scented.",
        },
        {
          renown: -1,
          say: "The vestry remembers who wrote to the commissary.",
        },
      ),
      C(
        "Preach on the labourer and his hire",
        { check: { skill: "faith" } },
        {
          pay: 0.4,
          renown: 1,
          say: "Luke ten, verse seven. They took the point.",
        },
        { renown: -1, say: "They took offence." },
      ),
      C(
        "Accept it meekly",
        {},
        { stress: 4, say: "Trash tobacco, and trash wages." },
      ),
    ],
  ),
  M(
    "preacher",
    "task",
    "catechism",
    "Catechising the children",
    "The children of the parish are to be catechised in church before the congregation, and some of them couldn't tell you who made them.",
    [
      C(
        "Drill them for a month",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          xp: 8,
          say: "Every child word-perfect. Their mothers wept.",
        },
        { say: "One boy said the Lord's Prayer backwards, on purpose." },
      ),
      C(
        "Let them do their best",
        {},
        { say: "They did their best. It was mixed." },
      ),
    ],
  ),
  M(
    "preacher",
    "trouble",
    "parishioner-sin",
    "A parishioner's sin",
    "A churchwarden has been seen coming out of a widow's house at dawn, twice. The parish expects you to say something, and both of them expect you not to.",
    [
      C(
        "A word in private",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          xp: 8,
          say: "They were married at Easter. Nobody says a word now.",
        },
        { renown: -1, say: "The churchwarden stopped coming to church." },
      ),
      C(
        "Preach on it, without names",
        { check: { skill: "faith" } },
        {
          renown: 1,
          say: "Everyone knew who you meant. The churchwarden reformed.",
        },
        { renown: -2, say: "Everyone knew who you meant, and took sides." },
      ),
      C(
        "Say nothing",
        {},
        { stress: 3, say: "It isn't your business. The parish thinks it is." },
      ),
    ],
  ),
  M(
    "preacher",
    "task",
    "new-church",
    "A chapel of ease",
    "Families far up the creek want a chapel of their own, nearer than a day's ride: they'll build it if you'll preach in it once a month.",
    [
      C(
        "Ride up every month",
        { check: { skill: "leadership" } },
        {
          renown: 2,
          xp: 10,
          stress: 4,
          say: "A log chapel, a full one, and a long ride home every month.",
        },
        { health: -4, say: "A long ride in the rain, every month." },
      ),
      C(
        "Ask the bishop for a curate",
        {},
        { say: "The bishop is in London, and slow." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "preacher",
    "task",
    "sexton-bell",
    "The bell",
    "The bell rope has broken just before the Sunday service, and the bell is sixty feet up a ladder nobody trusts.",
    [
      C(
        "Climb it",
        { check: { skill: "craft" } },
        {
          renown: 1,
          xp: 6,
          say: "A new rope spliced in, and the bell rang on time.",
        },
        {
          health: -8,
          say: "The ladder was as untrustworthy as everybody said.",
        },
      ),
      C(
        "Ring a handbell at the door",
        {},
        { say: "Half the parish came anyway. The other half had an excuse." },
      ),
    ],
    { when: rankBelow(2) },
  ),

  // ------------------------------------------------ the physician
  M(
    "physician",
    "task",
    "smallpox-house",
    "A pest house",
    "Smallpox in the town, and the selectmen want a pest house out on the point where the sick can be nursed apart. Somebody must run it.",
    [
      C(
        "Run it",
        { check: { skill: "medicine", dc: 1 } },
        {
          renown: 3,
          xp: 14,
          pay: 0.5,
          say: "Fewer died than anyone feared. The town will not forget it.",
        },
        {
          health: -10,
          stress: 8,
          say: "Too many died, and you nearly with them.",
        },
      ),
      C(
        "Visit when called",
        {},
        { pay: 0.3, say: "You did your rounds. Others did the rest." },
      ),
    ],
    { when: since(1700) },
  ),
  M(
    "physician",
    "trouble",
    "quack-rival",
    "A rival's pills",
    "A man calling himself Doctor has set up across the street selling pills that cure everything from the gout to a broken heart, and your patients are buying them.",
    [
      C(
        "Expose him in the gazette",
        { check: { skill: "letters" } },
        {
          renown: 2,
          xp: 8,
          say: "His pills were chalk and aloes. He left for the next town.",
        },
        {
          renown: -1,
          say: "He wrote back, cleverly. Now everyone's laughing at both of you.",
        },
      ),
      C(
        "Let the pills speak for themselves",
        {},
        { pay: -0.3, say: "Slowly, they did." },
      ),
    ],
  ),
  M(
    "physician",
    "task",
    "dissection",
    "A lecture on anatomy",
    "A hanged man's body is offered for dissection, and the young men of the town would pay to watch you lecture over it. Half the town would riot if they knew.",
    [
      C(
        "Lecture, quietly, at night",
        { odds: 0.7, tip: "The knowledge is worth it, if nobody finds out" },
        { pay: 0.6, xp: 14, say: "Twelve students and a great deal learned." },
        { renown: -3, stress: 6, say: "Somebody talked. A mob at your door." },
      ),
      C("Decline", {}, { say: "The hanged man was buried at the crossroads." }),
    ],
  ),
  M(
    "physician",
    "trouble",
    "unpaid-bills",
    "Patients who don't pay",
    "Half your patients pay in promises, and the apothecary wants paying in coin for the physic.",
    [
      C(
        "Send round your bills",
        { check: { skill: "persuasion" } },
        { pay: 0.7, say: "Paid, mostly. One in hams." },
        { renown: -1, say: "Paid, some, and talked about, all." },
      ),
      C(
        "Forgive the poor ones",
        {},
        {
          renown: 2,
          pay: -0.2,
          say: "The poor bless you. The apothecary doesn't.",
        },
      ),
    ],
  ),
  M(
    "physician",
    "task",
    "inoculate-house",
    "Inoculation by the house",
    "A merchant wants his whole household inoculated against the smallpox at once, servants and all, in the country house away from town. It's legal this year. Mostly.",
    [
      C(
        "Do it",
        { check: { skill: "medicine" } },
        {
          pay: 1.2,
          renown: 1,
          xp: 12,
          say: "Fourteen inoculated, fourteen recovered.",
        },
        { renown: -2, stress: 6, say: "Thirteen recovered." },
      ),
      C(
        "Wait for the law to be clear",
        {},
        { say: "A colleague did it instead." },
      ),
    ],
    { when: since(1721) },
  ),
  M(
    "physician",
    "task",
    "teach-apprentice",
    "A young man to train",
    "A young gentleman wants to read physic under you before he goes to Edinburgh, and his father will pay handsomely for the privilege.",
    [
      C(
        "Take him",
        { check: { skill: "letters" } },
        {
          pay: 0.8,
          renown: 1,
          say: "He went to Edinburgh knowing more than his professors, he said.",
        },
        { pay: 0.4, say: "He fainted at the first blood." },
      ),
      C("Not yet", {}, { say: "He went to Edinburgh knowing nothing." }),
    ],
    { when: rankAtLeast(2) },
  ),

  // ------------------------------------------------ the innkeeper
  M(
    "innkeeper",
    "task",
    "stage-coach",
    "The stage stops here",
    "The new stage line wants a house to change horses and feed passengers twice a week, and has narrowed it to you and the Red Lion.",
    [
      C(
        "Win the contract",
        { check: { skill: "trade" } },
        {
          pay: 1,
          xp: 10,
          say: "The stage stops here. So does every passenger's purse.",
        },
        { say: "The Red Lion has it." },
      ),
      C(
        "Let the Red Lion have it",
        {},
        { say: "Peace and quiet, and less money." },
      ),
    ],
    { when: since(1720) },
  ),
  M(
    "innkeeper",
    "trouble",
    "drunk-magistrate",
    "The magistrate's reckoning",
    "A magistrate has run up a reckoning of four pounds over the winter and now says a man in his office shouldn't be asked to pay in public.",
    [
      C(
        "Ask in private",
        { check: { skill: "persuasion" } },
        { pay: 0.6, say: "Paid, in private, with a sigh." },
        { say: "He'll pay at Michaelmas. Which Michaelmas, he didn't say." },
      ),
      C(
        "Chalk it on the board for all to see",
        { odds: 0.5 },
        { pay: 0.8, renown: 1, say: "Paid by noon. The whole town laughed." },
        { pay: -0.4, stress: 5, say: "He had the licence looked at." },
      ),
    ],
  ),
  M(
    "innkeeper",
    "task",
    "turtle-feast",
    "A turtle feast",
    "A ship in from the islands has brought a live green turtle the size of a table, and the gentlemen of the town want a turtle feast.",
    [
      C(
        "Cook it yourself",
        { check: { skill: "craft" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 8,
          say: "Turtle soup, turtle fins, turtle in its own shell. They'll talk of it for a year.",
        },
        { stress: 4, say: "It was tough. It was expensive. It was eaten." },
      ),
      C(
        "Hire a cook from the island ship",
        { cost: 2 },
        { pay: 0.9, say: "The cook knew turtles. You know a profit." },
      ),
    ],
    { when: port },
  ),
  M(
    "innkeeper",
    "trouble",
    "bad-wine",
    "Vinegar in the cellar",
    "Half a pipe of Madeira has turned in the cellar, and the assembly dines here Thursday.",
    [
      C(
        "Blend it off with the good",
        { odds: 0.6 },
        { say: "Nobody noticed. Assemblymen rarely do." },
        { renown: -2, say: "A member noticed, loudly." },
      ),
      C(
        "Buy a new cask",
        { cost: 3 },
        { renown: 1, say: "Good wine, and a good name." },
      ),
      C(
        "Serve punch instead",
        {},
        { say: "Punch. Strong punch. Nobody remembered there'd been wine." },
      ),
    ],
  ),
  M(
    "innkeeper",
    "task",
    "club-room",
    "A club wants a room",
    "A club of gentlemen (they say they talk of natural philosophy; they mostly drink) want your long room every Tuesday.",
    [
      C(
        "Give them the room and a good table",
        {},
        {
          pay: 0.5,
          renown: 1,
          say: "Tuesdays are full now. Science is thirsty work.",
        },
      ),
      C(
        "Charge them dear",
        { odds: 0.6 },
        { pay: 0.8, say: "They paid, and grumbled." },
        { say: "They went to the Bell." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "innkeeper",
    "trouble",
    "tapster-steals",
    "The tapster's pockets",
    "The till is light every Saturday night, and the new tapster has a new coat.",
    [
      C(
        "Watch him",
        { check: { skill: "stealth" } },
        {
          pay: 0.3,
          xp: 8,
          say: "Caught with his hand in the drawer. He's working it off.",
        },
        { say: "He was too careful for you." },
      ),
      C(
        "Turn him off",
        {},
        { stress: 2, say: "A new tapster. The till's still light." },
      ),
    ],
  ),

  // ------------------------------------------------ the smith
  M(
    "blacksmith",
    "task",
    "wagon-tyres",
    "Tyres for the wagons",
    "Six wagons need iron tyres before the harvest, and shrinking a tyre on hot is a three-man job and a bucket of water.",
    [
      C(
        "Shrink them on yourself",
        { check: { skill: "craft" } },
        { pay: 0.7, xp: 12, say: "Six wheels, tight as drums." },
        { health: -6, say: "Five wheels, and a burn across your forearm." },
      ),
      C(
        "Bolt on straked ones",
        {},
        { pay: 0.3, say: "Old-fashioned, and done." },
      ),
    ],
  ),
  M(
    "blacksmith",
    "trouble",
    "gun-repair",
    "A gun to mend",
    "A frontier man wants his rifle's lock mended by morning and has been watching you work with a look you don't care for.",
    [
      C(
        "Mend it, quick and right",
        { check: { skill: "craft" } },
        {
          pay: 0.4,
          xp: 8,
          say: "The lock clicks like a clock. He paid and left without a word.",
        },
        {
          stress: 4,
          say: "It misfired once. He said nothing. That was worse.",
        },
      ),
      C(
        "Tell him to come back in two days",
        {},
        { say: "He came back in two days, pleasantly enough." },
      ),
    ],
  ),
  M(
    "blacksmith",
    "task",
    "iron-gate",
    "A gate for the great house",
    "The planter on the hill wants a wrought-iron gate like the ones in London, with his initials in a scroll. He has drawn it himself, badly.",
    [
      C(
        "Draw it better, and make it",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 1.2,
          renown: 2,
          xp: 14,
          say: "A gate people ride out of their way to see.",
        },
        {
          pay: 0.4,
          say: "His drawing, made exactly. It looks like his drawing.",
        },
      ),
      C("Make it as drawn", {}, { pay: 0.6, say: "It's what he asked for." }),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "blacksmith",
    "trouble",
    "striker-drunk",
    "The striker's drunk",
    "Your striker came in drunk and swung the sledge into the anvil's horn, and very nearly into you.",
    [
      C(
        "Send him home and swing it yourself",
        {},
        { health: -3, xp: 6, say: "Your arm aches. The work's done." },
      ),
      C(
        "Sober him up with the trough",
        { odds: 0.6 },
        { say: "One dousing, and he worked like a lamb." },
        { health: -6, say: "He took it badly." },
      ),
    ],
  ),
  M(
    "blacksmith",
    "task",
    "nails",
    "Nails for the town",
    "Nails are dear from England this year, and every builder in {here} wants them by the cask. A nail is nothing; ten thousand is a fortune.",
    [
      C(
        "Set the boys to making nails",
        { check: { skill: "leadership" } },
        { pay: 0.9, xp: 8, say: "Casks of nails, and casks of money." },
        { pay: 0.3, say: "Bent nails, and cross builders." },
      ),
      C(
        "Stick to horses",
        {},
        { say: "Horses don't need nails. Well, not those." },
      ),
    ],
  ),
  M(
    "blacksmith",
    "task",
    "learn-steel",
    "The secret of steel",
    "An old German smith passing through says he can show you how to make steel that takes an edge like a razor, for a fee and a week's board.",
    [
      C(
        "Pay him and learn",
        { cost: 3, check: { skill: "craft" } },
        { xp: 20, pay: 0.5, say: "Steel that sings. Worth every penny." },
        { xp: 6, say: "His secret was mostly beer." },
      ),
      C("Send him on", {}, { say: "He went on to Philadelphia." }),
    ],
  ),

  // ------------------------------------------------ the cooper
  M(
    "cooper",
    "task",
    "tight-casks",
    "Tight work for rum",
    "A distiller wants tight casks for rum (not the slack barrels for flour), and tight work takes skill and seasoned oak.",
    [
      C(
        "Make them tight",
        { check: { skill: "craft" } },
        { pay: 0.8, xp: 12, say: "Not a drop lost. The distiller's yours." },
        { pay: 0.2, say: "Two leaked. He sent them back." },
      ),
      C("Do slack work only", {}, { say: "Flour barrels don't argue." }),
    ],
  ),
  M(
    "cooper",
    "trouble",
    "oak-green",
    "Green staves",
    "The stave-maker sold you green oak as seasoned, and the casks are shrinking and gapping on the wharf.",
    [
      C(
        "Make him take them back",
        { check: { skill: "persuasion" } },
        { pay: 0.3, say: "Back they went, and his money with them." },
        { pay: -0.4, say: "He said they were dry when they left him." },
      ),
      C(
        "Swell them with water and sell them",
        { odds: 0.5 },
        { pay: 0.2, say: "They held, just." },
        { renown: -2, say: "They didn't hold." },
      ),
    ],
  ),
  M(
    "cooper",
    "task",
    "whale-oil-casks",
    "Casks for a whaler",
    "A whaling sloop sails in a week for the season and wants two hundred casks, knocked down to be set up at sea.",
    [
      C(
        "Work through the nights",
        { check: { skill: "craft" } },
        {
          pay: 1,
          xp: 12,
          stress: 4,
          say: "Two hundred casks, in shooks, on time.",
        },
        { stress: 8, say: "A hundred and sixty. They sailed short." },
      ),
      C(
        "Make what you can",
        {},
        { pay: 0.5, say: "A hundred. Another cooper made the rest." },
      ),
    ],
    { when: port },
  ),
  M(
    "cooper",
    "trouble",
    "gauger-dispute",
    "The gauger's rod",
    "The excise gauger says your casks hold more than they're marked, and wants to charge duty on the difference.",
    [
      C(
        "Gauge them with him",
        { check: { skill: "letters" } },
        { xp: 8, say: "His rod was bent. He'll get a new one." },
        { pay: -0.4, say: "Your casks were generous. So was the duty." },
      ),
      C("Pay and grumble", {}, { pay: -0.2, say: "Paid, and grumbled." }),
    ],
  ),
  M(
    "cooper",
    "task",
    "apprentice-bind",
    "Raising a cask",
    "The apprentice wants to raise a cask by himself for the first time, start to finish, and asks you to stand back.",
    [
      C(
        "Stand back and let him",
        { odds: 0.6 },
        {
          xp: 6,
          renown: 1,
          say: "Lopsided, but it holds water. He's prouder than a bishop.",
        },
        { stress: 3, say: "It sprang apart like a flower. He tried again." },
      ),
      C(
        "Show him again",
        {},
        { xp: 4, say: "He watched. He'll try next month." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "cooper",
    "trouble",
    "hoops-short",
    "No hoop iron",
    "There's no iron for hoops to be had in {here} this month; the ship that brought it was taken by privateers.",
    [
      C(
        "Use hickory hoops",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.3,
          xp: 8,
          say: "Split hickory, as the old coopers did. It'll serve.",
        },
        { pay: -0.2, say: "The hickory split the wrong way." },
      ),
      C("Wait for iron", {}, { pay: -0.4, say: "A month idle." }),
    ],
  ),

  // ------------------------------------------------ the tanner
  M(
    "tanner",
    "task",
    "saddle-leather",
    "Leather for a saddler",
    "A saddler from the capital wants the best curried leather you have, for gentlemen's saddles, and will pay for it if it's as good as you say.",
    [
      C(
        "Curry it fine",
        { check: { skill: "craft" } },
        { pay: 0.8, xp: 10, say: "Supple as a glove. He's ordered more." },
        { pay: 0.2, say: "Good, not fine. Paid accordingly." },
      ),
      C(
        "Sell him what's ready",
        {},
        { pay: 0.4, say: "He bought it, without enthusiasm." },
      ),
    ],
  ),
  M(
    "tanner",
    "trouble",
    "pit-collapse",
    "A pit gives way",
    "The side of a tan pit has caved in after the rains, and the hides are in the mud.",
    [
      C(
        "Shore it and save the hides",
        { check: { skill: "craft" } },
        {
          xp: 8,
          say: "Shored with planks, hides rinsed and back in the ooze. Saved.",
        },
        { pay: -0.5, health: -4, say: "The rest of the side came in on you." },
      ),
      C(
        "Dig a new pit",
        {},
        { pay: -0.3, say: "A new pit, and two weeks lost." },
      ),
    ],
  ),
  M(
    "tanner",
    "task",
    "deerskins",
    "Deerskins from the traders",
    "A trader has brought five hundred deerskins down from the back country, half-dressed in the Indian way, and wants them finished for the London market.",
    [
      C(
        "Finish them",
        { check: { skill: "trade" } },
        { pay: 1, xp: 10, say: "Finished and shipped. London paid well." },
        { pay: 0.3, say: "London paid poorly." },
      ),
      C(
        "Buy a few for your own trade",
        {},
        { pay: 0.3, say: "A few good skins." },
      ),
    ],
  ),
  M(
    "tanner",
    "trouble",
    "apprentice-quits",
    "The boy can't stand the smell",
    "Your new apprentice has been sick every morning for a month and says he'd sooner go to sea.",
    [
      C(
        "Talk him round",
        { check: { skill: "persuasion" } },
        { xp: 6, say: "He's stopped being sick. Mostly." },
        { say: "He went to sea." },
      ),
      C("Let him go", {}, { stress: 2, say: "He went to sea. Lucky boy." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "tanner",
    "task",
    "bookbinding",
    "Morocco for the books",
    "The printer wants red morocco for binding the laws of the colony, and nobody in {here} has made morocco before.",
    [
      C(
        "Try sumac and goat",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.8,
          renown: 1,
          xp: 14,
          say: "Red as a cardinal. The laws are bound in your leather.",
        },
        { xp: 6, say: "Brown, and blotchy. Practice." },
      ),
      C(
        "Tell him to send to London",
        {},
        { say: "The laws will wait for London." },
      ),
    ],
  ),
  M(
    "tanner",
    "trouble",
    "bark-mill",
    "The bark mill's horse",
    "The old horse that turns the bark mill has lain down in the traces and won't get up again.",
    [
      C(
        "Buy another horse",
        { cost: 3 },
        { say: "A new horse, who walks round and round as if born to it." },
      ),
      C(
        "Grind by hand",
        {},
        { health: -3, stress: 4, say: "Your arms are a horse now." },
      ),
    ],
  ),

  // ------------------------------------------------ the ropewalk
  M(
    "ropewalker",
    "task",
    "whale-line",
    "Whale line",
    "A whaling captain wants line that won't foul or part with a whale on the end of it: two hundred fathom, soft-laid, and tested.",
    [
      C(
        "Lay it yourself",
        { check: { skill: "craft" } },
        {
          pay: 0.8,
          xp: 12,
          say: "He tested it with six men pulling. It held. He paid.",
        },
        { pay: 0.2, say: "It held for five men." },
      ),
      C(
        "Sell him what's coiled",
        {},
        { pay: 0.3, say: "He bought it, and frowned." },
      ),
    ],
    { when: port },
  ),
  M(
    "ropewalker",
    "trouble",
    "tar-kettle",
    "The tar kettle",
    "The tar kettle has boiled over and caught, and the walk is four hundred yards of hemp.",
    [
      C(
        "Smother it",
        { check: { skill: "leadership" } },
        { renown: 1, xp: 8, say: "Sand and wet sacks. Out before it ran." },
        { health: -8, say: "Out, and your eyebrows with it." },
      ),
      C(
        "Run for the town's engine",
        { odds: 0.5 },
        { say: "The engine came in time." },
        { pay: -0.8, say: "The engine came for the ashes." },
      ),
    ],
  ),
  M(
    "ropewalker",
    "task",
    "spinner-race",
    "A spinning match",
    "The spinners at the rival walk say they can spin a yarn the length of the walk faster than anyone here. A wager's been laid.",
    [
      C(
        "Spin for the walk",
        { check: { skill: "craft" } },
        {
          pay: 0.3,
          renown: 1,
          xp: 6,
          say: "Won by a yard. Drinks on the rival walk.",
        },
        { pay: -0.2, say: "Lost by a yard. Drinks on you." },
      ),
      C("Hold the stakes", {}, { say: "You held the stakes and the peace." }),
    ],
  ),
  M(
    "ropewalker",
    "trouble",
    "foreign-hemp",
    "Russian or Carolina?",
    "The owners want to buy cheap Carolina hemp instead of Russian, and the men say Carolina rots.",
    [
      C(
        "Test a coil of each",
        { check: { skill: "trade" } },
        { boss: 4, xp: 10, say: "Carolina rots. The owners believe you now." },
        { say: "The test was inconclusive. So were the owners." },
      ),
      C(
        "Spin whatever's bought",
        {},
        { say: "You spin it. You don't sail on it." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "ropewalker",
    "task",
    "cordage-navy",
    "The navy's inspector",
    "A navy inspector is coming to see if the walk is fit to make cordage for His Majesty's ships. A contract with the navy is a fortune.",
    [
      C(
        "Show him round",
        { check: { skill: "persuasion" } },
        { pay: 1.2, boss: 6, say: "A navy contract. The owners are giddy." },
        { boss: -3, say: "He found the rotten coil in the corner." },
      ),
      C("Keep out of the way", {}, { say: "He came, he saw, he went." }),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "ropewalker",
    "trouble",
    "boy-hurt",
    "The wheel boy",
    "The boy who turns the wheel has had his hand caught in the hooks, and he's crying for his mother.",
    [
      C(
        "Free him gently",
        { check: { skill: "medicine" } },
        { xp: 6, say: "His hand will mend. He's back on the wheel." },
        { stress: 4, say: "His hand will mend, crooked." },
      ),
      C(
        "Stop the wheel and fetch his mother",
        {},
        { stress: 2, say: "The walk stood for an hour. Nobody minded." },
      ),
    ],
  ),

  // ------------------------------------------------ the carpenter
  M(
    "carpenter",
    "task",
    "fine-staircase",
    "A staircase that flies",
    "A merchant building a new house wants a staircase that turns in the air with no post under it, like one he saw in Bristol.",
    [
      C(
        "Build it",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 1.2,
          renown: 2,
          xp: 14,
          say: "It flies. Nobody can see what holds it up. Neither can the merchant.",
        },
        { pay: 0.3, stress: 4, say: "It needs a post." },
      ),
      C(
        "Build it with a post",
        {},
        { pay: 0.5, say: "A good stair. With a post." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "carpenter",
    "trouble",
    "rotten-sill",
    "A rotten sill",
    "Repairing a house, you've found the sill beams rotten through, and the owner wants the job done for the price he was quoted.",
    [
      C(
        "Show him and ask more",
        { check: { skill: "persuasion" } },
        { pay: 0.6, say: "He saw the rot, and paid." },
        { pay: 0.1, say: "He paid the old price, and you replaced the sill." },
      ),
      C(
        "Patch it and say nothing",
        { odds: 0.6 },
        { pay: 0.4, say: "It'll last. Long enough." },
        { renown: -2, say: "It didn't last." },
      ),
    ],
  ),
  M(
    "carpenter",
    "task",
    "fort-blockhouse",
    "A blockhouse on the frontier",
    "The governor wants a blockhouse built on the frontier before winter, by men who'll work with one eye on the woods.",
    [
      C(
        "Lead the work",
        { check: { skill: "leadership" } },
        {
          pay: 1.2,
          renown: 2,
          xp: 10,
          say: "Up before the snow, loopholed and roofed.",
        },
        { health: -6, stress: 6, say: "Up, late, and a man lost to an arrow." },
      ),
      C("Stay in town", {}, { say: "Somebody else built it." }),
    ],
  ),
  M(
    "carpenter",
    "trouble",
    "timber-wrong",
    "The wrong timber",
    "The sawmill has delivered pine where you ordered oak, and the frame goes up Monday.",
    [
      C("Send it back and wait", {}, { pay: -0.3, say: "Oak, a week late." }),
      C(
        "Use it where it won't show",
        { check: { skill: "craft" } },
        { pay: 0.2, xp: 6, say: "Pine in the rafters, oak where it matters." },
        { renown: -1, say: "It showed." },
      ),
    ],
  ),
  M(
    "carpenter",
    "task",
    "pulpit",
    "A pulpit with a sounding board",
    "The church wants a new pulpit with a sounding board over it, carved, and the minister wants it higher than the governor's pew.",
    [
      C(
        "Carve it",
        { check: { skill: "craft" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 12,
          say: "His voice carries to the gallery now. The governor's pew is in its shadow.",
        },
        { pay: 0.3, say: "It echoes, oddly." },
      ),
      C("Build it plain", {}, { pay: 0.4, say: "Plain and sound." }),
    ],
  ),
  M(
    "carpenter",
    "trouble",
    "fall-scaffold",
    "The scaffold",
    "A man on the scaffold says the ledger's loose, and he's right, and there are four men on it.",
    [
      C(
        "Get them down and fix it",
        {},
        { pay: -0.1, renown: 1, say: "An hour lost. Four men alive." },
      ),
      C(
        "Wedge it and carry on",
        { odds: 0.7 },
        { say: "It held." },
        { health: -10, stress: 8, say: "It didn't hold." },
      ),
    ],
  ),

  // ------------------------------------------------ the miller
  M(
    "miller",
    "task",
    "bolting-cloth",
    "A bolting cloth from Holland",
    "A Dutch bolting cloth would give you flour as white as any in Philadelphia, and white flour fetches double in the islands.",
    [
      C(
        "Buy one",
        { cost: 4 },
        { pay: 1, xp: 8, say: "White flour. The island ships ask for yours." },
      ),
      C("Keep the old sieve", {}, { say: "Brown flour, brown prices." }),
    ],
  ),
  M(
    "miller",
    "trouble",
    "dam-breached",
    "The dam's leaking",
    "Muskrats have tunnelled the mill dam, and the pond is going down a hand's breadth a day.",
    [
      C(
        "Puddle the dam with clay",
        { check: { skill: "craft" } },
        { xp: 8, say: "Clay, straw and stamping feet. Tight." },
        { pay: -0.4, say: "It went in the next flood anyway." },
      ),
      C(
        "Trap the muskrats",
        { check: { skill: "woodcraft" } },
        { pay: 0.1, say: "Muskrat pelts and a sound dam." },
        { say: "The muskrats were cleverer." },
      ),
    ],
  ),
  M(
    "miller",
    "task",
    "toll-honest",
    "The toll dish",
    "The custom is a toll of one-sixth for grinding, and a new miller across the river takes one-eighth, and says so.",
    [
      C(
        "Match him",
        {},
        { pay: -0.2, renown: 1, say: "One-eighth. Your customers came back." },
      ),
      C(
        "Grind finer and keep your toll",
        { check: { skill: "craft" } },
        { pay: 0.3, xp: 8, say: "Your flour's better. They'll pay the sixth." },
        { pay: -0.4, say: "They went across the river." },
      ),
    ],
  ),
  M(
    "miller",
    "trouble",
    "eels-in-race",
    "Eels in the race",
    "The race is choked with eels running to the sea, a writhing silver mass, and the wheel's slowing.",
    [
      C(
        "Set eel pots",
        {},
        {
          pay: 0.3,
          say: "A barrel of eels, smoked and sold. The wheel turns.",
        },
      ),
      C(
        "Clear them with a rake",
        {},
        { stress: 3, say: "Slimy, endless, done." },
      ),
    ],
    { when: months(8, 10) },
  ),
  M(
    "miller",
    "task",
    "army-flour",
    "Flour for the army",
    "The army's commissary wants a hundred barrels of flour at a fixed price, paid in bills of credit that may or may not be worth their face.",
    [
      C(
        "Take the bills",
        { odds: 0.6 },
        { pay: 1.4, say: "The bills held their value. A fine year." },
        { pay: 0.2, stress: 5, say: "The bills fell to half." },
      ),
      C(
        "Ask for hard money",
        { check: { skill: "trade" } },
        { pay: 0.8, say: "Hard money, at a lower price." },
        { say: "They went to another mill." },
      ),
    ],
  ),
  M(
    "miller",
    "task",
    "dress-stones",
    "Dressing the stones",
    "The millstones want dressing: every furrow recut with a pick, a week's work on your knees.",
    [
      C(
        "Dress them yourself",
        { check: { skill: "craft" } },
        { pay: 0.3, xp: 12, say: "Sharp as new. The flour's finer." },
        { health: -4, say: "Steel in your eye, and a crooked furrow." },
      ),
      C(
        "Hire a travelling dresser",
        { cost: 2 },
        { pay: 0.2, say: "He did it in three days, singing." },
      ),
    ],
  ),

  // ------------------------------------------------ the brewer
  M(
    "brewer",
    "task",
    "porter",
    "London porter",
    "Everyone with money drinks London porter, brought over at great expense. You could brew it here, if you had the knack of it.",
    [
      C(
        "Try a porter",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 1,
          renown: 1,
          xp: 14,
          say: "Dark, strong, and cheaper than London's. The taverns want it.",
        },
        { xp: 6, say: "Dark, strong, and undrinkable." },
      ),
      C("Stick to small beer", {}, { say: "Small beer, small money." }),
    ],
  ),
  M(
    "brewer",
    "trouble",
    "hops-dear",
    "Hops gone dear",
    "The hop harvest in England failed, and the hops from London cost twice what they did.",
    [
      C(
        "Brew with spruce and molasses",
        { check: { skill: "craft" } },
        { pay: 0.2, xp: 8, say: "Spruce beer. The sailors love it." },
        { pay: -0.3, say: "Spruce beer. Nobody loves it." },
      ),
      C("Pay for the hops", {}, { pay: -0.4, say: "Dear hops, good beer." }),
    ],
  ),
  M(
    "brewer",
    "task",
    "militia-day",
    "Training day",
    "The militia trains on the common Saturday, and every man of it will be thirsty by noon.",
    [
      C(
        "Set up a booth",
        {},
        {
          pay: 0.6,
          say: "Sold out by two. The sergeant bought the last cask.",
        },
      ),
      C(
        "Give the first round free",
        { cost: 1 },
        {
          renown: 2,
          pay: 0.4,
          say: "Free beer, and every man knows your name.",
        },
      ),
    ],
  ),
  M(
    "brewer",
    "trouble",
    "rats-in-malt",
    "Rats in the malt",
    "Rats have got into the malt loft and spoiled a third of it.",
    [
      C(
        "Get a cat",
        {},
        {
          pay: -0.2,
          say: "A ginger tom of great ferocity. The rats are leaving.",
        },
      ),
      C(
        "Brew with what's left",
        { odds: 0.6 },
        { say: "Nobody tasted the rats." },
        { renown: -2, say: "Somebody tasted the rats." },
      ),
    ],
  ),
  M(
    "brewer",
    "task",
    "tavern-contract",
    "Three taverns",
    "Three taverns in {here} would take all their beer from you, if you'd give them credit through the winter.",
    [
      C(
        "Give the credit",
        { odds: 0.7 },
        { pay: 1, say: "Paid in the spring, with orders for summer." },
        { pay: -0.5, say: "One tavern went under owing you." },
      ),
      C("Cash only", {}, { pay: 0.2, say: "One of them took it." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "brewer",
    "trouble",
    "brew-froze",
    "The wort froze",
    "A cold snap came in the night and the wort froze in the coolers.",
    [
      C(
        "Warm it and pitch the yeast again",
        { check: { skill: "craft" } },
        { xp: 8, say: "It came back to life. Strong, too." },
        { pay: -0.4, say: "It came back as vinegar." },
      ),
      C(
        "Pour it out",
        {},
        { pay: -0.3, say: "A week's brew down the gutter." },
      ),
    ],
    { when: winterHere },
  ),

  // ------------------------------------------------ the distiller
  M(
    "distiller",
    "task",
    "fishing-fleet",
    "Rum for the fishing fleet",
    "The fishing schooners are fitting out for the Banks, and every one of them wants its allowance of rum before it sails: a gill a man a day, for four months.",
    [
      C(
        "Supply the whole fleet",
        { check: { skill: "trade" } },
        {
          pay: 0.9,
          xp: 8,
          say: "Every schooner sailed with your rum aboard, and paid on the nail.",
        },
        {
          pay: 0.2,
          say: "Half the fleet bought from the man across the harbour.",
        },
      ),
      C(
        "Supply who comes",
        {},
        { pay: 0.4, say: "A few schooners, a fair price." },
      ),
    ],
    { when: port },
  ),
  M(
    "distiller",
    "trouble",
    "molasses-short",
    "No molasses",
    "The French islands' molasses ship was seized by the customs, and the still stands cold.",
    [
      C(
        "Buy from a smuggler",
        { odds: 0.7 },
        {
          pay: 0.4,
          say: "French molasses, no questions, the still warm again.",
        },
        {
          pay: -0.6,
          say: "The customs came for the smuggler and found your name.",
        },
      ),
      C(
        "Buy dear from the English islands",
        {},
        { pay: -0.3, say: "Dear molasses, honest rum." },
      ),
    ],
  ),
  M(
    "distiller",
    "task",
    "aged-rum",
    "Rum that's waited",
    "Three casks have sat forgotten in the corner for four years. The rum in them has turned gold and smooth.",
    [
      C(
        "Sell it to the gentry",
        { check: { skill: "trade" } },
        {
          pay: 1,
          renown: 1,
          say: "Sold as 'Old Jamaica' to the governor's table.",
        },
        { pay: 0.3, say: "Sold as rum." },
      ),
      C(
        "Drink one with friends",
        {},
        { stress: -8, say: "Rum like that is for friends." },
      ),
    ],
  ),
  M(
    "distiller",
    "trouble",
    "worm-blocked",
    "The worm's blocked",
    "The copper worm that cools the spirit is blocked, and the still's head is getting hot.",
    [
      C(
        "Shut it down and clear it",
        {},
        { pay: -0.2, say: "A day lost. No explosion." },
      ),
      C(
        "Clear it while it runs",
        { check: { skill: "craft" } },
        { xp: 8, say: "Cleared, hot, and done." },
        { health: -10, say: "The still blew its head." },
      ),
    ],
  ),
  M(
    "distiller",
    "task",
    "cordials",
    "Cordials for the ladies",
    "The ladies of {here} want cordials: cherry, peach, ratafia, something sweet and respectable to serve in small glasses.",
    [
      C(
        "Make cordials",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          xp: 8,
          say: "Peach brandy in little bottles. The ladies are delighted.",
        },
        {
          pay: 0.1,
          say: "Too strong. The ladies were delighted, then asleep.",
        },
      ),
      C("Stick to rum", {}, { say: "Rum is respectable enough." }),
    ],
  ),
  M(
    "distiller",
    "trouble",
    "excise-raid",
    "The exciseman",
    "The exciseman wants to see your books, your stills, and your cellar, all at once.",
    [
      C(
        "Show him everything",
        {},
        { pay: -0.2, say: "He found a little to tax, and went away content." },
      ),
      C(
        "Show him some of it",
        { odds: 0.6 },
        { pay: 0.3, say: "He saw the stills. Not the cellar." },
        { pay: -0.8, say: "He found the cellar." },
      ),
    ],
  ),

  // ------------------------------------------------ the surveyor
  M(
    "surveyor",
    "task",
    "road-laying",
    "A road to the courthouse",
    "The county court wants a road laid out from the upper settlements to the courthouse, the shortest way, crossing as few men's fields as possible.",
    [
      C(
        "Run it straight",
        { check: { skill: "letters" } },
        { pay: 0.8, xp: 12, say: "A road on paper, and soon on the ground." },
        { renown: -1, say: "Through a widow's orchard. She'll be at court." },
      ),
      C("Follow the old trail", {}, { pay: 0.4, say: "Longer, and easier." }),
    ],
  ),
  M(
    "surveyor",
    "trouble",
    "chain-bearers-quit",
    "The chain-bearers quit",
    "The two men carrying your chain say the woods are full of snakes and the pay is a joke, and they're going home.",
    [
      C(
        "Talk them round",
        { check: { skill: "persuasion" } },
        { xp: 6, say: "A shilling more and a promise of rum. On you go." },
        {
          pay: -0.3,
          say: "They went home. You hired new ones in the next town.",
        },
      ),
      C(
        "Carry it yourself",
        {},
        { health: -4, xp: 8, say: "Your own chain, your own snakes." },
      ),
    ],
  ),
  M(
    "surveyor",
    "task",
    "town-lots",
    "Lots for a new town",
    "The proprietors want a new town laid out: streets, a square, lots for a church and a market, and the best lots marked for themselves.",
    [
      C(
        "Lay it out handsome",
        { check: { skill: "letters", dc: 1 } },
        {
          pay: 1.2,
          renown: 2,
          xp: 14,
          say: "A square, four streets, and a name on the map.",
        },
        { pay: 0.4, say: "A muddle of lots and a quarrel over the square." },
      ),
      C(
        "Give the proprietors the best",
        {},
        { pay: 0.8, say: "They're pleased. The settlers less so." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "surveyor",
    "trouble",
    "magnetic-iron",
    "Iron in the hills",
    "Your compass needle swings wild on this ridge: there's iron in the hills, and every bearing's wrong.",
    [
      C(
        "Run it by the stars",
        { check: { skill: "seamanship" } },
        { xp: 12, say: "Polaris and a long night. The line's true." },
        { renown: -1, say: "The line's out by a furlong." },
      ),
      C(
        "Note the iron for the ironmasters",
        {},
        { pay: 0.4, say: "An ironmaster paid for the news." },
      ),
    ],
  ),
  M(
    "surveyor",
    "task",
    "speculators",
    "A speculator's grant",
    "Land speculators want fifty thousand acres surveyed beyond the mountains, quickly, and their fee is enormous. The land is someone's hunting ground.",
    [
      C(
        "Take it",
        { odds: 0.7 },
        {
          pay: 1.5,
          say: "Fifty thousand acres on paper, and on the ground a great deal of anger.",
        },
        {
          health: -10,
          stress: 8,
          say: "Your party was turned back at the river.",
        },
      ),
      C("Refuse", {}, { say: "Another surveyor took it." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "surveyor",
    "trouble",
    "old-marks",
    "Marked trees",
    "The old deed bounds the land 'by a white oak marked with three notches', and there are a hundred white oaks, and all of them have been notched by somebody.",
    [
      C(
        "Find the true one",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.4,
          xp: 10,
          say: "The oldest blaze, grown over. The boundary holds.",
        },
        { renown: -1, say: "You picked the wrong oak." },
      ),
      C(
        "Make a new boundary by agreement",
        { check: { skill: "persuasion" } },
        { pay: 0.3, say: "Both men signed." },
        { say: "Neither man signed." },
      ),
    ],
  ),

  // ------------------------------------------------ the schoolmaster
  M(
    "schoolmaster",
    "task",
    "latin-boy",
    "Latin for the college",
    "A merchant wants his son ready for the college by next year: Latin, Greek, and enough Euclid to pass.",
    [
      C(
        "Drill him",
        { check: { skill: "letters" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 10,
          say: "He passed. His father talks of you.",
        },
        { pay: 0.2, say: "He failed the Greek." },
      ),
      C(
        "Teach what you can",
        {},
        { pay: 0.4, say: "Latin, yes. Greek, perhaps." },
      ),
    ],
  ),
  M(
    "schoolmaster",
    "trouble",
    "barred-out",
    "Barred out",
    "The boys have barred you out of the schoolhouse with the benches, as the custom is before Christmas, and won't let you in till you promise a holiday.",
    [
      C(
        "Promise the holiday",
        {},
        { renown: 1, stress: -3, say: "A week's holiday, and a cheer." },
      ),
      C(
        "Climb in the window",
        { check: { skill: "fighting" } },
        { renown: 1, say: "In through the window. They respect you now." },
        { health: -4, renown: -1, say: "The window was barred too." },
      ),
    ],
    { when: months(11, 0) },
  ),
  M(
    "schoolmaster",
    "task",
    "evening-school",
    "An evening school",
    "Apprentices and servants want to learn to read and cipher after work, two pence a week, by candlelight.",
    [
      C(
        "Open an evening school",
        { check: { skill: "letters" } },
        {
          pay: 0.5,
          renown: 1,
          xp: 8,
          say: "Twelve tired faces, learning. Worth the candles.",
        },
        { pay: 0.1, say: "Six came, and fell asleep." },
      ),
      C("Not after a day of it", {}, { say: "You need your evenings." }),
    ],
  ),
  M(
    "schoolmaster",
    "trouble",
    "parent-complains",
    "A father complains",
    "A father says you thrashed his son unjustly and is coming with a horsewhip.",
    [
      C(
        "Meet him at the door, calmly",
        { check: { skill: "persuasion" } },
        { xp: 6, say: "He went away believing the boy deserved it." },
        { health: -6, say: "The horsewhip had its say." },
      ),
      C(
        "Apologise",
        {},
        { renown: -1, say: "He went away satisfied. The boys heard." },
      ),
    ],
  ),
  M(
    "schoolmaster",
    "task",
    "girls-school",
    "Girls to teach",
    "Some of the town's families want their daughters taught to read, write and cipher too, and some think it a waste.",
    [
      C(
        "Teach them",
        {},
        {
          pay: 0.4,
          renown: 1,
          say: "The girls learn faster than the boys, and the boys know it.",
        },
      ),
      C(
        "Keep the school for boys",
        {},
        { say: "The girls learn at home, from their mothers." },
      ),
    ],
  ),
  M(
    "schoolmaster",
    "trouble",
    "no-salary",
    "The town won't pay",
    "The town meeting voted your salary and hasn't paid it, and the selectmen say the treasury's empty.",
    [
      C(
        "Speak at the town meeting",
        { check: { skill: "persuasion" } },
        {
          pay: 0.6,
          renown: 1,
          say: "Paid, in full, after a speech they'll remember.",
        },
        { say: "Paid, in promises." },
      ),
      C(
        "Take your pay in firewood and corn",
        {},
        { pay: 0.2, say: "Warm and fed, if not rich." },
      ),
    ],
  ),

  // ------------------------------------------------ the midwife
  M(
    "midwife",
    "task",
    "twins",
    "Twins",
    "A young wife's time has come, and you can feel two heads.",
    [
      C(
        "Bring them both",
        { check: { skill: "medicine", dc: 1 } },
        {
          pay: 0.6,
          renown: 2,
          xp: 14,
          say: "Two boys, loud and well. The mother laughs and cries.",
        },
        { stress: 8, say: "One lived." },
      ),
      C(
        "Send for the surgeon too",
        {},
        { pay: 0.3, say: "The surgeon came late, and helpful." },
      ),
    ],
  ),
  M(
    "midwife",
    "trouble",
    "court-oath",
    "Sworn before the justice",
    "An unmarried girl has given birth, and the justice wants you to swear what name she cried out in her labour, as the law has it.",
    [
      C(
        "Swear the name she gave",
        {},
        {
          renown: 1,
          say: "The father will support the child, by order of the court.",
        },
      ),
      C(
        "Swear you heard nothing",
        {},
        { stress: 3, say: "The girl's secret is hers." },
      ),
    ],
  ),
  M(
    "midwife",
    "task",
    "teach-girl",
    "A girl to teach",
    "A neighbour's daughter wants to learn your trade, and has steady hands and a strong stomach.",
    [
      C(
        "Take her on",
        { check: { skill: "leadership" } },
        { xp: 8, renown: 1, say: "She'll be good. Better than you, one day." },
        { say: "She fainted at the first birth." },
      ),
      C("Not yet", {}, { say: "She'll ask again." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "midwife",
    "trouble",
    "physician-rival",
    "The man-midwife",
    "A physician fresh from London calls himself a man-midwife and says women like you kill more than you save.",
    [
      C(
        "Let your record speak",
        { check: { skill: "persuasion" } },
        { renown: 2, say: "Every mother in town spoke for you." },
        { pay: -0.3, say: "Some of the rich ones went to him." },
      ),
      C(
        "Ignore him",
        {},
        { say: "Babies still come at night, and he sleeps." },
      ),
    ],
  ),
  M(
    "midwife",
    "task",
    "groaning-cake",
    "The groaning party",
    "A merchant's wife is lying in, and her women friends gather for the groaning: cake, beer, gossip, and you in charge of all of them.",
    [
      C(
        "Keep order",
        { check: { skill: "leadership" } },
        {
          pay: 0.5,
          xp: 6,
          say: "A girl, a fine one, and the women sent home happy.",
        },
        { stress: 4, say: "A girl, a fine one, and a quarrel over the cake." },
      ),
      C(
        "Let the women do as they like",
        {},
        { pay: 0.3, say: "Loud, and fine." },
      ),
    ],
  ),
  M(
    "midwife",
    "trouble",
    "breech",
    "Feet first",
    "The baby's coming feet first and the mother's been labouring a day.",
    [
      C(
        "Turn it",
        { check: { skill: "medicine", dc: 1 } },
        { renown: 2, xp: 14, say: "Turned, and born, and both living." },
        { stress: 8, say: "Born, and the mother very weak." },
      ),
      C(
        "Pray and wait",
        { odds: 0.4 },
        { say: "Born, feet first, and lived." },
        { stress: 10, say: "You'll remember this one." },
      ),
    ],
  ),

  // ------------------------------------------------ the apothecary
  M(
    "apothecary",
    "task",
    "physic-order",
    "An order from London",
    "The ship from London has come, and with it your order: jalap, rhubarb, mercury, opium, Peruvian bark. Half the crates are water-stained.",
    [
      C(
        "Sort the good from the spoiled",
        { check: { skill: "medicine" } },
        { pay: 0.4, xp: 10, say: "Most of it saved. The bark was dry." },
        { pay: -0.4, say: "Most of it spoiled." },
      ),
      C(
        "Claim on the insurers",
        { check: { skill: "letters" } },
        { pay: 0.5, say: "The insurers paid." },
        { say: "The insurers said water isn't a peril of the sea." },
      ),
    ],
    { when: port },
  ),
  M(
    "apothecary",
    "trouble",
    "poison-ask",
    "Arsenic for rats",
    "A woman asks for arsenic for the rats, and you've heard her husband beats her.",
    [
      C(
        "Sell it",
        { odds: 0.8 },
        { say: "The rats died. So did nothing else." },
        { stress: 10, say: "Her husband died. The inquest asked who sold it." },
      ),
      C(
        "Sell her a cat instead",
        {},
        { say: "She laughed, the first time in months, she said." },
      ),
    ],
  ),
  M(
    "apothecary",
    "task",
    "herb-woman",
    "The herb woman's receipts",
    "An old herb woman offers to sell you her receipts: what's good for fevers, for coughs, for the bloody flux. Some of it is nonsense. Some of it isn't.",
    [
      C(
        "Buy them and test them",
        { cost: 2, check: { skill: "medicine" } },
        {
          xp: 16,
          pay: 0.4,
          say: "Two receipts that work better than anything from London.",
        },
        { xp: 4, say: "Nonsense, all of it." },
      ),
      C("Decline", {}, { say: "She sold them to the minister's wife." }),
    ],
  ),
  M(
    "apothecary",
    "trouble",
    "wrong-label",
    "The wrong jar",
    "Your apprentice has filled the laudanum jar from the wrong bottle, and you've sold three doses.",
    [
      C(
        "Run after the customers",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "Found all three before a drop was taken." },
        { stress: 8, say: "Found two." },
      ),
      C(
        "Hope nobody notices",
        { odds: 0.4 },
        { say: "Nobody noticed." },
        { renown: -4, say: "Somebody noticed." },
      ),
    ],
  ),
  M(
    "apothecary",
    "task",
    "army-chest",
    "A medicine chest for the regiment",
    "The regiment wants a medicine chest for the campaign, fully stocked, by the end of the month.",
    [
      C(
        "Stock it",
        { check: { skill: "medicine" } },
        { pay: 1, xp: 10, say: "Every drawer filled and labelled." },
        { pay: 0.4, say: "Some drawers empty." },
      ),
      C("Decline", {}, { say: "The regiment marches without." }),
    ],
  ),
  M(
    "apothecary",
    "task",
    "chocolate",
    "Chocolate and coffee",
    "Your customers are asking for chocolate, coffee and tea as well as physic, and they'd pay well for them.",
    [
      C(
        "Stock them",
        { check: { skill: "trade" } },
        { pay: 0.6, say: "Chocolate sells better than calomel." },
        { pay: -0.2, say: "Nobody buys chocolate from a man with leeches." },
      ),
      C("Stick to physic", {}, { say: "Physic is physic." }),
    ],
  ),

  // ------------------------------------------------ the shopkeeper
  M(
    "shopkeeper",
    "task",
    "fashionable",
    "The latest from London",
    "A trunk of the latest London fashions has arrived: silk, buckles, hats, a few things nobody in {here} has ever seen.",
    [
      C(
        "Display it well",
        { check: { skill: "trade" } },
        { pay: 0.8, xp: 8, say: "The whole trunk gone in a week." },
        { pay: 0.2, say: "The hats didn't sell." },
      ),
      C(
        "Sell it to one customer",
        {},
        { pay: 0.5, say: "The governor's lady took the lot." },
      ),
    ],
  ),
  M(
    "shopkeeper",
    "trouble",
    "credit-farmer",
    "A farmer's account",
    "A farmer's account has run to three pounds and he wants more on credit until the harvest.",
    [
      C(
        "Give it",
        { odds: 0.7 },
        { pay: 0.5, renown: 1, say: "Paid after the harvest, with a ham." },
        { pay: -0.6, say: "The harvest failed." },
      ),
      C(
        "No more credit",
        {},
        { renown: -1, say: "He'll trade with the store across the road." },
      ),
    ],
  ),
  M(
    "shopkeeper",
    "task",
    "country-produce",
    "Butter in trade",
    "Country wives want to trade butter, eggs and stockings for your goods, and you could sell their goods to the ships.",
    [
      C(
        "Trade with them",
        { check: { skill: "trade" } },
        {
          pay: 0.6,
          xp: 8,
          say: "Butter to the ships, and the wives come back every week.",
        },
        { pay: 0.1, say: "The butter went off." },
      ),
      C("Cash only", {}, { say: "The wives went elsewhere." }),
    ],
  ),
  M(
    "shopkeeper",
    "trouble",
    "sleeve",
    "A sleeve too full",
    "A lady of good family has just put a pair of silk gloves up her sleeve.",
    [
      C(
        "Add them to her account",
        {},
        { pay: 0.3, say: "Her husband paid without a word." },
      ),
      C(
        "Say something",
        { check: { skill: "persuasion" } },
        { say: "She found them, surprised, and paid." },
        { renown: -2, say: "She told everyone you'd insulted her." },
      ),
      C("Let it go", {}, { pay: -0.1, say: "A pair of gloves." }),
    ],
  ),
  M(
    "shopkeeper",
    "task",
    "boycott",
    "No English goods",
    "The town has signed an agreement not to buy English goods, and your shelves are full of them.",
    [
      C(
        "Sign it",
        {},
        {
          pay: -0.4,
          renown: 2,
          say: "English goods to the cellar. The town's with you.",
        },
      ),
      C(
        "Keep selling quietly",
        { odds: 0.6 },
        { pay: 0.6, say: "Quietly, and well." },
        { renown: -4, say: "Your name in the gazette among the importers." },
      ),
    ],
    { when: since(1765) },
  ),
  M(
    "shopkeeper",
    "task",
    "second-store",
    "A second store",
    "A store up the river is for sale, cheap, and could take your goods to the back settlements.",
    [
      C(
        "Buy it and send a clerk",
        { odds: 0.65 },
        { pay: 1.2, say: "Furs and flaxseed coming down the river." },
        { pay: -0.6, say: "The clerk drank the profits." },
      ),
      C("Not now", {}, { say: "Someone else bought it." }),
    ],
    { when: rankAtLeast(2) },
  ),
];
