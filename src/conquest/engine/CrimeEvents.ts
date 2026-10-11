// LIFE (r11): the scenes of crime and the law: a hand on your collar, the
// quarter sessions, a big job at the den; and for lawmen, a rogue caught in
// the act and a quiet offer of money.

import {
  addHeat,
  addNotoriety,
  crimeName,
  crimeState,
  jail,
  punish,
  reprieved,
  sentenceFor,
} from "./Crime";
import { lawAt } from "./CrimeQueries";
import type { ConquestGame } from "./Game";
import { raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { lifeOfChar, meOf, skillLevel } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import { charName } from "./Queries";
import type { JobKind, Life } from "./Types";

const kindOf = (ctx: LCtx): JobKind =>
  (Object.keys(JOBS)[ctx.k] as JobKind | undefined) ?? "thief";

const here = (g: ConquestGame, life: Life) => g.map.provinces[life.prov].name;

/** Who's doing the seizing, in words. */
function seizers(kind: JobKind): string {
  switch (kind) {
    case "pirate":
      return "A navy cutter's boat crew, cutlasses out,";
    case "smuggler":
      return "Riding officers of the customs";
    case "highwayman":
      return "Mounted constables and a hue and cry of half the parish";
    case "counterfeiter":
      return "Two constables and a goldsmith who knows his metal";
    default:
      return "The watch, lanterns up and staves out,";
  }
}

/** A lawman player who made the arrest, if any. */
function arrester(g: ConquestGame, ctx: LCtx): Life | undefined {
  return ctx.by !== undefined ? lifeOfChar(g.s, ctx.by) : undefined;
}

const bribeFor = (ctx: LCtx) => 8 + (ctx.g ?? 1) * 8;
const courtBribe = (ctx: LCtx) => 25 + (ctx.g ?? 1) * 20;

/** The scenes of a big job, by trade. */
const SCORES: Partial<
  Record<JobKind, { title: string; body: string; go: string; careful: string }>
> = {
  thief: {
    title: "A house worth robbing",
    body: "The fence has a tip: a merchant's house at {here}, the family away at their country place, silver in the sideboard and a strongbox under the stairs.",
    go: "Take the strongbox too",
    careful: "Just the silver, quietly",
  },
  fence: {
    title: "A haul to move",
    body: "A gang has come in with a whole warehouse's worth of cloth and a church's plate. They want a price tonight.",
    go: "Buy it all",
    careful: "Take only what moves easily",
  },
  smuggler: {
    title: "A run of French brandy",
    body: "A Martinique schooner lies off the point with brandy and molasses, no duty paid. The customs cutter is said to be in harbour.",
    go: "Run the whole cargo ashore",
    careful: "Bring in a few kegs at a time",
  },
  highwayman: {
    title: "The mail coach",
    body: "The coach from the capital carries the quarter's tax money on Thursday, with one guard who drinks.",
    go: "Stop the coach",
    careful: "Rob the passengers' purses only",
  },
  counterfeiter: {
    title: "New plates for the bills",
    body: "A printer's apprentice will sell you the colony's new bill plates, or near enough copies. A fortune in paper money, if it passes.",
    go: "Print a great run",
    careful: "Print a few and pass them far away",
  },
  pirate: {
    title: "A sail on the horizon",
    body: "A fat merchantman, low in the water and slow, alone. The crew looks to you.",
    go: "Run up the black flag and board",
    careful: "Shadow her and take her at night",
  },
};

function scoreOf(life: Life) {
  const k = life.job && JOBS[life.job.kind].crime ? life.job.kind : "thief";
  return SCORES[k] ?? SCORES.thief!;
}

export const CRIME_EVENTS: LifeEventDef[] = [
  {
    key: "crime-seized",
    pool: "raised",
    cooldown: 0,
    scene: (g, life) =>
      life.area === "den" ? "den" : life.travel ? "road" : "gaol",
    title: "A hand on your collar",
    body: (g, life, ctx) => {
      const kind = kindOf(ctx);
      const by = arrester(g, ctx);
      const who = by
        ? `${charName(meOf(g.s, by))} of the watch`
        : seizers(kind);
      return `${who} ${by ? "has" : "have"} you at ${here(g, life)}. The charge: ${crimeName(kind, ctx.r ?? 0)}. ${ctx.g >= 3 ? "It's a hanging matter." : ctx.g === 2 ? "It's a felony." : "It's a petty matter, if you're lucky."}`;
    },
    choices: [
      {
        label: "Go quietly",
        tip: "The gaol, then the quarter sessions. Courts are kinder to those who come quietly.",
        apply: (g, life, ctx) => {
          jail(
            g,
            life,
            crimeName(kindOf(ctx), ctx.r ?? 0),
            ctx.g ?? 1,
            ctx.n ?? -1,
          );
          const by = arrester(g, ctx);
          if (by) {
            const c = crimeState(g, by);
            c.arrests = (c.arrests ?? 0) + 1;
            earn(g, by, 3 + (ctx.g ?? 1) * 3);
            addRenown(g, by, 1 + (ctx.g ?? 1));
            journal(
              g,
              by,
              `${charName(meOf(g.s, life))} came quietly to the gaol. The court pays your reward.`,
              "good",
            );
          }
        },
      },
      {
        label: (g, life, ctx) => `Bribe them (${bribeFor(ctx)} coins)`,
        tip: "Money in the right hand, and they never saw you. If they won't take it, it's worse.",
        check: { skill: "persuasion", dc: (g, life, ctx) => 5 + (ctx.g ?? 1) },
        blocked: (g, life, ctx) =>
          life.purse < bribeFor(ctx) ? `Needs ${bribeFor(ctx)} coins` : null,
        apply: (g, life, ctx, pass) => {
          const by = arrester(g, ctx);
          if (pass) {
            spend(g, life, bribeFor(ctx));
            addHeat(g, life, ctx.n ?? -1, -10);
            journal(g, life, "The coins vanish; so do you.", "good");
            if (by) {
              earn(g, by, bribeFor(ctx));
              const c = crimeState(g, by);
              c.bribes = (c.bribes ?? 0) + 1;
              journal(
                g,
                by,
                `${charName(meOf(g.s, life))} pressed ${bribeFor(ctx)} coins into your hand, and you let them go.`,
              );
            }
          } else {
            jail(
              g,
              life,
              `${crimeName(kindOf(ctx), ctx.r ?? 0)} and attempted bribery`,
              (ctx.g ?? 1) + 1,
              ctx.n ?? -1,
            );
            if (by)
              journal(
                g,
                by,
                `${charName(meOf(g.s, life))} tried to bribe you. They're in the gaol now.`,
                "good",
              );
          }
        },
      },
      {
        label: "Run for it",
        tip: "Away down the alleys. Caught, and you're bruised and in the gaol anyway.",
        check: { skill: "stealth", dc: (g, life, ctx) => 6 + (ctx.g ?? 1) },
        apply: (g, life, ctx, pass) => {
          const by = arrester(g, ctx);
          if (pass) {
            addHeat(g, life, ctx.n ?? -1, 12);
            addNotoriety(g, life, 2);
            journal(
              g,
              life,
              "Over a wall, through a yard, under a cart: gone.",
              "good",
            );
            if (by)
              journal(
                g,
                by,
                `${charName(meOf(g.s, life))} slipped your grip and ran.`,
                "bad",
              );
          } else {
            hurt(g, life, 6, "a beating from the watch");
            jail(
              g,
              life,
              crimeName(kindOf(ctx), ctx.r ?? 0),
              ctx.g ?? 1,
              ctx.n ?? -1,
            );
            if (by) {
              const c = crimeState(g, by);
              c.arrests = (c.arrests ?? 0) + 1;
              addRenown(g, by, 2);
              journal(
                g,
                by,
                `${charName(meOf(g.s, life))} ran, and you ran them down.`,
                "good",
              );
            }
          }
        },
      },
      {
        label: "Fight your way out",
        tip: "Violence: if it fails, the charge gets graver. Someone may die.",
        check: { skill: "fighting", dc: (g, life, ctx) => 8 + (ctx.g ?? 1) },
        apply: (g, life, ctx, pass) => {
          const by = arrester(g, ctx);
          if (pass) {
            addHeat(g, life, ctx.n ?? -1, 25);
            addNotoriety(g, life, 5);
            journal(
              g,
              life,
              "Fists, a stave, a lantern smashed, and you were away.",
              "good",
            );
            if (by) hurt(g, by, 10, "a rogue who fought back");
          } else {
            hurt(g, life, 12, "a fight with the watch");
            const killed = g.rng.chance(0.08);
            jail(
              g,
              life,
              killed
                ? "the murder of a watchman"
                : `${crimeName(kindOf(ctx), ctx.r ?? 0)} and assault`,
              killed ? 4 : (ctx.g ?? 1) + 1,
              ctx.n ?? -1,
            );
            if (by) {
              const c = crimeState(g, by);
              c.arrests = (c.arrests ?? 0) + 1;
              addRenown(g, by, 3);
            }
          }
        },
      },
    ],
  },
  {
    key: "crime-trial",
    pool: "raised",
    cooldown: 0,
    scene: "governor",
    title: "The quarter sessions",
    body: (g, life) => {
      const j = life.crime?.jail;
      const priors = life.crime?.record.length ?? 0;
      const s = sentenceFor(j?.grade ?? 1, priors);
      return `You stand at the bar at ${here(g, life)}, charged with ${j?.charge ?? "theft"}. The justices look at you over their spectacles. ${priors ? `They have your record: ${priors} conviction${priors === 1 ? "" : "s"}. ` : ""}Found guilty, the sentence would be ${s.text}.`;
    },
    choices: [
      {
        label: "Plead guilty and beg for mercy",
        tip: (g, life) => {
          const j = life.crime?.jail;
          return `A lighter sentence: ${sentenceFor(j?.grade ?? 1, life.crime?.record.length ?? 0, true).text}.`;
        },
        apply: (g, life) => sentence(g, life, true),
      },
      {
        label: "Plead not guilty",
        tip: "Persuade the jury. Renown and a patron help. Lose, and it's the full sentence.",
        check: {
          skill: "persuasion",
          dc: (g, life) =>
            7 +
            (life.crime?.jail?.grade ?? 1) -
            Math.min(3, Math.floor(life.renown / 20)) -
            (life.patron >= 0 ? 1 : 0),
        },
        apply: (g, life, ctx, pass) => {
          if (pass)
            acquit(
              g,
              life,
              "The jury is out an hour and comes back: not guilty. You walk out into the daylight.",
            );
          else sentence(g, life, false);
        },
      },
      {
        label: "Plead benefit of clergy",
        tip: "Read the neck verse (Psalm 51) to show you can read: the brand on your thumb instead of the rope. Once only.",
        blocked: (g, life) => {
          const j = life.crime?.jail;
          if (skillLevel(g.s, life, "letters") < 4)
            return "Needs letters 4: you must read the verse";
          if (life.crime?.branded) return "Only once in a life";
          if ((j?.grade ?? 1) >= 4) return "Not for murder";
          const n = g.s.nations[j?.nation ?? -1];
          if (n?.culture !== "english") return "Only under English law";
          return null;
        },
        apply: (g, life) => {
          const j = life.crime?.jail;
          if (!j) return;
          punish(
            g,
            life,
            { key: "brand", text: "branded on the thumb", n: 0 },
            j.charge,
            j.nation,
          );
        },
      },
      {
        label: (g, life, ctx) => `Buy the court (${courtBribe(ctx)} coins)`,
        tip: "A justice with debts, a juryman with a farm to save. If it's found out, it's worse.",
        check: { skill: "persuasion", dc: (g, life, ctx) => 6 + (ctx.g ?? 1) },
        blocked: (g, life, ctx) =>
          life.purse < courtBribe(ctx)
            ? `Needs ${courtBribe(ctx)} coins`
            : null,
        apply: (g, life, ctx, pass) => {
          spend(g, life, courtBribe(ctx));
          if (pass)
            acquit(
              g,
              life,
              "The case falls apart: a witness who can't remember, a justice in a hurry. Free.",
            );
          else {
            if (life.crime?.jail) life.crime.jail.grade += 1;
            sentence(g, life, false);
          }
        },
      },
    ],
  },
  {
    key: "crime-score",
    pool: "raised",
    cooldown: 0,
    scene: (g, life) =>
      life.job?.kind === "pirate"
        ? "deck"
        : life.job?.kind === "highwayman"
          ? "road"
          : "den",
    title: (g, life) => scoreOf(life).title,
    body: (g, life) => scoreOf(life).body.replace(/\{here\}/g, here(g, life)),
    choices: [
      {
        label: (g, life) => scoreOf(life).go,
        tip: "Rich if it goes well: coins and a name. Badly: the law hot on you, and maybe a hand on your collar.",
        check: {
          skill: (g, life) =>
            life.job && JOBS[life.job.kind].crime
              ? JOBS[life.job.kind].main
              : "stealth",
          dc: (g, life) => 7 + (life.job?.rank ?? 0),
        },
        apply: (g, life, ctx, pass) => {
          const rank =
            life.job && JOBS[life.job.kind].crime ? life.job.rank : 0;
          if (pass) {
            const got = 4 + 3 * (rank + 1) + g.rng.int(0, 6);
            earn(g, life, got);
            addNotoriety(g, life, 3);
            addHeat(g, life, ctx.n ?? -1, 10);
            journal(
              g,
              life,
              `It came off: ${got} coins, and they'll be talking about it in every tavern.`,
              "good",
            );
          } else {
            addHeat(g, life, ctx.n ?? -1, 18);
            addStress(g, life, 5);
            journal(g, life, "It went wrong from the start.", "bad");
            if (g.rng.chance(0.4)) {
              const k =
                life.job && JOBS[life.job.kind].crime ? life.job.kind : "thief";
              raiseEvent(g, life, "crime-seized", {
                g: Math.max(2, JOBS[k].crime?.grade ?? 2),
                n: ctx.n ?? -1,
                k: Object.keys(JOBS).indexOf(k),
                r: rank,
              });
            }
          }
        },
      },
      {
        label: (g, life) => scoreOf(life).careful,
        tip: "Less to gain, less to lose.",
        check: { skill: "stealth", dc: 5 },
        apply: (g, life, ctx, pass) => {
          const rank =
            life.job && JOBS[life.job.kind].crime ? life.job.rank : 0;
          if (pass) {
            const got = 2 + (rank + 1) + g.rng.int(0, 3);
            earn(g, life, got);
            addNotoriety(g, life, 1);
            addHeat(g, life, ctx.n ?? -1, 4);
            journal(
              g,
              life,
              `A modest take: ${got} coins, and no fuss.`,
              "good",
            );
          } else {
            addHeat(g, life, ctx.n ?? -1, 8);
            journal(g, life, "Nothing to show for it but a fright.", "bad");
          }
        },
      },
      {
        label: "Walk away",
        tip: "Some jobs are traps. This might be one.",
        apply: (g, life) => addStress(g, life, -1),
      },
    ],
  },
  {
    key: "law-collar",
    pool: "raised",
    cooldown: 0,
    scene: "gaol",
    title: "Caught in the act",
    body: (g, life, ctx) =>
      `On your rounds at ${here(g, life)} you catch a rogue ${["with a hand in a farmer's pocket", "climbing out of a merchant's window", "passing a pewter dollar at the baker's"][(ctx.g ?? 1) - 1] ?? "red-handed"}. They see you at the same moment.`,
    choices: [
      {
        label: "Take them up",
        tip: (g, life) =>
          life.job?.kind === "thieftaker"
            ? "Collar them: a reward from the court, and renown. They may fight."
            : "Collar them: the town's thanks and a small fee. They may fight.",
        check: {
          skill: "fighting",
          dc: (g, life, ctx) => 4 + (ctx.g ?? 1) * 2,
        },
        apply: (g, life, ctx, pass) => {
          gainXp(g, life, "fighting", 6);
          if (pass) {
            const reward =
              life.job?.kind === "thieftaker"
                ? 4 + 4 * (ctx.g ?? 1)
                : 1 + (ctx.g ?? 1);
            earn(g, life, reward);
            addRenown(g, life, 1);
            const c = crimeState(g, life);
            c.arrests = (c.arrests ?? 0) + 1;
            journal(
              g,
              life,
              `Collared and in irons. The court pays ${reward} coins.`,
              "good",
            );
          } else {
            hurt(g, life, 8, "a rogue's knife");
            journal(
              g,
              life,
              "A knife flashed, and they were gone over the wall.",
              "bad",
            );
          }
        },
      },
      {
        label: "Take the purse they offer",
        tip: "A few coins to look the other way. The underworld will know you're for sale; your masters may find out.",
        apply: (g, life, ctx) => {
          const got = 3 + 3 * (ctx.g ?? 1);
          earn(g, life, got);
          const c = crimeState(g, life);
          c.bribes = (c.bribes ?? 0) + 1;
          addNotoriety(g, life, 1);
          if (g.rng.chance(0.15)) foundOut(g, life);
          else journal(g, life, `${got} coins, and you saw nothing.`);
        },
      },
      {
        label: "Send them off with a warning",
        tip: "A cuff round the ear. Mercy has its own reputation.",
        apply: (g, life) => {
          addRenown(g, life, 0.3);
          addStress(g, life, -1);
        },
      },
    ],
  },
  {
    key: "law-bribe",
    pool: "raised",
    cooldown: 0,
    scene: "docks",
    title: "A quiet offer",
    body: (g, life, ctx) =>
      `You're sent to search a merchant's warehouse at ${here(g, life)} for goods landed without duty. The merchant meets you at the door with a smile and a purse: ${6 + 4 * (ctx.g ?? 1)} coins, "for your trouble".`,
    choices: [
      {
        label: "Search it anyway",
        tip: "Find the goods: a share of the seizure, and renown. The merchant won't forget.",
        check: { skill: "letters", dc: 6 },
        apply: (g, life, ctx, pass) => {
          if (pass) {
            const got = 5 + 3 * (ctx.g ?? 1);
            earn(g, life, got);
            addRenown(g, life, 2);
            journal(
              g,
              life,
              `False bottoms in the molasses casks. Your share of the seizure: ${got} coins.`,
              "good",
            );
          } else
            journal(
              g,
              life,
              "You found nothing, and the merchant smiled all the way to the door.",
            );
        },
      },
      {
        label: "Take the money",
        tip: "Easy money. If it's found out, your place may go with it.",
        apply: (g, life, ctx) => {
          earn(g, life, 6 + 4 * (ctx.g ?? 1));
          const c = crimeState(g, life);
          c.bribes = (c.bribes ?? 0) + 1;
          if (g.rng.chance(0.2)) foundOut(g, life);
        },
      },
      {
        label: "Report the offer",
        tip: "An honest officer's name, and the merchant's enmity.",
        apply: (g, life) => {
          addRenown(g, life, 1);
          const boss =
            life.job && !life.job.own
              ? g.s.chars[life.job.employer]
              : undefined;
          if (boss?.alive) remembers(g, life, boss, "An honest officer", 10, 2);
        },
      },
    ],
  },
];

/** A lawman's bribe found out. */
function foundOut(g: ConquestGame, life: Life): void {
  addRenown(g, life, -4);
  const boss =
    life.job && !life.job.own ? g.s.chars[life.job.employer] : undefined;
  if (boss?.alive) remembers(g, life, boss, "Takes bribes", -20, 2);
  addHeat(g, life, lawAt(g.s, life.prov), 10);
  journal(g, life, "Someone saw the money change hands. There's talk.", "bad");
}

function acquit(g: ConquestGame, life: Life, text: string): void {
  const c = crimeState(g, life);
  const j = c.jail;
  c.jail = null;
  if (j) addHeat(g, life, j.nation, -15);
  touchLife(g, life);
  journal(g, life, text, "good");
}

/** The court's sentence, with the governor's mercy for the rope. */
function sentence(g: ConquestGame, life: Life, lighter: boolean): void {
  const c = crimeState(g, life);
  const j = c.jail;
  if (!j) return;
  let s = sentenceFor(j.grade, c.record.length, lighter);
  if (s.key === "hang" && reprieved(g, life, j.nation)) {
    journal(
      g,
      life,
      "At the foot of the gallows a rider comes with the governor's reprieve: transportation instead.",
      "good",
    );
    s = {
      key: "transport",
      text: "transportation for seven years (reprieved from the rope)",
      n: 7,
    };
  }
  punish(g, life, s, j.charge, j.nation);
}
