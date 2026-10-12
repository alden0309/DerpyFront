// "I want to…" (r11 wave 2): a searchable list of the things people come to
// the game wanting to do (buy a house, find work, hire men, write a letter,
// stand for office, learn a tongue, found a colony...). Each says where it's
// done and what it takes, checks what you have against it, takes you there,
// and opens the guide's chapter about it.

import { html, nothing, TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import { areasOf, homeHere } from "../../engine/Areas"; // HOME (r12)
import { BOATS } from "../../engine/Boats";
import { bizTradesAt } from "../../engine/Business"; // BUSINESS (r15)
import { dateOf } from "../../engine/Calendar"; // MAP (r12)
import { followCheck, LT, petitionCheck } from "../../engine/ChairCore"; // CHAIR (r16)
import { knowsDen } from "../../engine/CrimeQueries";
import { cruiseOffers, pardonCheck } from "../../engine/Cruises"; // SEA (r15)
import { STALL_SECONDS, tableAt } from "../../engine/DiceCore"; // DICE (r14)
import { schoolable } from "../../engine/Edu"; // EDU (r13)
import { buyoutPrice } from "../../engine/Firms"; // PARTNERS (r13)
import { followerCap, peopleOf, raiseCheck } from "../../engine/Followers";
import { foundCheck as foundColonyCheck } from "../../engine/Founding";
import { ADULT_AGE, betrothalOf } from "../../engine/IntrigueCore"; // INTRIGUE (r15)
import { affairsOf } from "../../engine/Ledger"; // LEDGER (r15)
import {
  hasPlace,
  isChildLife,
  lifeIsNative,
  opinionOf,
  promotionView,
  skillLevel, // SEA (r15)
} from "../../engine/LifeQueries";
import {
  EUROPE_FORTUNE,
  LAND_LOT,
  LESSONS,
  PLACES,
} from "../../engine/LifeRules";
import { grantCheck, kitCheck, ventureCheck } from "../../engine/Money";
import {
  foundCheck as foundCauseCheck,
  movementOf,
} from "../../engine/Movements";
import { localOfficesOf } from "../../engine/Offices"; // POWER (r12)
import { firmsWith, MAX_FIRMS } from "../../engine/PartnersCore"; // PARTNERS (r13)
import { governorScore, standCheck } from "../../engine/Politics"; // CHAIR (r16): governorScore
import { commissionAt } from "../../engine/Privateers"; // SEA (r15)
import {
  houseCheck,
  houseOf,
  housePrice,
  landCheck,
} from "../../engine/Property";
import { ageOf } from "../../engine/Queries"; // EDU (r13)
import { isHarvest } from "../../engine/Seasons"; // MAP (r12)
import type { PlaceKind } from "../../engine/Types";
import { FindIcon } from "../Icons";
import type { DrawerView, GameUi } from "./Context";
import { canWritePersonal } from "./Intrigue"; // INTRIGUE (r15)
import { TAB_BY_ID } from "./Nav";

interface Need {
  label: string;
  met: boolean;
}

interface Goal {
  id: string;
  title: string;
  /** More words people might search by. */
  words: string;
  group: string;
  /** Where it's done, in a sentence. */
  where: string;
  /** What it takes, checked against you now. */
  needs?: (ui: GameUi) => Need[];
  /** Take me there. */
  go: (ui: GameUi) => void | Promise<void>;
  /** What the go button says. */
  goLabel?: string;
  guide: string;
  /** Only for a native life, or only for a colonist's. */
  who?: "native" | "colonist";
}

const tab = (t: DrawerView) => (ui: GameUi) => {
  ui.modal(null);
  ui.open(t);
};

/** Step into a place in this town (if it has one) and show it. */
const place =
  (...areas: PlaceKind[]) =>
  async (ui: GameUi) => {
    const life = ui.life!;
    ui.modal(null);
    // HOME (r12): home isn't on the town's list of places, but it's there.
    const here = life.travel ? [] : areasOf(ui.s, ui.w, life.prov, life);
    const a = areas.find((x) => here.includes(x));
    if (a && life.area !== a) await ui.cmd({ k: "enter", area: a });
    ui.open({ k: "tab", tab: "here" });
    if (!a)
      ui.toast(
        life.travel
          ? "You're on the road: look when you arrive."
          : `${ui.map.provinces[life.prov].name} has no ${areas.map((x) => PLACES[x].name.replace(/^The /, "").toLowerCase()).join(" or ")}: a bigger town will.`,
      );
  };

const check = (
  c: { ok: true } | { ok: false; why: string },
  yes: string,
): Need => (c.ok ? { label: yes, met: true } : { label: c.why, met: false });

/** INTRIGUE (r15): eighteen, for anything of the heart (and a plot). */
const grown = (ui: GameUi): Need =>
  ui.me && ageOf(ui.s, ui.me) >= ADULT_AGE
    ? { label: "Eighteen or over", met: true }
    : { label: "Not until you're eighteen.", met: false };

const adult = (ui: GameUi): Need =>
  isChildLife(ui.s, ui.life!)
    ? { label: "Not until you're sixteen.", met: false }
    : { label: "Grown (sixteen or more)", met: true };

const coins = (ui: GameUi, n: number, what = ""): Need => ({
  label: `${n} coins${what ? ` ${what}` : ""} (you have ${Math.floor(ui.life!.purse)})`,
  met: ui.life!.purse >= n,
});

const inTown = (ui: GameUi, a: PlaceKind, noun: string): Need => {
  const life = ui.life!;
  const town = ui.map.provinces[life.prov].name;
  const has = !life.travel && hasPlace(ui.s, ui.w, life.prov, a);
  return {
    label: has
      ? `There's ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun} in ${town}`
      : `${town} has no ${noun}: find a town that has one`,
    met: has,
  };
};

const GOALS: Goal[] = [
  // ---------------------------------------------------------------- work
  {
    id: "find-work",
    title: "Find work",
    words: "job employment trade hire me wages living earn apprentice",
    group: "Work",
    where:
      "Work › Find work lists everyone who takes people on in this town (ask them), trades you can take up on your own, and every trade there is.",
    needs: (ui) => [
      adult(ui),
      ui.life!.job
        ? { label: "Hand in your notice first: one job at a time", met: false }
        : { label: "You have no work now", met: true },
    ],
    go: tab({ k: "tab", tab: "work", sub: "find" }),
    guide: "trades",
  },
  {
    id: "promotion",
    title: "Get promoted",
    words: "rank rung ladder climb raise wage pay better position",
    group: "Work",
    where:
      "Work › Your work shows the ladder and what the next rung needs. Promotion comes with a good month's work once you're ready; some rungs can be bought.",
    needs: (ui) => {
      const v = promotionView(ui.s, ui.life!);
      if (!ui.life!.job) return [{ label: "You have no work", met: false }];
      if (!v.next)
        return [{ label: "You're at the top of your ladder", met: true }];
      return v.needs.map((n) => ({ label: n.label, met: n.met }));
    },
    go: tab({ k: "tab", tab: "work", sub: "job" }),
    guide: "work",
  },
  {
    id: "effort",
    title: "Work harder, or ease off",
    words: "shirk steady overtime effort hard stress",
    group: "Work",
    where:
      "Work › Your work: Shirk, Steady, Work hard or Overtime. Your days at your post are worked for you either way.",
    needs: (ui) => [
      ui.life!.job
        ? { label: "You have work", met: true }
        : { label: "You have no work", met: false },
    ],
    go: tab({ k: "tab", tab: "work", sub: "job" }),
    guide: "work",
  },
  {
    id: "enlist",
    title: "Join the army or the militia",
    words:
      "soldier enlist military militia fort officer commission war warrior",
    group: "Work",
    where:
      "At the fort: ask the officer who takes recruits, or buy a lieutenancy (40 coins, fighting 3). Enrol in the militia at the tavern or the fort. Among the native peoples, the council fire.",
    needs: (ui) => [adult(ui), inTown(ui, "fort", "fort")],
    go: tab({ k: "tab", tab: "work", sub: "find" }),
    guide: "military",
  },
  {
    id: "contract",
    title: "Take a contract",
    words:
      "mercenary escort bounty reward hunt outlaw guard raid explore adventurer",
    group: "Work",
    where:
      "Work › Contracts lists what's on offer in town (the tavern, the governor's house, the watch-house, the council fire). Two at a time.",
    needs: (ui) => [
      adult(ui),
      {
        label: `${(ui.life!.contracts ?? []).filter((c) => c.status === "taken").length} of 2 contracts held`,
        met:
          (ui.life!.contracts ?? []).filter((c) => c.status === "taken")
            .length < 2,
      },
    ],
    go: tab({ k: "tab", tab: "work", sub: "contracts" }),
    guide: "followers",
  },
  {
    id: "crime",
    title: "Turn to crime",
    words:
      "thief rogue steal pickpocket smuggle highwayman pirate coin forger den underworld criminal gang",
    group: "Work",
    where:
      "Find the den (Listen for the underworld, at the tavern), or take up a crooked trade: Work › Find work. Watch your heat: Work › The law.",
    needs: (ui) => {
      const life = ui.life!;
      const has = !life.travel && hasPlace(ui.s, ui.w, life.prov, "den");
      return [
        adult(ui),
        {
          label: has
            ? knowsDen(life, life.prov)
              ? "You know the den here"
              : "There's a den here: find it at the tavern"
            : "Too small a town for a den (900 people, a capital or a busy port)",
          met: has && knowsDen(life, life.prov),
        },
      ];
    },
    go: tab({ k: "tab", tab: "work", sub: "law" }),
    guide: "crime",
  },
  {
    id: "lawman",
    title: "Serve the law",
    words:
      "watch watchman constable sheriff thief-taker police law order arrest",
    group: "Work",
    where:
      "The watch-house: join the night watch, or hunt rewards as a thief-taker (fighting 4). The watch climbs to constable and sheriff.",
    needs: (ui) => [adult(ui), inTown(ui, "gaol", "watch-house")],
    go: tab({ k: "tab", tab: "work", sub: "find" }),
    guide: "crime",
  },
  {
    id: "heat",
    title: "Get the law off my back",
    words: "heat wanted lie low papers bribe amends cool",
    group: "Work",
    where:
      "At the den: lie low (4), square the watch, or buy forged papers (25). At the watch-house: make amends. Or leave that nation's land.",
    go: tab({ k: "tab", tab: "work", sub: "law" }),
    guide: "crime",
  },
  // ---------------------------------------------------------------- money and home
  {
    id: "house",
    title: "Buy a house",
    words: "home cottage lodge property roof live settle dwelling",
    group: "Money and home",
    where:
      "Here › Home (your lodgings): buy any house outright, or rent one by the month. Or Estate › House & land, the market or a native village. The house is in the town you're in.",
    needs: (ui) => {
      const life = ui.life!;
      const v = houseCheck(ui.s, life);
      if (!v.next)
        return [{ label: v.check.ok ? "" : v.check.why, met: false }];
      const price = housePrice(ui.s, life);
      const out: Need[] = [
        {
          label: `${v.level ? "A better house" : "A house"} here: a ${v.next.name.toLowerCase()}, ${price} coins (you have ${Math.floor(life.purse)})`,
          met: life.purse >= price,
        },
      ];
      if (!v.check.ok && !/coins/.test(v.check.why))
        out.push({ label: v.check.why, met: false });
      return out;
    },
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "property",
  },
  {
    id: "land",
    title: "Buy land",
    words: "acres farm freehold estate rent tenants plantation grant",
    group: "Money and home",
    where: `Estate › House & land, or at the fields: ten acres for ${LAND_LOT.cost}, let to tenants for rent. A land grant is petitioned for at the governor's house.`,
    needs: (ui) => [
      check(landCheck(ui.s, ui.life!), "You can buy ten acres here now"),
    ],
    go: tab({ k: "tab", tab: "estate", sub: "house" }),
    guide: "property",
  },
  {
    id: "grant",
    title: "Get a grant of land",
    words: "headright patent governor land grant petition",
    group: "Money and home",
    where: "Petition for a land grant at the governor's house.",
    needs: (ui) => [
      check(grantCheck(ui.s, ui.life!), "You could petition now"),
    ],
    go: place("governor"),
    goLabel: "Go to the governor's house",
    guide: "property",
  },
  {
    id: "trade",
    title: "Buy and sell goods",
    words: "market trade merchant sell buy prices profit goods furs tobacco",
    group: "Money and home",
    where:
      "A town's market or docks, or a native village: Buy and sell goods. What you carry is on Estate › Goods.",
    needs: (ui) => [inTown(ui, "market", "market")],
    go: tab({ k: "tab", tab: "estate", sub: "goods" }),
    guide: "markets",
  },
  {
    id: "venture",
    title: "Invest money",
    words: "venture cargo shares company invest stake dividend",
    group: "Money and home",
    where:
      "Venture a cargo at the docks (it comes home months later, with a profit or not at all); buy shares in a company at the market (sell them on Estate › Purse).",
    needs: (ui) => [
      check(ventureCheck(ui.s, ui.life!, "cargo"), "You could venture a cargo"),
    ],
    go: place("docks", "market"),
    goLabel: "Go to the docks",
    guide: "money",
  },
  {
    id: "kit",
    title: "Buy a horse, tools or a carriage",
    words: "horse tools carriage coach pew kit ride",
    group: "Money and home",
    where:
      "A horse at the market, the fields or a village; good tools at a workshop, the market or a village; a carriage at the market; a pew at the church.",
    needs: (ui) => [
      check(kitCheck(ui.s, ui.life!, "horse"), "You could buy a horse"),
    ],
    go: place("market", "fields", "village"),
    goLabel: "Go to the market",
    guide: "money",
  },
  {
    id: "living",
    title: "Change how I live",
    words:
      "lifestyle frugal modest comfortable genteel grand station living costs",
    group: "Money and home",
    where:
      "Estate › Purse: five ways of living, from frugal to grand. Your station expects one of them.",
    go: tab({ k: "tab", tab: "estate", sub: "purse" }),
    guide: "money",
  },
  {
    id: "boat",
    title: "Buy a boat",
    words: "boat ship sloop canoe shallop schooner brig vessel sail own",
    group: "Money and home",
    where: `A port's docks (The boatyard): a canoe from ${BOATS.canoe.price}, a sloop ${BOATS.sloop.price}, up to a ship at ${BOATS.ship.price} in the great ports. Native villages on the shore sell canoes.`,
    needs: (ui) => [
      inTown(ui, "docks", "docks"),
      coins(ui, BOATS.canoe.price, "for a canoe"),
    ],
    go: tab({ k: "tab", tab: "estate", sub: "boats" }),
    guide: "boats",
  },
  {
    id: "debts",
    title: "Borrow or repay money",
    words: "loan debt borrow repay owe lend",
    group: "Money and home",
    where:
      "Borrow from someone who likes you (their card: Borrow money). What you owe, and Repay, are on Estate › Goods.",
    go: tab({ k: "tab", tab: "estate", sub: "goods" }),
    guide: "money",
  },
  {
    id: "endow",
    title: "Give to the town",
    words: "endow charity church school road almshouse college gift alms",
    group: "Money and home",
    where:
      "Estate › House & land › Gifts to the town; the church and the governor's house offer the great works (an almshouse, a church, a college).",
    go: tab({ k: "tab", tab: "estate", sub: "house" }),
    guide: "property",
  },
  {
    id: "europe",
    title: "Retire to Europe",
    words: "europe home england sail rich fortune parliament retire",
    group: "Money and home",
    where: `Society › Standing, at the bottom: with ${EUROPE_FORTUNE} coins (or an invitation) you may sail from a port.`,
    needs: (ui) => [
      ui.life!.invite
        ? { label: "You've been invited", met: true }
        : coins(ui, EUROPE_FORTUNE, "to live there"),
    ],
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    guide: "europe",
  },
  // ---------------------------------------------------------------- people
  {
    id: "hire",
    title: "Hire men",
    words:
      "followers hire hands swords clerk mate guide rogue officer band crew men retainers companions",
    group: "People",
    where:
      "People › Your people lists who's for hire in this town (tavern, market, docks, fort, woods, the den). Or ask a friend to join you: their card.",
    needs: (ui) => {
      const life = ui.life!;
      const n = peopleOf(life).length;
      const cap = followerCap(ui.s, life);
      return [
        adult(ui),
        {
          label: `${n} of ${cap} in your service (more with leadership)`,
          met: n < cap,
        },
        coins(ui, 2, "to sign one on"),
      ];
    },
    go: tab({ k: "tab", tab: "people", sub: "yours" }),
    guide: "followers",
  },
  {
    id: "company",
    title: "Raise a company",
    words: "company men soldiers militia captain campaign army own",
    group: "People",
    where:
      "People › Your people: twenty men for 40 coins, then twenty more at a time.",
    needs: (ui) => [check(raiseCheck(ui.s, ui.life!), "You can raise one now")],
    go: tab({ k: "tab", tab: "people", sub: "yours" }),
    guide: "followers",
  },
  {
    id: "friend",
    title: "Make friends",
    words: "friend opinion like befriend talk gift flatter relationship",
    group: "People",
    where:
      "Anyone's card (click them, wherever they are in town): Talk, Flatter, Give a gift, Offer friendship. Stand a round at the tavern; give a gathering.",
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    guide: "people",
  },
  {
    id: "marry",
    title: "Marry",
    words: "marriage wife husband court propose wedding spouse love",
    group: "People",
    where:
      "Meet the unmarried: Seek a match at the church (or the council fire). Court them from their card until they love you, then propose. A wedding can be a gathering.",
    needs: (ui) => [adult(ui)],
    go: place("church", "councilfire"),
    goLabel: "Go to the church",
    guide: "love",
  },
  {
    id: "lover",
    title: "Take a lover",
    words: "affair lover secret tryst romance mistress",
    group: "People",
    where:
      "Their card: Court (Court in secret, if either of you is married), then Meet in secret. Stealth and Intrigue keep it quiet.",
    needs: (ui) => [adult(ui)],
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    guide: "love",
  },
  {
    id: "patron",
    title: "Find a patron",
    words: "patron protector backer sponsor",
    group: "People",
    where: "Someone well placed who likes you: their card, Ask for patronage.",
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    guide: "people",
  },
  {
    id: "heir",
    title: "Choose my heir",
    words: "heir children succession will inheritance death",
    group: "People",
    where:
      "You › Family: name your heir among your children. When you die, you carry on as them.",
    go: tab({ k: "tab", tab: "you", sub: "family" }),
    guide: "family",
  },
  {
    id: "duel",
    title: "Settle a quarrel",
    words: "duel insult fight rival enemy challenge honour",
    group: "People",
    where:
      "Their card: Insult, Spread a rumour, Challenge to a duel (played out as scenes: seconds, weapons, the field at dawn). Or pick a fight at the tavern.",
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    guide: "duels",
  },
  // ---------------------------------------------------------------- society
  {
    id: "letter",
    title: "Write a letter",
    words: "letter write post mail send correspond message far away",
    group: "Society",
    where:
      "Society › Letters (or the quill in the banner, or anyone's card): to anyone you know or know of, wherever they are.",
    needs: (ui) => [adult(ui)],
    go: (ui) => ui.modal({ k: "write" }),
    goLabel: "Write one now",
    guide: "letters",
  },
  {
    id: "gathering",
    title: "Host a feast, a ball or a wedding",
    words:
      "gathering feast ball dinner party wedding invite event host celebration",
    group: "Society",
    where:
      "Society › Gatherings: choose the kind, the place, the day, the scale and the guests. Be there on the day.",
    needs: (ui) => [
      adult(ui),
      ui.life!.travel
        ? { label: "Not from the road", met: false }
        : { label: "You're in a town", met: true },
    ],
    go: (ui) => ui.modal({ k: "host" }),
    goLabel: "Plan one now",
    guide: "gatherings",
  },
  {
    id: "favour",
    title: "Win favour at home",
    words: "favour favor crown king court london write crown ear",
    group: "Society",
    where:
      "Write to the crown at the governor's house or the docks (2 coins, once in 60 days). Society › Standing explains what favour does.",
    needs: (ui) => [adult(ui), coins(ui, 2)],
    go: place("governor", "docks"),
    goLabel: "Go to the governor's house",
    guide: "favour",
    who: "colonist",
  },
  {
    id: "regard",
    title: "Win the elders' regard",
    words: "favour favor regard elders council fire chief tobacco gifts wampum",
    group: "Society",
    where:
      "Offer tobacco and gifts at the council fire (2 coins, once a month): 2 regard, and the elders remember it. A speaker can carry a wampum belt to the elders (5). Society › Standing shows your regard and what it opens.",
    needs: (ui) => [adult(ui), coins(ui, 2)],
    go: place("councilfire"),
    goLabel: "Go to the council fire",
    guide: "favour",
    who: "native",
  },
  {
    id: "lead",
    title: "Lead my people",
    words: "chief sachem leader council fire elders speaker war chief rule",
    group: "Society",
    where:
      "Society › Standing has the road: win renown (hunts, raids, councils, treaties), sit at the council fire when it chooses (renown 15), take a council seat when the leader offers one, and when the leader dies the elders choose someone of great renown and regard.",
    needs: (ui) => [adult(ui)],
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    guide: "office",
    who: "native",
  },
  {
    id: "renown",
    title: "Become better known",
    words: "renown fame reputation known famous",
    group: "Society",
    where:
      "Office and its duties, gatherings, gifts to the town, standing a round, contracts, battles, promotions, and reaching an ambition. Society › Standing.",
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    guide: "standing",
  },
  {
    id: "local-office",
    title: "Hold a local office",
    words:
      "office constable selectman mayor justice sheriff burgess churchwarden local county town council sachem",
    group: "Society",
    where:
      "Society › Office lists this county's offices, who holds them, how each is filled (a poll, or an appointment) and whether you can have it.",
    needs: (ui) => [adult(ui)],
    go: tab({ k: "tab", tab: "society", sub: "office" }),
    guide: "office",
  },
  {
    id: "assembly",
    title: "Stand for the assembly",
    words:
      "assembly election stand vote politics burgess house representatives",
    group: "Society",
    where:
      "At the governor's house (the council fire among native peoples): Stand for the assembly, then canvass and print broadsides until the count.",
    needs: (ui) => [check(standCheck(ui.s, ui.life!), "You may stand now")],
    go: place("governor", "councilfire"),
    goLabel: "Go to the governor's house",
    guide: "office",
  },
  {
    id: "court",
    title: "Get a place at court",
    words: "court governor council seat levee",
    group: "Society",
    where:
      "The governor's house at the capital: Seek a place at court. The council is chosen from the court.",
    needs: (ui) => {
      const s = ui.s;
      const life = ui.life!;
      const n = s.nations[ui.me!.nation];
      const ruler = s.chars[n?.ruler ?? -1];
      const op = ruler?.alive ? opinionOf(s, ruler, life).total : 0;
      return [
        {
          label: `Renown 20, or a seat in the assembly (you have ${Math.round(life.renown)})`,
          met: life.renown >= 20,
        },
        { label: `The governor's good opinion, 15 (now ${op})`, met: op >= 15 },
        {
          label:
            n && life.prov === n.capital
              ? "You're at the capital"
              : `Go to the capital${n ? `, ${ui.map.provinces[n.capital]?.name}` : ""}`,
          met: !!n && life.prov === n.capital,
        },
      ];
    },
    go: place("governor", "councilfire"),
    goLabel: "Go to the governor's house",
    guide: "office",
  },
  {
    id: "governor",
    title: "Become governor",
    words: "governor rule leader chief colony power",
    group: "Society",
    where:
      "Society › Standing: the road to the governor's chair, and how the crown (or the elders) will weigh you when the chair falls empty.",
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    guide: "office",
  },
  {
    id: "cause",
    title: "Join or start a cause",
    words:
      "cause movement rebellion rising revolution revolt reform independence rebel",
    group: "Society",
    where:
      "Join at a tavern or council fire where its people are; found your own on Society › Causes. Grow it, then call the rising.",
    needs: (ui) => {
      const m = movementOf(ui.s, ui.life!.c);
      return m
        ? [{ label: `You're sworn to ${m.name}`, met: true }]
        : [check(foundCauseCheck(ui.s, ui.life!), "You could found one now")];
    },
    go: tab({ k: "tab", tab: "society", sub: "causes" }),
    guide: "movements",
  },
  {
    id: "colony",
    title: "Found a colony",
    words:
      "colony settlement found plant new town settle charter nation independent",
    group: "Society",
    where:
      "Society › Colony: choose empty land, gather families willing to come, lay in supplies, and lead them there.",
    needs: (ui) => [
      check(foundColonyCheck(ui.s, ui.w, ui.life!), "You can begin now"),
    ],
    go: tab({ k: "tab", tab: "society", sub: "colony" }),
    guide: "founding",
  },
  // ---------------------------------------------------------------- POWER (r12)
  {
    id: "office-powers",
    title: "Use an office's powers",
    words:
      "authority power arrest patrol warrant license tavern levy poll posse muster range resolution feast pave search wharves present sinner dismiss subordinate appoint",
    group: "Office and the law",
    where:
      "Society › Office: under an office you hold, its duty, its lever and its powers (each with its cost, its odds and what it does); offices in your gift, to fill or dismiss.",
    needs: (ui) => [
      localOfficesOf(ui.s, ui.life!.c).length
        ? { label: "You hold a county office", met: true }
        : { label: "Hold a county or town office first", met: false },
    ],
    go: tab({ k: "tab", tab: "society", sub: "office" }),
    guide: "office",
  },
  {
    id: "one-office",
    title: "Change offices",
    words:
      "resign another office second office two offices both swap one at a time",
    group: "Office and the law",
    where:
      "Society › Office: one office at a time. Standing for, seeking or accepting another warns you which you'd give up; winning it resigns the old one.",
    go: tab({ k: "tab", tab: "society", sub: "office" }),
    guide: "office",
  },
  {
    id: "council-seat",
    title: "Sit on the governor's council",
    words:
      "council cabinet seat secretary treasurer receiver attorney surveyor marshal commissioner chaplain minister",
    group: "Office and the law",
    where:
      "Society › Council shows your case for every seat (renown, favour, the governor's regard, connections, fitness). Ask the governor in person at the capital, or be received at court and wait for an offer.",
    needs: (ui) => {
      const n = ui.s.nations[ui.me!.nation];
      return [
        {
          label: `Renown 20 or more (you have ${Math.round(ui.life!.renown)})`,
          met: ui.life!.renown >= 20,
        },
        {
          label:
            n && ui.life!.prov === n.capital
              ? "You're at the capital"
              : `At the capital${n ? `, ${ui.map.provinces[n.capital]?.name}` : ""}`,
          met: !!n && ui.life!.prov === n.capital,
        },
      ];
    },
    go: tab({ k: "tab", tab: "society", sub: "council" }),
    guide: "council",
  },
  {
    id: "govern",
    title: "Govern: appoint, proclaim, answer the house",
    words:
      "governor appoint dismiss council proclamation proclaim thanksgiving bounty frontier martial law pardon veto assent dissolve prorogue",
    group: "Office and the law",
    where:
      "Society › Council, when you govern: appoint and dismiss the council, issue proclamations (with the council's advice), assent to or veto the house's bills, dissolve or prorogue it.",
    go: tab({ k: "tab", tab: "society", sub: "council" }),
    guide: "council",
  },
  {
    id: "bill",
    title: "Bring in a bill",
    words:
      "bill law act assembly house vote legislation road bounty paper money",
    group: "Office and the law",
    where:
      "Society › Council (or your burgess's office on Society › Office): choose a bill; the house divides on it in a month, then the governor assents or vetoes.",
    needs: (ui) => [
      (ui.s.polities[ui.me!.nation]?.assembly ?? []).includes(ui.me!.id)
        ? { label: "You sit in the house", met: true }
        : { label: "A seat in the house (a burgess, or elected)", met: false },
    ],
    go: tab({ k: "tab", tab: "society", sub: "council" }),
    guide: "council",
  },
  {
    id: "court-case",
    title: "Take someone to court",
    words: "court trial accuse sue prosecute charge justice jury libel witness",
    group: "Office and the law",
    where:
      "Society › Office: bring someone whose secret you know before the court; a constable brings people before the justices, a churchwarden presents sinners, the attorney general prosecutes. The trial is played out in scenes.",
    go: tab({ k: "tab", tab: "society", sub: "office" }),
    guide: "trials",
  },
  {
    id: "preside",
    title: "Preside over trials",
    words: "justice judge bench sessions verdict sentence preside",
    group: "Office and the law",
    where:
      "Society › Office: as justice of the peace, the county's cases come to you, and you give the verdict and the sentence in the court-house.",
    go: tab({ k: "tab", tab: "society", sub: "office" }),
    guide: "trials",
  },
  {
    id: "newspaper",
    title: "Own a newspaper",
    words:
      "newspaper paper press printing gazette publisher print found buy journal",
    group: "Office and the law",
    where:
      "Society › Press: found a paper at a printing house, buy one from its printer, or rise to publisher in the printer's trade.",
    needs: (ui) => [inTown(ui, "press", "printing house")],
    go: tab({ k: "tab", tab: "society", sub: "press" }),
    guide: "press",
  },
  {
    id: "print-piece",
    title: "Swing an election or a cause in print",
    words:
      "piece article attack praise candidate election cause movement governor libel propaganda",
    group: "Office and the law",
    where:
      "Society › Press, with a paper of your own: a piece for or against a person, a cause or the governor, with how hard it lands and what it risks.",
    go: tab({ k: "tab", tab: "society", sub: "press" }),
    guide: "press",
  },
  // ---------------------------------------------------------------- learning
  {
    id: "language",
    title: "Learn a language",
    words:
      "language tongue speak spanish french english dutch native interpreter learn lessons",
    group: "Learning",
    where:
      "You › Tongues shows what you speak, and any grammar sold in the town you're in. Lessons from anyone fluent (4 coins, their card), or live among speakers and talk with them.",
    go: tab({ k: "tab", tab: "you", sub: "tongues" }),
    guide: "languages",
  },
  {
    id: "skill",
    title: "Learn a skill",
    words:
      "skill study learn train practise improve tutor letters craft medicine",
    group: "Learning",
    where: `Study with the minister (the church), learn at the bench (a workshop), study physic (the apothecary), hire a tutor (${LESSONS.cost}, at home or the church), drill at the fort. Working hard at your trade teaches it fastest.`,
    go: place("church", "workshop"),
    goLabel: "Go to the church",
    guide: "you",
  },
  {
    id: "ambition",
    title: "Set an ambition",
    words: "ambition goal aim purpose",
    group: "Learning",
    where:
      "You › Ambition: choose something to aim at. Reaching it is worth renown and peace of mind.",
    go: tab({ k: "tab", tab: "you", sub: "ambition" }),
    guide: "you",
  },
  {
    id: "likeness",
    title: "Change my portrait",
    words: "portrait face likeness appearance picture look hair clothes",
    group: "Learning",
    where:
      "You › Yourself: Sit for a new likeness, under your name. Free, at any time.",
    go: (ui) => ui.modal({ k: "likeness" }),
    goLabel: "Sit for a likeness",
    guide: "start",
  },
  // ---------------------------------------------------------------- body and mind
  {
    id: "heal",
    title: "Mend my health",
    words:
      "health sick ill heal physic doctor medicine healer rest wounds fever",
    group: "Body and mind",
    where:
      "Buy physic at the apothecary (3), visit a village healer (0.5), rest at home, live more comfortably.",
    go: place("apothecary", "village", "home"),
    goLabel: "Go to the apothecary",
    guide: "health",
  },
  {
    id: "stress",
    title: "Ease my stress",
    words: "stress worry calm rest relax drink pray",
    group: "Body and mind",
    where:
      "Rest at home, take a room at the tavern (1), pray, drink and listen, spend an evening with your family; ease off at work.",
    go: place("home", "tavern"),
    goLabel: "Go home",
    guide: "health",
  },
  // ---------------------------------------------------------------- travel and the world
  {
    id: "travel",
    title: "Travel somewhere",
    words: "travel go journey road move ship passage map",
    group: "Travel and the world",
    where:
      "Click any province on the map, then The road there: overland, by sea, or in your own boat. Right-click (or hold) a province to set out at once.",
    go: (ui) => ui.modal(null),
    goLabel: "Back to the map",
    guide: "map",
  },
  {
    id: "time",
    title: "Make time pass faster",
    words: "speed fast skip time slow pause clock",
    group: "Travel and the world",
    where:
      "The speed buttons by the date (keys 1 to 4), and ⏩ skip ahead (key 5), which runs fast until something needs you. Space pauses.",
    go: (ui) => ui.modal(null),
    goLabel: "Back to the game",
    guide: "time",
  },
  {
    id: "leads",
    title: "Hunt for treasure",
    words: "lead treasure gold silver wreck rumour mine pearls outlaw reward",
    group: "Travel and the world",
    where:
      "Read the gazette (the press or the tavern), or drink and listen at the tavern. Leads are listed in Journal › Leads and pinned on the map.",
    go: tab({ k: "tab", tab: "journal", sub: "leads" }),
    guide: "leads",
  },
  {
    id: "news",
    title: "Hear the news",
    words: "news gazette rumour talk gossip prices",
    group: "Travel and the world",
    where:
      "Read the gazette (press, tavern), listen to the talk (tavern, market, village, docks), news from Europe (docks). The News panel on the map has the colonies' news.",
    go: place("press", "tavern"),
    goLabel: "Go to the tavern",
    guide: "leads",
  },
  {
    id: "map",
    title: "See more of the map",
    words: "fog map explore unknown terra incognita discover",
    group: "Travel and the world",
    where:
      "Travel, and read the gazette: places in the news go on your map. A governor sees all of the colony; an officer sees around the army.",
    go: (ui) => ui.modal({ k: "guide", ch: "map" }),
    goLabel: "Read about the map",
    guide: "map",
  },
  // ---- HOME (r12): the household, the family, duels, other players
  {
    id: "improve-house",
    title: "Improve my house",
    words:
      "home house rooms parlour garden kitchen study nursery stable storehouse furnish furniture servants maid cook upgrade",
    group: "Money and home",
    where:
      "Here › Home (your house): add rooms and grounds, furnish it, keep servants, take in lodgers, or move up to a better house.",
    needs: (ui) => [
      {
        label: houseOf(ui.life!, ui.life!.prov)
          ? "You have a house here"
          : "You need a house here first (buy or rent one at Home)",
        met: !!houseOf(ui.life!, ui.life!.prov),
      },
    ],
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "property",
  },
  {
    id: "rent-house",
    title: "Rent a house",
    words: "rent lease lodgings tenant landlord house cheap",
    group: "Money and home",
    where:
      "Here › Home (your lodgings): rent any house by the month: no upkeep or rates, but nothing to sell.",
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "property",
    who: "colonist",
  },
  {
    id: "let-house",
    title: "Let a house, or take in lodgers",
    words: "let rent out tenant landlord lodger income second house",
    group: "Money and home",
    where:
      "Here › Home: Your other property (let a house you don't live in), or Lodgers (in the house you live in).",
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "property",
    who: "colonist",
  },
  {
    id: "store-goods",
    title: "Keep goods at home",
    words: "store goods storehouse cellar keep carry stash warehouse",
    group: "Money and home",
    where:
      "Here › Home (your house): Kept at home. Ten loads in any house, thirty more with a storehouse; they don't count against what you carry.",
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "property",
  },
  {
    id: "family-time",
    title: "Spend time with my family",
    words:
      "family wife husband spouse children kids evening home love time together",
    group: "People",
    where:
      "Here › Home: an evening with the family, time with your husband or wife, play with the children.",
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "family",
  },
  {
    id: "teach",
    title: "Teach my children",
    words: "teach children son daughter heir lessons educate school skills",
    group: "People",
    where:
      "Here › Home: under The family, pick a child (five to fifteen) and a skill you know well. What they learn goes into an heir's skills.",
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "family",
  },
  {
    id: "tree",
    title: "See my family tree",
    words:
      "family tree genealogy ancestors parents grandparents children grandchildren relatives kin",
    group: "People",
    where:
      "You › Family: the family tree, with portraits. Drag or pinch to move about; click anyone for their card.",
    go: (ui) => {
      ui.modal(null);
      ui.modal({ k: "tree" });
    },
    goLabel: "Open the tree",
    guide: "family",
  },
  {
    id: "players",
    title: "Find the other players",
    words: "players friends multiplayer others where rival town",
    group: "People",
    where:
      "People › People you know: Other players, where they are (as far as you can see). In your town they stand in its places, marked as players.",
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    guide: "multiplayer",
  },
  {
    id: "study-home",
    title: "Study at home",
    words: "study read books learn skill letters home evening",
    group: "Learning",
    where:
      "Here › Home: Study, in any skill (twice as far with a study of your own). Or hire a tutor.",
    go: (ui) => goHome(ui),
    goLabel: "Go home",
    guide: "property",
  },
  // ---- end HOME (r12)
  // ---------------------------------------------------------------- MAP (r12): seasons, harbours, achievements
  {
    id: "harvest",
    title: "Earn harvest wages",
    words: "harvest reap corn wheat autumn fields hand wages frolic season",
    group: "Travel and the world",
    where:
      "At the fields in the harvest months (September and October; January to March in the south): Help bring in the harvest. Farmers and hands earn harvest wages on top of their pay.",
    needs: (ui) => {
      const life = ui.life!;
      const def = ui.map.provinces[life.prov];
      return [
        {
          label: def.lat >= 30 ? "September or October" : "January to March",
          met: isHarvest(def.lat, dateOf(ui.s.day).month),
        },
        { label: "Sixteen or over", met: !isChildLife(ui.s, life) },
      ];
    },
    go: place("fields"),
    goLabel: "Go to the fields",
    guide: "seasons",
  },
  {
    id: "season",
    title: "Know what the season brings",
    words:
      "season winter spring summer autumn snow ice frozen mud flood fever hurricane weather roads",
    group: "Travel and the world",
    where:
      "Point at (or tap) the season's sign by the date in the banner: the roads, the rivers and the harbour, sickness, the harvest and the price of bread where you are.",
    go: (ui) => ui.modal({ k: "guide", ch: "seasons" }),
    goLabel: "Read about the seasons",
    guide: "seasons",
  },
  {
    id: "sail",
    title: "Sail to another port",
    words: "sail ship boat port harbour voyage sea passage quay",
    group: "Travel and the world",
    where:
      "From a port (it has docks): click a coastal province, then The road there, and choose by sea. You board at the quay and land at theirs. No ships out of a frozen harbour in winter.",
    go: (ui) => ui.modal(null),
    goLabel: "Back to the map",
    guide: "map",
  },
  // ---- PARTNERS (r13): business partnerships
  {
    id: "partnership",
    title: "Go into business with someone",
    words:
      "partner partnership business firm company copartnership articles invest share capital found together venture cargo",
    group: "Money and home",
    where:
      "Anyone's card: In business › Propose a partnership (in person, or by post if they're far off). At the market: Partnerships lists who in town might go into business with you. Bring in a business, buy a share of theirs, found one together, or pool money for cargoes.",
    needs: (ui) => [
      adult(ui),
      {
        label: `In ${firmsWith(ui.s, ui.life!.c).length} of ${MAX_FIRMS} partnerships`,
        met: firmsWith(ui.s, ui.life!.c).length < MAX_FIRMS,
      },
    ],
    go: place("market"),
    goLabel: "Go to the market",
    guide: "partners",
  },
  {
    id: "take-partner",
    title: "Take on a partner",
    words:
      "partner take on silent partner investor capital money my business shop inn sell a share",
    group: "Money and home",
    where:
      "Bring your own business into a partnership: their card, In business › Propose a partnership, and choose your business as what the firm holds. They put in capital for a share; you run it as the managing partner. Already in a firm: Estate › Partnerships, Bring in a new partner (put to the partners).",
    needs: (ui) => [
      {
        label: (ui.life!.property ?? []).some((p) => p.kind === "business")
          ? "You have a business of your own"
          : firmsWith(ui.s, ui.life!.c).length
            ? "You're in a firm (bring someone in by vote)"
            : "A business of your own (the top rungs of many trades), or found one together",
        met:
          (ui.life!.property ?? []).some((p) => p.kind === "business") ||
          firmsWith(ui.s, ui.life!.c).length > 0,
      },
    ],
    go: tab({ k: "tab", tab: "estate", sub: "partners" }),
    goLabel: "Partnerships",
    guide: "partners",
  },
  {
    id: "buy-out",
    title: "Buy out my partner",
    words: "buy out partner share firm end partnership own it alone",
    group: "Money and home",
    where:
      "Estate › Partnerships: Put something to the partners › Buy out a partner. You pay a fair price (what the share would fetch wound up, and a year of its profit); with the greater part (or all, if the articles say so) it's yours, and if you're the last partner the business is yours alone.",
    needs: (ui) => {
      const f = firmsWith(ui.s, ui.life!.c)[0];
      const other = f?.partners.find((p) => p.c !== ui.life!.c);
      const price = f && other ? buyoutPrice(ui.s, f, other.c) : 0;
      return [
        { label: f ? `A partner in ${f.name}` : "In a partnership", met: !!f },
        ...(f && other
          ? [
              {
                label: `${price} coins for ${ui.s.chars[other.c]?.first ?? "their"}'s share (you have ${Math.floor(ui.life!.purse)})`,
                met: ui.life!.purse >= price,
              },
            ]
          : []),
      ];
    },
    go: tab({ k: "tab", tab: "estate", sub: "partners" }),
    goLabel: "Partnerships",
    guide: "partners",
  },
  {
    id: "firm-books",
    title: "See my firm's books",
    words: "books ledger firm partnership profit accounts chest debt vote",
    group: "Money and home",
    where:
      "Estate › Partnerships: each firm's partners and shares, the books month by month, the chest and the debt, and what's before the partners.",
    go: tab({ k: "tab", tab: "estate", sub: "partners" }),
    guide: "partners",
  },
  // ---- end PARTNERS (r13)
  // ---- DICE (r14): Liar's dice in the tavern
  {
    id: "dice",
    title: "Play Liar's dice",
    words:
      "dice liar liars gamble gambling game bet wager stake pot tavern cards bluff play",
    group: "People",
    where:
      "The tavern: Things to do › Liar's dice…. Choose the stake (2, 5, 10 or 25) and ask up to five of the people there to sit down: each says yes or no, with their reasons. Five dice each under a cup; bid on what lies under all the cups (ones are wild), or call the last bid a lie. The last with dice takes the pot. It teaches Stealth.",
    needs: (ui) => [
      adult(ui),
      inTown(ui, "tavern", "tavern"),
      {
        label:
          ui.life!.purse < 0
            ? "Nobody dices with a debtor: pay what you owe first"
            : `2 coins at least for a stake (you have ${Math.floor(ui.life!.purse)})`,
        met: ui.life!.purse >= 2,
      },
    ],
    go: (ui) => goDice(ui),
    goLabel: "Go to the tavern's table",
    guide: "dice",
  },
  {
    id: "dice-friend",
    title: "Play dice with a friend",
    words:
      "dice liar liars friend player players multiplayer together invite table game company",
    group: "People",
    where: `Both of you in the same town's tavern. Open a table (Things to do › Liar's dice…) and tick them in the list: they get an invitation to accept or decline. Or, if they've opened one, sit down at it from the tavern (until the first roll). Each sees only their own dice until the cups come up, and a player who doesn't bid in ${STALL_SECONDS} seconds has the smallest raise made for them.`,
    needs: (ui) => {
      const life = ui.life!;
      const here = ui.s.lives.filter(
        (l) =>
          l !== life &&
          !l.watching &&
          l.c >= 0 &&
          !l.travel &&
          l.prov === life.prov,
      );
      return [
        adult(ui),
        inTown(ui, "tavern", "tavern"),
        {
          label: here.length
            ? `${here.map((l) => l.name).join(", ")} in town with you`
            : "Another player in the same town",
          met: here.length > 0,
        },
      ];
    },
    go: (ui) => goDice(ui),
    goLabel: "Go to the tavern's table",
    guide: "dice",
  },
  // ---- end DICE (r14)
  // ---- LEDGER (r15): money made plain
  {
    id: "month-money",
    title: "See what a month brings in and costs",
    words:
      "money income expenses month monthly budget wages costs forecast purse figure ledger crew upkeep",
    group: "Money and home",
    where:
      "Point at your purse in the banner, or open Estate › Purse: everything that comes and goes each month (wages, living, rents, keep, boats' crews, your people's wages, a company), what's certain apart from what runs on luck (voyages, cargoes, dividends, rents) as what's expected, from worst to best.",
    go: tab({ k: "tab", tab: "estate", sub: "purse" }),
    goLabel: "Estate › Purse",
    guide: "ledger",
  },
  {
    id: "track-affairs",
    title: "Keep track of my boats, cargoes and traders",
    words:
      "track boats boat cargo cargoes ventures shares traders clerks firms affairs ledger out working news missed",
    group: "Money and home",
    where:
      "Estate › Ledger: everything of yours out working (boats and their work, cargoes and shares, traders, partnerships, a company), when each is due and what it should bring; your own news kept apart from the world's; and every month's accounts. Your own news also comes as its own notice, and the News has a Yours tab.",
    needs: (ui) => {
      const n = affairsOf(ui.s, ui.w, ui.life!).length;
      return [
        {
          label: n
            ? `${n} of yours out working`
            : "Something out working: a boat at work, a cargo, a clerk trading",
          met: n > 0,
        },
      ];
    },
    go: tab({ k: "tab", tab: "estate", sub: "ledger" }),
    goLabel: "Estate › Ledger",
    guide: "ledger",
  },
  {
    id: "statement",
    title: "See last month's accounts",
    words:
      "accounts statement month ledger books income spent where money went last month",
    group: "Money and home",
    where:
      "Estate › Ledger, The month's accounts: at each month's turn a statement of every coin in and out, line by line, with what was expected beside it. The last twelve months are kept.",
    go: tab({ k: "tab", tab: "estate", sub: "ledger" }),
    goLabel: "Estate › Ledger",
    guide: "ledger",
  },
  {
    id: "boat-odds",
    title: "Know what a boat's work will bring",
    words:
      "boat odds risk reward fishing whaling coasting trading smuggling privateering chance profit crew worth it",
    group: "Money and home",
    where:
      "Estate › Boats (or her port's docks): under each boat, what her work should make a month after her crew, keep and skipper; open Risk and reward of each kind of work for every kind side by side, each outcome's chance, the dangers, and what changes the odds. The boatyard says what a new boat could do there.",
    needs: (ui) => [
      {
        label: (ui.life!.boats ?? []).length
          ? "A boat of your own"
          : "A boat of your own (the boatyard shows what a new one could do)",
        met: (ui.life!.boats ?? []).length > 0,
      },
    ],
    go: tab({ k: "tab", tab: "estate", sub: "boats" }),
    goLabel: "Estate › Boats",
    guide: "ledger",
  },
  {
    id: "trader-odds",
    title: "Know what a trader would make me",
    words:
      "clerk trader factor agent hire hiring trading odds stake profit risk worth it wages",
    group: "People",
    where:
      "People › Your people: pick a clerk's stake and the trip's odds show before you send them (what comes back each way, what's expected a trip and a month after their wages). People for hire at the market and the docks say what a clerk would make trading for you.",
    go: tab({ k: "tab", tab: "people", sub: "yours" }),
    goLabel: "People › Your people",
    guide: "ledger",
  },
  {
    id: "acres",
    title: "Count the acres I own",
    words: "acres land estate province provinces total how much land own farm",
    group: "Money and home",
    where:
      "Estate › House & land, Your acres: the acres you own in each province, a subtotal for each, and all told.",
    go: tab({ k: "tab", tab: "estate", sub: "house" }),
    goLabel: "Estate › House & land",
    guide: "ledger",
  },
  // ---- end LEDGER (r15)
  // ---- BUSINESS (r15): starting a business, and a trading company
  {
    id: "start-business",
    title: "Start a business of my own",
    words:
      "start business own set up open shop store inn tavern forge mill farm ship printing house brewhouse trade alone",
    group: "Money and home",
    where:
      "Start a business… (Estate › Business, the market, or Work › Find work): choose the kind and size, see what it costs and its months one by one (when it starts making money, when it's paid for itself), what drives its takings and the risks; then set it up alone, or draw up articles with a partner.",
    needs: (ui) => {
      const life = ui.life!;
      const kinds = life.travel ? 0 : bizTradesAt(ui.s, ui.w, life.prov).length;
      return [
        adult(ui),
        {
          label: life.travel
            ? "In a town (you're on the road)"
            : kinds
              ? `${ui.map.provinces[life.prov].name} has the place for ${kinds} kinds`
              : `${ui.map.provinces[life.prov].name} has no place for a business`,
          met: kinds > 0,
        },
      ];
    },
    go: (ui) => ui.modal({ k: "startbiz" }),
    goLabel: "Start a business…",
    guide: "business",
  },
  {
    id: "business-losing",
    title: "Find out why my business is losing money",
    words:
      "losing money business loss why profit hands custom minded away manager too big rivals season shop inn",
    group: "Money and home",
    where:
      "Estate › Business: each business's page says why it makes or loses money, the worst first (nobody minding it, not your trade, too many hands for the town's custom, too big a place, the season, its first months), with its month's account and a year's chart. A business that loses two months running tells you in your journal.",
    needs: (ui) => [
      {
        label: (ui.life!.property ?? []).some((p) => p.kind === "business")
          ? "A business of your own"
          : "A business of your own, or a partnership",
        met:
          (ui.life!.property ?? []).some((p) => p.kind === "business") ||
          firmsWith(ui.s, ui.life!.c).length > 0,
      },
    ],
    go: tab({ k: "tab", tab: "estate", sub: "business" }),
    goLabel: "Estate › Business",
    guide: "business",
  },
  {
    id: "business-manager",
    title: "Have someone mind my business",
    words:
      "manager mind business away travel run shop inn steward foreman clerk while I'm gone",
    group: "Money and home",
    where:
      "Estate › Business, on the business's page: A manager. One of your people (People › Your people: a clerk, a hand, a mate...) minds it while you're away or busy, with their own skill in the trade. Unminded, a business takes 0.6 of its takings.",
    needs: (ui) => [
      {
        label: (ui.life!.people ?? []).length
          ? "Someone in your service"
          : "Someone in your service (hire them at the tavern, the market or the docks)",
        met: (ui.life!.people ?? []).length > 0,
      },
    ],
    go: tab({ k: "tab", tab: "estate", sub: "business" }),
    goLabel: "Estate › Business",
    guide: "business",
  },
  {
    id: "trading-company",
    title: "Start a trading company",
    words:
      "trading company goods tobacco furs sugar rum molasses fish timber flour iron cloth wine export ship cargo factor route",
    group: "Money and home",
    where:
      "Start a business… › A trading company: choose its goods, where it sells them (Europe or another port), the loads a cargo and how often; the odds of a voyage show before you commit (sold, spoiled, wrecked, taken, seized) and what it should make a month once it's going. Alone, or with partners (Articles…). Set up at a port with a market and docks.",
    needs: (ui) => [
      adult(ui),
      inTown(ui, "docks", "docks"),
      coins(ui, 15, "to set it up, and a chest for its cargoes"),
    ],
    go: (ui) => ui.modal({ k: "startbiz" }),
    goLabel: "Start a business…",
    guide: "business",
  },
  {
    id: "silent-partner",
    title: "Put money into someone's business",
    words:
      "silent partner invest money share someone's business inn store dividend income passive",
    group: "Money and home",
    where:
      "Their card: In business › Propose a partnership, then the preset Put money into their business as a silent partner: it fills in a fair share for what you put in, says what it should bring you a month, and they run it. Your share of its profit comes every month.",
    needs: (ui) => [adult(ui)],
    go: place("market"),
    goLabel: "Go to the market",
    guide: "partners",
  },
  // ---- end BUSINESS (r15)
  // ---- EVENTS (r15): things that happen, and the pace of them
  {
    id: "events-waiting",
    title: "Answer what's waiting",
    words:
      "event events letter letters scene choice choices answer decide waiting happened knock",
    group: "Body and mind",
    where:
      "The letters waiting at the top of the screen: each a scene with its choices, the odds of any that test a skill, and what each comes to. Alone, the game waits for you; in company a letter decides itself if left too long.",
    needs: (ui) => {
      const n = ui.life!.events.length;
      return [
        {
          label: n ? `${n} waiting for you now` : "Nothing waiting just now",
          met: n > 0,
        },
      ];
    },
    go: (ui) => {
      const first = ui.life!.events[0];
      if (first) ui.modal({ k: "event", id: first.id });
      else tab({ k: "tab", tab: "journal", sub: "diary" })(ui);
    },
    goLabel: "Open it",
    guide: "events",
  },
  {
    id: "events-pace",
    title: "Know what can happen to me",
    words:
      "events random repeat repeats again same often variety happen happens rest family families why",
    group: "Body and mind",
    where:
      "Things come by who and where you are, the season and the year. None comes round again for a long while (four years at home, about a year on the road, at sea and at work), and a family of them (sicknesses, money troubles, quarrels) rests together. Journal › Diary keeps what came of them.",
    go: tab({ k: "tab", tab: "journal", sub: "diary" }),
    goLabel: "Journal",
    guide: "events",
  },
  {
    id: "events-matters",
    title: "Handle a matter at work",
    words:
      "matter matters work task trouble trade job robbed lines wolverine thaw master foreman",
    group: "Work",
    where:
      "At work, every month or two, a task or a trouble of your trade's own comes as a letter: several to every trade, each with its own choices, none twice in a year. Take it on (a skill check), the careful way, or leave it.",
    needs: (ui) => [
      {
        label: ui.life!.job ? "In work" : "Work of some kind",
        met: !!ui.life!.job,
      },
    ],
    go: tab({ k: "tab", tab: "work", sub: "job" }),
    goLabel: "Your work",
    guide: "events",
  },
  // ---- end EVENTS (r15)
  // ---- INTRIGUE (r15): hearts and schemes
  {
    id: "intr-seduce",
    title: "Win someone's heart",
    words:
      "seduce seduction mistress kept man lover affair romance woo charm tempt flirt",
    group: "People",
    where:
      "Their card: Hearts and schemes › Seduce…: as lovers, or to keep (a mistress or a kept man, an allowance a month). The chance, the weeks and the risks are shown first. Grown people only (eighteen and over, both of you), never close kin.",
    needs: (ui) => [grown(ui)],
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    goLabel: "People you know",
    guide: "intrigue",
  },
  {
    id: "intr-child",
    title: "Have a child with my husband or wife",
    words:
      "child children baby heir conceive pregnant spouse wife husband court romance family",
    group: "People",
    where:
      "Society › Intrigue (or their card): Court your wife, or husband. For half a year a child is half again as likely, and they think the better of you.",
    needs: (ui) => [
      {
        label: "Married",
        met: (ui.me?.spouse ?? -1) >= 0,
      },
    ],
    go: tab({ k: "tab", tab: "society", sub: "intrigue" }),
    goLabel: "Society › Intrigue",
    guide: "intrigue",
  },
  {
    id: "intr-wedding",
    title: "Plan my wedding",
    words:
      "wedding marry marriage betrothal betrothed engaged promised banns licence church ceremony guests feast dowry",
    group: "People",
    where:
      "Ask for their hand (their card); then Society › Intrigue › Plan the wedding…: the rite, how grand, the day (the banns take three Sundays, or buy a licence) and the guests, the cost on the button. Or a quiet wedding before the minister.",
    needs: (ui) => [
      {
        label:
          ui.me && betrothalOf(ui.s, ui.me.id)
            ? "Promised"
            : "Promised to someone (ask for their hand first)",
        met: !!ui.me && !!betrothalOf(ui.s, ui.me.id),
      },
    ],
    go: tab({ k: "tab", tab: "society", sub: "intrigue" }),
    goLabel: "Society › Intrigue",
    guide: "intrigue",
  },
  {
    id: "intr-attend",
    title: "Go to a gathering I'm asked to",
    words:
      "invitation invited attend travel journey wedding ball feast funeral christening go guest",
    group: "Society",
    where:
      "Society › Gatherings: an invitation somewhere else shows the journey; Accept, and go sets out in good time, and Come home after brings you back.",
    go: tab({ k: "tab", tab: "society", sub: "gatherings" }),
    goLabel: "Gatherings",
    guide: "intrigue",
  },
  {
    id: "intr-plot",
    title: "Plot to kill someone",
    words:
      "kill murder assassinate poison plot ambush cutthroat accident enemy rid scheme",
    group: "People",
    where:
      "Their card: Hearts and schemes › Plot against…: poison, a cutthroat, an ambush, an accident at the docks or a duel with a bully; the cost, the weeks, the chance it comes off and the chance it's found out, before you begin. Never a child. Found out, it's a trial.",
    needs: (ui) => [grown(ui)],
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    goLabel: "People you know",
    guide: "intrigue",
  },
  {
    id: "intr-guard",
    title: "Protect myself from a plot",
    words: "guard guards protect bodyguard warned plot assassin murder safe",
    group: "People",
    where:
      "When something isn't right, the warning's scene: hire men to watch over you, find out who, or leave town. Society › Intrigue shows plots you know of, and your guards.",
    go: tab({ k: "tab", tab: "society", sub: "intrigue" }),
    goLabel: "Society › Intrigue",
    guide: "intrigue",
  },
  {
    id: "intr-letter",
    title: "Write to another player in my own words",
    words:
      "letter write message private freeform player friend note mail own words post",
    group: "Society",
    where:
      "Society › Letters › In your own words, to a player… (or their card): a subject and up to two thousand characters, by the post. Only they will read it.",
    needs: (ui) => [
      {
        label: canWritePersonal(ui)
          ? "Another player to write to"
          : "Another player in the game",
        met: canWritePersonal(ui),
      },
    ],
    go: (ui) => ui.modal({ k: "intrigue", what: "letter" }),
    goLabel: "Write",
    guide: "intrigue",
  },
  // ---- end INTRIGUE (r15)
  {
    id: "achievements",
    title: "See my achievements",
    words: "achievements medals derp coins rewards trophies goals",
    group: "Travel and the world",
    where:
      "Journal › Achievements: each pays a few Derp Coins the first time your account earns it.",
    go: tab({ k: "tab", tab: "journal", sub: "achievements" }),
    guide: "coins",
  },
  // ---- SEA (r15): to sea in person
  {
    id: "go-privateering",
    title: "Go to sea on a privateer (or a pirate)",
    words:
      "privateer privateering pirate piracy cruise sea sail prizes prize sign articles ship captain quartermaster hand letter marque plunder treasure galleon nassau tortuga port royal",
    group: "Work",
    where:
      "Work › At sea, at a port where a ship is fitting out: privateers at the ports of a colony at war, pirates in the islands, Florida and the Carolinas (1650 to 1730), best at a haven. Sign as a hand, an officer or her captain, with the odds shown; you sail with her on the map and are paid your share when she's home.",
    needs: (ui) => {
      const s = ui.s;
      const life = ui.life!;
      const here = life.travel ? 0 : cruiseOffers(s, ui.w, life.prov).length;
      return [
        adult(ui),
        {
          label: here
            ? `${here} ship${here === 1 ? "" : "s"} fitting out here`
            : "A port where a ship is fitting out (a colony at war, or pirate waters)",
          met: here > 0,
        },
        {
          label: "Seamanship 2 or fighting 4, to sign as a hand",
          met:
            skillLevel(s, life, "seamanship") >= 2 ||
            skillLevel(s, life, "fighting") >= 4,
        },
      ];
    },
    go: tab({ k: "tab", tab: "work", sub: "sea" }),
    goLabel: "Work › At sea",
    guide: "sea",
  },
  {
    id: "own-privateer",
    title: "Take my own boat out privateering",
    words:
      "own boat sloop schooner privateer privateering letter marque commission cruise command captain prizes pirate",
    group: "Work",
    where:
      "Work › At sea, at the port where she lies: a sloop or bigger, crewed and sound. Take out a letter of marque (a colony at war), choose a hunting ground and a short or long cruise, and fit her out; you command her.",
    needs: (ui) => {
      const life = ui.life!;
      const b = (life.boats ?? []).filter((x) =>
        BOATS[x.kind].uses.includes("privateering"),
      );
      return [
        {
          label: b.length
            ? `The ${b[0].name}`
            : "A sloop or bigger (Estate › Boats, or a boatyard)",
          met: b.length > 0,
        },
        {
          label:
            "A war on, for a letter of marque (or go on the account: piracy)",
          met: ui.me
            ? ui.s.wars.some(
                (w) => w.a === ui.me!.nation || w.b === ui.me!.nation,
              )
            : false,
        },
      ];
    },
    go: tab({ k: "tab", tab: "work", sub: "sea" }),
    goLabel: "Work › At sea",
    guide: "sea",
  },
  {
    id: "privateer-company",
    title: "Start a privateering company with other players",
    words:
      "privateering company privateer partners partnership owners shares friends players fit out ship subscribe invest war",
    group: "Money and home",
    where:
      "Work › At sea, Get up a company, at a port of a colony at war: a ship new from the yard or your own boat, your stake; ask other players by letter, let the town's merchants take up the rest, and sign the owners' articles. Then send her cruising, or command her yourself.",
    needs: (ui) => [
      adult(ui),
      {
        label: "A port of a colony at war",
        met: !ui.life!.travel && commissionAt(ui.s, ui.w, ui.life!.prov) >= 0,
      },
    ],
    go: tab({ k: "tab", tab: "work", sub: "sea" }),
    goLabel: "Work › At sea",
    guide: "sea",
  },
  {
    id: "trade-voyage",
    title: "Go on a voyage with my trade",
    words:
      "voyage merchant sailor whaling whaler fur brigade trader posts surveyor survey patent travel venture lay go with stay ashore send word",
    group: "Work",
    where:
      "It comes to you as a scene every month or two at your post: a merchant sailor's voyage (with a venture of your own), a whaler's season on the grounds, the fur brigade to the posts, a surveyor's patent. Go with it on the map, or stay ashore and send word. Under way, Work › At sea shows where you are.",
    needs: (ui) => {
      const k = ui.life!.job?.kind;
      return [
        {
          label: k
            ? `Your trade: ${k}`
            : "A trade that travels: sailor, whaler, fur trader (a partner), native trader, surveyor",
          met:
            !!k &&
            ["sailor", "whaler", "trapper", "trader", "surveyor"].includes(k),
        },
      ];
    },
    go: tab({ k: "tab", tab: "work", sub: "sea" }),
    goLabel: "Work › At sea",
    guide: "sea",
  },
  {
    id: "hurricanes",
    title: "Know when a hurricane is coming",
    words:
      "hurricane storm weather season tempest signs swell glass barometer red sky batten shelter harbour",
    group: "Travel and the world",
    where:
      "They show on the map from June to November, turning, with their track and where they're heading; Work › At sea lists those abroad. A day or two before one reaches you come the signs (a scene): batten down ashore, or run for a harbour at sea.",
    go: tab({ k: "tab", tab: "work", sub: "sea" }),
    goLabel: "Work › At sea",
    guide: "sea",
  },
  {
    id: "pirate-pardon",
    title: "Take the King's pardon for piracy",
    words:
      "pardon pirate piracy amnesty act of grace surrender governor 1718 1688 forgive heat",
    group: "Office and the law",
    where:
      "Work › At sea, while a pardon is proclaimed (1688, and September 1717 to the end of 1718), at an English colony: surrender to the governor and your piracy is forgiven.",
    needs: (ui) => [
      check(
        pardonCheck(ui.s, ui.w, ui.life!),
        "A pardon on offer, and you here to take it",
      ),
    ],
    go: tab({ k: "tab", tab: "work", sub: "sea" }),
    goLabel: "Work › At sea",
    guide: "sea",
  },
  // ---- end SEA (r15)
  // ---- CHAIR (r16): the road to the governor's chair
  {
    id: "chair-road",
    title: "See where I am on the road to the governor's chair",
    words:
      "governor chair road ladder steps next where am i council assembly court lieutenant commission",
    group: "Society",
    where:
      "Society › Standing › The road to the governor's chair: each step ticked with the day you reached it, the one you're on, and what would bring the chair nearer.",
    who: "colonist",
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    goLabel: "Society › Standing",
    guide: "chair",
  },
  {
    id: "chair-recall",
    title: "Petition the crown for the governor's recall",
    words:
      "petition recall governor crown board of trade remove depose bring down names signatures agent london",
    group: "Society",
    where:
      "Society › Standing › The governor's chair: the odds before you begin, then names from the council and the house and friends at court as it goes. Its answer comes in about six months.",
    who: "colonist",
    needs: (ui) => [
      check(petitionCheck(ui.s, ui.life!), "You could begin one now"),
    ],
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    goLabel: "Society › Standing",
    guide: "chair",
  },
  {
    id: "chair-address",
    title: "Withhold the governor's salary, or refuse supply",
    words:
      "address house assembly speaker salary withhold supply refuse purse governor quarrel",
    group: "Society",
    where:
      "From the speaker's chair: Society › Standing › The governor's chair › The house's address. The house divides two weeks later; carried, it stands a year.",
    who: "colonist",
    needs: (ui) => {
      const me = ui.me;
      const speaker =
        !!me && ui.s.power?.cabinets[me.nation]?.speaker === me.id;
      return [
        {
          label: speaker
            ? "You're the speaker"
            : "The speaker moves it (the house chooses its speaker)",
          met: speaker,
        },
      ];
    },
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    goLabel: "Society › Standing",
    guide: "chair",
  },
  {
    id: "chair-lt",
    title: "Become lieutenant governor",
    words:
      "lieutenant governor deputy acting succeed successor old ill gout commission",
    group: "Society",
    where: `The crown offers it when the governor grows old or ill: the best case in the colony, ${LT.bar} or more, is asked first (a letter). It's shown on Society › Standing.`,
    who: "colonist",
    needs: (ui) => {
      const score = Math.round(governorScore(ui.s, ui.life!));
      return [
        {
          label: `A case of ${LT.bar} (yours ${score})`,
          met: score >= LT.bar,
        },
      ];
    },
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    goLabel: "Society › Standing",
    guide: "chair",
  },
  {
    id: "chair-follow",
    title: "Follow the government to the new capital",
    words:
      "capital fallen moved government follow move household seat lapse conquered",
    group: "Society",
    where:
      "When the capital falls, the government goes to the biggest town left. Society › Standing (or the scene that comes with the news): Follow the government, and your household moves in when you arrive.",
    who: "colonist",
    needs: (ui) => [check(followCheck(ui.s, ui.life!), "You could go now")],
    go: tab({ k: "tab", tab: "society", sub: "standing" }),
    goLabel: "Society › Standing",
    guide: "chair",
  },
  {
    id: "chair-great",
    title: "Spend a governor's money: a hall, a coach, portraits, endowments",
    words:
      "spend money rich mansion hall coach four portrait painting likeness endow endowment grammar school charity poor college scholarship bells library legacy name remembered",
    group: "Money and home",
    where:
      "Estate › House & land › Marks of greatness: a great house with your name, a coach and four, portraits, and endowments that carry your name. Each is a line in your story.",
    who: "colonist",
    go: tab({ k: "tab", tab: "estate", sub: "house" }),
    goLabel: "Estate › House & land",
    guide: "chair",
  },
  // ---- end CHAIR (r16)
  // ---- LABOUR (r15): bondage in the colonies, as history
  {
    id: "bond-law",
    title: "Know where slavery was lawful, and when",
    words:
      "slavery slave slaves enslaved bondage law lawful legal code colony georgia ban virginia history",
    group: "Travel and the world",
    where:
      "Estate › Bondage, The law: whether anyone may be held where your household lives, on what law, how they may be freed, and the history there. The How to Play's chapter Bondage in the colonies has a table of every colony, year by year.",
    go: tab({ k: "tab", tab: "estate", sub: "bondage" }),
    goLabel: "Estate › Bondage",
    guide: "bondage",
  },
  {
    id: "bond-free",
    title: "Free someone held in bondage",
    words:
      "free freedom manumit manumission emancipate liberty will petition release indenture enslaved slave",
    group: "People",
    where:
      "Estate › Bondage: Free (by deed, or a petition where the law demands one), Free in your will, or let them buy their freedom once they've saved their price. The law's fees are on the button; some colonies want security in hand, or send the freed out of the colony.",
    needs: (ui) => [
      {
        label:
          (ui.life!.bondage?.people.length ?? 0)
            ? "Someone held in your household"
            : "Nobody held in your household",
        met: (ui.life!.bondage?.people.length ?? 0) > 0,
      },
    ],
    go: tab({ k: "tab", tab: "estate", sub: "bondage" }),
    goLabel: "Estate › Bondage",
    guide: "bondage",
    who: "colonist",
  },
  {
    id: "bond-indenture",
    title: "Take on a servant under indenture",
    words:
      "indenture indentured servant servants redemptioner engage bound term passage labour labor cheap workers",
    group: "People",
    where:
      "The docks of an English port (and New France's until the 1730s), when a ship has servants: buy the indenture there, or on Estate › Bondage. Four to seven years' work for the passage, the same keep as anyone, and freedom dues at the end.",
    go: tab({ k: "tab", tab: "estate", sub: "bondage" }),
    goLabel: "Estate › Bondage",
    guide: "bondage",
    who: "colonist",
  },
  {
    id: "bond-risks",
    title: "Know the risks of flight and of a rising",
    words:
      "flight escape run away runaway revolt rising rebellion uprising odds risk maroon florida patrol treatment",
    group: "People",
    where:
      "Estate › Bondage, The risks: each person's chance of flight a year, of reaching freedom, of a rising, and the deaths expected; and what changes the odds (how the household is kept, grief, refuges near, patrols).",
    go: tab({ k: "tab", tab: "estate", sub: "bondage" }),
    goLabel: "Estate › Bondage",
    guide: "bondage",
    who: "colonist",
  },
  // ---- end LABOUR (r15)
  // ---------------------------------------------------------------- EDU (r13): school, a trade, college
  {
    id: "school",
    title: "Send my child to school",
    words:
      "school dame grammar latin tutor convent ursulines jesuit sewing educate children son daughter letters mission",
    group: "People",
    where:
      "You › Family: Schooling and trades, Choose… beside a child. A dame school from four; the Latin grammar school (boys) or a sewing school (girls) from seven; the Jesuits or a convent in the Catholic colonies; a tutor at home; among the native peoples the elders' teaching or a mission school.",
    needs: (ui) => [adult(ui), childAged(ui, 4, 15)],
    go: (ui) => goSchooling(ui),
    goLabel: "Take me to You › Family",
    guide: "schooling",
  },
  {
    id: "apprentice",
    title: "Apprentice my son or daughter",
    words:
      "apprentice apprenticeship indenture bind trade master mistress son daughter journeyman cooper smith printer mantua milliner seamstress midwife housewifery",
    group: "People",
    where:
      "You › Family: Schooling and trades, Choose…, A trade. Pick the trade, then a master in your town or one you know: some seven years living in the master's house, a premium for some trades, and out a journeyman on that trade's ladder.",
    needs: (ui) => [adult(ui), childAged(ui, 11, 16)],
    go: (ui) => goSchooling(ui),
    goLabel: "Take me to You › Family",
    guide: "schooling",
    who: "colonist",
  },
  {
    id: "college",
    title: "Send my child to college",
    words:
      "college university harvard yale william mary princeton kings oxford cambridge edinburgh leiden paris salamanca degree latin son scholar",
    group: "People",
    where:
      "You › Family: Schooling and trades, Choose…, College. From fourteen, a son with Latin and letters 5 (6 for a university abroad), and a few months' bills in hand; four years to the degree. Each college opens in its own year.",
    needs: (ui) => [adult(ui), childAged(ui, 14, 20, true)],
    go: (ui) => goSchooling(ui),
    goLabel: "Take me to You › Family",
    guide: "schooling",
  },
  // ---------------------------------------------------------------- FIXES (r15)
  {
    id: "camera-keys",
    title: "Move the map with the keys",
    words:
      "move map camera pan scroll keys keyboard wasd arrows arrow look around view",
    group: "Travel and the world",
    where:
      "On the map: hold W A S D or the arrow keys to move the view (Shift to go faster), or drag it. The keys move the map, never you; they rest while you type or a window is open.",
    go: (ui) => ui.modal({ k: "guide", ch: "keys" }),
    goLabel: "Read the keys",
    guide: "keys",
  },
];

/** EDU (r13): a child of yours of an age for it (a son, for college). */
function childAged(ui: GameUi, lo: number, hi: number, son = false): Need {
  const s = ui.s;
  const kids = schoolable(s, ui.life!).filter(
    (c) =>
      ageOf(s, c) >= lo &&
      ageOf(s, c) <= hi &&
      (!son || !c.female) &&
      !c.edu?.now,
  );
  return {
    label: kids.length
      ? `${kids.map((c) => `${c.first} (${ageOf(s, c)})`).join(", ")} at home`
      : `A ${son ? "son" : "child"} of ${lo} to ${hi} at home, and not at school already`,
    met: kids.length > 0,
  };
}

/** EDU (r13): You › Family, at the children's schooling. */
function goSchooling(ui: GameUi): void {
  ui.modal(null);
  ui.open({ k: "tab", tab: "you", sub: "family" });
  requestAnimationFrame(() =>
    document
      .querySelector(".cq-sch-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

/** DICE (r14): into the tavern, and to its table (open one, or the one there). */
async function goDice(ui: GameUi): Promise<void> {
  const life = ui.life!;
  ui.modal(null);
  const here = life.travel ? [] : areasOf(ui.s, ui.w, life.prov, life);
  if (!here.includes("tavern")) {
    ui.open({ k: "tab", tab: "here" });
    ui.toast(
      life.travel
        ? "You're on the road: look when you arrive."
        : `${ui.map.provinces[life.prov].name} has no tavern: a bigger town will.`,
    );
    return;
  }
  if (life.area !== "tavern") await ui.cmd({ k: "enter", area: "tavern" });
  ui.open({ k: "tab", tab: "here" });
  const t = tableAt(ui.s, life.prov);
  ui.modal({ k: "dice", id: t?.id });
}

/** HOME (r12): step into your home here, or say where it is. */
async function goHome(ui: GameUi): Promise<void> {
  const life = ui.life!;
  ui.modal(null);
  if (!life.travel && homeHere(life, life.prov)) {
    if (life.area !== "home") await ui.cmd({ k: "enter", area: "home" });
    ui.open({ k: "tab", tab: "here" });
    requestAnimationFrame(() =>
      document
        .querySelector(".cq-area-banner")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    return;
  }
  ui.open({ k: "tab", tab: "here" });
  ui.toast(
    life.travel
      ? "You're on the road: home is where you settle."
      : `Your home is at ${ui.map.provinces[life.home]?.name ?? "your home"}.`,
  );
}

let query = "";
let openId = "";

/** The search box takes the keyboard when the window opens (not on phones). */
const focused = new WeakSet<Element>();
function focusOnce(el?: Element): void {
  if (!el || focused.has(el)) return;
  focused.add(el);
  if (matchMedia("(pointer: coarse)").matches) return;
  setTimeout(() => (el as HTMLInputElement).focus(), 0);
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");

function matches(g: Goal, q: string): number {
  if (!q) return 1;
  // The title and the words people use, not the "where" (every place name
  // in it would match: the governor's house is no house to buy).
  const hay = norm(`${g.title} ${g.words} ${g.group}`);
  const title = norm(g.title);
  let score = 0;
  for (const w of norm(q).split(/\s+/).filter(Boolean)) {
    if (title.includes(w)) score += 3;
    else if (hay.includes(w)) score += 1;
    else return 0;
  }
  return score;
}

/** The "I want to…" window. */
export function finderModal(ui: GameUi): TemplateResult {
  const life = ui.life;
  if (!life || !ui.me)
    return html`<h2 class="cq-h1">I want to…</h2>
      <p class="cq-empty">
        You're watching: take over someone, or begin a new life.
      </p>`;
  const q = query.trim();
  const native = lifeIsNative(ui.s, life);
  const mine = GOALS.filter(
    (g) => !g.who || g.who === (native ? "native" : "colonist"),
  );
  const shown = mine
    .map((g) => ({ g, sc: matches(g, q) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => (q ? b.sc - a.sc : 0));
  const groups = q
    ? [["Best matches", shown.map((x) => x.g)] as const]
    : [...new Set(mine.map((g) => g.group))].map(
        (name) => [name, mine.filter((g) => g.group === name)] as const,
      );
  return html`<div class="cq-finder">
    <h2 class="cq-h1">I want to…</h2>
    <label class="cq-finder-search">
      ${FindIcon()}
      <input
        type="search"
        ${ref(focusOnce)}
        placeholder="buy a house, hire men, write a letter, learn Spanish…"
        aria-label="What do you want to do?"
        .value=${query}
        @input=${(e: Event) => {
          query = (e.target as HTMLInputElement).value;
          openId = "";
          ui.redraw();
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" && shown[0]) {
            openId = shown[0].g.id;
            ui.redraw();
          }
        }}
      />
    </label>
    ${shown.length
      ? html`${groups.map(
          ([name, list]) =>
            html`<section class="cq-finder-group">
              <h3 class="cq-finder-h">${name}</h3>
              <ul class="cq-finder-list">
                ${list.map((g) => goalRow(ui, g))}
              </ul>
            </section>`,
        )}`
      : html`<p class="cq-empty">
          Nothing by that name. Try other words, or
          <button
            class="cq-link"
            @click=${() => ui.modal({ k: "guide", ch: "start" })}
          >
            search the guide</button
          >.
        </p>`}
  </div>`;
}

function goalRow(ui: GameUi, g: Goal): TemplateResult {
  const open = openId === g.id;
  const needs = open && g.needs ? g.needs(ui) : [];
  const ready = needs.length > 0 && needs.every((n) => n.met);
  return html`<li class="cq-goal ${open ? "open" : ""}">
    <button
      class="cq-goal-head"
      aria-expanded=${open}
      @click=${() => {
        openId = open ? "" : g.id;
        ui.redraw();
      }}
    >
      <span class="cq-goal-title">${g.title}</span>
      <span class="cq-goal-chev" aria-hidden="true">${open ? "−" : "+"}</span>
    </button>
    ${open
      ? html`<div class="cq-goal-body">
          <p class="small">${g.where}</p>
          ${needs.length
            ? html`<ul class="cq-needs">
                ${needs.map(
                  (n) =>
                    html`<li class=${n.met ? "met" : ""}>
                      ${n.met ? "✓" : "○"} ${n.label}
                    </li>`,
                )}
              </ul>`
            : nothing}
          <div class="cq-btnrow">
            <button
              class="cq-btn small ${ready || !g.needs ? "primary" : ""}"
              @click=${() => void g.go(ui)}
            >
              ${g.goLabel ?? goLabelOf(g)}
            </button>
            <button
              class="cq-btn small quiet"
              @click=${() => ui.modal({ k: "guide", ch: g.guide })}
            >
              Read about it
            </button>
          </div>
        </div>`
      : nothing}
  </li>`;
}

/** "Take me to Estate › House & land", from where it says it's done. */
function goLabelOf(g: Goal): string {
  for (const t of TAB_BY_ID.values())
    for (const x of t.subs)
      if (g.where.startsWith(`${t.label} › ${x.label}`))
        return `Take me to ${t.label} › ${x.label}`;
  return "Take me there";
}

/** Clear the search when the window opens fresh. */
export function resetFinder(): void {
  query = "";
  openId = "";
}
