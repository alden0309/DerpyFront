// EVENTS (r21): more matters at work for the sea and the colours (the
// sailor, the shipwright, the fisherman, the whaleman, the soldier, the
// militiaman), more big jobs for each crooked trade, and more rounds for
// the watch and the thief-takers. Plain data, like MattersHonest.ts.

import {
  atWarNow,
  C,
  M,
  months,
  north,
  openWater,
  peaceNow,
  port,
  rankAtLeast,
  south,
  type Variant,
} from "./MatterKit";
import { rankBelow } from "./MattersR21Town";

export const SEA_MATTERS_R21: Variant[] = [
  // ------------------------------------------------ the sailor
  M(
    "sailor",
    "task",
    "sounding",
    "Heaving the lead",
    "Coming in over the bar in the dark, the master wants a man in the chains with the lead line calling the depths, and the last man was wrong by a fathom.",
    [
      C(
        "Take the lead",
        { check: { skill: "seamanship" } },
        {
          xp: 12,
          boss: 4,
          say: '"By the mark, five... and a half, four." In over the bar without touching.',
        },
        {
          stress: 5,
          say: "You called a fathom too many. She touched, and came off.",
        },
      ),
      C(
        "Stand by the anchor",
        {},
        { xp: 4, say: "Somebody else called the depths." },
      ),
    ],
    { when: port },
  ),
  M(
    "sailor",
    "trouble",
    "crimp",
    "A crimp's kindness",
    "A man in a waterfront tavern is buying you drinks and talking about a ship that pays double, sailing tonight. He's very friendly. The drinks are very strong.",
    [
      C(
        "Drink up and listen",
        { odds: 0.4 },
        {
          pay: 0.5,
          say: "She paid double. You sailed on her and came home richer.",
        },
        {
          pay: -0.5,
          health: -5,
          stress: 6,
          say: "You woke at sea on a ship bound for Guinea, your advance in the crimp's pocket.",
        },
      ),
      C(
        "Pour it in the spittoon and leave",
        { check: { skill: "stealth" } },
        { xp: 6, say: "You were gone before he noticed you were sober." },
        { health: -4, say: "His friends noticed." },
      ),
    ],
    { when: port },
  ),
  M(
    "sailor",
    "task",
    "shanty",
    "Leading the shanty",
    "The capstan's heavy and the men are flagging, and the mate shouts for someone to strike up a song.",
    [
      C(
        "Sing it out",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          xp: 8,
          stress: -3,
          say: "'Haul away, Joe.' The anchor came up dancing.",
        },
        {
          stress: 2,
          say: "You forgot the second verse. They made up their own.",
        },
      ),
      C("Heave and keep quiet", {}, { xp: 3, say: "Heavy, and silent." }),
    ],
  ),
  M(
    "sailor",
    "trouble",
    "flogging",
    "Twelve at the gangway",
    "A shipmate is to be flogged for drunkenness, twelve lashes, and the mate has picked you to lay them on.",
    [
      C(
        "Lay them on light",
        { odds: 0.6 },
        { stress: 2, say: "Light enough. The men saw, and the mate didn't." },
        {
          boss: -6,
          stress: 4,
          say: "The mate saw, and ordered twelve more, from someone else, for you.",
        },
      ),
      C(
        "Do as you're told",
        {},
        { boss: 3, stress: 6, say: "You did it. He won't look at you now." },
      ),
      C(
        "Refuse",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "The captain let it go, this once." },
        { boss: -8, health: -6, say: "Refused. Flogged yourself." },
      ),
    ],
  ),
  M(
    "sailor",
    "task",
    "mate-ticket",
    "Learning navigation",
    "The second mate will teach you to work a noon sight and a reckoning, if you'll stand his watches when he's tired.",
    [
      C(
        "Learn it",
        { check: { skill: "letters" } },
        {
          xp: 16,
          say: "Latitude by noon, and a reckoning that came out within a league.",
        },
        { xp: 6, stress: 3, say: "The figures swim. Keep at it." },
      ),
      C("Not your trade", {}, { say: "Somebody else can find the way." }),
    ],
    { when: rankBelow(2) },
  ),
  M(
    "sailor",
    "trouble",
    "rats-in-bread",
    "The bread's alive",
    "The bread in the bread room is full of weevils and the rats are eating the weevils. The cook says it's still bread.",
    [
      C(
        "Bake it again in the galley",
        { check: { skill: "craft" } },
        {
          stress: -2,
          xp: 4,
          say: "Rebaked, the weevils driven out. Edible, almost.",
        },
        { say: "Rebaked weevils." },
      ),
      C(
        "Eat it in the dark",
        {},
        { stress: 3, say: "What you can't see can't hurt you, much." },
      ),
    ],
    { when: openWater },
  ),

  // ------------------------------------------------ the shipwright
  M(
    "shipwright",
    "task",
    "figurehead",
    "A figurehead",
    "The owners of the new brig want a figurehead: a lady, they say, in a blue gown, holding a wreath. The carver who usually does them has gone to Boston.",
    [
      C(
        "Carve it yourself",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.8,
          renown: 1,
          xp: 14,
          say: "A lady in a blue gown with a very determined chin. The owners are delighted.",
        },
        { pay: 0.3, say: "A lady, of a sort." },
      ),
      C(
        "Fit a plain billet head",
        {},
        { pay: 0.3, say: "Plain, and cheaper." },
      ),
    ],
  ),
  M(
    "shipwright",
    "trouble",
    "slip-collapse",
    "The ways give",
    "The ways under the ship on the stocks have settled in the rain and she's listing a foot to larboard.",
    [
      C(
        "Shore her up",
        { check: { skill: "leadership" } },
        { xp: 10, boss: 4, say: "Shored, wedged and upright by nightfall." },
        {
          pay: -0.6,
          health: -6,
          say: "She came off her blocks, and hurt two men.",
        },
      ),
      C(
        "Wait for dry weather",
        { odds: 0.5 },
        { say: "She held." },
        { pay: -0.8, say: "She went over." },
      ),
    ],
  ),
  M(
    "shipwright",
    "task",
    "mast-stepping",
    "Stepping the mast",
    "The mainmast is to be stepped today with sheers and tackles, and the master shipwright is ill.",
    [
      C(
        "Run the stepping",
        { check: { skill: "seamanship" } },
        {
          pay: 0.5,
          renown: 1,
          xp: 12,
          say: "Up, plumb, and wedged. A coin under the heel for luck.",
        },
        { health: -8, say: "A tackle carried away." },
      ),
      C("Wait for the master", {}, { pay: -0.2, say: "A day lost." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "shipwright",
    "trouble",
    "oakum-short",
    "No oakum",
    "There's no oakum to be had for the caulking: the ropewalks are selling all their old rope to the navy.",
    [
      C(
        "Pick it yourselves from old cable",
        {},
        {
          stress: 4,
          xp: 4,
          say: "A week picking oakum in the loft. Your fingers bleed.",
        },
      ),
      C(
        "Buy from the navy yard's clerk",
        { cost: 2, odds: 0.7 },
        { say: "Navy oakum, and no questions." },
        { pay: -0.5, say: "The clerk was caught, and so was the oakum." },
      ),
    ],
  ),
  M(
    "shipwright",
    "task",
    "privateer-refit",
    "Refit for a privateer",
    "A privateer wants her sides pierced for more guns and her masts raked, in a week, for double pay.",
    [
      C(
        "Work double tides",
        { check: { skill: "craft" } },
        {
          pay: 1.2,
          xp: 10,
          stress: 4,
          say: "Done. She sailed with twelve guns and your work in every one.",
        },
        { pay: 0.4, stress: 6, say: "Done, and badly. She'll leak." },
      ),
      C(
        "Do it at the usual pace",
        {},
        { pay: 0.4, say: "Another yard did it faster." },
      ),
    ],
    { when: atWarNow },
  ),
  M(
    "shipwright",
    "task",
    "model",
    "A model for the owners",
    "The owners want a half-model carved before they'll pay for a new schooner, so they can see her lines.",
    [
      C(
        "Carve a fine one",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          xp: 12,
          say: "They saw her lines and fell in love. The keel's laid.",
        },
        { say: "They saw her lines and wanted changes." },
      ),
      C(
        "Show them a drawing",
        {},
        { pay: 0.2, say: "A drawing. They squinted." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),

  // ------------------------------------------------ the fisherman
  M(
    "fisherman",
    "task",
    "mackerel",
    "The mackerel are in",
    "The mackerel are schooling in the bay, so thick the water boils. Every boat in {here} is going out.",
    [
      C(
        "Fish till the hold's full",
        { check: { skill: "seamanship" } },
        { pay: 0.8, xp: 10, say: "A hold full and silver to the gunwales." },
        { pay: 0.3, say: "A good catch, and a tangled line." },
      ),
      C(
        "Sell bait to the others",
        {},
        { pay: 0.4, say: "Every boat bought bait." },
      ),
    ],
    { when: months(5, 8) },
  ),
  M(
    "fisherman",
    "trouble",
    "salt-short",
    "No salt",
    "The salt ship from the islands hasn't come, and fish without salt is rotten fish in a week.",
    [
      C(
        "Boil your own from seawater",
        { check: { skill: "craft" } },
        { xp: 8, say: "Grey salt, but salt. The fish keep." },
        { pay: -0.4, say: "Not enough salt for the fish." },
      ),
      C(
        "Sell the fish fresh, cheap",
        {},
        { pay: 0.1, say: "Cheap fish, and the whole town eats well." },
      ),
    ],
  ),
  M(
    "fisherman",
    "task",
    "lobsters",
    "Lobsters for the gentry",
    "The gentry have discovered a taste for lobsters (which the poor and the servants are sick of), and pay well for big ones.",
    [
      C(
        "Set pots",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.5,
          xp: 8,
          say: "Lobsters the size of a man's arm. The gentry are delighted.",
        },
        { say: "The pots came up empty." },
      ),
      C("Not worth the trouble", {}, { say: "Lobsters are for servants." }),
    ],
    { when: north },
  ),
  M(
    "fisherman",
    "trouble",
    "boat-stolen",
    "The boat's gone",
    "Your boat's gone from the beach in the night, rope cut. A boy says he saw it going round the point with two men.",
    [
      C(
        "Chase them in a borrowed boat",
        { check: { skill: "seamanship" } },
        {
          xp: 10,
          renown: 1,
          say: "Caught round the point. They were runaway sailors. Your boat's home.",
        },
        { pay: -0.5, say: "Gone. You'll fish from the rocks." },
      ),
      C(
        "Report it to the justice",
        {},
        { pay: -0.3, say: "The justice wrote it down." },
      ),
    ],
  ),
  M(
    "fisherman",
    "task",
    "teach-son",
    "A boy in the boat",
    "A neighbour's boy wants to go out with you and learn the grounds: where the cod lie, the marks on the shore, the weather in the sky.",
    [
      C(
        "Take him",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          xp: 6,
          say: "He's a natural. He'll have his own boat one day.",
        },
        { stress: 3, say: "He was sick over the side all day." },
      ),
      C("Not yet", {}, { say: "He'll ask again." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "fisherman",
    "trouble",
    "squall",
    "A squall off the land",
    "A black squall is coming off the land, and you're two leagues out with the nets down.",
    [
      C(
        "Cut the nets and run",
        {},
        { pay: -0.4, say: "Home, alive, without nets." },
      ),
      C(
        "Haul and ride it out",
        { check: { skill: "seamanship", dc: 1 } },
        {
          pay: 0.3,
          xp: 12,
          say: "Nets in, squall through, home wet and proud.",
        },
        { health: -10, pay: -0.5, say: "Nets lost, and nearly the boat." },
      ),
    ],
  ),

  // ------------------------------------------------ the whaleman
  M(
    "whaler",
    "task",
    "lookout",
    "At the masthead",
    "Your trick at the masthead, two hours in the hoops with the whole sea to watch. A spout in the far distance, or a cloud.",
    [
      C(
        "Sing out",
        { check: { skill: "seamanship" } },
        {
          pay: 0.5,
          xp: 10,
          say: "A spout. A fat right whale, and a share for the man who saw her.",
        },
        { boss: -2, say: "A cloud. The mate was not amused." },
      ),
      C(
        "Wait to be sure",
        {},
        { say: "By the time you were sure, she'd sounded." },
      ),
    ],
    { when: openWater },
  ),
  M(
    "whaler",
    "trouble",
    "line-fouled",
    "The line fouls",
    "The whale's sounding and the line is running out round the loggerhead smoking, and a kink is coming up from the tub.",
    [
      C(
        "Clear the kink",
        { check: { skill: "seamanship", dc: 1 } },
        {
          xp: 14,
          renown: 1,
          say: "Cleared with a hand's breadth to spare. The whale came up dead.",
        },
        { health: -14, say: "The line took a turn round your arm." },
      ),
      C(
        "Cut the line",
        {},
        { pay: -0.3, say: "Line and whale lost. Everyone alive." },
      ),
    ],
  ),
  M(
    "whaler",
    "task",
    "scrimshaw",
    "Scrimshaw",
    "Long days between whales, and the men are carving whale's teeth and bone: busks, pie-crimpers, a ship in full sail.",
    [
      C(
        "Carve something fine",
        { check: { skill: "craft" } },
        {
          pay: 0.3,
          xp: 8,
          stress: -4,
          say: "A busk for a sweetheart, a ship under sail on it.",
        },
        { stress: -2, say: "A tooth with a crooked whale on it." },
      ),
      C("Sleep instead", {}, { stress: -3, say: "Sleep is precious too." }),
    ],
  ),
  M(
    "whaler",
    "trouble",
    "greenhand-fear",
    "A greenhand freezes",
    "A greenhand in your boat has frozen at his oar with the whale fifty yards off and coming.",
    [
      C(
        "Snap him out of it",
        { check: { skill: "leadership" } },
        { xp: 10, say: "A word, a cuff, and he pulled like a hero." },
        { health: -6, say: "The boat lost way. The whale didn't." },
      ),
      C(
        "Take his oar too",
        {},
        { health: -3, say: "Two oars, and your arms on fire." },
      ),
    ],
  ),
  M(
    "whaler",
    "task",
    "ambergris",
    "Ambergris",
    "Cutting in a sperm whale, you've found a lump of something grey, waxy and smelling oddly of the sea and something sweet. The old hands say it's worth its weight in gold.",
    [
      C(
        "Hand it to the captain",
        {},
        {
          pay: 0.8,
          boss: 5,
          say: "Ambergris. The owners' fortune, and a reward for you.",
        },
      ),
      C(
        "Hide a piece of it",
        { odds: 0.6 },
        { pay: 1.6, say: "Sold quietly to an apothecary in town." },
        { boss: -8, renown: -2, say: "Found in your sea chest." },
      ),
    ],
  ),
  M(
    "whaler",
    "task",
    "boatheader",
    "Head a boat",
    "The third mate is sick and the captain wants you to head his boat: to steer, to choose, and to strike if the harpooner misses.",
    [
      C(
        "Take the boat",
        { check: { skill: "leadership", dc: 1 } },
        {
          pay: 0.6,
          renown: 1,
          xp: 14,
          say: "A whale fast and killed. The captain's watching you.",
        },
        { stress: 6, say: "A stove boat, but every man saved." },
      ),
      C("Stay at your oar", {}, { say: "Someone else headed it." }),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the soldier
  M(
    "soldier",
    "task",
    "sentry-night",
    "Sentry on the bastion",
    "Two hours on the bastion in the cold, and something is moving in the ditch below.",
    [
      C(
        "Challenge it",
        { check: { skill: "fighting" } },
        {
          renown: 1,
          xp: 8,
          say: "A deserter trying to get back in. You brought him to the sergeant.",
        },
        { health: -6, say: "A deserter trying to get out. He had a knife." },
      ),
      C(
        "Fire a shot and rouse the guard",
        {},
        { say: "A pig. The whole garrison saw it." },
      ),
    ],
  ),
  M(
    "soldier",
    "trouble",
    "dice-barracks",
    "Dice in the barracks",
    "A game of hazard in the barracks has gone sour, and two men are going for their bayonets.",
    [
      C(
        "Step between them",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          xp: 8,
          say: "Bayonets back in the scabbards. The dice in the fire.",
        },
        { health: -8, say: "You stepped into it." },
      ),
      C(
        "Fetch the corporal",
        {},
        { say: "The corporal stopped it with his cane." },
      ),
    ],
  ),
  M(
    "soldier",
    "task",
    "foraging",
    "A foraging party",
    "The quartermaster wants a party to go out to the farms for hay and cattle, paying in the King's notes, which the farmers don't love.",
    [
      C(
        "Pay fair and talk sweet",
        { check: { skill: "persuasion" } },
        { renown: 1, xp: 8, say: "Hay, cattle, and no farmer with a musket." },
        { stress: 4, say: "Hay, cattle, and a farmer with a musket." },
      ),
      C(
        "Take what's needed",
        {},
        { renown: -1, boss: 2, say: "The farmers will remember the regiment." },
      ),
    ],
    { when: atWarNow },
  ),
  M(
    "soldier",
    "trouble",
    "officer-debts",
    "An officer's debts",
    "An ensign owes money all over town and has asked you to carry a letter to a moneylender, quietly, and to say nothing.",
    [
      C(
        "Carry it",
        {},
        {
          pay: 0.3,
          say: "A shilling for your trouble, and an ensign who owes you.",
        },
      ),
      C(
        "Tell the captain",
        {},
        { boss: 3, say: "The ensign's on half pay. He knows who told." },
      ),
    ],
    { when: rankBelow(3) },
  ),
  M(
    "soldier",
    "task",
    "recruit-drill",
    "Drilling recruits",
    "A draft of new recruits has come in: farm boys, a tailor, two Irishmen and a man who says he's a duke. They need to learn the manual exercise in a month.",
    [
      C(
        "Drill them hard",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          xp: 12,
          boss: 4,
          say: "A month, and they fire three rounds a minute. The duke too.",
        },
        {
          stress: 4,
          say: "A month, and one of them still holds his musket backwards.",
        },
      ),
      C(
        "Leave it to the sergeant",
        {},
        { say: "The sergeant drilled them, with his cane." },
      ),
    ],
    { when: rankAtLeast(2) },
  ),
  M(
    "soldier",
    "task",
    "smuggled-letters",
    "A flag of truce",
    "A flag of truce has come in from the enemy with letters for prisoners. Somebody must escort the officer to the commandant, and not let him count the guns on the way.",
    [
      C(
        "Lead him round the long way",
        { check: { skill: "stealth" } },
        { xp: 8, boss: 4, say: "He saw a great many walls and no guns." },
        { say: "He counted. You saw him count." },
      ),
      C(
        "Take him straight there",
        {},
        { say: "Straight there, and he looked about him." },
      ),
    ],
    { when: atWarNow },
  ),

  // ------------------------------------------------ the militia
  M(
    "militia",
    "task",
    "election-officers",
    "Electing officers",
    "The company is to elect its officers, as the custom is, and a rich man's son is buying rum for votes.",
    [
      C(
        "Stand yourself",
        { check: { skill: "persuasion" } },
        { renown: 2, xp: 8, say: "Elected by the men, over the rum." },
        { say: "The rum won." },
      ),
      C(
        "Vote for the best man",
        {},
        { renown: 1, say: "The best man lost. You voted for him." },
      ),
    ],
  ),
  M(
    "militia",
    "trouble",
    "alarm-false",
    "The alarm gun",
    "The alarm gun fired at midnight and the company turned out in nightshirts with muskets. It was a drunk with a fowling piece.",
    [
      C(
        "Make a joke of it",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          stress: -3,
          say: "The whole company laughed. They'll turn out again.",
        },
        { say: "Nobody laughed." },
      ),
      C(
        "Have the drunk fined",
        {},
        { say: "Fined ten shillings. He thought it worth it." },
      ),
    ],
  ),
  M(
    "militia",
    "task",
    "powder-house",
    "Guarding the powder",
    "Rumours say the governor means to carry the colony's powder aboard a man-of-war, and the company wants to guard the powder house tonight.",
    [
      C(
        "Stand guard",
        { odds: 0.7 },
        { renown: 2, say: "A long cold night, and the powder's still ours." },
        {
          stress: 6,
          say: "Marines came, and there were words, and the powder went.",
        },
      ),
      C("Stay home", {}, { renown: -1, say: "The others stood guard." }),
    ],
    { when: rankBelow(4) },
  ),
  M(
    "militia",
    "trouble",
    "muster-fine",
    "Fined for absence",
    "A poor farmer in the company has been fined for missing three musters; he was at his wife's sickbed. The captain wants the fine collected.",
    [
      C(
        "Speak for him",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "The fine remitted. The farmer's yours for life." },
        { say: "The fine stands." },
      ),
      C(
        "Pay it yourself",
        { cost: 1 },
        { renown: 2, say: "Paid. He'll never know who." },
      ),
      C(
        "Collect it",
        {},
        {
          stress: 3,
          say: "Collected. You'll avoid his eye at the next muster.",
        },
      ),
    ],
  ),
  M(
    "militia",
    "task",
    "scout-woods",
    "Scouting the frontier",
    "The frontier settlers want the company to range the woods for a week and show the war parties that somebody's watching.",
    [
      C(
        "Lead the range",
        { check: { skill: "woodcraft" } },
        {
          renown: 2,
          xp: 10,
          say: "A week in the woods, a cold camp found, and nobody hurt.",
        },
        { health: -6, say: "An ambush at a ford. Everyone got home." },
      ),
      C("Stay with the main body", {}, { say: "A week of marching." }),
    ],
    { when: atWarNow },
  ),
  M(
    "militia",
    "task",
    "barbecue",
    "Muster-day barbecue",
    "After the muster there's to be a barbecue: an ox, a barrel of punch and a shooting match for a beaver hat.",
    [
      C(
        "Shoot for the hat",
        { check: { skill: "fighting" } },
        { renown: 1, stress: -4, say: "The hat's yours. It's too big." },
        { stress: -2, say: "The blacksmith won it. He always does." },
      ),
      C(
        "Tend the fire",
        {},
        { stress: -4, say: "The best piece of the ox for the cook." },
      ),
    ],
    { when: peaceNow },
  ),

  // ------------------------------------------------ crooked work: the den's tip-offs
  M(
    "thief",
    "score",
    "auction-house",
    "The auction room",
    "A vendue of a dead merchant's plate at the coffee house: everyone crowding round the auctioneer's table, and the plate laid out on the side table for viewing.",
    [
      C(
        "Lift a spoon or two",
        { check: { skill: "stealth" } },
        {
          pay: 0.8,
          name: 2,
          heat: 6,
          say: "Two spoons in your sleeve. The bidding never stopped.",
        },
        { heat: 10, seize: 0.3, say: "The auctioneer counts his spoons." },
      ),
      C("Bid on nothing", {}, { say: "You watched the plate sold." }),
    ],
  ),
  M(
    "thief",
    "score",
    "stagecoach-trunk",
    "A trunk in the yard",
    "A gentleman's trunk is sitting in the inn yard waiting for the morning stage, and the ostler is asleep in the straw.",
    [
      C(
        "Open it where it stands",
        { check: { dc: 1 } },
        {
          pay: 1.2,
          name: 2,
          heat: 8,
          say: "Shirts, a silver watch and a bag of guineas.",
        },
        { heat: 12, seize: 0.35, say: "The ostler was a light sleeper." },
      ),
      C("Leave it", {}, { say: "The trunk went with the stage." }),
    ],
  ),
  M(
    "thief",
    "score",
    "church-plate",
    "The church plate",
    "The communion plate is kept in a chest in the vestry, and the sexton drinks.",
    [
      C(
        "Take it",
        { check: { dc: 2 } },
        {
          pay: 2,
          name: 4,
          heat: 16,
          say: "Silver for the melting pot. Sacrilege, the town says.",
        },
        {
          heat: 18,
          seize: 0.45,
          say: "The sexton was sober tonight, of all nights.",
        },
      ),
      C(
        "Not the church",
        {},
        { stress: -2, say: "There are lines. That's one." },
      ),
    ],
  ),
  M(
    "fence",
    "score",
    "silk-bolts",
    "Silk off a ship",
    "Bolts of silk, smuggled off an India ship, are going cheap from a mate who wants them gone before the customs search.",
    [
      C(
        "Buy the lot",
        { cost: 3, check: { skill: "trade" } },
        {
          pay: 2,
          name: 2,
          heat: 6,
          say: "Sold to milliners up and down the coast.",
        },
        {
          heat: 10,
          seize: 0.3,
          say: "The customs searched the mate's lodging, and found your note.",
        },
      ),
      C(
        "Take a bolt",
        {},
        { pay: 0.4, heat: 2, say: "One bolt, one dress, one happy milliner." },
      ),
    ],
  ),
  M(
    "fence",
    "score",
    "horse-papers",
    "A horse with no papers",
    "A fine bay mare and no bill of sale, brought in by a boy who won't meet your eye.",
    [
      C(
        "Change her markings and sell her",
        { check: { skill: "craft" } },
        {
          pay: 1.2,
          name: 2,
          heat: 6,
          say: "A white star painted out, a new name, a good price.",
        },
        { heat: 12, seize: 0.35, say: "The paint ran in the rain." },
      ),
      C("Send the boy away", {}, { say: "He'll sell her to somebody else." }),
    ],
  ),
  M(
    "fence",
    "score",
    "watchmaker",
    "A watch with a name",
    "A gold watch, engraved inside with a name everyone in {here} knows.",
    [
      C(
        "Sell it far away",
        { check: { skill: "stealth" } },
        {
          pay: 1.4,
          name: 2,
          heat: 6,
          say: "Sold in another colony, engraving scraped.",
        },
        { heat: 14, seize: 0.4, say: "The man you sold it to knew the name." },
      ),
      C(
        "Sell it back to its owner",
        { check: { skill: "persuasion" } },
        { pay: 0.8, say: "'Found', and a reward." },
        { heat: 10, say: "He asked where you found it." },
      ),
    ],
  ),
  M(
    "smuggler",
    "score",
    "molasses-run",
    "French molasses",
    "A schooner from Martinique with molasses is lying off the inlet, and the duty on it would eat the profit.",
    [
      C(
        "Land it by night",
        { check: { skill: "seamanship" } },
        {
          pay: 1.4,
          name: 2,
          heat: 8,
          say: "Landed in the creek, rolled to the distillery by dawn.",
        },
        { heat: 12, seize: 0.35, say: "A riding officer on the beach." },
      ),
      C(
        "Land it at the customs house with a 'gift'",
        { cost: 2 },
        {
          pay: 0.8,
          heat: 2,
          say: "The collector looked at his gift, not the casks.",
        },
      ),
    ],
  ),
  M(
    "smuggler",
    "score",
    "dutch-tea",
    "Dutch tea",
    "A Dutch ship at sea off the capes has tea far cheaper than the East India Company's, and the town wants it.",
    [
      C(
        "Row out and meet her",
        { check: { dc: 1 } },
        {
          pay: 1.6,
          name: 3,
          heat: 10,
          say: "Chests of Dutch tea in every parlour.",
        },
        {
          heat: 14,
          seize: 0.4,
          health: -4,
          say: "A revenue cutter in the fog.",
        },
      ),
      C("Not this time", {}, { say: "Someone else rowed out." }),
    ],
  ),
  M(
    "smuggler",
    "score",
    "wreck-goods",
    "A convenient wreck",
    "A ship has 'wrecked' on the bar, and her cargo of wine is being 'salvaged' by everyone with a boat.",
    [
      C(
        "Salvage your share",
        { check: { skill: "seamanship" } },
        {
          pay: 1,
          name: 1,
          heat: 4,
          say: "A boatload of claret, nobody's in particular.",
        },
        { heat: 8, seize: 0.25, say: "The admiralty court wants to know." },
      ),
      C("Watch from the beach", {}, { say: "Half the town drunk for a week." }),
    ],
  ),
  M(
    "highwayman",
    "score",
    "fair-drovers",
    "Drovers home from the fair",
    "Drovers coming home from the cattle fair with the price of a hundred head, and stopping at every tavern on the way.",
    [
      C(
        "Wait at the last ford",
        { check: { skill: "fighting" } },
        {
          pay: 1.4,
          name: 2,
          heat: 10,
          say: "Three drovers, too drunk to fight. A fine night.",
        },
        {
          health: -8,
          heat: 12,
          seize: 0.3,
          say: "One of them was sober, and had a cudgel.",
        },
      ),
      C("Let them pass", {}, { say: "They sang all the way home." }),
    ],
  ),
  M(
    "highwayman",
    "score",
    "parson-gig",
    "The parson's gig",
    "The parson drives home from collecting the tithes with a strongbox under his seat.",
    [
      C(
        "Stop the gig",
        { check: { dc: 0 } },
        {
          pay: 1,
          name: 2,
          heat: 8,
          say: "The tithes, and a sermon on the road.",
        },
        {
          heat: 12,
          seize: 0.3,
          say: "The parson had a pistol, and used it badly, but loudly.",
        },
      ),
      C("Not the parson", {}, { stress: -2, say: "Even you have limits." }),
    ],
  ),
  M(
    "highwayman",
    "score",
    "night-coach",
    "The night coach",
    "The night coach carries the post and a banker's agent with a satchel he never lets go of.",
    [
      C(
        "Hold it up",
        { check: { dc: 2 } },
        {
          pay: 2,
          name: 4,
          heat: 16,
          say: "The satchel, and a story the gazettes will tell for a month.",
        },
        { health: -10, heat: 18, seize: 0.45, say: "The guard was a soldier." },
      ),
      C("Not tonight", {}, { say: "The coach rattled past." }),
    ],
  ),
  M(
    "counterfeiter",
    "score",
    "new-bills",
    "New bills of credit",
    "The colony has issued new bills of credit with a leaf printed on the back, nature-printed, impossible to copy, they say.",
    [
      C(
        "Copy the leaf",
        { check: { skill: "craft", dc: 2 } },
        {
          pay: 2,
          name: 3,
          heat: 10,
          say: "A leaf of your own. Impossible, they said.",
        },
        { heat: 12, seize: 0.35, say: "Your leaf was the wrong leaf." },
      ),
      C("Wait for an easier issue", {}, { say: "There'll be another issue." }),
    ],
  ),
  M(
    "counterfeiter",
    "score",
    "utterers",
    "A ring of utterers",
    "Three men want to pass your bills in the back counties, a third of the face for you, and no questions.",
    [
      C(
        "Supply them",
        { odds: 0.65 },
        {
          pay: 1.4,
          name: 2,
          heat: 8,
          say: "The back counties are full of your money.",
        },
        { heat: 14, seize: 0.4, say: "One of them was taken, and talked." },
      ),
      C("Too many mouths", {}, { say: "You keep your own counsel." }),
    ],
  ),
  M(
    "counterfeiter",
    "score",
    "spanish-dollars",
    "Spanish dollars",
    "Pieces of eight are the coin everyone trusts, and a little pewter in the silver goes a long way.",
    [
      C(
        "Cast a batch",
        { check: { skill: "craft" } },
        { pay: 1.2, name: 2, heat: 8, say: "Dollars that ring true, nearly." },
        { heat: 10, seize: 0.3, say: "They don't ring." },
      ),
      C("Stick to paper", {}, { say: "Paper's lighter." }),
    ],
  ),
  M(
    "pirate",
    "score",
    "logwood-ship",
    "A logwood ship",
    "A ship loaded with logwood from the Bay of Campeche, slow and deep, and her crew don't love her owners.",
    [
      C(
        "Take her",
        { check: { skill: "seamanship" } },
        {
          pay: 1.6,
          name: 3,
          heat: 10,
          say: "Taken without a shot. Half her crew joined you.",
        },
        { health: -8, heat: 12, say: "She had guns hidden under the logwood." },
      ),
      C("Let her go", {}, { say: "Logwood's heavy, and cheap." }),
    ],
    { when: south },
  ),
  M(
    "pirate",
    "score",
    "governor-gift",
    "A governor's friendship",
    "A governor of a small colony would look the other way about your sloop, for a share of the takings and a few casks of wine.",
    [
      C(
        "Pay him",
        { cost: 3, check: { skill: "persuasion" } },
        {
          pay: 1,
          name: 2,
          heat: -10,
          say: "A safe harbour, and a friend at the governor's table.",
        },
        { heat: 6, say: "He took the wine and sent for the navy." },
      ),
      C("Trust no governor", {}, { say: "Wise, probably." }),
    ],
  ),
  M(
    "pirate",
    "score",
    "slaver-taken",
    "A slaver taken",
    "A slave ship from the Guinea coast, her hold full of people in chains, lies becalmed under your guns.",
    [
      C(
        "Take her, and free those aboard",
        { check: { skill: "leadership" } },
        {
          renown: 2,
          name: 2,
          heat: 10,
          say: "The chains struck off. Some joined the crew; some you landed free on a quiet coast.",
        },
        {
          health: -8,
          heat: 12,
          say: "Her crew fought hard. You took her at a cost.",
        },
      ),
      C("Leave her", {}, { stress: 4, say: "She sailed on to Jamaica." }),
    ],
    { when: south },
  ),

  // ------------------------------------------------ the law's rounds
  M(
    ["watch", "thieftaker"],
    "collar",
    "pickpocket-fair",
    "A pickpocket at the fair",
    "A boy with very fast hands is working the crowd at the fair at {here}, and a farmer is shouting for the constable.",
    [
      C(
        "Run him down",
        { check: {} },
        {
          pay: 0.4,
          renown: 1,
          say: "Caught behind the gingerbread stall, three purses in his shirt.",
        },
        { health: -3, say: "Boys are fast." },
      ),
      C(
        "Take him home to his mother",
        {},
        { renown: 0.5, say: "His mother took it from there." },
      ),
    ],
  ),
  M(
    ["watch", "thieftaker"],
    "collar",
    "deserter-tavern",
    "A deserter in the tavern",
    "A man in a soldier's coat with the facings torn off is drinking in the back room, and there's a reward for deserters.",
    [
      C(
        "Take him",
        { check: { dc: 1 } },
        { pay: 0.8, renown: 1, say: "Taken quietly. The reward's yours." },
        { health: -8, say: "He fought like a soldier." },
      ),
      C(
        "Buy him a drink and let him go",
        {},
        { say: "He'll be in another colony by morning." },
      ),
    ],
  ),
  M(
    ["watch", "thieftaker"],
    "collar",
    "coiner-cellar",
    "A coiner's cellar",
    "A smell of hot metal from a cellar grating in the night, and the clink of a mould.",
    [
      C(
        "Go in",
        { check: { dc: 2 } },
        { pay: 1.2, renown: 2, say: "Coiners taken with their moulds hot." },
        { health: -12, say: "Molten pewter, thrown." },
      ),
      C(
        "Fetch help",
        {},
        { pay: 0.3, say: "By the time help came, the cellar was empty." },
      ),
    ],
  ),
  M(
    ["watch", "thieftaker"],
    "bribe",
    "brothel-keeper",
    "The house with shutters",
    "The keeper of a disorderly house sends you a purse every quarter-day, to keep the watch walking past.",
    [
      C(
        "Take it",
        { odds: 0.75 },
        { pay: 1, say: "The watch walks past." },
        {
          renown: -3,
          say: "A magistrate's son was found there. Questions were asked.",
        },
      ),
      C("Report it", {}, { renown: 1, say: "The house closed, for a month." }),
    ],
  ),
  M(
    ["watch", "thieftaker"],
    "bribe",
    "merchant-rival",
    "A merchant's request",
    "A merchant offers you five pounds to find something wrong with his rival's warehouse.",
    [
      C(
        "Find something",
        { odds: 0.6 },
        { pay: 1.2, say: "A fire hazard. The rival's fined." },
        { renown: -3, say: "The rival knew your price too." },
      ),
      C(
        "Refuse",
        {},
        { renown: 1, say: "The merchant found another constable." },
      ),
    ],
  ),
];
