// Constants for pull request status values
export const PR_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  PENDING: 'PENDING',
  UNKNOWN: 'UNKNOWN'
}

// Constants for review decision values
export const REVIEW_DECISION = {
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
}

// Constants for merge state status values
export const MERGE_STATE = {
  CLEAN: 'CLEAN',
  DIRTY: 'DIRTY',
  UNKNOWN: 'UNKNOWN',
  DRAFT: 'DRAFT',
  BLOCKED: 'BLOCKED'
}

// Constants for evaluation results
export const EVALUATION_RESULT = {
  PASS: 'PASS',
  FAIL: 'FAIL'
}

// Constants for check status values
export const CHECK_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  PENDING: 'PENDING',
  SKIPPED: 'SKIPPED',
  NEUTRAL: 'NEUTRAL'
}

// Constants for evaluation criteria
export const EVALUATION_CRITERIA = {
  APPROVED: 'approved',
  MERGEABLE: 'mergeable',
  CI_PASSING: 'ci_passing',
  MIN_APPROVALS: 'min_approvals'
}

// Constants for check types
export const CHECK_TYPES = {
  REQUIRED: 'required',
  ALL: 'all'
}
