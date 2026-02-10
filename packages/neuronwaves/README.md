# NeuronWaves

NeuronWaves is a domain agnostic cognition loop engine designed to power Synthetic Digital Humans.

## PR 1 scope

1. Typed artifact contracts
2. Deterministic artifact persistence under agent workspace
3. Three autonomy levels with a policy gate
4. Audit logging for planned and executed actions
5. Minimal orchestrator loop that runs end to end with stub execution
6. Unit tests plus an integration test

## Artifacts produced per loop run

1. Observation
2. PlanGraph
3. Audit entries
4. EvaluationRecord
5. LoopRunSnapshot

Storage location:

`<agentWorkspace>/.openclaw/neuronwaves/`

## Autonomy levels

- Level 1 Assist
- Level 2 Delegated
- Level 3 Dev

Loop invariant: Observe → Recall → Goal → Plan → Gate → Act → Evaluate → Persist
