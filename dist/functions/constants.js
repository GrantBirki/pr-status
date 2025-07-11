"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHECK_TYPES = exports.EVALUATION_CRITERIA = exports.CHECK_STATUS = exports.EVALUATION_RESULT = exports.MERGE_STATE = exports.REVIEW_DECISION = exports.PR_STATUS = void 0;
exports.PR_STATUS = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    PENDING: 'PENDING',
    UNKNOWN: 'UNKNOWN'
};
exports.REVIEW_DECISION = {
    APPROVED: 'APPROVED',
    CHANGES_REQUESTED: 'CHANGES_REQUESTED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED'
};
exports.MERGE_STATE = {
    CLEAN: 'CLEAN',
    DIRTY: 'DIRTY',
    UNKNOWN: 'UNKNOWN',
    DRAFT: 'DRAFT',
    BLOCKED: 'BLOCKED'
};
exports.EVALUATION_RESULT = {
    PASS: 'PASS',
    FAIL: 'FAIL'
};
exports.CHECK_STATUS = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    PENDING: 'PENDING',
    SKIPPED: 'SKIPPED',
    NEUTRAL: 'NEUTRAL'
};
exports.EVALUATION_CRITERIA = {
    APPROVED: 'approved',
    MERGEABLE: 'mergeable',
    CI_PASSING: 'ci_passing',
    MIN_APPROVALS: 'min_approvals'
};
exports.CHECK_TYPES = {
    REQUIRED: 'required',
    ALL: 'all'
};
