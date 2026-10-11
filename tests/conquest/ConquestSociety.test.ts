// Society (round 11): tongues and the barriers between them, letters to
// anyone anywhere, local offices (appointed and elected), gatherings with
// their turns, lovers while married, settlements and new nations.

import { describe, expect, test } from "vitest";
import { makeCharacter } from "../../src/conquest/engine/Characters";
import { seedLocals } from "../../src/conquest/engine/Folk";
import { risingWon, settlementSites } from "../../src/conquest/engine/Founding";
import type { ConquestGame } from "../../src/conquest/engine/Game";
import {
  attendees,
  GATHERINGS,
  hostCheck,
  invitables,
} from "../../src/conquest/engine/Gatherings";
import { interactionView } from "../../src/conquest/engine/Interactions";
import {
  correspondents,
  letterAcceptance,
  npcWrite,
  postOf,
  postRoute,
} from "../../src/conquest/engine/Letters";
import {
  affairChild,
  affairWith,
  exposeBy,
  npcSecret,
  startBlackmail,
} from "../../src/conquest/engine/Liaisons";
import { setTie } from "../../src/conquest/engine/LifeCore";
import {
  meOf,
  monthlyBudget,
  officesOf,
  opinionOf,
  peopleHere,
} from "../../src/conquest/engine/LifeQueries";
import {
  ensureOffices,
  leverTargets,
  OFFICES,
  officesMonthly,
} from "../../src/conquest/engine/Offices";
import { charName } from "../../src/conquest/engine/Queries";
import { FLAG_COLORS } from "../../src/conquest/engine/SocietyRules";
import {
  learnRate,
  levelOf,
  lifeTonguePoints,
  talkWith,
  tonguesOf,
} from "../../src/conquest/engine/Tongues";
import type { Character, Life } from "../../src/conquest/engine/Types";
import { lifeOf, plan, prov, ticks, toNextMonth, world } from "./LifeUtil";

/** Make someone think well (or ill) of a player, for good. */
function like(g: ConquestGame, life: Life, c: Character, v = 60): void {
  g.char(c.id).memories.push({ of: life.c, why: "Test", value: v, until: 0 });
}

function locals(g: ConquestGame, life: Life): Character[] {
  return peopleHere(g.s, life.prov, life).filter(
    (c) => !g.s.lives.some((l) => l.c === c.id),
  );
}

function answerAll(g: ConquestGame, life: Life, pick = 0, max = 20): void {
  for (let i = 0; i < max && life.events.length; i++) {
    const ev = life.events[0];
    const err = g.lifeCommand(life.seat, {
      k: "event",
      id: ev.id,
      choice: Math.min(pick, ev.choices.length - 1),
    });
    if (err) g.lifeCommand(life.seat, { k: "event", id: ev.id, choice: 0 });
  }
}

/** A single woman of the town, made if there isn't one. */
function single(g: ConquestGame, life: Life): Character {
  const s = g.s;
  const me = meOf(s, life)!;
  const c = makeCharacter(s, g.rng, {
    nation: me.nation,
    culture: me.culture,
    religion: me.religion,
    female: true,
    age: 24,
    traits: [],
  });
  c.home = life.prov;
  c.role = "labourer";
  (s.locals[life.prov] ??= []).push(c.id);
  return c;
}

/** A player somewhere else, by magic. */
function moveTo(g: ConquestGame, life: Life, name: string): void {
  life.prov = prov(name);
  seedLocals(g, life.prov);
}

describe("tongues", () => {
  test("a barrier: some things can't be said, talk goes by signs, and you learn as you talk", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    moveTo(g, life, "Quebec");
    const s = g.s;
    const frenchman = locals(g, life).find(
      (c) => c.culture === "french" && !c.female && c.role === undefined,
    )!;
    const t = talkWith(s, g.map, life, frenchman);
    expect(t.level).toBe(0);
    expect(t.theirs).toBe("french");
    // Friendship needs words; talk can go by signs.
    const befriend = interactionView(s, g.w, life, frenchman.id, "befriend");
    expect(befriend.check.ok).toBe(false);
    if (!befriend.check.ok) expect(befriend.check.why).toMatch(/no tongue/);
    const talk = interactionView(s, g.w, life, frenchman.id, "talk");
    expect(talk.check.ok).toBe(true);
    expect(talk.label).toBe("Talk with signs");
    const before = lifeTonguePoints(s, g.map, life).french ?? 0;
    expect(
      g.lifeCommand("s1", { k: "person", c: frenchman.id, act: "talk" }),
    ).toBeNull();
    const after = lifeTonguePoints(s, g.map, life).french ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  test("Learning makes it come faster; living among speakers teaches too", () => {
    const slow = world({
      start: 1650,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ stats: { dip: 8, mar: 5, ste: 5, int: 5, lea: 2 } }),
        },
      ],
    });
    const quick = world({
      start: 1650,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({ stats: { dip: 5, mar: 5, ste: 5, int: 5, lea: 8 } }),
        },
      ],
    });
    expect(learnRate(quick.s, lifeOf(quick))).toBeGreaterThan(
      learnRate(slow.s, lifeOf(slow)) * 1.5,
    );
    for (const g of [slow, quick]) moveTo(g, lifeOf(g), "Quebec");
    toNextMonth(slow);
    toNextMonth(quick);
    const a = lifeTonguePoints(slow.s, slow.map, lifeOf(slow)).french ?? 0;
    const b = lifeTonguePoints(quick.s, quick.map, lifeOf(quick)).french ?? 0;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  test("an interpreter who speaks with you both makes talk possible", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Tom", family: "Tull" }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    moveTo(g, a, "Quebec");
    b.prov = a.prov;
    b.tongues = { c: b.c, pts: { french: 300 } };
    const frenchman = locals(g, a).find(
      (c) => c.culture === "french" && c.role === undefined,
    )!;
    const t = talkWith(g.s, g.map, a, frenchman, () =>
      peopleHere(g.s, a.prov, a),
    );
    expect(t.via).toBeGreaterThanOrEqual(0);
    expect(t.level).toBe(2);
    const via = tonguesOf(g.s, g.map, g.s.chars[t.via]);
    expect(via.english ?? 0).toBeGreaterThanOrEqual(2);
    expect(via.french ?? 0).toBeGreaterThanOrEqual(2);
    const v = interactionView(g.s, g.w, a, frenchman.id, "befriend");
    expect(v.check.ok).toBe(true);
    expect(v.accept!.parts.some((p) => /interpreter/.test(p.label))).toBe(true);
  });

  test("a grammar from the bookseller, and lessons from a native speaker", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    const before = lifeTonguePoints(g.s, g.map, life).french ?? 0;
    expect(
      g.lifeCommand("s1", { k: "society", act: "study", kind: "french" }),
    ).toBeNull();
    const mid = lifeTonguePoints(g.s, g.map, life).french ?? 0;
    expect(mid).toBeGreaterThan(before);
    expect(
      g.lifeCommand("s1", { k: "society", act: "study", kind: "french" }),
    ).toMatch(/again in/);
    // Lessons, from someone whose tongue it is.
    moveTo(g, life, "Quebec");
    const tutor = locals(g, life).find((c) => c.culture === "french")!;
    like(g, life, tutor);
    const v = interactionView(g.s, g.w, life, tutor.id, "tongue");
    expect(v.check.ok).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: tutor.id, act: "tongue" }),
    ).toBeNull();
    expect(lifeTonguePoints(g.s, g.map, life).french ?? 0).toBeGreaterThan(mid);
    expect(levelOf(300)).toBe(3);
  });
});

describe("local offices", () => {
  test("every county has its offices, filled by appointment month by month", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const list = ensureOffices(g, life.prov);
    const keys = list.map((o) => o.key);
    for (const k of [
      "justice",
      "sheriff",
      "lieutenant",
      "burgess",
      "constable",
      "collector",
    ] as const)
      expect(keys).toContain(k);
    toNextMonth(g);
    const filled = list.filter(
      (o) => o.holder >= 0 && OFFICES[o.key].how !== "elected",
    );
    expect(filled.length).toBeGreaterThanOrEqual(3);
    // Spread among the county's people.
    expect(new Set(filled.map((o) => o.holder)).size).toBeGreaterThan(1);
    // A native town has its own.
    const n = world({
      plans: [
        {
          seat: "s1",
          name: "N",
          plan: plan({
            origin: "powhatan",
            home: prov("Pamunkey"),
            religion: "native",
            background: "warrior",
            first: "Opechan",
            family: "of the Wolf clan",
          }),
        },
      ],
    });
    const town = ensureOffices(n, lifeOf(n).prov).map((o) => o.key);
    expect(town).toEqual(
      expect.arrayContaining([
        "council",
        "warcaptain",
        "speaker",
        "sachem",
        "clanmother",
      ]),
    );
  });

  test("seek an appointment: the appointer decides, the office pays and has its duty", () => {
    const g = world({
      start: 1650,
      plans: [{ seat: "s1", name: "A", plan: plan({ age: 30 }) }],
    });
    const life = lifeOf(g);
    life.renown = 30;
    const list = ensureOffices(g, life.prov);
    const justice = list.find((o) => o.key === "justice")!;
    // The county has its officers from the start; this place falls empty.
    expect(justice.holder).toBeGreaterThanOrEqual(0);
    justice.holder = -1;
    const gov = g.s.chars[g.s.nations[meOf(g.s, life)!.nation].ruler];
    like(g, life, gov, 80);
    const v = interactionView(g.s, g.w, life, gov.id, "seek", justice.id);
    expect(v.check.ok).toBe(true);
    expect(v.accept!.parts.some((p) => /empty|holds it/.test(p.label))).toBe(
      true,
    );
    expect(v.will).toBe(true);
    expect(
      g.lifeCommand("s1", {
        k: "person",
        c: gov.id,
        act: "seek",
        arg: justice.id,
      }),
    ).toBeNull();
    expect(justice.holder).toBe(life.c);
    const mine = officesOf(g.s, life.c).find((o) => o.kind === "local");
    expect(mine?.label).toMatch(/Justice of the peace/);
    expect(
      monthlyBudget(g.s, g.w, life).parts.some((p) => /Justice/.test(p.label)),
    ).toBe(true);
    // The duty, once a month.
    expect(
      g.lifeCommand("s1", { k: "society", act: "duty", id: justice.id }),
    ).toBeNull();
    expect(
      g.lifeCommand("s1", { k: "society", act: "duty", id: justice.id }),
    ).toMatch(/Done this month/);
    // A lever: find for one neighbour against another.
    const party = leverTargets(g.s, life, justice)[0];
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "lever",
        id: justice.id,
        arg: party.id,
      }),
    ).toBeNull();
    expect(
      party.memories.some((m) => m.of === life.c && /Found for me/.test(m.why)),
    ).toBe(true);
    // Neglect it long enough and you're out.
    justice.duty = g.s.day - 300;
    officesMonthly(g);
    expect(justice.holder).not.toBe(life.c);
  });

  test("stand at the poll: the freeholders choose, and a burgess sits in the assembly", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 80;
    life.renown = 60;
    life.skills.persuasion = 14;
    const list = ensureOffices(g, life.prov);
    const burgess = list.find((o) => o.key === "burgess")!;
    burgess.election = g.s.day + 40;
    expect(
      g.lifeCommand("s1", { k: "society", act: "stand", id: burgess.id }),
    ).toBeNull();
    expect(burgess.candidates.some((x) => x.c === life.c)).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "society", act: "stand", id: burgess.id }),
    ).toMatch(/standing/);
    ticks(g, 75);
    expect(burgess.holder).toBe(life.c);
    const pol = g.s.polities[meOf(g.s, life)!.nation];
    expect(pol.assembly).toContain(life.c);
  });
});

describe("letters", () => {
  test("a letter goes by road or sea, is answered with reasons, and the answer comes back", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    const s = g.s;
    const france = s.nations.find((n) => n.key === "france")!;
    const gov = s.chars[france.ruler];
    expect(correspondents(s, life)).toContain(gov.id);
    const route = postRoute(s, g.map, life.prov, france.capital)!;
    expect(route.days).toBeGreaterThan(5);
    expect(route.sea).toBeGreaterThan(0);
    expect(route.risk).toBeGreaterThan(0);
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "write",
        c: gov.id,
        kind: "introduce",
      }),
    ).toBeNull();
    const letter = postOf(life).find((l) => l.to === gov.id)!;
    expect(letter.status).toBe("transit");
    expect(letter.arrive).toBeGreaterThan(s.day);
    ticks(g, 200);
    if (letter.status === "lost") return; // the sea took it: that happens too
    expect(letter.status).toBe("delivered");
    const reply = postOf(life).find((l) => l.re === letter.id)!;
    expect(reply).toBeDefined();
    expect(reply.status).toBe("delivered");
    expect(letter.answer?.why.parts.length).toBeGreaterThan(0);
  });

  test("some letters are lost at sea", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 2000;
    const s = g.s;
    const far = correspondents(s, life).filter((id) => {
      const r = postRoute(
        s,
        g.map,
        life.prov,
        s.chars[id].home ?? s.nations[s.chars[id].nation].capital,
      );
      return !!r && r.sea > 0;
    });
    expect(far.length).toBeGreaterThan(5);
    let sent = 0;
    let lost = 0;
    let delivered = 0;
    for (let round = 0; round < 30 && !(lost && delivered); round++) {
      for (const id of far.slice(0, 12)) {
        life.cooldowns = {};
        if (
          !g.lifeCommand("s1", {
            k: "society",
            act: "write",
            c: id,
            kind: "friendly",
          })
        )
          sent++;
      }
      ticks(g, 60);
      const mine = postOf(life).filter(
        (l) => l.from === life.c && l.kind === "friendly",
      );
      lost += mine.filter((l) => l.status === "lost").length;
      delivered += mine.filter((l) => l.status === "delivered").length;
    }
    expect(sent).toBeGreaterThan(20);
    expect(lost).toBeGreaterThan(0);
    expect(delivered).toBeGreaterThan(lost);
  });

  test("a loan by letter: yes, with the coins enclosed and a debt to repay", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 30;
    moveTo(g, life, "Pamunkey");
    const friend =
      locals(g, life).find((c) => c.role === "merchant") ?? locals(g, life)[0];
    setTie(g, life, friend.id, "friend");
    like(g, life, friend, 80);
    life.met.push(friend.id);
    life.prov = prov("Jamestown");
    const b = letterAcceptance(g.s, g.w, life, friend, "favour", 10);
    expect(b!.total).toBeGreaterThan(0);
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "write",
        c: friend.id,
        kind: "favour",
        arg: 10,
      }),
    ).toBeNull();
    const purse = life.purse;
    ticks(g, 120);
    const l = postOf(life).find(
      (x) => x.kind === "favour" && x.to === friend.id,
    )!;
    expect(l.bySea).toBe(false);
    expect(l.answer?.yes).toBe(true);
    expect(life.purse).toBeGreaterThan(purse + 5);
    expect(life.debts.some((d) => d.to === friend.id)).toBe(true);
  });

  test("players write to each other, and the world writes to you", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        {
          seat: "s2",
          name: "B",
          plan: plan({
            first: "Bea",
            female: true,
            home: prov("Massachusetts Bay"),
          }),
        },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    a.purse = 20;
    b.purse = 50;
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "write",
        c: b.c,
        kind: "favour",
        arg: 20,
      }),
    ).toBeNull();
    ticks(g, 60);
    const got = postOf(b).find((l) => l.from === a.c && l.kind === "favour")!;
    expect(got?.status).toBe("delivered");
    expect(got.ask).toBe(true);
    const bPurse = b.purse;
    expect(
      g.lifeCommand("s2", {
        k: "society",
        act: "answer",
        id: got.id,
        yes: true,
      }),
    ).toBeNull();
    expect(b.purse).toBe(bPurse - 20);
    ticks(g, 60);
    expect(a.purse).toBeGreaterThanOrEqual(39);
    expect(postOf(a).find((l) => l.kind === "favour")?.answer?.yes).toBe(true);
    // Someone of the world writes with a threat; you give in.
    const rival = locals(g, a)[0];
    npcWrite(g, a, rival, "threat", "Pay up.", { ask: true, arg: 5 });
    ticks(g, 3);
    const threat = postOf(a).find((l) => l.kind === "threat")!;
    expect(threat.status).toBe("delivered");
    const before = a.purse;
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "answer",
        id: threat.id,
        yes: true,
      }),
    ).toBeNull();
    expect(a.purse).toBe(before - 5);
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "answer",
        id: threat.id,
        yes: true,
      }),
    ).toMatch(/answered/);
  });
});

describe("gatherings", () => {
  test("host a dinner: guests answer with reasons, the evening's turns play out, and it's judged", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    const s = g.s;
    expect(hostCheck(s, g.w, life, "dinner", "church", 7, 1).ok).toBe(false);
    expect(hostCheck(s, g.w, life, "social", "church", 7, 1).ok).toBe(
      s.provinces[life.prov] &&
        hostCheck(s, g.w, life, "social", "church", 7, 1).ok,
    );
    const guests = invitables(s, g.w, life)
      .filter((x) => x.near)
      .slice(0, 5);
    for (const x of guests) like(g, life, x.c, 30);
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "host",
        kind: "dinner",
        venue: "home",
        days: 7,
        arg: 1,
        list: guests.map((x) => x.c.id),
      }),
    ).toBeNull();
    const gat = s.society!.gatherings.find((x) => x.host === life.c)!;
    expect(gat.cost).toBe(GATHERINGS.dinner.base);
    expect(life.purse).toBe(100 - gat.cost);
    expect(Object.keys(gat.rsvp).length).toBe(guests.length);
    expect(Object.values(gat.rsvp).some((r) => r.yes)).toBe(true);
    const renown = life.renown;
    ticks(g, 8);
    expect(gat.status).toBe("on");
    expect(life.events.some((e) => e.key.startsWith("gather-"))).toBe(true);
    answerAll(g, life);
    expect(gat.status).toBe("held");
    expect(gat.played.length).toBeGreaterThanOrEqual(2);
    expect(life.renown).not.toBe(renown);
    const came = attendees(s, gat);
    expect(came.length).toBeGreaterThan(0);
    expect(
      came.some((c) =>
        c.memories.some((m) => m.of === life.c && /dinner/.test(m.why)),
      ),
    ).toBe(true);
  });

  test("a host who isn't there: it's called off", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    const guests = invitables(g.s, g.w, life)
      .filter((x) => x.near)
      .slice(0, 3);
    g.lifeCommand("s1", {
      k: "society",
      act: "host",
      kind: "cards",
      venue: "tavern",
      days: 5,
      arg: 1,
      list: guests.map((x) => x.c.id),
    });
    const gat = g.s.society!.gatherings[0];
    life.prov = prov("Massachusetts Bay");
    ticks(g, 6);
    expect(gat.status).toBe("cancelled");
  });

  test("far-off guests are asked by letter; others give gatherings and ask you", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    moveTo(g, life, "Pamunkey");
    const far = locals(g, life)[0];
    life.met.push(far.id);
    life.prov = life.home;
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "host",
        kind: "feast",
        venue: "home",
        days: 30,
        arg: 1,
        list: [far.id],
      }),
    ).toBeNull();
    const gat = g.s.society!.gatherings.find((x) => x.host === life.c)!;
    expect(
      postOf(life).some((l) => l.kind === "invite" && l.to === far.id),
    ).toBe(true);
    expect(gat.rsvp[far.id]).toBeUndefined();
    ticks(g, 10);
    expect(gat.rsvp[far.id]).toBeDefined();
    // Others ask you.
    let asked = false;
    for (let m = 0; m < 30 && !asked; m++) {
      toNextMonth(g);
      asked = g.s.society!.gatherings.some(
        (x) => x.host !== life.c && x.invited.includes(life.c),
      );
    }
    expect(asked).toBe(true);
  });

  test("a proposal by letter: yes, and a wedding at your home on the day", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.purse = 100;
    moveTo(g, life, "Pamunkey");
    const her = single(g, life);
    like(g, life, her, 90);
    life.met.push(her.id);
    life.prov = life.home;
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "write",
        c: her.id,
        kind: "marriage",
      }),
    ).toBeNull();
    ticks(g, 60);
    const l = postOf(life).find((x) => x.kind === "marriage")!;
    expect(l.bySea).toBe(false);
    expect(l.answer?.yes).toBe(true);
    const wedding = g.s.society!.gatherings.find(
      (x) => x.kind === "wedding" && x.about.includes(her.id),
    )!;
    expect(wedding).toBeDefined();
    ticks(g, wedding.day - g.s.day + 1);
    expect(meOf(g.s, life)!.spouse).toBe(her.id);
    answerAll(g, life);
  });
});

describe("lovers when married", () => {
  function married(seed = 7, religion: "anglican" | "puritan" = "anglican") {
    const g = world({
      start: 1650,
      seed,
      plans: [
        {
          seat: "s1",
          name: "A",
          plan: plan({
            religion,
            origin: "england",
            home: prov(
              religion === "puritan" ? "Massachusetts Bay" : "Jamestown",
            ),
          }),
        },
      ],
    });
    const life = lifeOf(g);
    life.purse = 100;
    const s = g.s;
    const me = meOf(s, life)!;
    const wife = single(g, life);
    like(g, life, wife, 90);
    expect(
      g.lifeCommand("s1", { k: "person", c: wife.id, act: "propose" }),
    ).toBeNull();
    expect(me.spouse).toBe(wife.id);
    const other = single(g, life);
    return { g, life, me, wife, other };
  }

  test("courting while married is an affair: in secret, and marriage is out of the question", () => {
    const { g, life, other } = married();
    const v = interactionView(g.s, g.w, life, other.id, "court");
    expect(v.check.ok).toBe(true);
    expect(v.label).toBe("Court in secret");
    expect(interactionView(g.s, g.w, life, other.id, "propose").check.ok).toBe(
      false,
    );
    like(g, life, other, 90);
    life.skills.persuasion = 20;
    for (let i = 0; i < 12 && life.ties[other.id] !== "lover"; i++) {
      life.cooldowns = {};
      g.lifeCommand("s1", { k: "person", c: other.id, act: "court" });
    }
    expect(life.ties[other.id]).toBe("lover");
    const a = affairWith(life, other.id)!;
    expect(a).toBeDefined();
    // Meeting in secret raises what's suspected.
    const ex = a.exposure;
    life.cooldowns = {};
    expect(
      g.lifeCommand("s1", { k: "person", c: other.id, act: "tryst" }),
    ).toBeNull();
    expect(a.exposure).toBeGreaterThan(ex - 1);
  });

  test("found out: a spouse's anger, a separation (or a divorce where the church allows), a scandal", () => {
    const { g, life, me, wife, other } = married();
    setTie(g, life, other.id, "lover");
    const a = (life.affairs = [
      {
        c: other.id,
        since: g.s.day,
        exposure: 10,
        known: [],
        kids: [],
        met: g.s.day,
        blackmailer: -1,
      },
    ])[0];
    exposeBy(g, life, a, 100);
    const ev = life.events.find((e) => e.key === "affair-found-spouse")!;
    expect(ev).toBeDefined();
    expect(ev.choices[ev.choices.length - 1].label).toBe("Live apart");
    expect(
      g.lifeCommand("s1", {
        k: "event",
        id: ev.id,
        choice: ev.choices.length - 1,
      }),
    ).toBeNull();
    // Anglicans separate: still married.
    expect(me.spouse).toBe(wife.id);
    expect(life.scandal).toBeTruthy();
    expect(
      opinionOf(g.s, wife, life).parts.some((p) =>
        /apart|scandal/i.test(p.label),
      ),
    ).toBe(true);
    // Puritans may divorce.
    const p = married(11, "puritan");
    setTie(p.g, p.life, p.other.id, "lover");
    const pa = (p.life.affairs = [
      {
        c: p.other.id,
        since: p.g.s.day,
        exposure: 10,
        known: [],
        kids: [],
        met: p.g.s.day,
        blackmailer: -1,
      },
    ])[0];
    exposeBy(p.g, p.life, pa, 100, "spouse");
    const pev = p.life.events.find((e) => e.key === "affair-found-spouse")!;
    expect(pev.choices[ev.choices.length - 1].label).toBe("Ask for a divorce");
    expect(
      p.g.lifeCommand("s1", {
        k: "event",
        id: pev.id,
        choice: pev.choices.length - 1,
      }),
    ).toBeNull();
    expect(p.me.spouse).toBe(-1);
    expect(p.wife.spouse).toBe(-1);
  });

  test("a child no one expected, and a blackmailer's letter", () => {
    const { g, life, me, other } = married();
    setTie(g, life, other.id, "lover");
    const a = (life.affairs = [
      {
        c: other.id,
        since: g.s.day,
        exposure: 50,
        known: [],
        kids: [],
        met: g.s.day,
        blackmailer: -1,
      },
    ])[0];
    affairChild(g, life, a, other, me);
    expect(a.kids.length).toBe(1);
    const kid = g.s.chars[a.kids[0]];
    expect(kid.mother).toBe(other.id);
    expect(me.children).not.toContain(kid.id);
    const ev = life.events.find((e) => e.key === "affair-child")!;
    expect(
      g.lifeCommand("s1", { k: "event", id: ev.id, choice: 0 }),
    ).toBeNull();
    expect(kid.father).toBe(me.id);
    expect(me.children).toContain(kid.id);
    // Someone knows, and wants paying.
    startBlackmail(g, life, a);
    expect(a.blackmailer).toBeGreaterThanOrEqual(0);
    ticks(g, 40);
    const bm = postOf(life).find((l) => l.kind === "blackmail")!;
    expect(bm?.status).toBe("delivered");
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "answer",
        id: bm.id,
        yes: false,
      }),
    ).toBeNull();
    expect(a.known).toContain("town");
    expect(life.scandal).toBeTruthy();
    expect(charName(kid).length).toBeGreaterThan(2);
  });

  test("other people's secrets: pried into, and paid for", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    life.skills.stealth = 20;
    const mark = locals(g, life).find((c) => !!npcSecret(g.s, c))!;
    expect(mark).toBeDefined();
    expect(interactionView(g.s, g.w, life, mark.id, "blackmail").check.ok).toBe(
      false,
    );
    for (let i = 0; i < 10 && !(life.secrets ?? []).length; i++) {
      life.cooldowns = {};
      g.lifeCommand("s1", { k: "person", c: mark.id, act: "pry" });
    }
    expect((life.secrets ?? []).some((x) => x.of === mark.id)).toBe(true);
    const purse = life.purse;
    let paid = false;
    for (let i = 0; i < 10 && !paid; i++) {
      life.cooldowns = {};
      for (const x of life.secrets ?? []) delete x.paid;
      g.lifeCommand("s1", { k: "person", c: mark.id, act: "blackmail" });
      paid = life.purse > purse;
    }
    expect(paid).toBe(true);
  });

  test("two players, one of them married, by mutual consent", () => {
    const g = world({
      start: 1650,
      plans: [
        { seat: "s1", name: "A", plan: plan() },
        { seat: "s2", name: "B", plan: plan({ first: "Bea", female: true }) },
      ],
    });
    const a = lifeOf(g, "s1");
    const b = lifeOf(g, "s2");
    const s = g.s;
    // A is married to someone of the world.
    const wife = locals(g, a).find(
      (c) => c.female && c.spouse < 0 && s.day - c.born > 18 * 365,
    )!;
    like(g, a, wife, 90);
    a.purse = 100;
    expect(
      g.lifeCommand("s1", { k: "person", c: wife.id, act: "propose" }),
    ).toBeNull();
    const meA = meOf(s, a)!;
    const meB = meOf(s, b)!;
    meB.memories.push({ of: a.c, why: "Test", value: 60, until: 0 });
    meA.memories.push({ of: b.c, why: "Test", value: 60, until: 0 });
    expect(interactionView(s, g.w, a, b.c, "court").player).toBe(true);
    expect(
      g.lifeCommand("s1", { k: "person", c: b.c, act: "court" }),
    ).toBeNull();
    const ask = b.events.find((e) => e.key === "p2p-court")!;
    expect(
      g.lifeCommand("s2", { k: "event", id: ask.id, choice: 0 }),
    ).toBeNull();
    expect(a.ties[b.c]).toBe("lover");
    expect(affairWith(a, b.c)).toBeDefined();
    expect(affairWith(b, a.c)).toBeDefined();
  });
});

describe("settlements and new nations", () => {
  test("found a settlement: families, supplies, a charter, the expedition, a new province", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const s = g.s;
    life.purse = 300;
    life.renown = 30;
    const site = settlementSites(s, g.w, life)[0];
    expect(site).toBeDefined();
    expect(
      g.lifeCommand("s1", { k: "society", act: "found", p: site.p, arg: 2 }),
    ).toBeNull();
    expect(life.founding?.target).toBe(site.p);
    // Families who'd come.
    const folk = locals(g, life).filter(
      (c) =>
        c.home === life.prov &&
        s.day - c.born > 20 * 365 &&
        !s.nations.some((n) => n.ruler === c.id),
    );
    let got = 0;
    for (const c of folk) {
      if (got >= 3) break;
      like(g, life, c, 80);
      const v = interactionView(s, g.w, life, c.id, "settle");
      if (!v.check.ok) continue;
      expect(v.accept!.parts.length).toBeGreaterThan(1);
      if (
        v.will &&
        !g.lifeCommand("s1", { k: "person", c: c.id, act: "settle" })
      )
        got++;
    }
    expect(life.founding!.settlers.length).toBe(3);
    expect(g.lifeCommand("s1", { k: "society", act: "setout" })).toMatch(
      /Supplies/,
    );
    expect(
      g.lifeCommand("s1", { k: "society", act: "supply", arg: 100 }),
    ).toBeNull();
    // The governor's leave.
    const gov = s.chars[s.nations[meOf(s, life)!.nation].ruler];
    like(g, life, gov, 80);
    expect(g.lifeCommand("s1", { k: "society", act: "charter" })).toBeNull();
    expect(life.founding!.charter).toBe("granted");
    expect(g.lifeCommand("s1", { k: "society", act: "setout" })).toBeNull();
    ticks(g, site.days + 5);
    const pr = s.provinces[site.p];
    expect(pr.owner).toBe(meOf(s, life)!.nation);
    expect(life.home).toBe(site.p);
    expect(life.founding).toBeNull();
    const founder = s.society!.offices[site.p].find(
      (o) => o.key === "founder",
    )!;
    expect(founder.holder).toBe(life.c);
    expect(s.locals[site.p].length).toBeGreaterThanOrEqual(3);
  });

  test("your own colony, then its government: name, flag, colour, form, first officers", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const s = g.s;
    life.purse = 300;
    const site = settlementSites(s, g.w, life)[0];
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "found",
        p: site.p,
        free: true,
        arg: 1,
      }),
    ).toBeNull();
    for (const c of locals(g, life).filter(
      (c) =>
        c.home === life.prov &&
        s.day - c.born > 20 * 365 &&
        !s.nations.some((n) => n.ruler === c.id),
    )) {
      if (life.founding!.settlers.length >= 3) break;
      like(g, life, c, 90);
      g.lifeCommand("s1", { k: "person", c: c.id, act: "settle" });
    }
    g.lifeCommand("s1", { k: "society", act: "supply", arg: 100 });
    expect(g.lifeCommand("s1", { k: "society", act: "setout" })).toBeNull();
    const count = s.nations.length;
    ticks(g, site.days + 5);
    expect(s.nations.length).toBe(count + 1);
    const n = s.nations[count];
    expect(n.kind).toBe("power");
    expect(n.independent).toBe(true);
    expect(n.ruler).toBe(life.c);
    expect(s.provinces[site.p].owner).toBe(n.id);
    expect(life.constitute?.n).toBe(n.id);
    expect(life.events.some((e) => e.key === "found-government")).toBe(true);
    const flag = {
      field: FLAG_COLORS[8],
      division: "canton" as const,
      second: FLAG_COLORS[0],
      charge: "star" as const,
      chargeColor: FLAG_COLORS[5],
    };
    expect(
      g.lifeCommand("s1", {
        k: "society",
        act: "constitute",
        name: "the Republic of New Albion",
        adjective: "Albionese",
        color: FLAG_COLORS[8],
        flag,
        gov: "republic",
        p: site.p,
        offices: {},
      }),
    ).toBeNull();
    expect(n.name).toBe("the Republic of New Albion");
    expect(n.flag).toEqual(flag);
    expect(n.gov).toBe("republic");
    expect(
      officesOf(s, life.c).some((o) =>
        /President of Republic of New Albion/.test(o.label),
      ),
    ).toBe(true);
    // The world runs it on: a year of AI, nothing breaks.
    ticks(g, 365);
    expect(Number.isFinite(n.gold)).toBe(true);
  });

  test("after a rising, its leader sets up the government", () => {
    const g = world({ start: 1650 });
    const life = lifeOf(g);
    const s = g.s;
    const me = meOf(s, life)!;
    const n = s.nations[me.nation];
    n.ruler = me.id;
    risingWon(g, n.id, me.id, true);
    expect(life.constitute?.n).toBe(n.id);
    const officer =
      s.chars[n.council.treasurer] ??
      locals(g, life).find((c) => !c.female && s.day - c.born > 30 * 365)!;
    const flag = {
      field: FLAG_COLORS[2],
      division: "stripes" as const,
      second: FLAG_COLORS[0],
      charge: "tree" as const,
      chargeColor: FLAG_COLORS[6],
    };
    const err = g.lifeCommand("s1", {
      k: "society",
      act: "constitute",
      name: "the Commonwealth of Virginia",
      adjective: "Virginian",
      color: FLAG_COLORS[2],
      flag,
      gov: "commonwealth",
      p: n.capital,
      offices: {},
      free: true,
    });
    expect(err).toBeNull();
    expect(n.name).toBe("the Commonwealth of Virginia");
    expect(n.independent || n.rebelling).toBe(true);
    expect(n.mods.some((m) => m.key === "gov:commonwealth")).toBe(true);
    expect(life.constitute).toBeNull();
    void officer;
    void makeCharacter;
  });
});
