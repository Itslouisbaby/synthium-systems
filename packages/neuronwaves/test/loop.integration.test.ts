import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNeuronWavesLoop } from "../src/orchestrator/loop.js";
import type { AutonomyConfig } from "../src/types/autonomy.js";

describe("NeuronWaves loop integration", () => {
  it("creates artifacts under workspace", async () => {
    const ws = await mkdtemp(join(tmpdir(), "neuronwaves-"));
    const autonomy: AutonomyConfig = {
      level: 1,
      requireApproval: true,
      allow: { tools: [], domains: [], contacts: [], folders: [], channels: [] },
      deny: { tools: [], domains: [], actions: [] },
      limits: { maxActionsPerRun: 5, maxToolCallsPerRun: 10 },
    };

    const res = await runNeuronWavesLoop({
      sessionKey: "test-session",
      workspaceDir: ws,
      channel: "test",
      text: "Create a plan and record it locally",
      autonomy,
    });

    expect(res.snapshot.workspaceDir).toBe(ws);

    const root = join(ws, ".openclaw", "neuronwaves");
    const observations = await readFile(join(root, "observations.jsonl"), "utf8");
    const plans = await readFile(join(root, "plans.jsonl"), "utf8");
    const evals = await readFile(join(root, "evaluations.jsonl"), "utf8");
    const auditActions = await readFile(join(root, "audit", "actions.jsonl"), "utf8");
    const state = await readFile(join(root, "state", "active.json"), "utf8");

    expect(observations.trim().length).toBeGreaterThan(0);
    expect(plans.trim().length).toBeGreaterThan(0);
    expect(evals.trim().length).toBeGreaterThan(0);
    expect(auditActions.trim().length).toBeGreaterThan(0);
    expect(state.trim().length).toBeGreaterThan(0);
  });
});
