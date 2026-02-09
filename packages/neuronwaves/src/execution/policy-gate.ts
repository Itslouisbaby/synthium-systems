import type { ActionClass, AutonomyConfig, PolicyDecision } from "../types/autonomy.js";

export interface PolicyGateInput {
  autonomy: AutonomyConfig;
  actionClass: ActionClass;
  toolName?: string;
  targetDomain?: string;
  targetContact?: string;
  targetFolder?: string;
  targetChannel?: string;
}

export interface PolicyGateStats {
  actionsConsidered: number;
  externalCount: number;
  irreversibleCount: number;
  toolCallsCount: number;
}

function isDenied(
  cfg: AutonomyConfig,
  actionClass: ActionClass,
  toolName?: string,
  targetDomain?: string,
): string[] {
  const reasons: string[] = [];
  if (cfg.deny.actions.includes(actionClass)) {
    reasons.push(`Denied by action denylist: ${actionClass}`);
  }
  if (toolName && cfg.deny.tools.includes(toolName)) {
    reasons.push(`Denied by tool denylist: ${toolName}`);
  }
  if (targetDomain && cfg.deny.domains.includes(targetDomain)) {
    reasons.push(`Denied by domain denylist: ${targetDomain}`);
  }
  return reasons;
}

function allowlistCheck(list: string[], value: string | undefined, label: string): string[] {
  if (list.length === 0) {
    return [`Allowlist for ${label} is empty`];
  }
  if (!value) {
    return [`Missing ${label} for allowlist validation`];
  }
  if (!list.includes(value)) {
    return [`${label} not allowlisted: ${value}`];
  }
  return [];
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

export function decidePolicy(input: PolicyGateInput, stats: PolicyGateStats): PolicyDecision {
  const { autonomy, actionClass, toolName, targetDomain, targetContact, targetFolder, targetChannel } =
    input;

  if (stats.actionsConsidered >= autonomy.limits.maxActionsPerRun) {
    return { decision: "block", reasons: ["Blocked: maxActionsPerRun reached"] };
  }

  if (EXTERNAL_CLASSES.has(actionClass) && stats.externalCount >= autonomy.limits.maxExternalPerRun) {
    return { decision: "block", reasons: ["Blocked: maxExternalPerRun reached"] };
  }

  if (
    IRREVERSIBLE_CLASSES.has(actionClass) &&
    stats.irreversibleCount >= autonomy.limits.maxIrreversiblePerRun
  ) {
    return { decision: "block", reasons: ["Blocked: maxIrreversiblePerRun reached"] };
  }

  const deniedReasons = isDenied(autonomy, actionClass, toolName, targetDomain);
  if (deniedReasons.length > 0) {
    return { decision: "block", reasons: deniedReasons };
  }

  if (autonomy.level === 1) {
    if (actionClass === "local_read" || actionClass === "local_write") {
      return { decision: "allow", reasons: [] };
    }
    return { decision: "block", reasons: ["Level 1 blocks all external actions"] };
  }

  if (autonomy.level === 2) {
    if (
      actionClass === "local_read" ||
      actionClass === "local_write" ||
      actionClass === "external_read"
    ) {
      return { decision: "allow", reasons: [] };
    }

    if (actionClass === "external_write_reversible" || actionClass === "external_comms") {
      const reasons: string[] = [];
      reasons.push(...allowlistCheck(autonomy.allow.tools, toolName, "tool"));
      reasons.push(...allowlistCheck(autonomy.allow.domains, targetDomain, "domain"));
      if (actionClass === "external_comms") {
        reasons.push(...allowlistCheck(autonomy.allow.contacts, targetContact, "contact"));
        reasons.push(...allowlistCheck(autonomy.allow.channels, targetChannel, "channel"));
      } else {
        reasons.push(...allowlistCheck(autonomy.allow.folders, targetFolder, "folder"));
      }
      if (reasons.length > 0) {
        return { decision: "block", reasons };
      }
      if (autonomy.requireApproval) {
        return {
          decision: "allow_with_prompt",
          reasons: ["Level 2 requires approval for reversible external writes"],
        };
      }
      return { decision: "allow", reasons: [] };
    }

    return {
      decision: "block",
      reasons: ["Level 2 blocks irreversible, money, and identity sensitive actions"],
    };
  }

  const hardBlocked: ActionClass[] = ["money_movement", "identity_security_sensitive"];
  if (hardBlocked.includes(actionClass)) {
    return {
      decision: "block",
      reasons: [
        "Dev mode still blocks money movement and identity security sensitive actions by default",
      ],
    };
  }
  if (autonomy.requireApproval && actionClass === "external_write_irreversible") {
    return {
      decision: "allow_with_prompt",
      reasons: ["Dev mode requires approval for irreversible writes when requireApproval is enabled"],
    };
  }
  return { decision: "allow", reasons: [] };
}
