// LIFE (r11): the road and the sea as they really were, place by place and
// season by season: fevers in the Carolina swamps and alligators in the
// black water, snow on the mountain passes, fords in spate and ferrymen's
// prices, the native peoples' trails (their hospitality, their tolls, their
// mourning), Spanish patrols in Florida, coureurs des bois in the north,
// bison and prairie fire in the west, maroons in the island hills; at sea,
// hurricanes in their season, North Atlantic gales, fog on the Banks,
// becalmed latitudes, pirates in their golden age, the guarda costa, press
// gangs, wrecks on the reefs and smugglers' lights. Each draws on where the
// next leg of your journey goes.

import { batterBoat, sailingOwn, takeBoat } from "./Boats";
import { dateOf } from "./Calendar";
import { addHeat, addNotoriety } from "./Crime";
import { guideWithYou } from "./Followers";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  heal,
  hurt,
  journal,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { lifeIsNative, meOf } from "./LifeQueries";
import { isHurricaneSeason, isWinter } from "./Map";
import { atWar } from "./Queries";
import type { Good, Life, Skill, Terrain } from "./Types";

// ---------------------------------------------------------------- where the road goes

export type Region =
  | "caribbean"
  | "florida"
  | "gulf"
  | "south"
  | "chesapeake"
  | "middle"
  | "newengland"
  | "north"
  | "west"
  | "southwest";

export interface Hop {
  from: number;
  to: number;
  sea: boolean;
  terrain: Terrain;
  lat: number;
  lon: number;
  region: Region;
  /** Who holds the land ahead (-1 open country), and their key and kind. */
  owner: number;
  ownerKey: string;
  native: boolean;
  /** At war with your people. */
  war: boolean;
  month: number;
  winter: boolean;
  hurricane: boolean;
  /** This leg crosses a river (overland). */
  river: boolean;
  tropical: boolean;
  year: number;
  /** In your own boat. */
  own: boolean;
  /** Days at sea so far on this voyage (for scurvy). */
  coastal: boolean;
}

export function regionOf(lat: number, lon: number): Region {
  if (lat < 24 && lon < -88) return "southwest";
  if (lat < 27 && lon > -80) return "caribbean";
  if (lat < 24) return "caribbean";
  if (lat < 31 && lon >= -88) return "florida";
  if (lat < 31) return "gulf";
  if (lon < -88) return "west";
  if (lat < 36.5) return "south";
  if (lat < 39.5) return "chesapeake";
  if (lat < 41.5) return "middle";
  if (lat < 45.5 && lon > -74) return "newengland";
  return "north";
}

/** The leg ahead: where it goes, who holds it, the season. */
export function hopOf(g: ConquestGame, life: Life): Hop | null {
  const t = life.travel;
  if (!t || !t.path.length) return null;
  const s = g.s;
  const from = life.prov;
  const to = t.path[0];
  const d = g.map.provinces[to];
  const pr = s.provinces[to];
  const owner = pr.occupier >= 0 ? pr.occupier : pr.owner;
  const n = owner >= 0 ? s.nations[owner] : undefined;
  const me = meOf(s, life);
  const date = dateOf(s.day);
  const nb = g.map.provinces[from].nb.find(([q]) => q === to);
  return {
    from,
    to,
    sea: !!t.sea[0],
    terrain: d.terrain,
    lat: d.lat,
    lon: d.lon,
    region: regionOf(d.lat, d.lon),
    owner,
    ownerKey: n?.key ?? "",
    native: n?.kind === "native",
    war: !!me && owner >= 0 && atWar(s, owner, me.nation),
    month: date.month,
    winter: isWinter(d.lat, date.month),
    hurricane: isHurricaneSeason(d.lat, d.lon, date.month),
    river: !t.sea[0] && !!nb?.[2],
    tropical: g.w.tropical[to],
    year: date.year,
    own: t.boat !== undefined,
    coastal: d.coastal,
  };
}

// ---------------------------------------------------------------- small effects

function delay(g: ConquestGame, life: Life, days: number): void {
  const t = life.travel;
  if (!t) return;
  touchLife(g, life);
  t.arrive = Math.max(g.s.day + 1, t.arrive + days);
}

/** Stop at the next place instead of going on. */
function stopAhead(g: ConquestGame, life: Life): void {
  const t = life.travel;
  if (!t) return;
  touchLife(g, life);
  t.path = [t.path[0]];
  t.sea = [t.sea[0]];
  t.dest = t.path[0];
}

function loseGoods(g: ConquestGame, life: Life, share: number): number {
  let lost = 0;
  touchLife(g, life);
  for (const [k, v] of Object.entries(life.goods) as [Good, number][]) {
    const n = Math.floor(v * share);
    if (n <= 0) continue;
    life.goods[k] = v - n;
    if (!life.goods[k]) delete life.goods[k];
    lost += n;
  }
  return lost;
}

const say = (
  g: ConquestGame,
  life: Life,
  text: string,
  tone?: "good" | "bad",
) => journal(g, life, text, tone);

const purse = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

/** Damage to your own boat, if you're in her; said in a line. */
function hull(g: ConquestGame, life: Life, n: number): string {
  if (!sailingOwn(life)) return "";
  const name = batterBoat(g, life, n);
  return name ? ` The ${name} took a beating.` : "";
}

const placeName = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "the next place";
const nationName = (g: ConquestGame, h: Hop) =>
  h.owner >= 0 ? g.s.nations[h.owner].name.replace(/^the /, "the ") : "nobody";

/** A travel event's `when`: only on legs that fit. */
function on(
  pick: (h: Hop, g: ConquestGame, life: Life) => boolean,
): (g: ConquestGame, life: Life) => LCtx | null {
  return (g, life) => {
    const h = hopOf(g, life);
    if (!h || !pick(h, g, life)) return null;
    return { p: h.to, o: h.owner };
  };
}

const SOUTH: Region[] = ["south", "florida", "gulf"];
const HOT: Region[] = ["south", "florida", "gulf", "caribbean"];
const COLD: Region[] = ["newengland", "north"];
const mon = (h: Hop, a: number, b: number) => h.month >= a && h.month <= b;

function ch(
  label: string,
  tip: string,
  apply: (g: ConquestGame, life: Life, ctx: LCtx, pass: boolean) => void,
  check?: { skill: Skill; dc: number },
  blocked?: (g: ConquestGame, life: Life, ctx: LCtx) => string | null,
) {
  return {
    label,
    tip,
    apply,
    ...(check ? { check } : {}),
    ...(blocked ? { blocked } : {}),
  };
}

// ---------------------------------------------------------------- the events

export const TRAVEL_EVENTS: LifeEventDef[] = [
  // ------------------------------------------------ swamps, heat, fevers
  {
    key: "trv-swamp-fever",
    pool: "road",
    weight: 3,
    cooldown: 300,
    scene: "swamp",
    when: on(
      (h) =>
        (SOUTH.includes(h.region) || h.tropical) &&
        (h.terrain === "marsh" || h.terrain === "jungle" || h.tropical) &&
        mon(h, 4, 9),
    ),
    title: "Fever in the low country",
    body: (g, life, ctx) =>
      `The road to ${placeName(g, ctx.p)} runs through cypress swamp and rice fields, and the air hums with mosquitoes. By the second evening you're shivering in the heat: the seasoning fever that kills newcomers by the hundred.`,
    choices: [
      ch(
        "Press on and sweat it out",
        "Medicine helps. A bad bout can lay you low.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "A bad two days, then it broke. You're seasoned now, they say.",
              "good",
            );
          else {
            hurt(g, life, g.rng.int(10, 18), "the seasoning fever");
            say(
              g,
              life,
              "The fever had you for a week on the road. You'll be weak a while.",
              "bad",
            );
          }
        },
        { skill: "medicine", dc: 6 },
      ),
      ch(
        "Lie up a week at a planter's house",
        "A week lost and a few coins; a gentle recovery.",
        (g, life) => {
          delay(g, life, 7);
          spend(g, life, 2);
          hurt(g, life, 3, "the seasoning fever");
          say(
            g,
            life,
            "A week in a planter's spare room, dosed with rum and kindness.",
          );
        },
        undefined,
        (g, life) => purse(life, 2),
      ),
      ch(
        "Dose yourself with Jesuit's bark",
        "Bitter, dear, and it works.",
        (g, life) => {
          spend(g, life, 3);
          hurt(g, life, 2, "the seasoning fever");
          gainXp(g, life, "medicine", 6);
          say(
            g,
            life,
            "Bark in brandy, three times a day. The fever let go of you.",
            "good",
          );
        },
        undefined,
        (g, life) => purse(life, 3),
      ),
    ],
  },
  {
    key: "trv-gator",
    pool: "road",
    weight: 3,
    cooldown: 400,
    scene: "swamp",
    when: on(
      (h) =>
        (h.region === "florida" ||
          h.region === "gulf" ||
          h.region === "south") &&
        (h.terrain === "marsh" || h.river),
    ),
    title: "Something in the black water",
    body: () =>
      "The ford is a sheet of black water between cypress knees, and halfway across a log opens one yellow eye. An alligator, longer than a canoe, lying exactly where you meant to walk.",
    choices: [
      ch(
        "Wait for it to move",
        "A day or two lost; nobody eaten.",
        (g, life) => {
          delay(g, life, 2);
          say(
            g,
            life,
            "It moved eventually, with the air of someone doing you a favour.",
          );
        },
      ),
      ch(
        "Wade across quickly, upstream of it",
        "Woodcraft. Miss your footing and it notices.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Across, wet to the waist, all limbs present.",
              "good",
            );
          else {
            hurt(g, life, 14, "an alligator");
            say(
              g,
              life,
              "It noticed. You got away with your leg and a story.",
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 6 },
      ),
      ch(
        "Shoot it",
        "Fighting. The hide fetches a coin or two.",
        (g, life, c, pass) => {
          if (pass) {
            earn(g, life, 2);
            addRenown(g, life, 0.5);
            say(
              g,
              life,
              "One shot behind the eye. The hide sold at the next trading house.",
              "good",
            );
          } else {
            delay(g, life, 1);
            say(g, life, "You missed. It sank, which was almost worse.", "bad");
          }
        },
        { skill: "fighting", dc: 5 },
      ),
    ],
  },
  {
    key: "trv-rattlesnake",
    pool: "road",
    weight: 2,
    cooldown: 400,
    scene: "road",
    when: on(
      (h) =>
        !h.sea &&
        [
          "south",
          "chesapeake",
          "middle",
          "west",
          "southwest",
          "florida",
        ].includes(h.region) &&
        mon(h, 4, 8),
    ),
    title: "Rattlesnake",
    body: () =>
      "A dry buzz from the grass beside the path, very close to your ankle.",
    choices: [
      ch(
        "Freeze, then step back slowly",
        "Woodcraft: the snake gets bored first, or doesn't.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "It slid away under a log. You started breathing again some time later.",
              "good",
            );
          else {
            hurt(g, life, 16, "a rattlesnake bite");
            say(
              g,
              life,
              "It struck. You cut, sucked and prayed; the leg swelled like a bladder but you lived.",
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 5 },
      ),
      ch(
        "Kill it with your stick",
        "Fighting. Rattles make a fine keepsake.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Six rattles on your hat now. People will ask.",
              "good",
            );
          else {
            hurt(g, life, 12, "a rattlesnake bite");
            say(g, life, "You were slower than it was.", "bad");
          }
        },
        { skill: "fighting", dc: 6 },
      ),
    ],
  },
  {
    key: "trv-tropic-rains",
    pool: "road",
    weight: 2,
    cooldown: 300,
    scene: "swamp",
    when: on(
      (h) =>
        !h.sea &&
        (h.tropical || h.region === "caribbean" || h.region === "southwest") &&
        mon(h, 5, 10),
    ),
    title: "The rains",
    body: () =>
      "The sky opens every afternoon. The road is a river of red mud, the streams are torrents, and everything you own is wet.",
    choices: [
      ch(
        "Wait out the worst of it",
        "Five days at a roadside shelter.",
        (g, life) => {
          delay(g, life, 5);
          addStress(g, life, 2);
        },
      ),
      ch("Slog on", "Faster, wetter, and hard on you.", (g, life) => {
        hurt(g, life, 5, "the rains");
        addStress(g, life, 3);
        say(
          g,
          life,
          "Mud to the knee for a week. You arrived looking like a pudding.",
        );
      }),
    ],
  },
  // ------------------------------------------------ mountains and snow
  {
    key: "trv-snow-pass",
    pool: "road",
    weight: 4,
    cooldown: 300,
    scene: "snow",
    when: on(
      (h) =>
        !h.sea &&
        (h.terrain === "mountains" || h.terrain === "hills") &&
        h.winter,
    ),
    title: "Snow on the pass",
    body: (g, life, ctx) =>
      `The way over the mountains to ${placeName(g, ctx.p)} is deep in fresh snow, and more is coming: the sky to the west is the colour of slate.`,
    choices: [
      ch(
        "Push over before it closes",
        "Woodcraft. Caught on top, and the cold may finish you.",
        (g, life, c, pass) => {
          if (pass) {
            gainXp(g, life, "woodcraft", 10);
            say(
              g,
              life,
              "Over the top by dark, on snowshoes cut from saplings. The valley beyond was a mercy.",
              "good",
            );
          } else {
            hurt(g, life, 15, "cold on the mountain pass");
            delay(g, life, 3);
            say(
              g,
              life,
              "The storm caught you on the ridge. Two nights in a snow hole, and frostbitten toes.",
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 8 },
      ),
      ch(
        "Wait in the valley for a thaw",
        "A week or more, and the cold settles into your mood.",
        (g, life) => {
          delay(g, life, 8);
          addStress(g, life, 3);
        },
      ),
      ch(
        "Go the long way round",
        "Five more days by the river valleys.",
        (g, life) => {
          delay(g, life, 5);
          spend(g, life, 1);
        },
      ),
    ],
  },
  {
    key: "trv-blizzard",
    pool: "road",
    weight: 3,
    cooldown: 300,
    scene: "snow",
    when: on(
      (h) =>
        !h.sea &&
        COLD.includes(h.region) &&
        h.winter &&
        h.terrain !== "mountains",
    ),
    title: "A northern blizzard",
    body: () =>
      "Snow sideways out of the north-east, so thick you can't see your own hand, and the cold of it like knives.",
    choices: [
      ch(
        "Dig in and build a shelter",
        "Woodcraft: spruce boughs, a fire, and patience.",
        (g, life, c, pass) => {
          delay(g, life, 2);
          if (pass)
            say(
              g,
              life,
              "A snug lean-to and a fire that never went out. You slept like a bear.",
              "good",
            );
          else hurt(g, life, 10, "the cold");
        },
        { skill: "woodcraft", dc: 6 },
      ),
      ch(
        "Look for a farmhouse",
        "Persuasion: a stranger at the door in a storm.",
        (g, life, c, pass) => {
          delay(g, life, 2);
          if (pass) {
            addStress(g, life, -3);
            say(
              g,
              life,
              "A farmer's family took you in for two nights of hasty pudding and psalms.",
              "good",
            );
          } else {
            hurt(g, life, 6, "the cold");
            say(
              g,
              life,
              "They let you sleep in the barn, with the cow, who was warmer company.",
              "bad",
            );
          }
        },
        { skill: "persuasion", dc: 5 },
      ),
      ch("Keep walking", "No time lost, if you live.", (g, life) => {
        hurt(g, life, 14, "a blizzard");
        say(
          g,
          life,
          "You walked through it. You don't remember the last day of it.",
          "bad",
        );
      }),
    ],
  },
  {
    key: "trv-rockslide",
    pool: "road",
    weight: 3,
    cooldown: 400,
    scene: "road",
    when: on((h) => !h.sea && h.terrain === "mountains" && !h.winter),
    title: "Rockfall",
    body: () =>
      "A roar above you, and half the mountainside comes down across the trail ahead in a cloud of dust.",
    choices: [
      ch(
        "Climb over the rubble",
        "Woodcraft: loose stones and a long drop.",
        (g, life, c, pass) => {
          if (pass) say(g, life, "Over it like a goat, more or less.", "good");
          else {
            hurt(g, life, 10, "a fall among the rocks");
            delay(g, life, 1);
          }
        },
        { skill: "woodcraft", dc: 6 },
      ),
      ch(
        "Go round by the lower valley",
        "Four days lost; your neck kept.",
        (g, life) => delay(g, life, 4),
      ),
    ],
  },
  {
    key: "trv-mountain-fog",
    pool: "road",
    weight: 2,
    cooldown: 300,
    scene: "road",
    when: on(
      (h) => !h.sea && (h.terrain === "mountains" || h.terrain === "hills"),
    ),
    title: "Cloud on the ridge",
    body: () =>
      "The cloud has come down on the ridge and the trail forks three ways into white nothing.",
    choices: [
      ch(
        "Feel your way on",
        "Woodcraft: the right fork, or a long way down the wrong one.",
        (g, life, c, pass) => {
          if (pass) gainXp(g, life, "woodcraft", 8);
          else {
            delay(g, life, 3);
            hurt(g, life, 5, "a fall in the fog");
            say(
              g,
              life,
              "The wrong fork. Three days to find the right one.",
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 7 },
      ),
      ch("Wait for it to lift", "Two days sitting on a rock.", (g, life) =>
        delay(g, life, 2),
      ),
    ],
  },
  // ------------------------------------------------ rivers and fords
  {
    key: "trv-ford-spate",
    pool: "road",
    weight: 4,
    cooldown: 250,
    scene: "river",
    when: on((h) => h.river && (mon(h, 2, 5) || h.region === "north")),
    title: "The ford is up",
    body: (g, life, ctx) =>
      `The river before ${placeName(g, ctx.p)} is in spate with snowmelt: brown, fast and carrying whole trees. The ford is somewhere under it.`,
    choices: [
      ch(
        "Wade it",
        "Woodcraft. Lose your footing and you lose what you carry.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Up to the chest, and out the other side. Your boots will never be the same.",
              "good",
            );
          else {
            const lost = loseGoods(g, life, 0.4);
            hurt(g, life, 8, "a river in spate");
            say(
              g,
              life,
              `Swept off your feet. You dragged yourself out a quarter mile down${lost ? `, ${lost} loads lighter` : ""}.`,
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 6 },
      ),
      ch("Wait for it to fall", "Three days on the bank.", (g, life) =>
        delay(g, life, 3),
      ),
      ch(
        "Find the ferry upstream",
        "A coin or two and a day's walk.",
        (g, life) => {
          spend(g, life, 2);
          delay(g, life, 1);
        },
        undefined,
        (g, life) => purse(life, 2),
      ),
    ],
  },
  {
    key: "trv-ferryman",
    pool: "road",
    weight: 3,
    cooldown: 250,
    scene: "river",
    when: on((h) => h.river && !h.native && h.owner >= 0),
    title: "The ferryman's price",
    body: () =>
      "The ferry is a flat scow on a rope, and the ferryman is a man who knows there's no other way across. He names a price that would shame a highwayman.",
    choices: [
      ch(
        "Pay it",
        "Three coins and no argument.",
        (g, life) => spend(g, life, 3),
        undefined,
        (g, life) => purse(life, 3),
      ),
      ch(
        "Haggle",
        "Persuasion: the colony sets ferry rates, you remind him.",
        (g, life, c, pass) => {
          spend(g, life, pass ? 1 : 3);
          if (pass)
            say(g, life, "He remembered the posted rates, eventually.", "good");
          else
            say(
              g,
              life,
              "He remembered nothing, and added a penny for your trouble.",
              "bad",
            );
        },
        { skill: "persuasion", dc: 5 },
        (g, life) => purse(life, 3),
      ),
      ch("Swim it", "Free. Cold, and a long swim.", (g, life) => {
        hurt(g, life, 5, "a cold swim");
        loseGoods(g, life, 0.2);
        say(g, life, "Across on a log, holding your purse in your teeth.");
      }),
    ],
  },
  // ------------------------------------------------ the native peoples' country
  {
    key: "trv-native-welcome",
    pool: "road",
    weight: 3,
    cooldown: 250,
    scene: "village",
    when: on((h) => !h.sea && h.native && !h.war),
    title: "Strangers on the trail",
    body: (g, life) =>
      `On the trail through the country of ${nationName(g, hopOf(g, life)!)} you meet a hunting party coming home. They stop, look you over, and the eldest raises a hand in greeting. It would be rude to walk past.`,
    choices: [
      ch(
        "Share food and tobacco at their fire",
        "A gift (a coin's worth) and an evening: friendship, and what they know of the way ahead.",
        (g, life) => {
          spend(g, life, 1);
          addRenown(g, life, 1);
          addStress(g, life, -3);
          gainXp(g, life, "woodcraft", 8);
          delay(g, life, -1);
          say(
            g,
            life,
            "An evening of venison, careful talk and a pipe passed around. They showed you a shorter trail.",
            "good",
          );
        },
        undefined,
        (g, life) => purse(life, 1),
      ),
      ch(
        "Trade with them",
        "Trade: kettles and knives for furs and corn.",
        (g, life, c, pass) => {
          gainXp(g, life, "trade", 6);
          if (pass) {
            earn(g, life, 3);
            say(
              g,
              life,
              "A fair trade, and both sides thought they'd done well.",
              "good",
            );
          } else
            say(
              g,
              life,
              "Polite, but they had nothing they wanted to part with.",
            );
        },
        { skill: "trade", dc: 6 },
      ),
      ch("Greet them and walk on", "No harm done.", () => undefined),
    ],
  },
  {
    key: "trv-native-toll",
    pool: "road",
    weight: 4,
    cooldown: 300,
    scene: "village",
    when: on((h, g, life) => !h.sea && h.native && !lifeIsNative(g.s, life)),
    title: "A party bars the path",
    body: (g, life) => {
      const h = hopOf(g, life)!;
      return h.war
        ? `Warriors of ${nationName(g, h)} step out of the trees, their faces painted for war. Your people and theirs are fighting, and you're in their country.`
        : `Men of ${nationName(g, h)} are waiting on the trail. This is their land, they say through a boy who has some English, and those who pass through it should ask, and give something for the asking.`;
    },
    choices: [
      ch(
        "Offer gifts and ask leave to pass",
        "Three coins' worth of cloth and powder: the custom of the country.",
        (g, life) => {
          spend(g, life, 3);
          addRenown(g, life, 0.5);
          say(
            g,
            life,
            "Gifts given, leave granted, and a warning about the river ahead.",
            "good",
          );
        },
        undefined,
        (g, life) => purse(life, 3),
      ),
      ch(
        "Speak with them",
        "Persuasion. Respect is the price, if words will do.",
        (g, life, c, pass) => {
          gainXp(g, life, "persuasion", 8);
          if (pass) {
            addRenown(g, life, 1);
            say(
              g,
              life,
              "You spoke well, and listened better. They let you pass and walked a way with you.",
              "good",
            );
          } else {
            stopAhead(g, life);
            say(
              g,
              life,
              "They heard you out and pointed back the way you came. You'll go no further on this road.",
              "bad",
            );
          }
        },
        { skill: "persuasion", dc: 7 },
      ),
      ch("Turn back", "Their land, their say.", (g, life) =>
        stopAhead(g, life),
      ),
      ch(
        "Fight your way through",
        "Only in war. Fighting: the odds are with them.",
        (g, life, c, pass) => {
          if (pass) {
            addRenown(g, life, 2);
            say(g, life, "You broke through and ran for it.", "good");
          } else {
            hurt(g, life, g.rng.int(15, 30), "a fight on the trail");
            loseGoods(g, life, 0.6);
            stopAhead(g, life);
            say(
              g,
              life,
              "Beaten and stripped of what you carried; lucky to be let go.",
              "bad",
            );
          }
        },
        { skill: "fighting", dc: 9 },
        (g, life) =>
          hopOf(g, life)?.war ? null : "Only if your peoples are at war",
      ),
    ],
  },
  {
    key: "trv-condolence",
    pool: "road",
    weight: 2,
    cooldown: 500,
    scene: "village",
    when: on((h) => !h.sea && h.native),
    title: "A village in mourning",
    body: () =>
      "The village by the trail is quiet, and the women have cut their hair: a great man has died. Travellers who stop are expected to offer words of condolence and a gift to wipe away the tears.",
    choices: [
      ch(
        "Join the condolence",
        "A small gift and words of comfort: remembered for a long time.",
        (g, life) => {
          spend(g, life, 1);
          addRenown(g, life, 1.5);
          addStress(g, life, -2);
          gainXp(g, life, "faith", 6);
          say(
            g,
            life,
            "You gave a string of white wampum and words for the dead. An old woman thanked you by name.",
            "good",
          );
        },
        undefined,
        (g, life) => purse(life, 1),
      ),
      ch(
        "Keep a respectful distance",
        "Pass quietly; no offence given.",
        () => undefined,
      ),
    ],
  },
  {
    key: "trv-native-shortcut",
    pool: "road",
    weight: 2,
    cooldown: 300,
    scene: "woods",
    when: on(
      (h, g, life) =>
        !h.sea && (h.native || h.owner < 0) && !guideWithYou(g.s, life),
    ),
    title: "The short way",
    body: () =>
      "A young man of the country, going the same way, offers to show you a trail that cuts off three days of the road, for a knife or two.",
    choices: [
      ch(
        "Pay him and follow",
        "Two coins: three days saved.",
        (g, life) => {
          spend(g, life, 2);
          delay(g, life, -3);
          gainXp(g, life, "woodcraft", 6);
          say(
            g,
            life,
            "Up a creek bed, over a ridge, along a beaver meadow: three days saved and a lesson in looking.",
            "good",
          );
        },
        undefined,
        (g, life) => purse(life, 2),
      ),
      ch(
        "Thank him and keep to the road",
        "The long way you know.",
        () => undefined,
      ),
    ],
  },
  // ------------------------------------------------ the Spanish south
  {
    key: "trv-spanish-patrol",
    pool: "road",
    weight: 4,
    cooldown: 250,
    scene: "fort",
    when: on(
      (h, g, life) =>
        !h.sea &&
        h.ownerKey === "spain" &&
        meOf(g.s, life)?.nation !== h.owner &&
        ["florida", "gulf", "southwest", "caribbean"].includes(h.region),
    ),
    title: "A Spanish patrol",
    body: (g, life) =>
      `Dragoons in yellow coats ride out of the pines: a patrol from the presidio. Foreigners aren't welcome in the king's Florida${hopOf(g, life)?.war ? ", least of all in wartime" : ""}, and the sergeant wants to know your business.`,
    choices: [
      ch(
        "Show your papers and explain",
        "Letters: a passport, a merchant's letter, a good story.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "The sergeant read your papers upside down, nodded gravely, and waved you on.",
              "good",
            );
          else {
            delay(g, life, 7);
            spend(g, life, Math.min(life.purse, 3));
            say(
              g,
              life,
              "A week in the guardhouse of the presidio until someone could read English. They kept your tobacco.",
              "bad",
            );
          }
        },
        { skill: "letters", dc: 6 },
      ),
      ch(
        "Bribe the sergeant",
        "Four pieces of eight.",
        (g, life) => {
          spend(g, life, 4);
          say(
            g,
            life,
            "The sergeant found you had excellent papers after all.",
          );
        },
        undefined,
        (g, life) => purse(life, 4),
      ),
      ch(
        "Slip past at night",
        "Stealth. Caught sneaking, it goes worse.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Through the palmettos in the dark, with the patrol's fire on your left.",
              "good",
            );
          else {
            addHeat(g, life, hopOf(g, life)?.owner ?? -1, 10);
            spend(g, life, Math.min(life.purse, 5));
            delay(g, life, 5);
            say(
              g,
              life,
              "Caught in the palmettos. Fined, and marked down as a spy.",
              "bad",
            );
          }
        },
        { skill: "stealth", dc: 7 },
      ),
    ],
  },
  {
    key: "trv-mission",
    pool: "road",
    weight: 2,
    cooldown: 400,
    scene: "church",
    when: on(
      (h) =>
        !h.sea &&
        h.ownerKey === "spain" &&
        (h.region === "florida" || h.region === "southwest"),
    ),
    title: "A mission on the road",
    body: () =>
      "A Franciscan mission: a whitewashed chapel, a bell, a garden of oranges and figs, and the Christian Apalachee or Timucua families who live around it. The friar offers you water and shade.",
    choices: [
      ch(
        "Rest and hear Mass",
        "Peace, and the friar's blessing.",
        (g, life) => {
          addStress(g, life, -4);
          gainXp(g, life, "faith", 6);
        },
      ),
      ch(
        "Trade at the mission",
        "Trade: oranges, hides and corn.",
        (g, life, c, pass) => {
          if (pass) earn(g, life, 2);
          gainXp(g, life, "trade", 4);
        },
        { skill: "trade", dc: 5 },
      ),
      ch("Thank them and ride on", "", () => undefined),
    ],
  },
  {
    key: "trv-maroons",
    pool: "road",
    weight: 3,
    cooldown: 500,
    scene: "woods",
    when: on(
      (h) =>
        !h.sea &&
        (h.region === "caribbean" || h.region === "florida") &&
        (h.terrain === "hills" ||
          h.terrain === "mountains" ||
          h.terrain === "jungle" ||
          h.terrain === "marsh"),
    ),
    title: "Maroons in the hills",
    body: () =>
      "Armed men and women step onto the path ahead: maroons, people who escaped slavery and built free towns in the hills where no planter's militia dares follow. They want to know whether you're a slave-catcher.",
    choices: [
      ch(
        "Speak plainly and trade",
        "Persuasion: news, salt and powder for safe passage and good will.",
        (g, life, c, pass) => {
          gainXp(g, life, "persuasion", 8);
          if (pass) {
            spend(g, life, Math.min(life.purse, 2));
            addRenown(g, life, 1);
            say(
              g,
              life,
              "Salt and news for safe passage. Their captain walked you to the edge of their country himself.",
              "good",
            );
          } else {
            delay(g, life, 3);
            say(
              g,
              life,
              "They didn't believe you, and sent you the long way round, with a guide to make sure.",
              "bad",
            );
          }
        },
        { skill: "persuasion", dc: 6 },
      ),
      ch(
        "Go back and take the coast road",
        "Three days lost; nobody troubled.",
        (g, life) => delay(g, life, 3),
      ),
    ],
  },
  // ------------------------------------------------ the French north and the west
  {
    key: "trv-coureurs",
    pool: "road",
    weight: 3,
    cooldown: 300,
    scene: "woods",
    when: on(
      (h) =>
        (h.region === "north" ||
          h.region === "west" ||
          h.ownerKey === "france") &&
        !h.war,
    ),
    title: "Coureurs des bois",
    body: () =>
      "Three canoes come round the point, heavy with furs, paddled by bearded Frenchmen in sashes and moccasins singing about a girl from Rouen. They put in beside your fire.",
    choices: [
      ch(
        "Trade with them",
        "Trade: brandy and kettles for prime beaver.",
        (g, life, c, pass) => {
          gainXp(g, life, "trade", 6);
          if (pass) {
            earn(g, life, 4);
            say(
              g,
              life,
              "A bale of prime beaver for less than it'll fetch on the coast.",
              "good",
            );
          } else
            say(
              g,
              life,
              "They know furs better than you. You came away with a song and nothing else.",
            );
        },
        { skill: "trade", dc: 6 },
      ),
      ch(
        "Share their fire and learn the portages",
        "A night of songs and lies; the rivers ahead made plain.",
        (g, life) => {
          addStress(g, life, -3);
          gainXp(g, life, "woodcraft", 10);
          delay(g, life, -2);
        },
      ),
      ch("Keep your distance", "", () => undefined),
    ],
  },
  {
    key: "trv-bison",
    pool: "road",
    weight: 3,
    cooldown: 300,
    scene: "fields",
    when: on(
      (h) =>
        !h.sea &&
        h.terrain === "plains" &&
        (h.region === "west" || h.region === "southwest" || h.lon < -84),
    ),
    title: "Buffalo",
    body: () =>
      "The plain ahead is dark with bison from one horizon to the other, grazing, rumbling, moving slowly across your way.",
    choices: [
      ch(
        "Hunt",
        "Fighting: a robe and meat for the road.",
        (g, life, c, pass) => {
          if (pass) {
            earn(g, life, 3);
            addRenown(g, life, 0.5);
            gainXp(g, life, "fighting", 6);
            say(
              g,
              life,
              "One cow, cleanly taken. Robes and tongues for trade, and meat for a week.",
              "good",
            );
          } else {
            hurt(g, life, 8, "a bison hunt");
            say(
              g,
              life,
              "The herd turned. You ran; the herd was faster, but not very interested.",
              "bad",
            );
          }
        },
        { skill: "fighting", dc: 6 },
      ),
      ch(
        "Wait for the herd to pass",
        "Two days of watching the greatest sight in the world.",
        (g, life) => {
          delay(g, life, 2);
          addStress(g, life, -2);
        },
      ),
    ],
  },
  {
    key: "trv-prairie-fire",
    pool: "road",
    weight: 3,
    cooldown: 400,
    scene: "fields",
    when: on((h) => !h.sea && h.terrain === "plains" && mon(h, 8, 10)),
    title: "Prairie fire",
    body: () =>
      "A line of smoke on the western sky, and then the smell, and then the glow: the grass is burning, and the wind is behind it.",
    choices: [
      ch(
        "Set a backfire and shelter in the black",
        "Woodcraft: the old way, if you know it.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "You burned a patch and lay in the ash while the fire went round you. Singed, alive.",
              "good",
            );
          else hurt(g, life, 15, "a prairie fire");
        },
        { skill: "woodcraft", dc: 7 },
      ),
      ch(
        "Run for the river",
        "Fast, if the river's near enough.",
        (g, life) => {
          if (g.rng.chance(0.6))
            say(
              g,
              life,
              "You reached the river with the fire at your heels and waded in up to your neck.",
            );
          else {
            hurt(g, life, 10, "a prairie fire");
            loseGoods(g, life, 0.3);
          }
        },
      ),
    ],
  },
  {
    key: "trv-bear",
    pool: "road",
    weight: 2,
    cooldown: 400,
    scene: "woods",
    when: on(
      (h) =>
        !h.sea &&
        (h.terrain === "forest" ||
          h.terrain === "hills" ||
          h.terrain === "mountains") &&
        !h.winter,
    ),
    title: "A bear on the trail",
    body: () =>
      "A black bear and two cubs in the blueberries, between you and the rest of the path. The mother stands up to look at you.",
    choices: [
      ch(
        "Back away slowly, talking softly",
        "Woodcraft: don't run, don't look her in the eye.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "You backed off and went round through the swamp. She went back to her berries.",
              "good",
            );
          else {
            hurt(g, life, 15, "a bear");
            say(
              g,
              life,
              "She charged, swatted you once into a thicket, and went back to her cubs.",
              "bad",
            );
          }
        },
        { skill: "woodcraft", dc: 5 },
      ),
      ch(
        "Stand your ground and shout",
        "Fighting: bluff her off. Bears call bluffs.",
        (g, life, c, pass) => {
          if (pass) {
            addRenown(g, life, 0.5);
            say(
              g,
              life,
              "She blew, stamped, and took the cubs away. You'll tell this one for years.",
              "good",
            );
          } else hurt(g, life, 20, "a bear");
        },
        { skill: "fighting", dc: 7 },
      ),
      ch("Wait it out up a tree", "A day lost and a stiff back.", (g, life) =>
        delay(g, life, 1),
      ),
    ],
  },
  {
    key: "trv-thirst",
    pool: "road",
    weight: 4,
    cooldown: 300,
    scene: "road",
    when: on((h) => !h.sea && h.terrain === "desert"),
    title: "No water",
    body: () =>
      "The spring the traders told you about is a crust of dry mud and a dead coyote. The next water is two days on, if it's there.",
    choices: [
      ch(
        "Look for water",
        "Woodcraft: cottonwoods, birds at dusk, damp sand in a wash.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Damp sand under a cutbank; you dug and it filled. Never has water tasted so good.",
              "good",
            );
          else hurt(g, life, 12, "thirst");
        },
        { skill: "woodcraft", dc: 7 },
      ),
      ch("Push on to the next well", "Two hard days.", (g, life) =>
        hurt(g, life, 8, "thirst"),
      ),
      ch("Turn back", "Stop at the next place and think again.", (g, life) =>
        stopAhead(g, life),
      ),
    ],
  },
  // ------------------------------------------------ war, settlers, roads
  {
    key: "trv-enemy-patrol",
    pool: "road",
    weight: 4,
    cooldown: 200,
    scene: "fort",
    when: on((h) => !h.sea && h.war && !h.native),
    title: "Enemy horsemen",
    body: (g, life) =>
      `Horsemen in the coats of ${nationName(g, hopOf(g, life)!)} on the road ahead. Your peoples are at war, and you're in their country.`,
    choices: [
      ch(
        "Hide in the woods until they pass",
        "Stealth.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Flat in the bracken while they rode by close enough to touch.",
              "good",
            );
          else {
            delay(g, life, 15);
            spend(g, life, Math.min(life.purse, Math.round(life.purse * 0.3)));
            say(
              g,
              life,
              "Taken, searched, robbed by the book, and held a fortnight before they let you go.",
              "bad",
            );
          }
        },
        { skill: "stealth", dc: 7 },
      ),
      ch(
        "Bluff: you're a neutral merchant",
        "Persuasion, and an accent you'll have to fake.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "They believed you, or were too bored not to.",
              "good",
            );
          else {
            delay(g, life, 15);
            say(
              g,
              life,
              "They didn't believe you. A fortnight in a barn under guard.",
              "bad",
            );
          }
        },
        { skill: "persuasion", dc: 8 },
      ),
      ch("Turn back", "Stop at the next friendly place.", (g, life) =>
        stopAhead(g, life),
      ),
    ],
  },
  {
    key: "trv-refugees",
    pool: "road",
    weight: 3,
    cooldown: 400,
    scene: "road",
    when: on((h, g, life) => {
      const me = meOf(g.s, life);
      return (
        !h.sea &&
        !!me &&
        g.s.wars.some((w) => w.a === me.nation || w.b === me.nation) &&
        !h.native
      );
    }),
    title: "Refugees on the road",
    body: () =>
      "Burned-out farms along the road, and families walking the other way with what they could carry: the war has come through here.",
    choices: [
      ch(
        "Share what food and money you have",
        "Two coins and a lighter conscience.",
        (g, life) => {
          spend(g, life, 2);
          addRenown(g, life, 1);
          addStress(g, life, -1);
        },
        undefined,
        (g, life) => purse(life, 2),
      ),
      ch("Walk on", "You can't help everyone.", (g, life) =>
        addStress(g, life, 3),
      ),
    ],
  },
  {
    key: "trv-coach-wreck",
    pool: "road",
    weight: 2,
    cooldown: 400,
    scene: "road",
    when: on((h) => !h.sea && !h.native && h.owner >= 0 && h.year >= 1690),
    title: "An overturned coach",
    body: () =>
      "A coach on its side in the ditch, a wheel spinning, a coachman swearing, and a lady in silk sitting on her trunk with great dignity.",
    choices: [
      ch("Help right it", "A good deed, and a lady's gratitude.", (g, life) => {
        addRenown(g, life, 1);
        earn(g, life, 1);
        say(
          g,
          life,
          "Coach righted, horses calmed, and a coin from the lady with a look that said she'd remember your face.",
          "good",
        );
      }),
      ch(
        "Help yourself to a trunk",
        "Quick money and the law's interest.",
        (g, life) => {
          earn(g, life, 4);
          addNotoriety(g, life, 1);
          addHeat(g, life, hopOf(g, life)?.owner ?? -1, 10);
          say(
            g,
            life,
            "A trunk of good linen sold at the next town, no questions asked. Someone may remember you.",
            "bad",
          );
        },
      ),
      ch("Ride on", "", () => undefined),
    ],
  },
  {
    key: "trv-ordinary",
    pool: "road",
    weight: 2,
    cooldown: 300,
    scene: "tavern",
    when: on((h) => !h.sea && !h.native && h.owner >= 0),
    title: "A roadside ordinary",
    body: () =>
      "A log tavern by the road at dusk, a sign with a picture of something that was once a lion, and a landlord with very small eyes.",
    choices: [
      ch(
        "Take a bed for the night",
        "A coin; a rest; keep a hand on your purse.",
        (g, life) => {
          spend(g, life, 1);
          heal(g, life, 2);
          addStress(g, life, -2);
          if (g.rng.chance(0.2)) {
            const n = Math.round(life.purse * 0.15);
            spend(g, life, n);
            say(
              g,
              life,
              `A fine supper, a lumpy bed, and ${n} coins lighter in the morning. The landlord had never seen a thief in his life.`,
              "bad",
            );
          }
        },
        undefined,
        (g, life) => purse(life, 1),
      ),
      ch("Sleep in the barn", "Free, and the horses snore.", (g, life) =>
        hurt(g, life, 1, "a cold barn"),
      ),
    ],
  },
  {
    key: "trv-tollgate",
    pool: "road",
    weight: 2,
    cooldown: 300,
    scene: "road",
    when: on(
      (h) =>
        !h.sea &&
        ["chesapeake", "middle", "newengland"].includes(h.region) &&
        h.year >= 1700 &&
        !h.native,
    ),
    title: "A toll bridge",
    body: () =>
      "A new bridge with a toll-keeper's hut, and a board of charges: so much a horse, so much a cart, so much a person on foot, so much a hog.",
    choices: [
      ch("Pay the toll", "Half a coin.", (g, life) => spend(g, life, 0.5)),
      ch(
        "Argue",
        "Persuasion: you're on the colony's business, surely.",
        (g, life, c, pass) => {
          if (!pass) spend(g, life, 1);
        },
        { skill: "persuasion", dc: 6 },
      ),
      ch("Wade the creek below", "Free, wet, a day lost.", (g, life) =>
        delay(g, life, 1),
      ),
    ],
  },
  {
    key: "trv-post-rider",
    pool: "road",
    weight: 2,
    cooldown: 250,
    scene: "road",
    when: on((h) => !h.sea && !h.native && h.year >= 1692 && h.owner >= 0),
    title: "The post rider",
    body: () =>
      "The post rider comes up behind you at a gallop with his horn and his saddlebags, and slows to pass the time of day.",
    choices: [
      ch(
        "Buy the latest news from him",
        "Half a coin for a week-old gazette.",
        (g, life) => {
          spend(g, life, 0.5);
          gainXp(g, life, "letters", 4);
          say(
            g,
            life,
            "A gazette only a week old: ships in, prices, a hanging, and a quarrel in the assembly.",
          );
        },
      ),
      ch(
        "Give him a letter for home",
        "A third of a coin; your family will be glad.",
        (g, life) => {
          spend(g, life, 0.3);
          addStress(g, life, -2);
        },
      ),
      ch("Wave him on", "", () => undefined),
    ],
  },
  {
    key: "trv-smallpox-town",
    pool: "road",
    weight: 2,
    cooldown: 600,
    scene: "road",
    when: on((h) => !h.sea && h.owner >= 0),
    title: "Smallpox ahead",
    body: (g, life, ctx) =>
      `A rider coming the other way warns you: smallpox in ${placeName(g, ctx.p)}, and the houses marked.`,
    choices: [
      ch("Go round", "Three days lost, nothing caught.", (g, life) =>
        delay(g, life, 3),
      ),
      ch(
        "Go through quickly, breathing shallowly",
        "Medicine helps. Smallpox kills one in four it takes.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "Through and out, a scarf over your face, touching nothing.",
              "good",
            );
          else hurt(g, life, g.rng.int(15, 35), "smallpox");
        },
        { skill: "medicine", dc: 6 },
      ),
      ch(
        "Be inoculated by a physician there",
        "From 1721: a mild dose on purpose, three coins, a week in bed, and never again.",
        (g, life) => {
          spend(g, life, 3);
          delay(g, life, 7);
          hurt(g, life, 5, "an inoculation");
          touchLife(g, life).cooldowns["ev:smallpox"] = g.s.day + 365 * 60;
          say(
            g,
            life,
            "A scratch, a week of fever, and you'll never take the smallpox now.",
            "good",
          );
        },
        undefined,
        (g, life) =>
          g.s.day < 0 || dateOf(g.s.day).year < 1721
            ? "Not until 1721"
            : purse(life, 3),
      ),
    ],
  },
  {
    key: "trv-lost-child",
    pool: "road",
    weight: 2,
    cooldown: 600,
    scene: "woods",
    when: on((h) => !h.sea),
    title: "A lost child",
    body: () =>
      "A small child sitting on a stump beside the road, crying, a long way from any house you can see.",
    choices: [
      ch(
        "Take them home",
        "Two days out of your way; a family's gratitude.",
        (g, life) => {
          delay(g, life, 2);
          addRenown(g, life, 2);
          addStress(g, life, -3);
          say(
            g,
            life,
            "Home by dark to a mother who wept and a father who shook your hand for a full minute.",
            "good",
          );
        },
      ),
      ch(
        "Leave them at the next farm",
        "Someone will know whose they are.",
        (g, life) => addRenown(g, life, 0.5),
      ),
      ch("Walk on", "Not your business. It'll sit with you.", (g, life) =>
        addStress(g, life, 5),
      ),
    ],
  },
  {
    key: "trv-field-preacher",
    pool: "road",
    weight: 3,
    cooldown: 500,
    scene: "church",
    when: on(
      (h) =>
        !h.sea &&
        ["newengland", "middle", "chesapeake", "south"].includes(h.region) &&
        h.year >= 1735 &&
        h.year <= 1765 &&
        !h.native,
    ),
    title: "The Great Awakening",
    body: () =>
      "Thousands in a field, weeping, fainting, singing: a field preacher thundering about sinners in the hands of an angry God.",
    choices: [
      ch("Listen", "Faith; a lighter heart, or a heavier one.", (g, life) => {
        gainXp(g, life, "faith", 10);
        addStress(g, life, -4);
        say(g, life, "Something moved in you. You're not sure what.", "good");
      }),
      ch(
        "Argue with him",
        "Persuasion: reason against fire.",
        (g, life, c, pass) => {
          gainXp(g, life, "persuasion", 8);
          if (pass) addRenown(g, life, 1);
          else addRenown(g, life, -1);
        },
        { skill: "persuasion", dc: 8 },
      ),
      ch(
        "Sell them pies",
        "Trade: a hungry crowd.",
        (g, life, c, pass) => {
          if (pass) earn(g, life, 3);
        },
        { skill: "trade", dc: 5 },
      ),
    ],
  },
  {
    key: "trv-surveyors",
    pool: "road",
    weight: 2,
    cooldown: 500,
    scene: "woods",
    when: on((h) => !h.sea && h.year >= 1700 && (h.owner < 0 || h.native)),
    title: "Surveyors in the woods",
    body: () =>
      "A surveyor's party (a gentleman with a compass, two chain-bearers and a pack horse) running a line through the woods for some speculator's patent.",
    choices: [
      ch(
        "Help them for a day",
        "Letters and woodcraft; a coin or two.",
        (g, life) => {
          earn(g, life, 2);
          gainXp(g, life, "letters", 5);
          gainXp(g, life, "woodcraft", 5);
          delay(g, life, 1);
        },
      ),
      ch(
        "Ask whose land it's meant to be",
        "Persuasion: the people who live here have a view.",
        (g, life, c, pass) => {
          gainXp(g, life, "persuasion", 6);
          if (pass)
            say(
              g,
              life,
              "The surveyor admitted, quietly, that nobody had asked the people of the country. He wrote that down, too.",
            );
        },
        { skill: "persuasion", dc: 5 },
      ),
      ch("Leave them to it", "", () => undefined),
    ],
  },
  // ------------------------------------------------ at sea
  {
    key: "trv-hurricane",
    pool: "sea",
    weight: 6,
    cooldown: 250,
    scene: "storm",
    when: on((h) => h.sea && h.hurricane && HOT.includes(h.region)),
    title: "Hurricane",
    body: () =>
      "The swell has been rising all day from the south-east though the wind is light; the sky goes a sick green-yellow, the glass falls and falls, and the birds have gone. A hurricane is coming.",
    choices: [
      ch(
        "Run before it",
        "Seamanship: fast and wild. Broach, and the sea has you.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              `Three days running under bare poles, and out the other side.${hull(g, life, 10)}`,
              "good",
            );
          else {
            hurt(g, life, 12, "a hurricane");
            delay(g, life, 5);
            say(
              g,
              life,
              `Dismasted, half full of water, and alive.${hull(g, life, 40)}`,
              "bad",
            );
          }
        },
        { skill: "seamanship", dc: 8 },
      ),
      ch(
        "Heave to and ride it out",
        "Seamanship: slower, steadier.",
        (g, life, c, pass) => {
          delay(g, life, 3);
          if (pass)
            say(
              g,
              life,
              `Lying to under a scrap of sail while the world ended around you. It didn't.${hull(g, life, 8)}`,
              "good",
            );
          else
            say(g, life, `Battered for two days.${hull(g, life, 25)}`, "bad");
        },
        { skill: "seamanship", dc: 6 },
      ),
      ch(
        "Make for the nearest harbour",
        "Four days lost, if you reach it.",
        (g, life) => {
          delay(g, life, 4);
          say(
            g,
            life,
            `A mad race for a harbour mouth, and in, with the first gusts tearing at the sails.${hull(g, life, 5)}`,
          );
        },
      ),
    ],
  },
  {
    key: "trv-gale",
    pool: "sea",
    weight: 4,
    cooldown: 250,
    scene: "storm",
    when: on(
      (h) =>
        h.sea &&
        (COLD.includes(h.region) ||
          h.region === "middle" ||
          h.region === "chesapeake") &&
        (h.winter || mon(h, 9, 11)),
    ),
    title: "A North Atlantic gale",
    body: () =>
      "A north-easter: green water over the bow, spray freezing in the rigging, and the shore a white line of breakers to leeward.",
    choices: [
      ch(
        "Claw off the lee shore",
        "Seamanship. Fail, and she strikes.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              `Off the lee shore by a cable's length. The crew chopped ice off the rigging for two days.${hull(g, life, 6)}`,
              "good",
            );
          else {
            hurt(g, life, 10, "a winter gale");
            loseGoods(g, life, 0.4);
            say(
              g,
              life,
              `She touched on a bar and came off, leaking, with half the cargo over the side.${hull(g, life, 35)}`,
              "bad",
            );
          }
        },
        { skill: "seamanship", dc: 7 },
      ),
      ch("Run for shelter behind the cape", "Two days lost.", (g, life) => {
        delay(g, life, 2);
        say(
          g,
          life,
          `Sheltered behind the cape with a dozen fishing boats.${hull(g, life, 3)}`,
        );
      }),
    ],
  },
  {
    key: "trv-fog-banks",
    pool: "sea",
    weight: 3,
    cooldown: 300,
    scene: "deck",
    when: on((h) => h.sea && COLD.includes(h.region) && mon(h, 4, 8)),
    title: "Fog on the Banks",
    body: () =>
      "Fog so thick you can't see the bowsprit from the helm. Somewhere close, a fishing schooner rings her bell; somewhere else, surf.",
    choices: [
      ch(
        "Feel your way with the lead line",
        "Seamanship.",
        (g, life, c, pass) => {
          if (!pass)
            say(
              g,
              life,
              `Aground on a ledge until the tide lifted you off.${hull(g, life, 12)}`,
              "bad",
            );
          gainXp(g, life, "seamanship", 6);
        },
        { skill: "seamanship", dc: 6 },
      ),
      ch("Anchor and wait", "Two days in a grey world.", (g, life) =>
        delay(g, life, 2),
      ),
    ],
  },
  {
    key: "trv-ice",
    pool: "sea",
    weight: 3,
    cooldown: 400,
    scene: "deck",
    when: on((h) => h.sea && h.region === "north" && mon(h, 3, 6)),
    title: "Ice!",
    body: () =>
      "A cry from the masthead: ice ahead, a mountain of it, blue and white, and smaller pieces all around it like teeth.",
    choices: [
      ch(
        "Thread through the floes",
        "Seamanship: a day saved, or a hole in the bow.",
        (g, life, c, pass) => {
          if (pass) delay(g, life, -1);
          else
            say(
              g,
              life,
              `A growler scraped down her side with a noise like the end of the world.${hull(g, life, 20)}`,
              "bad",
            );
        },
        { skill: "seamanship", dc: 7 },
      ),
      ch("Stand well off and go round", "Two days lost.", (g, life) =>
        delay(g, life, 2),
      ),
    ],
  },
  {
    key: "trv-becalmed",
    pool: "sea",
    weight: 3,
    cooldown: 300,
    scene: "deck",
    when: on((h) => h.sea && HOT.includes(h.region) && mon(h, 5, 9)),
    title: "Becalmed",
    body: () =>
      "Not a breath of wind for days. The sea like oil, the sun like a hammer, the pitch bubbling in the deck seams and tempers short.",
    choices: [
      ch("Wait for the wind", "Days lost, and patience.", (g, life) => {
        delay(g, life, g.rng.int(4, 8));
        addStress(g, life, 3);
      }),
      ch(
        "Put out the boats and tow",
        "Seamanship: hard rowing in the heat.",
        (g, life, c, pass) => {
          delay(g, life, pass ? 1 : 3);
          hurt(g, life, 3, "rowing in the heat");
        },
        { skill: "seamanship", dc: 6 },
      ),
      ch(
        "Fish over the side",
        "A coin's worth of dolphin and bonito.",
        (g, life) => {
          delay(g, life, 4);
          earn(g, life, 1);
          addStress(g, life, -2);
        },
      ),
    ],
  },
  {
    key: "trv-pirates",
    pool: "sea",
    weight: 6,
    cooldown: 200,
    scene: "deck",
    // The golden age of piracy, and the islands in any age.
    when: on(
      (h, g, life) =>
        h.sea &&
        (HOT.includes(h.region) || h.region === "chesapeake") &&
        ((h.year >= 1650 && h.year <= 1730) || h.region === "caribbean") &&
        life.job?.kind !== "pirate",
    ),
    title: "The black flag",
    body: (g, life) =>
      `A sloop to windward, closing fast, and as she comes she runs up a black flag with a skull on it.${sailingOwn(life) ? ` They want the ${sailingOwn(life)!.name}.` : " Your captain looks at you, and at the passengers."}`,
    choices: [
      ch(
        "Crack on every sail and run",
        "Seamanship: outsail them. Your own boat's speed counts.",
        (g, life, c, pass) => {
          if (pass)
            say(
              g,
              life,
              "A long chase into the dusk, and you lost them in a squall.",
              "good",
            );
          else {
            const n = Math.round(life.purse * 0.5);
            spend(g, life, n);
            loseGoods(g, life, 0.8);
            if (sailingOwn(life) && g.rng.chance(0.5))
              takeBoat(
                g,
                life,
                "The pirates took your boat and put you ashore on a sandbar.",
              );
            say(
              g,
              life,
              `They caught you. ${n} coins and the cargo went with them.`,
              "bad",
            );
          }
        },
        { skill: "seamanship", dc: 8 },
      ),
      ch(
        "Fight",
        "Fighting: muskets at the rail, cutlasses ready. Pirates prefer prey that doesn't.",
        (g, life, c, pass) => {
          if (pass) {
            addRenown(g, life, 4);
            gainXp(g, life, "fighting", 12);
            say(
              g,
              life,
              `A volley, a swivel gun, and they sheered off to find someone easier.${hull(g, life, 10)}`,
              "good",
            );
          } else {
            hurt(g, life, g.rng.int(12, 30), "a fight with pirates");
            spend(g, life, Math.round(life.purse * 0.7));
            loseGoods(g, life, 1);
            if (sailingOwn(life))
              takeBoat(g, life, "The pirates took your boat as a prize.");
            say(
              g,
              life,
              "They boarded. You were lucky they only robbed you.",
              "bad",
            );
          }
        },
        { skill: "fighting", dc: 9 },
      ),
      ch(
        "Strike your colours",
        "Lose half your purse and your cargo. Nobody hurt.",
        (g, life) => {
          spend(g, life, Math.round(life.purse * 0.5));
          loseGoods(g, life, 1);
          if (sailingOwn(life) && g.rng.chance(0.3))
            takeBoat(
              g,
              life,
              "They took your boat, too: she'll make a fine pirate.",
            );
          say(
            g,
            life,
            "Polite, efficient pirates. They took the rum and the money and wished you good morning.",
            "bad",
          );
        },
      ),
      ch(
        "Ask to sign their articles",
        "With a name in the underworld, or nothing to lose: they're always short of hands.",
        (g, life) => {
          addNotoriety(g, life, 8);
          earn(g, life, 3);
          say(
            g,
            life,
            "You signed their articles over a bowl of punch, drank to the black flag, and they let your ship go for your sake. A pirate's life could be yours (at the docks, if you take it up).",
            "good",
          );
        },
        undefined,
        (g, life) =>
          (life.crime?.notoriety ?? 0) >= 10 || life.purse < 5
            ? null
            : "Only for rogues, or those with nothing to lose",
      ),
    ],
  },
  {
    key: "trv-guarda-costa",
    pool: "sea",
    weight: 4,
    cooldown: 250,
    scene: "deck",
    when: on(
      (h, g, life) =>
        h.sea &&
        ["caribbean", "florida", "gulf"].includes(h.region) &&
        h.ownerKey === "spain" &&
        meOf(g.s, life)?.nation !== h.owner,
    ),
    title: "The guarda costa",
    body: () =>
      "A Spanish guarda costa sloop, half customs and half pirate, puts a shot across your bow. Her captain wants to see your papers and your hold: any English goods in Spanish waters are contraband.",
    choices: [
      ch(
        "Show your papers",
        "Letters: a clean manifest and a calm face.",
        (g, life, c, pass) => {
          if (!pass) {
            const lost = loseGoods(g, life, 0.7);
            say(
              g,
              life,
              `Your papers didn't please him: ${lost} loads seized as contraband.`,
              "bad",
            );
          }
        },
        { skill: "letters", dc: 7 },
      ),
      ch(
        "Bribe the captain",
        "Five coins in a handshake.",
        (g, life) => spend(g, life, 5),
        undefined,
        (g, life) => purse(life, 5),
      ),
      ch(
        "Run",
        "Seamanship. Caught running, it goes worse.",
        (g, life, c, pass) => {
          if (!pass) {
            loseGoods(g, life, 1);
            spend(g, life, Math.round(life.purse * 0.3));
            delay(g, life, 10);
            say(
              g,
              life,
              "Taken into Havana as a smuggler, and let go ten days later much poorer.",
              "bad",
            );
          }
        },
        { skill: "seamanship", dc: 7 },
      ),
    ],
  },
  {
    key: "trv-press-gang",
    pool: "sea",
    weight: 4,
    cooldown: 400,
    scene: "deck",
    when: on((h, g, life) => {
      const me = meOf(g.s, life);
      return (
        h.sea &&
        !!me &&
        g.s.nations[me.nation]?.key === "england" &&
        g.s.wars.some((w) => w.a === me.nation || w.b === me.nation)
      );
    }),
    title: "A man-of-war's boat",
    body: () =>
      "A frigate heaves to across your course and sends a boat with a lieutenant and a dozen hard men: a press gang, short of seamen for the war, looking for able bodies.",
    choices: [
      ch(
        "Hide in the hold",
        "Stealth: under the cargo, behind the water casks.",
        (g, life, c, pass) => {
          if (!pass) {
            delay(g, life, 30);
            earn(g, life, 3);
            hurt(g, life, 5, "the navy");
            say(
              g,
              life,
              "Found, pressed, and a month in the frigate's waist before a kind captain put you ashore with your pay.",
              "bad",
            );
          }
        },
        { skill: "stealth", dc: 6 },
      ),
      ch(
        "Show you're no seaman",
        "Letters or soft hands: gentlemen and tradesmen are exempt (mostly).",
        (g, life, c, pass) => {
          if (!pass) {
            delay(g, life, 20);
            say(
              g,
              life,
              "The lieutenant didn't believe you. Three weeks hauling ropes before your papers caught up.",
              "bad",
            );
          }
        },
        { skill: "letters", dc: 5 },
      ),
    ],
  },
  {
    key: "trv-man-overboard",
    pool: "sea",
    weight: 2,
    cooldown: 400,
    scene: "deck",
    when: on((h) => h.sea),
    title: "Man overboard!",
    body: () =>
      "A shout, a splash: a ship's boy has gone over the side, and he can't swim. The ship is already past him.",
    choices: [
      ch(
        "Dive in after him",
        "Seamanship: the sea is cold and the ship is going away.",
        (g, life, c, pass) => {
          if (pass) {
            addRenown(g, life, 3);
            say(
              g,
              life,
              "You had him by the collar before he went down the second time. The crew cheered you to the rafters.",
              "good",
            );
          } else {
            hurt(g, life, 8, "a cold sea");
            say(
              g,
              life,
              "You couldn't reach him. They fished you out, half drowned.",
              "bad",
            );
          }
        },
        { skill: "seamanship", dc: 7 },
      ),
      ch(
        "Throw him a line",
        "Seamanship.",
        (g, life, c, pass) => {
          if (pass) addRenown(g, life, 1);
          else addStress(g, life, 4);
        },
        { skill: "seamanship", dc: 5 },
      ),
      ch("It's too late", "", (g, life) => addStress(g, life, 4)),
    ],
  },
  {
    key: "trv-scurvy",
    pool: "sea",
    weight: 2,
    cooldown: 500,
    scene: "deck",
    when: on(
      (h, g, life) =>
        h.sea &&
        !!life.travel &&
        g.s.day - life.travel.depart > 12 &&
        life.travel.path.length > 1,
    ),
    title: "Scurvy",
    body: () =>
      "Gums swelling, old wounds opening, a heaviness in the legs: the long-voyage sickness is in the ship.",
    choices: [
      ch(
        "Pay for limes and fresh food at the next landfall",
        "Two coins: well again in days.",
        (g, life) => {
          spend(g, life, 2);
          heal(g, life, 2);
        },
        undefined,
        (g, life) => purse(life, 2),
      ),
      ch("Endure", "Your health suffers until you're ashore.", (g, life) =>
        hurt(g, life, 8, "scurvy"),
      ),
    ],
  },
  {
    key: "trv-wreck",
    pool: "sea",
    weight: 3,
    cooldown: 400,
    scene: "docks",
    when: on(
      (h) =>
        h.sea &&
        (h.region === "florida" ||
          h.region === "caribbean" ||
          h.region === "south"),
    ),
    title: "A wreck on the reef",
    body: () =>
      "The bones of a ship on the reef, half under water, her cargo scattered in the shallows: a Spanish galleon, maybe, or a Jamaica sugar ship. Nobody's claimed it yet.",
    choices: [
      ch(
        "Dive for salvage",
        "Seamanship: silver, if you're lucky; the reef, if you're not.",
        (g, life, c, pass) => {
          if (pass) {
            const got = g.rng.int(5, 15);
            earn(g, life, got);
            say(
              g,
              life,
              `A chest of pieces of eight, black with the sea: ${got} coins once they're cleaned.`,
              "good",
            );
          } else {
            hurt(g, life, 7, "the reef");
            say(
              g,
              life,
              `Cut to ribbons on the coral for a few copper nails.${hull(g, life, 8)}`,
              "bad",
            );
          }
        },
        { skill: "seamanship", dc: 6 },
      ),
      ch(
        "Report it at the next port",
        "The admiralty pays a little for word of a wreck.",
        (g, life) => {
          addRenown(g, life, 1);
          earn(g, life, 1);
        },
      ),
      ch("Sail on", "", () => undefined),
    ],
  },
  {
    key: "trv-smugglers-lights",
    pool: "sea",
    weight: 2,
    cooldown: 400,
    scene: "docks",
    when: on((h) => h.sea && h.coastal && !h.native && h.owner >= 0),
    title: "Lights in a cove",
    body: () =>
      "Lights flashing in a cove after dark, answered from a vessel offshore with no lights of her own: a smuggling run, landing goods past the customs.",
    choices: [
      ch(
        "Report it at the next customs house",
        "A reward, and some enemies.",
        (g, life) => {
          earn(g, life, 2);
          addRenown(g, life, 0.5);
        },
      ),
      ch(
        "Lend a hand for a share",
        "Quick money, a name in the underworld, the law's eye.",
        (g, life) => {
          earn(g, life, 5);
          addNotoriety(g, life, 2);
          addHeat(g, life, hopOf(g, life)?.owner ?? -1, 8);
          say(
            g,
            life,
            "A night carrying kegs up a cliff path for men who never told you their names. Five coins.",
            "bad",
          );
        },
      ),
      ch("See nothing", "", () => undefined),
    ],
  },
  {
    key: "trv-st-elmo",
    pool: "sea",
    weight: 2,
    cooldown: 500,
    scene: "deck",
    when: on((h) => h.sea),
    title: "St Elmo's fire",
    body: () =>
      "In the middle watch blue fire plays along the yards and the mastheads, silent and bright. The old hands cross themselves: a sign of the saint's protection, or of a storm.",
    choices: [
      ch("Pray with the crew", "Faith; a quiet heart.", (g, life) => {
        gainXp(g, life, "faith", 6);
        addStress(g, life, -3);
      }),
      ch(
        "Explain it's only weather",
        "Letters; nobody thanks you.",
        (g, life) => gainXp(g, life, "letters", 5),
      ),
    ],
  },
  {
    key: "trv-dolphins",
    pool: "sea",
    weight: 1,
    cooldown: 400,
    scene: "deck",
    when: on((h) => h.sea && !h.winter),
    title: "Dolphins at the bow",
    body: () =>
      "A school of dolphins rides the bow wave all afternoon, leaping and blowing, and the whole ship comes to the rail to watch.",
    choices: [
      ch(
        "Watch them",
        "A good afternoon, and the sea at its kindest.",
        (g, life) => addStress(g, life, -4),
      ),
    ],
  },
];

// Every event the road brings has the scene of the road (or the sea) unless it says.
for (const def of TRAVEL_EVENTS)
  def.scene ??= def.pool === "sea" ? "deck" : "road";
