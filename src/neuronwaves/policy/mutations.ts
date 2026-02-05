import type { NeuronWavesActionKind, NeuronWavesDecision, NeuronWavesPolicy } from "./types.js";

export function setPolicyMode(policy: NeuronWavesPolicy, mode: NeuronWavesPolicy["mode"]) {
  return { ...policy, mode };
}

export function setPolicyDevLevel(policy: NeuronWavesPolicy, devLevel: 1 | 2 | 3) {
  return { ...policy, devLevel };
}

export function setPolicyRule(
  policy: NeuronWavesPolicy,
  kind: NeuronWavesActionKind,
  decision: NeuronWavesDecision,
) {
  return {
    ...policy,
    rules: {
      ...policy.rules,
      [kind]: decision,
    },
  };
}

export function unsetPolicyRule(policy: NeuronWavesPolicy, kind: NeuronWavesActionKind) {
  const next = { ...policy.rules };
  delete next[kind];
  return { ...policy, rules: next };
}

export function setOutboundPerHour(policy: NeuronWavesPolicy, value: number | null) {
  return { ...policy, limits: { ...policy.limits, outboundPerHour: value } };
}

export function setSpendUsdPerDay(policy: NeuronWavesPolicy, value: number | null) {
  return { ...policy, limits: { ...policy.limits, spendUsdPerDay: value } };
}
