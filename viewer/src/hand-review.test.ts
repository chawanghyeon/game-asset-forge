import { describe, expect, it } from "vitest";
import { Bone, Group, Vector3 } from "three";
import { handReviewBounds } from "./hand-review";

function fixture() {
  const root = new Group();
  for (const side of ["L", "R"]) {
    ["Hand", "Thumb1", "Index1", "Middle1", "Ring1", "Little1", "Index3_end"].forEach((name, index) => {
      const bone = new Bone(); bone.name = `J_Bip_${side}_${name}`;
      bone.position.set((side === "L" ? 1 : -1) * (0.6 + index * 0.02), 1.4, index * 0.005);
      root.add(bone);
    });
  }
  return root;
}

describe("hand review crop", () => {
  it("uses current world transforms and includes the selected fingertips", () => {
    const root = fixture(); root.position.set(2, 3, 4); root.scale.setScalar(2);
    const box = handReviewBounds(root, "L");
    for (const object of root.children.filter(o => o.name.startsWith("J_Bip_L_"))) {
      expect(box.containsPoint(object.getWorldPosition(new Vector3()))).toBe(true);
    }
    expect(box.containsPoint(root.children.find(o => o.name === "J_Bip_R_Hand")!.getWorldPosition(new Vector3()))).toBe(false);
  });
  it("fails visibly for missing digits instead of producing a misleading crop", () => {
    const root = fixture(); root.remove(root.children.find(o => o.name === "J_Bip_L_Thumb1")!);
    expect(() => handReviewBounds(root, "L")).toThrow("Thumb1");
  });
  it("rejects collapsed skeleton coordinates", () => {
    const root = fixture(); root.children.forEach(o => o.position.set(0, 0, 0));
    expect(() => handReviewBounds(root, "L")).toThrow("Degenerate");
  });
});
