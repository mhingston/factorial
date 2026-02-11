import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseDOT } from '../../dot-parser/src/index.js';
import { applyModelStylesheet } from './stylesheet/index.js';
import { createDefaultLintEngine } from './lint/index.js';
import { HandlerRegistry } from './handlers/registry.js';
import {
  CodergenHandler,
  ConditionalHandler,
  ExitHandler,
  FanInHandler,
  ManagerLoopHandler,
  ParallelHandler,
  StartHandler,
  ToolHandler,
  WaitForHumanHandler,
} from './handlers/builtin.js';

const FIXTURE_ROOT = new URL('../../../tests/fixtures/reference/', import.meta.url);

describe('Reference fixture parity', () => {
  it('parses and validates simple_example.dot from reference fixtures', async () => {
    const source = await loadFixture('simple_example.dot');
    const graph = applyModelStylesheet(parseDOT(source));

    expect(graph.id).toBe('Simple');
    expect(graph.nodes.size).toBe(4);
    expect(graph.edges).toHaveLength(3);
    expect(graph.nodes.get('start')?.type).toBe('start');
    expect(graph.nodes.get('exit')?.type).toBe('exit');
    expect(graph.nodes.get('run_tests')?.llm_provider).toBe('openai');
    expect(graph.nodes.get('run_tests')?.llm_model).toBe('gpt-5.2-codex');

    const diagnostics = createDefaultLintEngine().run(graph, {
      handlerRegistry: createReferenceHandlerRegistry(),
    });
    expect(diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
  });

  it('parses consensus_task.dot with start/exit typing and loop_restart edges', async () => {
    const source = await loadFixture('consensus_task.dot');
    const graph = applyModelStylesheet(parseDOT(source));

    expect(graph.nodes.size).toBeGreaterThan(10);
    expect(graph.edges.length).toBeGreaterThan(20);
    expect(graph.nodes.get('Start')?.type).toBe('start');
    expect(graph.nodes.get('Exit')?.type).toBe('exit');
    expect(graph.nodes.get('Start')?.shape).toBe('circle');
    expect(graph.nodes.get('Exit')?.shape).toBe('doublecircle');

    const restartEdges = graph.edges.filter(edge => edge.from === 'Postmortem' && edge.loop_restart);
    expect(restartEdges).toHaveLength(3);
    expect(graph.edges.find(edge => edge.from === 'ReviewConsensus' && edge.to === 'Exit')?.condition).toBe(
      'outcome=yes'
    );

    const diagnostics = createDefaultLintEngine().run(graph, {
      handlerRegistry: createReferenceHandlerRegistry(),
    });
    expect(diagnostics.filter(d => d.level === 'error')).toHaveLength(0);
  });
});

async function loadFixture(filename: string): Promise<string> {
  return readFile(new URL(filename, FIXTURE_ROOT), 'utf-8');
}

function createReferenceHandlerRegistry(): HandlerRegistry {
  const registry = new HandlerRegistry();
  const codergen = new CodergenHandler();

  registry.register('start', new StartHandler());
  registry.register('exit', new ExitHandler());
  registry.register('codergen', codergen);
  registry.register('tool', new ToolHandler());
  registry.register('conditional', new ConditionalHandler());
  registry.register('parallel', new ParallelHandler());
  registry.register('parallel.fan_in', new FanInHandler());
  registry.register('stack.manager_loop', new ManagerLoopHandler());
  registry.register('stack.observe', codergen);
  registry.register('stack.steer', codergen);
  registry.register(
    'wait.human',
    new WaitForHumanHandler({
      ask: async (_question, choices) => choices[0].key,
    })
  );
  return registry;
}
