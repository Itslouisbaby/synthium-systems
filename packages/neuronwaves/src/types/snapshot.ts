export type LoopRunSnapshot = {
  runId: string;
  startedAtMs: number;
  finishedAtMs?: number;
  observationId: string;
  contextId: string;
  planId: string;
  evaluationIds: string[];
  policyTier: number;
  status: "running" | "completed";
};
