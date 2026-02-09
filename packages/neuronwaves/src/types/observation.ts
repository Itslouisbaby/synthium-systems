export interface Observation {
  id: string;
  timestampMs: number;
  sessionKey: string;
  workspaceDir: string;
  channel: string;
  rawText: string;
  entities: string[];
  intents: string[];
  constraints: Record<string, unknown>;
  confidence: number;
  metadata: Record<string, unknown>;
}
