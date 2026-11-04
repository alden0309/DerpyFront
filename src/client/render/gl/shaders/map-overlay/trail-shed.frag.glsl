#version 300 es
precision highp float;

// FX (r28): a shed trail spark — a soft glowing mote with a white heart,
// added like light (blend ONE, ONE).

in vec2 vUV;
in float vFade;
flat in vec3 vColor;
out vec4 fragColor;

void main() {
  float r = length(vUV);
  float s = 1.0 - smoothstep(0.0, 1.0, r);
  float core = 1.0 - smoothstep(0.0, 0.35, r);
  vec3 c = (vColor * s * s * 1.6 + vec3(1.0) * core * 0.6) * vFade;
  if (dot(c, vec3(1.0)) < 0.004) discard;
  fragColor = vec4(c, 0.0);
}
