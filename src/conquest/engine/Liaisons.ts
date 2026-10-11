// Lovers outside a marriage. Court someone who isn't your husband or wife,
// meet in secret, and keep it quiet (stealth helps). Talk builds up: letters
// are found, a servant sees, a rival puts two and two together. Found out,
// there's a spouse's anger (and, where the church allows it, a divorce or a
// separation), a wronged husband or wife calling you out, a scandal that
// makes you notorious, and children no one can quite account for. Others'
// secrets can be pried into, and used.

import { birth } from "./Characters";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { npcWrite } from "./Letters";
import {
  addRenown,
  journal,
  milestone,
  remembers,
  setTie,
  touchLife,
} from "./LifeCore";
import { raiseLifeEvent } from "./LifeEvents";
import { lifeOfChar, meOf, skillLevel } from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { ageOf, charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { dice, hash01 } from "./SocietyCore";
import type { Affair, Character, GameState, Life, Secret } from "./Types";

/** How long a scandal is talked about. */
export const SCANDAL_DAYS = 2 * DAYS_PER_YEAR;

export function affairsOf(life: Life): Affair[] {
  return (life.affairs ?? []).filter((a) => a.ended === undefined);
}

export function affairWith(life: Life, c: number): Affair | undefined {
  return affairsOf(life).find((a) => a.c === c);
}

/** Courting or loving them would be an affair: one of you is married to someone else. */
export function wouldBeAffair(s: GameState, life: Life, c: Character): boolean {
  const me = meOf(s, life);
  if (!me) return false;
  if (me.spouse === c.id) return false;
  return me.spouse >= 0 || c.spouse >= 0;
}

/** An affair begins (or carries on if it already has). */
export function startAffair(g: ConquestGame, life: Life, c: number): Affair {
  const old = affairWith(life, c);
  if (old) return old;
  touchLife(g, life);
  const a: Affair = {
    c,
    since: g.s.day,
    exposure: 5,
    known: [],
    kids: [],
    met: g.s.day,
    blackmailer: -1,
  };
  life.affairs ??= [];
  life.affairs.push(a);
  if (life.affairs.length > 12)
    life.affairs = life.affairs.filter(
      (x, i) => x.ended === undefined || i >= life.affairs!.length - 12,
    );
  return a;
}

export function endAffair(
  g: ConquestGame,
  life: Life,
  a: Affair,
  why: string,
): void {
  touchLife(g, life);
  a.ended = g.s.day;
  a.blackmailer = -1;
  if (life.ties[a.c] === "lover") setTie(g, life, a.c, null);
  journal(g, life, `It's over with ${charName(g.s.chars[a.c])}: ${why}.`);
}

/** A scandal: talked about everywhere, a notoriety of sorts. */
export function scandalize(
  g: ConquestGame,
  life: Life,
  text: string,
  days = SCANDAL_DAYS,
): void {
  const me = meOf(g.s, life);
  if (!me) return;
  touchLife(g, life).scandal = { until: g.s.day + days, text };
  addRenown(g, life, 2);
  rumour(g, life.prov, `${charName(me)}: ${text.toLowerCase()}.`, me.id, "bad");
}

/** More is suspected; at 100, it's out. */
export function exposeBy(
  g: ConquestGame,
  life: Life,
  a: Affair,
  n: number,
  who?: "spouse" | "theirs" | "town",
): void {
  touchLife(g, life);
  a.exposure = Math.max(0, Math.min(100, a.exposure + n));
  if (a.exposure >= 100 || who) discover(g, life, a, who);
}

/** Found out: by your spouse, by theirs, or by everyone. */
export function discover(
  g: ConquestGame,
  life: Life,
  a: Affair,
  who?: "spouse" | "theirs" | "town",
): void {
  const s = g.s;
  const me = meOf(s, life);
  const lover = s.chars[a.c];
  if (!me || !lover) return;
  touchLife(g, life);
  const mySpouse = s.chars[me.spouse];
  const theirSpouse =
    lover.spouse >= 0 && lover.spouse !== me.id
      ? s.chars[lover.spouse]
      : undefined;
  const by =
    who ??
    (mySpouse?.alive && !a.known.includes("spouse")
      ? "spouse"
      : theirSpouse?.alive && !a.known.includes("theirs")
        ? "theirs"
        : "town");
  if (a.known.includes(by)) {
    if (by !== "town") return discover(g, life, a, "town");
    return;
  }
  a.known.push(by);
  if (by === "spouse" && mySpouse?.alive) {
    const sp = lifeOfChar(s, mySpouse.id);
    if (sp) {
      raiseLifeEvent(g, sp, "spouse-unfaithful", { c: me.id, l: lover.id });
      journal(g, life, `${mySpouse.first} knows about ${lover.first}.`, "bad");
    } else
      raiseLifeEvent(g, life, "affair-found-spouse", {
        c: mySpouse.id,
        l: lover.id,
      });
  } else if (by === "theirs" && theirSpouse?.alive) {
    const tl = lifeOfChar(s, theirSpouse.id);
    if (tl)
      raiseLifeEvent(g, tl, "spouse-unfaithful", { c: lover.id, l: me.id });
    else
      raiseLifeEvent(g, life, "affair-found-theirs", {
        c: theirSpouse.id,
        l: lover.id,
      });
  } else {
    scandalize(g, life, `Carrying on with ${charName(lover)}`);
    raiseLifeEvent(g, life, "affair-scandal", { c: lover.id, l: lover.id });
    // The church takes a view.
    for (const c of householdsOf(s, life.prov))
      if (c.role === "preacher" || hasTrait(c, "zealous"))
        remembers(g, life, g.char(c.id), "A shameless adulterer", -15, 2);
  }
  a.exposure = Math.max(a.exposure, 60);
}

/** Your husband or wife and you part: a divorce where the church allows it, else a separation. */
export function canDivorce(s: GameState, life: Life): boolean {
  const me = meOf(s, life);
  return (
    !!me && ["puritan", "reformed", "lutheran", "native"].includes(me.religion)
  );
}

export function partWays(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const sp = s.chars[me.spouse];
  if (!sp?.alive) return;
  touchLife(g, life);
  const spl = lifeOfChar(s, sp.id);
  if (canDivorce(s, life)) {
    g.touchChar(me).spouse = -1;
    g.char(sp.id).spouse = -1;
    // They go home to their own people (or stay on, in their own house).
    const parent = s.chars[sp.father] ?? s.chars[sp.mother];
    if (!spl) sp.home = parent?.home ?? sp.home;
    remembers(g, life, g.char(sp.id), "Divorced me", -50, 0);
    addRenown(g, life, -2);
    journal(
      g,
      life,
      me.religion === "native"
        ? `You and ${sp.first} part, as your people allow: their things are set outside the door, and that is that.`
        : `The court grants a divorce: you and ${sp.first} are married no longer. The town will talk of nothing else for a month.`,
      "bad",
    );
    milestone(g, life, "married", `Divorced ${charName(sp)}`);
    if (spl) journal(g, spl, `You and ${me.first} are divorced.`, "bad");
  } else {
    // Bed and board: still married, living apart.
    if (!spl) {
      const parent = s.chars[sp.father] ?? s.chars[sp.mother];
      g.char(sp.id).home =
        parent?.home ?? s.nations[sp.nation]?.capital ?? sp.home;
    }
    remembers(g, life, g.char(sp.id), "We live apart", -40, 0);
    addRenown(g, life, -1);
    journal(
      g,
      life,
      `The church will not end a marriage, but it allows you to live apart: ${sp.first} moves out. You are still married, in law, and may not wed again.`,
      "bad",
    );
    if (spl) journal(g, spl, `You and ${me.first} live apart now.`, "bad");
  }
}

// ---------------------------------------------------------------- the months

/** Each month: talk builds, the careless are found out, children come, blackmailers write. */
export function affairsMonthly(g: ConquestGame): void {
  const s = g.s;
  const r = dice(g);
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching) continue;
    if (life.scandal && life.scandal.until <= s.day)
      touchLife(g, life).scandal = null;
    for (const a of affairsOf(life)) {
      const lover = s.chars[a.c];
      if (!lover?.alive || lover.abroad) {
        a.ended = s.day;
        touchLife(g, life);
        continue;
      }
      // Grown cold: nobody's met in a year and a half.
      if (s.day - a.met > 540 && !lifeOfChar(s, a.c)) {
        endAffair(g, life, a, "it's cooled, as these things do");
        continue;
      }
      // No longer an affair (widowed, divorced): just lovers.
      if (me.spouse < 0 && lover.spouse < 0) {
        a.ended = s.day;
        touchLife(g, life);
        continue;
      }
      const recent = s.day - a.met < 60;
      let dx = recent ? 2 : -2;
      const sp = s.chars[me.spouse];
      if (sp && (hasTrait(sp, "just") || hasTrait(sp, "zealous"))) dx += 1;
      if (hasTrait(me, "deceitful")) dx -= 1;
      dx -= Math.floor(skillLevel(s, life, "stealth") / 8);
      a.exposure = Math.max(0, Math.min(100, a.exposure + dx));
      touchLife(g, life);
      if (a.exposure >= 100 || r.chance(a.exposure / 700)) discover(g, life, a);
      // A child, perhaps.
      const mother = me.female ? me : lover;
      const father = me.female ? lover : me;
      if (
        recent &&
        ageOf(s, mother) >= 16 &&
        ageOf(s, mother) <= 44 &&
        s.day - mother.lastBirth >= 300 &&
        r.chance(0.02)
      )
        affairChild(g, life, a, mother, father);
      // Someone who knows wants paying.
      if (
        a.exposure >= 40 &&
        a.blackmailer < 0 &&
        (life.cooldowns[`hush:${a.c}`] ?? 0) <= s.day &&
        r.chance(0.08)
      )
        startBlackmail(g, life, a);
      else if (
        a.blackmailer >= 0 &&
        (life.cooldowns[`hush:${a.c}`] ?? 0) <= s.day &&
        r.chance(0.15)
      )
        blackmailLetter(g, life, a);
    }
  }
}

/** A child of an affair: whose name it bears is another matter. */
export function affairChild(
  g: ConquestGame,
  life: Life,
  a: Affair,
  mother: Character,
  father: Character,
): void {
  const s = g.s;
  const kid = birth(s, dice(g), g.touchChar(father), g.touchChar(mother), 0);
  g.touchChar(kid);
  mother.lastBirth = s.day;
  // Passed off as the husband's, or nobody's, until someone says otherwise.
  const husband = mother.spouse >= 0 ? s.chars[mother.spouse] : undefined;
  father.children = father.children.filter((x) => x !== kid.id);
  if (husband && husband.id !== father.id) {
    kid.father = husband.id;
    g.touchChar(husband).children.push(kid.id);
    kid.family = husband.family;
  } else kid.father = -1;
  kid.home = mother.home ?? life.home;
  a.kids.push(kid.id);
  touchLife(g, life);
  raiseLifeEvent(g, life, "affair-child", { c: a.c, k: kid.id });
}

/** Acknowledge a child of an affair as yours. */
export function acknowledge(g: ConquestGame, life: Life, kidId: number): void {
  const s = g.s;
  const me = meOf(s, life);
  const kid = s.chars[kidId];
  if (!me || !kid) return;
  if (me.female) return;
  const old = s.chars[kid.father];
  if (old && old.id !== me.id)
    g.touchChar(old).children = old.children.filter((x) => x !== kid.id);
  g.touchChar(kid).father = me.id;
  if (!me.children.includes(kid.id)) g.touchChar(me).children.push(kid.id);
  touchLife(g, life).tally.children++;
}

export function startBlackmail(g: ConquestGame, life: Life, a: Affair): void {
  const s = g.s;
  const r = dice(g);
  // A rival, a servant, a neighbour with sharp eyes.
  const rivals = Object.entries(life.ties)
    .filter(([, t]) => t === "rival" || t === "nemesis")
    .map(([k]) => s.chars[Number(k)])
    .filter((c) => c?.alive && !lifeOfChar(s, c.id));
  const folk = householdsOf(s, life.prov).filter(
    (c) =>
      c.id !== life.c &&
      c.id !== a.c &&
      !lifeOfChar(s, c.id) &&
      ageOf(s, c) >= 16,
  );
  const pool = rivals.length && r.chance(0.6) ? rivals : folk;
  const who = pool.length ? pool[r.int(0, pool.length - 1)] : undefined;
  if (!who) return;
  a.blackmailer = who.id;
  touchLife(g, life);
  blackmailLetter(g, life, a);
}

function blackmailLetter(g: ConquestGame, life: Life, a: Affair): void {
  const s = g.s;
  const who = s.chars[a.blackmailer];
  const lover = s.chars[a.c];
  if (!who?.alive || !lover) {
    a.blackmailer = -1;
    return;
  }
  const ask = Math.min(
    60,
    5 + Math.round(life.renown / 5) + Math.round(Math.max(0, life.purse) / 20),
  );
  const me = meOf(s, life)!;
  touchLife(g, life).cooldowns[`hush:${a.c}`] = s.day + 90;
  npcWrite(
    g,
    life,
    who,
    "blackmail",
    `${me.female ? "Madam" : "Sir"}, I know where you go when you say you are going to the mill, and whom you meet there: ${charName(lover)}. ${ask} coins, left where the bearer tells you, and I forget it. Refuse, and the whole county remembers. A well-wisher.`,
    { ask: true, arg: ask },
  );
}

// ---------------------------------------------------------------- other people's secrets

/** Whether someone has something to hide (the same answer everywhere). */
export function npcSecret(
  s: GameState,
  c: Character,
): { kind: Secret["kind"]; with: number; text: string } | null {
  if (!c.alive || ageOf(s, c) < 20) return null;
  const r = hash01(c.id, 4127);
  const p = c.home ?? -1;
  if (r < 0.15 && c.spouse >= 0 && p >= 0) {
    const others = householdsOf(s, p).filter(
      (x) =>
        x.female !== c.female &&
        x.id !== c.spouse &&
        ageOf(s, x) >= 18 &&
        !s.lives.some((l) => l.c === x.id),
    );
    if (others.length) {
      const w = others[Math.floor(hash01(c.id, 991) * others.length)];
      return {
        kind: "affair",
        with: w.id,
        text: `${c.first} ${c.family} is carrying on with ${charName(w)}`,
      };
    }
  }
  if (r < 0.24)
    return {
      kind: "debt",
      with: -1,
      text: `${c.first} ${c.family} owes money to half the county, and hides it`,
    };
  const status = c.role ? ROLES[c.role].status : 1;
  if (r < 0.3 && status >= 3)
    return {
      kind: "crime",
      with: -1,
      text: `${c.first} ${c.family} has had a hand in smuggling, and kept the profits`,
    };
  return null;
}

export function secretOn(life: Life, c: number): Secret | undefined {
  return (life.secrets ?? []).find((x) => x.of === c);
}

/** Learn someone's secret. */
export function learnSecret(
  g: ConquestGame,
  life: Life,
  c: Character,
): string | null {
  const sec = npcSecret(g.s, c);
  if (!sec) return null;
  touchLife(g, life);
  life.secrets ??= [];
  if (!life.secrets.some((x) => x.of === c.id))
    life.secrets.push({
      of: c.id,
      with: sec.with,
      kind: sec.kind,
      learned: g.s.day,
    });
  if (life.secrets.length > 30)
    life.secrets.splice(0, life.secrets.length - 30);
  return sec.text;
}

/** What someone would pay to keep a secret quiet. */
export function hushMoney(s: GameState, c: Character): number {
  const status = c.role ? ROLES[c.role].status : 1;
  return 4 + status * 4;
}

/** Your own affair seen from the outside, for the card: how much is suspected. */
export function exposureWord(a: Affair): string {
  if (a.known.includes("town")) return "the talk of the town";
  if (a.known.length) return "found out";
  return a.exposure >= 70
    ? "people are whispering"
    : a.exposure >= 40
      ? "someone suspects"
      : "secret";
}

export function scandalOf(s: GameState, life: Life): string | null {
  return life.scandal && life.scandal.until > s.day ? life.scandal.text : null;
}

/** A child born of an affair, by its other parent, for the family page. */
export function naturalKids(life: Life): number[] {
  return (life.affairs ?? []).flatMap((a) => a.kids);
}
