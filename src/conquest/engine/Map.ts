// The Derpy Conquest map: the 1600s Americas, built by
// scripts/conquest/build-map.mjs from Natural Earth data, plus the facts
// about each province the rules keep asking for (its resource, how many
// people it can hold, whether fevers are rife there).

import americas from "../data/americas.json";
import { provinceCapacity, rawGood } from "./Rules";
import { MapDef, RawGood } from "./Types";

export const AMERICAS: MapDef = americas as unknown as MapDef;

export interface World {
  map: MapDef;
  /** Each province's resource. */
  raw: RawGood[];
  /** Settlers each can hold before farms. */
  capacity: number[];
  /** Hot and wet: fevers kill settlers and soldiers. */
  tropical: boolean[];
  /** Hard winters: food falls off and armies freeze. */
  northern: boolean[];
  /** Key of the native nation or power that holds it at the start, if any. */
  startOwner: (string | null)[];
}

const worlds = new WeakMap<MapDef, World>();

export function worldOf(map: MapDef): World {
  let w = worlds.get(map);
  if (w) return w;
  w = {
    map,
    raw: map.provinces.map((p) => rawGood(p.good, p.lat)),
    capacity: map.provinces.map((p) => provinceCapacity(p.terrain, p.areaKm2)),
    tropical: map.provinces.map(
      (p) =>
        Math.abs(p.lat) < 24 &&
        (p.terrain === "jungle" ||
          p.terrain === "marsh" ||
          p.terrain === "plains" ||
          p.terrain === "forest"),
    ),
    northern: map.provinces.map((p) => p.lat > 42 || p.lat < -42),
    startOwner: map.provinces.map((p) => p.owner),
  };
  worlds.set(map, w);
  return w;
}

/** Straight-line km between two provinces' centres. */
export function kmBetween(map: MapDef, a: number, b: number): number {
  const pa = map.provinces[a];
  const pb = map.provinces[b];
  const rad = Math.PI / 180;
  const dLat = (pb.lat - pa.lat) * rad;
  const dLon = (pb.lon - pa.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(pa.lat * rad) * Math.cos(pb.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Winter months for a province: food falls off and armies suffer. */
export function isWinter(lat: number, month: number): boolean {
  if (lat > 35) return month === 11 || month <= 1 || (lat > 44 && month === 2);
  if (lat < -35) return month >= 5 && month <= 7;
  return false;
}

/** Fever season in the hot, wet lowlands. */
export function isFeverSeason(lat: number, month: number): boolean {
  if (lat >= 0) return month >= 5 && month <= 9;
  return month >= 11 || month <= 3;
}

/** Hurricane season in the Caribbean and the Gulf. */
export function isHurricaneSeason(
  lat: number,
  lon: number,
  month: number,
): boolean {
  return (
    lat > 10 && lat < 33 && lon > -98 && lon < -60 && month >= 7 && month <= 9
  );
}
