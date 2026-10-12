// LABOUR (r15): the scenes of bondage. The people held speak for themselves
// when they're heard (their names, their homes, their families, their
// faith, their wish to buy their freedom); a sale that would part a family
// is put to you first in the words of those it parts; flight, a rising, a
// freedom seeker at another player's door; and the period's own arguments,
// told plainly: the Friends of Germantown, John Woolman at your table, the
// Awakening's preachers, a neighbour who won't trade with you, the panic in
// New York, Somerset's case, Phillis Wheatley's poems, Dunmore's
// proclamation. Native enslavement is told as the world's history (Carolina's
// trade in captives before the Yamasee War): never as something to buy.
//
// Drawn events come only to households that hold (or have held) people, so
// a life with nothing to do with it draws exactly what it drew before; the
// history itself comes to every colonist as news, in the journal.
//
// Restrained and non-graphic throughout; no slurs. Cruelty is never
// rewarded: no choice here pays for harshness.

import {
  bondName,
  boundOf,
  familyAway,
  freeCost,
  heldAdults,
  ORIGIN_NAMES,
  selfPrice,
} from "./BondCore";
import { BOND_HISTORY, bondLaw, colonyOf, lawOf, type Colony } from "./BondLaw";
import { answerDoor, selfPurchase, sellPerson } from "./Bondage";
import { dateOf } from "./Calendar";
import { FAMILY_REST } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
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
import { ageOf } from "./Queries";
import type { Character, Life } from "./Types";

// ---------------------------------------------------------------- small tools

const REST = 1460;

FAMILY_REST.bond = 150;

const yr = (g: ConquestGame) => dateOf(g.s.day).year;
const mo = (g: ConquestGame) => dateOf(g.s.day).month;
const colony = (g: ConquestGame, life: Life): Colony =>
  colonyOf(g.map, life.bondage?.home ?? life.home);
const inCol = (g: ConquestGame, life: Life, ...cols: Colony[]) =>
  cols.includes(colony(g, life));

/** Someone held (or bound) in this household. */
function person(g: ConquestGame, life: Life, ctx: LCtx): Character | undefined {
  const c = g.s.chars[ctx.c];
  return c?.alive && c.bond?.seat === life.seat ? c : undefined;
}

const nm = (g: ConquestGame, ctx: LCtx) => bondName(g.s.chars[ctx.c]);
const he = (c?: Character) => (c?.female ? "she" : "he");
const He = (c?: Character) => (c?.female ? "She" : "He");
const him = (c?: Character) => (c?.female ? "her" : "him");
const his = (c?: Character) => (c?.female ? "her" : "his");
const His = (c?: Character) => (c?.female ? "Her" : "His");

/** Spirits up or down, kept between 0 and 100. */
function spirits(g: ConquestGame, c: Character | undefined, n: number): void {
  if (!c?.bond) return;
  g.touchChar(c).bond = {
    ...c.bond,
    mood: Math.max(0, Math.min(100, c.bond.mood + n)),
  };
}

/** The whole household's spirits. */
function household(g: ConquestGame, life: Life, n: number): void {
  for (const c of boundOf(g.s, life)) spirits(g, c, n);
}

/** A household that holds anyone now (the drawn scenes come only to these). */
const holds = (g: ConquestGame, life: Life) =>
  !lifeIsNative(g.s, life) && heldAdults(g.s, life).length > 0;

/** Someone in the household, chosen by the day (not the game's dice). */
function someoneHeld(
  g: ConquestGame,
  life: Life,
  pick: (c: Character) => boolean = () => true,
): Character | undefined {
  const list = heldAdults(g.s, life).filter(pick);
  return list.length ? list[(g.s.day + life.c) % list.length] : undefined;
}

const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

// ---------------------------------------------------------------- heard: their own voices

/** What each person says when heard, by what's most on their mind (Bondage.voiceTopic). */
function voiceBody(g: ConquestGame, life: Life, ctx: LCtx): string {
  const s = g.s;
  const c = person(g, life, ctx);
  if (!c) return "They've gone.";
  const m = c.bond!;
  const name = bondName(c);
  switch (ctx.t) {
    case 0:
      return `${name} has only a little English yet, and uses it to speak of home: ${ORIGIN_NAMES[m.origin].split(", ")[1] ?? "far away"}, a village with a market every fourth day, ${his(c)} mother's cooking, a river. ${He(c)} was called ${m.born ?? name} there. ${He(c)} asks you what this country is called, and whether anyone who was brought here has ever gone home.`;
    case 1:
      return `${name} has hardly spoken since ${his(c)} family was parted. ${He(c)} stands with ${his(c)} hat in ${his(c)} hands and asks one thing: where they were taken, and whether ${he(c)} may ever see them.`;
    case 2: {
      const f = familyAway(s, c)[0];
      const where = f
        ? (g.map.provinces[f.bond?.at ?? f.home ?? -1]?.name ??
          "another estate")
        : "another estate";
      return `${name}'s ${f ? (c.spouse === f.id ? (f.female ? "wife" : "husband") : c.mother === f.id ? "mother" : "family") : "family"}${f ? `, ${bondName(f)},` : ""} is held on an estate at ${where}. ${He(c)} asks for a pass to walk there on a Saturday night and come back by Monday's work, as other households allow.`;
    }
    case 3:
      return `${name} has waited for a moment alone with you. ${He(c)} asks only this: that ${his(c)} children never be sold from ${him(c)}. "Whatever else," ${he(c)} says. "Not that."`;
    case 4:
      return `${name} keeps the fast of Ramadan, and prays at dawn, facing east, before the horn for work. ${He(c)} asks for the few minutes the prayers take, and not to be given pork. ${He(c)} writes a little Arabic, ${he(c)} says, and shows you, on a shingle.`;
    case 5:
      return `${name} has saved ${Math.round(m.saved ?? 0)} coins from ${his(c)} own time, over years: Sundays, the garden, work hired out. ${He(c)} asks to buy ${his(c)} freedom at what ${he(c)}'s worth to you: ${selfPrice(s, g.map, life, c)} coins.`;
    case 6:
      return `${name} asks to be taught to read. The Bible, ${he(c)} says, or the almanac, or anything with words in it. ${He(c)} has learned some of the letters already from the children's primer, and is ashamed to have been caught at it.`;
    case 7: {
      const months = Math.max(0, Math.round(((m.until ?? s.day) - s.day) / 30));
      return `${name} counts the time left on ${his(c)} indenture: ${months} months. ${He(c)} asks whether ${he(c)} may work for wages on Saturdays, to have something saved for the day ${he(c)}'s free.`;
    }
    default:
      return `${name} tells you, when you ask, about ${his(c)} life: born ${ageOf(s, c) > 20 ? "on another estate" : "here"}, the work, ${his(c)} people. ${He(c)} tells the children's story of Anansi the spider, who won the world's stories from the sky god by his wits, and you notice it's a story about the clever and the strong.`;
  }
}

const VOICE: LifeEventDef = {
  key: "bond-voice",
  pool: "raised",
  cooldown: 0,
  scene: "fields",
  title: (g, _l, ctx) => `${nm(g, ctx)} speaks`,
  body: voiceBody,
  choices: [
    {
      label: (g, _l, ctx) =>
        ctx.t === 0
          ? "Call them by their own name"
          : ctx.t === 1
            ? "Send to ask after them, and give a pass to visit"
            : ctx.t === 2
              ? "Give passes to the whole household"
              : ctx.t === 3
                ? "Promise it: no family here will be sold apart"
                : ctx.t === 4
                  ? "Allow it"
                  : ctx.t === 5
                    ? "Agree to the price"
                    : ctx.t === 6
                      ? "Have the household taught to read"
                      : ctx.t === 7
                        ? "Agree: Saturdays are theirs to work for wages"
                        : "Listen",
      tip: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (ctx.t === 0)
          return c?.bond?.born && c.bond.born !== c.first
            ? `From now on, ${c.bond.born}.`
            : "They're called by it already.";
        if (ctx.t === 5)
          return "They pay you their savings; then the law's own fees and hurdles.";
        if (ctx.t === 6) {
          const law = bondLaw(g.s, g.map, life.bondage!.home);
          return law.reading
            ? law.writing
              ? "Reading and writing."
              : `Reading only: ${law.lettersWhy}`
            : (law.lettersWhy ?? "The law forbids it here.");
        }
        return "Their spirits rise, and they remember it.";
      },
      blocked: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return "They've gone";
        if (ctx.t === 0 && (!c.bond!.born || c.bond!.born === c.first))
          return "They're called by their own name already";
        if (ctx.t === 6 && !bondLaw(g.s, g.map, life.bondage!.home).reading)
          return "The law forbids it here";
        return null;
      },
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        const b = life.bondage!;
        switch (ctx.t) {
          case 0:
            if (c.bond!.born) {
              const old = c.first;
              g.touchChar(c).first = c.bond!.born;
              say(
                g,
                life,
                `You call ${old} by ${his(c)} own name from now on: ${c.first}. The household takes it up within the week.`,
                "good",
              );
            }
            spirits(g, c, 10);
            remembers(g, life, c, "Called me by my own name", 12, 0);
            break;
          case 1:
            spend(g, life, 1);
            g.touchChar(c).bond = {
              ...c.bond!,
              grief: Math.min(c.bond!.grief ?? 0, g.s.day + 60),
            };
            spirits(g, c, 10);
            remembers(g, life, c, "Helped me find my family", 12, 5);
            say(
              g,
              life,
              `You send to ask after ${bondName(c)}'s family, and give ${him(c)} a pass to go when they're found.`,
            );
            break;
          case 2:
            touchLife(g, life);
            b.policy = { ...b.policy, passes: true };
            spirits(g, c, 8);
            remembers(g, life, c, "Let me see my family", 10, 5);
            say(
              g,
              life,
              "Your household has passes now, to visit family on other estates.",
              "good",
            );
            break;
          case 3:
            touchLife(g, life);
            b.policy = { ...b.policy, families: true };
            household(g, life, 4);
            remembers(
              g,
              life,
              c,
              "Promised never to sell my children from me",
              15,
              0,
            );
            say(
              g,
              life,
              "You promise: no family in your household will be sold apart.",
              "good",
            );
            break;
          case 4:
            spirits(g, c, 10);
            remembers(g, life, c, "Let me keep my faith", 10, 5);
            break;
          case 5:
            selfPurchase(g, life, c);
            break;
          case 6:
            touchLife(g, life);
            b.policy = { ...b.policy, letters: true };
            spirits(g, c, 8);
            remembers(g, life, c, "Had me taught to read", 12, 0);
            say(
              g,
              life,
              "The household is to be taught its letters, as far as the law allows.",
              "good",
            );
            break;
          case 7:
            g.touchChar(c).bond = {
              ...c.bond!,
              saved: (c.bond!.saved ?? 0) + 2,
            };
            spirits(g, c, 6);
            remembers(g, life, c, "Let me work for wages", 8, 3);
            break;
          default:
            spirits(g, c, 4);
            remembers(g, life, c, "Listened to me", 5, 3);
            addStress(g, life, -1);
        }
      },
    },
    {
      label: (_g, _l, ctx) =>
        ctx.t === 5
          ? "Free them, and take none of it"
          : ctx.t === 0
            ? "Listen, and say what you can"
            : "Listen, and promise nothing",
      tip: (_g, _l, ctx) =>
        ctx.t === 5
          ? "Their savings stay theirs. You pay the law's fees."
          : "They know they were heard.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        if (ctx.t === 5) {
          const why = selfPurchase(g, life, c, true);
          if (why) say(g, life, why);
          return;
        }
        spirits(g, c, 3);
        remembers(g, life, c, "Listened to me", 4, 2);
      },
    },
    {
      label: (_g, _l, ctx) =>
        ctx.t === 5 ? "Refuse" : "Send them back to work",
      tip: (g, life, ctx) =>
        ctx.t === 5 && lawOf(g.s, life.bondage!.home).law === "spanish"
          ? "Under Spain's law (coartación) you can't refuse a fair price."
          : "Nothing given. They remember it.",
      blocked: (g, life, ctx) =>
        ctx.t === 5 && lawOf(g.s, life.bondage!.home).law === "spanish"
          ? "Spain's law gives them the right to buy their freedom at a fixed price"
          : null,
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        spirits(g, c, ctx.t === 5 ? -18 : -6);
        remembers(
          g,
          life,
          c,
          ctx.t === 5 ? "Refused to let me buy my freedom" : "Wouldn't hear me",
          ctx.t === 5 ? -30 : -8,
          5,
        );
      },
    },
  ],
};

// ---------------------------------------------------------------- a family parted

const PLEA: LifeEventDef = {
  key: "bond-plea",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: (g, _l, ctx) => `Before ${nm(g, ctx)} is sold`,
  body: (g, life, ctx) => {
    const s = g.s;
    const c = person(g, life, ctx);
    if (!c) return "They've gone.";
    const left = boundOf(s, life).filter(
      (f) =>
        f.id === c.spouse ||
        f.id === c.mother ||
        f.id === c.father ||
        c.children.includes(f.id),
    );
    const first = left[0];
    const rel = first
      ? first.id === c.spouse
        ? first.female
          ? "wife"
          : "husband"
        : c.children.includes(first.id)
          ? first.female
            ? "daughter"
            : "son"
          : first.female
            ? "mother"
            : "father"
      : "family";
    return `The household knows before you've said it aloud: the buyer's man was seen at the quarters. ${first ? `${bondName(first)}, ${bondName(c)}'s ${rel},` : "Someone"} comes to you at the door. "Sell us together," ${first ? he(first) : "they"} ${first ? "says" : "say"}, "or not at all. We'll work. We won't run. Only not apart." ${bondName(c)} says nothing at all.`;
  },
  choices: [
    {
      label: "Keep them",
      tip: "No sale. The household breathes again.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        household(g, life, 3);
        if (!c) return;
        remembers(g, life, c, "Didn't sell me away from my family", 10, 3);
        say(
          g,
          life,
          `You send the buyer's man away. ${bondName(c)} stays with ${his(c)} family.`,
        );
      },
    },
    {
      label: "Sell them together, as a family",
      tip: "A husband or wife and young children go with them.",
      blocked: (g, life, ctx) =>
        ctx.all
          ? "That's the sale already"
          : person(g, life, ctx)
            ? null
            : "They've gone",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        const why = sellPerson(g, life, c, true);
        if (why) say(g, life, why);
      },
    },
    {
      label: (g, _l, ctx) => `Sell ${nm(g, ctx)} anyway`,
      tip: "Parted for good, most likely. Grief and fear in the household; their families never forget it.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        const why = sellPerson(g, life, c, !!ctx.all);
        if (why) say(g, life, why);
      },
    },
  ],
};

// ---------------------------------------------------------------- flight

const FLED: LifeEventDef = {
  key: "bond-fled",
  pool: "raised",
  cooldown: 0,
  scene: "fields",
  title: (g, _l, ctx) => `${nm(g, ctx)} is gone`,
  body: (g, _life, ctx) => {
    const c = g.s.chars[ctx.c];
    return `In the morning ${nm(g, ctx)}'s place in the quarters is empty. ${He(c)} took a blanket and a little corn, and went in the dark. Nobody in the household saw anything, and nobody says anything, and their silence says a good deal. The law expects you to post a notice and a reward, and the patrols will be looking.`;
  },
  choices: [
    {
      label: "Post a notice and a reward, as the law expects (2 coins)",
      tip: "The patrols and the papers look for them: a worse chance they get clear.",
      apply: (g, life, ctx) => {
        const c = g.s.chars[ctx.c];
        spend(g, life, 2);
        if (c?.bond?.fled && !c.bond.fled.out)
          g.touchChar(c).bond = {
            ...c.bond,
            fled: { ...c.bond.fled, aid: (c.bond.fled.aid ?? 0) - 0.1 },
          };
      },
    },
    {
      label: "Post no notice",
      tip: "A better chance they get clear. The neighbours call you lax.",
      apply: (g, life, ctx) => {
        const c = g.s.chars[ctx.c];
        if (c?.bond?.fled && !c.bond.fled.out)
          g.touchChar(c).bond = {
            ...c.bond,
            fled: { ...c.bond.fled, aid: (c.bond.fled.aid ?? 0) + 0.1 },
          };
        addRenown(g, life, -1);
        household(g, life, 2);
      },
    },
  ],
};

/** A freedom seeker at another player's door: their choice, and their own business. */
const DOOR: LifeEventDef = {
  key: "bond-door",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: "A knock after dark",
  body: (g, _life, ctx) => {
    const c = g.s.chars[ctx.c];
    const from = g.map.provinces[c?.bond?.at ?? -1]?.name ?? "the south";
    return `A knock at the back door, long after dark. A ${c?.female ? "woman" : "man"} stands there, soaked through: ${nm(g, ctx)}, ${he(c)} says, fled from a household at ${from}, making north. ${He(c)} asks for nothing but bread, and to be pointed the right way. The law says you must send for the constable; it fines anyone who harbours someone fleeing their bondage.`;
  },
  choices: [
    {
      label: "Give bread and a blanket, and point the way north",
      tip: "They go on, with a better chance. Nobody need know.",
      apply: (g, life, ctx) => {
        const c = g.s.chars[ctx.c];
        if (c) answerDoor(g, life, c, "help");
      },
    },
    {
      label: "Hide them in the loft until it's safe",
      tip: "They're free, and stay in your town. If word gets out, the justices fine you 10 coins.",
      apply: (g, life, ctx) => {
        const c = g.s.chars[ctx.c];
        if (c) answerDoor(g, life, c, "hide");
      },
    },
    {
      label: "Send for the constable",
      tip: "The law's way: they're taken back to the household they fled.",
      apply: (g, life, ctx) => {
        const c = g.s.chars[ctx.c];
        if (c) answerDoor(g, life, c, "constable");
      },
    },
  ],
};

// ---------------------------------------------------------------- buying freedom

const BUYFREE: LifeEventDef = {
  key: "bond-buyfree",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: (g, _l, ctx) => `${nm(g, ctx)} would buy their freedom`,
  body: (g, life, ctx) => {
    const c = person(g, life, ctx);
    if (!c) return "They've gone.";
    const spanish = lawOf(g.s, life.bondage!.home).law === "spanish";
    return `${bondName(c)} comes to you with a cloth tied up in a knot: ${Math.round(c.bond!.saved ?? 0)} coins, saved over years from ${his(c)} own time. ${He(c)} asks to buy ${his(c)} freedom, at ${selfPrice(g.s, g.map, life, c)} coins. ${spanish ? "Under Spain's law and custom (coartación), the enslaved may have their price fixed and buy their freedom, and the master may not refuse." : "The law lets you agree, or not."}`;
  },
  choices: [
    {
      label: "Agree, and take the money",
      tip: "They pay their price; you pay the law's fees (and any security, or the petition).",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        const why = c ? selfPurchase(g, life, c) : "They've gone.";
        if (why) say(g, life, why);
      },
    },
    {
      label: "Free them, and let them keep their savings",
      tip: "The fees are yours; the savings are theirs, to start a free life on.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        const why = c ? selfPurchase(g, life, c, true) : "They've gone.";
        if (why) say(g, life, why);
      },
    },
    {
      label: "Refuse",
      tip: "They keep their savings, and their bondage. Spirits fall hard.",
      blocked: (g, life) =>
        lawOf(g.s, life.bondage!.home).law === "spanish"
          ? "Spain's law doesn't allow it"
          : null,
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        spirits(g, c, -20);
        remembers(g, life, c, "Refused to let me buy my freedom", -30, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------- a rising

const RISING: LifeEventDef = {
  key: "bond-rising",
  pool: "raised",
  cooldown: 0,
  scene: "fields",
  title: (_g, _l, ctx) => (ctx.k ? "After the rising" : "The plot found out"),
  body: (_g, _life, ctx) =>
    ctx.k
      ? `The barns are ash. The militia came back with what it came back with, and the county talks of nothing else. ${ctx.f ? `${ctx.f} got clear, and won't be taken now.` : "None got clear."} Those who stayed work in silence. Your neighbours want the patrols doubled and the law made harder; the minister preaches on obedience. You think about what drove them to it.`
      : "The court's sentence has been carried out. Your neighbours want the patrols doubled and the law made harder; the minister preaches on obedience. In the quarters, nobody sings any more.",
  choices: [
    {
      label:
        "Ask yourself what drove them to it, and change how the household is kept",
      tip: "Nothing is undone. But those who remain see the difference.",
      apply: (g, life) => {
        addStress(g, life, 4);
        household(g, life, 6);
        const b = life.bondage;
        if (b) {
          touchLife(g, life);
          b.policy = {
            ...b.policy,
            punish: 0,
            food: b.policy.food === 0 ? 1 : b.policy.food,
            housing: b.policy.housing === 0 ? 1 : b.policy.housing,
          };
        }
        say(
          g,
          life,
          "You change how your household is kept: no more harshness, and provisions and quarters at least as is customary.",
        );
      },
    },
    {
      label: "Join the neighbours' call for a harder law",
      tip: "Fear answered with fear. It buys you nothing.",
      apply: (g, life) => {
        household(g, life, -8);
      },
    },
    {
      label: "Say nothing",
      tip: "As you were.",
      apply: () => undefined,
    },
  ],
};

// ---------------------------------------------------------------- the period's voices (drawn)

const WOOLMAN: LifeEventDef = {
  key: "bond-woolman",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "home",
  when: (g, life) =>
    holds(g, life) &&
    yr(g) >= 1746 &&
    yr(g) <= 1772 &&
    inCol(
      g,
      life,
      "pennsylvania",
      "newjersey",
      "delaware",
      "maryland",
      "virginia",
      "northcarolina",
      "newyork",
      "rhodeisland",
      "massachusetts",
    )
      ? {}
      : null,
  title: "A Quaker tailor at your table",
  body: () =>
    "A Quaker tailor from Mount Holly, John Woolman, travelling among Friends, stays a night under your roof. He is plainly dressed, and quiet, and eats little. At breakfast he asks, very gently, whether he may pay those who served him at table; and later, walking out past the quarters, he asks whether you have ever considered how you would wish to be treated, were your places changed.",
  choices: [
    {
      label: "Hear him out, and think on it",
      tip: "It weighs on you. Those you hold notice something changed.",
      apply: (g, life) => {
        addStress(g, life, 3);
        household(g, life, 2);
        say(g, life, "Woolman went on his way at noon. What he said didn't.");
      },
    },
    {
      label: "Let him pay them, if it eases his conscience",
      tip: "A few coins from a stranger, and a little dignity.",
      apply: (g, life) => {
        household(g, life, 3);
        say(
          g,
          life,
          "He left a coin with each who served him, and thanked them by name.",
        );
      },
    },
    {
      label: "Tell him it's no business of his",
      tip: "He goes quietly. He'll pray for you, he says.",
      apply: (g, life) => {
        addStress(g, life, -1);
      },
    },
  ],
};

const GERMANTOWN: LifeEventDef = {
  key: "bond-germantown",
  pool: "any",
  weight: 2,
  cooldown: REST,
  scene: "church",
  when: (g, life) =>
    holds(g, life) &&
    yr(g) >= 1688 &&
    yr(g) <= 1692 &&
    inCol(g, life, "pennsylvania", "newjersey", "delaware")
      ? {}
      : null,
  title: "The paper from Germantown",
  body: () =>
    'At the meeting, a paper from four Friends of Germantown (Garret Hendericks, Derick op de Graeff, Francis Daniel Pastorius and Abraham op den Graef) is read out: "Is there any that would be done or handled at this manner? viz., to be sold or made a slave for all the time of his life?" Nobody can answer it, and the meeting sends it up to the Quarterly Meeting as too weighty a matter to decide here.',
  choices: [
    {
      label: "Stand up and say they're right",
      tip: "Some Friends will think better of you; your neighbours who hold people won't.",
      apply: (g, life) => {
        addRenown(g, life, 1);
        addStress(g, life, 3);
        household(g, life, 2);
      },
    },
    {
      label: "Say it's for the Yearly Meeting to decide",
      tip: "As the meeting said.",
      apply: (g, life) => addStress(g, life, 1),
    },
    {
      label: "Walk out before it's done",
      tip: "Nobody says anything. Everybody notices.",
      apply: (g, life) => addRenown(g, life, -1),
    },
  ],
};

const AWAKENING: LifeEventDef = {
  key: "bond-awakening",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "church",
  when: (g, life) =>
    holds(g, life) &&
    yr(g) >= 1740 &&
    yr(g) <= 1759 &&
    inCol(
      g,
      life,
      "virginia",
      "maryland",
      "northcarolina",
      "southcarolina",
      "georgia",
    )
      ? {}
      : null,
  title: "A preacher of the Awakening",
  body: (g, life) =>
    yr(g) >= 1748 && inCol(g, life, "virginia")
      ? "Samuel Davies, the Presbyterian minister of Hanover, writes to ask leave to teach those you hold to read their Bibles. He has spelling books and Watts's psalms from London for them, and preaches to enslaved and free alike, and has baptised many of them."
      : yr(g) >= 1755 && inCol(g, life, "northcarolina", "virginia")
        ? "Separate Baptist preachers from Sandy Creek hold meetings in the county, where the enslaved and the free worship together and call one another brother and sister. Those you hold ask leave to go."
        : "George Whitefield has preached in the county to a crowd of thousands in a field, and printed an open letter to the planters of the southern colonies: their cruelty to the enslaved, he writes, is a sin that cries to heaven. Those you hold ask to go and hear the next preacher when he comes. Some have heard already.",
  choices: [
    {
      label: "Let them go, and be taught",
      tip: "Spirits rise. Reading, where the law allows it.",
      apply: (g, life) => {
        household(g, life, 5);
        const b = life.bondage!;
        const law = bondLaw(g.s, g.map, b.home);
        touchLife(g, life);
        b.policy = {
          ...b.policy,
          church: true,
          letters: law.reading ? true : b.policy.letters,
        };
        say(
          g,
          life,
          "Those you hold go to hear the preacher, and come back singing.",
          "good",
        );
      },
    },
    {
      label: "Go yourself, and keep them home",
      tip: "He moves you. They hear about it from others.",
      apply: (g, life) => {
        addStress(g, life, -3);
        household(g, life, -3);
      },
    },
    {
      label: "Have nothing to do with enthusiasts",
      tip: "The county's gentlemen agree with you.",
      apply: (g, life) => household(g, life, -2),
    },
  ],
};

const NEIGHBOUR: LifeEventDef = {
  key: "bond-neighbour",
  pool: "any",
  weight: 1.5,
  cooldown: REST,
  scene: "market",
  when: (g, life) =>
    holds(g, life) &&
    yr(g) >= 1755 &&
    inCol(
      g,
      life,
      "pennsylvania",
      "newjersey",
      "delaware",
      "rhodeisland",
      "northcarolina",
      "newyork",
      "massachusetts",
      "maryland",
    )
      ? {}
      : null,
  title: "A Friend who won't trade with you",
  body: () =>
    "Your neighbour, a Friend, tells you courteously that she won't buy from you any more, nor sell to you: the meeting has resolved that Friends shall have no part in the keeping of people in bondage, and she can't square it with her conscience to profit by it at second hand. She says she bears you no ill will, and means it.",
  choices: [
    {
      label: "Hear her out",
      tip: "It stays with you.",
      apply: (g, life) => {
        addStress(g, life, 2);
        household(g, life, 1);
      },
    },
    {
      label: "Ask her what she'd have you do",
      tip: "Free them, she says, as the meeting's visitors have asked of Friends: and pay them for their years.",
      apply: (g, life) => {
        addStress(g, life, 3);
        say(
          g,
          life,
          '"Free them," she said, "and pay them for their years." You have no answer ready.',
        );
      },
    },
    {
      label: "Take your custom elsewhere",
      tip: "Plenty of shops.",
      apply: (g, life) => addRenown(g, life, -0.5),
    },
  ],
};

const PASSDAY: LifeEventDef = {
  key: "bond-pass",
  pool: "any",
  weight: 2,
  cooldown: REST,
  scene: "fields",
  when: (g, life) => {
    if (!holds(g, life)) return null;
    const c = someoneHeld(g, life, (x) => familyAway(g.s, x).length > 0);
    return c ? { c: c.id } : null;
  },
  title: (g, _l, ctx) => `${nm(g, ctx)} asks for leave`,
  body: (g, life, ctx) => {
    const c = person(g, life, ctx);
    const f = c ? familyAway(g.s, c)[0] : undefined;
    const rel =
      f && c
        ? c.spouse === f.id
          ? f.female
            ? "wife"
            : "husband"
          : c.mother === f.id
            ? "mother"
            : c.children.includes(f.id)
              ? f.female
                ? "daughter"
                : "son"
              : "kin"
        : "kin";
    return `Word has come that ${nm(g, ctx)}'s ${rel} lies sick at ${g.map.provinces[f?.bond?.at ?? f?.home ?? -1]?.name ?? "another estate"}. ${He(c)} asks for a pass, and a week.`;
  },
  choices: [
    {
      label: "Give a pass and a week",
      tip: "A week's work less. Gratitude more.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        spirits(g, c, 12);
        if (c) remembers(g, life, c, "Let me go to my family", 12, 5);
      },
    },
    {
      label: "Give a pass for Sunday only",
      tip: "A day's walk each way, and back by Monday's work.",
      apply: (g, life, ctx) => spirits(g, person(g, life, ctx), 4),
    },
    {
      label: "Refuse",
      tip: "They may go anyway.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        spirits(g, c, -12);
        if (c) remembers(g, life, c, "Wouldn't let me go to my family", -15, 5);
      },
    },
  ],
};

const MERIT: LifeEventDef = {
  key: "bond-fire",
  pool: "any",
  weight: 1,
  cooldown: REST,
  scene: "home",
  when: (g, life) => {
    if (!holds(g, life) || life.prov !== life.bondage!.home) return null;
    const c = someoneHeld(
      g,
      life,
      (x) => !x.bond!.merit && ageOf(g.s, x) >= 16 && ageOf(g.s, x) < 55,
    );
    return c ? { c: c.id } : null;
  },
  title: "Fire in the night",
  body: (g, life, ctx) => {
    const c = person(g, life, ctx);
    return `The kitchen chimney catches in the night and the fire runs along the roof. ${nm(g, ctx)} is first in from the quarters, and goes into the smoke for the youngest of your house, and brings ${his(c)} out wrapped in a wet blanket, and then goes back for the strongbox. The house is saved. ${His(c)} hands are burned.`;
  },
  choices: [
    {
      label: "Petition for their freedom, for this service",
      tip: "The law would call it a meritorious service: the best case anyone could make. The fees are on the page.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        g.touchChar(c).bond = {
          ...c.bond!,
          merit: "saving a child from a fire",
        };
        spirits(g, c, 8);
        remembers(g, life, c, "Owned what I did", 15, 0);
        const fc = freeCost(g.s, g.map, life);
        say(
          g,
          life,
          fc.rule.kind === "petition"
            ? `You mean to petition ${fc.rule.petition!.who} for ${bondName(c)}'s freedom, for a meritorious service: Estate › Bondage, when you're ready (${fc.fee} coins in fees).`
            : `The law here needs no petition: you may free ${bondName(c)} by deed when you're ready (Estate › Bondage).`,
          "good",
        );
      },
    },
    {
      label: "Give them 5 coins of their own",
      tip: "Theirs to keep, toward whatever they want.",
      blocked: (_g, life) => (life.purse < 5 ? "Needs 5 coins" : null),
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        spend(g, life, 5);
        g.touchChar(c).bond = {
          ...c.bond!,
          merit: "saving a child from a fire",
          saved: (c.bond!.saved ?? 0) + 5,
        };
        spirits(g, c, 8);
        remembers(g, life, c, "Rewarded me", 8, 3);
      },
    },
    {
      label: "Thank them",
      tip: "And that's all.",
      apply: (g, life, ctx) => {
        const c = person(g, life, ctx);
        if (!c) return;
        g.touchChar(c).bond = {
          ...c.bond!,
          merit: "saving a child from a fire",
        };
        spirits(g, c, 2);
      },
    },
  ],
};

const MARKET: LifeEventDef = {
  key: "bond-market",
  pool: "any",
  weight: 1,
  cooldown: REST,
  scene: "market",
  when: (g, life) =>
    holds(g, life) &&
    life.bondage!.policy.regime === "task" &&
    inCol(g, life, "southcarolina", "georgia", "islands", "jamaica")
      ? {}
      : null,
  title: "The Sunday market",
  body: (g) =>
    `On Sundays those you hold sell what they've grown and made in their own time at the town market: eggs, fowls, baskets, a little rice and corn. ${yr(g) >= 1740 && yr(g) < 1776 ? "The Negro Act of 1740 forbids it, and the assembly grumbles; everyone buys from them anyway." : "Everyone buys from them."} A neighbour asks whether you mean to let it go on.`,
  choices: [
    {
      label: "Let it go on",
      tip: "Their own money, toward their own ends.",
      apply: (g, life) => {
        household(g, life, 5);
        for (const c of heldAdults(g.s, life))
          g.touchChar(c).bond = { ...c.bond!, saved: (c.bond!.saved ?? 0) + 1 };
      },
    },
    {
      label: "Stop it",
      tip: "As the law says. They'll remember.",
      apply: (g, life) => household(g, life, -6),
    },
  ],
};

const CAPTIVES: LifeEventDef = {
  key: "bond-captives",
  pool: "any",
  weight: 2,
  cooldown: REST,
  scene: "market",
  when: (g, life) =>
    holds(g, life) &&
    yr(g) >= 1680 &&
    yr(g) <= 1715 &&
    inCol(g, life, "southcarolina", "northcarolina", "georgia")
      ? {}
      : null,
  title: "Captives brought in from the west",
  body: () =>
    "Traders come into Charles Town from the Savannah towns with Native captives taken in raids their allies were paid to make: Apalachee, Timucua, Choctaw, women and children most of them. They are to be shipped to the islands and sold, where they can't find their way home. It is the colony's richest trade after deerskins, and it is setting the whole south-east against Carolina.",
  choices: [
    {
      label: "Have nothing to do with it",
      tip: "Your hands are clean of this, at least.",
      apply: (g, life) => addStress(g, life, 2),
    },
    {
      label: "Speak against the trade",
      tip: "The traders and their friends in the assembly are powerful. Some agree with you.",
      apply: (g, life) => {
        addRenown(g, life, 1);
        touchLife(g, life).favor = Math.max(0, life.favor - 3);
        say(
          g,
          life,
          "You spoke against the trade in captives. The traders won't forget it.",
        );
      },
    },
    {
      label: "Look away",
      tip: "Everyone else does.",
      apply: () => undefined,
    },
  ],
};

const PANIC: LifeEventDef = {
  key: "bond-panic",
  pool: "any",
  weight: 4,
  cooldown: REST,
  scene: "tavern",
  when: (g, life) =>
    holds(g, life) && yr(g) === 1741 && inCol(g, life, "newyork") ? {} : null,
  title: "The fires of 1741",
  body: () =>
    "Fires all spring, the fort's chapel among them, and now the city is sure it was a plot of the enslaved and the poor. A servant girl, Mary Burton, names name after name for the reward; the gaol is full, the magistrates take confessions from men who'll say anything to live, and every household with someone held is looked at sideways. The justices want to question those in yours.",
  choices: [
    {
      label: "Stand surety for those in your household",
      tip: "You vouch for them before the justices. The city thinks you a fool, or worse.",
      apply: (g, life) => {
        touchLife(g, life).favor = Math.max(0, life.favor - 2);
        addStress(g, life, 4);
        household(g, life, 8);
        say(
          g,
          life,
          "You stood surety for your household before the justices. They were let alone.",
        );
      },
    },
    {
      label: "Let the justices question them",
      tip: "The law's way. In this year, the law's way is terrifying.",
      apply: (g, life) => {
        household(g, life, -10);
        say(
          g,
          life,
          "Your household came back from the justices silent. Nobody was named, this time.",
        );
      },
    },
  ],
};

const SOMERSET: LifeEventDef = {
  key: "bond-somerset",
  pool: "any",
  weight: 3,
  cooldown: REST,
  scene: "home",
  when: (g, life) =>
    holds(g, life) &&
    (yr(g) === 1772 ? mo(g) >= 8 : yr(g) === 1773) &&
    lawOf(g.s, life.bondage!.home).law === "english"
      ? {}
      : null,
  title: "News from London",
  body: () =>
    "The papers have Lord Mansfield's judgment in Somerset's case: a man brought from Virginia to England can't be forced out of it and back into slavery. It frees nobody in the colonies. But in the quarters it is whispered that the king has set everyone free, and only the planters are hiding it.",
  choices: [
    {
      label: "Tell them plainly what it means and what it doesn't",
      tip: "The truth. It is a bitter thing to hear.",
      apply: (g, life) => household(g, life, -3),
    },
    {
      label: "Say nothing",
      tip: "The whisper goes on.",
      apply: (g, life) => {
        for (const c of heldAdults(g.s, life)) spirits(g, c, 3);
      },
    },
  ],
};

const DUNMORE: LifeEventDef = {
  key: "bond-dunmore",
  pool: "any",
  weight: 5,
  cooldown: REST,
  scene: "home",
  when: (g, life) =>
    holds(g, life) &&
    ((yr(g) === 1775 && mo(g) >= 10) || yr(g) === 1776) &&
    inCol(g, life, "virginia", "maryland", "northcarolina")
      ? {}
      : null,
  title: "Lord Dunmore's proclamation",
  body: () =>
    "The governor, driven aboard a ship in the Chesapeake, has proclaimed freedom for the enslaved men of rebels who will come to his lines and fight for the king. Hundreds already have. Your neighbours are moving those they hold inland, away from the water.",
  choices: [
    {
      label: "Do nothing",
      tip: "Some may go.",
      apply: () => undefined,
    },
    {
      label: "Move the household inland, as the neighbours do",
      tip: "Fewer will reach the ships. It parts families from those nearby.",
      apply: (g, life) => {
        for (const c of heldAdults(g.s, life))
          g.touchChar(c).bond = {
            ...c.bond!,
            grief: g.s.day + 180,
            mood: Math.max(0, c.bond!.mood - 8),
          };
      },
    },
  ],
};

export const BOND_EVENTS: LifeEventDef[] = [
  VOICE,
  PLEA,
  FLED,
  DOOR,
  BUYFREE,
  RISING,
  WOOLMAN,
  GERMANTOWN,
  AWAKENING,
  NEIGHBOUR,
  PASSDAY,
  MERIT,
  MARKET,
  CAPTIVES,
  PANIC,
  SOMERSET,
  DUNMORE,
];

// ---------------------------------------------------------------- the history, as news

/**
 * The world's history of bondage comes to every colonist as news, in its
 * month (or January, when only the year is known), where it happened:
 * the laws, the protests, the risings and the trade in Native captives.
 */
function historyNews(g: ConquestGame, life: Life): void {
  if (lifeIsNative(g.s, life)) return;
  const d = dateOf(g.s.day);
  const col = colonyOf(g.map, life.home);
  BOND_HISTORY.forEach((e, i) => {
    if (e.year !== d.year || (e.month ?? 1) - 1 !== d.month) return;
    if (e.where !== "all" && !e.where.includes(col)) return;
    const key = `bondnews:${i}`;
    if (life.cooldowns[key]) return;
    touchLife(g, life).cooldowns[key] = g.s.day + 400;
    journal(g, life, `News: ${e.text}`, undefined, false);
  });
}

hooks.lifeMonthly.push(historyNews);
