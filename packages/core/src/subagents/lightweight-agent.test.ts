import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Context } from '../context/index.js';
import type { LlmAdapter, LlmCompleteResult } from '../types/index.js';
import {
  LightweightSubagent,
  type LightweightSubagentConfig,
} from './lightweight-agent.js';
import {
  ParallelResearchHandler,
  executeParallelSubagents,
  parallelMap,
  synthesizeResults,
  waitForAllAgents,
} from './parallel-execution.js';
import { SubagentRegistry } from './registry.js';
import {
  CloseAgentTool,
  SendInputTool,
  SpawnAgentTool,
  WaitForAgentTool,
  toModelOutput,
} from './tools.js';

describe('LightweightSubagent', () => {
  let mockAdapter: LlmAdapter;

  beforeEach(() => {
    mockAdapter = {
      complete: vi.fn().mockResolvedValue({
        adapter: 'mock',
        backend: 'api',
        operation: 'generateText',
        mode: 'text',
        output: 'Hello!',
        textOutput: 'Hello!',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as LlmCompleteResult),
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'test' };
      }),
    };
  });

  test('executes simple task successfully', async () => {
    const agent = new LightweightSubagent({
      model: 'gpt-4o-mini',
      provider: 'openai',
      instructions: 'You are helpful',
      allowedTools: [],
      maxTurns: 10,
      llmAdapter: mockAdapter,
    });

    const result = await agent.execute('Say hello');

    expect(result.success).toBe(true);
    expect(result.turnsUsed).toBeGreaterThan(0);
    expect(result.output).toBe('Hello!');
  });

  test('enforces max turns limit', async () => {
    const adapterWithToolCalls: LlmAdapter = {
      ...mockAdapter,
      complete: vi.fn().mockResolvedValue({
        adapter: 'mock',
        backend: 'api',
        operation: 'generateText',
        mode: 'text',
        output: '<tool>test_tool</tool><tool_arguments>{}</tool_arguments>',
        textOutput: '<tool>test_tool</tool><tool_arguments>{}</tool_arguments>',
        usage: { input_tokens: 10, output_tokens: 5 },
      } as LlmCompleteResult),
    };

    const agent = new LightweightSubagent({
      model: 'gpt-4o-mini',
      provider: 'openai',
      instructions: 'You are helpful',
      allowedTools: ['test_tool'],
      maxTurns: 2,  // Very low limit
      llmAdapter: adapterWithToolCalls,
    });

    const result = await agent.execute('Complex task');

    expect(result.success).toBe(false);
    expect(result.turnsUsed).toBe(2);
  });

  test('handles abort signal', async () => {
    const agent = new LightweightSubagent({
      model: 'gpt-4o-mini',
      provider: 'openai',
      instructions: 'You are helpful',
      allowedTools: [],
      maxTurns: 10,
      llmAdapter: mockAdapter,
    });

    // Abort the agent externally before execution
    agent.abort();

    const result = await agent.execute('Task');

    expect(result.success).toBe(false);
    expect(result.output).toContain('aborted');
  });

  test('tracks token usage', async () => {
    const agent = new LightweightSubagent({
      model: 'gpt-4o-mini',
      provider: 'openai',
      instructions: 'You are helpful',
      allowedTools: [],
      maxTurns: 10,
      llmAdapter: mockAdapter,
    });

    await agent.execute('Say hello');

    const usage = agent.getTokenUsage();
    expect(usage.input).toBe(10);
    expect(usage.output).toBe(5);
    expect(usage.total).toBe(15);
  });

  test('can be aborted externally', async () => {
    const agent = new LightweightSubagent({
      model: 'gpt-4o-mini',
      provider: 'openai',
      instructions: 'You are helpful',
      allowedTools: [],
      maxTurns: 10,
      llmAdapter: mockAdapter,
    });

    expect(agent.isAborted()).toBe(false);
    agent.abort();
    expect(agent.isAborted()).toBe(true);
  });
});

describe('SubagentRegistry', () => {
  test('registers agents', () => {
    const registry = new SubagentRegistry();
    const mockAgent = {} as LightweightSubagent;

    registry.register('agent1', mockAgent);

    const entry = registry.get('agent1');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('agent1');
    expect(entry?.status).toBe('running');
  });

  test('enforces max depth limit', () => {
    const registry = new SubagentRegistry(1); // maxDepth = 1 means root + 1 level allowed
    const mockAgent = {} as LightweightSubagent;

    // First level - allowed
    registry.register('agent1', mockAgent);

    // Second level - allowed (depth 1 <= maxDepth 1)
    registry.register('agent2', mockAgent, 'agent1');

    // Third level - should fail since maxDepth=1 only allows depth 0 and 1
    expect(() => {
      registry.register('agent3', mockAgent, 'agent2');
    }).toThrow('Max subagent depth (1) exceeded');
  });

  test('completes agents', () => {
    const registry = new SubagentRegistry();
    const mockAgent = {} as LightweightSubagent;

    registry.register('agent1', mockAgent);
    registry.complete('agent1', {
      output: 'Done',
      success: true,
      turnsUsed: 5,
      toolCalls: 2,
      tokenUsage: { input: 100, output: 50, total: 150 },
    });

    const entry = registry.get('agent1');
    expect(entry?.status).toBe('completed');
    expect(entry?.result?.success).toBe(true);
  });

  test('aborts running agents', () => {
    const registry = new SubagentRegistry();
    const mockAgent = {
      abort: vi.fn(),
    } as unknown as LightweightSubagent;

    registry.register('agent1', mockAgent);
    const success = registry.abort('agent1');

    expect(success).toBe(true);
    expect(mockAgent.abort).toHaveBeenCalled();

    const entry = registry.get('agent1');
    expect(entry?.status).toBe('aborted');
  });

  test('lists running agents', () => {
    const registry = new SubagentRegistry();
    const mockAgent = {} as LightweightSubagent;

    registry.register('agent1', mockAgent);
    registry.register('agent2', mockAgent);

    let running = registry.listRunning();
    expect(running).toHaveLength(2);

    registry.complete('agent1', {
      output: 'Done',
      success: true,
      turnsUsed: 1,
      toolCalls: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
    });

    running = registry.listRunning();
    expect(running).toHaveLength(1);
  });

  test('clears all agents', () => {
    const registry = new SubagentRegistry();
    const mockAgent = {
      abort: vi.fn(),
    } as unknown as LightweightSubagent;

    registry.register('agent1', mockAgent);
    registry.register('agent2', mockAgent);

    registry.clear();

    expect(registry.getCount()).toBe(0);
    expect(mockAgent.abort).toHaveBeenCalledTimes(2);
  });
});

describe('Tools', () => {
  describe('SpawnAgentTool', () => {
    test('requires task parameter', async () => {
      const tool = new SpawnAgentTool();
      const result = await tool.execute({}, {
        node: { id: 'test', type: 'test', shape: 'box', label: 'test', max_retries: 0, goal_gate: false, reasoning_effort: 'low', auto_status: false, allow_partial: false, attributes: {} },
        context: new Context(),
        graph: { id: 'test', nodes: new Map(), edges: [], default_max_retry: 0, attributes: {} },
        logsRoot: '/tmp',
      });

      expect(result.is_error).toBe(true);
      expect(result.content).toContain('task parameter is required');
    });

    test('spawns agent successfully', async () => {
      const registry = new SubagentRegistry();
      const tool = new SpawnAgentTool(registry, (config) => {
        return {
          execute: vi.fn().mockResolvedValue({
            output: 'Done',
            success: true,
            turnsUsed: 1,
            toolCalls: 0,
            tokenUsage: { input: 0, output: 0, total: 0 },
          }),
        } as unknown as LightweightSubagent;
      });

      const result = await tool.execute({ task: 'Test task' }, {
        node: { id: 'test', type: 'test', shape: 'box', label: 'test', max_retries: 0, goal_gate: false, reasoning_effort: 'low', auto_status: false, allow_partial: false, attributes: {} },
        context: new Context(),
        graph: { id: 'test', nodes: new Map(), edges: [], default_max_retry: 0, attributes: {} },
        logsRoot: '/tmp',
      });

      expect(result.is_error).toBe(false);
      expect(result.content).toHaveProperty('agent_id');
      expect(result.content).toHaveProperty('status', 'running');
    });
  });

  describe('WaitForAgentTool', () => {
    test('requires agent_id parameter', async () => {
      const tool = new WaitForAgentTool();
      const result = await tool.execute({});

      expect(result.is_error).toBe(true);
      expect(result.content).toContain('agent_id parameter is required');
    });

    test('returns error for missing agent', async () => {
      const registry = new SubagentRegistry();
      const tool = new WaitForAgentTool(registry);
      const result = await tool.execute({ agent_id: 'nonexistent' });

      expect(result.is_error).toBe(true);
      expect(result.content).toContain('not found');
    });

    test('waits for completion', async () => {
      const registry = new SubagentRegistry();
      const mockAgent = {} as LightweightSubagent;

      registry.register('agent1', mockAgent);
      registry.complete('agent1', {
        output: 'Task completed',
        success: true,
        turnsUsed: 5,
        toolCalls: 2,
        tokenUsage: { input: 100, output: 50, total: 150 },
      });

      const tool = new WaitForAgentTool(registry);
      const result = await tool.execute({ agent_id: 'agent1' });

      expect(result.is_error).toBe(false);
      expect(result.content).toHaveProperty('success', true);
      expect(result.content).toHaveProperty('summary');
    });
  });

  describe('SendInputTool', () => {
    test('requires both parameters', async () => {
      const tool = new SendInputTool();
      let result = await tool.execute({ agent_id: 'test' });
      expect(result.is_error).toBe(true);

      result = await tool.execute({ message: 'test' });
      expect(result.is_error).toBe(true);
    });

    test('returns error for missing agent', async () => {
      const tool = new SendInputTool();
      const result = await tool.execute({ agent_id: 'nonexistent', message: 'test' });

      expect(result.is_error).toBe(true);
      expect(result.content).toContain('not found');
    });
  });

  describe('CloseAgentTool', () => {
    test('requires agent_id parameter', async () => {
      const tool = new CloseAgentTool();
      const result = await tool.execute({});

      expect(result.is_error).toBe(true);
      expect(result.content).toContain('agent_id parameter is required');
    });

    test('closes running agent', async () => {
      const registry = new SubagentRegistry();
      const mockAgent = {
        abort: vi.fn(),
      } as unknown as LightweightSubagent;

      registry.register('agent1', mockAgent);

      const tool = new CloseAgentTool(registry);
      const result = await tool.execute({ agent_id: 'agent1' });

      expect(result.is_error).toBe(false);
      expect(result.content).toHaveProperty('closed', true);
    });
  });

  describe('toModelOutput', () => {
    test('summarizes successful result', () => {
      const result = {
        output: 'This is a very long output that should be truncated',
        success: true,
        turnsUsed: 5,
        toolCalls: 2,
        tokenUsage: { input: 100, output: 50, total: 150 },
      };

      const summary = toModelOutput(result, 20);
      expect(summary).toContain('completed successfully');
      expect(summary).toContain('...');
      expect(summary.length).toBeLessThan(100);
    });

    test('summarizes failed result', () => {
      const result = {
        output: 'Error occurred during execution',
        success: false,
        turnsUsed: 3,
        toolCalls: 1,
        tokenUsage: { input: 50, output: 25, total: 75 },
      };

      const summary = toModelOutput(result);
      expect(summary).toContain('failed');
    });
  });
});

describe('Parallel Execution', () => {
  test('executeParallelSubagents runs tasks in parallel', async () => {
    const createAgent = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        output: 'Done',
        success: true,
        turnsUsed: 1,
        toolCalls: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
      }),
    });

    const tasks = [
      { id: 'task1', task: 'Task 1' },
      { id: 'task2', task: 'Task 2' },
    ];

    const results = await executeParallelSubagents(tasks, createAgent);

    expect(results).toHaveLength(2);
    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(results[0].result.success).toBe(true);
    expect(results[1].result.success).toBe(true);
  });

  test('handles empty task list', async () => {
    const createAgent = vi.fn();
    const results = await executeParallelSubagents([], createAgent);

    expect(results).toHaveLength(0);
    expect(createAgent).not.toHaveBeenCalled();
  });

  test('waitForAllAgents waits for completion', async () => {
    const registry = new SubagentRegistry();
    const mockAgent = {} as LightweightSubagent;

    registry.register('agent1', mockAgent);
    registry.register('agent2', mockAgent);

    // Complete agent1 immediately
    registry.complete('agent1', {
      output: 'Done 1',
      success: true,
      turnsUsed: 1,
      toolCalls: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
    });

    // Complete agent2 after a delay
    setTimeout(() => {
      registry.complete('agent2', {
        output: 'Done 2',
        success: true,
        turnsUsed: 1,
        toolCalls: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
      });
    }, 200);

    const results = await waitForAllAgents(['agent1', 'agent2'], registry);

    expect(results).toHaveLength(2);
    expect(results[0].result.success).toBe(true);
    expect(results[1].result.success).toBe(true);
  });

  test('synthesizeResults creates summary', () => {
    const results = [
      {
        id: 'task1',
        result: {
          output: 'Success output',
          success: true,
          turnsUsed: 3,
          toolCalls: 1,
          tokenUsage: { input: 50, output: 25, total: 75 },
        },
      },
      {
        id: 'task2',
        result: {
          output: 'Failed output',
          success: false,
          turnsUsed: 2,
          toolCalls: 0,
          tokenUsage: { input: 30, output: 15, total: 45 },
        },
      },
    ];

    const summary = synthesizeResults(results);

    expect(summary).toContain('task1: Success');
    expect(summary).toContain('task2: Failed');
    expect(summary).toContain('Success output');
    expect(summary).toContain('Failed output');
  });

  test('parallelMap executes map operation', async () => {
    const createAgent = vi.fn().mockReturnValue({
      execute: vi.fn().mockImplementation((task) => Promise.resolve({
        output: `Processed: ${task}`,
        success: true,
        turnsUsed: 1,
        toolCalls: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
      })),
    });

    const items = ['item1', 'item2', 'item3'];
    const mapFn = (item: string, index: number) => ({
      id: `task-${index}`,
      task: item,
    });

    const results = await parallelMap(items, mapFn, createAgent);

    expect(results).toHaveLength(3);
    expect(results[0].item).toBe('item1');
    expect(results[0].result.success).toBe(true);
    expect(results[1].item).toBe('item2');
    expect(results[2].item).toBe('item3');
  });

  test('ParallelResearchHandler executes research', async () => {
    const createAgent = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        output: 'Research findings',
        success: true,
        turnsUsed: 5,
        toolCalls: 3,
        tokenUsage: { input: 100, output: 50, total: 150 },
      }),
    });

    const handler = new ParallelResearchHandler(createAgent);
    const result = await handler.execute(['topic1', 'topic2']);

    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain('topic1');
    expect(result.summary).toContain('topic2');
    expect(createAgent).toHaveBeenCalledTimes(2);
  });
});
