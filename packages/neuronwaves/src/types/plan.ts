import type { ActionClass } from "./autonomy.js";

export type StepStatus = "proposed" | "allowed" | "blocked" | "executed" | "skipped";

export interface PlanStep {
  stepId: string;
  title: string;
  actionClass: ActionClass;
  toolName?: string;
  inputs: Record<string, unknown>;
  expectedOutput: string;
  preconditions: string[];
  postconditions: string[];
  riskFlags: string[];
  status: StepStatus;
  policyReasons: string[];
}

export interface PlanGraph {
  planId: string;
  goalId: string;
  createdAtMs: number;
  steps: PlanStep[];
}
