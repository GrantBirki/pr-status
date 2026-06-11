import assert from 'node:assert/strict'
import test from 'node:test'

import {outputs} from '../../src/functions/outputs.ts'
import type {StatusResult} from '../../src/types.ts'
import {createRecordingCore, includesMessage} from './helpers.ts'

function createStatus(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    review_decision: 'APPROVED',
    total_approvals: 2,
    merge_state_status: 'CLEAN',
    mergeable_state: 'MERGEABLE',
    is_draft: false,
    commit_status: 'SUCCESS',
    ...overrides
  }
}

test('sets outputs and passes all satisfied criteria', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus(),
    {
      evaluations: [
        'approved',
        'mergeable',
        'ci_passing',
        'min_approvals=2',
        'not_draft'
      ]
    },
    {core: recording.core}
  )

  assert.equal(passed, true)
  assert.deepEqual(Object.fromEntries(recording.outputs), {
    review_decision: 'APPROVED',
    total_approvals: 2,
    merge_state_status: 'CLEAN',
    commit_status: 'SUCCESS',
    mergeable_state: 'MERGEABLE',
    is_draft: 'false',
    approved: 'true',
    evaluation: 'PASS'
  })
  assert.ok(includesMessage(recording.info, 'Evaluating 5 criteria'))
  assert.deepEqual(recording.warning, [])
})

test('treats no approval requirement and no criteria as passing', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus({
      review_decision: null,
      total_approvals: null,
      merge_state_status: null,
      mergeable_state: null,
      is_draft: true,
      commit_status: null
    }),
    {evaluations: []},
    {core: recording.core}
  )

  assert.equal(passed, true)
  assert.deepEqual(Object.fromEntries(recording.outputs), {
    review_decision: null,
    total_approvals: 0,
    merge_state_status: null,
    commit_status: null,
    mergeable_state: null,
    is_draft: 'true',
    approved: 'true',
    evaluation: 'PASS'
  })
  assert.ok(includesMessage(recording.info, 'no approval requirements'))
  assert.ok(includesMessage(recording.info, 'No evaluation criteria provided'))
  assert.ok(includesMessage(recording.info, 'Evaluation result: PASS'))
})

test('fails each unsatisfied or unknown criterion without short-circuiting', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus({
      review_decision: 'CHANGES_REQUESTED',
      total_approvals: 1,
      mergeable_state: 'CONFLICTING',
      is_draft: true,
      commit_status: 'FAILURE'
    }),
    {
      evaluations: [
        'approved',
        'mergeable',
        'ci_passing',
        'min_approvals=2',
        'not_draft',
        'unsupported'
      ]
    },
    {core: recording.core}
  )

  assert.equal(passed, false)
  assert.equal(recording.outputs.get('approved'), 'false')
  assert.equal(recording.outputs.get('evaluation'), 'FAIL')
  assert.equal(recording.warning.length, 6)
  assert.ok(includesMessage(recording.warning, 'PR is not approved'))
  assert.ok(includesMessage(recording.warning, 'not in a mergeable state'))
  assert.ok(includesMessage(recording.warning, 'commit status is not successful'))
  assert.ok(includesMessage(recording.warning, 'requires at least 2 approvals'))
  assert.ok(includesMessage(recording.warning, 'PR is in draft status'))
  assert.ok(includesMessage(recording.warning, 'unknown evaluation criteria'))
})

test('preserves permissive PR 1 CI and min-approval parsing behavior', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus({commit_status: null, total_approvals: 0}),
    {
      evaluations: ['ci_passing', 'prefix_min_approvals=0']
    },
    {core: recording.core}
  )

  assert.equal(passed, true)
  assert.equal(recording.outputs.get('evaluation'), 'PASS')
})

test('treats a missing approval count as zero for minimum approvals', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus({total_approvals: null}),
    {evaluations: ['min_approvals=0']},
    {core: recording.core}
  )

  assert.equal(passed, true)
})

test('turns malformed minimum-approval criteria into evaluation failures', () => {
  const cases = [
    {
      evaluation: 'min_approvals',
      warning: 'Invalid min_approvals format: min_approvals'
    },
    {
      evaluation: 'min_approvals=abc',
      warning: 'Invalid min_approvals value: abc'
    },
    {
      evaluation: 'min_approvals=-1',
      warning: 'Invalid min_approvals value: -1'
    }
  ]

  for (const {evaluation, warning} of cases) {
    const recording = createRecordingCore()
    const passed = outputs(
      createStatus(),
      {evaluations: [evaluation]},
      {core: recording.core}
    )

    assert.equal(passed, false)
    assert.equal(recording.outputs.get('evaluation'), 'FAIL')
    assert.ok(includesMessage(recording.warning, warning))
  }
})
