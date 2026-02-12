# Subagent Delegation: SA-001 - Provider-Native Tool Alignment

## Task Summary
Implement provider-specific tool profiles matching the coding-agent-loop specification. Create native toolsets for OpenAI (codex-rs style), Anthropic (Claude Code style), and Gemini (gemini-cli style).

## Scope

### In Scope
- Create provider profile system in `packages/core/src/profiles/`
- Implement OpenAI profile with apply_patch v4a format
- Implement Anthropic profile with old_string/new_string editing
- Implement Gemini profile with native conventions
- Update CodergenHandler to use profiles based on node attributes
- Provider parity tests showing equivalent outcomes

### Out of Scope
- Changes to LlmAdapter interface (handled by SA-002)
- Multi-modal support (handled by SA-005)
- Subagent tooling (handled by SA-004)

## Background Context

Currently Factorial uses a **unified toolset** across all providers:
- `read_file` - Universal file reading
- `edit_file` - Universal search/replace editing
- `shell` - Universal command execution
- `grep` - Universal search
- `glob` - Universal file discovery

According to the coding-agent-loop spec Section 3:
- **OpenAI** models are trained on codex-rs which uses `apply_patch` (v4a format)
- **Anthropic** models are trained on Claude Code which uses `old_string`/`new_string`
- **Gemini** models have their own conventions

Using provider-native tools produces better results than forcing universal formats.

## Deliverables

### 1. Core Profile Infrastructure

Create `packages/core/src/profiles/types.ts`:
```typescript
export interface ProviderProfile {
  id: 'openai' | 'anthropic' | 'gemini';
  displayName: string;
  tools: ToolDefinition[];
  systemPromptTemplate: string;
  supportsCaching: boolean;
  supportsReasoning: boolean;
  supportsMultimodal: boolean;
  providerOptions?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (args: unknown, env: ExecutionEnvironment) => Promise<string>;
}
```

### 2. OpenAI Profile

Create `packages/core/src/profiles/openai.ts`:

Key differences from unified toolset:
- Use `apply_patch` instead of `edit_file` for modifications
- Keep `write_file` for new file creation
- Use codex-rs style system prompt

```typescript
const applyPatchTool: ToolDefinition = {
  name: 'apply_patch',
  description: `Apply a patch to modify files. Uses v4a format.
Supports creating, updating, and deleting files in a single operation.

Example patch format:
***
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,5 @@
 function hello() {
-  console.log("old");
+  console.log("new");
 }
***

Always verify patches are correct before applying.`,
  parameters: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'Patch content in v4a format'
      }
    },
    required: ['patch']
  },
  execute: async (args: { patch: string }, env: ExecutionEnvironment) => {
    // Parse and apply v4a patch format
    // Return list of affected files
  }
};

export const openaiProfile: ProviderProfile = {
  id: 'openai',
  displayName: 'OpenAI (Codex)',
  tools: [
    readFileTool,
    applyPatchTool,  // Native editing
    writeFileTool,
    shellTool,
    grepTool,
    globTool
  ],
  systemPromptTemplate: openaiCodexSystemPrompt,
  supportsCaching: true,
  supportsReasoning: true,
  supportsMultimodal: true
};
```

### 3. Anthropic Profile

Create `packages/core/src/profiles/anthropic.ts`:

Key differences:
- Use `edit_file` with old_string/new_string (exact match)
- Different system prompt emphasizing reading before editing

```typescript
const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: `Replace an exact string occurrence in a file.

The old_string MUST match exactly (including whitespace) and must be unique in the file.
If old_string appears multiple times, the operation will fail.

Always read the file first to get the exact content.`,
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
      replace_all: { type: 'boolean', default: false }
    },
    required: ['file_path', 'old_string', 'new_string']
  },
  execute: async (args, env) => {
    // Exact string match replacement
    // Error if old_string not found or not unique (unless replace_all)
  }
};

export const anthropicProfile: ProviderProfile = {
  id: 'anthropic',
  displayName: 'Anthropic (Claude Code)',
  tools: [
    readFileTool,
    editFileTool,  // Native editing
    writeFileTool,
    shellTool,
    grepTool,
    globTool
  ],
  systemPromptTemplate: claudeCodeSystemPrompt,
  supportsCaching: true,  // Will be utilized by SA-003
  supportsReasoning: true,
  supportsMultimodal: true
};
```

### 4. Profile Registry

Create `packages/core/src/profiles/index.ts`:

```typescript
import { openaiProfile } from './openai.js';
import { anthropicProfile } from './anthropic.js';
import { geminiProfile } from './gemini.js';

const profiles: Record<string, ProviderProfile> = {
  openai: openaiProfile,
  anthropic: anthropicProfile,
  gemini: geminiProfile
};

export function getProfile(provider: string): ProviderProfile {
  const profile = profiles[provider.toLowerCase()];
  if (!profile) {
    throw new Error(`Unknown provider profile: ${provider}. Available: ${Object.keys(profiles).join(', ')}`);
  }
  return profile;
}

export function listProfiles(): ProviderProfile[] {
  return Object.values(profiles);
}

export function resolveProfile(node: Node, defaultProvider?: string): ProviderProfile {
  const provider = node.attributes.llm_provider as string | undefined;
  if (provider) {
    return getProfile(provider);
  }
  if (defaultProvider) {
    return getProfile(defaultProvider);
  }
  // Fallback to openai as default
  return openaiProfile;
}
```

### 5. CodergenHandler Integration

Update `packages/core/src/handlers/builtin.ts` to use profiles:

```typescript
// In CodergenHandler constructor or execute method
const profile = resolveProfile(node, this.config.defaultProvider);
const tools = profile.tools.map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters
}));

// Pass tools to LLM call
const result = await this.llmAdapter.complete({
  model: node.attributes.llm_model as string || profile.defaultModel,
  messages: buildMessages(node.prompt, profile.systemPromptTemplate),
  tools,
  // ... other options
});
```

### 6. Tests

Create `packages/core/src/profiles/profiles.test.ts`:

```typescript
describe('Provider Profiles', () => {
  test('OpenAI profile includes apply_patch tool', () => {
    const profile = getProfile('openai');
    expect(profile.tools.some(t => t.name === 'apply_patch')).toBe(true);
    expect(profile.tools.some(t => t.name === 'edit_file')).toBe(false);
  });

  test('Anthropic profile includes edit_file tool', () => {
    const profile = getProfile('anthropic');
    expect(profile.tools.some(t => t.name === 'edit_file')).toBe(true);
    expect(profile.tools.some(t => t.name === 'apply_patch')).toBe(false);
  });

  test('resolveProfile uses node attribute', () => {
    const node = createNode({ llm_provider: 'anthropic' });
    const profile = resolveProfile(node, 'openai');
    expect(profile.id).toBe('anthropic');
  });

  test('equivalent outcomes for simple edit task', async () => {
    // Test that both profiles can perform the same edit
    // with equivalent results
  });
});
```

### 7. System Prompts

Create `packages/core/src/profiles/system-prompts/`:
- `openai-codex.ts` - OpenAI codex-rs style prompt
- `anthropic-claude.ts` - Claude Code style prompt
- `gemini-cli.ts` - Gemini CLI style prompt

Each should include:
- Identity statement
- Tool usage guidelines specific to that provider
- Coding best practices
- Error handling guidance

## Evidence Requirements

### Required Artifacts

1. **Provider Profile Parity Report**
   - Location: `docs/metrics/reports/provider-profile-parity-latest.json`
   - Schema: Show equivalent task completion across providers
   - Example:
     ```json
     {
       "report_version": "1.0",
       "timestamp": "2026-02-12T00:00:00Z",
       "tests": [
         {
           "task": "Simple file edit",
           "openai": { "passed": true, "tool_used": "apply_patch" },
           "anthropic": { "passed": true, "tool_used": "edit_file" },
           "outcomes_equivalent": true
         }
       ]
     }
     ```

2. **Golden Test Fixtures**
   - `tests/golden/provider-profile-selection/` - Tests profile resolution
   - `tests/golden/apply-patch-format/` - Tests OpenAI apply_patch
   - `tests/golden/edit-file-exact/` - Tests Anthropic exact match

## Edge Cases to Handle

1. **Unknown Provider**: Throw clear error with available providers list
2. **Mixed Provider Workflow**: Each node can specify different provider
3. **Tool Name Collision**: Provider profiles isolate tool names
4. **System Prompt Length**: Keep under token limits

## Validation Steps

```bash
# Run profile-specific tests
npm run test:run packages/core/src/profiles/

# Run golden tests
npm run test:golden

# Verify parity evidence generated
node scripts/generate-provider-parity-evidence.js

# Check all providers listed in report
cat docs/metrics/reports/provider-profile-parity-latest.json
```

## Dependencies

- None (can work in parallel with other subagents)
- SA-002 will extend types to include reasoning, but doesn't block profile creation

## Success Criteria

1. [ ] Three provider profiles implemented (OpenAI, Anthropic, Gemini)
2. [ ] CodergenHandler uses profiles based on node attributes
3. [ ] Parity tests show equivalent outcomes across providers
4. [ ] Golden tests pass
5. [ ] Evidence artifact published
6. [ ] Documentation updated

## Handoff Checklist

When complete, hand off to integration subagent:
- [ ] All files committed
- [ ] Tests passing
- [ ] Evidence artifact generated
- [ ] Profile resolution working end-to-end
- [ ] Example DOT workflows showing provider selection
