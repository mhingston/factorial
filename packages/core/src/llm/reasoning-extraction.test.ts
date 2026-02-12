/**
 * Reasoning Extraction Module Tests (SA-002)
 */

import { describe, expect, test } from 'vitest';
import {
  type ExtractionResult,
  buildReasoningData,
  estimateTokenCount,
  extractAnthropicReasoning,
  extractGeminiReasoning,
  extractOpenAIReasoning,
} from './reasoning-extraction.js';

describe('Reasoning Extraction', () => {
  describe('OpenAI', () => {
    test('extracts reasoning token count from OpenAI response', () => {
      const response = {
        text: 'Hello, this is the response text',
        usage: {
          promptTokens: 10,
          completionTokens: 100,
          completionTokensDetails: {
            reasoningTokens: 80,
          },
        },
      };

      const result = extractOpenAIReasoning(response);

      expect(result.reasoningTokens).toBe(80);
      expect(result.reasoning).toBeUndefined();
      expect(result.text).toBe('Hello, this is the response text');
    });

    test('handles OpenAI response without reasoning tokens', () => {
      const response = {
        text: 'Simple response without reasoning',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
        },
      };

      const result = extractOpenAIReasoning(response);

      expect(result.reasoningTokens).toBeUndefined();
      expect(result.reasoning).toBeUndefined();
      expect(result.text).toBe('Simple response without reasoning');
    });

    test('handles OpenAI response without usage data', () => {
      const response = {
        text: 'Response without usage',
      };

      const result = extractOpenAIReasoning(response);

      expect(result.reasoningTokens).toBeUndefined();
      expect(result.reasoning).toBeUndefined();
      expect(result.text).toBe('Response without usage');
    });
  });

  describe('Anthropic', () => {
    test('extracts thinking blocks from Anthropic response', () => {
      const response = {
        text: 'Final answer',
        content: [
          { type: 'thinking', thinking: 'Let me analyze this step by step...' },
          { type: 'text', text: 'Final answer' },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 50,
        },
      };

      const result = extractAnthropicReasoning(response);

      expect(result.reasoning).toBe('Let me analyze this step by step...');
      expect(result.reasoningTokens).toBe(9); // ~36 chars / 4
      expect(result.text).toBe('Final answer');
    });

    test('extracts multiple thinking blocks from Anthropic response', () => {
      const response = {
        text: 'The final conclusion',
        content: [
          { type: 'thinking', thinking: 'First, I need to consider...' },
          { type: 'thinking', thinking: 'Then, I should analyze...' },
          { type: 'text', text: 'The final conclusion' },
        ],
        usage: {
          input_tokens: 15,
          output_tokens: 75,
        },
      };

      const result = extractAnthropicReasoning(response);

      expect(result.reasoning).toBe('First, I need to consider...\n\nThen, I should analyze...');
      // 'First, I need to consider...' (28 chars) + '\n\n' (2 chars) + 'Then, I should analyze...' (25 chars) = 55 chars / 4 = 13.75 -> 14
      expect(result.reasoningTokens).toBe(14);
      expect(result.text).toBe('The final conclusion');
    });

    test('handles Anthropic response with redacted thinking blocks', () => {
      const response = {
        text: 'Visible text response',
        content: [
          { type: 'thinking', thinking: 'Some visible thinking' },
          { type: 'redacted_thinking', data: 'redacted-data-123' },
          { type: 'text', text: 'Visible text response' },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 50,
        },
      };

      const result = extractAnthropicReasoning(response);

      expect(result.reasoning).toContain('Some visible thinking');
      expect(result.reasoning).toContain('[1 redacted thinking block(s)]');
      expect(result.text).toBe('Visible text response');
    });

    test('handles Anthropic response without thinking blocks', () => {
      const response = {
        text: 'Just a text response',
        content: [
          { type: 'text', text: 'Just a text response' },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      const result = extractAnthropicReasoning(response);

      expect(result.reasoning).toBeUndefined();
      expect(result.reasoningTokens).toBeUndefined();
      expect(result.text).toBe('Just a text response');
    });

    test('handles empty content array', () => {
      const response = {
        text: '',
        content: [],
        usage: {
          input_tokens: 10,
          output_tokens: 0,
        },
      };

      const result = extractAnthropicReasoning(response);

      expect(result.reasoning).toBeUndefined();
      expect(result.reasoningTokens).toBeUndefined();
      expect(result.text).toBe('');
    });
  });

  describe('Gemini', () => {
    test('extracts reasoning tokens from Gemini response', () => {
      const response = {
        text: 'Final response',
        candidates: [
          {
            content: {
              parts: [
                { text: 'This is a thought', thought: true },
                { text: 'Final response', thought: false },
              ],
            },
          },
        ],
        usageMetadata: {
          thoughtsTokenCount: 25,
          promptTokenCount: 10,
          candidatesTokenCount: 30,
        },
      };

      const result = extractGeminiReasoning(response);

      expect(result.reasoning).toBe('This is a thought');
      expect(result.reasoningTokens).toBe(25);
      expect(result.text).toBe('Final response');
    });

    test('handles Gemini response with multiple thought parts', () => {
      const response = {
        text: 'Answer',
        candidates: [
          {
            content: {
              parts: [
                { text: 'First thought', thought: true },
                { text: 'Second thought', thought: true },
                { text: 'Answer', thought: false },
              ],
            },
          },
        ],
        usageMetadata: {
          thoughtsTokenCount: 50,
        },
      };

      const result = extractGeminiReasoning(response);

      expect(result.reasoning).toBe('First thought\n\nSecond thought');
      expect(result.reasoningTokens).toBe(50);
      expect(result.text).toBe('Answer');
    });

    test('handles Gemini response without thoughts', () => {
      const response = {
        text: 'Simple response',
        candidates: [
          {
            content: {
              parts: [
                { text: 'Simple response', thought: false },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
        },
      };

      const result = extractGeminiReasoning(response);

      expect(result.reasoning).toBeUndefined();
      expect(result.reasoningTokens).toBeUndefined();
      expect(result.text).toBe('Simple response');
    });

    test('handles Gemini response without usage metadata', () => {
      const response = {
        text: 'Response without usage',
        candidates: [
          {
            content: {
              parts: [
                { text: 'A thought', thought: true },
                { text: 'Response without usage', thought: false },
              ],
            },
          },
        ],
      };

      const result = extractGeminiReasoning(response);

      expect(result.reasoning).toBe('A thought');
      expect(result.reasoningTokens).toBeUndefined();
      expect(result.text).toBe('Response without usage');
    });

    test('handles missing candidates', () => {
      const response = {
        text: '',
        usageMetadata: {
          promptTokenCount: 10,
        },
      };

      const result = extractGeminiReasoning(response);

      expect(result.reasoning).toBeUndefined();
      expect(result.text).toBe('');
    });
  });

  describe('buildReasoningData', () => {
    test('builds ReasoningData from extraction result', () => {
      const extraction: ExtractionResult = {
        text: 'Visible text',
        reasoning: 'Thinking content',
        reasoningTokens: 100,
      };

      const result = buildReasoningData(extraction);

      expect(result).toEqual({
        text: 'Thinking content',
        signature: undefined,
        redacted: false,
      });
    });

    test('builds ReasoningData with signature', () => {
      const extraction: ExtractionResult = {
        text: 'Visible text',
        reasoning: 'Thinking content',
        reasoningTokens: 100,
      };

      const result = buildReasoningData(extraction, 'signature-123', false);

      expect(result).toEqual({
        text: 'Thinking content',
        signature: 'signature-123',
        redacted: false,
      });
    });

    test('returns undefined when no reasoning content', () => {
      const extraction: ExtractionResult = {
        text: 'Visible text only',
        reasoning: undefined,
        reasoningTokens: undefined,
      };

      const result = buildReasoningData(extraction);

      expect(result).toBeUndefined();
    });
  });

  describe('estimateTokenCount', () => {
    test('estimates tokens for short text', () => {
      expect(estimateTokenCount('Hello world')).toBe(3); // 11 chars / 4 = 2.75 -> 3
    });

    test('estimates tokens for longer text', () => {
      const text = 'This is a longer piece of text that should be estimated more accurately.';
      expect(estimateTokenCount(text)).toBe(18); // 72 chars / 4 = 18
    });

    test('handles empty string', () => {
      expect(estimateTokenCount('')).toBe(0);
    });

    test('handles single character', () => {
      expect(estimateTokenCount('a')).toBe(1);
    });
  });
});
