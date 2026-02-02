import { describe, it, expect } from "vitest";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { patchToolSchemaForClaudeCompatibility } from "./pi-tools.read.js";

describe("patchToolSchemaForClaudeCompatibility", () => {
  it("should maintain required field even if empty", () => {
    const inputTool: AnyAgentTool = {
      name: "read",
      label: "read", // minimal mock requirements
      description: "Read a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      execute: async () => ({ content: [], details: {} }),
    };

    const patched = patchToolSchemaForClaudeCompatibility(inputTool);
    const params = patched.parameters as Record<string, unknown>;

    // Check that path was removed from required (because it is aliased)
    // But check the behavior of the 'required' field itself

    // Verify that required is now present and empty (or properly empty array)
    // The previous bug was that it was undefined/removed.
    // We want it to be [] if we removed all required params (because aliases are now optional in schema sense)
    expect(params.required).toEqual([]);
  });
});
