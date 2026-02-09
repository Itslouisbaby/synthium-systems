# NeuronWaves (PR1)

NeuronWaves is the deterministic skeleton for a safe, autonomous loop. PR1 ships typed contracts,
artifact persistence, a 3-tier policy gate, and a stubbed orchestrator that never executes external
actions.

## Goals (PR1)

- Typed contracts used everywhere (no untyped objects crossing modules).
- Deterministic artifact output under `.openclaw/neuronwaves/`.
- Safe-by-default policy gate with three autonomy tiers.
- Minimal loop orchestrator that is runnable, testable, and non-destructive.

## Artifacts

A single loop run writes at least one entry to each file:

- `.openclaw/neuronwaves/observations.jsonl`
- `.openclaw/neuronwaves/plans.jsonl`
- `.openclaw/neuronwaves/evaluations.jsonl`
- `.openclaw/neuronwaves/audit/actions.jsonl`
- `.openclaw/neuronwaves/state/active.json`

## API (PR1)

```ts
import { runLoop } from "@openclaw/neuronwaves";

await runLoop({
  input: {
    message: "Summarize my open tasks",
    source: "telegram",
  },
  policy: { tier: 1 },
  workspaceDir: "/path/to/agent/workspace",
});
```

## Notes

- External execution is stubbed in PR1.
- CoreMemories integration is best-effort and never blocks the loop.
