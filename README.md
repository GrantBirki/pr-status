# pr-status ✅

[![test](https://github.com/GrantBirki/pr-status/actions/workflows/test.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/test.yml)
[![package-check](https://github.com/GrantBirki/pr-status/actions/workflows/package-check.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/package-check.yml)
[![lint](https://github.com/GrantBirki/pr-status/actions/workflows/lint.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/lint.yml)
[![CodeQL](https://github.com/GrantBirki/pr-status/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/codeql-analysis.yml)
[![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that checks the status of a pull request.

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| `github_token` | `true` | `${{ github.token }}` | The GitHub token used to create an authenticated client - Provided for you by default! |
| `pr_number` | `true` | `${{ github.event.number }}` | The pull request number to check the status of |
| `checks` | `true` | `all` | Whether to only look for `required` ci checks or `all` ci checks on the pull request |
| `evaluations` | `false` | `approved` | The attributes (comma separated list) to evaluate the pull request against when determining its status on a PASS/FAIL system. The default is just `approved` so a PR only needs proper approvals for this check to pass. This plays into the `evaluation` output. Full example: `approved,ci_passing,mergeable` - This full example would state that a PR must be considered approved, have passing CI, and be in a cleanly mergeable state to have the `evaluation` output be set to `PASS`. |
| `pass_labels` | `false` | - | An optional list of labels to apply to the pull request if the evaluation passes - Examples: `"ready-for-deployment,approved"` |
| `fail_labels` | `false` | - | An optional list of labels to apply to the pull request if the evaluation fails - Examples: `"needs-help,ci-failing,needs-review"` |

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| `approved` | The string "true" if the pull request is in a fully approved state, "false" otherwise |
| `total_approvals` | The total number of approvals on the pull request |
| `review_decision` | The decision of the pull request review status - Examples: `"APPROVED"`, `"CHANGES_REQUESTED"`, `"REVIEW_REQUIRED"`, `null`, etc |
| `merge_state_status` | The status of the pull request merge state - Examples: `"CLEAN"`, `"DIRTY"`, `"UNKNOWN"`, `"DRAFT"`, `"BLOCKED"`, etc |
| `commit_status` | The ci status for the latest commit on the pull request - Examples: `"SUCCESS"`, `"FAILURE"`, `"PENDING"`, `null`, etc |
| `evaluation` | The overall evaluation of the pull request based on the `evaluations` input - Examples: `"PASS"`, `"FAIL"` |

## Usage 💻

```yaml
name: pr-status

# run on all sorts of different pull request related events
on:
  pull_request:
    types: [opened, reopened, synchronize, review_requested, review_request_removed, labeled]
  pull_request_review:
    types: [submitted, dismissed]

jobs:
  pr-status:
    runs-on: ubuntu-latest

    steps:
      - uses: GrantBirki/pr-status@vX.X.X # <-- replace with the latest version
        id: pr-status
        with:
          evaluations: approved # evaluate the given PR against the approved attribute
          pass_labels: ready-for-deployment # if the PR is approved (evaluation passes), apply the ready-for-deployment label
      
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
