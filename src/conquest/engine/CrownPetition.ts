// CROWN (r18): a governor's petition to the crown for an expedition to take
// back a town the colony lost, and the expedition it brings.
//
// The governor (a player, or the computer's own) gets it up over four
// months: letters from the council and the house, friends at court, and the
// colony's own offer (men and money the house votes, or that he and others
// pay in). Then it sails, and the crown's answer comes two months later, at
// the odds shown before he began (CrownCore's expeditionOdds). Granted, the
// crown goes to war for the town if it isn't at war already, and an
// expedition sails: the crown's regiments and guns, a squadron for a town on
// the coast, and the colony's share. It lands, under the crown's general or
// the governor himself, and marches on the town. A player of the colony can
// ride with it. Taken back: renown and favour; failed: favour lost and the
// claim weakened; refused: favour a little down, or a little up if it was a
// modest and sensible request. Players who don't govern can ask the governor
// for it, pay into the colony's share, write to court for it, and ride. The
// computer's governors petition too, where it's sensible, so reconquests
// happen where nobody plays. A petition is its colony's secret until the
// expedition sails (CrownCore's crownView); then the world hears.
//
// Every roll is on the track's own dice (kdice), never the world's.

import { formatDate } from "./Calendar";
import { makeCharacter, randomStats } from "./Characters";
import {
  askGovCheck,
  askOf,
  askSecret,
  beginCheck,
  claimedTowns,
  courtCheck,
  crownChanged,
  crownState,
  EXPEDITION,
  expeditionOdds,
  expeditionSize,
  helpable,
  kdice,
  landingFor,
  lastAsk,
  letterPool,
  lettersCheck,
  meansOf,
  nm,
  NPC_ASK,
  offerCheck,
  offerOdds,
  onCouncil,
  paidIn,
  playerGoverns,
  pledgeCheck,
  rideCheck,
  squadronGuns,
  wouldWrite,
  writeCheck,
} from "./CrownCore";
import {
  crownRegiment,
  landers,
  newArmy,
  noteLanding,
  payPassage,
  regimentsWords,
  sail,
} from "./CrownRegiments";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  earn,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import { lifeOfChar, meOf, skillLevel } from "./LifeQueries";
import { checkChance } from "./LifeRules";
import {
  ageOf,
  atWar,
  charName,
  hasTrait,
  pairKey,
  provincesOf,
  stat,
  treatyBetween,
  truceUntil,
} from "./Queries";
import { CLAIM, claimOf, reclaimChanged, reclaimState } from "./ReclaimCore";
import { DAYS_PER_YEAR, REGIMENTS } from "./Rules";
import { rumour } from "./Rumours";
import { addFavor } from "./Standing";
import type {
  CrownAsk,
  CrownCommand,
  CrownSailing,
  Life,
  LifeCommand,
  Regiment,
} from "./Types";
import { startWar } from "./War";

const town = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "the town";
const thename = (g: ConquestGame, n: number) =>
  (g.s.nations[n]?.name ?? "someone").replace(/^the /, "the ");

/** A line of your own affairs only your own player sees (a petition is your colony's secret). */
function quietNews(
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
): void {
  withFlow(g, { key: "news", label: "", aff: "expedition" }, () =>
    journal(g, life, text, tone),
  );
  const last = life.journal[life.journal.length - 1];
  if (last && last.text === text) last.sec = true;
}

/** A line of your own affairs, open to all (the expedition, once it has sailed). */
function openNews(
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
): void {
  withFlow(g, { key: "news", label: "", aff: "expedition" }, () =>
    journal(g, life, text, tone),
  );
}

/** The players of a colony (grown, living), besides some. */
function colonyLives(g: ConquestGame, n: number, not = -1): Life[] {
  return g.s.lives.filter((l) => {
    if (l.watching || l.c < 0 || l.c === not) return false;
    const c = g.s.chars[l.c];
    return !!c?.alive && c.nation === n;
  });
}

/** The colony's favour with the crown, moved for a while (a mod, as the crown's other moods). */
function colonyMood(
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  favor: number,
): void {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({
    key,
    label,
    until: g.s.day + 3 * DAYS_PER_YEAR,
    fx: { favor },
  });
}

/** A skill check on the track's own dice, at the same odds every act shows. */
function check(
  g: ConquestGame,
  life: Life,
  sk: "persuasion" | "letters",
  dc: number,
  salt: number,
): boolean {
  const p = checkChance(skillLevel(g.s, life, sk), dc);
  return kdice(g.s, 0x40 + salt, life.c, g.s.day).next() < p;
}

// ---------------------------------------------------------------- the petition

/** A petition begins (the governor's, a player's or the computer's). */
export function beginAsk(
  g: ConquestGame,
  n: number,
  p: number,
  by: number,
  npc: boolean,
): CrownAsk {
  const s = g.s;
  const st = crownState(g);
  const asked = colonyLives(g, n)
    .filter((l) => (l.cooldowns[`crown:asked:${p}`] ?? 0) > s.day)
    .map((l) => l.seat);
  const a: CrownAsk = {
    id: g.nextId(),
    n,
    p,
    holder: s.provinces[p].owner,
    by,
    ...(npc ? { npc: true } : {}),
    begun: s.day,
    sails: s.day + EXPEDITION.gather,
    answer: s.day + EXPEDITION.gather + EXPEDITION.voyage,
    stage: "gathering",
    men: 0,
    gold: 0,
    paid: {},
    council: [],
    house: [],
    refused: [],
    court: 0,
    asked,
    riders: [],
  };
  if (npc) {
    // The computer's house votes what the colony can spare.
    const o = npcOffer(g, n);
    a.men = o.men;
    a.gold = o.gold;
    if (o.men || o.gold) a.voted = s.day;
  }
  st.asks.push(a);
  crownChanged(g);
  // Those of the colony who asked for it hear it's begun (their colony's secret still).
  for (const seat of asked) {
    const l = s.lives.find((x) => x.seat === seat);
    if (l && l.c !== by)
      quietNews(
        g,
        l,
        `${charName(s.chars[by])} has begun a petition to the crown for an expedition to take back ${town(g, p)}, as you asked. It sails about ${formatDate(a.sails)}.`,
        "good",
      );
  }
  return a;
}

/** What the computer's colony offers: a regiment or two of its own, and a little of the treasury. */
function npcOffer(g: ConquestGame, n: number): { men: number; gold: number } {
  const s = g.s;
  let own = 0;
  for (const a of s.armies)
    if (a.owner === n) for (const r of a.regs) if (!r.crown) own++;
  const men = own >= 2 ? Math.min(2, Math.max(1, Math.floor(own / 3))) : 0;
  const gold = Math.max(
    0,
    Math.min(EXPEDITION.offerGold, Math.floor(s.nations[n].gold * 0.1)),
  );
  return { men, gold: Math.floor(gold / 25) * 25 };
}

/** A player who governs begins one. */
function begin(g: ConquestGame, life: Life, p: unknown): string | null {
  const s = g.s;
  if (typeof p !== "number" || !s.provinces[p]) return "Which town?";
  const c = beginCheck(s, life, p);
  if (!c.ok) return c.why;
  const me = meOf(s, life)!;
  withFlow(
    g,
    { key: "crown:petition", label: "A petition for an expedition" },
    () => spend(g, life, EXPEDITION.fee),
  );
  const a = beginAsk(g, me.nation, p, me.id, false);
  quietNews(
    g,
    life,
    `You retain an agent at court and begin a petition to the crown for an expedition to take back ${town(g, p)} from ${thename(g, a.holder)}. It sails on ${formatDate(a.sails)}: get the council's and the house's letters to it, friends at court to speak for it, and the colony's offer of men and money.`,
  );
  return null;
}

/** The governor goes round the council and the house for letters. */
function letters(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const c = lettersCheck(s, life);
  if (!c.ok) return c.why;
  const me = meOf(s, life)!;
  const a = helpable(s, life)!;
  touchLife(g, life).cooldowns["crown:letters"] =
    s.day + EXPEDITION.lettersEvery;
  const pass = check(g, life, "persuasion", EXPEDITION.lettersDc, 1);
  const asked = new Set([...a.council, ...a.house, ...a.refused]);
  const pool = letterPool(s, a.n, me.id).filter((x) => !asked.has(x));
  const got: number[] = [];
  let asks = pass ? 3 : 2;
  for (const x of pool) {
    if (asks-- <= 0) break;
    if (wouldWrite(s, a.n, x) && got.length < (pass ? 2 : 1)) {
      (onCouncil(s, a.n, x) ? a.council : a.house).push(x);
      got.push(x);
    } else a.refused.push(x);
  }
  crownChanged(g);
  quietNews(
    g,
    life,
    got.length
      ? `${got.map((x) => charName(s.chars[x])).join(" and ")} will write for the expedition (${a.council.length + a.house.length} letters now).`
      : "Nobody you ask will put a letter to it this time.",
    got.length ? "good" : undefined,
  );
  return null;
}

/** Write to friends at court for it (the governor, or anyone of standing). */
function court(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const c = courtCheck(s, life);
  if (!c.ok) return c.why;
  const a = helpable(s, life)!;
  touchLife(g, life).cooldowns["crown:court"] = s.day + EXPEDITION.courtEvery;
  withFlow(
    g,
    { key: "crown:petition", label: "A petition for an expedition" },
    () => spend(g, life, EXPEDITION.postage),
  );
  const pass = check(g, life, "letters", EXPEDITION.courtDc, 2);
  if (pass) {
    a.court++;
    crownChanged(g);
    quietNews(
      g,
      life,
      `A friend at court writes back: he'll speak for the expedition to ${town(g, a.p)} (${a.court} now).`,
      "good",
    );
  } else
    quietNews(
      g,
      life,
      "Your letters to court go unanswered. Ministers have wars of their own.",
    );
  return null;
}

/** The governor puts the colony's offer to the house: men and money. */
function offer(
  g: ConquestGame,
  life: Life,
  men: unknown,
  gold: unknown,
): string | null {
  const s = g.s;
  const m = typeof men === "number" ? Math.round(men) : 0;
  const gd = typeof gold === "number" ? Math.round(gold) : 0;
  const c = offerCheck(s, life, m, gd);
  if (!c.ok) return c.why;
  const a = helpable(s, life)!;
  const o = offerOdds(s, a.n, a.p, m, gd).total;
  const carried = kdice(s, 0x50, a.id, s.day).next() < o;
  if (carried) {
    a.men = m;
    a.gold = gd;
    a.voted = s.day;
    delete a.balked;
  } else a.balked = s.day;
  crownChanged(g);
  quietNews(
    g,
    life,
    carried
      ? `The house votes the colony's share: ${m ? `${m} regiment${m === 1 ? "" : "s"} raised` : "no men"}${gd ? ` and ${gd} gold from the treasury` : ""}, when the expedition sails.`
      : "The house won't vote it. They grumble about the cost, and the harvest, and you.",
    carried ? "good" : "bad",
  );
  return null;
}

/** Pay into the colony's share (anyone of the colony, the governor too). */
function pledge(g: ConquestGame, life: Life, coins: unknown): string | null {
  const s = g.s;
  const k = typeof coins === "number" ? Math.round(coins) : 0;
  const c = pledgeCheck(s, life, k);
  if (!c.ok) return c.why;
  const a = helpable(s, life)!;
  withFlow(g, { key: "crown:pledge", label: "Paid into an expedition" }, () =>
    spend(g, life, k),
  );
  a.paid[life.seat] = (a.paid[life.seat] ?? 0) + k;
  crownChanged(g);
  quietNews(
    g,
    life,
    `You pay ${k} coins into the colony's share of the expedition to ${town(g, a.p)} (${paidIn(a)} paid in all). It's handed back if it never sails.`,
  );
  const gov = lifeOfChar(s, a.by);
  if (gov && gov !== life)
    quietNews(
      g,
      gov,
      `${charName(meOf(s, life))} pays ${k} coins into the colony's share of your petition.`,
      "good",
    );
  return null;
}

/** A councillor or member who's a player puts his own letter to it. */
function write(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const c = writeCheck(s, life);
  if (!c.ok) return c.why;
  const me = meOf(s, life)!;
  const a = helpable(s, life)!;
  (onCouncil(s, a.n, me.id) ? a.council : a.house).push(me.id);
  crownChanged(g);
  quietNews(
    g,
    life,
    `You put your own letter to the petition for ${town(g, a.p)}.`,
  );
  const gov = lifeOfChar(s, a.by);
  if (gov)
    quietNews(
      g,
      gov,
      `${charName(me)} puts a letter to your petition.`,
      "good",
    );
  return null;
}

/** Let it drop (the governor's own): what was paid in is handed back. */
function drop(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const me = meOf(s, life);
  const a = me ? askOf(s, me.nation) : undefined;
  if (!a || a.by !== me!.id || a.stage !== "gathering")
    return "You have no petition gathering support.";
  endAsk(g, a, "dropped", "The governor let it drop");
  quietNews(g, life, "You let the petition drop. Your agent keeps his fee.");
  return null;
}

/** Ask the governor to petition the crown for a town. */
function askGov(g: ConquestGame, life: Life, p: unknown): string | null {
  const s = g.s;
  if (typeof p !== "number" || !s.provinces[p]) return "Which town?";
  const c = askGovCheck(s, life, p);
  if (!c.ok) return c.why;
  const me = meOf(s, life)!;
  const nation = s.nations[me.nation];
  const x = touchLife(g, life);
  x.cooldowns["crown:ask"] = s.day + 180;
  x.cooldowns[`crown:asked:${p}`] = s.day + 180;
  const gov = s.chars[nation.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  quietNews(
    g,
    life,
    `You write to ${charName(gov)}, asking ${gov?.female ? "her" : "him"} to petition the crown for an expedition to take back ${town(g, p)}.${govLife ? "" : " The governor will weigh it this month."}`,
  );
  if (govLife)
    quietNews(
      g,
      govLife,
      `${charName(me)} asks you to petition the crown for an expedition to take back ${town(g, p)} (Society › Standing).`,
    );
  return null;
}

/** Ride with the expedition: your character goes with its army. */
function ride(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const c = rideCheck(s, life);
  if (!c.ok) return c.why;
  const me = meOf(s, life)!;
  const a = askOf(s, me.nation)!;
  a.riders.push(life.seat);
  crownChanged(g);
  openNews(
    g,
    life,
    `You ride with the expedition to take back ${town(g, a.p)}. Where its army goes, you go.`,
  );
  return null;
}

function leave(g: ConquestGame, life: Life, quiet = false): string | null {
  const s = g.s;
  const a = crownState(g).asks.find((x) => x.riders.includes(life.seat));
  if (!a) return "You don't ride with an expedition.";
  a.riders = a.riders.filter((x) => x !== life.seat);
  crownChanged(g);
  if (!quiet) openNews(g, life, `You leave the expedition to ${town(g, a.p)}.`);
  void s;
  return null;
}

// ---------------------------------------------------------------- the crown's answer

/** The crown's answer to a petition: granted (true), at exactly the odds the page shows. */
export function grantRoll(
  s: import("./Types").GameState,
  map: import("./Types").MapDef,
  a: CrownAsk,
): boolean {
  return (
    kdice(s, 0x30, a.id).next() <
    expeditionOdds(s, map, a.n, a.p, a, a.by).total
  );
}

/** The answer comes: granted or refused, rolled at exactly the odds the page shows. */
export function answerAsk(g: ConquestGame, a: CrownAsk): void {
  const s = g.s;
  a.odds = expeditionOdds(s, g.map, a.n, a.p, a, a.by).total;
  const granted = grantRoll(s, g.map, a);
  crownChanged(g);
  if (granted) grantAsk(g, a);
  else refuse(g, a);
}

/** Who asks for it at court: the petitioner's life, if a player's. */
const petitioner = (g: ConquestGame, a: CrownAsk) => lifeOfChar(g.s, a.by);

function refuse(g: ConquestGame, a: CrownAsk): void {
  // A modest, sensible request: the colony offered a good share, and it stood a fair chance.
  const share = a.men + (a.gold + paidIn(a)) / 50;
  const modest = (a.odds ?? 0) >= 0.35 && share >= 2;
  const by = petitioner(g, a);
  // Out of the crown's hands (a truce, an alliance): nobody's the worse for asking.
  const dv =
    (a.odds ?? 0) <= 0
      ? 0
      : modest
        ? EXPEDITION.modestFavour
        : EXPEDITION.refusedFavour;
  if (!dv) {
    if (by)
      quietNews(
        g,
        by,
        `The crown can't send an expedition to ${town(g, a.p)} now: a truce or a treaty stands in the way.`,
      );
    endAsk(g, a, "refused", "Not while the truce holds");
    return;
  }
  if (by) {
    addFavor(g, by, dv);
    quietNews(
      g,
      by,
      modest
        ? `The crown declines the expedition to ${town(g, a.p)}, not now; but it thinks well of a governor who asks sensibly, with his colony's own share offered (favour +${dv}).`
        : `The crown refuses the expedition to ${town(g, a.p)} (favour ${dv}).`,
      modest ? undefined : "bad",
    );
    milestone(
      g,
      by,
      "petition",
      `Petitioned the crown for an expedition to take back ${town(g, a.p)}: refused`,
      a.p,
      { sec: true, tone: "bad" },
    );
  } else
    colonyMood(
      g,
      a.n,
      "crown-refused",
      modest ? "Asked the crown sensibly" : "A petition the crown refused",
      dv,
    );
  endAsk(g, a, "refused", modest ? "Refused, kindly" : "Refused");
}

/** Granted: the crown goes to war for it if it must, and the expedition sails. */
export function grantAsk(g: ConquestGame, a: CrownAsk): void {
  const s = g.s;
  const n = a.n;
  const h = s.provinces[a.p].owner;
  a.holder = h;
  const nation = g.nation(n);
  const H = s.nations[h];
  if (!atWar(s, n, h)) {
    startWar(g, n, h, `To take back ${town(g, a.p)}`, false);
    a.war = true;
    const t = g.nation(h);
    (t.relations[n] ??= []).push({
      of: -1,
      why: "They attacked us",
      value: -30,
      until: s.day + 10 * DAYS_PER_YEAR,
    });
    if (H.kind === "power") {
      const k = pairKey(n, h);
      s.europe.tension[k] = Math.min(100, (s.europe.tension[k] ?? 0) + 20);
      g.europeChanged();
    }
  }
  // Every town it claims from them is fought for (as WAR's claim wars are).
  const R = reclaimState(g);
  for (const c of R.claims)
    if (c.by === n && s.provinces[c.p]?.owner === h && c.war === undefined)
      c.war = s.day;
  reclaimChanged(g);
  const size = expeditionSize(s, g.map, n, a.p);
  const guns = size.guns + squadronGuns(size.ships);
  a.regs = size.regs;
  a.guns = guns;
  a.ships = size.ships;
  // The colony's share of the money from its treasury (as far as it has it).
  if (a.gold > 0) {
    const pay = Math.min(a.gold, Math.max(0, Math.floor(nation.gold)));
    nation.gold = Math.round((nation.gold - pay) * 10) / 10;
    a.gold = pay;
  }
  // The crown's charges: what the colony's money, and the treasury, can meet.
  const covered = Math.floor((a.gold + paidIn(a)) / 15);
  if (covered < size.regs + guns) payPassage(g, n, size.regs + guns - covered);
  // Who leads it: a computer governor who's a soldier, or the crown's general.
  const gov = s.chars[nation.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  if (!govLife && gov?.alive && stat(s, gov, "mar") >= 7 && ageOf(s, gov) < 60)
    a.lead = true;
  // It sails: to the town itself if it's on the coast (a landing in force),
  // or the colony's port nearest it.
  const coastal = g.map.provinces[a.p].coastal;
  const at = coastal
    ? { port: a.p, force: true }
    : landingFor(s, g.map, n, a.p);
  if (!at) {
    endAsk(g, a, "failed", "There was nowhere to land");
    return;
  }
  const sl = sail(g, {
    n,
    port: at.port,
    ...(at.force ? { force: true } : {}),
    foot: size.regs,
    guns,
    men: size.regs * 100 + guns * REGIMENTS.artillery.men,
    ...(size.ships ? { ships: size.ships } : {}),
    why: "exp",
    ask: a.id,
  });
  a.lands = sl.arrive;
  a.stage = "granted";
  crownChanged(g);
  const what = `${regimentsWords(nation.adjective, size.regs, guns)}${size.ships ? `, with a squadron of ${size.ships} ships` : ""}`;
  const text = `The crown has granted ${nation.name}'s petition: an expedition sails to take back ${town(g, a.p)} from ${thename(g, h)}: ${what}. It should land about ${formatDate(sl.arrive)}.`;
  g.event({ k: "news", day: s.day, n, p: a.p, text });
  rumour(g, a.p, text, -1);
  const by = petitioner(g, a);
  if (by) {
    openNews(
      g,
      by,
      `The crown grants your petition: ${what} sail for ${town(g, a.p)}, landing about ${formatDate(sl.arrive)}.`,
      "good",
    );
    milestone(
      g,
      by,
      "petition",
      `Petitioned the crown for an expedition to take back ${town(g, a.p)}: granted`,
      a.p,
      { tone: "good" },
    );
  }
  // Whoever governs it, if a player, chooses who leads it.
  if (govLife) raiseEvent(g, govLife, "crown-granted", { a: a.id, p: a.p });
  // The town's holder hears of it as the ships put to sea, not before.
  const holderLife = playerGoverns(s, h);
  if (holderLife)
    journal(
      g,
      holderLife,
      `Word from the sea: ${nation.name} sends an expedition to take back ${town(g, a.p)}: ${what}. They should land about ${formatDate(sl.arrive)}.`,
      "bad",
    );
  // The colony's people hear of it.
  for (const l of colonyLives(g, n, a.by))
    journal(
      g,
      l,
      `The crown sends an expedition to take back ${town(g, a.p)}. A player may ride with it once it lands (Society › Standing).`,
    );
}

/** The general the crown sends with it: a soldier of the crown's own. */
function crownGeneral(g: ConquestGame, a: CrownAsk): number {
  const s = g.s;
  const N = s.nations[a.n];
  const dice = kdice(s, 0x60, a.id);
  const c = makeCharacter(s, dice, {
    nation: a.n,
    culture: N.culture,
    religion: N.religion,
    female: false,
    age: dice.int(40, 58),
    stats: randomStats(dice, "mar"),
    traits: [dice.pick(["brave", "ambitious", "cruel", "just"] as const)!],
  });
  // "General Hugh Mackay": the crown's man, by his rank.
  c.title = `General ${c.first} ${c.family}`;
  g.touchChar(c);
  return c.id;
}

/** The colony's share of men: regiments drafted from its people at the capital. */
function draftShare(g: ConquestGame, n: number, men: number): Regiment[] {
  const s = g.s;
  const out: Regiment[] = [];
  const nation = s.nations[n];
  const from =
    nation.capital >= 0 && s.provinces[nation.capital].owner === n
      ? nation.capital
      : provincesOf(s, n)[0];
  if (from === undefined) return out;
  const pr = g.prov(from);
  for (let i = 0; i < men; i++) {
    const pool = pr.pops.filter((x) => x.cls === "laborers");
    const have = pool.reduce((m, x) => m + x.size, 0);
    if (have < 150) break;
    let left = 100;
    for (const pop of pool) {
      const take = Math.min(pop.size, left);
      pop.size -= take;
      left -= take;
      if (left <= 0) break;
    }
    out.push({ type: "militia", men: 100, morale: 0.75, home: from });
  }
  return out;
}

/** The expedition lands: the army forms, under its general, and marches on the town. */
function landExpedition(g: ConquestGame, sl: CrownSailing): boolean {
  if (sl.why !== "exp") return false;
  const s = g.s;
  const a = crownState(g).asks.find((x) => x.id === sl.ask);
  if (!a || a.stage !== "granted") return false; // lands as a war's regiments
  const h = s.provinces[a.p].owner;
  if (h === a.n) {
    endAsk(g, a, "won", "The town was the colony's again before it landed");
    return true;
  }
  if (!atWar(s, a.n, h)) {
    // The peace came while it was at sea: it puts about.
    endAsk(g, a, "failed", "A peace was made before it landed", true);
    return true;
  }
  const regs: Regiment[] = [];
  for (let i = 0; i < sl.foot; i++) regs.push(crownRegiment("regulars", "war"));
  for (let i = 0; i < sl.guns; i++)
    regs.push(crownRegiment("artillery", "war"));
  const share = draftShare(g, a.n, a.men);
  regs.push(...share);
  const army = newArmy(g, a.n, sl.port, regs);
  const N = s.nations[a.n];
  const gov = s.chars[N.ruler];
  const govLife = gov ? lifeOfChar(s, gov.id) : undefined;
  const lead =
    a.lead &&
    gov?.alive &&
    !s.armies.some((x) => x.commander === gov.id && x !== army);
  if (lead) {
    army.commander = gov.id;
    a.general = gov.id;
  } else {
    a.general = crownGeneral(g, a);
    army.commander = a.general;
  }
  a.army = army.id;
  a.stage = "landed";
  a.until = s.day + EXPEDITION.campaignDays;
  crownChanged(g);
  noteLanding(g, a.n, sl.port, sl.foot + sl.guns, !!sl.force);
  const general = s.chars[a.general];
  const text = `The expedition has landed at ${town(g, sl.port)}${sl.force ? " in force" : ""}: ${regimentsWords(N.adjective, sl.foot, sl.guns)}${share.length ? `, and ${share.length} of the colony's own` : ""}, under ${lead ? "the governor, " : ""}${charName(general)}. ${sl.port === a.p ? `It sits down before ${town(g, a.p)}.` : `It marches on ${town(g, a.p)}.`}`;
  g.event({ k: "news", day: s.day, n: a.n, p: sl.port, text });
  rumour(g, sl.port, text, -1);
  if (govLife && lead)
    openNews(
      g,
      govLife,
      `You command the expedition: ${army.regs.length} regiments at ${town(g, sl.port)}. March them on ${town(g, a.p)} from your army's panel.`,
      "good",
    );
  return true;
}

landers.push(landExpedition);

// ---------------------------------------------------------------- how it ends

/** Done: the record kept, what was paid in handed back if it never sailed. */
function endAsk(
  g: ConquestGame,
  a: CrownAsk,
  stage: CrownAsk["stage"],
  why: string,
  noBlame = false,
): void {
  const s = g.s;
  const st = crownState(g);
  const wasSecret = askSecret(a);
  a.stage = stage;
  a.ended = s.day;
  a.why = why;
  if ((stage === "refused" || stage === "dropped") && wasSecret)
    for (const [seat, k] of Object.entries(a.paid)) {
      const l = s.lives.find((x) => x.seat === seat);
      if (!l || l.c < 0 || !s.chars[l.c]?.alive) continue;
      withFlow(
        g,
        { key: "crown:pledge", label: "Paid into an expedition: handed back" },
        () => earn(g, l, k),
      );
    }
  for (const seat of a.riders) {
    const l = s.lives.find((x) => x.seat === seat);
    if (l && l.c >= 0)
      openNews(
        g,
        l,
        `The expedition to ${town(g, a.p)} is over (${why.toLowerCase()}). You're your own master again.`,
      );
  }
  a.riders = [];
  st.asks = st.asks.filter((x) => x !== a);
  st.past.push(a);
  if (st.past.length > 24) st.past.splice(0, st.past.length - 24);
  crownChanged(g);
  void noBlame;
}

/** Taken back. */
function won(g: ConquestGame, a: CrownAsk): void {
  const s = g.s;
  const N = s.nations[a.n];
  endAsk(g, a, "won", "The town is taken back");
  colonyMood(
    g,
    a.n,
    "crown-won",
    `Took back ${town(g, a.p)}`,
    EXPEDITION.colonyWon,
  );
  const by = petitioner(g, a);
  if (by) {
    addRenown(g, by, EXPEDITION.wonRenown);
    addFavor(g, by, EXPEDITION.wonFavour);
    openNews(
      g,
      by,
      `${town(g, a.p)} is ${N.name}'s again: the expedition you asked the crown for has done it (renown +${EXPEDITION.wonRenown}, favour +${EXPEDITION.wonFavour}).`,
      "good",
    );
    milestone(
      g,
      by,
      "renown",
      `Took back ${town(g, a.p)} with the crown's regiments`,
      a.p,
      { tone: "good", big: true },
    );
  }
  for (const l of colonyLives(g, a.n, a.by)) {
    if (!a.asked.includes(l.seat) && !a.paid[l.seat]) continue;
    addRenown(g, l, 2);
    openNews(
      g,
      l,
      `${town(g, a.p)} is taken back: the expedition you asked for, or paid toward, has done it.`,
      "good",
    );
  }
  g.event({
    k: "news",
    day: s.day,
    n: a.n,
    p: a.p,
    text: `${town(g, a.p)} is ${N.name}'s again: the crown's expedition has taken it back.`,
  });
}

/** Failed: the governor's favour lost, the colony's too, and the claim weakened. */
function failed(
  g: ConquestGame,
  a: CrownAsk,
  why: string,
  warOver: boolean,
): void {
  const s = g.s;
  endAsk(g, a, "failed", why);
  colonyMood(
    g,
    a.n,
    "crown-failed",
    `An expedition to ${town(g, a.p)} that failed`,
    EXPEDITION.colonyFailed,
  );
  // The claim weakened: WAR's own reckoning halves it for a war lost; if the
  // war goes on, it's halved now (and not again at the peace).
  const c = claimOf(s, a.n, a.p);
  if (c && !warOver) {
    delete c.war;
    c.tries++;
    if (c.tries >= CLAIM.maxTries) {
      const R = reclaimState(g);
      R.claims = R.claims.filter((x) => x !== c);
      g.event({
        k: "news",
        day: s.day,
        n: a.n,
        p: a.p,
        text: `${nm(s.nations[a.n])} gives up its claim to ${town(g, a.p)}.`,
      });
    }
    reclaimChanged(g);
  }
  const by = petitioner(g, a);
  if (by) {
    addFavor(g, by, EXPEDITION.failedFavour);
    openNews(
      g,
      by,
      `The expedition to ${town(g, a.p)} has failed: ${why.toLowerCase()} (favour ${EXPEDITION.failedFavour}).`,
      "bad",
    );
    milestone(
      g,
      by,
      "petition",
      `The expedition to take back ${town(g, a.p)} failed`,
      a.p,
      { tone: "bad", quiet: true },
    );
  }
  g.event({
    k: "news",
    day: s.day,
    n: a.n,
    p: a.p,
    text: `The expedition to take back ${town(g, a.p)} has failed: ${why.toLowerCase()}.`,
  });
}

/** A town changed hands: an expedition's town back with its colony is won. */
hooks.provinceTaken.push((g, p, _from, to) => {
  const s = g.s;
  if (!s.crown) return;
  for (const a of [...crownState(g).asks]) {
    if (a.p !== p) continue;
    if (to === a.n) {
      if (a.stage === "landed" || a.stage === "granted") won(g, a);
      else endAsk(g, a, "dropped", "The town was the colony's again");
    } else if (a.stage === "gathering" || a.stage === "sent") {
      a.holder = to;
      crownChanged(g);
    }
  }
});

// ---------------------------------------------------------------- the rounds

function askDaily(g: ConquestGame): void {
  const s = g.s;
  const st = s.crown;
  if (!st?.asks?.length) return;
  for (const a of [...st.asks]) {
    if (!s.nations[a.n]?.alive || !meansOf(s, a.n)) {
      endAsk(g, a, "dropped", "The colony answers to no crown now");
      continue;
    }
    // A truce or an alliance made with the town's holder meanwhile: the crown
    // won't break it, so the petition is moot (and no one's the worse for it).
    const h = s.provinces[a.p].owner;
    if (
      (a.stage === "gathering" || a.stage === "sent") &&
      h >= 0 &&
      !atWar(s, a.n, h) &&
      (truceUntil(s, a.n, h) > s.day || treatyBetween(s, a.n, h, "alliance"))
    ) {
      const by = petitioner(g, a);
      if (by)
        quietNews(
          g,
          by,
          `A truce with ${thename(g, h)}: the crown won't break it, and your petition for ${town(g, a.p)} is moot. What was paid in is handed back.`,
        );
      endAsk(g, a, "dropped", "A truce was made with them");
      continue;
    }
    if (a.stage === "gathering" && s.day >= a.sails) {
      a.stage = "sent";
      crownChanged(g);
      const by = petitioner(g, a);
      if (by)
        quietNews(
          g,
          by,
          `Your petition for an expedition to ${town(g, a.p)} sails, with ${a.council.length + a.house.length} letter${a.council.length + a.house.length === 1 ? "" : "s"} and ${a.court} friend${a.court === 1 ? "" : "s"} at court. The crown's answer should come about ${formatDate(a.answer)}.`,
        );
    } else if (a.stage === "sent" && s.day >= a.answer) answerAsk(g, a);
  }
}

/** Riders go where the expedition's army goes; one who sets off alone leaves it. */
function riderDaily(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (!s.crown?.asks?.length) return;
  const a = s.crown.asks.find((x) => x.riders.includes(life.seat));
  if (!a) return;
  if (life.travel) {
    leave(g, life);
    return;
  }
  const army = s.armies.find((x) => x.id === a.army);
  if (army && life.prov !== army.prov) touchLife(g, life).prov = army.prov;
}

/** A battle the expedition fought: its riders were there. */
hooks.battle.push((g, r, attackers, defenders) => {
  const s = g.s;
  if (!s.crown?.asks?.length) return;
  for (const a of s.crown.asks) {
    if (!a.riders.length || a.army === undefined) continue;
    const side = attackers.some((x) => x.id === a.army)
      ? 0
      : defenders.some((x) => x.id === a.army)
        ? 1
        : -1;
    if (side < 0) continue;
    const won = r.winner === side;
    for (const seat of a.riders) {
      const l = s.lives.find((x) => x.seat === seat);
      if (!l || l.c < 0) continue;
      if (won) addRenown(g, l, 1);
      openNews(
        g,
        l,
        won
          ? `A battle at ${town(g, r.prov)}: you ride with the expedition, and it carries the field.`
          : `A battle at ${town(g, r.prov)}: the expedition is beaten, and you with it.`,
        won ? "good" : "bad",
      );
    }
  }
});

/** The month's turn: expeditions in the field reckoned, the computer's governors and their petitions. */
export function petitionsMonthly(g: ConquestGame): void {
  const s = g.s;
  const st = s.crown;
  if (st?.asks?.length)
    for (const a of [...st.asks]) {
      if (a.stage === "landed") fieldMonthly(g, a);
      else if (a.stage === "gathering" && a.npc) npcGathers(g, a);
    }
  if (g.aiEnabled) npcPetitions(g);
}

/** An expedition in the field: still at it, or failed. */
function fieldMonthly(g: ConquestGame, a: CrownAsk): void {
  const s = g.s;
  const pr = s.provinces[a.p];
  const h = pr.owner;
  if (h === a.n) {
    won(g, a);
    return;
  }
  const held = pr.occupier === a.n;
  if (!atWar(s, a.n, h)) {
    failed(g, a, `The peace left ${town(g, a.p)} with ${thename(g, h)}`, true);
    return;
  }
  const army = s.armies.find((x) => x.id === a.army);
  if (held) {
    // Held, waiting on the peace to make it theirs.
    if ((a.until ?? 0) < s.day + 120) {
      a.until = s.day + 120;
      crownChanged(g);
    }
    return;
  }
  if (!army) {
    failed(g, a, "Its army was broken", false);
    return;
  }
  if (s.day > (a.until ?? Infinity)) {
    failed(g, a, "The crown's general gave it up", false);
    return;
  }
  // A general fallen: another takes the command.
  if (army.commander < 0 || !s.chars[army.commander]?.alive) {
    a.general = crownGeneral(g, a);
    g.touch(army).commander = a.general;
    crownChanged(g);
  }
}

/** The computer's own petition gathers letters and friends at court as it goes. */
function npcGathers(g: ConquestGame, a: CrownAsk): void {
  const s = g.s;
  const dice = kdice(s, 0x70, a.id);
  const asked = new Set([...a.council, ...a.house, ...a.refused]);
  for (const c of letterPool(s, a.n, a.by)) {
    if (asked.has(c) || !dice.chance(0.3)) continue;
    if (wouldWrite(s, a.n, c))
      (onCouncil(s, a.n, c) ? a.council : a.house).push(c);
    else a.refused.push(c);
  }
  if (a.court < EXPEDITION.maxCourt && dice.chance(0.3)) a.court++;
  crownChanged(g);
}

/** The computer's governors petition for a town where it's sensible. */
function npcPetitions(g: ConquestGame): void {
  const s = g.s;
  for (const nation of s.nations) {
    if (nation.kind !== "power" || !nation.alive) continue;
    const n = nation.id;
    if (!meansOf(s, n) || playerGoverns(s, n)) continue;
    const gov = s.chars[nation.ruler];
    if (!gov?.alive || askOf(s, n)) continue;
    const last = lastAsk(s, n);
    if (last && s.day - (last.ended ?? last.answer) < EXPEDITION.rest) continue;
    const towns = claimedTowns(s, n);
    if (!towns.length) continue;
    const o = npcOffer(g, n);
    let best = -1;
    let bestP = 0;
    let wanted = false;
    for (const t of towns) {
      const H = s.nations[t.holder];
      if (t.claim < (H.kind === "power" ? CLAIM.warPower : CLAIM.war)) continue;
      const asked = colonyLives(g, n).some(
        (l) => (l.cooldowns[`crown:asked:${t.p}`] ?? 0) > s.day,
      );
      const p = expeditionOdds(
        s,
        g.map,
        n,
        t.p,
        {
          men: o.men,
          gold: o.gold,
          paid: {},
          // What he can count on gathering as it goes (NPC_ASK.expect).
          council: NPC_ASK.expect.council,
          house: NPC_ASK.expect.house,
          court: NPC_ASK.expect.court,
        },
        gov.id,
      ).total;
      const bar = asked ? NPC_ASK.asked : NPC_ASK.min;
      if (p >= bar && p > bestP) {
        best = t.p;
        bestP = p;
        wanted = asked;
      }
    }
    if (best < 0) continue;
    // A cautious man waits for a better moment; an ambitious one doesn't.
    const chance = wanted || hasTrait(gov, "ambitious") ? 1 : NPC_ASK.chance;
    if (!kdice(s, 0x80, n).chance(chance)) continue;
    beginAsk(g, n, best, gov.id, true);
  }
}

// ---------------------------------------------------------------- the petitioner's retainer

hooks.forecast.push((s, life) => {
  const a = s.crown?.asks?.find(
    (x) => x.by === life.c && (x.stage === "gathering" || x.stage === "sent"),
  );
  return a
    ? [
        {
          key: "crown:petition",
          label: "Your agent at court, for the expedition",
          value: -EXPEDITION.retainer,
        },
      ]
    : [];
});

function retainer(g: ConquestGame, life: Life): void {
  const a = g.s.crown?.asks?.find(
    (x) => x.by === life.c && (x.stage === "gathering" || x.stage === "sent"),
  );
  if (!a) return;
  withFlow(
    g,
    { key: "crown:petition", label: "Your agent at court, for the expedition" },
    () => spend(g, life, EXPEDITION.retainer),
  );
}

// ---------------------------------------------------------------- commands

/** A player governor's choice from the scene: lead it himself, or not. */
export function chooseLead(
  g: ConquestGame,
  life: Life,
  id: number,
  yes: boolean,
): void {
  const s = g.s;
  const a = crownState(g).asks.find((x) => x.id === id);
  if (!a) {
    journal(g, life, "The expedition is over.");
    return;
  }
  const me = meOf(s, life);
  if (!me || s.nations[a.n]?.ruler !== me.id) {
    journal(g, life, "You no longer govern.");
    return;
  }
  a.lead = yes;
  crownChanged(g);
  if (yes && a.stage === "landed") {
    const army = s.armies.find((x) => x.id === a.army);
    if (army && !s.armies.some((x) => x.commander === me.id && x !== army)) {
      g.touch(army).commander = me.id;
      a.general = me.id;
    }
  }
  openNews(
    g,
    life,
    yes
      ? `You'll command the expedition to ${town(g, a.p)} yourself.`
      : `The crown's general will command the expedition to ${town(g, a.p)}.`,
  );
}

function crownCommand(
  g: ConquestGame,
  life: Life,
  c: LifeCommand,
): string | null | undefined {
  if (c.k !== "crown") return undefined;
  const x = c as CrownCommand;
  if (life.c < 0 || life.watching) return "You're watching.";
  if (!g.s.chars[life.c]?.alive) return "You're watching.";
  switch (x.act) {
    case "begin":
      return begin(g, life, x.p);
    case "letters":
      return letters(g, life);
    case "court":
      return court(g, life);
    case "offer":
      return offer(g, life, x.men, x.gold);
    case "pledge":
      return pledge(g, life, x.coins);
    case "write":
      return write(g, life);
    case "drop":
      return drop(g, life);
    case "ask":
      return askGov(g, life, x.p);
    case "ride":
      return ride(g, life);
    case "leave":
      return leave(g, life);
    default:
      return "Unknown.";
  }
}

hooks.command.push(crownCommand);
hooks.daily.push(askDaily);
hooks.monthEnd.push(petitionsMonthly);
hooks.lifeDaily.push(riderDaily);
hooks.lifeMonthly.push(retainer);
