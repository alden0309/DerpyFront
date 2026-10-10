// Gatherings. Give a dinner, a feast, a ball, a card party, a hunt, a church
// social, a harvest frolic or a barn raising, a wedding, a christening, a
// funeral; or, among the native towns, a feast, a dance, a council, the
// green corn. Choose the place and who to ask (far-off guests by letter, and
// they need time to come). Guests say yes or no, with their reasons. On the
// day a few things happen (a toast, a quarrel, a drunk, a romance, a fight,
// a ghost story), each a scene with choices, and how it went changes what
// people think of you and how well known you are. Others give gatherings
// too, and ask you.

import { dateOf } from "./Calendar";
import { marry } from "./Characters";
import { Explain } from "./Explain";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { wed } from "./Interactions";
import { addressOf, npcWrite, postRoute, sendInvitation } from "./Letters";
import {
  addRenown,
  addStress,
  journal,
  meet,
  milestone,
  remembers,
  touchLife,
} from "./LifeCore";
import { raiseLifeEvent } from "./LifeEvents";
import {
  Check,
  familyAtHome,
  hasPlace,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  lifeOfChar,
  meOf,
  no,
  opinionOf,
  peopleHere,
  yes,
} from "./LifeQueries";
import { ROLES } from "./LifeRules";
import type { World } from "./Map";
import { ageOf, charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { dice, society } from "./SocietyCore";
import { sharedLevel, tonguesOf } from "./Tongues";
import type {
  Breakdown,
  Character,
  GameState,
  Gathering,
  GatheringKind,
  Life,
  PlaceKind,
  TraitId,
} from "./Types";

export interface GatheringDef {
  name: string;
  /** "a dinner", for sentences. */
  a: string;
  text: string;
  who: "colonist" | "native" | "any";
  venues: PlaceKind[];
  /** Coins for a modest one, before the scale. */
  base: number;
  /** Needs a newborn, a death in the family, or a wedding. */
  need?: "child" | "dead" | "wed";
  /** Only in these months (0 January). */
  months?: number[];
  /** How guests of a nature feel about it. */
  appeal: Partial<Record<TraitId, number>>;
  /** Turns it can bring (sub-event keys). */
  pool: string[];
  /** Renown it brings, at its best, per step of scale. */
  renown: number;
  /** Peoples who keep it (native ceremonies). */
  peoples?: string[];
}

export const GATHERINGS: Record<GatheringKind, GatheringDef> = {
  dinner: {
    name: "Dinner",
    a: "a dinner",
    text: "Your table, your best plate, the people who matter: talk, wine and an eye on who sits where.",
    who: "colonist",
    venues: ["home", "tavern"],
    base: 5,
    appeal: { greedy: 5, charming: 5, content: 5 },
    pool: [
      "toast",
      "quarrel",
      "drunk",
      "insult",
      "romance",
      "business",
      "dish",
      "surprise",
      "ghost",
      "accident",
    ],
    renown: 1.5,
  },
  feast: {
    name: "Feast",
    a: "a feast",
    text: "Roast ox, puddings, a barrel broached and the whole neighbourhood in: loud, generous, remembered.",
    who: "any",
    venues: ["home", "tavern", "village", "fields"],
    base: 10,
    appeal: { greedy: 8, drunkard: 10, generous: 5 },
    pool: [
      "toast",
      "quarrel",
      "drunk",
      "fight",
      "romance",
      "business",
      "dish",
      "surprise",
      "ghost",
      "accident",
    ],
    renown: 2,
  },
  ball: {
    name: "Ball",
    a: "a ball",
    text: "Fiddlers, candles, minuets and country dances till dawn: the colony's gentry, and everyone who hopes to be.",
    who: "colonist",
    venues: ["home", "tavern", "governor"],
    base: 22,
    appeal: { charming: 10, ambitious: 6, zealous: -25, content: -3 },
    pool: [
      "dance",
      "toast",
      "romance",
      "insult",
      "quarrel",
      "surprise",
      "drunk",
      "business",
    ],
    renown: 3,
  },
  cards: {
    name: "Card party",
    a: "a card party",
    text: "Loo, whist and piquet for shillings, or more. Fortunes change hands, and so do grudges.",
    who: "colonist",
    venues: ["home", "tavern"],
    base: 3,
    appeal: { greedy: 8, drunkard: 5, zealous: -20, honest: -3 },
    pool: ["cards", "drunk", "quarrel", "insult", "business", "ghost", "fight"],
    renown: 1,
  },
  hunt: {
    name: "Hunt",
    a: "a hunt",
    text: "Horses, hounds and a breakfast after: a stag or a fox, and a chance to show your seat.",
    who: "any",
    venues: ["woods", "fields"],
    base: 6,
    appeal: { brave: 10, robust: 5, craven: -8, lazy: -5 },
    pool: ["hunt", "accident", "toast", "quarrel", "business", "surprise"],
    renown: 2,
  },
  social: {
    name: "Church social",
    a: "a church social",
    text: "Tea, cakes and hymns after the service; the minister beams and the widows take notes.",
    who: "colonist",
    venues: ["church"],
    base: 2,
    appeal: { zealous: 12, tolerant: 3, drunkard: -8 },
    pool: ["toast", "romance", "dish", "quarrel", "ghost", "business"],
    renown: 1,
  },
  frolic: {
    name: "Harvest frolic",
    a: "a husking frolic",
    text: "The corn husked by everyone at once, cider, a fiddle, and a kiss for whoever finds a red ear.",
    who: "colonist",
    venues: ["fields", "home"],
    base: 4,
    months: [8, 9, 10],
    appeal: { content: 6, diligent: 4, drunkard: 6 },
    pool: ["frolic", "romance", "drunk", "fight", "ghost", "dish"],
    renown: 1.5,
  },
  raising: {
    name: "Barn raising",
    a: "a barn raising",
    text: "Your neighbours put up your barn in a day: you feed them, give them drink, and owe them a day each.",
    who: "colonist",
    venues: ["fields"],
    base: 5,
    months: [3, 4, 5, 6, 7, 8],
    appeal: { diligent: 8, robust: 5, lazy: -10, generous: 4 },
    pool: ["raising", "accident", "toast", "drunk", "fight", "romance"],
    renown: 1.5,
  },
  wedding: {
    name: "Wedding",
    a: "a wedding",
    text: "The vows, then the feast: every friend you have and some you didn't know about.",
    who: "any",
    venues: ["church", "home", "village"],
    base: 10,
    need: "wed",
    appeal: { generous: 4, charming: 4 },
    pool: [
      "wedding",
      "dance",
      "toast",
      "drunk",
      "romance",
      "surprise",
      "quarrel",
    ],
    renown: 2,
  },
  christening: {
    name: "Christening",
    a: "a christening",
    text: "The child named before God and the parish, godparents chosen, and cake.",
    who: "colonist",
    venues: ["church", "home"],
    base: 4,
    need: "child",
    appeal: { zealous: 8 },
    pool: ["christening", "toast", "dish", "quarrel", "surprise"],
    renown: 1,
  },
  funeral: {
    name: "Funeral",
    a: "a funeral",
    text: "Black gloves, a sermon, and a wake after: the dead honoured and the living fed.",
    who: "any",
    venues: ["church", "home", "village"],
    base: 5,
    need: "dead",
    appeal: { zealous: 4 },
    pool: ["eulogy", "quarrel", "drunk", "ghost", "surprise"],
    renown: 1,
  },
  nfeast: {
    name: "Feast",
    a: "a feast",
    text: "Kettles of corn and venison, everyone fed from them, speeches of welcome and the old stories.",
    who: "native",
    venues: ["village", "councilfire"],
    base: 4,
    appeal: { generous: 8, greedy: 4 },
    pool: [
      "speech",
      "dance",
      "ghost",
      "quarrel",
      "romance",
      "surprise",
      "dish",
    ],
    renown: 2,
  },
  dance: {
    name: "Dance",
    a: "a dance",
    text: "Drum, rattle and song around the fire, through the night: the young show off and the old remember.",
    who: "native",
    venues: ["village", "councilfire"],
    base: 2,
    appeal: { content: 4, charming: 6 },
    pool: ["dance", "romance", "ghost", "quarrel", "surprise"],
    renown: 1.5,
  },
  council: {
    name: "Council",
    a: "a council",
    text: "The pipe passed round, the matter laid out, and talk until there's one mind about it.",
    who: "native",
    venues: ["councilfire"],
    base: 3,
    appeal: { just: 6, ambitious: 4 },
    pool: ["council", "speech", "quarrel", "surprise", "ghost"],
    renown: 2,
  },
  greencorn: {
    name: "Green corn ceremony",
    a: "the green corn ceremony",
    text: "The new year, when the first corn is ripe: the fires put out and made new, debts and wrongs forgiven, the town renewed. Taken part in as its keepers ask.",
    who: "native",
    venues: ["village"],
    base: 6,
    months: [6, 7],
    peoples: [
      "muscogee",
      "cherokee",
      "choctaw",
      "chickasaw",
      "natchez",
      "haudenosaunee",
      "wendat",
      "timucua",
      "calusa",
    ],
    appeal: { zealous: 8, tolerant: 4 },
    pool: ["greencorn", "dance", "ghost", "romance"],
    renown: 2.5,
  },
};

export const GATHERING_KINDS = Object.keys(GATHERINGS) as GatheringKind[];

/** Cost multiplier and most guests by scale (modest, handsome, grand). */
export const SCALE = [
  { name: "Modest", mult: 1, guests: 6 },
  { name: "Handsome", mult: 2.5, guests: 12 },
  { name: "Grand", mult: 6, guests: 24 },
];

const TAVERN_RENT = 3;
/** Players' turns at a gathering: the host, and a guest. */
const HOST_TURNS = [2, 3, 3];
const GUEST_TURNS = 2;

export function gatheringById(s: GameState, id: number): Gathering | undefined {
  return (s.society?.gatherings ?? []).find((x) => x.id === id);
}

export function gatheringName(s: GameState, w: World, gat: Gathering): string {
  const host = s.chars[gat.host];
  const def = GATHERINGS[gat.kind];
  if (gat.kind === "wedding" && gat.about.length === 2)
    return `The wedding of ${charName(s.chars[gat.about[0]])} and ${charName(s.chars[gat.about[1]])}`;
  return `${charName(host)}'s ${def.name.toLowerCase()} at ${w.map.provinces[gat.prov]?.name ?? "somewhere"}`;
}

// ---------------------------------------------------------------- planning

/** Places here a gathering of this kind could be held. */
export function venuesFor(
  s: GameState,
  w: World,
  life: Life,
  kind: GatheringKind,
): PlaceKind[] {
  const def = GATHERINGS[kind];
  const p = life.prov;
  return def.venues.filter((v) =>
    v === "home" ? life.home === p : hasPlace(s, w, p, v),
  );
}

export function gatheringCost(
  kind: GatheringKind,
  venue: PlaceKind,
  scale: number,
): number {
  const def = GATHERINGS[kind];
  const sc = SCALE[Math.max(0, Math.min(2, scale - 1))];
  let cost = def.base * sc.mult;
  if (venue === "tavern") cost += TAVERN_RENT * scale;
  if (venue === "governor") cost += 6 * scale;
  if (venue === "church") cost += 1;
  return Math.round(cost);
}

/** Who this gathering is for: a newborn, the dead, the couple. */
export function gatheringAbout(
  s: GameState,
  life: Life,
  kind: GatheringKind,
): number[] | null {
  const me = meOf(s, life);
  if (!me) return null;
  const def = GATHERINGS[kind];
  if (!def.need) return [];
  if (def.need === "child") {
    const kid = me.children
      .map((id) => s.chars[id])
      .find((c) => c?.alive && s.day - c.born < DAYS_PER_YEAR);
    return kid ? [kid.id] : null;
  }
  if (def.need === "dead") {
    const kin = [me.spouse, me.father, me.mother, ...me.children]
      .map((id) => s.chars[id])
      .find((c) => c && !c.alive && c.died && s.day - c.died.day < 90);
    return kin ? [kin.id] : null;
  }
  // A wedding: married lately, and not celebrated yet.
  const sp = s.chars[me.spouse];
  if (!sp?.alive) return null;
  if ((life.cooldowns["wed-feast"] ?? 0) > s.day) return null;
  const lately = life.milestones.some(
    (m) => m.kind === "married" && s.day - m.day < 180 && m.c === me.id,
  );
  return lately ? [me.id, sp.id] : null;
}

/** Can you give one of these here. */
export function hostCheck(
  s: GameState,
  w: World,
  life: Life,
  kind: GatheringKind,
  venue: PlaceKind,
  days: number,
  scale: number,
): Check {
  const me = meOf(s, life);
  const def = GATHERINGS[kind];
  if (!me || !def) return no("No such gathering.");
  if (isChildLife(s, life)) return no("Not until you're grown.");
  if (life.travel) return no("Not from the road.");
  const native = lifeIsNative(s, life);
  if (def.who === "colonist" && native)
    return no("Not a custom of your people.");
  if (def.who === "native" && !native)
    return no("Not yours to give: it's for the native towns.");
  if (def.peoples && !def.peoples.includes(me.culture))
    return no("Not a ceremony your people keep.");
  if (def.months && !def.months.includes(dateOf(s.day + days).month))
    return no(
      `Only in its season (${def.months.map((m) => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m]).join(", ")}).`,
    );
  if (!venuesFor(s, w, life, kind).includes(venue))
    return no(
      venue === "home"
        ? "Only at your own home."
        : "There's no such place here.",
    );
  if (!Number.isInteger(scale) || scale < 1 || scale > 3)
    return no("How grand?");
  if (!Number.isInteger(days) || days < 3 || days > 120)
    return no("Between three days and four months from now.");
  if (gatheringAbout(s, life, kind) === null)
    return no(
      def.need === "child"
        ? "For a child born this year."
        : def.need === "dead"
          ? "For one of your family, lately dead."
          : "For your own wedding, in its first half year.",
    );
  const mine = (s.society?.gatherings ?? []).filter(
    (x) => x.host === me.id && x.status === "planned",
  );
  if (mine.length >= 2) return no("You've two in hand already.");
  const cost = gatheringCost(kind, venue, scale);
  if (life.purse < cost) return no(`It will cost ${cost} coins.`);
  return yes;
}

/** People you could ask, and whether they're near enough to come. */
export function invitables(
  s: GameState,
  w: World,
  life: Life,
  days = 14,
): { c: Character; near: boolean; days: number }[] {
  const me = meOf(s, life);
  if (!me) return [];
  const seen = new Set<number>([me.id]);
  const out: { c: Character; near: boolean; days: number }[] = [];
  const add = (c: Character | undefined) => {
    if (!c?.alive || c.abroad || seen.has(c.id) || ageOf(s, c) < 14) return;
    seen.add(c.id);
    const at = addressOf(s, c);
    if (at < 0) return;
    const near = at === life.prov;
    const d = near ? 0 : (postRoute(s, w.map, life.prov, at)?.days ?? 99) * 2;
    out.push({ c, near, days: d });
  };
  for (const c of familyAtHome(s, life)) seen.add(c.id);
  for (const c of peopleHere(s, life.prov, life)) add(c);
  for (const id of Object.keys(life.ties)) add(s.chars[Number(id)]);
  for (const id of [...life.met].reverse()) add(s.chars[id]);
  void days;
  return out;
}

/** Would a guest come, and why. */
export function rsvpBreakdown(
  s: GameState,
  w: World,
  gat: Gathering,
  c: Character,
  hostLife?: Life,
  /** Decided when the invitation arrives: only the journey is left. */
  atArrival = false,
): Breakdown {
  const def = GATHERINGS[gat.kind];
  const host = s.chars[gat.host];
  const e = new Explain().add("An invitation is a compliment", 8);
  const op = hostLife
    ? opinionOf(s, c, hostLife).total
    : c.memories
        .filter((m) => m.of === gat.host)
        .reduce((a, m) => a + m.value, 0);
  e.add(
    `What they think of ${host?.first ?? "the host"} (${op})`,
    Math.round(op / 2),
  );
  if (gat.scale > 1)
    e.add(
      gat.scale === 3 ? "A grand affair" : "A handsome affair",
      (gat.scale - 1) * 4,
    );
  if (hostLife) {
    const fame = Math.min(10, Math.floor(hostLife.renown / 5));
    if (fame) e.add("Your name", fame);
    const tie = hostLife.ties[c.id];
    if (tie === "friend") e.add("Friends", 15);
    if (tie === "lover") e.add("Lovers", 12);
    if (tie === "rival" || tie === "nemesis") e.add("Enemies", -40);
  }
  for (const [t, v] of Object.entries(def.appeal))
    if (hasTrait(c, t as TraitId) && v)
      e.add(
        t === "zealous" && v < 0
          ? gat.kind === "ball"
            ? "Dancing is sinful"
            : "Cards are sinful"
          : `${t[0].toUpperCase()}${t.slice(1)}`,
        v,
      );
  const status = c.role ? ROLES[c.role].status : 2;
  if (gat.kind === "ball") {
    if (status >= 4) e.add("A gentleman's pleasure", 6);
    if (status <= 1) e.add("Out of their station", -10);
  }
  const nativeGuest = isNativeChar(s, c);
  if (def.who === "native" && !nativeGuest)
    e.add("A stranger at another people's fire", -8);
  if (def.who === "colonist" && nativeGuest) e.add("A stranger's table", -10);
  if (host) {
    const shared = sharedLevel(
      tonguesOf(s, w.map, c),
      tonguesOf(s, w.map, host),
    ).level;
    if (shared < 1) e.add("No tongue in common", -10);
  }
  if (gat.kind === "wedding") e.add("Everyone loves a wedding", 10);
  if (gat.kind === "funeral") {
    const kin = gat.about.some((d) => {
      const x = s.chars[d];
      return (
        x &&
        (x.father === c.id ||
          x.mother === c.id ||
          c.father === x.id ||
          c.mother === x.id ||
          x.spouse === c.id)
      );
    });
    e.add(kin ? "Their own family" : "One pays one's respects", kin ? 25 : 6);
  }
  // How far, and can they get there in time.
  const at = addressOf(s, c);
  if (at >= 0 && at !== gat.prov) {
    const r = postRoute(s, w.map, at, gat.prov);
    const travel = r ? r.days : 60;
    const letter = atArrival ? 0 : r ? r.days : 30;
    if (s.day + letter + travel > gat.day && !lifeOfChar(s, c.id))
      e.add("Can't get there in time", -100);
    else
      e.add(
        `A journey of ${travel} days`,
        -Math.min(30, Math.round(travel / 3)),
      );
  }
  if (lifeOfChar(s, c.id)) e.add("Another player decides", 0, true);
  return e.done(0);
}

function pushGathering(g: ConquestGame, gat: Gathering): void {
  const soc = society(g);
  soc.gatherings.push(gat);
  // Keep the last few held, for the record.
  const done = soc.gatherings.filter(
    (x) => x.status === "held" || x.status === "cancelled",
  );
  if (done.length > 16) {
    const drop = new Set(done.slice(0, done.length - 16).map((x) => x.id));
    soc.gatherings = soc.gatherings.filter((x) => !drop.has(x.id));
  }
  g.societyChanged("g");
}

/** Invite someone: at once if they're here, by letter if not. */
function invite(
  g: ConquestGame,
  life: Life | undefined,
  gat: Gathering,
  c: Character,
): void {
  const s = g.s;
  if (gat.invited.includes(c.id)) return;
  gat.invited.push(c.id);
  g.societyChanged("g");
  const other = lifeOfChar(s, c.id);
  const here = addressOf(s, c) === gat.prov;
  if (other) {
    // Another player: a card (or a letter) to answer.
    const host = s.chars[gat.host];
    if (host)
      npcWrite(g, other, host, "invite", inviteText(g, gat), {
        ask: true,
        arg: gat.id,
      });
    return;
  }
  if (here || !life) {
    const b = rsvpBreakdown(s, g.w, gat, c, life);
    answerInvite(g, gat, c.id, b.total > 0, topReason(b));
  } else sendInvitation(g, life, gat, c);
}

export function inviteText(g: ConquestGame, gat: Gathering): string {
  const s = g.s;
  const host = s.chars[gat.host];
  const def = GATHERINGS[gat.kind];
  const when = dateOf(gat.day);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const where = g.map.provinces[gat.prov]?.name ?? "";
  if (gat.kind === "wedding" && gat.about.length === 2)
    return `${charName(s.chars[gat.about[0]])} and ${charName(s.chars[gat.about[1]])} request the pleasure of your company at their wedding, at ${where}, on the ${when.day}th of ${months[when.month]}. ${charName(host)}.`;
  return `${charName(host)} requests the pleasure of your company at ${def.a}, at ${where}, on the ${when.day}th of ${months[when.month]}, ${when.year}.`;
}

function topReason(b: Breakdown): string {
  const yesA = b.total > 0;
  const parts = b.parts
    .filter((p) => !p.mul && (yesA ? p.value > 0 : p.value < 0))
    .sort((a, x) => (yesA ? x.value - a.value : a.value - x.value));
  return (
    parts[0]?.label.replace(/ \(.*\)$/, "") ??
    (yesA ? "glad to" : "would rather not")
  );
}

/** A guest's answer. */
export function answerInvite(
  g: ConquestGame,
  gat: Gathering,
  c: number,
  yesA: boolean,
  why: string,
): void {
  if (gat.status !== "planned") return;
  gat.rsvp[c] = { yes: yesA, why };
  g.societyChanged("g");
}

/** What the host hears of the answers so far, in a line. */
function answersLine(g: ConquestGame, gat: Gathering, ids: number[]): string {
  const s = g.s;
  const said = ids.filter((id) => gat.rsvp[id]);
  if (!said.length) return "";
  const yesN = said.filter((id) => gat.rsvp[id].yes);
  const noN = said.filter((id) => !gat.rsvp[id].yes);
  const who = (list: number[]) =>
    list
      .slice(0, 3)
      .map((id) => s.chars[id]?.first ?? "someone")
      .join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
  const parts: string[] = [];
  if (yesN.length) parts.push(`${who(yesN)} will come`);
  if (noN.length) parts.push(`${who(noN)} won't`);
  return ` ${parts.join("; ")}.`;
}

/** A player gives a gathering. */
export function hostGathering(
  g: ConquestGame,
  life: Life,
  kind: GatheringKind,
  venue: PlaceKind,
  days: number,
  scale: number,
  guests: number[],
): string | null {
  const s = g.s;
  const check = hostCheck(s, g.w, life, kind, venue, days, scale);
  if (!check.ok) return check.why;
  const me = meOf(s, life)!;
  const cost = gatheringCost(kind, venue, scale);
  const max = SCALE[scale - 1].guests;
  const can = new Map(invitables(s, g.w, life).map((x) => [x.c.id, x.c]));
  const list = [...new Set(guests)].filter((id) => can.has(id)).slice(0, max);
  if (!list.length) return "Invite someone.";
  touchLife(g, life);
  life.purse = Math.round((life.purse - cost) * 100) / 100;
  const gat: Gathering = {
    id: g.nextId(),
    kind,
    host: me.id,
    prov: life.prov,
    venue,
    day: s.day + days,
    scale,
    cost,
    invited: [],
    rsvp: {},
    about: gatheringAbout(s, life, kind) ?? [],
    status: "planned",
    mood: 0,
    played: [],
    turns: {},
    lines: [],
  };
  if (kind === "wedding") life.cooldowns["wed-feast"] = s.day + 400;
  pushGathering(g, gat);
  for (const id of list) invite(g, life, gat, can.get(id)!);
  const far = list.filter((id) => !gat.rsvp[id]).length;
  journal(
    g,
    life,
    `You'll give ${GATHERINGS[kind].a} at ${g.map.provinces[life.prov].name} in ${days} days (${cost} coins).${answersLine(g, gat, list)}${far ? ` ${far} invitation${far === 1 ? " goes" : "s go"} by letter.` : ""}`,
  );
  return null;
}

/** Ask more people to a gathering you're giving. */
export function inviteMore(
  g: ConquestGame,
  life: Life,
  id: number,
  guests: number[],
): string | null {
  const s = g.s;
  const gat = gatheringById(s, id);
  if (!gat || gat.host !== life.c || gat.status !== "planned")
    return "Not a gathering of yours.";
  const max = SCALE[gat.scale - 1].guests;
  const can = new Map(invitables(s, g.w, life).map((x) => [x.c.id, x.c]));
  const add = guests.filter((x) => can.has(x) && !gat.invited.includes(x));
  if (!add.length) return "Nobody new to ask.";
  if (gat.invited.length + add.length > max)
    return `No more than ${max} guests.`;
  for (const x of add) invite(g, life, gat, can.get(x)!);
  const line = answersLine(g, gat, add);
  if (line) journal(g, life, line.trim());
  touchLife(g, life);
  return null;
}

export function cancelGathering(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const gat = gatheringById(s, id);
  if (!gat || gat.host !== life.c || gat.status !== "planned")
    return "Not a gathering of yours.";
  if (gat.kind === "wedding")
    return "Call off a wedding? Not by cancelling the feast.";
  gat.status = "cancelled";
  g.societyChanged("g");
  for (const [c, r] of Object.entries(gat.rsvp))
    if (r.yes && s.chars[Number(c)]?.alive)
      remembers(g, life, g.char(Number(c)), "Called off their party", -4, 1);
  journal(
    g,
    life,
    `You call off your ${GATHERINGS[gat.kind].name.toLowerCase()}. The money's spent.`,
  );
  return null;
}

/** A player answers an invitation they're holding (here, or by letter). */
export function rsvp(
  g: ConquestGame,
  life: Life,
  id: number,
  yesA: boolean,
): string | null {
  const gat = gatheringById(g.s, id);
  if (!gat || !gat.invited.includes(life.c) || gat.status !== "planned")
    return "No such invitation.";
  answerInvite(g, gat, life.c, yesA, yesA ? "glad to come" : "sends regrets");
  // The letter that brought it is answered too.
  for (const l of life.post ?? [])
    if (l.kind === "invite" && l.arg === id && !l.done) {
      l.done = true;
      l.read = true;
    }
  touchLife(g, life);
  return null;
}

// ---------------------------------------------------------------- weddings

/** A promise made by letter: the other comes to you, and the wedding's at your home. */
export function scheduleWedding(
  g: ConquestGame,
  life: Life,
  fiance: Character,
): string | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return "You're watching.";
  const from = addressOf(s, fiance);
  const travel =
    from >= 0 ? (postRoute(s, g.map, from, life.home)?.days ?? 30) : 30;
  const venue: PlaceKind = hasPlace(s, g.w, life.home, "church")
    ? "church"
    : hasPlace(s, g.w, life.home, "village")
      ? "village"
      : "home";
  const gat: Gathering = {
    id: g.nextId(),
    kind: "wedding",
    host: me.id,
    prov: life.home,
    venue,
    day: s.day + travel + 10,
    scale: 1,
    cost: 0,
    invited: [fiance.id],
    rsvp: { [fiance.id]: { yes: true, why: "the bride or groom" } },
    about: [me.id, fiance.id],
    status: "planned",
    mood: 1,
    played: [],
    turns: {},
    lines: [],
  };
  pushGathering(g, gat);
  touchLife(g, life).cooldowns["wed-feast"] = s.day + 400;
  journal(
    g,
    life,
    `${charName(fiance)} has said yes, and is on the way. The wedding is set for ${travel + 10} days from now at ${g.map.provinces[life.home]?.name}: be there. Invite whoever you like (Gatherings).`,
    "good",
  );
  milestone(g, life, "married", `Betrothed to ${charName(fiance)} by letter`);
  return null;
}

function marryAtWedding(g: ConquestGame, gat: Gathering): boolean {
  const s = g.s;
  const [a, b] = gat.about.map((id) => s.chars[id]);
  if (!a?.alive || !b?.alive) return false;
  if (a.spouse === b.id) return true;
  if (a.spouse >= 0 || b.spouse >= 0) return false;
  const la = lifeOfChar(s, a.id);
  const lb = lifeOfChar(s, b.id);
  if (la && !lb) {
    wed(g, la, g.char(b.id));
    return true;
  }
  if (lb && !la) {
    wed(g, lb, g.char(a.id));
    return true;
  }
  if (la && lb) {
    if (lb.prov !== gat.prov || lb.travel) return false;
    marry(s, g.touchChar(a), g.touchChar(b));
    touchLife(g, lb).home = la.home;
    g.touchChar(b).home = la.home;
    for (const [x, y] of [
      [la, b],
      [lb, a],
    ] as const) {
      touchLife(g, x).tally.marriages++;
      addStress(g, x, -10);
      journal(g, x, `You married ${charName(y)}.`, "good");
      milestone(g, x, "married", `Married ${charName(y)}`);
    }
    return true;
  }
  marry(s, g.touchChar(a), g.touchChar(b));
  a.home = b.home = gat.prov;
  return true;
}

// ---------------------------------------------------------------- the day

/** Who's there: guests who said yes, and (for players) who've come. */
export function attendees(s: GameState, gat: Gathering): Character[] {
  const out: Character[] = [];
  for (const id of gat.invited) {
    const r = gat.rsvp[id];
    const c = s.chars[id];
    if (!r?.yes || !c?.alive || c.abroad) continue;
    const l = lifeOfChar(s, id);
    if (l && (l.prov !== gat.prov || l.travel)) continue;
    out.push(c);
  }
  return out;
}

/** The turn that comes next for a player at a gathering: which, and with whom. */
function nextTurn(
  g: ConquestGame,
  life: Life,
  gat: Gathering,
): { key: string; c: number } | null {
  const s = g.s;
  const me = meOf(s, life);
  if (!me) return null;
  const host = s.chars[gat.host];
  const here = attendees(s, gat).filter((c) => c.id !== me.id);
  if (host && host.id !== me.id && host.alive && !here.includes(host))
    here.unshift(host);
  if (!here.length)
    return gat.played.includes("empty") ? null : { key: "empty", c: -1 };
  const r = dice(g);
  const pool = GATHERINGS[gat.kind].pool.filter((k) => !gat.played.includes(k));
  // The ceremony's own turn first.
  const own = [
    "wedding",
    "christening",
    "eulogy",
    "greencorn",
    "council",
    "hunt",
    "raising",
    "frolic",
    "cards",
    "dance",
    "speech",
  ];
  const started = gat.played.some((k) => GATHERINGS[gat.kind].pool.includes(k));
  const first = started ? undefined : pool.find((k) => own.includes(k));
  const rest = pool.filter((k) => k !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const tries = first ? [first, ...rest] : rest;
  for (const key of tries) {
    const c = guestFor(s, life, me, gat, key, here, r.next());
    if (c !== null) return { key, c };
  }
  return null;
}

/** The guest a turn is about, or null if it can't happen with these people. */
function guestFor(
  s: GameState,
  life: Life,
  me: Character,
  gat: Gathering,
  key: string,
  here: Character[],
  roll: number,
): number | null {
  const any = (list: Character[]) =>
    list.length ? list[Math.floor(roll * list.length)].id : null;
  const adult = here.filter((c) => ageOf(s, c) >= 16);
  switch (key) {
    case "insult":
      return any(
        adult.filter(
          (c) =>
            opinionOf(s, c, life).total < 0 ||
            ["rival", "nemesis"].includes(life.ties[c.id] ?? ""),
        ),
      );
    case "romance":
      return any(
        adult.filter(
          (c) =>
            c.female !== me.female &&
            c.id !== me.spouse &&
            ageOf(s, c) <= ageOf(s, me) + 20,
        ),
      );
    case "drunk":
      return any(adult.filter((c) => hasTrait(c, "drunkard"))) ?? any(adult);
    case "fight":
      return adult.length >= 2
        ? (any(adult.filter((c) => !c.female)) ?? any(adult))
        : null;
    case "business":
      return (
        any(adult.filter((c) => c.role && ROLES[c.role].status >= 3)) ?? null
      );
    case "surprise": {
      const others = peopleHere(s, gat.prov, life).filter(
        (c) =>
          !gat.invited.includes(c.id) && c.id !== gat.host && ageOf(s, c) >= 16,
      );
      const notable = others.filter(
        (c) => (c.role ? ROLES[c.role].status : 2) >= 3,
      );
      return any(notable.length ? notable : others);
    }
    case "wedding":
    case "christening":
    case "eulogy":
      return gat.about.length
        ? (gat.about.find((x) => x !== me.id) ?? gat.about[0])
        : null;
    case "speech":
    case "council":
    case "greencorn":
      return (
        any(adult.filter((c) => c.role === "sachem" || c.role === "elder")) ??
        any(adult)
      );
    default:
      return any(adult) ?? any(here);
  }
}

function raiseTurn(g: ConquestGame, life: Life, gat: Gathering): boolean {
  const t = nextTurn(g, life, gat);
  if (!t) return false;
  gat.played.push(t.key);
  g.societyChanged("g");
  raiseLifeEvent(g, life, `gather-${t.key}`, {
    g: gat.id,
    c: t.c,
    h: gat.host === life.c ? 1 : 0,
  });
  return true;
}

/** A turn played: on to the next, or the end of the evening. */
export function gatherTurn(g: ConquestGame, life: Life, id: number): void {
  const gat = gatheringById(g.s, id);
  if (!gat || gat.status !== "on") return;
  const left = (gat.turns[life.seat] ?? 1) - 1;
  if (left > 0 && raiseTurn(g, life, gat)) gat.turns[life.seat] = left;
  else delete gat.turns[life.seat];
  g.societyChanged("g");
  if (!Object.keys(gat.turns).length) conclude(g, gat);
}

/** What a turn did to the gathering. */
export function gatherMood(
  g: ConquestGame,
  id: number,
  n: number,
  line?: string,
): void {
  const gat = gatheringById(g.s, id);
  if (!gat) return;
  gat.mood += n;
  if (line) gat.lines.push(line);
  if (gat.lines.length > 12) gat.lines.splice(0, gat.lines.length - 12);
  g.societyChanged("g");
}

function begin(g: ConquestGame, gat: Gathering): void {
  const s = g.s;
  const def = GATHERINGS[gat.kind];
  const hostLife = lifeOfChar(s, gat.host);
  const host = s.chars[gat.host];
  if (
    !host?.alive ||
    (hostLife && (hostLife.prov !== gat.prov || hostLife.travel))
  ) {
    // The host isn't there.
    if (gat.kind === "wedding" && hostLife && gat.played.length < 3) {
      // Put off once or twice.
      gat.day = s.day + 30;
      gat.played.push("put-off");
      g.societyChanged("g");
      journal(
        g,
        hostLife,
        `You weren't at ${g.map.provinces[gat.prov]?.name} for your own wedding: it's put off a month.`,
        "bad",
      );
      return;
    }
    gat.status = "cancelled";
    g.societyChanged("g");
    if (hostLife) {
      journal(
        g,
        hostLife,
        `You weren't there for your own ${def.name.toLowerCase()}. Your guests went home, and talked.`,
        "bad",
      );
      for (const c of attendees(s, gat))
        remembers(
          g,
          hostLife,
          g.char(c.id),
          "Asked us and wasn't there",
          -6,
          2,
        );
    }
    return;
  }
  if (gat.kind === "wedding" && !marryAtWedding(g, gat)) {
    gat.status = "cancelled";
    g.societyChanged("g");
    if (hostLife) journal(g, hostLife, "The wedding can't go ahead.", "bad");
    return;
  }
  gat.status = "on";
  g.societyChanged("g");
  const hostTurns = HOST_TURNS[gat.scale - 1];
  const players: Life[] = [];
  if (hostLife) players.push(hostLife);
  for (const c of attendees(s, gat)) {
    const l = lifeOfChar(s, c.id);
    if (l && l !== hostLife && !l.watching) players.push(l);
  }
  for (const l of players) {
    gat.turns[l.seat] = l === hostLife ? hostTurns : GUEST_TURNS;
    for (const c of attendees(s, gat)) if (c.id !== l.c) meet(g, l, c.id);
    if (!raiseTurn(g, l, gat)) delete gat.turns[l.seat];
  }
  if (!Object.keys(gat.turns).length) conclude(g, gat);
}

function conclude(g: ConquestGame, gat: Gathering): void {
  const s = g.s;
  if (gat.status === "held") return;
  gat.status = "held";
  g.societyChanged("g");
  const def = GATHERINGS[gat.kind];
  const came = attendees(s, gat);
  const asked = Math.max(1, gat.invited.length);
  const share = came.length / asked;
  const mood = gat.mood + (came.length >= 3 ? 1 : came.length === 0 ? -3 : 0);
  const verdict =
    mood >= 4
      ? "a triumph"
      : mood >= 2
        ? "a great success"
        : mood >= 0
          ? "a pleasant evening"
          : mood >= -2
            ? "a middling affair"
            : "a disaster";
  const hostLife = lifeOfChar(s, gat.host);
  const where = g.map.provinces[gat.prov]?.name ?? "";
  if (hostLife) {
    const fame = Math.max(
      0,
      Math.round(
        (def.renown * gat.scale * (0.5 + share) + Math.max(0, mood) * 0.6) * 10,
      ) / 10,
    );
    addRenown(g, hostLife, mood <= -3 ? -1 : fame);
    addStress(g, hostLife, mood >= 0 ? -(4 + gat.scale * 2) : 3);
    for (const c of came) {
      if (lifeOfChar(s, c.id)) continue;
      const v = Math.max(-10, Math.min(18, 3 + mood * 2 + gat.scale * 2));
      remembers(
        g,
        hostLife,
        g.char(c.id),
        mood >= 2
          ? `A splendid ${def.name.toLowerCase()}`
          : mood >= 0
            ? `A pleasant ${def.name.toLowerCase()}`
            : `A wretched ${def.name.toLowerCase()}`,
        v,
        3,
      );
    }
    journal(
      g,
      hostLife,
      `Your ${def.name.toLowerCase()} at ${where}: ${came.length} of ${gat.invited.length} came, and it was ${verdict}.`,
      mood >= 0 ? "good" : "bad",
    );
    if (gat.scale >= 2 && mood >= 2)
      milestone(
        g,
        hostLife,
        "renown",
        `Gave ${def.a} at ${where}, ${verdict}`,
        gat.prov,
      );
    if (gat.scale >= 2)
      rumour(
        g,
        gat.prov,
        `${charName(s.chars[gat.host])}'s ${def.name.toLowerCase()} at ${where} was ${verdict}.`,
        gat.host,
        mood >= 0 ? "good" : "bad",
      );
  }
  // Players who came as guests.
  for (const c of came) {
    const l = lifeOfChar(s, c.id);
    if (!l || l === hostLife) continue;
    addStress(g, l, -3);
    addRenown(g, l, 0.5);
    const host = s.chars[gat.host];
    if (host && !lifeOfChar(s, host.id))
      remembers(
        g,
        l,
        g.char(host.id),
        `Came to my ${def.name.toLowerCase()}`,
        8,
        3,
      );
    journal(
      g,
      l,
      `${gatheringName(s, g.w, gat)}: ${verdict}.`,
      mood >= 0 ? "good" : undefined,
    );
  }
  // Invited players who said yes and didn't come.
  for (const id of gat.invited) {
    const l = lifeOfChar(s, id);
    if (
      !l ||
      l === hostLife ||
      !gat.rsvp[id]?.yes ||
      came.some((c) => c.id === id)
    )
      continue;
    const host = s.chars[gat.host];
    if (host && !lifeOfChar(s, host.id))
      remembers(g, l, g.char(host.id), "Said they'd come, and didn't", -8, 2);
    journal(
      g,
      l,
      `You missed ${gatheringName(s, g.w, gat).replace(/^The /, "the ")}.`,
      "bad",
    );
  }
  gat.lines.push(`It was ${verdict}.`);
}

/** Each day: gatherings whose day has come begin; ones left hanging end. */
export function gatheringsDaily(g: ConquestGame): void {
  const s = g.s;
  const list = s.society?.gatherings;
  if (!list?.length) return;
  for (const gat of [...list]) {
    if (gat.status === "planned" && gat.day <= s.day) begin(g, gat);
    else if (gat.status === "on" && s.day - gat.day > 20) {
      gat.turns = {};
      conclude(g, gat);
    }
  }
}

// ---------------------------------------------------------------- others give them too

/** Each month: someone a player knows gives something and asks them. */
export function gatheringsMonthly(g: ConquestGame): void {
  const s = g.s;
  const r = dice(g);
  for (const life of s.lives) {
    const me = meOf(s, life);
    if (!me?.alive || life.watching || life.travel || isChildLife(s, life))
      continue;
    if (!r.chance(0.14)) continue;
    const already = (s.society?.gatherings ?? []).some(
      (x) =>
        x.status === "planned" && x.invited.includes(me.id) && x.host !== me.id,
    );
    if (already) continue;
    const p = life.prov;
    const folk = householdsOf(s, p).filter(
      (c) => !lifeOfChar(s, c.id) && ageOf(s, c) >= 21,
    );
    // A wedding among the neighbours, now and then.
    const singles = folk.filter((c) => c.spouse < 0 && ageOf(s, c) <= 40);
    const groom = singles.find((c) => !c.female);
    const bride = singles.find((c) => c.female && c.father !== groom?.father);
    if (groom && bride && r.chance(0.3)) {
      npcGathering(g, life, groom, "wedding", [groom.id, bride.id], folk);
      continue;
    }
    const hosts = folk.filter(
      (c) =>
        (c.role ? ROLES[c.role].status : 1) >= 2 &&
        opinionOf(s, c, life).total >= 0,
    );
    // A friend far off may ask too.
    const friends = Object.entries(life.ties)
      .filter(([, t]) => t === "friend")
      .map(([k]) => s.chars[Number(k)])
      .filter(
        (c) =>
          c?.alive && !c.abroad && !lifeOfChar(s, c.id) && c.home !== undefined,
      );
    const host = hosts.length ? hosts[r.int(0, hosts.length - 1)] : friends[0];
    if (!host) continue;
    const native = isNativeChar(s, host);
    const month = dateOf(s.day + 30).month;
    const kinds = (Object.keys(GATHERINGS) as GatheringKind[]).filter((k) => {
      const def = GATHERINGS[k];
      if (def.need) return false;
      if (def.who === "native" && !native) return false;
      if (def.who === "colonist" && native) return false;
      if (def.months && !def.months.includes(month)) return false;
      if (def.peoples && !def.peoples.includes(host.culture)) return false;
      if (k === "ball" && (host.role ? ROLES[host.role].status : 1) < 4)
        return false;
      return true;
    });
    const kind = kinds.length ? kinds[r.int(0, kinds.length - 1)] : "feast";
    npcGathering(
      g,
      life,
      host,
      kind,
      [],
      householdsOf(s, host.home ?? p).filter(
        (c) => c.id !== host.id && !lifeOfChar(s, c.id) && ageOf(s, c) >= 16,
      ),
    );
  }
}

function npcGathering(
  g: ConquestGame,
  life: Life,
  host: Character,
  kind: GatheringKind,
  about: number[],
  folk: Character[],
): void {
  const s = g.s;
  const r = dice(g);
  const p = host.home ?? life.prov;
  const venue =
    GATHERINGS[kind].venues.find(
      (v) => v !== "home" && hasPlace(s, g.w, p, v),
    ) ?? GATHERINGS[kind].venues[0];
  const far = p !== life.prov;
  const travel = far ? (postRoute(s, g.map, p, life.prov)?.days ?? 30) * 2 : 0;
  const gat: Gathering = {
    id: g.nextId(),
    kind,
    host: host.id,
    prov: p,
    venue,
    day: s.day + 14 + travel + r.int(0, 20),
    scale: r.int(1, 2),
    cost: 0,
    invited: [],
    rsvp: {},
    about,
    status: "planned",
    mood: r.int(0, 1),
    played: [],
    turns: {},
    lines: [],
  };
  pushGathering(g, gat);
  for (const c of folk.slice(0, 6)) {
    gat.invited.push(c.id);
    gat.rsvp[c.id] = { yes: true, why: "a neighbour" };
  }
  for (const id of about)
    if (!gat.invited.includes(id)) {
      gat.invited.push(id);
      gat.rsvp[id] = { yes: true, why: "the bride or groom" };
    }
  gat.invited.push(life.c);
  meet(g, life, host.id);
  npcWrite(g, life, host, "invite", inviteText(g, gat), {
    ask: true,
    arg: gat.id,
  });
}

/** Gatherings a player gives or is asked to. */
export function myGatherings(s: GameState, life: Life): Gathering[] {
  return (s.society?.gatherings ?? []).filter(
    (x) => x.host === life.c || x.invited.includes(life.c),
  );
}
