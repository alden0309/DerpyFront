// INTRIGUE (r15): the scenes of hearts and schemes. Someone's attentions put
// to another player; a husband or wife courted again; a child of a kept
// lover; a plot's warnings to its target, and the moment it comes; the scenes
// of a wedding day (the vows, the dowry, the breakfast, the dancing, the
// toasts, and a mishap); arriving for a gathering you've travelled to; and
// the vignettes of an evening as a guest (an introduction, gossip, a match
// proposed, a hand of loo, politics, a song...). The vignettes are drawn with
// the event pacing (each rests, and families of them rest together), and,
// like every turn at a gathering, they're only ever about the computer's
// people: other players act for themselves.
//
// Everything of the heart is between grown people, and the door closes on it.

import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import {
  gatheringById,
  GATHERINGS,
  gatherMood,
  gatherTurn,
} from "./Gatherings";
import { hooks } from "./Hooks";
import {
  betrothalOf,
  betrothedTo,
  closeKin,
  grown,
  idice,
  intrigue,
  intrigueChanged,
  secretNote,
  standing,
} from "./IntrigueCore";
import {
  acknowledge,
  learnSecret,
  npcSecret,
  startAffair,
  wouldBeAffair,
} from "./Liaisons";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  heal,
  hurt,
  journal,
  meet,
  remembers,
  setTie,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeChoice, LifeEventDef } from "./LifeEvents";
import { lifeOfChar, meOf, opinionOf, peopleHere } from "./LifeQueries";
import {
  confront,
  findOut,
  hireGuards,
  inform,
  nearestRefuge,
  PLOT,
  PLOT_METHOD_KEYS,
  schemeById,
  STRIKE_CHOICES,
  strikeMet,
} from "./Plots";
import { ageOf, charName } from "./Queries";
import { rumour } from "./Rumours";
import { fondly, keepCost } from "./Seduction";
import type { Character, Gathering, GatheringKind, Life, Skill } from "./Types";
import {
  betrothalById,
  dowryOf,
  jilt,
  settleDowry,
  solemnize,
} from "./Weddings";

const who = (g: ConquestGame, ctx: LCtx): Character | undefined =>
  g.s.chars[ctx.c];
const name = (g: ConquestGame, ctx: LCtx) => charName(who(g, ctx));
const first = (g: ConquestGame, ctx: LCtx) => who(g, ctx)?.first ?? "Someone";
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;
const npcOf = (g: ConquestGame, ctx: LCtx) => {
  const c = who(g, ctx);
  return c?.alive && !lifeOfChar(g.s, c.id) ? c : undefined;
};

// ---------------------------------------------------------------- a turn at a gathering

interface TurnFx {
  mood?: number;
  op?: number;
  why?: string;
  renown?: number;
  stress?: number;
  coins?: number;
  health?: number;
  xp?: Partial<Record<Skill, number>>;
  line?: string;
}

/** A turn's effects, then on to the next. */
function step(g: ConquestGame, life: Life, ctx: LCtx, f: TurnFx): void {
  const c = npcOf(g, ctx);
  if (f.op && c)
    remembers(g, life, g.char(c.id), f.why ?? "At the gathering", f.op, 2);
  if (f.renown) addRenown(g, life, f.renown);
  if (f.stress) addStress(g, life, f.stress);
  if (f.coins) earn(g, life, f.coins);
  if (f.health) {
    if (f.health > 0) heal(g, life, f.health);
    else hurt(g, life, -f.health, "misadventure at a gathering");
  }
  for (const [k, v] of Object.entries(f.xp ?? {}))
    gainXp(g, life, k as Skill, v ?? 0);
  if (f.mood || f.line) gatherMood(g, ctx.g, f.mood ?? 0, f.line);
  gatherTurn(g, life, ctx.g);
}

function venue(g: ConquestGame, _life: Life, ctx: LCtx): string {
  return gatheringById(g.s, ctx.g)?.venue ?? "home";
}

function sub(
  key: string,
  title: string | ((g: ConquestGame, life: Life, ctx: LCtx) => string),
  body: (g: ConquestGame, life: Life, ctx: LCtx) => string,
  choices: LifeChoice[],
  cooldown = 0,
): LifeEventDef {
  return {
    key: `gather-${key}`,
    pool: "raised",
    cooldown,
    scene: venue,
    title,
    body,
    choices,
  };
}

// ---------------------------------------------------------------- the wedding day

const wedOf = (g: ConquestGame, ctx: LCtx) => {
  const gat = gatheringById(g.s, ctx.g);
  return gat?.bet !== undefined ? betrothalById(g.s, gat.bet) : undefined;
};
const spouseTo = (g: ConquestGame, life: Life, ctx: LCtx) => {
  const b = wedOf(g, ctx);
  return b ? g.s.chars[betrothedTo(b, life.c)] : undefined;
};

/** The vows said: married; a word to the other (a played husband or wife is married too). */
function vows(g: ConquestGame, life: Life, ctx: LCtx, f: TurnFx): void {
  const b = wedOf(g, ctx);
  if (b) solemnize(g, b);
  const sp = spouseTo(g, life, ctx);
  if (sp && !lifeOfChar(g.s, sp.id) && f.op)
    remembers(g, life, g.char(sp.id), f.why ?? "Our wedding day", f.op, 0);
  step(g, life, ctx, { ...f, op: 0 });
}

const WEDDING_SCENES: LifeEventDef[] = [
  sub(
    "w-vows",
    "The vows",
    (g, life, ctx) => {
      const sp = spouseTo(g, life, ctx);
      const gat = gatheringById(g.s, ctx.g);
      const fire = gat?.venue === "councilfire" || gat?.venue === "village";
      return fire
        ? `The families sit in a ring at the fire. The gifts have been laid out and looked at, and approved; the old women have had their say. Now ${sp?.first ?? "your betrothed"}'s blanket and yours are to be joined. Everyone is waiting for you.`
        : `The church is full, and smells of wet wool and lilies. ${sp?.first ?? "Your betrothed"} is beside you; the minister opens the book; somewhere behind you a child asks loudly whether this is the part where they kiss. The words are yours to say.`;
    },
    [
      {
        label: "Say the words, and mean every one",
        tip: "Married. They'll remember how you said it (+15), and so will you.",
        apply: (g, life, ctx) =>
          vows(g, life, ctx, {
            op: 15,
            why: "Our wedding day",
            stress: -8,
            mood: 1,
            line: "The vows were said, and meant.",
          }),
      },
      {
        label: "Say them, with a wink at the room",
        tip: "Married, and the congregation laughs. The minister doesn't (+1 renown).",
        apply: (g, life, ctx) =>
          vows(g, life, ctx, {
            op: 8,
            why: "Our wedding day",
            renown: 1,
            mood: 2,
            line: "Someone at the altar winked at the congregation.",
          }),
      },
      {
        label: "Stumble over them",
        tip: "Married all the same; nerves are allowed. A little stress.",
        apply: (g, life, ctx) =>
          vows(g, life, ctx, {
            op: 10,
            why: "Our wedding day",
            stress: 3,
            line: "The vows came out in the wrong order, and nobody minded.",
          }),
      },
      {
        label: "Bolt for the door",
        tip: "Jilted at the altar: they'll never forgive it, and the town will never forget (−4 renown).",
        // Once the vows are said (the other said theirs first), it's done.
        blocked: (g, life, ctx) =>
          wedOf(g, ctx)?.vows ? "The vows are said" : null,
        apply: (g, life, ctx) => {
          const b = wedOf(g, ctx);
          if (b) jilt(g, life, b.id, true);
          gatherMood(
            g,
            ctx.g,
            -5,
            "The wedding ended with an empty place at the altar.",
          );
          gatherTurn(g, life, ctx.g);
        },
      },
    ],
  ),
  sub(
    "w-dowry",
    "The settlement",
    (g, life, ctx) => {
      const sp = spouseTo(g, life, ctx);
      const n = sp ? dowryOf(g.s, sp) : 0;
      const c = who(g, ctx);
      const kin = c && sp && c.id !== sp.id;
      return n > 0
        ? `After the vows, in the vestry, ${kin ? `${charName(c)}, ${sp!.first}'s ${c!.female ? "mother" : "father"},` : (sp?.first ?? "the family")} counts out the marriage portion on the table: ${n} coins, in a mixture of dollars, pieces of eight and paper of doubtful value. Everyone watches your face.`
        : `After the vows, ${kin ? charName(c) : (sp?.first ?? "the family")} brings out the marriage portion: a chest of linen, a feather bed, two pewter plates and a cow. There's no money to speak of. Everyone watches your face.`;
    },
    [
      {
        label: "Accept it with thanks",
        tip: (g, life, ctx) => {
          const sp = spouseTo(g, life, ctx);
          const n = sp ? dowryOf(g.s, sp) : 0;
          return n
            ? `The portion, ${n} coins; the family thinks well of you (+6).`
            : "Gracious: the family thinks well of you (+8).";
        },
        apply: (g, life, ctx) => {
          const b = wedOf(g, ctx);
          const n = b ? settleDowry(g, life, b, 1) : 0;
          step(g, life, ctx, {
            op: n ? 6 : 8,
            why: "Took our portion graciously",
            line: n
              ? `A marriage portion of ${n} coins was settled.`
              : undefined,
          });
        },
      },
      {
        label: "Press for more",
        tip: "Persuasion: half again; fail, and they give only what was agreed, and resent it (−12).",
        check: { skill: "persuasion", dc: 7 },
        blocked: (g, life, ctx) => {
          const sp = spouseTo(g, life, ctx);
          return sp && dowryOf(g.s, sp) > 0
            ? null
            : "There's nothing to press for";
        },
        apply: (g, life, ctx, pass) => {
          const b = wedOf(g, ctx);
          const n = b ? settleDowry(g, life, b, pass ? 1.5 : 1) : 0;
          step(
            g,
            life,
            ctx,
            pass
              ? {
                  op: -4,
                  why: "Haggled over our daughter's portion",
                  line: `A marriage portion of ${n} coins, after some haggling.`,
                }
              : {
                  op: -12,
                  why: "Haggled over our daughter's portion",
                  stress: 2,
                },
          );
        },
      },
      {
        label: "Waive it: give it back to them",
        tip: "Generous: the family won't forget it (+18), and the town hears (+1 renown).",
        apply: (g, life, ctx) => {
          const b = wedOf(g, ctx);
          if (b) {
            b.dowry = true;
            intrigueChanged(g);
          }
          step(g, life, ctx, {
            op: 18,
            why: "Gave back the marriage portion",
            renown: 1,
            mood: 1,
            line: "The marriage portion was handed back, to general astonishment.",
          });
        },
      },
    ],
  ),
  sub(
    "w-feast",
    "The wedding breakfast",
    (g, life, ctx) =>
      `The tables groan: a ham, a goose, a great pie, puddings, and a bride-cake with a ring baked in it. ${cap(name(g, ctx))} is on ${his(who(g, ctx))} third plate, and the punch is going round faster than the plates.`,
    [
      {
        label: "Cut the bride-cake yourself",
        tip: "Craft: a clean cut and the ring found by the right person; fail, and it's crumbs everywhere.",
        check: { skill: "craft", dc: 4 },
        apply: (g, life, ctx, pass) =>
          step(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 0.5,
                  line: "The bride-cake was cut, and the ring went to the bridesmaid.",
                }
              : {
                  mood: 0,
                  stress: 2,
                  line: "The bride-cake fell apart, deliciously.",
                },
          ),
      },
      {
        label: "Go round every table",
        tip: "A word for everyone: they all think the better of you (+6).",
        apply: (g, life, ctx) =>
          step(g, life, ctx, {
            op: 6,
            why: "A word for everyone at the wedding",
            mood: 1,
            stress: 2,
          }),
      },
      {
        label: "Sit and eat: it's your day",
        tip: "Rest, and the best of the goose (−4 stress).",
        apply: (g, life, ctx) => step(g, life, ctx, { stress: -4 }),
      },
    ],
  ),
  sub(
    "w-dance",
    "The dancing",
    (g, life, ctx) =>
      `The fiddler tunes up, the tables go against the wall, and everyone looks at the two of you: the first dance is yours. ${cap(first(g, ctx))} holds out a hand.`,
    [
      {
        label: "Lead off, and dance till the candles gutter",
        tip: "Persuasion (and stamina): the room follows you; fail, and you tread on every toe.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, ctx, pass) =>
          step(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  op: 8,
                  why: "Danced at our wedding",
                  renown: 1,
                  line: "The couple danced every dance.",
                }
              : {
                  mood: 1,
                  stress: 2,
                  line: "The first dance was enthusiastic.",
                },
          ),
      },
      {
        label: "One slow dance, then sit with the old folk",
        tip: "Sweet, and the grandmothers approve (+5).",
        apply: (g, life, ctx) =>
          step(g, life, ctx, {
            op: 5,
            why: "A slow dance at our wedding",
            mood: 1,
          }),
      },
    ],
  ),
  sub(
    "w-toasts",
    "Toasts to the couple",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} is on ${his(who(g, ctx))} feet, glass high, with a toast that has clearly been rehearsed, and a story about you that clearly hasn't.`,
    [
      {
        label: "Answer it with a better one",
        tip: "Persuasion: the room roars; fail, and it's theirs that's remembered.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) =>
          step(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 1,
                  line: "The toasts went on past midnight.",
                }
              : {
                  stress: 3,
                  line: "A story was told at the couple's expense.",
                },
          ),
      },
      {
        label: "Raise your glass to them",
        tip: "Gracious (+8).",
        apply: (g, life, ctx) =>
          step(g, life, ctx, {
            op: 8,
            why: "Raised a glass to me at the wedding",
            mood: 1,
          }),
      },
    ],
  ),
  sub(
    "w-objection",
    "Just cause",
    (g, life, ctx) =>
      `"If any here can show just cause why these two may not lawfully be joined together..." There's the usual silence, and then there isn't: ${name(g, ctx)} stands up at the back. Something about a promise, years ago, and a debt; it isn't clear, and it doesn't matter. Every head has turned.`,
    [
      {
        label: "Answer it, calmly",
        tip: "Persuasion: the minister is satisfied and the room is on your side; fail, and it hangs over the day.",
        check: { skill: "persuasion", dc: 6 },
        apply: (g, life, ctx, pass) =>
          step(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 1,
                  renown: 1,
                  line: "An objection was answered, and the wedding went on.",
                }
              : {
                  mood: -1,
                  stress: 6,
                  line: "An objection was made, and not quite answered.",
                },
          ),
      },
      {
        label: "Laugh it off",
        tip: "The room laughs with you, mostly.",
        apply: (g, life, ctx) => step(g, life, ctx, { mood: 0, stress: 2 }),
      },
      {
        label: "Have them put out",
        tip: "Order restored; they won't forgive it (−15).",
        apply: (g, life, ctx) =>
          step(g, life, ctx, {
            op: -15,
            why: "Had me put out of a wedding",
            mood: -1,
            line: "An objector was put out of the church.",
          }),
      },
    ],
  ),
  sub(
    "w-uncle",
    "Uncle in his cups",
    (g, life, ctx) =>
      `${cap(name(g, ctx))} has found the punch, and then the rum the punch was made with, and is now standing on a bench explaining to the room what marriage is really like, with particulars.`,
    [
      {
        label: "Get him down, gently",
        tip: "Persuasion: he goes quietly, and thanks you in the morning; fail, and he goes loudly.",
        check: { skill: "persuasion", dc: 5 },
        apply: (g, life, ctx, pass) =>
          step(
            g,
            life,
            ctx,
            pass
              ? { op: 6, why: "Saw me safe at the wedding", mood: 1 }
              : { mood: -1, stress: 3, line: "A guest had to be carried out." },
          ),
      },
      {
        label: "Join him on the bench",
        tip: "Two can play: the room loves it, the minister leaves (+1 renown).",
        apply: (g, life, ctx) =>
          step(g, life, ctx, {
            mood: 2,
            renown: 1,
            stress: -2,
            line: "The happy couple sang a duet on a bench.",
          }),
      },
      {
        label: "Pretend not to see",
        tip: "It's someone else's problem.",
        apply: (g, life, ctx) => step(g, life, ctx, { mood: -1 }),
      },
    ],
  ),
  sub(
    "w-rain",
    "Rain",
    (g, life, ctx) =>
      `The morning was fine. Now the heavens have opened, the road is a river, and ${first(g, ctx)}'s best shoes are in it.`,
    [
      {
        label: "Carry them across the mud",
        tip: "Fighting (strength, mostly): gallant; fail, and you both go in.",
        check: { skill: "fighting", dc: 4 },
        apply: (g, life, ctx, pass) =>
          step(
            g,
            life,
            ctx,
            pass
              ? {
                  mood: 2,
                  renown: 0.5,
                  line: "One of the couple was carried over the mud by the other.",
                }
              : {
                  mood: 1,
                  stress: 2,
                  line: "The couple arrived muddy, and laughing.",
                },
          ),
      },
      {
        label: "Wait it out in the porch",
        tip: "Late, but dry.",
        apply: (g, life, ctx) => step(g, life, ctx, { stress: 1 }),
      },
      {
        label: '"Rain on the day is lucky"',
        tip: "Everyone pretends to believe it.",
        apply: (g, life, ctx) => step(g, life, ctx, { mood: 1 }),
      },
    ],
  ),
];

// ---------------------------------------------------------------- the vignettes of an evening

export interface Vignette {
  key: string;
  family: string;
  /** Gatherings it can come at ("any" for all). */
  kinds: GatheringKind[] | "any";
  weight?: number;
  /** Whom it's about (one of the computer's people who came, or in town), or null if it can't happen. */
  figure: (
    g: ConquestGame,
    life: Life,
    gat: Gathering,
    here: Character[],
  ) => number | null;
  def: LifeEventDef;
}

const COLONIST: GatheringKind[] = [
  "dinner",
  "feast",
  "ball",
  "cards",
  "social",
  "frolic",
  "raising",
  "wedding",
  "christening",
  "hunt",
];
const NATIVE: GatheringKind[] = ["nfeast", "dance", "council", "greencorn"];

function anyOf(gat: Gathering, xs: Character[], salt: number): number | null {
  return xs.length
    ? xs[Math.abs(gat.id * 31 + gat.played.length * 7 + salt) % xs.length].id
    : null;
}
const adults = (g: ConquestGame, here: Character[]) =>
  here.filter((c) => ageOf(g.s, c) >= 18);

export const VIGNETTES: Vignette[] = [
  {
    key: "v-intro",
    family: "vg-people",
    kinds: "any",
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        adults(g, here).filter(
          (c) => !life.met.includes(c.id) || standing(g.s, c) >= 4,
        ),
        1,
      ),
    def: sub(
      "v-intro",
      "An introduction",
      (g, life, ctx) =>
        `The host steers you across the room by the elbow: "You must know ${name(g, ctx)}." ${cap(he(who(g, ctx)))} looks you up and down, the way people do who are deciding whether you're worth the evening.`,
      [
        {
          label: "Make yourself agreeable",
          tip: "Persuasion: they warm to you (+12); fail, and you talk too much (−3).",
          check: { skill: "persuasion", dc: 6 },
          apply: (g, life, ctx, pass) => {
            meet(g, life, ctx.c);
            step(
              g,
              life,
              ctx,
              pass
                ? { op: 12, why: "Good company at a gathering" }
                : { op: -3, why: "Talked too much" },
            );
          },
        },
        {
          label: "Talk business",
          tip: "Trade: a useful acquaintance (+6, and a little trade learned).",
          apply: (g, life, ctx) => {
            meet(g, life, ctx.c);
            step(g, life, ctx, {
              op: 6,
              why: "Talked business at a gathering",
              xp: { trade: 3 },
            });
          },
        },
        {
          label: "Ask after their family",
          tip: "Safe and kind (+6).",
          apply: (g, life, ctx) => {
            meet(g, life, ctx.c);
            step(g, life, ctx, { op: 6, why: "Asked after my family" });
          },
        },
      ],
      200,
    ),
  },
  {
    key: "v-gossip",
    family: "vg-talk",
    kinds: "any",
    figure: (g, life, gat, here) => {
      // Someone of the town with a secret worth knowing.
      const folk = peopleHere(g.s, gat.prov, life).filter(
        (c) =>
          !lifeOfChar(g.s, c.id) &&
          !!npcSecret(g.s, c) &&
          !(life.secrets ?? []).some((x) => x.of === c.id),
      );
      return folk.length ? anyOf(gat, adults(g, here), 2) : null;
    },
    def: sub(
      "v-gossip",
      "Gossip in a corner",
      (g, life, ctx) =>
        `${cap(name(g, ctx))} draws you into a window seat with a glass and a look. "You didn't hear it from me," ${he(who(g, ctx))} begins, which means everyone will.`,
      [
        {
          label: "Listen closely",
          tip: "Learn someone's secret. Knowledge is power, and sometimes money.",
          apply: (g, life, ctx) => {
            const gat = gatheringById(g.s, ctx.g);
            const folk = gat
              ? peopleHere(g.s, gat.prov, life).filter(
                  (c) =>
                    c.id !== ctx.c &&
                    !lifeOfChar(g.s, c.id) &&
                    !!npcSecret(g.s, c) &&
                    !(life.secrets ?? []).some((x) => x.of === c.id),
                )
              : [];
            const t = folk.length
              ? folk[idice(g).int(0, folk.length - 1)]
              : undefined;
            const found = t ? learnSecret(g, life, t) : null;
            if (found) journal(g, life, `Gossip at the gathering: ${found}.`);
            step(g, life, ctx, { op: 4, why: "A good listener" });
          },
        },
        {
          label: "Trade a story of your own",
          tip: "Stealth: you learn more than you give (+6); fail, and your story goes round the room by supper.",
          check: { skill: "stealth", dc: 6 },
          apply: (g, life, ctx, pass) => {
            if (pass) {
              const gat = gatheringById(g.s, ctx.g);
              const folk = gat
                ? peopleHere(g.s, gat.prov, life).filter(
                    (c) =>
                      c.id !== ctx.c &&
                      !lifeOfChar(g.s, c.id) &&
                      !!npcSecret(g.s, c) &&
                      !(life.secrets ?? []).some((x) => x.of === c.id),
                  )
                : [];
              const t = folk.length
                ? folk[idice(g).int(0, folk.length - 1)]
                : undefined;
              const found = t ? learnSecret(g, life, t) : null;
              if (found) journal(g, life, `Gossip at the gathering: ${found}.`);
            }
            step(
              g,
              life,
              ctx,
              pass
                ? { op: 6, why: "Shared a confidence" }
                : {
                    renown: -1,
                    stress: 2,
                    line: "A story went round the room.",
                  },
            );
          },
        },
        {
          label: "Change the subject",
          tip: "Above all that (+0.5 renown, for the honest).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { renown: 0.5, op: -2, why: "Wouldn't gossip" }),
        },
      ],
      240,
    ),
  },
  {
    key: "v-match",
    family: "vg-people",
    kinds: [...COLONIST, ...NATIVE],
    figure: (g, life, gat, here) => {
      const me = meOf(g.s, life);
      if (!me || ageOf(g.s, me) < 18) return null;
      if (me.spouse >= 0 || betrothalOf(g.s, me.id)) {
        // A grown child of yours, then.
        const kid = me.children
          .map((k) => g.s.chars[k])
          .find(
            (k) =>
              k?.alive && k.spouse < 0 && ageOf(g.s, k) >= 18 && !k.edu?.now,
          );
        if (!kid) return null;
      }
      const older = adults(g, here).filter((c) => ageOf(g.s, c) >= 35);
      return anyOf(gat, older.length ? older : adults(g, here), 3);
    },
    def: sub(
      "v-match",
      "A match proposed",
      (g, life, ctx) => {
        const me = meOf(g.s, life)!;
        const single = me.spouse < 0 && !betrothalOf(g.s, me.id);
        return single
          ? `${cap(name(g, ctx))} has been watching you all evening, with the look of someone who arranges things. "You know, there's someone here you ought to meet. A good family, and no fool."`
          : `${cap(name(g, ctx))} sits down beside you with the air of someone who arranges things. "Your child is grown, and still unmarried. Now, I know a family..."`;
      },
      [
        {
          label: "Be introduced",
          tip: "Meet someone free to marry: they'll think a little better of you (+10). Court them from their card.",
          apply: (g, life, ctx) => {
            const me = meOf(g.s, life)!;
            const gat = gatheringById(g.s, ctx.g);
            const single = me.spouse < 0 && !betrothalOf(g.s, me.id);
            const pool = gat
              ? peopleHere(g.s, gat.prov, life).filter(
                  (c) =>
                    !lifeOfChar(g.s, c.id) &&
                    c.spouse < 0 &&
                    grown(g.s, c) &&
                    (single
                      ? c.female !== me.female &&
                        !closeKin(g.s, me, c) &&
                        Math.abs(ageOf(g.s, c) - ageOf(g.s, me)) <= 15
                      : ageOf(g.s, c) <= 40),
                )
              : [];
            const m = pool.length
              ? pool[idice(g).int(0, pool.length - 1)]
              : undefined;
            if (m && single) {
              meet(g, life, m.id);
              remembers(
                g,
                life,
                g.char(m.id),
                "Introduced at a gathering",
                10,
                2,
              );
              journal(
                g,
                life,
                `You're introduced to ${charName(m)} (${ageOf(g.s, m)}). The match is there to be made, if you want it: court them from their card.`,
                "good",
              );
            } else if (m) {
              meet(g, life, m.id);
              journal(
                g,
                life,
                `${charName(m)} is suggested for your child. Nothing is settled.`,
              );
            } else
              journal(
                g,
                life,
                "The match, it turns out, was married last spring.",
              );
            step(g, life, ctx, { op: 6, why: "Let me make a match" });
          },
        },
        {
          label: "Thank them, and dance away",
          tip: "Politely not.",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: -2, why: "Wouldn't be matched" }),
        },
      ],
      300,
    ),
  },
  {
    key: "v-loo",
    family: "vg-play",
    kinds: ["dinner", "feast", "ball", "social", "wedding", "christening"],
    figure: (g, life, gat, here) => anyOf(gat, adults(g, here), 4),
    def: sub(
      "v-loo",
      "A hand of loo",
      (g, life, ctx) =>
        `In the back room a card table is set up, and ${name(g, ctx)} is dealing. "Shilling a point, and loo is the pool. Sit down, sit down."`,
      [
        {
          label: "Play (3 coins)",
          tip: "Trade (and a straight face): win 6; lose the 3.",
          check: { skill: "trade", dc: 6 },
          blocked: (g, life) => poor(life, 3),
          apply: (g, life, ctx, pass) => {
            spend(g, life, 3);
            step(
              g,
              life,
              ctx,
              pass
                ? {
                    coins: 6,
                    op: -2,
                    why: "Took my money at loo",
                    line: "Fortunes changed hands at the card table.",
                  }
                : { op: 3, why: "Lost to me at loo", stress: 2 },
            );
          },
        },
        {
          label: "Watch, and learn who cheats",
          tip: "Stealth: you learn something about them; fail, and they see you watching.",
          check: { skill: "stealth", dc: 6 },
          apply: (g, life, ctx, pass) => {
            const c = npcOf(g, ctx);
            const found = pass && c ? learnSecret(g, life, c) : null;
            if (found) journal(g, life, `At the card table: ${found}.`);
            step(
              g,
              life,
              ctx,
              pass
                ? { xp: { stealth: 3 } }
                : { op: -6, why: "Watched me at cards" },
            );
          },
        },
        {
          label: "Your purse is your own",
          tip: "No.",
          apply: (g, life, ctx) => step(g, life, ctx, {}),
        },
      ],
      200,
    ),
  },
  {
    key: "v-politics",
    family: "vg-talk",
    kinds: COLONIST,
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        adults(g, here).filter((c) => standing(g.s, c) >= 3),
        5,
      ),
    def: sub(
      "v-politics",
      "Talk turns to the assembly",
      (g, life, ctx) =>
        `Over the port, ${name(g, ctx)} has opinions about the governor, the assembly, the price of land and the impudence of the lower sort. ${cap(he(who(g, ctx)))} turns to you: "And where do you stand?"`,
      [
        {
          label: "Speak for the country, against the governor's friends",
          tip: "Persuasion: they're impressed, and it's repeated (+1 renown); fail, and you're thought a hothead.",
          check: { skill: "persuasion", dc: 7 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { renown: 1, op: 4, why: "Spoke well over the port" }
                : { op: -6, why: "A hothead", stress: 2 },
            ),
        },
        {
          label: "Say nothing useful, charmingly",
          tip: "A diplomat (+4).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: 4, why: "Pleasant company" }),
        },
        {
          label: "Ask what they want, and listen",
          tip: "You learn how the land lies (+6, a little persuasion).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, {
              op: 6,
              why: "Listened to me",
              xp: { persuasion: 3 },
            }),
        },
      ],
      200,
    ),
  },
  {
    key: "v-song",
    family: "vg-play",
    kinds: [...COLONIST, "nfeast", "dance"],
    figure: (g, life, gat, here) => anyOf(gat, adults(g, here), 6),
    def: sub(
      "v-song",
      "A song!",
      (g, life, ctx) =>
        `The fiddler has stopped for a drink, and ${name(g, ctx)} calls out, loud enough for everyone: "A song from our friend here! I hear you have a voice." You did not know you had a reputation.`,
      [
        {
          label: "Sing",
          tip: "Persuasion: the room joins the chorus (+1 renown); fail, and they're kind about it.",
          check: { skill: "persuasion", dc: 5 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { mood: 2, renown: 1, stress: -3, line: "There was singing." }
                : { mood: 1, stress: 3, line: "Someone sang, bravely." },
            ),
        },
        {
          label: "A recitation instead",
          tip: "Letters: a ballad, or something from Milton; fail, and you forget the third verse.",
          check: { skill: "letters", dc: 6 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { mood: 1, renown: 1, line: "A recitation was much admired." }
                : { stress: 3 },
            ),
        },
        {
          label: "Plead a sore throat",
          tip: "Nobody believes you.",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: -2, why: "Wouldn't sing" }),
        },
      ],
      180,
    ),
  },
  {
    key: "v-spill",
    family: "vg-mishap",
    kinds: ["dinner", "feast", "ball", "wedding", "christening", "social"],
    figure: (g, life, gat, here) => anyOf(gat, adults(g, here), 7),
    def: sub(
      "v-spill",
      "Claret on silk",
      (g, life, ctx) =>
        `Someone jogs your elbow, and a full glass of claret goes down ${name(g, ctx)}'s best ${who(g, ctx)?.female ? "silk" : "waistcoat"}. There is a silence. Then ${he(who(g, ctx))} looks at you.`,
      [
        {
          label: "Offer to pay for the cleaning (2 coins)",
          tip: "Handsome of you (+8).",
          blocked: (g, life) => poor(life, 2),
          apply: (g, life, ctx) => {
            spend(g, life, 2);
            step(g, life, ctx, { op: 8, why: "Paid for my ruined clothes" });
          },
        },
        {
          label: "Laugh it off together",
          tip: "Persuasion: they laugh too; fail, and they don't (−6).",
          check: { skill: "persuasion", dc: 5 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { op: 4, why: "Laughed it off with me", mood: 1 }
                : { op: -6, why: "Ruined my clothes" },
            ),
        },
        {
          label: "Blame whoever jogged you",
          tip: "Not your fault, strictly. They're not convinced (−4).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: -4, why: "Ruined my clothes" }),
        },
      ],
      300,
    ),
  },
  {
    key: "v-rival",
    family: "vg-talk",
    kinds: "any",
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        here.filter(
          (c) =>
            life.ties[c.id] === "rival" ||
            life.ties[c.id] === "nemesis" ||
            opinionOf(g.s, c, life).total <= -20,
        ),
        8,
      ),
    def: sub(
      "v-rival",
      "Across a crowded room",
      (g, life, ctx) =>
        `${cap(name(g, ctx))} is here. Of course ${he(who(g, ctx))} is. ${cap(he(who(g, ctx)))} has seen you too, and raises a glass, very slightly.`,
      [
        {
          label: "Go over and make peace",
          tip: "Persuasion: bygones are bygones (+25, a rival no more); fail, and it's worse.",
          check: { skill: "persuasion", dc: 8 },
          apply: (g, life, ctx, pass) => {
            const c = npcOf(g, ctx);
            if (pass && c && life.ties[c.id] === "rival")
              setTie(g, life, c.id, null);
            step(
              g,
              life,
              ctx,
              pass
                ? {
                    op: 25,
                    why: "Made peace at a gathering",
                    mood: 1,
                    line: "Two old enemies were seen shaking hands.",
                  }
                : { op: -8, why: "Patronised me at a gathering", stress: 3 },
            );
          },
        },
        {
          label: "Raise yours back",
          tip: "Civil. Nothing changes.",
          apply: (g, life, ctx) => step(g, life, ctx, {}),
        },
        {
          label: "Needle them in front of everyone",
          tip: "The room enjoys it (+1 renown); they don't (−12).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, {
              op: -12,
              why: "Made sport of me",
              renown: 1,
              mood: -1,
              line: "Barbs were traded across the room.",
            }),
        },
      ],
      240,
    ),
  },
  {
    key: "v-thanks",
    family: "vg-people",
    kinds: "any",
    weight: 0.6,
    figure: (g, life, gat) => {
      const host = g.s.chars[gat.host];
      return host?.alive && host.id !== life.c && !lifeOfChar(g.s, host.id)
        ? host.id
        : null;
    },
    def: sub(
      "v-thanks",
      "Taking your leave",
      (g, life, ctx) =>
        `The candles are low and the coats are being found. ${cap(name(g, ctx))}, your host, is at the door, seeing everyone off with the fixed smile of the very tired.`,
      [
        {
          label: "A small present for the house (2 coins)",
          tip: "A bottle, a book, a ribbon for the daughters: remembered (+10).",
          blocked: (g, life) => poor(life, 2),
          apply: (g, life, ctx) => {
            spend(g, life, 2);
            step(g, life, ctx, { op: 10, why: "A present for the house" });
          },
        },
        {
          label: "Warm thanks",
          tip: "Proper (+5).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: 5, why: "Thanked me warmly" }),
        },
        {
          label: "Slip away without a word",
          tip: "The French way; noticed (−3).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: -3, why: "Left without a word" }),
        },
      ],
      120,
    ),
  },
  {
    key: "v-wager",
    family: "vg-play",
    kinds: ["feast", "hunt", "frolic", "raising", "cards", "dinner"],
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        adults(g, here).filter((c) => !c.female),
        9,
      ),
    def: sub(
      "v-wager",
      "A wager",
      (g, life, ctx) =>
        `${cap(name(g, ctx))} bets anyone a crown that ${he(who(g, ctx))} can lift the end of the cart with one hand, or drink a quart without stopping, or name every governor since the charter. ${cap(his(who(g, ctx)))} eye falls on you.`,
      [
        {
          label: "Take the bet (2 coins)",
          tip: "Win 4, lose 2: it's a fair chance, more or less.",
          blocked: (g, life) => poor(life, 2),
          apply: (g, life, ctx) => {
            spend(g, life, 2);
            const win = idice(g).chance(0.5);
            step(
              g,
              life,
              ctx,
              win
                ? {
                    coins: 4,
                    op: -2,
                    why: "Won my crown",
                    line: "A wager was won.",
                  }
                : {
                    op: 4,
                    why: "Lost a bet to me",
                    line: "A wager was lost, cheerfully.",
                  },
            );
          },
        },
        {
          label: "Bet you can do it better",
          tip: "Fighting (or nerve): the crowd's on your side (+1 renown); fail, and you're the joke.",
          check: { skill: "fighting", dc: 6 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { renown: 1, mood: 2, op: 5, why: "A good sport" }
                : { renown: -0.5, stress: 3, mood: 1 },
            ),
        },
        {
          label: "Decline",
          tip: "Sensible, and a little dull.",
          apply: (g, life, ctx) => step(g, life, ctx, {}),
        },
      ],
      240,
    ),
  },
  {
    key: "v-kitchen",
    family: "vg-people",
    kinds: [
      "feast",
      "frolic",
      "raising",
      "wedding",
      "christening",
      "funeral",
      "nfeast",
      "greencorn",
    ],
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        adults(g, here).filter((c) => c.female),
        10,
      ),
    def: sub(
      "v-kitchen",
      "In the kitchen",
      (g, life, ctx) =>
        `The kitchen is where the real gathering is: ${name(g, ctx)} and the other women at the fire, the pies, the gossip and the good rum. A space is made for you on the settle.`,
      [
        {
          label: "Lend a hand",
          tip: "Craft: welcome (+8, and the best of the pie); fail, and you're shooed out.",
          check: { skill: "craft", dc: 4 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { op: 8, why: "Helped in the kitchen", stress: -3 }
                : { op: -2, why: "Got under our feet" },
            ),
        },
        {
          label: "Just listen",
          tip: "You learn the town's news (−2 stress).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, {
              stress: -2,
              op: 3,
              why: "Good company by the fire",
            }),
        },
      ],
      240,
    ),
  },
  {
    key: "v-will",
    family: "vg-talk",
    kinds: ["funeral"],
    figure: (g, life, gat, here) => anyOf(gat, adults(g, here), 11),
    def: sub(
      "v-will",
      "The will",
      (g, life, ctx) =>
        `After the burying, back at the house, ${name(g, ctx)} murmurs that the will has been read, and nobody is pleased with it, and some people are very much less pleased than others.`,
      [
        {
          label: "Hear them out",
          tip: "A sympathetic ear (+8).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: 8, why: "Heard me out at the burying" }),
        },
        {
          label: "Speak well of the dead",
          tip: "Persuasion: the family is grateful, and calmer; fail, and you've taken a side.",
          check: { skill: "persuasion", dc: 5 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? {
                    mood: 2,
                    renown: 0.5,
                    line: "Kind words were said of the dead.",
                  }
                : { op: -4, why: "Took sides over the will" },
            ),
        },
      ],
      300,
    ),
  },
  {
    key: "v-pipe",
    family: "vg-talk",
    kinds: NATIVE,
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        adults(g, here).filter(
          (c) =>
            c.role === "sachem" || c.role === "elder" || ageOf(g.s, c) >= 45,
        ),
        12,
      ),
    def: sub(
      "v-pipe",
      "The pipe comes round",
      (g, life, ctx) =>
        `The pipe goes round the fire, each taking it in turn, and each saying a little or nothing. It comes to you from ${name(g, ctx)}'s hands. Everyone waits to see what you'll do with it.`,
      [
        {
          label: "Speak, briefly and well",
          tip: "Persuasion: the elders note it (+1 renown); fail, and you've said too much.",
          check: { skill: "persuasion", dc: 6 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { renown: 1, op: 8, why: "Spoke well at the fire", mood: 1 }
                : { op: -4, why: "Said too much at the fire" },
            ),
        },
        {
          label: "Smoke, and pass it on in silence",
          tip: "Respectful (+5).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: 5, why: "Respectful at the fire" }),
        },
      ],
      200,
    ),
  },
  {
    key: "v-elder",
    family: "vg-people",
    kinds: NATIVE,
    figure: (g, life, gat, here) =>
      anyOf(
        gat,
        adults(g, here).filter((c) => ageOf(g.s, c) >= 50),
        13,
      ),
    def: sub(
      "v-elder",
      "An old story",
      (g, life, ctx) =>
        `Late, when the young have gone off to dance, ${name(g, ctx)} begins a story: the old time, the first people, the time the ice came. It is long, and the fire burns low, and nobody leaves.`,
      [
        {
          label: "Ask to hear it again another night",
          tip: "They're pleased to be asked (+10).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, {
              op: 10,
              why: "Wanted to hear my stories",
              stress: -3,
            }),
        },
        {
          label: "Tell one of your own in return",
          tip: "Letters: a good story for a good story (+1 renown); fail, and yours is thin beside it.",
          check: { skill: "letters", dc: 6 },
          apply: (g, life, ctx, pass) =>
            step(
              g,
              life,
              ctx,
              pass
                ? { op: 8, why: "Told a good story", renown: 1 }
                : { stress: 2 },
            ),
        },
      ],
      300,
    ),
  },
  {
    key: "v-godparent",
    family: "vg-people",
    kinds: ["christening"],
    figure: (g, life, gat) => {
      const host = g.s.chars[gat.host];
      return host?.alive && host.id !== life.c && !lifeOfChar(g.s, host.id)
        ? host.id
        : null;
    },
    def: sub(
      "v-godparent",
      "Will you stand godparent?",
      (g, life, ctx) =>
        `Before the font, ${name(g, ctx)} turns to you, a little shy: would you stand as the child's godparent? It's an honour, and a responsibility, and usually a silver spoon.`,
      [
        {
          label: "Gladly (2 coins, the spoon)",
          tip: "A bond for life (+15).",
          blocked: (g, life) => poor(life, 2),
          apply: (g, life, ctx) => {
            spend(g, life, 2);
            step(g, life, ctx, {
              op: 15,
              why: "Stood godparent to my child",
              mood: 1,
              line: "A godparent stood at the font.",
            });
          },
        },
        {
          label: "Say you're not worthy",
          tip: "Modest, and a little disappointing (−2).",
          apply: (g, life, ctx) =>
            step(g, life, ctx, { op: -2, why: "Wouldn't stand godparent" }),
        },
      ],
      365,
    ),
  },
  {
    key: "v-dancefloor",
    family: "vg-play",
    kinds: ["ball", "feast", "frolic", "wedding", "dance", "nfeast"],
    figure: (g, life, gat, here) => {
      const me = meOf(g.s, life);
      if (!me || ageOf(g.s, me) < 18) return null;
      return anyOf(
        gat,
        here.filter(
          (c) =>
            ageOf(g.s, c) >= 18 &&
            c.female !== me.female &&
            c.id !== me.spouse &&
            !closeKin(g.s, me, c),
        ),
        14,
      );
    },
    def: sub(
      "v-dancefloor",
      "The country dances",
      (g, life, ctx) =>
        `The fiddles strike up "Sir Roger de Coverley" and the lines form, laughing. ${cap(name(g, ctx))} is without a partner, and looking about.`,
      [
        {
          label: (g, life, ctx) => `Ask ${first(g, ctx)} to dance`,
          tip: "Persuasion: a fine partner (+8); if either of you is married, people notice who dances with whom.",
          check: { skill: "persuasion", dc: 4 },
          apply: (g, life, ctx, pass) => {
            const me = meOf(g.s, life)!;
            const c = who(g, ctx);
            if (c && (me.spouse >= 0 || c.spouse >= 0)) {
              const sp = g.s.chars[me.spouse];
              if (sp?.alive && !lifeOfChar(g.s, sp.id))
                remembers(
                  g,
                  life,
                  g.char(sp.id),
                  "Danced with someone else",
                  -3,
                  1,
                );
            }
            step(
              g,
              life,
              ctx,
              pass
                ? { op: 8, why: "Danced with me", mood: 1, stress: -2 }
                : { op: 2, why: "Trod on my feet", stress: 1 },
            );
          },
        },
        {
          label: "Dance with your own husband or wife",
          tip: "A good marriage, on show (+8 with them).",
          blocked: (g, life) =>
            meOf(g.s, life)!.spouse >= 0 ? null : "You're not married",
          apply: (g, life, ctx) => {
            const sp = g.s.chars[meOf(g.s, life)!.spouse];
            if (sp?.alive && !lifeOfChar(g.s, sp.id))
              remembers(
                g,
                life,
                g.char(sp.id),
                "Danced with me all evening",
                8,
                1,
              );
            step(g, life, ctx, { mood: 1, stress: -2 });
          },
        },
        {
          label: "Sit it out with the old men",
          tip: "Talk of crops and wars (−2 stress).",
          apply: (g, life, ctx) => step(g, life, ctx, { stress: -2 }),
        },
      ],
      180,
    ),
  },
];

const VIGNETTE_BY_KEY = new Map(VIGNETTES.map((v) => [v.key, v]));

// The vignettes rest by family, as every event does (EventPacing.ts).
for (const fam of [...new Set(VIGNETTES.map((v) => v.family))])
  registerFamily(
    fam,
    VIGNETTES.filter((v) => v.family === fam).map((v) => v.def.key),
    fam === "vg-mishap" ? 120 : 45,
  );

/** The chance a turn at a gathering is one of the vignettes, when one can come. */
export const VIGNETTE_CHANCE = 0.5;

/**
 * A vignette for a player's next turn at a gathering: one that can happen
 * with the people there, isn't resting, and comes the less the more it's been
 * seen. Not the evening's opening turn (the ceremony's own comes first), and
 * never at the couple's own wedding (their scenes are the day's).
 */
export function pickVignette(
  g: ConquestGame,
  life: Life,
  gat: Gathering,
  here: Character[],
): { key: string; c: number } | undefined {
  if (gat.bet !== undefined && gat.about.includes(life.c)) return undefined;
  if (
    !gat.played.some(
      (k) => GATHERINGS[gat.kind].pool.includes(k) || VIGNETTE_BY_KEY.has(k),
    )
  )
    return undefined;
  const r = idice(g);
  if (!r.chance(VIGNETTE_CHANCE)) return undefined;
  const s = g.s;
  const options: { key: string; c: number; w: number }[] = [];
  for (const v of VIGNETTES) {
    if (gat.played.includes(v.key)) continue;
    if (v.kinds !== "any" && !v.kinds.includes(gat.kind)) continue;
    if ((life.cooldowns[`ev:${v.def.key}`] ?? 0) > s.day) continue;
    const c = v.figure(g, life, gat, here);
    if (c === null || c < 0 || lifeOfChar(s, c)) continue;
    let w = v.weight ?? 1;
    for (const h of hooks.eventWeight)
      w = h(g, life, v.def.key, "raised", { c }, w);
    if (w > 0) options.push({ key: v.key, c, w });
  }
  const total = options.reduce((m, o) => m + o.w, 0);
  if (total <= 0) return undefined;
  let roll = r.next() * total;
  for (const o of options) {
    roll -= o.w;
    if (roll <= 0) return { key: o.key, c: o.c };
  }
  return undefined;
}

// ---------------------------------------------------------------- arriving

const ARRIVE: LifeEventDef = {
  key: "intr-arrive",
  pool: "raised",
  cooldown: 0,
  scene: "road",
  title: "Arrived",
  body: (g, life, ctx) => {
    const gat = gatheringById(g.s, ctx.g);
    const host = gat ? g.s.chars[gat.host] : undefined;
    const where = gat ? g.map.provinces[gat.prov]?.name : "town";
    const days = gat ? Math.max(0, gat.day - g.s.day) : 0;
    return `You ride into ${where} ${days <= 1 ? "with a day to spare" : `${days} days early`}, saddle-sore and dusty, for ${host ? `${charName(host)}'s` : "the"} ${gat ? GATHERINGS[gat.kind].name.toLowerCase() : "gathering"}. The town is full of people who've come for it.`;
  },
  choices: [
    {
      label: "A room at the inn, and a good brushing (1 coin)",
      tip: "You arrive looking your best: the evening starts well.",
      blocked: (g, life) => poor(life, 1),
      apply: (g, life, ctx) => {
        spend(g, life, 1);
        addStress(g, life, -3);
        gatherMood(g, ctx.g, 1);
      },
    },
    {
      label: "Call on the host straight away",
      tip: "Eager: they're touched (+6), if a little surprised by the mud.",
      apply: (g, life, ctx) => {
        const gat = gatheringById(g.s, ctx.g);
        const host = gat ? g.s.chars[gat.host] : undefined;
        if (host?.alive && !lifeOfChar(g.s, host.id))
          remembers(g, life, g.char(host.id), "Came all that way", 6, 2);
      },
    },
    {
      label: "Walk the town first",
      tip: "Learn your way about, and meet someone.",
      apply: (g, life) => {
        const folk = peopleHere(g.s, life.prov, life).filter(
          (c) => !lifeOfChar(g.s, c.id) && !life.met.includes(c.id),
        );
        const c = folk.length
          ? folk[idice(g).int(0, folk.length - 1)]
          : undefined;
        if (c) {
          meet(g, life, c.id);
          journal(
            g,
            life,
            `Walking the town you fall into talk with ${charName(c)}.`,
          );
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- hearts

const SEDUCE_P2P: LifeEventDef = {
  key: "p2p-intr-seduce",
  pool: "raised",
  cooldown: 0,
  scene: "tavern",
  title: (g, life, ctx) => (ctx.a ? "An offer" : "Attentions"),
  body: (g, life, ctx) => {
    const c = who(g, ctx);
    const me = meOf(g.s, life);
    const wed = (me?.spouse ?? -1) >= 0 || (c?.spouse ?? -1) >= 0;
    return ctx.a
      ? `${cap(name(g, ctx))} has been paying you marked attentions for weeks, and tonight says it plainly: rooms of your own, and ${ctx.k} coins a month, if you'll be ${his(c)}.${wed ? " One of you, at least, is married." : ""} What you say is up to you.`
      : `${cap(name(g, ctx))} has been finding reasons to be wherever you are, and tonight, by the door, makes ${his(c)} meaning plain.${wed ? " One of you, at least, is married." : ""} What you say is up to you.`;
  },
  choices: [
    {
      label: (g, life, ctx) => (ctx.a ? "Accept" : "Welcome it"),
      tip: (g, life, ctx) =>
        ctx.a
          ? `Lovers, kept: ${ctx.k} coins a month from them. If either of you is married, it's an affair, with an affair's risks.`
          : "Lovers. If either of you is married, it's an affair, with an affair's risks.",
      blocked: (g, life, ctx) => {
        const me = meOf(g.s, life);
        const c = who(g, ctx);
        if (!me || !c?.alive) return "They're gone";
        if (ageOf(g.s, me) < 18 || ageOf(g.s, c) < 18)
          return "Not until you're both eighteen";
        return null;
      },
      apply: (g, life, ctx) => {
        const s = g.s;
        const c = who(g, ctx);
        const asker = c ? lifeOfChar(s, c.id) : undefined;
        const me = meOf(s, life);
        if (!c || !asker || !me) return;
        setTie(g, life, c.id, "lover");
        setTie(g, asker, me.id, "lover");
        if (wouldBeAffair(s, life, c)) startAffair(g, life, c.id);
        if (wouldBeAffair(s, asker, me)) startAffair(g, asker, me.id);
        if (ctx.a) {
          intrigue(g).kept.push({
            seat: asker.seat,
            by: c.id,
            c: me.id,
            since: s.day,
            cost: ctx.k || keepCost(s, me),
            owed: 0,
          });
          intrigueChanged(g);
        }
        secretNote(g, life, `You and ${charName(c)} are lovers.`, "good");
        secretNote(
          g,
          asker,
          `${charName(me)} says yes: you're lovers.`,
          "good",
        );
      },
    },
    {
      label: "Rebuff them",
      tip: "Plainly, in front of people. They'll take it hard.",
      apply: (g, life, ctx) => {
        const c = who(g, ctx);
        const asker = c ? lifeOfChar(g.s, c.id) : undefined;
        const me = meOf(g.s, life);
        if (!c || !asker || !me) return;
        addRenown(g, life, 0.5);
        journal(
          g,
          asker,
          `${charName(me)} rebuffed you, in front of everyone.`,
          "bad",
        );
        addStress(g, asker, 5);
        touchLife(g, asker).cooldowns[`intr:seduce:${me.id}`] = g.s.day + 180;
      },
    },
    {
      label: "Let them down gently",
      tip: "Kind, and private. (If you don't answer, this is what you say.)",
      apply: (g, life, ctx) => {
        const c = who(g, ctx);
        const asker = c ? lifeOfChar(g.s, c.id) : undefined;
        const me = meOf(g.s, life);
        if (!c || !asker || !me) return;
        secretNote(g, asker, `${charName(me)} lets you down, gently.`);
        touchLife(g, asker).cooldowns[`intr:seduce:${me.id}`] = g.s.day + 90;
      },
    },
  ],
};

const WOO_P2P: LifeEventDef = {
  key: "p2p-intr-woo",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: "Like the old days",
  body: (g, life, ctx) =>
    `${cap(name(g, ctx))} has put on the good coat and found a ribbon from somewhere, and asks, with a look you remember, whether you'd walk out together this evening, like the old days.`,
  choices: [
    {
      label: "Walk out together",
      tip: "An evening for the two of you: warmer, and a child likelier for half a year.",
      apply: (g, life, ctx) => {
        const c = who(g, ctx);
        const other = c ? lifeOfChar(g.s, c.id) : undefined;
        const me = meOf(g.s, life);
        if (!c || !other || !me || me.spouse !== c.id) return;
        fondly(g, life, c);
        fondly(g, other, me);
      },
    },
    {
      label: "Not tonight",
      tip: "Another time. (If you don't answer, this is what you say.)",
      apply: (g, life, ctx) => {
        const c = who(g, ctx);
        const other = c ? lifeOfChar(g.s, c.id) : undefined;
        const me = meOf(g.s, life);
        if (other && me)
          journal(g, other, `${me.first} would rather not, tonight.`);
      },
    },
  ],
};

const CHILD: LifeEventDef = {
  key: "intr-child",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: "A child",
  body: (g, life, ctx) => {
    const me = meOf(g.s, life)!;
    const kid = g.s.chars[ctx.k];
    return me.female
      ? `A ${kid?.female ? "daughter" : "son"}, ${kid?.first ?? ""}, born without a husband's name to give them. ${cap(name(g, ctx))} is the father, and everyone can count to nine.`
      : `${cap(name(g, ctx))} has had a ${kid?.female ? "daughter" : "son"}: ${kid?.first ?? ""}. ${cap(he(who(g, ctx)))} sends word, and asks what you mean to do.`;
  },
  choices: [
    {
      label: (g, life) =>
        meOf(g.s, life)!.female
          ? "Name the father"
          : "Acknowledge the child as yours",
      tip: (g, life) =>
        meOf(g.s, life)!.female
          ? "The child has a father's name; the talk is louder for a while (−1 renown)."
          : "Yours, in law: the child may inherit, and may be named your heir. Your husband or wife, if you have one, won't like it (−1 renown).",
      apply: (g, life, ctx) => {
        const s = g.s;
        const me = meOf(s, life)!;
        const kid = s.chars[ctx.k];
        const c = who(g, ctx);
        if (!kid?.alive) return;
        if (me.female) {
          if (c) {
            g.touchChar(kid).father = c.id;
            if (!c.children.includes(kid.id))
              g.touchChar(c).children.push(kid.id);
          }
        } else acknowledge(g, life, kid.id);
        addRenown(g, life, -1);
        const sp = s.chars[me.spouse];
        if (sp?.alive && !lifeOfChar(s, sp.id))
          remembers(g, life, g.char(sp.id), "A child by someone else", -20, 5);
        if (c?.alive && !lifeOfChar(s, c.id))
          remembers(g, life, g.char(c.id), "Owned our child", 15, 5);
        journal(g, life, `${kid.first} is acknowledged.`, "good");
      },
    },
    {
      label: "Provide for them quietly (10 coins)",
      tip: "Money for the child's keep, and no name given: the lover is grateful (+10).",
      blocked: (g, life) => poor(life, 10),
      apply: (g, life, ctx) => {
        spend(g, life, 10);
        const c = npcOf(g, ctx);
        if (c)
          remembers(g, life, g.char(c.id), "Saw our child provided for", 10, 5);
        secretNote(g, life, "The child is provided for, quietly.");
      },
    },
    {
      label: "Say nothing",
      tip: "No name, no money. The lover won't forgive it (−25), and people talk.",
      apply: (g, life, ctx) => {
        const s = g.s;
        const c = npcOf(g, ctx);
        if (c) remembers(g, life, g.char(c.id), "Disowned our child", -25, 5);
        const me = meOf(s, life)!;
        rumour(
          g,
          life.prov,
          `${charName(me)} has a child nobody will speak of.`,
          me.id,
          "bad",
        );
      },
    },
  ],
};

// ---------------------------------------------------------------- plots, seen from the target

const WARNINGS = [
  "A friend draws you aside: someone has been asking about you. Which nights you're out, which road you take, who pours your wine.",
  "Last night's wine tasted strange, bitter at the back of the tongue. You left the glass, and the cat that finished it has been sick all morning.",
  "A man in a dark coat, twice now, across the street from your door. He wasn't there when you looked again.",
  "Your horse shied at nothing on the road, and in the soft ground by the creek there were tracks of several horses, standing a long while.",
  "On the wharf a rope over your head was frayed where no rope should be, the cut ends clean.",
  "A loud man at the tavern has been asking which nights you drink there, and whether you're a fair shot.",
];

const WARN: LifeEventDef = {
  key: "intr-warn",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: "Something isn't right",
  body: (g, life, ctx) =>
    `${WARNINGS[Math.max(0, Math.min(WARNINGS.length - 1, ctx.k ?? 0))]} Someone, perhaps, wishes you dead.`,
  choices: [
    {
      label: `Hire men to watch over you (${PLOT.guardCost} coins)`,
      tip: `For the next ${PLOT.guardDays} days, anyone who comes for you meets them first.`,
      blocked: (g, life) => poor(life, PLOT.guardCost),
      apply: (g, life) => {
        hireGuards(g, life);
        journal(
          g,
          life,
          "Two big men from the docks, paid to stand at your back for three months.",
        );
      },
    },
    {
      label: "Find out who's behind it",
      tip: "Stealth: ask, and watch, and follow. Succeed, and you'll know who; then it's yours to act.",
      check: { skill: "stealth", dc: 7 },
      apply: (g, life, ctx, pass) => findOut(g, life, ctx.s, pass),
    },
    {
      label: "Leave town for a while",
      tip: "Out of reach: whatever's planned has to wait for you to come back. (You set out for the next town; the fare's yours.)",
      apply: (g, life) => {
        const to = nearestRefuge(g, life);
        const err = to >= 0 ? travelHook(g, life, to) : "Nowhere to go";
        if (err)
          journal(
            g,
            life,
            `You meant to slip away, but couldn't: ${err.replace(/\.$/, "").toLowerCase()}.`,
            "bad",
          );
      },
    },
    {
      label: "Put it out of your mind",
      tip: "Probably nothing.",
      apply: () => {},
    },
  ],
};

/** Setting out on the road, or by sea (Life.ts), without importing it here. */
export let travelHook: (
  g: ConquestGame,
  life: Life,
  to: number,
  bySea?: boolean,
) => string | null = () => "You can't travel now.";
export function setTravelHook(f: typeof travelHook): void {
  travelHook = f;
}

const KNOWN: LifeEventDef = {
  key: "intr-known",
  pool: "raised",
  cooldown: 0,
  scene: "home",
  title: "You know who",
  body: (g, life, ctx) =>
    `It's ${name(g, ctx)}. You're sure of it now: the questions, the money changing hands, the man in the dark coat. What you do about it is up to you.`,
  choices: [
    {
      label: "Say nothing, and watch them",
      tip: "Keep your counsel. You could always plot against them yourself (their card).",
      apply: (g, life, ctx) => {
        const c = who(g, ctx);
        if (c) journal(g, life, `You say nothing, and watch ${charName(c)}.`);
      },
    },
    {
      label: "Confront them",
      tip: "To their face: it's over, they're your enemy for life, and you come out of it well (+2 renown).",
      apply: (g, life, ctx) => confront(g, life, ctx.s),
    },
    {
      label: "Lay an information before the justice",
      tip: "The law: they're taken up and tried for conspiring to murder you.",
      apply: (g, life, ctx) => inform(g, life, ctx.s),
    },
  ],
};

/** The moment: a player always gets a chance to act. */
function strikeChoice(i: number): LifeChoice {
  const m = (ctx: LCtx) => PLOT_METHOD_KEYS[ctx.m] ?? "poison";
  const x = (g: ConquestGame, ctx: LCtx) => schemeById(g.s, ctx.s);
  return {
    label: (g, life, ctx) => STRIKE_CHOICES[m(ctx)][i].label,
    tip: (g, life, ctx) => STRIKE_CHOICES[m(ctx)][i].tip,
    check: {
      skill: (g, life, ctx) => STRIKE_CHOICES[m(ctx)][i].skill,
      // The better laid the plot, the harder to escape.
      dc: (g, life, ctx) =>
        STRIKE_CHOICES[m(ctx)][i].dc +
        Math.round((x(g, ctx)?.odds.p ?? 0.4) * 4),
    },
    apply: (g, life, ctx, pass) => strikeMet(g, life, ctx.s, i, pass),
  };
}

const STRIKE_BODY: Record<string, string> = {
  poison:
    "Supper, and a glass of wine poured for you by a hand you don't quite see. The first sip is bitter, and a coldness spreads from your tongue.",
  cutthroat:
    "A dark lane on the way home, and footsteps that stop when yours stop. Then they don't stop: a shape, an arm raised, steel.",
  ambush:
    "The road dips into the creek bottom, and the woods close in. A branch cracks; your horse throws up its head; men step out of the trees.",
  accident:
    "On the wharf, under the crane, a sound you know too late: a rope parting, and a load of barrels coming down.",
  duel: "A loud man you've never seen jostles you at the tavern, takes offence at it before the whole room, and throws his glove at your feet.",
};

const STRIKE: LifeEventDef = {
  key: "intr-strike",
  pool: "raised",
  cooldown: 0,
  scene: (g, life, ctx) =>
    ({
      poison: "home",
      cutthroat: "tavern",
      ambush: "road",
      accident: "docks",
      duel: "tavern",
    })[PLOT_METHOD_KEYS[ctx.m] ?? "poison"] ?? "home",
  title: "Now",
  body: (g, life, ctx) =>
    `${STRIKE_BODY[PLOT_METHOD_KEYS[ctx.m] ?? "poison"]} Someone wants you dead, and this is the moment. What you do now decides it.`,
  choices: [strikeChoice(0), strikeChoice(1), strikeChoice(2)],
};

export const INTRIGUE_EVENTS: LifeEventDef[] = [
  ...WEDDING_SCENES,
  ...VIGNETTES.map((v) => v.def),
  ARRIVE,
  SEDUCE_P2P,
  WOO_P2P,
  CHILD,
  WARN,
  KNOWN,
  STRIKE,
];
