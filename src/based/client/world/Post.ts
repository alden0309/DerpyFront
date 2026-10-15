// The look of Mr. Based's places (r21): bloom on the lamps, filmic tone
// mapping, then a noir grade (cold shadows, amber highlights), a vignette,
// grain, and on devices that can afford it a Kuwahara filter that turns the
// render into something closer to brushwork.
//
// r22: each place is its own scene now, so the render pass is pointed at
// whichever place he's in. The multisampled buffer is optional (a phone
// gets none: the grade and grain hide the edges), and bloom too.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const NoirShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    paint: { value: 0 },
    grain: { value: 0.015 },
    vignette: { value: 0.9 },
    fade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float paint;
    uniform float grain;
    uniform float vignette;
    uniform float fade;
    varying vec2 vUv;

    // Kuwahara: of four squares around the pixel, take the mean of the
    // calmest. Flat patches with crisp edges, like strokes of paint.
    vec3 kuwahara(vec2 uv) {
      vec2 px = 1.0 / resolution;
      vec3 m[4];
      vec3 s[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
      const int R = 2;
      for (int j = -R; j <= 0; j++) {
        for (int i = -R; i <= 0; i++) {
          vec3 c;
          c = texture2D(tDiffuse, uv + vec2(float(i), float(j)) * px).rgb; m[0] += c; s[0] += c * c;
          c = texture2D(tDiffuse, uv + vec2(float(-i), float(j)) * px).rgb; m[1] += c; s[1] += c * c;
          c = texture2D(tDiffuse, uv + vec2(float(i), float(-j)) * px).rgb; m[2] += c; s[2] += c * c;
          c = texture2D(tDiffuse, uv + vec2(float(-i), float(-j)) * px).rgb; m[3] += c; s[3] += c * c;
        }
      }
      float n = float((R + 1) * (R + 1));
      float best = 1e9;
      vec3 outc = vec3(0.0);
      for (int k = 0; k < 4; k++) {
        vec3 mean = m[k] / n;
        vec3 v = abs(s[k] / n - mean * mean);
        float sig = v.r + v.g + v.b;
        if (sig < best) { best = sig; outc = mean; }
      }
      return outc;
    }

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (paint > 0.0) c = mix(c, kuwahara(vUv), paint);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // Cold shadows, warm highlights.
      vec3 shadow = vec3(0.035, 0.06, 0.085);
      c = c + shadow * (1.0 - smoothstep(0.0, 0.45, l));
      c = mix(c, c * vec3(1.06, 0.97, 0.84), smoothstep(0.35, 1.0, l));
      // A little less colour in the middle of things.
      c = mix(vec3(l), c, 0.86);
      // Vignette.
      vec2 d = vUv - 0.5;
      d.x *= resolution.x / resolution.y;
      c *= 1.0 - vignette * smoothstep(0.35, 1.25, length(d));
      // Grain: a faint, still tooth to the image (r24: it used to change
      // every frame, which read as television static, worst on phones).
      float g = hash(floor(vUv * resolution)) - 0.5;
      c += g * grain * (1.0 - l * 0.5);
      gl_FragColor = vec4(c * fade, 1.0);
    }`,
};

export interface PostOptions {
  bloom: boolean;
  paint: boolean;
  /** Multisampling of the scene's buffer (0 for none). */
  samples: number;
}

export class Post {
  readonly composer: EffectComposer;
  private readonly pass: RenderPass;
  private readonly noir: ShaderPass;
  private readonly bloom: UnrealBloomPass | null;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    opts: PostOptions,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: renderer.capabilities.isWebGL2 ? opts.samples : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.pass = new RenderPass(scene, camera);
    this.composer.addPass(this.pass);
    if (opts.bloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(size.x / 2, size.y / 2),
        0.55,
        0.6,
        0.82,
      );
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.composer.addPass(new OutputPass());
    this.noir = new ShaderPass(NoirShader);
    this.noir.uniforms.paint.value = opts.paint ? 0.75 : 0;
    this.composer.addPass(this.noir);
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.noir.uniforms.resolution.value.set(w * pixelRatio, h * pixelRatio);
    this.bloom?.resolution.set((w * pixelRatio) / 2, (h * pixelRatio) / 2);
  }

  /** r22: the place to draw (each place is its own scene). */
  setScene(scene: THREE.Scene): void {
    this.pass.scene = scene;
  }

  /** r24: how much grain (0 for none). */
  setGrain(k: number): void {
    this.noir.uniforms.grain.value = k;
  }

  setPaint(on: boolean): void {
    this.noir.uniforms.paint.value = on ? 0.75 : 0;
  }

  /** 0 (black) to 1, for fades between places. */
  setFade(v: number): void {
    this.noir.uniforms.fade.value = v;
  }

  render(time: number): void {
    this.noir.uniforms.time.value = time;
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
