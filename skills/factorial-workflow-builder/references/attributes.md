# Factorial Attributes Reference

Complete reference for all node, graph, and edge attributes.

## Node Attributes

### LLM Configuration

#### prompt
**Type:** string  
**Required for:** codergen nodes  
Description: Instructions for the LLM.

```dot
node [prompt="Generate a greeting message"]
```

#### llm_backend
**Type:** string (`api` | `cli`)  
**Default:** `api`  
Description: Which backend to use for LLM execution.

```dot
node [llm_backend="api"]  // Use Vercel AI SDK
node [llm_backend="cli"]  // Execute external command
```

#### llm_provider
**Type:** string  
**Values:** `openai`, `anthropic`, `google`, `github`  
Description: LLM provider to use.

```dot
node [llm_provider="openai", llm_model="gpt-4o-mini"]
```

#### llm_model
**Type:** string  
Description: Provider-specific model name.

```dot
node [llm_model="gpt-4o-mini"]        // OpenAI
node [llm_model="claude-3-5-sonnet"]  // Anthropic
```

### Structured Output

#### output_contract_required
**Type:** boolean  
**Default:** `false`  
Description: Require schema-backed structured output.

```dot
node [output_contract_required="true"]
```

#### output_schema
**Type:** JSON string  
Description: Inline JSON schema for structured output.

```dot
node [output_schema="{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}}}"]
```

#### output_schema_path
**Type:** string (path)  
Description: Path to JSON schema file.

```dot
node [output_schema_path="./schemas/output.json"]
```

#### output_mode
**Type:** string (`auto` | `json` | `tool`)  
**Default:** `auto`  
Description: Structured output mode.

```dot
node [output_mode="json"]
```

### Fan-in Configuration

#### merge_strategy
**Type:** string (`best_score` | `consensus` | `arbiter`)  
**Required for:** parallel.fan_in nodes  
Description: How to merge parallel branch results.

```dot
merge [type="parallel.fan_in", merge_strategy="consensus"]
```

- `best_score`: Select branch with highest score
- `consensus`: All branches must agree
- `arbiter`: Use LLM to decide

#### merge_tiebreak
**Type:** string (`weight` | `lexical` | `latest`)  
Description: Tie-breaking strategy.

```dot
merge [merge_strategy="best_score", merge_tiebreak="weight"]
```

#### arbiter_prompt
**Type:** string  
**Required for:** merge_strategy=arbiter  
Description: Instructions for arbiter decision.

```dot
merge [merge_strategy="arbiter", arbiter_prompt="Select the best implementation based on code quality"]
```

### Quality Gate Configuration

#### gate_type
**Type:** string (`tests` | `lint` | `typecheck` | `security` | `custom`)  
**Required for:** quality.gate nodes  
Description: Type of quality check.

```dot
gate [type="quality.gate", gate_type="lint"]
```

#### gate_command
**Type:** string  
**Required for:** gate_type=custom  
**Optional for:** other gate types  
Description: Command to execute.

```dot
gate [gate_type="custom", gate_command="./custom-check.sh"]
gate [gate_type="lint", gate_command="npm run lint:strict"]
```

#### pass_condition
**Type:** string (expression)  
Description: Condition for pass routing.

```dot
gate [pass_condition="ctx.exit_code === 0"]
```

#### failure_target
**Type:** string (node ID)  
Description: Node ID for deterministic fail routing.

```dot
gate [failure_target="handle_failure"]
```

### Confidence Gate Configuration

#### confidence_signal_path
**Type:** string (context key)  
**Required for:** confidence.gate nodes  
Description: Context key containing numeric confidence value (0-1).

```dot
gate [type="confidence.gate", confidence_signal_path="judge.review.score"]
```

#### escalation_threshold
**Type:** number (0-1)  
**Required for:** confidence.gate nodes  
Description: Threshold below which to escalate.

```dot
gate [escalation_threshold=0.7]
```

#### escalation_target
**Type:** string (node ID)  
**Optional**  
Description: Explicit target node for escalation.

```dot
gate [escalation_target="human_review_node"]
```

### Judge/Rubric Configuration

#### judge_rubric_path
**Type:** string (path)  
**Required for:** judge.rubric nodes  
Description: Path to rubric definition file.

```dot
judge [type="judge.rubric", judge_rubric_path="./rubric.md"]
```

#### score_threshold
**Type:** number  
**Required for:** judge.rubric nodes  
Description: Minimum score required to pass.

```dot
judge [score_threshold=0.8]
```

#### score_weights
**Type:** JSON object  
Description: Weighted dimensions for scoring.

```dot
judge [score_weights="{\"correctness\":0.5,\"style\":0.3,\"tests\":0.2}"]
```

### Retry Configuration

#### retry_policy
**Type:** string (`none` | `standard` | `targeted`)  
**Required for:** failure.analyze nodes  
Description: Retry mode.

```dot
analyze [type="failure.analyze", retry_policy="targeted"]
```

#### retry_classifier_schema
**Type:** JSON schema  
Description: Schema for failure classification output.

```dot
analyze [retry_classifier_schema="{\"type\":\"object\",\"properties\":{\"class\":{\"type\":\"string\"}}}"]
```

#### retry_target_map
**Type:** JSON object  
Description: Map of failure classes to target nodes.

```dot
analyze [retry_target_map="{\"transient\":\"retry_node\",\"fatal\":\"exit_node\"}"]
```

#### retry_target_*
**Type:** string (node ID)  
Description: Specific retry targets by class.

```dot
analyze [retry_target_transient="retry_transient",
         retry_target_quality_gap="improve_quality",
         retry_target_tool_error="fix_tool",
         retry_target_spec_mismatch="clarify_spec"]
```

### Budget Constraints

#### budget_max_tokens
**Type:** number  
Description: Per-node token ceiling.

```dot
node [budget_max_tokens=4000]
```

#### budget_max_cost_usd
**Type:** number  
Description: Per-node cost ceiling in USD.

```dot
node [budget_max_cost_usd=0.50]
```

#### max_retries
**Type:** number  
Description: Number of retry attempts.

```dot
node [max_retries=3]
```

### Timeout Configuration

#### timeout
**Type:** number (milliseconds)  
Description: Per-node duration ceiling.

```dot
node [timeout=30000]  // 30 seconds
```

### Goal Gates

#### goal_gate
**Type:** boolean or string  
Description: Must succeed before pipeline can exit.

```dot
important_check [goal_gate="true"]
```

### CLI Backend Configuration

#### cli_command
**Type:** string  
Description: Raw shell command to execute.

```dot
node [llm_backend="cli", cli_command="echo 'Hello World'"]
```

### Tool Execution

#### tool_command
**Type:** string  
Description: Shell command to execute for `tool` nodes.

```dot
api_call [shape=parallelogram, type="tool", tool_command="curl https://api.example.com"]
```

#### cli_executable
**Type:** string  
Description: Executable name/path.

```dot
node [cli_executable="python3", cli_args="[\"script.py\"]"]
```

#### cli_args
**Type:** JSON array  
Description: Arguments array.

```dot
node [cli_executable="node", cli_args="[\"script.js\",\"--arg\",\"value\"]"]
```

#### cli_env
**Type:** JSON object  
Description: Environment variable overrides.

```dot
node [cli_env="{\"DEBUG\":\"1\",\"API_KEY\":\"secret\"}"]
```

#### cli_cwd
**Type:** string (path)  
Description: Working directory for execution.

```dot
node [cli_cwd="./subdir"]
```

#### cli_timeout_ms
**Type:** number (milliseconds)  
Description: Timeout for CLI execution.

```dot
node [cli_timeout_ms=5000]
```

### Multi-Modal Input

#### image_input
**Type:** string (file path)  
**Supported by:** OpenAI, Anthropic, Gemini  
Description: Path to image file for analysis.

```dot
node [prompt="Describe this UI", image_input="./screenshot.png"]
```

**Supported formats:** PNG, JPEG, GIF, WEBP

#### document_input
**Type:** string (file path)  
**Supported by:** Anthropic, Gemini  
Description: Path to document file for processing.

```dot
node [prompt="Summarize findings", document_input="./paper.pdf"]
```

**Supported formats:** PDF, TXT, MD

#### audio_input
**Type:** string (file path)  
**Supported by:** Gemini  
Description: Path to audio file for transcription/analysis.

```dot
node [prompt="Transcribe meeting", audio_input="./meeting.m4a", llm_provider="gemini"]
```

**Supported formats:** WAV, MP3, M4A, OGG

### Anthropic Caching

#### enable_caching
**Type:** boolean  
**Default:** `false`  
**Provider:** Anthropic only  
Description: Enable prompt caching to reduce costs.

```dot
node [llm_provider="anthropic", enable_caching="true"]
```

**Benefits:** 50-90% cost reduction for multi-turn conversations

#### cache_strategy
**Type:** string (`system-only` | `system-plus-early` | `aggressive`)  
**Default:** `system-plus-early`  
**Provider:** Anthropic only  
Description: Strategy for cache control injection.

```dot
node [enable_caching="true", cache_strategy="system-plus-early"]
```

**Strategies:**
- `system-only`: Cache only the system prompt
- `system-plus-early`: Cache system + first 2 user messages (default)
- `aggressive`: Cache all messages except the most recent

### Subagent Tool Attributes

#### task
**Type:** string  
**Required for:** spawn_agent tool  
Description: Task description for subagent.

```dot
spawn [tool_name="spawn_agent", task="Research authentication methods"]
```

#### agent_id
**Type:** string  
**Required for:** send_input, close_agent tools  
Description: Target subagent ID.

```dot
close [tool_name="close_agent", agent_id="agent-123"]
```

#### agent_id_context_key
**Type:** string  
**Required for:** wait tool  
Description: Context key containing agent ID from spawn.

```dot
wait [tool_name="wait", agent_id_context_key="spawned_agent_id"]
```

#### timeout_ms (for wait)
**Type:** number (milliseconds)  
**Default:** 300000 (5 minutes)  
Description: Timeout for wait operations.

```dot
wait [tool_name="wait", timeout_ms=60000]  // 1 minute
```

### Worktree Configuration (Parallel Nodes)

#### worktree_isolation
**Type:** boolean  
**Default:** `false`  
Description: Enable git worktree isolation for parallel branches.

```dot
parallel [type="parallel", worktree_isolation="true"]
```

#### worktree_base_path
**Type:** string (path)  
**Default:** `<logs_root>/.factorial/worktrees`  
Description: Custom base path for worktrees.

```dot
parallel [worktree_base_path="/tmp/worktrees"]
```

#### worktree_allow_dirty
**Type:** boolean  
**Default:** `false`  
Description: Allow worktree creation with uncommitted changes.

```dot
parallel [worktree_allow_dirty="true"]
```

#### worktree_merge_strategy
**Type:** string (`fail` | `ours` | `theirs`)  
**Default:** `fail`  
Description: Strategy for merging worktrees at fan_in.

```dot
merge [type="parallel.fan_in", worktree_merge_strategy="ours"]
```

- `fail`: Fail on conflicts
- `ours`: Accept main branch version
- `theirs`: Accept worktree version

### Manager Loop Configuration

#### stack_child_dotfile
**Type:** string (path)  
Description: Child workflow reference.

```dot
manager [type="stack.manager_loop", stack_child_dotfile="./child.dot"]
```

#### manager_actions
**Type:** string (comma-separated list)  
Description: Manager action list.

```dot
manager [manager_actions="delegate,observe,steer,wait"]
```

#### manager_poll_interval
**Type:** number (milliseconds)  
Description: Manager poll interval.

```dot
manager [manager_poll_interval=1000]
```

#### manager_max_cycles
**Type:** number  
Description: Maximum polling cycles.

```dot
manager [manager_max_cycles=10]
```

#### manager_stop_condition
**Type:** string (expression)  
Description: Condition to stop manager loop.

```dot
manager [manager_stop_condition="ctx.complete === true"]
```

#### manager_require_lock
**Type:** boolean  
Description: Require lock decision on close.

```dot
manager [manager_require_lock="true"]
```

#### manager_local_child_execution
**Type:** boolean  
Description: Run delegated child via local adapter.

```dot
manager [manager_local_child_execution="true"]
```

## Graph Attributes

Set in `graph [...]` block at the top of the digraph.

### goal
**Type:** string  
Description: Human-readable workflow purpose.

```dot
graph [goal="Review and approve code changes"]
```

### Budget Constraints (Graph-Level)

#### budget_max_tokens
**Type:** number  
Description: Run-level token ceiling across all nodes.

```dot
graph [budget_max_tokens=100000]
```

#### budget_max_cost_usd
**Type:** number  
Description: Run-level cost ceiling in USD.

```dot
graph [budget_max_cost_usd=10.00]
```

#### budget_max_duration_ms
**Type:** number (milliseconds)  
Description: Run-level wall-clock duration ceiling.

```dot
graph [budget_max_duration_ms=300000]  // 5 minutes
```

### Promotion and Quality

#### promotion_stage
**Type:** string (`dev` | `canary` | `prod`)  
**Default:** `dev`  
Description: Workflow promotion target.

```dot
graph [promotion_stage="canary"]
```

**Requirements:**
- `canary`: Requires strict profile behavior
- `prod`: Requires regulated profile behavior

#### quality_profile
**Type:** string (`baseline` | `strict` | `regulated`)  
**Default:** `baseline`  
Description: Validation strictness.

```dot
graph [quality_profile="strict"]
```

**Requirements:**
- `strict`: Requires codergen contracts + at least one quality.gate
- `regulated`: Requires non-custom gate types + at least one judge.rubric

### Layout

#### rankdir
**Type:** string (`TB` | `LR` | `BT` | `RL`)  
**Default:** `TB`  
Description: Graph layout direction.

```dot
graph [rankdir=LR]  // Left-to-right
```

## Edge Attributes

### condition
**Type:** string (expression)  
Description: Condition expression for routing.

```dot
node_a -> node_b [condition="ctx.score > 0.8"]
```

### weight
**Type:** number  
Description: Edge priority (higher = preferred).

```dot
node_a -> preferred [weight=10]
node_a -> fallback [weight=5]
```

### label
**Type:** string  
Description: Human-readable route label.

```dot
node -> next [label="Success path"]
```

### fidelity
**Type:** string (`compact` | `full`)  
Description: Branch fidelity override.

```dot
node -> branch [fidelity="full"]
```

### thread_id
**Type:** string  
Description: Explicit thread affinity for routing.

```dot
node -> branch_a [thread_id="thread-1"]
node -> branch_b [thread_id="thread-2"]
```

### loop_restart
**Type:** boolean  
Description: Emit restart boundary and continue in fresh run segment.

```dot
node -> restart_point [loop_restart="true"]
```

Creates new run segment at `<logs_root>/restart-XXX`.

## Context Variable Patterns

### Reading Context

Nodes can access context set by previous nodes:

```dot
// Judge node sets judge.<node_id>.score
review [type="judge.rubric", ...]

// Confidence gate reads it
gate [type="confidence.gate", confidence_signal_path="judge.review.score"]
```

### Common Context Keys

- `ctx.<node_id>.output`: Node output
- `judge.<node_id>.score`: Judge score
- `judge.<node_id>.passed`: Judge pass/fail
- `judge.<node_id>.score_threshold`: Judge threshold
- `failure.class`: Failure classification
- `retry.class`: Retry classification
- `failure.analyze.<node_id>.class`: Failure analyze result

## Type Aliases

### node_type
`node_type` is accepted as alias for `type`:

```dot
node [node_type="quality.gate"]  // Same as type="quality.gate"
```

### Shape Aliases

- `circle` → `start`
- `doublecircle` → `exit`
