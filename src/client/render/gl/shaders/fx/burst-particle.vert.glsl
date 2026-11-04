#version 300 es
precision highp float;

// FX (r28): Derp Store burst particles — debris thrown out with drag and
// gravity, and the pack's residue drifting after. One instance per particle,
// written once when the burst spawns; the motion is a closed-form function of
// age, so nothing is updated per frame. Top-down: height lifts a particle up
// the screen (and gravity brings it back down).

layout(location = 0) in vec2 aPos;  // unit quad 0..1
layout(location = 1) in vec4 aP0;   // x, y, start (s), pack index
layout(location = 2) in vec4 aP1;   // vx, vy (tiles/s), vz (tiles/s up), life (s)
layout(location = 3) in vec4 aP2;   // size (tiles), seed 0..1, kind, colour slot
layout(location = 4) in vec4 aP3;   // drag (1/s), gravity (tiles/s²), spin (rad/s), delay (s)

uniform mat3 uCamera;
uniform float uTime;
uniform float uPxPerTile;
uniform vec3 uLook[LOOK_SIZE];

out vec2 vUV;
flat out float vKind;
flat out vec3 vColor;
out float vFade;
out float vFlip;
out float vGlint;

const float HEIGHT_TO_SCREEN = 0.8;

void main() {
  float t = uTime - aP0.z - aP3.w;
  float life = aP1.w;
  float kind = aP2.z;
  if (t < 0.0 || t > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = t / life;
  float drag = max(aP3.x, 0.001);
  float travel = (1.0 - exp(-drag * t)) / drag;
  vec2 pos = aP0.xy + vec2(0.5) + aP1.xy * travel;
  vec2 vel = aP1.xy * exp(-drag * t);
  float g = aP3.y;
  float z;
  float vz;
  if (kind >= 10.0) {
    // Residue drifts: a slow rise (negative gravity) with a little sway.
    z = aP1.z * t;
    vz = aP1.z;
    pos.x += sin(t * 1.7 + aP2.y * 20.0) * aP2.x * 0.6;
  } else {
    z = max(0.0, aP1.z * t - 0.5 * g * t * t);
    vz = z > 0.0 ? aP1.z - g * t : 0.0;
  }
  // Stars and nebula motes swirl round the blast centre.
  if (abs(kind - 4.0) < 0.5 || abs(kind - 14.0) < 0.5) {
    float a = aP3.z * t * (kind > 10.0 ? 0.35 : 1.0) / (1.0 + length(pos - aP0.xy) * 0.02);
    vec2 rel = pos - aP0.xy - vec2(0.5);
    pos = aP0.xy + vec2(0.5) + mat2(cos(a), sin(a), -sin(a), cos(a)) * rel;
  }
  vec2 screenVel = vec2(vel.x, vel.y - vz * HEIGHT_TO_SCREEN);
  pos.y -= z * HEIGHT_TO_SCREEN;

  // Size: never below ~1.6 device pixels, so far-out views still sparkle.
  float size = max(aP2.x, 1.6 / max(uPxPerTile, 0.05));
  vec2 axisX;
  vec2 axisY;
  vec2 corner = aPos * 2.0 - 1.0;
  if (kind < 0.5) {
    // Sparks: streaks stretched along their motion.
    float sp = length(screenVel);
    vec2 dir = sp > 0.001 ? screenVel / sp : vec2(1.0, 0.0);
    float len = size * 0.6 + sp * 0.045;
    axisX = dir * len;
    axisY = vec2(-dir.y, dir.x) * size * 0.35;
  } else {
    float ang = aP2.y * 6.2831 + aP3.z * t;
    if (abs(kind - 3.0) < 0.5 || kind > 4.5 && kind < 6.5) ang = aP2.y * 6.2831 + aP3.z * 0.15 * t;
    vec2 c = vec2(cos(ang), sin(ang));
    axisX = c * size * 0.5;
    axisY = vec2(-c.y, c.x) * size * 0.5;
  }
  // Toxic embers bubble as they cool.
  if (abs(kind - 1.0) < 0.5) {
    float bub = 1.0 + 0.25 * sin(t * 9.0 + aP2.y * 30.0);
    axisX *= bub;
    axisY *= bub;
  }
  vec2 world = pos + corner.x * axisX + corner.y * axisY;
  vec3 clip = uCamera * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);

  vUV = corner;
  vKind = kind;
  int b = (int(aP0.w + 0.5) - 1) * 12 + (kind >= 10.0 ? 9 : 6) + int(aP2.w + 0.5);
  vColor = uLook[b];
  // Fade in fast, hold, fade out over the last part of life.
  vFade = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(kind >= 10.0 ? 0.5 : 0.62, 1.0, u));
  // Flipping (coins, confetti, shards): the visible width as it turns.
  vFlip = cos(aP3.z * t + aP2.y * 9.0);
  vGlint = pow(max(0.0, vFlip), 18.0);
}
