import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { ContentKind } from '../types/index.js';
import type { AudioData, ContentPart, DocumentData, ImageData, Message } from '../types/index.js';

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOCUMENT_SIZE = 32 * 1024 * 1024; // 32MB

export async function loadImage(path: string, detail?: 'auto' | 'low' | 'high'): Promise<ImageData> {
  const data = await readFile(path);
  validateFileSize(data, 'image');
  const media_type = inferImageMediaType(path);

  return {
    data,
    media_type,
    detail: detail || 'auto',
  };
}

export async function loadAudio(path: string): Promise<AudioData> {
  const data = await readFile(path);
  validateFileSize(data, 'audio');
  const media_type = inferAudioMediaType(path);

  return {
    data,
    media_type,
  };
}

export async function loadDocument(path: string): Promise<DocumentData> {
  const data = await readFile(path);
  validateFileSize(data, 'document');
  const media_type = inferDocumentMediaType(path);

  return {
    data,
    media_type,
    file_name: path.split('/').pop(),
  };
}

export function inferImageMediaType(path: string): ImageData['media_type'] {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      throw new Error(`Unsupported image format: ${ext}. Use png, jpg, gif, or webp.`);
  }
}

export function inferAudioMediaType(path: string): AudioData['media_type'] {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mp3';
    case '.m4a':
      return 'audio/m4a';
    case '.ogg':
      return 'audio/ogg';
    default:
      throw new Error(`Unsupported audio format: ${ext}. Use wav, mp3, m4a, or ogg.`);
  }
}

export function inferDocumentMediaType(path: string): DocumentData['media_type'] {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    default:
      throw new Error(`Unsupported document format: ${ext}. Use pdf, txt, or md.`);
  }
}

export function validateFileSize(data: Buffer, type: 'image' | 'audio' | 'document'): void {
  const limits = {
    image: MAX_IMAGE_SIZE,
    audio: MAX_AUDIO_SIZE,
    document: MAX_DOCUMENT_SIZE,
  };

  if (data.length > limits[type]) {
    throw new Error(
      `${type} file too large: ${(data.length / 1024 / 1024).toFixed(2)}MB. ` + `Max: ${limits[type] / 1024 / 1024}MB`
    );
  }
}

export function createTextMessage(text: string): Message {
  return {
    role: 'user',
    content: [{ kind: ContentKind.TEXT, text }],
  };
}

export function createImageMessage(imagePath: string): Message {
  return {
    role: 'user',
    content: [
      {
        kind: ContentKind.IMAGE,
        image: { url: imagePath, media_type: inferImageMediaType(imagePath) },
      },
    ],
  };
}

export function createMultimodalMessage(parts: ContentPart[]): Message {
  return {
    role: 'user',
    content: parts,
  };
}
