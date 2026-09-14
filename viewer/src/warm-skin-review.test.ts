import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { WarmSkinReviewMaterials } from "./warm-skin-review";

describe("warm skin review materials", () => {
  it("clones only the two exact skin materials and restores original assignments", () => {
    const bodySkin = new THREE.MeshStandardMaterial({ name: "Body_00_SKIN" });
    const faceSkin = new THREE.MeshStandardMaterial({ name: "Face_00_SKIN__UVTransferredPaint_v3" });
    const nearMatch = new THREE.MeshStandardMaterial({ name: "Body_00_SKIN_extra" });
    const cloth = new THREE.MeshStandardMaterial({ name: "Tops_01_CLOTH" });
    const body = new THREE.Mesh(new THREE.BoxGeometry(), [bodySkin, cloth]);
    const face = new THREE.Mesh(new THREE.BoxGeometry(), faceSkin);
    const other = new THREE.Mesh(new THREE.BoxGeometry(), nearMatch);
    const root = new THREE.Group();
    root.add(body, face, other);
    const originalBodyAssignment = body.material;

    const review = new WarmSkinReviewMaterials(root);
    const convertedBody = body.material as THREE.Material[];
    const convertedFace = face.material as THREE.MeshStandardMaterial;

    expect(convertedBody[0]).not.toBe(bodySkin);
    expect(convertedBody[1]).toBe(cloth);
    expect(convertedFace).not.toBe(faceSkin);
    expect(convertedFace.toneMapped).toBe(false);
    expect(other.material).toBe(nearMatch);
    expect(review.convertedMaterialNames).toEqual([
      "Body_00_SKIN",
      "Face_00_SKIN__UVTransferredPaint_v3",
    ]);

    const disposeBody = vi.spyOn(convertedBody[0]!, "dispose");
    const disposeFace = vi.spyOn(convertedFace, "dispose");
    review.restore();

    expect(body.material).toBe(originalBodyAssignment);
    expect(face.material).toBe(faceSkin);
    expect(disposeBody).toHaveBeenCalledOnce();
    expect(disposeFace).toHaveBeenCalledOnce();
  });

  it("guards the shader include and installs the fixed chromatic normal response", () => {
    const skin = new THREE.MeshStandardMaterial({ name: "Body_00_SKIN" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), skin);
    const review = new WarmSkinReviewMaterials(mesh);
    const converted = mesh.material as THREE.MeshStandardMaterial;
    const uniforms: Record<string, THREE.IUniform> = {};
    const shader = { fragmentShader: "void main() {\n#include <opaque_fragment>\n}", uniforms };

    converted.onBeforeCompile(shader as never, {} as never);

    expect(shader.fragmentShader).toContain("uniform vec3 worldLightDirection;");
    expect(shader.fragmentShader).toContain("outgoingLight = diffuseColor.rgb * mix(");
    expect(shader.fragmentShader).toContain("viewMatrix * vec4(worldLightDirection, 0.)");
    const direction = uniforms.worldLightDirection?.value as THREE.Vector3;
    const expected = new THREE.Vector3(-3, 4, 5).normalize();
    expect(direction.x).toBeCloseTo(expected.x);
    expect(direction.y).toBeCloseTo(expected.y);
    expect(direction.z).toBeCloseTo(expected.z);
    expect(() => converted.onBeforeCompile(
      { fragmentShader: "void main() {}", uniforms: {} } as never,
      {} as never,
    )).toThrow("missing opaque_fragment");
    review.restore();
  });
});
