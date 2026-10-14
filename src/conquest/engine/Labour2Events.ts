// LABOUR2 (r21): the scenes of bondage in businesses and trade. The quarters'
// word about a hard overseer; a family about to be parted at a sale of your
// house's, pleading in their own words; a rising aboard; the free tradesmen's
// complaint against enslaved men put to their trades; and the period's own
// arguments, for the trade and against it, dated and placed: Samuel Sewall's
// The Selling of Joseph (Boston, 1700), Malachy Postlethwayt's "great
// pillar" (1745), the Friends' minutes of 1758 and 1774, Henry Laurens giving
// the trade up (1763-1764), Anthony Benezet's A Caution and Warning (1766),
// Samuel Hopkins at Newport (1770s), the Virginia burgesses' address of 1772,
// Thomas Thompson's defence of the trade (1772), Benjamin Rush and Richard
// Nisbet (Philadelphia, 1773), and the Continental Association's committees
// (1774-1775).
//
// Restrained and non-graphic; no slurs. No choice pays for harshness. The
// drawn scenes come only to those with a house in the trade, an overseer,
// or people at a business, so nobody else's luck changes; each says where it
// happens (EventPlaces' tags) and rests with its family (EventPacing).

import { boundOf } from "./BondCore";
import { colonyOf, type Colony } from "./BondLaw";
import {
  closeHouse,
  houseOf,
  keepCheck,
  keepPeople,
  sellTogether,
  voyageById,
} from "./BondTrade";
import { dateOf, formatDate } from "./Calendar";
import { registerFamily } from "./EventPacing";
import { tag } from "./EventPlaces";
import type { ConquestGame } from "./Game";
import { atBusiness, leaveBusiness, overseerOf } from "./Labour2Rules";
import {
  addRenown,
  addStress,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { lifeIsNative } from "./LifeQueries";
import { SIZES, tradeName } from "./TradeCore";
import type { Life, TradePerson } from "./Types";

const REST = 1460;
const yr = (g: ConquestGame) => dateOf(g.s.day).year;
const ym = (g: ConquestGame) => yr(g) * 12 + dateOf(g.s.day).month;

const He = (c?: { female?: boolean; f?: boolean }) =>
  c && (c.female || c.f) ? "She" : "He";
const he = (c?: { female?: boolean; f?: boolean }) =>
  c && (c.female || c.f) ? "she" : "he";
const his = (c?: { female?: boolean; f?: boolean }) =>
  c && (c.female || c.f) ? "her" : "his";

/** The colonies a house's name is known in: its own, and its ports'. */
function houseCols(g: ConquestGame, life: Life): Colony[] {
  const h = houseOf(life);
  if (!h) return [];
  return [h.col as Colony, colonyOf(g.map, h.from), colonyOf(g.map, h.to)];
}

/** A house trading now (the period's voices come only to these). */
const trading = (g: ConquestGame, life: Life) =>
  !lifeIsNative(g.s, life) && !!houseOf(life);

const touches = (g: ConquestGame, life: Life, ...cols: Colony[]) =>
  houseCols(g, life).some((c) => cols.includes(c));

const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

/** Give the trade up: no more voyages, and the house wound up once nobody's at sea. */
function giveUp(g: ConquestGame, life: Life, why: string): void {
  const h = houseOf(life);
  if (!h) return;
  addStress(g, life, -2);
  closeHouse(g, life, why);
}

const GIVE_UP_TIP =
  "No more voyages; the house is wound up once nobody's at sea. A weight off you.";

/** Spirits of the household's people at home, up or down. */
function household(g: ConquestGame, life: Life, n: number): void {
  for (const c of boundOf(g.s, life))
    if (c.bond!.at === life.bondage!.home)
      g.touchChar(c).bond = {
        ...c.bond!,
        mood: Math.max(0, Math.min(100, c.bond!.mood + n)),
      };
}

// ---------------------------------------------------------------- the overseer

const OV_WORD: LifeEventDef = {
  key: "bond-ov-word",
  pool: "raised",
  cooldown: 0,
  scene: "fields",
  title: "Word from the quarters",
  body: (g, life, ctx) => {
    const c = g.s.chars[ctx.c];
    const o = overseerOf(g.s, life);
    const ov = o ? g.s.chars[o.c] : undefined;
    const name = c ? c.first : "Someone";
    const why =
      o?.pay === "share"
        ? "drives them for the crop from before light until after dark, to make his shares"
        : "is quick to strike, and nobody can do a thing right for him";
    return `${name} waits by the gate until you come out, and keeps ${his(c)} voice low. ${He(c)} speaks for the others, ${he(c)} says: your overseer${ov ? `, ${ov.first} ${ov.family},` : ""} ${why}. "We'll work," ${he(c)} says. "Not like this."`;
  },
  choices: [
    {
      label: "Order him to restraint",
      tip: "His nature only goes so far under orders: half his harshness, and half his drive.",
      apply: (g, life, ctx) => {
        const o = overseerOf(g.s, life);
        if (o) {
          touchLife(g, life);
          life.bondage!.overseer = {
            ...o,
            orders: { ...o.orders, rule: "restraint" },
          };
        }
        household(g, life, 4);
        const c = g.s.chars[ctx.c];
        if (c?.alive)
          remembers(g, life, c, "Spoke for us to the overseer", 8, 3);
        say(g, life, "You order your overseer to restraint.");
      },
    },
    {
      label: "Let him go",
      tip: "The household's work is yours to set again, until you find another.",
      apply: (g, life, ctx) => {
        const o = overseerOf(g.s, life);
        if (o) {
          touchLife(g, life);
          life.bondage!.overseer = null;
          const ov = g.s.chars[o.c];
          if (ov) remembers(g, life, ov, "Turned me off", -10, 3);
        }
        household(g, life, 6);
        const c = g.s.chars[ctx.c];
        if (c?.alive) remembers(g, life, c, "Sent the overseer away", 12, 3);
        say(g, life, "You let your overseer go.");
      },
    },
    {
      label: "Tell them his word is yours",
      tip: "Nothing changes. They remember it.",
      apply: (g, life, ctx) => {
        household(g, life, -6);
        const c = g.s.chars[ctx.c];
        if (c?.alive) remembers(g, life, c, "Wouldn't hear us", -10, 3);
      },
    },
  ],
};

const OV_GARDENS: LifeEventDef = {
  key: "bond-ov-gardens",
  pool: "any",
  weight: 1,
  cooldown: REST,
  scene: "fields",
  where: tag("land bond"),
  when: (g, life) => {
    const o = overseerOf(g.s, life);
    return o && o.manner === "fair" && boundOf(g.s, life).length >= 2
      ? {}
      : null;
  },
  title: "Gardens of their own",
  body: (g, life) => {
    const o = overseerOf(g.s, life)!;
    const ov = g.s.chars[o.c];
    return `Your overseer, ${ov?.first ?? "your overseer"}, asks leave to let the household keep gardens and a few fowls of their own, and Saturday afternoons to work them, as some estates allow. What they grow they may eat, or sell at the Sunday market, and put by.`;
  },
  choices: [
    {
      label: "Allow it",
      tip: "Spirits rise; they put a little by toward their freedom.",
      apply: (g, life) => {
        household(g, life, 4);
        for (const c of boundOf(g.s, life))
          if (c.bond!.status === "held")
            g.touchChar(c).bond = {
              ...c.bond!,
              saved: (c.bond!.saved ?? 0) + 1,
            };
        say(
          g,
          life,
          "The household has gardens of its own now, and Saturday afternoons.",
          "good",
        );
      },
    },
    {
      label: "Not now",
      tip: "As you were.",
      apply: () => undefined,
    },
  ],
};

// ---------------------------------------------------------------- at a business

const BIZ_TRADES: LifeEventDef = {
  key: "bond-biz-trades",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "tavern",
  where: tag("town"),
  when: (g, life) =>
    boundOf(g.s, life).some((c) => atBusiness(c) && c.bond!.at === life.prov)
      ? {}
      : null,
  title: "The journeymen's complaint",
  body: (g) =>
    `The town's free journeymen and labourers are getting up a petition to the assembly against masters who put enslaved men to work at their trades: it takes the bread out of free men's mouths, they say, and lowers every man's wages. (Pennsylvania's labourers petitioned so in 1721; the assembly answered that such a law would be unjust to those who owned people and hired them out.) Your name is on their list${yr(g) >= 1740 ? ", and they've had it read in the taverns" : ""}.`,
  choices: [
    {
      label: "Bring them home from the business",
      tip: "Those at your businesses come back to the household; the places go to hired hands.",
      apply: (g, life) => {
        for (const c of boundOf(g.s, life))
          if (atBusiness(c)) leaveBusiness(g, life, c);
        addRenown(g, life, 1);
        say(
          g,
          life,
          "You bring those of your household home from your businesses.",
        );
      },
    },
    {
      label:
        "Let them have something of their own: a shilling a week (2 coins)",
      tip: "A little money of their own for those at your businesses: spirits, and a little put by.",
      blocked: (_g, life) => (life.purse < 2 ? "Needs 2 coins" : null),
      apply: (g, life) => {
        spend(g, life, 2);
        for (const c of boundOf(g.s, life))
          if (atBusiness(c))
            g.touchChar(c).bond = {
              ...c.bond!,
              mood: Math.min(100, c.bond!.mood + 6),
              saved: (c.bond!.saved ?? 0) + 1,
            };
        addRenown(g, life, -1);
        say(
          g,
          life,
          "Those at your businesses have a little money of their own now. The journeymen are no happier.",
        );
      },
    },
    {
      label: "Keep them at it",
      tip: "The journeymen talk; nothing else changes.",
      apply: (g, life) => addRenown(g, life, -1),
    },
  ],
};

// ---------------------------------------------------------------- the sale: a family's plea

/** The pair a plea is about, if they're still unsold. */
function pair(
  life: Life,
  ctx: LCtx,
): { a: TradePerson; b: TradePerson } | undefined {
  const v = voyageById(life, ctx.v);
  const a = v?.people[ctx.i];
  const b = v?.people[ctx.j];
  return a && b && !a.fate && !b.fate ? { a, b } : undefined;
}

function pleaWords(a: TradePerson, b: TradePerson): string {
  const mother = a.rel === "child" ? a : b.rel === "child" ? b : undefined;
  if (mother) {
    const kid = mother === a ? b : a;
    return `${mother.n} holds ${kid.n}, who is ${kid.a}, and won't let go. "Sell us together," she says through the man who speaks her language, "or not at all."`;
  }
  if (a.rel === "wife" || a.rel === "husband") {
    const man = a.f ? b : a;
    return `${man.n} stands in front of ${man === a ? b.n : a.n}. "We are married," he says. "In our own country, and here."`;
  }
  const elder = a.a >= b.a ? a : b;
  return `${elder.n} keeps hold of ${elder === a ? b.n : a.n}'s hand. "${elder.f ? "She" : "He"} is my ${(elder === a ? b : a).f ? "sister" : "brother"}," ${elder.f ? "she" : "he"} says. It is all the English ${elder.f ? "she" : "he"} has.`;
}

const PLEA: LifeEventDef = {
  key: "bond-tr-plea",
  pool: "raised",
  cooldown: 0,
  scene: "docks",
  title: (g, life, ctx) => {
    const v = voyageById(life, ctx.v);
    return `Before the sale at ${v ? g.map.provinces[v.to].name : "the port"}`;
  },
  body: (g, life, ctx) => {
    const v = voyageById(life, ctx.v);
    const p = pair(life, ctx);
    if (!v || !p) return "The sale is over.";
    const kinWord =
      p.a.rel === "child"
        ? `her ${p.b.f ? "daughter" : "son"}`
        : p.a.rel === "mother"
          ? `his mother`
          : p.a.rel === "wife"
            ? "his wife"
            : p.a.rel === "husband"
              ? "her husband"
              : p.a.f === p.b.f
                ? p.a.f
                  ? "her sister"
                  : "his brother"
                : p.a.f
                  ? "her brother"
                  : "his sister";
    return `The factor's sale at ${g.map.provinces[v.to].name} is set for ${formatDate(v.sells ?? g.s.day)}. Among those your house brought: ${tradeName(p.a)}, ${p.a.a}, and ${kinWord}, ${tradeName(p.b)}, ${p.b.a}. ${pleaWords(p.a, p.b)} The factor writes that sold to whoever bids most, as the custom is, they'll fetch more, and that a family sold as one lot keeps some buyers away.`;
  },
  choices: [
    {
      label: "Sell every family on this voyage together, as one lot each",
      tip: "Families stay together: a little less for each, and ten days longer to sell.",
      apply: (g, life, ctx) => {
        sellTogether(g, life, ctx.v);
        say(
          g,
          life,
          "You write to the factor: the families on this voyage are to be sold together, as one lot each.",
        );
      },
    },
    {
      label: (_g, life, ctx) => {
        const p = pair(life, ctx);
        return p
          ? `Take ${p.a.n} and ${p.b.n} into your own household`
          : "Take them into your own household";
      },
      tip: (g, life, ctx) => {
        const p = pair(life, ctx);
        return p
          ? `They come to your household, together; no money changes hands, and what they'd have fetched (about ${Math.round((p.a.paid + p.b.paid) * 1.1)} coins) is forgone.`
          : "They've been sold.";
      },
      blocked: (g, life, ctx) => {
        if (!pair(life, ctx)) return "They've been sold";
        const k = keepCheck(g.s, g.map, life);
        return k.ok ? null : k.why;
      },
      apply: (g, life, ctx) => {
        const why = keepPeople(g, life, ctx.v, [ctx.i, ctx.j]);
        if (why) say(g, life, why);
      },
    },
    {
      label: "Leave it to the factor",
      tip: "Sold to whoever bids most: very likely parted.",
      apply: (g, life, ctx) => {
        const v = voyageById(life, ctx.v);
        if (v)
          v.log.push({ day: g.s.day, t: "You leave the sale to the factor." });
        addStress(g, life, 2);
      },
    },
  ],
};

// ---------------------------------------------------------------- a rising aboard

const RISING: LifeEventDef = {
  key: "bond-tr-rising",
  pool: "raised",
  cooldown: 0,
  scene: "docks",
  title: (_g, _l, ctx) => (ctx.k ? "They got away" : "The rising aboard"),
  body: (_g, _life, ctx) =>
    ctx.k
      ? `The master's letter is short. Those aboard rose before the sloop made port, overpowered the crew, and took her boat ashore by night: ${ctx.n} of them, and none was taken again. The house has lost what it paid. In the counting room someone says the trade is a lottery. Nobody answers.`
      : `The master writes that those aboard rose on the passage and the crew put it down${ctx.n ? `; ${ctx.n === 1 ? "one of them" : `${ctx.n} of them`} lost ${ctx.n === 1 ? "a life" : "their lives"} in it` : ", with nobody killed"}. The rest were landed in irons. He asks for heavier irons and a bigger crew next time, at the house's charge.`,
  choices: [
    {
      label: "Carry fewer, and keep them better",
      tip: "From the next voyage: fewer aboard, and ample provisions. Fewer deaths and fewer risings; less to sell.",
      apply: (g, life) => {
        const h = houseOf(life);
        if (!h) return;
        touchLife(g, life);
        const i = SIZES.indexOf(h.size);
        h.size = SIZES[Math.max(0, i - 1)];
        h.food = 2;
        say(
          g,
          life,
          `${h.name} will carry ${h.size} at a time from now on, with ample provisions.`,
        );
      },
    },
    {
      label: "Wind the house up",
      tip: "No more voyages, once this one's done.",
      apply: (g, life) => {
        const h = houseOf(life);
        if (!h) return;
        closeHouse(g, life, " after the rising");
      },
    },
    {
      label: "Carry on as before",
      tip: "The master's irons and crew are refused: they'd cost more and change nothing.",
      apply: () => undefined,
    },
  ],
};

// ---------------------------------------------------------------- the period's voices (drawn)

const SEWALL: LifeEventDef = {
  key: "bond-tr-sewall",
  pool: "any",
  weight: 3,
  cooldown: REST,
  scene: "tavern",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    yr(g) >= 1700 &&
    yr(g) <= 1706 &&
    touches(
      g,
      life,
      "massachusetts",
      "newhampshire",
      "maine",
      "connecticut",
      "rhodeisland",
    )
      ? {}
      : null,
  title: "The Selling of Joseph",
  body: (g) =>
    `A little sheet printed at Boston is going round the town, signed by Judge Samuel Sewall: The Selling of Joseph. It begins: "Forasmuch as Liberty is in real value next unto Life: None ought to part with it themselves, or deprive others of it, but upon most mature Consideration." Of the trade, it says that "that which God has joined together men do boldly rend asunder; men from their country, husbands from their wives, parents from their children."${yr(g) >= 1701 ? " A merchant of the town, John Saffin, has printed an answer defending it." : ""} Your house's books are on the table in front of you.`,
  choices: [
    {
      label: "Read it twice, and think on it",
      tip: "It stays with you.",
      apply: (g, life) => addStress(g, life, 2),
    },
    {
      label: "Give the trade up",
      tip: GIVE_UP_TIP,
      apply: (g, life) => giveUp(g, life, " after reading the judge's sheet"),
    },
    {
      label: "Side with those who call the judge a meddler",
      tip: "Some of the town's merchants say so too.",
      apply: () => undefined,
    },
  ],
};

const PILLAR: LifeEventDef = {
  key: "bond-tr-pillar",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "tavern",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    houseOf(life)!.law === "english" &&
    yr(g) >= 1745 &&
    yr(g) <= 1765
      ? {}
      : null,
  title: "The great pillar",
  body: () =>
    "At the merchants' table someone has a London pamphlet, Malachy Postlethwayt's The African Trade, the Great Pillar and Supporting of the British Plantation Trade in America (1745), and reads out the best of it: without the trade, no planters; without the planters, no sugar, no tobacco, no ships, no seamen and no customs. The table drinks to the trade, and looks to you, as a man in it.",
  choices: [
    {
      label: "Drink to it",
      tip: "The merchants count you one of their own.",
      apply: (g, life) => addRenown(g, life, 1),
    },
    {
      label: "Say it doesn't speak of those the ships carry",
      tip: "The table goes quiet. A few remember it, one way or the other.",
      apply: (g, life) => {
        addRenown(g, life, -1);
        addStress(g, life, -1);
      },
    },
    {
      label: "Change the subject",
      tip: "As you were.",
      apply: () => undefined,
    },
  ],
};

const FRIENDS: LifeEventDef = {
  key: "bond-tr-friends",
  pool: "any",
  weight: 2,
  cooldown: REST,
  scene: "docks",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    yr(g) >= 1758 &&
    yr(g) <= 1776 &&
    touches(
      g,
      life,
      "pennsylvania",
      "newjersey",
      "delaware",
      "rhodeisland",
      "newyork",
    )
      ? {}
      : null,
  title: "A Friend's refusal",
  body: (g) =>
    `A shipmaster of the Friends, whose sloop your factor meant to charter, sends word that he'll carry no people. ${ym(g) >= 1774 * 12 + 9 ? "Since the Yearly Meeting of 1774, Friends who buy, sell or carry anyone are disowned" : "Since the Yearly Meeting's minute of 1758, Friends who buy or sell anyone are shut out of the meeting's business"}, and he'd not be, for any freight. He adds, politely, that he will pray for you.`,
  choices: [
    {
      label: "Find another master (2 coins)",
      tip: "Another sloop, at a higher charter.",
      blocked: (_g, life) => (life.purse < 2 ? "Needs 2 coins" : null),
      apply: (g, life) => spend(g, life, 2),
    },
    {
      label: "Hear him out",
      tip: "He has a good deal to say, and says it gently. It stays with you.",
      apply: (g, life) => addStress(g, life, 2),
    },
    {
      label: "Tell him his conscience is his own affair",
      tip: "He goes quietly.",
      apply: () => undefined,
    },
  ],
};

const LAURENS: LifeEventDef = {
  key: "bond-tr-laurens",
  pool: "any",
  weight: 3,
  cooldown: REST,
  scene: "tavern",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    yr(g) >= 1763 &&
    yr(g) <= 1765 &&
    touches(g, life, "southcarolina", "georgia")
      ? {}
      : null,
  title: "A merchant gives the trade up",
  body: () =>
    "Word goes round the coffee house that Henry Laurens, of the house that was Austin & Laurens (the greatest in the trade at Charles Town, which sold more than eight thousand people in the 1750s), has given it up. He doesn't say much about why; he lets it be known he's had enough of it, and that it will cost him a great deal to stop. Some of the merchants laugh. He doesn't.",
  choices: [
    {
      label: "Ask him why",
      tip: "He tells you, more than you expected.",
      apply: (g, life) => addStress(g, life, 2),
    },
    {
      label: "Do as he did",
      tip: GIVE_UP_TIP,
      apply: (g, life) => giveUp(g, life, ", as Laurens did"),
    },
    {
      label: "Write to his correspondents for their business",
      tip: "Business is business, the town says.",
      apply: () => undefined,
    },
  ],
};

const BENEZET: LifeEventDef = {
  key: "bond-tr-benezet",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "letter",
  where: tag("land"),
  when: (g, life) =>
    trading(g, life) &&
    houseOf(life)!.law === "english" &&
    yr(g) >= 1766 &&
    yr(g) <= 1776
      ? {}
      : null,
  title: "A pamphlet from Philadelphia",
  body: () =>
    "The post brings a pamphlet with a note in a careful hand. Anthony Benezet, a Quaker schoolmaster of Philadelphia who teaches Black children free of charge, sends you his A Caution and Warning to Great Britain and Her Colonies (1766), on the state of the enslaved in the British dominions, and asks only that you read it. It is made of the traders' own accounts, the ships' own surgeons, and the islands' own laws.",
  choices: [
    {
      label: "Read it",
      tip: "It's hard to read, and harder to forget.",
      apply: (g, life) => addStress(g, life, 2),
    },
    {
      label: "Read it, and give the trade up",
      tip: GIVE_UP_TIP,
      apply: (g, life) => giveUp(g, life, " after reading Benezet"),
    },
    {
      label: "Send it back with your compliments",
      tip: "He'll write again, he says.",
      apply: () => undefined,
    },
  ],
};

const HOPKINS: LifeEventDef = {
  key: "bond-tr-hopkins",
  pool: "any",
  weight: 3,
  cooldown: REST,
  scene: "church",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    yr(g) >= 1770 &&
    yr(g) <= 1776 &&
    touches(g, life, "rhodeisland")
      ? {}
      : null,
  title: "A sermon at Newport",
  body: () =>
    "Samuel Hopkins, minister of the First Congregational Church at Newport, where so many of the trade's ships are fitted out, preaches that the trade is a sin the whole town shares in, and that no one can buy and sell his brother and call it Christian. Half the pews' fortunes came out of it. Nobody looks at anybody.",
  choices: [
    {
      label: "Stay to the end",
      tip: "It's a long sermon, and he means every word.",
      apply: (g, life) => addStress(g, life, 2),
    },
    {
      label: "Tell him after that your house will stop",
      tip: GIVE_UP_TIP,
      apply: (g, life) => giveUp(g, life, " after Hopkins's sermon"),
    },
    {
      label: "Leave before the end",
      tip: "Some notice.",
      apply: (g, life) => addRenown(g, life, -1),
    },
  ],
};

const BURGESSES: LifeEventDef = {
  key: "bond-tr-burgesses",
  pool: "any",
  weight: 3,
  cooldown: REST,
  scene: "tavern",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    yr(g) >= 1772 &&
    yr(g) <= 1773 &&
    touches(g, life, "virginia", "maryland")
      ? {}
      : null,
  title: "The burgesses' address",
  body: () =>
    'Virginia\'s House of Burgesses has sent the King an address: "The importation of slaves into the colonies from the coast of Africa hath long been considered as a trade of great inhumanity", and they beg him to let his governors assent to laws to check "so very pernicious a commerce". Many who voted for it hold more people than you do, and some fear risings more than they fear God; but the words are read out at every table, and yours.',
  choices: [
    {
      label: "Say they're right, and stop your own house's voyages",
      tip: `Some of the table agrees; some think you a fool. ${GIVE_UP_TIP}`,
      apply: (g, life) => giveUp(g, life, " after the burgesses' address"),
    },
    {
      label: "Say it's fear of risings, not conscience",
      tip: "Half true. The table laughs.",
      apply: () => undefined,
    },
    {
      label: "Say nothing",
      tip: "As you were.",
      apply: () => undefined,
    },
  ],
};

const DEFENCE: LifeEventDef = {
  key: "bond-tr-defence",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "letter",
  where: tag("land"),
  when: (g, life) =>
    trading(g, life) &&
    houseOf(life)!.law === "english" &&
    yr(g) >= 1772 &&
    yr(g) <= 1775
      ? {}
      : null,
  title: "A defence of the trade",
  body: () =>
    "Your factor sends a pamphlet from London: the Reverend Thomas Thompson, once a missionary of the Society for the Propagation of the Gospel on the Gold Coast, has printed The African Trade for Negro Slaves, Shewn to be Consistent with Principles of Humanity, and with the Laws of Revealed Religion (1772). Your factor thinks it will settle the town's doubts. Nobody you show it to seems settled.",
  choices: [
    {
      label: "Keep it in the counting room",
      tip: "It's something to point to.",
      apply: () => undefined,
    },
    {
      label: "Have it read at the coffee house",
      tip: "Those against the trade answer it; those for it never needed it.",
      apply: (g, life) => addRenown(g, life, -1),
    },
    {
      label: "Put it away unread",
      tip: "As you were.",
      apply: () => undefined,
    },
  ],
};

const RUSH: LifeEventDef = {
  key: "bond-tr-rush",
  pool: "any",
  weight: 3,
  cooldown: REST,
  scene: "tavern",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    yr(g) >= 1773 &&
    yr(g) <= 1774 &&
    touches(g, life, "pennsylvania", "newjersey", "delaware")
      ? {}
      : null,
  title: "Dr. Rush's Address",
  body: () =>
    "Benjamin Rush, a young physician of Philadelphia, has printed An Address to the Inhabitants of the British Settlements in America, upon Slave-Keeping, and asks for a duty high enough to stop the trade; a West India planter, Richard Nisbet, answers him with Slavery Not Forbidden by Scripture. The town takes sides at every table, and asks which side a man in the trade is on.",
  choices: [
    {
      label: "Side with Rush, and give the trade up",
      tip: `Your fellow merchants think it a strange thing to do. ${GIVE_UP_TIP}`,
      apply: (g, life) => giveUp(g, life, " after Rush's Address"),
    },
    {
      label: "Side with Nisbet",
      tip: "The Friends of the town mark it.",
      apply: (g, life) => addRenown(g, life, -1),
    },
    {
      label: "Keep out of it",
      tip: "As you were.",
      apply: () => undefined,
    },
  ],
};

/** The colonies that signed the Association (Georgia from mid-1775). */
const ASSOCIATION: Colony[] = [
  "maine",
  "newhampshire",
  "massachusetts",
  "rhodeisland",
  "connecticut",
  "newyork",
  "newjersey",
  "pennsylvania",
  "delaware",
  "maryland",
  "virginia",
  "northcarolina",
  "southcarolina",
  "georgia",
];

const COMMITTEE: LifeEventDef = {
  key: "bond-tr-committee",
  pool: "any",
  weight: 5,
  cooldown: REST,
  scene: "governor",
  where: tag("town"),
  when: (g, life) =>
    trading(g, life) &&
    houseOf(life)!.law === "english" &&
    ym(g) >= 1774 * 12 + 11 &&
    yr(g) <= 1776 &&
    touches(g, life, ...ASSOCIATION)
      ? {}
      : null,
  title: "The committee of inspection",
  body: () =>
    "The county's committee of inspection, chosen under the Continental Association, has an eye on every merchant. The Association's second article is read to you: \"We will neither import nor purchase any slave imported after the first day of December next; after which time, we will wholly discontinue the slave trade.\" At Norfolk the committee has named a merchant, John Brown, who brought people from Jamaica, as an enemy of American liberty, and asked everyone to break off all dealings with him.",
  choices: [
    {
      label: "Tell the committee the house will send no more voyages",
      tip: "The house stops; the committee is satisfied.",
      apply: (g, life) => {
        const h = houseOf(life);
        if (!h) return;
        touchLife(g, life);
        h.on = false;
        addRenown(g, life, 1);
        say(
          g,
          life,
          `You tell the committee ${h.name} will send no more voyages.`,
        );
      },
    },
    {
      label: "Wind the house up",
      tip: "Done with it, once nobody's at sea.",
      apply: (g, life) => {
        const h = houseOf(life);
        if (!h) return;
        closeHouse(g, life, " under the Association");
      },
    },
    {
      label: "Tell them it's no business of theirs",
      tip: "They print your name as an enemy of American liberty.",
      apply: (g, life) => {
        addRenown(g, life, -4);
        addStress(g, life, 3);
        say(
          g,
          life,
          "The committee prints your name in the gazette as an enemy of American liberty.",
          "bad",
        );
      },
    },
  ],
};

// ---------------------------------------------------------------- the list

export const LABOUR2_EVENTS: LifeEventDef[] = [
  OV_WORD,
  OV_GARDENS,
  BIZ_TRADES,
  PLEA,
  RISING,
  SEWALL,
  PILLAR,
  FRIENDS,
  LAURENS,
  BENEZET,
  HOPKINS,
  BURGESSES,
  DEFENCE,
  RUSH,
  COMMITTEE,
];

registerFamily(
  "labour2",
  [
    "bond-ov-gardens",
    "bond-biz-trades",
    "bond-tr-sewall",
    "bond-tr-pillar",
    "bond-tr-friends",
    "bond-tr-laurens",
    "bond-tr-benezet",
    "bond-tr-hopkins",
    "bond-tr-burgesses",
    "bond-tr-defence",
    "bond-tr-rush",
    "bond-tr-committee",
  ],
  200,
);
registerFamily(
  "labour2-scenes",
  ["bond-ov-word", "bond-tr-plea", "bond-tr-rising"],
  30,
);

/** Left unanswered: the overseer's restrained, a family is sold together, the house carries on. */
export function labour2Quiet(): Record<string, number> {
  return { "bond-ov-word": 0, "bond-tr-plea": 0, "bond-tr-rising": 2 };
}
