# pr-status ✅

[![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that checks the status of a pull request.

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| `github_token` | `true` | `${{ github.token }}` | The GitHub token used to create an authenticated client - Provided for you by default! |
| `pr_number` | `true` | `${{ github.event.number }}` | The pull request number to check the status of |
| `checks` | `true` | `all` | Whether to only look for `required` ci checks or `all` ci checks on the pull request |
| `evaluations` | `false` | `approved,ci_passing,mergeable` | The attributes to evaluate the pull request against when determining its status on a PASS/FAIL system. This plays into the `evaluation` output. |
| `pass_labels` | `false` | `""` | An optional list of labels to apply to the pull request if the evaluation passes |
| `fail_labels` | `false` | `""` | An optional list of labels to apply to the pull request if the evaluation fails |

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| `approved` | The string "true" if the pull request is in a fully approved state, "false" otherwise |
| `total_approvals` | The total number of approvals on the pull request |
| `review_decision` | The decision of the pull request review status - Examples: `"APPROVED"`, `"CHANGES_REQUESTED"`, `"REVIEW_REQUIRED"`, `null`, etc |
| `merge_state_status` | The status of the pull request merge state - Examples: `"CLEAN"`, `"DIRTY"`, `"UNKNOWN"`, `"DRAFT"`, `"BLOCKED"`, etc |
| `commit_status` | The ci status for the latest commit on the pull request - Examples: `"SUCCESS"`, `"FAILURE"`, `"PENDING"`, `null`, etc |
| `evaluation` | The overall evaluation of the pull request based on the `evaluations` input - Examples: `"PASS"`, `"FAIL"` |
