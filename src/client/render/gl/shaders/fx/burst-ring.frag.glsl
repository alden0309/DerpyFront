#version 300 es
precision highp float;

// FX (r28): a crisp shockwave front in the pack's ring colour, white at its
// crest, a faint wake behind it, and a dark line just inside: the air
// bending the light. Premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA).

uniform vec3 uLook[LOOK_SIZE];

in vec2 vLocal;
flat in vec4 vRing;
flat in float vPack;
out vec4 fragColor;

void main() {
  float x = (length(vLocal) - vRing.x) / vRing.y;
  float fade = vRing.z;
  bool domeStop = mod(vRing.w, 2.0) > 0.5;
  float band = 1.0 - smoothstep(0.0, 1.0, abs(x));
  float wake = x < 0.0 ? exp(x * 0.5) * 0.22 : 0.0;
  vec3 rc = uLook[(int(vPack + 0.5) - 1) * 12 + 5];
  vec3 emit = rc * band * fade * 1.05 + vec3(1.0) * band * band * band * fade * 0.3 +
              rc * wake * fade * 0.45;
  float xr = x + 1.9;
  float refr = exp(-xr * xr * 1.5) * 0.28 * fade * (domeStop ? 0.4 : 1.0);
  if (refr < 0.002 && dot(emit, vec3(1.0)) < 0.004) discard;
  fragColor = vec4(emit, refr);
}
