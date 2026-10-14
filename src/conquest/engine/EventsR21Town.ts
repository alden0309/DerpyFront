// EVENTS (r21): what happens in a colonial town's places: the tavern, your
// home, the docks, the church, the market, the governor's house, the
// workshops, the printing house, the apothecary and the fort. Most come
// only while you're in the place (go in, and the place's goings-on find
// you); the rest come wherever the place is, more readily while you're in
// it. None of them names another player, and nobody in them asks you for
// money they don't need.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import type { LifeEventDef } from "./LifeEvents";
import { meOf } from "./LifeQueries";
import type { PDef } from "./PlaceKit";
import { placeFamily } from "./PlaceKit";
import { ageOf } from "./Queries";
import type { Life } from "./Types";

/** Married to someone alive who isn't played. */
export const married = (g: ConquestGame, life: Life): boolean => {
  const me = meOf(g.s, life);
  const sp = me ? g.s.chars[me.spouse] : undefined;
  return !!sp?.alive && !g.s.lives.some((l) => l.c === sp.id);
};
/** Children under sixteen at home (not played). */
export const kidsAtHome = (g: ConquestGame, life: Life): boolean => {
  const me = meOf(g.s, life);
  return (me?.children ?? []).some((k) => {
    const c = g.s.chars[k];
    return (
      !!c?.alive &&
      !c.abroad &&
      ageOf(g.s, c) < 16 &&
      !g.s.lives.some((l) => l.c === c.id)
    );
  });
};
/** Months, 0 for January, `from` to `to` inclusive (wrapping the year). */
export const monthIn =
  (from: number, to: number) =>
  (g: ConquestGame): boolean => {
    const m = dateOf(g.s.day).month;
    return from <= to ? m >= from && m <= to : m >= from || m <= to;
  };

// ---------------------------------------------------------------- the tavern

const TAVERN: PDef[] = [
  {
    key: "tvn-fiddler",
    where: "town @tavern inside",
    title: "A fiddle in the corner",
    body: "A blind fiddler has come in out of the rain and is tuning up in the corner, and the room has gone quiet to see what he's worth.",
    choices: [
      {
        label: "Call for a jig and stand him a pot",
        cost: 1,
        win: {
          stress: -6,
          renown: 1,
          say: "He played till midnight, and the whole room danced, even the innkeeper's dog.",
        },
      },
      {
        label: "Sing with him",
        check: ["persuasion", 6],
        win: {
          stress: -5,
          renown: 1,
          xp: { persuasion: 6 },
          say: "You and the fiddler, 'The Bold Grenadier'. The room joined the chorus.",
        },
        lose: {
          stress: 2,
          say: "You started in the wrong key and stayed there.",
        },
      },
      {
        label: "Finish your pot and go",
        win: { say: "He was good. You heard it from the street." },
      },
    ],
  },
  {
    key: "tvn-newspaper",
    where: "town @tavern inside",
    title: "Reading the news aloud",
    body: "The gazette's come in, and half the taproom can't read. They look at you, because you're nearest the candle.",
    choices: [
      {
        label: "Read it out, with feeling",
        check: ["letters", 5],
        win: {
          renown: 1,
          xp: { letters: 6 },
          stress: -2,
          say: "The King's speech, a shipwreck and an advertisement for a runaway horse. They cheered the horse.",
        },
        lose: { say: "You stumbled on 'plenipotentiary'. Somebody laughed." },
      },
      {
        label: "Read only the shipping",
        win: {
          xp: { trade: 4 },
          say: "Who's in, who's out, who's lost. The merchants listened hardest.",
        },
      },
      { label: "Pass it on", win: { say: "The innkeeper read it, badly." } },
    ],
  },
  {
    key: "tvn-wager-arm",
    where: "town @tavern inside",
    title: "Arm against arm",
    body: "A big carter has his elbow on the table and a shilling beside it, and he's beating every man in the room at arm-wrestling. Now he's looking at you.",
    who: (c) => !c.female,
    choices: [
      {
        label: "Take him on",
        check: ["fighting", 7],
        win: {
          coins: 1,
          renown: 1,
          say: "Down he went. He laughed and bought you a pot.",
        },
        lose: { coins: -1, health: -2, say: "Your wrist will remember him." },
      },
      {
        label: "Bet on him against the next man",
        odds: 0.6,
        win: { coins: 1, say: "He won, and so did you." },
        lose: { coins: -1, say: "He lost. So did you." },
      },
      { label: "Laugh it off", win: { say: "He found another arm." } },
    ],
  },
  {
    key: "tvn-stranger-news",
    where: "town @tavern",
    title: "A stranger from the back country",
    body: "A lean man in a hunting shirt has come down from the back settlements with news: new families on the creeks, a mill being built, and land going cheap if you know where.",
    choices: [
      {
        label: "Buy him supper and listen",
        cost: 1,
        win: {
          xp: { trade: 6, woodcraft: 4 },
          say: "You know more of the back country than anyone in town now.",
        },
      },
      {
        label: "Ask where the land is",
        check: ["persuasion", 6],
        win: {
          xp: { trade: 8 },
          coins: 2,
          say: "A tip worth having: you sold it on to a land jobber.",
        },
        lose: { say: "He went vague on the details." },
      },
      { label: "Let him be", win: { say: "He ate alone and left at dawn." } },
    ],
  },
  {
    key: "tvn-toast-king",
    where: "town ours @tavern inside",
    title: "A toast",
    body: "A half-pay officer stands on a bench and gives a toast to the King, and the whole room stands with him except one man by the fire.",
    choices: [
      {
        label: "Make the man by the fire stand",
        check: ["leadership", 7],
        win: { renown: 1, favor: 2, say: "He stood. Slowly." },
        lose: {
          health: -3,
          say: "He didn't, and there were words, and a chair.",
        },
      },
      {
        label: "Drink, and sit down quietly",
        win: { say: "The man by the fire nodded to you as he left." },
      },
      {
        label: "Raise a toast of your own: to the colony",
        odds: 0.5,
        win: {
          renown: 2,
          say: "The room drank to that, too. Even the officer.",
        },
        lose: { favor: -2, say: "The officer will remember your face." },
      },
    ],
    when: (g) => dateOf(g.s.day).year < 1776,
  },
  {
    key: "tvn-lost-letter",
    where: "town @tavern inside",
    title: "A letter left behind",
    body: "A traveller has left a letter on the bench, sealed, addressed to a merchant in the next colony, and the coach has gone.",
    choices: [
      {
        label: "Send it on by the post",
        cost: 1,
        win: {
          renown: 1,
          gain: "honest",
          say: "It reached him. He wrote to thank you, and to say it held a bill for fifty pounds.",
        },
      },
      {
        label: "Open it",
        check: ["stealth", 6],
        win: {
          xp: { stealth: 6 },
          coins: 2,
          say: "Market news worth knowing. You resealed it neatly and sent it on.",
        },
        lose: { renown: -2, say: "The seal cracked and the innkeeper saw." },
      },
      {
        label: "Leave it with the innkeeper",
        win: { say: "It's on the shelf behind the bar, with the lost gloves." },
      },
    ],
  },
  {
    key: "tvn-recruiting-sailor",
    where: "town @tavern inside",
    title: "A sailor's yarn",
    body: "An old sailor with a wooden leg is telling the room about the time he sailed round the Horn, and a mermaid, and the Spanish admiral's daughter. He's getting thirstier with every chapter.",
    choices: [
      {
        label: "Stand him a pot for the next chapter",
        cost: 1,
        win: {
          stress: -5,
          xp: { seamanship: 4 },
          say: "The mermaid had a parrot, it turns out. You learned a good deal about rigging along the way.",
        },
      },
      {
        label: "Catch him in a lie",
        check: ["letters", 6],
        win: {
          renown: 1,
          say: "The Horn is south, not north. The room roared. So did he.",
        },
        lose: { renown: -1, say: "He caught you instead." },
      },
    ],
  },
  {
    key: "tvn-cards-cheat",
    where: "town @tavern inside",
    title: "Whist with a stranger",
    body: "A pleasant stranger is looking for a fourth at whist, a penny a point. His partner keeps touching his ear.",
    choices: [
      {
        label: "Sit in, and watch the ear",
        check: ["stealth", 7],
        win: {
          coins: 3,
          xp: { stealth: 6 },
          say: "Ear for hearts, chin for spades. You played against the signals and took their money.",
        },
        lose: {
          coins: -3,
          say: "You never worked out the ear. They never stopped touching it.",
        },
      },
      {
        label: "Tell the innkeeper",
        win: {
          renown: 1,
          say: "They left in a hurry. The innkeeper owes you one.",
        },
      },
      {
        label: "Not tonight",
        win: { say: "Somebody else made the fourth, and lost." },
      },
    ],
  },
  {
    key: "tvn-election-talk",
    where: "town ours @tavern",
    title: "Talk of the election",
    body: "The talk in the taproom is all of the next election: who's buying the punch, who's in whose pocket, and who'd be a better man for the assembly than either of them.",
    choices: [
      {
        label: "Speak up for your own man",
        check: ["persuasion", 7],
        win: {
          renown: 1,
          xp: { persuasion: 8 },
          say: "A few votes moved, maybe. The room listened, anyway.",
        },
        lose: { renown: -1, say: "You were shouted down, cheerfully." },
      },
      {
        label: "Listen and say nothing",
        win: { xp: { stealth: 4 }, say: "You know who's for whom, now." },
      },
    ],
  },
  {
    key: "tvn-dog",
    where: "town @tavern inside",
    title: "The turnspit dog",
    body: "The innkeeper's turnspit dog has escaped his wheel by the kitchen fire and is under your table, trembling, with the cook coming after him with a ladle.",
    choices: [
      {
        label: "Hide him under your coat",
        odds: 0.6,
        win: {
          stress: -4,
          say: "The cook went past. The dog licked your hand, and then went back to his wheel of his own accord.",
        },
        lose: { stress: 1, say: "The cook found him, and you, and the ladle." },
      },
      {
        label: "Buy the dog a rest",
        cost: 1,
        win: {
          stress: -3,
          renown: 1,
          say: "A penny for the boy to turn the spit by hand. The dog slept by your feet.",
        },
      },
      {
        label: "Hand him over",
        win: { say: "Back on his wheel, poor beast." },
      },
    ],
  },
  {
    key: "tvn-quarrel-gentlemen",
    where: "town @tavern inside",
    title: "Gentlemen at words",
    body: "Two young gentlemen have quarrelled over a horse race and one has called the other a liar. Swords are not drawn yet. Everybody is looking for someone else to do something.",
    choices: [
      {
        label: "Make peace between them",
        check: ["persuasion", 8],
        win: {
          renown: 2,
          xp: { persuasion: 8 },
          say: "Both of them apologised, and both think the other did first. Peace.",
        },
        lose: {
          renown: -1,
          say: "They told you to mind your business, in chorus.",
        },
      },
      {
        label: "Offer to hold their coats",
        win: {
          stress: -2,
          say: "They laughed, which was the point. The swords stayed put.",
        },
      },
      {
        label: "Leave before the blood",
        win: {
          say: "You heard next day it was settled with an apology. Probably.",
        },
      },
    ],
  },
  {
    key: "tvn-tab",
    where: "town @tavern inside",
    title: "Your score on the slate",
    body: "The innkeeper has chalked up what you've run up on the slate behind the bar, where everyone can read it, and it's longer than you'd thought.",
    when: (_g, life) => life.purse < 12,
    choices: [
      {
        label: "Pay it off",
        cost: 2,
        win: {
          renown: 1,
          say: "Wiped clean with a wet cloth, and a nod from the innkeeper.",
        },
      },
      {
        label: "Charm him into waiting",
        check: ["persuasion", 6],
        win: {
          stress: -2,
          say: "Till quarter-day. He likes you, against his better judgement.",
        },
        lose: { renown: -1, stress: 3, say: "He read it out." },
      },
    ],
  },
];

// ---------------------------------------------------------------- home

const HOME: PDef[] = [
  {
    key: "hom-supper",
    where: "home @home inside",
    title: "Supper",
    body: "Supper's on the table, the fire's drawing well for once, and nobody has anywhere to be.",
    when: married,
    choices: [
      {
        label: "Stay at the table and talk",
        win: {
          stress: -6,
          say: "An evening of nothing in particular. The best kind.",
        },
      },
      {
        label: "Read aloud after supper",
        check: ["letters", 4],
        win: {
          stress: -5,
          xp: { letters: 4 },
          say: "A chapter of Robinson Crusoe. Everyone wanted another.",
        },
        lose: { stress: -2, say: "Everyone fell asleep, you first." },
      },
      {
        label: "Go over the accounts",
        win: {
          xp: { trade: 5 },
          stress: 1,
          say: "The accounts balanced. The supper went cold.",
        },
      },
    ],
  },
  {
    key: "hom-chimney",
    where: "home has:house @home",
    title: "The chimney smokes",
    body: "The chimney has taken to smoking every time the wind's in the east, and the kitchen's like a smokehouse.",
    choices: [
      {
        label: "Climb up and see",
        check: ["craft", 6],
        win: {
          xp: { craft: 6 },
          say: "A jackdaw's nest. Out, and the fire draws.",
        },
        lose: {
          health: -4,
          say: "Soot in your eyes, and a slate off the roof.",
        },
      },
      {
        label: "Have a sweep in",
        cost: 1,
        win: { say: "A small boy and a large brush. Clean as a whistle." },
      },
      {
        label: "Live with it",
        win: { stress: 3, say: "Everything tastes of smoke. Even the tea." },
      },
    ],
  },
  {
    key: "hom-neighbour-hens",
    where: "home @home",
    title: "The neighbour's hens",
    body: "Your neighbour's hens are laying in your woodpile. Your neighbour says that makes them your eggs. Your neighbour's wife says it doesn't.",
    who: (c) => c.female,
    choices: [
      {
        label: "Return every egg to {first}",
        win: {
          like: 6,
          why: "Brought back my hens' eggs",
          say: "{first} sent over a custard made of them.",
        },
      },
      {
        label: "Keep them, and say so",
        win: {
          like: -4,
          why: "Kept my hens' eggs",
          coins: 1,
          say: "Eggs for breakfast all week, and a cool nod in the lane.",
        },
      },
      {
        label: "Mend the fence so they can't",
        check: ["craft", 4],
        win: {
          xp: { craft: 4 },
          say: "No more hens. No more eggs. No more quarrel.",
        },
        lose: { say: "The hens found the gap you missed." },
      },
    ],
  },
  {
    key: "hom-child-lesson",
    where: "home @home",
    title: "Teaching the little ones",
    body: "The children are underfoot on a wet day, quarrelling over a hornbook and a wooden horse.",
    when: kidsAtHome,
    choices: [
      {
        label: "Teach them their letters",
        check: ["letters", 4],
        win: {
          stress: -4,
          xp: { letters: 4 },
          say: "A, B, C, and a game made of it. The youngest knows his name.",
        },
        lose: { stress: 3, say: "Tears, and a torn hornbook." },
      },
      {
        label: "Make them a kite",
        check: ["craft", 4],
        win: {
          stress: -6,
          say: "Paper, sticks and string. It flew, in the rain.",
        },
        lose: { stress: -2, say: "It didn't fly. They loved it anyway." },
      },
      {
        label: "Send them to their room",
        win: { stress: 2, say: "Peace, of a sort." },
      },
    ],
  },
  {
    key: "hom-letter-old-country",
    where: "home @home",
    title: "A letter from across the water",
    body: "A letter from the old country, months on the way: your cousins, the harvest there, a death you'd half expected, and a question about whether there's room for one of them over here.",
    choices: [
      {
        label: "Write back and offer a place",
        win: {
          stress: 2,
          renown: 1,
          say: "You wrote that there's always room. He'll come in the spring, perhaps.",
        },
      },
      {
        label: "Write back with news, and no promises",
        check: ["letters", 5],
        win: {
          stress: -3,
          xp: { letters: 4 },
          say: "Three pages of news, carefully kind.",
        },
        lose: { say: "One page, and a blot." },
      },
      {
        label: "Put it away for another day",
        win: { stress: 2, say: "It's on the mantel. It looks at you." },
      },
    ],
  },
  {
    key: "hom-servant-sweetheart",
    where: "home has:house @home",
    title: "The maid's sweetheart",
    body: "The girl who helps in the house has a sweetheart who's been seen climbing the back fence after dark.",
    choices: [
      {
        label: "Ask him in through the front door",
        win: {
          stress: -2,
          renown: 1,
          say: "He came, hat in hand, and turned out to be the cooper's journeyman. They'll marry at harvest.",
        },
      },
      {
        label: "Put a stop to it",
        win: {
          stress: 2,
          say: "The back fence has a new rail. The girl has a long face.",
        },
      },
      {
        label: "Pretend not to know",
        win: { say: "Everyone pretends. It's a happy house." },
      },
    ],
  },
  {
    key: "hom-garden",
    where: "home @home",
    title: "The kitchen garden",
    body: "The kitchen garden's run to weeds while you've been busy, and the seed peddler's at the door with peas, cabbages and a packet of something called 'love apples'.",
    when: monthIn(2, 5),
    choices: [
      {
        label: "Dig and sow a day",
        check: ["farming", 4],
        win: {
          stress: -5,
          health: 2,
          xp: { farming: 6 },
          say: "Peas in rows, cabbages, and the love apples by the wall to see what they do.",
        },
        lose: { stress: -2, say: "The rabbits had the peas." },
      },
      {
        label: "Buy seeds and leave it to the household",
        cost: 1,
        win: {
          stress: -2,
          say: "The household dug, you watched. A fine garden.",
        },
      },
    ],
  },
  {
    key: "hom-old-friend",
    where: "home @home",
    title: "An old friend calls",
    body: "{name}, whom you haven't really talked to in years, is at the door with a bottle and a long face. {He} just wanted, {he} says, to sit with somebody.",
    who: (c, g) => ageOf(g.s, c) >= 30,
    choices: [
      {
        label: "Sit with {him} all evening",
        win: {
          like: 8,
          why: "Sat with me when I needed it",
          stress: 2,
          say: "A long evening, a long story, and {first} left lighter than {he} came.",
        },
      },
      {
        label: "Give {him} an hour",
        win: {
          like: 3,
          why: "Made time for me",
          say: "An hour, and a promise to do it again.",
        },
      },
      {
        label: "Make an excuse",
        win: {
          like: -3,
          why: "Too busy for an old friend",
          say: "{He} went away with the bottle still full.",
        },
      },
    ],
  },
  {
    key: "hom-rats",
    where: "home @home",
    title: "Rats in the cellar",
    body: "Something has been at the stores in the cellar: the cheese gnawed, the flour sacks holed, and droppings everywhere.",
    choices: [
      {
        label: "Get a terrier from the ratcatcher",
        cost: 1,
        win: {
          stress: -3,
          say: "Thirty rats in a morning. The terrier's staying.",
        },
      },
      {
        label: "Set traps yourself",
        check: ["woodcraft", 4],
        win: { xp: { woodcraft: 4 }, say: "Rats by the bucketful." },
        lose: { coins: -1, say: "The rats ate the bait and laughed." },
      },
    ],
  },
  {
    key: "hom-wedding-ring",
    where: "home @home inside",
    title: "Your wedding day, remembered",
    body: "Clearing a drawer you find the ribbon from your wedding, faded, and you stand holding it a while.",
    when: married,
    choices: [
      {
        label: "Give it back to your husband or wife",
        win: {
          stress: -6,
          say: "A laugh, then a long look, then a kiss you didn't expect.",
        },
      },
      {
        label: "Put it back in the drawer",
        win: { stress: -2, say: "Some things are better kept." },
      },
    ],
  },
  {
    key: "hom-fever-child",
    where: "home @home",
    title: "A hot forehead",
    body: "One of the children has a hot forehead and a cough that sounds like a barking dog, and won't let go of your hand.",
    when: kidsAtHome,
    choices: [
      {
        label: "Steam kettle and sit up all night",
        check: ["medicine", 5],
        win: {
          stress: 3,
          xp: { medicine: 8 },
          say: "The croup broke by morning. You slept in the chair.",
        },
        lose: {
          stress: 8,
          health: -2,
          say: "Three nights of it. Better now, both of you, more or less.",
        },
      },
      {
        label: "Send for the doctor",
        cost: 2,
        win: {
          stress: -2,
          say: "A powder, a plaster and a bill. Better by Sunday.",
        },
      },
    ],
  },
  {
    key: "hom-portrait-family",
    where: "home has:house @home",
    title: "A likeness of the family",
    body: "A travelling limner offers to paint the whole family in one picture: the house in the background, the dog in front, everyone looking prosperous.",
    when: (g, life) => life.purse >= 15 && married(g, life),
    choices: [
      {
        label: "Sit for it",
        cost: 6,
        win: {
          renown: 2,
          stress: -3,
          say: "Everyone looks prosperous, and slightly alarmed. It hangs over the mantel.",
        },
      },
      {
        label: "Just the children",
        cost: 3,
        win: {
          stress: -2,
          say: "Three stiff little figures with a lamb. You love it.",
        },
      },
      {
        label: "Not this year",
        win: { say: "The limner went on to the next house." },
      },
    ],
  },
];

// ---------------------------------------------------------------- the docks

const DOCKS: PDef[] = [
  {
    key: "dck-cargo-drop",
    where: "settled @docks inside",
    title: "A sling gives way",
    body: "A sling of casks has slipped from the yardarm of a brig unloading at the wharf, and a cask is rolling down the gangplank straight at a boy with a basket of fish.",
    choices: [
      {
        label: "Grab the boy",
        check: ["fighting", 6],
        win: {
          renown: 1,
          say: "Boy and fish saved. The cask went in the harbour.",
        },
        lose: { health: -6, say: "Boy saved. The cask got your shin." },
      },
      { label: "Shout", win: { say: "He jumped. The fish didn't." } },
    ],
  },
  {
    key: "dck-ship-launch",
    where: "town @docks",
    title: "A launching",
    body: "A new ship is going down the ways today, flags on every rope, a minister to bless her, rum for the shipwrights, and the whole town out to watch.",
    choices: [
      {
        label: "Watch, and drink her health",
        win: {
          stress: -5,
          say: "She slid in with a roar and sat on the water like a duck. A good omen.",
        },
      },
      {
        label: "Take a share in her first voyage",
        cost: 5,
        odds: 0.75,
        win: {
          coins: 9,
          say: "She came home from the islands with sugar and a profit.",
        },
        lose: {
          say: "She was taken by a privateer on her first voyage. Bad luck in a fine ship.",
        },
      },
    ],
  },
  {
    key: "dck-seaman-sick",
    where: "settled @docks",
    title: "A seaman left ashore",
    body: "A ship sailed on the tide and left a seaman ashore with a fever, no money and no English. He's lying under the warehouse eaves.",
    choices: [
      {
        label: "Pay for a bed and a nurse",
        cost: 2,
        win: {
          renown: 1,
          stress: -2,
          gain: "generous",
          say: "He mended, and shipped out on the next Danish ship, and kissed both your cheeks.",
        },
      },
      {
        label: "Fetch the overseers of the poor",
        win: {
          say: "They took him to the almshouse, where he lived or didn't.",
        },
      },
      {
        label: "Walk on",
        win: { stress: 3, say: "You think about him later." },
      },
    ],
  },
  {
    key: "dck-strange-cargo",
    where: "town @docks inside",
    title: "A strange cargo",
    body: "A ship from the Mediterranean is unloading crates that squawk: a menagerie bound for a showman in Philadelphia, a monkey loose on the rigging, and the captain swearing in four languages.",
    choices: [
      {
        label: "Help catch the monkey",
        check: ["woodcraft", 6],
        win: {
          coins: 1,
          stress: -4,
          say: "Caught on the bowsprit with an orange. The captain paid you a shilling and a curse.",
        },
        lose: { stress: 2, say: "The monkey caught you, and kept your hat." },
      },
      {
        label: "Watch the fun",
        win: {
          stress: -3,
          say: "Half the wharf chasing a monkey. Better than a play.",
        },
      },
    ],
  },
  {
    key: "dck-press-warning",
    where: "town @docks inside",
    title: "Warning of the press",
    body: "A ship's boy runs along the wharf crying that a man-of-war's boat is coming in with the press gang, and seamen are bolting for the alleys.",
    when: (g, life) => !meOf(g.s, life)?.female,
    choices: [
      {
        label: "Hide a young sailor in a warehouse",
        check: ["stealth", 6],
        win: {
          renown: 1,
          say: "The gang went by. The boy bought you a pot that night.",
        },
        lose: {
          health: -3,
          say: "The gang found him. They pushed you into a stack of barrels.",
        },
      },
      {
        label: "Get off the wharf yourself",
        win: { say: "You were up the hill before the boat touched." },
      },
    ],
  },
  {
    key: "dck-fish-cheap",
    where: "settled @docks inside",
    title: "A glut of fish",
    body: "The boats came in loaded and the fish are going for nothing on the wharf before they spoil.",
    choices: [
      {
        label: "Buy a barrel and salt it",
        cost: 1,
        check: ["craft", 4],
        win: {
          coins: 3,
          xp: { craft: 4 },
          say: "Salted, sold in the spring for three times the cost.",
        },
        lose: { say: "It went off. Your neighbours know." },
      },
      {
        label: "Buy supper for the house",
        win: { stress: -2, say: "Fish for a week. Everyone's sick of fish." },
      },
    ],
  },
  {
    key: "dck-captain-passenger",
    where: "town @docks",
    title: "A captain short of a passenger",
    body: "A captain bound along the coast says his best cabin is empty, and he'd rather have somebody in it to dine with than nobody.",
    choices: [
      {
        label: "Dine with him tonight",
        win: {
          xp: { seamanship: 4, trade: 4 },
          stress: -3,
          say: "Fish, Madeira, and two hours of every port from here to Curaçao.",
        },
      },
      {
        label: "Ask what he carries",
        check: ["trade", 6],
        win: {
          xp: { trade: 8 },
          say: "He told you more than he meant to about the price of flour in the islands.",
        },
        lose: { say: "He was a close one." },
      },
    ],
  },
  {
    key: "dck-drowned",
    where: "settled @docks",
    title: "A man in the water",
    body: "A drunk has fallen between a ship and the wharf, and the ship is swinging in on the tide.",
    choices: [
      {
        label: "Go in after him",
        check: ["seamanship", 6],
        win: {
          renown: 2,
          say: "Out before the hull closed. He's sober now, and very grateful.",
        },
        lose: {
          health: -8,
          say: "Out, both of you, and you with a crushed hand.",
        },
      },
      {
        label: "Throw a line",
        odds: 0.7,
        win: { renown: 1, say: "He caught it. Hauled out, sputtering." },
        lose: { stress: 6, say: "He didn't catch it." },
      },
    ],
  },
  {
    key: "dck-old-shipmate",
    where: "town @docks",
    title: "A face from a ship",
    body: "{name}, a seaman with a gold ring in one ear, swears you were shipmates once, or at least drank in the same house in Kingston. {He} wants to talk old times.",
    who: (c) => !c.female,
    choices: [
      {
        label: "Swap yarns",
        win: {
          like: 5,
          why: "Yarned with me on the wharf",
          stress: -3,
          say: "You were never in Kingston. It didn't matter.",
        },
      },
      {
        label: "Ask what {he} knows of the ships in port",
        check: ["persuasion", 5],
        win: {
          xp: { seamanship: 4, trade: 4 },
          say: "Which captain pays, which drinks, which is a brute.",
        },
        lose: { say: "{He} knows less than you." },
      },
    ],
  },
];

// ---------------------------------------------------------------- the church

const CHURCH: PDef[] = [
  {
    key: "chu-sermon-long",
    where: "town @church inside",
    title: "The long sermon",
    body: "The sermon has reached its fifteenthly and the hourglass on the pulpit has been turned twice. The man beside you is snoring.",
    choices: [
      {
        label: "Listen properly",
        check: ["faith", 5],
        win: {
          xp: { faith: 6 },
          stress: -3,
          say: "Somewhere about the twelfthly, it began to make sense.",
        },
        lose: { stress: 2, say: "You lost the thread at the ninthly." },
      },
      {
        label: "Nudge the snorer",
        odds: 0.7,
        win: {
          stress: -2,
          say: "He snorted, sat up and said 'Amen', loudly. The minister glared at him.",
        },
        lose: { renown: -1, say: "He woke and said something unrepeatable." },
      },
    ],
  },
  {
    key: "chu-poor-box",
    where: "town @church",
    title: "The poor box",
    body: "The churchwardens are asking for gifts for the poor of the parish: a hard winter, and three widows with children and no wood.",
    choices: [
      {
        label: "Give generously",
        cost: 3,
        win: {
          renown: 2,
          xp: { faith: 4 },
          say: "Three cords of wood for three widows.",
        },
      },
      {
        label: "Give a little",
        cost: 1,
        win: { renown: 1, say: "Every little helps, they say." },
      },
      {
        label: "Give nothing",
        win: { say: "The churchwarden has a good memory." },
      },
    ],
    when: monthIn(10, 2),
  },
  {
    key: "chu-gallery-singing",
    where: "town @church inside",
    title: "The new singing",
    body: "The young people in the gallery want to sing the psalms by note, in parts, instead of lining them out after the deacon. Half the old people are furious.",
    choices: [
      {
        label: "Join the singers",
        check: ["persuasion", 5],
        win: {
          stress: -4,
          renown: 1,
          say: "Four parts and a pitch pipe. Even the deacon hummed.",
        },
        lose: { renown: -1, say: "The old people noted your name." },
      },
      {
        label: "Side with the old way",
        win: {
          say: "The deacon lined out the psalm, slow and loud, as God intended.",
        },
      },
    ],
  },
  {
    key: "chu-wedding-banns",
    where: "town @church inside",
    title: "The banns",
    body: "The minister reads the banns for {name} and the cooper's daughter, and asks if anyone knows just cause or impediment. There's a pause. A long one.",
    who: (c, g) => !c.female && ageOf(g.s, c) <= 35,
    choices: [
      {
        label: "Clear your throat and say nothing",
        win: {
          stress: -2,
          say: "The pause ended. They'll be married in three weeks.",
        },
      },
      {
        label: "Wish {first} joy after the service",
        win: {
          like: 5,
          why: "Wished me joy at the banns",
          say: "{He} blushed to the ears.",
        },
      },
    ],
  },
  {
    key: "chu-catechist",
    where: "town @church",
    title: "Teaching the catechism",
    body: "The minister asks if you'd take a class of the parish children through their catechism on Sunday afternoons.",
    choices: [
      {
        label: "Take the class",
        check: ["letters", 5],
        win: {
          renown: 1,
          xp: { faith: 6, letters: 4 },
          say: "A dozen children who can say who made them, and why.",
        },
        lose: {
          stress: 3,
          say: "A dozen children who can say the Creed backwards, on purpose.",
        },
      },
      {
        label: "Beg off politely",
        win: { say: "The minister found another." },
      },
    ],
  },
  {
    key: "chu-gravestone",
    where: "town @church inside",
    title: "The churchyard",
    body: "Walking through the churchyard you come on a sunken stone, the name nearly gone: a child, two years old, a hundred years ago, 'Here lies a bud'.",
    choices: [
      {
        label: "Clear the moss and stand a while",
        win: {
          stress: -4,
          xp: { faith: 4 },
          say: "You read the name aloud. Somebody should.",
        },
      },
      { label: "Walk on", win: { say: "The bell's ringing." } },
    ],
  },
  {
    key: "chu-collection-dispute",
    where: "home town @church",
    title: "Whose pew is it?",
    body: "The vestry is squabbling over who pays for the new roof: the great families, who sit at the front, or everyone, who'll stay dry alike.",
    choices: [
      {
        label: "Propose a rate by the pews",
        check: ["persuasion", 7],
        win: {
          renown: 2,
          xp: { persuasion: 6 },
          say: "The front pays more. The front grumbled and agreed.",
        },
        lose: { renown: -1, say: "The front won, as it usually does." },
      },
      {
        label: "Pay your share and keep out of it",
        cost: 1,
        win: { say: "A roof, and no quarrel of yours." },
      },
    ],
  },
];

// ---------------------------------------------------------------- the market

const MARKET: PDef[] = [
  {
    key: "mkt-horse-trader",
    where: "town @market inside",
    title: "A horse trader",
    body: "A horse trader with a magnificent grey mare swears she's six years old, sound in wind and limb, and the gentlest beast in the colony. The mare is eyeing you.",
    choices: [
      {
        label: "Look at her teeth",
        check: ["farming", 6],
        win: {
          xp: { farming: 6 },
          say: "Twelve if she's a day. You told him so, loudly, and the crowd enjoyed it.",
        },
        lose: { coins: -3, say: "You bought her. She's twelve, and bites." },
      },
      {
        label: "Walk on",
        win: { say: "Somebody else bought her. You heard about it." },
      },
    ],
  },
  {
    key: "mkt-ballad-singer",
    where: "town @market inside",
    title: "A ballad singer",
    body: "A ballad singer with a sheaf of penny songs is singing 'The Unhappy Lovers of Lynn', and the crowd is weeping and buying.",
    choices: [
      {
        label: "Buy a song",
        cost: 1,
        win: { stress: -4, say: "You've been humming it for three days." },
      },
      {
        label: "Request a merry one",
        check: ["persuasion", 4],
        win: {
          stress: -5,
          say: "'The Jolly Waggoner'. The crowd stopped weeping and started dancing.",
        },
        lose: { say: "She only knows sad ones." },
      },
    ],
  },
  {
    key: "mkt-cheese-dispute",
    where: "town @market inside",
    title: "A cheese and a quarrel",
    body: "A farm wife and a sailor's wife are pulling at the same cheese and calling each other names you haven't heard since the army. The clerk of the market is nowhere.",
    choices: [
      {
        label: "Settle it like Solomon",
        check: ["persuasion", 6],
        win: {
          renown: 1,
          stress: -2,
          say: "Cut in two, at half the price each. Both of them think they won.",
        },
        lose: { health: -2, say: "Both of them turned on you." },
      },
      {
        label: "Buy the cheese yourself",
        cost: 1,
        win: { stress: -2, say: "You left with the cheese and two enemies." },
      },
    ],
  },
  {
    key: "mkt-quack",
    where: "town @market",
    title: "The mountebank",
    body: "A mountebank on a cart with a monkey and a drum is selling a cordial that cures the ague, the gout, the stone, low spirits and grey hair.",
    choices: [
      {
        label: "Buy a bottle",
        cost: 1,
        odds: 0.3,
        win: { stress: -3, say: "Whatever was in it, you slept like a child." },
        lose: {
          health: -2,
          say: "Mostly rum, partly something that disagreed with you.",
        },
      },
      {
        label: "Heckle him",
        check: ["medicine", 6],
        win: {
          renown: 1,
          say: "You named every ingredient. The crowd melted away; so did he.",
        },
        lose: { renown: -1, say: "His monkey threw something at you." },
      },
      {
        label: "Enjoy the show",
        win: {
          stress: -2,
          say: "The monkey was worth the price you didn't pay.",
        },
      },
    ],
  },
  {
    key: "mkt-fair-price",
    where: "town @market inside",
    title: "A bargain too good",
    body: "A man at the end of the market is selling good English cloth at half the shop price, and doesn't want to say where it came from.",
    choices: [
      {
        label: "Buy a length",
        cost: 2,
        odds: 0.7,
        win: {
          coins: 3,
          say: "Sold on at the shop price to a tailor. Easy money.",
        },
        lose: {
          renown: -2,
          say: "Stolen, as you knew. The constable came asking.",
        },
      },
      {
        label: "Tell the clerk of the market",
        win: { renown: 1, say: "The man left in a hurry. The cloth stayed." },
      },
      { label: "Walk on", win: { say: "Not your business." } },
    ],
  },
  {
    key: "mkt-weights",
    where: "town @market",
    title: "Market day gossip",
    body: "The fishwives, the farm wives and the hucksters have all the news: who's courting, who's bankrupt, whose cow died, and what the governor said to the bishop.",
    choices: [
      {
        label: "Buy a little and listen",
        cost: 1,
        win: {
          xp: { stealth: 4, persuasion: 4 },
          stress: -2,
          say: "You know more about the town than the town does.",
        },
      },
      { label: "Pass by", win: { say: "You'll hear it all at second hand." } },
    ],
  },
  {
    key: "mkt-lost-child",
    where: "town @market inside",
    title: "A lost child",
    body: "A small girl is standing in the middle of the market crying for her mother, and the crowd is going round her like water round a stone.",
    choices: [
      {
        label: "Put her on your shoulders and call out",
        win: {
          renown: 1,
          stress: -2,
          say: "Found in five minutes, a mother in tears, a ribbon for you.",
        },
      },
      {
        label: "Take her to the clerk of the market",
        win: { say: "The clerk took her to the crier, who cried her." },
      },
    ],
  },
  {
    key: "mkt-coin-clipped",
    where: "town @market inside",
    title: "Clipped coin",
    body: "A shopkeeper refuses your shilling: it's been clipped, he says, and won't take it but at weight.",
    choices: [
      {
        label: "Weigh it on his scales",
        check: ["trade", 5],
        win: { xp: { trade: 4 }, say: "Full weight. He took it, sour." },
        lose: {
          coins: -1,
          say: "Clipped, sure enough. You'll be more careful whose change you take.",
        },
      },
      {
        label: "Pay in another coin",
        win: {
          say: "The clipped one's in your pocket still, waiting for a careless shopkeeper.",
        },
      },
    ],
  },
];

// ---------------------------------------------------------------- the governor's house, the workshops, the press, the apothecary, the fort

const GOVERNOR: PDef[] = [
  {
    key: "gov-levee",
    where: "town @governor inside",
    title: "The levee",
    body: "The governor's levee: a long room full of men in their best coats, waiting their turn for a word and a bow. You've been here an hour.",
    choices: [
      {
        label: "Work the room",
        check: ["persuasion", 7],
        win: {
          renown: 1,
          favor: 3,
          xp: { persuasion: 6 },
          say: "Three useful introductions, and the governor's secretary knows your name.",
        },
        lose: { stress: 3, say: "Two hours, and a bow from across the room." },
      },
      {
        label: "Wait your turn",
        win: { favor: 1, say: "A word, a bow, a nod. That's a levee." },
      },
      { label: "Leave", win: { say: "There'll be other levees." } },
    ],
  },
  {
    key: "gov-clerk-favour",
    where: "town @governor",
    title: "A clerk who knows things",
    body: "A clerk in the secretary's office, {name}, hints that for a consideration he could tell you what's in the next proclamation before it's read.",
    who: (c) => !c.female,
    choices: [
      {
        label: "Pay him",
        cost: 2,
        odds: 0.75,
        win: {
          coins: 4,
          xp: { trade: 6 },
          say: "Duties going up on molasses: you bought before the news.",
        },
        lose: {
          favor: -3,
          say: "The secretary found out about his clerk, and about you.",
        },
      },
      {
        label: "Report him",
        win: {
          favor: 2,
          like: -10,
          why: "Reported me to the secretary",
          say: "He's copying deeds in the cellar now.",
        },
      },
      { label: "Decline", win: { say: "He shrugged. Someone else will pay." } },
    ],
  },
  {
    key: "gov-court-day",
    where: "town @governor inside",
    title: "Court day",
    body: "The county court is sitting: a stolen pig, a broken promise of marriage, a slander, and a man who refuses to pay his parson. The benches are full of people enjoying it.",
    choices: [
      {
        label: "Watch the cases",
        win: {
          xp: { letters: 4 },
          stress: -2,
          say: "The pig case was the best. The pig was produced in evidence.",
        },
      },
      {
        label: "Stand as a witness for a neighbour",
        check: ["persuasion", 6],
        win: { renown: 1, say: "Your word carried. The slander was paid for." },
        lose: { renown: -1, say: "The other attorney made a fool of you." },
      },
    ],
  },
  {
    key: "gov-petition-sign",
    where: "town ours @governor",
    title: "A petition going round",
    body: "A petition to the governor is going round: for a new road, a ferry and a bridge over the creek. Half the names on it can't write; they've made their marks.",
    choices: [
      {
        label: "Sign it",
        win: { renown: 1, say: "Your name, in a good hand, near the top." },
      },
      {
        label: "Get more names for it",
        check: ["leadership", 6],
        win: {
          renown: 2,
          favor: 1,
          say: "Two hundred names. The governor will have to read it.",
        },
        lose: { say: "Forty names, and a dog's paw print." },
      },
      {
        label: "Leave it",
        win: { say: "They'll get the bridge, or they won't." },
      },
    ],
  },
  {
    key: "wsh-apprentice-fight",
    where: "town @workshop inside",
    title: "Apprentices at blows",
    body: "Two apprentices from rival shops are going at it with their fists in the lane, and their masters are cheering them on from the doorways.",
    choices: [
      {
        label: "Part them",
        check: ["fighting", 5],
        win: {
          renown: 1,
          say: "Each by his collar. The masters laughed and went in.",
        },
        lose: { health: -3, say: "You got the punch meant for the other boy." },
      },
      {
        label: "Bet on the smaller one",
        odds: 0.45,
        win: { coins: 2, say: "Small, and quick, and won." },
        lose: { coins: -1, say: "Small, and quick, and lost." },
      },
    ],
  },
  {
    key: "wsh-new-tool",
    where: "town @workshop",
    title: "A clever device",
    body: "A tinkerer in the workshops has made a machine for cutting nails out of strip iron by a lever, and wants someone to put money in it.",
    choices: [
      {
        label: "Put money in",
        cost: 4,
        odds: 0.45,
        win: {
          coins: 10,
          say: "Nails by the cask. Your share came home twice over.",
        },
        lose: {
          say: "It jammed more than it cut. He's working on it, he says.",
        },
      },
      {
        label: "Look it over first",
        check: ["craft", 7],
        win: {
          xp: { craft: 8 },
          say: "A good notion, badly made. You told him how to mend it.",
        },
        lose: { say: "You couldn't make head or tail of it." },
      },
    ],
  },
  {
    key: "prs-broadside",
    where: "town @press inside",
    title: "A broadside wanted",
    body: "The printer is setting a broadside on the latest hanging (the dying words of the condemned, a woodcut of the gallows) and asks if you've a verse in you.",
    choices: [
      {
        label: "Write him a verse",
        check: ["letters", 6],
        win: {
          coins: 1,
          xp: { letters: 6 },
          say: "Twelve lines, terrible and affecting. Sold out by noon.",
        },
        lose: { say: "He used his own, which was worse." },
      },
      {
        label: "Buy a copy",
        cost: 1,
        win: { say: "Everyone's reading it in the street." },
      },
    ],
  },
  {
    key: "prs-advertisement",
    where: "town @press",
    title: "An advertisement",
    body: "The printer says an advertisement in the gazette would bring trade: your name, your business, a little woodcut.",
    when: (_g, life) =>
      !!life.job || (life.property ?? []).some((p) => p.kind === "business"),
    choices: [
      {
        label: "Place one",
        cost: 1,
        win: {
          renown: 1,
          say: "Your name in print, between a runaway servant and a lost mare.",
        },
      },
      {
        label: "Write a clever one",
        cost: 1,
        check: ["letters", 6],
        win: { renown: 2, say: "People are quoting it." },
        lose: { renown: 1, say: "In print, at least." },
      },
      { label: "No", win: { say: "Word of mouth will do." } },
    ],
  },
  {
    key: "apo-remedy",
    where: "town @apothecary inside",
    title: "A remedy for the headache",
    body: "The apothecary has a new remedy for the headache from London: Dr James's Fever Powder. He swears by it. He would.",
    choices: [
      {
        label: "Buy a paper",
        cost: 1,
        win: {
          health: 2,
          stress: -2,
          say: "Your head's better. Whether it was the powder, who can say.",
        },
      },
      {
        label: "Ask what's in it",
        check: ["medicine", 6],
        win: {
          xp: { medicine: 6 },
          say: "Antimony, mostly. You'll have the willow bark instead.",
        },
        lose: { say: "He wouldn't say." },
      },
    ],
  },
  {
    key: "apo-leeches",
    where: "town @apothecary",
    title: "Bled for your health",
    body: "The apothecary says you look full-blooded and recommends a bleeding and a purge, for the season.",
    choices: [
      {
        label: "Be bled",
        cost: 1,
        odds: 0.5,
        win: { stress: -2, say: "You feel lighter, and paler." },
        lose: { health: -3, say: "You feel faint all week." },
      },
      { label: "Decline", win: { say: "Your blood stays where it is." } },
    ],
  },
  {
    key: "frt-drill",
    where: "town @fort inside",
    title: "The drill yard",
    body: "The sergeant on the drill yard is short of a man to show the recruits how to load in twelve motions, and you've been watching too closely.",
    choices: [
      {
        label: "Show them",
        check: ["fighting", 5],
        win: {
          xp: { fighting: 6 },
          renown: 1,
          say: "Twelve motions, smart as a guardsman. The sergeant nodded.",
        },
        lose: { say: "You dropped the ramrod. The recruits laughed." },
      },
      { label: "Move on", win: { say: "Not your army." } },
    ],
  },
  {
    key: "frt-canteen",
    where: "town @fort",
    title: "The sutler's tent",
    body: "The sutler outside the fort sells rum, tobacco and news at prices only soldiers will pay, and has more news than rum.",
    choices: [
      {
        label: "Buy a gill and hear the news",
        cost: 1,
        win: {
          xp: { leadership: 4 },
          stress: -2,
          say: "Which officers are drunkards, which regiments are moving, where the pay chest is.",
        },
      },
      {
        label: "Sell him something",
        check: ["trade", 6],
        win: { coins: 2, say: "Tobacco at a soldier's price." },
        lose: { say: "He's a sutler. He knows prices." },
      },
    ],
  },
];

export const TOWN_PLACE_EVENTS: LifeEventDef[] = [
  ...placeFamily("tvn", 40, TAVERN),
  ...placeFamily("hom", 40, HOME),
  ...placeFamily("dck", 40, DOCKS),
  ...placeFamily("chu", 45, CHURCH),
  ...placeFamily("mkt", 40, MARKET),
  ...placeFamily(
    "gov",
    45,
    GOVERNOR.filter((d) => d.key.startsWith("gov-")),
  ),
  ...placeFamily(
    "wsh",
    45,
    GOVERNOR.filter((d) => d.key.startsWith("wsh-")),
  ),
  ...placeFamily(
    "prs",
    45,
    GOVERNOR.filter((d) => d.key.startsWith("prs-")),
  ),
  ...placeFamily(
    "apo",
    45,
    GOVERNOR.filter((d) => d.key.startsWith("apo-")),
  ),
  ...placeFamily(
    "frt",
    45,
    GOVERNOR.filter((d) => d.key.startsWith("frt-")),
  ),
];
