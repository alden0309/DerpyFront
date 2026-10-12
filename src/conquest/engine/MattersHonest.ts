// EVENTS (r15): the honest trades' matters at work, beyond the classic task
// and trouble each already had (WorkEvents.ts). Several to a trade, each its
// own story with its own choices and what they come to: the fur trader's
// lines robbed by a rival, raided by a wolverine, soured by a thaw or
// snared across by a neighbour; the farmer's hail and plough match and sick
// cow; the printer's pied type; the midwife's secret birth. Plain data:
// Matters.ts makes them scenes and decides which comes when.

import {
  all,
  atWarNow,
  C,
  employed,
  harvestHere,
  M,
  months,
  north,
  openWater,
  port,
  rankAtLeast,
  since,
  south,
  type Variant,
  winterHere,
} from "./MatterKit";

export const HONEST_MATTERS: Variant[] = [
  // ------------------------------------------------ the land
  M(
    "farmer",
    "trouble",
    "hail",
    "Hail on the wheat",
    "Twenty minutes of hail the size of musket balls, out of a clear afternoon, and the wheat at {here} lies flat as a parlour carpet. The neighbours are standing at their fences saying nothing, which is how you know it's bad.",
    [
      C(
        "Plough it in and sow buckwheat",
        { tip: "Late, but buckwheat is quick", check: { skill: "farming" } },
        {
          pay: 0.6,
          xp: 14,
          say: "The buckwheat came up thick and in time. Not wheat, but bread all the same.",
        },
        {
          pay: -0.4,
          stress: 4,
          xp: 6,
          say: "The frost came before the buckwheat did.",
        },
      ),
      C(
        "Sell the straw for bedding",
        { tip: "A little back, and no more risk" },
        {
          pay: 0.2,
          stress: 2,
          say: "The livery stable took the straw. It paid for the seed, nearly.",
        },
      ),
      C(
        "Leave it and hope some stands up",
        { odds: 0.35 },
        { stress: -1, say: "Some of it stood up. Wheat is stubborn." },
        {
          pay: -0.5,
          stress: 5,
          say: "None of it stood up. Wheat is not that stubborn.",
        },
      ),
    ],
    { when: months(4, 7) },
  ),
  M(
    "farmer",
    "task",
    "plough-match",
    "The plough match",
    "The county holds its ploughing match on the common at {here}: a straight furrow, a silver cup and a pig for the winner, and every farmer's wife watching to see whose husband disgraces himself.",
    [
      C(
        "Enter, with your own team",
        { check: { skill: "farming", dc: 1 } },
        {
          coins: 4,
          renown: 2,
          xp: 12,
          say: "A furrow like a ruled line. The cup is on your mantel and the pig is in your sty.",
        },
        {
          stress: 3,
          xp: 6,
          say: "Your off ox had opinions about the line. So, loudly, did the crowd.",
        },
      ),
      C(
        "Lend your team to a younger man",
        { tip: "He'll owe you" },
        {
          renown: 1,
          boss: 3,
          say: "He came third, and told everyone whose oxen they were.",
        },
      ),
      C(
        "Go for the cider and the wrestling",
        {},
        {
          stress: -6,
          pay: -0.1,
          say: "You lost a shilling on the wrestling and found it again on the cider.",
        },
      ),
    ],
    { when: months(3, 4) },
  ),
  M(
    "farmer",
    "trouble",
    "bloated-cow",
    "A cow down in the clover",
    "Your best cow broke into the wet clover overnight and now lies blown up like a bladder at a fair, groaning. Everyone knows the cure: a knife between the ribs in just the right place. Everyone knows a man who did it in the wrong one.",
    [
      C(
        "Stick her yourself",
        { check: { skill: "medicine" } },
        {
          xp: 12,
          renown: 0.5,
          say: "A hiss like a kettle, and she was on her feet by noon.",
        },
        {
          pay: -0.8,
          stress: 5,
          say: "Wrong place. You'll be eating beef for a month, and no milk.",
        },
      ),
      C(
        "Send for the cow doctor",
        { cost: 2 },
        {
          say: "He came, he stuck her, he charged two coins and a dinner. She lived.",
        },
      ),
      C(
        "Walk her and pray",
        { odds: 0.45 },
        {
          stress: 2,
          say: "Three hours round the yard and she belched like a sailor. Saved.",
        },
        { pay: -0.8, stress: 6, say: "She lay down and didn't get up." },
      ),
    ],
  ),
  M(
    "servant",
    "trouble",
    "seasoning",
    "The seasoning",
    "Every newcomer gets the fever their first summers here, they say; it's called the seasoning, and it kills one in four. Now it has you: shaking in the heat of the day in the field at {here}, and the overseer counting rows.",
    [
      C(
        "Work through it",
        { check: { skill: "farming", dc: 1 } },
        {
          xp: 10,
          gain: "robust",
          say: "You came through it on your feet. Seasoned, they call you now.",
        },
        {
          health: -14,
          stress: 6,
          say: "You fell in the furrow and woke in the quarters a week later.",
        },
      ),
      C(
        "Ask the mistress for bark",
        { tip: "She keeps Jesuit's bark for the house" },
        {
          health: -4,
          boss: -2,
          say: "Bitter as gall, and it worked. The overseer counts it against you.",
        },
      ),
      C(
        "Lie up in the quarters",
        { odds: 0.6 },
        { health: -5, say: "A week of sweats, and it broke." },
        {
          health: -12,
          stress: 4,
          boss: -4,
          say: "A fortnight of sweats, and a mark against your name for every day of it.",
        },
      ),
    ],
    { when: all(south, months(5, 9)) },
  ),
  M(
    "servant",
    "task",
    "letters-night",
    "Letters by firelight",
    "The schoolmaster's boy will teach you your letters after dark for the price of your Sunday bread. Your indenture says nothing against it; your master's face, if he found out, might say a good deal.",
    [
      C(
        "Learn, in secret",
        { check: { skill: "stealth" } },
        {
          sk: "letters",
          xp: 20,
          coins: -1,
          stress: 2,
          say: "A winter of firelight and you can read the indenture yourself. It reads worse than it sounded.",
        },
        {
          boss: -6,
          stress: 4,
          say: "Your master found the primer under your straw. He took it, and the bread.",
        },
      ),
      C(
        "Ask your master's leave",
        { check: { skill: "persuasion" } },
        {
          boss: 4,
          say: "He said a servant who can read a bill of lading is worth more. He's right, and he'll charge for it.",
        },
        { boss: -2, say: '"Reading is for your betters." So that\'s that.' },
      ),
      C(
        "Keep your bread",
        {},
        { stress: -2, say: "Bread now; letters, some other life." },
      ),
    ],
  ),
  M(
    "servant",
    "trouble",
    "son-accuses",
    "The young master's watch",
    "Your master's son has lost his silver watch and says, loudly and at dinner, that it walked off with a servant. You've seen it since: under the cushion of the bench in the tavern, where he left it with his wits.",
    [
      C(
        "Say where it is, to his face",
        { check: { skill: "persuasion", dc: 1 } },
        {
          boss: 6,
          renown: 0.5,
          say: "It was under the cushion. The son is a deeper red than his coat; the father almost smiled.",
        },
        {
          boss: -8,
          stress: 6,
          say: "He called you a liar and the cushion a conspirator. Ten more days on your indenture.",
        },
      ),
      C(
        "Fetch it back quietly",
        { check: { skill: "stealth" } },
        {
          boss: 3,
          say: "It turned up in the hall the next morning. Nobody asked how.",
        },
        {
          boss: -5,
          stress: 4,
          say: "The tapster saw you take it. Now it walked off with a servant twice.",
        },
      ),
      C(
        "Keep your eyes down",
        { odds: 0.5 },
        { say: "He found it himself, and forgot he'd ever said anything." },
        {
          boss: -4,
          stress: 5,
          say: "Every servant in the house was searched. You most.",
        },
      ),
    ],
  ),
  // ------------------------------------------------ mills and crafts
  M(
    "millhand",
    "trouble",
    "saw-jumps",
    "The saw jumps the log",
    "The sash saw hit an old iron spike buried in a log and leapt in its frame like a hooked fish. The blade is cracked, the log is spoiled, and the master sawyer wants to know who didn't look the log over.",
    [
      C(
        "Braze the blade and saw on",
        { check: { skill: "craft" } },
        {
          pay: 0.3,
          xp: 12,
          boss: 4,
          say: "A neat braze and a light cut. The saw ran another season.",
        },
        {
          health: -9,
          xp: 5,
          say: "The braze went at the second log. So, nearly, did your hand.",
        },
      ),
      C(
        "Own it was your log",
        {},
        {
          pay: -0.3,
          boss: 3,
          say: "Stopped from your wages. But he remembers you told him straight.",
        },
      ),
      C(
        "Blame the man who felled it",
        { odds: 0.5 },
        { say: "The faller was three counties off and couldn't argue." },
        {
          boss: -6,
          stress: 4,
          say: "The faller was standing right behind you.",
        },
      ),
    ],
  ),
  M(
    "millhand",
    "task",
    "masts",
    "Masts for the navy",
    "A navy agent has come up the river with the king's broad arrow on his papers: great white pines for masts, sawn true and hauled to the landing before the ice. It pays in silver and in being able to say you did it.",
    [
      C(
        "Take charge of the hauling",
        { check: { skill: "leadership" } },
        {
          pay: 0.9,
          renown: 1,
          xp: 12,
          say: "Forty oxen and a road of snow: the masts reached the landing whole.",
        },
        {
          health: -6,
          pay: 0.2,
          stress: 4,
          say: "A mast ran away on the slope and took a yoke of oxen with it.",
        },
      ),
      C(
        "Saw, and let others haul",
        {},
        { pay: 0.4, xp: 6, say: "Fair pay for fair sawing." },
      ),
      C(
        "Saw a few short for the town instead",
        { tip: "The king's pines are the king's, but the town pays cash" },
        {
          pay: 0.7,
          heat: 2,
          stress: 2,
          say: "Planks for the town, from a tree with the broad arrow on it. Nobody counts stumps. Usually.",
        },
      ),
    ],
    { when: north },
  ),
  M(
    "millhand",
    "trouble",
    "wages-owed",
    "Wages owing",
    "{boss} hasn't paid the hands in two months: the planters owe him, he says, and he owes everyone. The men are talking about downing tools. They're looking at you to say it first.",
    [
      C(
        "Speak for the men",
        { check: { skill: "persuasion", dc: 1 } },
        {
          pay: 0.5,
          renown: 1,
          boss: -3,
          say: "He found the money. He always could; he needed asking properly.",
        },
        {
          boss: -8,
          stress: 6,
          say: "He paid the others and stopped yours, for insolence.",
        },
      ),
      C(
        "Take your pay in planks",
        { tip: "Wood is money of a sort" },
        {
          pay: 0.2,
          boss: 2,
          say: "A cartload of planks. A shipwright took them at a fair price.",
        },
      ),
      C(
        "Wait it out",
        { odds: 0.6 },
        { say: "The planters paid; he paid." },
        {
          pay: -0.5,
          stress: 5,
          say: "He didn't pay. He'd have liked to, he says.",
        },
      ),
    ],
    { when: employed },
  ),
  M(
    "craftsman",
    "trouble",
    "runaway-apprentice",
    "The apprentice runs",
    "{boss}'s apprentice has gone in the night with a set of chisels and the good saw. There's a notice to go in the gazette, and a boy who was crying in the woodshed last week about his mother.",
    [
      C(
        "Go after him yourself",
        { check: { skill: "woodcraft" } },
        {
          boss: 6,
          xp: 8,
          say: "You found him on the post road with blisters and the saw. He came back, and the chisels.",
        },
        {
          stress: 4,
          say: "Two days on the road and not a sign. The notice goes in.",
        },
      ),
      C(
        "Put in the notice, and the reward",
        { cost: 1 },
        {
          boss: 2,
          say: '"Ran away from his master… a lad of fifteen, with a scar on his chin…" Somebody will read it.',
        },
      ),
      C(
        "Say you never saw which way he went",
        {},
        {
          boss: -4,
          stress: -2,
          say: "You saw exactly which way he went. Let him get there.",
        },
      ),
    ],
    { when: employed },
  ),
  M(
    "craftsman",
    "task",
    "tavern-sign",
    "A sign for the Sun and Anchor",
    "The new tavern wants a sign: a gilt sun, a blue anchor, and something that will make a thirsty man cross the street. The owner will pay well for it, and he talks to everyone.",
    [
      C(
        "Carve and gild it yourself",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.8,
          renown: 1.5,
          xp: 14,
          say: "It hangs over the street now and men cross for it. Two more taverns have asked.",
        },
        {
          pay: 0.1,
          stress: 4,
          say: "The sun came out looking alarmed. He paid, sadly.",
        },
      ),
      C(
        "A good plain painted board",
        {},
        { pay: 0.4, xp: 6, say: "Honest work; it'll last." },
      ),
      C(
        "Send him to the sign-painter",
        {},
        { boss: -2, say: "The sign-painter thanks you. The master doesn't." },
      ),
    ],
  ),
  M(
    "craftsman",
    "trouble",
    "undercut",
    "A cheaper man in town",
    "A journeyman just off the boat has set up across the lane and is selling chairs at two-thirds the price. They're not good chairs, but they're chairs, and your customers have noticed.",
    [
      C(
        "Show them the difference",
        { check: { skill: "trade" } },
        {
          pay: 0.5,
          renown: 0.5,
          xp: 10,
          say: "One leg each, on the scales in the market. Yours were oak; his were hope.",
        },
        {
          pay: -0.3,
          stress: 4,
          say: "Two-thirds the price turns out to be a good argument.",
        },
      ),
      C(
        "Take him on as a hand",
        { tip: "Better beside you than across the lane" },
        { pay: -0.2, boss: 4, xp: 6, say: "He's slow, but he's yours now." },
      ),
      C(
        "Wait for his chairs to break",
        { odds: 0.6 },
        { say: "They broke. People remembered whose didn't." },
        { pay: -0.5, stress: 3, say: "They didn't break fast enough." },
      ),
    ],
  ),
  M(
    "blacksmith",
    "task",
    "church-iron",
    "Ironwork for the new church",
    "The vestry want hinges, a latch fit for a cathedral and a weathercock for the steeple, and they'd like them by the consecration. The minister has drawn the cock himself. It looks like a hen.",
    [
      C(
        "Forge it all, cock and all",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.9,
          renown: 2,
          xp: 14,
          say: "The cock turns in the wind over {here}, unmistakably a cock. The minister claims he drew it so.",
        },
        {
          pay: 0.2,
          stress: 4,
          say: "The hinges are fine. The bird looks like the minister's drawing.",
        },
      ),
      C(
        "The hinges and latch only",
        {},
        { pay: 0.4, xp: 6, say: "Good plain iron on a good plain door." },
      ),
      C(
        "Hand it to the master",
        {},
        {
          boss: 1,
          say: "The master did it. The master will tell you about it.",
        },
      ),
    ],
  ),
  M(
    "blacksmith",
    "trouble",
    "kicking-stallion",
    "A stallion that kicks",
    "A planter's black stallion needs shoeing and has already put one groom in bed. It stands in the yard at {here} rolling its eye at the forge as if the forge owed it money.",
    [
      C(
        "Shoe him yourself",
        { check: { skill: "fighting" } },
        {
          pay: 0.6,
          renown: 1,
          xp: 10,
          say: "Four shoes, two bruises, one horse that now looks at you with respect.",
        },
        {
          health: -12,
          stress: 4,
          say: "He caught you on the hip and you saw the stars at noon.",
        },
      ),
      C(
        "Throw and hobble him",
        { tip: "Ropes and four men" },
        { pay: 0.3, stress: 2, say: "Undignified for everyone, and done." },
      ),
      C(
        "Send him away unshod",
        {},
        {
          boss: -3,
          say: "The planter took his horse and his custom elsewhere.",
        },
      ),
    ],
  ),
  M(
    "blacksmith",
    "trouble",
    "no-charcoal",
    "No charcoal",
    "The collier hasn't come down from the woods with the charcoal, the forge is eating the last of the heap, and there are three orders on the anvil.",
    [
      C(
        "Go up and burn your own",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.3,
          xp: 10,
          say: "A week in the woods tending a smoking mound. Black to the elbows, and a heap of charcoal.",
        },
        {
          health: -5,
          stress: 4,
          say: "The mound took fire inside and burned to ash. So did your eyebrows.",
        },
      ),
      C(
        "Buy sea coal from the ship",
        { cost: 3 },
        { xp: 4, say: "Dear, smoky, and it does the work." },
      ),
      C(
        "Down tools till he comes",
        { odds: 0.5 },
        {
          stress: -3,
          say: "He came the next day, full of excuses and charcoal.",
        },
        {
          pay: -0.5,
          boss: -3,
          say: "He came a fortnight later. Two customers didn't wait.",
        },
      ),
    ],
  ),
  M(
    "cooper",
    "trouble",
    "warped-staves",
    "Warped staves",
    "Someone left the stave pile uncovered in a week of rain and sun, and now half of it is twisted like a drunkard's walk. The fishing fleet wants casks regardless.",
    [
      C(
        "Steam and bend them true",
        { check: { skill: "craft" } },
        {
          pay: 0.4,
          xp: 12,
          boss: 4,
          say: "Steamed, bent and bound. Casks you'd trust with brine.",
        },
        {
          pay: -0.3,
          stress: 3,
          say: "They warped back the first hot day. The fleet sent them back.",
        },
      ),
      C(
        "Buy new staves from the mill",
        { cost: 2 },
        { boss: 2, say: "New staves, sound casks, a lighter purse." },
      ),
      C(
        "Use them as they are",
        { odds: 0.4 },
        { pay: 0.3, say: "Brine swells wood. They held." },
        {
          pay: -0.6,
          boss: -6,
          say: "Forty casks of mackerel on the quay, and the casks weeping.",
        },
      ),
    ],
  ),
  M(
    "cooper",
    "task",
    "great-tun",
    "A great tun for the brewer",
    "The brewer wants a vat as big as a cottage, bound in iron, to hold a whole brewing at once. Nobody in {here} has made one. Everybody in {here} will come to see it.",
    [
      C(
        "Raise it yourself",
        { check: { skill: "craft", dc: 2 } },
        {
          pay: 1.2,
          renown: 2,
          xp: 16,
          say: "It stands in the brew-house like a whale in a stable, and doesn't leak a drop.",
        },
        {
          pay: 0.2,
          stress: 5,
          say: "It leaked from eleven places at once. The brewer was very calm about it.",
        },
      ),
      C(
        "Make it as two smaller ones",
        {},
        {
          pay: 0.5,
          xp: 6,
          say: "Two vats. Not a wonder of the age; a sound piece of work.",
        },
      ),
      C(
        "Say it can't be done",
        {},
        {
          boss: -2,
          say: "A cooper from the next county did it. It leaks, you're glad to hear.",
        },
      ),
    ],
  ),
  M(
    "cooper",
    "trouble",
    "short-measure",
    "Short measure",
    "The gauger says your barrels hold a gallon short of the statute, and the merchant who bought them says you owe him two years of gallons.",
    [
      C(
        "Gauge them again before witnesses",
        { check: { skill: "letters" } },
        {
          renown: 1,
          xp: 8,
          say: "Full measure, and the gauger's rod was short. He's gauging his own rod now.",
        },
        { pay: -0.6, stress: 4, say: "A gallon short, as he said. You paid." },
      ),
      C(
        "Settle with the merchant",
        { cost: 3 },
        { say: "Three coins and a handshake. Cheaper than the court." },
      ),
      C(
        "Tell him to sue",
        { odds: 0.5 },
        { say: "He didn't." },
        { pay: -1, stress: 6, say: "He did." },
      ),
    ],
  ),
  M(
    "tanner",
    "trouble",
    "bark-dear",
    "Bark gone dear",
    "Oak bark for the pits has doubled in price since the ironworks began buying it for charcoal. Hides are piling up untanned and beginning to tell the whole street about it.",
    [
      C(
        "Strip your own in the woods",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.3,
          xp: 10,
          say: "Three weeks with a spud and a cart. The pits are full again.",
        },
        {
          health: -6,
          stress: 3,
          say: "The landowner caught you at his oaks. You paid in bruises.",
        },
      ),
      C(
        "Try hemlock bark",
        { odds: 0.6 },
        {
          xp: 8,
          say: "Hemlock tans red and cheap. The shoemakers grumble and buy it.",
        },
        { pay: -0.4, say: "Red, cheap, and stiff as a board." },
      ),
      C(
        "Pay the price",
        { cost: 3 },
        { say: "The pits are full; the purse isn't." },
      ),
    ],
  ),
  M(
    "tanner",
    "task",
    "calfskin",
    "Calfskin for a bookbinder",
    "A bookbinder from the capital wants fine calfskin, smooth as a lady's glove, for the colony's laws and a set of sermons. He's fussy and pays like it.",
    [
      C(
        "Curry it yourself",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.8,
          renown: 1,
          xp: 12,
          say: "The laws of the colony are bound in your leather. The sermons too, which seems fitting.",
        },
        {
          pay: 0.1,
          stress: 3,
          say: "He held a skin to the light and sighed. He took them for the sermons only.",
        },
      ),
      C(
        "Send him good common leather",
        {},
        { pay: 0.3, say: "Good enough for sermons, he says." },
      ),
      C(
        "Turn him down",
        {},
        { boss: -2, say: "He went to Philadelphia. Bookbinders always do." },
      ),
    ],
  ),
  M(
    "tanner",
    "trouble",
    "hides-spoil",
    "Hides in the heat",
    "A ship brought in a hundred green hides from the islands in the worst week of August, and they're turning in the yard faster than the pits can take them. The smell has reached the church.",
    [
      C(
        "Salt them down, day and night",
        { check: { skill: "craft" } },
        {
          pay: 0.5,
          xp: 10,
          say: "A hundred hides salted and stacked. The parson thanks you from a distance.",
        },
        {
          pay: -0.5,
          health: -3,
          say: "Forty were lost, and you're not sure about your sense of smell.",
        },
      ),
      C(
        "Sell half on to the glue-maker",
        {},
        { pay: 0.1, say: "Glue, not leather. But glue pays." },
      ),
      C(
        "Hope for a cool night",
        { odds: 0.3 },
        { say: "A northeaster came in. Saved by the weather." },
        {
          pay: -0.8,
          stress: 5,
          say: "No cool night. The selectmen came about the smell.",
        },
      ),
    ],
    { when: months(6, 8) },
  ),
  M(
    "ropewalker",
    "trouble",
    "walk-fire",
    "Fire in the ropewalk",
    "Tar, hemp and a quarter-mile shed of dry timber: a ropewalk burns like a fuse, and a spark from the tar kettle has found the far end.",
    [
      C(
        "Fight it from the inside",
        { check: { skill: "fighting" } },
        {
          renown: 2,
          boss: 8,
          xp: 8,
          say: "Wet sails and a chain of buckets: you saved all but the far end.",
        },
        {
          health: -14,
          stress: 6,
          say: "The smoke got you first. They pulled you out by the heels.",
        },
      ),
      C(
        "Get the hemp out",
        {},
        {
          boss: 4,
          stress: 3,
          say: "The shed burned; the hemp didn't. That's most of the money.",
        },
      ),
      C(
        "Run for the fire company",
        { odds: 0.5 },
        { say: "The engine came clanging and drowned it." },
        {
          pay: -0.4,
          stress: 4,
          say: "The engine came clanging and drowned the ashes.",
        },
      ),
    ],
  ),
  M(
    "ropewalker",
    "task",
    "privateer-rigging",
    "Rigging for a privateer",
    "A privateer is fitting out in haste: standing and running rigging, cables, the lot, in a week. The owners pay double and swear it's patriotic.",
    [
      C(
        "Spin day and night",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 1,
          xp: 12,
          say: "She sailed on your rope with the tide. They say she took a prize off the capes.",
        },
        {
          pay: 0.3,
          health: -5,
          stress: 5,
          say: "You finished; your hands may forgive you by spring.",
        },
      ),
      C(
        "A fair share, at a fair pace",
        {},
        { pay: 0.4, xp: 5, say: "Others spun the rest." },
      ),
      C(
        "Sign on her yourself",
        { tip: "Prize money, if she takes any", odds: 0.4 },
        {
          pay: 1.5,
          stress: 4,
          say: "A month at sea and a Spanish brig taken. Your share was handsome.",
        },
        {
          health: -8,
          stress: 6,
          say: "A month at sea, a fight, and nothing to show but a cut.",
        },
      ),
    ],
    { when: atWarNow },
  ),
  M(
    "ropewalker",
    "trouble",
    "soldiers-brawl",
    "Soldiers at the walk",
    "Off-duty soldiers have been coming down to the ropewalk at {here} asking for work at half wages, and one of them asked one of the spinners whether he wanted work too. There are cudgels coming out.",
    [
      C(
        "Stand between them",
        { check: { skill: "leadership" } },
        {
          renown: 1,
          boss: 4,
          say: "You sent the soldiers off with a jug and the spinners back to their wheels.",
        },
        { health: -10, stress: 5, say: "Everybody hit you, impartially." },
      ),
      C(
        "Fetch the master",
        {},
        {
          say: "The master fetched the colonel. The colonel fetched his temper.",
        },
      ),
      C(
        "Pick up a cudgel",
        { check: { skill: "fighting" } },
        {
          renown: 1,
          heat: 3,
          say: "The soldiers ran. The town is talking. The garrison is too.",
        },
        { health: -12, heat: 4, say: "The soldiers didn't run." },
      ),
    ],
    { when: port },
  ),
  M(
    "shipwright",
    "task",
    "launching",
    "Launching day",
    "The new brig sits on the ways greased and dressed in flags, the owner's wife holds the bottle, half of {here} is on the shore, and someone has to knock out the last shores at the right moment.",
    [
      C(
        "Knock out the shores yourself",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          renown: 2,
          xp: 10,
          say: "She went down the ways like a duck to a pond. The crowd cheered you by name.",
        },
        {
          health: -8,
          renown: -1,
          say: "She stuck halfway and you went in the river. The crowd cheered you by name.",
        },
      ),
      C(
        "Check the ways twice, and let the master",
        {},
        {
          boss: 4,
          xp: 5,
          say: "She slid sweetly. The master took the bow; you took his thanks.",
        },
      ),
      C(
        "Watch from the tavern window",
        {},
        { stress: -4, say: "A fine sight, through a fine glass of rum." },
      ),
    ],
  ),
  M(
    "shipwright",
    "trouble",
    "timber-short",
    "No knees for the frames",
    "The yard has run out of knees, the curved oak crooks that hold a ship's frame together, and the nearest standing oak with the right bend is on a farmer's woodlot ten miles up the river.",
    [
      C(
        "Go and choose the trees yourself",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.4,
          xp: 10,
          boss: 4,
          say: "Twelve crooks, each the shape of an elbow. The farmer drives a hard bargain and a good team.",
        },
        {
          pay: -0.3,
          stress: 4,
          say: "Twelve crooks, half of them rotten at the heart.",
        },
      ),
      C(
        "Make them of iron",
        { cost: 3, tip: "Dear, and the old hands won't like it" },
        {
          xp: 6,
          say: "Iron knees. Strong as the oak, and the old hands say she'll sink.",
        },
      ),
      C(
        "Wait for a raft to come down",
        { odds: 0.5 },
        { say: "A timber raft came down on the spring flood." },
        { pay: -0.5, boss: -3, say: "No raft. The yard stood idle a month." },
      ),
    ],
  ),
  M(
    "shipwright",
    "trouble",
    "caulkers",
    "The caulkers down mallets",
    "The caulkers say the oakum is rotten and the pitch is thin and they won't drive another seam until the master buys better. The hull has to be tight by the spring tide.",
    [
      C(
        "Talk them round",
        { check: { skill: "persuasion" } },
        {
          boss: 5,
          renown: 0.5,
          say: "Better oakum, a jug of rum, and the mallets went up again.",
        },
        {
          stress: 4,
          boss: -2,
          say: "They walked out. You drove seams yourself all week.",
        },
      ),
      C(
        "Caulk it yourself",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.4,
          xp: 12,
          say: "Your seams held. The caulkers came back, sheepish.",
        },
        { pay: -0.3, health: -4, say: "Your seams wept. So did you." },
      ),
      C(
        "Leave it to the master",
        {},
        { say: "He bought better oakum. They'd been right." },
      ),
    ],
  ),
  M(
    "carpenter",
    "task",
    "coffin",
    "A coffin by morning",
    "Old Mr Pell died at supper, which was sudden of him, and the family want him buried tomorrow in a coffin of cherry with brass handles, because he'd have wanted it, he having said so often and at length.",
    [
      C(
        "Work through the night",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          renown: 1,
          xp: 10,
          say: "Cherry, brass and a plate with his name. He'd have complained about the price.",
        },
        {
          pay: 0.2,
          stress: 4,
          say: "Pine, stained cherry, and a family who noticed.",
        },
      ),
      C(
        "A plain pine box, well made",
        {},
        { pay: 0.3, say: "A plain box. He was a plain man, under the talk." },
      ),
      C(
        "Send them to the undertaker",
        {},
        { boss: -1, say: "The undertaker sends his thanks, and a bottle." },
      ),
    ],
  ),
  M(
    "carpenter",
    "task",
    "barn-raising",
    "A barn raising",
    "A whole neighbourhood is coming to raise a barn in a day: forty men, the frames laid out, the women with dinner, and somebody has to call the lifts or the bents will come down on everybody.",
    [
      C(
        "Call the lifts",
        { check: { skill: "leadership" } },
        {
          renown: 2,
          xp: 10,
          stress: -3,
          say: '"Heave… heave…" and the frame stood by noon. The dinner was better than the barn.',
        },
        {
          health: -6,
          renown: -1,
          say: "A bent swung and came down. Nobody died; nobody let you forget it.",
        },
      ),
      C(
        "Work a pike pole",
        {},
        { xp: 5, stress: -4, say: "A good day's work and a better dinner." },
      ),
      C(
        "Bring the cider",
        { cost: 1 },
        {
          renown: 0.5,
          stress: -6,
          say: "Nobody remembers who raised the barn. Everybody remembers the cider.",
        },
      ),
    ],
    { when: months(4, 9) },
  ),
  M(
    "carpenter",
    "trouble",
    "parish-unpaid",
    "The parish won't pay",
    "You built the parish new pews last spring, and the vestry has voted, twice, to pay you next year. Last year they voted the same.",
    [
      C(
        "Stand up at the vestry",
        { check: { skill: "persuasion" } },
        {
          pay: 0.7,
          say: "Paid in full, and the churchwarden's undying dislike.",
        },
        {
          stress: 5,
          renown: -0.5,
          say: "They voted to pay you the year after next.",
        },
      ),
      C(
        "Take it in tithes owed you",
        {},
        {
          pay: 0.3,
          say: "You'll pay no church rate for two years. That's something.",
        },
      ),
      C(
        "Let it go, for your soul's sake",
        {},
        {
          renown: 0.5,
          stress: 2,
          say: "The minister preached on generous hearts. He looked at you while he did.",
        },
      ),
    ],
  ),
  M(
    "miller",
    "trouble",
    "cracked-stone",
    "The millstone cracks",
    "The upper runner stone has a crack across it you could lose a finger in, and the stone came from France and the next one is three months off by sea.",
    [
      C(
        "Bind it with iron hoops",
        { check: { skill: "craft" } },
        {
          pay: 0.3,
          xp: 12,
          say: "Hooped and dressed. She grinds again, a little loud.",
        },
        {
          health: -10,
          pay: -0.5,
          say: "It flew apart at full speed. Nobody was killed; a wall was.",
        },
      ),
      C(
        "Send for a new stone",
        { cost: 4 },
        {
          stress: 3,
          say: "Three months grinding slow on the old bed-stone. The new one is French and splendid.",
        },
      ),
      C(
        "Grind on carefully",
        { odds: 0.5 },
        { say: "It held till the new stone came. Somehow." },
        { pay: -0.6, health: -5, say: "It didn't hold." },
      ),
    ],
  ),
  M(
    "miller",
    "trouble",
    "low-water",
    "Low water",
    "The pond is down to mud and turtles, the wheel turns once a minute, and farmers are queued at the door with grain that won't keep.",
    [
      C(
        "Dam the upper brook",
        { check: { skill: "craft" } },
        {
          pay: 0.5,
          xp: 10,
          say: "A day with spades and a week of good water.",
        },
        {
          stress: 4,
          heat: 2,
          say: "The farmer upstream came with a lawyer about his brook.",
        },
      ),
      C(
        "Grind at night when it's fullest",
        {},
        {
          stress: 4,
          pay: 0.2,
          say: "Nights at the hopper. The flour came out; the miller nearly didn't.",
        },
      ),
      C(
        "Send them to the windmill",
        {},
        {
          pay: -0.4,
          boss: -2,
          say: "The windmill took your farmers. Some of them stayed.",
        },
      ),
    ],
    { when: months(7, 8) },
  ),
  M(
    "miller",
    "task",
    "export-flour",
    "Flour for the islands",
    "A merchant wants superfine flour, bolted three times and packed in barrels branded with the inspector's mark, for the sugar islands. The inspectors are strict, and the merchant stricter.",
    [
      C(
        "Bolt it yourself, three times",
        { check: { skill: "trade" } },
        {
          pay: 0.9,
          renown: 1,
          xp: 10,
          say: "Branded superfine. The merchant wants more next year.",
        },
        {
          pay: 0.1,
          stress: 4,
          say: 'The inspector branded it "common". The merchant sighed in a superfine way.',
        },
      ),
      C(
        "Common flour, honestly marked",
        {},
        { pay: 0.4, say: "Common flour, sold as common." },
      ),
      C(
        "Mix in a little meal and hope",
        { odds: 0.5 },
        { pay: 1, say: "The inspector was at dinner." },
        {
          pay: -0.5,
          renown: -2,
          say: "The inspector was not at dinner. Your barrels were staved on the wharf.",
        },
      ),
    ],
    { when: port },
  ),
  M(
    "brewer",
    "task",
    "spruce-beer",
    "A new beer",
    "A ship's surgeon swears that beer brewed with spruce tips keeps scurvy off, and the captains would buy it by the hogshead if anyone in {here} brewed it.",
    [
      C(
        "Brew a trial batch",
        { check: { skill: "craft" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 12,
          say: "It tastes of Christmas trees and the captains love it.",
        },
        {
          pay: -0.3,
          stress: 3,
          say: "It tastes of turpentine. Even the sailors noticed.",
        },
      ),
      C(
        "Ask the surgeon for his receipt",
        {},
        {
          xp: 6,
          pay: 0.3,
          say: "His receipt works, and he wants a barrel for it.",
        },
      ),
      C("Stick to ale", {}, { say: "Ale is ale." }),
    ],
  ),
  M(
    "brewer",
    "trouble",
    "mouldy-malt",
    "Mouldy malt",
    "The new malt came up the river in a wet hold, and half the sacks smell like a cellar in March.",
    [
      C(
        "Pick through it and brew the good",
        { check: { skill: "craft" } },
        {
          pay: 0.2,
          xp: 10,
          say: "A slow week with your sleeves rolled up, and a sound brew.",
        },
        { pay: -0.4, stress: 4, say: "The brew came out tasting of the hold." },
      ),
      C(
        "Send it back and buy again",
        { cost: 3 },
        { say: "The maltster was apologetic, and slow." },
      ),
      C(
        "Brew it all and sell it to the soldiers",
        { odds: 0.5 },
        { pay: 0.4, say: "The soldiers drank it and asked for more." },
        {
          renown: -1.5,
          boss: -4,
          say: "The soldiers drank it, and the surgeon came to see you.",
        },
      ),
    ],
  ),
  M(
    "brewer",
    "trouble",
    "licence",
    "The licence",
    "The justices are renewing the tavern licences, and the brewer who supplies a house that loses its licence loses a good customer. One of yours is the sort of house that might.",
    [
      C(
        "Speak for the house at the sessions",
        { check: { skill: "persuasion" } },
        {
          renown: 0.5,
          pay: 0.3,
          say: "The licence was renewed, on promise of better order.",
        },
        {
          pay: -0.4,
          stress: 4,
          say: "The licence was not renewed. They brew their own now, God help them.",
        },
      ),
      C(
        "Find another house to sell to",
        { check: { skill: "trade" } },
        { pay: 0.2, xp: 8, say: "The house by the ferry takes your ale now." },
        { pay: -0.3, say: "Every house had a brewer already." },
      ),
      C(
        "Leave it to the justices",
        {},
        { say: "They renewed it. They always do, for that house." },
      ),
    ],
  ),
  M(
    "distiller",
    "trouble",
    "molasses-duty",
    "The molasses duty",
    "The collector has orders to enforce the duty on French molasses, sixpence a gallon, which nobody has ever paid. Your stills drink French molasses. Everyone's do.",
    [
      C(
        "Buy it through Dutch papers",
        { check: { skill: "trade" } },
        {
          pay: 0.3,
          xp: 8,
          say: "French molasses with Dutch papers. The collector sees Dutch papers.",
        },
        { pay: -0.5, heat: 4, say: "The collector saw French molasses." },
      ),
      C(
        "Pay the duty",
        { cost: 3 },
        {
          renown: 0.5,
          say: "You paid. Nobody else did. They think you're mad.",
        },
      ),
      C(
        "Ask the collector to dinner",
        { check: { skill: "persuasion" } },
        { say: "A good dinner, and he's going to be very busy that week." },
        {
          heat: 3,
          stress: 3,
          say: "He came to dinner and stayed to count barrels.",
        },
      ),
    ],
    { when: since(1733) },
  ),
  M(
    "distiller",
    "task",
    "governor-cask",
    "A cask for the governor",
    "The governor's steward wants a cask of the best for His Excellency's birthday ball: old, clear, and fit to be toasted by people who drink Madeira.",
    [
      C(
        "Run a special distilling",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.6,
          renown: 2,
          xp: 10,
          say: "The governor's guests asked whose rum it was. The steward told them.",
        },
        {
          pay: 0.1,
          stress: 3,
          say: "Clear it was not. The steward was diplomatic.",
        },
      ),
      C(
        "Send your oldest cask",
        {},
        {
          pay: 0.4,
          renown: 0.5,
          say: "Old and good; the steward was satisfied.",
        },
      ),
      C(
        "Send ordinary rum in a fine cask",
        { odds: 0.6 },
        { pay: 0.5, say: "Nobody at a ball tastes anything after midnight." },
        {
          renown: -2,
          say: "Somebody at the ball tasted something before midnight.",
        },
      ),
    ],
  ),
  M(
    "distiller",
    "trouble",
    "drunk-hand",
    "A still-hand in his cups",
    "One of the still-hands has been tasting the low wines all week and is now asleep in the fire-room with his pipe lit.",
    [
      C(
        "Wake him and sober him up",
        { check: { skill: "leadership" } },
        {
          boss: 4,
          say: "A bucket of cold water and a lecture. He's been sober since. Mostly.",
        },
        { health: -5, stress: 3, say: "He woke swinging." },
      ),
      C(
        "Put the pipe out and let him sleep",
        {},
        { stress: 1, say: "He woke ashamed and worked double." },
      ),
      C(
        "Turn him off",
        {},
        { boss: 2, pay: -0.2, say: "One fewer hand, and one fewer fire." },
      ),
    ],
  ),
  // ------------------------------------------------ the sea
  M(
    "sailor",
    "trouble",
    "drunk-mate",
    "The mate is drunk on watch",
    "A lee shore under the bow, the wind backing, and the mate asleep against the binnacle with a bottle in his coat. The helmsman is looking at you.",
    [
      C(
        "Take the deck yourself",
        { check: { skill: "seamanship", dc: 1 } },
        {
          renown: 2,
          xp: 14,
          say: "You wore ship and clawed off. The captain came up, looked, and said nothing, which is the highest praise there is.",
        },
        {
          health: -8,
          stress: 6,
          say: "You wore ship too late and touched the shoal. She came off; you'll be hearing of it.",
        },
      ),
      C(
        "Wake the captain",
        {},
        { boss: 2, say: "The captain took the deck, and the mate's place." },
      ),
      C(
        "Wake the mate",
        { odds: 0.6 },
        {
          stress: 2,
          say: "He woke, swore, and handled her like a master. Then went back to sleep.",
        },
        {
          health: -6,
          stress: 5,
          say: "He woke and put her about the wrong way.",
        },
      ),
    ],
  ),
  M(
    "sailor",
    "task",
    "pig-iron",
    "Pig iron to stow",
    "Forty ton of pig iron to stow before the tide, and the mate wants it low and tight, because pig iron that shifts in a blow takes the ship with it.",
    [
      C(
        "Run the stowing",
        { check: { skill: "seamanship" } },
        {
          pay: 0.5,
          xp: 12,
          boss: 4,
          say: "Stowed like a cobbler's last. She rode easy all the way.",
        },
        {
          health: -6,
          stress: 3,
          say: "A pig dropped on your foot. They stow themselves after that, it seems.",
        },
      ),
      C("Haul with the others", {}, { xp: 4, say: "Heavy, dull, and done." }),
      C(
        "Slip ashore till it's done",
        { odds: 0.6 },
        { stress: -3, say: "Nobody missed you." },
        { boss: -5, say: "The mate missed you." },
      ),
    ],
    { when: port },
  ),
  M(
    "sailor",
    "trouble",
    "wages-arrears",
    "Wages in arrears",
    "The owners won't pay a penny till the voyage is done and the cargo sold, and the voyage has been done for a month while they wait for the price to rise.",
    [
      C(
        "Petition the owners for the crew",
        { check: { skill: "persuasion" } },
        {
          pay: 0.6,
          renown: 1,
          say: "They paid half on account, sooner than have a crew talking in every tavern.",
        },
        {
          boss: -5,
          stress: 4,
          say: "They paid everyone except whoever wrote the petition.",
        },
      ),
      C(
        "Wait for the sale",
        { odds: 0.7 },
        { pay: 0.3, say: "The price rose; they paid, and a little more." },
        {
          pay: -0.4,
          stress: 4,
          say: "The price fell. They paid what they called fair.",
        },
      ),
      C(
        "Ship out on another vessel",
        {},
        {
          pay: 0.2,
          stress: 2,
          say: "A new ship. Your old wages are a debt you'll collect someday.",
        },
      ),
    ],
    { when: port },
  ),
  M(
    "fisherman",
    "trouble",
    "fog-ledges",
    "Fog on the ledges",
    "The fog came down like a wet sail while you were on the grounds, and somewhere between you and home are the ledges that took the Parkers' boat last spring.",
    [
      C(
        "Steer by the lead and the swell",
        { check: { skill: "seamanship" } },
        {
          pay: 0.3,
          xp: 14,
          say: "Sounding every cable. Home by dusk, and the catch with you.",
        },
        {
          health: -10,
          pay: -0.5,
          say: "You touched the ledge, bailed all night, and came home without the catch.",
        },
      ),
      C(
        "Anchor and wait it out",
        {},
        { stress: 4, say: "A cold night, a lifting dawn, and home." },
      ),
      C(
        "Follow the next boat's bell",
        { odds: 0.6 },
        { say: "Old Hosea knew the way and rang it." },
        { stress: 6, say: "Old Hosea was lost too." },
      ),
    ],
  ),
  M(
    "fisherman",
    "task",
    "herring-run",
    "The herring run",
    "The herring are running up the river so thick you could walk on them, and every cart in the county is coming down for them. Nets, barrels and salt, now.",
    [
      C(
        "Fish it night and day",
        { check: { skill: "seamanship" } },
        {
          pay: 0.9,
          xp: 10,
          say: "Barrels and barrels. Your hands smell of herring till midsummer.",
        },
        { pay: 0.2, health: -4, say: "The weir broke and so did the night." },
      ),
      C(
        "Sell from the bank to the carts",
        { check: { skill: "trade" } },
        { pay: 0.6, xp: 8, say: "A shilling a cart and no wet feet." },
        { pay: 0.1, say: "Everyone was selling from the bank." },
      ),
      C(
        "Take a basket for the house",
        {},
        {
          stress: -3,
          say: "Herring for a week. Everyone is happy except the cat, who is overwhelmed.",
        },
      ),
    ],
    { when: months(3, 4) },
  ),
  M(
    "fisherman",
    "trouble",
    "foreign-boats",
    "Strangers on the grounds",
    "Boats you don't know are on your grounds off {here}, setting lines across yours and talking in an accent from somewhere you don't like.",
    [
      C(
        "Run down and cut their lines",
        { check: { skill: "fighting" } },
        {
          renown: 1,
          pay: 0.2,
          say: "They went, and their lines went with the tide.",
        },
        { health: -10, pay: -0.4, say: "They cut yours, and a little of you." },
      ),
      C(
        "Hail them and talk",
        { check: { skill: "persuasion" } },
        {
          renown: 0.5,
          xp: 6,
          say: "There's room for both, it turned out, and they knew where the halibut were.",
        },
        { stress: 3, say: "There wasn't room for both, according to them." },
      ),
      C(
        "Fish another ground",
        {},
        { pay: -0.2, say: "A poorer ground, and peace." },
      ),
    ],
  ),
  M(
    "whaler",
    "task",
    "trying-out",
    "Trying out",
    "The whale is alongside and the try-pots are lit: three days of cutting blubber and boiling oil in smoke that blacks every face on deck. The master wants it done before the sharks take their share.",
    [
      C(
        "Take the cutting spade",
        { check: { skill: "seamanship" } },
        {
          pay: 0.7,
          xp: 12,
          say: "Ninety barrels of oil in the hold. You'll smell of it till Easter.",
        },
        {
          health: -8,
          xp: 4,
          say: "You went over the side onto the whale. The sharks were very interested.",
        },
      ),
      C(
        "Mind the try-pots",
        {},
        { pay: 0.3, health: -2, say: "Hot, black and done." },
      ),
      C(
        "Mind the sharks",
        { odds: 0.6 },
        {
          renown: 0.5,
          say: "You kept them off with a spade and a vocabulary.",
        },
        { health: -6, say: "One of them came up the side to argue." },
      ),
    ],
    { when: openWater },
  ),
  M(
    "whaler",
    "trouble",
    "drift-whale",
    "A drift whale",
    "A dead whale has come ashore on the beach between two villages, and both say it's theirs, and the minister says the Lord sent it to whoever gets the oil out first.",
    [
      C(
        "Argue it before the justice",
        { check: { skill: "persuasion" } },
        {
          pay: 0.8,
          renown: 1,
          say: "The justice divided it, two parts to you. It smelled like a fortune.",
        },
        { stress: 4, say: "The justice divided it, two parts to them." },
      ),
      C(
        "Get the oil out first",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          xp: 8,
          say: "By the time the others came with lawyers, you'd come with barrels.",
        },
        {
          health: -6,
          stress: 4,
          say: "Both villages got there first, and onto you.",
        },
      ),
      C(
        "Share it out",
        {},
        {
          pay: 0.3,
          renown: 1,
          say: "Half each, and a feast on the beach. The minister approves.",
        },
      ),
    ],
  ),
  M(
    "whaler",
    "task",
    "sperm-whale",
    "A sperm whale",
    '"There she blows, and breaches!" A sperm whale, a great bull, the kind whose head is full of the finest oil in the world, and the kind that turns and fights.',
    [
      C(
        "Stand in the bow with the iron",
        { check: { skill: "seamanship", dc: 2 } },
        {
          pay: 1.5,
          renown: 2,
          xp: 16,
          say: "Fast to him on the first throw. Spermaceti for the candlemakers of three colonies.",
        },
        {
          health: -16,
          stress: 6,
          say: "He turned and smashed the boat. You came up under it.",
        },
      ),
      C(
        "Pull an oar",
        {},
        {
          pay: 0.5,
          xp: 6,
          say: "Your boat towed him in. Your arms will tell you about it.",
        },
      ),
      C(
        "Let the boats go without you",
        {},
        { boss: -4, say: "They took him without you. They mentioned it." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  // ------------------------------------------------ trade
  M(
    "clerk",
    "task",
    "bill-of-exchange",
    "A bill on London",
    "A planter offers {boss} a bill of exchange on a London house for his tobacco money: paper you can't eat, from a man you've never met, on a house that may or may not exist.",
    [
      C(
        "Look into the house's credit",
        { check: { skill: "letters" } },
        {
          pay: 0.6,
          boss: 6,
          xp: 12,
          say: "Sound as the Bank. The bill was taken, and the profit too.",
        },
        {
          pay: -0.4,
          boss: -5,
          say: "The bill came back protested. The house had failed in May.",
        },
      ),
      C(
        "Take it at a discount",
        {},
        { pay: 0.2, boss: 2, say: "Safe and a little mean, which is banking." },
      ),
      C("Ask for coin", {}, { boss: -1, say: "He went to another merchant." }),
    ],
    { when: employed },
  ),
  M(
    "clerk",
    "trouble",
    "forged-note",
    "A doubtful note",
    "A customer pays with a bill of credit so crisp it might have been printed last night, and the signatures look a touch too much alike.",
    [
      C(
        "Hold it to the light and compare",
        { check: { skill: "letters" } },
        {
          renown: 1,
          boss: 5,
          xp: 10,
          say: "Forged. The watch took him, and the gazette took your name.",
        },
        { pay: -0.5, boss: -3, say: "You took it. It was forged." },
      ),
      C(
        "Ask for coin instead, politely",
        {},
        {
          pay: -0.2,
          say: "He hadn't any. He left with his goods unbought and his note unchanged.",
        },
      ),
      C(
        "Take it",
        { odds: 0.6 },
        { say: "It was good." },
        { pay: -0.7, boss: -5, say: "It wasn't." },
      ),
    ],
  ),
  M(
    "clerk",
    "task",
    "cipher-letter",
    "Letters in cipher",
    "{boss} writes to his correspondents abroad in a private cipher, and wants you to keep the key and copy the letters: prices, ships, and rather more about the governor than a merchant ought to know.",
    [
      C(
        "Learn the cipher properly",
        { check: { skill: "letters" } },
        {
          pay: 0.4,
          boss: 6,
          xp: 12,
          say: "You read it now like plain English. You know things about the governor too.",
        },
        {
          stress: 3,
          say: "A garbled letter went to Lisbon. A ship went to the wrong port.",
        },
      ),
      C(
        "Copy it without reading",
        {},
        { boss: 2, say: "What you don't know, nobody can squeeze out of you." },
      ),
      C(
        "Mention it to the governor's secretary",
        { odds: 0.5 },
        {
          renown: 1,
          boss: -2,
          say: "The secretary was grateful, quietly. {boss} wonders why the governor smiles at him so.",
        },
        { boss: -12, stress: 6, say: "The secretary mentioned it to {boss}." },
      ),
    ],
    { when: employed },
  ),
  M(
    "shopkeeper",
    "trouble",
    "shoplifter",
    "Light fingers",
    "Ribbons, a paper of pins and a pound of sugar have gone from the counter this week, and the last time it happened a boy with long sleeves had been in.",
    [
      C(
        "Watch for him and catch him at it",
        { check: { skill: "stealth" } },
        {
          pay: 0.3,
          renown: 0.5,
          say: "Caught with a ribbon up each sleeve. His mother paid, and boxed his ears.",
        },
        { stress: 3, say: "You watched all week; the sugar went anyway." },
      ),
      C(
        "Keep the pins behind the counter",
        {},
        { pay: -0.1, say: "A little less sold; a little less stolen." },
      ),
      C(
        "Call the constable on him",
        { odds: 0.5 },
        { renown: 0.5, say: "The constable caught him." },
        {
          renown: -1,
          say: "The constable caught the wrong boy, and the town took his side.",
        },
      ),
    ],
  ),
  M(
    "shopkeeper",
    "task",
    "london-goods",
    "Goods from London",
    "A ship is in with a shipment of London goods (calicoes, buttons, looking-glasses, fashionable everything) and the shops that see it first will get the best.",
    [
      C(
        "Be first on the wharf",
        { check: { skill: "trade" } },
        {
          pay: 0.9,
          xp: 10,
          say: "The best calicoes are in your window, and every lady in {here} has walked past it twice.",
        },
        {
          pay: 0.1,
          stress: 3,
          say: "The ladies' shop got there first. You have the buttons.",
        },
      ),
      C(
        "Buy what's left, cheap",
        {},
        { pay: 0.3, say: "What's left is cheap, and so are your customers." },
      ),
      C("Wait for the next ship", {}, { say: "There's always a next ship." }),
    ],
    { when: port },
  ),
  M(
    "shopkeeper",
    "trouble",
    "bad-bills",
    "Bad paper in the till",
    "Three bills of the colony's paper money in the till this week are counterfeit, and there's a notice in the gazette that the shopkeeper who passes one on can be fined.",
    [
      C(
        "Trace them to who paid",
        { check: { skill: "letters" } },
        {
          renown: 1,
          xp: 8,
          say: "All three came from the same man, who left town the same night. The constable thanks you.",
        },
        { pay: -0.4, say: "No telling. They're paper." },
      ),
      C("Burn them", {}, { pay: -0.4, renown: 0.5, say: "An honest loss." }),
      C(
        "Pass them on",
        { odds: 0.6 },
        {
          heat: 2,
          say: "They went out in change. Somebody else's trouble now.",
        },
        {
          pay: -1,
          heat: 5,
          renown: -1,
          say: "One came back with a constable attached.",
        },
      ),
    ],
  ),
  M(
    "innkeeper",
    "trouble",
    "skipped-reckoning",
    "A guest skips the reckoning",
    "The gentleman in the best room ate like a regiment for a week, ran up a slate as long as your arm, and went out the back window last night with his boots in his hand.",
    [
      C(
        "Ride after him",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.6,
          renown: 0.5,
          say: "You caught him at the ferry and the ferryman was on your side.",
        },
        { stress: 4, say: "He had a better horse." },
      ),
      C(
        "Put his trunk up for sale",
        {},
        {
          pay: 0.2,
          say: "His trunk held a wig, two volumes of sermons and a brick. Some of it sold.",
        },
      ),
      C(
        "Post his name in the tavern",
        {},
        {
          renown: 0.3,
          say: "Every innkeeper on the road will know his face now.",
        },
      ),
    ],
  ),
  M(
    "innkeeper",
    "task",
    "court-week",
    "Court week",
    "The county court sits this week: the justices, the lawyers, the jurors, the parties and everybody who has come to watch, and every one of them wants a bed, a dinner and a drink.",
    [
      C(
        "Double the prices",
        { check: { skill: "trade" } },
        {
          pay: 1,
          xp: 8,
          say: "Every bed full twice over at twice the price. The justices complained and paid.",
        },
        {
          pay: 0.3,
          renown: -1,
          say: "They went to the other house. Lawyers have long memories.",
        },
      ),
      C(
        "Keep the prices fair",
        {},
        {
          pay: 0.5,
          renown: 1,
          say: "Full house, fair prices, and the justices' good word.",
        },
      ),
      C(
        "Hire extra hands",
        { cost: 2 },
        {
          pay: 0.8,
          say: "Two girls from the farm and a boy for the horses. Nobody waited for a drink all week.",
        },
      ),
    ],
  ),
  M(
    "innkeeper",
    "trouble",
    "gauger",
    "The gauger",
    "The excise man is in the cellar with his rod, gauging every cask, and the way he's humming suggests he's finding more than you entered.",
    [
      C(
        "Show him the books",
        { check: { skill: "letters" } },
        {
          say: "The books balanced, mostly. He went away humming something else.",
        },
        { pay: -0.6, stress: 4, say: "The books didn't." },
      ),
      C(
        "Give him a bottle of the good",
        { odds: 0.6 },
        { say: "He counted slower after the bottle." },
        { pay: -0.8, heat: 3, say: "He counted the bottle too." },
      ),
      C(
        "Pay what he finds",
        {},
        { pay: -0.4, say: "Duty paid, like an honest man." },
      ),
    ],
  ),
  // ------------------------------------------------ the learned and the law
  M(
    "newsman",
    "trouble",
    "pied-type",
    "Pied type",
    "The devil dropped the whole forme of the front page on the floor the night before printing: a thousand letters in a heap, and the post rider leaves at seven.",
    [
      C(
        "Reset it by candlelight",
        { check: { skill: "letters" } },
        {
          xp: 12,
          boss: 5,
          say: 'Reset by dawn, with only one misprint. The governor has been described as "a man of great ports".',
        },
        {
          stress: 6,
          renown: -0.5,
          say: "Out late, and full of misprints. The gazette across the street enjoyed it.",
        },
      ),
      C(
        "Print a half sheet of the rest",
        {},
        {
          boss: -1,
          say: "A thin paper this week. The advertisements went in; the news didn't.",
        },
      ),
      C(
        "Make the devil do it",
        { odds: 0.4 },
        { say: "The devil did it, and did it well. Fear is a teacher." },
        {
          boss: -4,
          stress: 3,
          say: "The devil did it, badly, and it went out.",
        },
      ),
    ],
  ),
  M(
    "newsman",
    "trouble",
    "no-paper",
    "The paper runs out",
    "No paper from England for two months: the ships are late, the stock is down to a quire and a half, and the paper mill upriver wants twice the price for a grey sheet you could strain soup through.",
    [
      C(
        "Strike a bargain with the mill",
        { check: { skill: "trade" } },
        {
          pay: 0.2,
          xp: 8,
          say: "A fair price and a promise to print the miller's name. Grey paper, but paper.",
        },
        { pay: -0.5, say: "Twice the price, as he said." },
      ),
      C(
        "Advertise for rags",
        { tip: '"Ready money for clean linen rags"' },
        {
          renown: 0.5,
          say: "Every housewife's rag bag came to the door. The mill is grateful; so are you.",
        },
      ),
      C(
        "Skip a number",
        {},
        {
          boss: -3,
          renown: -0.5,
          say: "No paper this week. The readers wrote in, on paper.",
        },
      ),
    ],
  ),
  M(
    "newsman",
    "task",
    "governor-speech",
    "The governor's speech",
    'The governor\'s speech to the assembly must be set and printed by morning, word for word, with every "whereas" in its place, because the assembly will read it against what they heard.',
    [
      C(
        "Set it yourself, exactly",
        { check: { skill: "letters", dc: 1 } },
        {
          pay: 0.6,
          renown: 1,
          xp: 12,
          say: "Word for word. The secretary sent his compliments; the assembly found nothing to complain of except the speech.",
        },
        {
          stress: 5,
          renown: -1,
          say: 'A "not" went missing. The assembly found the speech much improved.',
        },
      ),
      C(
        "Set it plainly and fast",
        {},
        { pay: 0.3, say: "On time and nearly right." },
      ),
      C(
        "Add a few remarks of your own",
        { odds: 0.4 },
        {
          renown: 2,
          say: "The country party loved your remarks. The governor hasn't read them yet.",
        },
        { renown: -1, heat: 4, say: "The governor read them." },
      ),
    ],
  ),
  M(
    "official",
    "task",
    "census",
    "Counting the people",
    "The Board of Trade in London wants to know how many people there are in the colony, how many of them could carry a musket, and how many sheep. The returns from the counties are a disgrace.",
    [
      C(
        "Ride the counties and count",
        { check: { skill: "letters" } },
        {
          pay: 0.6,
          renown: 1,
          xp: 12,
          say: "A proper return, sheep and all. The Board of Trade will never read it, but the governor did.",
        },
        {
          stress: 5,
          say: "The sheep were counted twice and the Germans not at all.",
        },
      ),
      C(
        "Copy last year's and add a tenth",
        { odds: 0.7 },
        { say: "Nobody noticed. Nobody ever notices." },
        { boss: -6, say: "Somebody noticed." },
      ),
      C(
        "Let the counties send what they send",
        {},
        { boss: -2, say: "The return went in, a disgrace as usual." },
      ),
    ],
  ),
  M(
    "official",
    "trouble",
    "lost-seal",
    "The seal of the colony",
    "The great seal of the colony, which makes a piece of paper into a law, is not in its box. It was there on Tuesday. The governor wants to seal a proclamation on Friday.",
    [
      C(
        "Search every office in the house",
        { check: { skill: "stealth" } },
        {
          boss: 8,
          xp: 6,
          say: "In the secretary's coat, in the secretary's closet, under the secretary's wig. Nobody will speak of it.",
        },
        {
          stress: 6,
          say: "Not a sign. You searched the governor's own desk, and he saw you.",
        },
      ),
      C(
        "Tell the governor now",
        {},
        {
          boss: -2,
          say: "He sent for the silversmith. A new seal, and an inquiry nobody will finish.",
        },
      ),
      C(
        "Have a copy cut quietly",
        { odds: 0.5, cost: 3 },
        {
          say: "The silversmith is discreet, and the proclamation went out sealed.",
        },
        {
          boss: -10,
          heat: 4,
          say: "The old seal turned up the day after, and someone compared them.",
        },
      ),
    ],
  ),
  M(
    "official",
    "trouble",
    "precedence",
    "Who goes in first",
    "At the governor's dinner the receiver-general's wife and the speaker's wife have both stopped at the dining-room door, and neither will go through second. Everybody is looking at the secretary's clerk. That's you.",
    [
      C(
        "Settle it with a precedent",
        { check: { skill: "letters" } },
        {
          renown: 1,
          boss: 4,
          say: "An order of 1692, which you invented on the spot. Both ladies went in together, satisfied.",
        },
        {
          renown: -1,
          stress: 4,
          say: "Your precedent was challenged by a husband with a better memory.",
        },
      ),
      C(
        "Charm them both",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "One went in on your arm and the other on the governor's. Diplomacy.",
        },
        {
          stress: 4,
          say: "You've made two enemies who agree on nothing but you.",
        },
      ),
      C("Fetch the governor", {}, { say: "He went in first himself." }),
    ],
  ),
  M(
    "law",
    "task",
    "will",
    "A will to draw",
    "A dying planter wants his will drawn tonight, and his three sons are sitting outside the door already not speaking to each other.",
    [
      C(
        "Draw it watertight",
        { check: { skill: "letters" } },
        {
          pay: 0.7,
          renown: 1,
          xp: 12,
          say: "Signed, witnessed, sealed. The sons will have to find something else to fight about.",
        },
        {
          pay: 0.2,
          stress: 4,
          say: "A clause with two meanings. The sons have found both.",
        },
      ),
      C(
        "Draw it as he says it",
        {},
        {
          pay: 0.4,
          say: "Exactly as he said it, including the part about the second son's wife.",
        },
      ),
      C(
        "Suggest he leave something to the lawyer",
        { odds: 0.3 },
        { pay: 1.5, renown: -1, say: "He did. The sons will remember it." },
        { renown: -2, say: "He had the strength left to throw you out." },
      ),
    ],
  ),
  M(
    "law",
    "trouble",
    "bought-juror",
    "A juror bought",
    "Your client's case is good, but the other side's attorney has been seen buying drinks for a juror, and the juror has been seen buying a new horse.",
    [
      C(
        "Expose it to the court",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 2,
          pay: 0.4,
          say: "The juror was struck off and the attorney fined. Your client won.",
        },
        {
          renown: -1,
          stress: 5,
          say: "No proof, said the bench, and frowned at you.",
        },
      ),
      C(
        "Settle out of court",
        {},
        { pay: 0.2, say: "Half a loaf. Your client grumbles and eats it." },
      ),
      C(
        "Buy a juror of your own",
        { odds: 0.5 },
        {
          pay: 0.8,
          heat: 3,
          say: "Eleven to one, and the one was bought twice.",
        },
        { renown: -3, heat: 6, say: "Your juror was the attorney's cousin." },
      ),
    ],
  ),
  M(
    "law",
    "task",
    "old-deeds",
    "A title in old deeds",
    'A client\'s whole claim rests on a deed from the first years of the colony, written in a hand nobody reads now, with a boundary that runs "to the great white oak". The oak is gone.',
    [
      C(
        "Dig through the old records",
        { check: { skill: "letters", dc: 1 } },
        {
          pay: 0.8,
          xp: 14,
          say: "A survey of 1641 found the oak's stump. The claim stands.",
        },
        {
          stress: 4,
          say: "The records were eaten by mice in 1690. So, it seems, was the claim.",
        },
      ),
      C(
        "Find old men who remember",
        { check: { skill: "persuasion" } },
        {
          pay: 0.5,
          renown: 0.5,
          say: "Three old men remembered the oak, each in a different place; one was right.",
        },
        {
          say: "The old men remembered the oak, and the cider at the boundary walk, and not much else.",
        },
      ),
      C(
        "Advise him to settle",
        {},
        { pay: 0.2, say: "He settled. Oaks are mortal; so are lawsuits." },
      ),
    ],
  ),
  M(
    "preacher",
    "task",
    "hasty-wedding",
    "A wedding in haste",
    "A young couple at the door want marrying today, without the banns, and the reason is plain to everyone but the bride's father, who is on his way.",
    [
      C(
        "Marry them, banns or no",
        { check: { skill: "faith" } },
        {
          renown: 1,
          stress: -2,
          say: "Married by noon. The father arrived at one, and there was nothing to do but drink their health.",
        },
        {
          renown: -1,
          boss: -4,
          say: "The bishop's commissary has heard about the banns.",
        },
      ),
      C(
        "Talk to the father first",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "He blustered, he wept, he gave her away." },
        {
          stress: 5,
          say: "He took her home. The child will be born a scandal.",
        },
      ),
      C(
        "Read the banns three Sundays",
        {},
        { say: "The law is the law. Everyone counted the months anyway." },
      ),
    ],
  ),
  M(
    "preacher",
    "trouble",
    "vestry-pay",
    "The vestry and the tobacco",
    "Your salary is paid in tobacco by the pound, and this year's is the worst leaf in the county, and the vestry say a parson should not mind such things.",
    [
      C(
        "Preach on the labourer and his hire",
        { check: { skill: "faith" } },
        {
          pay: 0.5,
          renown: 0.5,
          say: "A sermon on Luke ten, verse seven. The vestry found better tobacco.",
        },
        { boss: -4, say: "The vestry found the sermon unbecoming." },
      ),
      C(
        "Sell it for what it fetches",
        {},
        { pay: -0.3, say: "It fetched what it was worth." },
      ),
      C(
        "Write to the bishop",
        { odds: 0.4 },
        { pay: 0.6, say: "The bishop wrote to the vestry. They paid in coin." },
        {
          stress: 4,
          say: "The bishop wrote back in eighteen months, about something else.",
        },
      ),
    ],
  ),
  M(
    "preacher",
    "task",
    "frontier-circuit",
    "Baptisms on the frontier",
    "The settlers beyond the falls have had no minister in three years: children unbaptised, couples unmarried, dead unburied in proper form. They've sent a boy forty miles to ask.",
    [
      C(
        "Ride the circuit",
        { check: { skill: "woodcraft" } },
        {
          renown: 2,
          xp: 10,
          stress: 2,
          say: "Thirty-one baptisms, six weddings and a sermon in a barn. They fed you like a bishop.",
        },
        {
          health: -8,
          renown: 1,
          say: "Fever at the second settlement, but the baptisms got done.",
        },
      ),
      C(
        "Send a lay reader with your blessing",
        {},
        {
          renown: 0.5,
          say: "He read the prayers. It's not a sacrament, but it's something.",
        },
      ),
      C(
        "Tell them to come to church",
        {},
        { renown: -1, say: "Forty miles. They won't." },
      ),
    ],
    { when: months(4, 9) },
  ),
  M(
    "physician",
    "task",
    "duel-surgeon",
    "A surgeon at dawn",
    "Two young gentlemen have an affair of honour at dawn behind the racecourse, and their seconds want a surgeon present who can keep his mouth shut afterwards.",
    [
      C(
        "Attend, with your bag",
        { check: { skill: "medicine" } },
        {
          pay: 0.8,
          renown: 0.5,
          xp: 12,
          say: "A ball through the shoulder. You had it out on the grass, and nobody will hear it from you.",
        },
        {
          stress: 6,
          heat: 3,
          say: "A ball through the lung. You did what could be done, which was not enough.",
        },
      ),
      C(
        "Try to talk them out of it",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "They shook hands and went to breakfast. Your fee is the breakfast.",
        },
        { stress: 3, say: "They thanked you and fired anyway. Both missed." },
      ),
      C(
        "Decline: it's against the law",
        {},
        { say: "They found another surgeon. Both missed, you hear." },
      ),
    ],
  ),
  M(
    "physician",
    "trouble",
    "unpaid-bill",
    "The planter's bill",
    "You saw a planter's whole house through the measles last winter, nine visits and a great deal of physic, and he now says the children would have got better anyway.",
    [
      C(
        "Sue for it",
        { check: { skill: "letters" } },
        {
          pay: 0.8,
          say: "The court agreed the children had help. Paid in full, with costs.",
        },
        { stress: 5, pay: -0.2, say: "The jury were all his tenants." },
      ),
      C("Take it in tobacco", {}, { pay: 0.3, say: "Good leaf, at least." }),
      C(
        "Let it go and say so in the tavern",
        {},
        {
          renown: 0.5,
          say: "Nobody in the county will forget whose children got better on credit.",
        },
      ),
    ],
  ),
  M(
    "physician",
    "task",
    "amputation",
    "A crushed leg",
    "A stevedore's leg was crushed under a hogshead on the wharf, and it will have to come off, and he's a big man who has had a pint of rum and is not yet persuaded.",
    [
      C(
        "Take it off, quick and clean",
        { check: { skill: "medicine", dc: 1 } },
        {
          pay: 0.5,
          renown: 1.5,
          xp: 14,
          say: "Forty seconds with the saw. He'll walk on a peg and curse your name with gratitude.",
        },
        {
          stress: 6,
          xp: 6,
          say: "He didn't survive the night. Nobody would have, you tell yourself.",
        },
      ),
      C(
        "Try to save it",
        { odds: 0.3 },
        {
          renown: 2,
          say: "Splinted and dressed and prayed over, and it healed. You can hardly believe it.",
        },
        {
          stress: 6,
          say: "Mortification by the third day, and then it had to come off anyway, too late.",
        },
      ),
      C(
        "Send for the barber-surgeon",
        {},
        { boss: -2, say: "The barber came with his saw and his opinions." },
      ),
    ],
    { when: port },
  ),
  M(
    "apothecary",
    "task",
    "quack",
    "A quack in the market",
    "A travelling doctor in a purple coat is selling an elixir in the market at {here} that cures the ague, the gout, melancholy and the French disease, and the crowd is buying.",
    [
      C(
        "Expose him from the crowd",
        { check: { skill: "medicine" } },
        {
          renown: 2,
          pay: 0.3,
          say: "Coloured water, treacle and a great deal of brandy. The crowd turned and bought your bark instead.",
        },
        {
          renown: -1,
          stress: 3,
          say: "The crowd liked his patter better than your chemistry.",
        },
      ),
      C(
        "Sell an elixir of your own",
        { check: { skill: "trade" } },
        {
          pay: 0.7,
          say: "Yours at least does no harm, and the bottles are prettier.",
        },
        {
          renown: -1,
          say: "The crowd could tell the difference: his was stronger.",
        },
      ),
      C(
        "Let him be: he'll be gone by Monday",
        {},
        { say: "He was gone by Monday, and so was the crowd's money." },
      ),
    ],
  ),
  M(
    "apothecary",
    "trouble",
    "mercury",
    "A gentleman's complaint",
    "A gentleman of the town comes in by the back door, with his collar up, wanting mercury for a complaint he got in Lisbon and his wife mustn't know of.",
    [
      C(
        "Treat him, and say nothing",
        { check: { skill: "medicine" } },
        {
          pay: 0.8,
          xp: 10,
          say: "A course of mercury and a course of silence. He pays well for both.",
        },
        {
          stress: 4,
          pay: 0.3,
          say: "The mercury made him worse before it made him better, and he blames you.",
        },
      ),
      C(
        "Send him to the physician",
        {},
        { say: "The physician will charge him double, and tell his wife." },
      ),
      C(
        "Charge him for discretion",
        { odds: 0.6 },
        { pay: 1.2, say: "A fee for the mercury and a fee for the back door." },
        { renown: -1, say: "He found a cheaper apothecary, and a louder one." },
      ),
    ],
  ),
  M(
    "apothecary",
    "task",
    "physic-garden",
    "A physic garden",
    "The plot behind the shop could grow your own simples (sage, rue, comfrey, foxglove), and save a deal of money on what comes dear from London.",
    [
      C(
        "Plant it properly",
        { check: { skill: "farming" } },
        {
          pay: 0.5,
          xp: 10,
          stress: -3,
          say: "Rows of simples, labelled in Latin. The neighbours ask you what everything's for.",
        },
        {
          stress: 2,
          say: "The rabbits ate the comfrey and left the foxglove, which shows judgement.",
        },
      ),
      C(
        "Buy from the herb woman",
        {},
        {
          say: "She knows more than you do about what grows here, and says so.",
        },
      ),
      C(
        "Leave it to the weeds",
        {},
        { say: "Dock and nettle. Both medicinal, technically." },
      ),
    ],
    { when: months(2, 5) },
  ),
  M(
    "midwife",
    "task",
    "secret-birth",
    "A birth in secret",
    "A young woman with no husband is in labour in a loft over the stable, and by law the midwife must ask her, at the worst of it, the name of the father. She's begged you not to.",
    [
      C(
        "Deliver her, and ask nothing",
        { check: { skill: "medicine" } },
        {
          xp: 12,
          renown: 0.5,
          stress: 2,
          say: "A daughter, and no name asked. The justices will grumble at your report.",
        },
        {
          stress: 6,
          say: "A hard birth. Mother and child live, barely; the justices want to know why you didn't ask.",
        },
      ),
      C(
        "Ask, as the law says",
        {},
        {
          renown: 0.5,
          stress: 4,
          say: "She named him. Half the town knew already; the other half will by Sunday.",
        },
      ),
      C(
        "Ask, and keep it to yourself",
        { check: { skill: "stealth" } },
        {
          xp: 6,
          say: "You know, and the justices don't, and that's how it'll stay.",
        },
        {
          stress: 5,
          say: "Your report said nothing; your face said a good deal.",
        },
      ),
    ],
  ),
  M(
    "midwife",
    "trouble",
    "midnight-storm",
    "Called out in a storm",
    "A farmer's boy is hammering at the door at midnight: his mother's time has come, they're across the river, and the river is up and the wind is tearing at the shutters.",
    [
      C(
        "Go now, by the ford",
        { check: { skill: "woodcraft" } },
        {
          renown: 1.5,
          xp: 10,
          say: "Wet to the waist, but in time. Twins, both bawling.",
        },
        {
          health: -10,
          renown: 1,
          say: "The ford nearly had you. You arrived late and half drowned, and the baby was born fine without you.",
        },
      ),
      C(
        "Wait for the ferry at first light",
        { odds: 0.5 },
        { say: "She waited for you. Babies are sometimes polite." },
        {
          stress: 6,
          say: "The baby didn't wait, and the neighbour who caught it did it wrong.",
        },
      ),
      C(
        "Send the boy back with instructions",
        { check: { skill: "persuasion" } },
        {
          xp: 6,
          say: "The boy remembered every word. So did his aunt, who did it all.",
        },
        { stress: 5, say: "The boy remembered half of it." },
      ),
    ],
  ),
  M(
    "midwife",
    "task",
    "laying-out",
    "Laying out the dead",
    "A neighbour has died in the night, and a midwife is sent for to lay out the dead as well as to bring in the living: wash the body, close the eyes, and see that the women of the house don't fall apart.",
    [
      C(
        "Do it, and comfort the house",
        { check: { skill: "persuasion" } },
        {
          pay: 0.3,
          renown: 1,
          say: "Coins on the eyes, a clean shift, and the widow able to receive callers by noon.",
        },
        {
          stress: 5,
          say: "The widow fell apart anyway. So, a little, did you.",
        },
      ),
      C(
        "Do it, and leave",
        {},
        { pay: 0.3, stress: 2, say: "Done properly, and quickly." },
      ),
      C(
        "Send your girl",
        {},
        { boss: -1, say: "Your girl did it. She'll be a midwife yet." },
      ),
    ],
  ),
  M(
    "schoolmaster",
    "trouble",
    "firewood",
    "No firewood",
    "Each family is supposed to send a load of firewood for the schoolhouse stove. This year three have, and the ink is freezing in the wells.",
    [
      C(
        "Send home the children whose fathers haven't",
        { check: { skill: "persuasion" } },
        {
          renown: 0.5,
          say: "Wood arrived by the cartload the next morning, with remarks.",
        },
        {
          renown: -1,
          stress: 4,
          say: "Their fathers sent remarks, but no wood.",
        },
      ),
      C(
        "Cut it yourself on Saturdays",
        {},
        { health: -2, stress: 3, say: "Warm schoolroom, aching back." },
      ),
      C(
        "Teach them in your own kitchen",
        {},
        {
          stress: 4,
          renown: 0.5,
          say: "Twelve scholars round your hearth. Your landlady has given notice twice.",
        },
      ),
    ],
    { when: winterHere },
  ),
  M(
    "schoolmaster",
    "task",
    "examination",
    "The examination",
    "The minister and the selectmen come to examine the scholars before the town meeting votes on your salary. The first form is word-perfect on the catechism. The second form is the second form.",
    [
      C(
        "Drill them till they shine",
        { check: { skill: "letters" } },
        {
          pay: 0.5,
          renown: 1,
          xp: 8,
          say: "Even the second form construed a line of Virgil. Your salary is voted, with a pound more.",
        },
        {
          stress: 5,
          say: 'A boy was asked the chief end of man and said "supper".',
        },
      ),
      C(
        "Put the clever ones in front",
        { odds: 0.6 },
        { pay: 0.3, say: "The minister asked only the front row." },
        { renown: -1, say: "The minister asked the back row." },
      ),
      C(
        "Let them be examined as they are",
        {},
        { say: "As they are. The salary is voted, as it is." },
      ),
    ],
  ),
  M(
    "schoolmaster",
    "trouble",
    "rich-dunce",
    "A rich man's son",
    "The son of the richest man in {here} cannot read, will not learn, and has bitten the usher. His father expects him at college in three years.",
    [
      C(
        "Take him in hand",
        { check: { skill: "letters", dc: 1 } },
        {
          pay: 0.6,
          renown: 1,
          say: "By midsummer he could read the gazette, slowly. His father sent a ham.",
        },
        { stress: 6, health: -3, say: "He bit you too." },
      ),
      C(
        "Tell his father the truth",
        { check: { skill: "persuasion" } },
        {
          renown: 0.5,
          say: "The father heard you out and sent the boy to sea. He's happy there.",
        },
        {
          pay: -0.4,
          say: "The father took the boy, and his fees, to a better school.",
        },
      ),
      C(
        "Flatter the father",
        {},
        {
          pay: 0.3,
          stress: 3,
          say: 'The boy is "a late bloomer". The ham came anyway.',
        },
      ),
    ],
  ),
  M(
    "surveyor",
    "task",
    "town-plat",
    "Laying out a town",
    "The assembly has voted a new town at the falls, and someone must lay it out: streets, a square for the court-house, lots for the church and the market, all on a slope nobody has seen.",
    [
      C(
        "Lay it out yourself",
        { check: { skill: "letters" } },
        {
          pay: 1,
          renown: 2,
          xp: 12,
          say: "Straight streets, a handsome square, and one lot set aside in your own name.",
        },
        {
          pay: 0.3,
          stress: 4,
          say: "The square is in a bog. Future generations will curse you.",
        },
      ),
      C(
        "Copy the plan of the capital",
        {},
        { pay: 0.4, say: "A grid. Grids are never wrong, only dull." },
      ),
      C(
        "Take the lots in fees",
        { odds: 0.6 },
        {
          pay: 0.2,
          renown: 0.5,
          say: "Three lots on the square. In ten years they'll be worth something.",
        },
        { stress: 3, say: "Three lots in the bog." },
      ),
    ],
  ),
  M(
    "surveyor",
    "trouble",
    "needle-lies",
    "The needle lies",
    "There's iron in these hills: the compass swings five degrees between one station and the next, and every line you've run this week is wrong by an amount you can't say.",
    [
      C(
        "Take the sun and correct for it",
        { check: { skill: "letters", dc: 1 } },
        {
          pay: 0.4,
          xp: 14,
          say: "Noon sights and an almanac. The lines are true; your fame among surveyors is assured.",
        },
        {
          stress: 5,
          say: "The lines are wrong by an amount you can now say exactly.",
        },
      ),
      C(
        "Run them again by the blazes",
        {},
        { stress: 3, xp: 6, say: "A week lost, and the lines right." },
      ),
      C(
        "Return them as they are",
        { odds: 0.5 },
        { say: "Nobody will check for fifty years." },
        { renown: -2, say: "Somebody checked in five." },
      ),
    ],
  ),
  M(
    "surveyor",
    "trouble",
    "line-objected",
    "Men at the line",
    "Men of the nation whose country this was have come out of the trees to watch you run the line, and their speaker is asking, reasonably, by whose leave.",
    [
      C(
        "Stop, and talk",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          xp: 8,
          say: "Pipe, presents, and a line that bends round their cornfields. The patentee will complain.",
        },
        { stress: 4, say: "They broke your chain and sent you home with it." },
      ),
      C(
        "Give presents and go on",
        { cost: 2 },
        {
          say: "They took the presents and watched you go on, which isn't the same as leave.",
        },
      ),
      C(
        "Run the line regardless",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.5,
          say: "Run and blazed. The trouble will be someone else's.",
        },
        { health: -12, stress: 6, say: "The trouble was yours." },
      ),
    ],
  ),
  // ------------------------------------------------ the woods and the nations
  M(
    "trapper",
    "trouble",
    "wolverine",
    "A wolverine on the line",
    "Something has gone down your line ahead of you: every trap sprung, every marten eaten to the tail, the bait cache dug up and fouled. The tracks are as broad as your hand. Wolverine: the trappers' devil.",
    [
      C(
        "Set a deadfall for it",
        { check: { skill: "woodcraft", dc: 1 } },
        {
          pay: 0.8,
          renown: 1,
          xp: 14,
          say: "A week's patience and a log on a trigger. Its pelt makes the best ruff in the country, and the line is yours again.",
        },
        {
          health: -10,
          xp: 6,
          say: "It found the deadfall first, and then it found your hand.",
        },
      ),
      C(
        "Move the line two creeks over",
        {},
        {
          pay: -0.3,
          stress: 2,
          say: "Two days' walk and new blazes. Fewer furs this month, and no devil.",
        },
      ),
      C(
        "Carry on, and curse it",
        { odds: 0.5 },
        { say: "It moved on, as they do." },
        {
          pay: -0.6,
          stress: 4,
          say: "It stayed the winter. So did your losses.",
        },
      ),
    ],
    { when: winterHere },
  ),
  M(
    "trapper",
    "trouble",
    "thaw",
    "A thaw in the dead of winter",
    "A warm wind in the middle of the winter: the snow gone to slush, the creeks running, and the pelts in your cache going soft and slipping their hair. Prime fur is cold fur.",
    [
      C(
        "Flesh and stretch them in a hurry",
        { check: { skill: "craft" } },
        {
          pay: 0.2,
          xp: 12,
          say: "Two days without sleep at the stretchers. Most of the pelts kept their hair.",
        },
        {
          pay: -0.5,
          stress: 4,
          say: "Half of them slipped anyway. The post will give you half for the rest.",
        },
      ),
      C(
        "Carry them to the post now",
        { check: { skill: "trade" } },
        {
          pay: 0.1,
          xp: 6,
          say: "Sold before they turned, at a price that made you wince.",
        },
        { pay: -0.3, say: "The factor smelt them before he saw them." },
      ),
      C(
        "Hope the cold comes back",
        { odds: 0.4 },
        { say: "The cold came back in two days. Cold fur." },
        {
          pay: -0.8,
          stress: 5,
          say: "It didn't. A season's furs, gone to stink.",
        },
      ),
    ],
    { when: months(0, 2) },
  ),
  M(
    "trapper",
    "trouble",
    "neighbours-snares",
    "Snares across your line",
    "A settler has cleared a farm at the head of your creek and his boys have strung snares all down your line for rabbits, and caught two of your sets and a fox you'd been after for a month.",
    [
      C(
        "Go up and talk to him",
        { check: { skill: "persuasion" } },
        {
          pay: 0.3,
          xp: 8,
          say: "He didn't know whose line it was. He does now, and his boys have the other creek.",
        },
        {
          stress: 4,
          say: "He says the creek runs through his land and so does the law.",
        },
      ),
      C(
        "Lay a complaint before the justice",
        { check: { skill: "letters" } },
        {
          renown: 0.5,
          say: "The justice drew the line on a map, which the boys can't read but their father can.",
        },
        { pay: -0.3, say: "The justice is the settler's brother-in-law." },
      ),
      C(
        "Pull his snares, every one",
        { check: { skill: "stealth" } },
        { say: "Every snare gone in a night. His boys blame the fairies." },
        { health: -8, heat: 2, say: "The settler was waiting with a cudgel." },
      ),
    ],
  ),
  M(
    "trapper",
    "task",
    "prime-furs",
    "Prime furs before the freeze",
    "A fur buyer from the coast is at the post, paying a premium for prime beaver and marten if they're in his canoes before the river freezes. That's a week of hard paddling away.",
    [
      C(
        "Take the furs down yourself",
        { check: { skill: "trade" } },
        {
          pay: 1,
          xp: 12,
          say: "In his canoes with a day to spare, at his best price. A good season.",
        },
        {
          pay: 0.2,
          stress: 4,
          say: "He'd bought his fill the day before you came.",
        },
      ),
      C(
        "Sell to the post as usual",
        {},
        { pay: 0.4, say: "The post's price, the post's way." },
      ),
      C(
        "Hold them for the spring price",
        { odds: 0.5 },
        { pay: 1.2, say: "The spring price was high. Patience pays." },
        { pay: -0.2, say: "The spring price was low. Patience doesn't." },
      ),
    ],
    { when: months(9, 10) },
  ),
  M(
    "hunter",
    "task",
    "deer-drive",
    "The fall deer drive",
    "The leaves are down and the deer are fat. The village will fire the woods in a great ring and drive the deer to the river, where the hunters wait, and someone must say where the ring closes.",
    [
      C(
        "Lead the drive",
        { check: { skill: "leadership" } },
        {
          pay: 0.8,
          renown: 2,
          xp: 12,
          say: "The ring closed at the bend, and the village will eat all winter.",
        },
        {
          renown: -1,
          stress: 4,
          say: "The fire ran the wrong way and the deer ran the other.",
        },
      ),
      C(
        "Wait at the river with your bow",
        { check: { skill: "woodcraft" } },
        { pay: 0.5, xp: 10, say: "Four deer to your arrows." },
        { say: "The deer came everywhere but past you." },
      ),
      C(
        "Help carry the meat",
        {},
        { stress: -3, say: "Carrying is honourable too, the women say." },
      ),
    ],
    { when: months(9, 10) },
  ),
  M(
    "hunter",
    "trouble",
    "game-scarce",
    "The deer are few",
    "The traders' hunters have been through the valley taking deer for skins and leaving the meat to rot, and there are fewer deer this fall than anyone remembers.",
    [
      C(
        "Hunt further, beyond the hills",
        { check: { skill: "woodcraft", dc: 1 } },
        {
          pay: 0.6,
          xp: 12,
          say: "A long trail and a good valley the traders don't know.",
        },
        {
          health: -8,
          stress: 4,
          say: "A long trail, a cold camp and not much to show.",
        },
      ),
      C(
        "Ask the council to speak to the traders",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "The council spoke, and the traders' hunters went west.",
        },
        { stress: 3, say: "The traders listened politely and went on." },
      ),
      C(
        "Fish instead",
        {},
        { pay: -0.2, say: "Fish is food. It isn't venison." },
      ),
    ],
  ),
  M(
    "hunter",
    "trouble",
    "thin-ice",
    "Thin ice",
    "You followed a moose out onto the lake and the ice is talking under your feet the way ice does before it stops holding.",
    [
      C(
        "Lie flat and crawl back",
        { check: { skill: "woodcraft" } },
        {
          xp: 12,
          say: "On your belly like a snake, all the way to the reeds. The moose watched.",
        },
        {
          health: -12,
          stress: 5,
          say: "Through to the waist. You got out; your feet are still deciding.",
        },
      ),
      C(
        "Run for the moose",
        { odds: 0.3 },
        {
          pay: 1,
          renown: 1,
          say: "You reached it and the ice held both of you. Meat for a month.",
        },
        { health: -16, stress: 6, say: "The ice didn't hold either of you." },
      ),
      C(
        "Stand still and call",
        {},
        {
          stress: 4,
          say: "Your brother brought a pole. You'll hear about this at every feast.",
        },
      ),
    ],
    { when: winterHere },
  ),
  M(
    "warrior",
    "task",
    "war-party",
    "A war party asks you along",
    "A war party is going out against an old enemy who killed a man of the village last summer. The war leader has struck the post and is looking round the fire at who will strike it next.",
    [
      C(
        "Strike the post and go",
        { check: { skill: "fighting", dc: 1 } },
        {
          renown: 3,
          xp: 14,
          say: "Back with honours and a captive, and no one of ours lost. The old men sing about it.",
        },
        {
          health: -14,
          renown: 1,
          say: "Back with a wound and a story. The village honours the wound.",
        },
      ),
      C(
        "Speak for a payment instead",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "The enemy's council paid the dead man's family in wampum. A death covered, not repeated.",
        },
        { renown: -1, say: "Nobody wanted to hear about payments." },
      ),
      C("Stay and guard the village", {}, { say: "Someone has to." }),
    ],
  ),
  M(
    "warrior",
    "trouble",
    "horse-thieves",
    "Horses gone",
    "Raiders from over the hills came in the night and the village's horses went with them, and the young men want to follow now, before the trail cools.",
    [
      C(
        "Track them down",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.6,
          renown: 2,
          xp: 12,
          say: "Three days on the trail. The horses came home, and a few of theirs with them.",
        },
        {
          health: -10,
          stress: 4,
          say: "The trail led into an ambush. You came home with fewer horses than you left with.",
        },
      ),
      C(
        "Send word to their council",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "Their elders sent back the horses and the young men who took them, ashamed.",
        },
        {
          stress: 3,
          say: "Their elders said they knew nothing of any horses.",
        },
      ),
      C(
        "Let them go",
        {},
        {
          pay: -0.4,
          stress: 3,
          say: "Horses can be had again. Face can't, the young men say.",
        },
      ),
    ],
  ),
  M(
    "warrior",
    "task",
    "teach-boys",
    "Teaching the boys",
    "The boys of the village are old enough to learn the bow and the war club and how to move through the woods without a sound. The elders ask you.",
    [
      C(
        "Teach them hard",
        { check: { skill: "leadership" } },
        {
          renown: 1.5,
          xp: 10,
          say: "By the moon's end they moved like foxes. One will be better than you.",
        },
        { stress: 4, say: "One of them shot another in the leg. Not badly." },
      ),
      C(
        "Teach them gently",
        {},
        {
          renown: 0.5,
          stress: -3,
          say: "They learned, and they liked you for it.",
        },
      ),
      C(
        "Say you're no teacher",
        {},
        { renown: -0.5, say: "The elders asked someone who was." },
      ),
    ],
  ),
  M(
    "grower",
    "trouble",
    "cattle-corn",
    "Cattle in the corn",
    "The colonists' cattle run loose as their law lets them, and this morning they're in the village's corn, eating the green ears and trampling the beans. Their owners say a fence is your business.",
    [
      C(
        "Go to their justice",
        { check: { skill: "persuasion", dc: 1 } },
        {
          pay: 0.5,
          renown: 1,
          say: "The justice made them pay for the corn. Once.",
        },
        { stress: 5, say: "The justice said a fence is your business." },
      ),
      C(
        "Build a fence of brush",
        { check: { skill: "craft" } },
        {
          xp: 10,
          say: "A brush fence the length of the field. The cattle look at it and wait.",
        },
        { pay: -0.3, say: "The cattle walked through it." },
      ),
      C(
        "Kill one and eat it",
        { odds: 0.5 },
        {
          pay: 0.4,
          say: "Their law says a trespassing beast may be impounded. Ours says something simpler.",
        },
        { heat: 5, renown: -1, say: "The owner came with a constable." },
      ),
    ],
    { when: months(5, 8) },
  ),
  M(
    "grower",
    "trouble",
    "dry-summer",
    "No rain",
    "No rain since the corn was planted. The leaves are rolling up like cigars, and the old women are talking about the dance.",
    [
      C(
        "Carry water from the river",
        { check: { skill: "farming" } },
        {
          xp: 12,
          health: -3,
          say: "Water by the jar, every day for a month, and the corn lived.",
        },
        {
          health: -6,
          pay: -0.4,
          say: "Water by the jar, every day for a month, and the corn died anyway.",
        },
      ),
      C(
        "Dance for rain",
        { check: { skill: "faith" } },
        {
          renown: 1,
          stress: -4,
          say: "Two nights of dancing and on the third day it rained. Nobody is surprised.",
        },
        {
          stress: 3,
          say: "Two nights of dancing and on the third day the sun.",
        },
      ),
      C(
        "Plant again after the rain comes",
        {},
        { pay: -0.3, say: "A late planting. A thin harvest." },
      ),
    ],
    { when: months(5, 7) },
  ),
  M(
    "grower",
    "task",
    "seed-keeping",
    "The seed corn",
    "It falls to you this year to choose the seed corn for the village: the best ears, braided and hung, to be eaten by no one whatever the winter brings.",
    [
      C(
        "Choose with care",
        { check: { skill: "farming" } },
        {
          renown: 1.5,
          xp: 10,
          say: "The best ears of every row, braided and hung high. Next year's corn will be good corn.",
        },
        { renown: -0.5, say: "Mice found the braids." },
      ),
      C(
        "Ask the old women",
        {},
        { renown: 0.5, say: "They knew, of course. They always know." },
      ),
      C(
        "Trade for seed from the south",
        { check: { skill: "trade" } },
        {
          renown: 1,
          xp: 8,
          say: "A new red corn from the south, quick and sweet.",
        },
        {
          pay: -0.3,
          say: "A new red corn from the south that doesn't like it here.",
        },
      ),
    ],
    { when: harvestHere },
  ),
  M(
    "healer",
    "task",
    "soul-sickness",
    "A sickness of the soul",
    "A young man of the village has stopped eating and sleeps all day and says his soul has gone out of him and won't come back. His mother has brought tobacco and asked you.",
    [
      C(
        "Call his soul home",
        { check: { skill: "faith" } },
        {
          renown: 2,
          xp: 12,
          say: "A night of singing and smoke. In the morning he asked for food.",
        },
        {
          stress: 5,
          say: "His soul stayed where it was. His mother is taking him to an older healer.",
        },
      ),
      C(
        "Ask what he dreamed",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "He'd dreamed of a girl in another village. A dream must be fulfilled; a marriage is being talked of.",
        },
        { say: "He wouldn't say." },
      ),
      C(
        "Give him bitter roots and rest",
        {},
        { xp: 4, say: "He rests. He's bitter. He'll recover, slowly." },
      ),
    ],
  ),
  M(
    "healer",
    "task",
    "gathering-roots",
    "Gathering roots",
    "The spring roots are up: snakeroot, bloodroot, ginseng in the dark hollows. A good healer gathers enough for the year now, and gives the earth tobacco for each.",
    [
      C(
        "Go far for the best",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.5,
          xp: 12,
          say: "Ginseng too, the old kind. The traders pay in silver for it.",
        },
        {
          health: -5,
          say: "A long walk, a turned ankle, and an ordinary basket.",
        },
      ),
      C(
        "Gather near the village",
        {},
        { xp: 6, say: "Enough for the year, if no great sickness comes." },
      ),
      C(
        "Teach the girls what to gather",
        {},
        {
          renown: 1,
          say: "Two of them have the eye. One day they'll be healers.",
        },
      ),
    ],
    { when: months(3, 5) },
  ),
  M(
    "healer",
    "trouble",
    "colonist-patient",
    "A colonist's child",
    "A colonist has come to the village with a child burning with fever and nobody of his own who can help. If you treat the child and it dies, there will be talk in the town that it was you.",
    [
      C(
        "Treat the child",
        { check: { skill: "medicine" } },
        {
          renown: 2,
          xp: 12,
          say: "Willow bark and cold water and a song. The child lived; the father brought a kettle.",
        },
        {
          stress: 6,
          heat: 3,
          say: "The child died. Now there's talk in the town.",
        },
      ),
      C(
        "Give him medicine to take home",
        {},
        { renown: 0.5, say: "What happens there is not on you." },
      ),
      C(
        "Send him away",
        {},
        { stress: 3, say: "He went. You think about the child." },
      ),
    ],
  ),
  M(
    "trader",
    "task",
    "new-post",
    "A new trading post",
    "A colony has built a trading post at the forks, with a factor who wants the village's furs and will pay better than the old traders, for now.",
    [
      C(
        "Strike a lasting price",
        { check: { skill: "trade" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 10,
          say: "A price set in wampum and words. He'll keep it, for a while.",
        },
        { pay: 0.2, say: "His price for now is his price for now." },
      ),
      C(
        "Play him against the old traders",
        { check: { skill: "persuasion" } },
        { pay: 1, say: "Both raised their prices. Both are sulking." },
        { pay: -0.3, stress: 3, say: "Both are sulking, and neither raised." },
      ),
      C(
        "Stay with the old traders",
        {},
        { renown: 0.5, say: "Old friends are old friends." },
      ),
    ],
  ),
  M(
    "trader",
    "trouble",
    "damp-powder",
    "Damp powder",
    "The gunpowder you traded for last moon was damp, and three hunters have come back with nothing because their guns wouldn't fire. They want their furs back.",
    [
      C(
        "Take it back to the trader",
        { check: { skill: "persuasion" } },
        {
          pay: 0.4,
          say: "He gave good powder for bad, and a little more to keep you sweet.",
        },
        { pay: -0.5, stress: 4, say: "He said it was dry when it left him." },
      ),
      C(
        "Give the hunters back their furs",
        {},
        {
          pay: -0.5,
          renown: 1,
          say: "Fair is fair. The hunters will trade with you again.",
        },
      ),
      C(
        "Dry it in the sun and say nothing",
        { odds: 0.5 },
        { say: "It dried and fired." },
        { renown: -2, say: "It dried and didn't." },
      ),
    ],
  ),
  M(
    "trader",
    "trouble",
    "credit-owed",
    "Furs owed",
    "Last fall you gave powder and cloth on credit to hunters going out for the winter. Spring is here and half of them have paid in furs and the other half have stories.",
    [
      C(
        "Go round and collect",
        { check: { skill: "persuasion" } },
        {
          pay: 0.6,
          say: "Most paid; the stories were better than the excuses.",
        },
        {
          stress: 4,
          pay: -0.2,
          say: "The stories were good. The furs weren't there.",
        },
      ),
      C(
        "Take it in summer work",
        {},
        {
          pay: 0.2,
          say: "They'll carry your canoes to the post. It's something.",
        },
      ),
      C(
        "Forgive it",
        {},
        {
          renown: 1.5,
          pay: -0.4,
          say: "A trader who forgives is talked about at every fire.",
        },
      ),
    ],
    { when: months(3, 5) },
  ),
  M(
    "speaker",
    "task",
    "condolence",
    "Words of condolence",
    "A great man of a neighbouring village has died, and you must go with the belts and say the words that wipe the tears from their eyes and clear their throats so they can speak again.",
    [
      C(
        "Say the words yourself",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          xp: 12,
          say: "Every word in its place, every belt laid down. Their village will remember who spoke.",
        },
        {
          renown: -1,
          stress: 4,
          say: "You forgot the third belt's words. Nobody said anything.",
        },
      ),
      C(
        "Go with an elder who knows them",
        {},
        { renown: 0.5, xp: 6, say: "He spoke; you listened, and learned." },
      ),
      C(
        "Send the belts with a runner",
        {},
        { renown: -1, say: "Belts without words are only shells." },
      ),
    ],
  ),
  M(
    "speaker",
    "trouble",
    "rival-speaker",
    "Another voice",
    "A man of another clan has gone to the colonists' governor and spoken as if he spoke for the village. He said things the council never said, and the governor believed him.",
    [
      C(
        "Go to the governor yourself",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 2,
          say: "You set the governor straight, with the council's belt in your hand. The other man's words are smoke.",
        },
        {
          stress: 5,
          say: "The governor has two speakers now, and believes whichever is convenient.",
        },
      ),
      C(
        "Bring it before the council",
        {},
        {
          renown: 1,
          say: "The council has spoken: he speaks for no one. The governor may not hear of it for a year.",
        },
      ),
      C(
        "Let it lie",
        {},
        { renown: -1, stress: 3, say: "The governor still believes him." },
      ),
    ],
  ),
  M(
    "speaker",
    "task",
    "belt-record",
    "Reading the belts",
    "The council wants to know what was promised at a treaty long ago, and the belts that hold it are brought out of the bag: purple and white, and only the old ones remember how to read them.",
    [
      C(
        "Read them before the council",
        { check: { skill: "letters" } },
        {
          renown: 2,
          xp: 10,
          say: "The belts remembered everything the colonists' papers forgot. The council was satisfied.",
        },
        {
          renown: -0.5,
          say: "You read one belt as another. An old woman corrected you, gently.",
        },
      ),
      C(
        "Ask the oldest woman to read them",
        {},
        {
          renown: 0.5,
          xp: 6,
          say: "She read them as her mother taught her. You'll know them next time.",
        },
      ),
      C(
        "Say the papers are clearer",
        {},
        { renown: -1, say: "Nobody agreed." },
      ),
    ],
  ),
  M(
    "maker",
    "task",
    "beadwork",
    "Beadwork for a treaty",
    "A treaty is coming, and the council wants a belt and a pouch worked with the finest quillwork and beads, to be given to the governor and remembered.",
    [
      C(
        "Make it your finest",
        { check: { skill: "craft", dc: 1 } },
        {
          renown: 2,
          xp: 14,
          say: "The governor hung it in his house. People will come to see it for a hundred years.",
        },
        { stress: 4, xp: 6, say: "The dye ran. It will do." },
      ),
      C(
        "Make it with the other women",
        {},
        { renown: 0.5, xp: 6, say: "Many hands. It was beautiful." },
      ),
      C(
        "Let a younger maker try",
        {},
        { renown: 0.5, say: "She did well. She'll do better." },
      ),
    ],
  ),
  M(
    "maker",
    "trouble",
    "trader-order",
    "A hundred pots",
    "A colonial trader wants a hundred pots by the new moon, cheap, to sell at the coast. It's more pots than the village makes in a year.",
    [
      C(
        "Organise the whole village",
        { check: { skill: "leadership" } },
        {
          pay: 0.8,
          renown: 1,
          say: "A hundred pots, and every family paid in cloth.",
        },
        { stress: 5, say: "Sixty pots, and the trader paid for fifty." },
      ),
      C(
        "Make what you can, well",
        {},
        { pay: 0.3, xp: 6, say: "Thirty good pots. He'll come back for more." },
      ),
      C(
        "Tell him the price of haste",
        { check: { skill: "trade" } },
        {
          pay: 0.6,
          say: "He paid double for haste. Traders understand that word.",
        },
        { say: "He went to another village." },
      ),
    ],
  ),
  M(
    "maker",
    "trouble",
    "tools-stolen",
    "The tools gone",
    "Your awls, your good knife and the iron scraper you traded three beaver for are gone from the lodge, and a trader's boy was hanging about yesterday.",
    [
      C(
        "Go to the trader",
        { check: { skill: "persuasion" } },
        {
          say: "The boy had them. The trader gave them back, and a knife besides.",
        },
        {
          pay: -0.4,
          stress: 3,
          say: "The trader says his boy is honest. The boy is wearing your knife.",
        },
      ),
      C(
        "Make new ones of bone",
        { check: { skill: "craft" } },
        {
          xp: 10,
          say: "Bone awls, the old way. Your grandmother would be pleased.",
        },
        { pay: -0.3, say: "Bone breaks." },
      ),
      C(
        "Let it go",
        {},
        { pay: -0.4, stress: 2, say: "Things go. Hands stay." },
      ),
    ],
  ),
  M(
    "interpreter",
    "task",
    "ransom",
    "A captive's ransom",
    "A colonist's daughter, taken in a raid three years ago, has been found living in a village to the north. The family want her back; the village has adopted her; she has a husband there.",
    [
      C(
        "Carry the ransom and the words",
        { check: { skill: "persuasion", dc: 1 } },
        {
          pay: 0.6,
          renown: 2,
          xp: 12,
          say: "She came home. She cried for the village all the way, and her mother cried for her.",
        },
        {
          stress: 6,
          say: "She wouldn't come. You carried back her answer, which the family didn't believe.",
        },
      ),
      C(
        "Ask her what she wants first",
        {},
        {
          renown: 1,
          stress: 2,
          say: "She wanted to stay. You told the family so, as gently as English allows.",
        },
      ),
      C(
        "Decline: it can't end well",
        {},
        { say: "Somebody else went. It didn't end well." },
      ),
    ],
  ),
  M(
    "interpreter",
    "trouble",
    "no-word",
    "A word with no English",
    "In the middle of the council the speaker uses a word for which there is no English: something between a gift, a debt and a promise. Both sides are waiting.",
    [
      C(
        "Explain it at length",
        { check: { skill: "letters" } },
        {
          renown: 1,
          xp: 12,
          say: "Three minutes of careful English. The governor understood, for once.",
        },
        {
          stress: 4,
          say: "Three minutes of careful English. The governor understood something else.",
        },
      ),
      C(
        'Say "a present"',
        {},
        {
          stress: 2,
          say: "A present. Later, when they ask for what was promised, nobody will remember why.",
        },
      ),
      C(
        "Ask the speaker to say it another way",
        { check: { skill: "persuasion" } },
        {
          xp: 8,
          say: "He did, with a story. You put the story into English, and it worked.",
        },
        { renown: -0.5, say: "He was offended to be asked." },
      ),
    ],
  ),
  M(
    "interpreter",
    "trouble",
    "spy",
    "Called a spy",
    "A captain of militia in the tavern says that a man who speaks both tongues must be carrying news to the other side, and the room has gone quiet to hear what you say.",
    [
      C(
        "Answer him to his face",
        { check: { skill: "persuasion" } },
        {
          renown: 1.5,
          say: "You told the room who carried their letters for ten years. He bought you a drink.",
        },
        { renown: -1, stress: 5, say: "The room took his side, as rooms do." },
      ),
      C(
        "Call him out",
        { check: { skill: "fighting" } },
        { renown: 2, heat: 3, say: "He apologised with a split lip." },
        { health: -10, say: "He was better with his fists than his tongue." },
      ),
      C("Leave quietly", {}, { stress: 3, say: "You left. The talk didn't." }),
    ],
  ),
  M(
    "guide",
    "task",
    "hunting-gentleman",
    "A gentleman's hunt",
    "An English gentleman with three guns, two servants, a case of claret and no idea wants to shoot a bear, see the falls, and be home for dinner on Thursday.",
    [
      C(
        "Find him his bear",
        { check: { skill: "woodcraft" } },
        {
          pay: 1,
          renown: 1,
          xp: 10,
          say: "He shot a bear, saw the falls and wrote a book about it with you in it, much improved.",
        },
        {
          health: -8,
          pay: 0.3,
          say: "The bear found him first. You found the bear.",
        },
      ),
      C(
        "Show him the falls and the claret",
        {},
        {
          pay: 0.5,
          stress: -2,
          say: "No bear. Great falls. Excellent claret.",
        },
      ),
      C(
        "Hand him to another guide",
        {},
        { say: "Some guides like gentlemen. You don't." },
      ),
    ],
  ),
  M(
    "guide",
    "trouble",
    "broken-leg",
    "A broken leg on the trail",
    "Six days out, one of your party has slipped on wet rock and broken his leg clean through, and he's a big man, and it's six days back.",
    [
      C(
        "Set it and carry him out",
        { check: { skill: "medicine" } },
        {
          renown: 2,
          xp: 10,
          say: "A splint of poles and a litter. He walks with a stick and swears by you.",
        },
        {
          stress: 6,
          say: "The leg went bad on the fourth day. He lived; the leg didn't.",
        },
      ),
      C(
        "Leave him with food and go for help",
        { odds: 0.6 },
        {
          renown: 0.5,
          say: "Back in four days with men and a canoe. He was still there, and cross.",
        },
        {
          stress: 6,
          renown: -1,
          say: "Back in four days. He'd tried to walk.",
        },
      ),
      C(
        "Make camp and wait",
        {},
        {
          stress: 4,
          pay: -0.3,
          say: "A fortnight in camp, short rations, a slow walk out.",
        },
      ),
    ],
  ),
  M(
    "guide",
    "trouble",
    "unpaid-guide",
    "A party that won't pay",
    "You brought a party of land speculators safe through the mountains and back, and now they say the journey took too long and they'll pay half.",
    [
      C(
        "Argue it out",
        { check: { skill: "persuasion" } },
        {
          pay: 0.6,
          say: "They paid in full, rather than hear about it in every tavern on the road.",
        },
        { pay: 0.2, stress: 4, say: "Half it is." },
      ),
      C(
        "Take it to the justice",
        { check: { skill: "letters" } },
        {
          pay: 0.7,
          renown: 0.5,
          say: "The justice had been a guide himself once.",
        },
        { stress: 4, say: "The justice was one of the speculators." },
      ),
      C(
        "Take half and tell every guide",
        {},
        {
          pay: 0.3,
          renown: 0.5,
          say: "Half now. No guide on the frontier will take them out again.",
        },
      ),
    ],
  ),
  M(
    "counsellor",
    "task",
    "young-men-war",
    "The young men want war",
    "The young men have been drinking the traders' rum and talking of war against the colonists, and they want the council's blessing. The council looks to its counsellors.",
    [
      C(
        "Speak for patience",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 2,
          xp: 12,
          say: "You spoke of the last war and the empty lodges after it. The young men sat down.",
        },
        {
          renown: -1,
          stress: 5,
          say: "They called you an old woman, which the old women didn't care for either.",
        },
      ),
      C(
        "Speak for war",
        {},
        {
          renown: 1,
          heat: 3,
          say: "The council gave its blessing. The young men cheered you.",
        },
      ),
      C(
        "Say both sides have reason",
        {},
        { say: "Everyone heard what they wanted to." },
      ),
    ],
  ),
  M(
    "counsellor",
    "task",
    "land-sale",
    "Land for sale",
    "Colonial agents have come with presents and a paper: they want the land between the two rivers, and they've already given the sachem's nephew a coat.",
    [
      C(
        "Counsel a hard bargain",
        { check: { skill: "trade" } },
        {
          pay: 0.6,
          renown: 1.5,
          say: "Twice the goods, and the hunting rights kept. The agents went away grumbling and hurried.",
        },
        { renown: -1, say: "They found someone else to sign." },
      ),
      C(
        "Counsel refusal",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          say: "The council refused. The agents will be back with more presents.",
        },
        { stress: 4, say: "The nephew signed anyway." },
      ),
      C(
        "Let the sachem decide",
        {},
        { say: "The sachem decided. Some approve." },
      ),
    ],
  ),
  M(
    "counsellor",
    "trouble",
    "dream-omen",
    "A troubling dream",
    "A respected old man has dreamed that the village must move before winter, and the dream must be honoured, and half the village is packing and the other half is very cross.",
    [
      C(
        "Interpret the dream",
        { check: { skill: "faith" } },
        {
          renown: 2,
          xp: 10,
          say: "Move, the dream said, but not far: a new longhouse at the edge of the fields fulfilled it.",
        },
        {
          stress: 5,
          say: "Your reading pleased nobody, including the dreamer.",
        },
      ),
      C(
        "Counsel the move",
        {},
        {
          pay: -0.4,
          renown: 0.5,
          say: "The village moved. The dream was honoured; the backs ache.",
        },
      ),
      C(
        "Counsel staying",
        { odds: 0.5 },
        { say: "Nothing bad happened. The dreamer says it was close." },
        {
          renown: -1.5,
          say: "Sickness came that winter. The dreamer said nothing, loudly.",
        },
      ),
    ],
  ),
  M(
    "militia",
    "task",
    "training-day",
    "Training day",
    "Training day on the green: the company in their own coats, with their own muskets (some), drilling to the drum while the whole town watches and the tavern does its best trade of the year.",
    [
      C(
        "Drill them till they're soldiers",
        { check: { skill: "leadership" } },
        {
          renown: 2,
          xp: 12,
          say: "They wheeled, they fired a volley all together, and the town cheered. The colonel noticed.",
        },
        { renown: -1, stress: 4, say: "They wheeled into the duck pond." },
      ),
      C(
        "Drill, and then the tavern",
        {},
        {
          stress: -6,
          pay: -0.1,
          say: "A good drill, a better dinner, and a song nobody remembers the end of.",
        },
      ),
      C(
        "Sit it out with a bad leg",
        { odds: 0.6 },
        {
          stress: -3,
          say: "A fine for missing training, or it would be, if anyone collected it.",
        },
        { pay: -0.3, say: "The clerk of the company collected it." },
      ),
    ],
    { when: months(4, 9) },
  ),
  M(
    "militia",
    "trouble",
    "rusty-arms",
    "Rust in the magazine",
    "The colony's arms in the town magazine turn out to be rust with a little musket attached, and the lieutenant governor is coming to inspect.",
    [
      C(
        "Clean and mend every one",
        { check: { skill: "craft" } },
        {
          renown: 1.5,
          xp: 10,
          say: "A fortnight with oil and a file. The inspection passed with compliments.",
        },
        {
          stress: 4,
          say: "A fortnight with oil and a file, and the lock-plates fell off in his hands anyway.",
        },
      ),
      C(
        "Petition for new arms",
        { check: { skill: "letters" } },
        {
          renown: 1,
          say: "The assembly voted fifty stands of arms. They'll come in a year, or two.",
        },
        { say: "The assembly voted to consider it." },
      ),
      C(
        "Show him the good ones only",
        { odds: 0.6 },
        { say: "He saw twelve good muskets and went to dinner." },
        { renown: -2, say: "He asked to see the thirteenth." },
      ),
    ],
  ),
  M(
    "militia",
    "trouble",
    "refuses-muster",
    "A man who won't muster",
    "A Quaker of the town will not bear arms and will not pay the fine for not bearing arms, and the captain says the law is the law, and the Quaker says so is God's.",
    [
      C(
        "Find a way round it",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          say: "He'll pay a tax for the fort's roof, which isn't arms. The captain grumbles; the law is satisfied.",
        },
        {
          stress: 4,
          say: "Neither of them would bend, and you're in the middle.",
        },
      ),
      C(
        "Distrain his goods for the fine",
        {},
        {
          renown: -1,
          say: "His pewter was sold on the green. Nobody bid much; he thanked them.",
        },
      ),
      C(
        "Leave him be",
        {},
        {
          renown: 0.5,
          say: "The captain shouted. The Quaker nodded. Nothing happened, which is the Quaker way.",
        },
      ),
    ],
  ),
  // ------------------------------------------------ arms
  M(
    "soldier",
    "trouble",
    "weevils",
    "Weevils in the flour",
    "The commissary's flour is alive: weevils in every barrel, and the bread tastes of them. The men are talking of mutiny, and the commissary of how lucky they are.",
    [
      C(
        "Complain up the line",
        { check: { skill: "persuasion" } },
        {
          renown: 1,
          boss: -2,
          say: "The colonel ate the bread himself. New flour came within the week.",
        },
        {
          boss: -5,
          stress: 4,
          say: "You were told soldiers who want white bread should join the navy.",
        },
      ),
      C(
        "Sift it and make do",
        {},
        { stress: 2, say: "Sifted bread is still bread." },
      ),
      C(
        "Help yourself from the officers' stores",
        { check: { skill: "stealth" } },
        {
          stress: -3,
          say: "White bread and a ham. Nobody counts the officers' hams.",
        },
        {
          health: -8,
          boss: -8,
          say: "Somebody counts the officers' hams. Twenty lashes.",
        },
      ),
    ],
  ),
  M(
    "soldier",
    "task",
    "paymaster",
    "Escort the paymaster",
    "The paymaster rides with the garrison's pay from the capital, two days through woods where men have been robbed for less. Eight men, a sergeant, and you if you'll go.",
    [
      C(
        "Ride guard",
        { check: { skill: "fighting" } },
        {
          pay: 0.6,
          renown: 1,
          xp: 10,
          say: "Two days, no trouble, and a bottle from the paymaster for the escort.",
        },
        {
          health: -10,
          renown: 1,
          say: "Robbers at the ford. The pay came through; you came through bleeding.",
        },
      ),
      C(
        "Ride rear and keep your eyes open",
        {},
        { xp: 6, say: "Two dull days. The best kind." },
      ),
      C("Report sick", {}, { boss: -3, say: "Somebody else went." }),
    ],
  ),
  M(
    "soldier",
    "trouble",
    "flogging",
    "A friend to be flogged",
    "A man of your mess is sentenced to two hundred lashes for answering back a lieutenant who was drunk. The drums are being braced.",
    [
      C(
        "Speak for him to the captain",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 1,
          boss: -1,
          say: "Commuted to fifty, and the lieutenant reprimanded in private.",
        },
        {
          boss: -6,
          stress: 6,
          say: "The captain gave him the two hundred and you a warning.",
        },
      ),
      C(
        "Take his next guard for him",
        {},
        {
          stress: 4,
          renown: 0.5,
          say: "He couldn't stand for a week. You stood for him.",
        },
      ),
      C(
        "Look away",
        {},
        { stress: 5, say: "You counted every stroke anyway." },
      ),
    ],
  ),
];
