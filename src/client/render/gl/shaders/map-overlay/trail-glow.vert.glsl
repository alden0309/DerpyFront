#version 300 es
precision highp float;

// FX (r28): a nuke trail's comet glow and smooth core line, drawn along its
// recorded centerline (SpiralTrails samples, expanded to a strip with
// aSide = ±1). The strip is widest at the nuke's head and tapers away
// behind it over uTail tiles, down to uMinWidth of its full width.

layout(location = 0) in vec2 aCenter;
layout(location = 1) in vec2 aPerp;
layout(location = 2) in float aDist;
layout(location = 3) in float aSide;

uniform mat3 uCamera;
uniform float uHeadDist;
uniform float uHalfWidth; // tiles, at the head
uniform float uTail;      // tiles over which the trail tapers
uniform float uMinWidth;  // fraction of the width left at the far tail

out float vBehind;  // tiles behind the head
out float vLateral; // -1..1 across the strip
out vec2 vWorld;

void main() {
  float behind = max(0.0, uHeadDist - aDist);
  float taper = mix(uMinWidth, 1.0, exp(-behind / uTail));
  vec2 world = aCenter + vec2(0.5) + aPerp * aSide * uHalfWidth * taper;
  vec3 clip = uCamera * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vBehind = behind;
  vLateral = aSide;
  vWorld = world;
}
