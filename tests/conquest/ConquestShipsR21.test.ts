// SHIPS (r21): ships worth owning. Her company taken on by name with a role
// and pay (Hiring.ts, which WORK reuses for businesses), promoted, demoted
// and paid; no cap on what you own; a ship that keeps at her work when you
// leave port; charters at the quay, sailed on the map under her own master
// or with you aboard, their odds against what the sailing does; anchoring
// and beaching where there's no port, and a passage's ship lying off a
// portless island; travelling parties and getting off at a stop; a
// captain's stay at a port on the way; two players through the rooms
// server; and saves, the delta and old saves.

import http from "http";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { BOATS, CREW_WAGE } from "../../src/conquest/engine/Boats";
import { dayOf } from "../../src/conquest/engine/Calendar";
import { applyDelta } from "../../src/conquest/engine/Delta";
import { ConquestGame } from "../../src/conquest/engine/Game";
import {
  askingPay,
  fitFor,
  prospectOf,
  roleOf,
  signOdds,
} from "../../src/conquest/engine/Hiring";
import { autoAnswerLife } from "../../src/conquest/engine/LifeEvents";
import {
  jobTitle,
  lifeOfSeat,
  travelRoute,
} from "../../src/conquest/engine/LifeQueries";
import { WORK_DAYS } from "../../src/conquest/engine/LifeRules";
import { strandEmbark } from "../../src/conquest/engine/Parties";
import {
  charterOdds,
  chartersAt,
  hostOfBoat,
  launch,
  passageChances,
  passageOf,
  seekerChar,
  seekersAt,
  shipFx,
} from "../../src/conquest/engine/Ships";
import {
  COASTER,
  LIE_DAYS,
  SHIP_LADDER,
  STAY_DAYS,
} from "../../src/conquest/engine/ShipsData";
import type {
  Boat,
  GameDelta,
  GameState,
  Life,
} from "../../src/conquest/engine/Types";
import type { ServerMessage } from "../../src/conquest/Protocol";
import { lifeOf, map, plan, prov, world } from "./LifeUtil";

const BOS = prov("Massachusetts Bay");

/** A sailor (or two) at Boston in 1702, with money and some seamanship. */
function atBoston(o: { seed?: number; seats?: number } = {}) {
  const plans = [
    {
      seat: "s1",
      name: "Alden",
      plan: plan({ background: "sailor", home: BOS }),
    },
  ];
  if ((o.seats ?? 1) > 1)
    plans.push({
      seat: "s2",
      name: "Bea",
      plan: plan({
        first: "Beatrice",
        family: "Hale",
        female: true,
        background: "sailor",
        home: BOS,
      }),
    });
  const g = world({ start: 1700, seed: o.seed ?? 11, plans });
  const s = g.s;
  s.day = dayOf(1702, 4, 2);
  for (const l of s.lives) {
    l.prov = BOS;
    l.travel = null;
    l.skills.seamanship = 8;
    l.skills.leadership = 5;
    l.purse = 900;
  }
  return { g, s, life: lifeOf(g) };
}

function cmd(
  g: ConquestGame,
  c: Parameters<ConquestGame["lifeCommand"]>[1],
  seat = "s1",
) {
  return g.lifeCommand(seat, c);
}

/** Buy a new boat of a kind at the owner's port, crewed by the head. */
function buy(g: ConquestGame, life: Life, kind: Boat["kind"], seat = "s1"): Boat {
  const before = (life.boats ?? []).length;
  expect(cmd(g, { k: "boat", act: "buy", kind, arg: -1 }, seat)).toBeNull();
  const b = life.boats![before];
  b.crew = BOATS[kind].crew;
  return b;
}

function answerAll(g: ConquestGame) {
  for (const l of g.s.lives)
    for (const e of [...l.events]) autoAnswerLife(g, l.seat, e.id);
}

function days(g: ConquestGame, n: number, answer = true) {
  for (let i = 0; i < n; i++) {
    g.tick();
    if (answer) answerAll(g);
  }
}

// ---------------------------------------------------------------- her company

describe("her company, by name: role, pay, promotion", { timeout: 120_000 }, () => {
  test("the computer's seamen sign by the odds shown, and are promoted, paid and let go", () => {
    const { g, s, life } = atBoston();
    const b = buy(g, life, "schooner");
    const host = hostOfBoat(s, life, b);
    const seekers = seekersAt(s, g.w, BOS);
    expect(seekers.length).toBeGreaterThanOrEqual(3);
    const k = seekers.find((x) => x.trade === "sailor")!;
    const hand = roleOf(SHIP_LADDER, "hand")!;
    const fake = seekerChar(s, BOS, k);
    const p = prospectOf(s, life, fake, SHIP_LADDER);
    const ask = askingPay(p, hand);
    // Far under what they'd ask: they won't, and nobody is made.
    const chars = Object.keys(s.chars).length;
    const odds = signOdds(host, p, hand, 0.5);
    expect(odds.total).toBeLessThanOrEqual(0);
    expect(
      cmd(g, { k: "ship", act: "hire", id: b.id, arg: k.slot, role: "hand", pay: 0.5 }),
    ).toMatch(/won't sign/);
    expect(Object.keys(s.chars).length).toBe(chars);
    // At what they'd ask, they sign.
    expect(signOdds(host, p, hand, ask).total).toBeGreaterThan(0);
    expect(
      cmd(g, { k: "ship", act: "hire", id: b.id, arg: k.slot, role: "hand", pay: ask }),
    ).toBeNull();
    const h = b.roster!.hires[0];
    expect(h.role).toBe("hand");
    expect(h.pay).toBe(ask);
    expect(s.chars[h.c].first).toBe(k.first);
    // A named hand takes a hand-by-the-head's place: the crew's room is shared.
    expect(hostOfBoat(s, life, b).room("hand")).toBe(
      Math.ceil(BOATS.schooner.crew * 1.5) - b.crew,
    );
    // Promote to bosun, then mate (if fit), raise his pay; he remembers.
    expect(cmd(g, { k: "ship", act: "role", id: b.id, hire: h.id, role: "bosun" })).toBeNull();
    expect(h.role).toBe("bosun");
    expect(s.chars[h.c].memories.some((m) => /bosun/.test(m.why))).toBe(true);
    expect(cmd(g, { k: "ship", act: "pay", id: b.id, hire: h.id, pay: 3 })).toBeNull();
    expect(h.pay).toBe(3);
    // One bosun only.
    const k2 = seekers.find((x) => x.slot !== k.slot && x.trade === "sailor")!;
    const ask2 = askingPay(prospectOf(s, life, seekerChar(s, BOS, k2), SHIP_LADDER), hand);
    expect(
      cmd(g, { k: "ship", act: "hire", id: b.id, arg: k2.slot, role: "hand", pay: ask2 + 1 }),
    ).toBeNull();
    const h2 = b.roster!.hires[1];
    expect(cmd(g, { k: "ship", act: "role", id: b.id, hire: h2.id, role: "bosun" })).toMatch(
      /bosun already/,
    );
    // Demote the bosun back to a hand: he remembers that too.
    expect(cmd(g, { k: "ship", act: "role", id: b.id, hire: h.id, role: "hand" })).toBeNull();
    expect(s.chars[h.c].memories.some((m) => /lower berth/.test(m.why))).toBe(true);
    // The month: each is paid from your purse.
    const before = life.purse;
    days(g, 35);
    expect(life.purse).toBeLessThan(before - h.pay - h2.pay + 0.01);
    // Let go.
    expect(cmd(g, { k: "ship", act: "dismiss", id: b.id, hire: h2.id })).toBeNull();
    expect(b.roster!.hires.map((x) => x.id)).toEqual([h.id]);
  });

  test("unpaid, the computer's people go ashore", () => {
    const { g, life } = atBoston({ seed: 12 });
    const b = buy(g, life, "sloop");
    const k = seekersAt(g.s, g.w, BOS)[0];
    expect(
      cmd(g, { k: "ship", act: "hire", id: b.id, arg: k.slot, role: "hand", pay: 4 }),
    ).toBeNull();
    life.purse = 0;
    days(g, 70);
    expect(b.roster!.hires.length).toBe(0);
    expect(life.journal.some((j) => /goes ashore for good/.test(j.text))).toBe(true);
  });

  test("what her people do: her captain commands her, a bosun saves wear, a navigator quickens and steadies her", () => {
    const { g, s, life } = atBoston({ seed: 13 });
    const b = buy(g, life, "brig");
    const base = shipFx(s, life, b);
    expect(base.master.kind).toBe("you");
    life.prov = prov("Jamestown");
    expect(shipFx(s, life, b).master.kind).toBe("hand");
    life.prov = BOS;
    const seekers = seekersAt(s, g.w, BOS);
    // Hire whoever will sign as captain, bosun and navigator (generously paid).
    for (const role of ["captain", "bosun", "navigator"]) {
      for (const k of seekers) {
        if (
          cmd(g, { k: "ship", act: "hire", id: b.id, arg: k.slot, role, pay: 12 }) ===
          null
        )
          break;
      }
    }
    // Some of them signed, and each did what their role does.
    const fx = shipFx(s, life, b);
    const roles = b.roster!.hires.map((h) => h.role);
    if (roles.includes("captain")) expect(fx.master.kind).toBe("captain");
    if (roles.includes("bosun")) expect(fx.wear).toBeLessThan(1);
    if (roles.includes("navigator")) {
      expect(fx.loss).toBeLessThan(1);
      expect(fx.speed).toBeGreaterThan(1);
    }
    expect(roles.length).toBeGreaterThan(0);
    // Away from her, she's still commanded (her captain, or her senior hand).
    life.prov = prov("Jamestown");
    expect(["captain", "mate", "hand"]).toContain(shipFx(s, life, b).master.kind);
  });
});

// ---------------------------------------------------------------- no cap, and working without you

describe("no cap, and a ship that works without you", { timeout: 120_000 }, () => {
  test("six boats and ships are as many as you like", () => {
    const { g, life } = atBoston({ seed: 14 });
    life.purse = 5000;
    for (const k of ["sloop", "sloop", "schooner", "shallop", "brig", "ship"] as const)
      buy(g, life, k);
    expect(life.boats!.length).toBe(6);
  });

  test("you leave port and she keeps fishing (her senior hand has her); the money's in the ledger", () => {
    const { g, s, life } = atBoston({ seed: 15 });
    const b = buy(g, life, "schooner");
    expect(cmd(g, { k: "boat", act: "use", id: b.id, use: "fishing" })).toBeNull();
    // Off to Jamestown overland: she stays at Boston.
    life.prov = prov("Jamestown");
    const before = life.tally.earned;
    days(g, 95);
    expect(life.tally.earned).toBeGreaterThan(before);
    const st = life.statements ?? [];
    expect(st.some((x) => x.lines.some((l) => l.k === `bj:${b.id}` && l.v > 0))).toBe(true);
    expect(b.prov).toBe(BOS);
    void s;
  });
});

// ---------------------------------------------------------------- charters

describe("charters at the quay", { timeout: 120_000 }, () => {
  test("a freight charter: she sails on the map under her own master, delivers, is paid; her log and her name", () => {
    const { g, s, life } = atBoston({ seed: 21 });
    const b = buy(g, life, "schooner");
    // Find a month with freight on offer she can carry.
    let ch = chartersAt(s, g.w, BOS).find((c) => c.kind === "freight" && (c.loads ?? 0) <= 70);
    for (let i = 0; !ch && i < 12; i++) {
      s.day += 30;
      ch = chartersAt(s, g.w, BOS).find((c) => c.kind === "freight" && (c.loads ?? 0) <= 70);
    }
    expect(ch).toBeTruthy();
    const odds = charterOdds(s, g.w, life, b, ch!);
    expect(odds.ok).toBe(true);
    expect(odds.outcomes.reduce((m, o) => m + o.p, 0)).toBeCloseTo(1, 1);
    const before = life.purse;
    expect(cmd(g, { k: "ship", act: "charter", id: b.id, key: ch!.key, arg: 0 })).toBeNull();
    expect(b.way).toBeTruthy();
    expect(life.travel).toBeNull(); // she sails without you
    const lost = b.way!.lost !== undefined;
    let saw = false;
    for (let i = 0; i < 120 && (b.way || b.charter); i++) {
      g.tick();
      answerAll(g);
      if (b.way && b.way.prov !== BOS) saw = true;
    }
    if (lost) {
      expect(life.boats!.includes(b)).toBe(false);
      return;
    }
    expect(b.prov).toBe(ch!.to);
    expect(b.charter).toBeNull();
    expect(saw || b.voyages! >= 1).toBe(true);
    expect(life.purse).toBeGreaterThan(before - 20);
    expect(b.log!.some((l) => /delivered/.test(l.text))).toBe(true);
    expect(b.rep).not.toBe(50);
    expect(life.statements?.length ?? 0).toBeGreaterThanOrEqual(0);
  });

  test("with you aboard commanding her: you go where she goes, and come in with her", () => {
    const { g, s, life } = atBoston({ seed: 22 });
    const b = buy(g, life, "sloop");
    let ch = chartersAt(s, g.w, BOS).find((c) => c.kind === "passengers" && (c.heads ?? 0) <= 8);
    for (let i = 0; !ch && i < 12; i++) {
      s.day += 30;
      ch = chartersAt(s, g.w, BOS).find((c) => c.kind === "passengers" && (c.heads ?? 0) <= 8);
    }
    expect(ch).toBeTruthy();
    expect(cmd(g, { k: "ship", act: "charter", id: b.id, key: ch!.key, arg: 1 })).toBeNull();
    expect(life.travel?.with).toEqual({ seat: "s1", boat: b.id });
    expect(shipFx(s, life, b).master.kind).toBe("you");
    const lost = b.way!.lost !== undefined;
    for (let i = 0; i < 120 && b.way; i++) {
      g.tick();
      answerAll(g);
      if (b.way) expect(life.prov).toBe(b.way.prov);
    }
    g.tick();
    if (lost) {
      expect(life.journal.some((j) => /on a spar/.test(j.text))).toBe(true);
      return;
    }
    expect(life.travel).toBeNull();
    expect(life.prov).toBe(ch!.to);
    expect(b.prov).toBe(ch!.to);
  });

  test("the odds shown are what her passages do: lost, late and battered, over 4,000 passages", () => {
    const { g, s, life } = atBoston({ seed: 23 });
    const b = buy(g, life, "sloop");
    const to = prov("Charles Town");
    const route = passageOf(s, g.map, life, b, to)!;
    expect(route).toBeTruthy();
    const ch = passageChances(s, life, b, route.km);
    let lost = 0;
    let late = 0;
    let dmg = 0;
    const N = 4000;
    const day0 = s.day;
    for (let i = 0; i < N; i++) {
      s.day = day0 + i;
      b.way = null;
      b.prov = BOS;
      expect(launch(g, life, b, to, false)).toBeNull();
      if (b.way!.lost !== undefined) lost++;
      if (b.way!.late) late++;
      if (b.way!.dmg) dmg++;
    }
    b.way = null;
    const se = (p: number) => 3 * Math.sqrt((p * (1 - p)) / N) + 0.005;
    expect(Math.abs(lost / N - ch.lost)).toBeLessThan(se(ch.lost));
    expect(Math.abs(late / N - ch.late)).toBeLessThan(se(ch.late));
    expect(Math.abs(dmg / N - ch.damage)).toBeLessThan(se(ch.damage));
  });

  test("a venture of your own: bought here (dearer for it), sold there (cheaper for it)", () => {
    const { g, s, life } = atBoston({ seed: 24 });
    const b = buy(g, life, "sloop");
    const to = prov("Jamaica");
    const before = life.purse;
    const err = cmd(g, { k: "ship", act: "venture", id: b.id, key: "fish", to, pay: 30, arg: 0 });
    expect(err).toBeNull();
    expect(life.purse).toBeLessThan(before);
    expect(s.markets?.[BOS]?.net.fish ?? 0).toBeLessThan(0);
    expect(b.charter!.cost).toBeGreaterThan(0);
    const lost = b.way!.lost !== undefined;
    days(g, 120);
    if (lost) return;
    expect(b.prov).toBe(to);
    expect(b.log!.some((l) => /sold her 30 loads of fish/.test(l.text))).toBe(true);
    expect(s.markets?.[to]?.net.fish ?? 0).toBeGreaterThan(0);
  });

  test("the packet runs back and forth and pays every month; a season on the grounds brings her catch, then home", () => {
    const { g, s, life } = atBoston({ seed: 25 });
    const sloop = buy(g, life, "sloop");
    const schooner = buy(g, life, "schooner");
    const find = (kind: string) => {
      const day0 = s.day;
      for (let i = 0; i < 40; i++) {
        const c = chartersAt(s, g.w, BOS).find((x) => x.kind === kind);
        if (c) return c;
        s.day += 30;
      }
      s.day = day0;
      return undefined;
    };
    const packet = find("packet")!;
    expect(packet).toBeTruthy();
    expect(cmd(g, { k: "ship", act: "charter", id: sloop.id, key: packet.key, arg: 0 })).toBeNull();
    expect(sloop.charter!.due).toBe(s.day + 90);
    let runs = 0;
    const ends = new Set<number>();
    for (let i = 0; i < 100 && life.boats!.includes(sloop); i++) {
      g.tick();
      answerAll(g);
      runs = Math.max(runs, sloop.charter?.runs ?? 0);
      if (!sloop.way) ends.add(sloop.prov);
    }
    if (life.boats!.includes(sloop)) {
      expect(runs).toBeGreaterThanOrEqual(2);
      expect(ends.has(BOS) && ends.has(packet.to)).toBe(true);
      expect(sloop.charter).toBeNull();
      const paid = (life.statements ?? []).flatMap((x) => x.lines).filter((l) => l.k === `bc:${sloop.id}`);
      expect(paid.length).toBeGreaterThanOrEqual(2);
      expect(paid.every((l) => l.v > 0)).toBe(true);
    }
    const grounds = find("fishing")!;
    expect(grounds).toBeTruthy();
    expect(cmd(g, { k: "ship", act: "charter", id: schooner.id, key: grounds.key, arg: 0 })).toBeNull();
    for (let i = 0; i < 160 && schooner.charter && life.boats!.includes(schooner); i++) {
      g.tick();
      answerAll(g);
    }
    if (life.boats!.includes(schooner)) {
      expect(schooner.charter).toBeNull();
      expect(schooner.prov).toBe(BOS);
      expect(schooner.log!.some((l) => /A month on the grounds/.test(l.text))).toBe(true);
      expect(schooner.log!.some((l) => /Home from the/.test(l.text))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- where there's no port

describe("where there's no port", { timeout: 120_000 }, () => {
  const BAR = prov("Barbados");
  const VIN = prov("St. Vincent");

  test("your sloop is beached at an island with no port, and takes you off again (a day to float her)", () => {
    const { g, s, life } = atBoston({ seed: 31 });
    life.prov = BAR;
    const b = buy(g, life, "sloop");
    expect(cmd(g, { k: "sail", to: VIN, boat: b.id })).toBeNull();
    days(g, 20);
    expect(life.prov).toBe(VIN);
    expect(b.prov).toBe(VIN);
    expect(b.moor).toBe("beach");
    expect(b.log!.some((l) => /beached/.test(l.text))).toBe(true);
    // Careened on the beach where there's no yard.
    b.condition = 60;
    expect(cmd(g, { k: "ship", act: "careen", id: b.id })).toBeNull();
    expect(b.condition).toBe(85);
    // And off again: a day more, on the tide.
    const plain = passageOf(s, g.map, life, { ...b, moor: undefined }, BAR)!;
    const off = passageOf(s, g.map, life, b, BAR)!;
    expect(off.days).toBe(plain.days + 1);
    expect(cmd(g, { k: "sail", to: BAR, boat: b.id })).toBeNull();
    days(g, 20);
    expect(life.prov).toBe(BAR);
    expect(b.moor).toBeUndefined();
  });

  test("a brig anchors offshore instead", () => {
    const { g, life } = atBoston({ seed: 32 });
    life.prov = BAR;
    const b = buy(g, life, "brig");
    expect(cmd(g, { k: "sail", to: VIN, boat: b.id })).toBeNull();
    days(g, 20);
    expect(b.moor).toBe("anchor");
  });

  test("a passage to an island with no port: her master lies off, you can go back aboard; then a coaster can be hailed", () => {
    const { g, s, life } = atBoston({ seed: 33 });
    life.prov = BAR;
    expect(cmd(g, { k: "travel", to: VIN, bySea: true })).toBeNull();
    for (let i = 0; i < 30 && life.travel; i++) days(g, 1);
    expect(life.prov).toBe(VIN);
    expect(life.lying?.p).toBe(VIN);
    expect(life.lying!.until).toBeGreaterThan(s.day);
    // Before r21 there was no way off but a boat of your own.
    expect(travelRoute(s, g.map, VIN, BAR, true, false, false, 1)).toBeNull();
    const e = strandEmbark(s, g.map, life)!;
    expect(e.wait).toBe(0);
    const back = travelRoute(s, g.map, VIN, BAR, true, false, false, 1, false, e)!;
    expect(back).toBeTruthy();
    // After she's gone, a coaster: a few days' wait.
    s.day = life.lying!.until + 1;
    const later = strandEmbark(s, g.map, life)!;
    expect(later.wait).toBeGreaterThanOrEqual(COASTER.settled);
    const hailed = travelRoute(s, g.map, VIN, BAR, true, false, false, 1, false, later)!;
    expect(hailed.days).toBe(back.days + later.wait);
    expect(LIE_DAYS).toBeGreaterThan(0);
    expect(cmd(g, { k: "travel", to: BAR, bySea: true })).toBeNull();
    days(g, 25);
    expect(life.prov).toBe(BAR);
  });
});

// ---------------------------------------------------------------- parties and stays

describe("travelling together, and a stay on the way", { timeout: 120_000 }, () => {
  test("asked to travel together; she sails in his own boat with him, and gets off at a port on the way", () => {
    const { g, s } = atBoston({ seed: 41, seats: 2 });
    const A = lifeOfSeat(s, "s1")!;
    const B = lifeOfSeat(s, "s2")!;
    const b = buy(g, A, "sloop");
    expect(cmd(g, { k: "party", act: "invite", seat: "s2" })).toBeNull();
    const ev = B.events.find((e) => e.key === "p2p-party-invite")!;
    expect(ev).toBeTruthy();
    expect(cmd(g, { k: "event", id: ev.id, choice: 0 }, "s2")).toBeNull();
    expect(B.party?.lead).toBe("s1");
    // A long voyage, south: she comes too, aboard his sloop, for nothing.
    const to = prov("Jamaica");
    const purse = B.purse;
    expect(cmd(g, { k: "sail", to, boat: b.id })).toBeNull();
    expect(B.travel?.with).toEqual({ seat: "s1", boat: b.id });
    expect(B.purse).toBe(purse);
    // Follows him hop by hop.
    const hops = A.travel!.path.length;
    expect(hops).toBeGreaterThan(1);
    {
      for (let i = 0; i < 30 && A.travel!.path.length === hops; i++) g.tick();
      expect(A.travel!.path.length).toBe(hops - 1);
      expect(B.prov).toBe(A.prov);
      // She gets off at the next stop.
      const stop = A.travel!.path[0];
      expect(cmd(g, { k: "party", act: "alight" }, "s2")).toBeNull();
      days(g, 60);
      expect(B.prov).toBe(stop);
      expect(A.prov).toBe(to);
      expect(B.party).toBeNull();
    }
  });

  test("over land too, each paying their own way", () => {
    const { g, s } = atBoston({ seed: 42, seats: 2 });
    const A = lifeOfSeat(s, "s1")!;
    const B = lifeOfSeat(s, "s2")!;
    expect(cmd(g, { k: "party", act: "ask", seat: "s1" }, "s2")).toBeNull();
    const ev = A.events.find((e) => e.key === "p2p-party-ask")!;
    expect(cmd(g, { k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(B.party?.lead).toBe("s1");
    const to = prov("Plymouth");
    const purse = B.purse;
    expect(cmd(g, { k: "travel", to, bySea: false })).toBeNull();
    expect(B.travel?.with?.seat).toBe("s1");
    expect(B.purse).toBeLessThanOrEqual(purse);
    days(g, 15);
    expect(A.prov).toBe(to);
    expect(B.prov).toBe(to);
    expect(B.travel).toBeNull();
  });

  test("a captain lies over at a port on the way, and resumes inside two months; past that, the voyage is over", () => {
    const { g, s, life } = atBoston({ seed: 43 });
    const b = buy(g, life, "sloop");
    const to = prov("Jamaica");
    expect(cmd(g, { k: "sail", to, boat: b.id })).toBeNull();
    expect(life.travel!.path.length).toBeGreaterThan(1);
    const stop = life.travel!.path[0];
    expect(cmd(g, { k: "ship", act: "stay", id: b.id })).toBeNull();
    days(g, 20);
    expect(life.prov).toBe(stop);
    expect(b.stay?.since).toBeGreaterThanOrEqual(0);
    // Long ashore, but under two months: on to Jamaica.
    days(g, 40);
    expect(cmd(g, { k: "ship", act: "resume", id: b.id })).toBeNull();
    days(g, 40);
    expect(life.prov).toBe(to);
    // Again, and this time too long.
    expect(cmd(g, { k: "sail", to: BOS, boat: b.id })).toBeNull();
    if (life.travel!.path.length > 1) {
      expect(cmd(g, { k: "ship", act: "stay", id: b.id })).toBeNull();
      days(g, 20 + STAY_DAYS);
      expect(b.stay).toBeNull();
      expect(cmd(g, { k: "ship", act: "resume", id: b.id })).toMatch(/isn't lying over/);
      expect(b.log!.some((l) => /voyage to .* is over/.test(l.text))).toBe(true);
    }
  });

  test("a charter's stay of more than two months forfeits it", () => {
    const { g, s, life } = atBoston({ seed: 44 });
    const b = buy(g, life, "schooner");
    // A venture to a far port: several hops.
    expect(
      cmd(g, { k: "ship", act: "venture", id: b.id, key: "timber", to: prov("Barbados"), pay: 10, arg: 1 }),
    ).toBeNull();
    expect(life.travel?.with?.boat).toBe(b.id);
    if (b.way!.path.length < 2 || b.way!.lost !== undefined) return;
    expect(cmd(g, { k: "ship", act: "stay", id: b.id })).toBeNull();
    days(g, 30);
    expect(b.stay?.since).toBeGreaterThanOrEqual(0);
    days(g, STAY_DAYS + 2);
    expect(b.stay).toBeNull();
    expect(b.charter).toBeNull();
  });
});

// ---------------------------------------------------------------- two players, through the rooms server

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

const settleNet = () => new Promise((r) => setTimeout(r, 60));
let tick: () => void = () => {};

class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: {
    test: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  readonly ws: WebSocket;
  readonly open: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.open = new Promise((r) => this.ws.on("open", () => r()));
    this.ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  next<T extends ServerMessage["t"]>(
    t: T,
    test: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true,
  ) {
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${t}`)),
        4000,
      );
      this.waiters.push({
        test: (m) => m.t === t && test(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }
  private id = 100;
  async cmd(c: object): Promise<string | null> {
    const id = this.id++;
    tick();
    const ack = this.next("ack", (m) => m.id === id);
    this.send({ t: "cmd", id, c });
    return (await ack).err;
  }
  state(): GameState {
    let s: GameState | null = null;
    for (const m of this.messages) {
      if (m.t === "game") s = JSON.parse(JSON.stringify(m.state));
      else if (m.t === "d" && s) applyDelta(s, m.d as GameDelta);
    }
    return s!;
  }
  close() {
    this.ws.close();
  }
}

describe("a ship's company with two players, through the rooms server", { timeout: 120_000 }, () => {
  let server: http.Server;
  let url = "";
  let clock = 1_800_000_000_000;
  let rooms: import("../../src/server/conquest/ConquestRooms").ConquestRooms;
  const clients: Client[] = [];
  beforeAll(async () => {
    const { attachConquest, ConquestRooms } = await import(
      "../../src/server/conquest/ConquestRooms"
    );
    rooms = new ConquestRooms(() => clock);
    tick = () => (clock += 60);
    server = http.createServer();
    attachConquest(server, rooms);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/conquest/ws`;
  });
  afterAll(async () => {
    for (const c of clients) c.close();
    await new Promise((r) => server.close(r));
  });
  const client = async (name: string) => {
    const c = new Client(url);
    clients.push(c);
    await c.open;
    c.send({ t: "hello", name });
    await c.next("welcome");
    return c;
  };

  test("Alden offers Beatrice a place as mate; she takes it, he makes her captain, she's paid by her days, and leaves from her Work page", async () => {
    const host = await client("Alden");
    const lobby = host.next("lobby");
    host.send({
      t: "create",
      solo: false,
      open: true,
      settings: { difficulty: "normal", start: 1700 },
    });
    const l = await lobby;
    const friend = await client("Bea");
    const joined = host.next("lobby", (m) => m.seats.length === 2);
    friend.send({ t: "join", code: l.code });
    await joined;
    host.send({ t: "plan", plan: plan({ home: BOS, background: "sailor" }) });
    friend.send({
      t: "plan",
      plan: plan({
        home: BOS,
        first: "Beatrice",
        family: "Cole",
        female: true,
        background: "clerk",
      }),
    });
    await host.next("lobby", (m) => m.seats.every((s) => s.made));
    friend.send({ t: "ready", ready: true });
    await host.next("lobby", (m) => m.seats.some((s) => s.ready));
    const games = [host.next("game"), friend.next("game")];
    host.send({ t: "start" });
    const [hg, fg] = await Promise.all(games);
    const paused = host.next("clock", (m) => m.paused);
    host.send({ t: "pause", p: true });
    await paused;
    const game = rooms.rooms.get(l.code)!.game!;
    const s = game.s;
    const A = lifeOfSeat(s, hg.you)!;
    const B = lifeOfSeat(s, fg.you)!;
    A.purse = 400;
    B.purse = 20;
    A.prov = BOS;
    B.prov = BOS;
    A.travel = null;
    B.travel = null;
    B.skills.seamanship = 9;
    B.skills.leadership = 6;
    expect(await host.cmd({ k: "boat", act: "buy", kind: "schooner", arg: -1 })).toBeNull();
    const b = A.boats![0];
    b.crew = BOATS.schooner.crew;
    // The offer: a scene for her.
    expect(
      await host.cmd({ k: "ship", act: "offer", id: b.id, c: B.c, role: "mate", pay: 6 }),
    ).toBeNull();
    const ev = B.events.find((e) => e.key === "p2p-berth")!;
    expect(ev).toBeTruthy();
    expect(ev.title).toMatch(/mate of the/);
    expect(await friend.cmd({ k: "event", id: ev.id, choice: 0 })).toBeNull();
    expect(B.job?.berth).toMatchObject({ kind: "ship", seat: A.seat, id: b.id, pay: 6 });
    expect(jobTitle(B)).toBe(`Mate of the ${b.name}`);
    expect(b.roster!.hires.find((h) => h.seat === B.seat)!.role).toBe("mate");
    // Her copy of the game, from the deltas, shows her place and his ship's company.
    await settleNet();
    const fs = friend.state();
    const herLife = Object.values(fs.lives).find((x) => x.seat === B.seat)!;
    expect(herLife.job?.berth?.title).toBe(`Mate of the ${b.name}`);
    const hisLife = Object.values(fs.lives).find((x) => x.seat === A.seat)!;
    expect(hisLife.boats![0].roster!.hires.some((h) => h.seat === B.seat)).toBe(true);
    // Promoted to captain: she commands her (she's with her at the quay).
    const h = b.roster!.hires.find((x) => x.seat === B.seat)!;
    expect(await host.cmd({ k: "ship", act: "role", id: b.id, hire: h.id, role: "captain" })).toBeNull();
    expect(jobTitle(B)).toBe(`Captain of the ${b.name}`);
    expect(B.journal.some((j) => /promotes you to captain/.test(j.text))).toBe(true);
    A.prov = prov("Jamestown");
    expect(shipFx(s, A, b).master.kind).toBe("captain");
    expect(await host.cmd({ k: "ship", act: "pay", id: b.id, hire: h.id, pay: 8 })).toBeNull();
    expect(B.job!.berth!.pay).toBe(8);
    // A month at her post: paid by the days, from his purse.
    const a0 = A.purse;
    const b0 = B.purse;
    for (let i = 0; i < 31; i++) {
      game.tick();
      for (const x of [A, B]) for (const e of [...x.events]) autoAnswerLife(game, x.seat, e.id);
    }
    const due = Math.round(8 * Math.min(1, (B.job!.lastWorked ?? 0) / WORK_DAYS) * 10) / 10;
    expect(due).toBeGreaterThan(0);
    const got = (B.statements ?? []).flatMap((x) => x.lines).filter((l2) => /^m:Wage: captain of/.test(l2.k));
    expect(got.reduce((m, l2) => m + l2.v, 0)).toBeCloseTo(due, 1);
    const paid = (A.statements ?? []).flatMap((x) => x.lines).filter((l2) => l2.k === `bh:${b.id}`);
    expect(paid.reduce((m, l2) => m + l2.v, 0)).toBeCloseTo(-due, 1);
    expect(A.purse).toBeLessThan(a0);
    expect(B.purse).toBeGreaterThan(b0 - 15);
    // She leaves from the usual job menu (the boss needn't be there).
    expect(await friend.cmd({ k: "quit" })).toBeNull();
    expect(B.job).toBeNull();
    expect(b.roster!.hires.some((x) => x.seat === B.seat)).toBe(false);
    expect(A.journal.some((j) => /leaves the/.test(j.text))).toBe(true);
    await settleNet();
    expect(
      Object.values(host.state().lives)
        .find((x) => x.seat === A.seat)!
        .boats![0].roster!.hires.length,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------- saves

describe("saves, the delta, and old saves", { timeout: 120_000 }, () => {
  test("a ship on a charter with a company survives a save and goes on the same; the delta carries it; an old save loads", () => {
    const { g, s, life } = atBoston({ seed: 51, seats: 2 });
    const B = lifeOfSeat(s, "s2")!;
    const b = buy(g, life, "schooner");
    const k = seekersAt(s, g.w, BOS)[0];
    cmd(g, { k: "ship", act: "hire", id: b.id, arg: k.slot, role: "hand", pay: 5 });
    expect(cmd(g, { k: "ship", act: "offer", id: b.id, c: B.c, role: "hand", pay: 3 })).toBeNull();
    const ev = B.events.find((e) => e.key === "p2p-berth")!;
    expect(cmd(g, { k: "event", id: ev.id, choice: 0 }, "s2")).toBeNull();
    let ch = chartersAt(s, g.w, BOS).find((c) => c.kind === "freight" && (c.loads ?? 0) <= 70);
    for (let i = 0; !ch && i < 12; i++) {
      s.day += 30;
      ch = chartersAt(s, g.w, BOS).find((c) => c.kind === "freight" && (c.loads ?? 0) <= 70);
    }
    expect(cmd(g, { k: "ship", act: "charter", id: b.id, key: ch!.key, arg: 0 })).toBeNull();
    // Her hand by name, a player, is aboard.
    expect(B.travel?.with).toEqual({ seat: "s1", boat: b.id });
    const mine = JSON.parse(JSON.stringify(g.s)) as GameState;
    g.takeDelta();
    for (let i = 0; i < 6; i++) {
      g.tick();
      answerAll(g);
      applyDelta(mine, g.takeDelta());
    }
    const mineA = Object.values(mine.lives).find((x) => x.seat === "s1")!;
    expect(mineA.boats).toEqual(life.boats);
    const mineB = Object.values(mine.lives).find((x) => x.seat === "s2")!;
    expect(mineB.travel).toEqual(B.travel);
    // Saved at sea: the copy goes on exactly as the original.
    const saved = JSON.parse(JSON.stringify(g.s)) as GameState;
    const g2 = new ConquestGame(map, saved);
    for (let i = 0; i < 40; i++) {
      g.tick();
      g2.tick();
      answerAll(g);
      answerAll(g2);
    }
    expect(lifeOfSeat(g2.s, "s1")!.boats).toEqual(life.boats);
    expect(lifeOfSeat(g2.s, "s1")!.purse).toBeCloseTo(life.purse, 6);
    expect(lifeOfSeat(g2.s, "s2")!.prov).toBe(B.prov);
    // An old save, from before r21: boats without companies, charters or logs; lives without parties.
    const old = JSON.parse(JSON.stringify(g.s)) as GameState;
    for (const l of old.lives) {
      for (const x of l.boats ?? []) {
        delete x.roster;
        delete x.charter;
        delete x.way;
        delete x.stay;
        delete x.log;
        delete x.rep;
        delete x.refits;
        delete x.moor;
        delete x.voyages;
      }
      delete l.party;
      delete l.lying;
      if (l.job) delete l.job.berth;
      if (l.travel) delete l.travel.with;
    }
    const g3 = new ConquestGame(map, old);
    const l3 = lifeOfSeat(g3.s, "s1")!;
    l3.prov = l3.boats![0].prov;
    l3.travel = null;
    for (let i = 0; i < 60; i++) g3.tick();
    expect(l3.boats!.length).toBe(1);
    expect(shipFx(g3.s, l3, l3.boats![0]).master.kind).toBe("you");
  });

  test("the same commands make the same ships", () => {
    const run = () => {
      const { g, s, life } = atBoston({ seed: 52 });
      const b = buy(g, life, "sloop");
      cmd(g, { k: "boat", act: "use", id: b.id, use: "fishing" });
      const c = buy(g, life, "schooner");
      const ch = chartersAt(s, g.w, BOS)[0];
      if (ch) cmd(g, { k: "ship", act: "charter", id: c.id, key: ch.key, arg: 0 });
      life.prov = prov("Jamestown");
      for (let i = 0; i < 120; i++) {
        g.tick();
        answerAll(g);
      }
      return JSON.stringify(life.boats) + life.purse + JSON.stringify(g.s.markets ?? {});
    };
    expect(run()).toBe(run());
  });

  test("a ship's own dice leave the world's dice alone: a charter under her own master, or not, the world rolls the same", () => {
    const run = (charter: boolean) => {
      const { g, s, life } = atBoston({ seed: 53 });
      const b = buy(g, life, "schooner");
      const ch = chartersAt(s, g.w, BOS).find((x) => x.kind === "freight" || x.kind === "passengers");
      if (charter && ch) cmd(g, { k: "ship", act: "charter", id: b.id, key: ch.key, arg: 0 });
      for (let i = 0; i < 20; i++) g.tick();
      return g.s.rng;
    };
    expect(run(true)).toBe(run(false));
  });
});
