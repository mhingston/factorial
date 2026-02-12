import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateCodegenArtifacts, generateSchemaFromExamples, type CodegenTarget } from './codegen.js';

const FIXTURE_ROOT = new URL('../../../../tests/fixtures/dtu/codegen/', import.meta.url);
const TARGETS_PATH = new URL('./targets.json', FIXTURE_ROOT);
const EXPECTED_ROOT = new URL('./expected/', FIXTURE_ROOT);

async function loadTargets(): Promise<CodegenTarget[]> {
  const raw = await readFile(TARGETS_PATH, 'utf-8');
  return JSON.parse(raw) as CodegenTarget[];
}

function fixtureName(nodeType: string): string {
  return nodeType.replace(/\./g, '-');
}

describe('codegen', () => {
  it('generates deterministic handler and schema artifacts for targets', async () => {
    const targets = await loadTargets();
    const artifacts = generateCodegenArtifacts(targets);

    for (const artifact of artifacts) {
      const baseName = fixtureName(artifact.node_type);
      const schemaPath = new URL(`./${baseName}.schema.json`, EXPECTED_ROOT);
      const handlerPath = new URL(`./${baseName}.handler.ts`, EXPECTED_ROOT);
      const expectedSchemaRaw = await readFile(schemaPath, 'utf-8');
      const expectedHandler = await readFile(handlerPath, 'utf-8');

      expect(artifact.schema).toEqual(JSON.parse(expectedSchemaRaw));
      expect(artifact.handler_source).toBe(expectedHandler);
    }
  });

  it('merges array schemas deterministically', () => {
    const schema = generateSchemaFromExamples([['a'], ['b']]);
    expect(schema).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });
});
