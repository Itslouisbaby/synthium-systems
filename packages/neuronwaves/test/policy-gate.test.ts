import { describe, expect, it } from "vitest";
import { decide } from "../src/execution/policy-gate.js";
import type { PlanStep } from "../src/types/plan.js";
import type { ActionClass } from "../src/types/action.js";

function stepFor(actionClass: ActionClass, allowlistKey?: string): PlanStep {
  return {
    id: "step-1",
    title: "test",
    classification: { class: actionClass, allowlistKey },
  };
}

const classes: ActionClass[] = [
  "local_read",
  "local_write",
  "external_read",
  "external_write_reversible",
  "external_write_irreversible",
  "external_comms",
  "money_movement",
  "identity_security_sensitive",
];

describe("policy gate", () => {
  it("tier1 allows only local actions", () => {
    for (const actionClass of classes) {
      const result = decide({ tier: 1 }, stepFor(actionClass));
      if (actionClass.startsWith("local_")) {
        expect(result.decision).toBe("allow");
      } else {
        expect(result.decision).toBe("deny");
      }
    }
  });

  it("tier2 allows local + external read", () => {
    for (const actionClass of classes) {
      const result = decide({ tier: 2 }, stepFor(actionClass));
      if (actionClass.startsWith("local_")) {
        expect(result.decision).toBe("allow");
        continue;
      }
      if (actionClass === "external_read") {
        expect(result.decision).toBe("allow");
        continue;
      }
      if (actionClass === "external_write_reversible" || actionClass === "external_comms") {
        expect(result.decision).toBe("ask");
        continue;
      }
      expect(result.decision).toBe("deny");
    }
  });

  it("tier2 allows allowlisted reversible actions", () => {
    const allowlists = {
      external_write_reversible: ["ok"],
      external_comms: ["ok"],
    };
    const reversible = decide(
      { tier: 2, allowlists },
      stepFor("external_write_reversible", "ok"),
    );
    expect(reversible.decision).toBe("allow");

    const comms = decide({ tier: 2, allowlists }, stepFor("external_comms", "ok"));
    expect(comms.decision).toBe("allow");
  });

  it("tier3 allows all classes", () => {
    for (const actionClass of classes) {
      const result = decide({ tier: 3 }, stepFor(actionClass));
      expect(result.decision).toBe("allow");
    }
  });
});
