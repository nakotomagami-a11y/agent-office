/**
 * Star surface shader — Voronoi cell noise mapped onto a sphere.
 *
 * Renders the visible star disc using Worley / Voronoi noise (nearest-point
 * distance), which naturally creates the granulated, convective-cell texture
 * seen on real stars. Two Cells() samples are multiplied together to break
 * the obvious hex-grid pattern.
 *
 * Like the black-hole body shader, this renders in the CENTER HALF of a 2×
 * canvas. UV remapping via `uv_offset` and `uv_scale` maps the full [0,1]
 * UV range to the center half before sphere-mapping:
 *   mapped = (UV - uv_offset) * uv_scale
 * where uv_offset = 0.25 and uv_scale = 2.0 for a 2× canvas.
 * Pixels outside the center region are discarded (transparent).
 *
 * Port of Star.gdshader.
 */
export const STAR_MAIN_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform float time_speed;
uniform float rotation;
uniform vec4  colors[4];   // bright core → mid → dim → dark limb
uniform int   should_dither;
uniform float size;
uniform float seed;
uniform float time;
uniform float uv_offset;   // = (canvasScale-1) / (2*canvasScale)
uniform float uv_scale;    // = canvasScale
in  vec2 UV;
layout(location=0) out vec4 fragColor;

// Voronoi / Worley noise: returns distance to nearest random feature point.
// Hash2 maps grid cells to 2D feature-point offsets in [0,1]².
vec2 Hash2(vec2 p) {
  float r = 523.0 * sin(dot(p, vec2(53.3158, 43.6143)));
  return vec2(fract(15.32354 * r), fract(17.25865 * r));
}
float Cells(vec2 p, float numCells) {
  p *= numCells;
  float d = 1.0e10;
  for (int xo = -1; xo <= 1; xo++) {
    for (int yo = -1; yo <= 1; yo++) {
      vec2 tp = floor(p) + vec2(float(xo), float(yo));
      tp = p - tp - Hash2(mod(tp, numCells));
      d = min(d, dot(tp, tp));
    }
  }
  return sqrt(d);
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0/pixels) <= 1.0/pixels;
}
vec2 rotate(vec2 v, float angle) {
  v -= 0.5;
  v *= mat2(vec2(cos(angle),-sin(angle)), vec2(sin(angle),cos(angle)));
  return v + 0.5;
}
vec2 spherify(vec2 uv) {
  vec2 c = uv*2.0-1.0; float z2=1.0-dot(c,c);
  if (z2 < 0.0) return uv;
  return (c/(sqrt(z2)+1.0))*0.5+0.5;
}
void main() {
  // Map UV into center sub-region of the oversized canvas
  vec2 mapped = (UV - uv_offset) * uv_scale;
  if (any(lessThan(mapped, vec2(0.0))) || any(greaterThan(mapped, vec2(1.0)))) {
    fragColor = vec4(0.0); return;
  }
  vec2 pix  = floor(mapped * pixels) / pixels;
  float a   = step(distance(pix, vec2(0.5)), 0.49999);
  bool dith = dither(mapped, pix);
  pix = rotate(pix, rotation);
  pix = spherify(pix);
  // Two Cells samples at different frequencies, multiplied to break hex symmetry
  float n = Cells(pix - vec2(time * time_speed * 2.0, 0.0), 10.0);
  n *= Cells(pix - vec2(time * time_speed * 1.0, 0.0), 20.0);
  n *= 2.0;
  n = clamp(n, 0.0, 1.0);
  if (dith || should_dither == 0) n *= 1.3;
  // Map noise to one of 4 color bands
  float interp = floor(n * 3.0) / 3.0;
  vec4 col = colors[int(clamp(interp * 3.0, 0.0, 3.0))];
  fragColor = vec4(col.rgb, a * col.a);
}`;
