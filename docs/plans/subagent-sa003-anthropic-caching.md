# Subagent Delegation: SA-003 - Anthropic Prompt Caching

## Task Summary
Implement automatic `cache_control` annotation for Anthropic Messages API to reduce token costs by 50-90%. Cache system prompts and early conversation turns automatically.

## Scope

### In Scope
- Create specialized Anthropic adapter with caching support
- Implement automatic cache breakpoint injection strategy
- Update usage tracking to report cache_read_tokens and cache_write_tokens
- Add cost calculation for cached token pricing
- Configuration option to disable caching per-node

### Out of Scope
- Provider profiles (SA-001)
- Reasoning extraction (handled by SA-002)
- Multi-modal (SA-005)
- Subagent tools (SA-004)

## Background Context

Anthropic is unique among providers in requiring **explicit cache annotations**. Without them:
- Every request re-processes entire conversation history at full price
- Agentic workloads waste 50-90% on redundant computation

Per unified-llm spec Section 2.10:
- Anthropic uses `cache_control: { type: "ephemeral" }` breakpoints
- Cached tokens cost 90% less than regular input tokens
- Must annotate content blocks (not messages)
- Cache hits reported in `usage.cache_read_input_tokens`

## Deliverables

### 1. Anthropic Adapter

Create `packages/core/src/llm/anthropic-adapter.ts`:

```typescript
import type { LlmAdapter, LlmCompleteRequest, LlmCompleteResult, LlmStreamRequest } from '../types/index.js';

interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  betaHeaders?: string[];
  enableCaching?: boolean;  // Default: true
  cacheStrategy?: 'system-only' | 'system-plus-early' | 'aggressive';
}

export class AnthropicAdapter implements LlmAdapter {
  private config: AnthropicConfig;
  
  constructor(config: AnthropicConfig) {
    this.config = {
      enableCaching: true,
      cacheStrategy: 'system-plus-early',
      ...config
    };
  }

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResult> {
    const messages = this.convertMessages(request.messages);
    
    // Inject cache breakpoints
    const messagesWithCaching = this.config.enableCaching
      ? this.injectCacheBreakpoints(messages, this.config.cacheStrategy)
      : messages;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        ...(this.config.betaHeaders?.length && {
          'anthropic-beta': this.config.betaHeaders.join(',')
        })
      },
      body: JSON.stringify({
        model: request.model,
        messages: messagesWithCaching,
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature,
        ...(request.tools?.length && {
          tools: this.convertTools(request.tools)
        })
      })
    });
    
    const result = await response.json();
    
    return {
      text: this.extractText(result),
      reasoning: this.extractReasoning(result),
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        reasoning_tokens: this.estimateReasoningTokens(result),
        cache_read_tokens: result.usage.cache_read_input_tokens,      // From Anthropic
        cache_write_tokens: result.usage.cache_creation_input_tokens  // From Anthropic
      },
      // ... other fields
    };
  }

  async *stream(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    // Similar implementation with streaming
    // Cache hit data arrives in usage block at end of stream
  }

  private injectCacheBreakpoints(
    messages: AnthropicMessage[],
    strategy: string
  ): AnthropicMessage[] {
    switch (strategy) {
      case 'system-only':
        return this.cacheSystemMessageOnly(messages);
      case 'system-plus-early':
        return this.cacheSystemPlusEarly(messages);
      case 'aggressive':
        return this.cacheAggressively(messages);
      default:
        return messages;
    }
  }

  private cacheSystemMessageOnly(messages: AnthropicMessage[]): AnthropicMessage[] {
    // First message is typically system - add cache control to last content block
    if (messages.length === 0) return messages;
    
    const firstMessage = messages[0];
    if (firstMessage.role === 'system' && Array.isArray(firstMessage.content)) {
      return [
        {
          ...firstMessage,
          content: this.addCacheControlToLastBlock(firstMessage.content)
        },
        ...messages.slice(1)
      ];
    }
    
    return messages;
  }

  private cacheSystemPlusEarly(messages: AnthropicMessage[]): AnthropicMessage[] {
    // Cache system prompt + first 2 user messages
    // Don't cache the most recent turn (it changes)
    return messages.map((msg, index) => {
      // Always cache system
      if (msg.role === 'system' && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: this.addCacheControlToLastBlock(msg.content)
        };
      }
      
      // Cache early user messages (first 2)
      if (msg.role === 'user' && index <= 2 && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: this.addCacheControlToLastBlock(msg.content)
        };
      }
      
      return msg;
    });
  }

  private cacheAggressively(messages: AnthropicMessage[]): AnthropicMessage[] {
    // Cache every message except the last one
    // Best for long conversations where earlier context is stable
    return messages.map((msg, index) => {
      if (index < messages.length - 1 && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: this.addCacheControlToLastBlock(msg.content)
        };
      }
      return msg;
    });
  }

  private addCacheControlToLastBlock(content: AnthropicContentBlock[]): AnthropicContentBlock[] {
    if (content.length === 0) return content;
    
    const lastIndex = content.length - 1;
    return content.map((block, index) => 
      index === lastIndex
        ? { ...block, cache_control: { type: 'ephemeral' } }
        : block
    );
  }

  private convertMessages(messages: Message[]): AnthropicMessage[] {
    // Convert unified messages to Anthropic format
    // Handle system messages (extract to top-level system param)
    // Convert tool results to tool_result blocks
  }

  private extractText(response: AnthropicResponse): string {
    return response.content
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  private extractReasoning(response: AnthropicResponse): string | undefined {
    const thinking = response.content
      .filter((block): block is AnthropicThinkingBlock => block.type === 'thinking')
      .map(block => block.thinking)
      .join('\n');
    return thinking || undefined;
  }

  private estimateReasoningTokens(response: AnthropicResponse): number | undefined {
    const thinking = this.extractReasoning(response);
    return thinking ? Math.ceil(thinking.length / 4) : undefined;
  }
}
```

### 2. Cache Strategy Configuration

Add to node attributes:

```typescript
// In node processing
const cacheStrategy = node.attributes.cache_strategy as string | undefined;
const enableCaching = node.attributes.enable_caching !== 'false';  // Default true

const adapter = new AnthropicAdapter({
  apiKey: config.apiKey,
  enableCaching,
  cacheStrategy: cacheStrategy || 'system-plus-early'
});
```

### 3. Cost Calculation with Caching

Update economics module (extends SA-002):

```typescript
// Anthropic-specific pricing with cache discount
const ANTHROPIC_CACHE_DISCOUNT = 0.1;  // 90% off = 10% of regular price

export function calculateAnthropicCost(
  usage: LlmCompleteResult['usage'],
  modelInfo: ModelInfo
): CostCalculation {
  const regularInputTokens = usage.input_tokens - (usage.cache_read_tokens || 0);
  const cacheReadTokens = usage.cache_read_tokens || 0;
  
  const regularInputCost = (regularInputTokens / 1_000_000) * modelInfo.input_cost_per_million;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * modelInfo.input_cost_per_million * ANTHROPIC_CACHE_DISCOUNT;
  const outputCost = (usage.output_tokens / 1_000_000) * modelInfo.output_cost_per_million;
  const reasoningCost = usage.reasoning_tokens
    ? (usage.reasoning_tokens / 1_000_000) * modelInfo.output_cost_per_million
    : 0;
  
  return {
    input_cost: regularInputCost + cacheReadCost,
    output_cost: outputCost,
    reasoning_cost: reasoningCost,
    cache_read_cost: cacheReadCost,
    savings_from_caching: (cacheReadTokens / 1_000_000) * modelInfo.input_cost_per_million * (1 - ANTHROPIC_CACHE_DISCOUNT),
    total_cost: regularInputCost + cacheReadCost + outputCost + reasoningCost
  };
}
```

### 4. Cache Effectiveness Monitoring

Create `packages/core/src/llm/cache-monitor.ts`:

```typescript
interface CacheMetrics {
  total_requests: number;
  cache_hits: number;
  cache_misses: number;
  tokens_saved: number;
  cost_saved_usd: number;
}

export class CacheMonitor {
  private metrics: Map<string, CacheMetrics> = new Map();
  
  recordRequest(provider: string, usage: LlmCompleteResult['usage'], modelInfo: ModelInfo) {
    const key = `${provider}:${modelInfo.id}`;
    const existing = this.metrics.get(key) || {
      total_requests: 0,
      cache_hits: 0,
      cache_misses: 0,
      tokens_saved: 0,
      cost_saved_usd: 0
    };
    
    existing.total_requests++;
    
    if (usage.cache_read_tokens && usage.cache_read_tokens > 0) {
      existing.cache_hits++;
      existing.tokens_saved += usage.cache_read_tokens;
      existing.cost_saved_usd += (usage.cache_read_tokens / 1_000_000) * 
        modelInfo.input_cost_per_million * 0.9;  // 90% savings
    } else {
      existing.cache_misses++;
    }
    
    this.metrics.set(key, existing);
  }
  
  generateReport(): CacheEffectivenessReport {
    return {
      report_version: '1.0',
      timestamp: new Date().toISOString(),
      providers: Object.fromEntries(
        Array.from(this.metrics.entries()).map(([key, metrics]) => [
          key,
          {
            ...metrics,
            hit_rate: metrics.cache_hits / metrics.total_requests,
            avg_tokens_saved_per_hit: metrics.tokens_saved / metrics.cache_hits
          }
        ])
      )
    };
  }
}
```

### 5. Tests

Create `packages/core/src/llm/anthropic-adapter.test.ts`:

```typescript
describe('AnthropicAdapter', () => {
  test('injects cache control for system message', async () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      cacheStrategy: 'system-only'
    });
    
    const messages = [
      { role: 'system', content: [{ type: 'text', text: 'You are helpful' }] },
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
    ];
    
    const result = (adapter as any).injectCacheBreakpoints(messages, 'system-only');
    
    expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(result[1].content[0].cache_control).toBeUndefined();
  });

  test('calculates cache savings correctly', () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: 800  // These were cached
    };
    
    const modelInfo = { input_cost_per_million: 3.0, output_cost_per_million: 15.0 };
    const cost = calculateAnthropicCost(usage, modelInfo);
    
    // Regular input: 200 tokens @ $3/M = $0.0006
    // Cached input: 800 tokens @ $0.30/M (10% of $3) = $0.00024
    expect(cost.input_cost).toBeCloseTo(0.00084, 5);
    expect(cost.savings_from_caching).toBeCloseTo(0.00216, 5); // $2.16 saved per 1M tokens
  });

  test('respects enableCaching=false', async () => {
    const adapter = new AnthropicAdapter({
      apiKey: 'test-key',
      enableCaching: false
    });
    
    const messages = [
      { role: 'system', content: [{ type: 'text', text: 'You are helpful' }] }
    ];
    
    const result = (adapter as any).injectCacheBreakpoints(messages, 'system-only');
    
    expect(result[0].content[0].cache_control).toBeUndefined();
  });
});
```

## Evidence Requirements

### Required Artifacts

1. **Anthropic Caching Effectiveness Report**
   - Location: `docs/metrics/reports/anthropic-caching-effectiveness-latest.json`
   - Schema:
     ```json
     {
       "report_version": "1.0",
       "timestamp": "2026-02-12T00:00:00Z",
       "test_scenarios": [
         {
           "name": "Long conversation (10 turns)",
           "without_caching": {
             "input_tokens": 10000,
             "cost_usd": 0.03
           },
           "with_caching": {
             "input_tokens": 10000,
             "cache_read_tokens": 8000,
             "cost_usd": 0.0084,
             "savings_percent": 72
           }
         }
       ],
       "recommendation": "Enable caching for all Anthropic workflows with >3 turns"
     }
     ```

## Edge Cases to Handle

1. **Cache Miss**: First request with new content
   - Solution: Accept higher cost for initial cache write, subsequent requests benefit

2. **Cache Eviction**: Anthropic caches expire after ~5 minutes of inactivity
   - Solution: Document this, expect occasional misses

3. **Large Cache Writes**: Writing large contexts to cache costs full price
   - Solution: Worth it if context is reused multiple times

4. **Strategy Selection**: Different strategies for different workflow types
   - Solution: Make configurable per-node, document tradeoffs

## Validation Steps

```bash
# Run Anthropic adapter tests
npm run test:run packages/core/src/llm/anthropic-adapter.test.ts

# Run integration test with real Anthropic calls (if API key available)
npm run test:integration:anthropic

# Generate caching effectiveness report
node scripts/generate-anthropic-caching-report.js

# Verify cost savings > 50%
cat docs/metrics/reports/anthropic-caching-effectiveness-latest.json | jq '.test_scenarios[0].with_caching.savings_percent'
```

## Dependencies

- **SA-002 (Reasoning Tokens)**: Required for usage type extensions
- SA-001: Can work in parallel, uses separate adapter
- SA-004, SA-005: Independent

## Success Criteria

1. [ ] AnthropicAdapter implements automatic cache breakpoint injection
2. [ ] Three caching strategies available (system-only, system-plus-early, aggressive)
3. [ ] Cost calculation accounts for 90% cache discount
4. [ ] Cache effectiveness monitoring tracks hits/misses
5. [ ] Evidence shows 50-90% cost reduction for multi-turn conversations
6. [ ] Tests verify cache control injection

## Handoff Checklist

When complete, hand off to:
- Integration subagent - Adapter ready for use
- Documentation - Update Anthropic setup guide

Handoff artifacts:
- [ ] AnthropicAdapter implementation
- [ ] Cache monitoring working
- [ ] Tests passing
- [ ] Effectiveness report generated
- [ ] Example workflows showing caching configuration
