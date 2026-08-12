/**
 * Black hole body shader — dark sphere with a thin glowing rim.
 *
 * The black hole is rendered on a 3× oversize canvas (canvasScale=3) so the
 * accretion ring has room to spread far outside the sphere. This shader
 * handles only the dark disc itself; the ring is a separate draw call.
 *
 * UV remapping: the body should occupy the center third of the 3× canvas.
 * The `uv_offset` and `uv_scale` uniforms map the full UV space into the
 * center sub-region before sampling:
 *   mapped = (UV - uv_offset) * uv_scale
 * where uv_offset = (canvasScale-1)/(2*canvasScale) and uv_scale = canvasScale.
 * Pixels outside [0,1] in mapped space are discarded (fully transparent).
 *
 * colors[0] = core (near-black)
 * colors[1] = inner glow ring
 * colors[2] = bright outer rim (hottest / most light-bent region)
 *
 * Port of BlackHole.gdshader.
 */
export const BH_BODY_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform vec4  colors[3];
uniform float radius;       // disc radius in UV space (≈ 0.247)
uniform float light_width;  // width of the glowing rim band (≈ 0.028)
uniform float uv_offset;    // = (canvasScale-1) / (2*canvasScale)
uniform float uv_scale;     // = canvasScale
in  vec2 UV;
layout(location=0) out vec4 fragColor;

void main() {
  // Remap UV into the center 1/canvasScale region of the oversized canvas
  vec2 mapped = (UV - uv_offset) * uv_scale;
  if (any(lessThan(mapped, vec2(0.0))) || any(greaterThan(mapped, vec2(1.0)))) {
    fragColor = vec4(0.0); return;
  }
  vec2 uv = floor(mapped * pixels) / pixels;
  float d = distance(uv, vec2(0.5));
  vec4 col = colors[0];
  if (d > radius - light_width)         col = colors[1];
  if (d > radius - light_width * 0.5)   col = colors[2];
  fragColor = vec4(col.rgb, step(d, radius) * col.a);
}`;
