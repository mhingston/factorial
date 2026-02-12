/**
 * Cache Effectiveness Monitoring (SA-003)
 * Tracks cache hits/misses and calculates cost savings from Anthropic prompt caching
 */

export interface CacheMetrics {
  total_requests: number;
  cache_hits: number;
  cache_misses: number;
  tokens_saved: number;
  cost_saved_usd: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
}

export interface CacheEffectivenessReport {
  report_version: string;
  timestamp: string;
  providers: Record<string, CacheMetrics & {
    hit_rate: number;
    avg_tokens_saved_per_hit: number;
  }>;
  summary: {
    total_requests: number;
    total_cache_hits: number;
    total_tokens_saved: number;
    total_cost_saved_usd: number;
    overall_hit_rate: number;
  };
}

export interface ModelInfo {
  id: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
}

export interface UsageWithCache {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

// Anthropic-specific pricing: cached tokens cost 10% of regular price (90% discount)
const ANTHROPIC_CACHE_DISCOUNT = 0.1;

export interface CostCalculation {
  input_cost: number;
  output_cost: number;
  reasoning_cost: number;
  cache_read_cost: number;
  savings_from_caching: number;
  total_cost: number;
}

export function calculateAnthropicCost(
  usage: UsageWithCache,
  modelInfo: ModelInfo,
  reasoningTokens?: number
): CostCalculation {
  const regularInputTokens = usage.input_tokens - (usage.cache_read_tokens || 0);
  const cacheReadTokens = usage.cache_read_tokens || 0;

  const regularInputCost = (regularInputTokens / 1_000_000) * modelInfo.input_cost_per_million;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * modelInfo.input_cost_per_million * ANTHROPIC_CACHE_DISCOUNT;
  const outputCost = (usage.output_tokens / 1_000_000) * modelInfo.output_cost_per_million;
  const reasoningCost = reasoningTokens
    ? (reasoningTokens / 1_000_000) * modelInfo.output_cost_per_million
    : 0;

  // Savings = what would have been paid at full price minus what was actually paid
  const savingsFromCaching = (cacheReadTokens / 1_000_000) *
    modelInfo.input_cost_per_million * (1 - ANTHROPIC_CACHE_DISCOUNT);

  return {
    input_cost: regularInputCost + cacheReadCost,
    output_cost: outputCost,
    reasoning_cost: reasoningCost,
    cache_read_cost: cacheReadCost,
    savings_from_caching: savingsFromCaching,
    total_cost: regularInputCost + cacheReadCost + outputCost + reasoningCost,
  };
}

export class CacheMonitor {
  private metrics: Map<string, CacheMetrics> = new Map();

  recordRequest(provider: string, usage: UsageWithCache, modelInfo: ModelInfo): void {
    const key = `${provider}:${modelInfo.id}`;
    const existing = this.metrics.get(key) || {
      total_requests: 0,
      cache_hits: 0,
      cache_misses: 0,
      tokens_saved: 0,
      cost_saved_usd: 0,
      cache_write_tokens: 0,
      cache_read_tokens: 0,
    };

    existing.total_requests++;
    existing.cache_write_tokens += usage.cache_write_tokens || 0;
    existing.cache_read_tokens += usage.cache_read_tokens || 0;

    if (usage.cache_read_tokens && usage.cache_read_tokens > 0) {
      existing.cache_hits++;
      existing.tokens_saved += usage.cache_read_tokens;
      const savings = (usage.cache_read_tokens / 1_000_000) *
        modelInfo.input_cost_per_million * (1 - ANTHROPIC_CACHE_DISCOUNT);
      existing.cost_saved_usd += savings;
    } else {
      existing.cache_misses++;
    }

    this.metrics.set(key, existing);
  }

  generateReport(): CacheEffectivenessReport {
    const providers: Record<string, CacheMetrics & { hit_rate: number; avg_tokens_saved_per_hit: number }> = {};

    let totalRequests = 0;
    let totalCacheHits = 0;
    let totalTokensSaved = 0;
    let totalCostSaved = 0;

    for (const [key, metrics] of this.metrics.entries()) {
      const hitRate = metrics.total_requests > 0
        ? metrics.cache_hits / metrics.total_requests
        : 0;

      const avgTokensSaved = metrics.cache_hits > 0
        ? metrics.tokens_saved / metrics.cache_hits
        : 0;

      providers[key] = {
        ...metrics,
        hit_rate: hitRate,
        avg_tokens_saved_per_hit: avgTokensSaved,
      };

      totalRequests += metrics.total_requests;
      totalCacheHits += metrics.cache_hits;
      totalTokensSaved += metrics.tokens_saved;
      totalCostSaved += metrics.cost_saved_usd;
    }

    return {
      report_version: '1.0',
      timestamp: new Date().toISOString(),
      providers,
      summary: {
        total_requests: totalRequests,
        total_cache_hits: totalCacheHits,
        total_tokens_saved: totalTokensSaved,
        total_cost_saved_usd: totalCostSaved,
        overall_hit_rate: totalRequests > 0 ? totalCacheHits / totalRequests : 0,
      },
    };
  }

  getMetrics(provider: string, modelId: string): CacheMetrics | undefined {
    return this.metrics.get(`${provider}:${modelId}`);
  }

  reset(): void {
    this.metrics.clear();
  }
}

// Singleton instance for global monitoring
let globalCacheMonitor: CacheMonitor | undefined;

export function getGlobalCacheMonitor(): CacheMonitor {
  if (!globalCacheMonitor) {
    globalCacheMonitor = new CacheMonitor();
  }
  return globalCacheMonitor;
}

export function resetGlobalCacheMonitor(): void {
  globalCacheMonitor = undefined;
}
