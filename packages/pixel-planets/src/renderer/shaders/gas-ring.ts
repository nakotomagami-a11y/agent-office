/**
 * Gas planet Saturn-style ring shader.
 *
 * Renders a tilted elliptical ring around a gas giant on the full 3× canvas.
 * The ring appears in front of the planet's lower half and disappears behind
 * the upper half, creating the classic Saturn silhouette.
 *
 * Key effects:
 *  - `ring_perspective` (4.0) squishes the Y axis so the annulus looks tilted.
 *  - Two smoothstep calls carve out an annulus between inner/outer radius.
 *  - `uv.y < 0.5` mask removes the ring in the upper half (goes behind planet).
 *    Within the upper-half the planet disc area is also excluded via
 *    `scale_rel_to_planet` so only the outer ring lobes remain visible there.
 *  - An FBM noise field textures the ring material.
 *  - 6 colors: colors[0..2] = bright band, colors[3..5] = dark band.
 *    Posterised + light_d blending determines which band is sampled.
 *
 * Port of GasPlanetLayers/Ring.gdshader from the PixelPlanets Godot project.
 */
export const GAS_RING_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;               // = params.pixels * canvasScale
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform float ring_width;           // annulus half-width  (default 0.1)
uniform float ring_perspective;     // Y-squish (default 4.0)
uniform float scale_rel_to_planet;  // 1/planet-disc-radius in canvas UV (6.0)
uniform vec4  colors[6];            // [0..2] bright, [3..5] dark
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

  float light_d = distance(uv, light_origin);
  uv = rotate(uv, rotation);

  // Shift origin so center of ring is at (0.5, 0)
  vec2 uv_center = uv - vec2(0.0, 0.5);

  // Squish Y to tilt the ring into perspective
  uv_center *= vec2(1.0, ring_perspective);
  float center_d = distance(uv_center, vec2(0.5, 0.0));

  // Annulus: two smoothstep calls carve inner and outer edges
  float ring = smoothstep(0.5 - ring_width*2.0, 0.5 - ring_width, center_d);
  ring      *= smoothstep(center_d - ring_width, center_d, 0.4);

  // Hide ring behind planet on the upper half.
  // Also keep the outer lobes visible (distance > 1/scale_rel_to_planet from
  // centre = outside the planet disc radius in canvas UV space).
  if (uv.y < 0.5) {
    ring *= step(1.0 / scale_rel_to_planet, distance(uv, vec2(0.5)));
  }

  if (ring <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  // Rotate ring material over time for slow drift
  uv_center = rotate(uv_center + vec2(0.0, 0.5), time * time_speed);
  ring *= fbm(uv_center * size);

  // Posterise into bright / dark bands using 4 levels
  float posterized = floor((ring + pow(light_d, 2.0) * 2.0) * 4.0) / 4.0;
  posterized = min(posterized, 2.0);

  vec4 col;
  int n = 3;
  if (posterized <= 1.0) {
    col = colors[int(posterized * float(n - 1))];
  } else {
    col = colors[int((posterized - 1.0) * float(n - 1)) + 3];
  }

  fragColor = vec4(col.rgb, step(0.28, ring) * col.a);
}`;
