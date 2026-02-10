import { describe, expect, it } from "vitest";
import { decidePolicy } from "../src/execution/policy-gate.js";
import type { AutonomyConfig } from "../src/types/autonomy.js";

function cfg(): AutonomyConfig {
  return {
    level: 3,
    requireApproval: false,
    allow: { tools: [], domains: [], contacts: [], folders: [], channels: [] },
    deny: { tools: [], domains: [], actions: [] },
    limits: {
      maxActionsPerRun: 2,
      maxToolCallsPerRun: 10,
      maxExternalPerRun: 1,
      maxIrreversiblePerRun: 1,
    },
  };
}

describe("policy limits", () => {
  it("blocks when maxActionsPerRun reached", () => {
    const decision = decidePolicy(
      { autonomy: cfg(), actionClass: "local_read" },
      { actionsConsidered: 2, externalCount: 0, irreversibleCount: 0, toolCallsCount: 0 },
    );
    expect(decision.decision).toBe("block");
  });

  it("blocks when maxExternalPerRun reached", () => {
    const decision = decidePolicy(
      { autonomy: cfg(), actionClass: "external_read" },
      { actionsConsidered: 0, externalCount: 1, irreversibleCount: 0, toolCallsCount: 0 },
    );
    expect(decision.decision).toBe("block");
  });

  it("blocks when maxIrreversiblePerRun reached", () => {
    const decision = decidePolicy(
      { autonomy: cfg(), actionClass: "external_write_irreversible" },
      { actionsConsidered: 0, externalCount: 0, irreversibleCount: 1, toolCallsCount: 0 },
    );
    expect(decision.decision).toBe("block");
  });
});
