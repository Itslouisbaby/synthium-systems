import { describe, it, expect } from "vitest";
import { decidePolicy } from "../src/execution/policy-gate.js";
import type { AutonomyConfig } from "../src/types/autonomy.js";

function baseConfig(level: 1 | 2 | 3): AutonomyConfig {
  return {
    level,
    requireApproval: true,
    allow: {
      tools: ["web_search"],
      domains: ["public_web"],
      contacts: ["luis"],
      folders: ["allowed"],
      channels: ["dm"],
    },
    deny: { tools: [], domains: [], actions: [] },
    limits: {
      maxActionsPerRun: 10,
      maxToolCallsPerRun: 50,
      maxExternalPerRun: 3,
      maxIrreversiblePerRun: 1,
    },
  };
}

describe("policy gate", () => {
  const zeroStats = {
    actionsConsidered: 0,
    externalCount: 0,
    irreversibleCount: 0,
    toolCallsCount: 0,
  };

  it("Level 1 allows local_write and blocks external_read", () => {
    const cfg = baseConfig(1);
    const allow = decidePolicy({ autonomy: cfg, actionClass: "local_write" }, zeroStats);
    expect(allow.decision).toBe("allow");
    const block = decidePolicy(
      {
        autonomy: cfg,
        actionClass: "external_read",
        toolName: "web_search",
      },
      zeroStats,
    );
    expect(block.decision).toBe("block");
  });

  it("Level 2 allows external_read", () => {
    const cfg = baseConfig(2);
    const res = decidePolicy(
      { autonomy: cfg, actionClass: "external_read", toolName: "web_search" },
      zeroStats,
    );
    expect(res.decision).toBe("allow");
  });

  it("Level 2 reversible write requires allowlists and approval", () => {
    const cfg = baseConfig(2);
    const res = decidePolicy(
      {
        autonomy: cfg,
        actionClass: "external_write_reversible",
        toolName: "web_search",
        targetDomain: "public_web",
        targetFolder: "allowed",
      },
      zeroStats,
    );
    expect(res.decision).toBe("allow_with_prompt");
  });

  it("Level 2 blocks irreversible writes", () => {
    const cfg = baseConfig(2);
    const res = decidePolicy(
      { autonomy: cfg, actionClass: "external_write_irreversible" },
      zeroStats,
    );
    expect(res.decision).toBe("block");
  });

  it("Level 3 allows external_read and reversible writes but blocks money movement", () => {
    const cfg = baseConfig(3);
    const allowRead = decidePolicy(
      {
        autonomy: cfg,
        actionClass: "external_read",
        toolName: "web_search",
      },
      zeroStats,
    );
    expect(allowRead.decision).toBe("allow");
    const blockMoney = decidePolicy(
      { autonomy: cfg, actionClass: "money_movement" },
      zeroStats,
    );
    expect(blockMoney.decision).toBe("block");
  });
});
