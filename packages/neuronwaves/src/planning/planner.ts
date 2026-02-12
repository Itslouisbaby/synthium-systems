import { nanoid } from "nanoid";
import type {
  Planner,
  PlanGraph,
  PlanStep,
  Observation,
  ContextBundle,
  AutonomyLevel,
} from "../types.js";

export { type Planner };

export interface HeuristicPlannerConfig {
  defaultMaxRetries: number;
  enableFallback: boolean;
}

export function createHeuristicPlanner(config: HeuristicPlannerConfig = { defaultMaxRetries: 2, enableFallback: true }): Planner {
  return {
    async generate(
      observation: Observation,
      context: ContextBundle,
      autonomy: AutonomyLevel
    ): Promise<PlanGraph> {
      const steps = inferSteps(observation, context, autonomy, config);
      const now = new Date().toISOString();

      return {
        id: nanoid(),
        name: generatePlanName(observation),
        description: `Plan generated for: ${observation.description.slice(0, 100)}`,
        steps,
        requiredAutonomy: autonomy,
        riskScore: calculateRiskScore(steps, observation),
        estimatedDuration: estimateDuration(steps),
        createdAt: now,
        expiresAt: null,
        tags: extractTags(observation, context),
        metadata: {
          planner: "heuristic",
          memoryEntriesReferenced: [],
          confidence: 0.7,
        },
      };
    },
  };
}

function inferSteps(
  obs: Observation,
  ctx: ContextBundle,
  autonomy: AutonomyLevel,
  config: HeuristicPlannerConfig
): PlanStep[] {
  const text = obs.description.toLowerCase();
  const steps: PlanStep[] = [];

  const requiresApproval = autonomy < 0.5;
  const requiresPrompt = autonomy < 1.0;

  // Search-related actions
  if (text.includes("search") || text.includes("find") || text.includes("look up")) {
    steps.push({
      id: nanoid(),
      action: "web_search",
      params: { query: extractQuery(text), limit: 5 },
      description: "Search for requested information",
      dependencies: [],
      requiresApproval,
      estimatedDuration: 3,
      onFailure: "skip",
      maxRetries: config.defaultMaxRetries,
    });
  }

  // Communication actions
  if (text.includes("send") || text.includes("message") || text.includes("email")) {
    steps.push({
      id: nanoid(),
      action: "send_message",
      params: { content: obs.description, recipient: extractRecipient(text) },
      description: "Send message as requested",
      dependencies: [],
      requiresApproval: requiresPrompt,
      estimatedDuration: 5,
      onFailure: config.enableFallback ? "fallback" : "skip",
      maxRetries: 1,
    });
  }

  // File operations
  if (text.includes("write") || text.includes("create file") || text.includes("save")) {
    steps.push({
      id: nanoid(),
      action: "write_file",
      params: { path: extractPath(text), content: obs.description },
      description: "Write content to file",
      dependencies: [],
      requiresApproval: requiresPrompt,
      estimatedDuration: 2,
      onFailure: "skip",
      maxRetries: 0,
    });
  }

  // Default: create note
  if (steps.length === 0) {
    steps.push({
      id: nanoid(),
      action: "create_note",
      params: { content: obs.description, tags: extractTags(obs, ctx) },
      description: "Record observation as note",
      dependencies: [],
      requiresApproval: false,
      estimatedDuration: 1,
      onFailure: "skip",
      maxRetries: 0,
    });
  }

  return steps;
}

function generatePlanName(obs: Observation): string {
  const prefix = obs.type.replace(/_/g, " ");
  const time = new Date(obs.timestamp).toLocaleTimeString();
  return `${prefix} at ${time}`;
}

function calculateRiskScore(steps: PlanStep[], obs: Observation): number {
  let maxRisk = 0.1;

  for (const step of steps) {
    const riskMap: Record<string, number> = {
      web_search: 0.2,
      send_message: 0.4,
      write_file: 0.3,
      create_note: 0.1,
      execute: 0.7,
      delete: 0.8,
    };
    maxRisk = Math.max(maxRisk, riskMap[step.action] || 0.3);
  }

  if (obs.priority > 0.7) maxRisk += 0.1;

  return Math.min(maxRisk, 1.0);
}

function estimateDuration(steps: PlanStep[]): number | null {
  if (steps.length === 0) return null;
  const total = steps.reduce((sum, s) => sum + (s.estimatedDuration || 1), 0);
  return total;
}

function extractTags(obs: Observation, ctx: ContextBundle): string[] {
  const tags: string[] = [obs.type, ctx.environment];
  const text = obs.description.toLowerCase();

  if (text.includes("search")) tags.push("search");
  if (text.includes("urgent") || text.includes("asap")) tags.push("urgent");
  if (text.includes("test")) tags.push("test");

  return tags;
}

function extractQuery(text: string): string {
  const match = text.match(/search (?:for )?(.+?)(?:\.|$|in |on )/i);
  return match?.[1]?.trim() || text.slice(0, 50);
}

function extractRecipient(text: string): string | null {
  const match = text.match(/to\s+(\S+?@\S+|\w+)(?:\s|$)/i);
  return match?.[1] || null;
}

function extractPath(text: string): string | null {
  const match = text.match(/(?:to|in|at)\s+([\/\w\\.~-]+)/i);
  return match?.[1] || null;
}
