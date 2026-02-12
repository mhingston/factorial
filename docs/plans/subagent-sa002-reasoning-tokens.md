# Subagent Delegation: SA-002 - Reasoning Token Transparency

## Task Summary
Extend the LlmAdapter contract to explicitly surface thinking/reasoning blocks from LLM responses. Track reasoning tokens separately from output tokens and write reasoning artifacts.

## Scope

### In Scope
- Extend LlmCompleteResult and LlmStreamEvent types
- Modify DefaultLlmAdapter to extract reasoning from all providers
- Update artifact writers to create reasoning.md files
- Add reasoning token tracking to economics/cost calculation
- Update run_manifest.json schema

### Out of Scope
- Provider profiles (SA-001)
- Anthropic caching (SA-003)
- Multi-modal content (SA-005)
- Subagent tools (SA-004)

## Background Context

Modern reasoning models produce two types of tokens:
1. **Reasoning tokens** - Internal chain-of-thought (invisible to user)
2. **Output tokens** - Visible response text

Both are billed, but only output is visible. Without tracking reasoning:
- Can't compare cost efficiency across providers
- Can't debug why costs are unexpectedly high
- Can't optimize reasoning budgets

Per unified-llm spec Section 3.9:
- OpenAI: `usage.completion_tokens_details.reasoning_tokens`
- Anthropic: thinking blocks in response (need to estimate token count)
- Gemini: `usageMetadata.thoughtsTokenCount`

## Deliverables

### 1. Extended Type Definitions

Update `packages/core/src/types/index.ts`:

```typescript
// Extended LlmCompleteResult
export interface LlmCompleteResult {
  text: string;
  reasoning?: string;                    // NEW: Extracted thinking content
  reasoning_tokens?: number;             // NEW: Token count for reasoning
  object?: unknown;
  usage: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;           // NEW
    cache_read_tokens?: number;          // NEW (for SA-003)
    cache_write_tokens?: number;         // NEW (for SA-003)
  };
  finish_reason?: string;
  response_id?: string;
  model?: string;
  provider?: string;
  warnings?: unknown[];
  provider_metadata?: Record<string, unknown>;
}

// Extended LlmStreamEvent
export interface LlmStreamEvent {
  type: 'text' | 'reasoning' | 'tool_call' | 'error' | 'finish';
  delta?: string;                        // For text/reasoning streaming
  reasoning_delta?: string;              // NEW: Reasoning content streaming
  tool_call?: ToolCall;
  error?: Error;
  usage?: LlmCompleteResult['usage'];
  finish_reason?: string;
}

// ContentPart extension for reasoning blocks
export interface ReasoningData {
  text: string;
  signature?: string;                    // For Anthropic round-tripping
  redacted?: boolean;                    // For Anthropic redacted thinking
}
```

### 2. Reasoning Extraction Functions

Create `packages/core/src/llm/reasoning-extraction.ts`:

```typescript
import type { LlmCompleteResult, ReasoningData } from '../types/index.js';

interface ExtractionResult {
  reasoning: string | undefined;
  reasoning_tokens: number | undefined;
  text: string;
}

export function extractOpenAIReasoning(response: OpenAIResponse): ExtractionResult {
  // OpenAI: reasoning content is NOT visible, only token count
  const reasoningTokens = response.usage?.completionTokensDetails?.reasoningTokens;
  
  return {
    reasoning: undefined,  // OpenAI doesn't expose reasoning text
    reasoning_tokens: reasoningTokens,
    text: response.text
  };
}

export function extractAnthropicReasoning(response: AnthropicResponse): ExtractionResult {
  // Anthropic: reasoning blocks are explicit content blocks
  const thinkingBlocks = response.content.filter(
    (block): block is AnthropicThinkingBlock => block.type === 'thinking'
  );
  
  const reasoningText = thinkingBlocks.map(b => b.thinking).join('\n');
  
  // Estimate token count (Anthropic doesn't provide separate count)
  // Use approximate ratio: 1 token ~ 4 characters
  const reasoningTokens = reasoningText.length > 0 
    ? Math.ceil(reasoningText.length / 4) 
    : undefined;
  
  // Extract visible text from text blocks
  const textBlocks = response.content.filter(
    (block): block is AnthropicTextBlock => block.type === 'text'
  );
  
  return {
    reasoning: reasoningText || undefined,
    reasoning_tokens: reasoningTokens,
    text: textBlocks.map(b => b.text).join('')
  };
}

export function extractGeminiReasoning(response: GeminiResponse): ExtractionResult {
  // Gemini: thoughtsTokenCount in usage metadata
  const reasoningTokens = response.usageMetadata?.thoughtsTokenCount;
  
  // Gemini may expose reasoning text in 'thought' parts
  const thoughtParts = response.candidates[0]?.content.parts.filter(
    (part: GeminiPart) => part.thought === true
  );
  
  const reasoningText = thoughtParts?.map((p: GeminiPart) => p.text).join('\n');
  
  return {
    reasoning: reasoningText || undefined,
    reasoning_tokens: reasoningTokens,
    text: extractGeminiText(response)
  };
}
```

### 3. Adapter Updates

Update `packages/core/src/llm/index.ts`:

```typescript
export class DefaultLlmAdapter implements LlmAdapter {
  // ... existing implementation

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
    const config = this.resolveConfig(request);
    
    if (config.mode === 'api') {
      const result = await this.completeApi(request, config);
      
      // Extract reasoning based on provider
      const extraction = this.extractReasoning(result, config.provider);
      
      return {
        text: extraction.text,
        reasoning: extraction.reasoning,
        reasoning_tokens: extraction.reasoning_tokens,
        usage: {
          input_tokens: result.usage.promptTokens,
          output_tokens: result.usage.completionTokens,
          reasoning_tokens: extraction.reasoning_tokens
        },
        // ... other fields
      };
    }
    
    // ... CLI mode
  }

  private extractReasoning(
    response: unknown, 
    provider: string
  ): ExtractionResult {
    switch (provider) {
      case 'openai':
        return extractOpenAIReasoning(response as OpenAIResponse);
      case 'anthropic':
        return extractAnthropicReasoning(response as AnthropicResponse);
      case 'gemini':
        return extractGeminiReasoning(response as GeminiResponse);
      default:
        return { reasoning: undefined, reasoning_tokens: undefined, text: '' };
    }
  }

  async *stream(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    const config = this.resolveConfig(request);
    
    if (config.mode === 'api') {
      const stream = await this.streamApi(request, config);
      
      for await (const chunk of stream) {
        // Yield reasoning deltas when present
        if (chunk.type === 'reasoning') {
          yield {
            type: 'reasoning',
            reasoning_delta: chunk.delta
          };
        }
        
        // ... handle other chunk types
      }
    }
  }
}
```

### 4. Artifact Writer Updates

Update artifact writing in `packages/core/src/handlers/builtin.ts`:

```typescript
// In CodergenHandler, after LLM call
const result = await this.llmAdapter.complete(request);

// Write reasoning artifact if present
if (result.reasoning) {
  await writeFile(
    join(stageDir, 'reasoning.md'),
    `# Reasoning Content\n\n${result.reasoning}`
  );
}

// Update run_manifest.json to include reasoning info
const manifest = {
  // ... existing fields
  reasoning: {
    content_available: !!result.reasoning,
    tokens: result.reasoning_tokens,
    artifact_path: result.reasoning ? `${node.id}/reasoning.md` : undefined
  }
};
```

### 5. Economics Integration

Update `packages/core/src/economics/index.ts`:

```typescript
export interface CostCalculation {
  input_cost: number;
  output_cost: number;
  reasoning_cost: number;      // NEW
  cache_read_cost: number;     // NEW (for SA-003)
  total_cost: number;
}

export function calculateCost(
  usage: LlmCompleteResult['usage'],
  modelInfo: ModelInfo
): CostCalculation {
  const inputCost = (usage.input_tokens / 1_000_000) * modelInfo.input_cost_per_million;
  const outputCost = (usage.output_tokens / 1_000_000) * modelInfo.output_cost_per_million;
  
  // Reasoning tokens billed at output rate
  const reasoningCost = usage.reasoning_tokens 
    ? (usage.reasoning_tokens / 1_000_000) * modelInfo.output_cost_per_million
    : 0;
  
  // Cache read tokens at discounted rate (90% off for Anthropic)
  const cacheReadCost = usage.cache_read_tokens
    ? (usage.cache_read_tokens / 1_000_000) * (modelInfo.input_cost_per_million * 0.1)
    : 0;
  
  return {
    input_cost: inputCost,
    output_cost: outputCost,
    reasoning_cost: reasoningCost,
    cache_read_cost: cacheReadCost,
    total_cost: inputCost + outputCost + reasoningCost + cacheReadCost
  };
}
```

### 6. Tests

Create `packages/core/src/llm/reasoning-extraction.test.ts`:

```typescript
describe('Reasoning Extraction', () => {
  test('extracts OpenAI reasoning token count', () => {
    const response = createOpenAIResponse({
      text: 'Hello',
      usage: {
        promptTokens: 10,
        completionTokens: 100,
        completionTokensDetails: { reasoningTokens: 80 }
      }
    });
    
    const result = extractOpenAIReasoning(response);
    expect(result.reasoning_tokens).toBe(80);
    expect(result.reasoning).toBeUndefined(); // OpenAI doesn't expose text
    expect(result.text).toBe('Hello');
  });

  test('extracts Anthropic thinking blocks', () => {
    const response = createAnthropicResponse({
      content: [
        { type: 'thinking', thinking: 'Let me analyze this...' },
        { type: 'text', text: 'Final answer' }
      ],
      usage: { input_tokens: 10, output_tokens: 50 }
    });
    
    const result = extractAnthropicReasoning(response);
    expect(result.reasoning).toBe('Let me analyze this...');
    expect(result.reasoning_tokens).toBe(6); // ~24 chars / 4
    expect(result.text).toBe('Final answer');
  });

  test('handles responses without reasoning', () => {
    const response = createOpenAIResponse({
      text: 'Simple response',
      usage: { promptTokens: 10, completionTokens: 20 }
    });
    
    const result = extractOpenAIReasoning(response);
    expect(result.reasoning).toBeUndefined();
    expect(result.reasoning_tokens).toBeUndefined();
  });
});
```

## Evidence Requirements

### Required Artifacts

1. **Reasoning Token Coverage Report**
   - Location: `docs/metrics/reports/reasoning-token-coverage-latest.json`
   - Shows which providers support reasoning tracking
   - Example:
     ```json
     {
       "report_version": "1.0",
       "timestamp": "2026-02-12T00:00:00Z",
       "providers": {
         "openai": {
           "reasoning_tokens_supported": true,
           "reasoning_text_supported": false,
           "evidence": "usage.completion_tokens_details.reasoning_tokens"
         },
         "anthropic": {
           "reasoning_tokens_supported": true,
           "reasoning_text_supported": true,
           "evidence": "thinking content blocks"
         }
       }
     }
     ```

## Edge Cases to Handle

1. **No Reasoning Available**: Provider doesn't return reasoning info
   - Solution: Fields are optional, return undefined gracefully

2. **Streaming Reasoning**: Reasoning content arrives in chunks
   - Solution: Buffer reasoning deltas, emit when complete or stream continuously

3. **Token Count Estimation**: Anthropic doesn't provide separate count
   - Solution: Estimate from character count (4 chars/token), document approximation

4. **Redacted Thinking**: Anthropic may return redacted thinking blocks
   - Solution: Preserve redacted blocks for round-tripping, mark as redacted

## Validation Steps

```bash
# Run reasoning extraction tests
npm run test:run packages/core/src/llm/reasoning-extraction.test.ts

# Run adapter tests
npm run test:run packages/core/src/llm/index.test.ts

# Verify reasoning artifacts created
node scripts/test-reasoning-artifacts.js

# Check coverage report
cat docs/metrics/reports/reasoning-token-coverage-latest.json
```

## Dependencies

- None (foundational work for SA-003 caching)
- SA-001 may use reasoning fields but doesn't require them

## Success Criteria

1. [ ] LlmAdapter contract extended with reasoning fields
2. [ ] All three providers extract reasoning correctly
3. [ ] reasoning.md artifacts written when reasoning present
4. [ ] Economics tracks reasoning costs separately
5. [ ] Tests verify extraction accuracy
6. [ ] Evidence artifact published

## Handoff Checklist

When complete, hand off to:
- SA-003 (caching) - Uses cache_read_tokens/cache_write_tokens fields
- SA-005 (multi-modal) - Extends same type system
- Integration - All adapter changes ready

Handoff artifacts:
- [ ] Updated types committed
- [ ] Adapter implementation complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Evidence artifact generated
