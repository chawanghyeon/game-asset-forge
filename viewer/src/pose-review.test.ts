import { Bone, Group, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PoseReviewController } from "./pose-review";

function rig() {
  const root = new Group();
  const neck = new Bone(); neck.name = "J_Bip_C_Neck"; neck.position.set(0, 1, 0);
  const head = new Bone(); head.name = "J_Bip_C_Head"; head.position.set(0, .3, 0);
  const tip = new Object3D(); tip.position.set(.1, .2, .3);
  root.add(neck); neck.add(head); head.add(tip);
  return { root, neck, head, tip };
}

describe("pose review controls", () => {
  it("rotates about the actual world pivot under rotated and uniformly scaled parents", () => {
    const { root, head, tip } = rig();
    root.position.set(2, 3, -1); root.rotation.set(.2, .4, -.1); root.scale.setScalar(1.8);
    head.rotation.set(.2, -.3, .1);
    const controller = new PoseReviewController(root);
    const pivot = head.getWorldPosition(new Vector3());
    const initial = tip.getWorldPosition(new Vector3());
    const expected = initial.clone().sub(pivot).applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 10).add(pivot);
    controller.select("head-turn");
    expect(tip.getWorldPosition(new Vector3()).distanceTo(expected)).toBeLessThan(1e-12);
    expect(head.getWorldPosition(new Vector3()).distanceTo(pivot)).toBeLessThan(1e-12);
  });

  it("restores imported transforms exactly and does not accumulate successive poses", () => {
    const { root, head, neck, tip } = rig();
    head.rotation.set(.12, -.08, .22);
    const controller = new PoseReviewController(root);
    const baseline = head.quaternion.toArray();
    const initial = tip.getWorldPosition(new Vector3());
    controller.select("head-turn"); controller.select("neck-nod"); controller.select("head-turn");
    controller.reset();
    expect(head.quaternion.toArray()).toEqual(baseline);
    expect(neck.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(tip.getWorldPosition(new Vector3()).distanceTo(initial)).toBe(0);
  });

  it("rejects missing, ambiguous and non-bone names without changing the current pose", () => {
    const { root, head } = rig();
    const fake = new Object3D(); fake.name = "WARDEN_Ponytail"; root.add(fake);
    const controller = new PoseReviewController(root);
    controller.select("head-nod"); const before = head.quaternion.toArray();
    expect(() => controller.select("tail-swing")).toThrow("unavailable");
    expect(head.quaternion.toArray()).toEqual(before);
    const duplicate = new Bone(); duplicate.name = head.name; root.add(duplicate);
    expect(new PoseReviewController(root).available["head-turn"]).toBe(false);
    expect(new PoseReviewController(new Group()).available["neck-nod"]).toBe(false);
  });

  it("does not touch expressions or unrelated bones", () => {
    const { root } = rig();
    const arm = new Bone(); arm.rotation.x = .37; root.add(arm);
    const face = new Object3D() as Object3D & { morphTargetInfluences: number[] };
    face.morphTargetInfluences = [.5, .2]; root.add(face);
    const controller = new PoseReviewController(root);
    controller.select("head-nod"); controller.reset();
    expect(arm.rotation.x).toBe(.37);
    expect(face.morphTargetInfluences).toEqual([.5, .2]);
  });

  it("does not offer world rotation under nonuniform parent scaling", () => {
    const { root } = rig(); root.scale.set(1, 2, 1);
    const controller = new PoseReviewController(root);
    expect(controller.available["head-turn"]).toBe(false);
    expect(controller.available.neutral).toBe(true);
  });
});
