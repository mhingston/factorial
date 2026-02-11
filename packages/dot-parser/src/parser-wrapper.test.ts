import { describe, expect, it } from 'vitest';
import { DOTParserError, parseDOT } from './parser-wrapper.js';

describe('parseDOT', () => {
  it('applies node and edge defaults with duration conversion', () => {
    const dot = `
      digraph G {
        node [shape=diamond, timeout=2s]
        edge [weight=2]
        start [shape=Mdiamond]
        a;
        start -> a;
      }
    `;

    const graph = parseDOT(dot);
    const nodeA = graph.nodes.get('a');
    const startNode = graph.nodes.get('start');

    expect(nodeA?.shape).toBe('diamond');
    expect(nodeA?.label).toBe('a');
    expect(nodeA?.timeout).toBe(2000);
    expect(startNode?.shape).toBe('Mdiamond');
    expect(graph.edges[0].weight).toBe(2);
  });

  it('adds subgraph label class to nodes', () => {
    const dot = `
      digraph G {
        subgraph cluster_loop {
          label="Loop A";
          step1;
        }
      }
    `;

    const graph = parseDOT(dot);
    const step1 = graph.nodes.get('step1');

    expect(step1?.class).toContain('loop-a');
  });

  it('supports reference start/exit conventions via node_type and circle shapes', () => {
    const dot = `
      digraph Workflow {
        Start [shape=circle, node_type="start"];
        Exit [shape=doublecircle, node_type="exit"];
        Start -> Exit;
      }
    `;

    const graph = parseDOT(dot);
    const start = graph.nodes.get('Start');
    const exit = graph.nodes.get('Exit');

    expect(start?.type).toBe('start');
    expect(exit?.type).toBe('exit');
    expect(start?.shape).toBe('circle');
    expect(exit?.shape).toBe('doublecircle');
  });

  it('normalizes scalar attributes and graph defaults', () => {
    const dot = `
      digraph G {
        graph [default_fidelity=full, default_max_retry="7", retry_target="retryA", fallback_retry_target="retryB"]
        a [shape=hexagon, goal_gate=true, auto_status=false, allow_partial=true, max_retries="2", timeout="1500", thread_id="thread-1", reasoning_effort=medium]
        b [shape=box]
        a -> b [weight="3", loop_restart=true]
      }
    `;

    const graph = parseDOT(dot);
    const a = graph.nodes.get('a');
    const b = graph.nodes.get('b');
    const edge = graph.edges[0];

    expect(graph.default_fidelity).toBe('full');
    expect(graph.default_max_retry).toBe(7);
    expect(graph.retry_target).toBe('retryA');
    expect(graph.fallback_retry_target).toBe('retryB');
    expect(a?.type).toBe('wait.human');
    expect(a?.goal_gate).toBe(true);
    expect(a?.auto_status).toBe(false);
    expect(a?.allow_partial).toBe(true);
    expect(a?.max_retries).toBe(2);
    expect(a?.timeout).toBe(1500);
    expect(a?.thread_id).toBe('thread-1');
    expect(a?.reasoning_effort).toBe('medium');
    expect(b?.fidelity).toBe('full');
    expect(edge.weight).toBe(3);
    expect(edge.loop_restart).toBe(true);
    expect(edge.fidelity).toBe('full');
  });

  it('throws DOTParserError with syntax location details', () => {
    const invalidDot = 'digraph G { a -> ; }';

    try {
      parseDOT(invalidDot);
      expect.unreachable('expected parseDOT to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DOTParserError);
      const parseError = error as DOTParserError;
      expect(parseError.errors.length).toBeGreaterThan(0);
      expect(parseError.errors[0].message.length).toBeGreaterThan(0);
      expect(parseError.errors[0].line).toBeGreaterThan(0);
      expect(parseError.errors[0].column).toBeGreaterThan(0);
    }
  });

  it('rejects undirected graph mode and accepts strict digraph mode', () => {
    const graphMode = 'graph G { a -- b; }';
    const strictDigraph = 'strict digraph G { start [shape=Mdiamond]; exit [shape=Msquare]; start -> exit; }';

    expect(() => parseDOT(graphMode)).toThrow(DOTParserError);
    const parsed = parseDOT(strictDigraph);
    expect(parsed.type).toBe('digraph');
  });
});
