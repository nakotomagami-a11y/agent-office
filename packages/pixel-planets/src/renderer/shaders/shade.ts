/**
 * Spherical shading overlay.
 *
 * A generic depth pass composited LAST over solid-sphere planet types. It
 * reconstructs the sphere normal from screen UV, lights it from `light_origin`,
 * and paints a dark, posterized terminator crescent on the unlit hemisphere
 * plus limb darkening at the grazing edge. This is what makes a planet read as
 * a lit 3D ball instead of a flat textured disc — the surface shaders only
 * band the palette colours, which is often too subtle to sell the sphere.
 *
 * Output is a near-black straight-alpha overlay (RGB≈0, alpha ramps up in
 * shadow), so SRC_ALPHA blending simply darkens whatever surface is beneath —
 * palette-independent. Alpha is stepped into a few bands so the terminator has
 * the chunky pixel-art edge of the rest of the set rather than a smooth gradient.
 *
 * Disc-clipped and canvasScale-aware (uv_offset/uv_scale) so it lines up with
 * the shrunk body on 2× types (gas-giant, ringed-terran).
 */
export const SHADE_FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;

uniform float pixels;
uniform vec2  light_origin;
uniform float shade_strength;
uniform float uv_offset;   // disc remap (0 when canvasScale=1)
uniform float uv_scale;    // = 1/(2*planetR)
in  vec2 UV;
layout(location=0) out vec4 fragColor;

void main() {
  vec2 uv_raw = floor(UV * pixels) / pixels;
  vec2 uv = (uv_raw - uv_offset) * uv_scale;

  vec2 c = (uv - 0.5) * 2.0;    // -1..1 across the disc
  float r2 = dot(c, c);
  if (r2 > 1.0) { fragColor = vec4(0.0); return; }   // outside the sphere

  // Reconstruct the sphere surface normal and light it.
  float z = sqrt(1.0 - r2);
  vec3 N = vec3(c, z);
  vec2 l2 = (light_origin - 0.5) * 2.0;
  vec3 L = normalize(vec3(l2, 0.7));                  // light from upper-left, toward viewer
  float ndl = dot(normalize(N), L);

  // Shadow rises smoothly across a wide terminator so the unlit hemisphere
  // fades in as a soft crescent rather than a hard band.
  float shadow = smoothstep(0.7, -0.75, ndl);
  // Limb darkening is masked by the shadow so it only deepens the already-dark
  // side — without the mask it wraps the whole disc and reads as a ring.
  float limb   = smoothstep(0.55, 1.0, sqrt(r2)) * shadow * 0.3;
  float a = shadow * shade_strength + limb;

  // Fine posterization — enough steps to snap to the pixel grid while still
  // reading as a smooth gradient instead of chunky concentric rings.
  a = floor(clamp(a, 0.0, 0.62) * 8.0 + 0.5) / 8.0;
  if (a <= 0.001) { fragColor = vec4(0.0); return; }

  fragColor = vec4(0.01, 0.01, 0.03, a);   // near-black, faintly cool
}`;
