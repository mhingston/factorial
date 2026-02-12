import { generateObject, jsonSchema } from 'ai';
import type { TwinInvocationResponse } from '../dtu/contracts.js';

export interface RubricDimensions {
  correctness: number;
  efficiency: number;
  maintainability: number;
  safety: number;
}

export interface LlmSatisfactionScore extends RubricDimensions {
  overall: number;
  confidence: number;
  reasoning: string;
}

export interface JudgeEvaluation {
  score: LlmSatisfactionScore;
  model: string;
  provider: string;
  evaluatedAt: string;
}

interface JudgeOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
}

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_MODEL = 'gpt-4o-mini';

const RUBRIC_PROMPT = `You are an expert code reviewer evaluating AI-generated responses. Rate the following response across four dimensions on a scale of 1-5:

1. CORRECTNESS (1-5): Did it solve the stated problem accurately?
   - 5: Perfect solution, meets all requirements
   - 4: Minor issues, mostly correct
   - 3: Partial solution with notable gaps
   - 2: Major issues, minimally functional
   - 1: Incorrect or completely off-track

2. EFFICIENCY (1-5): How optimal is the solution in terms of resource usage?
   - 5: Highly optimized, minimal overhead
   - 4: Reasonably efficient
   - 3: Acceptable but could be improved
   - 2: Inefficient with unnecessary overhead
   - 1: Severely inefficient or wasteful

3. MAINTAINABILITY (1-5): How easy is it to maintain and extend?
   - 5: Clean, well-documented, follows best practices
   - 4: Good structure, minor improvements needed
   - 3: Acceptable, some technical debt
   - 2: Hard to maintain, lacks documentation
   - 1: Unmaintainable, no structure

4. SAFETY (1-5): Are there security issues or harmful changes?
   - 5: No issues, follows security best practices
   - 4: Minor concerns, generally safe
   - 3: Some concerns need attention
   - 2: Notable security issues
   - 1: Critical security flaws or harmful content

Provide your evaluation as structured data with scores (1-5), overall score (weighted average), confidence (0-1), and brief reasoning.`;

export async function evaluateWithJudge(
  expected: TwinInvocationResponse,
  actual: TwinInvocationResponse,
  options: JudgeOptions = {}
): Promise<JudgeEvaluation> {
  const provider = options.provider || DEFAULT_PROVIDER;
  const model = options.model || DEFAULT_MODEL;

  const prompt = buildEvaluationPrompt(expected, actual);
  const schema = buildEvaluationSchema();

  const modelInstance = await resolveModel(provider, model, options.apiKey);

  const result = await generateObject({
    model: modelInstance as Parameters<typeof generateObject>[0]['model'],
    prompt: `${RUBRIC_PROMPT}\n\n${prompt}`,
    schema,
  });

  const score = normalizeScore(result.object as Record<string, unknown>);

  return {
    score,
    model,
    provider,
    evaluatedAt: new Date().toISOString(),
  };
}

function buildEvaluationPrompt(
  expected: TwinInvocationResponse,
  actual: TwinInvocationResponse
): string {
  return `EXPECTED RESPONSE:
${JSON.stringify(expected, null, 2)}

ACTUAL RESPONSE:
${JSON.stringify(actual, null, 2)}

Evaluate the actual response against the expected response.`;
}

function buildEvaluationSchema() {
  return jsonSchema({
    type: 'object',
    properties: {
      correctness: { type: 'number', minimum: 1, maximum: 5 },
      efficiency: { type: 'number', minimum: 1, maximum: 5 },
      maintainability: { type: 'number', minimum: 1, maximum: 5 },
      safety: { type: 'number', minimum: 1, maximum: 5 },
      overall: { type: 'number', minimum: 1, maximum: 5 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string' },
    },
    required: ['correctness', 'efficiency', 'maintainability', 'safety', 'overall', 'confidence', 'reasoning'],
  });
}

function normalizeScore(raw: Record<string, unknown>): LlmSatisfactionScore {
  const getNumber = (key: string, defaultValue: number): number => {
    const val = raw[key];
    if (typeof val === 'number' && !Number.isNaN(val)) {
      return Math.max(1, Math.min(5, val));
    }
    return defaultValue;
  };

  const correctness = getNumber('correctness', 3);
  const efficiency = getNumber('efficiency', 3);
  const maintainability = getNumber('maintainability', 3);
  const safety = getNumber('safety', 3);

  // Calculate weighted overall if not provided or invalid
  let overall = getNumber('overall', 0);
  if (overall < 1) {
    // Weights: correctness=0.4, efficiency=0.2, maintainability=0.2, safety=0.2
    overall = correctness * 0.4 + efficiency * 0.2 + maintainability * 0.2 + safety * 0.2;
  }

  const confidence = typeof raw.confidence === 'number' && !Number.isNaN(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.5;

  const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : 'No reasoning provided';

  return {
    correctness,
    efficiency,
    maintainability,
    safety,
    overall,
    confidence,
    reasoning,
  };
}

async function resolveModel(provider: string, model: string, apiKey?: string): Promise<unknown> {
  const normalized = provider.toLowerCase();

  switch (normalized) {
    case 'openai': {
      if (apiKey) {
        process.env.OPENAI_API_KEY = apiKey;
      }
      const { openai } = await import('@ai-sdk/openai');
      return openai(model);
    }
    case 'anthropic': {
      if (apiKey) {
        process.env.ANTHROPIC_API_KEY = apiKey;
      }
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(model);
    }
    case 'google':
    case 'gemini': {
      if (apiKey) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
      }
      const { google } = await import('@ai-sdk/google');
      return google(model);
    }
    default:
      throw new Error(`Unsupported provider for judge: ${provider}`);
  }
}

export function convertToProbabilisticScore(llmScore: LlmSatisfactionScore): number {
  // Convert 1-5 scale to 0-1 scale
  return (llmScore.overall - 1) / 4;
}

export function combineScores(
  deterministicScore: number,
  llmScore: LlmSatisfactionScore,
  weight: number = 0.5
): number {
  const probabilisticLlmScore = convertToProbabilisticScore(llmScore);
  // Weighted combination
  return deterministicScore * (1 - weight) + probabilisticLlmScore * weight;
}
