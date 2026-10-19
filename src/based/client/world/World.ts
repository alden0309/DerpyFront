// Mr. Based's world (r21): a place seen from above at an angle through an
// orthographic camera, in the manner of Disco Elysium. It builds the place
// from its data, puts the cast where the story says, walks them about (the
// hero where the player clicks), cuts away the walls between the camera and
// a room he's inside, follows him with the camera or holds a shot, and
// renders it all with noir lighting, rain and a painterly finish.
//
// r22: an open world of places (areas), each its own scene, so only the
// one he's in is drawn. The places next door are built and their shaders
// compiled in the background, a little at a time, so a door is a short
// fade; places further off are freed. Each place keeps to a light budget
// (a few real lights, the street lamps sharing a pool of them; the rest are
// painted glow), one shadow at most, and the picture's resolution follows
// the device's speed. Things are found by walking about: what he's near
// and can see glints; Tab shows what's near. Double-click runs. The rain
// comes and goes, puddles spread, and people get wet.
//
// It knows nothing of the story: the player (Player.ts) tells it where
// people are, what to show, what's worth a look and where he may walk.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { navFor, NavGrid, P } from "../../engine/Nav";
import { Area, Hotspot, Mark, PlaceDef } from "../../engine/Place";
import { areaAt, canSee, noticeRange } from "../../engine/Sight";
import { Seat, seats } from "../../engine/Solid";
import { ActorState } from "../../engine/Types";
import { roundCorners } from "../../engine/Walk";
import {
  startWeather,
  stepWeather,
  stepWetness,
  weatherAt,
  WeatherKind,
  WeatherState,
} from "../../engine/Weather";
import { WorldAssets } from "./Assets";
import { buildItem, KitContext, PieceLight } from "./Kit";
// BPEOPLE (r22): lookFor (a look, with the cast member's own model) and warmCast.
import { worldGeometry } from "./Merge";
import { Look, lookFor, Person, Pose, warmCast } from "./People";
import { holdProp, setGait, setWetness, wearLook } from "./PeopleHooks";
import { Post } from "./Post";
import { SurfaceBook } from "./Textures";
import {
  Drips,
  Rain,
  weatherGround,
  weatherRain,
  weatherTime,
} from "./Weather";

export type Tier = "high" | "low";

export interface CastLook {
  id: string;
  look: string;
  /** BPEOPLE (r22): their own model (models/<key>.glb), if any. */
  model?: string;
}

/** A thing worth a look, as the player's labels need it. */
export interface ThingOnScreen {
  id: string;
  x: number;
  y: number;
  /** In front of the camera and inside the picture. */
  visible: boolean;
  /** Near enough and in sight now. */
  near: boolean;
  door: boolean;
}

export interface WorldEvents {
  /** A thing (or door) clicked; `seated` when he looks from his seat. */
  hotspot(id: string, opts: { seated: boolean; run: boolean }): void;
  floor(x: number, z: number, run: boolean): void;
  /** BFIX (r23): a seat clicked (a stool, a chair), by its index in the place. */
  seat?(index: number, run: boolean): void;
  person(id: string): void;
  hover(id: string | null): void;
}

/** What the device can afford, per place. */
const BUDGET: Record<Tier, { lights: number; pool: number; shadows: number }> =
  {
    high: { lights: 8, pool: 4, shadows: 1 },
    low: { lights: 4, pool: 2, shadows: 0 },
  };

interface LiveLight {
  obj: THREE.Light;
  base: number;
  flicker?: "tv" | "neon" | "candle";
  area?: string;
}

/** A few real lights lent to whichever street lamps are nearest. */
interface LampPool {
  lights: THREE.PointLight[];
  lamps: THREE.Vector3[];
  base: number;
}

interface WetMat {
  mat: THREE.MeshStandardMaterial;
  color: THREE.Color;
  rough: number;
}

interface BuiltPlace {
  def: PlaceDef;
  scene: THREE.Scene;
  group: THREE.Group;
  nav: NavGrid;
  lights: LiveLight[];
  pool: LampPool | null;
  ticks: ((t: number) => void)[];
  /** One clipping plane per room that can be cut away. */
  cuts: Map<string, { plane: THREE.Plane; h: number; level: number }>;
  props: Map<string, THREE.Object3D>;
  lamps: THREE.Vector3[];
  streaks: THREE.Object3D[];
  /** Invisible targets for the pointer, one per hotspot. */
  proxies: Map<string, THREE.Mesh>;
  /** BFIX (r23): the seats (from the pieces), and a target for each. */
  seats: Seat[];
  seatProxies: THREE.Mesh[];
  /** Pieces seen only from in front (their local +z faces the viewer). */
  frontOnly: THREE.Object3D[];
  wet: WetMat[];
  drips: Drips | null;
  outdoor: boolean;
  /**
   * BPLAY (r22): every glint in the place, as one instanced quad turned to
   * the camera, so twenty things worth a look are one draw, not twenty.
   * There's always one instance (a dark one out of sight when nothing
   * glints), so its shader is compiled with the place's.
   */
  glints: THREE.InstancedMesh | null;
  /** Its shaders compiled (built in the background, then compiled). */
  ready: Promise<void>;
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

/** r25: what a footfall sounds on. */
export type StepSurface = "stone" | "tile" | "wood" | "carpet";

/** A place's floor surface (Textures.ts) as a footfall's. */
export function stepSurface(s: string): StepSurface {
  if (s === "tiles") return "tile";
  if (s === "carpet") return "carpet";
  if (s === "oak" || s === "oak_dark" || s === "plaster") return "wood";
  return "stone";
}

/** Waits for the browser to be idle (or a frame, where there's no idle). */
function idle(): Promise<void> {
  return new Promise((r) => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: object) => number;
    };
    if (w.requestIdleCallback)
      w.requestIdleCallback(() => r(), { timeout: 200 });
    else window.setTimeout(r, 16);
  });
}

let glintTex: THREE.Texture | null = null;
function glintTexture(): THREE.Texture {
  if (glintTex) return glintTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,240,210,1)");
  grad.addColorStop(0.18, "rgba(255,220,170,0.6)");
  grad.addColorStop(1, "rgba(255,200,140,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // A four-pointed glint.
  g.fillStyle = "rgba(255,245,225,0.9)";
  g.beginPath();
  g.moveTo(32, 2);
  g.lineTo(35, 29);
  g.lineTo(62, 32);
  g.lineTo(35, 35);
  g.lineTo(32, 62);
  g.lineTo(29, 35);
  g.lineTo(2, 32);
  g.lineTo(29, 29);
  g.closePath();
  g.fill();
  glintTex = new THREE.CanvasTexture(c);
  glintTex.colorSpace = THREE.SRGBColorSpace;
  glintTex.userData.shared = true;
  return glintTex;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private readonly post: Post;
  private readonly surfaces: SurfaceBook;
  private readonly rain: Rain;
  private readonly env: THREE.Texture;
  private readonly places = new Map<string, BuiltPlace>();
  private building = new Map<string, Promise<BuiltPlace>>();
  private place: BuiltPlace | null = null;
  private readonly people = new Map<string, Person>();
  private readonly personProxy = new Map<string, THREE.Mesh>();
  private readonly wet = new Map<string, number>();
  private readonly ray = new THREE.Raycaster();
  private readonly timer = new THREE.Timer();
  private readonly budget: { lights: number; pool: number; shadows: number };
  private frame = 0;
  private frameNo = 0;
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
  private fadeWait: (() => void)[] = [];
  private down: { x: number; y: number; t: number } | null = null;
  private drag: { x: number; y: number; ox: number; oz: number } | null = null;
  private lastClick = { t: 0, x: 0, y: 0 };
  private disposed = false;
  /** The resolution's share of the device's (dropped on a slow device). */
  private scale = 1;
  private frameEma = 16;
  private fastFor = 0;
  private weatherKind: WeatherKind | null = null;
  private weather: WeatherState = startWeather("rain");
  private heroGait = 1;
  private lookOffset = new THREE.Vector3();
  /** How bright each thing's glint is (0 to 1.6), by hotspot. */
  private readonly glints = new Map<string, number>();
  private scanAt = 0;
  private reported = "";
  // Reused each frame, so a frame makes no garbage.
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly ptr = new THREE.Vector2();
  private readonly floorPlane = new THREE.Plane(UP, 0);
  /** The hero's cast id (the first cast member). */
  hero = "";
  /**
   * What's worth a look where he is (the story's things and the doors), and
   * who will talk. The player sets these as the story moves.
   */
  things = new Map<string, { door: boolean }>();
  talkers = new Set<string>();
  /** Things he has noticed here (stay clickable while he's in the place). */
  noticed = new Set<string>();
  /** Things near enough and in sight now. */
  near = new Set<string>();
  /** His Perception: it widens how far off he notices things. */
  perception = 2;
  /** Walking is allowed (he's free, or looking round a room). */
  walkable = false;
  /** Show every label of what's near (Tab, or the eye). */
  showAll = false;
  /** Investigations that keep him put: he reads from where he is. */
  still = false;
  /**
   * BPLAY (r22): the look his clothes give him (null: his cast look), and
   * what he holds: a prop the world draws at his right hand.
   */
  private heroLook: string | null = null;
  private held: { kind: string; prop: THREE.Group; own: boolean } | null = null;
  /**
   * r25 (BSTORY): people with a life of their own while nothing asks
   * anything of them (`@actor ... idle=drink|read|talk:group`): a drink now
   * and then, a page turned, a couple talking low, one at a time.
   */
  private readonly idles = new Map<
    string,
    {
      kind: string;
      group: string;
      t: number;
      prop: THREE.Group | null;
      /** The person it's been set up on (their prop, no shadow). */
      on: Person | null;
    }
  >();
  private readonly chats = new Map<
    string,
    { speaker: string | null; last: string | null; t: number }
  >();
  /** r25: footfalls, for the sound: whose, on what, running. */
  onStep:
    | ((step: {
        who: string;
        hero: boolean;
        surface: StepSurface;
        run: boolean;
        wet: number;
        x: number;
        z: number;
      }) => void)
    | null = null;
  private readonly stepClock = new Map<string, number>();
  onThings: ((h: ThingOnScreen[]) => void) | null = null;
  /** Called when a set of things noticed changes (for the column). */
  onNoticed: ((ids: string[]) => void) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly assets: WorldAssets,
    private readonly cast: CastLook[],
    readonly tier: Tier,
    private readonly events: WorldEvents,
  ) {
    this.budget = BUDGET[tier];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = this.budget.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // r22: shadows are drawn every other frame (see loop).
    this.renderer.shadowMap.autoUpdate = false;
    this.surfaces = new SurfaceBook(
      tier === "high" ? 512 : 256,
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
    );
    // A dim room for metal and glass to reflect, shared by every place.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.rain = new Rain(tier === "high" ? 6000 : 2600);
    this.post = new Post(this.renderer, new THREE.Scene(), this.camera, {
      bloom: tier === "high",
      paint: tier === "high",
      // r24: phones get a little multisampling too, or thin things (stool
      // legs, the rain) crawl as he walks.
      samples: tier === "high" ? 4 : 2,
    });
    // r24: no grain on lighter devices, where the image is already softer.
    if (tier !== "high") this.post.setGrain(0);
    // BPEOPLE (r22): cut the cast's clothes now, not when they first appear.
    warmCast(assets.rigs, cast);
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
      shadows: this.budget.shadows > 0,
      lightBudget: this.tier === "high" ? "full" : "few",
      news: () => this.news,
    };
  }

  /** Builds a place now, all at once (behind the fade). */
  private buildNow(def: PlaceDef): BuiltPlace {
    const g = this.builder(def);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }

  /**
   * Builds a place in the background: a few pieces at a time, between
   * frames, so nothing stutters while he walks.
   */
  private async buildSlow(def: PlaceDef): Promise<BuiltPlace> {
    const g = this.builder(def);
    let t0 = performance.now();
    for (;;) {
      const r = g.next();
      if (r.done) return r.value;
      if (performance.now() - t0 > 8) {
        await idle();
        t0 = performance.now();
      }
    }
  }

  /** Builds a place piece by piece, pausing (yielding) between pieces. */
  private *builder(def: PlaceDef): Generator<void, BuiltPlace> {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(def.env.background);
    scene.fog = new THREE.FogExp2(def.env.fog, def.env.fogDensity);
    scene.environment = this.env;
    scene.environmentIntensity = 0.12;
    const group = new THREE.Group();
    group.name = def.key;
    scene.add(group);
    const outdoor = def.outdoor ?? def.areas.some((a) => a.rain);
    // The night's own light, in every place.
    scene.add(new THREE.HemisphereLight("#33405e", "#14100c", 0.9));
    const moon = new THREE.DirectionalLight("#6f86b8", 0.35);
    moon.position.set(-8, 14, -6);
    scene.add(moon, moon.target);
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
    const b: BuiltPlace = {
      def,
      scene,
      group,
      // BFIX (r23): the walls, and every solid piece where it stands.
      nav: navFor(def),
      lights: [],
      pool: null,
      ticks: [],
      cuts,
      props: new Map(),
      lamps: [],
      streaks: [],
      proxies: new Map(),
      seats: seats(def),
      seatProxies: [],
      frontOnly: [],
      wet: [],
      drips: null,
      outdoor,
      glints: null,
      ready: Promise.resolve(),
    };
    const wanted: (PieceLight & { obj: THREE.Light; order: number })[] = [];
    const pooled: { pl: PieceLight; at: THREE.Vector3 }[] = [];
    const drips: [THREE.Vector3, THREE.Vector3][] = [];
    let order = 0;
    // Clipped copies of a material, one per material and set of rooms.
    const clips = new Map<string, THREE.Material>();
    for (const item of def.items) {
      yield;
      const built = buildItem(item, kit);
      group.add(built.object);
      if (item.id) b.props.set(item.id, built.object);
      if (built.tick) b.ticks.push(built.tick);
      built.object.updateMatrixWorld(true);
      for (const l of built.lamps) {
        b.lamps.push(l.clone().applyMatrix4(built.object.matrixWorld));
      }
      for (const e of built.drips ?? []) {
        drips.push([
          e[0].clone().applyMatrix4(built.object.matrixWorld),
          e[1].clone().applyMatrix4(built.object.matrixWorld),
        ]);
      }
      for (const pl of built.lights) {
        if (pl.pool) {
          pooled.push({
            pl,
            at: pl.light.getWorldPosition(new THREE.Vector3()),
          });
          pl.light.parent?.remove(pl.light);
          continue;
        }
        wanted.push({
          ...pl,
          obj: pl.light,
          area: (item.area as string) ?? pl.area,
          order: order++,
        });
      }
      const list = (v: unknown): string[] =>
        typeof v === "string" ? [v] : Array.isArray(v) ? (v as string[]) : [];
      const rooms = list(item.cut).filter((a) => cuts.has(a));
      const planes = rooms.map((a) => cuts.get(a)!.plane);
      if (planes.length > 0) {
        built.object.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.material) return;
          const clip = (x: THREE.Material) => {
            const key = `${x.uuid}|${rooms.join(",")}`;
            let c = clips.get(key);
            if (!c) {
              c = x.clone();
              c.clippingPlanes = planes;
              c.clipShadows = false;
              c.userData = { ...x.userData, shared: false };
              clips.set(key, c);
            }
            return c;
          };
          m.material = Array.isArray(m.material)
            ? m.material.map(clip)
            : clip(m.material);
        });
      }
      built.object.traverse((o) => {
        if (o.userData.streak) b.streaks.push(o);
        if (o.userData.frontOnly) b.frontOnly.push(o);
        const m = (o as THREE.Mesh).material as
          | THREE.MeshStandardMaterial
          | undefined;
        if (
          outdoor &&
          m?.isMeshStandardMaterial &&
          m.userData.wettable &&
          !m.userData.shared
        ) {
          b.wet.push({ mat: m, color: m.color.clone(), rough: m.roughness });
        }
      });
    }
    for (const l of def.lights) {
      let light: THREE.Light;
      if (l.kind === "point") {
        light = new THREE.PointLight(l.color, l.intensity, l.distance ?? 10, 2);
        light.castShadow = !!l.shadow;
      } else if (l.kind === "spot") {
        const s = new THREE.SpotLight(
          l.color,
          l.intensity,
          l.distance ?? 15,
          deg(l.angle ?? 40),
          l.penumbra ?? 0.6,
          1.8,
        );
        s.castShadow = !!l.shadow;
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
      const lv: PieceLight & { obj: THREE.Light; order: number } = {
        light: light as THREE.PointLight,
        obj: light,
        base: l.intensity,
        flicker: l.flicker,
        area: l.area,
        prio: (l as { prio?: number }).prio ?? 2,
        order: order++,
      };
      if (l.kind === "point" || l.kind === "spot") wanted.push(lv);
      else b.lights.push(lv);
    }
    this.applyBudget(b, wanted, pooled);
    yield;
    this.mergeStatic(b);
    if (drips.length > 0 && outdoor) {
      b.drips = new Drips(drips);
      scene.add(b.drips.lines);
    }
    // The glints, one draw for all of them; the first instance is a dark
    // one out of sight, so the shader is compiled with the place's.
    const glints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      this.glintMaterial(),
      Object.keys(def.hotspots).length + 1,
    );
    glints.renderOrder = 9;
    glints.frustumCulled = false;
    glints.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, -50, 0));
    glints.setColorAt(0, new THREE.Color(0, 0, 0));
    glints.count = 1;
    glints.userData.keep = true;
    scene.add(glints);
    b.glints = glints;
    // Invisible targets for the hotspots, for the pointer to find.
    for (const [id, h] of Object.entries(def.hotspots)) {
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(h.r ?? 0.35, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.set(...h.at);
      proxy.userData.hotspot = id;
      group.add(proxy);
      b.proxies.set(id, proxy);
    }
    // BFIX (r23): a target for each seat, the size of it, for a click to
    // sit him there.
    b.seats.forEach((st, i) => {
      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(st.w * 0.9, st.y, st.d * 0.9),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.set(st.x, st.y / 2, st.z);
      if (st.facing !== null) proxy.rotation.y = st.facing;
      proxy.userData.seat = i;
      group.add(proxy);
      b.seatProxies.push(proxy);
    });
    // Reflections run from the light towards the viewer.
    const az = deg(def.camera.azimuth);
    for (const s of b.streaks) {
      s.updateWorldMatrix(true, false);
      const q = new THREE.Quaternion();
      s.parent!.getWorldQuaternion(q);
      const parentYaw = new THREE.Euler().setFromQuaternion(q, "YXZ").y;
      s.rotation.y = az - parentYaw;
    }
    return b;
  }

  /**
   * r22: a place keeps to the device's light budget. Its lights are ranked
   * by how much they matter (then the order they're written); the least
   * are removed for good, so nothing is ever switched on or off while
   * playing (which would make every material recompile). The street lamps
   * share a pool of a few real lights, lent to whichever lamps are nearest
   * the camera (moving a light recompiles nothing). One light at most keeps
   * its shadow.
   */
  private applyBudget(
    b: BuiltPlace,
    wanted: (PieceLight & { obj: THREE.Light; order: number })[],
    pooled: { pl: PieceLight; at: THREE.Vector3 }[],
  ): void {
    const pool =
      pooled.length > 0 ? Math.min(this.budget.pool, pooled.length) : 0;
    const room = Math.max(0, this.budget.lights - pool);
    const ranked = [...wanted].sort(
      (x, y) =>
        (y.prio ?? (y.minor ? 0 : 1)) - (x.prio ?? (x.minor ? 0 : 1)) ||
        x.order - y.order,
    );
    let shadows = this.budget.shadows;
    ranked.forEach((l, i) => {
      if (i >= room) {
        l.obj.parent?.remove(l.obj);
        return;
      }
      if (l.obj.castShadow) {
        if (shadows > 0) {
          shadows--;
          const s = l.obj as THREE.SpotLight;
          s.shadow.mapSize.set(1024, 1024);
          s.shadow.bias = -0.0015;
          s.shadow.radius = 4;
        } else l.obj.castShadow = false;
      }
      b.lights.push({
        obj: l.obj,
        base: l.base,
        flicker: l.flicker,
        area: l.area,
      });
    });
    if (pool > 0) {
      const src = pooled[0].pl;
      const lights: THREE.PointLight[] = [];
      for (let i = 0; i < pool; i++) {
        const l = new THREE.PointLight(
          src.light.color,
          0,
          src.light.distance,
          2,
        );
        b.group.add(l);
        lights.push(l);
      }
      b.pool = { lights, lamps: pooled.map((p) => p.at), base: src.base };
    }
  }

  /**
   * r22: what never moves is drawn together. Pieces that share a material
   * (the stools, the panelling, the brass, the façade's dark panes) are
   * baked into one mesh each, so the graphics card is asked a few dozen
   * times a frame instead of hundreds. Props the story shows and hides, and
   * anything turned to the camera, stay pieces of their own.
   */
  private mergeStatic(b: BuiltPlace): void {
    b.group.updateMatrixWorld(true);
    const kept = (o: THREE.Object3D): boolean => {
      for (let x: THREE.Object3D | null = o; x && x !== b.group; x = x.parent) {
        const u = x.userData;
        if (u.keep || u.frontOnly || u.streak || u.puddle || !x.visible) {
          return true;
        }
      }
      return false;
    };
    interface Piece {
      mat: THREE.Material;
      geo: THREE.BufferGeometry;
      mesh: THREE.Mesh;
    }
    const sets = new Map<string, Piece[]>();
    const meshes: THREE.Mesh[] = [];
    const add = (
      mesh: THREE.Mesh,
      mat: THREE.Material,
      geo: THREE.BufferGeometry,
    ) => {
      if (mat.transparent) return false;
      const sig = `${Object.keys(geo.attributes).sort().join(",")}|${geo.index ? 1 : 0}`;
      const key = `${mat.uuid}|${sig}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}`;
      const list = sets.get(key) ?? [];
      list.push({ mat, geo, mesh });
      sets.set(key, list);
      return true;
    };
    b.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (
        (m as unknown as THREE.SkinnedMesh).isSkinnedMesh ||
        (m as unknown as THREE.InstancedMesh).isInstancedMesh ||
        kept(m)
      ) {
        return;
      }
      const g = m.geometry;
      if (!Array.isArray(m.material)) {
        if (add(m, m.material, g)) meshes.push(m);
        return;
      }
      // A box with a material per face (a wall, inside and out): each
      // face goes with the rest of its material, so a wall is a couple of
      // draws, not six per piece.
      const mats = m.material;
      if (!g.index || g.groups.length === 0) return;
      if (mats.some((x) => x.transparent)) return;
      for (const grp of g.groups) {
        const sub = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(g.attributes)) {
          sub.setAttribute(name, attr);
        }
        sub.setIndex(
          new THREE.BufferAttribute(
            (g.index.array as Uint16Array | Uint32Array).slice(
              grp.start,
              grp.start + grp.count,
            ),
            1,
          ),
        );
        add(m, mats[grp.materialIndex ?? 0], sub);
      }
      meshes.push(m);
    });
    const merged = new Set<THREE.Mesh>();
    for (const list of sets.values()) {
      // One piece alone stays as it is (unless it's a face of a box).
      if (list.length < 2 && !Array.isArray(list[0].mesh.material)) continue;
      // r22 hotfix: through floats, or quantized furniture collapses.
      const geos = list.map((p) => worldGeometry(p.geo, p.mesh.matrixWorld));
      const geo = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!geo) continue;
      const first = list[0].mesh;
      const mesh = new THREE.Mesh(geo, list[0].mat);
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder;
      b.group.add(mesh);
      for (const p of list) merged.add(p.mesh);
    }
    for (const m of meshes) {
      if (!merged.has(m)) continue;
      // A box's faces must all have gone to be removed.
      if (Array.isArray(m.material)) {
        const all = (m.geometry.groups ?? []).length > 0;
        if (!all) continue;
      }
      m.removeFromParent();
      if (!m.geometry.userData.shared) m.geometry.dispose();
    }
  }

  /** Gets a place ready next door: built bit by bit, then compiled. */
  prepare(def: PlaceDef): Promise<void> {
    const have = this.places.get(def.key);
    if (have) return have.ready;
    let p = this.building.get(def.key);
    if (!p) {
      p = this.buildSlow(def).then((b) => {
        const have = this.places.get(def.key);
        if (have) {
          // He walked in before it was done: the one built then stands.
          this.disposePlace(b);
          return have;
        }
        b.ready = (async () => {
          if (this.disposed) return;
          // The camera framed roughly where it'll be: what's in view
          // compiles; anything else compiles when first seen.
          try {
            await this.renderer.compileAsync(b.scene, this.camera);
            // The people too, lit as they'll be there (their shaders depend
            // on the place's lights): the hero stands for everyone, whose
            // clothes are the same kind of material.
            const hero = this.people.get(this.hero);
            if (hero?.root.visible) {
              await this.renderer.compileAsync(hero.root, this.camera, b.scene);
            }
          } catch {
            // compiled on first draw instead
          }
        })();
        this.places.set(def.key, b);
        this.building.delete(def.key);
        return b;
      });
      this.building.set(def.key, p);
    }
    return p.then((b) => b.ready);
  }

  /** Frees every place but these (and the one he's in). */
  keepOnly(keys: string[]): void {
    for (const [key, b] of this.places) {
      if (key === this.place?.def.key || keys.includes(key)) continue;
      this.disposePlace(b);
      this.places.delete(key);
    }
  }

  private disposePlace(b: BuiltPlace): void {
    const textures = new Set<THREE.Texture>();
    b.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (this.isPerson(o)) return;
      if (
        m.isMesh ||
        (o as THREE.Sprite).isSprite ||
        (o as THREE.LineSegments).isLineSegments
      ) {
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if (!mat || mat.userData.shared) continue;
          for (const v of Object.values(mat)) {
            if ((v as THREE.Texture)?.isTexture)
              textures.add(v as THREE.Texture);
          }
          mat.dispose();
        }
      }
      const l = o as THREE.Light;
      if (l.isLight) l.dispose?.();
    });
    for (const t of textures) {
      if (!t.userData.shared && t !== this.env) t.dispose();
    }
    b.drips?.dispose();
    b.glints?.dispose();
  }

  private isPerson(o: THREE.Object3D): boolean {
    let x: THREE.Object3D | null = o;
    while (x) {
      if (x.userData.person) return true;
      x = x.parent;
    }
    return false;
  }

  /** Shows a place (building it now if it isn't ready); fades it in. */
  setPlace(def: PlaceDef | null): void {
    if (def === null) {
      this.place = null;
      for (const p of this.people.values()) p.root.visible = false;
      return;
    }
    if (this.place?.def.key === def.key) return;
    let b = this.places.get(def.key);
    if (!b) {
      // Not prepared: build it now, behind the fade.
      b = this.buildNow(def);
      this.places.set(def.key, b);
      this.building.delete(def.key);
    }
    this.place = b;
    this.post.setScene(b.scene);
    this.renderer.toneMappingExposure = def.env.exposure ?? 1.15;
    for (const p of this.people.values()) {
      b.scene.add(p.root);
      p.root.visible = false;
    }
    if (this.pingMesh) b.scene.add(this.pingMesh);
    if (this.runMark) b.scene.add(this.runMark);
    b.scene.add(this.rain.group);
    this.rain.group.visible = b.outdoor;
    this.rain.setDry(def.areas.filter((a) => !a.rain).map((a) => a.rect));
    this.rain.setLamps(b.lamps.map((at) => ({ at, k: 1 })));
    this.glints.clear();
    if (b.glints) b.glints.count = 1;
    this.noticed.clear();
    this.near.clear();
    this.lookOffset.set(0, 0, 0);
    this.fade = 0;
    this.fadeTo = 1;
    this.snapCamera = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  get placeKey(): string | null {
    return this.place?.def.key ?? null;
  }

  get placeDef(): PlaceDef | null {
    return this.place?.def ?? null;
  }

  /** Fades to black; resolves when it's dark (for going through a door). */
  fadeOut(): Promise<void> {
    this.fadeTo = 0;
    return new Promise((r) => this.fadeWait.push(r));
  }

  // --- people --------------------------------------------------------------

  private person(id: string, wear?: string): Person | null {
    const c = this.cast.find((x) => x.id === id);
    // BPLAY (r22): his clothes' look, unless the story dresses him itself.
    const lookName =
      wear ?? (id === this.hero ? (this.heroLook ?? c?.look) : c?.look);
    if (!lookName) return null;
    // BPEOPLE (r22): their own model (the cast's, or their look's) in every wear=.
    const look = lookFor(lookName, c?.model ?? lookFor(c?.look).model);
    let p = this.people.get(id);
    if (p && p.look !== look) {
      // A change of clothes: a new body in the same place.
      const at = p.root.position.clone();
      const h = p.heading;
      const shown = p.root.visible;
      p.root.removeFromParent();
      p.dispose();
      p = this.makePerson(id, look);
      p.root.position.copy(at);
      p.heading = h;
      p.root.visible = shown;
    }
    if (!p) {
      p = this.makePerson(id, look);
      // Unseen until someone puts them on a mark.
      p.root.visible = false;
    }
    return p;
  }

  private makePerson(id: string, look: Look): Person {
    const p = new Person(
      id,
      look.body === "f" ? this.assets.rigs.f : this.assets.rigs.m,
      look,
      this.assets.gestures,
    );
    p.root.userData.person = id;
    // Something for the pointer to find: a body-sized column.
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.75, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.y = 0.88;
    proxy.userData.personId = id;
    p.root.add(proxy);
    this.personProxy.set(id, proxy);
    this.people.set(id, p);
    this.place?.scene.add(p.root);
    setWetness(p, this.wet.get(id) ?? 0);
    return p;
  }

  private mark(name: string): Mark | null {
    return this.place?.def.marks[name] ?? null;
  }

  private markPos(m: Mark): THREE.Vector3 {
    return new THREE.Vector3(m.at[0], 0, m.at[1]);
  }

  /** Whether someone the stage puts somewhere is in this place. */
  private here(st: ActorState): boolean {
    if (!this.place) return false;
    if (st.place !== undefined) return st.place === this.place.def.key;
    return !!this.mark(st.at);
  }

  /** Everyone where the stage says, at once (a scene starting, a load). */
  placeCast(actors: Record<string, ActorState>): void {
    for (const [id, p] of this.people) {
      if (!actors[id]) p.root.visible = false;
    }
    for (const id of [...this.idles.keys()]) {
      if (!actors[id]) this.setIdle(id, undefined);
    }
    for (const [id, st] of Object.entries(actors)) {
      this.setIdle(id, st.idle);
      const m = this.here(st) ? this.mark(st.at) : null;
      if (!m) {
        // Elsewhere (the stage keeps them where they were left).
        const gone = this.people.get(id);
        if (gone) gone.root.visible = false;
        continue;
      }
      const p = this.person(id, st.wear);
      if (!p) continue;
      p.root.visible = true;
      if (st.pose === "sit") {
        const spot = this.sitSpot(p, m);
        p.place(spot.at, spot.face, "sit", spot.seat);
      } else {
        p.place(
          this.markPos(m),
          deg(m.face ?? 0),
          st.pose as Pose,
          m.seat ?? 0,
        );
      }
    }
    this.snapCamera = true;
  }

  /**
   * BFIX (r23): where someone sits for a mark: on the seat beside it (a
   * stool, a chair), their hips over its middle and at its height, facing
   * the way a chair faces (or the mark's way, on a stool); otherwise at the
   * mark, at its `seat` height.
   */
  private sitSpot(
    p: Person,
    m: Mark,
  ): { at: THREE.Vector3; seat: number; face: number } {
    const face = deg(m.face ?? 0);
    const st = this.seatNear(m.at[0], m.at[1], 0.6);
    if (!st) {
      return { at: this.markPos(m), seat: m.seat ?? 0.46, face };
    }
    return this.onSeat(p, st, face);
  }

  private onSeat(
    p: Person,
    st: Seat,
    face: number,
  ): { at: THREE.Vector3; seat: number; face: number } {
    const h = st.facing ?? face;
    const back = p.seatFit().back;
    return {
      at: new THREE.Vector3(
        st.x + Math.sin(h) * back,
        0,
        st.z + Math.cos(h) * back,
      ),
      seat: st.y,
      face: h,
    };
  }

  /** The seat nearest a point, within `within` metres. */
  private seatNear(x: number, z: number, within: number): Seat | null {
    let best: Seat | null = null;
    let bd = within;
    for (const st of this.place?.seats ?? []) {
      const d = Math.hypot(st.x - x, st.z - z);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** Whether someone (but `but`) is on or at a seat. */
  private seatTaken(st: Seat, but: string): boolean {
    for (const [id, p] of this.people) {
      if (id === but || !p.root.visible) continue;
      const at = p.root.position;
      if (Math.hypot(at.x - st.x, at.z - st.z) < 0.5) return true;
    }
    return false;
  }

  /**
   * BFIX (r23): walks him to a seat (as near as he can get, then onto it)
   * and sits him down. False if it's taken or he can't.
   */
  sitHero(index: number, run = false): boolean {
    const st = this.place?.seats[index];
    const p = this.people.get(this.hero);
    if (!st || !p || !p.root.visible || this.seatTaken(st, this.hero)) {
      return false;
    }
    const face = st.facing ?? this.stoolFacing(st, p);
    const spot = this.onSeat(p, st, face);
    const pts = this.route(p, spot.at.x, spot.at.z) ?? [];
    pts.push(spot.at);
    this.heroGait = setGait(p, run ? "run" : "walk");
    p.walk(
      pts,
      () => {
        this.heroGait = setGait(p, "walk");
        p.sitDown(spot.seat, spot.face);
      },
      spot.face,
    );
    this.ping(spot.at, run);
    return true;
  }

  /**
   * A stool faces whatever's beside it: the bar (the nearest solid thing's
   * side), or, failing that, away from him.
   */
  private stoolFacing(st: Seat, p: Person): number {
    const nav = this.place!.nav;
    let best = Math.atan2(st.x - p.root.position.x, st.z - p.root.position.z);
    let bd = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (let r = 0.3; r < 0.9; r += 0.1) {
        if (!nav.walkable(st.x + Math.sin(a) * r, st.z + Math.cos(a) * r)) {
          // Blocked by the stool itself near; count only beyond it.
          if (r > 0.35 && r < bd) {
            bd = r;
            best = a;
          }
          break;
        }
      }
    }
    return best;
  }

  /** Someone moves: walks to their mark (or appears there), then poses. */
  moveActor(id: string, st: ActorState | null, walk: boolean): void {
    this.setIdle(id, st?.idle);
    const p0 = this.people.get(id);
    if (st === null || !this.here(st)) {
      if (!p0 || !p0.root.visible) return;
      // Off to another place: out through its door, if there's one.
      const door = st?.place ? this.doorTo(st.place) : null;
      if (walk && door && this.place) {
        const at = this.markPos(door);
        const pts = this.route(p0, at.x, at.z);
        if (pts) {
          p0.walk(pts, () => (p0.root.visible = false));
          return;
        }
      }
      p0.root.visible = false;
      return;
    }
    const m = this.mark(st.at)!;
    const p = this.person(id, st.wear);
    if (!p) return;
    // BFIX (r23): sitting, on the seat by the mark, at its height.
    const spot =
      st.pose === "sit"
        ? this.sitSpot(p, m)
        : { at: this.markPos(m), seat: m.seat ?? 0, face: deg(m.face ?? 0) };
    const target = spot.at;
    const face = spot.face;
    const finish = () => {
      if (st.pose === "sit") p.sitDown(spot.seat, face);
      else p.setPose(st.pose as Pose, 0, face);
    };
    if (!walk || !p.root.visible || !this.place) {
      p.root.visible = true;
      p.place(target, face, st.pose as Pose, spot.seat);
      return;
    }
    const pts = this.route(p, target.x, target.z) ?? [];
    // The last step is to the mark itself, even onto a stool.
    pts.push(target);
    p.walk(pts, finish, face);
  }

  /**
   * BFIX (r23): the way for someone to a point: round what's in the way,
   * ending where he can get nearest it, its corners rounded where the floor
   * allows; from a step off whatever he's in, if he's in something (just
   * up from a stool). Null if he can go nowhere.
   */
  private route(p: Person, x: number, z: number): THREE.Vector3[] | null {
    if (!this.place) return null;
    const nav = this.place.nav;
    const from: P = [p.root.position.x, p.root.position.z];
    const path = nav.path(from, [x, z]);
    if (!path) return null;
    const moved = Math.hypot(path[0][0] - from[0], path[0][1] - from[1]) > 1e-6;
    const pts = roundCorners(moved ? [from, ...path] : path, (a, b) =>
      nav.clear(a, b),
    );
    return pts.slice(1).map(([px, pz]) => new THREE.Vector3(px, 0, pz));
  }

  /** The mark by the door that leads to a place, if this place has one. */
  private doorTo(place: string): Mark | null {
    if (!this.place) return null;
    for (const h of Object.values(this.place.def.hotspots)) {
      if (h.to?.place === place && h.stand) return this.mark(h.stand);
    }
    return null;
  }

  setTalking(who: string | null): void {
    for (const [id, p] of this.people) {
      // r25: a couple's talk is their own, unless the story gives them a line.
      if (id !== who && this.idles.get(id)?.kind === "talk") continue;
      p.setTalking(id === who);
    }
  }

  /**
   * r25: what someone does by themselves (`idle=` on their @actor line):
   * "drink", "read" (a book in hand, a page now and then) or "talk" (with
   * the others of its group, "talk:table", one at a time), or nothing. The
   * regulars cast no shadow: they're the room, not the story, and the bar
   * keeps to its budget.
   */
  private setIdle(id: string, idle: string | undefined): void {
    const was = this.idles.get(id);
    const [kind, group = ""] = (idle ?? "").split(":");
    if (was && was.kind === kind && was.group === group) return;
    if (was) {
      const p = was.on;
      if (was.prop && p) holdProp(p, null);
      was.prop?.removeFromParent();
      if (was.kind === "talk") p?.setTalking(false);
      this.idles.delete(id);
    }
    if (!kind) return;
    this.idles.set(id, {
      kind,
      group,
      t: 2 + Math.random() * 10,
      prop: null,
      on: null,
    });
  }

  private tickIdle(dt: number): void {
    for (const [id, s] of this.idles) {
      const p = this.people.get(id);
      if (p && s.on !== p) {
        // Set up on the person the first time they're there (or rebuilt).
        s.on = p;
        if (s.kind === "read") {
          s.prop ??= heldProp("book_open");
          holdProp(p, s.prop);
        }
        p.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = false;
        });
      }
      if (!p?.root.visible || p.walking || s.kind === "talk") continue;
      s.t -= dt;
      if (s.t > 0) continue;
      if (s.kind === "drink") {
        p.gesture(Math.random() < 0.8 ? "drink" : "nod");
        s.t = 14 + Math.random() * 20;
      } else if (s.kind === "read") {
        p.gesture("interact");
        s.t = 16 + Math.random() * 22;
      } else {
        s.t = 30;
      }
    }
    // Talk at a table goes round, one voice at a time, with pauses.
    const members = new Map<string, string[]>();
    for (const [id, s] of this.idles) {
      const p = this.people.get(id);
      if (s.kind !== "talk" || !p?.root.visible || p.walking) continue;
      members.set(s.group, [...(members.get(s.group) ?? []), id]);
    }
    for (const [g, ids] of members) {
      let c = this.chats.get(g);
      if (!c) {
        c = { speaker: null, last: null, t: 1 + Math.random() * 3 };
        this.chats.set(g, c);
      }
      c.t -= dt;
      if (c.t > 0) continue;
      if (c.speaker) {
        this.people.get(c.speaker)?.setTalking(false);
        c.last = c.speaker;
        c.speaker = null;
        c.t = 0.8 + Math.random() * 2.2;
        if (Math.random() < 0.5) {
          const other = ids.find((x) => x !== c.last);
          if (other) this.people.get(other)?.gesture("nod");
        }
      } else {
        const pick =
          ids.length > 1 && Math.random() < 0.75
            ? (ids.find((x) => x !== c.last) ?? ids[0])
            : ids[Math.floor(Math.random() * ids.length)];
        c.speaker = pick;
        this.people.get(pick)?.setTalking(true);
        c.t = 2.5 + Math.random() * 4.5;
      }
    }
  }

  /**
   * r25: what's underfoot where someone stands: the topmost floor piece
   * there (tiles, oak boards, the lobby's carpet), or the street's stone.
   */
  surfaceAt(x: number, z: number): StepSurface {
    const def = this.place?.def;
    if (!def) return "stone";
    let best: { y: number; s: string } | null = null;
    for (const it of def.items) {
      if (it.kind !== "floor") continue;
      const [w, d] = (it.size as [number, number]) ?? [10, 10];
      const [cx, cy, cz] = it.at;
      if (Math.abs(x - cx) > w / 2 || Math.abs(z - cz) > d / 2) continue;
      if (!best || cy >= best.y) {
        best = { y: cy, s: typeof it.surface === "string" ? it.surface : "" };
      }
    }
    const s = best?.s ?? (this.place?.outdoor ? "paving" : "oak");
    return stepSurface(s);
  }

  /** r25: a footfall every stride and a half for whoever's walking. */
  private tickSteps(dt: number): void {
    if (!this.onStep || !this.place) return;
    for (const [id, p] of this.people) {
      if (!p.root.visible || p.pose === "sit" || p.speed < 0.25) {
        this.stepClock.delete(id);
        continue;
      }
      const k = Math.min(1, Math.max(0, (p.speed - 1.15) / (5.2 - 1.15)));
      const every =
        p.speed < 1.15
          ? Math.min(0.9, 0.55 * Math.sqrt(1.15 / p.speed))
          : 0.55 + (0.31 - 0.55) * k;
      const t = (this.stepClock.get(id) ?? every * 0.5) + dt;
      if (t < every) {
        this.stepClock.set(id, t);
        continue;
      }
      this.stepClock.set(id, t - every);
      const at = p.root.position;
      const area = this.areaOf(at.x, at.z);
      const out = this.place.outdoor && area?.inside !== true;
      this.onStep({
        who: id,
        hero: id === this.hero,
        surface: this.surfaceAt(at.x, at.z),
        run: p.running && p.speed > 2,
        wet: out ? this.weather.ground : 0,
        x: at.x,
        z: at.z,
      });
    }
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

  /** BPLAY (r22): the weather now (rain, drizzle, clear or fog), drift and all. */
  get weatherNow(): string {
    return weatherAt(this.weatherKind, this.time);
  }

  /** r22: the weather the story wants (null: the place's own drift). */
  setWeather(kind: string | null): void {
    this.weatherKind = (kind as WeatherKind | null) ?? null;
  }

  /** How much of the screen the dialogue column covers. */
  setInset(right: number, bottom: number): void {
    this.inset = { right, bottom };
  }

  heroAt(): THREE.Vector3 | null {
    const p = this.people.get(this.hero);
    return p && p.root.visible ? p.root.position.clone() : null;
  }

  /**
   * BPLAY (r22): the look his clothes give him. Only an outfit with a model
   * changes him (the owner's field jacket, today); clothes without one keep
   * him as he is, so a null here leaves his appearance alone.
   */
  dressHero(look: string | null): void {
    if (look === null || look === this.heroLook) return;
    this.heroLook = look;
    const p = this.people.get(this.hero);
    if (!p || p.root.visible === false) return;
    if (wearLook(p, look)) return;
    // Rebuilt in the new look, where he stood.
    this.person(this.hero);
  }

  /**
   * BPLAY (r22): what he holds: "umbrella", "baton", any other drawing's
   * name for a small thing, or null for empty hands. Open over his head
   * outdoors, an umbrella keeps the rain off him.
   */
  holdHero(kind: string | null): void {
    if (this.held?.kind === kind) return;
    if (this.held) {
      const p = this.people.get(this.hero);
      if (this.held.own && p) holdProp(p, null);
      this.held.prop.removeFromParent();
      this.held.prop.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      this.held = null;
    }
    if (kind === null) return;
    const prop = heldProp(kind);
    const p = this.people.get(this.hero);
    const own = !!p && holdProp(p, prop);
    this.held = { kind, prop, own };
  }

  /**
   * Keeps a held prop at his hand (when the person doesn't carry it), and
   * opens the umbrella over him outdoors (it hangs closed indoors).
   * BFIX (r23): the people carry it themselves now (People.ts, setHeld),
   * set right in the hand; a person rebuilt in another look takes it again.
   */
  private carryHeld(): void {
    const h = this.held;
    const p = this.people.get(this.hero);
    if (!h || !p || !this.place) return;
    const open = h.prop.getObjectByName("open");
    const shut = h.prop.getObjectByName("shut");
    if (open && shut) {
      const area = this.areaOf(p.root.position.x, p.root.position.z);
      const out = this.place.outdoor && area?.inside !== true;
      open.visible = out && p.pose !== "sit";
      shut.visible = !open.visible;
    }
    if (h.own) {
      if (h.prop.parent !== p.root) h.own = holdProp(p, h.prop);
      return;
    }
    if (h.prop.parent !== this.place.scene) this.place.scene.add(h.prop);
    h.prop.visible = p.root.visible;
    if (!p.root.visible) return;
    const hand = p.bone("hand_r");
    if (hand) hand.getWorldPosition(this.v3);
    else this.v3.copy(p.root.position).setY(0.95);
    h.prop.position.copy(this.v3);
    h.prop.rotation.set(0, p.heading, 0);
  }

  /** Where he stands, which way he faces and how wet he is: for a save. */
  heroState(): { x: number; z: number; heading: number; wet: number } | null {
    const p = this.people.get(this.hero);
    if (!p || !p.root.visible) return null;
    return {
      x: Math.round(p.root.position.x * 100) / 100,
      z: Math.round(p.root.position.z * 100) / 100,
      heading: Math.round(p.heading * 1000) / 1000,
      wet: Math.round((this.wet.get(this.hero) ?? 0) * 1000) / 1000,
    };
  }

  /** Puts him back where a save had him (if he's standing in this place). */
  restoreHero(s: { x: number; z: number; heading: number; wet: number }): void {
    const p = this.people.get(this.hero);
    this.wet.set(this.hero, s.wet);
    if (p) setWetness(p, s.wet);
    if (!p || !p.root.visible || p.pose === "sit" || !this.place) return;
    if (!this.place.nav.walkable(s.x, s.z)) return;
    p.place(new THREE.Vector3(s.x, 0, s.z), s.heading, "stand");
    this.snapCamera = true;
  }

  get heroBusy(): boolean {
    return this.people.get(this.hero)?.walking ?? false;
  }

  get heroSeated(): boolean {
    return this.people.get(this.hero)?.pose === "sit";
  }

  /**
   * Walks (or runs) the hero to a point (or the nearest he can reach, if
   * it's in something); false if he can go nowhere. BFIX (r23): `face`, a
   * point he turns to as he arrives.
   */
  walkHero(
    x: number,
    z: number,
    run = false,
    then?: () => void,
    face?: THREE.Vector3,
  ): boolean {
    const p = this.people.get(this.hero);
    if (!p || !this.place || !p.root.visible) return false;
    const pts = this.route(p, x, z);
    if (!pts) return false;
    if (pts.length === 0) {
      then?.();
      return true;
    }
    const end = pts[pts.length - 1];
    const heading = face
      ? Math.atan2(face.x - end.x, face.z - end.z)
      : undefined;
    this.heroGait = setGait(p, run ? "run" : "walk");
    p.walk(
      pts,
      () => {
        this.heroGait = setGait(p, "walk");
        then?.();
      },
      heading,
    );
    this.ping(end, run);
    return true;
  }

  /** Walks the hero to look at a hotspot, then turns to it. */
  walkToHotspot(id: string, then: () => void, run = false): void {
    const h = this.place?.def.hotspots[id];
    const p = this.people.get(this.hero);
    if (!h || !p || !this.place) {
      then();
      return;
    }
    const at = this.hotspotPos(h, this.v4).clone();
    const face = () => {
      const d = at.clone().sub(p.root.position);
      if (p.pose !== "sit") p.face(Math.atan2(d.x, d.z));
      if (!h.to) p.gesture("interact");
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
        if (!this.walkHero(target.x, target.z, run, face, at)) face();
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
    if (!free || !this.walkHero(free[0], free[1], run, face, at)) face();
  }

  /**
   * r22: walks him up to someone (to talk), stopping an arm's length off,
   * and turns him to them. False if they're not here.
   */
  walkUpTo(id: string, then: () => void): boolean {
    const them = this.people.get(id);
    const p = this.people.get(this.hero);
    if (!them || !p || !them.root.visible || !p.root.visible || !this.place) {
      return false;
    }
    const at = them.root.position;
    const face = () => {
      p.face(Math.atan2(at.x - p.root.position.x, at.z - p.root.position.z));
      then();
    };
    const d = Math.hypot(at.x - p.root.position.x, at.z - p.root.position.z);
    if (d < 1.7) {
      face();
      return true;
    }
    const k = 1.1 / d;
    const gx = at.x + (p.root.position.x - at.x) * k;
    const gz = at.z + (p.root.position.z - at.z) * k;
    const free = this.place.nav.nearestFree(gx, gz);
    if (!free || !this.walkHero(free[0], free[1], false, face, at)) face();
    return true;
  }

  /** Turns him (sitting or standing) to face a hotspot, and looks. */
  faceHotspot(id: string): void {
    const h = this.place?.def.hotspots[id];
    const p = this.people.get(this.hero);
    if (!h || !p) return;
    const at = this.hotspotPos(h, this.v4);
    if (p.pose !== "sit") {
      p.face(Math.atan2(at.x - p.root.position.x, at.z - p.root.position.z));
    }
  }

  private hotspotPos(h: Hotspot, out: THREE.Vector3): THREE.Vector3 {
    if (h.on) {
      const person = this.people.get(h.on.who);
      const bone = person?.root.visible ? person.bone(h.on.bone) : null;
      if (bone) return bone.localToWorld(out.set(...h.at));
    }
    return out.set(...h.at);
  }

  // --- noticing things (r22) -----------------------------------------------

  private glintMaterial(): THREE.MeshBasicMaterial {
    // Added light, so each glint's brightness is its instance's colour.
    return new THREE.MeshBasicMaterial({
      map: glintTexture(),
      color: "#ffd9a0",
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
  }

  private readonly glintM = new THREE.Matrix4();
  private readonly glintS = new THREE.Vector3();
  private readonly glintP = new THREE.Vector3();
  private readonly glintC = new THREE.Color();

  /** Which things are near and in sight; glints on them. A few times a second. */
  private scanThings(dt: number): void {
    const b = this.place;
    const hero = this.people.get(this.hero);
    if (!b) return;
    this.scanAt -= dt;
    const due = this.scanAt <= 0;
    if (due) this.scanAt = 0.12;
    const from = hero?.root.visible ? hero.root.position : null;
    const seated = !!hero && hero.pose === "sit";
    let changed = false;
    if (due) {
      const near = new Set<string>();
      if (from) {
        for (const [id, info] of this.things) {
          const h = b.def.hotspots[id];
          if (!h) continue;
          const at = this.hotspotPos(h, this.v1);
          const d = Math.hypot(at.x - from.x, at.z - from.z);
          const range = noticeRange(h, {
            perception: this.perception,
            door: info.door,
            seated: seated || this.still,
            showAll: this.showAll,
          });
          const stand = h.stand ? b.def.marks[h.stand]?.at : undefined;
          if (
            d <= range &&
            canSee(b.def.areas, [from.x, from.z], [at.x, at.z], stand)
          ) {
            near.add(id);
          }
        }
      }
      for (const id of near) {
        if (!this.noticed.has(id)) {
          this.noticed.add(id);
          changed = true;
        }
      }
      for (const id of [...this.noticed]) {
        if (!this.things.has(id)) {
          this.noticed.delete(id);
          changed = true;
        }
      }
      this.near = near;
    }
    // The glints: on what's near and worth a look (not doors), all of them
    // instances of the place's one glint mesh, turned to the camera.
    const mesh = b.glints;
    let n = 0;
    for (const [id, info] of this.things) {
      const h = b.def.hotspots[id];
      if (!h || info.door) continue;
      const want = this.near.has(id) ? (this.hovered === id ? 1.6 : 1) : 0;
      let k = this.glints.get(id) ?? 0;
      if (k === 0 && want === 0) continue;
      k += (want - k) * (1 - Math.exp(-dt * 6));
      if (want === 0 && k < 0.01) {
        this.glints.delete(id);
        continue;
      }
      this.glints.set(id, k);
      if (!mesh || n >= mesh.instanceMatrix.count) continue;
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 3 + id.length);
      this.hotspotPos(h, this.glintP);
      this.glintS.setScalar((0.2 + 0.1 * k) * (this.camSpan / 10));
      this.glintM.compose(this.glintP, this.camera.quaternion, this.glintS);
      mesh.setMatrixAt(n, this.glintM);
      mesh.setColorAt(n, this.glintC.setScalar(Math.min(1, k) * pulse));
      n++;
    }
    for (const id of this.glints.keys()) {
      if (!this.things.has(id)) this.glints.delete(id);
    }
    if (mesh) {
      if (n === 0) {
        // Nothing glints: the dark instance out of sight.
        mesh.setMatrixAt(0, this.glintM.makeTranslation(0, -50, 0));
        mesh.setColorAt(0, this.glintC.setScalar(0));
      }
      mesh.count = Math.max(1, n);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (changed) this.onNoticed?.([...this.noticed]);
  }

  // --- the camera ----------------------------------------------------------

  private snapCamera = true;
  private rainLevel = 1;
  private readonly camVel = new THREE.Vector3();

  private areaOf(x: number, z: number): Area | null {
    // Rooms before the street around them: the smallest that contains it.
    return this.place ? areaAt(this.place.def.areas, x, z) : null;
  }

  private updateCamera(dt: number): void {
    if (!this.place) return;
    const def = this.place.def;
    const heroP = this.people.get(this.hero);
    const hero = heroP?.root.visible ? heroP.root.position : null;
    const shot = this.focusKey ? def.shots[this.focusKey] : undefined;
    const area = hero ? this.areaOf(hero.x, hero.z) : null;
    const target = this.v1;
    if (shot) {
      target.set(...shot.at);
      this.wantSpan = shot.span;
    } else if (hero) {
      target.copy(hero).setY(1.0).add(this.lookOffset);
      this.wantSpan = (area?.span ?? 14) * this.zoom;
    } else {
      const b = def.nav.bounds;
      target.set((b[0] + b[2]) / 2, 0, (b[1] + b[3]) / 2);
      this.wantSpan = 16 * this.zoom;
    }
    // Seated, the view comes back to him by itself when he stands.
    if (!this.heroSeated && !this.still && this.drag === null) {
      this.lookOffset.multiplyScalar(Math.exp(-dt * 3));
    }
    // A phone held upright (or a narrow window) would see a sliver of the
    // place: widen the shot until the part the column leaves free shows at
    // least three quarters of what it's meant to, side to side.
    const cw = this.canvas.clientWidth || 1;
    const ch = this.canvas.clientHeight || 1;
    const freeW = Math.max(1, cw - this.inset.right);
    this.wantSpan *= Math.max(1, 0.75 / (freeW / ch));
    const snap = this.snapCamera;
    // BFIX (r23): a critically damped follow (no overshoot, no jolt when
    // he sets off or stops): r22's first-order lag jumped in acceleration.
    if (snap) {
      this.camTarget.copy(target);
      this.camVel.set(0, 0, 0);
    } else {
      smoothDamp(this.camTarget, target, this.camVel, shot ? 0.6 : 0.32, dt);
    }
    this.camSpan +=
      (this.wantSpan - this.camSpan) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
    this.snapCamera = false;

    const aspect = cw / ch;
    const halfH = this.camSpan / 2;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    const az = deg(def.camera.azimuth);
    const el = deg(def.camera.elevation);
    const dir = this.dir.set(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    );
    // Keep what he's doing in the middle of the part the column leaves free.
    const right = this.right.crossVectors(UP, dir).normalize();
    const camUp = this.camUp.crossVectors(dir, right).normalize();
    const shiftX = (this.inset.right / 2 / cw) * (halfW * 2);
    const shiftY = (this.inset.bottom / 2 / ch) * (halfH * 2);
    const look = this.v2
      .copy(this.camTarget)
      .addScaledVector(right, shiftX)
      .addScaledVector(camUp, -shiftY);
    this.camera.position.copy(look).addScaledVector(dir, 80);
    this.camera.up.copy(UP);
    this.camera.lookAt(look);
    this.camera.updateProjectionMatrix();
    // Signs that face away from the camera, with nothing drawn behind them.
    for (const o of this.place.frontOnly) {
      o.visible = o.getWorldDirection(this.facing).dot(dir) > -0.15;
    }

    // Walls between the camera and the room he's in come down.
    let indoors = !this.place.outdoor;
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
    this.rain.setStrength(this.rainLevel * this.weather.rain);
  }

  private shotInside(at: [number, number, number], areaId: string): boolean {
    const a = this.place?.def.areas.find((x) => x.id === areaId);
    if (!a) return false;
    const [x0, z0, x1, z1] = a.rect;
    return at[0] >= x0 && at[0] <= x1 && at[2] >= z0 && at[2] <= z1;
  }

  /** r22: seated, the view pans about the room (arrow keys or a drag). */
  pan(dx: number, dz: number): void {
    if (!this.heroSeated && !this.still) return;
    this.lookOffset.x = THREE.MathUtils.clamp(this.lookOffset.x + dx, -6, 6);
    this.lookOffset.z = THREE.MathUtils.clamp(this.lookOffset.z + dz, -6, 6);
  }

  /** Back to looking at him. */
  recentre(): void {
    this.lookOffset.set(0, 0, 0);
  }

  // --- input ---------------------------------------------------------------

  private pointer(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return this.ptr.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  /** What's under the pointer: a thing, a person, or the floor. */
  private pick(
    e: PointerEvent | MouseEvent,
  ):
    | { kind: "hotspot"; id: string }
    | { kind: "person"; id: string }
    | { kind: "floor"; x: number; z: number }
    | { kind: "seat"; index: number }
    | null {
    if (!this.place) return null;
    this.ray.setFromCamera(this.pointer(e), this.camera);
    const targets: THREE.Object3D[] = [];
    for (const [id, m] of this.place.proxies) {
      // Only what he has noticed (doors: once he's near enough to see).
      if (this.noticed.has(id) && this.things.has(id)) targets.push(m);
    }
    for (const [id, m] of this.personProxy) {
      const p = this.people.get(id);
      if (p?.root.visible && this.talkers.has(id) && id !== this.hero) {
        targets.push(m);
      }
    }
    const hit = this.ray.intersectObjects(targets, false)[0];
    if (hit) {
      if (hit.object.userData.personId) {
        return { kind: "person", id: hit.object.userData.personId as string };
      }
      return { kind: "hotspot", id: hit.object.userData.hotspot as string };
    }
    // BFIX (r23): a seat he could sit on (while he's free to walk).
    if (this.walkable && this.events.seat) {
      const seat = this.ray.intersectObjects(this.place.seatProxies, false)[0];
      if (seat) {
        const i = seat.object.userData.seat as number;
        const st = this.place.seats[i];
        if (st && !this.seatTaken(st, this.hero))
          return { kind: "seat", index: i };
      }
    }
    const at = this.ray.ray.intersectPlane(this.floorPlane, this.v3);
    if (at) return { kind: "floor", x: at.x, z: at.z };
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.heroSeated || this.still) {
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        ox: this.lookOffset.x,
        oz: this.lookOffset.z,
      };
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    const dragged = this.drag;
    this.drag = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    if (dragged) {
      // A tap, not a drag: put the view back as it was.
      this.lookOffset.x = dragged.ox;
      this.lookOffset.z = dragged.oz;
    }
    // Two clicks close together: run.
    const now = performance.now();
    const run =
      now - this.lastClick.t < 380 &&
      Math.hypot(e.clientX - this.lastClick.x, e.clientY - this.lastClick.y) <
        40;
    this.lastClick = { t: run ? 0 : now, x: e.clientX, y: e.clientY };
    const hit = this.pick(e);
    if (!hit) return;
    if (hit.kind === "hotspot") {
      this.events.hotspot(hit.id, {
        seated:
          (this.heroSeated || this.still) && !this.things.get(hit.id)?.door,
        run,
      });
    } else if (hit.kind === "person") this.events.person(hit.id);
    else if (hit.kind === "seat") this.events.seat?.(hit.index, run);
    else this.events.floor(hit.x, hit.z, run);
  };

  private onMove = (e: PointerEvent) => {
    if (this.drag && this.down) {
      // Seated: drag the view about the room.
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 12) {
        const m = this.camSpan / (this.canvas.clientHeight || 1);
        // Screen right and up, laid on the floor.
        const rx = this.right.x;
        const rz = this.right.z;
        const ux = -this.dir.x;
        const uz = -this.dir.z;
        const ul = Math.hypot(ux, uz) || 1;
        this.lookOffset.x = THREE.MathUtils.clamp(
          this.drag.ox - (dx * rx - (dy * ux) / ul / Math.sin(deg(36))) * m,
          -6,
          6,
        );
        this.lookOffset.z = THREE.MathUtils.clamp(
          this.drag.oz - (dx * rz - (dy * uz) / ul / Math.sin(deg(36))) * m,
          -6,
          6,
        );
      }
      return;
    }
    if (e.pointerType === "touch") return;
    const hit = this.pick(e);
    const id =
      hit?.kind === "hotspot"
        ? hit.id
        : hit?.kind === "person"
          ? `person:${hit.id}`
          : hit?.kind === "seat"
            ? `seat:${hit.index}`
            : null;
    if (id !== this.hovered) {
      const was = this.hovered;
      this.hovered = id;
      if (was?.startsWith("person:")) {
        this.highlight(was.slice(7), false);
      }
      if (id?.startsWith("person:")) this.highlight(id.slice(7), true);
      this.canvas.style.cursor = id
        ? "pointer"
        : this.walkable
          ? "crosshair"
          : "default";
      this.events.hover(id);
    }
  };

  private highlight(id: string, on: boolean): void {
    const p = this.people.get(id) as
      | (Person & { setHighlight?: (b: boolean) => void })
      | undefined;
    p?.setHighlight?.(on);
  }

  private onLeave = () => {
    if (this.hovered) {
      if (this.hovered.startsWith("person:")) {
        this.highlight(this.hovered.slice(7), false);
      }
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

  /**
   * A ring where he's been told to walk. BFIX (r23): running, a double ring,
   * brighter, that beats until he gets there: the cue that he's running.
   */
  private pingMesh: THREE.Mesh | null = null;
  private pingRun: THREE.Mesh | null = null;
  private pingT = 0;
  private pinging: "walk" | "run" = "walk";
  private runMark: THREE.Mesh | null = null;
  private ping(at: THREE.Vector3, run: boolean): void {
    if (!this.pingMesh) {
      const ring = (r0: number, r1: number) => {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(r0, r1, 32),
          new THREE.MeshBasicMaterial({
            color: "#e8b36a",
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        return m;
      };
      this.pingMesh = ring(0.18, 0.24);
      this.pingRun = ring(0.38, 0.44);
      this.pingRun.rotation.x = 0;
      this.pingRun.position.z = 0.001;
      this.pingMesh.add(this.pingRun);
      this.place?.scene.add(this.pingMesh);
      // Running, a warm ring at his feet that beats with his stride.
      this.runMark = ring(0.32, 0.5);
      (this.runMark.material as THREE.MeshBasicMaterial).color.set("#ffd28a");
      this.runMark.visible = false;
      this.place?.scene.add(this.runMark);
    }
    (this.pingMesh.material as THREE.MeshBasicMaterial).color.set(
      run ? "#ffdc96" : "#e8b36a",
    );
    this.pingRun!.visible = run;
    this.pinging = run ? "run" : "walk";
    this.pingMesh.position.set(at.x, 0.02, at.z);
    this.pingT = 1;
  }

  // --- the frame -----------------------------------------------------------

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // r22: a cap on the device's pixel ratio, then whatever share of that
    // the device keeps up with. r24: phones drew at 1 (a third of a modern
    // phone's pixels each way), which with the grain read as static; now
    // 1.5 there and 2 on computers, and the share drops if frames run slow.
    const dpr =
      Math.min(window.devicePixelRatio || 1, this.tier === "high" ? 2 : 1.5) *
      this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
  };

  /** The resolution follows the device's speed, slowly, both ways. */
  private adapt(realDt: number): void {
    this.frameEma += (realDt * 1000 - this.frameEma) * 0.05;
    if (this.frameNo % 30 !== 0 || this.frameNo < 90) return;
    if (this.frameEma > 22 && this.scale > 0.6) {
      this.scale = Math.max(0.6, this.scale * 0.85);
      this.fastFor = 0;
      this.resize();
      if (this.scale <= 0.6) this.post.setPaint(false);
    } else if (this.frameEma < 13 && this.scale < 1) {
      if (++this.fastFor >= 6) {
        this.scale = Math.min(1, this.scale * 1.12);
        this.fastFor = 0;
        this.resize();
      }
    } else this.fastFor = 0;
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update();
    // Screenshot runs on a software renderer speed time up; players never.
    const scale =
      (window as unknown as { __basedTimeScale?: number }).__basedTimeScale ??
      1;
    const realDt = Math.min(0.25, this.timer.getDelta());
    const dt = Math.min(0.05, realDt) * scale;
    this.frameNo++;
    this.time += dt;
    weatherTime.value = this.time;
    if (scale === 1) this.adapt(realDt);
    const place = this.place;
    // The weather.
    this.weather = stepWeather(
      this.weather,
      weatherAt(this.weatherKind, this.time),
      dt,
    );
    weatherRain.value = this.weather.rain;
    weatherGround.value = this.weather.ground;
    for (const [id, p] of this.people) {
      if (!p.root.visible) continue;
      p.update(id === this.hero ? dt * this.heroGait : dt, this.time);
      // r22: caught in the rain, or drying.
      const at = p.root.position;
      const area = place ? this.areaOf(at.x, at.z) : null;
      const out = !!place?.outdoor && area?.inside !== true;
      const was = this.wet.get(id) ?? 0;
      // BPLAY (r22): under an open umbrella, only a little gets through.
      const shelter =
        id === this.hero && this.held?.kind === "umbrella" && p.pose !== "sit"
          ? 0.08
          : 1;
      const now = stepWetness(
        was,
        out ? this.weather.rain * shelter : 0,
        !out,
        dt,
      );
      this.wet.set(id, now);
      if (Math.abs(now - was) > 0 || this.frameNo % 60 === 0) {
        if (Math.floor(now * 50) !== Math.floor(was * 50)) setWetness(p, now);
      }
    }
    this.carryHeld();
    this.tickIdle(dt);
    this.tickSteps(dt);
    this.updateCamera(dt);
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
      this.updatePool(place);
      // Wet stone darkens and shines.
      const g = this.weather.ground;
      if (place.wet.length > 0 && this.frameNo % 10 === 0) {
        for (const w of place.wet) {
          w.mat.color.copy(w.color).multiplyScalar(1 - 0.3 * g);
          w.mat.roughness = w.rough * (1 - 0.55 * g);
        }
      }
      // Fog thickens with the weather, outdoors.
      if (place.outdoor && place.scene.fog) {
        (place.scene.fog as THREE.FogExp2).density =
          place.def.env.fogDensity * (1 + 3 * this.weather.fog);
      }
      this.scanThings(dt);
    }
    this.rain.update(this.time, this.camTarget);
    if (this.pingMesh) {
      const hero = this.people.get(this.hero);
      const running = !!hero?.walking && !!hero.running && hero.root.visible;
      if (this.runMark) {
        this.runMark.visible = running && hero!.speed > 0.5;
        if (this.runMark.visible) {
          const at = hero!.root.position;
          this.runMark.position.set(at.x, 0.025, at.z);
          const k = Math.min(1, hero!.speed / 3);
          const beat = 0.5 + 0.5 * Math.sin(this.time * 14);
          this.runMark.scale.setScalar(0.9 + 0.15 * beat);
          (this.runMark.material as THREE.MeshBasicMaterial).opacity =
            k * (0.22 + 0.18 * beat);
        }
      }
      if (this.pinging === "run" && running) {
        // Running: the double ring beats where he's going.
        this.pingT = 1;
        const beat = 0.5 + 0.5 * Math.sin(this.time * 9);
        this.pingMesh.visible = true;
        this.pingMesh.scale.setScalar(1 + 0.12 * beat);
        (this.pingMesh.material as THREE.MeshBasicMaterial).opacity =
          0.6 + 0.3 * beat;
        (this.pingRun!.material as THREE.MeshBasicMaterial).opacity =
          0.35 + 0.4 * (1 - beat);
      } else {
        this.pingT = Math.max(0, this.pingT - dt * 1.4);
        this.pingMesh.visible = this.pingT > 0;
        this.pingMesh.scale.setScalar(1 + (1 - this.pingT) * 0.8);
        (this.pingMesh.material as THREE.MeshBasicMaterial).opacity =
          this.pingT * 0.8;
        (this.pingRun!.material as THREE.MeshBasicMaterial).opacity =
          this.pingT * 0.6;
      }
    }
    this.fade += (this.fadeTo - this.fade) * (1 - Math.exp(-dt * 7));
    if (this.fadeTo === 0 && this.fade < 0.03) {
      this.fade = 0;
      const w = this.fadeWait;
      this.fadeWait = [];
      for (const r of w) r();
    }
    this.post.setFade(this.fade);
    // Shadows every other frame: half the cost, and nobody moves that fast.
    if (this.frameNo % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    if (place) this.post.render(this.time);
    this.reportThings();
  };

  /** The pooled lamps: the nearest to the camera get the real lights. */
  private updatePool(b: BuiltPlace): void {
    const pool = b.pool;
    if (!pool) return;
    const c = this.camTarget;
    const reach = this.camSpan * 0.9 + 6;
    const scored = pool.lamps
      .map((at) => ({ at, d: Math.hypot(at.x - c.x, at.z - c.z) }))
      .sort((x, y) => x.d - y.d);
    pool.lights.forEach((l, i) => {
      const s = scored[i];
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.copy(s.at).setY(s.at.y - 0.1);
      const w = 1 - THREE.MathUtils.smoothstep(s.d, reach * 0.7, reach);
      l.intensity = pool.base * w;
    });
  }

  private reportThings(): void {
    if (!this.onThings || !this.place) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const out: ThingOnScreen[] = [];
    for (const [id, info] of this.things) {
      if (!this.noticed.has(id)) continue;
      const hs = this.place.def.hotspots[id];
      if (!hs) continue;
      const p = this.hotspotPos(hs, this.v1);
      const proxy = this.place.proxies.get(id);
      proxy?.position.copy(p);
      const v = p.project(this.camera);
      out.push({
        id,
        x: Math.round(((v.x + 1) / 2) * w),
        y: Math.round(((1 - v.y) / 2) * h),
        visible:
          v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05,
        near: this.near.has(id),
        door: info.door,
      });
    }
    // Nothing moved on screen: no need to touch the page.
    const key = out
      .map((t) => `${t.id}:${t.x}:${t.y}:${t.visible ? 1 : 0}${t.near ? 1 : 0}`)
      .join("|");
    if (key === this.reported) return;
    this.reported = key;
    this.onThings(out);
  }

  /** Points on screen, for tests and overlays. */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - v.y) / 2) * this.canvas.clientHeight,
    };
  }

  /** For the harness and the help: what the device is drawing. */
  stats(): {
    calls: number;
    triangles: number;
    programs: number;
    scale: number;
  } {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      programs: this.renderer.info.programs?.length ?? 0,
      scale: this.scale,
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
    for (const b of this.places.values()) this.disposePlace(b);
    this.rain.dispose();
    this.post.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}

/**
 * BFIX (r23): moves `cur` towards `target` as a critically damped spring
 * (`time` about how long it takes to catch up), keeping its velocity in
 * `vel`: smooth to start, smooth to stop, never past.
 */
export function smoothDamp(
  cur: THREE.Vector3,
  target: THREE.Vector3,
  vel: THREE.Vector3,
  time: number,
  dt: number,
): void {
  const omega = 2 / Math.max(1e-4, time);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const k of ["x", "y", "z"] as const) {
    const change = cur[k] - target[k];
    const temp = (vel[k] + omega * change) * dt;
    vel[k] = (vel[k] - omega * temp) * e;
    cur[k] = target[k] + (change + temp) * e;
  }
}

/**
 * BPLAY (r22): a prop for his right hand. BFIX (r23): its grip (where the
 * fist closes) is its origin, and it runs down its -y from there: a baton,
 * a furled umbrella; the umbrella's "open" part runs up its +y, shaft and
 * canopy over his head. The umbrella has two states, "open" and "shut".
 */
function heldProp(kind: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `held:${kind}`;
  const black = new THREE.MeshStandardMaterial({
    color: "#0d0e10",
    roughness: 0.45,
  });
  const cast = (m: THREE.Mesh) => {
    m.castShadow = true;
    return m;
  };
  if (kind === "umbrella") {
    const open = new THREE.Group();
    open.name = "open";
    const shaft = cast(
      new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.95, 6), black),
    );
    shaft.position.y = 0.4;
    const handle = cast(
      new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8), black),
    );
    const canopy = cast(
      new THREE.Mesh(
        new THREE.ConeGeometry(0.62, 0.26, 10, 1, true),
        new THREE.MeshStandardMaterial({
          color: "#0b0c0e",
          roughness: 0.3,
          side: THREE.DoubleSide,
        }),
      ),
    );
    canopy.position.y = 0.86;
    open.add(shaft, handle, canopy);
    const shut = new THREE.Group();
    shut.name = "shut";
    // A crook handle in the fist, the furled length below it.
    const crook = cast(
      new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI),
        black,
      ),
    );
    crook.position.set(0.035, 0.0, 0);
    crook.rotation.z = Math.PI;
    const furled = cast(
      new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.008, 0.72, 8), black),
    );
    furled.position.y = -0.36;
    shut.add(crook, furled);
    g.add(open, shut);
  } else if (kind === "baton") {
    // The grip in the fist, the shaft out past the thumb.
    const grip = cast(
      new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.12, 8), black),
    );
    grip.position.y = 0.02;
    const shaft = cast(
      new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 0.26, 8), black),
    );
    shaft.position.y = -0.17;
    g.add(grip, shaft);
  } else if (kind === "book_open") {
    // r25: a book held open to read: two pale pages in a dark cover.
    const cover = new THREE.MeshStandardMaterial({
      color: "#3a2a22",
      roughness: 0.7,
    });
    const page = new THREE.MeshStandardMaterial({
      color: "#d8d0bc",
      roughness: 0.85,
    });
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.006), cover);
      c.position.set(s * 0.05, -0.04, 0.03);
      c.rotation.y = s * 0.35;
      const pg = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.14, 0.01), page);
      pg.position.set(s * 0.048, -0.04, 0.037);
      pg.rotation.y = s * 0.35;
      g.add(c, pg);
    }
  } else {
    // Something small in his hand: a dark shape the size of a paperback.
    const m = cast(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.14, 0.03),
        new THREE.MeshStandardMaterial({ color: "#2a2826", roughness: 0.7 }),
      ),
    );
    m.position.set(0, -0.05, 0.02);
    g.add(m);
  }
  return g;
}
