export type CoreMemoriesAdapter = {
  flashEntries: string[];
  recordEvent: (entry: { atMs: number; summary: string }) => Promise<void>;
};

export async function loadCoreMemoriesAdapter(params: {
  memoryDir?: string;
}): Promise<CoreMemoriesAdapter> {
  try {
    const mod = (await import("@openclaw/core-memories")) as {
      getCoreMemories: (opts?: { memoryDir?: string }) => Promise<{
        getFlashEntries: () => { content: string }[];
        addFlashEntry: (content: string, speaker?: string, type?: string) => unknown;
      }>;
    };

    const cm = await mod.getCoreMemories({ memoryDir: params.memoryDir });
    const flashEntries = cm.getFlashEntries().map((entry) => entry.content);

    return {
      flashEntries,
      recordEvent: async (entry) => {
        try {
          cm.addFlashEntry(entry.summary, "neuronwaves", "neuronwaves_event");
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return {
      flashEntries: [],
      recordEvent: async () => {},
    };
  }
}
