import { ContentKind } from '../types/index.js';
import type { Message } from '../types/index.js';

// OpenAI message format
interface OpenAIImageUrl {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

interface OpenAIText {
  type: 'text';
  text: string;
}

type OpenAIContent = OpenAIText | OpenAIImageUrl;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContent[];
}

// Anthropic message format
interface AnthropicImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

interface AnthropicImageBlock {
  type: 'image';
  source: AnthropicImageSource;
}

interface AnthropicDocumentSource {
  type: 'base64';
  media_type: string;
  data: string;
}

interface AnthropicDocumentBlock {
  type: 'document';
  source: AnthropicDocumentSource;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock | AnthropicDocumentBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

// Gemini message format
interface GeminiInlineData {
  mimeType: string;
  data: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export function convertToOpenAIMessages(messages: Message[]): OpenAIMessage[] {
  return messages.map((msg): OpenAIMessage => {
    const content: OpenAIContent[] = [];

    for (const part of msg.content) {
      if (part.kind === ContentKind.TEXT && part.text) {
        content.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.kind === ContentKind.IMAGE && part.image) {
        const imageUrl = part.image.data
          ? `data:${part.image.media_type};base64,${part.image.data.toString('base64')}`
          : part.image.url!;
        content.push({
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: part.image.detail || 'auto',
          },
        });
      }
      // OpenAI doesn't support audio/documents in chat completions
    }

    return {
      role: msg.role,
      content: content.length === 1 && content[0].type === 'text' ? content[0].text : content,
    };
  });
}

export function convertToAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  return messages.map((msg): AnthropicMessage => {
    const content: AnthropicContentBlock[] = [];

    for (const part of msg.content) {
      if (part.kind === ContentKind.TEXT && part.text) {
        content.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.kind === ContentKind.IMAGE && part.image) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.image.media_type,
            data: part.image.data?.toString('base64') || '',
          },
        });
      } else if (part.kind === ContentKind.DOCUMENT && part.document) {
        if (part.document.media_type === 'application/pdf') {
          content.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: part.document.data?.toString('base64') || '',
            },
          });
        } else if (part.document.media_type === 'text/plain' && part.document.data) {
          content.push({
            type: 'text',
            text: part.document.data.toString(),
          });
        }
      }
      // Anthropic doesn't support audio
    }

    return {
      role: msg.role === 'tool' ? 'user' : msg.role === 'system' ? 'user' : msg.role,
      content,
    };
  });
}

export function convertToGeminiMessages(messages: Message[]): GeminiContent[] {
  return messages.map((msg): GeminiContent => {
    const parts: GeminiPart[] = [];

    for (const part of msg.content) {
      if (part.kind === ContentKind.TEXT && part.text) {
        parts.push({ text: part.text });
      } else if (part.kind === ContentKind.IMAGE && part.image) {
        parts.push({
          inlineData: {
            mimeType: part.image.media_type,
            data: part.image.data?.toString('base64') || '',
          },
        });
      } else if (part.kind === ContentKind.AUDIO && part.audio) {
        parts.push({
          inlineData: {
            mimeType: part.audio.media_type,
            data: part.audio.data?.toString('base64') || '',
          },
        });
      } else if (part.kind === ContentKind.DOCUMENT && part.document) {
        parts.push({
          inlineData: {
            mimeType: part.document.media_type,
            data: part.document.data?.toString('base64') || '',
          },
        });
      }
    }

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

export function hasMultimodalContent(messages: Message[]): boolean {
  for (const msg of messages) {
    for (const part of msg.content) {
      if (part.kind === ContentKind.IMAGE || part.kind === ContentKind.AUDIO || part.kind === ContentKind.DOCUMENT) {
        return true;
      }
    }
  }
  return false;
}

export function getSupportedContentTypes(provider: string): { images: boolean; audio: boolean; documents: boolean } {
  const normalized = provider.toLowerCase();

  switch (normalized) {
    case 'openai':
      return { images: true, audio: false, documents: false };
    case 'anthropic':
      return { images: true, audio: false, documents: true };
    case 'google':
    case 'gemini':
      return { images: true, audio: true, documents: true };
    default:
      return { images: false, audio: false, documents: false };
  }
}
