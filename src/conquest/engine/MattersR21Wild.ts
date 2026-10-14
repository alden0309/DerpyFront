// EVENTS (r21): more matters at work for the trades of the woods and the
// peoples (the trapper, the hunter, the guide, the interpreter; the warrior,
// the grower, the healer, the trader, the speaker, the maker, the
// counsellor). Plain data, like MattersHonest.ts.

import {
  all,
  atWarNow,
  C,
  harvestHere,
  M,
  months,
  north,
  openWater,
  peaceNow,
  rankAtLeast,
  type Variant,
  winterHere,
} from "./MatterKit";
import { rankBelow } from "./MattersR21Town";

export const WILD_MATTERS_R21: Variant[] = [
  // ------------------------------------------------ the trapper
  M(
    "trapper",
    "task",
    "new-country",
    "A creek nobody's trapped",
    "A Delaware hunter tells you of a creek three days north where the beaver have never seen a trap. He wants a kettle and a blanket for the telling.",
    [
      C(
        "Pay him and go",
        { cost: 2, check: { skill: "woodcraft" } },
        { pay: 1.2, xp: 12, say: "Beaver as thick as he said. A fine season." },
        {
          pay: 0.2,
          health: -5,
          say: "You found the creek, and the people whose creek it was.",
        },
      ),
      C(
        "Stay on your own lines",
        {},
        { say: "Your own creeks, your own beaver." },
      ),
    ],
    { when: openWater },
  ),
  M(
    "trapper",
    "trouble",
    "cabin-burned",
    "The cabin burned",
    "You came back from the lines to find your winter cabin burned, your traps scattered, and a broken arrow in the door.",
    [
      C(
        "Read the sign",
        { check: { skill: "woodcraft" } },
        {
          xp: 10,
          say: "Not a war party: a warning. You moved your lines off their ground.",
        },
        { stress: 6, say: "You can't read it. You sleep with your rifle." },
      ),
      C(
        "Rebuild and stay",
        { odds: 0.6 },
        { pay: -0.3, say: "Rebuilt. Nobody came back." },
        { health: -8, say: "They came back." },
      ),
    ],
  ),
  M(
    "trapper",
    "task",
    "rendezvous",
    "The spring rendezvous",
    "The traders are at the forks with kettles, cloth, powder and rum, and every trapper for a hundred miles is coming in with his season's plews.",
    [
      C(
        "Trade sharp",
        { check: { skill: "trade" } },
        {
          pay: 0.8,
          xp: 10,
          say: "Every plew at the best price. A new rifle too.",
        },
        { pay: 0.2, say: "The traders were sharper." },
      ),
      C(
        "Trade and celebrate",
        {},
        { pay: 0.3, stress: -8, say: "A good trade, and a better week." },
      ),
    ],
    { when: months(4, 6) },
  ),
  M(
    "trapper",
    "trouble",
    "frostbite-line",
    "A storm on the line",
    "A blizzard caught you a day from the cabin, and your feet have stopped hurting, which is bad.",
    [
      C(
        "Dig in and make a fire",
        { check: { skill: "woodcraft", dc: 1 } },
        { xp: 12, say: "A snow cave and a small fire. All your toes, still." },
        { health: -12, say: "Two toes fewer." },
      ),
      C(
        "Push on",
        { odds: 0.5 },
        { say: "The cabin by midnight." },
        { health: -14, say: "Lost, then found, half frozen." },
      ),
    ],
    { when: winterHere },
  ),
  M(
    "trapper",
    "task",
    "partner",
    "A partner for the season",
    "A young Frenchman wants to partner with you for the winter: he knows the country to the north, and you know the traders.",
    [
      C(
        "Take him on",
        { odds: 0.75 },
        {
          pay: 0.8,
          xp: 8,
          say: "Twice the country covered, and good company.",
        },
        { pay: -0.4, say: "He went north with your best traps." },
      ),
      C("Work alone", {}, { say: "Alone, as ever." }),
    ],
  ),
  M(
    "trapper",
    "task",
    "company-agent",
    "The company's agent",
    "A company's agent offers you a contract: all your furs to him, at a fixed price, for three years, and credit for your outfit.",
    [
      C(
        "Sign",
        { check: { skill: "trade" } },
        {
          pay: 1,
          say: "A fixed price, an outfit on credit, and no more haggling.",
        },
        { pay: -0.3, say: "Prices rose the next year. You're tied." },
      ),
      C("Stay free", {}, { say: "Free to sell to whom you like." }),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the hunter
  M(
    "hunter",
    "task",
    "moose",
    "The moose in the snow",
    "A moose bogged in deep snow, the crust holding you up and not him. Meat for the whole village till spring.",
    [
      C(
        "Run him down on snowshoes",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 12,
          say: "The village eats. The children sing your name.",
        },
        { health: -6, say: "The crust broke under you." },
      ),
      C("Leave him for the wolves", {}, { say: "The wolves eat." }),
    ],
    { when: all(winterHere, north) },
  ),
  M(
    "hunter",
    "trouble",
    "deer-gone",
    "The deer have gone",
    "The colonists' cattle and their guns have driven the deer from the near valleys, and the young men come home empty.",
    [
      C(
        "Hunt the far valleys",
        { check: { skill: "woodcraft" } },
        { pay: 0.5, xp: 10, say: "Five days out, and meat on the trail home." },
        { health: -4, say: "Five days out, and nothing." },
      ),
      C(
        "Trade furs for colonists' pork",
        {},
        { pay: -0.2, say: "Salt pork. It isn't venison." },
      ),
    ],
  ),
  M(
    "hunter",
    "task",
    "teach-boys",
    "Teaching the boys to hunt",
    "The boys of the clan are old enough to learn: the tracks, the wind, the patience. Their uncles ask you to take them out.",
    [
      C(
        "Take them out",
        { check: { skill: "leadership" } },
        { renown: 1, xp: 8, say: "A boy's first deer. His mother wept." },
        { say: "They scared every deer for miles." },
      ),
      C("Not this moon", {}, { say: "Another uncle took them." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "hunter",
    "trouble",
    "panther",
    "A panther's kill",
    "A panther has been taking the village's dogs, and last night it took one from beside a sleeping child.",
    [
      C(
        "Hunt it",
        { check: { skill: "fighting" } },
        {
          renown: 2,
          xp: 10,
          say: "Its skin on your lodge. The children sleep.",
        },
        { health: -12, say: "It hunted you." },
      ),
      C(
        "Set a trap",
        { check: { skill: "woodcraft" } },
        { renown: 1, say: "Caught in a deadfall." },
        { say: "It walked round the trap." },
      ),
    ],
  ),
  M(
    "hunter",
    "task",
    "hides-trade",
    "Deerskins for the traders",
    "The traders want dressed deerskins by the hundred, and every hunter in the town is hunting for hides now, not meat.",
    [
      C(
        "Hunt for hides",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.8,
          xp: 8,
          say: "A hundred skins, and kettles and cloth for them.",
        },
        { pay: 0.3, say: "Fewer deer, fewer skins." },
      ),
      C(
        "Hunt for the pot",
        {},
        { stress: -2, say: "Meat for your family. The traders can wait." },
      ),
    ],
  ),
  M(
    "hunter",
    "task",
    "buffalo-run",
    "Buffalo on the plains",
    "Word comes that buffalo are crossing the river two days west: hundreds, for anyone who'll make the journey.",
    [
      C(
        "Lead a party",
        { check: { skill: "leadership" } },
        {
          pay: 1.2,
          renown: 2,
          xp: 12,
          say: "Meat, robes and sinew for the winter.",
        },
        { health: -8, say: "A bull turned on the party." },
      ),
      C("Too far", {}, { say: "Others went." }),
    ],
    { when: months(8, 10) },
  ),

  // ------------------------------------------------ the warrior
  M(
    "warrior",
    "task",
    "guard-council",
    "Guarding the council",
    "Delegates from three nations are coming for a council, and the young men must guard the path so nothing troubles them on the way.",
    [
      C(
        "Lead the guard",
        { check: { skill: "leadership" } },
        { renown: 2, xp: 10, say: "Every delegate came and went in peace." },
        {
          stress: 4,
          say: "A quarrel among the guards, in front of the guests.",
        },
      ),
      C("Stand your watch", {}, { xp: 4, say: "A quiet watch." }),
    ],
    { when: peaceNow },
  ),
  M(
    "warrior",
    "trouble",
    "colonist-killed",
    "A colonist found dead",
    "A colonist has been found dead near the town, and the colony demands the killer be handed over to hang. Nobody knows who did it.",
    [
      C(
        "Find out the truth",
        { check: { skill: "woodcraft" } },
        {
          renown: 2,
          xp: 10,
          say: "It was another colonist. The colony's governor wrote an apology, of sorts.",
        },
        { stress: 6, say: "No answer, and the colonists angry." },
      ),
      C(
        "Offer condolence presents, as the custom is",
        {},
        {
          pay: -0.3,
          renown: 1,
          say: "The presents were accepted. The matter rests.",
        },
      ),
    ],
  ),
  M(
    "warrior",
    "task",
    "scouts",
    "Scouting for the colony",
    "The colony asks for scouts to go with its soldiers, and pays well in powder and coats.",
    [
      C(
        "Go",
        { check: { skill: "woodcraft" } },
        {
          pay: 1,
          renown: 1,
          xp: 10,
          say: "The colony's soldiers lived because of you, and knew it.",
        },
        { health: -8, say: "An ambush the soldiers walked into anyway." },
      ),
      C("Let the young men go", {}, { say: "They came back with coats." }),
    ],
    { when: atWarNow },
  ),
  M(
    "warrior",
    "trouble",
    "rum-fight",
    "A fight over rum",
    "Two young men have fought over a keg of the traders' rum, and one is badly cut. His clan wants satisfaction.",
    [
      C(
        "Make peace between the clans",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          xp: 8,
          say: "Presents given, words spoken. The cut will heal.",
        },
        { stress: 6, say: "The clans aren't speaking." },
      ),
      C(
        "Break the keg",
        {},
        {
          renown: 1,
          say: "The rum's in the ground. Both men are angry at you.",
        },
      ),
    ],
  ),
  M(
    "warrior",
    "task",
    "war-dance",
    "The war dance",
    "A war party is being raised, and the war dance is tonight. To dance is to go.",
    [
      C(
        "Dance",
        { check: { skill: "fighting" } },
        {
          renown: 2,
          xp: 10,
          say: "You danced, and went, and came home with honour.",
        },
        { health: -10, say: "You came home carried." },
      ),
      C("Stay by the fire", {}, { renown: -1, say: "The young men noticed." }),
    ],
    { when: atWarNow },
  ),
  M(
    "warrior",
    "task",
    "horses",
    "Horses from the south",
    "A party is going south to trade for horses from the Spanish country: a long journey, and horses mean everything now.",
    [
      C(
        "Go with them",
        { check: { skill: "trade" } },
        {
          pay: 1,
          renown: 1,
          xp: 8,
          say: "Horses, good ones, and a new friend among the southern peoples.",
        },
        { health: -6, say: "Raiders on the way home." },
      ),
      C("Stay home", {}, { say: "They came back with horses." }),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the grower
  M(
    "grower",
    "task",
    "three-sisters",
    "Planting the sisters",
    "Planting time: corn in the hills, then beans to climb the corn, then squash between to keep the weeds down. The women of the clan are going out together.",
    [
      C(
        "Lead the planting",
        { check: { skill: "farming" } },
        {
          pay: 0.6,
          xp: 10,
          say: "The hills planted, the songs sung. A good beginning.",
        },
        { say: "A late frost took some." },
      ),
      C(
        "Plant your own field",
        {},
        { pay: 0.3, say: "Your own field, planted." },
      ),
    ],
    { when: months(4, 5) },
  ),
  M(
    "grower",
    "trouble",
    "cattle-fields",
    "The colonists' pigs",
    "The colonists' pigs, let loose to forage, have got into the cornfields again, and the colonists say unfenced fields are nobody's fault but yours.",
    [
      C(
        "Go to their justice",
        { check: { skill: "persuasion" } },
        { pay: 0.3, say: "The justice made them pay for the corn. This once." },
        { stress: 6, say: "The justice told you to build fences." },
      ),
      C(
        "Keep the pigs",
        {},
        {
          pay: 0.4,
          renown: -1,
          say: "Pork for the winter. The colonists are angry.",
        },
      ),
    ],
  ),
  M(
    "grower",
    "task",
    "corn-cache",
    "The storage pits",
    "The harvest is in, and the corn must be dried and stored in pits lined with bark, enough to last till spring and seed for planting.",
    [
      C(
        "Store it well",
        { check: { skill: "farming" } },
        { pay: 0.4, xp: 8, say: "Dry and sweet till spring." },
        { pay: -0.3, say: "One pit went mouldy." },
      ),
      C(
        "Sell some to the colonists",
        { check: { skill: "trade" } },
        { pay: 0.6, say: "Corn to the hungry colonists, at a good price." },
        { say: "They paid in rum." },
      ),
    ],
    { when: harvestHere },
  ),
  M(
    "grower",
    "trouble",
    "blight",
    "A blight on the squash",
    "Something is eating the squash vines from the inside, and they're wilting one by one.",
    [
      C(
        "Cut out the borers",
        { check: { skill: "farming" } },
        { xp: 8, say: "Every vine slit and the grub taken out. Most lived." },
        { pay: -0.3, say: "The vines died anyway." },
      ),
      C("Plant again elsewhere", {}, { pay: -0.2, say: "A late crop, small." }),
    ],
    { when: months(5, 7) },
  ),
  M(
    "grower",
    "task",
    "seeds-gift",
    "Seeds for a new town",
    "A town of your people has moved after a fire and has no seed corn. The clan mothers ask what you can give.",
    [
      C(
        "Give generously",
        {},
        { renown: 2, pay: -0.3, say: "Their fields will grow from your seed." },
      ),
      C(
        "Trade it",
        { check: { skill: "trade" } },
        { pay: 0.3, say: "Traded for wampum." },
        { say: "They had nothing to trade." },
      ),
    ],
  ),
  M(
    "grower",
    "task",
    "teach-girl",
    "A girl to teach",
    "A girl of the clan follows you to the fields every day and asks the names of everything. The clan mothers say she should learn from you.",
    [
      C(
        "Teach her",
        { check: { skill: "leadership" } },
        { renown: 1, xp: 6, say: "She knows the seeds now, and the songs." },
        { say: "She's impatient. She'll learn." },
      ),
      C("Send her to her mother", {}, { say: "She'll come back." }),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the healer
  M(
    "healer",
    "task",
    "sweat-lodge",
    "The sweat lodge",
    "A man has come back from war with his spirit troubled, and asks for the sweat lodge and the songs.",
    [
      C(
        "Lead the ceremony",
        { check: { skill: "faith" } },
        { renown: 1, xp: 10, say: "He came out clean, and slept." },
        { stress: 4, say: "He came out still troubled." },
      ),
      C(
        "Give him medicine and rest",
        { check: { skill: "medicine" } },
        { xp: 8, say: "Rest, and he's better." },
        { say: "Rest didn't help." },
      ),
    ],
  ),
  M(
    "healer",
    "trouble",
    "smallpox-village",
    "The spotted sickness",
    "The spotted sickness has come to the next town with a trader's blanket, and they've sent for you.",
    [
      C(
        "Go to them",
        { check: { skill: "medicine", dc: 1 } },
        {
          renown: 3,
          xp: 14,
          say: "You nursed them. Fewer died than in the old stories.",
        },
        { health: -14, stress: 8, say: "You nursed them, and caught it." },
      ),
      C(
        "Keep your people apart",
        {},
        { say: "Your town shut its paths. The sickness passed you by." },
      ),
    ],
  ),
  M(
    "healer",
    "task",
    "colonist-doctor",
    "A colonial doctor",
    "A colonial physician wants to learn your medicines: snakeroot, sassafras, the bark for fevers. He offers his in exchange.",
    [
      C(
        "Trade knowledge",
        { check: { skill: "persuasion" } },
        {
          xp: 14,
          say: "Your snakeroot for his lancet. Both of you are wiser.",
        },
        { say: "He took your knowledge and gave little." },
      ),
      C(
        "Keep your medicines",
        {},
        { say: "The medicines stay with the people." },
      ),
    ],
  ),
  M(
    "healer",
    "trouble",
    "witch-accused",
    "Accused of witching",
    "A family says your medicine made their child worse, and some are whispering the old word for a witch.",
    [
      C(
        "Ask the council to hear it",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "The council heard, and cleared you." },
        { renown: -2, stress: 8, say: "The whispers go on." },
      ),
      C(
        "Heal the child",
        { check: { skill: "medicine" } },
        { renown: 2, say: "The child lived. The whispers stopped." },
        { stress: 8, say: "The child didn't." },
      ),
    ],
  ),
  M(
    "healer",
    "task",
    "herbs-far",
    "Herbs from far away",
    "A plant you need grows only by the salt springs four days away.",
    [
      C(
        "Go yourself",
        { check: { skill: "woodcraft" } },
        { xp: 10, pay: 0.3, say: "Gathered, dried, and enough for a year." },
        { health: -5, say: "Lost a day, and the plants were few." },
      ),
      C("Trade for it", { cost: 1 }, { xp: 4, say: "A trader brought it." }),
    ],
  ),
  M(
    "healer",
    "task",
    "apprentice-healer",
    "One who would learn",
    "A young man of another clan wants to learn your medicines, which is not the custom.",
    [
      C(
        "Teach him",
        {},
        { renown: 1, say: "He learns well. His clan is grateful." },
      ),
      C(
        "Keep to the custom",
        {},
        { say: "He'll learn from his own clan's healer." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the trader
  M(
    "trader",
    "task",
    "wampum-exchange",
    "Wampum and silver",
    "A colonist trader wants to pay in silver now, not cloth and kettles. Silver is easy to carry, and hard to eat.",
    [
      C(
        "Take silver and trade it on",
        { check: { skill: "trade" } },
        {
          pay: 0.8,
          xp: 10,
          say: "Silver to the next trader for twice the cloth.",
        },
        { pay: 0.2, say: "Silver, and nothing to spend it on here." },
      ),
      C(
        "Insist on goods",
        {},
        { pay: 0.4, say: "Kettles and cloth, as always." },
      ),
    ],
  ),
  M(
    "trader",
    "trouble",
    "debts-traders",
    "Debts to the traders",
    "The colonist traders say the town owes them a season's furs on credit, and they want land instead.",
    [
      C(
        "Pay in furs over two seasons",
        { check: { skill: "persuasion" } },
        { renown: 2, say: "Two seasons of furs. No land given." },
        { stress: 6, say: "They want land. They'll be back." },
      ),
      C("Take it to the council", {}, { say: "The council will decide." }),
    ],
  ),
  M(
    "trader",
    "task",
    "long-journey",
    "A trading journey",
    "The far nations of the west want guns and kettles and have beaver robes no colonist has seen. A journey of two moons.",
    [
      C(
        "Lead the journey",
        { check: { skill: "trade", dc: 1 } },
        {
          pay: 1.6,
          renown: 2,
          xp: 14,
          say: "Robes, horses, and new friends far to the west.",
        },
        { health: -8, say: "Robbed on the way home." },
      ),
      C("Stay home", {}, { say: "Others went." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "trader",
    "trouble",
    "bad-guns",
    "Guns that burst",
    "The guns from the last trader are bursting in the young men's hands: cheap iron, badly made.",
    [
      C(
        "Demand new ones",
        { check: { skill: "persuasion" } },
        { pay: 0.3, renown: 1, say: "New guns, and an apology." },
        { renown: -1, say: "The trader's gone." },
      ),
      C("Trade with his rival", {}, { say: "His rival will hear why." }),
    ],
  ),
  M(
    "trader",
    "task",
    "post-site",
    "A post for the colony",
    "The colony wants a trading post built near your town, and asks you where it should go.",
    [
      C(
        "Choose a place that suits your people",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          pay: 0.4,
          say: "Close enough to trade, far enough to keep the rum at a distance.",
        },
        { say: "The colony built where it pleased." },
      ),
      C(
        "Refuse a post",
        {},
        { say: "The colony built it anyway, further off." },
      ),
    ],
  ),
  M(
    "trader",
    "task",
    "beads-ask",
    "The new beads",
    "The young women want the new glass beads, blue and white, and will trade almost anything for them.",
    [
      C(
        "Buy beads by the string",
        { check: { skill: "trade" } },
        { pay: 0.6, say: "Beads for corn, corn for furs, furs for kettles." },
        { say: "Everyone else had beads too." },
      ),
      C("Not beads", {}, { say: "Beads are pretty and useless." }),
    ],
  ),

  // ------------------------------------------------ the speaker
  M(
    "speaker",
    "task",
    "colonial-council",
    "Speaking to the governor",
    "The governor of the colony wants to hear the nation's words on the new boundary, and you are to carry them.",
    [
      C(
        "Speak plainly and well",
        { check: { skill: "persuasion", dc: 1 } },
        {
          renown: 2,
          xp: 12,
          say: "The governor listened, and the boundary holds, for now.",
        },
        { stress: 4, say: "He heard you, and didn't listen." },
      ),
      C(
        "Speak gently",
        {},
        { renown: 1, say: "Gentle words, and a gift of wampum." },
      ),
    ],
  ),
  M(
    "speaker",
    "trouble",
    "unbidden-speaker",
    "Another speaker",
    "A rival speaker has gone to the colonists without the council's word and made promises in the nation's name.",
    [
      C(
        "Go after him and unsay it",
        { check: { skill: "persuasion" } },
        {
          renown: 2,
          xp: 8,
          say: "The colonists heard the council's true word.",
        },
        { stress: 6, say: "The colonists prefer his promises." },
      ),
      C(
        "Bring it before the council",
        {},
        { say: "The council will hear it." },
      ),
    ],
  ),
  M(
    "speaker",
    "task",
    "memorise",
    "The long speech",
    "The council has given you a long message: twenty points, each with its belt, to be spoken at the treaty in the right order.",
    [
      C(
        "Learn it by heart",
        { check: { skill: "letters" } },
        {
          renown: 1,
          xp: 12,
          say: "Twenty points, twenty belts, not a word wrong.",
        },
        { stress: 4, say: "You lost your place at the fourteenth." },
      ),
      C(
        "Take a helper with the belts",
        {},
        { say: "The helper held the belts in order." },
      ),
    ],
  ),
  M(
    "speaker",
    "trouble",
    "drunk-delegate",
    "A delegate in his cups",
    "One of the delegates has been given rum by the colonists and is saying things he shouldn't.",
    [
      C(
        "Take him away gently",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "Taken to sleep it off. Nothing signed." },
        { renown: -1, say: "He made a scene." },
      ),
      C("Speak over him", {}, { say: "The colonists heard two voices." }),
    ],
  ),
  M(
    "speaker",
    "task",
    "visiting-nation",
    "Guests from afar",
    "A delegation from a nation far to the south has come, and you must greet them and make them welcome.",
    [
      C(
        "Welcome them",
        { check: { skill: "persuasion" } },
        { renown: 2, xp: 8, say: "A new friendship between nations." },
        { say: "A misunderstanding over presents." },
      ),
      C("Let the elders do it", {}, { say: "The elders welcomed them." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "speaker",
    "task",
    "runner-message",
    "Running a message",
    "The council needs a message carried to the next town before dark, and the runner who usually goes has a bad foot.",
    [
      C(
        "Run it",
        { check: { skill: "woodcraft" } },
        { renown: 1, xp: 6, say: "There before sunset." },
        { health: -4, say: "There after dark, and sore." },
      ),
      C("Find another runner", {}, { say: "Someone else ran it." }),
    ],
    { when: rankBelow(2) },
  ),

  // ------------------------------------------------ the maker
  M(
    "maker",
    "task",
    "quillwork",
    "Quillwork for a wedding",
    "A family wants a quilled shirt and moccasins for a wedding: porcupine quills dyed red and yellow, in the old patterns.",
    [
      C(
        "Make them fine",
        { check: { skill: "craft" } },
        {
          pay: 0.6,
          renown: 1,
          xp: 10,
          say: "The bride wept. The groom's mother wept harder.",
        },
        { pay: 0.2, say: "Fine enough." },
      ),
      C("Make them plain", {}, { pay: 0.3, say: "Plain and well made." }),
    ],
  ),
  M(
    "maker",
    "trouble",
    "brass-kettles",
    "The colonists' kettles",
    "Nobody wants your clay pots now that the traders bring brass kettles. The young women say clay is old-fashioned.",
    [
      C(
        "Cut the kettles into things",
        { check: { skill: "craft" } },
        {
          pay: 0.5,
          xp: 10,
          say: "Brass points, brass ornaments, brass for everything.",
        },
        { say: "Brass is hard to cut." },
      ),
      C("Keep making pots", {}, { pay: -0.2, say: "The old women still buy." }),
    ],
  ),
  M(
    "maker",
    "task",
    "snowshoes",
    "Snowshoes for the winter",
    "Winter's coming and every family wants new snowshoes: ash frames, rawhide webbing.",
    [
      C(
        "Make a hundred",
        { check: { skill: "craft" } },
        {
          pay: 0.8,
          xp: 10,
          say: "A hundred pairs. Everyone walks on your work.",
        },
        { pay: 0.3, say: "Fifty pairs." },
      ),
      C("Make your own", {}, { say: "Your family's ready." }),
    ],
    { when: all(north, months(9, 11)) },
  ),
  M(
    "maker",
    "trouble",
    "tools-traded",
    "Your awls traded away",
    "Your nephew traded your best awls and knives to a colonist for a looking-glass.",
    [
      C(
        "Get them back",
        { check: { skill: "trade" } },
        { xp: 6, say: "Back, for the looking-glass and a little more." },
        { pay: -0.3, say: "New tools, dear." },
      ),
      C(
        "Let the boy learn",
        {},
        { stress: 3, say: "He's making you new ones. Badly." },
      ),
    ],
  ),
  M(
    "maker",
    "task",
    "wampum-belt",
    "A wampum belt for a treaty",
    "The council needs a great belt for a treaty: a thousand beads, a pattern that says two peoples walking one path.",
    [
      C(
        "Weave it",
        { check: { skill: "craft", dc: 1 } },
        {
          pay: 0.8,
          renown: 2,
          xp: 14,
          say: "A belt the treaty will be remembered by.",
        },
        { stress: 4, say: "The pattern's crooked. It'll serve." },
      ),
      C(
        "Help another maker",
        {},
        { xp: 4, say: "Your beads in someone else's belt." },
      ),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "maker",
    "task",
    "bark-canoe-repair",
    "A canoe holed",
    "A trader's canoe was holed on the rocks and he'll pay well if it's sound by tomorrow.",
    [
      C(
        "Patch it with bark and gum",
        { check: { skill: "craft" } },
        { pay: 0.5, xp: 8, say: "Sound, and floating." },
        { say: "It leaks a little." },
      ),
      C("Not in a day", {}, { say: "He waited a week." }),
    ],
    { when: openWater },
  ),

  // ------------------------------------------------ the interpreter
  M(
    "interpreter",
    "task",
    "trade-dispute",
    "A trader's dispute",
    "A colonist trader and a hunter are shouting at each other over a bale of furs, and neither knows a word the other says.",
    [
      C(
        "Translate fairly",
        { check: { skill: "persuasion" } },
        {
          pay: 0.4,
          renown: 1,
          xp: 8,
          say: "A fair price, and two men who trust you.",
        },
        { say: "They're shouting at you now." },
      ),
      C(
        "Translate for whoever pays",
        {},
        { pay: 0.6, renown: -1, say: "The trader paid." },
      ),
    ],
  ),
  M(
    "interpreter",
    "trouble",
    "missionary-words",
    "The missionary's catechism",
    "The missionary wants the catechism translated, and some of his words have no meaning in the language, and some mean something rude.",
    [
      C(
        "Find the right words",
        { check: { skill: "letters" } },
        { pay: 0.5, xp: 12, say: "A catechism the people can understand." },
        { renown: -1, say: "The old people laugh at one line." },
      ),
      C(
        "Translate it literally",
        {},
        { pay: 0.3, say: "Word for word, and nonsense." },
      ),
    ],
  ),
  M(
    "interpreter",
    "task",
    "court-interpreter",
    "In the colonial court",
    "A man of the nations is on trial in the colonial court, and they need an interpreter to tell him what he's charged with.",
    [
      C(
        "Interpret, and speak for him",
        { check: { skill: "persuasion" } },
        { renown: 2, xp: 10, say: "The jury understood him. He went free." },
        { stress: 6, say: "The jury didn't care." },
      ),
      C("Interpret only", {}, { pay: 0.4, say: "Only the words." }),
    ],
  ),
  M(
    "interpreter",
    "trouble",
    "both-sides",
    "Trusted by neither",
    "The colonists suspect you favour the nations, and the nations suspect you favour the colonists.",
    [
      C(
        "Prove yourself to both",
        { check: { skill: "persuasion" } },
        { renown: 2, say: "Both sides came to you for the next council." },
        { stress: 6, say: "Neither side came." },
      ),
      C("Let them suspect", {}, { stress: 3, say: "You know what you are." }),
    ],
  ),
  M(
    "interpreter",
    "task",
    "teach-colonist",
    "Teaching a colonist",
    "A young colonist officer wants to learn the language and pays well for lessons.",
    [
      C(
        "Teach him",
        { check: { skill: "letters" } },
        { pay: 0.6, xp: 6, say: "He speaks it badly, and proudly." },
        { pay: 0.2, say: "He gave up." },
      ),
      C("Not him", {}, { say: "He'll find someone else." }),
    ],
  ),
  M(
    "interpreter",
    "task",
    "letter-governor",
    "A letter to the governor",
    "A sachem wants a letter written to the colonial governor in proper English, saying exactly what he says and no more.",
    [
      C(
        "Write it exactly",
        { check: { skill: "letters" } },
        {
          pay: 0.4,
          renown: 1,
          xp: 8,
          say: "The governor read the sachem's words, exactly.",
        },
        { say: "The governor misread it." },
      ),
      C("Soften it", {}, { pay: 0.3, say: "The governor read softer words." }),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the guide
  M(
    "guide",
    "task",
    "naturalist",
    "A naturalist",
    "A gentleman from London wants to be shown every plant, bird and snake in the country, and to send specimens home in jars.",
    [
      C(
        "Show him everything",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 10,
          say: "He named a plant after you. In Latin.",
        },
        { health: -4, say: "He found the rattlesnake before you did." },
      ),
      C(
        "Show him the easy paths",
        {},
        { pay: 0.4, say: "He was disappointed by the easy paths." },
      ),
    ],
    { when: openWater },
  ),
  M(
    "guide",
    "trouble",
    "river-crossing",
    "A river in spate",
    "The river is up, and the party you're guiding wants to cross today.",
    [
      C(
        "Find a ford",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.3,
          xp: 10,
          say: "A ford upstream, waist deep. Everyone across.",
        },
        { health: -6, say: "A man swept off, and you after him." },
      ),
      C(
        "Make them wait",
        { check: { skill: "persuasion" } },
        { say: "They waited. The river fell." },
        { say: "They crossed without you." },
      ),
    ],
  ),
  M(
    "guide",
    "task",
    "army-guide",
    "Guiding an army",
    "An army column wants a guide through the mountains, and the general doesn't listen.",
    [
      C(
        "Guide them",
        { check: { skill: "leadership" } },
        {
          pay: 1.2,
          renown: 2,
          xp: 10,
          say: "Through the mountains, despite the general.",
        },
        {
          health: -8,
          say: "The general took the wrong road, and you with him.",
        },
      ),
      C("Decline", {}, { say: "They found another guide." }),
    ],
    { when: atWarNow },
  ),
  M(
    "guide",
    "trouble",
    "settlers-lost",
    "A family off the road",
    "A family of settlers has wandered off the trace and their wagon's stuck in a swamp.",
    [
      C(
        "Lead them out",
        { check: { skill: "woodcraft" } },
        { renown: 1, xp: 6, say: "Out, and back on the trace." },
        { say: "The wagon stayed in the swamp." },
      ),
      C("Point the way", {}, { say: "They'll find it." }),
    ],
  ),
  M(
    "guide",
    "task",
    "hunt-party",
    "A gentleman's hunt",
    "Gentlemen from the capital want a week's hunting and a story to tell.",
    [
      C(
        "Give them a story",
        { check: { skill: "woodcraft" } },
        {
          pay: 0.8,
          renown: 1,
          xp: 8,
          say: "A bear, a stag, and a story improving with each telling.",
        },
        { pay: 0.3, say: "A deer, eventually." },
      ),
      C("Give them a walk", {}, { pay: 0.4, say: "They walked." }),
    ],
    { when: peaceNow },
  ),
  M(
    "guide",
    "task",
    "new-trail",
    "A new trail",
    "The trace is long and winding, and you think there's a shorter way through a gap nobody's tried.",
    [
      C(
        "Blaze it",
        { check: { skill: "woodcraft", dc: 1 } },
        {
          pay: 0.6,
          renown: 2,
          xp: 14,
          say: "A new trail, two days shorter. They're calling it by your name.",
        },
        { health: -6, say: "The gap was a cliff." },
      ),
      C("Stick to the trace", {}, { say: "The trace is safe." }),
    ],
    { when: rankAtLeast(1) },
  ),

  // ------------------------------------------------ the counsellor
  M(
    "counsellor",
    "task",
    "mourning-condolence",
    "The condolence council",
    "A great chief has died, and a new one must be raised with the condolence ceremony, every word in its place.",
    [
      C(
        "Lead the ceremony",
        { check: { skill: "faith", dc: 1 } },
        {
          renown: 2,
          xp: 12,
          say: "The tears wiped away, the new chief raised.",
        },
        { stress: 4, say: "A word out of place, and the old men frowned." },
      ),
      C(
        "Sit with the elders",
        {},
        { xp: 4, say: "You listened, and learned." },
      ),
    ],
  ),
  M(
    "counsellor",
    "trouble",
    "secret-sale",
    "A secret sale",
    "Some men of the nation have sold land to the colonists without the council's consent, and the colonists say the deed is good.",
    [
      C(
        "Deny the deed before the governor",
        { check: { skill: "persuasion", dc: 1 } },
        { renown: 2, xp: 10, say: "The governor voided the deed, for now." },
        { stress: 6, say: "The governor kept the deed." },
      ),
      C(
        "Punish the sellers",
        {},
        { renown: 1, say: "They're shamed before the people." },
      ),
    ],
  ),
  M(
    "counsellor",
    "task",
    "alliance",
    "An alliance",
    "Another nation proposes an alliance: against a common enemy, or against the colonists.",
    [
      C(
        "Counsel for it",
        { check: { skill: "leadership" } },
        { renown: 2, xp: 10, say: "An alliance, and belts exchanged." },
        { say: "The council said no." },
      ),
      C("Counsel caution", {}, { renown: 1, say: "The council waited." }),
    ],
    { when: rankAtLeast(1) },
  ),
  M(
    "counsellor",
    "trouble",
    "young-men-rum",
    "The young men and the rum",
    "The young men are trading everything for the colonists' rum, and the old people want the council to stop it.",
    [
      C(
        "Ban the rum traders",
        { check: { skill: "leadership" } },
        { renown: 2, say: "The rum traders are turned back." },
        { stress: 6, say: "The rum comes anyway." },
      ),
      C(
        "Ask the governor to stop the trade",
        { check: { skill: "persuasion" } },
        { renown: 1, say: "The governor promised. Promises." },
        { say: "The governor shrugged." },
      ),
    ],
  ),
  M(
    "counsellor",
    "task",
    "dream-interpret",
    "A dream to read",
    "A young man has dreamed of a white bird falling from the sky, and the people ask what it means.",
    [
      C(
        "Read it",
        { check: { skill: "faith" } },
        { renown: 1, xp: 8, say: "A warning, and a wise one." },
        { say: "The people argue over your reading." },
      ),
      C(
        "Let the healer read it",
        {},
        { say: "The healer read it differently." },
      ),
    ],
  ),
  M(
    "counsellor",
    "task",
    "captive-return",
    "Captives to return",
    "The colonists want their captives returned, and some of the captives have married into the nation and don't want to go.",
    [
      C(
        "Let each choose",
        { check: { skill: "persuasion" } },
        { renown: 2, xp: 8, say: "Some went home. Some stayed. Each chose." },
        { stress: 6, say: "The colonists took them all." },
      ),
      C("Return them all", {}, { say: "Returned. Some wept." }),
    ],
  ),
];
