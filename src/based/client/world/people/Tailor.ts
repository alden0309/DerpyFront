// BPEOPLE (r22): cuts clothes for Mr. Based's people out of the body they
// wear them on. The body is Quaternius' CC0 base character (a face with
// eyes and brows, and modelled hair); everything else is made here, from
// the look's description (Looks.ts):
//
//  - shells: the body's own surface, cut where the garment ends (a cuff,
//    a hem, the V of a jacket), smoothed (no muscles under a suit) and
//    pushed out by the cloth's thickness: shirts, jackets, sleeves,
//    trousers, shoes. They keep the body's skinning, so they move with it.
//  - lofts: what hangs rather than clings: a coat's skirts, a skirt, an
//    apron, built ring by ring round the hips and open at the front.
//  - pieces: lapels and collars, a tie, buttons, a scarf, hats, glasses.
//
// Every garment is a field (metres inside its edges, negative outside), so
// the edges are cut exactly through the triangles, and whatever an outer
// layer covers is cut away (the body under the shirt, the shirt under the
// jacket): a person costs little more than what shows.
//
// Everything comes out as ONE skinned geometry with one material: colours
// are vertex colours over an atlas (skin, hair, eyes, and plain swatches
// whose roughness says what the stuff is: wool, leather, silk, felt).
// Pure geometry: runs in tests without a browser.

import * as THREE from "three";
import { Look } from "./Looks";

/** A mesh of the base body in rest (bind) space, plain arrays. */
export interface Piece {
  pos: ArrayLike<number>;
  nrm: ArrayLike<number>;
  uv: ArrayLike<number>;
  jnt: ArrayLike<number>;
  wgt: ArrayLike<number>;
  idx: ArrayLike<number>;
}

export interface Atlas {
  w: number;
  h: number;
  /** The grey the skin and hair textures average to (tints divide by it). */
  neutral: number;
  swatches: Record<string, [number, number]>;
}

/** What a body type is made of: its skeleton at rest, its meshes, its atlas. */
export interface BodyTemplate {
  sex: "m" | "f";
  bones: string[];
  /** Rest positions of the bones, in the same order. */
  bonePos: THREE.Vector3[];
  pieces: Record<string, Piece>;
  atlas: Atlas;
}

type V = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
/** 0 below a, 1 above b, smooth between (a may be above b: then reversed). */
function smooth(a: number, b: number, x: number): number {
  if (a > b) return 1 - smooth(b, a, x);
  return THREE.MathUtils.smoothstep(x, a, b);
}

// --- the output ------------------------------------------------------------

class Out {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  jnt: number[] = [];
  wgt: number[] = [];
  idx: number[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
  vert(
    p: V,
    n: V,
    uv: ArrayLike<number>,
    c: THREE.Color,
    j: ArrayLike<number>,
    w: ArrayLike<number>,
  ): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(uv[0], uv[1]);
    this.col.push(c.r, c.g, c.b);
    for (let k = 0; k < 4; k++) {
      this.jnt.push(j[k] ?? 0);
      this.wgt.push(w[k] ?? 0);
    }
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.jnt, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.wgt, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// --- the body, read --------------------------------------------------------

const enum R {
  Head,
  Neck,
  Torso,
  Pelvis,
  UArm,
  LArm,
  Hand,
  Thigh,
  Calf,
  Foot,
}

function regionOf(bone: string): R {
  if (bone === "Head") return R.Head;
  if (bone === "neck_01") return R.Neck;
  if (/^(spine_0|clavicle)/.test(bone)) return R.Torso;
  if (/^(pelvis|root)$/.test(bone)) return R.Pelvis;
  if (/^upperarm/.test(bone)) return R.UArm;
  if (/^lowerarm/.test(bone)) return R.LArm;
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(bone)) return R.Hand;
  if (/^thigh/.test(bone)) return R.Thigh;
  if (/^calf/.test(bone)) return R.Calf;
  return R.Foot;
}

/** Hashes positions so vertices split by UV seams are one again. */
function weldOf(pos: ArrayLike<number>): { id: Int32Array; n: number } {
  const n = pos.length / 3;
  const id = new Int32Array(n);
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 2e4)},${Math.round(pos[i * 3 + 1] * 2e4)},${Math.round(pos[i * 3 + 2] * 2e4)}`;
    let w = seen.get(k);
    if (w === undefined) {
      w = seen.size;
      seen.set(k, w);
    }
    id[i] = w;
  }
  return { id, n: seen.size };
}

/** Landmarks and per-vertex facts about one body type (computed once). */
export class Anatomy {
  readonly bone = new Map<string, V>();
  readonly boneIndex = new Map<string, number>();
  /** Body vertices (welded): rest position, normal, weights, region. */
  readonly n: number;
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  readonly jnt: Uint16Array;
  readonly wgt: Float32Array;
  readonly reg: Uint8Array;
  /** Body triangles in welded indices. */
  readonly tris: Uint32Array;
  readonly weld: Int32Array;
  readonly neckY: number;
  readonly neckZ: number;
  readonly neckR: number;
  readonly headTop: number;
  readonly headZ: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly eyeX: number;
  readonly mouthY: number;
  readonly chinY: number;
  readonly shoulderY: number;
  readonly armZ: number;
  readonly wristX: number;
  readonly waistY: number;
  readonly crotchY: number;
  readonly kneeY: number;
  readonly ankleY: number;
  readonly legX: number;
  readonly spineZ: number;

  constructor(readonly t: BodyTemplate) {
    t.bones.forEach((b, i) => {
      this.bone.set(b, t.bonePos[i]);
      this.boneIndex.set(b, i);
    });
    const body = t.pieces.Body;
    const w = weldOf(body.pos);
    this.weld = w.id;
    this.n = w.n;
    this.pos = new Float32Array(w.n * 3);
    this.nrm = new Float32Array(w.n * 3);
    this.jnt = new Uint16Array(w.n * 4);
    this.wgt = new Float32Array(w.n * 4);
    this.reg = new Uint8Array(w.n);
    const done = new Uint8Array(w.n);
    for (let i = 0; i < body.pos.length / 3; i++) {
      const k = w.id[i];
      for (let c = 0; c < 3; c++) this.nrm[k * 3 + c] += body.nrm[i * 3 + c];
      if (done[k]) continue;
      done[k] = 1;
      for (let c = 0; c < 3; c++) this.pos[k * 3 + c] = body.pos[i * 3 + c];
      let best = 0;
      for (let c = 0; c < 4; c++) {
        this.jnt[k * 4 + c] = body.jnt[i * 4 + c];
        this.wgt[k * 4 + c] = body.wgt[i * 4 + c];
        if (body.wgt[i * 4 + c] > body.wgt[i * 4 + best]) best = c;
      }
      this.reg[k] = regionOf(t.bones[body.jnt[i * 4 + best]] ?? "");
    }
    for (let k = 0; k < w.n; k++) {
      const l = Math.hypot(
        this.nrm[k * 3],
        this.nrm[k * 3 + 1],
        this.nrm[k * 3 + 2],
      );
      for (let c = 0; c < 3; c++) this.nrm[k * 3 + c] /= l || 1;
    }
    this.tris = new Uint32Array(body.idx.length);
    for (let i = 0; i < body.idx.length; i++) this.tris[i] = w.id[body.idx[i]];
    const B = (n: string) => this.bone.get(n) ?? v3();
    this.neckY = B("neck_01").y;
    this.shoulderY = B("upperarm_l").y;
    this.armZ = B("upperarm_l").z;
    this.wristX = Math.abs(B("hand_l").x);
    this.kneeY = B("calf_l").y;
    this.ankleY = B("foot_l").y;
    this.legX = Math.abs(B("thigh_l").x);
    this.spineZ = B("spine_03").z;
    // The waist: up from the pelvis towards the ribs.
    this.waistY = lerp(B("pelvis").y, B("spine_02").y, 0.62);
    let crotch = B("pelvis").y;
    let headTop = -Infinity;
    let headZ = 0;
    let hz = 0;
    let neckZ = 0;
    let nn = 0;
    for (let k = 0; k < w.n; k++) {
      const x = this.pos[k * 3];
      const y = this.pos[k * 3 + 1];
      const z = this.pos[k * 3 + 2];
      if (this.reg[k] === R.Pelvis && Math.abs(x) < 0.03)
        crotch = Math.min(crotch, y);
      if (this.reg[k] === R.Head) {
        headTop = Math.max(headTop, y);
        headZ += z;
        hz++;
      }
      // The neck proper, a little above its bone.
      if (this.reg[k] === R.Neck && Math.abs(y - this.neckY - 0.04) < 0.012) {
        neckZ += z;
        nn++;
      }
    }
    this.crotchY = crotch;
    this.headTop = headTop;
    this.headZ = hz ? headZ / hz : B("Head").z;
    this.neckZ = nn ? neckZ / nn : B("neck_01").z;
    const radii: number[] = [];
    for (let k = 0; k < w.n; k++) {
      if (
        this.reg[k] === R.Neck &&
        Math.abs(this.pos[k * 3 + 1] - this.neckY - 0.04) < 0.012
      ) {
        radii.push(
          Math.hypot(this.pos[k * 3], this.pos[k * 3 + 2] - this.neckZ),
        );
      }
    }
    radii.sort((x, y) => x - y);
    this.neckR = radii.length ? radii[Math.floor(radii.length * 0.75)] : 0.055;
    // The eyes, from the eye mesh.
    const eyes = t.pieces.Eyes;
    let ey = 0;
    let ez = -Infinity;
    let ex = 0;
    const ne = eyes ? eyes.pos.length / 3 : 0;
    for (let i = 0; i < ne; i++) {
      ey += eyes.pos[i * 3 + 1];
      ez = Math.max(ez, eyes.pos[i * 3 + 2]);
      ex += Math.abs(eyes.pos[i * 3]);
    }
    this.eyeY = ne ? ey / ne : B("Head").y + 0.1;
    this.eyeZ = ne ? ez : B("Head").z + 0.09;
    this.eyeX = ne ? ex / ne : 0.033;
    let chin = this.eyeY;
    for (let k = 0; k < w.n; k++) {
      if (
        this.reg[k] === R.Head &&
        Math.abs(this.pos[k * 3]) < 0.02 &&
        this.pos[k * 3 + 2] > this.eyeZ - 0.035
      ) {
        chin = Math.min(chin, this.pos[k * 3 + 1]);
      }
    }
    this.chinY = chin;
    this.mouthY = lerp(this.chinY, this.eyeY, 0.36);
  }

  regionAt(k: number): R {
    return this.reg[k] as R;
  }

  bi(name: string): number {
    return this.boneIndex.get(name) ?? 0;
  }
}

// --- meshes being cut --------------------------------------------------------

/** A mesh in the making: everything per vertex, as plain arrays. */
interface Cloth {
  pos: number[];
  nrm: number[];
  uv: number[] | null;
  jnt: number[];
  wgt: number[];
  reg: number[];
  idx: number[];
}

const emptyCloth = (uv: boolean): Cloth => ({
  pos: [],
  nrm: [],
  uv: uv ? [] : null,
  jnt: [],
  wgt: [],
  reg: [],
  idx: [],
});

function copyVert(o: Cloth, m: Cloth, i: number): number {
  const n = o.reg.length;
  o.pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
  o.nrm.push(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]);
  if (o.uv && m.uv) o.uv.push(m.uv[i * 2], m.uv[i * 2 + 1]);
  for (let k = 0; k < 4; k++) {
    o.jnt.push(m.jnt[i * 4 + k]);
    o.wgt.push(m.wgt[i * 4 + k]);
  }
  o.reg.push(m.reg[i]);
  return n;
}

/** A vertex part way along an edge: everything blended (the four strongest bones kept). */
function edgeVert(
  o: Cloth,
  m: Cloth,
  i: number,
  j: number,
  t: number,
  inside: number,
): number {
  const n = o.reg.length;
  for (let c = 0; c < 3; c++)
    o.pos.push(lerp(m.pos[i * 3 + c], m.pos[j * 3 + c], t));
  const nx = lerp(m.nrm[i * 3], m.nrm[j * 3], t);
  const ny = lerp(m.nrm[i * 3 + 1], m.nrm[j * 3 + 1], t);
  const nz = lerp(m.nrm[i * 3 + 2], m.nrm[j * 3 + 2], t);
  const l = Math.hypot(nx, ny, nz) || 1;
  o.nrm.push(nx / l, ny / l, nz / l);
  if (o.uv && m.uv) {
    o.uv.push(
      lerp(m.uv[i * 2], m.uv[j * 2], t),
      lerp(m.uv[i * 2 + 1], m.uv[j * 2 + 1], t),
    );
  }
  const w = new Map<number, number>();
  for (let k = 0; k < 4; k++) {
    const a = m.jnt[i * 4 + k];
    const b = m.jnt[j * 4 + k];
    w.set(a, (w.get(a) ?? 0) + m.wgt[i * 4 + k] * (1 - t));
    w.set(b, (w.get(b) ?? 0) + m.wgt[j * 4 + k] * t);
  }
  const top = [...w.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const tot = top.reduce((s, [, v]) => s + v, 0) || 1;
  for (let k = 0; k < 4; k++) {
    o.jnt.push(top[k]?.[0] ?? 0);
    o.wgt.push((top[k]?.[1] ?? 0) / tot);
  }
  o.reg.push(m.reg[inside]);
  return n;
}

/** Keeps the part of a mesh where `f` >= 0, cutting triangles along f = 0. */
function clip(m: Cloth, f: ArrayLike<number>): Cloth {
  const n = m.reg.length;
  const o = emptyCloth(m.uv !== null);
  const map = new Int32Array(n).fill(-1);
  const edges = new Map<number, number>();
  const keep = (i: number) =>
    map[i] >= 0 ? map[i] : (map[i] = copyVert(o, m, i));
  const cut = (i: number, j: number) => {
    const key = i < j ? i * n + j : j * n + i;
    let v = edges.get(key);
    if (v === undefined) {
      const t = clamp(f[i] / (f[i] - f[j]), 0, 1);
      v = edgeVert(o, m, i, j, t, f[i] >= 0 ? i : j);
      edges.set(key, v);
    }
    return v;
  };
  const tri = [0, 0, 0];
  const ins = [false, false, false];
  for (let t = 0; t < m.idx.length; t += 3) {
    let c = 0;
    for (let e = 0; e < 3; e++) {
      tri[e] = m.idx[t + e];
      ins[e] = f[tri[e]] >= 0;
      if (ins[e]) c++;
    }
    if (c === 3) {
      o.idx.push(keep(tri[0]), keep(tri[1]), keep(tri[2]));
      continue;
    }
    if (c === 0) continue;
    for (let k = 0; k < 3; k++) {
      const p = tri[k];
      const q = tri[(k + 1) % 3];
      const r = tri[(k + 2) % 3];
      if (c === 1 && ins[k]) {
        o.idx.push(keep(p), cut(p, q), cut(p, r));
        break;
      }
      if (c === 2 && !ins[(k + 2) % 3]) {
        const qr = cut(q, r);
        o.idx.push(keep(p), keep(q), qr, keep(p), qr, cut(p, r));
        break;
      }
    }
  }
  return o;
}

/** Neighbours and border vertices of a mesh. */
function topology(m: Cloth): { nb: number[][]; border: Uint8Array } {
  const n = m.reg.length;
  const nb: number[][] = Array.from({ length: n }, () => []);
  const count = new Map<number, number>();
  for (let t = 0; t < m.idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const i = m.idx[t + e];
      const j = m.idx[t + ((e + 1) % 3)];
      const key = i < j ? i * n + j : j * n + i;
      const c = count.get(key) ?? 0;
      count.set(key, c + 1);
      if (c === 0) {
        nb[i].push(j);
        nb[j].push(i);
      }
    }
  }
  const border = new Uint8Array(n);
  for (const [key, c] of count) {
    if (c === 1) {
      border[Math.floor(key / n)] = 1;
      border[key % n] = 1;
    }
  }
  return { nb, border };
}

function normals(m: Cloth): void {
  const n = m.reg.length;
  const acc = new Float32Array(n * 3);
  for (let t = 0; t < m.idx.length; t += 3) {
    const i = m.idx[t];
    const j = m.idx[t + 1];
    const k = m.idx[t + 2];
    const ax = m.pos[j * 3] - m.pos[i * 3];
    const ay = m.pos[j * 3 + 1] - m.pos[i * 3 + 1];
    const az = m.pos[j * 3 + 2] - m.pos[i * 3 + 2];
    const bx = m.pos[k * 3] - m.pos[i * 3];
    const by = m.pos[k * 3 + 1] - m.pos[i * 3 + 1];
    const bz = m.pos[k * 3 + 2] - m.pos[i * 3 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const v of [i, j, k]) {
      acc[v * 3] += nx;
      acc[v * 3 + 1] += ny;
      acc[v * 3 + 2] += nz;
    }
  }
  for (let v = 0; v < n; v++) {
    const l = Math.hypot(acc[v * 3], acc[v * 3 + 1], acc[v * 3 + 2]);
    if (l > 0) {
      m.nrm[v * 3] = acc[v * 3] / l;
      m.nrm[v * 3 + 1] = acc[v * 3 + 1] / l;
      m.nrm[v * 3 + 2] = acc[v * 3 + 2] / l;
    }
  }
}

/** Taubin smoothing: irons out the muscles without shrinking the cloth. */
function iron(m: Cloth, passes: number): void {
  const { nb, border } = topology(m);
  const n = m.reg.length;
  const next = new Float32Array(n * 3);
  for (let pass = 0; pass < passes * 2; pass++) {
    const f = pass % 2 === 0 ? 0.5 : -0.53;
    for (let v = 0; v < n; v++) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let c = 0;
      for (const u of nb[v]) {
        if (border[v] && !border[u]) continue;
        sx += m.pos[u * 3];
        sy += m.pos[u * 3 + 1];
        sz += m.pos[u * 3 + 2];
        c++;
      }
      const k = border[v] ? f * 0.5 : f;
      const px = m.pos[v * 3];
      const py = m.pos[v * 3 + 1];
      const pz = m.pos[v * 3 + 2];
      next[v * 3] = c ? px + (sx / c - px) * k : px;
      next[v * 3 + 1] = c ? py + (sy / c - py) * k : py;
      next[v * 3 + 2] = c ? pz + (sz / c - pz) * k : pz;
    }
    for (let i = 0; i < n * 3; i++) m.pos[i] = next[i];
  }
}

// --- garments ------------------------------------------------------------------

/** Metres inside a garment's edges at a point (negative outside). */
type Field = (p: V, r: R) => number;

interface ShellSpec {
  name: string;
  field: Field;
  thick: number | ((p: V, r: R) => number);
  /** Smoothing passes (a suit hides the muscles). */
  passes: number;
  color: string;
  swatch: string;
  /** Shape after smoothing, before the cloth's thickness (in place). */
  shape?: (p: V, r: R) => void;
  /** Coverage order: outer layers hide inner ones. */
  layer: number;
}

interface LoftSpec {
  name: string;
  top: number;
  bottom: number;
  /** Half the opening at the front (radians), from the top (0) to the hem (1). */
  open: (t: number) => number;
  /** Instead of a ring: only this arc either side of the front (radians). */
  arc?: number;
  flare: number;
  thick: number;
  color: string;
  swatch: string;
  /** How much the hem follows the thighs (0..1). */
  follow: number;
  /** A pencil skirt narrows towards the hem; a coat only ever falls. */
  taper?: number;
  layer: number;
}

const K = 40; // points round a loft's ring
const RINGS = 9;
/** How far under an outer layer's edge an inner one goes on. */
const OVERLAP = 0.014;

/** A look's colour at a point, a little uneven so cloth isn't plastic. */
function cloth(c: string, p: V, k = 1): THREE.Color {
  const n = 0.95 + 0.05 * Math.sin(p.x * 91 + p.y * 57 + p.z * 73);
  return new THREE.Color(c).multiplyScalar(n * k);
}

/** Skin and hair are textured: the vertex colour tints the neutral texture. */
function tintOf(atlas: Atlas, c: string | THREE.Color, k = 1): THREE.Color {
  return new THREE.Color(c).multiplyScalar((255 / atlas.neutral) * k);
}

// --- the face --------------------------------------------------------------

/** Moves the face's points for a look (a broader jaw, a longer nose...). */
function faceField(a: Anatomy, look: Look): (p: V) => void {
  const f = look.face ?? {};
  const jaw = f.jaw ?? 0;
  const nose = f.nose ?? 0;
  const brow = f.brow ?? 0;
  const cheeks = f.cheeks ?? 0;
  const age = f.age ?? 0;
  const front = a.eyeZ - 0.06;
  return (p: V) => {
    if (p.y < a.chinY - 0.03 || p.y > a.headTop + 0.01) return;
    const fz = smooth(front - 0.02, front + 0.03, p.z);
    // The jaw: wider (or narrower) below the mouth.
    const below = smooth(a.mouthY + 0.02, a.chinY, p.y);
    p.x *= 1 + 0.09 * jaw * below;
    // Cheeks: fuller or hollow between the mouth and the eyes, either side.
    const ch =
      smooth(a.chinY, a.mouthY, p.y) *
      (1 - smooth(a.eyeY - 0.015, a.eyeY + 0.005, p.y)) *
      smooth(0.025, 0.05, Math.abs(p.x)) *
      fz;
    p.x += Math.sign(p.x) * 0.006 * cheeks * ch;
    p.z += 0.003 * cheeks * ch;
    // The nose: longer and bigger.
    const nz =
      smooth(a.eyeZ - 0.005, a.eyeZ + 0.02, p.z) *
      (1 - smooth(0.012, 0.026, Math.abs(p.x))) *
      smooth(a.mouthY + 0.008, a.mouthY + 0.02, p.y) *
      (1 - smooth(a.eyeY - 0.005, a.eyeY + 0.01, p.y));
    p.z += 0.007 * nose * nz;
    p.y -= 0.003 * nose * nz;
    // The brow ridge.
    const bz =
      smooth(a.eyeY + 0.008, a.eyeY + 0.018, p.y) *
      (1 - smooth(a.eyeY + 0.03, a.eyeY + 0.05, p.y)) *
      fz;
    p.z += 0.004 * brow * bz;
    // Age: the cheeks and jowls drop a little.
    const sag =
      smooth(a.eyeY - 0.01, a.mouthY, p.y) *
      (1 - smooth(a.mouthY - 0.02, a.chinY - 0.01, p.y)) *
      smooth(0.02, 0.045, Math.abs(p.x)) *
      fz;
    p.y -= 0.004 * age * sag;
  };
}

// --- the tailor --------------------------------------------------------------

export interface Cut {
  geometry: THREE.BufferGeometry;
  /** Triangles by part (for tests and the budget). */
  parts: Record<string, number>;
  triangles: number;
}

/** Cuts a look's clothes and puts it all together. */
export function tailor(a: Anatomy, look: Look): Cut {
  const t = a.t;
  const atlas = t.atlas;
  const out = new Out();
  const parts: Record<string, number> = {};
  let counted = 0;
  const note = (name: string) => {
    const n = out.idx.length / 3;
    parts[name] = (parts[name] ?? 0) + n - counted;
    counted = n;
  };
  const male = t.sex === "m";
  const build = look.build ?? 0;
  const B = (n: string) => a.bone.get(n) ?? v3();

  // --- the body as this person has it -------------------------------------
  // A little less of a superhero (the base body is one), heavier or
  // slighter, with straight legs and arms under the cloth.
  const work = new Float32Array(a.pos);
  const face = faceField(a, look);
  const hipL = B("thigh_l");
  const footL = B("foot_l");
  const armX0 = Math.abs(B("upperarm_l").x);
  const sexK = male ? 1 : 0.88;
  const legR = (y: number) =>
    sexK *
    (y > a.kneeY
      ? lerp(0.064, 0.086, clamp((y - a.kneeY) / (a.crotchY - a.kneeY), 0, 1))
      : lerp(
          0.057,
          0.064,
          clamp((y - a.ankleY) / (a.kneeY - a.ankleY), 0, 1),
        )) *
    (1 + 0.06 * build);
  const armR = (x: number) =>
    sexK *
    lerp(0.05, 0.04, clamp((x - armX0) / (a.wristX - armX0), 0, 1)) *
    (1 + 0.06 * build);
  const q = v3();
  for (let k = 0; k < a.n; k++) {
    q.set(a.pos[k * 3], a.pos[k * 3 + 1], a.pos[k * 3 + 2]);
    const r = a.regionAt(k);
    const ax = Math.abs(q.x);
    if (r === R.Head || r === R.Neck) face(q);
    if (
      r === R.UArm ||
      r === R.LArm ||
      (r === R.Torso && ax > armX0 - 0.04 && q.y > a.shoulderY - 0.12)
    ) {
      // Arms: round, without the muscle.
      const f =
        smooth(armX0 - 0.05, armX0 + 0.06, ax) *
        (1 - smooth(a.wristX - 0.05, a.wristX - 0.01, ax));
      const dy = q.y - a.shoulderY;
      const dz = q.z - a.armZ;
      const d = Math.hypot(dy, dz) || 1;
      const want = lerp(d, armR(ax), 0.75 * f);
      q.y = a.shoulderY + (dy / d) * want;
      q.z = a.armZ + (dz / d) * want;
      if (r !== R.LArm) {
        q.y -=
          0.012 *
          smooth(armX0 - 0.06, armX0, ax) *
          smooth(a.shoulderY - 0.02, a.shoulderY + 0.06, q.y);
      }
    } else if (
      r === R.Thigh ||
      r === R.Calf ||
      (r === R.Pelvis && q.y < a.crotchY + 0.02 && ax > 0.03)
    ) {
      // Legs: straight tubes from the hip down.
      const tt = clamp((hipL.y - q.y) / (hipL.y - footL.y), 0, 1);
      const cx = Math.sign(q.x) * lerp(Math.abs(hipL.x), Math.abs(footL.x), tt);
      const cz = lerp(hipL.z, footL.z, tt) + 0.01;
      const dx = q.x - cx;
      const dz = q.z - cz;
      const d = Math.hypot(dx, dz) || 1;
      const f = 0.7 * smooth(a.ankleY - 0.01, a.ankleY + 0.05, q.y);
      const want = lerp(d, legR(q.y), f);
      q.x = cx + (dx / d) * want;
      q.z = cz + (dz / d) * want;
    }
    if (r === R.Torso || r === R.Pelvis) {
      const chest = smooth(a.waistY, a.shoulderY, q.y);
      q.x *= 1 + 0.05 * build - (male ? 0.16 : 0.05) * chest;
      if (q.z > a.spineZ + 0.03) {
        q.z =
          a.spineZ +
          0.03 +
          (q.z - a.spineZ - 0.03) * (1 - (male ? 0.25 : 0.1) * chest);
      }
      const belly =
        Math.max(0, build) *
        smooth(a.crotchY, a.waistY, q.y) *
        (1 - smooth(a.waistY + 0.05, a.shoulderY - 0.1, q.y)) *
        smooth(a.spineZ, a.spineZ + 0.1, q.z);
      q.z += 0.045 * belly;
      // Nothing to see between the legs.
      if (q.y < a.crotchY + 0.1 && ax < 0.09 && q.z > a.spineZ) {
        const zf = hipL.z + 0.01 + legR(q.y) * 0.8;
        if (q.z > zf)
          q.z = lerp(q.z, zf, smooth(a.crotchY + 0.1, a.crotchY + 0.03, q.y));
      }
    } else if (r === R.Neck && male) {
      q.x *= 0.9;
      q.z = a.neckZ + (q.z - a.neckZ) * 0.9;
    }
    work[k * 3] = q.x;
    work[k * 3 + 1] = q.y;
    work[k * 3 + 2] = q.z;
  }

  // --- where each garment is -------------------------------------------
  const front = (p: V) => p.z - (a.spineZ + 0.015);
  /** Below the neckline (the front lower than the back), near the neck only. */
  const neckline =
    (drop: number): Field =>
    (p) => {
      const line =
        a.neckY - drop + 0.035 * smooth(a.neckZ + 0.02, a.neckZ - 0.05, p.z);
      // Away from the neck (the shoulders) it's no edge at all; but never
      // on the head.
      const rad = Math.hypot(p.x, p.z - a.neckZ);
      const away =
        smooth(a.neckR + 0.03, a.neckR + 0.08, rad) *
        (1 - smooth(a.neckY + 0.02, a.neckY + 0.05, p.y));
      return lerp(line - p.y, 0.2, away);
    };
  const cuff =
    (x: number): Field =>
    (p) =>
      x - Math.abs(p.x);
  const above =
    (y: number): Field =>
    (p) =>
      p.y - y;
  const below =
    (y: number): Field =>
    (p) =>
      y - p.y;
  /** Outside the V of a lapelled front (w at the top, down to the button at b). */
  const vTop = a.neckY - 0.02;
  const vHalf = (y: number, w: number, b: number) =>
    y < b ? 0 : (w * (y - b)) / (vTop - b);
  const notV =
    (w: number, b: number): Field =>
    (p) =>
      Math.max(Math.abs(p.x) - vHalf(p.y, w, b), b - p.y, -front(p));
  /** Outside the cutaway below a jacket's button. */
  const notCutaway =
    (b: number, hem: number): Field =>
    (p) =>
      Math.max(
        Math.abs(p.x) -
          (male ? 0.075 : 0.05) *
            Math.pow(clamp((b - p.y) / (b - hem), 0, 1), 1.3),
        p.y - b,
        -front(p),
      );
  const all =
    (...fs: Field[]): Field =>
    (p, r) => {
      let m = Infinity;
      for (const f of fs) m = Math.min(m, f(p, r));
      return m;
    };

  const cut = look.cut ?? "single";
  const buttonY =
    cut === "double"
      ? lerp(a.waistY, a.shoulderY, 0.42)
      : cut === "closed"
        ? lerp(a.waistY, a.shoulderY, 0.8)
        : lerp(a.waistY, a.shoulderY, 0.2);
  const vW = cut === "closed" ? 0.03 : male ? 0.085 : 0.075;
  const shirtCuff = a.wristX - 0.006;
  const hemY = a.ankleY + 0.035;
  const shoeTop = a.ankleY + 0.05;
  const jHem = a.crotchY + 0.012;
  const jCuff = a.wristX - 0.024;
  const coatCuff = a.wristX - 0.014;
  const coatHem = a.kneeY - (look.coatCut === "trench" ? 0.12 : 0.08);
  const cbY = lerp(
    a.waistY,
    a.shoulderY,
    look.coatCut === "trench" ? 0.5 : 0.45,
  );
  const cW = 0.1;

  const shells: ShellSpec[] = [];
  shells.push({
    name: "shirt",
    field: all(above(a.waistY - 0.06), cuff(shirtCuff), neckline(0.0)),
    thick: 0.004,
    passes: 5,
    color: look.shirt,
    swatch: "cotton",
    layer: 1,
  });
  shells.push({
    name: "shoes",
    field: below(shoeTop),
    thick: (p) => (p.y < 0.02 ? 0.005 : 0.011),
    passes: 10,
    color: look.shoes,
    swatch: "leather",
    shape: (p) => {
      if (p.y < 0.03) p.y = Math.max(0.004, p.y * 0.4);
    },
    layer: 1.5,
  });
  shells.push({
    name: look.skirt ? "skirt" : "trousers",
    field: all(
      below(a.waistY + 0.01),
      above(look.skirt ? a.crotchY - 0.03 : hemY),
    ),
    thick: 0.007,
    passes: 7,
    color: look.skirt ?? look.trousers,
    swatch: "wool",
    layer: 2,
  });
  if (look.waistcoat) {
    shells.push({
      name: "waistcoat",
      field: all(
        (p) =>
          p.y -
          (a.waistY -
            0.07 -
            0.04 * smooth(0.07, 0, Math.abs(p.x)) * smooth(0, 0.04, front(p))),
        cuff(male ? 0.165 : 0.15),
        neckline(0.02),
        notV(0.075, a.waistY + 0.1),
      ),
      thick: 0.009,
      passes: 6,
      color: look.waistcoat,
      swatch: "satin",
      layer: 4,
    });
  }
  if (look.sweater) {
    shells.push({
      name: "sweater",
      field: all(
        above(a.waistY - 0.08),
        cuff(a.wristX - 0.03),
        neckline(0.012),
      ),
      thick: 0.013,
      passes: 8,
      color: look.sweater,
      swatch: "tweed",
      layer: 5,
    });
  }
  if (look.jacket && !look.waistcoat) {
    const fs: Field[] = [
      above(jHem),
      cuff(jCuff),
      neckline(0.012),
      notV(vW, buttonY),
    ];
    if (cut !== "closed") fs.push(notCutaway(buttonY - 0.03, jHem));
    shells.push({
      name: "jacket",
      field: all(...fs),
      thick: (_p, r) => (r === R.UArm || r === R.LArm ? 0.014 : 0.017),
      passes: 9,
      color: look.jacket,
      swatch: "wool",
      layer: 6,
    });
  }
  if (look.coat) {
    shells.push({
      name: "coat",
      field: all(
        above(a.crotchY + 0.02),
        cuff(coatCuff),
        neckline(0.03),
        notV(cW, cbY),
      ),
      thick: (_p, r) => (r === R.UArm || r === R.LArm ? 0.026 : 0.03),
      passes: 10,
      color: look.coat,
      swatch: look.coatCut === "trench" ? "cotton" : "wool",
      layer: 8,
    });
  }
  const lofts: LoftSpec[] = [];
  if (look.coat) {
    lofts.push({
      name: "coat skirts",
      top: a.waistY - 0.02,
      bottom: coatHem,
      open: (u) => lerp(0.05, look.coatCut === "trench" ? 0.32 : 0.22, u * u),
      flare: 0.12,
      thick: 0.034,
      color: look.coat,
      swatch: look.coatCut === "trench" ? "cotton" : "wool",
      follow: 0.45,
      layer: 8,
    });
  }
  if (look.skirt) {
    lofts.push({
      name: "skirt",
      top: a.waistY - 0.04,
      bottom: a.kneeY - 0.05,
      open: () => 0,
      flare: 0,
      taper: 0.25,
      thick: 0.012,
      color: look.skirt,
      swatch: "wool",
      follow: 0.55,
      layer: 3,
    });
  }
  if (look.apron) {
    lofts.push({
      name: "apron",
      top: a.waistY + 0.01,
      bottom: a.kneeY - 0.14,
      open: () => 0,
      arc: 1.35,
      flare: 0.04,
      thick: 0.03,
      color: look.apron,
      swatch: "cotton",
      follow: 0.5,
      layer: 7,
    });
  }

  // The lofts first: their fields are needed to cut away what's under them.
  const loftFields: { layer: number; field: Field }[] = [];
  for (const l of lofts)
    loftFields.push({ layer: l.layer, field: makeLoft(a, work, l, out) });
  note("lofts");

  /** How far inside any layer above `layer` a point is. */
  const coveredBy = (layer: number): Field => {
    const fs = [
      ...shells.filter((s) => s.layer > layer).map((s) => s.field),
      ...loftFields.filter((l) => l.layer > layer).map((l) => l.field),
    ];
    return (p, r) => {
      let m = -Infinity;
      for (const f of fs) m = Math.max(m, f(p, r));
      return m;
    };
  };
  const fieldAt = (m: Cloth, f: Field) => {
    const vals = new Float32Array(m.reg.length);
    const p = v3();
    for (let i = 0; i < vals.length; i++) {
      p.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
      vals[i] = f(p, m.reg[i] as R);
    }
    return vals;
  };

  // --- the body: what isn't covered ---------------------------------------
  const body = t.pieces.Body;
  const nb = body.pos.length / 3;
  const bodyCloth: Cloth = {
    pos: new Array<number>(nb * 3),
    nrm: Array.from(body.nrm),
    uv: Array.from(body.uv),
    jnt: Array.from(body.jnt),
    wgt: Array.from(body.wgt),
    reg: new Array<number>(nb),
    idx: Array.from(body.idx),
  };
  for (let i = 0; i < nb; i++) {
    const k = a.weld[i];
    bodyCloth.pos[i * 3] = work[k * 3];
    bodyCloth.pos[i * 3 + 1] = work[k * 3 + 1];
    bodyCloth.pos[i * 3 + 2] = work[k * 3 + 2];
    bodyCloth.reg[i] = a.reg[k];
  }
  const allCover = coveredBy(0);
  const shown = clip(
    bodyCloth,
    fieldAt(bodyCloth, (p, r) => OVERLAP - allCover(p, r)),
  );
  {
    const skin = tintOf(atlas, look.skin);
    const hands = tintOf(atlas, look.skin, 0.78);
    const stockings = look.legs ? tintOf(atlas, look.legs, 0.9) : null;
    const stubble = look.facial === "stubble";
    const age = look.face?.age ?? 0;
    const p = v3();
    const n = v3();
    const base = out.count;
    for (let i = 0; i < shown.reg.length; i++) {
      p.set(shown.pos[i * 3], shown.pos[i * 3 + 1], shown.pos[i * 3 + 2]);
      n.set(shown.nrm[i * 3], shown.nrm[i * 3 + 1], shown.nrm[i * 3 + 2]);
      const r = shown.reg[i] as R;
      let c = (r === R.Hand ? hands : skin).clone();
      if (stockings && (r === R.Calf || r === R.Thigh || r === R.Foot))
        c = stockings.clone();
      if (r === R.Head) {
        if (stubble) {
          // A day's growth: the lower face darker.
          const m =
            smooth(a.mouthY + 0.01, a.chinY + 0.005, p.y) *
              smooth(a.eyeZ - 0.08, a.eyeZ - 0.04, p.z) +
            smooth(a.mouthY + 0.004, a.mouthY - 0.004, p.y) *
              smooth(a.eyeZ - 0.07, a.eyeZ - 0.03, p.z) *
              (1 - smooth(0.012, 0.03, Math.abs(p.x)));
          c.multiplyScalar(1 - 0.2 * clamp(m, 0, 1));
        }
        // Older skin: a touch greyer, and darker under the eyes.
        if (age > 0) {
          const under =
            smooth(a.eyeY - 0.03, a.eyeY - 0.012, p.y) *
            (1 - smooth(a.eyeY - 0.012, a.eyeY - 0.004, p.y)) *
            (1 - smooth(0.045, 0.06, Math.abs(p.x)));
          c.multiplyScalar(1 - 0.12 * age * under);
          const l = (c.r + c.g + c.b) / 3;
          c.lerp(new THREE.Color(l, l, l), 0.12 * age);
        }
      }
      out.vert(
        p,
        n,
        [shown.uv![i * 2], shown.uv![i * 2 + 1]],
        c,
        shown.jnt.slice(i * 4, i * 4 + 4),
        shown.wgt.slice(i * 4, i * 4 + 4),
      );
    }
    for (const v of shown.idx) out.idx.push(base + v);
  }
  note("body");

  // --- the shells -------------------------------------------------------
  const whole: Cloth = {
    pos: Array.from(work),
    nrm: Array.from(a.nrm),
    uv: null,
    jnt: Array.from(a.jnt),
    wgt: Array.from(a.wgt),
    reg: Array.from(a.reg),
    idx: Array.from(a.tris),
  };
  const p = v3();
  const nrm = v3();
  for (const s of shells) {
    const own = fieldAt(whole, s.field);
    const hidden = fieldAt(whole, coveredBy(s.layer));
    const f = new Float32Array(own.length);
    for (let i = 0; i < f.length; i++)
      f[i] = Math.min(own[i], OVERLAP - hidden[i]);
    const m = clip(whole, f);
    if (m.idx.length === 0) continue;
    iron(m, s.passes);
    if (s.shape) {
      for (let i = 0; i < m.reg.length; i++) {
        p.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
        s.shape(p, m.reg[i] as R);
        m.pos[i * 3] = p.x;
        m.pos[i * 3 + 1] = p.y;
        m.pos[i * 3 + 2] = p.z;
      }
    }
    normals(m);
    for (let i = 0; i < m.reg.length; i++) {
      p.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
      const th =
        typeof s.thick === "number" ? s.thick : s.thick(p, m.reg[i] as R);
      for (let d = 0; d < 3; d++) m.pos[i * 3 + d] += m.nrm[i * 3 + d] * th;
    }
    normals(m);
    const uv = atlas.swatches[s.swatch] ?? atlas.swatches.wool;
    const base = out.count;
    for (let i = 0; i < m.reg.length; i++) {
      p.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
      nrm.set(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]);
      out.vert(
        p,
        nrm,
        uv,
        cloth(s.color, p),
        m.jnt.slice(i * 4, i * 4 + 4),
        m.wgt.slice(i * 4, i * 4 + 4),
      );
    }
    for (const v of m.idx) out.idx.push(base + v);
    note(s.name);
  }

  // --- the pieces --------------------------------------------------------
  // The neck as it is (a man's was made slimmer).
  const pieces = new Pieces(
    a,
    out,
    atlas,
    work,
    male ? a.neckR * 0.9 : a.neckR,
  );
  if (look.jacket && !look.waistcoat && cut !== "closed") {
    pieces.lapels(
      0.017,
      look.jacket,
      buttonY,
      vW,
      0.016,
      cut === "double",
      0.062,
    );
    pieces.collar(look.jacket, 0.02, 0.026, 0.7, false);
  }
  if (look.jacket && !look.waistcoat) {
    pieces.buttons(0.017, look.braid ?? "#1a1714", cut, buttonY, !!look.braid);
  }
  if (look.braid && look.jacket) pieces.boards(look.braid);
  if (look.waistcoat)
    pieces.buttons(0.009, "#2a2a2c", "waistcoat", a.waistY + 0.1, false);
  if (look.coat) {
    pieces.lapels(
      0.03,
      look.coat,
      cbY,
      cW,
      0.018,
      look.coatCut === "trench",
      0.078,
    );
    pieces.collar(
      look.coat,
      0.034,
      look.collarUp ? 0.07 : 0.045,
      look.collarUp ? 0.3 : 0.5,
      !!look.collarUp,
    );
    pieces.buttons(0.03, "#141210", "double", cbY - 0.02, false);
    if (look.coatCut === "trench")
      pieces.belt(look.coat, a.waistY - 0.01, 0.045);
  }
  if (!look.sweater || look.tie)
    pieces.shirtCollar(look.shirt, look.sweater ? 0.016 : 0.005);
  // The tie ends at the belt (or where the jacket closes over it).
  if (look.tie)
    pieces.tie(
      look.tie,
      Math.max(
        a.waistY + 0.02,
        look.jacket && cut === "single" ? buttonY - 0.02 : 0,
      ),
    );
  if (look.scarf) pieces.scarf(look.scarf, look.coat ? 0.03 : 0.02);
  if (look.sweater) pieces.ribbing(look.sweater);
  note("pieces");

  // --- the head ----------------------------------------------------------
  const hairColor = new THREE.Color(look.hair);
  const grey = clamp(look.grey ?? 0, 0, 1);
  const greyCol = new THREE.Color("#b9b5ae");
  const hairTint = (hp: V) => {
    const side =
      smooth(0.04, 0.08, Math.abs(hp.x)) *
      (1 - smooth(a.eyeY + 0.07, a.eyeY + 0.11, hp.y));
    const g = clamp(grey * (0.55 + 0.6 * side), 0, 1);
    return tintOf(
      atlas,
      hairColor.clone().lerp(greyCol, g),
      0.95 + 0.05 * Math.sin(hp.x * 400 + hp.y * 300),
    );
  };
  const hatY = look.hat
    ? a.headTop -
      (look.hat.kind === "beret" || look.hat.kind === "flatcap" ? 0.045 : 0.055)
    : Infinity;
  const hair = hairPieceOf(t, look);
  if (hair) {
    const shape = hair.shape?.(a);
    pieces.mesh(t.pieces[hair.piece], hairTint, (hp) => {
      shape?.(hp);
      face(hp);
      return hair.keep(hp, a) && hp.y < hatY + 0.02;
    });
  }
  const facialHair = look.facial ?? (look.moustache ? "moustache" : undefined);
  if (
    (facialHair === "beard" || facialHair === "moustache") &&
    t.pieces.Hair_Beard
  ) {
    const moustache = facialHair === "moustache";
    pieces.mesh(t.pieces.Hair_Beard, hairTint, (hp) => {
      face(hp);
      return (
        !moustache ||
        (hp.y > a.mouthY - 0.006 &&
          hp.y < a.mouthY + 0.022 &&
          Math.abs(hp.x) < 0.036)
      );
    });
  }
  if (t.pieces.Brows) {
    const c = tintOf(
      atlas,
      hairColor
        .clone()
        .lerp(greyCol, grey * 0.4)
        .multiplyScalar(0.8),
    );
    pieces.mesh(
      t.pieces.Brows,
      () => c,
      (hp) => {
        face(hp);
        return true;
      },
    );
  }
  if (t.pieces.Eyes) {
    const white = new THREE.Color(1, 1, 1);
    pieces.mesh(
      t.pieces.Eyes,
      () => white,
      () => true,
    );
  }
  if (look.glasses)
    pieces.glasses(look.glasses === "round" ? "round" : "square");
  if (look.hat) pieces.hat(look.hat, hatY);
  note("head");
  return { geometry: out.geometry(), parts, triangles: out.idx.length / 3 };
}

// --- lofts: what hangs -------------------------------------------------------

function profile(
  a: Anatomy,
  work: Float32Array,
  y: number,
  cz: number,
): number[] {
  const r = new Array<number>(K).fill(0);
  for (let k = 0; k < a.n; k++) {
    const reg = a.regionAt(k);
    if (
      reg !== R.Pelvis &&
      reg !== R.Thigh &&
      reg !== R.Torso &&
      reg !== R.Calf
    )
      continue;
    if (Math.abs(work[k * 3 + 1] - y) > 0.035) continue;
    const x = work[k * 3];
    const z = work[k * 3 + 2] - cz;
    const bin =
      ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * K) % K) + K) % K;
    r[bin] = Math.max(r[bin], Math.hypot(x, z));
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < K; i++) {
      if (r[i] === 0) r[i] = Math.max(r[(i + 1) % K], r[(i + K - 1) % K]);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const c = r.slice();
    for (let i = 0; i < K; i++) {
      r[i] = Math.max(
        c[i] * 0.5 + c[(i + 1) % K] * 0.25 + c[(i + K - 1) % K] * 0.25,
        c[i] * 0.97,
      );
    }
  }
  return r;
}

function sampleRing(r: number[], ang: number): number {
  let u = (ang / (Math.PI * 2)) * K;
  u = ((u % K) + K) % K;
  const i = Math.floor(u);
  return lerp(r[i], r[(i + 1) % K], u - i);
}

/** Builds a loft into `out`; returns its field (to cut away what it covers). */
function makeLoft(
  a: Anatomy,
  work: Float32Array,
  s: LoftSpec,
  out: Out,
): Field {
  let zmin = Infinity;
  let zmax = -Infinity;
  for (let k = 0; k < a.n; k++) {
    if (a.regionAt(k) !== R.Pelvis) continue;
    zmin = Math.min(zmin, work[k * 3 + 2]);
    zmax = Math.max(zmax, work[k * 3 + 2]);
  }
  const cz = (zmin + zmax) / 2;
  const rings: number[][] = [];
  for (let i = 0; i < RINGS; i++) {
    const y = lerp(s.top, s.bottom, i / (RINGS - 1));
    // Below the knee the legs are thin: measure no lower than the thigh.
    const r = profile(a, work, Math.max(y, a.kneeY + 0.06), cz);
    if (i > 0) {
      const prev = rings[i - 1];
      for (let j = 0; j < K; j++) {
        const fall = prev[j] * (1 - (s.taper ?? 0) / RINGS);
        r[j] = s.taper
          ? Math.min(Math.max(r[j], fall), prev[j])
          : Math.max(r[j], fall);
      }
    }
    rings.push(r);
  }
  const uv = a.t.atlas.swatches[s.swatch] ?? a.t.atlas.swatches.wool;
  const pelvis = a.bi("pelvis");
  const thighL = a.bi("thigh_l");
  const thighR = a.bi("thigh_r");
  const cols = s.arc ? 18 : K;
  const base = out.count;
  const p = v3();
  const n = v3();
  for (let i = 0; i < RINGS; i++) {
    const u = i / (RINGS - 1);
    const y = lerp(s.top, s.bottom, u);
    const half = s.arc ?? Math.PI - s.open(u);
    for (let j = 0; j <= cols; j++) {
      // Round the back from one side of the opening to the other (or an
      // arc across the front).
      const ang = s.arc
        ? -half + (j / cols) * 2 * half
        : Math.PI - half + (j / cols) * 2 * half;
      const rr = sampleRing(rings[i], ang) * (1 + s.flare * u * u) + s.thick;
      p.set(Math.sin(ang) * rr, y, cz + Math.cos(ang) * rr);
      n.set(Math.sin(ang), 0.15, Math.cos(ang)).normalize();
      const follow = s.follow * smooth(0, 1, u);
      const side = smooth(-0.05, 0.05, p.x);
      out.vert(
        p,
        n,
        uv,
        cloth(s.color, p, j === 0 || j === cols ? 0.85 : 1),
        [pelvis, thighL, thighR, 0],
        [1 - follow, follow * side, follow * (1 - side), 0],
      );
    }
  }
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a0 = base + i * (cols + 1) + j;
      const b0 = a0 + cols + 1;
      out.tri(a0, b0, a0 + 1);
      out.tri(a0 + 1, b0, b0 + 1);
    }
  }
  return (q) => {
    const u = clamp((s.top - q.y) / (s.top - s.bottom), 0, 1);
    const ang = Math.abs(Math.atan2(q.x, q.z - cz));
    const open = s.arc ? Math.PI - s.arc : s.open(u);
    return Math.min(
      s.top - 0.02 - q.y,
      q.y - s.bottom,
      (ang - open - 0.12) * 0.15,
    );
  };
}

/** Which of the kit's hair meshes a haircut is, and how it's cut. */
function hairPieceOf(
  t: BodyTemplate,
  look: Look,
): {
  piece: string;
  keep: (p: V, a: Anatomy) => boolean;
  shape?: (a: Anatomy) => (p: V) => void;
} | null {
  const has = (k: string) => k in t.pieces;
  const all = () => true;
  let style = look.hairStyle;
  if (style === "short" || style === "grey_short")
    style = t.sex === "m" ? "parted" : "cropped";
  if (
    t.sex === "f" &&
    ["parted", "slick", "receding", "buzzed"].includes(style)
  )
    style = "cropped";
  if (t.sex === "m" && ["long", "bob", "buns", "cropped"].includes(style))
    style = "parted";
  const pick = (
    piece: string,
    keep: (p: V, a: Anatomy) => boolean = all,
    shape?: (a: Anatomy) => (p: V) => void,
  ) => (has(piece) ? { piece, keep, shape } : null);
  switch (style) {
    case "parted":
      return pick("Hair_SimpleParted");
    case "slick":
      // Combed flat and back.
      return pick("Hair_SimpleParted", all, (a) => (p) => {
        p.y = a.eyeY + (p.y - a.eyeY) * 0.93;
        p.z = a.headZ + (p.z - a.headZ) * 0.97 - 0.004;
        p.x *= 0.97;
      });
    case "receding":
      return pick(
        "Hair_SimpleParted",
        (p, a) =>
          !(p.z > a.headZ + 0.015 && p.y > a.eyeY + 0.05) &&
          !(p.y > a.headTop - 0.03 && p.z > a.headZ - 0.03),
      );
    case "buzzed":
      return pick("Hair_Buzzed");
    case "bald":
      return pick(
        "Hair_Buzzed",
        (p, a) => p.y < a.eyeY + 0.07 && p.z < a.headZ,
      );
    case "long":
      return pick("Hair_Long");
    case "bob":
      return pick("Hair_Long", (p, a) => p.y > a.chinY + 0.005);
    case "buns":
      return pick("Hair_Buns");
    case "cropped":
      return pick("Hair_BuzzedFemale");
  }
  return null;
}

// --- small pieces: lapels, collars, ties, buttons, hats ---------------------

class Pieces {
  private readonly grid = new Map<number, number[]>();
  /** The front of the body, sampled (cached per half centimetre). */
  private readonly fits = new Map<number, number>();
  private readonly front: number[] = [];

  constructor(
    private readonly a: Anatomy,
    private readonly out: Out,
    private readonly atlas: Atlas,
    private readonly work: Float32Array,
    readonly neckR: number,
  ) {
    for (let k = 0; k < a.n; k++) {
      if (
        a.nrm[k * 3 + 2] > 0.2 &&
        work[k * 3 + 2] > a.spineZ &&
        Math.abs(work[k * 3]) < 0.2
      )
        this.front.push(k);
      const key = this.key(work[k * 3], work[k * 3 + 1], work[k * 3 + 2]);
      let l = this.grid.get(key);
      if (!l) this.grid.set(key, (l = []));
      l.push(k);
    }
  }

  private key(x: number, y: number, z: number): number {
    return (
      (Math.floor(x / 0.03) + 64) * 16384 +
      (Math.floor(y / 0.03) + 16) * 128 +
      (Math.floor(z / 0.03) + 64)
    );
  }

  /** The body vertex nearest a point (for its skin weights). */
  private nearest(p: V): number {
    let best = 0;
    let bd = Infinity;
    for (let r = 1; r < 6 && bd === Infinity; r++) {
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (let dz = -r; dz <= r; dz++) {
            const l = this.grid.get(
              this.key(p.x + dx * 0.03, p.y + dy * 0.03, p.z + dz * 0.03),
            );
            if (!l) continue;
            for (const k of l) {
              const d =
                (this.work[k * 3] - p.x) ** 2 +
                (this.work[k * 3 + 1] - p.y) ** 2 +
                (this.work[k * 3 + 2] - p.z) ** 2;
              if (d < bd) {
                bd = d;
                best = k;
              }
            }
          }
    }
    return best;
  }

  private skinNear(p: V): { j: ArrayLike<number>; w: ArrayLike<number> } {
    const k = this.nearest(p);
    return {
      j: this.a.jnt.subarray(k * 4, k * 4 + 4),
      w: this.a.wgt.subarray(k * 4, k * 4 + 4),
    };
  }

  private rigid(bone: string): { j: number[]; w: number[] } {
    return { j: [this.a.bi(bone), 0, 0, 0], w: [1, 0, 0, 0] };
  }

  /**
   * How far forward the front of a layer is at (x, y): the body's front,
   * blurred over a few centimetres (no bumps), plus the cloth's thickness.
   */
  frontZ(thick: number, x: number, y: number): number {
    const key = Math.round(x * 200) * 4096 + Math.round(y * 200);
    let z = this.fits.get(key);
    if (z === undefined) {
      let wz = 0;
      let ws = 0;
      const a = this.a;
      for (const k of this.front) {
        const dx = this.work[k * 3] - x;
        const dy = this.work[k * 3 + 1] - y;
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) continue;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * 0.018 * 0.018));
        wz += w * this.work[k * 3 + 2];
        ws += w;
      }
      z = ws > 1e-6 ? wz / ws : a.spineZ + 0.12;
      this.fits.set(key, z);
    }
    return z + thick;
  }

  /** A strip of quads from rows of points (each row the same length). */
  private sheet(
    rows: V[][],
    color: string | THREE.Color,
    swatch: string,
    skin: "nearest" | { j: number[]; w: number[] },
    shade?: (i: number, j: number) => number,
  ): void {
    const uv = this.atlas.swatches[swatch] ?? this.atlas.swatches.wool;
    const ids: number[][] = [];
    const n = v3();
    const e1 = v3();
    const e2 = v3();
    for (let i = 0; i < rows.length; i++) {
      ids.push([]);
      for (let j = 0; j < rows[i].length; j++) {
        const p = rows[i][j];
        e1.subVectors(
          rows[Math.min(rows.length - 1, i + 1)][j],
          rows[Math.max(0, i - 1)][j],
        );
        e2.subVectors(
          rows[i][Math.min(rows[i].length - 1, j + 1)],
          rows[i][Math.max(0, j - 1)],
        );
        // The same way round as the triangles below.
        n.crossVectors(e1, e2);
        if (n.lengthSq() === 0) n.set(0, 0, 1);
        n.normalize();
        const sk = skin === "nearest" ? this.skinNear(p) : skin;
        const col =
          typeof color === "string"
            ? cloth(color, p, shade?.(i, j) ?? 1)
            : color;
        ids[i].push(this.out.vert(p, n, uv, col, sk.j, sk.w));
      }
    }
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < rows[i].length - 1; j++) {
        this.out.tri(ids[i][j], ids[i + 1][j], ids[i][j + 1]);
        this.out.tri(ids[i][j + 1], ids[i + 1][j], ids[i + 1][j + 1]);
      }
    }
  }

  /** Lapels: two flaps turned back along the V, widest across the chest. */
  lapels(
    on: number,
    color: string,
    bottom: number,
    vw: number,
    lift: number,
    peak: boolean,
    width: number,
  ): void {
    const a = this.a;
    const top = a.neckY - 0.02;
    const N = 12;
    for (const s of [-1, 1]) {
      const rows: V[][] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const y = lerp(bottom, top, u);
        const inner = (vw * (y - bottom)) / (top - bottom);
        // Narrow at the button, wide by the chest, then the notch (or a
        // peak) where it meets the collar.
        let w = width * Math.min(1, 0.15 + 1.1 * Math.pow(u, 0.7));
        if (peak) {
          if (u > 0.82)
            w *= 1 + 0.5 * smooth(0.82, 0.9, u) - 0.9 * smooth(0.9, 1, u);
        } else if (u > 0.8) {
          w *= 1 - 0.55 * smooth(0.8, 0.86, u) - 0.25 * smooth(0.9, 1, u);
        }
        const row: V[] = [];
        for (let j = 0; j <= 3; j++) {
          const x = s * (inner + (w * j) / 3);
          // Raised at the fold, lying flatter at the edge.
          const z = this.frontZ(on, x, y) + lift * [1.0, 0.85, 0.6, 0.35][j];
          row.push(v3(x, y - 0.006 * (j / 3) * u, z));
        }
        rows.push(s > 0 ? row : row.reverse());
      }
      this.sheet(rows, color, "wool", "nearest", (_i, j) => {
        const e = s > 0 ? j : 3 - j;
        return e === 0 ? 0.9 : e === 3 ? 0.68 : 1;
      });
    }
  }

  /** The collar round the back of the neck; turned up, it hides the jaw. */
  collar(
    color: string,
    gap: number,
    height: number,
    frontGap: number,
    up: boolean,
  ): void {
    const a = this.a;
    const rows: V[][] = [];
    const cols = 16;
    const half = Math.PI - frontGap;
    for (let i = 0; i < 3; i++) {
      const row: V[] = [];
      for (let j = 0; j <= cols; j++) {
        const ang = Math.PI - half + (j / cols) * 2 * half;
        const back = 0.5 - 0.5 * Math.cos(ang);
        const r =
          this.neckR + gap + (up ? 0.014 : 0.012) * i * (0.4 + 0.6 * back);
        const y =
          a.neckY -
          0.035 +
          0.03 * back +
          ((height * i) / 2) * (0.55 + 0.45 * back);
        row.push(v3(Math.sin(ang) * r * 1.12, y, a.neckZ + Math.cos(ang) * r));
      }
      rows.push(row);
    }
    this.sheet(rows, color, "wool", "nearest", (i) => (i === 2 ? 0.85 : 1));
  }

  shirtCollar(color: string, gap: number): void {
    const a = this.a;
    const rows: V[][] = [];
    const cols = 18;
    const half = Math.PI - 0.14;
    for (let i = 0; i < 2; i++) {
      const row: V[] = [];
      for (let j = 0; j <= cols; j++) {
        const ang = Math.PI - half + (j / cols) * 2 * half;
        const back = 0.5 - 0.5 * Math.cos(ang);
        const r = this.neckR + gap + 0.003 * i;
        const y = a.neckY - 0.03 + 0.022 * back + 0.04 * i;
        row.push(v3(Math.sin(ang) * r, y, a.neckZ + Math.cos(ang) * r));
      }
      rows.push(row);
    }
    this.sheet(rows, color, "cotton", "nearest", (i) => (i === 1 ? 1 : 0.9));
    // The points, lying on the shirt either side of the knot.
    for (const s of [-1, 1]) {
      const ang = s * 0.14;
      const r = this.neckR + gap + 0.003;
      const yTop = a.neckY + 0.01;
      const p0 = v3(
        Math.sin(ang) * r,
        yTop,
        a.neckZ + Math.cos(ang) * r + 0.002,
      );
      const p1 = v3(
        Math.sin(ang * 4) * (r + 0.004),
        yTop - 0.002,
        a.neckZ + Math.cos(ang * 4) * (r + 0.004),
      );
      const tipX = s * 0.03;
      const tipY = a.neckY - 0.04;
      const p2 = v3(tipX, tipY, this.frontZ(0.004, tipX, tipY) + 0.005);
      const p3 = v3(
        s * 0.01,
        a.neckY - 0.032,
        this.frontZ(0.004, s * 0.01, a.neckY - 0.032) + 0.008,
      );
      this.sheet(
        s > 0
          ? [
              [p0, p1],
              [p3, p2],
            ]
          : [
              [p1, p0],
              [p2, p3],
            ],
        color,
        "cotton",
        "nearest",
      );
    }
  }

  tie(color: string, bottom: number): void {
    const a = this.a;
    const top = a.neckY - 0.034;
    const rows: V[][] = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const y = lerp(top, bottom, u);
      const w = lerp(0.016, 0.038, Math.min(1, u * 1.2));
      const row: V[] = [];
      for (const x of [-w, 0, w]) {
        const z = this.frontZ(0.004, x, y) + 0.007 + (x === 0 ? 0.003 : 0);
        row.push(v3(x, i === N && x === 0 ? y - 0.03 : y, z));
      }
      rows.push(row);
    }
    this.sheet(rows, color, "silk", "nearest");
    // The knot.
    const kz = this.frontZ(0.004, 0, top + 0.01) + 0.012;
    const knot: V[][] = [
      [
        v3(-0.017, top + 0.024, kz - 0.006),
        v3(0, top + 0.026, kz),
        v3(0.017, top + 0.024, kz - 0.006),
      ],
      [
        v3(-0.013, top - 0.002, kz - 0.004),
        v3(0, top - 0.004, kz + 0.002),
        v3(0.013, top - 0.002, kz - 0.004),
      ],
    ];
    this.sheet(knot, color, "silk", "nearest", () => 0.88);
  }

  buttons(
    on: number,
    color: string,
    cut: string,
    y0: number,
    metal: boolean,
  ): void {
    const at: [number, number][] =
      cut === "double"
        ? [
            [-0.055, y0],
            [0.055, y0],
            [-0.055, y0 - 0.1],
            [0.055, y0 - 0.1],
          ]
        : cut === "closed"
          ? [0, 1, 2, 3].map((i) => [0, y0 - i * 0.085] as [number, number])
          : cut === "waistcoat"
            ? [0, 1, 2, 3].map((i) => [0, y0 - i * 0.045] as [number, number])
            : [
                [0, y0 - 0.005],
                [0, y0 - 0.105],
              ];
    for (const [x, y] of at) {
      const z = this.frontZ(on, x, y) + 0.003;
      const ring: V[] = [];
      for (let i = 0; i <= 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ring.push(v3(x + Math.cos(ang) * 0.009, y + Math.sin(ang) * 0.009, z));
      }
      this.sheet(
        [ring.map(() => v3(x, y, z + 0.003)), ring],
        color,
        metal ? "metal" : "plastic",
        "nearest",
      );
    }
  }

  /** Shoulder boards (a uniform). */
  boards(color: string): void {
    const a = this.a;
    for (const s of [-1, 1]) {
      const y = a.shoulderY + 0.055;
      const rows: V[][] = [];
      for (const x of [0.07, 0.17]) {
        const row: V[] = [];
        for (const z of [-0.035, 0.035])
          row.push(v3(s * x, y + (0.17 - x) * 0.25, a.armZ + 0.02 + z));
        rows.push(row);
      }
      this.sheet(s > 0 ? rows : rows.reverse(), color, "metal", "nearest");
    }
  }

  belt(color: string, y: number, outset: number): void {
    const a = this.a;
    const rad = new Array<number>(25).fill(0);
    for (let k = 0; k < a.n; k++) {
      if (Math.abs(this.work[k * 3 + 1] - y) > 0.03) continue;
      const x = this.work[k * 3];
      const z = this.work[k * 3 + 2] - a.spineZ;
      const j =
        ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * 24) % 24) + 24) % 24;
      rad[j] = Math.max(rad[j], Math.hypot(x, z));
    }
    rad[24] = rad[0];
    const rows: V[][] = [];
    for (const dy of [0.022, -0.022]) {
      const row: V[] = [];
      for (let j = 0; j <= 24; j++) {
        const ang = (j / 24) * Math.PI * 2;
        const r = (rad[j] || 0.15) + outset + 0.004;
        row.push(v3(Math.sin(ang) * r, y + dy, a.spineZ + Math.cos(ang) * r));
      }
      rows.push(row);
    }
    this.sheet(rows, color, "leather", "nearest", () => 0.8);
  }

  scarf(color: string, gap: number): void {
    const a = this.a;
    const rows: V[][] = [];
    for (let i = 0; i < 3; i++) {
      const row: V[] = [];
      for (let j = 0; j <= 20; j++) {
        const ang = (j / 20) * Math.PI * 2;
        const r = this.neckR + gap + (i === 1 ? 0.014 : 0);
        row.push(
          v3(
            Math.sin(ang) * r * 1.1,
            a.neckY - 0.045 + 0.024 * i,
            a.neckZ + Math.cos(ang) * r,
          ),
        );
      }
      rows.push(row);
    }
    this.sheet(rows, color, "tweed", "nearest");
  }

  /** A sweater's ribbed neck. */
  ribbing(color: string): void {
    const a = this.a;
    const rows: V[][] = [];
    for (let i = 0; i < 2; i++) {
      const row: V[] = [];
      for (let j = 0; j <= 20; j++) {
        const ang = (j / 20) * Math.PI * 2;
        const back = 0.5 - 0.5 * Math.cos(ang);
        const r = this.neckR + 0.018 + 0.004 * (1 - i);
        row.push(
          v3(
            Math.sin(ang) * r * 1.06,
            a.neckY - 0.045 + 0.022 * back + 0.02 * i,
            a.neckZ + Math.cos(ang) * r,
          ),
        );
      }
      rows.push(row);
    }
    this.sheet(rows, color, "tweed", "nearest", (i) => (i === 1 ? 0.85 : 1));
  }

  /** A mesh of the kit (hair, brows, eyes) on the head, tinted. */
  mesh(
    piece: Piece,
    color: (p: V) => THREE.Color,
    keep: (p: V) => boolean,
  ): void {
    const n = piece.pos.length / 3;
    const map = new Int32Array(n).fill(-1);
    const ok = new Uint8Array(n);
    const ps: V[] = [];
    for (let i = 0; i < n; i++) {
      const p = v3(
        piece.pos[i * 3],
        piece.pos[i * 3 + 1],
        piece.pos[i * 3 + 2],
      );
      ok[i] = keep(p) ? 1 : 0;
      ps.push(p);
    }
    const nn = v3();
    const vert = (v: number) => {
      if (map[v] < 0) {
        nn.set(piece.nrm[v * 3], piece.nrm[v * 3 + 1], piece.nrm[v * 3 + 2]);
        map[v] = this.out.vert(
          ps[v],
          nn,
          [piece.uv[v * 2], piece.uv[v * 2 + 1]],
          color(ps[v]),
          [
            piece.jnt[v * 4],
            piece.jnt[v * 4 + 1],
            piece.jnt[v * 4 + 2],
            piece.jnt[v * 4 + 3],
          ],
          [
            piece.wgt[v * 4],
            piece.wgt[v * 4 + 1],
            piece.wgt[v * 4 + 2],
            piece.wgt[v * 4 + 3],
          ],
        );
      }
      return map[v];
    };
    for (let t = 0; t < piece.idx.length; t += 3) {
      const i = piece.idx[t];
      const j = piece.idx[t + 1];
      const k = piece.idx[t + 2];
      if (!ok[i] || !ok[j] || !ok[k]) continue;
      this.out.tri(vert(i), vert(j), vert(k));
    }
  }

  glasses(kind: "round" | "square"): void {
    const a = this.a;
    const head = this.rigid("Head");
    const z = a.eyeZ + 0.014;
    const frame = "#16120f";
    for (const s of [-1, 1]) {
      const cx = s * (a.eyeX + 0.002);
      const outerRing: V[] = [];
      const innerRing: V[] = [];
      for (let i = 0; i <= 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const rx = kind === "round" ? 0.019 : 0.022;
        const ry = kind === "round" ? 0.018 : 0.014;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const sq =
          kind === "square"
            ? 1 / Math.max(Math.abs(c), Math.abs(sn)) ** 0.35
            : 1;
        outerRing.push(v3(cx + c * rx * sq, a.eyeY + 0.003 + sn * ry * sq, z));
        innerRing.push(
          v3(
            cx + c * (rx - 0.003) * sq,
            a.eyeY + 0.003 + sn * (ry - 0.003) * sq,
            z + 0.001,
          ),
        );
      }
      this.sheet([outerRing, innerRing], frame, "plastic", head);
      const ax = s * (a.eyeX + 0.022);
      this.sheet(
        [
          [
            v3(ax, a.eyeY + 0.008, z - 0.002),
            v3(ax, a.eyeY + 0.004, z - 0.002),
          ],
          [
            v3(s * (a.eyeX + 0.042), a.eyeY + 0.006, z - 0.09),
            v3(s * (a.eyeX + 0.042), a.eyeY + 0.002, z - 0.09),
          ],
        ],
        frame,
        "plastic",
        head,
      );
    }
    this.sheet(
      [
        [
          v3(-a.eyeX + 0.019, a.eyeY + 0.008, z),
          v3(a.eyeX - 0.019, a.eyeY + 0.008, z),
        ],
        [
          v3(-a.eyeX + 0.019, a.eyeY + 0.004, z),
          v3(a.eyeX - 0.019, a.eyeY + 0.004, z),
        ],
      ],
      frame,
      "plastic",
      head,
    );
  }

  /** Hats, turned on a lathe and set on the head. */
  hat(h: { kind: string; color: string; band?: string }, y0: number): void {
    const a = this.a;
    const head = this.rigid("Head");
    const cz = a.headZ - 0.004;
    const R0 = 0.084;
    // Profiles: [radius, height] from the brim's edge to the crown's top.
    const prof: Record<string, [number, number][]> = {
      fedora: [
        [0.165, -0.004],
        [0.15, 0.004],
        [0.1, 0.012],
        [R0 + 0.006, 0.02],
        [R0 + 0.002, 0.075],
        [0.075, 0.1],
        [0.04, 0.095],
        [0, 0.085],
      ],
      trilby: [
        [0.13, 0.0],
        [0.12, 0.008],
        [R0 + 0.004, 0.015],
        [R0 + 0.002, 0.07],
        [0.07, 0.092],
        [0.035, 0.088],
        [0, 0.08],
      ],
      cap: [
        [R0 + 0.004, 0.0],
        [R0 + 0.006, 0.045],
        [0.112, 0.07],
        [0.11, 0.08],
        [0.06, 0.082],
        [0, 0.082],
      ],
      flatcap: [
        [R0 + 0.006, 0.0],
        [R0 + 0.012, 0.03],
        [0.1, 0.045],
        [0.06, 0.052],
        [0, 0.05],
      ],
      beret: [
        [R0 + 0.002, 0.0],
        [0.1, 0.022],
        [0.11, 0.038],
        [0.085, 0.05],
        [0.04, 0.056],
        [0, 0.056],
      ],
    };
    const p = prof[h.kind] ?? prof.fedora;
    const rows: V[][] = [];
    const segs = 20;
    for (const [r, hy] of p) {
      const row: V[] = [];
      for (let j = 0; j <= segs; j++) {
        const ang = (j / segs) * Math.PI * 2;
        let x = Math.sin(ang) * r * (h.kind === "beret" ? 1 : 0.92);
        let zz = Math.cos(ang) * r;
        let y = y0 + hy;
        // A fedora's pinch at the front and the dent in its crown.
        if ((h.kind === "fedora" || h.kind === "trilby") && hy > 0.06) {
          const fr = Math.max(0, Math.cos(ang));
          x *= 1 - 0.18 * fr * smooth(0.06, 0.09, hy);
          y -= 0.012 * fr;
        }
        // A flat cap's peak runs forward.
        if (h.kind === "flatcap" && hy < 0.035)
          zz += 0.035 * Math.max(0, Math.cos(ang)) ** 3;
        // A beret sits to one side; the rest tip back a little.
        if (h.kind === "beret") y -= Math.sin(ang) * 0.18 * r * 0.4;
        else y -= zz * 0.016;
        row.push(v3(x, y, cz + zz));
      }
      rows.push(row);
    }
    this.sheet(rows, h.color, "felt", head, (i) =>
      h.band && i >= 2 && i <= 3 && h.kind !== "cap" ? 0.5 : 1,
    );
    if (h.kind === "cap") {
      const peak: V[][] = [];
      for (const [r, dy] of [
        [R0 + 0.004, 0.002],
        [R0 + 0.055, -0.012],
      ] as [number, number][]) {
        const row: V[] = [];
        for (let j = -4; j <= 4; j++) {
          const ang = (j / 4) * 0.9;
          row.push(
            v3(Math.sin(ang) * r * 0.95, y0 + dy, cz + Math.cos(ang) * r),
          );
        }
        peak.push(row);
      }
      this.sheet(peak, h.band ?? "#0a0a0a", "leather", head);
    }
  }
}
