import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

import { ExpressionReviewController } from "./expression-review";

function primitive(
  dictionary: Record<string, number>,
  influences: number[],
): Mesh {
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  mesh.morphTargetDictionary = dictionary;
  mesh.morphTargetInfluences = influences;
  return mesh;
}

describe("expression review controls", () => {
  it("applies an exact target across every matching primitive", () => {
    const root = new Group();
    const first = primitive({ Warden_Smile_Soft: 0 }, [0]);
    const second = primitive({ Warden_Smile_Soft: 1 }, [0.4, 0]);
    root.add(first, second);

    const report = new ExpressionReviewController(root).select("soft-smile");

    expect(first.morphTargetInfluences).toEqual([1]);
    expect(second.morphTargetInfluences).toEqual([0.4, 1]);
    expect(report).toMatchObject({ selected: "soft-smile", appliedPrimitiveCount: 2 });
  });

  it("marks a missing exact target unavailable without falling back to joy", () => {
    const root = new Group();
    const face = primitive({ "Face_Blendshape.Fcl_ALL_Joy": 0 }, [0.35]);
    root.add(face);

    const controls = new ExpressionReviewController(root);

    expect(controls.available["soft-smile"]).toBe(false);
    expect(() => controls.select("soft-smile")).toThrow("unavailable");
    expect(face.morphTargetInfluences).toEqual([0.35]);
  });

  it("ignores an invalid mixed-target index on a primitive bound for another expression", () => {
    const root = new Group();
    const malformed = primitive(
      { Warden_Smile_Soft: 3, "Face_Blendshape.Fcl_EYE_Close": 0 },
      [0],
    );
    const validSmile = primitive({ Warden_Smile_Soft: 0 }, [0]);
    root.add(malformed, validSmile);

    const report = new ExpressionReviewController(root).select("soft-smile");

    expect(malformed.morphTargetInfluences).toEqual([0]);
    expect(Object.hasOwn(malformed.morphTargetInfluences!, "3")).toBe(false);
    expect(validSmile.morphTargetInfluences).toEqual([1]);
    expect(report.appliedPrimitiveCount).toBe(1);
  });

  it("restores imported controlled values when returning to neutral", () => {
    const root = new Group();
    const face = primitive(
      { Warden_Smile_Soft: 0, "Face_Blendshape.Fcl_EYE_Close": 1 },
      [0.2, 0.15],
    );
    root.add(face);
    const controls = new ExpressionReviewController(root);

    controls.select("soft-smile");
    controls.select("blink");
    const report = controls.reset();

    expect(face.morphTargetInfluences).toEqual([0.2, 0.15]);
    expect(report).toMatchObject({ selected: "neutral", appliedPrimitiveCount: 0 });
  });

  it("switches open mouth with smile and blink while retaining imported and unrelated weights", () => {
    const root = new Group();
    const face = primitive(
      {
        Warden_Smile_Soft: 0,
        "Face_Blendshape.Fcl_EYE_Close": 1,
        "Face_Blendshape.Fcl_MTH_A": 2,
        Unrelated_Custom_Morph: 3,
      },
      [0.2, 0.15, 0.35, 0.72],
    );
    const mouthOnly = primitive({ "Face_Blendshape.Fcl_MTH_A": 1 }, [0.4, 0.25]);
    root.add(face, mouthOnly);
    const controls = new ExpressionReviewController(root);

    expect(controls.available["open-mouth"]).toBe(true);
    controls.select("soft-smile");
    expect(face.morphTargetInfluences).toEqual([1, 0.15, 0.35, 0.72]);

    const mouthReport = controls.select("open-mouth");
    expect(mouthReport).toMatchObject({ selected: "open-mouth", appliedPrimitiveCount: 2 });
    expect(face.morphTargetInfluences).toEqual([0.2, 0.15, 1, 0.72]);
    expect(mouthOnly.morphTargetInfluences).toEqual([0.4, 1]);

    controls.select("blink");
    expect(face.morphTargetInfluences).toEqual([0.2, 1, 0.35, 0.72]);
    expect(mouthOnly.morphTargetInfluences).toEqual([0.4, 0.25]);

    controls.select("open-mouth");
    face.morphTargetInfluences![3] = 0.61;
    controls.reset();
    expect(face.morphTargetInfluences).toEqual([0.2, 0.15, 0.35, 0.61]);
    expect(mouthOnly.morphTargetInfluences).toEqual([0.4, 0.25]);
  });

  it("does not offer open mouth for another phoneme or an angry mouth target", () => {
    const root = new Group();
    const face = primitive(
      { "Face_Blendshape.Fcl_MTH_O": 0, "Face_Blendshape.Fcl_MTH_Angry": 1 },
      [0.3, 0.45],
    );
    root.add(face);
    const controls = new ExpressionReviewController(root);

    expect(controls.available["open-mouth"]).toBe(false);
    expect(() => controls.select("open-mouth")).toThrow("unavailable");
    expect(face.morphTargetInfluences).toEqual([0.3, 0.45]);
  });

  it("does not change unrelated morph influences across selections", () => {
    const root = new Group();
    const face = primitive(
      { Warden_Smile_Soft: 0, Unrelated_Custom_Morph: 1 },
      [0, 0.72],
    );
    root.add(face);
    const controls = new ExpressionReviewController(root);

    controls.select("soft-smile");
    face.morphTargetInfluences![1] = 0.61;
    controls.reset();

    expect(face.morphTargetInfluences).toEqual([0, 0.61]);
  });
});
