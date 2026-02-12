// Define JSONSchema locally since it's not exported from types/index.js
export type JSONSchema = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
};

export interface ExecutionEnvironment {
  workDir: string;
  logsRoot: string;
  nodeId: string;
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (args: unknown, env: ExecutionEnvironment) => Promise<string>;
}

export interface ProviderProfile {
  id: 'openai' | 'anthropic' | 'gemini';
  displayName: string;
  tools: ToolDefinition[];
  systemPromptTemplate: string;
  defaultModel: string;
  supportsCaching: boolean;
  supportsReasoning: boolean;
  supportsMultimodal: boolean;
  providerOptions?: Record<string, unknown>;
}

export type ProviderId = ProviderProfile['id'];

export function isValidProviderId(value: string): value is ProviderId {
  return value === 'openai' || value === 'anthropic' || value === 'gemini';
}
