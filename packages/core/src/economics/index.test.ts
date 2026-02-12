import { describe, expect, it } from 'vitest';
import {
  PROVIDER_COST_TABLE,
  type TokenUsage,
  calculateCost,
  checkSpendWarning,
  createAttributionTags,
  detectPhase,
  getCostRates,
  normalizeModelName,
  parseUsage,
} from './index.js';

describe('Provider Cost Table', () => {
  it('has OpenAI models defined', () => {
    expect(PROVIDER_COST_TABLE.openai).toBeDefined();
    expect(PROVIDER_COST_TABLE.openai['gpt-4o']).toBeDefined();
    expect(PROVIDER_COST_TABLE.openai['gpt-4o-mini']).toBeDefined();
  });

  it('has Anthropic models defined', () => {
    expect(PROVIDER_COST_TABLE.anthropic).toBeDefined();
    expect(PROVIDER_COST_TABLE.anthropic['claude-opus']).toBeDefined();
    expect(PROVIDER_COST_TABLE.anthropic['claude-sonnet']).toBeDefined();
  });

  it('has Google models defined', () => {
    expect(PROVIDER_COST_TABLE.google).toBeDefined();
    expect(PROVIDER_COST_TABLE.google['gemini-2.0-flash']).toBeDefined();
  });
});

describe('normalizeModelName', () => {
  it('returns exact match for known models', () => {
    expect(normalizeModelName('gpt-4o', 'openai')).toBe('gpt-4o');
    expect(normalizeModelName('claude-opus', 'anthropic')).toBe('claude-opus');
  });

  it('handles case insensitivity', () => {
    expect(normalizeModelName('GPT-4O', 'openai')).toBe('gpt-4o');
    expect(normalizeModelName('Claude-Opus', 'anthropic')).toBe('claude-opus');
  });

  it('returns normalized input for unknown models', () => {
    expect(normalizeModelName('unknown-model', 'openai')).toBe('unknown-model');
  });

  it('handles unknown providers', () => {
    expect(normalizeModelName('model', 'unknown')).toBe('model');
  });
});

describe('getCostRates', () => {
  it('returns rates for known models', () => {
    const rates = getCostRates('openai', 'gpt-4o');
    expect(rates).not.toBeNull();
    expect(rates?.inputPer1M).toBe(2.5);
    expect(rates?.outputPer1M).toBe(10.0);
  });

  it('returns null for unknown models', () => {
    expect(getCostRates('openai', 'unknown-model')).toBeNull();
  });

  it('returns null for unknown providers', () => {
    expect(getCostRates('unknown', 'gpt-4o')).toBeNull();
  });
});

describe('calculateCost', () => {
  it('calculates cost correctly for OpenAI', () => {
    const usage: TokenUsage = { inputTokens: 1_000_000, outputTokens: 500_000 };
    const result = calculateCost(usage, 'openai', 'gpt-4o');
    
    expect(result).not.toBeNull();
    expect(result?.inputCostUsd).toBe(2.5);
    expect(result?.outputCostUsd).toBe(5.0);
    expect(result?.totalCostUsd).toBe(7.5);
    expect(result?.provider).toBe('openai');
  });

  it('calculates cost correctly for Anthropic', () => {
    const usage: TokenUsage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const result = calculateCost(usage, 'anthropic', 'claude-opus');
    
    expect(result).not.toBeNull();
    expect(result?.inputCostUsd).toBe(15.0);
    expect(result?.outputCostUsd).toBe(75.0);
    expect(result?.totalCostUsd).toBe(90.0);
  });

  it('returns null for unknown models', () => {
    const usage: TokenUsage = { inputTokens: 1000, outputTokens: 1000 };
    expect(calculateCost(usage, 'unknown', 'model')).toBeNull();
  });

  it('rounds to 6 decimal places', () => {
    const usage: TokenUsage = { inputTokens: 1, outputTokens: 1 };
    const result = calculateCost(usage, 'openai', 'gpt-4o');
    
    expect(result?.totalCostUsd).toBe(0.000013);
    expect(result?.inputCostUsd).toBe(0.000003);
    expect(result?.outputCostUsd).toBe(0.00001);
  });
});

describe('parseUsage', () => {
  it('parses standard usage format', () => {
    const usage = parseUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('parses snake_case format', () => {
    const usage = parseUsage({ input_tokens: 100, output_tokens: 50 });
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('parses OpenAI format', () => {
    const usage = parseUsage({ prompt_tokens: 100, completion_tokens: 50 });
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('handles string numbers', () => {
    const usage = parseUsage({ inputTokens: '100', outputTokens: '50' });
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('returns null for invalid input', () => {
    expect(parseUsage(null)).toBeNull();
    expect(parseUsage(undefined)).toBeNull();
    expect(parseUsage('string')).toBeNull();
    expect(parseUsage({})).toBeNull();
  });

  it('calculates total from input and output', () => {
    const usage = parseUsage({ inputTokens: 100, outputTokens: 50 });
    expect(usage?.totalTokens).toBe(150);
  });
});

describe('detectPhase', () => {
  it('detects plan phase from node ID', () => {
    expect(detectPhase('plan_design')).toBe('plan');
    expect(detectPhase('create_plan')).toBe('plan');
  });

  it('detects work phase from node ID', () => {
    expect(detectPhase('work_implement')).toBe('work');
    expect(detectPhase('codergen_generate')).toBe('work');
  });

  it('detects review phase from node ID', () => {
    expect(detectPhase('review_code')).toBe('review');
    expect(detectPhase('audit_check')).toBe('review');
  });

  it('detects compound phase from node ID', () => {
    expect(detectPhase('compound_weekly')).toBe('compound');
    expect(detectPhase('generate_report')).toBe('compound');
  });

  it('defaults to other for unknown patterns', () => {
    expect(detectPhase('unknown_node')).toBe('other');
    expect(detectPhase('process_data')).toBe('other');
  });

  it('uses context phase hint when available', () => {
    expect(detectPhase('node', { phase: 'plan' })).toBe('plan');
    expect(detectPhase('node', { 'workflow.phase': 'review' })).toBe('review');
  });

  it('is case insensitive', () => {
    expect(detectPhase('PLAN_design')).toBe('plan');
    expect(detectPhase('WORK_implement')).toBe('work');
  });
});

describe('createAttributionTags', () => {
  it('creates basic attribution', () => {
    const tags = createAttributionTags('test_node');
    expect(tags.workflowNodeId).toBe('test_node');
    expect(tags.phase).toBeDefined();
  });

  it('includes optional fields', () => {
    const tags = createAttributionTags('test_node', {
      scenarioId: 'scenario-1',
      runManifestId: 'manifest-123',
      phase: 'work',
    });
    expect(tags.workflowNodeId).toBe('test_node');
    expect(tags.scenarioId).toBe('scenario-1');
    expect(tags.runManifestId).toBe('manifest-123');
    expect(tags.phase).toBe('work');
  });

  it('auto-detects phase when not provided', () => {
    const tags = createAttributionTags('plan_node');
    expect(tags.phase).toBe('plan');
  });

  it('uses provided phase over auto-detection', () => {
    const tags = createAttributionTags('plan_node', { phase: 'review' });
    expect(tags.phase).toBe('review');
  });
});

describe('checkSpendWarning', () => {
  it('returns none when under threshold', () => {
    const result = checkSpendWarning(500, 1000, 0.8);
    expect(result.exceeded).toBe(false);
    expect(result.severity).toBe('none');
  });

  it('returns warning when over 80% of target', () => {
    const result = checkSpendWarning(850, 1000, 0.8);
    expect(result.exceeded).toBe(true);
    expect(result.severity).toBe('warning');
  });

  it('returns critical when over target', () => {
    const result = checkSpendWarning(1001, 1000, 0.8);
    expect(result.exceeded).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('uses default threshold of 0.8', () => {
    const result = checkSpendWarning(801, 1000);
    expect(result.severity).toBe('warning');
  });

  it('handles edge case at exactly 80%', () => {
    const result = checkSpendWarning(800, 1000, 0.8);
    expect(result.severity).toBe('warning');
  });
});
