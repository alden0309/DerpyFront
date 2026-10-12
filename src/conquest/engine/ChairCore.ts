// CHAIR (r16): the road to the governor's chair, reckoned. The crown's
// commission and its term, the governor's health, the lieutenant
// governorship, a petition for his recall, the house's address against
// him, and where you stand on the road. Everything the page shows is
// reckoned here, from the same tables the round rolls from (Chair.ts), so
// what's shown is what happens.

import { memberFaction } from "./Assembly";
import { formatDate } from "./Calendar";
import { councillors, factionOf } from "./Council";
import { seatHolderId, seatsOf } from "./CouncilTitles";
import { Explain } from "./Explain";
import {
  Check,
  isChildLife,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  officesOf,
  opinionOf,
  skillLevel,
  travelRoute,
  yes,
} from "./LifeQueries";
import type { World } from "./Map";
import { localOfficesOf } from "./Offices";
import { governorScore } from "./Politics";
import { cabinetOf } from "./PowerCore";
import {
  ageOf,
  charName,
  deathRisk,
  hasTrait,
  opinionOfRuler,
  provincesOf,
  stat,
} from "./Queries";
import { DAYS_PER_YEAR, TITLE_NAMES } from "./Rules";
import { hash01 } from "./SocietyCore";
import type {
  Address,
  Breakdown,
  ChairState,
  Character,
  GameState,
  Life,
  Nation,
  RecallPetition,
} from "./Types";
import { worldRng } from "./WorldRng";

// ---------------------------------------------------------------- the tables

/** A royal governor's commission: three to eight years, then another term (two to four) or a successor. */
export const TERM = { min: 3, max: 8, againMin: 2, againMax: 4 };

/** The lieutenant governorship: named when the governor is this old (or ill). */
export const LT = {
  /** The case it wants (the same case the crown weighs for the chair). */
  bar: 70,
  /** Old enough that the crown names a lieutenant. */
  age: 58,
  /** A month: the lieutenant governor's fees, and his pay while he acts. */
  fees: 3,
  acting: 10,
  /** Days to answer the crown's offer, and the rest after one is declined. */
  offerDays: 45,
  declineRest: 2 * DAYS_PER_YEAR,
};

/** A petition to the crown for the governor's recall. */
export const PETITION = {
  /** An agent's fee in London to begin, and his retainer a month while it runs. */
  fee: 6,
  retainer: 1,
  /** Days it gathers names, then days at sea and before the Board of Trade. */
  gather: 120,
  voyage: 60,
  /** The crown won't hear against a man it sent out this lately. */
  fresh: DAYS_PER_YEAR,
  /** After the crown throws one out, its getter-up waits this long. */
  rest: 3 * DAYS_PER_YEAR,
  age: 25,
  renown: 40,
  /** Asking for names, and writing to friends at court: how often, and the postage. */
  namesEvery: 21,
  courtEvery: 45,
  postage: 2,
  maxCourt: 3,
  /** The odds of asking for names (persuasion) and of a letter that lands (letters). */
  namesDc: 7,
  courtDc: 8,
  /** The governor's own answer: letters to London, and what they take off its chance. */
  answerCost: 4,
  answerDc: 7,
  answerPass: 0.2,
  answerFail: 0.08,
};

/** The house's address against the governor. */
export const ADDRESS = {
  /** Days the house debates before it divides; days it stands once carried. */
  divide: 14,
  lasts: DAYS_PER_YEAR,
  /** One a year. */
  rest: DAYS_PER_YEAR,
  /** What refusing supply does to the colony while it stands. */
  supply: { tax: -0.3, morale: -0.1, favor: -6, unrest: 2 },
  /** A governor who gives way: the crown thinks him weak. */
  yielded: { favor: -3 },
};

/** A governor here lately is passed over for the chair this long. */
export const LATELY = 5 * DAYS_PER_YEAR;

/** Living outside your colony: its seats lapse after this many days. */
export const LAPSE_DAYS = 90;

/** Moving a household to follow the government: a cart and passage, and a coin for each at home. */
export const FOLLOW = { base: 4, each: 1 };

/** Nation mods that mean a governor is in disgrace at court. */
const DISGRACE = new Set([
  "slander",
  "defied",
  "out-of-favor",
  "defied-recall",
]);

// ---------------------------------------------------------------- dice

/**
 * The track's own dice: from the game's seed, the day and a salt, so the
 * governorship's doings never move the world's own dice.
 */
export function cdice(s: GameState, salt: number, ...xs: number[]) {
  let k = salt;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 16_000 + (k & 0xffff));
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const pct = (v: number) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------- the commission

/** A colony whose governor holds the crown's commission. */
export function crownColony(nation: Nation | undefined): boolean {
  return (
    !!nation &&
    nation.alive &&
    nation.kind === "power" &&
    !nation.independent &&
    !nation.rebelling &&
    !nation.gov
  );
}

/** The governor's commission as it stands (only while it's his). */
export function chairOf(s: GameState, n: number): ChairState | undefined {
  const nation = s.nations[n];
  const ch = nation?.chair;
  return ch && ch.gov === nation.ruler && crownColony(nation) ? ch : undefined;
}

/** How long a governor's first commission runs, in years (three to eight). */
export function termYears(s: GameState, n: number, gov: number): number {
  return (
    TERM.min +
    Math.floor(
      hash01(s.settings.seed | 0, n, gov, 0x51) * (TERM.max - TERM.min + 1),
    )
  );
}

/** A further term, if the crown renews it (two to four years). */
export function againYears(
  s: GameState,
  n: number,
  gov: number,
  terms: number,
): number {
  return (
    TERM.againMin +
    Math.floor(
      hash01(s.settings.seed | 0, n, gov, terms, 0x52) *
        (TERM.againMax - TERM.againMin + 1),
    )
  );
}

/** The average unrest across a colony's counties. */
export function avgUnrest(s: GameState, n: number): number {
  const provs = provincesOf(s, n);
  return (
    provs.reduce((m, p) => m + s.provinces[p].unrest, 0) /
    Math.max(1, provs.length)
  );
}

/** The crown's mind when the commission runs out: renew it, or send another. */
export function renewOdds(s: GameState, n: number): Breakdown {
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  const gov = s.chars[nation?.ruler ?? -1];
  const e = new Explain();
  if (!ch || !gov) return e.done(3, 0, 0);
  e.add("Most governors serve one term", 0.3, true);
  e.add(
    `The crown's trust in the colony (favour ${Math.round(nation.favor)})`,
    pct(clamp((nation.favor - 55) / 150, -0.25, 0.25)),
  );
  if (ch.grievances)
    e.add(
      `Grievances heard against him (${ch.grievances})`,
      -Math.min(0.36, ch.grievances * 0.12),
    );
  if (ch.lost)
    e.add(
      `Towns lost while he governed (${ch.lost})`,
      -Math.min(0.24, ch.lost * 0.08),
    );
  if (ch.terms > 1)
    e.add(`Terms served already (${ch.terms})`, -0.12 * (ch.terms - 1));
  if (ageOf(s, gov) >= 65)
    e.add(`Grown old in the post (${ageOf(s, gov)})`, -0.15);
  if (nation.title > 0)
    e.add(`Honoured by the crown (${TITLE_NAMES[nation.title]})`, 0.05);
  if (ch.renewAsk) e.add("His letters asking for another term", ch.renewAsk);
  return e.done(3, 0.03, 0.8);
}

// ---------------------------------------------------------------- the governor's health

/** Why the governor is old or ill (and a lieutenant wanted), or null if he's hale. */
export function infirmity(
  s: GameState,
  w: World,
  c: Character | undefined,
  ch?: ChairState,
): string | null {
  if (!c?.alive) return null;
  if (ch?.laidUp && ch.laidUp > s.day)
    return hasTrait(c, "gouty")
      ? "laid up with the gout"
      : "laid up with a fever";
  const age = ageOf(s, c);
  if (hasTrait(c, "gouty")) return "gouty";
  if (hasTrait(c, "sickly")) return "sickly";
  if (hasTrait(c, "wounded")) return "never well since his wound";
  if (age >= LT.age) return `old (${age})`;
  if (deathRisk(s, w, c).total >= 0.06) return "failing";
  return null;
}

/** "39 and well", "64 and gouty", "71, laid up with the gout". */
export function healthWords(
  s: GameState,
  w: World,
  c: Character | undefined,
  ch?: ChairState,
): string {
  if (!c?.alive) return "gone";
  const age = ageOf(s, c);
  const why = infirmity(s, w, c, ch);
  if (!why) return `${age} and well`;
  if (/^old/.test(why)) return `${age}, and growing old`;
  return `${age}, and ${why}`;
}

// ---------------------------------------------------------------- the lieutenant governor

/** The lieutenant governor now (a living character of the colony), or -1. */
export function lieutenantOf(s: GameState, n: number): number {
  const ch = chairOf(s, n);
  const c = s.chars[ch?.lt ?? -1];
  return c?.alive && !c.abroad && c.nation === n ? c.id : -1;
}

/** Whether the lieutenant governor acts for the governor now. */
export function actingNow(s: GameState, n: number): boolean {
  const ch = chairOf(s, n);
  return !!ch && lieutenantOf(s, n) >= 0 && (ch.acting ?? 0) > s.day;
}

/** Who'd be offered the lieutenancy: a player whose case clears the bar. */
export function ltCase(s: GameState, life: Life): number {
  return governorScore(s, life);
}

// ---------------------------------------------------------------- living in the colony

/** Whether a life lives (keeps its household) in its own colony. */
export function livesInColony(s: GameState, life: Life): boolean {
  const me = meOf(s, life);
  if (!me) return false;
  return s.provinces[life.home]?.owner === me.nation;
}

/** What moving a household to the new capital costs. */
export function followCost(s: GameState, life: Life): number {
  const me = meOf(s, life);
  if (!me) return FOLLOW.base;
  const kin = [me.spouse, ...me.children].filter((id) => {
    const c = s.chars[id];
    return c?.alive && !c.abroad && (id === me.spouse || ageOf(s, c) < 21);
  }).length;
  return FOLLOW.base + FOLLOW.each * kin;
}

/** Can you follow the government to its new seat now. */
export function followCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  const nation = s.nations[me.nation];
  if (!nation?.alive || nation.capital < 0)
    return no("Your people have no seat of government.");
  if (life.home === nation.capital)
    return no("Your household lives at the capital already.");
  if (life.chair?.follow === nation.capital) return no("You're on your way.");
  const cost = followCost(s, life);
  if (life.purse < cost) return no(`Moving the household costs ${cost} coins.`);
  return yes;
}

// ---------------------------------------------------------------- who stands where

/** Councillors and members of the house a petition could ask for names. */
export function petitionPool(s: GameState, n: number, by: number): number[] {
  const nation = s.nations[n];
  const ids = new Set<number>();
  for (const x of councillors(s, n)) ids.add(x.c);
  for (const c of s.polities[n]?.assembly ?? []) ids.add(c);
  ids.delete(by);
  ids.delete(nation.ruler);
  return [...ids]
    .filter((c) => s.chars[c]?.alive && !s.chars[c].abroad)
    .sort((a, b) => a - b);
}

/** Whether one of the computer's people would put their name to a petition against the governor. */
export function wouldSign(s: GameState, n: number, c: number): boolean {
  const ch = s.chars[c];
  if (!ch?.alive) return false;
  const op = opinionOfRuler(s, ch).total;
  const onCouncil = councillors(s, n).some((x) => x.c === c);
  const country = onCouncil
    ? factionOf(s, n, c) === "country"
    : memberFaction(s, n, c) === "country";
  return op < -10 || (country && op < 25);
}

export function isCouncillor(s: GameState, n: number, c: number): boolean {
  return councillors(s, n).some((x) => x.c === c);
}

// ---------------------------------------------------------------- a petition for his recall

/** The petitioner's own case with the crown (a player's favour, or one of the computer's friends at home). */
function petitionerWeight(s: GameState, by: number): [string, number] | null {
  const life = lifeOfChar(s, by);
  if (life) {
    if (life.favor <= 0) return null;
    return [
      `Your favour at home (${Math.round(life.favor)})`,
      pct(Math.min(0.25, life.favor / 400)),
    ];
  }
  const c = s.chars[by];
  if (!c) return null;
  return [
    `${c.first} ${c.family}'s friends at home`,
    pct(Math.min(0.15, (stat(s, c, "dip") + stat(s, c, "ste")) / 120)),
  ];
}

/**
 * The chance the crown recalls the governor on a petition, as it stands:
 * his standing with the crown, his misrule, the petitioner's own favour,
 * the names on it, friends at court, and the governor's answer. The round
 * rolls exactly this when the answer comes.
 */
export function recallOdds(
  s: GameState,
  n: number,
  pet: RecallPetition | null,
  by: number,
): Breakdown {
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  const gov = s.chars[nation?.ruler ?? -1];
  const e = new Explain();
  if (!ch || !gov) return e.done(3, 0, 0);
  e.add("The crown is slow to recall a governor", -0.1, true);
  e.add(
    `The crown's trust in ${gov.first} (favour ${Math.round(nation.favor)})`,
    pct(clamp((50 - nation.favor) / 120, -0.3, 0.3)),
  );
  const u = avgUnrest(s, n);
  if (u > 15)
    e.add(
      `Unrest in the colony (${Math.round(u)})`,
      pct(Math.min(0.2, (u - 15) / 100)),
    );
  if (ch.lost)
    e.add(
      `Towns lost while he governed (${ch.lost})`,
      Math.min(0.3, ch.lost * 0.1),
    );
  if (ch.grievances)
    e.add(
      `Grievances the crown has heard (${ch.grievances})`,
      Math.min(0.36, ch.grievances * 0.12),
    );
  const disgrace = nation.mods.filter(
    (m) => DISGRACE.has(m.key) && m.until > s.day,
  ).length;
  if (disgrace) e.add("In disgrace at court", Math.min(0.16, disgrace * 0.08));
  const w = petitionerWeight(s, by);
  if (w) e.add(w[0], w[1]);
  if (pet) {
    const council = pet.names.filter((c) => isCouncillor(s, n, c)).length;
    const house = pet.names.length - council;
    if (council)
      e.add(
        `Councillors' names on it (${council})`,
        Math.min(0.2, council * 0.06),
      );
    if (house)
      e.add(
        `Members' names on it (${house})`,
        pct(Math.min(0.15, house * 0.03)),
      );
    if (pet.court)
      e.add(
        `Friends at court who'll speak for it (${pet.court})`,
        Math.min(0.15, pet.court * 0.05),
      );
    if (pet.defence)
      e.add(`${gov.first}'s own letters against it`, -pet.defence);
  }
  if (nation.title > 0)
    e.add(
      `His friends at court (a ${TITLE_NAMES[nation.title].toLowerCase()})`,
      pct(-0.06 * nation.title),
    );
  if (s.day - ch.since < 2 * DAYS_PER_YEAR) e.add("Lately sent out", -0.08);
  if (ch.ends - s.day < DAYS_PER_YEAR)
    e.add("His term ends soon: the crown would rather wait", -0.05);
  return e.done(3, 0.03, 0.85);
}

/** What each name, and each friend at court, would add (for the page). */
export const NAME_WEIGHT = { council: 0.06, house: 0.03, court: 0.05 };

/** Can you get up a petition for the governor's recall. */
export function petitionCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (lifeIsNative(s, life)) return no("Your people answer to no crown.");
  const n = me.nation;
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  if (!crownColony(nation) || !ch)
    return no("Only a crown colony's governor answers to the crown.");
  if (nation.ruler === me.id)
    return no("You govern: you can hardly petition against yourself.");
  if (ageOf(s, me) < PETITION.age) return no(`Not before ${PETITION.age}.`);
  if (!livesInColony(s, life)) return no("You must live in the colony.");
  const offices = officesOf(s, me.id);
  const standing =
    offices.some((o) => o.kind === "council" || o.kind === "assembly") ||
    lieutenantOf(s, n) === me.id;
  if (!standing && life.renown < PETITION.renown)
    return no(
      `The crown hears a councillor, a member of the house, or a name it knows (renown ${PETITION.renown}).`,
    );
  if (ch.petition) {
    const by = s.chars[ch.petition.by];
    return no(
      ch.petition.by === me.id
        ? "Your petition is under way."
        : `${charName(by)} has a petition under way already: put your name to it.`,
    );
  }
  if (s.day - ch.since < PETITION.fresh)
    return no(
      `The crown won't hear against a governor in his first year (from ${formatDate(ch.since + PETITION.fresh)}).`,
    );
  const rest = (life.chair?.refused ?? -Infinity) + PETITION.rest - s.day;
  if (rest > 0)
    return no(
      `The Board of Trade threw out your last petition: not before ${formatDate(s.day + rest)}.`,
    );
  if (life.purse < PETITION.fee)
    return no(`An agent in London wants ${PETITION.fee} coins to begin.`);
  return yes;
}

/** The petition you're getting up (or none). */
export function myPetition(s: GameState, life: Life): RecallPetition | null {
  const me = meOf(s, life);
  if (!me) return null;
  const p = chairOf(s, me.nation)?.petition;
  return p && p.by === me.id ? p : null;
}

/** Can you go asking for names now. */
export function namesCheck(s: GameState, life: Life): Check {
  const pet = myPetition(s, life);
  if (!pet) return no("You have no petition under way.");
  if (pet.stage !== "gathering") return no("It has sailed.");
  const left = (life.cooldowns["chair:names"] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  const me = meOf(s, life)!;
  const asked = new Set([...pet.names, ...pet.refused]);
  if (!petitionPool(s, me.nation, me.id).some((c) => !asked.has(c)))
    return no("Everyone at the table and in the house has been asked.");
  return yes;
}

/** Can you write to friends at court for it now. */
export function courtCheck(s: GameState, life: Life): Check {
  const pet = myPetition(s, life);
  if (!pet) return no("You have no petition under way.");
  if (pet.court >= PETITION.maxCourt)
    return no("Your friends at court are all writing for it.");
  const left = (life.cooldowns["chair:court"] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} day${left === 1 ? "" : "s"}.`);
  if (life.purse < PETITION.postage)
    return no(`Postage: ${PETITION.postage} coins.`);
  return yes;
}

/** The chance a skill check passes (the same formula every act rolls). */
export function skillOdds(
  s: GameState,
  life: Life,
  sk: "persuasion" | "letters",
  dc: number,
): number {
  return Math.max(
    0.08,
    Math.min(0.95, 0.6 + (skillLevel(s, life, sk) - dc) * 0.07),
  );
}

// ---------------------------------------------------------------- the house's address

/** What the house holds against the governor, as it stands. */
export function grievancesOf(s: GameState, n: number): Breakdown {
  const nation = s.nations[n];
  const gov = s.chars[nation?.ruler ?? -1];
  const e = new Explain();
  if (!nation || !gov) return e.done(1);
  e.add("The house is slow to quarrel with a governor", -2, true);
  if (nation.tax === 2) e.add("Taxes are high", 2);
  else if (nation.tax === 1) e.add("Taxes at the usual rate", 0.5);
  const u = avgUnrest(s, n);
  if (u > 20)
    e.add(
      `Unrest in the counties (${Math.round(u)})`,
      Math.round(Math.min(3, (u - 20) / 10) * 10) / 10,
    );
  const cab = cabinetOf(s, n);
  const vetoes = (cab?.bills ?? []).filter(
    (b) => b.stage === "vetoed" && s.day - b.day < DAYS_PER_YEAR + 60,
  ).length;
  if (vetoes)
    e.add(`Bills he has vetoed this year (${vetoes})`, Math.min(3, vetoes));
  if (
    nation.mods.some(
      (m) =>
        (m.key === "prorogued" || m.key === "dissolved") && m.until > s.day,
    )
  )
    e.add("He sent the house home lately", 2);
  if (nation.favor < 35) e.add("A governor the crown distrusts", 1);
  if (hasTrait(gov, "cruel")) e.add("A cruel governor", 1);
  if (hasTrait(gov, "generous")) e.add("A generous governor", -1);
  if (hasTrait(gov, "charming")) e.add("A charming governor", -1);
  return e.done(1);
}

/** The mover's weight in the house. */
function moverSway(s: GameState, by: number): number {
  const life = lifeOfChar(s, by);
  if (life)
    return (
      Math.min(3, life.renown / 30) + skillLevel(s, life, "persuasion") / 5
    );
  return stat(s, s.chars[by], "dip") / 3;
}

/** How one of the computer's members leans on an address: positive is aye. */
export function addressLean(
  s: GameState,
  n: number,
  c: number,
  by: number,
  salary: boolean,
  supply: boolean,
  salt: number,
): number {
  const side = memberFaction(s, n, c) === "country" ? 1 : -1;
  let v = side * 3 + grievancesOf(s, n).total + moverSway(s, by);
  if (supply) v -= 1.5;
  else if (salary) v += 0.5;
  v += hash01(c, n, salt, 0x41) * 4 - 2;
  return v;
}

/** How the house would divide on an address today (players vote for themselves). */
export function addressDivision(
  s: GameState,
  n: number,
  by: number,
  salary: boolean,
  supply: boolean,
  salt: number,
  votes: Record<number, number> = {},
): { ayes: number; noes: number; abstain: number } {
  let ayes = 1;
  let noes = 0;
  let abstain = 0;
  for (const c of s.polities[n]?.assembly ?? []) {
    if (c === by || !s.chars[c]?.alive) continue;
    if (lifeOfChar(s, c)) {
      const v = votes[c] ?? 0;
      if (v > 0) ayes++;
      else if (v < 0) noes++;
      else abstain++;
      continue;
    }
    if (addressLean(s, n, c, by, salary, supply, salt) > 0) ayes++;
    else noes++;
  }
  return { ayes, noes, abstain };
}

/** How a governor the computer plays would answer an address carried against him. */
export function addressAnswerOdds(
  s: GameState,
  n: number,
): { yield: number; dissolve: number; hold: number; why: string[] } {
  const nation = s.nations[n];
  const gov = s.chars[nation?.ruler ?? -1];
  const why: string[] = [];
  let y = 0.4;
  const u = avgUnrest(s, n);
  if (u > 30) {
    y += 0.15;
    why.push(
      `unrest in the counties (${Math.round(u)}) makes him likelier to give way`,
    );
  }
  if (nation.favor < 40) {
    y += 0.1;
    why.push("so does the crown's distrust");
  }
  if (hasTrait(gov, "cruel") || hasTrait(gov, "ambitious")) {
    y -= 0.15;
    why.push(
      `a ${hasTrait(gov, "cruel") ? "cruel" : "proud"} man gives way less`,
    );
  }
  if (
    hasTrait(gov, "just") ||
    hasTrait(gov, "tolerant") ||
    hasTrait(gov, "generous")
  ) {
    y += 0.1;
    why.push("a reasonable man gives way more");
  }
  const pol = s.polities[n];
  let d = pol && pol.election - s.day > 120 ? 0.3 : 0;
  if (d && hasTrait(gov, "ambitious")) d += 0.1;
  if (!d) why.push("the election is near, so he won't dissolve the house");
  y = clamp(y, 0.05, 0.85);
  const h = Math.max(0.1, 1 - y - d);
  const t = y + d + h;
  return { yield: pct(y / t), dissolve: pct(d / t), hold: pct(h / t), why };
}

/** Can you (the speaker) move an address against the governor. */
export function addressCheck(
  s: GameState,
  life: Life,
  salary: boolean,
  supply: boolean,
): Check {
  const me = meOf(s, life);
  if (!me || life.watching) return no("You're watching.");
  const n = me.nation;
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  if (!crownColony(nation) || !ch)
    return no("Only a crown colony's house addresses its governor.");
  const cab = cabinetOf(s, n);
  if (cab?.speaker !== me.id)
    return no("The speaker moves an address, from the chair.");
  if ((cab?.prorogued ?? 0) > s.day)
    return no("The house is prorogued: it isn't sitting.");
  if (!salary && !supply)
    return no("Withhold his salary, refuse supply, or both.");
  const a = ch.address;
  if (a && (a.stage === "moved" || a.stage === "carried"))
    return no(
      a.stage === "moved"
        ? "An address is before the house already."
        : "An address stands against him already.",
    );
  const rest = (ch.lastAddress ?? -Infinity) + ADDRESS.rest - s.day;
  if (rest > 0)
    return no(`One address a year: not before ${formatDate(s.day + rest)}.`);
  if (salary && (cab?.unpaid ?? 0) > s.day)
    return no("His salary is withheld already.");
  return yes;
}

/** Whether an address against the governor stands now (carried, not yet over). */
export function addressInForce(s: GameState, n: number): Address | null {
  const a = chairOf(s, n)?.address;
  return a && a.stage === "carried" && a.until > s.day ? a : null;
}

// ---------------------------------------------------------------- court, and the appointer

/** What "Seek a place at court" needs, before when it can be asked again. */
export function courtNeeds(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  const n = s.provinces[life.prov]?.owner ?? -1;
  const nation = s.nations[n];
  if (!nation || n !== me.nation) return no("Only among your own people.");
  if (nation.capital !== life.prov) return no("That's done at the capital.");
  if (nation.ruler === me.id) return no("You rule here.");
  if (
    nation.court.includes(me.id) ||
    seatsOf(nation).some((st) => seatHolderId(s, n, st) === me.id)
  )
    return no("You're at court already.");
  const native = nation.kind === "native";
  const offices = officesOf(s, me.id);
  if (life.renown < 20 && !offices.length)
    return no(
      native
        ? `The council fire hears people of renown (20; you have ${Math.floor(life.renown)}).`
        : `The governor sees people of some renown (20; you have ${Math.floor(life.renown)}), or who hold an office.`,
    );
  const ruler = s.chars[nation.ruler];
  const op = ruler?.alive ? opinionOf(s, ruler, life).total : 0;
  if (op < 15)
    return no(
      `${charName(ruler)} doesn't think well enough of you yet (opinion ${op} of 15).`,
    );
  return yes;
}

/** Where someone is to be found, and how far: "at Jamestown, the capital, about 4 days from here". */
export function whereabouts(
  s: GameState,
  w: World,
  life: Life,
  c: number,
): { p: number; days: number; text: string } | null {
  const ch = s.chars[c];
  if (!ch?.alive || ch.abroad) return null;
  const t = (s.travellers ?? []).find((x) => x.c === c);
  let p = t ? (t.depart < 0 ? t.prov : t.dest) : (ch.home ?? -1);
  const nation = s.nations[ch.nation];
  if (
    p < 0 ||
    nation?.ruler === c ||
    seatsOf(nation).some((st) => seatHolderId(s, ch.nation, st) === c)
  )
    p = t ? p : (nation?.capital ?? p);
  if (p < 0) return null;
  const name = w.map.provinces[p]?.name ?? "somewhere";
  const capital = nation?.capital === p ? ", the capital" : "";
  if (p === life.prov) return { p, days: 0, text: `here at ${name}${capital}` };
  const route = travelRoute(
    s,
    w.map,
    life.prov,
    p,
    false,
    lifeIsNative(s, life),
  );
  const days = route ? Math.round(route.days) : -1;
  return {
    p,
    days,
    text: `at ${name}${capital}${t && t.depart >= 0 ? " (on his way there)" : ""}${days > 0 ? `, about ${days} day${days === 1 ? "" : "s"} from here` : ""}`,
  };
}

// ---------------------------------------------------------------- the road, where you are on it

export interface RoadStep {
  key: "name" | "county" | "court" | "house" | "council" | "lt" | "governor";
  title: string;
  /** Done (now or before), with the day it was first reached if known. */
  done: boolean;
  day?: number;
  /** The step you're on. */
  here: boolean;
  /** A step you can pass by. */
  optional?: boolean;
  /** What it needs, and where you stand: plain words. */
  text: string;
}

/** The road to the governor's chair, from where you stand. */
export function roadView(s: GameState, w: World, life: Life): RoadStep[] {
  const me = meOf(s, life);
  if (!me) return [];
  const n = me.nation;
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  const steps = life.chair?.steps ?? {};
  const offices = officesOf(s, me.id);
  const governs = nation?.ruler === me.id;
  const council =
    offices.some((o) => o.kind === "council") ||
    cabinetOf(s, n)?.speaker === me.id;
  const house = offices.some((o) => o.kind === "assembly");
  const lt = lieutenantOf(s, n) === me.id;
  const court = !!nation?.court.includes(me.id) || council || governs;
  const county = localOfficesOf(s, me.id).length > 0;
  const name =
    life.renown >= 20 || life.purse >= 40 || offices.length > 0 || !!steps.name;
  const pol = s.polities[n];
  const ruler = s.chars[nation?.ruler ?? -1];
  const score = Math.round(governorScore(s, life));
  const out: RoadStep[] = [];
  const push = (x: Omit<RoadStep, "here" | "day"> & { day?: number }) =>
    out.push({ ...x, here: false });
  push({
    key: "name",
    title: "A name of your own",
    done: name,
    day: steps.name,
    text: name
      ? "Property, a trade, a name: the house and the county will hear you."
      : `Property, a trade's upper rungs, renown 20 or 40 coins in your purse (you have renown ${Math.floor(life.renown)} and ${Math.floor(life.purse)} coins).`,
  });
  push({
    key: "county",
    title: "A county or town office",
    done: county || !!steps.county,
    day: steps.county,
    optional: true,
    text: county
      ? "You hold one now: do its duty, and it counts toward everything after."
      : "Stand at a poll or ask the one who appoints (Society › Office). It helps every case after; it isn't required.",
  });
  const op = ruler?.alive && !governs ? opinionOf(s, ruler, life).total : 0;
  push({
    key: "court",
    title: "Received at court",
    done: court || !!steps.court,
    day: steps.court,
    text: court
      ? "You're among those the council is chosen from."
      : `At the governor's house in the capital: renown 20 or an office (you have ${Math.floor(life.renown)}${offices.length ? ", and an office" : ""}), and ${ruler ? ruler.first : "the governor"}'s good opinion, 15 (he has ${op}).`,
  });
  push({
    key: "house",
    title: `A seat in ${pol?.name ?? "the assembly"}`,
    done: house || !!steps.house,
    day: steps.house,
    text: house
      ? cabinetOf(s, n)?.speaker === me.id
        ? "You sit, and the house chose you its speaker: a seat at the council table with it."
        : "You sit. The house chooses its speaker from its members (21, and two years in the house first under 25)."
      : `Stand at the next election${pol ? `, on ${formatDate(pol.election)}` : ""}: freeholders, men of property (40 coins) or the well known (renown 20).`,
  });
  push({
    key: "council",
    title: "A seat on the council",
    done: council || !!steps.council,
    day: steps.council,
    text: council
      ? "You sit at the council table."
      : "When a seat falls empty the governor may offer it to someone at court; or ask him for one at his house. His friends expect presents.",
  });
  const ill = infirmity(s, w, ruler, ch);
  const ltId = lieutenantOf(s, n);
  push({
    key: "lt",
    title: "The lieutenant governorship",
    done: lt || !!steps.lt,
    day: steps.lt,
    optional: true,
    text: lt
      ? "You hold the crown's commission as lieutenant governor: you act in the governor's absence and succeed him."
      : ltId >= 0
        ? `${charName(s.chars[ltId])} holds it. The lieutenant governor acts in the governor's absence and succeeds him.`
        : `The crown names one when the governor grows old or ill${ill ? ` (he is ${ill} now)` : ""}: the best case in the colony, ${LT.bar} or more (yours ${score}).`,
  });
  const best = bestCouncilCase(s, n, me.id);
  const lately = (life.chair?.lately ?? 0) > s.day;
  push({
    key: "governor",
    title: "The governor's chair",
    done: governs || !!steps.governor,
    day: steps.governor,
    text: governs
      ? ch
        ? `You govern. Your commission runs to ${formatDate(ch.ends)}.`
        : "You govern."
      : `When the chair falls empty (his death, his recall, or his commission's end${ch ? ` on ${formatDate(ch.ends)}` : ""}), the crown names the lieutenant governor, or the best case of 100 that beats the council's best (yours ${score}; the council's best ${best}).${lately ? " Lately governor here, you're passed over for a while." : ""}`,
  });
  // You are here: the first step not done that isn't optional (or the chair).
  const at = out.find((x) => !x.done && !x.optional) ?? out[out.length - 1];
  at.here = true;
  return out;
}

/** The council's best case for the chair, as the crown sees it (the same as Politics' bar). */
export function bestCouncilCase(s: GameState, n: number, not = -1): number {
  const nation = s.nations[n];
  if (!nation) return 0;
  const rivals = councillors(s, n)
    .map((x) => s.chars[x.c])
    .filter((c) => c?.alive && c.id !== not && !lifeOfChar(s, c.id))
    .map((c) => (stat(s, c, "ste") + stat(s, c, "dip")) * 3 + 10);
  return Math.max(nation.kind === "native" ? 70 : 100, ...rivals);
}

/** What would bring the chair nearer, in a few plain lines. */
export function nearerWords(s: GameState, w: World, life: Life): string[] {
  const me = meOf(s, life);
  if (!me) return [];
  const n = me.nation;
  const nation = s.nations[n];
  const ch = chairOf(s, n);
  if (!ch || nation.ruler === me.id) return [];
  const out: string[] = [];
  const ruler = s.chars[nation.ruler];
  const p = petitionCheck(s, life);
  if (ch.petition)
    out.push(
      ch.petition.by === me.id
        ? `Your petition for his recall is ${ch.petition.stage === "gathering" ? "gathering names" : "at sea"}: the crown's answer about ${formatDate(ch.petition.answer)}.`
        : `${charName(s.chars[ch.petition.by])} is getting up a petition for his recall.`,
    );
  else if (p.ok)
    out.push(
      `Petition the crown for his recall: as things stand it would land ${Math.round(recallOdds(s, n, null, me.id).total * 100)} times in a hundred, before names and friends at court.`,
    );
  else out.push(`A petition for his recall: ${p.why}`);
  const cab = cabinetOf(s, n);
  if (cab?.speaker === me.id)
    out.push(
      "From the speaker's chair, the house's address: withhold his salary, or refuse supply.",
    );
  const ill = infirmity(s, w, ruler, ch);
  if (lieutenantOf(s, n) < 0)
    out.push(
      ill
        ? `He is ${ill}: the crown will name a lieutenant governor, and the best case is offered it.`
        : "When he grows old or ill, the crown names a lieutenant governor.",
    );
  return out;
}
