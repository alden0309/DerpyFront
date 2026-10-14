// Mr. Based's world (r21): a place seen from above at an angle through an
// orthographic camera, in the manner of Disco Elysium. It builds the place
// from its data, puts the cast where the story says, walks them about (the
// hero where the player clicks), cuts away the walls between the camera and
// a room he's inside, follows him with the camera or holds a shot, and
// renders it all with noir lighting, rain and a painterly finish.
//
// It knows nothing of the story: the player (Player.ts) tells it where
// people are, what to show and where he may walk.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { NavGrid, P } from "../../engine/Nav";
import { Area, Hotspot, Mark, PlaceDef } from "../../engine/Place";
import { ActorState } from "../../engine/Types";
import { WorldAssets } from "./Assets";
import { buildItem, KitContext, PieceLight } from "./Kit";
import { LOOKS, Person, Pose } from "./People";
import { Post } from "./Post";
import { SurfaceBook } from "./Textures";
import { Rain, weatherTime } from "./Weather";

export type Tier = "high" | "low";

export interface CastLook {
  id: string;
  look: string;
}

export interface HotspotOnScreen {
  id: string;
  x: number;
  y: number;
  /** In front of the camera and inside the picture. */
  visible: boolean;
}

export interface WorldEvents {
  hotspot(id: string): void;
  floor(x: number, z: number): void;
  person(id: string): void;
  hover(id: string | null): void;
}

interface BuiltPlace {
  def: PlaceDef;
  group: THREE.Group;
  nav: NavGrid;
  lights: (PieceLight & { obj: THREE.Light })[];
  ticks: ((t: number) => void)[];
  /** One clipping plane per room that can be cut away. */
  cuts: Map<string, { plane: THREE.Plane; h: number; level: number }>;
  hideInside: { obj: THREE.Object3D; areas: string[]; shown?: boolean }[];
  props: Map<string, THREE.Object3D>;
  lamps: THREE.Vector3[];
  streaks: THREE.Object3D[];
  proxies: Map<string, THREE.Mesh>;
}

const CUT_HEIGHT = 1.15;
const UP = new THREE.Vector3(0, 1, 0);

function deg(d: number): number {
  return THREE.MathUtils.degToRad(d);
}

export function pickTier(): Tier {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse && small ? "low" : "high";
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private readonly post: Post;
  private readonly surfaces: SurfaceBook;
  private readonly rain: Rain;
  private readonly places = new Map<string, BuiltPlace>();
  private place: BuiltPlace | null = null;
  private readonly people = new Map<string, Person>();
  private readonly hemi = new THREE.HemisphereLight("#33405e", "#14100c", 0.9);
  private readonly moon = new THREE.DirectionalLight("#6f86b8", 0.35);
  private readonly ray = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();
  private frame = 0;
  private time = 0;
  private news: string | null = null;
  private focusKey: string | null = null;
  private camTarget = new THREE.Vector3();
  private camSpan = 12;
  private wantSpan = 12;
  private zoom = 1;
  private inset = { right: 0, bottom: 0 };
  private hovered: string | null = null;
  private fade = 1;
  private fadeTo = 1;
  private slow = 0;
  private frames = 0;
  private down: { x: number; y: number; t: number } | null = null;
  private disposed = false;
  /** The hero's cast id (the first cast member). */
  hero = "";
  /** Hotspots that can be clicked now, and whether walking is allowed. */
  active = new Set<string>();
  walkable = false;
  onHotspots: ((h: HotspotOnScreen[]) => void) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly assets: WorldAssets,
    private readonly cast: CastLook[],
    readonly tier: Tier,
    private readonly events: WorldEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = tier === "high";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.surfaces = new SurfaceBook(
      tier === "high" ? 512 : 256,
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
    );
    // A dim room for metal and glass to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    this.scene.environmentIntensity = 0.12;
    pmrem.dispose();
    this.scene.add(this.hemi, this.moon, this.moon.target);
    this.rain = new Rain(tier === "high" ? 6000 : 2600);
    this.scene.add(this.rain.group);
    this.post = new Post(this.renderer, this.scene, this.camera, {
      bloom: true,
      paint: tier === "high",
    });
    this.resize();
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("resize", this.resize);
    this.frame = requestAnimationFrame(this.loop);
  }

  // --- places --------------------------------------------------------------

  private kit(): KitContext {
    return {
      surfaces: this.surfaces,
      models: this.assets.props,
      shadows: this.tier === "high",
      lightBudget: this.tier === "high" ? "full" : "few",
      news: () => this.news,
    };
  }

  private build(def: PlaceDef): BuiltPlace {
    const group = new THREE.Group();
    group.name = def.key;
    const kit = this.kit();
    const cuts = new Map<
      string,
      { plane: THREE.Plane; h: number; level: number }
    >();
    for (const a of def.areas) {
      if (a.inside) {
        cuts.set(a.id, {
          plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 100),
          h: 100,
          level: 100,
        });
      }
    }
    const built: BuiltPlace = {
      def,
      group,
      nav: new NavGrid(def.nav.bounds, def.nav.cell, def.nav.blocks),
      lights: [],
      ticks: [],
      cuts,
      hideInside: [],
      props: new Map(),
      lamps: [],
      streaks: [],
      proxies: new Map(),
    };
    for (const item of def.items) {
      const b = buildItem(item, kit);
      group.add(b.object);
      if (item.id) built.props.set(item.id, b.object);
      if (b.tick) built.ticks.push(b.tick);
      b.object.updateMatrixWorld(true);
      for (const l of b.lamps) {
        built.lamps.push(l.clone().applyMatrix4(b.object.matrixWorld));
      }
      for (const pl of b.lights) {
        if (this.tier === "low" && pl.minor) {
          pl.light.parent?.remove(pl.light);
          continue;
        }
        built.lights.push({
          ...pl,
          obj: pl.light,
          area: (item.area as string) ?? pl.area,
        });
      }
      const list = (v: unknown): string[] =>
        typeof v === "string" ? [v] : Array.isArray(v) ? (v as string[]) : [];
      const planes = list(item.cut)
        .filter((a) => cuts.has(a))
        .map((a) => cuts.get(a)!.plane);
      if (planes.length > 0) {
        b.object.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.material) return;
          const clip = (x: THREE.Material) => {
            const c = x.clone();
            c.clippingPlanes = planes;
            c.clipShadows = false;
            return c;
          };
          m.material = Array.isArray(m.material)
            ? m.material.map(clip)
            : clip(m.material);
        });
      }
      const hide = list(item.hideInside);
      if (hide.length > 0)
        built.hideInside.push({ obj: b.object, areas: hide });
      b.object.traverse((o) => {
        if (o.userData.streak) built.streaks.push(o);
      });
    }
    for (const l of def.lights) {
      let light: THREE.Light;
      if (l.kind === "point") {
        const p = new THREE.PointLight(
          l.color,
          l.intensity,
          l.distance ?? 10,
          2,
        );
        p.castShadow = !!l.shadow && this.tier === "high";
        light = p;
      } else if (l.kind === "spot") {
        const s = new THREE.SpotLight(
          l.color,
          l.intensity,
          l.distance ?? 15,
          deg(l.angle ?? 40),
          l.penumbra ?? 0.6,
          1.8,
        );
        s.castShadow = !!l.shadow && this.tier === "high";
        if (s.castShadow) {
          s.shadow.mapSize.set(1024, 1024);
          s.shadow.bias = -0.0015;
          s.shadow.radius = 4;
        }
        if (l.to) s.target.position.set(...l.to);
        group.add(s.target);
        light = s;
      } else if (l.kind === "dir") {
        const d = new THREE.DirectionalLight(l.color, l.intensity);
        if (l.to) d.target.position.set(...l.to);
        group.add(d.target);
        light = d;
      } else {
        light = new THREE.HemisphereLight(
          l.color,
          l.ground ?? "#000",
          l.intensity,
        );
      }
      if (l.at) light.position.set(...l.at);
      group.add(light);
      built.lights.push({
        light: light as THREE.PointLight,
        obj: light,
        base: l.intensity,
        flicker: l.flicker,
        area: l.area,
      });
    }
    // Invisible targets for the hotspots, for the pointer to find.
    for (const [id, h] of Object.entries(def.hotspots)) {
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(h.r ?? 0.35, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.set(...h.at);
      proxy.userData.hotspot = id;
      group.add(proxy);
      built.proxies.set(id, proxy);
    }
    group.visible = false;
    this.scene.add(group);
    return built;
  }

  /** Shows a place (built on first use); the cast is cleared from it. */
  setPlace(def: PlaceDef | null): void {
    if (def === null) {
      if (this.place) this.place.group.visible = false;
      this.place = null;
      for (const p of this.people.values()) p.root.visible = false;
      return;
    }
    if (this.place?.def.key === def.key) return;
    let b = this.places.get(def.key);
    if (!b) {
      b = this.build(def);
      this.places.set(def.key, b);
    }
    if (this.place) this.place.group.visible = false;
    this.place = b;
    b.group.visible = true;
    this.scene.background = new THREE.Color(def.env.background);
    this.scene.fog = new THREE.FogExp2(def.env.fog, def.env.fogDensity);
    this.renderer.toneMappingExposure = def.env.exposure ?? 1.15;
    this.rain.setDry(def.areas.filter((a) => !a.rain).map((a) => a.rect));
    this.rain.group.visible = def.areas.some((a) => a.rain);
    this.rain.setLamps(b.lamps.map((at) => ({ at, k: 1 })));
    const az = deg(def.camera.azimuth);
    for (const s of b.streaks) {
      // Reflections run from the light towards the viewer.
      s.updateWorldMatrix(true, false);
      const q = new THREE.Quaternion();
      s.parent!.getWorldQuaternion(q);
      const parentYaw = new THREE.Euler().setFromQuaternion(q, "YXZ").y;
      s.rotation.y = az - parentYaw;
    }
    for (const p of this.people.values()) p.root.visible = false;
    this.fade = 0;
    this.fadeTo = 1;
    this.snapCamera = true;
  }

  get placeKey(): string | null {
    return this.place?.def.key ?? null;
  }

  // --- people --------------------------------------------------------------

  private person(id: string, wear?: string): Person | null {
    const c = this.cast.find((x) => x.id === id);
    const lookName = wear ?? c?.look;
    if (!lookName) return null;
    const look = LOOKS[lookName] ?? LOOKS.suit_dark;
    const key = `${id}`;
    let p = this.people.get(key);
    if (p && p.look !== look) {
      // A change of clothes: a new body in the same place.
      const at = p.root.position.clone();
      const h = p.heading;
      this.scene.remove(p.root);
      p.dispose();
      p = new Person(
        id,
        look.body === "f" ? this.assets.rigs.f : this.assets.rigs.m,
        look,
        this.assets.gestures,
      );
      p.root.position.copy(at);
      p.heading = h;
      this.people.set(key, p);
      this.scene.add(p.root);
    }
    if (!p) {
      p = new Person(
        id,
        look.body === "f" ? this.assets.rigs.f : this.assets.rigs.m,
        look,
        this.assets.gestures,
      );
      this.people.set(key, p);
      this.scene.add(p.root);
    }
    return p;
  }

  private mark(name: string): Mark | null {
    return this.place?.def.marks[name] ?? null;
  }

  private markPos(m: Mark): THREE.Vector3 {
    return new THREE.Vector3(m.at[0], 0, m.at[1]);
  }

  /** Everyone where the stage says, at once (a scene starting, a load). */
  placeCast(actors: Record<string, ActorState>): void {
    for (const [id, p] of this.people) {
      if (!actors[id]) p.root.visible = false;
    }
    for (const [id, st] of Object.entries(actors)) {
      const m = this.mark(st.at);
      const p = this.person(id, st.wear);
      if (!m || !p) continue;
      p.root.visible = true;
      p.place(this.markPos(m), deg(m.face ?? 0), st.pose as Pose, m.seat ?? 0);
    }
    this.snapCamera = true;
  }

  /** Someone moves: walks to their mark (or appears there), then poses. */
  moveActor(id: string, st: ActorState | null, walk: boolean): void {
    if (st === null) {
      const p = this.people.get(id);
      if (p) p.root.visible = false;
      return;
    }
    const m = this.mark(st.at);
    const p = this.person(id, st.wear);
    if (!m || !p) return;
    const target = this.markPos(m);
    const face = deg(m.face ?? 0);
    const finish = () => {
      if (st.pose === "sit") p.sitDown(m.seat ?? 0.75, face);
      else p.setPose(st.pose as Pose, 0, face);
    };
    if (!walk || !p.root.visible || !this.place) {
      p.root.visible = true;
      p.place(target, face, st.pose as Pose, m.seat ?? 0);
      return;
    }
    const from: P = [p.root.position.x, p.root.position.z];
    const path = this.place.nav.path(from, [target.x, target.z]);
    const pts = (path ?? [from, [target.x, target.z]]).map(
      ([x, z]) => new THREE.Vector3(x, 0, z),
    );
    pts.shift();
    // The last step is to the mark itself, even beside a stool.
    pts.push(target);
    p.walk(pts, finish);
  }

  setTalking(who: string | null): void {
    for (const [id, p] of this.people) p.setTalking(id === who);
  }

  gesture(who: string, name: string): void {
    this.people.get(who)?.gesture(name);
  }

  setProp(key: string, on: boolean): void {
    const o = this.place?.props.get(key);
    if (o) o.visible = on;
  }

  setNews(text: string | null): void {
    this.news = text;
  }

  setFocus(key: string | null): void {
    this.focusKey = key;
  }

  /** How much of the screen the dialogue column covers. */
  setInset(right: number, bottom: number): void {
    this.inset = { right, bottom };
  }

  heroAt(): THREE.Vector3 | null {
    const p = this.people.get(this.hero);
    return p && p.root.visible ? p.root.position.clone() : null;
  }

  get heroBusy(): boolean {
    return this.people.get(this.hero)?.walking ?? false;
  }

  /** Walks the hero to a point; false if he can't get there. */
  walkHero(x: number, z: number, then?: () => void): boolean {
    const p = this.people.get(this.hero);
    if (!p || !this.place || !p.root.visible) return false;
    const path = this.place.nav.path(
      [p.root.position.x, p.root.position.z],
      [x, z],
    );
    if (!path) return false;
    const pts = path.slice(1).map(([px, pz]) => new THREE.Vector3(px, 0, pz));
    if (pts.length === 0) {
      then?.();
      return true;
    }
    p.walk(pts, then);
    this.ping(pts[pts.length - 1]);
    return true;
  }

  /** Walks the hero to look at a hotspot, then turns to it. */
  walkToHotspot(id: string, then: () => void): void {
    const h = this.place?.def.hotspots[id];
    const p = this.people.get(this.hero);
    if (!h || !p || !this.place) {
      then();
      return;
    }
    const at = this.hotspotPos(id, h);
    const face = () => {
      const d = at.clone().sub(p.root.position);
      if (p.pose !== "sit") p.face(Math.atan2(d.x, d.z));
      p.gesture("interact");
      then();
    };
    if (h.stand) {
      const m = this.mark(h.stand);
      if (m) {
        const target = this.markPos(m);
        if (target.distanceTo(p.root.position) < 0.2) {
          face();
          return;
        }
        this.walkHero(target.x, target.z, face);
        return;
      }
    }
    // Near enough already?
    const flat = new THREE.Vector3(at.x, 0, at.z);
    if (
      flat.distanceTo(
        new THREE.Vector3(p.root.position.x, 0, p.root.position.z),
      ) < 1.6
    ) {
      face();
      return;
    }
    // Otherwise to the free spot nearest it on his side.
    const dir = new THREE.Vector3()
      .subVectors(p.root.position, flat)
      .setY(0)
      .normalize();
    const goal = flat.clone().addScaledVector(dir, 0.9);
    const free = this.place.nav.nearestFree(goal.x, goal.z);
    if (!free || !this.walkHero(free[0], free[1], face)) face();
  }

  private hotspotPos(id: string, h: Hotspot): THREE.Vector3 {
    if (h.on) {
      const person = this.people.get(h.on.who);
      const bone = person?.bone(h.on.bone);
      if (bone) return bone.localToWorld(new THREE.Vector3(...h.at));
    }
    return new THREE.Vector3(...h.at);
  }

  // --- the camera ----------------------------------------------------------

  private snapCamera = true;
  private rainLevel = 1;

  private areaOf(x: number, z: number): Area | null {
    if (!this.place) return null;
    // Rooms before the street around them: the smallest that contains it.
    let best: Area | null = null;
    let bestSize = Infinity;
    for (const a of this.place.def.areas) {
      const [x0, z0, x1, z1] = a.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
        const size = (x1 - x0) * (z1 - z0);
        if (size < bestSize) {
          best = a;
          bestSize = size;
        }
      }
    }
    return best;
  }

  private updateCamera(dt: number): void {
    if (!this.place) return;
    const def = this.place.def;
    const hero = this.heroAt();
    const shot = this.focusKey ? def.shots[this.focusKey] : undefined;
    const area = hero ? this.areaOf(hero.x, hero.z) : null;
    let target: THREE.Vector3;
    if (shot) {
      target = new THREE.Vector3(...shot.at);
      this.wantSpan = shot.span;
    } else if (hero) {
      target = hero.clone().setY(1.0);
      this.wantSpan = (area?.span ?? 14) * this.zoom;
    } else {
      const b = def.nav.bounds;
      target = new THREE.Vector3((b[0] + b[2]) / 2, 0, (b[1] + b[3]) / 2);
      this.wantSpan = 16 * this.zoom;
    }
    const snap = this.snapCamera;
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    this.camTarget.lerp(target, k);
    this.camSpan +=
      (this.wantSpan - this.camSpan) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
    this.snapCamera = false;

    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    const halfH = this.camSpan / 2;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    const az = deg(def.camera.azimuth);
    const el = deg(def.camera.elevation);
    const dir = new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    );
    // Keep what he's doing in the middle of the part the column leaves free.
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
    const shiftX = (this.inset.right / 2 / w) * (halfW * 2);
    const shiftY = (this.inset.bottom / 2 / h) * (halfH * 2);
    const look = this.camTarget
      .clone()
      .addScaledVector(right, shiftX)
      .addScaledVector(camUp, -shiftY);
    this.camera.position.copy(look).addScaledVector(dir, 80);
    this.camera.up.copy(UP);
    this.camera.lookAt(look);
    this.camera.updateProjectionMatrix();
    this.moon.position.copy(look).add(new THREE.Vector3(-8, 14, -6));
    this.moon.target.position.copy(look);

    // Walls between the camera and the room he's in come down.
    let indoors = false;
    for (const [id, cut] of this.place.cuts) {
      const inside =
        (area?.id === id && area.inside === true) ||
        (shot !== undefined && this.shotInside(shot.at, id));
      const want = inside ? CUT_HEIGHT : 100;
      cut.level += (want - cut.level) * (snap ? 1 : 1 - Math.exp(-dt * 6));
      if (Math.abs(cut.level - want) < 0.01) cut.level = want;
      if (inside) indoors = true;
      cut.plane.constant = cut.level;
    }
    // Rain thins to a few streaks over a room he's inside.
    this.rainLevel +=
      ((indoors ? 0.3 : 1) - this.rainLevel) *
      (snap ? 1 : 1 - Math.exp(-dt * 3));
    this.rain.setStrength(this.rainLevel);
    for (const h2 of this.place.hideInside) {
      const show = h2.areas.every((a) => {
        const cut = this.place!.cuts.get(a);
        return !cut || cut.level > 20;
      });
      if (h2.shown === show) continue;
      h2.shown = show;
      // Hide what's drawn but keep any light on, so nothing recompiles.
      h2.obj.traverse((o) => {
        if (!(o as THREE.Light).isLight && o !== h2.obj) {
          if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) {
            o.visible = show;
          }
        }
      });
    }
  }

  private shotInside(at: [number, number, number], areaId: string): boolean {
    const a = this.place?.def.areas.find((x) => x.id === areaId);
    if (!a) return false;
    const [x0, z0, x1, z1] = a.rect;
    return at[0] >= x0 && at[0] <= x1 && at[2] >= z0 && at[2] <= z1;
  }

  // --- input ---------------------------------------------------------------

  private pointer(e: PointerEvent | MouseEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  /** What's under the pointer: a hotspot, a person, or the floor. */
  private pick(
    e: PointerEvent | MouseEvent,
  ):
    | { kind: "hotspot"; id: string }
    | { kind: "person"; id: string }
    | { kind: "floor"; x: number; z: number }
    | null {
    if (!this.place) return null;
    this.ray.setFromCamera(this.pointer(e), this.camera);
    const proxies = [...this.place.proxies.entries()]
      .filter(([id]) => this.active.has(id))
      .map(([, m]) => m);
    const hit = this.ray.intersectObjects(proxies, false)[0];
    if (hit)
      return { kind: "hotspot", id: hit.object.userData.hotspot as string };
    const floor = new THREE.Plane(UP, 0);
    const at = this.ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (at) return { kind: "floor", x: at.x, z: at.z };
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    const hit = this.pick(e);
    if (!hit) return;
    if (hit.kind === "hotspot") this.events.hotspot(hit.id);
    else if (hit.kind === "floor") this.events.floor(hit.x, hit.z);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const hit = this.pick(e);
    const id = hit?.kind === "hotspot" ? hit.id : null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.canvas.style.cursor = id
        ? "pointer"
        : this.walkable
          ? "crosshair"
          : "default";
      this.events.hover(id);
    }
  };

  private onLeave = () => {
    if (this.hovered) {
      this.hovered = null;
      this.events.hover(null);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = THREE.MathUtils.clamp(
      this.zoom * (e.deltaY > 0 ? 1.08 : 0.93),
      0.6,
      1.5,
    );
  };

  /** A ring where he's been told to walk. */
  private pingMesh: THREE.Mesh | null = null;
  private pingT = 0;
  private ping(at: THREE.Vector3): void {
    if (!this.pingMesh) {
      this.pingMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.24, 24),
        new THREE.MeshBasicMaterial({
          color: "#e8b36a",
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.pingMesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.pingMesh);
    }
    this.pingMesh.position.set(at.x, 0.02, at.z);
    this.pingT = 1;
  }

  // --- the frame -----------------------------------------------------------

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr =
      Math.min(window.devicePixelRatio || 1, this.tier === "high" ? 2 : 1.5) *
      (this.slow > 1 ? 0.75 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
  };

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update();
    // Screenshot runs on a software renderer speed time up; players never.
    const scale =
      (window as unknown as { __basedTimeScale?: number }).__basedTimeScale ??
      1;
    const dt = Math.min(0.05, this.timer.getDelta()) * scale;
    this.time += dt;
    weatherTime.value = this.time;
    // Slow device? Drop the brushwork, then resolution.
    this.frames++;
    if (
      this.frames > 120 &&
      this.frames % 60 === 0 &&
      dt > 0.034 &&
      this.slow < 2
    ) {
      this.slow++;
      if (this.slow === 1) this.post.setPaint(false);
      else this.resize();
    }
    for (const p of this.people.values()) {
      if (p.root.visible) p.update(dt, this.time);
    }
    this.updateCamera(dt);
    const place = this.place;
    if (place) {
      for (const t of place.ticks) t(this.time);
      const hero = this.heroAt();
      const area = hero ? this.areaOf(hero.x, hero.z) : null;
      for (const l of place.lights) {
        let k = 1;
        if (l.area && area?.id !== l.area && !this.focusKey) k = 0.15;
        if (l.flicker === "tv") {
          k *=
            0.65 +
            0.35 *
              Math.abs(
                Math.sin(this.time * 7.3) * Math.sin(this.time * 2.9 + 1.3),
              );
        } else if (l.flicker === "neon") {
          k *= Math.sin(this.time * 31) > 0.97 ? 0.3 : 1;
        } else if (l.flicker === "candle") {
          k *= 0.9 + 0.1 * Math.sin(this.time * 9) * Math.sin(this.time * 3.3);
        }
        (l.obj as THREE.PointLight).intensity = l.base * k;
      }
    }
    this.rain.update(this.time, this.camTarget);
    if (this.pingMesh) {
      this.pingT = Math.max(0, this.pingT - dt * 1.4);
      this.pingMesh.visible = this.pingT > 0;
      this.pingMesh.scale.setScalar(1 + (1 - this.pingT) * 0.8);
      (this.pingMesh.material as THREE.MeshBasicMaterial).opacity =
        this.pingT * 0.8;
    }
    this.fade += (this.fadeTo - this.fade) * (1 - Math.exp(-dt * 2.2));
    this.post.setFade(this.fade);
    this.post.render(this.time);
    this.reportHotspots();
  };

  private reportHotspots(): void {
    if (!this.onHotspots || !this.place) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const out: HotspotOnScreen[] = [];
    for (const id of this.active) {
      const hs = this.place.def.hotspots[id];
      if (!hs) continue;
      const p = this.hotspotPos(id, hs);
      const proxy = this.place.proxies.get(id);
      proxy?.position.copy(p);
      const v = p.clone().project(this.camera);
      out.push({
        id,
        x: ((v.x + 1) / 2) * w,
        y: ((1 - v.y) / 2) * h,
        visible:
          v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05,
      });
    }
    this.onHotspots(out);
  }

  /** Points on screen of hotspots, for tests and overlays. */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - v.y) / 2) * this.canvas.clientHeight,
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("resize", this.resize);
    for (const p of this.people.values()) p.dispose();
    this.rain.dispose();
    this.post.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    this.renderer.dispose();
  }
}
