// Local government. Every county (province) of a colony has its offices:
// justices of the peace and a sheriff the governor appoints, a constable and
// a captain of the watch the county court names, selectmen, a mayor, a
// burgess and churchwardens the freeholders elect. Native towns have their
// own: the council, a war captain, a speaker, a sachem, the clan mothers.
// Each has a duty to do, a lever or two, fees, renown, and leads on to the
// assembly, the council and the governor's chair.

import { Explain } from "./Explain";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  milestone,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import {
  Check,
  isChildLife,
  isNativeChar,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  placesIn,
  skillLevel,
  yes,
} from "./LifeQueries";
import { ROLES, SKILL_NAMES } from "./LifeRules";
import type { World } from "./Map";
import { ageOf, charName, settlers, stat } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { dice, hash01, officesIn, society } from "./SocietyCore";
import type {
  Breakdown,
  Character,
  GameState,
  Life,
  LocalOffice,
  OfficeKey,
  PlaceKind,
  Skill,
} from "./Types";

export type OfficeHow = "elected" | "governor" | "court" | "council" | "clan";

export interface OfficeDef {
  key: OfficeKey;
  native: boolean;
  name: string;
  how: OfficeHow;
  /** Years between elections. */
  years: number;
  /** Coins a month in fees and salary. */
  pay: number;
  /** Renown a month while held. */
  renown: number;
  /** For the tally: 1 a county's great office, 0 a lesser one. */
  level: number;
  /** Who may hold it. */
  sex?: "men" | "women";
  minAge: number;
  /** Renown it takes, or a skill at a level instead. */
  needRenown: number;
  orSkill?: [Skill, number];
  /** Needs a freeholder (land, a house, a trade of your own, or 40 coins). */
  freehold?: boolean;
  /** Christians only (a church office). */
  church?: boolean;
  /** The skill it tests, for appointments and duty. */
  skill: Skill;
  place: PlaceKind[];
  text: string;
  duty: {
    label: string;
    text: string;
    xp: Partial<Record<Skill, number>>;
    fee?: number;
    /** Unrest in the province, a temporary easing. */
    calm?: number;
  };
  lever?: {
    key: string;
    label: string;
    text: string;
    cooldown: number;
    /** Picks someone (a local). */
    who?: boolean;
  };
  /** What it leads to, in words. */
  step: string;
  /** Weight toward the governor's chair and the assembly. */
  score: number;
}

export const OFFICES: Record<OfficeKey, OfficeDef> = {
  watch: {
    key: "watch",
    native: false,
    name: "Captain of the watch",
    how: "court",
    years: 0,
    pay: 1,
    renown: 0.1,
    level: 0,
    sex: "men",
    minAge: 18,
    needRenown: 3,
    orSkill: ["fighting", 5],
    skill: "fighting",
    place: ["tavern", "market"],
    text: "Lanterns, a rattle and a dozen sleepy men: the town's peace from dusk to dawn.",
    duty: {
      label: "Walk the rounds",
      text: "Lantern, rattle and staff, from the tavern door to the wharf. Quieter streets.",
      xp: { fighting: 5, stealth: 3 },
      calm: 1,
    },
    lever: {
      key: "blind",
      label: "Look the other way",
      text: "A smuggler's cart, a gaming room: a few coins to see nothing. Someone may notice.",
      cooldown: 60,
    },
    step: "The justices notice a watch well kept: constable, then the bench.",
    score: 2,
  },
  constable: {
    key: "constable",
    native: false,
    name: "Constable",
    how: "court",
    years: 0,
    pay: 1.5,
    renown: 0.15,
    level: 0,
    sex: "men",
    minAge: 21,
    needRenown: 5,
    orSkill: ["fighting", 6],
    skill: "fighting",
    place: ["tavern", "market"],
    text: "The king's peace in one man and a staff: warrants, hue and cry, the stocks.",
    duty: {
      label: "Keep the king's peace",
      text: "Break up a brawl, serve a warrant, put a drunk in the stocks.",
      xp: { fighting: 5, persuasion: 3 },
      calm: 2,
    },
    lever: {
      key: "arrest",
      label: "Arrest a troublemaker",
      text: "Take up someone the town would be quieter without. They won't forget it.",
      cooldown: 90,
      who: true,
    },
    step: "A constable who keeps order is made a justice in time.",
    score: 3,
  },
  selectman: {
    key: "selectman",
    native: false,
    name: "Selectman",
    how: "elected",
    years: 1,
    pay: 1,
    renown: 0.25,
    level: 0,
    sex: "men",
    minAge: 21,
    needRenown: 8,
    freehold: true,
    skill: "persuasion",
    place: ["tavern", "church"],
    text: "Chosen by the freeholders at town meeting to see to roads, fences, the poor and the pound.",
    duty: {
      label: "Sit at the town meeting",
      text: "Fences, hogs, the road to the mill, and who pays for the new bell.",
      xp: { persuasion: 5, letters: 2 },
      calm: 1,
    },
    lever: {
      key: "works",
      label: "Propose a town work (15)",
      text: "A bridge, a pound, a schoolhouse: 15 coins of your own toward it, and the town's thanks.",
      cooldown: 365,
    },
    step: "A selectman the town trusts stands next for burgess.",
    score: 4,
  },
  mayor: {
    key: "mayor",
    native: false,
    name: "Mayor",
    how: "elected",
    years: 1,
    pay: 3,
    renown: 0.45,
    level: 1,
    sex: "men",
    minAge: 25,
    needRenown: 20,
    freehold: true,
    skill: "leadership",
    place: ["governor", "market"],
    text: "Head of the town's corporation: its markets, its courts, its feasts and its debts.",
    duty: {
      label: "Preside over the corporation",
      text: "Gown, chain and a long table of aldermen. The town's business, and its quarrels.",
      xp: { leadership: 5, persuasion: 4 },
      fee: 1,
      calm: 1,
    },
    lever: {
      key: "market",
      label: "Proclaim a market day",
      text: "A weekly market by charter: trade comes to town, and so does your name.",
      cooldown: 365,
    },
    step: "Mayors sit at the governor's table: a council seat is a short step.",
    score: 8,
  },
  justice: {
    key: "justice",
    native: false,
    name: "Justice of the peace",
    how: "governor",
    years: 0,
    pay: 2,
    renown: 0.3,
    level: 1,
    sex: "men",
    minAge: 25,
    needRenown: 12,
    orSkill: ["letters", 8],
    skill: "letters",
    place: ["governor", "tavern"],
    text: "The county court: debts, trespass, bastardy, the price of ale and the roads. The governor's commission.",
    duty: {
      label: "Hold the quarter sessions",
      text: "Four times a year the county comes to be judged, fined, bound over and sent home.",
      xp: { letters: 5, persuasion: 4 },
      fee: 1.5,
      calm: 1,
    },
    lever: {
      key: "dispute",
      label: "Settle a dispute",
      text: "Find for one neighbour against another. The winner is grateful; the loser isn't.",
      cooldown: 60,
      who: true,
    },
    step: "The bench is where governors find their sheriffs and councillors.",
    score: 7,
  },
  sheriff: {
    key: "sheriff",
    native: false,
    name: "Sheriff",
    how: "governor",
    years: 0,
    pay: 3,
    renown: 0.3,
    level: 1,
    sex: "men",
    minAge: 25,
    needRenown: 15,
    skill: "persuasion",
    place: ["governor", "tavern"],
    text: "Writs, juries, the jail, the gallows and the elections: the county's executive arm, and its fees.",
    duty: {
      label: "Serve writs and collect fees",
      text: "Ride the county with a satchel of writs. Every one served is a fee.",
      xp: { persuasion: 3, stealth: 3, woodcraft: 2 },
      fee: 2,
    },
    lever: {
      key: "seize",
      label: "Seize a debtor's goods",
      text: "The law allows it, and a sheriff takes his fee from the sale. The debtor's family won't love you.",
      cooldown: 90,
      who: true,
    },
    step: "A sheriff runs the county's elections, and is remembered at the next one.",
    score: 7,
  },
  lieutenant: {
    key: "lieutenant",
    native: false,
    name: "County lieutenant",
    how: "governor",
    years: 0,
    pay: 2,
    renown: 0.4,
    level: 1,
    sex: "men",
    minAge: 25,
    needRenown: 15,
    orSkill: ["leadership", 8],
    skill: "leadership",
    place: ["fort", "fields"],
    text: "Colonel of the county's militia: musters, powder, and the call when trouble comes.",
    duty: {
      label: "Muster the militia",
      text: "Every man sixteen to sixty on the green with a firelock, or a good excuse.",
      xp: { leadership: 6, fighting: 3 },
    },
    lever: {
      key: "callout",
      label: "Call out the militia",
      text: "Raise a regiment of the county's men for the colony, from its treasury. Only in time of war.",
      cooldown: 365,
    },
    step: "Command of the county's men leads to the marshal's seat on the council.",
    score: 7,
  },
  burgess: {
    key: "burgess",
    native: false,
    name: "Burgess",
    how: "elected",
    years: 2,
    pay: 2,
    renown: 0.5,
    level: 1,
    sex: "men",
    minAge: 21,
    needRenown: 15,
    freehold: true,
    skill: "persuasion",
    place: ["tavern", "governor"],
    text: "The county's member in the colony's assembly, chosen by its freeholders at the courthouse door.",
    duty: {
      label: "Hear your constituents",
      text: "Complaints about the roads, the Indians, the parson and the price of tobacco. Write them down.",
      xp: { persuasion: 5, letters: 3 },
    },
    lever: {
      key: "bill",
      label: "Introduce a bill",
      text: "A bill for the county: roads, a ferry, a bounty on wolves. Passed or not, it's your name on it.",
      cooldown: 180,
    },
    step: "A burgess sits in the assembly: the governor's court and council are next.",
    score: 9,
  },
  collector: {
    key: "collector",
    native: false,
    name: "Collector of the rates",
    how: "governor",
    years: 0,
    pay: 1,
    renown: 0.1,
    level: 0,
    sex: "men",
    minAge: 21,
    needRenown: 4,
    orSkill: ["trade", 6],
    skill: "trade",
    place: ["market"],
    text: "Quitrents, the county levy and the tithes: collected, recorded, and (mostly) handed over.",
    duty: {
      label: "Collect the rates",
      text: "A ledger, a horse and a thick skin. A commission on everything gathered.",
      xp: { trade: 4, letters: 3 },
      fee: 2,
    },
    lever: {
      key: "skim",
      label: "Skim the rates",
      text: "A little off the top. Everyone does it. Not everyone gets caught.",
      cooldown: 120,
    },
    step: "An honest collector is rare enough that the governor notices.",
    score: 3,
  },
  warden: {
    key: "warden",
    native: false,
    name: "Churchwarden",
    how: "elected",
    years: 1,
    pay: 0.5,
    renown: 0.2,
    level: 0,
    sex: "men",
    minAge: 21,
    needRenown: 5,
    orSkill: ["faith", 5],
    church: true,
    skill: "faith",
    place: ["church"],
    text: "The parish's purse and conscience: the poor, the pews, the bell and the bastardy fines.",
    duty: {
      label: "Keep the parish",
      text: "Count the plate, mend the pews, see the poor fed and the sinners presented.",
      xp: { faith: 5, letters: 2 },
      calm: 1,
    },
    lever: {
      key: "relief",
      label: "Relieve the poor (6)",
      text: "Six coins of your own for bread and firewood. The parish will remember.",
      cooldown: 120,
    },
    step: "The vestry is where a county's gentlemen meet: the bench follows.",
    score: 3,
  },
  council: {
    key: "council",
    native: true,
    name: "Town council",
    how: "elected",
    years: 4,
    pay: 0.5,
    renown: 0.3,
    level: 0,
    minAge: 25,
    needRenown: 8,
    skill: "persuasion",
    place: ["councilfire"],
    text: "A place at the town's fire, where everything is talked over until everyone agrees.",
    duty: {
      label: "Sit at the council",
      text: "Talk it over, and over, until there's one mind. It takes days.",
      xp: { persuasion: 5, leadership: 2 },
      calm: 1,
    },
    step: "The council chooses the speaker and the war captain from among its own.",
    score: 4,
  },
  warcaptain: {
    key: "warcaptain",
    native: true,
    name: "War captain",
    how: "council",
    years: 0,
    pay: 0.5,
    renown: 0.5,
    level: 0,
    sex: "men",
    minAge: 21,
    needRenown: 10,
    orSkill: ["fighting", 8],
    skill: "fighting",
    place: ["councilfire", "woods"],
    text: "Leads the young men when the council decides on war, and keeps them quiet when it doesn't.",
    duty: {
      label: "Lead the young men out",
      text: "Hunting, scouting the paths, a ball game that's half a war.",
      xp: { fighting: 4, leadership: 4, woodcraft: 2 },
    },
    lever: {
      key: "raid",
      label: "Lead a raid",
      text: "Horses and honour from an old enemy. Glory, if it goes well.",
      cooldown: 180,
    },
    step: "A war captain of renown is chosen war chief at the council fire.",
    score: 6,
  },
  speaker: {
    key: "speaker",
    native: true,
    name: "Speaker",
    how: "council",
    years: 0,
    pay: 0.5,
    renown: 0.4,
    level: 0,
    minAge: 25,
    needRenown: 8,
    orSkill: ["persuasion", 8],
    skill: "persuasion",
    place: ["councilfire"],
    text: "The town's voice at treaties and councils: carries its words, and its wampum.",
    duty: {
      label: "Speak for the town",
      text: "Carry the council's words to the next town, belts and strings in hand.",
      xp: { persuasion: 6, letters: 2 },
    },
    lever: {
      key: "belt",
      label: "Carry a wampum belt to the elders",
      text: "A belt of your own making, and words to go with it: the elders' regard grows.",
      cooldown: 180,
    },
    step: "Speakers sit at the nation's council fire when it chooses.",
    score: 6,
  },
  sachem: {
    key: "sachem",
    native: true,
    name: "Town sachem",
    how: "clan",
    years: 0,
    pay: 1.5,
    renown: 0.6,
    level: 1,
    minAge: 25,
    needRenown: 20,
    skill: "leadership",
    place: ["councilfire", "village"],
    text: "The town's peace chief, raised up by the clan mothers: gives more than they take, or doesn't last.",
    duty: {
      label: "Hear disputes and give gifts",
      text: "A sachem's lodge is never empty and never closed. What comes in goes out again.",
      xp: { persuasion: 4, leadership: 5 },
      calm: 2,
    },
    step: "A town sachem of renown may be chosen to lead the whole nation.",
    score: 12,
  },
  clanmother: {
    key: "clanmother",
    native: true,
    name: "Clan mother",
    how: "clan",
    years: 0,
    pay: 1,
    renown: 0.5,
    level: 1,
    sex: "women",
    minAge: 35,
    needRenown: 8,
    skill: "persuasion",
    place: ["village"],
    text: "Keeper of the clan's names and fields; she raises sachems up, and takes their horns away.",
    duty: {
      label: "Counsel the clan",
      text: "The fields, the names of the dead, the young people's marriages, and the sachem's manners.",
      xp: { persuasion: 4, farming: 3, medicine: 2 },
      calm: 1,
    },
    lever: {
      key: "raise",
      label: "Raise up a sachem",
      text: "Name the town's sachem from among the worthy, when the seat is empty, or take the horns from one who fails.",
      cooldown: 365,
      who: true,
    },
    step: "The clan mothers' word decides who leads.",
    score: 10,
  },
  founder: {
    key: "founder",
    native: false,
    name: "Proprietor",
    how: "governor",
    years: 0,
    pay: 3,
    renown: 0.6,
    level: 1,
    minAge: 18,
    needRenown: 0,
    skill: "leadership",
    place: ["fields", "village", "tavern", "governor"],
    text: "Founder of the settlement: you hold its land, name its officers and answer for it.",
    duty: {
      label: "See to the settlement",
      text: "Lay out lots, settle quarrels, count the corn, write to whoever must be written to.",
      xp: { leadership: 5, farming: 3 },
      calm: 2,
    },
    step: "A settlement that grows makes its founder a name at the capital.",
    score: 12,
  },
};

/** What each people calls them, where it differs. */
const TITLES: Partial<Record<string, Partial<Record<OfficeKey, string>>>> = {
  french: {
    watch: "Capitaine du guet",
    constable: "Huissier",
    selectman: "Syndic",
    mayor: "Maire",
    justice: "Juge seigneurial",
    sheriff: "Prévôt",
    lieutenant: "Capitaine de milice",
    burgess: "Député",
    collector: "Receveur",
    warden: "Marguillier",
    founder: "Seigneur",
  },
  spanish: {
    watch: "Alguacil de ronda",
    constable: "Alguacil",
    selectman: "Regidor",
    mayor: "Alcalde",
    justice: "Alcalde ordinario",
    sheriff: "Alguacil mayor",
    lieutenant: "Capitán de milicias",
    burgess: "Procurador",
    collector: "Recaudador",
    warden: "Mayordomo",
    founder: "Adelantado",
  },
  dutch: {
    watch: "Captain of the rattle-watch",
    constable: "Court messenger",
    selectman: "Schepen",
    mayor: "Burgomaster",
    justice: "Schepen of the court",
    sheriff: "Schout",
    lieutenant: "Captain of the burgher guard",
    burgess: "Delegate",
    collector: "Receiver",
    warden: "Deacon",
    founder: "Patroon",
  },
  swedish: {
    constable: "Länsman",
    justice: "Nämndeman",
    founder: "Commander",
  },
  powhatan: { sachem: "Werowance", warcaptain: "Cockarouse" },
  muscogee: { sachem: "Mico", warcaptain: "Tustenuggee" },
  choctaw: { sachem: "Mingo", warcaptain: "Tishu minko" },
  chickasaw: { sachem: "Minko", warcaptain: "Tishu minko" },
  haudenosaunee: { sachem: "Hoyaneh", clanmother: "Gantowisas" },
  cherokee: { sachem: "Uku", clanmother: "Beloved Woman" },
};

/** An office's name among the people who hold the county. */
export function officeName(s: GameState, o: LocalOffice): string {
  const n = s.nations[o.nation];
  const religion = n?.religion;
  if (n?.kind === "power" && religion === "puritan") {
    if (o.key === "burgess") return "Deputy to the General Court";
    if (o.key === "warden") return "Deacon";
  } else if (n?.kind === "power" && n.culture === "english") {
    if (o.key === "selectman") return "Alderman";
  }
  return TITLES[n?.culture ?? ""]?.[o.key] ?? OFFICES[o.key].name;
}

export function officeTitle(s: GameState, w: World, o: LocalOffice): string {
  return `${officeName(s, o)} of ${w.map.provinces[o.prov]?.name ?? "somewhere"}`;
}

// ---------------------------------------------------------------- which offices a county has

export function officeKeysFor(s: GameState, w: World, p: number): OfficeKey[] {
  const pr = s.provinces[p];
  const n = pr?.owner >= 0 ? s.nations[pr.owner] : undefined;
  if (!n?.alive) return [];
  if (n.kind === "native")
    return ["council", "warcaptain", "speaker", "sachem", "clanmother"];
  if (n.kind !== "power") return [];
  const folk = settlers(pr);
  if (folk < 50) return [];
  const out: OfficeKey[] = [
    "justice",
    "sheriff",
    "lieutenant",
    "burgess",
    "collector",
    "constable",
  ];
  if (placesIn(s, w, p).includes("church")) out.push("warden");
  if (folk >= 400) out.push("selectman", "watch");
  if (folk >= 1500 || n.capital === p) out.push("mayor");
  return out;
}

/** The offices of a county, made (empty) the first time they're needed. */
export function ensureOffices(g: ConquestGame, p: number): LocalOffice[] {
  const s = g.s;
  const soc = society(g);
  const owner = s.provinces[p]?.owner ?? -1;
  let list = soc.offices[p];
  // The land changed hands: the old offices lapse.
  if (list && list.length && list[0].nation !== owner) {
    list = list.filter((o) => o.key === "founder" && o.nation === owner);
    soc.offices[p] = list;
    g.societyChanged(`o${p}`);
  }
  const keys = officeKeysFor(s, g.w, p);
  if (!keys.length) return list ?? [];
  list ??= soc.offices[p] = [];
  const have = new Set(list.map((o) => o.key));
  const r = dice(g);
  const made: LocalOffice[] = [];
  for (const key of keys) {
    if (have.has(key)) continue;
    const def = OFFICES[key];
    const o: LocalOffice = {
      id: g.nextId(),
      key,
      prov: p,
      nation: owner,
      holder: -1,
      since: s.day,
      election:
        def.how === "elected"
          ? s.day + r.int(30, def.years * DAYS_PER_YEAR)
          : -1,
      candidates: [],
      duty: s.day,
    };
    list.push(o);
    made.push(o);
    g.societyChanged(`o${p}`);
  }
  // A county has its officers already when you first come: its best people.
  for (const o of made) seatFirst(g, o);
  return list;
}

/** Whoever holds a new county office to begin with (someone of the county). */
function seatFirst(g: ConquestGame, o: LocalOffice): void {
  const s = g.s;
  if (o.key === "founder") return;
  const pool = householdsOf(s, o.prov).filter(
    (c) => npcEligible(s, c, o) && !localOfficesOf(s, c.id).length,
  );
  if (!pool.length) return;
  pool.sort((a, b) => npcFit(s, b, o) - npcFit(s, a, o) || a.id - b.id);
  o.holder = pool[0].id;
  o.since = s.day - 200;
  o.duty = s.day;
}

export function officeById(s: GameState, id: number): LocalOffice | undefined {
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) if (o.id === id) return o;
  return undefined;
}

/** Every local office someone holds. */
export function localOfficesOf(s: GameState, c: number): LocalOffice[] {
  if (c < 0) return [];
  const out: LocalOffice[] = [];
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list) if (o.holder === c) out.push(o);
  return out;
}

/** What local office adds to a case for higher things. */
export function localScore(s: GameState, c: number): number {
  return localOfficesOf(s, c).reduce((m, o) => m + OFFICES[o.key].score, 0);
}

// ---------------------------------------------------------------- who may hold it

function freeholder(s: GameState, life: Life): boolean {
  if ((life.property ?? []).length > 0) return true;
  if (life.job?.own) return true;
  if (life.background === "gentry") return true;
  return life.purse >= 40;
}

/** Can a played character hold (or stand for) an office at all. */
export function eligible(s: GameState, life: Life, o: LocalOffice): Check {
  const me = meOf(s, life);
  if (!me) return no("You're watching.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  const def = OFFICES[o.key];
  const nation = s.nations[o.nation];
  if (me.nation !== o.nation) return no("Only among your own people.");
  if (def.native !== isNativeChar(s, me))
    return no(
      def.native
        ? "That's an office of the native towns."
        : "A colony's office.",
    );
  if (def.sex === "men" && me.female) return no("Men only, in this century.");
  if (def.sex === "women" && !me.female) return no("A woman's office.");
  if (def.church && me.religion === "native") return no("A church office.");
  if (ageOf(s, me) < def.minAge) return no(`Not before ${def.minAge}.`);
  const sk = def.orSkill;
  const skillOk = sk ? skillLevel(s, life, sk[0]) >= sk[1] : false;
  if (life.renown < def.needRenown && !skillOk)
    return no(
      sk
        ? `Renown ${def.needRenown}, or ${SKILL_NAMES[sk[0]].toLowerCase()} ${sk[1]}.`
        : `Renown ${def.needRenown}.`,
    );
  if (def.freehold && !freeholder(s, life))
    return no(
      "Freeholders only: land, a house, a business of your own, or 40 coins.",
    );
  if (o.holder === me.id) return no("You hold it.");
  void nation;
  return yes;
}

function npcEligible(s: GameState, c: Character, o: LocalOffice): boolean {
  const def = OFFICES[o.key];
  if (!c.alive || c.abroad || s.lives.some((l) => l.c === c.id)) return false;
  if (c.nation !== o.nation && s.nations[c.nation]?.kind !== "native")
    return false;
  if (def.native !== isNativeChar(s, c)) return false;
  if (def.sex === "men" && c.female) return false;
  if (def.sex === "women" && !c.female) return false;
  if (def.church && c.religion === "native") return false;
  if (ageOf(s, c) < Math.max(21, def.minAge)) return false;
  // Labourers and soldiers don't sit on the bench.
  const status = c.role ? ROLES[c.role].status : 1;
  if (def.level >= 1 && status < 2 && !c.female) return false;
  return true;
}

/** How fit someone not played is for an office (to choose among them). */
function npcFit(s: GameState, c: Character, o: LocalOffice): number {
  const def = OFFICES[o.key];
  const status = c.role ? ROLES[c.role].status : 1;
  const st =
    def.skill === "fighting" || def.skill === "leadership"
      ? stat(s, c, "mar")
      : def.skill === "trade"
        ? stat(s, c, "ste")
        : def.skill === "faith"
          ? stat(s, c, "lea")
          : stat(s, c, "dip");
  return status * 3 + st + hash01(c.id, o.id) * 4;
}

/** Who chooses: the governor, the county's justice, the sachem or the clan mother. */
export function appointerOf(s: GameState, o: LocalOffice): number {
  const def = OFFICES[o.key];
  if (def.how === "elected") return -1;
  const list = officesIn(s, o.prov);
  const holderOf = (k: OfficeKey) => {
    const x = list.find((y) => y.key === k);
    const c = x ? s.chars[x.holder] : undefined;
    return c?.alive && !c.abroad ? c.id : -1;
  };
  // A founder names the officers of their own settlement.
  const founder = holderOf("founder");
  if (founder >= 0 && o.key !== "founder") return founder;
  const ruler = s.nations[o.nation]?.ruler ?? -1;
  if (def.how === "court") {
    const j = holderOf("justice");
    return j >= 0 ? j : ruler;
  }
  if (def.how === "council") {
    const sa = holderOf("sachem");
    return sa >= 0 ? sa : ruler;
  }
  if (def.how === "clan") {
    if (o.key === "sachem") {
      const cm = holderOf("clanmother");
      if (cm >= 0) return cm;
    }
    return ruler;
  }
  return ruler;
}

// ---------------------------------------------------------------- appointments

/** Would the appointer give you the office? */
export function seekAcceptance(
  s: GameState,
  life: Life,
  o: LocalOffice,
  by: Character,
  byLetter = false,
): Breakdown {
  const def = OFFICES[o.key];
  const op = opinionOf(s, by, life).total;
  const e = new Explain().add("Offices are given sparingly", -10);
  e.add(`What ${by.first} thinks of you (${op})`, Math.round(op / 2));
  const fame = Math.min(15, Math.floor(life.renown / 3));
  if (fame) e.add(`Your renown (${Math.floor(life.renown)})`, fame);
  const lvl = skillLevel(s, life, def.skill);
  e.add(
    `Your ${SKILL_NAMES[def.skill].toLowerCase()} (${lvl})`,
    Math.max(-10, Math.min(12, (lvl - 6) * 2)),
  );
  const holder = s.chars[o.holder];
  if (!holder?.alive || holder.abroad) e.add("The post stands empty", 12);
  else e.add(`${holder.first} ${holder.family} holds it now`, -25);
  if (def.how === "governor" && life.favor > 0)
    e.add("Favour at home", Math.min(10, Math.round(life.favor / 4)));
  if (life.patron === by.id) e.add("Your patron", 10);
  const held = localOfficesOf(s, life.c).length;
  if (held) e.add("You hold office already", -5 * held);
  if (life.scandal && life.scandal.until > s.day) e.add("The scandal", -15);
  if (byLetter) e.add("Asked by letter, not in person", -5);
  return e.done(0);
}

export function giveOffice(
  g: ConquestGame,
  o: LocalOffice,
  c: number,
  how: string,
): void {
  const s = g.s;
  const prev = s.chars[o.holder];
  o.holder = c;
  o.since = s.day;
  // A new officer may set to work at once.
  o.duty = s.day - 30;
  o.candidates = o.candidates.filter((x) => x.c !== c);
  g.societyChanged(`o${o.prov}`);
  const name = officeTitle(s, g.w, o);
  const life = lifeOfChar(s, c);
  if (life) {
    touchLife(g, life).tally.topOffice = Math.max(
      life.tally.topOffice,
      OFFICES[o.key].level,
    );
    addRenown(g, life, 2 + OFFICES[o.key].level * 3);
    journal(g, life, `You are ${name}, ${how}.`, "good");
    milestone(g, life, "office", `Became ${name}`, o.prov);
  }
  if (prev?.alive && prev.id !== c) {
    const pl = lifeOfChar(s, prev.id);
    if (pl)
      journal(
        g,
        pl,
        `You are no longer ${name}: ${charName(s.chars[c])} has it now.`,
        "bad",
      );
  }
}

/** Lose an office: dismissed, resigned, gone. */
export function vacate(g: ConquestGame, o: LocalOffice, why: string): void {
  const s = g.s;
  const c = s.chars[o.holder];
  o.holder = -1;
  o.since = s.day;
  g.societyChanged(`o${o.prov}`);
  const life = c ? lifeOfChar(s, c.id) : undefined;
  if (life)
    journal(
      g,
      life,
      `You are no longer ${officeTitle(s, g.w, o)}: ${why}.`,
      "bad",
    );
}

/** Fill an empty appointed office from the county's people (or leave it for a player appointer). */
function fillVacancy(g: ConquestGame, o: LocalOffice): void {
  const s = g.s;
  const by = appointerOf(s, o);
  const byLife = lifeOfChar(s, by);
  // A player who appoints gets a while to choose.
  if (byLife && s.day - o.since < 60) return;
  const pool = householdsOf(s, o.prov).filter((c) => npcEligible(s, c, o));
  if (!pool.length) return;
  // One office to a person, where the county has the people.
  const busy = (c: Character) => (localOfficesOf(s, c.id).length ? 1 : 0);
  pool.sort(
    (a, b) =>
      busy(a) - busy(b) || npcFit(s, b, o) - npcFit(s, a, o) || a.id - b.id,
  );
  const pick = pool[0];
  giveOffice(g, o, pick.id, "by appointment");
}

// ---------------------------------------------------------------- elections

/** Can you stand for an elected office now. */
export function standLocalCheck(
  s: GameState,
  life: Life,
  o: LocalOffice,
): Check {
  const def = OFFICES[o.key];
  if (def.how !== "elected") return no("It's given by appointment.");
  const e = eligible(s, life, o);
  if (!e.ok) return e;
  if (o.candidates.some((x) => x.c === life.c)) return no("You're standing.");
  const other = Object.values(s.society?.offices ?? {})
    .flat()
    .find((x) => x.candidates.some((y) => y.c === life.c));
  if (other) return no("You're standing for another office already.");
  if (o.election - s.day < 7) return no("Too late: the poll is upon us.");
  return yes;
}

/** Your standing at the next poll, and what makes it. */
export function pollStanding(
  s: GameState,
  life: Life,
  o: LocalOffice,
): Breakdown {
  const me = meOf(s, life)!;
  const e = new Explain().add("Your name on the list", 5, true);
  e.add(`Renown (${Math.floor(life.renown)})`, Math.round(life.renown * 0.4));
  e.add(
    `Persuasion (${skillLevel(s, life, "persuasion")})`,
    Math.round(skillLevel(s, life, "persuasion") * 0.6),
  );
  const pts = o.candidates.find((x) => x.c === me.id)?.points ?? 0;
  if (pts) e.add("Canvassing and treating", pts);
  // What the county's people think of you.
  const folk = householdsOf(s, o.prov)
    .filter((c) => c.id !== me.id && ageOf(s, c) >= 18)
    .slice(0, 10);
  if (folk.length) {
    const avg =
      folk.reduce((m, c) => m + opinionOf(s, c, life).total, 0) / folk.length;
    e.add(
      "The county's regard for you",
      Math.max(-12, Math.min(12, Math.round(avg / 4))),
    );
  }
  if (freeholder(s, life)) e.add("A freeholder", 4);
  if (o.holder === me.id) e.add("Sitting already", 6);
  if (life.home !== o.prov) e.add("You don't live in the county", -10);
  if (life.scandal && life.scandal.until > s.day) e.add("The scandal", -10);
  return e.done(0);
}

function npcPoll(
  s: GameState,
  c: Character,
  o: LocalOffice,
  sitting: boolean,
): number {
  const status = c.role ? ROLES[c.role].status : 1;
  return (
    status * 3 +
    stat(s, c, "dip") +
    hash01(c.id, o.id, o.election) * 8 +
    (sitting ? 6 : 0)
  );
}

/** The strongest rival you'd face (an estimate, for the card). */
export function pollRival(
  s: GameState,
  o: LocalOffice,
  except: number,
): { c: number; score: number } | null {
  const sitting = s.chars[o.holder];
  let best: { c: number; score: number } | null = null;
  if (sitting?.alive && sitting.id !== except && !lifeOfChar(s, sitting.id))
    best = { c: sitting.id, score: npcPoll(s, sitting, o, true) };
  for (const c of householdsOf(s, o.prov)) {
    if (c.id === except || c.id === sitting?.id || !npcEligible(s, c, o))
      continue;
    const sc = npcPoll(s, c, o, false);
    if (!best || sc > best.score) best = { c: c.id, score: sc };
  }
  return best;
}

function holdPoll(g: ConquestGame, o: LocalOffice): void {
  const s = g.s;
  const def = OFFICES[o.key];
  const field: { c: number; score: number }[] = [];
  const sitting = s.chars[o.holder];
  if (sitting?.alive && !sitting.abroad && !lifeOfChar(s, sitting.id))
    field.push({ c: sitting.id, score: npcPoll(s, sitting, o, true) });
  for (const x of o.candidates) {
    const life = lifeOfChar(s, x.c);
    if (!life || !eligible(s, life, { ...o, holder: -1 }).ok) continue;
    field.push({ c: x.c, score: pollStanding(s, life, o).total });
  }
  // A sitting player stands again.
  const sittingLife = sitting ? lifeOfChar(s, sitting.id) : undefined;
  if (sittingLife && !field.some((f) => f.c === sitting!.id))
    field.push({
      c: sitting!.id,
      score: pollStanding(s, sittingLife, o).total,
    });
  // Challengers from among the county's people.
  const pool = householdsOf(s, o.prov)
    .filter(
      (c) =>
        npcEligible(s, c, o) &&
        !field.some((f) => f.c === c.id) &&
        !localOfficesOf(s, c.id).length,
    )
    .sort(
      (a, b) =>
        npcPoll(s, b, o, false) - npcPoll(s, a, o, false) || a.id - b.id,
    )
    .slice(0, 2);
  for (const c of pool) field.push({ c: c.id, score: npcPoll(s, c, o, false) });
  const r = dice(g);
  for (const f of field) f.score += r.int(-3, 3);
  field.sort((a, b) => b.score - a.score || a.c - b.c);
  const players = o.candidates.map((x) => x.c);
  o.candidates = [];
  o.election = s.day + def.years * DAYS_PER_YEAR;
  g.societyChanged(`o${o.prov}`);
  const win = field[0];
  if (!win) return;
  const name = officeTitle(s, g.w, o);
  if (win.c !== o.holder) giveOffice(g, o, win.c, "elected by the freeholders");
  else {
    const life = lifeOfChar(s, win.c);
    if (life) journal(g, life, `Returned as ${name}.`, "good");
  }
  for (const c of players) {
    if (c === win.c) continue;
    const life = lifeOfChar(s, c);
    if (life) {
      journal(
        g,
        life,
        `You lost the poll for ${name} to ${charName(s.chars[win.c])}.`,
        "bad",
      );
      addStress(g, life, 4);
    }
  }
  if (o.key === "burgess") seatBurgess(g, o);
  rumour(g, o.prov, `${charName(s.chars[win.c])} is chosen ${name}.`, win.c);
}

/** A burgess sits in the colony's assembly (the weakest member gives way). */
function seatBurgess(g: ConquestGame, o: LocalOffice): void {
  const s = g.s;
  const pol = s.polities[o.nation];
  const c = s.chars[o.holder];
  if (!pol || !c?.alive || pol.assembly.includes(c.id)) return;
  const life = lifeOfChar(s, c.id);
  if (!life) return;
  if (pol.assembly.length >= pol.seats) {
    // The member with no county behind them makes room.
    const out = [...pol.assembly]
      .filter((x) => !lifeOfChar(s, x))
      .sort((a, b) => a - b)[0];
    if (out === undefined) return;
    pol.assembly = pol.assembly.filter((x) => x !== out);
  }
  pol.assembly = [...pol.assembly, c.id];
  g.politiesChanged(o.nation);
  touchLife(g, life).tally.topOffice = Math.max(life.tally.topOffice, 1);
  journal(g, life, `As burgess you take your seat in ${pol.name}.`, "good");
}

// ---------------------------------------------------------------- the months

export function officesMonthly(g: ConquestGame): void {
  const s = g.s;
  // Counties where someone plays (or has played) get their offices.
  const seen = new Set<number>();
  for (const life of s.lives) {
    if (life.c < 0) continue;
    seen.add(life.prov);
    seen.add(life.home);
  }
  for (const key of Object.keys(s.society?.offices ?? {}))
    seen.add(Number(key));
  for (const p of seen) {
    if (!s.locals[p]) continue;
    const list = ensureOffices(g, p);
    for (const o of list) {
      const c = s.chars[o.holder];
      if (o.holder >= 0 && (!c?.alive || c.abroad)) {
        o.holder = -1;
        o.since = s.day;
        g.societyChanged(`o${p}`);
      }
      const def = OFFICES[o.key];
      if (def.how === "elected") {
        if (s.day >= o.election) holdPoll(g, o);
        else if (o.holder < 0 && s.day - o.since > 90) {
          // A seat empty too long is filled at a special poll.
          o.election = Math.min(o.election, s.day + 30);
          g.societyChanged(`o${p}`);
        }
      } else if (o.holder < 0 && o.key !== "founder") fillVacancy(g, o);
      const life = lifeOfChar(s, o.holder);
      if (!life) continue;
      // Duty: neglect it long enough and you're out.
      const idle = s.day - o.duty;
      if (idle >= 240) {
        if (def.how === "elected") {
          addRenown(g, life, -3);
          journal(
            g,
            life,
            `The county grumbles that its ${officeName(s, o).toLowerCase()} is never seen.`,
            "bad",
          );
          o.duty = s.day - 120;
        } else if (o.key !== "founder") {
          vacate(g, o, "dismissed for neglecting the duty");
          addRenown(g, life, -2);
        }
      } else if (idle >= 150 && idle < 181)
        journal(
          g,
          life,
          `Your duties as ${officeTitle(s, g.w, o)} are being neglected. (${OFFICES[o.key].duty.label}, in the county.)`,
          "bad",
        );
      addRenown(g, life, def.renown);
    }
  }
}

// ---------------------------------------------------------------- what an officer does

/** Can you do an office's duty now. */
export function dutyCheck(s: GameState, life: Life, o: LocalOffice): Check {
  if (o.holder !== life.c) return no("It isn't yours.");
  if (life.travel) return no("You're on the road.");
  if (life.prov !== o.prov) return no("Go to the county.");
  const left = 30 - (s.day - o.duty);
  if (left > 0) return no(`Done this month (again in ${left} days).`);
  return yes;
}

export function doDuty(g: ConquestGame, life: Life, id: number): string | null {
  const s = g.s;
  const o = officeById(s, id);
  if (!o) return "No such office.";
  const check = dutyCheck(s, life, o);
  if (!check.ok) return check.why;
  const def = OFFICES[o.key];
  o.duty = s.day;
  g.societyChanged(`o${o.prov}`);
  for (const [k, v] of Object.entries(def.duty.xp))
    gainXp(g, life, k as Skill, v ?? 0);
  if (def.duty.fee) earn(g, life, def.duty.fee);
  if (def.duty.calm)
    calmCounty(g, o.prov, def.duty.calm, `${officeName(s, o)} at work`);
  addRenown(g, life, 0.4);
  journal(
    g,
    life,
    `${def.duty.label}: ${def.duty.text}${def.duty.fee ? ` (+${def.duty.fee} in fees)` : ""}`,
  );
  return null;
}

function calmCounty(
  g: ConquestGame,
  p: number,
  n: number,
  label: string,
): void {
  const s = g.s;
  const pr = g.prov(p);
  const key = `office-calm`;
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({ key, label, until: s.day + 60, fx: { unrest: -n } });
}

/** Can you pull an office's lever now. */
export function leverCheck(s: GameState, life: Life, o: LocalOffice): Check {
  const def = OFFICES[o.key];
  if (!def.lever) return no("Nothing to pull.");
  if (o.holder !== life.c) return no("It isn't yours.");
  if (life.travel) return no("You're on the road.");
  if (life.prov !== o.prov) return no("Go to the county.");
  const left = (life.cooldowns[`lever:${o.key}:${o.prov}`] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} days.`);
  switch (def.lever.key) {
    case "works":
      return life.purse >= 15 ? yes : no("It takes 15 coins.");
    case "relief":
      return life.purse >= 6 ? yes : no("It takes 6 coins.");
    case "callout": {
      const n = o.nation;
      return s.wars.some((w) => w.a === n || w.b === n)
        ? yes
        : no("Only in time of war.");
    }
    case "raise": {
      const sa = officesIn(s, o.prov).find((x) => x.key === "sachem");
      return sa ? yes : no("This town has no sachem's seat.");
    }
  }
  return yes;
}

/** People of the county you might pick for a lever (to arrest, find for, seize). */
export function leverTargets(
  s: GameState,
  life: Life,
  o: LocalOffice,
): Character[] {
  return householdsOf(s, o.prov)
    .filter((c) => c.id !== life.c && ageOf(s, c) >= 18 && !lifeOfChar(s, c.id))
    .slice(0, 16);
}

export function pullLever(
  g: ConquestGame,
  life: Life,
  id: number,
  arg?: number,
): string | null {
  const s = g.s;
  const o = officeById(s, id);
  if (!o) return "No such office.";
  const check = leverCheck(s, life, o);
  if (!check.ok) return check.why;
  const def = OFFICES[o.key];
  const lever = def.lever!;
  const me = meOf(s, life)!;
  const r = dice(g);
  const target = lever.who ? s.chars[arg ?? -1] : undefined;
  if (
    lever.who &&
    (!target?.alive ||
      !leverTargets(s, life, o).some((c) => c.id === target.id))
  )
    return "Choose someone of the county.";
  touchLife(g, life).cooldowns[`lever:${o.key}:${o.prov}`] =
    s.day + lever.cooldown;
  const here = g.map.provinces[o.prov].name;
  switch (lever.key) {
    case "blind": {
      earn(g, life, 4);
      gainXp(g, life, "stealth", 4);
      if (r.chance(0.25)) {
        addRenown(g, life, -2);
        rumour(
          g,
          o.prov,
          `The captain of the watch at ${here} can be bought, they say.`,
          me.id,
          "bad",
        );
        journal(
          g,
          life,
          "Four coins to see nothing, and somebody saw you seeing nothing.",
          "bad",
        );
      } else journal(g, life, "Four coins, and the cart rolls by in the dark.");
      return null;
    }
    case "arrest": {
      remembers(g, life, g.char(target!.id), "Had me arrested", -25, 4);
      addRenown(g, life, 2);
      calmCounty(g, o.prov, 3, "A troublemaker in the stocks");
      journal(
        g,
        life,
        `You take up ${charName(target)} and put them in the stocks. The town is quieter; ${target!.first} is not.`,
      );
      return null;
    }
    case "works": {
      spend(g, life, 15);
      const pr = g.prov(o.prov);
      pr.mods.push({
        key: `town-works-${s.day}`,
        label: "A town work",
        until: s.day + 5 * DAYS_PER_YEAR,
        fx: { production: 0.03, unrest: -1 },
      });
      addRenown(g, life, 3);
      for (const c of householdsOf(s, o.prov).slice(0, 8))
        remembers(g, life, c, "Built the town a bridge", 4, 3);
      journal(
        g,
        life,
        `A new bridge at ${here}, with your name on the board at the end of it.`,
        "good",
      );
      return null;
    }
    case "market": {
      const pr = g.prov(o.prov);
      pr.mods.push({
        key: `market-day`,
        label: "A chartered market day",
        until: s.day + 2 * DAYS_PER_YEAR,
        fx: { production: 0.05 },
      });
      addRenown(g, life, 3);
      journal(
        g,
        life,
        `Market day at ${here} every Thursday, by your proclamation. The carts come in from all over.`,
        "good",
      );
      return null;
    }
    case "dispute": {
      const others = leverTargets(s, life, o).filter(
        (c) => c.id !== target!.id,
      );
      const loser = others.length
        ? others[r.int(0, others.length - 1)]
        : undefined;
      remembers(g, life, g.char(target!.id), "Found for me at court", 15, 4);
      if (loser)
        remembers(
          g,
          life,
          g.char(loser.id),
          "Found against me at court",
          -10,
          3,
        );
      addRenown(g, life, 1);
      gainXp(g, life, "letters", 4);
      journal(
        g,
        life,
        `The bench finds for ${charName(target)}${loser ? ` against ${charName(loser)}` : ""}, over a boundary stone and a pig.`,
      );
      return null;
    }
    case "seize": {
      earn(g, life, 6);
      remembers(g, life, g.char(target!.id), "Seized my goods", -30, 5);
      for (const k of [target!.spouse, ...target!.children])
        if (s.chars[k]?.alive)
          remembers(g, life, g.char(k), "Seized our goods", -12, 3);
      addRenown(g, life, -1);
      journal(
        g,
        life,
        `You seize ${charName(target)}'s goods for debt and take your fee from the sale: +6 coins, and a family that hates you.`,
        "bad",
      );
      return null;
    }
    case "callout": {
      const pr = s.provinces[o.prov];
      if (pr.owner !== o.nation) return "The county isn't the colony's now.";
      const nation = g.nation(o.nation);
      if (nation.gold < 12) return "The colony's treasury can't arm them.";
      nation.gold -= 12;
      const army = s.armies.find(
        (a) => a.owner === o.nation && a.prov === o.prov && a.depart < 0,
      );
      const reg = {
        type: "militia" as const,
        men: 400,
        morale: 0.7,
        home: o.prov,
      };
      if (army) g.touch(army).regs.push(reg);
      else
        g.addArmy({
          id: g.nextId(),
          owner: o.nation,
          prov: o.prov,
          regs: [reg],
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
      addRenown(g, life, 3);
      gainXp(g, life, "leadership", 10);
      journal(
        g,
        life,
        `The drums beat across ${here}: four hundred militia muster under the county's colours.`,
        "good",
      );
      return null;
    }
    case "bill": {
      const pass = r.chance(0.35 + skillLevel(s, life, "persuasion") * 0.03);
      gainXp(g, life, "persuasion", 6);
      if (pass) {
        addRenown(g, life, 4);
        touchLife(g, life).favor = Math.min(100, life.favor + 3);
        journal(
          g,
          life,
          "Your bill for the county passes the house: a ferry, a road, and a bounty on wolves.",
          "good",
        );
      } else
        journal(
          g,
          life,
          "Your bill dies in committee, smothered in amendments.",
        );
      return null;
    }
    case "skim": {
      earn(g, life, 8);
      gainXp(g, life, "stealth", 5);
      const caught = r.chance(
        Math.max(0.1, 0.4 - skillLevel(s, life, "stealth") * 0.02),
      );
      if (caught) {
        vacate(g, o, "caught with a hand in the rates");
        addRenown(g, life, -5);
        touchLife(g, life).scandal = {
          until: s.day + DAYS_PER_YEAR,
          text: "Caught skimming the rates",
        };
        rumour(
          g,
          o.prov,
          `${charName(me)} was caught skimming the county rates.`,
          me.id,
          "bad",
        );
        journal(
          g,
          life,
          "Eight coins off the top, and the governor's auditor found every one.",
          "bad",
        );
      } else
        journal(
          g,
          life,
          "Eight coins off the top. The ledger balances, more or less.",
        );
      return null;
    }
    case "relief": {
      spend(g, life, 6);
      addRenown(g, life, 2);
      calmCounty(g, o.prov, 3, "The poor relieved");
      for (const c of householdsOf(s, o.prov).slice(0, 8))
        remembers(g, life, c, "Fed the poor", 4, 2);
      journal(
        g,
        life,
        "Bread and firewood for the poor of the parish, at your own charge.",
        "good",
      );
      return null;
    }
    case "raid": {
      const won = r.chance(0.4 + skillLevel(s, life, "fighting") * 0.025);
      gainXp(g, life, "fighting", 8);
      if (won) {
        addRenown(g, life, 5);
        earn(g, life, 3);
        journal(
          g,
          life,
          "You bring the young men home with horses, honours and no one lost.",
          "good",
        );
      } else {
        addRenown(g, life, -1);
        addStress(g, life, 5);
        journal(
          g,
          life,
          "The raid finds the enemy awake. You bring the young men home, most of them.",
          "bad",
        );
      }
      return null;
    }
    case "belt": {
      touchLife(g, life).favor = Math.min(100, life.favor + 5);
      gainXp(g, life, "persuasion", 5);
      journal(
        g,
        life,
        "The elders turn your belt over in their hands and nod. Your words will be remembered.",
        "good",
      );
      return null;
    }
    case "raise": {
      const sa = officesIn(s, o.prov).find((x) => x.key === "sachem")!;
      if (!npcEligible(s, target!, sa))
        return `${target!.first} can't be raised up.`;
      giveOffice(g, sa, target!.id, "raised up by the clan mothers");
      remembers(g, life, g.char(target!.id), "Raised me up", 20, 0);
      journal(
        g,
        life,
        `You put the horns of office on ${charName(target)}.`,
        "good",
      );
      return null;
    }
  }
  return null;
}

/** Appoint someone to an office you have the giving of. */
export function appointLocal(
  g: ConquestGame,
  life: Life,
  id: number,
  c: number,
): string | null {
  const s = g.s;
  const o = officeById(s, id);
  if (!o) return "No such office.";
  if (appointerOf(s, o) !== life.c) return "It isn't yours to give.";
  if (OFFICES[o.key].how === "elected") return "The freeholders choose that.";
  const ch = s.chars[c];
  if (!ch) return "Nobody.";
  const other = lifeOfChar(s, c);
  if (other) {
    const ok = eligible(s, other, o);
    if (!ok.ok) return c === life.c ? ok.why : `${ch.first} can't hold it.`;
  } else if (!npcEligible(s, ch, o)) return `${ch.first} can't hold it.`;
  if (!other && !householdsOf(s, o.prov).some((x) => x.id === c))
    return "Choose someone of the county.";
  if (o.holder >= 0 && o.holder !== c) vacate(g, o, "replaced");
  giveOffice(g, o, c, `by your appointment`);
  if (c !== life.c) remembers(g, life, g.char(c), "Gave me an office", 15, 5);
  return null;
}

/** Stand at the next poll. */
export function standLocal(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const o = officeById(s, id);
  if (!o) return "No such office.";
  const check = standLocalCheck(s, life, o);
  if (!check.ok) return check.why;
  o.candidates.push({ c: life.c, points: 0 });
  g.societyChanged(`o${o.prov}`);
  journal(
    g,
    life,
    `You put your name up for ${officeTitle(s, g.w, o)}. The poll is in ${Math.max(1, Math.round((o.election - s.day) / 30))} months: canvass, treat the voters, print a broadside.`,
  );
  return null;
}

/** Give up an office. */
export function resignLocal(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const o = officeById(g.s, id);
  if (!o || o.holder !== life.c) return "It isn't yours.";
  vacate(g, o, "you resigned");
  return null;
}

/** Campaign points for whatever local poll you're standing in. */
export function localCampaign(
  g: ConquestGame,
  life: Life,
  points: number,
): boolean {
  for (const list of Object.values(g.s.society?.offices ?? {}))
    for (const o of list) {
      const x = o.candidates.find((y) => y.c === life.c);
      if (x) {
        x.points += points;
        g.societyChanged(`o${o.prov}`);
        return true;
      }
    }
  return false;
}

export function standingLocally(
  s: GameState,
  life: Life,
): LocalOffice | undefined {
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list)
      if (o.candidates.some((y) => y.c === life.c)) return o;
  return undefined;
}

/** A played or unplayed person's local offices, in words, for cards. */
export function localLabels(s: GameState, w: World, c: number): string[] {
  return localOfficesOf(s, c).map((o) => officeTitle(s, w, o));
}
