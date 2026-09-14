import { describe, expect, it } from "vitest";

import { measureModelPixels } from "./render-evidence";

describe("whole-view model evidence", () => {
  it("accepts a flat object surrounded by background even when its center is uniform", () => {
    const baseline = new Uint8Array(32 * 32 * 4);
    for (let offset = 3; offset < baseline.length; offset += 4) baseline[offset] = 255;
    const frame = baseline.slice();
    for (let y = 4; y < 28; y += 1) {
      for (let x = 8; x < 24; x += 1) frame.set([200, 200, 200, 255], (y * 32 + x) * 4);
    }
    expect(measureModelPixels(frame, baseline)).toEqual({ sampledPixels: 1024, distinctColors: 2 });
  });

  it("rejects invisible content even against a varied background", () => {
    const background = new Uint8Array([20, 30, 40, 255, 21, 31, 41, 255]);
    expect(() => measureModelPixels(background, background.slice())).toThrow("no visible pixels");
  });

  it.each([
    [new Uint8Array(), new Uint8Array()],
    [new Uint8Array(3), new Uint8Array(3)],
    [new Uint8Array(8), new Uint8Array(4)],
  ])("rejects malformed probe buffers", (frame, baseline) => {
    expect(() => measureModelPixels(frame, baseline)).toThrow("matching, non-empty RGBA");
  });

  it("counts all four color channels without signed integer collisions", () => {
    const frame = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 254, 0, 255, 0, 255]);
    expect(measureModelPixels(frame, new Uint8Array(12))).toEqual({
      sampledPixels: 3, distinctColors: 3,
    });
  });
});
