/**
 * Land + rivers terrain shader.
 *
 * Used for dry, terran, and ice planet types. Controls whether rivers / ocean
 * appear via the `river_cutoff` uniform (0 = no water, ~0.37 = Earth-like).
 *
 * Algorithm:
 *  1. Clip to sphere with early discard for transparent pixels (fast path).
 *  2. Spherify and rotate.
 *  3. Build 4 stacked fbm samples (fbm1–4) that progressively amplify the
 *     light-side displacement — this creates the "brighter on the lit side"
 *     continent shading.
 *  4. A separate fbm sample (r_raw) is thresholded at river_cutoff to produce
 *     a river/water mask. Where the mask is 0, the water colors show through.
 *  5. Dithering is applied at the two light borders.
 *
 * Port of LandRivers.gdshader.
 */
export const TERRAIN_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform float dither_size;
uniform int   should_dither;
uniform float light_border_1;
uniform float light_border_2;
uniform float river_cutoff;
uniform vec4  colors[6]; // [land×4, water×2]
uniform float size;
uniform int   OCTAVES;
uniform float seed;
uniform float time;
in  vec2 UV;
layout(location=0) out vec4 fragColor;

float rand(vec2 coord) {
  coord = mod(coord, vec2(2.0,1.0) * round(size));
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * 15.5453 * seed);
}
float noise(vec2 coord) {
  vec2 i = floor(coord), f = fract(coord);
  float a=rand(i), b=rand(i+vec2(1,0)), c=rand(i+vec2(0,1)), d=rand(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 coord) {
  float v=0.0,s=0.5;
  for(int i=0;i<OCTAVES;i++){v+=noise(coord)*s;coord*=2.0;s*=0.5;}
  return v;
}
vec2 spherify(vec2 uv) {
  vec2 c = uv*2.0-1.0;
  float z2 = 1.0 - dot(c,c);
  if (z2 < 0.0) return uv;
  return (c/(sqrt(z2)+1.0))*0.5+0.5;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle),-sin(angle)), vec2(sin(angle),cos(angle)));
  return coord + 0.5;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0/pixels) <= 1.0/pixels;
}
void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  bool dith = dither(uv, UV);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  if (a < 0.5) { fragColor = vec4(0.0); return; }
  uv = spherify(uv);
  float d_light = distance(uv, light_origin);
  uv = rotate(uv, rotation);
  vec2 base_uv = uv * size + vec2(time * time_speed, 0.0);
  float fbm1 = fbm(base_uv);
  float fbm2 = fbm(base_uv - light_origin * fbm1);
  float fbm3 = fbm(base_uv - light_origin * 1.5 * fbm1);
  float fbm4 = fbm(base_uv - light_origin * 2.0 * fbm1);
  float r_raw = fbm(base_uv + fbm1 * 6.0);
  float r_mask = step(river_cutoff, r_raw);
  float dither_border = (1.0/pixels) * dither_size;
  if (d_light < light_border_1) { fbm4 *= 0.9; }
  if (d_light > light_border_1) { fbm2 *= 1.05; fbm3 *= 1.05; fbm4 *= 1.05; }
  if (d_light > light_border_2) {
    fbm2 *= 1.3; fbm3 *= 1.4; fbm4 *= 1.8;
    if (d_light < light_border_2 + dither_border && (dith || should_dither == 0)) fbm4 *= 0.5;
  }
  d_light = pow(d_light, 2.0) * 0.4;
  vec4 col = colors[3];
  if (fbm4+d_light < fbm1*1.5) col = colors[2];
  if (fbm3+d_light < fbm1*1.0) col = colors[1];
  if (fbm2+d_light < fbm1)     col = colors[0];
  if (r_mask < fbm1 * 0.5) {
    col = colors[5];
    if (fbm4+d_light < fbm1*1.5) col = colors[4];
  }
  fragColor = vec4(col.rgb, a * col.a);
}`;
