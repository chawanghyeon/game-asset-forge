import { Bone, Matrix4, Object3D, Quaternion, Vector3 } from "three";

const POSES = {
  "head-turn": { bone: "J_Bip_C_Head", axis: new Vector3(0, 1, 0), degrees: 18 },
  "head-nod": { bone: "J_Bip_C_Head", axis: new Vector3(1, 0, 0), degrees: 12 },
  "neck-nod": { bone: "J_Bip_C_Neck", axis: new Vector3(1, 0, 0), degrees: 10 },
  "tail-swing": { bone: "WARDEN_Ponytail", axis: new Vector3(1, 0, 0), degrees: 12 },
} as const;

export type ReviewPose = "neutral" | keyof typeof POSES;
export interface PoseReviewReport {
  readonly selected: ReviewPose;
  readonly appliedBoneCount: number;
  readonly available: Readonly<Record<ReviewPose, boolean>>;
}

interface Binding {
  bone: Bone;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  matrix: Matrix4;
}

/** Explicit, bounded review poses in glTF world axes; not an animation/retargeting system. */
export class PoseReviewController {
  readonly available: Readonly<Record<ReviewPose, boolean>>;
  private readonly bindings = new Map<string, Binding>();
  private selected: ReviewPose = "neutral";

  constructor(private readonly root: Object3D) {
    root.updateWorldMatrix(true, true);
    for (const name of new Set(Object.values(POSES).map((pose) => pose.bone))) {
      const matches: Bone[] = [];
      root.traverse((object) => {
        if (object instanceof Bone && object.name === name) matches.push(object);
      });
      const bone = matches.length === 1 ? matches[0] : undefined;
      if (!bone || !bone.matrixAutoUpdate) continue;
      // Rotating under a nonuniformly scaled parent can introduce unrepresentable shear.
      const scale = new Vector3();
      (bone.parent?.matrixWorld ?? new Matrix4()).decompose(new Vector3(), new Quaternion(), scale);
      if (Math.min(scale.x, scale.y, scale.z) <= 0 ||
          Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 1e-6) continue;
      this.bindings.set(name, {
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(), matrix: bone.matrix.clone(),
      });
    }
    this.available = Object.freeze({ neutral: true,
      "head-turn": this.bindings.has(POSES["head-turn"].bone),
      "head-nod": this.bindings.has(POSES["head-nod"].bone),
      "neck-nod": this.bindings.has(POSES["neck-nod"].bone),
      "tail-swing": this.bindings.has(POSES["tail-swing"].bone),
    });
  }

  select(pose: ReviewPose): PoseReviewReport {
    if (!this.available[pose]) throw new Error(`Pose is unavailable: ${pose}`);
    for (const binding of this.bindings.values()) {
      binding.bone.position.copy(binding.position);
      binding.bone.quaternion.copy(binding.quaternion);
      binding.bone.scale.copy(binding.scale);
      binding.bone.matrix.copy(binding.matrix);
    }
    this.root.updateWorldMatrix(true, true);
    if (pose !== "neutral") {
      const definition = POSES[pose];
      const bone = this.bindings.get(definition.bone)!.bone;
      const pivot = new Vector3().setFromMatrixPosition(bone.matrixWorld);
      const delta = new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(new Matrix4().makeRotationAxis(definition.axis, definition.degrees * Math.PI / 180))
        .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
      const local = (bone.parent?.matrixWorld.clone() ?? new Matrix4()).invert()
        .multiply(delta).multiply(bone.matrixWorld);
      local.decompose(bone.position, bone.quaternion, bone.scale);
      this.root.updateWorldMatrix(true, true);
    }
    this.selected = pose;
    return this.report();
  }

  reset(): PoseReviewReport { return this.select("neutral"); }

  report(): PoseReviewReport {
    return Object.freeze({ selected: this.selected,
      appliedBoneCount: this.selected === "neutral" ? 0 : 1, available: this.available });
  }
}
