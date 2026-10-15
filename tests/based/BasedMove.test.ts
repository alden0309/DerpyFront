// BFIX (r23): how people move. A real run (about 5 m/s); paths with their
// corners rounded, followed by a walker that eases up to pace and down to
// a stop, turns at a limited rate (never snapping round), slows while he's
// turned away (stepping round rather than sliding), and arrives where he
// meant to, facing what he came to; the walk and run clips played to the
// stride, so a planted foot stays planted (measured on the base body and
// the owner's model, walking and running); and the people sit on a seat at
// its height.

import fs from "fs";
import path from "path";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, test } from "vitest";
import {
  LOOKS,
  measureStride,
  peopleAssets,
  Person,
  Rig,
  RUN_SPEED,
  WALK_SPEED,
} from "../../src/based/client/world/People";
import { navFor, NavGrid, P } from "../../src/based/engine/Nav";
import { PlaceDef } from "../../src/based/engine/Place";
import { seats } from "../../src/based/engine/Solid";
import {
  ARRIVE,
  roundCorners,
  RUN,
  WALK,
  Walker,
} from "../../src/based/engine/Walk";

const ROOT = path.resolve(__dirname, "../..");
const MODELS = path.join(ROOT, "src/based/models");

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Walks a walker to the end; every step's position and heading. */
function walkAll(
  w: Walker,
  pts: P[],
  gait = WALK,
  face: number | null = null,
  dt = 1 / 60,
): { x: number; z: number; h: number; v: number }[] {
  w.go(pts, gait, face);
  const out = [{ x: w.x, z: w.z, h: w.heading, v: w.speed }];
  for (let i = 0; i < 20000 && w.moving; i++) {
    w.step(dt);
    out.push({ x: w.x, z: w.z, h: w.heading, v: w.speed });
  }
  return out;
}

describe("the pace", () => {
  test("a real run, about five metres a second; a tired man's walk", () => {
    expect(RUN_SPEED).toBeGreaterThanOrEqual(5);
    expect(RUN_SPEED).toBeLessThanOrEqual(5.5);
    expect(WALK_SPEED).toBeCloseTo(1.15, 2);
    expect(RUN.speed).toBe(RUN_SPEED);
  });
});

describe("the walker", () => {
  test("eases up to pace and down to a stop, exactly where he meant to", () => {
    const w = new Walker(0, 0, 0);
    const t = walkAll(w, [[0, 6]]);
    // Not at full pace on the first step, nor the last.
    expect(t[1].v).toBeLessThan(0.15 * WALK.speed);
    expect(Math.max(...t.map((s) => s.v))).toBeCloseTo(WALK.speed, 3);
    // No jump in pace: at most accel (or the stronger braking) a step,
    // and the last, onto the spot, from a crawl.
    for (let i = 1; i < t.length - 1; i++) {
      expect(Math.abs(t[i].v - t[i - 1].v)).toBeLessThan(
        WALK.decel * 1.6 * (1 / 60) + 1e-6,
      );
    }
    expect(t[t.length - 2].v).toBeLessThan(0.2);
    // Never past the end; there within the tolerance.
    expect(Math.max(...t.map((s) => s.z))).toBeLessThanOrEqual(6 + 1e-9);
    expect(Math.hypot(w.x, w.z - 6)).toBeLessThan(ARRIVE);
    expect(w.speed).toBe(0);
    // About as long as it should take (6 m at 1.15, plus easing).
    expect(t.length / 60).toBeGreaterThan(6 / WALK.speed);
    expect(t.length / 60).toBeLessThan(6 / WALK.speed + 1.6);
  });

  test("rounds a corner and turns while walking, never snapping round", () => {
    const nav = new NavGrid([-5, -5, 10, 10], 0.25, [[1, 1, 9, 9]]);
    const raw = nav.path([0, 0], [5, 9.6])!;
    expect(raw.length).toBeGreaterThan(2);
    const curve = roundCorners(raw, (a, b) => nav.clear(a, b));
    // Rounded: more points than corners, and still clear of the block.
    expect(curve.length).toBeGreaterThan(raw.length);
    for (let i = 1; i < curve.length; i++) {
      expect(nav.clear(curve[i - 1], curve[i])).toBe(true);
    }
    const w = new Walker(0, 0, 0);
    const t = walkAll(w, curve.slice(1));
    let most = 0;
    for (let i = 1; i < t.length; i++) {
      most = Math.max(most, Math.abs(wrap(t[i].h - t[i - 1].h)));
      // Each step no further than the pace allows.
      expect(Math.hypot(t[i].x - t[i - 1].x, t[i].z - t[i - 1].z)).toBeLessThan(
        WALK.speed / 60 + 1e-6,
      );
    }
    // r22 turned up to 38 degrees in a frame at a corner; now at most the turn rate.
    expect(most).toBeLessThanOrEqual(WALK.turn / 60 + 1e-9);
    expect(Math.hypot(w.x - 5, w.z - 9.6)).toBeLessThan(ARRIVE);
  });

  test("turned away, he steps round before he goes, not backwards", () => {
    const w = new Walker(0, 0, Math.PI); // facing -z
    const t = walkAll(w, [[0, 4]]);
    // While he's turned more than 100 degrees from the way, hardly moving.
    for (const s of t) {
      const off = Math.abs(wrap(Math.atan2(0, 1) - s.h));
      if (off > 1.75) expect(s.v).toBeLessThanOrEqual(0.08 * WALK.speed + 1e-9);
    }
    // Round within about half a second.
    const round = t.findIndex((s) => Math.abs(wrap(s.h)) < 0.2);
    expect(round / 60).toBeLessThan(0.75);
  });

  test("arrives facing what he came to", () => {
    const w = new Walker(0, 0, 0);
    walkAll(w, [[0, 3]], WALK, Math.PI / 2);
    // The last of the turn happens standing (Person.face), but most of it walking.
    expect(Math.abs(wrap(w.heading - Math.PI / 2))).toBeLessThan(0.6);
  });

  test("a run: up to pace and down again without a jolt", () => {
    const w = new Walker(0, 0, 0);
    const t = walkAll(w, [[0, 20]], RUN);
    expect(Math.max(...t.map((s) => s.v))).toBeCloseTo(RUN.speed, 3);
    expect(t[1].v).toBeLessThan(0.2 * RUN.speed);
    expect(Math.hypot(w.x, w.z - 20)).toBeLessThan(ARRIVE);
  });

  test("a new course while walking keeps his pace", () => {
    const w = new Walker(0, 0, 0);
    w.go([[0, 5]], WALK);
    for (let i = 0; i < 90; i++) w.step(1 / 60);
    const v = w.speed;
    expect(v).toBeGreaterThan(1);
    w.go([[0.5, 5]], WALK);
    w.step(1 / 60);
    expect(w.speed).toBeGreaterThan(v - 0.1);
  });
});

/** A GLB without its pictures (nothing here decodes images). */
function withoutTextures(buf: Buffer): ArrayBuffer {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  delete json.textures;
  delete json.images;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.pbrMetallicRoughness?.baseColorTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete m.normalTexture;
  }
  json.extensionsUsed = (json.extensionsUsed ?? []).filter(
    (e: string) => e !== "EXT_texture_webp",
  );
  json.extensionsRequired = (json.extensionsRequired ?? []).filter(
    (e: string) => e !== "EXT_texture_webp",
  );
  let text = Buffer.from(JSON.stringify(json));
  const pad = (4 - (text.length % 4)) % 4;
  text = Buffer.concat([text, Buffer.alloc(pad, 0x20)]);
  const rest = buf.subarray(20 + jsonLen);
  const head = Buffer.alloc(20);
  head.write("glTF", 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + rest.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([head, text, rest]);
  const ab = new ArrayBuffer(out.length);
  new Uint8Array(ab).set(out);
  return ab;
}

async function load(key: string): Promise<GLTF> {
  const buf = fs.readFileSync(path.join(MODELS, `${key}.glb`));
  return new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(withoutTextures(buf), "");
}

describe("the legs keep to the ground", () => {
  let rigs: { m: Rig; f: Rig };
  let gestures: Map<string, THREE.AnimationClip>;
  beforeAll(async () => {
    const models: Record<string, GLTF> = {};
    for (const k of ["body_m", "body_f", "anims", "mr_based", "bartender"]) {
      models[k] = await load(k);
    }
    ({ rigs, gestures } = peopleAssets(models, null));
  }, 60_000);

  /** A person walking (or running) straight, frame by frame: the planted foot's slide. */
  async function slide(
    look: (typeof LOOKS)[string],
    run: boolean,
  ): Promise<{ slide: number; pace: number }> {
    let pace = 0;
    const p = new Person(
      "X",
      look.body === "f" ? rigs.f : rigs.m,
      look,
      gestures,
    );
    await new Promise((r) => setTimeout(r, 20)); // their own model, if any
    p.place(new THREE.Vector3(0, 0, 0), 0, "stand");
    p.setGait(run ? "run" : "walk");
    p.walk([new THREE.Vector3(0, 0, run ? 40 : 12)]);
    const dt = 1 / 60;
    const feet = [
      p.bone("ball_l") ?? p.bone("foot_l"),
      p.bone("ball_r") ?? p.bone("foot_r"),
    ];
    const rec: { y: number[]; x: number; z: number }[][] = [[], []];
    const v = new THREE.Vector3();
    for (let i = 0; i < 600 && p.walking; i++) {
      p.update(dt, i * dt);
      p.root.updateMatrixWorld(true);
      // Only at pace (not easing up or down).
      pace = Math.max(pace, p.speed);
      if (p.speed < p.pace * 0.98) continue;
      feet.forEach((f, k) => {
        f!.getWorldPosition(v);
        rec[k].push({ y: [v.y], x: v.x, z: v.z });
      });
    }
    // The planted foot: within 1.5 cm of its lowest; how fast it moves over the ground.
    const speeds: number[] = [];
    for (const r of rec) {
      const lo = Math.min(...r.map((s) => s.y[0]));
      for (let i = 1; i < r.length; i++) {
        if (r[i].y[0] < lo + 0.015 && r[i - 1].y[0] < lo + 0.015) {
          speeds.push(
            Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) / dt,
          );
        }
      }
    }
    speeds.sort((a, b) => a - b);
    p.dispose();
    return { slide: speeds[Math.floor(speeds.length / 2)], pace };
  }

  test.each([
    ["the base man", "suit_grey"],
    ["Mr. Based (the owner's model)", "field_jacket"],
    ["the barman (the owner's model)", "barman"],
  ])(
    "%s walks and runs without sliding",
    async (_, name) => {
      const look = LOOKS[name];
      const w = await slide(look, false);
      const r = await slide(look, true);
      // r22: the walk slid 0.12 m/s (10 per cent), the run 3.2 m/s (124 per cent).
      expect(w.slide, "walk").toBeLessThan(0.05 * w.pace);
      expect(r.slide, "run").toBeLessThan(0.08 * r.pace);
    },
    60_000,
  );

  test("each clip's stride: the run plays near its own rate at a real run", () => {
    const p = new Person("X", rigs.m, LOOKS.suit_grey, gestures);
    const clips = rigs.m.clips;
    const stride = (name: string) =>
      measureStride(
        p.root.children[0],
        clips.find((c) => c.name === name)!,
        (n) => p.bone(n),
        p.root,
      )!;
    const walk = stride("walk");
    const run = stride("run");
    // The clips' own paces (metres a second at 1x).
    const walkPace = walk.length / walk.duration;
    const runPace = run.length / run.duration;
    expect(walkPace).toBeGreaterThan(0.7);
    expect(walkPace).toBeLessThan(1.3);
    // The jog clip's feet move at a real run's pace: r22 played it at 2.6 m/s.
    expect(runPace).toBeGreaterThan(4.5);
    // At the game's paces the clips play between 0.7x and 1.4x their own rate.
    expect(WALK_SPEED / walkPace).toBeGreaterThan(0.7);
    expect(WALK_SPEED / walkPace).toBeLessThan(1.4);
    expect(RUN_SPEED / runPace).toBeGreaterThan(0.7);
    expect(RUN_SPEED / runPace).toBeLessThan(1.4);
    p.dispose();
  });

  test.each([
    ["the man in grey", "suit_grey"],
    ["the woman in the corner", "wool_woman"],
    ["Mr. Based", "field_jacket"],
  ])(
    "%s sits on a stool and a chair, not in them or above them",
    async (_, name) => {
      const look = LOOKS[name];
      const p = new Person(
        "X",
        look.body === "f" ? rigs.f : rigs.m,
        look,
        gestures,
      );
      await new Promise((r) => setTimeout(r, 20));
      const fit = p.seatFit();
      for (const seat of [0.774, 0.47]) {
        p.place(new THREE.Vector3(0, 0, 0), 0, "sit", seat);
        for (let i = 0; i < 30; i++) p.update(1 / 30, i / 30);
        // What rests on the seat is at the seat's height.
        expect(fit.y + p.root.position.y).toBeCloseTo(seat, 2);
      }
      expect(fit.back).toBeGreaterThan(0.1);
      expect(fit.back).toBeLessThan(0.4);
      p.dispose();
    },
  );
});

describe("the seats", () => {
  const place = (k: string) =>
    JSON.parse(
      fs.readFileSync(path.join(ROOT, `src/based/places/${k}.json`), "utf8"),
    ) as PlaceDef;

  test("the bar's eleven stools at 0.77 m, its chairs at 0.47; each stool's mark by its stool", () => {
    const v = place("vauban");
    const s = seats(v);
    const stools = s.filter((x) => x.what === "stoolBar");
    expect(stools.length).toBe(11);
    for (const st of stools) expect(st.y).toBeCloseTo(0.774, 2);
    for (const st of s.filter((x) => x.what === "chair")) {
      expect(st.y).toBeCloseTo(0.47, 2);
      expect(st.facing).not.toBeNull();
    }
    for (const [name, m] of Object.entries(v.marks)) {
      if (!m.seat) continue;
      const near = Math.min(
        ...s.map((st) => Math.hypot(st.x - m.at[0], st.z - m.at[1])),
      );
      expect(near, name).toBeLessThan(0.6);
    }
    // A seat stands where nobody walks; beside it, he can stand.
    const nav = navFor(v);
    for (const st of s) {
      expect(nav.walkable(st.x, st.z), st.what).toBe(false);
      expect(nav.nearestFree(st.x, st.z), st.what).not.toBeNull();
    }
  });
});
