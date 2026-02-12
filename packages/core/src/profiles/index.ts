import type { Node } from '../types/index.js';
import { anthropicProfile } from './anthropic.js';
import { geminiProfile } from './gemini.js';
import { openaiProfile } from './openai.js';
import type { ProviderId, ProviderProfile } from './types.js';

export type { ProviderProfile, ProviderId, ToolDefinition, ExecutionEnvironment } from './types.js';

const profiles: Record<ProviderId, ProviderProfile> = {
  openai: openaiProfile,
  anthropic: anthropicProfile,
  gemini: geminiProfile
};

export function getProfile(provider: string): ProviderProfile {
  const normalizedProvider = provider.toLowerCase() as ProviderId;
  const profile = profiles[normalizedProvider];
  if (!profile) {
    throw new Error(
      `Unknown provider profile: ${provider}. Available: ${Object.keys(profiles).join(', ')}`
    );
  }
  return profile;
}

export function listProfiles(): ProviderProfile[] {
  return Object.values(profiles);
}

export function listProviderIds(): ProviderId[] {
  return Object.keys(profiles) as ProviderId[];
}

export function isValidProvider(provider: string): provider is ProviderId {
  return provider.toLowerCase() in profiles;
}

export function resolveProfile(node: Node, defaultProvider?: string): ProviderProfile {
  // Check node attributes for explicit provider
  const nodeProvider = node.attributes?.llm_provider as string | undefined;
  if (nodeProvider && isValidProvider(nodeProvider)) {
    return getProfile(nodeProvider);
  }
  
  // Use default provider if specified
  if (defaultProvider && isValidProvider(defaultProvider)) {
    return getProfile(defaultProvider);
  }
  
  // Check node.llm_provider directly (older attribute format)
  if (node.llm_provider && isValidProvider(node.llm_provider)) {
    return getProfile(node.llm_provider);
  }
  
  // Fallback to openai as default
  return openaiProfile;
}

export function getProfileForProvider(
  provider: string, 
  model?: string
): ProviderProfile & { resolvedModel: string } {
  const profile = getProfile(provider);
  return {
    ...profile,
    resolvedModel: model || profile.defaultModel
  };
}
