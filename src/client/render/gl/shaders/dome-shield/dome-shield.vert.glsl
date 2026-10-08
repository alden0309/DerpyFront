#version 300 es
precision highp float;

// Unit quad [0,1]
layout(location = 0) in vec2 aPos;
// Per-instance: center x, y (world units), radius
layout(location = 1) in vec3 aCircle;
// Per-instance: r, g, b, alpha multiplier
layout(location = 2) in vec4 aColor;
// Per-instance: building (0/1), blocked (0/1), unused, unused
layout(location = 3) in vec4 aParams;
// Per-instance: up to six same-group neighbours (x, y, radius). The radius is
// positive for circles listed earlier (they own the pixels they reach),
// negative for later ones, 0 for an empty slot.
layout(location = 4) in vec3 aN0;
layout(location = 5) in vec3 aN1;
layout(location = 6) in vec3 aN2;
layout(location = 7) in vec3 aN3;
layout(location = 8) in vec3 aN4;
layout(location = 9) in vec3 aN5;

uniform mat3 uCamera;
uniform float uPad; // how far the ring and its soft edge reach past the circle

out vec2 vWorld;
flat out vec3 vCircle;
flat out vec4 vColor;
flat out vec4 vParams;
flat out vec3 vN0;
flat out vec3 vN1;
flat out vec3 vN2;
flat out vec3 vN3;
flat out vec3 vN4;
flat out vec3 vN5;

void main() {
  vCircle = aCircle;
  vColor = aColor;
  vParams = aParams;
  vN0 = aN0;
  vN1 = aN1;
  vN2 = aN2;
  vN3 = aN3;
  vN4 = aN4;
  vN5 = aN5;

  float extent = aCircle.z + uPad;
  vec2 world = aCircle.xy + (aPos * 2.0 - 1.0) * extent;
  vWorld = world;

  vec3 clip = uCamera * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
