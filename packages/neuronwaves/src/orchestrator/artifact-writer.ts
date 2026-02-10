import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ArtifactWriter {
  rootDir: string;
  writeJsonl: (relativePath: string, payload: unknown) => Promise<void>;
  writeJson: (relativePath: string, payload: unknown) => Promise<void>;
  ensureDirs: () => Promise<void>;
}

export function createArtifactWriter(workspaceDir: string): ArtifactWriter {
  const rootDir = join(workspaceDir, ".openclaw", "neuronwaves");

  async function ensureDirs(): Promise<void> {
    await mkdir(join(rootDir, "audit"), { recursive: true });
    await mkdir(join(rootDir, "state"), { recursive: true });
  }

  async function writeJsonl(relativePath: string, payload: unknown): Promise<void> {
    const full = join(rootDir, relativePath);
    const line = JSON.stringify(payload) + "\n";
    await appendFile(full, line, { encoding: "utf8" });
  }

  async function writeJson(relativePath: string, payload: unknown): Promise<void> {
    const full = join(rootDir, relativePath);
    const text = JSON.stringify(payload, null, 2) + "\n";
    await writeFile(full, text, { encoding: "utf8" });
  }

  return { rootDir, ensureDirs, writeJsonl, writeJson };
}
