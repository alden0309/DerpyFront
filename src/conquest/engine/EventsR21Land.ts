// EVENTS (r21): what happens in the fields and the woods, in a native town
// (to its own people and to guests), in open country, and to a stranger
// abroad: a colonist in a foreign colony's town, a guest in a native town,
// anyone far from home. So a stay on a Kalinago island or in Spanish Havana
// brings the things that happen there, not the tavern at home.

import { dateOf } from "./Calendar";
import { monthIn } from "./EventsR21Town";
import type { ConquestGame } from "./Game";
import type { LifeEventDef } from "./LifeEvents";
import { lifeIsNative, meOf } from "./LifeQueries";
import type { PDef } from "./PlaceKit";
import { placeFamily } from "./PlaceKit";
import type { Life } from "./Types";

const native = (g: ConquestGame, life: Life) => lifeIsNative(g.s, life);
const colonist = (g: ConquestGame, life: Life) => !lifeIsNative(g.s, life);
/** The town's people are of another nation than yours. */
const foreign = (g: ConquestGame, life: Life): boolean => {
  const me = meOf(g.s, life);
  const owner = g.s.provinces[life.prov]?.owner ?? -1;
  return !!me && owner >= 0 && owner !== me.nation;
};
const lat = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.prov]?.lat ?? 40;
const year = (g: ConquestGame) => dateOf(g.s.day).year;

// ---------------------------------------------------------------- the fields

const FIELDS: PDef[] = [
  {
    key: "fld-lark",
    where: "settled @fields inside",
    title: "A morning in the fields",
    body: "Dew on everything, a lark going up and up, and the smell of turned earth. For once nothing needs doing this minute.",
    choices: [
      {
        label: "Walk the boundary and look",
        win: {
          stress: -5,
          say: "You walked the whole round and came back in a better temper than you went out.",
        },
      },
      {
        label: "Lend a hand where it's wanted",
        check: ["farming", 4],
        win: {
          xp: { farming: 6 },
          stress: -2,
          say: "A row hoed, and a farmer who'll remember it.",
        },
        lose: { stress: 1, say: "You hoed up the beans." },
      },
    ],
  },
  {
    key: "fld-bull",
    where: "settled @fields",
    title: "A loose bull",
    body: "Somebody's bull has broken out and is standing in the lane between you and where you're going, pawing.",
    choices: [
      {
        label: "Drive him back",
        check: ["farming", 6],
        win: {
          xp: { farming: 4 },
          renown: 1,
          say: "Back through the gap with a stick and a lot of shouting. The farmer thanked you.",
        },
        lose: { health: -8, say: "He drove you instead, over a hedge." },
      },
      {
        label: "Go round by the long way",
        win: { say: "Half an hour round. The bull didn't care." },
      },
    ],
  },
  {
    key: "fld-harvest-hands",
    where: "town @fields",
    title: "Hands wanted at harvest",
    body: "A farmer's crying out for hands to bring the wheat in before the weather breaks: a shilling a day, meat and cider.",
    when: (g, life) =>
      (g.map.provinces[life.prov]?.lat ?? 40) > 0 && monthIn(6, 8)(g),
    choices: [
      {
        label: "Work a day with the reapers",
        check: ["farming", 5],
        win: {
          coins: 1,
          xp: { farming: 6 },
          stress: -2,
          say: "A shilling, a sunburn and a supper.",
        },
        lose: { coins: 1, health: -3, say: "A shilling and a sickle cut." },
      },
      {
        label: "Not your trade",
        win: { say: "The wheat came in without you." },
      },
    ],
  },
  {
    key: "fld-surveyor-stake",
    where: "town @fields",
    title: "A surveyor's stake",
    body: "A new stake has appeared in a field you've always walked through, and a man with a chain says the path is going to be fenced.",
    choices: [
      {
        label: "Argue for the old path",
        check: ["persuasion", 6],
        win: { renown: 1, say: "A stile in the fence. The path stays." },
        lose: { say: "The fence went up. You go round now." },
      },
      { label: "Let it be", win: { say: "Paths come and go." } },
    ],
  },
  {
    key: "fld-hail",
    where: "settled @fields",
    title: "A hailstorm",
    body: "Out of a clear afternoon a black cloud, and hail the size of musket balls bouncing off everything.",
    when: monthIn(4, 8),
    choices: [
      {
        label: "Get under a hay wagon",
        win: { say: "Bruised knuckles and a story." },
      },
      {
        label: "Run for the barn",
        odds: 0.6,
        win: { say: "Made it, laughing." },
        lose: { health: -3, say: "Made it, bruised." },
      },
    ],
  },
  {
    key: "fld-ploughing-match",
    where: "town @fields",
    title: "A ploughing match",
    body: "The farmers are holding a ploughing match on the common: straightest furrow wins a pewter mug and the right to be insufferable till next year.",
    when: monthIn(2, 4),
    choices: [
      {
        label: "Enter",
        check: ["farming", 7],
        win: {
          renown: 2,
          xp: { farming: 8 },
          say: "A furrow like a ruled line. The mug's on your mantel.",
        },
        lose: {
          stress: -2,
          say: "A furrow like a snake. Everybody cheered anyway.",
        },
      },
      {
        label: "Watch",
        win: { stress: -3, say: "The blacksmith won. He always does." },
      },
    ],
  },
];

// ---------------------------------------------------------------- the woods

const WOODS: PDef[] = [
  {
    key: "wds-bee-tree",
    where: "land @woods",
    title: "A bee tree",
    body: "Following the bees through the woods you find a hollow oak humming like a church organ, and honey running down the bark.",
    when: monthIn(6, 9),
    choices: [
      {
        label: "Smoke them out and take the honey",
        check: ["woodcraft", 6],
        win: {
          coins: 2,
          xp: { woodcraft: 6 },
          say: "Two buckets of honey and only three stings.",
        },
        lose: { health: -4, say: "The bees won. Your face is a sight." },
      },
      {
        label: "Mark the tree and come back",
        win: {
          xp: { woodcraft: 3 },
          say: "Your mark on the oak. Somebody else's mark beside it by the time you came back.",
        },
      },
    ],
  },
  {
    key: "wds-lost",
    where: "land @woods inside",
    title: "Turned round",
    body: "The path has gone, the sun's behind cloud, and every tree looks like the one you passed an hour ago.",
    choices: [
      {
        label: "Read the moss and the slope",
        check: ["woodcraft", 6],
        win: {
          xp: { woodcraft: 8 },
          say: "Downhill to water, water to the path. Home by dark.",
        },
        lose: { health: -3, stress: 4, say: "A cold night under a log." },
      },
      {
        label: "Follow a stream down",
        odds: 0.7,
        win: { say: "The stream led home, the long way." },
        lose: { stress: 4, say: "The stream led into a swamp." },
      },
    ],
  },
  {
    key: "wds-pigeons",
    where: "land @woods",
    title: "The pigeons are passing",
    body: "The passenger pigeons are passing over: the sky dark with them for hours, the noise like wind, branches breaking under the weight where they roost.",
    choices: [
      {
        label: "Net them for the pot and the market",
        check: ["woodcraft", 4],
        win: {
          coins: 1,
          xp: { woodcraft: 4 },
          say: "Pigeon pie for a week, and a barrel salted.",
        },
        lose: { say: "Feathers and nothing." },
      },
      {
        label: "Just watch them go",
        win: {
          stress: -4,
          say: "You'll tell your grandchildren. They won't believe you.",
        },
      },
    ],
  },
  {
    key: "wds-herbs",
    where: "land @woods",
    title: "Ginseng in the hollow",
    body: "In a shady hollow, five-fingered leaves with red berries: ginseng, which the traders buy for China at a price that seems mad.",
    choices: [
      {
        label: "Dig it carefully",
        check: ["woodcraft", 6],
        win: {
          coins: 3,
          xp: { woodcraft: 6, medicine: 2 },
          say: "Roots like little men. The trader paid in silver.",
        },
        lose: { say: "You broke the roots. Worthless." },
      },
      {
        label: "Leave it to grow",
        win: { say: "There'll be more next year, if nobody else finds it." },
      },
    ],
  },
  {
    key: "wds-snake",
    where: "land @woods inside",
    title: "A rattle in the leaves",
    body: "A dry rattle in the leaves just ahead of your foot.",
    when: monthIn(4, 9),
    choices: [
      {
        label: "Freeze, and step back slowly",
        check: ["woodcraft", 5],
        win: { xp: { woodcraft: 4 }, say: "It slid away under a rock." },
        lose: {
          health: -10,
          say: "It struck. A long walk home with your leg swelling.",
        },
      },
      {
        label: "Kill it with a stick",
        check: ["fighting", 5],
        win: { say: "A skin for a hatband." },
        lose: { health: -10, say: "It was quicker than the stick." },
      },
    ],
  },
  {
    key: "wds-hunters-camp",
    where: "land @woods",
    title: "A hunters' camp",
    body: "Smoke through the trees: a hunting camp, venison on the fire, and men who look up and watch you come.",
    choices: [
      {
        label: "Hail them and sit by their fire",
        check: ["persuasion", 5],
        win: {
          xp: { woodcraft: 6 },
          stress: -2,
          say: "Venison, news of the country, and a trail they showed you.",
        },
        lose: { say: "They were polite, and gave you nothing." },
      },
      {
        label: "Pass by",
        win: { say: "They watched you all the way out of sight." },
      },
    ],
  },
  {
    key: "wds-sugar-camp",
    where: "land @woods",
    title: "Sap running",
    body: "The maples are running, and a family's sugar camp is boiling sap in kettles over a long fire: they'd welcome another pair of hands.",
    when: monthIn(1, 3),
    choices: [
      {
        label: "Help with the boiling",
        win: {
          stress: -4,
          xp: { craft: 3 },
          say: "Sticky to the elbows, and a cake of sugar to take home.",
        },
      },
      {
        label: "Buy a cake of sugar",
        cost: 1,
        win: { stress: -2, say: "Sweet as anything from the islands." },
      },
    ],
  },
];

// ---------------------------------------------------------------- a native town (its own people and its guests)

const VILLAGE: PDef[] = [
  {
    key: "vil-guest-feast",
    where: "abroad native @village inside",
    title: "A guest's welcome",
    body: "You're a stranger here, and the custom is hospitality: a family has set food before you (corn soup, beans, fish) and is waiting to see if you'll eat.",
    choices: [
      {
        label: "Eat, and thank them in their tongue",
        check: ["persuasion", 5],
        win: {
          renown: 1,
          stress: -4,
          xp: { persuasion: 6 },
          say: "You mangled the words, and they laughed, and filled your bowl again.",
        },
        lose: {
          stress: -2,
          say: "You mangled the words. They were kind about it.",
        },
      },
      {
        label: "Give a present in return",
        cost: 1,
        win: {
          renown: 1,
          stress: -3,
          say: "A knife for the man of the house. You're welcome here now.",
        },
      },
      {
        label: "Eat quickly and go",
        win: { say: "They watched you go without a word." },
      },
    ],
  },
  {
    key: "vil-children-follow",
    where: "abroad native @village inside",
    title: "A tail of children",
    body: "Half the children of the town are following you about, laughing at your clothes and touching your buttons.",
    choices: [
      {
        label: "Give them a button each",
        cost: 1,
        win: {
          stress: -4,
          renown: 1,
          say: "A coat with no buttons, and thirty friends.",
        },
      },
      {
        label: "Play their game",
        win: {
          stress: -5,
          say: "You lost at every game. They loved you for it.",
        },
      },
      {
        label: "Shoo them off",
        win: { stress: 1, say: "They came back, louder." },
      },
    ],
  },
  {
    key: "vil-trade-goods",
    where: "abroad native @village,market",
    title: "Trading with the town",
    body: "People come to see what you have to trade and what you'll give for their baskets, mats and dried fish.",
    choices: [
      {
        label: "Trade fair and patient",
        check: ["trade", 5],
        win: {
          coins: 2,
          xp: { trade: 6 },
          say: "Baskets and smoked fish for your needles and thread. Both sides pleased.",
        },
        lose: { say: "Nobody wanted what you had." },
      },
      {
        label: "Give more than you get",
        cost: 1,
        win: {
          renown: 2,
          say: "They'll speak well of you to the next stranger.",
        },
      },
    ],
  },
  {
    key: "vil-elder-story",
    where: "native @village inside",
    title: "An old man's story",
    body: "An old man by the fire is telling how the world was made on the back of a turtle, and how the first woman fell from the sky. He tells it slowly, for the young ones.",
    choices: [
      {
        label: "Sit and listen",
        win: {
          stress: -5,
          xp: { faith: 3 },
          say: "You'll remember the turtle.",
        },
      },
      {
        label: "Ask him a question after",
        check: ["persuasion", 5],
        win: {
          xp: { letters: 4, faith: 3 },
          say: "He answered with another story, which was the answer.",
        },
        lose: { say: "He smiled and said nothing." },
      },
    ],
  },
  {
    key: "vil-lacrosse",
    where: "native @village,fields",
    title: "A game in the meadow",
    body: "The young men are playing the ball game in the meadow, a hundred a side, with bets on the edge of the field.",
    choices: [
      {
        label: "Play",
        check: ["fighting", 6],
        win: {
          renown: 1,
          stress: -4,
          say: "You scored once, by accident, and were carried off the field.",
        },
        lose: {
          health: -5,
          say: "A stick across the shins, and a cheerful apology.",
        },
      },
      {
        label: "Bet on the home side",
        cost: 1,
        odds: 0.55,
        win: { coins: 2, say: "They won. You won." },
        lose: { say: "They lost. So did your coin." },
      },
      {
        label: "Watch",
        win: { stress: -2, say: "Better than any play in London." },
      },
    ],
  },
  {
    key: "vil-canoe-help",
    where: "native @village,docks",
    title: "A canoe on the beach",
    body: "Men are hauling a great dugout canoe up the beach, and could use another back.",
    when: (g, life) => !!g.map.provinces[life.prov]?.coastal,
    choices: [
      {
        label: "Put your back into it",
        win: {
          stress: -2,
          renown: 1,
          say: "Hauled up above the tide line. They shared their fish.",
        },
      },
      { label: "Walk on", win: { say: "They managed." } },
    ],
  },
  {
    key: "vil-healer-offer",
    where: "native @village",
    title: "The healer's eye",
    body: "The town's healer looks at you, says you carry something heavy, and offers a sweat and a song.",
    when: (_g, life) => life.stress >= 30,
    choices: [
      {
        label: "Accept",
        win: {
          stress: -10,
          health: 3,
          say: "Steam, sage and singing. You slept like a child.",
        },
      },
      {
        label: "Decline politely",
        win: { say: "She shrugged. The offer stands." },
      },
    ],
  },
  {
    key: "vil-rum-quarrel",
    where: "native @village",
    title: "Rum in the town",
    body: "A trader has come with rum, and by evening there's shouting by the lodges, and a young man with a knife.",
    when: (g) => year(g) >= 1650,
    choices: [
      {
        label: "Help the elders calm it",
        check: ["persuasion", 6],
        win: { renown: 2, say: "The knife put away, the trader told to go." },
        lose: { health: -6, say: "The knife wasn't put away fast enough." },
      },
      {
        label: "Keep out of it",
        win: { stress: 3, say: "You heard it all night." },
      },
    ],
  },
  {
    key: "vil-language",
    where: "abroad native @village",
    title: "Learning the words",
    body: "A girl who has some English, or French, or Spanish, offers to teach you the words for things, pointing and laughing.",
    when: colonist,
    choices: [
      {
        label: "Learn what you can",
        check: ["letters", 4],
        win: {
          xp: { persuasion: 6, letters: 4 },
          stress: -2,
          say: "Water, fire, friend, enough. She says your accent is terrible.",
        },
        lose: { stress: -1, say: "The words won't stay." },
      },
      { label: "Thank her and go", win: { say: "A few words stuck anyway." } },
    ],
  },
  {
    key: "cfr-council-watch",
    where: "native @councilfire inside",
    title: "Words at the council fire",
    body: "The council is sitting, the pipe going round, and a speaker is talking about the colonists' new fort on the river. You may listen, if you're quiet.",
    choices: [
      {
        label: "Listen to the end",
        win: {
          xp: { persuasion: 6 },
          stress: -2,
          say: "Long speeches, long silences. You understood more than you expected.",
        },
      },
      {
        label: "Ask to speak",
        check: ["persuasion", 8],
        win: {
          renown: 2,
          xp: { persuasion: 8 },
          say: "They heard you out, and the old men nodded.",
        },
        lose: {
          renown: -1,
          say: "It wasn't your place, and they let you know.",
        },
      },
    ],
  },
  {
    key: "cfr-wampum-gift",
    where: "native @councilfire",
    title: "A string of wampum",
    body: "A clan mother sends you a short string of wampum, white beads: a greeting, and a reminder that greetings are returned.",
    when: native,
    choices: [
      {
        label: "Return it with a present",
        cost: 1,
        win: {
          renown: 2,
          say: "Your present was talked of. You're well thought of.",
        },
      },
      {
        label: "Return it with words",
        check: ["persuasion", 5],
        win: { renown: 1, say: "Good words, well said." },
        lose: { say: "Your words were thin." },
      },
    ],
  },
];

// ---------------------------------------------------------------- a stranger abroad (a foreign colony's town, or far from home)

const ABROAD: PDef[] = [
  {
    key: "abr-customs-house",
    where: "abroad town @docks,market",
    title: "The customs officer",
    body: "A customs officer of this colony wants to see your papers and the contents of your trunk, and has his own ideas about what's dutiable.",
    when: foreign,
    choices: [
      {
        label: "Show him everything, politely",
        check: ["persuasion", 6],
        win: {
          say: "He found nothing to tax and wished you good day in his own tongue.",
        },
        lose: {
          coins: -1,
          say: "He found something to tax. Your stockings, apparently.",
        },
      },
      {
        label: "Slip him a coin",
        cost: 1,
        win: { say: "Your trunk was never opened." },
      },
    ],
  },
  {
    key: "abr-mass",
    where: "abroad town @church inside",
    title: "Another church's service",
    body: "The church here is not your church: candles, incense, a liturgy in Latin, or a plain meeting house where the women sit apart. The people are watching to see what the stranger does.",
    when: foreign,
    choices: [
      {
        label: "Stand and kneel with them",
        win: {
          renown: 1,
          stress: -2,
          say: "You followed the others. An old woman smiled at you.",
        },
      },
      {
        label: "Stand at the back, respectfully",
        win: { say: "Nobody minded." },
      },
    ],
  },
  {
    key: "abr-stranger-lodging",
    where: "abroad town @tavern",
    title: "Lodgings for a stranger",
    body: "Your landlady says the room's wanted for a family come from the country, unless the stranger pays a little more.",
    choices: [
      {
        label: "Pay the little more",
        cost: 1,
        win: { say: "The room's yours. The family went to her sister's." },
      },
      {
        label: "Find other lodging",
        check: ["persuasion", 5],
        win: { stress: -1, say: "A widow by the church, cheaper and kinder." },
        lose: { stress: 3, say: "A room over a stable." },
      },
    ],
  },
  {
    key: "abr-foreign-tongue",
    where: "abroad town",
    title: "Lost in their tongue",
    body: "You asked for bread, and the baker's boy has brought you, with great pride, a live goose.",
    when: foreign,
    choices: [
      {
        label: "Laugh and try again",
        check: ["persuasion", 4],
        win: {
          stress: -3,
          xp: { persuasion: 4 },
          say: "Bread, at last, and the whole shop laughing with you.",
        },
        lose: { say: "You own a goose now." },
      },
      {
        label: "Pay for the goose",
        cost: 1,
        win: { stress: -2, say: "Roast goose for supper, and a story." },
      },
    ],
  },
  {
    key: "abr-spy-suspected",
    where: "abroad town",
    title: "Asked your business",
    body: "An officer of the garrison stops you in the street and asks, not unkindly, what a foreigner is doing in his town, and for whom.",
    when: (g, life) => foreign(g, life),
    choices: [
      {
        label: "Tell him plainly",
        check: ["persuasion", 6],
        win: { say: "He nodded, and told you to enjoy his town." },
        lose: { stress: 5, say: "He had you followed for a week." },
      },
      {
        label: "Show your purse and your papers",
        win: { stress: 2, say: "He looked at both a long time." },
      },
    ],
  },
  {
    key: "abr-letter-home",
    where: "abroad land",
    title: "A letter for home",
    body: "A traveller going your way home offers to carry a letter to your people.",
    choices: [
      {
        label: "Write a long one",
        check: ["letters", 4],
        win: {
          stress: -4,
          say: "Four pages: where you are, what it's like, that you're well.",
        },
        lose: {
          stress: -2,
          say: "Half a page and a blot. They'll know you're alive.",
        },
      },
      {
        label: "Send your greetings by word of mouth",
        win: { stress: -1, say: "He promised to call on them." },
      },
    ],
  },
  {
    key: "abr-homesick",
    where: "abroad land",
    title: "Homesick",
    body: "Something (a smell of woodsmoke, a song in the street, a dog like your old dog) puts you in mind of home, and the mood sits on you all day.",
    choices: [
      {
        label: "Let yourself feel it",
        win: { stress: 2, say: "A long evening thinking of home." },
      },
      {
        label: "Throw yourself into the day",
        check: ["leadership", 5],
        win: { stress: -3, say: "Busy, and better for it." },
        lose: { stress: 4, say: "Busy, and no better." },
      },
    ],
  },
  {
    key: "abr-feast-day",
    where: "abroad town",
    title: "A saint's day",
    body: "The town's patron saint has a feast today: a procession with a statue, fireworks, bulls in the square, and dancing that your minister at home would faint at.",
    when: (g, life) => foreign(g, life) && colonist(g, life),
    choices: [
      {
        label: "Join the feast",
        win: {
          stress: -6,
          say: "Fireworks, dancing, and a great deal of wine.",
        },
      },
      {
        label: "Watch from a balcony",
        win: { stress: -3, say: "A fine view of the bulls." },
      },
    ],
  },
  {
    key: "abr-merchant-friend",
    where: "abroad town @market",
    title: "A merchant of the place",
    body: "{name}, a merchant of the town, has taken an interest in where you're from and what your colony buys and sells.",
    who: (c) => !!c.role,
    choices: [
      {
        label: "Talk trade",
        check: ["trade", 6],
        win: {
          xp: { trade: 8 },
          like: 6,
          why: "Talked trade with me",
          say: "Prices, people and a standing invitation to dine.",
        },
        lose: { like: 2, say: "{He} knew far more than you." },
      },
      {
        label: "Dine with {him}",
        win: {
          like: 8,
          why: "Dined at my table",
          stress: -2,
          say: "A long dinner with {first} and {his} family.",
        },
      },
    ],
  },
  {
    key: "abr-tropic-sun",
    where: "abroad land",
    title: "The sun at noon",
    body: "The heat here is like an oven door left open, and you went out at noon in your wool coat like a fool.",
    when: (g, life) => lat(g, life) < 28,
    choices: [
      {
        label: "Learn the siesta",
        win: {
          stress: -3,
          say: "The shutters closed at noon, like everyone else's. Wise people.",
        },
      },
      {
        label: "Carry on",
        odds: 0.5,
        win: { say: "You survived." },
        lose: { health: -5, say: "Sunstroke. A day in a dark room." },
      },
    ],
  },
  {
    key: "abr-cold-north",
    where: "abroad land",
    title: "A northern winter",
    body: "The cold here is beyond anything at home: your breath freezes on your scarf, and the ink in the pot.",
    when: (g, life) => lat(g, life) > 44 && monthIn(11, 2)(g),
    choices: [
      {
        label: "Buy furs like the locals",
        cost: 2,
        win: {
          stress: -2,
          say: "A beaver hat and moccasins. You look ridiculous and feel warm.",
        },
      },
      {
        label: "Endure it",
        odds: 0.6,
        win: { say: "You endured it." },
        lose: { health: -5, say: "A chill on the chest." },
      },
    ],
  },
  {
    key: "abr-island-fruit",
    where: "abroad land",
    title: "Strange fruit",
    body: "A woman in the market is selling fruit you've never seen: something spiked, something hairy, something that smells terrible and, she swears, tastes like heaven.",
    when: (g, life) => lat(g, life) < 25,
    choices: [
      {
        label: "Try them all",
        odds: 0.7,
        win: { stress: -4, say: "The terrible one was heaven. She was right." },
        lose: { health: -2, say: "One of them disagreed with you." },
      },
      {
        label: "Just the pineapple",
        cost: 1,
        win: { stress: -3, say: "A pineapple. You see why kings want them." },
      },
    ],
  },
];

// ---------------------------------------------------------------- open country (staying where nobody lives)

const WILD: PDef[] = [
  {
    key: "wld-camp-night",
    where: "wild",
    title: "A night under the stars",
    body: "No town, no roof, a fire and the whole sky over you, and a whippoorwill that won't stop.",
    choices: [
      {
        label: "Lie and watch the stars",
        win: { stress: -5, say: "You counted shooting stars till you slept." },
      },
      {
        label: "Keep watch",
        check: ["woodcraft", 4],
        win: { xp: { woodcraft: 4 }, say: "Nothing came but a fox, curious." },
        lose: { stress: 3, say: "Every noise was a bear." },
      },
    ],
  },
  {
    key: "wld-wolves",
    where: "wild @woods",
    title: "Wolves at night",
    body: "Wolves howling close, then closer, and eyes at the edge of the firelight.",
    choices: [
      {
        label: "Build the fire up high",
        check: ["woodcraft", 5],
        win: { xp: { woodcraft: 4 }, say: "They circled till dawn and left." },
        lose: {
          health: -6,
          stress: 4,
          say: "One came in for your pack and got a firebrand, and your arm.",
        },
      },
      {
        label: "Fire a shot",
        odds: 0.7,
        win: { say: "They scattered." },
        lose: { stress: 5, say: "They scattered, and came back." },
      },
    ],
  },
  {
    key: "wld-spring",
    where: "wild",
    title: "A clear spring",
    body: "A spring of clear cold water bubbling up through white sand under a rock: nobody's, as far as you know.",
    choices: [
      {
        label: "Drink, and mark it on your map",
        win: {
          stress: -3,
          xp: { woodcraft: 4 },
          say: "The best water you've had in years.",
        },
      },
      {
        label: "Note it for a homestead",
        check: ["letters", 5],
        win: { xp: { letters: 4 }, say: "A good place for a cabin, one day." },
        lose: { say: "Your map's a mess." },
      },
    ],
  },
  {
    key: "wld-travellers",
    where: "wild",
    title: "Smoke on the ridge",
    body: "Smoke on the next ridge: somebody else is out here too.",
    choices: [
      {
        label: "Go and see",
        check: ["persuasion", 5],
        win: {
          xp: { woodcraft: 4 },
          stress: -2,
          say: "Hunters, friendly. Fresh meat and news.",
        },
        lose: { stress: 4, say: "Hunters, unfriendly. You left." },
      },
      {
        label: "Keep your distance",
        win: { say: "The smoke was gone by morning." },
      },
    ],
  },
];

export const LAND_PLACE_EVENTS: LifeEventDef[] = [
  ...placeFamily("fld", 45, FIELDS),
  ...placeFamily("wds", 45, WOODS),
  ...placeFamily(
    "vil",
    40,
    VILLAGE.filter((d) => d.key.startsWith("vil-")),
  ),
  ...placeFamily(
    "cfr",
    50,
    VILLAGE.filter((d) => d.key.startsWith("cfr-")),
  ),
  ...placeFamily("abr", 45, ABROAD),
  ...placeFamily("wld", 45, WILD),
];
