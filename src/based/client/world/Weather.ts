// Rain for Mr. Based's Paris (r21): streaks that fall around wherever the
// camera is looking (and glint gold near the street lamps), splashes on the
// pavement, rain running down the windows, and the soft cones under lamps.
// All animated on the GPU from one time uniform; nothing per drop on the CPU.
//
// r22: the weather comes and goes (engine/Weather.ts says how hard it
// rains and how wet the ground is): puddles that spread while it rains and
// ring with drops, drips off the awnings, and rain on the windows that
// follows the rain outside.

import * as THREE from "three";

const MAX_DRY = 4;
const MAX_LAMPS = 8;

export class Rain {
  readonly group = new THREE.Group();
  private readonly streaks: THREE.LineSegments;
  private readonly splashes: THREE.InstancedMesh;
  private readonly uniforms: {
    time: { value: number };
    center: { value: THREE.Vector3 };
    box: { value: THREE.Vector3 };
    dry: { value: THREE.Vector4[] };
    dryCount: { value: number };
    lamps: { value: THREE.Vector4[] };
    lampCount: { value: number };
    wind: { value: THREE.Vector2 };
    strength: { value: number };
  };

  constructor(count: number) {
    this.uniforms = {
      time: { value: 0 },
      center: { value: new THREE.Vector3() },
      box: { value: new THREE.Vector3(26, 14, 26) },
      dry: {
        value: Array.from({ length: MAX_DRY }, () => new THREE.Vector4()),
      },
      dryCount: { value: 0 },
      lamps: {
        value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()),
      },
      lampCount: { value: 0 },
      wind: { value: new THREE.Vector2(0.9, 0.35) },
      strength: { value: 1 },
    };

    // Streaks: two vertices each, top and bottom, placed by the shader.
    const seeds = new Float32Array(count * 2 * 4);
    for (let i = 0; i < count; i++) {
      const a = Math.random();
      const b = Math.random();
      const c = Math.random();
      const d = 0.6 + Math.random() * 0.8;
      for (let e = 0; e < 2; e++) {
        seeds.set([a, b, c, e === 0 ? d : -d], (i * 2 + e) * 4);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3),
    );
    geo.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float time;
        uniform vec3 center;
        uniform vec3 box;
        uniform vec4 dry[${MAX_DRY}];
        uniform int dryCount;
        uniform vec4 lamps[${MAX_LAMPS}];
        uniform int lampCount;
        uniform vec2 wind;
        varying float vAlpha;
        varying vec3 vTint;
        void main() {
          float speed = 9.0 + seed.z * 4.0;
          float y = mod(seed.y * box.y - time * speed, box.y);
          vec3 p = vec3(center.x + (seed.x - 0.5) * box.x, y,
                        center.z + (fract(seed.x * 37.0 + seed.z * 11.0) - 0.5) * box.z);
          // Wrap round the camera so the rain never runs out at the edges.
          p.x = center.x + mod(p.x - center.x + box.x * 0.5, box.x) - box.x * 0.5;
          p.z = center.z + mod(p.z - center.z + box.z * 0.5, box.z) - box.z * 0.5;
          float len = 0.38 * abs(seed.w);
          if (seed.w < 0.0) { p.y -= len; p.xz -= wind * len * 0.12; }
          vAlpha = 0.16 + 0.12 * seed.z;
          for (int i = 0; i < ${MAX_DRY}; i++) {
            if (i >= dryCount) break;
            vec4 r = dry[i];
            if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w) vAlpha = 0.0;
          }
          vTint = vec3(0.55, 0.62, 0.75);
          for (int i = 0; i < ${MAX_LAMPS}; i++) {
            if (i >= lampCount) break;
            float d = distance(p, lamps[i].xyz);
            float k = lamps[i].w * smoothstep(5.0, 0.0, d);
            vTint += vec3(1.6, 1.0, 0.45) * k;
            vAlpha += 0.35 * k * step(0.001, vAlpha);
          }
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float strength;
        varying float vAlpha;
        varying vec3 vTint;
        void main() { gl_FragColor = vec4(vTint * vAlpha * strength, vAlpha * strength); }`,
    });
    this.streaks = new THREE.LineSegments(geo, mat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 5;
    this.group.add(this.streaks);

    // Splashes: little rings on the ground that open and fade.
    const ring = new THREE.RingGeometry(0.5, 0.62, 16);
    ring.rotateX(-Math.PI / 2);
    const n = Math.round(count / 6);
    const splashSeed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      splashSeed.set([Math.random(), Math.random(), Math.random()], i * 3);
    }
    ring.setAttribute(
      "splash",
      new THREE.InstancedBufferAttribute(splashSeed, 3),
    );
    const smat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 splash;
        uniform float time;
        uniform vec3 center;
        uniform vec3 box;
        uniform vec4 dry[${MAX_DRY}];
        uniform int dryCount;
        varying float vAlpha;
        void main() {
          float cycle = 0.55 + splash.z * 0.4;
          float t = fract(time / cycle + splash.z * 7.0);
          float n = floor(time / cycle + splash.z * 7.0);
          vec2 at = vec2(fract(splash.x + n * 0.618), fract(splash.y + n * 0.382));
          vec3 p = vec3(center.x + (at.x - 0.5) * box.x * 0.8, 0.012,
                        center.z + (at.y - 0.5) * box.z * 0.8);
          vAlpha = (1.0 - t) * 0.22;
          for (int i = 0; i < ${MAX_DRY}; i++) {
            if (i >= dryCount) break;
            vec4 r = dry[i];
            if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w) vAlpha = 0.0;
          }
          vec3 local = position * (0.04 + t * 0.12);
          gl_Position = projectionMatrix * viewMatrix * vec4(p + local, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() { gl_FragColor = vec4(vec3(0.75, 0.8, 0.9) * vAlpha, vAlpha); }`,
    });
    this.splashes = new THREE.InstancedMesh(ring, smat, n);
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 4;
    this.group.add(this.splashes);
  }

  /** Where it's dry (interiors), as [x0, z0, x1, z1] rectangles. */
  setDry(rects: [number, number, number, number][]): void {
    const u = this.uniforms;
    u.dryCount.value = Math.min(MAX_DRY, rects.length);
    rects.slice(0, MAX_DRY).forEach((r, i) => {
      u.dry.value[i].set(r[0], r[1], r[2], r[3]);
    });
  }

  /** Lamps the rain glints near: position and strength. */
  setLamps(lamps: { at: THREE.Vector3; k: number }[]): void {
    const u = this.uniforms;
    u.lampCount.value = Math.min(MAX_LAMPS, lamps.length);
    lamps.slice(0, MAX_LAMPS).forEach((l, i) => {
      u.lamps.value[i].set(l.at.x, l.at.y, l.at.z, l.k);
    });
  }

  /** 0 to 1: how much of the rain shows (less over a room he's in). */
  setStrength(k: number): void {
    this.uniforms.strength.value = k;
  }

  update(time: number, center: THREE.Vector3): void {
    this.uniforms.time.value = time;
    this.uniforms.center.value.copy(center);
  }

  dispose(): void {
    this.streaks.geometry.dispose();
    (this.streaks.material as THREE.Material).dispose();
    this.splashes.geometry.dispose();
    (this.splashes.material as THREE.Material).dispose();
  }
}

/** Shared clock for the window and cone shaders. */
export const weatherTime = { value: 0 };
/** r22: how hard it's raining (0 to 1) and how wet the ground is. */
export const weatherRain = { value: 1 };
export const weatherGround = { value: 1 };

/**
 * Glass with rain on it: a tint, a glow behind (warm from inside a bar,
 * cold from a street), beads of water and drops running down.
 */
export function rainGlass(opts: {
  glow: string;
  strength: number;
  opacity?: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: weatherTime,
      rain: weatherRain,
      glow: { value: new THREE.Color(opts.glow) },
      strength: { value: opts.strength },
      opacity: { value: opts.opacity ?? 0.82 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    clipping: true,
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform float time;
      uniform float rain;
      uniform vec3 glow;
      uniform float strength;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        #include <clipping_planes_fragment>
        vec2 p = vec2(vWorld.x + vWorld.z, vWorld.y) * 6.0;
        // Beads: one in some cells.
        vec2 cell = floor(p);
        vec2 f = fract(p) - 0.5;
        float h = hash(cell);
        float bead = smoothstep(0.18, 0.05, length(f - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5)) * step(0.55, h);
        // Runs: a few columns with a drop sliding down and a wet trail.
        float col = floor(p.x * 0.7);
        float speed = 0.25 + hash(vec2(col, 1.0)) * 0.6;
        float y = fract(p.y * 0.08 + time * speed * 0.1 + hash(vec2(col, 2.0)));
        float lane = smoothstep(0.08, 0.0, abs(fract(p.x * 0.7) - 0.5));
        float drop = lane * smoothstep(0.03, 0.0, abs(y - 0.5)) * step(0.5, hash(vec2(col, 3.0)));
        float trail = lane * smoothstep(0.5, 0.0, y - 0.5) * step(0.5, y) * step(0.5, hash(vec2(col, 3.0))) * 0.25;
        float g = (0.55 + 0.45 * vUv.y) * strength;
        vec3 c = glow * g;
        // r22: the beads stay a while after the rain; the runs need rain.
        c += vec3(0.9, 0.95, 1.0) * (bead * 0.35 * (0.3 + 0.7 * rain) + (drop * 0.6 + trail * 0.2) * rain) * (0.3 + strength);
        gl_FragColor = vec4(c, opacity);
      }`,
  });
}

/** A soft cone of light under a lamp, brightest at the top. */
export function lightCone(
  color: string,
  strength: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      strength: { value: strength },
      time: weatherTime,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vH = uv.y;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      varying float vH;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float edge = pow(abs(dot(vN, vView)), 1.6);
        float a = strength * vH * vH * edge * 0.22;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
}

/**
 * r22: a puddle. Its edge is uneven and it spreads with the wet of the
 * ground; while it rains, drops ring it. Dark, with the sky's glow and the
 * lamps' streaks (drawn over it) for a reflection: no second render.
 */
export function puddleMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: weatherTime,
      rain: weatherRain,
      ground: weatherGround,
      seed: { value: seed },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float rain;
      uniform float ground;
      uniform float seed;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float a = atan(p.y, p.x);
        float edge = 0.82 + 0.1 * sin(a * 3.0 + seed) + 0.06 * sin(a * 7.0 + seed * 2.3);
        float r = length(p) / (edge * (0.25 + 0.75 * ground));
        if (r > 1.0) discard;
        float rim = smoothstep(1.0, 0.75, r);
        // Rings where drops land: a few cells, each a ring that opens.
        vec2 q = vUv * 5.0;
        vec2 cell = floor(q);
        vec2 f = fract(q) - 0.5;
        float h = hash(cell);
        float t = fract(time * (0.8 + h) + h * 7.0);
        float d = length(f - (vec2(hash(cell + 1.3), hash(cell + 4.1)) - 0.5) * 0.5);
        float ring = smoothstep(0.03, 0.0, abs(d - t * 0.45)) * (1.0 - t) * rain;
        vec3 sky = mix(vec3(0.015, 0.02, 0.035), vec3(0.06, 0.07, 0.1), vUv.y);
        vec3 c = sky + vec3(0.5, 0.55, 0.65) * ring * 0.5;
        gl_FragColor = vec4(c, 0.88 * rim);
      }`,
  });
}

/**
 * r22: rain running off the edges of things (awnings): drops falling from
 * each edge to the ground, more of them the harder it rains.
 */
export class Drips {
  readonly lines: THREE.LineSegments;

  constructor(edges: [THREE.Vector3, THREE.Vector3][], perMetre = 7) {
    const seeds: number[] = [];
    const pos: number[] = [];
    let k = 1;
    const r = () => (k = (k * 16807) % 2147483647) / 2147483647;
    for (const [a, b] of edges) {
      const n = Math.max(1, Math.round(a.distanceTo(b) * perMetre));
      for (let i = 0; i < n; i++) {
        const t = (i + r()) / n;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const z = a.z + (b.z - a.z) * t;
        const s = r();
        for (let e = 0; e < 2; e++) {
          pos.push(x, y, z);
          seeds.push(s, e);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("drip", new THREE.Float32BufferAttribute(seeds, 2));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: weatherTime, rain: weatherRain },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec2 drip;
        uniform float time;
        uniform float rain;
        varying float vA;
        void main() {
          float t = fract(time * (1.1 + drip.x) + drip.x * 13.0);
          vec3 p = position;
          float fall = t * t * position.y;
          p.y = max(0.0, position.y - fall - drip.y * 0.09);
          // Fewer drops in a drizzle.
          vA = step(drip.x, rain) * (0.22 + 0.2 * drip.x) * (1.0 - t * 0.6);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.7, 0.75, 0.85) * vA, vA); }`,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
