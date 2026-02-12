/**
 * NeuronWaves - Cognitive Loop Engine
 * 
 * PR#2: Planning, Memory Adaptation, and Policy Gate Integration
 * 
 * Exports:
 * - Types and interfaces
 * - Planner implementations
 * - CoreMemories adapter
 * - Orchestrator loop
 */

// Types
export type {
  AutonomyLevel,
  PolicyDecision,
  PolicyDecisionKind,
  ContextBundle,
  ToolCapability,
  Observation,
  PlanStep,
  PlanGraph,
  ApprovalRequest,
  ApprovalResponse,
  StepStatus,
  StepExecutionState,
  PlanExecutionState,
  ExecutionLog,
  OrchestratorConfig,
  PolicyEvaluationRequest,
  PolicyGate,
  PolicyRules,
  CustomPolicyRule,
  MemoryEntry,
  MemoryAdapter,
  Planner,
  PlanFeedback,
  ErrorInfo,
} from "./types.js";

// Planning
export { createHeuristicPlanner, type HeuristicPlannerConfig } from "./planning/planner.js";

// Memory
export { createCoreMemoriesAdapter, type CoreMemoriesAdapter, type AdapterConfig } from "./memory/adapter-corememories.js";

// Orchestrator
export { runNeuronWavesLoop, type OrchestratorConfig, type OrchestratorDeps, type LoopResult } from "./orchestrator/loop.js";

// Convenience wrapper
import { runNeuronWavesLoop } from "./orchestrator/loop.js";
import { createHeuristicPlanner } from "./planning/planner.js";
import { createCoreMemoriesAdapter } from "./memory/adapter-corememories.js";
import type { Observation, AutonomyLevel } from "./types.js";

export interface RunNeuronWavesOptions {
  sessionKey: string;
  workspaceDir: string;
  text: string;
  autonomy: AutonomyLevel;
  source?: string;
}

export async function runNeuronWaves(options: RunNeuronWavesOptions) {
  const planner = createHeuristicPlanner();
  const memoryAdapter = await createCoreMemoriesAdapter({
    memoryDir: `${options.workspaceDir}/.openclaw/memory`,
    workspaceDir: options.workspaceDir,
    sessionKey: options.sessionKey,
  });

  const observation: Observation = {
    description: options.text,
    type: "user_request",
    timestamp: new Date().toISOString(),
    source: options.source || "user",
    priority: 0.5,
  };

  return runNeuronWavesLoop(
    {
      workspaceDir: options.workspaceDir,
      sessionKey: options.sessionKey,
      autonomy: options.autonomy,
      maxConcurrent: 1,
      approvalTimeoutMs: null,
      pollIntervalMs: 100,
    },
    { planner, memoryAdapter },
    observation
  );
}
