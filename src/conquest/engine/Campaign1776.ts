// DLC (r21): "1776: The Revolution", a campaign through the American
// Revolution to the end of 1783 (the store item campaign_1776; the server
// lets only an owner host one: server/conquest/ConquestDlc.ts).
// CQ24 (r24): it runs on to the end of 1800 (Campaign1776Later.ts has the
// years from 1784), and history keeps its course unless players change it:
// every beat passes the course's gate first (Campaign1776Course.ts), which
// lets it come as history had it, holds it, has it fought for real where
// players stand, or lets it yield to what players have done.
//
// The world of 1 January 1776 is Start1776.ts. This module runs the war on
// it with the game's own machinery:
// - the United Colonies (the map's English colony) are a colony in rising
//   against its crown from day one (GOV r21's breaking with the crown: the
//   rising's state, its sides, its end), at war with the British crown and
//   with British America (the loyal colonies), so privateers have prey;
// - the war's great events come on their dates as history had them (BEATS):
//   news for everyone, and what they did to the map: towns occupied and
//   given up by the British army, the Continental Army and Congress moving,
//   the Declaration renaming the United Colonies the United States, the
//   French alliance, France, Spain and the Dutch at war with Britain, and
//   the Treaty of Paris. The rising's own rules (crushed if the capital is
//   held half a year, won in eight years) don't run in the campaign, and the
//   armies of the war are moved by the campaign, not the computer: history
//   decides the war, and players live their part in it;
// - players choose a side, can seek a commission in the Continental Army or
//   a Loyalist regiment, take part in the battles of the army they serve
//   with (scenes, with their odds), spy in a town held by the other side,
//   sail as privateers under a letter of marque from Congress (SEA r15),
//   and sit in the Continental Congress (the colony's assembly, renamed).
//
// Real people appear only as the historical record has them: as generals
// and officers named in the news. Nobody real is a character anyone meets,
// and no words are put in their mouths. The people players deal with are
// the game's own.
//
// New rolls are on the campaign's own dice (0x2d1c0000 up), so the world's
// other luck doesn't move. The campaign's record rides on the United
// Colonies (Nation.r76), a player's part on their life (Life.r76).

import { dateOf, dayOf, formatDate } from "./Calendar";
import {
  britainOf,
  campaignOf,
  COMMISSION,
  isCampaign,
  kingOf,
  R76_GATES,
  sideOf,
  SPY,
  TURNCOAT,
  usOf,
} from "./Campaign1776Core";
import { kill } from "./Characters";
import { cede, rebellionWon } from "./Crown";
import { Explain } from "./Explain";
import type { ConquestGame } from "./Game";
import { deskOf } from "./GovDesk";
import { hooks, raiseEvent } from "./Hooks";
import { secretNote } from "./IntrigueCore";
import { withFlow } from "./LedgerCore";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import {
  type Check,
  isChildLife,
  isPlayed,
  lifeIsNative,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance, JOBS } from "./LifeRules";
import { atWar, holder, pairKey } from "./Queries";
import { revSide } from "./Revolution";
import { REGIMENTS } from "./Rules";
import { rumour } from "./Rumours";
import { GOV_FORMS } from "./SocietyRules";
import type {
  Army,
  Breakdown,
  Campaign76,
  GameState,
  Life,
  LifeCommand,
  MapDef,
  Regiment,
} from "./Types";
import { endWar, startWar } from "./War";
import { startJob } from "./Work";
import { worldRng } from "./WorldRng";

export * from "./Campaign1776Core";

const byKey = (s: GameState, key: string) =>
  s.nations.findIndex((n) => n.key === key);

function rec(g: ConquestGame): Campaign76 {
  return (g.nation(usOf(g.s)).r76 ??= { beats: {} });
}

/** The campaign's armies, by the name the beats give them. */
function armyIds(g: ConquestGame): Record<string, number> {
  return (rec(g).armies ??= {});
}

function campaignArmies(s: GameState): Record<string, number> {
  return campaignOf(s)?.armies ?? {};
}

/** The campaign's own dice (0x2d1c0000 up). */
export function cdice(s: GameState, salt: number, ...xs: number[]) {
  let k = salt | 0;
  for (const x of xs) k = (Math.imul(k, 31) + (x | 0)) | 0;
  return worldRng(s, 0x2d1c0000 + (k & 0xfffff));
}

export function provNamed(map: MapDef, name: string): number {
  const p = map.provinces.findIndex((x) => x.name === name);
  if (p < 0) throw new Error(`Campaign1776: no province "${name}"`);
  return p;
}

// ---------------------------------------------------------------- the beats

/** Who takes part in a battle the beats bring. */
export interface BattleSpec {
  /** How it went for the Americans. */
  us: "won" | "lost" | "drawn";
  /** The Continental Army's main army was in it (its soldiers get the scene). */
  main?: boolean;
  /** The British army in it (its soldiers, Loyalists among them, get the scene). */
  king?: string;
  /** Where (a province of the map). */
  at: string;
}

export interface Beat {
  key: string;
  /** Year, month (1 to 12), day. */
  date: [number, number, number];
  title: string;
  text: string;
  /** The province it's about, for the map. */
  at?: string;
  battle?: BattleSpec;
  /** A scene for those it touches: who, as Campaign1776Events.ts raises it. */
  scene?:
    | "pamphlet"
    | "declaration"
    | "winter"
    | "nations"
    | "burned"
    | "peace";
  /** Towns occupied (a scene for those who live there). */
  occupied?: string[];
  fx?: (g: ConquestGame) => void;
}

export function beatDay(b: Beat): number {
  return dayOf(b.date[0], b.date[1] - 1, b.date[2]);
}

/** A crown army of `regs` regulars (and some guns), made at `p`. */
function kingArmy(
  g: ConquestGame,
  tag: string,
  at: string,
  regs: number,
  guns = 0,
): Army | undefined {
  const s = g.s;
  const king = kingOf(s);
  if (king < 0) return undefined;
  const p = provNamed(g.map, at);
  const ids = armyIds(g);
  const old = s.armies.find((a) => a.id === ids[tag]);
  if (old) {
    // CQ24 (r24): an army a player commands goes where they send it.
    if (!playerLed(s, old)) moveArmy(g, old, p);
    return old;
  }
  clearOut(g, p);
  const list: Regiment[] = [];
  for (let i = 0; i < regs; i++)
    list.push({ type: "regulars", men: 100, morale: 0.9, home: -1 });
  for (let i = 0; i < guns; i++)
    list.push({
      type: "artillery",
      men: REGIMENTS.artillery.men,
      morale: 0.9,
      home: -1,
    });
  const a = g.addArmy({
    id: g.nextId(),
    owner: king,
    prov: p,
    regs: list,
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
  ids[tag] = a.id;
  return a;
}

/** A crown army surrenders or sails away: gone from the board. */
function kingArmyGone(g: ConquestGame, tag: string): void {
  const ids = armyIds(g);
  const a = g.s.armies.find((x) => x.id === ids[tag]);
  if (a) g.removeArmy(a);
  delete ids[tag];
}

/** The Continental Army's main army. */
function mainArmy(s: GameState): Army | undefined {
  const id = campaignArmies(s).main;
  return s.armies.find((a) => a.id === id);
}

/** An army set down somewhere (the campaign moves the war's armies; the computer doesn't). */
function moveArmy(g: ConquestGame, a: Army, p: number): void {
  const x = g.touch(a);
  x.prov = p;
  x.path = [];
  x.sea = false;
  x.depart = -1;
  x.arrive = -1;
  x.arrived = g.s.day;
  x.from = -1;
  x.retreating = false;
}

/**
 * The United Colonies' armies (other than the one the beat moves) step out
 * of a town the British are marching into, to the nearest town of theirs.
 */
function clearOut(g: ConquestGame, p: number, keep = -1): void {
  const s = g.s;
  const us = usOf(s);
  for (const a of [...s.armies]) {
    if (a.owner !== us || a.prov !== p || a.id === keep) continue;
    if (playerLed(s, a)) continue; // CQ24 (r24): a player's army stands
    const to = nearestOwn(g, p);
    if (to >= 0) moveArmy(g, a, to);
  }
}

function nearestOwn(g: ConquestGame, from: number): number {
  const s = g.s;
  const us = usOf(s);
  const seen = new Set([from]);
  let ring = [from];
  for (let hop = 0; hop < 12 && ring.length; hop++) {
    const next: number[] = [];
    for (const q of ring)
      for (const [r] of g.map.provinces[q].nb) {
        if (seen.has(r)) continue;
        seen.add(r);
        const pr = s.provinces[r];
        if (pr.owner === us && pr.occupier < 0) return r;
        next.push(r);
      }
    ring = next;
  }
  return s.nations[us].capital;
}

/** The main Continental Army marches (as history had it). */
function armyTo(g: ConquestGame, at: string): void {
  const a = mainArmy(g.s);
  if (!a) return;
  if (playerLed(g.s, a)) return; // CQ24 (r24): its player general decides
  const p = provNamed(g.map, at);
  if (g.s.provinces[p].occupier >= 0) return;
  moveArmy(g, a, p);
}

/** A town taken: by the King's army (with the army that holds it), or by France, Spain, the Americans or Britain. */
function occupy(
  g: ConquestGame,
  at: string,
  by: "king" | "us" | "britain" | "france" | "spain",
  army?: { tag: string; regs: number; guns?: number },
): void {
  const s = g.s;
  const p = provNamed(g.map, at);
  const who =
    by === "king"
      ? kingOf(s)
      : by === "us"
        ? usOf(s)
        : by === "britain"
          ? britainOf(s)
          : byKey(s, by);
  const pr = s.provinces[p];
  if (who < 0 || pr.owner < 0 || pr.owner === who) return;
  // Only in a war that's really on (France, Spain and Britain fight from their dates).
  if (!atWar(s, who, pr.owner)) return;
  if (army) kingArmy(g, army.tag, at, army.regs, army.guns ?? 0);
  else clearOut(g, p);
  const x = g.prov(p);
  x.occupier = who;
  x.siege = null;
  x.recruits = [];
  x.build = null;
  g.event({ k: "occupied", day: s.day, n: who, p, from: pr.owner });
}

/** A town given up: back to its owner. */
function free(g: ConquestGame, at: string, tag?: string): void {
  const s = g.s;
  const p = provNamed(g.map, at);
  if (tag) kingArmyGone(g, tag);
  const pr = s.provinces[p];
  if (pr.occupier < 0) return;
  const x = g.prov(p);
  x.occupier = -1;
  x.siege = null;
  g.event({ k: "freed", day: s.day, n: pr.owner, p });
}

/** Congress moves (the United Colonies' capital), and the soldiers at the old seat go with it. */
function congressTo(g: ConquestGame, at: string): void {
  const s = g.s;
  const us = usOf(s);
  if (us < 0) return;
  const p = provNamed(g.map, at);
  const n = g.nation(us);
  const from = n.capital;
  if (from === p || s.provinces[p].owner !== us) return;
  // CQ24 (r24): a player who governs the United States decides where it sits.
  if (n.ruler >= 0 && isPlayed(s, n.ruler)) return;
  n.capital = p;
  const main = mainArmy(s);
  for (const a of s.armies)
    if (a.owner === us && a.prov === from && a !== main) moveArmy(g, a, p);
  // Not hooks.capitalMoved: that's a capital lost to an enemy (CHAIR r16's
  // "the government has gone"); Congress moved, and the beat's news says why.
}

function devastate(g: ConquestGame, names: string[], by: number): void {
  for (const name of names) {
    const p = provNamed(g.map, name);
    const x = g.prov(p);
    x.devastation = Math.max(
      x.devastation,
      Math.min(0.9, x.devastation + 0.45),
    );
    for (const pop of x.pops) if (pop.cls === "tribe") pop.size *= 0.85;
    void by;
  }
}

/** The Treaty of Paris, and the peace with France, Spain and the Dutch signed the same day. */
function treaty(g: ConquestGame): void {
  const s = g.s;
  const us = usOf(s);
  const br = britainOf(s);
  const sp = byKey(s, "spain");
  const fr = byKey(s, "france");
  const nl = byKey(s, "netherlands");
  const give = (names: string[], to: number) => {
    for (const name of names) {
      const p = provNamed(g.map, name);
      if (to < 0 || s.provinces[p].owner !== br) continue;
      cede(g, p, to);
      g.event({ k: "ceded", day: s.day, n: to, p, from: br });
    }
  };
  // The Floridas to Spain, Tobago to France, the Illinois country to the United States.
  give(["St. Augustine", "Pensacola", "Mobile", "Natchez"], sp);
  give(["Tobago"], fr);
  give(["Cahokia", "Wabash"], us);
  // Everything else taken on either side goes back (endWar returns occupied land).
  for (const other of [fr, sp, nl]) {
    if (other < 0 || br < 0) continue;
    const k = pairKey(other, br);
    if (s.europe.wars[k] !== undefined) {
      delete s.europe.wars[k];
      g.europeChanged();
      g.event({ k: "europe", day: s.day, a: other, b: br, war: false });
    }
    endWar(g, other, br);
  }
  if (br >= 0 && us >= 0) endWar(g, br, us);
  if (us >= 0 && s.nations[us].rebelling) rebellionWon(g, us);
}

/**
 * The war's events, as history had them. A beat's text is the news everyone
 * hears; real people appear as the record has them, with no words of theirs.
 */
export const BEATS: Beat[] = [
  {
    key: "norfolk",
    date: [1776, 1, 1],
    title: "Norfolk in ashes",
    text: "On New Year's Day the King's ships in the Elizabeth River bombard Norfolk, Virginia's biggest town; fires set by both sides leave it in ashes.",
    at: "Nansemond",
  },
  {
    key: "common-sense",
    date: [1776, 1, 10],
    title: "Common Sense",
    text: "A pamphlet called Common Sense, printed at Philadelphia, argues in plain words for independence and a republic. It sells by the tens of thousands and is read aloud in taverns from New Hampshire to Georgia.",
    at: "Fort Christina",
    scene: "pamphlet",
  },
  {
    key: "moores-creek",
    date: [1776, 2, 27],
    title: "Moore's Creek Bridge",
    text: "In North Carolina, patriot militia rout a column of Highland loyalists at Moore's Creek Bridge. The colony's loyalists keep their heads down for years.",
    at: "Cape Fear",
  },
  {
    key: "boston",
    date: [1776, 3, 17],
    title: "The British leave Boston",
    text: "With cannon dragged from Ticonderoga over the winter snow and set on Dorchester Heights above the harbour, the British can no longer hold Boston. Their army sails for Halifax, and a thousand loyalists go with it.",
    at: "Massachusetts Bay",
    fx: (g) => {
      free(g, "Massachusetts Bay");
      kingArmy(g, "boston", "Chebucto", 9, 1);
      armyTo(g, "New Amsterdam");
    },
  },
  {
    key: "quebec-relief",
    date: [1776, 5, 6],
    title: "Quebec relieved",
    text: "The first British ships of the spring come up the St. Lawrence to Quebec. The American army besieging it breaks and falls back up the river, sick with smallpox.",
    at: "Quebec",
  },
  {
    key: "canada",
    date: [1776, 6, 15],
    title: "Out of Canada",
    text: "Beaten at Trois-Rivières, the Americans give up Montreal and fall back up Lake Champlain to Ticonderoga. The invasion of Canada is over.",
    at: "Hochelaga",
    fx: (g) => {
      const ids = armyIds(g);
      const a = g.s.armies.find((x) => x.id === ids.canada);
      if (a) moveArmy(g, a, provNamed(g.map, "Adirondack"));
      const p = provNamed(g.map, "Hochelaga");
      if (g.s.provinces[p].occupier === usOf(g.s)) {
        g.prov(p).occupier = -1;
        g.event({
          k: "freed",
          day: g.s.day,
          n: g.s.provinces[p].owner,
          p,
        });
      }
    },
  },
  {
    key: "sullivans-island",
    date: [1776, 6, 28],
    title: "The palmetto fort",
    text: "A British fleet attacks Charleston harbour and is beaten off by the guns of a fort of palmetto logs on Sullivan's Island, whose soft wood swallows the cannonballs.",
    at: "Charles Town",
  },
  {
    key: "staten-island",
    date: [1776, 7, 2],
    title: "The fleet at New York",
    text: "The largest fleet ever seen in America lands a British army on Staten Island at the mouth of New York harbour: over thirty thousand soldiers and sailors, thousands of them German regiments hired from their princes.",
    at: "New Amsterdam",
    fx: (g) => {
      kingArmyGone(g, "boston");
      // CQ24 (r24): the King's main army has a tag of its own ("kingmain");
      // it shared the Continental Army's ("main"), so the beats moved the
      // Americans' army about as if it were the King's.
      kingArmy(g, "kingmain", "Paumanok", 24, 3);
    },
  },
  {
    key: "declaration",
    date: [1776, 7, 4],
    title: "The Declaration of Independence",
    text: "The Continental Congress adopts a Declaration of Independence: the United Colonies are, and of right ought to be, free and independent states. It is read aloud from courthouse steps; in New York a crowd pulls down the gilded statue of the King.",
    at: "Fort Christina",
    scene: "declaration",
    fx: (g) => {
      const us = usOf(g.s);
      if (us < 0) return;
      const n = g.nation(us);
      n.name = "the United States";
      n.adjective = "American";
    },
  },
  {
    key: "long-island",
    date: [1776, 8, 27],
    title: "The battle of Long Island",
    text: "The British outflank the Continental Army on Long Island and beat it at Brooklyn. Two nights later, in fog, the army slips back across the East River to Manhattan in boats.",
    at: "Paumanok",
    battle: { us: "lost", main: true, king: "kingmain", at: "Paumanok" },
  },
  {
    key: "new-york",
    date: [1776, 9, 15],
    title: "New York falls",
    text: "The British land at Kip's Bay and take New York. It will be their headquarters for the rest of the war, and a refuge for loyalists from every colony.",
    at: "New Amsterdam",
    occupied: ["New Amsterdam"],
    fx: (g) => {
      armyTo(g, "Esopus");
      occupy(g, "New Amsterdam", "king", {
        tag: "kingmain",
        regs: 24,
        guns: 3,
      });
    },
  },
  {
    key: "ny-fire",
    date: [1776, 9, 21],
    title: "Fire in New York",
    text: "A great fire burns a quarter of New York. Nobody ever learns who set it.",
    at: "New Amsterdam",
  },
  {
    key: "hale",
    date: [1776, 9, 22],
    title: "A spy hanged",
    text: "Captain Nathan Hale of Connecticut, taken behind the British lines in plain clothes with notes of their camps on him, is hanged as a spy at New York.",
    at: "New Amsterdam",
  },
  {
    key: "valcour",
    date: [1776, 10, 11],
    title: "Valcour Island",
    text: "A little American fleet built over the summer on Lake Champlain is beaten at Valcour Island, but it has cost the British the season: there will be no march on Albany this year.",
    at: "Champlain",
  },
  {
    key: "fort-washington",
    date: [1776, 11, 16],
    title: "Fort Washington taken",
    text: "The fort at the north end of Manhattan surrenders with nearly three thousand men. The Continental Army retreats across New Jersey, shrinking every day as enlistments run out.",
    at: "New Amsterdam",
    fx: (g) => armyTo(g, "Raritan"),
  },
  {
    key: "newport",
    date: [1776, 12, 8],
    title: "Newport, and New Jersey",
    text: "The British take Newport, and their posts stretch across New Jersey to the Delaware, with Hessian regiments at Trenton. Congress leaves Philadelphia for Baltimore. On the far bank, the American army is down to a few thousand men.",
    at: "Narragansett",
    occupied: ["Narragansett", "Raritan"],
    fx: (g) => {
      armyTo(g, "Upland");
      occupy(g, "Narragansett", "king", { tag: "newport", regs: 5 });
      occupy(g, "Raritan", "king", { tag: "jersey", regs: 3 });
      congressTo(g, "Severn");
    },
  },
  {
    key: "trenton",
    date: [1776, 12, 26],
    title: "Trenton",
    text: "On Christmas night the American army crosses the icy Delaware and at dawn falls on the Hessian garrison at Trenton by surprise: nearly a thousand prisoners, for a handful of men lost.",
    at: "Raritan",
    battle: { us: "won", main: true, at: "Raritan" },
    fx: (g) => {
      free(g, "Raritan", "jersey");
      armyTo(g, "Raritan");
    },
  },
  {
    key: "princeton",
    date: [1777, 1, 3],
    title: "Princeton",
    text: "A week later the Americans slip past the British army in the night and beat its rearguard at Princeton. The British pull back to a few posts near New York, and the American army winters in the hills at Morristown.",
    at: "Raritan",
  },
  {
    key: "congress-back",
    date: [1777, 3, 4],
    title: "Congress back at Philadelphia",
    text: "The danger past for now, Congress returns from Baltimore to Philadelphia.",
    at: "Fort Christina",
    fx: (g) => congressTo(g, "Fort Christina"),
  },
  {
    key: "flag",
    date: [1777, 6, 14],
    title: "The Stars and Stripes",
    text: "Congress resolves that the flag of the United States be thirteen stripes, alternate red and white, and the union thirteen stars, white in a blue field.",
    fx: (g) => {
      const us = usOf(g.s);
      if (us >= 0) g.nation(us).flag = STARS_AND_STRIPES;
    },
  },
  {
    key: "ticonderoga",
    date: [1777, 7, 6],
    title: "Ticonderoga given up",
    text: "A British army under General Burgoyne comes down Lake Champlain from Canada, and the Americans abandon Fort Ticonderoga without a fight. New England is alarmed.",
    at: "Adirondack",
    occupied: ["Adirondack"],
    fx: (g) => {
      const ids = armyIds(g);
      const a = g.s.armies.find((x) => x.id === ids.canada);
      if (a) moveArmy(g, a, provNamed(g.map, "Fort Orange"));
      occupy(g, "Adirondack", "king", { tag: "north", regs: 8, guns: 1 });
    },
  },
  {
    key: "oriskany",
    date: [1777, 8, 6],
    title: "Oriskany",
    text: "In the Mohawk Valley, Mohawk and Seneca warriors fighting with the British ambush the New York militia and their Oneida allies at Oriskany. The Six Nations are fighting each other for the first time anyone remembers.",
    at: "Mohawk",
    scene: "nations",
  },
  {
    key: "bennington",
    date: [1777, 8, 16],
    title: "Bennington",
    text: "New England militia destroy a detachment of Burgoyne's army sent to seize horses and stores at Bennington.",
    at: "Fort Orange",
  },
  {
    key: "brandywine",
    date: [1777, 9, 11],
    title: "Brandywine",
    text: "General Howe's army, landed at the head of the Chesapeake, outflanks the Americans at Brandywine Creek and drives them back toward Philadelphia.",
    at: "Fort Christina",
    battle: {
      us: "lost",
      main: true,
      king: "kingmain",
      at: "Fort Christina",
    },
    fx: (g) => {
      // New York keeps a garrison while the main army is in Pennsylvania.
      kingArmy(g, "ny", "New Amsterdam", 8);
    },
  },
  {
    key: "philadelphia",
    date: [1777, 9, 26],
    title: "Philadelphia taken",
    text: "The British march into Philadelphia. Congress has fled, first to Lancaster and then over the Susquehanna to York.",
    at: "Fort Christina",
    occupied: ["Fort Christina"],
    fx: (g) => {
      congressTo(g, "Susquehannock");
      armyTo(g, "Upland");
      occupy(g, "Fort Christina", "king", {
        tag: "kingmain",
        regs: 16,
        guns: 3,
      });
    },
  },
  {
    key: "germantown",
    date: [1777, 10, 4],
    title: "Germantown",
    text: "The Americans attack the British camp at Germantown at dawn, in fog. It goes wrong and they are beaten off, but Europe notes that an army beaten three weeks before came back to attack.",
    at: "Fort Christina",
  },
  {
    key: "saratoga",
    date: [1777, 10, 17],
    title: "Saratoga",
    text: "Surrounded at Saratoga, General Burgoyne surrenders his whole army: nearly six thousand men. It is the turning of the war. In Paris, the French begin to talk of an alliance.",
    at: "Fort Orange",
    fx: (g) => free(g, "Adirondack", "north"),
  },
  {
    key: "articles",
    date: [1777, 11, 15],
    title: "The Articles of Confederation",
    text: "Congress agrees the Articles of Confederation, a league of the thirteen states, and sends them to the states to ratify.",
  },
  {
    key: "valley-forge",
    date: [1777, 12, 19],
    title: "Valley Forge",
    text: "The Continental Army goes into winter quarters at Valley Forge, twenty miles from Philadelphia: log huts, short rations and too few shoes. Some two thousand will die of sickness before the spring.",
    at: "Upland",
    scene: "winter",
  },
  {
    key: "alliance",
    date: [1778, 2, 6],
    title: "The French alliance",
    text: "In Paris, France signs treaties of friendship and of alliance with the United States. Britain and France will be at war by summer.",
    fx: (g) => {
      const s = g.s;
      const us = usOf(s);
      const fr = byKey(s, "france");
      if (us < 0 || fr < 0) return;
      if (
        !s.treaties.some(
          (t) =>
            t.kind === "alliance" &&
            ((t.a === us && t.b === fr) || (t.a === fr && t.b === us)),
        )
      ) {
        s.treaties.push({ kind: "alliance", a: fr, b: us, since: s.day });
        g.treatiesChanged();
        g.event({ k: "treaty", day: s.day, n: fr, with: us, t: "alliance" });
      }
    },
  },
  {
    key: "drill",
    date: [1778, 2, 23],
    title: "A drillmaster",
    text: "A Prussian officer, the Baron von Steuben, begins drilling the army at Valley Forge to one manual. By spring it marches and fires like a European army.",
    at: "Upland",
  },
  {
    key: "philadelphia-left",
    date: [1778, 6, 18],
    title: "The British leave Philadelphia",
    text: "With a French fleet on its way, the British army marches out of Philadelphia for New York, and thousands of loyalists leave with it.",
    at: "Fort Christina",
    fx: (g) => {
      free(g, "Fort Christina");
      kingArmyGone(g, "ny");
      kingArmy(g, "kingmain", "New Amsterdam", 20, 3);
      congressTo(g, "Fort Christina");
      armyTo(g, "Raritan");
    },
  },
  {
    key: "monmouth",
    date: [1778, 6, 28],
    title: "Monmouth",
    text: "The Americans catch the British rearguard at Monmouth Court House in New Jersey, in murderous heat. Neither side gives way; in the night the British slip off to New York, and the drilled army has held its ground.",
    at: "Raritan",
    battle: { us: "drawn", main: true, king: "kingmain", at: "Raritan" },
    fx: (g) => armyTo(g, "Esopus"),
  },
  {
    key: "wyoming",
    date: [1778, 7, 3],
    title: "The Wyoming Valley",
    text: "Loyalist rangers and Seneca warriors overrun the settlements of the Wyoming Valley on the Susquehanna. Hundreds of militia are killed, and the valley is burned and emptied.",
    at: "Shamokin",
  },
  {
    key: "kaskaskia",
    date: [1778, 7, 4],
    title: "The Illinois country",
    text: "A small Virginia force under George Rogers Clark takes the British posts at Kaskaskia and Cahokia, in the Illinois country, without a shot.",
    at: "Cahokia",
    fx: (g) => occupy(g, "Cahokia", "us"),
  },
  {
    key: "dominica",
    date: [1778, 9, 7],
    title: "Dominica taken",
    text: "The French governor of Martinique crosses over and takes Dominica from the British.",
    at: "Dominica",
    fx: (g) => occupy(g, "Dominica", "france"),
  },
  {
    key: "st-lucia",
    date: [1778, 12, 13],
    title: "St. Lucia",
    text: "A British force takes St. Lucia from the French, and holds it against their fleet.",
    at: "St. Lucia",
    fx: (g) => occupy(g, "St. Lucia", "britain"),
  },
  {
    key: "savannah",
    date: [1778, 12, 29],
    title: "Savannah taken",
    text: "A British expedition from New York takes Savannah. Georgia's royal governor comes back, and the war turns south.",
    at: "Guale",
    occupied: ["Guale"],
    fx: (g) => occupy(g, "Guale", "king", { tag: "south", regs: 5 }),
  },
  {
    key: "vincennes",
    date: [1779, 2, 25],
    title: "Vincennes",
    text: "After a winter march through flooded country, Clark's men take Vincennes on the Wabash, and its British commander with it.",
    at: "Wabash",
    fx: (g) => occupy(g, "Wabash", "us"),
  },
  {
    key: "spain",
    date: [1779, 6, 21],
    title: "Spain at war",
    text: "Spain declares war on Britain, as France's ally rather than the Americans'. At New Orleans its governor, Bernardo de Gálvez, gathers an army.",
    at: "Bayogoula",
  },
  {
    key: "grenada",
    date: [1779, 7, 4],
    title: "Grenada",
    text: "A French fleet takes Grenada from the British.",
    at: "Grenada",
    fx: (g) => occupy(g, "Grenada", "france"),
  },
  {
    key: "sullivan",
    date: [1779, 8, 29],
    title: "The towns burn",
    text: "Continental troops march through the Haudenosaunee country, the Seneca and Cayuga towns, burning some forty towns, their orchards and their winter corn. Thousands of people flee to Fort Niagara and spend a starving winter there.",
    at: "Seneca",
    scene: "burned",
    fx: (g) => devastate(g, ["Seneca", "Onondaga"], usOf(g.s)),
  },
  {
    key: "baton-rouge",
    date: [1779, 9, 21],
    title: "Baton Rouge and Natchez",
    text: "Gálvez takes the British posts at Baton Rouge and Natchez on the Mississippi.",
    at: "Natchez",
    fx: (g) => occupy(g, "Natchez", "spain"),
  },
  {
    key: "flamborough",
    date: [1779, 9, 23],
    title: "Off Flamborough Head",
    text: "Off the coast of Yorkshire, the American captain John Paul Jones takes the British frigate Serapis, though his own ship sinks under him.",
  },
  {
    key: "newport-left",
    date: [1779, 10, 25],
    title: "Newport given up",
    text: "The British leave Newport to strengthen New York.",
    at: "Narragansett",
    fx: (g) => free(g, "Narragansett", "newport"),
  },
  {
    key: "mobile",
    date: [1780, 3, 14],
    title: "Mobile",
    text: "Gálvez takes Mobile from the British.",
    at: "Mobile",
    fx: (g) => occupy(g, "Mobile", "spain"),
  },
  {
    key: "charleston",
    date: [1780, 5, 12],
    title: "Charleston falls",
    text: "After a six-week siege, Charleston surrenders with more than five thousand Continental soldiers and militia: the worst American defeat of the war.",
    at: "Charles Town",
    occupied: ["Charles Town"],
    fx: (g) =>
      occupy(g, "Charles Town", "king", { tag: "carolina", regs: 8, guns: 2 }),
  },
  {
    key: "camden",
    date: [1780, 8, 16],
    title: "Camden",
    text: "The Americans' southern army is routed at Camden in South Carolina; its general rides sixty miles from the field. The British hold the backcountry's posts.",
    at: "Congaree",
    battle: { us: "lost", king: "carolina", at: "Congaree" },
    occupied: ["Congaree"],
    fx: (g) => occupy(g, "Congaree", "king", { tag: "camden", regs: 3 }),
  },
  {
    key: "arnold",
    date: [1780, 9, 25],
    title: "Treason",
    text: "General Benedict Arnold, commanding at West Point, is found to have plotted to hand the fort to the British, and flees to them. Major John André, the British officer he dealt with, is hanged as a spy a week later.",
    at: "Esopus",
  },
  {
    key: "kings-mountain",
    date: [1780, 10, 7],
    title: "Kings Mountain",
    text: "Militia from over the mountains surround and destroy a corps of loyalists on Kings Mountain.",
    at: "Catawba",
  },
  {
    key: "dutch",
    date: [1780, 12, 20],
    title: "War with the Dutch",
    text: "Britain declares war on the Netherlands, for its trade with the Americans.",
  },
  {
    key: "cowpens",
    date: [1781, 1, 17],
    title: "Cowpens",
    text: "At the Cowpens, Daniel Morgan's riflemen and Continentals destroy Tarleton's legion of horse and foot.",
    at: "Catawba",
  },
  {
    key: "st-eustatius",
    date: [1781, 2, 3],
    title: "St. Eustatius",
    text: "A British fleet takes St. Eustatius, the Dutch free port that sold the Americans so much of their powder.",
  },
  {
    key: "confederation",
    date: [1781, 3, 1],
    title: "The Articles ratified",
    text: "With Maryland's signature the Articles of Confederation take effect: the United States in Congress Assembled.",
  },
  {
    key: "guilford",
    date: [1781, 3, 15],
    title: "Guilford Courthouse",
    text: "Cornwallis's army wins the field at Guilford Courthouse in North Carolina, and loses a quarter of its men doing it. It marches for Virginia.",
    at: "Saura",
  },
  {
    key: "pensacola",
    date: [1781, 5, 9],
    title: "Pensacola",
    text: "After a two-month siege, Pensacola surrenders to Gálvez: West Florida is Spain's.",
    at: "Pensacola",
    fx: (g) => occupy(g, "Pensacola", "spain"),
  },
  {
    key: "camden-left",
    date: [1781, 5, 10],
    title: "The backcountry given up",
    text: "The British give up Camden and the posts of the South Carolina backcountry, and fall back on Charleston.",
    at: "Congaree",
    fx: (g) => free(g, "Congaree", "camden"),
  },
  {
    key: "tobago",
    date: [1781, 6, 2],
    title: "Tobago",
    text: "The French take Tobago from the British.",
    at: "Tobago",
    fx: (g) => occupy(g, "Tobago", "france"),
  },
  {
    key: "yorktown-fortified",
    date: [1781, 8, 2],
    title: "Cornwallis at Yorktown",
    text: "Cornwallis's army fortifies Yorktown, on the York River in Virginia, and waits for the navy to come.",
    at: "Jamestown",
    occupied: ["Jamestown"],
    fx: (g) =>
      occupy(g, "Jamestown", "king", { tag: "virginia", regs: 8, guns: 2 }),
  },
  {
    key: "march-south",
    date: [1781, 8, 19],
    title: "The march south",
    text: "Leaving a screen before New York, the American and French armies march for Virginia.",
    fx: (g) => armyTo(g, "Pamunkey"),
  },
  {
    key: "capes",
    date: [1781, 9, 5],
    title: "The Battle of the Capes",
    text: "Off the Virginia Capes a French fleet turns back the British fleet sent to relieve Cornwallis. He is trapped.",
    at: "Jamestown",
  },
  {
    key: "yorktown",
    date: [1781, 10, 19],
    title: "Yorktown",
    text: "Besieged by the American and French armies, Cornwallis surrenders at Yorktown with his whole army: over seven thousand men. In London, the government that fought the war falls within months.",
    at: "Jamestown",
    battle: { us: "won", main: true, king: "virginia", at: "Jamestown" },
    fx: (g) => {
      free(g, "Jamestown", "virginia");
      armyTo(g, "Esopus");
    },
  },
  {
    key: "st-kitts",
    date: [1782, 2, 12],
    title: "St. Kitts",
    text: "The French take St. Kitts after a month's siege of Brimstone Hill.",
    at: "St. Kitts",
    fx: (g) => occupy(g, "St. Kitts", "france"),
  },
  {
    key: "saintes",
    date: [1782, 4, 12],
    title: "The Saintes",
    text: "Off the Saintes, between Guadeloupe and Dominica, the British fleet defeats the French and takes their admiral: Jamaica is saved.",
    at: "Guadeloupe",
  },
  {
    key: "savannah-left",
    date: [1782, 7, 11],
    title: "Savannah given up",
    text: "The British leave Savannah.",
    at: "Guale",
    fx: (g) => free(g, "Guale", "south"),
  },
  {
    key: "preliminaries",
    date: [1782, 11, 30],
    title: "Peace in sight",
    text: "In Paris, the American and British commissioners sign the preliminary articles of peace: independence, and the land west to the Mississippi.",
  },
  {
    key: "charleston-left",
    date: [1782, 12, 14],
    title: "Charleston given up",
    text: "The British sail from Charleston, taking thousands of loyalists with them, and thousands of enslaved people too.",
    at: "Charles Town",
    fx: (g) => free(g, "Charles Town", "carolina"),
  },
  {
    key: "ceasefire",
    date: [1783, 4, 11],
    title: "The end of hostilities",
    text: "Congress proclaims the end of hostilities by land and sea.",
  },
  {
    key: "mutiny",
    date: [1783, 6, 21],
    title: "Congress leaves Philadelphia",
    text: "Unpaid Pennsylvania soldiers surround the State House, and Congress leaves Philadelphia for Princeton.",
    at: "Raritan",
    fx: (g) => congressTo(g, "Raritan"),
  },
  {
    key: "treaty",
    date: [1783, 9, 3],
    title: "The Treaty of Paris",
    text: "At Paris, Britain recognises the independence of the United States, with its western border on the Mississippi. In the treaties signed the same day, Britain gives the Floridas to Spain and Tobago to France, and the islands taken on both sides go back.",
    scene: "peace",
    fx: (g) => treaty(g),
  },
  {
    key: "evacuation",
    date: [1783, 11, 25],
    title: "Evacuation Day",
    text: "The last British troops sail from New York.",
    at: "New Amsterdam",
  },
  {
    key: "resignation",
    date: [1783, 12, 23],
    title: "The commander-in-chief goes home",
    text: "At Annapolis, where Congress now sits, General Washington resigns his commission and rides home to Virginia.",
    at: "Severn",
    fx: (g) => congressTo(g, "Severn"),
  },
];

/** The flags the United Colonies fly: the Continental Colours, then (from June 1777) the Stars and Stripes. */
export const CONTINENTAL_COLOURS = {
  field: "#b22234",
  division: "continental",
  second: "#f6f1e3",
  charge: "none",
  chargeColor: "#f6f1e3",
} as const;
export const STARS_AND_STRIPES = {
  field: "#b22234",
  division: "starsstripes",
  second: "#f6f1e3",
  charge: "none",
  chargeColor: "#f6f1e3",
} as const;
export const UNION_FLAG = {
  field: "#1f3f8f",
  division: "union",
  second: "#f6f1e3",
  charge: "none",
  chargeColor: "#c8102e",
} as const;

/** The beats that have come, in order (for the campaign's page). */
export function beatsCome(s: GameState): { beat: Beat; day: number }[] {
  const r = campaignOf(s);
  if (!r) return [];
  return BEATS.filter((b) => r.beats[b.key] !== undefined).map((b) => ({
    beat: b,
    day: r.beats[b.key],
  }));
}

// ---------------------------------------------------------------- the first day

/** The war as it stands on 1 January 1776. */
function setUp(g: ConquestGame): void {
  const s = g.s;
  if (!isCampaign(s)) return;
  const us = usOf(s);
  const br = britainOf(s);
  const king = kingOf(s);
  if (us < 0 || king < 0) return;
  const n = g.nation(us);
  // In rising since Lexington and Concord (19 April 1775); its own rules
  // (crushed, won, the crown's landings) give way to the campaign's beats.
  n.rebelling = true;
  n.rebellion = {
    since: dayOf(1775, 3, 19),
    expeditions: 0,
    beaten: 0,
    capitalLost: -1,
  };
  n.favor = 0;
  n.remit = 0;
  n.demand = null;
  // A congress of the colonies, under the Continental Colours.
  n.gov = "confederacy";
  n.mods = n.mods.filter((m) => !m.key.startsWith("gov:"));
  n.mods.push({
    key: "gov:confederacy",
    label: "A congress of the colonies",
    until: s.endDay + 1,
    fx: { ...GOV_FORMS.confederacy.fx },
  });
  n.flag = { ...CONTINENTAL_COLOURS };
  n.r76 = { beats: {} };
  for (const k of [king, br]) if (k >= 0) g.nation(k).flag = { ...UNION_FLAG };
  const pol = s.polities[us];
  if (pol) {
    pol.name = "the Continental Congress";
    g.politiesChanged(us);
  }
  const d = deskOf(g, us);
  d.rev = { day: n.rebellion.since, by: n.ruler, holds: [], sides: {} };
  // The war: with the King's forces, and with his loyal colonies.
  startWar(g, king, us, "The War of Independence", false);
  if (br >= 0) startWar(g, br, us, "The War of Independence", false);
  // Boston under siege; the Continental Army before it; the Americans in Montreal.
  kingArmy(g, "boston", "Massachusetts Bay", 9, 1);
  const boston = provNamed(g.map, "Massachusetts Bay");
  g.prov(boston).occupier = king;
  const ids = armyIds(g);
  const main = g.addArmy({
    id: g.nextId(),
    owner: us,
    prov: provNamed(g.map, "Plymouth"),
    regs: [
      ...Array.from({ length: 7 }, () => ({
        type: "regulars" as const,
        men: 100,
        morale: 0.8,
        home: -1,
      })),
      ...Array.from({ length: 3 }, () => ({
        type: "militia" as const,
        men: REGIMENTS.militia.men,
        morale: 0.75,
        home: -1,
      })),
      {
        type: "artillery" as const,
        men: REGIMENTS.artillery.men,
        morale: 0.8,
        home: -1,
      },
    ],
    path: [],
    depart: -1,
    arrive: -1,
    sea: false,
    retreating: false,
    arrived: s.day,
    from: -1,
    commander: -1,
    supply: 1,
  });
  ids.main = main.id;
  if (br >= 0) {
    const montreal = provNamed(g.map, "Hochelaga");
    const canada = g.addArmy({
      id: g.nextId(),
      owner: us,
      prov: montreal,
      regs: Array.from({ length: 3 }, () => ({
        type: "militia" as const,
        men: REGIMENTS.militia.men,
        morale: 0.6,
        home: -1,
      })),
      path: [],
      depart: -1,
      arrive: -1,
      sea: false,
      retreating: false,
      arrived: s.day,
      from: -1,
      commander: -1,
      supply: 1,
    });
    ids.canada = canada.id;
    // British America's own soldiers in Montreal fell back on Quebec.
    for (const a of s.armies)
      if (a.owner === br && a.prov === montreal)
        moveArmy(g, a, provNamed(g.map, "Quebec"));
    g.prov(montreal).occupier = us;
  }
  for (const life of s.lives) askSides(g, life);
}

hooks.created.push(setUp);

// ---------------------------------------------------------------- each day

hooks.daily.push((g) => {
  const s = g.s;
  if (!isCampaign(s)) return;
  const r = campaignOf(s);
  if (!r) return;
  for (const b of BEATS) {
    if (r.beats[b.key] !== undefined) continue;
    if (beatDay(b) > s.day) break;
    fireBeat(g, b);
  }
  for (const life of s.lives) {
    askSides(g, life);
    const held = life.r76?.held;
    if (held !== undefined && held <= s.day) {
      touchLife(g, life).r76!.held = undefined;
      journal(
        g,
        life,
        "You're exchanged for a prisoner of the other side, and walk free.",
        "good",
      );
    }
  }
});

/** A beat comes: the news, what it does, and the scenes it brings. */
export function fireBeat(g: ConquestGame, b: Beat): void {
  const s = g.s;
  const us = usOf(s);
  // Its own date (New Year's Day's news comes with the first morning).
  const day = Math.min(s.day, beatDay(b));
  rec(g).beats[b.key] = day;
  // CQ24 (r24): the course's gate: history, or what players made of it.
  if (R76_GATES.some((h) => h(g, b))) return;
  b.fx?.(g);
  const p = b.at ? provNamed(g.map, b.at) : undefined;
  g.event({
    k: "news",
    day,
    n: us,
    text: `${b.title}. ${b.text}`,
    ...(p !== undefined ? { p } : {}),
  });
  if (p !== undefined)
    rumour(g, p, `${b.title}! ${b.text}`, -1, undefined, false);
  const i = BEATS.indexOf(b);
  for (const life of s.lives) {
    if (life.watching || life.c < 0) continue;
    if (b.battle && inBattle(s, life, b.battle))
      raiseEvent(g, life, "r76-battle", { b: i });
    if (b.scene && sceneFor(s, life, b.scene))
      raiseEvent(g, life, `r76-${b.scene}`, { b: i });
    if (b.scene === "peace" && disbanded(s, life))
      raiseEvent(g, life, "r76-disband", { b: i });
    if (b.occupied?.some((name) => provNamed(g.map, name) === life.home))
      raiseEvent(g, life, "r76-occupied", {
        b: i,
        p: provNamed(
          g.map,
          b.occupied.find((x) => provNamed(g.map, x) === life.home)!,
        ),
      });
  }
}

/** A grown colonist of the United Colonies (or British America) who isn't watching. */
function grownColonist(s: GameState, life: Life): boolean {
  const me = meOf(s, life);
  return (
    !!me && !life.watching && !isChildLife(s, life) && !lifeIsNative(s, life)
  );
}

/** Ask a player of the United Colonies to choose a side (once). */
function askSides(g: ConquestGame, life: Life): void {
  const s = g.s;
  const us = usOf(s);
  const me = meOf(s, life);
  if (!me || me.nation !== us || life.r76?.sides !== undefined) return;
  if (!grownColonist(s, life)) return;
  if (s.nations[us].desk?.rev?.sides[life.seat]) return;
  if (!s.nations[us].rebelling) return;
  (touchLife(g, life).r76 ??= {}).sides = s.day;
  raiseEvent(g, life, "r76-sides", { n: us });
}

/** Who's in a battle: the soldiers of the army in it. */
export function inBattle(s: GameState, life: Life, b: BattleSpec): boolean {
  const job = life.job;
  if (!job || job.kind !== "soldier" || !meOf(s, life)) return false;
  const ids = campaignArmies(s);
  if (b.main && job.nation === usOf(s) && job.army === ids.main) return true;
  if (b.king && job.nation === kingOf(s) && job.army === ids[b.king])
    return true;
  return false;
}

function sceneFor(
  s: GameState,
  life: Life,
  scene: NonNullable<Beat["scene"]>,
): boolean {
  const me = meOf(s, life);
  if (!me) return false;
  const us = usOf(s);
  switch (scene) {
    case "pamphlet":
    case "declaration":
      return me.nation === us && grownColonist(s, life);
    case "winter": {
      const job = life.job;
      return (
        !!job &&
        job.kind === "soldier" &&
        job.nation === us &&
        job.army === campaignArmies(s).main
      );
    }
    case "burned":
      return s.nations[me.nation]?.key === "haudenosaunee";
    case "nations":
      return lifeIsNative(s, life) && !isChildLife(s, life);
    case "peace":
      return me.nation === us && sideOf(s, life) === "loyal";
  }
}

/** A Continental soldier when the army is sent home. */
function disbanded(s: GameState, life: Life): boolean {
  return life.job?.kind === "soldier" && life.job.nation === usOf(s);
}

// ---------------------------------------------------------------- sides

export function sideCheck(s: GameState, life: Life, side: string): Check {
  const us = usOf(s);
  const me = meOf(s, life);
  if (us < 0 || !me) return no("There's no war of independence here.");
  if (me.nation !== us) return no("Only the United States' own people choose.");
  if (!s.nations[us].rebelling) return no("The war is over.");
  const now = sideOf(s, life);
  if (now === side) return no("You stand there already.");
  if (
    now &&
    now !== "neutral" &&
    side !== "neutral" &&
    (life.r76?.turnedAt ?? -Infinity) + TURNCOAT.rest > s.day
  )
    return no("You changed sides this year already.");
  return yes;
}

function chooseSide(g: ConquestGame, life: Life, side: string): string | null {
  const s = g.s;
  const ok = sideCheck(s, life, side);
  if (!ok.ok) return ok.why;
  const was = sideOf(s, life);
  const err = revSide(g, life, side);
  if (err) return err;
  if (was && was !== "neutral" && side !== "neutral") {
    const r = (touchLife(g, life).r76 ??= {});
    r.turned = (r.turned ?? 0) + 1;
    r.turnedAt = s.day;
    addRenown(g, life, TURNCOAT.renown);
    journal(
      g,
      life,
      "You've changed sides. Your old friends call you a turncoat, and your new ones watch you.",
      "bad",
    );
  }
  return null;
}

// ---------------------------------------------------------------- a commission

/** Where a player could be commissioned: the patriots by Congress (or the army), the King's friends by his commander in a town he holds. */
export function commissionWhere(
  s: GameState,
  life: Life,
): { ok: boolean; why?: string; by?: "congress" | "king" } {
  const us = usOf(s);
  const side = sideOf(s, life);
  if (side !== "patriot" && side !== "loyal")
    return { ok: false, why: "Choose a side first." };
  const pr = s.provinces[life.prov];
  if (side === "patriot") {
    const main = mainArmy(s);
    if (life.prov === s.nations[us].capital || main?.prov === life.prov)
      return { ok: true, by: "congress" };
    return {
      ok: false,
      why: "Ask Congress in person (where it sits), or the army's headquarters.",
    };
  }
  const king = kingOf(s);
  const br = britainOf(s);
  if (pr.occupier === king || (pr.owner === br && pr.occupier < 0))
    return { ok: true, by: "king" };
  return {
    ok: false,
    why: "Ask at a town the King's army holds (New York, or wherever it is).",
  };
}

/** The odds of a commission, and the rank it would be. */
export function commissionOdds(
  s: GameState,
  life: Life,
): { odds: Breakdown; rank: number } {
  const lead = skillLevel(s, life, "leadership");
  const e = new Explain().add(
    `Your leadership (${lead}) against ${COMMISSION.leadershipDc}`,
    checkChance(lead, COMMISSION.leadershipDc),
    true,
  );
  if (life.renown >= 20)
    e.add(
      `Your name (renown ${Math.round(life.renown)})`,
      Math.min(0.2, life.renown / 200),
    );
  const fight = skillLevel(s, life, "fighting");
  if (fight >= 8) e.add(`An old soldier's fighting (${fight})`, 0.08);
  if (life.background === "gentry") e.add("A gentleman's family", 0.1);
  if (life.job?.kind === "soldier" && life.job.rank >= 2)
    e.add("You're a sergeant already", 0.1);
  if ((life.r76?.turned ?? 0) > 0) e.add("A turncoat", -0.25);
  const rank =
    lead >= COMMISSION.captain.leadership &&
    life.renown >= COMMISSION.captain.renown
      ? 4
      : 3;
  return { odds: e.done(2, 0.05, 0.95), rank };
}

export function commissionCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || !isCampaign(s)) return no("There's no war of independence here.");
  if (!grownColonist(s, life)) return no("A grown colonist only.");
  if (!s.nations[usOf(s)].rebelling) return no("The war is over.");
  const w = commissionWhere(s, life);
  if (!w.ok) return no(w.why!);
  const job = life.job;
  if (job?.kind === "soldier" && job.rank >= 3)
    return no("You hold a commission already.");
  if ((life.r76?.asked ?? -Infinity) + COMMISSION.rest > s.day)
    return no(
      `Not again before ${formatDate((life.r76?.asked ?? 0) + COMMISSION.rest)}.`,
    );
  if (life.purse < COMMISSION.cost)
    return no(`An officer's kit costs ${COMMISSION.cost} coins.`);
  return yes;
}

function seekCommission(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const ok = commissionCheck(s, life);
  if (!ok.ok) return ok.why;
  const w = commissionWhere(s, life);
  const { odds, rank } = commissionOdds(s, life);
  (touchLife(g, life).r76 ??= {}).asked = s.day;
  const pass = cdice(s, 0x11, life.c, s.day).chance(odds.total);
  if (!pass) {
    journal(
      g,
      life,
      w.by === "congress"
        ? "Congress has more gentlemen wanting commissions than regiments to put them in. Not this time."
        : "The King's officers look you over and send you away: they've loyalists enough wanting commissions.",
      "bad",
    );
    return null;
  }
  withFlow(g, { key: "r76:kit", label: "An officer's kit" }, () =>
    spend(g, life, COMMISSION.cost),
  );
  const nation = w.by === "congress" ? usOf(s) : kingOf(s);
  const title = JOBS.soldier.ranks[rank].title;
  if (life.job?.kind === "soldier") {
    const job = touchLife(g, life).job!;
    job.rank = Math.max(job.rank, rank);
    job.months = 0;
    job.nation = nation;
    job.army = -1;
  } else {
    const job = startJob(g, life, "soldier", "fort", rank);
    job.nation = nation;
  }
  life.tally.topRank = Math.max(life.tally.topRank, rank);
  // With the main army if it's here, else in garrison till one comes.
  const here = s.armies
    .filter((a) => a.owner === nation && a.prov === life.prov)
    .sort((a, b) => b.regs.length - a.regs.length)[0];
  if (here) touchLife(g, life).job!.army = here.id;
  (touchLife(g, life).r76 ??= {}).commission = {
    by: w.by!,
    day: s.day,
    rank,
  };
  const army =
    w.by === "congress" ? "the Continental Army" : "a Loyalist regiment";
  addRenown(g, life, 3);
  journal(
    g,
    life,
    `Commissioned ${title.toLowerCase()} in ${army}${w.by === "congress" ? " by Congress" : " by the King's commander"}. ${COMMISSION.cost} coins for the coat and sword.`,
    "good",
  );
  milestone(
    g,
    life,
    "promoted",
    `Commissioned ${title.toLowerCase()} in ${army}`,
  );
  return null;
}

// ---------------------------------------------------------------- spying

/** Whether a player could spy here: a patriot where the King holds the town, a loyalist where the Americans do. */
export function spyCheck(s: GameState, life: Life): Check {
  const me = meOf(s, life);
  if (!me || !isCampaign(s)) return no("There's no war of independence here.");
  if (!grownColonist(s, life)) return no("A grown colonist only.");
  const us = usOf(s);
  if (!s.nations[us].rebelling) return no("The war is over.");
  if ((life.r76?.held ?? -1) > s.day) return no("You're held as a spy.");
  const side = sideOf(s, life);
  if (side !== "patriot" && side !== "loyal")
    return no("Choose a side first: a spy spies for someone.");
  if (life.travel) return no("Not on the road.");
  const pr = s.provinces[life.prov];
  const h = holder(pr);
  const enemyTown =
    side === "patriot" ? h === kingOf(s) || h === britainOf(s) : h === us;
  if (!enemyTown)
    return no(
      side === "patriot"
        ? "Spy where the King holds the town (New York, or wherever his army is)."
        : "Spy where the Americans hold the town.",
    );
  if ((life.r76?.spied ?? -Infinity) + SPY.rest > s.day)
    return no(
      `Lie low until ${formatDate((life.r76?.spied ?? 0) + SPY.rest)}.`,
    );
  return yes;
}

/** The odds of a report, and of being taken if it fails: from the same numbers the spying rolls. */
export function spyOdds(
  s: GameState,
  life: Life,
): { pass: number; caught: number; hanged: number } {
  const pass = checkChance(skillLevel(s, life, "stealth"), SPY.dc);
  return {
    pass,
    caught: (1 - pass) * SPY.caught,
    hanged: (1 - pass) * SPY.caught * SPY.hanged,
  };
}

function spy(g: ConquestGame, life: Life): string | null {
  const s = g.s;
  const ok = spyCheck(s, life);
  if (!ok.ok) return ok.why;
  const side = sideOf(s, life) as "patriot" | "loyal";
  const r = (touchLife(g, life).r76 ??= {});
  r.spied = s.day;
  const d = cdice(s, 0x22, life.c, s.day);
  const pass = d.chance(checkChance(skillLevel(s, life, "stealth"), SPY.dc));
  gainXp(g, life, "stealth", 12);
  const here = g.map.provinces[life.prov].name;
  if (pass) {
    r.reports = (r.reports ?? 0) + 1;
    const pay = SPY.pay[side];
    withFlow(
      g,
      {
        key: "r76:spy",
        label:
          side === "patriot"
            ? "The committee's secret service"
            : "The British secret service",
      },
      () => earn(g, life, pay),
    );
    addRenown(g, life, SPY.renown);
    secretNote(
      g,
      life,
      `You count the regiments at ${here}, note the guns and the ships, and get it out sewn into a coat lining. ${pay} coins from ${side === "patriot" ? "the committee" : "the British"}.`,
      "good",
    );
    return null;
  }
  if (d.chance(SPY.caught)) {
    secretNote(g, life, `A sentry at ${here} looks at you too long.`, "bad");
    raiseEvent(g, life, "r76-spy-caught", { p: life.prov });
    return null;
  }
  addStress(g, life, 6);
  secretNote(
    g,
    life,
    `You learn nothing worth the risk at ${here}, and get out before anyone wonders why you're there.`,
  );
  return null;
}

/** Taken as a spy and tried: the rope, or held till exchanged (the odds on the scene's buttons). */
export function courtMartial(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return;
  const here = g.map.provinces[life.prov].name;
  if (cdice(s, 0x33, life.c, s.day).chance(SPY.hanged)) {
    journal(
      g,
      life,
      `A court martial at ${here} finds you guilty of spying. You're hanged at dawn.`,
      "bad",
    );
    kill(g, me, `hanged as a spy at ${here}`);
    return;
  }
  (touchLife(g, life).r76 ??= {}).held = s.day + SPY.heldDays;
  addStress(g, life, 15);
  journal(
    g,
    life,
    `A court martial at ${here} can't prove enough to hang you. You're held in the provost's prison until you can be exchanged (${formatDate(s.day + SPY.heldDays)}).`,
    "bad",
  );
}

// ---------------------------------------------------------------- commands

const HELD_BLOCKS = new Set([
  "travel",
  "halt",
  "job",
  "act",
  "takeup",
  "market",
  "trade",
  "sail",
  "boat",
  "europe",
  "r76",
  "legend",
  "exped",
  "march",
  "command",
  "army",
  "enter",
]);

hooks.gate.push((g, life, c) => {
  const held = life.r76?.held;
  if (held === undefined || held <= g.s.day || !HELD_BLOCKS.has(c.k))
    return null;
  return `You're held as a spy until you're exchanged (${formatDate(held)}).`;
});

hooks.command.push((g, life, c: LifeCommand) => {
  if (c.k !== "r76") return undefined;
  if (!isCampaign(g.s)) return "This isn't the 1776 campaign.";
  switch (c.act) {
    case "side":
      return chooseSide(g, life, String(c.arg ?? ""));
    case "commission":
      return seekCommission(g, life);
    case "spy":
      return spy(g, life);
    default:
      return "Unknown command.";
  }
});

/** The beat's days, for the guide. */
export function beatDate(b: Beat): string {
  return formatDate(beatDay(b));
}

export function campaignYear(s: GameState): number {
  return dateOf(s.day).year;
}

// ---------------------------------------------------------------- CQ24 (r24)

/** CQ24 (r24): an army a player's character commands. */
export function playerLed(s: GameState, a: Army): boolean {
  return a.commander >= 0 && isPlayed(s, a.commander);
}

// CQ24 (r24): for the course of history and the years after the peace
// (Campaign1776Course.ts, Campaign1776Later.ts).
export {
  armyTo,
  congressTo,
  devastate,
  free,
  kingArmy,
  kingArmyGone,
  mainArmy,
  moveArmy,
  occupy,
  treaty as treatyOfParis,
};
