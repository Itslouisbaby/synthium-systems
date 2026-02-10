export interface MemoryEntry {
  id: string;
  timestampMs: number;
  kind: "user" | "assistant" | "system";
  text: string;
  tags: string[];
}

export interface ContextBundle {
  flash: MemoryEntry[];
  warmHits: MemoryEntry[];
  semanticFacts: string[];
  activeGoalId?: string;
  notes: string[];
}
