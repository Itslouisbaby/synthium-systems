export type EvaluationOutcome = "success" | "partial" | "blocked" | "failed";

export interface EvaluationRecord {
  evalId: string;
  timestampMs: number;
  goalId: string;
  planId: string;
  outcome: EvaluationOutcome;
  whatWorked: string[];
  whatFailed: string[];
  rootCause: string[];
  improvements: string[];
}
