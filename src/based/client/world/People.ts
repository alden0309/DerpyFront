// The people of Mr. Based's places. Round 22 (BPEOPLE): real people.
//
// Each body type is Quaternius' CC0 Universal Base Character (a face with
// eyes and brows, and modelled hair), and each look in Looks.ts is cut into
// clothes on that body when it's first needed (Tailor.ts): a charcoal suit
// with lapels and a tie, an overcoat with its collar up, a barman's
// waistcoat and apron, hats, glasses. One skinned mesh and one material per
// person; people in the same look share their mesh.
//
// The game's clips (Quaternius' Universal Animation Library: walk, run,
// sit, lean, talk, drink, nod...) are retargeted onto each skeleton
// (Retarget.ts), so a model of the owner's own (`@cast ... model=key`, a
// rigged humanoid GLB from Mixamo, Meshy, Tripo or Quaternius) walks, sits
// and drinks like everyone else. See "People and models" in the README.
//
// Each person walks along a path (or runs), sits on a stool, leans on a
// bar, talks while they have a line, makes small gestures (a drink, a nod)
// layered over whatever they're doing, and gets wet in the rain.

import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { LEAN_FALLBACK, LeanShape } from "../../engine/Lean";
import type { P } from "../../engine/Nav";
import { RUN, WALK, Walker } from "../../engine/Walk";
import { Look, LOOKS } from "./people/Looks";
import {
  Canon,
  CANON,
  ESSENTIAL,
  mapBones,
  retargetClip,
  RetargetRig,
  UPPER,
} from "./people/Retarget";
import { Anatomy, Atlas, BodyTemplate, Piece, tailor } from "./people/Tailor";

export { LOOK_NAMES, LOOKS } from "./people/Looks";
export type { HairStyle, Hat, Look } from "./people/Looks";

/** The models the people are made from (in models/, served through the gate). */
export const PEOPLE_MODELS = ["body_m", "body_f", "anims"] as const;

/**
 * The owner's own models for the cast (made from his pictures with an
 * image-to-3D tool, rigged here onto the game's skeleton). Loaded with the
 * rest, so nobody appears in a stand-in first.
 */
export const CAST_MODELS = ["mr_based", "bartender"] as const;

/** A body type and what it moves with. */
export interface Rig {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** r22: the body kit (clothes are cut from it); absent on old rigs. */
  kit?: BodyKit;
}

/** Clips that play over the top of whatever the body is doing. */
const GESTURES = new Set(["interact", "pick_up", "drink", "nod", "shake"]);

/** BFIX (r23): the gait clips, blended over the pose by pace. */
const GAITS = ["walk", "run"] as const;

/** A faint glow so nobody goes fully black in the dark. */
const BASE_GLOW = "#0d0b09";

/**
 * Seat height the sitting clip was made for (r21). BFIX (r23): each person's
 * own is measured on their body (`seatFit`); this is the fallback.
 */
const CHAIR = 0.46;

/**
 * BFIX (r23): where a person meets a seat in the sitting clip: the height
 * of the lowest point under their hips (trousers, a skirt, an apron: what
 * rests on the seat), and how far behind their feet's root the middle of
 * the seat is. Measured once per body.
 */
export interface SeatFit {
  y: number;
  back: number;
}

const seatFits = new Map<string, SeatFit>();

/** Measures a person's seat in the sitting clip (see SeatFit). */
export function measureSeat(
  model: THREE.Object3D,
  clip: THREE.AnimationClip,
  bone: (name: string) => THREE.Object3D | null,
  frame: THREE.Object3D,
): SeatFit | null {
  const pelvis = bone("pelvis");
  if (!pelvis) return null;
  const mixer = new THREE.AnimationMixer(model);
  const a = mixer.clipAction(clip);
  a.play();
  mixer.setTime(clip.duration * 0.5);
  frame.updateMatrixWorld(true);
  const inv = frame.matrixWorld.clone().invert();
  const hip = pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  let lo = Infinity;
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.getAttribute("position");
    const stride = Math.max(1, Math.floor(pos.count / 12000));
    for (let i = 0; i < pos.count; i += stride) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      if (v.y < hip.y && Math.hypot(v.x - hip.x, v.z - hip.z) < 0.14) {
        lo = Math.min(lo, v.y);
      }
    }
  });
  a.stop();
  mixer.uncacheRoot(model);
  if (!Number.isFinite(lo)) return null;
  // The seat's middle: under the buttocks, a little towards the knees.
  return { y: lo, back: Math.max(0.1, -hip.z - 0.1) };
}

/**
 * r26: where a person meets a counter in the leaning clip, in their own
 * frame (z forward, metres at their height), with the clip's feet put back
 * under the root: `feet`, how far behind the root the clip stands them (the
 * model is shifted forward by it while they lean, so the feet stay where
 * they are); `front`, the furthest forward the body comes below the arms
 * (what must clear the counter's edge); `elbow`, where the forearms start;
 * `y`, the underside of the forearms and hands (what rests on the top).
 */
export type LeanFit = LeanShape;

const leanFits = new Map<string, LeanFit>();

/** Measures a person's lean (see LeanFit). Null without arms and feet. */
export function measureLean(
  model: THREE.Object3D,
  clip: THREE.AnimationClip,
  bone: (name: string) => THREE.Object3D | null,
  frame: THREE.Object3D,
): LeanFit | null {
  const need = [
    "lowerarm_l",
    "lowerarm_r",
    "hand_l",
    "hand_r",
    "foot_l",
    "foot_r",
  ].map((n) => bone(n));
  if (need.some((b) => !b)) return null;
  const [elL, elR, haL, haR, ftL, ftR] = need as THREE.Object3D[];
  const balls = [bone("ball_l") ?? ftL, bone("ball_r") ?? ftR];
  const mixer = new THREE.AnimationMixer(model);
  const a = mixer.clipAction(clip);
  a.play();
  mixer.setTime(clip.duration * 0.5);
  frame.updateMatrixWorld(true);
  const inv = frame.matrixWorld.clone().invert();
  const at = (o: THREE.Object3D) =>
    o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const feet =
    -[ftL, ftR, ...balls].map((o) => at(o).z).reduce((x, y) => x + y, 0) / 4;
  // Each forearm from the elbow, on past the wrist to the fingertips.
  const arm = (e: THREE.Object3D, h: THREE.Object3D) => {
    const a = at(e);
    const b = at(h);
    const tip = b.clone().add(b.clone().sub(a).setLength(0.2));
    return [a, tip] as [THREE.Vector3, THREE.Vector3];
  };
  const arms = [arm(elL, haL), arm(elR, haR)];
  const elbow = Math.min(arms[0][0].z, arms[1][0].z) + feet;
  const armTop = Math.min(arms[0][0].y, arms[1][0].y);
  // From the mesh: the forearms' underside, and the body's front below it.
  let lo = Infinity;
  let front = -Infinity;
  const v = new THREE.Vector3();
  const seg = new THREE.Line3();
  const near = new THREE.Vector3();
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(pos.count / 12000));
    for (let i = 0; i < pos.count; i += step) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      let onArm = false;
      for (const [e, h] of arms) {
        seg.set(e, h).closestPointToPoint(v, true, near);
        if (near.distanceTo(v) < 0.08) onArm = true;
      }
      if (onArm) lo = Math.min(lo, v.y);
      else if (v.y < armTop - 0.06) front = Math.max(front, v.z);
    }
  });
  a.stop();
  mixer.uncacheRoot(model);
  if (!Number.isFinite(lo) || !Number.isFinite(front)) return null;
  return { feet, front: front + feet, elbow, y: lo };
}

/**
 * Walking and running pace, metres a second. BFIX (r23): a real run (r22's
 * jog was 2.6 m/s while the clip's feet ran at nearly 6: he ran on the
 * spot). How people move is engine/Walk.ts.
 */
export const WALK_SPEED = WALK.speed;
export const RUN_SPEED = RUN.speed;

/**
 * BFIX (r23): a gait clip's stride, measured on each skeleton it plays on:
 * how far one cycle carries the body (a planted foot's sweep back, at the
 * clip's own pace, times its length), and where in the cycle the left foot
 * is furthest forward (so a walk and a run blend in step).
 */
export interface Stride {
  /** Metres a cycle, at the person's own height. */
  length: number;
  /** Seconds a cycle. */
  duration: number;
  /** The cycle's share where the left foot is furthest forward. */
  lead: number;
}

/**
 * Measures a gait clip on a model (in place, in the space of `frame`, the
 * person, so in metres at their height): the planted foot's speed
 * backwards times the cycle, and where the left foot leads. Null if the
 * skeleton has no feet.
 */
export function measureStride(
  model: THREE.Object3D,
  clip: THREE.AnimationClip,
  bone: (name: string) => THREE.Object3D | null,
  frame: THREE.Object3D,
): Stride | null {
  const feet = [
    bone("ball_l") ?? bone("foot_l"),
    bone("ball_r") ?? bone("foot_r"),
  ];
  if (!feet[0] || !feet[1]) return null;
  const mixer = new THREE.AnimationMixer(model);
  const a = mixer.clipAction(clip);
  a.play();
  const N = 48;
  const dt = clip.duration / N;
  const v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const ys: number[][] = [[], []];
  const zs: number[][] = [[], []];
  for (let i = 0; i < N; i++) {
    mixer.setTime(i * dt);
    frame.updateMatrixWorld(true);
    inv.copy(frame.matrixWorld).invert();
    feet.forEach((f, k) => {
      f!.getWorldPosition(v).applyMatrix4(inv);
      ys[k].push(v.y);
      zs[k].push(v.z);
    });
  }
  a.stop();
  mixer.uncacheRoot(model);
  // A planted foot: within 1.5 cm of its lowest; its speed backwards.
  const speeds: number[] = [];
  for (let k = 0; k < 2; k++) {
    const lo = Math.min(...ys[k]);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (ys[k][i] < lo + 0.015 && ys[k][j] < lo + 0.015) {
        speeds.push((zs[k][i] - zs[k][j]) / dt);
      }
    }
  }
  if (speeds.length === 0) return null;
  speeds.sort((x, y) => x - y);
  const pace = speeds[Math.floor(speeds.length / 2)];
  let lead = 0;
  for (let i = 1; i < N; i++) if (zs[0][i] > zs[0][lead]) lead = i;
  return {
    length: Math.max(0.2, pace * clip.duration),
    duration: clip.duration,
    lead: lead / N,
  };
}

/** The most a custom model may weigh (bytes), and an extra's. */
export const MODEL_LIMIT = { hero: 1_000_000, other: 400_000 };

// --- body kits ---------------------------------------------------------------

/** Reads a body GLB into plain arrays in rest space (undoing quantisation). */
function templateOf(
  g: GLTF,
  sex: "m" | "f",
): {
  template: BodyTemplate;
  root: THREE.Object3D;
  material: THREE.MeshStandardMaterial | null;
} {
  g.scene.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  const bones: THREE.Object3D[] = [];
  g.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh)
      meshes.push(o as THREE.SkinnedMesh);
    if ((o as THREE.Bone).isBone) bones.push(o);
  });
  const names = bones.map((b) => b.name);
  const index = new Map(names.map((n, i) => [n, i]));
  const pieces: Record<string, Piece> = {};
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const blend = new THREE.Matrix4();
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const p = geo.getAttribute("position");
    const nr = geo.getAttribute("normal");
    const uv = geo.getAttribute("uv");
    const si = geo.getAttribute("skinIndex");
    const sw = geo.getAttribute("skinWeight");
    const n = p.count;
    const piece = {
      pos: new Float32Array(n * 3),
      nrm: new Float32Array(n * 3),
      uv: new Float32Array(n * 2),
      jnt: new Uint16Array(n * 4),
      wgt: new Float32Array(n * 4),
      idx: Uint32Array.from(
        geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i),
      ),
    };
    const sk = mesh.skeleton;
    for (let i = 0; i < n; i++) {
      // Where it is at rest: the skinning at rest, in world space.
      blend.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let tot = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        const b = si.getComponent(i, k);
        piece.jnt[i * 4 + k] = index.get(sk.bones[b]?.name ?? "") ?? 0;
        piece.wgt[i * 4 + k] = w;
        tot += w;
        if (w === 0) continue;
        m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
        for (let e = 0; e < 16; e++) blend.elements[e] += m.elements[e] * w;
      }
      for (let k = 0; k < 4; k++) piece.wgt[i * 4 + k] /= tot || 1;
      m.copy(mesh.matrixWorld)
        .multiply(mesh.bindMatrixInverse)
        .multiply(blend)
        .multiply(mesh.bindMatrix);
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      piece.pos.set([v.x, v.y, v.z], i * 3);
      nm.getNormalMatrix(m);
      v.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize();
      piece.nrm.set([v.x, v.y, v.z], i * 3);
      piece.uv[i * 2] = uv.getX(i);
      piece.uv[i * 2 + 1] = uv.getY(i);
    }
    pieces[mesh.name] = piece;
  }
  const extras = (g.scene.userData as { atlas?: Atlas }).atlas;
  const atlas: Atlas = extras ?? {
    w: 1024,
    h: 512,
    neutral: 180,
    swatches: { wool: [0.78, 0.06] },
  };
  const material = (meshes[0]?.material as THREE.MeshStandardMaterial) ?? null;
  return {
    template: {
      sex,
      bones: names,
      bonePos: bones.map((b) => b.getWorldPosition(new THREE.Vector3())),
      pieces,
      atlas,
    },
    root: bones.find((b) => !(b.parent as THREE.Bone)?.isBone) ?? g.scene,
    material,
  };
}

/** A gesture made additive over its first frame, on the upper body only. */
function additive(
  clip: THREE.AnimationClip,
  upper: Set<string>,
): THREE.AnimationClip {
  const c = new THREE.AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks
      .filter((t) => upper.has(t.name.slice(0, t.name.lastIndexOf("."))))
      .map((t) => t.clone()),
  );
  THREE.AnimationUtils.makeClipAdditive(c);
  return c;
}

/** Clips and gestures fitted to one skeleton. */
interface Motion {
  clips: THREE.AnimationClip[];
  gestures: Map<string, THREE.AnimationClip>;
  /** Canonical bone -> this skeleton's bone name. */
  names: Map<Canon, string>;
}

function motionFor(
  source: RetargetRig,
  clips: THREE.AnimationClip[],
  target: RetargetRig,
): Motion {
  const out = clips.map((c) => retargetClip(c, source, target));
  const upper = new Set(
    UPPER.filter((c) => target.map.has(c)).map((c) => target.map.get(c)!.name),
  );
  const gestures = new Map<string, THREE.AnimationClip>();
  for (const c of out)
    if (GESTURES.has(c.name)) gestures.set(c.name, additive(c, upper));
  const names = new Map<Canon, string>();
  for (const [c, o] of target.map) names.set(c, o.name);
  return { clips: out, gestures, names };
}

/** A custom model, ready to clone: scaled, grounded, facing +z, with its clips. */
interface Custom {
  wrap: THREE.Object3D;
  motion: Motion;
}

/** What one body type needs to dress and move its people. */
export class BodyKit {
  readonly anatomy: Anatomy;
  readonly motion: Motion;
  private readonly cuts = new Map<string, THREE.BufferGeometry>();
  readonly map: THREE.Texture | null;
  readonly roughMap: THREE.Texture | null;

  constructor(
    readonly template: BodyTemplate,
    /** The skeleton at rest (cloned for each person). */
    readonly skeleton: THREE.Object3D,
    material: THREE.MeshStandardMaterial | null,
    private readonly source: RetargetRig,
    private readonly sourceClips: THREE.AnimationClip[],
    private readonly load: ((key: string) => Promise<GLTF>) | null,
    /** Custom models by key (shared by both kits). */
    private readonly customs = new Map<string, Promise<Custom | null>>(),
  ) {
    this.anatomy = new Anatomy(template);
    this.map = material?.map ?? null;
    this.roughMap = material?.roughnessMap ?? null;
    const holder = new THREE.Group();
    const rest = skeleton.clone(true);
    holder.add(rest);
    this.motion = motionFor(source, sourceClips, {
      root: holder,
      map: mapBones(holder).map,
    });
  }

  /** The look's clothes and body as one geometry (made once per look). */
  dress(look: Look): THREE.BufferGeometry {
    const key = JSON.stringify(look);
    let g = this.cuts.get(key);
    if (!g) {
      g = tailor(this.anatomy, look).geometry;
      this.cuts.set(key, g);
    }
    return g;
  }

  /** A person's own skeleton: the bones in the skin's order. */
  bones(): {
    root: THREE.Object3D;
    bones: THREE.Bone[];
    inverses: THREE.Matrix4[];
  } {
    const root = this.skeleton.clone(true);
    const byName = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone);
    });
    const bones = this.template.bones.map(
      (n) => byName.get(n) ?? new THREE.Bone(),
    );
    const inverses = this.template.bonePos.map((_, i) => this.restInverse[i]);
    return { root, bones, inverses };
  }

  private _restInverse: THREE.Matrix4[] | null = null;
  private get restInverse(): THREE.Matrix4[] {
    if (!this._restInverse) {
      const holder = new THREE.Group();
      const rest = this.skeleton.clone(true);
      holder.add(rest);
      holder.updateMatrixWorld(true);
      const byName = new Map<string, THREE.Object3D>();
      rest.traverse((o) => byName.set(o.name, o));
      this._restInverse = this.template.bones.map((n) =>
        (byName.get(n)?.matrixWorld ?? new THREE.Matrix4()).clone().invert(),
      );
    }
    return this._restInverse;
  }

  /** A custom model by key (loaded once); null if it can't be used. */
  custom(key: string): Promise<Custom | null> {
    let p = this.customs.get(key);
    if (!p) {
      p = this.load
        ? this.load(key)
            .then((g) =>
              prepareCustom(g, this.source, this.sourceClips, this.template),
            )
            .catch((e: unknown) => {
              console.warn(`Mr. Based: model ${key} could not be used`, e);
              return null;
            })
        : Promise.resolve(null);
      this.customs.set(key, p);
    }
    return p;
  }

  /** Frees what the kit made (the meshes for each look). */
  dispose(): void {
    for (const g of this.cuts.values()) g.dispose();
    this.cuts.clear();
  }
}

/** Fits a custom model: finds its bones, scales, grounds and faces it, retargets the clips. */
export function prepareCustom(
  g: GLTF,
  source: RetargetRig,
  clips: THREE.AnimationClip[],
  like: BodyTemplate,
): Custom | null {
  const scene = g.scene;
  const wrap = new THREE.Group();
  wrap.name = "custom";
  wrap.add(scene);
  const { map, missing } = mapBones(scene);
  const lacking = ESSENTIAL.filter((c) => missing.includes(c));
  if (lacking.length > 0) {
    console.warn(`Mr. Based: the model's skeleton lacks ${lacking.join(", ")}`);
    return null;
  }
  wrap.updateMatrixWorld(true);
  // Facing: the feet point forward (toes ahead of the ankles); else the
  // left hand is on the +x side when facing +z.
  const at = (c: Canon) => map.get(c)!.getWorldPosition(new THREE.Vector3());
  let forward: THREE.Vector3;
  if (map.has("ball_l") && map.has("foot_l")) {
    forward = at("ball_l").sub(at("foot_l")).setY(0);
  } else {
    const side = at("upperarm_l").sub(at("upperarm_r")).setY(0);
    forward = new THREE.Vector3(-side.z, 0, side.x);
  }
  if (forward.lengthSq() > 1e-8) {
    wrap.rotation.y = -Math.atan2(forward.x, forward.z);
  }
  wrap.updateMatrixWorld(true);
  // Size: as tall as the base body; feet on the floor.
  const box = new THREE.Box3();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh) {
      m.updateMatrixWorld(true);
      box.expandByObject(m);
    }
  });
  const height = box.max.y - box.min.y;
  if (!(height > 0.01)) return null;
  // As tall as the base body (head to heel).
  let top = 0;
  const body = like.pieces.Body?.pos;
  if (body)
    for (let i = 1; i < body.length; i += 3) top = Math.max(top, body[i]);
  else for (const p of like.bonePos) top = Math.max(top, p.y * 1.13);
  const want = top;
  const s = want / height;
  wrap.scale.setScalar(s);
  wrap.position.y = -box.min.y * s;
  wrap.updateMatrixWorld(true);
  const holder = new THREE.Group();
  holder.add(wrap);
  holder.updateMatrixWorld(true);
  const motion = motionFor(source, clips, { root: holder, map });
  holder.remove(wrap);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  return { wrap, motion };
}

/** The people's rigs, from the loaded models (and a loader for custom ones). */
export function peopleAssets(
  models: Record<string, GLTF>,
  load: ((key: string) => Promise<GLTF>) | null = null,
): { rigs: { m: Rig; f: Rig }; gestures: Map<string, THREE.AnimationClip> } {
  const anims = models.anims;
  const source: RetargetRig = {
    root: anims.scene,
    map: mapBones(anims.scene).map,
  };
  const clips = anims.animations;
  const customs = new Map<string, Promise<Custom | null>>();
  const kitOf = (key: string, sex: "m" | "f"): Rig => {
    const t = templateOf(models[key], sex);
    const kit = new BodyKit(
      t.template,
      t.root,
      t.material,
      source,
      clips,
      load,
      customs,
    );
    return { scene: t.root, clips: kit.motion.clips, kit };
  };
  const m = kitOf("body_m", "m");
  const f = kitOf("body_f", "f");
  // The cast's own models that came with the rest: ready at once.
  for (const key of CAST_MODELS) {
    const g = models[key];
    if (!g) continue;
    customs.set(
      key,
      Promise.resolve(prepareCustom(g, source, clips, m.kit!.template)),
    );
  }
  return { rigs: { m, f }, gestures: m.kit!.motion.gestures };
}

/** A cast member's look, with their own model if they have one. */
const withModel = new Map<string, Look>();
export function lookFor(name: string | undefined, model?: string): Look {
  const look = (name ? LOOKS[name] : undefined) ?? LOOKS.suit_dark;
  if (!model) return look;
  // The same object each time (the world compares looks to see a change).
  const key = `${name}|${model}`;
  let l = withModel.get(key);
  if (!l) withModel.set(key, (l = { ...look, model }));
  return l;
}

/**
 * Cuts the cast's clothes ahead of time (and starts fetching their own
 * models), so nobody's first appearance makes the game stutter.
 */
export function warmCast(
  rigs: { m: Rig; f: Rig },
  cast: { look: string; model?: string }[],
): void {
  for (const c of cast) {
    const look = lookFor(c.look, c.model);
    const kit = (look.body === "f" ? rigs.f : rigs.m).kit;
    if (!kit) continue;
    kit.dress(look);
    if (look.model) void kit.custom(look.model);
  }
  // The rest of the wardrobe (a change of clothes: wear=...) a look at a
  // time while the player reads, so it's ready when it's needed.
  if (typeof window === "undefined") return;
  const rest = Object.values(LOOKS);
  const next = () => {
    const look = rest.shift();
    if (!look) return;
    (look.body === "f" ? rigs.f : rigs.m).kit?.dress(look);
    window.setTimeout(next, 120);
  };
  window.setTimeout(next, 2000);
}

// --- loose cloth ---------------------------------------------------------------

/**
 * An owner's model may hang loose cloth (an apron, a long coat's skirts) from
 * bones at the hips' axis, children of the pelvis, that no clip moves:
 * `cloth_front` and `cloth_back`, or a half for each leg (`cloth_front_l`,
 * `cloth_front_r`, `cloth_back_l`, `cloth_back_r`). Each frame a front one
 * swings forward as far as the leg furthest forward (a half: its own leg, and
 * half as far as the other), a back one back as far as the leg furthest back,
 * less a little slack, so a knee never comes through the cloth (walking,
 * running, sitting).
 */
interface Cloth {
  bones: { bone: THREE.Object3D; front: boolean; leg: 0 | 1 | null }[];
  legs: { thigh: THREE.Object3D; knee: THREE.Vector3; rest: number }[];
}

const CLOTH: [string, boolean, 0 | 1 | null][] = [
  ["cloth_front", true, null],
  ["cloth_back", false, null],
  ["cloth_front_l", true, 0],
  ["cloth_front_r", true, 1],
  ["cloth_back_l", false, 0],
  ["cloth_back_r", false, 1],
];

const X_AXIS = new THREE.Vector3(1, 0, 0);
const scratch = new THREE.Vector3();

/** A leg's swing forward (radians) in its parent's frame: 0 hanging straight down. */
function legPitch(thigh: THREE.Object3D, knee: THREE.Vector3): number {
  scratch.copy(knee).applyQuaternion(thigh.quaternion);
  return Math.atan2(scratch.z, -scratch.y);
}

function clothOf(
  model: THREE.Object3D,
  bone: (name: string) => THREE.Object3D | null,
): Cloth | null {
  const bones: Cloth["bones"] = [];
  for (const [name, front, leg] of CLOTH) {
    const b = model.getObjectByName(name);
    if (b) bones.push({ bone: b, front, leg });
  }
  if (bones.length === 0) return null;
  const legs: Cloth["legs"] = [];
  for (const side of ["l", "r"]) {
    const thigh = bone(`thigh_${side}`);
    const calf = bone(`calf_${side}`);
    // Measured in the cloth's frame: the thighs must hang from its parent.
    if (!thigh || !calf || bones.some((b) => b.bone.parent !== thigh.parent))
      return null;
    const knee = calf.position.clone();
    legs.push({ thigh, knee, rest: legPitch(thigh, knee) });
  }
  return { bones, legs };
}

function swingCloth(c: Cloth): void {
  const a = c.legs.map((l) => legPitch(l.thigh, l.knee) - l.rest);
  for (const b of c.bones) {
    const own = b.leg === null ? a[0] : a[b.leg];
    const other = b.leg === null ? a[1] : a[1 - b.leg] * 0.5;
    const pitch = b.front ? Math.max(own, other) : Math.min(own, other);
    // A little slack while standing and walking (the cloth hangs clear of
    // the knee), none sitting (the thighs carry it).
    const k = Math.abs(pitch);
    const slack =
      Math.min(k, 0.15) * (1 - THREE.MathUtils.smoothstep(k, 0.6, 1.2));
    b.bone.quaternion.setFromAxisAngle(
      X_AXIS,
      -THREE.MathUtils.clamp(pitch - Math.sign(pitch) * slack, -1, 1.75),
    );
  }
}

/** A body's identity, for what's measured once per body: its meshes' geometry. */
function modelKeyOf(model: THREE.Object3D): string {
  const ids: string[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) ids.push(m.geometry.uuid);
  });
  return ids.join(",");
}

// --- held things (BFIX r23) ---------------------------------------------------

const UP_V = new THREE.Vector3(0, 1, 0);
const HELD_V = Array.from({ length: 12 }, () => new THREE.Vector3());
const HELD_M = new THREE.Matrix4();
const HELD_Q = new THREE.Quaternion();
const HELD_Q2 = new THREE.Quaternion();
const AIM_A = new THREE.Vector3();
const AIM_B = new THREE.Vector3();
const AIM_Q = new THREE.Quaternion();
const AIM_P = new THREE.Quaternion();

/**
 * Turns a bone (in the world) so the way to its child runs along `dir`,
 * keeping its parent where it is.
 */
function aim(
  bone: THREE.Object3D,
  child: THREE.Object3D,
  dir: THREE.Vector3,
): void {
  bone.updateWorldMatrix(true, true);
  const from = bone.getWorldPosition(AIM_A);
  const to = child.getWorldPosition(AIM_B).sub(from).normalize();
  AIM_Q.setFromUnitVectors(to, dir.clone().normalize());
  // world' = AIM_Q * world; local' = parent^-1 * world'
  bone.getWorldQuaternion(AIM_P);
  AIM_P.premultiply(AIM_Q);
  if (bone.parent) {
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    AIM_P.premultiply(pq.invert());
  }
  bone.quaternion.copy(AIM_P);
  bone.updateWorldMatrix(false, true);
}

// --- people ------------------------------------------------------------------

export type Pose = "stand" | "sit" | "lean" | "fold" | "hidden";
export type Gait = "walk" | "run";

/** One person in a place. */
export class Person {
  readonly root = new THREE.Group();
  mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private materials: THREE.MeshStandardMaterial[] = [];
  /** Each material's own colour and roughness, for wetness. */
  private dry = new Map<
    THREE.MeshStandardMaterial,
    { color: THREE.Color; rough: number; env: number }
  >();
  private model: THREE.Object3D = new THREE.Group();
  private names = new Map<Canon, string>();
  private gestureSet = new Map<string, THREE.AnimationClip>();
  private base: THREE.AnimationAction | null = null;
  private baseName = "";
  /** BFIX (r23): where they're going, and how (engine/Walk.ts). */
  private readonly walker = new Walker();
  private onArrive: (() => void) | null = null;
  /** The gait clips' strides on this skeleton, and where in the cycle they are. */
  private strides: { walk: Stride | null; run: Stride | null } = {
    walk: null,
    run: null,
  };
  private phase = 0;
  /** How much of the walk and the run is showing over the pose. */
  private gaitMix = { walk: 0, run: 0 };
  private turnTo: number | null = null;
  private seatLift = 0;
  private liftTarget = 0;
  private talking = false;
  private gait: Gait = "walk";
  private wet = 0;
  private lit = false;
  private disposed = false;
  pose: Pose = "stand";
  /** Facing, in radians. */
  heading = 0;
  /** Pace now, metres a second (0 standing). */
  speed = 0;
  private glow: THREE.Mesh | null = null;
  private extras: THREE.Object3D[] = [];
  /** BFIX (r23): what they hold (the world's prop), carried in the right hand. */
  private held: THREE.Object3D | null = null;
  private cloth: Cloth | null = null;
  private clips: THREE.AnimationClip[] = [];
  private modelKey = "";

  constructor(
    readonly id: string,
    rig: Rig,
    readonly look: Look,
    gestures: Map<string, THREE.AnimationClip>,
  ) {
    this.root.name = id;
    this.mixer = new THREE.AnimationMixer(this.model);
    if (rig.kit) this.build(rig.kit, gestures);
    else this.buildPlain(rig, gestures);
    this.setBase("idle", 0);
    // Not everyone breathes in step.
    this.mixer.update(Math.random() * 3);
    // Their own model, when it has loaded (until then, the tailored one).
    if (look.model && rig.kit) {
      void rig.kit.custom(look.model).then((c) => {
        if (c && !this.disposed) this.useCustom(c);
      });
    }
  }

  /** Dressed by the tailor, on the kit's body. */
  private build(
    kit: BodyKit,
    fallback: Map<string, THREE.AnimationClip>,
  ): void {
    const geo = kit.dress(this.look);
    const { root, bones, inverses } = kit.bones();
    const mat = new THREE.MeshStandardMaterial({
      map: kit.map,
      roughnessMap: kit.roughMap,
      metalnessMap: kit.roughMap,
      vertexColors: true,
      roughness: 1,
      metalness: 1,
      emissive: new THREE.Color(BASE_GLOW),
      side: THREE.DoubleSide,
    });
    mat.name = `person:${this.id}`;
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = "person";
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const holder = new THREE.Group();
    holder.add(root, mesh);
    mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    this.setModel(
      holder,
      [mat],
      kit.motion.clips,
      kit.motion.gestures.size ? kit.motion.gestures : fallback,
      kit.motion.names,
    );
    this.addProps();
  }

  /** An old rig (the r21 mannequins): shown as it comes. */
  private buildPlain(
    rig: Rig,
    gestures: Map<string, THREE.AnimationClip>,
  ): void {
    const model = cloneSkinned(rig.scene);
    const mats: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      const mat = new THREE.MeshStandardMaterial({
        color: this.look.jacket ?? "#333",
        roughness: 0.8,
      });
      m.material = mat;
      mats.push(mat);
    });
    const names = new Map<Canon, string>();
    for (const c of CANON) names.set(c, c);
    this.setModel(model, mats, rig.clips, gestures, names);
  }

  /** Swaps in the owner's own model. */
  private useCustom(c: Custom): void {
    const model = cloneSkinned(c.wrap);
    const mats: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const own = (Array.isArray(m.material) ? m.material : [m.material]).map(
        (x) => {
          const s = x as THREE.MeshStandardMaterial;
          const copy = s.isMeshStandardMaterial
            ? s.clone()
            : new THREE.MeshStandardMaterial({ color: "#888" });
          copy.emissive = new THREE.Color(BASE_GLOW);
          if (m.geometry.getAttribute("_wetmask")) this.maskWetness(copy);
          mats.push(copy);
          return copy;
        },
      );
      m.material = Array.isArray(m.material) ? own : own[0];
    });
    const was = this.baseName;
    for (const x of this.extras) x.parent?.remove(x);
    this.extras = [];
    this.glow = null;
    this.setModel(
      model,
      mats,
      c.motion.clips,
      c.motion.gestures,
      c.motion.names,
    );
    this.baseName = "";
    this.setBase(was || "idle", 0);
    this.addProps();
  }

  /** r26: the world's way to place them again when their body changes. */
  onRefit: (() => void) | null = null;

  private setModel(
    model: THREE.Object3D,
    mats: THREE.MeshStandardMaterial[],
    clips: THREE.AnimationClip[],
    gestures: Map<string, THREE.AnimationClip>,
    names: Map<Canon, string>,
  ): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.remove(this.model);
    for (const m of this.materials) m.dispose();
    this.model = model;
    model.scale.setScalar(this.look.height ?? 1);
    this.root.add(model);
    this.materials = mats;
    this.dry.clear();
    for (const m of mats) {
      this.dry.set(m, {
        color: m.color.clone(),
        rough: m.roughness,
        env: m.envMapIntensity,
      });
    }
    this.names = names;
    this.clips = clips;
    this.modelKey = modelKeyOf(model);
    this.cloth = clothOf(model, (n) => this.bone(n));
    this.gestureSet = gestures;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions.clear();
    this.base = null;
    for (const clip of clips) {
      const g = gestures.get(clip.name);
      const action = this.mixer.clipAction(g ?? clip);
      if (g) {
        action.blendMode = THREE.AdditiveAnimationBlendMode;
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      } else if (clip.name === "sit_down" || clip.name === "stand_up") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    // BFIX (r23): the walk and the run always play, at the weight their
    // pace gives them, their time set by the stride (update), so the feet
    // keep to the ground at any pace.
    this.strides = { walk: null, run: null };
    for (const name of GAITS) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      this.strides[name] = measureStride(
        model,
        clip,
        (n) => this.bone(n),
        this.root,
      );
      const a = this.actions.get(name)!;
      a.play();
      a.timeScale = 0;
      a.weight = 0;
    }
    this.gaitMix = { walk: 0, run: 0 };
    this.setWetness(this.wet);
    this.setHighlight(this.lit);
    // r26: a new body leans differently: once it's on, the world puts them
    // at the counter again (onRefit).
    if (this.pose === "lean" && !this.walker.moving && this.onRefit) {
      queueMicrotask(() => {
        if (this.pose === "lean" && !this.walker.moving) this.onRefit?.();
      });
    }
  }

  /**
   * BFIX (r23): where this body meets a seat (measured the first time, for
   * each body and height), so they sit on a stool or a chair, not in it or
   * above it.
   */
  /** r26: their lean, measured once per body (see LeanFit). */
  leanFit(): LeanFit {
    const key = `${this.modelKey}|${this.look.height ?? 1}`;
    let fit = leanFits.get(key);
    if (!fit) {
      const clip = this.clips.find((c) => c.name === "lean");
      // Measured with the body where the clip puts it (no lean shift).
      const z0 = this.model.position.z;
      this.model.position.z = 0;
      const measured = clip
        ? measureLean(this.model, clip, (n) => this.bone(n), this.root)
        : null;
      this.model.position.z = z0;
      fit = measured ?? LEAN_FALLBACK;
      leanFits.set(key, fit);
    }
    return fit;
  }

  /**
   * r26: how far to lower (or raise) them for their forearms to rest on a
   * counter top at `top`: a few centimetres at most (the counter hides
   * their feet).
   */
  private leanLift(top: number): number {
    if (top <= 0) return 0;
    return Math.max(-0.06, Math.min(0.03, top - this.leanFit().y));
  }

  /**
   * r26: on the way somewhere or getting there: walking, sitting down or
   * getting up, or turning to face what they came to.
   */
  get settling(): boolean {
    return (
      this.walker.moving ||
      this.baseName === "sit_down" ||
      this.baseName === "stand_up" ||
      this.turnTo !== null
    );
  }

  /**
   * r26: a move that's taking too long: they're there now, in the pose
   * they were going to (the walk's end runs as if they'd walked it).
   */
  finishMove(): void {
    if (this.walker.moving) {
      this.walker.finish();
      this.root.position.x = this.walker.x;
      this.root.position.z = this.walker.z;
      this.heading = this.walker.heading;
      this.root.rotation.y = this.heading;
      this.arrive();
    }
    if (this.turnTo !== null) {
      this.heading = this.turnTo;
      this.root.rotation.y = this.heading;
      this.turnTo = null;
    }
    if (this.baseName === "sit_down") this.setBase("sit", 0);
    if (this.baseName === "stand_up") {
      this.pose = "stand";
      this.settle(0);
    }
    this.seatLift = this.liftTarget;
  }

  seatFit(): SeatFit {
    const key = `${this.modelKey}|${this.look.height ?? 1}`;
    let fit = seatFits.get(key);
    if (!fit) {
      const clip = this.clips.find((c) => c.name === "sit");
      const measured = clip
        ? measureSeat(this.model, clip, (n) => this.bone(n), this.root)
        : null;
      fit = measured ?? { y: CHAIR, back: 0.22 };
      // The pose the measuring left behind is the mixer's again next frame.
      seatFits.set(key, fit);
    }
    return fit;
  }

  /**
   * How far to raise them to sit at a seat's height (a little lower than
   * the floor, a couple of centimetres at most, for a seat just under what
   * the clip was made for: the feet hide it, floating wouldn't).
   */
  private liftFor(seat: number): number {
    return Math.max(-0.03, seat - this.seatFit().y);
  }

  /** A cigarette (lit) in the right hand. */
  private addProps(): void {
    const hand = this.bone("hand_r");
    if (!this.look.cigarette || !hand) return;
    const cig = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6),
      new THREE.MeshStandardMaterial({ color: "#ddd8cc" }),
    );
    cig.position.set(0, 0.09, 0.03);
    cig.rotation.x = Math.PI / 2;
    hand.add(cig);
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 6, 6),
      new THREE.MeshBasicMaterial({ color: "#ff7a2a" }),
    );
    this.glow.position.set(0, 0.035, 0);
    cig.add(this.glow);
    this.extras.push(cig);
  }

  /** The bone, for hotspots on a person ("his left hand"), by its Quaternius name. */
  bone(name: string): THREE.Object3D | null {
    const own = this.names.get(name as Canon) ?? name;
    return (
      this.model.getObjectByName(own) ?? this.root.getObjectByName(name) ?? null
    );
  }

  setHighlight(on: boolean): void {
    this.lit = on;
    for (const m of this.materials) m.emissive.set(on ? "#4a3418" : BASE_GLOW);
  }

  /**
   * BPEOPLE (r22), for BWORLD: how wet they are, 0 (dry) to 1 (soaked).
   * Clothes and hair go darker and glossier. Cheap: a few numbers on the
   * person's own material, no new shader.
   */
  setWetness(k: number): void {
    this.wet = THREE.MathUtils.clamp(k, 0, 1);
    this.wetUniform.value = this.wet;
    for (const [m, d] of this.dry) {
      if (this.masked.has(m)) {
        // The shader does it, by the mask: skin barely, cloth and hair fully.
        m.envMapIntensity = d.env * (1 + 1.2 * this.wet);
        continue;
      }
      m.color.copy(d.color).multiplyScalar(1 - 0.32 * this.wet);
      m.roughness = d.rough * (1 - 0.55 * this.wet);
      m.envMapIntensity = d.env * (1 + 1.6 * this.wet);
    }
  }

  private readonly wetUniform = { value: 0 };
  private readonly masked = new Set<THREE.Material>();

  /**
   * A model of one material (the owner's) gets wet by a mask painted on its
   * vertices when it was rigged (_WETMASK: 1 cloth and hair, about 0.1 skin):
   * darker and glossier where it's 1. One small addition to the standard
   * shader, shared by everyone who has it.
   */
  private maskWetness(m: THREE.MeshStandardMaterial): void {
    this.masked.add(m);
    const wet = this.wetUniform;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWet = wet;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float _wetmask;\nvarying float vWetMask;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvWetMask = _wetmask;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uWet;\nvarying float vWetMask;",
        )
        .replace(
          "#include <map_fragment>",
          "#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - 0.32 * uWet * vWetMask;",
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.55 * uWet * vWetMask;",
        );
    };
    m.customProgramCacheKey = () => "based-wetmask";
  }

  get wetness(): number {
    return this.wet;
  }

  /**
   * BPEOPLE (r22), for BWORLD: walk or run. Running lasts until they next
   * arrive somewhere; then they walk again.
   */
  setGait(g: Gait): void {
    if (this.gait === g) return;
    this.gait = g;
    this.walker.gait = g === "run" ? RUN : WALK;
  }

  /** BFIX (r23): the pace of their gait (walking or running). */
  get pace(): number {
    return this.gait === "run" ? RUN_SPEED : WALK_SPEED;
  }

  get running(): boolean {
    return this.gait === "run";
  }

  private setBase(name: string, fade = 0.35): void {
    if (this.baseName === name) return;
    // BFIX (r23): the gait clips are never the base; they're blended over it.
    if ((GAITS as readonly string[]).includes(name)) name = "idle";
    const next = this.actions.get(name) ?? this.actions.get("idle");
    if (!next) return;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (this.base && this.base !== next) {
      next.crossFadeFrom(this.base, fade, false);
    }
    this.base = next;
    this.baseName = name;
  }

  /**
   * The loop that fits what they're doing now. BFIX (r23): walking, that's
   * standing (or talking): the walk and the run blend over it by pace.
   */
  private settle(fade = 0.35): void {
    switch (this.pose) {
      case "sit":
        this.setBase(this.talking ? "sit_talk" : "sit", fade);
        break;
      case "lean":
        // r26: they talk leaning, arms on the counter (the talk clip
        // stands them up in a different place).
        this.setBase("lean", fade);
        break;
      case "fold":
        this.setBase(this.talking ? "talk" : "fold_arms", fade);
        break;
      default:
        this.setBase(this.talking ? "talk" : "idle", fade);
    }
  }

  /** Puts them somewhere at once, in a pose. */
  place(at: THREE.Vector3, heading: number, pose: Pose, seat = 0): void {
    this.walker.stop();
    this.speed = 0;
    this.gaitMix = { walk: 0, run: 0 };
    this.onArrive = null;
    this.setGait("walk");
    this.root.position.copy(at);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.pose = pose;
    // r26: a lean's `seat` is the counter top they rest their arms on.
    this.seatLift = this.liftTarget =
      pose === "sit"
        ? this.liftFor(seat)
        : pose === "lean"
          ? this.leanLift(seat)
          : 0;
    this.root.position.y = this.seatLift;
    this.root.visible = pose !== "hidden";
    this.baseName = "";
    if (pose === "sit") this.setBase("sit", 0);
    else this.settle(0);
  }

  /**
   * Walks (or runs) a path (world points on the floor), then does `then`.
   * BFIX (r23): easing up to pace and down to a stop, round the corners,
   * ending turned to `face` (radians) if given. A new walk while walking
   * changes course at the same pace.
   */
  walk(points: THREE.Vector3[], then?: () => void, face?: number): void {
    const go = () => {
      this.pose = "stand";
      this.liftTarget = 0;
      const w = this.walker;
      w.x = this.root.position.x;
      w.z = this.root.position.z;
      w.heading = this.heading;
      w.go(
        points.map((p): P => [p.x, p.z]),
        this.gait === "run" ? RUN : WALK,
        face ?? null,
      );
      this.onArrive = then ?? null;
      this.turnTo = null;
      this.settle();
      if (!w.moving) this.arrive();
    };
    if (this.pose === "sit") this.standUp(go);
    else go();
  }

  get walking(): boolean {
    return this.walker.moving;
  }

  /** r26: metres of the walk still to go. */
  get walkLeft(): number {
    return this.walker.remaining;
  }

  stop(): void {
    this.walker.stop();
    this.speed = 0;
    this.onArrive = null;
    this.setGait("walk");
    this.settle();
  }

  /** There: walking again (a run lasts until they arrive), and what's next. */
  private arrive(): void {
    const then = this.onArrive;
    this.onArrive = null;
    this.setGait("walk");
    this.settle();
    then?.();
  }

  /** Turns on the spot to face a heading. */
  face(heading: number): void {
    this.turnTo = heading;
  }

  sitDown(seat: number, heading: number): void {
    this.turnTo = heading;
    this.pose = "sit";
    this.liftTarget = this.liftFor(seat);
    const a = this.actions.get("sit_down");
    if (!a) {
      this.settle();
      return;
    }
    this.baseName = "sit_down";
    a.reset().play();
    if (this.base && this.base !== a) a.crossFadeFrom(this.base, 0.25, false);
    this.base = a;
    const mixer = this.mixer;
    const done = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== a) return;
      mixer.removeEventListener("finished", done);
      if (this.pose === "sit")
        this.setBase(this.talking ? "sit_talk" : "sit", 0.3);
    };
    mixer.addEventListener("finished", done);
  }

  standUp(then: () => void): void {
    const a = this.actions.get("stand_up");
    this.liftTarget = 0;
    if (!a) {
      this.pose = "stand";
      then();
      return;
    }
    this.baseName = "stand_up";
    a.reset().play();
    if (this.base && this.base !== a) a.crossFadeFrom(this.base, 0.2, false);
    this.base = a;
    const mixer = this.mixer;
    const done = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== a) return;
      mixer.removeEventListener("finished", done);
      this.pose = "stand";
      then();
    };
    mixer.addEventListener("finished", done);
  }

  setPose(pose: Pose, seat = 0, heading?: number): void {
    if (pose === "sit" && this.pose !== "sit") {
      this.sitDown(seat, heading ?? this.heading);
      return;
    }
    if (heading !== undefined) this.turnTo = heading;
    if (pose !== "sit" && this.pose === "sit") {
      this.standUp(() => {
        this.pose = pose;
        this.settle();
      });
      return;
    }
    this.pose = pose;
    this.liftTarget = pose === "lean" ? this.leanLift(seat) : 0;
    this.root.visible = pose !== "hidden";
    this.settle();
  }

  setTalking(on: boolean): void {
    if (this.talking === on) return;
    this.talking = on;
    if (this.baseName === "sit_down" || this.baseName === "stand_up") return;
    this.settle(0.45);
  }

  /** A gesture over the top of the pose: drink, nod, pick_up... */
  gesture(name: string): void {
    const a = this.actions.get(name);
    if (!a || !GESTURES.has(name) || !this.gestureSet.has(name)) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.fadeIn(0.2);
    a.play();
  }

  update(dt: number, time: number): void {
    // Walking (or running): BFIX (r23) the walker eases, rounds and turns.
    const w = this.walker;
    if (w.moving) {
      const there = w.step(dt);
      this.root.position.x = w.x;
      this.root.position.z = w.z;
      this.heading = w.heading;
      this.root.rotation.y = w.heading;
      this.speed = w.speed;
      if (there) this.arrive();
    } else {
      this.speed = 0;
      if (this.turnTo !== null && this.turnTowards(this.turnTo, dt, 3.5)) {
        this.turnTo = null;
      }
    }
    this.blendGait(dt);
    // Rising onto a bar stool, or down from one.
    if (this.seatLift !== this.liftTarget) {
      const k = Math.min(1, dt * 2.4);
      this.seatLift += (this.liftTarget - this.seatLift) * k;
      if (Math.abs(this.seatLift - this.liftTarget) < 0.002) {
        this.seatLift = this.liftTarget;
      }
    }
    this.root.position.y = this.seatLift;
    if (this.glow) {
      const m = this.glow.material as THREE.MeshBasicMaterial;
      const f = 0.6 + 0.4 * Math.sin(time * 1.7) * Math.sin(time * 0.6);
      m.color.setRGB(1, 0.35 + 0.25 * f, 0.1 * f);
    }
    this.mixer.update(dt);
    // r26: the leaning clip stands the feet behind the root; while it plays
    // (by its weight, through the fades) the body is shifted forward so the
    // feet stay where they are.
    const lean = this.actions.get("lean");
    const lw = lean?.isRunning() ? lean.getEffectiveWeight() : 0;
    this.model.position.z = lw > 0 ? this.leanFit().feet * lw : 0;
    if (this.cloth) swingCloth(this.cloth);
    if (this.held) this.carry(this.held);
  }

  /**
   * BFIX (r23), the world's hook (PeopleHooks.setHeld): takes a prop in the
   * right hand, or puts it down. The prop's grip is its origin and it runs
   * down its -y (an umbrella's "open" part, if shown, runs up its +y).
   */
  setHeld(prop: object | null): boolean {
    if (this.held && this.held !== prop) this.held.removeFromParent();
    this.held = (prop as THREE.Object3D | null) ?? null;
    if (this.held) this.root.add(this.held);
    return true;
  }

  /**
   * Puts the prop in the hand each frame, after the pose: its grip in the
   * palm (past the wrist along the forearm), a baton or a furled umbrella
   * along the line of the fist, a little forward; an open umbrella held up
   * before the chest, the right forearm raised, the shaft straight up.
   */
  private carry(prop: THREE.Object3D): void {
    const hand = this.bone("hand_r");
    const fore = this.bone("lowerarm_r");
    const upper = this.bone("upperarm_r");
    const open = prop.getObjectByName("open");
    const up = !!open?.visible && this.pose !== "sit";
    const h = this.heading;
    const fwd = HELD_V[0].set(Math.sin(h), 0, Math.cos(h));
    const right = HELD_V[1].set(-Math.cos(h), 0, Math.sin(h));
    if (up && upper && fore && hand) {
      // The arm up: the upper arm down by his side, a little forward; the
      // forearm across and up to the chest.
      aim(
        upper,
        fore,
        HELD_V[2]
          .set(0, -1, 0)
          .addScaledVector(fwd, 0.35)
          .addScaledVector(right, 0.12),
      );
      aim(
        fore,
        hand,
        HELD_V[2]
          .copy(fwd)
          .multiplyScalar(0.8)
          .addScaledVector(UP_V, 0.55)
          .addScaledVector(right, -0.3),
      );
    }
    if (!hand || !fore) {
      prop.position.set(0.2, 0.9, 0.1);
      prop.quaternion.identity();
      return;
    }
    const scale = this.look.height ?? 1;
    const wrist = hand.getWorldPosition(HELD_V[3]);
    const elbow = fore.getWorldPosition(HELD_V[4]);
    const along = HELD_V[5].subVectors(wrist, elbow).normalize();
    const grip = HELD_V[6].copy(wrist).addScaledVector(along, 0.08 * scale);
    // Which way the prop's -y runs, in the world.
    const axis = HELD_V[7];
    if (up) axis.set(0, -1, 0);
    else if (prop.name === "held:baton")
      axis.copy(along).multiplyScalar(0.55).addScaledVector(fwd, 0.85);
    else if (prop.name === "held:umbrella")
      axis.copy(along).addScaledVector(fwd, 0.3);
    else axis.copy(along);
    axis.normalize();
    // A frame with -y along the axis and z as near his forward as it goes.
    const yAxis = HELD_V[8].copy(axis).negate();
    const zAxis = HELD_V[9].copy(fwd).addScaledVector(yAxis, -fwd.dot(yAxis));
    if (zAxis.lengthSq() < 1e-6) zAxis.copy(right);
    zAxis.normalize();
    const xAxis = HELD_V[10].crossVectors(yAxis, zAxis).normalize();
    HELD_M.makeBasis(xAxis, yAxis, zAxis);
    HELD_Q.setFromRotationMatrix(HELD_M);
    // Into the person's own space.
    this.root.updateMatrixWorld();
    prop.position.copy(this.root.worldToLocal(grip));
    this.root.getWorldQuaternion(HELD_Q2);
    prop.quaternion.copy(HELD_Q2.invert().multiply(HELD_Q));
    prop.scale.setScalar(scale);
  }

  /**
   * Turns towards a heading (standing), at most `rate` radians a second and
   * easing in at the end; true once facing it.
   */
  private turnTowards(h: number, dt: number, rate: number): boolean {
    let diff = h - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) < 0.01) {
      this.heading = h;
      this.root.rotation.y = h;
      return true;
    }
    const step = Math.min(Math.abs(diff) * Math.min(1, dt * 8), rate * dt);
    this.heading += Math.sign(diff) * step;
    this.root.rotation.y = this.heading;
    return false;
  }

  /**
   * BFIX (r23): the walk and the run over the pose, by pace: none standing,
   * the walk coming in as they set off, the run taking over above a brisk
   * walk; both played to the stride (the cycle moves on as far as they've
   * gone), so a planted foot stays where it's put at any pace, and the two
   * keep in step while they blend.
   */
  private blendGait(dt: number): void {
    const v = this.speed;
    const walk = this.actions.get("walk");
    const run = this.actions.get("run");
    const sw = this.strides.walk;
    const sr = run ? this.strides.run : null;
    const on = THREE.MathUtils.smoothstep(v, 0.03, 0.45);
    const runShare = sr ? THREE.MathUtils.smoothstep(v, 1.6, 3.4) : 0;
    const k = 1 - Math.exp(-dt * 14);
    this.gaitMix.walk += (on * (1 - runShare) - this.gaitMix.walk) * k;
    this.gaitMix.run += (on * runShare - this.gaitMix.run) * k;
    if (this.gaitMix.walk < 1e-3 && on === 0) this.gaitMix.walk = 0;
    if (this.gaitMix.run < 1e-3 && runShare * on === 0) this.gaitMix.run = 0;
    // The cycle moves on by the ground covered, over the stride.
    const stride = sw
      ? sw.length + ((sr?.length ?? sw.length) - sw.length) * runShare
      : 1.2;
    this.phase = (this.phase + (v * dt) / stride) % 1;
    if (walk && sw) walk.time = ((this.phase + sw.lead) % 1) * sw.duration;
    if (run && sr) run.time = ((this.phase + sr.lead) % 1) * sr.duration;
    if (walk) walk.weight = this.gaitMix.walk;
    if (run) run.weight = this.gaitMix.run;
    // The pose underneath gives way.
    const rest = Math.max(0, 1 - this.gaitMix.walk - this.gaitMix.run);
    for (const [name, a] of this.actions) {
      if (name === "walk" || name === "run" || GESTURES.has(name)) continue;
      a.weight = rest;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.mixer.stopAllAction();
    // The mesh of a look is the kit's (shared); only what's ours goes.
    for (const x of this.extras) {
      x.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    }
    for (const m of this.materials) m.dispose();
  }
}

/** r21's gesture clips, kept for callers that still build them from raw clips. */
export function gestureClips(
  clips: THREE.AnimationClip[],
): Map<string, THREE.AnimationClip> {
  const upper = new Set<string>(UPPER);
  const out = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    if (GESTURES.has(clip.name)) out.set(clip.name, additive(clip, upper));
  }
  return out;
}
