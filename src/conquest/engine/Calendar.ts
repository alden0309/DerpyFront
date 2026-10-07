// Derpy Conquest's calendar: day 0 is 1 January 1607, and every year has
// 365 days (no leap years, to keep months lined up).

import { DAYS_PER_YEAR, MONTH_DAYS, START_YEAR } from "./Rules";

export interface GameDate {
  year: number;
  /** 0 = January. */
  month: number;
  /** 1-based day of the month. */
  day: number;
}

const MONTH_START: number[] = [];
{
  let total = 0;
  for (const d of MONTH_DAYS) {
    MONTH_START.push(total);
    total += d;
  }
}

export function dateOf(day: number): GameDate {
  const year = START_YEAR + Math.floor(day / DAYS_PER_YEAR);
  const inYear = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  let month = 11;
  while (MONTH_START[month] > inYear) month--;
  return { year, month, day: inYear - MONTH_START[month] + 1 };
}

export function dayOf(year: number, month = 0, dayOfMonth = 1): number {
  return (
    (year - START_YEAR) * DAYS_PER_YEAR + MONTH_START[month] + dayOfMonth - 1
  );
}

/** Whether `day` is the first of a month. */
export function isMonthStart(day: number): boolean {
  return dateOf(day).day === 1;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDate(day: number): string {
  const d = dateOf(day);
  return `${d.day} ${MONTH_NAMES[d.month]} ${d.year}`;
}

export function formatMonth(day: number): string {
  const d = dateOf(day);
  return `${MONTH_NAMES[d.month].slice(0, 3)} ${d.year}`;
}
