import { chromium } from "playwright-core";

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument near ${name ?? "end of argv"}`);
    }
    values.set(name.slice(2), value);
  }
  for (const required of ["url", "browser", "screenshot"]) {
    if (!values.has(required)) throw new Error(`missing --${required}`);
  }
  return values;
}

function assertReport(report, minimumGeneration) {
  if (report?.status === "error") throw new Error(`viewer rejected the asset: ${report.error}`);
  if (!report || report.protocol_version !== 1 || report.status !== "ready") {
    throw new Error("viewer did not publish a ready protocol-v1 report");
  }
  if (report.generation < minimumGeneration) throw new Error("viewer generation did not advance");
  if (!/^[0-9a-f]{64}$/.test(report.asset_sha256 ?? "")) {
    throw new Error("viewer did not hash the loaded GLB");
  }
  const scene = report.scene;
  if (!scene || scene.meshes < 1 || scene.triangles < 1 || scene.materials < 1) {
    throw new Error("Three.js did not instantiate renderable scene content");
  }
  if (
    scene.dimensions_m.length !== 3 ||
    scene.dimensions_m.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error("Three.js scene bounds are empty or non-finite");
  }
  const rendering = report.rendering;
  if (
    !rendering ||
    !rendering.webgl_version.startsWith("WebGL ") ||
    rendering.drawing_buffer_width < 1 ||
    rendering.drawing_buffer_height < 1 ||
    rendering.render_calls < 1 ||
    rendering.rendered_triangles < scene.triangles ||
    rendering.sampled_pixels < 1 ||
    rendering.distinct_colors < 2
  ) {
    throw new Error(
      `WebGL did not produce a non-uniform rendered frame: ${JSON.stringify({ scene, rendering })}`,
    );
  }
}

async function capturePreview(browser, page, outputPath) {
  await page.addStyleTag({
    content: `
      .topbar, .inspector, .viewport-hint, .axis-labels, .drop-target { display: none !important; }
      #app { display: block !important; }
      .workspace, .viewport { display: block !important; width: 512px !important; height: 512px !important; }
    `,
  });
  await page.setViewportSize({ width: 512, height: 512 });
  await page.evaluate(() => window.__ASSET_FORGE_CAPTURE_MODE__());
  const captures = [];
  const previewViews = ["front", "side", "back", "isometric"];
  for (const view of previewViews) {
    await page.evaluate((selected) => window.__ASSET_FORGE_CAPTURE_VIEW__(selected), view);
    captures.push((await page.locator("#scene").screenshot()).toString("base64"));
  }
  const sheet = await browser.newPage({ viewport: { width: 2048, height: 512 }, deviceScaleFactor: 1 });
  await sheet.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { display: flex; width: 2048px; height: 512px; margin: 0; overflow: hidden; background: #111417; }
      figure { position: relative; width: 512px; height: 512px; margin: 0; }
      img { display: block; width: 512px; height: 512px; }
      figcaption { position: absolute; left: 16px; bottom: 14px; padding: 5px 8px; border: 1px solid #ffffff22; color: #dbe8f1; background: #0c0f12cc; font: 600 12px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; }
    </style>
    ${previewViews
      .map(
        (label, index) =>
          `<figure><img src="data:image/png;base64,${captures[index]}"><figcaption>${label}</figcaption></figure>`,
      )
      .join("")}
  `);
  await sheet.screenshot({ path: outputPath });
  await sheet.close();
}

async function run() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const browser = await chromium.launch({
    executablePath: argumentsByName.get("browser"),
    headless: true,
    args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"],
  });
  const browserConsoleErrors = [];
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on("console", (message) => {
      if (message.type() === "error") browserConsoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(argumentsByName.get("url"), {
      waitUntil: "networkidle",
      timeout: 20_000,
    });
    if (!response?.ok()) throw new Error(`viewer navigation failed: HTTP ${response?.status()}`);
    await page.waitForFunction(
      () => {
        const report = window.__ASSET_FORGE_VIEWER_REPORT__;
        return report?.status === "error" || (report?.status === "ready" && report.generation >= 1);
      },
      undefined,
      { timeout: 20_000 },
    );
    const initialReport = await page.evaluate(() => window.__ASSET_FORGE_VIEWER_REPORT__);
    // Keep a diagnostic preview even when the pixel evidence rejects the frame.
    await capturePreview(browser, page, argumentsByName.get("screenshot"));
    assertReport(initialReport, 1);

    let reload = null;
    const advanceUrl = argumentsByName.get("advance-url");
    if (advanceUrl) {
      const previousGeneration = initialReport.generation;
      const previousSha256 = initialReport.asset_sha256;
      const advanceResponse = await page.evaluate(async (url) => {
        const result = await fetch(url, { cache: "no-store" });
        return { ok: result.ok, status: result.status };
      }, advanceUrl);
      if (!advanceResponse.ok) {
        throw new Error(`fixture advance failed: HTTP ${advanceResponse.status}`);
      }
      await page.waitForFunction(
        ({ generation, sha256 }) => {
          const report = window.__ASSET_FORGE_VIEWER_REPORT__;
          return (
            report?.status === "error" || (report?.status === "ready" &&
            report.generation > generation &&
            report.asset_sha256 !== sha256)
          );
        },
        { generation: previousGeneration, sha256: previousSha256 },
        { timeout: 20_000 },
      );
      const finalReport = await page.evaluate(() => window.__ASSET_FORGE_VIEWER_REPORT__);
      assertReport(finalReport, previousGeneration + 1);
      reload = {
        previous_generation: previousGeneration,
        previous_sha256: previousSha256,
        final_report: finalReport,
      };
    }

    if (browserConsoleErrors.length || pageErrors.length) {
      throw new Error(
        `browser errors: ${JSON.stringify({ browserConsoleErrors, pageErrors })}`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({
        protocol_version: 1,
        initial_report: initialReport,
        reload,
        browser_console_errors: browserConsoleErrors,
        page_errors: pageErrors,
      })}\n`,
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
