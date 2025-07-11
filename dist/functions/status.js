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
exports.status = status;
const core = __importStar(require("@actions/core"));
const colors_1 = require("./colors");
const constants_1 = require("./constants");
function getCheckName(check) {
    if ('name' in check) {
        return check.name || 'Unknown';
    }
    if ('context' in check) {
        return check.context || 'Unknown';
    }
    return 'Unknown';
}
function getCheckStatus(check) {
    if ('conclusion' in check) {
        return (check.conclusion || 'UNKNOWN').toUpperCase();
    }
    if ('state' in check) {
        return (check.state || 'UNKNOWN').toUpperCase();
    }
    return 'UNKNOWN';
}
function isSuccessfulStatus(status) {
    const successfulStatuses = [
        constants_1.CHECK_STATUS.SUCCESS,
        constants_1.CHECK_STATUS.SKIPPED,
        constants_1.CHECK_STATUS.NEUTRAL
    ];
    return successfulStatuses.includes(status);
}
function logAllChecks(checks) {
    core.info(`📋 Found ${checks.length} total CI checks on this pull request`);
    checks.forEach(check => {
        const checkName = getCheckName(check);
        const isRequired = check.isRequired ? '(required)' : '(optional)';
        const checkStatus = getCheckStatus(check);
        core.info(`  - ${checkName} ${isRequired}: ${checkStatus}`);
    });
}
function filterExcludedChecks(checks, excludePatterns) {
    return checks.filter(check => {
        const checkName = getCheckName(check);
        if (checkName === 'Unknown') {
            return true;
        }
        const shouldExclude = excludePatterns.some(excludePattern => checkName === excludePattern);
        if (shouldExclude) {
            core.info(`Excluding check from status evaluation: ${checkName}`);
        }
        return !shouldExclude;
    });
}
function logCheckResults(checks, checkType = 'check') {
    let hasFailingCheck = false;
    checks.forEach(check => {
        const checkName = getCheckName(check);
        const checkStatus = getCheckStatus(check);
        const isSuccessful = isSuccessfulStatus(checkStatus);
        if (isSuccessful) {
            const prefix = checkType === constants_1.CHECK_TYPES.REQUIRED ? 'Required check' : 'Check';
            core.info(`✅ ${prefix} '${checkName}': ${checkStatus}`);
        }
        else {
            const prefix = checkType === constants_1.CHECK_TYPES.REQUIRED ? 'Required check' : 'Check';
            core.info(`❌ ${prefix} '${checkName}': ${checkStatus} (FAILING)`);
            hasFailingCheck = true;
        }
    });
    return hasFailingCheck;
}
function areAllChecksSuccessful(checks) {
    return checks.every(check => {
        const status = getCheckStatus(check);
        return isSuccessfulStatus(status);
    });
}
function logOverallStatus(hasFailures, checkType, overallState = null) {
    if (hasFailures) {
        if (checkType === constants_1.CHECK_TYPES.REQUIRED) {
            core.info(`🔴 Overall required checks status: FAILURE (one or more required checks failed)`);
        }
        else {
            core.info(`🔴 Overall CI status: ${overallState} (one or more checks failed)`);
        }
    }
    else {
        if (checkType === constants_1.CHECK_TYPES.REQUIRED) {
            core.info(`🟢 Overall required checks status: SUCCESS (all required checks passed)`);
        }
        else {
            core.info(`🟢 Overall CI status: SUCCESS (all checks passed)`);
        }
    }
}
function processRequiredChecks(result, checksToExclude) {
    const allChecks = result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
        .contexts.nodes || [];
    logAllChecks(allChecks);
    const requiredChecks = allChecks.filter(x => x.isRequired);
    const filteredChecks = filterExcludedChecks(requiredChecks, checksToExclude);
    core.info(`Evaluating ${filteredChecks.length} required checks (after exclusions)`);
    const hasFailingCheck = logCheckResults(filteredChecks, constants_1.CHECK_TYPES.REQUIRED);
    const commitStatus = areAllChecksSuccessful(filteredChecks)
        ? constants_1.PR_STATUS.SUCCESS
        : constants_1.PR_STATUS.FAILURE;
    logOverallStatus(hasFailingCheck, constants_1.CHECK_TYPES.REQUIRED);
    return commitStatus;
}
function processAllChecks(result, checksToExclude) {
    const allChecks = result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
        .contexts.nodes || [];
    logAllChecks(allChecks);
    const filteredChecks = filterExcludedChecks(allChecks, checksToExclude);
    core.info(`Evaluating ${filteredChecks.length} total checks (after exclusions)`);
    if (filteredChecks.length === 0) {
        core.info('💡 no other CI checks found after filtering out excluded checks');
        return null;
    }
    const hasFailingCheck = logCheckResults(filteredChecks, constants_1.CHECK_TYPES.ALL);
    const allSuccessful = areAllChecksSuccessful(filteredChecks);
    const commitStatus = allSuccessful
        ? constants_1.PR_STATUS.SUCCESS
        : result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
            .state || null;
    const overallState = result.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup
        .state || 'UNKNOWN';
    logOverallStatus(hasFailingCheck, constants_1.CHECK_TYPES.ALL, overallState);
    return commitStatus;
}
const PR_STATUS_QUERY = `query($owner:String!, $name:String!, $number:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      reviewDecision
      mergeStateStatus
      commits(last: 1) {
        nodes {
          commit {
            checkSuites {
              totalCount
            }
            statusCheckRollup {
              state
              contexts(first:100) {
                nodes {
                  ... on CheckRun {
                    isRequired(pullRequestNumber:$number)
                    conclusion
                    name
                  }
                  ... on StatusContext {
                    isRequired(pullRequestNumber:$number)
                    state
                    context
                  }
                }
              }
            }
          }
        }
      }
      reviews(states: APPROVED) {
        totalCount
      }
    }
  }
}`;
async function status(octokit, context, prNumber, data) {
    const variables = {
        owner: context.repo.owner,
        name: context.repo.repo,
        number: prNumber,
        headers: {
            Accept: 'application/vnd.github.merge-info-preview+json'
        }
    };
    const excludeChecks = data.excludeChecks || [];
    const currentActionName = data.workflow || 'pr-status';
    const checksToExclude = [...excludeChecks, currentActionName].filter(Boolean);
    core.info(`Checks to exclude from status evaluation: ${checksToExclude.join(', ')}`);
    const result = await octokit.graphql(PR_STATUS_QUERY, variables);
    let commitStatus = null;
    try {
        if (result.repository.pullRequest.commits.nodes[0]?.commit.checkSuites
            .totalCount === 0) {
            core.info('💡 no CI checks have been defined for this pull request');
            commitStatus = null;
        }
        else if (data.checks === constants_1.CHECK_TYPES.REQUIRED) {
            commitStatus = processRequiredChecks(result, checksToExclude);
        }
        else {
            commitStatus = processAllChecks(result, checksToExclude);
        }
    }
    catch (e) {
        core.info(`could not retrieve PR commit status: ${e} - Handled: ${colors_1.COLORS.success}OK`);
        core.info('this repo may not have any CI checks defined');
        core.info('skipping commit status check and proceeding...');
        commitStatus = null;
        try {
            core.debug('raw graphql result for debugging:');
            core.debug(JSON.stringify(result));
        }
        catch {
            core.debug('Could not output raw graphql result for debugging - This is bad');
        }
    }
    const statusResult = {
        review_decision: result?.repository?.pullRequest?.reviewDecision || null,
        total_approvals: result?.repository?.pullRequest?.reviews?.totalCount || 0,
        merge_state_status: result?.repository?.pullRequest?.mergeStateStatus || null,
        commit_status: commitStatus || null
    };
    core.debug(`statusResult: ${JSON.stringify(statusResult, null, 2)}`);
    return statusResult;
}
