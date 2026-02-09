import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { runLoop } from "../src/orchestrator/loop.js";

async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("NeuronWaves loop", () => {
  it("writes all artifacts", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "neuronwaves-"));

    await runLoop({
      input: { message: "Draft a quick reply", source: "test" },
      policy: { tier: 1 },
      workspaceDir,
    });

    const root = path.join(workspaceDir, ".openclaw", "neuronwaves");
    const files = {
      observations: path.join(root, "observations.jsonl"),
      plans: path.join(root, "plans.jsonl"),
      evaluations: path.join(root, "evaluations.jsonl"),
      audit: path.join(root, "audit", "actions.jsonl"),
      state: path.join(root, "state", "active.json"),
    };

    for (const filePath of Object.values(files)) {
      expect(await exists(filePath)).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });
});
