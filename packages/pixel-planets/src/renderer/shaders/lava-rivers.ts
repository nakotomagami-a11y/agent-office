/**
 * Lava rivers overlay shader.
 *
 * Renders glowing lava channels on top of the rocky surface. The channels
 * are only visible where a secondary fbm value exceeds `river_cutoff`;
 * everything else is fully transparent so the rock layer below shows through.
 *
 * The lava color is modulated by a distance-to-light value that creates
 * hotter (brighter) and cooler (darker) zones within each crack.
 *
 * Port of LavaRivers.gdshader.
 */
export const LAVA_RIVERS_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float rotation;
uniform vec2  light_origin;
uniform float time_speed;
uniform float light_border_1;
uniform float light_border_2;
uniform float river_cutoff;
uniform vec4  colors[3];
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
  vec2 i=floor(coord), f=fract(coord);
  float a=rand(i),b=rand(i+vec2(1,0)),c=rand(i+vec2(0,1)),d=rand(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 coord) {
  float v=0.0,s=0.5;
  for(int i=0;i<OCTAVES;i++){v+=noise(coord)*s;coord*=2.0;s*=0.5;}
  return v;
}
vec2 spherify(vec2 uv) {
  vec2 c=uv*2.0-1.0; float z2=1.0-dot(c,c);
  if(z2<0.0) return uv;
  return (c/(sqrt(z2)+1.0))*0.5+0.5;
}
vec2 rotate(vec2 coord, float angle) {
  coord-=0.5; coord*=mat2(vec2(cos(angle),-sin(angle)),vec2(sin(angle),cos(angle))); return coord+0.5;
}
void main() {
  vec2 uv = floor(UV * pixels) / pixels;
  float d_light  = distance(uv, light_origin);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  if (a < 0.5) { fragColor = vec4(0.0); return; }
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  float fbm1      = fbm(uv * size + vec2(time * time_speed, 0.0));
  float river_fbm = fbm(uv + fbm1 * 2.5);
  d_light = pow(d_light, 2.0) * 0.4;
  d_light -= d_light * river_fbm;
  river_fbm = step(river_cutoff, river_fbm);
  vec4 col = colors[0];
  if (d_light > light_border_1) col = colors[1];
  if (d_light > light_border_2) col = colors[2];
  fragColor = vec4(col.rgb, a * river_fbm * col.a);
}`;
