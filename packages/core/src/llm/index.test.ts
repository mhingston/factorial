import { describe, expect, it } from 'vitest';
import { createDefaultLlmAdapter } from './index.js';

describe('DefaultLlmAdapter', () => {
  it('exposes stream stub with explicit not-implemented error', async () => {
    const adapter = createDefaultLlmAdapter();
    const iterator = adapter.stream({
      backend: 'api',
      nodeId: 'node',
      provider: 'openai',
      model: 'gpt-test',
      prompt: 'hello',
    });

    await expect(iterator.next()).rejects.toThrow('not implemented');
  });
});
