/**
 * CoreMemories Flash Context Injection
 * Auto-injects recent Flash entries into system context before model calls.
 */

import { logVerbose } from "../../globals.js";

// Rough token estimation: ~4 characters per token for English text
const CHARS_PER_TOKEN = 4;
const DEFAULT_TOKEN_MAX = 1000;
const MIN_TOKEN_MAX = 800;
const MAX_TOKEN_MAX = 1200;

export type FlashContextMetrics = {
  injectedCount: number;
  trimmed: boolean;
};

export type FlashEntry = {
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
};

/**
 * Format a timestamp to HH:MM format
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "??:??";
  }
}

/**
 * Format a single Flash entry for context injection
 */
function formatFlashEntry(entry: FlashEntry): string {
  const time = formatTime(entry.timestamp);
  const who = entry.speaker || "unknown";
  const content = entry.content.trim();
  return `[${time}] ${who}: ${content}`;
}

/**
 * Fetch and format Flash context from CoreMemories.
 * Returns formatted context string or undefined if not available.
 *
 * @param memoryDir - The memory directory for the session
 * @param maxTokens - Maximum tokens to return (capped between 800-1200)
 * @returns Formatted Flash context or undefined
 */
export async function injectFlashContext(
  memoryDir: string | undefined,
  maxTokens: number = DEFAULT_TOKEN_MAX,
): Promise<{ context: string | undefined; metrics: FlashContextMetrics }> {
  const metrics: FlashContextMetrics = {
    injectedCount: 0,
    trimmed: false,
  };

  if (!memoryDir) {
    return { context: undefined, metrics };
  }

  // Clamp token max to valid range
  const clampedMaxTokens = Math.max(MIN_TOKEN_MAX, Math.min(MAX_TOKEN_MAX, maxTokens));
  const maxChars = clampedMaxTokens * CHARS_PER_TOKEN;

  try {
    // Dynamically import CoreMemories to avoid breaking if not available
    const mod = (await import("@openclaw/core-memories")) as {
      getCoreMemories: (opts?: { memoryDir?: string }) => Promise<{
        getFlashEntries: () => FlashEntry[];
      }>;
    };

    const cm = await mod.getCoreMemories({ memoryDir });
    const allEntries = cm.getFlashEntries();

    if (!Array.isArray(allEntries) || allEntries.length === 0) {
      return { context: undefined, metrics };
    }

    // Filter entries from last 60 minutes
    const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;
    const recentEntries = allEntries.filter((entry) => {
      try {
        const entryTime = new Date(entry.timestamp).getTime();
        return entryTime >= sixtyMinutesAgo;
      } catch {
        return false;
      }
    });

    // Take last 10 entries (or fewer if not enough recent)
    const entriesToUse = recentEntries.slice(-10);

    if (entriesToUse.length === 0) {
      return { context: undefined, metrics };
    }

    // Format entries and calculate total length
    const formattedEntries: string[] = [];
    let currentChars = 0;

    // Add entries from newest to oldest, respecting token limit
    for (let i = entriesToUse.length - 1; i >= 0; i--) {
      const entry = entriesToUse[i];
      const formatted = formatFlashEntry(entry);
      const entryChars = formatted.length + 1; // +1 for newline

      if (currentChars + entryChars > maxChars && formattedEntries.length > 0) {
        // Would exceed limit and we already have some entries
        metrics.trimmed = true;
        break;
      }

      formattedEntries.unshift(formatted);
      currentChars += entryChars;
    }

    metrics.injectedCount = formattedEntries.length;

    if (formattedEntries.length === 0) {
      return { context: undefined, metrics };
    }

    const context = [
      "## Recent Working Memory (Flash)",
      "The following entries are from the ephemeral working memory of recent conversations:",
      "",
      ...formattedEntries,
      "",
    ].join("\n");

    logVerbose(
      `Flash context injected: ${metrics.injectedCount} entries${metrics.trimmed ? " (trimmed)" : ""}`,
    );

    return { context, metrics };
  } catch (err) {
    // Graceful fallback: CoreMemories may not be available
    logVerbose(
      `Flash context injection skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { context: undefined, metrics };
  }
}

/**
 * Count tokens in a string (rough estimate)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Check if Flash ambient injection is enabled for this config
 */
export function isFlashAmbientEnabled(cfg: {
  coreMemories?: { flashAmbientEnabled?: boolean };
}): boolean {
  return cfg.coreMemories?.flashAmbientEnabled === true;
}

/**
 * Get the max token limit for Flash injection
 */
export function getFlashAmbientTokenMax(cfg: {
  coreMemories?: { flashAmbientTokenMax?: number };
}): number {
  const configured = cfg.coreMemories?.flashAmbientTokenMax;
  if (typeof configured === "number") {
    return Math.max(MIN_TOKEN_MAX, Math.min(MAX_TOKEN_MAX, configured));
  }
  return DEFAULT_TOKEN_MAX;
}
