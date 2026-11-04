#version 300 es
precision highp float;

// FX (r28): the shape of each burst particle. Kinds 0–5 are debris (one per
// pack: sparks, embers, shards, confetti, stars, coins; 6 is a banana peel), 10–15 the residue
// left drifting (flare embers, bubbles, frost glints, sprinkles, nebula
// motes, golden glints). Premultiplied: light adds, solid bits cover.

in vec2 vUV;          // -1..1 across the particle
flat in float vKind;
flat in vec3 vColor;
in float vFade;
in float vFlip;
in float vGlint;

out vec4 fragColor;

float star4(vec2 p, float sharp) {
  return max(exp(-abs(p.x) * sharp) * exp(-abs(p.y) * 2.2),
             exp(-abs(p.y) * sharp) * exp(-abs(p.x) * 2.2));
}

void main() {
  vec2 p = vUV;
  float r = length(p);
  vec3 emit = vec3(0.0);
  float a = 0.0;
  vec3 solid = vec3(0.0);
  int kind = int(vKind + 0.5);

  if (kind == 0) {
    // Spark: a hot streak, white at its heart.
    float s = exp(-p.y * p.y * 5.0) * (1.0 - smoothstep(0.2, 1.0, abs(p.x)));
    float core = exp(-p.y * p.y * 14.0) * (1.0 - smoothstep(0.0, 0.7, abs(p.x)));
    emit = vColor * s * 1.5 + vec3(1.0, 0.95, 0.8) * core * 0.5;
  } else if (kind == 1) {
    // Ember: a glowing toxic blob with a bright core.
    float s = 1.0 - smoothstep(0.35, 1.0, r);
    float core = 1.0 - smoothstep(0.0, 0.45, r);
    emit = (vColor * s * 1.1 + vec3(0.9, 1.0, 0.6) * core * 0.6);
    a = s * 0.35;
    solid = vColor * 0.25 * a;
  } else if (kind == 2) {
    // Shard: a thin ice sliver, glinting as it turns.
    float w = max(0.12, abs(vFlip) * 0.32);
    float body = 1.0 - smoothstep(0.85, 1.0, abs(p.x) / w + abs(p.y));
    a = body * 0.85;
    solid = mix(vColor, vec3(1.0), 0.35 + 0.4 * abs(vFlip)) * a;
    emit = vec3(1.0) * body * vGlint * 1.6 + vec3(1.0) * star4(p, 9.0) * vGlint * 0.8;
  } else if (kind == 3) {
    // Confetti: a tumbling sprinkle.
    float flip = max(0.15, abs(vFlip));
    float m = (1.0 - smoothstep(0.85, 1.0, abs(p.y))) *
              (1.0 - smoothstep(flip * 0.42, flip * 0.42 + 0.12, abs(p.x)));
    a = m;
    solid = vColor * (0.75 + 0.35 * flip) * a;
    emit = vColor * a * 0.15;
  } else if (kind == 6) {
    // Banana peel: a curled crescent, browning at its tips.
    float flip = max(0.25, abs(vFlip));
    vec2 q = p * vec2(1.0 / flip, 1.0);
    float outer = length(q) - 0.95;
    float inner = length(q - vec2(0.0, -0.42)) - 0.72;
    float m = 1.0 - smoothstep(0.0, 0.12, max(outer, -inner));
    a = m;
    float tip = smoothstep(0.55, 0.95, abs(q.x));
    solid = mix(vColor, vec3(0.45, 0.28, 0.08), tip * 0.8) * a;
    emit = vColor * a * 0.12;
  } else if (kind == 4) {
    // Star: a four-point twinkle with a soft halo.
    float s = star4(p, 7.0) + (1.0 - smoothstep(0.0, 0.5, r)) * 0.5;
    emit = mix(vColor, vec3(1.0), 0.5) * s * 1.5;
  } else if (kind == 5) {
    // Coin: a gold disc flipping end over end, flashing when it faces up.
    float flip = max(0.12, abs(vFlip));
    float e = length(p * vec2(1.0 / flip, 1.0));
    float disc = 1.0 - smoothstep(0.82, 0.98, e);
    float rim = smoothstep(0.55, 0.85, e) * disc;
    a = disc;
    vec3 face = mix(vec3(1.0, 0.86, 0.3), vColor, 0.5);
    solid = mix(face * 1.05, face * 0.62, rim) * a;
    emit = face * disc * 0.25 +
           vec3(1.0, 0.95, 0.7) * (disc * vGlint * 1.2 + star4(p, 8.0) * vGlint * 0.9);
  } else if (kind == 10) {
    // Flare ember: a flickering mote of heat rising off the blast.
    float s = 1.0 - smoothstep(0.0, 1.0, r);
    emit = vColor * s * s * 1.6;
  } else if (kind == 11) {
    // Bubble: a toxic bubble wells up, then pops.
    float ring = 1.0 - smoothstep(0.0, 0.14, abs(r - 0.78));
    float fill = (1.0 - smoothstep(0.6, 0.8, r)) * 0.18;
    emit = vColor * (ring * 0.9 + fill);
    a = ring * 0.35 + fill;
    solid = vColor * 0.4 * a;
    // A white highlight on the bubble's shoulder.
    emit += vec3(1.0) * (1.0 - smoothstep(0.0, 0.18, length(p - vec2(-0.32, -0.32)))) * 0.7;
  } else if (kind == 12) {
    // Frost glint: a crystal catching the light.
    emit = mix(vColor, vec3(1.0), 0.6) * (star4(p, 10.0) * 1.4 + (1.0 - smoothstep(0.0, 0.3, r)) * 0.5);
  } else if (kind == 13) {
    // Sprinkle: a little rod of candy.
    float m = (1.0 - smoothstep(0.8, 1.0, abs(p.y))) * (1.0 - smoothstep(0.24, 0.36, abs(p.x)));
    a = m;
    solid = vColor * a;
    emit = vColor * m * 0.2;
  } else if (kind == 14) {
    // Nebula mote: a pinprick of light.
    float s = 1.0 - smoothstep(0.0, 0.9, r);
    emit = mix(vColor, vec3(1.0), 0.5) * s * s * 1.6;
  } else {
    // Golden glint: a bright four-point sparkle.
    emit = mix(vColor, vec3(1.0), 0.55) * (star4(p, 8.0) * 1.6 + (1.0 - smoothstep(0.0, 0.35, r)) * 0.6);
  }

  emit *= vFade;
  a *= vFade;
  solid *= vFade;
  if (a < 0.003 && dot(emit, vec3(1.0)) < 0.006) discard;
  fragColor = vec4(solid + emit, a);
}
