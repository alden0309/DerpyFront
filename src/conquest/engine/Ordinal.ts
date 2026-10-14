// LIFE (r21): the one way to write an ordinal: 1st, 2nd, 3rd, 4th, 11th,
// 12th, 13th, 21st, 22nd, 23rd, 101st, 111th, 112th. (A "2th" turned up in
// an invitation's date: every place that wrote one now calls this.)

/** "1st", "2nd", "3rd", "11th", "21st", "112th". */
export function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n)) % 100;
  const suffix =
    v >= 11 && v <= 13
      ? "th"
      : v % 10 === 1
        ? "st"
        : v % 10 === 2
          ? "nd"
          : v % 10 === 3
            ? "rd"
            : "th";
  return `${Math.trunc(n)}${suffix}`;
}

const UNITS = [
  "",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const TENTHS = [
  "",
  "",
  "twentieth",
  "thirtieth",
  "fortieth",
  "fiftieth",
  "sixtieth",
  "seventieth",
  "eightieth",
  "ninetieth",
];

/** "first", "second", "twenty-first", "thirtieth"; past ninety-nine, figures ("112th"). */
export function ordinalWord(n: number): string {
  const k = Math.trunc(n);
  if (k <= 0 || k >= 100) return ordinal(k);
  if (k < 20) return UNITS[k];
  const t = Math.floor(k / 10);
  const u = k % 10;
  return u === 0 ? TENTHS[t] : `${TENS[t]}-${UNITS[u]}`;
}
