// GOV (r21): what happens to an expedition, as scenes. On the way (white
// water, fever, warriors on the trail, lost, winter, short rations,
// deserters, a guide who offers himself, a strange find) and at the far end
// (the work itself, each kind its own ways of going about it). A player who
// leads gets the scene and chooses; a leader of the computer's chooses by
// his own lights, and the players with the party are told what he chose.
// The odds on each button are the party's: the leader's skill, helped by
// the best of the party at it, against the difficulty (`checkChance`, the
// same as any check). The far end's first way of going about it is exactly
// the odds the planner showed. Nothing here puts words in another player's
// mouth: the invitation, the grant and the war party on the frontier are
// each the player's own to answer.

import { relate } from "./Council";
import { registerFamily } from "./EventPacing";
import {
  draftOf,
  edice,
  expedById,
  expedOf,
  expedWords,
  KINDS,
  leaderLevel,
  menWords,
  partyLives,
  partySkill,
  plunderOf,
  workDc,
  workSkill,
} from "./ExpedCore";
import { answerGrant } from "./ExpedGrant";
import {
  answerInvite,
  delayExped,
  hurtLeader,
  loseMen,
  tell,
  workDone,
} from "./Expeditions";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import { addRenown, addStress, gainXp, hurt, journal } from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import { lifeOfSeat, skillLevel } from "./LifeQueries";
import { checkChance, SKILL_NAMES } from "./LifeRules";
import { isFeverSeason, isWinter } from "./Map";
import { atWar, charName, monthOf, relationOf } from "./Queries";
import type { Expedition, ExpedKind, Life, Skill } from "./Types";

// ---------------------------------------------------------------- the shape of a scene

export interface XChoice {
  label: string | ((g: ConquestGame, x: Expedition) => string);
  tip: (g: ConquestGame, x: Expedition) => string;
  /** A check: the skill, and its difficulty before the party's help. */
  skill?: Skill;
  dc?: (g: ConquestGame, x: Expedition) => number;
  /** The work at the far end: the difficulty already has the party's help in it. */
  work?: boolean;
  blocked?: (g: ConquestGame, x: Expedition) => string | null;
  /** Does it; returns what the party is told. */
  apply: (g: ConquestGame, x: Expedition, pass: boolean) => string;
  /** A computer leader's leaning (higher, likelier). */
  ai: (g: ConquestGame, x: Expedition) => number;
}

export interface XScene {
  key: string;
  title: (g: ConquestGame, x: Expedition) => string;
  body: (g: ConquestGame, x: Expedition) => string;
  /** Whether it fits where the party is (a scene on the way). */
  fits?: (g: ConquestGame, x: Expedition) => boolean;
  choices: XChoice[];
  /** The backdrop. */
  scene: string;
  /** Left unanswered. */
  quiet: number;
}

const name = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "somewhere";
const lead = (g: ConquestGame, x: Expedition) => charName(g.s.chars[x.leader]);
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Where the party is now (the province it's in or making for). */
function hereOf(g: ConquestGame, x: Expedition): number {
  const l = partyLives(g.s, x)[0];
  if (l) return l.travel?.path[0] ?? l.prov;
  return x.stage === "back" ? x.from : x.target;
}

/** The native nation whose country the party is in, or near. */
function nativesNear(g: ConquestGame, x: Expedition): number {
  const s = g.s;
  const p = hereOf(g, x);
  for (const q of [p, x.target, ...g.map.provinces[p].nb.map(([r]) => r)]) {
    const o = s.provinces[q]?.owner ?? -1;
    if (o >= 0 && s.nations[o]?.kind === "native") return o;
  }
  return -1;
}

/** A choice's chance for this party. */
export function choiceChance(
  g: ConquestGame,
  x: Expedition,
  c: XChoice,
): number | null {
  if (!c.skill || !c.dc) return null;
  const dc = c.dc(g, x);
  if (c.work) {
    const own = leaderLevel(g.s, g.s.chars[x.leader], c.skill);
    return checkChance(own, dc);
  }
  return checkChance(partySkill(g.s, x, c.skill), dc);
}

/** The far end's difficulty for the leader's own skill (the party's help already counted in). */
function workFor(g: ConquestGame, x: Expedition, shift = 0): number {
  const d = draftOf(x);
  const sk = workSkill(g.s, d);
  const dc = workDc(g.s, g.w, d, g.s.day);
  const own = leaderLevel(g.s, g.s.chars[x.leader], KINDS[x.kind].skill);
  return dc.total - (sk.total - own) + shift;
}

/** A pass at the work: won; a fail: half the time a poor showing, half a failure. */
function band(
  g: ConquestGame,
  x: Expedition,
  pass: boolean,
): "won" | "half" | "failed" {
  if (pass) return "won";
  return edice(g.s, 0x71, x.id).chance(0.5) ? "half" : "failed";
}

const odds = (g: ConquestGame, x: Expedition, c: XChoice) => {
  const p = choiceChance(g, x, c);
  return p === null ? "" : ` (${SKILL_NAMES[c.skill!]} ${pct(p)})`;
};

// ---------------------------------------------------------------- on the way

const ONWAY: XScene[] = [
  {
    key: "exped-rapids",
    scene: "river",
    quiet: 0,
    fits: (g, x) =>
      x.sea.some(Boolean) ||
      g.map.provinces[hereOf(g, x)].nb.some(([, , river]) => river === 1),
    title: () => "White water",
    body: (g, x) =>
      `The party has come to rapids on the way ${x.stage === "back" ? "home" : `to ${name(g, x.target)}`}. The canoes are heavy; the guides say a carry round them will cost ten days.`,
    choices: [
      {
        label: "Carry the canoes round",
        tip: () => "Safe: ten days lost.",
        apply: (g, x) => {
          delayExped(g, x, 10);
          return "They carried the canoes round the rapids: ten days lost.";
        },
        ai: () => 1.5,
      },
      {
        label: "Run the rapids",
        skill: "seamanship",
        dc: () => 6,
        tip: (g, x) =>
          `No time lost if it goes well. If not, a third of the hands go into the river and the leader may be hurt.`,
        apply: (g, x, pass) => {
          if (pass) return "They ran the rapids, soaked and whooping.";
          const n = loseMen(g, x, 0.3);
          return `A canoe went over in the white water: ${menWords(n)} lost. ${hurtLeader(g, x, 12, "the rapids", 0.1)}`;
        },
        ai: (g, x) => 3 * (choiceChance(g, x, ONWAY[0].choices[1]) ?? 0.5),
      },
    ],
  },
  {
    key: "exped-fever",
    scene: "swamp",
    quiet: 0,
    fits: (g, x) => {
      const p = hereOf(g, x);
      const d = g.map.provinces[p];
      return (
        !!g.w.tropical[p] ||
        d.terrain === "marsh" ||
        isFeverSeason(d.lat, monthOf(g.s))
      );
    },
    title: () => "Fever in the camp",
    body: () =>
      "A fever is going through the camp. Men shake in their blankets, and two can't stand.",
    choices: [
      {
        label: "Rest until it passes",
        tip: () => "Eighteen days lost, and a tenth of the hands with them.",
        apply: (g, x) => {
          delayExped(g, x, 18);
          const n = loseMen(g, x, 0.1);
          return `They rested until the fever passed: eighteen days${n ? `, and ${menWords(n)} buried` : ""}.`;
        },
        ai: () => 2,
      },
      {
        label: "Physic, and press on",
        skill: "medicine",
        dc: () => 7,
        tip: () =>
          "Bark and bleeding and a slower march. If it doesn't answer, a quarter of the hands are lost and the leader may take it.",
        apply: (g, x, pass) => {
          if (pass)
            return "Bark and rest on the march: the fever broke, and nobody died of it.";
          const n = loseMen(g, x, 0.25);
          return `The fever went through the party on the march: ${menWords(n)} lost. ${hurtLeader(g, x, 15, "a fever in the wilds", 0.12)}`;
        },
        ai: (g, x) => 3 * (choiceChance(g, x, ONWAY[1].choices[1]) ?? 0.5),
      },
    ],
  },
  {
    key: "exped-warriors",
    scene: "woods",
    quiet: 0,
    fits: (g, x) => nativesNear(g, x) >= 0 && x.kind !== "raid",
    title: (g, x) =>
      `Warriors of the ${g.s.nations[nativesNear(g, x)]?.name ?? "country"} on the trail`,
    body: (g, x) =>
      `Armed men of the ${g.s.nations[nativesNear(g, x)]?.name ?? "country"} have come out of the trees and stand across the path. They want to know who is crossing their country, and why.`,
    choices: [
      {
        label: "Offer presents and ask for guides",
        skill: "persuasion",
        dc: (g, x) => {
          const o = nativesNear(g, x);
          const rel = o >= 0 ? relationOf(g.s, g.w, o, x.n).total : 0;
          return 6 - Math.round(rel / 20);
        },
        tip: () =>
          "If they take to you: guides, and a better welcome at the far end (+1 to the work). If not, they turn the party back: twelve days lost.",
        apply: (g, x, pass) => {
          const o = nativesNear(g, x);
          if (pass) {
            x.edge += 1;
            if (o >= 0)
              relate(g, o, x.n, "Travellers who came with presents", 4, 5);
            return "They took the presents and sent two young men to guide the party.";
          }
          delayExped(g, x, 12);
          return "They took the presents and turned the party back the way it came: twelve days lost.";
        },
        ai: (g, x) => 3 * (choiceChance(g, x, ONWAY[2].choices[0]) ?? 0.5),
      },
      {
        label: "Slip past them in the night",
        skill: "stealth",
        dc: () => 7,
        tip: () =>
          "If they're seen going, a fight in the dark: a third of the hands lost, and the leader may be hurt.",
        apply: (g, x, pass) => {
          if (pass)
            return "They slipped past in the night, and nobody followed.";
          const n = loseMen(g, x, 0.3);
          return `They were seen going: a fight in the dark, ${menWords(n)} lost. ${hurtLeader(g, x, 15, "a skirmish on the trail", 0.12)}`;
        },
        ai: (g, x) => 2 * (choiceChance(g, x, ONWAY[2].choices[1]) ?? 0.5),
      },
      {
        label: "Show them the muskets",
        skill: "fighting",
        dc: (g, x) => 8 - Math.floor(x.men / 6),
        tip: () =>
          "They may stand aside, and they'll resent it. If they don't: a fight, two fifths of the hands lost, the leader at risk.",
        apply: (g, x, pass) => {
          const o = nativesNear(g, x);
          if (o >= 0)
            relate(
              g,
              o,
              x.n,
              "Strangers who threatened us on our own paths",
              -8,
              6,
            );
          if (pass)
            return "They stood aside, and watched the party out of sight.";
          const n = loseMen(g, x, 0.4);
          return `They didn't stand aside: a running fight, ${menWords(n)} lost. ${hurtLeader(g, x, 18, "a fight on the trail", 0.15)}`;
        },
        ai: (g, x) =>
          (choiceChance(g, x, ONWAY[2].choices[2]) ?? 0.5) *
          (g.s.chars[x.leader]?.traits.includes("cruel") ? 3 : 1),
      },
    ],
  },
  {
    key: "exped-lost",
    scene: "woods",
    quiet: 1,
    fits: (g, x) =>
      ["forest", "jungle", "mountains", "tundra", "hills"].includes(
        g.map.provinces[hereOf(g, x)].terrain,
      ),
    title: () => "Lost",
    body: () =>
      "The trail has given out. The party has walked in circles for three days, the stores are low, and the guides argue about which ridge is which.",
    choices: [
      {
        label: "Trust the compass and push on",
        skill: "woodcraft",
        dc: () => 6,
        tip: () =>
          "If it's wrong: twenty days in the wild, and a tenth of the hands lost.",
        apply: (g, x, pass) => {
          if (pass)
            return "The compass was right: they struck the river by noon.";
          delayExped(g, x, 20);
          const n = loseMen(g, x, 0.1);
          return `Twenty days lost in the woods${n ? `, and ${menWords(n)} who wandered off and never came back` : ""}.`;
        },
        ai: (g, x) => 3 * (choiceChance(g, x, ONWAY[3].choices[0]) ?? 0.5),
      },
      {
        label: "Go back to the last landmark",
        tip: () => "Safe, but twelve days lost.",
        apply: (g, x) => {
          delayExped(g, x, 12);
          return "They went back to the blazed oak and started again: twelve days lost.";
        },
        ai: () => 1.5,
      },
    ],
  },
  {
    key: "exped-winter",
    scene: "snow",
    quiet: 0,
    fits: (g, x) => {
      const d = g.map.provinces[hereOf(g, x)];
      return isWinter(d.lat, monthOf(g.s));
    },
    title: () => "Winter closes in",
    body: () =>
      "Snow has come early. The rivers are freezing at the edges and the game has gone.",
    choices: [
      {
        label: "Make camp until the thaw",
        tip: () => "Thirty-five days lost, and a tenth of the hands.",
        apply: (g, x) => {
          delayExped(g, x, 35);
          const n = loseMen(g, x, 0.1);
          return `They built huts and waited out the cold: thirty-five days${n ? `, and ${menWords(n)} lost to it` : ""}.`;
        },
        ai: () => 2,
      },
      {
        label: "March on through the snow",
        skill: "woodcraft",
        dc: () => 7,
        tip: () =>
          "No time lost if it goes well; if not, a quarter of the hands freeze and the leader may be hurt.",
        apply: (g, x, pass) => {
          if (pass) return "Snowshoes and hard marching: they came through.";
          const n = loseMen(g, x, 0.25);
          return `The cold took ${menWords(n)} on the march. ${hurtLeader(g, x, 12, "cold on the trail", 0.1)}`;
        },
        ai: (g, x) => 2 * (choiceChance(g, x, ONWAY[4].choices[1]) ?? 0.5),
      },
    ],
  },
  {
    key: "exped-rations",
    scene: "road",
    quiet: 1,
    fits: (g, x) => x.legs.reduce((a, b) => a + b, 0) >= 15,
    title: () => "Short of stores",
    body: () =>
      "The salt pork is half gone and the flour has the weevil. The men are counting the days.",
    choices: [
      {
        label: "Hunt for the pot",
        skill: "woodcraft",
        dc: () => 5,
        tip: () =>
          "A few days' hunting. If the game's thin, eight days lost and the men lose heart (−1 at the far end).",
        apply: (g, x, pass) => {
          if (pass) return "Deer and turkey for the pot: the men eat well.";
          delayExped(g, x, 8);
          x.edge -= 1;
          return "The game was thin: eight days lost and the men grumbling.";
        },
        ai: (g, x) => 3 * (choiceChance(g, x, ONWAY[5].choices[0]) ?? 0.5),
      },
      {
        label: "Short rations, and push on",
        tip: () => "No time lost; a tenth of the hands slip away in the night.",
        apply: (g, x) => {
          const n = loseMen(g, x, 0.1);
          return n
            ? `Half rations and long marches: ${menWords(n)} slipped away in the night.`
            : "Half rations and long marches, and nobody slipped away.";
        },
        ai: () => 1,
      },
    ],
  },
  {
    key: "exped-deserters",
    scene: "woods",
    quiet: 1,
    fits: (_g, x) => x.hands >= 8,
    title: () => "Deserters",
    body: () =>
      "Four of the hands went off in the night with a canoe and a keg of powder. The rest are watching to see what's done about it.",
    choices: [
      {
        label: "Go after them",
        skill: "leadership",
        dc: () => 6,
        tip: () =>
          "Bring them back and the rest stay. If not, more follow: a fifth of the hands gone.",
        apply: (g, x, pass) => {
          if (pass)
            return "They were brought back the next day, sheepish, and nobody else tried it.";
          const n = loseMen(g, x, 0.2);
          return `They got clean away, and others followed: ${menWords(n)} gone.`;
        },
        ai: (g, x) => 3 * (choiceChance(g, x, ONWAY[6].choices[0]) ?? 0.5),
      },
      {
        label: "Let them go",
        tip: () => "A tenth of the hands gone, and the rest know they could.",
        apply: (g, x) => {
          const n = loseMen(g, x, 0.1);
          return `They let them go: ${menWords(n)} gone.`;
        },
        ai: () => 1.2,
      },
    ],
  },
  {
    key: "exped-guide",
    scene: "village",
    quiet: 1,
    fits: (g, x) => {
      const o = nativesNear(g, x);
      return (
        o >= 0 && !atWar(g.s, o, x.n) && x.stage === "out" && x.kind !== "raid"
      );
    },
    title: () => "A guide offers himself",
    body: (g, x) =>
      `A hunter of the ${g.s.nations[nativesNear(g, x)]?.name ?? "country"}, who has a little English and a lot of patience, offers to guide the party for a kettle and two blankets.`,
    choices: [
      {
        label: "Take him on",
        tip: () =>
          "A kettle and two blankets from the stores: the way is easier and the welcome better (+1 at the far end).",
        apply: (g, x) => {
          x.edge += 1;
          return "They took the hunter on as guide; the way is easier for it.";
        },
        ai: () => 3,
      },
      {
        label: "Thank him, and go on",
        tip: () => "Nothing lost, nothing gained.",
        apply: () => "They thanked the hunter and went on alone.",
        ai: () => 1,
      },
    ],
  },
  {
    key: "exped-find",
    scene: "woods",
    quiet: 1,
    fits: (_g, x) =>
      (x.kind === "discover" || x.kind === "river") && x.stage === "out",
    title: () => "Something in the woods",
    body: () =>
      "Under the trees the party has found something nobody can explain: great earthen mounds, older than anyone's memory, with oaks growing on them.",
    choices: [
      {
        label: "Stop and make a study of it",
        skill: "letters",
        dc: () => 6,
        tip: () =>
          "Three days. Written up well, it's talked of in every coffee house (renown, and +1 at the far end for the practice).",
        apply: (g, x, pass) => {
          delayExped(g, x, 3);
          if (!pass)
            return "Three days of measuring, and notes nobody can read.";
          x.edge += 1;
          const l = x.lseat ? lifeOfSeat(g.s, x.lseat) : undefined;
          if (l && l.c === x.leader) addRenown(g, l, 2);
          return "Three days of measuring and drawing: an account of the mounds goes home with the maps.";
        },
        ai: (g, x) => 2 * (choiceChance(g, x, ONWAY[8].choices[0]) ?? 0.5),
      },
      {
        label: "No time: push on",
        tip: () => "Nothing lost.",
        apply: () => "They pushed on past the mounds.",
        ai: () => 1,
      },
    ],
  },
];

// ---------------------------------------------------------------- the far end

/** A way of going about the work at the far end: the kind's own skill (unless another is given), a shift in its difficulty. */
const w = (
  kind: ExpedKind,
  label: string,
  tip: string,
  shift = 0,
  how: Parameters<typeof workDone>[3] = {},
  aiW = 1,
  /** Another skill for the work (Letters to chart a river): the leader's own, at the same difficulty. */
  alt?: Skill,
): XChoice => ({
  label,
  skill: alt ?? KINDS[kind].skill,
  work: true,
  dc: (g, x) => workFor(g, x, shift),
  tip: () => tip,
  apply: (g, x, pass) => workDone(g, x, band(g, x, pass), how),
  // The computer's leader weighs it at its true chance, in the skill it tests.
  ai: (g, x) =>
    aiW *
    checkChance(
      leaderLevel(g.s, g.s.chars[x.leader], alt ?? KINDS[x.kind].skill),
      workFor(g, x, shift),
    ),
});

const turnBack: XChoice = {
  label: "Turn for home",
  tip: () => "Nothing done, nothing risked.",
  apply: (g, x) => workDone(g, x, "turned"),
  ai: () => 0.05,
};

const FAR: Record<ExpedKind, XScene> = {
  discover: {
    key: "exped-far-discover",
    scene: "woods",
    quiet: 0,
    title: (g, x) => `The country about ${name(g, x.target)}`,
    body: (g, x) =>
      `The party is at ${name(g, x.target)}, in country no map of your colony shows. ${lead(g, x)} must decide how far to go on.`,
    choices: [
      w(
        "discover",
        "Survey it, and the country round about",
        "The work as planned: at the odds you were shown.",
        0,
      ),
      w(
        "discover",
        "Push on beyond it",
        "Harder (+2), and further: the country two days round about, if it goes well.",
        2,
        { wide: true },
        0.7,
      ),
      turnBack,
    ],
  },
  river: {
    key: "exped-far-river",
    scene: "river",
    quiet: 0,
    title: (g, x) => `The river at ${name(g, x.target)}`,
    body: (g, x) =>
      `The canoes are in the water at ${name(g, x.target)}. The river runs on out of sight, brown and fast, between bluffs.`,
    choices: [
      w(
        "river",
        "Follow it, sounding and sketching",
        "The work as planned: at the odds you were shown.",
        0,
      ),
      w(
        "river",
        "Chart it carefully, a stretch at a time",
        "Slower and surer: Letters instead of woodcraft.",
        0,
        {},
        1,
        "letters",
      ),
      turnBack,
    ],
  },
  trade: {
    key: "exped-far-trade",
    scene: "village",
    quiet: 0,
    title: (g, x) => `Trading at ${name(g, x.target)}`,
    body: (g, x) =>
      `The bales are open in the square at ${name(g, x.target)}: cloth, kettles, knives, beads and vermilion. The elders have come out to look, and behind them the hunters with their packs of skins.`,
    choices: [
      w(
        "trade",
        "Deal fairly",
        "The work as planned, at the odds you were shown; they think the better of the colony (+8).",
        0,
      ),
      w(
        "trade",
        "Drive a hard bargain",
        "Harder (+2); a third more for the goods if it goes, and they think the worse of the colony (−5).",
        2,
        { mult: 1.3, regard: -5 },
        0.8,
      ),
      {
        ...w(
          "trade",
          "Open a keg of rum first",
          "Easier (−2): a quarter more for the goods, and the town's anger when the drink wears off (−12). The period's way, and its shame.",
          -2,
          { mult: 1.25, regard: -12 },
          0.4,
        ),
      },
    ],
  },
  outpost: {
    key: "exped-far-outpost",
    scene: "woods",
    quiet: 0,
    title: (g, x) => `Raising the outpost at ${name(g, x.target)}`,
    body: (g, x) =>
      `The axes are out at ${name(g, x.target)}. Where the palisade goes is ${lead(g, x)}'s to say.`,
    choices: [
      w(
        "outpost",
        "On the high ground",
        "The work as planned: at the odds you were shown.",
        0,
      ),
      w(
        "outpost",
        "By the landing, where the canoes come in",
        "Easier work (Craft, −1).",
        -1,
        {},
        1,
        "craft",
      ),
      {
        label: "Treat with the people here first",
        skill: "persuasion",
        work: true,
        dc: (g, x) => workFor(g, x, 1),
        blocked: (g, x) => {
          const o = g.s.provinces[x.target]?.owner ?? -1;
          return o >= 0 && g.s.nations[o]?.kind === "native"
            ? null
            : "Nobody's land to treat for";
        },
        tip: () =>
          "Persuasion, harder (+1): if it goes well they take it less ill (−5, not −15).",
        apply: (g, x, pass) =>
          workDone(g, x, band(g, x, pass), { regard: pass ? -5 : -15 }),
        ai: (g, x) =>
          0.9 *
          checkChance(
            leaderLevel(g.s, g.s.chars[x.leader], "persuasion"),
            workFor(g, x, 1),
          ),
      },
    ],
  },
  mission: {
    key: "exped-far-mission",
    scene: "village",
    quiet: 0,
    title: (g, x) => `The mission at ${name(g, x.target)}`,
    body: (g, x) =>
      `The council of ${name(g, x.target)} has agreed to hear the strangers. The whole town has come to watch.`,
    choices: [
      w(
        "mission",
        "Preach to the council",
        "The work as planned: at the odds you were shown.",
        0,
      ),
      w(
        "mission",
        "Begin with the sick",
        "Medicine instead of faith, a little easier (−1): healers are welcome.",
        -1,
        {},
        1,
        "medicine",
      ),
      turnBack,
    ],
  },
  raid: {
    key: "exped-far-raid",
    scene: "woods",
    quiet: 1,
    title: (g, x) => `Before ${name(g, x.target)} at dawn`,
    body: (g, x) => {
      const s = g.s;
      const o = s.provinces[x.target]?.owner ?? -1;
      const nat = s.nations[o];
      return `The party lies in the trees above ${name(g, x.target)} in the grey before dawn: smoke from the lodges, dogs, the corn cribs full. ${nat ? `The ${nat.name} ${atWar(s, o, x.n) ? "are at war with the colony" : "are at peace with the colony, for now"}.` : ""} ${x.leave ? "The governor gave his leave for this." : "Nobody gave leave for this."}`;
    },
    choices: [
      w(
        "raid",
        "Fall on the town",
        "The raid as planned, at the odds you were shown: plunder and the town laid waste, and the nation's answer.",
        0,
      ),
      {
        label: "Demand tribute instead",
        skill: "persuasion",
        work: true,
        dc: (g, x) => workFor(g, x, 1),
        tip: (g, x) =>
          `Persuasion, a little harder (+1): if they pay, half the plunder (about ${Math.round(plunderOf(g.s, x.target) / 2)}) and less anger (−15); if they refuse, no fight but a grudge.`,
        apply: (g, x, pass) =>
          workDone(g, x, pass ? "won" : "failed", { tribute: true }),
        // A just or tolerant leader leans to it; anyone weighs his chance.
        ai: (g, x) =>
          (g.s.chars[x.leader]?.traits.some(
            (t) => t === "just" || t === "tolerant",
          )
            ? 1.5
            : 0.6) *
          checkChance(
            leaderLevel(g.s, g.s.chars[x.leader], "persuasion"),
            workFor(g, x, 1),
          ),
      },
      {
        label: "Turn back",
        tip: () => "Nothing done. The town will have seen armed men go.",
        apply: (g, x) => workDone(g, x, "turned"),
        ai: (g, x) =>
          g.s.chars[x.leader]?.traits.includes("craven") ? 2 : 0.1,
      },
    ],
  },
  port: {
    key: "exped-far-port",
    scene: "docks",
    quiet: 0,
    title: (g, x) => `The landing at ${name(g, x.target)}`,
    body: (g, x) =>
      `The carpenters have their timbers ashore at ${name(g, x.target)}, and ${lead(g, x)} has the plan of the wharf and the streets in a leather case.`,
    choices: [
      w(
        "port",
        "Lay out the wharf and the town",
        "The work as planned: at the odds you were shown.",
        0,
      ),
      w(
        "port",
        "Work the men hard to finish before the season turns",
        "Harder (+1), but no slower; the men won't love you for it.",
        1,
        {},
        0.5,
      ),
    ],
  },
};

/** The far end's scene for a kind. */
export function farScene(kind: ExpedKind): XScene {
  return FAR[kind];
}

/** A scene on the way that fits where the party is (one of them, on the track's dice), or none. */
export function expedScenes(g: ConquestGame, x: Expedition): XScene | null {
  const fit = ONWAY.filter(
    (sc) => !x.scenes.includes(sc.key) && (sc.fits?.(g, x) ?? true),
  );
  if (!fit.length) return null;
  const r = edice(g.s, 0x72, x.id, x.scenes.length);
  return fit[Math.floor(r.next() * fit.length)];
}

/** One of the computer's leaders decides, and the dice fall (the track's own). */
export function resolveByLeader(
  g: ConquestGame,
  x: Expedition,
  sc: XScene,
): void {
  const s = g.s;
  let best = -1;
  let bestW = -Infinity;
  sc.choices.forEach((c, i) => {
    if (c.blocked?.(g, x)) return;
    const wgt = c.ai(g, x);
    if (wgt > bestW) {
      bestW = wgt;
      best = i;
    }
  });
  if (best < 0) best = sc.quiet;
  const c = sc.choices[best];
  const p = choiceChance(g, x, c);
  const pass =
    p === null ? true : edice(s, 0x73, x.id, x.scenes.length, best).chance(p);
  const label = typeof c.label === "string" ? c.label : c.label(g, x);
  const text = c.apply(g, x, pass);
  // The far end's work tells the party itself; on the way, say what was chosen.
  if (!sc.key.startsWith("exped-far-"))
    tell(
      g,
      x,
      `${sc.title(g, x)}: ${lead(g, x)} chose to ${label.charAt(0).toLowerCase()}${label.slice(1)}. ${text}`,
    );
}

// ---------------------------------------------------------------- as a player's scenes

const xOf = (g: ConquestGame, ctx: Record<string, number>) =>
  ctx.x !== undefined ? expedById(g.s, ctx.x) : undefined;

/** Put a scene to a player (the hook, so nothing here imports the events' list). */
export function raiseScene(
  g: ConquestGame,
  life: Life,
  key: string,
  x: Expedition | null,
  ctx: Record<string, number> = {},
): void {
  raiseEvent(g, life, key, x ? { ...ctx, x: x.id } : ctx);
}

/** An expedition scene, as a player's scene. */
function asLife(sc: XScene): LifeEventDef {
  return {
    key: sc.key,
    pool: "raised",
    cooldown: 0,
    scene: sc.scene,
    title: (g, _life, ctx) => {
      const x = xOf(g, ctx);
      return x ? sc.title(g, x) : "The expedition";
    },
    body: (g, _life, ctx) => {
      const x = xOf(g, ctx);
      if (!x) return "It's over.";
      return `${sc.body(g, x)}\n\n${expedWords(g.map, x)[0].toUpperCase()}${expedWords(g.map, x).slice(1)}: ${x.men} men${x.lost ? `, ${x.lost} days lost so far` : ""}.`;
    },
    choices: sc.choices.map((c) => ({
      label: (g, _life, ctx) => {
        const x = xOf(g, ctx);
        if (!x) return typeof c.label === "string" ? c.label : "Go on";
        return typeof c.label === "string" ? c.label : c.label(g, x);
      },
      tip: (g, _life, ctx) => {
        const x = xOf(g, ctx);
        return x ? c.tip(g, x) : "";
      },
      ...(c.skill && c.dc
        ? {
            check: {
              skill: c.skill,
              dc: (
                g: ConquestGame,
                life: Life,
                ctx: Record<string, number>,
              ) => {
                const x = xOf(g, ctx);
                if (!x) return 10;
                // The party's help comes off the difficulty, so the leader's own skill gives the party's odds.
                const dc = c.dc!(g, x);
                if (c.work) return dc;
                const own = skillLevel(g.s, life, c.skill!);
                return dc - (partySkill(g.s, x, c.skill!) - own);
              },
            },
          }
        : {}),
      blocked: (g, _life, ctx) => {
        const x = xOf(g, ctx);
        return x ? (c.blocked?.(g, x) ?? null) : null;
      },
      apply: (g, _life, ctx, pass) => {
        const x = xOf(g, ctx);
        if (!x) return;
        const text = c.apply(g, x, pass);
        if (!sc.key.startsWith("exped-far-"))
          tell(g, x, text, pass ? undefined : "bad");
      },
    })),
  };
}

// ---------------------------------------------------------------- an invitation, a grant, a war party

const OTHER: LifeEventDef[] = [
  {
    key: "exped-invite",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, _life, ctx) => {
      const x = xOf(g, ctx);
      return x ? `${KINDS[x.kind].name}: will you come?` : "An expedition";
    },
    body: (g, _life, ctx) => {
      const x = xOf(g, ctx);
      if (!x) return "It's gone without you.";
      const by = g.s.chars[ctx.by];
      return `${charName(by)} is getting up ${expedWords(g.map, x)}, and asks you along.\n\nIt sets out from ${name(g, x.from)}, led by ${charName(g.s.chars[x.leader])}, with about ${x.hands} hands. ${KINDS[x.kind].text}\n\nIf you go: be at ${name(g, x.from)} when it sets out. The party carries you there and back; you share what it brings with the others who went, and half the renown its leader wins. You can leave it at any stop on the way.`;
    },
    choices: [
      {
        label: "I'll come",
        tip: "You go with the party when it sets out (be there).",
        apply: (g, life, ctx) => void answerInvite(g, life, ctx.x, true),
      },
      {
        label: "Decline",
        tip: "Thank them, and stay.",
        apply: (g, life, ctx) => void answerInvite(g, life, ctx.x, false),
      },
    ],
  },
  {
    key: "exped-grant",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "A petition for a grant",
    body: (g, _life, ctx) => {
      const a = expedOf(g.s).asks.find((y) => y.id === ctx.a);
      if (!a) return "It's been answered.";
      const x = expedById(g.s, a.x);
      const words = x ? expedWords(g.map, x) : "an expedition";
      return `${charName(g.s.chars[a.c])} asks for ${a.gold} gold from the treasury toward ${words}${a.byLetter ? " (by letter)" : ", in person"}. The treasury holds ${Math.floor(g.s.nations[a.n]?.gold ?? 0)}.\n\n${x ? KINDS[x.kind].gives : ""}${x?.kind === "raid" ? "\n\nA grant for a raid is your commission for it: whatever comes of it is the colony's, and yours." : ""}`;
    },
    choices: [
      {
        label: (g, _life, ctx) => {
          const a = expedOf(g.s).asks.find((y) => y.id === ctx.a);
          return `Grant it all (${a?.gold ?? 0} gold)`;
        },
        tip: "From the treasury, into the expedition's chest.",
        blocked: (g, _life, ctx) => {
          const a = expedOf(g.s).asks.find((y) => y.id === ctx.a);
          return a && (g.s.nations[a.n]?.gold ?? 0) < a.gold
            ? "The treasury can't"
            : null;
        },
        apply: (g, life, ctx) => void answerGrant(g, life, ctx.a, "all"),
      },
      {
        label: "Grant half",
        tip: "Half from the treasury; the rest is theirs to find.",
        apply: (g, life, ctx) => void answerGrant(g, life, ctx.a, "half"),
      },
      {
        label: "Refuse",
        tip: "The treasury has other uses.",
        apply: (g, life, ctx) => void answerGrant(g, life, ctx.a, "none"),
      },
    ],
  },
  {
    key: "exped-reprisal",
    pool: "raised",
    cooldown: 0,
    scene: "fields",
    title: (g, _life, ctx) => `A war party at ${name(g, ctx.p)}`,
    body: (g, _life, ctx) =>
      `A war party of the ${g.s.nations[ctx.n]?.name ?? "nation"} came out of the woods at dawn: barns burned at the edge of ${name(g, ctx.p)}, the cattle driven off, the outlying families running for the blockhouse. Most got there. Everyone knows why: the raid on ${name(g, ctx.from)}.`,
    choices: [
      {
        label: "Ride out after them with the militia",
        tip: "Fighting: get some of the cattle back, and a name for it (renown +3). If it goes badly, you're hurt.",
        check: { skill: "fighting", dc: 9 },
        apply: (g, life, _ctx, pass) => {
          gainXp(g, life, "fighting", 8);
          if (pass) {
            addRenown(g, life, 3);
            journal(
              g,
              life,
              "You came up with them at the ford and got half the cattle back.",
              "good",
            );
          } else {
            hurt(g, life, 10, "a skirmish with a war party");
            journal(
              g,
              life,
              "They were waiting at the ford. You came home with a wound and nothing else.",
              "bad",
            );
          }
        },
      },
      {
        label: "Help the families get what's left in",
        tip: "Neighbours remember who came (stress −4).",
        apply: (g, life) => {
          addStress(g, life, -4);
          journal(
            g,
            life,
            "You spend three days helping the burned-out families save what's left.",
            "good",
          );
        },
      },
      {
        label: "Bar the door and wait",
        tip: "Safe. It's not your quarrel. (Stress +3.)",
        apply: (g, life) => {
          addStress(g, life, 3);
        },
      },
    ],
  },
];

let paced = false;

/** The scenes, registered with the event pacing the first time they're looked up. */
export function expedEvents(): LifeEventDef[] {
  const all = [...ONWAY, ...Object.values(FAR)].map(asLife);
  if (!paced) {
    paced = true;
    registerFamily(
      "expedition",
      [...all, ...OTHER].map((d) => d.key),
      1,
    );
  }
  return [...all, ...OTHER];
}

/** The quiet course each scene takes if it's left unanswered (a choice's index). */
export function expedQuiet(): Record<string, number> {
  const out: Record<string, number> = {
    "exped-invite": 1,
    "exped-grant": 2,
    "exped-reprisal": 2,
  };
  for (const sc of [...ONWAY, ...Object.values(FAR)]) out[sc.key] = sc.quiet;
  return out;
}

/** For the tests: the scenes on the way, and the far end's. */
export const SCENES = { ONWAY, FAR };
