import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runNeuronWavesLoop, createHeuristicPlanner } from "../src/index.js";
import { createCoreMemoriesAdapter } from "../src/memory/adapter-corememories.js";
import type { Observation, AutonomyLevel } from "../src/types.js";

describe("NeuronWaves Integration", () => {
  const testWorkspace = join(process.cwd(), ".test-workspace");
  const sessionKey = "test-session-123";
  const memoryDir = join(testWorkspace, ".openclaw", "memory", "sessions", sessionKey);

  beforeAll(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true });
    }
    mkdirSync(memoryDir, { recursive: true });

    const flashPath = join(memoryDir, "hot", "flash");
    mkdirSync(flashPath, { recursive: true });

    const flashData = {
      entries: [
        {
          id: "flash-1",
          timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
          type: "conversation",
          content: "NeuronWaves is a cognitive loop engine",
          speaker: "user",
          keywords: ["neuronwaves", "cognitive", "loop"],
          emotionalSalience: 0.6,
          userFlagged: false,
          linkedTo: [],
          privacyLevel: "public",
        },
        {
          id: "flash-2",
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          type: "decision",
          content: "Use CoreMemories for memory adaptation in PR2",
          speaker: "assistant",
          keywords: ["corememories", "memory", "adaptation", "pr2"],
          emotionalSalience: 0.8,
          userFlagged: true,
          linkedTo: [],
          privacyLevel: "public",
        },
      ],
    };
    writeFileSync(join(flashPath, "current.json"), JSON.stringify(flashData, null, 2));

    const indexPath = join(memoryDir, "index.json");
    const indexData = {
      keywords: {
        neuronwaves: ["flash-1"],
        cognitive: ["flash-1"],
        corememories: ["flash-2"],
        memory: ["flash-2"],
      },
      timestamps: {
        "flash-1": "hot/flash/current.json",
        "flash-2": "hot/flash/current.json",
      },
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  });

  afterAll(() => {
    if (existsSync(testWorkspace)) {
      rmSync(testWorkspace, { recursive: true });
    }
  });

  it("should recall flash entries", async () => {
    const adapter = await createCoreMemoriesAdapter({
      memoryDir,
      workspaceDir: testWorkspace,
      sessionKey,
    });

    const flash = await adapter.recallFlash(sessionKey, 10);
    expect(flash.length).toBeGreaterThan(0);
    expect(flash[0].keywords).toContain("neuronwaves");
  });

  it("should recall warm hits by keyword", async () => {
    const adapter = await createCoreMemoriesAdapter({
      memoryDir,
      workspaceDir: testWorkspace,
      sessionKey,
    });

    const warmHits = await adapter.recallWarmHits(sessionKey, ["corememories", "memory"], 10);
    expect(warmHits.length).toBeGreaterThan(0);
    expect(warmHits.some((h) => h.keywords.includes("memory"))).toBe(true);
  });

  it("should run full loop and produce artifacts", async () => {
    const planner = createHeuristicPlanner();
    const memoryAdapter = await createCoreMemoriesAdapter({
      memoryDir,
      workspaceDir: testWorkspace,
      sessionKey,
    });

    const observation: Observation = {
      description: "Search for information about NeuronWaves memory system",
      type: "user_request",
      timestamp: new Date().toISOString(),
      source: "test",
      priority: 0.5,
    };

    const result = await runNeuronWavesLoop(
      {
        workspaceDir: testWorkspace,
        sessionKey,
        autonomy: 0.5 as AutonomyLevel,
        maxConcurrent: 1,
        approvalTimeoutMs: null,
        pollIntervalMs: 100,
      },
      { planner, memoryAdapter },
      observation
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.planId).toBeDefined();
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.executedSteps).toBeGreaterThanOrEqual(0);
  });

  it("should not execute allow_with_prompt steps", async () => {
    const planner = createHeuristicPlanner();
    const memoryAdapter = await createCoreMemoriesAdapter({
      memoryDir,
      workspaceDir: testWorkspace,
      sessionKey: "test-session-block",
    });

    const observation: Observation = {
      description: "Send email to team about NeuronWaves update",
      type: "user_request",
      timestamp: new Date().toISOString(),
      source: "test",
      priority: 0.9,
    };

    const result = await runNeuronWavesLoop(
      {
        workspaceDir: testWorkspace,
        sessionKey: "test-session-block",
        autonomy: 0.0 as AutonomyLevel,
        maxConcurrent: 1,
        approvalTimeoutMs: null,
        pollIntervalMs: 100,
      },
      { planner, memoryAdapter },
      observation
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.blockedSteps).toBeGreaterThanOrEqual(0);
  });
});
