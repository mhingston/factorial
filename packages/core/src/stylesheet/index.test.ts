import { describe, expect, it } from 'vitest';
import { applyModelStylesheet, parseModelStylesheet } from './index.js';
import type { Graph, Node, Edge } from '../types/index.js';

function createNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: 'codergen',
    shape: 'box',
    label: id,
    max_retries: 0,
    goal_gate: false,
    reasoning_effort: 'high',
    auto_status: false,
    allow_partial: false,
    attributes: {},
    ...overrides,
  };
}

describe('parseModelStylesheet', () => {
  it('parses selectors and declarations', () => {
    const rules = parseModelStylesheet('box { llm_provider: openai; }');
    expect(rules).toHaveLength(1);
    expect(rules[0].selectors[0].value).toBe('box');
    expect(rules[0].declarations.llm_provider).toBe('openai');
  });

  it('parses wildcard selectors', () => {
    const rules = parseModelStylesheet('* { llm_model: gpt-4o-mini; }');
    expect(rules).toHaveLength(1);
    expect(rules[0].selectors[0].type).toBe('all');
    expect(rules[0].declarations.llm_model).toBe('gpt-4o-mini');
  });
});

describe('applyModelStylesheet', () => {
  it('applies rules with correct precedence', () => {
    const nodes = new Map<string, Node>([
      ['fast', createNode('fast', { class: 'fast' })],
      ['explicit', createNode('explicit', { llm_model: 'explicit-model', attributes: { llm_model: 'explicit-model' } })],
    ]);

    const edges: Edge[] = [];
    const graph: Graph = {
      id: 'G',
      default_max_retry: 50,
      nodes,
      edges,
      attributes: {},
      model_stylesheet: `
        box { llm_provider: openai; llm_model: gpt-4o; reasoning_effort: medium; }
        .fast { llm_model: gpt-4o-mini; }
      `,
    };

    applyModelStylesheet(graph);

    expect(graph.nodes.get('fast')?.llm_provider).toBe('openai');
    expect(graph.nodes.get('fast')?.llm_model).toBe('gpt-4o-mini');
    expect(graph.nodes.get('fast')?.reasoning_effort).toBe('medium');
    expect(graph.nodes.get('explicit')?.llm_model).toBe('explicit-model');
  });
});
