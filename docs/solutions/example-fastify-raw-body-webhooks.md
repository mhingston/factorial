---
title: "Preserve Raw Body for Signed Webhooks"
category: "correctness"
tags:
  - "fastify"
  - "webhooks"
  - "signature-verification"
date: "2026-02-11"
trigger: "Repeated signature verification failures after JSON body parsing."
---

# Problem
Webhook signature validation failed intermittently because the request body used for HMAC verification did not
match the exact raw payload sent by the provider.

# Solution Pattern
Capture and preserve the raw request body before JSON parsing, then perform signature verification against the
raw bytes. Parse JSON only after signature validation succeeds.

# Key Insight
Signature checks are byte-level contracts. Any parser/normalizer step before verification can invalidate
otherwise correct signatures.

# Implementation References
- Files touched:
  - `src/server/webhooks.ts` (example path)
  - `src/server/plugins/raw-body.ts` (example path)
- Tests:
  - `tests/webhooks/signature-validation.test.ts` (example path)
- Related artifacts:
  - Plan: `docs/templates/plan.md` output for webhook hardening
  - Review: `docs/templates/review.md` output with issue class `signature-mismatch`

# Validation Evidence
- Added tests for:
  - valid signature with unmodified payload,
  - invalid signature when one byte changes,
  - payloads with whitespace/newline differences.
- Verified no regressions in existing webhook routes.

# AGENTS/CLAUDE Update Note
- [ ] Add "verify signatures against raw body before parse" under common mistakes or conventions.
- Suggested location: root `AGENTS.md`

# Reuse Guidance
- Apply for any signed callback/webhook integrations.
- Do not apply when upstream protocol signs canonicalized JSON, not raw payload bytes.
- Tradeoff: slight memory overhead to retain raw payload.
