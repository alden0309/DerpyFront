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
  float alpha = (ringA + fillA * (1.0 - ringA)) * vColor.a;
  if (alpha < 0.003) discard;
  fragColor = vec4(vColor.rgb, min(alpha, 1.0));
}
