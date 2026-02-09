export type AutonomyLevel = 1 | 2 | 3;

export type ActionClass =
  | "local_read"
  | "local_write"
  | "external_read"
  | "external_write_reversible"
  | "external_write_irreversible"
  | "external_comms"
  | "money_movement"
  | "identity_security_sensitive";

export type PolicyDecisionType = "allow" | "allow_with_prompt" | "block";

export interface AutonomyAllowlist {
  tools: string[];
  domains: string[];
  contacts: string[];
  folders: string[];
  channels: string[];
}

export interface AutonomyDenylist {
  tools: string[];
  domains: string[];
  actions: ActionClass[];
}

export interface AutonomyLimits {
  maxActionsPerRun: number;
  maxToolCallsPerRun: number;
}

export interface AutonomyConfig {
  level: AutonomyLevel;
  requireApproval: boolean;
  allow: AutonomyAllowlist;
  deny: AutonomyDenylist;
  limits: AutonomyLimits;
}

export interface PolicyDecision {
  decision: PolicyDecisionType;
  reasons: string[];
}
