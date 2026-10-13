// ECON (r17): leave from your work. Tell your master you're going away, for
// a number of days, and they'll agree or refuse by what they think of you,
// your place, how long and what the work is just now (with the reasons, and
// the odds before you ask). While you're on leave you aren't counted as
// away from your post: you're paid nothing (an officer is on half pay), and
// you're expected back by its last day. Overstay it and a letter comes, then
// the sack. A county officer asks leave of whoever appointed them (an
// elected one gives the county notice), and the duty doesn't count as
// neglected while they're away. A business of your own needs no leave, but
// someone to mind it: a manager.

import { dateOf, formatDate, isMonthStart } from "./Calendar";
import { npc } from "./EventPacing";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { earn, journal, touchLife } from "./LifeCore";
import {
  atPost,
  Check,
  isChildLife,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  yes,
} from "./LifeQueries";
import { AWAY_WARN_DAYS, JOBS } from "./LifeRules";
import { edice } from "./LoanCore";
import type { World } from "./Map";
import { appointerOf, officeName } from "./Offices";
import { wake } from "./Pace";
import { charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { effortOf } from "./Trades";
import type {
  Breakdown,
  Character,
  EconCommand,
  GameState,
  Leave,
  LeaveState,
  Life,
  LifeCommand,
  LocalOffice,
  Part,
} from "./Types";
import { bossOf, leaveJob } from "./Work";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Days of leave to ask for. */
export const LEAVE_DAYS = [14, 30, 60, 90, 120];
/** The most leave anyone gives at once. */
export const LEAVE_MAX = 180;
/** Days past your leave before the warning comes, and before your place is gone. */
export const OVERSTAY_WARN = 7;
export const OVERSTAY_SACK = 21;
/** Refused: not asked again for this many days. */
export const LEAVE_REST = 30;
/** Leave kept on the record (for the duty's reckoning and "leave already this year"). */
const LEAVE_KEEP = 400;

// ---------------------------------------------------------------- the state

/** A life's leave, made the first time it's needed. */
function leaveState(g: ConquestGame, life: Life): LeaveState {
  touchLife(g, life);
  return (life.leave ??= { list: [] });
}

/** Whose leave it is, as a key ("job", or an office's id). */
const keyOf = (of: "job" | number) => String(of);

/** Leave granted for this (the job, or an office) that's still running or overstayed. */
export function leaveFor(
  s: GameState,
  life: Life,
  of: "job" | number = "job",
): Leave | undefined {
  const list = life.leave?.list ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const lv = list[i];
    if (lv.of === of && lv.ended === undefined && lv.from <= s.day) return lv;
  }
  return undefined;
}

/** On leave today (within its days). */
export function onLeave(
  s: GameState,
  life: Life,
  of: "job" | number = "job",
): Leave | undefined {
  const lv = leaveFor(s, life, of);
  return lv && s.day <= lv.until ? lv : undefined;
}

/** County offices a life holds. */
export function heldOffices(s: GameState, life: Life): LocalOffice[] {
  const out: LocalOffice[] = [];
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) if (o.holder === life.c && life.c >= 0) out.push(o);
  return out;
}

/** An office by its id. */
function officeById(s: GameState, id: number): LocalOffice | undefined {
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) if (o.id === id) return o;
  return undefined;
}

/** Days of granted leave from an office since a day (its duty doesn't count as neglected for them). */
export function officeLeaveDays(
  s: GameState,
  life: Life | undefined,
  o: LocalOffice,
): number {
  let n = 0;
  for (const lv of life?.leave?.list ?? []) {
    if (lv.of !== o.id) continue;
    const a = Math.max(lv.from, o.duty);
    const b = Math.min(lv.ended ?? lv.until, lv.until, s.day);
    if (b >= a) n += b - a + 1;
  }
  return n;
}

// ---------------------------------------------------------------- who gives it, and the odds

/** Who gives this leave: your master, or whoever appointed you (null: nobody's leave is needed). */
export function leaveGiver(
  s: GameState,
  life: Life,
  of: "job" | number,
): Character | null {
  if (of === "job") return bossOf(s, life) ?? null;
  const o = officeById(s, of);
  if (!o) return null;
  const by = appointerOf(s, o);
  const c = by >= 0 ? s.chars[by] : undefined;
  return c?.alive && c.id !== life.c ? c : null;
}

/** An officer's rank (a commission): on half pay while on leave. */
export function halfPayRank(life: Life): boolean {
  const job = life.job;
  return !!job && !!JOBS[job.kind].ranks[job.rank]?.commission;
}

/** Whether you could ask for leave of this length now (they'll still decide). */
export function leaveCheck(
  s: GameState,
  life: Life,
  days: number,
  of: "job" | number = "job",
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're sixteen.");
  if (!Number.isFinite(days) || days < 7 || days > LEAVE_MAX)
    return no(`From a week to ${LEAVE_MAX} days.`);
  if (of === "job") {
    const job = life.job;
    if (!job) return no("You have no work to leave.");
    if (job.own)
      return no(
        "You're your own master: a business of yours needs a manager, not leave.",
      );
    if (job.army >= 0) return no("Not while you march with the army.");
    if (job.kind === "servant" && (job.until ?? 0) > s.day)
      return no("Bound by indenture: your master doesn't give leave.");
  } else {
    const o = officeById(s, of);
    if (!o || o.holder !== life.c) return no("It isn't your office.");
  }
  if (onLeave(s, life, of)) return no("You're on leave already.");
  if (life.leave?.asked) return no("Your last request waits on an answer.");
  const until = life.leave?.refused?.[keyOf(of)] ?? 0;
  if (until > s.day)
    return no(`Refused lately: ask again in ${until - s.day} days.`);
  return yes;
}

/** The odds your master (or appointer) gives this leave, and why: the same the asking rolls. */
export interface LeaveOdds {
  p: number;
  why: Breakdown;
  by: Character | null;
  /** The giver is another player: they're asked, and answer for themselves. */
  player: boolean;
  half: boolean;
}

export function leaveOdds(
  s: GameState,
  life: Life,
  days: number,
  of: "job" | number = "job",
): LeaveOdds {
  const by = leaveGiver(s, life, of);
  const me = meOf(s, life);
  const e = new Explain().add("A fair request", 10);
  const half = of === "job" && halfPayRank(life);
  if (!by || !me)
    return {
      p: 1,
      why: e.add("You give notice: nobody's leave is needed", 100).done(0),
      by,
      player: false,
      half,
    };
  const op = opinionOf(s, by, life).total;
  e.add(`What they think of you (${op})`, Math.max(-30, Math.min(30, op / 2)));
  if (days <= 14) e.add("A short while", 5);
  else if (days <= 30) e.add("A month", 0);
  else if (days <= 60) e.add("Two months is long", -10);
  else if (days <= 90) e.add("Three months is long", -20);
  else e.add("Four months and more", -30 - Math.round((days - 120) / 6));
  const month = dateOf(s.day).month; // 0, January
  if (of === "job") {
    const job = life.job!;
    const rank = JOBS[job.kind].ranks[job.rank];
    if (job.rank > 0) e.add(`Your place: ${rank?.title.toLowerCase()}`, 4 * job.rank);
    const war = s.wars.some((x) => x.a === job.nation || x.b === job.nation);
    if (
      war &&
      (job.kind === "soldier" || job.kind === "militia" || job.kind === "warrior")
    )
      e.add("In wartime every man is needed", -40);
    if (
      (job.kind === "farmer" || job.kind === "grower" || job.kind === "millhand") &&
      [7, 8, 9].includes(month)
    )
      e.add("At the harvest", -15);
    if ((job.kind === "farmer" || job.kind === "grower") && [3, 4].includes(month))
      e.add("At the planting", -10);
    if (job.months < 3 && s.day - job.since < 90) e.add("New to the place", -15);
    if ((job.awayDays ?? 0) > 7) e.add("Often away from your post", -15);
    else if ((job.lastWorked ?? 0) >= 20) e.add("Never misses a day", 5);
    if (effortOf(life) === "shirk") e.add("Known to shirk", -15);
    else if (effortOf(life) === "hard" || effortOf(life) === "overtime")
      e.add("Works harder than anyone", 5);
  } else {
    const o = officeById(s, of as number);
    if (o && s.day - o.duty <= 45) e.add("Your duty done lately", 5);
    else if (o && s.day - o.duty > 120) e.add("Your duty neglected", -15);
  }
  if (hasTrait(me, "diligent")) e.add("Hard-working", 5);
  if (hasTrait(me, "lazy")) e.add("Idle", -10);
  if (hasTrait(me, "drunkard")) e.add("Fond of the bottle", -5);
  const lately = (life.leave?.list ?? []).some(
    (lv) => lv.of === of && s.day - lv.from < DAYS_PER_YEAR,
  );
  if (lately) e.add("Leave already this year", -15);
  const why = e.done(0);
  const player = !!lifeOfChar(s, by.id);
  return {
    p: r2(Math.max(0.03, Math.min(0.97, 0.5 + why.total / 60))),
    why,
    by,
    player,
    half,
  };
}

// ---------------------------------------------------------------- asking, and answering

/** Ask for leave: one of the computer's people answers now (at the odds shown); a player is asked. */
export function askLeave(
  g: ConquestGame,
  life: Life,
  days: number,
  of: "job" | number = "job",
): string | null {
  const s = g.s;
  const check = leaveCheck(s, life, days, of);
  if (!check.ok) return check.why;
  const o = leaveOdds(s, life, days, of);
  const what = of === "job" ? "your work" : officeWords(s, of as number);
  if (!o.by) {
    grant(g, life, days, of, -1, o.half);
    return null;
  }
  const other = lifeOfChar(s, o.by.id);
  if (other) {
    leaveState(g, life).asked = { of, days, day: s.day, to: o.by.id };
    journal(
      g,
      life,
      `You ask ${charName(o.by)} for ${days} days' leave from ${what}. It waits on ${o.by.female ? "her" : "his"} answer.`,
    );
    hooksRaise(g, other, "leave-ask", { c: life.c, d: days });
    return null;
  }
  if (edice(g).chance(o.p)) {
    grant(g, life, days, of, o.by.id, o.half);
    return null;
  }
  const st = leaveState(g, life);
  (st.refused ??= {})[keyOf(of)] = s.day + LEAVE_REST;
  const against = o.why.parts
    .filter((p) => p.value < 0)
    .map((p) => p.label.replace(/ \(.*\)$/, "").toLowerCase());
  journal(
    g,
    life,
    `${charName(o.by)} won't give you leave from ${what}${against.length ? `: ${against.slice(0, 2).join(", ")}` : ""}.`,
    "bad",
  );
  return null;
}

/** Words for an office ("your place as churchwarden"). */
function officeWords(s: GameState, id: number): string {
  const o = officeById(s, id);
  return o ? `your place as ${officeName(s, o).toLowerCase()}` : "your office";
}

/** Leave granted. */
function grant(
  g: ConquestGame,
  life: Life,
  days: number,
  of: "job" | number,
  by: number,
  half: boolean,
): void {
  const s = g.s;
  const st = leaveState(g, life);
  st.list = st.list.filter(
    (lv) => s.day - (lv.ended ?? lv.until) <= LEAVE_KEEP,
  );
  const lv: Leave = {
    of,
    from: s.day,
    until: s.day + days - 1,
    by,
    ...(half ? { half: true } : {}),
  };
  st.list.push(lv);
  const what = of === "job" ? "your work" : officeWords(s, of as number);
  const giver = by >= 0 ? charName(s.chars[by]) : "";
  journal(
    g,
    life,
    by >= 0
      ? `${giver} gives you ${days} days' leave from ${what}, to ${formatDate(lv.until)}${of === "job" ? (half ? ", on half pay" : ", without pay") : ""}. Be back by then.`
      : `You give notice of ${days} days away from ${what}, to ${formatDate(lv.until)}.`,
    "good",
  );
}

/** The player master answers a request for leave. */
export function answerLeave(
  g: ConquestGame,
  boss: Life,
  c: number,
  yesA: boolean,
): string | null {
  const s = g.s;
  const life = lifeOfChar(s, c);
  const asked = life?.leave?.asked;
  if (!life || !asked || asked.to !== boss.c) return "Nobody's asking.";
  leaveState(g, life).asked = null;
  if (yesA) {
    grant(g, life, asked.days, asked.of, boss.c, asked.of === "job" && halfPayRank(life));
    journal(g, boss, `You give ${charName(meOf(s, life))} ${asked.days} days' leave.`);
    return null;
  }
  const st = leaveState(g, life);
  (st.refused ??= {})[keyOf(asked.of)] = s.day + LEAVE_REST;
  journal(g, life, `${charName(meOf(s, boss))} won't give you leave.`, "bad");
  journal(g, boss, `You refuse ${charName(meOf(s, life))} leave.`);
  return null;
}

/** A few weeks more, asked by letter when you've overstayed (the same odds, less for overstaying). */
export function askMore(g: ConquestGame, life: Life, days: number): string | null {
  const s = g.s;
  const lv = leaveFor(s, life, "job");
  if (!lv || s.day <= lv.until) return "You're not overstaying.";
  const o = leaveOdds(s, life, days, "job");
  const p = Math.max(0.03, o.p - 0.25);
  if (!o.by || o.player) return "Nobody to ask by letter.";
  if (edice(g).chance(p)) {
    lv.until = s.day + days - 1;
    delete lv.warned;
    touchLife(g, life);
    journal(
      g,
      life,
      `${charName(o.by)} writes that you may have until ${formatDate(lv.until)}, and no longer.`,
      "good",
    );
    if (life.job) life.job.awayDays = 0;
    return null;
  }
  journal(g, life, `${charName(o.by)} writes back: be at your post, or lose it.`, "bad");
  return null;
}

// ---------------------------------------------------------------- the days

/** Raise a scene (through the hook, so this module needn't import LifeEvents). */
function hooksRaise(
  g: ConquestGame,
  life: Life,
  key: string,
  ctx: Record<string, number>,
): void {
  for (const r of hooks.raise) r(g, life, key, ctx);
}

/**
 * A day of your work, as leave sees it (Work.ts asks first): on leave and
 * away, you're not absent ("leave"); past your leave and still away, you're
 * overstaying, warned and then let go ("over"); otherwise null, and the day
 * goes as ever. Back at your post, the leave is over.
 */
export function leaveDay(
  g: ConquestGame,
  life: Life,
  raise: (key: string, ctx: Record<string, number>) => void,
): "leave" | "over" | null {
  const s = g.s;
  const job = life.job;
  if (!job || !life.leave?.list.length) return null;
  const lv = leaveFor(s, life, "job");
  if (!lv) return null;
  const here = atPost(s, g.w, life);
  if (here) {
    // Back (or never gone): the leave is done once you've been away on it.
    if (lv.gone) {
      lv.ended = s.day;
      touchLife(g, life);
      journal(
        g,
        life,
        s.day <= lv.until + 1
          ? "Back at your post from your leave."
          : `Back at your post, ${s.day - lv.until - 1} days late from your leave.`,
      );
    } else if (s.day > lv.until) {
      lv.ended = s.day;
      touchLife(g, life);
    }
    return null;
  }
  if (s.day <= lv.until) {
    if (!lv.gone) {
      lv.gone = true;
      touchLife(g, life);
    }
    if (job.awayDays) job.awayDays = 0;
    return "leave";
  }
  // Overstaying.
  const over = s.day - lv.until;
  job.awayDays = over;
  touchLife(g, life);
  const boss = npc(s, bossOf(s, life));
  if (over >= OVERSTAY_WARN && lv.warned === undefined) {
    lv.warned = s.day;
    if (boss) raise("leave-over", { c: boss.id });
    else
      journal(
        g,
        life,
        `Your leave was up on ${formatDate(lv.until)}. Another fortnight away and your place is gone.`,
        "bad",
      );
    wake(g, life, "Your leave is up.");
  }
  if (over >= OVERSTAY_SACK) {
    if (boss)
      g.char(boss.id).memories.push({
        of: life.c,
        why: "Overstayed their leave",
        value: -12,
        until: s.day + 2 * DAYS_PER_YEAR,
      });
    lv.ended = s.day;
    journal(
      g,
      life,
      `You overstayed your leave by ${over} days, and your place is gone.`,
      "bad",
    );
    leaveJob(g, life, "for overstaying your leave");
    wake(g, life, "You've lost your place for overstaying your leave.");
  }
  return "over";
}

// ---------------------------------------------------------------- half pay

/** The first day of the month a day falls in. */
function monthStartOf(day: number): number {
  let d = day;
  for (let i = 0; i < 32 && !isMonthStart(d); i++) d--;
  return d;
}

/** Days of leave on half pay from day a to day b, inclusive. */
function halfDays(life: Life, a: number, b: number): number {
  let n = 0;
  for (const lv of life.leave?.list ?? []) {
    if (lv.of !== "job" || !lv.half) continue;
    const end = Math.min(lv.until, lv.ended !== undefined ? lv.ended - 1 : lv.until);
    const x = Math.max(a, lv.from);
    const y = Math.min(b, end);
    if (y >= x) n += y - x + 1;
  }
  return n;
}

/** Half pay for the days of a month on leave (an officer's). */
export function halfPay(life: Life, a: number, b: number): number {
  const job = life.job;
  if (!job || !halfPayRank(life)) return 0;
  const wage = JOBS[job.kind].ranks[job.rank]?.wage ?? 0;
  return r2((wage / 2) * (Math.min(30, halfDays(life, a, b)) / 30));
}

/** At the month's turn: half pay for the month just gone. */
function leaveMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (!life.leave?.list.length) return;
  const a = monthStartOf(s.day - 1);
  const pay = halfPay(life, a, s.day - 1);
  if (pay > 0)
    withFlow(g, { key: "leave:half", label: "Half pay on leave" }, () =>
      earn(g, life, pay),
    );
}

/** The month's figure: half pay for this month's days on leave. */
function leaveForecast(s: GameState, life: Life): Part[] {
  if (!life.leave?.list.length) return [];
  const a = monthStartOf(s.day);
  let b = s.day + 1;
  for (let i = 0; i < 32 && !isMonthStart(b); i++) b++;
  const pay = halfPay(life, a, b - 1);
  return pay > 0 ? [{ key: "leave:half", label: "Half pay on leave", value: pay }] : [];
}

// ---------------------------------------------------------------- a journey, and your place

/** What a journey there and back means for your place: leave to ask, a business to mind, or nothing. */
export interface TripLeave {
  kind: "job" | "own";
  /** Days of leave the journey wants (there and back, a few days there). */
  days: number;
  text: string;
  odds?: LeaveOdds;
  /** You can ask now. */
  check?: Check;
}

/** Whether a journey of `days` each way would cost you your place, and what to do about it. */
export function tripLeave(
  s: GameState,
  w: World,
  life: Life,
  to: number,
  days: number,
): TripLeave | null {
  const job = life.job;
  if (!job || life.watching || isChildLife(s, life)) return null;
  if (to === job.prov) return null;
  const need = Math.ceil((days * 2 + 3) / 7) * 7;
  if (job.own) {
    const idle = (life.property ?? []).filter(
      (p) => p.kind === "business" && p.prov === job.prov && p.biz?.mgr === undefined,
    );
    if (!idle.length) return null;
    return {
      kind: "own",
      days: need,
      text: `Nobody minds your ${idle[0].name.toLowerCase()} while you're away (it takes ${Math.round(0.6 * 100)} in a hundred of its takings): put one of your people in as its manager (Estate › Business).`,
    };
  }
  if (job.army >= 0 || job.kind === "servant") return null;
  const post = JOBS[job.kind].post;
  if (post === "anywhere" || (job.kind === "clerk" && job.rank >= 2)) return null;
  const lv = onLeave(s, life, "job");
  if (lv && lv.until >= s.day + days * 2) return null;
  if (need + (job.awayDays ?? 0) < AWAY_WARN_DAYS) return null;
  const want = Math.min(LEAVE_MAX, need);
  const odds = leaveOdds(s, life, want, "job");
  return {
    kind: "job",
    days: want,
    text: `About ${days * 2 + 3} days there and back: your place is gone after six weeks away.`,
    odds,
    check: leaveCheck(s, life, want, "job"),
  };
}

// ---------------------------------------------------------------- commands

function leaveCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "econ") return undefined;
  const x = c as EconCommand;
  switch (x.act) {
    case "leave":
      return askLeave(g, life, x.days ?? 30, x.of ?? "job");
    case "leave-answer":
      return answerLeave(g, life, x.c ?? -1, !!x.free);
    case "leave-back": {
      const lv = leaveFor(g.s, life, x.of ?? "job");
      if (!lv) return "You're not on leave.";
      lv.until = Math.min(lv.until, g.s.day - 1);
      lv.ended = g.s.day;
      touchLife(g, life);
      journal(g, life, "You cut your leave short.");
      return null;
    }
  }
  return undefined;
}

hooks.command.push(leaveCommand);
hooks.lifeMonthly.push(leaveMonthly);
hooks.forecast.push((s, life) => leaveForecast(s, life));
