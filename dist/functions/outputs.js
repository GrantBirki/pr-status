"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.outputs = outputs;
const core = __importStar(require("@actions/core"));
const constants_1 = require("./constants");
function parseMinApprovals(evaluation) {
    const parts = evaluation.split('=');
    if (parts.length !== 2) {
        throw new Error(`Invalid min_approvals format: ${evaluation}`);
    }
    const minApprovals = parseInt(parts[1], 10);
    if (isNaN(minApprovals) || minApprovals < 0) {
        throw new Error(`Invalid min_approvals value: ${parts[1]}`);
    }
    return minApprovals;
}
function evaluateCriteria(evaluation, status) {
    if (evaluation === constants_1.EVALUATION_CRITERIA.APPROVED) {
        if (status.review_decision !== constants_1.REVIEW_DECISION.APPROVED &&
            status.review_decision !== null) {
            core.warning(`evaluation '${evaluation}' failed - PR is not approved`);
            return false;
        }
    }
    else if (evaluation === constants_1.EVALUATION_CRITERIA.MERGEABLE) {
        if (status.merge_state_status !== 'CLEAN') {
            core.warning(`evaluation '${evaluation}' failed - PR is not cleanly mergeable`);
            return false;
        }
    }
    else if (evaluation === constants_1.EVALUATION_CRITERIA.CI_PASSING) {
        if (status.commit_status !== constants_1.PR_STATUS.SUCCESS &&
            status.commit_status !== null) {
            core.warning(`evaluation '${evaluation}' failed - commit status is not successful`);
            return false;
        }
    }
    else if (evaluation.includes(constants_1.EVALUATION_CRITERIA.MIN_APPROVALS)) {
        try {
            const minApprovals = parseMinApprovals(evaluation);
            if (status.total_approvals < minApprovals) {
                core.warning(`evaluation '${evaluation}' failed - PR only has ${status.total_approvals} approvals, but requires at least ${minApprovals} approvals as configured by this action`);
                return false;
            }
        }
        catch (error) {
            core.warning(`evaluation '${evaluation}' failed - ${error.message}`);
            return false;
        }
    }
    else {
        core.warning(`evaluation '${evaluation}' failed - unknown evaluation criteria`);
        return false;
    }
    return true;
}
function outputs(status, data) {
    core.setOutput('review_decision', status.review_decision || null);
    core.setOutput('total_approvals', status.total_approvals || 0);
    core.setOutput('merge_state_status', status.merge_state_status || null);
    core.setOutput('commit_status', status.commit_status || null);
    if (status.review_decision === constants_1.REVIEW_DECISION.APPROVED) {
        core.setOutput('approved', 'true');
    }
    else if (status.review_decision === null) {
        core.info('PR has no approval requirements so it is technically considered approved');
        core.setOutput('approved', 'true');
    }
    else {
        core.setOutput('approved', 'false');
    }
    if (data.evaluations.length === 0) {
        core.setOutput('evaluation', null);
    }
    let pass = true;
    data.evaluations.forEach(evaluation => {
        if (!evaluateCriteria(evaluation, status)) {
            pass = false;
        }
    });
    core.setOutput('evaluation', pass ? constants_1.EVALUATION_RESULT.PASS : constants_1.EVALUATION_RESULT.FAIL);
    core.info(`evaluation: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
    return pass;
}
