import type { AutonomyConfig } from "./autonomy.js";
import type { Observation } from "./observation.js";
import type { ContextBundle } from "./context.js";
import type { PlanGraph } from "./plan.js";
import type { EvaluationRecord } from "./evaluation.js";

export interface LoopInput {
  sessionKey: string;
  workspaceDir: string;
  channel: string;
  text: string;
  autonomy: AutonomyConfig;
}

export interface LoopRunSnapshot {
  runId: string;
  timestampMs: number;
  sessionKey: string;
  workspaceDir: string;
  autonomyLevel: 1 | 2 | 3;
  observationId: string;
  planId: string;
  evaluationId: string;
}

export interface LoopResult {
  observation: Observation;
  context: ContextBundle;
  plan: PlanGraph;
  evaluation: EvaluationRecord;
  snapshot: LoopRunSnapshot;
  replyText: string;
}
