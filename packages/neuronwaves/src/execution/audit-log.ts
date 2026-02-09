export interface AuditEntry {
  id: string;
  timestampMs: number;
  kind: "plan_step" | "execution";
  stepId: string;
  actionClass: string;
  decision: string;
  details: Record<string, unknown>;
}
