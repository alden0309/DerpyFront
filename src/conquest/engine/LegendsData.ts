// DLC (r21): the legends of "Legends" (the store item; Legends.ts runs them).
//
// Each legend is a trail: a rumour that rarely comes, two clues that need a
// master's skill (letters, woodcraft, persuasion, seamanship, faith), each
// to be worked at a particular place, and a journey's end with its own check
// and its outcomes. The rewards fit the legend, and some are bittersweet:
// most legends were never what they promised, and the game says so.
//
// How real they are (the designer's call, for the owner):
// - The Fountain of Youth is a real spring, and almost always only that. In
//   one search in twelve that reaches it, the one who drinks carries a
//   lasting benefit the game never explains: the age at which their health
//   begins to fail comes eight years later (LIFE r21's cap, Body.ts). Nobody
//   can say whether it was the water, the rest or the faith, and nobody can
//   find the spring again: it can't be farmed, sold or shared, and it costs
//   a long, fevered journey into the Florida interior to try.
// - El Dorado and the Seven Cities, Norumbega and Madoc's Welsh Indians end
//   in the truth of them: Zuni and Wichita towns, a quiet stretch of river,
//   the Mandan. The reward is renown, learning and goodwill, and a little
//   trade.
// - The Lost Colony ends with the Hatteras people's own memory of the
//   English who came and stayed.
// - Blackbeard's hoard and Swift's mine are the gambles: a real chance of a
//   small fortune, a likelier chance of an empty chest or nothing.
// - The native nations' sacred places are places to learn about and keep.
//   Their trail is earning a people's trust, listening through a winter, and
//   walking the place with an elder; you leave nothing and take nothing, and
//   are later asked to speak for the place when it's threatened.
//   CQ24 (r24): or they may be plundered, as a game's choice with its price
//   (SacredPlunder.ts).

import type { PlaceKind, Skill } from "./Types";

/** Where a step of the trail is worked. */
export interface LegendAt {
  /** In one of these provinces (by name). */
  provs?: string[];
  /** In a town of this native nation (sacred places: the people's own towns). */
  people?: boolean;
  /** At this place in the town (the governor's house for archives, the tavern...). */
  place?: PlaceKind;
}

export interface LegendStep {
  title: string;
  at: LegendAt;
  skill: Skill;
  dc: number;
  /** Coins a try (presents, rum, a guide, a party fitted out). */
  cost: number;
  /** What you do. */
  doing: string;
  /** What you learn, passed. */
  found: string;
  /** Failed. */
  failed: string;
}

export interface LegendOutcome {
  key: string;
  /** Its chance, once the journey's end is reached (they add up to 1). */
  chance: number;
  text: string;
  renown: number;
  coins?: [number, number];
  health?: number;
  stress?: number;
  xp?: Partial<Record<Skill, number>>;
  /** The Fountain's water: the body's decline put off (FOUNTAIN.years). */
  waters?: boolean;
  /** A sacred place learned and kept: you'll be asked to speak for it. */
  keep?: boolean;
}

export interface LegendDef {
  key: string;
  name: string;
  kind: "legend" | "sacred";
  /** The year talk of it can first be heard. */
  from?: number;
  /** Sacred places: the nation whose place it is. */
  people?: string;
  /** Where talk of it is likelier heard (provinces by name). */
  region: string[];
  rumour: string;
  /** The clues, then the journey's end (the last step). */
  steps: LegendStep[];
  outcomes: LegendOutcome[];
  /** After it's found: what the legend really was. */
  truth: string;
  /** The journey's end's danger: a fever (Florida's interior), a chance and the hurt. */
  fever?: { chance: number; health: number };
}

/** The pace of legends: how rarely talk of one comes, and how a trail goes cold. */
export const LEGEND_RULES = {
  /** A month's chance that talk of a legend reaches you. */
  rumour: 1 / 72,
  /** In the legend's own country. */
  region: 2.5,
  /** At least this old to hear and follow them. */
  age: 16,
  /** Asking after old stories (at the tavern, the docks, a village or the council fire). */
  ask: {
    skill: "persuasion" as Skill,
    dc: 12,
    cost: 1,
    rest: 120,
    then: 1 / 3,
  },
  /** Between tries at a step, and after a step's done. */
  retry: 90,
  next: 30,
  /** Failed this many times at one step, and the trail goes cold. */
  tries: 3,
  /** A cold trail (or a legend already followed to its end) can't be heard of again for this long. */
  coldRest: 365 * 5,
  /** Sacred places: speaking their people's tongue this well makes the trust easier (skill +2). */
  tongue: { level: 2, bonus: 2 },
  /** After a sacred place is kept: when someone threatens it (days, from-to). */
  keepAfter: [120, 400] as [number, number],
};

/** The Fountain's lasting mark: the years its water puts off the body's decline. */
export const FOUNTAIN = { years: 8 };

/** Towns with a printing press and a library of sorts: where old books are read. */
const LIBRARIES = [
  "Fort Christina",
  "Massachusetts Bay",
  "New Amsterdam",
  "Jamestown",
  "Charles Town",
  "Connecticut",
  "Havana",
  "Quebec",
  "Tenochtitlan",
];

export const LEGENDS: LegendDef[] = [
  {
    key: "fountain",
    name: "The Fountain of Youth",
    kind: "legend",
    region: [
      "St. Augustine",
      "Timucua",
      "Tocobaga",
      "Mayaimi",
      "Calusa",
      "Ais",
      "Tequesta",
      "Havana",
    ],
    rumour:
      "An old Spanish sailor swears that Juan Ponce de León came to Florida in 1513 looking for more than gold: for a spring whose water gives back youth, in a land the Indians called Bimini. The Calusa, he says, knew where it was.",
    steps: [
      {
        title: "The Spanish histories",
        at: {
          provs: [
            "Havana",
            "St. Augustine",
            "Santo Domingo",
            "Veracruz",
            "Tenochtitlan",
            ...LIBRARIES,
          ],
          place: "governor",
        },
        skill: "letters",
        dc: 15,
        cost: 2,
        doing:
          "Read Herrera's history of the Indies, and the memoir of Fontaneda, held seventeen years by the Calusa, in the archives.",
        found:
          "Herrera writes that Ponce de León sought a spring on 'Bimini' that made old men young. Fontaneda laughs at the Spaniards who bathed in every river and lagoon of Florida looking for it, but names the lakes of the interior.",
        failed: "The Spanish is old and the hand is worse. You get nowhere.",
      },
      {
        title: "The old Calusa country",
        at: {
          provs: [
            "Calusa",
            "Mayaimi",
            "Tocobaga",
            "Tequesta",
            "Ais",
            "Timucua",
            "Apalachee",
          ],
        },
        skill: "woodcraft",
        dc: 16,
        cost: 4,
        doing:
          "Go among the people who live in the old Calusa country now, Seminole hunters and the Cuban fishermen at their ranchos, and ask after a spring the old people went to be healed.",
        found:
          "An old fisherman at a rancho on the coast tells you of a spring that rises in a deep blue bowl in the scrub, north of the great lake, where the old people went to be healed.",
        failed: "The swamps and the people in them keep their secrets.",
      },
      {
        title: "The blue spring",
        at: { provs: ["Mayaimi"] },
        skill: "woodcraft",
        dc: 18,
        cost: 20,
        doing:
          "Fit out a party (a guide, canoes, food for a month) and go into the interior to find the spring.",
        found: "",
        failed:
          "Weeks in the saw grass and the scrub, and every spring you find is only a spring. You come back thinner.",
      },
    ],
    outcomes: [
      {
        key: "waters",
        chance: 1 / 12,
        text: "You drink. Nothing happens, and then, over the weeks, something does: you sleep like a boy, your knees stop aching, and the grey in your hair seems no worse than it was. Nobody can say it's the water, and the physicians laugh at you for asking. You never find the spring again.",
        renown: 8,
        health: 20,
        stress: -25,
        waters: true,
      },
      {
        key: "spring",
        chance: 11 / 12,
        text: "A spring rises from a blue hole in the limestone, so clear you can see the fish thirty feet down. You drink, and bathe, and rest a week beside it. It's cold, and sweet, and it is water.",
        renown: 6,
        health: 10,
        stress: -15,
      },
    ],
    fever: { chance: 0.25, health: 15 },
    truth:
      "Ponce de León's own papers say nothing of a fountain; the story was written into his life by the historians who came after him. Florida's springs are real, and as clear as any in the world.",
  },
  {
    key: "cibola",
    name: "El Dorado and the Seven Cities of Cíbola",
    kind: "legend",
    region: [
      "Zuni",
      "Acoma",
      "Hopi",
      "Santa Fe",
      "Taos",
      "Paso del Norte",
      "Smoky Hill",
      "Wichita",
      "Veracruz",
      "Tenochtitlan",
    ],
    rumour:
      "A muleteer from the north says the Spaniards never found the Seven Cities of Cíbola, with their walls of gold and their doors set with turquoise, though a friar saw them from a hill in 1539. Beyond them, he says, lies Quivira, where even the pots are gold.",
    steps: [
      {
        title: "The friar's report, and Coronado's letter",
        at: {
          provs: [
            "Tenochtitlan",
            "Veracruz",
            "Santa Fe",
            "Havana",
            "Santo Domingo",
          ],
          place: "governor",
        },
        skill: "letters",
        dc: 16,
        cost: 3,
        doing:
          "Read Fray Marcos's report of 1539 and Coronado's letters in the archives.",
        found:
          "Fray Marcos describes a city bigger than Mexico. Coronado's own letter of 1540 says he found a little crowded village of stone and mud, and that the friar had told the truth in nothing.",
        failed: "The archive's clerks find everything but what you asked for.",
      },
      {
        title: "Hawikuh",
        at: { provs: ["Zuni"] },
        skill: "persuasion",
        dc: 15,
        cost: 4,
        doing:
          "Go to the Zuni towns with presents, and ask the elders about the cities the Spaniards came looking for.",
        found:
          "Zuni elders tell you of Hawikuh and the other towns, of the men in iron who came in their grandfathers' grandfathers' day and fought them at its walls, and of the friar's guide who came first and didn't leave. The cities of gold were their own towns, catching the evening sun.",
        failed: "The elders are courteous, and tell a stranger nothing.",
      },
      {
        title: "Quivira",
        at: { provs: ["Smoky Hill", "Wichita"] },
        skill: "woodcraft",
        dc: 17,
        cost: 25,
        doing:
          "Fit out a party and cross the plains to Quivira, where Coronado turned back.",
        found: "",
        failed:
          "The plains are wider than any map. You turn back where Coronado did, with less to show.",
      },
    ],
    outcomes: [
      {
        key: "turquoise",
        chance: 0.2,
        text: "In the grass-house villages of the Wichita a trader shows you a Spanish iron glove two hundred years old, and sells you turquoise and painted hides at a good price.",
        renown: 8,
        coins: [15, 30],
        xp: { trade: 15 },
      },
      {
        key: "grass",
        chance: 0.8,
        text: "Quivira is grass-house villages of the Wichita among their cornfields and the buffalo, as Coronado found it. There was never any gold.",
        renown: 7,
        xp: { letters: 20, woodcraft: 15 },
      },
    ],
    truth:
      "The Seven Cities were the Zuni towns; Quivira the Wichita villages. The gold was a friar's story, and a guide's trick to lead the Spaniards out onto the plains.",
  },
  {
    key: "roanoke",
    name: "The Lost Colony",
    kind: "legend",
    region: ["Roanoke", "Albemarle", "Pamlico", "Jamestown", "Nansemond"],
    rumour:
      "An old waterman says the English settlers left on Roanoke Island in 1587 weren't lost at all. When their governor came back three years later the only word was CROATOAN, carved on a post, and he never got there to look.",
    steps: [
      {
        title: "John White's own account",
        at: { provs: LIBRARIES, place: "press" },
        skill: "letters",
        dc: 14,
        cost: 2,
        doing:
          "Find Hakluyt's Voyages and read what the colony's governor, John White, wrote of his return.",
        found:
          "White writes that they'd agreed to carve where they'd gone, with a cross over it if in danger. There was no cross, and Croatoan was the island of their friend Manteo's people, to the south.",
        failed: "Nobody here has the book, or will lend it.",
      },
      {
        title: "Croatoan",
        at: { provs: ["Roanoke"], place: "docks" },
        skill: "seamanship",
        dc: 16,
        cost: 5,
        doing:
          "Find a boat and sail through the shoals of the sounds to Hatteras Island, the Croatoan of the old maps.",
        found:
          "You thread the shoals to Hatteras, where the last of the Hatteras people live among the fishermen and the wreckers.",
        failed:
          "The inlets shift every storm, and you go aground twice and come home.",
      },
      {
        title: "The Hatteras people's memory",
        at: { provs: ["Roanoke"] },
        skill: "persuasion",
        dc: 16,
        cost: 6,
        doing: "Stay a while among the Hatteras families, and listen.",
        found: "",
        failed:
          "They've been asked by too many strangers, and they say what strangers want to hear.",
      },
    ],
    outcomes: [
      {
        key: "kin",
        chance: 0.7,
        text: "An old woman says her grandmother's grandmother was English, from the people who came over the sea and stayed, and that they could talk in a book. Some of her family have grey eyes. The colonists weren't lost: they were taken in.",
        renown: 8,
        xp: { letters: 20, persuasion: 10 },
      },
      {
        key: "ring",
        chance: 0.3,
        text: "A Hatteras family shows you a thing kept a long time: a little brass seal ring, English, worn almost smooth. They don't know whose it was, only that it was always theirs, and they keep it.",
        renown: 10,
        xp: { letters: 20 },
      },
    ],
    truth:
      "Nobody knows for certain. The likeliest story is the one the Hatteras told the surveyor John Lawson in 1709: that some of their ancestors were white people who could talk in a book.",
  },
  {
    key: "norumbega",
    name: "Norumbega",
    kind: "legend",
    region: [
      "Pentagoet",
      "Norridgewock",
      "Sagadahoc",
      "Madawaska",
      "Saint-Jean",
    ],
    rumour:
      "A fisherman from the eastern coast says that up the Penobscot there was once a city called Norumbega, with pillars of crystal and silver and pearls by the bushel. An English sailor walked past it in 1568, and told the Queen's men so.",
    steps: [
      {
        title: "Ingram's tale",
        at: { provs: LIBRARIES, place: "press" },
        skill: "letters",
        dc: 15,
        cost: 2,
        doing:
          "Read David Ingram's tale, and Champlain's account of his voyage up the Penobscot in 1604.",
        found:
          "Ingram's Norumbega has houses pillared with crystal and silver. Champlain, who went up the river to find it, found a few wigwams by the falls.",
        failed:
          "The books contradict each other, and you can't tell which liar to believe.",
      },
      {
        title: "Up the Penobscot",
        at: { provs: ["Pentagoet"] },
        skill: "woodcraft",
        dc: 16,
        cost: 4,
        doing:
          "Hire a Penobscot guide and a canoe and go up the river past the falls.",
        found:
          "You go up the river past the falls with a Penobscot guide, who is amused by the whole business.",
        failed: "The river's high, and you turn back at the first falls.",
      },
      {
        title: "The quiet water",
        at: { provs: ["Pentagoet", "Norridgewock"] },
        skill: "persuasion",
        dc: 15,
        cost: 5,
        doing:
          "Sit with the Penobscot in their town and ask, carefully, about the city.",
        found: "",
        failed: "They laugh at the silver city, and change the subject.",
      },
    ],
    outcomes: [
      {
        key: "word",
        chance: 0.75,
        text: "The Penobscot laugh kindly at the silver city. Norumbega, one of the elders says, might be a word of theirs for a quiet stretch of water between two falls. You look at the river, and it is.",
        renown: 6,
        xp: { persuasion: 15, woodcraft: 10 },
      },
      {
        key: "furs",
        chance: 0.25,
        text: "There's no city, only a quiet stretch of the river between two falls that might be what the name meant. They trade you good furs besides, for the trouble.",
        renown: 6,
        coins: [10, 20],
      },
    ],
    truth:
      "There was no city. Norumbega appears to have been a native word for a quiet place on a river, grown in Europe's telling into a kingdom.",
  },
  {
    key: "blackbeard",
    name: "Blackbeard's hoard",
    kind: "legend",
    from: 1719,
    region: [
      "Pamlico",
      "Roanoke",
      "Albemarle",
      "Charles Town",
      "New Providence",
      "Jamestown",
    ],
    rumour:
      "An old sailor who says he served under Edward Teach, Blackbeard, killed at Ocracoke inlet in 1718, swears the captain buried a chest somewhere along the Carolina banks and told nobody where.",
    steps: [
      {
        title: "An old hand",
        at: {
          provs: ["Pamlico", "Charles Town", "New Providence", "Albemarle"],
          place: "tavern",
        },
        skill: "persuasion",
        dc: 16,
        cost: 3,
        doing:
          "Find the men who say they sailed with him, buy them rum, and sort the truth from the rest.",
        found:
          "Over a great deal of rum one of them tells you of a night at Ocracoke before the end: a boat rowed to the sand hills on the sound side, and the captain coming back alone.",
        failed:
          "Each of them sailed with Blackbeard, and each tells a different story.",
      },
      {
        title: "The trial papers",
        at: { provs: ["Jamestown"], place: "governor" },
        skill: "letters",
        dc: 15,
        cost: 2,
        doing:
          "Read the depositions of his crew, tried at Williamsburg in 1719.",
        found:
          "The depositions name the inlet, the sound side, and a stand of live oaks behind the dunes.",
        failed:
          "The clerk of the court has better things to do than find you old papers.",
      },
      {
        title: "The live oaks at Ocracoke",
        at: { provs: ["Roanoke"] },
        skill: "seamanship",
        dc: 18,
        cost: 15,
        doing:
          "Hire a boat and men with spades, sound the inlet, and dig at low tide.",
        found: "",
        failed:
          "The inlet has moved since 1718, and so have the dunes. You dig in the wrong places for a month.",
      },
    ],
    outcomes: [
      {
        key: "chest",
        chance: 0.2,
        text: "Under the live oaks your spade strikes wood: a sea chest, rotten through, with a bag of pieces of eight and a few gold coins still in it.",
        renown: 8,
        coins: [30, 70],
      },
      {
        key: "empty",
        chance: 0.5,
        text: "You find a sea chest under the live oaks, broken open long ago and empty but for a pewter cup. Somebody came first.",
        renown: 4,
      },
      {
        key: "nothing",
        chance: 0.3,
        text: "Nothing but sand, crabs and mosquitoes. The book about the pirates has him saying that nobody but he and the devil knew where it was.",
        renown: 2,
        stress: 6,
      },
    ],
    truth:
      "No hoard of Blackbeard's has ever been found. He took many ships but few rich ones, and pirates spent as they went.",
  },
  {
    key: "silvermine",
    name: "Swift's silver mine",
    kind: "legend",
    from: 1769,
    region: [
      "Bluegrass",
      "Kanawha",
      "Blue Ridge",
      "Shenandoah",
      "Monacan",
      "Kituwah",
    ],
    rumour:
      "A long hunter back from Kentucky talks of John Swift, who mined silver in the mountains with a few partners in the 1760s, packed it out on horses, hid the rest, and could never find the place again.",
    steps: [
      {
        title: "Swift's journal",
        at: {
          provs: [
            "Jamestown",
            "Appamattuck",
            "Shenandoah",
            "Fort Christina",
            "Bluegrass",
          ],
          place: "tavern",
        },
        skill: "letters",
        dc: 16,
        cost: 3,
        doing:
          "Find a copy of the journal Swift is said to have kept, and make sense of it.",
        found:
          "A copy of a copy of Swift's journal: a rock house, a creek that runs into a cave, a turtle carved on a beech.",
        failed:
          "Every copy you find is different, and some are plainly made up.",
      },
      {
        title: "The landmarks",
        at: { provs: ["Bluegrass", "Kanawha", "Blue Ridge"] },
        skill: "woodcraft",
        dc: 17,
        cost: 5,
        doing:
          "Go into the mountains for weeks, looking for the journal's landmarks.",
        found:
          "After weeks in the hills you find a beech with an old carving that might be a turtle.",
        failed: "There are a thousand rock houses and a thousand creeks.",
      },
      {
        title: "The mine",
        at: { provs: ["Bluegrass", "Kanawha"] },
        skill: "woodcraft",
        dc: 19,
        cost: 15,
        doing:
          "Search the hollows below the turtle tree with picks and a packhorse.",
        found: "",
        failed: "Rock houses, creeks and caves without number, and no silver.",
      },
    ],
    outcomes: [
      {
        key: "silver",
        chance: 0.15,
        text: "A seam in a rock house glints. It's thin and hard to get at, but it's silver ore, and you pack out what you can.",
        renown: 6,
        coins: [25, 50],
      },
      {
        key: "coins",
        chance: 0.25,
        text: "In a hollow under a ledge: a rotten saddlebag and a few dozen old Spanish coins. Somebody hid them here, long ago.",
        renown: 5,
        coins: [10, 20],
      },
      {
        key: "nothing",
        chance: 0.6,
        text: "Nothing. If Swift found silver in these hills, he took the secret with him.",
        renown: 3,
        xp: { woodcraft: 20 },
      },
    ],
    truth:
      "Nobody has ever found Swift's mine, and those who know rocks doubt there's silver in those hills to find.",
  },
  {
    key: "madoc",
    name: "Prince Madoc's Welsh Indians",
    kind: "legend",
    region: ["Mandan", "Pawnee", "Kansa", "Osage", "Cahokia", "Peoria"],
    rumour:
      "A Welsh trader swears that Prince Madoc sailed west from Wales in 1170 and settled in America, and that his people's children live up the Missouri still, speaking Welsh.",
    steps: [
      {
        title: "Morgan Jones's letter",
        at: { provs: LIBRARIES, place: "press" },
        skill: "letters",
        dc: 15,
        cost: 2,
        doing:
          "Find the letter of the minister Morgan Jones, printed in the Gentleman's Magazine, and what the others wrote of it.",
        found:
          "Jones wrote that in 1669 a nation spared his life when he prayed in Welsh, and spoke Welsh back. Nobody else has ever heard Welsh spoken in America.",
        failed: "The magazine's back numbers are nowhere to be had.",
      },
      {
        title: "The Missouri traders",
        at: { provs: ["Cahokia", "Peoria", "Osage", "Bayogoula", "Quapaw"] },
        skill: "persuasion",
        dc: 15,
        cost: 3,
        doing: "Talk with the traders who go up the Missouri.",
        found:
          "They say the Mandan live in round earth lodges on the bluffs, cross the river in round hide boats like a Welsh coracle, and some of them have light hair and eyes.",
        failed:
          "The traders want to know why you're asking, and what's in it for them.",
      },
      {
        title: "The Mandan villages",
        at: { provs: ["Mandan"] },
        skill: "persuasion",
        dc: 17,
        cost: 25,
        doing: "Go up the Missouri to the Mandan villages, with presents.",
        found: "",
        failed:
          "The river is long and the season short. You turn back short of the villages.",
      },
    ],
    outcomes: [
      {
        key: "mandan",
        chance: 1,
        text: "The Mandan welcome you to their villages of earth lodges on the bluffs, feast you, and trade. Their tongue is their own and nothing like Welsh, and their boats are round because round boats suit their river. Madoc, if he sailed at all, didn't come here.",
        renown: 10,
        coins: [5, 15],
        xp: { persuasion: 15, woodcraft: 15 },
      },
    ],
    truth:
      "There are no Welsh Indians. The story was believed for two centuries; the explorers who went to look found the Mandan, a nation with a long history of its own.",
  },
  // ---- sacred places: to learn about and to keep (CQ24 (r24): or to plunder, SacredPlunder.ts)
  {
    key: "kituwah",
    name: "Kituwah, the mother town",
    kind: "sacred",
    people: "cherokee",
    region: ["Kituwah", "Chota", "Etowah", "Keowee"],
    rumour:
      "A Cherokee friend speaks of Kituwah, the mother town on the Tuckasegee, where the people's first fire was kindled. The mound is there still, and it matters more than any stranger knows.",
    steps: SACRED_STEPS("the Cherokee"),
    outcomes: SACRED_END(
      "You stand on the mound at Kituwah with an elder at dawn. You leave nothing and take nothing. When you go, you're asked to speak for the place if anyone ever means it harm, and you promise.",
    ),
    truth:
      "Kituwah is the Cherokee mother town. Its mound still stands, and it is the Eastern Band of Cherokee's again, bought back in 1996.",
  },
  {
    key: "cahokia",
    name: "The great mound at Cahokia",
    kind: "sacred",
    people: "illinois",
    region: ["Cahokia", "Peoria", "Osage"],
    rumour:
      "The French at Kaskaskia talk of a hill on the bottomlands across from St. Louis, made by hands, bigger than any church in Europe, and of the people of the Illinois country who know the old stories of it.",
    steps: SACRED_STEPS("the Peoria"),
    outcomes: SACRED_END(
      "You climb the great mound with a Peoria elder and look out over the bottomlands, over the lesser mounds by the dozen. Once there was a city here. You leave nothing and take nothing, and promise to speak for the place if the settlers' ploughs come for it.",
    ),
    truth:
      "Cahokia was the greatest city north of Mexico, around the year 1100. Monks Mound still stands, the largest earthwork in the Americas.",
  },
  {
    key: "serpent",
    name: "The Great Serpent",
    kind: "sacred",
    people: "lenape",
    region: ["Scioto", "Cuyahoga", "Bluegrass"],
    rumour:
      "A Lenape friend speaks of a serpent of earth a quarter of a mile long, coiled along a ridge above Brush Creek, with an egg in its jaws, made by people who lived there before.",
    steps: SACRED_STEPS("the Lenape"),
    outcomes: SACRED_END(
      "You walk the serpent's length along the ridge with an elder, from its coiled tail to the egg in its jaws. You leave nothing and take nothing, and promise to speak for it if anyone means to plough it under.",
    ),
    truth:
      "The Serpent Mound in Ohio is the largest effigy mound in the world, about 1,300 feet long. It was saved from the plough in the 1880s.",
  },
  {
    key: "pahasapa",
    name: "Paha Sapa, the Black Hills",
    kind: "sacred",
    people: "oceti",
    region: ["Black Hills", "Lakota", "Yanktonai", "Powder River"],
    rumour:
      "Lakota traders speak of Paha Sapa, the hills that look black from far off for their pines, and of the bear-shaped butte at their edge where the people go to pray and fast.",
    steps: SACRED_STEPS("the Lakota"),
    outcomes: SACRED_END(
      "You go into the hills with an elder and his family, and are shown where you may go and where you may not. You leave nothing and take nothing, and promise to speak for the hills if the white men ever come for them.",
    ),
    truth:
      "The Black Hills are sacred to the Lakota and many other nations. They were guaranteed to the Lakota by treaty in 1868, and taken from them after gold was found there in 1874.",
  },
  {
    key: "bdote",
    name: "Bdote, where the rivers meet",
    kind: "sacred",
    people: "oceti",
    region: ["Bdote", "Mde Wakan", "Yanktonai"],
    rumour:
      "A Dakota friend tells of Bdote, where the Minnesota river meets the Mississippi, where the people say their story began.",
    steps: SACRED_STEPS("the Dakota"),
    outcomes: SACRED_END(
      "You stand with an elder where the two rivers meet, and listen. You leave nothing and take nothing, and promise to speak for the place if the forts and the traders come for it.",
    ),
    truth:
      "Bdote is the Dakota people's place of creation. A fort was built above it in 1820, and after the war of 1862 some sixteen hundred Dakota, most of them women and children, were held in a camp below it through the winter, and hundreds died there.",
  },
];

/** The trail to a sacred place: earn a people's trust, listen through a winter, walk it with an elder. */
function SACRED_STEPS(people: string): LegendStep[] {
  return [
    {
      title: "Earn their trust",
      at: { people: true, place: "village" },
      skill: "persuasion",
      dc: 14,
      cost: 2,
      doing: `Bring presents to ${people}'s town, sit with the elders, and listen more than you talk.`,
      found:
        "The elders agree to tell you more, in the winter, when stories are told.",
      failed:
        "They're courteous, and tell a stranger nothing. Perhaps another season.",
    },
    {
      title: "Listen through a winter",
      at: { people: true },
      skill: "faith",
      dc: 14,
      cost: 0,
      doing:
        "Stay through the winter evenings when the stories are told, and keep what you're told as you're asked to.",
      found:
        "Over the winter evenings you hear why the place matters, and how it's to be kept. You're asked not to write it down, and you don't.",
      failed:
        "You don't understand what you're told, and you know it. They see it too.",
    },
    {
      // The place itself (SACRED_PLACE), whoever holds the land now.
      title: "Walk the place with an elder",
      at: {},
      skill: "persuasion",
      dc: 13,
      cost: 0,
      doing: "Ask leave to go to the place with an elder.",
      found: "",
      failed: "Not yet, you're told. Perhaps another year.",
    },
  ];
}

function SACRED_END(text: string): LegendOutcome[] {
  return [
    {
      key: "kept",
      chance: 1,
      text,
      renown: 6,
      stress: -10,
      xp: { faith: 20, persuasion: 10 },
      keep: true,
    },
  ];
}

/** The one place a sacred place's trail ends: its own province. */
export const SACRED_PLACE: Record<string, string> = {
  kituwah: "Kituwah",
  cahokia: "Cahokia",
  serpent: "Scioto",
  pahasapa: "Black Hills",
  bdote: "Bdote",
};

export const LEGEND_BY_KEY = new Map(LEGENDS.map((l) => [l.key, l]));
