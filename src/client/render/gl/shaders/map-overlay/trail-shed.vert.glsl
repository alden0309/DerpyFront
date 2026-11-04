#version 300 es
precision highp float;

// FX (r28): sparks shed from a nuke trail near its head. One instance per
// few centerline samples (read straight from the ribbon's own vertex
// buffer); each spark drifts out from the path and fades as the nuke pulls
// away, so their age is just how far behind the head they now are.

layout(location = 0) in vec2 aQuad;   // unit quad 0..1
layout(location = 1) in vec2 aCenter; // per instance: the sample it was shed at
layout(location = 2) in vec2 aPerp;
layout(location = 3) in float aDist;

uniform mat3 uCamera;
uniform float uHeadDist;
uniform float uShedLen;   // tiles behind the head a spark lives
uniform float uSpread;    // tiles a spark drifts sideways by the end
uniform float uSize;      // tiles across
uniform float uMinSize;   // tiles across, never smaller (≈ 1.5 device px)
uniform float uTime;
uniform int uColorCount;
uniform vec3 uColors[8];

out vec2 vUV;
out float vFade;
flat out vec3 vColor;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  float behind = uHeadDist - aDist;
  float u = behind / uShedLen;
  float h1 = hash11(aDist * 3.17 + 1.0);
  float h2 = hash11(aDist * 7.31 + 5.0);
  float h3 = hash11(aDist * 1.93 + 9.0);
  // Only some samples shed, and none ahead of the head or past their life.
  if (u < 0.0 || u > 1.0 || h3 > 0.7) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 dir = vec2(aPerp.y, -aPerp.x);
  float side = (h1 - 0.5) * 2.0;
  vec2 pos = aCenter + vec2(0.5) + aPerp * side * uSpread * pow(u, 0.6) -
             dir * u * uShedLen * 0.06 * h2;
  float size = max(uSize * (1.0 - 0.6 * u) * (0.6 + 0.8 * h2), uMinSize);
  vec2 world = pos + (aQuad - 0.5) * size;
  vec3 clip = uCamera * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vUV = aQuad * 2.0 - 1.0;
  float twinkle = 0.65 + 0.35 * sin(uTime * (8.0 + 6.0 * h1) + h2 * 30.0);
  vFade = (1.0 - u) * (1.0 - u) * twinkle * smoothstep(0.0, 0.05, u);
  int n = max(uColorCount, 1);
  vColor = uColors[int(h2 * float(n)) % n];
}
