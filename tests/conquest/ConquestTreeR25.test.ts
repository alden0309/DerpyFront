// TREE (r25): the dynasty. A line's family tree is made from the game's
// state (every character the seat played, their husbands and wives, their
// children played or not, their parents and brothers and sisters), laid
// out as a chart (generations in rows, couples side by side, children under
// the couple they came of), with each life told from the game's records;
// each seat sees its own line and others only as far as anyone may; a
// divorce is remembered; the site's record has no ids and no secrets; a
// finished game's chronicle makes a smaller one; and old saves still give a
// tree.

import { describe, expect, test } from "vitest";
import { kill, makeCharacter, marry } from "../../src/conquest/engine/Characters";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { dynastyOf } from "../../src/conquest/engine/Dynasty";
import {
  dynastyCharts,
  dynastyFromChronicle,
  dynName,
  dynRelation,
  dynYears,
  type DynastyRecord,
} from "../../src/conquest/engine/DynastyCore";
import { chronicleOf } from "../../src/conquest/engine/Chronicle";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { chartLines, KIN_DIMS } from "../../src/conquest/engine/KinChart";
import { lineCharacters } from "../../src/conquest/engine/Legacy";
import { takeOver } from "../../src/conquest/engine/Life";
import { milestone } from "../../src/conquest/engine/LifeCore";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { partWays } from "../../src/conquest/engine/Liaisons";
import type { Character, Life } from "../../src/conquest/engine/Types";
import { lifeOf, map, plan, ticks, world } from "./LifeUtil";

const q = { quiet: true } as const;

/** Someone new in the world, kin to nobody yet. */
function person(
  g: ConquestGame,
  like: Character,
  o: { female: boolean; age: number; first?: string; family?: string },
): Character {
  const c = makeCharacter(g.s, g.rng, {
    nation: like.nation,
    culture: g.s.nations[like.nation].culture,
    religion: like.religion,
    female: o.female,
    age: o.age,
    ...(o.first ? { first: o.first } : {}),
    family: o.family ?? like.family,
  });
  c.home = like.home;
  return c;
}

/** A child of two people, of an age. */
function childOf(
  g: ConquestGame,
  father: Character,
  mother: Character | null,
  o: { female: boolean; age: number; first: string },
): Character {
  const c = person(g, father, { ...o, family: father.family });
  c.father = father.id;
  father.children.push(c.id);
  if (mother) {
    c.mother = mother.id;
    mother.children.push(c.id);
  }
  return c;
}

function wed(g: ConquestGame, life: Life, a: Character, b: Character): void {
  marry(g.s, a, b);
  milestone(g, life, "married", `Married ${b.first} ${b.family}`, life.prov, q);
}

/**
 * Three generations of the Drackleys: Alden (his parents and a brother
 * known) marries Mary; their son Thomas and daughter Ann; Alden dies and
 * Thomas carries on, marries Jane (who dies), then Ruth; a son by each.
 */
function threeGenerations(seed = 5) {
  const g = world({ start: 1700, seed });
  g.aiEnabled = false;
  const life = lifeOf(g);
  const alden = meOf(g.s, life)!;
  const dad = person(g, alden, { female: false, age: 50, first: "Robert" });
  const mum = person(g, alden, { female: true, age: 47, first: "Grace" });
  marry(g.s, dad, mum);
  alden.father = dad.id;
  alden.mother = mum.id;
  dad.children.push(alden.id);
  mum.children.push(alden.id);
  const brother = childOf(g, dad, mum, {
    female: false,
    age: 19,
    first: "Edmund",
  });
  const mary = person(g, alden, {
    female: true,
    age: 20,
    first: "Mary",
    family: "Cole",
  });
  wed(g, life, alden, mary);
  milestone(g, life, "job", "Took up work as a cooper at Jamestown", life.prov, q);
  milestone(g, life, "promoted", "Rose to master cooper", life.prov, q);
  milestone(g, life, "office", "Elected to the House of Burgesses", life.prov, q);
  milestone(
    g,
    life,
    "battle",
    "Won the battle of St. Augustine against Spain",
    life.prov,
    q,
  );
  const thomas = childOf(g, alden, mary, {
    female: false,
    age: 20,
    first: "Thomas",
  });
  const ann = childOf(g, alden, mary, { female: true, age: 17, first: "Ann" });
  ticks(g, 3);
  kill(g, alden, "a fever at 45");
  expect(life.c).toBe(thomas.id);
  const jane = person(g, thomas, {
    female: true,
    age: 19,
    first: "Jane",
    family: "Hale",
  });
  wed(g, life, thomas, jane);
  const john = childOf(g, thomas, jane, {
    female: false,
    age: 0,
    first: "John",
  });
  kill(g, jane, "childbed");
  const ruth = person(g, thomas, {
    female: true,
    age: 24,
    first: "Ruth",
    family: "Webb",
  });
  wed(g, life, thomas, ruth);
  const peter = childOf(g, thomas, ruth, {
    female: false,
    age: 0,
    first: "Peter",
  });
  return {
    g,
    life,
    alden,
    dad,
    mum,
    brother,
    mary,
    thomas,
    ann,
    jane,
    ruth,
    john,
    peter,
  };
}

const byC = (rec: DynastyRecord, c: number) => {
  const i = rec.people.findIndex((p) => p.c === c);
  if (i < 0) throw new Error(`no ${c} on the tree`);
  return i;
};

describe("the dynasty (TREE r25)", () => {
  test("the tree is made from the game: the line, parents, brothers and sisters, husbands and wives, children, the heir", () => {
    const f = threeGenerations();
    const rec = dynastyOf(f.g.s, f.life, map);
    const at = (c: Character) => byC(rec, c.id);
    // Everyone the seat played, in order, and everyone kin to them.
    expect(rec.line).toEqual([at(f.alden), at(f.thomas)]);
    for (const c of [
      f.dad,
      f.mum,
      f.brother,
      f.mary,
      f.ann,
      f.jane,
      f.ruth,
      f.john,
      f.peter,
    ])
      expect(at(c)).toBeGreaterThanOrEqual(0);
    const P = rec.people;
    expect(rec.family).toBe("Drackley");
    expect(P[at(f.alden)]).toMatchObject({
      father: at(f.dad),
      mother: at(f.mum),
      dead: true,
      cause: "of a fever at 45",
    });
    expect(P[at(f.alden)].spouses).toEqual([at(f.mary)]);
    expect(P[at(f.brother)]).toMatchObject({
      father: at(f.dad),
      mother: at(f.mum),
    });
    expect(P[at(f.thomas)]).toMatchObject({
      father: at(f.alden),
      mother: at(f.mary),
      you: true,
    });
    // Both of Thomas's wives, the dead one first.
    expect(P[at(f.thomas)].spouses).toEqual([at(f.jane), at(f.ruth)]);
    expect(P[at(f.jane)].dead).toBe(true);
    expect(P[at(f.john)]).toMatchObject({
      father: at(f.thomas),
      mother: at(f.jane),
      heir: true, // the eldest living child
    });
    expect(P[at(f.peter)].mother).toBe(at(f.ruth));
    // Played marks, and how each stands in the line.
    expect(P[at(f.alden)].life?.n).toBe(1);
    expect(P[at(f.thomas)].life?.n).toBe(2);
    expect(P[at(f.ann)].life).toBeUndefined();
    expect(dynRelation(rec, at(f.alden))).toBe("First of the line");
    expect(dynRelation(rec, at(f.thomas))).toBe("Head of the family now");
    expect(dynRelation(rec, at(f.mary))).toBe("Wife of Alden");
    expect(dynRelation(rec, at(f.ann))).toBe("Daughter of Alden");
    expect(dynRelation(rec, at(f.dad))).toBe("Father of Alden");
    expect(dynRelation(rec, at(f.brother))).toBe("Brother of Alden");
    expect(dynRelation(rec, at(f.ruth))).toBe("Wife of Thomas");
    expect(dynName(P[at(f.mary)])).toBe("Mary Drackley"); // married name
    expect(dynYears(P[at(f.alden)])).toMatch(/^\d{4}–\d{4}$/);
    expect(dynYears(P[at(f.ann)])).toMatch(/^b\. \d{4}$/);
  });

  test("each life is told from the game's records: work and ranks, offices, what they left, the moments, the chapter", () => {
    const f = threeGenerations();
    const rec = dynastyOf(f.g.s, f.life, map);
    const life = rec.people[byC(rec, f.alden.id)].life!;
    expect(life).toMatchObject({
      came: "born",
      ended: "died",
      fate: "died of a fever at 45",
      home: "Jamestown",
    });
    // The farm he began on, then the trade he took up and rose in.
    expect(life.work).toEqual([
      "Took up work as tenant farmer at Jamestown",
      "Took up work as a cooper at Jamestown",
      "Rose to master cooper",
    ]);
    expect(life.offices).toEqual(["Elected to the House of Burgesses"]);
    expect(life.moments.map((m) => m.t)).toContain(
      "Won the battle of St. Augustine against Spain",
    );
    expect(life.moments.every((m) => m.y >= 1700)).toBe(true);
    expect(life.story.length).toBeGreaterThan(0);
    expect(life.story.join(" ")).toMatch(/Alden/);
    // The living: where they are and how.
    const now = rec.people[byC(rec, f.thomas.id)];
    expect(now.life?.ended).toBe("living");
    expect(now.now).toMatch(/^At Jamestown, \d+ years old, in \w+ health$/);
    expect(rec.people[byC(rec, f.ann.id)].now).toMatch(/Jamestown/);
    expect(rec.people[byC(rec, f.jane.id)].now).toBeUndefined();
  });

  test("the chart: generations in rows, couples side by side, children under their parents, nobody on top of anyone", () => {
    const f = threeGenerations();
    const rec = dynastyOf(f.g.s, f.life, map);
    const charts = dynastyCharts(rec);
    expect(charts).toHaveLength(1);
    const t = charts[0];
    const node = (c: Character) => t.nodes.find((n) => n.c === byC(rec, c.id))!;
    expect(t.nodes).toHaveLength(rec.people.length);
    expect(t.family).toBe("Drackley");
    // Rows: the parents above Alden, his children, then theirs.
    expect(node(f.dad).gen).toBe(node(f.alden).gen - 1);
    expect(node(f.mum).gen).toBe(node(f.dad).gen);
    expect(node(f.brother).gen).toBe(node(f.alden).gen);
    expect(node(f.mary).gen).toBe(node(f.alden).gen);
    expect(node(f.thomas).gen).toBe(node(f.alden).gen + 1);
    expect(node(f.john).gen).toBe(node(f.thomas).gen + 1);
    expect(t.maxGen - t.minGen).toBe(3);
    // Husband and wife side by side, joined by the double rule.
    expect(Math.abs(node(f.alden).x - node(f.mary).x)).toBeCloseTo(1, 5);
    const couple = t.couples.find(
      (c) =>
        [c.a, c.b].includes(byC(rec, f.alden.id)) &&
        [c.a, c.b].includes(byC(rec, f.mary.id)),
    );
    expect(couple).toMatchObject({ kind: "married", near: true });
    // Thomas between his two wives, each wife's son under their couple.
    const [jx, tx, rx] = [node(f.jane).x, node(f.thomas).x, node(f.ruth).x];
    expect(jx).toBeLessThan(tx);
    expect(rx).toBeGreaterThan(tx);
    expect(node(f.john).x).toBeLessThan(node(f.peter).x);
    // Children hang from the couple they came of.
    const fam = t.descents.find(
      (d) => d.parents.includes(byC(rec, f.alden.id)) && d.parents.length === 2,
    )!;
    expect(fam.children.sort()).toEqual(
      [byC(rec, f.thomas.id), byC(rec, f.ann.id)].sort(),
    );
    const grand = t.descents.find((d) => d.parents.includes(byC(rec, f.dad.id)))!;
    expect(grand.children).toContain(byC(rec, f.alden.id));
    expect(grand.children).toContain(byC(rec, f.brother.id));
    // Nobody shares a place: in each row, a card's width apart at least.
    for (let gen = t.minGen; gen <= t.maxGen; gen++) {
      const xs = t.nodes
        .filter((n) => n.gen === gen)
        .map((n) => n.x)
        .sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++)
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(0.999);
    }
    // And it draws: a rule for each couple, a line for each family.
    const lines = chartLines(t, KIN_DIMS);
    expect(lines.filter((l) => l.kind === "wed")).toHaveLength(
      t.couples.length,
    );
    expect(lines.filter((l) => l.kind === "line")).toHaveLength(
      t.descents.length,
    );
    expect(lines.every((l) => !/NaN|undefined/.test(l.d))).toBe(true);
  });

  test("a narrow tree: the next generation spreads under their aunts and uncles, not beside them", () => {
    const f = threeGenerations();
    // Five more children of Alden's, none of whom carried on.
    for (let i = 0; i < 5; i++)
      childOf(f.g, f.alden, f.mary, {
        female: i % 2 === 0,
        age: 10 + i,
        first: `Kid${i}`,
      });
    for (let i = 0; i < 4; i++)
      childOf(f.g, f.thomas, f.ruth, {
        female: i % 2 === 1,
        age: 0,
        first: `Grand${i}`,
      });
    const rec = dynastyOf(f.g.s, f.life, map);
    const t = dynastyCharts(rec)[0];
    const widest = Math.max(
      ...[...new Set(t.nodes.map((n) => n.gen))].map(
        (gen) => t.nodes.filter((n) => n.gen === gen).length,
      ),
    );
    // No wider than its widest row and a little room between branches.
    expect(t.maxX + 1).toBeLessThanOrEqual(widest * 1.6);
  });

  test("a divorce is remembered: the wife set aside stays on the tree", () => {
    const g = world({ start: 1700, seed: 9 });
    g.aiEnabled = false;
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    me.religion = "puritan";
    const wife = person(g, me, {
      female: true,
      age: 21,
      first: "Patience",
      family: "Fell",
    });
    wed(g, life, me, wife);
    partWays(g, life);
    expect(me.spouse).toBe(-1);
    expect(wife.spouse).toBe(-1);
    expect(life.legacy?.wed).toEqual([[me.id, wife.id]]);
    const rec = dynastyOf(g.s, life, map);
    expect(rec.people[byC(rec, me.id)].spouses).toEqual([byC(rec, wife.id)]);
  });

  test("each seat sees its own line; another player's character is on it only as a husband or wife, and their secrets never", () => {
    const g = world({
      start: 1700,
      seed: 11,
      plans: [
        { seat: "s1", name: "Alden", plan: plan() },
        {
          seat: "s2",
          name: "Bea",
          plan: plan({ first: "Beatrice", family: "Lowe", female: true }),
        },
      ],
    });
    g.aiEnabled = false;
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const alden = meOf(g.s, a)!;
    const bea = meOf(g.s, b)!;
    // Bea's own family, and a lover of hers with a child kept secret.
    const beaDad = person(g, bea, { female: false, age: 52, first: "Hugh" });
    bea.father = beaDad.id;
    beaDad.children.push(bea.id);
    const beaLover = person(g, bea, {
      female: false,
      age: 30,
      first: "Silas",
      family: "Crane",
    });
    const secret = person(g, beaLover, {
      female: false,
      age: 0,
      first: "Hidden",
    });
    b.affairs = [
      {
        c: beaLover.id,
        since: g.s.day,
        exposure: 0,
        known: [],
        kids: [secret.id],
        met: g.s.day,
        blackmailer: -1,
      },
    ];
    // Alden's own lover and a child he never owned to.
    const aldenLover = person(g, alden, {
      female: true,
      age: 25,
      first: "Kate",
      family: "Moss",
    });
    const aldenSecret = childOf(g, aldenLover, null, {
      female: true,
      age: 0,
      first: "Nell",
    });
    aldenSecret.mother = aldenLover.id;
    aldenSecret.father = -1;
    a.affairs = [
      {
        c: aldenLover.id,
        since: g.s.day,
        exposure: 0,
        known: [],
        kids: [aldenSecret.id],
        met: g.s.day,
        blackmailer: -1,
      },
    ];
    // Then Alden and Bea marry: she's on his tree as his wife.
    wed(g, a, alden, bea);
    const mine = dynastyOf(g.s, a, map);
    const her = mine.people[byC(mine, bea.id)];
    expect(her.other).toBe("Bea");
    expect(her.life).toBeUndefined();
    expect(her.now).toBeUndefined();
    expect(her.traits).toBeUndefined();
    expect(mine.line).toEqual([byC(mine, alden.id)]);
    // Not her father (her own line's business), never her lover or her secret.
    for (const c of [beaDad, beaLover, secret])
      expect(mine.people.some((p) => p.c === c.id)).toBe(false);
    // Alden's own secret is in his own record, and nobody else's.
    const nell = mine.people[byC(mine, aldenSecret.id)];
    expect(nell).toMatchObject({ hidden: true, father: byC(mine, alden.id) });
    expect(mine.people[byC(mine, alden.id)].lovers).toEqual([
      byC(mine, aldenLover.id),
    ]);
    expect(dynRelation(mine, byC(mine, aldenSecret.id))).toBe(
      "Daughter of Alden, unowned",
    );
    const t = dynastyCharts(mine)[0];
    expect(t.couples.some((c) => c.kind === "lovers")).toBe(true);
    expect(t.descents.some((d) => d.hidden)).toBe(true);
    const shown = dynastyOf(g.s, a, map, { secrets: false, ids: false });
    expect(shown.people.some((p) => p.first === "Nell")).toBe(false);
    expect(shown.people.some((p) => p.first === "Kate")).toBe(false);
    expect(shown.people.find((p) => p.first === "Beatrice")?.other).toBe("");
    // Bea's tree: her father, her husband Alden as another player's, her secret child.
    const theirs = dynastyOf(g.s, b, map);
    expect(theirs.people[byC(theirs, beaDad.id)].life).toBeUndefined();
    expect(theirs.people[byC(theirs, alden.id)].other).toBe("Alden");
    expect(theirs.people.some((p) => p.c === aldenSecret.id)).toBe(false);
  });

  test("the site's record: no ids, nothing secret, and every life still told", () => {
    const f = threeGenerations();
    milestone(f.g, f.life, "plot", "Plotted the ruin of a rival", f.life.prov, {
      sec: true,
    });
    const own = dynastyOf(f.g.s, f.life, map);
    const site = dynastyOf(f.g.s, f.life, map, { secrets: false, ids: false });
    const json = JSON.stringify(site);
    expect(json).not.toMatch(/"c":/);
    expect(json).not.toMatch(/Plotted|plotted/);
    expect(JSON.stringify(own)).toMatch(/Plotted the ruin/);
    expect(site.people).toHaveLength(own.people.length);
    expect(site.line).toEqual(own.line);
    expect(site.people[site.line[0]].life?.story.length).toBeGreaterThan(0);
    // Small enough to keep: a few kilobytes for three generations.
    expect(json.length).toBeLessThan(40_000);
  });

  test("a life taken up after the line ends begins a house of its own", () => {
    const g = world({ start: 1700, seed: 13 });
    g.aiEnabled = false;
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    kill(g, me, "the ague");
    expect(life.watching).toBe(true);
    const stranger = person(g, me, {
      female: false,
      age: 30,
      first: "Josiah",
      family: "Penn",
    });
    expect(takeOver(g, life, stranger.id)).toBeNull();
    const rec = dynastyOf(g.s, life, map);
    expect(rec.line).toHaveLength(2);
    const charts = dynastyCharts(rec);
    expect(charts.map((c) => c.family)).toEqual(["Drackley", "Penn"]);
    expect(rec.people[byC(rec, stranger.id)].life?.came).toBe("takeover");
    expect(charts[1].focus).toBe(byC(rec, stranger.id));
  });

  test("old saves still give a tree: no LEGACY records, no weddings kept", () => {
    const f = threeGenerations();
    delete f.life.legacy;
    const rec = dynastyOf(f.g.s, f.life, map);
    expect(rec.line).toHaveLength(2);
    // The dead keep their husband's or wife's mark.
    expect(rec.people[byC(rec, f.alden.id)].spouses).toEqual([
      byC(rec, f.mary.id),
    ]);
    expect(rec.people[byC(rec, f.thomas.id)].spouses).toContain(
      byC(rec, f.ruth.id),
    );
    expect(rec.people[byC(rec, f.thomas.id)].spouses).toContain(
      byC(rec, f.jane.id),
    );
    expect(dynastyCharts(rec)[0].nodes).toHaveLength(rec.people.length);
    // And a saved game, loaded, gives the same tree.
    const copy = new ConquestGame(map, JSON.parse(JSON.stringify(f.g.s)));
    const back = copy.s.lives.find((l) => l.seat === f.life.seat)!;
    expect(dynastyOf(copy.s, back, map)).toEqual(rec);
  });

  test("the weddings ride the save and the delta", () => {
    const f = threeGenerations();
    expect(f.life.legacy?.wed).toEqual([
      [f.alden.id, f.mary.id],
      [f.thomas.id, f.jane.id],
      [f.thomas.id, f.ruth.id],
    ]);
    const copy = new ConquestGame(map, JSON.parse(JSON.stringify(f.g.s)));
    expect(copy.s.lives[0].legacy?.wed).toEqual(f.life.legacy?.wed);
    f.g.takeDelta();
    const client = JSON.parse(JSON.stringify(f.g.s));
    kill(f.g, f.ruth, "a cold");
    const sam = person(f.g, f.thomas, {
      female: true,
      age: 30,
      first: "Abigail",
      family: "Stone",
    });
    wed(f.g, f.life, f.thomas, sam);
    applyDelta(client, f.g.takeDelta());
    expect(client.lives[0].legacy.wed).toHaveLength(4);
  });

  test("a finished game's chronicle makes a smaller tree: the line, their marriages, their children", () => {
    const f = threeGenerations();
    const chars = lineCharacters(f.g.s, f.life, map);
    const ch = chronicleOf(f.g.s, f.life, map, { secrets: false });
    const thin = dynastyFromChronicle(chars, ch, { over: true, year: 1776 });
    expect(thin.thin).toBe(true);
    expect(thin.line).toHaveLength(2);
    const [a, t] = thin.line.map((i) => thin.people[i]);
    expect(a.first).toBe("Alden");
    expect(t.first).toBe("Thomas");
    // Thomas is Alden's heir child, once (not twice).
    expect(t.father).toBe(thin.line[0]);
    expect(thin.people.filter((p) => p.first === "Thomas")).toHaveLength(1);
    expect(a.spouses.map((i) => thin.people[i].first)).toEqual(["Mary"]);
    expect(thin.people.some((p) => p.first === "Ann")).toBe(true);
    expect(a.life?.story.length).toBeGreaterThan(0);
    const charts = dynastyCharts(thin);
    expect(charts).toHaveLength(1);
    expect(charts[0].nodes).toHaveLength(thin.people.length);
    expect(dynRelation(thin, thin.people.findIndex((p) => p.first === "Ann"))).toBe(
      "Child of Alden",
    );
  });
});
