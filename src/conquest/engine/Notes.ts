// INTRIGUE (r15): letters to other players in your own words. A subject if
// you like, and up to two thousand characters of plain text, sealed and sent
// by the post like any letter: as long as the road or the sea takes, and
// sometimes lost with the ship. The reader finds it in their letter case and
// can write back. Nobody but the writer and the reader is ever sent the
// words (IntrigueCore.ts takes them out of everyone else's copy), and a
// player can only send so many in a day and a month.

import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import { secretNote } from "./IntrigueCore";
import { withFlow } from "./LedgerCore";
import { addressOf, postOf, postRoute, pushPost } from "./Letters";
import { gainXp, meet, spend, touchLife } from "./LifeCore";
import { Check, lifeOfChar, meOf, no, yes } from "./LifeQueries";
import type { World } from "./Map";
import { charName } from "./Queries";
import type { GameState, Letter, Life } from "./Types";

/** The most a letter may say, and its subject. */
export const NOTE_MAX = 2000;
export const SUBJECT_MAX = 80;
/** How many you may send: a game day, and thirty. */
export const NOTES_A_DAY = 3;
export const NOTES_A_MONTH = 15;

/**
 * Plain text, tidied: no control characters (but new lines and tabs), new
 * lines made plain, no more than two blank lines together, trimmed, and cut
 * to length. What's shown is always escaped by the browser; nothing in it is
 * ever read as markup.
 */
export function cleanText(raw: unknown, max: number, lines = true): string {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/\r\n?/g, "\n");
  // eslint-disable-next-line no-control-regex
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (!lines) t = t.replace(/[\n\t]+/g, " ");
  t = t.replace(/\n{4,}/g, "\n\n\n").trim();
  return [...t].slice(0, max).join("");
}

/** Letters of yours in your own words, sent since a day. */
function sentSince(life: Life, day: number): number {
  return postOf(life).filter(
    (l) => l.kind === "personal" && l.from === life.c && l.sent >= day,
  ).length;
}

/** Whether you can send this letter now. */
export function noteCheck(
  s: GameState,
  w: World,
  life: Life,
  to: number,
  subject: string,
  body: string,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  const c = s.chars[to];
  if (!c?.alive || c.abroad) return no("They're beyond the reach of letters.");
  if (c.id === me.id) return no("A letter to yourself?");
  if (!lifeOfChar(s, c.id)) return no("Only to another player's character.");
  if (life.travel) return no("Not from the road: write when you've stopped.");
  if (typeof body !== "string" || !cleanText(body, NOTE_MAX + 1).length)
    return no("Write something first.");
  if (cleanText(body, NOTE_MAX + 1).length > NOTE_MAX)
    return no(`No more than ${NOTE_MAX} characters.`);
  if (typeof subject !== "string" || subject.length > SUBJECT_MAX * 2)
    return no(`A subject of no more than ${SUBJECT_MAX} characters.`);
  if (sentSince(life, s.day) >= NOTES_A_DAY)
    return no(
      `You've written ${NOTES_A_DAY} today: the ink will keep till tomorrow.`,
    );
  if (sentSince(life, s.day - 29) >= NOTES_A_MONTH)
    return no(
      `You've written ${NOTES_A_MONTH} this month: give the post a rest.`,
    );
  const at = addressOf(s, c);
  const route = postRoute(s, w.map, life.prov, at);
  if (!route) return no("No post goes there.");
  if (life.purse < route.cost) return no(`Postage: ${route.cost} coins.`);
  return yes;
}

/** Seal it and send it. */
export function writeNote(
  g: ConquestGame,
  life: Life,
  to: number,
  rawSubject: unknown,
  rawBody: unknown,
  re?: number,
): string | null {
  const s = g.s;
  const subject = cleanText(rawSubject, SUBJECT_MAX, false);
  const body = typeof rawBody === "string" ? rawBody : "";
  const check = noteCheck(s, g.w, life, to, subject, body);
  if (!check.ok) return check.why;
  const text = cleanText(body, NOTE_MAX);
  const me = meOf(s, life)!;
  const c = s.chars[to];
  const dest = addressOf(s, c);
  const war = s.wars.some((x) => x.a === me.nation || x.b === me.nation);
  const route = postRoute(s, g.map, life.prov, dest, war)!;
  withFlow(g, { key: "intr:post", label: "Postage" }, () =>
    spend(g, life, route.cost),
  );
  const answering =
    re !== undefined ? postOf(life).find((l) => l.id === re) : undefined;
  const letter: Letter = {
    id: g.nextId(),
    kind: "personal",
    from: me.id,
    to,
    origin: life.prov,
    dest,
    sent: s.day,
    arrive: s.day + Math.max(1, route.days),
    bySea: route.sea > 0,
    status: "transit",
    text,
    ...(subject ? { subject } : {}),
    ...(answering && answering.from === to ? { re: answering.id } : {}),
    ask: false,
  };
  pushPost(g, life, letter);
  touchLife(g, life);
  gainXp(g, life, "letters", 2);
  meet(g, life, to);
  secretNote(
    g,
    life,
    `You write to ${charName(c)}${subject ? `: "${subject}"` : ""}. It should arrive in about ${route.days} days${route.sea ? ", by ship" : ""}.`,
  );
  return null;
}

/**
 * A private letter that reaches someone who isn't played (the player's gone
 * on as their heir, or watches): delivered, unread, and nothing more.
 */
hooks.letterArrives.push((g, life, l) => {
  if (l.kind !== "personal") return false;
  if (lifeOfChar(g.s, l.to)) return false;
  l.status = "delivered";
  touchLife(g, life);
  secretNote(
    g,
    life,
    `Your letter reached ${charName(g.s.chars[l.to])}. Whether it was read, you'll never know.`,
  );
  return true;
});
