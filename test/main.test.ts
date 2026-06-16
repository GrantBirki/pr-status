import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import type {ActionsApi, InputOptions} from '../src/actions.ts'
import type {ActionContext} from '../src/context.ts'
import {determineLabelActions} from '../src/functions/label.ts'
import type {LabelResult} from '../src/functions/label.ts'
import {determineBranchDeployState} from '../src/functions/branch-deploy.ts'
import type {StatusResult} from '../src/functions/status.ts'
import {stringToArray} from '../src/functions/string-to-array.ts'
import type {GitHubClient} from '../src/github.ts'
import {
  logLabelActions,
  parseInputs,
  run,
  safeErrorMessage
} from '../src/main.ts'
import type {MainDependencies} from '../src/main.ts'
import {createRecordingCore} from './functions/helpers.ts'

const context: ActionContext = {
  repo: {owner: 'octocat', repo: 'example'},
  job: 'evaluate',
  eventName: 'pull_request',
  eventPayload: {
    action: 'synchronize',
    pull_request: {number: 42, head: {sha: 'abc123'}}
  },
  runAttempt: 1,
  issueNumber: 42
}

const statusResult: StatusResult = {
  pull_request_state: 'OPEN',
  head_sha: 'abc123',
  review_decision: 'APPROVED',
  total_approvals: 2,
  merge_state_status: 'CLEAN',
  mergeable_state: 'MERGEABLE',
  is_draft: false,
  commit_status: 'SUCCESS'
}

function clientStub(currentLabels: readonly string[] = []): GitHubClient {
  return {
    async getPullRequestStatus() {
      throw new Error('Unexpected status request')
    },
    async listIssueLabels() {
      return [...currentLabels]
    },
    async removeLabel(): Promise<void> {
      throw new Error('Unexpected label removal')
    },
    async addLabels(): Promise<void> {
      throw new Error('Unexpected label addition')
    }
  }
}

function coreWithInputs(
  values: Partial<Record<string, string>>,
  core: ActionsApi
): ActionsApi {
  return {
    ...core,
    getInput(name: string, options: InputOptions = {}): string {
      const value = values[name] ?? ''
      if (options.required === true && value.trim() === '') {
        throw new Error(`Input required and not supplied: ${name}`)
      }
      return options.trimWhitespace === false ? value : value.trim()
    }
  }
}

interface RunFixture {
  dependencies: MainDependencies
  recording: ReturnType<typeof createRecordingCore>
  createdTokens: string[]
  labelActions: Array<{add: string[]; remove: string[]}>
  callOrder: string[]
}

function createRunFixture(
  passed: boolean,
  inputOverrides: Partial<Record<string, string>> = {},
  currentLabels: readonly string[] = []
): RunFixture {
  const recording = createRecordingCore()
  const createdTokens: string[] = []
  const labelActions: Array<{add: string[]; remove: string[]}> = []
  const callOrder: string[] = []
  const client = clientStub(currentLabels)
  const values = {
    github_token: 'synthetic-secret-value',
    workflow: 'Pull request checks',
    checks: 'all',
    evaluations: 'approved',
    pass_labels: 'ready',
    pass_labels_cleanup: 'waiting',
    fail_labels: 'blocked',
    exclude_checks: 'self',
    pr_number: '42',
    noop_label: 'ready-for-noop',
    review_label: 'ready-for-review',
    deploy_label: 'ready-for-deployment',
    merge_label: 'ready-to-merge',
    clear_on_draft: 'true',
    demote_merge_on_review_failure: 'true',
    dry_run: 'false',
    ...inputOverrides
  }

  const dependencies: MainDependencies = {
    core: coreWithInputs(values, recording.core),
    loadContext(): ActionContext {
      callOrder.push('context')
      return context
    },
    createClient(token: string): GitHubClient {
      callOrder.push('client')
      createdTokens.push(token)
      return client
    },
    async status(receivedClient, receivedContext, number, data) {
      callOrder.push('status')
      assert.equal(receivedClient, client)
      assert.equal(receivedContext, context)
      assert.equal(number, 42)
      assert.deepEqual(data, {
        checks: 'all',
        excludeChecks: ['self'],
        currentCheckName: 'Pull request checks'
      })
      return statusResult
    },
    outputs(receivedStatus, data): boolean {
      callOrder.push('outputs')
      assert.equal(receivedStatus, statusResult)
      assert.deepEqual(data, {evaluations: ['approved']})
      return passed
    },
    stringToArray,
    determineLabelActions,
    determineBranchDeployState,
    resolveBranchDeployEvent() {
      throw new Error('Unexpected branch-deploy event resolution')
    },
    async label(
      number,
      receivedContext,
      receivedClient,
      labelsToAdd,
      labelsToRemove
    ): Promise<LabelResult> {
      callOrder.push('labels')
      assert.equal(number, 42)
      assert.equal(receivedContext, context)
      assert.equal(receivedClient, client)
      const action = {
        add: [...labelsToAdd],
        remove: [...labelsToRemove]
      }
      labelActions.push(action)
      return {added: action.add, removed: action.remove}
    }
  }

  return {
    dependencies,
    recording,
    createdTokens,
    labelActions,
    callOrder
  }
}

function setEnvironment(
  values: Record<string, string | undefined>
): () => void {
  const originalValues = new Map<string, string | undefined>()

  for (const [name, value] of Object.entries(values)) {
    originalValues.set(name, process.env[name])
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  return () => {
    for (const [name, value] of originalValues) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  }
}

async function waitForOutput(
  outputPath: string,
  expectedText: string
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const output = await readFile(outputPath, 'utf8')
    if (output.includes(expectedText)) {
      return output
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  throw new Error(`Timed out waiting for ${expectedText}`)
}

test('parseInputs validates and normalizes an explicit current check name', () => {
  const recording = createRecordingCore()
  const inputs = parseInputs(
    {
      core: coreWithInputs(
        {
          github_token: 'never-log-this-value',
          workflow: '  CI / evaluate (ubuntu-latest)  ',
          checks: 'required',
          evaluations: 'approved, ci_passing',
          pass_labels: 'ready, ready, done',
          pass_labels_cleanup: 'waiting',
          fail_labels: 'blocked',
          exclude_checks: 'self, docs',
          pr_number: '77'
        },
        recording.core
      ),
      stringToArray
    },
    context
  )

  assert.deepEqual(inputs, {
    mode: 'status',
    token: 'never-log-this-value',
    currentCheckName: 'CI / evaluate (ubuntu-latest)',
    checks: 'required',
    evaluations: ['approved', 'ci_passing'],
    passLabels: ['ready', 'ready', 'done'],
    passLabelsCleanup: ['waiting'],
    failLabels: ['blocked'],
    excludeChecks: ['self', 'docs'],
    prNumber: 77,
    branchDeploy: null
  })
  assert.doesNotMatch(
    [
      ...recording.debug,
      ...recording.info,
      ...recording.warning,
      ...recording.error
    ].join('\n'),
    /never-log-this-value/
  )
})

test('parseInputs falls back from an empty workflow input to the context job', () => {
  const recording = createRecordingCore()
  const inputs = parseInputs(
    {
      core: coreWithInputs(
        {github_token: 'value', checks: 'all'},
        recording.core
      ),
      stringToArray
    },
    context
  )

  assert.equal(inputs.currentCheckName, context.job)
  assert.equal(inputs.prNumber, context.issueNumber)
  assert.deepEqual(inputs.evaluations, [])
})

test('parseInputs rejects invalid configuration', () => {
  const recording = createRecordingCore()
  const parse = (
    values: Partial<Record<string, string>>,
    actionContext: ActionContext = context
  ): unknown =>
    parseInputs(
      {
        core: coreWithInputs(
          {github_token: 'value', checks: 'all', ...values},
          recording.core
        ),
        stringToArray
      },
      actionContext
    )

  assert.throws(() => parse({checks: 'ALL'}), /checks must be exactly/)
  assert.throws(
    () => parse({evaluations: 'min_approvals=01'}),
    /Invalid evaluation criterion/
  )
  assert.throws(
    () => parse({pr_number: ''}, {...context, issueNumber: undefined}),
    /positive safe integer/
  )
  assert.throws(() => parse({mode: 'unknown'}), /mode must be exactly/)
  assert.throws(
    () =>
      parse({
        mode: 'branch-deploy',
        transition: 'reset',
        pass_labels: 'legacy'
      }),
    /branch-deploy mode cannot be combined/
  )
  assert.throws(
    () =>
      parse({
        mode: 'branch-deploy',
        transition: 'reset',
        pass_labels_cleanup: 'legacy'
      }),
    /branch-deploy mode cannot be combined/
  )
  assert.throws(
    () =>
      parse({
        mode: 'branch-deploy',
        transition: 'reset',
        fail_labels: 'legacy'
      }),
    /branch-deploy mode cannot be combined/
  )
})

test('parseInputs loads branch-deploy defaults and policy overrides', () => {
  const recording = createRecordingCore()
  const parse = (values: Partial<Record<string, string>>) =>
    parseInputs(
      {
        core: coreWithInputs(
          {
            github_token: 'value',
            checks: 'required',
            evaluations: 'approved,not_draft',
            mode: 'branch-deploy',
            pass_labels: '',
            pass_labels_cleanup: '',
            fail_labels: '',
            noop_label: 'ready-for-noop',
            review_label: 'ready-for-review',
            deploy_label: 'ready-for-deployment',
            merge_label: 'ready-to-merge',
            clear_on_draft: 'true',
            demote_merge_on_review_failure: 'true',
            dry_run: 'false',
            ...values
          },
          recording.core
        ),
        stringToArray
      },
      context
    )

  assert.deepEqual(parse({transition: 'review'}).branchDeploy, {
    source: 'explicit',
    configuration: {
      transition: 'review',
      expectedHeadSha: '',
      operationResult: null,
      preserveAdvancedReset: false,
      labels: {
        noop: 'ready-for-noop',
        review: 'ready-for-review',
        deploy: 'ready-for-deployment',
        merge: 'ready-to-merge'
      },
      clearOnDraft: true,
      demoteMergeOnReviewFailure: true,
      dryRun: false
    }
  })

  assert.deepEqual(
    parse({
      transition: 'deploy',
      expected_head_sha: 'abc123',
      operation_result: 'failure',
      noop_label: 'noop',
      review_label: 'review',
      deploy_label: 'deploy',
      merge_label: 'merge',
      clear_on_draft: 'false',
      demote_merge_on_review_failure: 'false',
      dry_run: 'true'
    }).branchDeploy,
    {
      source: 'explicit',
      configuration: {
        transition: 'deploy',
        expectedHeadSha: 'abc123',
        operationResult: 'failure',
        preserveAdvancedReset: false,
        labels: {
          noop: 'noop',
          review: 'review',
          deploy: 'deploy',
          merge: 'merge'
        },
        clearOnDraft: false,
        demoteMergeOnReviewFailure: false,
        dryRun: true
      }
    }
  )
  assert.throws(
    () => parse({transition: 'review', noop_label: ''}),
    /branch-deploy labels must not be empty/
  )

  assert.deepEqual(parse({transition: '', pr_number: ''}).branchDeploy, {
    source: 'event',
    policy: {
      labels: {
        noop: 'ready-for-noop',
        review: 'ready-for-review',
        deploy: 'ready-for-deployment',
        merge: 'ready-to-merge'
      },
      clearOnDraft: true,
      demoteMergeOnReviewFailure: true,
      dryRun: false
    }
  })
  assert.equal(parse({transition: '', pr_number: ''}).prNumber, null)
})

test('label action logging covers additions, removals, and no-op results', () => {
  const recording = createRecordingCore()
  logLabelActions(['ready'], [], recording.core)
  logLabelActions([], ['blocked'], recording.core)
  logLabelActions(['ready'], ['blocked'], recording.core)
  logLabelActions([], [], recording.core)

  assert.deepEqual(recording.info, [
    '🏷️ Labels to add: ready',
    '🏷️ Labels to remove: blocked',
    '🏷️ Labels to add: ready',
    '🏷️ Labels to remove: blocked',
    '🏷️ No label changes needed'
  ])
})

test('safeErrorMessage handles unknown errors and redacts credentials', () => {
  assert.equal(
    safeErrorMessage(
      new Error('request used exact-token and Bearer other-token'),
      'exact-token'
    ),
    'request used [REDACTED] and Bearer [REDACTED]'
  )
  assert.equal(safeErrorMessage('plain failure', ''), 'plain failure')
  assert.equal(safeErrorMessage({failure: true}), 'Unknown error')
  assert.equal(safeErrorMessage('Bearer visible'), 'Bearer [REDACTED]')
})

test('run keeps legitimate PASS and FAIL evaluations successful', async () => {
  const passing = createRunFixture(true)
  assert.equal(await run(passing.dependencies), 'success')
  assert.deepEqual(passing.createdTokens, ['synthetic-secret-value'])
  assert.deepEqual(passing.labelActions, [
    {add: ['ready'], remove: ['blocked', 'waiting']}
  ])
  assert.deepEqual(passing.callOrder, [
    'context',
    'client',
    'status',
    'outputs',
    'labels'
  ])

  const failing = createRunFixture(false)
  assert.equal(await run(failing.dependencies), 'success')
  assert.deepEqual(failing.labelActions, [
    {add: ['blocked'], remove: ['ready']}
  ])
  assert.ok(failing.recording.info.some(message => message.includes('FAIL')))
  assert.deepEqual(failing.recording.failed, [])
})

test('run reconciles branch-deploy labels from live state', async () => {
  const fixture = createRunFixture(
    true,
    {
      mode: 'branch-deploy',
      transition: 'noop',
      expected_head_sha: 'abc123',
      operation_result: 'success',
      pass_labels: '',
      pass_labels_cleanup: '',
      fail_labels: ''
    },
    ['ready-for-review', 'unrelated']
  )

  assert.equal(await run(fixture.dependencies), 'success')
  assert.deepEqual(fixture.labelActions, [
    {
      add: ['ready-for-deployment'],
      remove: ['ready-for-review']
    }
  ])
  assert.equal(fixture.recording.outputs.get('branch_deploy_state'), 'deploy')
  assert.equal(fixture.recording.outputs.get('head_matches'), 'true')
})

test('run resolves branch-deploy transitions from the caller event', async () => {
  const fixture = createRunFixture(true, {
    mode: 'branch-deploy',
    transition: '',
    pr_number: '',
    pass_labels: '',
    pass_labels_cleanup: '',
    fail_labels: ''
  })
  fixture.dependencies.resolveBranchDeployEvent = receivedContext => {
    fixture.callOrder.push('resolve')
    assert.equal(receivedContext, context)
    return {
      shouldReconcile: true,
      transition: 'reset',
      prNumber: 42,
      expectedHeadSha: 'abc123',
      operationResult: null,
      preserveAdvancedReset: false
    }
  }

  assert.equal(await run(fixture.dependencies), 'success')
  assert.deepEqual(fixture.callOrder, [
    'context',
    'client',
    'resolve',
    'status',
    'outputs',
    'labels'
  ])
  assert.deepEqual(fixture.labelActions, [
    {add: ['ready-for-noop'], remove: []}
  ])
  assert.equal(
    fixture.recording.outputs.get('branch_deploy_reconciled'),
    'true'
  )
})

test('run succeeds without API evaluation when an event is not actionable', async () => {
  const fixture = createRunFixture(true, {
    mode: 'branch-deploy',
    transition: '',
    pr_number: '',
    pass_labels: '',
    pass_labels_cleanup: '',
    fail_labels: ''
  })
  fixture.dependencies.resolveBranchDeployEvent = () => {
    fixture.callOrder.push('resolve')
    return {
      shouldReconcile: false,
      reason: 'no matching command'
    }
  }

  assert.equal(await run(fixture.dependencies), 'success')
  assert.deepEqual(fixture.callOrder, ['context', 'client', 'resolve'])
  assert.deepEqual(fixture.labelActions, [])
  assert.equal(
    fixture.recording.outputs.get('branch_deploy_reconciled'),
    'false'
  )
  assert.ok(
    fixture.recording.info.some(message =>
      message.includes('no matching command')
    )
  )
})

test('run ignores a native reset for a stale event head', async () => {
  const fixture = createRunFixture(
    true,
    {
      mode: 'branch-deploy',
      transition: '',
      pr_number: '',
      pass_labels: '',
      pass_labels_cleanup: '',
      fail_labels: ''
    },
    ['ready-for-review']
  )
  fixture.dependencies.resolveBranchDeployEvent = () => {
    fixture.callOrder.push('resolve')
    return {
      shouldReconcile: true,
      transition: 'reset',
      prNumber: 42,
      expectedHeadSha: 'old-head',
      operationResult: null,
      preserveAdvancedReset: false
    }
  }

  assert.equal(await run(fixture.dependencies), 'success')
  assert.deepEqual(fixture.callOrder, [
    'context',
    'client',
    'resolve',
    'status',
    'outputs'
  ])
  assert.deepEqual(fixture.labelActions, [])
  assert.equal(fixture.recording.outputs.get('branch_deploy_state'), 'review')
  assert.equal(fixture.recording.outputs.get('head_matches'), 'false')
  assert.equal(
    fixture.recording.outputs.get('branch_deploy_reconciled'),
    'false'
  )
})

test('run fails when event resolution does not provide a pull request number', async () => {
  const fixture = createRunFixture(true, {
    mode: 'branch-deploy',
    transition: '',
    pr_number: '',
    pass_labels: '',
    pass_labels_cleanup: '',
    fail_labels: ''
  })
  fixture.dependencies.resolveBranchDeployEvent = () => ({
    shouldReconcile: true,
    transition: 'review',
    prNumber: null as unknown as number,
    expectedHeadSha: '',
    operationResult: null,
    preserveAdvancedReset: false
  })

  assert.equal(await run(fixture.dependencies), 'failure')
  assert.match(
    String(fixture.recording.failed[0]),
    /pull request number could not be resolved/u
  )
})

test('run reports non-command dry runs without mutating labels', async () => {
  const fixture = createRunFixture(
    false,
    {
      mode: 'branch-deploy',
      transition: 'review',
      dry_run: 'true',
      pass_labels: '',
      pass_labels_cleanup: '',
      fail_labels: ''
    },
    ['ready-for-deployment']
  )

  assert.equal(await run(fixture.dependencies), 'success')
  assert.deepEqual(fixture.labelActions, [])
  assert.equal(fixture.recording.outputs.get('branch_deploy_state'), 'review')
  assert.equal(fixture.recording.outputs.get('head_matches'), '')
  assert.ok(
    fixture.recording.info.some(message => message.includes('Dry run enabled'))
  )
})

test('run reports a stale branch-deploy command', async () => {
  const fixture = createRunFixture(
    true,
    {
      mode: 'branch-deploy',
      transition: 'noop',
      expected_head_sha: 'old-head',
      operation_result: 'success',
      pass_labels: '',
      pass_labels_cleanup: '',
      fail_labels: ''
    },
    ['ready-for-review']
  )

  assert.equal(await run(fixture.dependencies), 'success')
  assert.equal(fixture.recording.outputs.get('branch_deploy_state'), 'noop')
  assert.equal(fixture.recording.outputs.get('head_matches'), 'false')
})

test('run validates inputs before creating a GitHub client', async () => {
  const fixture = createRunFixture(true, {evaluations: 'unknown'})

  assert.equal(await run(fixture.dependencies), 'failure')
  assert.deepEqual(fixture.createdTokens, [])
  assert.deepEqual(fixture.callOrder, ['context'])
  assert.match(
    String(fixture.recording.failed[0]),
    /Invalid evaluation criterion/
  )
})

test('run writes diagnostic outputs before a label failure and redacts it', async () => {
  const fixture = createRunFixture(true)
  fixture.dependencies.label = async () => {
    fixture.callOrder.push('labels')
    throw new Error(
      'mutation exposed synthetic-secret-value and Bearer secondary-token'
    )
  }

  assert.equal(await run(fixture.dependencies), 'failure')
  assert.deepEqual(fixture.callOrder, [
    'context',
    'client',
    'status',
    'outputs',
    'labels'
  ])
  assert.equal(fixture.recording.failed.length, 1)
  const failure = String(fixture.recording.failed[0])
  assert.doesNotMatch(failure, /synthetic-secret-value|secondary-token/)
  assert.match(failure, /\[REDACTED\]/)
})

test('run marks context failures before reading sensitive inputs', async () => {
  const fixture = createRunFixture(true)
  fixture.dependencies.loadContext = () => {
    throw 'context unavailable'
  }

  assert.equal(await run(fixture.dependencies), 'failure')
  assert.deepEqual(fixture.createdTokens, [])
  assert.match(String(fixture.recording.failed[0]), /context unavailable/)
})

test('native bundled-style entrypoint executes with read-only API behavior', async t => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pr-status-main-'))
  const eventPath = join(temporaryRoot, 'event.json')
  const outputPath = join(temporaryRoot, 'output.txt')
  const requests: Array<{url: string; init: RequestInit | undefined}> = []
  const loggedLines: string[] = []

  await writeFile(eventPath, JSON.stringify({pull_request: {number: 321}}))
  await writeFile(outputPath, '')

  const restoreEnvironment = setEnvironment({
    GITHUB_ACTIONS: 'true',
    GITHUB_API_URL: 'https://api.github.com',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql',
    GITHUB_JOB: 'integration',
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'octocat/example',
    GITHUB_RUN_ATTEMPT: '1',
    INPUT_GITHUB_TOKEN: 'synthetic-entrypoint-value',
    INPUT_WORKFLOW: '',
    INPUT_CHECKS: 'all',
    INPUT_EVALUATIONS: 'not_draft',
    INPUT_PASS_LABELS: '',
    INPUT_PASS_LABELS_CLEANUP: '',
    INPUT_FAIL_LABELS: '',
    INPUT_EXCLUDE_CHECKS: '',
    INPUT_PR_NUMBER: ''
  })

  t.mock.method(console, 'log', (message: unknown): void => {
    loggedLines.push(String(message))
  })
  t.mock.method(
    globalThis,
    'fetch',
    async (
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      requests.push({url: String(input), init})
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                state: 'OPEN',
                headRefOid: 'abc123',
                reviewDecision: 'APPROVED',
                mergeStateStatus: 'CLEAN',
                mergeable: 'MERGEABLE',
                isDraft: false,
                commits: {
                  nodes: [{commit: {statusCheckRollup: null}}]
                },
                latestReviews: {
                  nodes: [
                    {
                      state: 'APPROVED',
                      author: {__typename: 'User', login: 'octocat'}
                    }
                  ],
                  pageInfo: {hasNextPage: false, endCursor: null}
                }
              }
            }
          }
        }),
        {status: 200, headers: {'content-type': 'application/json'}}
      )
    }
  )

  try {
    const entrypoint = await import(`../src/index.ts?run=${Date.now()}`)
    const actionOutput = await waitForOutput(outputPath, 'evaluation<<')

    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.url, 'https://api.github.com/graphql')
    const requestHeaders = new Headers(requests[0]?.init?.headers)
    assert.equal(
      requestHeaders.get('authorization'),
      'Bearer synthetic-entrypoint-value'
    )
    const requestBody = JSON.parse(String(requests[0]?.init?.body)) as {
      variables: Record<string, unknown>
    }
    assert.deepEqual(requestBody.variables, {
      owner: 'octocat',
      repo: 'example',
      number: 321,
      checksCursor: null,
      reviewsCursor: null,
      includeChecks: true,
      includeReviews: true
    })
    assert.match(actionOutput, /commit_status<<ghadelimiter_/)
    assert.match(actionOutput, /\nUNKNOWN\nghadelimiter_/)
    assert.match(actionOutput, /total_approvals<<ghadelimiter_/)
    assert.match(actionOutput, /\n1\nghadelimiter_/)
    assert.match(actionOutput, /evaluation<<ghadelimiter_/)
    assert.match(actionOutput, /\nPASS\nghadelimiter_/)
    assert.doesNotMatch(
      `${actionOutput}\n${loggedLines.join('\n')}`,
      /synthetic-entrypoint-value/
    )

    const started = t.mock.fn(async (): Promise<void> => {})
    entrypoint.startEntrypoint(started)
    assert.equal(started.mock.callCount(), 1)
  } finally {
    restoreEnvironment()
    await rm(temporaryRoot, {recursive: true, force: true})
  }
})
