// CQTUT (r26): the first life's lessons, run on the engine's own hooks. A
// life with `tut` (TutorialStart.ts makes one) goes through the steps of
// TutorialCore.ts: each moves on when the player does what it asks (looked
// for after every command and each day), or is skipped. While they run:
//
// - only the lessons' own letters come: nothing is drawn (at home, on the
//   road, at sea), there are no matters at work and no workmates' or
//   master's scenes, and anything raised unasked (a letter from afar, an
//   invitation) is kept back and given once they're over; what the player
//   starts goes ahead;
// - nobody dies of it: the life is shielded (no roll for death, health no
//   lower than TUT_FLOOR), the people made for it are left alone by the
//   months, and a few perilous things wait (duels, crime, plots, signing on
//   for war or the sea, risings, expeditions, Europe);
// - it's all on the life (`tut`), so it rides the save, the delta and a
//   resumed game, the same way every time.
//
// Finished, the life earns First life (Achievements.ts, paid onto the
// account once). Left, it just carries on.

import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { journal, touchLife } from "./LifeCore";
import { wake } from "./Pace";
import { workState } from "./Trades";
import {
  isTutKey,
  TUT_ERRAND,
  TUT_FLOOR,
  TUT_HOME,
  TUT_SAW,
  tutHolding,
  TUTORIAL_STEPS,
  tutRunning,
  type TutStep,
} from "./TutorialCore";
import type {
  Life,
  LifeCommand,
  TutorialCommand,
  TutorialState,
} from "./Types";

// ---------------------------------------------------------------- where

const provCache = new Map<string, number>();
/** A province of the map by name (Boston's, Plymouth's). */
export function provNamed(g: ConquestGame, name: string): number {
  let p = provCache.get(name);
  if (p === undefined) {
    p = g.map.provinces.findIndex((x) => x.name === name);
    provCache.set(name, p);
  }
  return p;
}

const settled = (life: Life, p: number) => life.prov === p && !life.travel;

// ---------------------------------------------------------------- what waits

/** Work that takes you to war or to sea, or over to the wrong side of the law. */
const PERILOUS_WORK = new Set<string>([
  "soldier",
  "militia",
  "warrior",
  "sailor",
  "whaler",
  "pirate",
  "privateer",
  "thief",
  "fence",
  "smuggler",
  "highwayman",
  "counterfeiter",
]);

export const TUT_WAITS =
  "That can wait until your first life's lessons are over (or leave them: the lesson card's ×).";

/** Why a command must wait while the lessons run, or null. */
export function perilous(c: LifeCommand): string | null {
  switch (c.k) {
    case "crime":
    case "contract":
    case "movement":
    case "reclaim":
    case "europe":
    case "exped":
    case "sea":
      return TUT_WAITS;
    case "person":
      return c.act === "duel" || c.act === "blackmail" ? TUT_WAITS : null;
    case "intrigue":
      return c.act === "plot" ? TUT_WAITS : null;
    case "job":
    case "takeup":
      return PERILOUS_WORK.has(c.job) ? TUT_WAITS : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- the steps

const raiseWith = (
  g: ConquestGame,
  life: Life,
  key: string,
  ctx: Record<string, number>,
) => {
  const t = touchLife(g, life).tut!;
  t.wait = key;
  for (const r of hooks.raise) r(g, life, key, ctx);
};

/** The letter the step waits on has been answered (or decided). */
const answered = (life: Life, t: TutorialState) =>
  !!t.wait && !life.events.some((e) => e.key === t.wait);

/** Who'd buy barrels in Plymouth, best first: a merchant, a ship's master, the innkeeper, a tradesman. */
const BUYERS = ["merchant", "captain", "innkeeper", "master"];

/** Someone of Plymouth for the barrels: a merchant if there is one, or any grown townsman. */
function plymouthBuyer(g: ConquestGame): number {
  const p = provNamed(g, TUT_ERRAND);
  const ids = [...(g.s.locals[p] ?? [])].sort((a, b) => a - b);
  const of = (id: number) => g.s.chars[id];
  for (const role of BUYERS) {
    const id = ids.find((x) => of(x)?.alive && of(x)?.role === role);
    if (id !== undefined) return id;
  }
  return ids.find((id) => of(id)?.alive) ?? -1;
}

/** The last command, while it's being carried out (set at the gate). */
interface Doing {
  life: Life;
  c: LifeCommand;
  outcome: number;
}
let doing: Doing | null = null;

/**
 * Whether the step now is done, looking at the life (and the command just
 * carried out). Steps that end with a letter of their own raise it here and
 * wait for its answer.
 */
function stepDone(
  g: ConquestGame,
  life: Life,
  t: TutorialState,
  step: TutStep,
  cmd: Doing | null,
): boolean {
  const s = g.s;
  const cast = t.cast;
  const home = provNamed(g, TUT_HOME);
  const errand = provNamed(g, TUT_ERRAND);
  const alive = (id: number) => !!s.chars[id]?.alive;
  switch (step) {
    case "places": {
      const job = life.job;
      if (job && job.prov === life.prov) return life.area === job.place;
      return !!life.area && life.area !== "home";
    }
    case "work":
      return (
        cmd?.c.k === "effort" && (life.work?.effort ?? "steady") === cmd.c.v
      );
    case "talk":
      if (t.wait) return answered(life, t);
      if (
        cmd?.c.k === "person" &&
        cmd.c.act === "talk" &&
        (life.outcome?.n ?? 0) > cmd.outcome
      ) {
        if (!alive(cast.friend) || life.ties[cast.friend] === "friend")
          return true;
        raiseWith(g, life, "tut-friend", {
          c: cast.friend,
          w: alive(cast.friendWife) ? cast.friendWife : -1,
        });
        return answered(life, t);
      }
      return false;
    case "rival":
      if (t.wait) return answered(life, t);
      if (!alive(cast.rival)) return true;
      raiseWith(g, life, "tut-rival", { c: cast.rival, m: cast.master });
      return answered(life, t);
    case "map":
      return life.travel?.dest === errand || settled(life, errand);
    case "road":
      if (t.wait) return answered(life, t);
      if (!settled(life, errand)) return false;
      raiseWith(g, life, "tut-barrels", {
        c: plymouthBuyer(g),
        m: cast.mother,
      });
      return answered(life, t);
    case "home":
      if (t.paid === undefined || !settled(life, home)) return false;
      wake(g, life, "Pay day: your wages are in.");
      return true;
    case "family":
      if (t.wait) return answered(life, t);
      if (!alive(cast.mother) && !alive(cast.sister)) return true;
      if (!settled(life, home)) return false;
      raiseWith(g, life, "tut-family", { c: cast.mother, k: cast.sister });
      return answered(life, t);
    case "aim":
      return !!life.ambition;
    case "birthday":
      if (t.wait) return answered(life, t);
      if (s.day < t.birthday) return false;
      raiseWith(g, life, "tut-birthday", {
        c: alive(cast.friend) ? cast.friend : -1,
        m: cast.mother,
        late: s.day - t.birthday,
      });
      return answered(life, t);
    case "heir":
      return false; // looked at (the client says so: "saw")
  }
}

/** Move on from the step now: done, or skipped. */
function nextStep(g: ConquestGame, life: Life, how: "done" | "skipped"): void {
  const t = touchLife(g, life).tut!;
  const id = TUTORIAL_STEPS[t.step];
  if (id) (how === "done" ? t.done : t.skipped).push(id);
  // A step skipped takes its letter with it, if it's still waiting.
  if (how === "skipped" && t.wait)
    life.events = life.events.filter((e) => e.key !== t.wait);
  t.step++;
  t.since = g.s.day;
  delete t.wait;
  delete t.paid;
  if (t.step >= TUTORIAL_STEPS.length) endLessons(g, life, "done");
}

/** Look at the step now (and the ones after, if they're done already). */
function settle(g: ConquestGame, life: Life, cmd: Doing | null): void {
  for (let i = 0; i <= TUTORIAL_STEPS.length; i++) {
    const t = life.tut;
    if (!t || t.over) return;
    const step = TUTORIAL_STEPS[t.step];
    if (!step) return endLessons(g, life, "done");
    // The life that had the lessons has gone (an heir, a new life): they end.
    if (life.c < 0 || life.watching || life.c !== life.line[0])
      return endLessons(g, life, "left");
    if (step === "work" && workGone(life)) {
      nextStep(g, life, "skipped");
      continue;
    }
    if (!stepDone(g, life, t, step, cmd)) return;
    nextStep(g, life, "done");
    cmd = null; // a command counts once
  }
}

/** No work of a master's to choose how hard to go at. */
function workGone(life: Life): boolean {
  return !life.job || !!life.job.own;
}

// ---------------------------------------------------------------- the end

/**
 * What came unasked while the lessons held the world back, given now (the
 * stale left out): when they're left, or when the end's card is put away.
 */
function releaseHeld(g: ConquestGame, life: Life): void {
  const t = touchLife(g, life).tut;
  const held = t?.held ?? [];
  if (!t || !held.length) return;
  const s = g.s;
  delete t.held;
  for (const ev of held)
    if (ev.expires > s.day && !life.events.some((e) => e.key === ev.key))
      life.events.push({ ...ev, expires: Math.max(ev.expires, s.day + 30) });
}

/** The lessons over: the days run as ever (once the end's card is put away). */
export function endLessons(
  g: ConquestGame,
  life: Life,
  how: "done" | "left",
): void {
  const t = touchLife(g, life).tut;
  if (!t || t.over) return;
  const s = g.s;
  t.over = { how, day: s.day };
  delete t.wait;
  // Left: what was kept back comes now. Done: when the end's card is put away.
  if (how === "left") releaseHeld(g, life);
  // The work's matters and the shop's scenes come again, after a breath.
  workState(g, life).matter = s.day;
  for (const fam of ["colleagues", "masters"])
    life.cooldowns[`fam:${fam}`] = s.day + 14;
  journal(
    g,
    life,
    how === "done"
      ? "You know the ropes now. The rest of this life is yours: work, family, friends and the whole of the Americas."
      : "You put the lessons by. The rest of this life is yours.",
    how === "done" ? "good" : undefined,
  );
}

// ---------------------------------------------------------------- the commands

/** The lessons' own command: a page looked at, a step skipped, the lessons left, the card put away. */
export function tutorialCommand(
  g: ConquestGame,
  life: Life,
  c: TutorialCommand,
): string | null {
  const t = life.tut;
  if (!t) return "You have no lessons.";
  switch (c.act) {
    case "saw": {
      if (t.over) return null;
      const step = TUTORIAL_STEPS[t.step];
      if (step && TUT_SAW[step] === c.what) {
        nextStep(g, life, "done");
        settle(g, life, null);
      }
      return null;
    }
    case "skip":
      if (t.over) return "The lessons are over.";
      // The step the card showed (a second click finds the next one: not skipped).
      if (c.step !== undefined && c.step !== t.step) return null;
      nextStep(g, life, "skipped");
      settle(g, life, null);
      return null;
    case "leave":
      if (t.over) return null;
      endLessons(g, life, "left");
      return null;
    case "close":
      if (!t.over) return "The lessons aren't over yet.";
      touchLife(g, life).tut!.closed = true;
      releaseHeld(g, life);
      return null;
    default:
      return "No such thing.";
  }
}

// ---------------------------------------------------------------- the hooks

/** Whether a character is one the lessons were made with, while they run. */
function inCast(g: ConquestGame, c: number): boolean {
  for (const l of g.s.lives) {
    const t = l.tut;
    if (!t || t.over) continue;
    const k = t.cast;
    if (
      c === k.mother ||
      c === k.sister ||
      c === k.friend ||
      c === k.friendWife ||
      c === k.rival ||
      c === k.master
    )
      return true;
  }
  return false;
}

hooks.gate.push((g, life, c) => {
  if (!tutHolding(life)) return null;
  doing = { life, c, outcome: life.outcome?.n ?? 0 };
  return tutRunning(life) ? perilous(c) : null;
});

hooks.command.push((g, life, c) =>
  c.k === "tut" ? tutorialCommand(g, life, c as TutorialCommand) : undefined,
);

hooks.afterCommand.push((g, life) => {
  const cmd = doing?.life === life ? doing : null;
  doing = null;
  if (tutRunning(life)) settle(g, life, cmd);
});

/** Days the end's card waits while the clock runs before it puts itself away. */
const END_CARD_DAYS = 7;

hooks.lifeDaily.push((g, life) => {
  if (tutRunning(life)) settle(g, life, null);
  // Playing on with the end's card still up: it's put away, and the world
  // comes back in.
  const t = life.tut;
  if (t?.over && !t.closed && g.s.day - t.over.day >= END_CARD_DAYS) {
    touchLife(g, life).tut!.closed = true;
    releaseHeld(g, life);
  }
});

hooks.lifeMonthly.push((g, life) => {
  const t = life.tut;
  if (!t || t.over) return;
  if (TUTORIAL_STEPS[t.step] === "home") touchLife(g, life).tut!.paid = g.s.day;
  settle(g, life, null);
});

// Only the lessons' own letters are drawn while they run (and while their
// end's card is up).
hooks.eventWeight.push((g, life, key, _pool, _ctx, w) =>
  w > 0 && tutHolding(life) && !isTutKey(key) ? 0 : w,
);

// What comes unasked (raised by the days, not by the player's own command)
// waits until the lessons are over and their end's card put away.
hooks.eventFired.push((g, life, key) => {
  if (!tutHolding(life) || isTutKey(key) || doing?.life === life) return;
  let i = -1;
  for (let j = life.events.length - 1; j >= 0; j--)
    if (life.events[j].key === key) {
      i = j;
      break;
    }
  if (i < 0) return;
  const t = touchLife(g, life).tut!;
  const [ev] = life.events.splice(i, 1);
  (t.held ??= []).push(ev);
  if (t.held.length > 12) t.held.splice(0, t.held.length - 12);
});

hooks.shield.push((g, life) => (tutRunning(life) ? TUT_FLOOR : null));

// The character who had the lessons dead after all (by a road the shield
// doesn't cover): they end there.
hooks.death.push((g, c) => {
  for (const life of g.s.lives)
    if (tutRunning(life) && life.line[0] === c.id) endLessons(g, life, "left");
});

hooks.skip.push((g, c) => inCast(g, c));
