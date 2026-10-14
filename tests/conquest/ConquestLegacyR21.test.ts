// LEGACY (r21): every character a line was is kept as their part ends, with
// their own numbers; the chronicle tells each of them in a chapter (who,
// where, why, what came of it; the people who mattered; the big numbers;
// the family's line; their roads); secrets stay out of what others read;
// old saves still tell every character; nothing in the world's luck moves;
// and it all rides the save and the delta.

import { render } from "lit";
import { describe, expect, test } from "vitest";
import { LifeStory } from "../../src/conquest/client/ui/Story";
import { dateOf } from "../../src/conquest/engine/Calendar";
import { kill, makeCharacter } from "../../src/conquest/engine/Characters";
import { chronicleOf, clauseOf } from "../../src/conquest/engine/Chronicle";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import { hooks } from "../../src/conquest/engine/Hooks";
import {
  causePhrase,
  LEGACY_HOOKS,
  lineCharacters,
} from "../../src/conquest/engine/Legacy";
import { endLine } from "../../src/conquest/engine/Life";
import { milestone } from "../../src/conquest/engine/LifeCore";
import { autoAnswerLife } from "../../src/conquest/engine/LifeEvents";
import { meOf } from "../../src/conquest/engine/LifeQueries";
import { DAYS_PER_YEAR } from "../../src/conquest/engine/Rules";
import type { Character, Life } from "../../src/conquest/engine/Types";
import { lifeOf, map, ticks, toNextMonth, world } from "./LifeUtil";

/** A grown child of the character played now, at home. */
function child(
  g: ConquestGame,
  life: Life,
  age: number,
  female = false,
): Character {
  const me = meOf(g.s, life)!;
  const c = makeCharacter(g.s, g.rng, {
    nation: me.nation,
    culture: g.s.nations[me.nation].culture,
    religion: me.religion,
    female,
    age,
    family: me.family,
    father: me.id,
  });
  c.home = life.home;
  me.children.push(c.id);
  return c;
}

const q = { quiet: true } as const;

/** Two generations: Alden, who marries, rises, fights and dies of a fever; then his son. */
function twoGenerations(seed = 5) {
  const g = world({ start: 1700, seed });
  g.aiEnabled = false;
  const life = lifeOf(g);
  const first = meOf(g.s, life)!;
  life.purse = 120;
  ticks(g, 40);
  milestone(g, life, "married", "Married Mary Cole", life.prov, q);
  milestone(g, life, "promoted", "Rose to journeyman", life.prov, q);
  g.s.day += 3 * DAYS_PER_YEAR;
  milestone(g, life, "promoted", "Rose to master", life.prov, q);
  milestone(
    g,
    life,
    "battle",
    "Won the battle of St. Augustine against Spain",
    life.prov,
    q,
  );
  milestone(g, life, "wounded", "Wounded at St. Augustine", life.prov, q);
  life.tally.children += 2;
  life.tally.battles += 1;
  life.tally.battlesWon += 1;
  life.tally.earned += 300;
  life.renown = 64;
  toNextMonth(g); // the month notes his best renown
  life.renown = 30;
  const son = child(g, life, 20);
  const daughter = child(g, life, 17, true);
  life.ties[daughter.id] = "friend";
  const purse = life.purse;
  kill(g, first, "a fever at 45");
  return { g, life, first, son, daughter, purse };
}

describe("every character a line was (LEGACY r21)", () => {
  test("a character's part is kept as it ends, with their own numbers; the heir's begins", () => {
    const { g, life, first, son, purse } = twoGenerations();
    expect(life.c).toBe(son.id);
    const L = life.legacy!;
    expect(L.recs).toHaveLength(1);
    const r = L.recs[0];
    expect(r).toMatchObject({
      c: first.id,
      came: "born",
      ended: "died",
      purse: Math.round(purse),
    });
    // His best renown (64, less a month's fading), not the 30 he died with.
    expect(r.renown).toBeGreaterThanOrEqual(60);
    expect(r.why).toMatch(/died, a fever at 45/);
    expect(r.t1.children - r.t0.children).toBe(2);
    expect(r.t1.battlesWon - r.t0.battlesWon).toBe(1);
    expect(r.t1.earned - r.t0.earned).toBeGreaterThanOrEqual(300);
    // The heir's part has begun, from where the line's counts stand.
    expect(L.came).toBe("heir");
    expect(L.since).toBe(g.s.day);
    expect(L.t0).toEqual(r.t1);

    const chars = lineCharacters(g.s, life, map);
    expect(chars.map((c) => c.c)).toEqual([first.id, son.id]);
    expect(chars[0]).toMatchObject({
      ended: "died",
      fate: "died of a fever at 45",
      children: 2,
      battles: 1,
      battlesWon: 1,
      renown: r.renown,
      home: "Jamestown",
      spouse: "Mary Cole", // from his wedding, when she isn't in the game
    });
    expect(chars[1]).toMatchObject({
      came: "heir",
      ended: "living",
      to: null,
      children: 0,
    });
    expect(chars[1].fate).toMatch(/^living/);
    expect(chars[0].skills.length).toBeGreaterThan(0);
    expect(chars[0].stats).toEqual(first.stats);
  });

  test("a line that ends with no heir is kept once; a second ending writes nothing more", () => {
    const g = world({ start: 1700, seed: 6 });
    const life = lifeOf(g);
    const me = meOf(g.s, life)!;
    kill(g, me, "the ague");
    expect(life.watching).toBe(true);
    expect(life.legacy!.recs).toHaveLength(1);
    expect(life.legacy!.recs[0]).toMatchObject({ ended: "died", c: me.id });
    endLine(g, life, "Nothing more");
    expect(life.legacy!.recs).toHaveLength(1);
    const chars = lineCharacters(g.s, life, map);
    expect(chars).toHaveLength(1);
    expect(chars[0].fate).toBe("died of the ague");
  });

  test("the chronicle tells each life in a chapter: who, where, what came of it; the people who mattered; the numbers; the family's line", () => {
    const { g, life, first, son, daughter } = twoGenerations();
    const ch = chronicleOf(g.s, life, map);
    expect(ch.title).toMatch(/^The Drackley line, 1700 to \d{4}$/);
    expect(ch.opening).toMatch(
      /^The Drackleys began with Alden Drackley, a .+ at Jamestown, in 1700\./,
    );
    expect(ch.chapters).toHaveLength(2);
    const [one, two] = ch.chapters;
    expect(one).toMatchObject({ n: 1, roman: "I", c: first.id });
    const text = one.paras.join(" ");
    expect(text).toMatch(
      /came into the story at Jamestown in 1700, a farmer of 22/,
    );
    expect(text).toMatch(/he married Mary Cole/);
    expect(text).toMatch(/He rose to journeyman \(1700\) and master \(1703\)/);
    expect(text).toMatch(
      /he won the battle of St\. Augustine against Spain and was wounded at St\. Augustine/,
    );
    expect(text).toMatch(
      /Alden Drackley died in 1703 at Jamestown, of a fever at 45\./,
    );
    expect(text).toMatch(/his son, carried the family on/);
    expect(two.paras[0]).toMatch(
      new RegExp(
        `^When Alden Drackley died in 1703, ${son.first}, 2\\d, became head of the family at Jamestown\\.`,
      ),
    );
    // The people who mattered: his children, the heir marked, a friend.
    expect(one.people).toEqual(
      expect.arrayContaining([
        { c: son.id, name: `${son.first} ${son.family}`, role: "son and heir" },
        expect.objectContaining({ c: daughter.id, role: "daughter" }),
      ]),
    );
    expect(two.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ c: first.id, role: "father" }),
      ]),
    );
    expect(one.numbers.map((n) => n.label)).toEqual(
      expect.arrayContaining([
        "Years in the story",
        "Age at the end",
        "Children",
        "Battles",
      ]),
    );
    expect(ch.numbers.find((n) => n.label === "Lives")?.value).toBe("2");
    // The family's line: the heir flagged among the children.
    expect(ch.tree).toHaveLength(2);
    expect(ch.tree[0].children.find((k) => k.c === son.id)?.heir).toBe(true);
    expect(ch.tree[0].children.find((k) => k.c === daughter.id)?.heir).toBe(
      false,
    );
    // Their roads, for the chapter's map.
    expect(one.places).toContain(life.home);
    expect(ch.closing).toMatch(
      /^The story goes on, in \d{4}\. Score so far \d+\.$/,
    );
  });

  test("a moment's words become a sentence: he or she, his or her, done or done to", () => {
    const he = { first: "Amos", family: "Fell", female: false } as Character;
    const she = { first: "Fay", family: "Penn", female: true } as Character;
    expect(clauseOf("Married Mary Cole", he)).toBe("he married Mary Cole");
    expect(clauseOf("Wounded at Quebec", she)).toBe(
      "she was wounded at Quebec",
    );
    expect(clauseOf("Taken up for theft at Boston", he)).toBe(
      "he was taken up for theft at Boston",
    );
    expect(clauseOf("Your daughter Jane Fell died, a fever at 9", he)).toBe(
      "his daughter Jane Fell died, a fever at 9",
    );
    expect(
      clauseOf("Widowed: your husband John Penn died, the flux", she),
    ).toBe("she was widowed: her husband John Penn died, the flux");
    expect(clauseOf("Jamestown, your home, was taken by France", she)).toBe(
      "Jamestown, her home, was taken by France",
    );
    expect(clauseOf("Amos Fell became famous", he)).toBe("he became famous");
    expect(clauseOf("A son, Walter, was born", he)).toBe(
      "a son, Walter, was born",
    );
    expect(
      clauseOf("The Tartar's cruise paid off: 2 prizes, 30 coins to you", he),
    ).toBe("the Tartar's cruise paid off: 2 prizes, 30 coins to him");
    expect(causePhrase("battle at Quebec")).toBe("in battle at Quebec");
    expect(causePhrase("a fever at 9")).toBe("of a fever at 9");
    expect(causePhrase("hanged at Boston for theft")).toBe(
      "hanged at Boston for theft",
    );
  });

  test("secrets stay in the line's own telling, out of what anyone else reads", () => {
    const { g, life } = twoGenerations();
    milestone(g, life, "plot", "Plotted the death of a rival", life.prov, {
      sec: true,
    });
    const own = chronicleOf(g.s, life, map);
    const others = chronicleOf(g.s, life, map, { secrets: false });
    const all = (c: typeof own) => c.chapters.flatMap((x) => x.paras).join(" ");
    expect(all(own)).toMatch(/plotted the death of a rival/);
    expect(all(others)).not.toMatch(/plotted/i);
    // A lover is nobody else's business: never among the people who mattered.
    const me = meOf(g.s, life)!;
    const lover = child(g, life, 18, true);
    life.ties[lover.id] = "lover";
    kill(g, me, "a fall");
    const rec = life.legacy!.recs.find((r) => r.c === me.id)!;
    expect(rec.ties.some((t) => t.c === lover.id)).toBe(false);
  });

  test("an old save with no records still tells every character", () => {
    const { g, life, first, son } = twoGenerations();
    delete life.legacy;
    const chars = lineCharacters(g.s, life, map);
    expect(chars.map((c) => c.c)).toEqual([first.id, son.id]);
    expect(chars[0]).toMatchObject({ ended: "died", came: "born" });
    expect(chars[0].title).toBe("Master"); // from "Rose to master"
    expect(chars[0].battles).toBe(1); // from the moments
    const ch = chronicleOf(g.s, life, map);
    expect(ch.chapters).toHaveLength(2);
    expect(ch.chapters[0].paras.join(" ")).toMatch(/died in 1703/);
  });

  test("the save and the delta carry it; a loaded game tells the same", () => {
    const { g, life } = twoGenerations();
    const copy = new ConquestGame(map, JSON.parse(JSON.stringify(g.s)));
    const back = copy.s.lives.find((l) => l.seat === life.seat)!;
    expect(back.legacy).toEqual(life.legacy);
    expect(lineCharacters(copy.s, back, map)).toEqual(
      lineCharacters(g.s, life, map),
    );
    g.takeDelta();
    const client = JSON.parse(JSON.stringify(g.s));
    milestone(
      g,
      life,
      "died",
      `${meOf(g.s, life)!.first} died, a cold`,
      life.prov,
      q,
    );
    applyDelta(client, g.takeDelta());
    expect(
      client.lives.find((l: Life) => l.seat === life.seat).legacy.recs,
    ).toHaveLength(2);
  });

  test("the world's luck doesn't move: the same two years with and without the records", () => {
    const run = (withLegacy: boolean) => {
      const saved = {
        m: [...hooks.milestone],
        mo: [...hooks.lifeMonthly],
      };
      if (!withLegacy) {
        hooks.milestone.splice(
          hooks.milestone.indexOf(LEGACY_HOOKS.milestone),
          1,
        );
        hooks.lifeMonthly.splice(
          hooks.lifeMonthly.indexOf(LEGACY_HOOKS.month),
          1,
        );
      }
      try {
        const g = world({ start: 1700, seed: 13 });
        const life = lifeOf(g);
        for (let d = 0; d < 2 * DAYS_PER_YEAR; d++) {
          g.tick();
          for (const e of [...life.events]) autoAnswerLife(g, life.seat, e.id);
        }
        return {
          nextId: g.s.nextId,
          purse: life.purse,
          renown: life.renown,
          health: life.health,
          day: g.s.day,
          moments: life.milestones.length,
          rng: g.s.rng,
          legacy: !!life.legacy,
        };
      } finally {
        hooks.milestone.splice(0, hooks.milestone.length, ...saved.m);
        hooks.lifeMonthly.splice(0, hooks.lifeMonthly.length, ...saved.mo);
      }
    };
    const a = run(true);
    const b = run(false);
    expect(a.legacy).toBe(true);
    expect(b.legacy).toBe(false);
    expect({ ...a, legacy: 0 }).toEqual({ ...b, legacy: 0 });
  }, 120_000);

  test("Journal › The story tells it in chapters, and year by year on asking", () => {
    const { g, life } = twoGenerations();
    const el = new LifeStory();
    el.ui = {
      s: g.s,
      life,
      map,
      open: () => undefined,
      modal: () => undefined,
      redraw: () => undefined,
    } as never;
    el.life = life;
    const div = document.createElement("div");
    render(el.render(), div);
    expect(div.querySelectorAll(".cq-chron-ch")).toHaveLength(2);
    expect(div.querySelector(".cq-chron-open")?.textContent).toMatch(
      /began with Alden Drackley/,
    );
    expect(div.querySelectorAll(".cq-chron-tree > li")).toHaveLength(2);
    expect(div.querySelectorAll(".cq-chron-person").length).toBeGreaterThan(1);
    // Year by year (STORY r17), on asking.
    (
      div.querySelectorAll(".cq-story-view button")[1] as HTMLButtonElement
    ).click();
    render(el.render(), div);
    expect(div.querySelector(".cq-saga")).not.toBeNull();
    expect(dateOf(g.s.day).year).toBeGreaterThan(1700);
  });
});
