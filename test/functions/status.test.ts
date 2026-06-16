import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateCheckStatuses,
  countUniqueApprovals,
  determineCommitStatus,
  normalizeCheckStatus,
  parseCheckSelection,
  parsePullRequestNumber,
  status
} from '../../src/functions/status.ts'
import type {
  GitHubCheck,
  GitHubReview,
  PullRequestStatusClient,
  PullRequestStatusData
} from '../../src/functions/status.ts'
import {createRecordingCore, includesMessage} from './helpers.ts'

function checkRun(
  name: string,
  conclusion: string | null,
  statusValue = conclusion === null ? 'IN_PROGRESS' : 'COMPLETED',
  isRequired = true
): GitHubCheck {
  return {
    __typename: 'CheckRun',
    name,
    isRequired,
    conclusion,
    status: statusValue
  }
}

function statusContext(
  context: string,
  state: string | null,
  isRequired = true
): GitHubCheck {
  return {__typename: 'StatusContext', context, isRequired, state}
}

function review(
  login: string,
  state = 'APPROVED',
  typename = 'User'
): GitHubReview {
  return {state, author: {__typename: typename, login}}
}

function pullRequest(
  overrides: Partial<PullRequestStatusData> = {}
): PullRequestStatusData {
  return {
    state: 'OPEN',
    headRefOid: 'abc123',
    reviewDecision: 'APPROVED',
    mergeStateStatus: 'CLEAN',
    mergeable: 'MERGEABLE',
    isDraft: false,
    checks: [checkRun('build', 'SUCCESS')],
    latestReviews: [review('octocat')],
    ...overrides
  }
}

function recordingClient(response: PullRequestStatusData): {
  client: PullRequestStatusClient
  requests: Array<{owner: string; repo: string; number: number}>
} {
  const requests: Array<{owner: string; repo: string; number: number}> = []
  return {
    requests,
    client: {
      async getPullRequestStatus(request) {
        requests.push(request)
        return response
      }
    }
  }
}

test('parses only positive safe pull request numbers', () => {
  assert.equal(parsePullRequestNumber('42'), 42)
  assert.equal(parsePullRequestNumber(7), 7)

  for (const invalid of [
    null,
    true,
    '',
    '   ',
    'not-a-number',
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.throws(
      () => parsePullRequestNumber(invalid),
      /pr_number must be a positive safe integer/
    )
  }
})

test('accepts only exact check selections', () => {
  assert.equal(parseCheckSelection('all'), 'all')
  assert.equal(parseCheckSelection('required'), 'required')
  assert.throws(
    () => parseCheckSelection('ALL'),
    /checks must be exactly 'all' or 'required'/
  )
})

test('normalizes every documented successful check state', () => {
  for (const state of ['SUCCESS', 'SKIPPED', 'NEUTRAL']) {
    assert.equal(normalizeCheckStatus(statusContext(state, state)), 'SUCCESS')
    assert.equal(normalizeCheckStatus(checkRun(state, state)), 'SUCCESS')
  }
})

test('normalizes every documented pending check state', () => {
  for (const state of [
    'PENDING',
    'EXPECTED',
    'QUEUED',
    'IN_PROGRESS',
    'WAITING',
    'REQUESTED'
  ]) {
    assert.equal(normalizeCheckStatus(statusContext(state, state)), 'PENDING')
    assert.equal(normalizeCheckStatus(checkRun(state, null, state)), 'PENDING')
  }
})

test('normalizes every documented failing check state', () => {
  for (const state of [
    'FAILURE',
    'ERROR',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
    'STALE'
  ]) {
    assert.equal(normalizeCheckStatus(statusContext(state, state)), 'FAILURE')
    assert.equal(normalizeCheckStatus(checkRun(state, state)), 'FAILURE')
  }
})

test('normalizes missing, unrecognized, and inconsistent states to unknown', () => {
  assert.equal(normalizeCheckStatus(statusContext('missing', null)), 'UNKNOWN')
  assert.equal(normalizeCheckStatus(statusContext('new', 'NEW_STATE')), 'UNKNOWN')
  assert.equal(normalizeCheckStatus(statusContext('lower', 'success')), 'UNKNOWN')
  assert.equal(
    normalizeCheckStatus(checkRun('missing-conclusion', null, 'COMPLETED')),
    'UNKNOWN'
  )
  assert.equal(
    normalizeCheckStatus(checkRun('early-conclusion', 'SUCCESS', 'IN_PROGRESS')),
    'UNKNOWN'
  )
  assert.equal(
    normalizeCheckStatus(checkRun('pending-conclusion', 'PENDING', 'COMPLETED')),
    'UNKNOWN'
  )
  assert.equal(
    normalizeCheckStatus(checkRun('success-status', null, 'SUCCESS')),
    'UNKNOWN'
  )
  assert.equal(
    normalizeCheckStatus(checkRun('failure-status', null, 'FAILURE')),
    'UNKNOWN'
  )
})

test('aggregates checks using failure, unknown, pending, success precedence', () => {
  assert.equal(aggregateCheckStatuses([]), 'UNKNOWN')
  assert.equal(aggregateCheckStatuses(['SUCCESS']), 'SUCCESS')
  assert.equal(aggregateCheckStatuses(['SUCCESS', 'PENDING']), 'PENDING')
  assert.equal(
    aggregateCheckStatuses(['SUCCESS', 'PENDING', 'UNKNOWN']),
    'UNKNOWN'
  )
  assert.equal(
    aggregateCheckStatuses(['SUCCESS', 'PENDING', 'UNKNOWN', 'FAILURE']),
    'FAILURE'
  )
})

test('counts unique current approved humans and excludes bots', () => {
  assert.equal(
    countUniqueApprovals([
      review('alice'),
      review('alice'),
      review('bob', 'CHANGES_REQUESTED'),
      review('dependabot', 'APPROVED', 'Bot'),
      review('', 'APPROVED', 'User'),
      {state: 'APPROVED', author: null},
      review('carol', 'APPROVED', 'Mannequin')
    ]),
    2
  )
})

test('selects checks with exact configured and current-check exclusions', () => {
  const currentCheckName = 'Pull request checks / evaluate (ubuntu-latest)'
  const checks = [
    checkRun('build', 'FAILURE', 'COMPLETED', true),
    checkRun('Build', 'SUCCESS', 'COMPLETED', true),
    checkRun(currentCheckName, 'FAILURE', 'COMPLETED', true),
    statusContext('optional', 'PENDING', false)
  ]

  assert.equal(
    determineCommitStatus(
      checks,
      'required',
      [' build ', '', 'build'],
      ` ${currentCheckName} `
    ),
    'SUCCESS'
  )
  assert.equal(
    determineCommitStatus(checks, 'all', ['build'], currentCheckName),
    'PENDING'
  )
  assert.equal(
    determineCommitStatus(
      checks,
      'required',
      ['build'],
      currentCheckName.toUpperCase()
    ),
    'FAILURE'
  )
  assert.equal(
    determineCommitStatus(
      [statusContext('optional-only', 'SUCCESS', false)],
      'required',
      [],
      undefined
    ),
    'UNKNOWN'
  )
  assert.equal(determineCommitStatus([], 'all', [], undefined), 'UNKNOWN')
  assert.equal(determineCommitStatus([], 'all', [], '   '), 'UNKNOWN')
})

test('fetches status and excludes only the exact current check name', async () => {
  const core = createRecordingCore()
  const client = recordingClient(
    pullRequest({
      reviewDecision: null,
      mergeStateStatus: 'BLOCKED',
      mergeable: 'CONFLICTING',
      isDraft: true,
      checks: [
        checkRun('build', 'SUCCESS'),
        statusContext('Pull request checks', 'PENDING'),
        statusContext('evaluate (node 24)', 'FAILURE')
      ],
      latestReviews: [review('alice'), review('alice'), review('robot', 'APPROVED', 'Bot')]
    })
  )

  const result = await status(
    client.client,
    {repo: {owner: 'octocat', repo: 'example'}},
    '42',
    {
      checks: 'all',
      excludeChecks: [' docs ', 'docs'],
      currentCheckName: ' evaluate (node 24) '
    },
    {core: core.core}
  )

  assert.deepEqual(client.requests, [
    {owner: 'octocat', repo: 'example', number: 42}
  ])
  assert.deepEqual(result, {
    pull_request_state: 'OPEN',
    head_sha: 'abc123',
    review_decision: null,
    total_approvals: 1,
    merge_state_status: 'BLOCKED',
    mergeable_state: 'CONFLICTING',
    is_draft: true,
    commit_status: 'PENDING'
  })
  assert.ok(includesMessage(core.info, 'Fetching pull request status'))
  assert.ok(includesMessage(core.info, 'docs, evaluate (node 24)'))
  assert.ok(includesMessage(core.info, 'Commit Status: PENDING'))
  assert.ok(includesMessage(core.debug, '"total_approvals":1'))
})

test('omits an empty current check name from exclusion logging', async () => {
  const core = createRecordingCore()
  const client = recordingClient(pullRequest({checks: []}))

  const result = await status(
    client.client,
    {repo: {owner: 'octocat', repo: 'example'}},
    42,
    {checks: 'required', currentCheckName: '   '},
    {core: core.core}
  )

  assert.equal(result.commit_status, 'UNKNOWN')
  assert.ok(includesMessage(core.info, 'evaluation: '))
})

test('rejects invalid configuration before making an API request', async () => {
  const core = createRecordingCore()
  const client = recordingClient(pullRequest())

  await assert.rejects(
    status(
      client.client,
      {repo: {owner: 'octocat', repo: 'example'}},
      0,
      {checks: 'all'},
      {core: core.core}
    ),
    /pr_number/
  )
  await assert.rejects(
    status(
      client.client,
      {repo: {owner: 'octocat', repo: 'example'}},
      42,
      {checks: 'optional'},
      {core: core.core}
    ),
    /checks must be exactly/
  )
  assert.deepEqual(client.requests, [])
})

test('propagates client failures', async () => {
  const expected = new Error('request failed')
  const client: PullRequestStatusClient = {
    async getPullRequestStatus() {
      throw expected
    }
  }

  await assert.rejects(
    status(
      client,
      {repo: {owner: 'octocat', repo: 'example'}},
      42,
      {checks: 'all'},
      {core: createRecordingCore().core}
    ),
    expected
  )
})
