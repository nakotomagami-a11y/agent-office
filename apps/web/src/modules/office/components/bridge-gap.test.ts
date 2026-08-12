import { describe, expect, it } from "vitest";
import { bridgeGapValid, type DecorationsMap } from "./decorations";

const land = (w: number, h: number) => Array.from({ length: h }, () => Array.from({ length: w }, () => true));
const floors = (...keys: string[]): DecorationsMap =>
  Object.fromEntries(keys.map((k) => [k, [{ kind: "floor" as const }]]));

describe("bridgeGapValid", () => {
  const grid = land(5, 3);
  it("allows a horizontal bridge on a gap flanked by raised cells", () => {
    const deco = floors("0,1", "2,1"); // raised at x=0 and x=2, gap at x=1
    expect(bridgeGapValid("bridge_h", 1, 1, grid, deco)).toBe(true);
  });
  it("rejects on a raised cell itself", () => {
    const deco = floors("0,1", "1,1", "2,1");
    expect(bridgeGapValid("bridge_h", 1, 1, grid, deco)).toBe(false);
  });
  it("rejects a gap with no raised neighbour on the axis", () => {
    const deco = floors("1,0", "1,2"); // raised above/below, not left/right
    expect(bridgeGapValid("bridge_h", 1, 1, grid, deco)).toBe(false);
    expect(bridgeGapValid("bridge_v", 1, 1, grid, deco)).toBe(true); // vertical works
  });
  it("rejects a non-bridge kind", () => {
    expect(bridgeGapValid("tree", 1, 1, grid, floors("0,1", "2,1"))).toBe(false);
  });
});
