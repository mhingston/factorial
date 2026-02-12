# Backlog BK-008 Release Hardening Gates Completion

Last updated: 2026-02-12

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-008` (Release hardening gates: SBOM/signing/provenance)

## Implemented Capabilities
1. Deterministic release hardening gate command and report contracts
- Added `scripts/release-hardening.js` and npm command:
  - `npm run release:hardening`
- Publishes deterministic artifacts:
  - `docs/metrics/reports/release-hardening-latest.json` (`release_hardening_report.v1`)
  - `docs/metrics/reports/release-sbom-latest.json` (`release_sbom.v1`)
  - `docs/metrics/reports/release-signature-latest.json` (`release_signature.v1`)
- Enforces explicit checks:
  - `RH-001`: SBOM generation
  - `RH-002`: artifact signing (strict signing key mode supported)
  - `RH-003`: provenance policy verification

2. CI and release workflow enforcement
- Added CI job `release-hardening` in `.github/workflows/ci.yml`.
- Updated `.github/workflows/release.yml` to run strict release hardening gates before `npm publish --provenance`.
- Release workflow now requires explicit signing-key secret wiring for strict signing:
  - `RELEASE_SIGNING_KEY`

3. Release-policy/documentation convergence
- Updated `RELEASE.md` prerelease checklist and secret requirements.
- Updated `README.md` and `AGENTS.md` command/convention references for release hardening checks.
- Updated roadmap execution status and artifact references to close `BK-008`.

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS
- `npm run self-host:maturity -- --require-level deterministic-local` -> PASS
- `npm run release:hardening -- --strict-signing --signing-key-env RELEASE_SIGNING_KEY` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-008-release-hardening-gates-batch-1-plan.md`](../plans/bk-008-release-hardening-gates-batch-1-plan.md)
- Review: [`docs/reviews/bk-008-release-hardening-gates-batch-1-review.md`](../reviews/bk-008-release-hardening-gates-batch-1-review.md)
- Solution: [`docs/solutions/release-hardening-gates-with-deterministic-sbom-signing-provenance.md`](../solutions/release-hardening-gates-with-deterministic-sbom-signing-provenance.md)

## Exit Criteria
- Release pipeline fails when SBOM/signing/provenance policy checks are missing or invalid.
- Deterministic evidence artifacts and report schemas are published and reproducible.
- Release hardening outputs are linked in roadmap/process artifacts.
