import assert from 'node:assert/strict'
import test from 'node:test'

import {COLORS} from '../../src/functions/colors.ts'
import {
  CHECK_STATUS,
  CHECK_TYPES,
  EVALUATION_CRITERIA,
  EVALUATION_RESULT,
  MERGE_STATE,
  PR_STATUS,
  REVIEW_DECISION
} from '../../src/functions/constants.ts'

test('exports the documented status and evaluation constants', () => {
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
  assert.deepEqual(MERGE_STATE, {
    CLEAN: 'CLEAN',
    DIRTY: 'DIRTY',
    UNKNOWN: 'UNKNOWN',
    DRAFT: 'DRAFT',
    BLOCKED: 'BLOCKED'
  })
  assert.deepEqual(EVALUATION_RESULT, {PASS: 'PASS', FAIL: 'FAIL'})
  assert.deepEqual(CHECK_STATUS, {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    PENDING: 'PENDING',
    SKIPPED: 'SKIPPED',
    NEUTRAL: 'NEUTRAL'
  })
  assert.deepEqual(EVALUATION_CRITERIA, {
    APPROVED: 'approved',
    MERGEABLE: 'mergeable',
    CI_PASSING: 'ci_passing',
    MIN_APPROVALS: 'min_approvals',
    NOT_DRAFT: 'not_draft'
  })
  assert.deepEqual(CHECK_TYPES, {REQUIRED: 'required', ALL: 'all'})
})

test('exports the ANSI color constants', () => {
  assert.deepEqual(COLORS, {
    highlight: '\u001b[35m',
    info: '\u001b[34m',
    success: '\u001b[32m',
    warning: '\u001b[33m',
    error: '\u001b[31m',
    reset: '\u001b[0m'
  })
})
