export const PR_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  PENDING: 'PENDING',
  UNKNOWN: 'UNKNOWN'
} as const

export type CommitStatus = (typeof PR_STATUS)[keyof typeof PR_STATUS]

export const REVIEW_DECISION = {
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
} as const

export const EVALUATION_RESULT = {
  PASS: 'PASS',
  FAIL: 'FAIL'
} as const

export type EvaluationResult =
  (typeof EVALUATION_RESULT)[keyof typeof EVALUATION_RESULT]

export const CHECK_TYPES = {
  REQUIRED: 'required',
  ALL: 'all'
} as const

export type CheckSelection = (typeof CHECK_TYPES)[keyof typeof CHECK_TYPES]

export const EVALUATION_CRITERIA = {
  APPROVED: 'approved',
  CI_PASSING: 'ci_passing',
  MERGEABLE: 'mergeable',
  NOT_DRAFT: 'not_draft',
  MIN_APPROVALS: 'min_approvals'
} as const

export const SUCCESSFUL_CHECK_STATES: readonly string[] = [
  'SUCCESS',
  'SKIPPED',
  'NEUTRAL'
]

export const PENDING_CHECK_STATES: readonly string[] = [
  'PENDING',
  'EXPECTED',
  'QUEUED',
  'IN_PROGRESS',
  'WAITING',
  'REQUESTED'
]

export const FAILING_CHECK_STATES: readonly string[] = [
  'FAILURE',
  'ERROR',
  'CANCELLED',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'STALE'
]
