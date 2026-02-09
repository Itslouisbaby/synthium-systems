import type { PolicyDecision } from "./policy.js";

export type EvaluationRecord = {
  id: string;
  runId: string;
  stepId: string;
  atMs: number;
  status: "simulated" | "skipped" | "blocked";
  policy: PolicyDecision;
  notes?: string;
};
