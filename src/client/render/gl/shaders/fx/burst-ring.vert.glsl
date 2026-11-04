#version 300 es
precision highp float;

// FX (r28): a Derp Store burst's shockwave ring, as a thin annulus around
// its front (a triangle strip of RING_SEGMENTS segments, built from
// gl_VertexID) rather than a quad over the whole disc, so a MIRV's 350
// rings shade only the pixels near their fronts. Same instance data as
// burst.vert.glsl.

layout(location = 1) in vec4 aBurst;  // x, y, start (s), pack index
layout(location = 2) in vec4 aSize;   // ring radius, fireball radius, flash radius, flags
layout(location = 3) in vec4 aTimes;  // flash, fireball, ring, residue seconds

uniform mat3 uCamera;
uniform float uTime;
uniform float uPxPerTile;

out vec2 vLocal;
flat out vec4 vRing; // front radius, band width, fade, flags
flat out float vPack;

const float TAU = 6.28318530718;

void main() {
  float age = uTime - aBurst.z;
  float ringT = aTimes.z;
  // Past 92% of its time the ring has all but faded (fade < 4%): skip it.
  if (age < 0.0 || age >= ringT * 0.92) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = age / ringT;
  float R = aSize.x;
  float r = R * (1.0 - pow(1.0 - u, 2.4));
  float aa = 1.0 / max(uPxPerTile, 0.05);
  float w = max(R * 0.022 + 0.6, aa * 1.5);
  // The band: the wake fades out ~7 widths behind the front (a small
  // ring's faint wake is cut shorter: a MIRV draws hundreds).
  float inner = max(0.0, r - (R < 80.0 ? 4.5 : 7.5) * w);
  float outer = r + 2.5 * w + aa;
  int seg = gl_VertexID / 2;
  float ang = float(seg) / float(RING_SEGMENTS) * TAU;
  // The polygon's edges cut inside a circle; push the outer edge out so the
  // band's soft edge is never clipped.
  float rad = (gl_VertexID % 2 == 0) ? inner : outer / cos(3.14159265 / float(RING_SEGMENTS));
  vec2 local = vec2(cos(ang), sin(ang)) * rad;
  vLocal = local;
  vRing = vec4(r, w, pow(1.0 - u, 1.3), aSize.w);
  vPack = aBurst.w;
  vec3 clip = uCamera * vec3(aBurst.xy + vec2(0.5) + local, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
