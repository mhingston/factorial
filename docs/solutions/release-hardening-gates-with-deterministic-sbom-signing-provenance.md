---
title: "Release hardening gates with deterministic SBOM, signing, and provenance verification"
category: "security"
tags:
  - "release-hardening"
  - "sbom"
date: "2026-02-12"
trigger: "BK-008 required deterministic release hardening gates and policy enforcement across CI and release workflows."
---

# Problem
Release flow quality checks existed, but there was no deterministic, repository-native gate that enforced SBOM generation, artifact signing validation, and provenance policy verification before publish.

# Solution Pattern
Create a single deterministic release-hardening command that emits versioned report artifacts and make both CI and tag release workflows run the command before publish.

# Key Insight
Supply-chain controls are reliable when policy verification and evidence publication are part of the same executable contract.

# Implementation References
- Files touched:
  - `scripts/release-hardening.js`
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - `docs/metrics/reports/release-hardening-latest.json`
  - `docs/metrics/reports/release-sbom-latest.json`
  - `docs/metrics/reports/release-signature-latest.json`
  - `RELEASE.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/release-hardening.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-008-release-hardening-gates-batch-1-plan.md`
  - `docs/reviews/bk-008-release-hardening-gates-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `release_hardening_report.v1` reports `RH-001`/`RH-002`/`RH-003` pass with explicit SBOM/signature/provenance evidence.
  - Strict signing mode fails closed when the configured signing key env is missing.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run release:hardening -- --strict-signing --signing-key-env RELEASE_SIGNING_KEY`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` (`Core Commands` and `Conventions` updated with release hardening command/policy)

# Reuse Guidance
- When to apply this pattern:
  - Any release track requiring objective supply-chain hardening evidence and fail-closed gating.
- When not to apply:
  - Disposable prototypes without distributable artifacts.
- Known tradeoffs:
  - Adds release-gate runtime cost (build + pack + artifact generation) to CI and tag workflows.
