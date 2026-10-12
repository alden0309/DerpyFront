// POWER (r12): real authority for the county and town offices. Each office
// keeps its duty and its old lever, and gains the powers that fit it in its
// century: the watch doubles its rounds or clears the streets; a constable
// patrols, serves warrants and brings people before the justices; a justice
// licenses taverns, closes disorderly houses and commits rogues for trial
// (and presides over the county's cases); a sheriff collects the levy, runs
// the poll and raises the posse; selectmen and mayors lay rates, feast the
// corporation and put resolutions to the town meeting; a burgess speaks in
// the house; a county lieutenant musters and ranges the frontier; a
// collector searches the wharves; a churchwarden presents sinners; and the
// native towns' officers speak for peace or war, guard the paths, treat
// with the colonies, sell (or keep) the land, and depose a sachem who fails.
// Each has a cost, a risk and something to show for it in the world.

import { relate } from "./Council";
import { jail } from "./Crime";
import { heatOf, isRogue } from "./CrimeQueries";
import { householdsOf } from "./Folk";
import type { ConquestGame } from "./Game";
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
import {
  Check,
  hasPlace,
  isPlayed,
  lifeOfChar,
  meOf,
  no,
  skillLevel,
  yes,
} from "./LifeQueries";
import { checkChance, SKILL_NAMES } from "./LifeRules";
import type { World } from "./Map";
import {
  appointerOf,
  officeById,
  officeName,
  OFFICES,
  vacate,
} from "./Offices";
import { addSway, pdice } from "./PowerCore";
import { ageOf, charName, settlers } from "./Queries";
import { DAYS_PER_YEAR } from "./Rules";
import { rumour } from "./Rumours";
import { officesIn } from "./SocietyCore";
import { addFavor, delivered } from "./Standing"; // POLLS (r16)
import { present } from "./Trials";
import type {
  Character,
  GameState,
  Life,
  LocalOffice,
  ModFx,
  Movement,
  OfficeKey,
  Skill,
} from "./Types";

export type PowerTarget =
  | "none"
  | "local"
  | "rogue"
  | "cause"
  | "candidate"
  | "neighbour";

export interface OfficePower {
  key: string;
  label: string;
  text: string;
  cooldown: number;
  /** Coins from your own purse. */
  cost?: number;
  target: PowerTarget;
  /** With a side (for or against): a cause, a candidate, the governor. */
  sided?: boolean;
  check?: { skill: Skill; dc: number };
  /** Why not here, or not now (beyond the cooldown, the cost and a target). */
  blocked?: (s: GameState, w: World, o: LocalOffice) => string | null;
  /** Does it, returning the journal's line (a leading "!" means it couldn't). */
  run: (
    g: ConquestGame,
    life: Life,
    o: LocalOffice,
    t: number,
    pass: boolean,
    side: number,
  ) => string;
}

// ---------------------------------------------------------------- small helpers

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

/** Grown people of the county (not players), for opinions. */
function folk(s: GameState, p: number, n = 8, salt = 0): Character[] {
  const list = householdsOf(s, p).filter(
    (c) => ageOf(s, c) >= 18 && !isPlayed(s, c.id),
  );
  if (!salt) return list.slice(0, n);
  const start = salt % Math.max(1, list.length);
  return [...list.slice(start), ...list.slice(0, start)].slice(0, n);
}

function feel(
  g: ConquestGame,
  life: Life,
  cs: Character[],
  why: string,
  v: number,
): void {
  for (const c of cs) remembers(g, life, c, why, v, 3);
}

/** Players wanted by the county's law, here now. */
export function roguesHere(
  s: GameState,
  life: Life,
  o: LocalOffice,
  min = 20,
): Life[] {
  return s.lives.filter(
    (l) =>
      l !== life &&
      l.c >= 0 &&
      !l.watching &&
      !l.travel &&
      l.prov === o.prov &&
      !l.crime?.jail &&
      heatOf(l, o.nation) >= min,
  );
}

/** Causes stirring in the county. */
function causesHere(s: GameState, o: LocalOffice): Movement[] {
  return s.movements.filter(
    (m) =>
      (m.status === "brewing" || m.status === "risen") &&
      m.region.includes(o.prov),
  );
}

/** People standing at a poll in the county, or sitting for it. */
function candidatesHere(s: GameState, o: LocalOffice): number[] {
  const out = new Set<number>();
  for (const x of officesIn(s, o.prov)) {
    if (OFFICES[x.key].how !== "elected") continue;
    for (const c of x.candidates) out.add(c.c);
    if (x.holder >= 0) out.add(x.holder);
  }
  for (const c of s.polities[o.nation]?.assembly ?? [])
    if (s.chars[c]?.home === o.prov) out.add(c);
  for (const l of s.lives)
    if (
      l.campaign?.nation === o.nation &&
      (l.home === o.prov || l.prov === o.prov)
    )
      out.add(l.c);
  return [...out].filter((c) => s.chars[c]?.alive);
}

/** Nations bordering the county. */
function neighbourNations(s: GameState, w: World, o: LocalOffice): number[] {
  const out = new Set<number>();
  for (const [q] of w.map.provinces[o.prov].nb) {
    const x = s.provinces[q]?.owner ?? -1;
    if (x >= 0 && x !== o.nation && s.nations[x]?.alive) out.add(x);
  }
  // A town's speaker carries words further than the next valley.
  if (!out.size)
    for (const n of s.nations)
      if (
        n.alive &&
        n.kind === "power" &&
        n.id !== o.nation &&
        Object.keys(s.nations[o.nation]?.relations ?? {}).includes(String(n.id))
      )
        out.add(n.id);
  return [...out].sort((a, b) => a - b);
}

const atWar = (s: GameState, n: number) =>
  s.wars.some((w) => w.a === n || w.b === n);

// ---------------------------------------------------------------- the powers, office by office

export const POWERS: Partial<Record<OfficeKey, OfficePower[]>> = {
  watch: [
    {
      key: "double",
      label: "Double the watch (3)",
      text: "Pay extra men for the night rounds: for two months the town's sharper (rogues are likelier caught) and quieter.",
      cooldown: 60,
      cost: 3,
      target: "none",
      run: (g, life, o) => {
        provMod(g, o.prov, "power:patrol", "The watch doubled", 60, {
          unrest: -2,
        });
        gainXp(g, life, "leadership", 3);
        return `The watch walks two by two through ${g.map.provinces[o.prov].name} all night, lanterns up. The taverns empty early.`;
      },
    },
    {
      key: "curfew",
      label: "Clear the streets at night",
      text: "Everyone indoors at the nine o'clock bell: unrest −4 for three months, but trade suffers and the town grumbles.",
      cooldown: 120,
      target: "none",
      run: (g, life, o) => {
        provMod(g, o.prov, "power:curfew", "A curfew", 90, {
          unrest: -4,
          production: -0.02,
        });
        feel(g, life, folk(g.s, o.prov, 5, g.s.day), "Kept me indoors", -3);
        return "The bell rings at nine and the watch sends everyone home. Quiet, and sullen.";
      },
    },
  ],
  constable: [
    {
      key: "patrol",
      label: "Patrol the county",
      text: "Ride the roads with a staff and a warrant book: the county's sharper for six weeks (rogues likelier caught), a little quieter. Now and then a scuffle.",
      cooldown: 30,
      target: "none",
      check: { skill: "fighting", dc: 5 },
      run: (g, life, o, t, pass) => {
        provMod(g, o.prov, "power:patrol", "The constable on patrol", 45, {
          unrest: -1,
        });
        gainXp(g, life, "fighting", 3);
        if (!pass) {
          hurt(g, life, 4, "a scuffle on patrol");
          return "A drunk with a cudgel and a grudge: you bring him in, with a lump to show for it.";
        }
        return "You ride the county's roads and lanes. The rogues keep their heads down.";
      },
    },
    {
      key: "warrant",
      label: "Serve a warrant on a wanted rogue",
      text: "Take up a player the law wants here (heat 20 and more): a fight if they resist. They go to the gaol to wait for the sessions.",
      cooldown: 30,
      target: "rogue",
      blocked: () => null,
      run: (g, life, o, t) => {
        const s = g.s;
        const them = lifeOfChar(s, t);
        if (!them) return "!They're gone.";
        const mine = skillLevel(s, life, "fighting") + 2;
        const theirs =
          skillLevel(s, them, "fighting") + skillLevel(s, them, "stealth") / 3;
        const win = pdice(g).chance(checkChance(mine, theirs));
        gainXp(g, life, "fighting", 6);
        if (!win) {
          hurt(g, life, 8, "a rogue who wouldn't be taken");
          journal(
            g,
            them,
            `${charName(meOf(s, life))} came with a warrant; you got away.`,
            "good",
          );
          return `${charName(s.chars[t])} knocks your staff aside and is gone over the fence.`;
        }
        const heat = heatOf(them, o.nation);
        jail(
          g,
          them,
          "crimes against the king's peace",
          Math.max(1, Math.min(3, Math.round(heat / 30))),
          o.nation,
        );
        addRenown(g, life, 3);
        touchLife(g, life).crime ??= {
          notoriety: 0,
          heat: {},
          dens: [],
          record: [],
          jail: null,
        };
        life.crime!.arrests = (life.crime!.arrests ?? 0) + 1;
        return `You serve the warrant on ${charName(s.chars[t])} and walk them to the gaol.`;
      },
    },
    {
      key: "bring",
      label: "Bring someone before the justices",
      text: "Charge someone of the county (theft, an assault, a disorderly house): a trial at the sessions, with you as the accuser. Win, and the town's quieter; lose, and they'll hate you.",
      cooldown: 90,
      target: "local",
      run: (g, life, o, t) => {
        const err = present(
          g,
          life,
          t,
          o.prov,
          "accused",
          pdice(g).pick(["theft", "an assault", "breaking the peace"])!,
          1,
        );
        return err
          ? `!${err}`
          : `You take ${charName(g.s.chars[t])} up and lay the charge before the justices.`;
      },
    },
  ],
  justice: [
    {
      key: "license",
      label: "License a tavern (+3 fees)",
      text: "Grant an ordinary-keeper his licence: fees for you, and the county's trade +2% for two years (and a little more drink).",
      cooldown: 120,
      target: "none",
      run: (g, life, o) => {
        earn(g, life, 3);
        provMod(
          g,
          o.prov,
          "power:licence",
          "Taverns licensed",
          2 * DAYS_PER_YEAR,
          { production: 0.02, unrest: 1 },
        );
        return "A new ordinary is licensed at the crossroads, and its keeper pays the fee gladly.";
      },
    },
    {
      key: "close",
      label: "Close a disorderly house",
      text: "Pull the licence of the worst tavern in the county: unrest −3 for a year, the watch sharper for three months; its keeper and his friends won't forgive you.",
      cooldown: 180,
      target: "none",
      run: (g, life, o) => {
        provMod(
          g,
          o.prov,
          "power:closed",
          "A disorderly house closed",
          DAYS_PER_YEAR,
          { unrest: -3 },
        );
        provMod(
          g,
          o.prov,
          "power:patrol",
          "The disorderly house closed",
          90,
          {},
        );
        const keeper = householdsOf(g.s, o.prov).find(
          (c) => c.role === "innkeeper" && !isPlayed(g.s, c.id),
        );
        if (keeper)
          remembers(g, life, g.char(keeper.id), "Closed my house", -20, 5);
        return "The constable nails the order to the door. The dice and the doxies move elsewhere.";
      },
    },
    {
      key: "commit",
      label: "Commit a rogue for trial",
      text: "On sworn information, send a player the law wants here (heat 25 and more) to the gaol to wait for the sessions. No fight: the constable does it.",
      cooldown: 60,
      target: "rogue",
      run: (g, life, o, t) => {
        const s = g.s;
        const them = lifeOfChar(s, t);
        if (!them || heatOf(them, o.nation) < 25)
          return "!The information won't hold: their heat is under 25.";
        jail(
          g,
          them,
          "crimes against the king's peace",
          Math.max(1, Math.min(3, Math.round(heatOf(them, o.nation) / 30))),
          o.nation,
        );
        addRenown(g, life, 2);
        return `You sign the mittimus, and the constable takes ${charName(s.chars[t])} to the gaol for the sessions.`;
      },
    },
  ],
  sheriff: [
    {
      key: "levy",
      label: "Collect the county levy",
      text: "Ride the county for the colony's levy: coins into the colony's treasury, your poundage (1.5), and grumbling. If the county won't pay, worse.",
      cooldown: 90,
      target: "none",
      check: { skill: "persuasion", dc: 7 },
      run: (g, life, o, t, pass) => {
        const s = g.s;
        const gold = Math.min(
          10,
          2 + Math.round(settlers(s.provinces[o.prov]) / 1500),
        );
        if (!pass) {
          provMod(g, o.prov, "power:levy", "The levy resisted", 120, {
            unrest: 5,
          });
          addRenown(g, life, -1);
          return "Doors barred and dogs loosed: the county won't pay. You come home with an empty satchel and a mob's opinion of you.";
        }
        g.nation(o.nation).gold += gold;
        earn(g, life, 1.5);
        provMod(g, o.prov, "power:levy", "The levy collected", 90, {
          unrest: 2,
        });
        return `You bring in the county's levy: ${gold} to the colony's treasury, and your poundage.`;
      },
    },
    {
      key: "poll",
      label: "Run the poll for a candidate",
      text: "The sheriff keeps the poll book: help a candidate (or hinder one) at the county's next election. If it comes out, a scandal.",
      cooldown: 365,
      target: "candidate",
      sided: true,
      blocked: (s, w, o) => {
        const soon =
          officesIn(s, o.prov).some(
            (x) =>
              OFFICES[x.key].how === "elected" && x.election - s.day <= 120,
          ) || (s.polities[o.nation]?.election ?? Infinity) - s.day <= 120;
        return soon
          ? null
          : "Only with a poll in the county within four months.";
      },
      run: (g, life, o, t, pass, side) => {
        const s = g.s;
        addSway(g, t, side * 6);
        gainXp(g, life, "stealth", 4);
        const caught = pdice(g).chance(
          Math.max(0.1, 0.3 - skillLevel(s, life, "stealth") * 0.01),
        );
        if (caught) {
          touchLife(g, life).scandal = {
            until: s.day + DAYS_PER_YEAR,
            text: "A sheriff who cooked the poll",
          };
          addRenown(g, life, -4);
          rumour(
            g,
            o.prov,
            `The sheriff of ${g.map.provinces[o.prov].name} is said to have cooked the poll.`,
            life.c,
            "bad",
          );
          return `You ${side > 0 ? "help" : "hinder"} ${charName(s.chars[t])} at the poll, and somebody saw the poll book.`;
        }
        return `The poll book will show ${charName(s.chars[t])} ${side > 0 ? "doing rather better" : "doing rather worse"} than the county expected.`;
      },
    },
    {
      key: "posse",
      label: "Raise the posse",
      text: "Every able man of the county with a stick: the county quieter, the rogues scattered; wanted players here (heat 25+) may be taken. A fight, and you may be hurt.",
      cooldown: 120,
      target: "none",
      check: { skill: "leadership", dc: 7 },
      run: (g, life, o, t, pass) => {
        const s = g.s;
        provMod(g, o.prov, "power:patrol", "The posse out", 60, { unrest: -2 });
        gainXp(g, life, "leadership", 5);
        if (!pass) {
          hurt(g, life, 6, "a running fight with rogues");
          return "The posse straggles, argues and goes home. You take a cut on the head for your trouble.";
        }
        const taken: string[] = [];
        for (const l of roguesHere(s, life, o, 25))
          if (pdice(g).chance(0.4)) {
            jail(
              g,
              l,
              "crimes against the king's peace",
              Math.max(1, Math.min(3, Math.round(heatOf(l, o.nation) / 30))),
              o.nation,
            );
            taken.push(charName(s.chars[l.c]));
          }
        addRenown(g, life, 2);
        return `The posse sweeps the county's woods and wharves.${taken.length ? ` Taken: ${taken.join(", ")}.` : " The rogues lie low."}`;
      },
    },
  ],
  lieutenant: [
    {
      key: "muster",
      label: "Hold a general muster",
      text: "The county's regiment on the green, drilled and inspected: unrest −2 for a year, the colony's men here steadier, causes against the colony set back a little.",
      cooldown: 180,
      target: "none",
      run: (g, life, o) => {
        const s = g.s;
        provMod(g, o.prov, "power:muster", "A general muster", DAYS_PER_YEAR, {
          unrest: -2,
        });
        for (const a of s.armies)
          if (a.owner === o.nation && a.prov === o.prov)
            for (const r of g.touch(a).regs)
              r.morale = Math.min(1, r.morale + 0.1);
        for (const m of causesHere(s, o))
          if (m.against === o.nation) {
            m.support = Math.max(0, m.support - 2);
            g.movementsChanged();
          }
        gainXp(g, life, "leadership", 5);
        return "Four companies on the green, a sermon, a volley and a barrel of rum. The county's men look like soldiers, nearly.";
      },
    },
    {
      key: "range",
      label: "Range the frontier",
      text: "Mounted rangers along the edge of the county: fewer raids (unrest −3 for three months) if it goes well; the nations beyond take it ill.",
      cooldown: 120,
      target: "none",
      check: { skill: "leadership", dc: 8 },
      run: (g, life, o, t, pass) => {
        const s = g.s;
        gainXp(g, life, "woodcraft", 4);
        if (!pass) {
          hurt(g, life, 6, "an ambush on the frontier");
          addStress(g, life, 6);
          return "The rangers ride into an ambush at a ford. You bring most of them home.";
        }
        provMod(g, o.prov, "power:range", "Rangers on the frontier", 90, {
          unrest: -3,
        });
        for (const x of neighbourNations(s, g.w, o))
          if (s.nations[x].kind === "native")
            relate(g, x, o.nation, "Rangers on our hunting paths", -4, 2);
        addRenown(g, life, 2);
        return "The rangers ride the frontier from the falls to the swamp. The farms on the edge sleep easier.";
      },
    },
  ],
  selectman: [
    {
      key: "rate",
      label: "Lay a rate for the poor",
      text: "A town rate to keep the poor: unrest −3 for half a year, trade −1%; the freeholders who pay grumble, the poor remember.",
      cooldown: 180,
      target: "none",
      run: (g, life, o) => {
        provMod(g, o.prov, "power:poorrate", "A rate for the poor", 180, {
          unrest: -3,
          production: -0.01,
        });
        feel(g, life, folk(g.s, o.prov, 3, 1), "Raised my rates", -4);
        feel(g, life, folk(g.s, o.prov, 3, 7), "Kept the poor fed", 4);
        return "The town meeting votes the rate, after a long evening. Bread and firewood for the poor this winter.";
      },
    },
    {
      key: "resolve",
      label: "Put a resolution to the town meeting",
      text: "For or against a cause stirring in the county: the town's voice moves its support (±3); a resolution against the crown costs favour at home.",
      cooldown: 120,
      target: "cause",
      sided: true,
      run: (g, life, o, t, pass, side) => {
        const s = g.s;
        const m = s.movements.find((x) => x.id === t);
        if (!m) return "!No such cause.";
        m.support = Math.max(0, Math.min(100, m.support + side * 3));
        g.movementsChanged();
        addRenown(g, life, 1);
        if (side > 0 && m.against === o.nation && m.goal !== "reform")
          touchLife(g, life).favor = Math.max(0, life.favor - 2);
        if (side < 0 && m.against === o.nation) addFavor(g, life, 1); // POLLS (r16): on the curve
        return `The town meeting resolves ${side > 0 ? "for" : "against"} ${m.name}, by a show of hands.`;
      },
    },
    {
      key: "warnout",
      label: "Warn a stranger out of town",
      text: "Order an idle stranger out of the town before they become a charge on it: unrest −1, and an enemy for life.",
      cooldown: 120,
      target: "local",
      run: (g, life, o, t) => {
        const s = g.s;
        const c = s.chars[t];
        const list = s.locals[o.prov];
        if (list?.includes(t)) {
          s.locals[o.prov] = list.filter((x) => x !== t);
          g.localsChanged(o.prov);
        }
        g.char(t).home =
          s.nations[o.nation].capital === o.prov
            ? o.prov
            : s.nations[o.nation].capital;
        remembers(g, life, g.char(t), "Warned me out of town", -25, 8);
        provMod(g, o.prov, "power:warnout", "Strangers warned out", 120, {
          unrest: -1,
        });
        return `The constable reads ${charName(c)} the warning, and they take the road out of town.`;
      },
    },
  ],
  mayor: [
    {
      key: "feast",
      label: "Feast the corporation (8)",
      text: "Turtle, venison and claret for the aldermen: renown, the town's goodwill, and help at the next poll.",
      cooldown: 180,
      cost: 8,
      target: "none",
      run: (g, life, o) => {
        addRenown(g, life, 3);
        feel(g, life, folk(g.s, o.prov, 8), "Dined at the mayor's feast", 5);
        addSway(g, life.c, 3);
        return "A feast in the town hall: speeches, toasts, and an alderman under the table by ten.";
      },
    },
    {
      key: "court",
      label: "Hold the mayor's court",
      text: "Hear the town's small causes: a neighbour's quarrel settled in someone's favour, fees for you.",
      cooldown: 60,
      target: "local",
      run: (g, life, o, t) => {
        const s = g.s;
        earn(g, life, 2);
        gainXp(g, life, "letters", 4);
        remembers(
          g,
          life,
          g.char(t),
          "Found for me in the mayor's court",
          12,
          4,
        );
        const loser = folk(s, o.prov, 6, s.day).find((c) => c.id !== t);
        if (loser)
          remembers(
            g,
            life,
            g.char(loser.id),
            "Found against me in the mayor's court",
            -8,
            3,
          );
        return `The mayor's court finds for ${charName(s.chars[t])}${loser ? ` against ${charName(loser)}` : ""}. Fees: 2 coins.`;
      },
    },
    {
      key: "pave",
      label: "Pave and light the streets (12)",
      text: "Cobbles and lamps, partly at your own charge: the town's trade +3%, sickness and disorder a little less, for ten years.",
      cooldown: 730,
      cost: 12,
      target: "none",
      run: (g, life, o) => {
        provMod(
          g,
          o.prov,
          `power:pave`,
          "Paved and lit streets",
          10 * DAYS_PER_YEAR,
          { production: 0.03, unrest: -1, disease: -0.05 },
        );
        addRenown(g, life, 3);
        return `Cobbles in the high street and oil lamps at the corners of ${g.map.provinces[o.prov].name}. People walk out after dark.`;
      },
    },
  ],
  burgess: [
    {
      key: "speech",
      label: "Speak in the house",
      text: "For the governor's measures or against them: the governor's regard rises or falls, and the counties hear of it.",
      cooldown: 60,
      target: "none",
      sided: true,
      check: { skill: "persuasion", dc: 7 },
      run: (g, life, o, t, pass, side) => {
        const s = g.s;
        const gov = s.chars[s.nations[o.nation]?.ruler ?? -1];
        gainXp(g, life, "persuasion", 5);
        if (side > 0) {
          if (gov?.alive && !isPlayed(s, gov.id))
            remembers(
              g,
              life,
              g.char(gov.id),
              "Spoke for me in the house",
              pass ? 6 : 2,
              2,
            );
          addFavor(g, life, pass ? 2 : 0); // POLLS (r16): on the curve
          return pass
            ? "You speak for the governor's measures, well. His friends nod."
            : "You speak for the governor's measures; nobody listens much.";
        }
        if (gov?.alive && !isPlayed(s, gov.id))
          remembers(
            g,
            life,
            g.char(gov.id),
            "Spoke against me in the house",
            -8,
            2,
          );
        addRenown(g, life, pass ? 2 : 0.5);
        addSway(g, life.c, pass ? 2 : 0);
        return pass
          ? "You rise against the governor and the house cheers. The country will hear of it."
          : "You speak against the governor, haltingly. The house shuffles.";
      },
    },
  ],
  collector: [
    {
      key: "wharves",
      label: "Search the wharves",
      text: "With a writ of assistance: search the warehouses for goods run in without duty. A seizure pays the informer's share and the colony's; smugglers here (players too) feel the heat; the merchants hate it.",
      cooldown: 90,
      target: "none",
      check: { skill: "letters", dc: 7 },
      blocked: (s, w, o) =>
        hasPlace(s, w, o.prov, "docks") ? null : "Only in a port, with docks.",
      run: (g, life, o, t, pass) => {
        const s = g.s;
        if (!pass) {
          addStress(g, life, 2);
          return "Barrels of 'flour' that are flour, and a merchant who'll sue. Nothing found.";
        }
        earn(g, life, 4);
        g.nation(o.nation).gold += 6;
        for (const l of s.lives)
          if (
            l.prov === o.prov &&
            l.job &&
            (l.job.kind === "smuggler" || isRogue(l)) &&
            l.crime
          ) {
            touchLife(g, l).crime!.heat[o.nation] = Math.min(
              100,
              (l.crime.heat[o.nation] ?? 0) + 10,
            );
            journal(
              g,
              l,
              "The collector has been through the wharves: the law's looking for smugglers.",
              "bad",
            );
          }
        feel(g, life, folk(s, o.prov, 3, 3), "Searched my warehouse", -6);
        return "Twenty hogsheads of French molasses under the hay: seized. Your share is 4 coins; the colony's, 6.";
      },
    },
    {
      key: "assess",
      label: "Assess the county anew",
      text: "A new valuation of every farm and shop: the colony's revenue from the county +5% for three years; unrest +2 for a year; the county won't love you.",
      cooldown: 730,
      target: "none",
      run: (g, life, o) => {
        provMod(
          g,
          o.prov,
          "power:assess",
          "A new assessment",
          3 * DAYS_PER_YEAR,
          { tax: 0.05 },
        );
        provMod(
          g,
          o.prov,
          "power:assessed",
          "The assessment resented",
          DAYS_PER_YEAR,
          { unrest: 2 },
        );
        feel(g, life, folk(g.s, o.prov, 6, 2), "Raised my assessment", -4);
        return "You walk every field with a chain and a ledger. The county pays more, and says so.";
      },
    },
  ],
  warden: [
    {
      key: "present",
      label: "Present a sinner to the court",
      text: "Drunkenness on the sabbath, a child out of wedlock, cursing: a presentment before the justices, with you as the accuser. The godly approve; the presented won't forget.",
      cooldown: 120,
      target: "local",
      run: (g, life, o, t) => {
        const err = present(
          g,
          life,
          t,
          o.prov,
          "presentment",
          pdice(g).pick([
            "drunkenness on the sabbath",
            "profane swearing",
            "a bastard child",
          ])!,
          1,
        );
        if (err) return `!${err}`;
        gainXp(g, life, "faith", 3);
        return `You present ${charName(g.s.chars[t])} to the justices, as the churchwardens' oath requires.`;
      },
    },
    {
      key: "collection",
      label: "Take up a collection for the church",
      text: "A new bell, a gallery, a stove: the parish's pride (unrest −1 for three years) and some goodwill.",
      cooldown: 365,
      target: "none",
      run: (g, life, o) => {
        provMod(
          g,
          o.prov,
          "power:collection",
          "A new bell",
          3 * DAYS_PER_YEAR,
          { unrest: -1 },
        );
        feel(g, life, folk(g.s, o.prov, 6, 4), "Gave the parish its bell", 2);
        gainXp(g, life, "faith", 4);
        return "The collection plate goes round three Sundays running. A new bell is cast and hung.";
      },
    },
  ],
  council: [
    {
      key: "peace",
      label: "Speak for peace with a neighbour",
      text: "Urge the fire to keep the peace: the neighbour's people think better of the nation (+6 for three years).",
      cooldown: 180,
      target: "neighbour",
      run: (g, life, o, t) => {
        relate(g, t, o.nation, "The council fire spoke for peace", 6, 3);
        relate(g, o.nation, t, "Our council spoke for peace", 4, 3);
        gainXp(g, life, "persuasion", 4);
        addRenown(g, life, 1);
        return `You speak for peace with the ${g.s.nations[t].name}, and the fire agrees, after two days.`;
      },
    },
    {
      key: "war",
      label: "Speak for war against a neighbour",
      text: "Urge the young men's anger at the fire: relations with the neighbour fall (−8); the young men love you.",
      cooldown: 180,
      target: "neighbour",
      run: (g, life, o, t) => {
        relate(g, o.nation, t, "The council fire is angry", -8, 3);
        addRenown(g, life, 1);
        return `You speak against the ${g.s.nations[t].name}, and the young men beat the post.`;
      },
    },
  ],
  warcaptain: [
    {
      key: "paths",
      label: "Guard the paths",
      text: "Scouts on every trail into the town: unrest −2 for two months.",
      cooldown: 60,
      target: "none",
      run: (g, life, o) => {
        provMod(g, o.prov, "power:paths", "The paths guarded", 60, {
          unrest: -2,
        });
        gainXp(g, life, "woodcraft", 4);
        return "Young men watch every trail into town, day and night.";
      },
    },
    {
      key: "wardance",
      label: "Call the young men to the war dance",
      text: "In wartime: three hundred warriors for the nation, from its stores (6).",
      cooldown: 365,
      target: "none",
      blocked: (s, w, o) =>
        atWar(s, o.nation)
          ? s.nations[o.nation].gold >= 6
            ? null
            : "The stores are empty."
          : "Only in time of war.",
      run: (g, life, o) => {
        const s = g.s;
        g.nation(o.nation).gold -= 6;
        const army = s.armies.find(
          (a) => a.owner === o.nation && a.prov === o.prov && a.depart < 0,
        );
        const reg = {
          type: "warriors" as const,
          men: 300,
          morale: 0.75,
          home: o.prov,
        };
        if (army) g.touch(army).regs.push(reg);
        else
          g.addArmy({
            id: g.nextId(),
            owner: o.nation,
            prov: o.prov,
            regs: [reg],
            path: [],
            depart: -1,
            arrive: -1,
            sea: false,
            retreating: false,
            arrived: s.day,
            from: -1,
            commander: -1,
            supply: 1,
          });
        addRenown(g, life, 3);
        return "The drum and the war-post: three hundred young men paint themselves for war.";
      },
    },
  ],
  speaker: [
    {
      key: "treaty",
      label: "Speak at a treaty council",
      text: "Carry the town's words to a neighbour's council: much better relations (+10 both ways) if you speak well.",
      cooldown: 180,
      target: "neighbour",
      check: { skill: "persuasion", dc: 8 },
      run: (g, life, o, t, pass) => {
        gainXp(g, life, "persuasion", 6);
        if (!pass) {
          relate(g, t, o.nation, "A treaty council that went badly", -2, 2);
          return `The council with the ${g.s.nations[t].name} goes badly: the belts are handed back.`;
        }
        relate(g, t, o.nation, "A treaty council", 10, 5);
        relate(g, o.nation, t, "A treaty council", 10, 5);
        addRenown(g, life, 3);
        return `Belts given and taken with the ${g.s.nations[t].name}. The path between you is clear.`;
      },
    },
    {
      key: "traders",
      label: "Invite traders to the town",
      text: "Open the town to the traders: its trade +4% for two years, and their fevers with them.",
      cooldown: 365,
      target: "none",
      run: (g, life, o) => {
        provMod(
          g,
          o.prov,
          "power:traders",
          "Traders welcome",
          2 * DAYS_PER_YEAR,
          { production: 0.04, disease: 0.05 },
        );
        return "The traders come with kettles, cloth and rum, and stay a while.";
      },
    },
  ],
  sachem: [
    {
      key: "givefeast",
      label: "Give a feast to the town (4)",
      text: "A sachem gives more than they take: renown, the town's love, and quiet (unrest −3 for four months).",
      cooldown: 120,
      cost: 4,
      target: "none",
      run: (g, life, o) => {
        addRenown(g, life, 3);
        feel(g, life, folk(g.s, o.prov, 8), "Ate at the sachem's feast", 4);
        provMod(g, o.prov, "power:feast", "The sachem's feast", 120, {
          unrest: -3,
        });
        return "Venison, corn and fish for the whole town, and dancing till morning.";
      },
    },
    {
      key: "quarrel",
      label: "Hear a quarrel",
      text: "Settle a dispute between families: the one you favour is grateful; the other isn't.",
      cooldown: 60,
      target: "local",
      run: (g, life, o, t) => {
        remembers(g, life, g.char(t), "The sachem heard me", 12, 4);
        gainXp(g, life, "persuasion", 4);
        return `You hear ${charName(g.s.chars[t])}'s quarrel out, and settle it their way.`;
      },
    },
    {
      key: "sell",
      label: "Sell land to the colonists",
      text: "Put your mark on a deed: 12 coins for you and a friendlier colony, an angry town (unrest +6 for two years), and the land gone for good.",
      cooldown: 730,
      target: "neighbour",
      blocked: (s, w, o) =>
        s.nations[o.nation]?.laws?.includes("nolandsale")
          ? "The council fire has said no land is to be sold."
          : null,
      run: (g, life, o, t) => {
        if (g.s.nations[t]?.kind !== "power")
          return "!Only a colony buys land.";
        earn(g, life, 12);
        relate(g, t, o.nation, "Sold us land", 8, 5);
        provMod(
          g,
          o.prov,
          "power:landsale",
          "Land sold to the colonists",
          2 * DAYS_PER_YEAR,
          { unrest: 6 },
        );
        feel(g, life, folk(g.s, o.prov, 8), "Sold our land", -6);
        addRenown(g, life, -2);
        return `You put your mark on the ${g.s.nations[t].adjective} deed. The coins are heavy, and so are the looks.`;
      },
    },
  ],
  clanmother: [
    {
      key: "dehorn",
      label: "Take the horns from the sachem",
      text: "Depose a sachem who's failed the town: the seat stands empty for the clan mothers to fill.",
      cooldown: 365,
      target: "none",
      blocked: (s, w, o) => {
        const sa = officesIn(s, o.prov).find((x) => x.key === "sachem");
        return sa && sa.holder >= 0 ? null : "There's no sachem to depose.";
      },
      run: (g, life, o) => {
        const sa = officesIn(g.s, o.prov).find((x) => x.key === "sachem")!;
        const was = g.s.chars[sa.holder];
        if (sa.holder === life.c) return "!Not your own.";
        vacate(g, sa, "the clan mothers took the horns of office away");
        if (was?.alive && !isPlayed(g.s, was.id))
          remembers(g, life, g.char(was.id), "Took my horns", -30, 10);
        addRenown(g, life, 1);
        return `You take the horns from ${charName(was)}. The town's seat stands empty until you raise another.`;
      },
    },
    {
      key: "counsel",
      label: "Counsel against war",
      text: "The clan mothers' word against a war with a neighbour: relations +5, and the town calmer.",
      cooldown: 180,
      target: "neighbour",
      run: (g, life, o, t) => {
        relate(g, o.nation, t, "The clan mothers spoke for peace", 5, 3);
        provMod(g, o.prov, "power:counsel", "The clan mothers' counsel", 120, {
          unrest: -1,
        });
        return `You speak against war with the ${g.s.nations[t].name}. The young men listen, this time.`;
      },
    },
  ],
  founder: [
    {
      key: "lots",
      label: "Grant lots to newcomers (10)",
      text: "Land for families who'll come: the settlement grows faster for three years.",
      cooldown: 365,
      cost: 10,
      target: "none",
      run: (g, life, o) => {
        provMod(
          g,
          o.prov,
          "power:lots",
          "Lots granted to newcomers",
          3 * DAYS_PER_YEAR,
          { growth: 0.1 },
        );
        return "You lay out new lots along the creek and let it be known in the old colony.";
      },
    },
  ],
};

/** A few powers go by other names among the French, Spanish and Dutch. */
const LABELS: Partial<Record<string, Partial<Record<string, string>>>> = {
  french: {
    range: "Lead the habitants and allies on a war party",
    levy: "Collect the seigneur's dues and the levy",
  },
  spanish: {
    feast: "Feast the cabildo (8)",
    resolve: "Put a petition to the cabildo abierto",
    levy: "Collect the alcabala",
  },
  dutch: {
    levy: "Collect the fines and the burgher fees",
    resolve: "Put a remonstrance to the burghers",
  },
};

export function powerLabel(
  s: GameState,
  o: LocalOffice,
  pw: OfficePower,
): string {
  return LABELS[s.nations[o.nation]?.culture ?? ""]?.[pw.key] ?? pw.label;
}

export function powersOf(o: LocalOffice): OfficePower[] {
  return POWERS[o.key] ?? [];
}

const cdKey = (o: LocalOffice, pw: OfficePower) =>
  `power:${o.key}:${pw.key}:${o.prov}`;

/** Can you use a power of your office now. */
export function powerCheck(
  s: GameState,
  w: World,
  life: Life,
  o: LocalOffice,
  key: string,
): Check {
  const pw = powersOf(o).find((x) => x.key === key);
  if (!pw) return no("No such power.");
  if (o.holder !== life.c) return no("It isn't yours.");
  if (life.travel) return no("You're on the road.");
  if (life.prov !== o.prov) return no("Go to the county.");
  const left = (life.cooldowns[cdKey(o, pw)] ?? 0) - s.day;
  if (left > 0) return no(`Again in ${left} days.`);
  if (pw.cost && life.purse < pw.cost) return no(`It takes ${pw.cost} coins.`);
  const why = pw.blocked?.(s, w, o);
  if (why) return no(why);
  if (pw.target !== "none" && !powerTargets(s, w, life, o, pw).length)
    return no(
      pw.target === "rogue"
        ? "Nobody here is wanted badly enough."
        : pw.target === "cause"
          ? "No cause stirs in the county."
          : pw.target === "candidate"
            ? "Nobody stands at the county's polls."
            : pw.target === "neighbour"
              ? "No neighbours to speak of."
              : "Nobody to choose.",
    );
  return yes;
}

/** Whom (or what) a power can be used on. */
export function powerTargets(
  s: GameState,
  w: World,
  life: Life,
  o: LocalOffice,
  pw: OfficePower,
): { id: number; label: string }[] {
  switch (pw.target) {
    case "local":
      return householdsOf(s, o.prov)
        .filter(
          (c) => c.id !== life.c && ageOf(s, c) >= 18 && !isPlayed(s, c.id),
        )
        .slice(0, 16)
        .map((c) => ({ id: c.id, label: charName(c) }));
    case "rogue":
      return roguesHere(s, life, o, pw.key === "commit" ? 25 : 20).map((l) => ({
        id: l.c,
        label: `${charName(s.chars[l.c])} (heat ${Math.round(heatOf(l, o.nation))})`,
      }));
    case "cause":
      return causesHere(s, o).map((m) => ({ id: m.id, label: m.name }));
    case "candidate":
      return candidatesHere(s, o)
        .filter((c) => c !== life.c)
        .map((c) => ({ id: c, label: charName(s.chars[c]) }));
    case "neighbour":
      return neighbourNations(s, w, o).map((n) => ({
        id: n,
        label: s.nations[n].name.replace(/^the /, ""),
      }));
    default:
      return [];
  }
}

/** The odds of a power's test, if it has one. */
export function powerOdds(
  s: GameState,
  life: Life,
  pw: OfficePower,
): number | null {
  if (!pw.check) return null;
  return checkChance(skillLevel(s, life, pw.check.skill), pw.check.dc);
}

export const powerOddsLabel = (s: GameState, life: Life, pw: OfficePower) => {
  const odds = powerOdds(s, life, pw);
  return odds === null
    ? ""
    : `${SKILL_NAMES[pw.check!.skill]} ${Math.round(odds * 100)}%`;
};

/** Use a power of your office. */
export function usePower(
  g: ConquestGame,
  life: Life,
  id: number,
  key: string,
  t: number,
  side: number,
): string | null {
  const s = g.s;
  const o = officeById(s, id);
  if (!o) return "No such office.";
  const check = powerCheck(s, g.w, life, o, key);
  if (!check.ok) return check.why;
  const pw = powersOf(o).find((x) => x.key === key)!;
  if (
    pw.target !== "none" &&
    !powerTargets(s, g.w, life, o, pw).some((x) => x.id === t)
  )
    return "Choose whom (or what).";
  const odds = powerOdds(s, life, pw);
  const pass = odds === null ? true : pdice(g).chance(odds);
  if (pw.check) gainXp(g, life, pw.check.skill, 4);
  const text = pw.run(g, life, o, t, pass, side > 0 ? 1 : -1);
  if (text.startsWith("!")) return text.slice(1);
  if (pw.cost) spend(g, life, pw.cost);
  touchLife(g, life).cooldowns[cdKey(o, pw)] = s.day + pw.cooldown;
  // Using an office's power counts as doing its duty.
  o.duty = Math.max(o.duty, s.day - 20);
  g.societyChanged(`o${o.prov}`);
  journal(g, life, text, odds === null ? undefined : pass ? "good" : "bad");
  // POLLS (r16): a power carried is something delivered from the seat.
  if (pass)
    delivered(g, life, pw.label.replace(/\s*\(\d+\)$/, "").toLowerCase());
  return null;
}

// ---------------------------------------------------------------- subordinates

/** Offices whose holders you appoint (and can dismiss). */
export function subordinates(s: GameState, life: Life): LocalOffice[] {
  const out: LocalOffice[] = [];
  for (const list of Object.values(s.society?.offices ?? {}))
    for (const o of list)
      if (
        OFFICES[o.key].how !== "elected" &&
        o.holder !== life.c &&
        appointerOf(s, o) === life.c
      )
        out.push(o);
  return out;
}

/** Dismiss someone from an office in your gift. */
export function dismissLocal(
  g: ConquestGame,
  life: Life,
  id: number,
): string | null {
  const s = g.s;
  const o = officeById(s, id);
  if (!o) return "No such office.";
  if (OFFICES[o.key].how === "elected")
    return "The freeholders chose them: only the freeholders can put them out.";
  if (appointerOf(s, o) !== life.c)
    return "It isn't yours to give, or to take away.";
  if (o.holder < 0) return "It stands empty.";
  if (o.holder === life.c) return "Resign instead.";
  const c = s.chars[o.holder];
  const me = meOf(s, life);
  vacate(g, o, `dismissed by ${charName(me)}`);
  if (c?.alive)
    remembers(g, life, g.char(c.id), "Dismissed me from office", -25, 5);
  journal(
    g,
    life,
    `You dismiss ${charName(c)} as ${officeName(s, o).toLowerCase()}. The place is yours to fill.`,
  );
  return null;
}
