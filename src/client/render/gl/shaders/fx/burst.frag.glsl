#version 300 es
precision highp float;

// FX (r28): a Derp Store pack's layered burst, top-down.
//   flash    — a white-hot pulse that lights the ground around it, briefly;
//   fireball — expands fast, churns, and cools through the pack's colours,
//              then rolls over into smoke;
//   ring     — a crisp shockwave front with a dark refraction line behind
//              it and a faint wake;
//   residue  — the pack's own afterglow, drifting and fading over seconds:
//              solar flare loops, toxic haze, frost mist, a sprinkle glow,
//              a swirling nebula, or turning sun rays.
// Output is premultiplied: emitted light adds (alpha 0), smoke covers
// (alpha > 0). Blend ONE, ONE_MINUS_SRC_ALPHA.

uniform float uTime;
uniform vec3 uLook[LOOK_SIZE]; // 12 colours per pack (burstLookTable)
uniform float uPxPerTile;   // device pixels per tile (anti-aliasing)

in vec2 vLocal;
flat in vec4 vBurst;   // x, y, start, pack
flat in vec4 vSize;    // ring R, fireball R, flash R, flags
flat in vec4 vTimes;   // flash, fireball, ring, residue seconds
flat in vec4 vKinds;   // seed, debris kind, residue kind
flat in float vAge;

out vec4 fragColor;

const float TAU = 6.28318530718;

int base;
vec3 look(int i) { return uLook[base + i]; }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.5 * vnoise(p);
  s += 0.25 * vnoise(p * 2.03 + 17.1);
  s += 0.125 * vnoise(p * 4.01 + 31.7);
  return s / 0.875;
}

// The fireball ramp, hot (0) to cool (1).
vec3 fireRamp(float k) {
  k = clamp(k, 0.0, 1.0) * 3.0;
  if (k < 1.0) return mix(look(1), look(2), k);
  if (k < 2.0) return mix(look(2), look(3), k - 1.0);
  return mix(look(3), look(4), k - 2.0);
}

vec3 residueCol(float k) {
  k = fract(k) * 3.0;
  if (k < 1.0) return mix(look(9), look(10), k);
  if (k < 2.0) return mix(look(10), look(11), k - 1.0);
  return mix(look(11), look(9), k - 2.0);
}

void main() {
  base = (int(vBurst.w + 0.5) - 1) * 12;
  float t = vAge;
  vec2 p = vLocal;
  float d = length(p);
  float seed = vKinds.x;
  float flags = vSize.w;
  bool domeStop = mod(flags, 2.0) > 0.5;
  bool residueOn = mod(floor(flags / 2.0), 2.0) > 0.5;
  float ringR = vSize.x;
  float fireR = vSize.y;
  float flashR = vSize.z;
  float aa = 1.0 / max(uPxPerTile, 0.05); // one device pixel, in tiles

  vec3 emit = vec3(0.0);
  float smokeA = 0.0;
  vec3 smokeC = vec3(0.0);

  // ---- residue: the pack's afterglow (under the fireball) ----
  float resT = vTimes.w;
  if (residueOn && t < resT && t > 0.15) {
    float fadeIn = smoothstep(0.15, 0.9, t);
    float fadeOut = 1.0 - smoothstep(resT * 0.55, resT, t);
    float life = fadeIn * fadeOut;
    float Rr = fireR * (1.5 + 0.9 * t / resT);
    vec2 drift = vec2(0.9, -0.35) * t * fireR * 0.06;
    vec2 q = (p - drift) / Rr;
    float dq = length(q);
    float kind = vKinds.z;
    if (dq < 1.6 && life > 0.0) {
      float body = 1.0 - smoothstep(0.35, 1.25, dq);
      if (kind < 0.5) {
        // flare: arches of solar plasma springing off the fireball's limb
        // while it burns, then a heat shimmer over the scorched ground.
        float ang = atan(p.y, p.x);
        float fT = vTimes.y;
        float limb = fireR * (0.3 + 0.7 * (1.0 - exp(-t * 4.5))) * 0.82;
        float rr = d / limb;
        float arcLife = smoothstep(0.1, 0.5, t) * (1.0 - smoothstep(fT * 0.55, fT * 1.05, t));
        if (rr < 1.9 && arcLife > 0.0) {
          for (int k = 0; k < 6; k++) {
            float fk = float(k);
            float c = (fk + hash12(vec2(seed, fk)) * 0.8) * TAU / 6.0 + t * 0.15;
            float w = 0.16 + 0.14 * hash12(vec2(fk, seed + 3.0));
            float sa = mod(ang - c + 3.14159265, TAU) - 3.14159265;
            if (abs(sa) < w) {
              float s = sa / w * 0.5 + 0.5;
              float h = sin(3.14159265 * s);
              float grow = smoothstep(0.1, 0.8, t) * (0.25 + 0.4 * hash12(vec2(fk, seed)));
              float wob = (vnoise(vec2(s * 6.0 + fk * 9.0, t * 2.0)) - 0.5) * 0.08;
              float loopR = 1.0 + h * grow + wob;
              float lw = 0.03 + 0.04 * h + aa / limb;
              float dl = abs(rr - loopR);
              float line = 1.0 - smoothstep(0.0, lw, dl);
              float glow = exp(-dl / (lw * 2.5)) * 0.4;
              emit += mix(look(10), look(9), h) * (line + glow) * arcLife * 1.6;
            }
          }
          // The corona: a ragged glow hugging the limb.
          float cor = exp(-max(rr - 1.0, 0.0) * 5.0) * smoothstep(0.85, 1.0, rr) *
                      (0.6 + 0.4 * vnoise(vec2(ang * 5.0, t * 3.0)));
          emit += look(10) * cor * arcLife * 0.7;
        }
        float n = fbm(q * 4.0 + vec2(t * 0.6, -t * 0.4) + seed);
        float shimmer = smoothstep(0.55, 0.8, fbm(q * 7.0 - vec2(0.0, t * 1.2) + n));
        emit += look(10) * body * body * shimmer * 0.14 * life;
        emit += look(11) * body * body * 0.14 * life;
      } else if (kind < 1.5) {
        // haze: thick green fumes that churn, with bubbles welling up and
        // popping in them.
        float n = fbm(q * 2.6 + vec2(t * 0.25, -t * 0.4) + seed);
        float den = body * smoothstep(0.25, 0.75, n) * life;
        smokeA += den * 0.55;
        smokeC += mix(look(11), look(10), n) * den * 0.55;
        emit += look(9) * den * 0.22;
        vec2 cell = floor(p / 7.0);
        vec2 cp = fract(p / 7.0) - 0.5;
        float h = hash12(cell + seed);
        float ph = fract(t * (0.5 + h * 0.6) + h * 7.0);
        float br = ph * 0.42;
        float ring = 1.0 - smoothstep(0.0, 0.05 + aa / 7.0, abs(length(cp - (vec2(h, fract(h * 13.0)) - 0.5) * 0.15) - br));
        emit += look(9) * ring * step(0.55, h) * body * life * (1.0 - ph) * 0.9;
      } else if (kind < 2.5) {
        // mist: a cold white fog rolling outward, glinting with crystals.
        float n = fbm(q * 2.0 + vec2(-t * 0.18, t * 0.12) + seed);
        float den = body * smoothstep(0.3, 0.8, n) * life;
        smokeA += den * 0.45;
        smokeC += mix(look(10), look(9), n) * den * 0.45;
        vec2 cell = floor(p / 4.0);
        vec2 cp = fract(p / 4.0) - 0.5;
        float h = hash12(cell + seed * 1.3);
        float tw = pow(max(0.0, sin(t * (2.0 + 3.0 * h) + h * 40.0)), 12.0);
        float star = max(exp(-abs(cp.x) * 30.0) * exp(-abs(cp.y) * 6.0),
                         exp(-abs(cp.y) * 30.0) * exp(-abs(cp.x) * 6.0));
        emit += vec3(1.0) * star * tw * step(0.7, h) * body * life * 1.3;
      } else if (kind < 3.5) {
        // sprinkles: a sugary pastel glow (the sprinkles themselves are
        // particles) with candy-stripe shimmer.
        float ang = atan(q.y, q.x);
        float stripe = 0.5 + 0.5 * sin(ang * 7.0 + dq * 9.0 - t * 2.0);
        emit += residueCol(stripe * 0.66 + t * 0.1) * body * body * 0.20 * life;
      } else if (kind < 4.5) {
        // nebula: colour swirling round the blast like a galaxy, with
        // pinprick stars twinkling in it.
        float ang = atan(q.y, q.x) - t * 0.45 - (1.0 - min(dq, 1.0)) * 2.2;
        vec2 sw = vec2(cos(ang), sin(ang)) * dq;
        float n = fbm(sw * 2.4 + seed);
        float n2 = fbm(sw * 4.5 - seed + 9.0);
        float den = body * smoothstep(0.3, 0.85, n) * life;
        emit += residueCol(n2 * 1.3 + n * 0.5) * den * 0.85;
        smokeA += den * 0.25;
        smokeC += look(4) * den * 0.25;
        vec2 cell = floor(p / 3.0);
        vec2 cp = fract(p / 3.0) - 0.5;
        float h = hash12(cell + seed * 0.7);
        float tw = 0.5 + 0.5 * sin(t * (3.0 + 4.0 * h) + h * 50.0);
        emit += vec3(1.0) * (1.0 - smoothstep(0.0, 0.18, length(cp))) * step(0.82, h) * tw * body * life * 1.4;
      } else {
        // rays: sun rays turning slowly round the blast, warm and bright.
        float ang = atan(p.y, p.x);
        float r1 = pow(0.5 + 0.5 * sin(ang * 9.0 + t * 0.35 + seed), 10.0);
        float r2 = pow(0.5 + 0.5 * sin(ang * 14.0 - t * 0.22 + seed * 2.0), 14.0);
        float fall = exp(-dq * 1.6) * smoothstep(0.0, 0.25, dq) *
                     (1.0 - smoothstep(0.75, 1.25, dq));
        emit += mix(look(10), look(9), r2) * (r1 * 0.9 + r2 * 0.6) * fall * life * 0.9;
        emit += look(11) * body * body * 0.16 * life;
      }
    }
  }

  // ---- fireball: expands, churns and cools, then rolls into smoke ----
  float fireT = vTimes.y;
  if (t < fireT && d < fireR * 1.9) {
    float k = t / fireT;
    float R = fireR * (0.3 + 0.7 * (1.0 - exp(-t * 4.5))) * (1.0 + 0.18 * k);
    vec2 q = p / R;
    float dq = length(q);
    float ang = atan(q.y, q.x);
    float n = fbm(q * 2.2 + vec2(seed, -seed) + vec2(t * 0.7, t * 0.45));
    float lobes = 0.08 * sin(ang * 5.0 + seed * 3.0 + t * 0.8);
    float edge = dq + (n - 0.5) * 0.6 + lobes;
    float den = 1.0 - smoothstep(0.62, 1.0, edge);
    if (den > 0.0) {
      float heat = (1.0 - k) * (1.15 - 0.75 * dq) + (n - 0.5) * 0.35;
      vec3 c = fireRamp(1.0 - heat);
      // A body of coloured cloud (so the pack's colours hold over bright
      // ground) that glows from within while it's hot.
      float body = den * (0.5 + 0.3 * (1.0 - k)) * (1.0 - smoothstep(0.7, 1.0, k));
      smokeA += body * (1.0 - smokeA);
      smokeC += fireRamp(1.0 - heat * 0.8 + 0.15) * body;
      float glow = den * pow(1.0 - k, 1.5) * (0.6 + 0.8 * (1.0 - dq));
      emit += c * glow * 0.95;
      // As it cools the fireball turns to a dark, pack-tinted smoke.
      float smoke = den * smoothstep(0.2, 0.65, k) * (1.0 - smoothstep(0.75, 1.0, k));
      float sa = smoke * 0.55 * (0.6 + 0.4 * n);
      smokeA += sa * (1.0 - smokeA);
      smokeC += mix(vec3(0.16), look(4) * 0.6, 0.55) * sa;
    }
  }

  // ---- flash: the white-hot pulse and the light it throws ----
  float flashT = vTimes.x;
  if (t < flashT && d < flashR) {
    float u = t / flashT;
    float pulse = pow(1.0 - u, 2.2) * smoothstep(0.0, 0.04, t + 0.02);
    float x = d / flashR;
    float light = exp(-x * x * 5.0) * 0.8;
    // A soft four-point glint across the core, like a lens catching it.
    float glint = exp(-abs(p.x) / (fireR * 0.07)) * exp(-abs(p.y) / (flashR * 0.2)) +
                  exp(-abs(p.y) / (fireR * 0.07)) * exp(-abs(p.x) / (flashR * 0.2));
    float core = exp(-pow(d / max(fireR * 0.7, 1.0), 2.0));
    // White-hot at the core; the light it throws takes the pack's colour.
    vec3 tint = mix(look(0), look(3), 0.55);
    emit += (tint * light * (1.0 - core) + mix(look(0), vec3(1.0), 0.3) * core * 1.6 +
             look(0) * glint * 0.5) * pulse;
  }

  // ---- shockwave ring ----
  float ringT = vTimes.z;
  if (t < ringT) {
    float u = t / ringT;
    float r = ringR * (1.0 - pow(1.0 - u, 2.4));
    float w = max(ringR * 0.022 + 0.6, aa * 1.5);
    float x = (d - r) / w;
    float fade = pow(1.0 - u, 1.3);
    if (x > -14.0 && x < 2.0) {
      float band = 1.0 - smoothstep(0.0, 1.0, abs(x));
      float wake = x < 0.0 ? exp(x * 0.35) * 0.22 : 0.0;
      vec3 rc = look(5);
      emit += rc * band * fade * 1.05 + vec3(1.0) * band * band * band * fade * 0.3 +
              rc * wake * fade * 0.45;
      // A dark line just behind the front: the air bending the light.
      float refr = exp(-pow(x + 1.9, 2.0) * 1.5) * 0.28 * fade;
      if (domeStop) refr *= 0.4;
      smokeA += refr * (1.0 - smokeA);
    }
  }

  float a = clamp(smokeA, 0.0, 0.9);
  vec3 rgb = smokeC + emit;
  if (a < 0.002 && dot(emit, vec3(1.0)) < 0.004) discard;
  fragColor = vec4(rgb, a);
}
