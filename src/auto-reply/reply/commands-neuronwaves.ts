import type { CommandHandler } from "./commands-types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import {
  loadNeuronWavesPolicy,
  saveNeuronWavesPolicy,
  setOutboundPerHour,
  setPolicyDevLevel,
  setPolicyMode,
  setPolicyRule,
  setSpendUsdPerDay,
  unsetPolicyRule,
} from "../../neuronwaves/policy/index.js";
import { routeReply } from "./route-reply.js";

function parseUnlimited(raw: string) {
  const v = raw.trim().toLowerCase();
  return v === "unlimited" || v === "inf" || v === "infinite";
}

export const handleNeuronWavesCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }

  const body = params.command.commandBodyNormalized.trim();
  if (!body.startsWith("/nw")) {
    return null;
  }

  // Owner-only.
  if (!params.command.isAuthorizedSender) {
    return {
      shouldContinue: false,
      reply: { text: "NeuronWaves policy commands are owner-only." },
    };
  }

  const rest = body.slice(3).trim();
  if (!rest) {
    return {
      shouldContinue: false,
      reply: {
        text:
          "NeuronWaves commands:\n" +
          "- /nw policy show\n" +
          "- /nw policy mode <safe|dev>\n" +
          "- /nw policy devLevel <1|2|3>\n" +
          "- /nw policy set <kind> <auto|ask|deny>\n" +
          "- /nw policy unset <kind>\n" +
          "- /nw policy limits outboundPerHour <number|unlimited>\n" +
          "- /nw policy limits spendUsdPerDay <number|unlimited>\n",
      },
    };
  }

  const agentId = resolveDefaultAgentId(params.cfg);
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
  let policy = await loadNeuronWavesPolicy(workspaceDir);

  const tokens = rest.split(/\s+/g);
  if (tokens[0] !== "policy") {
    return { shouldContinue: true };
  }

  const sub = tokens[1] ?? "";
  if (!sub || sub === "show") {
    return {
      shouldContinue: false,
      reply: { text: "```json\n" + JSON.stringify(policy, null, 2) + "\n```" },
    };
  }

  if (sub === "mode") {
    const mode = (tokens[2] ?? "").trim() as "safe" | "dev";
    if (mode !== "safe" && mode !== "dev") {
      return {
        shouldContinue: false,
        reply: { text: "Usage: /nw policy mode <safe|dev>" },
      };
    }
    policy = setPolicyMode(policy, mode);
    await saveNeuronWavesPolicy(workspaceDir, policy);
    return { shouldContinue: false, reply: { text: `NeuronWaves mode set to ${mode}.` } };
  }

  if (sub === "devLevel") {
    const raw = (tokens[2] ?? "").trim();
    const level = Number(raw);
    if (level !== 1 && level !== 2 && level !== 3) {
      return { shouldContinue: false, reply: { text: "Usage: /nw policy devLevel <1|2|3>" } };
    }
    policy = setPolicyDevLevel(policy, level as 1 | 2 | 3);
    await saveNeuronWavesPolicy(workspaceDir, policy);
    return {
      shouldContinue: false,
      reply: { text: `NeuronWaves devLevel set to ${level}.` },
    };
  }

  if (sub === "set") {
    const kind = (tokens[2] ?? "").trim() as never;
    const decision = (tokens[3] ?? "").trim() as never;
    if (!kind || !decision) {
      return {
        shouldContinue: false,
        reply: { text: "Usage: /nw policy set <kind> <auto|ask|deny>" },
      };
    }
    policy = setPolicyRule(policy, kind, decision);
    await saveNeuronWavesPolicy(workspaceDir, policy);
    return {
      shouldContinue: false,
      reply: { text: `Policy updated: ${kind} -> ${decision}` },
    };
  }

  if (sub === "unset") {
    const kind = (tokens[2] ?? "").trim() as never;
    if (!kind) {
      return { shouldContinue: false, reply: { text: "Usage: /nw policy unset <kind>" } };
    }
    policy = unsetPolicyRule(policy, kind);
    await saveNeuronWavesPolicy(workspaceDir, policy);
    return { shouldContinue: false, reply: { text: `Policy unset: ${kind}` } };
  }

  if (sub === "limits") {
    const limitKey = (tokens[2] ?? "").trim();
    const raw = (tokens[3] ?? "").trim();
    if (!limitKey || !raw) {
      return {
        shouldContinue: false,
        reply: {
          text:
            "Usage:\n" +
            "- /nw policy limits outboundPerHour <number|unlimited>\n" +
            "- /nw policy limits spendUsdPerDay <number|unlimited>",
        },
      };
    }

    const value = parseUnlimited(raw) ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;

    if (limitKey === "outboundPerHour") {
      policy = setOutboundPerHour(policy, parseUnlimited(raw) ? null : value);
      await saveNeuronWavesPolicy(workspaceDir, policy);
      return { shouldContinue: false, reply: { text: `outboundPerHour set.` } };
    }
    if (limitKey === "spendUsdPerDay") {
      policy = setSpendUsdPerDay(policy, parseUnlimited(raw) ? null : value);
      await saveNeuronWavesPolicy(workspaceDir, policy);
      return { shouldContinue: false, reply: { text: `spendUsdPerDay set.` } };
    }

    return {
      shouldContinue: false,
      reply: { text: `Unknown limit: ${limitKey}` },
    };
  }

  // Unknown policy subcommand.
  await routeReply({
    payload: { text: "Unknown /nw policy command. Try /nw" },
    channel: params.command.channel,
    to: params.command.from,
    sessionKey: params.sessionKey,
    accountId: params.ctx.AccountId,
    threadId: params.ctx.MessageThreadId,
    cfg: params.cfg,
  });
  return { shouldContinue: false };
};
