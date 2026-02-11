# Release Process

## Versioning Strategy

Use Semantic Versioning:

- `MAJOR`: breaking API/CLI behavior changes.
- `MINOR`: backward-compatible new features.
- `PATCH`: backward-compatible bug fixes and internal improvements.

## Pre-release Checklist

1. Update `CHANGELOG.md` under `Unreleased`.
2. Run quality gates locally:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:run`
   - `npm run test:coverage`
3. Bump version:
   - `npm version patch` (or `minor` / `major` as appropriate)
4. Push commit and tag:
   - `git push`
   - `git push --tags`

## Automated Publish

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. Installs dependencies with `npm ci`.
2. Runs lint/typecheck/tests.
3. Builds artifacts.
4. Runs `npm pack --dry-run`.
5. Publishes to npm with provenance.
6. Creates a GitHub Release.

Required secret:

- `NPM_TOKEN` with publish permissions for the target npm package.
