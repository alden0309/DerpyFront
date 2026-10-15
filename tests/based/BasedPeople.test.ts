// BPEOPLE (r22): Mr. Based's people. The bone maps and retargeting (the
// game's clips resolve on every kind of skeleton the owner might bring),
// the looks (every one cuts, within its budget, with sound skinning), the
// models (small, compressed, credited) and the hooks the world calls
// (wetness, walking and running).

import fs from "fs";
import path from "path";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, test } from "vitest";
import {
  CAST_MODELS,
  LOOK_NAMES,
  lookFor,
  LOOKS,
  MODEL_LIMIT,
  PEOPLE_MODELS,
  peopleAssets,
  Person,
  prepareCustom,
  Rig,
  RUN_SPEED,
  WALK_SPEED,
} from "../../src/based/client/world/People";
import {
  CANON,
  ESSENTIAL,
  mapBones,
  readBoneName,
  retargetClip,
} from "../../src/based/client/world/people/Retarget";
import { tailor } from "../../src/based/client/world/people/Tailor";

const ROOT = path.resolve(__dirname, "../..");
const MODELS = path.join(ROOT, "src/based/models");

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
  // A fresh ArrayBuffer of this realm (the loader checks instanceof).
  const ab = new ArrayBuffer(out.length);
  new Uint8Array(ab).set(out);
  return ab;
}

async function load(key: string): Promise<GLTF> {
  const buf = fs.readFileSync(path.join(MODELS, `${key}.glb`));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(withoutTextures(buf), "");
}

/** A humanoid skeleton from a list of [name, parent, x, y, z] (world rest). */
function skeleton(
  bones: [string, string | null, number, number, number][],
  turn?: (name: string) => THREE.Quaternion | null,
): THREE.Group {
  const root = new THREE.Group();
  const made = new Map<string, THREE.Bone>();
  const world = new Map<string, THREE.Vector3>();
  for (const [name, parent, x, y, z] of bones) {
    const b = new THREE.Bone();
    b.name = name;
    const w = new THREE.Vector3(x, y, z);
    world.set(name, w);
    const p = parent ? made.get(parent)! : null;
    (p ?? root).add(b);
    b.position.copy(p ? w.clone().sub(world.get(parent!)!) : w);
    made.set(name, b);
  }
  // Local frames that differ from rig to rig: turn a bone, and undo it
  // for its children (so the joints stay where they are).
  if (turn) {
    for (const [name] of bones) {
      const q = turn(name);
      if (!q) continue;
      const b = made.get(name)!;
      b.quaternion.premultiply(q);
      for (const c of b.children) {
        c.position.applyQuaternion(q.clone().invert());
        c.quaternion.premultiply(q.clone().invert());
      }
    }
  }
  root.updateMatrixWorld(true);
  return root;
}

/** Quaternius' rig (the clips' own), in a T-pose. */
function ualSkeleton(): THREE.Group {
  return skeleton([
    ["root", null, 0, 0, 0],
    ["pelvis", "root", 0, 0.92, 0],
    ["spine_01", "pelvis", 0, 1.0, 0],
    ["spine_02", "spine_01", 0, 1.15, 0],
    ["spine_03", "spine_02", 0, 1.3, 0],
    ["neck_01", "spine_03", 0, 1.48, 0],
    ["Head", "neck_01", 0, 1.57, 0],
    ["clavicle_l", "spine_03", 0.04, 1.42, 0],
    ["upperarm_l", "clavicle_l", 0.19, 1.44, 0],
    ["lowerarm_l", "upperarm_l", 0.46, 1.44, 0],
    ["hand_l", "lowerarm_l", 0.72, 1.44, 0],
    ["clavicle_r", "spine_03", -0.04, 1.42, 0],
    ["upperarm_r", "clavicle_r", -0.19, 1.44, 0],
    ["lowerarm_r", "upperarm_r", -0.46, 1.44, 0],
    ["hand_r", "lowerarm_r", -0.72, 1.44, 0],
    ["thigh_l", "pelvis", 0.09, 0.9, 0],
    ["calf_l", "thigh_l", 0.09, 0.5, 0],
    ["foot_l", "calf_l", 0.09, 0.1, 0],
    ["ball_l", "foot_l", 0.09, 0.02, 0.12],
    ["thigh_r", "pelvis", -0.09, 0.9, 0],
    ["calf_r", "thigh_r", -0.09, 0.5, 0],
    ["foot_r", "calf_r", -0.09, 0.1, 0],
    ["ball_r", "foot_r", -0.09, 0.02, 0.12],
  ]);
}

/** Other rigs' names for the same bones (Mixamo, Meshy/Tripo, VRM, Rigify, Biped). */
const NAMINGS: Record<string, Record<string, string>> = {
  mixamo: {
    pelvis: "mixamorigHips",
    spine_01: "mixamorigSpine",
    spine_02: "mixamorigSpine1",
    spine_03: "mixamorigSpine2",
    neck_01: "mixamorigNeck",
    Head: "mixamorigHead",
    clavicle_l: "mixamorigLeftShoulder",
    upperarm_l: "mixamorigLeftArm",
    lowerarm_l: "mixamorigLeftForeArm",
    hand_l: "mixamorigLeftHand",
    clavicle_r: "mixamorigRightShoulder",
    upperarm_r: "mixamorigRightArm",
    lowerarm_r: "mixamorigRightForeArm",
    hand_r: "mixamorigRightHand",
    thigh_l: "mixamorigLeftUpLeg",
    calf_l: "mixamorigLeftLeg",
    foot_l: "mixamorigLeftFoot",
    ball_l: "mixamorigLeftToeBase",
    thigh_r: "mixamorigRightUpLeg",
    calf_r: "mixamorigRightLeg",
    foot_r: "mixamorigRightFoot",
    ball_r: "mixamorigRightToeBase",
  },
  // Meshy's and Tripo's auto-rigs name bones the Mixamo way, without the prefix.
  meshy: {
    pelvis: "Hips",
    spine_01: "Spine",
    spine_02: "Spine01",
    spine_03: "Spine02",
    neck_01: "neck",
    Head: "Head",
    clavicle_l: "LeftShoulder",
    upperarm_l: "LeftArm",
    lowerarm_l: "LeftForeArm",
    hand_l: "LeftHand",
    clavicle_r: "RightShoulder",
    upperarm_r: "RightArm",
    lowerarm_r: "RightForeArm",
    hand_r: "RightHand",
    thigh_l: "LeftUpLeg",
    calf_l: "LeftLeg",
    foot_l: "LeftFoot",
    ball_l: "LeftToeBase",
    thigh_r: "RightUpLeg",
    calf_r: "RightLeg",
    foot_r: "RightFoot",
    ball_r: "RightToeBase",
  },
  tripo: {
    pelvis: "Pelvis",
    spine_01: "Spine",
    spine_02: "Chest",
    spine_03: "UpperChest",
    neck_01: "Neck",
    Head: "Head",
    clavicle_l: "L_Clavicle",
    upperarm_l: "L_UpperArm",
    lowerarm_l: "L_Forearm",
    hand_l: "L_Hand",
    clavicle_r: "R_Clavicle",
    upperarm_r: "R_UpperArm",
    lowerarm_r: "R_Forearm",
    hand_r: "R_Hand",
    thigh_l: "L_Thigh",
    calf_l: "L_Calf",
    foot_l: "L_Foot",
    ball_l: "L_Toe",
    thigh_r: "R_Thigh",
    calf_r: "R_Calf",
    foot_r: "R_Foot",
    ball_r: "R_Toe",
  },
  vrm: {
    pelvis: "J_Bip_C_Hips",
    spine_01: "J_Bip_C_Spine",
    spine_02: "J_Bip_C_Chest",
    spine_03: "J_Bip_C_UpperChest",
    neck_01: "J_Bip_C_Neck",
    Head: "J_Bip_C_Head",
    clavicle_l: "J_Bip_L_Shoulder",
    upperarm_l: "J_Bip_L_UpperArm",
    lowerarm_l: "J_Bip_L_LowerArm",
    hand_l: "J_Bip_L_Hand",
    clavicle_r: "J_Bip_R_Shoulder",
    upperarm_r: "J_Bip_R_UpperArm",
    lowerarm_r: "J_Bip_R_LowerArm",
    hand_r: "J_Bip_R_Hand",
    thigh_l: "J_Bip_L_UpperLeg",
    calf_l: "J_Bip_L_LowerLeg",
    foot_l: "J_Bip_L_Foot",
    ball_l: "J_Bip_L_ToeBase",
    thigh_r: "J_Bip_R_UpperLeg",
    calf_r: "J_Bip_R_LowerLeg",
    foot_r: "J_Bip_R_Foot",
    ball_r: "J_Bip_R_ToeBase",
  },
  rigify: {
    pelvis: "DEF-hips",
    spine_01: "DEF-spine",
    spine_02: "DEF-spine001",
    spine_03: "DEF-spine002",
    neck_01: "DEF-neck",
    Head: "DEF-head",
    clavicle_l: "DEF-shoulderL",
    upperarm_l: "DEF-upper_armL",
    lowerarm_l: "DEF-forearmL",
    hand_l: "DEF-handL",
    clavicle_r: "DEF-shoulderR",
    upperarm_r: "DEF-upper_armR",
    lowerarm_r: "DEF-forearmR",
    hand_r: "DEF-handR",
    thigh_l: "DEF-thighL",
    calf_l: "DEF-shinL",
    foot_l: "DEF-footL",
    ball_l: "DEF-toeL",
    thigh_r: "DEF-thighR",
    calf_r: "DEF-shinR",
    foot_r: "DEF-footR",
    ball_r: "DEF-toeR",
  },
  biped: {
    pelvis: "Bip01_Pelvis",
    spine_01: "Bip01_Spine",
    spine_02: "Bip01_Spine1",
    spine_03: "Bip01_Spine2",
    neck_01: "Bip01_Neck",
    Head: "Bip01_Head",
    clavicle_l: "Bip01_L_Clavicle",
    upperarm_l: "Bip01_L_UpperArm",
    lowerarm_l: "Bip01_L_Forearm",
    hand_l: "Bip01_L_Hand",
    clavicle_r: "Bip01_R_Clavicle",
    upperarm_r: "Bip01_R_UpperArm",
    lowerarm_r: "Bip01_R_Forearm",
    hand_r: "Bip01_R_Hand",
    thigh_l: "Bip01_L_Thigh",
    calf_l: "Bip01_L_Calf",
    foot_l: "Bip01_L_Foot",
    ball_l: "Bip01_L_Toe0",
    thigh_r: "Bip01_R_Thigh",
    calf_r: "Bip01_R_Calf",
    foot_r: "Bip01_R_Foot",
    ball_r: "Bip01_R_Toe0",
  },
};

/** Another rig: renamed, in an A-pose, with its own local axes, and twice the size. */
function otherSkeleton(names: Record<string, string>): THREE.Group {
  const src = ualSkeleton();
  const rows: [string, string | null, number, number, number][] = [];
  const s = 2;
  src.traverse((o) => {
    if (o === src) return;
    const w = o.getWorldPosition(new THREE.Vector3()).multiplyScalar(s);
    // Arms down 40 degrees from the shoulder (an A-pose).
    const side = /_l$/.test(o.name) ? 1 : -1;
    if (/^(lowerarm|hand)_/.test(o.name)) {
      const sh = src
        .getObjectByName(`upperarm_${side > 0 ? "l" : "r"}`)!
        .getWorldPosition(new THREE.Vector3())
        .multiplyScalar(s);
      const d = w.clone().sub(sh);
      d.applyAxisAngle(
        new THREE.Vector3(0, 0, 1),
        (-side * 40 * Math.PI) / 180,
      );
      w.copy(sh).add(d);
    }
    const parent = o.parent === src ? null : (o.parent as THREE.Object3D).name;
    const rename = (n: string | null) =>
      n ? (names[n] ?? `extra_${n}`) : null;
    rows.push([rename(o.name)!, rename(parent), w.x, w.y, w.z]);
  });
  // Y along the bone, Mixamo-style: every bone turned 90 degrees.
  return skeleton(rows, () =>
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    ),
  );
}

describe("bone names (r22)", () => {
  test("names are read for side and meaning", () => {
    expect(readBoneName("mixamorig:LeftForeArm")).toMatchObject({
      side: "l",
      core: "forearm",
    });
    expect(readBoneName("mixamorigRightUpLeg")).toMatchObject({
      side: "r",
      core: "upleg",
    });
    expect(readBoneName("upperarm_l")).toMatchObject({
      side: "l",
      core: "upperarm",
    });
    expect(readBoneName("J_Bip_R_LowerLeg")).toMatchObject({
      side: "r",
      core: "lowerleg",
    });
    expect(readBoneName("DEF-upper_arm.L")).toMatchObject({
      side: "l",
      core: "upperarm",
    });
    expect(readBoneName("Bip01 L Toe0")).toMatchObject({
      side: "l",
      core: "toe",
    });
    expect(readBoneName("LeftToe_End")).toMatchObject({ end: true });
    expect(readBoneName("neck_01")).toMatchObject({ side: null, core: "neck" });
  });

  test.each(Object.keys(NAMINGS))(
    "%s: every bone the clips move is found",
    (rig) => {
      const names = NAMINGS[rig];
      const { map, missing } = mapBones(otherSkeleton(names));
      expect(missing).toEqual([]);
      for (const c of CANON)
        expect(map.get(c)?.name, `${rig} ${c}`).toBe(names[c]);
    },
  );

  test("a rig with two spine bones and no clavicles still maps what matters", () => {
    const root = skeleton([
      ["Hips", null, 0, 1, 0],
      ["Spine", "Hips", 0, 1.1, 0],
      ["Chest", "Spine", 0, 1.3, 0],
      ["Neck", "Chest", 0, 1.5, 0],
      ["Head", "Neck", 0, 1.6, 0],
      ["LeftUpperArm", "Chest", 0.2, 1.45, 0],
      ["LeftLowerArm", "LeftUpperArm", 0.45, 1.45, 0],
      ["LeftHand", "LeftLowerArm", 0.7, 1.45, 0],
      ["RightUpperArm", "Chest", -0.2, 1.45, 0],
      ["RightLowerArm", "RightUpperArm", -0.45, 1.45, 0],
      ["RightHand", "RightLowerArm", -0.7, 1.45, 0],
      ["LeftUpperLeg", "Hips", 0.1, 0.95, 0],
      ["LeftLowerLeg", "LeftUpperLeg", 0.1, 0.5, 0],
      ["LeftFoot", "LeftLowerLeg", 0.1, 0.1, 0],
      ["RightUpperLeg", "Hips", -0.1, 0.95, 0],
      ["RightLowerLeg", "RightUpperLeg", -0.1, 0.5, 0],
      ["RightFoot", "RightLowerLeg", -0.1, 0.1, 0],
    ]);
    const { map, missing } = mapBones(root);
    expect(ESSENTIAL.filter((c) => missing.includes(c))).toEqual([]);
    expect(map.get("spine_01")?.name).toBe("Spine");
    expect(map.get("spine_03")?.name).toBe("Chest");
    expect(map.has("spine_02")).toBe(false);
  });
});

describe("retargeting (r22)", () => {
  // The source clip: the left arm swings down, the right thigh forward,
  // the hips drop 10 cm.
  const clip = new THREE.AnimationClip("test", 1, [
    new THREE.QuaternionKeyframeTrack(
      "upperarm_l.quaternion",
      [0, 1],
      [
        0,
        0,
        0,
        1,
        ...new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.2)
          .toArray(),
      ],
    ),
    new THREE.QuaternionKeyframeTrack(
      "thigh_r.quaternion",
      [0, 1],
      [
        0,
        0,
        0,
        1,
        ...new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.7)
          .toArray(),
      ],
    ),
    new THREE.VectorKeyframeTrack(
      "pelvis.position",
      [0, 1],
      [0, 0.92, 0, 0, 0.82, 0],
    ),
  ]);

  const dir = (root: THREE.Object3D, a: string, b: string) =>
    root
      .getObjectByName(b)!
      .getWorldPosition(new THREE.Vector3())
      .sub(root.getObjectByName(a)!.getWorldPosition(new THREE.Vector3()))
      .normalize();

  test.each(Object.keys(NAMINGS))(
    "%s: the clip's tracks all resolve, and the limbs point where the source's do",
    (rig) => {
      const names = NAMINGS[rig];
      const src = ualSkeleton();
      const tgt = otherSkeleton(names);
      const out = retargetClip(
        clip,
        { root: src, map: mapBones(src).map },
        { root: tgt, map: mapBones(tgt).map },
      );
      for (const t of out.tracks) {
        const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
        expect(THREE.PropertyBinding.findNode(tgt, node), t.name).toBeTruthy();
      }
      // Play both to the end.
      for (const [root, c] of [
        [src, clip],
        [tgt, out],
      ] as const) {
        const m = new THREE.AnimationMixer(root);
        m.clipAction(c).play();
        m.setTime(0.999);
        root.updateMatrixWorld(true);
      }
      const n = (c: string) => names[c];
      expect(
        dir(tgt, n("upperarm_l"), n("lowerarm_l")).distanceTo(
          dir(src, "upperarm_l", "lowerarm_l"),
        ),
      ).toBeLessThan(0.02);
      expect(
        dir(tgt, n("lowerarm_l"), n("hand_l")).distanceTo(
          dir(src, "lowerarm_l", "hand_l"),
        ),
      ).toBeLessThan(0.02);
      expect(
        dir(tgt, n("thigh_r"), n("calf_r")).distanceTo(
          dir(src, "thigh_r", "calf_r"),
        ),
      ).toBeLessThan(0.02);
      // The A-posed right arm, never animated, is lifted to the clips' T-pose.
      expect(dir(tgt, n("upperarm_r"), n("lowerarm_r")).x).toBeLessThan(-0.98);
      // The hips drop twice as far on a rig twice the size.
      const hips = tgt
        .getObjectByName(n("pelvis"))!
        .getWorldPosition(new THREE.Vector3());
      expect(hips.y).toBeCloseTo(2 * 0.92 - 2 * 0.1, 2);
    },
  );
});

describe("the people (r22)", () => {
  let rigs: { m: Rig; f: Rig };
  let gestures: Map<string, THREE.AnimationClip>;
  let anims: GLTF;

  beforeAll(async () => {
    const models: Record<string, GLTF> = {};
    for (const k of PEOPLE_MODELS) models[k] = await load(k);
    anims = models.anims;
    ({ rigs, gestures } = peopleAssets(models));
  }, 60_000);

  test("every clip resolves on both bodies, and there is a run", () => {
    const names = anims.animations.map((c) => c.name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "idle",
        "walk",
        "run",
        "sit",
        "sit_down",
        "stand_up",
        "talk",
        "lean",
        "fold_arms",
        "drink",
        "nod",
      ]),
    );
    for (const rig of [rigs.m, rigs.f]) {
      const p = new Person(
        "X",
        rig,
        rig === rigs.f ? LOOKS.wool_woman : LOOKS.suit_charcoal,
        gestures,
      );
      expect(rig.clips.length).toBe(anims.animations.length);
      for (const clip of rig.clips) {
        for (const t of clip.tracks) {
          const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
          expect(
            THREE.PropertyBinding.findNode(p.root, node),
            `${clip.name} ${t.name}`,
          ).toBeTruthy();
        }
      }
      p.dispose();
    }
  });

  test.each(LOOK_NAMES)("%s: cut within budget, skinned soundly", (name) => {
    const look = LOOKS[name];
    const kit = (look.body === "f" ? rigs.f : rigs.m).kit!;
    const cut = tailor(kit.anatomy, look);
    // One mesh a person; about 9,000 triangles (the face is most of it).
    expect(cut.triangles).toBeGreaterThan(3000);
    expect(cut.triangles).toBeLessThanOrEqual(11_000);
    const g = cut.geometry;
    const pos = g.getAttribute("position");
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    const box = new THREE.Box3().setFromBufferAttribute(
      pos as THREE.BufferAttribute,
    );
    expect(box.min.y).toBeGreaterThan(-0.03);
    expect(box.max.y).toBeLessThan(2.1);
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(
        true,
      );
      let w = 0;
      for (let k = 0; k < 4; k++) {
        w += sw.getComponent(i, k);
        expect(si.getComponent(i, k)).toBeLessThan(kit.template.bones.length);
      }
      expect(Math.abs(w - 1), `${name} vertex ${i}`).toBeLessThan(0.01);
    }
    // Clothes were cut, and the face is there.
    expect(cut.parts.body).toBeGreaterThan(1500);
    expect(cut.parts.head).toBeGreaterThan(500);
  });

  test("every look the story names exists", () => {
    const dir = path.join(ROOT, "src/based/story");
    const used = new Set<string>();
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".story"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of src.matchAll(/\b(?:look|wear)=([a-z0-9_]+)/g))
        used.add(m[1]);
      // And every model= is a model we have.
      for (const m of src.matchAll(/\bmodel=([a-z0-9_]+)/g)) {
        expect(fs.existsSync(path.join(MODELS, `${m[1]}.glb`)), m[1]).toBe(
          true,
        );
      }
    }
    expect([...used].filter((l) => !(l in LOOKS))).toEqual([]);
  });

  test("people walk, run and get wet", () => {
    const p = new Person("BASED", rigs.m, LOOKS.overcoat_charcoal, gestures);
    p.place(new THREE.Vector3(0, 0, 0), 0, "stand");
    expect(p.speed).toBe(0);
    expect(p.pace).toBe(WALK_SPEED);
    p.setGait("run");
    p.walk([new THREE.Vector3(0, 0, 12)]);
    expect(p.pace).toBe(RUN_SPEED);
    // BFIX (r23): he gets up to a run (not in one frame), and runs at it.
    p.update(1 / 30, 0);
    expect(p.speed).toBeGreaterThan(0);
    expect(p.speed).toBeLessThan(RUN_SPEED / 2);
    let top = 0;
    for (let i = 0; i < 60; i++) {
      p.update(1 / 30, i / 30);
      top = Math.max(top, p.speed);
    }
    expect(top).toBeCloseTo(RUN_SPEED, 2);
    // Running lasts until he gets there, and he stops where he meant to.
    for (let i = 0; i < 200 && p.walking; i++) p.update(1 / 30, 3 + i / 30);
    expect(p.walking).toBe(false);
    expect(p.root.position.z).toBeCloseTo(12, 2);
    expect(p.speed).toBe(0);
    expect(p.pace).toBe(WALK_SPEED);
    const mat = (p.root.getObjectByName("person") as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    const dry = { r: mat.color.r, rough: mat.roughness };
    p.setWetness(1);
    expect(mat.color.r).toBeLessThan(dry.r);
    expect(mat.roughness).toBeLessThan(dry.rough);
    p.setWetness(0);
    expect(mat.color.r).toBeCloseTo(dry.r, 5);
    p.dispose();
  });

  test("Mr. Based's look is his model, with a stand-in like it", () => {
    expect(LOOKS.field_jacket.model).toBe("mr_based");
    expect(LOOKS.field_jacket.cut).toBe("zip");
    expect(LOOKS.barman.model).toBe("bartender");
    for (const look of Object.values(LOOKS)) {
      if (look.model) expect(CAST_MODELS).toContain(look.model);
    }
  });

  test("a look with a model is the same object each time (no rebuilding)", () => {
    expect(lookFor("suit_charcoal", "based")).toBe(
      lookFor("suit_charcoal", "based"),
    );
    expect(lookFor("suit_charcoal")).toBe(LOOKS.suit_charcoal);
    expect(lookFor("nonsense")).toBe(LOOKS.suit_dark);
  });

  test("a custom model is fitted: found, scaled, grounded, facing forward, animated", () => {
    // A Mixamo-named model, twice our size, facing away (-z), in an A-pose.
    const rig = otherSkeleton(NAMINGS.mixamo);
    rig.rotation.y = Math.PI;
    const scene = new THREE.Group();
    scene.add(rig);
    // A skinned box so it has a size.
    const bones: THREE.Bone[] = [];
    rig.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    });
    const geo = new THREE.BoxGeometry(0.6, 3.6, 0.4).translate(0, 1.8, 0);
    const n = geo.getAttribute("position").count;
    geo.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4),
    );
    geo.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(
        new Array(n).fill([1, 0, 0, 0]).flat(),
        4,
      ),
    );
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    scene.add(mesh);
    scene.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    const source = { root: anims.scene, map: mapBones(anims.scene).map };
    const custom = prepareCustom(
      { scene } as unknown as GLTF,
      source,
      anims.animations,
      rigs.m.kit!.template,
    );
    expect(custom).not.toBeNull();
    const wrap = custom!.wrap;
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeGreaterThan(1.6);
    expect(box.max.y).toBeLessThan(2.1);
    // Facing +z: its toes are ahead of its ankles.
    const toe = wrap
      .getObjectByName("mixamorigLeftToeBase")!
      .getWorldPosition(new THREE.Vector3());
    const ankle = wrap
      .getObjectByName("mixamorigLeftFoot")!
      .getWorldPosition(new THREE.Vector3());
    expect(toe.z).toBeGreaterThan(ankle.z);
    expect(custom!.motion.clips.map((c) => c.name)).toContain("run");
    for (const clip of custom!.motion.clips) {
      for (const t of clip.tracks) {
        const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
        expect(
          THREE.PropertyBinding.findNode(wrap, node),
          `${clip.name} ${t.name}`,
        ).toBeTruthy();
      }
    }
  });

  test.each(CAST_MODELS)(
    "the owner's %s: one draw, fitted, every clip resolves, wet by region",
    async (key) => {
      const g = await load(key);
      const source = { root: anims.scene, map: mapBones(anims.scene).map };
      const custom = prepareCustom(
        g,
        source,
        anims.animations,
        rigs.m.kit!.template,
      );
      expect(custom).not.toBeNull();
      const wrap = custom!.wrap;
      wrap.updateMatrixWorld(true);
      const meshes: THREE.SkinnedMesh[] = [];
      wrap.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
          meshes.push(o as THREE.SkinnedMesh);
      });
      expect(meshes.length).toBe(1);
      expect(Array.isArray(meshes[0].material)).toBe(false);
      const tris = meshes[0].geometry.index!.count / 3;
      expect(tris).toBeGreaterThan(30_000);
      expect(tris).toBeLessThanOrEqual(50_000);
      const box = new THREE.Box3().setFromObject(meshes[0]);
      expect(box.min.y).toBeCloseTo(0, 1);
      expect(box.max.y).toBeGreaterThan(1.7);
      expect(box.max.y).toBeLessThan(1.95);
      for (const clip of custom!.motion.clips) {
        for (const t of clip.tracks) {
          const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
          expect(
            THREE.PropertyBinding.findNode(wrap, node),
            t.name,
          ).toBeTruthy();
        }
      }
      // The wetness mask: skin (a face, hands) barely, the rest fully.
      const mask = meshes[0].geometry.getAttribute("_wetmask");
      expect(mask).toBeDefined();
      // (Quantised and interleaved: read through the attribute.)
      const values = Array.from({ length: mask.count }, (_, i) => mask.getX(i));
      const skin = values.filter((v) => v < 0.5).length / values.length;
      expect(skin).toBeGreaterThan(0.02);
      expect(skin).toBeLessThan(0.3);

      // Worn: the hooks still work, the shader does the wetness.
      const p = new Person("X", rigs.m, LOOKS.suit_dark, gestures);
      (p as unknown as { useCustom(c: unknown): void }).useCustom(custom);
      expect(p.bone("hand_r")).toBeTruthy();
      const worn: THREE.MeshStandardMaterial[] = [];
      p.root.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
          worn.push(
            (o as THREE.SkinnedMesh).material as THREE.MeshStandardMaterial,
          );
      });
      expect(worn.length).toBe(1);
      expect(worn[0].customProgramCacheKey()).toBe("based-wetmask");
      p.place(new THREE.Vector3(0, 0, 0), 0, "stand");
      p.setGait("walk");
      p.walk([new THREE.Vector3(0, 0, 4)]);
      // An apron hangs from two cloth bones that swing with the legs.
      const front = p.root.getObjectByName("cloth_front_l");
      expect(!!front).toBe(key === "bartender");
      let swing = 0;
      for (let i = 0; i < 30; i++) {
        p.update(0.05, i * 0.05);
        if (front) swing = Math.max(swing, Math.abs(front.rotation.x));
      }
      if (front) expect(swing).toBeGreaterThan(0.1);
      p.dispose();
    },
    60_000,
  );

  test("a skeleton without legs is refused (the tailored look stays)", () => {
    const root = skeleton([
      ["Hips", null, 0, 1, 0],
      ["Head", "Hips", 0, 1.6, 0],
    ]);
    const source = { root: anims.scene, map: mapBones(anims.scene).map };
    expect(
      prepareCustom(
        { scene: root } as unknown as GLTF,
        source,
        anims.animations,
        rigs.m.kit!.template,
      ),
    ).toBeNull();
  });
});

describe("the models (r22)", () => {
  const files = fs.readdirSync(MODELS).filter((f) => f.endsWith(".glb"));
  const credits = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/based/art/credits.json"), "utf8"),
  ) as { items: { keys: string[]; license: string; source: string }[] };

  test.each(files)("%s: small, compressed, credited", (f) => {
    const key = f.replace(/\.glb$/, "");
    const buf = fs.readFileSync(path.join(MODELS, f));
    expect(buf.subarray(0, 4).toString()).toBe("glTF");
    const builtIn = [...PEOPLE_MODELS, "props", "fusion_props"].includes(
      key as never,
    );
    // Ours: under 400 KB each. The owner's own: the hero under 1 MB.
    expect(buf.length).toBeLessThanOrEqual(
      builtIn ? MODEL_LIMIT.other : MODEL_LIMIT.hero,
    );
    const json = buf.subarray(20, 20 + buf.readUInt32LE(12)).toString();
    expect(json).toContain("EXT_meshopt_compression");
    const c = credits.items.filter((i) => i.keys.includes(key));
    expect(c.length, `${key} needs a credit`).toBeGreaterThan(0);
    for (const i of c) {
      if (i.license === "Model supplied by the owner") continue;
      // BFIX (r23): the props modelled for the game in Fusion.
      if (i.license === "Original work") continue;
      expect(i.license).toMatch(/^(CC0|CC BY|Public domain|Own work)/);
      expect(i.source.length).toBeGreaterThan(0);
    }
  });
});
