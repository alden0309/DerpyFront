#version 300 es
precision highp float;

// FX (r28): a nuke trail's comet glow (uMode 0: into the reduced-resolution
// halo buffer, premultiplied, composited additively) and its smooth core
// line (uMode 1: full resolution over the stamped trail). Colours follow
// the trail's own style exactly as trail.frag.glsl does — a gradient banded
// across the map, a transition through the colours, or (spirals) the
// palette wound along the path — so the line and the glow match the trail.

uniform float uTime;
uniform float uTrailAlpha;
uniform int uColorCount;
uniform vec3 uColors[8];
uniform int uStyle;      // 0 gradient, 1 transition, 2 spiral
uniform float uScalar0;  // gradient colorSize / transition frequency
uniform float uScalar1;  // gradient movementSpeed
uniform float uTail;     // tiles over which the glow fades behind the head
uniform int uMode;       // 0 glow halo, 1 core line

in float vBehind;
in float vLateral;
in vec2 vWorld;
out vec4 fragColor;

vec3 trailColor() {
  int n = max(uColorCount, 1);
  float f;
  if (uStyle == 0) {
    float size = max(uScalar0, 0.001);
    float cycle = size * float(n);
    f = fract((vWorld.x + vWorld.y - uTime * uScalar1) / cycle) * float(n);
  } else if (uStyle == 1) {
    f = mod(uTime * uScalar0, float(n));
  } else {
    f = mod(vBehind * 0.08 - uTime * 0.6, float(n));
  }
  int i = int(f) % n;
  int j = (i + 1) % n;
  return mix(uColors[i], uColors[j], fract(f));
}

void main() {
  float lat = abs(vLateral);
  float head = exp(-vBehind / uTail);
  vec3 col = trailColor();
  if (uMode == 0) {
    float glow = exp(-lat * lat * 3.0) * (0.15 + 0.85 * head);
    // The head itself burns brightest.
    glow *= 0.7 + 1.3 * exp(-vBehind / 6.0);
    float a = min(1.0, uTrailAlpha * glow * 1.5);
    if (a < 0.003) discard;
    vec3 c = mix(col, vec3(1.0), 0.25 * exp(-vBehind / 10.0));
    fragColor = vec4(c * a, a);
  } else {
    float core = 1.0 - smoothstep(0.55, 1.0, lat);
    if (core <= 0.003) discard;
    float hot = (1.0 - smoothstep(0.0, 0.5, lat)) * (0.25 + 0.45 * exp(-vBehind / 14.0));
    vec3 c = mix(col, vec3(1.0), hot);
    float a = min(uTrailAlpha * 1.4, 1.0) * core;
    fragColor = vec4(c, a);
  }
}
