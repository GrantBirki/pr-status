import assert from 'node:assert/strict'
import test from 'node:test'

import type {ActionContext} from '../../src/context.ts'
import {resolveBranchDeployEvent} from '../../src/functions/branch-deploy-event.ts'

function context(
  eventName: string,
  action: unknown,
  pullRequest: unknown = {
    number: 42,
    head: {sha: 'abc123'}
  },
  runAttempt = 1
): ActionContext {
  return {
    repo: {owner: 'octocat', repo: 'example'},
    job: 'branch-deploy-status',
    eventName,
    eventPayload: {action, pull_request: pullRequest},
    runAttempt,
    issueNumber: undefined
  }
}

test('resolves pull request reset events with replay metadata', () => {
  for (const action of [
    'opened',
    'reopened',
    'synchronize',
    'ready_for_review'
  ]) {
    assert.deepEqual(resolveBranchDeployEvent(context('pull_request', action)), {
      shouldReconcile: true,
      transition: 'reset',
      prNumber: 42,
      expectedHeadSha: 'abc123',
      operationResult: null,
      preserveAdvancedReset: false
    })
  }

  assert.deepEqual(
    resolveBranchDeployEvent(
      context('pull_request', 'synchronize', {
        number: 42,
        head: {sha: 'abc123'}
      }, 2)
    ),
    {
      shouldReconcile: true,
      transition: 'reset',
      prNumber: 42,
      expectedHeadSha: 'abc123',
      operationResult: null,
      preserveAdvancedReset: true
    }
  )
})

test('resolves pull request clear and review events without a head SHA', () => {
  for (const action of ['converted_to_draft', 'closed']) {
    assert.deepEqual(
      resolveBranchDeployEvent(
        context('pull_request', action, {number: 42})
      ),
      {
        shouldReconcile: true,
        transition: 'clear',
        prNumber: 42,
        expectedHeadSha: '',
        operationResult: null,
        preserveAdvancedReset: false
      }
    )
  }

  for (const action of ['submitted', 'dismissed']) {
    assert.deepEqual(
      resolveBranchDeployEvent(
        context('pull_request_review', action, {number: 42}, 3)
      ),
      {
        shouldReconcile: true,
        transition: 'review',
        prNumber: 42,
        expectedHeadSha: '',
        operationResult: null,
        preserveAdvancedReset: false
      }
    )
  }
})

test('ignores unsupported events and actions', () => {
  const cases = [
    context('pull_request', 'labeled'),
    context('pull_request_review', 'edited'),
    context('workflow_dispatch', 'synchronize'),
    context('pull_request', undefined)
  ]

  for (const fixture of cases) {
    const result = resolveBranchDeployEvent(fixture)
    assert.equal(result.shouldReconcile, false)
    if (!result.shouldReconcile) {
      assert.match(result.reason, /not a supported branch-deploy status/u)
    }
  }
})

test('validates native event pull request fields', () => {
  const fixtures: Array<{context: ActionContext; message: RegExp}> = [
    {
      context: context('pull_request', 'opened', null),
      message: /pull_request must be an object/u
    },
    {
      context: context('pull_request', 'opened', {number: 0}),
      message: /number must be a positive safe integer/u
    },
    {
      context: context('pull_request', 'opened', {number: 1.5}),
      message: /number must be a positive safe integer/u
    },
    {
      context: context('pull_request', 'opened', {number: 42}),
      message: /head must be an object/u
    },
    {
      context: context('pull_request', 'opened', {
        number: 42,
        head: {sha: ''}
      }),
      message: /head\.sha must be a nonempty string/u
    }
  ]

  for (const fixture of fixtures) {
    assert.throws(
      () => resolveBranchDeployEvent(fixture.context),
      fixture.message
    )
  }
})
