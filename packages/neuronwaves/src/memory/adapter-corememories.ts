import type { MemoryEntry } from "../types.js";

export interface CoreMemoriesInstance {
  getFlashEntries(): Array<{
    id: string;
    timestamp: string;
    type: string;
    content: string;
    speaker: string;
    keywords: string[];
    emotionalSalience: number;
    userFlagged: boolean;
    linkedTo: string[];
    privacyLevel: string;
  }>;
  findByKeyword(keyword: string): {
    flash: Array<any>;
    warm: Array<any>;
  };
}

export interface CoreMemoriesAdapter {
  recallFlash(sessionKey: string, limit: number, cutoffMs?: number): Promise<MemoryEntry[]>;
  recallWarmHits(sessionKey: string, keywords: string[], limit: number): Promise<MemoryEntry[]>;
}

export interface AdapterConfig {
  memoryDir: string;
  workspaceDir: string;
  sessionKey: string;
}

function mapToNeuronWavesEntry(cmEntry: any): MemoryEntry {
  return {
    id: cmEntry.id,
    type: cmEntry.type === "warm" || cmEntry.compressionMethod ? "warm" : "flash",
    timestamp: cmEntry.timestamp,
    sessionKey: "", // filled by caller
    content: cmEntry.content,
    keywords: cmEntry.keywords || [],
    emotionalSalience: cmEntry.emotionalSalience || 0.5,
    privacyLevel: cmEntry.privacyLevel || "public",
    userFlagged: cmEntry.userFlagged || false,
    linkedTo: cmEntry.linkedTo || [],
    warmEntryFields: cmEntry.compressionMethod ? {
      summary: cmEntry.summary,
      hook: cmEntry.hook,
      keyPoints: cmEntry.keyPoints,
      emotionalTone: cmEntry.emotionalTone,
      compressionMethod: cmEntry.compressionMethod,
    } : undefined,
  };
}

export async function createCoreMemoriesAdapter(
  config: AdapterConfig
): Promise<CoreMemoriesAdapter> {
  const { getCoreMemories } = await import("@openclaw/core-memories");

  const memoryDir = `${config.workspaceDir}/.openclaw/memory/sessions/${config.sessionKey}`;
  const cm = await getCoreMemories({ memoryDir });

  return {
    async recallFlash(sessionKey: string, limit: number, cutoffMs?: number): Promise<MemoryEntry[]> {
      const entries = cm.getFlashEntries();
      const cutoff = cutoffMs ? Date.now() - cutoffMs : 0;

      return entries
        .filter((e: any) => {
          if (cutoffMs) {
            const entryTime = new Date(e.timestamp).getTime();
            return entryTime > cutoff;
          }
          return true;
        })
        .slice(-limit)
        .map(mapToNeuronWavesEntry)
        .map((e: MemoryEntry) => ({ ...e, sessionKey }));
    },

    async recallWarmHits(sessionKey: string, keywords: string[], limit: number): Promise<MemoryEntry[]> {
      const hits: Map<string, MemoryEntry> = new Map();

      for (const keyword of keywords) {
        const results = cm.findByKeyword(keyword);
        const entries = [...results.flash, ...results.warm];

        for (const entry of entries) {
          const mapped = mapToNeuronWavesEntry(entry);
          hits.set(mapped.id, { ...mapped, sessionKey });
        }
      }

      return Array.from(hits.values()).slice(0, limit);
    },
  };
}
