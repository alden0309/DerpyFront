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
  if (month >= 5 && month <= 8) return 1.15;
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
