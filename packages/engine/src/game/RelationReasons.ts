import {
  OpinionReason,
  RELATION_REASONS,
  RelationReason,
} from "@openfront/engine-api/game/Opinion";

/**
 * Bookkeeping behind the player panel's "Their opinion of you": how much of
 * one player's relation value toward another comes from each kind of event.
 * Display only. Nothing in the simulation reads it, it isn't in the game
 * hash, and it's kept only where the panel can show it: a nation's or
 * tribe's opinion of a human (see PlayerImpl.keepsRelationParts).
 *
 * The parts are stored as of the last change and fade lazily. Between
 * changes a relation only drifts toward 0 (decayRelations), and fading every
 * part by the same factor keeps them adding up to the value; doing that when
 * the parts are next touched (a change, or a read for the panel) gives the
 * same result as doing it every tick, at no cost per tick.
 */
export type RelationParts = Map<RelationReason, number>;

/** Parts this small are dropped (they round to nothing anyway). */
const NEGLIGIBLE = 1e-9;

function sumParts(parts: RelationParts): number {
  let sum = 0;
  for (const v of parts.values()) sum += v;
  return sum;
}

function dropNegligible(parts: RelationParts): void {
  for (const [reason, v] of parts) {
    if (Math.abs(v) < NEGLIGIBLE) parts.delete(reason);
  }
}

/**
 * Fades the parts (which add up to what the value was at the last change)
 * to the value now. The value has only drifted toward 0 since, so this is a
 * factor in 0..1; a value back at 0 leaves nothing to explain.
 */
function fadeParts(parts: RelationParts, value: number): void {
  const sum = sumParts(parts);
  if (value === 0 || sum === 0) {
    parts.clear();
    if (value !== 0) parts.set("other", value);
    return;
  }
  if (sum === value) return;
  const k = value / sum;
  for (const [reason, v] of parts) parts.set(reason, v * k);
}

/**
 * Makes the parts add up to `value` after a change pushed the value past
 * +-100: the parts on the side of the limit share what fits, in proportion,
 * and the other side keeps its full weight. Also absorbs float drift.
 */
function fitParts(parts: RelationParts, value: number): void {
  let pos = 0;
  let neg = 0;
  for (const v of parts.values()) {
    if (v > 0) pos += v;
    else neg += v;
  }
  const sum = pos + neg;
  if (sum === value) return;
  if (sum > value && pos > 0 && value - neg >= 0) {
    const k = (value - neg) / pos;
    for (const [reason, v] of parts) if (v > 0) parts.set(reason, v * k);
  } else if (sum < value && neg < 0 && value - pos <= 0) {
    const k = (value - pos) / neg;
    for (const [reason, v] of parts) if (v < 0) parts.set(reason, v * k);
  } else if (sum !== 0) {
    const k = value / sum;
    for (const [reason, v] of parts) parts.set(reason, v * k);
  } else {
    parts.set("other", (parts.get("other") ?? 0) + value);
  }
}

/**
 * Records a change of `delta` for `reason`: the relation went from `before`
 * (where it had drifted since the last change) to `after` (clamped).
 */
export function recordRelationChange(
  parts: RelationParts,
  reason: RelationReason,
  before: number,
  delta: number,
  after: number,
): void {
  fadeParts(parts, before);
  parts.set(reason, (parts.get(reason) ?? 0) + delta);
  fitParts(parts, after);
  dropNegligible(parts);
}

/**
 * The relation value as shown: rounded down, so the number always agrees
 * with the Relation band (-50.5 is Hostile and shows -51; 49.9 is Neutral
 * and shows 49).
 */
export function shownRelationValue(value: number): number {
  return Math.floor(value) || 0;
}

/**
 * Whole-point parts that add up exactly to shownRelationValue(value),
 * largest first. Anything the parts don't explain (a value from before
 * reasons were kept) shows as "other".
 */
export function opinionReasons(
  parts: RelationParts | undefined,
  value: number,
): OpinionReason[] {
  const raw: RelationParts = new Map(parts ?? []);
  fadeParts(raw, value);
  const target = shownRelationValue(value);
  const rows = RELATION_REASONS.filter((r) => raw.has(r)).map((reason) => {
    const amount = raw.get(reason)!;
    const whole = Math.floor(amount);
    return { reason, amount: whole, rest: amount - whole };
  });
  // Largest remainder: hand the points lost to rounding down to the parts
  // that lost the most. The shortfall is 0..rows.length, or -1 when float
  // drift puts the parts a hair above a whole value that `value` is below.
  let shortfall = target - rows.reduce((s, r) => s + r.amount, 0);
  const byRest = [...rows].sort((a, b) => b.rest - a.rest);
  for (const row of byRest) {
    if (shortfall <= 0) break;
    row.amount += 1;
    shortfall--;
  }
  for (const row of byRest.reverse()) {
    if (shortfall >= 0) break;
    row.amount -= 1;
    shortfall++;
  }
  if (shortfall !== 0) {
    // Nothing to adjust: a value within a hair of a whole number with no
    // parts recorded.
    const other = rows.find((r) => r.reason === "other");
    if (other) other.amount += shortfall;
    else rows.push({ reason: "other", amount: shortfall, rest: 0 });
  }
  return rows
    .filter((r) => r.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .map(({ reason, amount }) => ({ reason, amount }));
}
