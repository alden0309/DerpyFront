#version 300 es
precision highp float;

// Derpy Front: a Dome of Alden's shield. Draws the union of this circle and
// its same-group neighbours as a soft translucent dome (faint in the middle,
// brighter toward the rim) with a thin ring on the outline. Each pixel is
// drawn by the first circle whose padded disc reaches it, so overlapping
// shields merge instead of stacking.

in vec2 vWorld;
flat in vec3 vCircle;
flat in vec4 vColor;
flat in vec4 vParams;
flat in vec3 vN0;
flat in vec3 vN1;
flat in vec3 vN2;
flat in vec3 vN3;
flat in vec3 vN4;
flat in vec3 vN5;
flat in vec4 vStyle;   // DFSTORE (r21): style fill rgb, shimmer code
flat in vec4 vAccent;  // accent rgb, shimmer speed

uniform float uPad;        // world units the ring reaches past a circle
uniform float uRingHalf;   // ring half-width, world units
uniform float uAA;         // world units per screen pixel
uniform float uFillAlpha;  // fill opacity in the middle
uniform float uRimAlpha;   // extra fill opacity at the rim
uniform float uRimWidth;   // world units over which the rim glow fades inward
uniform float uRingAlpha;
uniform float uBuildingAlpha; // ring opacity of an unfinished Dome
uniform float uDashLen;    // unfinished Dome's dashes, world units
uniform float uGapLen;
uniform float uBlockedFill;  // fill multiplier for shields that stop your nuke
uniform float uBlockedRing;  // ring multiplier for them
uniform float uBlockedPulse; // their pulse amplitude
uniform float uTime;

out vec4 fragColor;

float unionDist;   // signed distance to the merged outline (negative inside)
vec3 nearestEdge;  // circle whose edge is closest

void addNeighbor(vec3 n) {
  if (n.z == 0.0) return;
  float r = abs(n.z);
  float d = length(vWorld - n.xy);
  // A circle listed earlier draws every pixel its padded disc reaches.
  if (n.z > 0.0 && d < r + uPad) discard;
  float sd = d - r;
  if (sd < unionDist) {
    unionDist = sd;
    nearestEdge = vec3(n.xy, r);
  }
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// DFSTORE (r21): the style's shimmer at this pixel, 0..1. Cheap patterns in
// world space, so they hold still under the camera.
float shimmer(float code, float speed) {
  float t = uTime * speed;
  vec2 rel = vWorld - vCircle.xy;
  if (code < 1.5) {
    // hex: a honeycomb whose cells light up as a sweep passes.
    vec2 q = vWorld / 4.0;
    vec2 a = mod(q, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
    vec2 b = mod(q - vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float edge = smoothstep(0.38, 0.48, max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)));
    float sweep = 0.5 + 0.5 * sin(rel.x * 0.08 + rel.y * 0.05 - t * 1.6);
    return edge * (0.35 + 0.65 * sweep);
  }
  if (code < 2.5) {
    // ripple: rings spreading out from the Dome.
    float d = length(rel);
    return pow(0.5 + 0.5 * sin(d * 0.45 - t * 2.5), 3.0);
  }
  if (code < 3.5) {
    // sparkle: cells that twinkle in their own time.
    vec2 cell = floor(vWorld / 3.0);
    float h = hash21(cell);
    float tw = 0.5 + 0.5 * sin(t * (2.0 + 3.0 * h) + h * 40.0);
    return step(0.82, h) * pow(tw, 4.0);
  }
  if (code < 4.5) {
    // aurora: soft bands drifting across the shield.
    float band = sin(rel.x * 0.07 + 2.0 * sin(rel.y * 0.04 + t * 0.7) + t);
    return smoothstep(0.2, 1.0, band) * 0.8;
  }
  // scan: a bright line gleaming slowly across, like polished metal.
  float span = vCircle.z * 2.0;
  float pos = mod(t * vCircle.z * 0.6, span * 1.6) - span * 0.8;
  float gleam = exp(-pow((rel.x + rel.y * 0.5 - pos) / 3.0, 2.0));
  return gleam;
}

void main() {
  float own = length(vWorld - vCircle.xy) - vCircle.z;
  if (own > uPad) discard;
  unionDist = own;
  nearestEdge = vCircle;
  addNeighbor(vN0);
  addNeighbor(vN1);
  addNeighbor(vN2);
  addNeighbor(vN3);
  addNeighbor(vN4);
  addNeighbor(vN5);

  float s = unionDist;
  float aa = uAA;
  float building = vParams.x;
  float blocked = vParams.y;

  float fill = 0.0;
  if (building < 0.5) {
    float inside = 1.0 - smoothstep(-aa, aa, s);
    float rim = exp(min(s, 0.0) / uRimWidth);
    fill = inside * (uFillAlpha + uRimAlpha * rim);
  }

  float ring = 1.0 - smoothstep(uRingHalf - aa, uRingHalf + aa, abs(s));
  float ringAlpha = uRingAlpha;
  if (building > 0.5) {
    vec2 rel = vWorld - nearestEdge.xy;
    float arcPos = (atan(rel.y, rel.x) + 3.14159265) * nearestEdge.z;
    float phase = mod(arcPos, uDashLen + uGapLen);
    ring *= smoothstep(0.0, aa, phase) *
            (1.0 - smoothstep(uDashLen - aa, uDashLen, phase));
    ringAlpha = uBuildingAlpha;
  }

  float pulse = 1.0 + uBlockedPulse * blocked * sin(uTime * 3.0);
  float fillA = fill * mix(1.0, uBlockedFill, blocked) * pulse;
  float ringA = min(1.0, ring * ringAlpha * mix(1.0, uBlockedRing, blocked));

  // DFSTORE (r21): a Derp Store Dome style colours the fill and adds its
  // shimmer; the ring keeps the shield's meaning (yours, an ally's, a foe's,
  // or the one stopping your aim). A shield that stops your aim stays plain.
  vec3 fillRGB = vColor.rgb;
  float shimmerCode = vStyle.w;
  if (shimmerCode > 0.5 && building < 0.5 && blocked < 0.5) {
    float sh = shimmer(shimmerCode, vAccent.w);
    fillRGB = mix(vStyle.rgb, vAccent.rgb, sh);
    fillA = min(1.0, fillA * (1.15 + 0.9 * sh));
  }

  float alpha = (ringA + fillA * (1.0 - ringA)) * vColor.a;
  if (alpha < 0.003) discard;
  vec3 rgb = (vColor.rgb * ringA + fillRGB * fillA * (1.0 - ringA)) /
             max(ringA + fillA * (1.0 - ringA), 1e-4);
  fragColor = vec4(rgb, min(alpha, 1.0));
}
