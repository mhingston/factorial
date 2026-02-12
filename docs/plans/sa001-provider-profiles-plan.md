# Plan: SA-001 Provider-Native Tool Profiles

## Metadata
- Date: 2026-02-12
- Author: Implementation Agent
- Related issue/PR: SA-001
- Risk level: medium

## Requirement / Behavior Delta
- Current behavior: CodergenHandler uses a unified toolset across all providers with generic editing
- Target behavior: Provider-native tool profiles (OpenAI/apply_patch, Anthropic/edit_file, Gemini/native)
- Why this change is needed: Provider-native tools produce better results as models are trained on specific formats

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Handler | `packages/core/src/handlers/builtin.ts` | No profile system, unified tools | CodergenHandler.execute is the integration point |
| LLM | `packages/core/src/llm/index.ts` | Provider resolution exists | Already supports OpenAI/Anthropic/Google |
| Types | `packages/core/src/types/index.ts` | No profile types yet | Need to add ProviderProfile types |

## External Constraints
- API/provider constraints: Must maintain backward compatibility with existing node attributes
- Runtime/environment constraints: None
- Backward compatibility constraints: Fallback to openai profile if no provider specified

## Design Outline
- Proposed approach: Create profiles/ module with types, individual profiles, and registry. Update CodergenHandler to resolve profiles.
- Rejected alternatives: Global tool registry (doesn't allow provider-specific optimization)
- Affected interfaces and contracts: CodergenHandler constructor/execute method

## Edge Cases
- Edge case 1: Unknown provider - throw clear error with available providers list
- Edge case 2: Mixed provider workflow - each node can specify different provider via llm_provider attribute
- Edge case 3: Tool name collision - profiles isolate tool names per provider
- Edge case 4: System prompt length - keep under token limits with focused prompts

## High-Risk Invariants

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| HRI-001 | Profiles must not change LLM call behavior except for tool definitions | Profile only affects tools/prompt, not core logic | Unit test showing same request structure |
| HRI-002 | Fallback behavior must be deterministic | Default to openai profile if no provider | Test with missing provider attribute |
| HRI-003 | Tool execution must be sandboxed | Each tool execution receives isolated env | Mock execution environment in tests |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs: SA-001-001 through SA-001-015
- Implementer scope statement: Complete all profile infrastructure and integration
- Verifier scope statement: Verify all profiles work correctly with parity tests
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
