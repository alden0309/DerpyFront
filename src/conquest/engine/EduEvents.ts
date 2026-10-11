// EDU (r13): what happens to children away, as letters to their parents
// that want an answer. An apprentice's hard master (complain to the
// justices, fetch them home, or tell them to bear it), a good one, a flight
// in the night, a master's death and the indenture assigned; at college a
// scrape, the bills, a revival, a challenge, a fever or the smallpox, and
// being sent down; and a little one homesick at a boarding school.

import { kill } from "./Characters";
import {
  childSkill,
  eduName,
  eduWhere,
  leave,
  reassign,
  successorOf,
} from "./Edu";
import { COLLEGE_BY_KEY, COLLEGE_RANKS } from "./EduData";
import type { ConquestGame } from "./Game";
import {
  addRenown,
  addStress,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeChoice, LifeEventDef } from "./LifeEvents";
import { checkChance, EUROPE_PASSAGE } from "./LifeRules";
import { ageOf, charName, yearOf } from "./Queries";
import type { Character, EduNow, Life, Skill } from "./Types";

// ---------------------------------------------------------------- helpers

const kidOf = (g: ConquestGame, ctx: LCtx): Character | undefined =>
  g.s.chars[ctx.c];
const nowOf = (g: ConquestGame, ctx: LCtx): EduNow | null =>
  kidOf(g, ctx)?.edu?.now ?? null;
const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const first = (g: ConquestGame, ctx: LCtx) =>
  kidOf(g, ctx)?.first ?? "Your child";
const masterOf = (g: ConquestGame, ctx: LCtx) => g.s.chars[ctx.m];
const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

function college(g: ConquestGame, ctx: LCtx) {
  return COLLEGE_BY_KEY.get(nowOf(g, ctx)?.key ?? "");
}
function townOf(g: ConquestGame, ctx: LCtx): string {
  const now = nowOf(g, ctx);
  if (!now) return "college";
  return eduWhere(g.s, g.map, now).replace(/^at /, "");
}
/** The president (or rector) who writes. */
function headOf(g: ConquestGame, ctx: LCtx): string {
  return (college(g, ctx)?.head ?? "the president").replace(
    /^the (\w+)( and \w+)?.*$/,
    "the $1",
  );
}

function ch(
  label: LifeChoice["label"],
  tip: LifeChoice["tip"],
  apply: LifeChoice["apply"],
  check?: LifeChoice["check"],
  blocked?: LifeChoice["blocked"],
): LifeChoice {
  return { label, tip, apply, check, blocked };
}

/** Still at it (an answer can come after it's over). */
function still(g: ConquestGame, ctx: LCtx, kind?: EduNow["kind"]): boolean {
  const now = nowOf(g, ctx);
  return !!now && (!kind || now.kind === kind) && !!kidOf(g, ctx)?.alive;
}

function setMood(g: ConquestGame, ctx: LCtx, f: (m: number) => number): void {
  const kid = kidOf(g, ctx);
  if (!kid?.edu?.now) return;
  const now = g.char(kid.id).edu!.now!;
  now.mood = Math.max(-2, Math.min(2, f(now.mood)));
}

function trouble(g: ConquestGame, ctx: LCtx, n: number): void {
  const kid = kidOf(g, ctx);
  if (!kid?.edu?.now) return;
  const now = g.char(kid.id).edu!.now!;
  now.trouble = Math.max(0, (now.trouble ?? 0) + n);
}

function learn(g: ConquestGame, ctx: LCtx, sk: Skill, v: number): void {
  const kid = kidOf(g, ctx);
  if (!kid?.edu) return;
  const e = g.char(kid.id).edu!;
  e.pts[sk] = Math.round(((e.pts[sk] ?? 0) + v) * 100) / 100;
}

const say = (g: ConquestGame, life: Life, t: string, tone?: "good" | "bad") =>
  journal(g, life, t, tone);

/** The debts a college son runs up: a few months' bills. */
function debtsOf(g: ConquestGame, ctx: LCtx): number {
  const now = nowOf(g, ctx);
  return Math.max(3, Math.round((now?.fee ?? 2) * 2.5));
}

const SCRAPES = [
  "was caught with two friends roasting a stolen goose over the fire in their chamber",
  "was among the young gentlemen who rang the college bell at two in the morning",
  "has been fined for missing prayers eleven times in one quarter",
  "was found at a tavern in the town long after the gates were shut",
  "threw a squib into the tutor's chamber on the King's birthday",
];

// ---------------------------------------------------------------- the events

export const EDU_EVENTS: LifeEventDef[] = [
  {
    key: "edu-harsh",
    pool: "raised",
    cooldown: 200,
    scene: "letter",
    title: (g, life, ctx) => `${first(g, ctx)} writes of a hard master`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const m = masterOf(g, ctx);
      return `A letter in ${first(g, ctx)}'s cramped hand, blotted where ${he(kid)} has been crying: ${charName(m)} beats ${him(kid)} for every fault and some that aren't ${his(kid)}, works the apprentices from four in the morning, and feeds them salt fish and small beer. "I would not trouble you, but I cannot bear it much longer." An apprentice may complain to the justices, who can order a master to mend his ways, or end the indenture.`;
    },
    choices: [
      ch(
        "Complain to the justices",
        "Persuasion: the county court can order the master to use the child better. If it fails, he takes it out on them.",
        (g, life, ctx, pass) => {
          if (!still(g, ctx, "apprentice")) return;
          const kid = kidOf(g, ctx)!;
          const m = masterOf(g, ctx);
          if (pass) {
            setMood(g, ctx, () => 0);
            if (m?.alive)
              remembers(
                g,
                life,
                g.char(m.id),
                "Took me before the justices",
                -10,
                6,
              );
            say(
              g,
              life,
              `The justices hear ${kid.first}'s complaint and order ${charName(m)}, on pain of losing the indenture, to give ${him(kid)} sufficient meat, drink and lodging and moderate correction only. ${cap(he(m))} grumbles, and mends.`,
              "good",
            );
          } else {
            setMood(g, ctx, () => -2);
            trouble(g, ctx, 1);
            say(
              g,
              life,
              `The justices find the correction moderate and the complaint frivolous. ${charName(m)} is the worse for it, and so is ${kid.first}.`,
              "bad",
            );
          }
        },
        { skill: "persuasion", dc: 6 },
      ),
      ch(
        "Fetch them home",
        "Buy out the indenture: the premium is lost and the trade unlearned, but the child is safe.",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          const kid = g.char(ctx.c);
          remembers(g, life, kid, "Fetched me home", 10, 10);
          leave(g, life, kid, "fetched home from a hard master");
        },
      ),
      ch(
        "Tell them to bear it",
        "Many masters are hard, and seven years is seven years. The child remembers you didn't come.",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          const kid = g.char(ctx.c);
          remembers(g, life, kid, "Left me to a hard master", -10, 10);
          trouble(g, ctx, 1);
          say(
            g,
            life,
            `You write to ${kid.first} to be a good apprentice and bear it.`,
          );
        },
      ),
    ],
  },
  {
    key: "edu-good",
    pool: "raised",
    cooldown: 400,
    scene: "letter",
    title: (g, life, ctx) =>
      `A good word from ${masterOf(g, ctx)?.first ?? "the master"}`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const m = masterOf(g, ctx);
      return `${charName(m)} writes that ${first(g, ctx)} is the best apprentice ${he(m)} has had in years: quick, honest and up before the bell. When ${his(kid)} time is served ${he(m)} would gladly take ${him(kid)} on as a journeyman.`;
    },
    choices: [
      ch(
        "Send a gift of thanks (2 coins)",
        "A ham and a bottle of Madeira: the master thinks the better of your family, and teaches the more.",
        (g, life, ctx) => {
          spend(g, life, 2);
          const m = masterOf(g, ctx);
          if (m?.alive)
            remembers(g, life, g.char(m.id), "A handsome present", 10, 6);
          setMood(g, ctx, (x) => x + 1);
          say(
            g,
            life,
            `You send ${charName(m)} a ham and a bottle of Madeira with your thanks.`,
            "good",
          );
        },
        undefined,
        (g, life) => poor(life, 2),
      ),
      ch("A letter of thanks", "Kind words cost nothing.", (g, life, ctx) => {
        const m = masterOf(g, ctx);
        if (m?.alive) remembers(g, life, g.char(m.id), "A kind letter", 4, 4);
      }),
    ],
  },
  {
    key: "edu-runaway",
    pool: "raised",
    cooldown: 300,
    scene: "letter",
    title: (g, life, ctx) => `${first(g, ctx)} has run away`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const m = masterOf(g, ctx);
      const age = kid ? ageOf(g.s, kid) : 14;
      return `${charName(m)} writes that ${first(g, ctx)} is gone from ${his(m)} house in the night with a bundle and two shillings, and has put a notice in the gazette: "RAN AWAY from the subscriber, an apprentice named ${kid ? charName(kid) : "the said apprentice"}, about ${age} years of age. Whoever takes up the said apprentice and secures ${him(kid)} shall have a reward, and all masters of vessels are forbid to carry ${him(kid)} off." Young Franklin ran from his brother's printing house so, in 1723, and never went back.`;
    },
    choices: [
      ch(
        "Pay for a search, and send them back (3 coins)",
        "Riders and a notice in every gazette: usually they're found. Back to the master, who is no kinder for it.",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          spend(g, life, 3);
          const kid = g.char(ctx.c);
          if (g.rng.chance(0.75)) {
            setMood(g, ctx, (x) => Math.min(0, x - 1));
            trouble(g, ctx, 1);
            remembers(g, life, kid, "Sent me back", -6, 6);
            say(
              g,
              life,
              `${kid.first} is taken up on the road and sent back to ${his(kid)} master, with a month added to the term for the time lost.`,
            );
            const now = kid.edu!.now!;
            now.until += 30;
          } else {
            leave(g, life, kid, "ran away and was never taken up");
            say(
              g,
              life,
              `No trace of ${kid.first}: some say a ship, some say the frontier. A letter may come, one day.`,
              "bad",
            );
            addStress(g, life, 8);
          }
        },
        undefined,
        (g, life) => poor(life, 3),
      ),
      ch(
        "Let them go their own way",
        "The indenture ends; they make their own way in the world, and remember you didn't hunt them.",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          const kid = g.char(ctx.c);
          remembers(g, life, kid, "Let me go", 6, 10);
          leave(g, life, kid, "ran away, and you let them go");
        },
      ),
      ch(
        "Bring them home",
        "End the indenture and have them home: the premium is lost.",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          const kid = g.char(ctx.c);
          remembers(g, life, kid, "Took me in", 8, 10);
          leave(g, life, kid, "ran away home");
        },
      ),
    ],
  },
  {
    key: "edu-master",
    pool: "raised",
    cooldown: 0,
    scene: "letter",
    title: (g, life, ctx) => `${charName(masterOf(g, ctx))} is dead`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const m = masterOf(g, ctx);
      const next = kid ? successorOf(g.s, g.w, kid) : undefined;
      return `Word comes that ${charName(m)}, ${first(g, ctx)}'s master, has died${m?.died ? ` (${m.died.cause})` : ""}. By custom the indenture passes to ${next ? `${charName(next)}${next.id === m?.spouse ? ", the widow, who keeps the shop going" : ", who would take it"}` : "another master, if one will have it"}, to serve out the term; or ${first(g, ctx)} can come home.`;
    },
    choices: [
      ch(
        "Let the indenture be assigned",
        "They serve out the term with the new master (or come home if nobody will take it).",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          reassign(g, life, g.char(ctx.c));
        },
      ),
      ch(
        "Bring them home",
        "The indenture ends; what's learned is learned.",
        (g, life, ctx) => {
          if (!still(g, ctx, "apprentice")) return;
          leave(g, life, g.char(ctx.c), "came home when the master died");
        },
      ),
    ],
  },
  {
    key: "edu-scrape",
    pool: "raised",
    cooldown: 150,
    scene: "letter",
    title: (g, life, ctx) =>
      `A scrape at ${college(g, ctx)?.short ?? "college"}`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const what = SCRAPES[(ctx.c + yearOf(g.s)) % SCRAPES.length];
      return `${cap(headOf(g, ctx))} writes that ${first(g, ctx)} ${what}. ${cap(he(kid))} has been fined and admonished before the college, and the letter hopes you will add your own.`;
    },
    choices: [
      ch(
        "Pay the fine and write sternly (1 coin)",
        "The college is satisfied; the scrape is forgotten.",
        (g, life, ctx) => {
          spend(g, life, 1);
          trouble(g, ctx, -1);
          say(
            g,
            life,
            `You pay ${first(g, ctx)}'s fine and write ${him(kidOf(g, ctx))} a letter about the family name.`,
          );
        },
        undefined,
        (g, life) => poor(life, 1),
      ),
      ch(
        "Laugh it off",
        "Boys will be boys: the child loves you for it, and the college marks it down.",
        (g, life, ctx) => {
          const kid = kidOf(g, ctx);
          if (kid?.alive)
            remembers(g, life, g.char(kid.id), "Took my side", 4, 4);
          trouble(g, ctx, 1);
        },
      ),
      ch(
        "Threaten to bring them home",
        "Persuasion: a fright mends their ways, or sours them.",
        (g, life, ctx, pass) => {
          const kid = kidOf(g, ctx);
          if (pass) {
            trouble(g, ctx, -2);
            setMood(g, ctx, (x) => x + 1);
            say(
              g,
              life,
              `${first(g, ctx)} writes back very humbly. No more geese.`,
              "good",
            );
          } else {
            trouble(g, ctx, 1);
            if (kid?.alive)
              remembers(g, life, g.char(kid.id), "Threatened me", -5, 4);
          }
        },
        { skill: "persuasion", dc: 4 },
      ),
    ],
  },
  {
    key: "edu-debts",
    pool: "raised",
    cooldown: 200,
    scene: "letter",
    title: (g, life, ctx) => `${first(g, ctx)}'s bills`,
    body: (g, life, ctx) => {
      const n = debtsOf(g, ctx);
      const r = COLLEGE_RANKS[nowOf(g, ctx)?.rank ?? 1];
      return `A packet from ${townOf(g, ctx)}: the tailor's bill, the bookseller's, a livery stable's and one from a tavern you would rather not have seen, ${n} coins in all. ${first(g, ctx)}'s letter says that ${r.name.toLowerCase()} must keep up with the others, and that it is the custom of the place.`;
    },
    choices: [
      ch(
        (g, life, ctx) => `Pay them (${debtsOf(g, ctx)} coins)`,
        "The bills are paid and the child's credit stands.",
        (g, life, ctx) => {
          spend(g, life, debtsOf(g, ctx));
          say(
            g,
            life,
            `You pay ${first(g, ctx)}'s bills, with a letter about the value of money.`,
          );
        },
        undefined,
        (g, life, ctx) => poor(life, debtsOf(g, ctx)),
      ),
      ch(
        (g, life, ctx) =>
          `Pay half (${Math.ceil(debtsOf(g, ctx) / 2)}) and say no more`,
        "Half paid, half owed: the tradesmen grumble to the college.",
        (g, life, ctx) => {
          spend(g, life, Math.ceil(debtsOf(g, ctx) / 2));
          trouble(g, ctx, 1);
        },
        undefined,
        (g, life, ctx) => poor(life, Math.ceil(debtsOf(g, ctx) / 2)),
      ),
      ch(
        "Refuse: let them answer for their debts",
        "A hard lesson: the college hears from the tradesmen, and the child won't forget it.",
        (g, life, ctx) => {
          const kid = kidOf(g, ctx);
          trouble(g, ctx, 2);
          if (kid?.alive)
            remembers(
              g,
              life,
              g.char(kid.id),
              "Left me to my creditors",
              -8,
              8,
            );
        },
      ),
    ],
  },
  {
    key: "edu-revival",
    pool: "raised",
    cooldown: 600,
    scene: "church",
    title: (g) => {
      const y = yearOf(g.s);
      return y >= 1740 && y <= 1745
        ? "The Great Awakening at college"
        : "A revival at college";
    },
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const y = yearOf(g.s);
      return y >= 1740 && y <= 1745
        ? `Mr Whitefield has preached at ${townOf(g, ctx)}, and the college is in an uproar of grace: students weeping in the yard, prayer meetings till dawn, tutors denounced as unconverted. ${first(g, ctx)} writes that ${he(kid)} has been born again. (At Yale in 1742 David Brainerd was expelled for saying a tutor had no more grace than a chair.)`
        : `A season of awakening at ${townOf(g, ctx)}: prayer meetings in the chambers, and ${first(g, ctx)} writes long letters about the state of ${his(kid)} soul, and yours.`;
    },
    choices: [
      ch(
        "Rejoice with them",
        "Faith deepens; they love you for it.",
        (g, life, ctx) => {
          learn(g, ctx, "faith", 1.5);
          const kid = kidOf(g, ctx);
          if (kid?.alive)
            remembers(g, life, g.char(kid.id), "Rejoiced with me", 4, 6);
          setMood(g, ctx, (x) => x + 1);
        },
      ),
      ch(
        "Warn them against enthusiasm",
        "Persuasion: steady them, or set them against you; in the Awakening a hot head can be expelled.",
        (g, life, ctx, pass) => {
          const kid = kidOf(g, ctx);
          learn(g, ctx, "faith", 0.5);
          if (!pass) {
            trouble(g, ctx, yearOf(g.s) >= 1740 && yearOf(g.s) <= 1745 ? 2 : 1);
            if (kid?.alive)
              remembers(
                g,
                life,
                g.char(kid.id),
                "Scorned my conversion",
                -5,
                6,
              );
          } else learn(g, ctx, "letters", 0.5);
        },
        { skill: "persuasion", dc: 5 },
      ),
    ],
  },
  {
    key: "edu-duel",
    pool: "raised",
    cooldown: 600,
    scene: "letter",
    title: (g, life, ctx) =>
      `A challenge at ${college(g, ctx)?.short ?? "college"}`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      return `A quarrel over cards, or a lady, or a word about ${his(kid)} colony, and ${first(g, ctx)} has been called out by another young gentleman. By the time your answer reaches ${townOf(g, ctx)} it may all be over.`;
    },
    choices: [
      ch(
        "Write forbidding it",
        "It may come in time; if not, they fight anyway.",
        (g, life, ctx) => duel(g, life, ctx, g.rng.chance(0.5)),
      ),
      ch(
        "Let honour decide",
        "They meet: their skill with a sword against the other's. Some die of it.",
        (g, life, ctx) => duel(g, life, ctx, false),
      ),
      ch(
        (g, life, ctx) =>
          nowOf(g, ctx)?.at === -1
            ? `Order them home at once (${EUROPE_PASSAGE} for the passage)`
            : "Order them home at once",
        "They leave college without the degree, and alive.",
        (g, life, ctx) => {
          if (!still(g, ctx, "college")) return;
          if (nowOf(g, ctx)?.at === -1) spend(g, life, EUROPE_PASSAGE);
          leave(g, life, g.char(ctx.c), "called home before a duel");
        },
        undefined,
        (g, life, ctx) =>
          nowOf(g, ctx)?.at === -1 ? poor(life, EUROPE_PASSAGE) : null,
      ),
    ],
  },
  {
    key: "edu-sick",
    pool: "raised",
    cooldown: 400,
    scene: "letter",
    title: (g, life, ctx) => `${first(g, ctx)} is ill`,
    body: (g, life, ctx) => {
      const kid = kidOf(g, ctx);
      const abroad = nowOf(g, ctx)?.at === -1;
      return abroad
        ? `The smallpox is in ${townOf(g, ctx)}, and ${first(g, ctx)} has it. ${cap(his(kid))} tutor writes that the physicians are attending, and that ${he(kid)} asks for you. The letter is two months old.`
        : `A fever has gone through ${townOf(g, ctx)}, and ${first(g, ctx)} is down with it. ${cap(headOf(g, ctx))} writes that ${he(kid)} is cared for.`;
    },
    choices: [
      ch(
        "Send money for the best physician (4 coins)",
        "The best care to be had: most recover.",
        (g, life, ctx) => {
          spend(g, life, 4);
          sickness(g, life, ctx, 0.92);
        },
        undefined,
        (g, life) => poor(life, 4),
      ),
      ch("Pray for them", "In God's hands.", (g, life, ctx) =>
        sickness(g, life, ctx, 0.82),
      ),
      ch(
        (g, life, ctx) =>
          nowOf(g, ctx)?.at === -1
            ? `Bring them home when they can travel (${EUROPE_PASSAGE})`
            : "Bring them home when they can travel",
        "Home air and home nursing; the degree is given up.",
        (g, life, ctx) => {
          if (nowOf(g, ctx)?.at === -1) spend(g, life, EUROPE_PASSAGE);
          if (sickness(g, life, ctx, 0.9) && still(g, ctx))
            leave(g, life, g.char(ctx.c), "came home ill");
        },
        undefined,
        (g, life, ctx) =>
          nowOf(g, ctx)?.at === -1 ? poor(life, EUROPE_PASSAGE) : null,
      ),
    ],
  },
  {
    key: "edu-expel",
    pool: "raised",
    cooldown: 300,
    scene: "letter",
    title: (g, life, ctx) => `${first(g, ctx)} is to be sent down`,
    body: (g, life, ctx) =>
      `After one scrape too many, ${headOf(g, ctx)} has resolved to send ${first(g, ctx)} down: expelled from the college. A letter from you might yet turn it to rustication, sent home for a term to repent and return.`,
    choices: [
      ch(
        "Plead with the college",
        "Persuasion: rusticated for a term instead, with a clean slate.",
        (g, life, ctx, pass) => {
          if (!still(g, ctx, "college")) return;
          const kid = g.char(ctx.c);
          if (pass) {
            trouble(g, ctx, -10);
            kid.edu!.now!.until += 120;
            say(
              g,
              life,
              `The college relents: ${kid.first} is rusticated for a term, and will take ${his(kid)} degree a little late.`,
              "good",
            );
          } else leave(g, life, kid, "sent down from the college");
        },
        { skill: "persuasion", dc: 7 },
      ),
      ch("Bring them home", "They leave without a degree.", (g, life, ctx) => {
        if (!still(g, ctx, "college")) return;
        leave(g, life, g.char(ctx.c), "sent down from the college");
      }),
    ],
  },
  {
    key: "edu-homesick",
    pool: "raised",
    cooldown: 300,
    scene: "letter",
    title: (g, life, ctx) => `${first(g, ctx)} is homesick`,
    body: (g, life, ctx) => {
      const now = nowOf(g, ctx);
      return `A letter from ${now ? eduWhere(g.s, g.map, now).replace(/^at /, "") : "school"}: ${first(g, ctx)} cries at night and won't eat. The teachers think it will pass; ${first(g, ctx)} begs to come home.`;
    },
    choices: [
      ch(
        "Write kindly, and let them stay",
        "A letter from home and a parcel: it usually passes.",
        (g, life, ctx) => {
          const kid = kidOf(g, ctx);
          if (kid?.alive)
            remembers(
              g,
              life,
              g.char(kid.id),
              "Wrote to me when I was low",
              4,
              6,
            );
        },
      ),
      ch("Bring them home", "Home they come, for now.", (g, life, ctx) => {
        if (!still(g, ctx, "school")) return;
        const kid = g.char(ctx.c);
        remembers(g, life, kid, "Fetched me home", 6, 6);
        leave(g, life, kid, "too homesick to stay");
      }),
    ],
  },
];

/** A duel at college: forbidden in time, or fought. */
function duel(g: ConquestGame, life: Life, ctx: LCtx, stopped: boolean): void {
  if (!still(g, ctx, "college")) return;
  const kid = g.char(ctx.c);
  if (stopped) {
    say(
      g,
      life,
      `Your letter came in time: ${kid.first} made an apology, and nobody bled.`,
      "good",
    );
    return;
  }
  const odds = checkChance(childSkill(g.s, kid, "fighting"), 4);
  const roll = g.rng.next();
  if (roll < odds) {
    addRenown(g, life, 1);
    remembers(g, life, kid, "Let me keep my honour", 4, 6);
    say(
      g,
      life,
      `${kid.first} met ${his(kid)} man at dawn and pinked him in the sword arm. Honour is satisfied, and the college pretends not to know.`,
      "good",
    );
    return;
  }
  if (g.rng.chance(0.25)) {
    say(
      g,
      life,
      `${kid.first} was run through in a duel at ${eduName(kid.edu!.now!)} and died of it.`,
      "bad",
    );
    addStress(g, life, 15);
    kill(g, kid, `a duel at college, at ${ageOf(g.s, kid)}`);
    return;
  }
  if (!kid.traits.includes("scarred")) kid.traits.push("scarred");
  touchLife(g, life);
  say(
    g,
    life,
    `${kid.first} was wounded in a duel, and carries the scar. ${cap(he(kid))} is mending.`,
    "bad",
  );
}

/** A sickness away: lives or dies. Returns whether they lived. */
function sickness(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  live: number,
): boolean {
  const kid = kidOf(g, ctx);
  if (!kid?.alive) return false;
  if (g.rng.chance(live)) {
    if (
      nowOf(g, ctx)?.at === -1 &&
      g.rng.chance(0.3) &&
      !kid.traits.includes("scarred")
    )
      g.char(kid.id).traits.push("scarred");
    say(
      g,
      life,
      `${kid.first} has come through the sickness, thin and weak, but alive.`,
      "good",
    );
    return true;
  }
  addStress(g, life, 20);
  kill(
    g,
    g.char(kid.id),
    `${nowOf(g, ctx)?.at === -1 ? "the smallpox" : "a fever"} at college, at ${ageOf(g.s, kid)}`,
  );
  return false;
}
