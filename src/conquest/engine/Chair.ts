// CHAIR (r16): the governor's chair, in play. The crown's commission runs
// three to eight years, then the crown renews it or sends another man; a
// lieutenant governor is named when the governor grows old or ill, acts in
// his absence and succeeds him; anyone of standing can get up a petition
// to the crown for his recall, over months, at the odds shown before they
// begin; the speaker can carry the house's address against him (his salary
// withheld, supply refused). The computer's rivals and houses use the same
// levers where players live to see it, and a player who governs is told of
// each and answers it himself. When a colony's capital falls, the
// government goes to the biggest town left, everyone is told what became
// of their seats, and they can follow it. And the small things: the
// colony's own council seats are filled from the start, a law clerk at the
// governor's house attends the levee, and the speaker's chair wants a man
// of 21 (and two years in the house first under 25).
//
// The reckonings shown on the page live in ChairCore.ts; this file rolls
// them, on the track's own dice (cdice), never the world's.

import { chooseSpeaker, dissolve } from "./Assembly";
import { formatDate } from "./Calendar";
import {
  ADDRESS,
  addressAnswerOdds,
  addressCheck,
  addressDivision,
  againYears,
  bestCouncilCase,
  cdice,
  chairOf,
  courtCheck,
  crownColony,
  followCheck,
  followCost,
  grievancesOf,
  infirmity,
  LAPSE_DAYS,
  LATELY,
  lieutenantOf,
  livesInColony,
  LT,
  ltCase,
  myPetition,
  namesCheck,
  PETITION,
  petitionCheck,
  petitionPool,
  recallOdds,
  renewOdds,
  skillOdds,
  termYears,
  wouldSign,
} from "./ChairCore";
import { makeNotable, randomGovernor, succession } from "./Characters";
import {
  councillors,
  dismissCouncillor,
  ensureCabinet,
  factionOf,
} from "./Council";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { travelTo } from "./Life";
import {
  addRenown,
  gainXp,
  journal,
  milestone,
  remembers,
  rollCheck,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  isChildLife,
  isPlayed,
  lifeIsNative,
  lifeOfChar,
  meOf,
  officesOf,
} from "./LifeQueries";
import { localOfficesOf } from "./Offices";
import { postsOf, resignPost, takingPost } from "./OneOffice";
import { governorScore } from "./Politics";
import { power, powerChanged } from "./PowerCore";
import { moveHousehold } from "./Property";
import { ageOf, charName, opinionOfRuler, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { hash01 } from "./SocietyCore";
import type {
  Address,
  ChairCommand,
  ChairState,
  Character,
  GameState,
  Life,
  LifeChair,
  LifeCommand,
  ModFx,
  Nation,
  RecallPetition,
} from "./Types";

const shortName = (n: Nation) => n.name.replace(/^the /, "");
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A life's own part of the road, made the first time it's wanted. */
export function lifeChair(g: ConquestGame, life: Life): LifeChair {
  return (touchLife(g, life).chair ??= {});
}

/**
 * CHAIR (r16): favour at home, kept between 0 and 100 (POLLS puts favour on
 * its curve; this is the one place this track moves it).
 */
function favour(g: ConquestGame, life: Life, dv: number): void {
  touchLife(g, life).favor = Math.max(
    0,
    Math.min(100, Math.round((life.favor + dv) * 10) / 10),
  );
}

function natMod(
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
): void {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({ key, label, until: g.s.day + days, fx });
}

/** A colony a player lives in or belongs to: the crown's commissions are reckoned there. */
export function watched(s: GameState, n: number): boolean {
  return s.lives.some(
    (l) =>
      !l.watching &&
      l.c >= 0 &&
      (s.chars[l.c]?.nation === n || s.provinces[l.prov]?.owner === n),
  );
}

// ---------------------------------------------------------------- the commission

/** A new governor's commission (or the first the game sees of one, dated back into his term). */
function newCommission(g: ConquestGame, n: number, fresh: boolean): ChairState {
  const s = g.s;
  const nation = g.nation(n);
  const gov = nation.ruler;
  const years = termYears(s, n, gov);
  // The first sight of a governor already in office: part of his term is
  // behind him (so the colonies' commissions don't all end together).
  const served = fresh
    ? 0
    : Math.floor(
        hash01(s.settings.seed | 0, n, gov, 0x53) * (years - 1) * DAYS_PER_YEAR,
      );
  const old = nation.chair;
  const since = s.day - served;
  const ltKeep =
    old && old.lt >= 0 && old.lt !== gov && s.chars[old.lt]?.alive
      ? old.lt
      : -1;
  const ch: ChairState = {
    gov,
    since,
    ends: Math.max(s.day + 180, since + years * DAYS_PER_YEAR),
    terms: 1,
    lt: ltKeep,
    ltSince: ltKeep >= 0 ? (old?.ltSince ?? s.day) : -1,
    grievances: 0,
    lost: 0,
    petition: null,
    address: null,
    lastPetition: old?.lastPetition ?? null,
    lastAddress: old?.lastAddress,
  };
  nation.chair = ch;
  if (old && fresh) {
    // A new man: the old quarrels die with the old commission.
    const cab = s.power?.cabinets[n];
    if (cab?.unpaid && cab.unpaid > s.day) {
      cab.unpaid = 0;
      powerChanged(g, `c${n}`);
    }
    nation.mods = nation.mods.filter((m) => m.key !== "supply-refused");
    if (old.petition) {
      const by = lifeOfChar(s, old.petition.by);
      if (by)
        journal(
          g,
          by,
          `${charName(s.chars[old.gov])} is gone from the chair: your petition against ${him(s.chars[old.gov])} is moot.`,
        );
    }
  }
  const life = lifeOfChar(s, gov);
  if (life && fresh)
    journal(
      g,
      life,
      `Your commission from the crown runs ${years} years, to ${formatDate(ch.ends)}. Then the crown renews it, or sends another.`,
    );
  return ch;
}

/** Keep each watched colony's commission up to date with its governor. */
function keepCommissions(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (!crownColony(nation)) continue;
    const ch = nation.chair;
    if (ch && ch.gov !== nation.ruler && s.chars[nation.ruler]?.alive)
      newCommission(g, nation.id, true);
    else if (!ch && watched(s, nation.id) && s.chars[nation.ruler]?.alive)
      newCommission(g, nation.id, false);
  }
}

/** The crown's decision at a commission's end: renew it (true), by renewOdds exactly. */
export function renewRoll(s: GameState, n: number): boolean {
  const ch = s.nations[n].chair!;
  const gov = s.nations[n].ruler;
  return cdice(s, 1, n, gov, ch.terms).next() < renewOdds(s, n).total;
}

/** The crown's answer to a petition: recalled (true), by recallOdds exactly. */
export function recallRoll(
  s: GameState,
  n: number,
  pet: RecallPetition,
): boolean {
  return cdice(s, 2, n, pet.id).next() < recallOdds(s, n, pet, pet.by).total;
}

/** How a governor the computer plays answers an address carried against him, by addressAnswerOdds exactly. */
export function answerRoll(
  s: GameState,
  n: number,
  a: Address,
): "yield" | "dissolve" | "hold" {
  const o = addressAnswerOdds(s, n);
  const roll = cdice(s, 9, n, a.id).next();
  return roll < o.yield
    ? "yield"
    : roll < o.yield + o.dissolve
      ? "dissolve"
      : "hold";
}

/** The commission has run its course: the crown renews it, or names another. */
function termEnds(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const gov = s.chars[nation.ruler];
  const renewed = renewRoll(s, n);
  const life = gov ? lifeOfChar(s, gov.id) : undefined;
  if (renewed) {
    const yrs = againYears(s, n, nation.ruler, ch.terms);
    ch.terms++;
    ch.ends = s.day + yrs * DAYS_PER_YEAR;
    ch.renewAsk = 0;
    g.event({
      k: "crown",
      day: s.day,
      n,
      text: `The crown renews ${charName(gov)}'s commission as governor for ${yrs} years more.`,
    });
    if (life) {
      journal(
        g,
        life,
        `The crown renews your commission: you govern to ${formatDate(ch.ends)}.`,
        "good",
      );
      addRenown(g, life, 4);
    }
    return;
  }
  replaceGovernor(g, n, "term", -1);
}

/** While a governor is being replaced, the one who mustn't follow himself. */
let barred = -1;

/**
 * The crown takes the chair from its governor (his term ended, or a
 * petition recalled him) and names another. The computer's governors sail
 * for home; a player stays in the colony, a private man.
 */
export function replaceGovernor(
  g: ConquestGame,
  n: number,
  why: "term" | "recall",
  by: number,
): void {
  const s = g.s;
  const nation = g.nation(n);
  const old = s.chars[nation.ruler];
  if (!old) return;
  const oldLife = lifeOfChar(s, old.id);
  const ch = nation.chair;
  const from = ch ? formatYear(ch.since) : "";
  g.event({
    k: "crown",
    day: s.day,
    n,
    text:
      why === "term"
        ? `${charName(old)}'s commission as governor has run its course; the crown names a successor.`
        : `On ${by >= 0 ? `${charName(s.chars[by])}'s` : "a"} petition the crown recalls ${charName(old)} from the governorship.`,
  });
  rumour(
    g,
    nation.capital,
    why === "term"
      ? `${charName(old)}'s term is done: a new governor is named.`
      : `The crown has recalled ${charName(old)}!`,
    old.id,
    why === "term" ? undefined : "bad",
  );
  barred = old.id;
  try {
    if (oldLife) {
      const lc = lifeChair(g, oldLife);
      lc.lately = s.day + LATELY;
      journal(
        g,
        oldLife,
        why === "term"
          ? "Your commission has run its course and the crown has named your successor. You remain in the colony, a private gentleman with a governor's name."
          : `The crown has granted the petition against you: you are recalled from the governorship. You remain in the colony, a private gentleman${by >= 0 ? `, and ${charName(s.chars[by])} has a great deal to answer for` : ""}.`,
        "bad",
      );
      milestone(
        g,
        oldLife,
        "office",
        `${why === "term" ? "Served" : "Recalled after serving"} as governor of ${shortName(nation)}, ${from}–${formatYear(s.day)}`,
      );
    } else {
      g.touchChar(old).abroad = true;
    }
    succession(
      g,
      n,
      why === "term"
        ? `named by the crown at the end of ${charName(old)}'s term`
        : `named by the crown after ${charName(old)}'s recall`,
    );
  } finally {
    barred = -1;
  }
  if (oldLife) {
    // A former governor is still among those the council is chosen from.
    const nn = g.nation(n);
    if (!nn.court.includes(old.id) && nn.ruler !== old.id)
      nn.court.push(old.id);
  }
  if (s.chars[nation.ruler]?.alive) newCommission(g, n, true);
}

function formatYear(day: number): string {
  return formatDate(day).replace(/^.* /, "");
}

// ---------------------------------------------------------------- who succeeds

/** A player takes the chair: one office at a time, and the commission. */
function installPlayer(
  g: ConquestGame,
  life: Life,
  n: number,
  how: string,
): void {
  const s = g.s;
  const me = meOf(s, life)!;
  const nation = s.nations[n];
  takingPost(g, me.id, { kind: "governor", n });
  touchLife(g, life).tally.topOffice = 3;
  addRenown(g, life, 15);
  const title = `governor of ${shortName(nation)}`;
  journal(
    g,
    life,
    `A commission arrives from the crown: you are ${title}, ${how}. The levers are few and the expectations many.`,
    "good",
  );
  milestone(g, life, "office", `${charName(me)} became ${title}`);
  lifeChair(g, life).steps = { ...(life.chair?.steps ?? {}), governor: s.day };
}

/** Off the colony's own council seats (Characters.succession clears the old five). */
function offCabinet(g: ConquestGame, n: number, c: number): void {
  const cab = g.s.power?.cabinets[n];
  if (!cab) return;
  for (const seat of ["attorney", "surveyor"] as const)
    if (cab[seat] === c) {
      cab[seat] = -1;
      powerChanged(g, `c${n}`);
    }
}

/** The lieutenant governor, or (when the crown replaces a governor) its own choice. */
function chairSuccessor(g: ConquestGame, n: number): number {
  const s = g.s;
  const nation = s.nations[n];
  if (!crownColony(nation)) return -1;
  const lt = lieutenantOf(s, n);
  const ltLife = lt >= 0 ? lifeOfChar(s, lt) : undefined;
  if (lt >= 0 && lt !== barred && ltLife && !ltLife.watching) {
    installPlayer(g, ltLife, n, "and the lieutenant governor succeeds");
    return lt;
  }
  if (barred < 0) return -1;
  // The crown replaces a governor: the lieutenant, else the best case of
  // a player who isn't the one leaving, else a man of its own.
  if (lt >= 0 && lt !== barred) {
    offCabinet(g, n, lt);
    return lt;
  }
  let best: Life | null = null;
  let bestScore = -1;
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || me.abroad || life.watching || me.id === barred) continue;
    if (me.nation !== n || ageOf(s, me) < 25 || lifeIsNative(s, life)) continue;
    if ((life.chair?.lately ?? 0) > s.day) continue;
    const sc = governorScore(s, life);
    if (sc > bestScore) {
      best = life;
      bestScore = sc;
    }
  }
  if (best && bestScore >= bestCouncilCase(s, n, best.c)) {
    installPlayer(g, best, n, "by the crown's choice");
    return best.c;
  }
  const r = cdice(s, 4, n, barred);
  const pool = councillors(s, n)
    .map((x) => s.chars[x.c])
    .filter((c) => c?.alive && c.id !== barred && !isPlayed(s, c.id))
    .sort(
      (a, b) =>
        stat(s, b, "ste") +
          stat(s, b, "dip") -
          (stat(s, a, "ste") + stat(s, a, "dip")) || a.id - b.id,
    );
  if (pool[0] && r.chance(0.4)) {
    offCabinet(g, n, pool[0].id);
    return pool[0].id;
  }
  const man = randomGovernor(s, r, n);
  g.touchChar(man);
  return man.id;
}

/** A computer lieutenant governor succeeds when no player's case clears the bar. */
function npcLtSuccessor(g: ConquestGame, n: number): number {
  const s = g.s;
  if (!crownColony(s.nations[n])) return -1;
  const lt = lieutenantOf(s, n);
  if (lt < 0 || isPlayed(s, lt)) return -1;
  // A player whose case clears the crown's bar comes first (Politics' own
  // rule), whichever order the hooks were registered in.
  if (playerClearsBar(s, n)) return -1;
  offCabinet(g, n, lt);
  return lt;
}

/** Whether a player's case would win the chair now (Politics.chooseSuccessor's rule). */
function playerClearsBar(s: GameState, n: number): boolean {
  const nation = s.nations[n];
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || me.abroad || life.watching) continue;
    if (me.nation !== n || ageOf(s, me) < 25 || lifeIsNative(s, life)) continue;
    if ((life.chair?.lately ?? 0) > s.day || nation.ruler === me.id) continue;
    if (governorScore(s, life) >= bestCouncilCase(s, n, me.id)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the lieutenant governor

function ltMonthly(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const gov = s.chars[nation.ruler];
  // A lieutenant who's gone, or left the colony, or became governor.
  if (ch.lt >= 0) {
    const c = s.chars[ch.lt];
    const life = c ? lifeOfChar(s, c.id) : undefined;
    const gone =
      !c?.alive ||
      c.abroad ||
      c.nation !== n ||
      c.id === nation.ruler ||
      (life &&
        (life.watching || !livesInColony(s, life)) &&
        (life.chair?.outside === undefined ||
          s.day - (life.chair.outside ?? s.day) >= LAPSE_DAYS));
    if (gone) {
      if (life && c?.alive && c.id !== nation.ruler)
        journal(
          g,
          life,
          "Your commission as lieutenant governor lapses: the crown wants its lieutenant in the colony.",
          "bad",
        );
      ch.lt = -1;
      ch.ltSince = -1;
      ch.acting = undefined;
    }
  }
  // The offer lapses unanswered.
  if (ch.ltOffer && ch.ltOffer.until <= s.day) ch.ltOffer = null;
  if (ch.lt >= 0 || ch.ltOffer) return;
  const why = infirmity(s, g.w, gov, ch);
  if (!why) return;
  // The crown names a lieutenant: a player whose case clears the bar first.
  let best: Life | null = null;
  let bestScore = LT.bar - 1;
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || me.abroad || life.watching || me.id === nation.ruler)
      continue;
    if (me.nation !== n || ageOf(s, me) < 25 || lifeIsNative(s, life)) continue;
    if (!livesInColony(s, life)) continue;
    if ((life.chair?.ltDeclined ?? 0) > s.day) continue;
    if (life.events.some((e) => e.key === "chair-lt")) continue;
    const sc = ltCase(s, life);
    if (sc > bestScore) {
      best = life;
      bestScore = sc;
    }
  }
  if (best) {
    ch.ltOffer = { c: best.c, until: s.day + LT.offerDays };
    raiseEvent(g, best, "chair-lt", { n, c: nation.ruler });
    return;
  }
  const pool = councillors(s, n)
    .map((x) => s.chars[x.c])
    .filter(
      (c) =>
        c?.alive &&
        !isPlayed(s, c.id) &&
        c.id !== nation.ruler &&
        ageOf(s, c) >= 30,
    )
    .sort(
      (a, b) =>
        stat(s, b, "ste") +
          stat(s, b, "dip") -
          (stat(s, a, "ste") + stat(s, a, "dip")) || a.id - b.id,
    );
  if (!pool[0]) return;
  ch.lt = pool[0].id;
  ch.ltSince = s.day;
  g.event({
    k: "news",
    day: s.day,
    n,
    local: true,
    text: `With ${charName(gov)} ${why}, the crown names ${charName(pool[0])} lieutenant governor.`,
  });
}

/** Take (or turn down) the crown's offer of the lieutenancy. */
export function answerLt(
  g: ConquestGame,
  life: Life,
  n: number,
  yes: boolean,
): void {
  const s = g.s;
  const me = meOf(s, life);
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  if (!me || !ch) return;
  const offered = ch.ltOffer?.c === me.id && ch.ltOffer.until > s.day;
  g.nation(n);
  if (!yes) {
    if (offered) ch.ltOffer = null;
    lifeChair(g, life).ltDeclined = s.day + LT.declineRest;
    journal(
      g,
      life,
      "You decline the lieutenancy, with thanks to the Board of Trade.",
    );
    return;
  }
  if (!offered || ch.lt >= 0) {
    journal(
      g,
      life,
      "The offer has lapsed: the crown has named another.",
      "bad",
    );
    return;
  }
  ch.ltOffer = null;
  ch.lt = me.id;
  ch.ltSince = s.day;
  addRenown(g, life, 6);
  favour(g, life, 2);
  const lc = lifeChair(g, life);
  lc.steps = { ...(lc.steps ?? {}), lt: lc.steps?.lt ?? s.day };
  journal(
    g,
    life,
    `You take the crown's commission as lieutenant governor of ${shortName(nation)}: you act in ${charName(s.chars[nation.ruler])}'s absence, and succeed ${him(s.chars[nation.ruler])} if the chair falls empty.`,
    "good",
  );
  milestone(
    g,
    life,
    "office",
    `Commissioned lieutenant governor of ${shortName(nation)}`,
  );
  rumour(
    g,
    nation.capital,
    `${charName(me)} is named lieutenant governor.`,
    me.id,
    "good",
  );
}

/** The governor laid up, or away: the lieutenant governor acts. */
function actingMonthly(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const gov = s.chars[nation.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  const lt = lieutenantOf(s, n);
  const ltLife = lt >= 0 ? lifeOfChar(s, lt) : undefined;
  const wasActing = (ch.acting ?? 0) > s.day;
  if (govLife) {
    // A player governor out of the colony a month or more.
    const meHere = s.provinces[govLife.prov]?.owner === n && !govLife.travel;
    if (meHere) ch.away = undefined;
    else ch.away ??= s.day;
    if (ch.away !== undefined && s.day - ch.away >= 30 && lt >= 0)
      ch.acting = s.day + 31;
    else if (meHere) ch.acting = undefined;
  } else if (gov?.alive) {
    // The computer's governor: laid up now and then once he's old or ill.
    if ((ch.laidUp ?? 0) <= s.day && infirmity(s, g.w, gov, ch)) {
      const r = cdice(s, 5, n, gov.id);
      if (r.chance(0.08)) ch.laidUp = s.day + 30 + r.int(0, 60);
    }
    if ((ch.laidUp ?? 0) > s.day && lt >= 0) ch.acting = ch.laidUp;
  }
  const acting = (ch.acting ?? 0) > s.day && lt >= 0;
  if (acting && ltLife) {
    addRenown(g, ltLife, 1);
    favour(g, ltLife, 1);
    gainXp(g, ltLife, "persuasion", 3);
    if (!wasActing)
      journal(
        g,
        ltLife,
        govLife
          ? `${charName(gov)} is away from the colony: you act as governor in ${his(gov)} absence, presiding at the council.`
          : `${charName(gov)} is laid up${(ch.laidUp ?? 0) > s.day ? ` (until about ${formatDate(ch.laidUp!)})` : ""}: you act as governor, presiding at the council. The acting governor's pay comes with it.`,
        "good",
      );
  }
  if (acting && govLife && !wasActing)
    journal(
      g,
      govLife,
      `In your absence the lieutenant governor, ${charName(s.chars[lt])}, presides at the council.`,
    );
}

// ---------------------------------------------------------------- a petition for his recall

/** Get up a petition to the crown for the governor's recall. */
export function beginPetition(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const check = petitionCheck(s, life);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const n = me.nation;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const gov = s.chars[nation.ruler];
  withFlow(
    g,
    { key: "chair:petition", label: "A petition for the governor's recall" },
    () => spend(g, life, PETITION.fee),
  );
  ch.petition = startPetition(g, n, me.id);
  journal(
    g,
    life,
    `You retain an agent in London and begin a petition to the crown for ${charName(gov)}'s recall. It sails on ${formatDate(ch.petition.sails)}: get the council's and the house's names to it, and friends at court to speak for it.`,
  );
  return null;
}

function startPetition(g: ConquestGame, n: number, by: number): RecallPetition {
  const s = g.s;
  const nation = s.nations[n];
  const gov = s.chars[nation.ruler];
  const pet: RecallPetition = {
    id: g.nextId(),
    by,
    since: s.day,
    sails: s.day + PETITION.gather,
    answer: s.day + PETITION.gather + PETITION.voyage,
    stage: "gathering",
    names: [],
    refused: [],
    court: 0,
    defence: 0,
  };
  rumour(
    g,
    nation.capital,
    `${charName(s.chars[by])} is getting up a petition against the governor.`,
    by,
    "bad",
  );
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (govLife)
    // A player governor sees it and answers it himself.
    raiseEvent(g, govLife, "chair-petition", { n, c: by });
  else if (gov?.alive) {
    const byLife = lifeOfChar(s, by);
    if (byLife)
      remembers(
        g,
        byLife,
        g.char(gov.id),
        "Petitioned the crown against me",
        -10,
        3,
      );
  }
  return pet;
}

/** Go round the council and the house for names. */
export function gatherNames(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const check = namesCheck(s, life);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const n = me.nation;
  const nation = g.nation(n);
  const pet = nation.chair!.petition!;
  touchLife(g, life).cooldowns["chair:names"] = s.day + PETITION.namesEvery;
  const pass = rollCheck(g, skillOdds(s, life, "persuasion", PETITION.namesDc));
  gainXp(g, life, "persuasion", 5);
  const asked = new Set([...pet.names, ...pet.refused]);
  const pool = petitionPool(s, n, me.id).filter((c) => !asked.has(c));
  // Players are asked, and answer for themselves.
  const players = pool.filter((c) => isPlayed(s, c));
  for (const c of players) {
    const other = lifeOfChar(s, c)!;
    raiseEvent(g, other, "chair-sign", { n, c: me.id });
    pet.refused.push(c); // asked: not asked again (a yes adds the name)
  }
  const npcs = pool
    .filter((c) => !isPlayed(s, c))
    .sort(
      (a, b) =>
        opinionOfRuler(s, s.chars[a]).total -
          opinionOfRuler(s, s.chars[b]).total || a - b,
    );
  const signed: number[] = [];
  let asks = pass ? 3 : 2;
  for (const c of npcs) {
    if (asks-- <= 0) break;
    if (wouldSign(s, n, c) && signed.length < (pass ? 2 : 1)) {
      pet.names.push(c);
      signed.push(c);
    } else pet.refused.push(c);
  }
  const gov = s.chars[nation.ruler];
  if (!pass && gov?.alive && !isPlayed(s, gov.id))
    remembers(g, life, g.char(gov.id), "Gathering names against me", -5, 3);
  journal(
    g,
    life,
    signed.length
      ? `${signed.map((c) => charName(s.chars[c])).join(" and ")} put${signed.length === 1 ? "s" : ""} ${signed.length === 1 ? "a name" : "their names"} to the petition (${pet.names.length} now).${pass ? "" : ` Word of it reaches ${charName(gov)}.`}${players.length ? " You ask the other players at the table too." : ""}`
      : `Nobody you ask will put a name to it this time.${pass ? "" : ` Word of it reaches ${charName(gov)}.`}${players.length ? " You ask the other players at the table too." : ""}`,
    signed.length ? "good" : "bad",
  );
  return null;
}

/** A player puts a name to someone's petition (or won't). */
export function answerSign(
  g: ConquestGame,
  life: Life,
  n: number,
  yes: boolean,
): void {
  const s = g.s;
  const me = meOf(s, life);
  const pet = chairOf(s, n)?.petition;
  if (!me || !pet || pet.stage !== "gathering") {
    journal(g, life, "The petition has sailed (or is no more).");
    return;
  }
  g.nation(n);
  const by = lifeOfChar(s, pet.by);
  if (!yes) {
    journal(g, life, "You keep your name off the petition.");
    if (by)
      journal(g, by, `${charName(me)} won't put a name to your petition.`);
    return;
  }
  if (!pet.names.includes(me.id)) pet.names.push(me.id);
  const gov = s.chars[s.nations[n].ruler];
  if (gov?.alive && !isPlayed(s, gov.id))
    remembers(g, life, g.char(gov.id), "Signed a petition against me", -12, 4);
  journal(
    g,
    life,
    `You put your name to the petition against ${charName(gov)}.`,
  );
  if (by)
    journal(
      g,
      by,
      `${charName(me)} puts a name to your petition (${pet.names.length} now).`,
      "good",
    );
}

/** Write to friends at court to speak for it. */
export function courtLetters(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const check = courtCheck(s, life);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const pet = g.nation(me.nation).chair!.petition!;
  touchLife(g, life).cooldowns["chair:court"] = s.day + PETITION.courtEvery;
  withFlow(
    g,
    { key: "chair:petition", label: "A petition for the governor's recall" },
    () => spend(g, life, PETITION.postage),
  );
  const pass = rollCheck(g, skillOdds(s, life, "letters", PETITION.courtDc));
  gainXp(g, life, "letters", 6);
  if (pass) {
    pet.court++;
    journal(
      g,
      life,
      `A friend at court writes back: he'll speak for the petition at the Board of Trade (${pet.court} now).`,
      "good",
    );
  } else
    journal(
      g,
      life,
      "Your letters to court go unanswered. Very possibly they wrapped a fish.",
    );
  return null;
}

/** Let your petition drop. */
export function withdrawPetition(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const pet = myPetition(s, life);
  if (!pet) return "You have no petition under way.";
  const me = meOf(s, life)!;
  g.nation(me.nation).chair!.petition = null;
  journal(
    g,
    life,
    "You let the petition drop. Your agent in London keeps his fee.",
  );
  const gov = s.chars[s.nations[me.nation].ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (govLife)
    journal(
      g,
      govLife,
      `${charName(me)} has let the petition against you drop.`,
      "good",
    );
  return null;
}

/** The governor answers a petition against him (a player governor's scene). */
export function answerPetition(
  g: ConquestGame,
  life: Life,
  n: number,
  how: "letters" | "peace" | "ask",
  pass: boolean,
): void {
  const s = g.s;
  const pet = chairOf(s, n)?.petition;
  if (!pet) {
    journal(g, life, "The petition is no more.");
    return;
  }
  g.nation(n);
  const by = s.chars[pet.by];
  const byLife = lifeOfChar(s, pet.by);
  if (how === "letters") {
    pet.defence = Math.max(
      pet.defence,
      pass ? PETITION.answerPass : PETITION.answerFail,
    );
    journal(
      g,
      life,
      pass
        ? "Your letters reach the right desks before the petition does: it will land the softer for it."
        : "Your letters go off. Whether anyone in London reads them is another matter.",
      pass ? "good" : undefined,
    );
    if (byLife)
      journal(
        g,
        byLife,
        `${charName(s.chars[life.c])} has answered your petition with letters to London of ${his(s.chars[life.c])} own.`,
      );
    return;
  }
  if (how === "peace") {
    // One of the computer's people: won round, or not.
    if (pass) {
      g.nation(n).chair!.petition = null;
      remembers(g, life, g.char(by.id), "Made peace with me", 10, 3);
      journal(
        g,
        life,
        `You send for ${charName(by)}, and over a glass the petition is quietly dropped.`,
        "good",
      );
    } else
      journal(
        g,
        life,
        `You send for ${charName(by)}; ${he(by)} hears you out, and presses on.`,
        "bad",
      );
    return;
  }
  // Another player: they decide.
  if (byLife) raiseEvent(g, byLife, "chair-peace", { n, c: life.c });
  journal(
    g,
    life,
    `You write to ${charName(by)}, offering to make your peace. ${cap(he(by))} will answer.`,
  );
}

/** A player petitioner's answer to the governor's offer of peace. */
export function answerPeace(
  g: ConquestGame,
  life: Life,
  n: number,
  yes: boolean,
): void {
  const s = g.s;
  const gov = s.chars[s.nations[n]?.ruler ?? -1];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (yes) {
    withdrawPetition(g, life);
    if (govLife)
      journal(
        g,
        govLife,
        `${charName(meOf(s, life))} takes your hand: the petition is dropped.`,
        "good",
      );
  } else {
    journal(g, life, "You press on with the petition.");
    if (govLife)
      journal(
        g,
        govLife,
        `${charName(meOf(s, life))} presses on with the petition.`,
        "bad",
      );
  }
}

/** The crown's answer comes back. */
function petitionVerdict(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const pet = ch.petition!;
  const p = recallOdds(s, n, pet, pet.by).total;
  const won = recallRoll(s, n, pet);
  ch.petition = null;
  ch.lastPetition = { day: s.day, by: pet.by, won };
  const by = s.chars[pet.by];
  const byLife = lifeOfChar(s, pet.by);
  const gov = s.chars[nation.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (won) {
    if (byLife) {
      addRenown(g, byLife, 8);
      favour(g, byLife, 5);
      journal(
        g,
        byLife,
        `The Board of Trade has heard your petition, and the crown recalls ${charName(gov)}. Everyone in the colony knows whose petition it was.`,
        "good",
      );
      milestone(
        g,
        byLife,
        "office",
        `Petitioned the crown for ${charName(gov)}'s recall, and won`,
      );
    }
    replaceGovernor(g, n, "recall", pet.by);
    return;
  }
  // Thrown out: the governor has an enemy, and the crown remembers a near thing.
  if (p >= 0.4) ch.grievances++;
  if (byLife) {
    favour(g, byLife, -6);
    lifeChair(g, byLife).refused = s.day;
    journal(
      g,
      byLife,
      `The Board of Trade throws out your petition against ${charName(gov)}. ${cap(he(gov))} knows whose it was, and won't forget it.`,
      "bad",
    );
    if (gov?.alive && !govLife) {
      remembers(
        g,
        byLife,
        g.char(gov.id),
        "Petitioned the crown for my recall",
        -40,
        10,
      );
      if (byLife.ties[gov.id] !== "nemesis") setTie(g, byLife, gov.id, "rival");
      // He may put the petitioner off his council.
      const seat = councillors(s, n).find((x) => x.c === byLife.c);
      if (seat && seat.seat !== "speaker" && cdice(s, 6, n, pet.id).chance(0.5))
        dismissCouncillor(
          g,
          n,
          seat.seat,
          `dismissed by ${charName(gov)} for your petition`,
        );
    }
  }
  if (govLife)
    journal(
      g,
      govLife,
      `The Board of Trade has thrown out ${charName(by)}'s petition against you.`,
      "good",
    );
  rumour(
    g,
    nation.capital,
    `The crown has thrown out the petition against ${charName(gov)}.`,
    gov?.id ?? -1,
    "good",
  );
}

/** The computer's rivals petition too, where it would stand a chance. */
function npcPetitions(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  if (ch.petition || s.day - ch.since < PETITION.fresh) return;
  if (ch.lastPetition && s.day - ch.lastPetition.day < 2 * DAYS_PER_YEAR)
    return;
  const r = cdice(s, 7, n);
  if (!r.chance(0.25)) return;
  const pool = [
    ...councillors(s, n).map((x) => x.c),
    ...nation.court,
    ...(s.polities[n]?.assembly ?? []),
  ];
  let best = -1;
  let bestP = 0.18;
  for (const c of [...new Set(pool)].sort((a, b) => a - b)) {
    const x = s.chars[c];
    if (!x?.alive || x.abroad || isPlayed(s, c) || c === nation.ruler) continue;
    if (ageOf(s, x) < 25) continue;
    if (x.ambition !== "governorship" && opinionOfRuler(s, x).total > -20)
      continue;
    const p = recallOdds(s, n, null, c).total;
    if (p > bestP) {
      best = c;
      bestP = p;
    }
  }
  if (best < 0) return;
  ch.petition = startPetition(g, n, best);
}

/** A petition the computer got up gathers its names as it goes. */
function npcGathers(g: ConquestGame, n: number): void {
  const s = g.s;
  const pet = g.nation(n).chair!.petition!;
  if (isPlayed(s, pet.by) || pet.stage !== "gathering") return;
  const r = cdice(s, 8, n, pet.id);
  const asked = new Set([...pet.names, ...pet.refused]);
  for (const c of petitionPool(s, n, pet.by)) {
    if (asked.has(c) || !r.chance(0.35)) continue;
    if (isPlayed(s, c)) {
      raiseEvent(g, lifeOfChar(s, c)!, "chair-sign", { n, c: pet.by });
      pet.refused.push(c);
    } else if (wouldSign(s, n, c)) pet.names.push(c);
    else pet.refused.push(c);
  }
  if (pet.court < PETITION.maxCourt && r.chance(0.3)) pet.court++;
}

// ---------------------------------------------------------------- the house's address

/** The speaker moves the house's address against the governor. */
export function moveAddress(
  g: ConquestGame,
  life: Life,
  salary: boolean,
  supply: boolean,
): string | null {
  const s = g.s;
  const check = addressCheck(s, life, salary, supply);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  startAddress(g, me.nation, me.id, salary, supply);
  gainXp(g, life, "persuasion", 5);
  journal(
    g,
    life,
    `From the chair you move the house's address against the governor: ${asksWords(salary, supply)}. The house divides on ${formatDate(s.day + ADDRESS.divide)}.`,
  );
  return null;
}

const asksWords = (salary: boolean, supply: boolean) =>
  [salary ? "his salary withheld" : "", supply ? "supply refused" : ""]
    .filter(Boolean)
    .join(" and ");

function startAddress(
  g: ConquestGame,
  n: number,
  by: number,
  salary: boolean,
  supply: boolean,
): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const a: Address = {
    id: g.nextId(),
    by,
    day: s.day,
    salary,
    supply,
    divide: s.day + ADDRESS.divide,
    until: 0,
    stage: "moved",
    ayes: 0,
    noes: 0,
    votes: {},
  };
  ch.address = a;
  ch.lastAddress = s.day;
  for (const c of s.polities[n]?.assembly ?? []) {
    if (c === by) continue;
    const other = lifeOfChar(s, c);
    if (other) raiseEvent(g, other, "chair-address-vote", { n, c: by });
  }
  const gov = s.chars[nation.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (govLife)
    journal(
      g,
      govLife,
      `${charName(s.chars[by])} has moved an address against you in the house: ${asksWords(salary, supply)}. It divides on ${formatDate(a.divide)}.`,
      "bad",
    );
  rumour(
    g,
    nation.capital,
    `The house debates an address against the governor.`,
    by,
    "bad",
  );
}

/** A player in the house votes on an address. */
export function voteAddress(
  g: ConquestGame,
  life: Life,
  n: number,
  side: number,
): void {
  const a = chairOf(g.s, n)?.address;
  if (!a || a.stage !== "moved") return;
  g.nation(n);
  (a.votes ??= {})[life.c] = Math.sign(side);
  journal(
    g,
    life,
    side > 0
      ? "You'll vote for the address."
      : side < 0
        ? "You'll vote against the address."
        : "You'll keep out of the division.",
  );
}

function divideAddress(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  const a = ch.address!;
  // The same salt the page's forecast uses (the year it was moved).
  const d = addressDivision(
    s,
    n,
    a.by,
    a.salary,
    a.supply,
    Math.floor(a.day / DAYS_PER_YEAR),
    a.votes ?? {},
  );
  a.ayes = d.ayes;
  a.noes = d.noes;
  const byLife = lifeOfChar(s, a.by);
  const gov = s.chars[nation.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (d.ayes <= d.noes) {
    a.stage = "lost";
    if (byLife) {
      addRenown(g, byLife, -2);
      journal(
        g,
        byLife,
        `The house throws out your address, ${d.noes} to ${d.ayes}.`,
        "bad",
      );
    }
    if (gov?.alive && byLife && !govLife)
      remembers(
        g,
        byLife,
        g.char(gov.id),
        "Moved an address against me",
        -15,
        3,
      );
    if (govLife)
      journal(
        g,
        govLife,
        `The house throws out the address against you, ${d.noes} to ${d.ayes}.`,
        "good",
      );
    return;
  }
  a.stage = "carried";
  a.until = s.day + ADDRESS.lasts;
  if (a.salary) {
    const cab = power(g).cabinets[n];
    if (cab) {
      cab.unpaid = a.until;
      powerChanged(g, `c${n}`);
    }
  }
  if (a.supply)
    natMod(
      g,
      n,
      "supply-refused",
      "Supply refused by the house",
      ADDRESS.lasts,
      {
        ...ADDRESS.supply,
      },
    );
  ch.grievances++;
  if (byLife) {
    addRenown(g, byLife, 5);
    journal(
      g,
      byLife,
      `The house carries your address against ${charName(gov)}, ${d.ayes} to ${d.noes}: ${asksWords(a.salary, a.supply)}, and the crown hears of it.`,
      "good",
    );
  }
  rumour(
    g,
    nation.capital,
    `The house has carried an address against the governor: ${asksWords(a.salary, a.supply)}.`,
    a.by,
    "bad",
  );
  if (govLife) {
    raiseEvent(g, govLife, "chair-address", { n, c: a.by });
    return;
  }
  if (gov?.alive && byLife)
    remembers(
      g,
      byLife,
      g.char(gov.id),
      "Carried an address against me",
      -30,
      5,
    );
  // The computer's governor answers, by the odds the page shows.
  answerAddress(g, n, answerRoll(s, n, a));
}

/** The governor's answer to a carried address. */
export function answerAddress(
  g: ConquestGame,
  n: number,
  how: "yield" | "dissolve" | "hold",
): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair;
  const a = ch?.address;
  if (!ch || !a || a.stage !== "carried") return;
  const gov = s.chars[nation.ruler];
  const byLife = lifeOfChar(s, a.by);
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  a.answer = how;
  if (how === "hold") {
    if (byLife)
      journal(
        g,
        byLife,
        `${charName(gov)} holds out against the address: no salary for ${him(gov)}${a.supply ? ", and no supply for the colony" : ""} until ${formatDate(a.until)}.`,
      );
    if (govLife)
      journal(
        g,
        govLife,
        `You hold out. The house holds the purse${a.supply ? ", and the colony goes without supply" : ""}, until ${formatDate(a.until)}.`,
      );
    return;
  }
  endAddress(g, n, how === "yield" ? "yielded" : "dissolved");
  if (how === "yield") {
    if (nation.tax > 0) nation.tax = (nation.tax - 1) as 0 | 1 | 2;
    natMod(
      g,
      n,
      "yielded",
      "A governor who gave way to the house",
      DAYS_PER_YEAR,
      {
        ...ADDRESS.yielded,
      },
    );
    natMod(
      g,
      n,
      "address-answered",
      "The house's address answered",
      DAYS_PER_YEAR,
      {
        unrest: -2,
      },
    );
    if (byLife) {
      addRenown(g, byLife, 6);
      journal(
        g,
        byLife,
        `${charName(gov)} gives way: the taxes come down a step, and the house votes ${his(gov)} salary and supply again. The country party drinks your health.`,
        "good",
      );
    }
    if (govLife)
      journal(
        g,
        govLife,
        "You give way to the house: the taxes come down a step, and your salary and supply are voted again. London thinks you weak.",
      );
  } else {
    dissolve(g, n);
    if (byLife)
      journal(
        g,
        byLife,
        `${charName(gov)} answers the address by dissolving the house: a new election within the month.`,
        "bad",
      );
  }
}

function endAddress(
  g: ConquestGame,
  n: number,
  stage: "yielded" | "dissolved" | "ended",
): void {
  const s = g.s;
  const nation = g.nation(n);
  const a = nation.chair?.address;
  if (!a) return;
  a.stage = stage;
  const cab = s.power?.cabinets[n];
  if (a.salary && cab?.unpaid && cab.unpaid > s.day) {
    cab.unpaid = 0;
    powerChanged(g, `c${n}`);
  }
  nation.mods = nation.mods.filter((m) => m.key !== "supply-refused");
}

/** The house the computer plays moves an address of its own against a governor it can't bear. */
function npcAddress(g: ConquestGame, n: number): void {
  const s = g.s;
  const nation = g.nation(n);
  const ch = nation.chair!;
  if (
    ch.address &&
    (ch.address.stage === "moved" || ch.address.stage === "carried")
  )
    return;
  if ((ch.lastAddress ?? -Infinity) + ADDRESS.rest > s.day) return;
  const cab = s.power?.cabinets[n];
  if ((cab?.prorogued ?? 0) > s.day) return;
  const pol = s.polities[n];
  if (!pol?.assembly.length) return;
  const speaker = cab?.speaker ?? -1;
  // A player in the chair moves it himself, or doesn't.
  if (speaker >= 0 && isPlayed(s, speaker)) return;
  // Above the house's reluctance ("slow to quarrel"): what it holds against him.
  const grief = grievancesOf(s, n).total + 2;
  if (grief < 4) return;
  const r = cdice(s, 10, n);
  if (!r.chance(1 / 6)) return;
  const by =
    speaker >= 0
      ? speaker
      : (pol.assembly.find((c) => !isPlayed(s, c) && s.chars[c]?.alive) ?? -1);
  if (by < 0) return;
  startAddress(g, n, by, true, grief >= 6);
}

// ---------------------------------------------------------------- the capital falls

function capitalMoved(
  g: ConquestGame,
  n: number,
  from: number,
  to: number,
): void {
  const s = g.s;
  const nation = s.nations[n];
  if (!nation || to < 0) return;
  const fromName = g.map.provinces[from]?.name ?? "the old capital";
  const toName = g.map.provinces[to]?.name ?? "another town";
  const taker = s.nations[s.provinces[from]?.owner ?? -1];
  const ch = nation.chair;
  if (ch && chairOf(s, n)) ch.lost++;
  g.event({
    k: "story",
    day: s.day,
    n,
    title: "The government moves",
    text: `With ${fromName} in ${taker ? `${taker.adjective} hands` : "other hands"}, the government of ${shortName(nation)} has gone to ${toName}: the governor, the council and the house sit there now.`,
  });
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching || me.nation !== n) continue;
    const lines: string[] = [
      `${fromName} has fallen${taker ? ` to the ${taker.adjective}` : ""}. The government of ${shortName(nation)} has gone to ${toName}.`,
    ];
    const offices = officesOf(s, me.id);
    if (nation.ruler === me.id) lines.push(`You govern from ${toName} now.`);
    if (offices.some((o) => o.kind === "council"))
      lines.push(`Your seat on the council stands: it sits at ${toName}.`);
    if (lieutenantOf(s, n) === me.id)
      lines.push("Your commission as lieutenant governor stands.");
    if (offices.some((o) => o.kind === "assembly"))
      lines.push(`Your seat in the house stands; the house sits at ${toName}.`);
    if (localOfficesOf(s, me.id).some((o) => o.prov === from))
      lines.push(`Your office at ${fromName} lapses with the town.`);
    const homeLost = s.provinces[life.home]?.owner !== n;
    const seats =
      postsOf(s, me.id).some(
        (p) => p.kind === "assembly" || p.kind === "council",
      ) || lieutenantOf(s, n) === me.id;
    if (homeLost)
      lines.push(
        seats
          ? `Your home at ${g.map.provinces[life.home]?.name ?? fromName} is under another flag: live in the colony again within three months, or your seats lapse. You can follow the government to ${toName} (Society › Standing).`
          : `Your home at ${g.map.provinces[life.home]?.name ?? fromName} is under another flag now. You can follow the government to ${toName} (Society › Standing).`,
      );
    journal(g, life, lines.join(" "), "bad");
    if (homeLost && seats && life.chair?.outside === undefined)
      lifeChair(g, life).outside = s.day;
    if (life.home !== to) raiseEvent(g, life, "chair-capital", { n, from, to });
  }
}

/** Follow the government: your household moves to the new capital. */
export function followGovernment(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const check = followCheck(s, life);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const to = s.nations[me.nation].capital;
  const cost = followCost(s, life);
  if (life.prov !== to) {
    // Overland if there's a way, else by sea.
    const err = travelTo(g, life, to, false) && travelTo(g, life, to, true);
    if (err) return err;
  }
  withFlow(g, { key: "chair:follow", label: "Moving the household" }, () =>
    spend(g, life, cost),
  );
  lifeChair(g, life).follow = to;
  if (life.prov === to && !life.travel) settleFollow(g, life);
  else
    journal(
      g,
      life,
      `You set out for ${g.map.provinces[to].name}, the household's goods on a cart behind you.`,
    );
  return null;
}

function settleFollow(g: ConquestGame, life: Life): void {
  const lc = lifeChair(g, life);
  const to = lc.follow!;
  lc.follow = undefined;
  moveHousehold(g, life);
  lc.outside = undefined;
  journal(
    g,
    life,
    `Your household is settled at ${g.map.provinces[to].name}, where the government sits.`,
    "good",
  );
}

// ---------------------------------------------------------------- each life

/** Seats lapse for those who no longer live in the colony; the road's steps are noted. */
function chairLifeMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me?.alive || life.watching) return;
  noteSteps(g, life);
  const n = me.nation;
  const pol = s.polities[n];
  // In the house since (the speaker's chair counts it).
  if (pol?.assembly.includes(me.id)) {
    if (life.chair?.houseSince === undefined) {
      const m = [...life.milestones]
        .reverse()
        .find((x) => x.c === me.id && x.text === `Elected to ${pol.name}`);
      lifeChair(g, life).houseSince = Math.min(s.day, m?.day ?? s.day);
    }
  } else if (life.chair?.houseSince !== undefined)
    lifeChair(g, life).houseSince = undefined;
  // Seats in a colony you no longer live in lapse three months after you're
  // told (chairLifeDaily lapses them on the day).
  if (s.nations[n]?.kind !== "power") return;
  if (livesInColony(s, life) || isChildLife(s, life)) {
    if (life.chair?.outside !== undefined)
      lifeChair(g, life).outside = undefined;
    return;
  }
  noteOutside(g, life);
}

/** Living outside your colony with a seat in it: you're told when it lapses. */
function noteOutside(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me || life.chair?.outside !== undefined) return;
  const n = me.nation;
  const seats = postsOf(s, me.id).some(
    (p) => p.kind === "assembly" || p.kind === "council",
  );
  if (!seats && lieutenantOf(s, n) !== me.id) return;
  lifeChair(g, life).outside = s.day;
  journal(
    g,
    life,
    `You live outside ${shortName(s.nations[n])} now: your seats lapse on ${formatDate(s.day + LAPSE_DAYS)} unless your household lives in the colony again.`,
    "bad",
  );
}

/** The road's steps: the first day each was reached. */
function noteSteps(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life)!;
  const n = me.nation;
  const nation = s.nations[n];
  const steps = { ...(life.chair?.steps ?? {}) };
  const before = JSON.stringify(steps);
  // An old save: what the milestones say happened.
  if (!life.chair?.steps)
    for (const m of life.milestones) {
      if (m.kind !== "office" || m.c !== me.id) continue;
      if (/^Elected to /.test(m.text)) steps.house ??= m.day;
      else if (/^Made /.test(m.text) || /^Chosen speaker/.test(m.text))
        steps.council ??= m.day;
      else if (/^Became /.test(m.text)) steps.county ??= m.day;
      else if (/ became governor of /.test(m.text)) steps.governor ??= m.day;
    }
  const offices = officesOf(s, me.id);
  if (life.renown >= 20 || life.purse >= 40 || offices.length)
    steps.name ??= s.day;
  if (localOfficesOf(s, me.id).length) steps.county ??= s.day;
  if (nation?.court.includes(me.id)) steps.court ??= s.day;
  if (offices.some((o) => o.kind === "assembly")) steps.house ??= s.day;
  if (
    offices.some((o) => o.kind === "council") ||
    s.power?.cabinets[n]?.speaker === me.id
  ) {
    steps.council ??= s.day;
    steps.court ??= s.day;
  }
  if (lieutenantOf(s, n) === me.id) steps.lt ??= s.day;
  if (nation?.ruler === me.id) steps.governor ??= s.day;
  if (JSON.stringify(steps) !== before) lifeChair(g, life).steps = steps;
}

function chairLifeDaily(g: ConquestGame, life: Life): void {
  const f = life.chair?.follow;
  if (f !== undefined && !life.travel && life.prov === f) settleFollow(g, life);
  // Seats in a colony you no longer live in lapse on the day you were told.
  const out = life.chair?.outside;
  if (out !== undefined && g.s.day - out >= LAPSE_DAYS) lapseSeats(g, life);
}

/** Your seats lapse: you no longer live in the colony. */
function lapseSeats(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me?.alive || life.watching) return;
  const lc = lifeChair(g, life);
  if (livesInColony(s, life)) {
    lc.outside = undefined;
    return;
  }
  const n = me.nation;
  const seats = postsOf(s, me.id).filter(
    (p) => p.kind === "assembly" || p.kind === "council",
  );
  for (const p of seats)
    resignPost(g, me.id, p, "you no longer live in the colony");
  if (lieutenantOf(s, n) === me.id) {
    const ch = g.nation(n).chair!;
    ch.lt = -1;
    ch.ltSince = -1;
    journal(
      g,
      life,
      "Your commission as lieutenant governor lapses: you no longer live in the colony.",
      "bad",
    );
  }
  lc.outside = undefined;
}

/** The lieutenant governor's fees (and his pay while he acts); an agent's retainer. */
function chairBudget(
  s: GameState,
  life: Life,
): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const me = meOf(s, life);
  if (!me || life.watching) return out;
  const n = me.nation;
  if (lieutenantOf(s, n) === me.id) {
    out.push({ label: "Lieutenant governor's fees", value: LT.fees });
    const ch = chairOf(s, n)!;
    if ((ch.acting ?? 0) > s.day)
      out.push({ label: "Acting governor", value: LT.acting });
  }
  if (myPetition(s, life))
    out.push({
      label: "Your agent in London (the petition)",
      value: -PETITION.retainer,
    });
  return out;
}

// ---------------------------------------------------------------- the rounds

function chairDaily(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (!crownColony(nation) || !nation.chair) continue;
    const n = nation.id;
    let ch = nation.chair;
    if (ch.gov !== nation.ruler) {
      if (!s.chars[nation.ruler]?.alive) continue;
      ch = newCommission(g, n, true);
    }
    const a = ch.address;
    if (a?.stage === "moved" && s.day >= a.divide) divideAddress(g, n);
    else if (a?.stage === "carried" && s.day >= a.until)
      endAddress(g, n, "ended");
    const pet = ch.petition;
    if (pet?.stage === "gathering" && s.day >= pet.sails) {
      g.nation(n);
      pet.stage = "sent";
      const byLife = lifeOfChar(s, pet.by);
      if (byLife)
        journal(
          g,
          byLife,
          `Your petition sails for London with ${pet.names.length} name${pet.names.length === 1 ? "" : "s"} to it. The crown's answer should come about ${formatDate(pet.answer)}.`,
        );
    } else if (pet?.stage === "sent" && s.day >= pet.answer)
      petitionVerdict(g, n);
    if (chairOf(s, n) && s.day >= ch.ends) termEnds(g, n);
    // A player governor hears his term's end coming.
    const cur = chairOf(s, n);
    const govLife = cur ? lifeOfChar(s, nation.ruler) : undefined;
    if (cur && govLife && cur.ends - s.day === 90)
      raiseEvent(g, govLife, "chair-term", { n });
  }
}

function chairMonthly(g: ConquestGame): void {
  const s = g.s;
  keepCommissions(g);
  for (const nation of s.nations) {
    if (!crownColony(nation) || !chairOf(s, nation.id)) continue;
    const n = nation.id;
    ltMonthly(g, n);
    actingMonthly(g, n);
    if (!watched(s, n)) continue;
    npcPetitions(g, n);
    if (chairOf(s, n)?.petition) npcGathers(g, n);
    npcAddress(g, n);
  }
}

/** CHAIR (r16): the colony's own council seats are filled from the start, like the old five. */
function fillCabinets(g: ConquestGame): void {
  const s = g.s;
  keepCommissions(g);
  for (const nation of s.nations) {
    if (!nation.alive || nation.kind !== "power") continue;
    const n = nation.id;
    const cab = ensureCabinet(g, n);
    (["attorney", "surveyor"] as const).forEach((seat, i) => {
      if (cab[seat] >= 0) return;
      const who = makeNotable(
        s,
        cdice(s, 3, n, i),
        n,
        seat === "attorney" ? "spymaster" : "treasurer",
      );
      cab[seat] = who.id;
      cab.favour[who.id] = 45 + Math.round(hash01(who.id, n, s.day) * 20);
      cab.faction[who.id] = factionOf(s, n, who.id);
    });
    if (cab.speaker < 0 && s.polities[n]?.assembly.length) chooseSpeaker(g, n);
    powerChanged(g, `c${n}`);
  }
}

// ---------------------------------------------------------------- commands

function chairCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "chair") return undefined;
  const x = c as ChairCommand;
  const s = g.s;
  const me = meOf(s, life);
  if (!me || life.watching) return "You're watching the world now.";
  if (isChildLife(s, life)) return "Not until you're grown.";
  switch (x.act) {
    case "petition":
      return beginPetition(g, life);
    case "names":
      return gatherNames(g, life);
    case "court":
      return courtLetters(g, life);
    case "withdraw":
      return withdrawPetition(g, life);
    case "address":
      return moveAddress(g, life, !!x.salary, !!x.supply);
    case "follow":
      return followGovernment(g, life);
    default:
      return undefined;
  }
}

hooks.command.push(chairCommand);
// The lieutenant governor (a player's) first, and the crown's own choice
// when it replaces a governor; a computer lieutenant after Politics' best case.
hooks.successor.unshift(chairSuccessor);
hooks.successor.push(npcLtSuccessor);
hooks.daily.push(chairDaily);
hooks.monthEnd.push(chairMonthly);
hooks.lifeMonthly.push(chairLifeMonthly);
hooks.lifeDaily.push(chairLifeDaily);
hooks.budget.push(chairBudget);
hooks.capitalMoved.push(capitalMoved);
hooks.created.push(fillCabinets);
