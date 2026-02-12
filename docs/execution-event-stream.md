# Execution Event Stream

Last updated: 2026-02-12

Factorial emits execution events during pipeline runs. These events are intended for UI rendering,
telemetry, and downstream automation. Events are emitted on the `ExecutionEngine` `event` channel.

## Schema

Every event conforms to the following shape:

```
{
  "type": "RUN_START",
  "timestamp": "2026-02-12T00:00:00.000Z",
  "data": {}
}
```

### Event Types

- `RUN_START`: Execution segment start.
  - `data.graph`: Graph ID
  - `data.segment_index`: Segment number (0-based)
  - `data.logs_root`: Active logs root
  - `data.restart`: Boolean
  - `data.restarted_from`: Node ID (restart only)
  - `data.target`: Restart target node ID (restart only)
- `NODE_START`: Node execution begins.
  - `data.node`: Node ID
  - `data.attempt`: Attempt count
- `NODE_COMPLETE`: Node execution completed.
  - `data.node`: Node ID
  - `data.outcome`: Outcome payload
- `NODE_RETRY`: Node retry scheduled.
  - `data.node`: Node ID
  - `data.attempt`: Current attempt count
  - `data.max_attempts`: Max attempts for this node
  - `data.reason`: Retry reason (string)
- `NODE_FAIL`: Node execution failed.
  - `data.node`: Node ID
  - `data.error`: Error string
- `EDGE_SELECT`: Next edge selected.
  - `data.from`: From node ID
  - `data.to`: To node ID
  - `data.label`: Edge label (if present)
  - `data.condition`: Edge condition (if present)
  - `data.weight`: Edge weight (if present)
- `CHECKPOINT_SAVE`: Checkpoint written.
  - `data.node`: Node ID
- `LOOP_DETECTED`: Loop detector triggered.
  - `data.node`: Node ID
  - `data.pattern`: Loop pattern label
  - `data.message`: Steering warning text
- `RUN_COMPLETE`: Execution segment completed.
  - `data.outcome`: Final outcome
  - `data.restart`: Boolean (true if ending a segment before restart)
  - `data.segment_index`: Segment number (restart only)
  - `data.restarted_from`: Node ID (restart only)
  - `data.target`: Restart target node ID (restart only)
- `ERROR`: Unhandled execution error.
  - `data.error`: Error instance or message

## Sample Consumer

```ts
import { ExecutionEngine } from '@mhingston5/factorial';

const engine = new ExecutionEngine(graph, config);
engine.on('event', event => {
  switch (event.type) {
    case 'NODE_START':
      console.log(`Starting ${event.data.node}`);
      break;
    case 'RUN_COMPLETE':
      console.log(`Outcome: ${event.data.outcome.status}`);
      break;
    default:
      break;
  }
});
```
