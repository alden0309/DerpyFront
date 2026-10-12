// SEA (r15): how fast you go by sea. A passage on someone else's ship: two
// days in port to find one going your way, then about 160 km a day (four
// to five knots with the wind, what coasting voyages averaged), and a day
// at each port of call when the voyage goes on. A short crossing (a ferry
// over the James, across a bay) is a day or two at most. Your own boat: a
// day to get away, then 160 km a day times her speed. Natives paddle the
// coasts in short hops from any shore. FIXES measured the old speeds
// (ANSWERS.md); these are the speeds it proposed. Armies keep their own
// (embarking a regiment takes longer: Paths.ts).
//
// A leaf: it imports nothing, so anything can use it.

/** Kilometres a day at sea, on a passage or in your own boat (times her speed). */
export const SEA_KM_DAY = 160;
/** Days in port to find a ship going your way. */
export const PASSAGE_FIND_DAYS = 2;
/** Days at each port of call when the voyage goes on. */
export const PASSAGE_CALL_DAYS = 1;
/** A crossing this short is a ferry: a day or two at most. */
export const SHORT_CROSSING_KM = 120;
/** A day to get away in your own boat. */
export const OWN_BOAT_PORT_DAYS = 1;
/** A canoe paddles at this much of a ship's pace. */
export const CANOE_SPEED = 0.8;

/**
 * Days for a passage over one sea lane of `km`: finding a ship (or, when the
 * voyage goes on from here, a day at a port of call), then the sailing. A
 * short crossing that is the whole of the voyage (a ferry over the James,
 * across a bay: not `afterSea`, and `last`) is a day or two.
 */
export function passageHopDays(
  km: number,
  afterSea = false,
  last = true,
): number {
  if (km <= SHORT_CROSSING_KM && !afterSea && last) return km <= 50 ? 1 : 2;
  return (
    (afterSea ? PASSAGE_CALL_DAYS : PASSAGE_FIND_DAYS) +
    Math.ceil(km / SEA_KM_DAY)
  );
}

/** Days for a hop by canoe along the coast: a day to the water, then paddling. */
export function canoeHopDays(km: number): number {
  return 1 + Math.ceil(km / (SEA_KM_DAY * CANOE_SPEED));
}

/** Days for a leg in your own boat of `speed` (a sloop is 1.25). */
export function ownBoatHopDays(km: number, speed: number): number {
  return OWN_BOAT_PORT_DAYS + Math.ceil(km / (SEA_KM_DAY * speed));
}
