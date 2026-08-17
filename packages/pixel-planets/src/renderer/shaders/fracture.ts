/**
 * Fracture shader — a world shattered by an impact.
 *
 * Partitions the surface into Voronoi "plates" and draws the cracks between
 * them as glowing molten fissures: a dark chasm down the centre with hot walls
 * and a cooling rim. An impact epicentre (seed-placed) is the point of impact —
 * cracks fan out widest there and taper to hairlines across the far side, and a
 * molten crater glows at the point itself.
 *
 * The `impact` uniform (0..1, driven by the "Impact Damage" slider) scales the
 * whole thing: 0 = pristine (a few hairline cracks), 1 = blown apart (wide
 * chasms + a big molten wound). Everything off the cracks is transparent so the
 * rock/crater layers below read as the intact plates.
 *
 * Sphere space (rotate → spherify) + the disc remap match rock/craters so the
 * fractures sit on and travel with the surface. colors: [0] hot core wall,
 * [1] mid, [2] cooling rim.
 */
export const FRACTURE_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform int   should_dither;
uniform vec4  colors[3];   // hot wall / mid / cooling rim
uniform float impact;      // 0..1 impact damage
uniform float size;        // Voronoi plate density
uniform int   OCTAVES;
uniform float seed;
uniform float time;
uniform float uv_offset;   // disc remap (0 when canvasScale=1)
uniform float uv_scale;    // = 1/(2*planetR)
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 co) {
  co = mod(co, vec2(1.0) * round(size));
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 c) {
  vec2 i = floor(c), f = fract(c);
  float a = rand(i), b = rand(i + vec2(1, 0)), cc = rand(i + vec2(0, 1)), d = rand(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (cc - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 c) {
  float v = 0.0, s = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += noise(c) * s; c *= 2.0; s *= 0.5; }
  return v;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0 / pixels) <= 1.0 / pixels;
}
vec2 hash2(vec2 p) {
  float r = 523.0 * sin(dot(p, vec2(53.3158, 43.6143)));
  return vec2(fract(15.32354 * r), fract(17.25865 * r));
}
// Voronoi returning the two nearest feature distances (F1, F2). The gap
// (F2 - F1) is ~0 exactly on a plate boundary — that's where cracks live.
vec2 cells2(vec2 p, float n) {
  p *= n;
  float f1 = 1e10, f2 = 1e10;
  for (int xo = -1; xo <= 1; xo++) {
    for (int yo = -1; yo <= 1; yo++) {
      vec2 tp = floor(p) + vec2(float(xo), float(yo));
      vec2 o  = hash2(mod(tp, n));
      vec2 diff = p - tp - o;
      float d = dot(diff, diff);
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  return vec2(sqrt(f1), sqrt(f2));
}
vec2 spherify(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0; float z2 = 1.0 - dot(c, c);
  if (z2 < 0.0) return uv;
  return (c / (sqrt(z2) + 1.0)) * 0.5 + 0.5;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle), -sin(angle)), vec2(sin(angle), cos(angle)));
  return coord + 0.5;
}

void main() {
  vec2 uv_raw = floor(UV * pixels) / pixels;
  vec2 uv = (uv_raw - uv_offset) * uv_scale;
  float d_circle = distance(uv, vec2(0.5));
  if (d_circle > 0.49999) { fragColor = vec4(0.0); return; }
  bool dith = dither(uv_raw, uv);

  vec2 p = rotate(uv, rotation);
  p = spherify(p);

  // Impact epicentre, placed on the near face from the seed.
  vec2 epic = vec2(0.5) + (hash2(vec2(seed, seed * 1.7)) - 0.5) * 0.5;
  float de = distance(p, epic);
  float near = smoothstep(0.55, 0.0, de);   // 1 at impact → 0 far side

  // Plate boundaries. Warp the lookup with fbm so cracks are jagged, not clean
  // Voronoi arcs.
  float warp = (fbm(p * 5.0 + time * 0.15) - 0.5) * 0.10;
  vec2 ff = cells2(p + warp, size);
  float edge = ff.y - ff.x;                 // 0 on a plate boundary

  // Crack half-width: a faint permanent hairline, widening near the impact and
  // with the Impact Damage slider — but capped so it never blobs out.
  float cw = 0.02 + impact * (0.05 + 0.11 * near);

  float alpha = 0.0;
  vec3  rgb = vec3(0.0);

  if (edge < cw) {
    float t = clamp(edge / cw, 0.0, 1.0);   // 0 gap centre → 1 plate edge
    float flick = 0.8 + 0.4 * fbm(p * 7.0 + time * 0.9);
    // Molten fissure near the impact; a cooled dark fracture far from it. This
    // keeps the glow as a focal wound instead of orange soup everywhere.
    vec3 hot  = (t < 0.35 ? colors[0].rgb : t < 0.7 ? colors[1].rgb : colors[2].rgb) * flick;
    vec3 cold = mix(colors[2].rgb * 0.28, colors[2].rgb * 0.6, t);
    rgb = mix(cold, hot, near);
    if (t < 0.24) rgb = mix(vec3(0.015), colors[0].rgb * 0.5 * flick, near); // deep chasm
    alpha = 1.0;
  }

  // Impact crater: a dark excavated rim ringing a churning molten pool with a
  // white-hot centre — a real wound, not a flat disc.
  float craterR = 0.05 + 0.14 * impact;
  if (de < craterR) {
    float cr = de / craterR;                // 0 centre → 1 rim
    float churn = fbm(p * 8.0 + time * 0.7);
    if (cr > 0.8) {
      rgb = colors[2].rgb * 0.18;           // dark shadowed rim (excavated bowl)
    } else {
      float heat = (1.0 - cr) * (0.7 + 0.55 * churn);
      rgb = heat > 0.9  ? colors[0].rgb
          : heat > 0.55 ? mix(colors[0].rgb, colors[1].rgb, 0.5)
          : heat > 0.3  ? colors[1].rgb
                        : colors[2].rgb;
    }
    alpha = 1.0;
  }

  if (alpha < 0.5) { fragColor = vec4(0.0); return; }
  if (!dith && should_dither == 1) rgb *= 0.9;   // subtle border stipple
  fragColor = vec4(rgb, 1.0);
}`;
