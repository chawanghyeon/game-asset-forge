import * as THREE from "three";

export interface SceneMetrics {
  triangles: number;
  meshes: number;
  materials: number;
  dimensions: THREE.Vector3;
  bounds: THREE.Box3;
}

export function inspectScene(root: THREE.Object3D): SceneMetrics {
  let triangles = 0;
  let meshes = 0;
  const materials = new Set<THREE.Material>();

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const geometry = object.geometry;
    triangles += geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor((geometry.getAttribute("position")?.count ?? 0) / 3);
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    assigned.forEach((material) => materials.add(material));
  });

  // Cached geometry bounds include inactive morph extremes. Measure the current pose.
  const bounds = new THREE.Box3().setFromObject(root, true);
  const dimensions = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
  return { triangles, meshes, materials: materials.size, dimensions, bounds };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
