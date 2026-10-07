// Words for Derpy Conquest's interface: names of things, what buildings do,
// and what each game event means for the player reading the log.

import { formatDate } from "../engine/Calendar";
import { charName } from "../engine/Queries";
import { REG_NAMES, TITLE_NAMES } from "../engine/Rules";
import type {
  BuildingKind,
  GameEvent,
  GameState,
  Good,
  MapDef,
  Terrain,
  TreatyKind,
} from "../engine/Types";

export const GOOD_NAMES: Record<Good, string> = {
  grain: "Grain",
  fish: "Fish",
  furs: "Furs",
  tobacco: "Tobacco",
  sugar: "Sugar",
  timber: "Timber",
  silver: "Silver",
  tools: "Tools",
  guns: "Guns",
  cloth: "Cloth",
};

/** Map colours for each good (economy view). */
export const GOOD_COLORS: Record<Good, string> = {
  grain: "#d9b44a",
  fish: "#5b8fa8",
  furs: "#7a4b2a",
  tobacco: "#a8722f",
  sugar: "#e9d9d0",
  timber: "#4f7a3a",
  silver: "#9aa4ad",
  tools: "#6d6a66",
  guns: "#3e3a3a",
  cloth: "#b5577a",
};

export const TERRAIN_NAMES: Record<Terrain, string> = {
  plains: "Plains",
  forest: "Forest",
  hills: "Hills",
  mountains: "Mountains",
  jungle: "Jungle",
  desert: "Desert",
  marsh: "Marsh",
  tundra: "Tundra",
};

export { REG_NAMES };

export const BUILDING_LABELS: Record<BuildingKind, string> = {
  farm: "Farms",
  plantation: "Plantation",
  tradingpost: "Trading post",
  mine: "Silver mine",
  lumbercamp: "Lumber camp",
  port: "Port",
  fort: "Fort",
  smithy: "Smithy",
  gunsmith: "Gunsmith",
  weaver: "Weavers",
  church: "Church",
  courthouse: "Courthouse",
};

export const BUILDING_HELP: Record<BuildingKind, string> = {
  farm: "+25% food from the province's laborers per level, and room for 25% more settlers.",
  plantation: "+40% tobacco or sugar per level. Draws gentry.",
  tradingpost:
    "+40% furs per level, and the trappers wear out the grounds faster. Draws merchants.",
  mine: "+40% silver per level.",
  lumbercamp: "+40% timber per level.",
  port: "Ships can load here: convoys carry more, armies can sail from it, and merchants settle.",
  fort: "Defenders fight 15% harder per level, and sieges take far longer.",
  smithy: "1,000 artisans per level turn timber into tools.",
  gunsmith: "1,000 artisans per level turn tools and timber into guns.",
  weaver: "1,000 artisans per level turn grain (flax and wool) into cloth.",
  church:
    "Calms other faiths (−4 unrest from religion per level). Draws clergy.",
  courthouse: "+2 administration: your officials can govern more land.",
};

export const TREATY_NAMES: Record<TreatyKind, string> = {
  trade: "Trade treaty",
  alliance: "Alliance",
  access: "Right of passage",
};

/** A nation's name with a capital letter, for titles and tables. */
export function nationName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function money(v: number): string {
  const r = Math.round(v);
  return r.toLocaleString("en-US");
}

export function people(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

/** One line for the log, from the point of view of nation `me`. */
export function describeEvent(
  s: GameState,
  map: MapDef,
  me: number,
  e: GameEvent,
): string | null {
  const N = (i: number) => nationName(s.nations[i]?.name ?? "someone");
  const P = (p: number) => map.provinces[p]?.name ?? "somewhere";
  const C = (c: number) => charName(s.chars[c]);
  const us = (n: number) => n === me;
  switch (e.k) {
    case "colony":
      return us(e.n)
        ? `Our settlers founded a colony at ${P(e.p)}.`
        : `${N(e.n)} founded a colony at ${P(e.p)}.`;
    case "built":
      return us(e.n)
        ? `${BUILDING_LABELS[e.b]} (level ${e.lvl}) finished at ${P(e.p)}.`
        : null;
    case "raised":
      return us(e.n)
        ? `A regiment of ${REG_NAMES[e.t].toLowerCase()} is ready at ${P(e.p)}.`
        : null;
    case "battle": {
      const mine = e.a.includes(me) || e.d.includes(me);
      if (!mine) return null;
      const weAttacked = e.a.includes(me);
      const won = (e.w === 0) === weAttacked;
      return `${won ? "Victory" : "Defeat"} at ${P(e.p)}.`;
    }
    case "siege":
      return us(e.n)
        ? `Our army is besieging ${P(e.p)}.`
        : us(e.from)
          ? `${N(e.n)} is besieging ${P(e.p)}!`
          : null;
    case "occupied":
      return us(e.n)
        ? `We took ${P(e.p)} from ${N(e.from)}.`
        : us(e.from)
          ? `${N(e.n)} has taken ${P(e.p)}!`
          : null;
    case "freed":
      return us(e.n) ? `We took back ${P(e.p)}.` : null;
    case "ceded":
      return us(e.n)
        ? `${P(e.p)} is ours by treaty.`
        : us(e.from)
          ? `We gave up ${P(e.p)} to ${N(e.n)}.`
          : null;
    case "razed":
      return us(e.from)
        ? `${N(e.n)} burned ${P(e.p)}!`
        : us(e.n)
          ? `Our warriors burned ${P(e.p)}.`
          : null;
    case "war":
      return us(e.n)
        ? `We declared war on ${N(e.on)} (${e.why}).`
        : us(e.on)
          ? `${N(e.n)} declared war on us! (${e.why})`
          : `${N(e.n)} went to war with ${N(e.on)}.`;
    case "peace":
      return us(e.n) || us(e.with)
        ? `Peace with ${N(us(e.n) ? e.with : e.n)}.`
        : null;
    case "offer":
      return us(e.to) ? `${N(e.n)} offers peace terms.` : null;
    case "refused":
      return us(e.n) ? `${N(e.by)} refused our offer.` : null;
    case "treaty":
      return us(e.n) || us(e.with)
        ? `${TREATY_NAMES[e.t]} signed with ${N(us(e.n) ? e.with : e.n)}.`
        : null;
    case "untreaty":
      return us(e.n) || us(e.with)
        ? `${TREATY_NAMES[e.t]} with ${N(us(e.n) ? e.with : e.n)} is over.`
        : null;
    case "bought":
      return us(e.n)
        ? `We bought ${P(e.p)} from the ${N(e.from)} for ${e.gold} gold.`
        : null;
    case "gift":
      return us(e.to) ? `${N(e.n)} sent us ${e.gold} gold.` : null;
    case "fallen":
      return `${N(e.n)} has fallen.`;
    case "colonists":
      return us(e.n)
        ? `${e.count} settlers landed from ${s.nations[e.n].name.replace(/^the /, "the ")}.`
        : null;
    case "convoy":
      return us(e.n)
        ? e.out
          ? `Our convoy sold its cargo in Europe (merchants ${e.gold >= 0 ? "made" : "lost"} ${Math.abs(e.gold)} gold).`
          : `A convoy arrived from Europe with goods worth ${Math.abs(e.gold)} gold more than they cost.`
        : null;
    case "revolt":
      return us(e.n) ? `${P(e.p)} is in open revolt!` : null;
    case "died":
      return us(e.n)
        ? `${C(e.c)} died of ${e.cause}.`
        : s.nations[e.n]?.kind === "power" && s.nations[e.n].ruler === e.c
          ? `${N(e.n)}'s governor ${C(e.c)} has died.`
          : null;
    case "born":
      return us(e.n) ? `${C(e.c)} was born.` : null;
    case "married":
      return us(e.n) ? `${C(e.a)} married ${C(e.b)}.` : null;
    case "succession":
      return us(e.n)
        ? `${C(e.c)} now governs (${e.how}).`
        : s.nations[e.n]?.kind === "power"
          ? `${N(e.n)} has a new governor: ${C(e.c)}.`
          : null;
    case "scheme": {
      if (!us(e.n)) return null;
      const what = {
        slander: "slander us at court",
        embezzle: "embezzle from the treasury",
        incite: "stir up trouble",
        murder: "murder the governor",
      }[e.s];
      return e.done
        ? `${C(e.c)}'s plot to ${what} has succeeded!`
        : `Our spymaster has caught ${C(e.c)} plotting to ${what}.`;
    }
    case "story":
      return us(e.n) ? `${e.title}: ${e.text}` : null;
    case "crown":
      return us(e.n) ? e.text : null;
    case "europe":
      return e.war
        ? `War in Europe: ${N(e.a)} and ${N(e.b)}.`
        : `Peace in Europe between ${N(e.a)} and ${N(e.b)}.`;
    case "independence":
      if (e.won === null)
        return us(e.n)
          ? "We have declared independence!"
          : `${N(e.n)} has declared independence from its crown!`;
      return e.won
        ? `${N(e.n)} has won its independence!`
        : `${N(e.n)}'s rebellion was crushed.`;
    case "over":
      return `The game is over. ${N(e.winner)} wins.`;
  }
}

export function dateText(day: number): string {
  return formatDate(day);
}

export const TITLE_TEXT = TITLE_NAMES;
