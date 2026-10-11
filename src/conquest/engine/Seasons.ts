// MAP (r12): seasons that matter. The year turns the same for everyone (the
// whole board lies north of the equator), but what each season brings
// depends on where you are:
//
//   winter  snow and ice in the north: roads slower and harder, rivers you
//           can cross on the ice, harbours and rivers frozen shut, colds and
//           pleurisy, fewer people on the roads; in the south and the
//           islands, the dry season
//   spring  the thaw: mud on every northern road, rivers in flood
//   summer  the campaigning season (good roads), and fevers in the south
//   autumn  the harvest: work in the fields at harvest wages, a good or bad
//           harvest for the year, then the frolics; and the hurricanes in
//           the Caribbean and the Gulf (August to October)
//
// Everything here depends only on the date and the place (and, for the
// harvests, the year and the country), so every machine works out the same
// seasons. The rules that use them live with their systems; the pure facts
// are here, for the engine and the map alike.

import { dateOf } from "./Calendar";
import { isFeverSeason, isHurricaneSeason, isWinter } from "./Map";

export type SeasonKey = "winter" | "spring" | "summer" | "autumn";

/** The season of a month: December to February is winter, and so on. */
export function seasonOfMonth(month: number): SeasonKey {
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

export function seasonOfDay(day: number): SeasonKey {
  return seasonOfMonth(dateOf(day).month);
}

/** A place, as far as the seasons care. */
export interface SeasonPlace {
  lat: number;
  lon: number;
  coastal: boolean;
  terrain?: string;
}

/** The far north: hard winters, long freezes. */
export function isNorth(lat: number): boolean {
  return lat > 42;
}

/** The south: Carolina and below, the Gulf, the islands, New Spain. */
export function isSouth(lat: number): boolean {
  return lat < 35;
}

/** Mud season: the thaw turns the northern roads to soup (March and April). */
export function isMudSeason(lat: number, month: number): boolean {
  if (lat >= 46) return month === 3 || month === 4;
  if (lat >= 38) return month === 2 || month === 3;
  return false;
}

/** The spring floods: snowmelt fills the rivers (March to May in the north). */
export function isFloodSeason(lat: number, month: number): boolean {
  if (lat >= 44) return month >= 3 && month <= 4;
  if (lat >= 36) return month >= 2 && month <= 3;
  return false;
}

/**
 * Whether ice locks a place's harbour (and its rivers) this month: the
 * St. Lawrence and its gulf December to April, Hudson's Bay and Labrador
 * longer, the lakes and northern rivers through the deep winter. The open
 * Atlantic ports (Boston, Halifax, St. John's) stay open.
 */
export function iceBound(p: SeasonPlace, month: number): boolean {
  const { lat, lon } = p;
  if (!p.coastal) {
    // The lakes and the rivers inland.
    if (lat >= 46) return month === 11 || month <= 3;
    if (lat >= 41.5) return month === 11 || month <= 2;
    return false;
  }
  if (lat >= 55) return month >= 10 || month <= 5;
  if (lat >= 50) return month === 11 || month <= 4;
  // The St. Lawrence and its gulf.
  if (lat >= 45.5 && lon > -76 && lon < -60) return month === 11 || month <= 3;
  return false;
}

/** Whether the rivers here are frozen hard enough to walk over. */
export function riversFrozen(lat: number, month: number): boolean {
  if (lat >= 46) return month === 11 || month <= 2;
  if (lat >= 42) return month === 0 || month === 1;
  return false;
}

/**
 * How much slower a day on the road is this month at a place: snow in the
 * northern winter, mud in the thaw, nothing in the summer (the campaigning
 * season) or autumn. Mountains are worse in winter. 1 is a normal day.
 */
export function roadFactor(p: SeasonPlace, month: number): number {
  const { lat } = p;
  let f = 1;
  if (isWinter(lat, month) && isNorth(lat)) {
    f = lat >= 50 ? 1.6 : 1.35;
    if (p.terrain === "mountains" || p.terrain === "hills") f += 0.2;
  } else if (isMudSeason(lat, month)) f = lat >= 44 ? 1.3 : 1.2;
  return f;
}

/** Days a river crossing takes this month, against the usual: over the ice in winter, swollen in spring. */
export function riverFactor(lat: number, month: number): number {
  if (riversFrozen(lat, month)) return 0;
  if (isFloodSeason(lat, month)) return 2;
  return 1;
}

/** How many people take to the roads this month, against the usual (fewer in a hard winter). */
export function travelFactor(lat: number, month: number): number {
  if (isWinter(lat, month) && isNorth(lat)) return lat >= 50 ? 0.35 : 0.55;
  if (isMudSeason(lat, month)) return 0.8;
  return 1;
}

/** Sickness in the air: colds and pleurisy in a northern winter, fevers in a southern summer. */
export function sicknessRisk(
  p: SeasonPlace,
  month: number,
  tropical: boolean,
): { risk: number; kind: "chill" | "fever" | null } {
  if (isWinter(p.lat, month) && p.lat > 38)
    return { risk: p.lat >= 46 ? 0.07 : 0.05, kind: "chill" };
  if ((tropical || isSouth(p.lat)) && isFeverSeason(p.lat, month))
    return { risk: tropical ? 0.08 : 0.05, kind: "fever" };
  return { risk: 0, kind: null };
}

/** The harvest months (the corn and wheat are brought in; elsewhere the tobacco is cut and the cane ground). */
export function isHarvest(lat: number, month: number): boolean {
  if (lat >= 30) return month === 8 || month === 9;
  return month === 0 || month === 1 || month === 2;
}

export type HarvestKind = "poor" | "fair" | "good";

/**
 * How the year's harvest came in around a place: one country's harvest is
 * its neighbours' too (the weather comes over whole regions). The same in
 * every game: the years have their own weather.
 */
export function harvestOf(lat: number, lon: number, year: number): HarvestKind {
  const rx = Math.floor((lon + 180) / 7);
  const ry = Math.floor((lat + 90) / 5);
  let h = Math.imul(
    (rx * 73856093) ^ (ry * 19349663) ^ (year * 83492791),
    2654435761,
  );
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  const u = (h >>> 0) / 4294967296;
  // Some years were hard all over (the great frost of 1709, the cold
  // years of the 1690s).
  const hard = HARD_YEARS.has(year) ? 0.3 : 0;
  if (u < 0.2 + hard) return "poor";
  if (u > 0.74 + hard) return "good";
  return "fair";
}

/** Years remembered for their cold and their hunger. */
const HARD_YEARS = new Set([1608, 1675, 1695, 1696, 1697, 1698, 1709, 1740]);

/** The harvest a month's prices and wages answer to: this year's from the harvest on, last year's before. */
export function harvestNow(lat: number, lon: number, day: number): HarvestKind {
  const d = dateOf(day);
  const year = lat >= 30 ? (d.month >= 8 ? d.year : d.year - 1) : d.year;
  return harvestOf(lat, lon, year);
}

/** What the harvest does to the price of food: dear after a poor one, cheap after a good one. */
export function harvestPriceFactor(kind: HarvestKind): number {
  return kind === "poor" ? 1.25 : kind === "good" ? 0.86 : 1;
}

/** What a month does to the price of food in the north: dearest in the hungry months of late winter. */
export const FOOD_MONTHS: readonly number[] = [
  1.06, 1.18, 1.26, 1.22, 1.12, 1.05, 1, 0.96, 0.82, 0.82, 0.9, 0.98,
];

/** What a month does to the price of food somewhere (the north's hungry months; milder in the south). */
export function foodSeasonFactor(
  lat: number,
  lon: number,
  day: number,
): number {
  const d = dateOf(day);
  const base =
    lat > 30
      ? FOOD_MONTHS[d.month]
      : d.month >= 8 && d.month <= 10
        ? 0.93
        : 1.03;
  return base * harvestPriceFactor(harvestNow(lat, lon, day));
}

/** The season's name and sign for the date line: where you are decides what it brings. */
export function seasonLabel(
  p: SeasonPlace,
  day: number,
): { key: SeasonKey; name: string; note: string | null; icon: string } {
  const month = dateOf(day).month;
  const key = seasonOfMonth(month);
  const tropical = p.lat < 24;
  let note: string | null = null;
  let icon: string = key;
  if (isHurricaneSeason(p.lat, p.lon, month)) {
    note = "hurricane season";
    icon = "hurricane";
  } else if (key === "winter") {
    if (iceBound(p, month)) note = "ice-bound";
    else if (isNorth(p.lat)) note = "deep snow";
    else if (tropical) note = "the dry season";
  } else if (key === "spring") {
    if (isMudSeason(p.lat, month)) note = "mud season";
    else if (isFloodSeason(p.lat, month)) note = "the rivers in flood";
  } else if (key === "summer") {
    if (isFeverSeason(p.lat, month) && (tropical || isSouth(p.lat)))
      note = "fever season";
    else note = "the campaigning season";
  } else if (isHarvest(p.lat, month)) note = "harvest";
  const name = key[0].toUpperCase() + key.slice(1);
  return { key, name, note, icon };
}

// ---------------------------------------------------------------- work and bread

/** Work that's busiest at the harvest (and idle in a northern winter). */
const FIELD_WORK = new Set(["farmer", "grower", "servant"]);
/** The mills grind the harvest through the autumn. */
const MILL_WORK = new Set(["miller", "millhand"]);
/** Furs are prime in the cold months. */
const FUR_WORK = new Set(["trapper", "hunter"]);
/** The fishing boats stay in through the ice and the gales. */
const FISH_WORK = new Set(["fisherman", "whaler"]);
/** Waterfront work that stops when the harbour freezes. */
const HARBOUR_WORK = new Set([
  "sailor",
  "shipwright",
  "ropewalker",
  "smuggler",
  "pirate",
]);

/** What a harvest pays on top of a hand's wage. */
export const HARVEST_BONUS: Record<HarvestKind, number> = {
  poor: 0.15,
  fair: 0.35,
  good: 0.6,
};

const HARVEST_WORDS: Record<HarvestKind, string> = {
  poor: "a poor harvest",
  fair: "a fair harvest",
  good: "a good harvest",
};

/**
 * The season's turn in a month's money: harvest wages for the hands in the
 * fields (as the harvest came in), prime furs for the trappers in a
 * northern winter, little work for the fishermen and the waterfront when
 * the ice is in, little in the fields in a northern winter, and bread dear
 * in the hungry months of late winter. `wage` is the month's wage (by the
 * days worked), `living` what living costs a month; `day` is a day of the
 * month worked.
 */
export function seasonPay(
  p: SeasonPlace,
  day: number,
  job: string | null,
  wage: number,
  living: number,
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const month = dateOf(day).month;
  // In quarter-coins, as wages are reckoned.
  const add = (label: string, value: number) => {
    const v = Math.round(value * 4) / 4;
    if (v) out.push({ label, value: v });
  };
  if (job && wage > 0) {
    const northWinter = isWinter(p.lat, month) && isNorth(p.lat);
    if (FIELD_WORK.has(job) && isHarvest(p.lat, month)) {
      const h = harvestNow(p.lat, p.lon, day);
      add(`Harvest wages (${HARVEST_WORDS[h]})`, wage * HARVEST_BONUS[h]);
    } else if (FIELD_WORK.has(job) && northWinter)
      add("Winter: little to do in the fields", -wage * 0.2);
    if (MILL_WORK.has(job) && (month === 9 || month === 10))
      add("The mill grinds the harvest", wage * 0.25);
    if (FUR_WORK.has(job) && northWinter) add("Prime winter furs", wage * 0.3);
    if (FISH_WORK.has(job) && northWinter)
      add("Ice and gales keep the boats in", -wage * 0.35);
    if (HARBOUR_WORK.has(job) && iceBound(p, month))
      add("The harbour's frozen: little work", -wage * 0.4);
  }
  // The long northern winters: the stores run low by February.
  if (living > 0 && p.lat > 40 && month >= 1 && month <= 3) {
    const h = harvestNow(p.lat, p.lon, day);
    add(
      h === "poor"
        ? "Bread dear after a poor harvest"
        : "Bread dear in the hungry months",
      -living * (h === "poor" ? 0.25 : h === "good" ? 0.06 : 0.12),
    );
  }
  return out;
}

/**
 * What the season brings where you are, line by line, for the date's
 * tooltip and the guide: the roads, the rivers and the harbour, sickness,
 * work and bread.
 */
export function seasonNotes(
  p: SeasonPlace,
  day: number,
  tropical: boolean,
): string[] {
  const month = dateOf(day).month;
  const out: string[] = [];
  const { lat } = p;
  const road = roadFactor(p, month);
  if (road > 1.01)
    out.push(
      isMudSeason(lat, month)
        ? `Mud season: the roads about ${Math.round((road - 1) * 100)}% slower.`
        : `Snow on the roads: about ${Math.round((road - 1) * 100)}% slower${p.terrain === "mountains" || p.terrain === "hills" ? " (worse in the hills)" : ""}.`,
    );
  else if (month >= 5 && month <= 7)
    out.push("The campaigning season: the roads at their best.");
  if (riversFrozen(lat, month))
    out.push("The rivers are frozen: crossed on the ice, no ferry wanted.");
  else if (isFloodSeason(lat, month))
    out.push("The rivers are in flood: a crossing takes twice as long.");
  if (p.coastal && iceBound(p, month))
    out.push(
      "The harbour is ice-bound: no ships in or out until the ice goes out.",
    );
  const sick = sicknessRisk(p, month, tropical);
  if (sick.kind === "chill")
    out.push(
      "Colds and pleurisy about: keep warm (living frugally is riskier).",
    );
  if (sick.kind === "fever")
    out.push(
      "The fever season: agues and worse, above all in the hot lowlands.",
    );
  if (isHurricaneSeason(lat, p.lon, month))
    out.push("Hurricane season: storms at sea and on the coasts.");
  if (isWinter(lat, month) && isNorth(lat))
    out.push("Fewer people on the roads; trappers' furs are prime.");
  if (isHarvest(lat, month)) {
    const h = harvestNow(p.lat, p.lon, day);
    out.push(
      `The harvest (${h === "good" ? "a good one" : h === "poor" ? "a poor one" : "a fair one"}): hands wanted in the fields at harvest wages, then the frolics.`,
    );
  }
  if (lat > 30 && month >= 1 && month <= 3) {
    const h = harvestNow(p.lat, p.lon, day);
    out.push(
      `The hungry months: corn dear at market${lat > 40 ? ", and the cost of living up" : ""}${h === "poor" ? ", dearer after last year's poor harvest" : ""}.`,
    );
  }
  if (!out.length)
    out.push(
      tropical || lat < 24
        ? "The dry season: good roads and healthy months."
        : "A quiet season: nothing much in the way.",
    );
  return out;
}
