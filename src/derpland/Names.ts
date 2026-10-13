// NAMES (r20): the rules for Derp Land usernames, shared by the server and
// the account pages: what a name may be (the same at sign-up and when it's
// changed), how often it may change, and how long a name given up stays
// with its old account. No DOM and no server imports, so both sides use it.

/** 3 to 20 letters, numbers or underscores. */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A username may change once in this many days. */
export const NAME_CHANGE_DAYS = 7;
export const NAME_CHANGE_MS = NAME_CHANGE_DAYS * DAY_MS;

/** A name given up stays with its account this long, so nobody can pass as them. */
export const NAME_HOLD_DAYS = 7;
export const NAME_HOLD_MS = NAME_HOLD_DAYS * DAY_MS;

/** Why a name can't be taken, as the server says it. */
export type NameProblem =
  | "invalid_username"
  | "username_taken"
  | "username_held"
  | "username_reserved";

/** Why a change of name was refused. */
export type RenameError =
  | NameProblem
  | "same_name"
  | "too_soon"
  | "accounts_unavailable"
  | "server_error";

/** When an account last changed its name allows the next change, or null (any time). */
export function nextNameChange(changedAt: number | null): number | null {
  return changedAt === null ? null : changedAt + NAME_CHANGE_MS;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A moment in the viewer's own time: "Tue 20 Oct, 5:20 pm" (with the year
 * when it isn't this year's). `up` rounds a part-minute up, for the time
 * something becomes allowed: at the minute shown it certainly is.
 */
export function formatWhen(
  at: number | string | Date,
  opts: { now?: number; up?: boolean } = {},
): string {
  let t = new Date(at).getTime();
  if (opts.up) t = Math.ceil(t / 60_000) * 60_000;
  const d = new Date(t);
  const now = new Date(opts.now ?? Date.now());
  const year =
    d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
}
