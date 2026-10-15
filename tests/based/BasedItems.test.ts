// Mr. Based's inventory (r22 BPLAY): what he carries, wears and holds, his
// money, how clothes change his skills and show in a check, items a choice
// or a scene needs (and the validator making sure they can be got first),
// using things, saves with an inventory (and old saves getting his kit),
// what the story so far keeps, and how it holds up with many items.

import { describe, expect, test } from "vitest";
import { evalExpr, parseExpr } from "../../src/based/engine/Expr";
import { PlaceDef } from "../../src/based/engine/Place";
import {
  chapterStart,
  SAVED_PATH,
  Snapshot,
  startingKit,
  StoryEvent,
  StoryRun,
} from "../../src/based/engine/Runtime";
import { slotOf } from "../../src/based/engine/Save";
import { parseChapter } from "../../src/based/engine/Script";
import { Chapter } from "../../src/based/engine/Types";
import { errorsOf, validateChapter } from "../../src/based/engine/Validate";
import { playRandomly } from "./play";

function room(key: string, other: string): PlaceDef {
  return {
    key,
    name: key,
    camera: { azimuth: 45, elevation: 36 },
    nav: { bounds: [0, 0, 10, 10], cell: 0.5, blocks: [] },
    areas: [
      { id: key, rect: [0, 0, 10, 10], span: 10, inside: key !== "street" },
    ],
    marks: { in: { at: [8, 8] }, stool: { at: [2, 8], seat: 0.8 } },
    hotspots: {
      door: { at: [8, 1, 9.5], to: { place: other, mark: "in" } },
      thing: { at: [3, 0.5, 7] },
      far_thing: { at: [1, 0.5, 1] },
    },
    shots: {},
    items: [],
    lights: [],
    env: { background: "#000", fog: "#000", fogDensity: 0.01 },
  };
}
const PLACES = { street: room("street", "bar"), bar: room("bar", "street") };

const HEAD = `@chapter 1 "Items"
@money 50
@cast HERO "Hero"
@cast GUARD "The guard" look=police
@attribute MIND "Mind" "Thinking."
@attribute BODY "Body" "Doing."
@skill CHARM MIND "Charm" "Being liked."
@skill MENACE MIND "Menace" "Being feared."
@skill EYES BODY "Eyes" "Seeing."
@archetype A "A" MIND=3 BODY=3 signature=EYES "Even."
@points 6 min=1 max=5
@item coat "Coat" kind=clothes slot=jacket bonus=CHARM+1 look=field_jacket icon=jacket start=worn "A coat."
@item hat "Hat" kind=clothes slot=hat bonus=CHARM+1,EYES-1 icon=cap "A hat."
@item knife "Knife" kind=weapon slot=hand bonus=MENACE+2 "A knife."
@item key "Key" kind=key "A key."
@item phone "Phone" kind=small start=1 "A phone."
@item coin "Coin" kind=small start=2 "Coins."
`;

const SCRIPT = `${HEAD}
== start "Start"
@place street
@actor HERO in
@actor GUARD stool
-> FREE

== shop "A shop"
@on look thing in=street
choose "Buy something?"
  * if money >= 20 and not has.hat [Buy a hat]
    pay 20
    give hat
  * [Leave]
end
-> FREE

== find "Under a stone"
@on look far_thing once
give knife
give key
-> FREE

== guard_armed "The guard"
@on talk GUARD if armed
GUARD: Put it away.
-> FREE

== guard "The guard"
@on talk GUARD
choose "The guard looks at him."
  * needs=key [Unlock the gate] -> END
  * white CHARM challenging [Charm him]
    bonus +2 if wears.hat "The hat"
    GUARD: Fine.
  fail
    GUARD: No.
  * [Leave]
end
-> FREE

== use_phone "The phone"
@on use phone
He calls.
earn 5
-> FREE
`;

function load(src = SCRIPT): Chapter {
  const { chapter, errors } = parseChapter(src);
  expect(errors).toEqual([]);
  return chapter;
}

function settle(r: StoryRun): void {
  for (let i = 0; i < 100; i++) {
    const b = r.beat;
    if (b.kind === "line" || b.kind === "card" || b.kind === "roll")
      r.advance();
    else return;
  }
}

function parseErrors(src: string): string[] {
  return parseChapter(src).errors.map((e) => e.message);
}

function problems(src: string): string[] {
  const { chapter, errors } = parseChapter(src);
  expect(errors).toEqual([]);
  return errorsOf(validateChapter(chapter, { places: PLACES })).map(
    (p) => p.message,
  );
}

describe("the script format for items", () => {
  test("@item and @money in the header", () => {
    const c = load();
    expect(c.money).toBe(50);
    expect(Object.keys(c.items)).toEqual([
      "coat",
      "hat",
      "knife",
      "key",
      "phone",
      "coin",
    ]);
    expect(c.items.coat).toMatchObject({
      name: "Coat",
      kind: "clothes",
      slot: "jacket",
      bonus: [{ skill: "CHARM", delta: 1 }],
      look: "field_jacket",
      icon: "jacket",
      start: "worn",
      about: "A coat.",
    });
    expect(c.items.hat.bonus).toEqual([
      { skill: "CHARM", delta: 1 },
      { skill: "EYES", delta: -1 },
    ]);
    expect(c.items.knife).toMatchObject({ kind: "weapon", slot: "hand" });
    expect(c.items.coin.start).toBe(2);
  });

  test("give, take, equip, unequip, pay, earn and needs= in scenes", () => {
    const c = load(`${HEAD}
== a
give key 2
take coin
equip hat
unequip hat
pay 10
earn 3
choose "x"
  * needs=key|knife if money > 1 [Open] -> END
  * [No] -> END
end
`);
    const ops = c.scenes.a.ops.map((o) => o.op);
    expect(ops.slice(0, 6)).toEqual([
      "item",
      "item",
      "equip",
      "unequip",
      "money",
      "money",
    ]);
    expect(c.scenes.a.ops[0]).toMatchObject({ key: "key", delta: 2 });
    expect(c.scenes.a.ops[1]).toMatchObject({ key: "coin", delta: -1 });
    expect(c.scenes.a.ops[4]).toMatchObject({ delta: -10 });
    expect(c.scenes.a.ops[5]).toMatchObject({ delta: 3 });
    const choose = c.scenes.a.ops.find((o) => o.op === "choose")!;
    expect(choose.op === "choose" && choose.options[0].needs).toEqual([
      "key",
      "knife",
    ]);
    expect(choose.op === "choose" && choose.options[0].cond).toBeDefined();
  });

  test("@on use", () => {
    const c = load();
    expect(c.scenes.use_phone.trigger).toMatchObject({
      on: "use",
      target: "phone",
    });
  });

  test("mistakes are reported", () => {
    const bad = (line: string) =>
      parseErrors(`@chapter 1 "T"\n@cast H "H"\n${line}\n== a\n-> END\n`);
    expect(bad(`@item x "X" kind=gadget "?"`)[0]).toContain("kind=");
    expect(bad(`@item x "X" kind=clothes "?"`)[0]).toContain("need a slot");
    expect(bad(`@item x "X" kind=clothes slot=hand "?"`)[0]).toContain(
      "not in his hand",
    );
    expect(bad(`@item x "X" kind=tool slot=hat "?"`)[0]).toContain("held");
    expect(bad(`@item x "X" kind=small bonus=CHARM+1 "?"`)[0]).toContain(
      "worn or held",
    );
    expect(bad(`@item x "X" kind=small start=worn "?"`)[0]).toContain(
      "needs a slot",
    );
    expect(bad(`@item x "X" kind=small colour=red "?"`)[0]).toContain(
      "isn't understood",
    );
    expect(bad(`@item x "X" kind=tool slot=hand look=suit "?"`)[0]).toContain(
      "only clothes",
    );
    expect(bad(`@money lots`)[0]).toContain("@money");
    const inScene = (line: string) =>
      parseErrors(`@chapter 1 "T"\n@cast H "H"\n== a\n${line}\n-> END\n`);
    expect(inScene("set money")[0]).toContain("conditions read");
    expect(inScene("unequip pocket")[0]).toContain("unequip");
    expect(inScene("pay some")[0]).toContain("pay N");
    expect(inScene("give Big")[0]).toContain("give item");
  });
});

describe("conditions on what he carries, the hour and the weather", () => {
  test("has., wears., money, armed, time and weather.", () => {
    const v = {
      flags: {},
      rels: {},
      inv: { key: 1 },
      worn: { hat: "hat", hand: "knife" },
      money: 30,
      armed: true,
      time: 23 * 60 + 15,
      weather: "clear",
    };
    const t = (src: string) => evalExpr(parseExpr(src), v);
    expect(t("has.key")).toBe(1);
    expect(t("has.hat")).toBe(1);
    expect(t("has.coin")).toBe(0);
    expect(t("wears.hat")).toBe(1);
    expect(t("wears.key")).toBe(0);
    expect(t("money >= 30 and money < 31")).toBe(1);
    expect(t("armed")).toBe(1);
    expect(t("time >= 23:00 and time < 23:30")).toBe(1);
    expect(t("time >= 23:30 or time < 06:00")).toBe(0);
    expect(t("weather.clear and not weather.rain")).toBe(1);
    expect(() => parseExpr("weather.snow")).toThrow();
    expect(() => parseExpr("time > 25:00")).toThrow();
    expect(() => parseExpr("has.Big")).toThrow();
  });
});

describe("the validator, items", () => {
  test("the test chapter is clean", () => {
    expect(problems(SCRIPT)).toEqual([]);
  });

  test("every item named must be an @item", () => {
    const p = problems(`${HEAD}
== a
give ghost
if has.spook or wears.boo
  Hm.
end
choose "x"
  * needs=wraith [x] -> END
  * [y] -> END
end

== b
@on use phantom
-> END
`);
    for (const k of ["ghost", "spook", "boo", "wraith", "phantom"]) {
      expect(p).toContainEqual(`item "${k}" isn't an @item`);
    }
  });

  test("only what's worn or held can be equipped; bonuses name skills", () => {
    const p = problems(`${HEAD}
@item cap "Cap" kind=clothes slot=hat bonus=NOPE+1 "?"
@item hood "Hood" kind=clothes slot=hat start=worn "?"
@item beret "Beret" kind=clothes slot=hat start=worn "?"
== a
equip key
-> END
`);
    expect(p).toContainEqual(
      "equip key: it isn't worn or held (give it a slot=)",
    );
    expect(p).toContainEqual("@item cap: bonus NOPE isn't a @skill");
    expect(p.some((m) => m.includes("already worn at the start"))).toBe(true);
  });

  test("a needed item must be got before the scene that needs it", () => {
    // The key is only given after the gate: never in time.
    const late = problems(`${HEAD}
== a
@place street
-> FREE
== gate "Gate"
@on look thing
choose "A gate."
  * needs=key [Open it] -> beyond
  * [Leave] -> FREE
end
== beyond
give key
-> END
`);
    expect(late).toContainEqual(
      `"gate" needs "key", but nothing gives it before`,
    );
    // Given somewhere he can go first: fine.
    expect(
      problems(`${HEAD}
== a
@place street
-> FREE
== find
@on look far_thing
give key
-> FREE
== gate "Gate"
@on look thing
choose "A gate."
  * needs=key [Open it] -> END
  * [Leave] -> FREE
end
`),
    ).toEqual([]);
    // Given earlier in the same scene: fine.
    expect(
      problems(`${HEAD}
== a
give key
choose "A gate."
  * needs=key [Open it] -> END
  * [Leave] -> END
end
`),
    ).toEqual([]);
    // A condition asking for either of two: one that can be got will do;
    // and what he starts with counts.
    expect(
      problems(`${HEAD}
== a
@place street
-> FREE
== b
@on use phone if has.key or has.coin
-> END
`),
    ).toEqual([]);
    // An option that needs an item can't be the one always there.
    expect(
      problems(`${HEAD}
== a
choose "x"
  * needs=phone [Call] -> END
end
`).some((m) => m.includes("could run out of options")),
    ).toBe(true);
  });
});

describe("what he carries, in play", () => {
  test("he starts with his kit: worn, in his pockets, and money", () => {
    const c = load();
    expect(startingKit(c)).toEqual({
      inv: { phone: 1, coin: 2 },
      worn: { jacket: "coat" },
      money: 50,
    });
    const r = new StoryRun(c);
    expect(r.gear).toEqual({ jacket: "coat" });
    expect(r.items).toEqual({ phone: 1, coin: 2 });
    expect(r.euros).toBe(50);
    // The coat's +1.
    expect(r.skills().CHARM).toBe(r.baseSkills().CHARM + 1);
  });

  test("buying, finding, wearing: skills change and checks list why", () => {
    const c = load();
    const r = new StoryRun(c);
    r.look("thing");
    expect(r.beat.kind).toBe("choice");
    r.choose("buy-a-hat");
    const ev = r.drain();
    expect(ev).toContainEqual({ type: "money", delta: -20 });
    expect(ev).toContainEqual({ type: "item", key: "hat", delta: 1 });
    expect(r.euros).toBe(30);
    expect(r.items.hat).toBe(1);
    settle(r);
    const before = r.skills();
    expect(r.equip("hat")).toBe(true);
    expect(r.drain()).toContainEqual({
      type: "gear",
      slot: "hat",
      key: "hat",
      was: null,
    });
    expect(r.gear.hat).toBe("hat");
    expect(r.items.hat).toBeUndefined();
    expect(r.skills().CHARM).toBe(before.CHARM + 1);
    expect(r.skills().EYES).toBe(before.EYES - 1);
    // The guard's check: the coat, the hat, and the bonus for wearing it.
    r.talk("GUARD");
    const b = r.beat;
    expect(b.kind).toBe("choice");
    if (b.kind !== "choice") return;
    const charm = b.options.find((o) => o.id === "charm-him")!.check!;
    expect(charm.base).toBe(r.baseSkills().CHARM);
    // In the order of the slots, head to foot.
    expect(charm.mods).toEqual([
      { delta: 1, why: "Hat", item: "hat" },
      { delta: 1, why: "Coat", item: "coat" },
      { delta: 2, why: "The hat" },
    ]);
    expect(charm.bonus).toBe(charm.base + 4);
  });

  test("an option that needs an item is shown, but shut, until he has it", () => {
    const c = load();
    const r = new StoryRun(c);
    r.talk("GUARD");
    let b = r.beat;
    if (b.kind !== "choice") throw new Error("no choice");
    expect(b.options[0]).toMatchObject({
      id: "unlock-the-gate",
      needs: { items: ["key"], met: false },
    });
    expect(() => r.choose("unlock-the-gate")).toThrow(/needs key/);
    // The clock never picks it.
    r.timeout();
    settle(r);
    r.look("far_thing");
    settle(r);
    expect(r.has("key")).toBe(true);
    r.talk("GUARD");
    b = r.beat;
    if (b.kind !== "choice") throw new Error("no choice");
    expect(b.options[0].needs).toEqual({ items: ["key"], met: true });
    r.choose("unlock-the-gate");
    expect(r.beat.kind).toBe("end");
  });

  test("a weapon in his hand: armed, and people read him differently", () => {
    const c = load();
    const r = new StoryRun(c);
    r.look("far_thing");
    settle(r);
    expect(r.equip("knife")).toBe(true);
    expect(r.armed).toBe(true);
    expect(r.skills().MENACE).toBe(r.baseSkills().MENACE + 2);
    r.talk("GUARD");
    expect(r.sceneId).toBe("guard_armed");
    settle(r);
    expect(r.unequip("hand")).toBe(true);
    expect(r.armed).toBe(false);
    expect(r.items.knife).toBe(1);
    r.talk("GUARD");
    expect(r.sceneId).toBe("guard");
  });

  test("using something starts its scene", () => {
    const c = load();
    const r = new StoryRun(c);
    expect(r.available([]).use).toEqual(["phone"]);
    r.use("phone");
    settle(r);
    expect(r.euros).toBe(55);
    expect(r.use("knife")).toBeNull(); // he hasn't got it
  });

  test("take empties his pockets first, then what he wears; pay stops at 0", () => {
    const c = load(`${HEAD}
== a
take coin 3
take coat
equip hat
equip knife
unequip hand
pay 500
earn 7
-> END
`);
    const r = new StoryRun(c);
    const ev: StoryEvent[] = r.drain();
    expect(r.items.coin).toBeUndefined();
    expect(ev).toContainEqual({ type: "item", key: "coin", delta: -2 });
    expect(ev).toContainEqual({
      type: "gear",
      slot: "jacket",
      key: null,
      was: "coat",
    });
    expect(r.gear.jacket).toBeUndefined();
    // equip gives what he hasn't got.
    expect(r.gear.hat).toBe("hat");
    expect(r.items.knife).toBe(1);
    expect(r.gear.hand).toBeUndefined();
    expect(r.euros).toBe(7);
  });

  test("a failed check in pencil opens again when his clothes help", () => {
    const c = load();
    const start = chapterStart(c, undefined, { seed: 3 });
    start.inv!.hat = 1;
    start.checks = {
      "guard#1/charm-him": { tries: 1, result: "fail", bonus: 4 },
    };
    const r = new StoryRun(c, start);
    r.talk("GUARD");
    let b = r.beat;
    if (b.kind !== "choice") throw new Error("no choice");
    // Charm 3 + the coat = 4: no better than last time.
    expect(b.options.find((o) => o.id === "charm-him")!.check!.locked).toBe(
      true,
    );
    // Put the hat on, there and then: the check is worked out again.
    r.equip("hat");
    b = r.beat;
    if (b.kind !== "choice") throw new Error("no choice");
    const charm = b.options.find((o) => o.id === "charm-him")!.check!;
    expect(charm.locked).toBe(false);
    // Charm 3, the coat, the hat, and "+2 if wears.hat".
    expect(charm.bonus).toBe(7);
  });

  test("clothes changed mid-scene stay changed in a save", () => {
    const c = load();
    const start = chapterStart(c);
    start.inv!.hat = 1;
    const r = new StoryRun(c, start);
    r.talk("GUARD");
    expect(r.free).toBe(false);
    r.equip("hat");
    const snap = JSON.parse(JSON.stringify(r.snapshot())) as Snapshot;
    expect(snap.scene).toBe("guard");
    expect(snap.worn).toEqual({ jacket: "coat", hat: "hat" });
    const again = new StoryRun(c, snap);
    expect(again.gear.hat).toBe("hat");
    expect(again.items.hat).toBeUndefined();
  });
});

describe("saves with an inventory", () => {
  test("a slot round-trips what he carries", () => {
    const c = load();
    const r = new StoryRun(c);
    r.look("thing");
    r.choose("buy-a-hat");
    settle(r);
    r.equip("hat");
    r.look("far_thing");
    settle(r);
    r.equip("knife");
    const slot = JSON.parse(
      JSON.stringify(
        slotOf(r, { placeName: "street", played: 10, savedAt: "now" }),
      ),
    );
    const back = new StoryRun(c, slot.snap as Snapshot);
    expect(back.gear).toEqual({ jacket: "coat", hat: "hat", hand: "knife" });
    expect(back.items).toEqual({ phone: 1, coin: 2, key: 1 });
    expect(back.euros).toBe(30);
    expect(back.armed).toBe(true);
  });

  test("a save from before he carried anything loads with his kit", () => {
    const c = load();
    // Round 21 and BWORLD saves: no worn; BWORLD's had an empty inv.
    for (const inv of [undefined, {}]) {
      const old = chapterStart(c) as Snapshot;
      delete old.worn;
      delete old.money;
      if (inv) old.inv = inv;
      else delete old.inv;
      const r = new StoryRun(c, old);
      expect(r.gear).toEqual({ jacket: "coat" });
      expect(r.items).toEqual({ phone: 1, coin: 2 });
      expect(r.euros).toBe(50);
    }
  });

  test("the next chapter starts with what he carried", () => {
    const c = load();
    const r = new StoryRun(c);
    r.look("far_thing");
    settle(r);
    const next = chapterStart(c, { flags: {}, rels: {}, kit: r.kit });
    expect(next.inv).toEqual({ phone: 1, coin: 2, knife: 1, key: 1 });
    expect(next.worn).toEqual({ jacket: "coat" });
  });
});

describe("what the story so far keeps", () => {
  test("places, people, memories, who remembers, and when checks were thrown", () => {
    const c = load(`${HEAD}
== a "A"
@place street
@actor HERO in
@vignette london
GUARD: Hello.
remember GUARD
choose "x"
  * white CHARM easy [Try]
    -> b
  fail
    -> b
  * [Skip] -> b
end
== b "B"
@place bar
@vignette london
-> END
`);
    const r = new StoryRun(c);
    settle(r);
    r.choose("try");
    settle(r);
    const rec = r.record;
    expect(Object.keys(rec.visited)).toEqual(["street", "bar"]);
    expect(Object.keys(rec.met)).toEqual(["GUARD"]);
    expect(rec.memories).toEqual(["london"]);
    expect(rec.remembers).toEqual(["GUARD"]);
    expect(rec.checks["a#1/try"].at).toBeGreaterThan(0);
    // All of it in a save.
    const snap = r.snapshot();
    expect(snap.visited).toBeDefined();
    expect(snap.met).toEqual(rec.met);
  });
});

describe("the hour and the weather in the story", () => {
  test("time and weather. read the clock, and what the world says", () => {
    const c = load(`${HEAD}
@time 22:50
== a
@place street
@weather rain
-> FREE
== puddle "A puddle"
@on look thing
if time >= 23:00
  Late.
else
  Early.
end
if weather.clear
  Clear.
elif weather.rain
  Raining.
end
-> FREE
`);
    const read = (r: StoryRun) => {
      const out: string[] = [];
      while (r.beat.kind === "line") {
        out.push(r.beat.text);
        r.advance();
      }
      return out;
    };
    const r = new StoryRun(c);
    r.look("thing");
    // The story's own weather, without a world.
    expect(read(r)).toEqual(["Early.", "Raining."]);
    // The world says it has cleared; and the clock has gone past eleven.
    r.setWeather("clear");
    for (let i = 0; i < 30; i++) {
      r.look("thing");
      read(r);
    }
    r.look("thing");
    expect(read(r)).toEqual(["Late.", "Clear."]);
  });
});

describe("many items in a long game", () => {
  test("hundreds of items and needs stay quick, and a save stays small", () => {
    const lines = [
      `@chapter 1 "Long"`,
      `@cast HERO "Hero"`,
      `@attribute MIND "Mind" "."`,
      `@skill CHARM MIND "Charm" "."`,
    ];
    const N = 400;
    for (let i = 0; i < N; i++) {
      lines.push(
        i % 4 === 0
          ? `@item it${i} "Thing ${i}" kind=clothes slot=${["hat", "neck", "gloves", "shoes"][i % 16 === 0 ? 0 : (i / 4) % 4]} bonus=CHARM+1 "A thing."`
          : `@item it${i} "Thing ${i}" kind=small "A thing."`,
      );
    }
    lines.push(`== start`, `@place street`, `-> FREE`);
    for (let i = 0; i < N; i++) {
      lines.push(
        `== get${i}`,
        `@on look thing once`,
        `give it${i}`,
        i % 4 === 0 ? `equip it${i}` : `earn 1`,
        `-> FREE`,
        `== need${i}`,
        `@on look far_thing if has.it${i} and not used${i}`,
        `choose "Use it?"`,
        `  * needs=it${i} [Use it]`,
        `    set used${i}`,
        `  * [Not now]`,
        `end`,
        i === N - 1 ? `if used${i}` : `if used${i} > 99`,
        `  -> END`,
        `end`,
        `-> FREE`,
      );
    }
    const src = lines.join("\n");
    const t0 = performance.now();
    const { chapter, errors } = parseChapter(src);
    expect(errors).toEqual([]);
    const probs = errorsOf(validateChapter(chapter, { places: PLACES }));
    expect(probs.map((p) => p.message)).toEqual([]);
    // Generous for a shared machine.
    expect(performance.now() - t0).toBeLessThan(10_000);
    const t1 = performance.now();
    const p = playRandomly(chapter, PLACES, { seed: 5, max: 20_000 });
    expect(p.steps).toBeGreaterThan(500);
    expect(performance.now() - t1).toBeLessThan(15_000);
    const snap = p.run.snapshot();
    expect(snap.path.length).toBeLessThanOrEqual(SAVED_PATH);
    expect(Object.keys(snap.inv ?? {}).length).toBeGreaterThan(50);
    expect(JSON.stringify(snap).length).toBeLessThan(60_000);
  }, 60_000);
});
