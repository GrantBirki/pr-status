import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHECK_TYPES,
  EVALUATION_CRITERIA,
  EVALUATION_RESULT,
  FAILING_CHECK_STATES,
  PENDING_CHECK_STATES,
  PR_STATUS,
  REVIEW_DECISION,
  SUCCESSFUL_CHECK_STATES
} from '../../src/functions/constants.ts'

test('exports the finite domain values', () => {
  assert.deepEqual(PR_STATUS, {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    PENDING: 'PENDING',
    UNKNOWN: 'UNKNOWN'
  })
  assert.deepEqual(REVIEW_DECISION, {
    APPROVED: 'APPROVED',
    CHANGES_REQUESTED: 'CHANGES_REQUESTED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED'
  })
  assert.deepEqual(EVALUATION_RESULT, {PASS: 'PASS', FAIL: 'FAIL'})
  assert.deepEqual(CHECK_TYPES, {REQUIRED: 'required', ALL: 'all'})
  assert.deepEqual(EVALUATION_CRITERIA, {
    APPROVED: 'approved',
    CI_PASSING: 'ci_passing',
    MERGEABLE: 'mergeable',
    NOT_DRAFT: 'not_draft',
    MIN_APPROVALS: 'min_approvals'
  })
})

test('exports every raw check-state classification', () => {
  assert.deepEqual(SUCCESSFUL_CHECK_STATES, [
    'SUCCESS',
    'SKIPPED',
    'NEUTRAL'
  ])
  assert.deepEqual(PENDING_CHECK_STATES, [
    'PENDING',
    'EXPECTED',
    'QUEUED',
    'IN_PROGRESS',
    'WAITING',
    'REQUESTED'
  ])
  assert.deepEqual(FAILING_CHECK_STATES, [
    'FAILURE',
    'ERROR',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
    'STALE'
  ])
})
