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
// FX (r28): strikes on the shields, newest last: x, y (world), start time
// (s, uTime's clock), and how far the ripple may run (world units).
uniform vec4 uImpacts[8];
uniform int uImpactCount;
uniform float uHalo; // world units a styled shield's glow reaches outside it

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

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

// DFSTORE (r21), reworked in FX (r28): the style's surface pattern at this
// pixel, 0..1. Patterns sit in world space, so they hold still under the
// camera, and stay subtle: the shield must still read as a shield.
float shimmer(float code, float speed) {
  float t = uTime * speed;
  vec2 rel = vWorld - vCircle.xy;
  if (code < 1.5) {
    // hex: a frozen honeycomb lattice; cells frost over and clear, and the
    // lattice's corners glint.
    vec2 q = vWorld / 4.0;
    vec2 a = mod(q, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
    vec2 b = mod(q - vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float hexd = max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y));
    float edge = smoothstep(0.40, 0.49, hexd);
    vec2 cid = floor(q - g);
    float h = hash21(cid);
    float frost = smoothstep(0.6, 1.0, sin(t * (0.6 + h) + h * 30.0)) * 0.45;
    float corner = smoothstep(0.47, 0.5, length(g)) * pow(max(0.0, sin(t * 2.0 + h * 50.0)), 8.0);
    return clamp(edge * 0.75 + frost + corner, 0.0, 1.0);
  }
  if (code < 2.5) {
    // ripple: heat rippling out from the Dome, wavering like air over a
    // furnace.
    float d = length(rel);
    float n = vnoise(vWorld * 0.08 + vec2(0.0, -t * 0.6));
    float w = sin(d * 0.42 - t * 2.4 + n * 3.0);
    return pow(0.5 + 0.5 * w, 4.0) * (0.6 + 0.4 * n);
  }
  if (code < 3.5) {
    // sparkle: glitter that twinkles in its own time over faint candy
    // stripes.
    vec2 cell = floor(vWorld / 3.0);
    vec2 cp = fract(vWorld / 3.0) - 0.5;
    float h = hash21(cell);
    float tw = pow(max(0.0, sin(t * (2.0 + 3.0 * h) + h * 40.0)), 6.0);
    float star = max(exp(-abs(cp.x) * 14.0) * exp(-abs(cp.y) * 3.0),
                     exp(-abs(cp.y) * 14.0) * exp(-abs(cp.x) * 3.0));
    float stripe = smoothstep(0.7, 1.0, sin((rel.x + rel.y) * 0.25 - t * 0.8)) * 0.25;
    return clamp(step(0.78, h) * tw * (0.4 + star * 1.6) + stripe, 0.0, 1.0);
  }
  if (code < 4.5) {
    // aurora: soft curtains of light drifting across, with stars behind.
    float band = sin(rel.x * 0.07 + 2.0 * sin(rel.y * 0.04 + t * 0.7) + t);
    float band2 = sin(rel.y * 0.09 - 1.5 * sin(rel.x * 0.05 - t * 0.5) - t * 0.8);
    float aur = smoothstep(0.3, 1.0, band) * 0.75 + smoothstep(0.5, 1.0, band2) * 0.45;
    vec2 cell = floor(vWorld / 2.5);
    float h = hash21(cell + 7.0);
    float star = step(0.93, h) * (0.5 + 0.5 * sin(t * 3.0 + h * 60.0)) *
                 (1.0 - smoothstep(0.0, 0.3, length(fract(vWorld / 2.5) - 0.5)));
    return clamp(aur + star, 0.0, 1.0);
  }
  if (code < 5.5) {
    // scan: polished gold, finely engraved, with a bright gleam sliding
    // slowly across.
    float span = vCircle.z * 2.0;
    float pos = mod(t * vCircle.z * 0.6, span * 1.6) - span * 0.8;
    float gleam = exp(-pow((rel.x + rel.y * 0.5 - pos) / 3.0, 2.0));
    float engr = smoothstep(0.85, 1.0, sin(length(rel) * 1.1)) * 0.22;
    return clamp(gleam + engr, 0.0, 1.0);
  }
  // bubble: toxic bubbles welling up through the shield and popping.
  vec2 q = vWorld / 6.0 + vec2(0.0, t * 0.35);
  vec2 cell = floor(q);
  vec2 cp = fract(q) - 0.5;
  float h = hash21(cell + 3.0);
  float ph = fract(t * (0.35 + 0.4 * h) + h * 9.0);
  vec2 c = (vec2(h, fract(h * 17.0)) - 0.5) * 0.35;
  float r = 0.08 + 0.3 * ph;
  float ring = 1.0 - smoothstep(0.0, 0.06, abs(length(cp - c) - r));
  float goo = vnoise(vWorld * 0.06 + vec2(t * 0.1, t * 0.25)) * 0.35;
  return clamp(ring * step(0.35, h) * (1.0 - ph) * 1.4 + goo, 0.0, 1.0);
}

// FX (r28): how strongly strikes ripple the shield here, 0..~1.5.
float impactRipple() {
  float rip = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uImpactCount) break;
    vec4 im = uImpacts[i];
    float age = uTime - im.z;
    if (age < 0.0 || age > 1.8) continue;
    float dd = length(vWorld - im.xy);
    float front = age * 90.0;
    float reach = 1.0 - smoothstep(im.w * 0.75, im.w, front);
    float w = 2.5 + age * 5.0;
    float wave = exp(-pow((dd - front) / w, 2.0)) * pow(1.0 - age / 1.8, 1.6) * reach;
    // A second, fainter ring chasing the first.
    float wave2 = exp(-pow((dd - front * 0.7) / (w * 0.8), 2.0)) * pow(1.0 - age / 1.8, 2.0) * 0.45 * reach;
    float flash = exp(-dd * dd / 300.0) * max(0.0, 1.0 - age / 0.35);
    rip += wave + wave2 + flash;
  }
  return rip;
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
  // FX (r28): styled shields also glow at the edge (brightest where the
  // dome curves away, like light through glass), catch an occasional sweep
  // of light, and throw a soft halo outside.
  vec3 fillRGB = vColor.rgb;
  float shimmerCode = vStyle.w;
  bool styled = shimmerCode > 0.5 && building < 0.5 && blocked < 0.5;
  float inside = 1.0 - smoothstep(-aa, aa, s);
  if (styled) {
    float sh = shimmer(shimmerCode, vAccent.w);
    float edge = max(-s, 0.0);
    float fres = exp(-edge / max(uRimWidth * 0.3, 1.0));
    float fresWide = exp(-edge / uRimWidth);
    vec2 rel = vWorld - vCircle.xy;
    float hc = hash21(floor(vCircle.xy));
    float period = 7.0 + 3.0 * hc;
    float ph = mod(uTime * vAccent.w + hc * period, period);
    float along = dot(rel / vCircle.z, normalize(vec2(1.0, 0.45)));
    float sweepPos = ph / 1.6 * 2.6 - 1.3;
    float sweep = ph < 1.6 ? exp(-pow((along - sweepPos) / 0.09, 2.0)) : 0.0;
    float glow = clamp(sh * 0.75 + fres * 0.7 + sweep, 0.0, 1.0);
    fillRGB = mix(vStyle.rgb, vAccent.rgb, glow);
    fillA = inside * (uFillAlpha * 1.1 + uRimAlpha * fresWide * 0.8 +
                      fres * 0.38 + sh * 0.12 + sweep * 0.3);
    // The halo just outside the shield's edge.
    float halo = (1.0 - inside) * exp(-max(s, 0.0) / max(uHalo * 0.4, 0.5)) *
                 (1.0 - smoothstep(uHalo * 0.6, uHalo, s)) * 0.3;
    fillA += halo;
  }
  if (building < 0.5) {
    float rip = impactRipple();
    if (rip > 0.001) {
      vec3 rc = styled ? vAccent.rgb : mix(vColor.rgb, vec3(1.0), 0.5);
      float r = clamp(rip, 0.0, 1.0);
      fillRGB = mix(fillRGB, rc, r);
      fillA = max(fillA, inside * (0.08 + 0.5 * r));
      ringA = min(1.0, ringA * (1.0 + 1.5 * r));
    }
  }

  float alpha = (ringA + fillA * (1.0 - ringA)) * vColor.a;
  if (alpha < 0.003) discard;
  vec3 rgb = (vColor.rgb * ringA + fillRGB * fillA * (1.0 - ringA)) /
             max(ringA + fillA * (1.0 - ringA), 1e-4);
  fragColor = vec4(rgb, min(alpha, 1.0));
}
