#version 300 es
precision highp float;

// FX (r28): one quad per Derp Store burst (flash, fireball and the pack's
// lingering residue; the shockwave ring is a mesh of its own,
// burst-ring.*.glsl). Instances live in a ring buffer and are never
// rewritten per frame: the quad sizes itself from its age, shrinking as the
// flash and the fireball end, and collapses once all layers have.

layout(location = 0) in vec2 aPos;    // unit quad 0..1
layout(location = 1) in vec4 aBurst;  // x, y, start (s), pack index (1-based)
layout(location = 2) in vec4 aSize;   // ring radius, fireball radius, flash radius, flags
layout(location = 3) in vec4 aTimes;  // flash, fireball, ring, residue seconds
layout(location = 4) in vec4 aKinds;  // seed, debris kind, residue kind, unused

uniform mat3 uCamera;
uniform float uTime; // seconds, same clock as aBurst.z

out vec2 vLocal;        // tiles from the burst centre
flat out vec4 vBurst;
flat out vec4 vSize;
flat out vec4 vTimes;
flat out vec4 vKinds;
flat out float vAge;

void main() {
  float age = uTime - aBurst.z;
  float flags = aSize.w;
  bool residue = mod(floor(flags / 2.0), 2.0) > 0.5;
  float ext = 0.0;
#ifdef RESIDUE_PASS
  // Only this program's pack residue (RESIDUE_KIND) draws here.
  if (residue && age < aTimes.w && abs(aKinds.z - float(RESIDUE_KIND)) < 0.5) {
    // The residue field (burst.frag.glsl): radius 1.5→2.4 fireballs, fading
    // out by 1.25 of it, drifting downwind.
    float rr = aSize.y * (1.5 + 0.9 * min(age / aTimes.w, 1.0));
    ext = rr * 1.3 + age * aSize.y * 0.07 + 2.0;
  }
#else
  if (age < aTimes.x) ext = max(ext, aSize.z);
  if (age < aTimes.y) {
    // The fireball's radius now (as burst.frag.glsl grows it); its ragged
    // edge reaches ~1.4 of that.
    float k = age / aTimes.y;
    float R = aSize.y * (0.3 + 0.7 * (1.0 - exp(-max(age, 0.0) * 4.5))) * (1.0 + 0.18 * k);
    ext = max(ext, R * 1.42 + 1.0);
  }
#endif
  vAge = age;
  vBurst = aBurst;
  vSize = aSize;
  vTimes = aTimes;
  vKinds = aKinds;
  if (age < 0.0 || ext <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside clip: nothing drawn
    vLocal = vec2(0.0);
    return;
  }
  vec2 local = (aPos * 2.0 - 1.0) * ext;
  vLocal = local;
  vec2 world = aBurst.xy + vec2(0.5) + local;
  vec3 clip = uCamera * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
