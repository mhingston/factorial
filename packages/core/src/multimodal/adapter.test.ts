import { describe, expect, test } from 'vitest';
import { ContentKind, type Message } from '../types/index.js';
import {
  convertToAnthropicMessages,
  convertToGeminiMessages,
  convertToOpenAIMessages,
  getSupportedContentTypes,
  hasMultimodalContent,
} from './adapter.js';

describe('Multi-modal Adapter', () => {
  describe('convertToOpenAIMessages', () => {
    test('converts text-only messages', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ kind: ContentKind.TEXT, text: 'Hello' }],
        },
      ];

      const result = convertToOpenAIMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello');
    });

    test('converts messages with images', () => {
      const imageData = Buffer.from('fake-image-data');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { kind: ContentKind.TEXT, text: 'Describe this' },
            {
              kind: ContentKind.IMAGE,
              image: {
                data: imageData,
                media_type: 'image/png',
                detail: 'high',
              },
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(Array.isArray(result[0].content)).toBe(true);
      
      const content = result[0].content as Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }>;
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[0].text).toBe('Describe this');
      expect(content[1].type).toBe('image_url');
      expect(content[1].image_url?.detail).toBe('high');
      expect(content[1].image_url?.url).toContain('base64');
    });

    test('converts image with URL instead of data', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.IMAGE,
              image: {
                url: 'https://example.com/image.png',
                media_type: 'image/png',
              },
            },
          ],
        },
      ];

      const result = convertToOpenAIMessages(messages);
      const content = result[0].content as Array<{ type: string; image_url?: { url: string } }>;
      expect(content[0].image_url?.url).toBe('https://example.com/image.png');
    });
  });

  describe('convertToAnthropicMessages', () => {
    test('converts text-only messages', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ kind: ContentKind.TEXT, text: 'Hello' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toHaveLength(1);
      expect(result[0].content[0].type).toBe('text');
      expect(result[0].content[0].text).toBe('Hello');
    });

    test('converts images to base64 format', () => {
      const imageData = Buffer.from('fake-image-data');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.IMAGE,
              image: {
                data: imageData,
                media_type: 'image/png',
              },
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);
      expect(result[0].content[0].type).toBe('image');
      expect(result[0].content[0].source.type).toBe('base64');
      expect(result[0].content[0].source.media_type).toBe('image/png');
    });

    test('converts PDF documents', () => {
      const pdfData = Buffer.from('fake-pdf-data');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.DOCUMENT,
              document: {
                data: pdfData,
                media_type: 'application/pdf',
                file_name: 'document.pdf',
              },
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);
      expect(result[0].content[0].type).toBe('document');
      expect(result[0].content[0].source.type).toBe('base64');
      expect(result[0].content[0].source.media_type).toBe('application/pdf');
    });

    test('converts plain text documents to text blocks', () => {
      const textData = Buffer.from('Hello world');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.DOCUMENT,
              document: {
                data: textData,
                media_type: 'text/plain',
              },
            },
          ],
        },
      ];

      const result = convertToAnthropicMessages(messages);
      expect(result[0].content[0].type).toBe('text');
      expect(result[0].content[0].text).toBe('Hello world');
    });

    test('maps system role to user', () => {
      const messages: Message[] = [
        {
          role: 'system',
          content: [{ kind: ContentKind.TEXT, text: 'System message' }],
        },
      ];

      const result = convertToAnthropicMessages(messages);
      expect(result[0].role).toBe('user');
    });
  });

  describe('convertToGeminiMessages', () => {
    test('converts text-only messages', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ kind: ContentKind.TEXT, text: 'Hello' }],
        },
      ];

      const result = convertToGeminiMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0].text).toBe('Hello');
    });

    test('converts images', () => {
      const imageData = Buffer.from('fake-image-data');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.IMAGE,
              image: {
                data: imageData,
                media_type: 'image/png',
              },
            },
          ],
        },
      ];

      const result = convertToGeminiMessages(messages);
      expect(result[0].parts[0].inlineData?.mimeType).toBe('image/png');
      expect(result[0].parts[0].inlineData?.data).toBe(imageData.toString('base64'));
    });

    test('converts audio', () => {
      const audioData = Buffer.from('fake-audio-data');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.AUDIO,
              audio: {
                data: audioData,
                media_type: 'audio/mp3',
              },
            },
          ],
        },
      ];

      const result = convertToGeminiMessages(messages);
      expect(result[0].parts[0].inlineData?.mimeType).toBe('audio/mp3');
    });

    test('converts documents', () => {
      const pdfData = Buffer.from('fake-pdf-data');
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              kind: ContentKind.DOCUMENT,
              document: {
                data: pdfData,
                media_type: 'application/pdf',
              },
            },
          ],
        },
      ];

      const result = convertToGeminiMessages(messages);
      expect(result[0].parts[0].inlineData?.mimeType).toBe('application/pdf');
    });

    test('maps assistant role to model', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [{ kind: ContentKind.TEXT, text: 'Response' }],
        },
      ];

      const result = convertToGeminiMessages(messages);
      expect(result[0].role).toBe('model');
    });
  });

  describe('hasMultimodalContent', () => {
    test('returns false for text-only messages', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ kind: ContentKind.TEXT, text: 'Hello' }],
        },
      ];

      expect(hasMultimodalContent(messages)).toBe(false);
    });

    test('returns true for image content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { kind: ContentKind.TEXT, text: 'Look at this' },
            { kind: ContentKind.IMAGE, image: { media_type: 'image/png' } },
          ],
        },
      ];

      expect(hasMultimodalContent(messages)).toBe(true);
    });

    test('returns true for audio content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ kind: ContentKind.AUDIO, audio: { media_type: 'audio/mp3' } }],
        },
      ];

      expect(hasMultimodalContent(messages)).toBe(true);
    });

    test('returns true for document content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ kind: ContentKind.DOCUMENT, document: { media_type: 'application/pdf' } }],
        },
      ];

      expect(hasMultimodalContent(messages)).toBe(true);
    });
  });

  describe('getSupportedContentTypes', () => {
    test('returns correct support for OpenAI', () => {
      const support = getSupportedContentTypes('openai');
      expect(support.images).toBe(true);
      expect(support.audio).toBe(false);
      expect(support.documents).toBe(false);
    });

    test('returns correct support for Anthropic', () => {
      const support = getSupportedContentTypes('anthropic');
      expect(support.images).toBe(true);
      expect(support.audio).toBe(false);
      expect(support.documents).toBe(true);
    });

    test('returns correct support for Google/Gemini', () => {
      const support = getSupportedContentTypes('google');
      expect(support.images).toBe(true);
      expect(support.audio).toBe(true);
      expect(support.documents).toBe(true);

      const geminiSupport = getSupportedContentTypes('gemini');
      expect(geminiSupport.images).toBe(true);
      expect(geminiSupport.audio).toBe(true);
      expect(geminiSupport.documents).toBe(true);
    });

    test('returns no support for unknown providers', () => {
      const support = getSupportedContentTypes('unknown');
      expect(support.images).toBe(false);
      expect(support.audio).toBe(false);
      expect(support.documents).toBe(false);
    });
  });
});
