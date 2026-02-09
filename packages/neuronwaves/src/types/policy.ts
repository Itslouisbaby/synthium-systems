import type { ActionClass } from "./action.js";

export type PolicyTier = 1 | 2 | 3;

export type PolicyDecision = {
  decision: "allow" | "ask" | "deny";
  reason: string;
  tier: PolicyTier;
};

export type PolicyLimits = {
  maxExternalPerRun?: number;
  maxIrreversiblePerRun?: number;
};

export type PolicyAllowlists = Partial<Record<ActionClass, string[]>>;

export type PolicyConfig = {
  tier: PolicyTier;
  allowlists?: PolicyAllowlists;
  limits?: PolicyLimits;
};
