# Agent Guide

This repository contains `pr-status`, a public GitHub Action that evaluates the
state of a pull request, publishes action outputs, and optionally manages pull
request labels. Treat every source change, generated bundle, workflow edit,
commit message, branch name, tag, release, and pull request as potentially
visible to the entire internet.

The current implementation is deliberately small, strongly typed, and
auditable:

- Maintained runtime, test, and Node-based repository helper code is TypeScript.
- Runtime behavior uses Node.js built-ins and narrowly scoped local adapters.
- The shipped action has zero third-party production dependencies.
- Development dependencies are limited to the exact-pinned TypeScript compiler,
  Node type declarations, and `@vercel/ncc` bundler.
- Tests use Node's standard library and enforce 100% line, branch, and function
  coverage.
- The committed `dist/` bundle and source map are reproducible from reviewed
  source.
- Dependency and toolchain changes are slow, explicit, and reviewable.

These properties do not justify a framework or speculative abstraction. The
preferred implementation is the minimum amount of clear code that preserves the
public action contract and its security boundaries.

## Think Before Coding

Do not silently guess about behavior.

Before changing code:

1. Read the relevant source, tests, `action.yml`, README section, and workflow.
2. State assumptions explicitly.
3. If the request has multiple reasonable interpretations, present the options
   and their tradeoffs before implementing one.
4. If existing behavior is surprising, determine whether it is intentional and
   covered by tests before changing it.
5. Prefer the simpler design when it fully satisfies the request.
6. Stop and ask when ambiguity could alter the public contract, release
   behavior, permissions, failure semantics, or dependency policy.

Do not add features, extensibility, configuration, error handling, or
abstraction that the request does not require. A one-use helper does not need a
framework. Plain functions and explicit interfaces are preferred over class
hierarchies. Apply named design principles only when they make this small action
easier to understand or test; do not create indirection merely to satisfy a
pattern.

## Public Repository Safety

Assume the repository is public even if local or remote metadata temporarily
says otherwise.

Never add any of the following to source, tests, fixtures, documentation,
generated files, logs, Git metadata, pull request text, tags, or releases:

- Credentials, tokens, keys, cookies, or authentication material.
- Private URLs, hostnames, repository names, project names, incident details,
  customer information, or operational data.
- Non-public organizational code, terminology, architecture, identities, or
  examples copied from another checkout, conversation, browser, clipboard,
  log, or tool result.
- Local filesystem details that identify unrelated private work.

Use obviously synthetic values such as `example`, `octocat`, and `example/repo`
in fixtures and documentation.

Before any commit, push, tag, release, or pull request:

1. Review the complete diff, including generated `dist/` files.
2. Review all untracked files.
3. Review the staged diff separately from the working-tree diff.
4. Review every commit that would be published, not only the final tree.
5. Review author and committer identities, the branch name, commit messages, tag
   names, PR title, PR body, and release notes.
6. Search for secrets and non-public names, domains, URLs, and identifiers.
7. Remove questionable material or ask the maintainer before publishing.

Do not commit, push, tag, publish, or open or update a pull request unless the
user explicitly asks for that action.

## Current Architecture

Read the live tree before changing anything. The repository has one supported
architecture: a strict TypeScript source tree, Node-native runtime adapters,
Node-native tests, and a committed `ncc` bundle.

- `action.yml` is the public action metadata and contract. It declares inputs,
  outputs, the Node runtime, and `dist/index.js` as the executable entrypoint.
- `src/index.ts` is the minimal executable entrypoint.
- `src/main.ts` contains orchestration and dependency wiring.
- `src/functions/` contains focused status, evaluation, label, and parsing
  logic.
- `src/actions.ts` implements the narrow GitHub Actions environment-file and
  workflow-command protocol surface used by this action.
- `src/context.ts` validates GitHub Actions context and event payload data.
- `src/github.ts` implements the narrow GitHub.com GraphQL and REST client over
  Node's native `fetch`.
- `src/version.ts` is the source of truth for the action version used by the
  native GitHub client's user agent and the release helper.
- `test/` contains native TypeScript tests using `node:test` and
  `node:assert/strict`.
- Repository TypeScript helpers generate deterministic artifacts such as
  `badges/coverage.svg` without third-party utility packages.
- `dist/` is generated by `@vercel/ncc` and committed because GitHub executes
  JavaScript actions from the checked-in bundle. Never edit it by hand.
- `.github/workflows/` contains Ubuntu-only tests, type checking, bundle
  verification, read-only acceptance, and major-tag maintenance.
- `script/release` validates the release state, creates one annotated immutable
  version tag, and pushes only that intended tag. Never run it without explicit
  release authorization.
- Root `AGENTS.md` is the authoritative coding-agent instruction file.

Do not reintroduce a JavaScript source tree, a test-framework compatibility
layer, or toolkit packages that duplicate the current local adapters.

## Public Action Contract

Behavior declared in `action.yml` and documented in `README.md` is a public API.
Do not rename inputs or outputs, change defaults, alter string values, change
permission requirements, or change failure behavior as incidental cleanup.

Current inputs:

- `github_token`: token used for GitHub API requests. It must never be logged.
- `mode`: `status` preserves the existing behavior; `branch-deploy` enables exact
  branch-deploy-status label reconciliation.
- `workflow`: exact, case-sensitive current job/check name to exclude from CI
  evaluation. Its metadata default is `${{ github.job }}`.
- `pr_number`: pull request number, with event-context fallback behavior.
- `checks`: selects `required` checks or all checks.
- `evaluations`: comma-separated evaluation criteria.
- `pass_labels`: labels added when evaluation passes.
- `pass_labels_cleanup`: labels removed when evaluation passes.
- `fail_labels`: labels added when evaluation fails.
- `exclude_checks`: additional exact, case-sensitive check names excluded from
  CI status evaluation.
- Branch-deploy mode inputs: `transition`, `expected_head_sha`,
  `operation_result`, the four branch-deploy label names, `clear_on_draft`,
  `demote_merge_on_review_failure`, and `dry_run`.

The `workflow` name is preserved for API compatibility, but its value is a job
or check name, not the top-level workflow display name. The default
`${{ github.job }}` normally matches when a job has no custom display name.
Callers must explicitly pass the exact check name GitHub reports when using:

- A custom `jobs.<job_id>.name` value.
- A matrix job whose displayed name includes rendered matrix values.
- A reusable workflow whose check name includes caller or called-job context.

Matching is trimmed, exact, and case-sensitive. Do not add prefix matching,
fuzzy matching, run-wide exclusion, check discovery, or extra API permissions
without a separately reviewed public-contract change. `exclude_checks` remains
the mechanism for excluding other checks.

Current outputs:

- `branch_deploy_state`
- `head_sha`
- `head_matches`
- `approved`
- `total_approvals`
- `review_decision`
- `merge_state_status`
- `mergeable_state`
- `commit_status`
- `is_draft`
- `evaluation`

Current evaluation criteria:

- `approved`
- `ci_passing`
- `mergeable`
- `min_approvals=N`
- `not_draft`

Branch-deploy mode owns exactly four caller-configured labels. It preserves all
unmanaged labels and converges the managed set to at most one label. Closed,
merged, cleared, and configured draft states remove the complete managed set.
Reset transitions must provide the event's observed head SHA and preserve the
live state when that SHA is stale. Clear transitions trust the live pull request
state rather than a potentially stale closure event. Stale command results fail
closed to the noop state. Review transitions
must not promote a pull request that has not reached the post-noop review
state. Branch-deploy mode rejects the legacy PASS/FAIL label inputs rather than
combining two label ownership models.

The reusable workflow checks out `job.workflow_repository` at
`job.workflow_sha` before using the local action. Preserve that immutable
self-reference; do not replace it with a mutable branch or major-version tag.
It inherits the caller's explicitly scoped `GITHUB_TOKEN` permissions so
read-only dry runs remain possible; non-dry calls require callers to grant
`pull-requests: write`.
The workflow serializes branch-deploy state changes per pull request, but correctness
must continue to come from live PR state, head SHA, reviews, and labels.

When changing any public input, output, evaluation, or label behavior, update all
of the following together:

1. `action.yml`
2. Runtime types and implementation
3. Focused unit tests
4. Acceptance tests where applicable
5. `README.md` tables, semantics, permissions, and examples
6. The generated `dist/` bundle and source map

## Execution Flow

Preserve the observable flow unless a requested behavior change explicitly says
otherwise:

1. Read and validate action inputs and GitHub Actions context.
2. Resolve repository and pull request context from documented GitHub Actions
   environment variables and event payload data.
3. Resolve the exact current job/check name from a nonempty explicit `workflow`
   input or the required `GITHUB_JOB` context fallback.
4. Validate configuration before making an API request.
5. Query pull request review, merge, draft, and check status data.
6. Exclude the exact current job/check name and explicitly configured check
   names.
7. Compute the four-state commit status.
8. Set all documented status and evaluation outputs.
9. Evaluate the requested criteria to `PASS` or `FAIL`.
10. Determine labels to add and remove.
11. Apply label removals, then additions.
12. Mark unexpected input, API, protocol, or label errors through the GitHub
    Actions command protocol.

A legitimate negative pull request state produces `evaluation=FAIL` without
failing the action step. Configuration, context, API, protocol, response-shape,
and requested label-mutation errors fail the action step. Preserve this
distinction explicitly in source, tests, metadata, and documentation.

## Runtime Evaluation Contract

Validate configuration before making an API request:

- `pr_number` is a positive safe integer.
- `checks` is exactly `all` or `required`.
- Evaluation criteria are case-sensitive and limited to `approved`,
  `ci_passing`, `mergeable`, `not_draft`, and strict
  `min_approvals=(0|[1-9][0-9]*)` forms.
- `min_approvals=0` is valid and always satisfies that criterion.
- Unknown or malformed criteria fail the action as configuration errors.
- An explicitly empty evaluation list remains valid and evaluates to `PASS`.
- Check exclusions are trimmed, exact, and case-sensitive.
- The current exact job/check name is added to the exclusion set.
- A missing required GitHub Actions context value, including `GITHUB_JOB`, is a
  protocol error rather than an invitation to guess or run locally.

Approval counting uses paginated `latestReviews`, counts at most one latest
`APPROVED` review per actor login, and excludes GraphQL actors whose
`__typename` is `Bot`. `total_approvals` and `min_approvals` use this unique
current non-bot count. Preserve the policy that a null `reviewDecision`
satisfies the `approved` criterion.

Normalize selected CI check states into exactly four outputs:

- `SUCCESS`: `SUCCESS`, `SKIPPED`, or `NEUTRAL`
- `PENDING`: `PENDING`, `EXPECTED`, `QUEUED`, `IN_PROGRESS`, `WAITING`, or
  `REQUESTED`
- `FAILURE`: `FAILURE`, `ERROR`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`,
  `STARTUP_FAILURE`, or `STALE`
- `UNKNOWN`: missing, unrecognized, or internally inconsistent state

Aggregate with precedence `FAILURE`, `UNKNOWN`, `PENDING`, then `SUCCESS`.
Having no selected checks produces `UNKNOWN`. `ci_passing` passes only for
`SUCCESS`; missing CI evidence therefore fails closed. Malformed or unavailable
API data fails the action rather than being converted to an evaluation result.

All requested evaluation criteria are ANDed. A legitimate negative PR state
sets `evaluation=FAIL` but does not fail the action step. Input, context, API,
protocol, and requested label-mutation errors do fail the action step.

For labels, trim and deduplicate configured names while preserving order. On
PASS, add `pass_labels` and remove `fail_labels` plus
`pass_labels_cleanup`. On FAIL, add `fail_labels` and remove `pass_labels`. If a
label is selected for both addition and removal, addition wins. Paginate current
labels, skip deletion for labels already absent, remove first, then bulk-add.
Set diagnostic status and evaluation outputs before reconciling labels, but fail
the step when any requested mutation still fails after bounded retries.

## TypeScript and Toolchain Contract

All maintained runtime, test, and repository helper code is TypeScript unless a
file must remain another language for a documented reason.

The exact toolchain must stay aligned across `.node-version`, `package.json`,
the lockfile, CI, and contributor documentation:

- Node.js `24.16.0`
- npm `11.13.0`
- TypeScript `6.0.3`
- `@types/node` `24.12.2`
- `@vercel/ncc` `0.38.4`

Use `"packageManager": "npm@11.13.0"` and exact Node and npm engine values.
Keep `.npmrc`'s `min-release-age=45` setting and verify it with the pinned npm
release rather than assuming another npm release interprets it the same way.

Keep the strict compiler configuration, including:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`
- `noUnusedLocals`
- `noUnusedParameters`
- `forceConsistentCasingInFileNames`
- `target: ES2024`
- `module: NodeNext`
- `moduleResolution: NodeNext`
- `noEmit: true`
- `verbatimModuleSyntax`
- `erasableSyntaxOnly`
- `allowImportingTsExtensions`
- `rewriteRelativeImportExtensions`
- `types: ["node"]`

Prefer:

- Explicit interfaces for action inputs, GitHub event data, GraphQL responses,
  REST responses, status results, evaluation data, and injected collaborators.
- Discriminated unions or string-literal unions for finite GitHub states.
- `unknown` at untrusted boundaries, followed by narrow validation.
- `import type` for type-only imports.
- Small pure functions for parsing and evaluation logic.
- Dependency injection at the orchestration boundary so tests do not need
  module-level monkey-patching.
- Explicit `.ts` relative imports that Node can execute through native type
  stripping.

Avoid:

- `any` without a narrow, documented interoperability reason.
- Type assertions that merely silence the compiler.
- TypeScript enums, runtime namespaces, parameter properties, decorators, path
  aliases, or other syntax that prevents direct execution with Node's native
  type stripping.
- Classes for stateless helpers.
- Duplicated interfaces that can be represented by one focused shared type.
- Import-time side effects in modules that unit tests need to import.
- Excluding tests or repository TypeScript helpers from strict type checking.

TypeScript compilation and test execution are separate concerns. Node can strip
types but does not type-check. A successful test run never replaces
`tsc --noEmit`.

Do not enable `skipLibCheck` merely to make a change easier. It requires a
documented upstream declaration problem and explicit review.

## Dependency Policy

The shipped action has zero production dependencies. Preserve that posture
unless the user explicitly approves a well-supported exception.

The only development dependencies are exact-pinned:

- `typescript@6.0.3` for real type checking.
- `@types/node@24.12.2` for the Node 24 toolchain.
- `@vercel/ncc@0.38.4` for the committed GitHub Action bundle and source map.

Do not add or install dependencies without the user's explicit consent. If
consent is given:

- Use an exact version, never a floating range.
- Commit the corresponding lockfile change.
- Explain why Node.js or a small local implementation cannot reasonably provide
  the behavior.
- Inspect the package's transitive dependencies, lifecycle scripts, license,
  maintenance state, and published contents.
- Treat every upgrade as a new dependency review.

Use `npm ci --ignore-scripts`, not `npm install`, for a lockfile-respecting
bootstrap after dependency installation has been approved. Never run automated
dependency-fixing commands such as `npm audit fix` that rewrite the graph
without review.

Do not reintroduce:

- `@actions/core`, `@actions/github`, Octokit, or a general-purpose HTTP client.
- Jest, Babel, or a test-framework compatibility layer.
- ESLint, Prettier, or another broad formatting or lint stack without a concrete
  requirement that strict TypeScript and focused review cannot meet.
- A YAML parser solely to inspect `action.yml`.
- Coverage, badge, templating, or utility packages for behavior that the current
  small Node-native helpers already provide.

Do not sacrifice type checking or the required `ncc` action bundle merely to
claim a lower development dependency count.

## Native GitHub Actions Adapter

The local Actions adapter implements only what this action uses. Do not grow it
into a clone of the GitHub Actions toolkit.

Current surface:

- `getInput`
- `debug`
- `info`
- `warning`
- `error`
- `setOutput`
- `setFailed`

Required behavior:

- Input names map to uppercased `INPUT_<NAME>` environment variables with
  spaces normalized to underscores.
- Required inputs reject missing or empty values.
- Inputs preserve the documented trimming behavior unless explicitly disabled.
- Workflow command messages escape `%`, carriage return, and newline.
- Workflow command properties additionally escape `:`, `,`, and other required
  separators.
- Outputs use the `GITHUB_OUTPUT` environment file and a collision-resistant
  UUID multiline delimiter.
- Nullish output values become an empty string, strings remain unchanged, and
  supported non-string values are serialized deterministically.
- Missing `GITHUB_OUTPUT` is an unsupported, non-GitHub execution environment
  and fails clearly. Do not implement a legacy `set-output` fallback.
- `setFailed` emits a bounded error and sets a non-zero process exit code.
- Tokens and other sensitive inputs never appear in logs or command output.

Keep focused unit tests around this adapter's public behavior. This shim is a
security boundary, not an invitation to add a local framework. The executable
is a GitHub Actions program only; do not add a local CLI or best-effort local
mode.

## Native GitHub API Client

Use Node's built-in `fetch`. Do not introduce a general-purpose HTTP or GitHub
SDK when the action only needs its current GraphQL query and label REST
operations.

The client must:

- Accept only `https://api.github.com` for REST and
  `https://api.github.com/graphql` for GraphQL. Fail clearly if runner variables
  specify GitHub Enterprise Server endpoints.
- Make no self-hosted HTTP proxy compatibility claim.
- Authenticate without ever logging the token or authorization header.
- Send `Authorization: Bearer <token>`,
  `Accept: application/vnd.github+json`,
  `X-GitHub-Api-Version: 2022-11-28`, and a stable user agent containing the
  action version.
- Encode repository names, issue numbers, and label path components safely.
- Parse non-success responses into bounded, useful error messages without
  dumping secrets or untrusted response bodies.
- Detect GraphQL `errors` even when the HTTP status is successful.
- Validate response shapes at the untrusted JSON boundary before business logic
  consumes them.
- Accept injected `fetch` and sleep implementations in tests.
- Use bounded retries only for explicitly safe and retryable failures.
- Make mutation retry behavior explicit so label operations do not create
  surprising duplicate effects.
- Use a 15-second timeout for each attempt and make at most three attempts.
- Use default retry delays of 500 milliseconds and one second.
- Retry network or timeout failures and HTTP 429, 500, 502, 503, and 504.
- Retry HTTP 403 only when a short `Retry-After` value indicates secondary
  throttling.
- Honor `Retry-After` for at most ten seconds; fail rather than sleeping longer.
- Avoid retrying permanent authentication, authorization, validation, and
  not-found failures, except that label deletion treats 404 as the desired
  idempotent final state.
- Limit logged response excerpts to 4 KiB and redact the token defensively.
- Paginate at 100 nodes or records per page, reject repeated cursors or pages,
  and fail after 100 pages or 10,000 nodes.

Do not broaden workflow permissions to compensate for client errors. The README
and acceptance workflow should continue to demonstrate least-privilege
permissions.

## Testing and Coverage

The test stack is Node's standard library:

- `node:test`
- `node:assert/strict`
- `mock.fn`, `mock.method`, and explicit typed fakes where appropriate
- Node's built-in test coverage

Do not reintroduce Jest, Babel, a Jest compatibility layer, or a third-party
coverage package. Write assertions with native APIs.

Coverage gates are exactly:

- 100% lines
- 100% branches
- 100% functions

Coverage exclusions are exceptional. Do not add ignore comments to make a
number green when a branch can be tested or refactored. If generated code or a
minimal executable-only line truly cannot be covered, isolate it and explain
the tradeoff before adding an exclusion.

Tests run serially because cases modify process environment and GitHub Actions
environment files. Tests should cover behavior, not implementation trivia.
Include:

- Input normalization, required values, fallbacks, and malformed values.
- `GITHUB_JOB` context loading and failure when it is missing.
- Explicit `workflow` input precedence over the current job fallback.
- Exact, trimmed, and case-sensitive current-check exclusion.
- Custom, matrix, and reusable-workflow check names supplied explicitly.
- A differing top-level workflow name that is not mistaken for the current
  check name.
- Token redaction and safe logging.
- GraphQL success, HTTP failure, GraphQL error payloads, malformed JSON, and
  unexpected response shapes.
- GitHub.com endpoint construction and explicit rejection of GHES endpoints.
- Required-check and all-check modes.
- CheckRun and StatusContext nodes.
- Empty checks, missing rollups, unknown statuses, skipped or neutral checks,
  and pending or failing checks.
- Every evaluation criterion and malformed `min_approvals` forms.
- Output serialization, including `null`, booleans, and zero.
- Label add, remove, no-op, overlap, retry, and failure paths.
- PASS and FAIL label selection.
- Top-level success and top-level failure behavior.
- Workflow command escaping and multiline output writes.
- The executable entrypoint with temporary event and output files.

Prefer small fixtures and typed builders over repeated thousand-line response
objects. Shared test builders are appropriate when they reduce duplication
without hiding which fields matter to a case.

The coverage badge generator must use only Node built-ins, produce deterministic
SVG, and run only after the 100% coverage gate succeeds. A fixed `100%` badge is
acceptable only because CI independently enforces all three 100% thresholds.

## CI and Acceptance Testing

CI is part of the product for a public GitHub Action.

Required checks:

- `test`: native unit tests with 100% line, branch, and function coverage and a
  deterministic coverage badge check.
- `lint`: strict TypeScript type checking; the historic check name is retained
  for ruleset compatibility.
- `package-check`: clean rebuild and comparison of the committed `dist/`
  artifacts.
- `acceptance`: read-only execution of the checked-in action through `uses: ./`
  with representative output assertions.

Workflow requirements:

- Run repository CI on Ubuntu only.
- Pin every external action to a full 40-character commit SHA and retain a
  comment naming the intended release tag.
- Preserve repository-level enforcement that requires full-SHA action pinning.
- Treat local `uses: ./` references as intentional and permitted.
- Use explicit, least-privilege `permissions:` blocks.
- Set `persist-credentials: false` on checkout unless a reviewed later step
  genuinely requires Git writes.
- Use the exact Node version from `.node-version` for development checks.
- Use `npm ci --ignore-scripts` against the committed lockfile.
- Do not expose secrets to pull requests from forks.
- Keep testing, type checking, package verification, and acceptance
  responsibilities legible.
- Detect untracked generated files as well as tracked bundle diffs.

The package check must rebuild a clean `dist/` and inspect
`git status --porcelain -- dist/` so changed and untracked artifacts both fail
the check.

The read-only pull-request acceptance workflow must execute `uses: ./`, request
only read permissions for contents, checks, statuses, and pull requests, avoid
all label inputs, and assert representative outputs. It must be safe for forked
pull requests and must not receive write credentials. Keep acceptance focused
on deterministic criteria such as `not_draft`; do not create a circular or
timing-dependent `ci_passing` assertion.

Do not claim a build is hermetic merely because it uses `npm ci`. A truly
hermetic build must pass the airplane test: from a clean checkout and documented
toolchain, it can type-check, test, and bundle without network access. Because
npm artifacts are not vendored, describe the current build as locked and
reproducible rather than fully hermetic.

## Bundling

GitHub executes `dist/index.js`, not the TypeScript source.

For any change to runtime source, runtime dependencies, TypeScript
configuration, version metadata embedded in runtime code, or bundle
configuration:

1. Run the type check and native unit coverage gates.
2. Rebuild `dist/` with the repository's `@vercel/ncc` command.
3. Inspect `dist/index.js`, `dist/index.js.map`, and license output.
4. Confirm no absolute local paths, source secrets, unrelated files, or
   non-public information entered the bundle or source map.
5. Commit source and generated output together when publication is requested.

Never patch `dist/` manually. Never accept a generated bundle that cannot be
reproduced from the same commit. A source-only runtime change is incomplete.

## Dependency and Build Reproducibility

Follow a slow dependency cadence:

- Keep exact versions and a committed lockfile.
- Keep the existing Dependabot cooldown or make it stricter; do not weaken it
  casually.
- Verify that the pinned npm version recognizes any install-time
  minimum-release-age setting. Do not count an ignored `.npmrc` key as a supply
  chain control.
- Review changelogs, transitive graph changes, lifecycle scripts, licenses, and
  generated bundle changes for every update.
- Avoid automatic lockfile repair or broad update commands.
- Separate dependency updates from behavior changes where practical.
- Keep an auditable record of why every remaining package is necessary.

The committed `dist/` directory makes the consumer runtime self-contained, but
it does not by itself make development builds offline or hermetic. If full
offline rebuilds become a requirement, design and document vendoring separately
rather than committing cache artifacts in an unrelated change.

## Style

Use the existing user-facing voice and preserve stable messages where practical.
For maintained TypeScript:

- Two-space indentation.
- Single quotes.
- No semicolons unless syntactically required.
- Clear names over abbreviations.
- Understandability over clever concision.
- Whitespace and small functions over dense expressions.
- Constants for repeated protocol strings and finite values.
- Comments that explain why, security constraints, or non-obvious protocol
  behavior; do not narrate obvious code.

There is no formatter dependency. Keep touched code consistent by hand and use
review to enforce the deliberately small style surface.

## Documentation

`README.md` is user-facing API documentation. Keep it accurate and avoid
implementation details users do not need.

Document:

- Inputs, outputs, defaults, and accepted values.
- Required workflow permissions.
- The distinction between evaluation `FAIL` and action execution failure.
- Four-state commit-status behavior and fail-closed `ci_passing` semantics.
- Exact, case-sensitive check exclusion behavior.
- The `workflow` input's job/check-name meaning, `${{ github.job }}` default,
  and custom, matrix, and reusable-workflow override requirements.
- Unique latest non-bot approval counting.
- Requested label-mutation failure behavior.
- GitHub.com-only support and the absence of GHES or proxy guarantees.
- Release and upgrade notes for user-visible behavior changes.

Keep `action.yml`, README tables and examples, implementation, tests, and
generated bundle synchronized. Do not paste routine validation transcripts or
dependency-audit noise into the README or pull request body.

## Release and Tag Safety

`script/release` creates and pushes an immutable version tag. The major-tag
workflow force-updates one selected major tag. Both operations are externally
visible and affect downstream users.

Every release follows this sequence:

1. Choose the semantic version and confirm whether the changes require a new
   major version.
2. In a dedicated release-preparation pull request, update `src/version.ts`,
   tests that assert the versioned user agent, supported README usage examples,
   and the generated `dist/` artifacts. Do not change the private package
   version unless a separate package-publishing policy requires it.
3. Merge the release-preparation PR only after required CI and acceptance checks
   pass, then confirm the updated `main` merge commit is green.
4. Synchronize a clean local `main` exactly with `origin/main` and review the
   complete source, generated bundle, source map, licenses, commit history, and
   public metadata.
5. Obtain explicit user confirmation immediately before creating a public tag.
6. Run `script/release` to create and push only the intended annotated immutable
   `vMAJOR.MINOR.PATCH` tag.
7. Verify the version tag resolves to the intended green `main` commit.
8. Publish a non-draft, non-prerelease GitHub Release with curated public-safe
   notes, upgrade guidance, compatibility information, and a comparison link.
9. Dispatch the major-tag workflow with the immutable version tag as its source
   and the matching `vMAJOR` tag as its destination.
10. Verify the major tag and immutable version tag resolve to the same commit,
    while all older supported major tags remain unchanged.
11. Complete any Marketplace update as a separate explicit publication step.

Never run a release helper, create or push a tag, publish a release, move a
major tag, or update a Marketplace listing without explicit user authorization.

A breaking release receives a new major tag. Never move an older major tag onto
a breaking implementation. Immutable version tags must never be recreated or
moved. The tag-maintenance workflow may force-update only the intended matching
major tag after validating the source tag and major version.

Do not treat a version edit as documentation-only: the version is embedded in
the native client's user agent and therefore requires tests and a complete
bundle rebuild.

## Working Process

For a normal runtime change:

1. Start from current `main` and confirm the working tree is clean.
2. Create a descriptive branch using the naming convention requested for the
   change.
3. Characterize existing behavior with a test when it is not already covered.
4. Make the smallest source change.
5. Add or update focused TypeScript tests.
6. Run strict type checking and the native 100% coverage gate.
7. Rebuild and review `dist/`.
8. Update `action.yml` and README when the public contract changes.
9. Review the complete diff and branch history for public-repository safety.
10. Publish only when explicitly requested.

For a documentation-only change:

1. Confirm that no runtime behavior or metadata contract changes implicitly.
2. Keep examples consistent with `action.yml` and tests.
3. Avoid introducing promises the runtime does not enforce.
4. Review links, version references, and public wording before publication.

For a dependency update:

1. Identify the package's exact required surface and why the update is needed.
2. Confirm Node built-ins or the existing local implementation cannot satisfy
   the need more safely.
3. Obtain explicit dependency-installation approval.
4. Use an exact version and the lockfile-respecting install path.
5. Review the full transitive graph, lifecycle scripts, license changes, and
   published contents.
6. Run the complete TypeScript, coverage, bundle, and acceptance gates.
7. Review generated artifacts before publication.

## Response Style

Use concise Markdown in user-facing responses. State the outcome first, then any
material tradeoff, risk, or unresolved decision. Bold important warnings and use
emoji sparingly when it improves scanning.

Run the relevant checks, but when CI already covers routine validation, do not
paste a long command transcript into the final response. It is enough to say
what passed or what could not be run and why.

## Common Pitfalls

- Logging the full parsed input object and exposing `github_token`.
- Treating the top-level workflow name as the current job/check name.
- Assuming `${{ github.job }}` matches a custom, matrix, or reusable-workflow
  displayed check name without an explicit `workflow` override.
- Weakening exact, case-sensitive check exclusions with fuzzy matching.
- Treating TypeScript execution as TypeScript type checking.
- Reintroducing a test compatibility layer instead of using `node:test`.
- Replacing one dependency with a more complicated home-grown framework.
- Accidentally claiming GHES or proxy support in the GitHub.com-only client.
- Changing bounded GraphQL error handling, retry behavior, pagination, or
  response validation without complete tests.
- Writing unescaped workflow commands or unsafe multiline outputs.
- Converting legitimate evaluation `FAIL` into action failure, or suppressing
  real configuration, API, protocol, and label errors as evaluations.
- Counting a static `100%` badge as proof without enforcing all coverage
  thresholds.
- Running `npm install` and unintentionally rewriting the lockfile.
- Forgetting that the committed bundle and source map are public artifacts.
- Editing `dist/` manually.
- Verifying only tracked bundle diffs while missing new untracked generated
  files.
- Using floating action tags instead of immutable 40-character SHAs.
- Moving an old major tag onto a breaking release.
- Publishing branch, commit, PR, tag, or release metadata that contains
  non-public context.
