import type { PlanStep } from "../types/plan.js";
import type { ActionClass } from "../types/action.js";
import type { PolicyConfig, PolicyDecision } from "../types/policy.js";

export type PolicyGateStats = {
  externalCount?: number;
  irreversibleCount?: number;
};

export function classifyStep(step: PlanStep): ActionClass {
  return step.classification.class;
}

const EXTERNAL_CLASSES = new Set<ActionClass>([
  "external_read",
  "external_write_reversible",
  "external_write_irreversible",
  "external_comms",
  "money_movement",
  "identity_security_sensitive",
]);

const IRREVERSIBLE_CLASSES = new Set<ActionClass>([
  "external_write_irreversible",
  "money_movement",
  "identity_security_sensitive",
]);

function isAllowlisted(policy: PolicyConfig, actionClass: ActionClass, key?: string) {
  if (!key) return false;
  const allowlist = policy.allowlists?.[actionClass] ?? [];
  return allowlist.includes(key);
}

function enforceLimits(
  policy: PolicyConfig,
  actionClass: ActionClass,
  stats: PolicyGateStats | undefined,
): PolicyDecision | null {
  const limits = policy.limits;
  if (!limits || !stats) return null;

  if (limits.maxExternalPerRun != null && EXTERNAL_CLASSES.has(actionClass)) {
    if ((stats.externalCount ?? 0) >= limits.maxExternalPerRun) {
      return {
        decision: "deny",
        reason: "maxExternalPerRun",
        tier: policy.tier,
      };
    }
  }

  if (limits.maxIrreversiblePerRun != null && IRREVERSIBLE_CLASSES.has(actionClass)) {
    if ((stats.irreversibleCount ?? 0) >= limits.maxIrreversiblePerRun) {
      return {
        decision: "deny",
        reason: "maxIrreversiblePerRun",
        tier: policy.tier,
      };
    }
  }

  return null;
}

export function decide(policy: PolicyConfig, step: PlanStep, stats?: PolicyGateStats): PolicyDecision {
  const actionClass = classifyStep(step);
  const limitDecision = enforceLimits(policy, actionClass, stats);
  if (limitDecision) return limitDecision;

  if (policy.tier === 1) {
    if (actionClass === "local_read" || actionClass === "local_write") {
      return { decision: "allow", reason: "tier1-local", tier: policy.tier };
    }
    return { decision: "deny", reason: "tier1-external", tier: policy.tier };
  }

  if (policy.tier === 2) {
    if (actionClass === "local_read" || actionClass === "local_write") {
      return { decision: "allow", reason: "tier2-local", tier: policy.tier };
    }

    if (actionClass === "external_read") {
      return { decision: "allow", reason: "tier2-external-read", tier: policy.tier };
    }

    if (actionClass === "external_write_reversible" || actionClass === "external_comms") {
      const allowlisted = isAllowlisted(policy, actionClass, step.classification.allowlistKey);
      return allowlisted
        ? { decision: "allow", reason: "tier2-allowlisted", tier: policy.tier }
        : { decision: "ask", reason: "tier2-allowlist-required", tier: policy.tier };
    }

    return { decision: "deny", reason: "tier2-high-risk", tier: policy.tier };
  }

  return { decision: "allow", reason: "tier3-broad", tier: policy.tier };
}
