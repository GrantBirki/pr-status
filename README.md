# pr-status ✅

[![test](https://github.com/GrantBirki/pr-status/actions/workflows/test.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/test.yml)
[![package-check](https://github.com/GrantBirki/pr-status/actions/workflows/package-check.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/package-check.yml)
[![lint](https://github.com/GrantBirki/pr-status/actions/workflows/lint.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/lint.yml)
[![CodeQL](https://github.com/GrantBirki/pr-status/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/codeql-analysis.yml)
[![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that checks the status of a pull request.

## About 💡

Depending on the inputs provided, this Action will check the "status" of a pull request to determine if it has been fully approved, if it has passing CI, if it is mergeable, etc. It will then set outputs based on the status of the pull request and can apply or remove labels on the pull request based on the evaluation of the pull request.

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| `github_token` | `true` | `${{ github.token }}` | The GitHub token used to create an authenticated client - Provided for you by default! |
| `pr_number` | `true` | `${{ github.event.number }}` | The pull request number to check the status of |
| `workflow` | `false` | `${{ github.workflow }}` | The name of the workflow that is running this action. This is used to set the name of the check run created by this action so that it can be excluded from checking itself - Provided for you by default! This value is self hydrating. |
| `checks` | `true` | `all` | Whether to only look for `required` ci checks or `all` ci checks on the pull request |
| `evaluations` | `false` | `approved` | The attributes (comma separated list) to evaluate the pull request against when determining its status on a PASS/FAIL system. The default is just `approved` so a PR only needs proper approvals for this check to pass. This plays into the `evaluation` output. Full example: `approved,ci_passing,mergeable,min_approvals=2` - This full example would state that a PR must be considered approved, have passing CI, have at least two approvals, and be in a cleanly mergeable state to have the `evaluation` output be set to `PASS`. |
| `pass_labels` | `false` | - | An optional list of labels to apply to the pull request if the evaluation passes - Examples: `"ready-for-deployment,approved"` |
| `pass_labels_cleanup` | `false` | - | An optional list of labels too "clean up" (remove) if the pull request passes evaluation - Examples: `"ready-for-review,waiting"` |
| `fail_labels` | `false` | - | An optional list of labels to apply to the pull request if the evaluation fails - Examples: `"needs-help,ci-failing,needs-review"` |
| `exclude_checks` | `false` | - | A comma separated list of check names to exclude from CI status evaluation - Examples: `"lint,some-other-check,foo"` |

> [!NOTE]  
> If you use any of the `pass_labels`, `pass_labels_cleanup`, or `fail_labels` input options, you will need `pull-requests: write` permissions within your Actions workflow.

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| `approved` | The string "true" if the pull request is in a fully approved state, "false" otherwise |
| `total_approvals` | The total number of approvals on the pull request |
| `review_decision` | The decision of the pull request review status - Examples: `"APPROVED"`, `"CHANGES_REQUESTED"`, `"REVIEW_REQUIRED"`, `null`, etc |
| `merge_state_status` | The status of the pull request merge state - Examples: `"CLEAN"`, `"DIRTY"`, `"UNKNOWN"`, `"DRAFT"`, `"BLOCKED"`, etc |
| `mergeable_state` | The mergeable state of the pull request - Examples: `"MERGEABLE"`, `"UNSTABLE"`, `"CONFLICTING"`, `"UNKNOWN"`, etc |
| `commit_status` | The ci status for the latest commit on the pull request - Examples: `"SUCCESS"`, `"FAILURE"`, `"PENDING"`, `null`, etc |
| `evaluation` | The overall evaluation of the pull request based on the `evaluations` input - Examples: `"PASS"`, `"FAIL"` |

## Evaluations 🧮

The evaluations input allows you to specify which attributes to evaluate the pull request against. The following attributes are supported:

- `approved`: Checks if the pull request is in a fully approved state
- `ci_passing`: Checks if the latest commit on the pull request has passing CI checks
- `mergeable`: Checks if the pull request is in a cleanly mergeable state
- `min_approvals=N`: Checks if the pull request has at least N approvals (e.g., `min_approvals=2`)

> [!TIP]  
> When using the `ci_passing` evaluation, this action will automatically exclude itself from the CI check evaluation to avoid circular dependencies. You can customize which checks to exclude using the `exclude_checks` input parameter.

Here are a few examples of how to use the evaluations input:

- `evaluations: approved` - Only checks if the pull request is approved
- `evaluations: approved,ci_passing` - Checks if the pull request is approved and has passing CI
- `evaluations: approved,mergeable,min_approvals=2` - Checks if the pull request is approved, mergeable, and has at least 2 approvals
- `evaluations: approved,ci_passing,mergeable,min_approvals=2` - Checks if the pull request is approved, has passing CI, is mergeable, and has at least 2 approvals
- `evaluations: min_approvals=1` - Checks if the pull request has at least 1 approval (does not even need to be in an approved state for this to pass). This can be useful if you want to check that at least someone has looked at the PR, but you don't care about the full approval state.

## Usage 💻

```yaml
name: pr-status

# The minimum required permissions for this action to work
permissions:
  contents: read
  checks: read
  statuses: read
  pull-requests: write # write is required to add/removes labels from the given pull request (set to read if you don't want to use the labels feature of this action)

# run on all sorts of different pull request related events
on:
  pull_request:
    types: [opened, reopened, synchronize, review_requested, review_request_removed, labeled, unlabeled]
  pull_request_review:
    types: [submitted, dismissed]

jobs:
  pr-status:
    runs-on: ubuntu-latest

    steps:
      - uses: GrantBirki/pr-status@vX.X.X # <-- replace with the latest version
        id: pr-status
        with:
          evaluations: approved,ci_passing # evaluate the given PR against the approved and ci_passing attributes
          exclude_checks: pr-status,my-other-check # exclude the pr-status check and my-other-check from CI evaluation
          pass_labels: ready-for-deployment # if the PR passes evaluation, apply the ready-for-deployment label
      
      # view some extra outputs the action sets
      # your workflow can now run separate logic based on these outputs
      - name: outputs
        run: |
          echo "approved: ${{ steps.pr-status.outputs.approved }}"
          echo "total approvals ${{ steps.pr-status.outputs.total_approvals }}"
          echo "evaluation ${{ steps.pr-status.outputs.evaluation }}"
          echo "merge state status ${{ steps.pr-status.outputs.merge_state_status }}"
          echo "commit status ${{ steps.pr-status.outputs.commit_status }}"
          echo "review decision ${{ steps.pr-status.outputs.review_decision }}"
          echo "...."
```

## How to Exclude Certain CI Checks 🚫

When using the `ci_passing` evaluation, you may want to exclude certain CI checks from the status evaluation. This is especially important to avoid circular dependencies where this action would check itself. This action provides both automatic and manual exclusion capabilities.

### Automatic Self-Exclusion

By default, this action automatically excludes itself from CI status evaluation to prevent circular dependencies. This is accomplished through the `workflow` input parameter, which defaults to `${{ github.workflow }}`.

**How it works:**

- The action receives the current workflow name via `${{ github.workflow }}`
- This workflow name is automatically added to the list of checks to exclude
- When evaluating CI status, any check with a name matching the workflow name is excluded

**Example:**

If your workflow is named `pr-status`, the action will automatically exclude any CI check named `pr-status` from evaluation.

### Manual Check Exclusion

You can also manually exclude specific CI checks using the `exclude_checks` input parameter. This accepts a comma-separated list of check names to exclude.

**Examples:**

```yaml
# Exclude specific checks by name
- uses: GrantBirki/pr-status@vX.X.X
  with:
    evaluations: approved,ci_passing
    exclude_checks: lint,codecov,security-scan
```

```yaml
# Exclude multiple checks including this action's own check
- uses: GrantBirki/pr-status@vX.X.X
  with:
    evaluations: approved,ci_passing
    exclude_checks: pr-status,my-custom-check,third-party-tool
```

### Check Name Matching Rules

The exclusion logic uses **exact string matching** to ensure precision:

- ✅ **Exact Match**: If you exclude "test", only checks named exactly "test" will be excluded
- ❌ **Substring Match**: Checks named "test-lint" or "my-test" will NOT be excluded. It must match the full name exactly.
- ✅ **Case Sensitive**: Matching is case-sensitive, so "Test" ≠ "test"

**Example scenario:**

```yaml
exclude_checks: test
```

Given these CI checks:

- `test` → ✅ **Excluded** (exact match)
- `test-lint` → ❌ **Not excluded** (contains "test" but not exact)
- `integration-test` → ❌ **Not excluded** (contains "test" but not exact)
- `Test` → ❌ **Not excluded** (different case)

### Check Types Supported

This action can exclude both types of GitHub CI checks:

1. **CheckRun nodes**: Uses the `name` field for matching
2. **StatusContext nodes**: Uses the `context` field for matching

The action intelligently handles both types and uses the appropriate field for exclusion matching.

### Best Practices

1. **Always exclude self**: The automatic self-exclusion handles this, but be aware it's happening
2. **Use exact names**: Make sure your exclusion names match exactly what appears in GitHub's CI status
3. **Test your exclusions**: Use debug mode to verify the correct checks are being excluded
4. **Document exclusions**: Comment your workflow to explain why certain checks are excluded
