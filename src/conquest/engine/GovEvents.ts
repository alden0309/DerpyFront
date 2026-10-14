// GOV (r21): the governor's scenes. A treaty council with a native nation
// (the presents laid down, and what to ask for); the matters that come to
// the governor's desk, a month or so apart, each with its own weight to
// carry (a boundary between two planters, a smuggler's sloop, a plea for
// mercy, envoys with a complaint, a frontier that wants protecting, the
// smallpox in the port, a privateer's commission, a fast day, a fire, a
// councillor's son, squatters beyond the line, the college, the house's
// grievances, pirates off the coast); and the question of independence
// (a member's vote, the governor's declaration, everyone's side). Each
// choice says what it does; nothing in them speaks for another player.

import { formatDate } from "./Calendar";
import { kill } from "./Characters";
import { relate } from "./Council";
import { economyCommand } from "./Economy";
import { registerFamily } from "./EventPacing";
import type { ConquestGame } from "./Game";
import {
  deskOf,
  deskView,
  governedBy,
  nativeNeighbours,
  RANGERS,
} from "./GovDesk";
import { hooks, raiseEvent } from "./Hooks";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  journal,
  remembers,
  touchLife,
} from "./LifeCore";
import type { LCtx, LifeEventDef } from "./LifeEvents";
import {
  atWar,
  buyCheck,
  charName,
  provincesOf,
  relationOf,
  settlers,
} from "./Queries";
import { declareRev, revDivision, revSide, voteMotion } from "./Revolution";
import { DAYS_PER_YEAR } from "./Rules";
import { hash01 } from "./SocietyCore";
import { addFavor } from "./Standing";
import type { Character, Life, ModFx } from "./Types";
import { worldRng } from "./WorldRng";

const name = (g: ConquestGame, p: number) =>
  g.map.provinces[p]?.name ?? "the county";
const nat = (g: ConquestGame, o: number) => g.s.nations[o]?.name ?? "nation";
const gold = (g: ConquestGame, n: number) => g.s.nations[n]?.gold ?? 0;
const short = (need: number) => (g: ConquestGame, _l: Life, ctx: LCtx) =>
  gold(g, ctx.n) < need
    ? `The treasury holds ${Math.floor(gold(g, ctx.n))} gold`
    : null;

function natMod(
  g: ConquestGame,
  n: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
): void {
  const x = g.nation(n);
  x.mods = x.mods.filter((m) => m.key !== key);
  x.mods.push({ key, label, until: g.s.day + days, fx });
}

function provMod(
  g: ConquestGame,
  p: number,
  key: string,
  label: string,
  days: number,
  fx: Partial<Record<ModFx, number>>,
): void {
  const pr = g.prov(p);
  pr.mods = pr.mods.filter((m) => m.key !== key);
  pr.mods.push({ key, label, until: g.s.day + days, fx });
}

const pay = (g: ConquestGame, n: number, v: number) => {
  g.nation(n).gold = Math.max(0, Math.round((gold(g, n) - v) * 10) / 10);
};

/** Someone of the computer's the governor has a quarrel with (or a kindness from). */
function feel(
  g: ConquestGame,
  life: Life,
  c: number,
  why: string,
  v: number,
  years = 4,
) {
  const ch = g.s.chars[c];
  if (ch?.alive) remembers(g, life, g.char(c), why, v, years);
}

const who = (g: ConquestGame, c: number) => charName(g.s.chars[c]);

// ---------------------------------------------------------------- a treaty council

const COUNCIL_EVENT: LifeEventDef = {
  key: "gov-council",
  pool: "raised",
  cooldown: 0,
  scene: "councilfire",
  title: (g, _life, ctx) => `A treaty council with the ${nat(g, ctx.o)}`,
  body: (g, _life, ctx) => {
    const s = g.s;
    const rel = relationOf(s, g.w, ctx.o, ctx.n).total;
    const war = atWar(s, ctx.o, ctx.n);
    return `The ${nat(g, ctx.o)} have come to the council ground: the sachems and the clan mothers' speakers, the young men behind them. The presents are laid out (cloth, kettles, powder, a silver gorget), the pipe goes round, and the speeches begin. They think ${rel >= 25 ? "well" : rel >= 0 ? "neither well nor ill" : "ill"} of the colony (${rel}).${war ? " You are at war: they've come under a flag of truce." : ""}\n\nWhat do you ask of them?`;
  },
  choices: [
    {
      label: (g, _l, ctx) =>
        atWar(g.s, ctx.o, ctx.n)
          ? "Offer peace, as things stand"
          : "A covenant of friendship",
      tip: (g, _l, ctx) =>
        atWar(g.s, ctx.o, ctx.n)
          ? "Persuasion: if it lands, they'll weigh a peace as things stand (their own answer); either way, they think better of you for asking (+6)."
          : "Persuasion: if it lands, the covenant is renewed (+15 for ten years); if not, the presents are remembered (+4).",
      check: { skill: "persuasion", dc: 8 },
      apply: (g, life, ctx, pass) => {
        const s = g.s;
        if (atWar(s, ctx.o, ctx.n)) {
          relate(
            g,
            ctx.o,
            ctx.n,
            "Came to the council under a flag of truce",
            6,
            3,
          );
          if (pass) {
            const err = g.command(ctx.n, {
              k: "peace",
              n: ctx.o,
              terms: { take: [], give: [], gold: 0 },
            });
            journal(
              g,
              life,
              err
                ? `They heard you out, but: ${err}`
                : `You offer the ${nat(g, ctx.o)} peace as things stand.`,
              err ? "bad" : "good",
            );
          } else
            journal(
              g,
              life,
              "They listened, and went home to their war.",
              "bad",
            );
          return;
        }
        relate(
          g,
          ctx.o,
          ctx.n,
          pass ? "The covenant renewed" : "Presents at the council",
          pass ? 15 : 4,
          pass ? 10 : 3,
        );
        gainXp(g, life, "persuasion", 8);
        journal(
          g,
          life,
          pass
            ? `The covenant with the ${nat(g, ctx.o)} is renewed: belts exchanged, the chain polished.`
            : "Fine speeches on both sides, and nothing promised.",
          pass ? "good" : undefined,
        );
      },
    },
    {
      label: "A treaty of trade",
      tip: "Trade: if they're willing (and the speeches go well), the markets open between you.",
      check: { skill: "trade", dc: 8 },
      blocked: (g, _l, ctx) => (atWar(g.s, ctx.o, ctx.n) ? "At war" : null),
      apply: (g, life, ctx, pass) => {
        relate(g, ctx.o, ctx.n, "Presents at the council", 4, 3);
        if (!pass) {
          journal(g, life, "They'll think about it, they say.");
          return;
        }
        relate(g, ctx.o, ctx.n, "A good council", 8, 3);
        const err = g.command(ctx.n, { k: "treaty", n: ctx.o, t: "trade" });
        journal(
          g,
          life,
          err
            ? `They won't put their marks to it: ${err}`
            : `A treaty of trade with the ${nat(g, ctx.o)}.`,
          err ? "bad" : "good",
        );
      },
    },
    {
      label: "Ask them to sell land on the border",
      tip: (g, _l, ctx) => {
        const p = landFor(g, ctx.n, ctx.o);
        return p < 0
          ? "There's no land of theirs they'd sell you now (they must think well of you, and it must border yours)."
          : `Persuasion, harder: if it goes well, ${name(g, p)} for ${buyCheck(g.s, g.w, ctx.n, p).price} gold from the treasury. They'll remember it.`;
      },
      check: { skill: "persuasion", dc: 10 },
      blocked: (g, _l, ctx) =>
        landFor(g, ctx.n, ctx.o) < 0 ? "Nothing they'd sell" : null,
      apply: (g, life, ctx, pass) => {
        const p = landFor(g, ctx.n, ctx.o);
        if (!pass || p < 0) {
          relate(g, ctx.o, ctx.n, "Asked us to sell our land", -4, 3);
          journal(
            g,
            life,
            "The land is not theirs to sell, they say: it's their grandchildren's.",
          );
          return;
        }
        const err = g.command(ctx.n, { k: "buy", p });
        journal(
          g,
          life,
          err
            ? `The deed came to nothing: ${err}`
            : `The ${nat(g, ctx.o)} put their marks to a deed for ${name(g, p)}.`,
          err ? "bad" : "good",
        );
      },
    },
    {
      label: "Speeches and presents, and nothing asked",
      tip: "They think the better of you for it (+8 for three years).",
      apply: (g, life, ctx) => {
        relate(g, ctx.o, ctx.n, "Presents freely given at the council", 8, 3);
        journal(
          g,
          life,
          `The ${nat(g, ctx.o)} go home with the presents, and the council fire is warmer for it.`,
          "good",
        );
      },
    },
  ],
};

/** Land of theirs on the colony's border they'd sell now, or -1. */
function landFor(g: ConquestGame, n: number, o: number): number {
  for (const p of provincesOf(g.s, o))
    if (buyCheck(g.s, g.w, n, p).ok) return p;
  return -1;
}

// ---------------------------------------------------------------- the desk's matters

/** A matter: when it fits, and its scene (ctx: n, and p/c/c2/o as it needs). */
interface Matter {
  def: LifeEventDef;
  /** The context it needs, or null if it doesn't fit now. */
  when: (g: ConquestGame, n: number, r: () => number) => LCtx | null;
}

/** Someone of the colony of a sort (planters, merchants...), steady for a salt. */
function someone(
  g: ConquestGame,
  n: number,
  roles: string[],
  r: () => number,
  not = -1,
): Character | undefined {
  const s = g.s;
  const out: Character[] = [];
  for (const p of provincesOf(s, n))
    for (const id of s.locals[p] ?? []) {
      const c = s.chars[id];
      if (
        c?.alive &&
        !c.abroad &&
        c.id !== not &&
        c.role &&
        roles.includes(c.role)
      )
        out.push(c);
    }
  if (!out.length) return undefined;
  return out[Math.floor(r() * out.length) % out.length];
}

function frontierOf(g: ConquestGame, n: number): number {
  const s = g.s;
  for (const p of provincesOf(s, n))
    if (
      g.map.provinces[p].nb.some(([q]) => {
        const o = s.provinces[q].owner;
        return o >= 0 && s.nations[o]?.kind === "native";
      })
    )
      return p;
  return -1;
}

const MATTERS: Matter[] = [
  {
    when: (g, n, r) => {
      const a = someone(g, n, ["planter"], r);
      const b = a && someone(g, n, ["planter", "labourer", "master"], r, a.id);
      return a && b
        ? { n, c: a.id, c2: b.id, p: a.home ?? g.s.nations[n].capital }
        : null;
    },
    def: {
      key: "gov-boundary",
      pool: "raised",
      cooldown: 0,
      scene: "governor",
      title: "A boundary in dispute",
      body: (g, _l, ctx) =>
        `${who(g, ctx.c)} and ${who(g, ctx.c2)} have both ridden to the capital with their deeds, their surveyors' plats and their lawyers, over forty acres of bottomland at ${name(g, ctx.p)} that each says is his. The county court couldn't settle it; it's come to you.`,
      choices: [
        {
          label: (g, _l, ctx) => `Find for ${who(g, ctx.c)}`,
          tip: "The richer man: he and his friends are grateful (+15); the other is not (−15).",
          apply: (g, life, ctx) => {
            feel(g, life, ctx.c, "Found for me in the boundary case", 15);
            feel(g, life, ctx.c2, "Found against me in the boundary case", -15);
          },
        },
        {
          label: (g, _l, ctx) => `Find for ${who(g, ctx.c2)}`,
          tip: "The smaller man: the county thinks the better of you (unrest −2 there for a year); the planter is furious (−20).",
          apply: (g, life, ctx) => {
            feel(g, life, ctx.c2, "Found for me in the boundary case", 15);
            feel(g, life, ctx.c, "Found against me in the boundary case", -20);
            provMod(
              g,
              ctx.p,
              "r21:just",
              "A just finding by the governor",
              DAYS_PER_YEAR,
              { unrest: -2 },
            );
          },
        },
        {
          label: "Send the surveyor-general to run the line again (3 gold)",
          tip: "Letters: a fair line both can live with (+5 each); badly done, both are aggrieved (−5).",
          check: { skill: "letters", dc: 8 },
          blocked: short(3),
          apply: (g, life, ctx, pass) => {
            pay(g, ctx.n, 3);
            feel(
              g,
              life,
              ctx.c,
              pass ? "A fair line run" : "A muddled survey",
              pass ? 5 : -5,
            );
            feel(
              g,
              life,
              ctx.c2,
              pass ? "A fair line run" : "A muddled survey",
              pass ? 5 : -5,
            );
          },
        },
      ],
    },
  },
  {
    when: (g, n, r) => {
      const ports = provincesOf(g.s, n).filter(
        (p) => (g.s.provinces[p].b.port ?? 0) > 0,
      );
      const m = someone(g, n, ["merchant", "captain"], r);
      return ports.length && m
        ? { n, c: m.id, p: ports[Math.floor(r() * ports.length)] }
        : null;
    },
    def: {
      key: "gov-smuggler",
      pool: "raised",
      cooldown: 0,
      scene: "docks",
      title: "A sloop seized",
      body: (g, _l, ctx) =>
        `The collector at ${name(g, ctx.p)} has seized a sloop running French molasses in without a cocket. She belongs to ${who(g, ctx.c)}, who swears it's all a misunderstanding and has sent you a very fine hogshead of Madeira while you consider it.`,
      choices: [
        {
          label: "Condemn her and sell her",
          tip: "15 gold to the treasury, and London is pleased (favour +2 for a year); the merchants of the colony are not (−10 from her owner).",
          apply: (g, life, ctx) => {
            g.nation(ctx.n).gold += 15;
            natMod(
              g,
              ctx.n,
              "r21:customs",
              "Smugglers condemned",
              DAYS_PER_YEAR,
              { favor: 2 },
            );
            feel(g, life, ctx.c, "Condemned my sloop", -10);
          },
        },
        {
          label: "Fine the master and let her go",
          tip: "5 gold to the treasury; nobody's very happy, nobody's very angry.",
          apply: (g, _l, ctx) => {
            g.nation(ctx.n).gold += 5;
          },
        },
        {
          label: "Keep the Madeira, and let her go",
          tip: "6 coins' worth in your own cellar and her owner's friendship (+10); Stealth, or it gets out (favour −5 and a name for it).",
          check: { skill: "stealth", dc: 8 },
          apply: (g, life, ctx, pass) => {
            earn(g, life, 6);
            feel(g, life, ctx.c, "Let my sloop go", 10);
            if (!pass) {
              addFavor(g, life, -5);
              addRenown(g, life, -2);
              journal(
                g,
                life,
                "The story of the Madeira is all over the coffee houses.",
                "bad",
              );
            }
          },
        },
      ],
    },
  },
  {
    when: (g, n, r) => {
      const c = someone(g, n, ["labourer", "sailor", "soldier", "maker"], r);
      return c ? { n, c: c.id } : null;
    },
    def: {
      key: "gov-mercy",
      pool: "raised",
      cooldown: 0,
      scene: "governor",
      title: "A plea for mercy",
      body: (g, _l, ctx) =>
        `${who(g, ctx.c)} lies under sentence of death for horse-stealing. His wife has walked from the county with their children to kneel at the door of the governor's house, and the minister has written for him. The judge writes that the law is the law.`,
      choices: [
        {
          label: "Pardon him",
          tip: "The town thinks you merciful (unrest −1 for a year); the bench thinks you soft (the attorney general −5).",
          apply: (g, life, ctx) => {
            feel(g, life, ctx.c, "Pardoned me", 30, 10);
            natMod(
              g,
              ctx.n,
              "r21:mercy",
              "A merciful governor",
              DAYS_PER_YEAR,
              { unrest: -1 },
            );
            const att = g.s.power?.cabinets[ctx.n]?.attorney ?? -1;
            if (att >= 0) feel(g, life, att, "Pardoned a felon", -5);
          },
        },
        {
          label: "Commute it to transportation",
          tip: "He'll live, a long way off. Nobody's grateful, nobody's outraged.",
          apply: (g, life, ctx) => {
            feel(g, life, ctx.c, "Spared my life", 10);
          },
        },
        {
          label: "Let the law take its course",
          tip: "The bench approves (+3 with the attorney general); his family won't forget (stress +3).",
          apply: (g, life, ctx) => {
            addStress(g, life, 3);
            const att = g.s.power?.cabinets[ctx.n]?.attorney ?? -1;
            if (att >= 0) feel(g, life, att, "Upheld the court", 3);
            const c = g.s.chars[ctx.c];
            if (c?.alive) {
              kill(g, c, "the hangman, for horse-stealing");
              journal(g, life, `${charName(c)} hanged at the next assizes.`);
            }
          },
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const os = nativeNeighbours(g.s, g.w, n).filter((o) => !atWar(g.s, o, n));
      return os.length ? { n, o: os[g.s.day % os.length] } : null;
    },
    def: {
      key: "gov-envoys",
      pool: "raised",
      cooldown: 0,
      scene: "councilfire",
      title: (g, _l, ctx) => `Envoys of the ${nat(g, ctx.o)}`,
      body: (g, _l, ctx) =>
        `Envoys of the ${nat(g, ctx.o)} are at the governor's house with a string of wampum and a complaint: traders from the colony get their hunters drunk and take their winter's skins for a keg of watered rum, and the weights are false. They want it stopped.`,
      choices: [
        {
          label: "Have the traders taken up and fined",
          tip: "They see it done (+10 for five years); the traders and their friends grumble.",
          apply: (g, _l, ctx) =>
            relate(
              g,
              ctx.o,
              ctx.n,
              "The governor punished the cheating traders",
              10,
              5,
            ),
        },
        {
          label: "Pay compensation from the treasury (10 gold)",
          tip: "Generous (+12 for five years), and the traders go on as before.",
          blocked: short(10),
          apply: (g, _l, ctx) => {
            pay(g, ctx.n, 10);
            relate(
              g,
              ctx.o,
              ctx.n,
              "Compensation for the traders' cheating",
              12,
              5,
            );
          },
        },
        {
          label: "Send them home with presents (4 gold)",
          tip: "Politeness, and nothing done (+3).",
          blocked: short(4),
          apply: (g, _l, ctx) => {
            pay(g, ctx.n, 4);
            relate(g, ctx.o, ctx.n, "Presents, and nothing done", 3, 2);
          },
        },
        {
          label: "Tell them to keep their hunters sober",
          tip: "They go home angry (−10 for five years).",
          apply: (g, _l, ctx) =>
            relate(
              g,
              ctx.o,
              ctx.n,
              "The governor laughed at our complaint",
              -10,
              5,
            ),
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const p = frontierOf(g, n);
      return p >= 0 ? { n, p } : null;
    },
    def: {
      key: "gov-frontier",
      pool: "raised",
      cooldown: 0,
      scene: "fields",
      title: "The frontier asks for protection",
      body: (g, _l, ctx) =>
        `A petition from ${name(g, ctx.p)}, two hundred marks and names: the war parties come through every summer, the blockhouses are rotten, and the families on the far farms sleep with their muskets. They want soldiers, or a fort, or rangers in the woods, and they want them before the corn's in.`,
      choices: [
        {
          label: `Raise a ranging company (${RANGERS.gold} gold a month)`,
          tip: "Rangers in the woods: a war party is likelier to be met and turned (a quarter of the time each company). Unrest −3 there for a year.",
          blocked: (g, _l, ctx) =>
            (deskView(g.s, ctx.n).rangers ?? 0) >= RANGERS.max
              ? "As many as there can be"
              : null,
          apply: (g, life, ctx) => {
            const d = deskOf(g, ctx.n);
            d.rangers = Math.min(RANGERS.max, (d.rangers ?? 0) + 1);
            provMod(
              g,
              ctx.p,
              "r21:heard",
              "The governor heard the frontier",
              DAYS_PER_YEAR,
              { unrest: -3 },
            );
            journal(
              g,
              life,
              `A ranging company is raised for the frontier (${d.rangers} in all).`,
            );
          },
        },
        {
          label: "Order a fort built there",
          tip: "From the treasury, if it can be built (the usual cost). Unrest −3 there for a year.",
          apply: (g, life, ctx) => {
            const err = economyCommand(g, ctx.n, {
              k: "build",
              p: ctx.p,
              b: "fort",
            });
            if (err)
              journal(
                g,
                life,
                `A fort can't be built at ${name(g, ctx.p)}: ${err}`,
                "bad",
              );
            else
              provMod(
                g,
                ctx.p,
                "r21:heard",
                "The governor heard the frontier",
                DAYS_PER_YEAR,
                { unrest: -3 },
              );
          },
        },
        {
          label: "Tell them to look to their own muskets",
          tip: "Nothing spent; the frontier remembers (unrest +4 there for a year).",
          apply: (g, _l, ctx) =>
            provMod(
              g,
              ctx.p,
              "r21:ignored",
              "The governor wouldn't protect them",
              DAYS_PER_YEAR,
              { unrest: 4 },
            ),
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const cap = g.s.nations[n].capital;
      return cap >= 0 && (g.s.provinces[cap].b.port ?? 0) > 0
        ? { n, p: cap }
        : null;
    },
    def: {
      key: "gov-quarantine",
      pool: "raised",
      cooldown: 0,
      scene: "docks",
      title: "The smallpox in a ship",
      body: (g, _l, ctx) =>
        `A ship from the islands lies in the roads off ${name(g, ctx.p)} with the smallpox aboard. Her master wants to land his cargo; the merchants want their goods; the physicians want her kept out.`,
      choices: [
        {
          label: "Quarantine the harbour for forty days",
          tip: "Sickness much less likely for half a year (disease −20%); trade suffers (production −3%) and the merchants grumble.",
          apply: (g, _l, ctx) =>
            natMod(g, ctx.n, "r21:quarantine", "The harbour quarantined", 180, {
              disease: -0.2,
              production: -0.03,
            }),
        },
        {
          label: "Let her land, and trust to God",
          tip: "Trade goes on; sickness likelier for half a year (+15%).",
          apply: (g, _l, ctx) =>
            natMod(g, ctx.n, "r21:quarantine", "The smallpox let ashore", 180, {
              disease: 0.15,
            }),
        },
      ],
    },
  },
  {
    when: (g, n, r) => {
      const war = g.s.wars.find(
        (w) =>
          (w.a === n || w.b === n) &&
          g.s.nations[w.a === n ? w.b : w.a]?.kind === "power",
      );
      const c = someone(g, n, ["captain", "merchant", "sailor"], r);
      return war && c ? { n, c: c.id, o: war.a === n ? war.b : war.a } : null;
    },
    def: {
      key: "gov-marque",
      pool: "raised",
      cooldown: 0,
      scene: "docks",
      title: "A letter of marque",
      body: (g, _l, ctx) =>
        `${who(g, ctx.c)} has a fast sloop, twelve guns and sixty men who'd rather take ${nat(g, ctx.o)} prizes than fish. He asks the governor's commission to cruise against the enemy, and offers the usual fee.`,
      choices: [
        {
          label: "Grant the commission (5 gold to the treasury)",
          tip: "Prizes come into port: taxes +3% for a year; the enemy takes it ill.",
          apply: (g, life, ctx) => {
            g.nation(ctx.n).gold += 5;
            natMod(
              g,
              ctx.n,
              "r21:marque",
              "Privateers in the colony's ports",
              DAYS_PER_YEAR,
              { tax: 0.03 },
            );
            feel(g, life, ctx.c, "Granted me a commission", 10);
          },
        },
        {
          label: "Refuse it",
          tip: "No prizes, no trouble.",
          apply: (g, life, ctx) =>
            feel(g, life, ctx.c, "Refused me a commission", -5),
        },
      ],
    },
  },
  {
    when: (g, n) => ({ n }),
    def: {
      key: "gov-fast",
      pool: "raised",
      cooldown: 0,
      scene: "church",
      title: "A day of fasting asked",
      body: () =>
        "The ministers of the colony, in a body, ask for a day of public fasting and humiliation: the drought, the sickness, the sins of the age. The taverns are against it.",
      choices: [
        {
          label: "Proclaim it",
          tip: "Unrest −1 and favour at home +1 for half a year; Faith grows.",
          apply: (g, life, ctx) => {
            natMod(g, ctx.n, "r21:fast", "A day of fasting", 180, {
              unrest: -1,
              favor: 1,
            });
            gainXp(g, life, "faith", 6);
          },
        },
        {
          label: "Decline, with respect",
          tip: "The ministers think you worldly (stress +2).",
          apply: (g, life) => addStress(g, life, 2),
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const cap = g.s.nations[n].capital;
      return cap >= 0 && settlers(g.s.provinces[cap]) >= 400
        ? { n, p: cap }
        : null;
    },
    def: {
      key: "gov-fire",
      pool: "raised",
      cooldown: 0,
      scene: "market",
      title: "Fire in the town",
      body: (g, _l, ctx) =>
        `Fire in ${name(g, ctx.p)} in the night: a chandler's shop, then the whole row down to the wharf. Thirty families are in the churchyard with what they carried out.`,
      choices: [
        {
          label: "Relief from the treasury (15 gold)",
          tip: "Bread, blankets and timber: unrest −4 there for a year, and renown +2.",
          blocked: short(15),
          apply: (g, life, ctx) => {
            pay(g, ctx.n, 15);
            provMod(
              g,
              ctx.p,
              "r21:relief",
              "The governor's relief after the fire",
              DAYS_PER_YEAR,
              { unrest: -4 },
            );
            addRenown(g, life, 2);
          },
        },
        {
          label: "Let the parishes see to it",
          tip: "Nothing spent; unrest +2 there for a year.",
          apply: (g, _l, ctx) =>
            provMod(
              g,
              ctx.p,
              "r21:fire",
              "Burned out and left to it",
              DAYS_PER_YEAR,
              { unrest: 2 },
            ),
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const s = g.s;
      const council = Object.values(s.nations[n].council).filter(
        (c) => c >= 0 && s.chars[c]?.alive,
      );
      return council.length ? { n, c: council[s.day % council.length] } : null;
    },
    def: {
      key: "gov-patronage",
      pool: "raised",
      cooldown: 0,
      scene: "governor",
      title: "A place for a councillor's son",
      body: (g, _l, ctx) =>
        `${who(g, ctx.c)}, of your council, has a son of twenty with no prospects and a good seat on a horse. He'd take it very kindly if the young man were made naval officer of the port, or clerk of the courts, or anything with a salary.`,
      choices: [
        {
          label: "Find the boy a place",
          tip: "The councillor is grateful (+15); the country party notes another placeman (unrest +1 for a year).",
          apply: (g, life, ctx) => {
            feel(g, life, ctx.c, "Found my son a place", 15);
            natMod(g, ctx.n, "r21:placemen", "Placemen", DAYS_PER_YEAR, {
              unrest: 1,
            });
          },
        },
        {
          label: "Regret that nothing is open",
          tip: "The councillor is offended (−12).",
          apply: (g, life, ctx) =>
            feel(g, life, ctx.c, "Refused my son a place", -12),
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const os = nativeNeighbours(g.s, g.w, n).filter((o) => !atWar(g.s, o, n));
      const p = frontierOf(g, n);
      return os.length && p >= 0
        ? { n, o: os[(g.s.day >> 3) % os.length], p }
        : null;
    },
    def: {
      key: "gov-squatters",
      pool: "raised",
      cooldown: 0,
      scene: "fields",
      title: "Squatters beyond the line",
      body: (g, _l, ctx) =>
        `Forty families from ${name(g, ctx.p)} have crossed onto the ${nat(g, ctx.o)}'s hunting grounds, girdled the trees and put in corn. The nation's speaker has sent word: move them, or they will.`,
      choices: [
        {
          label: "Send the sheriff to turn them off",
          tip: "The nation is satisfied (+8); the backcountry is furious (unrest +3 there for a year).",
          apply: (g, _l, ctx) => {
            relate(
              g,
              ctx.o,
              ctx.n,
              "The governor turned the squatters off",
              8,
              4,
            );
            provMod(
              g,
              ctx.p,
              "r21:evicted",
              "Squatters turned off",
              DAYS_PER_YEAR,
              { unrest: 3 },
            );
          },
        },
        {
          label: "Let them stay",
          tip: "The backcountry is pleased; the nation is not (−12).",
          apply: (g, _l, ctx) =>
            relate(
              g,
              ctx.o,
              ctx.n,
              "The governor let settlers onto our land",
              -12,
              6,
            ),
        },
        {
          label: "Buy the ground from them (20 gold)",
          tip: "Everyone content, if they'll take it (+2); the treasury pays.",
          blocked: short(20),
          apply: (g, _l, ctx) => {
            pay(g, ctx.n, 20);
            relate(g, ctx.o, ctx.n, "Paid for the squatters' ground", 2, 3);
          },
        },
      ],
    },
  },
  {
    when: (g, n) => (g.s.nations[n].gold >= 40 ? { n } : null),
    def: {
      key: "gov-college",
      pool: "raised",
      cooldown: 0,
      scene: "governor",
      title: "The college asks",
      body: () =>
        "The president of the college, in his bands, with a list: a new roof for the hall, books from London, and a professor of mathematics. Twenty gold from the treasury would do it.",
      choices: [
        {
          label: "Endow it (20 gold)",
          tip: "Clerks who can spell, in time: administration +1 for ten years; renown +1.",
          blocked: short(20),
          apply: (g, life, ctx) => {
            pay(g, ctx.n, 20);
            natMod(
              g,
              ctx.n,
              `r21:college:${g.s.day}`,
              "The governor's gift to the college",
              10 * DAYS_PER_YEAR,
              { admin: 1 },
            );
            addRenown(g, life, 1);
          },
        },
        {
          label: "Not this year",
          tip: "Nothing spent.",
          apply: () => undefined,
        },
      ],
    },
  },
  {
    when: (g, n) => (g.s.polities[n]?.assembly.length ? { n } : null),
    def: {
      key: "gov-grievances",
      pool: "raised",
      cooldown: 0,
      scene: "parliament",
      title: "The house's grievances",
      body: () =>
        "The house has sent up a paper of grievances: the fees of the secretary's office, the quitrents, a road never built, and the governor's habit of proroguing them when they're about to say something.",
      choices: [
        {
          label: "Hear them out, and give way on the fees",
          tip: "Unrest −2 for a year; London thinks you soft (favour −1).",
          apply: (g, _l, ctx) =>
            natMod(
              g,
              ctx.n,
              "r21:grievances",
              "Grievances heard",
              DAYS_PER_YEAR,
              { unrest: -2, favor: -1 },
            ),
        },
        {
          label: "Remind them of their duty to the crown",
          tip: "London approves (favour +1); unrest +2 for a year.",
          apply: (g, _l, ctx) =>
            natMod(
              g,
              ctx.n,
              "r21:grievances",
              "Grievances dismissed",
              DAYS_PER_YEAR,
              { unrest: 2, favor: 1 },
            ),
        },
      ],
    },
  },
  {
    when: (g, n) => {
      const y = Math.floor(g.s.day / DAYS_PER_YEAR) + 1607;
      const coast = provincesOf(g.s, n).some((p) => g.map.provinces[p].coastal);
      return y >= 1680 && y <= 1726 && coast ? { n } : null;
    },
    def: {
      key: "gov-pirates",
      pool: "raised",
      cooldown: 0,
      scene: "docks",
      title: "Pirates off the coast",
      body: () =>
        "A sloop under a black flag has taken three of the colony's ships off the capes this month and burned a fourth. The merchants want something done, and they want it done by the governor.",
      choices: [
        {
          label: "Fit out two sloops against them (20 gold)",
          tip: "Fighting (their captain's): if they're taken, renown +4 and the coast is safer (taxes +3% for a year). If not, the money's gone.",
          check: { skill: "leadership", dc: 8 },
          blocked: short(20),
          apply: (g, life, ctx, pass) => {
            pay(g, ctx.n, 20);
            if (pass) {
              addRenown(g, life, 4);
              natMod(
                g,
                ctx.n,
                "r21:pirates",
                "The pirates taken",
                DAYS_PER_YEAR,
                { tax: 0.03 },
              );
              journal(
                g,
                life,
                "The pirates are taken after a hot little fight off the capes, and brought in for trial.",
                "good",
              );
            } else
              journal(
                g,
                life,
                "The sloops cruised a month and saw nothing but sea.",
                "bad",
              );
          },
        },
        {
          label: "Write to the Admiralty for a frigate",
          tip: "One may come, in a year or so (favour +1 for asking properly).",
          apply: (g, life) => addFavor(g, life, 1),
        },
        {
          label: "It's the Navy's business",
          tip: "Trade suffers (taxes −3% for a year).",
          apply: (g, _l, ctx) =>
            natMod(
              g,
              ctx.n,
              "r21:pirates",
              "Pirates off the coast",
              DAYS_PER_YEAR,
              { tax: -0.03 },
            ),
        },
      ],
    },
  },
];

/** A matter for the governor's desk now (or none), on the desk's own dice. */
export function matterFor(
  g: ConquestGame,
  life: Life,
  n: number,
): { key: string; ctx: LCtx } | null {
  const s = g.s;
  let seed = 1;
  const r = () => {
    seed++;
    return hash01(s.day, n, seed, 0x7a);
  };
  const order = MATTERS.map((m, i) => ({
    m,
    w: hash01(s.day, n, i, 0x7b),
  })).sort((a, b) => a.w - b.w);
  for (const { m } of order) {
    if ((life.cooldowns[`ev:${m.def.key}`] ?? 0) > s.day) continue;
    const ctx = m.when(g, n, r);
    if (ctx) return { key: m.def.key, ctx };
  }
  return null;
}

/** About a month apart: a matter comes to a player's desk. */
export const DESK = {
  gap: [30, 55] as [number, number],
  rest: 2 * DAYS_PER_YEAR,
};

hooks.lifeMonthly.push((g, life) => {
  const s = g.s;
  const n = governedBy(s, life);
  if (n < 0 || life.events.length >= 2) return;
  const d = deskOf(g, n);
  if ((d.nextMatter ?? 0) > s.day) return;
  const m = matterFor(g, life, n);
  const r = worldRng(s, 0x21f0000 + n);
  d.nextMatter =
    s.day + DESK.gap[0] + Math.floor(r.next() * (DESK.gap[1] - DESK.gap[0]));
  if (!m) return;
  touchLife(g, life).cooldowns[`ev:${m.key}`] = s.day + DESK.rest;
  raiseEvent(g, life, m.key, m.ctx);
});

// ---------------------------------------------------------------- the question of independence

const REV_EVENTS: LifeEventDef[] = [
  {
    key: "gov-rev-vote",
    pool: "raised",
    cooldown: 0,
    scene: "parliament",
    title: "The question of independence",
    body: (g, _l, ctx) => {
      const s = g.s;
      const m = s.nations[ctx.n]?.desk?.motion;
      if (!m || m.result) return "The house has divided.";
      const d = revDivision(s, ctx.n, m.by, m.salt, m.votes);
      return `The governor, ${who(g, m.by)}, has put it to the house: that this colony is, and of right ought to be, free of the crown. The debate has gone on for days. As the members lean now: about ${d.ayes} for and ${d.noes} against${d.undecided ? `, ${d.undecided} not yet declared` : ""}. The house divides about ${formatDate(m.divides)}.\n\nHow will you vote? Carried, it's for the governor to declare it, and then for the crown's armies.`;
    },
    choices: [
      {
        label: "Aye: for independence",
        tip: "Your name in the journal of the house, for it.",
        apply: (g, life) => void voteMotion(g, life, 1),
      },
      {
        label: "No: for the crown",
        tip: "Your name in the journal of the house, against it.",
        apply: (g, life) => void voteMotion(g, life, -1),
      },
      {
        label: "Keep your seat",
        tip: "Neither: you abstain.",
        apply: (g, life) => void voteMotion(g, life, 0),
      },
    ],
  },
  {
    key: "gov-rev-carried",
    pool: "raised",
    cooldown: 0,
    scene: "parliament",
    title: "The house has carried it",
    body: (g, _l, ctx) => {
      const r = g.s.nations[ctx.n]?.desk?.motion?.result;
      return `The house has voted for independence${r ? `, ${r.ayes} to ${r.noes}` : ""}. The bells are ready, the printers have the declaration in type, and the King's men in the colony are packing their papers or loading their muskets. It's for you to say.`;
    },
    choices: [
      {
        label: "Declare it",
        tip: "War with the crown: its armies land within the year. The crown's regiments here go over to it; counties where its friends are strong may hold for the King. Won: the colony is free and you frame its government. Crushed: the hangman.",
        apply: (g, life) => void declareRev(g, life, true),
      },
      {
        label: "Let it lie",
        tip: "Not yet. The vote stands two months (Society › Office), then lapses.",
        apply: () => undefined,
      },
    ],
  },
  {
    key: "gov-rev-sides",
    pool: "raised",
    cooldown: 0,
    scene: "rising",
    title: "The colony breaks with the crown",
    body: (g, _l, ctx) =>
      `${who(g, g.s.nations[ctx.n]?.desk?.rev?.by ?? -1)} has declared ${g.s.nations[ctx.n]?.name ?? "the colony"} free of the crown, and the house stands with him. The crown's armies will come. Neighbours are choosing; the committees are making lists.`,
    choices: [
      {
        label: "Stand with the patriots",
        tip: "Renown +3 now. Won: renown +8. Crushed: the law hunts you, and favour at home is gone.",
        apply: (g, life) => void revSide(g, life, "patriot"),
      },
      {
        label: "Stand with the King",
        tip: "Favour at home +5 now. Crushed: the crown remembers its friends (favour +15, renown +5). Won: a third of your purse confiscated, renown −5.",
        apply: (g, life) => void revSide(g, life, "loyal"),
      },
      {
        label: "Keep your head down",
        tip: "Neither side. Nothing gained, nothing lost.",
        apply: (g, life) => void revSide(g, life, "neutral"),
      },
    ],
  },
];

// ---------------------------------------------------------------- registered

let paced = false;

/** The governor's scenes, registered with the event pacing the first time they're looked up. */
export function govEvents(): LifeEventDef[] {
  const all = [COUNCIL_EVENT, ...MATTERS.map((m) => m.def), ...REV_EVENTS];
  if (!paced) {
    paced = true;
    registerFamily(
      "governor",
      [COUNCIL_EVENT.key, ...MATTERS.map((m) => m.def.key)],
      30,
    );
    registerFamily(
      "independence",
      REV_EVENTS.map((d) => d.key),
      1,
    );
  }
  return all;
}

/** The quiet course of each scene left unanswered. */
export function govQuiet(): Record<string, number> {
  return {
    "gov-council": 3,
    "gov-boundary": 2,
    "gov-smuggler": 1,
    "gov-mercy": 1,
    "gov-envoys": 2,
    "gov-frontier": 2,
    "gov-quarantine": 1,
    "gov-marque": 1,
    "gov-fast": 1,
    "gov-fire": 1,
    "gov-patronage": 1,
    "gov-squatters": 1,
    "gov-college": 1,
    "gov-grievances": 0,
    "gov-pirates": 2,
    "gov-rev-vote": 2,
    "gov-rev-carried": 1,
    "gov-rev-sides": 2,
  };
}

/** For the tests: the desk's matters. */
export const MATTER_KEYS = MATTERS.map((m) => m.def.key);
