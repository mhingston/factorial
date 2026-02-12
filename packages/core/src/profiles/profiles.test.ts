import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Node } from '../types/index.js';
import { anthropicProfile } from './anthropic.js';
import { geminiProfile } from './gemini.js';
import { getProfile, getProfileForProvider, isValidProvider, listProfiles, listProviderIds, resolveProfile } from './index.js';
import { openaiProfile } from './openai.js';
import { globTool, grepTool, readFileTool, shellTool, writeFileTool } from './tools-common.js';
import { isValidProviderId } from './types.js';

describe('profiles', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lists and resolves provider profiles', () => {
    expect(listProviderIds()).toEqual(['openai', 'anthropic', 'gemini']);
    expect(listProfiles()).toHaveLength(3);
    expect(getProfile('openai').id).toBe('openai');
    expect(getProfile('anthropic').id).toBe('anthropic');
    expect(getProfile('gemini').id).toBe('gemini');
    expect(isValidProvider('OPENAI')).toBe(true);
    expect(isValidProviderId('openai')).toBe(true);
    expect(isValidProviderId('unknown')).toBe(false);
  });

  it('resolves provider from node attributes and defaults', () => {
    const nodeWithProvider = {
      id: 'node-1',
      type: 'codergen',
      shape: 'box',
      label: 'Test',
      max_retries: 0,
      goal_gate: false,
      reasoning_effort: 'low',
      auto_status: true,
      allow_partial: false,
      attributes: { llm_provider: 'anthropic' }
    } as Node;

    expect(resolveProfile(nodeWithProvider).id).toBe('anthropic');
    expect(resolveProfile(nodeWithProvider, 'gemini').id).toBe('anthropic');

    const nodeWithLegacy = { ...nodeWithProvider, attributes: {}, llm_provider: 'gemini' } as Node;
    expect(resolveProfile(nodeWithLegacy).id).toBe('gemini');

    const nodeDefault = { ...nodeWithProvider, attributes: {}, llm_provider: undefined } as Node;
    expect(resolveProfile(nodeDefault).id).toBe('openai');
    expect(resolveProfile(nodeDefault, 'gemini').id).toBe('gemini');
  });

  it('throws for unknown provider and resolves default model', () => {
    expect(() => getProfile('unknown')).toThrow('Unknown provider profile');
    const resolved = getProfileForProvider('openai');
    expect(resolved.id).toBe('openai');
    expect(resolved.resolvedModel).toBe(openaiProfile.defaultModel);
    const custom = getProfileForProvider('anthropic', 'custom-model');
    expect(custom.resolvedModel).toBe('custom-model');
  });

  it('executes provider tools with local files', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'profiles-test-'));
    const env = {
      workDir: tempDir,
      logsRoot: tempDir,
      nodeId: 'node-1'
    };

    const targetPath = join(tempDir, 'example.txt');
    await writeFile(targetPath, 'hello\nworld\n', 'utf-8');

    const writeResult = await writeFileTool.execute({
      file_path: targetPath,
      content: 'alpha\nbeta\n'
    }, env);
    expect(writeResult).toContain('Successfully wrote');

    const readResult = await readFileTool.execute({ file_path: targetPath }, env);
    expect(readResult).toContain('alpha');

    const grepResult = await grepTool.execute({ pattern: 'beta', path: tempDir }, env);
    expect(grepResult).toContain('example.txt');

    const globResult = await globTool.execute({ pattern: '*.txt', path: tempDir }, env);
    expect(globResult).toContain('example.txt');

    const shellResult = await shellTool.execute({ command: 'ls' }, env);
    expect(shellResult).toContain('example.txt');

    const applyPatch = openaiProfile.tools.find(tool => tool.name === 'apply_patch');
    expect(applyPatch).toBeTruthy();
    const patchResult = await applyPatch?.execute({
      patch: `***\n--- a/example.txt\n+++ b/example.txt\n@@ -1,2 +1,2 @@\n-alpha\n-beta\n+alpha\n+gamma\n***`
    }, env);
    expect(patchResult).toContain('Patch applied successfully');
    expect(readFileSync(targetPath, 'utf-8')).toContain('gamma');

    const anthropicEdit = anthropicProfile.tools.find(tool => tool.name === 'edit_file');
    expect(anthropicEdit).toBeTruthy();
    const editResult = await anthropicEdit?.execute({
      file_path: targetPath,
      old_string: 'alpha\n',
      new_string: 'delta\n'
    }, env);
    expect(editResult).toContain('Successfully replaced');

    const geminiEdit = geminiProfile.tools.find(tool => tool.name === 'edit_file');
    expect(geminiEdit).toBeTruthy();
    const geminiResult = await geminiEdit?.execute({
      file_path: targetPath,
      old_string: 'gamma\n',
      new_string: 'epsilon\n'
    }, env);
    expect(geminiResult).toContain('Successfully replaced');

    const errorRead = await readFileTool.execute({ file_path: join(tempDir, 'missing.txt') }, env);
    expect(errorRead).toContain('Error reading file');

    const errorGrep = await grepTool.execute({ pattern: '(unclosed', path: tempDir }, env);
    expect(errorGrep).toContain('Error searching');

    const errorGlob = await globTool.execute({ pattern: '*.txt', path: join(tempDir, 'missing') }, env);
    expect(errorGlob).toContain('Error globbing');
  });
});
