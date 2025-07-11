import {
  PR_STATUS,
  REVIEW_DECISION,
  MERGE_STATE,
  EVALUATION_RESULT,
  CHECK_STATUS,
  EVALUATION_CRITERIA,
  CHECK_TYPES
} from '../../src/functions/constants'

describe('constants', () => {
  test('PR_STATUS constants are defined correctly', () => {
    expect(PR_STATUS.SUCCESS).toBe('SUCCESS')
    expect(PR_STATUS.FAILURE).toBe('FAILURE')
    expect(PR_STATUS.PENDING).toBe('PENDING')
    expect(PR_STATUS.UNKNOWN).toBe('UNKNOWN')
  })

  test('REVIEW_DECISION constants are defined correctly', () => {
    expect(REVIEW_DECISION.APPROVED).toBe('APPROVED')
    expect(REVIEW_DECISION.CHANGES_REQUESTED).toBe('CHANGES_REQUESTED')
    expect(REVIEW_DECISION.REVIEW_REQUIRED).toBe('REVIEW_REQUIRED')
  })

  test('MERGE_STATE constants are defined correctly', () => {
    expect(MERGE_STATE.CLEAN).toBe('CLEAN')
    expect(MERGE_STATE.DIRTY).toBe('DIRTY')
    expect(MERGE_STATE.UNKNOWN).toBe('UNKNOWN')
    expect(MERGE_STATE.DRAFT).toBe('DRAFT')
    expect(MERGE_STATE.BLOCKED).toBe('BLOCKED')
  })

  test('EVALUATION_RESULT constants are defined correctly', () => {
    expect(EVALUATION_RESULT.PASS).toBe('PASS')
    expect(EVALUATION_RESULT.FAIL).toBe('FAIL')
  })

  test('CHECK_STATUS constants are defined correctly', () => {
    expect(CHECK_STATUS.SUCCESS).toBe('SUCCESS')
    expect(CHECK_STATUS.FAILURE).toBe('FAILURE')
    expect(CHECK_STATUS.PENDING).toBe('PENDING')
    expect(CHECK_STATUS.SKIPPED).toBe('SKIPPED')
    expect(CHECK_STATUS.NEUTRAL).toBe('NEUTRAL')
  })

  test('EVALUATION_CRITERIA constants are defined correctly', () => {
    expect(EVALUATION_CRITERIA.APPROVED).toBe('approved')
    expect(EVALUATION_CRITERIA.MERGEABLE).toBe('mergeable')
    expect(EVALUATION_CRITERIA.CI_PASSING).toBe('ci_passing')
    expect(EVALUATION_CRITERIA.MIN_APPROVALS).toBe('min_approvals')
  })

  test('CHECK_TYPES constants are defined correctly', () => {
    expect(CHECK_TYPES.REQUIRED).toBe('required')
    expect(CHECK_TYPES.ALL).toBe('all')
  })
})