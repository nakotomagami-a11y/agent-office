/**
 * Gas Giant cloud bands shader.
 *
 * Simulates the turbulent cloud layers of a gas planet (Jupiter-style).
 * Two instances of this shader are layered: a dark opaque base layer and a
 * lighter semi-transparent overlay layer (cloud_cover > 0 makes some pixels
 * transparent, revealing the layer beneath).
 *
 * Algorithm:
 *  1. Quantise UV to pixel grid.
 *  2. Spherify — maps the flat disc to a sphere surface (barrel distortion).
 *  3. Rotate the sphere to the configured angle.
 *  4. Stretch UV vertically to create horizontal band structure.
 *  5. Add a smooth horizontal wave (cloud_curve) to give bands a wavy edge.
 *  6. Accumulate fbm noise driven by time to animate the clouds scrolling.
 *  7. Compare the noise value against cloud_cover and two light borders to
 *     pick one of four colors (shadow → mid → highlight → bright).
 *
 * Port of GasPlanet.gdshader from the PixelPlanets Godot project.
 */
export const GAS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float cloud_cover;
uniform vec2  light_origin;
uniform float time_speed;
uniform float stretch;
uniform float cloud_curve;
uniform float light_border_1;
uniform float light_border_2;
uniform float rotation;
uniform vec4  colors[4];
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
// When the canvas is oversized (e.g. 3× for gas-giant with ring), remap the
// full-canvas UV into planet-disc UV [0,1] before any disc calculations.
// For a 1× canvas: uv_offset=0, uv_scale=1 → identity transform.
uniform float uv_offset;   // = (canvasScale-1) / (2*canvasScale)
uniform float uv_scale;    // = canvasScale
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(1.0) * round(size));
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 coord) {
  vec2 i = floor(coord), f = fract(coord);
  float a = rand(i), b = rand(i + vec2(1,0)), c = rand(i + vec2(0,1)), d = rand(i + vec2(1,1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 coord) {
  float v = 0.0, s = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += noise(coord)*s; coord *= 2.0; s *= 0.5; }
  return v;
}
float circleNoise(vec2 uv) {
  float uy = floor(uv.y); uv.x += uy * 0.31;
  vec2 f = fract(uv);
  float h = rand(vec2(floor(uv.x), floor(uy)));
  float m = length(f - 0.25 - h * 0.5);
  return smoothstep(0.0, h * 0.25, m * 0.75);
}
float cloud_alpha(vec2 uv) {
  float cn = 0.0;
  for (int i = 0; i < 9; i++)
    cn += circleNoise((uv * size * 0.3) + (float(i+1) + 10.0) + vec2(time * time_speed, 0.0));
  return fbm(uv * size + cn + vec2(time * time_speed, 0.0));
}
vec2 spherify(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  float z = sqrt(1.0 - dot(c, c));
  return (c / (z + 1.0)) * 0.5 + 0.5;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle), -sin(angle)), vec2(sin(angle), cos(angle)));
  return coord + 0.5;
}
void main() {
  // Pixelate at full canvas resolution, then remap into disc UV [0,1].
  // For a 1× canvas uv_offset=0 / uv_scale=1 → identity; for a 3× canvas
  // the disc occupies the center third and is expanded back to [0,1].
  vec2 uv_raw = floor(UV * pixels) / pixels;
  vec2 uv = (uv_raw - uv_offset) * uv_scale;

  float d_light  = distance(uv, light_origin);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  uv.y += smoothstep(0.0, cloud_curve, abs(uv.x - 0.4));
  float c = cloud_alpha(uv * vec2(1.0, stretch));
  vec4 col = colors[0];
  if (c < cloud_cover + 0.03)               col = colors[1];
  if (d_light + c * 0.2 > light_border_1)   col = colors[2];
  if (d_light + c * 0.2 > light_border_2)   col = colors[3];
  fragColor = vec4(col.rgb, step(cloud_cover, c) * a * col.a);
}`;
