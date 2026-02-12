import { describe, expect, it, vi } from 'vitest';
import {
  type LlmSatisfactionScore,
  combineScores,
  convertToProbabilisticScore,
} from './judge.js';

describe('satisfaction/judge', () => {
  describe('convertToProbabilisticScore', () => {
    it('converts perfect score correctly', () => {
      const score: LlmSatisfactionScore = {
        correctness: 5,
        efficiency: 5,
        maintainability: 5,
        safety: 5,
        overall: 5,
        confidence: 1,
        reasoning: 'Perfect',
      };
      expect(convertToProbabilisticScore(score)).toBe(1);
    });

    it('converts minimum score correctly', () => {
      const score: LlmSatisfactionScore = {
        correctness: 1,
        efficiency: 1,
        maintainability: 1,
        safety: 1,
        overall: 1,
        confidence: 1,
        reasoning: 'Poor',
      };
      expect(convertToProbabilisticScore(score)).toBe(0);
    });

    it('converts middle score correctly', () => {
      const score: LlmSatisfactionScore = {
        correctness: 3,
        efficiency: 3,
        maintainability: 3,
        safety: 3,
        overall: 3,
        confidence: 0.8,
        reasoning: 'Average',
      };
      expect(convertToProbabilisticScore(score)).toBe(0.5);
    });
  });

  describe('combineScores', () => {
    it('combines with equal weight', () => {
      const deterministic = 0.8;
      const llmScore: LlmSatisfactionScore = {
        correctness: 4,
        efficiency: 4,
        maintainability: 4,
        safety: 4,
        overall: 4,
        confidence: 0.9,
        reasoning: 'Good',
      };
      // deterministic: 0.8, llm: (4-1)/4 = 0.75, equal weight: 0.8*0.5 + 0.75*0.5 = 0.775
      expect(combineScores(deterministic, llmScore, 0.5)).toBeCloseTo(0.775, 3);
    });

    it('favors deterministic with low weight', () => {
      const deterministic = 1.0;
      const llmScore: LlmSatisfactionScore = {
        correctness: 1,
        efficiency: 1,
        maintainability: 1,
        safety: 1,
        overall: 1,
        confidence: 0.5,
        reasoning: 'Poor',
      };
      // weight 0.1 means 90% deterministic, 10% llm
      expect(combineScores(deterministic, llmScore, 0.1)).toBeCloseTo(0.9, 3);
    });

    it('favors LLM with high weight', () => {
      const deterministic = 0;
      const llmScore: LlmSatisfactionScore = {
        correctness: 5,
        efficiency: 5,
        maintainability: 5,
        safety: 5,
        overall: 5,
        confidence: 0.9,
        reasoning: 'Perfect',
      };
      // weight 0.9 means 10% deterministic, 90% llm
      expect(combineScores(deterministic, llmScore, 0.9)).toBeCloseTo(0.9, 3);
    });
  });
});
