export type ContextBundle = {
  id: string;
  createdAtMs: number;
  summary: string;
  flashEntries?: string[];
  meta?: Record<string, unknown>;
};
