export {
  loadImage,
  loadAudio,
  loadDocument,
  inferImageMediaType,
  inferAudioMediaType,
  inferDocumentMediaType,
  validateFileSize,
  createTextMessage,
  createImageMessage,
  createMultimodalMessage,
} from './file-loader.js';

export {
  convertToOpenAIMessages,
  convertToAnthropicMessages,
  convertToGeminiMessages,
  hasMultimodalContent,
  getSupportedContentTypes,
} from './adapter.js';

// Re-export ContentKind as a value (it's an enum, not just a type)
export { ContentKind } from '../types/index.js';
export type { ImageData, AudioData, DocumentData, ContentPart, Message } from '../types/index.js';
