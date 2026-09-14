import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { formatBytes, inspectScene } from "./metrics";

describe("inspectScene", () => {
  it("counts rendered triangles, meshes, unique materials, and world dimensions", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), material));
    const second = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    second.position.x = 2;
    root.add(second);

    const result = inspectScene(root);

    expect(result.triangles).toBe(14);
    expect(result.meshes).toBe(2);
    expect(result.materials).toBe(1);
    expect(result.dimensions.toArray()).toEqual([3.5, 4, 6]);
  });

  it("returns zero dimensions for an empty scene", () => {
    expect(inspectScene(new THREE.Group()).dimensions.length()).toBe(0);
  });

  it("measures active morph weights instead of the envelope of every possible expression", () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6);
    const position = geometry.getAttribute("position");
    const deltas = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i += 1) {
      deltas[i * 3] = position.getX(i) > 0 ? 10 : 0;
    }
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(deltas, 3)];
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(3, 2, 1);
    mesh.scale.set(2, 1, 1);
    geometry.computeBoundingBox();

    expect(inspectScene(mesh).dimensions.toArray()).toEqual([4, 4, 6]);
    mesh.morphTargetInfluences![0] = 0.5;
    expect(inspectScene(mesh).dimensions.toArray()).toEqual([14, 4, 6]);
    mesh.morphTargetInfluences![0] = 1;
    expect(inspectScene(mesh).dimensions.toArray()).toEqual([24, 4, 6]);
    mesh.morphTargetInfluences![0] = 0;
    expect(inspectScene(mesh).dimensions.toArray()).toEqual([4, 4, 6]);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [2048, "2.0 KB"],
    [2 * 1024 * 1024, "2.0 MB"],
  ])("formats %d bytes", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
