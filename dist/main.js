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
exports.determineLabelActions = determineLabelActions;
exports.run = run;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const version_1 = require("./version");
const github_1 = require("@actions/github");
const plugin_retry_1 = require("@octokit/plugin-retry");
const colors_1 = require("./functions/colors");
const status_1 = require("./functions/status");
const outputs_1 = require("./functions/outputs");
const string_to_array_1 = require("./functions/string-to-array");
const label_1 = require("./functions/label");
function determineLabelActions(pass, passLabels, failLabels, passLabelsCleanup) {
    if (pass) {
        return {
            labelsToAdd: passLabels,
            labelsToRemove: failLabels.concat(passLabelsCleanup)
        };
    }
    else {
        return {
            labelsToAdd: failLabels,
            labelsToRemove: passLabels
        };
    }
}
async function run() {
    try {
        core.info(`${colors_1.COLORS.highlight}approve workflow is starting${colors_1.COLORS.reset}`);
        core.debug(`context: ${JSON.stringify(github_1.context, null, 2)}`);
        const token = core.getInput('github_token', { required: true });
        const workflow = core.getInput('workflow', { required: false }) || github_1.context.workflow;
        const checks = core.getInput('checks', { required: true });
        const evaluations = (0, string_to_array_1.stringToArray)(core.getInput('evaluations', { required: true }));
        const passLabels = (0, string_to_array_1.stringToArray)(core.getInput('pass_labels', { required: false }));
        const passLabelsCleanup = (0, string_to_array_1.stringToArray)(core.getInput('pass_labels_cleanup', { required: false }));
        const failLabels = (0, string_to_array_1.stringToArray)(core.getInput('fail_labels', { required: false }));
        const excludeChecks = (0, string_to_array_1.stringToArray)(core.getInput('exclude_checks', { required: false }));
        const prNumberInput = core.getInput('pr_number', { required: false });
        const prNumber = parseInt(prNumberInput ||
            String(github_1.context.issue.number) ||
            String(github_1.context.payload.pull_request?.number || 0));
        if (!prNumber || prNumber === 0) {
            throw new Error('pull request number not found in context or inputs, exiting');
        }
        const octokit = github.getOctokit(token, {
            userAgent: `grantbirki/pr-status@${version_1.VERSION}`,
            additionalPlugins: [plugin_retry_1.retry]
        });
        const data = {
            checks: checks,
            prNumber: prNumber,
            evaluations: evaluations,
            excludeChecks: excludeChecks,
            workflow: workflow
        };
        core.info(`🏃 running status checks on pull request ${colors_1.COLORS.highlight}${prNumber}${colors_1.COLORS.reset}`);
        const statusResult = await (0, status_1.status)(octokit, github_1.context, prNumber, data);
        const pass = (0, outputs_1.outputs)(statusResult, data);
        core.info(`pass: ${pass}`);
        const { labelsToAdd, labelsToRemove } = determineLabelActions(pass, passLabels, failLabels, passLabelsCleanup);
        core.info(`labelsToAdd: ${labelsToAdd}`);
        core.info(`labelsToAdd isArray: ${Array.isArray(labelsToAdd)}`);
        core.info(`labelsToRemove isArray: ${Array.isArray(labelsToRemove)}`);
        core.info(`labelsToRemove: ${labelsToRemove}`);
        await (0, label_1.label)(prNumber, github_1.context, octokit, labelsToAdd, labelsToRemove);
        return 'success';
    }
    catch (error) {
        core.error(error.stack || error.message);
        core.setFailed(error.message);
        return 'failure';
    }
}
if (process.env['CI'] === 'true' && process.env['JEST_TEST'] !== 'true') {
    run();
}
