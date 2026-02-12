#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const HASH_FILE = path.join(rootDir, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = path.join(rootDir, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(rootDir, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = path.join(rootDir, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

const INPUT_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  "vendor/a2ui/renderers/lit",
  "apps/shared/OpenClawKit/Tools/CanvasA2UI",
];

// Docker builds exclude vendor/apps via .dockerignore.
// In that environment we can keep a prebuilt bundle only if it exists.
if (!existsSync(A2UI_RENDERER_DIR) || !existsSync(A2UI_APP_DIR)) {
  if (existsSync(OUTPUT_FILE)) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    process.exit(0);
  }
  console.error(`A2UI sources missing and no prebuilt bundle found at: ${OUTPUT_FILE}`);
  process.exit(1);
}

// Compute hash
let currentHash;
try {
  const hashScript = path.join(__dirname, "compute-a2ui-hash.mjs");
  // Quote each input path to handle spaces properly
  const quotedInputs = INPUT_PATHS.map(p => `"${p}"`).join(" ");
  currentHash = execSync(`node "${hashScript}" ${quotedInputs}`, {
    cwd: rootDir,
    encoding: "utf-8",
  }).trim();
} catch (err) {
  console.error("Failed to compute A2UI hash:", err.message);
  process.exit(1);
}

// Check if we need to rebuild
if (existsSync(HASH_FILE)) {
  try {
    const previousHash = await fs.readFile(HASH_FILE, "utf-8");
    if (previousHash === currentHash && existsSync(OUTPUT_FILE)) {
      console.log("A2UI bundle up to date; skipping.");
      process.exit(0);
    }
  } catch (err) {
    console.error("Failed to read hash file:", err.message);
    process.exit(1);
  }
}

// Bundle A2UI
try {
  console.log("Bundling A2UI...");

  // Compile TypeScript
  execSync(`pnpm -s exec tsc -p "${A2UI_RENDERER_DIR}/tsconfig.json"`, {
    cwd: rootDir,
    stdio: "inherit",
  });

  // Bundle with rolldown
  execSync(`rolldown -c "${A2UI_APP_DIR}/rolldown.config.mjs"`, {
    cwd: rootDir,
    stdio: "inherit",
  });

  // Write hash file
  await fs.writeFile(HASH_FILE, currentHash, "utf-8");

  console.log("A2UI bundle complete.");
} catch (err) {
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
  process.exit(1);
}
