import crypto from "node:crypto";
import type { Observation } from "../types/observation.js";
import type { ContextBundle } from "../types/context.js";
import type { PlanGraph, PlanStep } from "../types/plan.js";
import type { EvaluationRecord } from "../types/evaluation.js";
import type { LoopRunSnapshot } from "../types/snapshot.js";
import type { PolicyConfig } from "../types/policy.js";
import type { ActionClass } from "../types/action.js";
import { writeActiveState, writeArtifact } from "./artifact-writer.js";
import { decide } from "../execution/policy-gate.js";
import type { AuditActionRecord } from "../execution/audit-log.js";
import { loadCoreMemoriesAdapter } from "../integration/corememories-adapter.js";

export type LoopInput = {
  message: string;
  source: string;
};

export type LoopResult = {
  runId: string;
  observation: Observation;
  context: ContextBundle;
  plan: PlanGraph;
  evaluations: EvaluationRecord[];
};

export async function runLoop(params: {
  input: LoopInput;
  policy: PolicyConfig;
  workspaceDir: string;
  memoryDir?: string;
}): Promise<LoopResult> {
  const runId = crypto.randomUUID();
  const nowMs = Date.now();

  const observation: Observation = {
    id: crypto.randomUUID(),
    atMs: nowMs,
    source: params.input.source,
    message: params.input.message,
  };

  const coreMemories = await loadCoreMemoriesAdapter({ memoryDir: params.memoryDir });

  const context: ContextBundle = {
    id: crypto.randomUUID(),
    createdAtMs: nowMs,
    summary: "Stub context (PR1)",
    flashEntries: coreMemories.flashEntries.slice(0, 5),
  };

  const plan = buildPlan({ message: params.input.message, nowMs });

  const snapshot: LoopRunSnapshot = {
    runId,
    startedAtMs: nowMs,
    observationId: observation.id,
    contextId: context.id,
    planId: plan.id,
    evaluationIds: [],
    policyTier: params.policy.tier,
    status: "running",
  };

  await writeActiveState(params.workspaceDir, snapshot);
  await writeArtifact(params.workspaceDir, "observations", observation);
  await writeArtifact(params.workspaceDir, "plans", plan);

  const evaluations: EvaluationRecord[] = [];
  for (const step of plan.steps) {
    const decision = decide(params.policy, step);
    const status = decision.decision === "allow" ? "simulated" : "blocked";

    const evaluation: EvaluationRecord = {
      id: crypto.randomUUID(),
      runId,
      stepId: step.id,
      atMs: Date.now(),
      status,
      policy: decision,
      notes: "Execution stubbed in PR1",
    };
    evaluations.push(evaluation);

    const audit: AuditActionRecord = {
      id: crypto.randomUUID(),
      runId,
      stepId: step.id,
      atMs: evaluation.atMs,
      classification: step.classification,
      decision,
      status,
    };

    await writeArtifact(params.workspaceDir, "evaluations", evaluation);
    await writeArtifact(params.workspaceDir, "audit_actions", audit);
  }

  const finishedAtMs = Date.now();
  const finishedSnapshot: LoopRunSnapshot = {
    ...snapshot,
    finishedAtMs,
    evaluationIds: evaluations.map((entry) => entry.id),
    status: "completed",
  };
  await writeActiveState(params.workspaceDir, finishedSnapshot);

  await coreMemories.recordEvent({
    atMs: finishedAtMs,
    summary: `NeuronWaves loop completed (steps=${plan.steps.length}).`,
  });

  return {
    runId,
    observation,
    context,
    plan,
    evaluations,
  };
}

function buildPlan(params: { message: string; nowMs: number }): PlanGraph {
  const goal = deriveGoal(params.message);
  const steps: PlanStep[] = [];

  steps.push(createStep("Review request", "local_read"));

  if (params.message.length > 80) {
    steps.push(createStep("Draft internal notes", "local_write"));
  }

  if (/\b(email|send|reply|message)\b/i.test(params.message)) {
    steps.push(createStep("Prepare outbound draft", "external_comms", "default"));
  }

  return {
    id: crypto.randomUUID(),
    goal,
    steps: steps.slice(0, 3),
    createdAtMs: params.nowMs,
  };
}

function deriveGoal(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return "Handle incoming request";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function createStep(title: string, actionClass: ActionClass, allowlistKey?: string): PlanStep {
  return {
    id: crypto.randomUUID(),
    title,
    classification: {
      class: actionClass,
      allowlistKey,
    },
  };
}
