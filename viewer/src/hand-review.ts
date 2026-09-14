import { Bone, Box3, Object3D, Vector3 } from "three";

/** Explicit diagnostic crop; never substitutes for full-scene validation. */
export function handReviewBounds(root: Object3D, side: "L" | "R"): Box3 {
  root.updateWorldMatrix(true, true);
  const prefix = `J_Bip_${side}_`;
  const required = new Set(["Hand", "Thumb1", "Index1", "Middle1", "Ring1", "Little1"]);
  const bounds = new Box3();
  const point = new Vector3();
  root.traverse((object) => {
    if (!(object instanceof Bone) || !object.name.startsWith(prefix)) return;
    const suffix = object.name.slice(prefix.length);
    if (!/^(Hand|(?:Thumb|Index|Middle|Ring|Little)\d+(?:_end)?)$/.test(suffix)) return;
    required.delete(suffix);
    bounds.expandByPoint(object.getWorldPosition(point));
  });
  if (required.size || bounds.isEmpty()) {
    throw new Error(`Hand review requires wrist and all five digit chains: ${[...required].join(", ")}`);
  }
  const size = bounds.getSize(new Vector3());
  const extent = Math.max(...size.toArray()) * 1.45;
  if (!Number.isFinite(extent) || extent <= 0) throw new Error("Degenerate hand review bounds");
  return bounds.setFromCenterAndSize(bounds.getCenter(new Vector3()), new Vector3(extent, extent, extent));
}
