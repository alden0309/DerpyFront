// What a character can do at the places of a province (drink, gamble, pray,
// hunt, drill, write a pamphlet, petition the governor...) and with the
// people they meet (talk, flatter, court, propose, borrow, duel...). Each
// has a cooldown, sometimes a cost, often a skill check with its odds shown,
// and effects that last: opinions, renown, money, health and skills.

import { presentAt } from "./Areas";
import { formatDate } from "./Calendar";
import { eligibleHere } from "./Folk";
import type { ConquestGame } from "./Game";
import { afterHearing } from "./Leads"; // WORLD r11
import {
  addRenown,
  addStress,
  earn,
  gainTrait,
  gainXp,
  heal,
  hurt,
  journal,
  meet,
  milestone,
  outcomeMeta,
  remembers,
  rollCheck,
  setCooldown,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  hasPlace,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  peopleHere,
  promotionView,
  skillLevel,
  startRank,
  yes,
} from "./LifeQueries";
import {
  checkChance,
  ENDOWMENTS,
  JOBS,
  KIT,
  LAND_GRANT,
  LAND_LOT,
  LESSONS,
  SKILL_NAMES,
  WORKS,
} from "./LifeRules";
import type { World } from "./Map";
import {
  buildWork,
  buyKit,
  companyName,
  dinnerCost,
  dinnerName,
  giveDinner,
  grantCheck,
  kitCheck,
  kitPrice,
  landGrant,
  lessons,
  lessonSkill,
  shareStake,
  startVenture,
  ventureCheck,
  ventureStake,
  workCheck,
} from "./Money";
import {
  buyArms,
  holdMeeting,
  movementOf,
  movementPamphlet,
} from "./Movements";
import { campaignBoost, seekCourt, writeToCrown } from "./Politics";
import {
  buyHouse,
  buyLand,
  endow,
  endowCheck,
  houseCheck,
  housePrice,
  landCheck,
  openBusiness,
} from "./Property";
import { ageOf, charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { heardHere } from "./Rumours";
import type { Character, GameState, Life, PlaceKind, Skill } from "./Types";
import { SEATS } from "./Types";
import { buyRank, selfStartCheck, startJob } from "./Work";

// ---------------------------------------------------------------- place acts

export interface ActDef {
  key: string;
  places: PlaceKind[];
  label: string;
  text: string;
  /** Days before it can be done again. */
  cooldown: number;
  cost?: number;
  /** The skill it tests or teaches, shown with the odds. */
  skill?: Skill;
  /** Difficulty of the check, if there is one. */
  dc?: number;
  /** Children may do it. */
  child?: boolean;
  /** When it's offered at all (beyond place and cooldown). */
  when?: (s: GameState, w: World, life: Life) => Check;
}

const adult = (s: GameState, _w: World, life: Life): Check =>
  isChildLife(s, life) ? no("Not until you're sixteen.") : yes;

// LIFE (r11): "Put in a hard day" is gone: work runs itself at your post,
// as hard as you choose to go at it (Trades.ts).
export const ACTS: ActDef[] = [
  {
    key: "traplines",
    places: ["woods"],
    label: "Set your own traplines",
    text: "Nobody's hand but your own: beaver and otter, sold where they fetch most. You'll be a trapper, and your own master.",
    cooldown: 0,
    when: (s, w, life) => selfStartCheck(s, w, life, "trapper"),
  },
  {
    key: "gossip",
    places: ["tavern", "market", "village", "docks"],
    label: "Listen to the talk",
    text: "What people are saying: deaths, weddings, wars, scandals, who's been seen with whom, and where prices are high. Sometimes a lead.",
    cooldown: 5,
    child: true,
  },
  {
    key: "house",
    places: ["market", "village", "home"],
    label: "A house of your own",
    text: "A roof of your own (or a better one): your household moves in, and the neighbours notice.",
    cooldown: 0,
    when: (s, w, life) => houseCheck(s, life).check,
  },
  {
    key: "land",
    places: ["fields"],
    label: `Buy ten acres (${LAND_LOT.cost})`,
    text: "Land let to tenants: rents every month, and a vote at election time.",
    cooldown: 0,
    when: (s, w, life) => landCheck(s, life),
  },
  {
    key: "family",
    places: ["home"],
    label: "An evening with your family",
    text: "Supper, a story, the children put to bed. Cares fall away; your spouse remembers it.",
    cooldown: 7,
    child: true,
  },
  {
    key: "rest",
    places: ["home"],
    label: "Rest at home",
    text: "A few quiet days by your own fire. Health and calm return.",
    cooldown: 21,
    child: true,
  },
  {
    key: "drink",
    places: ["tavern"],
    label: "Drink and listen",
    text: "A pot of ale, the news, and the people worth knowing; sometimes a story worth chasing. Eases the mind; too much of it becomes a habit.",
    cooldown: 5,
    cost: 0.3,
    skill: "persuasion",
    when: adult,
  },
  {
    key: "gamble",
    places: ["tavern"],
    label: "Dice and cards (5 coins)",
    text: "Win or lose five coins. Trade sense and a straight face help; luck does most of it.",
    cooldown: 4,
    cost: 0,
    skill: "trade",
    dc: 7,
    when: (s, w, life) =>
      isChildLife(s, life)
        ? no("Not until you're sixteen.")
        : life.purse < 5
          ? no("You need 5 coins to sit down.")
          : yes,
  },
  {
    key: "round",
    places: ["tavern"],
    label: "Stand a round",
    text: "Drinks for the house. The town likes you better, and remembers your name at election time.",
    cooldown: 21,
    cost: 3,
    when: adult,
  },
  {
    key: "brawl",
    places: ["tavern"],
    label: "Pick a fight",
    text: "Settle it outside. Win and they'll talk about it; lose and you'll limp.",
    cooldown: 30,
    skill: "fighting",
    dc: 7,
    when: adult,
  },
  {
    key: "sleep",
    places: ["tavern"],
    label: "Take a room and rest",
    text: "A clean bed for a week. Stress falls away.",
    cooldown: 21,
    cost: 1,
    child: true,
  },
  {
    key: "peddle",
    places: ["market"],
    label: "Peddle odds and ends",
    text: "Buy cheap at one stall, sell dear at another.",
    cooldown: 7,
    skill: "trade",
    dc: 6,
    when: adult,
  },
  {
    key: "pray",
    places: ["church", "village"],
    label: "Pray",
    text: "An hour with God (or the spirits). Calms the mind; teaches faith.",
    cooldown: 7,
    skill: "faith",
    child: true,
  },
  {
    key: "alms",
    places: ["church"],
    label: "Give alms (2 coins)",
    text: "The poor at the door bless your name; the minister notices.",
    cooldown: 30,
    cost: 2,
  },
  {
    key: "match",
    places: ["church", "councilfire"],
    label: "Seek a match",
    text: "Be introduced to the unmarried of the parish (or the village). Courting is up to you.",
    cooldown: 60,
    when: adult,
  },
  {
    key: "study",
    places: ["church"],
    label: "Study with the minister",
    text: "Reading, writing and scripture, for half a coin.",
    cooldown: 7,
    cost: 0.5,
    skill: "letters",
    child: true,
  },
  {
    key: "council",
    places: ["councilfire"],
    label: "Sit at the council fire",
    text: "Listen to the elders and the speakers. Learn how your people decide.",
    cooldown: 14,
    skill: "persuasion",
    child: true,
  },
  {
    key: "speak",
    places: ["councilfire"],
    label: "Speak at the council",
    text: "Rise and speak your mind. Done well, it's remembered for years.",
    cooldown: 60,
    skill: "persuasion",
    dc: 8,
    when: adult,
  },
  {
    key: "tobacco",
    places: ["councilfire"],
    label: "Offer tobacco and gifts (2)",
    text: "Gifts for the elders: the council thinks well of you.",
    cooldown: 30,
    cost: 2,
    when: adult,
  },
  {
    key: "stories",
    places: ["village"],
    label: "Listen to the elders' stories",
    text: "The old stories, the treaties, the names of places. Memory is the people's library.",
    cooldown: 14,
    skill: "letters",
    child: true,
  },
  {
    key: "chunkey",
    places: ["village"],
    label: "Play at chunkey",
    text: "Stones rolled and poles thrown, and wagers on every throw. A good arm wins renown.",
    cooldown: 30,
    skill: "fighting",
    dc: 6,
    when: adult,
  },
  {
    key: "healer",
    places: ["village"],
    label: "Visit the healer",
    text: "Sweat lodge, herbs and songs. Health returns.",
    cooldown: 30,
    cost: 0.5,
    child: true,
  },
  {
    key: "news",
    places: ["docks"],
    label: "News from Europe",
    text: "Sailors in from London, Paris and Seville: wars, prices and who's in favour, and talk of wrecks and ships wanting hands.",
    cooldown: 30,
    child: true,
  },
  {
    key: "drill",
    places: ["fort", "councilfire"],
    label: "Drill with the garrison",
    text: "Musket drill, or the war dances and mock fights of the young men. Fighting and leadership.",
    cooldown: 7,
    skill: "fighting",
    when: adult,
  },
  {
    key: "commission",
    places: ["fort"],
    label: "Buy a commission (40)",
    text: "A gentleman doesn't start as a private: buy a lieutenancy outright.",
    cooldown: 0,
    cost: 40,
    when: (s, w, life) => {
      if (isChildLife(s, life)) return no("Not until you're sixteen.");
      if (life.job?.kind === "soldier")
        return no("You're in the army already.");
      if (life.job) return no("You have work already: give it up first.");
      if (lifeIsNative(s, life)) return no("Not open to you.");
      if (life.skills.fighting < 3) return no("Needs fighting 3.");
      const me = meOf(s, life)!;
      const pr = s.provinces[life.prov];
      if (pr.owner !== me.nation) return no("Only in your own nation's fort.");
      return yes;
    },
  },
  {
    key: "garrison",
    places: ["fort", "councilfire"],
    label: "Stay behind in garrison",
    text: "Leave the army's march and serve here instead (so you can come and go).",
    cooldown: 30,
    when: (s, w, life) =>
      life.job && life.job.army >= 0
        ? yes
        : no("You're not marching with an army."),
  },
  {
    key: "bench",
    places: ["workshop"],
    label: "Learn at the bench",
    text: "Pay a master to teach you a trick or two.",
    cooldown: 7,
    cost: 0.5,
    skill: "craft",
    child: true,
  },
  {
    key: "pamphlet",
    places: ["press"],
    label: "Write a pamphlet (1)",
    text: "Set your opinions in type. Renown if it's good; if you belong to a movement, it spreads the cause, and may bring the constable.",
    cooldown: 30,
    cost: 1,
    skill: "letters",
    dc: 8,
    when: adult,
  },
  {
    key: "gazette",
    places: ["press", "tavern"],
    label: "Read the gazette",
    text: "What's happening in the colonies and beyond, the prices current at the nearest ports, and the best-checked stories going round: gold, wrecks, cheap land, rewards. Often a lead worth following.",
    cooldown: 10,
    skill: "letters",
    child: true,
  },
  {
    key: "freehold",
    places: ["fields"],
    label: "Buy a freehold (30)",
    text: "Land of your own: you become a yeoman farmer, and a freeholder can vote and stand for the assembly.",
    cooldown: 0,
    cost: 30,
    when: (s, w, life) => {
      if (isChildLife(s, life)) return no("Not until you're sixteen.");
      if (lifeIsNative(s, life))
        return no("Land isn't bought and sold among your people.");
      if (life.job?.kind === "farmer")
        return no("You farm already: see your trade's next rung.");
      if (life.job?.kind === "servant" && (life.job.until ?? 0) > s.day)
        return no("Servants can't own land.");
      if (life.job) return no("You have work already: give it up first.");
      return yes;
    },
  },
  {
    key: "runaway",
    places: ["fields"],
    label: "Run away",
    text: "Slip away by night. If you get clear, you're free; if they catch you, a whipping and another year.",
    cooldown: 180,
    skill: "stealth",
    dc: 8,
    when: (s, w, life) =>
      life.job?.kind === "servant" && (life.job.until ?? 0) > s.day
        ? yes
        : no("Only the bound run away."),
  },
  {
    key: "respects",
    places: ["governor"],
    label: "Pay your respects",
    text: "Attend the governor's levee: meet the council and the gentry.",
    cooldown: 30,
    when: (s, w, life) =>
      isChildLife(s, life)
        ? no("Not until you're sixteen.")
        : life.renown < 5 &&
            life.background !== "gentry" &&
            (life.job?.rank ?? 0) < 2
          ? no("They don't let just anyone in (renown 5).")
          : yes,
  },
  {
    key: "court",
    places: ["governor", "councilfire"],
    label: "Seek a place at court",
    text: "Ask to be counted among the governor's (or the leader's) people: those the council is chosen from.",
    cooldown: 180,
    when: adult,
  },
  {
    key: "crown",
    places: ["governor", "docks"],
    label: "Write to the crown (2)",
    text: "Letters to the Board of Trade, a minister, a cousin at court. Favour at home helps make governors, and brings invitations to Europe.",
    cooldown: 60,
    cost: 2,
    skill: "letters",
    dc: 8,
    when: (s, w, life) =>
      isChildLife(s, life)
        ? no("Not until you're sixteen.")
        : lifeIsNative(s, life)
          ? no("Your people's letters go through the colony's governor.")
          : yes,
  },
  {
    key: "endow-church",
    places: ["church"],
    label: `Endow the church (${ENDOWMENTS.church.cost})`,
    text: ENDOWMENTS.church.text,
    cooldown: 0,
    when: (s, w, life) => endowCheck(s, life, "church"),
  },
  {
    key: "endow-school",
    places: ["governor"],
    label: `Found a free school (${ENDOWMENTS.school.cost})`,
    text: ENDOWMENTS.school.text,
    cooldown: 0,
    when: (s, w, life) => endowCheck(s, life, "school"),
  },
  {
    key: "endow-road",
    places: ["governor"],
    label: `Mend the road (${ENDOWMENTS.road.cost})`,
    text: ENDOWMENTS.road.text,
    cooldown: 0,
    when: (s, w, life) => endowCheck(s, life, "road"),
  },
  {
    key: "endow-feast",
    places: ["councilfire", "village"],
    label: `Give a feast (${ENDOWMENTS.feast.cost})`,
    text: ENDOWMENTS.feast.text,
    cooldown: 0,
    when: (s, w, life) => endowCheck(s, life, "feast"),
  },
  {
    key: "physic",
    places: ["apothecary"],
    label: "Buy physic (3)",
    text: "Bark, salts and the physician's advice. Health returns.",
    cooldown: 30,
    cost: 3,
    child: true,
  },
  {
    key: "studyphysic",
    places: ["apothecary"],
    label: "Study physic (1)",
    text: "Read the physician's books and watch him work.",
    cooldown: 7,
    cost: 1,
    skill: "medicine",
  },
  {
    key: "treat",
    places: ["apothecary", "village"],
    label: "Treat the sick",
    text: "Set bones and nurse fevers, for a fee. Fevers are catching.",
    cooldown: 7,
    skill: "medicine",
    dc: 7,
    when: (s, w, life) =>
      life.job?.kind !== "physician" && life.job?.kind !== "healer"
        ? no("Physicians' and healers' work.")
        : life.job.prov !== life.prov
          ? no("That's done where you work.")
          : yes,
  },
  {
    key: "hunt",
    places: ["woods"],
    label: "Hunt",
    text: "Deer and turkey for the pot, hides to sell.",
    cooldown: 5,
    skill: "woodcraft",
    dc: 6,
    when: adult,
  },
  {
    key: "trap",
    places: ["woods"],
    label: "Walk the traplines",
    text: "Beaver and otter: furs to carry and sell where they fetch most.",
    cooldown: 14,
    skill: "woodcraft",
    dc: 6,
    when: (s, w, life) =>
      life.job?.kind === "trapper" || life.job?.kind === "hunter"
        ? yes
        : no("Trappers' and hunters' work."),
  },
  {
    key: "forage",
    places: ["woods"],
    label: "Gather herbs",
    text: "Roots, bark and leaves for medicines.",
    cooldown: 10,
    skill: "medicine",
    child: true,
  },
  {
    key: "meeting",
    places: ["tavern", "councilfire"],
    label: "Hold a meeting of the cause",
    text: "A back room, a bowl of punch and speeches. Support for your movement grows; informers listen.",
    cooldown: 30,
    skill: "leadership",
    when: (s, w, life) => {
      const m = movementOf(s, life.c);
      if (!m) return no("You belong to no movement.");
      if (!m.region.includes(life.prov))
        return no("Hold meetings among your followers.");
      return yes;
    },
  },
  {
    key: "arms",
    places: ["market", "docks", "village"],
    label: "Put arms by for the cause (10)",
    text: "Muskets and powder, bought quietly. A rising starts with more men when the arms are ready.",
    cooldown: 30,
    cost: 10,
    when: (s, w, life) =>
      movementOf(s, life.c) ? yes : no("You belong to no movement."),
  },
  {
    key: "canvass",
    places: ["tavern", "market", "councilfire"],
    label: "Canvass the voters",
    text: "Shake hands, hear complaints, promise a road. Wins campaign points.",
    cooldown: 14,
    skill: "persuasion",
    dc: 7,
    when: (s, w, life) =>
      life.campaign ? yes : no("You're not standing for anything."),
  },
  {
    key: "broadside",
    places: ["press"],
    label: "Print a broadside (2)",
    text: "Your name and your promises on every tavern door.",
    cooldown: 30,
    cost: 2,
    when: (s, w, life) =>
      life.campaign ? yes : no("You're not standing for anything."),
  },
  {
    key: "buy",
    places: [
      "fields",
      "workshop",
      "press",
      "docks",
      "market",
      "tavern",
      "fort",
      "woods",
    ],
    label: "Buy your way up",
    text: "Pay for the next rung of your trade: land, a shop, a press, a ship, a commission.",
    cooldown: 0,
    when: (s, w, life) => {
      const job = life.job;
      if (!job) return no("You have no trade.");
      const next = JOBS[job.kind].ranks[job.rank + 1];
      if (!next?.buy) return no("The next rung isn't for sale.");
      if (life.prov !== job.prov && job.army < 0)
        return no("That's done where you work.");
      // Money buys the rung, not the years or the skill.
      const unmet = promotionView(s, life).needs.find(
        (x) =>
          !x.met &&
          !x.label.includes("coins for") &&
          !x.label.includes("a word from"),
      );
      if (unmet) return no(`Needs ${unmet.label}.`);
      if (life.purse < next.buy.cost)
        return no(`Needs ${next.buy.cost} coins.`);
      return yes;
    },
  },
];

// What money can buy, place by place.
ACTS.push(
  {
    key: "tools",
    places: ["workshop", "market", "village"],
    label: "Buy good tools",
    text: KIT.tools.text,
    cooldown: 0,
    when: (s, w, life) => kitCheck(s, life, "tools"),
  },
  {
    key: "lessons",
    places: ["home", "church"],
    label: `Hire a tutor (${LESSONS.cost})`,
    text: "A master of the art, paid to take you in hand: a month of evenings on what your next rung needs most.",
    cooldown: LESSONS.cooldown,
    cost: LESSONS.cost,
    when: adult,
  },
  {
    key: "horse",
    places: ["market", "fields", "village"],
    label: "Buy a horse",
    text: KIT.horse.text,
    cooldown: 0,
    when: (s, w, life) => kitCheck(s, life, "horse"),
  },
  {
    key: "carriage",
    places: ["market"],
    label: `Set up a carriage (${KIT.carriage.cost})`,
    text: KIT.carriage.text,
    cooldown: 0,
    when: (s, w, life) => kitCheck(s, life, "carriage"),
  },
  {
    key: "pew",
    places: ["church"],
    label: "Take a pew of your own",
    text: KIT.pew.text,
    cooldown: 0,
    when: (s, w, life) => kitCheck(s, life, "pew"),
  },
  {
    key: "venture",
    places: ["docks"],
    label: "Venture a cargo",
    text: "Put money into a cargo on the next ship out. Months later it comes home with a profit, or a loss, or not at all.",
    cooldown: 30,
    when: (s, w, life) => ventureCheck(s, life, "cargo"),
  },
  {
    key: "shares",
    places: ["market"],
    label: "Buy shares in a company",
    text: "A stake in one of the great trading companies: a dividend every month, a price that rises and falls, and now and then a bubble that bursts. Sell whenever you like (Affairs).",
    cooldown: 30,
    when: (s, w, life) => ventureCheck(s, life, "shares"),
  },
  {
    key: "dinner",
    places: ["home"],
    label: "Give a dinner",
    text: "Your table, your wine, the people who matter here: they'll think the better of you, and so will the town. More is expected the higher you stand.",
    cooldown: 120,
    when: (s, w, life) =>
      isChildLife(s, life)
        ? no("Not until you're sixteen.")
        : life.purse < dinnerCost(s, life)
          ? no(`A dinner fit for your station: ${dinnerCost(s, life)} coins.`)
          : yes,
  },
  {
    key: "grant",
    places: ["governor"],
    label: `Petition for a land grant (${LAND_GRANT.fee})`,
    text: `A headright of ${LAND_GRANT.lots * 10} acres at home, for the patent fees, if the governor thinks well of you.`,
    cooldown: 0,
    when: (s, w, life) => grantCheck(s, life),
  },
  ...Object.entries(WORKS).map(
    ([k, wk]): ActDef => ({
      key: `work-${k}`,
      places: k === "college" ? ["governor"] : ["church"],
      label: `${wk.label} (${wk.cost})`,
      text: wk.text,
      cooldown: 0,
      when: (s, w, life) => workCheck(s, life, k),
    }),
  ),
);

export const ACT_BY_KEY = new Map(ACTS.map((a) => [a.key, a]));

/** Whether an act can be done here now, and the odds if there's a check. */
export function actCheck(
  s: GameState,
  w: World,
  life: Life,
  place: PlaceKind,
  key: string,
): Check {
  const def = ACT_BY_KEY.get(key);
  if (!def || !def.places.includes(place)) return no("Not here.");
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (life.travel) return no("You're on the road.");
  if (!hasPlace(s, w, life.prov, place))
    return no("There's no such place here.");
  if (isChildLife(s, life) && !def.child)
    return no("Not until you're sixteen.");
  const left = Math.max(0, (life.cooldowns[`act:${key}`] ?? 0) - s.day);
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  if (def.cost && life.purse < def.cost)
    return no(`Costs ${def.cost} coin${def.cost === 1 ? "" : "s"}.`);
  if (def.when) {
    const c = def.when(s, w, life);
    if (!c.ok) return c;
  }
  if (key === "buy") {
    const v = promotionView(s, life);
    const next = v.next;
    if (next?.buy && life.purse < next.buy.cost)
      return no(`${next.buy.what}: ${next.buy.cost} coins.`);
  }
  return yes;
}

/** The odds of an act's check for this character, if it has one. */
export function actOdds(s: GameState, life: Life, key: string): number | null {
  const def = ACT_BY_KEY.get(key);
  if (!def?.skill || def.dc === undefined) return null;
  return checkChance(skillLevel(s, life, def.skill), def.dc);
}

/** The acts a place offers this character. */
export function actsAt(place: PlaceKind): ActDef[] {
  return ACTS.filter((a) => a.places.includes(place));
}

const GOSSIP = [
  "They say the governor's gout is worse, and his temper with it.",
  "A ship's mate swears he saw a sea serpent off the Capes. He was sober, he says.",
  "The price of tobacco is down again, and the planters are in a black mood.",
  "Somebody's cow got into the churchyard. The minister is taking it personally.",
  "The assembly sat three days and agreed only on the date of the next sitting.",
  "A trader back from the interior says the French are building forts on every river.",
  "The new tax is either a scandal or a necessity, depending who's buying.",
  "The magistrate's daughter has turned down a third suitor. The fourth is in the corner.",
  "There's talk of war in Europe. There's always talk of war in Europe.",
  "A preacher passed through who could make a stone weep and a drunkard sign the pledge. Neither lasted.",
  "Smallpox in the next province, they say. Or measles. Or a rumour of smallpox.",
  "Two gentlemen nearly fought a duel over a horse. The horse has since died, which settled it.",
];

/** What an act's button says for this character. */
export function actLabel(s: GameState, life: Life, def: ActDef): string {
  if (def.key === "house") {
    const v = houseCheck(s, life);
    return v.next
      ? `${v.level ? "Move up to" : "Buy"} a ${v.next.name.toLowerCase()} (${housePrice(s, life)})`
      : "Your house";
  }
  if (def.key === "buy") {
    const v = promotionView(s, life);
    return v.next?.buy
      ? `Buy ${v.next.buy.what} (${v.next.buy.cost})`
      : "Buy your way up";
  }
  if (def.key === "tools" || def.key === "horse" || def.key === "pew")
    return `${def.label} (${kitPrice(s, life, def.key)})`;
  if (def.key === "venture")
    return `Venture a cargo (${ventureStake(s, life)})`;
  if (def.key === "shares") {
    const stake = shareStake(s, life);
    return stake
      ? `Shares in ${companyName(s, life).replace(/^the /, "the ")} (${stake})`
      : def.label;
  }
  if (def.key === "dinner")
    return `Give ${dinnerName(s, life)} (${dinnerCost(s, life)})`;
  if (def.key === "lessons")
    return `A tutor in ${SKILL_NAMES[lessonSkill(s, life)].toLowerCase()} (${LESSONS.cost})`;
  return def.label;
}

/** Who stands opposite you in the scene for an act at a place. */
function sceneFigure(
  g: ConquestGame,
  life: Life,
  place: PlaceKind,
  key: string,
): number {
  const s = g.s;
  if (key === "family")
    return s.chars[meOf(s, life)?.spouse ?? -1]?.alive
      ? meOf(s, life)!.spouse
      : -1;
  const folk = presentAt(s, g.w, life.prov, place, s.day, life).filter(
    (p) => p.kind !== "player",
  );
  if (!folk.length) return -1;
  // The master of the place for business; anyone for company.
  const work = folk.find((p) => p.kind === "work" || p.kind === "court");
  const company = folk.find(
    (p) => p.kind === "leisure" || p.kind === "traveller",
  );
  const sober = [
    "pray",
    "study",
    "alms",
    "work",
    "buy",
    "physic",
    "studyphysic",
    "bench",
    "respects",
    "court",
    "crown",
    "drill",
    "endow-church",
    "endow-school",
    "endow-road",
    "pamphlet",
    "gazette",
    "council",
    "speak",
    "tobacco",
    "stories",
    "healer",
    "treat",
  ];
  const pick = sober.includes(key) ? (work ?? company) : (company ?? work);
  return (pick ?? folk[g.rng.int(0, folk.length - 1)]).c;
}

const HOME_EVENINGS = [
  "Supper, a story by the fire, and the children asleep at last. A good evening.",
  "You mend a chair while the household argues pleasantly about nothing.",
  "The little ones want the story about the bear again. You tell it better every time.",
  "A quiet evening at home. Nobody wants anything from you, which is the best of it.",
];

/** What they're saying here: news that has reached this place. */
function gossip(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  gainXp(g, life, "persuasion", 3);
  const heard = heardHere(s, g.map, life.prov).slice(0, 3);
  if (!heard.length) {
    journal(g, life, g.rng.pick(GOSSIP)!);
    afterHearing(
      g,
      life,
      life.area === "docks"
        ? "docks"
        : life.area === "tavern"
          ? "tavern"
          : "talk",
    ); // WORLD r11
    return null;
  }
  for (const r of heard) journal(g, life, `They say: ${r.text}`);
  afterHearing(
    g,
    life,
    life.area === "docks"
      ? "docks"
      : life.area === "tavern"
        ? "tavern"
        : "talk",
  ); // WORLD r11
  return null;
}

/** Do something at a place here. */
export function doAct(
  g: ConquestGame,
  life: Life,
  place: PlaceKind,
  key: string,
  arg?: number,
): string | null {
  const s = g.s;
  const check = actCheck(s, g.w, life, place, key);
  if (!check.ok) return check.why;
  const def = ACT_BY_KEY.get(key)!;
  const me = meOf(s, life)!;
  touchLife(g, life);
  life.area = place;
  if (def.cooldown) setCooldown(g, life, `act:${key}`, def.cooldown);
  if (
    def.cost &&
    key !== "buy" &&
    key !== "commission" &&
    key !== "freehold" &&
    key !== "arms"
  )
    spend(g, life, def.cost);
  const odds = actOdds(s, life, key);
  const pass = odds !== null ? rollCheck(g, odds) : true;
  const here = g.map.provinces[life.prov].name;
  void arg;
  outcomeMeta(g, life, {
    key,
    title: actLabel(s, life, def),
    scene: place,
    c: sceneFigure(g, life, place, key),
    ok: odds !== null ? pass : null,
  });
  switch (key) {
    case "traplines": {
      startJob(
        g,
        life,
        "trapper",
        "woods",
        startRank(s, life, "trapper"),
        -1,
        true,
      );
      return null;
    }
    case "gossip":
      return gossip(g, life);
    case "house":
      return buyHouse(g, life);
    case "land":
      return buyLand(g, life);
    case "family": {
      addStress(g, life, -8);
      const sp = s.chars[me.spouse];
      if (sp?.alive) {
        remembers(g, life, g.char(sp.id), "Time together", 6, 1);
        outcomeMeta(g, life, { c: sp.id });
      }
      for (const k of me.children) {
        const kid = s.chars[k];
        if (kid?.alive && ageOf(s, kid) < 16)
          remembers(g, life, g.char(k), "Played with me", 5, 1);
      }
      journal(g, life, g.rng.pick(HOME_EVENINGS)!, "good");
      return null;
    }
    case "rest":
      addStress(g, life, -10);
      heal(g, life, 5);
      journal(g, life, "A few quiet days at home. The world can wait.");
      return null;
    case "endow-church":
    case "endow-school":
    case "endow-road":
    case "endow-feast":
      return endow(g, life, key.slice(6));
    case "drink": {
      addStress(g, life, hasTrait(me, "drunkard") ? -9 : -6);
      gainXp(g, life, "persuasion", 5);
      if (g.rng.chance(0.4)) journal(g, life, g.rng.pick(GOSSIP)!);
      afterHearing(g, life, "tavern"); // WORLD r11
      // Someone at the bar now, if there's anyone you don't know.
      const atBar = presentAt(s, g.w, life.prov, place, s.day, life)
        .filter((p) => p.kind !== "player" && !life.met.includes(p.c))
        .map((p) => s.chars[p.c]);
      const folk = atBar.length
        ? atBar
        : peopleHere(s, life.prov, life).filter(
            (c) => !life.met.includes(c.id),
          );
      const who = g.rng.pick(folk);
      if (who) {
        meet(g, life, who.id);
        outcomeMeta(g, life, { c: who.id });
        journal(g, life, `You fall to talking with ${charName(who)}.`);
      }
      if (life.stress > 60 && !hasTrait(me, "drunkard") && g.rng.chance(0.04)) {
        gainTrait(g, life, "drunkard");
        journal(
          g,
          life,
          "One pot became several, most nights. You've a taste for it now.",
          "bad",
        );
      }
      return null;
    }
    case "gamble": {
      gainXp(g, life, "trade", 3);
      if (pass) {
        const won = 4 + g.rng.int(0, 3);
        earn(g, life, won);
        addStress(g, life, -3);
        journal(g, life, `The dice loved you tonight: +${won} coins.`, "good");
      } else {
        spend(g, life, 5);
        addStress(g, life, 3);
        journal(
          g,
          life,
          "The dice took five coins and your good humour.",
          "bad",
        );
      }
      return null;
    }
    case "round": {
      addRenown(g, life, 1);
      for (const c of peopleHere(s, life.prov, life).slice(0, 10)) {
        meet(g, life, c.id);
        remembers(g, life, g.char(c.id), "Stood us a round", 6, 1);
      }
      campaignBoost(g, life, 3, "a round for the house");
      journal(
        g,
        life,
        `You stood the house a round at ${here}. They'll drink to your health, and remember your name.`,
      );
      return null;
    }
    case "brawl": {
      gainXp(g, life, "fighting", 8);
      if (pass) {
        addRenown(g, life, 1);
        journal(
          g,
          life,
          "You knocked a loudmouth flat. The tavern bought you a drink.",
          "good",
        );
      } else {
        journal(g, life, "You came off second best in a tavern brawl.", "bad");
        hurt(g, life, g.rng.int(5, 14), "a tavern brawl that went badly");
      }
      return null;
    }
    case "sleep":
      addStress(g, life, -12);
      heal(g, life, 3);
      journal(
        g,
        life,
        "A week of clean sheets and nobody's business but your own.",
      );
      return null;
    case "peddle": {
      gainXp(g, life, "trade", 6);
      if (pass) {
        const got =
          Math.round((0.8 + skillLevel(s, life, "trade") * 0.1) * 10) / 10;
        earn(g, life, got);
        journal(g, life, `A good day's peddling: +${got} coins.`, "good");
      } else journal(g, life, "Nobody wanted what you were selling.");
      return null;
    }
    case "pray": {
      addStress(g, life, hasTrait(me, "zealous") ? -12 : -7);
      gainXp(g, life, "faith", 7);
      if (g.rng.chance(0.03)) {
        addRenown(g, life, 1);
        journal(
          g,
          life,
          "In prayer, a sense of peace you can't explain. Others notice it in you.",
          "good",
        );
      }
      return null;
    }
    case "alms": {
      addRenown(g, life, 1);
      gainXp(g, life, "faith", 3);
      addStress(g, life, -3);
      const minister = peopleHere(s, life.prov, life).find(
        (c) => c.role === "preacher",
      );
      if (minister)
        remembers(g, life, g.char(minister.id), "Generous to the poor", 8, 2);
      journal(g, life, "You gave alms at the church door.");
      return null;
    }
    case "match": {
      const singles = eligibleHere(s, life.prov).filter(
        (c) =>
          c.female !== me.female &&
          c.id !== me.id &&
          !lifeOfChar(s, c.id) &&
          isNativeChar(s, c) === isNativeChar(s, me),
      );
      if (singles.length === 0) {
        journal(
          g,
          life,
          "Nobody unmarried here suits. Perhaps in another town.",
        );
        return null;
      }
      const picks = singles.slice(0, 3);
      for (const c of picks) meet(g, life, c.id);
      outcomeMeta(g, life, { c: picks[0].id });
      journal(
        g,
        life,
        `You're introduced to ${picks.map((c) => `${charName(c)} (${ageOf(s, c)})`).join(", ")}.`,
      );
      return null;
    }
    case "study":
      gainXp(g, life, "letters", 10);
      gainXp(g, life, "faith", 3);
      return null;
    case "council":
      gainXp(g, life, "persuasion", 6);
      gainXp(g, life, "leadership", 3);
      addRenown(g, life, 0.5);
      return null;
    case "speak":
      gainXp(g, life, "persuasion", 10);
      if (pass) {
        addRenown(g, life, 4);
        campaignBoost(g, life, 5, "a fine speech");
        journal(
          g,
          life,
          "You spoke well at the council fire. The elders nodded; the young ones repeated it after.",
          "good",
        );
      } else {
        addStress(g, life, 6);
        journal(
          g,
          life,
          "You lost your thread at the council fire. Nobody said anything, which was worse.",
          "bad",
        );
      }
      return null;
    case "tobacco": {
      for (const c of peopleHere(s, life.prov, life)) {
        if (
          c.role === "sachem" ||
          c.role === "elder" ||
          c.role === "warleader" ||
          s.nations[c.nation]?.ruler === c.id
        )
          remembers(
            g,
            life,
            g.char(c.id),
            "Brought gifts to the council",
            8,
            2,
          );
      }
      life.favor += 2;
      journal(
        g,
        life,
        "Your gifts were received with thanks at the council fire.",
      );
      return null;
    }
    case "stories":
      gainXp(g, life, "letters", 7);
      gainXp(g, life, "faith", 3);
      addStress(g, life, -3);
      return null;
    case "chunkey":
      gainXp(g, life, "fighting", 5);
      if (pass) {
        addRenown(g, life, 2);
        journal(
          g,
          life,
          "Your pole landed nearest the stone, again and again. The wagers were good.",
          "good",
        );
        earn(g, life, 1);
      } else journal(g, life, "Others threw better today.");
      return null;
    case "healer":
      heal(g, life, 8);
      addStress(g, life, -6);
      return null;
    case "news": {
      const wars = Object.keys(s.europe.wars);
      journal(
        g,
        life,
        wars.length
          ? `From Europe: the crowns are at war (${wars
              .map((k) =>
                k
                  .split("-")
                  .map((n) => s.nations[Number(n)]?.adjective ?? "")
                  .join(" against "),
              )
              .join("; ")}).`
          : "From Europe: the crowns are at peace, for now. Tobacco is " +
              (s.europe.price.tobacco > 5 ? "dear" : "cheap") +
              " in London.",
      );
      gainXp(g, life, "trade", 2);
      afterHearing(g, life, "docks"); // WORLD r11
      return null;
    }
    case "drill":
      gainXp(g, life, "fighting", 8);
      gainXp(g, life, "leadership", 3);
      addStress(g, life, 1);
      return null;
    case "commission": {
      spend(g, life, 40);
      if (life.job) {
        journal(
          g,
          life,
          `You leave your work as ${JOBS[life.job.kind].ranks[life.job.rank].title.toLowerCase()}.`,
        );
        life.job = null;
      }
      startJob(g, life, "soldier", "fort", 3);
      addRenown(g, life, 3);
      return null;
    }
    case "garrison": {
      const job = life.job!;
      job.army = -1;
      job.prov = life.prov;
      job.place = place;
      journal(g, life, `You stay behind in garrison at ${here}.`);
      return null;
    }
    case "bench":
      gainXp(g, life, "craft", 10);
      return null;
    case "pamphlet": {
      gainXp(g, life, "letters", 8);
      gainXp(g, life, "persuasion", 4);
      const m = movementOf(s, me.id);
      if (pass) {
        addRenown(g, life, 2);
        if (m) movementPamphlet(g, life, m, true);
        else
          journal(
            g,
            life,
            "Your pamphlet sold out and was argued over in every tavern.",
            "good",
          );
      } else {
        if (m) movementPamphlet(g, life, m, false);
        else
          journal(
            g,
            life,
            "Your pamphlet was used, mostly, to light pipes.",
            "bad",
          );
      }
      return null;
    }
    case "gazette":
      gainXp(g, life, "letters", 4);
      journal(g, life, gazetteLine(g));
      afterHearing(g, life, "gazette"); // WORLD r11
      return null;
    case "freehold": {
      spend(g, life, 30);
      if (life.job) {
        journal(
          g,
          life,
          `You give up your work as ${JOBS[life.job.kind].ranks[life.job.rank].title.toLowerCase()}.`,
        );
        life.job = null;
      }
      const job = startJob(g, life, "farmer", "fields", 1, -1, true);
      openBusiness(g, life, job);
      milestone(g, life, "job", `Bought a freehold at ${here}`);
      return null;
    }
    case "runaway": {
      if (pass) {
        life.job = null;
        addRenown(g, life, -2);
        journal(
          g,
          life,
          "You ran by night and kept running. Nobody is coming after you, you hope. You're free.",
          "good",
        );
        milestone(g, life, "job", "Ran away from an indenture");
      } else {
        life.job!.until = (life.job!.until ?? s.day) + DAYS_PER_YEAR;
        journal(
          g,
          life,
          "They caught you at the river. A whipping, and a year added to your term.",
          "bad",
        );
        hurt(g, life, 12, "a flogging for running away");
      }
      return null;
    }
    case "respects": {
      const n = s.provinces[life.prov].owner;
      const nation = s.nations[n];
      const met: Character[] = [];
      for (const id of [
        nation.ruler,
        ...SEATS.map((st) => nation.council[st]),
      ]) {
        const c = s.chars[id];
        if (c?.alive && c.id !== me.id) {
          meet(g, life, c.id);
          met.push(c);
        }
      }
      const gov = s.chars[nation.ruler];
      if (gov?.alive && gov.id !== me.id) {
        remembers(g, life, g.char(gov.id), "Came to pay respects", 4, 1);
        outcomeMeta(g, life, { c: gov.id });
      }
      gainXp(g, life, "persuasion", 4);
      journal(
        g,
        life,
        `At the governor's levee you meet ${met.map((c) => charName(c)).join(", ") || "nobody worth the trip"}.`,
      );
      return null;
    }
    case "court":
      return seekCourt(g, life);
    case "crown":
      return writeToCrown(g, life, pass);
    case "physic":
      heal(g, life, life.health < 60 ? 15 : 6);
      journal(
        g,
        life,
        "Bark, salts and a stern talking-to from the physician.",
      );
      return null;
    case "studyphysic":
      gainXp(g, life, "medicine", 10);
      return null;
    case "treat": {
      gainXp(g, life, "medicine", 8);
      if (pass) {
        const fee =
          1 + Math.round(skillLevel(s, life, "medicine") * 0.1 * 10) / 10;
        earn(g, life, fee);
        addRenown(g, life, 0.5);
        journal(
          g,
          life,
          `You set a bone and broke a fever: +${fee} coins.`,
          "good",
        );
      } else
        journal(
          g,
          life,
          "Your patient got worse before they got better. You'd rather not say what you tried.",
        );
      if (g.rng.chance(0.05))
        hurt(g, life, 10, `a fever caught from a patient at ${here}`);
      return null;
    }
    case "hunt":
      gainXp(g, life, "woodcraft", 8);
      if (pass) {
        const got = Math.round((0.6 + g.rng.next()) * 10) / 10;
        earn(g, life, got);
        addStress(g, life, -3);
        journal(
          g,
          life,
          `A good hunt: meat for the pot and hides worth ${got} coins.`,
          "good",
        );
      } else journal(g, life, "Tracks everywhere, deer nowhere.");
      if (g.rng.chance(0.015))
        hurt(
          g,
          life,
          g.rng.int(5, 20),
          `a fall on the hunting trail near ${here}`,
        );
      return null;
    case "trap": {
      gainXp(g, life, "woodcraft", 6);
      if (!pass) {
        journal(g, life, "The traps came up empty, or chewed.");
        return null;
      }
      const n = g.w.raw[life.prov] === "furs" ? 2 + g.rng.int(0, 2) : 1;
      const carried = Object.values(life.goods).reduce(
        (m, v) => m + (v ?? 0),
        0,
      );
      const take = Math.max(0, Math.min(n, 20 - carried));
      life.goods.furs = (life.goods.furs ?? 0) + take;
      journal(
        g,
        life,
        take
          ? `${take} bundle${take === 1 ? "" : "s"} of furs from your traplines.`
          : "Your packs are full.",
        "good",
      );
      return null;
    }
    case "forage":
      gainXp(g, life, "medicine", 5);
      gainXp(g, life, "woodcraft", 3);
      if (g.rng.chance(0.3)) heal(g, life, 4);
      return null;
    case "buy":
      return buyRank(g, life);
    case "meeting":
      return holdMeeting(g, life);
    case "arms":
      return buyArms(g, life);
    case "canvass":
      gainXp(g, life, "persuasion", 6);
      campaignBoost(g, life, pass ? 4 : 1, "canvassing");
      return null;
    case "broadside":
      gainXp(g, life, "letters", 4);
      campaignBoost(g, life, 6, "a broadside");
      return null;
    case "tools":
    case "horse":
    case "carriage":
    case "pew":
      return buyKit(g, life, key);
    case "lessons":
      return lessons(g, life);
    case "venture":
      return startVenture(g, life, "cargo");
    case "shares":
      return startVenture(g, life, "shares");
    case "dinner":
      return giveDinner(g, life);
    case "grant":
      return landGrant(g, life);
    case "work-almshouse":
    case "work-church":
    case "work-college":
      return buildWork(g, life, key.slice(5));
    default:
      return "Unknown act.";
  }
}

function gazetteLine(g: ConquestGame): string {
  const s = g.s;
  const war = s.wars[s.wars.length - 1];
  if (war)
    return `The gazette: ${war.why}, between ${s.nations[war.a]?.name} and ${s.nations[war.b]?.name}, since ${formatDate(war.start)}.`;
  const m = s.movements.find(
    (x) => x.status === "brewing" || x.status === "risen",
  );
  if (m)
    return `The gazette: ${m.name} has its supporters, and its enemies. ${m.text}`;
  return "The gazette: ships in, ships out, a sermon reprinted, a runaway horse advertised. A quiet week.";
}

// ---------------------------------------------------------------- people

export {
  doInteraction as doPerson,
  PERSON_ACT_DEFS,
  personCheck,
  personOdds,
} from "./Interactions";
