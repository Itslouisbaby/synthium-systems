/**
 * CoreMemories Vector Store - Phase 2
 * Semantic embeddings for Warm layer retrieval
 */
import fs from "node:fs";
import path from "node:path";

export interface VectorEntry {
  id: string;
  vector: number[];
  weekNumber: number;
  timestamp: string;
  sourceId: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  sourceId: string;
  weekNumber: number;
}

export class VectorStore {
  private memoryDir: string;
  private vectorDir: string;
  private dimensions: number;

  constructor(memoryDir: string, dimensions = 768) {
    this.memoryDir = memoryDir;
    this.dimensions = dimensions;
    this.vectorDir = path.join(memoryDir, "vectors");
    this.ensureDir(this.vectorDir);
  }

  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private getVectorPath(weekNumber: number): string {
    return path.join(this.vectorDir, `week-${weekNumber}.vectors.jsonl`);
  }

  async saveVector(entryId: string, vector: number[], weekNumber: number, timestamp: string, sourceId: string) {
    const vectorPath = this.getVectorPath(weekNumber);
    const entry: VectorEntry = {
      id: entryId,
      vector,
      weekNumber,
      timestamp,
      sourceId,
    };
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(vectorPath, line);
  }

  loadVectors(weekNumbers?: number[]): VectorEntry[] {
    const entries: VectorEntry[] = [];
    
    if (weekNumbers && weekNumbers.length > 0) {
      for (const week of weekNumbers) {
        const vectorPath = this.getVectorPath(week);
        if (fs.existsSync(vectorPath)) {
          const lines = fs.readFileSync(vectorPath, "utf-8").split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.vector?.length === this.dimensions) {
                entries.push(entry);
              }
            } catch {
              continue;
            }
          }
        }
      }
    } else {
      const files = fs.readdirSync(this.vectorDir).filter(f => f.endsWith(".vectors.jsonl"));
      for (const file of files) {
        const filePath = path.join(this.vectorDir, file);
        const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.vector?.length === this.dimensions) {
              entries.push(entry);
            }
          } catch {
            continue;
          }
        }
      }
    }
    
    return entries;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm === 0 ? vector : vector.map(v => v / norm);
  }

  async search(queryVector: number[], k = 5, weekNumbers?: number[]): Promise<VectorSearchResult[]> {
    const vectors = this.loadVectors(weekNumbers);
    const normalizedQuery = this.normalizeVector(queryVector);
    
    const results: VectorSearchResult[] = [];
    for (const entry of vectors) {
      const score = this.cosineSimilarity(normalizedQuery, this.normalizeVector(entry.vector));
      if (score > 0) {
        results.push({
          id: entry.id,
          score,
          sourceId: entry.sourceId,
          weekNumber: entry.weekNumber,
        });
      }
    }
    
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

export function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}
