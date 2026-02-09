import fs from "node:fs/promises";
import path from "node:path";

export type ArtifactType =
  | "observations"
  | "plans"
  | "evaluations"
  | "audit_actions"
  | "state_active";

export function resolveNeuronWavesRoot(workspaceDir: string) {
  return path.join(workspaceDir, ".openclaw", "neuronwaves");
}

export function resolveArtifactPath(workspaceDir: string, type: ArtifactType) {
  const root = resolveNeuronWavesRoot(workspaceDir);
  switch (type) {
    case "observations":
      return path.join(root, "observations.jsonl");
    case "plans":
      return path.join(root, "plans.jsonl");
    case "evaluations":
      return path.join(root, "evaluations.jsonl");
    case "audit_actions":
      return path.join(root, "audit", "actions.jsonl");
    case "state_active":
      return path.join(root, "state", "active.json");
  }
}

async function ensureDirForFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeArtifact(
  workspaceDir: string,
  type: Exclude<ArtifactType, "state_active">,
  payload: unknown,
): Promise<void> {
  const filePath = resolveArtifactPath(workspaceDir, type);
  await ensureDirForFile(filePath);
  await fs.appendFile(filePath, JSON.stringify(payload) + "\n", "utf-8");
}

export async function writeActiveState(
  workspaceDir: string,
  payload: unknown,
): Promise<void> {
  const filePath = resolveArtifactPath(workspaceDir, "state_active");
  await ensureDirForFile(filePath);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  await fs.rename(tmpPath, filePath);
}
