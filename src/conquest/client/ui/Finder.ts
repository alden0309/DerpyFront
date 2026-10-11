// "I want to…" (r11 wave 2): a searchable list of the things people come to
// the game wanting to do (buy a house, find work, hire men, write a letter,
// stand for office, learn a tongue, found a colony...). Each says where it's
// done and what it takes, checks what you have against it, takes you there,
// and opens the guide's chapter about it.

import { html, nothing, TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import { BOATS } from "../../engine/Boats";
import { dateOf } from "../../engine/Calendar"; // MAP (r12)
import { knowsDen } from "../../engine/CrimeQueries";
import { followerCap, peopleOf, raiseCheck } from "../../engine/Followers";
import { foundCheck as foundColonyCheck } from "../../engine/Founding";
import {
  hasPlace,
  isChildLife,
  lifeIsNative,
  opinionOf,
  promotionView,
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
import { standCheck } from "../../engine/Politics";
import { houseCheck, housePrice, landCheck } from "../../engine/Property";
import { isHarvest } from "../../engine/Seasons"; // MAP (r12)
import type { PlaceKind } from "../../engine/Types";
import { FindIcon } from "../Icons";
import type { DrawerView, GameUi } from "./Context";
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
    const a = areas.find(
      (x) => !life.travel && hasPlace(ui.s, ui.w, life.prov, x),
    );
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
      "Estate › House & land, wherever you're settled (or at the market, a native village, or your home). The house is in the town you're in.",
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
    go: tab({ k: "tab", tab: "estate", sub: "house" }),
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
      "Their card: Insult, Spread a rumour, Challenge to a duel. Or pick a fight at the tavern.",
    go: tab({ k: "tab", tab: "people", sub: "known" }),
    guide: "people",
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
];

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
