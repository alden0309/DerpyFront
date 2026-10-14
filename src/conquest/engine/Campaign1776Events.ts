// DLC (r21): the scenes of the 1776 campaign (Campaign1776.ts raises them):
// choosing a side, Common Sense, the Declaration read aloud, the battles of
// the army you serve with, a town occupied, the winter at Valley Forge, the
// Six Nations divided, the towns burned in 1779, a spy taken, and the peace
// (for the King's friends, and for the Continental soldier going home).
//
// Every scene says where it happens (EVENTS r21's tags) and rests with its
// family ("r76"). None puts words in another player's mouth, and none in a
// real person's: the generals are named as the news named them. The odds on
// every button come from the tables the choices roll.

import { beatDay, BEATS, cdice, courtMartial, provNamed } from "./Campaign1776";
import { britainOf, sideOf, SPY, usOf } from "./Campaign1776Core";
import { registerFamily } from "./EventPacing";
import { tag } from "./EventPlaces";
import type { ConquestGame } from "./Game";
import { leaveForEurope } from "./Life";
import {
  addRenown,
  addStress,
  earn,
  gainXp,
  hurt,
  journal,
  milestone,
  spend,
  touchLife,
} from "./LifeCore";
import type { LifeEventDef } from "./LifeEvents";
import { meOf } from "./LifeQueries";
import { JOBS } from "./LifeRules";
import { revSide } from "./Revolution";
import { addFavor } from "./Standing";
import type { Life } from "./Types";
import { leaveJob, promote } from "./Work";

type LCtx = Record<string, number>;

const pct = (p: number) =>
  p <= 0
    ? "no chance"
    : p >= 1
      ? "certain"
      : `1 in ${Math.max(2, Math.round(1 / p))}`;

const poor = (life: Life, n: number) =>
  life.purse < n ? `Needs ${n} coins` : null;

// ---------------------------------------------------------------- battles

/** What a battle can do to you, by how you fight it (the scene's buttons show these). */
export const BATTLE = {
  line: {
    dc: 9,
    renown: [4, 2] as [number, number],
    wound: [0.15, 0.3] as [number, number],
    death: 0.02,
  },
  lead: {
    dc: 12,
    renown: [8, 2] as [number, number],
    wound: [0.2, 0.4] as [number, number],
    death: 0.05,
    promote: 0.35,
  },
  back: { renown: 1, wound: 0.1, death: 0.01, stress: 6 },
  /** On the winning side. */
  won: 2,
  wound: [12, 40] as [number, number],
};

function battleOf(ctx: LCtx) {
  return BEATS[ctx.b];
}

/** Did your side win, lose or hold? */
function outcome(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
): "won" | "lost" | "drawn" {
  const b = battleOf(ctx)?.battle;
  if (!b) return "drawn";
  const king = life.job?.nation !== usOf(g.s);
  if (b.us === "drawn") return "drawn";
  return (b.us === "won") !== king ? "won" : "lost";
}

function fought(
  g: ConquestGame,
  life: Life,
  ctx: LCtx,
  how: "line" | "lead" | "back",
  pass: boolean,
): void {
  const s = g.s;
  const me = meOf(s, life);
  const b = battleOf(ctx);
  if (!me || !b?.battle) return;
  const p = provNamed(g.map, b.battle.at);
  const result = outcome(g, life, ctx);
  touchLife(g, life);
  life.tally.battles++;
  if (result === "won") life.tally.battlesWon++;
  const r = (life.r76 ??= {});
  r.fought = [...(r.fought ?? []), b.key];
  gainXp(g, life, "fighting", 25);
  gainXp(g, life, "leadership", how === "lead" ? 35 : 12);
  if (life.job) life.job.months += result === "won" ? 6 : 3;
  const foe = life.job?.nation === usOf(s) ? "the British" : "the Americans";
  milestone(
    g,
    life,
    "battle",
    `${result === "won" ? "Won" : result === "lost" ? "Lost" : "Fought"} the battle of ${b.title.replace(/^The battle of /, "")} against ${foe}`,
    p,
    { big: result === "won" && how === "lead" && pass },
  );
  let renown =
    how === "back"
      ? BATTLE.back.renown
      : pass
        ? BATTLE[how].renown[0]
        : BATTLE[how].renown[1];
  if (result === "won") renown += BATTLE.won;
  addRenown(g, life, renown);
  if (how === "back") addStress(g, life, BATTLE.back.stress);
  const d = cdice(s, 0x44, life.c, ctx.b);
  const death = how === "back" ? BATTLE.back.death : BATTLE[how].death;
  if (d.chance(death)) {
    journal(
      g,
      life,
      `You fall at ${b.title.replace(/^The battle of /, "")}.`,
      "bad",
    );
    hurt(g, life, 1000, `battle at ${g.map.provinces[p].name}`);
    return;
  }
  const wound =
    how === "back" ? BATTLE.back.wound : BATTLE[how].wound[pass ? 0 : 1];
  if (d.chance(wound)) {
    const dmg = d.int(BATTLE.wound[0], BATTLE.wound[1]);
    life.tally.wounds++;
    journal(
      g,
      life,
      dmg >= 30
        ? "A ball takes you in the body. The surgeons say you'll live, mostly."
        : "You come out of it cut and bruised, nothing that won't heal.",
      "bad",
    );
    hurt(g, life, dmg, `wounds taken at ${g.map.provinces[p].name}`);
    if (!meOf(s, life)?.alive) return;
  }
  if (
    how === "lead" &&
    pass &&
    life.job &&
    life.job.rank < JOBS.soldier.ranks.length - 2 &&
    d.chance(BATTLE.lead.promote)
  )
    promote(g, life);
  journal(
    g,
    life,
    result === "won"
      ? "The day is ours."
      : result === "lost"
        ? "The day is lost, but the army lives to fight again."
        : "Neither side gives way, and the night ends it.",
    result === "lost" ? "bad" : "good",
  );
}

const battleTip = (how: "line" | "lead" | "back") => {
  if (how === "back")
    return `Little glory: renown +${BATTLE.back.renown}, stress +${BATTLE.back.stress}. Wounded ${pct(BATTLE.back.wound)}, killed ${pct(BATTLE.back.death)}.`;
  const t = BATTLE[how];
  return `Passed: renown +${t.renown[0]}, wounded ${pct(t.wound[0])}${how === "lead" ? `, and ${pct(BATTLE.lead.promote)} you're promoted on the field` : ""}. Failed: renown +${t.renown[1]}, wounded ${pct(t.wound[1])}. Killed ${pct(t.death)} either way. A victory adds renown +${BATTLE.won}.`;
};

const BATTLE_EVENT: LifeEventDef = {
  key: "r76-battle",
  pool: "raised",
  cooldown: 0,
  scene: "battle",
  where: tag("job"),
  title: (_g, _l, ctx) => battleOf(ctx)?.title ?? "A battle",
  body: (g, life, ctx) => {
    const b = battleOf(ctx);
    const ours = life.job?.nation === usOf(g.s);
    const rank = life.job
      ? JOBS.soldier.ranks[life.job.rank].title.toLowerCase()
      : "soldier";
    return `${b?.text ?? ""}\n\nYou're there, a ${rank} ${ours ? "of the Continental Army" : "in the King's army, with the Loyalist regiments"}. The drums are beating.`;
  },
  choices: [
    {
      label: "Hold your place in the line",
      tip: () => battleTip("line"),
      check: { skill: "fighting", dc: BATTLE.line.dc },
      apply: (g, life, ctx, pass) => fought(g, life, ctx, "line", pass),
    },
    {
      label: "Lead the men forward",
      tip: () => battleTip("lead"),
      check: { skill: "leadership", dc: BATTLE.lead.dc },
      apply: (g, life, ctx, pass) => fought(g, life, ctx, "lead", pass),
    },
    {
      label: "Keep your head down",
      tip: () => battleTip("back"),
      apply: (g, life, ctx) => fought(g, life, ctx, "back", true),
    },
  ],
};

// ---------------------------------------------------------------- choosing a side

const SIDES_EVENT: LifeEventDef = {
  key: "r76-sides",
  pool: "raised",
  cooldown: 0,
  scene: "rising",
  where: tag(""),
  title: "Whose side are you on?",
  body: (g) =>
    g.s.day < beatDay(BEATS.find((b) => b.key === "declaration")!)
      ? "Since the fighting at Lexington and Concord last April the colonies have been at war with the King's army, though nobody has yet said the word independence aloud in Congress. The committee of safety keeps a list of who signed the Association, the King's friends keep another, and your neighbours are deciding which to be on."
      : "The United States have declared themselves free of the King, and the King's army means to prove otherwise. The committee of safety keeps a list of who has taken the oath to the State, the King's friends keep another, and your neighbours are deciding which to be on.",
  choices: [
    {
      label: "Stand with the patriots",
      tip: "Renown +3 now. When the war ends in the United States' favour: renown +8. The King's officers will remember your name.",
      apply: (g, life) => void revSide(g, life, "patriot"),
    },
    {
      label: "Stand with the King",
      tip: "Favour +5 now. Serve in a Loyalist regiment where his army holds the town. When the war ends: a third of your purse confiscated by the committees, renown −5 (or go to Nova Scotia).",
      apply: (g, life) => void revSide(g, life, "loyal"),
    },
    {
      label: "Keep your head down",
      tip: "Neither side. Nothing gained, nothing lost; you can choose later (Society › The war).",
      apply: (g, life) => void revSide(g, life, "neutral"),
    },
  ],
};

// ---------------------------------------------------------------- Common Sense

const PAMPHLET_EVENT: LifeEventDef = {
  key: "r76-pamphlet",
  pool: "raised",
  cooldown: 0,
  scene: "tavern",
  where: tag("town"),
  title: "Common Sense",
  body: () =>
    "Somebody has a copy of the pamphlet everyone is talking about, Common Sense, printed at Philadelphia. It says that a continent should not be governed by an island, that kings are a bad idea in general, and that the time to part is now. The tavern wants it read aloud.",
  choices: [
    {
      label: "Read it aloud to the room",
      tip: "Persuasion: renown +3 and the room's cheers; or you stumble over the long words.",
      check: { skill: "persuasion", dc: 9 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "persuasion", pass ? 12 : 6);
        if (pass) {
          addRenown(g, life, 3);
          journal(
            g,
            life,
            "You read it well, and the room is on its feet by the end.",
            "good",
          );
        } else
          journal(
            g,
            life,
            "You stumble over the long words, and someone else takes it off you.",
          );
      },
    },
    {
      label: "Write an answer for the King",
      tip: "Letters: the loyal printers take it (favour +4); or nobody will print it.",
      check: { skill: "letters", dc: 12 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "letters", pass ? 15 : 8);
        if (pass) {
          addFavor(g, life, 4);
          journal(
            g,
            life,
            "Your answer to Common Sense is printed in New York, and burned in Philadelphia.",
            "good",
          );
        } else journal(g, life, "No printer in town will touch your answer.");
      },
    },
    {
      label: "Light your pipe with it",
      tip: "Nothing changes.",
      apply: () => undefined,
    },
  ],
};

// ---------------------------------------------------------------- the Declaration

const DECLARATION_EVENT: LifeEventDef = {
  key: "r76-declaration",
  pool: "raised",
  cooldown: 0,
  scene: "governor",
  where: tag("town"),
  title: "The Declaration read aloud",
  body: () =>
    "A rider has brought the printed Declaration from Philadelphia, and it's read from the courthouse steps: that all men are created equal, a long list of the King's offences, and that these colonies are free and independent states. The bells ring. Someone has a ladder against the courthouse, under the King's arms.",
  choices: [
    {
      label: "Cheer with the crowd",
      tip: "A patriot: renown +2. Anyone else: a nervous afternoon (stress +3).",
      apply: (g, life) => {
        if (sideOf(g.s, life) === "patriot") addRenown(g, life, 2);
        else addStress(g, life, 3);
      },
    },
    {
      label: "Help pull down the King's arms",
      tip: "Renown +3; the King's friends won't forget it (favour −6).",
      apply: (g, life) => {
        addRenown(g, life, 3);
        addFavor(g, life, -6);
        journal(
          g,
          life,
          "The carved lion and unicorn come down in splinters, and go on the bonfire.",
          "good",
        );
      },
    },
    {
      label: "Stay home with the shutters closed",
      tip: "Nothing changes.",
      apply: () => undefined,
    },
  ],
};

// ---------------------------------------------------------------- a town occupied

const OCCUPIED_EVENT: LifeEventDef = {
  key: "r76-occupied",
  pool: "raised",
  cooldown: 0,
  scene: "fort",
  where: tag(""),
  title: (g, _l, ctx) =>
    `The King's army in ${g.map.provinces[ctx.p]?.name ?? "town"}`,
  body: (g, _l, ctx) =>
    `${BEATS[ctx.b]?.text ?? ""}\n\nRedcoats are quartered in the houses of ${g.map.provinces[ctx.p]?.name ?? "your town"}, and the committee's men have gone. Some of your neighbours are glad of it.`,
  choices: [
    {
      label: "Keep your head down and your doors shut",
      tip: "Stress +4.",
      apply: (g, life) => addStress(g, life, 4),
    },
    {
      label: "Welcome them in",
      tip: "Favour +4; your patriot neighbours remember (renown −2). Not for a patriot.",
      blocked: (g, life) =>
        sideOf(g.s, life) === "patriot" ? "You're a patriot" : null,
      apply: (g, life) => {
        addFavor(g, life, 4);
        addRenown(g, life, -2);
      },
    },
    {
      label: "Hide the committee's papers",
      tip: "Stealth: renown +3 among the patriots; or you're taken up for a night (favour −3, stress +6). Not for the King's friends.",
      check: { skill: "stealth", dc: 10 },
      blocked: (g, life) =>
        sideOf(g.s, life) === "loyal" ? "You stand with the King" : null,
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "stealth", 10);
        if (pass) addRenown(g, life, 3);
        else {
          addFavor(g, life, -3);
          addStress(g, life, 6);
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- Valley Forge

const WINTER = { health: 8, stress: 8, desert: -8 };

const WINTER_EVENT: LifeEventDef = {
  key: "r76-winter",
  pool: "raised",
  cooldown: 0,
  scene: "snow",
  where: tag("job"),
  title: "Winter at Valley Forge",
  body: () =>
    "The army builds log huts on the hillside above the Schuylkill. There's firecake (flour and water baked on a stone) and not much else, men without shoes leave blood on the snow, and the camp fever goes from hut to hut. Some go home and don't come back.",
  choices: [
    {
      label: "Stay with the army",
      tip: `Health −${WINTER.health}, stress +${WINTER.stress}; fighting and leadership grow with the spring's drilling, and renown +3.`,
      apply: (g, life) => {
        hurt(g, life, WINTER.health, "the winter at Valley Forge");
        if (!meOf(g.s, life)?.alive) return;
        addStress(g, life, WINTER.stress);
        gainXp(g, life, "fighting", 20);
        gainXp(g, life, "leadership", 10);
        addRenown(g, life, 3);
        milestone(g, life, "battle", "Wintered at Valley Forge", life.prov);
      },
    },
    {
      label: "Forage for the camp",
      tip: "Woodcraft: renown +4 and the men's thanks; or the cold gets into you (health −6).",
      check: { skill: "woodcraft", dc: 11 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "woodcraft", 15);
        if (pass) addRenown(g, life, 4);
        else hurt(g, life, 6, "the winter at Valley Forge");
      },
    },
    {
      label: "Desert, and go home",
      tip: `You leave the army (renown ${WINTER.desert}, and the name of a deserter).`,
      apply: (g, life) => {
        addRenown(g, life, WINTER.desert);
        leaveJob(g, life, "by walking away from Valley Forge");
        touchLife(g, life).job = null;
      },
    },
  ],
};

// ---------------------------------------------------------------- the native nations

const NATIONS_EVENT: LifeEventDef = {
  key: "r76-nations",
  pool: "raised",
  cooldown: 0,
  scene: "councilfire",
  where: tag("settled"),
  title: "Belts from both sides",
  body: () =>
    "Wampum belts and presents come from the British at Niagara and from the Americans' commissioners, both asking for the nations' help or at least their peace. The King's men say they'll keep the settlers off your land; the Americans say they'll remember who stood aside. At Oriskany, the Six Nations' own warriors have fought each other for the first time. The council is talking far into the night.",
  choices: [
    {
      label: "Speak for the King's side",
      tip: "Persuasion: renown +3 if the council listens.",
      check: { skill: "persuasion", dc: 11 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "persuasion", 12);
        if (pass) addRenown(g, life, 3);
      },
    },
    {
      label: "Speak for the Americans",
      tip: "Persuasion: renown +3 if the council listens.",
      check: { skill: "persuasion", dc: 11 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "persuasion", 12);
        if (pass) addRenown(g, life, 3);
      },
    },
    {
      label: "Speak for keeping out of it",
      tip: "Faith grows, and an easier mind (stress −4), whatever the council does.",
      apply: (g, life) => {
        gainXp(g, life, "faith", 10);
        addStress(g, life, -4);
      },
    },
  ],
};

const BURNED_EVENT: LifeEventDef = {
  key: "r76-burned",
  pool: "raised",
  cooldown: 0,
  scene: "village",
  where: tag("settled"),
  title: "The towns burn",
  body: () =>
    "Runners bring word that a Continental army is coming up the valleys from the south, burning the towns as it goes: the longhouses, the orchards, the corn standing in the fields and in the stores. There are too many of them to stop. The old people and the children have to go somewhere before the winter.",
  choices: [
    {
      label: "Lead the old and the young to Niagara",
      tip: "Leadership: renown +4 and stress +6; or a hungry winter on the way (health −10, stress +10).",
      check: { skill: "leadership", dc: 11 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "leadership", 15);
        if (pass) {
          addRenown(g, life, 4);
          addStress(g, life, 6);
        } else {
          hurt(g, life, 10, "the winter at Niagara");
          addStress(g, life, 10);
        }
      },
    },
    {
      label: "Stand with the warriors at the river",
      tip: "Fighting: renown +5; or a wound (health −15).",
      check: { skill: "fighting", dc: 12 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "fighting", 15);
        if (pass) addRenown(g, life, 5);
        else hurt(g, life, 15, "a musket ball at the river");
      },
    },
    {
      label: "Hide the seed corn and come back in spring",
      tip: "Woodcraft: the seed is saved (stress −5); or it's found and burned (stress +8).",
      check: { skill: "woodcraft", dc: 10 },
      apply: (g, life, _c, pass) => {
        gainXp(g, life, "woodcraft", 12);
        addStress(g, life, pass ? -5 : 8);
      },
    },
  ],
};

// ---------------------------------------------------------------- a spy taken

const CAUGHT_EVENT: LifeEventDef = {
  key: "r76-spy-caught",
  pool: "raised",
  cooldown: 0,
  scene: "gaol",
  where: tag(""),
  title: "Taken as a spy",
  body: (g, _l, ctx) =>
    `Two soldiers stop you in the street at ${g.map.provinces[ctx.p]?.name ?? "the town"}, and a sergeant wants to know what's in your coat and what you're doing here. Spies are hanged in this war.`,
  choices: [
    {
      label: "Bluff: you're a merchant about your business",
      tip: `Persuasion: they let you go. If it fails, a court martial: hanged ${pct(SPY.hanged)}, otherwise held until you're exchanged (${SPY.heldDays} days).`,
      check: { skill: "persuasion", dc: SPY.bluffDc },
      apply: (g, life, _c, pass) => {
        if (pass)
          journal(
            g,
            life,
            "The sergeant believes you, or can't be bothered not to.",
            "good",
          );
        else courtMartial(g, life);
      },
    },
    {
      label: `Slip the sergeant your purse (${SPY.bribe} coins)`,
      tip: `${pct(SPY.bribeWorks)} he takes it and looks away. If not, a court martial: hanged ${pct(SPY.hanged)}, otherwise held until exchanged.`,
      blocked: (_g, life) => poor(life, SPY.bribe),
      apply: (g, life) => {
        spend(g, life, SPY.bribe);
        if (cdice(g.s, 0x55, life.c, g.s.day).chance(SPY.bribeWorks))
          journal(
            g,
            life,
            "The sergeant pockets it and finds something else to look at.",
          );
        else courtMartial(g, life);
      },
    },
    {
      label: "Say nothing",
      tip: `A court martial: hanged ${pct(SPY.hanged)}, otherwise held until you're exchanged (${SPY.heldDays} days).`,
      apply: (g, life) => courtMartial(g, life),
    },
  ],
};

// ---------------------------------------------------------------- the peace

const PEACE_EVENT: LifeEventDef = {
  key: "r76-peace",
  pool: "raised",
  cooldown: 0,
  scene: "docks",
  where: tag(""),
  title: "The King's friends, after the peace",
  body: () =>
    "The peace is signed and the King's cause in the thirteen states is lost. The committees are seizing loyalists' houses and land, and some of your neighbours won't speak to you in the street. Transports are taking the King's friends north to Nova Scotia, and some are sailing for England.",
  choices: [
    {
      label: "Go north to Nova Scotia",
      tip: "You make a new home at Halifax, among the King's people, and leave your land and houses in the States behind. Stress +10.",
      apply: (g, life) => toNovaScotia(g, life),
    },
    {
      label: "Sail for England",
      tip: "Into exile: your character's story here ends (your heir, if you have one, carries the line on).",
      apply: (g, life) => {
        touchLife(g, life).invite = { why: "exile", until: g.s.day + 60 };
        const err = leaveForEurope(g, life, false);
        if (err) {
          touchLife(g, life).invite = null;
          journal(g, life, err);
        }
      },
    },
    {
      label: "Stay, take the oath, and hope they forget",
      tip: "Renown −3, stress +5. You keep what the committees left you.",
      apply: (g, life) => {
        addRenown(g, life, -3);
        addStress(g, life, 5);
        journal(
          g,
          life,
          "You swear allegiance to the State, and keep your eyes down for a few years.",
        );
      },
    },
  ],
};

function toNovaScotia(g: ConquestGame, life: Life): void {
  const s = g.s;
  const me = meOf(s, life);
  const br = britainOf(s);
  if (!me || br < 0) return;
  const halifax = provNamed(g.map, "Chebucto");
  const us = usOf(s);
  touchLife(g, life);
  const left = (life.property ?? []).filter(
    (p) => s.provinces[p.prov]?.owner === us,
  );
  life.property = (life.property ?? []).filter((p) => !left.includes(p));
  g.touchChar(me).nation = br;
  if (me.spouse >= 0 && s.chars[me.spouse]?.alive)
    g.char(me.spouse).nation = br;
  for (const k of me.children) if (s.chars[k]?.alive) g.char(k).nation = br;
  life.home = halifax;
  life.prov = halifax;
  life.travel = null;
  life.area = undefined;
  if (life.job && s.provinces[life.job.prov]?.owner === us) life.job = null;
  addStress(g, life, 10);
  milestone(
    g,
    life,
    "home",
    "Went north to Nova Scotia with the loyalists",
    halifax,
  );
  journal(
    g,
    life,
    `You sail north with the loyalist fleet and begin again at Halifax${left.length ? `; what you owned in the States (${left.length === 1 ? "one property" : `${left.length} properties`}) is left to the committees` : ""}.`,
    "bad",
  );
}

const DISBAND = { warrant: 8, perRank: 4, renown: 4 };

const DISBAND_EVENT: LifeEventDef = {
  key: "r76-disband",
  pool: "raised",
  cooldown: 0,
  scene: "fort",
  where: tag("job"),
  title: "The army goes home",
  body: () =>
    "With the peace signed, the Continental Army is sent home a regiment at a time, most of its pay still owed in certificates nobody believes in. Every soldier who served to the end has a land warrant: a claim to land in the west, someday.",
  choices: [
    {
      label: "Sell your land warrant to a speculator",
      tip: (_g, life) =>
        `Coins now: ${DISBAND.warrant + DISBAND.perRank * (life.job?.rank ?? 0)}. You leave the army.`,
      apply: (g, life) => {
        const coins = DISBAND.warrant + DISBAND.perRank * (life.job?.rank ?? 0);
        earn(g, life, coins);
        leaveJob(g, life, "when the army was sent home");
        touchLife(g, life).job = null;
        journal(
          g,
          life,
          `A speculator gives you ${coins} coins for your warrant, and grins.`,
        );
      },
    },
    {
      label: "Keep your warrant: land in the west, someday",
      tip: `Renown +${DISBAND.renown}. You leave the army.`,
      apply: (g, life) => {
        addRenown(g, life, DISBAND.renown);
        leaveJob(g, life, "when the army was sent home");
        touchLife(g, life).job = null;
        journal(
          g,
          life,
          "You fold the warrant into your Bible. Land in the Ohio country, one day.",
          "good",
        );
      },
    },
    {
      label: "Stay on in the little peacetime army",
      tip: "Only officers: you keep your commission and your pay.",
      blocked: (_g, life) =>
        (life.job?.rank ?? 0) < 3 ? "Only officers stay on" : null,
      apply: (g, life) =>
        journal(
          g,
          life,
          "You stay on, one of a few hundred kept under arms to guard the frontier posts.",
        ),
    },
  ],
};

// ---------------------------------------------------------------- registered

const ALL: LifeEventDef[] = [
  SIDES_EVENT,
  PAMPHLET_EVENT,
  DECLARATION_EVENT,
  BATTLE_EVENT,
  OCCUPIED_EVENT,
  WINTER_EVENT,
  NATIONS_EVENT,
  BURNED_EVENT,
  CAUGHT_EVENT,
  PEACE_EVENT,
  DISBAND_EVENT,
];

let paced = false;

/** The campaign's scenes, registered with the event pacing the first time they're looked up. */
export function r76Events(): LifeEventDef[] {
  if (!paced) {
    paced = true;
    registerFamily(
      "r76",
      ALL.map((d) => d.key),
      30,
    );
  }
  return ALL;
}

/** Each scene's quiet course, left unanswered. */
export function r76Quiet(): Record<string, number> {
  return {
    "r76-sides": 2,
    "r76-pamphlet": 2,
    "r76-declaration": 2,
    "r76-battle": 0,
    "r76-occupied": 0,
    "r76-winter": 0,
    "r76-nations": 2,
    "r76-burned": 0,
    "r76-spy-caught": 1,
    "r76-peace": 2,
    "r76-disband": 1,
  };
}

export { r76Secret } from "./Campaign1776Core";
