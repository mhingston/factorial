# Factorial Node Types Reference

Complete reference for all node types with attributes and examples.

## Control Flow Nodes

### start
**Shape:** `Mdiamond` (or `circle` as alias)
**Required:** Yes (exactly 1)

Entry point for the workflow.

```dot
start [shape=Mdiamond, label="Start"]
```

### exit
**Shape:** `Msquare` (or `doublecircle` as alias)  
**Required:** Yes (exactly 1)

Exit point for the workflow.

```dot
exit [shape=Msquare, label="Exit"]
```

## LLM Task Nodes

### codergen (default)
**Shape:** `box`
**Type:** Default when no type specified

Executes LLM prompts.

**Required attributes:**
- `prompt`: Instructions for the LLM

**Optional attributes:**
- `llm_backend`: `api` or `cli`
- `llm_provider`: Provider name
- `llm_model`: Model name
- `output_contract_required`: Require schema validation
- `output_schema`: Inline JSON schema
- `output_schema_path`: Path to schema file
- `output_mode`: `auto`, `json`, or `tool`
- `budget_max_tokens`: Token limit
- `budget_max_cost_usd`: Cost limit in USD
- `timeout`: Timeout in milliseconds
- `max_retries`: Number of retries
- `cli_command`: Shell command (if backend=cli)
- `cli_executable`: Executable path
- `cli_args`: JSON array of arguments
- `cli_env`: Environment variable overrides
- `cli_cwd`: Working directory
- `cli_timeout_ms`: CLI timeout

```dot
// API backend
generate [prompt="Write a function", llm_provider="openai", llm_model="gpt-4o-mini"]

// CLI backend
script [llm_backend="cli", cli_command="./generate.sh", cli_timeout_ms=5000]

// With structured output
structured [prompt="Generate JSON", output_contract_required="true", output_schema_path="./schema.json"]
```

## Human-in-the-Loop Nodes

### wait.human
**Shape:** `hexagon`

Pauses for human approval.

**Attributes:**
- `label`: Display label
- `goal_gate`: Must succeed before exit

```dot
review [shape=hexagon, type="wait.human", label="Manual Review Required"]
```

## Routing Nodes

### conditional
**Shape:** `diamond`

Branches based on condition expression.

**Attributes:**
- Condition defined on outgoing edges via `condition` attribute

```dot
decision [shape=diamond, type="conditional"]
decision -> path_a [label="High priority", condition="ctx.priority > 5"]
decision -> path_b [label="Low priority", condition="ctx.priority <= 5"]
```

### confidence.gate
**Shape:** `diamond`

Auto-approve high confidence, escalate low confidence.

**Required attributes:**
- `confidence_signal_path`: Context key containing numeric value (0-1)
- `escalation_threshold`: Value below which to escalate

**Optional attributes:**
- `escalation_target`: Node ID for escalation (default: find wait.human)

```dot
gate [type="confidence.gate",
      confidence_signal_path="judge.review.score",
      escalation_threshold=0.8,
      escalation_target="human_review"]
```

## Parallel Execution Nodes

### parallel
**Shape:** `component`

Fan-out to parallel branches.

**Optional attributes:**
- `worktree_isolation`: `true` to use git worktrees (default: `false`)
- `worktree_base_path`: Custom worktree location
- `worktree_allow_dirty`: Allow uncommitted changes

```dot
fan_out [shape=component, type="parallel", worktree_isolation="true", worktree_allow_dirty="false"]
```

### parallel.fan_in
**Shape:** `tripleoctagon`

Merge parallel branches.

**Optional attributes:**
- `merge_strategy`: `best_score`, `consensus`, or `arbiter`
- `merge_tiebreak`: `weight`, `lexical`, or `latest`
- `arbiter_prompt`: Required if strategy=arbiter
- `worktree_merge_strategy`: `fail`, `ours`, or `theirs`

```dot
fan_in [shape=tripleoctagon, type="parallel.fan_in", merge_strategy="consensus"]
```

## Quality and Governance Nodes

### quality.gate
**Shape:** `box`

Run quality checks (lint, test, typecheck, security).

**Required attributes:**
- `gate_type`: `lint`, `tests`, `typecheck`, `security`, or `custom`

**Optional attributes:**
- `gate_command`: Command to execute (required for custom, optional for others)
- `pass_condition`: Expression for pass routing
- `failure_target`: Node ID for failure routing

```dot
lint [type="quality.gate", gate_type="lint", gate_command="npm run lint"]
test [type="quality.gate", gate_type="tests", gate_command="npm run test:run"]
security [type="quality.gate", gate_type="security", gate_command="npm audit"]
```

### judge.rubric
**Shape:** `box`

AI evaluation with structured scoring.

**Required attributes:**
- `judge_rubric_path`: Path to rubric definition file
- `score_threshold`: Minimum passing score

**Optional attributes:**
- `score_weights`: JSON object weighting dimensions
- `output_contract_required`: Require schema validation

```dot
review [type="judge.rubric",
        judge_rubric_path="./review-rubric.md",
        score_threshold=0.8,
        score_weights="{\"correctness\":0.5,\"style\":0.3,\"tests\":0.2}"]
```

**Rubric file format:**
```markdown
# Review Rubric

## Correctness
Does the code work correctly?
- Score 1.0: All edge cases handled
- Score 0.5: Basic functionality works
- Score 0.0: Does not work

## Style
Is the code well-formatted?
- Score 1.0: Follows all conventions
- Score 0.0: Poor formatting
```

### failure.analyze
**Shape:** `box`

Classify failures for targeted retry.

**Required attributes:**
- `retry_policy`: `none`, `standard`, or `targeted`

**Optional attributes (for targeted policy):**
- `retry_target_transient`: Target for transient failures
- `retry_target_quality_gap`: Target for quality issues
- `retry_target_tool_error`: Target for tool errors
- `retry_target_spec_mismatch`: Target for spec mismatches
- `retry_target_map`: JSON map of custom classes to targets
- `retry_classifier_schema`: Custom schema for classification

```dot
analyze [type="failure.analyze",
         retry_policy="targeted",
         retry_target_transient="retry_transient",
         retry_target_quality_gap="improve_quality"]
```

### stack.observe / stack.steer
**Shape:** `box`

Observer and steering stages for manager loops.

**Note:** Handled by codergen handler in CLI runs.

```dot
observe [type="stack.observe", prompt="Observe current state"]
steer [type="stack.steer", prompt="Provide steering guidance"]
```

## Tool and External Nodes

### tool
**Shape:** `parallelogram`

Execute external tool.

```dot
api_call [shape=parallelogram, type="tool", tool_command="curl https://api.example.com"]
```

### stack.manager_loop
**Shape:** `house`

Supervisor pattern with manager actions.

**Attributes:**
- `stack_child_dotfile`: Child workflow reference
- `manager_actions`: List of actions (`delegate`, `observe`, `steer`, `wait`)
- `manager_poll_interval`: Polling interval in ms
- `manager_max_cycles`: Maximum cycles
- `manager_stop_condition`: Condition expression
- `manager_require_lock`: Require lock decision on close
- `manager_local_child_execution`: Use local adapter hook

```dot
manager [shape=house, type="stack.manager_loop",
         stack_child_dotfile="./child.dot",
         manager_actions="delegate,observe,steer",
         manager_max_cycles=10]
```

## Node Type Compatibility

### Graph Mode Policy
- **Accepted:** `digraph`, `strict digraph`
- **Rejected:** Undirected `graph` mode

### Shape Type Aliases
- `circle` → `start`
- `doublecircle` → `exit`
- `node_type` attribute → `type` attribute

### Handler Registry Mapping
- All types dispatch through handler registry
- Backend selection: `api` (Vercel AI SDK) or `cli` (external commands)
