import assert from 'node:assert/strict'
import test from 'node:test'

import type {ActionContext} from '../../src/context.ts'
import {resolveBranchDeployEvent} from '../../src/functions/branch-deploy-event.ts'
import type {GitHubIssueComment} from '../../src/github.ts'

const eventTimestamp = '2026-01-02T03:04:05.000Z'
const statusCommentId = 600

const identity = {
  pr_number: 42,
  expected_head_sha: 'abc123',
  transition: 'noop',
  github_run_id: 100,
  github_run_attempt: 2,
  github_job: 'branch-deploy',
  command_comment_id: 500,
  stable_branch_used: false
} as const

function context(
  eventName: string,
  eventPayload: Record<string, unknown>
): ActionContext {
  return {
    repo: {owner: 'octocat', repo: 'example'},
    job: 'branch-deploy-status',
    eventName,
    eventPayload,
    issueNumber: undefined
  }
}

function pullRequestPayload(action: string): Record<string, unknown> {
  return {
    action,
    pull_request: {
      number: 42,
      head: {sha: 'abc123'},
      updated_at: eventTimestamp
    }
  }
}

function dispatchPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    action: 'branch-deploy-status',
    client_payload: {
      schema_version: 1,
      operation: {
        ...identity,
        stable_branch_used: undefined,
        operation_result: 'success',
        status_comment_id: statusCommentId,
        ...overrides
      }
    }
  }
}

function marker(overrides: Record<string, unknown> = {}): string {
  return `<!-- branch-deploy-status:${JSON.stringify({...identity, ...overrides})} -->`
}

function comment(
  body: string,
  id = 1,
  login = 'github-actions[bot]',
  type = 'Bot'
): GitHubIssueComment {
  return {id, body, user: {login, type}}
}

function client(
  commentPages: GitHubIssueComment[][],
  statusComment: GitHubIssueComment = comment(marker(), statusCommentId),
  issueUrl = 'https://api.github.com/repos/octocat/example/issues/42'
) {
  let calls = 0
  return {
    async getIssueComment(request: {
      owner: string
      repo: string
      commentId: number
    }) {
      assert.deepEqual(request, {
        owner: 'octocat',
        repo: 'example',
        commentId: statusCommentId
      })
      return {
        ...statusComment,
        issueUrl
      }
    },
    async listIssueComments(request: {
      owner: string
      repo: string
      number: number
      since?: string
    }) {
      assert.equal(request.owner, 'octocat')
      assert.equal(request.repo, 'example')
      assert.equal(request.number, 42)
      if (request.since !== undefined) {
        assert.equal(request.since, eventTimestamp)
      }
      const page = commentPages[Math.min(calls, commentPages.length - 1)]!
      calls += 1
      return page
    },
    calls: () => calls
  }
}

test('resolves pull request reset and clear lifecycle events', async () => {
  for (const action of [
    'opened',
    'reopened',
    'synchronize',
    'ready_for_review'
  ]) {
    assert.deepEqual(
      await resolveBranchDeployEvent(
        context('pull_request', pullRequestPayload(action)),
        client([[]])
      ),
      {
        shouldReconcile: true,
        transition: 'reset',
        prNumber: 42,
        expectedHeadSha: 'abc123',
        operationResult: null
      }
    )
  }

  for (const action of ['converted_to_draft', 'closed']) {
    assert.deepEqual(
      await resolveBranchDeployEvent(
        context('pull_request', pullRequestPayload(action)),
        client([[]])
      ),
      {
        shouldReconcile: true,
        transition: 'clear',
        prNumber: 42,
        expectedHeadSha: '',
        operationResult: null
      }
    )
  }
})

test('resolves submitted and dismissed pull request reviews', async () => {
  for (const action of ['submitted', 'dismissed']) {
    assert.deepEqual(
      await resolveBranchDeployEvent(
        context('pull_request_review', pullRequestPayload(action)),
        client([[]])
      ),
      {
        shouldReconcile: true,
        transition: 'review',
        prNumber: 42,
        expectedHeadSha: '',
        operationResult: null
      }
    )
  }
})

test('ignores unsupported events and actions without API requests', async () => {
  for (const fixture of [
    context('pull_request', pullRequestPayload('edited')),
    context('pull_request_review', pullRequestPayload('edited')),
    context('repository_dispatch', {action: 'other'}),
    context('push', {})
  ]) {
    const result = await resolveBranchDeployEvent(fixture, {
      async getIssueComment() {
        assert.fail('comments must not be queried')
      },
      async listIssueComments() {
        assert.fail('comments must not be queried')
      }
    })
    assert.equal(result.shouldReconcile, false)
    assert.match((result as {reason: string}).reason, /not a supported/u)
  }
})

test('validates supported pull request event data', async () => {
  const fixtures: Array<{
    payload: Record<string, unknown>
    message: RegExp
  }> = [
    {payload: {action: 'opened'}, message: /pull_request must be an object/u},
    {
      payload: {action: 'opened', pull_request: {number: 0}},
      message: /number must be a positive/u
    },
    {
      payload: {
        action: 'opened',
        pull_request: {number: 42, updated_at: eventTimestamp}
      },
      message: /head must be an object/u
    },
    {
      payload: {
        action: 'opened',
        pull_request: {
          number: 42,
          head: {sha: ''},
          updated_at: eventTimestamp
        }
      },
      message: /head\.sha must be a nonempty string/u
    },
    {
      payload: {
        action: 'opened',
        pull_request: {
          number: 42,
          head: {sha: 'abc123'},
          updated_at: 'yesterday'
        }
      },
      message: /updated_at must be an ISO 8601 UTC timestamp/u
    },
    {
      payload: {
        action: 'opened',
        pull_request: {
          number: 42,
          head: {sha: 'abc123'},
          updated_at: 'not-a-dateZ'
        }
      },
      message: /updated_at must be an ISO 8601 UTC timestamp/u
    }
  ]

  for (const fixture of fixtures) {
    await assert.rejects(
      resolveBranchDeployEvent(
        context('pull_request', fixture.payload),
        client([[]])
      ),
      fixture.message
    )
  }
})

test('resolves trusted noop and deploy repository dispatches', async () => {
  const status = comment(`before\n${marker()}\nafter`, statusCommentId)
  const noop = client([[status]], status)
  assert.deepEqual(
    await resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      noop
    ),
    {
      shouldReconcile: true,
      transition: 'noop',
      prNumber: 42,
      expectedHeadSha: 'abc123',
      operationResult: 'success'
    }
  )
  assert.equal(noop.calls(), 1)

  const deployIdentity = {transition: 'deploy'}
  const deployStatus = comment(marker(deployIdentity), statusCommentId)
  assert.deepEqual(
    await resolveBranchDeployEvent(
      context(
        'repository_dispatch',
        dispatchPayload({...deployIdentity, operation_result: 'failure'})
      ),
      client([[deployStatus]], deployStatus)
    ),
    {
      shouldReconcile: true,
      transition: 'deploy',
      prNumber: 42,
      expectedHeadSha: 'abc123',
      operationResult: 'failure'
    }
  )
})

test('verifies the exact status comment and its pull request ownership', async () => {
  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client([[]], comment(marker(), statusCommentId + 1))
    ),
    /status comment ID does not match/u
  )

  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client(
        [[]],
        comment(marker(), statusCommentId),
        'https://api.github.com/repos/octocat/example/issues/43'
      )
    ),
    /does not belong to the pull request/u
  )
})

test('ignores dispatches superseded by newer trusted status comments', async () => {
  const current = comment(marker(), statusCommentId)
  const newer = comment(
    marker({github_run_attempt: 3}),
    statusCommentId + 1
  )
  assert.deepEqual(
    await resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client([[current, newer]], current)
    ),
    {
      shouldReconcile: false,
      reason: 'a newer branch-deploy command exists for this pull request'
    }
  )

  const stable = comment(
    marker({stable_branch_used: true}),
    statusCommentId + 1
  )
  assert.equal(
    (
      await resolveBranchDeployEvent(
        context('repository_dispatch', dispatchPayload()),
        client([[current, stable]], current)
      )
    ).shouldReconcile,
    true
  )
})

test('ignores a replayed reset after a command owns the current head', async () => {
  const result = await resolveBranchDeployEvent(
    context('pull_request', pullRequestPayload('synchronize')),
    client([[comment(marker())]])
  )
  assert.deepEqual(result, {
    shouldReconcile: false,
    reason: 'a branch-deploy command already owns this pull request head'
  })
})

test('ignores untrusted markers and rejects malformed trusted markers', async () => {
  for (const untrusted of [
    {...comment(marker(), statusCommentId), user: null},
    comment(marker(), statusCommentId, 'octocat', 'User'),
    comment(marker(), statusCommentId, 'another[bot]', 'Bot'),
    comment(marker(), statusCommentId, 'github-actions[bot]', 'User')
  ]) {
    await assert.rejects(
      resolveBranchDeployEvent(
        context('repository_dispatch', dispatchPayload()),
        client([[untrusted]], untrusted)
      ),
      /no matching trusted/u
    )
  }

  const malformed = comment(
    '<!-- branch-deploy-status:{ -->',
    statusCommentId
  )
  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client([[malformed]], malformed)
    ),
    /invalid JSON/u
  )

  const duplicate = comment(
    `${marker()}\n${marker()}`,
    statusCommentId
  )
  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client([[duplicate]], duplicate)
    ),
    /no matching trusted/u
  )
})

test('rejects malformed dispatch and marker fields', async () => {
  const fixtures: Array<{field: string; value: unknown; message: RegExp}> = [
    {field: 'pr_number', value: 0, message: /pr_number must be a positive/u},
    {field: 'expected_head_sha', value: '', message: /expected_head_sha must be a nonempty/u},
    {field: 'transition', value: 'reset', message: /must be exactly 'noop' or 'deploy'/u},
    {field: 'operation_result', value: 'cancelled', message: /must be exactly 'success' or 'failure'/u},
    {field: 'github_run_id', value: 0, message: /github_run_id must be a positive/u},
    {field: 'github_run_attempt', value: 0, message: /github_run_attempt must be a positive/u},
    {field: 'github_job', value: '', message: /github_job must be a nonempty/u},
    {field: 'command_comment_id', value: 0, message: /command_comment_id must be a positive/u},
    {field: 'status_comment_id', value: 0, message: /status_comment_id must be a positive/u}
  ]

  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', {action: 'branch-deploy-status'}),
      client([[]])
    ),
    /client_payload must be an object/u
  )

  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', {
        action: 'branch-deploy-status',
        client_payload: {schema_version: 2, operation: {}}
      }),
      client([[]])
    ),
    /schema_version must be exactly 1/u
  )

  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', {
        action: 'branch-deploy-status',
        client_payload: {schema_version: 1}
      }),
      client([[]])
    ),
    /operation must be an object/u
  )

  for (const fixture of fixtures) {
    await assert.rejects(
      resolveBranchDeployEvent(
        context(
          'repository_dispatch',
          dispatchPayload({[fixture.field]: fixture.value})
        ),
        client([[]])
      ),
      fixture.message
    )
  }

  const invalidMarker = comment(marker({github_job: ''}), statusCommentId)
  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client([[invalidMarker]], invalidMarker)
    ),
    /status marker\.github_job must be a nonempty/u
  )

  const invalidStableMarker = comment(
    marker({stable_branch_used: 'false'}),
    statusCommentId
  )
  await assert.rejects(
    resolveBranchDeployEvent(
      context('repository_dispatch', dispatchPayload()),
      client([[invalidStableMarker]], invalidStableMarker)
    ),
    /status marker\.stable_branch_used must be a boolean/u
  )
})

test('compares every command identity field exactly', async () => {
  const differentMarkers = [
    {pr_number: 43},
    {expected_head_sha: 'def456'},
    {transition: 'deploy'},
    {github_run_id: 101},
    {github_run_attempt: 3},
    {github_job: 'other'},
    {command_comment_id: 499},
    {stable_branch_used: true}
  ]
  for (const difference of differentMarkers) {
    const different = comment(marker(difference), statusCommentId)
    await assert.rejects(
      resolveBranchDeployEvent(
        context('repository_dispatch', dispatchPayload()),
        client([[different]], different)
      ),
      /no matching trusted/u
    )
  }
})
