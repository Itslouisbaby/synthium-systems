# NeuronWaves

NeuronWaves is a domain agnostic cognition loop engine designed to power Synthetic Digital Humans.

## PR 2: Planning, Memory Adaptation, and Policy Gate Integration

This PR introduces:

1. **Planner Component**: Generates execution plans from observations and context
2. **Memory Adapter Interface**: Retrieves relevant memories (flash and warm hits)
3. **Policy Gate**: Controls execution autonomy based on safety decisions
4. **Orchestrator**: Coordinates all components with approval semantics

## Architecture

### Autonomy Levels
- **0.0**: Fully manual (human approval for every step)
- **0.5**: Semi-autonomous (approve for significant actions)
- **1.0**: Fully autonomous (execute without approval)

### Core Components

1. **Observation**: Input to the planner representing events or requests
2. **ContextBundle**: Execution context containing session state, tools, and configuration
3. **Planner**: Generates PlanGraph from Observation + Context + AutonomyLevel
4. **MemoryAdapter**: Retrieves flash (recent) and warm (compressed) memories
5. **PolicyGate**: Evaluates actions and returns Allow/Block/Prompt decisions
6. **Orchestrator**: Manages plan execution, approvals, and state
7. **PlanGraph**: Dependency graph of steps to execute

### Artifacts Produced per Loop Run

1. Observation record
2. PlanGraph with step metadata
3. Audit entries for policy decisions
4. EvaluationRecord with outcomes
5. LoopRunSnapshot for persistence

Storage location: `<agentWorkspace>/.openclaw/neuronwaves/`

## Loop Invariant

Observe → Recall → Goal → Plan → Gate → Act → Evaluate → Persist

## Installation

```bash
pnpm install
```

## Building

```bash
pnpm build
```

## Testing

```bash
pnpm test
```

## Development

```bash
pnpm dev
```

## Usage

```typescript
import { runNeuronWavesLoop } from '@synthium/neuronwaves';

const result = await runNeuronWavesLoop({
  sessionKey: 'session-123',
  workspaceDir: '/path/to/workspace',
  text: 'Search for information and send me the results',
  autonomy: {
    level: 0.5, // semi-autonomous
    // ... other config
  }
});
```

## License

MIT
