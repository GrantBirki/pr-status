# approved ✅

[![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that checks if a pull request is in a fully approved state.

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| `github_token` | `true` | `${{ github.token }}` | The GitHub token used to create an authenticated client - Provided for you by default! |

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| `approved` | The string "true" if the pull request is in a fully approved state, "false" otherwise |
