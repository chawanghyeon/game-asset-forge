import * as THREE from "three";

export type CaptureView = "front" | "side" | "back" | "isometric";

export function cameraDirection(view: CaptureView, horizontal = false): THREE.Vector3 {
  const directions: Record<CaptureView, readonly [number, number, number]> = {
    front: [0, 0.2, 1],
    side: [1, 0.2, 0],
    back: [0, 0.2, -1],
    isometric: [0.8, 0.55, 1],
  };
  const direction = new THREE.Vector3(...directions[view]);
  if (horizontal && view !== "isometric") direction.y = 0;
  return direction.normalize();
}
