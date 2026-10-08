// What a character can do at the places of a province (drink, gamble, pray,
// hunt, drill, write a pamphlet, petition the governor...) and with the
// people they meet (talk, flatter, court, propose, borrow, duel...). Each
// has a cooldown, sometimes a cost, often a skill check with its odds shown,
// and effects that last: opinions, renown, money, health and skills.

import { dateOf, formatDate } from "./Calendar";
import { kill, marry } from "./Characters";
import { eligibleHere } from "./Folk";
import type { ConquestGame } from "./Game";
import { buyRank, startJob, takeJob } from "./Life";
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
  remembers,
  rollCheck,
  setCooldown,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  charSkill,
  Check,
  hasPlace,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  promotionView,
  skillLevel,
  yes,
} from "./LifeQueries";
import {
  checkChance,
  DAY_LABOUR,
  JOBS,
  MARRY_OPINION,
  PATRON_OPINION,
  ROLES,
  WEDDING_COST,
} from "./LifeRules";
import type { World } from "./Map";
import {
  buyArms,
  holdMeeting,
  joinMovement,
  movementOf,
  movementPamphlet,
  recruitInto,
} from "./Movements";
import { campaignBoost, seekCourt, writeToCrown } from "./Politics";
import { ageOf, charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR, SEAT_NAMES } from "./Rules";
import type {
  Character,
  GameState,
  Life,
  PersonAct,
  PlaceKind,
  Skill,
} from "./Types";
import { SEATS } from "./Types";

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

const LABOUR_PLACES: PlaceKind[] = [
  "tavern",
  "docks",
  "fields",
  "workshop",
  "market",
  "village",
];

const LABOUR_SKILL: Partial<Record<PlaceKind, Skill>> = {
  tavern: "persuasion",
  docks: "seamanship",
  fields: "farming",
  workshop: "craft",
  market: "trade",
  village: "craft",
};

export const ACTS: ActDef[] = [
  {
    key: "labour",
    places: LABOUR_PLACES,
    label: "A day's work",
    text: "Casual work for a few pence: waiting tables, hauling cargo, hoeing, carrying. Better than an empty purse.",
    cooldown: 3,
    when: adult,
  },
  {
    key: "drink",
    places: ["tavern"],
    label: "Drink and listen",
    text: "A pot of ale, the news, and the people worth knowing. Eases the mind; too much of it becomes a habit.",
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
    text: "Sailors in from London, Paris and Seville: wars, prices and who's in favour.",
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
    text: "What's happening in the colonies and beyond.",
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
    key: "deeds",
    places: ["governor"],
    label: "Copy deeds for a fee",
    text: "A clerk's day of copying. Letters, and a little money.",
    cooldown: 4,
    skill: "letters",
    when: (s, w, life) =>
      isChildLife(s, life)
        ? no("Not until you're sixteen.")
        : life.skills.letters < 3
          ? no("Needs letters 3.")
          : yes,
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
      isChildLife(s, life)
        ? no("Not until you're sixteen.")
        : life.skills.medicine < 4
          ? no("Needs medicine 4.")
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
    label: "Set traplines",
    text: "Beaver and otter: furs to carry and sell where they fetch most.",
    cooldown: 14,
    skill: "woodcraft",
    dc: 6,
    when: adult,
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

function labourPay(s: GameState, life: Life, place: PlaceKind): number {
  const sk = LABOUR_SKILL[place] ?? "craft";
  let pay = DAY_LABOUR + skillLevel(s, life, sk) * 0.05;
  if (place === "fields" && [7, 8, 9].includes(dateOf(s.day).month)) pay *= 1.6;
  if (life.job) pay *= 0.5;
  return Math.round(pay * 100) / 100;
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
  switch (key) {
    case "labour": {
      const pay = labourPay(s, life, place);
      earn(g, life, pay);
      gainXp(g, life, LABOUR_SKILL[place] ?? "craft", 5, true);
      addStress(g, life, 1);
      journal(g, life, `A day's work at the ${place}: ${pay} coins.`);
      return null;
    }
    case "drink": {
      addStress(g, life, hasTrait(me, "drunkard") ? -9 : -6);
      gainXp(g, life, "persuasion", 5);
      if (g.rng.chance(0.4)) journal(g, life, g.rng.pick(GOSSIP)!);
      const folk = peopleHere(s, life.prov, life).filter(
        (c) => !life.met.includes(c.id),
      );
      const who = g.rng.pick(folk);
      if (who) {
        meet(g, life, who.id);
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
      startJob(g, life, "farmer", "fields", 1);
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
      if (gov?.alive && gov.id !== me.id)
        remembers(g, life, g.char(gov.id), "Came to pay respects", 4, 1);
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
    case "deeds": {
      const pay =
        Math.round((0.8 + skillLevel(s, life, "letters") * 0.06) * 100) / 100;
      earn(g, life, pay);
      gainXp(g, life, "letters", 5, true);
      return null;
    }
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

export interface PersonActDef {
  label: string;
  text: string;
  cooldown: number;
  skill?: Skill;
}

export const PERSON_ACT_DEFS: Record<PersonAct, PersonActDef> = {
  talk: {
    label: "Talk",
    text: "Pass the time of day. Small kindnesses add up.",
    cooldown: 7,
    skill: "persuasion",
  },
  flatter: {
    label: "Flatter",
    text: "Praise them. Done well, they warm to you; laid on too thick, they don't.",
    cooldown: 60,
    skill: "persuasion",
  },
  gift: {
    label: "Give a gift",
    text: "Coins, wine, a good hat. More for the poor, less for the rich.",
    cooldown: 30,
  },
  befriend: {
    label: "Befriend",
    text: "Ask them to be a friend. They must already like you.",
    cooldown: 90,
    skill: "persuasion",
  },
  court: {
    label: "Court",
    text: "Walk out together. If it goes well, it may come to marriage.",
    cooldown: 30,
    skill: "persuasion",
  },
  propose: {
    label: "Propose marriage",
    text: `If they love you well enough (opinion ${MARRY_OPINION}). A wedding costs ${WEDDING_COST} coins; they move into your home.`,
    cooldown: 60,
  },
  work: {
    label: "Ask for work",
    text: "Take up the trade they hire for, at their place.",
    cooldown: 14,
  },
  borrow: {
    label: "Borrow money",
    text: "A loan, repaid with a fifth again within the year.",
    cooldown: 180,
  },
  patron: {
    label: "Ask for patronage",
    text: `A patron of standing speaks for you: promotions, commissions, appointments (opinion ${PATRON_OPINION}).`,
    cooldown: 180,
    skill: "persuasion",
  },
  recruit: {
    label: "Recruit to your movement",
    text: "Bring them into the cause. Grievances help; officials may inform on you.",
    cooldown: 90,
    skill: "persuasion",
  },
  join: {
    label: "Join their movement",
    text: "Join the cause they belong to.",
    cooldown: 30,
  },
  rumour: {
    label: "Spread a rumour",
    text: "Whisper against them. Hurts candidates and councillors; get caught and you've an enemy.",
    cooldown: 90,
    skill: "stealth",
  },
  insult: {
    label: "Insult",
    text: "Say what you think of them, loudly.",
    cooldown: 30,
  },
  duel: {
    label: "Challenge to a duel",
    text: "Pistols at dawn, or swords. Honour satisfied; someone may die.",
    cooldown: 365,
    skill: "fighting",
  },
};

function relation(s: GameState, a: Character, b: Character): boolean {
  if (
    a.father === b.id ||
    a.mother === b.id ||
    b.father === a.id ||
    b.mother === a.id
  )
    return true;
  if (a.father >= 0 && a.father === b.father) return true;
  if (a.mother >= 0 && a.mother === b.mother) return true;
  return false;
}

/** Whether a person-act can be done with someone, and why not. */
export function personCheck(
  s: GameState,
  life: Life,
  cId: number,
  act: PersonAct,
): Check {
  const me = meOf(s, life);
  const c = s.chars[cId];
  if (!me) return no("You're watching.");
  if (!c?.alive || c.abroad) return no("They're gone.");
  if (c.id === me.id) return no("That's you.");
  if (!PERSON_ACT_DEFS[act]) return no("Unknown.");
  if (life.travel) return no("You're on the road.");
  const here = peopleHere(s, life.prov, life).some((x) => x.id === cId);
  if (!here) return no("They're not here.");
  const left = Math.max(0, (life.cooldowns[`p:${act}:${cId}`] ?? 0) - s.day);
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  const child = isChildLife(s, life);
  if (child && act !== "talk" && act !== "gift")
    return no("Not until you're sixteen.");
  const op = opinionOf(s, c, life).total;
  const player = lifeOfChar(s, cId);
  if (player && !["talk", "gift", "insult", "duel"].includes(act))
    return no("They're a player: settle it with them.");
  const age = ageOf(s, c);
  switch (act) {
    case "gift":
      return life.purse >= 1 ? yes : no("You've nothing to give.");
    case "befriend":
      if (life.ties[cId] === "friend") return no("You're friends already.");
      return op >= 25
        ? yes
        : no(`They'd need to like you more (opinion ${op} of 25).`);
    case "court":
    case "propose": {
      if (age < 16) return no("They're a child.");
      if (c.female === me.female) return no("Not in this century.");
      if (me.spouse >= 0) return no("You're married.");
      if (c.spouse >= 0) return no("They're married.");
      if (relation(s, me, c)) return no("Too close kin.");
      if (act === "propose") {
        if (op < MARRY_OPINION)
          return no(
            `They don't love you enough yet (opinion ${op} of ${MARRY_OPINION}).`,
          );
        if (life.purse < WEDDING_COST)
          return no(`A wedding costs ${WEDDING_COST} coins.`);
      }
      return yes;
    }
    case "work": {
      const role = c.role ? ROLES[c.role] : undefined;
      if (!role?.job) return no("They don't hire.");
      if (op < -10) return no("They won't have you.");
      return yes;
    }
    case "borrow": {
      const role = c.role ? ROLES[c.role] : undefined;
      if (!role || role.wealth < 10) return no("They've nothing to lend.");
      if (life.debts.some((d) => d.to === cId))
        return no("You owe them already.");
      return op >= 20
        ? yes
        : no(`They don't trust you that far (opinion ${op} of 20).`);
    }
    case "patron": {
      const status = c.role ? ROLES[c.role].status : 0;
      const rank =
        s.nations[c.nation]?.ruler === cId ||
        SEATS.some((st) => s.nations[c.nation]?.council[st] === cId);
      if (status < 3 && !rank)
        return no("They haven't the standing to be a patron.");
      if (life.patron === cId) return no("They're your patron already.");
      return op >= PATRON_OPINION
        ? yes
        : no(
            `They'd need to think better of you (opinion ${op} of ${PATRON_OPINION}).`,
          );
    }
    case "recruit": {
      const m = movementOf(s, me.id);
      if (!m) return no("You belong to no movement.");
      if (m.members.includes(cId) || m.leader === cId)
        return no("They're in it already.");
      if (movementOf(s, cId)) return no("They follow another cause.");
      return age >= 16 ? yes : no("A child.");
    }
    case "join": {
      const m = movementOf(s, cId);
      if (!m) return no("They belong to no movement.");
      if (movementOf(s, me.id)) return no("You belong to a movement already.");
      return yes;
    }
    case "duel":
      if (age < 16) return no("A child.");
      if (relation(s, me, c) || me.spouse === cId)
        return no("Not your own family.");
      if (life.ties[cId] !== "rival" && op > -20)
        return no("A duel needs a quarrel: a rival, or someone who hates you.");
      return yes;
    default:
      return yes;
  }
}

/** The odds of a person-act's check, if it has one. */
export function personOdds(
  s: GameState,
  life: Life,
  cId: number,
  act: PersonAct,
): number | null {
  const c = s.chars[cId];
  if (!c) return null;
  const status = c.role ? ROLES[c.role].status : 2;
  switch (act) {
    case "flatter":
      return checkChance(skillLevel(s, life, "persuasion"), 3 + status);
    case "befriend":
      return checkChance(skillLevel(s, life, "persuasion"), 5);
    case "court":
      return checkChance(
        skillLevel(s, life, "persuasion"),
        4 + Math.max(0, status - 2),
      );
    case "patron":
      return checkChance(skillLevel(s, life, "persuasion"), 4 + status);
    case "rumour":
      return checkChance(skillLevel(s, life, "stealth"), 8);
    case "duel":
      return checkChance(
        skillLevel(s, life, "fighting"),
        charSkill(s, c, "fighting"),
      );
    case "recruit": {
      const pr = s.provinces[c.home ?? 0];
      const grievance = Math.floor((pr?.unrest ?? 0) / 15);
      return checkChance(skillLevel(s, life, "persuasion"), 9 - grievance);
    }
    default:
      return null;
  }
}

/** Do something with or to someone here. */
export function doPerson(
  g: ConquestGame,
  life: Life,
  cId: number,
  act: PersonAct,
  arg?: number,
): string | null {
  const s = g.s;
  const check = personCheck(s, life, cId, act);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const c = g.char(cId);
  const def = PERSON_ACT_DEFS[act];
  touchLife(g, life);
  setCooldown(g, life, `p:${act}:${cId}`, def.cooldown);
  meet(g, life, cId);
  const odds = personOdds(s, life, cId, act);
  const pass = odds !== null ? rollCheck(g, odds) : true;
  const name = charName(c);
  switch (act) {
    case "talk": {
      gainXp(g, life, "persuasion", 3);
      const first = !c.memories.some(
        (m) => m.of === me.id && m.why === "Good company",
      );
      remembers(g, life, c, "Good company", 3, 1);
      const role = c.role ? ROLES[c.role].title.toLowerCase() : null;
      if (first)
        journal(
          g,
          life,
          `You get to know ${name}${role ? `, the ${role}` : ""}.`,
        );
      return null;
    }
    case "flatter":
      gainXp(g, life, "persuasion", 5);
      if (pass) {
        remembers(g, life, c, "Flattered me", 10, 2);
        journal(g, life, `${name} blushes at your praise.`, "good");
      } else {
        remembers(g, life, c, "Laid it on thick", -6, 1);
        journal(g, life, `${name} saw through the flattery.`, "bad");
      }
      return null;
    case "gift": {
      const amount = Math.max(
        1,
        Math.min(Math.floor(life.purse), Math.round(arg ?? 5)),
      );
      spend(g, life, amount);
      const status = c.role ? ROLES[c.role].status : 2;
      const mult = hasTrait(me, "generous") ? 1.5 : 1;
      const v = Math.min(
        30,
        Math.round(((amount * 3) / (status + 1)) * mult) + 2,
      );
      remembers(g, life, c, "A generous gift", v, 3);
      const player = lifeOfChar(s, cId);
      if (player) {
        earn(g, player, amount);
        journal(g, player, `${charName(me)} gave you ${amount} coins.`, "good");
      }
      journal(g, life, `You gave ${name} ${amount} coins.`);
      return null;
    }
    case "befriend":
      gainXp(g, life, "persuasion", 5);
      if (pass) {
        setTie(g, life, cId, "friend");
        remembers(g, life, c, "A true friend", 10, 0);
        journal(g, life, `${name} is your friend now.`, "good");
      } else {
        remembers(g, life, c, "Pushy", -5, 1);
        journal(g, life, `${name} isn't ready for that.`);
      }
      return null;
    case "court":
      gainXp(g, life, "persuasion", 5);
      if (pass) {
        remembers(g, life, c, "Courted me", 12, 2);
        if (opinionOf(s, c, life).total >= 60) {
          setTie(g, life, cId, "lover");
          journal(g, life, `You and ${name} are sweethearts now.`, "good");
        } else
          journal(
            g,
            life,
            `A walk with ${name}, and a promise of another.`,
            "good",
          );
      } else {
        remembers(g, life, c, "Clumsy courting", -6, 1);
        journal(g, life, `${name} was cool to you today.`);
      }
      return null;
    case "propose":
      return wed(g, life, c);
    case "work": {
      const role = ROLES[c.role!];
      const job = role.job!;
      if (c.home !== life.prov) return "They hire where they live.";
      const r = takeJob(g, life, role.place, job);
      if (r) return r;
      if (life.job) life.job.employer = cId;
      return null;
    }
    case "borrow": {
      const role = ROLES[c.role!];
      const op = opinionOf(s, c, life).total;
      const amount = Math.max(
        3,
        Math.round(role.wealth * Math.min(0.8, 0.2 + op / 100)),
      );
      earn(g, life, amount);
      life.debts.push({
        to: cId,
        amount: Math.round(amount * 1.2),
        due: s.day + DAYS_PER_YEAR,
      });
      journal(
        g,
        life,
        `${name} lends you ${amount} coins, to be repaid with ${Math.round(amount * 0.2)} more within the year.`,
      );
      return null;
    }
    case "patron":
      gainXp(g, life, "persuasion", 6);
      if (pass) {
        life.patron = cId;
        remembers(g, life, c, "My protégé", 10, 0);
        journal(
          g,
          life,
          `${name} agrees to be your patron. Doors will open.`,
          "good",
        );
        milestone(g, life, "renown", `Found a patron in ${name}`);
      } else
        journal(g, life, `${name} will think about it. That usually means no.`);
      return null;
    case "recruit":
      return recruitInto(g, life, c, pass);
    case "join": {
      const m = movementOf(s, cId)!;
      return joinMovement(g, life, m.id);
    }
    case "rumour":
      gainXp(g, life, "stealth", 6);
      if (pass) {
        c.memories.push({
          of: -2,
          why: "Talked about in the town",
          value: -15,
          until: s.day + 2 * DAYS_PER_YEAR,
        });
        let effect = "The whispers spread.";
        for (const n of s.nations) {
          const seat = SEATS.find((st) => n.council[st] === cId);
          if (seat && g.rng.chance(0.3)) {
            g.nation(n.id).council[seat] = -1;
            if (!n.court.includes(cId)) n.court.push(cId);
            effect = `Within the month ${name} was dismissed as ${SEAT_NAMES[seat].toLowerCase()}.`;
          }
          const pol = s.polities[n.id];
          const cand = pol?.candidates.find((x) => x.c === cId);
          if (cand) {
            cand.points -= 10;
            g.politiesChanged(n.id);
            effect = `${name}'s campaign is in trouble.`;
          }
        }
        journal(
          g,
          life,
          `You put it about that ${name} isn't what they seem. ${effect}`,
          "good",
        );
      } else {
        remembers(g, life, c, "Spread lies about me", -30, 5);
        setTie(g, life, cId, "rival");
        addRenown(g, life, -2);
        journal(
          g,
          life,
          `${name} found out who was spreading tales. You've made an enemy.`,
          "bad",
        );
      }
      return null;
    case "insult": {
      remembers(g, life, c, "Insulted me", -20, 3);
      if (opinionOf(s, c, life).total <= -40) setTie(g, life, cId, "rival");
      journal(g, life, `You told ${name} exactly what you think of them.`);
      if (
        (hasTrait(c, "brave") || hasTrait(c, "cruel")) &&
        !lifeOfChar(s, cId) &&
        g.rng.chance(0.3)
      )
        return duel(g, life, c, true);
      return null;
    }
    case "duel":
      return duel(g, life, c, false, pass);
  }
}

function wed(g: ConquestGame, life: Life, c: Character): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  spend(g, life, WEDDING_COST);
  // A spouse who kept a post gives it up to move in.
  for (const [k, list] of Object.entries(s.locals)) {
    if (list.includes(c.id)) {
      s.locals[Number(k)] = list.filter((x) => x !== c.id);
      g.localsChanged(Number(k));
    }
  }
  const status = c.role
    ? ROLES[c.role].status
    : (() => {
        const parent = s.chars[c.father] ?? s.chars[c.mother];
        return parent?.role ? ROLES[parent.role].status : 1;
      })();
  c.role = undefined;
  const maiden = charName(c);
  marry(s, g.touchChar(me), c);
  c.home = life.home;
  setTie(g, life, c.id, null);
  remembers(g, life, c, "Our wedding day", 20, 0);
  const dowry = Math.max(0, status - 1) * 4;
  if (dowry) earn(g, life, dowry);
  life.tally.marriages++;
  addStress(g, life, -10);
  addRenown(g, life, 1);
  journal(
    g,
    life,
    `You married ${maiden}.${dowry ? ` Their family gave a dowry of ${dowry} coins.` : ""}`,
    "good",
  );
  milestone(g, life, "married", `Married ${maiden}`);
  return null;
}

function duel(
  g: ConquestGame,
  life: Life,
  c: Character,
  challenged: boolean,
  pass?: boolean,
): string | null {
  const s = g.s;
  const me = meOf(s, life)!;
  const name = charName(c);
  const win =
    pass ??
    rollCheck(
      g,
      checkChance(skillLevel(s, life, "fighting"), charSkill(s, c, "fighting")),
    );
  gainXp(g, life, "fighting", 15);
  life.ties[c.id] = "rival";
  const opener = challenged
    ? `${name} took it badly and called you out.`
    : `You called ${name} out.`;
  const other = lifeOfChar(s, c.id);
  if (win) {
    addRenown(g, life, 6);
    remembers(g, life, c, "Beat me in a duel", -30, 10);
    if (other) {
      journal(g, other, `${charName(me)} beat you in a duel.`, "bad");
      hurt(g, other, g.rng.int(10, 35), `a duel with ${charName(me)}`);
      journal(g, life, `${opener} You won.`, "good");
    } else if (g.rng.chance(0.25)) {
      kill(g, c, `a duel with ${charName(me)}`);
      journal(g, life, `${opener} At dawn, you killed ${name}.`, "bad");
      addStress(g, life, 15);
    } else {
      journal(
        g,
        life,
        `${opener} You wounded ${name}; honour is satisfied.`,
        "good",
      );
    }
    milestone(g, life, "renown", `Won a duel against ${name}`);
  } else {
    addRenown(g, life, 1);
    journal(g, life, `${opener} You lost.`, "bad");
    if (other) addRenown(g, other, 4);
    hurt(g, life, g.rng.int(15, 55), `a duel with ${name}`);
  }
  return null;
}
