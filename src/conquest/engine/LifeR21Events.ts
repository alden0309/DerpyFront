// LIFE (r21): round 21's scenes. The bawdy house (an evening there, the
// French pox, a husband or wife who hears of it, the minister's call) and a
// dead duellist's kin who come looking for you. Each rests with the event
// pacing as a family of its own, and none of them puts words or deeds into
// another player's character: a husband or wife who's played is told only
// what really happened, and decides for themselves.

import {
  BAWDY,
  bawdyCheck,
  bawdyOdds,
  bawdyRoll,
  companyCost,
  noteVisit,
} from "./Bawdy";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import { hooks, raiseEvent } from "./Hooks";
import { withFlow } from "./LedgerCore";
import { partWays, scandalize } from "./Liaisons";
import {
  addRenown,
  addStress,
  gainXp,
  heal,
  hurt,
  journal,
  remembers,
  spend,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import { charSkill, lifeOfChar, meOf, stationOf } from "./LifeQueries";
import {
  ldice,
  markOn,
  privateNote,
  r21Of,
  RAKE_DAYS,
  setMark,
} from "./LifeR21Core";
import { chanceWords } from "./Odds";
import { ageOf, charName, hasTrait } from "./Queries";
import { holderOf, postSkill } from "./Retinue";
import { rumour } from "./Rumours";
import type { Character, DuelAftermath, Life } from "./Types";

const he = (c: Character | undefined) => (c?.female ? "she" : "he");
const him = (c: Character | undefined) => (c?.female ? "her" : "him");
const his = (c: Character | undefined) => (c?.female ? "her" : "his");
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const who = (g: ConquestGame, ctx: LCtx) => g.s.chars[ctx.c];
const town = (g: ConquestGame, life: Life) =>
  g.map.provinces[life.prov]?.name ?? "the town";
/** "the minister": by the church of the town. */
function ministerHere(g: ConquestGame, life: Life): Character | undefined {
  return (g.s.locals[life.prov] ?? [])
    .map((id) => g.s.chars[id])
    .find((c) => c?.alive && c.role === "preacher");
}

// ---------------------------------------------------------------- the evening

/** What the evening comes to: seen, the pox, a husband or wife who hears. */
function evening(g: ConquestGame, life: Life, upstairs: boolean): void {
  const s = g.s;
  const me = meOf(s, life)!;
  noteVisit(g, life);
  const roll = bawdyRoll(g, life, upstairs);
  if (roll.seen) {
    setMark(g, life, "rake", RAKE_DAYS);
    const min = ministerHere(g, life);
    if (min)
      remembers(g, life, g.char(min.id), "Seen at the bawdy house", -15, 2);
    rumour(
      g,
      life.prov,
      `${charName(me)} was seen coming out of the bawdy house by the water${upstairs ? ", near dawn" : ""}.`,
      me.id,
      "bad",
    );
    const sp = s.chars[me.spouse];
    if (sp?.alive) scandalize(g, life, "Seen at the bawdy house", 120);
    privateNote(
      g,
      life,
      "Someone saw you go in, or come out. By tomorrow the town will know.",
      "bad",
    );
    if (roll.spouse && sp?.alive) {
      const theirs = lifeOfChar(s, sp.id);
      if (theirs) {
        // Another player is told what really happened, and decides for themselves.
        raiseEvent(g, theirs, "bawdy-told", { c: me.id });
        privateNote(
          g,
          life,
          `${sp.first} has heard where you spent the evening.`,
          "bad",
        );
      } else raiseEvent(g, life, "bawdy-wife", { c: sp.id });
    }
  }
  if (roll.pox) {
    const r = r21Of(touchLife(g, life));
    r.poxDue = s.day + ldice(s, 0xb4e, life.c, s.day).int(...BAWDY.poxDays);
  }
}

/** Pay for the evening, under its own name in the month's books. */
function pay(g: ConquestGame, life: Life, coins: number): void {
  withFlow(g, { key: "bawdy", label: "The bawdy house" }, () =>
    spend(g, life, coins),
  );
}

const EVENTS: LifeEventDef[] = [
  {
    key: "bawdy-evening",
    pool: "raised",
    cooldown: 0,
    scene: "bawdy",
    title: "The house by the water",
    body: (g, life) => {
      const o = bawdyOdds(g.s, life);
      return `A house by the water with its shutters closed by day. Inside: candles, a fiddler, a bowl of punch, cards on the green cloth, and the woman who keeps the house, who has seen every face in ${town(g, life)} at one time or another and remembers none of them in daylight. Everyone in her house is grown and free, and works for themselves; she'll tell you so before you ask.\nThe parlour is punch, cards and a song. Upstairs is company for the evening, and a door that closes.\n${cap(chanceWords(o.seenCompany))} someone sees you go upstairs (${chanceWords(o.seenParlour)} in the parlour)${o.spouse !== null ? `, and if you're seen, ${chanceWords(o.spouse)} your ${meOf(g.s, life)?.female ? "husband" : "wife"} hears of it` : ""}. Upstairs, ${chanceWords(o.pox)} the French pox, which marks you for good.`;
    },
    choices: [
      {
        label: (g, life) =>
          `Punch, cards and a song (${chanceWords(bawdyOdds(g.s, life).seenParlour)} you're seen) (${BAWDY.parlour.cost} coin)`,
        tip: `An evening in the parlour: cares ease (stress ${BAWDY.parlour.stress}).`,
        blocked: (_g, life) =>
          life.purse < BAWDY.parlour.cost
            ? `Needs ${BAWDY.parlour.cost} coin`
            : null,
        apply: (g, life) => {
          pay(g, life, BAWDY.parlour.cost);
          addStress(g, life, BAWDY.parlour.stress);
          privateNote(
            g,
            life,
            "Punch, a hand of loo, a song you knew the words to. You walk home lighter.",
            "good",
          );
          evening(g, life, false);
        },
      },
      {
        label: (g, life) => {
          const o = bawdyOdds(g.s, life);
          return `Company for the evening (${chanceWords(o.pox)} the pox, ${chanceWords(o.seenCompany)} you're seen) (${companyCost(stationOf(g.s, life).level)} coins)`;
        },
        tip: `Upstairs, and the door closes. Cares fall away (stress ${BAWDY.company.stress}). The risks are as they say.`,
        blocked: (g, life) =>
          life.purse < companyCost(stationOf(g.s, life).level)
            ? `Needs ${companyCost(stationOf(g.s, life).level)} coins`
            : null,
        apply: (g, life) => {
          pay(g, life, companyCost(stationOf(g.s, life).level));
          addStress(g, life, BAWDY.company.stress);
          privateNote(
            g,
            life,
            "You go upstairs. The door closes, and what's behind it is nobody's business. You come down near dawn.",
            "good",
          );
          evening(g, life, true);
        },
      },
      {
        label: "Think better of it, and go home",
        tip: "Nothing spent, nothing risked.",
        apply: (g, life) =>
          privateNote(g, life, "You think better of it, and walk home."),
      },
    ],
  },
  {
    key: "bawdy-wife",
    pool: "raised",
    cooldown: 365,
    scene: "home",
    title: (g, _l, ctx) =>
      `${who(g, ctx)?.female ? "Your wife" : "Your husband"} has heard`,
    body: (g, _life, ctx) => {
      const sp = who(g, ctx);
      return `${cap(sp?.first ?? "They")} is waiting up for you, by one candle. ${cap(he(sp))} has heard where you were: half the town has. ${cap(he(sp))} doesn't shout. That's the worst of it.`;
    },
    choices: [
      {
        label: "Beg forgiveness, and mean it",
        tip: "Persuasion: forgiven in time (−10 with them); fail, and it's bitter (−30).",
        check: { skill: "persuasion", dc: 9 },
        apply: (g, life, ctx, pass) => {
          const sp = who(g, ctx);
          if (!sp?.alive) return;
          remembers(
            g,
            life,
            g.char(sp.id),
            "A night at the bawdy house",
            pass ? -10 : -30,
            3,
          );
          addStress(g, life, pass ? 4 : 10);
          privateNote(
            g,
            life,
            pass
              ? `${sp.first} lets you sit down beside ${him(sp)}, in the end.`
              : `${sp.first} goes up to bed without a word, and bars the door.`,
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "Deny every word of it",
        tip: "Stealth: believed (−5); caught in the lie, much worse (−40).",
        check: { skill: "stealth", dc: 11 },
        apply: (g, life, ctx, pass) => {
          const sp = who(g, ctx);
          if (!sp?.alive) return;
          remembers(
            g,
            life,
            g.char(sp.id),
            pass
              ? "Talk about you in the town"
              : "Lied to me about the bawdy house",
            pass ? -5 : -40,
            pass ? 1 : 5,
          );
          addStress(g, life, pass ? 2 : 12);
          privateNote(
            g,
            life,
            pass
              ? `${sp.first} wants to believe you, and does, nearly.`
              : `${sp.first} knows a lie when ${he(sp)} hears one. ${cap(he(sp))} heard one.`,
            pass ? undefined : "bad",
          );
        },
      },
      {
        label: "Brazen it out",
        tip: "Many a husband did. They won't forget it (−35), and the town thinks less of you (−1 renown).",
        apply: (g, life, ctx) => {
          const sp = who(g, ctx);
          if (!sp?.alive) return;
          remembers(
            g,
            life,
            g.char(sp.id),
            "Shameless about the bawdy house",
            -35,
            5,
          );
          addRenown(g, life, -1);
          privateNote(
            g,
            life,
            `You tell ${sp.first} what other men do, and that it's none of ${his(sp)} business. The house is very quiet after that.`,
            "bad",
          );
        },
      },
    ],
  },
  {
    key: "bawdy-told",
    pool: "raised",
    cooldown: 0,
    scene: "home",
    title: "What the town is saying",
    body: (g, _life, ctx) => {
      const sp = who(g, ctx);
      return `The talk has reached your door: ${charName(sp)} was seen at the bawdy house by the water. Nobody says it to your face. Everybody says it.`;
    },
    choices: [
      {
        label: "Let it pass",
        tip: "Whatever you think of it, you keep it to yourself.",
        apply: (g, life) => addStress(g, life, 6),
      },
      {
        label: "Remember it",
        tip: "You'll not forget it soon (your own reckoning; nothing is done in their name).",
        apply: (g, life, ctx) => {
          addStress(g, life, 8);
          const sp = who(g, ctx);
          privateNote(
            g,
            life,
            `You won't forget what ${sp?.first ?? "they"} did.`,
            "bad",
          );
        },
      },
      {
        label: "Part ways",
        tip: "A divorce where your church allows it; else you live apart.",
        apply: (g, life) => partWays(g, life),
      },
    ],
  },
  {
    key: "bawdy-pox",
    pool: "raised",
    cooldown: 0,
    scene: "apothecary",
    title: "The French pox",
    body: () =>
      "A sore that won't heal, then a rash, then the fevers. The apothecary looks, and looks away, and names it: the French pox. It can be borne, and it can be hidden for a while. It doesn't leave.",
    choices: [
      {
        label: "Mercury from the apothecary (6 coins)",
        tip: "The cure of the day: it eases the worst of it (health +5, stress −5). The pox stays.",
        blocked: (_g, life) => (life.purse < 6 ? "Needs 6 coins" : null),
        apply: (g, life) => {
          withFlow(g, { key: "physic", label: "Physic" }, () =>
            spend(g, life, 6),
          );
          heal(g, life, 5);
          addStress(g, life, -5);
          privateNote(
            g,
            life,
            "Mercury, salivation, and a fortnight you'd rather forget. The worst of it passes.",
          );
        },
      },
      {
        label: "Say nothing, and bear it",
        tip: "Nobody need know (stress +8).",
        apply: (g, life) => addStress(g, life, 8),
      },
    ],
  },
  {
    key: "bawdy-sermon",
    pool: "raised",
    cooldown: 365,
    scene: "church",
    title: "The minister calls",
    body: (g, _life, ctx) => {
      const min = who(g, ctx);
      return `${charName(min)} calls, hat in hand, and won't sit. ${cap(he(min))} has heard where you spend your evenings, and so has the parish. "I'm not here to shame you. I'm here because I'd rather not bury you." ${cap(he(min))} has a text ready, and ${his(min)} own opinion of the house by the water.`;
    },
    choices: [
      {
        label: "Hear him out, and promise to mend your ways",
        tip: "The minister thinks better of you (+10); a little faith.",
        apply: (g, life, ctx) => {
          const min = who(g, ctx);
          if (min?.alive)
            remembers(
              g,
              life,
              g.char(min.id),
              "Promised to mend his ways",
              10,
              2,
            );
          gainXp(g, life, "faith", 5);
          addStress(g, life, -2);
        },
      },
      {
        label: "Argue scripture with him",
        tip: "Letters: he goes away thoughtful (renown +1); fail, and he goes away certain (−5 with him).",
        check: { skill: "letters", dc: 10 },
        apply: (g, life, ctx, pass) => {
          const min = who(g, ctx);
          if (pass) addRenown(g, life, 1);
          else if (min?.alive)
            remembers(g, life, g.char(min.id), "Argued scripture at me", -5, 2);
        },
      },
      {
        label: "Show him the door",
        tip: "Your business is your own (−10 with him).",
        apply: (g, life, ctx) => {
          const min = who(g, ctx);
          if (min?.alive)
            remembers(g, life, g.char(min.id), "Showed me the door", -10, 3);
        },
      },
    ],
  },
  {
    key: "duel-kin",
    pool: "raised",
    cooldown: 365,
    scene: "road",
    title: (g, _l, ctx) => `${charName(who(g, ctx))} has come for you`,
    body: (g, life, ctx) => {
      const kin = who(g, ctx);
      const dead = g.s.chars[ctx.d];
      const guard = holderOf(g.s, life, "bodyguard");
      return `${charName(kin)} has come looking for you, with ${his(kin)} ${dead?.female ? "mother's" : "father's"} pistol, or ${his(kin)} brother's, and ${charName(dead)}'s death on ${his(kin)} mind. ${cap(he(kin))} finds you in the street.${guard ? ` ${charName(g.s.chars[guard.c])}, your bodyguard, has seen ${him(kin)} first.` : ""}`;
    },
    choices: [
      {
        label: (g, life, ctx) => {
          const guard = holderOf(g.s, life, "bodyguard");
          const kin = who(g, ctx);
          return guard && kin
            ? `Let your bodyguard deal with ${him(kin)} (${chanceWords(kinOdds(g, life, ctx, true))})`
            : "Let your bodyguard deal with them";
        },
        tip: "Your bodyguard stands between you: if it goes their way, you're never touched.",
        blocked: (g, life) =>
          holderOf(g.s, life, "bodyguard") ? null : "You have no bodyguard",
        apply: (g, life, ctx) => {
          const kin = who(g, ctx);
          const ok = ldice(g.s, 0xd71, ctx.c, life.c).chance(
            kinOdds(g, life, ctx, true),
          );
          journal(
            g,
            life,
            ok
              ? `Your bodyguard has ${charName(kin)} against the wall before ${he(kin)} can draw, and sends ${him(kin)} home.`
              : `Your bodyguard takes the ball meant for you, and lives; ${charName(kin)} is gone before the watch comes.`,
            ok ? "good" : "bad",
          );
          if (kin?.alive)
            remembers(g, life, g.char(kin.id), "Killed my kin", -30, 10);
        },
      },
      {
        label: (g, life, ctx) =>
          `Face ${him(who(g, ctx))} yourself (${chanceWords(kinOdds(g, life, ctx, false))})`,
        tip: "Fighting: drive them off (renown +2); fail, and you're hurt (15 to 35).",
        apply: (g, life, ctx) => {
          const kin = who(g, ctx);
          const ok = ldice(g.s, 0xd72, ctx.c, life.c).chance(
            kinOdds(g, life, ctx, false),
          );
          gainXp(g, life, "fighting", 6);
          if (ok) {
            addRenown(g, life, 2);
            journal(
              g,
              life,
              `You knock the pistol from ${his(kin)} hand. ${cap(he(kin))} walks away; ${he(kin)} won't be back.`,
              "good",
            );
          } else
            hurt(
              g,
              life,
              ldice(g.s, 0xd73, ctx.c, life.c).int(15, 35),
              `an attack by ${charName(kin)}, kin of a man killed in a duel`,
            );
          if (kin?.alive)
            remembers(g, life, g.char(kin.id), "Killed my kin", -30, 10);
        },
      },
      {
        label: (g, _l, ctx) =>
          `Offer the blood price (${bloodPrice(g, ctx)} coins)`,
        tip: "Money for a death: it doesn't make it right, but it may make it over (−15 with them, not −30).",
        blocked: (g, life, ctx) =>
          life.purse < bloodPrice(g, ctx)
            ? `Needs ${bloodPrice(g, ctx)} coins`
            : null,
        apply: (g, life, ctx) => {
          const kin = who(g, ctx);
          withFlow(g, { key: "blood", label: "A blood price" }, () =>
            spend(g, life, bloodPrice(g, ctx)),
          );
          if (kin?.alive)
            remembers(
              g,
              life,
              g.char(kin.id),
              "Paid for my kin's death",
              -15,
              10,
            );
          journal(
            g,
            life,
            `${charName(kin)} takes your money and spits on the step. It's over, near enough.`,
          );
        },
      },
    ],
  },
];

/** The chance of seeing a dead man's kin off: your bodyguard's fighting, or your own. */
export function kinOdds(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  guard: boolean,
): number {
  const kin = who(g, ctx);
  const theirs = kin ? charSkill(g.s, kin, "fighting") : 5;
  const f = guard ? holderOf(g.s, life, "bodyguard") : undefined;
  const mine = f
    ? postSkill(g.s, f, "bodyguard") + 2
    : charSkill(g.s, meOf(g.s, life)!, "fighting");
  return Math.max(0.1, Math.min(0.95, 0.6 + (mine - theirs) * 0.07));
}

const bloodPrice = (g: ConquestGame, ctx: LCtx) => {
  const dead = g.s.chars[ctx.d];
  return dead?.role === undefined ? 10 : 15;
};

let paced = false;

/** The scenes, added the first time an event is looked up (LifeEvents' byKey). */
export function lifeR21Events(): LifeEventDef[] {
  if (!paced) {
    paced = true;
    registerFamily(
      "bawdy",
      ["bawdy-wife", "bawdy-told", "bawdy-sermon", "bawdy-pox"],
      120,
    );
    registerFamily("vengeance", ["duel-kin"], 365);
  }
  return EVENTS;
}

/** Left unanswered, the quiet course. */
export function lifeR21Quiet(): Record<string, number> {
  return {
    "bawdy-evening": 2,
    "bawdy-wife": 0,
    "bawdy-told": 0,
    "bawdy-pox": 1,
    "bawdy-sermon": 0,
    "duel-kin": 2,
  };
}

// ---------------------------------------------------------------- what's due

/** A dead duellist's kin may come for you (an aftermath of the duel). */
function kinAfterDuel(g: ConquestGame, life: Life, d: DuelAftermath): void {
  const s = g.s;
  const me = meOf(s, life);
  if (!me || d.dead < 0 || d.dead === me.id) return;
  const dead = s.chars[d.dead];
  if (!dead || lifeOfChar(s, dead.id)) return;
  const kin = [
    ...dead.children.map((id) => s.chars[id]),
    ...[s.chars[dead.father], s.chars[dead.mother]].flatMap((p) =>
      p ? p.children.map((id) => s.chars[id]) : [],
    ),
  ].find(
    (c) =>
      !!c?.alive &&
      c.id !== dead.id &&
      c.id !== me.id &&
      !c.abroad &&
      ageOf(s, c) >= 18 &&
      !lifeOfChar(s, c.id),
  );
  if (!kin) return;
  const r = ldice(s, 0xd70, dead.id, me.id);
  const p = hasTrait(kin, "brave") || hasTrait(kin, "cruel") ? 0.45 : 0.25;
  if (!r.chance(p)) return;
  const st = r21Of(touchLife(g, life));
  st.kin = [
    ...(st.kin ?? []),
    { c: kin.id, dead: dead.id, due: s.day + r.int(20, 90) },
  ];
}

/** Each day: the pox shows itself; a dead man's kin arrive. */
function dueDaily(g: ConquestGame, life: Life): void {
  const st = life.r21;
  if (!st || (!st.poxDue && !st.kin?.length)) return;
  const s = g.s;
  if (st.poxDue && st.poxDue <= s.day) {
    touchLife(g, life);
    delete st.poxDue;
    setMark(g, life, "pox", 0);
    hurt(g, life, BAWDY.poxHealth, "the French pox");
    if (life.c >= 0) raiseEvent(g, life, "bawdy-pox", {});
  }
  if (st.kin?.length && !life.travel) {
    const due = st.kin.find((k) => k.due <= s.day);
    if (due) {
      touchLife(g, life);
      st.kin = st.kin.filter((k) => k !== due);
      if (s.chars[due.c]?.alive)
        raiseEvent(g, life, "duel-kin", { c: due.c, d: due.dead });
    }
  }
}

/** The bawdy house's evening: a scene (the act at the place raises it). */
export function bawdyVisit(g: ConquestGame, life: Life): string | null {
  const ok = bawdyCheck(g.s, life);
  if (!ok.ok) return ok.why;
  raiseEvent(g, life, "bawdy-evening", {});
  return null;
}

/** Once a rake, the minister may call (raised here, at most once a year). */
function sermonMonthly(g: ConquestGame, life: Life): void {
  const s = g.s;
  if (!markOn(s, life, "rake")) return;
  if ((life.cooldowns["ev:bawdy-sermon"] ?? 0) > s.day) return;
  const min = ministerHere(g, life);
  if (!min || lifeOfChar(s, min.id)) return;
  if (!ldice(s, 0xb4f, life.c, min.id).chance(SERMON_CHANCE)) return;
  raiseEvent(g, life, "bawdy-sermon", { c: min.id });
}

/** The minister's call: a chance a month while you're known for it. */
export const SERMON_CHANCE = 1 / 4;

hooks.duelAftermath.push(kinAfterDuel);
hooks.lifeDaily.push(dueDaily);
hooks.lifeMonthly.push(sermonMonthly);
