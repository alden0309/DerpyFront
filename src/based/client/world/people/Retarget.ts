// BPEOPLE (r22): puts the game's clips (made on Quaternius' rig) onto any
// humanoid skeleton: Quaternius' own, Mixamo's, and what image-to-3D tools
// (Meshy, Tripo...) rig their models with, which name the same bones in
// their own ways ("mixamorig:LeftForeArm", "LeftForeArm", "forearm.L",
// "J_Bip_L_LowerArm", "lowerarm_l").
//
// Retargeting goes through world space: each target bone turns from its
// rest the way the source bone turned from its rest, after first lining
// the target's rest up with the source's (so an A-pose model still lifts
// its arms the way a T-pose clip means). The hips' travel is scaled by
// the ratio of leg lengths. Pure three.js maths; runs in tests.

import * as THREE from "three";

/** The bones the game's clips move, by their names on Quaternius' rig. */
export const CANON = [
  "pelvis",
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "Head",
  "clavicle_l",
  "upperarm_l",
  "lowerarm_l",
  "hand_l",
  "clavicle_r",
  "upperarm_r",
  "lowerarm_r",
  "hand_r",
  "thigh_l",
  "calf_l",
  "foot_l",
  "ball_l",
  "thigh_r",
  "calf_r",
  "foot_r",
  "ball_r",
] as const;
export type Canon = (typeof CANON)[number];

/** Without these a model can't walk; the rest are welcome. */
export const ESSENTIAL: Canon[] = [
  "pelvis",
  "spine_01",
  "Head",
  "upperarm_l",
  "lowerarm_l",
  "upperarm_r",
  "lowerarm_r",
  "thigh_l",
  "calf_l",
  "thigh_r",
  "calf_r",
];

const CHILD: Partial<Record<Canon, Canon>> = {
  pelvis: "spine_01",
  spine_01: "spine_02",
  spine_02: "spine_03",
  spine_03: "neck_01",
  neck_01: "Head",
  clavicle_l: "upperarm_l",
  upperarm_l: "lowerarm_l",
  lowerarm_l: "hand_l",
  clavicle_r: "upperarm_r",
  upperarm_r: "lowerarm_r",
  lowerarm_r: "hand_r",
  thigh_l: "calf_l",
  calf_l: "foot_l",
  foot_l: "ball_l",
  thigh_r: "calf_r",
  calf_r: "foot_r",
  foot_r: "ball_r",
};

const PARENT: Partial<Record<Canon, Canon>> = {};
for (const [p, c] of Object.entries(CHILD)) PARENT[c as Canon] = p as Canon;
PARENT.clavicle_l = "spine_03";
PARENT.clavicle_r = "spine_03";
PARENT.thigh_l = "pelvis";
PARENT.thigh_r = "pelvis";

/** Words that name a sided bone, by the canonical bone they mean. */
const SIDED: [string, string[]][] = [
  ["clavicle", ["clavicle", "shoulder", "collar", "collarbone"]],
  ["upperarm", ["upperarm", "arm", "uparm", "humerus"]],
  ["lowerarm", ["lowerarm", "forearm", "lowarm", "elbow"]],
  ["hand", ["hand", "wrist"]],
  ["thigh", ["thigh", "upleg", "upperleg", "hip", "femur", "uleg"]],
  ["calf", ["calf", "leg", "lowerleg", "lowleg", "shin", "knee"]],
  ["foot", ["foot", "ankle"]],
  ["ball", ["ball", "toe", "toes", "toebase"]],
];

/** Tokens that carry no meaning (rig prefixes). */
const NOISE = new Set([
  "mixamorig",
  "mixamorig1",
  "mixamorig2",
  "j",
  "bip",
  "bip01",
  "bip001",
  "def",
  "org",
  "mch",
  "cc",
  "base",
  "jnt",
  "joint",
  "bone",
  "armature",
  "rig",
  "sk",
  "drv",
  "b",
  "c",
]);

/** Reads a bone's name: which side it's on and what it's called. */
export function readBoneName(name: string): {
  side: "l" | "r" | null;
  core: string;
  end: boolean;
} {
  const bare = name.replace(/^.*[:|]/, "");
  const tokens = bare
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let side: "l" | "r" | null = null;
  const rest: string[] = [];
  let end = false;
  for (const t of tokens) {
    if (t === "l" || t === "left" || t === "lf") side = "l";
    else if (t === "r" || t === "right" || t === "rt") side = "r";
    else if (/^(end|nub|tip|leaf|site|top)$/.test(t)) end = true;
    else if (!NOISE.has(t)) rest.push(t);
  }
  // "LeftArm" splits; "Leftarm" or "lArm" may not.
  let core = rest.join("");
  if (side === null) {
    const m = /^(left|right)(.+)$/.exec(core);
    if (m) {
      side = m[1] === "left" ? "l" : "r";
      core = m[2];
    }
  }
  return { side, core: core.replace(/_?0*\d+$/, ""), end };
}

/** Finds the canonical bones in a skeleton by name (and the spine by where it lies). */
export function mapBones(root: THREE.Object3D): {
  map: Map<Canon, THREE.Object3D>;
  missing: Canon[];
} {
  const map = new Map<Canon, THREE.Object3D>();
  const all: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && !(o as THREE.Mesh).isMesh) all.push(o);
  });
  const depth = (o: THREE.Object3D) => {
    let d = 0;
    for (let p = o.parent; p && p !== root; p = p.parent) d++;
    return d;
  };
  const byDepth = all.slice().sort((x, y) => depth(x) - depth(y));
  const take = (c: Canon, o: THREE.Object3D) => {
    if (!map.has(c)) map.set(c, o);
  };
  for (const o of byDepth) {
    const { side, core, end } = readBoneName(o.name);
    if (end || !core) continue;
    // Twist and helper bones aren't the limb.
    if (/twist|roll|helper|ik|pole|target|ctrl/.test(core)) continue;
    if (side) {
      for (const [canon, words] of SIDED) {
        if (words.includes(core)) take(`${canon}_${side}` as Canon, o);
      }
    } else if (core === "hips" || core === "pelvis" || core === "hip") {
      take("pelvis", o);
    } else if (core === "neck") {
      take("neck_01", o);
    } else if (core === "head") {
      take("Head", o);
    }
  }
  // No pelvis by name: the thighs' common parent.
  if (!map.has("pelvis") && map.get("thigh_l")?.parent) {
    map.set("pelvis", map.get("thigh_l")!.parent!);
  }
  // The spine: whatever lies between the pelvis and the neck (or the
  // clavicles' parent): first, middle, last.
  const pelvis = map.get("pelvis");
  const top =
    map.get("neck_01") ?? map.get("clavicle_l")?.parent ?? map.get("Head");
  if (pelvis && top) {
    const chain: THREE.Object3D[] = [];
    for (let o = top.parent; o && o !== pelvis && o !== root; o = o.parent) {
      chain.unshift(o);
    }
    if (map.has("neck_01") && chain.length === 0) {
      // A neck straight on the pelvis: no spine at all.
    } else if (!map.has("neck_01") && top !== map.get("Head")) {
      chain.push(top);
    }
    if (chain.length > 0) {
      map.set("spine_01", chain[0]);
      map.set("spine_03", chain[chain.length - 1]);
      if (chain.length >= 3) {
        map.set("spine_02", chain[Math.floor(chain.length / 2)]);
      }
      if (chain.length === 1) map.delete("spine_03");
    }
  }
  const missing = CANON.filter((c) => !map.has(c));
  return { map, missing };
}

export interface RetargetRig {
  /** Root of the hierarchy the clips are played on (the mixer's root). */
  root: THREE.Object3D;
  map: Map<Canon, THREE.Object3D>;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function worldQuat(o: THREE.Object3D): THREE.Quaternion {
  return o.getWorldQuaternion(new THREE.Quaternion());
}
function worldPos(o: THREE.Object3D): THREE.Vector3 {
  return o.getWorldPosition(new THREE.Vector3());
}

/** Hip height above the ankles, at rest. */
function legLength(r: RetargetRig): number {
  const p = r.map.get("pelvis");
  const f = r.map.get("foot_l") ?? r.map.get("calf_l");
  if (!p || !f) return 1;
  return Math.max(0.05, worldPos(p).y - worldPos(f).y);
}

/**
 * Plays `clip` on `src` and records what the target's bones must do to
 * match it, as a new clip for `tgt`. Both rigs must be at rest.
 */
export function retargetClip(
  clip: THREE.AnimationClip,
  src: RetargetRig,
  tgt: RetargetRig,
  fps = 30,
): THREE.AnimationClip {
  src.root.updateMatrixWorld(true);
  tgt.root.updateMatrixWorld(true);
  const canons = CANON.filter((c) => src.map.has(c) && tgt.map.has(c));
  // Rest state of both.
  const qs0 = new Map<Canon, THREE.Quaternion>();
  const qt0 = new Map<Canon, THREE.Quaternion>();
  const align = new Map<Canon, THREE.Quaternion>();
  for (const c of canons) {
    qs0.set(c, worldQuat(src.map.get(c)!));
    qt0.set(c, worldQuat(tgt.map.get(c)!));
  }
  for (const c of canons) {
    let child = CHILD[c];
    while (child && !(src.map.has(child) && tgt.map.has(child))) {
      child = CHILD[child];
    }
    if (child) {
      const ds = worldPos(src.map.get(child)!)
        .sub(worldPos(src.map.get(c)!))
        .normalize();
      const dt = worldPos(tgt.map.get(child)!)
        .sub(worldPos(tgt.map.get(c)!))
        .normalize();
      if (ds.lengthSq() > 0 && dt.lengthSq() > 0) {
        align.set(c, new THREE.Quaternion().setFromUnitVectors(dt, ds));
        continue;
      }
    }
    // The head keeps its own rest (the face looks ahead whatever the rig
    // did with the neck); a hand or a foot turns as what it hangs from.
    if (c === "Head") {
      align.set(c, new THREE.Quaternion());
      continue;
    }
    let p = PARENT[c];
    while (p && !align.has(p)) p = PARENT[p];
    align.set(c, p ? align.get(p)!.clone() : new THREE.Quaternion());
  }
  // The target's bones in order, parents first, with their rest.
  const order: THREE.Object3D[] = [];
  tgt.root.traverse((o) => {
    if (o !== tgt.root) order.push(o);
  });
  const restLocal = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const o of order) restLocal.set(o, o.quaternion.clone());
  const canonOf = new Map<THREE.Object3D, Canon>();
  for (const c of canons) canonOf.set(tgt.map.get(c)!, c);
  const rootWorld = worldQuat(tgt.root);
  // Hips.
  const sp = src.map.get("pelvis");
  const tp = tgt.map.get("pelvis");
  const ps0 = sp ? worldPos(sp) : new THREE.Vector3();
  const pt0 = tp ? worldPos(tp) : new THREE.Vector3();
  const ratio = legLength(tgt) / legLength(src);
  const tpParentInv = tp?.parent
    ? tp.parent.matrixWorld.clone().invert()
    : new THREE.Matrix4();
  // Play the source.
  const srcRest = new Map<THREE.Object3D, [THREE.Quaternion, THREE.Vector3]>();
  src.root.traverse((o) =>
    srcRest.set(o, [o.quaternion.clone(), o.position.clone()]),
  );
  const mixer = new THREE.AnimationMixer(src.root);
  const action = mixer.clipAction(clip);
  // Played once and held: the last frame is the clip's end, not its start
  // come round again.
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const qv = new Map<Canon, Float32Array>();
  for (const c of canons) qv.set(c, new Float32Array(frames * 4));
  const pv = new Float32Array(frames * 3);
  const world = new Map<THREE.Object3D, THREE.Quaternion>();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    src.root.updateMatrixWorld(true);
    world.clear();
    for (const o of order) {
      const pw =
        o.parent && world.has(o.parent) ? world.get(o.parent)! : rootWorld;
      const c = canonOf.get(o);
      if (c) {
        // Turned from rest as the source turned from its rest.
        const w = worldQuat(src.map.get(c)!)
          .multiply(qs0.get(c)!.clone().invert())
          .multiply(align.get(c)!)
          .multiply(qt0.get(c)!);
        world.set(o, w);
        _q.copy(pw).invert().multiply(w);
        qv.get(c)!.set([_q.x, _q.y, _q.z, _q.w], f * 4);
      } else {
        world.set(o, pw.clone().multiply(restLocal.get(o)!));
      }
    }
    if (sp && tp) {
      _v.copy(worldPos(sp)).sub(ps0).multiplyScalar(ratio).add(pt0);
      _v.applyMatrix4(tpParentInv);
      pv.set([_v.x, _v.y, _v.z], f * 3);
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(src.root);
  for (const [o, [q, p]] of srcRest) {
    o.quaternion.copy(q);
    o.position.copy(p);
  }
  src.root.updateMatrixWorld(true);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const c of canons) {
    const name = tgt.map.get(c)!.name;
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${name}.quaternion`,
        times,
        qv.get(c)!,
      ),
    );
  }
  if (sp && tp && clip.tracks.some((t) => t.name.endsWith(".position"))) {
    tracks.push(
      new THREE.VectorKeyframeTrack(`${tp.name}.position`, times, pv),
    );
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** The canonical bones the gestures (drink, nod...) play on: the upper body. */
export const UPPER: Canon[] = [
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "Head",
  "clavicle_l",
  "upperarm_l",
  "lowerarm_l",
  "hand_l",
  "clavicle_r",
  "upperarm_r",
  "lowerarm_r",
  "hand_r",
];
