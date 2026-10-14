// SEA (r15): the scenes of the sea. On a cruise: a sail sighted (chase her
// or let her go), alongside (call on her to strike, board her, sheer off),
// a prize (send her in, take her plunder, let her go, burn her), a
// man-of-war (run, fight, strike), and the ship's own troubles (scurvy, the
// men's temper). The hurricanes: the signs a day or two ahead (ashore and
// at sea), caught at sea, and a town struck. The trades that travel: the
// voyage that comes to a merchant sailor, a whaleman, the fur brigade and a
// surveyor (go with it, or stay ashore and send word), and a whale. A ship
// fitting out (for a pirate by trade, or a seaman when privateers are
// beating for men), and the King's pardon for pirates.
//
// Every one is raised by the game (none is drawn), so none can name another
// player; the hurricanes rest with the weather at sea and the calamities
// (EventPacing.ts), so a storm isn't followed at once by a gale or a fire.

import { BOATS } from "./Boats";
import { formatDate } from "./Calendar";
import {
  boardDc,
  chaseDc,
  CRUISE,
  fightWarshipDc,
  GROUND_BY_KEY,
  hullPace,
  PREY,
  ROLE_NAMES,
  runDc,
  strikeDc,
  WARSHIP,
} from "./CruiseData";
import { wouldChase } from "./CruiseOdds";
import {
  boardNow,
  chaseNow,
  commanderSkill,
  cruiseById,
  cruiseOffers,
  deciderOf,
  describe,
  effDc,
  enemiesOf,
  handBoard,
  handFraction,
  mutinyNow,
  offerOdds,
  pardonCheck,
  pardonOpen,
  planOf,
  prizeNow,
  scurvyNow,
  signCheck,
  signOn,
  stormNow,
  takePardon,
  warshipNow,
} from "./Cruises";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  gainXp,
  hurt,
  journal,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { chanceWords, type OddsView } from "./Odds";
import {
  companyOdds,
  joinCheck,
  joinCompany,
  subById,
  subNeeded,
  subTotal,
} from "./Privateers";
import { seaChanged, seaOf } from "./SeaCore";
import { stormById, stormName } from "./Storms";
import type { Cruise, CruiseRole, Life, Voyage, VoyageKind } from "./Types";
import {
  FUR_LUCK,
  goVoyage,
  layOf,
  SEND_SHARE,
  stakeFor,
  stayVoyage,
  SURVEY_FEE,
  VOYAGE_DEFS,
  voyageOdds,
  voyageStorm,
  whaleNow,
} from "./Voyages";

const r1 = (v: number) => Math.round(v * 10) / 10;
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------------------------------------------------------------- helpers

/** The cruise of a scene, if this life is still aboard her. */
function cruiseOf(g: ConquestGame, life: Life, ctx: LCtx): Cruise | undefined {
  const cr = cruiseById(g.s, ctx.cr);
  return cr && cr.hands.some((h) => h.seat === life.seat && h.c === life.c)
    ? cr
    : undefined;
}

/** The matter still before her at this stage, or a reason it's gone. */
function past(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  stage: string,
): string | null {
  const cr = cruiseOf(g, life, ctx);
  return cr?.encounter?.stage === stage ? null : "That's past";
}

/** Who gives the order: you (her captain), or the captain you advise. */
function orders(g: ConquestGame, life: Life, cr: Cruise): string {
  const h = cr.hands.find((x) => x.seat === life.seat);
  if (h?.role === "captain") return "Your orders, Captain?";
  return `${cap(cr.cname)} has the command, and asks what you'd do: your word carries with him, but the odds are his.`;
}

/** Her pace against ours, in words. */
function paceWords(theirs: number, ours: number): string {
  const d = theirs - ours;
  if (d > 0.15)
    return "She has the legs of us: a long chase, and likely a lost one";
  if (d > 0.02) return "She's a shade quicker than we are";
  if (d > -0.1) return "She sails much as we do";
  return "She's a slug: we'll be up with her by noon";
}

/** A pace for an encounter's kind. */
function preySpeed(kind: string): number {
  return PREY.find((k) => k.kind === kind)?.speed ?? 1;
}

/** Our pace now. */
function ours(cr: Cruise): number {
  return hullPace(BOATS[cr.kind].speed, cr.hull);
}

/** A life's part of a prize of this value, as the articles have it (after the court's fees or the fence). */
function myShare(
  g: ConquestGame,
  life: Life,
  cr: Cruise,
  value: number,
): number {
  const h = cr.hands.find((x) => x.seat === life.seat && x.c === life.c);
  if (!h) return 0;
  return r1(value * handFraction(g.s, g.map, cr, h));
}

/** An odds view as lines of a scene: each outcome with its chance, what's expected, the dangers. */
export function oddsText(v: OddsView): string {
  const out: string[] = [];
  for (const o of v.outcomes) {
    const amt =
      o.lo === o.hi
        ? o.lo
          ? ` ${o.lo} coins`
          : ""
        : ` ${o.lo} to ${o.hi} coins`;
    out.push(`· ${cap(chanceWords(o.p))}: ${o.label}${amt ? `,${amt}` : ""}.`);
  }
  out.push(
    `Expected: about ${r1(v.expected)} coins${v.days ? ` over ${v.days[0]} to ${v.days[1]} days` : ""}${v.costNow ? `, for ${v.costNow} put in` : ""}.`,
  );
  for (const r of v.risks)
    if (r.p > 0)
      out.push(
        `· Risk, ${chanceWords(r.p)}: ${r.label.toLowerCase()}${r.note ? ` (${r.note})` : ""}.`,
      );
  return out.join("\n");
}

// ---------------------------------------------------------------- the hunt

const HUNT = (): LifeEventDef[] => [
  {
    key: "sea-sail",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "Sail ho!",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      const e = cr?.encounter;
      if (!cr || !e) return "The sail is gone over the horizon.";
      const where = GROUND_BY_KEY.get(cr.ground)?.name ?? "the ground";
      const galleon =
        e.kind === "galleon"
          ? " A galleon: deep-laden, slow, and with tiers of guns. Treasure, if she can be taken."
          : "";
      return `"Sail ho!" From the masthead, hull up to leeward ${where}: ${describe(g.s, e)}. ${paceWords(preySpeed(e.kind), ours(cr))}.${galleon} She's lawful prize${cr.flag === "pirate" ? " (to a pirate, everything is)" : " under your commission"}.\n${orders(g, life, cr)}`;
    },
    choices: [
      {
        label: "Give chase",
        tip: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          return cr
            ? `Crowd on sail and run her down: seamanship against her pace (${r1(preySpeed(cr.encounter?.kind ?? "sloop"))} to our ${r1(ours(cr))}). Come up with her, and she's alongside.`
            : "She's gone.";
        },
        check: {
          skill: "seamanship",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            if (!cr?.encounter) return 7;
            return effDc(
              g.s,
              cr,
              life,
              "seamanship",
              chaseDc(preySpeed(cr.encounter.kind), ours(cr)),
            );
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "sighted"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) chaseNow(g, cr, true, pass);
        },
      },
      {
        label: "Let her go",
        tip: "Not worth the chase: keep the lookout for a better.",
        blocked: (g, life, ctx) => past(g, life, ctx, "sighted"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) chaseNow(g, cr, false, false);
        },
      },
    ],
  },
  {
    key: "sea-sail-let",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "A sail you oughtn't take",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      const e = cr?.encounter;
      if (!cr || !e) return "The sail is gone over the horizon.";
      const lawful =
        cr.flag === "pirate" || enemiesOf(g.s, cr.nation).has(e.flag);
      const why = !lawful
        ? `Your commission covers only the enemy's ships: take her, and every man aboard is a pirate in the law's eyes, the commission no shield and the prizes forfeit.`
        : `A galleon of ${e.guns} guns against your ${cr.guns}: the master shakes his head. "She'd blow us out of the water before we were near enough to board."`;
      return `"Sail ho!" ${cap(describe(g.s, e))}. ${why}\n${orders(g, life, cr)}`;
    },
    choices: [
      {
        label: "Let her go by",
        tip: "Dip your colours to her, and keep the lookout.",
        blocked: (g, life, ctx) => past(g, life, ctx, "sighted"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) chaseNow(g, cr, false, false);
        },
      },
      {
        label: "Chase her anyway",
        tip: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          const e = cr?.encounter;
          if (!cr || !e) return "She's gone.";
          return cr.flag === "privateer" &&
            !enemiesOf(g.s, cr.nation).has(e.flag)
            ? "Piracy, if you take her: the law's heat, and a rope at the end of it."
            : "A long chase and a bloody boarding, against her guns.";
        },
        check: {
          skill: "seamanship",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            if (!cr?.encounter) return 7;
            return effDc(
              g.s,
              cr,
              life,
              "seamanship",
              chaseDc(preySpeed(cr.encounter.kind), ours(cr)),
            );
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "sighted"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) chaseNow(g, cr, true, pass);
        },
      },
    ],
  },
  {
    key: "sea-board",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "Alongside",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      const e = cr?.encounter;
      if (!cr || !e) return "She's gone.";
      const flag =
        cr.flag === "pirate"
          ? "The black flag goes up, and the men howl and beat on the rail."
          : `Your colours go up, ${g.s.nations[cr.nation]?.adjective ?? ""}, with the commission's pennant.`;
      return `You're up with ${describe(g.s, e)}, within pistol shot. ${flag} Her people crowd her rail; ${e.guns ? `her ${e.guns} gun${e.guns === 1 ? "'s" : "s are"} run out` : "she has no guns to speak of"}.\n${orders(g, life, cr)}`;
    },
    choices: [
      {
        label: "Call on her to strike",
        tip: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          const e = cr?.encounter;
          if (!cr || !e) return "";
          const board = Math.round(
            100 *
              Math.max(
                0.08,
                Math.min(
                  0.95,
                  0.6 +
                    (commanderSkill(g.s, cr, "fighting") -
                      boardDc(e.guns, cr.guns)) *
                      0.07,
                ),
              ),
          );
          return `A shot across her bows and a hail: leadership, against her guns and her nerve. If she won't strike, you board her (fighting, ${board}%).`;
        },
        check: {
          skill: "leadership",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            if (!cr?.encounter) return 7;
            return effDc(
              g.s,
              cr,
              life,
              "leadership",
              strikeDc(cr.encounter.guns, cr.flag),
            );
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "alongside"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) boardNow(g, cr, "strike", pass);
        },
      },
      {
        label: "Board her",
        tip: "Grapnels and cutlasses, at once: fighting, against her guns and her people. Wounds are likely.",
        check: {
          skill: "fighting",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            if (!cr?.encounter) return 7;
            return effDc(
              g.s,
              cr,
              life,
              "fighting",
              boardDc(cr.encounter.guns, cr.guns),
            );
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "alongside"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) boardNow(g, cr, "board", pass);
        },
      },
      {
        label: "Sheer off",
        tip: "She looks too dangerous. Let her go.",
        blocked: (g, life, ctx) => past(g, life, ctx, "alongside"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) boardNow(g, cr, "sheer", false);
        },
      },
    ],
  },
  {
    key: "sea-board-hand",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "Boarders away!",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      const e = cr?.encounter;
      if (!cr || !e) return "She's gone.";
      return `The ${cr.ship} runs up alongside ${describe(g.s, e)}, and ${cap(cr.cname)} hails her to strike. A musket shot answers, then ${e.guns ? "her guns" : "a ragged volley"}. Grapnels fly; the hulls grind together. "Boarders away!"
The boarding goes as the captain's men can carry it. Your own part in it is yours.`;
    },
    choices: [
      {
        label: "Go over with the rest",
        tip: "Cutlass in hand, in the press of men: a hand's share of the danger.",
        blocked: (g, life, ctx) => past(g, life, ctx, "alongside"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) handBoard(g, cr, life, "with", true);
        },
      },
      {
        label: "Be first over the rail",
        tip: "Fighting: win your fight and the men follow you (renown, and a better chance of carrying her). Lose it, and you're likely hurt.",
        check: {
          skill: "fighting",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            return cr?.encounter ? boardDc(cr.encounter.guns, cr.guns) + 1 : 7;
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "alongside"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) handBoard(g, cr, life, "first", pass);
        },
      },
      {
        label: "Hang back",
        tip: "Stay by the rail with a pistol. No wound; the men will remember.",
        blocked: (g, life, ctx) => past(g, life, ctx, "alongside"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) handBoard(g, cr, life, "back", true);
        },
      },
    ],
  },
  {
    key: "sea-prize",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "A prize!",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      const e = cr?.encounter;
      if (!cr || !e) return "She's been seen to.";
      const war = enemiesOf(g.s, cr.nation).size > 0;
      const retake = war ? CRUISE.retakeWar : CRUISE.retake;
      const sale =
        cr.flag === "pirate"
          ? "a fence takes her (best at a pirates' haven)"
          : `the prize court condemns her (its fees and the Crown's part are ${Math.round(CRUISE.court * 100)} in a hundred; half the rest to her owners)`;
      return `${cap(describe(g.s, e))} is yours. Her master hands over his papers; her cargo and hull should fetch about ${e.value} coins once ${sale}. Your part of that, by the articles: about ${myShare(g, life, cr, e.value)} coins.\nA prize crew takes her in to port (${chanceWords(retake)} that she's retaken on the way). Or carry off what's worth taking, and let her go.\n${orders(g, life, cr)}`;
    },
    choices: [
      {
        label: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          const v = cr?.encounter?.value ?? 0;
          return cr
            ? `Send her in with a prize crew (≈ ${myShare(g, life, cr, v)} to you)`
            : "Send her in with a prize crew";
        },
        tip: "Her whole worth, sold at home: but she may be retaken on the way, and the prize crew thins your company.",
        blocked: (g, life, ctx) => past(g, life, ctx, "taken"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) prizeNow(g, cr, "send");
        },
      },
      {
        label: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          const v = Math.round((cr?.encounter?.value ?? 0) * CRUISE.plunder);
          return cr
            ? `Take what's worth carrying (≈ ${myShare(g, life, cr, v)} to you)`
            : "Take what's worth carrying";
        },
        tip: `About ${Math.round(CRUISE.plunder * 100)} in a hundred of her worth (the coin, the silver, the best of the cargo), carried aboard: sure, unless your own ship is taken.`,
        blocked: (g, life, ctx) => past(g, life, ctx, "taken"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) prizeNow(g, cr, "plunder");
        },
      },
      {
        label: "Let her go, her people unharmed",
        tip: "A name for decency: renown. Nothing for the purse.",
        blocked: (g, life, ctx) => past(g, life, ctx, "taken"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) prizeNow(g, cr, "free");
        },
      },
      {
        label: "Burn her",
        tip: "So she can't carry word of you. Her people are put in the boats. A pirate's name grows.",
        blocked: (g, life, ctx) => past(g, life, ctx, "taken"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) prizeNow(g, cr, "burn");
        },
      },
    ],
  },
  {
    key: "sea-warship",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "A man-of-war!",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      const e = cr?.encounter;
      if (!cr || !e) return "She's gone.";
      const doom =
        cr.flag === "pirate"
          ? "If she takes you, it's irons, a trial for piracy, and the rope."
          : "If she takes you, it's a prison hulk till you're exchanged, and your ship and prizes lost.";
      return `Topsails on the horizon, then a hull with two rows of ports: ${e.name}, ${WARSHIP.guns} guns, and coming down on you under all sail. ${doom}\n${orders(g, life, cr)}`;
    },
    choices: [
      {
        label: "Crowd on sail and run",
        tip: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          return cr
            ? `Seamanship: her pace ${WARSHIP.speed} to our ${r1(ours(cr))}. Night's your friend.`
            : "";
        },
        check: {
          skill: "seamanship",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            return cr ? effDc(g.s, cr, life, "seamanship", runDc(ours(cr))) : 8;
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "warship"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) warshipNow(g, cr, "run", pass);
        },
      },
      {
        label: "Fight her",
        tip: "Fighting, against a broadside. It hardly ever goes well.",
        check: {
          skill: "fighting",
          dc: (g, life, ctx) => {
            const cr = cruiseOf(g, life, ctx);
            return cr
              ? effDc(g.s, cr, life, "fighting", fightWarshipDc(cr.guns))
              : 12;
          },
        },
        blocked: (g, life, ctx) => past(g, life, ctx, "warship"),
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) warshipNow(g, cr, "fight", pass);
        },
      },
      {
        label: "Strike your colours",
        tip: "Give up without a fight: nobody hurt, and the cruise over.",
        blocked: (g, life, ctx) => past(g, life, ctx, "warship"),
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) warshipNow(g, cr, "strike", false);
        },
      },
    ],
  },
  {
    key: "sea-scurvy",
    pool: "raised",
    cooldown: 30,
    scene: "deck",
    title: "Scurvy",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      return `${cr ? `Weeks at sea on salt beef and biscuit, and the ${cr.ship}'s men` : "The men"} are going down with it: gums swollen and bleeding, old wounds opening, a weariness nobody can shake. The surgeon says limes and fresh water, and soon.`;
    },
    choices: [
      {
        label: "Put in for limes and water",
        tip: "Six days of the cruise lost at a quiet bay; the men mend.",
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) scurvyNow(g, cr, "limes");
        },
      },
      {
        label: "Press on",
        tip: "Keep the ground: men will die of it, the rest grow sullen, and you may sicken too.",
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) scurvyNow(g, cr, "press");
        },
      },
    ],
  },
  {
    key: "sea-mutiny",
    pool: "raised",
    cooldown: 30,
    scene: "deck",
    title: "Mutterings before the mast",
    body: (g, life, ctx) => {
      const cr = cruiseOf(g, life, ctx);
      return `${cr ? `${cr.idle} days without a prize, and the ${cr.ship}'s` : "The"} men are talking in knots that break up when an officer comes near. The articles promised shares, and there's been nothing to share. Somebody has been at the rum. Somebody else has been sharpening a cutlass he has no call to.`;
    },
    choices: [
      {
        label: "Promise them the next prize, doubled",
        tip: "Leadership: talk them round on the quarterdeck.",
        check: { skill: "leadership", dc: 8 },
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) mutinyNow(g, cr, "promise", pass);
        },
      },
      {
        label: "Seize the ringleaders",
        tip: "Fighting: irons for the worst of them. Fail, and they rise.",
        check: { skill: "fighting", dc: 9 },
        apply: (g, life, ctx, pass) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) mutinyNow(g, cr, "seize", pass);
        },
      },
      {
        label: "Put about for home",
        tip: "Give the men what they want: the cruise ends early.",
        apply: (g, life, ctx) => {
          const cr = cruiseOf(g, life, ctx);
          if (cr) mutinyNow(g, cr, "home", true);
        },
      },
    ],
  },
];

// ---------------------------------------------------------------- the hurricanes

/** A storm's name for a scene, "the San Mateo hurricane", or "a hurricane". */
function sname(g: ConquestGame, ctx: LCtx): string {
  const st = stormById(g.s, ctx.st);
  return st ? stormName(st) : "a hurricane";
}

/** Made ready against a storm: hauled up and shuttered, or in harbour (Storms.ts reads it). */
function ready(g: ConquestGame, life: Life, ctx: LCtx): void {
  touchLife(g, life).cooldowns[`storm:${ctx.st}`] = 1;
}

const STORMS = (): LifeEventDef[] => [
  {
    key: "sea-storm-signs",
    pool: "raised",
    cooldown: 20,
    scene: "docks",
    title: "A falling glass",
    body: (g, life, ctx) => {
      const boats = (life.boats ?? []).filter(
        (b) => b.prov === life.prov,
      ).length;
      return `A long, heavy swell is running in from the south-east though there's hardly a breath of wind. The glass in the customs house has been falling since morning, and the sky at sunset was red as a forge. The old hands say it plainly: a hurricane, ${ctx.d <= 1 ? "by tomorrow" : `in ${ctx.d} days or so`}.${boats ? ` You have ${boats === 1 ? "a boat" : `${boats} boats`} in the harbour.` : ""}`;
    },
    choices: [
      {
        label: (_g, life) => {
          const n = (life.boats ?? []).filter(
            (b) => b.prov === life.prov,
          ).length;
          return n
            ? `Batten down, and haul up your boats (${n} coins)`
            : "Batten down: shutters up, the stores carried up";
        },
        tip: "Made ready, the storm does much less harm to your house and boats here.",
        blocked: (_g, life) => {
          const n = (life.boats ?? []).filter(
            (b) => b.prov === life.prov,
          ).length;
          return life.purse < n ? `Needs ${n} coins` : null;
        },
        apply: (g, life, ctx) => {
          const n = (life.boats ?? []).filter(
            (b) => b.prov === life.prov,
          ).length;
          if (n) spend(g, life, n);
          ready(g, life, ctx);
          journal(
            g,
            life,
            `You batten down against ${sname(g, ctx)}${n ? ", and pay men to haul your boats up the beach and double their moorings" : ""}.`,
          );
        },
      },
      {
        label: "Pay it no mind",
        tip: "Old men's weather-lore. Perhaps it'll pass to seaward.",
        apply: (g, life) =>
          journal(g, life, "You pay the old hands' talk no mind."),
      },
    ],
  },
  {
    key: "sea-storm-signs-ship",
    pool: "raised",
    cooldown: 20,
    scene: "deck",
    title: "Signs of a hurricane",
    body: (_g, _life, ctx) =>
      `The swell has been building all day from the south-east though the wind's light and fitful. The glass is falling, the sky at dawn was a sick, coppery red, and the seabirds are flying low for the land. The master doesn't need telling: a hurricane, ${ctx.d <= 1 ? "by tomorrow" : `in ${ctx.d} days or so`}.`,
    choices: [
      {
        label: "Run for the nearest harbour",
        tip: "Two or three days lost, and lie snug at anchor while it passes.",
        apply: (g, life, ctx) => {
          ready(g, life, ctx);
          const s = g.s;
          const cr = cruiseById(s, life.travel?.ship ?? -1);
          const v = seaOf(s).voyages.find((x) => x.id === life.travel?.ship);
          if (cr?.way) {
            cr.way.arrive += 2;
            cr.until = Math.max(s.day, cr.until - 2);
            seaChanged(g);
          } else if (v?.way) {
            v.way.arrive += 2;
            seaChanged(g);
          } else if (life.travel) {
            touchLife(g, life);
            life.travel.arrive += 2;
          }
          journal(g, life, `You run for shelter ahead of ${sname(g, ctx)}.`);
        },
      },
      {
        label: "Stand on, and trust to her",
        tip: "Keep your course and your days. If it finds you, it finds you.",
        apply: (g, life) =>
          journal(g, life, "You stand on, and keep a weather eye."),
      },
    ],
  },
  {
    key: "sea-storm-ship",
    pool: "raised",
    cooldown: 20,
    scene: "storm",
    title: (g, _l, ctx) => cap(sname(g, ctx)),
    body: (g, _life, ctx) =>
      `It comes on at dusk: the wind backing and rising to a scream, rain flying flat, seas like hills with their tops torn off. ${cap(sname(g, ctx))} has you${ctx.f >= 3.5 ? ", and it's one of the great ones" : ""}. The ship labours, and every timber in her is talking.`,
    choices: [
      {
        label: "Run before it",
        tip: "Seamanship: under bare poles, fast and wild. Broach, and she's on her beam ends.",
        check: {
          skill: "seamanship",
          dc: (_g, _l, ctx) => Math.round(6 + ctx.f),
        },
        apply: (g, life, ctx, pass) => stormAtSea(g, life, ctx, "run", pass),
      },
      {
        label: "Heave to and ride it out",
        tip: "Seamanship: slower, steadier; a few days lost.",
        check: {
          skill: "seamanship",
          dc: (_g, _l, ctx) => Math.round(4 + ctx.f),
        },
        apply: (g, life, ctx, pass) => stormAtSea(g, life, ctx, "heave", pass),
      },
    ],
  },
  {
    key: "sea-storm-town",
    pool: "raised",
    cooldown: 60,
    scene: "docks",
    title: (g, _l, ctx) => `${cap(sname(g, ctx))} strikes`,
    body: (g, life, ctx) =>
      `By midnight the wind is screaming, the sea is in the lower streets, and roofs are going like playing cards. ${cap(sname(g, ctx))} has ${g.map.provinces[life.prov].name} by the throat${ctx.f >= 3.5 ? ": the worst anyone living remembers" : ""}. Down at the harbour the ships are dragging their anchors.`,
    choices: [
      {
        label: "Shelter in the church",
        tip: "Safe, mostly. A frightening night.",
        apply: (g, life, ctx) => {
          addStress(g, life, Math.round(6 + ctx.f * 2));
          journal(
            g,
            life,
            "You sat the night out in the church with half the town, praying and listening to the roof.",
          );
        },
      },
      {
        label: "Help at the harbour",
        tip: "Seamanship: save the boats and the people in them. Renown, and salvage, if it goes well; the sea, if it doesn't.",
        check: {
          skill: "seamanship",
          dc: (_g, _l, ctx) => Math.round(5 + ctx.f),
        },
        apply: (g, life, ctx, pass) => {
          gainXp(g, life, "seamanship", 10);
          if (pass) {
            addRenown(g, life, 2);
            journal(
              g,
              life,
              "You were in the water half the night with a rope round your waist. Two boats saved, and a family out of a sinking one. The town knows your name.",
              "good",
            );
          } else {
            hurt(g, life, Math.round(8 + ctx.f * 3), "a hurricane");
            journal(
              g,
              life,
              "A sea took your feet from under you on the quay and threw you against a bollard.",
              "bad",
            );
          }
        },
      },
      {
        label: "Board up your own house",
        tip: "Craft: save what you can of your own. Fail, and the repairs cost you.",
        check: { skill: "craft", dc: (_g, _l, ctx) => Math.round(3 + ctx.f) },
        apply: (g, life, ctx, pass) => {
          if (pass)
            journal(
              g,
              life,
              "Shutters nailed, the stores up in the loft: you came through with a few slates gone.",
              "good",
            );
          else {
            const cost = Math.min(
              Math.max(0, life.purse),
              Math.round(2 + ctx.f * 2),
            );
            if (cost) spend(g, life, cost);
            journal(
              g,
              life,
              `The wind had the roof off over your head. Repairs: ${cost} coins.`,
              "bad",
            );
          }
        },
      },
    ],
  },
];

/** A hurricane at sea: the ship's way (a cruise or a voyage), or a passage's (the old scene's effects). */
function stormAtSea(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  how: "run" | "heave",
  pass: boolean,
): void {
  const cr = ctx.cr !== undefined ? cruiseOf(g, life, ctx) : undefined;
  if (cr) {
    stormNow(g, cr, ctx.f, how, pass);
    return;
  }
  const v = seaOf(g.s).voyages.find(
    (x) => x.id === ctx.v && x.seat === life.seat,
  );
  if (v) {
    voyageStorm(g, life, v, ctx.f, how, pass);
    journal(
      g,
      life,
      pass
        ? `The ${v.ship} came through ${sname(g, ctx)}, battered but whole.`
        : `${cap(sname(g, ctx))} mauled the ${v.ship}: spars gone, the pumps going day and night, and you hurt.`,
      pass ? "good" : "bad",
    );
  }
}

// ---------------------------------------------------------------- the trades that travel

/** A voyage's offer: its text, its odds going and staying. */
function voyageBody(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  kind: VoyageKind,
): string {
  const to = g.map.provinces[ctx.to]?.name ?? "far off";
  const go = voyageOdds(g.s, g.w, life, kind, ctx.to, true);
  // EVENTS (r21): one plain paragraph (it used to say the same thing twice),
  // then the odds of going.
  const head =
    kind === "merchant"
      ? `The ship you serve in is loading for ${to}. You can go with her (with a small venture of your own, as a sailor may), see the port, and come home in her; or stay ashore and work the quay at your wage.`
      : kind === "whaling"
        ? `A whaler is fitting out for the grounds off ${to} and wants hands. Whalemen get no wages: each has a "lay", a share of the oil by his rank. Or stay ashore and work alongshore.`
        : kind === "furs"
          ? `The canoe brigade is loading for the posts at ${to}: trade goods up the rivers, furs back. Go with it, or send your goods with it and take a smaller part of what they fetch.`
          : `A patent near ${to} needs its lines run with chain and compass, for a fee. Run them yourself, or send your deputy for half the fee.`;
  return `${head}\nIf you go (${go.days?.[0] ?? "?"} to ${go.days?.[1] ?? "?"} days, there and back):\n${oddsText(go)}`;
}

function voyageDef(kind: VoyageKind): LifeEventDef {
  const def = VOYAGE_DEFS[kind];
  const choices: LifeEventDef["choices"] = [];
  const seagoing = kind === "merchant" || kind === "whaling";
  if (kind === "merchant" || kind === "furs")
    choices.push({
      label: (_g, life) =>
        `${kind === "furs" ? "Go with the brigade, with trade goods" : "Go aboard, with a venture"} (${stakeFor(life, kind)} coins)`,
      tip: (g, life, ctx) => {
        const o = voyageOdds(g.s, g.w, life, kind, ctx.to, true);
        return `Your ${kind === "furs" ? "goods" : "venture"} comes home with you: about ${o.expected} back for ${o.costNow}. You travel with it, on the map.`;
      },
      blocked: (_g, life) => {
        const n = stakeFor(life, kind);
        return !n
          ? "Your rank allows no venture"
          : life.purse < n
            ? `Needs ${n} coins`
            : null;
      },
      apply: (g, life, ctx) => {
        const err = goVoyage(g, life, kind, ctx.to, true);
        if (err) journal(g, life, err, "bad");
      },
    });
  choices.push({
    label:
      kind === "merchant"
        ? "Go aboard"
        : kind === "whaling"
          ? (_g, life) =>
              `Ship for the season (a 1/${Math.round(1 / layOf(life))} lay)`
          : kind === "furs"
            ? "Go with the brigade"
            : "Run the lines yourself",
    tip:
      kind === "merchant"
        ? "See the far port, and come home with her: your wage as ever."
        : kind === "whaling"
          ? "A season on the grounds, paid by your lay of the catch."
          : kind === "furs"
            ? "Up the rivers to the posts and back: the woods' skill and the trade's."
            : (_g, life) =>
                `The whole fee (${SURVEY_FEE[Math.min(life.job?.rank ?? 0, SURVEY_FEE.length - 1)]} coins), renown with the gentry, and the woods' skill.`,
    apply: (g, life, ctx) => {
      const err = goVoyage(g, life, kind, ctx.to, false);
      if (err) journal(g, life, err, "bad");
    },
  });
  if (kind === "furs")
    choices.push({
      label: (_g, life) =>
        `Send your goods with it (${stakeFor(life, kind)} coins)`,
      tip: (_g, life) => {
        const n = stakeFor(life, kind);
        const back = r1(
          FUR_LUCK.reduce((m, l) => m + l.p * l.x, 0) * n * SEND_SHARE,
        );
        return `Stay at home: the brigade's master trades them for you and takes his cut (you get ${Math.round(SEND_SHARE * 100)} in a hundred of what they fetch): about ${back} back, in two months.`;
      },
      blocked: (_g, life) => {
        const n = stakeFor(life, kind);
        return !n
          ? "Your rank allows no goods of your own"
          : life.purse < n
            ? `Needs ${n} coins`
            : null;
      },
      apply: (g, life) => {
        const err = stayVoyage(g, life, kind, true);
        if (err) journal(g, life, err, "bad");
      },
    });
  if (kind === "survey")
    choices.push({
      label: (_g, life) =>
        `Send your deputy (+${SURVEY_FEE[Math.min(life.job?.rank ?? 0, SURVEY_FEE.length - 1)] / 2} coins)`,
      tip: "Stay at your desk: your deputy runs the lines, and you take half the fee now.",
      apply: (g, life) => {
        stayVoyage(g, life, kind, true);
      },
    });
  choices.push({
    label: seagoing ? "Stay ashore" : "Stay at home",
    tip: seagoing
      ? "Work the quay at your wage this time."
      : "The next one will do.",
    apply: (g, life) => {
      stayVoyage(g, life, kind, false);
    },
  });
  return {
    key: `sea-voyage-${kind}`,
    pool: "raised",
    cooldown: 0,
    scene: seagoing ? "docks" : "woods",
    title: (g, _l, ctx) =>
      `${def.name} to ${g.map.provinces[ctx.to]?.name ?? "far off"}`,
    body: (g, life, ctx) => voyageBody(g, life, ctx, kind),
    choices,
  };
}

const VOYAGES = (): LifeEventDef[] => [
  ...(Object.keys(VOYAGE_DEFS) as VoyageKind[]).map(voyageDef),
  {
    key: "sea-whale",
    pool: "raised",
    cooldown: 0,
    scene: "deck",
    title: "There she blows!",
    body: (g, life) => {
      const v = seaOf(g.s).voyages.find(
        (x) => x.seat === life.seat && x.phase === "there",
      );
      return `"There she blows! There she blows, and breaches!" A right whale, a mile to windward, rolling in the swell. The boats go down with a rush, six to a boat and the mate at the steering oar${v ? `, and the ${v.ship}'s master looks round for who'll take the iron` : ""}.`;
    },
    choices: [
      {
        label: "Take the harpoon yourself",
        tip: "Fighting: drive the iron home and the whale's yours. Miss, and her flukes may stave the boat.",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, _c, pass) => whaleNow(g, life, "harpoon", pass),
      },
      {
        label: "Pull an oar",
        tip: "Seamanship comes of it: the boat's luck is the steersman's.",
        apply: (g, life) => whaleNow(g, life, "oar", true),
      },
      {
        label: "Stay with the ship",
        tip: "Watch from the rail. No share of the glory, no risk.",
        apply: (g, life) => whaleNow(g, life, "ship", true),
      },
    ],
  },
];

// ---------------------------------------------------------------- a ship fitting out; the pardon

/** The offer a scene is about: (port, month, salt, slot) or a fitting cruise's id. */
function offerOf(g: ConquestGame, life: Life, ctx: LCtx) {
  const key =
    ctx.cr !== undefined && ctx.cr >= 0
      ? `c:${ctx.cr}`
      : `o:${ctx.p}:${ctx.m}:${ctx.salt}:${ctx.slot}`;
  return cruiseOffers(g.s, g.w, life.prov).find((o) => o.key === key);
}

/**
 * EVENTS (r21): a ship fitting out, said plainly. Before, the scene began
 * with "beating for men" and "on the account" and ended in a table of odds,
 * without ever saying what the place was or how it paid.
 */
export function fittingBody(
  g: ConquestGame,
  life: Life,
  o: NonNullable<ReturnType<typeof offerOf>>,
): string {
  const ground = GROUND_BY_KEY.get(o.ground)?.name ?? "the hunting grounds";
  const ship = `The ${o.ship}, a ${BOATS[o.kind].name.toLowerCase()} of ${o.guns} guns`;
  const days = o.hunt + o.passage * 2;
  const v = offerOdds(g.s, g.w, life, o, "crew");
  const nothing = v.outcomes.find((x) => x.label === "nothing taken")?.p ?? 0;
  const taken = v.risks[0]?.p ?? 0;
  const what =
    o.flag === "pirate"
      ? `${ship}, is taking on a pirate crew under ${o.cname}. There are no wages and no commission: whatever she takes is shared out by the articles every man signs, and the crew chooses its captain (and can vote him out). Pirates who are caught are hanged.`
      : `${ship}, is a privateer: ${o.cname} holds a letter of marque from the ${g.s.nations[o.nation]?.adjective ?? ""} crown, a licence to capture enemy merchant ships in wartime. There are no wages. Whatever she takes is sold, and every man aboard gets a share: a hand one share, an officer more, the captain most.`;
  return [
    what,
    `She sails on ${formatDate(o.sails)} for ${ground} and should be home in about ${days} days.`,
    `For a hand: ${chanceWords(1 - nothing)} she takes a prize, and your share would come to about ${Math.round(v.expected)} coins on average. The danger: ${chanceWords(taken)} she's taken by an enemy warship${o.flag === "pirate" ? " (and you tried for piracy)" : " (and you held prisoner till exchanged)"}.`,
  ].join("\n");
}

function signChoice(role: CruiseRole): LifeEventDef["choices"][number] {
  return {
    // EVENTS (r21): plainer: the place, and what it's likely to bring.
    label: (g, life, ctx) => {
      const o = offerOf(g, life, ctx);
      const name = o ? ROLE_NAMES[o.flag][role].toLowerCase() : role;
      if (!o) return `Sign on as ${name}`;
      const v = offerOdds(g.s, g.w, life, o, role);
      return `Sign on as ${name}: your share, about ${Math.round(v.expected)} coins`;
    },
    tip: (g, life, ctx) => {
      const o = offerOf(g, life, ctx);
      if (!o) return "She's sailed.";
      const v = offerOdds(g.s, g.w, life, o, role);
      const nothing =
        v.outcomes.find((x) => x.label === "nothing taken")?.p ?? 0;
      const what =
        role === "captain"
          ? "You command her and take the captain's shares"
          : role === "officer"
            ? `You're her ${ROLE_NAMES[o.flag].officer.toLowerCase()}: more shares than a hand, and a say in what she does`
            : "You work her as one of the crew, for a hand's share";
      return `${what}. ${cap(chanceWords(1 - nothing))} she takes a prize; ${chanceWords(v.risks[0]?.p ?? 0)} an enemy warship takes her. You go with her (she sails on the map) until she's home; your own work waits.`;
    },
    blocked: (g, life, ctx) => {
      const o = offerOf(g, life, ctx);
      if (!o) return "She's sailed";
      const c = signCheck(g.s, g.w, life, o, role);
      return c.ok ? null : c.why.replace(/\.$/, "");
    },
    apply: (g, life, ctx) => {
      const o = offerOf(g, life, ctx);
      if (!o) return;
      const err = signOn(g, life, o.key, role);
      if (err) journal(g, life, err, "bad");
    },
  };
}

const QUAY = (): LifeEventDef[] => [
  {
    key: "sea-fitting",
    pool: "raised",
    cooldown: 0,
    scene: "docks",
    // EVENTS (r21): said plainly: who she is, what a privateer (or a pirate)
    // is, how the crew is paid, how long, and what a hand can expect.
    title: (g, life, ctx) => {
      const o = offerOf(g, life, ctx);
      if (!o) return "A ship wants hands";
      return o.flag === "pirate"
        ? `The ${o.ship} wants a pirate crew`
        : `The ${o.ship} wants hands`;
    },
    body: (g, life, ctx) => {
      const o = offerOf(g, life, ctx);
      if (!o) return "She's sailed.";
      return fittingBody(g, life, o);
    },
    choices: [
      signChoice("crew"),
      signChoice("officer"),
      signChoice("captain"),
      {
        label: "Not this time",
        tip: "Let her sail without you. There'll be others.",
        apply: (g, life) =>
          journal(
            g,
            life,
            "You watch her warp out of the harbour without you.",
          ),
      },
    ],
  },
  {
    key: "sea-pardon",
    pool: "raised",
    cooldown: 3000,
    scene: "governor",
    title: "The King's pardon",
    body: (g, life) => {
      const open = pardonOpen(g.s);
      return `A proclamation is nailed up on the customs house door and read out in the taverns: ${open?.text ?? "a pardon for pirates who surrender"} The governor will hear any who come in.\nTaken, the heat of your piracy is gone. Taken and broken, you'll hang without a second thought.`;
    },
    choices: [
      {
        label: "Surrender and take the pardon",
        tip: "Your piracy forgiven: the law's heat cleared.",
        blocked: (g, life) => {
          const c = pardonCheck(g.s, g.w, life);
          return c.ok ? null : c.why.replace(/\.$/, "");
        },
        apply: (g, life) => {
          const err = takePardon(g, life);
          if (err) journal(g, life, err, "bad");
        },
      },
      {
        label: "Not yet",
        tip: "The pardon runs a while yet. You can take it later at a governor's house (Work › At sea).",
        apply: (g, life) =>
          journal(g, life, "You keep the King's pardon in mind."),
      },
    ],
  },
];

// ---------------------------------------------------------------- the company

function inviteChoice(coins: number): LifeEventDef["choices"][number] {
  return {
    label: `Put in ${coins} (${coins} coins)`,
    tip: (g, life, ctx) => {
      const sub = subById(g.s, ctx.sub);
      if (!sub) return "It's closed.";
      const share = (coins / (subTotal(sub) + coins)) * 100;
      const v = companyOdds(g.s, g.w, {
        kind: sub.kind,
        port: sub.prov,
        nation: g.s.provinces[sub.prov].owner,
        share,
        stake: coins,
      });
      return v
        ? `About ${Math.round(share)}% of her as she stands: a cruise is expected to bring you about ${v.expected} (${chanceWords(v.risks[0].p)} she's taken). Given back if she never signs.`
        : "Given back if she never signs.";
    },
    blocked: (g, life, ctx) => {
      const c = joinCheck(g.s, g.w, life, subById(g.s, ctx.sub), coins);
      return c.ok ? null : c.why.replace(/\.$/, "");
    },
    apply: (g, life, ctx) => {
      const err = joinCompany(g, life, ctx.sub, coins);
      if (err) journal(g, life, err, "bad");
    },
  };
}

const COMPANY_SCENES = (): LifeEventDef[] => [
  {
    key: "sea-sub-invite",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: "A share in a privateer",
    body: (g, life, ctx) => {
      const sub = subById(g.s, ctx.sub);
      const who = g.s.chars[ctx.c];
      if (!sub) return "The subscription has closed.";
      return `${who ? who.first : "A friend"} writes from ${g.map.provinces[sub.prov].name}: "I am getting up a company to fit out the ${sub.shipName}, ${BOATS[sub.kind].name.toLowerCase()} of ${BOATS[sub.kind].guns} guns, as a privateer under the governor's commission. ${subTotal(sub)} coins are put in so far, of the ${subNeeded(g.s, g.w, sub)} she needs. Will you take a share? Half of every prize she brings in goes to us owners, divided by what each put in."\nYou'd send your money by return of post, and have it back if she never sails.`; // EVENTS (r21): plainer
    },
    choices: [
      inviteChoice(10),
      inviteChoice(25),
      inviteChoice(50),
      {
        label: "Decline",
        tip: "Wish them luck, and keep your money.",
        apply: (g, life, ctx) => {
          const by = g.s.chars[ctx.c];
          journal(
            g,
            life,
            `You decline a share in the privateer${by ? ` ${by.first} is getting up` : ""}.`,
          );
        },
      },
    ],
  },
];

/**
 * Every scene of the sea, made the first time one is looked up (LifeEvents'
 * byKey): the modules they call import each other, so nothing here is built
 * while one of them is still loading. The hurricanes rest with the weather
 * at sea, and a town struck with the calamities.
 */
let built: LifeEventDef[] | null = null;
export function seaEvents(): LifeEventDef[] {
  if (built) return built;
  built = [
    ...HUNT(),
    ...STORMS(),
    ...VOYAGES(),
    ...QUAY(),
    ...COMPANY_SCENES(),
  ];
  registerFamily("sea-weather", ["sea-storm-ship", "sea-storm-signs-ship"], 60);
  registerFamily("calamity", ["sea-storm-town"], 365);
  return built;
}

/**
 * The choice a scene takes if it's left unanswered (LifeEvents' firstAllowed):
 * stay at home, let her sail, watch the whale from the rail, wait for the
 * pardon. The hunt's scenes take the captain's usual way (their first), and
 * the ship settles them herself if nobody answers in a few days.
 */
let quiet: Record<string, number> | null = null;
export function seaQuiet(): Record<string, number> {
  quiet ??= Object.fromEntries(
    seaEvents()
      .filter((d) =>
        [
          "sea-voyage-",
          "sea-fitting",
          "sea-whale",
          "sea-pardon",
          "sea-sub-invite",
        ].some((k) => d.key.startsWith(k)),
      )
      .map((d) => [d.key, d.choices.length - 1]),
  );
  return quiet;
}

/** Helpers for the client's sea page and the tests. */
export { deciderOf, planOf, wouldChase };
export type { Voyage };
