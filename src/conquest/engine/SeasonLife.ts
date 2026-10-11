// MAP (r12): what the seasons do to a life. A chill on the chest in a
// northern winter and fevers in a southern summer; the hungry months of
// late winter; the thaw's floods; harvest work in the fields at harvest
// wages (and the farmer's frolic after); and on the road, the mud of the
// thaw, frozen rivers to cross, frostbite, and hands wanted at the harvest.
// The season's pay and the dear bread are in the month's money (Seasons.ts,
// through LifeQueries.monthlyBudget); the roads' speed is in the travel
// times (Paths.landHopDaysIn).

import { dateOf } from "./Calendar";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { askToFrolic } from "./Gatherings";
import { hooks, raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  meet,
  remembers,
  setCooldown,
  spend,
  touchLife,
} from "./LifeCore";
import type { LifeChoice, LifeEventDef } from "./LifeEvents";
import { isChildLife, lifeIsNative, meOf, skillLevel } from "./LifeQueries";
import { checkChance } from "./LifeRules";
import { isWinter } from "./Map";
import { ageOf, hasTrait } from "./Queries";
import {
  harvestNow,
  iceBound,
  isFloodSeason,
  isHarvest,
  isMudSeason,
  riversFrozen,
  sicknessRisk,
  type HarvestKind,
} from "./Seasons";
import type { Good, Life } from "./Types";

// ---------------------------------------------------------------- helpers

const place = (g: ConquestGame, p: number) => g.map.provinces[p];
const monthOf = (g: ConquestGame) => dateOf(g.s.day).month;
const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

function ch(
  label: string,
  tip: string,
  apply: LifeChoice["apply"],
  check?: LifeChoice["check"],
  blocked?: LifeChoice["blocked"],
): LifeChoice {
  return {
    label,
    tip,
    apply,
    ...(check ? { check } : {}),
    ...(blocked ? { blocked } : {}),
  };
}

/** Days off work: fewer days worked this month, so less pay. */
function daysOff(life: Life, n: number): void {
  if (life.job) life.job.worked = Math.max(0, (life.job.worked ?? 0) - n);
}

/** The road ahead is n days longer (or shorter). */
function delay(g: ConquestGame, life: Life, days: number): void {
  const t = life.travel;
  if (!t) return;
  touchLife(g, life);
  t.arrive = Math.max(g.s.day + 1, t.arrive + days);
}

function loseGoods(g: ConquestGame, life: Life, share: number): number {
  let lost = 0;
  touchLife(g, life);
  for (const [k, v] of Object.entries(life.goods) as [Good, number][]) {
    const n = Math.floor(v * share);
    if (n <= 0) continue;
    life.goods[k] = v - n;
    if (!life.goods[k]) delete life.goods[k];
    lost += n;
  }
  return lost;
}

/** The next hop of a journey overland: where it goes, whether it crosses a river. */
function landHop(
  g: ConquestGame,
  life: Life,
): { to: number; river: boolean } | null {
  const t = life.travel;
  if (!t || !t.path.length || t.sea[0]) return null;
  const nb = place(g, life.prov).nb.find(([q]) => q === t.path[0]);
  return { to: t.path[0], river: !!nb?.[2] };
}

const HARVEST_PAY: Record<HarvestKind, number> = {
  poor: 0.65,
  fair: 1,
  good: 1.3,
};

const HARVEST_LINES: Record<HarvestKind, string> = {
  poor: "a thin harvest, and the farmers counting every sheaf",
  fair: "a fair harvest, as harvests go",
  good: "a good harvest, the barns full to the doors",
};

// ---------------------------------------------------------------- the harvest

/** What a stint at the harvest pays you: by your farming and how the harvest came in. */
export function harvestStintPay(g: ConquestGame, life: Life): number {
  const def = place(g, life.prov);
  const h = harvestNow(def.lat, def.lon, g.s.day);
  const farming = skillLevel(g.s, life, "farming");
  return Math.round((1.4 + farming * 0.12) * HARVEST_PAY[h] * 10) / 10;
}

/**
 * The harvest act (LifeActs.ts: "Help bring in the harvest", at the fields
 * in the harvest months): harvest wages by your farming and the year's
 * harvest, the farmer's thanks, and maybe the frolic after.
 */
export function harvestStint(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const def = place(g, life.prov);
  const h = harvestNow(def.lat, def.lon, s.day);
  const pay = harvestStintPay(g, life);
  earn(g, life, pay);
  gainXp(g, life, "farming", 6);
  addStress(g, life, 3);
  hurt(g, life, 1, "the harvest");
  const native = lifeIsNative(s, life);
  say(
    g,
    life,
    native
      ? `You worked the corn harvest with the women's fields at ${def.name}: ${HARVEST_LINES[h]}. ${pay} coins' worth of corn and thanks.`
      : `A stint at the harvest at ${def.name}: ${HARVEST_LINES[h]}. ${pay} coins in harvest wages.`,
    "good",
  );
  // The farmer remembers, and may ask you to the frolic.
  const me = meOf(s, life);
  const farmer = householdsOf(s, life.prov).find(
    (c) =>
      c.alive &&
      c.id !== me?.id &&
      ageOf(s, c) >= 25 &&
      (c.role === "planter" ||
        c.role === "labourer" ||
        c.role === "elder" ||
        !c.role),
  );
  if (farmer) {
    meet(g, life, farmer.id);
    remembers(g, life, g.char(farmer.id), "Helped bring the harvest in", 6, 1);
    if (
      !native &&
      (life.cooldowns.frolicAsk ?? 0) <= s.day &&
      g.rng.chance(h === "good" ? 0.5 : h === "fair" ? 0.3 : 0.1)
    ) {
      setCooldown(g, life, "frolicAsk", 120);
      askToFrolic(g, life, farmer);
    }
  }
  return null;
}

// ---------------------------------------------------------------- each month

/** The season's turn for a life: sickness in the air, the ice, the harvest in. */
export function seasonsMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me?.alive || life.watching) return;
  const def = place(g, life.prov);
  const month = monthOf(g);
  // Sickness in the air: a chill on the chest, a fever.
  const sick = sicknessRisk(def, month, g.w.tropical[life.prov]);
  if (sick.kind) {
    let risk = sick.risk;
    if (life.lifestyle === "frugal") risk *= 1.5;
    if (life.lifestyle === "genteel" || life.lifestyle === "grand") risk *= 0.7;
    if (hasTrait(me, "robust")) risk *= 0.6;
    if (hasTrait(me, "sickly")) risk *= 1.6;
    if (life.travel) risk *= 1.3;
    if (g.rng.chance(risk))
      raiseEvent(
        g,
        life,
        sick.kind === "chill" ? "season-chill" : "season-fever",
      );
  }
  // The ice comes and goes at the harbour where you are.
  const before = iceBound(def, (month + 11) % 12);
  const now = iceBound(def, month);
  if (def.coastal && now !== before && !life.travel)
    say(
      g,
      life,
      now
        ? `The ice has closed the harbour at ${def.name}: no ships until it goes out in the spring.`
        : `The ice is out at ${def.name}: the first ships of the year are coming in.`,
    );
  // The harvest in: how it came in, for those who work the land.
  if (
    month === 10 &&
    def.lat >= 30 &&
    (life.job?.kind === "farmer" ||
      life.job?.kind === "grower" ||
      (life.property ?? []).some((pr) => pr.kind === "land"))
  ) {
    const h = harvestNow(def.lat, def.lon, s.day);
    say(
      g,
      life,
      `The harvest is in at ${def.name}: ${HARVEST_LINES[h]}.`,
      h === "good" ? "good" : h === "poor" ? "bad" : undefined,
    );
  }
}

// ---------------------------------------------------------------- the events

export const SEASON_EVENTS: LifeEventDef[] = [
  {
    key: "season-chill",
    pool: "raised",
    cooldown: 60,
    scene: "home",
    title: "A chill on the chest",
    body: (g, life) =>
      `The cold has got into your chest: a cough that won't lift and a fever every night. Half of ${place(g, life.prov).name} has it, and the old people are dying of it.`,
    choices: [
      ch(
        "Rest by the fire",
        "A week off your feet: less pay this month, but you'll mend.",
        (g, life) => {
          daysOff(life, 6);
          hurt(g, life, 3, "a winter chill");
          addStress(g, life, -3);
          say(
            g,
            life,
            "A week by the fire with a hot brick and broth. You mended.",
          );
        },
      ),
      ch(
        "Send for the physician",
        "Medicine, and 2 coins: a draught, a poultice, a blister.",
        (g, life, ctx, pass) => {
          spend(g, life, 2);
          if (pass) {
            hurt(g, life, 2, "a winter chill");
            say(g, life, "The draught was vile and it worked.", "good");
          } else {
            hurt(g, life, 9, "a winter chill");
            say(
              g,
              life,
              "He bled you twice and charged you for both. You're weaker for it.",
              "bad",
            );
          }
        },
        { skill: "medicine", dc: 4 },
        (g, life) => (life.purse < 2 ? "Needs 2 coins" : null),
      ),
      ch(
        "Work through it",
        "No time lost, if it doesn't turn to pleurisy.",
        (g, life) => {
          const bad = g.rng.chance(0.35);
          hurt(g, life, bad ? 16 : 6, bad ? "pleurisy" : "a winter chill");
          say(
            g,
            life,
            bad
              ? "It went to your lungs: pleurisy, and three weeks in bed after all."
              : "You coughed your way through the month. It passed.",
            bad ? "bad" : undefined,
          );
          if (bad) daysOff(life, 12);
        },
      ),
    ],
  },
  {
    key: "season-fever",
    pool: "raised",
    cooldown: 75,
    scene: "home",
    title: "The fever season",
    body: (g, life) =>
      `It's the sickly season at ${place(g, life.prov).name}: chills, then fire, then chills again, and the mosquitoes thick at dusk. Now it's your turn.`,
    choices: [
      ch(
        "Jesuit's bark",
        "3 coins: the bitter bark breaks a fever, if it's the right fever.",
        (g, life) => {
          spend(g, life, 3);
          hurt(g, life, 5, "the fever");
          daysOff(life, 4);
          say(
            g,
            life,
            "The bark was bitter enough to make you weep. The fever broke.",
            "good",
          );
        },
        undefined,
        (g, life) => (life.purse < 3 ? "Needs 3 coins" : null),
      ),
      ch(
        "Bleed and purge",
        "Medicine: what every physician does, and what kills half of them.",
        (g, life, ctx, pass) => {
          hurt(g, life, pass ? 7 : 15, "the fever");
          daysOff(life, 8);
          if (!pass)
            say(g, life, "They bled you white. You lived, barely.", "bad");
        },
        { skill: "medicine", dc: 6 },
      ),
      ch(
        "Sweat it out",
        "Two weeks in a wet bed, and a strong constitution.",
        (g, life) => {
          const me = meOf(g.s, life);
          const strong = !!me && hasTrait(me, "robust");
          hurt(g, life, strong ? 8 : 13, "the fever");
          daysOff(life, 10);
        },
      ),
    ],
  },
  {
    key: "season-hungry",
    pool: "any",
    weight: 3,
    cooldown: 300,
    scene: "home",
    when: (g, life) => {
      const def = place(g, life.prov);
      const m = monthOf(g);
      if (def.lat <= 34 || m < 1 || m > 3 || isChildLife(g.s, life))
        return null;
      // After a poor harvest; after a fair one, in the colder years.
      const h = harvestNow(def.lat, def.lon, g.s.day);
      if (h === "good") return null;
      if (h === "fair" && (dateOf(g.s.day).year * 7 + life.prov) % 5 > 1)
        return null;
      return {};
    },
    title: "The hungry months",
    body: (g, life) => {
      const def = place(g, life.prov);
      const poor = harvestNow(def.lat, def.lon, g.s.day) === "poor";
      return `${poor ? "After last year's poor harvest the" : "The"} root cellar is nearly bare, the hens have stopped laying, and corn at ${def.name} costs half again what it did at Christmas.`;
    },
    choices: [
      ch(
        "Buy corn, dear as it is",
        "4 coins.",
        (g, life) => {
          spend(g, life, 4);
          say(g, life, "You paid the miller's price and ate.");
        },
        undefined,
        (g, life) => (life.purse < 4 ? "Needs 4 coins" : null),
      ),
      ch(
        "Hunt, or fish through the ice",
        "Woodcraft: venison or cod, or a cold day for nothing.",
        (g, life, ctx, pass) => {
          if (pass) {
            addStress(g, life, -2);
            say(
              g,
              life,
              "A deer in the snow at dawn: meat for a fortnight.",
              "good",
            );
          } else {
            hurt(g, life, 4, "the cold");
            say(g, life, "Three days out and nothing but frozen feet.", "bad");
          }
        },
        { skill: "woodcraft", dc: 5 },
      ),
      ch("Tighten your belt", "Thin soup until the spring.", (g, life) => {
        hurt(g, life, 5, "hunger");
        addStress(g, life, 4);
      }),
    ],
  },
  {
    key: "season-thaw",
    pool: "any",
    weight: 2,
    cooldown: 400,
    scene: "river",
    when: (g, life) => {
      const def = place(g, life.prov);
      if (!isFloodSeason(def.lat, monthOf(g)) || isChildLife(g.s, life))
        return null;
      // Only where a river runs by.
      return def.nb.some(([, , river]) => river) ? {} : null;
    },
    title: "The river rises",
    body: (g, life) =>
      `The thaw came all at once: ice jammed at the bend, and the river at ${place(g, life.prov).name} is in the lower streets and rising.`,
    choices: [
      ch(
        "Help the neighbours save their goods",
        "Wet, cold work; they'll remember it.",
        (g, life) => {
          addStress(g, life, 3);
          addRenown(g, life, 1);
          hurt(g, life, 2, "the flood");
          say(
            g,
            life,
            "You carried furniture and children out of the water until dark. People saw.",
            "good",
          );
        },
      ),
      ch(
        "Hire out your strength and a cart",
        "2 coins from the desperate.",
        (g, life) => {
          earn(g, life, 2);
          addRenown(g, life, -1);
          say(g, life, "You made two coins. Some will remember how.");
        },
      ),
      ch("Look to your own", "Move your things up the hill.", (g, life) =>
        say(g, life, "Your things are dry. The water went down in a week."),
      ),
    ],
  },
  // ---- on the road
  {
    key: "trv-mud",
    pool: "road",
    weight: 4,
    cooldown: 200,
    scene: "road",
    when: (g, life) => {
      const hop = landHop(g, life);
      if (!hop) return null;
      const def = place(g, hop.to);
      return isMudSeason(def.lat, monthOf(g)) ? { p: hop.to } : null;
    },
    title: "Mud season",
    body: (g, life, ctx) =>
      `The thaw has turned the road to ${place(g, ctx.p).name} into a river of mud: carts sunk to the axle, a dead horse by the way, and the mud sucking the boots off your feet.`,
    choices: [
      ch(
        "Leave the road for the woods",
        "Woodcraft: quicker, if you don't lose the way.",
        (g, life, ctx, pass) => {
          if (pass)
            say(
              g,
              life,
              "A deer track along the ridge, dry most of the way.",
              "good",
            );
          else {
            delay(g, life, 2);
            hurt(g, life, 3, "the woods");
            say(g, life, "Lost in the swamp maple for two days.", "bad");
          }
        },
        { skill: "woodcraft", dc: 5 },
      ),
      ch(
        "Hire a team of oxen",
        "2 coins, and a day.",
        (g, life) => {
          spend(g, life, 2);
          delay(g, life, 1);
        },
        undefined,
        (g, life) => (life.purse < 2 ? "Needs 2 coins" : null),
      ),
      ch("Slog on", "Three more days of it.", (g, life) => {
        delay(g, life, 3);
        addStress(g, life, 3);
      }),
    ],
  },
  {
    key: "trv-ice-crossing",
    pool: "road",
    weight: 4,
    cooldown: 250,
    scene: "snow",
    when: (g, life) => {
      const hop = landHop(g, life);
      if (!hop?.river) return null;
      const def = place(g, hop.to);
      return riversFrozen(def.lat, monthOf(g)) ? { p: hop.to } : null;
    },
    title: "The river is frozen",
    body: (g, life, ctx) =>
      `The river before ${place(g, ctx.p).name} is frozen from bank to bank. Sledges have crossed it; there's a dark patch in the middle where the current runs.`,
    choices: [
      ch(
        "Cross on the ice",
        "Woodcraft: a day saved, if it holds.",
        (g, life, ctx, pass) => {
          if (pass) {
            delay(g, life, -1);
            say(
              g,
              life,
              "The ice groaned and held. You were across in an hour.",
              "good",
            );
          } else {
            const lost = loseGoods(g, life, 0.3);
            hurt(g, life, 12, "the ice");
            say(
              g,
              life,
              `It gave way under you. You came out on the far side half dead${lost ? `, ${lost} loads lighter` : ""}.`,
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 5 },
      ),
      ch("Go round by the bridge", "Two days more.", (g, life) =>
        delay(g, life, 2),
      ),
    ],
  },
  {
    key: "trv-frostbite",
    pool: "road",
    weight: 3,
    cooldown: 300,
    scene: "snow",
    when: (g, life) => {
      const hop = landHop(g, life);
      if (!hop) return null;
      const def = place(g, hop.to);
      return def.lat >= 45 && isWinter(def.lat, monthOf(g))
        ? { p: hop.to }
        : null;
    },
    title: "Frostbite",
    body: () =>
      "The cold this morning is the kind that cracks trees. Your toes went white an hour ago and now you can't feel them at all.",
    choices: [
      ch(
        "Stop, make a fire, and thaw them slowly",
        "Woodcraft: done right, you keep your toes.",
        (g, life, ctx, pass) => {
          delay(g, life, 1);
          if (!pass) hurt(g, life, 8, "frostbite");
        },
        { skill: "woodcraft", dc: 4 },
      ),
      ch(
        "Rub them with snow and press on",
        "What everyone says to do.",
        (g, life) => {
          hurt(g, life, 10, "frostbite");
          say(
            g,
            life,
            "You lost two toes to it. You walk a little differently now.",
            "bad",
          );
        },
      ),
    ],
  },
  {
    key: "trv-harvest-hands",
    pool: "road",
    weight: 4,
    cooldown: 200,
    scene: "fields",
    when: (g, life) => {
      const hop = landHop(g, life);
      if (!hop || isChildLife(g.s, life)) return null;
      const def = place(g, hop.to);
      const pr = g.s.provinces[hop.to];
      if (pr.owner < 0 || !isHarvest(def.lat, monthOf(g))) return null;
      return { p: hop.to };
    },
    title: "Hands wanted",
    body: (g, life, ctx) =>
      `A farmer outside ${place(g, ctx.p).name} is waving at the road: the corn's dead ripe, rain's coming, and half his hands have the ague. Harvest wages, and supper.`,
    choices: [
      ch(
        "Three days binding sheaves",
        "Harvest wages, by your farming and the harvest.",
        (g, life) => {
          const def = place(g, life.prov);
          const h = harvestNow(def.lat, def.lon, g.s.day);
          const pay =
            Math.round(
              (1.2 + skillLevel(g.s, life, "farming") * 0.1) *
                HARVEST_PAY[h] *
                10,
            ) / 10;
          delay(g, life, 3);
          earn(g, life, pay);
          gainXp(g, life, "farming", 5);
          say(
            g,
            life,
            `Three days in his fields: ${pay} coins, a sunburnt neck and a good supper.`,
            "good",
          );
        },
      ),
      ch("Wish him luck and walk on", "No time lost.", (g, life) =>
        say(
          g,
          life,
          "You left him to it. The clouds were coming up behind you.",
        ),
      ),
    ],
  },
];

/** Odds of an event's check, for the tests. */
export function seasonOdds(
  g: ConquestGame,
  life: Life,
  skill: "woodcraft" | "medicine" | "farming",
  dc: number,
): number {
  return checkChance(skillLevel(g.s, life, skill), dc);
}

hooks.lifeMonthly.push(seasonsMonthly);
