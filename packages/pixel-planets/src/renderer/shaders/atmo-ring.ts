/**
 * Transparent, distorted atmosphere ring.
 *
 * A tilted elliptical ring like `gas-ring`, but instead of solid posterised
 * bands it renders as a soft, semi-transparent haze whose edge is warped by an
 * fbm field and whose opacity is patchy (also fbm-driven) — a wispy gas ring
 * rather than a rocky Saturn ring. Used by Toxic World.
 *
 * Geometry mirrors gas-ring: `ring_perspective` squishes Y for the tilt,
 * `scale_rel_to_planet` (= 1/planetR) masks the ring where it passes behind the
 * planet on the upper half, `ring_opacity` scales the overall transparency.
 *
 * colors[0] = bright wisp, [1] = mid, [2] = faint edge.
 */
export const ATMO_RING_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform float time_speed;
uniform float ring_width;
uniform float ring_perspective;
uniform float scale_rel_to_planet;
uniform float ring_opacity;
uniform vec4  colors[3];
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(2.0, 1.0) * round(size));
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 coord) {
  vec2 i = floor(coord), f = fract(coord);
  float a = rand(i), b = rand(i+vec2(1,0)), c = rand(i+vec2(0,1)), d = rand(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 coord) {
  float v = 0.0, s = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += noise(coord)*s; coord *= 2.0; s *= 0.5; }
  return v;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle), -sin(angle)), vec2(sin(angle), cos(angle)));
  return coord + 0.5;
}

void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  uv = rotate(uv, rotation);

  vec2 uv_center = uv - vec2(0.0, 0.5);
  uv_center *= vec2(1.0, ring_perspective);

  // Warp the ring edge with a drifting fbm field.
  float n = fbm(uv_center * size + vec2(time * time_speed, 0.0));
  float center_d = distance(uv_center, vec2(0.5, 0.0)) + (n - 0.5) * ring_width * 0.9;

  float ring = smoothstep(0.5 - ring_width * 2.0, 0.5 - ring_width, center_d);
  ring      *= smoothstep(center_d - ring_width, center_d, 0.4);

  // Hide the ring where it passes behind the planet (upper half).
  if (uv.y < 0.5) {
    ring *= step(1.0 / scale_rel_to_planet, distance(uv, vec2(0.5)));
  }
  if (ring <= 0.001) { fragColor = vec4(0.0); return; }

  // Patchy, semi-transparent haze.
  float alpha = ring * ring_opacity * (0.35 + n * 0.85);
  alpha = clamp(alpha, 0.0, 1.0);

  vec4 col = colors[1];
  if (n > 0.58) col = colors[0];
  if (n < 0.36) col = colors[2];

  fragColor = vec4(col.rgb, alpha);
}`;
