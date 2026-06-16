# pr-status ✅

[![test](https://github.com/GrantBirki/pr-status/actions/workflows/test.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/test.yml)
[![package-check](https://github.com/GrantBirki/pr-status/actions/workflows/package-check.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/package-check.yml)
[![lint](https://github.com/GrantBirki/pr-status/actions/workflows/lint.yml/badge.svg)](https://github.com/GrantBirki/pr-status/actions/workflows/lint.yml)
[![coverage](./badges/coverage.svg)](./badges/coverage.svg)

A dependency-free runtime GitHub Action that checks the status of a pull
request on GitHub.com, plus the reusable `branch-deploy-status` workflow.

## About 💡

Depending on its inputs, this action determines whether a pull request is
approved, has passing CI, is mergeable, and is not a draft. It always exposes
normalized status outputs and can reconcile labels from the resulting
`PASS`/`FAIL` evaluation.

The action supports GitHub.com only. It rejects GitHub Enterprise Server API
endpoints and does not claim support for self-hosted HTTP proxies.

## Inputs 📥

| Input | Required? | Default | Description |
| ----- | --------- | ------- | ----------- |
| `github_token` | `true` | `${{ github.token }}` | The GitHub.com token used to read pull request state and, when labels are configured, update labels |
| `mode` | `false` | `status` | Exactly `status` for the existing evaluation behavior or `branch-deploy` for exact branch-deploy-status label reconciliation |
| `pr_number` | `false` | - | A positive integer identifying the pull request to evaluate. Status mode falls back to the event pull request or issue; branch-deploy mode resolves supported caller events when `transition` is omitted. |
| `workflow` | `false` | `${{ github.job }}` | The exact, case-sensitive current job/check name to exclude so the action does not evaluate itself. Override it when GitHub reports a custom, matrix, or reusable-workflow check name. |
| `checks` | `true` | `all` | Exactly `all` or `required`, selecting which CI checks to evaluate |
| `evaluations` | `false` | `approved` | A case-sensitive comma-separated list containing `approved`, `ci_passing`, `mergeable`, `not_draft`, or `min_approvals=N`. An explicitly empty value evaluates to `PASS`. |
| `pass_labels` | `false` | - | An optional list of labels to apply to the pull request if the evaluation passes - Examples: `"ready-for-deployment,approved"` |
| `pass_labels_cleanup` | `false` | - | An optional list of labels to "clean up" (remove) if the pull request passes evaluation - Examples: `"ready-for-review,waiting"` |
| `fail_labels` | `false` | - | An optional list of labels to apply to the pull request if the evaluation fails - Examples: `"needs-help,ci-failing,needs-review"` |
| `exclude_checks` | `false` | - | A case-sensitive comma-separated list of exact check names to exclude from CI status evaluation |
| `transition` | `false` | - | In branch-deploy mode, exactly `reset`, `review`, `noop`, `deploy`, or `clear`. Providing it selects explicit-input mode; omit it to resolve a supported caller event. |
| `expected_head_sha` | `false` | - | In branch-deploy mode, the pull request head SHA observed by a reset, noop, or deploy transition; required for those transitions |
| `operation_result` | `false` | - | In branch-deploy mode, exactly `success`, `failure`, `cancelled`, or `skipped` for noop and deploy transitions |
| `noop_label` | `false` | `ready-for-noop` | Branch-deploy label for a pull request waiting for noop. The reusable workflow overrides this with `needs-noop`. |
| `review_label` | `false` | `ready-for-review` | Branch-deploy label for a pull request waiting for review |
| `deploy_label` | `false` | `ready-for-deployment` | Branch-deploy label for a pull request waiting for deployment |
| `merge_label` | `false` | `ready-to-merge` | Branch-deploy label for a pull request waiting to merge |
| `clear_on_draft` | `false` | `true` | Whether branch-deploy mode clears managed labels while the pull request is a draft |
| `demote_merge_on_review_failure` | `false` | `true` | Whether a review failure moves the merge state back to waiting for review |
| `dry_run` | `false` | `false` | Whether branch-deploy mode reports the desired state without changing labels |

> [!NOTE]  
> If you use branch-deploy mode without `dry_run: true`, or use any of the
> `pass_labels`, `pass_labels_cleanup`, or `fail_labels` input options, you
> will need `pull-requests: write` permissions within your Actions workflow.

Input configuration is validated before any API request. An invalid pull
request number, check mode, evaluation name, or `min_approvals` value fails the
action step instead of producing an evaluation result.

## Outputs 📤

| Output | Description |
| ------ | ----------- |
| `branch_deploy_reconciled` | In branch-deploy mode, `true` when the caller event was reconciled and `false` when it was intentionally ignored |
| `branch_deploy_state` | In branch-deploy mode, exactly `cleared`, `noop`, `review`, `deploy`, or `merge` |
| `head_sha` | The current pull request head commit SHA |
| `head_matches` | In branch-deploy mode, `true` when `expected_head_sha` matches the live head for reset, noop, or deploy, `false` when stale, and empty otherwise |
| `approved` | The string `"true"` when `reviewDecision` is `APPROVED` or null, and `"false"` otherwise |
| `total_approvals` | The number of unique non-bot actors whose latest review is `APPROVED` |
| `review_decision` | GitHub's review decision, such as `APPROVED`, `CHANGES_REQUESTED`, or `REVIEW_REQUIRED`; empty when GitHub returns null |
| `merge_state_status` | GitHub's merge state status: `CLEAN`, `DIRTY`, `BLOCKED`, `BEHIND`, `UNSTABLE`, `HAS_HOOKS`, or `UNKNOWN` |
| `mergeable_state` | GitHub's mergeable state: `MERGEABLE`, `CONFLICTING`, or `UNKNOWN` |
| `commit_status` | Exactly one normalized CI state: `SUCCESS`, `FAILURE`, `PENDING`, or `UNKNOWN` |
| `is_draft` | The string "true" if the pull request is in draft status, "false" otherwise |
| `evaluation` | `PASS` or `FAIL` after ANDing all requested evaluation criteria |

A legitimate negative pull request state produces `evaluation=FAIL` while the
action step still succeeds. Invalid input, API/protocol errors, malformed API
responses, and requested label mutations that cannot be completed fail the
action step. Status and evaluation outputs are written before label changes, so
they remain available when label reconciliation fails.

## Evaluations 🧮

The evaluations input allows you to specify which attributes to evaluate the pull request against. The following attributes are supported:

- `approved`: Checks if the pull request is in a fully approved state
- `ci_passing`: Passes only when the selected checks normalize to `SUCCESS`.
  Having no selected CI evidence, including after exclusions, normalizes to
  `UNKNOWN` and fails closed.
- `mergeable`: Passes only when GitHub reports the pull request's mergeable state as `MERGEABLE`
- `min_approvals=N`: Checks the unique latest non-bot approval count. `N` must
  be `0` or a positive integer without signs, whitespace, or leading zeroes;
  `min_approvals=0` always passes.
- `not_draft`: Checks if the pull request is not in draft status

> [!TIP]  
> When using the `ci_passing` evaluation, this action excludes the exact check
> name supplied through `workflow` to avoid evaluating itself. The default
> `${{ github.job }}` works when the job ID is also the reported check name;
> custom, matrix, and reusable-workflow check names must be supplied explicitly.
> Use `exclude_checks` for additional checks.

Evaluation names are case-sensitive and unknown or malformed criteria are
configuration errors. A null GitHub `reviewDecision` continues to satisfy
`approved`, which covers repositories without an approval requirement.

### CI status normalization

The selected CheckRun and StatusContext nodes are normalized before they are
aggregated:

| Output | GitHub states |
| ------ | ------------- |
| `SUCCESS` | `SUCCESS`, `SKIPPED`, `NEUTRAL` |
| `PENDING` | `PENDING`, `EXPECTED`, `QUEUED`, `IN_PROGRESS`, `WAITING`, `REQUESTED` |
| `FAILURE` | `FAILURE`, `ERROR`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, `STALE` |
| `UNKNOWN` | Missing, unrecognized, internally inconsistent, or absent selected checks |

Aggregation uses `FAILURE` first, then `UNKNOWN`, `PENDING`, and `SUCCESS`.

Here are a few examples of how to use the evaluations input:

- `evaluations: approved` - Only checks if the pull request is approved
- `evaluations: approved,ci_passing` - Checks if the pull request is approved and has passing CI
- `evaluations: approved,mergeable,min_approvals=2` - Checks if the pull request is approved, mergeable, and has at least 2 approvals
- `evaluations: approved,ci_passing,mergeable,min_approvals=2` - Checks if the pull request is approved, has passing CI, is mergeable, and has at least 2 approvals
- `evaluations: min_approvals=1` - Checks if the pull request has at least 1 current non-bot approval without requiring GitHub's overall review decision to be `APPROVED`.
- `evaluations: not_draft` - Checks if the pull request is not in draft status. This can be useful when combined with label automation to prevent applying labels to draft PRs.
- `evaluations: approved,not_draft,ci_passing` - Checks if the pull request is approved, not in draft status, and has passing CI

## Usage 💻

```yaml
name: pr-status

# The minimum required permissions for this action to work
permissions:
  contents: read
  checks: read
  statuses: read
  pull-requests: write # write is required to add or remove labels (use read if no label inputs are configured)

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
          exclude_checks: my-other-check # exclude an additional check from CI evaluation
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
          echo "is draft ${{ steps.pr-status.outputs.is_draft }}"
          echo "...."
```

Configured label names are trimmed and deduplicated in their original order.
When removals are requested, the action lists all current labels and removes
only selected labels that are present. It then adds selected labels in one
request. If the chosen outcome selects the same label for addition and removal,
addition wins. A requested label mutation that still fails after bounded
retries fails the action step.

## Branch-Deploy Status 🚦

The reusable `branch-deploy-status` workflow at
`.github/workflows/branch-deploy-status.yml` maintains one of four
caller-configurable branch-deploy labels:

| State | Default label | Meaning |
| ----- | ------------- | ------- |
| `noop` | `needs-noop` | The current head still needs a successful noop |
| `review` | `ready-for-review` | Noop succeeded and review policy is not satisfied |
| `deploy` | `ready-for-deployment` | Review policy is satisfied and deployment is pending |
| `merge` | `ready-to-merge` | Deployment succeeded against the current head |

Closed and merged pull requests have no managed label. A `clear` transition
reconciles that live state but does not erase labels if a stale closure event
runs after the pull request has reopened. Draft pull requests are also cleared
by default; set `clear_on_draft: false` to retain a branch-deploy state. A stale
reset preserves the live state, while stale noop or deploy results return to `noop`.
Failed, cancelled, or skipped noops return to `noop`; the same deployment
outcomes return to `deploy`. Review events cannot promote a `noop` pull
request before a successful noop. Unrelated labels are never changed.

The four configured labels must already exist, must be nonempty, and must be
distinct. Branch-deploy mode cannot be combined with `pass_labels`,
`pass_labels_cleanup`, or `fail_labels`. Use `dry_run: true` to inspect outputs
without changing labels.

The reusable workflow defaults to `approved,min_approvals=1,not_draft`.
Override `evaluations`
to add policy such as `min_approvals=2` or `ci_passing`. When using
`ci_passing`, pass the exact reusable-workflow check name through `workflow` if
the default job ID does not match the reported check name.

The reusable workflow forwards every action output listed above, including the
branch-deploy state, live head SHA, head-match result, review data, merge data, CI
status, and evaluation result.

The reusable workflow inherits the caller's `GITHUB_TOKEN` permissions and
cannot elevate them. A label-writing call must grant:

```yaml
permissions:
  checks: read
  contents: read
  pull-requests: write
  statuses: read
```

For `dry_run: true`, `pull-requests: read` is sufficient because no labels are
changed. Keep the other read permissions unchanged.

### Native branch-deploy events

The reusable workflow resolves supported caller events inside the action, so
the caller needs one job and no inputs. It handles pull request lifecycle and
review events directly. `github/branch-deploy` emits a trusted
`repository_dispatch` after each accepted noop or deploy operation. The action
validates that result against the operation marker in the pull request before
applying it.

```yaml
name: branch-deploy-status

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review, converted_to_draft, closed]
  pull_request_review:
    types: [submitted, dismissed]
  repository_dispatch:
    types: [branch-deploy-status]

permissions:
  checks: read
  contents: read
  pull-requests: write
  statuses: read

jobs:
  branch-deploy-status:
    uses: GrantBirki/pr-status/.github/workflows/branch-deploy-status.yml@vX.X.X # <-- replace with the latest version
```

This caller workflow must exist on the default branch before
`repository_dispatch` events are delivered. The branch-deploy workflow must
grant `contents: write`, which branch-deploy also uses for its lock state. Help,
lock, rejected command, and stable-branch runs do not change pull request
status labels.

The native command path validates the dispatched pull request, operated SHA,
noop or deploy mode, result, workflow run attempt, job, command comment, and
the exact status-comment ID returned by `github/branch-deploy`. It fetches that
comment directly, verifies its pull request ownership and hidden operation
marker, and ignores an older result when a newer accepted status comment exists
for the pull request. This path assumes one logical branch-deploy operation per
job; workflows that fan a single command out to operations with different
outcomes should use explicit transitions instead. Native marker verification
also expects branch-deploy to use the repository `GITHUB_TOKEN`, so its comments
are authored by `github-actions[bot]`; custom comment tokens should use explicit
transitions. The action never checks out or executes pull request code.
Explicit `transition`, `pr_number`, `expected_head_sha`, and `operation_result`
inputs remain available for custom event sources and older branch-deploy
integrations.

Native command results require branch-deploy's normal post-deploy completion;
callers using `skip_completing: true` must keep the explicit transition path.

Public fork pull requests receive a read-only `GITHUB_TOKEN` for
`pull_request` and `pull_request_review` workflows. Native lifecycle label
updates therefore require a same-repository pull request or a separately
reviewed privileged event design. Do not switch this example to
`pull_request_target` merely to obtain write permissions.

Pin production callers to the immutable full commit SHA for the selected
release. The reusable workflow checks out and executes its own exact defining
revision, so the caller's pin covers both the workflow and the action runtime.

## How to Exclude Certain CI Checks 🚫

When using the `ci_passing` evaluation, exclude the action's own in-progress
check to avoid a circular dependency. The `workflow` input identifies that
check, while `exclude_checks` identifies any additional checks to ignore.

### Current-Job Self-Exclusion

The `workflow` input is retained for compatibility, but its value is an exact
job/check name rather than a top-level workflow name. It defaults to
`${{ github.job }}`, GitHub's current job ID.

**How it works:**

- The action receives the current job ID through `${{ github.job }}`.
- The resolved value is added to the exact, case-sensitive exclusion set.
- A `CheckRun.name` or `StatusContext.context` matching that value is excluded.

The default works when the job ID is also the check name, which is the normal
case for a job without a custom display name. GitHub can report a different
check name when a job defines `name`, expands a matrix, or calls a reusable
workflow. In those cases, pass the complete check name shown by GitHub.

**Custom job-name example:**

```yaml
jobs:
  evaluate:
    name: Evaluate pull request
    runs-on: ubuntu-latest
    steps:
      - uses: GrantBirki/pr-status@vX.X.X
        with:
          evaluations: approved,ci_passing
          workflow: Evaluate pull request
```

For a matrix job, supply the fully rendered name, including its matrix values.
For a reusable workflow, supply the full caller/called-job check name GitHub
reports. Matching is deliberately exact; the action does not guess, use prefix
matching, or exclude every check in the current workflow run.

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
# Exclude multiple additional checks
- uses: GrantBirki/pr-status@vX.X.X
  with:
    evaluations: approved,ci_passing
    exclude_checks: my-custom-check,third-party-tool
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

1. **Check custom names**: Set `workflow` explicitly when the reported check name differs from the job ID
2. **Use exact names**: Make sure exclusion values match exactly what appears in GitHub's CI status
3. **Test your exclusions**: Use debug mode to verify the correct checks are being excluded
4. **Document exclusions**: Comment your workflow to explain why additional checks are excluded

## Development 🛠️

This project deliberately keeps its dependency and build surface small. The
maintained source, tests, and Node-based repository helpers are TypeScript. The
test suite uses Node's built-in test runner, assertions, mocks, and coverage
instead of a third-party test framework. The shipped action has no production
npm dependencies; its GitHub Actions protocol and GitHub.com API client are
implemented with Node's standard library.

Use the exact toolchain declared by the repository:

- Node.js `24.16.0`
- npm `11.13.0`

Install the exact locked dependencies without running package lifecycle scripts:

```shell
npm ci --ignore-scripts
```

The main development commands are:

```shell
npm run typecheck # strict TypeScript checking
npm run test      # native tests, 100% coverage gates, and coverage badge
npm run package   # rebuild the committed GitHub Action bundle
npm run all       # type-check, test, and package
```

Coverage must remain at 100% for lines, branches, and functions. The checked-in
coverage badge is generated only after those gates pass; the badge itself is not
the source of truth.

GitHub runs `dist/index.js`, not the TypeScript source. Changes to runtime code,
build configuration, or runtime dependencies must include the corresponding
`@vercel/ncc` output. The bundle, license file, and source map are public
artifacts and must be reviewed before they are committed.

Do not edit `dist/` by hand. The `test`, `lint`, and `package-check` workflows
verify the TypeScript source, native tests, coverage, and reproducibility of the
committed bundle on Ubuntu.
