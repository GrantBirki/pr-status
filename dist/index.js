import './sourcemap-register.cjs';import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ // The require scope
/******/ var __nccwpck_require__ = {};
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__nccwpck_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  D: () => (/* binding */ startEntrypoint)
});

;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: ./src/actions.ts


const MAX_FAILURE_MESSAGE_LENGTH = 4096;
function escapeCommandData(value) {
    return value
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}
function escapeCommandProperty(value) {
    return escapeCommandData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}
function messageText(message) {
    return message instanceof Error ? message.message : message;
}
function workflowCommand(command, message, properties = {}) {
    const serializedProperties = Object.entries(properties).map(([name, value]) => `${name}=${escapeCommandProperty(String(value))}`);
    const propertySection = serializedProperties.length === 0
        ? ''
        : ` ${serializedProperties.join(',')}`;
    return `::${command}${propertySection}::${escapeCommandData(messageText(message))}`;
}
function outputValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'boolean') {
        return String(value);
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('Output numbers must be finite');
        }
        return String(value);
    }
    throw new TypeError(`Unsupported output value type: ${typeof value}`);
}
function failureMessage(message) {
    const value = messageText(message);
    return value.length > MAX_FAILURE_MESSAGE_LENGTH
        ? value.slice(0, MAX_FAILURE_MESSAGE_LENGTH)
        : value;
}
function createActions(overrides = {}) {
    const dependencies = {
        env: process.env,
        writeLine(message) {
            console.log(message);
        },
        fileExists: external_node_fs_namespaceObject.existsSync,
        appendFile(path, data) {
            (0,external_node_fs_namespaceObject.appendFileSync)(path, data, { encoding: 'utf8' });
        },
        createUuid: external_node_crypto_namespaceObject.randomUUID,
        setExitCode(code) {
            process.exitCode = code;
        },
        ...overrides
    };
    function getInput(name, options = {}) {
        const environmentName = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
        const rawValue = dependencies.env[environmentName] ?? '';
        const value = options.trimWhitespace === false ? rawValue : rawValue.trim();
        if (options.required === true && value.length === 0) {
            throw new Error(`Input required and not supplied: ${name}`);
        }
        return value;
    }
    function debug(message) {
        dependencies.writeLine(workflowCommand('debug', message));
    }
    function info(message) {
        dependencies.writeLine(message);
    }
    function warning(message, properties = {}) {
        dependencies.writeLine(workflowCommand('warning', message, properties));
    }
    function error(message, properties = {}) {
        dependencies.writeLine(workflowCommand('error', message, properties));
    }
    function setOutput(name, value) {
        const outputPath = dependencies.env.GITHUB_OUTPUT;
        if (!outputPath) {
            throw new Error('GITHUB_OUTPUT is not set; this action only supports GitHub Actions environment files');
        }
        if (!dependencies.fileExists(outputPath)) {
            throw new Error('GITHUB_OUTPUT does not exist; this action only supports GitHub Actions environment files');
        }
        const serializedValue = outputValue(value);
        const delimiter = `ghadelimiter_${dependencies.createUuid()}`;
        if (name.includes(delimiter)) {
            throw new Error('Output name contains the generated delimiter');
        }
        if (serializedValue.includes(delimiter)) {
            throw new Error('Output value contains the generated delimiter');
        }
        dependencies.appendFile(outputPath, `${name}<<${delimiter}\n${serializedValue}\n${delimiter}\n`);
    }
    function setFailed(message) {
        error(failureMessage(message));
        dependencies.setExitCode(1);
    }
    return { getInput, debug, info, warning, error, setOutput, setFailed };
}
const actions = createActions();
/* harmony default export */ const src_actions = (actions);

;// CONCATENATED MODULE: ./src/context.ts

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nestedIssueNumber(payload, key) {
    const value = payload[key];
    if (!isRecord(value) || typeof value.number !== 'number') {
        return undefined;
    }
    return value.number;
}
function parseEventPayload(serializedPayload) {
    let payload;
    try {
        payload = JSON.parse(serializedPayload);
    }
    catch {
        throw new Error('GITHUB_EVENT_PATH does not contain valid JSON');
    }
    if (!isRecord(payload)) {
        throw new Error('GITHUB_EVENT_PATH must contain a JSON object');
    }
    return payload;
}
function requiredEnvironmentValue(environment, name) {
    const value = environment[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required in GitHub Actions`);
    }
    return value;
}
function loadActionContext(dependencies = {
    environment: process.env,
    readFile: path => (0,external_node_fs_namespaceObject.readFileSync)(path, 'utf8')
}) {
    const { environment } = dependencies;
    if (environment.GITHUB_ACTIONS !== 'true') {
        throw new Error('pr-status can only run inside GitHub Actions');
    }
    const repository = requiredEnvironmentValue(environment, 'GITHUB_REPOSITORY');
    const [owner, repo, extraPart] = repository.split('/');
    if (owner === undefined ||
        owner === '' ||
        repo === undefined ||
        repo === '' ||
        extraPart !== undefined) {
        throw new Error('GITHUB_REPOSITORY must use the owner/repository format');
    }
    const eventPath = requiredEnvironmentValue(environment, 'GITHUB_EVENT_PATH');
    const job = requiredEnvironmentValue(environment, 'GITHUB_JOB');
    const payload = parseEventPayload(dependencies.readFile(eventPath));
    const issueNumber = nestedIssueNumber(payload, 'pull_request') ??
        nestedIssueNumber(payload, 'issue') ??
        (typeof payload.number === 'number' ? payload.number : undefined);
    return {
        repo: {
            owner,
            repo
        },
        job,
        issueNumber
    };
}

;// CONCATENATED MODULE: ./src/functions/label.ts
function determineLabelActions(passed, passLabels, failLabels, passLabelsCleanup) {
    const add = normalizeLabels(passed ? passLabels : failLabels);
    const remove = normalizeLabels(passed ? [...failLabels, ...passLabelsCleanup] : passLabels);
    const additions = new Set(add);
    return {
        labelsToAdd: add,
        labelsToRemove: remove.filter(label => !additions.has(label))
    };
}
async function label(pullRequestNumber, context, client, labelsToAdd, labelsToRemove, dependencies) {
    const { core } = dependencies;
    const add = normalizeLabels(labelsToAdd);
    const additions = new Set(add);
    const remove = normalizeLabels(labelsToRemove).filter(name => !additions.has(name));
    if (add.length === 0 && remove.length === 0) {
        core.info('🏷️ No labels to add or remove');
        return { added: [], removed: [] };
    }
    const request = {
        owner: context.repo.owner,
        repo: context.repo.repo,
        number: pullRequestNumber
    };
    const removed = [];
    core.info(`🏷️ Processing labels for PR #${pullRequestNumber}`);
    if (remove.length > 0) {
        const suppliedLabels = dependencies.currentLabels;
        if (suppliedLabels === undefined) {
            core.debug('🔍 Fetching current labels on the issue');
        }
        const current = new Set(suppliedLabels ?? (await client.listIssueLabels(request)));
        for (const name of remove) {
            if (!current.has(name)) {
                core.info(`🏷️ ⚠️ Label not found: '${name}' so it was not removed`);
                continue;
            }
            await client.removeLabel({ ...request, name });
            removed.push(name);
            core.info(`🏷️ ❌ Label removed: ${name}`);
        }
    }
    if (add.length > 0) {
        core.debug(`🔍 Attempting to apply labels: ${add.join(', ')}`);
        await client.addLabels({ ...request, labels: add });
        core.info(`🏷️ ✅ Labels added: ${add.join(', ')}`);
    }
    return { added: add, removed };
}
function normalizeLabels(labels) {
    const result = [];
    const seen = new Set();
    for (const label of labels) {
        const trimmed = label.trim();
        if (trimmed !== '' && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    }
    return result;
}

;// CONCATENATED MODULE: ./src/functions/constants.ts
const PR_STATUS = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    PENDING: 'PENDING',
    UNKNOWN: 'UNKNOWN'
};
const REVIEW_DECISION = {
    APPROVED: 'APPROVED',
    CHANGES_REQUESTED: 'CHANGES_REQUESTED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED'
};
const EVALUATION_RESULT = {
    PASS: 'PASS',
    FAIL: 'FAIL'
};
const CHECK_TYPES = {
    REQUIRED: 'required',
    ALL: 'all'
};
const EVALUATION_CRITERIA = {
    APPROVED: 'approved',
    CI_PASSING: 'ci_passing',
    MERGEABLE: 'mergeable',
    NOT_DRAFT: 'not_draft',
    MIN_APPROVALS: 'min_approvals'
};
const SUCCESSFUL_CHECK_STATES = [
    'SUCCESS',
    'SKIPPED',
    'NEUTRAL'
];
const PENDING_CHECK_STATES = [
    'PENDING',
    'EXPECTED',
    'QUEUED',
    'IN_PROGRESS',
    'WAITING',
    'REQUESTED'
];
const FAILING_CHECK_STATES = [
    'FAILURE',
    'ERROR',
    'CANCELLED',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
    'STALE'
];

;// CONCATENATED MODULE: ./src/functions/outputs.ts

const MIN_APPROVALS_PATTERN = /^min_approvals=(0|[1-9][0-9]*)$/;
function parseEvaluationCriteria(evaluations) {
    return evaluations.map(evaluation => {
        if (evaluation === EVALUATION_CRITERIA.APPROVED) {
            return { kind: EVALUATION_CRITERIA.APPROVED, source: evaluation };
        }
        if (evaluation === EVALUATION_CRITERIA.CI_PASSING) {
            return { kind: EVALUATION_CRITERIA.CI_PASSING, source: evaluation };
        }
        if (evaluation === EVALUATION_CRITERIA.MERGEABLE) {
            return { kind: EVALUATION_CRITERIA.MERGEABLE, source: evaluation };
        }
        if (evaluation === EVALUATION_CRITERIA.NOT_DRAFT) {
            return { kind: EVALUATION_CRITERIA.NOT_DRAFT, source: evaluation };
        }
        const minimumMatch = MIN_APPROVALS_PATTERN.exec(evaluation);
        if (minimumMatch !== null) {
            return {
                kind: EVALUATION_CRITERIA.MIN_APPROVALS,
                minimum: Number(minimumMatch[1]),
                source: evaluation
            };
        }
        throw new Error(`Invalid evaluation criterion: ${evaluation}`);
    });
}
function evaluateCriterion(status, criterion) {
    if (criterion.kind === EVALUATION_CRITERIA.APPROVED) {
        return (status.review_decision === REVIEW_DECISION.APPROVED ||
            status.review_decision === null);
    }
    if (criterion.kind === EVALUATION_CRITERIA.CI_PASSING) {
        return status.commit_status === PR_STATUS.SUCCESS;
    }
    if (criterion.kind === EVALUATION_CRITERIA.MERGEABLE) {
        return status.mergeable_state === 'MERGEABLE';
    }
    if (criterion.kind === EVALUATION_CRITERIA.NOT_DRAFT) {
        return !status.is_draft;
    }
    return status.total_approvals >= criterion.minimum;
}
function outputs(status, data, dependencies) {
    const criteria = parseEvaluationCriteria(data.evaluations);
    const { core } = dependencies;
    core.debug('📊 Setting GitHub Actions outputs...');
    core.setOutput('head_sha', status.head_sha);
    core.setOutput('review_decision', status.review_decision);
    core.setOutput('total_approvals', status.total_approvals);
    core.setOutput('merge_state_status', status.merge_state_status);
    core.setOutput('commit_status', status.commit_status);
    core.setOutput('mergeable_state', status.mergeable_state);
    core.setOutput('is_draft', status.is_draft ? 'true' : 'false');
    const approved = evaluateCriterion(status, {
        kind: EVALUATION_CRITERIA.APPROVED,
        source: EVALUATION_CRITERIA.APPROVED
    });
    if (status.review_decision === null) {
        core.info('💡 PR has no approval requirements so it is technically considered approved');
    }
    core.setOutput('approved', approved ? 'true' : 'false');
    if (criteria.length === 0) {
        core.info('💡 No evaluation criteria provided');
    }
    else {
        core.info(`🔍 Evaluating ${criteria.length} criteria: ${data.evaluations.join(', ')}`);
    }
    let passed = true;
    for (const criterion of criteria) {
        if (!evaluateCriterion(status, criterion)) {
            core.warning(outputs_failureMessage(status, criterion));
            passed = false;
        }
    }
    core.setOutput('evaluation', passed ? EVALUATION_RESULT.PASS : EVALUATION_RESULT.FAIL);
    return passed;
}
function outputs_failureMessage(status, criterion) {
    if (criterion.kind === EVALUATION_CRITERIA.APPROVED) {
        return `⚠️ Evaluation '${criterion.source}' failed - PR is not approved`;
    }
    if (criterion.kind === EVALUATION_CRITERIA.CI_PASSING) {
        return `⚠️ Evaluation '${criterion.source}' failed - commit status is not successful`;
    }
    if (criterion.kind === EVALUATION_CRITERIA.MERGEABLE) {
        return `⚠️ Evaluation '${criterion.source}' failed - PR is not in a mergeable state`;
    }
    if (criterion.kind === EVALUATION_CRITERIA.NOT_DRAFT) {
        return `⚠️ Evaluation '${criterion.source}' failed - PR is in draft status`;
    }
    return `⚠️ Evaluation '${criterion.source}' failed - PR only has ${status.total_approvals} approvals, but requires at least ${criterion.minimum} approvals`;
}

;// CONCATENATED MODULE: ./src/functions/branch-deploy.ts
const ACTION_MODES = ['status', 'branch-deploy'];
const BRANCH_DEPLOY_TRANSITIONS = [
    'reset',
    'review',
    'noop',
    'deploy',
    'clear'
];
const OPERATION_RESULTS = [
    'success',
    'failure',
    'cancelled',
    'skipped'
];
function parseActionMode(value) {
    const normalized = value === '' ? 'status' : value;
    if (ACTION_MODES.includes(normalized)) {
        return normalized;
    }
    throw new Error("mode must be exactly 'status' or 'branch-deploy'");
}
function parseBranchDeployTransition(value) {
    if (BRANCH_DEPLOY_TRANSITIONS.includes(value)) {
        return value;
    }
    throw new Error("transition must be exactly 'reset', 'review', 'noop', 'deploy', or 'clear'");
}
function parseOperationResult(value, transition) {
    const command = transition === 'noop' || transition === 'deploy';
    if (!command && value === '') {
        return null;
    }
    if (OPERATION_RESULTS.includes(value)) {
        return value;
    }
    throw new Error(command
        ? 'operation_result is required for noop and deploy transitions'
        : "operation_result must be exactly 'success', 'failure', 'cancelled', or 'skipped'");
}
function parseBooleanInput(name, value) {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new Error(`${name} must be exactly 'true' or 'false'`);
}
function validateBranchDeployConfiguration(configuration) {
    const labels = Object.values(configuration.labels);
    if (labels.some(label => label.trim() === '')) {
        throw new Error('branch-deploy labels must not be empty');
    }
    if (new Set(labels.map(labelKey)).size !== labels.length) {
        throw new Error('branch-deploy labels must be distinct');
    }
    const headBoundTransition = configuration.transition === 'reset' ||
        configuration.transition === 'noop' ||
        configuration.transition === 'deploy';
    if (headBoundTransition && configuration.expectedHeadSha === '') {
        throw new Error('expected_head_sha is required for reset, noop, and deploy transitions');
    }
}
function determineBranchDeployState(data) {
    const { configuration, pullRequest, evaluationPassed, currentLabels } = data;
    const currentState = currentBranchDeployState(currentLabels, configuration.labels);
    let headMatches = null;
    let state;
    if (pullRequest.state === 'CLOSED' ||
        pullRequest.state === 'MERGED' ||
        (pullRequest.isDraft && configuration.clearOnDraft)) {
        state = 'cleared';
    }
    else if (configuration.transition === 'reset') {
        headMatches = pullRequest.headSha === configuration.expectedHeadSha;
        state = headMatches ? 'noop' : (currentState ?? 'noop');
    }
    else if (configuration.transition === 'clear') {
        state = currentState ?? 'noop';
    }
    else if (configuration.transition === 'noop' ||
        configuration.transition === 'deploy') {
        headMatches = pullRequest.headSha === configuration.expectedHeadSha;
        if (!headMatches) {
            state = 'noop';
        }
        else if (configuration.operationResult !== 'success') {
            state =
                configuration.transition === 'noop' ? 'noop' : 'deploy';
        }
        else if (configuration.transition === 'noop') {
            state = evaluationPassed ? 'deploy' : 'review';
        }
        else {
            state = 'merge';
        }
    }
    else if (currentState === null || currentState === 'noop') {
        state = 'noop';
    }
    else if (evaluationPassed) {
        state = currentState === 'merge' ? 'merge' : 'deploy';
    }
    else if (currentState === 'merge' &&
        !configuration.demoteMergeOnReviewFailure) {
        state = 'merge';
    }
    else {
        state = 'review';
    }
    return {
        state,
        headMatches,
        ...exactLabelActions(currentLabels, configuration.labels, state)
    };
}
function currentBranchDeployState(currentLabels, labels) {
    const current = new Set(currentLabels.map(labelKey));
    if (current.has(labelKey(labels.noop))) {
        return 'noop';
    }
    if (current.has(labelKey(labels.review))) {
        return 'review';
    }
    if (current.has(labelKey(labels.deploy))) {
        return 'deploy';
    }
    if (current.has(labelKey(labels.merge))) {
        return 'merge';
    }
    return null;
}
function exactLabelActions(currentLabels, labels, state) {
    const managed = [
        labels.noop,
        labels.review,
        labels.deploy,
        labels.merge
    ];
    const desired = state === 'cleared'
        ? null
        : state === 'noop'
            ? labels.noop
            : state === 'review'
                ? labels.review
                : state === 'deploy'
                    ? labels.deploy
                    : labels.merge;
    const current = new Set(currentLabels.map(labelKey));
    const currentNames = new Map(currentLabels.map(label => [labelKey(label), label]));
    const desiredKey = desired === null ? null : labelKey(desired);
    return {
        labelsToAdd: desired !== null && !current.has(labelKey(desired)) ? [desired] : [],
        labelsToRemove: managed
            .filter(label => current.has(labelKey(label)) && labelKey(label) !== desiredKey)
            .map(label => currentNames.get(labelKey(label)))
    };
}
function labelKey(label) {
    return label.trim().toLowerCase();
}

;// CONCATENATED MODULE: ./src/functions/status.ts

function parsePullRequestNumber(value) {
    if ((typeof value !== 'string' && typeof value !== 'number') ||
        (typeof value === 'string' && value.trim() === '')) {
        throw new Error('pr_number must be a positive safe integer');
    }
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error('pr_number must be a positive safe integer');
    }
    return number;
}
function parseCheckSelection(value) {
    if (value === CHECK_TYPES.ALL || value === CHECK_TYPES.REQUIRED) {
        return value;
    }
    throw new Error("checks must be exactly 'all' or 'required'");
}
function normalizeCheckStatus(check) {
    if (check.__typename === 'StatusContext') {
        return normalizeRawCheckState(check.state);
    }
    const completed = check.status === 'COMPLETED';
    const hasConclusion = check.conclusion !== null;
    if (completed !== hasConclusion) {
        return PR_STATUS.UNKNOWN;
    }
    const normalized = normalizeRawCheckState(hasConclusion ? check.conclusion : check.status);
    if ((completed && normalized === PR_STATUS.PENDING) ||
        (!completed &&
            (normalized === PR_STATUS.SUCCESS || normalized === PR_STATUS.FAILURE))) {
        return PR_STATUS.UNKNOWN;
    }
    return normalized;
}
function aggregateCheckStatuses(statuses) {
    if (statuses.includes(PR_STATUS.FAILURE)) {
        return PR_STATUS.FAILURE;
    }
    if (statuses.includes(PR_STATUS.UNKNOWN)) {
        return PR_STATUS.UNKNOWN;
    }
    if (statuses.includes(PR_STATUS.PENDING)) {
        return PR_STATUS.PENDING;
    }
    if (statuses.length > 0) {
        return PR_STATUS.SUCCESS;
    }
    return PR_STATUS.UNKNOWN;
}
function countUniqueApprovals(reviews) {
    const approvedActors = new Set();
    for (const review of reviews) {
        const actor = review.author;
        if (review.state === 'APPROVED' &&
            actor !== null &&
            actor.__typename !== 'Bot' &&
            actor.login !== '') {
            approvedActors.add(actor.login);
        }
    }
    return approvedActors.size;
}
function determineCommitStatus(checks, checkSelection, excludeChecks, currentCheckName) {
    const exclusions = new Set(normalizeConfiguredNames(excludeChecks));
    if (currentCheckName !== undefined && currentCheckName.trim() !== '') {
        exclusions.add(currentCheckName.trim());
    }
    const selectedChecks = checks.filter(check => {
        if (checkSelection === CHECK_TYPES.REQUIRED && !check.isRequired) {
            return false;
        }
        return !exclusions.has(getCheckName(check));
    });
    return aggregateCheckStatuses(selectedChecks.map(normalizeCheckStatus));
}
async function status_status(client, context, pullRequestNumber, data, dependencies) {
    const number = parsePullRequestNumber(pullRequestNumber);
    const checkSelection = parseCheckSelection(data.checks);
    const { core } = dependencies;
    const exclusions = normalizeConfiguredNames(data.excludeChecks ?? []);
    core.info('🔍 Fetching pull request status information...');
    if (data.currentCheckName !== undefined &&
        data.currentCheckName.trim() !== '') {
        exclusions.push(data.currentCheckName.trim());
    }
    core.info(`🚫 Checks to exclude from status evaluation: ${normalizeConfiguredNames(exclusions).join(', ')}`);
    const pullRequest = await client.getPullRequestStatus({
        owner: context.repo.owner,
        repo: context.repo.repo,
        number
    });
    const commitStatus = determineCommitStatus(pullRequest.checks, checkSelection, data.excludeChecks ?? [], data.currentCheckName);
    const result = {
        pull_request_state: pullRequest.state,
        head_sha: pullRequest.headRefOid,
        review_decision: pullRequest.reviewDecision,
        total_approvals: countUniqueApprovals(pullRequest.latestReviews),
        merge_state_status: pullRequest.mergeStateStatus,
        mergeable_state: pullRequest.mergeable,
        is_draft: pullRequest.isDraft,
        commit_status: commitStatus
    };
    core.info(`📊 Merge State Status: ${result.merge_state_status}`);
    core.info(`📊 Pull Request State: ${result.pull_request_state}`);
    core.info(`📊 Head SHA: ${result.head_sha}`);
    core.info(`📊 Mergeable State: ${result.mergeable_state}`);
    core.info(`📊 Is Draft: ${result.is_draft}`);
    core.info(`📊 Commit Status: ${result.commit_status}`);
    core.debug(`📊 Status result: ${JSON.stringify(result)}`);
    return result;
}
function normalizeRawCheckState(state) {
    if (state !== null && SUCCESSFUL_CHECK_STATES.includes(state)) {
        return PR_STATUS.SUCCESS;
    }
    if (state !== null && FAILING_CHECK_STATES.includes(state)) {
        return PR_STATUS.FAILURE;
    }
    if (state !== null && PENDING_CHECK_STATES.includes(state)) {
        return PR_STATUS.PENDING;
    }
    return PR_STATUS.UNKNOWN;
}
function getCheckName(check) {
    return check.__typename === 'CheckRun' ? check.name : check.context;
}
function normalizeConfiguredNames(names) {
    const result = [];
    const seen = new Set();
    for (const name of names) {
        const trimmed = name.trim();
        if (trimmed !== '' && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    }
    return result;
}

;// CONCATENATED MODULE: ./src/functions/string-to-array.ts
/**
 * Parse a comma-separated action input and trim non-empty values.
 */
function stringToArray(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return [];
    }
    const values = [];
    for (const item of value.split(',')) {
        const trimmed = item.trim();
        if (trimmed !== '') {
            values.push(trimmed);
        }
    }
    return values;
}

;// CONCATENATED MODULE: external "node:timers/promises"
const promises_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:timers/promises");
;// CONCATENATED MODULE: ./src/version.ts
// The version of the this Action
// Acceptable version formats:
// - v1.0.0
// - v4.5.1
// - v10.123.44
// - v1.1.1-rc.1
// - etc
const VERSION = 'v3.0.0';

;// CONCATENATED MODULE: ./src/github.ts


const REST_API_URL = 'https://api.github.com';
const GRAPHQL_API_URL = 'https://api.github.com/graphql';
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const MAX_ATTEMPTS = 3;
const MAX_PAGES = 100;
const MAX_NODES = 10_000;
const MAX_RETRY_AFTER_MILLISECONDS = 10_000;
const MAX_ERROR_EXCERPT_LENGTH = 4 * 1024;
const RETRY_DELAYS_MILLISECONDS = [500, 1_000];
const PULL_REQUEST_STATUS_QUERY = `query(
  $owner: String!
  $repo: String!
  $number: Int!
  $checksCursor: String
  $reviewsCursor: String
  $includeChecks: Boolean!
  $includeReviews: Boolean!
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      state
      headRefOid
      reviewDecision
      mergeStateStatus
      mergeable
      isDraft
      commits(last: 1) @include(if: $includeChecks) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100, after: $checksCursor) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    isRequired(pullRequestNumber: $number)
                    conclusion
                    status
                  }
                  ... on StatusContext {
                    context
                    isRequired(pullRequestNumber: $number)
                    state
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      }
      latestReviews(first: 100, after: $reviewsCursor) @include(if: $includeReviews) {
        nodes {
          state
          author {
            __typename
            login
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}`;
function github_isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireRecord(value, path) {
    if (!github_isRecord(value)) {
        throw new Error(`Malformed GitHub response: ${path} must be an object`);
    }
    return value;
}
function requireArray(value, path) {
    if (!Array.isArray(value)) {
        throw new Error(`Malformed GitHub response: ${path} must be an array`);
    }
    return value;
}
function requireString(value, path) {
    if (typeof value !== 'string') {
        throw new Error(`Malformed GitHub response: ${path} must be a string`);
    }
    return value;
}
function requireNullableString(value, path) {
    if (value !== null && typeof value !== 'string') {
        throw new Error(`Malformed GitHub response: ${path} must be a string or null`);
    }
    return value;
}
function requireBoolean(value, path) {
    if (typeof value !== 'boolean') {
        throw new Error(`Malformed GitHub response: ${path} must be a boolean`);
    }
    return value;
}
function requirePullRequestState(value, path) {
    if (value === 'OPEN' || value === 'CLOSED' || value === 'MERGED') {
        return value;
    }
    throw new Error(`Malformed GitHub response: ${path} must be OPEN, CLOSED, or MERGED`);
}
function sanitizeExcerpt(value, token) {
    const withoutToken = value.split(token).join('[REDACTED]');
    return withoutToken
        .replace(/Bearer\s+[^\s"',}]+/giu, 'Bearer [REDACTED]')
        .slice(0, MAX_ERROR_EXCERPT_LENGTH);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function parseJson(body, description, token) {
    try {
        return JSON.parse(body);
    }
    catch {
        throw new Error(`Invalid JSON from GitHub ${description}: ${sanitizeExcerpt(body, token)}`);
    }
}
function validateEndpoints(environment) {
    const apiUrl = environment.GITHUB_API_URL ?? REST_API_URL;
    const graphqlUrl = environment.GITHUB_GRAPHQL_URL ?? GRAPHQL_API_URL;
    if (apiUrl !== REST_API_URL) {
        throw new Error(`Unsupported GitHub API URL: expected ${REST_API_URL}; GitHub Enterprise Server is not supported`);
    }
    if (graphqlUrl !== GRAPHQL_API_URL) {
        throw new Error(`Unsupported GitHub GraphQL URL: expected ${GRAPHQL_API_URL}; GitHub Enterprise Server is not supported`);
    }
}
function parseRetryAfter(value) {
    if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(value)) {
        throw new Error('GitHub returned an invalid Retry-After value');
    }
    const milliseconds = Number(value) * 1_000;
    if (milliseconds > MAX_RETRY_AFTER_MILLISECONDS) {
        throw new Error('GitHub requested a Retry-After delay longer than 10 seconds');
    }
    return milliseconds;
}
function retryDelay(response, attempt) {
    const retryAfter = response.headers.get('retry-after');
    if (response.status === 403 && retryAfter === null) {
        return null;
    }
    if (retryAfter !== null) {
        return parseRetryAfter(retryAfter);
    }
    return RETRY_DELAYS_MILLISECONDS[attempt - 1];
}
function isRetryableStatus(status) {
    return (status === 403 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504);
}
function requestError(method, url, status, body, token) {
    const excerpt = sanitizeExcerpt(body, token);
    const suffix = excerpt.length > 0 ? `: ${excerpt}` : '';
    return new Error(`GitHub API request failed: ${method} ${url} returned HTTP ${status}${suffix}`);
}
function parsePageInfo(value, path) {
    const pageInfo = requireRecord(value, path);
    return {
        hasNextPage: requireBoolean(pageInfo.hasNextPage, `${path}.hasNextPage`),
        endCursor: requireNullableString(pageInfo.endCursor, `${path}.endCursor`)
    };
}
function parseCheck(value, index) {
    const path = `data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[${index}]`;
    const check = requireRecord(value, path);
    const typename = requireString(check.__typename, `${path}.__typename`);
    const isRequired = requireBoolean(check.isRequired, `${path}.isRequired`);
    if (typename === 'CheckRun') {
        return {
            __typename: typename,
            name: requireString(check.name, `${path}.name`),
            isRequired,
            conclusion: requireNullableString(check.conclusion, `${path}.conclusion`),
            status: requireNullableString(check.status, `${path}.status`)
        };
    }
    if (typename === 'StatusContext') {
        return {
            __typename: typename,
            context: requireString(check.context, `${path}.context`),
            isRequired,
            state: requireNullableString(check.state, `${path}.state`)
        };
    }
    throw new Error(`Malformed GitHub response: ${path} has an unsupported __typename`);
}
function parseReview(value, index) {
    const path = `data.repository.pullRequest.latestReviews.nodes[${index}]`;
    const review = requireRecord(value, path);
    let author = null;
    if (review.author !== null) {
        const authorRecord = requireRecord(review.author, `${path}.author`);
        author = {
            __typename: requireString(authorRecord.__typename, `${path}.author.__typename`),
            login: requireString(authorRecord.login, `${path}.author.login`)
        };
    }
    return {
        state: requireString(review.state, `${path}.state`),
        author
    };
}
function emptyConnection() {
    return {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null }
    };
}
function parseChecks(pullRequest) {
    const commits = requireRecord(pullRequest.commits, 'data.repository.pullRequest.commits');
    const nodes = requireArray(commits.nodes, 'data.repository.pullRequest.commits.nodes');
    if (nodes.length !== 1) {
        throw new Error('Malformed GitHub response: pull request must contain one latest commit');
    }
    const commitNode = requireRecord(nodes[0], 'data.repository.pullRequest.commits.nodes[0]');
    const commit = requireRecord(commitNode.commit, 'data.repository.pullRequest.commits.nodes[0].commit');
    if (commit.statusCheckRollup === null) {
        return emptyConnection();
    }
    const rollup = requireRecord(commit.statusCheckRollup, 'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup');
    const contexts = requireRecord(rollup.contexts, 'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts');
    const checks = requireArray(contexts.nodes, 'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes');
    return {
        nodes: checks.map(parseCheck),
        pageInfo: parsePageInfo(contexts.pageInfo, 'data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo')
    };
}
function parseReviews(pullRequest) {
    const latestReviews = requireRecord(pullRequest.latestReviews, 'data.repository.pullRequest.latestReviews');
    const reviews = requireArray(latestReviews.nodes, 'data.repository.pullRequest.latestReviews.nodes');
    return {
        nodes: reviews.map(parseReview),
        pageInfo: parsePageInfo(latestReviews.pageInfo, 'data.repository.pullRequest.latestReviews.pageInfo')
    };
}
function parsePullRequestPage(value, includeChecks, includeReviews, token) {
    const body = requireRecord(value, 'response');
    if ('errors' in body) {
        const errors = requireArray(body.errors, 'errors');
        if (errors.length > 0) {
            throw new Error(`GitHub GraphQL request failed: ${sanitizeExcerpt(JSON.stringify(errors), token)}`);
        }
    }
    const data = requireRecord(body.data, 'data');
    const repository = requireRecord(data.repository, 'data.repository');
    const pullRequest = requireRecord(repository.pullRequest, 'data.repository.pullRequest');
    return {
        metadata: {
            state: requirePullRequestState(pullRequest.state, 'data.repository.pullRequest.state'),
            headRefOid: requireString(pullRequest.headRefOid, 'data.repository.pullRequest.headRefOid'),
            reviewDecision: requireNullableString(pullRequest.reviewDecision, 'data.repository.pullRequest.reviewDecision'),
            mergeStateStatus: requireString(pullRequest.mergeStateStatus, 'data.repository.pullRequest.mergeStateStatus'),
            mergeable: requireString(pullRequest.mergeable, 'data.repository.pullRequest.mergeable'),
            isDraft: requireBoolean(pullRequest.isDraft, 'data.repository.pullRequest.isDraft')
        },
        checks: includeChecks ? parseChecks(pullRequest) : null,
        reviews: includeReviews ? parseReviews(pullRequest) : null
    };
}
function parseLabelNames(value, path) {
    const labels = requireArray(value, path);
    return labels.map((value, index) => {
        const label = requireRecord(value, `${path}[${index}]`);
        return requireString(label.name, `${path}[${index}].name`);
    });
}
function createPaginationState() {
    return {
        active: true,
        cursor: null,
        nodes: 0,
        pages: 0,
        seenCursors: new Set()
    };
}
function recordConnectionPage(state, connection, description, destination) {
    state.pages += 1;
    state.nodes += connection.nodes.length;
    if (state.nodes > MAX_NODES) {
        throw new Error(`GitHub ${description} pagination exceeded 10,000 nodes`);
    }
    destination.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) {
        state.active = false;
        return;
    }
    if (state.pages >= MAX_PAGES) {
        throw new Error(`GitHub ${description} pagination exceeded 100 pages`);
    }
    const cursor = connection.pageInfo.endCursor;
    if (cursor === null) {
        throw new Error(`GitHub ${description} pagination returned no next cursor`);
    }
    if (state.seenCursors.has(cursor)) {
        throw new Error(`GitHub ${description} pagination repeated a cursor`);
    }
    state.seenCursors.add(cursor);
    state.cursor = cursor;
}
function nextLink(value) {
    if (value === null) {
        return null;
    }
    for (const part of value.split(',')) {
        const match = /^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/u.exec(part);
        if (match !== null && match[2] === 'next') {
            return match[1];
        }
    }
    return null;
}
function requireGitHubRestUrl(value, expectedPath) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('GitHub pagination returned an invalid URL');
    }
    if (url.origin !== REST_API_URL ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== expectedPath) {
        throw new Error('GitHub pagination returned an unsupported API URL');
    }
    const page = url.searchParams.get('page');
    if (page === null || !/^[1-9][0-9]*$/u.test(page)) {
        throw new Error('GitHub pagination returned an invalid page number');
    }
    return { url: url.toString(), page };
}
function validateRequest(request) {
    if (request.owner.length === 0 || request.repo.length === 0) {
        throw new Error('GitHub repository owner and name must not be empty');
    }
    if (!Number.isSafeInteger(request.number) || request.number <= 0) {
        throw new Error('GitHub pull request number must be a positive safe integer');
    }
}
/**
 * Create the narrowly scoped GitHub.com client used by this action.
 */
function createGitHubClient(token, options = {}) {
    if (token.length === 0) {
        throw new Error('GitHub token must not be empty');
    }
    const environment = options.environment ?? process.env;
    validateEndpoints(environment);
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    const sleep = options.sleep ?? promises_namespaceObject.setTimeout;
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': `grantbirki/pr-status@${VERSION}`,
        'X-GitHub-Api-Version': '2022-11-28'
    };
    async function request(method, url, body, acceptNotFound = false) {
        async function attemptRequest(attempt) {
            let response;
            let responseBody;
            try {
                const init = {
                    method,
                    headers,
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)
                };
                if (body !== undefined) {
                    init.body = body;
                }
                response = await fetchImplementation(url, init);
                responseBody = await response.text();
            }
            catch (error) {
                if (attempt < MAX_ATTEMPTS) {
                    await sleep(RETRY_DELAYS_MILLISECONDS[attempt - 1]);
                    return attemptRequest(attempt + 1);
                }
                throw new Error(`GitHub API network request failed after ${MAX_ATTEMPTS} attempts: ${sanitizeExcerpt(errorMessage(error), token)}`);
            }
            if (response.ok || (acceptNotFound && response.status === 404)) {
                return {
                    status: response.status,
                    body: responseBody,
                    headers: response.headers
                };
            }
            if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
                const delay = retryDelay(response, attempt);
                if (delay !== null) {
                    await sleep(delay);
                    return attemptRequest(attempt + 1);
                }
            }
            throw requestError(method, url, response.status, responseBody, token);
        }
        return attemptRequest(1);
    }
    async function getPullRequestStatus(pullRequestRequest) {
        validateRequest(pullRequestRequest);
        const checksState = createPaginationState();
        const reviewsState = createPaginationState();
        const checks = [];
        const latestReviews = [];
        let metadata;
        do {
            const response = await request('POST', GRAPHQL_API_URL, JSON.stringify({
                query: PULL_REQUEST_STATUS_QUERY,
                variables: {
                    owner: pullRequestRequest.owner,
                    repo: pullRequestRequest.repo,
                    number: pullRequestRequest.number,
                    checksCursor: checksState.cursor,
                    reviewsCursor: reviewsState.cursor,
                    includeChecks: checksState.active,
                    includeReviews: reviewsState.active
                }
            }));
            const parsedJson = parseJson(response.body, 'GraphQL response', token);
            const page = parsePullRequestPage(parsedJson, checksState.active, reviewsState.active, token);
            metadata = page.metadata;
            if (page.checks !== null) {
                recordConnectionPage(checksState, page.checks, 'checks', checks);
            }
            if (page.reviews !== null) {
                recordConnectionPage(reviewsState, page.reviews, 'reviews', latestReviews);
            }
        } while (checksState.active || reviewsState.active);
        return { ...metadata, checks, latestReviews };
    }
    async function listIssueLabels(pullRequestRequest) {
        validateRequest(pullRequestRequest);
        const path = `/repos/${encodeURIComponent(pullRequestRequest.owner)}/${encodeURIComponent(pullRequestRequest.repo)}/issues/${pullRequestRequest.number}/labels`;
        let url = `${REST_API_URL}${path}?per_page=100&page=1`;
        const seenPages = new Set(['1']);
        const labels = [];
        let pages = 0;
        while (true) {
            pages += 1;
            const response = await request('GET', url);
            const parsedJson = parseJson(response.body, 'labels response', token);
            labels.push(...parseLabelNames(parsedJson, 'labels'));
            if (labels.length > MAX_NODES) {
                throw new Error('GitHub labels pagination exceeded 10,000 nodes');
            }
            const link = nextLink(response.headers.get('link'));
            if (link === null) {
                return labels;
            }
            if (pages >= MAX_PAGES) {
                throw new Error('GitHub labels pagination exceeded 100 pages');
            }
            const validatedLink = requireGitHubRestUrl(link, path);
            if (seenPages.has(validatedLink.page)) {
                throw new Error('GitHub labels pagination repeated a page');
            }
            seenPages.add(validatedLink.page);
            url = validatedLink.url;
        }
    }
    async function removeLabel(labelRequest) {
        validateRequest(labelRequest);
        const url = `${REST_API_URL}/repos/${encodeURIComponent(labelRequest.owner)}/${encodeURIComponent(labelRequest.repo)}/issues/${labelRequest.number}/labels/${encodeURIComponent(labelRequest.name)}`;
        const response = await request('DELETE', url, undefined, true);
        if (response.status !== 404) {
            const parsedJson = parseJson(response.body, 'label removal response', token);
            parseLabelNames(parsedJson, 'labels');
        }
    }
    async function addLabels(labelRequest) {
        validateRequest(labelRequest);
        const url = `${REST_API_URL}/repos/${encodeURIComponent(labelRequest.owner)}/${encodeURIComponent(labelRequest.repo)}/issues/${labelRequest.number}/labels`;
        const response = await request('POST', url, JSON.stringify({ labels: labelRequest.labels }));
        const parsedJson = parseJson(response.body, 'label addition response', token);
        parseLabelNames(parsedJson, 'labels');
    }
    return { getPullRequestStatus, listIssueLabels, removeLabel, addLabels };
}

;// CONCATENATED MODULE: ./src/main.ts









const defaultDependencies = {
    core: src_actions,
    loadContext: loadActionContext,
    createClient: createGitHubClient,
    status: status_status,
    outputs: outputs,
    stringToArray: stringToArray,
    determineLabelActions: determineLabelActions,
    determineBranchDeployState: determineBranchDeployState,
    label: label
};
function parseInputs(dependencies, context) {
    const { core, stringToArray } = dependencies;
    const mode = parseActionMode(core.getInput('mode'));
    const token = core.getInput('github_token', { required: true });
    const currentCheckName = core.getInput('workflow') || context.job;
    const checks = parseCheckSelection(core.getInput('checks', { required: true }));
    const evaluations = stringToArray(core.getInput('evaluations'));
    const passLabels = stringToArray(core.getInput('pass_labels'));
    const passLabelsCleanup = stringToArray(core.getInput('pass_labels_cleanup'));
    const failLabels = stringToArray(core.getInput('fail_labels'));
    const excludeChecks = stringToArray(core.getInput('exclude_checks'));
    const inputPullRequestNumber = core.getInput('pr_number');
    const prNumber = parsePullRequestNumber(inputPullRequestNumber === ''
        ? context.issueNumber
        : inputPullRequestNumber);
    let branchDeploy = null;
    parseEvaluationCriteria(evaluations);
    if (mode === 'branch-deploy') {
        if (passLabels.length > 0 ||
            passLabelsCleanup.length > 0 ||
            failLabels.length > 0) {
            throw new Error('branch-deploy mode cannot be combined with pass_labels, pass_labels_cleanup, or fail_labels');
        }
        const transition = parseBranchDeployTransition(core.getInput('transition'));
        branchDeploy = {
            transition,
            expectedHeadSha: core.getInput('expected_head_sha'),
            operationResult: parseOperationResult(core.getInput('operation_result'), transition),
            labels: {
                noop: core.getInput('noop_label'),
                review: core.getInput('review_label'),
                deploy: core.getInput('deploy_label'),
                merge: core.getInput('merge_label')
            },
            clearOnDraft: parseBooleanInput('clear_on_draft', core.getInput('clear_on_draft')),
            demoteMergeOnReviewFailure: parseBooleanInput('demote_merge_on_review_failure', core.getInput('demote_merge_on_review_failure')),
            dryRun: parseBooleanInput('dry_run', core.getInput('dry_run'))
        };
        validateBranchDeployConfiguration(branchDeploy);
    }
    core.debug('📋 Parsed and validated inputs successfully');
    return {
        mode,
        token,
        currentCheckName,
        checks,
        evaluations,
        passLabels,
        passLabelsCleanup,
        failLabels,
        excludeChecks,
        prNumber,
        branchDeploy
    };
}
function logLabelActions(labelsToAdd, labelsToRemove, core) {
    if (labelsToAdd.length > 0) {
        core.info(`🏷️ Labels to add: ${labelsToAdd.join(', ')}`);
    }
    if (labelsToRemove.length > 0) {
        core.info(`🏷️ Labels to remove: ${labelsToRemove.join(', ')}`);
    }
    if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
        core.info('🏷️ No label changes needed');
    }
}
function safeErrorMessage(error, token) {
    const rawMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : 'Unknown error';
    const withoutAuthorization = rawMessage.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]');
    if (token === undefined || token === '') {
        return withoutAuthorization;
    }
    return withoutAuthorization.split(token).join('[REDACTED]');
}
async function run(dependencies = defaultDependencies) {
    const { core } = dependencies;
    let token;
    try {
        core.info('🚀 PR Status Action starting');
        const context = dependencies.loadContext();
        const inputs = parseInputs(dependencies, context);
        token = inputs.token;
        core.info(`🔍 Evaluating PR #${inputs.prNumber}`);
        const client = dependencies.createClient(inputs.token);
        const statusResult = await dependencies.status(client, context, inputs.prNumber, {
            checks: inputs.checks,
            excludeChecks: inputs.excludeChecks,
            currentCheckName: inputs.currentCheckName
        }, { core });
        const passed = dependencies.outputs(statusResult, { evaluations: inputs.evaluations }, { core });
        core.info(`📊 Evaluation result: ${passed ? 'PASS ✅' : 'FAIL ❌'}`);
        let labelActions;
        let currentLabels;
        if (inputs.mode === 'branch-deploy') {
            const branchDeploy = inputs.branchDeploy;
            currentLabels = await client.listIssueLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                number: inputs.prNumber
            });
            const decision = dependencies.determineBranchDeployState({
                configuration: branchDeploy,
                pullRequest: {
                    state: statusResult.pull_request_state,
                    headSha: statusResult.head_sha,
                    isDraft: statusResult.is_draft
                },
                evaluationPassed: passed,
                currentLabels
            });
            core.setOutput('branch_deploy_state', decision.state);
            core.setOutput('head_matches', decision.headMatches === null
                ? ''
                : decision.headMatches
                    ? 'true'
                    : 'false');
            core.info(`🚦 Branch-deploy state: ${decision.state}`);
            labelActions = decision;
        }
        else {
            labelActions = dependencies.determineLabelActions(passed, inputs.passLabels, inputs.failLabels, inputs.passLabelsCleanup);
        }
        logLabelActions(labelActions.labelsToAdd, labelActions.labelsToRemove, core);
        if (inputs.branchDeploy?.dryRun === true) {
            core.info('🏷️ Dry run enabled; branch-deploy labels were not changed');
        }
        else {
            await dependencies.label(inputs.prNumber, context, client, labelActions.labelsToAdd, labelActions.labelsToRemove, currentLabels === undefined ? { core } : { core, currentLabels });
        }
        core.info('✅ PR Status Action completed successfully');
        return 'success';
    }
    catch (error) {
        core.setFailed(`PR Status Action failed: ${safeErrorMessage(error, token)}`);
        return 'failure';
    }
}

;// CONCATENATED MODULE: ./src/index.ts

function startEntrypoint(runAction = run) {
    void runAction();
}
startEntrypoint();

var __webpack_exports__startEntrypoint = __webpack_exports__.D;
export { __webpack_exports__startEntrypoint as startEntrypoint };

//# sourceMappingURL=index.js.map