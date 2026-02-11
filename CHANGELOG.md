# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added
- Deterministic codergen CLI backend tests for default OpenAI/Anthropic/Google CLI mappings.
- Reference parity fixture harness for shared DOT workflows.
- CLI e2e smoke tests for `validate`, `run`, and `resume`.
- GitHub Actions CI matrix (Node 20/22) with lint, typecheck, test, and coverage gate.
- Tag-driven release workflow for npm publish and GitHub release creation.
- Keystone-style provider configuration support via `default_provider` and `providers.<name>.*`.
- CLI environment loading from `.env`, `.env.local`, and `--env-file` overrides.
- Native API backend support for `llm_provider=github` via `ai-sdk-provider-github`.

### Changed
- Codergen structured CLI output now enforces JSON schema validation.
- DOT parser now supports `node_type` and `circle` / `doublecircle` start/exit shapes.
- Stylesheet selector engine now supports wildcard selector `*`.
- Package export/bin paths aligned with compiled `dist/packages/**` output.
- Upgraded AI SDK dependency to `ai@6` for compatibility with `ai-sdk-provider-github`.

## [0.1.0] - 2026-02-11

### Added
- Initial implementation of Factorial core parser, execution engine, handlers, and CLI.
