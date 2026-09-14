import "./style.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { formatBytes, inspectScene, type SceneMetrics } from "./metrics";
import { measureModelPixels } from "./render-evidence";
import { handReviewBounds } from "./hand-review";
import { cameraDirection, type CaptureView } from "./views";
import { WarmSkinReviewMaterials } from "./warm-skin-review";
import {
  ExpressionReviewController,
  type ExpressionReviewReport,
  type ReviewExpression,
} from "./expression-review";
import { PoseReviewController, type PoseReviewReport, type ReviewPose } from "./pose-review";

type ViewerStatus = "loading" | "ready" | "error";

interface ViewerReport {
  protocol_version: 1;
  status: ViewerStatus;
  generation: number;
  asset_name: string | null;
  asset_sha256: string | null;
  source_signature: string | null;
  byte_size: number | null;
  scene: {
    triangles: number;
    materials: number;
    meshes: number;
    dimensions_m: [number, number, number];
  } | null;
  rendering: {
    webgl_version: "WebGL 1" | "WebGL 2";
    renderer: string;
    vendor: string;
    drawing_buffer_width: number;
    drawing_buffer_height: number;
    render_calls: number;
    rendered_triangles: number;
    sampled_pixels: number;
    distinct_colors: number;
  } | null;
  error: string | null;
}

declare global {
  interface Window {
    __ASSET_FORGE_VIEWER_REPORT__: ViewerReport;
    __ASSET_FORGE_CAPTURE_VIEW__: (view: CaptureView) => void;
    __ASSET_FORGE_CAPTURE_MODE__: () => void;
    readonly __ASSET_FORGE_EXPRESSION_REPORT__: ExpressionReviewReport;
    readonly __ASSET_FORGE_POSE_REPORT__: PoseReviewReport;
  }
}

const canvas = required<HTMLCanvasElement>("scene");
const viewport = required<HTMLElement>("viewport");
const fileInput = required<HTMLInputElement>("file-input");
const dropTarget = required<HTMLElement>("drop-target");
const reloadButton = required<HTMLButtonElement>("reload");
const expressionSelector = required<HTMLSelectElement>("expression-selector");
const poseSelector = required<HTMLSelectElement>("pose-selector");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const lightingMode = new URLSearchParams(location.search).get("lighting");
const referenceColorReview = lightingMode === "reference-colors";
const warmSkinReviewMode = lightingMode === "warm-skin-review";
const paintReview = lightingMode === "paint-review" || warmSkinReviewMode;
renderer.toneMapping = paintReview ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = paintReview ? 2 ** 0.4 : 1.05;
renderer.shadowMap.enabled = new URLSearchParams(location.search).get("shadows") !== "off";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const outlineEffect = new OutlineEffect(renderer, {
  defaultThickness: 0.0032,
  defaultColor: [0.012, 0.018, 0.045],
  defaultAlpha: 1,
  defaultKeepAlive: true,
});
const toonGradient = new THREE.DataTexture(
  new Uint8Array([46, 112, 190, 255]),
  4,
  1,
  THREE.RedFormat,
);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.generateMipmaps = false;
toonGradient.needsUpdate = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181d);
const environmentGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
environmentGenerator.dispose();
scene.add(new THREE.HemisphereLight(0xc9dcff, 0x261d16, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.camera.left = -3;
keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.radius = 3;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x57a5ff, 1.4);
rimLight.position.set(-5, 3, -4);
scene.add(rimLight);
const frontFill = new THREE.DirectionalLight(0xffe2c4, 1.7);
frontFill.position.set(-1, 3, -5);
scene.add(frontFill);
if (lightingMode === "portrait" || paintReview) {
  const { RectAreaLightUniformsLib } = await import("three/examples/jsm/lights/RectAreaLightUniformsLib.js");
  for (const child of [...scene.children]) {
    if ((child as THREE.Light).isLight) scene.remove(child);
  }
  const energyScale = paintReview ? 0.25 : 1;
  scene.environmentIntensity = 0.65 * energyScale;
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, energyScale));
  const portraitKey = new THREE.RectAreaLight(0xfff6ef, 3.0 * energyScale, 4, 4);
  portraitKey.position.set(-3, 4, 5);
  portraitKey.lookAt(0, 0.7, 0);
  scene.add(portraitKey);
  const portraitFill = new THREE.RectAreaLight(0xe8efff, 1.2 * energyScale, 4, 4);
  portraitFill.position.set(3, 2, 4);
  portraitFill.lookAt(0, 0.7, 0);
  scene.add(portraitFill);
}

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
camera.position.set(2.7, 2.1, 3.2);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.screenSpacePanning = true;
controls.addEventListener("change", render);

const grid = new THREE.GridHelper(12, 24, 0x44515c, 0x252b30);
grid.position.y = 0.001;
scene.add(grid);
const axes = new THREE.AxesHelper(0.65);
scene.add(axes);
const shadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.2 }),
);
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

let model: THREE.Object3D | null = null;
let boundsHelper: THREE.Box3Helper | null = null;
let sourceUrl: string | null = null;
let sourceSignature: string | null = null;
let wireframe = false;
let outline = false;
let generation = 0;
let expressionReview: ExpressionReviewController | null = null;
let poseReview: PoseReviewController | null = null;
let poseReport = new PoseReviewController(new THREE.Group()).report();
let warmSkinReview: WarmSkinReviewMaterials | null = null;
let expressionReport: ExpressionReviewReport = Object.freeze({
  selected: "neutral",
  appliedPrimitiveCount: 0,
  available: Object.freeze({ neutral: true, "soft-smile": false, blink: false, "open-mouth": false }),
});

Object.defineProperty(window, "__ASSET_FORGE_EXPRESSION_REPORT__", {
  configurable: false,
  get: () => expressionReport,
});
Object.defineProperty(window, "__ASSET_FORGE_POSE_REPORT__", {
  configurable: false,
  get: () => poseReport,
});

function updatePoseControls(report: PoseReviewReport): void {
  poseReport = report;
  poseSelector.value = report.selected;
  for (const option of poseSelector.options) {
    option.disabled = !report.available[option.value as ReviewPose];
  }
}

function updateExpressionControls(report: ExpressionReviewReport): void {
  expressionReport = report;
  expressionSelector.value = report.selected;
  for (const option of expressionSelector.options) {
    const expression = option.value as ReviewExpression;
    option.disabled = !report.available[expression];
  }
}

function publishReport(report: ViewerReport): void {
  window.__ASSET_FORGE_VIEWER_REPORT__ = report;
  window.dispatchEvent(new CustomEvent("asset-forge-viewer-report", { detail: report }));
}

publishReport({
  protocol_version: 1,
  status: "loading",
  generation,
  asset_name: null,
  asset_sha256: null,
  source_signature: null,
  byte_size: null,
  scene: null,
  rendering: null,
  error: null,
});

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element as T;
}

function render(): void {
  if (document.visibilityState === "hidden") return;
  if (outline) outlineEffect.render(scene, camera);
  else renderer.render(scene, camera);
}

function stylizeAnimeModel(root: THREE.Object3D): boolean {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const selected = Array.isArray(object.material) ? object.material : [object.material];
    selected.forEach((material) => materials.add(material));
  });
  const anime = Array.from(materials).some((material) =>
    material.name === "mat_hair");
  if (!anime) return false;

  const replacements = new Map<THREE.Material, THREE.Material>();
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    if (material.name === "mat_gold" || material.name === "mat_steel") continue;
    const toonMaterial = new THREE.MeshToonMaterial({
        name: material.name,
        color: material.color,
        map: material.map,
        normalMap: material.normalMap,
        normalScale: material.normalScale,
        gradientMap: toonGradient,
        opacity: material.opacity,
        transparent: material.transparent,
        alphaTest: material.alphaTest,
        side: material.side,
      });
    if (
      material.name === "mat_skin" ||
      material.name === "mat_blush" ||
      material.name === "mat_eye_white" ||
      material.name === "mat_iris" ||
      material.name === "mat_pupil" ||
      material.name === "mat_hair_highlight" ||
      material.name === "mat_cream"
    ) {
      toonMaterial.userData.outlineParameters = { visible: false };
    }
    replacements.set(material, toonMaterial);
  }
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => replacements.get(material) ?? material);
    } else {
      object.material = replacements.get(object.material) ?? object.material;
    }
  });
  return true;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

function setModel(
  next: THREE.Object3D,
  name: string,
  origin: string,
  bytes?: number,
): { metrics: SceneMetrics; rendering: NonNullable<ViewerReport["rendering"]> } {
  if (expressionReview) expressionReview.reset();
  if (poseReview) poseReview.reset();
  if (model) {
    warmSkinReview?.restore();
    warmSkinReview = null;
    scene.remove(model);
    disposeObject(model);
  }
  if (boundsHelper) scene.remove(boundsHelper);

  model = next;
  expressionReview = new ExpressionReviewController(model);
  updateExpressionControls(expressionReview.reset());
  poseReview = new PoseReviewController(model);
  updatePoseControls(poseReview.reset());
  outline = stylizeAnimeModel(model);
  if (warmSkinReviewMode) warmSkinReview = new WarmSkinReviewMaterials(model);
  const outlineToggle = required<HTMLButtonElement>("toggle-outline");
  outlineToggle.classList.toggle("active", outline);
  outlineToggle.setAttribute("aria-pressed", String(outline));
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (referenceColorReview) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        // Painted unlit colors already contain their intended shading.
        if (material instanceof THREE.MeshBasicMaterial) material.toneMapped = false;
      }
    }
  });
  scene.add(model);
  const metrics = inspectScene(model);
  boundsHelper = new THREE.Box3Helper(metrics.bounds, 0x5db0ff);
  boundsHelper.visible = required<HTMLButtonElement>("toggle-bounds").classList.contains("active");
  scene.add(boundsHelper);
  applyWireframe();
  updateInspector(name, origin, metrics, bytes);
  frameModel();
  return { metrics, rendering: captureRenderEvidence() };
}

function captureRenderEvidence(): NonNullable<ViewerReport["rendering"]> {
  // Measure the complete shaded mesh before the optional outline pass. OutlineEffect performs
  // another renderer pass and resets renderer.info, so reading only its final counters can make
  // selectively unoutlined face materials look as though they were never rendered.
  renderer.render(scene, camera);
  const baseRenderCalls = renderer.info.render.calls;
  const baseRenderedTriangles = renderer.info.render.triangles;
  let outlineRenderCalls = 0;
  let outlineRenderedTriangles = 0;
  if (outline) {
    outlineEffect.render(scene, camera);
    outlineRenderCalls = renderer.info.render.calls;
    outlineRenderedTriangles = renderer.info.render.triangles;
  }
  const context = renderer.getContext();
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  const sampleWidth = Math.min(32, width);
  const sampleHeight = Math.min(32, height);
  const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
  const baseline = new Uint8Array(pixels.length);
  // Sample the complete camera view at bounded resolution. A center patch can lie entirely
  // on a valid flat face. Exclude helpers and compare against an asset-hidden baseline so
  // the grid, floor, or background cannot stand in for visible asset content.
  if (!model) throw new Error("No model is available for render evidence");
  const decorations = [grid, axes, shadowFloor, ...(boundsHelper ? [boundsHelper] : [])];
  const visibility = decorations.map((object) => object.visible);
  const modelVisible = model.visible;
  const previousTarget = renderer.getRenderTarget();
  const target = new THREE.WebGLRenderTarget(sampleWidth, sampleHeight);
  try {
    decorations.forEach((object) => { object.visible = false; });
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, sampleWidth, sampleHeight, pixels);
    model.visible = false;
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, sampleWidth, sampleHeight, baseline);
  } finally {
    model.visible = modelVisible;
    decorations.forEach((object, index) => { object.visible = visibility[index]!; });
    renderer.setRenderTarget(previousTarget);
    target.dispose();
  }
  const measured = measureModelPixels(pixels, baseline);
  const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(
    context.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER),
  );
  const vendor = String(context.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR));
  return {
    webgl_version: renderer.capabilities.isWebGL2 ? "WebGL 2" : "WebGL 1",
    renderer: rendererName,
    vendor,
    drawing_buffer_width: width,
    drawing_buffer_height: height,
    render_calls: baseRenderCalls + outlineRenderCalls,
    rendered_triangles: baseRenderedTriangles + outlineRenderedTriangles,
    sampled_pixels: measured.sampledPixels,
    distinct_colors: measured.distinctColors,
  };
}

function updateInspector(
  name: string,
  origin: string,
  metrics: SceneMetrics,
  bytes?: number,
): void {
  required("asset-name").textContent = name.replace(/\.glb$/i, "");
  required("asset-origin").textContent = origin;
  required("triangles").textContent = metrics.triangles.toLocaleString("ko-KR");
  required("materials").textContent = metrics.materials.toString();
  required("meshes").textContent = metrics.meshes.toString();
  required("file-size").textContent = bytes === undefined ? "—" : formatBytes(bytes);
  required("dim-x").textContent = metrics.dimensions.x.toFixed(2);
  required("dim-y").textContent = metrics.dimensions.y.toFixed(2);
  required("dim-z").textContent = metrics.dimensions.z.toFixed(2);

  const finite = metrics.dimensions.toArray().every(Number.isFinite);
  const items = [
    [metrics.meshes > 0, "렌더 메시가 있습니다"],
    [metrics.triangles > 0, "삼각형을 계산했습니다"],
    [finite && !metrics.bounds.isEmpty(), "유한한 경계를 계산했습니다"],
  ] as const;
  required("checks-list").replaceChildren(
    ...items.map(([passed, label]) => {
      const item = document.createElement("li");
      item.className = passed ? "check-pass" : "check-fail";
      item.innerHTML = `<i aria-hidden="true"></i><span>${label}</span>`;
      return item;
    }),
  );
}

function frameModel(view: CaptureView = "isometric", requireFocus = false): void {
  if (!model) return;
  const bounds = new THREE.Box3().setFromObject(model, true);
  if (bounds.isEmpty()) return;
  // Review-only close-up: keep scene metrics and validation on the complete asset.
  const reviewFocus = new URLSearchParams(location.search).get("reviewFocus");
  if (requireFocus && (reviewFocus === "head" || reviewFocus === "face" || reviewFocus === "torso")) {
    const faceBounds = new THREE.Box3();
    model.traverse((object) => {
      // Multi-material glTF meshes load as a named Group with Mesh children.
      if (/(?:^|_)face(?:_\d+)?$/i.test(object.name)) {
        faceBounds.union(new THREE.Box3().setFromObject(object, true));
      }
    });
    if (faceBounds.isEmpty()) {
      // Startup frames the built-in sample before loading the requested character.
      throw new Error("character review requires an identifiable face mesh");
    } else {
      const center = reviewFocus !== "torso"
        ? faceBounds.getCenter(new THREE.Vector3())
        : bounds.getCenter(new THREE.Vector3());
      const height = bounds.max.y - bounds.min.y;
      if (reviewFocus === "torso") center.y = bounds.min.y + height * 0.59;
      const extent = reviewFocus !== "torso"
        ? Math.max(...faceBounds.getSize(new THREE.Vector3()).toArray()) * (reviewFocus === "face" ? 0.95 : 1.6)
        : height * 0.40;
      bounds.setFromCenterAndSize(center, new THREE.Vector3(extent, extent, extent));
    }
  }
  if (requireFocus && (reviewFocus === "left_hand" || reviewFocus === "right_hand")) {
    bounds.copy(handReviewBounds(model, reviewFocus === "left_hand" ? "L" : "R"));
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.1);
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.near = Math.max(radius / 100, 0.001);
  camera.far = Math.max(radius * 100, 100);
  camera.updateProjectionMatrix();
  const horizontalFaceView = requireFocus && reviewFocus === "face";
  camera.position.copy(sphere.center).add(cameraDirection(view, horizontalFaceView).multiplyScalar(distance));
  controls.target.copy(sphere.center);
  controls.update();
  render();
}

function setStatus(label: string, state: "ready" | "loading" | "error" = "ready"): void {
  const element = required("load-state");
  element.className = `load-state ${state}`;
  element.querySelector("span:last-child")!.textContent = label;
}

function reportLoading(label: string): void {
  setStatus(label, "loading");
  publishReport({
    protocol_version: 1,
    status: "loading",
    generation,
    asset_name: null,
    asset_sha256: null,
    source_signature: sourceSignature,
    byte_size: null,
    scene: null,
    rendering: null,
    error: null,
  });
}

function reportError(label: string, error: unknown): void {
  setStatus(label, "error");
  publishReport({
    protocol_version: 1,
    status: "error",
    generation,
    asset_name: null,
    asset_sha256: null,
    source_signature: sourceSignature,
    byte_size: null,
    scene: null,
    rendering: null,
    error: error instanceof Error ? error.message : String(error),
  });
}

function applyWireframe(): void {
  if (!model) return;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if ("wireframe" in material) {
        (material as THREE.MeshStandardMaterial).wireframe = wireframe;
        material.needsUpdate = true;
      }
    });
  });
  render();
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function parseGlb(buffer: ArrayBuffer, name: string, origin: string): Promise<void> {
  reportLoading("GLB 분석 중");
  const assetSha256 = await sha256(buffer);
  const gltf = await new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      "",
      resolve,
      (error) => {
        console.error(error);
        reportError("GLB를 열 수 없습니다", error);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
  const evidence = setModel(gltf.scene, name, origin, buffer.byteLength);
  generation += 1;
  setStatus("표시 준비됨");
  publishReport({
    protocol_version: 1,
    status: "ready",
    generation,
    asset_name: name,
    asset_sha256: assetSha256,
    source_signature: sourceSignature,
    byte_size: buffer.byteLength,
    scene: {
      triangles: evidence.metrics.triangles,
      materials: evidence.metrics.materials,
      meshes: evidence.metrics.meshes,
      dimensions_m: evidence.metrics.dimensions.toArray(),
    },
    rendering: evidence.rendering,
    error: null,
  });
}

async function loadUrl(url: string, isRefresh = false): Promise<void> {
  try {
    reportLoading(isRefresh ? "변경 불러오는 중" : "GLB 불러오는 중");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    sourceUrl = url;
    sourceSignature = [
      response.headers.get("etag"),
      response.headers.get("last-modified"),
      response.headers.get("content-length"),
    ].join("|");
    reloadButton.disabled = false;
    await parseGlb(
      buffer,
      decodeURIComponent(url.split("/").pop() || "asset.glb"),
      "빌드 출력 URL",
    );
  } catch (error) {
    console.error(error);
    if (window.__ASSET_FORGE_VIEWER_REPORT__.status !== "error") {
      reportError("GLB URL을 읽지 못했습니다", error);
    }
  }
}

async function pollSource(): Promise<void> {
  if (!sourceUrl || document.visibilityState === "hidden") return;
  try {
    const response = await fetch(sourceUrl, { method: "HEAD", cache: "no-store" });
    if (!response.ok) return;
    const signature = [
      response.headers.get("etag"),
      response.headers.get("last-modified"),
      response.headers.get("content-length"),
    ].join("|");
    if (sourceSignature && signature !== sourceSignature) await loadUrl(sourceUrl, true);
  } catch {
    // A transient local-server failure should not discard the current model.
  }
}

function makeDemoCrate(): THREE.Group {
  const crate = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8c5a32, roughness: 0.78, metalness: 0 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4e2f1d, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x30373b, roughness: 0.42, metalness: 0.78 });

  const core = new THREE.Mesh(new THREE.BoxGeometry(1, 0.78, 0.82), wood);
  core.position.y = 0.39;
  crate.add(core);
  for (const x of [-0.43, 0, 0.43]) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.84, 0.87), darkWood);
    plank.position.set(x, 0.42, 0);
    crate.add(plank);
  }
  for (const y of [0.16, 0.64]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.07, 0.86), metal);
    band.position.set(0, y, 0);
    crate.add(band);
  }
  crate.rotation.y = -0.16;
  return crate;
}

function bindToggle(id: string, update: (active: boolean) => void): void {
  const button = required<HTMLButtonElement>(id);
  button.addEventListener("click", () => {
    const active = !button.classList.contains("active");
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    update(active);
    render();
  });
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  sourceUrl = null;
  sourceSignature = null;
  reloadButton.disabled = true;
  void file.arrayBuffer().then((buffer) => parseGlb(buffer, file.name, "로컬 파일"))
    .catch((error: unknown) => reportError("GLB를 열 수 없습니다", error));
});

for (const event of ["dragenter", "dragover"] as const) {
  viewport.addEventListener(event, (incoming) => {
    incoming.preventDefault();
    dropTarget.classList.add("visible");
  });
}
for (const event of ["dragleave", "drop"] as const) {
  viewport.addEventListener(event, (incoming) => {
    incoming.preventDefault();
    dropTarget.classList.remove("visible");
  });
}
viewport.addEventListener("drop", (incoming) => {
  const file = incoming.dataTransfer?.files[0];
  if (!file || !file.name.toLowerCase().endsWith(".glb")) {
    reportError("GLB 파일만 열 수 있습니다", new Error("only GLB files are supported"));
    return;
  }
  sourceUrl = null;
  reloadButton.disabled = true;
  void file.arrayBuffer().then((buffer) => parseGlb(buffer, file.name, "드롭한 로컬 파일"))
    .catch((error: unknown) => reportError("GLB를 열 수 없습니다", error));
});

reloadButton.addEventListener("click", () => sourceUrl && void loadUrl(sourceUrl, true));
expressionSelector.addEventListener("change", () => {
  if (!expressionReview) return;
  updateExpressionControls(expressionReview.select(expressionSelector.value as ReviewExpression));
  render();
});
poseSelector.addEventListener("change", () => {
  if (!poseReview) return;
  updatePoseControls(poseReview.select(poseSelector.value as ReviewPose));
  render();
});
required("frame-model").addEventListener("click", () => frameModel());
window.__ASSET_FORGE_CAPTURE_VIEW__ = (view) => frameModel(view, true);
window.__ASSET_FORGE_CAPTURE_MODE__ = () => {
  grid.visible = false;
  axes.visible = false;
  if (boundsHelper) boundsHelper.visible = false;
  render();
};
bindToggle("toggle-grid", (active) => (grid.visible = active));
bindToggle("toggle-bounds", (active) => {
  if (boundsHelper) boundsHelper.visible = active;
});
bindToggle("toggle-wireframe", (active) => {
  wireframe = active;
  applyWireframe();
});
bindToggle("toggle-outline", (active) => {
  outline = active;
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f" && !(event.target instanceof HTMLInputElement)) frameModel();
});

new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  render();
}).observe(viewport);

const demoEvidence = setModel(makeDemoCrate(), "procedural_crate_preview", "뷰어 확인용 내장 샘플");
setStatus("표시 준비됨");
publishReport({
  protocol_version: 1,
  status: "ready",
  generation,
  asset_name: "procedural_crate_preview",
  asset_sha256: null,
  source_signature: null,
  byte_size: null,
  scene: {
    triangles: demoEvidence.metrics.triangles,
    materials: demoEvidence.metrics.materials,
    meshes: demoEvidence.metrics.meshes,
    dimensions_m: demoEvidence.metrics.dimensions.toArray(),
  },
  rendering: demoEvidence.rendering,
  error: null,
});
const requestedAsset = new URLSearchParams(window.location.search).get("asset");
if (requestedAsset) void loadUrl(requestedAsset);
window.setInterval(() => void pollSource(), 1500);
