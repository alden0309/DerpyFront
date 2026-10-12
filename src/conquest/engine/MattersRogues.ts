// EVENTS (r15): the wrong side of the law and the right one. A rogue's big
// jobs (the den's tip-offs, beyond the one each crooked trade already had in
// CrimeEvents.ts) and a lawman's rounds (beyond the rogue caught in the act
// and the merchant's quiet purse). Plain data: Matters.ts makes them scenes.

import { C, M, months, port, type Variant } from "./MatterKit";

export const ROGUE_MATTERS: Variant[] = [
  // ------------------------------------------------ thieves
  M(
    "thief",
    "score",
    "fair-day",
    "Fair day",
    "It's fair day at {here}: cattle, ribbons, a dancing bear, a man who eats fire, and three thousand people with their purses on strings, every one of them looking at the bear.",
    [
      C(
        "Work the crowd at the bear",
        { check: {} },
        {
          pay: 1,
          name: 2,
          heat: 6,
          say: "Eleven purses before the bear sat down. A good fair.",
        },
        {
          heat: 12,
          stress: 5,
          seize: 0.35,
          say: "A farmer felt your hand and roared like the bear.",
        },
      ),
      C(
        "Just the drunks behind the booths",
        { check: { skill: "stealth", dc: -2 } },
        { pay: 0.4, heat: 2, say: "Drunks are generous, if you let them be." },
        { heat: 5, say: "One of the drunks was sober enough to swing." },
      ),
      C(
        "Watch the fire-eater",
        {},
        {
          stress: -4,
          say: "He ate fire. You ate gingerbread. Nobody robbed anybody.",
        },
      ),
    ],
  ),
  M(
    "thief",
    "score",
    "chandler-till",
    "The chandler's till",
    "The ship's chandler on the waterfront banks his week's takings on Monday morning, and on Sunday night it sits in a tin box under his counter while he's at prayers. You know because his boy told you, for a shilling.",
    [
      C(
        "In through the skylight",
        { check: { dc: 1 } },
        {
          pay: 1.4,
          name: 3,
          heat: 10,
          say: "The tin box, the till, and a fine brass spyglass. He'll pray harder next week.",
        },
        {
          heat: 16,
          health: -6,
          seize: 0.4,
          say: "The skylight gave way under you and so did your ankle.",
        },
      ),
      C(
        "Pay the boy to leave the door on the latch",
        { cost: 2, check: { skill: "stealth" } },
        {
          pay: 1,
          heat: 6,
          say: "The door was on the latch and the box was where he said.",
        },
        {
          heat: 10,
          seize: 0.3,
          say: "The boy told his master too, for two shillings.",
        },
      ),
      C(
        "Leave it: the waterfront is crawling",
        {},
        { say: "Somebody else did it on Sunday. The watch took him Monday." },
      ),
    ],
    { when: port },
  ),
  M(
    "thief",
    "score",
    "ball-jewels",
    "Jewels at the ball",
    "The governor's ball, and every lady in the colony will be wearing everything she owns. A footman's coat can be had for the night, and nobody looks at footmen.",
    [
      C(
        "Go as a footman",
        { check: { dc: 2 } },
        {
          pay: 2,
          name: 4,
          heat: 14,
          say: "A pearl drop and two rings, off ladies too busy dancing to notice. You poured a very good glass of punch too.",
        },
        {
          heat: 20,
          stress: 6,
          seize: 0.5,
          say: "The butler knew every footman by name, and you by none.",
        },
      ),
      C(
        "Wait outside for the carriages",
        { check: { skill: "stealth" } },
        {
          pay: 0.8,
          heat: 6,
          say: "A reticule left on a carriage step. Ladies are careless at three in the morning.",
        },
        { heat: 8, say: "The coachmen were sober, which was unlucky." },
      ),
      C(
        "Not the governor's house",
        {},
        { stress: -2, say: "Some houses are lucky to rob. That isn't one." },
      ),
    ],
    { when: months(0, 1) },
  ),
  // ------------------------------------------------ fences
  M(
    "fence",
    "score",
    "engraved-plate",
    "Plate with a crest",
    "A gang has brought you a sack of silver plate: a teapot, a salver, eight spoons, every piece engraved with a crest that half the colony would know.",
    [
      C(
        "Melt it down and sell the metal",
        { check: { skill: "craft" } },
        {
          pay: 1.2,
          heat: 4,
          name: 2,
          say: "Into the crucible. A bar of silver has no crest and no memory.",
        },
        {
          heat: 12,
          seize: 0.3,
          say: "The silversmith you sold to recognised the bar. Metal remembers after all.",
        },
      ),
      C(
        "Sell it whole in another colony",
        { check: { skill: "trade" } },
        {
          pay: 1.6,
          name: 3,
          heat: 6,
          say: "A merchant two colonies off bought it as his grandmother's.",
        },
        {
          heat: 14,
          seize: 0.35,
          say: "The merchant's grandmother was alive and knew the crest.",
        },
      ),
      C(
        "Turn it away",
        {},
        {
          name: -1,
          say: "Too hot to touch. The gang will remember you said so.",
        },
      ),
    ],
  ),
  M(
    "fence",
    "score",
    "constable-buyer",
    "A buyer you don't know",
    "A man in a good coat wants to buy a great deal, all at once, and asks a great many questions about where it came from. His boots are a constable's boots.",
    [
      C(
        "Sell him a false trail",
        { check: { skill: "persuasion", dc: 1 } },
        {
          pay: 0.6,
          name: 2,
          heat: -6,
          say: "You sold him a story and a set of fire-irons. He went off to raid a respectable ironmonger.",
        },
        {
          heat: 14,
          seize: 0.45,
          say: "He didn't believe the story. He did buy the fire-irons, as evidence.",
        },
      ),
      C(
        "Sell him nothing, politely",
        {},
        { heat: -2, say: "He went away with his questions." },
      ),
      C(
        "Warn the gangs",
        { check: { skill: "stealth" } },
        {
          name: 3,
          say: "Every gang in town knows his face now, and owes you.",
        },
        { heat: 8, say: "He saw who you warned." },
      ),
    ],
  ),
  M(
    "fence",
    "score",
    "shares-quarrel",
    "A quarrel over shares",
    "Two of the gangs that bring you goods have fallen out over who robbed what, and both want you to say which of them owns the cask of brandy in your cellar.",
    [
      C(
        "Judge between them",
        { check: { skill: "leadership" } },
        {
          pay: 0.5,
          name: 4,
          say: "Half each, a quarter to you for the judging. They'll come to you to settle things now.",
        },
        { health: -10, name: -1, say: "Both decided they owned you instead." },
      ),
      C(
        "Buy the brandy from both",
        { cost: 4 },
        {
          pay: 0.8,
          name: 1,
          say: "Paid twice for one cask, and sold it for three.",
        },
      ),
      C(
        "Give it to the bigger gang",
        { odds: 0.6 },
        { say: "The smaller gang went to another fence." },
        { health: -8, say: "The smaller gang came round in the night." },
      ),
    ],
  ),
  // ------------------------------------------------ smugglers
  M(
    "smuggler",
    "score",
    "statia-tea",
    "Tea from St Eustatius",
    "A sloop lies off the inlet with Dutch tea from St Eustatius: no duty, no questions, and three ladies in town who'll take every chest at a price that would make the East India Company weep.",
    [
      C(
        "Run it all ashore tonight",
        { check: { skill: "seamanship" } },
        {
          pay: 1.4,
          name: 2,
          heat: 8,
          say: "Twenty chests in the church crypt by dawn. The sexton is very understanding.",
        },
        {
          heat: 14,
          seize: 0.4,
          say: "A riding officer was waiting at the inlet with a lantern.",
        },
      ),
      C(
        "A few chests by fishing boat",
        { check: { skill: "stealth", dc: -1 } },
        {
          pay: 0.6,
          heat: 3,
          say: "Tea under the cod. Smells odd; sells well.",
        },
        { heat: 6, say: "The cod was seized. So, unfortunately, was the tea." },
      ),
      C("Let the sloop go", {}, { say: "She went on to the next inlet." }),
    ],
    { when: port },
  ),
  M(
    "smuggler",
    "score",
    "riding-officer",
    "The riding officer's price",
    "The new riding officer at {here} has let it be known, through a cousin, that he can be blind on certain nights for a share. It might be true. It might be a trap with his name on it.",
    [
      C(
        "Meet him and test it",
        { check: { skill: "persuasion" } },
        {
          pay: 1,
          heat: -8,
          name: 1,
          say: "Blind as a mole, for a tenth. The runs go easier now.",
        },
        { heat: 16, seize: 0.45, say: "His eyes were very good." },
      ),
      C(
        "Run on a night he's known to be drunk",
        { odds: 0.6 },
        { pay: 0.6, say: "He was drunk." },
        { heat: 8, say: "He was drunk, and lucky." },
      ),
      C(
        "Lie low a month",
        {},
        {
          heat: -5,
          say: "A month of honest fishing. The fish don't pay duty either.",
        },
      ),
    ],
    { when: port },
  ),
  M(
    "smuggler",
    "score",
    "sea-cave",
    "A cave under the cliff",
    "A boy has found a sea cave under the cliff with a dry ledge above the high-water mark, big enough for a whole cargo, and reachable only at the bottom of the tide.",
    [
      C(
        "Use it for the next big run",
        { check: { skill: "seamanship", dc: 1 } },
        {
          pay: 1.2,
          name: 2,
          heat: 4,
          say: "Forty kegs in the cave and not a riding officer within a mile.",
        },
        {
          health: -10,
          pay: -0.4,
          say: "The tide came back faster than the kegs went up. You swam; the kegs didn't.",
        },
      ),
      C(
        "Pay the boy to keep quiet",
        { cost: 1 },
        {
          name: 1,
          say: "He'll keep quiet. Boys are good at it when there's money in it.",
        },
      ),
      C(
        "Sell the secret to another gang",
        { check: { skill: "trade" } },
        { pay: 0.8, say: "A good price for a hole in a rock." },
        { name: -1, say: "They found it themselves before they paid." },
      ),
    ],
    { when: port },
  ),
  // ------------------------------------------------ the road
  M(
    "highwayman",
    "score",
    "drover",
    "The drover's money",
    "A drover took two hundred head to the market at {here} and is riding home tonight alone, with the money in his saddlebags and a great deal of the market's ale in him.",
    [
      C(
        "Stop him on the long hill",
        { check: {} },
        {
          pay: 1.2,
          name: 3,
          heat: 10,
          say: '"Stand and deliver," and he did, and thanked you for not shooting him, and fell off his horse.',
        },
        {
          heat: 16,
          health: -8,
          seize: 0.35,
          say: "He had a pistol and very little ale in him after all.",
        },
      ),
      C(
        "Lift the saddlebags at the inn",
        { check: { skill: "stealth" } },
        {
          pay: 0.7,
          heat: 5,
          say: "He woke with an empty bag and a headache, and blamed the ostler.",
        },
        { heat: 8, say: "The ostler was watching the horses, and you." },
      ),
      C(
        "Let him ride",
        {},
        { say: "He got home. His wife took the money off him at the door." },
      ),
    ],
  ),
  M(
    "highwayman",
    "score",
    "judge-carriage",
    "His Honour's carriage",
    "The judge who sentenced your friend to hang rides circuit through the woods next week, in a coach with his clerk, his wig box and his silver.",
    [
      C(
        "Rob him, with a bow",
        { check: { dc: 2 } },
        {
          pay: 1.6,
          name: 5,
          heat: 18,
          renown: 0.5,
          say: "His silver, his clerk's watch and his wig. The ballad-sellers will have it by Saturday.",
        },
        {
          heat: 24,
          seize: 0.5,
          say: "He travelled with four mounted constables this time.",
        },
      ),
      C(
        "Rob only the clerk",
        { check: {} },
        {
          pay: 0.6,
          name: 2,
          heat: 8,
          say: "The clerk's purse and his notes. The judge laughed, which was something.",
        },
        { heat: 10, say: "The clerk had a blunderbuss under his papers." },
      ),
      C(
        "Not him: the gallows have long memories",
        {},
        {
          stress: -2,
          say: "You let him pass. He never knew how close he came.",
        },
      ),
    ],
  ),
  M(
    "highwayman",
    "score",
    "rival-road",
    "Another on your road",
    "Somebody else is working your stretch of the post road: a young blade with a black mask and a grey horse, robbing coaches you'd have robbed and bringing the constables down on both of you.",
    [
      C(
        "Run him off",
        { check: { skill: "fighting" } },
        {
          name: 3,
          heat: -4,
          say: "He took the north road. Your stretch is your stretch.",
        },
        {
          health: -12,
          say: "He was younger, and faster, and had the grey horse.",
        },
      ),
      C(
        "Take him into partnership",
        { check: { skill: "persuasion" } },
        { pay: 0.6, name: 2, say: "Two masks are better than one, for now." },
        {
          heat: 8,
          say: "He talked to the wrong people about his new partner.",
        },
      ),
      C(
        "Tip off the constables",
        { odds: 0.6 },
        {
          heat: -8,
          say: "They took him at the Red Lion. Your stretch is quiet.",
        },
        { heat: 6, name: -3, say: "He talked about you all the way to gaol." },
      ),
    ],
  ),
  // ------------------------------------------------ coiners
  M(
    "counterfeiter",
    "score",
    "bad-pewter",
    "The alloy's wrong",
    "The last batch of dollars came out of the moulds a shade too grey and a shade too light, and the man who passes them for you says they ring like a cracked bell.",
    [
      C(
        "Get the alloy right",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 1,
          name: 2,
          heat: 4,
          say: "Silver-washed and weighted with lead. They ring true as a church bell now.",
        },
        {
          heat: 10,
          health: -4,
          seize: 0.3,
          say: "The melt spat and burned your hand, and someone smelled it next door.",
        },
      ),
      C(
        "Pass them far away",
        { check: { skill: "stealth" } },
        {
          pay: 0.6,
          heat: 2,
          say: "Spent in country stores in another county. Country stores don't ring coins.",
        },
        { heat: 8, say: "This country store did." },
      ),
      C(
        "Melt them down",
        {},
        {
          pay: -0.3,
          say: "Back into the pot. Patience is the coiner's craft.",
        },
      ),
    ],
  ),
  M(
    "counterfeiter",
    "score",
    "looking-shopkeeper",
    "A shopkeeper who looks too long",
    "The shopkeeper on the corner turned your bill over twice, held it to the window, and is now asking if you'd mind waiting while he fetches change from the back. The back has a door to the street.",
    [
      C(
        "Talk your way out",
        { check: { skill: "persuasion", dc: 1 } },
        {
          pay: 0.3,
          heat: 2,
          say: "You remembered you had coin after all, and left with your bill and your goods.",
        },
        {
          heat: 12,
          seize: 0.45,
          say: "He came back with the change and a constable.",
        },
      ),
      C(
        "Walk out now",
        { check: { skill: "stealth" } },
        { heat: 4, say: "Gone before he was back. He'll know your face now." },
        { heat: 8, seize: 0.25, say: "His apprentice was at the door." },
      ),
      C(
        "Wait it out",
        { odds: 0.4 },
        { pay: 0.4, say: "He came back with change. He was only short of it." },
        { heat: 14, seize: 0.6, say: "He came back with the watch." },
      ),
    ],
  ),
  M(
    "counterfeiter",
    "score",
    "press-in-woods",
    "A press in the woods",
    "A cabin in the woods with a stream for washing the ink and nobody for miles: you could print the colony's bills there all winter, if you could get the press out there.",
    [
      C(
        "Haul it out in the snow",
        { check: { skill: "woodcraft" } },
        {
          pay: 1.4,
          name: 3,
          heat: 2,
          say: "A winter's printing in perfect quiet. The bills come out by the bale.",
        },
        {
          health: -8,
          heat: 6,
          say: "The sledge broke through the ice of the stream. So did the press.",
        },
      ),
      C(
        "Print in town, small and careful",
        { check: { skill: "stealth" } },
        { pay: 0.6, heat: 4, say: "A few bills a night behind a locked door." },
        { heat: 10, seize: 0.3, say: "The neighbours smelled ink." },
      ),
      C(
        "Sell the idea to another coiner",
        {},
        {
          pay: 0.3,
          say: "He paid you in his own bills. You laugh about it, now.",
        },
      ),
    ],
    { when: months(10, 1) },
  ),
  // ------------------------------------------------ pirates
  M(
    "pirate",
    "score",
    "treasure-wreck",
    "A Spanish wreck",
    "The Spanish lost a galleon on the reef last season, and their divers have gone home. The wreck lies in four fathoms, and sometimes when the sea is calm you can see silver on the sand.",
    [
      C(
        "Dive on her",
        { check: { skill: "seamanship", dc: 1 } },
        {
          pay: 2,
          name: 3,
          heat: 6,
          say: "Pieces of eight by the bucket, and a gold chain. The Spanish will want them back.",
        },
        { health: -14, stress: 5, say: "A shark had the same idea." },
      ),
      C(
        "Take the Spaniards' salvage camp instead",
        { check: { skill: "fighting" } },
        {
          pay: 1.6,
          name: 4,
          heat: 12,
          say: "Their silver was already in chests. Very considerate.",
        },
        {
          health: -12,
          heat: 10,
          seize: 0.2,
          say: "A guarda costa was anchored round the point.",
        },
      ),
      C("Leave it to the wreckers", {}, { say: "There'll be other wrecks." }),
    ],
  ),
  M(
    "pirate",
    "score",
    "articles-vote",
    "A vote on the articles",
    "The crew are calling a council on deck: the captain has been keeping too much of the plunder, they say, and by the articles a captain can be voted out. They're looking at you.",
    [
      C(
        "Stand for captain",
        { check: { skill: "leadership", dc: 1 } },
        {
          pay: 0.8,
          name: 4,
          renown: 1,
          say: "Voted captain by a show of hands. The old captain was put ashore on a sandbar with a bottle.",
        },
        {
          health: -10,
          name: -1,
          say: "The old captain won the vote, and remembers who stood against him.",
        },
      ),
      C(
        "Back the captain",
        {},
        {
          pay: 0.4,
          say: "He kept his place and remembered who kept him there.",
        },
      ),
      C(
        "Say nothing",
        {},
        { say: "The vote went as votes go. You still have your share." },
      ),
    ],
  ),
  M(
    "pirate",
    "score",
    "careening",
    "Careening on a lonely beach",
    "The ship's bottom is foul with weed and worm, and she must be hove down on a beach and scraped. For a week she'll be on her side, helpless, and so will you.",
    [
      C(
        "Careen at the hidden cay",
        { check: { skill: "seamanship" } },
        {
          pay: 0.6,
          name: 1,
          say: "Clean and fast again. She'll catch anything now.",
        },
        {
          health: -8,
          heat: 6,
          say: "A man-of-war's boat found the cay. You got her off the beach half-scraped and under fire.",
        },
      ),
      C(
        "Scrape her at anchor, slowly",
        {},
        { stress: 4, say: "A slow, wet, cursing week. Cleaner, if not clean." },
      ),
      C(
        "Take a fresh ship instead",
        { check: { skill: "fighting" } },
        {
          pay: 1.2,
          name: 4,
          heat: 12,
          say: "Why scrape a ship when a clean one is sailing past?",
        },
        { health: -12, heat: 8, say: "The clean one had guns." },
      ),
    ],
  ),
  // ------------------------------------------------ the watch and the thief-takers
  M(
    ["watch", "thieftaker"],
    "collar",
    "drunk-sailor",
    "A sailor with a knife",
    "A sailor off a ship in the river, drunk as a lord, is standing in the middle of the street at {here} with a knife, inviting the whole town to fight him, one at a time or all together.",
    [
      C(
        "Take the knife off him",
        { check: { dc: 1 } },
        {
          pay: 0.5,
          renown: 1.5,
          say: "You took the knife and he wept on your shoulder. A night in the cage and back to his ship.",
        },
        { health: -10, say: "He was drunk, but he'd been in a lot of fights." },
      ),
      C(
        "Talk him down",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "You talked about his mother. He gave you the knife.",
        },
        { health: -6, say: "You talked about his mother." },
      ),
      C(
        "Fetch his captain",
        {},
        { say: "His captain came with the bosun and a rope's end." },
      ),
    ],
    { when: port },
  ),
  M(
    ["watch", "thieftaker"],
    "collar",
    "apple-boys",
    "Boys in the orchard",
    "The magistrate's orchard has been raided three nights running, and tonight there are boys in the trees again, and one of them is the magistrate's own nephew.",
    [
      C(
        "Collar them all",
        { check: {} },
        {
          renown: 1,
          say: "Six boys, six pairs of ears boxed, one magistrate with a great deal to think about.",
        },
        { health: -3, say: "Boys run faster than constables." },
      ),
      C(
        "Collar all but the nephew",
        {},
        {
          pay: 0.3,
          renown: -0.5,
          say: "The magistrate tipped you a shilling. The other boys' fathers didn't.",
        },
      ),
      C(
        "Take the nephew home to his uncle",
        { check: { skill: "persuasion" } },
        {
          renown: 1.5,
          say: "The magistrate thanked you, through his teeth, and beat the boy himself.",
        },
        {
          renown: -1,
          say: "The magistrate wanted to know why you were in his orchard.",
        },
      ),
    ],
    { when: months(7, 9) },
  ),
  M(
    ["watch", "thieftaker"],
    "collar",
    "housebreaker-roof",
    "On the rooftops",
    "A housebreaker came out of a merchant's dormer window as you passed, saw your lantern, and went up instead of down: he's running along the roof-ridges of the whole street.",
    [
      C(
        "Go up after him",
        { check: { dc: 2 } },
        {
          pay: 0.9,
          renown: 2,
          say: "Caught on the fourth roof, by the coat-tails. The merchant is generous.",
        },
        {
          health: -14,
          say: "The third roof was thatch, and the thatch was rotten.",
        },
      ),
      C(
        "Run along below and wait",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.6,
          renown: 1,
          say: "He came down the drainpipe into your arms.",
        },
        { say: "He came down a drainpipe in another street." },
      ),
      C(
        "Raise the hue and cry",
        {},
        {
          renown: 0.5,
          say: "The whole street came out in nightcaps. He got away in the excitement.",
        },
      ),
    ],
  ),
  M(
    ["watch", "thieftaker"],
    "bribe",
    "tavern-gift",
    "A tavern keeper's gift",
    'The keeper of a disorderly house sends round a basket on quarter day: a ham, a bottle, and a purse, "in gratitude for the watch\'s care of the neighbourhood".',
    [
      C(
        "Send it back with a warning",
        { check: { skill: "persuasion" } },
        {
          renown: 1.5,
          say: "He took the basket back and the hint. The house is quieter.",
        },
        {
          renown: 0.5,
          stress: 3,
          say: "He took the basket back and doubled the purse for the next constable.",
        },
      ),
      C(
        "Keep the ham, return the purse",
        {},
        {
          renown: 0.3,
          say: "A ham is neighbourliness; a purse is a bribe. You hope the bench sees it so.",
        },
      ),
      C(
        "Keep it all",
        { odds: 0.75 },
        {
          pay: 0.8,
          say: "A good ham, a good bottle, a purse, and a house you'll never raid.",
        },
        {
          pay: 0.8,
          renown: -3,
          heat: 6,
          say: "The ham was good. The justice who heard of it was not amused.",
        },
      ),
    ],
  ),
  M(
    ["watch", "thieftaker"],
    "bribe",
    "gentleman-son",
    "A gentleman's son",
    "You've taken up a young gentleman for breaking a tavern's windows, and his father's steward is at the watch-house within the hour, with apologies and a purse, to suggest it was all a misunderstanding.",
    [
      C(
        "Charge him like any man",
        { check: { skill: "letters" } },
        {
          renown: 2,
          say: "The young gentleman paid for the windows before the justices. The tavern sends its thanks.",
        },
        {
          renown: 1,
          stress: 4,
          say: "The justices let him off. His father remembers your name.",
        },
      ),
      C(
        "Take the purse for the tavern's windows",
        {},
        {
          renown: 0.5,
          say: "The windows were paid for, the boy was let go, and nobody kept a penny. Almost honest.",
        },
      ),
      C(
        "Take the purse for yourself",
        { odds: 0.7 },
        { pay: 1, say: "A misunderstanding, as the steward said." },
        {
          pay: 1,
          renown: -3,
          heat: 6,
          say: "The tavern keeper told the justice whose purse it was.",
        },
      ),
    ],
  ),
];
