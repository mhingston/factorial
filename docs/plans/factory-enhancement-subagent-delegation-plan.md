# Plan: Factory Enhancement via Subagent Delegation

## Metadata
- Date: 2026-02-12
- Author: Factory Analysis
- Related issue/PR: Factory Improvements Batch
- Risk level: medium

## Requirement / Behavior Delta
- Current behavior: Factorial uses unified toolset, generic LLM adapter without explicit reasoning tracking, no prompt caching, heavy ManagerLoop-only subagent pattern, no multi-modal support
- Target behavior: Provider-native tool profiles, explicit reasoning token tracking in artifacts, Anthropic prompt caching annotations, lightweight spawn_agent tools alongside ManagerLoop, multi-modal content support (images, audio, documents)
- Why this change is needed: Improve model performance, reduce costs (especially for Anthropic), enable parallel exploration with proper context isolation, support modern multi-modal workflows

## Subagent Delegation Strategy

This plan delegates 5 parallel workstreams to subagents:

| Workstream | Subagent ID | Scope | Dependencies |
|------------|-------------|-------|--------------|
| Provider-Native Tool Alignment | SA-001 | Create provider-specific tool profiles and system prompts | None |
| Reasoning Token Transparency | SA-002 | Extend adapter contract to surface thinking blocks | None |
| Anthropic Prompt Caching | SA-003 | Implement automatic cache_control injection | SA-002 (reasoning tokens) |
| Lightweight Subagent Tools | SA-004 | Add spawn_agent, wait, close_agent tools | None |
| Multi-Modal Support | SA-005 | Extend ContentPart types and adapters for images/audio/docs | SA-002 (adapter contract) |

## Codebase Research

| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Tool Registry | packages/core/src/handlers/registry.ts | Single registry, shape-based resolution | Needs provider-profile aware registry |
| LLM Adapter | packages/core/src/llm/index.ts, packages/core/src/types/index.ts | Unified complete/stream contract | Need to add reasoning field to result types |
| Codergen Handler | packages/core/src/handlers/builtin.ts | Routes all LLM calls through adapter | Needs artifact updates for reasoning.md |
| Manager Loop | packages/core/src/handlers/builtin.ts:3067-3359 | Heavy DOT-based child workflows | Keep this, add lightweight alternative |
| Content Types | packages/core/src/types/index.ts | Text-only content parts | Need ImageData, AudioData, DocumentData |

## Design Outline

### Proposed Approach
1. **Parallel Development**: 5 subagents work independently on their workstreams
2. **Integration Point**: All changes merge through the `LlmAdapter` interface and artifact system
3. **Backward Compatibility**: Existing workflows continue working; new features are opt-in via node attributes
4. **Evidence Requirements**: Each subagent must produce:
   - Implementation code with tests
   - Golden fixture updates
   - Documentation updates
   - Deterministic evidence artifacts

### Affected Interfaces and Contracts

```typescript
// LlmAdapter contract extensions (packages/core/src/types/index.ts)
interface LlmCompleteResult {
  text: string;
  reasoning?: string;                    // NEW
  reasoning_tokens?: number;             // NEW
  usage: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;           // NEW
    cache_read_tokens?: number;          // NEW
    cache_write_tokens?: number;         // NEW
  };
}

// ContentPart extensions for multi-modal
interface ContentPart {
  kind: ContentKind;
  text?: string;
  image?: ImageData;                     // NEW
  audio?: AudioData;                     // NEW
  document?: DocumentData;               // NEW
  // ... existing fields
}

// Provider profile (NEW)
interface ProviderProfile {
  id: 'openai' | 'anthropic' | 'gemini';
  tools: ToolDefinition[];              // Provider-specific toolset
  systemPromptTemplate: string;
  supportsCaching: boolean;
  supportsReasoning: boolean;
  supportsMultimodal: boolean;
}

// Subagent tools (NEW)
interface SubagentTools {
  spawn_agent: (args: { task: string; model?: string; tools?: string[] }) => Promise<{ agent_id: string }>;
  send_input: (args: { agent_id: string; message: string }) => Promise<void>;
  wait: (args: { agent_id: string }) => Promise<SubagentResult>;
  close_agent: (args: { agent_id: string }) => Promise<void>;
}
```

## Subagent Task Definitions

### SA-001: Provider-Native Tool Alignment

**Scope**: Create provider-specific tool profiles matching codex-rs, Claude Code, and gemini-cli conventions.

**Deliverables**:
1. `packages/core/src/profiles/openai.ts` - OpenAI profile with apply_patch tool
2. `packages/core/src/profiles/anthropic.ts` - Anthropic profile with old_string/new_string edit_file
3. `packages/core/src/profiles/gemini.ts` - Gemini profile with native tool conventions
4. `packages/core/src/profiles/index.ts` - Profile registry and resolution
5. Update `CodergenHandler` to use provider profiles based on `llm_provider` node attribute
6. Tests demonstrating equivalent outcomes across profiles for same task

**Key Implementation**:
```typescript
// packages/core/src/profiles/openai.ts
export const openaiProfile: ProviderProfile = {
  id: 'openai',
  tools: [
    readFileTool,
    applyPatchTool,  // v4a format instead of edit_file
    writeFileTool,
    shellTool,
    grepTool,
    globTool
  ],
  systemPromptTemplate: openaiCodexSystemPrompt,
  supportsCaching: true,
  supportsReasoning: true,
  supportsMultimodal: true
};
```

**Artifact Requirements**:
- `docs/metrics/reports/provider-profile-parity-latest.json` - Evidence of equivalent outcomes
- Golden tests in `tests/golden/` showing profile selection

### SA-002: Reasoning Token Transparency

**Scope**: Extend adapter contract to surface thinking/reasoning blocks explicitly.

**Deliverables**:
1. Update `LlmCompleteResult` and `LlmStreamEvent` types with reasoning fields
2. Modify `DefaultLlmAdapter` to extract reasoning from:
   - OpenAI: `usage.completion_tokens_details.reasoning_tokens`
   - Anthropic: thinking blocks in response
   - Gemini: `usageMetadata.thoughtsTokenCount`
3. Update artifact writers to create `reasoning.md` files
4. Add reasoning token tracking to economics/cost calculation
5. Update `run_manifest.json` schema to include reasoning fields

**Key Implementation**:
```typescript
// In DefaultLlmAdapter.complete()
const response = await generateText({...});
const reasoningTokens = response.usage?.completionTokensDetails?.reasoningTokens;
const reasoningText = extractReasoningContent(response); // Provider-specific

// Write reasoning artifact
await writeFile(
  join(stageDir, 'reasoning.md'),
  reasoningText || '[No reasoning content available]'
);

return {
  text: response.text,
  reasoning: reasoningText,
  reasoning_tokens: reasoningTokens,
  usage: {
    input_tokens: response.usage.promptTokens,
    output_tokens: response.usage.completionTokens,
    reasoning_tokens: reasoningTokens
  }
};
```

**Artifact Requirements**:
- Updated `docs/execution-event-stream.md` with reasoning event types
- Test coverage showing reasoning tokens tracked for all providers

### SA-003: Anthropic Prompt Caching

**Scope**: Implement automatic `cache_control` annotation for Anthropic Messages API.

**Deliverables**:
1. Create `packages/core/src/llm/anthropic-adapter.ts` specialized adapter
2. Implement automatic cache breakpoint injection:
   - Cache system prompt
   - Cache early conversation turns (first 2-3 messages)
   - Don't cache the most recent turn (it changes)
3. Update usage tracking to report `cache_read_tokens` and `cache_write_tokens`
4. Add cost calculation support for cached token pricing (90% discount)
5. Configuration option to disable caching per-node

**Key Implementation**:
```typescript
// Automatic cache breakpoint strategy
function injectCacheBreakpoints(messages: AnthropicMessage[]): AnthropicMessage[] {
  return messages.map((msg, index) => {
    // Cache system prompt and early turns
    if (index === 0 || (index <= 2 && msg.role === 'user')) {
      return {
        ...msg,
        content: Array.isArray(msg.content) 
          ? msg.content.map((block, bIdx) => 
              bIdx === msg.content.length - 1 
                ? { ...block, cache_control: { type: 'ephemeral' } }
                : block
            )
          : msg.content
      };
    }
    return msg;
  });
}
```

**Artifact Requirements**:
- `docs/metrics/reports/anthropic-caching-effectiveness-latest.json` - Before/after cost comparison
- Evidence that caching reduces token costs by 50-90%

### SA-004: Lightweight Subagent Tools

**Scope**: Implement spawn_agent, wait, send_input, close_agent tools alongside existing ManagerLoop.

**Deliverables**:
1. Create `packages/core/src/subagents/lightweight-agent.ts` - ToolLoopAgent equivalent
2. Create `packages/core/src/subagents/registry.ts` - Active subagent tracking
3. Implement tool handlers:
   - `SpawnAgentTool` - Creates isolated agent with limited toolset
   - `WaitForAgentTool` - Blocks until completion, returns summary
   - `SendInputTool` - Send mid-task steering
   - `CloseAgentTool` - Force termination
4. Add `toModelOutput` summarization (per Vercel pattern) to keep parent context clean
5. Support parallel execution of multiple subagents
6. Configuration for max_subagent_depth (default: 1)

**Key Implementation**:
```typescript
// Lightweight agent for simple tasks
export class LightweightSubagent {
  private session: SubagentSession;
  private toolRegistry: ToolRegistry;
  
  constructor(config: SubagentConfig) {
    this.session = new SubagentSession({
      model: config.model,
      maxTurns: config.max_turns || 50,
      toolRegistry: this.buildLimitedToolRegistry(config.allowed_tools)
    });
  }
  
  async execute(task: string): Promise<SubagentResult> {
    const result = await this.session.run(task);
    return {
      output: result.text,
      success: result.success,
      turns_used: result.turns,
      // Summarize for parent context
      summary: this.summarizeForParent(result)
    };
  }
}

// Tool handler
export class SpawnAgentTool implements Tool {
  async execute(args: { task: string; model?: string }): Promise<ToolResult> {
    const agentId = generateUUID();
    const subagent = new LightweightSubagent({
      model: args.model || 'default',
      task: args.task
    });
    
    subagentRegistry.register(agentId, subagent);
    
    // Start execution but don't block
    subagent.execute(args.task).then(result => {
      subagentRegistry.complete(agentId, result);
    });
    
    return {
      content: { agent_id: agentId, status: 'running' },
      is_error: false
    };
  }
}
```

**Artifact Requirements**:
- `docs/solutions/lightweight-subagent-pattern.md` - Design documentation
- Example DOT workflows showing parallel subagent usage
- Performance comparison: ManagerLoop vs lightweight agents

### SA-005: Multi-Modal Support

**Scope**: Extend ContentPart types and adapters to support images, audio, and documents.

**Deliverables**:
1. Extend ContentPart union type with ImageData, AudioData, DocumentData
2. Update `Message` type to support multimodal content
3. Implement file loading utilities:
   - `loadImage(path: string): ImageData`
   - `loadAudio(path: string): AudioData`
   - `loadDocument(path: string): DocumentData`
4. Update each provider adapter:
   - OpenAI: Convert to `image_url` or data URI format
   - Anthropic: Convert to base64 with media_type
   - Gemini: Convert to inlineData
5. Add node attributes for multi-modal input:
   - `image_input: string` - Path to image file
   - `document_input: string` - Path to document
6. Update artifact system to preserve binary data

**Key Implementation**:
```typescript
// Extended ContentPart types
interface ImageData {
  url?: string;
  data?: Buffer;
  media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  detail?: 'auto' | 'low' | 'high';
}

interface AudioData {
  url?: string;
  data?: Buffer;
  media_type: 'audio/wav' | 'audio/mp3' | 'audio/m4a';
}

interface DocumentData {
  url?: string;
  data?: Buffer;
  media_type: 'application/pdf' | 'text/plain';
  file_name?: string;
}

// In OpenAI adapter
function convertToOpenAIMessage(msg: Message): OpenAIMessage {
  return {
    role: msg.role,
    content: msg.content.map(part => {
      if (part.kind === 'image' && part.image) {
        return {
          type: 'image_url',
          image_url: {
            url: part.image.data 
              ? `data:${part.image.media_type};base64,${part.image.data.toString('base64')}`
              : part.image.url
          }
        };
      }
      // ... handle other types
    })
  };
}
```

**Artifact Requirements**:
- Example workflows: `examples/multimodal-image-analysis.dot`, `examples/document-processing.dot`
- Test fixtures with sample images/documents
- Updated type documentation

## Edge Cases

### Edge Case 1: Provider-Specific Feature Gaps
Not all providers support all features (e.g., Gemini may not support reasoning tokens).
**Handling**: Graceful degradation - field is optional, adapters return undefined for unsupported features.

### Edge Case 2: Cache Control with Streaming
Anthropic cache_control with streaming responses needs careful handling.
**Handling**: SA-003 must verify cache hits are reported correctly in stream events.

### Edge Case 3: Large File Uploads
Multi-modal files can be large (20MB+ images).
**Handling**: SA-005 should implement size limits and compression, with clear error messages.

### Edge Case 4: Subagent Depth Limiting
Prevent infinite recursion with subagent spawning.
**Handling**: SA-004 enforces max_subagent_depth, tracks depth in context, fails fast on violation.

### Edge Case 5: Mixed Provider Workflows
Workflow uses OpenAI for one node, Anthropic for another.
**Handling**: Provider profiles are per-node, adapter resolution uses node attributes.

## High-Risk Invariants

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| INV-001 | Existing workflows must not break | Backward compatibility tests in golden suite | `npm run test:golden` passes |
| INV-002 | Cost tracking must remain accurate | Economics tests verify all token types counted | `packages/core/src/economics/index.test.ts` |
| INV-003 | No infinite subagent recursion | Depth tracking in context, hard limit at 3 | Unit tests for depth violation |
| INV-004 | Multi-modal files must not leak between runs | Isolated temp directories per run | Worktree isolation tests |
| INV-005 | Reasoning tokens must not exceed output tokens | Validation in adapter result | Type constraints + runtime checks |

## Validation Checklist

- [ ] All 5 subagents complete their deliverables
- [ ] Unit/integration tests updated for each workstream
- [ ] Golden regression tests pass (`npm run test:golden`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Provider parity evidence published
- [ ] Documentation updated:
  - [ ] `docs/spec-conformance-matrix.md` - Update delta status
  - [ ] `docs/companion-spec-scope-contract.md` - Update capability status
  - [ ] `docs/execution-event-stream.md` - Document new event types
  - [ ] `README.md` - Add multi-modal and subagent examples
  - [ ] `AGENTS.md` - Update if new patterns emerge

## Convergence Setup

### Initial Issue Batch Target IDs
- SA-001: Provider-native tool profiles
- SA-002: Reasoning token transparency
- SA-003: Anthropic prompt caching
- SA-004: Lightweight subagent tools
- SA-005: Multi-modal support

### Implementer Scope Statement
Each subagent works within their designated scope only. Cross-cutting concerns (adapter interface changes) are coordinated through the main integration point. No subagent modifies files outside their scope without explicit handoff.

### Verifier Scope Statement
Verify each workstream independently:
1. Code review for implementation correctness
2. Test coverage for edge cases
3. Evidence artifacts are deterministic
4. Documentation is accurate
5. Integration tests pass when all workstreams merged

### Ratchet Acknowledgement
No new critique is added to any workstream until the current batch is marked `resolved`. If integration issues arise, they are tracked as new issues for the next batch.

## Integration Timeline

```
Week 1-2: Parallel subagent development
  - SA-001, SA-002, SA-004, SA-005 start immediately
  - SA-003 starts after SA-002 completes (depends on usage types)

Week 3: Integration testing
  - Merge all workstreams to integration branch
  - Run full test suite
  - Resolve conflicts

Week 4: Evidence publication & review
  - Generate provider parity evidence
  - Cost reduction metrics for Anthropic caching
  - Performance benchmarks for lightweight subagents
  - Final review and documentation updates

Week 5: Merge to main
  - Final golden test verification
  - Documentation freshness check
  - Merge and tag release
```

## Success Criteria

1. **Provider Parity**: Equivalent normalized outcomes across OpenAI + Anthropic for same tasks
2. **Cost Reduction**: Anthropic workflows show 50-90% cost reduction with caching enabled
3. **Context Efficiency**: Lightweight subagents use <10% of parent context vs ManagerLoop
4. **Multi-Modal**: Can process images, audio, and documents in workflow nodes
5. **Backward Compatibility**: All existing workflows execute identically

## Evidence Artifacts Required

Each subagent must produce:

| Subagent | Evidence Artifact | Location |
|----------|------------------|----------|
| SA-001 | Provider profile parity report | `docs/metrics/reports/provider-profile-parity-latest.json` |
| SA-002 | Reasoning token coverage report | `docs/metrics/reports/reasoning-token-coverage-latest.json` |
| SA-003 | Anthropic caching effectiveness | `docs/metrics/reports/anthropic-caching-effectiveness-latest.json` |
| SA-004 | Subagent performance comparison | `docs/metrics/reports/subagent-performance-latest.json` |
| SA-005 | Multi-modal compatibility matrix | `docs/metrics/reports/multimodal-compatibility-latest.json` |

Master integration evidence:
- `docs/metrics/reports/factory-enhancement-integration-latest.json` - Combined evidence
- Updated `docs/spec-conformance-matrix.md` - Mark deltas closed
- Updated `docs/companion-spec-scope-contract.md` - Update capability status
