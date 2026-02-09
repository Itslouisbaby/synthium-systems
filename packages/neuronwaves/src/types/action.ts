export type ActionClass =
  | "local_read"
  | "local_write"
  | "external_read"
  | "external_write_reversible"
  | "external_write_irreversible"
  | "external_comms"
  | "money_movement"
  | "identity_security_sensitive";

export type ActionClassification = {
  class: ActionClass;
  /** Optional allowlist key used by the policy gate. */
  allowlistKey?: string;
  /** Optional freeform notes from the planner. */
  notes?: string;
};
