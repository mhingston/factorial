import { isDeepStrictEqual } from 'node:util';
import type { TwinInvocationResponse } from './contracts.js';

export interface SatisfactionScore {
  value: number;
  components: {
    status_match: number;
    structure_match: number;
    content_match: number;
  };
  details: string[];
}

export interface SatisfactionDistribution {
  mean: number;
  median: number;
  min: number;
  max: number;
  std_dev: number;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
  };
  buckets: {
    excellent: number; // 0.9-1.0
    good: number;      // 0.7-0.9
    acceptable: number; // 0.5-0.7
    poor: number;      // 0.3-0.5
    failed: number;    // 0.0-0.3
  };
}

export const PROBABILISTIC_SATISFACTION_VERSION = '1.0.0';

export function computeSatisfactionScore(
  expected: TwinInvocationResponse,
  actual: TwinInvocationResponse
): SatisfactionScore {
  // If status doesn't match, the entire score is 0
  const statusMatch = computeStatusMatch(expected, actual);
  if (statusMatch === 0) {
    return {
      value: 0,
      components: {
        status_match: 0,
        structure_match: 0,
        content_match: 0,
      },
      details: [`Status mismatch: expected ${expected.status}, got ${actual.status}`],
    };
  }

  const components = {
    status_match: statusMatch,
    structure_match: computeStructureMatch(expected, actual),
    content_match: computeContentMatch(expected, actual),
  };

  // Weighted average: status is most important, then structure, then content
  const weights = { status: 0.5, structure: 0.3, content: 0.2 };
  const value =
    components.status_match * weights.status +
    components.structure_match * weights.structure +
    components.content_match * weights.content;

  const details: string[] = [];
  if (components.status_match < 1) {
    details.push(`Status mismatch: expected ${expected.status}, got ${actual.status}`);
  }
  if (components.structure_match < 1) {
    details.push('Response structure differs from expected');
  }
  if (components.content_match < 1) {
    details.push('Response content partially matches');
  }

  return {
    value: Math.round(value * 1000) / 1000, // Round to 3 decimal places
    components,
    details: details.length > 0 ? details : ['Full parity match'],
  };
}

function computeStatusMatch(
  expected: TwinInvocationResponse,
  actual: TwinInvocationResponse
): number {
  return expected.status === actual.status ? 1.0 : 0.0;
}

function computeStructureMatch(
  expected: TwinInvocationResponse,
  actual: TwinInvocationResponse
): number {
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();

  if (expectedKeys.length === 0) return 1.0;

  const matchingKeys = expectedKeys.filter(key => actualKeys.includes(key));
  return matchingKeys.length / expectedKeys.length;
}

function computeContentMatch(
  expected: TwinInvocationResponse,
  actual: TwinInvocationResponse
): number {
  // If status differs, content match is 0 - this is the most important check
  if (expected.status !== actual.status) {
    return 0.0;
  }

  if (isDeepStrictEqual(expected, actual)) {
    return 1.0;
  }

  // Compare output or error based on status
  if (expected.status === 'success') {
    return compareObjects(expected.output, actual.output);
  } else {
    return compareErrorObjects(expected.error, actual.error);
  }
}

function compareObjects(expected: unknown, actual: unknown): number {
  if (expected === null && actual === null) return 1.0;
  if (expected === null || actual === null) return 0.0;

  if (typeof expected !== 'object' || typeof actual !== 'object') {
    return expected === actual ? 1.0 : 0.0;
  }

  const expectedObj = expected as Record<string, unknown>;
  const actualObj = actual as Record<string, unknown>;
  const keys = Object.keys(expectedObj);

  if (keys.length === 0) return 1.0;

  let totalScore = 0;
  for (const key of keys) {
    if (!(key in actualObj)) {
      continue; // Missing key counts as 0
    }
    const fieldScore = compareFieldValues(expectedObj[key], actualObj[key]);
    totalScore += fieldScore;
  }

  return totalScore / keys.length;
}

function compareFieldValues(expected: unknown, actual: unknown): number {
  if (typeof expected !== typeof actual) {
    return 0.0;
  }

  if (typeof expected === 'string') {
    return compareStrings(expected as string, actual as string);
  }

  if (typeof expected === 'number') {
    return compareNumbers(expected as number, actual as number);
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return compareArrays(expected, actual);
  }

  if (typeof expected === 'object' && expected !== null) {
    return compareObjects(expected, actual);
  }

  return expected === actual ? 1.0 : 0.0;
}

function compareStrings(expected: string, actual: string): number {
  if (expected === actual) return 1.0;

  // Check for substring match (e.g., URL patterns with IDs)
  if (actual.includes(expected) || expected.includes(actual)) {
    return 0.8;
  }

  // Compute Jaccard similarity for word overlap
  const expectedWords = new Set(expected.toLowerCase().split(/\s+/));
  const actualWords = new Set(actual.toLowerCase().split(/\s+/));

  const intersection = new Set([...expectedWords].filter(x => actualWords.has(x)));
  const union = new Set([...expectedWords, ...actualWords]);

  return intersection.size / union.size;
}

function compareNumbers(expected: number, actual: number): number {
  if (expected === actual) return 1.0;

  // For timestamps and IDs, check if they're close or same order of magnitude
  const maxVal = Math.max(Math.abs(expected), Math.abs(actual));
  if (maxVal === 0) return 1.0;

  const diff = Math.abs(expected - actual) / maxVal;
  return Math.max(0, 1 - diff);
}

function compareArrays(expected: unknown[], actual: unknown[]): number {
  if (expected.length === 0) return actual.length === 0 ? 1.0 : 0.0;

  let totalScore = 0;
  const minLength = Math.min(expected.length, actual.length);

  for (let i = 0; i < minLength; i++) {
    totalScore += compareFieldValues(expected[i], actual[i]);
  }

  // Penalize length differences
  const lengthPenalty = Math.abs(expected.length - actual.length) / Math.max(expected.length, actual.length);

  return (totalScore / expected.length) * (1 - lengthPenalty);
}

function compareErrorObjects(
  expected: unknown,
  actual: unknown
): number {
  if (expected === null && actual === null) return 1.0;
  if (expected === null || actual === null) return 0.0;

  const expectedErr = expected as Record<string, unknown>;
  const actualErr = actual as Record<string, unknown>;

  // Error code is most important
  const codeMatch = expectedErr.code === actualErr.code ? 1.0 : 0.0;

  // Error class is second priority
  const classMatch = expectedErr.class === actualErr.class ? 1.0 : 0.0;

  // Message can vary, so do partial matching
  const messageScore = compareStrings(
    (expectedErr.message as string) || '',
    (actualErr.message as string) || ''
  );

  return codeMatch * 0.5 + classMatch * 0.3 + messageScore * 0.2;
}

export function computeSatisfactionDistribution(scores: number[]): SatisfactionDistribution {
  if (scores.length === 0) {
    return {
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      std_dev: 0,
      quartiles: { q1: 0, q2: 0, q3: 0 },
      buckets: { excellent: 0, good: 0, acceptable: 0, poor: 0, failed: 0 },
    };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const min = sorted[0];
  const max = sorted[n - 1];

  // Median
  const median = n % 2 === 0
    ? (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2
    : sorted[Math.floor(n / 2)];

  // Quartiles using standard method
  const getPercentile = (arr: number[], p: number) => {
    const index = (arr.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= arr.length) return arr[lower];
    return arr[lower] * (1 - weight) + arr[upper] * weight;
  };

  const quartiles = {
    q1: getPercentile(sorted, 0.25),
    q2: getPercentile(sorted, 0.5),
    q3: getPercentile(sorted, 0.75),
  };

  // Standard deviation
  const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const std_dev = Math.sqrt(variance);

  // Buckets aligned with test expectations:
  // excellent: 0.9+, good: 0.8-0.9, acceptable: 0.5-0.8, poor: 0.3-0.5, failed: <0.3
  const buckets = {
    excellent: scores.filter(s => s >= 0.9).length,
    good: scores.filter(s => s >= 0.8 && s < 0.9).length,
    acceptable: scores.filter(s => s >= 0.5 && s < 0.8).length,
    poor: scores.filter(s => s >= 0.3 && s < 0.5).length,
    failed: scores.filter(s => s < 0.3).length,
  };

  return {
    mean: Math.round(mean * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    min: Math.round(min * 1000) / 1000,
    max: Math.round(max * 1000) / 1000,
    std_dev: Math.round(std_dev * 1000) / 1000,
    quartiles: {
      q1: Math.round(quartiles.q1 * 1000) / 1000,
      q2: Math.round(quartiles.q2 * 1000) / 1000,
      q3: Math.round(quartiles.q3 * 1000) / 1000,
    },
    buckets,
  };
}

export function probabilisticStatus(score: number): 'satisfied' | 'unsatisfied' | 'marginal' {
  if (score >= 0.8) return 'satisfied';
  if (score >= 0.5) return 'marginal';
  return 'unsatisfied';
}
