// Things that happen in a life, Crusader Kings fashion: a letter or a knock
// at the door with two to four choices, raised by what's going on (your
// trade, where you are, your traits and family, the season, a war, a
// movement, an office). Many choices test a skill, with the odds shown, and
// what they do lasts: traits, opinions, money, health and renown.

import { dateOf } from "./Calendar";
import { kill } from "./Characters";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
import { hooks } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainTrait,
  gainXp,
  heal,
  hurt,
  journal,
  loseTrait,
  meet,
  milestone,
  outcomeMeta,
  remembers,
  rollCheck,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import {
  ageOfLife,
  isChildLife,
  isNativeChar,
  lifeIsNative,
  meOf,
  opinionOf,
  portionOf,
  skillLevel,
  stationOf,
} from "./LifeQueries";
import { checkChance, HOUSES, LODGES, SKILL_NAMES } from "./LifeRules";
import { isHurricaneSeason, isWinter } from "./Map";
import { ageOf, charName, hasTrait, settlers } from "./Queries";
import type {
  Character,
  EventChoice,
  JobKind,
  Life,
  LifeEventPending,
  Skill,
  TraitId,
} from "./Types";

export type LCtx = Record<string, number>;

/** A fire takes the roof: your own house needs rebuilding (or is the less for it). */
export function houseFire(g: ConquestGame, life: Life): void {
  const house = (life.property ?? []).find(
    (p) => p.kind === "house" && p.prov === life.home,
  );
  if (!house) {
    say(
      g,
      life,
      "The lodgings you rented burned. You got out with the family Bible and one boot.",
      "bad",
    );
    return;
  }
  const defs = native(g, life) ? LODGES : HOUSES;
  const repair = Math.round((defs[house.level - 1]?.cost ?? 20) * 0.3);
  if (life.purse >= repair) {
    spend(g, life, repair);
    say(
      g,
      life,
      `Your ${house.name.toLowerCase()} burned half to the ground. Rebuilding it costs ${repair} coins.`,
      "bad",
    );
    return;
  }
  touchLife(g, life);
  if (house.level <= 1)
    life.property = (life.property ?? []).filter((p) => p !== house);
  else {
    house.level--;
    house.name = defs[house.level - 1].name;
  }
  say(
    g,
    life,
    `Your house burned, and there's no money to rebuild it as it was. You got out with the family Bible and one boot.`,
    "bad",
  );
}

/** A child of yours marries the match their family brought. */
function wedChild(g: ConquestGame, life: Life, ctx: LCtx): Character {
  const c = g.char(ctx.c);
  const m = g.char(ctx.m);
  c.spouse = m.id;
  m.spouse = c.id;
  if (!c.female && c.religion !== "native") m.family = c.family;
  else if (c.religion !== "native") c.family = m.family;
  m.home = c.home = c.home ?? life.home;
  say(g, life, `${c.first} married ${charName(m)}. You danced, badly.`, "good");
  milestone(g, life, "married", `${c.first} married ${charName(m)}`);
  return c;
}

export interface LifeChoice {
  label: string | ((g: ConquestGame, life: Life, ctx: LCtx) => string);
  tip: string | ((g: ConquestGame, life: Life, ctx: LCtx) => string);
  /** A skill check, with the odds shown on the button. */
  check?: {
    /** LIFE (r11): or worked out (a matter at work tests your own trade's skill). */
    skill: Skill | ((g: ConquestGame, life: Life, ctx: LCtx) => Skill);
    dc: number | ((g: ConquestGame, life: Life, ctx: LCtx) => number);
  };
  blocked?: (g: ConquestGame, life: Life, ctx: LCtx) => string | null;
  apply: (g: ConquestGame, life: Life, ctx: LCtx, pass: boolean) => void;
}

export interface LifeEventDef {
  key: string;
  /** Daily draw ("any"), on the road, at sea, or only raised by the game. */
  pool: "any" | "road" | "sea" | "raised";
  weight?: number;
  /** Days before it can come again for this life. */
  cooldown: number;
  when?: (g: ConquestGame, life: Life) => LCtx | null;
  title: string | ((g: ConquestGame, life: Life, ctx: LCtx) => string);
  body: (g: ConquestGame, life: Life, ctx: LCtx) => string;
  choices: LifeChoice[];
  /** The backdrop of its scene (a place, "road", "deck", "letter"...). */
  scene?: string | ((g: ConquestGame, life: Life, ctx: LCtx) => string);
}

/** Chance a day that something happens to a settled life. */
export const EVENT_CHANCE = 1 / 55;
/** At most this many waiting at once. */
export const MAX_PENDING = 2;
/** Game days before an unanswered event decides itself (the server's real-time clock is quicker). */
export const LIFE_EVENT_DAYS = 120;

// ---------------------------------------------------------------- helpers

const me = (g: ConquestGame, life: Life) => meOf(g.s, life)!;
const here = (g: ConquestGame, life: Life) => g.map.provinces[life.prov].name;
const month = (g: ConquestGame) => dateOf(g.s.day).month;
const year = (g: ConquestGame) => dateOf(g.s.day).year;
const job = (life: Life, ...kinds: JobKind[]) =>
  !!life.job && kinds.includes(life.job.kind);
const adult = (g: ConquestGame, life: Life) => !isChildLife(g.s, life);
const trait = (g: ConquestGame, life: Life, t: TraitId) =>
  hasTrait(me(g, life), t);
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const warNow = (g: ConquestGame, life: Life) =>
  g.s.wars.some(
    (w) => w.a === me(g, life).nation || w.b === me(g, life).nation,
  );
const colonist = (g: ConquestGame, life: Life) => !lifeIsNative(g.s, life);
const native = (g: ConquestGame, life: Life) => lifeIsNative(g.s, life);
const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

interface Fx {
  coins?: number;
  renown?: number;
  stress?: number;
  health?: number;
  favor?: number;
  xp?: Partial<Record<Skill, number>>;
  gain?: TraitId;
  lose?: TraitId;
}

function fx(g: ConquestGame, life: Life, f: Fx, cause = "misadventure"): void {
  if (f.coins) earn(g, life, f.coins);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.favor) touchLife(g, life).favor = Math.max(0, life.favor + f.favor);
  for (const [k, v] of Object.entries(f.xp ?? {}))
    gainXp(g, life, k as Skill, v ?? 0);
  if (f.gain) gainTrait(g, life, f.gain);
  if (f.lose) loseTrait(g, life, f.lose);
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, cause);
  }
}

const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

/** Someone local, for events that need a face. */
function someone(
  g: ConquestGame,
  life: Life,
  pick: (c: Character) => boolean = () => true,
): Character | undefined {
  const s = g.s;
  const list = householdsOf(s, life.prov).filter(
    (c) =>
      c.id !== life.c &&
      ageOf(s, c) >= 16 &&
      pick(c) &&
      !s.lives.some((l) => l.c === c.id),
  );
  return g.rng.pick(list);
}

function spouseOf(g: ConquestGame, life: Life): Character | undefined {
  const c = g.s.chars[me(g, life).spouse];
  return c?.alive ? c : undefined;
}

function kidsOf(g: ConquestGame, life: Life): Character[] {
  return me(g, life)
    .children.map((k) => g.s.chars[k])
    .filter((c): c is Character => !!c?.alive && !c.abroad);
}

// ---------------------------------------------------------------- the events

const BASE_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ the road
  {
    key: "road-bandits",
    pool: "road",
    cooldown: 200,
    title: "Men on the road",
    body: (g, life) =>
      `Three men step out of the trees ahead, one with a fowling piece he's holding the wrong way round. "Your purse," says the one with the fewest teeth, "and we'll all go home." You have ${Math.floor(life.purse)} coins on you.`,
    choices: [
      {
        label: "Hand it over",
        tip: "Lose half your purse. Keep your skin.",
        apply: (g, life) => {
          const lost = Math.round(Math.max(0, life.purse) * 0.5);
          spend(g, life, lost);
          fx(g, life, { stress: 6 });
          say(
            g,
            life,
            `You gave up ${lost} coins on the road to men who thanked you, which was the worst part.`,
            "bad",
          );
        },
      },
      {
        label: "Fight them off",
        tip: "Win: +3 renown and their pistol's worth. Lose: hurt, and your purse anyway.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 3, coins: 2, xp: { fighting: 15 } });
            say(
              g,
              life,
              "You laid one out and the others ran. The fowling piece fetched two coins.",
              "good",
            );
          } else {
            spend(g, life, Math.round(Math.max(0, life.purse) * 0.6));
            fx(
              g,
              life,
              { health: -18, xp: { fighting: 8 } },
              "a beating from highwaymen",
            );
            say(g, life, "They beat you and took most of what you had.", "bad");
          }
        },
      },
      {
        label: "Talk your way past",
        tip: "Persuade them you're poorer than they are.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { xp: { persuasion: 12 }, stress: -2 });
            say(
              g,
              life,
              "By the end of it they'd given you a turnip and their sympathies.",
              "good",
            );
          } else {
            spend(g, life, Math.round(Math.max(0, life.purse) * 0.5));
            say(
              g,
              life,
              "They weren't convinced. Half your purse went with them.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "road-river",
    pool: "road",
    cooldown: 150,
    title: "A river in flood",
    body: () =>
      "Spring rain has turned the ford into a brown torrent carrying whole trees. The ferryman, if there was one, has sensibly gone home.",
    choices: [
      {
        label: "Wait for it to go down",
        tip: "A week lost on the bank; −1 coin in food.",
        apply: (g, life) => {
          if (life.travel) life.travel.arrive += 6;
          fx(g, life, { coins: -1, stress: 2 });
        },
      },
      {
        label: "Swim it",
        tip: "Quick, if you make it.",
        check: { skill: "woodcraft", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { xp: { woodcraft: 12 }, renown: 1 });
          else {
            fx(g, life, { health: -20 }, "drowning in a river crossing");
            say(
              g,
              life,
              "The current took you a mile downstream before it let go.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "road-stranger",
    pool: "road",
    cooldown: 200,
    title: "A kindly stranger",
    body: (g, life) =>
      `At a farmhouse near ${g.map.provinces[life.travel?.path[0] ?? life.prov].name} a widow gives you supper, a bed in the loft and more advice than you asked for.`,
    choices: [
      {
        label: "Leave a coin on the table",
        tip: "−1 coin; you sleep the better for it.",
        apply: (g, life) => fx(g, life, { coins: -1, stress: -6, renown: 0.5 }),
      },
      {
        label: "Mend her fence before you go",
        tip: "+craft. She'll remember you.",
        apply: (g, life) => fx(g, life, { xp: { craft: 10 }, stress: -3 }),
      },
    ],
  },
  {
    key: "road-hunters",
    pool: "road",
    cooldown: 250,
    when: (g, life) => (colonist(g, life) ? {} : null),
    title: "A hunting party",
    body: () =>
      "A dozen men of the country step onto the path, bows strung, deer slung on poles. They look at you the way you'd look at a pig that had wandered into church.",
    choices: [
      {
        label: "Offer gifts and share the road",
        tip: "−2 coins; +persuasion, and they guide you a day's walk.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, { coins: -2, xp: { persuasion: 10, woodcraft: 6 } });
          if (life.travel)
            life.travel.arrive = Math.max(g.s.day + 1, life.travel.arrive - 2);
          say(
            g,
            life,
            "Tobacco and a knife changed hands. They showed you a shorter path and laughed at your boots.",
            "good",
          );
        },
      },
      {
        label: "Try to speak their language",
        tip: "A few words learned at the trading post.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 1, xp: { persuasion: 14 } });
            say(
              g,
              life,
              "Your grammar was dreadful but your meaning was clear. You parted friends.",
              "good",
            );
          } else {
            fx(g, life, { stress: 6 });
            say(
              g,
              life,
              "You appear to have said something about their mother. You left quickly.",
            );
          }
        },
      },
      {
        label: "Back away slowly",
        tip: "A long way round: three more days.",
        apply: (g, life) => {
          if (life.travel) life.travel.arrive += 3;
          fx(g, life, { stress: 3 });
        },
      },
    ],
  },
  {
    key: "road-lost",
    pool: "road",
    cooldown: 200,
    title: "Lost",
    body: () =>
      "The path forked twice, faded once and then turned into a deer track that turned into nothing. Every tree looks like the last one.",
    choices: [
      {
        label: "Read the moss and the sun",
        tip: "Woodcraft finds the way.",
        check: { skill: "woodcraft", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { xp: { woodcraft: 14 } });
          else {
            if (life.travel) life.travel.arrive += 5;
            fx(g, life, { health: -6, stress: 6 }, "exposure in the woods");
            say(
              g,
              life,
              "Five days lost before you found a road, and a farmer who laughed.",
              "bad",
            );
          }
        },
      },
      {
        label: "Go back the way you came",
        tip: "Three days lost, but no worse.",
        apply: (g, life) => {
          if (life.travel) life.travel.arrive += 3;
        },
      },
    ],
  },
  {
    key: "road-wolves",
    pool: "road",
    cooldown: 300,
    when: (g, life) =>
      isWinter(g.map.provinces[life.prov].lat, month(g)) ? {} : null,
    title: "Wolves in the snow",
    body: () =>
      "They've been following you since noon: grey shapes keeping pace in the trees. Tonight they're closer.",
    choices: [
      {
        label: "Build a big fire and stay awake",
        tip: "A sleepless night: +stress, but safe.",
        apply: (g, life) => fx(g, life, { stress: 10, xp: { woodcraft: 6 } }),
      },
      {
        label: "Shoot the leader",
        tip: "One good shot sends them off.",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 2, coins: 1, xp: { fighting: 12 } });
            say(
              g,
              life,
              "One shot, one wolf. The pelt fetched a coin and a story.",
              "good",
            );
          } else fx(g, life, { health: -15 }, "a wolf's bite gone bad");
        },
      },
    ],
  },
  {
    key: "road-deserters",
    pool: "road",
    cooldown: 300,
    when: (g, life) => (warNow(g, life) ? {} : null),
    title: "Deserters",
    body: () =>
      "Two soldiers in ragged coats, no muskets, sharing a stolen chicken by a fire. They see you and freeze. Hanging is the usual price for what they've done.",
    choices: [
      {
        label: "Share the chicken, keep your mouth shut",
        tip: "+stress relief; they tell you the army's news.",
        apply: (g, life) => {
          fx(g, life, { stress: -4 });
          say(
            g,
            life,
            "They told you the war was going badly and the food worse. Both seemed true.",
          );
        },
      },
      {
        label: "Turn them in at the next fort",
        tip: "+2 renown with the authorities; they hang.",
        apply: (g, life) => {
          fx(g, life, { renown: 2, favor: 2, stress: 4 });
          say(g, life, "You told the sergeant. You didn't stay to watch.");
        },
      },
    ],
  },
  {
    key: "road-peddler",
    pool: "road",
    cooldown: 250,
    title: "A Yankee peddler",
    body: () =>
      "A peddler with a cart of tin pans, ribbons, nutmegs (wooden, you suspect) and a cure-all elixir he swears by, and on, and at.",
    choices: [
      {
        label: "Buy the elixir (2 coins)",
        tip: "It's mostly rum. Health might improve; stress certainly will.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life) => {
          fx(g, life, {
            coins: -2,
            stress: -8,
            health: g.rng.chance(0.3) ? 5 : 0,
          });
          say(
            g,
            life,
            "Mostly rum, some molasses, and a beetle. You felt wonderful.",
          );
        },
      },
      {
        label: "Haggle him down for fun",
        tip: "Trade practice; maybe a bargain.",
        check: { skill: "trade", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { trade: 12 } });
          if (pass) {
            fx(g, life, { coins: 2 });
            say(
              g,
              life,
              "You sold him your old hat for more than he sold you a new one.",
              "good",
            );
          } else
            say(g, life, "Somehow you bought a wooden nutmeg. He's very good.");
        },
      },
    ],
  },
  {
    key: "road-fever-village",
    pool: "road",
    cooldown: 400,
    title: "A village with the fever",
    body: () =>
      "The next village has a rag tied to every gatepost and nobody in the street. A woman calls from a window: her children are burning up and the physician won't come.",
    choices: [
      {
        label: "Go in and help",
        tip: "Medicine helps them; you may catch it.",
        check: { skill: "medicine", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { medicine: 15 }, renown: pass ? 3 : 1 });
          if (g.rng.chance(pass ? 0.15 : 0.35))
            fx(g, life, { health: -22 }, "a fever caught nursing the sick");
          say(
            g,
            life,
            pass
              ? "Two of the children lived because you came. Their mother won't forget you."
              : "You did what you could. It wasn't enough.",
            pass ? "good" : "bad",
          );
        },
      },
      {
        label: "Leave food at the gate and go round",
        tip: "−1 coin. Safe.",
        apply: (g, life) => fx(g, life, { coins: -1, stress: 3 }),
      },
    ],
  },
  // ------------------------------------------------ the sea
  {
    key: "sea-storm",
    pool: "sea",
    cooldown: 150,
    title: "A storm at sea",
    body: () =>
      "The sky goes the colour of a bruise. By nightfall the waves are higher than the mainmast and the captain is praying in three languages.",
    choices: [
      {
        label: "Lend a hand on deck",
        tip: "Seamanship keeps the ship (and you) afloat.",
        check: { skill: "seamanship", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { seamanship: 18 } });
          if (pass) {
            fx(g, life, { renown: 2 });
            say(
              g,
              life,
              "You hauled on the right ropes at the right moments. The captain shook your hand.",
              "good",
            );
          } else fx(g, life, { health: -15 }, "a fall on a heaving deck");
        },
      },
      {
        label: "Pray below decks",
        tip: "+faith. The ship survives or it doesn't.",
        apply: (g, life) => {
          fx(g, life, { xp: { faith: 10 }, stress: 8 });
          if (life.travel) life.travel.arrive += 3;
        },
      },
    ],
  },
  {
    key: "sea-privateer",
    pool: "sea",
    cooldown: 300,
    when: (g, life) => (warNow(g, life) || g.rng.chance(0.3) ? {} : null),
    title: "A sail on the horizon",
    body: () =>
      'A sleek sloop, no colours flying, coming up fast. The mate counts her gunports and goes pale. "Privateer," he says, "or worse."',
    choices: [
      {
        label: "Help man the guns",
        tip: "Fight her off: renown if you win, wounds if you don't.",
        check: { skill: "fighting", dc: 9 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { fighting: 15, seamanship: 8 } });
          if (pass) {
            fx(g, life, { renown: 4 });
            say(
              g,
              life,
              "Your broadside took her foremast. She sheered off and you cheered yourselves hoarse.",
              "good",
            );
          } else {
            spend(g, life, Math.round(Math.max(0, life.purse) * 0.4));
            fx(g, life, { health: -20 }, "a splinter wound in a sea fight");
          }
        },
      },
      {
        label: "Hide your purse in your boot",
        tip: "Lose a little if they board, rather than a lot.",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, _c, pass) => {
          spend(
            g,
            life,
            Math.round(Math.max(0, life.purse) * (pass ? 0.1 : 0.5)),
          );
          say(
            g,
            life,
            pass
              ? "They took the cargo and the captain's wig. Your boot went unsearched."
              : "They found the boot. And the other boot.",
            pass ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "sea-cards",
    pool: "sea",
    cooldown: 200,
    title: "Becalmed",
    body: () =>
      "No wind for a week. The sea is glass, the water casks are low and tempers lower. Somebody produces a pack of cards.",
    choices: [
      {
        label: "Play for coins",
        tip: "Win or lose up to 4.",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, {
            coins: pass ? 4 : -Math.min(4, Math.max(0, life.purse)),
            xp: { trade: 6 },
          });
        },
      },
      {
        label: "Learn the ropes from the bosun",
        tip: "+seamanship.",
        apply: (g, life) => fx(g, life, { xp: { seamanship: 16 } }),
      },
    ],
  },
  // ------------------------------------------------ health and the mind
  {
    key: "fever",
    pool: "any",
    cooldown: 500,
    weight: 1.2,
    when: (g, life) =>
      g.w.tropical[life.prov] || [5, 6, 7, 8].includes(month(g)) ? {} : null,
    title: "The ague",
    body: (g, life) =>
      `Chills, then fire, then chills. ${g.w.tropical[life.prov] ? "Every newcomer here goes through the seasoning, they say. Not every newcomer comes out of it." : "Half the street has it."}`,
    choices: [
      {
        label: "Send for the physician (3 coins)",
        tip: "Bark and bleeding. Better odds.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => {
          spend(g, life, 3);
          fx(g, life, { health: g.rng.chance(0.75) ? -8 : -20 }, "the ague");
        },
      },
      {
        label: "Sweat it out",
        tip: "Free. Robust folk do fine; others less so.",
        apply: (g, life) => {
          const bad = trait(g, life, "robust")
            ? 0.2
            : trait(g, life, "sickly")
              ? 0.7
              : 0.45;
          fx(
            g,
            life,
            { health: g.rng.chance(bad) ? -20 : -8, stress: 5 },
            "the ague",
          );
        },
      },
      {
        label: "Try the healer's remedies",
        tip: "Medicine of the country: willow bark and sweat lodges.",
        check: { skill: "medicine", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            { health: pass ? -4 : -18, xp: { medicine: 8 } },
            "the ague",
          ),
      },
    ],
  },
  {
    key: "smallpox",
    pool: "any",
    cooldown: 3000,
    weight: 0.4,
    when: (g, life) => (g.rng.chance(0.4) ? {} : null),
    title: "Smallpox",
    body: (g, life) =>
      `The speckled monster is in ${here(g, life)}. ${year(g) >= 1721 ? "Some physicians swear by inoculation: a little pox now to spare you the great pox later. Others call it murder." : "There's no cure but prayer and luck."}`,
    choices: [
      {
        label: "Be inoculated (4 coins)",
        tip: "A mild case now; immune after. Small risk.",
        blocked: (g, life) =>
          year(g) < 1721 ? "Not yet known here" : poor(life, 4),
        apply: (g, life) => {
          spend(g, life, 4);
          fx(
            g,
            life,
            { health: g.rng.chance(0.03) ? -60 : -8, renown: 1 },
            "smallpox from an inoculation",
          );
          say(
            g,
            life,
            "A fortnight of fever and you're proof against the pox.",
            "good",
          );
        },
      },
      {
        label: "Leave town until it passes",
        tip: "Stay healthy, lose a month's wages.",
        apply: (g, life) => {
          if (life.job) life.job.away += 1;
          fx(g, life, { stress: 5 });
        },
      },
      {
        label: "Trust in Providence",
        tip: "You might not catch it. If you do...",
        apply: (g, life) => {
          if (g.rng.chance(0.3)) {
            fx(g, life, { health: -45 }, "smallpox");
            if (meOf(g.s, life)?.alive)
              say(
                g,
                life,
                "You caught it, and lived. The scars are a passport: you can't catch it again.",
                "bad",
              );
          } else say(g, life, "It passed you by.", "good");
        },
      },
    ],
  },
  {
    key: "breakdown",
    pool: "any",
    cooldown: 300,
    weight: 2,
    when: (g, life) => (life.stress >= 75 && adult(g, life) ? {} : null),
    title: "At the end of your tether",
    body: () =>
      "You haven't slept properly in weeks. You snapped at a child yesterday and wept at a hymn on Sunday. Something has to give.",
    choices: [
      {
        label: "Drown it in drink",
        tip: "−20 stress. You may come to like it too much.",
        apply: (g, life) => {
          fx(g, life, { stress: -20, coins: -1 });
          if (g.rng.chance(0.35)) fx(g, life, { gain: "drunkard" });
        },
      },
      {
        label: "Pray and fast",
        tip: "Faith steadies you.",
        check: { skill: "faith", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { stress: pass ? -25 : -8, xp: { faith: 12 } }),
      },
      {
        label: "Walk into the woods for a week",
        tip: "−15 stress; your work suffers.",
        apply: (g, life) => {
          fx(g, life, { stress: -15, xp: { woodcraft: 8 } });
          if (life.job) life.job.away += 1;
        },
      },
      {
        label: "Push through it",
        tip: "Ambition demands it. Your health pays.",
        apply: (g, life) =>
          fx(g, life, { health: -10, stress: -5, renown: 1 }, "overwork"),
      },
    ],
  },
  {
    key: "old-age",
    pool: "any",
    cooldown: 1800,
    when: (g, life) => (ageOfLife(g.s, life) >= 55 ? {} : null),
    title: "The years tell",
    body: (g, life) =>
      `You're ${ageOfLife(g.s, life)}. Stairs have become an argument, and your hands ache in the mornings. ${kidsOf(g, life).length ? "Your children watch you more closely than they used to." : "There's nobody to watch you, which is worse."}`,
    choices: [
      {
        label: "Take life easier",
        tip: "−10 stress; your work gets less of you.",
        apply: (g, life) => fx(g, life, { stress: -10, health: 4 }),
      },
      {
        label: "Put your affairs in order",
        tip: "Name an heir, settle debts: the family will be ready.",
        apply: (g, life) => {
          const kids = kidsOf(g, life).sort((a, b) => a.born - b.born);
          if (kids[0] && life.heir < 0) life.heir = kids[0].id;
          fx(g, life, { stress: -6 });
          say(
            g,
            life,
            kids[0]
              ? `You made your will: ${charName(kids[0])} is to carry on the family.`
              : "You made a will, and found you had nobody to leave things to.",
          );
        },
      },
      {
        label: "Refuse to be old",
        tip: "Robust folk get away with it.",
        apply: (g, life) =>
          fx(
            g,
            life,
            { health: trait(g, life, "robust") ? 2 : -8, renown: 1 },
            "refusing to grow old",
          ),
      },
    ],
  },
  // ------------------------------------------------ love and family
  {
    key: "admirer",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      if (
        !adult(g, life) ||
        me(g, life).spouse >= 0 ||
        ageOfLife(g.s, life) > 45
      )
        return null;
      const c = someone(
        g,
        life,
        (x) =>
          x.spouse < 0 &&
          x.female !== me(g, life).female &&
          ageOf(g.s, x) <= 40 &&
          isNativeChar(g.s, x) === isNativeChar(g.s, me(g, life)),
      );
      return c ? { c: c.id } : null;
    },
    title: "An admirer",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)} (${ageOf(g.s, c)}) has been finding reasons to pass your door. Twice ${he(c)} has dropped a glove there. It is ${g.rng.chance(0.5) ? "not subtle" : "very nearly subtle"}.`;
    },
    choices: [
      {
        label: "Walk out with them",
        tip: "They think much better of you (+20). Courting begins.",
        apply: (g, life, ctx) => {
          const c = g.char(ctx.c);
          meet(g, life, c.id);
          remembers(g, life, c, "Walked out with me", 20, 3);
          if (me(g, life).spouse < 0 && c.spouse < 0)
            setTie(g, life, c.id, "lover");
          say(
            g,
            life,
            `You and ${charName(c)} are walking out together.`,
            "good",
          );
        },
      },
      {
        label: "Return the glove, politely",
        tip: "Nothing changes.",
        apply: (g, life, ctx) => meet(g, life, ctx.c),
      },
    ],
  },
  {
    key: "spouse-quarrel",
    pool: "any",
    cooldown: 400,
    when: (g, life) =>
      spouseOf(g, life) ? { c: spouseOf(g, life)!.id } : null,
    title: "Words at home",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${charName(c)} says you're never home, and when you are you might as well not be. ${trait(g, life, "drunkard") ? "The tavern was mentioned. Repeatedly." : "The fire went out while you argued."}`;
    },
    choices: [
      {
        label: "Apologise, and mean it",
        tip: "+15 opinion; −5 stress.",
        apply: (g, life, ctx) => {
          remembers(
            g,
            life,
            g.char(ctx.c),
            "Made it up after a quarrel",
            15,
            2,
          );
          fx(g, life, { stress: -5 });
        },
      },
      {
        label: "A gift to make it up (3 coins)",
        tip: "+20 opinion.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          remembers(
            g,
            life,
            g.char(ctx.c),
            "Made it up after a quarrel",
            20,
            2,
          );
        },
      },
      {
        label: "Storm out to the tavern",
        tip: "−15 opinion; −5 stress for you.",
        apply: (g, life, ctx) => {
          remembers(g, life, g.char(ctx.c), "Stormed out", -15, 2);
          fx(g, life, { stress: -5, coins: -0.5 });
        },
      },
    ],
  },
  {
    key: "child-sick",
    pool: "any",
    cooldown: 500,
    when: (g, life) => {
      const kid = kidsOf(g, life).find((k) => ageOf(g.s, k) < 10);
      return kid ? { c: kid.id } : null;
    },
    title: "A sick child",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `Little ${c.first} is hot as a coal and won't eat. ${he(c)[0].toUpperCase() + he(c).slice(1)} asks for you in the night.`;
    },
    choices: [
      {
        label: "Fetch the physician (3 coins)",
        tip: "The best chance.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life, ctx) => {
          spend(g, life, 3);
          if (g.rng.chance(0.08))
            kill(
              g,
              g.char(ctx.c),
              `a fever at ${ageOf(g.s, g.s.chars[ctx.c])}`,
            );
          else
            say(g, life, `${g.s.chars[ctx.c].first} pulled through.`, "good");
        },
      },
      {
        label: "Nurse them yourself",
        tip: "Medicine helps. +stress.",
        check: { skill: "medicine", dc: 5 },
        apply: (g, life, ctx, pass) => {
          fx(g, life, { stress: 8, xp: { medicine: 12 } });
          if (!pass && g.rng.chance(0.3))
            kill(
              g,
              g.char(ctx.c),
              `a fever at ${ageOf(g.s, g.s.chars[ctx.c])}`,
            );
          else
            say(g, life, `${g.s.chars[ctx.c].first} pulled through.`, "good");
        },
      },
      {
        label: "Pray",
        tip: "And hope.",
        apply: (g, life, ctx) => {
          fx(g, life, { xp: { faith: 8 } });
          if (g.rng.chance(0.22))
            kill(
              g,
              g.char(ctx.c),
              `a fever at ${ageOf(g.s, g.s.chars[ctx.c])}`,
            );
          else
            say(g, life, `${g.s.chars[ctx.c].first} pulled through.`, "good");
        },
      },
    ],
  },
  {
    key: "child-trade",
    pool: "any",
    cooldown: 900,
    when: (g, life) => {
      const kid = kidsOf(g, life).find(
        (k) => ageOf(g.s, k) >= 11 && ageOf(g.s, k) <= 15,
      );
      return kid ? { c: kid.id } : null;
    },
    title: "What's to become of them?",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      return `${c.first} is ${ageOf(g.s, c)} and underfoot. ${his(c)[0].toUpperCase() + his(c).slice(1)} future wants deciding: books, a trade, or the family business?`;
    },
    choices: [
      {
        label: "Send them to school (5 coins)",
        tip: "Educated, if they take to it.",
        blocked: (g, life) => poor(life, 5),
        apply: (g, life, ctx) => {
          spend(g, life, 5);
          const c = g.char(ctx.c);
          if (!c.traits.includes("educated") && g.rng.chance(0.7))
            c.traits.push("educated");
          c.stats.lea = Math.min(18, c.stats.lea + 2);
        },
      },
      {
        label: "Teach them yourself",
        tip: "They take after you; your bond grows.",
        apply: (g, life, ctx) => {
          const c = g.char(ctx.c);
          const m = me(g, life);
          for (const st of ["mar", "ste", "dip"] as const)
            if (m.stats[st] > c.stats[st]) c.stats[st]++;
          remembers(g, life, c, "Taught me everything", 15, 0);
        },
      },
      {
        label: "Apprentice them out",
        tip: "Tougher, and out from under your feet.",
        apply: (g, life, ctx) => {
          const c = g.char(ctx.c);
          c.stats.ste = Math.min(18, c.stats.ste + 1);
          if (!c.traits.includes("diligent") && g.rng.chance(0.4))
            c.traits.push("diligent");
        },
      },
    ],
  },
  {
    key: "child-match",
    // (the wedding itself: wedChild, below)
    pool: "any",
    cooldown: 900,
    when: (g, life) => {
      const kid = kidsOf(g, life).find(
        (k) => ageOf(g.s, k) >= 18 && k.spouse < 0,
      );
      if (!kid) return null;
      const match = someone(
        g,
        life,
        (x) =>
          x.spouse < 0 &&
          x.female !== kid.female &&
          Math.abs(ageOf(g.s, x) - ageOf(g.s, kid)) <= 8 &&
          x.id !== kid.id &&
          x.father !== kid.father,
      );
      return match ? { c: kid.id, m: match.id } : null;
    },
    title: "A match for your child",
    body: (g, life, ctx) => {
      const c = g.s.chars[ctx.c];
      const m = g.s.chars[ctx.m];
      return `${charName(m)}'s family have come calling about ${c.first}. ${charName(m)} is ${ageOf(g.s, m)}, ${m.role ? "has a trade" : "comes of a decent family"} and blushes at the right moments.`;
    },
    choices: [
      {
        label: (g, life) =>
          `Give your blessing, and a portion of ${portionOf(g.s, life)}`,
        tip: "A wedding, and a marriage portion fit for your station: your child (and their new family) will think the better of you, and so will the town.",
        blocked: (g, life) => poor(life, portionOf(g.s, life)),
        apply: (g, life, ctx) => {
          const portion = portionOf(g.s, life);
          spend(g, life, portion);
          const c = wedChild(g, life, ctx);
          remembers(g, life, c, "A generous portion", 15, 5);
          addRenown(g, life, 1 + stationOf(g.s, life).level);
          say(
            g,
            life,
            `${c.first} goes to the altar with ${portion} coins of portion, and everyone remarks on it.`,
            "good",
          );
        },
      },
      {
        label: "Give your blessing, but no portion",
        tip: "A wedding (2 coins). People of standing are expected to do better by their children.",
        blocked: (g, life) => poor(life, 2),
        apply: (g, life, ctx) => {
          spend(g, life, 2);
          const c = wedChild(g, life, ctx);
          if (stationOf(g.s, life).level >= 2) {
            addRenown(g, life, -3);
            remembers(g, life, c, "Sent off with nothing", -10, 3);
            say(
              g,
              life,
              `${c.first} comes to the altar with nothing, people say, and they say it often.`,
              "bad",
            );
          }
        },
      },
      {
        label: "Hold out for better",
        tip: "Nothing now; they may resent it.",
        apply: (g, life, ctx) =>
          remembers(g, life, g.char(ctx.c), "Turned away my match", -10, 3),
      },
    ],
  },
  {
    key: "portrait",
    pool: "any",
    cooldown: 3000,
    when: (g, life) =>
      life.purse >= 15 && life.renown >= 15 && colonist(g, life) ? {} : null,
    title: "A travelling limner",
    body: () =>
      "A portrait painter has come to town, a little shabby, very confident. His last sitter, he swears, wept with joy. His last sitter's wife wept for other reasons.",
    choices: [
      {
        label: "Sit for your portrait (10 coins)",
        tip: "+4 renown: a likeness on your wall says you've arrived.",
        apply: (g, life) => {
          spend(g, life, 10);
          fx(g, life, { renown: 4, stress: -4 });
          milestone(g, life, "renown", "Sat for a portrait");
        },
      },
      { label: "Not today", tip: "Keep your money.", apply: () => {} },
    ],
  },
  {
    key: "legacy",
    pool: "any",
    cooldown: 5000,
    weight: 0.3,
    when: (g, life) => (colonist(g, life) && adult(g, life) ? {} : null),
    title: "A letter from home",
    body: () =>
      "A letter, much travelled, from a lawyer in the old country: a great-uncle you never met has died, leaving you a sum and a strongly worded opinion of your father.",
    choices: [
      {
        label: "Collect the legacy",
        tip: "+20 coins.",
        apply: (g, life) => {
          fx(g, life, { coins: 20 });
          say(g, life, "Twenty coins, and a lesson in family history.", "good");
        },
      },
    ],
  },
  {
    key: "fire",
    pool: "any",
    cooldown: 2000,
    weight: 0.5,
    when: (g, life) => (life.prov === life.home && adult(g, life) ? {} : null),
    title: "Fire!",
    body: () =>
      "Somebody shouts in the night. A chimney fire has caught the thatch next door and sparks are dancing onto your roof.",
    choices: [
      {
        label: "Fight it with the neighbours",
        tip: "Leadership organises the bucket line.",
        check: { skill: "leadership", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 3, xp: { leadership: 15 } });
            say(
              g,
              life,
              "Your bucket line saved three houses. The street toasts you.",
              "good",
            );
          } else {
            fx(
              g,
              life,
              { coins: -Math.min(8, Math.max(0, life.purse)), health: -8 },
              "burns from a house fire",
            );
            houseFire(g, life);
          }
        },
      },
      {
        label: "Save what you can and run",
        tip: "Lose some goods; everyone gets out.",
        apply: (g, life) =>
          fx(g, life, {
            coins: -Math.min(5, Math.max(0, life.purse)),
            stress: 8,
          }),
      },
    ],
  },
  {
    key: "lost-purse",
    pool: "any",
    cooldown: 900,
    when: (g, life) => (adult(g, life) ? {} : null),
    title: "A purse in the street",
    body: () =>
      "A fat purse lying in the mud by the market cross. Nobody's looking. It has initials embroidered on it, which is careless of somebody.",
    choices: [
      {
        label: "Find the owner",
        tip: "+2 renown; they may reward you.",
        apply: (g, life) => {
          fx(g, life, { renown: 2, coins: g.rng.chance(0.5) ? 2 : 0 });
          say(
            g,
            life,
            "The owner thanked you, eventually, after counting it twice.",
          );
        },
      },
      {
        label: "Keep it",
        tip: "+6 coins. Honest folk feel it.",
        apply: (g, life) => {
          fx(g, life, { coins: 6, stress: trait(g, life, "honest") ? 10 : 0 });
          if (trait(g, life, "honest") && g.rng.chance(0.3))
            fx(g, life, { lose: "honest" });
        },
      },
    ],
  },
  {
    key: "fortune-teller",
    pool: "any",
    cooldown: 3000,
    weight: 0.4,
    when: (g, life) => (adult(g, life) ? {} : null),
    title: "A cunning woman",
    body: () =>
      "An old woman who tells fortunes from tea leaves, cures warts with string and is definitely not a witch, says so repeatedly, offers to read your future.",
    choices: [
      {
        label: "Cross her palm (1 coin)",
        tip: "She'll say something. You'll remember it.",
        apply: (g, life) => {
          spend(g, life, 1);
          const lines = [
            '"You\'ll cross water, and come back richer, or not come back."',
            '"Beware a man with red hair and a grievance."',
            '"A child of yours will be talked about long after you."',
            '"You\'ll die in your bed. Not soon. Probably."',
          ];
          say(g, life, `She peered into the cup. ${g.rng.pick(lines)}`);
          fx(g, life, { stress: -3 });
        },
      },
      {
        label: "Report her to the minister",
        tip: "+faith; the town thinks you a prig, or a pillar.",
        blocked: (g, life) => (native(g, life) ? "Not your way" : null),
        apply: (g, life) =>
          fx(g, life, { xp: { faith: 8 }, renown: g.rng.chance(0.5) ? 1 : -1 }),
      },
    ],
  },
  {
    key: "rival-insult",
    pool: "any",
    cooldown: 600,
    when: (g, life) => {
      const r = Object.entries(life.ties).find(([, t]) => t === "rival");
      const c = r ? g.s.chars[Number(r[0])] : undefined;
      return c?.alive ? { c: c.id } : null;
    },
    title: "Your rival speaks",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} has been telling anyone who'll listen that you're a fool, a coward and worse. People are starting to laugh when you come in.`,
    choices: [
      {
        label: "Answer in kind, in public",
        tip: "Persuasion wins the room.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, ctx, pass) => {
          fx(g, life, { renown: pass ? 3 : -2, xp: { persuasion: 12 } });
          remembers(g, life, g.char(ctx.c), "Made a fool of me", -15, 3);
        },
      },
      {
        label: "Ignore it",
        tip: "The just and the content lose nothing; others feel it.",
        apply: (g, life) =>
          fx(g, life, {
            stress: trait(g, life, "just") || trait(g, life, "content") ? 0 : 8,
          }),
      },
      {
        label: "Offer to make peace",
        tip: "Swallow your pride: maybe end it.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            setTie(g, life, ctx.c, null);
            remembers(g, life, g.char(ctx.c), "Made peace between us", 30, 5);
            say(
              g,
              life,
              "You shook hands. It was awkward, and it held.",
              "good",
            );
          } else fx(g, life, { stress: 5 });
        },
      },
    ],
  },
  {
    key: "friend-loan",
    pool: "any",
    cooldown: 700,
    when: (g, life) => {
      const f = Object.entries(life.ties).find(([, t]) => t === "friend");
      const c = f ? g.s.chars[Number(f[0])] : undefined;
      return c?.alive && life.purse >= 10 ? { c: c.id } : null;
    },
    title: "A friend in need",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} comes to you grey-faced: a debt called in, and the bailiffs coming Thursday. Eight coins would save ${him(g.s.chars[ctx.c])}.`,
    choices: [
      {
        label: "Lend it",
        tip: "−8 coins. A friend for life.",
        apply: (g, life, ctx) => {
          spend(g, life, 8);
          remembers(
            g,
            life,
            g.char(ctx.c),
            "Saved me from the bailiffs",
            30,
            0,
          );
          say(g, life, "They swore to pay you back. Some of them do.");
        },
      },
      {
        label: "You can't spare it",
        tip: "−20 opinion. The friendship may not survive.",
        apply: (g, life, ctx) => {
          remembers(g, life, g.char(ctx.c), "Left me to the bailiffs", -20, 4);
          if (g.rng.chance(0.4)) setTie(g, life, ctx.c, null);
        },
      },
    ],
  },
  // ------------------------------------------------ work
  {
    key: "farm-drought",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      job(life, "farmer", "grower", "servant") && [5, 6, 7].includes(month(g))
        ? {}
        : null,
    title: "Drought",
    body: () =>
      "No rain since planting. The corn is knee high and yellow, the creek is a string of puddles, and the minister has scheduled a day of humiliation and prayer.",
    choices: [
      {
        label: "Haul water from the river",
        tip: "Back-breaking. Farming saves some of it.",
        check: { skill: "farming", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            { xp: { farming: 14 }, stress: 6, health: -3 },
            "exhaustion",
          );
          if (!pass) fx(g, life, { coins: -3 });
        },
      },
      {
        label: "Join the day of prayer",
        tip: "+faith; the crop does what it does.",
        apply: (g, life) =>
          fx(g, life, { xp: { faith: 10 }, coins: g.rng.chance(0.4) ? 0 : -3 }),
      },
    ],
  },
  {
    key: "farm-bumper",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      job(life, "farmer", "grower") && [8, 9].includes(month(g)) ? {} : null,
    title: "A bumper harvest",
    body: (g, life) =>
      `The best harvest anyone at ${here(g, life)} can remember. The barns are full, the prices are falling, and every neighbour is selling at once.`,
    choices: [
      {
        label: "Sell now",
        tip: "+5 coins.",
        apply: (g, life) => fx(g, life, { coins: 5 }),
      },
      {
        label: "Store it and sell in spring",
        tip: "Trade: if prices rise, +10.",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { coins: pass ? 10 : 2, xp: { trade: 10 } }),
      },
      {
        label: "Give some to the poor",
        tip: "+3 renown, +2 coins.",
        apply: (g, life) =>
          fx(g, life, { renown: 3, coins: 2, xp: { faith: 4 } }),
      },
    ],
  },
  {
    key: "farm-fence",
    pool: "any",
    cooldown: 900,
    when: (g, life) => {
      if (!job(life, "farmer")) return null;
      const c = someone(g, life);
      return c ? { c: c.id } : null;
    },
    title: "A boundary dispute",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} has moved the boundary stone between your fields eleven feet in ${his(g.s.chars[ctx.c])} own favour, and says it was always there. The stone has fresh earth on it.`,
    choices: [
      {
        label: "Take it to court",
        tip: "Letters (and a lawyer) win cases. −2 coins.",
        check: { skill: "letters", dc: 7 },
        apply: (g, life, ctx, pass) => {
          spend(g, life, 2);
          remembers(g, life, g.char(ctx.c), "Took me to court", -15, 4);
          fx(g, life, {
            coins: pass ? 4 : -2,
            renown: pass ? 1 : 0,
            xp: { letters: 10 },
          });
        },
      },
      {
        label: "Move it back at night",
        tip: "Stealth. If caught, a feud.",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, ctx, pass) => {
          if (!pass) {
            remembers(g, life, g.char(ctx.c), "Caught moving my stone", -30, 5);
            setTie(g, life, ctx.c, "rival");
          }
        },
      },
      {
        label: "Let him have it",
        tip: "Eleven feet isn't worth a feud.",
        apply: (g, life, ctx) =>
          remembers(g, life, g.char(ctx.c), "A reasonable neighbour", 10, 3),
      },
    ],
  },
  {
    key: "mill-accident",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      job(life, "millhand", "craftsman", "maker") ? {} : null,
    title: "The saw",
    body: () =>
      "The big saw jumps its track with a shriek. A boy is standing where it's going to land.",
    choices: [
      {
        label: "Pull him clear",
        tip: "Brave and quick: renown, or a wound.",
        check: { skill: "fighting", dc: 6 },
        apply: (g, life, _c, pass) => {
          fx(
            g,
            life,
            pass ? { renown: 4 } : { renown: 2, health: -25 },
            "an accident at the mill",
          );
          if (!pass) fx(g, life, { gain: "scarred" });
        },
      },
      {
        label: "Throw the brake lever",
        tip: "Craft: stop the machine.",
        check: { skill: "craft", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { xp: { craft: 15 }, renown: 2 } : { stress: 12 }),
      },
    ],
  },
  {
    key: "master-offer",
    pool: "any",
    cooldown: 1000,
    when: (g, life) =>
      job(life, "craftsman", "millhand") && life.job!.rank >= 1 ? {} : null,
    title: "The master's offer",
    body: () =>
      "Your master is getting old. He offers you a partnership: a share of the shop and its debts, and his daughter's hand if you'd like it. He's not specific about which is the bigger burden.",
    choices: [
      {
        label: "Buy in (15 coins)",
        tip: "Months toward promotion and renown.",
        blocked: (g, life) => poor(life, 15),
        apply: (g, life) => {
          spend(g, life, 15);
          if (life.job) life.job.months += 12;
          fx(g, life, { renown: 3, xp: { trade: 10, craft: 10 } });
        },
      },
      { label: "Stay a journeyman", tip: "Nothing changes.", apply: () => {} },
    ],
  },
  {
    key: "press-scandal",
    pool: "any",
    cooldown: 600,
    when: (g, life) => {
      if (!job(life, "newsman")) return null;
      const gov = g.s.chars[g.s.nations[me(g, life).nation]?.ruler ?? -1];
      return gov?.alive ? { c: gov.id } : null;
    },
    title: "A story too good to print",
    body: (g, life, ctx) =>
      `A clerk slips you letters showing ${charName(g.s.chars[ctx.c])} has been selling land grants to his cousins. It's true, it's juicy, and it's the sort of thing printers go to prison for.`,
    choices: [
      {
        label: "Print it",
        tip: "+8 renown; the governor will hate you. Stealth keeps your name out of it.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, ctx, pass) => {
          fx(g, life, { renown: 8, xp: { letters: 12 } });
          if (!pass) {
            remembers(g, life, g.char(ctx.c), "Printed lies about me", -40, 6);
            fx(g, life, {
              coins: -Math.min(10, Math.max(0, life.purse)),
              stress: 15,
            });
            say(
              g,
              life,
              "The governor had you hauled before the council and fined for seditious libel. Every tavern drank your health.",
              "bad",
            );
          }
        },
      },
      {
        label: "Sell the letters back to the governor",
        tip: "+15 coins. Deceitful folk sleep fine.",
        apply: (g, life, ctx) => {
          fx(g, life, { coins: 15, stress: trait(g, life, "honest") ? 12 : 2 });
          remembers(g, life, g.char(ctx.c), "Discreet", 20, 4);
        },
      },
      {
        label: "Burn them",
        tip: "Safe, and nobody will ever know.",
        apply: (g, life) => fx(g, life, { stress: -2 }),
      },
    ],
  },
  {
    key: "press-kite",
    pool: "any",
    cooldown: 99999,
    when: (g, life) => (job(life, "newsman") && year(g) >= 1752 ? {} : null),
    title: "Electrical fire",
    body: () =>
      "A Philadelphia printer has flown a kite in a thunderstorm and drawn sparks from a key. Everyone wants to read about it, and several people want to try it.",
    choices: [
      {
        label: "Print a full account",
        tip: "+3 renown, +letters.",
        apply: (g, life) =>
          fx(g, life, { renown: 3, xp: { letters: 12 }, coins: 2 }),
      },
      {
        label: "Try it yourself",
        tip: "Science! Possibly fatal.",
        check: { skill: "letters", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 6, gain: "famous" } : { health: -30, renown: 2 },
            "a lightning experiment",
          ),
      },
    ],
  },
  {
    key: "soldier-bully",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      job(life, "soldier") && life.job!.rank <= 1 ? {} : null,
    title: "The sergeant",
    body: () =>
      "Sergeant Mulvey has decided you're the company's fool. Extra drill, the worst sentry posts, and a running commentary on your mother.",
    choices: [
      {
        label: "Take it, and drill harder",
        tip: "+fighting; +stress.",
        apply: (g, life) => fx(g, life, { xp: { fighting: 18 }, stress: 8 }),
      },
      {
        label: "Fight him behind the barracks",
        tip: "Win and he respects you. Lose and it's the lash.",
        check: { skill: "fighting", dc: 9 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { renown: 3, xp: { fighting: 12 } });
          else fx(g, life, { health: -15, stress: 10 }, "a flogging");
        },
      },
      {
        label: "Complain to the captain",
        tip: "Persuasion. The army doesn't love complainers.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { stress: -8 } : { stress: 6, renown: -1 }),
      },
    ],
  },
  {
    key: "soldier-pay",
    pool: "any",
    cooldown: 700,
    when: (g, life) => (job(life, "soldier", "warrior") ? {} : null),
    title: "Pay is late",
    body: () =>
      "Four months without pay. The men are muttering. A corporal is going round with a paper: a petition to the governor, or the start of a mutiny, depending who reads it.",
    choices: [
      {
        label: "Sign it",
        tip: "+renown with the men; the officers notice.",
        apply: (g, life) => fx(g, life, { renown: 2, stress: 3 }),
      },
      {
        label: "Report it to the officers",
        tip: "Months toward promotion; the men won't forget.",
        apply: (g, life) => {
          if (life.job) life.job.months += 4;
          fx(g, life, { renown: -1, favor: 2 });
        },
      },
      {
        label: "Stay out of it",
        tip: "Nothing changes.",
        apply: () => {},
      },
    ],
  },
  {
    key: "soldier-orders",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      job(life, "soldier") && warNow(g, life) && life.job!.army >= 0
        ? {}
        : null,
    title: "Orders",
    body: () =>
      "The colonel's orders: burn the village across the river so the enemy can't winter there. The village is full of women and old men, and the river is very cold.",
    choices: [
      {
        label: "Obey",
        tip: "Months toward promotion. Some things stay with you.",
        apply: (g, life) => {
          if (life.job) life.job.months += 6;
          fx(g, life, { stress: 15, renown: 1 });
          if (g.rng.chance(0.3)) fx(g, life, { gain: "cruel" });
        },
      },
      {
        label: "Warn the villagers first",
        tip: "Stealth. Caught, you're court-martialled.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { stress: -5, renown: 2 });
          else {
            fx(g, life, { renown: -8, health: -15 }, "a flogging");
            if (life.job && life.job.rank > 0) life.job.rank--;
            say(g, life, "Court-martialled and broken a rank.", "bad");
          }
        },
      },
      {
        label: "Refuse",
        tip: "Honour, and a rank lost.",
        apply: (g, life) => {
          if (life.job && life.job.rank > 0) life.job.rank--;
          fx(g, life, {
            renown: 3,
            stress: 5,
            gain: g.rng.chance(0.4) ? "just" : undefined,
          });
        },
      },
    ],
  },
  {
    key: "camp-fever",
    pool: "any",
    cooldown: 600,
    when: (g, life) =>
      life.job?.army !== undefined && life.job.army >= 0 ? {} : null,
    title: "Camp fever",
    body: () =>
      "The camp is a swamp of mud and worse. Men are dying faster of the flux than ever they did of the enemy.",
    choices: [
      {
        label: "Boil your water, keep clean",
        tip: "Medicine and good sense.",
        check: { skill: "medicine", dc: 5 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { xp: { medicine: 10 } } : { health: -20 },
            "camp fever",
          ),
      },
      {
        label: "Help the surgeons",
        tip: "+renown, +medicine; you may catch it.",
        apply: (g, life) =>
          fx(
            g,
            life,
            {
              renown: 2,
              xp: { medicine: 15 },
              health: g.rng.chance(0.4) ? -20 : 0,
            },
            "camp fever",
          ),
      },
    ],
  },
  {
    key: "sailor-smuggle",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      job(life, "sailor", "clerk", "trader") && adult(g, life) ? {} : null,
    title: "A quiet cargo",
    body: () =>
      "A man in a good coat and a bad wig wants a hold full of French molasses landed at night, no customs paid. The navigation acts are very clear about this. So is the money.",
    choices: [
      {
        label: "Take the job",
        tip: "+12 coins. Stealth keeps you out of the Admiralty court.",
        check: { skill: "stealth", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) fx(g, life, { coins: 12, xp: { stealth: 10, trade: 6 } });
          else {
            fx(g, life, {
              coins: -Math.min(15, Math.max(0, life.purse)),
              renown: -3,
              stress: 10,
            });
            say(
              g,
              life,
              "The revenue men were waiting. The fine took everything and then some.",
              "bad",
            );
          }
        },
      },
      {
        label: "Inform the customs house",
        tip: "+favor with the crown; the smugglers remember.",
        apply: (g, life) => fx(g, life, { favor: 5, stress: 4 }),
      },
      { label: "Not for me", tip: "Nothing changes.", apply: () => {} },
    ],
  },
  {
    key: "merchant-venture",
    pool: "any",
    cooldown: 800,
    when: (g, life) =>
      job(life, "clerk", "trader", "innkeeper") &&
      life.purse >= 20 &&
      adult(g, life)
        ? {}
        : null,
    title: "A venture",
    body: () =>
      "A ship is fitting out for the Sugar Islands with flour, barrel staves and salt fish. Shares are twenty coins each. The captain says he's never lost a cargo. The captain has said a lot of things.",
    choices: [
      {
        label: "Take a share (20 coins)",
        tip: "Trade: double your money, or lose it.",
        check: { skill: "trade", dc: 8 },
        apply: (g, life, _c, pass) => {
          spend(g, life, 20);
          if (pass) {
            fx(g, life, { coins: 40, renown: 2, xp: { trade: 15 } });
            say(
              g,
              life,
              "She came home low in the water with sugar and rum. Forty coins.",
              "good",
            );
          } else
            say(
              g,
              life,
              "Lost with all hands off Hatteras, or so the captain's letter from Jamaica said.",
              "bad",
            );
        },
      },
      { label: "Keep your money", tip: "Nothing ventured.", apply: () => {} },
    ],
  },
  {
    key: "preacher-witch",
    pool: "any",
    cooldown: 4000,
    when: (g, life) => {
      if (!colonist(g, life) || !adult(g, life)) return null;
      const c = someone(g, life, (x) => x.female && ageOf(g.s, x) >= 45);
      return c &&
        (year(g) >= 1688 && year(g) <= 1700 ? true : g.rng.chance(0.2))
        ? { c: c.id }
        : null;
    },
    title: "A witch?",
    body: (g, life, ctx) =>
      `Two girls are having fits and naming ${charName(g.s.chars[ctx.c])}, an old woman with a sharp tongue and a black cat, as the cause. The magistrates want witnesses.${year(g) >= 1692 && year(g) <= 1693 ? " It's like Salem all over again, which is not a comforting thought." : ""}`,
    choices: [
      {
        label: "Speak in her defence",
        tip: "Persuasion: save her, or be suspected yourself.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            remembers(g, life, g.char(ctx.c), "Saved me from the rope", 50, 0);
            fx(g, life, {
              renown: 3,
              gain: g.rng.chance(0.3) ? "just" : undefined,
            });
          } else {
            fx(g, life, { renown: -4, stress: 15 });
            if (g.rng.chance(0.5))
              kill(g, g.char(ctx.c), "hanged for witchcraft");
          }
        },
      },
      {
        label: "Testify against her",
        tip: "The magistrates are pleased. She hangs.",
        apply: (g, life, ctx) => {
          kill(g, g.char(ctx.c), "hanged for witchcraft");
          fx(g, life, { favor: 2, stress: 12 });
        },
      },
      {
        label: "Keep well out of it",
        tip: "Probably wise.",
        apply: (g, life) => fx(g, life, { stress: 4 }),
      },
    ],
  },
  {
    key: "revival",
    pool: "any",
    cooldown: 3000,
    when: (g, life) =>
      colonist(g, life) && year(g) >= 1734 && year(g) <= 1750 ? {} : null,
    title: "The Great Awakening",
    body: () =>
      "A travelling preacher has the whole town weeping in a field. He says the ministers are cold, the churches are dead, and sinners dangle over the pit like spiders over a flame. People faint. Some stay fainted.",
    choices: [
      {
        label: "Be born again",
        tip: "+faith, −stress; zealous, perhaps.",
        apply: (g, life) =>
          fx(g, life, {
            xp: { faith: 20 },
            stress: -15,
            gain: g.rng.chance(0.4) ? "zealous" : undefined,
          }),
      },
      {
        label: "Sell lemonade to the crowds",
        tip: "+trade, +coins.",
        check: { skill: "trade", dc: 5 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { coins: pass ? 5 : 1, xp: { trade: 10 } }),
      },
      {
        label: "Stand with the old ministers",
        tip: "Order and reason. Renown with the respectable.",
        apply: (g, life) => fx(g, life, { renown: 1, xp: { letters: 6 } }),
      },
    ],
  },
  {
    key: "preacher-sermon",
    pool: "any",
    cooldown: 600,
    when: (g, life) => (job(life, "preacher") ? {} : null),
    title: "Sunday's sermon",
    body: (g, life) =>
      `The minister is ill and asks you to preach. The governor ${g.s.nations[me(g, life).nation]?.capital === life.prov ? "himself" : "'s cousin"} will be in the front pew.`,
    choices: [
      {
        label: "Preach on the sins of the powerful",
        tip: "Bold: big renown or big trouble.",
        check: { skill: "faith", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 6, xp: { faith: 15 } }
              : { renown: -2, stress: 10 },
          ),
      },
      {
        label: "Something safe on the loaves and fishes",
        tip: "+faith; a modest success.",
        check: { skill: "faith", dc: 5 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { renown: pass ? 2 : 0, xp: { faith: 12 } }),
      },
    ],
  },
  {
    key: "physician-patient",
    pool: "any",
    cooldown: 600,
    when: (g, life) => (job(life, "physician", "healer") ? {} : null),
    title: "A rich patient",
    body: () =>
      "A wealthy planter's wife is dying of something nobody can name. Her husband offers twenty coins to whoever saves her, and promises to ruin whoever doesn't.",
    choices: [
      {
        label: "Take the case",
        tip: "Medicine: +20 coins and fame, or disgrace.",
        check: { skill: "medicine", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { coins: 20, renown: 5, xp: { medicine: 20 } }
              : { renown: -4, stress: 10, xp: { medicine: 10 } },
          ),
      },
      {
        label: "Recommend a colleague",
        tip: "Safe. A small fee for the referral.",
        apply: (g, life) => fx(g, life, { coins: 1 }),
      },
    ],
  },
  {
    key: "official-bribe",
    pool: "any",
    cooldown: 700,
    when: (g, life) => (job(life, "official", "law") ? {} : null),
    title: "An envelope",
    body: () =>
      "A land speculator leaves an envelope on your desk: fifteen coins, and a deed he'd like registered without anyone looking too closely at whose land it really is.",
    choices: [
      {
        label: "Register it",
        tip: "+15 coins. Honest folk suffer; discovery is ruin.",
        apply: (g, life) => {
          fx(g, life, { coins: 15, stress: trait(g, life, "honest") ? 15 : 3 });
          if (g.rng.chance(0.15)) {
            fx(g, life, { renown: -10 });
            if (life.job) life.job.rank = Math.max(0, life.job.rank - 1);
            say(
              g,
              life,
              "It came out. You kept your post, barely, a rank lower.",
              "bad",
            );
          }
        },
      },
      {
        label: "Report him to the governor",
        tip: "+favor and the governor's good opinion.",
        apply: (g, life) => {
          fx(g, life, { favor: 4, renown: 2 });
          const gov = g.s.chars[g.s.nations[me(g, life).nation]?.ruler ?? -1];
          if (gov?.alive)
            remembers(g, life, g.char(gov.id), "An honest official", 15, 4);
        },
      },
      { label: "Hand it back", tip: "Nothing changes.", apply: () => {} },
    ],
  },
  {
    key: "trapper-bear",
    pool: "any",
    cooldown: 800,
    when: (g, life) => (job(life, "trapper", "hunter") ? {} : null),
    title: "The bear",
    body: () =>
      "The biggest bear you've ever seen is between you and your traplines, eating your bait and looking at you as if you might be dessert.",
    choices: [
      {
        label: "Shoot it",
        tip: "A good shot: a fine pelt and a story.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { coins: 4, renown: 3 });
            life.goods.furs = (life.goods.furs ?? 0) + 1;
          } else fx(g, life, { health: -30, gain: "scarred" }, "a bear");
        },
      },
      {
        label: "Back off and come back tomorrow",
        tip: "Woodcraft: let it wander off.",
        check: { skill: "woodcraft", dc: 5 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { xp: { woodcraft: 10 } } : { coins: -2 }),
      },
    ],
  },
  {
    key: "warrior-raid",
    pool: "any",
    cooldown: 700,
    when: (g, life) => (job(life, "warrior") ? {} : null),
    title: "A war party",
    body: () =>
      "The young men are painting themselves for a raid on an enemy village three days' walk away: horses, captives, glory. The elders say nothing, which means they disapprove.",
    choices: [
      {
        label: "Go with them",
        tip: "Fighting: renown and plunder, or wounds.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 5, coins: 3, xp: { fighting: 15, woodcraft: 8 } }
              : { health: -22, renown: 1 },
            "a raid gone wrong",
          ),
      },
      {
        label: "Stay and listen to the elders",
        tip: "Their good opinion; leadership.",
        apply: (g, life) =>
          fx(g, life, { xp: { leadership: 8, persuasion: 6 }, favor: 2 }),
      },
    ],
  },
  {
    key: "vision",
    pool: "any",
    cooldown: 3000,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    title: "A dream",
    body: () =>
      "Four nights running you dream of a white deer on a hill of snow. The healer says such dreams must be answered, though she won't say how.",
    choices: [
      {
        label: "Fast and seek its meaning",
        tip: "+faith. Something may change in you.",
        apply: (g, life) =>
          fx(
            g,
            life,
            { xp: { faith: 20 }, stress: -10, health: -4, renown: 2 },
            "a long fast",
          ),
      },
      {
        label: "Go hunting on that hill",
        tip: "Woodcraft. The deer may be real.",
        check: { skill: "woodcraft", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 5, xp: { woodcraft: 15 } } : { stress: 4 },
          ),
      },
    ],
  },
  {
    key: "green-corn",
    pool: "any",
    cooldown: 360,
    when: (g, life) =>
      native(g, life) && [6, 7].includes(month(g)) ? {} : null,
    title: "The green corn ceremony",
    body: () =>
      "The new corn is ripe. Fires are put out and lit anew, debts and quarrels forgiven, and the whole village dances through the night.",
    choices: [
      {
        label: "Dance until dawn",
        tip: "−15 stress; your quarrels are forgiven.",
        apply: (g, life) => {
          fx(g, life, { stress: -15 });
          for (const [id, t] of Object.entries(life.ties))
            if (t === "rival" && g.rng.chance(0.5))
              setTie(g, life, Number(id), null);
        },
      },
      {
        label: "Lead the songs",
        tip: "Faith and renown.",
        check: { skill: "faith", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { renown: pass ? 3 : 0, xp: { faith: 12 }, stress: -8 }),
      },
    ],
  },
  {
    key: "trade-rum",
    pool: "any",
    cooldown: 800,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    title: "The rum traders",
    body: () =>
      "A trader has come up the river with rum. By the second night half the young men are drunk, the furs for next season's kettles are gone, and two cousins have fought with knives.",
    choices: [
      {
        label: "Smash the kegs",
        tip: "Renown with the elders; the trader swears revenge.",
        apply: (g, life) => fx(g, life, { renown: 3, favor: 3, stress: 4 }),
      },
      {
        label: "Make him pay fairly for the furs",
        tip: "Trade: get some of it back.",
        check: { skill: "trade", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { coins: 4, renown: 2, xp: { trade: 12 } } : { stress: 6 },
          ),
      },
      {
        label: "Have a drink yourself",
        tip: "Well, it's here.",
        apply: (g, life) =>
          fx(g, life, {
            stress: -10,
            gain: g.rng.chance(0.3) ? "drunkard" : undefined,
          }),
      },
    ],
  },
  {
    key: "treaty-council",
    pool: "any",
    cooldown: 1200,
    when: (g, life) =>
      job(life, "speaker", "trader") && life.job!.rank >= 1 ? {} : null,
    title: "A treaty council",
    body: () =>
      "Commissioners from the colony have come with presents and a paper. The paper says one thing to them, and, translated, quite another thing to you.",
    choices: [
      {
        label: "Read the paper aloud, word for word",
        tip: "Letters: expose the trick. Great renown.",
        check: { skill: "letters", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 8, xp: { letters: 15, persuasion: 10 } }
              : { stress: 6, xp: { letters: 8 } },
          ),
      },
      {
        label: "Bargain for more presents",
        tip: "Persuasion: +coins for your people (and you).",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(g, life, {
            coins: pass ? 6 : 1,
            renown: pass ? 2 : 0,
            xp: { persuasion: 12 },
          }),
      },
      {
        label: "Walk out of the council",
        tip: "Pride: the young warriors cheer; the elders sigh.",
        apply: (g, life) => fx(g, life, { renown: 2, favor: -2 }),
      },
    ],
  },
  {
    key: "servant-master",
    pool: "any",
    cooldown: 500,
    when: (g, life) => (job(life, "servant") ? {} : null),
    title: "A hard master",
    body: () =>
      'Your master has added two years to your indenture for a broken plough handle, a lost cow and "insolence", which seems to mean looking at him.',
    choices: [
      {
        label: "Take him before the magistrate",
        tip: "Persuasion. Servants rarely win.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 3, stress: -10 });
            say(
              g,
              life,
              "The magistrate struck out the extra time. Your master is furious, and careful.",
              "good",
            );
          } else if (life.job) {
            life.job.until = (life.job.until ?? g.s.day) + 365;
            fx(g, life, { stress: 10 });
          }
        },
      },
      {
        label: "Bear it",
        tip: "+1 year. Stress.",
        apply: (g, life) => {
          if (life.job) life.job.until = (life.job.until ?? g.s.day) + 365;
          fx(g, life, { stress: 8, xp: { farming: 6 } });
        },
      },
    ],
  },
  {
    key: "tavern-brawl",
    pool: "any",
    cooldown: 500,
    when: (g, life) => (job(life, "innkeeper") ? {} : null),
    title: "A brawl in the house",
    body: () =>
      "Two crews off rival ships have discovered each other in your taproom. Chairs are already airborne.",
    choices: [
      {
        label: "Wade in and throw them out",
        tip: "Fighting: renown, or broken ribs.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 3 } : { health: -15, coins: -3 },
            "a brawl in your own taproom",
          ),
      },
      {
        label: "Free drinks for whoever stops first",
        tip: "Persuasion; −2 coins either way.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, {
            coins: -2,
            renown: pass ? 2 : 0,
            xp: { persuasion: 10 },
          }),
      },
    ],
  },
  // ------------------------------------------------ the times
  {
    key: "comet",
    pool: "any",
    cooldown: 99999,
    when: (g) =>
      [1618, 1664, 1680, 1682, 1744, 1759, 1769].includes(year(g)) ? {} : null,
    title: "A comet",
    body: () =>
      "A comet hangs in the sky every night, tail and all. The ministers say it's a warning. The almanac-makers say it's good for sales.",
    choices: [
      {
        label: "It's an omen: repent!",
        tip: "+faith, −stress (eventually).",
        apply: (g, life) => fx(g, life, { xp: { faith: 12 }, stress: -4 }),
      },
      {
        label: "Study its course",
        tip: "+letters; you might be the one to predict its return.",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { xp: { letters: 15 }, renown: pass ? 2 : 0 }),
      },
    ],
  },
  {
    key: "hurricane",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      isHurricaneSeason(
        g.map.provinces[life.prov].lat,
        g.map.provinces[life.prov].lon,
        month(g),
      )
        ? {}
        : null,
    title: "Hurricane",
    body: () =>
      "The sky turns green. Birds fly inland. By night the wind is screaming and the sea is in the streets.",
    choices: [
      {
        label: "Shelter in the church",
        tip: "Safe, mostly.",
        apply: (g, life) =>
          fx(g, life, {
            stress: 10,
            coins: -Math.min(3, Math.max(0, life.purse)),
          }),
      },
      {
        label: "Save the boats",
        tip: "Seamanship: renown if it works, drowning if it doesn't.",
        check: { skill: "seamanship", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 4, coins: 3 } : { health: -30 },
            "a hurricane",
          ),
      },
    ],
  },
  {
    key: "earthquake",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      year(g) === 1755 && g.map.provinces[life.prov].lat > 38 ? {} : null,
    title: "The earth shook",
    body: () =>
      "At four in the morning the house danced. Chimneys came down all over town. The ministers are preaching on Lisbon, which fell the same month.",
    choices: [
      {
        label: "Help dig out the neighbours",
        tip: "+renown, +leadership.",
        apply: (g, life) =>
          fx(g, life, { renown: 3, xp: { leadership: 10 }, stress: 5 }),
      },
      {
        label: "Pray",
        tip: "+faith.",
        apply: (g, life) => fx(g, life, { xp: { faith: 12 } }),
      },
    ],
  },
  {
    key: "stamp-act",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      year(g) === 1765 &&
      colonist(g, life) &&
      g.s.nations[me(g, life).nation]?.key === "england"
        ? {}
        : null,
    title: "The Stamp Act",
    body: () =>
      "Parliament has taxed every newspaper, deed, will, diploma and pack of cards. The stamp distributor has been hanged in effigy, and the effigy is being burned on the common. Again.",
    choices: [
      {
        label: "Join the crowd at the bonfire",
        tip: "+renown with the patriots; the crown notes your face.",
        apply: (g, life) => fx(g, life, { renown: 3, favor: -4 }),
      },
      {
        label: "Buy your stamps like a loyal subject",
        tip: "+favor; neighbours call you a Tory.",
        apply: (g, life) => fx(g, life, { favor: 5, renown: -2, coins: -1 }),
      },
      {
        label: "Write a pamphlet: no taxation without representation",
        tip: "Letters: big renown if it lands.",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { renown: 6, xp: { letters: 15 } } : { xp: { letters: 8 } },
          ),
      },
    ],
  },
  {
    key: "tea-party",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      year(g) === 1773 &&
      month(g) === 11 &&
      colonist(g, life) &&
      g.s.nations[me(g, life).nation]?.key === "england"
        ? {}
        : null,
    title: "A tea party",
    body: () =>
      "Men dressed, unconvincingly, as Mohawks are going down to the harbour with hatchets to throw the East India Company's tea into the sea. They have a spare blanket.",
    choices: [
      {
        label: "Grab a hatchet",
        tip: "+5 renown. The crown will be very cross.",
        apply: (g, life) => fx(g, life, { renown: 5, favor: -8, stress: -5 }),
      },
      {
        label: "Watch from the wharf",
        tip: "A story for the grandchildren.",
        apply: (g, life) => fx(g, life, { stress: -3 }),
      },
      {
        label: "Fetch the watch",
        tip: "+favor; your neighbours won't forgive it.",
        apply: (g, life) => fx(g, life, { favor: 8, renown: -5 }),
      },
    ],
  },
  {
    key: "war-news",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      warNow(g, life) && adult(g, life) && !job(life, "soldier", "warrior")
        ? {}
        : null,
    title: "The drums",
    body: (g, life) => {
      const w = g.s.wars.find(
        (x) => x.a === me(g, life).nation || x.b === me(g, life).nation,
      )!;
      return `${w.why}. The recruiting party is in ${here(g, life)} with a drum, a fife, and a sergeant who promises glory, plunder and three meals a day. He's lying about the meals.`;
    },
    choices: [
      {
        // Unanswered, nothing changes.
        label: "Keep your head down",
        tip: "Nothing changes.",
        apply: () => {},
      },
      {
        label: "Take the shilling",
        tip: "Enlist as a soldier (or warrior) if there's a fort here.",
        apply: (g, life) => {
          const kind: JobKind = native(g, life) ? "warrior" : "soldier";
          const place = native(g, life) ? "councilfire" : "fort";
          const r = enlist(g, life, kind, place);
          if (r) say(g, life, r);
        },
      },
      {
        label: "Give to the war chest (3 coins)",
        tip: "+favor and renown.",
        blocked: (g, life) => poor(life, 3),
        apply: (g, life) => fx(g, life, { coins: -3, favor: 3, renown: 1 }),
      },
    ],
  },
  {
    key: "patriot-or-loyal",
    pool: "any",
    cooldown: 1200,
    when: (g, life) =>
      year(g) >= 1766 &&
      colonist(g, life) &&
      adult(g, life) &&
      g.s.nations[me(g, life).nation]?.key === "england"
        ? {}
        : null,
    title: "Whose side?",
    body: () =>
      'At dinner your host raises a glass to "the King, God bless him", and half the table raises theirs and half doesn\'t. Everyone is looking at you.',
    choices: [
      {
        label: "To the King!",
        tip: "+favor; the Sons of Liberty mark you.",
        apply: (g, life) => fx(g, life, { favor: 4, renown: -1 }),
      },
      {
        label: "To liberty!",
        tip: "+renown; the crown marks you.",
        apply: (g, life) => fx(g, life, { renown: 2, favor: -3 }),
      },
      {
        label: "To the ladies!",
        tip: "Persuasion: a laugh, and nobody remembers what you didn't say.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(g, life, { xp: { persuasion: 10 }, stress: pass ? -4 : 4 }),
      },
    ],
  },
  // ------------------------------------------------ the century's news
  {
    key: "almanac",
    pool: "any",
    cooldown: 1500,
    when: (g, life) =>
      colonist(g, life) && year(g) >= 1733 && year(g) <= 1758 && adult(g, life)
        ? {}
        : null,
    title: "Poor Richard's Almanack",
    body: () =>
      "A peddler has this year's almanac from Philadelphia: tides, eclipses, the weather to come (guessed), and a proverb on every page. 'Fish and visitors stink in three days.' Everyone is quoting it.",
    choices: [
      {
        label: "Buy one (1 coin)",
        tip: "+letters, a little wisdom, −stress.",
        blocked: (_g, life) => poor(life, 1),
        apply: (g, life) => {
          spend(g, life, 1);
          fx(g, life, { xp: { letters: 10, trade: 4 }, stress: -3 });
          say(
            g,
            life,
            "Early to bed and early to rise. You try it for a week.",
          );
        },
      },
      {
        label: "Write a better one",
        tip: "Letters: an almanac of your own sells, or doesn't.",
        check: { skill: "letters", dc: 8 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { letters: 15 } });
          if (pass) {
            fx(g, life, { coins: 6, renown: 3 });
            say(
              g,
              life,
              "Your almanac sells out. Your weather is no worse than his.",
              "good",
            );
          } else
            say(
              g,
              life,
              "Your almanac predicted a mild winter. It was not.",
              "bad",
            );
        },
      },
      {
        label: "Use it to light the fire",
        tip: "Nothing.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "zenger",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      colonist(g, life) && year(g) >= 1734 && year(g) <= 1735 && adult(g, life)
        ? {}
        : null,
    title: "The printer Zenger in gaol",
    body: () =>
      "In New York a German printer named Zenger sits in gaol for printing that the governor is a crook. The governor's friends call it seditious libel. Everyone else calls it true. A lawyer from Philadelphia is coming to argue that truth is a defence.",
    choices: [
      {
        label: "Give to his defence (2 coins)",
        tip: "Renown among the people; the governor's men take note.",
        blocked: (_g, life) => poor(life, 2),
        apply: (g, life) => {
          spend(g, life, 2);
          fx(g, life, { renown: 2, favor: -2, xp: { persuasion: 6 } });
          say(
            g,
            life,
            "The jury acquits him. You cheer with the rest.",
            "good",
          );
        },
      },
      {
        label: "A printer should mind his betters",
        tip: "Favour with the governor's party.",
        apply: (g, life) => fx(g, life, { favor: 3 }),
      },
    ],
  },
  {
    key: "blackbeard",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      colonist(g, life) &&
      year(g) >= 1716 &&
      year(g) <= 1718 &&
      g.map.provinces[life.prov].coastal &&
      g.map.provinces[life.prov].lat < 37
        ? {}
        : null,
    title: "Blackbeard off the bar",
    body: () =>
      "A pirate with lit fuses in his beard has four ships across the harbour mouth and is holding the town's leading men to ransom. His price: a chest of medicine. The council is thinking about it.",
    choices: [
      {
        label: "Lie low",
        tip: "Nothing ventured.",
        apply: (g, life) => fx(g, life, { stress: 4 }),
      },
      {
        label: "Row out with the militia",
        tip: "Fighting: glory, or a cutlass.",
        check: { skill: "fighting", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 6, xp: { fighting: 12 } }
              : { health: -22, stress: 6 },
            "a pirate's cutlass",
          ),
      },
      {
        label: "Sell him the medicine yourself",
        tip: "Trade: coins, if nobody finds out who sold it.",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { coins: 8, xp: { trade: 8 } });
          if (!pass) {
            fx(g, life, { renown: -3, favor: -5 });
            say(
              g,
              life,
              "Everyone knows who sold the pirate his physic.",
              "bad",
            );
          }
        },
      },
    ],
  },
  {
    key: "great-snow",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      year(g) === 1717 &&
      [1, 2].includes(month(g)) &&
      g.map.provinces[life.prov].lat >= 40
        ? {}
        : null,
    title: "The Great Snow",
    body: () =>
      "Four storms in ten days. The drifts are over the eaves; people go in and out by the upper windows. Cattle are buried standing. The post rider is somewhere under it.",
    choices: [
      {
        label: "Dig out the neighbours",
        tip: "Renown and goodwill; it's cold work.",
        apply: (g, life) => {
          fx(g, life, { renown: 2, health: -5 }, "the cold");
          const c = someone(g, life);
          if (c)
            remembers(
              g,
              life,
              g.char(c.id),
              "Dug us out in the Great Snow",
              15,
              0,
            );
        },
      },
      {
        label: "Stay in by the fire",
        tip: "−stress; the woodpile shrinks.",
        apply: (g, life) => fx(g, life, { stress: -6, coins: -1 }),
      },
    ],
  },
  {
    key: "lottery",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      colonist(g, life) && year(g) >= 1700 && adult(g, life) && life.purse >= 2
        ? {}
        : null,
    title: "A lottery",
    body: (g, life) =>
      `Tickets are on sale at ${here(g, life)} for a lottery to build a ${g.rng.chance(0.5) ? "steeple" : "college"}. First prize, thirty pounds. The managers assure everyone it is entirely honest, and that they have bought no tickets themselves.`,
    choices: [
      {
        label: "Buy a ticket (1 coin)",
        tip: "A long shot.",
        apply: (g, life) => {
          spend(g, life, 1);
          if (g.rng.chance(0.06)) {
            fx(g, life, { coins: 30, renown: 2 });
            say(g, life, "Your number comes up. Thirty pounds!", "good");
          } else say(g, life, "Not your number. The steeple goes up anyway.");
        },
      },
      {
        label: "A sinful waste",
        tip: "+faith.",
        apply: (g, life) => fx(g, life, { xp: { faith: 6 } }),
      },
    ],
  },
  {
    key: "dancing-master",
    pool: "any",
    cooldown: 1500,
    when: (g, life) =>
      colonist(g, life) &&
      adult(g, life) &&
      (life.lifestyle === "comfortable" || life.background === "gentry") &&
      year(g) >= 1680
        ? {}
        : null,
    title: "The dancing master",
    body: () =>
      "A Frenchman of uncertain history has set up as a dancing master: the minuet, the country dances, how to bow, how to enter a room. Several matrons swear by him. Several ministers swear at him.",
    choices: [
      {
        label: "Take lessons (3 coins)",
        tip: "Persuasion: the assembly rooms open up.",
        blocked: (_g, life) => poor(life, 3),
        apply: (g, life) => {
          spend(g, life, 3);
          fx(g, life, { xp: { persuasion: 18 }, stress: -2 });
        },
      },
      {
        label: "Two left feet, and proud of it",
        tip: "Nothing.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "braddock-wagons",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      colonist(g, life) &&
      year(g) === 1755 &&
      adult(g, life) &&
      job(life, "farmer", "craftsman", "innkeeper", "clerk")
        ? {}
        : null,
    title: "The general wants wagons",
    body: () =>
      "A general fresh from England is marching on the French fort at the Forks of the Ohio and cannot find a wagon in the colony. The postmaster has put up handbills: fifteen shillings a day for a wagon and team, and the king's word you'll be paid.",
    choices: [
      {
        label: "Hire out your wagon",
        tip: "Coins now; the team may not come back.",
        apply: (g, life) => {
          fx(g, life, { coins: 5 });
          if (g.rng.chance(0.5)) {
            fx(g, life, { coins: -3, stress: 5 });
            say(
              g,
              life,
              "The general was routed on the Monongahela. Your horses were not seen again.",
              "bad",
            );
          } else
            say(g, life, "The wagon came back, muddy and paid for.", "good");
        },
      },
      {
        label: "Generals don't pay their bills",
        tip: "Nothing ventured.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "acadians",
    pool: "any",
    cooldown: 99999,
    when: (g, life) =>
      colonist(g, life) &&
      year(g) >= 1755 &&
      year(g) <= 1757 &&
      g.map.provinces[life.prov].coastal
        ? {}
        : null,
    title: "The Acadians",
    body: () =>
      "A ship has put in with families from Acadia, turned out of their farms by the army and scattered down the coast: French, Catholic, and nothing to their names but what they carried. The town doesn't know what to do with them.",
    choices: [
      {
        label: "Take a family in (3 coins)",
        tip: "Renown and gratitude; your neighbours mutter about papists.",
        blocked: (_g, life) => poor(life, 3),
        apply: (g, life) => {
          spend(g, life, 3);
          fx(g, life, { renown: 3, xp: { faith: 8 }, stress: 2 });
        },
      },
      {
        label: "Give something at church",
        tip: "1 coin, +faith.",
        blocked: (_g, life) => poor(life, 1),
        apply: (g, life) => {
          spend(g, life, 1);
          fx(g, life, { xp: { faith: 6 } });
        },
      },
      {
        label: "Not our trouble",
        tip: "Nothing.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "wolf-bounty",
    pool: "any",
    cooldown: 900,
    when: (g, life) =>
      colonist(g, life) &&
      adult(g, life) &&
      job(life, "farmer", "trapper", "hunter", "servant")
        ? {}
        : null,
    title: "A bounty on wolves",
    body: () =>
      "The selectmen will pay for every wolf's head nailed to the meeting-house door. Somebody has already tried to pass off a large dog.",
    choices: [
      {
        label: "Go hunting",
        tip: "Woodcraft: coins per head.",
        check: { skill: "woodcraft", dc: 7 },
        apply: (g, life, _c, pass) => {
          fx(g, life, { xp: { woodcraft: 10, fighting: 4 } });
          if (pass) fx(g, life, { coins: 4, renown: 1 });
          else say(g, life, "The wolves were smarter than you this time.");
        },
      },
      {
        label: "Leave it to the trappers",
        tip: "Nothing.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "tithingman",
    pool: "any",
    cooldown: 2000,
    when: (g, life) =>
      me(g, life).religion === "puritan" &&
      adult(g, life) &&
      !me(g, life).female
        ? {}
        : null,
    title: "Chosen tithingman",
    body: () =>
      "The town meeting has made you a tithingman: you'll keep order in the meeting house with a long rod, a feather at one end for the ladies who nod off and a knob at the other for the men, and report Sabbath-breakers.",
    choices: [
      {
        label: "Serve, rod in hand",
        tip: "+faith, a little renown, a few enemies among the sleepy.",
        apply: (g, life) =>
          fx(g, life, { xp: { faith: 10 }, renown: 1, stress: 2 }),
      },
      {
        label: "Pay the fine to be excused (2 coins)",
        tip: "Peace on the Sabbath.",
        blocked: (_g, life) => poor(life, 2),
        apply: (g, life) => spend(g, life, 2),
      },
    ],
  },
  {
    key: "missionary",
    pool: "any",
    cooldown: 1500,
    when: (g, life) => (native(g, life) && adult(g, life) ? {} : null),
    title: "The black robe",
    body: (g) =>
      `A missionary has come to the village in a long ${g.rng.chance(0.5) ? "black robe" : "plain coat"}, speaking your language badly and his own God very well. He has needles, kettles and opinions, and he wants to stay the winter.`,
    choices: [
      {
        label: "Listen to him",
        tip: "Faith; some of the elders won't like it.",
        apply: (g, life) =>
          fx(g, life, { xp: { faith: 12, letters: 4 }, favor: -2 }),
      },
      {
        label: "Trade with him",
        tip: "Trade: kettles and knives for corn.",
        check: { skill: "trade", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass ? { coins: 4, xp: { trade: 8 } } : { xp: { trade: 4 } },
          ),
      },
      {
        label: "Send him on his way",
        tip: "The elders approve.",
        apply: (g, life) => fx(g, life, { favor: 3, renown: 1 }),
      },
    ],
  },
  {
    key: "ball-game",
    pool: "any",
    cooldown: 700,
    when: (g, life) =>
      native(g, life) && ageOfLife(g.s, life) >= 14 && !me(g, life).female
        ? {}
        : null,
    title: "The ball game",
    body: () =>
      "The next town has challenged yours to the ball game: a hundred players a side, a field a mile long, sticks, no rules worth the name, and bets on everything from blankets to wives. The old men call it the little brother of war.",
    choices: [
      {
        label: "Play",
        tip: "Fighting: renown if you win; bruises either way.",
        check: { skill: "fighting", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 4, xp: { fighting: 10 }, health: -3 }
              : { health: -10, xp: { fighting: 6 } },
            "a ball game",
          ),
      },
      {
        label: "Bet on it instead",
        tip: "Coins on a coin toss, near enough.",
        apply: (g, life) => {
          const won = g.rng.chance(0.5);
          fx(g, life, {
            coins: won ? 3 : -Math.min(3, Math.max(0, life.purse)),
          });
          say(
            g,
            life,
            won ? "Your town won. So did you." : "Your town lost. So did you.",
            won ? "good" : "bad",
          );
        },
      },
    ],
  },
  {
    key: "electric-show",
    pool: "any",
    cooldown: 1500,
    when: (g, life) =>
      colonist(g, life) && year(g) >= 1745 && year(g) <= 1775 && life.purse >= 1
        ? {}
        : null,
    title: "Electrical fire",
    body: () =>
      "A travelling lecturer has hired the court house to show 'the newly discovered Electrical Fire': he makes sparks leap from a boy hung from the ceiling on silk cords, rings bells with no hand on them, and kills a turkey, rather slowly. A shilling to watch, two to be shocked.",
    choices: [
      {
        label: "Pay to be shocked",
        tip: "+learning; your hair will never be the same.",
        apply: (g, life) => {
          spend(g, life, Math.min(1, life.purse));
          fx(g, life, {
            xp: { letters: 10, medicine: 4 },
            stress: -3,
            renown: 1,
          });
        },
      },
      {
        label: "It's witchcraft with a lecture",
        tip: "+faith.",
        apply: (g, life) => fx(g, life, { xp: { faith: 6 } }),
      },
    ],
  },
  {
    key: "coffee-house",
    pool: "any",
    cooldown: 1200,
    when: (g, life) =>
      colonist(g, life) &&
      adult(g, life) &&
      year(g) >= 1690 &&
      settlers(g.s.provinces[life.prov]) >= 3000
        ? {}
        : null,
    title: "The coffee house",
    body: () =>
      "A coffee house has opened by the wharf: newspapers from London, ships' news chalked on a board, insurance written at the corner table, and arguments about everything at every other.",
    choices: [
      {
        label: "Make it your second home",
        tip: "Trade and letters; a few useful acquaintances.",
        apply: (g, life) => {
          fx(g, life, {
            xp: { trade: 8, letters: 6, persuasion: 4 },
            coins: -1,
          });
          const c = someone(g, life, (x) => !!x.role);
          if (c)
            remembers(
              g,
              life,
              g.char(c.id),
              "We argue at the coffee house",
              8,
              0,
            );
        },
      },
      {
        label: "Tavern men don't drink coffee",
        tip: "Nothing.",
        apply: () => undefined,
      },
    ],
  },
  // ------------------------------------------------ fortune and ambition
  {
    key: "patron-notice",
    pool: "any",
    cooldown: 1200,
    when: (g, life) => {
      if (life.patron >= 0 || life.renown < 12 || !adult(g, life)) return null;
      const c = someone(
        g,
        life,
        (x) =>
          !!x.role &&
          [
            "merchant",
            "planter",
            "official",
            "lawyer",
            "sachem",
            "elder",
          ].includes(x.role),
      );
      return c ? { c: c.id } : null;
    },
    title: "Someone of consequence",
    body: (g, life, ctx) =>
      `${charName(g.s.chars[ctx.c])} has heard of you and invites you to dine. It would be useful to be liked by ${him(g.s.chars[ctx.c])}.`,
    choices: [
      {
        label: "Charm them",
        tip: "Persuasion: they may become your patron.",
        check: { skill: "persuasion", dc: 7 },
        apply: (g, life, ctx, pass) => {
          const c = g.char(ctx.c);
          meet(g, life, c.id);
          remembers(
            g,
            life,
            c,
            pass ? "Delightful company" : "Dull company",
            pass ? 25 : -5,
            3,
          );
          if (pass && opinionOf(g.s, c, life).total >= 40) {
            life.patron = c.id;
            say(
              g,
              life,
              `${charName(c)} has taken you up: you have a patron.`,
              "good",
            );
          }
        },
      },
      {
        label: "Talk business",
        tip: "Trade: a useful tip worth some coins.",
        check: { skill: "trade", dc: 7 },
        apply: (g, life, ctx, pass) => {
          meet(g, life, ctx.c);
          fx(g, life, { coins: pass ? 6 : 0, xp: { trade: 10 } });
        },
      },
    ],
  },
  {
    key: "gambling-debt",
    pool: "any",
    cooldown: 900,
    when: (g, life) => (life.purse < 0 && adult(g, life) ? {} : null),
    title: "Creditors",
    body: () =>
      "The baker, the tailor and the man you lost to at cards are all waiting on your step, and they've brought the constable.",
    choices: [
      {
        label: "Sell what you own",
        tip: "Your purse back to nothing; −2 renown.",
        apply: (g, life) => {
          touchLife(g, life).purse = 0;
          life.goods = {};
          fx(g, life, { renown: -2, stress: 5 });
        },
      },
      {
        label: "Talk them into waiting",
        tip: "Persuasion buys time.",
        check: { skill: "persuasion", dc: 8 },
        apply: (g, life, _c, pass) =>
          fx(g, life, pass ? { stress: -5 } : { stress: 12, renown: -3 }),
      },
      {
        label: "Skip town by night",
        tip: "Stealth. Leaves a bad name behind.",
        check: { skill: "stealth", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            touchLife(g, life).purse = 0;
            fx(g, life, { renown: -4 });
          } else
            fx(
              g,
              life,
              { renown: -6, health: -8, stress: 10 },
              "a night in the debtors' gaol",
            );
        },
      },
    ],
  },
  {
    key: "gout",
    pool: "any",
    cooldown: 900,
    when: (g, life) => (trait(g, life, "gouty") ? {} : null),
    title: "The gout",
    body: () =>
      "Your great toe has swollen to the size and colour of a plum, and every footstep is a sermon on moderation.",
    choices: [
      {
        label: "Give up port and venison",
        tip: "Lifestyle to modest; the gout may ease.",
        apply: (g, life) => {
          touchLife(g, life).lifestyle = "modest";
          if (g.rng.chance(0.4)) fx(g, life, { lose: "gouty" });
          fx(g, life, { stress: 6 });
        },
      },
      {
        label: "Endure it with dignity",
        tip: "And more port.",
        apply: (g, life) => fx(g, life, { health: -6, stress: 6 }, "the gout"),
      },
    ],
  },
  {
    key: "drunk-reform",
    pool: "any",
    cooldown: 1000,
    when: (g, life) => (trait(g, life, "drunkard") ? {} : null),
    title: "The morning after",
    body: () =>
      "You wake in a hayloft that isn't yours, wearing a hat that isn't yours, with a lot of explaining to do. A temperance preacher is in town.",
    choices: [
      {
        label: "Take the pledge",
        tip: "Faith: give up the drink.",
        check: { skill: "faith", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { lose: "drunkard", renown: 1 });
            say(g, life, "You took the pledge, and kept it. Mostly.", "good");
          } else fx(g, life, { stress: 6 });
        },
      },
      {
        label: "Hair of the dog",
        tip: "Stress goes down; health goes with it.",
        apply: (g, life) => fx(g, life, { stress: -6, health: -4 }, "drink"),
      },
    ],
  },
  {
    key: "europe-invite",
    pool: "raised",
    cooldown: 0,
    title: (g, life) =>
      life.invite?.why === "recalled"
        ? "Recalled"
        : life.invite?.why === "army"
          ? "A posting in Flanders"
          : "A seat at home",
    body: (g, life) => {
      const why = life.invite?.why;
      const kids = kidsOf(g, life).length;
      return `${why === "recalled" ? "The crown has recalled you to answer for the colony." : why === "army" ? "The army in Europe offers you a regiment and the rank to go with it." : "Friends at home have found you a seat: Parliament, or its like."} If you go, your life in America ends; ${kids ? "a child left behind would carry the family on here" : "you have no children to carry on here"}. Ships leave from any port in the next six months.`;
    },
    choices: [
      {
        label: "Go, and leave the heir to carry on here",
        tip: "You continue as your heir in America.",
        blocked: (g, life) =>
          kidsOf(g, life).length === 0 ? "No child to leave" : null,
        apply: (g, life) => {
          const r = euro(g, life, false);
          if (r) say(g, life, r);
        },
      },
      {
        label: "Go with the whole family",
        tip: "Your story in America ends here.",
        apply: (g, life) => {
          const r = euro(g, life, true);
          if (r) say(g, life, r);
        },
      },
      {
        label: "Decline (or decide later)",
        tip: "The invitation stands for six months.",
        apply: () => {},
      },
    ],
  },
  // ------------------------------------------------ movements and the law
  {
    key: "movement-recruiter",
    pool: "any",
    cooldown: 700,
    when: (g, life) => {
      if (!adult(g, life)) return null;
      const s = g.s;
      if (
        s.movements.some(
          (m) =>
            (m.status === "brewing" || m.status === "risen") &&
            (m.members.includes(life.c) || m.leader === life.c),
        )
      )
        return null;
      const m = s.movements.find(
        (x) =>
          (x.status === "brewing" || x.status === "risen") &&
          x.region.includes(life.prov) &&
          x.people >= 0 === native(g, life) &&
          s.nations[x.against]?.ruler !== life.c,
      );
      return m ? { m: m.id } : null;
    },
    title: (g, _l, ctx) =>
      g.s.movements.find((m) => m.id === ctx.m)?.name ?? "A cause",
    body: (g, _life, ctx) => {
      const m = g.s.movements.find((x) => x.id === ctx.m)!;
      return `A man with ink on his fingers and fire in his eye takes you aside. "${m.text}" ${m.name} wants people like you.`;
    },
    choices: [
      {
        label: "Swear yourself to the cause",
        tip: "Join the movement.",
        apply: (g, life, ctx) => {
          const r = joinM(g, life, ctx.m);
          if (r) say(g, life, r);
        },
      },
      { label: "Not today", tip: "Nothing changes.", apply: () => {} },
      {
        label: "Report him to the magistrate",
        tip: "+favor; the cause's people won't forget.",
        apply: (g, life) => fx(g, life, { favor: 4, renown: -1 }),
      },
    ],
  },
  {
    key: "movement-hour",
    pool: "raised",
    cooldown: 0,
    title: "The hour has come",
    body: (g, _life, ctx) => {
      const m = g.s.movements.find((x) => x.id === ctx.m);
      return `Your followers say it's now or never for ${m?.name ?? "the cause"}: the people are ready, the muskets are oiled, and the governor suspects. Support stands at ${Math.round(m?.support ?? 0)}.`;
    },
    choices: [
      {
        label: "Raise the standard",
        tip: "The rising begins (if you're among your followers).",
        apply: (g, life, ctx) => {
          const m = g.s.movements.find((x) => x.id === ctx.m);
          if (!m) return;
          const r = riseM(g, life);
          if (r) say(g, life, `Not yet: ${r}`);
        },
      },
      {
        label: "Wait for a better moment",
        tip: "Support may grow, or the moment may pass.",
        apply: () => {},
      },
    ],
  },
  {
    key: "seditious-libel",
    pool: "raised",
    cooldown: 0,
    title: "The constable",
    body: () =>
      "The constable and two of the watch, at your door with a warrant: seditious libel, for a pamphlet everyone's read and nobody admits to writing.",
    choices: [
      {
        label: "Deny everything",
        tip: "Stealth: the printer won't talk.",
        check: { skill: "stealth", dc: 7 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { stress: 4 }
              : {
                  coins: -Math.min(10, Math.max(0, life.purse)),
                  stress: 12,
                  renown: 2,
                },
          ),
      },
      {
        label: "Defend yourself in court",
        tip: "Letters: an acquittal makes you a hero.",
        check: { skill: "letters", dc: 9 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, { renown: 8 });
            say(
              g,
              life,
              "The jury acquitted you in ten minutes. The crowd carried you home.",
              "good",
            );
          } else
            fx(
              g,
              life,
              {
                coins: -Math.min(15, Math.max(0, life.purse)),
                health: -10,
                stress: 15,
              },
              "a winter in gaol",
            );
        },
      },
      {
        label: "Pay a fine (8 coins)",
        tip: "Quietly.",
        blocked: (g, life) => poor(life, 8),
        apply: (g, life) => fx(g, life, { coins: -8, renown: -1 }),
      },
    ],
  },
  {
    key: "informed-upon",
    pool: "raised",
    cooldown: 0,
    title: "Informed upon",
    body: () =>
      "Somebody talked. The magistrate has your name, the names of half your friends, and a list of where the muskets are hidden.",
    choices: [
      {
        label: "Move the muskets tonight",
        tip: "Stealth saves the cause's arms.",
        check: { skill: "stealth", dc: 8 },
        apply: (g, life, ctx, pass) => {
          const m = g.s.movements.find((x) => x.id === ctx.m);
          if (m && !pass) {
            m.arms = Math.floor(m.arms / 2);
            m.support = Math.max(0, m.support - 5);
            g.movementsChanged();
          }
          fx(g, life, { xp: { stealth: 12 }, stress: 6 });
        },
      },
      {
        label: "Brazen it out",
        tip: "Persuasion with the magistrate.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { renown: 2 }
              : { coins: -Math.min(10, Math.max(0, life.purse)), stress: 10 },
          ),
      },
    ],
  },
  {
    key: "rebel-caught",
    pool: "raised",
    cooldown: 0,
    title: "Taken in arms",
    body: () =>
      "The rising is broken. Your men are scattered or taken, the gallows are going up on the green, and the governor wants you very much indeed.",
    choices: [
      {
        label: "Flee into the wilderness",
        tip: "Woodcraft gets you clear: an outlaw, but alive.",
        check: { skill: "woodcraft", dc: 7 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            const wild =
              g.map.provinces[life.prov].nb
                .map(([q]) => q)
                .find((q) => g.s.provinces[q].owner < 0) ??
              g.map.provinces[life.prov].nb[0]?.[0];
            if (wild !== undefined) {
              touchLife(g, life).prov = wild;
              life.travel = null;
              life.job = null;
            }
            fx(g, life, { renown: -5, favor: -30 });
            say(
              g,
              life,
              "You lived in the woods for a season. They stopped looking, eventually.",
              "bad",
            );
          } else kill(g, me(g, life), "the hangman, for rebellion");
        },
      },
      {
        label: "Throw yourself on the governor's mercy",
        tip: "Persuasion: a pardon and a fine, or the rope.",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, _c, pass) => {
          if (pass) {
            fx(g, life, {
              coins: -Math.min(20, Math.max(0, life.purse)),
              renown: -3,
              favor: -20,
            });
            say(g, life, "Pardoned, fined, and watched. You're alive.", "bad");
          } else kill(g, me(g, life), "the hangman, for rebellion");
        },
      },
      {
        label: "Take ship into exile",
        tip: "Your story in America ends (an heir left behind carries on).",
        apply: (g, life) => {
          touchLife(g, life).invite = { why: "exile", until: g.s.day + 30 };
          const r = euro(g, life, false);
          if (r) {
            const r2 = euro(g, life, true);
            if (r2) say(g, life, r2);
          }
        },
      },
    ],
  },
  {
    key: "rebel-hunted",
    pool: "raised",
    cooldown: 0,
    title: "Lists of names",
    body: () =>
      "The rising is crushed and the governor's men are going door to door with lists. Yours might be on one.",
    choices: [
      {
        label: "Lie low",
        tip: "Stealth: they pass you by.",
        check: { skill: "stealth", dc: 6 },
        apply: (g, life, _c, pass) =>
          fx(
            g,
            life,
            pass
              ? { stress: 6 }
              : {
                  coins: -Math.min(10, Math.max(0, life.purse)),
                  health: -10,
                  stress: 10,
                },
            "a winter in gaol",
          ),
      },
      {
        label: "Swear the oath of loyalty",
        tip: "Safe. Your old comrades call you a turncoat.",
        apply: (g, life) => fx(g, life, { renown: -3, favor: 5 }),
      },
    ],
  },
];

export const LIFE_EVENTS: LifeEventDef[] = [
  ...BASE_EVENTS,
  ...MORE_EVENTS,
  ...TALES,
  ...LEAD_EVENTS, // WORLD r11
  // LIFE (r11): matters at work, crime and the law, your people, boats, the road.
  ...R11_EVENTS,
  ...SOCIETY_EVENTS, // SOCIETY (r11)
];

// ---------------------------------------------------------------- a few calls out

import { LEAD_EVENTS } from "./LeadEvents"; // WORLD r11
import { leaveForEurope, takeJob } from "./Life";
import { MORE_EVENTS } from "./MoreEvents";
import { joinMovement, riseFor } from "./Movements";
import { R11_EVENTS } from "./R11Events";
import { SOCIETY_EVENTS } from "./SocietyEvents"; // SOCIETY (r11)
import { TALES } from "./Tales";

function joinM(g: ConquestGame, life: Life, id: number): string | null {
  return joinMovement(g, life, id);
}
function riseM(g: ConquestGame, life: Life): string | null {
  return riseFor(g, life);
}
function euro(g: ConquestGame, life: Life, takeHeir: boolean): string | null {
  if (!g.s.provinces[life.prov].b.port && life.invite?.why !== "exile")
    return "You'll need to get to a port to sail; the invitation stands.";
  return leaveForEurope(g, life, takeHeir);
}
function enlist(
  g: ConquestGame,
  life: Life,
  kind: JobKind,
  place: "fort" | "councilfire",
): string | null {
  return takeJob(g, life, place, kind);
}

// ---------------------------------------------------------------- firing and answering

const BY_KEY = new Map(LIFE_EVENTS.map((e) => [e.key, e]));

function text<T>(
  v: string | ((g: ConquestGame, life: Life, ctx: LCtx) => T),
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
): string {
  return typeof v === "string" ? v : String(v(g, life, ctx));
}

/** The odds of a choice's check, if it has one. */
export function choiceOdds(
  g: ConquestGame,
  life: Life,
  c: LifeChoice,
  ctx: LCtx,
): number | null {
  if (!c.check) return null;
  const dc =
    typeof c.check.dc === "number" ? c.check.dc : c.check.dc(g, life, ctx);
  return checkChance(skillLevel(g.s, life, checkSkill(g, life, c, ctx)), dc);
}

/** The skill a choice's check tests. */
export function checkSkill(
  g: ConquestGame,
  life: Life,
  c: LifeChoice,
  ctx: LCtx,
): Skill {
  const sk = c.check!.skill;
  return typeof sk === "function" ? sk(g, life, ctx) : sk;
}

function render(
  g: ConquestGame,
  life: Life,
  def: LifeEventDef,
  ctx: LCtx,
): LifeEventPending {
  const s = g.s;
  const choices: EventChoice[] = def.choices.map((c) => {
    const odds = choiceOdds(g, life, c, ctx);
    const why = c.blocked?.(g, life, ctx) ?? null;
    const label = text(c.label, g, life, ctx);
    const tip = text(c.tip, g, life, ctx);
    return {
      label:
        odds !== null
          ? `${label} (${SKILL_NAMES[checkSkill(g, life, c, ctx)]} ${Math.round(odds * 100)}%)`
          : label,
      tip: why ? `${tip} (${why}.)` : tip,
    };
  });
  return {
    id: g.nextId(),
    key: def.key,
    day: s.day,
    title: text(def.title, g, life, ctx),
    body: def.body(g, life, ctx),
    choices,
    ctx,
    expires: s.day + LIFE_EVENT_DAYS,
    scene: sceneOf(g, life, def, ctx),
    c: figureOf(g, life, def, ctx),
  };
}

/** Where an event happens, for its scene. */
function sceneOf(
  g: ConquestGame,
  life: Life,
  def: LifeEventDef,
  ctx: LCtx,
): string {
  if (def.scene)
    return typeof def.scene === "string" ? def.scene : def.scene(g, life, ctx);
  if (def.pool === "road") return "road";
  if (def.pool === "sea") return "deck";
  const known = SCENES[def.key];
  if (known) return known;
  const prefix = def.key.split("-")[0];
  return SCENES[`${prefix}-`] ?? life.area ?? "home";
}

/** Who stands opposite you: the one it's about, or your master for work. */
function figureOf(
  g: ConquestGame,
  life: Life,
  def: LifeEventDef,
  ctx: LCtx,
): number {
  const c = g.s.chars[ctx.c];
  if (c && c.id !== life.c) return c.id;
  const job = life.job;
  const scene = SCENES[def.key] ?? SCENES[`${def.key.split("-")[0]}-`];
  if (job && !job.own && scene === job.place && g.s.chars[job.employer]?.alive)
    return job.employer;
  return -1;
}

const SCENES: Record<string, string> = {
  fever: "home",
  smallpox: "home",
  breakdown: "home",
  "old-age": "home",
  admirer: "market",
  "spouse-quarrel": "home",
  "child-sick": "home",
  "child-trade": "home",
  "child-match": "church",
  portrait: "home",
  legacy: "home",
  fire: "home",
  "lost-purse": "market",
  "fortune-teller": "market",
  "rival-insult": "tavern",
  "friend-loan": "tavern",
  "farm-": "fields",
  "mill-": "workshop",
  "master-": "workshop",
  "press-": "press",
  "soldier-": "fort",
  "camp-": "fort",
  "sailor-": "docks",
  "merchant-": "market",
  "preacher-": "church",
  revival: "church",
  "physician-": "apothecary",
  "official-": "governor",
  "trapper-": "woods",
  "warrior-": "councilfire",
  vision: "woods",
  "green-corn": "village",
  "trade-rum": "village",
  "treaty-council": "councilfire",
  "servant-": "fields",
  "tavern-": "tavern",
  comet: "road",
  hurricane: "docks",
  earthquake: "home",
  "stamp-act": "tavern",
  "tea-party": "docks",
  "war-news": "tavern",
  "patriot-or-loyal": "tavern",
  almanac: "press",
  zenger: "press",
  blackbeard: "docks",
  "great-snow": "home",
  lottery: "tavern",
  "dancing-master": "governor",
  "braddock-wagons": "road",
  acadians: "docks",
  "wolf-bounty": "woods",
  tithingman: "church",
  missionary: "village",
  "ball-game": "village",
  "electric-show": "tavern",
  "coffee-house": "tavern",
  "patron-notice": "governor",
  "gambling-debt": "tavern",
  gout: "home",
  "drunk-reform": "church",
  "europe-invite": "court",
  "movement-recruiter": "tavern",
  "movement-hour": "rising",
  "seditious-libel": "press",
  "informed-upon": "governor",
  "rebel-caught": "fort",
  "rebel-hunted": "woods",
};

/** Days before anything that simply happens can happen again: variety. */
const MIN_REPEAT = 1460;
/** Ones that may press sooner (a sweetheart waiting for an answer). */
const PRESSING = new Set(["sweetheart-asks"]);

function fire(g: ConquestGame, life: Life, def: LifeEventDef, ctx: LCtx): void {
  touchLife(g, life);
  const gap =
    def.pool === "any" && !PRESSING.has(def.key)
      ? Math.max(def.cooldown, MIN_REPEAT)
      : def.cooldown;
  life.cooldowns[`ev:${def.key}`] = g.s.day + gap;
  life.events.push(render(g, life, def, ctx));
  life.tally.events++;
}

/** The game puts an event to a player (a rising's hour, an arrest, an invitation). */
export function raiseLifeEvent(
  g: ConquestGame,
  life: Life,
  key: string,
  ctx: LCtx = {},
): void {
  const def = BY_KEY.get(key);
  if (!def || life.watching || life.c < 0) return;
  // The same letter twice is one letter (proposals: one per asker).
  if (key.startsWith("p2p-")) {
    if (life.events.some((e) => e.key === key && e.ctx.c === ctx.c)) return;
  } else if (life.events.some((e) => e.key === key)) return;
  fire(g, life, def, ctx);
}

// LIFE (r11): other modules raise events through the hook, not an import.
hooks.raise.push(raiseLifeEvent);

/** Each day: maybe something happens (on the road, at sea, or at home). */
export function lifeEventsDaily(
  g: ConquestGame,
  life: Life,
  pool?: "road" | "sea",
): void {
  const s = g.s;
  // Unanswered events decide themselves eventually.
  for (const ev of [...life.events])
    if (ev.expires <= s.day) answer(g, life, ev, firstAllowed(g, life, ev));
  if (life.watching || life.c < 0) return;
  if (life.events.length >= MAX_PENDING) return;
  if (!pool && (life.travel || !g.rng.chance(EVENT_CHANCE))) return;
  const want = pool ?? "any";
  const options: { def: LifeEventDef; ctx: LCtx; w: number }[] = [];
  for (const def of LIFE_EVENTS) {
    if (def.pool !== want) continue;
    if ((life.cooldowns[`ev:${def.key}`] ?? 0) > s.day) continue;
    const ctx = def.when ? def.when(g, life) : {};
    if (!ctx) continue;
    options.push({ def, ctx, w: def.weight ?? 1 });
  }
  const total = options.reduce((m, o) => m + o.w, 0);
  if (total <= 0) return;
  let roll = g.rng.next() * total;
  for (const o of options) {
    roll -= o.w;
    if (roll <= 0) {
      fire(g, life, o.def, o.ctx);
      return;
    }
  }
}

function firstAllowed(
  g: ConquestGame,
  life: Life,
  ev: LifeEventPending,
): number {
  const def = BY_KEY.get(ev.key);
  if (!def) return 0;
  // Raised events with a "wait" choice default to it; others to the first they can take.
  if (def.pool === "raised") {
    const last = def.choices.length - 1;
    if (ev.key === "europe-invite" || ev.key === "movement-hour") return last;
    // Another player's proposal, unanswered, is refused.
    if (ev.key.startsWith("p2p-") && ev.key !== "p2p-reply") return last;
  }
  const i = def.choices.findIndex((c) => !c.blocked?.(g, life, ev.ctx));
  return i >= 0 ? i : 0;
}

function answer(
  g: ConquestGame,
  life: Life,
  ev: LifeEventPending,
  choice: number,
): void {
  touchLife(g, life);
  life.events = life.events.filter((e) => e.id !== ev.id);
  const def = BY_KEY.get(ev.key);
  const c = def?.choices[choice];
  if (!def || !c || life.c < 0) return;
  const odds = choiceOdds(g, life, c, ev.ctx);
  const pass = odds === null ? true : rollCheck(g, odds);
  outcomeMeta(g, life, {
    key: ev.key,
    title: ev.title,
    scene: ev.scene ?? "home",
    c: ev.c ?? -1,
    ok: odds === null ? null : pass,
    choice: ev.choices[choice]?.label,
  });
  if (c.check) gainXp(g, life, checkSkill(g, life, c, ev.ctx), 5);
  c.apply(g, life, ev.ctx, pass);
  if (odds !== null && life.c >= 0)
    journal(
      g,
      life,
      `${ev.title}: ${pass ? "it went your way" : "it didn't go your way"}.`,
      pass ? "good" : "bad",
    );
}

/** The player's choice. */
export function answerLifeEvent(
  g: ConquestGame,
  life: Life,
  id: number,
  choice: number,
): string | null {
  const ev = life.events.find((e) => e.id === id);
  if (!ev) return "That's been settled.";
  if (!Number.isInteger(choice) || choice < 0 || choice >= ev.choices.length)
    return "No such choice.";
  const def = BY_KEY.get(ev.key);
  const why = def?.choices[choice]?.blocked?.(g, life, ev.ctx);
  if (why) return `${why}.`;
  answer(g, life, ev, choice);
  return null;
}

/** The server's clock ran out for an event: it decides itself. */
export function autoAnswerLife(
  g: ConquestGame,
  seat: string,
  id: number,
): void {
  const life = g.s.lives.find((l) => l.seat === seat);
  const ev = life?.events.find((e) => e.id === id);
  if (life && ev) answer(g, life, ev, firstAllowed(g, life, ev));
}
