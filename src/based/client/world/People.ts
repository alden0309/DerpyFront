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

/** A body type and what it moves with. */
export interface Rig {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** r22: the body kit (clothes are cut from it); absent on old rigs. */
  kit?: BodyKit;
}

/** Clips that play over the top of whatever the body is doing. */
const GESTURES = new Set(["interact", "pick_up", "drink", "nod", "shake"]);

/** A faint glow so nobody goes fully black in the dark. */
const BASE_GLOW = "#0d0b09";

/** Seat height the sitting clip was made for. */
const CHAIR = 0.46;

/** Walking and running pace, metres a second. */
export const WALK_SPEED = 1.15;
export const RUN_SPEED = 2.6;

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
  private readonly customs = new Map<string, Promise<Custom | null>>();
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
  let top = 0;
  for (const p of like.bonePos) top = Math.max(top, p.y);
  const want = top * 1.07;
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
  const kitOf = (key: string, sex: "m" | "f"): Rig => {
    const t = templateOf(models[key], sex);
    const kit = new BodyKit(
      t.template,
      t.root,
      t.material,
      source,
      clips,
      load,
    );
    return { scene: t.root, clips: kit.motion.clips, kit };
  };
  const m = kitOf("body_m", "m");
  const f = kitOf("body_f", "f");
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
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
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
  /** Pace now (walking or running). */
  speed = WALK_SPEED;
  private glow: THREE.Mesh | null = null;
  private extras: THREE.Object3D[] = [];

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
    this.setWetness(this.wet);
    this.setHighlight(this.lit);
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
    for (const [m, d] of this.dry) {
      m.color.copy(d.color).multiplyScalar(1 - 0.32 * this.wet);
      m.roughness = d.rough * (1 - 0.55 * this.wet);
      m.envMapIntensity = d.env * (1 + 1.6 * this.wet);
    }
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
    this.speed = g === "run" ? RUN_SPEED : WALK_SPEED;
    if (this.path.length > 0) this.settle();
  }

  get running(): boolean {
    return this.gait === "run";
  }

  private setBase(name: string, fade = 0.35): void {
    if (this.baseName === name) return;
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

  /** The loop that fits what they're doing now. */
  private settle(fade = 0.35): void {
    if (this.path.length > 0) {
      const run = this.gait === "run" && this.actions.has("run");
      this.setBase(run ? "run" : "walk", 0.25);
      return;
    }
    switch (this.pose) {
      case "sit":
        this.setBase(this.talking ? "sit_talk" : "sit", fade);
        break;
      case "lean":
        this.setBase(this.talking ? "talk" : "lean", fade);
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
    this.path = [];
    this.onArrive = null;
    this.setGait("walk");
    this.root.position.copy(at);
    this.heading = heading;
    this.root.rotation.y = heading;
    this.pose = pose;
    this.seatLift = this.liftTarget =
      pose === "sit" ? Math.max(0, seat - CHAIR) : 0;
    this.root.position.y = this.seatLift;
    this.root.visible = pose !== "hidden";
    this.baseName = "";
    if (pose === "sit") this.setBase("sit", 0);
    else this.settle(0);
  }

  /** Walks (or runs) a path (world points on the floor), then does `then`. */
  walk(points: THREE.Vector3[], then?: () => void): void {
    const go = () => {
      this.pose = "stand";
      this.path = points.map((p) => p.clone());
      this.onArrive = then ?? null;
      this.turnTo = null;
      this.settle();
    };
    if (this.pose === "sit") this.standUp(go);
    else go();
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  stop(): void {
    this.path = [];
    this.onArrive = null;
    this.setGait("walk");
    this.settle();
  }

  /** Turns on the spot to face a heading. */
  face(heading: number): void {
    this.turnTo = heading;
  }

  sitDown(seat: number, heading: number): void {
    this.turnTo = heading;
    this.pose = "sit";
    this.liftTarget = Math.max(0, seat - CHAIR);
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
    // Walking (or running).
    if (this.path.length > 0) {
      const target = this.path[0];
      const p = this.root.position;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        p.x = target.x;
        p.z = target.z;
        this.path.shift();
        if (this.path.length === 0) {
          const then = this.onArrive;
          this.onArrive = null;
          this.gait = "walk";
          this.speed = WALK_SPEED;
          this.settle();
          then?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.turnTowards(Math.atan2(dx, dz), dt, this.gait === "run" ? 12 : 9);
      }
    } else if (this.turnTo !== null) {
      if (this.turnTowards(this.turnTo, dt, 5)) this.turnTo = null;
    }
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
  }

  /** Turns towards a heading; true once facing it. */
  private turnTowards(h: number, dt: number, rate: number): boolean {
    let diff = h - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) < 0.01) {
      this.heading = h;
      this.root.rotation.y = h;
      return true;
    }
    this.heading += diff * Math.min(1, dt * rate);
    this.root.rotation.y = this.heading;
    return false;
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
