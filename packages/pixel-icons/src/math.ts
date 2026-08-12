/**
 * 2D vector + bounds primitives and small math helpers.
 *
 * Ported from the original Icon Machine `Vector`/`Bounds` classes. `Vector`
 * instances also carry ad-hoc fields (widthL, normal, dist, …) attached by the
 * generators; those live in {@link CorePoint}.
 */

export class Vector {
  x: number;
  y: number;

  constructor(x?: number | Vector, y?: number) {
    if (y === undefined) {
      if (x === undefined) {
        this.x = 0;
        this.y = 0;
      } else {
        const v = x as Vector;
        this.x = v.x;
        this.y = v.y;
      }
    } else {
      this.x = x as number;
      this.y = y;
    }
  }

  normalize(): this {
    const length = this.length();
    this.x /= length;
    this.y /= length;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  distanceTo(x: number, y: number): number {
    return Math.sqrt(this.distanceToSq(x, y));
  }

  distanceToSq(x: number | Vector, y?: number): number {
    let dx: number;
    let dy: number;
    if (y === undefined) {
      const v = x as Vector;
      dx = this.x - v.x;
      dy = this.y - v.y;
    } else {
      dx = this.x - (x as number);
      dy = this.y - y;
    }
    return dx * dx + dy * dy;
  }

  addVector(v: Vector): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  lerpTo(v: Vector, t: number): this {
    this.x = (v.x - this.x) * t + this.x;
    this.y = (v.y - this.y) * t + this.y;
    return this;
  }

  multiplyScalar(v: number): this {
    this.x *= v;
    this.y *= v;
    return this;
  }

  dotProduct(x: number, y: number): number {
    return this.x * x + this.y * y;
  }

  set(x: number | Vector, y?: number): this {
    if (y === undefined) {
      const v = x as Vector;
      this.x = v.x;
      this.y = v.y;
    } else {
      this.x = x as number;
      this.y = y;
    }
    return this;
  }
}

/**
 * Control point along a generated stroke. Extends {@link Vector} position with
 * the per-point fields the drawing loops read back. Fields are assigned by the
 * generators immediately after construction.
 */
export class CorePoint extends Vector {
  widthL = 0;
  widthR = 0;
  widthT = 0;
  widthB = 0;
  normal!: Vector;
  forward!: Vector;
  dist = 0;
  normalizedDist = 0;
}

export class Bounds {
  x: number;
  y: number;
  w: number;
  h: number;

  constructor(x?: number | Bounds, y?: number, w?: number, h?: number) {
    if (y === undefined) {
      if (x === undefined) {
        this.x = 0;
        this.y = 0;
        this.w = 0;
        this.h = 0;
      } else {
        const b = x as Bounds;
        this.x = b.x;
        this.y = b.y;
        this.w = b.w;
        this.h = b.h;
      }
    } else {
      this.x = x as number;
      this.y = y;
      this.w = w as number;
      this.h = h as number;
    }
  }

  contains(v: Vector): boolean {
    return v.x >= this.x && v.y >= this.y && v.x < this.x + this.w && v.y < this.y + this.h;
  }
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(val, min));
}

export function floatLerp(a: number, b: number, t: number): number {
  return (b - a) * t + a;
}

/** Convert a diagonal distance to an orthogonal bottom-left-anchored position. */
export function diagToPosition(diag: number, bounds: Bounds): Vector {
  const ortho = Math.floor(diag / Math.sqrt(2));
  return new Vector(ortho, bounds.h - 1 - ortho);
}
