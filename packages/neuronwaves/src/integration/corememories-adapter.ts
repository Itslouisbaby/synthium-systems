import type { ContextBundle, MemoryEntry } from "../types/context.js";

export interface CoreMemoriesAdapter {
  recallFlash: () => Promise<MemoryEntry[]>;
  recallWarmHits: (keywords: string[]) => Promise<MemoryEntry[]>;
}

export function createCoreMemoriesAdapterStub(): CoreMemoriesAdapter {
  return {
    async recallFlash(): Promise<MemoryEntry[]> {
      return [];
    },
    async recallWarmHits(): Promise<MemoryEntry[]> {
      return [];
    },
  };
}

export async function buildContextBundle(
  adapter: CoreMemoriesAdapter,
  userText: string,
): Promise<ContextBundle> {
  const flash = await adapter.recallFlash();
  const keywords = extractKeywords(userText);
  const warmHits = await adapter.recallWarmHits(keywords);
  return { flash, warmHits, semanticFacts: [], notes: [] };
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 8);
}
