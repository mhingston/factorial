---
title: "Self-hosted dogfood loop with lock enforcement"
category: "process"
tags:
  - "dogfooding"
  - "self-host"
date: "2026-02-11"
trigger: "RMD-035 required deterministic repository-native Plan -> Work -> Review -> Compound evidence with lock decision enforcement."
---

# Problem
The roadmap required proof that this repository can run its own software-factory loop with deterministic lock enforcement. There was no command producing reproducible pass/fail evidence for `resolved` versus `reopen` lock outcomes.

# Solution Pattern
Generate bounded DOT workflows at runtime, execute them with the local CLI (`factorial run` via `dist`), and persist a deterministic report that includes both:
- `resolved` scenario (expected pass)
- `reopen` scenario (expected fail)

Use `stack.manager_loop` lock semantics as the enforcement point and assert outcomes in an automated test.

# Key Insight
Dogfooding evidence is most reliable when it validates orchestration semantics (lock enforcement) instead of provider behavior; use `llm_backend=cli` with trivial deterministic commands.

# Implementation References
- Files touched:
  - `scripts/self-host-dogfood.js`
  - `packages/cli/src/self-host-dogfood.test.ts`
  - `package.json`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/self-host-dogfood.test.ts`
- Related plan/review artifacts:
  - `docs/plans/rmd-035-self-host-dogfooding-batch-1-plan.md`
  - `docs/reviews/rmd-035-self-host-dogfooding-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run dogfood:self-host`
  - `npm run test:run`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - No change required; existing `AGENTS.md` loop guidance already mandates plan/review/compound artifacts and lock decision handling.

# Reuse Guidance
- When to apply this pattern:
  - When a roadmap item needs bounded self-host evidence without introducing external-provider nondeterminism.
- When not to apply:
  - When validating provider/model quality; use provider-parity or DTU paths instead.
- Known tradeoffs:
  - This pattern proves orchestration integrity, not output quality of real model calls.
