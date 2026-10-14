// The people of Mr. Based's places (r21): Quaternius' CC0 mannequins (a man
// and a woman on one rig), dressed by painting each vertex by the bone that
// moves it and where it sits on the body: a suit's jacket and trousers, the
// shirt and tie in the jacket's opening, cuffs, a barman's apron, a coat to
// the knee, hair. Faces stay blank, which suits a story where the villains
// are never seen and the hero is a silhouette.
//
// Each person walks along a path, sits on a stool, leans on a bar, talks
// while they have a line, and makes small gestures (a drink, a nod) layered
// over whatever they're doing.

import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

/** How someone is dressed. Colours are CSS colours. */
export interface Look {
  body: "m" | "f";
  skin: string;
  hair: string;
  hairStyle: "short" | "slick" | "bob" | "bald" | "grey_short";
  jacket: string;
  /** The jacket's sleeves, if not the jacket (a waistcoat's shirt sleeves). */
  sleeves?: string;
  shirt: string;
  tie?: string;
  trousers: string;
  shoes: string;
  /** A coat to the knee, over the jacket. */
  coat?: string;
  skirt?: string;
  legs?: string;
  apron?: string;
  moustache?: boolean;
  glasses?: boolean;
  cigarette?: boolean;
  height?: number;
}

/** The wardrobe. Plain clothes; who wears what is up to the story. */
export const LOOKS: Record<string, Look> = {
  suit_charcoal: {
    body: "m",
    skin: "#b98a6e",
    hair: "#4a4440",
    hairStyle: "grey_short",
    jacket: "#25272c",
    shirt: "#cfcac0",
    tie: "#4a1a1a",
    trousers: "#222429",
    shoes: "#17120f",
  },
  overcoat_charcoal: {
    body: "m",
    skin: "#b98a6e",
    hair: "#4a4440",
    hairStyle: "grey_short",
    jacket: "#2b2925",
    coat: "#2b2925",
    shirt: "#cfcac0",
    tie: "#4a1a1a",
    trousers: "#222429",
    shoes: "#17120f",
  },
  suit_grey: {
    body: "m",
    skin: "#c49a7c",
    hair: "#151413",
    hairStyle: "slick",
    jacket: "#6d7177",
    shirt: "#e4e2dc",
    tie: "#1f2433",
    trousers: "#666a70",
    shoes: "#0c0c0d",
    height: 1.02,
  },
  barman: {
    body: "m",
    skin: "#c9987a",
    hair: "#7d776f",
    hairStyle: "short",
    jacket: "#151517",
    sleeves: "#e8e4da",
    shirt: "#e8e4da",
    tie: "#0b0b0c",
    trousers: "#141416",
    shoes: "#0d0b0a",
    apron: "#e9e5dc",
    moustache: true,
    height: 0.97,
  },
  wool_woman: {
    body: "f",
    skin: "#d4ab92",
    hair: "#a8a090",
    hairStyle: "bob",
    jacket: "#77736d",
    shirt: "#d8d2c4",
    trousers: "#3a3836",
    skirt: "#3e3c3a",
    legs: "#2b2826",
    shoes: "#1c1714",
    glasses: true,
  },
  coat_dark: {
    body: "m",
    skin: "#a07a62",
    hair: "#1b1918",
    hairStyle: "short",
    jacket: "#191b20",
    coat: "#191b20",
    shirt: "#2a2c30",
    trousers: "#1a1b1f",
    shoes: "#0e0e0f",
    cigarette: true,
  },
  suit_dark: {
    body: "m",
    skin: "#a8836a",
    hair: "#262422",
    hairStyle: "short",
    jacket: "#16171b",
    shirt: "#b9b6ae",
    tie: "#121318",
    trousers: "#15161a",
    shoes: "#0b0b0c",
  },
  uniform_navy: {
    body: "m",
    skin: "#a8836a",
    hair: "#3a3632",
    hairStyle: "grey_short",
    jacket: "#1c2233",
    shirt: "#b7b3a8",
    tie: "#141824",
    trousers: "#1a1f2e",
    shoes: "#0b0b0c",
  },
};

export interface Rig {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

const UPPER =
  /^(spine_0[123]|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr]|(index|middle|ring|pinky|thumb)_0\d_[lr])$/;

/** Clips that play over the top of whatever the body is doing. */
const GESTURES = new Set(["interact", "pick_up", "drink", "nod", "shake"]);

/** A faint glow so nobody goes fully black in the dark. */
const BASE_GLOW = "#0d0b09";

/** Seat height the sitting clip was made for. */
const CHAIR = 0.46;

interface Joints {
  head: THREE.Vector3;
  headTop: number;
  neck: THREE.Vector3;
  spine3: THREE.Vector3;
  spine1: THREE.Vector3;
  pelvis: THREE.Vector3;
  knee: number;
  ankle: number;
  front: number;
}

function jointsOf(root: THREE.Object3D, mesh: THREE.SkinnedMesh): Joints {
  root.updateMatrixWorld(true);
  const pos = (name: string) => {
    const b = root.getObjectByName(name);
    return b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  };
  const box = new THREE.Box3().setFromObject(mesh);
  const foot = pos("foot_l");
  const ball = pos("ball_l");
  return {
    head: pos("Head"),
    headTop: box.max.y,
    neck: pos("neck_01"),
    spine3: pos("spine_03"),
    spine1: pos("spine_01"),
    pelvis: pos("pelvis"),
    knee: pos("calf_l").y,
    ankle: foot.y,
    front: Math.sign(ball.z - foot.z) || 1,
  };
}

/** Paints a mesh's vertices for a look. */
function paint(
  mesh: THREE.SkinnedMesh,
  look: Look,
  j: Joints,
  seam: boolean,
): void {
  const g = mesh.geometry;
  const pos = g.getAttribute("position");
  const si = g.getAttribute("skinIndex");
  const sw = g.getAttribute("skinWeight");
  const bones = mesh.skeleton.bones;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const m = mesh.matrixWorld;
  const col = (s: string) => c.set(s);
  // The head's own extent, from the vertices the head bone moves.
  let hy0 = Infinity;
  let hy1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bestW) {
        bestW = w;
        best = si.getComponent(i, k);
      }
    }
    if (bones[best]?.name === "Head") {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      hy0 = Math.min(hy0, v.y);
      hy1 = Math.max(hy1, v.y);
    }
  }
  if (!Number.isFinite(hy0)) {
    hy0 = j.head.y;
    hy1 = j.headTop;
  }
  const headH = Math.max(0.05, hy1 - hy0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bestW) {
        bestW = w;
        best = si.getComponent(i, k);
      }
    }
    const bone = bones[best]?.name ?? "";
    const fz = (v.z - j.spine3.z) * j.front; // how far forward
    const ax = Math.abs(v.x - j.pelvis.x);
    let s: string;
    if (/^(Head|neck_01)$/.test(bone)) {
      const t = (v.y - hy0) / headH;
      const back = (v.z - j.head.z) * j.front < -0.02;
      const sides = Math.abs(v.x - j.head.x) > 0.065;
      let hair: boolean;
      switch (look.hairStyle) {
        case "bob":
          hair = t > 0.6 || (back && t > 0.12) || (sides && t > 0.22);
          break;
        case "slick":
          hair = t > 0.68 || (back && t > 0.32) || (sides && t > 0.6);
          break;
        case "bald":
          hair = back && t > 0.3 && t < 0.6;
          break;
        default:
          hair = t > 0.66 || (back && t > 0.3) || (sides && t > 0.55);
      }
      if (v.y < j.neck.y + 0.03 && bone === "neck_01") {
        // A shirt collar in front; the jacket's (or coat's) at the back.
        s = back ? (look.coat ?? look.jacket) : look.shirt;
      } else if (hair) s = look.hair;
      else if (
        look.moustache &&
        !back &&
        t > 0.28 &&
        t < 0.36 &&
        Math.abs(v.x - j.head.x) < 0.035 &&
        (v.z - j.head.z) * j.front > 0.06
      ) {
        s = "#d9d4cc";
      } else s = look.skin;
    } else if (/^(hand_|index|middle|ring|pinky|thumb)/.test(bone)) {
      s = look.skin;
    } else if (/^(upperarm|lowerarm)/.test(bone)) {
      const hand = mesh.skeleton.bones.find(
        (b) => b.name === `hand_${bone.slice(-1)}`,
      );
      const near =
        hand !== undefined &&
        hand.getWorldPosition(new THREE.Vector3()).distanceTo(v) < 0.06;
      s = near ? look.shirt : (look.coat ?? look.sleeves ?? look.jacket);
    } else if (/^(spine_0[123]|clavicle)/.test(bone)) {
      // The jacket's opening: a V from the second button up to the collar.
      const top = j.neck.y;
      const vy = j.spine1.y + (j.spine3.y - j.spine1.y) * 0.55;
      const open =
        fz > 0.02 &&
        v.y > vy &&
        v.y < top + 0.02 &&
        Math.abs(v.x - j.neck.x) < 0.012 + ((v.y - vy) / (top - vy)) * 0.07;
      if (open) {
        s =
          look.tie && Math.abs(v.x - j.neck.x) < 0.016 && v.y < top - 0.01
            ? look.tie
            : look.shirt;
      } else s = look.coat ?? look.jacket;
    } else if (/^(pelvis|thigh)/.test(bone)) {
      const hem = j.pelvis.y + 0.06;
      if (v.y > hem) s = look.coat ?? look.jacket;
      else if (look.apron && fz > -0.01 && v.y > j.knee - 0.12) {
        s = look.apron;
      } else if (look.coat && v.y > j.knee + 0.04) s = look.coat;
      else if (look.skirt && v.y > j.knee + 0.02) s = look.skirt;
      else s = look.legs && look.skirt ? look.legs : look.trousers;
    } else if (/^calf/.test(bone)) {
      if (look.apron && fz > -0.01 && v.y > j.knee - 0.12) s = look.apron;
      else if (v.y < j.ankle + 0.02) s = look.shoes;
      else s = look.skirt && look.legs ? look.legs : look.trousers;
    } else if (/^(foot|ball)/.test(bone)) {
      s = look.shoes;
    } else s = look.jacket;
    col(s);
    if (seam) c.multiplyScalar(0.78);
    // A little unevenness, so cloth isn't plastic.
    const n = 0.94 + 0.06 * Math.sin(v.x * 91 + v.y * 57 + v.z * 73);
    colors.set([c.r * n, c.g * n, c.b * n], i * 3);
    void ax;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export type Pose = "stand" | "sit" | "lean" | "fold" | "hidden";

/** One person in a place. */
export class Person {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private base: THREE.AnimationAction | null = null;
  private baseName = "";
  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  private turnTo: number | null = null;
  private seatLift = 0;
  private liftTarget = 0;
  private talking = false;
  pose: Pose = "stand";
  /** Facing, in radians. */
  heading = 0;
  readonly speed = 1.15;
  private glow: THREE.Mesh | null = null;

  constructor(
    readonly id: string,
    rig: Rig,
    readonly look: Look,
    gestures: Map<string, THREE.AnimationClip>,
  ) {
    const model = cloneSkinned(rig.scene);
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = o as THREE.SkinnedMesh;
        mesh.geometry = mesh.geometry.clone();
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    model.updateMatrixWorld(true);
    const meshes: THREE.SkinnedMesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        meshes.push(o as THREE.SkinnedMesh);
      }
    });
    const joints = jointsOf(model, meshes[0]);
    for (const mesh of meshes) {
      const seam = /joint/i.test((mesh.material as THREE.Material).name ?? "");
      paint(mesh, look, joints, seam);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0,
        emissive: new THREE.Color(BASE_GLOW),
      });
      this.materials.push(mat);
      mesh.material = mat;
    }
    const h = look.height ?? 1;
    model.scale.setScalar(h);
    this.root.add(model);
    this.root.name = id;
    this.addAccessories(model, look);

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of rig.clips) {
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
    this.setBase("idle", 0);
    // Not everyone breathes in step.
    this.mixer.update(Math.random() * 3);
  }

  private addAccessories(model: THREE.Object3D, look: Look): void {
    const head = model.getObjectByName("Head");
    if (look.glasses && head) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.022, 0.012),
        new THREE.MeshStandardMaterial({ color: "#1a1714", roughness: 0.4 }),
      );
      // Bones are in the rig's own units: the Head bone's y runs up the head.
      frame.position.set(0, 0.105, 0.085);
      head.add(frame);
    }
    const hand = model.getObjectByName("hand_r");
    if (look.cigarette && hand) {
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
    }
  }

  /** The bone, for hotspots on a person ("his left hand"). */
  bone(name: string): THREE.Object3D | null {
    return this.root.getObjectByName(name) ?? null;
  }

  setHighlight(on: boolean): void {
    for (const m of this.materials) {
      m.emissive.set(on ? "#4a3418" : BASE_GLOW);
    }
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
      this.setBase("walk", 0.25);
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

  /** Walks a path (world points on the floor), then does `then`. */
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
    const done = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== a) return;
      this.mixer.removeEventListener("finished", done);
      if (this.pose === "sit")
        this.setBase(this.talking ? "sit_talk" : "sit", 0.3);
    };
    this.mixer.addEventListener("finished", done);
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
    const done = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== a) return;
      this.mixer.removeEventListener("finished", done);
      this.pose = "stand";
      then();
    };
    this.mixer.addEventListener("finished", done);
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
    if (!a || !GESTURES.has(name)) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.fadeIn(0.2);
    a.play();
  }

  update(dt: number, time: number): void {
    // Walking.
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
          this.settle();
          then?.();
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.turnTowards(Math.atan2(dx, dz), dt, 9);
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
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}

/** Gesture clips made additive over their first frame, upper body only. */
export function gestureClips(
  clips: THREE.AnimationClip[],
): Map<string, THREE.AnimationClip> {
  const out = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    if (!GESTURES.has(clip.name)) continue;
    const upper = new THREE.AnimationClip(
      clip.name,
      clip.duration,
      clip.tracks
        .filter((t) => UPPER.test(t.name.split(".")[0]))
        .map((t) => t.clone()),
    );
    THREE.AnimationUtils.makeClipAdditive(upper);
    out.set(clip.name, upper);
  }
  return out;
}
