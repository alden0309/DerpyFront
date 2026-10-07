// Words for Derpy Conquest's interface: names, numbers and what each game
// event means for the player.

import type {
  BuildingKind,
  GameEvent,
  GameState,
  Good,
  MapDef,
  RegType,
  Terrain,
} from "../engine/Types";

export const GOOD_NAMES: Record<Good, string> = {
  tobacco: "Tobacco",
  sugar: "Sugar",
  furs: "Furs",
  silver: "Silver",
  cotton: "Cotton",
  grain: "Grain",
  fish: "Fish",
  timber: "Timber",
  cattle: "Cattle",
};

export const GOOD_ICONS: Record<Good, string> = {
  tobacco: "🍂",
  sugar: "🍬",
  furs: "🦫",
  silver: "🥈",
  cotton: "☁️",
  grain: "🌾",
  fish: "🐟",
  timber: "🪵",
  cattle: "🐄",
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

export const REG_NAMES: Record<RegType, string> = {
  inf: "Infantry",
  cav: "Cavalry",
  art: "Artillery",
  war: "Warriors",
  horse: "Horse warriors",
};

export const REG_SHORT: Record<RegType, string> = {
  inf: "Inf",
  cav: "Cav",
  art: "Art",
  war: "War",
  horse: "Horse",
};

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  farm: "Farm",
  port: "Port",
  fort: "Fort",
};

export const BUILDING_HELP: Record<BuildingKind, string> = {
  farm: "Settlers grow faster and the province holds more of them.",
  port: "Goods from here and your land joined to it sell at full price. Lets you raise artillery.",
  fort: "Defenders fight harder here and sieges take far longer.",
};

/** A nation's name with a capital letter, for titles and tables. */
export function nationName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function num(n: number): string {
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function gold(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r >= 0 ? "+" : ""}${r}`;
}

export interface LogLine {
  text: string;
  /** About the player's own nation. */
  mine: boolean;
  /** Worth interrupting for (wars, attacks, battles involving you). */
  alert: boolean;
  tone: "good" | "bad" | "neutral";
  prov?: number;
  battle?: number;
}

export function describeEvent(
  s: GameState,
  map: MapDef,
  e: GameEvent,
  me: number,
): LogLine | null {
  const line = describe(s, map, e, me);
  if (line) line.text = line.text.charAt(0).toUpperCase() + line.text.slice(1);
  return line;
}

function describe(
  s: GameState,
  map: MapDef,
  e: GameEvent,
  me: number,
): LogLine | null {
  const name = (n: number) => (n === me ? "You" : (s.nations[n]?.name ?? "?"));
  const pname = (p: number) => map.provinces[p]?.name ?? "?";
  const isMe = (n: number) => n === me;
  switch (e.k) {
    case "colony":
      return {
        text: isMe(e.n)
          ? `New colony founded at ${pname(e.p)}.`
          : `${name(e.n)} settled ${pname(e.p)}.`,
        mine: isMe(e.n),
        alert: false,
        tone: isMe(e.n) ? "good" : "neutral",
        prov: e.p,
      };
    case "built":
      if (!isMe(e.n)) return null;
      return {
        text: `${BUILDING_NAMES[e.b]}${e.lvl > 1 ? ` (level ${e.lvl})` : ""} finished at ${pname(e.p)}.`,
        mine: true,
        alert: false,
        tone: "good",
        prov: e.p,
      };
    case "raised":
      if (!isMe(e.n)) return null;
      return {
        text: `${REG_NAMES[e.t]} raised at ${pname(e.p)}.`,
        mine: true,
        alert: false,
        tone: "good",
        prov: e.p,
      };
    case "battle": {
      const mine = e.a.includes(me) || e.d.includes(me);
      const won =
        (e.w === 0 && e.a.includes(me)) || (e.w === 1 && e.d.includes(me));
      const winners = e.w === 0 ? e.a : e.d;
      const losers = e.w === 0 ? e.d : e.a;
      return {
        text: mine
          ? `Battle of ${pname(e.p)}: ${won ? "victory" : "defeat"}!`
          : `Battle of ${pname(e.p)}: ${winners.map(name).join(", ")} beat ${losers.map(name).join(", ")}.`,
        mine,
        alert: mine,
        tone: mine ? (won ? "good" : "bad") : "neutral",
        prov: e.p,
        battle: e.id,
      };
    }
    case "siege":
      if (isMe(e.n))
        return {
          text: `Your army has laid siege to ${pname(e.p)}.`,
          mine: true,
          alert: false,
          tone: "neutral",
          prov: e.p,
        };
      if (isMe(e.from))
        return {
          text: `${name(e.n)} is besieging ${pname(e.p)}!`,
          mine: true,
          alert: true,
          tone: "bad",
          prov: e.p,
        };
      return null;
    case "captured":
      return {
        text: isMe(e.n)
          ? `You took ${pname(e.p)} from ${name(e.from)}.`
          : isMe(e.from)
            ? `${name(e.n)} took ${pname(e.p)} from you!`
            : `${name(e.n)} took ${pname(e.p)} from ${name(e.from)}.`,
        mine: isMe(e.n) || isMe(e.from),
        alert: isMe(e.from),
        tone: isMe(e.n) ? "good" : isMe(e.from) ? "bad" : "neutral",
        prov: e.p,
      };
    case "razed":
      return {
        text: isMe(e.from)
          ? `${name(e.n)} burned your colony at ${pname(e.p)}!`
          : `${name(e.n)} burned the ${s.nations[e.from]?.adjective ?? ""} colony at ${pname(e.p)}.`,
        mine: isMe(e.from),
        alert: isMe(e.from),
        tone: isMe(e.from) ? "bad" : "neutral",
        prov: e.p,
      };
    case "war":
      return {
        text: isMe(e.on)
          ? `${name(e.n)} declared war on you!`
          : isMe(e.n)
            ? `You declared war on ${name(e.on)}.`
            : `${name(e.n)} declared war on ${name(e.on)}.`,
        mine: isMe(e.n) || isMe(e.on),
        alert: isMe(e.on),
        tone: isMe(e.on) ? "bad" : "neutral",
      };
    case "peace":
      return {
        text:
          isMe(e.n) || isMe(e.with)
            ? `Peace with ${name(isMe(e.n) ? e.with : e.n)}.`
            : `${name(e.n)} and ${name(e.with)} made peace.`,
        mine: isMe(e.n) || isMe(e.with),
        alert: isMe(e.n) || isMe(e.with),
        tone: "good",
      };
    case "offer":
      if (isMe(e.to))
        return {
          text: `${name(e.n)} offers peace.`,
          mine: true,
          alert: true,
          tone: "good",
        };
      if (isMe(e.n))
        return {
          text: `You offered ${name(e.to)} peace.`,
          mine: true,
          alert: false,
          tone: "neutral",
        };
      return null;
    case "refused":
      if (isMe(e.n))
        return {
          text: `${name(e.by)} refused peace.`,
          mine: true,
          alert: true,
          tone: "bad",
        };
      return null;
    case "trade":
      if (!isMe(e.n)) return null;
      return {
        text: `Trade deal signed with ${name(e.with)}.`,
        mine: true,
        alert: false,
        tone: "good",
      };
    case "untrade":
      if (!isMe(e.n)) return null;
      return {
        text: `Trade with ${name(e.with)} ended.`,
        mine: true,
        alert: false,
        tone: "neutral",
      };
    case "bought":
      return {
        text: isMe(e.n)
          ? `You bought ${pname(e.p)} from ${name(e.from)} for ${e.gold} gold.`
          : `${name(e.n)} bought ${pname(e.p)} from ${name(e.from)}.`,
        mine: isMe(e.n),
        alert: false,
        tone: isMe(e.n) ? "good" : "neutral",
        prov: e.p,
      };
    case "gift":
      if (!isMe(e.n)) return null;
      return {
        text: `${name(e.to)} accepted your gift of ${e.gold} gold.`,
        mine: true,
        alert: false,
        tone: "good",
      };
    case "fallen":
      return {
        text: isMe(e.n)
          ? "Your nation has fallen."
          : `${name(e.n)} has fallen to ${name(e.by)}.`,
        mine: isMe(e.n),
        alert: true,
        tone: isMe(e.n) ? "bad" : "neutral",
      };
    case "colonist":
      if (!isMe(e.n)) return null;
      return {
        text: "A ship of colonists has arrived, ready to settle.",
        mine: true,
        alert: false,
        tone: "good",
      };
    case "angry":
      if (!isMe(e.at)) return null;
      return {
        text: `The ${s.nations[e.n]?.name ?? "natives"} are growing angry with you. Gifts or trade would calm them; left alone, they may raid.`,
        mine: true,
        alert: true,
        tone: "bad",
      };
    case "broke":
      if (!isMe(e.n)) return null;
      return {
        text: "Your treasury is empty! Unpaid troops are losing heart.",
        mine: true,
        alert: true,
        tone: "bad",
      };
    case "over":
      return {
        text: `The game is over. ${s.nations[e.winner]?.name ?? "?"} wins!`,
        mine: true,
        alert: true,
        tone: "neutral",
      };
  }
  return null;
}
