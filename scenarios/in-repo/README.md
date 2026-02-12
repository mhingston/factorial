# In-Repo Scenarios

Version-controlled scenarios that run on every PR.

## Catalog

### Smoke Tests

| ID | Description | Difficulty | Category | Last Updated |
|----|-------------|------------|----------|--------------|
| | | | | |

### Regression Tests

| ID | Description | Difficulty | Category | Last Updated |
|----|-------------|------------|----------|--------------|
| | | | | |

## Directory Structure

```
in-repo/
├── smoke/          # Quick smoke tests for PR validation
├── regression/     # Regression test scenarios
└── README.md       # This catalog
```

## Usage

```bash
# Run all in-repo scenarios
factorial dtu-run --fixtures ./scenarios/in-repo

# Run only smoke tests
factorial dtu-run --fixtures ./scenarios/in-repo --suite smoke

# Curate scenarios
factorial scenarios:curate
```

## Adding Scenarios

1. Use `factorial scenarios:curate` to interactively create scenarios
2. Or manually add JSON fixtures to appropriate subdirectory
3. Update this README with scenario metadata
4. Run `factorial scenarios:check-freshness` to validate
