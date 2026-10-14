#version 300 es
precision highp float;
precision highp usampler2D;
precision highp sampler2DArray;

uniform usampler2D uTileTex;      // R16UI — tile state per cell
uniform sampler2D  uPalette;      // RGBA32F — player colors
uniform sampler2D  uPatternMeta;  // RGBA32F — 1D buffer, 1 px per owner. R=hasPattern, G=width, B=height, A=scale
uniform usampler2D uPatternData;  // R8UI    — 2D buffer, row per owner, bytes for bitmask
uniform sampler2DArray uSkinAtlas; // RGBA8 — per-skin PNG layer, tiled via REPEAT wrap
uniform usampler2D uSkinLayer;    // R8UI — 1D buffer, 1 px per owner. 0=no skin, otherwise layer+1
uniform usampler2D uSkinAnchor;   // RG16UI — 1D buffer, anchor tile (cx, cy) per owner. (0,0) = world origin
uniform usampler2D uSkinMotion;   // R8UI — 1 px per owner: 0 = still, else a DerpySkinMotion code (SITE r22)
uniform float uSkinTime;          // seconds, wrapping every 1440 s; held at 0 with reduced motion
uniform int uShowPatterns;
uniform int uIsTeamMode;          // 1 = teams (tint skin by team color), 0 = FFA (raw skin colors)
const float SKIN_DIM = 1024.0;    // atlas cell size in tiles — must match SkinAtlasArray.SKIN_DIM
const float TAU = 6.28318530718;

uniform vec2 uMapSize;
uniform int uAltView;
uniform float uStaleNukeBase;
uniform float uStaleNukeVariation;
uniform float uStaleNukeAlpha;
uniform vec3 uStaleNukeColor;
uniform uint uHighlightOwner;      // 0 = no highlight; otherwise smallID of hovered owner
uniform float uHighlightBrighten;  // hover contrast boost strength; 0 = disabled
uniform sampler2D uDefenseCoverageTex; // R8 — 1.0 = tile defended by same-owner post
uniform float uDefenseDarken;      // multiplier applied to fill on defended tiles
uniform sampler2D uBorderTex;      // RGBA8 — border flags; R > 0.25 = border tile
uniform float uSaturation;         // 1 = full color, 0 = grayscale
uniform float uTerritoryAlpha;     // absolute fill opacity; 1 = fully opaque
uniform sampler2D uAffiliation;    // RGBA8 — alt-view relation colors (row 0)
uniform float uAltFillAlpha;       // alt-view translucent fill opacity

in vec2 vWorldPos;
out vec4 fragColor;

void main() {
  ivec2 tc = ivec2(floor(vWorldPos));
  if (tc.x < 0 || tc.y < 0 || tc.x >= int(uMapSize.x) || tc.y >= int(uMapSize.y))
    discard;

  uint raw = texelFetch(uTileTex, tc, 0).r;
  uint owner = raw & uint(OWNER_MASK);
  bool fallout = (raw & (1u << FALLOUT_BIT)) != 0u;

  if (owner == 0u && !fallout) discard;

  // --- Stale-nuke ground (any fallout tile, owned or not) ---
  // Renders for owned tiles too so the player's territory color can't bleed
  // through dim/transparent spots in the fallout bloom above.
  if (fallout) {
    float h = fract(sin(float(tc.x) * 12.9898 + float(tc.y) * 78.233) * 43758.5453);
    float noise = uStaleNukeBase + h * uStaleNukeVariation;
    fragColor = vec4(uStaleNukeColor + vec3(noise), uStaleNukeAlpha);
    return;
  }

  // Alt-view: translucent fill in the owner's relation color (matches the
  // border color BorderStampPass draws in alt-view).
  if (uAltView != 0) {
    vec3 rel = texelFetch(uAffiliation, ivec2(int(owner), 0), 0).rgb;
    fragColor = vec4(rel, uAltFillAlpha);
    return;
  }

  // --- Territory fill (owned, not fallout) ---
  float u = (float(owner) + 0.5) / float(PALETTE_SIZE);
  vec4 color = texture(uPalette, vec2(u, 0.25));

  // uShowPatterns gates both skins and patterns — they're the same
  // "decorate the territory fill" feature from the user's perspective.
  uint skinLayerPlus1 =
    uShowPatterns == 1
      ? texelFetch(uSkinLayer, ivec2(int(owner), 0), 0).r
      : 0u;
  if (skinLayerPlus1 > 0u) {
    // Skin overrides pattern entirely (mutually exclusive). The image tiles
    // across the whole territory, one copy every SKIN_DIM tiles, with the
    // center of a copy on the player's spawn tile so the pattern's origin
    // stays put on any map size. (0,0) anchor sentinel = world origin.
    uvec2 anchor = texelFetch(uSkinAnchor, ivec2(int(owner), 0), 0).rg;
    vec2 anchorOffset = (anchor == uvec2(0u)) ? vec2(0.0) : vec2(anchor);

    // Left unwrapped on purpose: the atlas sampler's REPEAT wrap does the
    // tiling, which keeps the UV continuous across copies. fract() here would
    // jump at every seam and pick the wrong mip level along it.
    vec2 skinUV = (vec2(tc) - anchorOffset) / vec2(SKIN_DIM) + vec2(0.5);

    // SITE (r22): skins that move (DerpySkinMotion.ts). Every period here
    // divides the clock's 1440 s wrap, so the wrap can't be seen.
    uint motion = texelFetch(uSkinMotion, ivec2(int(owner), 0), 0).r;
    if (motion == 1u) {
      // Drift: the picture slides east (a whole copy every 240 s) and a
      // little south (720 s). REPEAT wrap keeps it seamless.
      skinUV += vec2(uSkinTime / 240.0, uSkinTime / 720.0);
    } else if (motion == 2u) {
      // Ripple: slow waves bend the picture by a few tiles, like heat
      // shimmer over lava or light through water.
      vec2 wave = vec2(tc) * (TAU / 96.0);
      skinUV += (4.0 / SKIN_DIM) * vec2(
        sin(wave.y + uSkinTime * (TAU / 8.0)),
        cos(wave.x + uSkinTime * (TAU / 10.0)));
    }
    vec4 skin = texture(uSkinAtlas, vec3(skinUV, float(skinLayerPlus1) - 1.0));
    if (motion == 3u) {
      // Shimmer: a narrow band of light sweeps diagonally across, every 9 s.
      float band = fract((float(tc.x) + float(tc.y)) / 640.0 - uSkinTime / 9.0);
      float gleam = smoothstep(0.0, 0.035, band) * (1.0 - smoothstep(0.035, 0.09, band));
      skin.rgb = min(vec3(1.0), skin.rgb + gleam * 0.5);
    } else if (motion == 4u) {
      // Twinkle: the picture's brightest specks pulse, each patch of the
      // map in its own time (3 s a pulse).
      float lum = dot(skin.rgb, vec3(0.299, 0.587, 0.114));
      vec2 cell = floor(vec2(tc) / 20.0);
      float phase = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      float pulse = 0.5 + 0.5 * sin(uSkinTime * (TAU / 3.0) + phase * TAU);
      skin.rgb *= mix(1.0, 0.3 + 0.95 * pulse, smoothstep(0.5, 0.8, lum));
    }
    // Transparent pixels of the image fall through to the player color;
    // opaque pixels show the skin (tinted by team color in team games).
    vec3 skinColor = (uIsTeamMode == 1) ? color.rgb * skin.rgb : skin.rgb;
    color.rgb = mix(color.rgb, skinColor, skin.a);
  } else if (uShowPatterns == 1) {
    vec4 meta = texelFetch(uPatternMeta, ivec2(int(owner), 0), 0);
    if (meta.r > 0.0) {
      int pWidth = int(meta.g);
      int pHeight = int(meta.b);
      int pScale = int(meta.a);

      int px = tc.x >> pScale;
      int py = tc.y >> pScale;
      int mx = ((px % pWidth) + pWidth) % pWidth;
      int my = ((py % pHeight) + pHeight) % pHeight;
      int bitIndex = my * pWidth + mx;
      int byteIndex = bitIndex >> 3;

      uint patternByte = texelFetch(uPatternData, ivec2(byteIndex, int(owner)), 0).r;
      bool isPrimary = (patternByte & (1u << uint(bitIndex & 7))) == 0u;

      if (!isPrimary) {
        color = texture(uPalette, vec2(u, 0.75));
      }
    }
  }

  // Hover highlight: boost contrast on the hovered player's tiles, pushing
  // channels away from mid-gray. uHighlightBrighten is the strength; 0 disables.
  if (uHighlightOwner != 0u && owner == uHighlightOwner && uHighlightBrighten > 0.0) {
    float contrast = 1.0 + uHighlightBrighten;
    color.rgb = clamp((color.rgb - 0.5) * contrast + 0.5, 0.0, 1.0);
  }

  // Defense bonus: darken the fill on interior tiles defended by a same-owner
  // post. Border tiles are skipped — they get the checkerboard overlay from
  // BorderStampPass instead. Coverage is tested first so the (rarer) defended
  // tiles are the only ones that pay for the extra border fetch (&& short-
  // circuits in GLSL ES 3.00; texelFetch is derivative-free so this is safe).
  if (texelFetch(uDefenseCoverageTex, tc, 0).r > 0.5 &&
      texelFetch(uBorderTex, tc, 0).r <= 0.25) {
    color.rgb *= uDefenseDarken;
  }

  // Adjust how saturated the fill is by blending toward its luminance.
  if (uSaturation != 1.0) {
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luma), color.rgb, uSaturation);
  }

  color.a = uTerritoryAlpha;

  fragColor = color;
}
