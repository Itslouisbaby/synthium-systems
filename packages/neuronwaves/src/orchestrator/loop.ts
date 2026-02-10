import { nanoid } from "nanoid";
import type { LoopInput, LoopResult, LoopRunSnapshot } from "../types/loop.js";
import type { Observation } from "../types/observation.js";
import type { PlanGraph, PlanStep } from "../types/plan.js";
import type { EvaluationRecord } from "../types/evaluation.js";
// removed unused AutonomyConfig import
import { createArtifactWriter } from "./artifact-writer.js";
import { decidePolicy } from "../execution/policy-gate.js";
import { createCoreMemoriesAdapterStub, buildContextBundle } from "../integration/corememories-adapter.js";

export async function runNeuronWavesLoop(input: LoopInput): Promise<LoopResult> {
  const now = Date.now();
  const runId = nanoid();
  const writer = createArtifactWriter(input.workspaceDir);
  await writer.ensureDirs();

  const observation: Observation = {
    id: nanoid(),
    timestampMs: now,
    sessionKey: input.sessionKey,
    workspaceDir: input.workspaceDir,
    channel: input.channel,
    rawText: input.text,
    entities: [],
    intents: inferIntents(input.text),
    constraints: {},
    confidence: 0.7,
    metadata: {},
  };

  await writer.writeJsonl("observations.jsonl", observation);

  const adapter = createCoreMemoriesAdapterStub();
  const context = await buildContextBundle(adapter, input.text);

  const goalId = nanoid();
  const plan: PlanGraph = {
    planId: nanoid(),
    goalId,
    createdAtMs: now,
    steps: planFromText(input.text),
  };

  const stats = {
    actionsConsidered: 0,
    externalCount: 0,
    irreversibleCount: 0,
    toolCallsCount: 0,
  };

  const isExternal = (actionClass: string) =>
    [
      "external_read",
      "external_write_reversible",
      "external_write_irreversible",
      "external_comms",
      "money_movement",
      "identity_security_sensitive",
    ].includes(actionClass);

  const isIrreversible = (actionClass: string) =>
    ["external_write_irreversible", "money_movement", "identity_security_sensitive"].includes(
      actionClass,
    );

  for (const step of plan.steps) {
    const policy = decidePolicy(
      {
        autonomy: input.autonomy,
        actionClass: step.actionClass,
        toolName: step.toolName,
        targetDomain: (step.inputs["domain"] as string | undefined) ?? undefined,
        targetContact: (step.inputs["contact"] as string | undefined) ?? undefined,
        targetFolder: (step.inputs["folder"] as string | undefined) ?? undefined,
        targetChannel: (step.inputs["channel"] as string | undefined) ?? undefined,
      },
      stats,
    );

    step.policyReasons = policy.reasons;
    step.status = policy.decision === "block" ? "blocked" : "allowed";

    if (policy.decision !== "block") {
      stats.actionsConsidered += 1;
      if (isExternal(step.actionClass)) {
        stats.externalCount += 1;
      }
      if (isIrreversible(step.actionClass)) {
        stats.irreversibleCount += 1;
      }
      if (step.toolName) {
        stats.toolCallsCount += 1;
      }
    }

    await writer.writeJsonl("audit/actions.jsonl", {
      id: nanoid(),
      timestampMs: Date.now(),
      kind: "plan_step",
      stepId: step.stepId,
      actionClass: step.actionClass,
      decision: policy.decision,
      details: { title: step.title, toolName: step.toolName ?? null },
    });
  }

  await writer.writeJsonl("plans.jsonl", plan);

  const executed = await executeStub(plan, writer, input.autonomy.limits.maxActionsPerRun);

  const evaluation: EvaluationRecord = {
    evalId: nanoid(),
    timestampMs: Date.now(),
    goalId,
    planId: plan.planId,
    outcome:
      executed.blockedCount > 0 && executed.executedCount === 0 ? "blocked" : "partial",
    whatWorked:
      executed.executedCount > 0 ? ["Stub execution completed for allowed steps"] : [],
    whatFailed:
      executed.blockedCount > 0 ? ["One or more steps blocked by policy gate"] : [],
    rootCause: executed.blockedCount > 0 ? ["Autonomy policy restrictions"] : [],
    improvements: ["Upgrade planner and executor in next PR"],
  };

  await writer.writeJsonl("evaluations.jsonl", evaluation);

  const snapshot: LoopRunSnapshot = {
    runId,
    timestampMs: Date.now(),
    sessionKey: input.sessionKey,
    workspaceDir: input.workspaceDir,
    autonomyLevel: input.autonomy.level,
    observationId: observation.id,
    planId: plan.planId,
    evaluationId: evaluation.evalId,
  };

  await writer.writeJson("state/active.json", snapshot);

  const replyText = buildReply(plan, evaluation);

  return { observation, context, plan, evaluation, snapshot, replyText };
}

function inferIntents(text: string): string[] {
  const t = text.toLowerCase();
  const intents: string[] = [];
  if (t.includes("search") || t.includes("look up")) {
    intents.push("information_retrieval");
  }
  if (t.includes("email") || t.includes("message")) {
    intents.push("communications");
  }
  if (t.includes("plan") || t.includes("steps")) {
    intents.push("planning");
  }
  if (intents.length === 0) {
    intents.push("general");
  }
  return intents;
}

function planFromText(text: string): PlanStep[] {
  const t = text.toLowerCase();
  if (t.includes("search") || t.includes("look up")) {
    return [
      {
        stepId: nanoid(),
        title: "Perform external read to retrieve requested information",
        actionClass: "external_read",
        toolName: "web_search",
        inputs: { query: text, domain: "public_web" },
        expectedOutput: "Relevant results summarized",
        preconditions: [],
        postconditions: ["Results available"],
        riskFlags: [],
        status: "proposed",
        policyReasons: [],
      },
    ];
  }

  return [
    {
      stepId: nanoid(),
      title: "Write local note to artifacts describing intent and next actions",
      actionClass: "local_write",
      inputs: { note: "Draft local note" },
      expectedOutput: "Note persisted",
      preconditions: [],
      postconditions: ["Artifact written"],
      riskFlags: [],
      status: "proposed",
      policyReasons: [],
    },
  ];
}

async function executeStub(
  plan: PlanGraph,
  writer: ReturnType<typeof createArtifactWriter>,
  maxActions: number,
): Promise<{ executedCount: number; blockedCount: number }> {
  let executedCount = 0;
  let blockedCount = 0;
  for (const step of plan.steps) {
    if (step.status === "blocked") {
      blockedCount += 1;
      continue;
    }
    if (executedCount >= maxActions) {
      step.status = "skipped";
      await writer.writeJsonl("audit/actions.jsonl", {
        id: nanoid(),
        timestampMs: Date.now(),
        kind: "execution",
        stepId: step.stepId,
        actionClass: step.actionClass,
        decision: "skipped",
        details: { reason: "maxActionsPerRun limit reached" },
      });
      continue;
    }
    step.status = "executed";
    executedCount += 1;
    await writer.writeJsonl("audit/toolcalls.jsonl", {
      id: nanoid(),
      timestampMs: Date.now(),
      stepId: step.stepId,
      toolName: step.toolName ?? "stub",
      inputs: step.inputs,
      output: { ok: true, mode: "stub" },
    });
    await writer.writeJsonl("audit/actions.jsonl", {
      id: nanoid(),
      timestampMs: Date.now(),
      kind: "execution",
      stepId: step.stepId,
      actionClass: step.actionClass,
      decision: "executed",
      details: { ok: true },
    });
  }
  return { executedCount, blockedCount };
}

function buildReply(plan: PlanGraph, evaluation: EvaluationRecord): string {
  const lines: string[] = [];
  lines.push("NeuronWaves loop completed.");
  lines.push(`Plan steps: ${plan.steps.length}`);
  lines.push(`Outcome: ${evaluation.outcome}`);
  for (const step of plan.steps) {
    lines.push(`Step: ${step.title}`);
    lines.push(`Status: ${step.status}`);
    if (step.policyReasons.length > 0) {
      lines.push(`Policy: ${step.policyReasons.join("; ")}`);
    }
  }
  return lines.join(" ");
}





