// CHAMBER (r16): the journal's small talk kept fresh. Over a forty-year
// political career the journal said "You stood the house a round" 638
// times, that the governor "asks after your family" 460 and "laughs at your
// story" 442, the same six names at the levee 400 times, and "the assembly
// sat three days" 70. So:
// - the governor's talk and flattery, the tavern round, the talk of the
//   town, alms and pamphlets draw from larger pools, and a line rests a
//   while once it's said;
// - talk with real news in it comes first (a war, the matter before the
//   council, the bill before the house, the governor's gout if he really has
//   it, the price of tobacco in London) and always goes in the journal;
// - a flavour line goes in the journal only the first few times a year:
//   after that it's said (you see it when you do the thing) but not written
//   down, and the talk of the town's old stories is retired after a couple
//   of hearings;
// - the levee says "the usual company" when it's the same faces, and names
//   only who's new.
// Lines are chosen on numbers already rolled (or the day): nothing here
// touches the world's dice.

import { dateOf } from "./Calendar";
import { cdice, listWords, strHash } from "./ChamberCore";
import type { ConquestGame } from "./Game";
import { journal, touchLife } from "./LifeCore";
import { charName, hasTrait } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import type { Character, Chatter, GameState, Life } from "./Types";

const Y = DAYS_PER_YEAR;

/** How many lines of each kind go in the journal a year (the rest are only said). */
export const JOURNAL_CAP: Record<string, number> = {
  talk: 3,
  flatter: 2,
  round: 3,
  levee: 2,
  alms: 2,
  pamphlet: 3,
  drink: 4,
  gift: 3,
};

/** A flavour line from the talk of the town is heard at most this often in a life. */
export const GOSSIP_HEARINGS = 2;

function chat(g: ConquestGame, life: Life): Chatter {
  const t = touchLife(g, life);
  return (t.chatter ??= { used: {} });
}

/** Said, not written down: shown when you do it (the scene), kept out of the journal. */
export function aside(g: ConquestGame, life: Life, text: string): void {
  if (g.capture?.seat === life.seat) g.capture.lines.push(text);
}

/** Lines of a kind written this year. */
function writtenThisYear(s: GameState, life: Life, kind: string): number {
  const n = life.chatter?.n?.[kind];
  return n && n[0] === dateOf(s.day).year ? n[1] : 0;
}

/** Write it in the journal if it's news or the first few of its kind this year; else only say it. */
export function sayOrWrite(
  g: ConquestGame,
  life: Life,
  kind: string,
  text: string,
  news = false,
  tone?: "good" | "bad",
): void {
  const s = g.s;
  const base = kind.split(":")[0];
  const cap = JOURNAL_CAP[base] ?? 3;
  const done = writtenThisYear(s, life, kind);
  if (!news && done >= cap) {
    aside(g, life, text);
    return;
  }
  journal(g, life, text, tone);
  const c = chat(g, life);
  c.n ??= {};
  c.n[kind] = [dateOf(s.day).year, done + 1];
  // Keep it small: this year's counts only.
  for (const [k, v] of Object.entries(c.n))
    if (v[0] !== dateOf(s.day).year) delete c.n[k];
}

/** A line from a pool, the same one not again within `rest` days; chosen on `roll`. */
export function fresh(
  g: ConquestGame,
  life: Life,
  kind: string,
  lines: string[],
  roll: number,
  rest: number,
): string {
  const s = g.s;
  const used = life.chatter?.used ?? {};
  const free = lines
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => (used[`${kind}:${i}`] ?? -Infinity) + rest <= s.day);
  // All resting: the one said longest ago.
  const pick = free.length
    ? free[Math.min(free.length - 1, Math.floor(roll * free.length))]
    : lines
        .map((t, i) => ({ t, i }))
        .sort(
          (a, b) =>
            (used[`${kind}:${a.i}`] ?? 0) - (used[`${kind}:${b.i}`] ?? 0) ||
            a.i - b.i,
        )[0];
  mark(g, life, `${kind}:${pick.i}`);
  return pick.t;
}

function mark(g: ConquestGame, life: Life, key: string): void {
  const c = chat(g, life);
  c.used[key] = g.s.day;
  // Forget what's three years past (a gossip line's hearings are kept: they retire it).
  if (Object.keys(c.used).length > 120)
    for (const [k, d] of Object.entries(c.used))
      if (!k.includes("#") && g.s.day - d > 3 * Y) delete c.used[k];
}

/** News not told lately (by its key), so a piece of news is told once, not every week. */
function newsFresh(
  life: Life,
  key: string,
  day: number,
  rest: number,
): boolean {
  return (life.chatter?.used[`news:${key}`] ?? -Infinity) + rest <= day;
}

// ---------------------------------------------------------------- talk

/** Home, as a colony's great men speak of it: its capital, and the board that writes the sharp letters. */
const HOME: Record<string, { city: string; board: string }> = {
  english: { city: "London", board: "the Board of Trade" },
  french: { city: "Paris", board: "the Ministry of Marine" },
  spanish: { city: "Madrid", board: "the Council of the Indies" },
  dutch: { city: "Amsterdam", board: "the Company's directors" },
  swedish: { city: "Stockholm", board: "the Company's directors" },
  portuguese: { city: "Lisbon", board: "the Overseas Council" },
};
const homeOf = (s: GameState, c: Character) =>
  HOME[s.nations[c.nation]?.culture ?? "english"] ?? HOME.english;

const GREAT_WARM: ((n: string, city: string, board: string) => string)[] = [
  (n) => `${n} laughs at your story, and tells a better one about a duke.`,
  (n) =>
    `${n} asks after your family, and remembers their names, which is more than the council can say.`,
  (n, city) =>
    `You and ${n} put the world to rights for an hour, and leave ${city} to put it back.`,
  (n, city) =>
    `${n} shows you a letter from a great man in ${city}, holding it so you can see the seal and not the words.`,
  (n, city, board) =>
    `${n} talks of horses: the best ever ridden, the worst ever bought, and which of them ${board} resembles.`,
  (n) =>
    `${n} pours you a glass of something from Madeira and asks your opinion of it, then tells you what it is.`,
  (n) =>
    `${n} wants to know what the counties are saying. You give a careful half of it.`,
  (n) =>
    `${n} complains of the climate, the mosquitoes, the post, and the colonists, but not to your face about the last.`,
  (n) =>
    `${n} takes you round the garden to see the new walk. It's very like the old walk, with gravel.`,
  (n) =>
    `${n} confides a plan to go home in two years. The plan is five years old.`,
  (n) =>
    `${n} asks whether you play at cards. You say not well, which is the right answer.`,
  (n, city) =>
    `${n} reads you a paragraph from the last ${city} paper, three months old, and asks what you make of it.`,
  (n) =>
    `${n} remembers something you said at the last levee, and repeats it back to you as an original thought.`,
  (n) =>
    `${n} sends for the map of the colony and shows you where a town ought to go, if anyone would live in it.`,
];

const WARM = [
  (n: string) => `${n} laughs at your story, and tells a better one.`,
  (n: string) => `You and ${n} put the world to rights for an hour.`,
  (n: string) => `${n} asks after your family, and remembers their names.`,
  (n: string) =>
    `${n} tells you who's courting whom, and swears you to secrecy.`,
  (n: string) =>
    `${n} wants your opinion on a horse, a lawsuit and a son-in-law, in that order.`,
  (n: string) => `You and ${n} agree about the weather, which is a beginning.`,
  (n: string) =>
    `${n} walks you to the door and keeps talking on the step for a quarter of an hour.`,
  (n: string) => `${n} has a new pipe and wants you to admire it. You do.`,
  (n: string) =>
    `${n} tells you a joke about a parson and a pig that you'll be repeating by evening.`,
  (n: string) => `${n} remembers your last talk better than you do.`,
];

const COOL = [
  (n: string) => `${n} answers in as few words as will do.`,
  (n: string) => `${n} keeps glancing at the door.`,
  (n: string) => `${n} is very civil, in the way that means nothing.`,
  (n: string) => `${n} remembers an appointment the moment you sit down.`,
  (n: string) =>
    `${n} agrees with everything you say, which is worse than arguing.`,
  (n: string) =>
    `${n} talks to you and looks over your shoulder at someone better.`,
];

/** Who counts as one of the great: a governor, a councillor, the gentry of the court. */
function great(s: GameState, c: Character): boolean {
  const nation = s.nations[c.nation];
  if (!nation) return false;
  if (nation.ruler === c.id) return true;
  if (Object.values(nation.council).includes(c.id)) return true;
  return nation.court.includes(c.id);
}

/** What someone has to tell you that's really so (and hasn't been told lately). */
function talkNews(
  g: ConquestGame,
  life: Life,
  c: Character,
): { key: string; text: string; rest: number } | null {
  const s = g.s;
  const name = charName(c);
  const n = c.nation;
  const nation = s.nations[n];
  const out: { key: string; text: string; rest: number }[] = [];
  if (!nation) return null;
  const war = s.wars.find((w) => w.a === n || w.b === n);
  if (war) {
    const foe = s.nations[war.a === n ? war.b : war.a];
    const them =
      foe?.kind === "native" ? `the ${foe.name}` : (foe?.name ?? "the enemy");
    const lines = [
      `${name} talks of nothing but the war with ${them}: the militia, the forts, and what it all costs.`,
      `${name} unrolls a map of the frontier and shows you where ${them} will come, and where the colony will stop them, and then rolls it up again rather quickly.`,
      `${name} has had a dispatch about the war with ${them} and reads you the parts that aren't secret, which is most of it.`,
      `${name} asks whether you think the war with ${them} will be over by Christmas, and doesn't like your face when you answer.`,
    ];
    out.push({
      key: `war:${war.a}-${war.b}-${war.start}:${Math.floor((s.day - war.start) / 365)}`,
      text: lines[Math.floor((s.day - war.start) / 365) % lines.length],
      rest: 365,
    });
  }
  const cab = s.power?.cabinets[n];
  const matter = cab?.matters.find((m) => m.status === "open");
  if (matter)
    out.push({
      key: `matter:${matter.id}`,
      text: `${name} asks what you think of ${lower(matter.title)}, and doesn't wait for the answer.`,
      rest: 9999,
    });
  const bill = cab?.bills.find((b) => b.stage === "house");
  if (bill)
    out.push({
      key: `bill:${bill.id}`,
      text: `${name} says the house had better ${nation.ruler === c.id ? "throw out" : "make up its mind about"} ${lower(bill.title.replace("{county}", g.map.provinces[bill.p]?.name ?? "the county"))}.`,
      rest: 9999,
    });
  if (cab?.session && cab.session.carried === undefined) {
    const q = SESSION_TITLES[cab.session.key] ?? "the session's business";
    const lines = [
      `${name} wants to know how the house will go on ${q}. Everyone does.`,
      `${name} has counted the house on ${q} three times and got three answers. You're asked for a fourth.`,
      `${name} talks about ${q} as if the house were a horse that might yet be persuaded to jump.`,
    ];
    out.push({
      key: `session:${cab.session.id}`,
      text: lines[cab.session.id % lines.length],
      rest: 9999,
    });
  }
  if (hasTrait(c, "gouty"))
    out.push({
      key: `gout:${c.id}`,
      text: `${name} receives you with one foot up on a stool: the gout, and the temper with it.`,
      rest: 365,
    });
  if (nation.kind === "power" && nation.ruler === c.id && nation.favor < 30)
    out.push({
      key: `board:${dateOf(s.day).year}`,
      text: `${name} has had a sharp letter from ${homeOf(s, c).board}, and reads you the sharpest parts.`,
      rest: 365,
    });
  const tob = s.europe.price.tobacco;
  if (tob !== undefined && (tob > 6 || tob < 3.5)) {
    const p = Math.round(tob * 10) / 10;
    const lines =
      tob > 6
        ? [
            `${name} says tobacco fetches ${p} at home, and half the colony is planting it in the front garden.`,
            `${name} has heard tobacco is ${p} at home and wonders aloud whether the governor's garden would grow it.`,
          ]
        : [
            `${name} says tobacco fetches ${p} at home, and the planters will be selling their wigs.`,
            `${name} says tobacco is down to ${p} at home: the planters are in debt to the merchants, and the merchants to London.`,
            `${name} blames the tobacco price (${p}, at home) on the Dutch, the French, the weather and the Navigation Acts, in turn.`,
          ];
    const y = dateOf(s.day).year;
    out.push({
      key: `tob:${Math.floor(y / 2)}:${tob > 6 ? "up" : "down"}`,
      text: lines[Math.floor(y / 2) % lines.length],
      rest: 2 * Y,
    });
  }
  const fresh = out.filter((x) => newsFresh(life, x.key, s.day, x.rest));
  return fresh[0] ?? null;
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** The session's questions, as the governor's table speaks of them. */
const SESSION_TITLES: Record<string, string> = {
  supply: "the supply",
  grievances: "the address of grievances",
  salary: "the King's instruction about the salary",
  currency: "the bills of credit",
  frontier: "the frontier's petitions",
  church: "the clergy's rate",
  election: "the disputed return",
  indiantrade: "the Indian trade",
  war: "the King's expedition",
  roads: "the roads and ferries",
};

/** The last line of talk that carried news (it goes in the journal whatever the count). */
let lastNews: string | null = null;

/** Write a word with someone: news and first meetings always; small talk the first few times a year. */
export function sayTalk(
  g: ConquestGame,
  life: Life,
  c: Character,
  text: string,
  first: boolean,
): void {
  const news = first || text === lastNews;
  lastNews = null;
  sayOrWrite(g, life, `talk:${c.id}`, text, news);
}

/**
 * A word with someone: news first if there is any, else a line from the
 * pools (the great have their own), none again within a few months. Returns
 * the line, and whether it carries news (news always goes in the journal).
 */
export function talkLine(
  g: ConquestGame,
  life: Life,
  c: Character,
  roll: number,
  warm: boolean,
): { text: string; news: boolean } {
  const s = g.s;
  const name = charName(c);
  const news = talkNews(g, life, c);
  // News comes out about half the time, so it isn't every visit.
  if (news && roll < 0.55) {
    mark(g, life, `news:${news.key}`);
    lastNews = news.text;
    return { text: news.text, news: true };
  }
  const home = homeOf(s, c);
  const lines = warm
    ? great(s, c)
      ? GREAT_WARM.map((f) => f(name, home.city, home.board))
      : WARM.map((f) => f(name))
    : COOL.map((f) => f(name));
  const kind = warm ? (great(s, c) ? "tg" : "tw") : "tc";
  // A second roll from the first (no new dice): which of the free lines.
  const pick = (roll * 7919 + c.id * 0.618) % 1;
  return {
    text: fresh(g, life, `${kind}${c.id}`, lines, pick, 120),
    news: false,
  };
}

/**
 * A word with another player's character: only what you did. Their own
 * player says and does the rest (no laughing at your story in their name).
 */
const WITH_PLAYER = [
  (n: string) => `You pass the time of day with ${n}.`,
  (n: string) => `You stop for a word with ${n}.`,
  (n: string) => `You spend an hour in ${n}'s company.`,
  (n: string) => `You seek out ${n} for a talk.`,
];

export function playerTalkLine(
  g: ConquestGame,
  life: Life,
  c: Character,
): string {
  const roll = cdice(g.s, 59, life.c, c.id, g.s.day).next();
  const lines = WITH_PLAYER.map((f) => f(charName(c)));
  return fresh(g, life, `tp${c.id}`, lines, roll, 60);
}

// ---------------------------------------------------------------- the crown

const CROWN_OK = [
  (city: string) =>
    `Your letter reached the right desk in ${city}. Someone there knows your name now.`,
  (city: string, board: string) =>
    `Your letter to ${board} is read, minuted and answered in a clerk's hand: your name is on a list in ${city} now, near the top.`,
  (city: string, board: string) =>
    `A secretary at ${board} thanks you for your "judicious observations". In ${city}, that is practically a knighthood.`,
  (city: string) =>
    `Your letter is passed from desk to desk in ${city} and arrives, by some miracle, on the right one.`,
  (city: string, board: string) =>
    `Word comes back from ${city}: your letter was read aloud at ${board}, and nobody laughed.`,
  (city: string) =>
    `Your letter reaches ${city} in a month and a great man's ear in two. He mentions your name at dinner.`,
];

const CROWN_BAD = [
  () => "Your letter was read, filed, and very possibly used to wrap a fish.",
  (city: string, board: string) =>
    `Your letter to ${board} is acknowledged on a printed form, with your name spelled three ways.`,
  (city: string, board: string) =>
    `Your letter went down with the packet, or so the clerk at ${board} would like you to believe.`,
  (city: string) =>
    `Your letter reaches ${city} the week a ministry falls. Nobody there knows who anybody is, least of all you.`,
];

/**
 * A letter to the crown: a line from a pool, with the right city and board
 * for the colony's crown (no more "London (or Paris, or Seville)"), none
 * again within the year. The letter's favour is real, so it's written down.
 */
export function crownLine(g: ConquestGame, life: Life, pass: boolean): string {
  const s = g.s;
  const me = s.chars[life.c];
  const home = me ? homeOf(s, me) : HOME.english;
  const pool = (pass ? CROWN_OK : CROWN_BAD).map((f) =>
    f(home.city, home.board),
  );
  const roll = cdice(s, 83, life.c, s.day).next();
  return fresh(g, life, pass ? "cok" : "cbad", pool, roll, 300);
}

// ---------------------------------------------------------------- a gift

const THANKS = [
  "They thank you.",
  "They thank you, and count it when they think you aren't looking.",
  "They pocket it with a little bow.",
  "They say you shouldn't have, and keep it.",
  "They thank you, a shade more warmly than the sum deserves.",
];

const THANKS_BIG = [
  "They won't forget it.",
  "They'll remember it, and say so.",
  "They hold your hand a moment longer than they need to: they won't forget this.",
];

/** How someone of the computer's takes a gift (none again soon); another player's own thanks are theirs to give. */
export function giftThanks(
  g: ConquestGame,
  life: Life,
  c: Character,
  big: boolean,
): string {
  if (g.s.lives.some((l) => l.c === c.id)) return "";
  const roll = cdice(g.s, 89, life.c, c.id, g.s.day).next();
  return fresh(
    g,
    life,
    big ? "gb" : "gt",
    big ? THANKS_BIG : THANKS,
    roll,
    120,
  );
}

// ---------------------------------------------------------------- flattery

const FLATTER_OK = [
  (n: string) => `${n} colours at your praise, and stands a little taller.`,
  (n: string) =>
    `${n} says you're too kind, in a voice that hopes you'll go on.`,
  (n: string) =>
    `You admire ${n}'s judgement. ${n} admires yours for noticing.`,
  (n: string) =>
    `${n} pretends not to have heard the compliment, and asks you to repeat it.`,
  (n: string) =>
    `You praise ${n}'s speech at the last sitting. It was a long speech; it gets longer in the retelling.`,
  (n: string) =>
    `${n} accepts your praise as a tribute long overdue, and is pleased you've paid it.`,
  (n: string) =>
    `${n} waves the compliment away with a hand that has just been admired too.`,
  (n: string) =>
    `You tell ${n} the colony would be lost without them. They don't disagree.`,
];

const FLATTER_BAD = [
  (n: string) => `${n} saw through the flattery, and said so.`,
  (n: string) => `${n} thanks you for the compliment and asks what you want.`,
  (n: string) => `${n} has heard that one before, from a better liar.`,
  (n: string) => `${n} looks at you as if you'd tried to sell them a horse.`,
  (n: string) => `Laid on with a trowel: ${n} brushes it off like plaster.`,
  (n: string) =>
    `${n} smiles thinly and changes the subject to the price of soap.`,
];

/** A line for praise given: the same not again within a season. */
export function flatterLine(
  g: ConquestGame,
  life: Life,
  c: Character,
  pass: boolean,
): string {
  const name = charName(c);
  const pool = (pass ? FLATTER_OK : FLATTER_BAD).map((f) => f(name));
  const roll = cdice(g.s, 61, life.c, c.id, g.s.day).next();
  return fresh(g, life, `${pass ? "fo" : "fb"}${c.id}`, pool, roll, 150);
}

// ---------------------------------------------------------------- the round

const ROUNDS = [
  (p: string) =>
    `You stood the house a round at ${p}. They'll drink to your health, and remember your name.`,
  (p: string) =>
    `A round for the house at ${p}: the landlord chalks it up and the house drinks it down.`,
  (p: string) =>
    `You call for a round at ${p}. A carter proposes your health; a cooper seconds it; nobody opposes.`,
  (p: string) =>
    `Drinks on you at ${p}. A fiddler finds he knows a tune with your name in it, near enough.`,
  (p: string) =>
    `You stand the house a round at ${p}, and three men you've never met tell you you're a gentleman.`,
  (p: string) =>
    `A round at ${p}. The talk turns to you, kindly, for as long as the punch lasts.`,
  (p: string) =>
    `You buy the tavern at ${p} its evening. It thanks you in song, badly.`,
  (p: string) =>
    `Punch for the house at ${p}. The landlord's wife makes it strong; the house's opinion of you rises with every ladle.`,
  (p: string) =>
    `A round at ${p}. A man by the fire raises his pot to you, and then to the King, and then to you again.`,
  (p: string) =>
    `You stand a round at ${p}. Somebody's dog drinks the cooper's, which is the talk of the evening.`,
];

/** The tavern round: a line from a larger pool, written down the first few times a year. */
export function roundLine(g: ConquestGame, life: Life, here: string): void {
  const roll = cdice(g.s, 71, life.c, g.s.day).next();
  const text = fresh(
    g,
    life,
    "round",
    ROUNDS.map((f) => f(here)),
    roll,
    200,
  );
  sayOrWrite(g, life, "round", text);
}

// ---------------------------------------------------------------- alms and pamphlets

const ALMS = [
  "You gave alms at the church door.",
  "Alms at the church door: an old soldier blesses you, and asks if you could spare the same again next week.",
  "You give at the church door. The churchwarden writes it down; the minister makes a note of it.",
  "A widow with three children takes your alms and tells you the youngest is named for a governor.",
  "Alms for the poor: the sexton says he's never seen the box so heavy, which you take to mean he has.",
  "You leave a coin in the poor-box and another in the hand of a boy with no shoes.",
];

export function almsLine(g: ConquestGame, life: Life): void {
  const roll = cdice(g.s, 73, life.c, g.s.day).next();
  sayOrWrite(g, life, "alms", fresh(g, life, "alms", ALMS, roll, 200));
}

const PAMPHLET_OK = [
  "Your pamphlet sold out and was argued over in every tavern.",
  "Your pamphlet goes through a second printing, and a parson preaches against it, which sells a third.",
  "Your pamphlet is read aloud in the coffee-house; the man reading it does the voices.",
  "Your pamphlet is answered by another, anonymous and furious. Everyone knows who wrote it, and buys yours.",
  "Your pamphlet is quoted in the house, by a member who gets the page number right.",
  "The printer can't keep your pamphlet in stock; the post riders carry it to every county.",
];

const PAMPHLET_BAD = [
  "Your pamphlet was used, mostly, to light pipes.",
  "Your pamphlet is remaindered to the grocer, who wraps candles in it.",
  "Your pamphlet is read by the printer, your mother and a man who wants his money back.",
  "Your pamphlet has a misprint in the first line that is funnier than anything in the rest.",
  "Your pamphlet comes out the same week as a better one. Nobody notices yours.",
  "Your pamphlet is answered by a broadside so witty that people quote it to you.",
];

/** A pamphlet's reception, from larger pools; written down the first few times a year. */
export function pamphletLine(g: ConquestGame, life: Life, pass: boolean): void {
  const roll = cdice(g.s, 79, life.c, g.s.day).next();
  const text = fresh(
    g,
    life,
    pass ? "pok" : "pbad",
    pass ? PAMPHLET_OK : PAMPHLET_BAD,
    roll,
    200,
  );
  sayOrWrite(g, life, "pamphlet", text, false, pass ? "good" : "bad");
}

// ---------------------------------------------------------------- the levee

/** The levee when it's the same faces as last time. */
const USUAL = [
  "At the governor's levee: the usual company.",
  "At the governor's levee: the same faces, the same wigs, and the same story about the Spanish ambassador.",
  "At the governor's levee: everyone who was there last time, standing where they stood last time.",
  "At the governor's levee: the usual company, a little older and no wiser, and you with them.",
  "At the governor's levee: the usual company, and the governor's usual Madeira.",
];

/**
 * The levee: the faces there. The first time, everyone by name; the same
 * faces again, "the usual company" (and after the first few that year, only
 * said); new faces named as new, and anyone missing.
 */
export function leveeLine(g: ConquestGame, life: Life, met: Character[]): void {
  const s = g.s;
  const ids = met.map((c) => c.id).sort((a, b) => a - b);
  const c = chat(g, life);
  const before = c.levee ?? [];
  c.levee = ids;
  if (!ids.length) {
    sayOrWrite(
      g,
      life,
      "levee",
      "At the governor's levee: nobody worth the trip.",
    );
    return;
  }
  if (!before.length) {
    journal(
      g,
      life,
      `At the governor's levee you meet ${listWords(met.map((x) => charName(x)))}.`,
    );
    return;
  }
  const newFaces = met.filter((x) => !before.includes(x.id));
  const gone = before
    .filter((id) => !ids.includes(id))
    .map((id) => s.chars[id])
    .filter((x): x is Character => !!x);
  if (!newFaces.length && !gone.length) {
    const roll = cdice(s, 67, life.c, s.day).next();
    sayOrWrite(g, life, "levee", fresh(g, life, "lv", USUAL, roll, 300));
    return;
  }
  const parts: string[] = [];
  if (newFaces.length)
    parts.push(`new among them ${listWords(newFaces.map((x) => charName(x)))}`);
  if (gone.length)
    parts.push(
      `${listWords(gone.map((x) => charName(x)))} ${gone.length === 1 ? "is" : "are"} missed${gone.some((x) => !x.alive) ? " (the churchyard has its own levee)" : ""}`,
    );
  journal(
    g,
    life,
    `At the governor's levee: the usual company; ${parts.join("; ")}.`,
  );
}

// ---------------------------------------------------------------- the talk of the town

interface Gossip {
  text: string;
  /** Only in these years (inclusive), if given. */
  from?: number;
  to?: number;
}

/** The town's old stories: each heard at most twice in a life. */
export const GOSSIP_LINES: Gossip[] = [
  {
    text: "A ship's mate swears he saw a sea serpent off the Capes. He was sober, he says.",
  },
  {
    text: "Somebody's cow got into the churchyard. The minister is taking it personally.",
  },
  {
    text: "The magistrate's daughter has turned down a third suitor. The fourth is in the corner.",
  },
  {
    text: "There's talk of war in Europe. There's always talk of war in Europe.",
  },
  {
    text: "A preacher passed through who could make a stone weep and a drunkard sign the pledge. Neither lasted.",
  },
  {
    text: "Two gentlemen nearly fought a duel over a horse. The horse has since died, which settled it.",
  },
  {
    text: "The new tax is either a scandal or a necessity, depending who's buying.",
  },
  {
    text: "The miller's wife has left the miller for a fiddler. The miller says the fiddler will be back.",
  },
  {
    text: "A peddler is selling a cure for the ague that is mostly rum. It's selling very well.",
  },
  {
    text: "The schoolmaster has been seen reading a novel. The vestry is considering what to do.",
  },
  {
    text: "A bear came into the town in the night, looked about, and left. People are offended.",
  },
  {
    text: "The ferryman has raised his price again. The ferryman says the river has.",
  },
  {
    text: "The parson's son has run off to sea. The parson says it's a calling, of a sort.",
  },
  {
    text: "A gentleman lost his wig in the wind on the court-house green and a goat ate it before he could catch it.",
  },
  {
    text: "The sheriff's horse is lame, which is the first time anyone has been glad of a lame horse.",
  },
  {
    text: "A Frenchman came through selling ribbons and asking questions. The ribbons were very good.",
  },
  {
    text: "The lawyer and the doctor are suing each other. The town hopes both win.",
  },
  {
    text: "There's a man at the docks who says he sailed with Captain Kidd. He says it every night, for a pint.",
    from: 1699,
    to: 1740,
  },
  {
    text: "They say Blackbeard has a wife in every port and a pardon in every pocket.",
    from: 1717,
    to: 1718,
  },
  {
    text: "Everybody's cousin in London has lost a fortune in the South Sea stock. Everybody's cousin in London had one.",
    from: 1720,
    to: 1722,
  },
  {
    text: "Port Royal is under the sea, they say: the wickedest town in the world, swallowed in an afternoon.",
    from: 1692,
    to: 1695,
  },
  {
    text: "They're hanging witches at Salem. The minister here says he'd want better evidence; the minister's wife says nothing at all.",
    from: 1692,
    to: 1693,
  },
  {
    text: "A Mr Whitefield preaches in the fields to ten thousand at a time, and makes them all cry.",
    from: 1739,
    to: 1745,
  },
  {
    text: "There's a comet in the west after dark. The minister says it means something; the almanac maker says it means a good year for almanacs.",
    from: 1680,
    to: 1681,
  },
  {
    text: "A Mr Franklin of Philadelphia has been flying a kite in a thunderstorm on purpose. He's alive, which surprises everyone.",
    from: 1752,
    to: 1755,
  },
  {
    text: "They say an Admiral Vernon took Porto Bello with six ships. Every tavern in the colony is being renamed for him.",
    from: 1740,
    to: 1742,
  },
  {
    text: "Some say the Stamp Act will ruin the colonies. Others say it'll ruin the stamp distributors first, and are working on it.",
    from: 1765,
    to: 1766,
  },
  {
    text: "A woman at the market sells a tea from the woods that she swears is better than China's. It isn't, but it's cheaper.",
  },
  {
    text: "The church bell cracked ringing for the King's birthday. Some call it an omen; the bell-founder calls it a commission.",
  },
  {
    text: "A traveller swears the roads in Pennsylvania have bridges. Nobody believes him.",
  },
];

/** The talk of the town that's really so: what's before the house and the council, a war, a sickness, the governor's gout. */
function townNews(
  g: ConquestGame,
  life: Life,
): { key: string; text: string; rest: number } | null {
  const s = g.s;
  const p = life.prov;
  const n = s.provinces[p]?.owner ?? -1;
  const nation = s.nations[n];
  if (!nation) return null;
  const out: { key: string; text: string; rest: number }[] = [];
  const cab = s.power?.cabinets[n];
  const bill = cab?.bills.find((b) => b.stage === "house");
  if (bill && bill.by !== life.c) {
    const member = s.chars[bill.by];
    const title = lower(
      bill.title.replace(
        "{county}",
        g.map.provinces[bill.p]?.name ?? "the county",
      ),
    );
    // Another player's bill is told as what they did, no more.
    const played = s.lives.some((l) => l.c === bill.by);
    out.push({
      key: `bill:${bill.id}`,
      text: played
        ? `The house is sitting on ${title}, brought in by ${charName(member)}. The taproom is divided, and says so.`
        : `The house is sitting on ${title}. ${member ? `${charName(member)} spoke for it for three hours` : "A member spoke for three hours"} and changed nobody's mind.`,
      rest: 9999,
    });
  }
  const matter = cab?.matters.find((m) => m.status === "open");
  if (matter)
    out.push({
      key: `matter:${matter.id}`,
      text: `They say the council will divide on ${lower(matter.title)}. Opinion in the taproom is against it, whatever it is.`,
      rest: 9999,
    });
  const last = cab?.session;
  if (last?.carried !== undefined && s.day - last.until < 60)
    out.push({
      key: `session:${last.id}`,
      text: `The talk is all of the house's session: ${last.text ? lower(last.text) : "what it carried, and who spoke for what"}`,
      rest: 9999,
    });
  const gov = s.chars[nation.ruler];
  if (gov?.alive && hasTrait(gov, "gouty"))
    out.push({
      key: `gout:${gov.id}`,
      text: `They say the governor's gout is worse, and his temper with it.`,
      rest: 365,
    });
  const war = s.wars.find((w) => w.a === n || w.b === n);
  if (war) {
    const foe = s.nations[war.a === n ? war.b : war.a];
    const yr = Math.floor((s.day - war.start) / 365);
    const lines =
      foe?.kind === "native"
        ? [
            `A trader back from the interior says the ${foe.name} are painting for war in every village.`,
            `A ranger in from the frontier says the ${foe.name} burned two cabins on the creek last week. He says it twice, and orders rum.`,
            `They say the ${foe.name} have sent the war belt to their neighbours. Nobody knows who has taken it up.`,
          ]
        : [
            `A trader back from the interior says the ${foe?.adjective ?? "enemy"} are building forts on every river.`,
            `A sailor off a prize says the ${foe?.adjective ?? "enemy"} privateers are thick as gulls off the capes.`,
            `They say the ${foe?.adjective ?? "enemy"} will be at the falls by spring. They said it last spring too.`,
          ];
    out.push({
      key: `war:${war.a}-${war.b}-${war.start}:${yr}`,
      text: lines[yr % lines.length],
      rest: 300,
    });
  }
  const sick = s.provinces[p]?.mods.find(
    (m) => (m.fx.disease ?? 0) > 0 && m.until > s.day,
  );
  if (sick)
    out.push({
      key: `sick:${p}:${sick.key}:${sick.until}`,
      text: `${sick.label} in the town, they say. Or measles. Or a rumour of it. The doctor is very busy and very cheerful.`,
      rest: 9999,
    });
  const tob = s.europe.price.tobacco;
  if (tob !== undefined && tob < 3.5) {
    const y = Math.floor(dateOf(s.day).year / 2);
    const lines = [
      "The price of tobacco is down again, and the planters are in a black mood.",
      "Tobacco's down again. A planter at the next table is explaining why it's the merchants' fault, at length, to a merchant.",
      "Tobacco's so cheap the ministers are refusing their salaries in it. The ministers are not pleased; nor is anyone else.",
    ];
    out.push({
      key: `tob:${y}`,
      text: lines[y % lines.length],
      rest: 2 * Y,
    });
  }
  return out.find((x) => newsFresh(life, x.key, s.day, x.rest)) ?? null;
}

/**
 * The talk of the town: news first (always written down), then the old
 * stories (each heard twice in a life at most, a couple of years apart, and
 * the first few a year written down). With nothing new, nothing is written.
 * `roll` is a number the caller has rolled already.
 */
export function gossipAt(g: ConquestGame, life: Life, roll: number): void {
  const s = g.s;
  const news = townNews(g, life);
  if (news) {
    mark(g, life, `news:${news.key}`);
    sayOrWrite(g, life, "drink", news.text, true);
    return;
  }
  const year = dateOf(s.day).year;
  const used = life.chatter?.used ?? {};
  const free = GOSSIP_LINES.map((x, i) => ({ x, i })).filter(
    ({ x, i }) =>
      (x.from === undefined || year >= x.from) &&
      (x.to === undefined || year <= x.to) &&
      (used[`g#${i}`] ?? 0) < GOSSIP_HEARINGS &&
      (used[`g:${i}`] ?? -Infinity) + 2 * Y <= s.day,
  );
  if (!free.length) {
    aside(g, life, "The talk is of nothing you haven't heard.");
    return;
  }
  // Dated stories first: they're news in their year.
  const dated = free.filter(({ x }) => x.from !== undefined);
  const pool = dated.length && roll < 0.6 ? dated : free;
  const pick =
    pool[
      Math.min(pool.length - 1, Math.floor(((roll * 104729) % 1) * pool.length))
    ];
  const c = chat(g, life);
  c.used[`g#${pick.i}`] = (c.used[`g#${pick.i}`] ?? 0) + 1;
  c.used[`g:${pick.i}`] = s.day;
  sayOrWrite(g, life, "drink", pick.x.text);
}

/** For tests: a stable key for a line (how the harness counts them). */
export const lineKey = (t: string) => strHash(t);
