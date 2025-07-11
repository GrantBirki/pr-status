// Constants for pull request status values
export const PR_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  PENDING: 'PENDING',
  UNKNOWN: 'UNKNOWN'
} as const

// Constants for review decision values
export const REVIEW_DECISION = {
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
} as const

// Constants for merge state status values
export const MERGE_STATE = {
  CLEAN: 'CLEAN',
  DIRTY: 'DIRTY',
  UNKNOWN: 'UNKNOWN',
  DRAFT: 'DRAFT',
  BLOCKED: 'BLOCKED'
} as const

// Constants for evaluation results
export const EVALUATION_RESULT = {
  PASS: 'PASS',
  FAIL: 'FAIL'
} as const

// Constants for check status values
export const CHECK_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  PENDING: 'PENDING',
  SKIPPED: 'SKIPPED',
  NEUTRAL: 'NEUTRAL'
} as const

// Constants for evaluation criteria
export const EVALUATION_CRITERIA = {
  APPROVED: 'approved',
  MERGEABLE: 'mergeable',
  CI_PASSING: 'ci_passing',
  MIN_APPROVALS: 'min_approvals'
} as const

// Constants for check types
export const CHECK_TYPES = {
  REQUIRED: 'required',
  ALL: 'all'
} as const

// Type definitions for constants
export type PRStatus = (typeof PR_STATUS)[keyof typeof PR_STATUS]
export type ReviewDecision =
  (typeof REVIEW_DECISION)[keyof typeof REVIEW_DECISION]
export type MergeState = (typeof MERGE_STATE)[keyof typeof MERGE_STATE]
export type EvaluationResult =
  (typeof EVALUATION_RESULT)[keyof typeof EVALUATION_RESULT]
export type CheckStatus = (typeof CHECK_STATUS)[keyof typeof CHECK_STATUS]
export type EvaluationCriteria =
  (typeof EVALUATION_CRITERIA)[keyof typeof EVALUATION_CRITERIA]
export type CheckType = (typeof CHECK_TYPES)[keyof typeof CHECK_TYPES]
