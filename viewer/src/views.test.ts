import { describe, expect, it } from "vitest";

import { cameraDirection } from "./views";

describe("cameraDirection", () => {
  it("keeps front and back on opposite glTF Z sides", () => {
    expect(cameraDirection("front").z).toBeGreaterThan(0);
    expect(cameraDirection("back").z).toBeLessThan(0);
  });

  it("uses the character front side for the isometric review", () => {
    const direction = cameraDirection("isometric");
    expect(direction.x).toBeGreaterThan(0);
    expect(direction.z).toBeGreaterThan(0);
  });

  it("makes focused face cardinal views horizontal without changing isometric", () => {
    for (const view of ["front", "side", "back"] as const) {
      expect(cameraDirection(view, true).y).toBe(0);
      expect(cameraDirection(view).y).toBeGreaterThan(0);
    }
    expect(cameraDirection("isometric", true)).toEqual(cameraDirection("isometric"));
  });
});
