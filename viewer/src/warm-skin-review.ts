import * as THREE from "three";

export const WARM_SKIN_MATERIAL_NAMES = Object.freeze([
  "Body_00_SKIN",
  "Face_00_SKIN__UVTransferredPaint_v3",
] as const);

export const WARM_SKIN_WORLD_LIGHT_DIRECTION = new THREE.Vector3(-3, 4, 5).normalize();

const OPAQUE_FRAGMENT_INCLUDE = "#include <opaque_fragment>";
const WARM_SKIN_FRAGMENT = `outgoingLight = diffuseColor.rgb * mix(
  vec3(.68, .42, .40),
  vec3(1.),
  smoothstep(-.25, .35, dot(normal, normalize((viewMatrix * vec4(worldLightDirection, 0.)).xyz)))
);
${OPAQUE_FRAGMENT_INCLUDE}`;

/** Applies the fixed reference-face skin control and retains exact material assignments for cleanup. */
export class WarmSkinReviewMaterials {
  readonly convertedMaterialNames: readonly string[];

  private readonly assignments = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly clones = new Set<THREE.MeshStandardMaterial>();
  private active = true;

  constructor(
    root: THREE.Object3D,
    worldLightDirection = WARM_SKIN_WORLD_LIGHT_DIRECTION,
  ) {
    const selectedNames = new Set<string>(WARM_SKIN_MATERIAL_NAMES);
    const direction = worldLightDirection.clone();
    if (direction.lengthSq() === 0 || !direction.toArray().every(Number.isFinite)) {
      throw new Error("Warm-skin light direction must be finite and non-zero");
    }
    direction.normalize();

    const replacements = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const convert = (material: THREE.Material): THREE.Material => {
      if (!selectedNames.has(material.name)) return material;
      const existing = replacements.get(material);
      if (existing) return existing;
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        throw new Error(`Warm-skin material must be MeshStandardMaterial: ${material.name}`);
      }
      const clone = material.clone();
      clone.toneMapped = false;
      clone.onBeforeCompile = (shader) => {
        if (!shader.fragmentShader.includes(OPAQUE_FRAGMENT_INCLUDE)) {
          throw new Error("Three.js MeshStandard shader is missing opaque_fragment");
        }
        shader.uniforms.worldLightDirection = { value: direction };
        shader.fragmentShader = `uniform vec3 worldLightDirection;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
          OPAQUE_FRAGMENT_INCLUDE,
          WARM_SKIN_FRAGMENT,
        );
      };
      clone.customProgramCacheKey = () => "warm-skin-review-v1";
      clone.needsUpdate = true;
      replacements.set(material, clone);
      this.clones.add(clone);
      return clone;
    };

    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      let converted: THREE.Material | THREE.Material[];
      let changed: boolean;
      if (Array.isArray(original)) {
        converted = original.map(convert);
        changed = converted.some((material, index) => material !== original[index]);
      } else {
        converted = convert(original);
        changed = converted !== original;
      }
      if (!changed) return;
      this.assignments.set(object, original);
      object.material = converted;
    });
    this.convertedMaterialNames = Object.freeze(
      [...replacements.keys()].map((material) => material.name),
    );
  }

  restore(): void {
    if (!this.active) return;
    for (const [mesh, material] of this.assignments) mesh.material = material;
    for (const clone of this.clones) clone.dispose();
    this.assignments.clear();
    this.clones.clear();
    this.active = false;
  }
}
