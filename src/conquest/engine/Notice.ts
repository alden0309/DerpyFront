// WORK (r21): leaving your work from wherever you are. Until now "Hand in
// your notice" was said to your master's face, so it couldn't be done with
// him out of town, with you away from your post, or when he was another
// player (who can't be put into a scene). Now:
//
// - Leave at once: in person if your master is here, else by letter. As
//   before, a master left in the lurch (under six months in his service)
//   remembers it.
// - Or give a fortnight's notice: you go on working (and are paid) until
//   it's served, and leave on good terms: your master remembers fair notice
//   given, if you worked most of it out. It can be taken back while it runs.
// - Another player who employs you is told (a journal line and a nudge); a
//   place in a player's outfit (a ship's company, a business's staff) is
//   left the same way and its roster updated (Hiring.ts' jobLeft).
//
// An indenture still binds, a soldier at war still deserts, and your own
// trade is simply given up.

import { played } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { journal, remembers, touchLife } from "./LifeCore";
import {
  atPost,
  type Check,
  lifeOfChar,
  meOf,
  no,
  peopleHere,
  rankOf,
  yes,
} from "./LifeQueries";
import { JOBS } from "./LifeRules";
import type { World } from "./Map";
import { wake } from "./Pace";
import { charName } from "./Queries";
import type { Character, GameState, Life } from "./Types";
import { leaveJob } from "./Work";

/** A fortnight's notice. */
export const NOTICE_DAYS = 14;
/** Working days at your post during the notice that count as "worked out" (of the twelve). */
export const NOTICE_WORKED = 6;
/** Months in a master's service under which leaving at once leaves him in the lurch. */
export const LURCH_MONTHS = 6;

/** How you'd leave: in person, by letter, from a player, your own trade, a place in an outfit. */
export type QuitHow = "person" | "letter" | "player" | "own" | "berth";

export interface QuitView {
  /** Whether you can leave at all. */
  check: Check;
  how: QuitHow;
  /** Your master (a computer character), if you have one. */
  boss?: Character;
  /** Whether a fortnight's notice can be given (and why not). */
  notice: Check;
  /** Leaving at once would leave your master in the lurch (he'd remember). */
  lurch: boolean;
  /** Notice already given: the day you go, and the working days done of it. */
  leaving?: { until: number; done: number };
  /** The button's words, and a line on what happens. */
  label: string;
  text: string;
}

/** Your master, alive (a computer character or another player), if you have one. */
export function masterOf(s: GameState, life: Life): Character | undefined {
  const job = life.job;
  if (!job || job.own || job.employer < 0) return undefined;
  const c = s.chars[job.employer];
  return c?.alive ? c : undefined;
}

/** Whether your master is here, where you could tell him to his face. */
export function masterHere(s: GameState, life: Life): boolean {
  const c = masterOf(s, life);
  if (!c || c.abroad || life.travel) return false;
  return peopleHere(s, life.prov, life).some((x) => x.id === c.id);
}

/** A soldier's place: leaving it isn't a matter of notice. */
function underArms(life: Life): boolean {
  const k = life.job?.kind;
  return k === "soldier" || k === "warrior";
}

/** How you could leave your work now, and what it would come to. */
export function quitView(s: GameState, w: World, life: Life): QuitView {
  const job = life.job;
  const base = {
    how: "own" as QuitHow,
    lurch: false,
    notice: no("You have no work."),
    label: "Hand in your notice",
    text: "",
  };
  if (!job) return { ...base, check: no("You have no work to leave.") };
  if (job.kind === "servant" && (job.until ?? 0) > s.day)
    return {
      ...base,
      check: no(
        "You're bound until your indenture is served (you could run away)",
      ),
    };
  const title = rankOf(life)?.title.toLowerCase() ?? "your place";
  if (job.own)
    return {
      ...base,
      check: yes,
      label: "Give up the trade",
      text: `You give up your work as ${title}. Any business of yours stays yours.`,
    };
  const boss = masterOf(s, life);
  const player = boss ? !!lifeOfChar(s, boss.id) : false;
  const how: QuitHow = job.berth
    ? "berth"
    : player
      ? "player"
      : masterHere(s, life) || !boss
        ? "person"
        : "letter";
  const lurch = !!boss && !player && !job.berth && job.months < LURCH_MONTHS;
  const notice: Check = job.notice
    ? no("You've given notice already")
    : underArms(life)
      ? no("Soldiers don't give notice: they're discharged, or desert")
      : yes;
  const leaving = job.notice
    ? { until: job.notice.until, done: job.notice.done }
    : undefined;
  const who = boss ? charName(boss) : "your master";
  const text =
    how === "letter"
      ? `${who} isn't here: you'd write to say so. ${lurch ? `Leaving at once after ${job.months} month${job.months === 1 ? "" : "s"} leaves ${boss?.female ? "her" : "him"} in the lurch (they'll remember). ` : ""}A fortnight's notice, worked out, leaves you on good terms.`
      : how === "player"
        ? `${who} is a player: they're told you've gone (or that you're going, with notice).`
        : how === "berth"
          ? `It's a place in ${job.berth!.title.replace(/^[^ ]+ of /, "")}: its owner is told, and you're off its books.`
          : `${lurch ? `Leaving at once after ${job.months} month${job.months === 1 ? "" : "s"} leaves ${who} in the lurch. ` : ""}A fortnight's notice, worked out, leaves you on good terms.`;
  return {
    check: yes,
    how,
    ...(boss && !player ? { boss } : {}),
    notice,
    lurch,
    ...(leaving ? { leaving } : {}),
    label: "Hand in your notice",
    text,
  };
}

/** Tell another player who employs you (the old way: a hand at their business). */
function tellPlayerMaster(
  g: ConquestGame,
  life: Life,
  boss: Character | undefined,
  text: string,
): void {
  const them = boss ? lifeOfChar(g.s, boss.id) : undefined;
  if (!them || them === life) return;
  journal(g, them, text);
  wake(g, them, text);
}

/**
 * Leave at once (in person or by letter), give a fortnight's notice, or take
 * notice back. Returns why not, or null.
 */
export function quitJob(
  g: ConquestGame,
  life: Life,
  how: "now" | "notice" | "stay" = "now",
): string | null {
  const s = g.s;
  const v = quitView(s, g.w, life);
  if (!v.check.ok) return `${v.check.why.replace(/\.$/, "")}.`;
  const job = life.job!;
  const boss = masterOf(s, life);
  const me = meOf(s, life);
  const title = rankOf(life)?.title.toLowerCase() ?? "your place";
  if (how === "stay") {
    if (!job.notice) return "You haven't given notice.";
    touchLife(g, life);
    delete job.notice;
    journal(g, life, `You take back your notice: you stay on as ${title}.`);
    if (boss && !played(s, boss.id))
      remembers(g, life, boss, "Changed their mind about leaving", 0, 0.5);
    tellPlayerMaster(
      g,
      life,
      boss,
      `${charName(me)} takes back their notice and stays on.`,
    );
    return null;
  }
  if (how === "notice") {
    if (!v.notice.ok) return `${v.notice.why}.`;
    touchLife(g, life);
    job.notice = { until: s.day + NOTICE_DAYS, done: 0 };
    journal(
      g,
      life,
      v.how === "letter"
        ? `You write to ${boss ? charName(boss) : "your master"} giving a fortnight's notice: you'll work it out and leave your place as ${title}.`
        : `You give ${boss ? charName(boss) : "your master"} a fortnight's notice: you'll work it out and leave your place as ${title}.`,
    );
    tellPlayerMaster(
      g,
      life,
      boss,
      `${charName(me)} gives you a fortnight's notice: they leave your employ then.`,
    );
    if (job.berth) {
      const owner = s.lives.find((l) => l.seat === job.berth!.seat);
      if (owner && owner !== life) {
        journal(
          g,
          owner,
          `${charName(me)} gives notice: they leave their place as ${job.berth.title.toLowerCase()} in a fortnight.`,
        );
        wake(g, owner, `${charName(me)} gives notice.`);
      }
    }
    return null;
  }
  // At once.
  if (boss && !played(s, boss.id) && v.lurch)
    remembers(g, life, boss, "Left me in the lurch", -10, 2);
  if (v.how === "letter")
    journal(
      g,
      life,
      `You write to ${boss ? charName(boss) : "your master"} that you won't be back.`,
    );
  tellPlayerMaster(g, life, boss, `${charName(me)} has left your employ.`);
  leaveJob(g, life, v.how === "letter" ? "by letter" : "of your own accord");
  return null;
}

/** Each day: a notice being worked out counts its days, and ends when it's served. */
export function noticeDaily(g: ConquestGame, life: Life): void {
  const job = life.job;
  const n = job?.notice;
  if (!job || !n) return;
  const s = g.s;
  if (s.day < n.until) {
    const sunday = ((s.day % 7) + 7) % 7 === 0;
    if (!sunday && atPost(s, g.w, life)) {
      touchLife(g, life);
      n.done++;
    }
    return;
  }
  const boss = masterOf(s, life);
  const worked = n.done >= NOTICE_WORKED;
  if (boss && !played(s, boss.id)) {
    if (worked) remembers(g, life, boss, "Gave fair notice", 4, 2);
    else if (job.months < LURCH_MONTHS)
      remembers(g, life, boss, "Left me in the lurch", -10, 2);
  }
  journal(
    g,
    life,
    worked
      ? `Your notice is served. ${boss && !played(s, boss.id) ? `${charName(boss)} shakes your hand.` : "You part on good terms."}`
      : "Your notice is up, though you were hardly there to work it out.",
    worked ? "good" : undefined,
  );
  tellPlayerMaster(
    g,
    life,
    boss,
    `${charName(meOf(s, life))} has worked out their notice and left your employ.`,
  );
  leaveJob(
    g,
    life,
    worked ? "having worked out your notice" : "when your notice was up",
  );
  wake(g, life, "Your notice is served.");
}

hooks.lifeDaily.push(noticeDaily);

/** Whether a job's master is another player (who can't be put into a scene). */
export function masterIsPlayer(s: GameState, life: Life): boolean {
  const c = masterOf(s, life);
  return !!c && played(s, c.id);
}

/** What a job's work is called, plainly ("tapster at the Swan"). */
export function placeWords(life: Life): string {
  const job = life.job;
  if (!job) return "";
  return `${rankOf(life)?.title.toLowerCase() ?? JOBS[job.kind].name.toLowerCase()}`;
}
