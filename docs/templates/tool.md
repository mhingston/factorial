# Tool Generation Request: <tool-name>

## Metadata
- Date: YYYY-MM-DD
- Requester: <agent-or-human-name>
- Related issue/PR: <issue-id>
- Risk level: `low|medium|high`

## Pattern Description

### Problem Statement
Describe the recurring pattern or issue observed during code review.

### Examples
Provide 2-3 concrete examples from actual code reviews:

**Example 1:**
- File: `path/to/file.ts:123`
- Issue: Description of the problem
- Suggested fix: Description of correct pattern

**Example 2:**
- File: `path/to/file2.ts:456`
- Issue: Description of the problem
- Suggested fix: Description of correct pattern

## Expected Behavior

### What the tool should detect
- Specific code patterns, anti-patterns, or violations
- File types and locations to scan
- Severity levels for different violation types

### What the tool should report
- Structured report format (JSON schema)
- Exit codes (0 for pass, 1 for fail)
- Log output destination

### What the tool should NOT do
- No automatic fixes without explicit `--fix` flag
- No modifications to source code by default
- No external API calls during CI execution

## Input/Output Contracts

### Input
- CLI arguments following existing script conventions
- File paths or glob patterns to scan
- Configuration options (optional)

### Output
- Report schema: `tool_<name>_report.v1`
- Report location: `logs/tools/<name>/report.json`
- Console output for human readability

## Test Requirements

### Positive test cases
- Code that should PASS the check
- Expected output and exit code

### Negative test cases
- Code that should FAIL the check
- Expected violations and exit code

### Edge cases
- Empty files
- Binary files
- Very large files
- Malformed input

## Integration Points

### npm scripts
- Proposed script name: `tool:<name>`
- Arguments and flags required

### CI workflow
- When should this tool run?
- Dependencies on other checks
- Timeout requirements

### Human review workflow
- Is human review required before enabling in CI?
- Sample violations for human verification

## Security Invariants

| invariant_id | Invariant | Verification approach |
| --- | --- | --- |
| AGT-001 | Tool produces deterministic output | Run twice, compare hashes |
| AGT-002 | Tool runs after security gates | CI workflow order |
| AGT-003 | Read-only by default | Test without `--fix` flag |
| AGT-004 | Input validation | Test with malicious inputs |
| AGT-005 | No secrets exposure | Code review for env access |

## Human Review Checklist

Before enabling in CI:
- [ ] Tool code reviewed by human
- [ ] Sample violations reviewed and validated
- [ ] False positive rate assessed
- [ ] Performance impact measured
- [ ] Documentation updated (AGENTS.md, README if needed)

## Post-Deployment

Once merged and enabled:
- Tool runs automatically in CI
- Violations are enforced without human review
- Tool IS the review (OpenAI pattern)
