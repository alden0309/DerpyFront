// POWER (r12): trials as scenes. Whoever's tried (you for a crime, someone
// you accused, a debtor, a duel's survivor, a printer for libel, a
// councillor for corruption, a witch or a heretic in their years), the case
// is heard in the court-house in five scenes: the charge, the witnesses and
// the evidence, the plea, the jury, and the verdict. Each player in it
// (defendant, accuser, judge) gets the scenes that are theirs to play;
// everyone else is played by the computer. A justice of the peace presides
// over the county's cases and decides them.

import { kill } from "./Characters";
import { seatHolderId } from "./CouncilTitles";
import {
  addHeat,
  crimeState,
  punish,
  reprieved,
  sentenceFor,
  type Sentence,
} from "./Crime";
import { heatOf, lawAt } from "./CrimeQueries";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  hurt,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  isPlayed,
  lifeOfChar,
  meOf,
  opinionOf,
  skillLevel,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import { loanJudged, loanSettled } from "./Loans"; // ECON (r17)
import { postsOf, resignPost } from "./OneOffice";
import { wake } from "./Pace";
import { pdice, power, powerChanged } from "./PowerCore";
import { ageOf, charName, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { hash01, officesIn } from "./SocietyCore";
import type { Character, GameState, Life, Trial, TrialKind } from "./Types";

/** Game days a stage waits for its players before it goes on without them. */
export const STAGE_DAYS = 12;

export const STAGES = [
  "The charge",
  "Witnesses and evidence",
  "The plea",
  "Before the jury",
  "The verdict",
];

/** What each kind of case is called. */
export const KIND_NAMES: Record<TrialKind, string> = {
  crime: "a criminal trial",
  accused: "a criminal trial",
  libel: "a suit for libel",
  sedition: "a trial for seditious libel",
  debt: "a suit for debt",
  duel: "a trial for a death in a duel",
  witchcraft: "a trial for witchcraft",
  heresy: "a trial before the Holy Office",
  presentment: "a presentment of the churchwardens",
  corruption: "a trial for corruption in office",
};

/** The event key each role plays at each stage (the plea depends on the case). */
export function stageKey(
  role: "def" | "acc" | "judge",
  t: Trial,
): string | null {
  const st = t.stage;
  if (role === "def") {
    if (st === 2)
      return t.kind === "witchcraft"
        ? "trial-plea-witch"
        : t.kind === "heresy"
          ? "trial-plea-heresy"
          : t.kind === "libel" || t.kind === "sedition"
            ? "trial-plea-print"
            : "trial-plea";
    return (
      ["trial-charge", "trial-witness", null, "trial-jury", null][st] ?? null
    );
  }
  if (role === "acc")
    return ["trial-lay", "trial-prove", null, "trial-sum", null][st] ?? null;
  return st === 4 ? "trial-bench" : null;
}

export const trialById = (s: GameState, id: number): Trial | undefined =>
  s.power?.trials.find((t) => t.id === id);

/** Trials open now, or settled within the year (for the court roll). */
export function courtRoll(s: GameState, p?: number): Trial[] {
  return (s.power?.trials ?? []).filter(
    (t) =>
      (p === undefined || t.p === p) &&
      (t.stage < 5 || s.day - t.day < DAYS_PER_YEAR),
  );
}

/** A player's own open case as defendant, if any. */
export function myTrial(s: GameState, life: Life): Trial | undefined {
  return (s.power?.trials ?? []).find(
    (t) =>
      t.stage < 5 &&
      (t.defendant === life.c || t.accuser === life.c || t.judge === life.c),
  );
}

// ---------------------------------------------------------------- opening a case

export interface OpenCase {
  kind: TrialKind;
  defendant: number;
  accuser: number;
  p: number;
  nation: number;
  charge: string;
  grade: number;
  judge?: number;
  evidence?: number;
}

/** Who sits in judgment: the county's justice, the Holy Office's commissary, or the governor for the gravest. */
export function judgeFor(s: GameState, o: OpenCase): number {
  const parties = new Set([o.defendant, o.accuser]);
  const ok = (c: number) =>
    c >= 0 && s.chars[c]?.alive && !s.chars[c].abroad && !parties.has(c);
  if (o.kind === "heresy") {
    const ch = seatHolderId(s, o.nation, "chaplain");
    return ok(ch) ? ch : -1;
  }
  const j = officesIn(s, o.p).find((x) => x.key === "justice")?.holder ?? -1;
  if (ok(j) && s.chars[j].nation === o.nation) return j;
  const gov = s.nations[o.nation]?.ruler ?? -1;
  if (o.grade >= 4 && ok(gov)) return gov;
  return -1;
}

/** The jury's (or the town's) leaning toward a defendant. */
function sympathyFor(
  s: GameState,
  t: Pick<Trial, "defendant" | "kind" | "p" | "id">,
): number {
  const d = s.chars[t.defendant];
  const life = lifeOfChar(s, t.defendant);
  let v = 0;
  if (life) {
    const folk = householdsOf(s, t.p)
      .filter((c) => c.id !== t.defendant && ageOf(s, c) >= 18)
      .slice(0, 8);
    if (folk.length)
      v +=
        folk.reduce((m, c) => m + opinionOf(s, c, life).total, 0) /
        folk.length /
        8;
  } else if (d)
    v +=
      hash01(d.id, t.id) * 4 -
      2 +
      (d.role ? (ROLES[d.role].status - 2) / 2 : 0);
  const year = 1607 + Math.floor(s.day / DAYS_PER_YEAR);
  if ((t.kind === "libel" || t.kind === "sedition") && year >= 1735) v += 2;
  if (t.kind === "duel") v += 2;
  return Math.max(-6, Math.min(6, Math.round(v * 10) / 10));
}

/** Open a case: the court sits within the fortnight. */
export function openTrial(g: ConquestGame, o: OpenCase): Trial {
  const s = g.s;
  const ps = power(g);
  const judge = o.judge ?? judgeFor(s, o);
  const d = s.chars[o.defendant];
  const dl = lifeOfChar(s, o.defendant);
  const defence = dl
    ? Math.min(5, dl.renown / 15) + skillLevel(s, dl, "persuasion") / 4
    : d
      ? stat(s, d, "dip") / 2 + (d.role ? ROLES[d.role].status / 2 : 0)
      : 0;
  const t: Trial = {
    id: g.nextId(),
    kind: o.kind,
    defendant: o.defendant,
    accuser: o.accuser,
    judge,
    p: o.p,
    nation: o.nation,
    charge: o.charge,
    grade: Math.max(1, Math.min(4, o.grade)),
    evidence: o.evidence ?? 6 + o.grade * 1.5,
    defence: Math.round(defence * 10) / 10,
    sympathy: 0,
    stage: 0,
    waiting: [],
    until: s.day + STAGE_DAYS,
    lines: [],
    day: s.day,
  };
  t.sympathy = sympathyFor(s, t);
  ps.trials.push(t);
  // The roll keeps a year of settled cases, and no more than thirty.
  const settled = ps.trials.filter((x) => x.stage >= 5);
  if (settled.length > 30) {
    const drop = new Set(
      settled.slice(0, settled.length - 30).map((x) => x.id),
    );
    ps.trials = ps.trials.filter((x) => !drop.has(x.id));
  }
  t.lines.push(
    `${KIND_NAMES[t.kind]}: ${charName(d)}, charged with ${t.charge}.`,
  );
  powerChanged(g, "t");
  for (const c of [t.defendant, t.accuser, t.judge]) {
    const life = lifeOfChar(s, c);
    if (life)
      wake(g, life, `A case at law: ${charName(d)}, charged with ${t.charge}.`);
  }
  rumour(
    g,
    t.p,
    `${charName(d)} is to be tried at ${g.map.provinces[t.p]?.name ?? "the court-house"}, charged with ${t.charge}.`,
    t.defendant,
    "bad",
    false,
    true,
  );
  beginStage(g, t);
  return t;
}

// ---------------------------------------------------------------- the stages

function seatOf(s: GameState, c: number): string | null {
  return lifeOfChar(s, c)?.seat ?? null;
}

/** Ask the players this stage belongs to; the computer plays the rest. */
function beginStage(g: ConquestGame, t: Trial): void {
  const s = g.s;
  for (;;) {
    t.waiting = [];
    t.until = s.day + STAGE_DAYS;
    if (t.stage >= 5) return;
    const roles: ["def" | "acc" | "judge", number][] = [
      ["def", t.defendant],
      ["acc", t.accuser],
      ["judge", t.judge],
    ];
    for (const [role, c] of roles) {
      const key = stageKey(role, t);
      if (!key) continue;
      const seat = seatOf(s, c);
      if (!seat) continue;
      // A hanged or dead player answers nothing.
      if (!s.chars[c]?.alive) continue;
      t.waiting.push(`${seat}|${key}`);
    }
    npcStage(g, t);
    powerChanged(g, "t");
    if (t.waiting.length) {
      askWaiting(g, t);
      return;
    }
    advance(g, t);
    if (t.stage >= 5) return;
  }
}

/** Raise the scenes this stage waits on (those not already up). */
function askWaiting(g: ConquestGame, t: Trial): void {
  const s = g.s;
  for (const w of t.waiting) {
    const [seat, key] = w.split("|");
    const life = s.lives.find((l) => l.seat === seat);
    if (!life || life.c < 0) continue;
    if (life.events.some((e) => e.key === key)) continue;
    raiseEvent(g, life, key, { t: t.id, c: otherParty(t, life.c) });
    wake(
      g,
      life,
      `${STAGES[t.stage]}: ${charName(s.chars[t.defendant])}'s trial.`,
    );
  }
}

/** Who stands opposite a player in their scenes. */
function otherParty(t: Trial, c: number): number {
  if (c === t.defendant) return t.judge >= 0 ? t.judge : t.accuser;
  if (c === t.accuser) return t.defendant;
  return t.defendant;
}

/** The computer plays its parties' parts in a stage. */
function npcStage(g: ConquestGame, t: Trial): void {
  const s = g.s;
  const r = pdice(g);
  const d = s.chars[t.defendant];
  const a = s.chars[t.accuser];
  const dPlayed = isPlayed(s, t.defendant);
  const aPlayed = isPlayed(s, t.accuser);
  switch (t.stage) {
    case 0:
      if (!dPlayed && d && d.role && ROLES[d.role].status >= 3) {
        t.counsel = true;
        t.defence += 2;
        t.lines.push(`${d.first} has engaged counsel.`);
      }
      if (!aPlayed && a?.alive) t.evidence += stat(s, a, "dip") / 4;
      break;
    case 1:
      if (!dPlayed && d) t.defence += Math.round(r.next() * 30) / 10;
      if (!aPlayed && a?.alive) t.evidence += Math.round(r.next() * 25) / 10;
      break;
    case 2:
      if (!dPlayed) {
        const hopeless = t.evidence - t.defence - t.sympathy > 9;
        if (t.kind === "witchcraft" && hopeless && r.chance(0.5)) {
          t.plea = "confess";
          t.lines.push(
            `${d?.first ?? "The accused"} confesses, and names others.`,
          );
        } else if (hopeless && r.chance(0.4)) {
          t.plea = "guilty";
          t.lines.push(
            `${d?.first ?? "The accused"} pleads guilty and begs the court's mercy.`,
          );
        } else {
          t.plea = "not";
          t.lines.push(`${d?.first ?? "The accused"} pleads not guilty.`);
        }
      }
      break;
    case 3:
      if (!dPlayed && d && t.plea === "not")
        t.sympathy += stat(s, d, "dip") / 4 - 1;
      break;
    case 4:
      // The computer's judge, or the bench: decided in advance().
      break;
  }
}

/** A plea that settles the case without a jury. */
const settledByPlea = (t: Trial) =>
  t.plea === "guilty" || t.plea === "confess" || t.plea === "clergy";

/** Move on to the next stage (deciding the case after the jury). */
function advance(g: ConquestGame, t: Trial): void {
  if ((t.stage === 2 && settledByPlea(t)) || t.stage >= 4) {
    if (!t.verdict) decideByBench(g, t);
    t.stage = 5;
    conclude(g, t);
    return;
  }
  t.stage++;
  powerChanged(g, "t");
}

/** A stage's player answered (from the scene). */
export function trialAnswered(
  g: ConquestGame,
  life: Life,
  id: number,
  key: string,
): void {
  const t = trialById(g.s, id);
  if (!t || t.stage >= 5) return;
  t.waiting = t.waiting.filter((w) => w !== `${life.seat}|${key}`);
  powerChanged(g, "t");
  if (t.waiting.length) return;
  advance(g, t);
  if (t.stage < 5) beginStage(g, t);
}

/** How the evidence stands: positive leans to guilty. */
export function leaning(t: Trial): number {
  return Math.round((t.evidence - t.defence - t.sympathy) * 10) / 10;
}

/** The jury (or a bench of the computer's justices) decides. */
function decideByBench(g: ConquestGame, t: Trial): void {
  const s = g.s;
  if (t.plea === "guilty" || t.plea === "confess") {
    t.verdict = "guilty";
    t.lighter = true;
    t.sentence = sentenceOf(s, t, true).text;
    return;
  }
  if (t.plea === "clergy") {
    t.verdict = "guilty";
    t.sentence = "burned on the thumb (benefit of clergy)";
    return;
  }
  // A judge of the computer's who's been paid finds a way.
  const judge = s.chars[t.judge];
  if (
    t.bribe &&
    judge?.alive &&
    !isPlayed(s, judge.id) &&
    pdice(g).chance(0.7)
  ) {
    t.verdict = "acquitted";
    t.lines.push(
      "The bench finds the evidence wanting, with suspicious speed.",
    );
    return;
  }
  const noise = pdice(g).next() * 6 - 3;
  t.verdict = leaning(t) + noise > 0 ? "guilty" : "acquitted";
  t.lighter = t.plea === "mercy" || t.sympathy > 4;
  if (t.verdict === "guilty") t.sentence = sentenceOf(s, t, t.lighter).text;
}

/** A justice (a player) decides from the bench. */
export function judgeDecides(
  g: ConquestGame,
  life: Life,
  id: number,
  how: "convict" | "lighter" | "acquit" | "jury" | "bribe",
): void {
  const s = g.s;
  const t = trialById(s, id);
  if (!t || t.stage !== 4 || t.judge !== life.c) return;
  const d = s.chars[t.defendant];
  switch (how) {
    case "convict":
      t.verdict = "guilty";
      t.sentence = sentenceOf(s, t, false).text;
      t.lines.push(`The justice sums up for a conviction.`);
      break;
    case "lighter":
      t.verdict = "guilty";
      t.lighter = true;
      t.sentence = sentenceOf(s, t, true).text;
      t.lines.push(
        `The justice sums up for a conviction, and asks mercy in the sentence.`,
      );
      break;
    case "acquit":
      t.verdict = "acquitted";
      t.lines.push(`The justice directs an acquittal.`);
      break;
    case "bribe": {
      t.verdict = "acquitted";
      earn(g, life, t.bribe ?? 0);
      t.lines.push(`The justice finds the evidence wanting.`);
      if (pdice(g).chance(0.3)) {
        touchLife(g, life).scandal = {
          until: s.day + DAYS_PER_YEAR,
          text: "A justice who sells verdicts",
        };
        addRenown(g, life, -4);
        rumour(
          g,
          t.p,
          `They say the justice at ${g.map.provinces[t.p].name} was paid to let ${charName(d)} go.`,
          life.c,
          "bad",
        );
      }
      break;
    }
    default:
      decideByBench(g, t);
  }
  // Fees, renown, and what the town thinks of the verdict.
  earn(g, life, 1.5);
  addRenown(g, life, 0.5);
  const lean = leaning(t);
  if (t.verdict === "acquitted" && lean > 6) {
    const pr = g.prov(t.p);
    pr.mods = pr.mods.filter((m) => m.key !== "trial:lenient");
    pr.mods.push({
      key: "trial:lenient",
      label: "A guilty man let go",
      until: s.day + 120,
      fx: { unrest: 2 },
    });
  }
  if (t.verdict === "guilty" && t.sympathy > 3) addRenown(g, life, -1);
}

// ---------------------------------------------------------------- sentences

export interface Doom {
  text: string;
  fine?: number;
  pillory?: boolean;
  whip?: boolean;
  gaol?: number;
  brand?: boolean;
  transport?: number;
  hang?: boolean;
  penance?: boolean;
  dismiss?: boolean;
  seize?: boolean;
}

/** The sentence the law allows for a case, full or lighter. */
export function sentenceOf(s: GameState, t: Trial, lighter: boolean): Doom {
  const life = lifeOfChar(s, t.defendant);
  const priors = life?.crime?.record.length ?? 0;
  switch (t.kind) {
    case "presentment":
      return lighter
        ? { text: "a fine of 3 coins", fine: 3 }
        : { text: "an hour in the stocks", pillory: true };
    case "libel":
      if (lighter)
        return t.grade < 2
          ? { text: "a fine of 8 coins", fine: 8 }
          : { text: "a fine of 15 coins", fine: 15 };
      return t.grade < 2
        ? { text: "a fine of 15 coins", fine: 15 }
        : {
            text: "a fine of 25 coins and an hour in the pillory",
            fine: 25,
            pillory: true,
          };
    case "sedition":
      return lighter
        ? { text: "a fine of 30 coins", fine: 30 }
        : {
            text: "the pillory, a fine of 30 coins and six months in the gaol",
            fine: 30,
            pillory: true,
            gaol: 6,
          };
    case "debt":
      return {
        text: "the debtors' prison for two months, and goods seized for the debt",
        gaol: 2,
        seize: true,
      };
    case "corruption":
      if (lighter)
        return t.grade < 3
          ? {
              text: "dismissal from office and a fine of 10 coins",
              fine: 10,
              dismiss: true,
            }
          : {
              text: "dismissal from office and a fine of 20 coins",
              fine: 20,
              dismiss: true,
            };
      return t.grade < 3
        ? {
            text: "dismissal from office and a fine of 20 coins",
            fine: 20,
            dismiss: true,
          }
        : {
            text: "dismissal, a fine of 30 coins and six months in the gaol",
            fine: 30,
            dismiss: true,
            gaol: 6,
          };
    case "duel":
      return lighter
        ? { text: "manslaughter: burned on the thumb", brand: true }
        : {
            text: "manslaughter: burned on the thumb and a year in the gaol",
            brand: true,
            gaol: 12,
          };
    case "witchcraft":
      if (t.plea === "confess")
        return {
          text: "spared the rope on confession: a public penance, and a name that will never be clean",
          penance: true,
        };
      return lighter
        ? { text: "banished from the colony", transport: 7 }
        : { text: "hanging", hang: true };
    case "heresy":
      if (priors && t.grade >= 3 && !lighter)
        return {
          text: "relaxed to the secular arm, as a relapsed heretic",
          hang: true,
        };
      return lighter || t.grade < 3
        ? { text: "public penance in the sanbenito", penance: true }
        : {
            text: "penance, half your goods confiscated, and exile",
            penance: true,
            fine: -0.5,
            transport: 7,
          };
    default: {
      const sn: Sentence = sentenceFor(t.grade, priors, lighter);
      return fromSentence(sn);
    }
  }
}

function fromSentence(sn: Sentence): Doom {
  switch (sn.key) {
    case "fine":
      return { text: sn.text, fine: sn.n };
    case "pillory":
      return { text: sn.text, pillory: true };
    case "whip":
      return { text: sn.text, whip: true, gaol: sn.n };
    case "brand":
      return { text: sn.text, brand: true };
    case "gaol":
      return { text: sn.text, gaol: sn.n };
    case "transport":
      return { text: sn.text, transport: sn.n };
    case "hang":
      return { text: sn.text, hang: true };
  }
}

/** The case is decided: everyone hears it; the sentence is carried out. */
function conclude(g: ConquestGame, t: Trial): void {
  const s = g.s;
  const d = s.chars[t.defendant];
  t.waiting = [];
  t.day = s.day;
  powerChanged(g, "t");
  const verdictLine =
    t.verdict === "guilty"
      ? `Guilty. The sentence: ${t.sentence}.`
      : "Not guilty. The prisoner is discharged.";
  t.lines.push(verdictLine);
  rumour(
    g,
    t.p,
    t.verdict === "guilty"
      ? `${charName(d)} was found guilty of ${t.charge}: ${t.sentence}.`
      : `${charName(d)} was acquitted of ${t.charge}.`,
    t.defendant,
    t.verdict === "guilty" ? "bad" : "good",
  );
  // The accuser and the judge, win or lose.
  const acc = lifeOfChar(s, t.accuser);
  if (acc) {
    // STORY (r17): a case you brought, won or lost.
    milestone(
      g,
      acc,
      "trial",
      t.verdict === "guilty"
        ? `Brought ${charName(d)} to court for ${t.charge}, and won: ${t.sentence}`
        : `Brought ${charName(d)} to court for ${t.charge}, and lost`,
      t.p,
      { quiet: true, tone: t.verdict === "guilty" ? "good" : "bad" },
    );
    if (t.verdict === "guilty") addRenown(g, acc, 1 + (t.grade >= 3 ? 1 : 0));
    else {
      addRenown(g, acc, -1);
      if (d?.alive && !isPlayed(s, d.id))
        remembers(g, acc, g.char(d.id), "Dragged me into court", -30, 6);
    }
  } else if (
    t.accuser >= 0 &&
    d &&
    lifeOfChar(s, t.defendant) &&
    s.chars[t.accuser]?.alive
  ) {
    const dl = lifeOfChar(s, t.defendant)!;
    if (t.verdict === "acquitted")
      remembers(g, dl, g.char(t.accuser), "Lost their case against me", -10, 3);
  }
  // A player defendant hears the verdict in a scene, and the sentence is
  // carried out when they've heard it (or the stage's time runs out).
  const dl = lifeOfChar(s, t.defendant);
  t.until = s.day + STAGE_DAYS;
  for (const c of new Set([t.defendant, t.accuser, t.judge])) {
    const life = lifeOfChar(s, c);
    if (!life || !s.chars[c]?.alive) continue;
    t.waiting.push(`${life.seat}|trial-end`);
  }
  if (!dl) carryOut(g, t);
  askEnd(g, t);
}

function askEnd(g: ConquestGame, t: Trial): void {
  const s = g.s;
  for (const w of t.waiting) {
    const [seat] = w.split("|");
    const life = s.lives.find((l) => l.seat === seat);
    if (!life || life.c < 0) continue;
    if (life.events.some((e) => e.key === "trial-end")) continue;
    raiseEvent(g, life, "trial-end", { t: t.id, c: otherParty(t, life.c) });
    wake(g, life, `The verdict: ${charName(s.chars[t.defendant])}.`);
  }
}

/** A player heard the verdict (the defendant's sentence is carried out now). */
export function verdictHeard(g: ConquestGame, life: Life, id: number): void {
  const t = trialById(g.s, id);
  if (!t) return;
  t.waiting = t.waiting.filter((w) => w !== `${life.seat}|trial-end`);
  powerChanged(g, "t");
  if (life.c === t.defendant && !t.done) carryOut(g, t);
}

/** Carry out the sentence (or the acquittal). */
function carryOut(g: ConquestGame, t: Trial): void {
  const s = g.s;
  if (t.done) return;
  t.done = true;
  powerChanged(g, "t");
  // ECON (r17): a suit on a bond: judgment for what can be had, or it stands over.
  if (t.kind === "debt") loanJudged(g, t);
  const d = s.chars[t.defendant];
  const life = lifeOfChar(s, t.defendant);
  const here = g.map.provinces[t.p]?.name ?? "the court-house";
  if (t.verdict !== "guilty") {
    if (life) {
      if (t.kind === "crime" && life.crime?.jail) {
        const j = life.crime.jail;
        crimeState(g, life).jail = null;
        addHeat(g, life, j.nation, -15);
      }
      journal(
        g,
        life,
        `Acquitted of ${t.charge}. You walk out of the court-house into the daylight.`,
        "good",
      );
      // STORY (r17)
      milestone(
        g,
        life,
        "trial",
        `Tried for ${t.charge} at ${here}, and acquitted`,
        t.p,
        { quiet: true, tone: "good" },
      );
      addStress(g, life, -5);
    }
    return;
  }
  const doom: Doom =
    t.plea === "clergy"
      ? { text: "burned on the thumb (benefit of clergy)", brand: true }
      : sentenceOf(s, t, !!t.lighter);
  if (life) punishLife(g, life, t, doom);
  else if (d?.alive) punishNpc(g, t, d, doom, here);
  if (t.kind === "witchcraft" && t.verdict === "guilty") {
    const pr = g.prov(t.p);
    pr.mods = pr.mods.filter((m) => m.key !== "trial:witch");
    pr.mods.push({
      key: "trial:witch",
      label: "Fear of witches",
      until: s.day + DAYS_PER_YEAR,
      fx: { unrest: 3 },
    });
  }
}

function punishLife(g: ConquestGame, life: Life, t: Trial, doom: Doom): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  // A governor (a player) may reprieve a hanging.
  if (doom.hang) {
    const gov = lifeOfChar(s, s.nations[t.nation]?.ruler ?? -1);
    const spared =
      gov && gov.c !== life.c ? false : reprieved(g, life, t.nation);
    if (spared) {
      journal(
        g,
        life,
        "At the foot of the gallows a rider comes with the governor's reprieve: transportation instead.",
        "good",
      );
      doom = {
        text: "transportation for seven years (reprieved from the rope)",
        transport: 7,
      };
    }
  }
  const crime = crimeState(g, life);
  const jail = crime.jail;
  // The main part goes through the law's own machinery (the record, the gaol, the rope).
  const main: Sentence = doom.hang
    ? { key: "hang", text: doom.text, n: 0 }
    : doom.transport
      ? { key: "transport", text: doom.text, n: doom.transport }
      : doom.whip
        ? { key: "whip", text: doom.text, n: doom.gaol ?? 3 }
        : doom.gaol
          ? { key: "gaol", text: doom.text, n: doom.gaol }
          : doom.brand
            ? { key: "brand", text: doom.text, n: 0 }
            : doom.pillory
              ? { key: "pillory", text: doom.text, n: 0 }
              : {
                  key: "fine",
                  text: doom.text,
                  n: Math.max(0, doom.fine ?? 0),
                };
  if (doom.fine && doom.fine > 0 && main.key !== "fine")
    spend(g, life, doom.fine);
  if (doom.fine && doom.fine < 0)
    spend(g, life, Math.max(0, Math.round(life.purse * -doom.fine)));
  if (doom.brand && main.key !== "brand") crime.branded = true;
  if (doom.pillory && main.key !== "pillory") {
    addRenown(g, life, -3);
    hurt(g, life, 3, "the pillory");
  }
  if (doom.penance) {
    addRenown(g, life, -6);
    addStress(g, life, 10);
    journal(
      g,
      life,
      `A public penance at ${g.map.provinces[t.p].name}: a candle, a halter and the town watching.`,
      "bad",
    );
  }
  // ECON (r17): goods seized for a bond are taken in loanJudged (carryOut).
  if (doom.dismiss)
    for (const p of postsOf(s, life.c))
      resignPost(g, life.c, p, "dismissed on conviction");
  const nation = jail?.nation ?? t.nation;
  if (
    main.key === "fine" &&
    !main.n &&
    !doom.penance &&
    !doom.seize &&
    !doom.dismiss
  ) {
    crime.jail = null;
    journal(g, life, `Sentenced: ${doom.text}.`, "bad");
    return;
  }
  if (doom.penance && main.key === "fine" && !main.n) {
    crime.jail = null;
    milestone(g, life, "convicted", `Convicted of ${t.charge}: ${doom.text}`);
    return;
  }
  punish(g, life, main, t.charge, nation);
}

function punishNpc(
  g: ConquestGame,
  t: Trial,
  d: Character,
  doom: Doom,
  here: string,
): void {
  const s = g.s;
  const judge = lifeOfChar(s, t.judge);
  const acc = lifeOfChar(s, t.accuser);
  for (const l of [judge, acc])
    if (l)
      remembers(
        g,
        l,
        g.char(d.id),
        l === judge ? "Sentenced me" : "Had me convicted",
        -25,
        8,
      );
  if (doom.hang) {
    kill(g, g.char(d.id), `hanged at ${here} for ${t.charge}`);
    if (t.sympathy > 2) {
      const pr = g.prov(t.p);
      pr.mods = pr.mods.filter((m) => m.key !== "trial:hanging");
      pr.mods.push({
        key: "trial:hanging",
        label: "A hanging the town didn't want",
        until: s.day + 180,
        fx: { unrest: 3 },
      });
    }
    return;
  }
  if (doom.transport) {
    // Shipped off: out of the county for good.
    const list = s.locals[t.p];
    if (list?.includes(d.id)) {
      s.locals[t.p] = list.filter((x) => x !== d.id);
      g.localsChanged(t.p);
    }
    g.char(d.id).abroad = true;
    return;
  }
  if (doom.dismiss)
    for (const p of postsOf(s, d.id)) resignPost(g, d.id, p, "convicted");
  // The pillory, the whip and the gaol: the town is quieter for it.
  const pr = g.prov(t.p);
  pr.mods = pr.mods.filter((m) => m.key !== "trial:order");
  pr.mods.push({
    key: "trial:order",
    label: "The court sits",
    until: s.day + 90,
    fx: { unrest: -1 },
  });
}

// ---------------------------------------------------------------- the choices in the scenes

/** A choice made in a trial scene. */
export function trialMove(
  g: ConquestGame,
  life: Life,
  id: number,
  move: string,
  pass: boolean,
): void {
  const s = g.s;
  const t = trialById(s, id);
  if (!t || t.stage >= 5) return;
  const me = meOf(s, life);
  if (!me) return;
  const d = s.chars[t.defendant];
  const say = (line: string, tone?: "good" | "bad") => {
    t.lines.push(line);
    journal(g, life, line, tone);
  };
  switch (move) {
    // ---- the defendant
    case "counsel": {
      const fee = counselFee(t);
      spend(g, life, fee);
      t.counsel = true;
      t.defence += 3;
      say(
        `You engage counsel (${fee} coins): a lawyer in a black gown who looks at your accuser as at a meal.`,
        "good",
      );
      break;
    }
    case "self":
      say("You'll answer the charge yourself.");
      break;
    case "settle": {
      const fee = settleFee(t);
      spend(g, life, fee);
      if (t.kind === "debt") loanSettled(g, t, fee); // ECON (r17): the bond is paid
      t.verdict = "acquitted";
      t.lines.push(`Settled out of court for ${fee} coins.`);
      journal(
        g,
        life,
        `You settle with ${charName(s.chars[t.accuser])} for ${fee} coins. The case is withdrawn.`,
        "good",
      );
      dropCase(g, t);
      return;
    }
    case "clerk":
      spend(g, life, witnessFee(t));
      if (pass) {
        t.evidence -= 4;
        say("The clerk's papers go missing, as papers do.", "good");
      } else {
        t.evidence += 2;
        t.sympathy -= 2;
        say("The clerk takes your money and tells the court about it.", "bad");
      }
      break;
    case "friends": {
      const n = friendsHere(s, life, t.p);
      t.defence += Math.min(6, n * 2);
      say(
        `${n === 1 ? "A friend speaks" : `${n} friends speak`} for your character, in their Sunday clothes.`,
        "good",
      );
      break;
    }
    case "cross":
      if (pass) {
        t.evidence -= 3;
        say(
          "Under your questions the witness remembers less and less.",
          "good",
        );
      } else {
        t.evidence += 1;
        say("The witness only grows surer as you question them.", "bad");
      }
      break;
    case "perjure": {
      spend(g, life, witnessFee(t));
      if (pass) {
        t.evidence -= 5;
        say("A witness who saw everything now recalls nothing.", "good");
      } else {
        t.evidence += 3;
        t.sympathy -= 3;
        say(
          "The witness you paid tells the court you paid him. Perjury, now, on top of it all.",
          "bad",
        );
      }
      break;
    }
    case "silent":
      say("You say nothing, and let them prove it.");
      break;
    case "not":
      t.plea = "not";
      say("Not guilty, my lord.");
      break;
    case "guilty":
      t.plea = "guilty";
      say("Guilty. You throw yourself on the mercy of the court.");
      break;
    case "clergy":
      t.plea = "clergy";
      t.verdict = "guilty";
      t.sentence = "burned on the thumb (benefit of clergy)";
      say(
        "You read the neck verse, Psalm 51, in a steady voice. The court allows the clergy.",
        "good",
      );
      break;
    case "confess":
      t.plea = "confess";
      say(
        "You confess it all, and name others, as the court wants. It may save your neck.",
        "bad",
      );
      break;
    case "abjure":
      t.plea = "guilty";
      say(
        "You abjure your errors before the inquisitors, and ask for penance.",
      );
      break;
    case "truth":
      t.plea = "truth";
      t.sympathy +=
        1 + (1607 + Math.floor(s.day / DAYS_PER_YEAR) >= 1735 ? 4 : 0);
      say(
        "You plead the truth of what was printed: a man may not be punished for printing the truth.",
        "good",
      );
      break;
    case "speak":
      if (pass) {
        t.sympathy += 4;
        say(
          "You speak to the jury plainly and well. Some of them nod.",
          "good",
        );
      } else {
        t.sympathy -= 1;
        say(
          "You speak too long and too hotly. The jury looks at its boots.",
          "bad",
        );
      }
      break;
    case "counselspeaks":
      t.sympathy += 3;
      say(
        "Your counsel speaks for an hour, and the jury hangs on every word.",
        "good",
      );
      break;
    case "buy": {
      const fee = courtFee(t);
      spend(g, life, fee);
      if (pass) {
        t.bribe = fee;
        say("A purse finds its way to the bench.", "good");
      } else {
        t.grade = Math.min(4, t.grade + 1);
        t.sympathy -= 4;
        t.charge = `${t.charge}, and corrupting the court`;
        say(
          "Your purse is found out. Corrupting the court is a charge of its own.",
          "bad",
        );
      }
      break;
    }
    case "mercy":
      t.plea = t.plea === "not" ? "mercy" : t.plea;
      t.sympathy += 2;
      say("You throw yourself on the mercy of the court.");
      break;
    // ---- the accuser
    case "press":
      if (pass) {
        t.evidence += 2;
        say(
          `You lay the charge against ${charName(d)} clearly and well.`,
          "good",
        );
      } else say(`You lay the charge against ${charName(d)}, haltingly.`);
      break;
    case "withdraw":
      addRenown(g, life, -1);
      t.verdict = "acquitted";
      t.lines.push("The charge is withdrawn.");
      journal(g, life, `You withdraw the charge against ${charName(d)}.`);
      dropCase(g, t);
      return;
    case "takesettle": {
      const fee = settleFee(t);
      earn(g, life, fee);
      t.verdict = "acquitted";
      t.lines.push(`Settled out of court for ${fee} coins.`);
      journal(
        g,
        life,
        `${charName(d)} pays you ${fee} coins to drop it. You drop it.`,
        "good",
      );
      dropCase(g, t);
      return;
    }
    case "witnesses":
      if (pass) {
        t.evidence += 3;
        say("Your witnesses tell it straight, and tell it twice.", "good");
      } else {
        t.evidence += 1;
        say("Your witnesses contradict each other on the small things.", "bad");
      }
      break;
    case "suborn": {
      spend(g, life, witnessFee(t));
      if (pass) {
        t.evidence += 5;
        say("A new witness comes forward with a remarkable memory.", "good");
      } else {
        t.evidence -= 4;
        touchLife(g, life).scandal = {
          until: s.day + DAYS_PER_YEAR,
          text: "Suborning a witness",
        };
        addRenown(g, life, -3);
        say(
          "Your bought witness breaks down under questioning. The court knows what you did.",
          "bad",
        );
      }
      break;
    }
    case "trust":
      say("You trust to the evidence.");
      break;
    case "address":
      if (pass) {
        t.sympathy -= 3;
        say("You remind the jury what was done, and to whom.", "good");
      } else say("Your speech to the jury lands softly.");
      break;
    case "askmercy":
      t.sympathy += 2;
      addRenown(g, life, 1);
      say(
        "You ask the court to be merciful. People think better of you for it.",
        "good",
      );
      break;
  }
  t.evidence = Math.max(0, Math.round(t.evidence * 10) / 10);
  t.defence = Math.max(0, Math.round(t.defence * 10) / 10);
  t.sympathy = Math.round(t.sympathy * 10) / 10;
  powerChanged(g, "t");
}

/** A case dropped before the verdict (settled, withdrawn). */
function dropCase(g: ConquestGame, t: Trial): void {
  const s = g.s;
  t.stage = 5;
  t.done = true;
  t.day = s.day;
  t.verdict ??= "acquitted";
  t.waiting = [];
  const life = lifeOfChar(s, t.defendant);
  if (life && t.kind === "crime" && life.crime?.jail)
    crimeState(g, life).jail = null;
  powerChanged(g, "t");
  // Anyone still holding one of its scenes: it's settled now.
  for (const c of [t.defendant, t.accuser, t.judge]) {
    const l = lifeOfChar(s, c);
    if (!l) continue;
    const before = l.events.length;
    l.events = l.events.filter(
      (e) => !(e.key.startsWith("trial-") && e.ctx.t === t.id),
    );
    if (l.events.length !== before) touchLife(g, l);
  }
}

export const counselFee = (t: Trial) => 4 + t.grade * 3;
// ECON (r17): settling a suit on a bond pays the bond, and the costs.
export const settleFee = (t: Trial) =>
  t.kind === "debt" && t.sum !== undefined
    ? Math.ceil(t.sum) + 2
    : 6 + t.grade * 4;
export const witnessFee = (t: Trial) => 5 + t.grade * 2;
export const courtFee = (t: Trial) => 15 + t.grade * 12;

/** Friends and family of yours in the county who'd speak for you. */
export function friendsHere(s: GameState, life: Life, p: number): number {
  const me = meOf(s, life);
  if (!me) return 0;
  const near = new Set(householdsOf(s, p).map((c) => c.id));
  let n = 0;
  for (const [id, tie] of Object.entries(life.ties))
    if (
      (tie === "friend" || tie === "lover" || tie === "mentor") &&
      near.has(Number(id)) &&
      s.chars[Number(id)]?.alive
    )
      n++;
  for (const k of [me.spouse, me.father, me.mother, ...me.children])
    if (
      k >= 0 &&
      near.has(k) &&
      s.chars[k]?.alive &&
      ageOf(s, s.chars[k]) >= 16
    )
      n++;
  return Math.min(4, n);
}

// ---------------------------------------------------------------- how cases come

/** Taken up for a crime: the quarter sessions as scenes (from the gaol). */
export function openCrimeTrial(g: ConquestGame, life: Life): boolean {
  const s = g.s;
  const j = life.crime?.jail;
  if (!j?.trial || life.c < 0) return false;
  if (
    (s.power?.trials ?? []).some(
      (t) => t.stage < 5 && t.defendant === life.c && t.kind === "crime",
    )
  )
    return true;
  const heat = heatOf(life, j.nation);
  openTrial(g, {
    kind: "crime",
    defendant: life.c,
    accuser: -1,
    p: j.p,
    nation: j.nation,
    charge: j.charge,
    grade: j.grade,
    evidence: 6 + j.grade * 2 + Math.min(6, heat / 10),
  });
  return true;
}

/** The attorney general (or the crown's law) prosecutes someone. */
export function prosecute(
  g: ConquestGame,
  n: number,
  by: number,
  c: number,
): string {
  const s = g.s;
  const ch = s.chars[c];
  if (!ch?.alive) return "!They're beyond the law.";
  if ((s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === c))
    return "!They're on trial already.";
  const life = lifeOfChar(s, c);
  const heat = life ? heatOf(life, n) : 0;
  const disgraced =
    (s.power?.cabinets[n]?.scandal[c] ?? 0) > s.day ||
    (life?.scandal && life.scandal.until > s.day);
  const corrupt = !!disgraced && heat < 15;
  const p = life
    ? life.travel
      ? life.home
      : life.prov
    : (ch.home ?? s.nations[n].capital);
  const where = s.provinces[p]?.owner === n ? p : s.nations[n].capital;
  openTrial(g, {
    kind: corrupt ? "corruption" : "accused",
    defendant: c,
    accuser: by,
    p: where,
    nation: n,
    charge: corrupt
      ? "corruption in office"
      : life?.crime?.record.length
        ? "crimes against the king's peace"
        : "theft and disorder",
    grade: corrupt ? 2 : Math.max(1, Math.min(3, Math.round(heat / 25))),
    evidence: 6 + heat / 8,
  });
  return `You lay an information for the crown against ${charName(ch)}. The court will hear it.`;
}

/** The chaplain (or the Holy Office's commissary) accuses someone of witchcraft or heresy. */
export function accuse(
  g: ConquestGame,
  n: number,
  by: number,
  c: number,
): string {
  const s = g.s;
  const ch = s.chars[c];
  if (!ch?.alive) return "!They're beyond accusing.";
  const nation = s.nations[n];
  const heresy =
    nation.culture === "spanish" || nation.culture === "portuguese";
  openTrial(g, {
    kind: heresy ? "heresy" : "witchcraft",
    defendant: c,
    accuser: by,
    p: lifeOfChar(s, c)?.prov ?? ch.home ?? nation.capital,
    nation: n,
    charge: heresy ? "heresy and blasphemy" : "witchcraft",
    grade: heresy ? 2 : 4,
    evidence: 4 + stat(s, s.chars[by], "dip") / 3,
  });
  const pr = g.prov(nation.capital);
  pr.mods = pr.mods.filter((m) => m.key !== "trial:fear");
  pr.mods.push({
    key: "trial:fear",
    label: "An accusation, and fear",
    until: s.day + 120,
    fx: { unrest: 2 },
  });
  return heresy
    ? `You denounce ${charName(ch)} to the Holy Office. The familiars come at night.`
    : `You bring ${charName(ch)} before the magistrates on a charge of witchcraft. The town talks of nothing else.`;
}

/** An act of grace: the colony's waiting criminal cases are dropped. */
export function graceTrials(g: ConquestGame, n: number): void {
  for (const t of g.s.power?.trials ?? [])
    if (
      t.stage < 5 &&
      t.nation === n &&
      (t.kind === "crime" || t.kind === "accused")
    ) {
      t.lines.push("Dropped under the governor's act of grace.");
      dropCase(g, t);
    }
}

/** Someone you accuse before the justices (a constable's or a churchwarden's presentment). */
export function present(
  g: ConquestGame,
  life: Life,
  c: number,
  p: number,
  kind: "accused" | "presentment",
  charge: string,
  grade: number,
): string | null {
  const s = g.s;
  const ch = s.chars[c];
  const me = meOf(s, life);
  if (!me || !ch?.alive) return "They're gone.";
  if ((s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === c))
    return `${ch.first} is before the court already.`;
  openTrial(g, {
    kind,
    defendant: c,
    accuser: me.id,
    p,
    nation: s.provinces[p].owner,
    charge,
    grade,
    evidence: 5 + skillLevel(s, life, "persuasion") / 3,
  });
  return null;
}

const NPC_CHARGES: [TrialKind, string, number][] = [
  ["accused", "stealing a hog", 1],
  ["accused", "breaking into a store-house", 2],
  ["accused", "an assault in the tavern", 1],
  ["accused", "receiving stolen goods", 2],
  ["presentment", "drunkenness on the sabbath", 1],
  ["presentment", "keeping a disorderly house", 1],
  ["presentment", "a bastard child", 1],
  ["accused", "horse theft", 3],
  ["debt", "a debt of twelve pounds unpaid", 1],
];

/** The county's cases for a player justice to hear (one at a time). */
export function sessionsMonthly(g: ConquestGame): void {
  const s = g.s;
  const r = pdice(g);
  for (const life of s.lives) {
    if (life.c < 0 || life.watching) continue;
    for (const list of Object.values(s.society?.offices ?? {}))
      for (const o of list) {
        if (o.key !== "justice" || o.holder !== life.c) continue;
        if (
          (s.power?.trials ?? []).some((t) => t.stage < 5 && t.judge === life.c)
        )
          continue;
        if (!r.chance(0.35)) continue;
        const folk = householdsOf(s, o.prov).filter(
          (c) => ageOf(s, c) >= 18 && !isPlayed(s, c.id) && c.id !== life.c,
        );
        if (folk.length < 2) continue;
        const d = folk[r.int(0, folk.length - 1)];
        const others = folk.filter((c) => c.id !== d.id);
        const a = others[r.int(0, others.length - 1)];
        const [kind, charge, grade] =
          NPC_CHARGES[r.int(0, NPC_CHARGES.length - 1)];
        openTrial(g, {
          kind,
          defendant: d.id,
          accuser: kind === "presentment" ? -1 : a.id,
          judge: life.c,
          p: o.prov,
          nation: o.nation,
          charge,
          grade,
          evidence: 4 + r.int(0, 8),
        });
      }
  }
}

/** Debts left unpaid twice over: the lender sues. */
export function debtSuits(g: ConquestGame): void {
  const s = g.s;
  const ps = power(g);
  for (const life of s.lives) {
    if (life.c < 0 || life.watching) continue;
    for (const d of life.debts) {
      const key = `${life.seat}:${d.to}`;
      // Life.ts puts an unpaid debt off by 90 days at the month's turn.
      if (d.due === s.day + 90) ps.dunned[key] = (ps.dunned[key] ?? 0) + 1;
      if ((ps.dunned[key] ?? 0) < 2) continue;
      delete ps.dunned[key];
      const lender = s.chars[d.to];
      if (!lender?.alive) continue;
      const p = life.travel ? life.home : life.prov;
      const owner = s.provinces[p]?.owner ?? -1;
      if (owner < 0 || s.nations[owner]?.kind !== "power") continue;
      if (
        (ps.trials ?? []).some(
          (t) => t.stage < 5 && t.defendant === life.c && t.kind === "debt",
        )
      )
        continue;
      openTrial(g, {
        kind: "debt",
        defendant: life.c,
        accuser: lender.id,
        p,
        nation: owner,
        charge: `a debt of ${Math.round(d.amount)} coins to ${charName(lender)}`,
        grade: 1,
        evidence: 10,
      });
    }
    for (const k of Object.keys(ps.dunned))
      if (
        k.startsWith(`${life.seat}:`) &&
        !life.debts.some((d) => `${life.seat}:${d.to}` === k)
      )
        delete ps.dunned[k];
  }
}

/** Witches and heretics, in their years: rarely, someone points at a player. */
export function accusationsMonthly(g: ConquestGame): void {
  const s = g.s;
  const r = pdice(g);
  const year = 1607 + Math.floor(s.day / DAYS_PER_YEAR);
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching || life.travel || ageOf(s, me) < 16)
      continue;
    const n = s.provinces[life.prov]?.owner ?? -1;
    const nation = s.nations[n];
    if (!nation || nation.kind !== "power") continue;
    if (
      (s.power?.trials ?? []).some((t) => t.stage < 5 && t.defendant === me.id)
    )
      continue;
    let chance = 0;
    let kind: TrialKind | null = null;
    if (
      (nation.culture === "spanish" || nation.culture === "portuguese") &&
      me.religion !== "catholic"
    ) {
      kind = "heresy";
      // The Holy Office was slow and mostly busy elsewhere: rare.
      chance = 0.0006;
    } else if (
      (nation.culture === "english" || nation.religion === "puritan") &&
      year >= 1640 &&
      year <= 1700
    ) {
      kind = "witchcraft";
      // Rare: a few hundred accused in sixty years, nearly all in New England.
      chance = nation.religion === "puritan" ? 0.00015 : 0.00003;
      if (me.female) chance *= 3;
      if (skillLevel(s, life, "medicine") >= 6) chance *= 2;
      if (
        Object.values(life.ties).some((t) => t === "rival" || t === "nemesis")
      )
        chance *= 2;
      if (year >= 1691 && year <= 1693) chance *= 4;
    }
    if (!kind || !r.chance(chance)) continue;
    const folk = householdsOf(s, life.prov).filter(
      (c) => c.id !== me.id && !isPlayed(s, c.id) && ageOf(s, c) >= 14,
    );
    const rival = folk.find(
      (c) => life.ties[c.id] === "rival" || life.ties[c.id] === "nemesis",
    );
    const by = rival ?? folk[r.int(0, Math.max(0, folk.length - 1))];
    if (!by) continue;
    openTrial(g, {
      kind,
      defendant: me.id,
      accuser: by.id,
      p: life.prov,
      nation: n,
      charge:
        kind === "heresy"
          ? "heresy (they say you were heard to mock the Mass)"
          : "witchcraft (a neighbour's child fell ill after you passed)",
      grade: kind === "heresy" ? 2 : 4,
      evidence: kind === "heresy" ? 7 : 6,
    });
  }
}

// ---------------------------------------------------------------- the days

/** Stages that have waited long enough go on; the roll is kept tidy. */
export function trialsDaily(g: ConquestGame): void {
  const s = g.s;
  const ts = s.power?.trials;
  if (!ts?.length) return;
  for (const t of ts) {
    if (t.done && t.stage >= 5) {
      // Verdict scenes still waiting.
      if (t.waiting.length && s.day > t.until + STAGE_DAYS) {
        t.waiting = [];
        powerChanged(g, "t");
      } else if (t.waiting.length) askEnd(g, t);
      continue;
    }
    if (t.stage >= 5) {
      // The verdict's out; the defendant hasn't heard it yet.
      if (s.day > t.until + STAGE_DAYS) carryOut(g, t);
      else askEnd(g, t);
      continue;
    }
    // A party who died or left: the case falls (the defendant), or goes on.
    if (!s.chars[t.defendant]?.alive) {
      t.lines.push("The case falls: the accused is dead.");
      dropCase(g, t);
      continue;
    }
    if (s.day >= t.until && t.waiting.length) {
      // Nobody answered: the stage goes on without them.
      for (const w of t.waiting) {
        const [seat, key] = w.split("|");
        const life = s.lives.find((l) => l.seat === seat);
        if (!life) continue;
        const before = life.events.length;
        life.events = life.events.filter(
          (e) => !(e.key === key && e.ctx.t === t.id),
        );
        if (before !== life.events.length) {
          touchLife(g, life);
          journal(
            g,
            life,
            `${STAGES[t.stage]}: you said nothing, and the court went on without you.`,
          );
        }
      }
      t.waiting = [];
      advance(g, t);
      if (t.stage < 5) beginStage(g, t);
      continue;
    }
    if (t.waiting.length) askWaiting(g, t);
  }
}

// A death in a duel, where a player fired the shot: the law may want a word.
hooks.death.push((g, c, cause) => {
  const m = /^a duel with (.+)$/.exec(cause);
  if (!m) return;
  const s = g.s;
  const life = s.lives.find((l) => {
    const me = meOf(s, l);
    return !!me?.alive && charName(me) === m[1] && !l.watching;
  });
  if (!life) return;
  const p = life.prov;
  const n = lawAt(s, p);
  if (n < 0 || s.nations[n]?.kind !== "power") return;
  if (!pdice(g).chance(0.5)) return;
  const kin = [c.spouse, c.father, ...c.children].find(
    (k) => k >= 0 && s.chars[k]?.alive && !isPlayed(s, k),
  );
  openTrial(g, {
    kind: "duel",
    defendant: life.c,
    accuser: kin ?? -1,
    p,
    nation: n,
    charge: `the death of ${charName(c)} in a duel`,
    grade: 3,
    evidence: 8,
  });
});
