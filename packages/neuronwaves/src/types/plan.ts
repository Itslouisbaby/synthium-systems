import type { ActionClassification } from "./action.js";

export type PlanStep = {
  id: string;
  title: string;
  description?: string;
  classification: ActionClassification;
  meta?: Record<string, unknown>;
};

export type PlanGraph = {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAtMs: number;
};
