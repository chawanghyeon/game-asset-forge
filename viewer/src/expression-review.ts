import type { Object3D } from "three";

export const EXPRESSION_TARGETS = {
  "soft-smile": "Warden_Smile_Soft",
  blink: "Face_Blendshape.Fcl_EYE_Close",
  "open-mouth": "Face_Blendshape.Fcl_MTH_A",
} as const;

export type ReviewExpression = "neutral" | keyof typeof EXPRESSION_TARGETS;

export interface ExpressionReviewReport {
  readonly selected: ReviewExpression;
  readonly appliedPrimitiveCount: number;
  readonly available: Readonly<Record<ReviewExpression, boolean>>;
}

interface MorphPrimitive {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
}

interface PrimitiveBinding {
  readonly primitive: MorphPrimitive;
  readonly baseline: ReadonlyMap<number, number>;
  readonly targetIndices: Readonly<Partial<Record<keyof typeof EXPRESSION_TARGETS, number>>>;
}

/** Controls only explicitly supported review morphs and retains their imported baseline. */
export class ExpressionReviewController {
  readonly available: Readonly<Record<ReviewExpression, boolean>>;
  private readonly bindings: PrimitiveBinding[] = [];
  private selected: ReviewExpression = "neutral";
  private appliedPrimitiveCount = 0;

  constructor(root: Object3D) {
    const supportedCounts: Record<keyof typeof EXPRESSION_TARGETS, number> = {
      "soft-smile": 0,
      blink: 0,
      "open-mouth": 0,
    };
    root.traverse((object) => {
      const primitive = object as Object3D & MorphPrimitive;
      const dictionary = primitive.morphTargetDictionary;
      const influences = primitive.morphTargetInfluences;
      if (!dictionary || !influences) return;

      const baseline = new Map<number, number>();
      const targetIndices: Partial<Record<keyof typeof EXPRESSION_TARGETS, number>> = {};
      for (const [expression, targetName] of Object.entries(EXPRESSION_TARGETS) as
        [keyof typeof EXPRESSION_TARGETS, string][]) {
        const index = dictionary[targetName];
        if (!Number.isInteger(index) || index < 0 || index >= influences.length) continue;
        baseline.set(index, influences[index]!);
        targetIndices[expression] = index;
        supportedCounts[expression] += 1;
      }
      if (baseline.size > 0) this.bindings.push({ primitive, baseline, targetIndices });
    });
    this.available = Object.freeze({
      neutral: true,
      "soft-smile": supportedCounts["soft-smile"] > 0,
      blink: supportedCounts.blink > 0,
      "open-mouth": supportedCounts["open-mouth"] > 0,
    });
  }

  select(expression: ReviewExpression): ExpressionReviewReport {
    if (!this.available[expression]) {
      throw new Error(`Expression is unavailable: ${expression}`);
    }
    this.restoreControlledBaselines();
    let appliedPrimitiveCount = 0;
    if (expression !== "neutral") {
      for (const { primitive, targetIndices } of this.bindings) {
        const index = targetIndices[expression];
        if (index === undefined || !primitive.morphTargetInfluences) continue;
        primitive.morphTargetInfluences[index] = 1;
        appliedPrimitiveCount += 1;
      }
    }
    this.selected = expression;
    this.appliedPrimitiveCount = appliedPrimitiveCount;
    return this.report();
  }

  reset(): ExpressionReviewReport {
    return this.select("neutral");
  }

  report(): ExpressionReviewReport {
    return Object.freeze({
      selected: this.selected,
      appliedPrimitiveCount: this.appliedPrimitiveCount,
      available: this.available,
    });
  }

  private restoreControlledBaselines(): void {
    for (const { primitive, baseline } of this.bindings) {
      const influences = primitive.morphTargetInfluences;
      if (!influences) continue;
      for (const [index, value] of baseline) influences[index] = value;
    }
  }
}
