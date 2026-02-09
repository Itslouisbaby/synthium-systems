import type { PolicyDecision } from "../types/policy.js";
import type { PlanStep } from "../types/plan.js";

export type AuditActionRecord = {
  id: string;
  runId: string;
  stepId: string;
  atMs: number;
  classification: PlanStep["classification"];
  decision: PolicyDecision;
  status: "simulated" | "skipped" | "blocked";
};
