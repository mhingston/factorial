declare module '@ai-sdk/openai' {
  export function openai(model: string): unknown;
}

declare module '@ai-sdk/anthropic' {
  export function anthropic(model: string): unknown;
}

declare module '@ai-sdk/google' {
  export function google(model: string): unknown;
}

declare module 'ai-sdk-provider-github' {
  export function createCopilot(options?: { oauthToken?: string }): (model: string) => unknown;
}
