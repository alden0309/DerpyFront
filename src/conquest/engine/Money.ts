// What money is for. Living as your station expects (and what people say
// when you don't), the things worth having at every level of wealth (good
// tools, lessons, a horse, a coach, a pew), money put out to work (a cargo
// ventured, shares in a company), a dinner for the town, a grant of land,
// and the great works that put a name on a building. The month's reckoning
// is here too: keep for what you own, ventures coming home, and the cost of
// living beneath yourself.

import { dateOf } from "./Calendar";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  heal,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  beneathStation,
  Check,
  hasKit,
  isChildLife,
  lifeIsNative,
  meOf,
  no,
  opinionOf,
  promotionView,
  rankOf,
  stationOf,
  yes,
} from "./LifeQueries";
import {
  BENEATH_RENOWN,
  BENEATH_STRESS,
  DINNER_COST,
  JOBS,
  KIT,
  LAND_GRANT,
  LAND_LOT,
  LESSONS,
  LIVING_HOW,
  livingOf,
  MAX_VENTURES,
  SHARE_CRASH,
  SHARE_DIVIDEND,
  SHARE_STAKES,
  SHARE_SWING,
  VENTURE_DAYS,
  VENTURE_LUCK,
  VENTURE_STAKES,
  VENTURE_WAR_LOSS,
  WORKS,
} from "./LifeRules";
import { landOf, propertyBudget, sellProperty } from "./Property";
import { charName } from "./Queries";
import { rumour } from "./Rumours";
import type {
  GameState,
  KitKey,
  Life,
  Lifestyle,
  Property,
  Skill,
  Venture,
} from "./Types";

// ---------------------------------------------------------------- kept things

/** What a kept thing costs you (natives trade for less). */
export function kitPrice(s: GameState, life: Life, k: KitKey): number {
  const def = KIT[k];
  return lifeIsNative(s, life) ? Math.ceil(def.cost / 2) : def.cost;
}

export function kitCheck(s: GameState, life: Life, k: KitKey): Check {
  const def = KIT[k];
  if (!meOf(s, life)) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (def.colonist && lifeIsNative(s, life))
    return no("Not your people's way.");
  if (k === "pew" && meOf(s, life)?.religion === "native")
    return no("Not your people's way.");
  if (k === "tools" && !life.job) return no("You have no trade to equip.");
  if (hasKit(s, life, k))
    return no(
      k === "tools" ? "Your tools are good for a while yet." : "You have one.",
    );
  if (k === "horse" && hasKit(s, life, "carriage"))
    return no("Your coach has horses enough.");
  const cost = kitPrice(s, life, k);
  if (life.purse < cost) return no(`${def.name}: ${cost} coins.`);
  return yes;
}

export function buyKit(g: ConquestGame, life: Life, k: KitKey): string | null {
  const s = g.s;
  const check = kitCheck(s, life, k);
  if (!check.ok) return check.why;
  const cost = kitPrice(s, life, k);
  spend(g, life, cost);
  touchLife(g, life).kit ??= {};
  life.kit![k] = s.day;
  if (k === "carriage") delete life.kit!.horse;
  switch (k) {
    case "tools":
      journal(
        g,
        life,
        `New tools for your trade, the best to be had: ${cost} coins. The work goes better for them.`,
        "good",
      );
      break;
    case "horse":
      journal(
        g,
        life,
        `You buy a horse for ${cost} coins: a sound bay with a mind of its own. The roads are shorter now.`,
        "good",
      );
      break;
    case "carriage":
      addRenown(g, life, 3);
      journal(
        g,
        life,
        `A coach and pair of your own, for ${cost} coins. Heads turn as you pass.`,
        "good",
      );
      milestone(g, life, "renown", "Set up a carriage");
      break;
    case "pew": {
      addRenown(g, life, 1);
      const minister = ministerHere(g, life);
      if (minister) remembers(g, life, minister, "Took a pew", 10, 3);
      journal(
        g,
        life,
        "You take a pew of your own, near the pulpit, with your name painted on the door.",
        "good",
      );
      break;
    }
  }
  return null;
}

/** Sell off a kept thing (a horse, a coach) for what it'll fetch. */
export function sellKit(g: ConquestGame, life: Life, k: KitKey): string | null {
  if (life.kit?.[k] === undefined) return "You don't have one.";
  const worth = k === "pew" ? 0 : Math.round(kitPrice(g.s, life, k) * 0.4);
  touchLife(g, life);
  delete life.kit![k];
  if (worth) earn(g, life, worth);
  journal(
    g,
    life,
    k === "pew"
      ? "You give up your pew. Someone else's name goes on the door."
      : `You sell ${KIT[k].name.toLowerCase()} for ${worth} coins.`,
  );
  return null;
}

function ministerHere(g: ConquestGame, life: Life) {
  return (g.s.locals[life.prov] ?? [])
    .map((id) => g.s.chars[id])
    .find((c) => c?.alive && c.role === "preacher");
}

// ---------------------------------------------------------------- lessons

/** The skill lessons would help with: what the next rung needs most. */
export function lessonSkill(s: GameState, life: Life): Skill {
  const job = life.job;
  if (!job) return "letters";
  const def = JOBS[job.kind];
  const v = promotionView(s, life);
  const need = v.needs.find((n) => !n.met && n.label.startsWith(def.second));
  return need ? def.second : def.main;
}

export function lessons(g: ConquestGame, life: Life): string | null {
  const sk = lessonSkill(g.s, life);
  gainXp(g, life, sk, LESSONS.xp);
  journal(
    g,
    life,
    `A master of the art takes you in hand for a month of evenings: ${LESSONS.cost} coins well spent on your ${sk}.`,
    "good",
  );
  return null;
}

// ---------------------------------------------------------------- ventures

export function venturesOf(life: Life): Venture[] {
  return life.ventures ?? [];
}

/** What a cargo ventured from here would be. */
function cargoName(g: ConquestGame, life: Life): string {
  const raw = g.w.raw[life.prov];
  const what: Record<string, string> = {
    grain: "wheat and flour",
    fish: "salt fish",
    furs: "beaver pelts",
    tobacco: "tobacco",
    sugar: "sugar and rum",
    timber: "masts and staves",
    silver: "silver plate",
  };
  const to = ["London", "Bristol", "the Indies", "Lisbon", "Amsterdam"][
    g.rng.int(0, 4)
  ];
  return `${what[raw] ?? "a mixed cargo"} for ${to}`;
}

/** The company whose shares are sold at this market, by the year and the crown. */
export function companyName(s: GameState, life: Life): string {
  const me = meOf(s, life);
  const key = s.nations[me?.nation ?? -1]?.key ?? "";
  const year = dateOf(s.day).year;
  if (key === "netherlands") return "the West India Company";
  if (key === "france")
    return year >= 1719
      ? "the Company of the Indies"
      : "the Company of New France";
  if (key === "spain")
    return year >= 1728 ? "the Caracas Company" : "the Seville merchants";
  if (key === "sweden") return "the New Sweden Company";
  if (year >= 1711 && year < 1725) return "the South Sea Company";
  if (year >= 1670) return "the Hudson's Bay Company";
  return "the East India Company";
}

export function ventureStake(s: GameState, life: Life): number {
  return VENTURE_STAKES[stationOf(s, life).level];
}

export function shareStake(s: GameState, life: Life): number {
  return SHARE_STAKES[stationOf(s, life).level];
}

export function ventureCheck(
  s: GameState,
  life: Life,
  kind: Venture["kind"],
): Check {
  if (!meOf(s, life)) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (kind === "shares" && lifeIsNative(s, life))
    return no("Not your people's way.");
  if (venturesOf(life).length >= MAX_VENTURES)
    return no(`You have ${MAX_VENTURES} ventures out already.`);
  const stake = kind === "cargo" ? ventureStake(s, life) : shareStake(s, life);
  if (!stake) return no("Shares are for people of some standing.");
  if (life.purse < stake) return no(`Needs ${stake} coins.`);
  return yes;
}

export function startVenture(
  g: ConquestGame,
  life: Life,
  kind: Venture["kind"],
): string | null {
  const s = g.s;
  const check = ventureCheck(s, life, kind);
  if (!check.ok) return check.why;
  const stake = kind === "cargo" ? ventureStake(s, life) : shareStake(s, life);
  spend(g, life, stake);
  const v: Venture = {
    id: g.nextId(),
    kind,
    stake,
    value: stake,
    day: s.day,
    due:
      kind === "cargo"
        ? s.day + g.rng.int(VENTURE_DAYS[0], VENTURE_DAYS[1])
        : -1,
    name: kind === "cargo" ? cargoName(g, life) : companyName(s, life),
  };
  (touchLife(g, life).ventures ??= []).push(v);
  journal(
    g,
    life,
    kind === "cargo"
      ? `You put ${stake} coins into a cargo of ${v.name}. It sails on the next tide; you'll know in some months what came of it.`
      : `You buy ${stake} coins' worth of shares in ${v.name}. The price is in the gazette every week.`,
  );
  return null;
}

/** Sell shares at what they're worth today. */
export function cashVenture(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const v = venturesOf(life).find((x) => x.id === id);
  if (!v) return "No such venture.";
  if (v.kind !== "shares") return "A cargo at sea can't be sold.";
  const worth = Math.round(v.value * 100) / 100;
  touchLife(g, life).ventures = venturesOf(life).filter((x) => x !== v);
  earn(g, life, worth);
  const gain = worth - v.stake;
  journal(
    g,
    life,
    `You sell your shares in ${v.name} for ${Math.round(worth)} coins${gain >= 1 ? `: ${Math.round(gain)} more than you paid` : gain <= -1 ? `: ${Math.round(-gain)} less than you paid` : ""}.`,
    gain >= 1 ? "good" : gain <= -1 ? "bad" : undefined,
  );
  return null;
}

/** A month of ventures: shares rise and fall and pay out; cargoes come home. */
function venturesMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const list = venturesOf(life);
  if (!list.length) return;
  touchLife(g, life);
  const me = meOf(s, life);
  const year = dateOf(s.day).year;
  const keep: Venture[] = [];
  for (const v of list) {
    if (v.kind === "shares") {
      // The South Sea year, and the odd bad one besides.
      const crash =
        v.name === "the South Sea Company" && year === 1720 ? 0.3 : SHARE_CRASH;
      if (g.rng.chance(crash)) {
        v.value = Math.round(v.value * 0.2 * 100) / 100;
        journal(
          g,
          life,
          `The bubble bursts: shares in ${v.name} are worth a fifth of what they were. Coffee houses are full of ruined men.`,
          "bad",
        );
        addStress(g, life, 10);
      } else {
        const swing =
          SHARE_SWING[0] + g.rng.next() * (SHARE_SWING[1] - SHARE_SWING[0]);
        v.value = Math.round(v.value * (1 + swing) * 100) / 100;
      }
      const div = Math.round(v.value * SHARE_DIVIDEND * 100) / 100;
      if (div > 0) earn(g, life, div);
      keep.push(v);
      continue;
    }
    if (v.due > s.day) {
      keep.push(v);
      continue;
    }
    // Home, or not.
    const war =
      !!me && s.wars.some((w) => w.a === me.nation || w.b === me.nation);
    let r = g.rng.next();
    let luck = VENTURE_LUCK[VENTURE_LUCK.length - 1];
    const lossP = war ? VENTURE_WAR_LOSS : VENTURE_LUCK[0].p;
    if (r < lossP) luck = VENTURE_LUCK[0];
    else {
      r = (r - lossP) / (1 - lossP);
      let acc = 0;
      const rest = VENTURE_LUCK.slice(1);
      const total = rest.reduce((a, b) => a + b.p, 0);
      for (const l of rest) {
        acc += l.p / total;
        if (r < acc) {
          luck = l;
          break;
        }
      }
    }
    const back = Math.round(v.stake * luck.x * 100) / 100;
    if (back > 0) earn(g, life, back);
    const gain = back - v.stake;
    journal(
      g,
      life,
      luck.x === 0
        ? `Your cargo of ${v.name} is ${war ? "taken by a privateer" : "lost at sea"}: ${v.stake} coins gone to the fishes.`
        : `Your cargo of ${v.name}, ${luck.text}: ${Math.round(back)} coins back for ${v.stake}.`,
      gain > 0 ? "good" : "bad",
    );
    if (luck.x >= 2) {
      addRenown(g, life, 2);
      rumour(
        g,
        life.prov,
        `${charName(me)} has made a fortune on a cargo of ${v.name}.`,
        me?.id ?? -1,
        "good",
      );
    } else if (luck.x === 0) addStress(g, life, 6);
  }
  life.ventures = keep;
}

// ---------------------------------------------------------------- a dinner for the town

export function dinnerCost(s: GameState, life: Life): number {
  return DINNER_COST[stationOf(s, life).level];
}

/** "a supper", "a ball": what's given at your station. */
export function dinnerName(s: GameState, life: Life): string {
  return ["a supper", "a good dinner", "a dinner", "a ball", "a great ball"][
    stationOf(s, life).level
  ];
}

export function giveDinner(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const cost = dinnerCost(s, life);
  if (life.purse < cost) return `A dinner fit for your station: ${cost} coins.`;
  spend(g, life, cost);
  const st = stationOf(s, life).level;
  addRenown(g, life, 2 + st);
  addStress(g, life, -6);
  let guests = 0;
  for (const id of life.met) {
    const c = s.chars[id];
    if (!c?.alive || c.home !== life.prov || guests >= 12) continue;
    remembers(g, life, g.char(id), "A fine evening at your table", 6, 1);
    guests++;
  }
  const what = dinnerName(s, life);
  journal(
    g,
    life,
    `You give ${what} for ${cost} coins: ${guests || "a few"} guests, too much wine, and a toast to your health that went on rather long.`,
    "good",
  );
  return null;
}

// ---------------------------------------------------------------- a grant of land

export function grantCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (lifeIsNative(s, life))
    return no("Land isn't bought and sold among your people.");
  if ((life.cooldowns.landgrant ?? 0) > s.day)
    return no("You've had a grant lately.");
  const n = s.nations[s.provinces[life.prov]?.owner ?? -1];
  if (!n || n.kind !== "power" || n.capital !== life.prov)
    return no("Grants are made at the governor's house in the capital.");
  if (n.id !== me.nation) return no("Only from your own colony.");
  const gov = s.chars[n.ruler];
  const op =
    gov?.alive && gov.id !== me.id ? opinionOf(s, gov, life).total : 100;
  if (op < LAND_GRANT.opinion && life.favor < 10)
    return no(
      `The governor's good opinion, ${LAND_GRANT.opinion} (${op}), or favour at court.`,
    );
  const home = s.provinces[life.home];
  if (!home || home.owner !== me.nation)
    return no("Your home must be in the colony.");
  if ((landOf(life, life.home)?.level ?? 0) >= LAND_LOT.max)
    return no("You've all the land there is at home.");
  if (life.purse < LAND_GRANT.fee)
    return no(`Patent fees and the surveyor: ${LAND_GRANT.fee} coins.`);
  return yes;
}

export function landGrant(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const check = grantCheck(s, life);
  if (!check.ok) return check.why;
  spend(g, life, LAND_GRANT.fee);
  touchLife(g, life).cooldowns.landgrant = s.day + LAND_GRANT.every;
  life.property ??= [];
  let land = landOf(life, life.home);
  if (!land) {
    land = {
      id: g.nextId(),
      kind: "land",
      prov: life.home,
      level: 0,
      hands: [],
      since: s.day,
      name: "Land",
    };
    life.property.push(land);
  }
  const lots = Math.min(LAND_GRANT.lots, LAND_LOT.max - land.level);
  land.level += lots;
  journal(
    g,
    life,
    `The governor signs your patent: ${lots * 10} acres at ${g.map.provinces[life.home].name}, surveyed with a chain and a bottle. ${land.level * 10} acres now.`,
    "good",
  );
  milestone(g, life, "renown", `Granted ${lots * 10} acres`);
  return null;
}

// ---------------------------------------------------------------- great works

export function workCheck(s: GameState, life: Life, key: string): Check {
  const w = WORKS[key];
  if (!w) return no("No such work.");
  if (!meOf(s, life)) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if ((life.cooldowns[`work:${key}`] ?? 0) > s.day)
    return no("One is enough for a while.");
  if (life.renown < w.need)
    return no(`They'd need to know your name (renown ${w.need}).`);
  if (life.purse < w.cost) return no(`${w.label}: ${w.cost} coins.`);
  return yes;
}

export function buildWork(
  g: ConquestGame,
  life: Life,
  key: string,
): string | null {
  const check = workCheck(g.s, life, key);
  if (!check.ok) return check.why;
  const w = WORKS[key];
  spend(g, life, w.cost);
  touchLife(g, life).cooldowns[`work:${key}`] = g.s.day + 10 * 365;
  addRenown(g, life, w.renown);
  life.favor += w.favor;
  addStress(g, life, -10);
  heal(g, life, 2);
  const here = g.map.provinces[life.prov].name;
  journal(
    g,
    life,
    `${w.label} at ${here}, for ${w.cost} coins. ${w.text}`,
    "good",
  );
  milestone(
    g,
    life,
    "renown",
    `${w.label.replace(/^\w/, (m) => m)} at ${here}`,
  );
  return null;
}

// ---------------------------------------------------------------- the month

const LIKE: Record<Lifestyle, string> = {
  frugal: "a labourer",
  modest: "a shopkeeper",
  comfortable: "a country parson",
  genteel: "a squire",
  grand: "a lord",
};

/** Deep in debt, the bailiffs come: they sell what costs most to keep. */
export const BAILIFFS_AT = -40;

function bailiffs(g: ConquestGame, life: Life): void {
  if (life.purse >= BAILIFFS_AT) return;
  // A coach or a horse goes first, then shares, then property.
  for (const k of ["carriage", "horse"] as KitKey[])
    if (life.kit?.[k] !== undefined) {
      sellKit(g, life, k);
      journal(g, life, "The bailiffs take it for your debts.", "bad");
      return;
    }
  const share = venturesOf(life).find((v) => v.kind === "shares");
  if (share) {
    cashVenture(g, life, share.id);
    journal(g, life, "Your creditors make you sell.", "bad");
    return;
  }
  const props = [...(life.property ?? [])].sort(
    (a, b) => keepOf(g.s, life, b) - keepOf(g.s, life, a),
  );
  const pr = props.find(
    (p) =>
      !(
        p.kind === "business" &&
        life.job?.own &&
        life.job.prov === p.prov &&
        life.job.place === p.place
      ),
  );
  if (!pr) return;
  sellProperty(g, life, pr.id);
  addRenown(g, life, -3);
  journal(
    g,
    life,
    `The bailiffs sell your ${pr.name.toLowerCase()} for your debts. The whole street watches.`,
    "bad",
  );
}

/** What a property costs to keep a month. */
function keepOf(s: GameState, life: Life, pr: Property): number {
  return -propertyBudget(s, { ...life, property: [pr] }).total;
}

/** Keep for what you own, ventures, and what it costs to live beneath yourself. */
/** Share of a commissioned officer's pay that goes on keeping up the rank. */
export const OFFICER_KEEP = 0.2;

export function moneyMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  touchLife(g, life);
  bailiffs(g, life);
  // Keep: fodder, the coachman, the pew rent.
  for (const k of Object.keys(life.kit ?? {}) as KitKey[]) {
    if (!hasKit(s, life, k)) {
      if (k === "tools") {
        delete life.kit![k];
        journal(g, life, "Your good tools are worn out: time for new ones.");
      }
      continue;
    }
    const def = KIT[k];
    if (def.upkeep && life.purse < def.upkeep && life.purse < 0) {
      // Can't keep it: it goes.
      sellKit(g, life, k);
      continue;
    }
    if (def.upkeep) spend(g, life, def.upkeep);
    if (k === "carriage") addRenown(g, life, 0.3);
    if (k === "pew") {
      addRenown(g, life, 0.15);
      addStress(g, life, -1);
    }
  }
  venturesMonthly(g, life);
  // An officer keeps himself: mess bills, uniforms, horses and servants come
  // out of a commission's pay (about a fifth of it).
  const rank = rankOf(life);
  if (rank?.commission && !isChildLife(s, life)) {
    const keep = Math.round(rank.wage * OFFICER_KEEP * 100) / 100;
    if (keep > 0) spend(g, life, keep);
  }
  // Living beneath your station, when you could afford better: people talk.
  // (Fallen on hard times, they pity you instead.)
  const b = isChildLife(s, life) ? null : beneathStation(s, life);
  const st = stationOf(s, life);
  const native = lifeIsNative(s, life);
  const could = life.purse >= 2 * livingOf(native, st.expected).cost;
  const gap = could ? (b?.steps ?? 0) : 0;
  if (b && gap > 0) {
    addStress(g, life, BENEATH_STRESS * gap);
    if (life.renown > 0) addRenown(g, life, -BENEATH_RENOWN * gap);
    life.beneath = (life.beneath ?? 0) + 1;
    if (life.beneath === 1 || life.beneath % 12 === 0) {
      journal(
        g,
        life,
        b.living
          ? native
            ? `People talk: ${st.who}, and so little given away? Standing is measured by what you give.`
            : `People talk: ${st.who}, living like ${LIKE[life.lifestyle]}. ${st.name[0].toUpperCase()}${st.name.slice(1)} are expected to live ${LIVING_HOW[st.expected]}.`
          : `People talk: ${st.who}, and no ${b.house?.toLowerCase() ?? "house"} to show for it?`,
        "bad",
      );
    }
  } else if (life.beneath) life.beneath = 0;
}
