#!/usr/bin/env node
/**
 * CoreMemories Historical Backfill Script v0.2
 *
 * Imports existing conversation logs into CoreMemories Flash tier
 * so users don't start from zero.
 *
 * Features:
 * - Scans OpenClaw session files for historical conversations
 * - Parses meaningful exchanges (user, assistant, tool results)
 * - Filters out heartbeats, system events, NO_REPLY, noise
 * - Creates Flash entries with original timestamps
 * - Applies redaction for secrets before storage
 * - Batches with rate limiting
 * - Idempotent: skips already-imported entries
 * - Shows progress bar/logs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// === Configuration ===
const CONFIG = {
  // Paths
  // Resolve home directory properly for Windows/Unix
  sessionsBase: path.resolve(process.env.USERPROFILE || process.env.HOME || '.'),
  memoryDir: process.env.OPENCLAW_MEMORY_DIR || path.join(process.cwd(), '.openclaw', 'memory'),

  // Processing
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  batchSize: 10, // Entries per batch
  batchDelayMs: 100, // Delay between batches (rate limiting)
  maxAgeDays: 180, // Only import entries newer than this (6 months)

  // Filtering
  skipPatterns: [
    /^HEARTBEAT_OK$/,
    /^NO_REPLY$/,
    /^\[System.*\]$/,
    /^\[Info.*\]$/,
    /^\[Debug.*\]$/,
    /^$/,
    /^\s+$/,
  ],

  // Messages to skip completely
  skipMessageTypes: ['model_change', 'thinking_level_change', 'custom'],

  // Session files to skip (metadata only)
  skipSessionPatterns: [
    /-metadata\.jsonl$/,
  ],
};

// === Progress Bar ===
class ProgressBar {
  constructor(total, width = 50) {
    this.total = total;
    this.width = width;
    this.current = 0;
    this.startTime = Date.now();
  }

  update(delta = 1) {
    this.current = Math.min(this.current + delta, this.total);
    this.render();
  }

  render() {
    const percent = this.total === 0 ? 0 : Math.min(1, this.current / this.total);
    const filled = Math.floor(this.width * percent);
    const empty = this.width - filled;
    const elapsed = Date.now() - this.startTime;
    const eta = elapsed > 0 && percent > 0 ? Math.round(elapsed / percent - elapsed) : 0;
    const etaStr = eta > 0 ? `${Math.floor(eta / 60000)}m${Math.floor((eta % 60000) / 1000)}s` : '0s';

    process.stdout.write('\r[' + '='.repeat(filled) + '>'.repeat(percent > 0 && filled < this.width ? 1 : 0) + ' '.repeat(empty) + ']' +
      ` ${Math.round(percent * 100)}% (${this.current}/${this.total}) ETA: ${etaStr}`);
  }

  complete() {
    this.current = this.total;
    this.render();
    process.stdout.write('\n');
  }
}

// === Redaction ===
/**
 * Redact secrets from content (copied from CoreMemories redactSecrets)
 */
function redactSecrets(content) {
  if (!content || typeof content !== 'string') return { redacted: content || '', wasRedacted: false };
  let redacted = content;
  let wasRedacted = false;

  // API keys
  [/\b(sk-[a-zA-Z0-9]{48,})\b/g, /\b([a-zA-Z0-9]{40,})\b/g].forEach(p => {
    redacted = redacted.replace(p, () => { wasRedacted = true; return '[API_KEY_REDACTED]'; });
  });

  // Emails
  redacted = redacted.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => { wasRedacted = true; return '[EMAIL_REDACTED]'; });

  // PEM keys
  redacted = redacted.replace(/-----BEGIN [A-Z\s]+-----[\s\S]*-----END [A-Z\s]+-----/gi, () => { wasRedacted = true; return '[PEM_KEY_REDACTED]'; });

  return { redacted, wasRedacted };
}

// === Content Extraction ===
/**
 * Extract text content from a message object
 */
function extractMessageText(message) {
  if (!message || !message.content) return '';

  const content = message.content;
  let texts = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text') {
        texts.push(block.text);
      } else if (block.type === 'toolCall') {
        texts.push(`[Tool: ${block.name}]`);
      } else if (block.type === 'thinking') {
        // Skip thinking - it's internal reasoning
        continue;
      }
    }
  } else if (typeof content === 'string') {
    texts.push(content);
  }

  return texts.join('\n').trim();
}

/**
 * Generate content hash for deduplication tracking
 */
function generateContentHash(entry) {
  const data = `${entry.timestamp}:${entry.type}:${entry.speaker}:${entry.content}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Check if content should be skipped
 */
function shouldSkipContent(content) {
  if (!content) return true;

  // Check against skip patterns
  for (const pattern of CONFIG.skipPatterns) {
    if (pattern.test(content)) return true;
  }

  return false;
}

/**
 * Parse a session file line and extract meaningful entries
 */
function parseSessionLine(line) {
  try {
    const data = JSON.parse(line);

    // Skip certain message types
    if (CONFIG.skipMessageTypes.includes(data.type)) {
      return [];
    }

    // Only process type: "message"
    if (data.type !== 'message') {
      return [];
    }

    const msg = data.message;
    if (!msg) return [];

    const entries = [];
    const timestamp = data.timestamp;
    const id = data.id;

    // Extract content
    const content = extractMessageText(msg);
    if (!content || shouldSkipContent(content)) {
      return [];
    }

    // Determine role/type
    let speaker = 'user';
    let type = 'conversation';
    let importance = 0.5;

    if (msg.role === 'user') {
      speaker = 'user';
      type = 'user_message';
      importance = 0.6; // User messages are slightly more important
    } else if (msg.role === 'assistant') {
      speaker = 'assistant';
      type = 'assistant_response';

      // Check if this is a tool call or important response
      const hasToolCall = Array.isArray(msg.content) && msg.content.some(b => b.type === 'toolCall');
      if (hasToolCall) {
        type = 'tool_call';
        importance = 0.7;
      } else {
        importance = 0.5;
      }
    } else if (msg.role === 'toolResult') {
      speaker = 'tool';
      type = 'tool_result';
      importance = 0.4; // Tool results are less important

      // Skip unless it's an error or important output
      const isError = msg.details?.status === 'error' || msg.isError === true;
      if (isError) {
        importance = 0.7; // Errors are worth remembering
      } else if (content.length < 50) {
        // Skip very short tool results (likely "ok" or similar)
        return [];
      }
    }

    // Apply redaction
    const { redacted: redactedContent, wasRedacted } = redactSecrets(content);

    entries.push({
      id,
      sessionId: data.parentId,
      timestamp,
      type,
      speaker,
      content: redactedContent,
      originalContent: content, // Keep for hash generation
      importance,
      wasRedacted,
    });

    return entries;

  } catch (err) {
    if (CONFIG.verbose) {
      console.error(`\nFailed to parse line: ${err.message}`);
    }
    return [];
  }
}

// === Session File Processing ===
/**
 * Find all session files
 */
function findSessionFiles() {
  const sessionsDir = path.join(CONFIG.sessionsBase, '.openclaw', 'agents');
  const files = [];

  if (!fs.existsSync(sessionsDir)) {
    console.warn(`Session directory not found: ${sessionsDir}`);
    return files;
  }

  // Recursively find all .jsonl files
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Check if this is a sessions directory
        if (entry.name === 'sessions' && fullPath.includes(path.sep + 'agents' + path.sep)) {
          const sessionFiles = fs.readdirSync(fullPath).filter(f => f.endsWith('.jsonl'));
          for (const file of sessionFiles) {
            files.push(path.join(fullPath, file));
          }
        } else {
          scanDir(fullPath);
        }
      }
    }
  }

  scanDir(sessionsDir);
  return files;
}

/**
 * Process a single session file
 */
function processSessionFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { entries: [], error: 'File not found' };
  }

  const entries = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    const parsed = parseSessionLine(line);
    entries.push(...parsed);
  }

  return { entries };
}

// === Flash Entry Creation ===
/**
 * Create a CoreMemories Flash entry object
 */
function createFlashEntry(entry, sessionName) {
  const { redacted } = redactSecrets(entry.content);

  return {
    id: generateContentHash(entry),
    timestamp: entry.timestamp,
    type: entry.type,
    content: redacted,
    speaker: entry.speaker,
    keywords: extractKeywords(redacted),
    emotionalSalience: entry.importance || 0.5,
    userFlagged: false,
    linkedTo: [],
    privacyLevel: 'public',
    session: sessionName,
  };
}

/**
 * Simple keyword extraction (matches CoreMemories behavior)
 */
function extractKeywords(text) {
  if (!text) return [];

  // Extract significant words (simple approach)
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Remove common stop words
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'just', 'like', 'more', 'some', 'been', 'they', 'their', 'what', 'when', 'which', 'would', 'could', 'should', 'after', 'before', 'because', 'through', 'during', 'without', 'also', 'then', 'into', 'only', 'each', 'other', 'these', 'those', 'being', 'doing', 'having', 'such', 'were', 'there', 'here', 'where', 'while', 'still', 'every', 'both', 'between', 'same', 'most', 'much', 'very', 'just', 'also', 'than', 'only', 'could', 'would', 'should']);

  const keywords = words.filter(w => !stopWords.has(w));

  // Remove duplicates and limit count
  return [...new Set(keywords)].slice(0, 10);
}

// === Flash File Management ===
/**
 * Load existing flash entries
 */
function loadFlashEntries() {
  const flashPath = path.join(CONFIG.memoryDir, 'hot', 'flash', 'current.json');

  if (!fs.existsSync(flashPath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(flashPath, 'utf-8'));
    return data.entries || [];
  } catch (err) {
    console.error(`Failed to load flash entries: ${err.message}`);
    return [];
  }
}

/**
 * Save flash entries
 */
function saveFlashEntries(entries) {
  const flashDir = path.join(CONFIG.memoryDir, 'hot', 'flash');

  if (!fs.existsSync(flashDir)) {
    fs.mkdirSync(flashDir, { recursive: true });
  }

  const flashPath = path.join(flashDir, 'current.json');
  const data = { entries };

  fs.writeFileSync(flashPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Get set of already-imported entry IDs (for idempotency)
 */
function getImportedEntryIds() {
  const entries = loadFlashEntries();
  const ids = new Set();

  for (const entry of entries) {
    if (entry.id) {
      ids.add(entry.id);
    }
  }

  return ids;
}

// === Import Logic ===
/**
 * Batch processing with rate limiting
 */
async function processBatch(entries, sessionName, importedIds) {
  const newEntries = [];

  for (const entry of entries) {
    const flashEntry = createFlashEntry(entry, sessionName);

    // Skip if already imported
    if (importedIds.has(flashEntry.id)) {
      continue;
    }

    newEntries.push(flashEntry);
    importedIds.add(flashEntry.id);
  }

  return newEntries;
}

// === Main ===
/**
 * Main import function
 */
async function main() {
  console.log('CoreMemories Historical Backfill v0.2\n');

  // Find session files
  console.log('Scanning for session files...');
  const sessionFiles = findSessionFiles();

  if (sessionFiles.length === 0) {
    console.log('No session files found.');
    return;
  }

  console.log(`Found ${sessionFiles.length} session files\n`);

  // Count total entries for progress bar
  let totalEntries = 0;
  for (const file of sessionFiles) {
    const { entries } = processSessionFile(file);
    totalEntries += entries.length;
  }

  if (totalEntries === 0) {
    console.log('No entries to import.');
    return;
  }

  console.log(`Found ${totalEntries} total entries\n`);

  // Load existing entries for deduplication
  const importedIds = getImportedEntryIds();
  console.log(`Loaded ${importedIds.size} existing entries for deduplication\n`);

  // Cutoff for maximum age
  const cutoff = Date.now() - (CONFIG.maxAgeDays * 24 * 60 * 60 * 1000);

  // Process all files
  const progressBar = new ProgressBar(sessionFiles.length);
  let processedEntries = 0;
  let importedCount = 0;
  let skippedCount = 0;
  let redactedCount = 0;
  let newFlashEntries = [];
  let sessionName = 'backfill';

  // Load existing flash entries
  const existingFlashEntries = loadFlashEntries();

  for (const filePath of sessionFiles) {
    try {
      // Extract session name from path
      const matches = filePath.match(/agents[\\\/]([^\\\/]+)[\\\/]sessions[\\\/]([^\\\/]+)/);
      if (matches) {
        sessionName = `${matches[1]}:${matches[2]}`;
      }

      const { entries } = processSessionFile(filePath);

      // Filter by age
      const recentEntries = entries.filter(e => {
        const ts = typeof e.timestamp === 'string' ? new Date(e.timestamp).getTime() : e.timestamp;
        return ts > cutoff;
      });

      if (CONFIG.verbose) {
        console.log(`\nProcessing: ${filePath}`);
        console.log(`  Total entries: ${entries.length}`);
        console.log(`  Recent entries: ${recentEntries.length}`);
      }

      // Process in batches
      for (let i = 0; i < recentEntries.length; i += CONFIG.batchSize) {
        const batch = recentEntries.slice(i, i + CONFIG.batchSize);
        const newBatch = await processBatch(batch, sessionName, importedIds);

        if (newBatch.length > 0) {
          newFlashEntries.push(...newBatch);
          importedCount += newBatch.length;

          // Count redactions
          for (const entry of newBatch) {
            const rawEntry = batch.find(b => generateContentHash(b) === entry.id);
            if (rawEntry && rawEntry.wasRedacted) {
              redactedCount++;
            }
          }
        } else {
          skippedCount += batch.length;
        }

        processedEntries += batch.length;

        // Rate limiting
        if (i + CONFIG.batchSize < recentEntries.length) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.batchDelayMs));
        }
      }

    } catch (err) {
      console.error(`\nError processing ${filePath}: ${err.message}`);
    }

    progressBar.update(1);
  }

  progressBar.complete();

  // Merge with existing entries
  const mergedEntries = [...existingFlashEntries, ...newFlashEntries];

  // Apply flash tier limits
  const maxFlashEntries = 250;
  if (mergedEntries.length > maxFlashEntries) {
    console.log(`\nNote: Flash tier limit (${maxFlashEntries}) exceeded, keeping most recent ${maxFlashEntries} entries`);
    mergedEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    mergedEntries.splice(0, mergedEntries.length - maxFlashEntries);
  }

  // Save
  if (!CONFIG.dryRun) {
    console.log('\nSaving flash entries...');
    saveFlashEntries(mergedEntries);
    console.log('Saved!');
  } else {
    console.log('\nDry run - not saving');
  }

  // Report
  console.log('\n=== Backfill Report ===');
  console.log(`Total session files: ${sessionFiles.length}`);
  console.log(`Total entries processed: ${processedEntries}`);
  console.log(`New entries imported: ${importedCount}`);
  console.log(`Entries skipped (already present): ${skippedCount}`);
  console.log(`Secrets redacted: ${redactedCount}`);
  console.log(`Final flash tier size: ${mergedEntries.length}`);

  if (CONFIG.dryRun) {
    console.log('\n(Dry run mode - use --dry-run flag to preview without changes)');
  }

  // Save import record for idempotency
  const importRecordPath = path.join(CONFIG.memoryDir, 'hot', 'flash', 'backfill-record.json');
  const importRecord = {
    timestamp: new Date().toISOString(),
    importedCount,
    skippedCount,
    redactedCount,
  };

  if (!fs.existsSync(path.dirname(importRecordPath))) {
    fs.mkdirSync(path.dirname(importRecordPath), { recursive: true });
  }

  if (!CONFIG.dryRun) {
    fs.writeFileSync(importRecordPath, JSON.stringify(importRecord, null, 2), 'utf-8');
  }

  console.log(`\nImport record saved to: ${importRecordPath}`);
}

// Run
main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
