export type Observation = {
  id: string;
  atMs: number;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
};
