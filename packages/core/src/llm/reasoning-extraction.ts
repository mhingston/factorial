/**
 * Reasoning Token Extraction Module (SA-002)
 * Extracts thinking/reasoning blocks from LLM provider responses
 */

import type { ReasoningData } from '../types/index.js';

export interface ExtractionResult {
  reasoning: string | undefined;
  reasoningTokens: number | undefined;
  text: string;
}

// OpenAI Response Types
interface OpenAIUsage {
  promptTokens?: number;
  completionTokens?: number;
  completionTokensDetails?: {
    reasoningTokens?: number;
  };
}

interface OpenAIResponse {
  text: string;
  usage?: OpenAIUsage;
}

// Anthropic Response Types
interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

interface AnthropicRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = AnthropicThinkingBlock | AnthropicRedactedThinkingBlock | AnthropicTextBlock;

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// Gemini Response Types
interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiContent {
  parts?: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
}

interface GeminiUsageMetadata {
  thoughtsTokenCount?: number;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * Extract reasoning from OpenAI responses
 * OpenAI only exposes reasoning token counts, not the content itself
 */
export function extractOpenAIReasoning(response: OpenAIResponse): ExtractionResult {
  const reasoningTokens = response.usage?.completionTokensDetails?.reasoningTokens;

  return {
    reasoning: undefined, // OpenAI doesn't expose reasoning text
    reasoningTokens,
    text: response.text,
  };
}

/**
 * Extract reasoning from Anthropic responses
 * Anthropic provides explicit thinking blocks
 */
export function extractAnthropicReasoning(response: AnthropicResponse): ExtractionResult {
  const thinkingBlocks: AnthropicThinkingBlock[] = [];
  const redactedBlocks: AnthropicRedactedThinkingBlock[] = [];

  for (const block of response.content) {
    if (block.type === 'thinking') {
      thinkingBlocks.push(block);
    } else if (block.type === 'redacted_thinking') {
      redactedBlocks.push(block);
    }
  }

  // Combine all thinking blocks
  const reasoningParts: string[] = [];

  for (const block of thinkingBlocks) {
    reasoningParts.push(block.thinking);
  }

  // Add redacted block indicator
  if (redactedBlocks.length > 0) {
    reasoningParts.push(`[${redactedBlocks.length} redacted thinking block(s)]`);
  }

  const reasoningText = reasoningParts.join('\n\n');

  // Estimate token count from character count
  // Using approximate ratio: 1 token ~ 4 characters
  const reasoningTokens = reasoningText.length > 0
    ? Math.ceil(reasoningText.length / 4)
    : undefined;

  // Extract visible text from text blocks
  const textBlocks = response.content.filter(
    (block): block is AnthropicTextBlock => block.type === 'text'
  );

  return {
    reasoning: reasoningText || undefined,
    reasoningTokens,
    text: textBlocks.map(b => b.text).join(''),
  };
}

/**
 * Extract reasoning from Gemini responses
 * Gemini may expose both token counts and thought content
 */
export function extractGeminiReasoning(response: GeminiResponse): ExtractionResult {
  const reasoningTokens = response.usageMetadata?.thoughtsTokenCount;

  // Extract text content
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  // Separate thought parts from regular parts
  const thoughtParts: GeminiPart[] = [];
  const textParts: GeminiPart[] = [];

  for (const part of parts) {
    if (part.thought === true) {
      thoughtParts.push(part);
    } else {
      textParts.push(part);
    }
  }

  const reasoningText = thoughtParts
    .map(p => p.text)
    .filter((t): t is string => t !== undefined)
    .join('\n\n');

  const text = textParts
    .map(p => p.text)
    .filter((t): t is string => t !== undefined)
    .join('');

  return {
    reasoning: reasoningText || undefined,
    reasoningTokens,
    text,
  };
}

/**
 * Build ReasoningData structure from extraction result
 * Useful for preserving thinking blocks with signatures for round-tripping
 */
export function buildReasoningData(
  extraction: ExtractionResult,
  signature?: string,
  redacted = false
): ReasoningData | undefined {
  if (!extraction.reasoning) {
    return undefined;
  }

  return {
    text: extraction.reasoning,
    signature,
    redacted,
  };
}

/**
 * Estimate token count from text
 * Uses the standard approximation of ~4 characters per token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
