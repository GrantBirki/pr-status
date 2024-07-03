# pr-status ✅

[![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that checks the status of a pull request.

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| `github_token` | `true` | `${{ github.token }}` | The GitHub token used to create an authenticated client - Provided for you by default! |

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| `approved` | The string "true" if the pull request is in a fully approved state, "false" otherwise |
| `total_approvals` | The total number of approvals on the pull request |
| `review_decision` | The decision of the pull request review status - Examples: `"APPROVED"`, `"CHANGES_REQUESTED"`, `"REVIEW_REQUIRED"`, `null`, etc |
| `merge_state_status` | The status of the pull request merge state - Examples: `"CLEAN"`, `"DIRTY"`, `"UNKNOWN"`, `"DRAFT"`, etc |
| `commit_status` | The ci status for the latest commit on the pull request - Examples: `"SUCCESS"`, `"FAILURE"`, `"PENDING"`, `null`, etc |
