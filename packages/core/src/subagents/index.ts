/**
 * Subagents Module
 * Lightweight subagent tools for parallel delegation patterns
 */

// Export lightweight agent
export {
  LightweightSubagent,
  type LightweightSubagentConfig,
  type SubagentResult,
  type SubagentMessage,
  type SubagentMessageContent,
  type ToolCall,
  type SubagentToolResult,
} from './lightweight-agent.js';

// Export registry
export {
  SubagentRegistry,
  subagentRegistry,
  type RegisteredSubagent,
} from './registry.js';

// Export tools
export {
  SpawnAgentTool,
  WaitForAgentTool,
  SendInputTool,
  CloseAgentTool,
  spawnAgentTool,
  waitForAgentTool,
  sendInputTool,
  closeAgentTool,
  toModelOutput,
  type Tool,
  type ToolResult,
  type ToolContext,
} from './tools.js';

// Export parallel execution
export {
  executeParallelSubagents,
  waitForAllAgents,
  synthesizeResults,
  ParallelResearchHandler,
  parallelMap,
  type ParallelTask,
  type ParallelResult,
  type ParallelExecutionOptions,
} from './parallel-execution.js';
