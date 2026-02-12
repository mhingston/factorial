# Holdout Scenarios

External scenarios that run on convergence only.

**Last Full Run:** _Not yet run_

## Catalog

### Curated Holdouts

| ID | Description | Difficulty | Category | Source | Last Updated |
|----|-------------|------------|----------|--------|--------------|
| | | | | | |

## Directory Structure

```
holdout/
├── curated/        # Manually curated holdout scenarios
└── README.md       # This catalog
```

## Usage

```bash
# Run holdout scenarios (typically in CI on convergence)
factorial dtu-run --fixtures ./scenarios/holdout --suite holdout

# Check freshness (fails if >30 days old)
factorial scenarios:check-freshness

# Promote holdout to in-repo
factorial scenarios:curate --promote <scenario-id>
```

## Holdout Policy

- Holdout scenarios are refreshed every 30 days maximum
- Stale holdouts (>30 days) fail the freshness check CI gate
- Promoting a holdout to in-repo requires:
  1. Successful execution on convergence
  2. Review and approval
  3. Copy to `in-repo/` directory
  4. Update both README catalogs

## Freshness Requirements

| Metric | Threshold | Status |
|--------|-----------|--------|
| Max Age | 30 days | ⏳ Pending |
| Coverage | Match in-repo | ⏳ Pending |
| Duplicates | None | ✅ Pass |
