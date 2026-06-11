import assert from 'node:assert/strict'
import test from 'node:test'

import {status} from '../../src/functions/status.ts'
import type {
  ActionContext,
  GraphqlClient,
  StatusResult
} from '../../src/types.ts'
import {createRecordingCore, includesMessage} from './helpers.ts'

interface CheckFixture {
  isRequired?: boolean | null
  conclusion?: string | null
  status?: string | null
  state?: string | null
  name?: string | null
  context?: string | null
  [key: string]: unknown
}

interface ResultOptions {
  reviewDecision?: string | null
  totalApprovals?: number | null
  mergeStateStatus?: string | null
  mergeable?: string | null
  isDraft?: boolean | null
  checkSuiteCount?: number
  rollupState?: string | null
}

interface GraphqlRecording {
  client: GraphqlClient
  calls: Array<{query: string; variables: Record<string, unknown>}>
}

function createResult(
  checks: CheckFixture[],
  options: ResultOptions = {}
): unknown {
  const {
    reviewDecision = 'APPROVED',
    totalApprovals = 1,
    mergeStateStatus = 'CLEAN',
    mergeable = 'MERGEABLE',
    isDraft = false,
    checkSuiteCount = checks.length === 0 ? 0 : 1,
    rollupState = 'SUCCESS'
  } = options

  return {
    repository: {
      pullRequest: {
        reviewDecision,
        mergeStateStatus,
        mergeable,
        isDraft,
        reviews: {totalCount: totalApprovals},
        commits: {
          nodes: [
            {
              commit: {
                checkSuites: {totalCount: checkSuiteCount},
                statusCheckRollup: {
                  state: rollupState,
                  contexts: {nodes: checks}
                }
              }
            }
          ]
        }
      }
    }
  }
}

function createGraphql(response: unknown): GraphqlRecording {
  const calls: Array<{query: string; variables: Record<string, unknown>}> = []
  const client: GraphqlClient = {
    async graphql(query, variables) {
      calls.push({query, variables})
      return response
    }
  }
  return {client, calls}
}

function createRejectingGraphql(reason: unknown): GraphqlClient {
  return {
    async graphql() {
      throw reason
    }
  }
}

const context: ActionContext = {
  workflow: 'pr-status / test',
  repo: {owner: 'octocat', repo: 'example'}
}

const passingResult: StatusResult = {
  review_decision: 'APPROVED',
  total_approvals: 1,
  merge_state_status: 'CLEAN',
  mergeable_state: 'MERGEABLE',
  is_draft: false,
  commit_status: 'SUCCESS'
}

test('gets PR metadata and treats successful, skipped, and neutral checks as successful', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([
      {isRequired: true, conclusion: 'success', name: 'build'},
      {isRequired: false, conclusion: 'SKIPPED', name: 'docs'},
      {isRequired: false, conclusion: 'NEUTRAL', name: 'analysis'},
      {isRequired: false, state: 'SUCCESS', context: 'legacy-status'}
    ])
  )

  const result = await status(
    graphql.client,
    context,
    '42',
    {checks: 'all'},
    {core: recording.core}
  )

  assert.deepEqual(result, passingResult)
  assert.equal(graphql.calls.length, 1)
  const call = graphql.calls[0]
  assert.ok(call)
  assert.match(call.query, /contexts\(first:100\)/)
  assert.deepEqual(call.variables, {
    owner: 'octocat',
    name: 'example',
    number: 42,
    headers: {Accept: 'application/vnd.github.merge-info-preview+json'}
  })
  assert.ok(includesMessage(recording.info, 'Found 4 total CI checks'))
  assert.ok(
    includesMessage(
      recording.info,
      'check: legacy-status (optional) - state: SUCCESS'
    )
  )
  assert.ok(includesMessage(recording.info, 'Overall CI status: SUCCESS'))
})

test('uses the rollup state when any check is not successful', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult(
      [
        {isRequired: true, conclusion: 'FAILURE', name: 'build'},
        {
          isRequired: false,
          conclusion: null,
          status: 'IN_PROGRESS',
          name: 'integration'
        }
      ],
      {rollupState: 'PENDING'}
    )
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all', excludeChecks: []},
    {core: recording.core}
  )

  assert.equal(result.commit_status, 'PENDING')
  assert.ok(
    includesMessage(recording.info, 'integration (optional) - state: IN_PROGRESS')
  )
  assert.ok(includesMessage(recording.info, "Check 'build': FAILURE (FAILING)"))
  assert.ok(includesMessage(recording.info, 'Overall CI status: PENDING'))
})

test('evaluates only required checks and reports required failures', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([
      {isRequired: true, conclusion: 'SUCCESS', name: 'required-pass'},
      {isRequired: true, conclusion: 'FAILURE', name: 'required-fail'},
      {isRequired: false, conclusion: 'FAILURE', name: 'optional-fail'}
    ])
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'required'},
    {core: recording.core}
  )

  assert.equal(result.commit_status, 'FAILURE')
  assert.ok(
    includesMessage(recording.info, "Required check 'required-pass': SUCCESS")
  )
  assert.ok(
    includesMessage(
      recording.info,
      "Required check 'required-fail': FAILURE (FAILING)"
    )
  )
  assert.ok(
    includesMessage(recording.info, 'Overall required checks status: FAILURE')
  )
})

test('reports successful required checks', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([
      {isRequired: true, conclusion: 'SUCCESS', name: 'required-pass'},
      {isRequired: false, conclusion: 'FAILURE', name: 'optional-fail'}
    ])
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'required'},
    {core: recording.core}
  )

  assert.equal(result.commit_status, 'SUCCESS')
  assert.ok(
    includesMessage(recording.info, 'Overall required checks status: SUCCESS')
  )
})

test('uses exact exclusions and automatically excludes the workflow check', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([
      {isRequired: true, conclusion: 'FAILURE', name: 'test'},
      {isRequired: true, conclusion: 'SUCCESS', name: 'test foo'},
      {isRequired: true, conclusion: 'SUCCESS', name: 'test bar'},
      {isRequired: true, conclusion: 'FAILURE', name: 'ci-workflow'}
    ])
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all', excludeChecks: ['test'], workflow: 'ci-workflow'},
    {core: recording.core}
  )

  assert.equal(result.commit_status, 'SUCCESS')
  assert.ok(includesMessage(recording.info, 'Excluding check from status evaluation: test'))
  assert.ok(
    includesMessage(
      recording.info,
      'Excluding check from status evaluation: ci-workflow'
    )
  )
  assert.ok(includesMessage(recording.info, 'Evaluating 2 total checks'))
})

test('returns null when every check is excluded in all-checks mode', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([{isRequired: true, conclusion: 'SUCCESS', name: 'build'}])
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all', excludeChecks: ['build']},
    {core: recording.core}
  )

  assert.equal(result.commit_status, null)
  assert.ok(includesMessage(recording.info, 'No CI checks found after filtering'))
})

test('returns success when no required checks remain after filtering', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([{isRequired: true, conclusion: 'SUCCESS', name: 'build'}])
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'required', excludeChecks: ['build']},
    {core: recording.core}
  )

  assert.equal(result.commit_status, 'SUCCESS')
  assert.ok(includesMessage(recording.info, 'No required checks found after filtering'))
})

test('returns null when GitHub reports no check suites and applies metadata defaults', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult([], {
      reviewDecision: null,
      totalApprovals: 0,
      mergeStateStatus: null,
      mergeable: null,
      isDraft: null,
      checkSuiteCount: 0,
      rollupState: null
    })
  )

  const result = await status(
    graphql.client,
    {repo: context.repo},
    42,
    {checks: 'all'},
    {core: recording.core}
  )

  assert.deepEqual(result, {
    review_decision: null,
    total_approvals: null,
    merge_state_status: null,
    mergeable_state: null,
    is_draft: false,
    commit_status: null
  })
  assert.ok(includesMessage(recording.info, 'No CI checks have been defined'))
  assert.ok(includesMessage(recording.info, 'pr-status'))
})

test('returns null when a check suite contains no contexts', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(createResult([], {checkSuiteCount: 1}))

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all'},
    {core: recording.core}
  )

  assert.equal(result.commit_status, null)
  assert.ok(includesMessage(recording.info, 'No CI checks found on this pull request'))
})

test('includes unknown check names and logs unknown check fields', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult(
      [
        {
          isRequired: true,
          conclusion: null,
          status: null,
          state: null,
          ignored: null,
          available: 'value'
        }
      ],
      {rollupState: 'SUCCESS'}
    )
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all', excludeChecks: ['not-this-check']},
    {core: recording.core}
  )

  assert.equal(result.commit_status, 'SUCCESS')
  assert.ok(includesMessage(recording.debug, 'Check status is UNKNOWN'))
  assert.ok(includesMessage(recording.debug, 'Available fields:'))
  assert.ok(
    includesMessage(recording.debug, 'unknown name found, including in evaluation')
  )
})

test('uses FAILURE in the status log when a failing rollup has no state', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql(
    createResult(
      [{isRequired: true, conclusion: 'FAILURE', name: 'build'}],
      {rollupState: null}
    )
  )

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all'},
    {core: recording.core}
  )

  assert.equal(result.commit_status, null)
  assert.ok(includesMessage(recording.info, 'Overall CI status: FAILURE'))
})

test('degrades malformed commit-status data to null and logs the response', async () => {
  const recording = createRecordingCore()
  const graphql = createGraphql({
    repository: {
      pullRequest: {
        reviewDecision: 'APPROVED',
        mergeStateStatus: 'CLEAN',
        mergeable: 'MERGEABLE',
        isDraft: true,
        reviews: {totalCount: 3}
      }
    }
  })

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all'},
    {core: recording.core}
  )

  assert.deepEqual(result, {
    review_decision: 'APPROVED',
    total_approvals: 3,
    merge_state_status: 'CLEAN',
    mergeable_state: 'MERGEABLE',
    is_draft: true,
    commit_status: null
  })
  assert.ok(includesMessage(recording.warning, 'Could not retrieve PR commit status'))
  assert.ok(includesMessage(recording.debug, 'Raw GraphQL result'))
})

test('handles a circular malformed response without trying to serialize it', async () => {
  const recording = createRecordingCore()
  const circular: Record<string, unknown> = {}
  circular.repository = circular
  const graphql = createGraphql(circular)

  const result = await status(
    graphql.client,
    context,
    42,
    {checks: 'all'},
    {core: recording.core}
  )

  assert.equal(result.commit_status, null)
  assert.ok(includesMessage(recording.debug, 'Could not output raw GraphQL result'))
})

test('logs and rethrows GraphQL Error failures', async () => {
  const recording = createRecordingCore()
  const expected = new Error('GraphQL query failed')

  await assert.rejects(
    status(
      createRejectingGraphql(expected),
      context,
      42,
      {checks: 'all'},
      {core: recording.core}
    ),
    expected
  )
  assert.ok(includesMessage(recording.error, 'Failed to fetch PR status'))
  assert.ok(includesMessage(recording.debug, 'Error details:'))
})
