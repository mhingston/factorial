/**
 * Economic Visibility Module (EV-001)
 * Token economics tracking and cost calculation for LLM calls.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Provider cost rates per 1M tokens (input/output)
 */
export interface ProviderCostRates {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Cost table for known models by provider
 */
export const PROVIDER_COST_TABLE: Record<string, Record<string, ProviderCostRates>> = {
  openai: {
    'gpt-5.2': { inputPer1M: 2.5, outputPer1M: 10.0 },
    'gpt-5.2-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
    'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
    'gpt-4': { inputPer1M: 30.0, outputPer1M: 60.0 },
    'gpt-4-turbo': { inputPer1M: 10.0, outputPer1M: 30.0 },
    'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },
  },
  anthropic: {
    'claude-opus-4.6': { inputPer1M: 15.0, outputPer1M: 75.0 },
    'claude-opus': { inputPer1M: 15.0, outputPer1M: 75.0 },
    'claude-sonnet-4.5': { inputPer1M: 3.0, outputPer1M: 15.0 },
    'claude-sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
    'claude-3-5-sonnet-latest': { inputPer1M: 3.0, outputPer1M: 15.0 },
    'claude-3-5-haiku': { inputPer1M: 0.8, outputPer1M: 4.0 },
  },
  google: {
    'gemini-2.0-flash': { inputPer1M: 0.35, outputPer1M: 1.05 },
    'gemini-1.5-pro': { inputPer1M: 3.5, outputPer1M: 10.5 },
    'gemini-1.5-flash': { inputPer1M: 0.35, outputPer1M: 1.05 },
  },
};

/**
 * Attribution metadata for LLM calls
 */
export interface AttributionTags {
  workflowNodeId: string;
  scenarioId?: string;
  runManifestId?: string;
  phase: 'plan' | 'work' | 'review' | 'compound' | 'other';
}

/**
 * Token usage data from an LLM call
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

/**
 * Cost calculation result
 */
export interface CostCalculation {
  inputCostUsd: number;
  outputCostUsd: number;
  reasoningCostUsd: number;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  provider: string;
  model: string;
  ratesApplied: ProviderCostRates;
}

/**
 * Economics record for a single LLM call
 */
export interface EconomicsRecord {
  timestamp: string;
  attribution: AttributionTags;
  provider: string;
  model: string;
  usage: TokenUsage;
  cost: CostCalculation;
  nodeType: string;
  backend: string;
}

/**
 * Economics report structure
 */
export interface EconomicsReport {
  schemaVersion: 'economics_report.v1';
  generatedAt: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalSpendUsd: number;
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
  };
  byProvider: Record<string, {
    spendUsd: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  }>;
  byPhase: Record<string, {
    spendUsd: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  }>;
  byScenarioCategory: Record<string, {
    spendUsd: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  }>;
  dailySpendSeries: Array<{
    date: string;
    spendUsd: number;
    calls: number;
  }>;
  efficiencyMetrics: {
    tokensPerMergedPr: number | null;
    costPerMergedPr: number | null;
  };
  records: EconomicsRecord[];
}

/**
 * Detect phase from workflow context
 */
export function detectPhase(nodeId: string, context?: Record<string, unknown>): AttributionTags['phase'] {
  const id = nodeId.toLowerCase();
  
  if (id.includes('plan') || id.includes('design')) return 'plan';
  if (id.includes('review') || id.includes('audit') || id.includes('check')) return 'review';
  if (id.includes('compound') || id.includes('weekly') || id.includes('report')) return 'compound';
  if (id.includes('work') || id.includes('implement') || id.includes('generate')) return 'work';
  if (id.includes('codergen') || id.includes('generate')) return 'work';
  
  // Check context for phase hints
  if (context) {
    const phaseHint = String(
      context['phase'] || 
      context['workflow.phase'] || 
      (context['attribution'] && (context['attribution'] as Record<string, unknown>)['phase']) || 
      ''
    ).toLowerCase();
    if (phaseHint === 'plan' || phaseHint === 'work' || phaseHint === 'review' || phaseHint === 'compound') {
      return phaseHint;
    }
  }
  
  return 'other';
}

/**
 * Normalize model name for cost lookup
 */
export function normalizeModelName(model: string, provider: string): string {
  const normalized = model.toLowerCase().trim();
  const providerTable = PROVIDER_COST_TABLE[provider.toLowerCase()];
  
  if (!providerTable) return normalized;
  
  // Exact match
  if (providerTable[normalized]) return normalized;
  
  // Try partial matches
  for (const [knownModel] of Object.entries(providerTable)) {
    if (normalized.includes(knownModel) || knownModel.includes(normalized)) {
      return knownModel;
    }
  }
  
  return normalized;
}

/**
 * Get cost rates for a provider/model combination
 */
export function getCostRates(provider: string, model: string): ProviderCostRates | null {
  const providerTable = PROVIDER_COST_TABLE[provider.toLowerCase()];
  if (!providerTable) return null;
  
  const normalizedModel = normalizeModelName(model, provider);
  return providerTable[normalizedModel] ?? null;
}

/**
 * Calculate cost from token usage
 * Reasoning tokens are billed at the output token rate
 */
export function calculateCost(
  usage: TokenUsage,
  provider: string,
  model: string
): CostCalculation | null {
  const rates = getCostRates(provider, model);
  if (!rates) return null;

  const inputCost = (usage.inputTokens * rates.inputPer1M) / 1_000_000;
  const outputCost = (usage.outputTokens * rates.outputPer1M) / 1_000_000;

  // Reasoning tokens are billed at the output rate
  const reasoningTokens = usage.reasoningTokens ?? 0;
  const reasoningCost = (reasoningTokens * rates.outputPer1M) / 1_000_000;

  return {
    inputCostUsd: roundUsd(inputCost),
    outputCostUsd: roundUsd(outputCost),
    reasoningCostUsd: roundUsd(reasoningCost),
    totalCostUsd: roundUsd(inputCost + outputCost + reasoningCost),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens,
    provider: provider.toLowerCase(),
    model: normalizeModelName(model, provider),
    ratesApplied: rates,
  };
}

/**
 * Round USD amount to 6 decimal places
 */
function roundUsd(amount: number): number {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

/**
 * Create attribution tags from node and context
 */
export function createAttributionTags(
  nodeId: string,
  options: {
    scenarioId?: string;
    runManifestId?: string;
    phase?: AttributionTags['phase'];
    context?: Record<string, unknown>;
  } = {}
): AttributionTags {
  return {
    workflowNodeId: nodeId,
    scenarioId: options.scenarioId,
    runManifestId: options.runManifestId,
    phase: options.phase ?? detectPhase(nodeId, options.context),
  };
}

/**
 * Parse usage from various API response formats
 */
export function parseUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== 'object') return null;

  const u = usage as Record<string, unknown>;

  const inputTokens = firstNumber(
    u.inputTokens,
    u.input_tokens,
    u.prompt_tokens,
    u.promptTokens,
    u.input
  );

  const outputTokens = firstNumber(
    u.outputTokens,
    u.output_tokens,
    u.completion_tokens,
    u.completionTokens,
    u.output
  );

  const totalTokens = firstNumber(
    u.totalTokens,
    u.total_tokens,
    u.total
  );

  // Extract reasoning tokens from various provider formats
  // OpenAI: completion_tokens_details.reasoning_tokens
  // Gemini: thoughtsTokenCount
  // Anthropic: extracted separately from thinking blocks
  const completionTokensDetails = isRecord(u.completion_tokens_details)
    ? u.completion_tokens_details
    : isRecord(u.completionTokensDetails)
      ? u.completionTokensDetails
      : null;

  const reasoningTokens = firstNumber(
    u.reasoningTokens,
    u.reasoning_tokens,
    u.thoughtsTokenCount,
    u.thoughts_token_count,
    completionTokensDetails?.reasoningTokens
  );

  if (inputTokens === null && outputTokens === null && totalTokens === null && reasoningTokens === null) {
    return null;
  }

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    reasoningTokens: reasoningTokens ?? undefined,
  };
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

/**
 * Collect economics records from a logs directory
 */
export async function collectEconomicsRecords(
  logsRoot: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<EconomicsRecord[]> {
  const records: EconomicsRecord[] = [];
  
  try {
    const entries = await readdir(logsRoot, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      // Look for output.json files in node directories
      const nodeDir = join(logsRoot, entry.name);
      try {
        const outputPath = join(nodeDir, 'output.json');
        const outputContent = await readFile(outputPath, 'utf-8');
        const output = JSON.parse(outputContent) as Record<string, unknown>;
        
        // Parse timestamp
        const timestamp = String(output.timestamp || new Date().toISOString());
        const recordDate = new Date(timestamp);
        
        // Filter by date range
        if (options.startDate && recordDate < options.startDate) continue;
        if (options.endDate && recordDate > options.endDate) continue;
        
        // Extract usage
        const usage = parseUsage(output.usage);
        if (!usage) continue;
        
        // Extract provider and model
        const provider = String(output.provider || 'unknown');
        const model = String(output.model || 'unknown');
        
        // Calculate cost
        const cost = calculateCost(usage, provider, model);
        if (!cost) continue;
        
        // Create record
        const record: EconomicsRecord = {
          timestamp,
          attribution: createAttributionTags(entry.name, {
            scenarioId: String(output.scenario_id || ''),
            runManifestId: String(output.run_manifest_id || ''),
            phase: detectPhase(entry.name, output as Record<string, unknown>),
            context: output as Record<string, unknown>,
          }),
          provider,
          model,
          usage,
          cost,
          nodeType: String(output.node_type || 'codergen'),
          backend: String(output.backend || 'api'),
        };
        
        records.push(record);
      } catch {
        // Skip directories without valid output.json
        continue;
      }
    }
  } catch {
    // Return empty array if logsRoot doesn't exist
  }
  
  return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Build economics report from collected records
 */
export function buildEconomicsReport(
  records: EconomicsRecord[],
  dateRange: { start: string; end: string }
): EconomicsReport {
  // Calculate summary
  const summary = {
    totalSpendUsd: 0,
    totalCalls: records.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalReasoningTokens: 0,
  };

  for (const record of records) {
    summary.totalSpendUsd += record.cost.totalCostUsd;
    summary.totalInputTokens += record.usage.inputTokens;
    summary.totalOutputTokens += record.usage.outputTokens;
    summary.totalReasoningTokens += record.usage.reasoningTokens ?? 0;
  }

  summary.totalSpendUsd = roundUsd(summary.totalSpendUsd);

  // Group by provider
  const byProvider: EconomicsReport['byProvider'] = {};
  for (const record of records) {
    const provider = record.provider;
    if (!byProvider[provider]) {
      byProvider[provider] = { spendUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
    }
    byProvider[provider].spendUsd += record.cost.totalCostUsd;
    byProvider[provider].calls += 1;
    byProvider[provider].inputTokens += record.usage.inputTokens;
    byProvider[provider].outputTokens += record.usage.outputTokens;
    byProvider[provider].reasoningTokens += record.usage.reasoningTokens ?? 0;
  }

  // Round provider totals
  for (const provider of Object.keys(byProvider)) {
    byProvider[provider].spendUsd = roundUsd(byProvider[provider].spendUsd);
  }

  // Group by phase
  const byPhase: EconomicsReport['byPhase'] = {};
  for (const record of records) {
    const phase = record.attribution.phase;
    if (!byPhase[phase]) {
      byPhase[phase] = { spendUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
    }
    byPhase[phase].spendUsd += record.cost.totalCostUsd;
    byPhase[phase].calls += 1;
    byPhase[phase].inputTokens += record.usage.inputTokens;
    byPhase[phase].outputTokens += record.usage.outputTokens;
    byPhase[phase].reasoningTokens += record.usage.reasoningTokens ?? 0;
  }

  // Round phase totals
  for (const phase of Object.keys(byPhase)) {
    byPhase[phase].spendUsd = roundUsd(byPhase[phase].spendUsd);
  }

  // Group by scenario category
  const byScenarioCategory: EconomicsReport['byScenarioCategory'] = {};
  for (const record of records) {
    const scenario = record.attribution.scenarioId || 'default';
    if (!byScenarioCategory[scenario]) {
      byScenarioCategory[scenario] = { spendUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
    }
    byScenarioCategory[scenario].spendUsd += record.cost.totalCostUsd;
    byScenarioCategory[scenario].calls += 1;
    byScenarioCategory[scenario].inputTokens += record.usage.inputTokens;
    byScenarioCategory[scenario].outputTokens += record.usage.outputTokens;
    byScenarioCategory[scenario].reasoningTokens += record.usage.reasoningTokens ?? 0;
  }

  // Round scenario totals
  for (const scenario of Object.keys(byScenarioCategory)) {
    byScenarioCategory[scenario].spendUsd = roundUsd(byScenarioCategory[scenario].spendUsd);
  }
  
  // Build daily spend series
  const dailyMap = new Map<string, { spendUsd: number; calls: number }>();
  for (const record of records) {
    const date = record.timestamp.slice(0, 10); // YYYY-MM-DD
    const current = dailyMap.get(date) || { spendUsd: 0, calls: 0 };
    current.spendUsd += record.cost.totalCostUsd;
    current.calls += 1;
    dailyMap.set(date, current);
  }
  
  const dailySpendSeries = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      spendUsd: roundUsd(data.spendUsd),
      calls: data.calls,
    }));
  
  // Calculate efficiency metrics (placeholder - would need PR data)
  const efficiencyMetrics = {
    tokensPerMergedPr: null,
    costPerMergedPr: null,
  };
  
  return {
    schemaVersion: 'economics_report.v1',
    generatedAt: new Date().toISOString(),
    dateRange,
    summary: {
      ...summary,
      totalSpendUsd: roundUsd(summary.totalSpendUsd),
    },
    byProvider,
    byPhase,
    byScenarioCategory,
    dailySpendSeries,
    efficiencyMetrics,
    records,
  };
}

/**
 * Check if daily spend exceeds warning threshold
 */
export function checkSpendWarning(
  dailySpend: number,
  dailyTarget: number = 1000,
  warningThreshold: number = 0.8
): { exceeded: boolean; severity: 'none' | 'warning' | 'critical' } {
  const warningLevel = dailyTarget * warningThreshold;
  
  if (dailySpend >= dailyTarget) {
    return { exceeded: true, severity: 'critical' };
  }
  
  if (dailySpend >= warningLevel) {
    return { exceeded: true, severity: 'warning' };
  }
  
  return { exceeded: false, severity: 'none' };
}

/**
 * Type guard to check if value is a record object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
