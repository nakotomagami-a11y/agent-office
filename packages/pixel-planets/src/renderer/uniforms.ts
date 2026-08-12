/**
 * Uniform upload helpers.
 *
 * WebGL requires a separate call for each uniform type. These small helpers
 * centralise the type dispatch and handle missing locations gracefully
 * (getUniformLocation returns null for inactive uniforms).
 */

/**
 * Set a float or vec2 uniform. vec4 arrays are uploaded via the flat path.
 * - number    → uniform1f
 * - [x, y]   → uniform2f
 * - number[]  → uniform4fv (for colors[] arrays)
 */
export function setUniform(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  name: string,
  value: number | number[],
): void {
  const loc = gl.getUniformLocation(prog, name);
  if (loc === null) return;
  if (typeof value === "number") {
    gl.uniform1f(loc, value);
  } else if (value.length === 2) {
    gl.uniform2f(loc, value[0]!, value[1]!);
  } else {
    gl.uniform4fv(loc, value);
  }
}

/** Set an integer uniform (used for OCTAVES, should_dither). */
export function setUniformInt(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  name: string,
  value: number,
): void {
  const loc = gl.getUniformLocation(prog, name);
  if (loc !== null) gl.uniform1i(loc, value);
}
