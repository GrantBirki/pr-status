import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import type {ActionsApi, InputOptions} from '../src/actions.ts'
import type {ActionContext} from '../src/context.ts'
import {determineLabelActions} from '../src/functions/label.ts'
import type {LabelResult} from '../src/functions/label.ts'
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
  workflow: 'Pull request checks',
  issueNumber: 42
}

const statusResult: StatusResult = {
  review_decision: 'APPROVED',
  total_approvals: 2,
  merge_state_status: 'CLEAN',
  mergeable_state: 'MERGEABLE',
  is_draft: false,
  commit_status: 'SUCCESS'
}

function clientStub(): GitHubClient {
  return {
    async getPullRequestStatus() {
      throw new Error('Unexpected status request')
    },
    async listIssueLabels() {
      throw new Error('Unexpected label request')
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
  inputOverrides: Partial<Record<string, string>> = {}
): RunFixture {
  const recording = createRecordingCore()
  const createdTokens: string[] = []
  const labelActions: Array<{add: string[]; remove: string[]}> = []
  const callOrder: string[] = []
  const client = clientStub()
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
        workflow: 'Pull request checks'
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

test('parseInputs validates and normalizes explicit action inputs', () => {
  const recording = createRecordingCore()
  const inputs = parseInputs(
    {
      core: coreWithInputs(
        {
          github_token: 'never-log-this-value',
          workflow: 'Explicit workflow',
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
    token: 'never-log-this-value',
    workflow: 'Explicit workflow',
    checks: 'required',
    evaluations: ['approved', 'ci_passing'],
    passLabels: ['ready', 'ready', 'done'],
    passLabelsCleanup: ['waiting'],
    failLabels: ['blocked'],
    excludeChecks: ['self', 'docs'],
    prNumber: 77
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

test('parseInputs supports context fallbacks and an empty evaluation list', () => {
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

  assert.equal(inputs.workflow, context.workflow)
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
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_GRAPHQL_URL: 'https://api.github.com/graphql',
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'octocat/example',
    GITHUB_WORKFLOW: 'Integration workflow',
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
