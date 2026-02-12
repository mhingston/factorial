# Factorial

**Define AI workflows as code. Execute with deterministic reliability.**

Factorial is a DOT-based workflow orchestrator for multi-stage AI pipelines. Write your workflow as a Graphviz graph, run it with built-in quality gates, human approvals, and parallel execution.

> **Reference Implementation**: Factorial is a production implementation of the [StrongDM Factory specification](https://factory.strongdm.ai/products/attractor) (also known as the Attractor execution model), with additional enhancements for self-hosting maturity, DTU validation, and deterministic governance.

```dot
digraph CodeReview {
  start [shape=Mdiamond]
  exit  [shape=Msquare]
  
  review [label="Review", prompt="Review this code change"]
  gate [type="confidence.gate", escalation_threshold=0.8]
  human [type="wait.human", label="Needs Review"]
  
  start -> review -> gate
  gate -> exit [label="Auto-approved"]
  gate -> human [label="Escalate"]
  human -> exit
}
```

## Why Factorial?

- **Workflows as Graphs**: Version-control your AI pipelines as DOT files
- **Production-Ready**: Built-in retry, checkpointing, resume, and replay
- **Quality Gates**: Lint, test, typecheck, and rubric-based AI evaluation
- **Human-in-the-Loop**: Automatic escalation when confidence is low
- **Parallel Execution**: Fan-out/fan-in with git worktree isolation
- **Deterministic**: Same input always produces same output + artifacts

## Installation

```bash
npm install @mhingston5/factorial
```

Requirements: Node.js >= 20

For API backend (default), also install your provider:
```bash
npm install @ai-sdk/openai  # or @ai-sdk/anthropic, @ai-sdk/google
```

## Quick Start

### 1. Create a Workflow

```dot
# workflow.dot
digraph MyWorkflow {
    graph [goal="Generate and review code"]
    rankdir=LR

    start [shape=Mdiamond]
    exit  [shape=Msquare]

    generate [prompt="Write a Fibonacci function"]
    review [shape=hexagon, type="wait.human", label="Review"]
    
    start -> generate -> review -> exit
}
```

### 2. Configure Environment

```bash
# .env
OPENAI_API_KEY=sk-...
```

### 3. Run It

```bash
npx factorial run --graph workflow.dot --logs-root ./logs
```

Replay later with identical config:
```bash
npx factorial replay --manifest ./logs/run_manifest.json
```

### 4. Programmatic Usage

```typescript
import { Attractor } from '@mhingston5/factorial';

const attractor = new Attractor({
  dotFile: './workflow.dot',
  logsRoot: './logs',
});

const result = await attractor.run();
console.log(`Status: ${result.status}`);
```

## AI Workflow Builder

Factorial includes a comprehensive AI skill for building DOT workflows:

```bash
# The skill is available at:
# skills/factorial-workflow-builder/
#
# It provides:
# - Complete node type reference (start, codergen, wait.human, quality.gate, etc.)
# - All node and graph attributes with examples
# - Common workflow patterns and best practices
```

See [skills/factorial-workflow-builder/](skills/factorial-workflow-builder/) for the full skill documentation, including node types reference and attributes catalog.

## CLI Commands

| Command | Purpose |
|---------|---------|
| `run` | Execute a workflow |
| `validate` | Parse + lint without executing |
| `replay` | Re-run from manifest with fixed config |
| `resume` | Continue from checkpoint |
| `visualize` | Output graph as JSON |
| `manifest` | Inspect run metadata |
| `confidence-tune` | Tune escalation thresholds from history |
| `compound-weekly` | Generate metrics reports (includes cost-per-PR proxy) |
| `dtu-run` | Run Digital Twin Universe scenarios |
| `dtu-curate` | Create and manage DTU scenario fixtures |

Event consumers can subscribe to the execution stream documented in
[Execution Event Stream](docs/execution-event-stream.md).

## Node Types

Use Graphviz shapes + Factorial types to define nodes:

| Shape | Type | Purpose |
|-------|------|---------|
| `Mdiamond` | `start` | Entry point |
| `box` | `codergen` (default) | LLM task |
| `hexagon` | `wait.human` | Human approval |
| `diamond` | `conditional` / `confidence.gate` | Branch routing |
| `component` | `parallel` | Fan-out |
| `tripleoctagon` | `parallel.fan_in` | Fan-in |
| `Msquare` | `exit` | Exit point |

**Quality & Governance:**
- `quality.gate` - Run commands (lint, test, typecheck)
- `judge.rubric` - AI evaluation with scoring
- `failure.analyze` - Classify failures for targeted retry

See [Node Types Reference](skills/factorial-workflow-builder/references/node-types.md) for full details.

## Example: Code Review Workflow

```dot
digraph CodeReview {
  graph [goal="Review code with quality checks"]
  
  start [shape=Mdiamond]
  exit  [shape=Msquare]
  
  lint [type="quality.gate", gate_type="lint", 
        gate_command="npm run lint"]
  test [type="quality.gate", gate_type="tests",
        gate_command="npm run test:run"]
  
  review [type="judge.rubric",
          judge_rubric_path="./review-rubric.md",
          score_threshold=0.8]
  
  gate [type="confidence.gate",
        confidence_signal_path="judge.review.score",
        escalation_threshold=0.7,
        escalation_target="human_review"]
  
  human_review [type="wait.human"]
  
  start -> lint -> test -> review -> gate
  gate -> exit [label="Auto-approved"]
  gate -> human_review [label="Needs review"]
  human_review -> exit
}
```

More examples in [`examples/`](./examples/):
- `simple.dot` - Linear workflow
- `branching.dot` - Conditional logic with loops
- `parallel.dot` - Parallel execution
- `engineering-loop-*.dot` - Manager delegation pattern

## Configuration

Create `config.json` for defaults:

```json
{
  "logs_root": "./logs",
  "llm_backend": "api",
  "default_provider": "openai",
  "providers": {
    "openai": {
      "api_key_env": "OPENAI_API_KEY",
      "default_model": "gpt-4o-mini"
    }
  },
  "checkpoint_interval": 1
}
```

**Backends:**
- `api` (default) - Vercel AI SDK with provider libraries
- `cli` - Execute external commands directly

## Key Features

<details>
<summary><b>Deterministic Execution</b></summary>

Every run produces:
- Structured logs under `<logs_root>/<node_id>/`
- `run_manifest.json` with full provenance
- Checkpoint files for resume/replay
- Reproducible with `factorial replay`
</details>

<details>
<summary><b>Quality Gates</b></summary>

Enforce standards before proceeding:
- `quality.gate` - Run lint, tests, typecheck, security scans
- `judge.rubric` - AI-powered evaluation with scoring
- `confidence.gate` - Auto-approve high confidence, escalate low confidence
- Promotion stages: `dev` → `canary` → `prod` with increasing strictness
</details>

<details>
<summary><b>Parallel Worktree Isolation</b></summary>

For parallel branches that modify files:

```dot
parallel [type="parallel", worktree_isolation="true"]
variant_a [cli_command="generate python"]
variant_b [cli_command="generate typescript"]
merge [type="parallel.fan_in", merge_strategy="consensus"]
```

Each branch runs in isolated git worktree, merged at fan-in.
</details>

<details>
<summary><b>Digital Twin Universe (DTU)</b></summary>

Test against deterministic fixtures:
- Reference twins for external dependencies (Jira, Slack, GitHub, AWS S3, Database)
- Scenario harness for smoke/regression/holdout testing
- Deterministic failure simulation

```bash
npm run dtu:run
```
</details>

<details>
<summary><b>Scenario Satisfaction Reports</b></summary>

DTU runs emit a satisfaction report (pass-rate and holdout-rate) you can track as a factory KPI.

```bash
npm run dtu:run
```

The report schema and fields are documented in [DTU Satisfaction Report](docs/dtu-satisfaction-report.md).
</details>

<details>
<summary><b>Governance & Audit</b></summary>

Built-in automation for repository health:
- Documentation freshness checks
- Cross-document claims consistency
- PR compound artifact validation
- Release hardening (SBOM, signing)
- Reliability SLO monitoring

See [Governance Scripts](#governance-scripts) below.
</details>

## Development

```bash
# Install
npm install

# Build
npm run build

# Test
npm run test:run        # Unit tests
npm run test:golden     # Regression suite
npm run test:worktree   # Git worktree parity

# Quality
npm run lint
npm run typecheck

# Audit
npm run agent:audit
npm run docs:freshness
npm run claims:audit
```

## Governance Scripts

Reuse Factorial's governance automation in your repo:

```bash
# Documentation freshness (README/AGENTS/ROADMAP sync)
node node_modules/@mhingston5/factorial/scripts/docs-freshness-audit.js \
  --readme ./README.md --agents ./AGENTS.md --roadmap ./ROADMAP.md \
  --package-json ./package.json --report ./logs/freshness.json

# Claims consistency (roadmap/spec/matrix alignment)
node node_modules/@mhingston5/factorial/scripts/claims-consistency-audit.js \
  --roadmap ./ROADMAP.md --matrix ./docs/spec-conformance-matrix.md \
  --report ./logs/consistency.json

# PR compound validation
node node_modules/@mhingston5/factorial/scripts/check-pr-compound-artifacts.js \
  --body-file ./pr-body.md
```

## Architecture

```
DOT File → Parser → Graph AST → Execution Engine → Handlers → AI Backend
                                                      ↓
                                              (api: Vercel SDK | cli: Commands)
```

Core preserves the [Attractor execution model](https://factory.strongdm.ai/products/attractor) with production enhancements:
- Self-hosting maturity ladder with objective gates
- DTU validation platform
- Deterministic replay and flake detection
- Multi-provider parity evidence

## Documentation

- [Roadmap](ROADMAP.md) - Current status and direction
- [Self-hosting Maturity](docs/self-hosting-maturity-ladder.md) - Level definitions and gates
- [Spec Conformance](docs/spec-conformance-matrix.md) - Attractor spec alignment
- [Companion Spec Scope](docs/companion-spec-scope-contract.md) - Implemented features
- [Execution Event Stream](docs/execution-event-stream.md) - Event schema for UI/telemetry consumers
- [DTU Satisfaction Report](docs/dtu-satisfaction-report.md) - Scenario satisfaction metrics
- [Active Handoff](docs/roadmap/active-handoff.md) - Current execution context

## License

MIT

---

**Companion specs adopted**: `coding-agent-loop`, `unified-llm` (bounded scope)

**Current maturity level**: `autonomous` with BK-018 Phase 1-4 complete (FA-001–FA-009)

See [maturity ladder](docs/self-hosting-maturity-ladder.md) for full-autonomy roadmap
