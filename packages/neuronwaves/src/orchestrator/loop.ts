import { nanoid } from "nanoid";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  Planner,
  PlanGraph,
  PolicyDecision,
  StepStatus,
  StepExecutionState,
  PlanExecutionState,
  ExecutionLog,
  Observation,
  ContextBundle,
  MemoryEntry,
  AutonomyLevel,
} from "../types.js";
import type { CoreMemoriesAdapter } from "../memory/adapter-corememories.js";

export interface OrchestratorConfig {
  workspaceDir: string;
  sessionKey: string;
  autonomy: AutonomyLevel;
  maxConcurrent: number;
  approvalTimeoutMs: number | null;
  pollIntervalMs: number;
}

export interface OrchestratorDeps {
  planner: Planner;
  memoryAdapter: CoreMemoriesAdapter;
}

export interface LoopResult {
  planId: string;
  executionId: string;
  status: "completed" | "failed" | "cancelled" | "awaiting_approval";
  executedSteps: number;
  failedSteps: number;
  blockedSteps: number;
  artifacts: string[];
  logs: ExecutionLog[];
}

interface InternalState {
  plan: PlanGraph;
  execution: PlanExecutionState;
  logs: ExecutionLog[];
  artifacts: string[];
}

const log = (logs: ExecutionLog[], level: ExecutionLog["level"], message: string, data?: Record<string, unknown>) => {
  logs.push({ level, message, data, timestamp: new Date().toISOString() });
};

const evaluatePolicy = (step: any, autonomy: AutonomyLevel): PolicyDecision => {
  const risk = step.requiresApproval ? 0.5 : 0.2;

  if (autonomy === 0.0 && step.requiresApproval) {
    return {
      kind: "block",
      action: step.action,
      riskScore: risk,
      reason: "Full manual mode requires explicit approval",
      timestamp: new Date().toISOString(),
    };
  }

  if (step.requiresApproval && autonomy < 0.5) {
    return {
      kind: "allow_with_prompt",
      action: step.action,
      riskScore: risk,
      reason: "Step requires approval in semi-autonomous mode",
      conditions: ["human_approval_required"],
      timestamp: new Date().toISOString(),
    };
  }

  return {
    kind: "allow",
    action: step.action,
    riskScore: risk,
    reason: "Approved within autonomy bounds",
    timestamp: new Date().toISOString(),
  };
};

const executeStep = async (
  step: any,
  policy: PolicyDecision,
  state: InternalState
): Promise<"success" | "failed" | "blocked" | "awaiting"> => {
  if (policy.kind === "block") {
    log(state.logs, "info", `Step ${step.id} blocked by policy`, { stepId: step.id, reason: policy.reason });
    return "blocked";
  }

  if (policy.kind === "allow_with_prompt") {
    log(state.logs, "info", `Step ${step.id} awaiting approval`, { stepId: step.id });
    return "awaiting";
  }

  log(state.logs, "info", `Executing step ${step.action}`, { stepId: step.id });

  try {
    await new Promise((r) => setTimeout(r, (step.estimatedDuration || 1) * 100));
    log(state.logs, "info", `Step ${step.id} completed`, { stepId: step.id });
    return "success";
  } catch (err) {
    log(state.logs, "error", `Step ${step.id} failed`, { stepId: step.id, error: String(err) });
    return "failed";
  }
};

const persistArtifacts = async (
  config: OrchestratorConfig,
  state: InternalState
): Promise<string[]> => {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactsDir = join(config.workspaceDir, ".openclaw", "neuronwaves", "artifacts", config.sessionKey);

  await mkdir(artifactsDir, { recursive: true });
  const artifacts: string[] = [];

  const planFile = join(artifactsDir, `${now}-plan.json`);
  await writeFile(planFile, JSON.stringify(state.plan, null, 2));
  artifacts.push(planFile);

  const execFile = join(artifactsDir, `${now}-execution.json`);
  await writeFile(execFile, JSON.stringify(state.execution, null, 2));
  artifacts.push(execFile);

  const logsFile = join(artifactsDir, `${now}-logs.jsonl`);
  const logsContent = state.logs.map((l) => JSON.stringify(l)).join("\n");
  await writeFile(logsFile, logsContent);
  artifacts.push(logsFile);

  return artifacts;
};

const initializeExecutionState = (plan: PlanGraph): PlanExecutionState => ({
  planId: plan.id,
  executionId: nanoid(),
  status: "pending",
  startedAt: new Date().toISOString(),
  completedAt: null,
  currentStepId: null,
  stepStates: Object.fromEntries(
    plan.steps.map((s) => [
      s.id,
      {
        id: s.id,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        completedAt: null,
      },
    ])
  ),
  logs: [],
});

export const runNeuronWavesLoop = async (
  config: OrchestratorConfig,
  deps: OrchestratorDeps,
  observation: Observation
): Promise<LoopResult> => {
  const { planner, memoryAdapter } = deps;
  const logs: ExecutionLog[] = [];

  try {
    log(logs, "info", "Starting NeuronWaves loop", { observationId: observation.timestamp });

    const flash = await memoryAdapter.recallFlash(config.sessionKey, 10, 48 * 60 * 60 * 1000);
    const keywords = extractKeywords(observation.description);
    const warmHits = await memoryAdapter.recallWarmHits(config.sessionKey, keywords, 10);

    log(logs, "info", "Memory recall complete", { flashCount: flash.length, warmCount: warmHits.length });

    const context: ContextBundle = {
      sessionKey: config.sessionKey,
      requester: observation.source,
      environment: "cli" as const,
      config: { autonomy: config.autonomy },
      availableTools: [],
      globalState: { flash, warmHits },
    };

    const plan = await planner.generate(observation, context, config.autonomy);
    log(logs, "info", "Plan generated", { planId: plan.id, steps: plan.steps.length });

    const execution = initializeExecutionState(plan);
    execution.status = "running";

    const state: InternalState = { plan, execution, logs, artifacts: [] };
    let awaitingApproval = false;

    for (const step of plan.steps) {
      execution.currentStepId = step.id;
      const stepState = execution.stepStates[step.id];
      stepState.status = "executing";
      stepState.attempts++;
      stepState.lastAttemptAt = new Date().toISOString();

      const policy = evaluatePolicy(step, config.autonomy);
      const result = await executeStep(step, policy, state);

      if (result === "awaiting") {
        stepState.status = "awaiting_approval";
        awaitingApproval = true;
        break;
      }

      stepState.status = result === "success" ? "success" : result === "blocked" ? "skipped" : "failed";
      if (result === "failed") {
        onFailure: step.onFailure;
      }
      stepState.completedAt = new Date().toISOString();
    }

    execution.status = awaitingApproval ? "pending" : "completed";
    execution.completedAt = new Date().toISOString();

    const artifacts = await persistArtifacts(config, state);
    state.artifacts.push(...artifacts);

    log(logs, "info", "Loop complete", { status: execution.status });

    return {
      planId: plan.id,
      executionId: execution.executionId,
      status: awaitingApproval ? "awaiting_approval" : "completed",
      executedSteps: plan.steps.filter((s) => execution.stepStates[s.id].status === "success").length,
      failedSteps: plan.steps.filter((s) => execution.stepStates[s.id].status === "failed").length,
      blockedSteps: plan.steps.filter((s) => execution.stepStates[s.id].status === "skipped").length,
      artifacts,
      logs,
    };
  } catch (err) {
    log(logs, "error", "Loop failed", { error: String(err) });
    throw err;
  }
};

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 5);
}
