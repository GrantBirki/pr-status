import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateCriterion,
  outputs,
  parseEvaluationCriteria
} from '../../src/functions/outputs.ts'
import type {StatusResult} from '../../src/functions/status.ts'
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

test('strictly parses every supported criterion', () => {
  assert.deepEqual(
    parseEvaluationCriteria([
      'approved',
      'ci_passing',
      'mergeable',
      'not_draft',
      'min_approvals=0',
      'min_approvals=12'
    ]),
    [
      {kind: 'approved', source: 'approved'},
      {kind: 'ci_passing', source: 'ci_passing'},
      {kind: 'mergeable', source: 'mergeable'},
      {kind: 'not_draft', source: 'not_draft'},
      {kind: 'min_approvals', minimum: 0, source: 'min_approvals=0'},
      {kind: 'min_approvals', minimum: 12, source: 'min_approvals=12'}
    ]
  )
})

test('rejects unknown, malformed, and incorrectly cased criteria', () => {
  for (const criterion of [
    'APPROVED',
    'unsupported',
    'prefix_min_approvals=1',
    'min_approvals',
    'min_approvals=',
    'min_approvals=01',
    'min_approvals=-1',
    'min_approvals=1.5',
    'min_approvals=1x'
  ]) {
    assert.throws(
      () => parseEvaluationCriteria([criterion]),
      new Error(`Invalid evaluation criterion: ${criterion}`)
    )
  }
})

test('evaluates each criterion against strict PR semantics', () => {
  const status = createStatus()
  const criteria = parseEvaluationCriteria([
    'approved',
    'ci_passing',
    'mergeable',
    'not_draft',
    'min_approvals=2'
  ])

  for (const criterion of criteria) {
    assert.equal(evaluateCriterion(status, criterion), true)
  }

  assert.equal(
    evaluateCriterion(
      createStatus({review_decision: null}),
      parseEvaluationCriteria(['approved'])[0]!
    ),
    true
  )
  assert.equal(
    evaluateCriterion(
      createStatus({review_decision: 'CHANGES_REQUESTED'}),
      parseEvaluationCriteria(['approved'])[0]!
    ),
    false
  )
  assert.equal(
    evaluateCriterion(
      createStatus({commit_status: 'UNKNOWN'}),
      parseEvaluationCriteria(['ci_passing'])[0]!
    ),
    false
  )
  assert.equal(
    evaluateCriterion(
      createStatus({mergeable_state: 'CONFLICTING'}),
      parseEvaluationCriteria(['mergeable'])[0]!
    ),
    false
  )
  assert.equal(
    evaluateCriterion(
      createStatus({is_draft: true}),
      parseEvaluationCriteria(['not_draft'])[0]!
    ),
    false
  )
  assert.equal(
    evaluateCriterion(
      createStatus({total_approvals: 1}),
      parseEvaluationCriteria(['min_approvals=2'])[0]!
    ),
    false
  )
  assert.equal(
    evaluateCriterion(
      createStatus({total_approvals: 0}),
      parseEvaluationCriteria(['min_approvals=0'])[0]!
    ),
    true
  )
})

test('sets every output and passes all satisfied criteria', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus(),
    {
      evaluations: [
        'approved',
        'ci_passing',
        'mergeable',
        'not_draft',
        'min_approvals=2'
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

test('treats null review decisions and an empty evaluation list as passing', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus({
      review_decision: null,
      total_approvals: 0,
      merge_state_status: 'UNKNOWN',
      mergeable_state: 'UNKNOWN',
      is_draft: true,
      commit_status: 'UNKNOWN'
    }),
    {evaluations: []},
    {core: recording.core}
  )

  assert.equal(passed, true)
  assert.equal(recording.outputs.get('approved'), 'true')
  assert.equal(recording.outputs.get('evaluation'), 'PASS')
  assert.equal(recording.outputs.get('commit_status'), 'UNKNOWN')
  assert.ok(includesMessage(recording.info, 'no approval requirements'))
  assert.ok(includesMessage(recording.info, 'No evaluation criteria provided'))
})

test('ANDs criteria, emits diagnostic outputs, and warns for each legitimate failure', () => {
  const recording = createRecordingCore()
  const passed = outputs(
    createStatus({
      review_decision: 'CHANGES_REQUESTED',
      total_approvals: 1,
      mergeable_state: 'CONFLICTING',
      is_draft: true,
      commit_status: 'UNKNOWN'
    }),
    {
      evaluations: [
        'approved',
        'ci_passing',
        'mergeable',
        'not_draft',
        'min_approvals=2'
      ]
    },
    {core: recording.core}
  )

  assert.equal(passed, false)
  assert.equal(recording.outputs.get('approved'), 'false')
  assert.equal(recording.outputs.get('evaluation'), 'FAIL')
  assert.equal(recording.warning.length, 5)
  assert.ok(includesMessage(recording.warning, 'PR is not approved'))
  assert.ok(includesMessage(recording.warning, 'commit status is not successful'))
  assert.ok(includesMessage(recording.warning, 'not in a mergeable state'))
  assert.ok(includesMessage(recording.warning, 'PR is in draft status'))
  assert.ok(includesMessage(recording.warning, 'requires at least 2 approvals'))
})

test('throws configuration errors rather than converting them to evaluation failures', () => {
  const recording = createRecordingCore()

  assert.throws(
    () =>
      outputs(
        createStatus(),
        {evaluations: ['min_approvals=01']},
        {core: recording.core}
      ),
    /Invalid evaluation criterion/
  )
  assert.deepEqual(recording.outputs, new Map())
})
