#version 300 es
precision highp float;

// The effect preview's territory: one RGBA texel per tile (owner fill, or
// the darker border shade), drawn over the terrain like the game's fill.
uniform sampler2D uTerritory;
uniform vec2 uMapSize;

in vec2 vWorldPos;
out vec4 fragColor;

void main() {
  ivec2 tc = ivec2(floor(vWorldPos));
  if (tc.x < 0 || tc.y < 0 || tc.x >= int(uMapSize.x) ||
      tc.y >= int(uMapSize.y))
    discard;
  vec4 c = texelFetch(uTerritory, tc, 0);
  if (c.a <= 0.0) discard;
  fragColor = c;
}
