import { describe, expect, it } from 'vitest';
import type { Context, Graph, Handler, Node, Outcome } from '../types/index.js';
import { HandlerRegistry } from './registry.js';

class NamedHandler implements Handler {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async execute(): Promise<Outcome> {
    return {
      status: 'SUCCESS',
      context_updates: { handler: this.name },
    };
  }
}

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n1',
    type: 'tool',
    shape: 'parallelogram',
    label: 'n1',
    max_retries: 0,
    goal_gate: false,
    reasoning_effort: 'high',
    auto_status: false,
    allow_partial: false,
    attributes: {},
    ...overrides,
  };
}

describe('HandlerRegistry', () => {
  it('registers, resolves, and unregisters by explicit type', async () => {
    const registry = new HandlerRegistry();
    const toolHandler = new NamedHandler('tool');
    const outcome = await toolHandler.execute();

    registry.register('tool', toolHandler);
    expect(registry.has('tool')).toBe(true);
    expect(registry.getRegisteredTypes()).toContain('tool');
    expect(registry.resolve(createNode({ type: 'tool' }))).toBe(toolHandler);
    expect(outcome.context_updates).toEqual({ handler: 'tool' });
    expect(registry.unregister('tool')).toBe(true);
    expect(registry.has('tool')).toBe(false);
  });

  it('falls back to shape mapping and then default handler', async () => {
    const registry = new HandlerRegistry();
    const startHandler = new NamedHandler('start');
    registry.register('start', startHandler);

    expect(registry.resolve(createNode({ type: '', shape: 'Mdiamond' }))).toBe(startHandler);

    const unknownNode = createNode({ type: 'unknown', shape: 'unknown' });
    const defaultHandler = registry.resolve(unknownNode);
    const outcome = await defaultHandler.execute(
      unknownNode,
      {} as Context,
      {} as Graph,
      ''
    );

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.context_updates).toEqual({});
  });

  it('supports overriding the default handler', () => {
    const registry = new HandlerRegistry();
    const customDefault = new NamedHandler('custom-default');

    registry.setDefault(customDefault);
    expect(registry.resolve(createNode({ type: 'unknown', shape: 'unknown' }))).toBe(customDefault);
  });
});
