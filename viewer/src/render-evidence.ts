/** Compare a whole-view probe with the same view without the asset. */
export function measureModelPixels(pixels: Uint8Array, baseline: Uint8Array): {
  sampledPixels: number;
  distinctColors: number;
} {
  if (!pixels.length || pixels.length % 4 !== 0 || baseline.length !== pixels.length) {
    throw new Error("Render probes must contain matching, non-empty RGBA buffers");
  }
  const colors = new Set<number>();
  let visiblePixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    colors.add(
      ((pixels[offset]! << 24) | (pixels[offset + 1]! << 16) |
        (pixels[offset + 2]! << 8) | pixels[offset + 3]!) >>> 0,
    );
    if (
      pixels[offset] !== baseline[offset] || pixels[offset + 1] !== baseline[offset + 1] ||
      pixels[offset + 2] !== baseline[offset + 2] || pixels[offset + 3] !== baseline[offset + 3]
    ) visiblePixels += 1;
  }
  if (!visiblePixels) throw new Error("Model contributes no visible pixels to the rendered frame");
  return { sampledPixels: pixels.length / 4, distinctColors: colors.size };
}
