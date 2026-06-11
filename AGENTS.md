# Agent Guide

This repository contains `pr-status`, a public GitHub Action that evaluates the
state of a pull request, publishes action outputs, and optionally manages pull
request labels. Treat every source change, generated bundle, workflow edit,
commit message, branch name, and pull request as potentially visible to the
entire internet.

The approved direction is a small, strongly typed, auditable action delivered
through two sequential pull requests:

- All maintained source and test code should be TypeScript.
- Runtime behavior should use Node.js built-ins wherever practical.
- The shipped action should have no third-party runtime dependencies if the
  required behavior can be implemented clearly with Node.js and GitHub's
  documented protocols.
- Development dependencies should be kept to the smallest defensible set.
- Unit tests must enforce 100% line, branch, and function coverage.
- The committed `dist/` bundle must be reproducible from reviewed source.
- Dependency and toolchain changes must be slow, explicit, and reviewable.

These goals do not justify a large framework or speculative abstraction. The
preferred implementation is the minimum amount of clear code that preserves the
public action contract.

## Approved Migration Sequence

The redesign is intentionally split into two reviewable changes. Do not combine
the stages or begin the second stage from an unmerged first-stage branch.

### PR 1: TypeScript Foundation

Create `codex/typescript-foundation` from current `main`. This stage must:

- Convert maintained runtime code, tests, and Node-based repository helpers to
  strict TypeScript and ESM.
- Replace Jest, Babel, ESLint, Prettier, and third-party coverage/badge tooling
  with the TypeScript compiler and Node's native test, assertion, mock, and
  coverage facilities.
- Enforce real 100% line, branch, and function coverage over every maintained
  source file.
- Remove unused dependencies and exact-pin every dependency that remains.
- Add a read-only `uses: ./` acceptance workflow and strengthen bundle
  reproduction checks.
- Keep `@actions/core`, `@actions/github`, and `@octokit/plugin-retry`
  temporarily.
- Preserve the current runtime evaluation, output, and label semantics. The
  only intended runtime safety change is that tokens and raw input structures
  must never be logged. Broken test, coverage, build, and release gates may and
  should be repaired.
- Keep `@vercel/ncc`, committed source maps, and the generated `dist/` bundle.

Open PR 1 as a draft. PR 2 must not start until PR 1 is merged, the updated
`main` branch is green, and the next branch starts from that updated `main`.

### PR 2: Native Runtime Redesign

Create `codex/native-runtime-redesign` from the post-PR-1 `main`. This stage
must:

- Replace the used subset of `@actions/core` with a small adapter over the
  documented GitHub Actions environment-file and workflow-command protocols.
- Replace the used subset of `@actions/github` and the Octokit retry plugin with
  a narrowly scoped client built on Node's native `fetch`.
- Support GitHub.com only. Reject GitHub Enterprise Server API endpoints
  clearly rather than silently attempting partial compatibility.
- Keep execution GitHub Actions-only. Do not add a local CLI, best-effort local
  execution, legacy `set-output` fallback, or proxy-support claim.
- Introduce the separately approved strict input validation, paginated status
  and review retrieval, unique current non-bot approval counting, four-state
  commit status, fail-closed CI evaluation, and strict label reconciliation.
- Reach zero production dependencies while retaining exact-pinned
  `typescript`, `@types/node`, and `@vercel/ncc` as development dependencies.

User-visible PR 2 behavior must be documented in `action.yml`, `README.md`,
tests, and the generated bundle together. Do not describe PR 2 semantics as
current behavior in PR 1 documentation.

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

Do not add features, extensibility, configuration, error handling, or abstraction
that the request does not require. A one-use helper does not need a framework.
Plain functions and explicit interfaces are preferred over class hierarchies.
Apply SOLID, GRASP, DRY, and object-oriented ideas only when they make this small
action easier to understand or test; do not create indirection merely to satisfy
a named principle.

## Public Repository Safety

Assume the repository is public even if local or remote metadata temporarily
says otherwise.

Never add any of the following to source, tests, fixtures, documentation,
generated files, logs, Git metadata, or pull request text:

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
   names, PR title, and PR body.
6. Search for secrets and non-public names, domains, URLs, and identifiers.
7. Remove questionable material or ask the maintainer before publishing.

Do not commit, push, tag, publish, or open/update a pull request unless the user
explicitly asks for that action.

## Repository Map

Read the live tree before changing anything. During the two-PR migration, a
checkout may contain the pre-migration JavaScript layout, the PR 1 TypeScript
layout, or the PR 2 native runtime layout.

- `action.yml` is the public action metadata and contract. It declares inputs,
  outputs, the Node runtime, and `dist/index.js` as the executable entrypoint.
- `src/index.ts` is the minimal executable entrypoint. `src/main.ts` contains
  side-effect-free orchestration, and `src/functions/` contains focused domain
  logic. After PR 1 all are strict TypeScript; after PR 2 `src/` also contains
  the narrow Actions protocol and GitHub HTTP adapters.
- `test/` contains native TypeScript tests using `node:test` and
  `node:assert/strict`.
- Repository TypeScript helpers generate deterministic artifacts such as
  `badges/coverage.svg` without third-party utility packages.
- `dist/` is generated by `@vercel/ncc` and committed because GitHub executes
  JavaScript actions from the checked-in bundle. Never edit it by hand.
- `.github/workflows/` contains Ubuntu-only test, type-check, bundle
  verification, acceptance, and tag-maintenance workflows.
- `script/release` creates and pushes a version tag. Never run it unless the
  user explicitly requests a release operation.
- Root `AGENTS.md` is the authoritative coding-agent instruction file.

## Public Action Contract

Behavior declared in `action.yml` and documented in `README.md` is a public API.
Do not rename inputs or outputs, change defaults, alter string values, change
permission requirements, or change failure behavior as an incidental part of a
TypeScript or dependency migration.

Current inputs:

- `github_token`: token used for GitHub API requests. It must never be logged.
- `workflow`: current workflow name, used to exclude this action from its own CI
  evaluation.
- `pr_number`: pull request number, with event-context fallback behavior.
- `checks`: selects `required` checks or all checks.
- `evaluations`: comma-separated evaluation criteria.
- `pass_labels`: labels added when evaluation passes.
- `pass_labels_cleanup`: labels removed when evaluation passes.
- `fail_labels`: labels added when evaluation fails.
- `exclude_checks`: exact, case-sensitive check names excluded from CI status
  evaluation.

Current outputs:

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

When changing any public input, output, evaluation, or label behavior, update all
of the following together:

1. `action.yml`
2. Runtime types and implementation
3. Focused unit tests
4. Acceptance tests where applicable
5. `README.md` tables, semantics, permissions, and examples
6. The generated `dist/` bundle

## Execution Flow

Preserve the observable flow unless a requested behavior change explicitly says
otherwise:

1. Read and validate action inputs.
2. Resolve repository and pull request context from documented GitHub Actions
   environment variables and event payload data.
3. Query pull request review, merge, draft, and check status data.
4. Exclude the current workflow and explicitly configured check names.
5. Compute the status result.
6. Set all documented outputs.
7. Evaluate the requested criteria to PASS or FAIL.
8. Determine labels to add and remove.
9. Apply label changes.
10. Mark unexpected action failures through the GitHub Actions command protocol.

The current implementation contains several fail-open and error-swallowing
behaviors. Do not accidentally tighten or loosen them during a mechanical
migration. Characterize them with tests, then discuss any intentional behavior
change separately.

## PR 2 Target Contract

The following rules are approved for PR 2 only. They are intentional public
behavior changes, not cleanup to mix into PR 1.

Validate configuration before making an API request:

- `pr_number` is a positive safe integer.
- `checks` is exactly `all` or `required`.
- Evaluation criteria are case-sensitive and limited to `approved`,
  `ci_passing`, `mergeable`, `not_draft`, and strict
  `min_approvals=(0|[1-9][0-9]*)` forms.
- `min_approvals=0` is valid and always satisfies that criterion.
- Unknown or malformed criteria fail the action as configuration errors.
- An explicitly empty evaluation list remains valid and evaluates to `PASS`.
- Check exclusions remain exact and case-sensitive, and the current workflow is
  automatically excluded.

Approval counting must use paginated `latestReviews`, count at most one latest
`APPROVED` review per actor login, and exclude GraphQL actors whose
`__typename` is `Bot`. `total_approvals` and `min_approvals` use this unique
current non-bot count. Preserve the approved policy that a null
`reviewDecision` satisfies the `approved` criterion.

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
sets `evaluation=FAIL` but does not fail the action step. Input, API, protocol,
and requested label-mutation errors do fail the action step.

For labels, trim and deduplicate configured names while preserving order. On
PASS, add `pass_labels` and remove `fail_labels` plus
`pass_labels_cleanup`. On FAIL, add `fail_labels` and remove `pass_labels`. If a
label is selected for both addition and removal, addition wins. Paginate current
labels, skip deletion for labels already absent, remove first, then bulk-add.
Set diagnostic status/evaluation outputs before reconciling labels, but fail the
step when any requested mutation still fails after bounded retries.

## TypeScript Direction

All maintained runtime, test, and repository helper code should move to
TypeScript unless a file must remain another language for a documented reason.

The approved PR 1 toolchain is exact and must stay aligned across
`.node-version`, `package.json`, the lockfile, CI, and contributor docs:

- Node.js `24.16.0`
- npm `11.13.0`
- TypeScript `6.0.3`
- `@types/node` `24.12.2`
- `@vercel/ncc` `0.38.4`

Use `"packageManager": "npm@11.13.0"` and exact Node/npm engine values. Keep
`.npmrc`'s `min-release-age=45` setting and verify it with npm 11.13.0 rather
than assuming another npm release interprets it the same way.

Use strict compiler settings. At minimum, keep these properties enabled where
supported by the selected TypeScript version:

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

Avoid:

- `any` without a narrow, documented interoperability reason.
- Type assertions that merely silence the compiler.
- TypeScript enums, runtime namespaces, parameter properties, decorators, path
  aliases, or other syntax that prevents direct execution with Node's native
  type stripping.
- Classes for stateless helpers.
- Duplicated interfaces that can be represented by one focused shared type.
- Import-time side effects in modules that unit tests need to import.

TypeScript compilation and test execution are separate concerns. Node can strip
types but does not type-check. A successful test run never replaces
`tsc --noEmit`.

Do not enable `skipLibCheck` merely to make a migration easier. It requires a
documented upstream declaration problem and explicit review.

## Dependency Policy

The dependency budget is intentionally strict.

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
bootstrap after the user has approved dependency installation. Never run
automated dependency-fixing commands such as `npm audit fix` that rewrite the
graph without review.

Target dependency posture:

- During PR 1, exact-pin the temporary runtime packages to
  `@actions/core@1.11.1`, `@actions/github@6.0.1`, and
  `@octokit/plugin-retry@6.1.0`.
- Keep exact-pinned `@vercel/ncc@0.38.4` to produce the committed GitHub Action
  bundle and source map through both approved PRs.
- Keep exact-pinned `typescript@6.0.3` for real type-checking.
- Keep exact-pinned `@types/node@24.12.2` for the Node 24 toolchain.
- Remove Jest and Babel in favor of Node's built-in test runner and native
  TypeScript execution.
- Remove Prettier. Consistent formatting does not justify its dependency graph
  here.
- Remove ESLint if strict TypeScript checks and focused review cover the rules
  this repository actually needs. Do not replace it with another broad lint
  stack without an explicit requirement.
- Remove `make-coverage-badge`; generate the deterministic SVG locally with
  Node's standard library after the 100% coverage gate passes.
- Remove `js-yaml` unless a concrete runtime requirement for YAML parsing is
  introduced. `action.yml` does not need to be parsed by the action itself.
- Remove unused template or utility packages rather than preserving them for
  hypothetical future use.
- Replace the used subset of `@actions/core` with a small, well-tested local
  adapter over documented `INPUT_*` variables, workflow commands, and
  `GITHUB_OUTPUT`.
- In PR 2, replace the used subset of `@actions/github` and Octokit retry
  plugins with a small, injected, GitHub.com-only client built on Node's native
  `fetch`, with bounded error reporting, retries, pagination, and API response
  validation explicitly tested.

After PR 2, the shipped runtime dependency count must be zero and the only
development dependencies are the three exact versions listed above. Do not
sacrifice type-checking or the required `ncc` action bundle merely to claim a
lower development dependency count.

## Native GitHub Actions Adapter

A local replacement for `@actions/core` should implement only what this action
uses. Do not clone the entire toolkit.

Expected surface:

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
- Inputs preserve the toolkit's trimming behavior unless explicitly disabled.
- Workflow command messages escape `%`, carriage return, and newline.
- Workflow command properties additionally escape `:`, `,`, and other required
  separators.
- Outputs use the `GITHUB_OUTPUT` environment file and a collision-resistant
  UUID multiline delimiter.
- Output conversion preserves the toolkit behavior used by this action: nullish
  values become an empty string, strings remain unchanged, and supported
  non-string values are serialized deterministically.
- Missing `GITHUB_OUTPUT` is an unsupported/non-GitHub execution environment
  and must fail clearly. Do not implement legacy `set-output` fallback.
- `setFailed` emits an error and sets a non-zero process exit code.
- Tokens and other sensitive inputs are never included in debug output.

Keep unit tests next to this adapter's public behavior. This shim is a security
boundary, not an invitation to grow a local framework. The executable is a
GitHub Actions program only; do not add a local CLI or best-effort local mode.

## Native GitHub API Client

Use Node's built-in `fetch` rather than introducing a general-purpose HTTP or
GitHub SDK when the action only needs a GraphQL request and three label REST
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
- Validate the response shape at the untrusted JSON boundary before business
  logic consumes it.
- Accept an injected `fetch` implementation in tests.
- Use bounded retries only for explicitly safe and retryable failures. Respect
  server retry guidance and avoid retrying permanent authorization, validation,
  or not-found errors.
- Make mutation retry behavior explicit so label operations do not create
  surprising duplicate effects.
- Use a 15-second timeout for each attempt and make at most three attempts.
- Use default retry delays of 500 milliseconds and one second. Retry network or
  timeout failures and HTTP 429, 500, 502, 503, and 504 responses. Retry HTTP
  403 only when a short `Retry-After` header indicates secondary throttling.
- Honor `Retry-After` for at most ten seconds; fail rather than sleeping longer.
- Limit logged response excerpts to 4 KiB and redact the token defensively.
- Paginate at 100 nodes per page, reject repeated cursors/pages, and fail after
  100 pages or 10,000 nodes.

Do not broaden permissions to compensate for client errors. The README and
acceptance workflow should continue to demonstrate least-privilege permissions.

## Testing and Coverage

The target test stack is Node's standard library:

- `node:test`
- `node:assert/strict`
- `mock.fn`, `mock.method`, and explicit fakes where appropriate
- Node's built-in test coverage

Do not reintroduce Jest, Babel, a Jest compatibility layer, or a third-party
coverage package. Rewrite assertions to native APIs instead of preserving old
test-framework syntax indefinitely.

Coverage gates must be exactly:

- 100% lines
- 100% branches
- 100% functions

Coverage exclusions must be exceptional. Do not add ignore comments to make a
number green when a branch can be tested or refactored. If generated code or a
minimal executable-only line truly cannot be covered, isolate it and explain the
tradeoff before adding an exclusion.

Tests should run serially because some cases modify process environment and
GitHub Actions environment files. Tests should cover behavior, not
implementation trivia. Include:

- Input normalization, required values, fallbacks, and malformed values.
- Token redaction and safe logging.
- GraphQL success, HTTP failure, GraphQL error payloads, malformed JSON, and
  unexpected response shapes.
- GitHub.com endpoint construction and explicit rejection of GHES endpoints.
- Required-check and all-check modes.
- CheckRun and StatusContext nodes.
- Exact and case-sensitive exclusions, including self-exclusion.
- Empty checks, missing rollups, unknown statuses, skipped/neutral checks, and
  pending/failing checks.
- Every evaluation criterion and malformed `min_approvals` forms.
- Output serialization, including `null`, booleans, and zero.
- Label add/remove/no-op paths and API failures.
- PASS and FAIL label selection.
- Top-level success and top-level failure behavior.
- Workflow command escaping and multiline output writes.

Prefer small fixtures and typed builders over repeated thousand-line response
objects. Shared test builders are appropriate when they reduce duplication
without hiding which fields matter to a case.

The coverage badge generator must use only Node built-ins, produce deterministic
SVG, and run only after the 100% coverage gate succeeds. A fixed `100%` badge is
acceptable only because CI independently enforces all three 100% thresholds.

## CI and Acceptance Testing

CI is part of the product for a public GitHub Action.

Expected checks:

- Strict TypeScript type-checking.
- Native unit tests with 100% line, branch, and function coverage.
- Rebuild of `dist/` followed by a clean-tree comparison.
- An acceptance workflow that executes the local action with `uses: ./` and
  verifies representative outputs without creating a circular status check.

Workflow requirements:

- Run repository CI on Ubuntu only.
- Pin third-party actions to full commit SHAs and retain a comment naming the
  intended release tag.
- Use explicit, least-privilege `permissions:` blocks.
- Set `persist-credentials: false` on checkout unless a reviewed later step
  genuinely requires Git writes.
- Use the exact Node version from `.node-version` for development checks.
- Use `npm ci --ignore-scripts` against the committed lockfile.
- Do not expose secrets to pull requests from forks.
- Keep test, typecheck, package verification, and acceptance responsibilities
  legible. They may be separate jobs or workflows when that improves failure
  diagnosis.
- Detect untracked generated files as well as tracked bundle diffs.

Preserve the required check names `test`, `lint`, and `package-check`.
`lint` remains the externally visible check name but runs strict TypeScript
checking rather than a third-party lint stack. The package check must rebuild a
clean `dist/` and inspect `git status --porcelain -- dist/`.

The read-only pull-request acceptance workflow must execute `uses: ./`, request
only read permissions for contents, checks, statuses, and pull requests, avoid
all label inputs, and assert representative outputs. It must be safe for forked
pull requests and must not receive write credentials.

Do not claim a build is hermetic merely because it uses `npm ci`. A truly
hermetic build must pass the airplane test: from a clean checkout and documented
toolchain, it can type-check, test, and bundle without network access. If npm
artifacts are not vendored, describe the build as locked and reproducible rather
than fully hermetic.

## Bundling

GitHub executes `dist/index.js`, not the TypeScript source.

For any change to runtime source, runtime dependencies, TypeScript configuration,
or bundle configuration:

1. Run the typecheck and unit coverage gates.
2. Rebuild `dist/` with the repository's `@vercel/ncc` command.
3. Inspect all generated files and license changes.
4. Confirm no absolute local paths, source secrets, unrelated files, or
   non-public information entered the bundle or source map.
5. Commit source and generated output together when publication is requested.

Never patch `dist/` manually. Never accept a generated bundle that cannot be
reproduced from the same commit.

## Dependency and Build Reproducibility

Follow a slow dependency cadence:

- Keep exact versions and a committed lockfile.
- Keep the existing Dependabot cooldown or make it stricter; do not weaken it
  casually.
- Verify that the pinned npm version actually recognizes any install-time
  minimum-release-age setting. Do not count an ignored `.npmrc` key as a supply
  chain control.
- Review changelogs, transitive graph changes, lifecycle scripts, and generated
  bundle changes for every update.
- Avoid automatic lockfile repair or broad update commands.
- Separate dependency updates from behavior changes where practical.
- Keep an auditable record of why every remaining package is necessary.

The committed `dist/` directory makes the consumer runtime self-contained, but
it does not by itself make development builds offline or hermetic. If full
offline rebuilds become a requirement, design and document vendoring separately
rather than smuggling cache artifacts into an unrelated migration change.

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

There is no requirement to add a formatter dependency. Keep touched code
consistent by hand and use review to enforce the deliberately small style
surface.

## Documentation

`README.md` is user-facing API documentation. Keep it accurate and avoid
implementation details users do not need.

Document:

- Inputs, outputs, defaults, and accepted values.
- Required workflow permissions.
- Failure and fail-open semantics that affect workflow design.
- Exact check-exclusion behavior.
- Supported GitHub environments if the API client changes.
- Release or migration notes for any user-visible behavior change.

Do not paste routine validation transcripts or dependency-audit noise into the
README or pull request body.

## Release Safety

`script/release` creates and pushes tags. The tag-maintenance workflow force
moves a major-version tag. Both are externally visible and affect downstream
users.

Before a release:

1. Confirm the intended semantic version and source commit.
2. Confirm source, tests, action metadata, README, and `dist/` agree.
3. Review the complete published commit history and generated bundle.
4. Confirm required CI and acceptance checks passed.
5. Confirm the major tag points to the intended immutable version tag.

Never run a release helper, move a tag, or force-push a tag without explicit user
authorization.

Neither approved migration PR changes `VERSION`, creates or moves a tag, or
prepares/publishes a release. Release execution is expressly out of scope even
though PR 1 hardens the release helper and tag-maintenance workflow.

## Working Process

For a normal runtime change:

1. Start from current `main` and confirm the working tree is clean.
2. Characterize existing behavior with a test when it is not already covered.
3. Make the smallest source change.
4. Add or update focused TypeScript tests.
5. Run strict type-checking and the native 100% coverage gate.
6. Rebuild and review `dist/`.
7. Update `action.yml` and README only when the public contract changes.
8. Review the complete diff for public-repository safety.

For the approved redesign, follow the branch and merge boundary in **Approved
Migration Sequence** rather than treating both phases as one normal runtime
change.

For dependency removal:

1. Prove the package is unused or identify its exact used surface.
2. Replace only that surface with a small local or Node-native implementation.
3. Add parity tests before removing the package.
4. Remove the direct dependency and regenerate the lockfile with approval.
5. Review the full transitive graph reduction and bundle license changes.
6. Rebuild `dist/` and run acceptance coverage.

## Response Style

Use concise Markdown in user-facing responses. State the outcome first, then any
material tradeoff, risk, or unresolved decision. Bold important warnings and use
emoji sparingly when it improves scanning.

Run the relevant checks, but when CI already covers routine validation, do not
paste a long command transcript into the final response. It is enough to say
what passed or what could not be run and why.

## Common Pitfalls

- Logging the full parsed input object and exposing `github_token`.
- Treating TypeScript execution as TypeScript type-checking.
- Preserving Jest-style tests through a large compatibility shim instead of
  using `node:test` directly.
- Replacing one dependency with a more complicated home-grown framework.
- Accidentally claiming GHES or proxy support in the GitHub.com-only native
  client.
- Removing Octokit without preserving GraphQL error handling, bounded retry
  behavior, pagination, and response validation.
- Writing unescaped workflow commands or unsafe multiline outputs.
- Changing fail-open status behavior during a mechanical migration.
- Counting a static `100%` badge as proof without enforcing all coverage
  thresholds.
- Running `npm install` and unintentionally rewriting the lockfile.
- Forgetting that the committed bundle and source map are public artifacts.
- Editing `dist/` manually.
- Verifying only tracked bundle diffs while missing new untracked generated
  files.
- Using floating action tags in workflows instead of immutable SHAs.
- Publishing branch, commit, or PR metadata that contains non-public context.
